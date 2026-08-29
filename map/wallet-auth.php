<?php
// 모바일 로그인의 브라우저 구간. 앱은 이 파일을 직접 부르지 않는다 —
// 브라우저를 여기로 열어두고 wallet-api.php 의 authPoll 로 결과를 가져간다.
//
// PC 의 forge-auth.php 와 흐름은 같고 결과를 두는 곳만 다르다: 쿠키가 아니라 논스다.
// Capacitor 앱은 https://localhost/ 에서 도므로 parksvc 쿠키가 교차 사이트가 된다.
ini_set("display_errors", "0");
require __DIR__ . "/wallet-lib.php";

$W_DIR = dirname(dirname(__DIR__)) . "/data";

function a_html($msg, $done = false) {
  header("Content-Type: text/html; charset=utf-8");
  echo "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\">"
     . "<title>MoneyScoop</title><style>body{font:16px/1.6 system-ui;margin:0;display:flex;min-height:100vh;"
     . "align-items:center;justify-content:center;background:#0b0f14;color:#e8ecf4;padding:24px;text-align:center}"
     . "a.b{display:inline-block;margin-top:18px;padding:12px 20px;border-radius:10px;background:#7b6cff;color:#fff;"
     . "text-decoration:none;font-weight:700}</style>"
     . "<div>" . htmlspecialchars($msg, ENT_QUOTES, "UTF-8");
  // 성공 화면은 막다른 길이면 안 된다(2026-08-28): 스크립트로 열린 창이면 스스로 닫아 앱 탭으로
  // 돌려보내고, 못 닫는 브라우저에는 돌아가는 버튼을 준다. 자동 이동은 하지 않는다 —
  // 원래 앱 탭이 살아 있는데 여기서 또 앱을 열면 두 탭이 같은 논스를 두고 경쟁한다.
  if ($done) {
    echo "<div id=b style=\"display:none\"><a class=b href=\"../app/\">앱으로 돌아가기</a></div>"
       . "<script>setTimeout(function(){try{window.close();}catch(e){}"
       . "setTimeout(function(){var e=document.getElementById('b');if(e)e.style.display='block';},700);},250);</script>";
  }
  echo "</div>";
  exit;
}
function a_fail($code, $msg) { http_response_code($code); a_html($msg); }

// 요청 모양부터 본다 — 논스도 code&state 도 없으면 설정 여부와 무관하게 400 이다.
// 그래야 로그인 기능이 꺼져 있는지(503)를 아무 요청에나 흘리지 않는다(봇 스캔 방어).
$hasNonce = isset($_GET["nonce"]);
$hasCallback = isset($_GET["code"], $_GET["state"]);
if (!$hasNonce && !$hasCallback) a_fail(400, "Nothing to do here.");

$conf = w_oauth_conf();
if (!$conf) a_fail(503, "Sign-in is not available right now.");

$SELF = "https://" . $_SERVER["HTTP_HOST"] . strtok($_SERVER["REQUEST_URI"], "?");
$db = w_db($W_DIR);

// ① 앱이 연 첫 진입 — 논스를 state 에 실어 구글로 보낸다. 별도 state 쿠키가 필요 없다:
//    논스 자체가 단회용·10분 만료·기기 바인딩이라 CSRF 토큰의 역할을 겸한다.
if ($hasNonce) {
  $row = w_nonce_read($db, (string)$_GET["nonce"]);
  if (!$row) a_fail(400, "This sign-in link has expired. Please try again from the app.");
  $q = http_build_query(array(
    "client_id" => $conf["client_id"], "redirect_uri" => $SELF, "response_type" => "code",
    "scope" => "openid email profile", "state" => $row["nonce"], "prompt" => "select_account"));
  header("Location: https://accounts.google.com/o/oauth2/v2/auth?" . $q);
  exit;
}

// ② 구글 콜백 — state 는 곧 논스다. 여기서 먼저 걸러야 모르는/만료된 state 로
//    토큰 교환(구글에 실제 네트워크 요청)까지 가지 않는다.
$row = w_nonce_read($db, (string)$_GET["state"]);
if (!$row) a_fail(400, "This sign-in link has expired. Please try again from the app.");

// w_nonce_read 는 burned(used=1)·만료만 걸러낸다 — 태우기는 authPoll 이 병합 뒤에
// 하므로, 이미 완료된(google_sub 있음) 논스는 폴링되기 전까지(최대 TTL 10분, 앱이
// 아예 안 부르면 그보다 길게) 여전히 "살아" 있다. 여기서 다시 걸러 두지 않으면
// 같은 state 를 반복 재생(뒤로가기·URL 재사용)할 때마다 이 자리를 통과해 구글에
// 진짜 토큰 교환 요청을 또 보낸다 — 인증 없는 공개 파일에 열린 남용 표면이다.
if ($row["google_sub"] !== null) a_fail(400, "This sign-in link has expired. Please try again from the app.");

$ch = curl_init("https://oauth2.googleapis.com/token");
curl_setopt_array($ch, array(
  CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => http_build_query(array(
    "code" => $_GET["code"], "client_id" => $conf["client_id"],
    "client_secret" => $conf["client_secret"], "redirect_uri" => $SELF,
    "grant_type" => "authorization_code"))));
$tok = json_decode((string)curl_exec($ch), true);
curl_close($ch);

// id_token 페이로드를 그대로 읽는다 — 구글 토큰 엔드포인트에서 TLS 로 직접 받았으므로
// 서명 재검증이 필요 없다(forge-auth.php 와 같은 판단).
$sub = null; $gname = null;   // gname: id_token 의 name(profile 스코프) — 앱에 보이는 계정 이름
if (is_array($tok) && !empty($tok["id_token"])) {
  $seg = explode(".", $tok["id_token"]);
  if (count($seg) === 3) {
    $p = json_decode((string)base64_decode(strtr($seg[1], "-_", "+/")), true);
    if (is_array($p) && !empty($p["sub"])) { $sub = (string)$p["sub"]; $gname = !empty($p["name"]) ? (string)$p["name"] : (!empty($p["given_name"]) ? (string)$p["given_name"] : null); }
  }
}
if (!$sub) a_fail(400, "Sign-in failed. Please try again from the app.");

// 반환값을 본다 — 두 탭이 동시에 이 자리에 들어오면 where google_sub is null 이
// 한쪽만 통과시킨다. 패자가 반환값을 무시하면 "로그인됨"을 보여주지만 실제로
// 기록된 sub 은 승자의 것이라 화면이 거짓말을 한다.
if (!w_nonce_complete($db, $row["nonce"], $sub, $gname)) a_fail(400, "Sign-in failed. Please try again from the app.");
a_html("로그인됐어요 · 앱으로 돌아가면 연결이 끝납니다", true);
