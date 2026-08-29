<?php
// 머니스쿱 지갑 원장. HTTP 를 모른다 — 그래야 웹서버 없이 tests/wallet.test.php 로 돌릴 수 있다.
// 진실은 ledger 이고 accounts.balance 는 캐시다(SPEC-economy §1).
//
// ⚠ cafe24 의 SQLite 는 3.26.0(2018)이다. UPSERT(3.24+)는 되지만 RETURNING(3.35+)과
// STRICT 테이블(3.37+)은 못 쓴다 — 삽입 후 값을 돌려받는 패턴을 쓰지 말 것.

// 상수는 가드형 — 소비자(app-api.php: 새 앱 지갑 브리지)가 require 전에 define 으로 자기 값을
// 주입할 수 있다(2026-08-24). 아무도 주입하지 않으면 아래 기본값 = 종전과 완전 동일(테스트 불변).
if (!defined("W_SEED")) define("W_SEED", 5);
if (!defined("W_CAP")) define("W_CAP", 20);
if (!defined("W_CHECKIN")) define("W_CHECKIN", 1);
if (!defined("W_CHEST")) define("W_CHEST", 5);
if (!defined("W_CHEST_EVERY")) define("W_CHEST_EVERY", 7);
// 2026-08-13~16 사이 개발용으로 20 이었다(사무실 IP 의 하루 쿼터가 배포 검증·E2E 로 소진돼
// 파트너 실기기가 429 로 막혔던 문제 회피). 실기기 확인이 끝나 3 으로 되돌린다 — 재설치 남용
// 방어의 실제 값이며(진짜 방어는 8c 구글 로그인), tests/wallet-concurrency.sh check1/check3 은
// cap 값에서 레이서 수·기대 429·사전 채움을 스스로 유도하므로 수정 없이 그대로 유효하다.
if (!defined("W_IP_DAILY")) define("W_IP_DAILY", 3);   // IP 해시당 하루 신규 계정 지급 상한(재설치 남용 완화). 가드형 — 앱은 app-api 에서 상향 주입
define("W_RUN_TTL_SEC", 86400);   // Full 권리 24시간
define("W_NONCE_TTL_SEC", 600);   // 10분. 사용자가 브라우저에서 로그인을 마칠 시간

// 서버가 정본이다. 클라이언트의 MSWallet.COSTS 는 미리보기 표시용일 뿐이다.
//
// scan = 0 (무료, 사용자 결정 2026-08-17). 온보딩 지급이 5 스쿱인데 스캔이 2 면 두 번 만에
// 바닥난다 — 목록을 훑어보는 행위, 즉 앱의 주 루프가 유료가 된다. 스쿱은 심화·전문 분석에서만
// 쓴다. **키를 지우지 않고 0 으로 둔다**: 지우면 이미 설치된 구버전 앱의 spend("scan") 이
// unknown-runtype 으로 막혀 스캔 자체가 안 된다. 0 이면 구버전도 그대로 무료로 동작한다.
//
// ⚠ 아래 w_refund 는 ledger.run_type 이 NULL 인 옛 행의 등급을 **delta 금액으로** 되찾는다
// (그 전제가 "네 가격이 서로 다르다"이고 아래 테스트가 그것을 지킨다). 가격이 바뀌었으므로
// **옛 scan 지출(delta 2)은 이제 어느 가격과도 안 맞아** tier 없이 지우는 갈래로 떨어진다.
// scan 은 w_entitled_types() 에 없어 runs 행을 애초에 만들지 않으므로 지울 것도 없다 — 무해하다.
function w_costs() {
  // 가드형 오버라이드(app-api 브리지가 JSON 으로 주입 — 2026-08-24) — 미주입 시 종전과 완전 동일
  if (defined("W_COSTS_JSON")) { $c = json_decode(W_COSTS_JSON, true); if (is_array($c)) return $c; }
  return array("full" => 3, "custom" => 5, "slot" => 1, "scan" => 0);
}
// 종목별 권리를 갖는 등급. scan·slot 은 단순 차감이라 여기 없다.
function w_entitled_types() {
  if (defined("W_ENTITLED_JSON")) { $t = json_decode(W_ENTITLED_JSON, true); if (is_array($t)) return $t; }
  return array("full", "custom");
}

function w_now() { return gmdate("c"); }
function w_today() { return gmdate("Y-m-d"); }
function w_day_add($ymd, $n) { return gmdate("Y-m-d", strtotime($ymd . " UTC") + $n * 86400); }
// 출석 슬롯(2026-08-29 정책: 매시간 정시). UTC 정시 = KST 정시(정수 시간대 오프셋)라 tz 변환 없이
// 경계가 같다. 연속일은 종전대로 슬롯의 날짜 부분(UTC)으로 센다.
function w_slot($ts = null) { return gmdate("Y-m-d\TH", $ts === null ? time() : $ts); }
// w_checkin 의 3번째 인자·저장값 정규화: "Y-m-d"(옛 일 단위·테스트) → 그날 T00 슬롯, "Y-m-dTH" 는 그대로.
function w_slot_norm($v) { return ($v === null) ? null : (strlen($v) === 10 ? $v . "T00" : $v); }

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
      // (실측상 그 경합을 실제로 결정하는 것은 BEGIN IMMEDIATE 지만 — tests/wallet.test.php
      //  의 "같은 google_sub …" 주석 참고 — 이 인덱스가 있어야 그 불변식이 모든 미래
      //  작성자의 규율이 아니라 데이터의 성질이 된다. where google_sub = ? 조회도 함께 탄다.)
      $db->exec("create unique index if not exists ix_accounts_gsub on accounts (google_sub)");
      // w_nonce_make 가 "이 기기의 살아 있는 논스"를 찾는다. 인덱스가 없으면 그 조회가
      // auth_nonce 전체 스캔 + 정렬용 임시 B-트리가 된다(실측: SCAN + USE TEMP B-TREE).
      // auth_nonce 는 청소 주기가 없어 만료 행이 계속 쌓이므로, O(1) 삽입이던 authStart 가
      // 표 크기에 비례해 느려진다(20만 행에서 호출당 25ms — cafe24 공유 호스팅은 더 느리다).
      // ⚠ 이 한 줄은 v3 를 "나중에 고친" 것이 아니다: 프로덕션은 아직 v2 이고 v3 는 이
      // 브랜치에서 아직 배포된 적이 없다. 그래서 v4 를 새로 파지 않고 v3 안에 넣었다.
      $db->exec("create index if not exists ix_nonce_dev on auth_nonce (device_id, created_at)");
      $db->exec("delete from schema_version");
      $db->exec("insert into schema_version (v) values (3)");
      $db->exec("commit");
    } catch (Throwable $e) {
      try { $db->exec("rollback"); } catch (Throwable $e2) {}
      throw $e;
    }
  }
  if (w_schema_version($db) < 4) {
    $db->exec("begin immediate");
    try {
      // transaction_id 를 PK 로 둔다 — 구글은 콜백을 재시도하므로 중복이 정상이고,
      // 앱 층 검사만으로는 동시 재시도에서 둘 다 통과한다(8c 에서 같은 교훈을 얻었다).
      // amount 는 구글이 말한 값, granted 는 지갑 상한을 적용해 실제로 넣은 값 —
      // 둘이 다를 수 있고, 다른 이유를 나중에 설명할 수 있어야 한다.
      $db->exec("create table if not exists ad_grants (
        transaction_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, unit TEXT NOT NULL,
        amount INTEGER NOT NULL, granted INTEGER NOT NULL, created_at TEXT NOT NULL)");
      $db->exec("create index if not exists ix_ad_acct on ad_grants (account_id, created_at)");
      $db->exec("delete from schema_version");
      $db->exec("insert into schema_version (v) values (4)");
      $db->exec("commit");
    } catch (Throwable $e) {
      try { $db->exec("rollback"); } catch (Throwable $e2) {}
      throw $e;
    }
  }
  if (w_schema_version($db) < 5) {
    // v5(2026-08-29): 구글 계정 표시 이름. 사용자 지시 — 앱에 보이는 이름은 내부 닉네임(리더보드용)이
    // 아니라 구글(유튜브) 계정 이름이어야 한다. 콜백이 id_token 의 name 을 논스에 적고, 병합 때
    // 계정으로 옮긴다. ALTER 는 재실행 시 실패하므로 컬럼 유무를 먼저 본다.
    $db->exec("begin immediate");
    try {
      $has = function ($table, $col) use ($db) {
        foreach ($db->query("pragma table_info(" . $table . ")")->fetchAll() as $c) if ($c["name"] === $col) return true;
        return false;
      };
      if (!$has("auth_nonce", "google_name")) $db->exec("alter table auth_nonce add column google_name TEXT");
      if (!$has("accounts", "google_name")) $db->exec("alter table accounts add column google_name TEXT");
      $db->exec("delete from schema_version");
      $db->exec("insert into schema_version (v) values (5)");
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
function w_nonce_complete($db, $nonce, $googleSub, $googleName = null) {
  $name = ($googleName === null || trim((string)$googleName) === "") ? null : substr(trim((string)$googleName), 0, 80);
  $st = $db->prepare("update auth_nonce set google_sub = ?, google_name = ? where nonce = ? and google_sub is null");
  $st->execute(array($googleSub, $name, $nonce));
  return $st->rowCount() === 1;
}
// 병합이 끝난 계정에 구글 표시 이름을 적는다(없으면 건드리지 않는다 — 옛 로그인 유지).
function w_set_google_name($db, $acctId, $name) {
  if ($name === null || trim((string)$name) === "") return;
  $db->prepare("update accounts set google_name = ? where id = ?")->execute(array(substr(trim((string)$name), 0, 80), $acctId));
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
    "gname"      => (isset($acct["google_name"]) && $acct["google_sub"] !== null) ? $acct["google_name"] : null,   // 구글 표시 이름(연결 시에만)
    // 병합으로 넘어간 기기 계정은 출석 버튼 자체를 못 본다. 여기서 true 를 주면 화면은
    // 버튼을 그리는데 w_checkin 은 거절하는 상태가 되어, 사용자가 눌러도 아무 일도 안 난다.
    "canCheckin" => (w_slot_norm($acct["last_checkin"]) !== w_slot() && !w_is_merged_away($db, $acct["id"])),
    "nextSlotAt" => gmdate("c", (floor(time() / 3600) + 1) * 3600)   // 다음 정시(ISO) — 화면 카운트다운용
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
// reason ∈ insufficient|unknown-runtype|bad-idem|bad-ref|merged|busy
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
    // 지갑을 구글 계정에 넘긴 기기 계정은 쓸 수도 없다. checkin·refund 와 같은 규율이며,
    // 8d 부터는 우연이 아니라 필수다 — 광고 지급이 checkin 을 거치지 않고 적립하는 첫 경로라
    // 이 가드가 없으면 잔량 0 으로 얼어붙은 지갑이 광고 한 번에 되살아난다.
    // 쓰기 락 "안"에서 본다 — 병합과 소비가 동시에 들어오면 락 밖 검사는 그 사이로 샌다.
    if (w_is_merged_away($db, $acctId)) {
      $db->exec("rollback");
      return array("ok" => false, "charged" => false, "reason" => "merged");
    }
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
    // charged 는 "실제로 받았는가"다. 무료 등급(cost 0)에 true 를 돌려주면 안 받아놓고 받았다고
    // 말하는 것이고, 클라이언트의 잔량 갱신·환급 판단이 그 답을 믿는다.
    return array("ok" => true, "charged" => ($cost > 0), "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    throw $e;
  }
}

// 환급 자체가 멱등이다 — 보상 행의 키를 "<원래 idem>:refund" 로 둔다.
// 상한으로 깎지 않는다: 가져간 것을 돌려주는 것이라 깎으면 훔치는 셈이 된다.
// reason ∈ not-found|already-refunded|nothing-to-refund|merged|busy
function w_refund($db, $acctId, $idem) {
  try {
    $db->exec("begin immediate");
  } catch (Throwable $e) {
    return array("ok" => false, "reason" => "busy");
  }
  try {
    // 출석과 같은 이유로 막는다(w_is_merged_away). 환급도 잔량을 "올리는" 경로라, 병합
    // 직전에 쓴 idem 을 병합 "후"에 환급하면 버린 잔량이 그만큼 되살아난다 — 넘긴 지갑에
    // 되살아나므로 사용자에게 쓸모도 없다. 리뷰가 지적한 것은 checkin 이지만 같은 문이다.
    if (w_is_merged_away($db, $acctId)) {
      $db->exec("rollback");
      return array("ok" => false, "reason" => "merged");
    }
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
// reason ∈ already|merged|busy
// 레벨업 풀충전(2026-08-29 사용자 정책): 레벨이 오르면 상한까지 채운다. 레벨당 1회(멱등키),
// 로그인 사용자만(게스트는 XP 자체가 없다). 레벨은 클라 신고를 믿는다 — 레벨 수 × 상한이 남용의
// 천장이라 작고, 'XP 서버 검증'과 같은 §15 과제로 남긴다. 지급 0 이어도 행을 남겨 레벨을 소비한다
// (안 남기면 다 쓴 뒤 같은 레벨로 다시 채울 수 있다).
function w_levelup_fill($db, $acct, $level) {
  $lv = (int)$level;
  if ($lv < 2 || $lv > 9) return array("ok" => false, "granted" => 0, "reason" => "level");
  if ($acct["google_sub"] === null) return array("ok" => false, "granted" => 0, "reason" => "guest");
  $acctId = $acct["id"];
  try { $db->exec("begin immediate"); }
  catch (Throwable $e) { return array("ok" => false, "granted" => 0, "reason" => "busy"); }
  try {
    if (w_is_merged_away($db, $acctId)) { $db->exec("rollback"); return array("ok" => false, "granted" => 0, "reason" => "merged"); }
    $idem = "levelup:" . $acctId . ":" . $lv;
    if (w_ledger_by_idem_any($db, $idem)) { $db->exec("rollback"); return array("ok" => false, "granted" => 0, "reason" => "already"); }
    $bal = w_true_balance($db, $acctId);
    $give = W_CAP - $bal; if ($give < 0) $give = 0;
    $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at) values (?, ?, 'levelup', ?, ?, ?)");
    $st->execute(array($acctId, $give, "lv" . $lv, $idem, w_now()));
    $db->prepare("update accounts set balance = ? where id = ?")->execute(array($bal + $give, $acctId));
    $db->exec("commit");
    return array("ok" => true, "granted" => $give, "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    throw $e;
  }
}

function w_checkin($db, $acct, $today) {
  // 매시간 정시 1회(2026-08-29 사용자 확정). 연속일은 일 단위 유지 — 하루에 한 번이라도 받으면 그날 출석,
  // 7일 연속의 그날 첫 보상에 상자. 상한(W_CAP)이 시간당 +1 의 자연 제한이다.
  $slot = ($today === null) ? w_slot() : w_slot_norm($today);
  $day = substr($slot, 0, 10);
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
    // 지갑을 구글 계정에 넘긴 기기 계정은 더 못 번다. 안 막으면 기기 토큰 하나로 구글
    // 지갑과 나란히 도는 익명 지갑이 매일 1개씩 쌓인다(w_is_merged_away 주석 참고).
    // 쓰기 락 "안"에서 본다 — 병합과 출석이 동시에 들어오면 락 밖 검사는 그 사이로 샌다.
    if (w_is_merged_away($db, $acctId)) {
      $db->exec("rollback");
      return array("ok" => false, "granted" => 0, "capped" => false, "reason" => "merged");
    }
    $lastSlot = w_slot_norm($a["last_checkin"]);
    $lastDay = ($lastSlot === null) ? null : substr($lastSlot, 0, 10);
    if ($lastSlot === $slot) {
      $db->exec("rollback");
      return array("ok" => false, "granted" => 0, "capped" => false, "reason" => "already");
    }
    // 같은 날 두 번째 이후 시간 슬롯: 스트릭 유지·상자 없음. 어제였으면 +1, 끊겼으면 1.
    $sameDay = ($lastDay === $day);
    $streak = $sameDay ? (int)$a["streak_days"]
            : (($lastDay !== null && $lastDay === w_day_add($day, -1)) ? ((int)$a["streak_days"] + 1) : 1);
    if ($streak < 1) $streak = 1;
    $want = W_CHECKIN + ((!$sameDay && $streak % W_CHEST_EVERY === 0) ? W_CHEST : 0);

    $bal = w_true_balance($db, $acctId);
    $room = W_CAP - $bal;
    if ($room < 0) $room = 0;
    $give = ($want > $room) ? $room : $want;
    $capped = ($give < $want);

    if ($give > 0) {
      $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                          values (?, ?, ?, NULL, ?, ?)");
      $st->execute(array($acctId, $give, ($want > W_CHECKIN ? "chest" : "checkin"),
                         "checkin:" . $acctId . ":" . $slot, w_now()));
    }
    // capped 여도 슬롯은 소비한다 — 지갑이 찼을 뿐 출석은 했다. 소비 안 하면
    // 같은 시간에 재시도로 상한 해소를 노려볼 여지가 생긴다.
    $db->prepare("update accounts set balance = ?, streak_days = ?, last_checkin = ? where id = ?")
       ->execute(array($bal + $give, $streak, $slot, $acctId));
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
//
// 시도는 최대 두 번이다(재귀 아님). 첫 시도가 유니크 인덱스 충돌로 깨지면 — 동시 첫 병합의
// 패자다 — 이긴 쪽이 만든 계정을 보고 한 번 더 간다. 시도 횟수를 인자로 노출하지 않는다:
// 4번째 파라미터로 두면 호출자가 w_merge($db, $d, $g, 5) 로 재시도를 조용히 꺼버릴 수 있고,
// 그건 내부 사정이지 호출 계약이 아니다.
function w_merge($db, $deviceId, $googleSub) {
  $fail = function ($reason) {
    return array("ok" => false, "acct" => null, "moved" => false, "discarded" => 0, "reason" => $reason);
  };
  for ($attempt = 0; $attempt < 2; $attempt++) {
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
      // 거절이 유일하게 안전한 답이다(브리프에 없던 갈래).
      if ($dev["google_sub"] !== null && $dev["google_sub"] !== $googleSub) {
        $db->exec("rollback");
        return $fail("device-claimed");
      }

      // 이 기기 계정이 이미 다른 계정으로 흡수됐다면 그 대상이 진짜 지갑이다. 여기서 빈 껍데기를
      // claim 하면 잔액 0 인 계정이 로그인된다(2026-08-28 원장 실측). 대상이 미연결이면 대상을
      // claim 하고, 같은 구글이면 그대로 쓴다. 다른 구글에 묶여 있으면 아래 일반 경로로 간다.
      // 같은 구글이면 아래 일반 경로가 맞다(멱등 원장에서 '버린 수량'까지 되돌려준다) — 여기서는
      // 대상이 **미연결(로그아웃)** 일 때만 대상을 되찾아 claim 한다.
      $tgt = w_is_merged_away($db, $dev["id"]) ? w_merge_target($db, $dev["id"]) : null;
      if ($tgt && $tgt["google_sub"] === null) {
        $db->prepare("update accounts set google_sub = ? where id = ?")->execute(array($googleSub, $tgt["id"]));
        w_ledger_insert($db, $tgt["id"], 0, "merge_claim", $googleSub, "merge:" . $googleSub . ":" . $tgt["id"] . ":reclaim:" . w_now());
        $db->exec("commit");
        $st = $db->prepare("select * from accounts where id = ?");
        $st->execute(array($tgt["id"]));
        return array("ok" => true, "acct" => $st->fetch(), "moved" => true, "discarded" => 0, "reason" => null);
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
      // 아래 catch 의 재시도가 같은 실패를 되풀이할 뿐이므로, 쓰기 전에 먼저 본다.
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
      // 음수로 적어 잔량을 0으로 내린다. 캐시만 0으로 바꾸면 SUM(delta) 와 갈린다.
      //
      // 잔량이 0이어도 이 행을 남긴다. 이 행이 "이 기기 계정은 구글 계정으로 넘어갔다"는
      // 유일한 표식이기 때문이다(w_is_merged_away) — 컬럼을 새로 만들지 않는다. 조건부로
      // 남기면 마침 잔량이 0인 채로 로그인한 기기만 표식 없이 계속 벌 수 있다.
      w_ledger_insert($db, $dev["id"], -$bal, "merge_discard", $googleSub, $key . ":discard");
      // 스트릭도 0으로 내린다. 지갑이 구글 계정으로 옮겨간 뒤에도 여기 스트릭이 남아 있으면
      // "이 기기에서 계속 이어갈 수 있다"로 읽히는데, 이 계정은 이제 출석을 못 한다.
      // 스트릭은 복제가 아니라 이동이다.
      $db->prepare("update accounts set balance = 0, streak_days = 0 where id = ?")->execute(array($dev["id"]));
      // 구글 계정 쪽엔 delta 0 기록만 — 버린 수량과 출처 기기를 ref 에 담는다.
      w_ledger_insert($db, $g["id"], 0, "merge_from", $dev["id"] . ":" . $bal, $key . ":from");

      // 스트릭은 긴 쪽을 취한다. 잔량과 달리 스트릭은 발행량이 아니라 습관의 기록이라
      // 래칫이 되지 않는다(하루에 한 번만 오르고, 기기를 늘려도 총량이 늘지 않는다).
      //
      // 단 streak_days 와 last_checkin 은 한 쌍으로만 움직인다. streak_days 가 크다고
      // last_checkin 이 더 최근이라는 보장이 없기 때문이다 — 오래 전에 길게 쌓고 멈춘 기기가
      // 그 예다. 쌍을 깨고 시계를 뒤로 돌리면 오늘 이미 출석한 계정이 canCheckin=true 로
      // 되살아나고, 그 출석은 checkin:<계정id>:<날짜> 멱등키 충돌로 예외를 던져 그날 내내
      // 500 이 된다(W_IDEM_PREFIX 가 없애려던 바로 그 영구 500 이 다른 문으로 돌아온다).
      // 반대로 streak_days 만 옮기면 죽은 스트릭이 산 시계에 얹혀 7일 상자 주기가 어긋난다.
      // 그래서 "더 길고, 그 스트릭의 시계도 뒤지지 않을 때"만 통째로 옮긴다.
      // NULL(한 번도 출석 안 함)은 ""로 본다 — 어떤 날짜보다도 이르다. 저장 형식이 "Y-m-d"
      // 고정이라 문자열 비교가 곧 날짜 비교다.
      $devLast = ($dev["last_checkin"] === null) ? "" : $dev["last_checkin"];
      $gLast   = ($g["last_checkin"] === null) ? "" : $g["last_checkin"];
      if ((int)$dev["streak_days"] > (int)$g["streak_days"] && $devLast >= $gLast) {
        $db->prepare("update accounts set streak_days = ?, last_checkin = ? where id = ?")
           ->execute(array((int)$dev["streak_days"], $dev["last_checkin"], $g["id"]));
      }
      $db->exec("commit");
      $st = $db->prepare("select * from accounts where id = ?");
      $st->execute(array($g["id"]));
      return array("ok" => true, "acct" => $st->fetch(), "moved" => true, "discarded" => $bal, "reason" => null);
    } catch (Throwable $e) {
      try { $db->exec("rollback"); } catch (Throwable $e2) {}
      // 유니크 인덱스 충돌(동시 첫 병합의 패자) — 이긴 쪽이 만든 계정을 보고 한 번 더 간다.
      // 마지막 시도였으면 루프가 그대로 끝나 아래 error 로 떨어진다.
      $st = $db->prepare("select * from accounts where google_sub = ?");
      $st->execute(array($googleSub));
      if (!$st->fetch()) return $fail("error");
    }
  }
  return $fail("error");
}

// 병합으로 지갑을 구글 계정에 넘긴 기기 계정인가. merge_discard 원장 행이 그 표식이다 —
// 컬럼을 새로 만들지 않는다(원장이 이미 그 사실을 갖고 있다).
//
// 왜 필요한가: 병합은 잔량을 0으로 만들 뿐 계정 행을 지우지 않는다(device_id 가 살아 있고
// 기기 토큰은 365일 유효하다). 이 계정이 계속 출석할 수 있으면, 기기 토큰을 쥔 클라이언트가
// 구글 지갑과 별개로 매일 1개씩 버는 익명 지갑을 하나 더 굴리게 된다 — 기기를 늘릴수록
// 수입원이 늘어난다. 병합이 없애려던 바로 그 구멍이다(리뷰 실측).
// ⚠ "merge_discard 행이 하나라도 있는가"로 물으면 안 된다. 버림은 그 시점의 사실이지
// 영구한 성질이 아니다 — 버림은 google_sub 을 NULL 로 남기므로(그게 이 표식이 필요한
// 이유다) 같은 기기가 나중에 다른 구글로 로그인하면 claim 갈래를 타고 그 행이 다시
// 살아 있는 지갑이 된다. 낡은 표식만 보면 그 계정은 영원히 못 벌고, 더 나쁘게는 전염된다:
// 그 뒤 그 구글 계정으로 합류하는 기기마다 시드를 버리고 죽은 계정에 붙는다(리뷰 실측).
// 그래서 마지막 사건만 센다 — merge_discard 뒤에 merge_claim 이 왔으면 다시 산 지갑이다.
//
// 정렬은 ledger.id 로 한다(INTEGER PRIMARY KEY AUTOINCREMENT — 단조 증가). created_at 은
// 안 된다: 한 병합이 쓰는 여러 행이 같은 w_now() 문자열을 공유해 순서가 갈리지 않는다.
function w_is_merged_away($db, $acctId) {
  $st = $db->prepare("select reason from ledger
                      where account_id = ? and reason in ('merge_discard', 'merge_claim')
                      order by id desc limit 1");
  $st->execute(array($acctId));
  $r = $st->fetch();
  return ($r && $r["reason"] === "merge_discard");
}

// 흡수된 기기 계정이 '어디로' 갔는지 — 원장의 merge_from 을 계정 id 로 따라간다(최신 1건).
// 왜(2026-08-28 실측): 예전엔 merge_discard 의 ref(구글 sub)로 대상 계정을 찾았다. 그 sub 가
// 로그아웃·재로그인으로 바뀌면 못 찾아 게스트로 해석됐고, 폰에서 로그인이 성공한 직후
// wallet_state 가 linked:0 을 돌려줘 바로 풀렸다. 계정 id 는 바뀌지 않는다.
function w_merge_target($db, $acctId) {
  $st = $db->prepare("select account_id from ledger where reason = 'merge_from' and ref like ? order by id desc limit 1");
  $st->execute(array($acctId . ":%"));
  $r = $st->fetch();
  if (!$r) return null;
  $st = $db->prepare("select * from accounts where id = ?");
  $st->execute(array($r["account_id"]));
  $g = $st->fetch();
  return $g ? $g : null;
}

// ── 광고 지급 ─────────────────────────────────────────────────────────────────
define("W_AD_DAILY", 8);          // 계정당 하루 시청 상한

// 상한은 전부 서버 시각·계정 단위다. 기기 단위로 재면 8c 이후 기기를 늘려 상한을 곱할 수 있고,
// 클라이언트 시각으로 재면 시계를 돌려 초기화한다.
// created_at 이 gmdate("c") 로 통일돼 있어(오프셋이 늘 +00:00) 문자열 비교가 곧 시각 비교다.
function w_ad_count_today($db, $acctId) {
  $st = $db->prepare("select count(*) c from ad_grants where account_id = ? and created_at >= ?");
  $st->execute(array($acctId, w_today() . "T00:00:00+00:00"));
  $r = $st->fetch();
  return (int)$r["c"];
}

// AdMob SSV 콜백이 검증을 통과한 뒤의 적립. 서명 검증은 호출부(wallet-ssv.php)의 몫이다 —
// 이 함수는 HTTP 도 서명도 모른다(그래야 웹서버 없이 tests/wallet.test.php 로 돌릴 수 있다).
//
// 거의 모든 거절이 ok:true 인 것이 이 함수의 특이점이다. 구글은 실패 응답을 재시도하므로,
// "적립하지 않기로 한 결정"에 실패를 돌려주면 그 콜백이 영원히 돌아온다. 실패(ok:false)는
// 오직 "지금은 못 했지만 다시 오면 될 일"(락 경합·내부 오류)에만 쓴다.
//
// reason ∈ null|bad-request|no-account|duplicate|merged|daily-cap|busy|error
function w_ad_grant($db, $acctId, $unit, $txId, $amount) {
  $fail = function ($reason) { return array("ok" => true, "granted" => 0, "capped" => false, "reason" => $reason); };
  if (!is_string($txId) || $txId === "") return $fail("bad-request");
  if (!is_string($unit)) $unit = "";

  try { $db->exec("begin immediate"); }
  catch (Throwable $e) { return array("ok" => false, "granted" => 0, "capped" => false, "reason" => "busy"); }

  try {
    $st = $db->prepare("select * from accounts where id = ?");
    $st->execute(array($acctId));
    $a = $st->fetch();
    // 모르는 계정도 ok 로 답한다 — 구글에 실패를 주면 영원히 재시도하고,
    // 응답으로 존재 여부를 구별해 주면 공개 엔드포인트가 계정 열거 도구가 된다.
    if (!$a) { $db->exec("commit"); return $fail("no-account"); }

    // 이미 처리한 콜백인가. 구글은 재시도하므로 중복이 정상이다.
    $st = $db->prepare("select granted from ad_grants where transaction_id = ?");
    $st->execute(array($txId));
    $prev = $st->fetch();
    if ($prev) { $db->exec("commit"); return array("ok" => true, "granted" => (int)$prev["granted"], "capped" => false, "reason" => "duplicate"); }

    // 병합돼 얼어붙은 지갑은 광고로도 되살아나지 않는다(w_spend·w_checkin 과 같은 규율).
    // 쓰기 락 "안"에서 본다 — 병합과 지급이 동시에 들어오면 락 밖 검사는 그 사이로 샌다
    // (tests/wallet-concurrency.sh check5 가 이 한 줄의 위치를 실제 경합으로 지킨다).
    if (w_is_merged_away($db, $acctId)) { $db->exec("commit"); return $fail("merged"); }

    // 상한 검사도 같은 락 안이다 — 밖에서 세면 동시 콜백이 나란히 통과한다(w_create_account
    // 의 IP 상한에서 이미 겪은 check-then-act 다).
    if (w_ad_count_today($db, $acctId) >= W_AD_DAILY) { $db->exec("commit"); return $fail("daily-cap"); }

    // 금액은 구글이 주는 값이지만, 이 함수는 엔드포인트를 우회하는 호출자(관리자 도구·배치)도
    // 상대한다. 받아들이는 모양을 엔드포인트와 똑같이 못박는다: 부호 없는 10진수 정수,
    // 9자리 이하. 그 밖은 전부 0 이다.
    //  - 배열·null·불리언·실수를 (int) 로 캐스팅하면 각각 1·0·1·1.9→1 이 된다(배열이 코인을 만든다)
    //  - 음수는 지급이 아니라 차감이 된다
    //  - 20자리 문자열은 PHP_INT_MAX 로 포화한 뒤 room 에 깎여 '상한까지 충전'이 된다
    // ⚠ is_numeric 만으로는 뒤 두 줄이 막히지 않는다 — 그 형태는 잔량 범위 검사만 하는
    // 테스트를 통과했다(리뷰 실측: 타입 가드를 지워도 관문 340건이 초록이었다).
    $digits = is_int($amount) ? (string)$amount : (is_string($amount) ? $amount : "");
    $want = (ctype_digit($digits) && strlen($digits) <= 9) ? (int)$digits : 0;

    $bal = w_true_balance($db, $acctId);
    $room = W_CAP - $bal;
    if ($room < 0) $room = 0;
    $give = ($want > $room) ? $room : $want;

    if ($give > 0) {
      w_ledger_insert($db, $acctId, $give, "ad", $unit, "ad:" . $txId);
      $db->prepare("update accounts set balance = ? where id = ?")->execute(array($bal + $give, $acctId));
    }
    // 지갑 상한에 걸려 0 을 넣었어도 기록한다 — 안 그러면 상한에 걸린 사용자가 광고를
    // 무한히 본다(w_checkin 의 "capped 여도 출석일은 소비한다"와 같은 판단).
    $st = $db->prepare("insert into ad_grants (transaction_id, account_id, unit, amount, granted, created_at)
                        values (?, ?, ?, ?, ?, ?)");
    $st->execute(array($txId, $acctId, $unit, $want, $give, w_now()));

    $db->exec("commit");
    return array("ok" => true, "granted" => $give, "capped" => ($give < $want), "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    // PK 충돌(동시 같은 transaction_id)의 패자 — 이긴 쪽이 이미 적립했다.
    $st = $db->prepare("select granted from ad_grants where transaction_id = ?");
    $st->execute(array($txId));
    $prev = $st->fetch();
    if ($prev) return array("ok" => true, "granted" => (int)$prev["granted"], "capped" => false, "reason" => "duplicate");
    return array("ok" => false, "granted" => 0, "capped" => false, "reason" => "error");
  }
}

// 실 광고 유닛 ID 는 저장소에 없다 — 넣으면 남이 우리 계정으로 광고를 띄운다.
// 파일이 없으면 광고 기능 전체가 조용히 꺼진다(8c 의 forge_google_oauth.json 과 같은
// 무중단 스위치). 개발은 구글 공개 테스트 유닛 ID 로 한다.
function w_ad_units($dir) {
  $f = $dir . "/ad_units.json";
  if (!is_file($f)) return null;
  $j = json_decode((string)file_get_contents($f), true);
  if (!is_array($j) || !isset($j["quick"]) || !isset($j["full"])) return null;
  foreach (array("quick", "full") as $k) {
    $u = $j[$k];
    if (!is_array($u)) return null;
    if (!isset($u["unitId"]) || !is_string($u["unitId"]) || $u["unitId"] === "") return null;
    // reward 는 지급액이 아니라 표시값이다(실 지급은 SSV 콜백 → w_ad_grant 의 몫이고 이 파일과
    // 무관하다) — 그래도 화면에 그대로 나가는 값이라 모양은 못박는다. 없거나·문자열이거나·
    // 0 이하면 이 파일 전체를 무효로 본다(ads-disabled) — 잘못된 숫자가 화면에 나가는 것보다
    // 광고 줄을 통째로 숨기는 쪽이 안전하다.
    if (!isset($u["reward"]) || !is_int($u["reward"]) || $u["reward"] <= 0) return null;
  }
  return $j;
}

// 표시용 쿨다운일 뿐이다 — 서버는 이 값을 아무 데도 강제하지 않는다. w_ad_grant 는 쓰기 락
// 안에서 daily-cap 만 본다(위 함수). 이 상수가 없던 채로 Task 3 이 끝났던 건 실수가 아니라
// "정의는 됐는데 아무도 안 지키는 상수"가 만드는 거짓 안전감을 피하려던 결정이었다 — nextAt
// 은 화면이 "다음 광고는 언제쯤" 을 보여주는 힌트일 뿐, 변조된 클라이언트는 이 값을 무시하고
// 바로 다시 SSV 콜백을 보낼 수 있다. 그래도 지금 이 함수를 다시 쓰려면(adState) 상수가
// 있어야 하므로 여기서 정의한다 — 여전히 클라이언트 표시용이라는 성격은 그대로다.
define("W_AD_COOLDOWN_SEC", 120);   // 2분. 표시 힌트일 뿐, 강제하지 않는다(위 주석 참고)

// 다음 시청 가능 시각(쿨다운 힌트). 마지막 지급 시각 + W_AD_COOLDOWN_SEC.
function w_ad_next_at($db, $acctId) {
  $st = $db->prepare("select created_at from ad_grants where account_id = ? order by created_at desc limit 1");
  $st->execute(array($acctId));
  $r = $st->fetch();
  if (!$r) return null;
  return gmdate("c", strtotime($r["created_at"]) + W_AD_COOLDOWN_SEC);
}

// adState 가 보여줄 요약. remaining 은 표시용이다 — 실제 지급 여부는 w_ad_grant 의 쓰기 락
// 안에서 다시 결정된다(그래서 이 함수는 클라이언트가 어떻게 부풀려도 지급에 영향을 못 준다).
//
// 병합돼 얼어붙은 계정은 remaining 을 0 으로 report 한다. w_ad_grant 는 이미 merged 계정의
// 콜백을 거절하고 ad_grants 에 기록도 남기지 않는다 — 그러니 "오늘 지급된 횟수"만 세는
// 계산식(W_AD_DAILY - count)은 병합 직후엔 count 가 0이라 여전히 8을 보고한다. 화면이 그 값을
// 믿고 광고 버튼을 켜 두면, 사용자는 광고를 끝까지 보고도 보상을 못 받는 일을 반복한다 —
// checkin·spend 가 이미 지키는 "얼어붙은 지갑은 광고로도 되살아나지 않는다" 규율을 adState
// 표시만 비켜가는 셈이다. nextAt 도 null 이다 — 다시 열릴 시점 자체가 없다.
function w_ad_state($db, $acctId) {
  if (w_is_merged_away($db, $acctId)) return array("remaining" => 0, "nextAt" => null);
  $left = W_AD_DAILY - w_ad_count_today($db, $acctId);
  if ($left < 0) $left = 0;
  return array("remaining" => $left, "nextAt" => w_ad_next_at($db, $acctId));
}

// ── AdMob SSV(서버 사이드 검증) ────────────────────────────────────────────────
// SSV 콜백은 인증이 없는 것이 정상인 공개 GET 엔드포인트다 — 구글이 부른다. 그래서 서명이
// 유일한 방어선이고, 검증이 없거나 범위가 틀리면 누구나 URL 에 reward_amount 를 붙여
// 잔량을 원하는 만큼 만들 수 있다. 아래의 모든 갈래는 '거절'로 닫힌다.

// 키 서버 URL. 테스트가 먼저 정의하면 그 값을, 아니면 환경변수를 쓴다.
//
// ⚠ define() 만으로는 부족하다 — 부모 PHP 프로세스의 상수는 `php -S` 서브프로세스로 넘어가지
// 않는다. 디스패처 하네스(tests/wallet-dispatcher.sh)는 이 파일을 docroot 에 복사해 별도
// 서버로 띄우므로, 상수만 두면 SSV 라우트가 붙는 순간 관문이 **진짜 구글로 요청을 낸다**
// (요청당 최대 10초 정지 + 구글이 떠 있어야 테스트가 도는 은밀한 의존). 환경변수는 자식
// 프로세스까지 따라간다. 이 저장소는 검증 중 실수로 구글에 실제 POST 를 보낸 적이 이미 있다.
if (!defined("W_SSV_KEYS_URL")) {
  $_wSsvUrl = getenv("W_SSV_KEYS_URL");
  define("W_SSV_KEYS_URL",
    ($_wSsvUrl !== false && $_wSsvUrl !== "") ? $_wSsvUrl
      : "https://www.gstatic.com/admob/reward/verifier-keys.json");
  unset($_wSsvUrl);
}
// 타임스탬프 허용 오차. 서명 검증은 바이트만 보므로 여기서는 쓰지 않는다 — 재생 방지는
// 엔드포인트의 몫이다(ad_grants.transaction_id PK + 이 오차).
define("W_SSV_SKEW_SEC", 3600);
// 키 재요청 최소 간격. 증폭 방어의 본체가 이 값이다 — '호출당 1회' 만으로는 초당 1000건의
// 위조 서명이 초당 1000회의 구글 키 서버 요청이 된다. 서명 위조는 공짜라서 공격자가 원하는
// 만큼 낼 수 있고, 그 비용을 우리가 구글에 대한 트래픽으로 대신 내 줄 이유가 없다.
define("W_SSV_REFETCH_MIN_SEC", 300);

// curl 이 없는 PHP 빌드가 있다(실측: 이 저장소의 로컬 테스트 PHP 8.3 에 curl 확장이 없다).
// 없다고 치명적 오류로 죽으면 검증이 예외로 터져 엔드포인트가 500 을 내는데, 그건 구글이
// 재시도하는 실패다 — 못 받아오면 조용히 null 로 닫는다.
//
// curl 은 http(s) 에만 쓴다. 그 밖의 스킴은 스트림 계층으로 보낸다 — 테스트가 끼우는 스트림
// 래퍼가 curl 유무와 무관하게 같은 경로를 타야 한다(curl 있는 머신에서만 관문이 깨지는 함정).
function w_ssv_http_get($url) {
  $isHttp = (stripos($url, "http://") === 0 || stripos($url, "https://") === 0);
  if ($isHttp && function_exists("curl_init")) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10));
    $body = curl_exec($ch);
    curl_close($ch);
    return is_string($body) ? $body : null;
  }
  $ctx = stream_context_create(array("http" => array("timeout" => 10)));
  $body = @file_get_contents($url, false, $ctx);
  return is_string($body) ? $body : null;
}

// 캐시에 든 키만 읽는다 — 네트워크를 절대 타지 않는다. 이 갈래가 따로 있어야 호출부가
// '네트워크가 필요한가'를 알고 그 순간에만 간격 제한을 물을 수 있다.
function w_ssv_cached_keys($dir) {
  $f = $dir . "/ssv_keys_cache.json";
  if (!is_file($f)) return null;
  $j = json_decode((string)file_get_contents($f), true);
  return (is_array($j) && !empty($j["keys"]) && is_array($j["keys"])) ? $j : null;
}

// 시도 표식의 자리. 지갑 디렉토리에 쓸 수 있으면 거기, 아니면 임시 디렉토리로 물러선다.
//
// ⚠ 폴백이 있어야 하는 이유: 배포 후 웹 유저가 데이터 디렉토리에 못 쓰게 되면 표식도 캐시도
// 남길 데가 없어져 간격 제한이 통째로 꺼진다 — 그게 증폭이 가장 심한 바로 그 상황이다.
//
// ⚠ 그런데 '둘 다 본다'로 만들면 안 된다. 임시 디렉토리는 아무나 쓸 수 있으므로,
// /tmp/w_ssv_attempt_<sha1(데이터디렉토리)> 를 만들 수 있는 로컬 프로세스 아무나가 남의
// 키 재요청을 얼릴 수 있게 된다. 기록하는 자리와 읽는 자리가 같은 하나여야 한다.
function w_ssv_attempt_path($dir) {
  if (is_writable($dir)) return $dir . "/ssv_keys_attempt";
  return sys_get_temp_dir() . "/w_ssv_attempt_" . sha1($dir);
}

// 키 서버로 나가기 '직전에' 호출한다. 결과가 아니라 시도를 기록하는 것이 핵심이다 — 아래
// w_ssv_refetch_allowed 주석 참조.
function w_ssv_mark_attempt($dir) {
  $m = w_ssv_attempt_path($dir);
  @touch($m);
  clearstatcache(true, $m);
}

function w_ssv_fresh($path) {
  clearstatcache(true, $path);
  if (!is_file($path)) return false;
  $age = time() - (int)filemtime($path);
  // ⚠ 하한이 반드시 있어야 한다. '간격보다 어리다'만 보면 **미래 날짜** 표식이 영원히
  // 신선해진다 — 시계 되감김, NFS mtime 어긋남, 혹은 파일 하나 만들 수 있는 아무 프로세스가
  // +10년짜리 mtime 을 남기면 키 재요청이 영구히 얼어붙는다. 그러면 구글이 키를 교체하는
  // 순간부터 모든 **진짜** 콜백이 unknown_key → 503 이 되고, 광고를 본 사용자 전원이 보상을
  // 잃는데 원인은 아무 로그에도 안 남는다. 조용하고 전면적인 고장이다.
  return $age >= 0 && $age < W_SSV_REFETCH_MIN_SEC;
}

// 공개키는 파일로 캐시한다. $force 면 다시 받는다 — 구글이 키를 교체하기 때문이다.
// 캐시 파일이 곧 테스트의 주입 지점이다(테스트는 네트워크를 타지 않는다).
// 간격 제한은 여기서 묻지 않는다 — $force 는 '무조건 받아라'라는 뜻이어야 한다. 제한을 거는
// 것은 호출부(w_ssv_verify)의 몫이다.
function w_ssv_keys($dir, $force) {
  if (!$force) {
    $j = w_ssv_cached_keys($dir);
    if ($j !== null) return $j;
  }
  w_ssv_mark_attempt($dir);   // ⚠ 나가기 전에 기록한다. 실패해도 기록은 남아야 한다.
  $body = w_ssv_http_get(W_SSV_KEYS_URL);
  if ($body === null) return null;
  $j = json_decode($body, true);
  if (!is_array($j) || empty($j["keys"]) || !is_array($j["keys"])) return null;
  $f = $dir . "/ssv_keys_cache.json";
  if (@file_put_contents($f, $body) === false) {
    // 조용히 넘기면 캐시가 영원히 안 생겨 매 요청이 키 서버로 나간다(간격 제한이 시도
    // 표식으로 버티긴 하지만, 원인이 로그에 안 남으면 아무도 못 고친다).
    error_log("SSV 키 캐시를 쓸 수 없다 — 매 요청이 키 서버로 나간다: " . $f);
  }
  clearstatcache(true, $f);   // 방금 쓴 mtime 을 아래 재요청 간격 검사가 봐야 한다
  return $j;
}

// 서명 대상은 쿼리 문자열에서 "&signature=" 앞까지다. 그 뒤(signature·key_id, 그리고
// 구글이 나중에 더 붙일 수 있는 것들)는 제외한다.
//
// ⚠ 원본 쿼리 문자열을 그대로 잘라야 한다. $_GET 을 파싱해 다시 조립하면 바이트 순서와
// 인코딩이 사라지는데, 서명이 걸려 있는 것이 정확히 그 둘이다 — 재조립하는 순간 공격자가
// 순서를 바꾸거나 %2D 로 다시 인코딩해도 같은 서명이 통과하게 된다.
function w_ssv_signed_part($query) {
  $i = strpos((string)$query, "&signature=");
  return ($i === false) ? null : substr((string)$query, 0, $i);
}

// 키 서버로 나갈 자격이 있는가. '아니오'가 되는 이유가 둘이고, 둘 다 필요하다.
//
// ⚠ 캐시 파일 mtime 하나만 보면 안 된다(리뷰 실측으로 잡힌 구멍). 캐시 mtime 은 받아오기에
// 성공하고 문서까지 유효해야만 움직인다 — 즉 키 서버가 죽었거나, 응답이 JSON 이 아니거나,
// 캐시 디렉토리에 쓸 수 없는 바로 그때(이 문이 존재하는 유일한 이유) 문이 활짝 열린다.
// 게다가 정상 운영의 기본 상태가 '낡은 캐시'다 — 검증이 잘 되는 동안은 아무도 캐시를 새로
// 쓰지 않기 때문이다. 그래서 gstatic 이 한 번만 깜빡여도 초당 1000건의 위조 콜백이 초당
// 1000~2000회의 외부 요청이 되고, 요청당 최대 10초씩 PHP 워커를 물어 SSV 엔드포인트
// 자체가 자기 자신을 DoS 한다. 그래서 '결과'가 아니라 '시도'를 따로 기록해 그것으로 막는다.
function w_ssv_refetch_allowed($dir) {
  // ① 최근에 나가 봤다 — 성공이든 실패든. 실패까지 세는 것이 이 갈래의 전부다.
  if (w_ssv_fresh(w_ssv_attempt_path($dir))) return false;
  // ② 캐시를 최근에 성공적으로 새로 받았다 — 그러면 지금 실패한 서명은 키가 낡아서가
  //    아니라 그냥 가짜다. 다시 받아 봐야 결과는 같고 키 서버만 두들기게 된다.
  if (w_ssv_fresh($dir . "/ssv_keys_cache.json") && w_ssv_cached_keys($dir) !== null) return false;
  return true;
}

// 서명이 지키는 값과 우리가 읽을 값이 같은가.
//
// parse_str 은 중복 키에서 '마지막이 이긴다'. 그래서 서명 범위 뒤에 같은 키를 한 번 더 붙이면
// 서명은 원본 그대로 유효한데 $params 의 값만 공격자 것이 된다(reward_amount=1 … &reward_amount=999).
// 바이트 검증만 하고 여기서 멈추면 그 문이 그대로 열린다 — 서명된 키는 전부 $params 안에서도
// 같은 값이어야 한다. 서명 뒤에 붙은 '새로운' 키는 막지 않는다(구글이 파라미터를 늘릴 수 있다).
function w_ssv_params_faithful($signed, $params) {
  if (!is_array($params)) return false;
  $sp = array();
  parse_str($signed, $sp);
  foreach ($sp as $k => $v) {
    if (!array_key_exists($k, $params)) return false;
    if ($params[$k] !== $v) return false;
  }
  return true;
}

// $reason 은 왜 거절했는지를 돌려준다. 불리언 하나로는 '위조'와 '지금 확인할 수가 없다'가
// 구분되지 않는데, 그 둘의 처리는 정반대다 — 키 서버 장애 중에는 **진짜** 콜백도 false 가
// 되고, 엔드포인트가 그걸 위조로 보고 영구 거절하면 광고를 본 사용자가 보상을 조용히
// 잃는다(구글에게 다시 보내라고 말할 방법도 없어진다). 엔드포인트는 이 값으로 갈라야 한다:
//
//   "ok"               통과
//   "malformed"        서명·key_id 가 없거나 모양이 틀림 · 서명 범위와 $params 불일치 → 400
//   "bad_signature"    키로 확인했고 서명이 틀림 → 400 (재시도 무의미)
//   "unknown_key"      키 문서는 있는데 key_id 가 없음 → 키 교체 지연일 수 있다 → 503
//   "keys_unavailable" 키를 아예 못 얻음(장애·간격 제한) → 503, 구글이 재시도하게 둔다
function w_ssv_verify($dir, $query, $params, &$reason = null) {
  $reason = "malformed";
  $signed = w_ssv_signed_part($query);
  if ($signed === null) return false;
  if (!is_array($params)) return false;
  // 배열로 넘어올 수 있다(signature[]=x). 문자열이 아닌 걸 strtr 에 넣으면 TypeError 로
  // 터지고, 그건 엔드포인트에서 500 이 된다 — 예외가 아니라 거절로 닫는다.
  if (!isset($params["signature"]) || !is_string($params["signature"]) || $params["signature"] === "") return false;
  if (!isset($params["key_id"]) || !is_string($params["key_id"]) || $params["key_id"] === "") return false;
  if (!w_ssv_params_faithful($signed, $params)) return false;

  // strict 로 푼다 — base64 가 아닌 문자를 조용히 버리지 않게 한다.
  $sig = base64_decode(strtr($params["signature"], "-_", "+/"), true);
  if ($sig === false || $sig === "") return false;

  // 실패하면 키를 새로 받아 한 번만 재시도한다. 무한 재시도로 만들면 서명 위조 시도가
  // 그대로 구글 키 서버에 대한 요청 증폭이 된다.
  //
  // ⚠ 네트워크를 탈 수 있는 갈래는 **전부** 간격 제한을 통과해야 한다 — 0회차도 마찬가지다.
  // 캐시가 없거나 깨져 있으면 0회차부터 밖으로 나가므로, 여기를 안 막으면 캐시가 못 만들어지는
  // 상황에서 요청당 최대 2회가 그대로 나간다(리뷰 실측: 100요청 → 100~200회).
  $sawKeys = false;    // 키 문서를 한 번이라도 손에 넣었나
  $sawKeyId = false;   // key_id 에 맞는 항목을 한 번이라도 봤나
  for ($attempt = 0; $attempt < 2; $attempt++) {
    $j = ($attempt === 0) ? w_ssv_cached_keys($dir) : null;
    if ($j === null) {
      if (!w_ssv_refetch_allowed($dir)) break;
      $j = w_ssv_keys($dir, true);
    }
    if ($j === null) break;
    $sawKeys = true;
    foreach ($j["keys"] as $k) {
      if (!is_array($k) || !isset($k["keyId"]) || !isset($k["pem"])) continue;
      // 배열이 든 항목을 (string) 으로 캐스팅하면 Warning 이 뜬다. 엔드포인트는 이 출력
      // 스트림을 응답과 공유하므로, 진단 문구가 콜백 응답 본문으로 샐 자리를 아예 없앤다.
      if (!is_scalar($k["keyId"]) || !is_string($k["pem"])) continue;
      // key_id 대조를 빼면 등록된 아무 키로나 서명해도 통과한다 — 대조가 '어느 키가
      // 이 콜백을 보증하는가'를 하나로 못박는 자리다.
      if ((string)$k["keyId"] !== $params["key_id"]) continue;
      $sawKeyId = true;
      $pk = openssl_pkey_get_public($k["pem"]);
      if (!$pk) continue;
      if (openssl_verify($signed, $sig, $pk, OPENSSL_ALGO_SHA256) === 1) {
        $reason = "ok";
        return true;
      }
    }
  }
  if (!$sawKeys) $reason = "keys_unavailable";
  elseif (!$sawKeyId) $reason = "unknown_key";
  else $reason = "bad_signature";
  return false;
}
