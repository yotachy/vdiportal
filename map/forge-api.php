<?php
// 스쿱포지 — 전략 문서 저장 API (연산 기반, 동시 편집 안전). map/api.php 미러.
// doc = {documents:[{id,title,themeImgId,nodes,edges,view,updated}], meta:{library,activeId}, _rev:N}
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Write-Key");

$method = $_SERVER["REQUEST_METHOD"];
if ($method === "OPTIONS") { http_response_code(204); exit; }

$f  = __DIR__ . "/forge_data.json";
$kf = __DIR__ . "/forge_key.txt";
$WRITE_KEY = is_file($kf) ? trim(file_get_contents($kf)) : "";

function check_key($wk) {
  if ($wk === "") return true;
  $k = isset($_SERVER["HTTP_X_WRITE_KEY"]) ? $_SERVER["HTTP_X_WRITE_KEY"] : "";
  return hash_equals($wk, $k);
}
function jout($a){ header("Content-Type: application/json; charset=utf-8"); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }

if ($method === "GET") {
  header("Content-Type: application/json; charset=utf-8");
  header("Cache-Control: no-store");
  if (isset($_GET["check"])) { echo json_encode(["valid" => check_key($WRITE_KEY)]); exit; }
  if (isset($_GET["images"])) {
    $imgf = __DIR__ . "/forge_images.json";
    if (is_file($imgf)) { readfile($imgf); } else { echo "{}"; }
    exit;
  }
  if (isset($_GET["jobs"])) {
    $jf = __DIR__ . "/forge_jobs.json";
    $jdoc = is_file($jf) ? json_decode(file_get_contents($jf), true) : null;
    if (!is_array($jdoc) || !isset($jdoc["jobs"]) || !is_array($jdoc["jobs"])) $jdoc = ["jobs"=>[]];
    $list = $jdoc["jobs"];
    $docId = isset($_GET["docId"]) ? $_GET["docId"] : null;
    if ($docId !== null) $list = array_values(array_filter($list, function($j) use ($docId){ return isset($j["docId"]) && $j["docId"] === $docId; }));
    echo json_encode(["ok"=>true, "jobs"=>$list], JSON_UNESCAPED_UNICODE);
    exit;
  }
  if (isset($_GET["ohlc"])) {
    $sym = isset($_GET["symbol"]) ? trim($_GET["symbol"]) : "";
    $tf  = isset($_GET["tf"]) ? $_GET["tf"] : "1day";
    if (!in_array($tf, ["1day","1week","1month"], true)) $tf = "1day";
    if (!preg_match('/^[A-Za-z0-9.\-^=\/]{1,16}$/', $sym)) { http_response_code(400); echo json_encode(["ok"=>false,"error"=>"badsymbol"]); exit; }

    // 캐시 (일봉 1h / 주·월 6h)
    $ttl = ($tf === "1day") ? 3600 : 21600;
    $cf = __DIR__ . "/forge_ohlc_cache_" . md5($sym . "|" . $tf) . ".json";
    if (is_readable($cf) && (time() - filemtime($cf)) < $ttl) { readfile($cf); exit; }

    // curl 헬퍼
    $fetch = function($url, $isJson) {
      $ch = curl_init($url);
      curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => [$isJson ? "accept: application/json" : "accept: text/csv"],
        CURLOPT_USERAGENT => "ScoopForge/1.0 (+moneyscoop.co.kr)",
      ]);
      $r = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
      return ($r === false || $code < 200 || $code >= 300) ? null : $r;
    };

    $candles = null; $source = null;

    // 1) Twelve Data (서버 전용 키)
    $TD_KEY = is_file(__DIR__ . "/forge_td_key.txt") ? trim(file_get_contents(__DIR__ . "/forge_td_key.txt")) : "";
    if ($TD_KEY !== "") {
      // 암호화폐 페어(BTC-USD)는 Twelve Data가 슬래시(BTC/USD)를 요구 — fiat 접미사일 때만 변환(주식 BRK-B 보호)
      $tdSym = preg_match('/^[A-Za-z]{2,6}-(USD|USDT|EUR|KRW|JPY|GBP|BTC|ETH)$/i', $sym) ? str_replace("-", "/", $sym) : $sym;
      $u = "https://api.twelvedata.com/time_series?symbol=" . urlencode($tdSym) . "&interval=" . urlencode($tf) . "&outputsize=400&format=JSON&apikey=" . urlencode($TD_KEY);
      $raw = $fetch($u, true);
      if ($raw !== null) {
        $j = json_decode($raw, true);
        if (is_array($j) && isset($j["values"]) && is_array($j["values"]) && count($j["values"]) >= 2) {
          $rows = array_reverse($j["values"]);   // 최신→과거 → 과거→최신
          $out = [];
          foreach ($rows as $r) {
            $o=(float)$r["open"]; $h=(float)$r["high"]; $l=(float)$r["low"]; $c=(float)$r["close"];
            $v=isset($r["volume"]) ? (float)$r["volume"] : 0;
            if (is_finite($o)&&is_finite($h)&&is_finite($l)&&is_finite($c)) $out[] = ["t"=>$r["datetime"],"o"=>$o,"h"=>$h,"l"=>$l,"c"=>$c,"v"=>$v];
          }
          if (count($out) >= 2) { $candles = $out; $source = "twelvedata"; }
        }
      }
    }

    // 2) Stooq 폴백 (무키 CSV) — 미국주식/지수/포렉스 일봉
    if ($candles === null) {
      $isCrypto = (bool) preg_match('/^[A-Za-z]{2,6}[-\/](USD|USDT|EUR|KRW|JPY|GBP|BTC|ETH)$/i', $sym);
      $ss = strtolower(str_replace(["-", "/"], "", $sym));   // BTC-USD · BTC/USD → btcusd
      if (!$isCrypto && strpos($ss, ".") === false && strpos($ss, "^") === false && strpos($ss, "=") === false) $ss .= ".us";  // 평이 주식만 .us
      $raw = $fetch("https://stooq.com/q/d/l/?s=" . urlencode($ss) . "&i=d", false);
      if ($raw !== null) {
        $lines = preg_split('/\r?\n/', trim($raw));
        $out = [];
        for ($i = 1; $i < count($lines); $i++) {   // 0=헤더
          $p = explode(",", $lines[$i]);
          if (count($p) < 5 || $p[1] === "N/D" || $p[1] === "") continue;
          $o=(float)$p[1]; $h=(float)$p[2]; $l=(float)$p[3]; $c=(float)$p[4]; $v=isset($p[5])?(float)$p[5]:0;
          if (is_finite($o)&&is_finite($h)&&is_finite($l)&&is_finite($c)&&$c>0) $out[] = ["t"=>$p[0],"o"=>$o,"h"=>$h,"l"=>$l,"c"=>$c,"v"=>$v];
        }
        if (count($out) >= 2) { $candles = array_slice($out, -400); $source = "stooq"; }
      }
    }

    if ($candles === null) { http_response_code(502); echo json_encode(["ok"=>false,"error"=>"notfound","symbol"=>$sym]); exit; }
    $payload = json_encode(["ok"=>true,"symbol"=>$sym,"tf"=>$tf,"source"=>$source,"candles"=>$candles], JSON_UNESCAPED_UNICODE);
    @file_put_contents($cf, $payload);
    echo $payload; exit;
  }
  if (is_file($f)) { readfile($f); } else { echo "null"; }
  exit;
}

if ($method !== "POST") { http_response_code(405); jout(["ok"=>false,"error"=>"method"]); }

if (!check_key($WRITE_KEY)) { http_response_code(403); jout(["ok"=>false,"error"=>"key"]); }
$d = json_decode(file_get_contents("php://input"), true);
if (!is_array($d) || !isset($d["op"])) { http_response_code(400); jout(["ok"=>false,"error"=>"noop"]); }
$op = $d["op"];

if ($op === "putimg") {
  $iid = isset($d["id"]) ? $d["id"] : null;
  $src = isset($d["src"]) ? $d["src"] : null;
  if ($iid === null || !is_string($src)) { http_response_code(400); jout(["ok"=>false,"error"=>"invalid"]); }
  $imgf = __DIR__ . "/forge_images.json";
  $ilock = fopen($imgf . ".lock", "c"); if ($ilock) { flock($ilock, LOCK_EX); }
  $imgs = is_file($imgf) ? json_decode(file_get_contents($imgf), true) : [];
  if (!is_array($imgs)) $imgs = [];
  $imgs[$iid] = $src;
  $itmp = $imgf . ".tmp." . getmypid();
  $okw = file_put_contents($itmp, json_encode($imgs, JSON_UNESCAPED_UNICODE)) !== false && rename($itmp, $imgf);
  if ($ilock) { flock($ilock, LOCK_UN); fclose($ilock); }
  if (!$okw) { http_response_code(500); jout(["ok"=>false,"error"=>"write"]); }
  jout(["ok"=>true]);
}

if ($op === "enqueue" || $op === "claim" || $op === "result") {
  $jf = __DIR__ . "/forge_jobs.json";
  $jlock = fopen($jf . ".lock", "c"); if ($jlock) { flock($jlock, LOCK_EX); }
  $jdoc = is_file($jf) ? json_decode(file_get_contents($jf), true) : null;
  if (!is_array($jdoc) || !isset($jdoc["jobs"]) || !is_array($jdoc["jobs"])) $jdoc = ["jobs"=>[], "_rev"=>0];
  $now = gmdate("c");
  $JOB_TTL = 300;  // working 잡 TTL(초): 이 시간 초과 시 stale로 간주하여 재수거
  $is_stale = function($j) use ($JOB_TTL, $now) {
    if (!isset($j["claimed"]) || !$j["claimed"]) return false;
    return (strtotime($now) - strtotime($j["claimed"])) > $JOB_TTL;
  };
  $resp = null; $code = 0;

  if ($op === "enqueue") {
    $docId = isset($d["docId"]) ? $d["docId"] : null;
    $imgId = isset($d["imgId"]) ? $d["imgId"] : null;
    $board = isset($d["board"]) && is_array($d["board"]) ? $d["board"] : null;
    if ($docId === null || $board === null) { $code = 400; }
    else {
      $dup = null; $stale_idx = null;
      foreach ($jdoc["jobs"] as $i => $j) {
        if (!isset($j["docId"]) || $j["docId"] !== $docId) continue;
        if ($j["status"] === "pending" || ($j["status"] === "working" && !$is_stale($j))) { $dup = $j; break; }
        if ($j["status"] === "working" && $is_stale($j)) { $stale_idx = $i; }
      }
      if ($dup) { $resp = ["ok"=>true, "job"=>$dup]; }
      elseif ($stale_idx !== null) {
        // stale working 잡 재수거 → pending으로 복귀 (토큰 무효화, 워커 늦은 result는 409)
        $jdoc["jobs"][$stale_idx]["status"] = "pending";
        $jdoc["jobs"][$stale_idx]["token"] = null;
        $jdoc["jobs"][$stale_idx]["claimed"] = null;
        $resp = ["ok"=>true, "job"=>$jdoc["jobs"][$stale_idx]];
      }
      else {
        $job = [
          "id" => "job_" . bin2hex(random_bytes(6)),
          "docId" => $docId, "imgId" => $imgId, "board" => $board,
          "status" => "pending", "token" => null,
          "created" => $now, "claimed" => null, "finished" => null,
          "result" => null, "error" => null
        ];
        $jdoc["jobs"][] = $job;
        // GC: done/error 잡 20개 초과 시 created 오름차순으로 초과분 제거
        $done = array_values(array_filter($jdoc["jobs"], function($j){ return $j["status"] === "done" || $j["status"] === "error"; }));
        if (count($done) > 20) {
          usort($done, function($a, $b){ return strcmp($a["created"], $b["created"]); });
          $remove = array_slice($done, 0, count($done) - 20);
          $rmids = array_map(function($j){ return $j["id"]; }, $remove);
          $jdoc["jobs"] = array_values(array_filter($jdoc["jobs"], function($j) use ($rmids){ return !in_array($j["id"], $rmids, true); }));
        }
        $resp = ["ok"=>true, "job"=>$job];
      }
    }
  } elseif ($op === "claim") {
    $picked = null;
    foreach ($jdoc["jobs"] as $i => $j) {
      if ($j["status"] === "pending" || ($j["status"] === "working" && $is_stale($j))) {
        $tok = bin2hex(random_bytes(8));
        $jdoc["jobs"][$i]["status"] = "working";
        $jdoc["jobs"][$i]["token"] = $tok;
        $jdoc["jobs"][$i]["claimed"] = $now;
        $picked = $jdoc["jobs"][$i];
        break;
      }
    }
    $resp = ["ok"=>true, "job"=>$picked, "token"=>($picked ? $picked["token"] : null)];
  } elseif ($op === "result") {
    $jid = isset($d["jobId"]) ? $d["jobId"] : null;
    $tok = isset($d["token"]) ? $d["token"] : null;
    $found = false;
    foreach ($jdoc["jobs"] as $i => $j) {
      if (isset($j["id"]) && $j["id"] === $jid) {
        $found = true;
        if (!isset($j["token"]) || $j["token"] !== $tok) { $code = 409; break; }
        if (isset($d["error"])) { $jdoc["jobs"][$i]["status"] = "error"; $jdoc["jobs"][$i]["error"] = $d["error"]; }
        else { $jdoc["jobs"][$i]["status"] = "done"; $jdoc["jobs"][$i]["result"] = isset($d["result"]) ? $d["result"] : null; }
        $jdoc["jobs"][$i]["finished"] = $now;
        $resp = ["ok"=>true];
        break;
      }
    }
    if (!$found) { $code = 404; }
  }

  if ($code !== 0) {
    if ($jlock) { flock($jlock, LOCK_UN); fclose($jlock); }
    http_response_code($code);
    jout(["ok"=>false, "error"=>($code === 404 ? "nojob" : ($code === 409 ? "token" : "invalid"))]);
  }
  $jdoc["_rev"] = (isset($jdoc["_rev"]) ? intval($jdoc["_rev"]) : 0) + 1;
  $jtmp = $jf . ".tmp." . getmypid();
  $okw = file_put_contents($jtmp, json_encode($jdoc, JSON_UNESCAPED_UNICODE)) !== false && rename($jtmp, $jf);
  if ($jlock) { flock($jlock, LOCK_UN); fclose($jlock); }
  if (!$okw) { http_response_code(500); jout(["ok"=>false,"error"=>"write"]); }
  jout($resp);
}

$lock = fopen($f . ".lock", "c");
if ($lock) { flock($lock, LOCK_EX); }

$doc = ["documents"=>[], "meta"=>new stdClass(), "_rev"=>0];
if (is_file($f)) {
  $cur = json_decode(file_get_contents($f), true);
  if (is_array($cur) && isset($cur["documents"]) && is_array($cur["documents"])) $doc = $cur;
}
if (!isset($doc["documents"]) || !is_array($doc["documents"])) $doc["documents"] = [];
if (!isset($doc["meta"]) || !is_array($doc["meta"])) $doc["meta"] = [];

$err = "";
if ($op === "replace") {
  $nd = isset($d["doc"]) ? $d["doc"] : null;
  if (!is_array($nd) || !isset($nd["documents"]) || !is_array($nd["documents"])) $err = "invalid";
  else { $doc["documents"] = $nd["documents"]; $doc["meta"] = isset($nd["meta"]) && is_array($nd["meta"]) ? $nd["meta"] : []; }
} elseif ($op === "upsert") {
  $it = isset($d["document"]) ? $d["document"] : null;
  if (!is_array($it) || !isset($it["id"])) $err = "invalid";
  else {
    $found = false;
    foreach ($doc["documents"] as $i => $x) { if (isset($x["id"]) && $x["id"] === $it["id"]) { $doc["documents"][$i] = $it; $found = true; break; } }
    if (!$found) $doc["documents"][] = $it;
  }
} elseif ($op === "delete") {
  $id = isset($d["id"]) ? $d["id"] : null;
  if ($id === null) $err = "invalid";
  else $doc["documents"] = array_values(array_filter($doc["documents"], function($x) use ($id){ return !(isset($x["id"]) && $x["id"] === $id); }));
} elseif ($op === "reorder") {
  $order = isset($d["order"]) && is_array($d["order"]) ? $d["order"] : null;
  if ($order === null) $err = "invalid";
  else {
    $map = [];
    foreach ($doc["documents"] as $x) { if (isset($x["id"])) $map[$x["id"]] = $x; }
    $new = [];
    foreach ($order as $id) { if (isset($map[$id])) { $new[] = $map[$id]; unset($map[$id]); } }
    foreach ($map as $x) { $new[] = $x; }
    $doc["documents"] = $new;
  }
} elseif ($op === "meta") {
  $m = isset($d["meta"]) && is_array($d["meta"]) ? $d["meta"] : [];
  foreach ($m as $k => $v) { $doc["meta"][$k] = $v; }
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
