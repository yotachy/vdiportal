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
