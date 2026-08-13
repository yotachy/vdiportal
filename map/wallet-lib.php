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
  $db->exec("pragma journal_mode = WAL");
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
