<?php
// 정성인연 자산관리 — 공유 데이터 저장 API (연산 기반, 동시 편집 안전)
// GET            : 저장된 문서 반환({items,meta,_rev}; 없으면 null) — 공개(읽기 자유)
// GET ?check=1   : 헤더 X-Write-Key 가 쓰기 키와 일치하는지 → {"valid":bool}
// POST {op,...}  : 연산을 서버의 최신 문서에 적용(락). 헤더 X-Write-Key 필수(불일치 403)
//   op=replace {doc}        전체 교체(불러오기/초기 시드)
//   op=upsert  {item}       id 기준 항목 추가/수정
//   op=delete  {id}         id 항목 삭제
//   op=reorder {order:[id]} 항목 순서 재배치
//   op=meta    {meta:{...}} meta 일부 병합(sortMode 등)
// 응답: {"ok":true,"rev":N}. 매 쓰기마다 _rev 증가 → 클라이언트 폴링이 변경 감지.
//
// 쓰기 키는 같은 폴더 jsiy_key.txt(서버 전용). 없으면 쓰기 전면 차단(fail-closed).
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Write-Key");

$method = $_SERVER["REQUEST_METHOD"];
if ($method === "OPTIONS") { http_response_code(204); exit; }

$f  = __DIR__ . "/jsiy_data.json";
$kf = __DIR__ . "/jsiy_key.txt";
$WRITE_KEY = is_file($kf) ? trim(file_get_contents($kf)) : "";

function check_key($wk) {
  $k = isset($_SERVER["HTTP_X_WRITE_KEY"]) ? $_SERVER["HTTP_X_WRITE_KEY"] : "";
  return $wk !== "" && hash_equals($wk, $k);
}
function jout($a){ header("Content-Type: application/json; charset=utf-8"); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }

if ($method === "GET") {
  header("Content-Type: application/json; charset=utf-8");
  header("Cache-Control: no-store");
  if (isset($_GET["check"])) { echo json_encode(["valid" => check_key($WRITE_KEY)]); exit; }
  if (is_file($f)) { readfile($f); } else { echo "null"; }
  exit;
}

if ($method !== "POST") { http_response_code(405); jout(["ok"=>false,"error"=>"method"]); }

// ---- POST: 연산 적용 ----
if (!check_key($WRITE_KEY)) { http_response_code(403); jout(["ok"=>false,"error"=>"key"]); }
$d = json_decode(file_get_contents("php://input"), true);
if (!is_array($d) || !isset($d["op"])) { http_response_code(400); jout(["ok"=>false,"error"=>"noop"]); }
$op = $d["op"];

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
