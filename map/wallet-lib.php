<?php
// 머니스쿱 지갑 원장. HTTP 를 모른다 — 그래야 웹서버 없이 tests/wallet.test.php 로 돌릴 수 있다.
// 진실은 ledger 이고 accounts.balance 는 캐시다(SPEC-economy §1).
//
// ⚠ cafe24 의 SQLite 는 3.26.0(2018)이다. UPSERT(3.24+)는 되지만 RETURNING(3.35+)과
// STRICT 테이블(3.37+)은 못 쓴다 — 삽입 후 값을 돌려받는 패턴을 쓰지 말 것.

define("W_SEED", 5);
define("W_CAP", 20);
define("W_CHECKIN", 1);
define("W_CHEST", 5);
define("W_CHEST_EVERY", 7);
// ⚠️ 개발용 임시값(2026-08-13, 원래 3) — 배포 검증·E2E 테스트가 사무실 IP 의 하루 쿼터를
// 다 써서 파트너 실기기가 429 로 막혔다. 실기기 확인이 끝나는 대로 반드시 3 으로 되돌릴 것 —
// 20 에서는 재설치 남용 방어가 사실상 꺼진다(진짜 방어는 8c 구글 로그인). 되돌리기 전
// tests/wallet-concurrency.sh check1 이 cap 값에서 레이서 수·기대 429 를 스스로 유도하므로
// 그대로 다시 돌리면 된다(수정 불필요).
define("W_IP_DAILY", 20);         // IP 해시당 하루 신규 계정 지급 상한(재설치 남용 완화)
define("W_RUN_TTL_SEC", 86400);   // Full 권리 24시간
define("W_NONCE_TTL_SEC", 600);   // 10분. 사용자가 브라우저에서 로그인을 마칠 시간

// 서버가 정본이다. 클라이언트의 MSWallet.COSTS 는 미리보기 표시용일 뿐이다.
function w_costs() { return array("full" => 3, "custom" => 5, "slot" => 1, "scan" => 2); }
// 종목별 권리를 갖는 등급. scan·slot 은 단순 차감이라 여기 없다.
function w_entitled_types() { return array("full", "custom"); }

function w_now() { return gmdate("c"); }
function w_today() { return gmdate("Y-m-d"); }
function w_day_add($ymd, $n) { return gmdate("Y-m-d", strtotime($ymd . " UTC") + $n * 86400); }

function w_db($dir) {
  // mkdir 은 "이미 있어서 실패"와 "정말 못 만들어서 실패"를 구분하지 않는다 — 첫 부팅에
  // 여러 프로세스가 동시에 !is_dir 을 통과하면 하나만 mkdir 에 성공하고 나머지는 EEXIST 로
  // 실패한다. 그 실패만 보고 던지면, 디렉토리는 이미 있는데(승자가 막 만들었다) 나머지
  // 전부가 "못 만든다"며 죽는다(리뷰 라운드 2 에서 이 클래스의 첫 부팅 폭주를 잡다가
  // 실측 — 12-way 에서 6~10개가 이 경로로 죽었다). mkdir 실패 뒤에 is_dir 을 한 번 더 봐서,
  // 그 사이 누가 이미 만들어 놨으면(진짜 실패가 아니면) 그냥 넘어간다.
  if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
    throw new Exception("지갑 데이터 디렉토리를 만들 수 없다: " . $dir);
  }
  if (!is_writable($dir)) {
    // 여기서 멈춘다. 웹루트 안으로 폴백하면 원장이 URL 로 다운로드된다 —
    // 2026-08-13 에 forge_td_key.txt 가 그렇게 공개돼 있었다.
    throw new Exception("지갑 데이터 디렉토리에 쓸 수 없다: " . $dir);
  }
  $db = new PDO("sqlite:" . $dir . "/wallet.db");
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
  $db->exec("pragma busy_timeout = 5000");   // 동시 요청이 즉시 실패하지 않게
  // WAL 전환은 짧은 배타 락을 요구하고 SQLite 는 이 전환에 busy 핸들러를 부르지 않는다 —
  // busy_timeout 을 먼저 걸어도 소용없다. 여러 프로세스가 DB 를 동시에 처음 만들면
  // 진 쪽이 "database is locked" 로 죽는다(배포 직후 첫 요청 묶음이 그 모양이다).
  // 몇 번 다시 시도하고, 끝내 안 되면 그냥 넘어간다 — WAL 은 동시성 최적화일 뿐이고
  // 정확성은 BEGIN IMMEDIATE + busy_timeout 이 지킨다. 다음 접속이 다시 시도한다.
  for ($i = 0; $i < 5; $i++) {
    try { $db->exec("pragma journal_mode = WAL"); break; }
    catch (Throwable $e) { usleep(20000 * ($i + 1)); }
  }
  $db->exec("pragma foreign_keys = on");
  @chmod($dir . "/wallet.db", 0600);
  w_migrate($db);
  return $db;
}

function w_schema_version($db) {
  try {
    $r = $db->query("select v from schema_version limit 1")->fetch();
    return $r ? (int)$r["v"] : 0;
  } catch (Throwable $e) { return 0; }
}

// 8c(구글 계정 병합)와 8d(ad_grants)가 둘 다 스키마를 건드린다.
// 러너가 없으면 그때 손으로 ALTER TABLE 을 치게 된다.
function w_migrate($db) {
  $v = w_schema_version($db);
  if ($v < 1) {
    // create ... if not exists 는 경합에 스스로 견디지만, 그 뒤의 schema_version
    // delete+insert 쌍은 아니다 — 두 프로세스가 동시에 이 블록에 들어오면 델리트/인서트가
    // 끼어들어 1행짜리 테이블에 2행이 남을 수 있다(v3 를 쓸 사람을 놀라게 할 종류의 버그).
    // 전부 한 트랜잭션에 넣어 직렬화한다. DDL 은 SQLite 트랜잭션 안에서 동작한다.
    $db->exec("begin immediate");
    try {
      $db->exec("create table if not exists accounts (
        id TEXT PRIMARY KEY, device_id TEXT UNIQUE NOT NULL, google_sub TEXT,
        balance INTEGER NOT NULL DEFAULT 0, streak_days INTEGER NOT NULL DEFAULT 0,
        last_checkin TEXT, seed_ip_hash TEXT, created_at TEXT NOT NULL)");
      $db->exec("create table if not exists ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL,
        delta INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT,
        idem TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL)");
      $db->exec("create table if not exists runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL,
        symbol TEXT NOT NULL, tier TEXT NOT NULL, engine_version TEXT,
        created_at TEXT NOT NULL, expiry TEXT NOT NULL)");
      $db->exec("create index if not exists ix_ledger_acct on ledger (account_id)");
      $db->exec("create index if not exists ix_runs_lookup on runs (account_id, symbol, tier, expiry)");
      $db->exec("create index if not exists ix_accounts_ip on accounts (seed_ip_hash, created_at)");
      $db->exec("create table if not exists schema_version (v INTEGER NOT NULL)");
      $db->exec("delete from schema_version");
      $db->exec("insert into schema_version (v) values (1)");
      $db->exec("commit");
    } catch (Throwable $e) {
      try { $db->exec("rollback"); } catch (Throwable $e2) {}
      throw $e;
    }
  }
  if ($v < 2) {
    // v1 블록은 이제 트랜잭션으로 경합에 견딘다. ALTER 는 그 자체로는 아니다 —
    // 두 프로세스가 동시에 열면 진 쪽이 duplicate column 으로 죽고, ALTER 후 버전 기록 전에
    // 죽으면 컬럼은 있는데 버전은 1 이라 그 뒤 모든 접속이 영원히 실패한다.
    // 그래서 ① 이미 있는지는 쓰기 락을 잡은 "뒤"에 확인한다 — 락 밖에서 보면 두 프로세스가
    //   동시에 "없다"를 보고 나란히 ALTER 를 시도할 수 있다(먼저 커밋한 쪽이 이미 만든 컬럼을
    //   나중 것이 또 만들려다 죽는다). ② 버전 기록을 같은 트랜잭션에 넣어 컬럼 추가와
    //   버전 갱신 사이에 한쪽만 반영되는 창을 없앤다.
    $db->exec("begin immediate");
    try {
      $have = false;
      foreach ($db->query("pragma table_info(ledger)") as $col) {
        if ($col["name"] === "run_type") { $have = true; break; }
      }
      if (!$have) $db->exec("alter table ledger add column run_type TEXT");
      $db->exec("delete from schema_version");
      $db->exec("insert into schema_version (v) values (2)");
      $db->exec("commit");
    } catch (Throwable $e) {
      try { $db->exec("rollback"); } catch (Throwable $e2) {}
      throw $e;
    }
  }
  if (w_schema_version($db) < 3) {
    // v2 와 같은 규율: begin immediate 로 동시 부팅을 직렬화하고, 버전 기록을
    // 같은 트랜잭션에 넣어 스키마와 버전이 갈리는 창을 없앤다.
    $db->exec("begin immediate");
    try {
      $db->exec("create table if not exists auth_nonce (
        nonce TEXT PRIMARY KEY, device_id TEXT NOT NULL, google_sub TEXT,
        created_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)");
      // NULL 을 서로 다른 값으로 보는 SQLite 의 성질에 기댄다 — 미연결 계정은 여럿이어도
      // 걸리지 않고, 같은 google_sub 두 개만 막힌다. 동시 병합의 최종 방어선이다.
      $db->exec("create unique index if not exists ix_accounts_gsub on accounts (google_sub)");
      $db->exec("delete from schema_version");
      $db->exec("insert into schema_version (v) values (3)");
      $db->exec("commit");
    } catch (Throwable $e) {
      try { $db->exec("rollback"); } catch (Throwable $e2) {}
      throw $e;
    }
  }
}

function w_account_id($deviceId) { return substr(sha1($deviceId), 0, 16); }

// forge-auth-lib.php 와 같은 패턴이되 쿠키가 아니라 베어러 토큰이다.
function _wb64e($s) { return rtrim(strtr(base64_encode($s), "+/", "-_"), "="); }
function _wb64d($s) { return base64_decode(strtr($s, "-_", "+/")); }

function w_secret($dir) {
  $f = $dir . "/wallet_secret.txt";
  if (!is_file($f)) {
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    // 원자적으로 만든다. 그냥 file_put_contents 하면 첫 부팅에 여러 프로세스가 각자 제
    // random_bytes 를 써서 마지막 승자만 남고, 그 사이 읽는 쪽은 잘린 파일을 본다(실측:
    // 12-way, 3회 반복 — 서로 다른 비밀키 4·4·6개 관찰). w_ip_hash 가 이 키로 IP 해시를
    // 만들므로(I5) 키가 프로세스마다 갈리면 같은 IP 의 상한 버킷도 그만큼 갈려 상한이
    // 그 수만큼 늘어난다(리뷰 라운드 2 — 이 회귀가 그 원인이었다).
    //
    // rename() 은 "덮어써도 원자적"(읽는 쪽이 잘린 내용을 보지 않는다)이지 "한 번만 쓰기"가
    // 아니다 — 목적지가 이미 있어도 rename 은 실패하지 않고 그냥 덮어쓴다. 그래서 rename
    // 만으로는 마지막 승자가 계속 바뀔 뿐 문제가 그대로 남는다(실측: 12-way 로 다시
    // 재현 — 12개 중 11개가 서로 다른 비밀키를 읽었다. rename 자체는 각자에게 "성공"으로
    // 보였을 뿐이다). link() 는 목적지가 이미 있으면 실패한다(EEXIST) — 그래서 "가장 먼저
    // 만든 사람만 남는다"를 원자적으로 보장한다. 성공하든 실패하든 내 임시 이름은 지운다 —
    // 남이 이겼으면 내 임시파일만 버리고, 다음의 읽기가 그 사람이 쓴 내용을 그대로 본다.
    $tmp = $f . "." . getmypid() . "." . bin2hex(random_bytes(4));
    $n = @file_put_contents($tmp, bin2hex(random_bytes(32)));
    if ($n === false) { @unlink($tmp); throw new Exception("지갑 비밀키를 쓸 수 없다: " . $f); }
    @chmod($tmp, 0600);
    @link($tmp, $f);
    @unlink($tmp);
  }
  // 짧은 읽기는 곧장 실패가 아니라 재시도할 일이다. rename 이 원자적이어도, 파일이 막
  // 생긴 순간 디렉토리 엔트리가 아직 안 보이는 파일시스템(네트워크 마운트 등)에서는
  // 읽는 쪽이 잠깐 헛읽을 수 있다 — 첫 읽기에서 곧장 던지면 바로 그 창에서 정상 요청이
  // 500 을 맞는다(w_db() 가 몇 줄 위에서 이미 문서화한 "배포 직후 첫 요청 묶음" 과 같은
  // 창). C1 의 fail-closed 보장은 그대로 유지한다 — 재시도를 다 쓰고도 짧으면 그때 던진다.
  for ($i = 0; $i < 5; $i++) {
    $s = trim((string)@file_get_contents($f));
    if (strlen($s) >= 64) return $s;
    usleep(20000 * ($i + 1));
  }
  // 빈 키로 물러서지 않는다. 빈 키로 서명하면 스킴을 아는 누구나 임의 기기의 토큰을
  // 위조한다 — 스킴은 저장소와 APK 에 들어 있다. 재시도를 다 쓰고도 짧다면 0바이트
  // 파일(디스크 가득)이나 읽기 불가(백업 복원·uid 불일치)처럼 실재하는 상태다.
  throw new Exception("지갑 비밀키가 비었거나 짧다: " . $f);
}

// 주체는 "d:<deviceId>" 또는 "a:<accountId>". 접두를 서명 대상에 포함한다 —
// 밖에 두면 d: 를 a: 로 바꿔치기해 임의 계정을 가리킬 수 있다.
function w_token_make($dir, $subject) {
  $exp = time() + 365 * 86400;
  $sig = _wb64e(hash_hmac("sha256", $subject . "|" . $exp, w_secret($dir), true));
  return _wb64e($subject) . "|" . $exp . "|" . $sig;
}

// fail-closed — 변조·만료·형식 이상은 전부 null 이다.
// hash_equals 로 상수시간 비교한다(타이밍으로 서명을 맞춰가는 것을 막는다).
// 접두가 없는 토큰은 8c 이전에 발급된 기기 토큰이다. 배포 순간 살아 있는 토큰을
// 깨뜨리지 않으려고 기기로 읽는다(만료 1년이라 한동안 남아 있다).
function w_token_read($dir, $token) {
  if (!is_string($token) || $token === "") return null;
  $p = explode("|", $token);
  if (count($p) !== 3) return null;
  $subject = _wb64d($p[0]);
  $exp = (int)$p[1];
  if ($subject === "" || $exp < time()) return null;
  $want = _wb64e(hash_hmac("sha256", $subject . "|" . $exp, w_secret($dir), true));
  if (!hash_equals($want, $p[2])) return null;
  if (strpos($subject, "d:") === 0) return array("type" => "device", "id" => substr($subject, 2));
  if (strpos($subject, "a:") === 0) return array("type" => "acct", "id" => substr($subject, 2));
  return array("type" => "device", "id" => $subject);   // 8c 이전 토큰
}

// 논스는 브라우저(구글 왕복)와 앱(폴링)을 잇는 유일한 끈이다. 추측 가능하면
// 남의 로그인 결과를 가로챌 수 있으므로 난수 16바이트(128비트)를 쓴다.
//
// 아직 살아 있는 논스가 있으면 그것을 다시 준다. authStart 에는 호출 상한도 청소 주기도
// 없어서, 새로 삽입하면 앱이 로그인 버튼을 누르는 만큼 auth_nonce 가 무한정 불어난다
// (기기 하나가 계정 없이도 표를 채울 수 있는 유일한 경로다 — Task 2 리뷰 지적).
// 재사용 대상은 "아직 안 채워진"(google_sub is null) 논스뿐이다 — 이미 구글이 채운 논스를
// 다시 내주면 같은 논스로 병합이 두 번 돌 여지가 생긴다.
function w_nonce_make($db, $deviceId) {
  $st = $db->prepare("select nonce from auth_nonce
                      where device_id = ? and used = 0 and google_sub is null and created_at >= ?
                      order by created_at desc limit 1");
  // 저장 형식이 gmdate("c") 로 통일돼 있어(오프셋이 늘 +00:00) 문자열 비교가 곧 시각 비교다.
  $st->execute(array($deviceId, gmdate("c", time() - W_NONCE_TTL_SEC)));
  $r = $st->fetch();
  if ($r) return $r["nonce"];

  $n = bin2hex(random_bytes(16));
  $st = $db->prepare("insert into auth_nonce (nonce, device_id, google_sub, created_at, used)
                      values (?, ?, null, ?, 0)");
  $st->execute(array($n, $deviceId, w_now()));
  return $n;
}

// 만료·사용됨은 없는 것과 같다(fail-closed). 호출부는 반환된 device_id 를
// 자기 토큰의 기기와 반드시 대조해야 한다 — 그게 "남의 논스" 방어다.
function w_nonce_read($db, $nonce) {
  if (!is_string($nonce) || $nonce === "") return null;
  $st = $db->prepare("select * from auth_nonce where nonce = ?");
  $st->execute(array($nonce));
  $r = $st->fetch();
  if (!$r) return null;
  if ((int)$r["used"] === 1) return null;
  if (strtotime($r["created_at"]) + W_NONCE_TTL_SEC < time()) return null;
  return $r;
}

// 브라우저 콜백이 부른다. 이미 채워진 논스는 다시 채우지 않는다 —
// where google_sub is null 이 그 방어이며, 경합에서도 한 번만 성립한다.
function w_nonce_complete($db, $nonce, $googleSub) {
  $st = $db->prepare("update auth_nonce set google_sub = ? where nonce = ? and google_sub is null");
  $st->execute(array($googleSub, $nonce));
  return $st->rowCount() === 1;
}

// 병합까지 끝난 논스는 태운다. 단회용의 실체가 이 줄이다.
function w_nonce_burn($db, $nonce) {
  $st = $db->prepare("update auth_nonce set used = 1 where nonce = ?");
  $st->execute(array($nonce));
}

// PC(forge-auth-lib.php)와 같은 파일을 읽는다. 자격증명이 두 벌이 되면 갈린다.
// 파일이 없으면 로그인 기능 전체가 조용히 꺼진다(무중단 스위치).
function w_oauth_conf() {
  $f = __DIR__ . "/forge_google_oauth.json";
  if (!is_file($f)) return null;
  $j = json_decode((string)file_get_contents($f), true);
  return (is_array($j) && !empty($j["client_id"]) && !empty($j["client_secret"])) ? $j : null;
}

function w_get_account($db, $deviceId) {
  $st = $db->prepare("select * from accounts where device_id = ?");
  $st->execute(array($deviceId));
  $r = $st->fetch();
  return $r ? $r : null;
}

function w_seed_count_today($db, $ipHash) {
  if ($ipHash === null || $ipHash === "") return 0;
  $st = $db->prepare("select count(*) c from accounts where seed_ip_hash = ? and created_at >= ?");
  $st->execute(array($ipHash, w_today()));
  $r = $st->fetch();
  return (int)$r["c"];
}

// hello 디스패처가 이 예외로 "IP 상한에 걸렸다"(429)를 "다른 요청이 먼저 만들었다"
// (UNIQUE 충돌 — 재조회) 와 구분한다. 둘 다 catch(Throwable) 로는 안 갈린다.
class WalletRateLimitException extends Exception {}

// 계정 생성과 시드 지급은 한 트랜잭션이다. 갈라지면 잔량 없는 계정이 남는다.
// device_id UNIQUE 가 재지급을 DB 층에서 막는다 — 애플리케이션 검사에 기대지 않는다.
// 실측(8-way 동시 생성, journal_mode=WAL, busy_timeout=5000, 3회 반복): 패자는 매번
// 깨끗한 PDOException(SQLSTATE 23000, "UNIQUE constraint failed") 을 던졌다 — SQLITE_BUSY
// 타임아웃은 한 번도 관찰되지 않았다. Task 5 의 hello 폴백(예외를 잡고 재조회)은 이
// 구분(제약 위반 vs 바쁨-타임아웃)에 기대도 된다.
//
// IP 상한도 이 쓰기 락 "안"에서 다시 센다. 락 밖에서 세고(check) 락 안에서 쓰면(act)
// 그 사이 창으로 여러 요청이 동시에 "아직 상한 미만"을 보고 나란히 통과한다 — 실측: 같은
// IP 에서 12건을 동시에 보내자 상한 3 인데 10개가 생겼다(12건 중 2건만 429). begin immediate
// 는 한 번에 한 트랜잭션만 쓰기 락을 쥐므로, 상한 검사와 계정 삽입을 같은 트랜잭션에
// 두면 그 창이 사라진다.
function w_create_account($db, $deviceId, $ipHash) {
  $id = w_account_id($deviceId);
  $now = w_now();
  $db->exec("begin immediate");
  try {
    if ($ipHash !== null && $ipHash !== "" && w_seed_count_today($db, $ipHash) >= W_IP_DAILY) {
      throw new WalletRateLimitException("ip-daily-cap");
    }
    $st = $db->prepare("insert into accounts (id, device_id, balance, streak_days, last_checkin, seed_ip_hash, created_at)
                        values (?, ?, 0, 0, NULL, ?, ?)");
    $st->execute(array($id, $deviceId, $ipHash, $now));
    $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                        values (?, ?, 'seed', NULL, ?, ?)");
    $st->execute(array($id, W_SEED, "seed:" . $id, $now));
    $db->prepare("update accounts set balance = ? where id = ?")->execute(array(W_SEED, $id));
    $db->exec("commit");
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    throw $e;
  }
  return w_get_account($db, $deviceId);
}

function w_true_balance($db, $acctId) {
  $st = $db->prepare("select coalesce(sum(delta), 0) s from ledger where account_id = ?");
  $st->execute(array($acctId));
  $r = $st->fetch();
  return (int)$r["s"];
}

// 캐시(accounts.balance)와 진실(SUM(ledger.delta))이 어긋나면 원장을 믿고 캐시를 고친다.
// 캐시가 진실이 되면 "내 스쿱 어디 갔나"에 답할 수 없다.
function w_state($db, $acct) {
  $true = w_true_balance($db, $acct["id"]);
  if ((int)$acct["balance"] !== $true) {
    // 한 문장으로 고친다 — SELECT 로 읽고 따로 UPDATE 하면 그 사이에 원장이 바뀌어
    // 낡은 값을 캐시에 새겨 넣는다. 반환값은 늘 원장에서 바로 오므로 화면은 안 틀리지만,
    // 캐시가 되레 나빠지는 순간이 생긴다. Task 4·5 가 동시 기록자를 데려온다.
    $db->prepare("update accounts set balance = (select coalesce(sum(delta), 0) from ledger where account_id = ?) where id = ?")
       ->execute(array($acct["id"], $acct["id"]));
  }
  return array(
    "balance"    => $true,
    "cap"        => W_CAP,
    "streakDays" => (int)$acct["streak_days"],
    "canCheckin" => ($acct["last_checkin"] !== w_today())
  );
}

function w_active_run($db, $acctId, $symbol, $tier) {
  $st = $db->prepare("select * from runs where account_id = ? and symbol = ? and tier = ? and expiry > ?
                      order by expiry desc limit 1");
  $st->execute(array($acctId, $symbol, $tier, w_now()));
  $r = $st->fetch();
  return $r ? $r : null;
}

// idem 재생은 계정 소유다 — account_id 없이 idem 만으로 찾으면 계정 B 가 계정 A 의
// 원장 행을 읽고 "이미 냈다"는 재생 결과를 그대로 받아 간다(리뷰에서 실측된 구멍).
function w_ledger_by_idem($db, $idem, $acctId) {
  $st = $db->prepare("select * from ledger where idem = ? and account_id = ?");
  $st->execute(array($idem, $acctId));
  $r = $st->fetch();
  return $r ? $r : null;
}

// 계정 범위 조회가 비어도 다른 계정이 같은 idem 을 이미 썼을 수 있다(idem 은 전역 UNIQUE).
// 그 상태로 유료 경로 insert 를 밀어붙이면 UNIQUE 제약이 예외를 던진다 — 여기서 먼저 걸러
// bad-idem 으로 조용히 거절한다.
function w_ledger_by_idem_any($db, $idem) {
  $st = $db->prepare("select * from ledger where idem = ?");
  $st->execute(array($idem));
  $r = $st->fetch();
  return $r ? $r : null;
}

// 차감과 권리 부여는 한 트랜잭션이다. BEGIN IMMEDIATE 로 쓰기 락을 먼저 잡아야
// 동시 요청 둘이 같은 잔량을 읽고 각자 차감하는 일이 없다. begin 자체를 try 안에 둔다 —
// busy_timeout(5000ms) 을 다 채우고도 락을 못 잡으면 여기서 던지는데, 열린 트랜잭션이
// 없으니 롤백할 것도 없이 reason=>"busy" 로 답한다. 클라이언트는 같은 idem 으로
// 재시도하면 된다(멱등이라 안전).
//
// charged:false 인 경우에도 delta 0 행을 남긴다 — 안 남기면 무료 경로만 멱등키가 없어서
// 같은 요청이 두 번 오면 두 번째가 유료 경로로 빠진다.
//
// reason ∈ insufficient|unknown-runtype|bad-idem|bad-ref|busy
function w_spend($db, $acctId, $runType, $idem, $ref, $engineVersion) {
  $costs = w_costs();
  if (!isset($costs[$runType])) return array("ok" => false, "charged" => false, "reason" => "unknown-runtype");
  if (!is_string($idem) || $idem === "") return array("ok" => false, "charged" => false, "reason" => "bad-idem");

  $cost = $costs[$runType];
  $entitled = in_array($runType, w_entitled_types(), true);
  // full·custom 인데 대상(symbol)이 없으면 과금만 되고 권리는 못 남긴다 — 재시도마다
  // 스쿱이 새 나간다. idem 규격 위반과 같은 무게로 미리 거절한다.
  if ($entitled && (!is_string($ref) || $ref === "")) {
    return array("ok" => false, "charged" => false, "reason" => "bad-ref");
  }

  try {
    $db->exec("begin immediate");
  } catch (Throwable $e) {
    return array("ok" => false, "charged" => false, "reason" => "busy");
  }
  try {
    // 재시도 재생 — 내 계정에 이미 처리한 idem 이면 그때 결과를 그대로 돌려준다.
    // 단, runType·ref 까지 같을 때만이다 — 같은 idem 을 다른 등급/대상에 재사용하는 건
    // 재시도가 아니라 값싼 등급 값을 내고 비싼 등급을 받아가려는 시도다(리뷰에서 실측).
    $prev = w_ledger_by_idem($db, $idem, $acctId);
    if ($prev) {
      if ($prev["run_type"] === $runType && (string)$prev["ref"] === (string)$ref) {
        $db->exec("commit");
        return array("ok" => true, "charged" => ((int)$prev["delta"] !== 0), "reason" => null);
      }
      $db->exec("commit");   // 읽기만 했다 — 되돌릴 쓰기가 없다
      return array("ok" => false, "charged" => false, "reason" => "bad-idem");
    }
    if (w_ledger_by_idem_any($db, $idem) !== null) {
      $db->exec("commit");
      return array("ok" => false, "charged" => false, "reason" => "bad-idem");
    }

    $now = w_now();
    if ($entitled && w_active_run($db, $acctId, $ref, $runType) !== null) {
      $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, run_type, created_at)
                          values (?, 0, 'spend-cached', ?, ?, ?, ?)");
      $st->execute(array($acctId, $ref, $idem, $runType, $now));
      $db->exec("commit");
      return array("ok" => true, "charged" => false, "reason" => null);
    }

    $bal = w_true_balance($db, $acctId);
    if ($bal < $cost) {
      $db->exec("rollback");
      return array("ok" => false, "charged" => false, "reason" => "insufficient");
    }

    $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, run_type, created_at)
                        values (?, ?, 'spend', ?, ?, ?, ?)");
    $st->execute(array($acctId, -$cost, $ref, $idem, $runType, $now));
    if ($entitled) {
      $st = $db->prepare("insert into runs (account_id, symbol, tier, engine_version, created_at, expiry)
                          values (?, ?, ?, ?, ?, ?)");
      $st->execute(array($acctId, $ref, $runType, $engineVersion, $now,
                         gmdate("c", time() + W_RUN_TTL_SEC)));
    }
    $db->prepare("update accounts set balance = ? where id = ?")->execute(array($bal - $cost, $acctId));
    $db->exec("commit");
    return array("ok" => true, "charged" => true, "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    throw $e;
  }
}

// 환급 자체가 멱등이다 — 보상 행의 키를 "<원래 idem>:refund" 로 둔다.
// 상한으로 깎지 않는다: 가져간 것을 돌려주는 것이라 깎으면 훔치는 셈이 된다.
// reason ∈ not-found|already-refunded|nothing-to-refund|busy
function w_refund($db, $acctId, $idem) {
  try {
    $db->exec("begin immediate");
  } catch (Throwable $e) {
    return array("ok" => false, "reason" => "busy");
  }
  try {
    // 계정 범위 조회다 — w_spend 의 idem 재생 구멍과 같은 이유로, 다른 계정의
    // idem 을 넘기면 조회가 애초에 비어 not-found 로 떨어진다(리뷰에서 실측된 패턴).
    $orig = w_ledger_by_idem($db, $idem, $acctId);
    if (!$orig) {
      $db->exec("rollback");
      return array("ok" => false, "reason" => "not-found");
    }
    // 환급은 '차감'(delta<0)만 되돌린다. >= 0 을 다 걸러야 한다 — 아니면 seed·checkin·
    // chest 같은 지급 행이나, 심지어 직전 환급 자신의 보상 행(delta>0)까지 idem 만
    // 맞으면 그대로 받아들여 -delta 를 또 넣는다. 그 키들은 전부 클라이언트가 계산할
    // 수 있다(seed:<acctId>, checkin:<acctId>:<day>, <idem>:refund) — idem 자체가
    // 클라이언트 입력이라 여기서 막지 않으면 잔량이 음수로 갈 수 있다(리뷰에서 실측).
    if ((int)$orig["delta"] >= 0) {
      $db->exec("rollback");
      return array("ok" => false, "reason" => "nothing-to-refund");
    }
    $rk = $idem . ":refund";
    if (w_ledger_by_idem($db, $rk, $acctId)) {
      $db->exec("rollback");
      return array("ok" => false, "reason" => "already-refunded");
    }
    $back = -((int)$orig["delta"]);
    $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                        values (?, ?, 'refund', ?, ?, ?)");
    $st->execute(array($acctId, $back, $orig["ref"], $rk, w_now()));
    // 권리도 되돌린다 — 환급했는데 권리가 남으면 공짜로 계속 본다. account_id·symbol·tier·
    // created_at 넷 다 "=" 로 정확히 맞춘다(원래 spend 와 그때 생긴 runs 행이 같은 $now
    // 문자열을 공유한다). tier 를 빼면 같은 계정·같은 종목·같은 순간에 다른 등급(예: custom)
    // 으로 결제한 별개 권리까지 같이 지워버린다(리뷰에서 실측 — full 환급이 custom 권리를
    // 지웠다). created_at 을 ">=" 로 두면 같은 종목을 나중에 다시 정당하게 결제해 만든 최신
    // 권리까지 같이 지워버린다.
    //
    // runs.tier 는 Task 3 부터 계속 있었다 — v2 에서 새로 생긴 건 ledger.run_type 뿐이다
    // (이전 라운드에서 "v1 은 등급 구분이 없어 충돌이 안 난다"고 잘못 적었다 — 소스를 다시
    // 보니 v1 도 등급별로 별도 runs 행을 만들었고, 그래서 같은 계정·같은 종목·같은 초에
    // full+custom 두 권리가 v1 시절에도 공존할 수 있다). 그러니 ledger.run_type 이 NULL
    // 이어도(v2 이전 spend — 마이그레이션이 컬럼만 추가하고 소급 채우지 않는다) tier 없이
    // 지우면 과삭제다: 환급 안 한 등급의 권리까지 날아간다(리뷰에서 실측).
    //
    // 대신 등급은 금액에서 복구한다 — delta 가 곧 가격이고, w_costs() 의 네 가격(3·5·1·2)이
    // 서로 달라 delta 하나가 등급 하나를 유일하게 가리킨다(아래 "가격이 서로 다르다" 테스트가
    // 이 전제를 지킨다 — 가격이 겹치면 그 즉시 빨갛게 죽는다). 그 가격표에 없는 델타(가격이
    // 바뀐 뒤 남은 옛 행, 손으로 만진 행 등)만 진짜로 등급을 복구할 수 없는 경우다 — 그때만
    // tier 없이 지운다. 이 마지막 단계에서는 "너무 많이 지운다"가 "환급했는데 권리가 남는다"
    // 보다 안전한 실패다.
    $tier = $orig["run_type"];
    if ($tier === null) {
      foreach (w_costs() as $rt => $cost) {
        if ($cost === $back) { $tier = $rt; break; }
      }
    }
    if ($tier !== null) {
      $db->prepare("delete from runs where account_id = ? and symbol = ? and tier = ? and created_at = ?")
         ->execute(array($acctId, $orig["ref"], $tier, $orig["created_at"]));
    } else {
      $db->prepare("delete from runs where account_id = ? and symbol = ? and created_at = ?")
         ->execute(array($acctId, $orig["ref"], $orig["created_at"]));
    }
    $db->prepare("update accounts set balance = ? where id = ?")
       ->execute(array(w_true_balance($db, $acctId), $acctId));
    $db->exec("commit");
    return array("ok" => true, "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    throw $e;
  }
}

// 서버 UTC 기준이다. $today 는 테스트에서만 넘긴다 — 프로덕션은 null 을 넘겨 서버 시간을 쓴다.
// 기기 시계를 바꿔서 얻는 것이 없어야 한다(SPEC-economy §3).
// reason ∈ already|busy
function w_checkin($db, $acct, $today) {
  $day = ($today === null) ? w_today() : $today;
  $acctId = $acct["id"];
  try {
    $db->exec("begin immediate");
  } catch (Throwable $e) {
    return array("ok" => false, "granted" => 0, "capped" => false, "reason" => "busy");
  }
  try {
    $cur = $db->prepare("select * from accounts where id = ?");
    $cur->execute(array($acctId));
    $a = $cur->fetch();
    if ($a["last_checkin"] === $day) {
      $db->exec("rollback");
      return array("ok" => false, "granted" => 0, "capped" => false, "reason" => "already");
    }
    $streak = ($a["last_checkin"] !== null && $a["last_checkin"] === w_day_add($day, -1))
      ? ((int)$a["streak_days"] + 1) : 1;
    $want = W_CHECKIN + (($streak % W_CHEST_EVERY === 0) ? W_CHEST : 0);

    $bal = w_true_balance($db, $acctId);
    $room = W_CAP - $bal;
    if ($room < 0) $room = 0;
    $give = ($want > $room) ? $room : $want;
    $capped = ($give < $want);

    if ($give > 0) {
      $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                          values (?, ?, ?, NULL, ?, ?)");
      $st->execute(array($acctId, $give, ($want > W_CHECKIN ? "chest" : "checkin"),
                         "checkin:" . $acctId . ":" . $day, w_now()));
    }
    // capped 여도 출석일은 소비한다 — 지갑이 찼을 뿐 출석은 했다. 소비 안 하면
    // 기기 시계를 안 바꿔도 같은 날 재시도로 상한 해소를 노려볼 여지가 생긴다.
    $db->prepare("update accounts set balance = ?, streak_days = ?, last_checkin = ? where id = ?")
       ->execute(array($bal + $give, $streak, $day, $acctId));
    $db->exec("commit");
    return array("ok" => true, "granted" => $give, "capped" => $capped, "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    throw $e;
  }
}

// 병합이 한 트랜잭션에서 최대 세 줄을 쓴다. 기존 세 곳(w_create_account·w_spend·w_checkin)의
// 인라인 삽입은 그대로 둔다 — 돈 경로를 이유 없이 흔들지 않는다.
function w_ledger_insert($db, $acctId, $delta, $reason, $ref, $idem) {
  $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                      values (?, ?, ?, ?, ?, ?)");
  $st->execute(array($acctId, $delta, $reason, $ref, $idem, w_now()));
}

// 익명 기기 계정을 구글 계정에 붙인다. 갈래는 둘뿐이다.
//  (a) 이 구글 계정으로 된 행이 없다 → 지금 기기 계정에 google_sub 을 박는다.
//      옮기는 게 아니라 그 계정이 곧 구글 계정이 된다. 잔량·스트릭·원장이 그대로 남는다.
//  (b) 있다 → 익명 잔량은 버린다. SPEC §4 의 "항상 높은 쪽"은 채택하지 않았다 —
//      기기를 바꿔가며 익명 5개를 받고 로그인하면 잔량이 계속 오르는 래칫이 된다(SPEC 자신이
//      "가장 유력한 남용 경로"라고 지목한 재설치 구멍이 병합 규칙으로 되살아난다).
//      버린 수량은 원장에 남긴다("5개가 어디 갔냐"에 답할 근거).
// 잔량을 캐시(accounts.balance)에서만 0으로 내리지 않는다 — 진실은 SUM(ledger.delta) 이고,
// 캐시만 건드리면 w_state 가 다음 호출에서 원장을 보고 5로 되돌려 놓는다(= 잔량이 부활한다).
//
// reason ∈ null|no-account|device-claimed|busy|error
function w_merge($db, $deviceId, $googleSub, $retry = 0) {
  $fail = function ($reason) {
    return array("ok" => false, "acct" => null, "moved" => false, "discarded" => 0, "reason" => $reason);
  };
  try {
    $db->exec("begin immediate");
  } catch (Throwable $e) {
    // 논스는 아직 안 태웠으니 앱이 다음 폴링에서 그대로 다시 시도한다.
    return $fail("busy");
  }
  try {
    $dev = w_get_account($db, $deviceId);
    if (!$dev) { $db->exec("rollback"); return $fail("no-account"); }

    // 이미 다른 구글 계정에 묶인 기기다. 여기서 막지 않으면 같은 기기에서 두 번째 구글
    // 계정으로 로그인하는 것만으로 첫 번째 사람의 계정(잔량·원장 전부)을 통째로 가져간다 —
    // device_id 가 UNIQUE 라 기기당 계정이 하나뿐이어서 "새 계정을 하나 더"로도 못 피한다.
    // 거절이 유일하게 안전한 답이다(브리프에 없던 갈래 — 리뷰에 보고).
    if ($dev["google_sub"] !== null && $dev["google_sub"] !== $googleSub) {
      $db->exec("rollback");
      return $fail("device-claimed");
    }

    $st = $db->prepare("select * from accounts where google_sub = ?");
    $st->execute(array($googleSub));
    $g = $st->fetch();

    $key = "merge:" . $googleSub . ":" . $dev["id"];

    if (!$g) {
      $db->prepare("update accounts set google_sub = ? where id = ?")->execute(array($googleSub, $dev["id"]));
      w_ledger_insert($db, $dev["id"], 0, "merge_claim", $googleSub, $key . ":claim");
      $db->exec("commit");
      return array("ok" => true, "acct" => w_get_account($db, $deviceId),
                   "moved" => false, "discarded" => 0, "reason" => null);
    }

    if ($g["id"] === $dev["id"]) {   // 이미 이 계정이 그 구글 계정이다 — 할 일 없음
      $db->exec("commit");
      return array("ok" => true, "acct" => $g, "moved" => false, "discarded" => 0, "reason" => null);
    }

    // 같은 기기·같은 구글로 두 번 불렀는가. 멱등키가 idem UNIQUE 에 걸려 예외로 튀게 두면
    // 아래 catch 의 재시도가 같은 실패를 되풀이할 뿐이므로(무한 재귀), 쓰기 전에 먼저 본다.
    $prev = w_ledger_by_idem_any($db, $key . ":from");
    if ($prev) {
      $db->exec("commit");   // 읽기만 했다
      $parts = explode(":", (string)$prev["ref"]);
      $st = $db->prepare("select * from accounts where id = ?");
      $st->execute(array($g["id"]));
      return array("ok" => true, "acct" => $st->fetch(), "moved" => true,
                   "discarded" => (count($parts) > 1 ? (int)$parts[1] : 0), "reason" => null);
    }

    $bal = w_true_balance($db, $dev["id"]);
    if ($bal > 0) {
      // 음수로 적어 잔량을 0으로 내린다. 캐시만 0으로 바꾸면 SUM(delta) 와 갈린다.
      w_ledger_insert($db, $dev["id"], -$bal, "merge_discard", $googleSub, $key . ":discard");
      $db->prepare("update accounts set balance = 0 where id = ?")->execute(array($dev["id"]));
    }
    // 구글 계정 쪽엔 delta 0 기록만 — 버린 수량과 출처 기기를 ref 에 담는다.
    w_ledger_insert($db, $g["id"], 0, "merge_from", $dev["id"] . ":" . $bal, $key . ":from");

    // 스트릭만 긴 쪽을 취한다. 잔량과 달리 스트릭은 발행량이 아니라 습관의 기록이라
    // 래칫이 되지 않는다(하루에 한 번만 오르고, 기기를 늘려도 총량이 늘지 않는다).
    if ((int)$dev["streak_days"] > (int)$g["streak_days"]) {
      $db->prepare("update accounts set streak_days = ?, last_checkin = ? where id = ?")
         ->execute(array((int)$dev["streak_days"], $dev["last_checkin"], $g["id"]));
    }
    $db->exec("commit");
    $st = $db->prepare("select * from accounts where id = ?");
    $st->execute(array($g["id"]));
    return array("ok" => true, "acct" => $st->fetch(), "moved" => true, "discarded" => $bal, "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    // 유니크 인덱스 충돌(동시 첫 병합의 패자) — 이긴 쪽이 만든 계정으로 다시 간다.
    // 딱 한 번만이다: 실패가 경합이 아니라 지속적인 것(락 타임아웃 등)이면 같은 자리에서
    // 영원히 다시 부르게 되고, 그건 500 이 아니라 스택 오버플로로 죽는다.
    if ($retry < 1) {
      $st = $db->prepare("select * from accounts where google_sub = ?");
      $st->execute(array($googleSub));
      if ($st->fetch()) return w_merge($db, $deviceId, $googleSub, $retry + 1);
    }
    return $fail("error");
  }
}
