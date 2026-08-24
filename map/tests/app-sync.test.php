<?php
// 앱 계정 동기화(P8) 단위 테스트 — 병합 규칙·닉네임·계정 해석 3갈래.
// 기대값은 설계 문서(BUILD-PLAN P8·시안 gLogin 동작)에서 직접 — 구현 상수 재사용 금지.
define("W_SEED", 15);
define("W_CAP", 15);
require_once __DIR__ . "/../app-ledger-lib.php";
require_once __DIR__ . "/../wallet-lib.php";
require_once __DIR__ . "/../app-wallet-bridge.php";
require_once __DIR__ . "/../app-sync-lib.php";

$PASS = 0; $FAIL = 0;
function ok($cond, $name) {
  global $PASS, $FAIL;
  if ($cond) { $PASS++; }
  else { $FAIL++; echo "not ok - ", $name, "\n"; }
}

$dir = sys_get_temp_dir() . "/as_test_" . getmypid();
@mkdir($dir, 0700, true);
@unlink($dir . "/app_ledger.db");
@unlink($dir . "/wallet.db");
$db = al_db($dir);
sync_migrate($db);
$NOW = 1756000000;

// ── 병합 규칙 ──
$m = sync_merge_state(null, array("xp" => 10, "picks" => array("NVDA")));
ok($m["xp"] === 10 && $m["picks"] === array("NVDA"), "sync: 최초 푸시 = 그대로");

$server = array("xp" => 50, "personaIdx" => 5, "personaAns" => array(1, 2, 3, 4, 5),
  "sigRead" => array("a" => 1), "picks" => array("TSLA", "AAPL"), "theme" => "dark");
$client = array("xp" => 20, "personaIdx" => 2, "personaAns" => array(1, 2),
  "sigRead" => array("b" => 1), "picks" => array("NVDA", "TSLA"), "theme" => "light");
$m = sync_merge_state($server, $client);
ok($m["xp"] === 50, "sync: xp 는 max(다른 기기에서 더 쌓였으면 유지)");
ok($m["personaIdx"] === 5 && count($m["personaAns"]) === 5, "sync: 페르소나는 더 진행된 쪽");
ok(isset($m["sigRead"]["a"]) && isset($m["sigRead"]["b"]), "sync: 읽음은 합집합");
ok($m["picks"] === array("NVDA", "TSLA", "AAPL"), "sync: 종목 합집합 — 클라 선두 유지");
ok($m["theme"] === "light", "sync: 스칼라 설정은 클라 최신 우선");

$m = sync_merge_state(array("picks" => array("A","B","C","D","E","F","G","H","I","J")),
  array("picks" => array("K","L","M","N")), 12);
ok(count($m["picks"]) === 12, "sync: 종목 합집합 상한 12");

// ── 저장·닉네임 ──
$r1 = sync_put($db, "sub-일", array("xp" => 5), $NOW);
ok(is_string($r1["nick"]) && $r1["nick"] !== "", "sync: 최초 저장 시 닉네임 생성");
$r2 = sync_put($db, "sub-일", array("xp" => 3), $NOW + 10);
ok($r2["nick"] === $r1["nick"], "sync: 닉네임은 재저장에도 불변");
ok($r2["state"]["xp"] === 5, "sync: 서버 보관 xp 가 더 크면 유지(max)");
$r3 = sync_put($db, "sub-이", array(), $NOW);
ok($r3["nick"] !== $r1["nick"], "sync: 닉네임 유일");
$g = sync_get($db, "sub-일");
ok($g && $g["state"]["xp"] === 5, "sync: 읽기 왕복");
ok(sync_delete($db, "sub-일") === 1 && sync_get($db, "sub-일") === null, "sync: 탈퇴 삭제");

// ── 계정 해석 3갈래(app_acct_resolve) ──
$wdb = w_db($dir);
$D1 = "dev_link_one_0000000000000000000000000000000000000000000000000001";
$D2 = "dev_link_two_0000000000000000000000000000000000000000000000000002";
$a1 = app_wallet_acct($wdb, $dir, $D1);
$res = app_acct_resolve($wdb, $dir, $D1);
ok($res["linked"] === false && $res["acct"]["id"] === $a1["id"], "resolve: 게스트 = 기기 계정");

// D1 이 구글로 링크(최초 — claim 갈래)
$m1 = w_merge($wdb, $D1, "gsub-테스트");
ok($m1["ok"] === true && $m1["moved"] === false, "merge: 최초 링크 = 기기 계정에 sub 부여");
$res = app_acct_resolve($wdb, $dir, $D1);
ok($res["linked"] === true && $res["sub"] === "gsub-테스트" && $res["acct"]["id"] === $a1["id"], "resolve: 최초 링크 기기 = 자기 계정");

// D2 가 같은 구글로 로그인 — 잔액이 계정으로 이동하고 기기 계정은 넘어감 표식
$a2 = app_wallet_acct($wdb, $dir, $D2);
$m2 = w_merge($wdb, $D2, "gsub-테스트");
ok($m2["ok"] === true && $m2["moved"] === true && $m2["discarded"] === 15, "merge: 두 번째 기기 잔액 이동(시드 15 폐기·계정 보존)");
$res2 = app_acct_resolve($wdb, $dir, $D2);
ok($res2["linked"] === true && $res2["acct"]["id"] === $a1["id"], "resolve: 병합-이동 기기 → 구글 계정으로 해석");
ok(w_true_balance($wdb, $res2["acct"]["id"]) === 15, "resolve: 두 기기가 같은 잔액을 본다(중복 발행 없음)");

// 탈퇴(구글 해제) 후 D2 는 게스트(빈 계정)로 떨어진다 — 의도된 동작
$wdb->prepare("update accounts set google_sub = null where id = ?")->execute(array($a1["id"]));
$res3 = app_acct_resolve($wdb, $dir, $D2);
ok($res3["linked"] === false && $res3["acct"]["id"] === $a2["id"] && w_true_balance($wdb, $a2["id"]) === 0,
  "resolve: 탈퇴 후 병합-이동 기기는 빈 기기 계정(재발행 없음)");

echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
