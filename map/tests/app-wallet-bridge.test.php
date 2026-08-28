<?php
// 앱 지갑 브리지 테스트 — 가드형 상수 주입으로 wallet-lib 을 앱 정책(시드 15·상한 15·
// deep 2/custom 3)으로 구동. wallet.test.php 형식('ℹ pass N').
define("W_SEED", 15);
define("W_CAP", 15);
define("W_COSTS_JSON", json_encode(array("deep" => 2, "custom" => 3)));
define("W_ENTITLED_JSON", json_encode(array("deep", "custom")));
require_once __DIR__ . "/../wallet-lib.php";
require_once __DIR__ . "/../app-ledger-lib.php";

$PASS = 0; $FAIL = 0;
function ok($cond, $name) {
  global $PASS, $FAIL;
  if ($cond) { $PASS++; }
  else { $FAIL++; echo "not ok - ", $name, "\n"; }
}

$dir = sys_get_temp_dir() . "/awb_test_" . getmypid();
@mkdir($dir, 0700, true);
@unlink($dir . "/wallet.db");
@unlink($dir . "/app_ledger.db");
$w = w_db($dir);
$al = al_db($dir);

// 상수 주입 확인
$c = w_costs();
ok($c["deep"] === 2 && $c["custom"] === 3 && !isset($c["full"]), "비용 오버라이드(deep 2·custom 3)");
ok(w_entitled_types() === array("deep", "custom"), "권리 등급 오버라이드");
ok(W_SEED === 15 && W_CAP === 15, "시드·상한 15");

// 계정 생성(시드 15)
$acct = w_create_account($w, "dev_bridge_1", "iph_test");
ok(w_true_balance($w, $acct["id"]) === 15, "가입 선물 15");

// 심화 차감 2(멱등)
$r = w_spend($w, $acct["id"], "deep", "idem_d1", "NVDA|일", "1.11.0");
ok($r["ok"] === true && w_true_balance($w, $acct["id"]) === 13, "deep 차감 → 13");
$r = w_spend($w, $acct["id"], "deep", "idem_d1", "NVDA|일", "1.11.0");
ok($r["ok"] === true && w_true_balance($w, $acct["id"]) === 13, "같은 idem 재시도 = 무과금(멱등)");

// 커스텀 차감 3 → 환불
$r = w_spend($w, $acct["id"], "custom", "idem_c1", "TSLA|일", "1.11.0");
ok($r["ok"] === true && w_true_balance($w, $acct["id"]) === 10, "custom 차감 → 10");
$r = w_refund($w, $acct["id"], "idem_c1");
ok($r["ok"] === true && w_true_balance($w, $acct["id"]) === 13, "중단 환불 → 13");

// 출석 +1(상한 캡)
$r = w_checkin($w, w_get_account($w, "dev_bridge_1"), "2026-08-24");
ok($r["ok"] === true && $r["granted"] === 1 && w_true_balance($w, $acct["id"]) === 14, "출석 +1 → 14");
$r = w_checkin($w, w_get_account($w, "dev_bridge_1"), "2026-08-24");
ok($r["ok"] === false && $r["reason"] === "already", "같은 날 재출석 거절");

// 잔액 부족
w_spend($w, $acct["id"], "custom", "idem_c2", "A|일", "");
w_spend($w, $acct["id"], "custom", "idem_c3", "B|일", "");
w_spend($w, $acct["id"], "custom", "idem_c4", "C|일", "");
w_spend($w, $acct["id"], "custom", "idem_c5", "D|일", "");
$bal = w_true_balance($w, $acct["id"]);   // 14-12=2
$r = w_spend($w, $acct["id"], "custom", "idem_c6", "E|일", "");
ok($r["ok"] === false && w_true_balance($w, $acct["id"]) === $bal, "부족 시 거절·잔액 불변(" . $bal . ")");

// ── 적중 환급 스위프(app-api 의 app_wallet_sweep_refunds 를 파일 내 동일 로직으로 검증) ──
require_once __DIR__ . "/../app-wallet-bridge.php";
al_register($al, array("device" => "dev_bridge_1", "sym" => "NVDA", "tf" => "일", "tier" => "deep",
  "dir" => "down", "anchor" => 100.0, "base_t" => "2026-08-20", "_now" => 1756000000));
$provider = function ($sym, $tf) {
  return array(array("t" => "2026-08-20", "c" => 100.0), array("t" => "2026-08-21", "c" => 97.0), array("t" => "2026-08-25", "c" => 98.0));
};
al_score_pending($al, "dev_bridge_1", $provider, 1756000000 + 4 * 86400);
$g = app_wallet_sweep_refunds($w, $al, "dev_bridge_1", $acct["id"]);
ok($g === 1 && w_true_balance($w, $acct["id"]) === $bal + 1, "적중 환급 +1 지급");
$g = app_wallet_sweep_refunds($w, $al, "dev_bridge_1", $acct["id"]);
ok($g === 0 && w_true_balance($w, $acct["id"]) === $bal + 1, "환급 재실행 멱등(0)");

// ── 완료·미병합 논스 스위프(2026-08-28) ──
{
  $dev = "sweepdev01";
  $sw = w_db($dir);
  $n1 = w_nonce_make($sw, $dev);                       // ①발급만
  ok(app_nonce_completed($sw, $dev) === null, "sweep: 발급만 된 논스는 잡지 않는다");
  w_nonce_complete($sw, $n1, "sub-sweep-1");           // ②구글 완료
  $c = app_nonce_completed($sw, $dev);
  ok($c && $c["nonce"] === $n1, "sweep: 완료·미병합 논스를 잡는다");
  ok(app_nonce_completed($sw, "otherdev") === null, "sweep: 다른 기기 논스는 안 잡는다");
  w_nonce_burn($sw, $n1);                              // ③병합·소각
  ok(app_nonce_completed($sw, $dev) === null, "sweep: 소각된 논스는 잡지 않는다");
  // 여러 개면 최신 1건
  $a = w_nonce_make($sw, $dev); w_nonce_complete($sw, $a, "sub-a");
  $sw->prepare("update auth_nonce set created_at = ? where nonce = ?")->execute(array(gmdate("c", time() - 100), $a));
  $b = w_nonce_make($sw, $dev); w_nonce_complete($sw, $b, "sub-b");
  ok(app_nonce_completed($sw, $dev)["nonce"] === $b, "sweep: 여러 개면 최신 1건");
}

// ── 흡수된 기기 해석(2026-08-28) — sub 가 바뀌어도 계정 id 로 대상을 따라간다 ──
{
  $rd = w_db($dir);
  w_create_account($rd, "rs-A", "ip"); w_merge($rd, "rs-A", "sub-R1");
  w_create_account($rd, "rs-B", "ip"); w_merge($rd, "rs-B", "sub-R1");   // B → A 흡수
  $A = w_get_account($rd, "rs-A");
  $r1 = app_acct_resolve($rd, $dir, "rs-B", false);
  ok($r1["acct"]["id"] === $A["id"] && $r1["linked"] === true, "resolve: 흡수된 B 는 A 로 해석(연결)");
  // A 가 다른 구글로 갈아탄 뒤(로그아웃 → 재로그인) — 예전엔 옛 sub 로 못 찾아 게스트가 됐다
  $rd->prepare("update accounts set google_sub = ? where id = ?")->execute(array("sub-R2", $A["id"]));
  $r2 = app_acct_resolve($rd, $dir, "rs-B", false);
  ok($r2["acct"]["id"] === $A["id"] && $r2["linked"] === true && $r2["sub"] === "sub-R2", "resolve: sub 가 바뀌어도 A 를 따라간다");
  // A 로그아웃 상태 — 빈 기기 계정(게스트)으로. 탈퇴한 계정 잔액을 흡수 기기가 쓰면 안 된다(재발행 없음).
  // 재로그인하면 w_merge 가 A 를 되찾는다(wallet.test '흡수된 기기 재로그인').
  $rd->prepare("update accounts set google_sub = null where id = ?")->execute(array($A["id"]));
  $r3 = app_acct_resolve($rd, $dir, "rs-B", false);
  $B = w_get_account($rd, "rs-B");
  ok($r3["acct"]["id"] === $B["id"] && $r3["linked"] === false, "resolve: 대상 미연결이면 빈 기기 계정·게스트");
}

echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
