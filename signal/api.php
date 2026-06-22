<?php
/**
 * ScoopSignal CORS 프록시 — FRED + beaconcha 전용(화이트리스트).
 * 프론트(scoopsignal.html)가 동일 호스트 ./api.php?u=<업스트림 URL> 로 호출.
 * 브라우저 CORS·키 차단 우회. FRED 키는 이 서버 파일에만(클라이언트 미노출).
 * 주의: 화이트리스트 외 호스트 차단(오픈 프록시 아님). jsiy 등 다른 파일·데이터 미수정.
 */
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

$FRED_KEY = '';     // ← cafe24 업로드본에만 FRED 무료 키 주입(git엔 빈 슬롯)
$BEACON_KEY = '';   // ← cafe24 업로드본에만 beaconcha.in 무료 키 주입(git엔 빈 슬롯)

$u = isset($_GET['u']) ? $_GET['u'] : '';
$p = @parse_url($u);
if (!$p || empty($p['scheme']) || !in_array(strtolower($p['scheme']), ['http','https']) || empty($p['host'])) {
  http_response_code(400); echo json_encode(['error' => 'bad url']); exit;
}
$host = strtolower($p['host']);
$path = isset($p['path']) ? $p['path'] : '';
$allow = ['api.stlouisfed.org' => '/fred/', 'beaconcha.in' => '/api/', 'api.upbit.com' => '/v1/'];
if (!isset($allow[$host]) || strpos($path, $allow[$host]) !== 0) {
  http_response_code(403); echo json_encode(['error' => 'host not allowed']); exit;
}

// 키 서버 주입(클라이언트 URL엔 키 없음)
$target = $u;
$sep = (strpos($u, '?') === false ? '?' : '&');
if ($host === 'api.stlouisfed.org' && $FRED_KEY !== '') {
  $target .= $sep . 'api_key=' . urlencode($FRED_KEY);
} elseif ($host === 'beaconcha.in' && $BEACON_KEY !== '') {
  $target .= $sep . 'apikey=' . urlencode($BEACON_KEY);
}

// 파일 캐시 (FRED 1h / beaconcha 10m)
$ttl = ($host === 'api.stlouisfed.org') ? 3600 : 600;
$cacheFile = __DIR__ . '/api_cache_' . md5($u) . '.json';
if (is_readable($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
  echo file_get_contents($cacheFile); exit;
}

$ch = curl_init($target);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT        => 15,
  CURLOPT_FOLLOWLOCATION => false,
  CURLOPT_HTTPHEADER     => ['accept: application/json'],
  CURLOPT_USERAGENT      => 'ScoopSignal/1.0 (+moneyscoop.co.kr)',
]);
$resp = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($resp === false || $code < 200 || $code >= 300) {
  http_response_code($code ?: 502);
  echo json_encode(['error' => 'upstream', 'code' => $code]); exit;
}
@file_put_contents($cacheFile, $resp);
echo $resp;
