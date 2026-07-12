<?php
// 스쿱포지 인증 엔드포인트 — Google OAuth(authorization code). ?login=1 / 콜백(?code=) / ?me=1 / ?logout=1
// forge_google_oauth.json 미업로드 시 전 기능 비활성(oauth_unset) — 무중단 스위치.
require __DIR__ . "/forge-auth-lib.php";
function aout($a){ header("Content-Type: application/json; charset=utf-8"); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }
function fauth_clear_state(){ setcookie("fauth_st", "", ["expires" => time() - 3600, "path" => "/map/", "secure" => true, "httponly" => true, "samesite" => "Lax"]); }
$SELF = "https://" . $_SERVER["HTTP_HOST"] . strtok($_SERVER["REQUEST_URI"], "?");
$HOME = dirname($SELF) . "/forge.html";

if (isset($_GET["me"])) {
  if (!fauth_enabled()) aout(["ok" => false, "enabled" => false]);
  $e = fauth_email();
  aout($e ? ["ok" => true, "enabled" => true, "email" => $e] : ["ok" => false, "enabled" => true]);
}
if (isset($_GET["logout"])) { fauth_clear(); header("Location: " . $HOME); exit; }

$conf = fauth_oauth_conf();
if (!$conf) aout(["ok" => false, "error" => "oauth_unset", "hint" => "forge_google_oauth.json({client_id,client_secret}) 서버 업로드 필요"]);

if (isset($_GET["login"])) {
  $t0 = time();
  $st = $t0 . "." . bin2hex(random_bytes(8));
  setcookie("fauth_st", $st . "|" . fauth_sign("st:" . $st, $t0 + 600),
    ["expires" => $t0 + 600, "path" => "/map/", "secure" => true, "httponly" => true, "samesite" => "Lax"]);
  $q = http_build_query(["client_id" => $conf["client_id"], "redirect_uri" => $SELF, "response_type" => "code",
    "scope" => "openid email", "state" => $st, "prompt" => "select_account"]);
  header("Location: https://accounts.google.com/o/oauth2/v2/auth?" . $q); exit;
}

if (isset($_GET["code"])) {
  // state 검증(CSRF): 쿠키(state|서명)와 파라미터 대조 + 서명·만료 확인
  $ok = false;
  if (isset($_COOKIE["fauth_st"], $_GET["state"])) {
    $p = explode("|", $_COOKIE["fauth_st"]);
    if (count($p) === 2 && $p[0] === $_GET["state"]) {
      $exp0 = (int)explode(".", $p[0])[0] + 600;
      if ($exp0 > time() && hash_equals(fauth_sign("st:" . $p[0], $exp0), $p[1])) $ok = true;
    }
  }
  if (!$ok) { fauth_clear_state(); header("Location: " . $HOME . "?login=fail"); exit; }
  $ch = curl_init("https://oauth2.googleapis.com/token");
  curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12,
    CURLOPT_POSTFIELDS => http_build_query(["code" => $_GET["code"], "client_id" => $conf["client_id"],
      "client_secret" => $conf["client_secret"], "redirect_uri" => $SELF, "grant_type" => "authorization_code"])]);
  $raw = curl_exec($ch); curl_close($ch);
  $tok = json_decode((string)$raw, true);
  $email = null;
  if (is_array($tok) && !empty($tok["id_token"])) {   // id_token payload — 서버가 구글 토큰 엔드포인트에서 직접 수신(TLS)이라 서명 재검증 불요
    $seg = explode(".", $tok["id_token"]);
    if (count($seg) === 3) { $pl = json_decode(_fb64d($seg[1]), true);
      if (is_array($pl) && !empty($pl["email"]) && !empty($pl["email_verified"])) $email = strtolower($pl["email"]); }
  }
  if (!$email && is_array($tok) && !empty($tok["access_token"])) {   // 폴백: userinfo
    $ch = curl_init("https://openidconnect.googleapis.com/v1/userinfo");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_HTTPHEADER => ["Authorization: Bearer " . $tok["access_token"]]]);
    $ui = json_decode((string)curl_exec($ch), true); curl_close($ch);
    if (is_array($ui) && !empty($ui["email"])) $email = strtolower($ui["email"]);
  }
  if (!$email) { fauth_clear_state(); header("Location: " . $HOME . "?login=fail"); exit; }
  fauth_issue($email); fauth_clear_state();
  header("Location: " . $HOME . "?login=ok"); exit;
}

aout(["ok" => false, "error" => "noop"]);
