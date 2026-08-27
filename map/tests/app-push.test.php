<?php
// 앱 푸시 등록부·발송로그(Phase 1) 단위 테스트.
// 기대값은 설계서(2026-08-26 §4.3)에서 직접 — 구현 상수 재사용 금지.
require_once __DIR__ . "/../app-push-lib.php";

$PASS = 0; $FAIL = 0;
function ok($cond, $name) {
  global $PASS, $FAIL;
  if ($cond) { $PASS++; }
  else { $FAIL++; echo "not ok - ", $name, "\n"; }
}

$dir = sys_get_temp_dir() . "/ap_test_" . getmypid();
@mkdir($dir, 0700, true);
@unlink($dir . "/app_push.db");
$db = pl_db($dir);
$NOW = 1756000000;   // 고정 시각(Date 의존 제거)

// ── 등록부 ──
pl_register($db, "devA", array("token" => "tokA", "picks" => array("NVDA", "TSLA"), "on" => true), $NOW);
$reg = pl_registry($db);
ok(count($reg) === 1 && $reg[0]["device"] === "devA", "register: 1행 생성");
ok($reg[0]["picks"] === array("NVDA", "TSLA"), "register: 종목 그대로 보관");
ok($reg[0]["token"] === "tokA", "register: 토큰 보관");

pl_register($db, "devA", array("token" => "tokA2", "picks" => array("AAPL"), "on" => true), $NOW + 60);
$reg = pl_registry($db);
ok(count($reg) === 1 && $reg[0]["picks"] === array("AAPL") && $reg[0]["token"] === "tokA2", "register: 같은 기기는 upsert(행 안 늘어남)");

pl_register($db, "devB", array("token" => null, "picks" => array("MSFT"), "on" => true), $NOW);
ok(count(pl_registry($db)) === 2, "register: 토큰 없이도 등록된다(웹·권한 미허용)");

pl_register($db, "devB", array("token" => null, "picks" => array("MSFT"), "on" => false), $NOW + 1);
$reg = pl_registry($db);
ok(count($reg) === 1 && $reg[0]["device"] === "devA", "registry: 알림 끈 기기는 빠진다");

// ── 발송(자격증명 없음 = 큐만) ──
$sends = array(array("device" => "devA", "title" => "오늘 주목할 신호 2건", "body" => "AAPL 갭 상승 3.1%", "data" => array("day" => "2026-08-24")));
$r = pl_send($db, $sends, $NOW, null);
ok($r["queued"] === 1 && $r["sent"] === 0, "send: 자격증명 없으면 발송 안 하고 큐 기록(킬스위치)");

$r2 = pl_send($db, $sends, $NOW + 120, null);
ok($r2["skipped"] === 1 && $r2["queued"] === 0, "send: 같은 날 재실행은 멱등(하루 1회)");

$r3 = pl_send($db, array(array("device" => "devA", "title" => "다음날", "body" => "x", "data" => array("day" => "2026-08-25"))), $NOW + 86400, null);
ok($r3["queued"] === 1, "send: 날이 바뀌면 다시 보낸다");

// ── 실발송 경로(주입된 sender) ──
$calls = array();
$sender = function ($token, $title, $body, $data) use (&$calls) { $calls[] = array($token, $title); return true; };
$r4 = pl_send($db, array(array("device" => "devA", "title" => "T", "body" => "B", "data" => array("day" => "2026-08-26"))), $NOW + 172800, $sender);
ok($r4["sent"] === 1 && count($calls) === 1 && $calls[0][0] === "tokA2", "send: sender 주입 시 해석된 토큰으로 발송");

$r5 = pl_send($db, array(array("device" => "nosuch", "title" => "T", "body" => "B", "data" => array("day" => "2026-08-26"))), $NOW + 172800, $sender);
ok($r5["sent"] === 0, "send: 등록 안 된 기기는 발송하지 않는다");

// ── 게이트 파일 ──
ok(pl_scan_key($dir) === null, "scanKey: 파일 없으면 null(fail-closed)");
file_put_contents($dir . "/app_scan_key.txt", "  s3cret\n");
ok(pl_scan_key($dir) === "s3cret", "scanKey: 공백·개행 제거");
ok(pl_fcm_conf($dir) === null, "fcm: app_fcm.json 없으면 null(푸시 전체 꺼짐)");

echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
