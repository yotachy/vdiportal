<?php
/**
 * ETH 현물 ETF 발행사별 프록시 (cafe24)
 * 프론트(scoopsignal.html)의 loadEtf()가 동일 호스트 ./etf.php 를 GET 호출.
 *
 * 데이터 소스: SoSoValue Open API (무료 키 필요 — sosovalue.com 에서 발급).
 *   - Farside(403 봇차단)·CoinGlass(키)·DefiLlama(없음)은 사용 불가로 확인됨.
 *   - 키는 이 서버 파일 안에만 두므로 클라이언트에 노출되지 않음(안전).
 *
 * 사용법: 아래 $SOSO_KEY 에 발급받은 키를 넣고 cafe24 www/portal/signal/ 에 업로드.
 *   키가 비어 있으면 issuers:[] 를 반환 → 프론트는 "연결 필요" 표시(그레이스풀).
 *
 * 주의: jsiy 등 기존 서버 파일·데이터는 건드리지 않음(이 파일만 추가).
 */
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

$SOSO_KEY = '';                 // ← sosovalue.com 무료 키를 여기에
$cacheFile = __DIR__ . '/etf_cache.json';
$ttl = 1800;                    // 30분 캐시

// 캐시 유효하면 그대로
if (is_readable($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
  echo file_get_contents($cacheFile);
  exit;
}

$out = ['asOf' => date('Y-m-d'), 'total' => null, 'unit' => 'usd', 'issuers' => []];

if ($SOSO_KEY !== '') {
  $ch = curl_init('https://api.sosovalue.xyz/openapi/v2/etf/currentEtfDataMetrics');
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_HTTPHEADER     => ['content-type: application/json', 'x-soso-api-key: ' . $SOSO_KEY],
    CURLOPT_POSTFIELDS     => json_encode(['type' => 'us-eth']),
  ]);
  $resp = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($code >= 200 && $code < 300 && $resp) {
    $j = json_decode($resp, true);
    // SoSoValue 응답 구조는 키 발급 후 실제 응답으로 최종 매핑(필드명 방어적 처리).
    $rows = null;
    if (isset($j['data']) && is_array($j['data'])) {
      $rows = isset($j['data']['list']) && is_array($j['data']['list']) ? $j['data']['list'] : $j['data'];
    }
    if (is_array($rows)) {
      $sum = 0;
      foreach ($rows as $r) {
        if (!is_array($r)) continue;
        $name  = $r['name'] ?? ($r['ticker'] ?? ($r['etfName'] ?? ($r['issuer'] ?? null)));
        $value = $r['netAssets'] ?? ($r['totalNetAssets'] ?? ($r['aum'] ?? ($r['value'] ?? null)));
        $flow  = $r['dailyNetInflow'] ?? ($r['netInflow'] ?? ($r['flow1d'] ?? null));
        if ($name === null || $value === null) continue;
        $v = (float)$value;
        $out['issuers'][] = [
          'name'   => (string)$name,
          'ticker' => (string)($r['ticker'] ?? $name),
          'value'  => $v,
          'flow1d' => $flow !== null ? (float)$flow : null,
        ];
        $sum += $v;
      }
      if (count($out['issuers'])) $out['total'] = $sum;
    }
  }
}

$json = json_encode($out, JSON_UNESCAPED_UNICODE);
@file_put_contents($cacheFile, $json);
echo $json;
