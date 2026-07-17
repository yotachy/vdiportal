<?php
// 스쿱포지 — 전략 문서 저장 API (연산 기반, 동시 편집 안전). map/api.php 미러.
// doc = {documents:[{id,title,themeImgId,nodes,edges,view,updated}], meta:{library,activeId}, _rev:N}
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Write-Key");

$method = $_SERVER["REQUEST_METHOD"];
if ($method === "OPTIONS") { http_response_code(204); exit; }

$f  = __DIR__ . "/forge_data.json";
$kf = __DIR__ . "/forge_key.txt";
$WRITE_KEY = is_file($kf) ? trim(file_get_contents($kf)) : "";

// ── 인증(v1 auth): forge_google_oauth.json 업로드 시에만 활성 — 미업로드=종전 전역 문서 동작(무중단 스위치) ──
require __DIR__ . "/forge-auth-lib.php";
$AUTH_ON = fauth_enabled();
$AUTH_EMAIL = $AUTH_ON ? fauth_email() : null;
$UID = $AUTH_EMAIL ? fauth_uid($AUTH_EMAIL) : null;
$IMGF = __DIR__ . "/forge_images.json";   // 이미지 경로 변수화(putimg·?images 공용)
if ($AUTH_ON && $UID) {
  $uf = __DIR__ . "/forge_data_" . $UID . ".json";
  $uimg = __DIR__ . "/forge_images_" . $UID . ".json";
  // 레거시 1회 이관: admin 첫 로그인 시 기존 전역 문서·이미지를 계정 파일로 복사(원본 보존 — 불가침)
  if ($AUTH_EMAIL === fauth_admin()) {
    if (!is_file($uf) && is_file($f)) @copy($f, $uf);
    if (!is_file($uimg) && is_file($IMGF)) @copy($IMGF, $uimg);
  }
  $f = $uf; $IMGF = $uimg;
}

function check_key($wk) {
  if ($wk === "") return true;
  $k = isset($_SERVER["HTTP_X_WRITE_KEY"]) ? $_SERVER["HTTP_X_WRITE_KEY"] : "";
  return hash_equals($wk, $k);
}
function jout($a){ header("Content-Type: application/json; charset=utf-8"); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }

if ($method === "GET") {
  header("Content-Type: application/json; charset=utf-8");
  header("Cache-Control: no-store");
  if (isset($_GET["check"])) { echo json_encode(["valid" => check_key($WRITE_KEY)]); exit; }
  if (isset($_GET["images"])) {
    if ($AUTH_ON && !$UID) { echo "{}"; exit; }   // 게스트(체험): 사용자 이미지 없음
    if (is_file($IMGF)) { readfile($IMGF); } else { echo "{}"; }
    exit;
  }
  if (isset($_GET["jobs"])) {
    $jf = __DIR__ . "/forge_jobs.json";
    $jdoc = is_file($jf) ? json_decode(file_get_contents($jf), true) : null;
    if (!is_array($jdoc) || !isset($jdoc["jobs"]) || !is_array($jdoc["jobs"])) $jdoc = ["jobs"=>[]];
    $list = $jdoc["jobs"];
    $docId = isset($_GET["docId"]) ? $_GET["docId"] : null;
    if ($docId !== null) $list = array_values(array_filter($list, function($j) use ($docId){ return isset($j["docId"]) && $j["docId"] === $docId; }));
    echo json_encode(["ok"=>true, "jobs"=>$list], JSON_UNESCAPED_UNICODE);
    exit;
  }
  if (isset($_GET["ohlc"])) {
    $sym = isset($_GET["symbol"]) ? trim($_GET["symbol"]) : "";
    $tf  = isset($_GET["tf"]) ? $_GET["tf"] : "1day";
    if (!in_array($tf, ["1day","1week","1month"], true)) $tf = "1day";
    if (!preg_match('/^[A-Za-z0-9.\-^=\/]{1,16}$/', $sym)) { http_response_code(400); echo json_encode(["ok"=>false,"error"=>"badsymbol"]); exit; }

    // 캐시 (일봉 1h / 주·월 6h)
    $ttl = ($tf === "1day") ? 3600 : 21600;
    $cf = __DIR__ . "/forge_ohlc_cache_" . md5($sym . "|" . $tf) . ".json";
    if (is_readable($cf) && (time() - filemtime($cf)) < $ttl) { readfile($cf); exit; }
    // 증분 저장: 기존 캐시(누적 데이터) 로드 → 새 봉만 머지(TTL 만료해도 전량 재수집 안 함)
    $prev = [];
    if (is_readable($cf)) { $pj = json_decode(@file_get_contents($cf), true); if (is_array($pj) && isset($pj["candles"]) && is_array($pj["candles"])) $prev = $pj["candles"]; }
    $incremental = count($prev) > 1;

    // curl 헬퍼
    $fetch = function($url, $isJson) {
      $ch = curl_init($url);
      curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => [$isJson ? "accept: application/json" : "accept: text/csv"],
        CURLOPT_USERAGENT => "ScoopForge/1.0 (+moneyscoop.co.kr)",
      ]);
      $r = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
      return ($r === false || $code < 200 || $code >= 300) ? null : $r;
    };

    $candles = null; $source = null; $name = "";

    // 국내주식(6자리 코드 · 예: 005930, 000660) 또는 명시적 .kr → Twelve Data 무료키 미지원 → Naver로 처리
    $isKR = (bool) preg_match('/^\d{6}(\.kr)?$/i', $sym);
    // 국내 지수(KOSPI·KOSDAQ·KOSPI200) → Naver siseJson이 심볼명으로 직접 지원(KOSPI200은 KPI200)
    $krIdx = strtoupper($sym); if ($krIdx === "KOSPI200") $krIdx = "KPI200";
    $isKRIndex = in_array($krIdx, ["KOSPI", "KOSDAQ", "KPI200"], true);

    // 1) Twelve Data (서버 전용 키) — 국내주식은 건너뜀
    $TD_KEY = is_file(__DIR__ . "/forge_td_key.txt") ? trim(file_get_contents(__DIR__ . "/forge_td_key.txt")) : "";
    if ($TD_KEY !== "" && !$isKR && !$isKRIndex) {
      // 암호화폐 페어(BTC-USD)는 Twelve Data가 슬래시(BTC/USD)를 요구 — fiat 접미사일 때만 변환(주식 BRK-B 보호)
      $tdSym = preg_match('/^[A-Za-z]{2,6}-(USD|USDT|EUR|KRW|JPY|GBP|BTC|ETH)$/i', $sym) ? str_replace("-", "/", $sym) : $sym;
      $u = "https://api.twelvedata.com/time_series?symbol=" . urlencode($tdSym) . "&interval=" . urlencode($tf) . "&outputsize=" . ($incremental ? 300 : 5000) . "&format=JSON&apikey=" . urlencode($TD_KEY);
      $raw = $fetch($u, true);
      if ($raw !== null) {
        $j = json_decode($raw, true);
        if (is_array($j) && isset($j["values"]) && is_array($j["values"]) && count($j["values"]) >= 2) {
          $rows = array_reverse($j["values"]);   // 최신→과거 → 과거→최신
          $out = [];
          foreach ($rows as $r) {
            $o=(float)$r["open"]; $h=(float)$r["high"]; $l=(float)$r["low"]; $c=(float)$r["close"];
            $v=isset($r["volume"]) ? (float)$r["volume"] : 0;
            if (is_finite($o)&&is_finite($h)&&is_finite($l)&&is_finite($c)) $out[] = ["t"=>$r["datetime"],"o"=>$o,"h"=>$h,"l"=>$l,"c"=>$c,"v"=>$v];
          }
          if (count($out) >= 2) { $candles = $out; $source = "twelvedata"; }
        }
      }
    }

    // 1.5) 국내주식 → Naver Finance(무키, KRX 일/주/월봉). Stooq가 국내주식·봇차단으로 막혀 이 소스를 KR 기본으로 사용
    if ($candles === null && ($isKR || $isKRIndex)) {
      $code = $isKRIndex ? $krIdx : preg_replace('/\.kr$/i', '', $sym);   // 005930.kr → 005930 · 지수는 KOSPI/KOSDAQ/KPI200
      $nvtf = ($tf === "1week" || $tf === "week") ? "week" : (($tf === "1month" || $tf === "month") ? "month" : "day");
      $start = date("Ymd", strtotime("-4 years")); $end = date("Ymd");
      $u = "https://api.finance.naver.com/siseJson.naver?symbol=" . urlencode($code) . "&requestType=1&startTime=" . $start . "&endTime=" . $end . "&timeframe=" . $nvtf;
      $raw = $fetch($u, false);
      if ($raw !== null && preg_match_all('/\["(\d{8})",\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/', $raw, $mm, PREG_SET_ORDER)) {
        $out = [];
        foreach ($mm as $r) {
          $o=(float)$r[2]; $h=(float)$r[3]; $l=(float)$r[4]; $c=(float)$r[5]; $v=(float)$r[6];
          $dt = substr($r[1],0,4)."-".substr($r[1],4,2)."-".substr($r[1],6,2);
          if (is_finite($o)&&is_finite($h)&&is_finite($l)&&is_finite($c)&&$c>0) $out[] = ["t"=>$dt,"o"=>$o,"h"=>$h,"l"=>$l,"c"=>$c,"v"=>$v];
        }
        if (count($out) >= 2) { $candles = array_slice($out, -400); $source = "naver"; }
      }
      // 종목명(신뢰 확인용) — 예: 005930 → 삼성전자 / 지수는 고정명
      if ($candles !== null && $isKRIndex) {
        $name = ($krIdx === "KPI200") ? "코스피200" : ($krIdx === "KOSDAQ" ? "코스닥" : "코스피");
      } elseif ($candles !== null) {
        $nb = $fetch("https://m.stock.naver.com/api/stock/" . urlencode($code) . "/basic", true);
        if ($nb !== null) { $nj = json_decode($nb, true); if (is_array($nj) && !empty($nj["stockName"])) $name = $nj["stockName"]; }
      }
    }

    // 2) Stooq 폴백 (무키 CSV) — 미국주식/지수/포렉스 일봉
    if ($candles === null) {
      $isCrypto = (bool) preg_match('/^[A-Za-z]{2,6}[-\/](USD|USDT|EUR|KRW|JPY|GBP|BTC|ETH)$/i', $sym);
      $ss = strtolower(str_replace(["-", "/"], "", $sym));   // BTC-USD · BTC/USD → btcusd
      if ($isKR) { if (strpos($ss, ".") === false) $ss .= ".kr"; }   // 국내주식 → .kr (예: 005930 → 005930.kr)
      elseif (!$isCrypto && strpos($ss, ".") === false && strpos($ss, "^") === false && strpos($ss, "=") === false) $ss .= ".us";  // 평이 미국주식만 .us
      $raw = $fetch("https://stooq.com/q/d/l/?s=" . urlencode($ss) . "&i=d", false);
      if ($raw !== null) {
        $lines = preg_split('/\r?\n/', trim($raw));
        $out = [];
        for ($i = 1; $i < count($lines); $i++) {   // 0=헤더
          $p = explode(",", $lines[$i]);
          if (count($p) < 5 || $p[1] === "N/D" || $p[1] === "") continue;
          $o=(float)$p[1]; $h=(float)$p[2]; $l=(float)$p[3]; $c=(float)$p[4]; $v=isset($p[5])?(float)$p[5]:0;
          if (is_finite($o)&&is_finite($h)&&is_finite($l)&&is_finite($c)&&$c>0) $out[] = ["t"=>$p[0],"o"=>$o,"h"=>$h,"l"=>$l,"c"=>$c,"v"=>$v];
        }
        if (count($out) >= 2) { $candles = array_slice($out, -400); $source = "stooq"; }
      }
    }

    // 증분 머지: 기존 누적 + 새 봉을 t 기준 병합(같은 t=최신으로 갱신 → 진행중 봉 업데이트, 신규 봉만 추가)
    if ($candles !== null && $incremental) {
      $map = [];
      foreach ($prev as $c) if (isset($c["t"])) $map[(string)$c["t"]] = $c;
      foreach ($candles as $c) if (isset($c["t"])) $map[(string)$c["t"]] = $c;
      ksort($map, SORT_STRING);
      $candles = array_values($map);
      if (count($candles) > 6000) $candles = array_slice($candles, -6000);
      if ($source) $source .= "+inc";
    }
    // 새 데이터 못 받음 → 저장된 누적 캐시로 폴백(갱신 실패해도 차트 유지)
    if ($candles === null && $incremental) { touch($cf); echo json_encode(["ok"=>true,"symbol"=>$sym,"tf"=>$tf,"source"=>"cache-stale","name"=>"","candles"=>$prev], JSON_UNESCAPED_UNICODE); exit; }
    if ($candles === null) { http_response_code(502); echo json_encode(["ok"=>false,"error"=>"notfound","symbol"=>$sym]); exit; }
    $payload = json_encode(["ok"=>true,"symbol"=>$sym,"tf"=>$tf,"source"=>$source,"name"=>$name,"candles"=>$candles], JSON_UNESCAPED_UNICODE);
    @file_put_contents($cf, $payload);
    echo $payload; exit;
  }
  // 라이브 트랙레코드 원장: 만기 도래 예측을 OHLC 캐시로 자동 채점 + 집계 반환
  if (isset($_GET["predledger"])) {
    $pf = __DIR__ . "/forge_predlog.json";
    $plock = fopen($pf . ".lock", "c"); if ($plock) { flock($plock, LOCK_EX); }
    $pdoc = is_file($pf) ? json_decode(file_get_contents($pf), true) : null;
    if (!is_array($pdoc) || !isset($pdoc["recs"]) || !is_array($pdoc["recs"])) $pdoc = ["recs"=>[]];
    $today = date("Y-m-d");
    $cache = [];   // "sym|tf" → candles | false
    $resolvedNow = 0;
    $rvol = function($cds, $s, $e) { $n=0; $sum=0; for ($i=$s+1; $i<=$e; $i++){ $p0=(float)$cds[$i-1]["c"]; $p1=(float)$cds[$i]["c"]; if ($p0>0 && $p1>0){ $lr=log($p1/$p0); $sum+=$lr*$lr; $n++; } } return $n ? sqrt($sum/$n) : 0; };
    // 추세 지속 채점용 근사 국면판정(MA20 기울기) — 엔진 state 분류기(_cTS·채널)를 OHLC만으로 완전 재현 불가라 투명한 근사. asOf/만기 동일 규칙.
    $pstate = function($cds, $idx) { if ($idx < 30 || $idx >= count($cds)) return null;
      $s=0; for($i=$idx-19;$i<=$idx;$i++)$s+=(float)$cds[$i]["c"]; $ma20=$s/20;
      $sp=0; for($i=$idx-29;$i<=$idx-10;$i++)$sp+=(float)$cds[$i]["c"]; $ma20p=$sp/20;
      if($ma20p<=0)return null; $slope=$ma20/$ma20p-1;
      if(abs($slope)<0.004)return "range"; return $slope>=0?"up":"down"; };
    // 상대강도(v1.10 SPY·v1.11 섹터 ETF) 채점용 벤치 캐시(심볼별 1회 로드)
    $benchCds = [];   // "SPY"|"XLK"… → candles | false
    $benchLoad = function($bsym) use (&$benchCds) {
      if (isset($benchCds[$bsym])) return $benchCds[$bsym];
      $cf = __DIR__ . "/forge_ohlc_cache_" . md5($bsym . "|1day") . ".json";
      $cj = is_readable($cf) ? json_decode(@file_get_contents($cf), true) : null;
      return $benchCds[$bsym] = (is_array($cj) && isset($cj["candles"]) && is_array($cj["candles"])) ? $cj["candles"] : false;
    };
    // 벤치 대비 20봉 상대수익 일치 채점(rel·sec 공용): 예측 아웃퍼폼(prob>=50) vs 실제
    $relScore = function($bsym, $asOf, $a, $symM, $prob) use ($benchLoad) {
      $b = $benchLoad($bsym);
      if ($b === false || count($b) < 25) return null;
      $si = -1;
      for ($i = count($b) - 1; $i >= 0; $i--) { $t = isset($b[$i]["t"]) ? substr((string)$b[$i]["t"], 0, 10) : ""; if ($t !== "" && $t <= $asOf) { $si = $i; break; } }
      if ($si < 0 || $si + 20 >= count($b)) return null;
      $sa = (float)$b[$si]["c"]; $sm = (float)$b[$si + 20]["c"];
      if (!($sa > 0) || !($sm > 0) || !($symM > 0) || !($a > 0)) return null;
      $act = ($symM / $a > $sm / $sa) ? 1 : 0;
      return ((((int)$prob) >= 50 ? 1 : 0) === $act) ? 1 : 0;
    };
    foreach ($pdoc["recs"] as &$r) {
      if (!empty($r["resolved"])) continue;
      if (!isset($r["resolveAfter"]) || $r["resolveAfter"] > $today) continue;
      if ($resolvedNow >= 60) break;   // 호출당 채점 상한
      $key = $r["sym"] . "|" . $r["tf"];
      if (!isset($cache[$key])) {
        $cf = __DIR__ . "/forge_ohlc_cache_" . md5($r["sym"] . "|" . $r["tf"]) . ".json";
        $cj = is_readable($cf) ? json_decode(@file_get_contents($cf), true) : null;
        $cache[$key] = (is_array($cj) && isset($cj["candles"]) && is_array($cj["candles"])) ? $cj["candles"] : false;
      }
      $cds = $cache[$key];
      if ($cds === false || count($cds) < 3) continue;   // 캐시 없음 → 대기
      $ai = -1;
      for ($i = count($cds) - 1; $i >= 0; $i--) { $t = isset($cds[$i]["t"]) ? substr((string)$cds[$i]["t"], 0, 10) : ""; if ($t !== "" && $t <= $r["asOf"]) { $ai = $i; break; } }
      if ($ai < 0) continue;
      $fut = max(1, (int)$r["futW"]);
      $need = max($fut, 20);
      if ($ai + $need >= count($cds)) continue;   // 만기 봉 아직 없음 → 대기
      $a = (float)$r["asOfPrice"]; if (!($a > 0)) $a = (float)$cds[$ai]["c"];
      $mp = (float)$cds[$ai + $fut]["c"];
      if (!($a > 0) || !($mp > 0)) continue;
      // 방향(futW 지평)
      $dirOk = null;
      if (isset($r["dir"]) && (int)$r["dir"] != 0) { $ru = $mp > $a ? 1 : ($mp < $a ? -1 : 0); if ($ru != 0) $dirOk = (((int)$r["dir"] > 0 ? 1 : -1) === $ru) ? 1 : 0; }
      // 변동성(futW 전/후 창)
      $volOk = null;
      if ($ai - $fut >= 0) { $vb = $rvol($cds, $ai - $fut, $ai); $va = $rvol($cds, $ai, $ai + $fut); if ($vb > 0 && $va > 0) $volOk = (((int)$r["volExp"]) === ($va > $vb ? 1 : 0)) ? 1 : 0; }
      // 낙폭·이익목표(1개월=20봉, ±5%)
      $lo = INF; $hi = -INF;
      for ($i = $ai + 1; $i <= $ai + 20; $i++) { $c = (float)$cds[$i]["c"]; if ($c < $lo) $lo = $c; if ($c > $hi) $hi = $c; }
      $ddHit = ($lo / $a - 1) <= -0.05 ? 1 : 0;
      $upHit = ($hi / $a - 1) >= 0.05 ? 1 : 0;
      // 급변(v1.8): 향후 20봉 내 하루 |수익|>2.5×현재20봉변동성 발생?
      $spkEv = null;
      if ($ai - 20 >= 0) { $sv = $rvol($cds, $ai - 20, $ai);
        if ($sv > 0) { $spkEv = 0; for ($i=$ai+1;$i<=$ai+20;$i++){ $p0=(float)$cds[$i-1]["c"]; $p1=(float)$cds[$i]["c"]; if ($p0>0&&$p1>0&&abs($p1/$p0-1)>2.5*$sv){ $spkEv=1; break; } } } }
      // 갭(v1.9.4): 주식만 · 향후 20봉 내 |시가/전일종가−1|>2.2×현재60봉갭변동성 발생?
      $gapEv = null;
      if (!empty($r["gapStock"])) { $gs=0;$gn=0; for($i=$ai-59;$i<=$ai;$i++){ if($i>=1){ $op=(float)$cds[$i]["o"]; $pc=(float)$cds[$i-1]["c"]; if($op>0&&$pc>0){ $g=$op/$pc-1; $gs+=$g*$g; $gn++; } } } $gv=$gn?sqrt($gs/$gn):0;
        if ($gv > 0) { $gapEv = 0; for($i=$ai+1;$i<=$ai+20;$i++){ $op=(float)$cds[$i]["o"]; $pc=(float)$cds[$i-1]["c"]; if($op>0&&$pc>0&&abs($op/$pc-1)>2.2*$gv){ $gapEv=1; break; } } } }
      // 추세 지속(v1.9.5): asOf 국면(up/down)이 20봉 뒤에도 유지되나(근사 국면판정) — 예측 지속≥50 vs 실제 유지 일치?
      $tpOk = null;
      if (isset($r["tpState"]) && ($r["tpState"]==="up"||$r["tpState"]==="down")) { $fs = $pstate($cds, $ai + 20);
        if ($fs !== null) { $persistAct = ($fs === $r["tpState"]) ? 1 : 0; $tpPred = ((int)$r["tpPersist"] >= 50) ? 1 : 0; $tpOk = ($tpPred === $persistAct) ? 1 : 0; } }
      // 상대강도(v1.10 SPY·v1.11 섹터): 주식·일봉만 — 20봉 뒤 종목수익 vs 벤치수익, 예측 아웃퍼폼과 실제 일치?
      $relOk = null; $secOk = null;
      if ($r["tf"] === "1day") {
        $symM20 = (float)$cds[$ai + 20]["c"];
        if (!empty($r["relStock"])) $relOk = $relScore("SPY", $r["asOf"], $a, $symM20, isset($r["relP"]) ? $r["relP"] : 50);
        if (!empty($r["secEtf"])) $secOk = $relScore($r["secEtf"], $r["asOf"], $a, $symM20, isset($r["secP"]) ? $r["secP"] : 50);
      }
      $r["resolved"] = true; $r["ret"] = round($mp / $a - 1, 4);
      $r["out"] = ["dir"=>$dirOk, "vol"=>$volOk, "dd"=>$ddHit, "up"=>$upHit, "spk"=>$spkEv, "gap"=>$gapEv, "tp"=>$tpOk, "rel"=>$relOk, "sec"=>$secOk];
      $resolvedNow++;
    }
    unset($r);
    $agg = ["dir"=>["n"=>0,"hit"=>0], "vol"=>["n"=>0,"hit"=>0], "dd"=>["n"=>0,"ev"=>0,"ps"=>0], "up"=>["n"=>0,"ev"=>0,"ps"=>0],
            "spk"=>["n"=>0,"ev"=>0,"ps"=>0], "gap"=>["n"=>0,"ev"=>0,"ps"=>0], "tp"=>["n"=>0,"hit"=>0], "rel"=>["n"=>0,"hit"=>0], "sec"=>["n"=>0,"hit"=>0]];
    $pending = 0; $resolved = 0; $since = null;
    foreach ($pdoc["recs"] as $r) {
      if (empty($r["resolved"])) { $pending++; continue; }
      $resolved++;
      if ($since === null || $r["asOf"] < $since) $since = $r["asOf"];
      $o = isset($r["out"]) ? $r["out"] : [];
      if (isset($o["dir"]) && $o["dir"] !== null) { $agg["dir"]["n"]++; $agg["dir"]["hit"] += (int)$o["dir"]; }
      if (isset($o["vol"]) && $o["vol"] !== null) { $agg["vol"]["n"]++; $agg["vol"]["hit"] += (int)$o["vol"]; }
      if (isset($o["dd"])) { $agg["dd"]["n"]++; $agg["dd"]["ev"] += (int)$o["dd"]; $agg["dd"]["ps"] += (float)$r["ddP"]; }
      if (isset($o["up"])) { $agg["up"]["n"]++; $agg["up"]["ev"] += (int)$o["up"]; $agg["up"]["ps"] += (float)$r["upP"]; }
      if (isset($o["spk"]) && $o["spk"] !== null) { $agg["spk"]["n"]++; $agg["spk"]["ev"] += (int)$o["spk"]; $agg["spk"]["ps"] += (float)(isset($r["spkP"])?$r["spkP"]:0); }
      if (isset($o["gap"]) && $o["gap"] !== null) { $agg["gap"]["n"]++; $agg["gap"]["ev"] += (int)$o["gap"]; $agg["gap"]["ps"] += (float)(isset($r["gapP"])?$r["gapP"]:0); }
      if (isset($o["tp"]) && $o["tp"] !== null) { $agg["tp"]["n"]++; $agg["tp"]["hit"] += (int)$o["tp"]; }
      if (isset($o["rel"]) && $o["rel"] !== null) { $agg["rel"]["n"]++; $agg["rel"]["hit"] += (int)$o["rel"]; }
      if (isset($o["sec"]) && $o["sec"] !== null) { $agg["sec"]["n"]++; $agg["sec"]["hit"] += (int)$o["sec"]; }
    }
    if ($resolvedNow > 0) { $ptmp = $pf . ".tmp." . getmypid(); if (file_put_contents($ptmp, json_encode($pdoc, JSON_UNESCAPED_UNICODE)) !== false) @rename($ptmp, $pf); }
    if ($plock) { flock($plock, LOCK_UN); fclose($plock); }
    $mk = function($a) { return ["n"=>$a["n"], "rate"=>$a["n"] ? round($a["hit"]/$a["n"], 3) : null]; };
    $mkp = function($a) { return ["n"=>$a["n"], "actRate"=>$a["n"] ? round($a["ev"]/$a["n"], 3) : null, "predAvg"=>$a["n"] ? round($a["ps"]/$a["n"]/100, 3) : null]; };
    echo json_encode(["ok"=>true, "resolved"=>$resolved, "pending"=>$pending, "since"=>$since, "dir"=>$mk($agg["dir"]), "vol"=>$mk($agg["vol"]), "dd"=>$mkp($agg["dd"]), "up"=>$mkp($agg["up"]), "spk"=>$mkp($agg["spk"]), "gap"=>$mkp($agg["gap"]), "tp"=>$mk($agg["tp"]), "rel"=>$mk($agg["rel"]), "sec"=>$mk($agg["sec"])], JSON_UNESCAPED_UNICODE);
    exit;
  }
  if ($AUTH_ON && !$UID) { echo "null"; exit; }   // 게스트(체험): 문서 없음 → 클라가 샘플 시드
  if (is_file($f)) { readfile($f); } else { echo "null"; }
  exit;
}

if ($method !== "POST") { http_response_code(405); jout(["ok"=>false,"error"=>"method"]); }

if (!check_key($WRITE_KEY)) { http_response_code(403); jout(["ok"=>false,"error"=>"key"]); }
$d = json_decode(file_get_contents("php://input"), true);
if (!is_array($d) || !isset($d["op"])) { http_response_code(400); jout(["ok"=>false,"error"=>"noop"]); }
$op = $d["op"];
// 게스트(체험) 쓰기 차단 — 문서·이미지·원장 계열(fail-closed). jobs 계열은 비전 워커 경로라 종전 유지.
if ($AUTH_ON && !$UID && in_array($op, ["replace","upsert","delete","reorder","meta","putimg","logpred"], true)) {
  http_response_code(401); jout(["ok"=>false,"error"=>"login"]);
}

if ($op === "putimg") {
  $iid = isset($d["id"]) ? $d["id"] : null;
  $src = isset($d["src"]) ? $d["src"] : null;
  if ($iid === null || !is_string($src)) { http_response_code(400); jout(["ok"=>false,"error"=>"invalid"]); }
  $ilock = fopen($IMGF . ".lock", "c"); if ($ilock) { flock($ilock, LOCK_EX); }
  $imgs = is_file($IMGF) ? json_decode(file_get_contents($IMGF), true) : [];
  if (!is_array($imgs)) $imgs = [];
  $imgs[$iid] = $src;
  $itmp = $IMGF . ".tmp." . getmypid();
  $okw = file_put_contents($itmp, json_encode($imgs, JSON_UNESCAPED_UNICODE)) !== false && rename($itmp, $IMGF);
  if ($ilock) { flock($ilock, LOCK_UN); fclose($ilock); }
  if (!$okw) { http_response_code(500); jout(["ok"=>false,"error"=>"write"]); }
  jout(["ok"=>true]);
}

if ($op === "logpred") {
  $sym = isset($d["sym"]) ? trim((string)$d["sym"]) : "";
  if (!preg_match('/^[A-Za-z0-9.\-^=\/]{1,16}$/', $sym)) { jout(["ok"=>false,"error"=>"badsym"]); }
  $tf = (isset($d["tf"]) && in_array($d["tf"], ["1day","1week","1month"], true)) ? $d["tf"] : "1day";
  $asOf = (isset($d["asOf"]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d["asOf"])) ? $d["asOf"] : date("Y-m-d");
  $pf = __DIR__ . "/forge_predlog.json";
  $plock = fopen($pf . ".lock", "c"); if ($plock) { flock($plock, LOCK_EX); }
  $pdoc = is_file($pf) ? json_decode(file_get_contents($pf), true) : null;
  if (!is_array($pdoc) || !isset($pdoc["recs"]) || !is_array($pdoc["recs"])) $pdoc = ["recs"=>[]];
  $dup = false;
  foreach ($pdoc["recs"] as $r) { if (isset($r["sym"],$r["tf"],$r["asOf"]) && $r["sym"]===$sym && $r["tf"]===$tf && $r["asOf"]===$asOf) { $dup = true; break; } }
  if (!$dup) {
    $clip = function($v){ return max(0, min(100, (int)round((float)$v))); };
    $futW = isset($d["futW"]) ? max(1, min(400, (int)$d["futW"])) : 60;
    $perBar = $tf === "1week" ? 7 : ($tf === "1month" ? 31 : 1.5);
    $resolveAfter = date("Y-m-d", strtotime($asOf . " +" . (int)ceil(max($futW, 20) * $perBar + 3) . " days"));
    $pdoc["recs"][] = [
      "sym"=>$sym, "tf"=>$tf, "asOf"=>$asOf, "resolveAfter"=>$resolveAfter,
      "asOfPrice"=> isset($d["asOfPrice"]) ? (float)$d["asOfPrice"] : 0,
      "futW"=> $futW,
      "dir"=> isset($d["dir"]) ? (int)$d["dir"] : 0,
      "up"=> $clip(isset($d["up"]) ? $d["up"] : 50),
      "volExp"=> !empty($d["volExp"]) ? 1 : 0,
      "ddP"=> $clip(isset($d["ddP"]) ? $d["ddP"] : 0),
      "upP"=> $clip(isset($d["upP"]) ? $d["upP"] : 0),
      "spkP"=> $clip(isset($d["spkP"]) ? $d["spkP"] : 0),
      "gapP"=> $clip(isset($d["gapP"]) ? $d["gapP"] : 0),
      "gapStock"=> !empty($d["gapStock"]) ? 1 : 0,
      "tpState"=> (isset($d["tpState"]) && in_array($d["tpState"], ["up","down","range"], true)) ? $d["tpState"] : "",
      "tpPersist"=> $clip(isset($d["tpPersist"]) ? $d["tpPersist"] : 50),
      "relP"=> $clip(isset($d["relP"]) ? $d["relP"] : 0),
      "relStock"=> !empty($d["relStock"]) ? 1 : 0,
      "secP"=> $clip(isset($d["secP"]) ? $d["secP"] : 0),
      "secEtf"=> (isset($d["secEtf"]) && preg_match('/^[A-Z]{2,6}$/', (string)$d["secEtf"])) ? (string)$d["secEtf"] : "",
      "resolved"=> false,
    ];
    if (count($pdoc["recs"]) > 4000) $pdoc["recs"] = array_slice($pdoc["recs"], -4000);
    $ptmp = $pf . ".tmp." . getmypid();
    if (file_put_contents($ptmp, json_encode($pdoc, JSON_UNESCAPED_UNICODE)) !== false) @rename($ptmp, $pf);
  }
  if ($plock) { flock($plock, LOCK_UN); fclose($plock); }
  jout(["ok"=>true, "dup"=>$dup]);
}

if ($op === "enqueue" || $op === "claim" || $op === "result") {
  $jf = __DIR__ . "/forge_jobs.json";
  $jlock = fopen($jf . ".lock", "c"); if ($jlock) { flock($jlock, LOCK_EX); }
  $jdoc = is_file($jf) ? json_decode(file_get_contents($jf), true) : null;
  if (!is_array($jdoc) || !isset($jdoc["jobs"]) || !is_array($jdoc["jobs"])) $jdoc = ["jobs"=>[], "_rev"=>0];
  $now = gmdate("c");
  $JOB_TTL = 300;  // working 잡 TTL(초): 이 시간 초과 시 stale로 간주하여 재수거
  $is_stale = function($j) use ($JOB_TTL, $now) {
    if (!isset($j["claimed"]) || !$j["claimed"]) return false;
    return (strtotime($now) - strtotime($j["claimed"])) > $JOB_TTL;
  };
  $resp = null; $code = 0;

  if ($op === "enqueue") {
    $docId = isset($d["docId"]) ? $d["docId"] : null;
    $imgId = isset($d["imgId"]) ? $d["imgId"] : null;
    $board = isset($d["board"]) && is_array($d["board"]) ? $d["board"] : null;
    if ($docId === null || $board === null) { $code = 400; }
    else {
      $dup = null; $stale_idx = null;
      foreach ($jdoc["jobs"] as $i => $j) {
        if (!isset($j["docId"]) || $j["docId"] !== $docId) continue;
        if ($j["status"] === "pending" || ($j["status"] === "working" && !$is_stale($j))) { $dup = $j; break; }
        if ($j["status"] === "working" && $is_stale($j)) { $stale_idx = $i; }
      }
      if ($dup) { $resp = ["ok"=>true, "job"=>$dup]; }
      elseif ($stale_idx !== null) {
        // stale working 잡 재수거 → pending으로 복귀 (토큰 무효화, 워커 늦은 result는 409)
        $jdoc["jobs"][$stale_idx]["status"] = "pending";
        $jdoc["jobs"][$stale_idx]["token"] = null;
        $jdoc["jobs"][$stale_idx]["claimed"] = null;
        $resp = ["ok"=>true, "job"=>$jdoc["jobs"][$stale_idx]];
      }
      else {
        $job = [
          "id" => "job_" . bin2hex(random_bytes(6)),
          "docId" => $docId, "imgId" => $imgId, "board" => $board,
          "status" => "pending", "token" => null,
          "created" => $now, "claimed" => null, "finished" => null,
          "result" => null, "error" => null
        ];
        $jdoc["jobs"][] = $job;
        // GC: done/error 잡 20개 초과 시 created 오름차순으로 초과분 제거
        $done = array_values(array_filter($jdoc["jobs"], function($j){ return $j["status"] === "done" || $j["status"] === "error"; }));
        if (count($done) > 20) {
          usort($done, function($a, $b){ return strcmp($a["created"], $b["created"]); });
          $remove = array_slice($done, 0, count($done) - 20);
          $rmids = array_map(function($j){ return $j["id"]; }, $remove);
          $jdoc["jobs"] = array_values(array_filter($jdoc["jobs"], function($j) use ($rmids){ return !in_array($j["id"], $rmids, true); }));
        }
        $resp = ["ok"=>true, "job"=>$job];
      }
    }
  } elseif ($op === "claim") {
    $picked = null;
    foreach ($jdoc["jobs"] as $i => $j) {
      if ($j["status"] === "pending" || ($j["status"] === "working" && $is_stale($j))) {
        $tok = bin2hex(random_bytes(8));
        $jdoc["jobs"][$i]["status"] = "working";
        $jdoc["jobs"][$i]["token"] = $tok;
        $jdoc["jobs"][$i]["claimed"] = $now;
        $picked = $jdoc["jobs"][$i];
        break;
      }
    }
    $resp = ["ok"=>true, "job"=>$picked, "token"=>($picked ? $picked["token"] : null)];
  } elseif ($op === "result") {
    $jid = isset($d["jobId"]) ? $d["jobId"] : null;
    $tok = isset($d["token"]) ? $d["token"] : null;
    $found = false;
    foreach ($jdoc["jobs"] as $i => $j) {
      if (isset($j["id"]) && $j["id"] === $jid) {
        $found = true;
        if (!isset($j["token"]) || $j["token"] !== $tok) { $code = 409; break; }
        if (isset($d["error"])) { $jdoc["jobs"][$i]["status"] = "error"; $jdoc["jobs"][$i]["error"] = $d["error"]; }
        else { $jdoc["jobs"][$i]["status"] = "done"; $jdoc["jobs"][$i]["result"] = isset($d["result"]) ? $d["result"] : null; }
        $jdoc["jobs"][$i]["finished"] = $now;
        $resp = ["ok"=>true];
        break;
      }
    }
    if (!$found) { $code = 404; }
  }

  if ($code !== 0) {
    if ($jlock) { flock($jlock, LOCK_UN); fclose($jlock); }
    http_response_code($code);
    jout(["ok"=>false, "error"=>($code === 404 ? "nojob" : ($code === 409 ? "token" : "invalid"))]);
  }
  $jdoc["_rev"] = (isset($jdoc["_rev"]) ? intval($jdoc["_rev"]) : 0) + 1;
  $jtmp = $jf . ".tmp." . getmypid();
  $okw = file_put_contents($jtmp, json_encode($jdoc, JSON_UNESCAPED_UNICODE)) !== false && rename($jtmp, $jf);
  if ($jlock) { flock($jlock, LOCK_UN); fclose($jlock); }
  if (!$okw) { http_response_code(500); jout(["ok"=>false,"error"=>"write"]); }
  jout($resp);
}

$lock = fopen($f . ".lock", "c");
if ($lock) { flock($lock, LOCK_EX); }

$doc = ["documents"=>[], "meta"=>new stdClass(), "_rev"=>0];
if (is_file($f)) {
  $cur = json_decode(file_get_contents($f), true);
  if (is_array($cur) && isset($cur["documents"]) && is_array($cur["documents"])) $doc = $cur;
}
if (!isset($doc["documents"]) || !is_array($doc["documents"])) $doc["documents"] = [];
if (!isset($doc["meta"]) || !is_array($doc["meta"])) $doc["meta"] = [];

$err = "";
if ($op === "replace") {
  $nd = isset($d["doc"]) ? $d["doc"] : null;
  if (!is_array($nd) || !isset($nd["documents"]) || !is_array($nd["documents"])) $err = "invalid";
  else { $doc["documents"] = $nd["documents"]; $doc["meta"] = isset($nd["meta"]) && is_array($nd["meta"]) ? $nd["meta"] : []; }
} elseif ($op === "upsert") {
  $it = isset($d["document"]) ? $d["document"] : null;
  if (!is_array($it) || !isset($it["id"])) $err = "invalid";
  else {
    $found = false;
    foreach ($doc["documents"] as $i => $x) { if (isset($x["id"]) && $x["id"] === $it["id"]) { $doc["documents"][$i] = $it; $found = true; break; } }
    if (!$found) $doc["documents"][] = $it;
  }
} elseif ($op === "delete") {
  $id = isset($d["id"]) ? $d["id"] : null;
  if ($id === null) $err = "invalid";
  else $doc["documents"] = array_values(array_filter($doc["documents"], function($x) use ($id){ return !(isset($x["id"]) && $x["id"] === $id); }));
} elseif ($op === "reorder") {
  $order = isset($d["order"]) && is_array($d["order"]) ? $d["order"] : null;
  if ($order === null) $err = "invalid";
  else {
    $map = [];
    foreach ($doc["documents"] as $x) { if (isset($x["id"])) $map[$x["id"]] = $x; }
    $new = [];
    foreach ($order as $id) { if (isset($map[$id])) { $new[] = $map[$id]; unset($map[$id]); } }
    foreach ($map as $x) { $new[] = $x; }
    $doc["documents"] = $new;
  }
} elseif ($op === "meta") {
  $m = isset($d["meta"]) && is_array($d["meta"]) ? $d["meta"] : [];
  foreach ($m as $k => $v) { $doc["meta"][$k] = $v; }
} else {
  $err = "badop";
}

if ($err !== "") { if ($lock){flock($lock,LOCK_UN);fclose($lock);} http_response_code(400); jout(["ok"=>false,"error"=>$err]); }

$doc["_rev"] = (isset($doc["_rev"]) ? intval($doc["_rev"]) : 0) + 1;
$tmp = $f . ".tmp." . getmypid();
$okw = file_put_contents($tmp, json_encode($doc, JSON_UNESCAPED_UNICODE)) !== false && rename($tmp, $f);
if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
if (!$okw) { http_response_code(500); jout(["ok"=>false,"error"=>"write"]); }
jout(["ok"=>true, "rev"=>$doc["_rev"]]);
