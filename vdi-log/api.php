<?php
// 정성인연 자산관리 — 공유 데이터 저장 API (단일 JSON 파일)
// GET            : 저장된 데이터 반환(없으면 null) — 공개(읽기 자유)
// GET ?check=1   : 헤더 X-Write-Key 가 쓰기 키와 일치하는지 검사 → {"valid":bool}
// POST           : 본문(JSON)을 통째로 저장. 헤더 X-Write-Key 필수(불일치 403)
//
// 쓰기 키는 같은 폴더의 jsiy_key.txt 에 보관(서버 전용, git/클라이언트 미노출).
// 키 파일이 없으면 쓰기 전면 차단(fail-closed).
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

if ($method === "GET") {
  header("Content-Type: application/json; charset=utf-8");
  header("Cache-Control: no-store");
  if (isset($_GET["check"])) { echo json_encode(["valid" => check_key($WRITE_KEY)]); exit; }
  if (is_file($f)) { readfile($f); } else { echo "null"; }
  exit;
}

if ($method === "POST") {
  header("Content-Type: application/json; charset=utf-8");
  if (!check_key($WRITE_KEY)) { http_response_code(403); echo '{"ok":false,"error":"key"}'; exit; }
  $raw = file_get_contents("php://input");
  $d = json_decode($raw, true);
  if (!is_array($d) || !isset($d["items"]) || !is_array($d["items"])) {
    http_response_code(400); echo '{"ok":false,"error":"invalid"}'; exit;
  }
  $tmp = $f . ".tmp." . getmypid();
  if (file_put_contents($tmp, $raw) === false) {
    http_response_code(500); echo '{"ok":false,"error":"write"}'; exit;
  }
  rename($tmp, $f);
  echo '{"ok":true,"ts":' . time() . '}';
  exit;
}

http_response_code(405);
header("Content-Type: application/json; charset=utf-8");
echo '{"ok":false,"error":"method"}';
