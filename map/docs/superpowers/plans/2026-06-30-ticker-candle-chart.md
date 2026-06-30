# 티커 캔들차트 자동 생성 + 작도 (Ticker Candle Chart) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 티커만 입력하면 실 OHLC를 가져와 고화질 캔들차트를 자체 렌더하고 그 위에 작도 — 저화질 원본 이미지 의존 제거.

**Architecture:** 서버 프록시(`forge-api.php`)가 Twelve Data(서버키)→Stooq(무키) 폴백으로 OHLC를 정규화·캐시해 제공. 클라(`forge.html`)는 기존 `ticker` 노드에서 fetch해 노드에 series+ohlc 저장 → `priceSeries()`가 차트 모드를 켜고 `fcDrawMainChart`가 캔들 렌더. 코어(`forge-core.js`)는 종가만 쓰므로 무변경.

**Tech Stack:** PHP(cafe24, 프록시) + 바닐라 JS(단일 HTML, Canvas 2D). 외부 JS 라이브러리 없음. 외부 데이터: Twelve Data REST + Stooq CSV.

## Global Constraints

- 바닐라 JS·무빌드·단일 HTML 유지. 프레임워크/번들러/외부 JS 라이브러리 금지.
- **`forge-core.js` 무변경** — 코어 테스트 `node --test forge-core.test.js` 83/83 유지.
- 다크 토큰만: 골드 `#e8b463`, bull `#46c28e`, bear `#e06a6a`, 보조 `#8a92b2`, bg `#0b0f14`. UI 한국어. `noindex` 유지.
- **따옴표 위생**: 편집 도구가 ASCII `"`→굽은 따옴표 `“”`로 바꾸는 사고 반복. 의도된 굽은 따옴표는 `&ldquo;`/`&rdquo;`, 가운뎃점은 `\xb7`. 각 커밋 전 `git diff` 확인.
- **보안**: Twelve Data 키는 **서버 전용 파일 `forge_td_key.txt`**(`.gitignore`·배포 금지)에서만 읽음. 클라이언트는 심볼/tf만 전송(업스트림 URL·키 모름). symbol 화이트리스트 정규식.
- **배포 불가침**: `forge_data.json`·`forge_images.json`·`forge_jobs.json`·`forge_td_key.txt`·`forge_ohlc_cache_*.json`. 배포는 `forge.html`+`forge-api.php`만.
- **POST <128KB 유지**(cafe24): 노드에 저장하는 `ohlc`는 최근 250봉 캡 + 반올림.
- 단일 소스·이중계상 방지·회귀 0: 티커 fetch 없을 때는 기존(이미지/비전/붙여넣기) 동작 그대로.

## 검증 공통

- forge.html 인라인 JS 파싱: `node -e "const fs=require('fs');const h=fs.readFileSync('forge.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');new Function(m);console.log('JS OK')"`
- 코어 회귀: `cd map && node --test forge-core.test.js 2>&1 | grep -E "^. (pass|fail)"` → 83 pass / 0 fail.
- PHP: 로컬 PHP가 있으면 `php -l forge-api.php`(문법). 없으면 자기검토 + **배포 후 라이브 curl**(최종 단계에서 수행).

---

## 현황 앵커 (구현 전 읽을 것)

- `forge-api.php`(GET 핸들러 22~42행): `?check`/`?images`/`?jobs` 분기 후 기본 `readfile($forge_data)`. 신규 `?ohlc` 분기를 **이 GET 블록 안, 기본 readfile 전에** 추가. 키 파일 패턴은 `forge_key.txt`(13행) 참고. (프록시 curl·캐시·화이트리스트 패턴은 `signal/api.php` 참고.)
- `forge.html`:
  - `FORGE_API = "forge-api.php"`(664행), `SERVER_OK`(667행), `bToast(msg)`, `markDirty()`, `runForge()`, `renderChart(result,data)`.
  - `priceSeries()`(약 3894행): price 노드 `series`(길이≥20·유한) 또는 비전 시계열 반환. `hasRealSeries()=!!priceSeries()`.
  - `buildData(series)`(약 3900행 근처): `{price, candle: series.map(c=>({o:c,h:c,l:c,c})), orange:[], blue:[], n}`. `currentData()`가 이걸 호출.
  - `fcDrawMainChart(series, pred)`(약 2414행): `fcFitKeep(cv,ch,3)`+`clearRect`+`_heroZoom` 변환(이미 적용됨) 안에서 종가 **선**(`FC_GOLD`) 렌더. 기하 `cv._mainGeo` stash.
  - 캔들 드로잉 참고(이식 원본) `fcDrawMain`(약 2010~2024행): `isUp=cd.c>=cd.o`, wick `moveTo(x,toY(h))→lineTo(x,toY(l))`, body `fillRect(x-bw/2, toY(max(o,c)), bw, max(1, toY(min(o,c))-toY(max(o,c))))`, 색 `FC_BULL`/`FC_BEAR`.
  - ticker 노드: 정의 `{type:"ticker", params:{symbol:"", price:null}}`(689행). 편집기 행(1290~1292행, `data-tkr="symbol"`/`"price"`). 입력 커밋 핸들러 `panel.addEventListener("input", …)`의 `if (t.dataset.tkr)` 분기(약 4725행). 노드 카드 배지 `.b-tkr`(1122행).

---

## Task 1: 서버 프록시 — `forge-api.php` OHLC 엔드포인트

**Files:** Modify `map/forge-api.php` (GET 블록에 `?ohlc` 분기 추가). Modify `.gitignore`(키·캐시 제외).

**Interfaces:**
- Produces: GET `forge-api.php?ohlc=1&symbol=<sym>&tf=<1day|1week|1month>` → `{ok:true, symbol, tf, source:"twelvedata"|"stooq", candles:[{t,o,h,l,c,v}]}`(시간순) / 실패 시 4xx·5xx + `{ok:false, error}`.

- [ ] **Step 1: `.gitignore`에 키·캐시 추가**

`map/.gitignore`(없으면 생성)에 추가:
```
forge_td_key.txt
forge_ohlc_cache_*.json
```
(기존 `forge_data.json` 등 무시 항목이 있으면 유지.)

- [ ] **Step 2: OHLC 엔드포인트 구현 — `forge-api.php` GET 블록의 기본 `readfile($f)` 직전에 삽입**

`forge-api.php`에서 `if (isset($_GET["jobs"])) { ... }` 블록과 `if (is_file($f)) { readfile($f); }` 사이에 추가:

```php
  if (isset($_GET["ohlc"])) {
    $sym = isset($_GET["symbol"]) ? trim($_GET["symbol"]) : "";
    $tf  = isset($_GET["tf"]) ? $_GET["tf"] : "1day";
    if (!in_array($tf, ["1day","1week","1month"], true)) $tf = "1day";
    if (!preg_match('/^[A-Za-z0-9.\-^=]{1,16}$/', $sym)) { http_response_code(400); echo json_encode(["ok"=>false,"error"=>"badsymbol"]); exit; }

    // 캐시 (일봉 1h / 주·월 6h)
    $ttl = ($tf === "1day") ? 3600 : 21600;
    $cf = __DIR__ . "/forge_ohlc_cache_" . md5($sym . "|" . $tf) . ".json";
    if (is_readable($cf) && (time() - filemtime($cf)) < $ttl) { readfile($cf); exit; }

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

    $candles = null; $source = null;

    // 1) Twelve Data (서버 전용 키)
    $TD_KEY = is_file(__DIR__ . "/forge_td_key.txt") ? trim(file_get_contents(__DIR__ . "/forge_td_key.txt")) : "";
    if ($TD_KEY !== "") {
      $u = "https://api.twelvedata.com/time_series?symbol=" . urlencode($sym) . "&interval=" . urlencode($tf) . "&outputsize=400&format=JSON&apikey=" . urlencode($TD_KEY);
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

    // 2) Stooq 폴백 (무키 CSV) — 미국주식/지수/포렉스 일봉
    if ($candles === null) {
      $ss = strtolower($sym);
      if (strpos($ss, ".") === false && strpos($ss, "^") === false && strpos($ss, "=") === false) $ss .= ".us";  // 평이 심볼=미국주식 가정
      $ss = str_replace("-usd", "usd", $ss);   // BTC-USD → btcusd
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

    if ($candles === null) { http_response_code(502); echo json_encode(["ok"=>false,"error"=>"notfound","symbol"=>$sym]); exit; }
    $payload = json_encode(["ok"=>true,"symbol"=>$sym,"tf"=>$tf,"source"=>$source,"candles"=>$candles], JSON_UNESCAPED_UNICODE);
    @file_put_contents($cf, $payload);
    echo $payload; exit;
  }
```

- [ ] **Step 3: 문법 검증 + 커밋**

```bash
cd map
command -v php >/dev/null && php -l forge-api.php || echo "php 없음 — 배포 후 라이브 curl로 검증"
```
(php 있으면 `No syntax errors`. 없으면 자기검토: 괄호·세미콜론·`exit` 짝.)
> **기능 검증은 배포 후 라이브 curl**(최종 단계): 무키 시 `?ohlc=1&symbol=AAPL` → `source:"stooq"` 캔들, 키 주입 후 `symbol=BTC-USD` → `source:"twelvedata"`, `symbol=ZZZZNON` → 502.

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-api.php map/.gitignore
git commit -m "feat(forge-api): OHLC 프록시 엔드포인트 — Twelve Data(서버키)+Stooq 폴백·정규화·캐시"
```

---

## Task 2: 캔들 렌더 기반 — priceSeries 확장 + priceOHLC + buildData OHLC + fcDrawMainChart 캔들

**Files:** Modify `map/forge.html` (`priceSeries`·`buildData`·신규 `priceOHLC`·`fcDrawMainChart`).

**Interfaces:**
- Consumes: ticker 노드의 `series`(종가 배열)·`ohlc`(`[{t,o,h,l,c,v}]`)를 외부 데이터 없이 합성 주입해 검증.
- Produces: `priceOHLC() → [{o,h,l,c}...]|null`; `priceSeries()`가 ticker 노드 `series` 인식; `fcDrawMainChart`가 OHLC 있을 때 캔들 렌더(없으면 선 폴백).

- [ ] **Step 1: `priceSeries()` 확장 — ticker 노드 fetched series 최우선**

`priceSeries()`(약 3894행) 본문의 price 노드 탐색 앞에 ticker 노드 series 우선 추가. 현재:
```js
  function priceSeries() {
    const p = boardState.nodes.find(n => n.blockType === "price");
    const s = p && p.series;
    const ps = (Array.isArray(s) && s.length >= 20 && s.every(x => isFinite(x))) ? s : null;
    const vs = (visionLive() && Array.isArray(_visionData.price) && _visionData.price.length >= 2) ? _visionData.price : null;
    if (vs && heroImgId() && _heroView !== "chart") return vs;
    return ps || vs;
  }
```
→ ticker 노드 series를 최우선으로:
```js
  function priceSeries() {
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && Array.isArray(n.series) && n.series.length >= 20 && n.series.every(x => isFinite(x)));
    if (tk) return tk.series;
    const p = boardState.nodes.find(n => n.blockType === "price");
    const s = p && p.series;
    const ps = (Array.isArray(s) && s.length >= 20 && s.every(x => isFinite(x))) ? s : null;
    const vs = (visionLive() && Array.isArray(_visionData.price) && _visionData.price.length >= 2) ? _visionData.price : null;
    if (vs && heroImgId() && _heroView !== "chart") return vs;
    return ps || vs;
  }
```

- [ ] **Step 2: `priceOHLC()` 신설 — 캔들 렌더용**

`priceSeries` 바로 뒤에 추가:
```js
  function priceOHLC() {
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && Array.isArray(n.ohlc) && n.ohlc.length >= 2);
    return tk ? tk.ohlc : null;
  }
```

- [ ] **Step 3: `buildData`가 실 OHLC를 캔들로 전달**

`buildData(series)`(약 3900행 근처)를 OHLC 우선으로:
```js
  function buildData(series) {
    const oh = priceOHLC();
    const candle = (oh && oh.length === series.length)
      ? oh.map(d => ({ o: d.o, h: d.h, l: d.l, c: d.c }))
      : series.map(c => ({ o: c, h: c, l: c, c }));
    return { price: series.slice(), candle, orange: [], blue: [], n: series.length };
  }
```
> 길이가 다르면(스케일·캡 등) 안전하게 종가 평탄 캔들 폴백. 작도/예측은 `price`(종가)만 쓰므로 무영향.

- [ ] **Step 4: `fcDrawMainChart`가 OHLC 있으면 캔들 렌더**

`fcDrawMainChart`(약 2414행)에서 **종가 history 선**을 그리는 부분(`// history line` 주석 + `c.strokeStyle = FC_GOLD … hist.forEach(...)`)을, OHLC가 있으면 캔들로 분기. 해당 선 드로잉 블록을 다음으로 교체:
```js
    // history: 캔들(OHLC 있을 때) 또는 선
    const _oh = (typeof priceOHLC === "function") ? priceOHLC() : null;
    const _ohH = (_oh && _oh.length) ? _oh.slice(-hist.length) : null;
    if (_ohH && _ohH.length === hist.length) {
      const bw = Math.max(1, (histW / hist.length) * 0.7);
      for (let i = 0; i < hist.length; i++) {
        const d = _ohH[i], x = toXh(i), up = d.c >= d.o, col = up ? "#46c28e" : "#e06a6a";
        c.strokeStyle = col; c.lineWidth = Math.max(0.7, bw * 0.16);
        c.beginPath(); c.moveTo(x, toY(d.h)); c.lineTo(x, toY(d.l)); c.stroke();
        const yt = toY(Math.max(d.o, d.c)), yb = toY(Math.min(d.o, d.c));
        c.fillStyle = col; c.fillRect(x - bw / 2, yt, bw, Math.max(1, yb - yt));
      }
    } else {
      c.strokeStyle = FC_GOLD; c.lineWidth = 2; c.beginPath();
      hist.forEach((v, i) => { const x = toXh(i), y = toY(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    }
```
> `hist`/`toXh`/`toY`/`histW`는 그 함수 내 기존 변수. y범위(loV/hiV)는 종가 기준이라 극단 wick이 살짝 잘릴 수 있으나 가독상 허용(정밀 범위확장은 비목표). 캔들은 `_mainGeo`·줌/팬·예측 콘·DPR3와 같은 좌표계 → 작도 정합 유지.
> **정합 전제**: 캔들 OHLC는 `currentData`가 넘긴 종가와 같은 스케일이어야 한다 — Task 3 `applyTickerOHLC`가 `params.price=마지막 종가`로 두어 스케일 계수를 1로 만든다(스케일 생략). 이 전제가 깨지면(price를 다른 값으로) 캔들이 선/콘과 어긋난다.

- [ ] **Step 5: 검증 + 커밋**

JS 파싱 OK, 코어 83/0. 자기검토: ticker 노드에 `series`(종가 25개↑)+`ohlc`(같은 길이) 합성 주입 시 → `hasRealSeries()` true → 차트 모드 → **캔들 렌더**(상승/하락 색·심지·바디) + 작도/줌/예측 정합. OHLC 없으면 선 폴백(회귀 0). 따옴표 무변형.
```bash
git add map/forge.html
git commit -m "feat(forge): hero 캔들 렌더(OHLC 시) + priceSeries 확장(ticker series) + priceOHLC + buildData OHLC"
```

---

## Task 3: 티커 UI + fetch + 영속 + 차트 기본화

**Files:** Modify `map/forge.html` (ticker 편집기 행·입력 핸들러·신규 `fetchOHLC`/`applyTickerOHLC`).

**Interfaces:**
- Consumes: Task 1 `forge-api.php?ohlc=`, Task 2 `priceSeries`/`priceOHLC`/`buildData`. `FORGE_API`, `bToast`, `markDirty`, `runForge`, `renderChart`, `currentData`.
- Produces: ticker 노드 편집기에 tf 셀렉트 + `불러오기` 버튼; `fetchOHLC(symbol, tf)`; fetched candles를 ticker 노드 `series`/`ohlc`/`tf`에 저장(캡·반올림) 후 재렌더.

- [ ] **Step 1: ticker 편집기에 tf 셀렉트 + 불러오기 버튼**

ticker 편집기 행(약 1290~1292행)에 심볼·현재가 다음 추가:
```js
      rows.push(`<div class="pp-row"><label>주기</label><select data-tkr="tf">
        <option value="1day"${((n.params&&n.params.tf)||"1day")==="1day"?" selected":""}>일봉</option>
        <option value="1week"${(n.params&&n.params.tf)==="1week"?" selected":""}>주봉</option>
        <option value="1month"${(n.params&&n.params.tf)==="1month"?" selected":""}>월봉</option>
      </select></div>`);
      rows.push(`<div class="pp-row"><label></label><button type="button" class="pp-load" data-tkr-load="1">📈 캔들 불러오기</button></div>`);
```
CSS(다른 `.pp-row`/버튼 근처):
```css
  .node-editor .pp-load{padding:6px 12px;border-radius:6px;border:1px solid var(--gold-dim);background:rgba(232,180,99,.14);color:var(--gold);font-size:12px;font-weight:700;cursor:pointer}
  .node-editor .pp-load:disabled{opacity:.5;cursor:default}
```

- [ ] **Step 2: 입력 핸들러에 tf 저장 추가**

입력 핸들러(약 4725행) `if (t.dataset.tkr) { ... }` 분기에서 symbol/price 처리에 tf 추가:
```js
        if (t.dataset.tkr) {
          n.params = n.params || {};
          if (t.dataset.tkr === "symbol") n.params.symbol = t.value;
          else if (t.dataset.tkr === "tf") n.params.tf = t.value;
          else { const v = Number(t.value); n.params.price = (t.value !== "" && isFinite(v)) ? v : null; }
          const el = bWorld && bWorld.querySelector(`.b-node[data-id="${n.id}"] .b-tkr`);
          if (el) { const sy = el.querySelector(".b-tkr-sym"), px = el.querySelector(".b-tkr-px"); if (sy) sy.textContent = n.params.symbol || "종목?"; if (px) px.textContent = isFinite(n.params.price) ? "$" + fmtNum(n.params.price) : "현재가 미입력"; }
        } else if (t.dataset.pkey) {
```
(markDirty는 핸들러 말미에 이미 호출되거나, 없으면 분기 끝에 `markDirty();` 추가 — 기존 패턴 확인 후 일치시킬 것.)

- [ ] **Step 3: 불러오기 버튼 click 핸들러 + `fetchOHLC`/`applyTickerOHLC`**

편집기 패널에 click 위임 핸들러 추가(기존 `panel.addEventListener("input", …)` 근처):
```js
      panel.addEventListener("click", async ev => {
        const b = ev.target.closest("[data-tkr-load]"); if (!b) return;
        if (sel.length !== 1) return; const n = bN(sel[0]); if (!n || n.blockType !== "ticker") return;
        const sym = (n.params && n.params.symbol || "").trim(); const tf = (n.params && n.params.tf) || "1day";
        if (!sym) { bToast("티커 심볼을 입력하세요"); return; }
        if (!SERVER_OK) { bToast("오프라인 — 서버 연결이 필요해요"); return; }
        b.disabled = true; const _t = b.textContent; b.textContent = "불러오는 중…";
        try {
          const r = await fetchOHLC(sym, tf);
          if (r && r.ok && Array.isArray(r.candles) && r.candles.length >= 2) {
            applyTickerOHLC(n, r);
            bToast(sym + " " + r.candles.length + "봉 (" + (r.source === "stooq" ? "Stooq" : "Twelve Data") + ")");
          } else bToast("심볼을 찾을 수 없어요: " + sym);
        } catch (e) { bToast("불러오기 실패 — 잠시 후 다시"); }
        b.disabled = false; b.textContent = _t;
      });
```
그리고 두 함수 추가(스크립트 적당한 위치, 예: `priceOHLC` 근처):
```js
  async function fetchOHLC(symbol, tf) {
    const r = await fetch(FORGE_API + "?ohlc=1&symbol=" + encodeURIComponent(symbol) + "&tf=" + encodeURIComponent(tf || "1day"), { cache: "no-store" });
    SERVER_OK = true;
    if (!r.ok) { let j = null; try { j = await r.json(); } catch (_) {} return j || { ok: false }; }
    return await r.json();
  }
  function applyTickerOHLC(n, r) {
    const cs = r.candles.slice(-250).map(d => ({   // 250봉 캡 + 반올림(POST<128KB)
      t: d.t, o: +(+d.o).toFixed(4), h: +(+d.h).toFixed(4), l: +(+d.l).toFixed(4), c: +(+d.c).toFixed(4)
    }));
    n.series = cs.map(d => d.c);
    n.ohlc = cs;
    n.params = n.params || {};
    n.params.tf = r.tf || "1day";
    n.params.price = cs[cs.length - 1].c;   // 현재가=마지막 실 종가 → currentData 스케일 계수 1(스케일 생략)·배지 표시
    _heroView = "chart";                 // 캔들차트를 주 화면으로
    markDirty(); runForge();
  }
```
> **정합 핵심**: `currentData()`는 ticker 노드 `price`로 종가를 스케일(`v*tp/last`)하는데, `price`를 마지막 종가로 두면 `tp===last` → 분기 조건(`Math.abs(last-tp)/tp>0.001`) 미충족 → **스케일 생략** → 종가(선/콘)와 `priceOHLC`(캔들)가 같은 비스케일 좌표라 정합. (price를 비우거나 다른 값이면 캔들이 어긋남.)
> `fetchOHLC` 실패 시 `SERVER_OK`는 catch에서 false 처리(상위 try/catch). 여기선 fetch 성공(HTTP 도달) 시 true. 오프라인(네트워크 throw)은 호출부 try/catch에서 토스트.

- [ ] **Step 4: 검증 + 커밋**

JS 파싱 OK, 코어 83/0. 자기검토: ticker 노드 심볼 입력 → 주기 선택 → `불러오기` → (로컬에선 서버 없으니 토스트만; 실 동작은 배포 후) 노드에 series/ohlc 저장·차트 모드 전환·캔들 렌더 경로. 빈 심볼/오프라인 가드. 따옴표 무변형.
```bash
git add map/forge.html
git commit -m "feat(forge): 티커 캔들 불러오기 UI(tf·버튼)+fetchOHLC+노드 영속(250봉 캡)+차트 기본화"
```

---

## 최종 (배포 + 라이브 검증)

전체 브랜치 리뷰(opus, 프록시 보안·정규화·따옴표·캔들 정합) → main 머지 → 배포(`forge.html`+`forge-api.php`; **`forge_td_key.txt`·캐시·데이터 JSON 업로드 금지**) → **라이브 curl**:
```bash
curl -s "https://parksvc.mycafe24.com/map/forge-api.php?ohlc=1&symbol=AAPL&tf=1day" | head -c 300   # source:"stooq" (키 전)
curl -s "https://parksvc.mycafe24.com/map/forge-api.php?ohlc=1&symbol=ZZZZNON" | head -c 200          # 502 notfound
```
사용자가 Twelve Data 키를 주면 `forge_td_key.txt`로 서버 주입 후 `symbol=BTC-USD` 재검증(`source:"twelvedata"`). 라이브에서 티커 입력→불러오기→캔들+작도 시각 확인.
