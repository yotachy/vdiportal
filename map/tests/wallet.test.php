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

t("balance 캐시가 손상되면 get 이 원장 기준으로 고친다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  $db->exec("update accounts set balance = 999 where id = '" . $a["id"] . "'");
  $a2 = w_get_account($db, "dev-1");
  $st = w_state($db, $a2);
  eq($st["balance"], 5, "원장 기준으로 안 고쳤다");
  $row = $db->query("select balance from accounts where id='" . $a["id"] . "'")->fetch();
  eq((int)$row["balance"], 5, "캐시가 디스크에서도 안 고쳐졌다");
  $db = null; rmrf($d);
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

foreach ($MSGS as $m) { echo $m, "\n"; }
echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
