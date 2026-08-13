<?php
// 머니스쿱 지갑 API. 얇게 유지한다 — 원장 로직은 전부 wallet-lib.php 에 있고
// 이 파일은 파싱·인증·분기·응답만 한다. 그래야 웹서버 없이 원장을 테스트할 수 있다.
//
// forge-api.php 와 분리한 이유: 그쪽은 587줄에 PC 제품 전부를 지고 있어
// 배포 사고가 나면 지갑과 PC 가 함께 죽는다.
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

// 웹루트 밖. __DIR__ 이 /parksvc/www/map 이므로 두 단계 위가 /parksvc 다.
// 하드코딩하지 않는 이유는 로컬 점검에서도 같은 코드가 돌아야 하기 때문이다.
$W_DIR = dirname(dirname(__DIR__)) . "/data";

require_once __DIR__ . "/wallet-lib.php";

function w_out($arr, $code = 200) {
  http_response_code($code);
  echo json_encode($arr, JSON_UNESCAPED_SLASHES);
  exit;
}
function w_ip_hash() {
  $ip = isset($_SERVER["REMOTE_ADDR"]) ? $_SERVER["REMOTE_ADDR"] : "";
  if ($ip === "") return null;
  // 원본 IP 는 저장하지 않는다 — 상한 계산에 필요한 것은 동일성뿐이다.
  return substr(hash("sha256", "msw|" . $ip), 0, 32);
}
function w_bearer() {
  $h = "";
  if (isset($_SERVER["HTTP_AUTHORIZATION"])) $h = $_SERVER["HTTP_AUTHORIZATION"];
  elseif (function_exists("apache_request_headers")) {
    $hs = apache_request_headers();
    foreach ($hs as $k => $v) { if (strcasecmp($k, "Authorization") === 0) { $h = $v; break; } }
  }
  if (stripos($h, "Bearer ") !== 0) return "";
  return trim(substr($h, 7));
}

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }
if ($_SERVER["REQUEST_METHOD"] !== "POST") w_out(array("ok" => false, "reason" => "method"), 405);

$raw = file_get_contents("php://input");
$d = json_decode($raw, true);
if (!is_array($d) || !isset($d["op"])) w_out(array("ok" => false, "reason" => "bad-request"), 400);
$op = (string)$d["op"];

// ping 은 사용자 데이터를 일절 노출하지 않는다 — 그래야 열어둬도 안전하다.
if ($op === "ping") {
  try {
    $db = w_db($W_DIR);
    w_out(array("ok" => true, "schema" => w_schema_version($db),
                "php" => PHP_VERSION, "sqlite" => $db->query("select sqlite_version()")->fetchColumn()));
  } catch (Throwable $e) {
    w_out(array("ok" => false, "reason" => "storage"), 500);
  }
}

try { $db = w_db($W_DIR); }
catch (Throwable $e) { w_out(array("ok" => false, "reason" => "storage"), 500); }

if ($op === "hello") {
  $dev = isset($d["deviceId"]) ? (string)$d["deviceId"] : "";
  if (strlen($dev) < 8 || strlen($dev) > 128) w_out(array("ok" => false, "reason" => "bad-device"), 400);
  $acct = w_get_account($db, $dev);
  if (!$acct) {
    $iph = w_ip_hash();
    // 재설치 남용 완화 — 완전히는 못 막는다. 진짜 해결은 8c(구글 로그인)다.
    if (w_seed_count_today($db, $iph) >= W_IP_DAILY) w_out(array("ok" => false, "reason" => "rate-limited"), 429);
    try { $acct = w_create_account($db, $dev, $iph); }
    catch (Throwable $e) { $acct = w_get_account($db, $dev); }   // 동시 hello 경합
    if (!$acct) w_out(array("ok" => false, "reason" => "server-error"), 500);
  }
  w_out(array("ok" => true, "token" => w_token_make($W_DIR, $dev), "state" => w_state($db, $acct)));
}

$dev = w_token_read($W_DIR, w_bearer());
if ($dev === null) w_out(array("ok" => false, "reason" => "unauthorized"), 401);
$acct = w_get_account($db, $dev);
if (!$acct) w_out(array("ok" => false, "reason" => "unauthorized"), 401);

if ($op === "get") {
  w_out(array("ok" => true, "state" => w_state($db, $acct)));
} elseif ($op === "spend") {
  $r = w_spend($db, $acct["id"],
               isset($d["runType"]) ? (string)$d["runType"] : "",
               isset($d["idem"]) ? (string)$d["idem"] : "",
               isset($d["ref"]) ? (string)$d["ref"] : null,
               isset($d["engineVersion"]) ? (string)$d["engineVersion"] : null);
  w_out(array("ok" => $r["ok"], "charged" => $r["charged"], "reason" => $r["reason"],
              "state" => w_state($db, w_get_account($db, $dev))));
} elseif ($op === "refund") {
  $r = w_refund($db, $acct["id"], isset($d["idem"]) ? (string)$d["idem"] : "");
  w_out(array("ok" => $r["ok"], "reason" => $r["reason"],
              "state" => w_state($db, w_get_account($db, $dev))));
} elseif ($op === "checkin") {
  // $today 는 절대 요청에서 받지 않는다 — 리터럴 null 이다. 세 번째 인자가 테스트 전용
  // 날짜 오버라이드라서, 여기 요청 필드가 흘러들어가면 클라이언트가 기기 시계를 바꾸는 것
  // 만으로 하루 상한을 무한정 우회한다(w_checkin 헤더 주석 참고). 실수로 바뀌는 것을
  // 막기 위해 이 리터럴 자체를 계약으로 둔다 — 변수를 거치지 않는다.
  $r = w_checkin($db, $acct, null);
  w_out(array("ok" => $r["ok"], "granted" => $r["granted"], "capped" => $r["capped"], "reason" => $r["reason"],
              "state" => w_state($db, w_get_account($db, $dev))));
}
w_out(array("ok" => false, "reason" => "unknown-op"), 400);
