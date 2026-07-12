<?php
// 스쿱포지 인증 공유 라이브러리 — HMAC 서명 쿠키(무상태). forge-auth.php·forge-api.php 공용.
// fauth 쿠키 = b64url(email) . "|" . exp . "|" . b64url(HMAC-SHA256(email."|".exp, secret))
// 인증 스위치: forge_google_oauth.json 존재 = 활성. 미존재 = 전 게이트 비활성(종전 동작·무중단 전환).
function _fb64e($s){ return rtrim(strtr(base64_encode($s), "+/", "-_"), "="); }
function _fb64d($s){ return base64_decode(strtr($s, "-_", "+/")); }
function fauth_oauth_conf(){ $f = __DIR__ . "/forge_google_oauth.json"; if (!is_file($f)) return null;
  $j = json_decode(file_get_contents($f), true);
  return (is_array($j) && !empty($j["client_id"]) && !empty($j["client_secret"])) ? $j : null; }
function fauth_enabled(){ return fauth_oauth_conf() !== null; }
function fauth_secret(){ $f = __DIR__ . "/forge_auth_secret.txt";
  if (!is_file($f)) { $s = bin2hex(random_bytes(32)); @file_put_contents($f, $s, LOCK_EX); @chmod($f, 0600); }
  return trim((string)@file_get_contents($f)); }
function fauth_sign($email, $exp){ return _fb64e(hash_hmac("sha256", $email . "|" . $exp, fauth_secret(), true)); }
function fauth_email(){
  if (!fauth_enabled()) return null;
  $c = isset($_COOKIE["fauth"]) ? $_COOKIE["fauth"] : ""; if ($c === "") return null;
  $p = explode("|", $c); if (count($p) !== 3) return null;
  $email = _fb64d($p[0]); $exp = (int)$p[1];
  if (!$email || $exp < time()) return null;
  if (!hash_equals(fauth_sign($email, $exp), $p[2])) return null;   // fail-closed(변조=거부)
  return strtolower($email);
}
function fauth_uid($email){ return substr(sha1(strtolower($email)), 0, 16); }
function fauth_issue($email){ $exp = time() + 30 * 86400;
  setcookie("fauth", _fb64e($email) . "|" . $exp . "|" . fauth_sign($email, $exp),
    ["expires" => $exp, "path" => "/map/", "secure" => true, "httponly" => true, "samesite" => "Lax"]); }
function fauth_clear(){ setcookie("fauth", "", ["expires" => time() - 3600, "path" => "/map/", "secure" => true, "httponly" => true, "samesite" => "Lax"]); }
function fauth_admin(){ $f = __DIR__ . "/forge_admin.txt"; return is_file($f) ? strtolower(trim((string)file_get_contents($f))) : null; }
