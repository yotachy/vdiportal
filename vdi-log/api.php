<?php
// 정성인연 자산관리 — 공유 데이터 저장 API (단일 JSON 파일)
// GET  : 저장된 데이터 반환(없으면 null)
// POST : 본문(JSON)을 통째로 저장(last-write-wins)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

$method = $_SERVER["REQUEST_METHOD"];
if ($method === "OPTIONS") { http_response_code(204); exit; }

$f = __DIR__ . "/jsiy_data.json";

if ($method === "GET") {
  header("Content-Type: application/json; charset=utf-8");
  header("Cache-Control: no-store");
  if (is_file($f)) { readfile($f); } else { echo "null"; }
  exit;
}

if ($method === "POST") {
  $raw = file_get_contents("php://input");
  $d = json_decode($raw, true);
  if (!is_array($d) || !isset($d["items"]) || !is_array($d["items"])) {
    http_response_code(400);
    header("Content-Type: application/json; charset=utf-8");
    echo '{"ok":false,"error":"invalid"}';
    exit;
  }
  $tmp = $f . ".tmp." . getmypid();
  if (file_put_contents($tmp, $raw) === false) {
    http_response_code(500);
    header("Content-Type: application/json; charset=utf-8");
    echo '{"ok":false,"error":"write"}';
    exit;
  }
  rename($tmp, $f);
  header("Content-Type: application/json; charset=utf-8");
  echo '{"ok":true,"ts":' . time() . '}';
  exit;
}

http_response_code(405);
header("Content-Type: application/json; charset=utf-8");
echo '{"ok":false,"error":"method"}';
