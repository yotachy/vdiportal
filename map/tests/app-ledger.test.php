<?php
// 앱 채점 원장 단위 테스트 — wallet.test.php 와 같은 무프레임워크·'ℹ pass N' 형식.
require_once __DIR__ . "/../app-ledger-lib.php";

$PASS = 0; $FAIL = 0;
function ok($cond, $name) {
  global $PASS, $FAIL;
  if ($cond) { $PASS++; }
  else { $FAIL++; echo "not ok - ", $name, "\n"; }
}

$dir = sys_get_temp_dir() . "/al_test_" . getmypid();
@mkdir($dir, 0700, true);
@unlink($dir . "/app_ledger.db");
$db = al_db($dir);

$NOW = 1756000000;   // 고정 시각
$D = "dev_test1";

// ── 등록 규칙 ──
$r = al_register($db, array("device" => $D, "sym" => "NVDA", "tf" => "일", "tier" => "basic",
  "dir" => "up", "base_t" => "2026-08-21", "_now" => $NOW));
ok($r["ok"] === false && $r["error"] === "tier", "기본 분석은 적재 거절");

$r = al_register($db, array("device" => $D, "sym" => "NVDA", "tf" => "일", "tier" => "deep",
  "dir" => "up", "prob" => 65, "anchor" => 100.0, "target" => 110.0, "base_t" => "2026-08-21", "_now" => $NOW));
ok($r["ok"] === true, "심화 등록 성공");

// 같은 날 재등록 = 교체(그날 마지막 1건)
$r = al_register($db, array("device" => $D, "sym" => "NVDA", "tf" => "일", "tier" => "custom",
  "dir" => "down", "prob" => 40, "anchor" => 100.0, "base_t" => "2026-08-21", "_now" => $NOW + 3600));
ok($r["ok"] === true, "같은 날 재등록 성공");
$n = $db->query("select count(*) c from predictions")->fetch();
ok((int)$n["c"] === 1, "같은 종목×주기×일 은 1건만(교체)");
$row = $db->query("select * from predictions")->fetch();
ok($row["tier"] === "custom" && $row["dir"] === "down", "마지막 등록이 남는다");

// ── 채점 규칙 ──
$mk = function ($ts) { $out = array(); foreach ($ts as $t => $c) $out[] = array("t" => $t, "c" => $c); return $out; };

// 다음 봉 없음 → 대기
$r2 = al_score_row($row, $mk(array("2026-08-20" => 99.0, "2026-08-21" => 100.0)), "2026-08-25");
ok($r2 === null, "다음 봉 없으면 대기");
// 다음 봉이 오늘 진행 중(그 뒤 봉 없음·t==오늘 경계) → 대기
$r2 = al_score_row($row, $mk(array("2026-08-21" => 100.0, "2026-08-25" => 97.0)), "2026-08-25");
ok($r2 === null, "진행 중 봉으로는 채점하지 않는다");
// 다음 봉 확정(뒤 봉 존재) → down 예측·하락 마감 = 적중
$r2 = al_score_row($row, $mk(array("2026-08-21" => 100.0, "2026-08-22" => 97.0, "2026-08-25" => 98.0)), "2026-08-25");
ok($r2 !== null && $r2["status"] === "hit" && $r2["settle_t"] === "2026-08-22", "방향 적중(하락)");
// 상승 마감 → 빗나감
$r2 = al_score_row($row, $mk(array("2026-08-21" => 100.0, "2026-08-22" => 103.0, "2026-08-25" => 98.0)), "2026-08-25");
ok($r2 !== null && $r2["status"] === "miss", "방향 빗나감");
// 중립 예측: ±0.5% 미만 = 적중
$rowN = $row; $rowN["dir"] = "neutral";
$r2 = al_score_row($rowN, $mk(array("2026-08-21" => 100.0, "2026-08-22" => 100.3, "2026-08-25" => 98.0)), "2026-08-25");
ok($r2["status"] === "hit", "중립 예측 소변동 적중");
$r2 = al_score_row($rowN, $mk(array("2026-08-21" => 100.0, "2026-08-22" => 103.0, "2026-08-25" => 98.0)), "2026-08-25");
ok($r2["status"] === "miss", "중립 예측 급변 빗나감");

// ── 지연 채점 + 목록 집계 ──
$provider = function ($sym, $tf) use ($mk) {
  return $mk(array("2026-08-21" => 100.0, "2026-08-22" => 97.0, "2026-08-25" => 98.0));
};
$scored = al_score_pending($db, $D, $provider, $NOW + 4 * 86400);
ok($scored === 1, "대기 1건 채점됨");
$L = al_list($db, $D, 50, $NOW + 4 * 86400);
ok($L["ok"] && $L["cnt"]["hit"] === 1 && $L["cnt"]["wait"] === 0, "집계: 적중 1");
ok($L["rows"][0]["today"] === 1, "오늘 채점 플래그");
ok($L["hitRate"] === 100, "적중률 100");
ok($L["rows"][0]["refund_due"] == 1 && $L["rows"][0]["refund_paid"] == 0, "적중 환급 대기(Q1)");

// 환급 소진은 1회만
ok(al_claim_refunds($db, $D) === 1, "환급 청구 1건");
ok(al_claim_refunds($db, $D) === 0, "재청구 0건(멱등)");

// ── 90일 컷(원장 보존·화면 컷) ──
al_register($db, array("device" => $D, "sym" => "AAPL", "tf" => "주", "tier" => "deep",
  "dir" => "up", "anchor" => 50.0, "base_t" => "2026-05-01", "_now" => $NOW - 100 * 86400));
$L = al_list($db, $D, 50, $NOW + 4 * 86400);
ok(count($L["rows"]) === 1, "90일 지난 행은 화면 목록에서 제외");
$n = $db->query("select count(*) c from predictions")->fetch();
ok((int)$n["c"] === 2, "원장 자체는 보존");

// 타 기기 격리
$L2 = al_list($db, "dev_other", 50, $NOW);
ok(count($L2["rows"]) === 0, "기기별 격리");

echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
