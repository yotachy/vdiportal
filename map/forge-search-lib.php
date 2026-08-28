<?php
// 스쿱포지 — 종목 검색 필터·정규화(2026-08-28).
// Yahoo Finance 검색(query2 …/v1/finance/search)은 우리가 시세를 못 받는 것들을 섞어 준다:
// 선물(BTC=F) · 해외 중복상장(APC.F·APC.DE·AAPL19.BK) · 지수 · 뮤추얼펀드.
// 그대로 노출하면 사용자가 담은 종목이 차트에서 죽는다 — **우리 프록시가 실제로 받아주는 것만** 남긴다.
// 순수 함수라 HTTP 없이 테스트된다(tests/forge-search.test.php). forge-api.php 가 require 한다.
//
// 범위(사용자 확정 2026-08-28): 미국주식 + 미국 ETF + 암호화폐. 한국주식은 별건 —
// Yahoo 가 한글 검색을 못 하고(실측: '삼성전자' → 0건) 심볼 체계도 다르다(005930.KS vs 005930).

// 우리 프록시(TwelveData→Yahoo)가 시세를 주는 미국 거래소 + 암호화폐 가상 거래소(CCC)
$FS_EXCHANGES = array("NMS", "NYQ", "NGM", "NCM", "PCX", "BTS", "ASE", "NCM", "NYS", "CCC");
$FS_TYPES = array("EQUITY" => "stock", "ETF" => "etf", "CRYPTOCURRENCY" => "coin");

// 앱·PC 는 암호화폐를 슬래시 표기로 쓴다(MASTER: BTC/USD). Yahoo 는 BTC-USD 로 준다.
function fs_norm_symbol($sym, $type) {
  $s = trim((string)$sym);
  if ($type === "CRYPTOCURRENCY" && preg_match('/^([A-Za-z0-9]{2,10})-([A-Za-z]{3,4})$/', $s, $m)) {
    return strtoupper($m[1]) . "/" . strtoupper($m[2]);
  }
  return $s;
}

function fs_accept($q) {
  global $FS_EXCHANGES, $FS_TYPES;
  if (!is_array($q)) return false;
  $s = isset($q["symbol"]) ? trim((string)$q["symbol"]) : "";
  if ($s === "") return false;
  $t = isset($q["quoteType"]) ? (string)$q["quoteType"] : "";
  if (!isset($FS_TYPES[$t])) return false;                       // 주식·ETF·코인만(선물·지수·펀드 제외)
  $ex = isset($q["exchange"]) ? strtoupper((string)$q["exchange"]) : "";
  if (!in_array($ex, $FS_EXCHANGES, true)) return false;         // 미국·암호화폐 외 거래소 제외
  // 프록시가 받아줄 수 있는 형태만(ohlc 경로의 심볼 검증과 같은 문자 집합)
  if (!preg_match('/^[A-Za-z0-9.\-^=\/]{1,16}$/', $s)) return false;
  return true;
}

// Yahoo quotes 배열 → 앱이 쓰는 목록. 필터 + 정규화 + 같은 심볼 중복 제거 + 상한.
function fs_build_items($quotes, $limit) {
  global $FS_TYPES;
  $out = array(); $seen = array();
  if (!is_array($quotes)) return $out;
  $lim = ($limit > 0) ? $limit : 10;
  foreach ($quotes as $q) {
    if (!fs_accept($q)) continue;
    $t = (string)$q["quoteType"];
    $s = fs_norm_symbol($q["symbol"], $t);
    if (isset($seen[$s])) continue;
    $seen[$s] = 1;
    $n = "";
    if (!empty($q["shortname"])) $n = (string)$q["shortname"];
    else if (!empty($q["longname"])) $n = (string)$q["longname"];
    $out[] = array("s" => $s, "n" => $n, "t" => $FS_TYPES[$t]);
    if (count($out) >= $lim) break;
  }
  return $out;
}

// ── 한글 별칭(2026-08-28) ────────────────────────────────────────────────────────
// Yahoo 검색은 한글을 못 한다(실측: '삼성전자'·'테슬라'·'비트코인' 전부 0건). 그런데 한국 사용자는
// 한글로 친다 — 검색이 "제대로 된다"는 말이 성립하려면 이게 있어야 한다.
// 지어내지 않는다: 널리 쓰이는 한글 표기만, 티커·영문명은 실제 상장 정보 그대로.
// 여기 없는 종목은 영문·티커로 찾으면 되고, Yahoo 결과가 뒤에 붙는다.
$FS_ALIAS = array(
  // 미국 대형주
  "테슬라"=>array("TSLA","Tesla, Inc.","stock"),
  "애플"=>array("AAPL","Apple Inc.","stock"),
  "엔비디아"=>array("NVDA","NVIDIA Corporation","stock"),
  "마이크로소프트"=>array("MSFT","Microsoft Corporation","stock"),
  "MS"=>array("MSFT","Microsoft Corporation","stock"),
  "구글"=>array("GOOGL","Alphabet Inc.","stock"),
  "알파벳"=>array("GOOGL","Alphabet Inc.","stock"),
  "아마존"=>array("AMZN","Amazon.com, Inc.","stock"),
  "메타"=>array("META","Meta Platforms, Inc.","stock"),
  "페이스북"=>array("META","Meta Platforms, Inc.","stock"),
  "넷플릭스"=>array("NFLX","Netflix, Inc.","stock"),
  "브로드컴"=>array("AVGO","Broadcom Inc.","stock"),
  "AMD"=>array("AMD","Advanced Micro Devices, Inc.","stock"),
  "인텔"=>array("INTC","Intel Corporation","stock"),
  "퀄컴"=>array("QCOM","QUALCOMM Incorporated","stock"),
  "마이크론"=>array("MU","Micron Technology, Inc.","stock"),
  "TSMC"=>array("TSM","Taiwan Semiconductor Manufacturing","stock"),
  "대만반도체"=>array("TSM","Taiwan Semiconductor Manufacturing","stock"),
  "팔란티어"=>array("PLTR","Palantir Technologies Inc.","stock"),
  "코인베이스"=>array("COIN","Coinbase Global, Inc.","stock"),
  "마이크로스트래티지"=>array("MSTR","MicroStrategy Incorporated","stock"),
  "우버"=>array("UBER","Uber Technologies, Inc.","stock"),
  "에어비앤비"=>array("ABNB","Airbnb, Inc.","stock"),
  "스타벅스"=>array("SBUX","Starbucks Corporation","stock"),
  "맥도날드"=>array("MCD","McDonald's Corporation","stock"),
  "코카콜라"=>array("KO","The Coca-Cola Company","stock"),
  "펩시"=>array("PEP","PepsiCo, Inc.","stock"),
  "나이키"=>array("NKE","NIKE, Inc.","stock"),
  "디즈니"=>array("DIS","The Walt Disney Company","stock"),
  "보잉"=>array("BA","The Boeing Company","stock"),
  "월마트"=>array("WMT","Walmart Inc.","stock"),
  "코스트코"=>array("COST","Costco Wholesale Corporation","stock"),
  "존슨앤존슨"=>array("JNJ","Johnson & Johnson","stock"),
  "화이자"=>array("PFE","Pfizer Inc.","stock"),
  "일라이릴리"=>array("LLY","Eli Lilly and Company","stock"),
  "머크"=>array("MRK","Merck & Co., Inc.","stock"),
  "비자"=>array("V","Visa Inc.","stock"),
  "마스터카드"=>array("MA","Mastercard Incorporated","stock"),
  "페이팔"=>array("PYPL","PayPal Holdings, Inc.","stock"),
  "JP모건"=>array("JPM","JPMorgan Chase & Co.","stock"),
  "골드만삭스"=>array("GS","The Goldman Sachs Group, Inc.","stock"),
  "버크셔"=>array("BRK-B","Berkshire Hathaway Inc.","stock"),
  "엑슨모빌"=>array("XOM","Exxon Mobil Corporation","stock"),
  "쉐브론"=>array("CVX","Chevron Corporation","stock"),
  "포드"=>array("F","Ford Motor Company","stock"),
  "GM"=>array("GM","General Motors Company","stock"),
  "리비안"=>array("RIVN","Rivian Automotive, Inc.","stock"),
  "루시드"=>array("LCID","Lucid Group, Inc.","stock"),
  "오라클"=>array("ORCL","Oracle Corporation","stock"),
  "세일즈포스"=>array("CRM","Salesforce, Inc.","stock"),
  "어도비"=>array("ADBE","Adobe Inc.","stock"),
  "IBM"=>array("IBM","International Business Machines","stock"),
  "시스코"=>array("CSCO","Cisco Systems, Inc.","stock"),
  "텍사스인스트루먼트"=>array("TXN","Texas Instruments Incorporated","stock"),
  "ASML"=>array("ASML","ASML Holding N.V.","stock"),
  "아마존닷컴"=>array("AMZN","Amazon.com, Inc.","stock"),
  // 미국 대표 ETF
  "S&P500"=>array("SPY","SPDR S&P 500 ETF Trust","etf"),
  "에스앤피"=>array("SPY","SPDR S&P 500 ETF Trust","etf"),
  "나스닥"=>array("QQQ","Invesco QQQ Trust","etf"),
  "다우"=>array("DIA","SPDR Dow Jones Industrial Average ETF","etf"),
  "러셀"=>array("IWM","iShares Russell 2000 ETF","etf"),
  // 암호화폐
  "비트코인"=>array("BTC/USD","Bitcoin USD","coin"),
  "이더리움"=>array("ETH/USD","Ethereum USD","coin"),
  "이더"=>array("ETH/USD","Ethereum USD","coin"),
  "리플"=>array("XRP/USD","XRP USD","coin"),
  "엑스알피"=>array("XRP/USD","XRP USD","coin"),
  "솔라나"=>array("SOL/USD","Solana USD","coin"),
  "도지"=>array("DOGE/USD","Dogecoin USD","coin"),
  "도지코인"=>array("DOGE/USD","Dogecoin USD","coin"),
  "에이다"=>array("ADA/USD","Cardano USD","coin"),
  "카르다노"=>array("ADA/USD","Cardano USD","coin"),
  "폴카닷"=>array("DOT/USD","Polkadot USD","coin"),
  "체인링크"=>array("LINK/USD","Chainlink USD","coin"),
  "라이트코인"=>array("LTC/USD","Litecoin USD","coin"),
  "아발란체"=>array("AVAX/USD","Avalanche USD","coin"),
  "시바이누"=>array("SHIB/USD","Shiba Inu USD","coin"),
  "트론"=>array("TRX/USD","TRON USD","coin"),
  "비트코인캐시"=>array("BCH/USD","Bitcoin Cash USD","coin"),
  "스텔라"=>array("XLM/USD","Stellar USD","coin"),
  "유니스왑"=>array("UNI/USD","Uniswap USD","coin"),
  "앱토스"=>array("APT/USD","Aptos USD","coin"),
);

// 한글(또는 별칭) 질의 → 항목. 부분 일치 양방향: 사전 키가 질의를 품거나, 질의가 키를 품거나.
function fs_alias_items($q, $limit) {
  global $FS_ALIAS;
  $s = trim((string)$q);
  if ($s === "") return array();
  $lc = function ($x) { return strtolower($x); };
  $ql = $lc($s);
  $out = array(); $seen = array();
  foreach ($FS_ALIAS as $k => $v) {
    $kl = $lc($k);
    if (strpos($kl, $ql) === false && strpos($ql, $kl) === false) continue;
    if (isset($seen[$v[0]])) continue;
    $seen[$v[0]] = 1;
    $out[] = array("s" => $v[0], "n" => trim($v[1]), "t" => $v[2]);
    if (count($out) >= (($limit > 0) ? $limit : 10)) break;
  }
  return $out;
}

// 별칭 결과를 앞에, Yahoo 결과를 뒤에. 같은 심볼은 앞의 것만 남긴다.
function fs_merge_items($aliasItems, $yahooItems, $limit) {
  $out = array(); $seen = array();
  $lim = ($limit > 0) ? $limit : 10;
  foreach (array($aliasItems, $yahooItems) as $list) {
    if (!is_array($list)) continue;
    foreach ($list as $it) {
      if (!isset($it["s"]) || isset($seen[$it["s"]])) continue;
      $seen[$it["s"]] = 1;
      $out[] = $it;
      if (count($out) >= $lim) return $out;
    }
  }
  return $out;
}

// 질의 정제 — 1글자는 노이즈·비용만 크고 쓸모가 없다. 상한 32자.
// mbstring 에 의존하지 않는다(로컬 PHP 에 없고 cafe24 도 보장 못 한다) — PCRE /u 로 문자 단위 처리.
function fs_clean_query($q) {
  $s = trim((string)$q);
  if ($s === "") return "";
  $chars = preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY);
  if (!is_array($chars)) return "";          // 잘못된 UTF-8
  if (count($chars) < 2) return "";
  if (count($chars) > 32) $s = implode("", array_slice($chars, 0, 32));
  return $s;
}
