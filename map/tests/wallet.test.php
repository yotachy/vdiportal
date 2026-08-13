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

t("시각은 UTC 다", function () {
  eq(strlen(w_today()), 10, "w_today 형식이 YYYY-MM-DD 가 아니다");
  eq(w_today(), gmdate("Y-m-d"), "w_today 가 UTC 가 아니다");
  ok(strpos(w_now(), gmdate("Y-m-d")) === 0, "w_now 가 UTC 날짜로 시작하지 않는다");
});

// 로컬은 SQLite 3.45.1 이고 서버는 3.26.0 이다. 아래 셋은 로컬에서 멀쩡히 돌고
// 서버에서만 깨진다 — 그 격차를 테스트가 대신 지킨다. 이 검사는 소스를 읽는다.
t("서버 SQLite 3.26.0 에 없는 기능을 쓰지 않는다", function () {
  $src = file_get_contents(__DIR__ . "/../wallet-lib.php");
  $src = preg_replace('/^\s*\/\/.*$/m', "", $src);   // 주석은 제외 — 설명에 이름이 나온다
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

foreach ($MSGS as $m) { echo $m, "\n"; }
echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
