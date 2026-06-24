<?php
// KB VDI 접속 흐름 다이어그램 — 캔버스 저장 API (연산 기반, 동시 편집 안전)
// 데이터 모델: doc = {canvases:[{id,title,nodes,edges,groups,view,updated}], meta:{library,activeId}, _rev:N}
// GET            : 저장된 doc 반환(없으면 null) — 공개(읽기 자유)
// GET ?check=1   : 헤더 X-Write-Key 가 쓰기 키와 일치하는지 → {"valid":bool}
// POST {op,...}  : 연산을 서버 최신 doc 에 적용(락).
//   op=replace {doc}            전체 교체(시드/불러오기)
//   op=upsert  {canvas}         id 기준 캔버스 추가/수정
//   op=delete  {id}             캔버스 삭제
//   op=reorder {order:[id]}     순서 재배치
//   op=meta    {meta:{...}}     meta 일부 병합(library/activeId)
// 응답: {"ok":true,"rev":N}. 매 쓰기마다 _rev 증가.
//
// 쓰기 키: 같은 폴더 map_key.txt(서버 전용). 있으면 X-Write-Key 강제, 없으면 개방(fail-open).
// (vdi-log 는 fail-closed 지만, 여기선 "현재 단독 사용"이라 의도적으로 fail-open. 추후 로그인 시 키 파일만 올리면 보호 활성화.)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Write-Key");

$method = $_SERVER["REQUEST_METHOD"];
if ($method === "OPTIONS") { http_response_code(204); exit; }

$f  = __DIR__ . "/map_data.json";
$kf = __DIR__ . "/map_key.txt";
$WRITE_KEY = is_file($kf) ? trim(file_get_contents($kf)) : "";

function check_key($wk) {
  if ($wk === "") return true; // 키 파일 없으면 개방
  $k = isset($_SERVER["HTTP_X_WRITE_KEY"]) ? $_SERVER["HTTP_X_WRITE_KEY"] : "";
  return hash_equals($wk, $k);
}
function jout($a){ header("Content-Type: application/json; charset=utf-8"); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }

if ($method === "GET") {
  header("Content-Type: application/json; charset=utf-8");
  header("Cache-Control: no-store");
  if (isset($_GET["check"])) { echo json_encode(["valid" => check_key($WRITE_KEY)]); exit; }
  if (isset($_GET["images"])) {
    $imgf = __DIR__ . "/map_images.json";
    if (is_file($imgf)) { readfile($imgf); } else { echo "{}"; }
    exit;
  }
  if (is_file($f)) { readfile($f); } else { echo "null"; }
  exit;
}

if ($method !== "POST") { http_response_code(405); jout(["ok"=>false,"error"=>"method"]); }

// ---- POST: 연산 적용 ----
if (!check_key($WRITE_KEY)) { http_response_code(403); jout(["ok"=>false,"error"=>"key"]); }
$d = json_decode(file_get_contents("php://input"), true);
if (!is_array($d) || !isset($d["op"])) { http_response_code(400); jout(["ok"=>false,"error"=>"noop"]); }
$op = $d["op"];

if ($op === "putimg") {
  $iid = isset($d["id"]) ? $d["id"] : null;
  $src = isset($d["src"]) ? $d["src"] : null;
  if ($iid === null || !is_string($src)) { http_response_code(400); jout(["ok"=>false,"error"=>"invalid"]); }
  $imgf = __DIR__ . "/map_images.json";
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

$lock = fopen($f . ".lock", "c");
if ($lock) { flock($lock, LOCK_EX); }

$doc = ["canvases"=>[], "meta"=>new stdClass(), "_rev"=>0];
if (is_file($f)) {
  $cur = json_decode(file_get_contents($f), true);
  if (is_array($cur) && isset($cur["canvases"]) && is_array($cur["canvases"])) $doc = $cur;
}
if (!isset($doc["canvases"]) || !is_array($doc["canvases"])) $doc["canvases"] = [];
if (!isset($doc["meta"]) || !is_array($doc["meta"])) $doc["meta"] = [];

$err = "";
if ($op === "replace") {
  $nd = isset($d["doc"]) ? $d["doc"] : null;
  if (!is_array($nd) || !isset($nd["canvases"]) || !is_array($nd["canvases"])) $err = "invalid";
  else { $doc["canvases"] = $nd["canvases"]; $doc["meta"] = isset($nd["meta"]) && is_array($nd["meta"]) ? $nd["meta"] : []; }
} elseif ($op === "upsert") {
  $it = isset($d["canvas"]) ? $d["canvas"] : null;
  if (!is_array($it) || !isset($it["id"])) $err = "invalid";
  else {
    $found = false;
    foreach ($doc["canvases"] as $i => $x) { if (isset($x["id"]) && $x["id"] === $it["id"]) { $doc["canvases"][$i] = $it; $found = true; break; } }
    if (!$found) $doc["canvases"][] = $it;
  }
} elseif ($op === "delete") {
  $id = isset($d["id"]) ? $d["id"] : null;
  if ($id === null) $err = "invalid";
  else $doc["canvases"] = array_values(array_filter($doc["canvases"], function($x) use ($id){ return !(isset($x["id"]) && $x["id"] === $id); }));
} elseif ($op === "reorder") {
  $order = isset($d["order"]) && is_array($d["order"]) ? $d["order"] : null;
  if ($order === null) $err = "invalid";
  else {
    $map = [];
    foreach ($doc["canvases"] as $x) { if (isset($x["id"])) $map[$x["id"]] = $x; }
    $new = [];
    foreach ($order as $id) { if (isset($map[$id])) { $new[] = $map[$id]; unset($map[$id]); } }
    foreach ($map as $x) { $new[] = $x; }
    $doc["canvases"] = $new;
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
