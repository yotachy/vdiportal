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

foreach ($MSGS as $m) { echo $m, "\n"; }
echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
