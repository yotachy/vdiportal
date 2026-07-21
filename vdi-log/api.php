<?php
// 정성인연 자산관리 — 공유 데이터 저장 API (연산 기반, 동시 편집 안전)
// 모든 엔드포인트는 헤더 X-Pin(PIN 평문) 필요 — 불일치/미제공 401. 예외는 ?check=1 뿐.
// GET            : 저장된 문서 반환({items,meta,_rev}; 없으면 null)
// GET ?check=1   : X-Pin 이 맞는지 → {"valid":bool} (틀리면 실패 카운트 누적)
// POST {op,...}  : 연산을 서버의 최신 문서에 적용(락)
//   op=replace {doc}        전체 교체(불러오기/초기 시드)
//   op=upsert  {item}       id 기준 항목 추가/수정
//   op=delete  {id}         id 항목 삭제
//   op=reorder {order:[id]} 항목 순서 재배치
//   op=meta    {meta:{...}} meta 일부 병합(sortMode 등)
//   op=setpin  {pin}        PIN 변경(현재 PIN 으로 인증된 상태에서만)
// 응답: {"ok":true,"rev":N}. 매 쓰기마다 _rev 증가 → 클라이언트 폴링이 변경 감지.
//
// PIN 은 같은 폴더 jsiy_pin.txt 에 sha256 해시로 저장(서버 전용, 웹 노출 차단됨).
// 없으면 전면 차단(fail-closed). 무차별 대입 방지: 10분 내 10회 실패 시 10분 잠금.
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Pin");
header("X-Robots-Tag: noindex, nofollow");

$method = $_SERVER["REQUEST_METHOD"];
if ($method === "OPTIONS") { http_response_code(204); exit; }

$f  = __DIR__ . "/jsiy_data.json";
$pf = __DIR__ . "/jsiy_pin.txt";        // sha256(PIN)
$ff = __DIR__ . "/jsiy_pinfail.json";   // 실패 카운터(무차별 대입 방지)
$PIN_HASH = is_file($pf) ? trim(file_get_contents($pf)) : "";

function throttled($ff) {
  $s = is_file($ff) ? json_decode(file_get_contents($ff), true) : null;
  return is_array($s) && intval(isset($s["until"]) ? $s["until"] : 0) > time();
}
function note_fail($ff) {
  $now = time();
  $s = is_file($ff) ? json_decode(file_get_contents($ff), true) : null;
  if (!is_array($s) || ($now - intval(isset($s["first"]) ? $s["first"] : 0)) > 600) $s = ["n"=>0, "first"=>$now, "until"=>0];
  $s["n"] = intval($s["n"]) + 1;
  if ($s["n"] >= 10) { $s["until"] = $now + 600; }   // 10분 잠금
  @file_put_contents($ff, json_encode($s));
}
function pin_ok($hash) {
  if ($hash === "") return false;   // PIN 미설정 = 전면 차단
  $p = isset($_SERVER["HTTP_X_PIN"]) ? $_SERVER["HTTP_X_PIN"] : "";
  return $p !== "" && hash_equals($hash, hash("sha256", $p));
}
function jout($a){ header("Content-Type: application/json; charset=utf-8"); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }
function yquote($sym){  // Yahoo Finance 현재가 조회
  $url="https://query1.finance.yahoo.com/v8/finance/chart/".rawurlencode($sym)."?range=1d&interval=1d";
  $ctx=stream_context_create(["http"=>["timeout"=>7,"header"=>"User-Agent: Mozilla/5.0\r\n"],"ssl"=>["verify_peer"=>false,"verify_peer_name"=>false]]);
  $raw=@file_get_contents($url,false,$ctx);
  if($raw===false && function_exists("curl_init")){ $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>1,CURLOPT_TIMEOUT=>7,CURLOPT_SSL_VERIFYPEER=>false,CURLOPT_USERAGENT=>"Mozilla/5.0"]); $raw=curl_exec($ch); curl_close($ch); }
  if($raw===false) return null;
  $j=json_decode($raw,true); $m=isset($j["chart"]["result"][0]["meta"])?$j["chart"]["result"][0]["meta"]:null;
  if(!$m||!isset($m["regularMarketPrice"])) return null;
  return ["price"=>$m["regularMarketPrice"],"cur"=>isset($m["currency"])?$m["currency"]:null];
}

// ---- PIN 인증(모든 엔드포인트 공통) ----
if (throttled($ff)) { http_response_code(429); jout(["ok"=>false,"error"=>"throttle"]); }
$AUTH = pin_ok($PIN_HASH);
if ($method === "GET" && isset($_GET["check"])) {   // PIN 확인 전용 — 여기서만 미인증 접근 허용
  if (!$AUTH) note_fail($ff); else @unlink($ff);    // 성공 시 실패 카운터 초기화
  header("Content-Type: application/json; charset=utf-8");
  header("Cache-Control: no-store");
  echo json_encode(["valid" => $AUTH]); exit;
}
if (!$AUTH) { http_response_code(401); jout(["ok"=>false,"error"=>"pin"]); }

if ($method === "GET") {
  header("Content-Type: application/json; charset=utf-8");
  header("Cache-Control: no-store");
  if (isset($_GET["rate"])) {  // USD/KRW 실시간 환율(30분 캐시, 데이터와 무관한 캐시파일)
    $rf = __DIR__ . "/jsiy_rate.json"; $now = time();
    $cached = is_file($rf) ? json_decode(file_get_contents($rf), true) : null;
    if (is_array($cached) && isset($cached["rate"]) && ($now - intval($cached["ts"] ?? 0) < 1800)) { echo json_encode($cached); exit; }
    $url = "https://open.er-api.com/v6/latest/USD";
    $ctx = stream_context_create(["http"=>["timeout"=>6],"ssl"=>["verify_peer"=>false,"verify_peer_name"=>false]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false && function_exists("curl_init")) { $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>1,CURLOPT_TIMEOUT=>6,CURLOPT_SSL_VERIFYPEER=>false]); $raw=curl_exec($ch); curl_close($ch); }
    $krw = null; if ($raw !== false) { $j = json_decode($raw, true); $krw = isset($j["rates"]["KRW"]) ? $j["rates"]["KRW"] : null; }
    if ($krw) { $out = ["rate"=>round($krw,2),"ts"=>$now]; @file_put_contents($rf, json_encode($out)); echo json_encode($out); }
    else if ($cached) { echo json_encode($cached); }            // 실패 시 오래된 캐시라도 반환
    else { echo json_encode(["rate"=>1380,"ts"=>0,"fallback"=>true]); }
    exit;
  }
  if (isset($_GET["quote"])) {  // 종목 현재가(Yahoo, 60초 캐시). 데이터와 무관한 캐시파일
    $sym = trim($_GET["quote"]); $market = isset($_GET["market"]) ? $_GET["market"] : "";
    if ($sym === "") { echo json_encode(["ok"=>false,"error"=>"empty"]); exit; }
    $qf = __DIR__ . "/jsiy_quote.json"; $now = time();
    $cache = is_file($qf) ? json_decode(file_get_contents($qf), true) : [];
    if (!is_array($cache)) $cache = [];
    $key = $market . ":" . strtoupper($sym);
    if (isset($cache[$key]) && ($now - intval($cache[$key]["ts"] ?? 0) < 60)) { echo json_encode(array_merge(["ok"=>true], $cache[$key])); exit; }
    $up = strtoupper($sym); $cands = [];
    if (strpos($sym, ".") !== false || strpos($sym, "-") !== false) $cands = [$sym];
    elseif ($market === "crypto") $cands = [$up . "-USD"];
    elseif ($market === "kr") $cands = [$sym . ".KS", $sym . ".KQ"];
    else $cands = [$up];
    $res = null;
    foreach ($cands as $cd) { $r = yquote($cd); if ($r && $r["price"] !== null) { $res = ["price"=>$r["price"],"cur"=>$r["cur"],"symbol"=>$cd,"ts"=>$now]; break; } }
    if ($res) { $cache[$key] = $res; @file_put_contents($qf, json_encode($cache)); echo json_encode(array_merge(["ok"=>true], $res)); }
    else echo json_encode(["ok"=>false,"error"=>"notfound"]);
    exit;
  }
  if (is_file($f)) { readfile($f); } else { echo "null"; }
  exit;
}

if ($method !== "POST") { http_response_code(405); jout(["ok"=>false,"error"=>"method"]); }

// ---- POST: 연산 적용 ----
$d = json_decode(file_get_contents("php://input"), true);
if (!is_array($d) || !isset($d["op"])) { http_response_code(400); jout(["ok"=>false,"error"=>"noop"]); }
$op = $d["op"];

if ($op === "setpin") {   // PIN 변경 — 문서를 건드리지 않으므로 락 이전에 처리
  $np = isset($d["pin"]) ? trim((string)$d["pin"]) : "";
  if (!preg_match('/^\d{4,8}$/', $np)) { http_response_code(400); jout(["ok"=>false,"error"=>"badpin"]); }
  if (@file_put_contents($pf, hash("sha256", $np)) === false) { http_response_code(500); jout(["ok"=>false,"error"=>"write"]); }
  jout(["ok"=>true, "pinchanged"=>true]);
}

$lock = fopen($f . ".lock", "c");
if ($lock) { flock($lock, LOCK_EX); }

$doc = ["items"=>[], "meta"=>["title"=>"정성인연 자산 현황"], "_rev"=>0];
if (is_file($f)) {
  $cur = json_decode(file_get_contents($f), true);
  if (is_array($cur) && isset($cur["items"]) && is_array($cur["items"])) $doc = $cur;
}
if (!isset($doc["meta"]) || !is_array($doc["meta"])) $doc["meta"] = [];

$err = "";
if ($op === "replace") {
  $nd = isset($d["doc"]) ? $d["doc"] : null;
  if (!is_array($nd) || !isset($nd["items"]) || !is_array($nd["items"])) $err = "invalid";
  else { $doc["items"] = $nd["items"]; $doc["meta"] = isset($nd["meta"]) && is_array($nd["meta"]) ? $nd["meta"] : []; }
} elseif ($op === "upsert" || $op === "upsertAfter") {
  $it = isset($d["item"]) ? $d["item"] : null;
  if (!is_array($it) || !isset($it["id"])) $err = "invalid";
  else {
    $found = false;
    foreach ($doc["items"] as $i => $x) { if (isset($x["id"]) && $x["id"] === $it["id"]) { $doc["items"][$i] = $it; $found = true; break; } }
    if (!$found) {
      $pos = -1;
      if ($op === "upsertAfter" && isset($d["afterId"])) {
        foreach ($doc["items"] as $i => $x) { if (isset($x["id"]) && $x["id"] === $d["afterId"]) { $pos = $i + 1; break; } }
      }
      if ($pos >= 0) array_splice($doc["items"], $pos, 0, [$it]);  // 원본 바로 뒤에 삽입(복제)
      else $doc["items"][] = $it;
    }
  }
} elseif ($op === "delete") {
  $id = isset($d["id"]) ? $d["id"] : null;
  if ($id === null) $err = "invalid";
  else $doc["items"] = array_values(array_filter($doc["items"], function($x) use ($id){ return !(isset($x["id"]) && $x["id"] === $id); }));
} elseif ($op === "reorder") {
  $order = isset($d["order"]) && is_array($d["order"]) ? $d["order"] : null;
  if ($order === null) $err = "invalid";
  else {
    $map = [];
    foreach ($doc["items"] as $x) { if (isset($x["id"])) $map[$x["id"]] = $x; }
    $new = [];
    foreach ($order as $id) { if (isset($map[$id])) { $new[] = $map[$id]; unset($map[$id]); } }
    foreach ($map as $x) { $new[] = $x; }  // 목록에 없던 항목은 뒤에 보존
    $doc["items"] = $new;
  }
} elseif ($op === "meta") {
  $m = isset($d["meta"]) && is_array($d["meta"]) ? $d["meta"] : [];
  foreach ($m as $k => $v) { $doc["meta"][$k] = $v; }
} elseif ($op === "bulkInclude") {
  $ids = isset($d["ids"]) && is_array($d["ids"]) ? $d["ids"] : null;
  if ($ids === null) $err = "invalid";
  else { $set = array_flip($ids); $inc = !empty($d["include"]); foreach ($doc["items"] as $i => $x) { if (isset($x["id"]) && isset($set[$x["id"]])) $doc["items"][$i]["include"] = $inc; } }
} else {
  $err = "badop";
}

if ($err !== "") { if ($lock){flock($lock,LOCK_UN);fclose($lock);} http_response_code(400); jout(["ok"=>false,"error"=>$err]); }

$doc["_rev"] = (isset($doc["_rev"]) ? intval($doc["_rev"]) : 0) + 1;
$tmp = $f . ".tmp." . getmypid();
$okw = file_put_contents($tmp, json_encode($doc, JSON_UNESCAPED_UNICODE)) !== false && rename($tmp, $f);
if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
if (!$okw) { http_response_code(500); jout(["ok"=>false,"error"=>"write"]); }
jout(["ok"=>true, "rev"=>$doc["_rev"]]);
