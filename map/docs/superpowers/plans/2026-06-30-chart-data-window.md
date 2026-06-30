# 차트 데이터-윈도 내비게이션 + 오토 스케일 + 무제한 과거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 티커 캔들차트를 TradingView식 데이터-윈도 내비게이션(휠=시간축 줌·드래그=과거 스크롤)으로 바꾸고, 보이는 구간 캔들 고저에 y축을 자동 적합하며, 과거 깊이를 재fetch 인메모리 모델로 무제한화한다.

**Architecture:** 캔들을 문서에 저장하지 않고 인메모리(`n._ohlc`/`n._series`, 언더스코어=직렬화 제외)로 보유 → 128KB 회피, 포지 로드 시 자동 재fetch. 균일 변환 줌(`_heroZoom`)을 항등으로 중립화하고, 보이는 봉 범위(`_chartWin{start,count}`)가 렌더 지오메트리를 구동. y범위는 윈도 캔들 고저로 매 렌더 재계산.

**Tech Stack:** PHP(프록시) + 바닐라 JS(단일 HTML, Canvas 2D). 외부 JS 라이브러리 없음. `forge-core.js` 무변경.

## Global Constraints

- 바닐라 JS·무빌드·단일 HTML 유지. 외부 라이브러리 금지. **`forge-core.js` 무변경**(코어 테스트 83/0 유지).
- 다크 토큰만(bull `#46c28e`/bear `#e06a6a`/골드 `#e8b463`/보조 `#8a92b2`). UI 한국어. `noindex` 유지.
- **따옴표 위생**: 편집 도구가 ASCII `"`→굽은 따옴표 `“”`로 바꾸는 사고 반복. 의도 굽은따옴표 `&ldquo;`/`&rdquo;`, 가운뎃점 `\xb7`. 각 커밋 전 `git diff` 확인.
- **128KB**: 캔들은 인메모리(`_`접두)만 — 문서에 저장 금지. `serializeActive`가 `_`접두를 이미 제외하므로 자동 충족.
- 티커 미로드·데이터 없음 시 기존(이미지/비전/baked·price 블록 붙여넣기) 동작 불변(회귀 0).
- log 토글(`tvLog`)·호버 툴팁·DPR·근거 포커스는 윈도/오토스케일 위에서 동작 유지.

## 검증 공통

- forge.html 인라인 JS 파싱: `node -e "const fs=require('fs');const h=fs.readFileSync('forge.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');new Function(m);console.log('JS OK')"`
- 코어: `cd map && node --test forge-core.test.js 2>&1 | grep -E "pass [0-9]+|fail [0-9]+"` → 83 pass / 0 fail.
- PHP: 로컬 없음 → 배포 후 라이브 curl(최종).

---

## 현황 앵커 (구현 전 읽을 것)

- `forge-api.php` OHLC 분기: `&outputsize=400&` (Twelve Data URL, ~71행).
- `forge.html`:
  - `applyTickerOHLC(n, r)`(~3941): `cs = r.candles.slice(-250)…`; `n.series`/`n.ohlc`/`n.params.{tf,price}` 설정 후 `_heroView="chart"; markDirty(); runForge()`.
  - `fetchOHLC(symbol, tf)`(~3935): `GET forge-api.php?ohlc=…` → JSON.
  - `priceSeries()`(~3920): ticker 노드 `n.series`(≥20) → price 노드 `n.series` → 비전. `priceOHLC()`(~3932): ticker `n.ohlc`.
  - 편집기 현재가 readonly 판정(~1294): `(Array.isArray(n.ohlc) && n.ohlc.length>=2)`.
  - `loadDoc(id)`(~985): 문서 복원 후 렌더.
  - `fcDrawMainChart(series, pred)`(~2459): `hist = series.slice(-180)`(2469); `loV/hiV = min/max(hist 종가)+밴드+anchor`(2472–2475); 캔들/선 블록(`_ohH = priceOHLC().slice(-hist.length)`, ~2497); `cv._mainGeo = {…, loV, hiV, histLen, hist, path, lo, hi, anchor, log}`(2488). `c.save();translate(_heroZoom…);scale(_heroZoom.s…)`(2475 근방)…`c.restore()`(2549).
  - `_drawEvidence` chart-mode(~2860): `g=main._mainGeo`; `Hn=g.histLen, off=P-Hn`; `toXh = i => g.padX+(i/(Hn-1))*g.histW`; `toY`(2868, log 적용); 각 `_drawXLayers` M에 `fiToX: fi => toXh(Math.max(0, Math.min(Hn-1, fi-off)))`.
  - 줌 시스템: `_heroZoom={s,tx,ty}`(~643), `clampPan`(648), `resetHeroView`/`renderHeroZoom`/`_syncZoomBtn`(656–663), `_heroZoomDragging`. `heroZoomInit`(~3742): wheel/pointerdown/move/up/dblclick/click(legend 포커스). 리셋 버튼 바인딩(~3786). 호버 `show`가 `g.hist[i]`로 가격 조회(~3627, 인덱스 기반).

---

## Task 1: 프록시 outputsize 5000 (무제한 과거)

**Files:** Modify `map/forge-api.php`(Twelve Data URL `outputsize`).

- [ ] **Step 1: outputsize 400→5000**

`forge-api.php`의 Twelve Data URL(~71행) `&outputsize=400&` → `&outputsize=5000&`:
```php
      $u = "https://api.twelvedata.com/time_series?symbol=" . urlencode($tdSym) . "&interval=" . urlencode($tf) . "&outputsize=5000&format=JSON&apikey=" . urlencode($TD_KEY);
```
(Stooq 폴백은 CSV 전체라 변경 불필요.)

- [ ] **Step 2: 검증 + 커밋**

PHP 로컬 없음 → 문법 자기검토(따옴표·세미콜론). 기능은 배포 후 라이브 curl(최종)에서 봉 수 증가 확인.
```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-api.php
git commit -m "feat(forge-api): OHLC outputsize 400→5000 (무제한 과거)"
```

---

## Task 2: 재fetch 인메모리 모델 (캔들 미저장 + 자동 재fetch)

**Files:** Modify `map/forge.html`(`applyTickerOHLC`·`priceSeries`·`priceOHLC`·편집기 readonly·`loadDoc`).

**Interfaces:**
- Produces: ticker 노드의 fetched 데이터가 `n._series`(종가)·`n._ohlc`(OHLC) 인메모리(직렬화 제외). 문서엔 `params.symbol/tf/price/fetched`만. 포지 로드 시 `fetched` 티커 자동 재fetch.

- [ ] **Step 1: `applyTickerOHLC` — 인메모리 전체 저장 + fetched 플래그**

`applyTickerOHLC`(~3941)를 교체:
```js
  function applyTickerOHLC(n, r) {
    const cs = r.candles.map(d => ({          // 전체(캡 없음) — 인메모리라 128KB 무관
      o: +(+d.o).toFixed(4), h: +(+d.h).toFixed(4), l: +(+d.l).toFixed(4), c: +(+d.c).toFixed(4)
    }));
    n._series = cs.map(d => d.c);             // 인메모리(직렬화 제외)
    n._ohlc = cs;
    n.params = n.params || {};
    n.params.tf = r.tf || "1day";
    n.params.price = cs[cs.length - 1].c;     // 현재가=마지막 종가 → currentData 스케일 계수 1
    n.params.fetched = true;                  // 로드 시 자동 재fetch 대상
    _heroView = "chart";
    if (typeof resetChartWin === "function") resetChartWin();   // 새 데이터 → 기본 윈도(Task 3)
    markDirty(); runForge();
  }
```
> `t`(날짜) 제거(차트 미사용). `_series`/`_ohlc`는 `_`접두라 `serializeActive`가 자동 제외 → 문서에 캔들 안 들어감.

- [ ] **Step 2: `priceSeries`/`priceOHLC` — `_series`/`_ohlc` 읽기 (ticker 한정)**

`priceSeries()`(~3920)의 ticker 분기 `n.series`→`n._series`:
```js
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && Array.isArray(n._series) && n._series.length >= 20 && n._series.every(x => isFinite(x)));
    if (tk) return tk._series;
```
(이하 price 블록 `n.series`·비전 경로는 **그대로** — 이전 대상 아님.)
`priceOHLC()`(~3932):
```js
  function priceOHLC() {
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && Array.isArray(n._ohlc) && n._ohlc.length >= 2);
    return tk ? tk._ohlc : null;
  }
```

- [ ] **Step 3: 편집기 현재가 readonly 판정 → `_ohlc`**

편집기(~1294) `(Array.isArray(n.ohlc) && n.ohlc.length >= 2)` → `(Array.isArray(n._ohlc) && n._ohlc.length >= 2)`.

- [ ] **Step 4: `loadDoc` 자동 재fetch (비차단)**

`loadDoc(id)`(~985)가 보드/차트 렌더를 마치는 지점(함수 말미, 기존 렌더 호출 다음)에 추가:
```js
    // fetched 티커 자동 재fetch(비차단) — 캔들은 문서에 없으므로 메모리 복원
    boardState.nodes.filter(n => n.blockType === "ticker" && n.params && n.params.fetched && n.params.symbol).forEach(async n => {
      try {
        const rr = await fetchOHLC(n.params.symbol, (n.params.tf) || "1day");
        if (rr && rr.ok && Array.isArray(rr.candles) && rr.candles.length >= 2) {
          n._ohlc = rr.candles.map(d => ({ o: +(+d.o).toFixed(4), h: +(+d.h).toFixed(4), l: +(+d.l).toFixed(4), c: +(+d.c).toFixed(4) }));
          n._series = n._ohlc.map(d => d.c);
          if (typeof resetChartWin === "function") resetChartWin();
          runForge();
        }
      } catch (e) { /* 오프라인/실패 무시 — 차트 없이 그레이스풀 */ }
    });
```
> 문서 로드는 fetch를 기다리지 않음(비차단). 샘플 ticker는 `fetched` 미설정 → 자동 재fetch 안 함(수동 유지).

- [ ] **Step 5: 검증 + 커밋**

JS 파싱 OK, 코어 83/0, 따옴표 무변형. 자기검토: 티커 불러오기 → `_series`/`_ohlc` 메모리 채움·차트 표시(기존 180봉 렌더 그대로 동작, priceSeries/priceOHLC가 `_`필드 사용); `serializeActive`가 캔들 미저장(POST 작음); 재방문 시 자동 재fetch로 복원; price 블록 붙여넣기 경로 불변.
```bash
git add map/forge.html
git commit -m "feat(forge): 티커 OHLC 인메모리(_ohlc/_series, 문서 미저장) + 로드시 자동 재fetch(무제한 과거)"
```

---

## Task 3: 데이터-윈도 렌더 + 오토 스케일 + 근거 윈도 매핑

**Files:** Modify `map/forge.html`(전역 `_chartWin`·`resetChartWin`; `fcDrawMainChart` 윈도/오토스케일; `_drawEvidence` fiToX 윈도 매핑; `_mainGeo`).

**Interfaces:**
- Consumes: Task 2 `priceSeries()`/`priceOHLC()`(전체 시계열·OHLC).
- Produces: `_chartWin = {start, count}`; `resetChartWin()`; `fcDrawMainChart`가 윈도 슬라이스 렌더 + 보이는 캔들 고저로 y자동적합; `_mainGeo`에 `start`/`count`/`winN`. evidence가 절대 인덱스→윈도 x 매핑.

- [ ] **Step 1: 전역 `_chartWin` + `resetChartWin`** (전역 구역, 예: `_logChart` 근처)

```js
  let _chartWin = { start: 0, count: 0 };   // count 0 = 미초기화(전체 시계열 길이로 기본화)
  function resetChartWin() {
    const s = (typeof priceSeries === "function") ? priceSeries() : null;
    const N = (s && s.length) || 0;
    _chartWin.count = Math.min(180, N);
    _chartWin.start = Math.max(0, N - _chartWin.count);
  }
```

- [ ] **Step 2: `fcDrawMainChart` — 윈도 슬라이스 + 오토 스케일**

`fcDrawMainChart`(~2459)에서 `const hist = (series || []).slice(-180);`(2469) 및 그 아래 y범위 계산을 교체:
```js
    const N = (series || []).length;
    if (!_chartWin.count || _chartWin.start + _chartWin.count > N || _chartWin.start < 0) {   // 미초기화/범위이탈 보정
      _chartWin.count = Math.min(_chartWin.count || 180, N); _chartWin.start = Math.max(0, N - _chartWin.count);
    }
    const wStart = _chartWin.start, wCount = _chartWin.count;
    const hist = (series || []).slice(wStart, wStart + wCount);
    const atLatest = (wStart + wCount >= N);   // 최신봉이 윈도 우측에 보이는가(예측 콘 표시 조건)
```
그리고 예측 path/cone은 `atLatest`일 때만 사용하도록: 이 함수에서 `path`/`lo`/`hi`를 쓰는 부분을 `const path = atLatest ? ((pred && pred.path) || []) : [], lo = atLatest ? ((pred&&pred.lo)||[]) : [], hi = atLatest ? ((pred&&pred.hi)||[]) : [];`로 가드(기존 path 정의를 이 형태로 교체).

y범위(오토 스케일) — 기존 `loV=min(...hist); hiV=max(...hist); …밴드…`(2472–2475)를 **보이는 캔들 고저** 기준으로:
```js
    const _oh = (typeof priceOHLC === "function") ? priceOHLC() : null;
    const _ohW = (_oh && _oh.length === N) ? _oh.slice(wStart, wStart + wCount) : null;
    let loV = Infinity, hiV = -Infinity;
    if (_ohW) { for (const d of _ohW) { if (d.l < loV) loV = d.l; if (d.h > hiV) hiV = d.h; } }
    else { for (const v of hist) { if (v < loV) loV = v; if (v > hiV) hiV = v; } }
    if (atLatest) { for (let i = 0; i < path.length; i++) { loV = Math.min(loV, lo[i]); hiV = Math.max(hiV, hi[i]); } loV = Math.min(loV, anchor); hiV = Math.max(hiV, anchor); }
    if (!isFinite(loV) || !isFinite(hiV)) { loV = 0; hiV = 1; }
    const padV = (hiV - loV) * 0.08 || 1; loV -= padV; hiV += padV;
```
> `anchor`는 기존 정의(예측 anchor 또는 hist 마지막) 유지. 캔들/선 렌더 블록은 그대로(이미 `priceOHLC().slice(-hist.length)` 사용 → `hist.length`=wCount라 윈도와 정합. 단 정확히는 윈도 슬라이스를 써야 하므로 캔들 블록의 `_oh.slice(-hist.length)`를 `_ohW`로 교체).
`cv._mainGeo`(2488)에 `start: wStart, count: wCount, winN: N` 추가(기존 키 유지).

- [ ] **Step 3: 캔들 렌더 블록이 윈도 OHLC 사용**

캔들 블록(~2497, `const _oh = …priceOHLC(); const _ohH = _oh ? _oh.slice(-hist.length) : null;`)에서 `_ohH`를 Step 2의 `_ohW`로 교체(중복 계산 제거, 윈도 정확):
```js
    if (_ohW && _ohW.length === hist.length) {
      const bw = Math.max(1, (histW / hist.length) * 0.7);
      for (let i = 0; i < hist.length; i++) {
        const d = _ohW[i], x = toXh(i), up = d.c >= d.o, col = up ? "#46c28e" : "#e06a6a";
        c.strokeStyle = col; c.lineWidth = Math.max(0.7, bw * 0.16);
        c.beginPath(); c.moveTo(x, toY(d.h)); c.lineTo(x, toY(d.l)); c.stroke();
        const yt = toY(Math.max(d.o, d.c)), yb = toY(Math.min(d.o, d.c));
        c.fillStyle = col; c.fillRect(x - bw / 2, yt, bw, Math.max(1, yb - yt));
      }
    } else { /* 기존 골드 선 폴백 그대로 */ }
```

- [ ] **Step 4: evidence fiToX 윈도 매핑 + 밖 클립**

`_drawEvidence` chart-mode(~2860): `Hn = g.histLen, off = P - Hn`를 윈도 기준으로 교체. 기존:
```js
      const Hn = g.histLen, off = P - Hn, plotR = g.padX + g.plotW;
      const toXh = i => g.padX + (i / (Hn - 1)) * g.histW;
```
→ (절대 인덱스 fi → 윈도 상대 → x; 윈도 밖은 NaN 반환해 클립)
```js
      const wS = g.start, wC = g.count, plotR = g.padX + g.plotW;
      const toXh = i => g.padX + (i / (wC - 1)) * g.histW;       // i = 윈도 상대 인덱스(0..wC-1)
      const fiToX = fi => (fi >= wS && fi <= wS + wC - 1) ? toXh(fi - wS) : NaN;   // 절대 fi → 윈도 x, 밖=NaN
```
그리고 각 `_drawXLayers` 호출의 M `fiToX`를 `fi => toXh(Math.max(0, Math.min(Hn-1, fi-off)))`에서 **`fiToX`**(위 정의)로 교체(6개 지표 + trend). `nowFi: P-1` 유지(절대 인덱스). `_drawXLayers` 내부가 `M.fiToX`로 좌표를 얻고 비유한(NaN)일 때 `isFinite` 가드로 건너뛰므로(기존 패턴) 윈도 밖 작도는 자동 클립.
> NaN 좌표가 `isFinite` 가드를 통과하지 못해 그려지지 않음 — 기존 `_drawXLayers`들이 모두 `[xa,ya,...].every(isFinite)` 식 가드를 쓰는지 확인하고, 안 쓰는 라벨/선은 가드 추가(밖이면 skip).

- [ ] **Step 5: 검증 + 커밋**

JS 파싱 OK, 코어 83/0, 따옴표 무변형. 자기검토: 티커 로드 시 윈도(기본 최근 180)로 캔들 렌더 + y가 보이는 캔들 고저에 적합(심지 안 잘림); 예측 콘은 `atLatest`일 때만; 근거 작도가 윈도에 매핑되고 윈도 밖은 안 그려짐; `_chartWin` 범위이탈 자동보정. (내비게이션은 Task 4 — 지금은 기본 윈도 고정.)
```bash
git add map/forge.html
git commit -m "feat(forge): 차트 데이터-윈도 렌더 + 보이는구간 캔들고저 오토스케일 + 근거 윈도 매핑·예측콘 게이팅"
```

---

## Task 4: 윈도 내비게이션 핸들러 (휠 줌·드래그 스크롤) + `_heroZoom` 중립화

**Files:** Modify `map/forge.html`(`heroZoomInit` 핸들러; `_heroZoom` 항등 중립화; 호버 윈도 인덱스; 리셋).

**Interfaces:**
- Consumes: Task 3 `_chartWin`/`resetChartWin`/`_mainGeo`(start/count/winN/histW/padX).
- Produces: 휠=`_chartWin.count` 줌(커서 봉 앵커), 드래그=`_chartWin.start` 스크롤, 더블클릭·⊕=리셋. `_heroZoom` 항등(균일줌 제거).

- [ ] **Step 1: `_heroZoom` 항등 중립화**

`resetHeroView()`(~656)를 `_chartWin` 리셋도 하도록(또는 그대로 두고 호출부에서 resetChartWin 호출). 최소 변경: `_heroZoom`은 항상 `{s:1,tx:0,ty:0}` 유지(아무도 s/tx/ty를 1/0 외로 안 바꿈) → `fcDrawMainChart`/`_drawEvidence`의 `translate/scale(_heroZoom)`는 항등 no-op. `clampPan`/`_syncZoomBtn`은 그대로(호출돼도 무해). `renderHeroZoom()`는 재렌더 진입점으로 유지.

- [ ] **Step 2: `heroZoomInit` 휠/드래그를 `_chartWin` 구동으로 교체**

`heroZoomInit`(~3742)의 `wheel`·`pointerdown`·`pointermove`·`dblclick` 핸들러를 교체(나머지 `click`=legend 포커스, `endDrag`는 유지하되 `_heroZoom` 좌표 의존 제거):
```js
    cv.addEventListener("wheel", e => {
      e.preventDefault();
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo; if (!g) return;
      const N = g.winN || 0; if (N < 2) return;
      const r = cv.getBoundingClientRect(), cx = e.clientX - r.left;
      // 커서 아래 윈도 봉 인덱스(절대)
      const rel = Math.max(0, Math.min(1, (cx - g.padX) / (g.histW || 1)));
      const bi = g.start + Math.round(rel * (g.count - 1));
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;          // 휠업=줌인(봉 수 감소)
      let nc = Math.round(_chartWin.count * factor);
      nc = Math.max(20, Math.min(N, nc));
      let ns = Math.round(bi - rel * (nc - 1));
      ns = Math.max(0, Math.min(N - nc, ns));
      _chartWin.count = nc; _chartWin.start = ns; renderHeroZoom();
    }, { passive: false });
    let hDrag = null;
    cv.addEventListener("pointerdown", e => {
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo; if (!g) return;
      hDrag = { x: e.clientX, start: _chartWin.start, moved: false, barW: (g.histW || 1) / Math.max(1, g.count) };
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cv.addEventListener("pointermove", e => {
      if (!hDrag) return;
      const dx = e.clientX - hDrag.x;
      if (Math.abs(dx) > 6) { hDrag.moved = true; _heroZoomDragging = true; }
      if (!hDrag.moved) return;
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo; if (!g) return;
      const N = g.winN || 0, dBars = Math.round(-dx / (hDrag.barW || 1));
      _chartWin.start = Math.max(0, Math.min(N - _chartWin.count, hDrag.start + dBars));
      renderHeroZoom();
    });
    const endDrag = () => { hDrag = null; _heroZoomDragging = false; };
    cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
    cv.addEventListener("dblclick", () => { resetChartWin(); renderHeroZoom(); });
```
(기존 `click`=legend 포커스 핸들러는 유지 — `_heroZoom`이 항등이라 `(clientX-tx)/s` 역변환이 그대로 직좌표가 됨, 수정 불필요.)

- [ ] **Step 3: 리셋 버튼 → `resetChartWin`**

리셋 버튼 바인딩(~3786) `() => { resetHeroView(); renderHeroZoom(); }` → `() => { resetChartWin(); renderHeroZoom(); }`. `_syncZoomBtn`이 버튼 표시를 `_heroZoom.s>1`로 토글하던 것을 `_chartWin`이 기본과 다를 때로(선택): `_syncZoomBtn`을 `b.classList.toggle("on", !!(priceSeries() && (_chartWin.start>0 || _chartWin.count < (priceSeries()||[]).length)))`로 교체(있으면). 없으면 버튼 항상 표시도 무방.

- [ ] **Step 4: 호버 툴팁 윈도 인덱스 보정**

호버 `show`가 `g.hist[i]`로 가격을 조회(~3627). `g.hist`는 이미 윈도 슬라이스(Task 3)라 인덱스 i(0..count-1)가 윈도 상대로 맞음 — 추가 보정 불필요. 단 "과거 N봉 전" 라벨이 절대가 아닌 윈도 기준이면 그대로 두되, `_heroZoom` 역변환(`/_heroZoom.s` 등)이 호버 x 계산에 있으면 항등이라 무해(확인만). 윈도 밖(예측존)·콘 처리는 기존 분기 유지.

- [ ] **Step 5: 검증 + 커밋**

JS 파싱 OK, 코어 83/0, 따옴표 무변형. 자기검토: (a) 휠로 시간축 줌(봉 수 증감·커서 앵커), (b) 드래그로 과거 스크롤, (c) 매 이동마다 y가 보이는 구간에 재적합, (d) 더블클릭·⊕로 기본 윈도 복귀, (e) 과거로 스크롤하면 예측 콘 숨김·최신 복귀 시 표시, (f) 근거 작도가 스크롤/줌에 따라 윈도 정합, (g) legend 포커스 클릭·호버 정상.
```bash
git add map/forge.html
git commit -m "feat(forge): 차트 윈도 내비게이션 — 휠 시간축 줌·드래그 과거 스크롤·리셋, _heroZoom 항등 중립화"
```

---

## 최종 (배포 + 라이브 검증)

전체 브랜치 리뷰(opus, 윈도/오토스케일/근거 매핑/재fetch 모델/회귀) → main 머지 → 배포(`forge.html`+`forge-api.php`; **forge_td_key.txt·캐시·데이터 JSON 불가침**) → 라이브:
- `curl ".../forge-api.php?ohlc=1&symbol=AAPL&tf=1day"` → 봉 수 대폭 증가(수천).
- UI: 티커 불러오기 → 휠 줌·드래그 과거 스크롤, 보이는 구간 y 자동 적합, 예측 콘 최신 윈도 한정, 근거 작도 윈도 정합; 포지 재방문 시 자동 재fetch 복원(문서 POST 작음); log 토글·호버 정상.
