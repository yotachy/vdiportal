<?php
// 지갑 원장 단위 테스트. 프레임워크 없이 돌린다 — 이 저장소엔 컴포저가 없다.
// 출력은 node --test 와 같은 'ℹ pass N' / 'ℹ fail N' 형식이다. run.sh 가 그 형식만 읽는다.
require_once __DIR__ . "/../wallet-lib.php";

$PASS = 0; $FAIL = 0; $MSGS = [];
function t($name, $fn) {
  global $PASS, $FAIL, $MSGS;
  try { $fn(); $PASS++; }
  catch (Throwable $e) { $FAIL++; $MSGS[] = "not ok - " . $name . ": " . $e->getMessage(); }
}
function ok($cond, $msg) { if (!$cond) throw new Exception($msg); }
function eq($a, $b, $msg) {
  if ($a !== $b) throw new Exception($msg . " — got " . var_export($a, true) . ", want " . var_export($b, true));
}

// 테스트마다 새 임시 디렉토리. 상태가 새면 순서 의존이 생긴다.
function tmpdir() {
  $d = sys_get_temp_dir() . "/wtest-" . bin2hex(random_bytes(6));
  mkdir($d, 0700, true);
  return $d;
}
function rmrf($d) {
  foreach (glob($d . "/*") as $f) { is_dir($f) ? rmrf($f) : @unlink($f); }
  @rmdir($d);
}

t("스키마가 생성되고 버전이 기록된다", function () {
  $d = tmpdir();
  $db = w_db($d);
  ok(is_file($d . "/wallet.db"), "wallet.db 가 안 생겼다");
  ok(w_schema_version($db) >= 1, "schema_version 이 0 이다");
  $names = [];
  foreach ($db->query("select name from sqlite_master where type='table'") as $r) { $names[] = $r["name"]; }
  foreach (["accounts", "ledger", "runs", "schema_version"] as $want) {
    ok(in_array($want, $names, true), "테이블 없음: " . $want);
  }
  ok(!in_array("ad_grants", $names, true), "ad_grants 는 8d 것이다 — 만들지 않는다");
  $db = null; rmrf($d);
});

t("두 번 열어도 마이그레이션이 다시 돌지 않는다", function () {
  $d = tmpdir();
  $db1 = w_db($d); $v1 = w_schema_version($db1); $db1 = null;
  $db2 = w_db($d); $v2 = w_schema_version($db2);
  eq($v2, $v1, "재실행에서 버전이 움직였다");
  $db2 = null; rmrf($d);
});

t("ledger.idem 은 UNIQUE 다 — DB 층에서 막아야 한다", function () {
  $d = tmpdir(); $db = w_db($d);
  $ins = "insert into ledger (account_id, delta, reason, ref, idem, created_at) values ('a', -3, 'spend', 'AAPL', 'k1', '2026-01-01T00:00:00+00:00')";
  $db->exec($ins);
  $threw = false;
  try { $db->exec($ins); } catch (Throwable $e) { $threw = true; }
  ok($threw, "같은 idem 두 번이 들어갔다 — 이중 과금이 가능해진다");
  $db = null; rmrf($d);
});

t("쓸 수 없는 디렉토리면 예외를 던진다 — 조용히 폴백하지 않는다", function () {
  $threw = false;
  try { w_db("/proc/nonexistent-wallet-dir"); } catch (Throwable $e) { $threw = true; }
  ok($threw, "못 쓰는 경로에서 조용히 성공했다");
});

t("이미 있는 디렉토리가 쓰기 불가면 예외를 던진다 — 웹루트로 폴백하지 않는다", function () {
  // 노출 사고가 난 모양은 "만들 수 없는 경로"가 아니라 "있는데 권한이 틀린 경로"다.
  // w_db 의 두 번째 분기(is_writable)가 그 자리이고, /proc 케이스는 거기까지 못 간다.
  if (function_exists("posix_geteuid") && posix_geteuid() === 0) return;   // root 는 is_writable 이 무의미하다
  $d = tmpdir();
  chmod($d, 0500);
  $threw = false;
  try { w_db($d); } catch (Throwable $e) { $threw = true; }
  chmod($d, 0700);
  rmrf($d);
  ok($threw, "쓰기 불가 디렉토리에서 조용히 성공했다 — 원장이 웹루트로 갈 수 있다");
});

t("시각은 UTC 다", function () {
  eq(strlen(w_today()), 10, "w_today 형식이 YYYY-MM-DD 가 아니다");
  eq(w_today(), gmdate("Y-m-d"), "w_today 가 UTC 가 아니다");
  ok(strpos(w_now(), gmdate("Y-m-d")) === 0, "w_now 가 UTC 날짜로 시작하지 않는다");
});

// 로컬은 SQLite 3.45.1 이고 서버는 3.26.0 이다. 아래 셋은 로컬에서 멀쩡히 돌고
// 서버에서만 깨진다 — 그 격차를 테스트가 대신 지킨다. 이 검사는 소스를 읽는다.
t("서버 SQLite 3.26.0 에 없는 기능을 쓰지 않는다", function () {
  $src = file_get_contents(__DIR__ . "/../wallet-lib.php");
  $src = preg_replace('/\/\*.*?\*\//s', "", $src);   // 블록 주석 — 이 파일 머리가 그 키워드를 설명한다
  $src = preg_replace('/^\s*\/\/.*$/m', "", $src);   // 줄 주석
  // 문자열 이어붙이기로 키워드를 쪼개는 회피는 방어하지 않는다 — 고의가 아니고서야 못 한다.
  // 이 가드의 목적은 실수를 잡는 것이지 의도적 우회를 막는 것이 아니다.
  foreach (array("returning", "strict", "drop column") as $bad) {
    ok(stripos($src, $bad) === false,
       "서버 SQLite 3.26.0 이 모르는 구문: " . $bad . " — 로컬(3.45.1)에서만 돈다");
  }
});

t("금액 상수가 시안 값과 같다", function () {
  $c = w_costs();
  eq($c["full"], 3, "full");
  eq($c["custom"], 5, "custom");
  eq($c["slot"], 1, "slot");
  eq($c["scan"], 2, "scan");
  eq(W_SEED, 5, "SEED"); eq(W_CAP, 20, "CAP");
  eq(W_CHECKIN, 1, "CHECKIN"); eq(W_CHEST, 5, "CHEST"); eq(W_CHEST_EVERY, 7, "CHEST_EVERY");
});

t("새 기기는 계정이 생기고 5개를 받는다 — 원장에도 남는다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  eq($a["balance"], 5, "시드 잔량");
  eq(w_true_balance($db, $a["id"]), 5, "원장 합계");
  $r = $db->query("select reason, delta from ledger where account_id='" . $a["id"] . "'")->fetch();
  eq($r["reason"], "seed", "원장 사유");
  eq((int)$r["delta"], 5, "원장 델타");
  $db = null; rmrf($d);
});

t("같은 device_id 로 두 번 만들면 두 번째는 실패한다 — 시드 재지급 금지", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-1", null);
  $threw = false;
  try { w_create_account($db, "dev-1", null); } catch (Throwable $e) { $threw = true; }
  ok($threw, "같은 기기에 두 번 지급됐다");
  eq(w_true_balance($db, w_account_id("dev-1")), 5, "잔량이 늘었다");
  $db = null; rmrf($d);
});

t("account_id 는 device_id 에서 결정적으로 나온다", function () {
  eq(w_account_id("dev-1"), w_account_id("dev-1"), "같은 입력에 다른 id");
  ok(w_account_id("dev-1") !== w_account_id("dev-2"), "다른 입력에 같은 id");
  eq(strlen(w_account_id("dev-1")), 16, "id 길이");
});

t("balance 캐시가 위로 어긋나면 원장 기준으로 고친다 — 캐시행이 원장 합계와 정확히 같아야 한다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  $db->exec("update accounts set balance = 999 where id = '" . $a["id"] . "'");
  $a2 = w_get_account($db, "dev-1");
  $st = w_state($db, $a2);
  $truth = w_true_balance($db, $a["id"]);
  eq($st["balance"], $truth, "원장 기준으로 안 고쳤다");
  $row = $db->query("select balance from accounts where id='" . $a["id"] . "'")->fetch();
  // 이 케이스가 잡는 것: 위로 어긋난 캐시가 w_state 호출 한 번으로 원장 합계까지
  // 고쳐지고, 그 값이 디스크(캐시행)에도 남는다는 것. 단일 프로세스라 SELECT 와
  // UPDATE 사이에 원장이 바뀌는 상황을 만들 수 없으므로, 두 문장(SELECT 후 UPDATE)
  // 형태와 한 문장(서브쿼리) 형태를 이 어서션은 구분하지 못한다 — 그 원자성은
  // 아래 "한 문장이어야 한다" 소스 검사가 별도로 지킨다.
  eq((int)$row["balance"], $truth, "캐시가 디스크에서도 원장과 안 맞았다");
  $db = null; rmrf($d);
});

t("balance 캐시가 아래로 어긋나도 원장 기준으로 고친다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  $db->exec("update accounts set balance = 1 where id = '" . $a["id"] . "'");   // 원장(5)보다 낮게 손상
  $a2 = w_get_account($db, "dev-1");
  $st = w_state($db, $a2);
  $truth = w_true_balance($db, $a["id"]);
  eq($st["balance"], $truth, "아래로 어긋난 캐시를 원장 기준으로 안 고쳤다");
  $row = $db->query("select balance from accounts where id='" . $a["id"] . "'")->fetch();
  eq((int)$row["balance"], $truth, "캐시행이 디스크에서 원장과 안 맞았다");
  $db = null; rmrf($d);
});

t("w_state 의 캐시 수리는 한 문장이어야 한다 — 행동으로는 관찰할 수 없다", function () {
  // 두 문장(SELECT 후 UPDATE)과 한 문장(서브쿼리)은 그 사이에 다른 트랜잭션이 끼어들 때만
  // 갈린다. 단일 프로세스 하네스에는 끼어들 지점이 없어 어떤 어서션으로도 구분되지 않는다
  // — 실제로 두 문장으로 되돌려도 전 테스트가 통과한다. 그래서 소스 모양으로 지킨다.
  $src = file_get_contents(__DIR__ . "/../wallet-lib.php");
  $src = preg_replace('/\/\*.*?\*\//s', "", $src);
  $src = preg_replace('/^\s*\/\/.*$/m', "", $src);
  $i = strpos($src, "function w_state");
  ok($i !== false, "w_state 를 못 찾았다");
  $body = substr($src, $i);
  $end = strpos($body, "\n}");
  if ($end !== false) $body = substr($body, 0, $end);
  ok(preg_match('/update\s+accounts\s+set\s+balance\s*=\s*\(\s*select/i', $body) === 1,
     "w_state 의 캐시 수리가 서브쿼리 한 문장이 아니다 — 읽기와 쓰기가 갈라지면 그 사이 원장 변경이 캐시에 낡은 값을 새긴다");
  ok(preg_match('/set\s+balance\s*=\s*\?/i', $body) !== 1,
     "w_state 가 미리 읽은 값을 그대로 쓰고 있다(set balance = ?) — 두 문장 형태로 되돌아갔다");
});

t("state 는 클라이언트 계약대로 네 칸을 준다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  $st = w_state($db, $a);
  foreach (["balance", "cap", "streakDays", "canCheckin"] as $k) {
    ok(array_key_exists($k, $st), "state 에 " . $k . " 가 없다");
  }
  eq($st["cap"], W_CAP, "cap");
  eq($st["canCheckin"], true, "새 계정은 출석 가능해야 한다");
  $db = null; rmrf($d);
});

t("IP 해시당 하루 신규 계정이 세어진다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-1", "iphash");
  w_create_account($db, "dev-2", "iphash");
  eq(w_seed_count_today($db, "iphash"), 2, "카운트");
  eq(w_seed_count_today($db, "other"), 0, "다른 IP 는 안 세야 한다");
  $db = null; rmrf($d);
});

function mkacct($db, $dev) { return w_create_account($db, $dev, null); }

t("spend 가 차감하고 원장·권리를 남긴다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_spend($db, $a["id"], "full", "k1", "AAPL", "1.11.0");
  eq($r["ok"], true, "ok");
  eq($r["charged"], true, "charged");
  eq(w_true_balance($db, $a["id"]), 2, "5 - 3");
  ok(w_active_run($db, $a["id"], "AAPL", "full") !== null, "권리가 안 생겼다");
  $db = null; rmrf($d);
});

t("같은 idem 두 번이면 한 번만 수금하고 같은 결과를 재생한다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r1 = w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  $r2 = w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  eq($r2["ok"], true, "두 번째 ok");
  eq($r2["charged"], $r1["charged"], "재생 결과가 다르다");
  eq(w_true_balance($db, $a["id"]), 2, "두 번 수금됐다");
  $n = $db->query("select count(*) c from ledger where idem='k1'")->fetch();
  eq((int)$n["c"], 1, "원장 행이 둘이다");
  $db = null; rmrf($d);
});

t("24h 안 같은 종목은 charged:false 이고 delta 0 행이 남는다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  $r = w_spend($db, $a["id"], "full", "k2", "AAPL", null);
  eq($r["ok"], true, "ok");
  eq($r["charged"], false, "재과금됐다");
  eq(w_true_balance($db, $a["id"]), 2, "잔량이 또 줄었다");
  $row = $db->query("select delta, reason from ledger where idem='k2'")->fetch();
  ok($row !== false, "무료 경로에 원장 행이 없다 — 멱등키가 기록되지 않는다");
  eq((int)$row["delta"], 0, "delta");
  eq($row["reason"], "spend-cached", "reason");
  $db = null; rmrf($d);
});

t("권리가 만료되면 다시 과금한다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  // 5 로는 3 을 두 번 못 낸다 — 만료 재과금을 보려면 잔량을 먼저 채운다.
  // 원장에 직접 넣는다: 이 검사의 대상은 spend 이지 지급 경로가 아니다.
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,5,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], w_now()));
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);      // 10 → 7
  $db->exec("update runs set expiry = '2000-01-01T00:00:00+00:00'");
  $r = w_spend($db, $a["id"], "full", "k2", "AAPL", null);  // 만료 → 재과금 7 → 4
  eq($r["ok"], true, "ok");
  eq($r["charged"], true, "만료 후에도 무료였다");
  eq(w_true_balance($db, $a["id"]), 4, "재과금 후 잔량");
  $db = null; rmrf($d);
});

t("종목이 다르면 별개 권리다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);   // 5 → 2
  // 이 검사의 대상은 "다른 종목은 캐시 적중이 아니다" 이지 잔량 한도가 아니다 —
  // 5 로는 3 을 두 번 못 내므로 두 번째 spend 를 위해 미리 채워 둔다.
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,5,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], w_now()));                 // 2 → 7
  $r = w_spend($db, $a["id"], "full", "k2", "NVDA", null);
  eq($r["charged"], true, "다른 종목이 무료였다");
  $db = null; rmrf($d);
});

t("잔량이 모자라면 롤백하고 원장에 아무 것도 안 남는다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);   // 5 → 2
  $r = w_spend($db, $a["id"], "full", "k2", "NVDA", null);   // 2 < 3
  eq($r["ok"], false, "ok");
  eq($r["reason"], "insufficient", "reason");
  eq(w_true_balance($db, $a["id"]), 2, "잔량이 움직였다");
  $n = $db->query("select count(*) c from ledger where idem='k2'")->fetch();
  eq((int)$n["c"], 0, "실패한 spend 가 원장에 남았다");
  $n = $db->query("select count(*) c from runs where symbol='NVDA'")->fetch();
  eq((int)$n["c"], 0, "실패했는데 권리가 생겼다");
  $db = null; rmrf($d);
});

t("scan·slot 은 권리를 만들지 않는다 — 단순 차감", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_spend($db, $a["id"], "scan", "k1", null, null);
  eq($r["charged"], true, "charged");
  eq(w_true_balance($db, $a["id"]), 3, "5 - 2");
  $n = $db->query("select count(*) c from runs")->fetch();
  eq((int)$n["c"], 0, "scan 이 권리를 만들었다");
  $r2 = w_spend($db, $a["id"], "scan", "k2", null, null);
  eq($r2["charged"], true, "두 번째 스캔이 무료였다 — scan 은 권리가 없다");
  $db = null; rmrf($d);
});

t("모르는 runType 과 빈 idem 은 거절한다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  eq(w_spend($db, $a["id"], "nope", "k1", null, null)["reason"], "unknown-runtype", "runtype");
  eq(w_spend($db, $a["id"], "full", "", "AAPL", null)["reason"], "bad-idem", "idem");
  eq(w_true_balance($db, $a["id"]), 5, "거절인데 잔량이 움직였다");
  $db = null; rmrf($d);
});

t("잔량은 음수가 되지 않는다 — 연속 spend", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  for ($i = 0; $i < 5; $i++) { w_spend($db, $a["id"], "scan", "k" . $i, null, null); }
  ok(w_true_balance($db, $a["id"]) >= 0, "잔량이 음수다");
  $db = null; rmrf($d);
});

// ── 리뷰 1라운드: C1+C2(멱등 재생이 계정·등급·대상을 안 봤다) + I1·I4·I5 ──────────

t("다른 계정의 idem 을 재생할 수 없다 — 계정 범위여야 한다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = mkacct($db, "dev-a"); $b = mkacct($db, "dev-b");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  $r = w_spend($db, $b["id"], "full", "k1", "AAPL", null);
  eq($r["ok"], false, "ok");
  eq($r["reason"], "bad-idem", "reason");
  eq(w_true_balance($db, $b["id"]), 5, "다른 계정 잔량이 움직였다");
  // account_id='b' 전체가 아니라 idem='k1' 로 좁힌다 — 계정 생성 자체가 seed 원장 행을
  // 남기므로 전체 카운트는 항상 1 이상이다. 이 검사가 잡으려는 건 k1 재사용이 b 에
  // 새 행을 만들었는가이다.
  $n = $db->query("select count(*) c from ledger where account_id='" . $b["id"] . "' and idem='k1'")->fetch();
  eq((int)$n["c"], 0, "다른 계정에 k1 원장 행이 생겼다");
  $db = null; rmrf($d);
});

t("같은 idem 이라도 runType 이 다르면 재생이 아니라 거절이다 — 싼 등급 값으로 비싼 등급을 못 받는다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);      // 5 → 2
  $r = w_spend($db, $a["id"], "custom", "k1", "NVDA", null);
  eq($r["ok"], false, "ok");
  eq($r["reason"], "bad-idem", "reason");
  eq(w_true_balance($db, $a["id"]), 2, "잔량이 또 움직였다");
  ok(w_active_run($db, $a["id"], "NVDA", "custom") === null, "거절됐는데 권리가 생겼다");
  $db = null; rmrf($d);
});

t("같은 idem 이라도 ref 가 다르면 재생이 아니라 거절이다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);      // 5 → 2
  $r = w_spend($db, $a["id"], "full", "k1", "NVDA", null);
  eq($r["ok"], false, "ok");
  eq($r["reason"], "bad-idem", "reason");
  eq(w_true_balance($db, $a["id"]), 2, "잔량이 또 움직였다");
  $db = null; rmrf($d);
});

t("시드 idem(seed:<계정id>) 재사용으로 무한 결제를 받을 수 없다 — 실제 익스플로잇", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $seedIdem = "seed:" . $a["id"];   // 클라이언트가 스스로 고른 device_id 에서 오프라인으로 계산 가능
  $r = w_spend($db, $a["id"], "custom", $seedIdem, "AAPL", null);
  eq($r["ok"], false, "ok");
  eq($r["reason"], "bad-idem", "reason");
  eq(w_true_balance($db, $a["id"]), 5, "시드 idem 재생으로 잔량이 움직였다");
  ok(w_active_run($db, $a["id"], "AAPL", "custom") === null, "시드 idem 재생으로 권리가 생겼다");
  $db = null; rmrf($d);
});

t("scan 은 ref 가 있어도 권리를 만들지 않는다 — 등급 자체가 권리가 없다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_spend($db, $a["id"], "scan", "k1", "AAPL", null);
  eq($r["charged"], true, "charged");
  $n = $db->query("select count(*) c from runs")->fetch();
  eq((int)$n["c"], 0, "scan 이 ref 를 받았다고 권리를 만들었다");
  $db = null; rmrf($d);
});

t("slot 은 ref 가 있어도 권리를 만들지 않는다 — 등급 자체가 권리가 없다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_spend($db, $a["id"], "slot", "k1", "AAPL", null);
  eq($r["charged"], true, "charged");
  $n = $db->query("select count(*) c from runs")->fetch();
  eq((int)$n["c"], 0, "slot 이 ref 를 받았다고 권리를 만들었다");
  $db = null; rmrf($d);
});

t("full·custom 은 ref 가 없으면 과금하지 않고 거절한다 — bad-ref", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r1 = w_spend($db, $a["id"], "full", "k1", null, null);
  eq($r1["ok"], false, "ok(null ref)");
  eq($r1["reason"], "bad-ref", "reason(null ref)");
  $r2 = w_spend($db, $a["id"], "custom", "k2", "", null);
  eq($r2["ok"], false, "ok(빈 ref)");
  eq($r2["reason"], "bad-ref", "reason(빈 ref)");
  eq(w_true_balance($db, $a["id"]), 5, "거절인데 잔량이 움직였다");
  $db = null; rmrf($d);
});

// I1: BEGIN IMMEDIATE 를 평범한 BEGIN 으로 되돌려도 25개짜리 스위트는 여전히 초록이다
// (w_state 캐시 수리 때와 같은 모양의 구멍) — 그래서 행동이 아니라 소스 모양으로 지킨다.
// 소스에서 함수 하나의 "본문"을 잘라내는 공용 헬퍼 — w_spend/w_refund/w_checkin 셋 다에 쓴다.
// 어느 함수가 파일의 마지막인지는 상관없다: 다음 최상위 "function " 선언 앞까지를
// 본문으로 본다(중첩 { } 가 많아 첫 "\n}" 로는 못 자르는 함수들이라 이 방식이 필요하다).
function wtest_fn_body($src, $fnName) {
  $i = strpos($src, "function " . $fnName);
  if ($i === false) return false;
  $body = substr($src, $i);
  $end = strpos($body, "\nfunction ", 1);
  return ($end !== false) ? substr($body, 0, $end) : $body;
}
function wtest_source_no_comments() {
  $src = file_get_contents(__DIR__ . "/../wallet-lib.php");
  $src = preg_replace('/\/\*.*?\*\//s', "", $src);
  $src = preg_replace('/^\s*\/\/.*$/m', "", $src);
  return $src;
}

foreach (array("w_spend", "w_refund", "w_checkin") as $fn) {
  t($fn . " 은 begin immediate 로 열어야 한다 — 동시성 보장은 행동으로 관찰되지 않는다", function () use ($fn) {
    $body = wtest_fn_body(wtest_source_no_comments(), $fn);
    ok($body !== false, $fn . " 를 못 찾았다");
    ok(strpos($body, "begin immediate") !== false,
       $fn . " 가 begin immediate 를 쓰지 않는다 — 두 요청이 같은 잔량/출석 상태를 읽고 각자 갱신할 수 있다");
    ok(preg_match('/exec\s*\(\s*["\']begin(?!\s*immediate)/i', $body) !== 1,
       $fn . " 안에 immediate 없는 맨 begin 이 있다");
    ok(strpos($body, "beginTransaction(") === false,
       $fn . " 가 beginTransaction() 을 쓴다 — SQLite 기본 DEFERRED 트랜잭션은 쓰기 락을 먼저 안 잡는다");
  });
}

// I3: w_refund 의 권리 삭제에서 created_at(및 tier) 조건을 통째로 빼도 행동 검사만으로는
// 안 잡힌다 — 삭제가 "더" 되는 실패라 기존 데이터 상태에 우연히 가려질 수 있다. symbol 만
// 남기고 tier·created_at 을 뺀 버전으로 리뷰가 실측: 43개가 그대로 초록이었다. 소스 모양으로 고정한다.
t("w_refund 의 권리 삭제는 symbol·tier·created_at 세 조건을 모두 써야 한다", function () {
  $body = wtest_fn_body(wtest_source_no_comments(), "w_refund");
  ok($body !== false, "w_refund 를 못 찾았다");
  ok(preg_match('/delete\s+from\s+runs\s+where\s+account_id\s*=\s*\?\s+and\s+symbol\s*=\s*\?\s+and\s+tier\s*=\s*\?\s+and\s+created_at\s*=\s*\?/i', $body) === 1,
     "w_refund 의 runs 삭제가 account_id·symbol·tier·created_at 네 조건을 모두 쓰지 않는다 — " .
     "빠지면 같은 계정·같은 종목의 다른 등급/다른 시점 권리까지 같이 지워진다");
});

// ── Task 4: refund · checkin — 스트릭 · 상한 · capped ──────────────────────

t("refund 가 되돌리고 두 번 불러도 한 번만 돌려준다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  eq(w_true_balance($db, $a["id"]), 2, "차감 전제");
  eq(w_refund($db, $a["id"], "k1")["ok"], true, "첫 환급");
  eq(w_true_balance($db, $a["id"]), 5, "환급 후 잔량");
  $r2 = w_refund($db, $a["id"], "k1");
  eq($r2["ok"], false, "두 번째가 성공했다");
  eq($r2["reason"], "already-refunded", "reason");
  eq(w_true_balance($db, $a["id"]), 5, "두 번 환급됐다");
  $db = null; rmrf($d);
});

t("환급은 지갑 상한을 넘겨도 깎지 않는다 — 가져간 것을 돌려주는 것이다", function () {
  // I4: 스펜드 직후(잔량이 상한보다 정확히 3 모자란 상태)에 곧장 환급하면, 상한을 무시하는
  // 구현(min(back, W_CAP-bal))도 room 이 딱 3이라 우연히 3을 그대로 돌려줘 이 테스트를
  // 통과시킨다(리뷰에서 실측: 캡을 심어도 0개 실패). 그래서 환급 "전에" 다시 상한까지
  // 채운다 — room 이 0인 채로 3을 돌려받아야 하므로, 캡을 적용하면 반드시 실패한다.
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,?,'seed',NULL,'topup1',?)")
     ->execute(array($a["id"], W_CAP - W_SEED, w_now()));   // 상한까지 채운다
  eq(w_true_balance($db, $a["id"]), W_CAP, "상한 전제");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);       // W_CAP → W_CAP-3
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,3,'seed',NULL,'topup2',?)")
     ->execute(array($a["id"], w_now()));                    // 다시 상한까지 채운다 — room=0
  eq(w_true_balance($db, $a["id"]), W_CAP, "재충전 후 상한 전제");
  eq(w_refund($db, $a["id"], "k1")["ok"], true, "환급");
  eq(w_true_balance($db, $a["id"]), W_CAP + 3, "환급이 상한으로 깎였다 — 훔친 셈이다");
  $db = null; rmrf($d);
});

t("없는 idem 과 delta 0 행은 환급 대상이 아니다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  eq(w_refund($db, $a["id"], "nope")["reason"], "not-found", "없는 키");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  w_spend($db, $a["id"], "full", "k2", "AAPL", null);   // charged:false, delta 0
  eq(w_refund($db, $a["id"], "k2")["reason"], "nothing-to-refund", "delta 0 을 환급했다");
  $db = null; rmrf($d);
});

// C1: 환급은 '차감'(delta<0)만 되돌려야 한다. 아니면 클라이언트가 계산할 수 있는 지급 키
// (seed:<acctId>, checkin:<acctId>:<day>) 나, 심지어 직전 환급 자신의 보상 행(<idem>:refund)
// 까지 idem 만 맞으면 그대로 받아들여 -delta 를 또 넣어 잔량이 음수로 간다(리뷰에서 실측).
t("시드 지급 행을 환급할 수 없다 — 클라이언트가 계산 가능한 idem 이다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $seedIdem = "seed:" . $a["id"];
  $r = w_refund($db, $a["id"], $seedIdem);
  eq($r["ok"], false, "ok");
  eq($r["reason"], "nothing-to-refund", "reason");
  eq(w_true_balance($db, $a["id"]), 5, "시드 환급으로 잔량이 움직였다");
  $db = null; rmrf($d);
});

t("환급의 보상 행 자체를 또 환급할 수 없다 — 잔량이 음수로 간다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);   // 5 → 2
  w_refund($db, $a["id"], "k1");                         // 2 → 5, 보상 행 idem="k1:refund"
  eq(w_true_balance($db, $a["id"]), 5, "환급 전제");
  $r = w_refund($db, $a["id"], "k1:refund");
  eq($r["ok"], false, "ok");
  eq($r["reason"], "nothing-to-refund", "reason");
  eq(w_true_balance($db, $a["id"]), 5, "환급의 환급으로 잔량이 움직였다 — 음수로 갔어야 했다면 더 심각하다");
  $db = null; rmrf($d);
});

t("환급은 계정 범위다 — 다른 계정 idem 을 환급할 수 없다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = mkacct($db, "dev-a"); $b = mkacct($db, "dev-b");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);   // a: 5 → 2
  $r = w_refund($db, $b["id"], "k1");
  eq($r["ok"], false, "ok");
  eq($r["reason"], "not-found", "reason");
  eq(w_true_balance($db, $b["id"]), 5, "b 잔량이 움직였다");
  eq(w_true_balance($db, $a["id"]), 2, "a 잔량이 환급 없이 움직였다");
  $db = null; rmrf($d);
});

t("환급이 권리도 함께 지운다 — 환급받고 계속 공짜로 보면 안 된다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  ok(w_active_run($db, $a["id"], "AAPL", "full") !== null, "권리가 안 생겼다");
  w_refund($db, $a["id"], "k1");
  ok(w_active_run($db, $a["id"], "AAPL", "full") === null, "환급했는데 권리가 남았다");
  $db = null; rmrf($d);
});

// I2: 같은 계정·같은 종목·같은 순간에 등급이 다른 두 권리(full·custom)가 있으면,
// tier 없이 symbol·created_at 만으로 지우는 삭제는 둘 다 지운다 — full 을 환급했는데
// custom 권리(5를 내고 산 것)까지 사라진다(리뷰에서 실측).
t("같은 종목·같은 순간이라도 다른 등급 권리는 건드리지 않는다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,20,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], w_now()));   // full(3)+custom(5) 를 같은 트랜잭션 순서로 넉넉히
  $now = w_now();
  // w_spend 가 같은 $now 를 ledger·runs 양쪽에 쓰므로, 두 spend 를 "같은 순간"으로
  // 흉내내려면 원장에 직접 같은 created_at 으로 두 쌍(ledger+runs)을 심어야 한다 —
  // w_spend 두 번 호출은 실제로도 $now 문자열이 초 단위로 같을 수 있는 정상 상황이다.
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,run_type,created_at) values (?,-3,'spend','AAPL','kf','full',?)")
     ->execute(array($a["id"], $now));
  $db->prepare("insert into runs (account_id,symbol,tier,engine_version,created_at,expiry) values (?,'AAPL','full',NULL,?,?)")
     ->execute(array($a["id"], $now, gmdate("c", time() + 86400)));
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,run_type,created_at) values (?,-5,'spend','AAPL','kc','custom',?)")
     ->execute(array($a["id"], $now));
  $db->prepare("insert into runs (account_id,symbol,tier,engine_version,created_at,expiry) values (?,'AAPL','custom',NULL,?,?)")
     ->execute(array($a["id"], $now, gmdate("c", time() + 86400)));
  ok(w_active_run($db, $a["id"], "AAPL", "full") !== null, "full 권리 준비 실패");
  ok(w_active_run($db, $a["id"], "AAPL", "custom") !== null, "custom 권리 준비 실패");
  eq(w_refund($db, $a["id"], "kf")["ok"], true, "full 환급");
  ok(w_active_run($db, $a["id"], "AAPL", "full") === null, "환급한 full 권리가 안 지워졌다");
  ok(w_active_run($db, $a["id"], "AAPL", "custom") !== null, "환급 안 한 custom 권리까지 지워졌다");
  $db = null; rmrf($d);
});

t("출석은 하루 한 번이고 스트릭이 오른다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_checkin($db, $a, null);
  eq($r["ok"], true, "첫 출석");
  eq($r["granted"], 1, "지급");
  eq(w_true_balance($db, $a["id"]), 6, "잔량");
  $a2 = w_get_account($db, "dev-1");
  eq((int)$a2["streak_days"], 1, "스트릭");
  eq(w_state($db, $a2)["canCheckin"], false, "같은 날 또 가능하다고 나온다");
  $r2 = w_checkin($db, $a2, null);
  eq($r2["ok"], false, "같은 날 두 번 됐다");
  eq($r2["reason"], "already", "reason");
  eq(w_true_balance($db, $a["id"]), 6, "두 번 지급됐다");
  $db = null; rmrf($d);
});

t("7일 연속이면 상자 +5 가 함께 나온다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $day = "2026-03-01";
  $last = null;
  for ($i = 0; $i < 7; $i++) {
    $acct = w_get_account($db, "dev-1");
    $last = w_checkin($db, $acct, w_day_add($day, $i));
  }
  eq($last["granted"], W_CHECKIN + W_CHEST, "7일차 지급이 상자를 안 포함한다");
  eq((int)w_get_account($db, "dev-1")["streak_days"], 7, "스트릭");
  $db = null; rmrf($d);
});

t("하루 끊기면 스트릭이 1로 돌아간다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_checkin($db, w_get_account($db, "dev-1"), "2026-03-01");
  w_checkin($db, w_get_account($db, "dev-1"), "2026-03-02");
  eq((int)w_get_account($db, "dev-1")["streak_days"], 2, "이틀차");
  w_checkin($db, w_get_account($db, "dev-1"), "2026-03-04");   // 03-03 을 건너뜀
  eq((int)w_get_account($db, "dev-1")["streak_days"], 1, "끊겼는데 이어졌다");
  $db = null; rmrf($d);
});

t("상한 초과분은 버려지고 capped 가 뜬다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,?,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], W_CAP - W_SEED, w_now()));
  $r = w_checkin($db, w_get_account($db, "dev-1"), null);
  eq($r["ok"], true, "ok");
  eq($r["granted"], 0, "상한인데 지급됐다");
  eq($r["capped"], true, "capped 가 안 떴다 — 화면 안내가 조용히 사라진다");
  eq(w_true_balance($db, $a["id"]), W_CAP, "상한을 넘었다");
  $db = null; rmrf($d);
});

t("상한에 걸려도 출석일은 소비된다 — 하루가 지나가야 다시 가능하다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,?,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], W_CAP - W_SEED, w_now()));
  w_checkin($db, w_get_account($db, "dev-1"), null);
  eq(w_get_account($db, "dev-1")["last_checkin"], w_today(), "capped 인데 출석일이 안 남았다");
  $r2 = w_checkin($db, w_get_account($db, "dev-1"), null);
  eq($r2["reason"], "already", "capped 였는데 같은 날 또 됐다");
  $db = null; rmrf($d);
});

foreach ($MSGS as $m) { echo $m, "\n"; }
echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
