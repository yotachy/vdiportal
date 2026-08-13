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
define("W_IP_DAILY", 3);          // IP 해시당 하루 신규 계정 지급 상한(재설치 남용 완화)
define("W_RUN_TTL_SEC", 86400);   // Full 권리 24시간

// 서버가 정본이다. 클라이언트의 MSWallet.COSTS 는 미리보기 표시용일 뿐이다.
function w_costs() { return array("full" => 3, "custom" => 5, "slot" => 1, "scan" => 2); }
// 종목별 권리를 갖는 등급. scan·slot 은 단순 차감이라 여기 없다.
function w_entitled_types() { return array("full", "custom"); }

function w_now() { return gmdate("c"); }
function w_today() { return gmdate("Y-m-d"); }
function w_day_add($ymd, $n) { return gmdate("Y-m-d", strtotime($ymd . " UTC") + $n * 86400); }

function w_db($dir) {
  if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
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
}

function w_account_id($deviceId) { return substr(sha1($deviceId), 0, 16); }

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

// 계정 생성과 시드 지급은 한 트랜잭션이다. 갈라지면 잔량 없는 계정이 남는다.
// device_id UNIQUE 가 재지급을 DB 층에서 막는다 — 애플리케이션 검사에 기대지 않는다.
// 실측(8-way 동시 생성, journal_mode=WAL, busy_timeout=5000, 3회 반복): 패자는 매번
// 깨끗한 PDOException(SQLSTATE 23000, "UNIQUE constraint failed") 을 던졌다 — SQLITE_BUSY
// 타임아웃은 한 번도 관찰되지 않았다. Task 5 의 hello 폴백(예외를 잡고 재조회)은 이
// 구분(제약 위반 vs 바쁨-타임아웃)에 기대도 된다.
function w_create_account($db, $deviceId, $ipHash) {
  $id = w_account_id($deviceId);
  $now = w_now();
  $db->beginTransaction();
  try {
    $st = $db->prepare("insert into accounts (id, device_id, balance, streak_days, last_checkin, seed_ip_hash, created_at)
                        values (?, ?, 0, 0, NULL, ?, ?)");
    $st->execute(array($id, $deviceId, $ipHash, $now));
    $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                        values (?, ?, 'seed', NULL, ?, ?)");
    $st->execute(array($id, W_SEED, "seed:" . $id, $now));
    $db->prepare("update accounts set balance = ? where id = ?")->execute(array(W_SEED, $id));
    $db->commit();
  } catch (Throwable $e) {
    $db->rollBack();
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
    // 권리도 되돌린다 — 환급했는데 권리가 남으면 공짜로 계속 본다. symbol·tier·created_at
    // 셋 다 "=" 로 정확히 맞춘다(원래 spend 와 그때 생긴 runs 행이 같은 $now 문자열을
    // 공유하고, run_type 이 곧 runs.tier 다). tier 를 빼면 같은 계정·같은 종목·같은
    // 순간에 다른 등급(예: custom)으로 결제한 별개 권리까지 같이 지워버린다(리뷰에서
    // 실측 — full 환급이 custom 권리를 지웠다). created_at 을 ">=" 로 두면 같은 종목을
    // 나중에 다시 정당하게 결제해 만든 최신 권리까지 같이 지워버린다.
    //
    // run_type 이 NULL 인 행이 있다 — v2 이전(schema v1)에 쓰인 차감이다. 마이그레이션은
    // ledger 에 run_type 컬럼을 "추가"만 하고 기존 행을 소급 채우지 않으므로, v1 시절
    // spend 행은 영원히 run_type=NULL 로 남는다. SQL 에서 "tier = NULL" 은 항상 거짓이라
    // 그냥 tier = ? 로 두면 이 행들은 매칭 0건 — 환급은 되는데 권리는 그대로 남는다(리뷰에서
    // 실측: v1 spend → v2 마이그레이션 → 환급 → 돈은 돌아오고 24시간 열람권은 유지됨).
    // NULL 이면 tier 조건 없이 예전 방식(account_id+symbol+created_at)으로 지운다 — v1
    // 데이터베이스는 등급 구분 코드 자체가 없었으므로 같은 계정·같은 종목·같은 초에 등급이
    // 다른 두 권리가 공존할 수 없다(I2 가 막는 충돌이 애초에 존재하지 않는다).
    if ($orig["run_type"] === null) {
      $db->prepare("delete from runs where account_id = ? and symbol = ? and created_at = ?")
         ->execute(array($acctId, $orig["ref"], $orig["created_at"]));
    } else {
      $db->prepare("delete from runs where account_id = ? and symbol = ? and tier = ? and created_at = ?")
         ->execute(array($acctId, $orig["ref"], $orig["run_type"], $orig["created_at"]));
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
