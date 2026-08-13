<?php
// 머니스쿱 지갑 API. 얇게 유지한다 — 원장 로직은 전부 wallet-lib.php 에 있고
// 이 파일은 파싱·인증·분기·응답만 한다. 그래야 웹서버 없이 원장을 테스트할 수 있다.
//
// forge-api.php 와 분리한 이유: 그쪽은 587줄에 PC 제품 전부를 지고 있어
// 배포 사고가 나면 지갑과 PC 가 함께 죽는다.
//
// 돈 엔드포인트에서 호스트 설정을 믿지 않는다 — cafe24 에 display_errors 가 켜져 있으면
// 배열값 캐스트 경고 같은 PHP 경고가 그대로 JSON 본문에 섞여 나가고 서버 경로도 새 나간다.
ini_set("display_errors", "0");

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

// 웹루트 밖. __DIR__ 이 /parksvc/www/map 이므로 두 단계 위가 /parksvc 다.
// 하드코딩하지 않는 이유는 로컬 점검에서도 같은 코드가 돌아야 하기 때문이다.
$W_DIR = dirname(dirname(__DIR__)) . "/data";

require_once __DIR__ . "/wallet-lib.php";

// 기기 id 는 클라이언트가 스스로 고르는 유일한 비밀이다 — 짧으면 무차별 대입으로
// 남의 계정을 맞힌다(하한을 8→32 로 올림, I4). 상한은 저장 낭비 방지용.
define("W_DEVICE_MIN", 32);
define("W_DEVICE_MAX", 128);
// 돈이 걸린 문자열 필드(runType·idem·ref·engineVersion)의 상한. deviceId 와 같은 천장을
// 쓴다 — 실측: 상한이 없으면 120KB 짜리 idem 이 그대로 원장에 들어간다(I6).
define("W_STR_MAX", 128);

function w_out($arr, $code = 200) {
  http_response_code($code);
  echo json_encode($arr, JSON_UNESCAPED_SLASHES);
  exit;
}

// 문자열 필드 검증기. 없으면 $default, 있는데 문자열이 아니거나 길이 초과면 false(거부 신호)
// 를 돌려준다 — 호출부가 반드시 false 를 걸러야 한다.
// (string) 캐스트를 배열값에 걸면 PHP 가 "Warning: Array to string conversion" 를 응답
// 본문에 흘리고(display_errors 켜진 호스트에서 JSON 계약이 깨지고 서버 경로가 새 나간다),
// display_errors 를 꺼도 []→"Array" 리터럴은 조용히 통과해 그대로 과금·원장에 들어간다 —
// ledger.idem 이 전역 UNIQUE 라 그 계정이 그 키를 모두를 위해 영구히 태운다(I3, 리뷰에서 실측).
// 캐스트를 걸기 전에 반드시 이 함수를 거친다.
function w_field_str($d, $key, $default, $maxLen) {
  if (!isset($d[$key])) return $default;
  if (!is_string($d[$key]) || strlen($d[$key]) > $maxLen) return false;
  return $d[$key];
}

function w_ip_hash($dir) {
  $ip = isset($_SERVER["REMOTE_ADDR"]) ? $_SERVER["REMOTE_ADDR"] : "";
  if ($ip === "") return null;
  // HMAC(비밀키, IP) — sha256(ip) 단순 해시는 IPv4 가 32비트뿐이라 무차별 대입 표 하나로
  // 뒤집힌다(리뷰가 저장된 값에서 127.0.0.1 을 복원해 실측 — "원본 IP 는 저장하지 않는다"는
  // 주석이 형식상만 맞았다). 비밀키가 들어가야 표를 미리 만들 수 없다(I5).
  return substr(hash_hmac("sha256", $ip, w_secret($dir)), 0, 32);
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

// 디스패치 전체를 감싼다. w_state 는 자체 예외처리가 없고 w_spend/w_refund/w_checkin 은
// 롤백 후 재던지기 때문에(의도적 — 원장 로직이 조용히 실패를 삼키면 안 된다), 여기서 안
// 잡으면 그 예외가 그대로 위로 뚫려 application/json 헤더 아래 빈 본문이나 스택트레이스가
// 나간다(I7, 리뷰에서 실측). w_out() 의 exit() 는 이 try 안에서도 그대로 즉시 종료된다 —
// catch 는 w_out() 이 처리하지 않은 진짜 예외에만 걸린다.
try {

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }
if ($_SERVER["REQUEST_METHOD"] !== "POST") w_out(array("ok" => false, "reason" => "method"), 405);

$raw = file_get_contents("php://input");
$d = json_decode($raw, true);
if (!is_array($d)) w_out(array("ok" => false, "reason" => "bad-request"), 400);
$op = w_field_str($d, "op", null, 32);
if ($op === null || $op === false) w_out(array("ok" => false, "reason" => "bad-request"), 400);

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
  $dev = w_field_str($d, "deviceId", "", W_DEVICE_MAX);
  if ($dev === false || strlen($dev) < W_DEVICE_MIN || strlen($dev) > W_DEVICE_MAX) {
    w_out(array("ok" => false, "reason" => "bad-device"), 400);
  }
  $acct = w_get_account($db, $dev);
  if (!$acct) {
    $iph = w_ip_hash($W_DIR);
    // 재설치 남용 완화 — 완전히는 못 막는다. 진짜 해결은 8c(구글 로그인)다.
    // 상한 자체는 이제 w_create_account 안(쓰기 락 안)에서 다시 확인된다(C2) — 여기서
    // WalletRateLimitException 만 따로 잡아 429 로 답하고, 그 외 Throwable(전형적으로
    // 동시 hello 의 UNIQUE 충돌)은 재조회로 넘긴다. 두 예외를 하나의 catch(Throwable) 로
    // 묶으면 상한에 걸린 요청도 "경합" 취급을 받아 200 을 내주게 된다.
    try {
      $acct = w_create_account($db, $dev, $iph);
    } catch (WalletRateLimitException $e) {
      w_out(array("ok" => false, "reason" => "rate-limited"), 429);
    } catch (Throwable $e) {
      $acct = w_get_account($db, $dev);   // 동시 hello 경합
    }
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
  $runType = w_field_str($d, "runType", "", W_STR_MAX);
  $idem = w_field_str($d, "idem", "", W_STR_MAX);
  $ref = w_field_str($d, "ref", null, W_STR_MAX);
  $engineVersion = w_field_str($d, "engineVersion", null, W_STR_MAX);
  if ($runType === false || $idem === false || $ref === false || $engineVersion === false) {
    w_out(array("ok" => false, "reason" => "bad-request"), 400);
  }
  $r = w_spend($db, $acct["id"], $runType, $idem, $ref, $engineVersion);
  w_out(array("ok" => $r["ok"], "charged" => $r["charged"], "reason" => $r["reason"],
              "state" => w_state($db, w_get_account($db, $dev))));
} elseif ($op === "refund") {
  $idem = w_field_str($d, "idem", "", W_STR_MAX);
  if ($idem === false) w_out(array("ok" => false, "reason" => "bad-request"), 400);
  $r = w_refund($db, $acct["id"], $idem);
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

} catch (Throwable $e) {
  w_out(array("ok" => false, "reason" => "server-error"), 500);
}
