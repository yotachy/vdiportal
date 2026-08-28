<?php
// 종목 검색 필터·정규화 단위 테스트(2026-08-28).
// 기대값은 Yahoo 실측 응답에서 직접 뽑았다(구현 상수 재사용 금지):
//   bitcoin → BTC-USD(CCC) · BTC=F(CME 선물) · GBTC(PCX ETF)
//   apple   → AAPL(NMS) · APC.F(FRA) · APC.DE(GER) · AAPL19.BK(SET) · APLE(NYQ)
//   005930  → 005930.KS(KSC)
require_once __DIR__ . "/../forge-search-lib.php";

$PASS = 0; $FAIL = 0;
function ok($cond, $name) {
  global $PASS, $FAIL;
  if ($cond) { $PASS++; }
  else { $FAIL++; echo "not ok - ", $name, "\n"; }
}

// ── 심볼 정규화 ──
ok(fs_norm_symbol("BTC-USD", "CRYPTOCURRENCY") === "BTC/USD", "정규화: 암호화폐는 슬래시 표기(앱 MASTER 와 통일)");
ok(fs_norm_symbol("ETH-USD", "CRYPTOCURRENCY") === "ETH/USD", "정규화: ETH 도 동일");
ok(fs_norm_symbol("AAPL", "EQUITY") === "AAPL", "정규화: 주식은 그대로");
ok(fs_norm_symbol("GBTC", "ETF") === "GBTC", "정규화: ETF 는 그대로");

// ── 항목 채택 판정 ──
ok(fs_accept(array("symbol"=>"AAPL","quoteType"=>"EQUITY","exchange"=>"NMS")) === true, "채택: 미국주식");
ok(fs_accept(array("symbol"=>"GBTC","quoteType"=>"ETF","exchange"=>"PCX")) === true, "채택: 미국 ETF");
ok(fs_accept(array("symbol"=>"BTC-USD","quoteType"=>"CRYPTOCURRENCY","exchange"=>"CCC")) === true, "채택: 암호화폐");
ok(fs_accept(array("symbol"=>"BTC=F","quoteType"=>"FUTURE","exchange"=>"CME")) === false, "제외: 선물");
ok(fs_accept(array("symbol"=>"APC.F","quoteType"=>"EQUITY","exchange"=>"FRA")) === false, "제외: 프랑크푸르트 중복상장");
ok(fs_accept(array("symbol"=>"APC.DE","quoteType"=>"EQUITY","exchange"=>"GER")) === false, "제외: 독일 중복상장");
ok(fs_accept(array("symbol"=>"AAPL19.BK","quoteType"=>"EQUITY","exchange"=>"SET")) === false, "제외: 태국 DR");
ok(fs_accept(array("symbol"=>"005930.KS","quoteType"=>"EQUITY","exchange"=>"KSC")) === false, "제외: 한국주식(이번 범위 밖 — 프록시 심볼 체계가 다르다)");
ok(fs_accept(array("symbol"=>"^GSPC","quoteType"=>"INDEX","exchange"=>"SNP")) === false, "제외: 지수");
ok(fs_accept(array("symbol"=>"","quoteType"=>"EQUITY","exchange"=>"NMS")) === false, "제외: 빈 심볼");
ok(fs_accept(array("symbol"=>"AAA BBB","quoteType"=>"EQUITY","exchange"=>"NMS")) === false, "제외: 프록시가 못 받는 문자");

// ── 목록 변환(필터 + 정규화 + 중복 제거 + 상한) ──
$raw = array(
  array("symbol"=>"BTC-USD","quoteType"=>"CRYPTOCURRENCY","exchange"=>"CCC","shortname"=>"Bitcoin USD"),
  array("symbol"=>"BCH-USD","quoteType"=>"CRYPTOCURRENCY","exchange"=>"CCC","shortname"=>"Bitcoin Cash USD"),
  array("symbol"=>"BTC=F","quoteType"=>"FUTURE","exchange"=>"CME","shortname"=>"Bitcoin Futures"),
  array("symbol"=>"GBTC","quoteType"=>"ETF","exchange"=>"PCX","longname"=>"Grayscale Bitcoin Trust"),
);
$items = fs_build_items($raw, 10);
ok(count($items) === 3, "목록: 선물만 빠지고 3건");
ok($items[0]["s"] === "BTC/USD" && $items[0]["t"] === "coin", "목록: 첫 항목 정규화·유형");
ok($items[2]["s"] === "GBTC" && $items[2]["t"] === "etf", "목록: ETF 유형");
ok($items[0]["n"] === "Bitcoin USD", "목록: shortname 우선");
ok($items[2]["n"] === "Grayscale Bitcoin Trust", "목록: shortname 없으면 longname");

$dup = array(
  array("symbol"=>"AAPL","quoteType"=>"EQUITY","exchange"=>"NMS","shortname"=>"Apple Inc."),
  array("symbol"=>"AAPL","quoteType"=>"EQUITY","exchange"=>"NYQ","shortname"=>"Apple Inc. dup"),
);
ok(count(fs_build_items($dup, 10)) === 1, "목록: 같은 심볼 중복 제거");

$many = array();
for ($i = 0; $i < 20; $i++) $many[] = array("symbol"=>"S".$i,"quoteType"=>"EQUITY","exchange"=>"NMS","shortname"=>"n".$i);
ok(count(fs_build_items($many, 10)) === 10, "목록: 상한 10건");
ok(fs_build_items(null, 10) === array(), "목록: 입력 없음이면 빈 배열");

// ── 질의 정제 ──
ok(fs_clean_query("  bitcoin  ") === "bitcoin", "질의: 공백 제거");
ok(fs_clean_query("ap") === "ap", "질의: 2글자 허용");
ok(fs_clean_query("a") === "", "질의: 1글자는 거절(노이즈·비용)");
ok(fs_clean_query(str_repeat("x", 40)) === str_repeat("x", 32), "질의: 32자 상한");

echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
