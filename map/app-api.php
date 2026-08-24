<?php
// 머니스쿱 앱 서버 API — 채점 원장(P3). wallet-api 와 같은 규율: 데이터는 웹루트 밖,
// POST JSON {op,...}, 서버가 판정. 지연 채점: list 요청 처리 시 만기 지난 대기 건을
// forge OHLC 캐시(forge_ohlc_cache_*.json — forge-api 가 생성)로 판정한다.
// 캐시가 없으면 그 행은 다음 기회에 채점(앱 클라이언트가 차트를 볼 때마다 캐시가 갱신된다).
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { exit; }

$AL_DIR = dirname(dirname(__DIR__)) . "/data";   // 웹루트 밖(wallet 과 동일 관례)
require_once __DIR__ . "/app-ledger-lib.php";

function al_out($arr, $code = 200) {
  http_response_code($code);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") al_out(array("ok" => false, "error" => "method"), 405);
$raw = file_get_contents("php://input");
if (strlen($raw) > 65536) al_out(array("ok" => false, "error" => "too-large"), 413);
$in = json_decode($raw, true);
if (!is_array($in) || !isset($in["op"])) al_out(array("ok" => false, "error" => "bad-json"), 400);
$device = isset($in["device"]) ? preg_replace("/[^A-Za-z0-9_-]/", "", (string)$in["device"]) : "";
if ($device === "" || strlen($device) > 64) al_out(array("ok" => false, "error" => "device"), 400);

// forge OHLC 캐시 리더 — forge-api 와 같은 키 규칙(md5("SYM|1day" 등))
function al_candles_from_cache($sym, $tfKo) {
  $apiTf = $tfKo === "주" ? "1week" : ($tfKo === "월" ? "1month" : "1day");
  $cf = __DIR__ . "/forge_ohlc_cache_" . md5($sym . "|" . $apiTf) . ".json";
  if (!is_readable($cf)) return null;
  $j = json_decode(@file_get_contents($cf), true);
  if (!is_array($j) || !isset($j["candles"]) || !is_array($j["candles"])) return null;
  return $j["candles"];
}

try { $db = al_db($AL_DIR); }
catch (Throwable $e) { al_out(array("ok" => false, "error" => "storage"), 500); }

$op = (string)$in["op"];
try {
  if ($op === "register") {
    $in["device"] = $device;
    al_out(al_register($db, $in));
  }
  if ($op === "list") {
    al_score_pending($db, $device, "al_candles_from_cache", time());
    al_out(al_list($db, $device, isset($in["limit"]) ? (int)$in["limit"] : 120, time()));
  }
  if ($op === "claim_refunds") {   // P5 지갑 통합에서 실지급과 원자 결합 예정 — 현재는 소진 카운트만
    al_out(array("ok" => true, "n" => al_claim_refunds($db, $device)));
  }
  al_out(array("ok" => false, "error" => "op"), 400);
} catch (Throwable $e) {
  al_out(array("ok" => false, "error" => "server"), 500);
}
