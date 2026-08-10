# 머니스쿱 모바일 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 워치리스트에서 종목을 고르면 Basic 티어(5지표) 판정과 PC 수준의 4단 적층 차트를 보여주는, 폰에서 실제로 쓰는 두 화면을 만든다.

**Architecture:** Phase 0 의 UMD 모듈(`api`·`graph`·`chart`·`bench`) 위에 순수 로직 모듈 4개(`store`·`scan`·`chart-layout`·`chart-draw`)와 PC 작도 포팅 2개(`draw-layers`·`draw-panels`)를 얹고, 그 위에 배선 전용 화면 2개를 올린다. 핵심은 `chartLayout` 이 패널마다 `pToY` 를 주고 `fiToX` 를 공유하는 것 — 그래야 PC 에서 가져온 `_drawXLayers(c, data, M)` 가 수정 없이 꽂힌다.

**Tech Stack:** Vanilla JS(UMD, classic script) · Canvas 2D · `node --test` · localStorage · 번들러 없음

## Global Constraints

- **번들러·프레임워크 금지.** `www/` 는 classic `<script>` + UMD 만. `defer`/`async`/`type="module"` 금지. 로드 순서 고정
- **`mobile/package.json` 에 `"type"` 필드 금지** — 있으면 UMD 가 ESM 으로 파싱돼 `TypeError: Cannot set properties of undefined` 로 죽는다
- 테스트는 `node --test test/*.test.mjs`(glob). 전체 관문은 `map/tests/run.sh`
- **엔진 무수정** — `map/forge-core.js`·`forge-tools.js` 는 읽기만 한다. `forge-draw.js` 도 **수정하지 않는다**(읽어서 복사할 뿐)
- 색은 핸드오프 토큰만: `bg #0a0d12` · `bg-raised #0b0e15` · `sheet #11151d` · `hairline rgba(238,241,247,.06)` · `border rgba(238,241,247,.10)` · `ink #eef1f7` · `ink-2 #c5ccdb` · `ink-3 #9aa3b6` · `ink-4 #7c8598` · `ink-5 #78819a`(**텍스트 최저 대비 — 이보다 밝게 금지**) · `gold #e8b463` · `steel #8892a6` · `bull #4fb98a` · `bear #d96a6a` · `bear-text #e08a8a`
- **좌측 세로 컬러 라인(accent bar) 금지** — 저장소 전역 규칙
- 최소 터치 타깃 **44px** · `font-variant-numeric: tabular-nums` 를 body 루트에 · 화면 인셋 20px
- 축·캡션 글자 실효 **≥10.5px**
- 3톤: steel=Basic · gold=엔진이 말한 것 · platinum=사용자가 설정한 것(Phase 1 에 platinum 없음)
- 커밋 스코프 `mobile(...)`. 소스 파일은 평문 — 이스케이프 시퀀스는 리터럴 텍스트로 쓰고 그 바이트를 넣지 않는다
- **Phase 1 에 넣지 않는 것**: 티어 선택 시트 · 지갑 · 광고 · 계정 · Full/Custom · 핀치줌/팬/전체화면 · A(자동스케일)·L(로그) 토글 · 더블탭 리셋 · 온보딩 5단계 · 다국어 · 폴드 2단 · 종목 간 가로 스와이프

## 선행 조사 결과 (확정 — 다시 조사하지 말 것)

| 항목 | 결과 |
|---|---|
| Basic 비용 | 5지표 5031봉 **20.2ms**(데스크톱), 폴드7 환산 약 7ms. 봉 수에 거의 평탄. **성능 예산 걱정 불필요** |
| Full 비용 | 32지표 5031봉 2581.7ms — 초선형 폭발은 봉 수가 아니라 나머지 27지표 탓 |
| Basic 5지표 | `ma` `macd` `rsi` `bollinger` `volume` — 전부 엔진 blockType 으로 존재 |
| 티커 제안 | `forge-api.php` 가 `notfound` 시 502 + `suggest:[{s,n}]` 최대 3건(Yahoo 기반). 실측: `APPL` → `AAPL`·`AMAT`·`AAOI` |
| PC 작도 | **두 계열**: `_drawXLayers(c,data,M)` = 가격 패널 오버레이·배지 / `fcDrawX(data,reveal)` = 서브패널(자체 DOM 획득) |
| `M` 계약 | 11키 — `fiToX pToY nowFi fiMin reveal xRight xNow futBars focused badgeY lastPrice` |
| 포팅 검증 | 8개 렌더러 전부 recording-ctx 로 실제 페인트 확인. MA 508 · 볼린저 621 · RSI 990 · MACD 1449(fill 480) · 거래량 554 |
| 웜/콜드 수신 | 1day 웜 245.8ms / 콜드 942.0ms(폴드7 실측) |
| **계획서 코드 사전 검증** | 이 계획서의 `store`·`scan`·`chart-layout`·`chart-draw`·`basicGraph`·`loadTicker` 를 스크래치에 그대로 옮겨 실행: **54/54 통과**. 포팅 두 모듈까지 합친 **전체 차트 합성이 실제 `chartLayout` M 으로 4,864 페인트 콜**을 냄. 여기 적힌 테스트 수와 기준선은 실측이지 추정이 아니다 |

---

## File Structure

```
map/mobile/www/
  index.html            앱 셸 — 고정 로드 순서            (Phase 0 것 교체)
  style.css             토큰 + 두 화면 스타일             (Phase 0 것 교체)
  app.js                라우팅 · 화면 전환                (신규)
  store.js              localStorage 래퍼                 (신규 · Task 1)
  scan.js               스캔 큐                           (신규 · Task 4)
  api.js                + loadTicker                      (확장 · Task 3)
  graph.js              + basicGraph                      (확장 · Task 2)
  chart-layout.js       패널 레이아웃 · 11키 M            (신규 · Task 5)
  draw-layers.js        PC 포팅 A — 가격 오버레이·배지    (신규 · Task 6)
  draw-panels.js        PC 포팅 B — 서브패널              (신규 · Task 7)
  chart-draw.js         캔들·콘·축·크로스헤어             (신규 · Task 8, 기존 chart.js 흡수)
  ui.js                 공통 조각(행·칩·배지)             (신규 · Task 9)
  screens/watchlist.js                                    (신규 · Task 9)
  screens/report.js                                       (신규 · Task 10)
  bench.js  vendor/     그대로
  chart.js  spike.js    삭제(Task 8·9)
map/mobile/test/
  store.test.mjs  graph.test.mjs(확장)  api.test.mjs(확장)
  scan.test.mjs  chart-layout.test.mjs  draw-layers.test.mjs
  draw-panels.test.mjs  chart-draw.test.mjs(기존 chart.test.mjs 이관)
```

`index.html` 로드 순서(고정): `vendor/forge-core.js` → `api.js` → `graph.js` → `store.js` → `scan.js` → `chart-layout.js` → `draw-layers.js` → `draw-panels.js` → `chart-draw.js` → `ui.js` → `screens/watchlist.js` → `screens/report.js` → `app.js`

---

### Task 1: store.js — localStorage 래퍼

**Files:**
- Create: `map/mobile/www/store.js`
- Create: `map/mobile/test/store.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: 전역 `MSStore` = `{ KEYS, install(backend), getWatchlist() -> Item[], setWatchlist(list), addTicker(sym, name) -> boolean, removeTicker(sym) -> boolean, getScan(sym) -> Rec|null, setScan(sym, rec), allScans() -> {[sym]:Rec}, seedIfEmpty() -> boolean }`
  - `Item` = `{ sym, name, addedAt }`
  - `Rec` = `{ price, chg, spark:number[], dir:"bull"|"neutral"|"bear", score, confluence, asOf, scannedAt }`
  - `install(backend)` 는 테스트용 주입구. `backend` 는 `{getItem, setItem}` 을 가진 객체. 미호출 시 `globalThis.localStorage`, 없으면 메모리

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/store.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSStore = require("../www/store.js");

function memBackend(throwOnSet) {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (throwOnSet) throw new Error("QuotaExceededError"); m.set(k, String(v)); },
    _map: m
  };
}

test("워치리스트 왕복", () => {
  MSStore.install(memBackend());
  assert.deepEqual(MSStore.getWatchlist(), []);
  MSStore.setWatchlist([{ sym: "AAPL", name: "Apple Inc.", addedAt: "2026-08-10" }]);
  assert.equal(MSStore.getWatchlist()[0].sym, "AAPL");
});

test("addTicker 는 중복을 거부하고 대소문자를 정규화한다", () => {
  MSStore.install(memBackend());
  assert.equal(MSStore.addTicker("aapl", "Apple Inc."), true);
  assert.equal(MSStore.getWatchlist()[0].sym, "AAPL");
  assert.equal(MSStore.addTicker("AAPL", "Apple Inc."), false, "중복이 통과했다");
  assert.equal(MSStore.getWatchlist().length, 1);
});

test("removeTicker 는 스캔 캐시도 함께 지운다 — 남으면 유령 신호가 뜬다", () => {
  MSStore.install(memBackend());
  MSStore.addTicker("AAPL", "Apple Inc.");
  MSStore.setScan("AAPL", { price: 1, chg: 0, spark: [1], dir: "bull", score: 10, confluence: 50, asOf: "2026-08-07", scannedAt: "2026-08-10T00:00:00Z" });
  assert.equal(MSStore.removeTicker("AAPL"), true);
  assert.equal(MSStore.getWatchlist().length, 0);
  assert.equal(MSStore.getScan("AAPL"), null, "스캔 캐시가 남았다");
});

test("스캔 레코드 왕복 · 없는 심볼은 null", () => {
  MSStore.install(memBackend());
  const rec = { price: 313.33, chg: -0.42, spark: [1, 2, 3], dir: "neutral", score: 0, confluence: 56, asOf: "2026-08-07", scannedAt: "2026-08-10T02:00:00Z" };
  MSStore.setScan("AAPL", rec);
  assert.deepEqual(MSStore.getScan("AAPL"), rec);
  assert.equal(MSStore.getScan("NVDA"), null);
});

test("쿼터 예외가 나도 던지지 않고 메모리로 계속 동작한다", () => {
  MSStore.install(memBackend(true));
  assert.doesNotThrow(() => MSStore.addTicker("AAPL", "Apple Inc."));
  assert.equal(MSStore.getWatchlist()[0].sym, "AAPL", "쓰기 실패 후 읽기가 비었다");
});

test("깨진 JSON 은 예외 대신 기본값으로 떨어진다", () => {
  const b = memBackend(); b._map.set(MSStore.KEYS.watchlist, "{{깨짐");
  MSStore.install(b);
  assert.deepEqual(MSStore.getWatchlist(), []);
});

test("seedIfEmpty 는 비었을 때만 3종목을 넣는다", () => {
  MSStore.install(memBackend());
  assert.equal(MSStore.seedIfEmpty(), true);
  assert.deepEqual(MSStore.getWatchlist().map(x => x.sym), ["AAPL", "NVDA", "MSFT"]);
  assert.equal(MSStore.seedIfEmpty(), false, "두 번째 호출이 또 시드했다");
  assert.equal(MSStore.getWatchlist().length, 3);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/store.test.mjs`
Expected: FAIL — `Cannot find module '../www/store.js'`

- [ ] **Step 3: 구현**

`map/mobile/www/store.js`:

```js
// localStorage 래퍼. OHLC 는 저장하지 않는다 — AAPL 하나가 394KB 라 쿼터를 깬다.
// 모든 접근을 try/catch 로 감싸고 실패 시 메모리로 떨어진다(WebView 쿼터·프라이빗 모드).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSStore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYS = { watchlist: "ms_watchlist", scan: "ms_scan" };
  var SEED = [{ sym: "AAPL", name: "Apple Inc." }, { sym: "NVDA", name: "NVIDIA Corporation" }, { sym: "MSFT", name: "Microsoft Corporation" }];

  var mem = {};                       // 백엔드 실패 시 폴백 저장소
  var backend = null;

  function install(b) { backend = b || null; mem = {}; }
  function be() {
    if (backend) return backend;
    try { if (typeof localStorage !== "undefined" && localStorage) return localStorage; } catch (e) {}
    return null;
  }
  function read(key, fallback) {
    var raw = null;
    try { var b = be(); raw = b ? b.getItem(key) : null; } catch (e) { raw = null; }
    if (raw == null && Object.prototype.hasOwnProperty.call(mem, key)) raw = mem[key];
    if (raw == null) return fallback;
    try { var v = JSON.parse(raw); return (v == null) ? fallback : v; } catch (e) { return fallback; }
  }
  function write(key, val) {
    var s = JSON.stringify(val);
    mem[key] = s;                     // 항상 메모리에도 둔다 — 쓰기 실패해도 세션 내 일관성 유지
    try { var b = be(); if (b) b.setItem(key, s); } catch (e) {}
  }

  function getWatchlist() { var v = read(KEYS.watchlist, []); return Array.isArray(v) ? v : []; }
  function setWatchlist(list) { write(KEYS.watchlist, Array.isArray(list) ? list : []); }

  function addTicker(sym, name) {
    var s = String(sym || "").trim().toUpperCase();
    if (!s) return false;
    var list = getWatchlist();
    for (var i = 0; i < list.length; i++) if (list[i].sym === s) return false;
    list.push({ sym: s, name: name || s, addedAt: new Date().toISOString().slice(0, 10) });
    setWatchlist(list);
    return true;
  }

  function removeTicker(sym) {
    var s = String(sym || "").trim().toUpperCase();
    var list = getWatchlist(), out = list.filter(function (x) { return x.sym !== s; });
    if (out.length === list.length) return false;
    setWatchlist(out);
    var scans = allScans();           // 캐시를 남기면 다시 추가했을 때 옛 신호가 유령처럼 뜬다
    if (scans[s]) { delete scans[s]; write(KEYS.scan, scans); }
    return true;
  }

  function allScans() { var v = read(KEYS.scan, {}); return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }
  function getScan(sym) { var v = allScans()[String(sym || "").toUpperCase()]; return v || null; }
  function setScan(sym, rec) { var s = allScans(); s[String(sym || "").toUpperCase()] = rec; write(KEYS.scan, s); }

  function seedIfEmpty() {
    if (getWatchlist().length) return false;
    SEED.forEach(function (x) { addTicker(x.sym, x.name); });
    return true;
  }

  return { KEYS: KEYS, SEED: SEED, install: install, getWatchlist: getWatchlist, setWatchlist: setWatchlist,
           addTicker: addTicker, removeTicker: removeTicker, getScan: getScan, setScan: setScan,
           allScans: allScans, seedIfEmpty: seedIfEmpty };
});
```

- [ ] **Step 4: 통과 확인**

Run: `cd map/mobile && node --test test/store.test.mjs`
Expected: PASS (7건)

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/store.js map/mobile/test/store.test.mjs
git commit -m "mobile(p1): store — localStorage 래퍼(쿼터 폴백·스캔 캐시 동반 삭제)

OHLC 는 저장하지 않는다(AAPL 394KB). 쓰기 실패해도 메모리로 세션 일관성 유지.
종목 삭제 시 스캔 캐시를 함께 지운다 — 남으면 재추가 때 유령 신호가 뜬다.
store.test.mjs 7건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: graph.js — basicGraph (5지표)

**Files:**
- Modify: `map/mobile/www/graph.js`
- Modify: `map/mobile/test/graph.test.mjs`

**Interfaces:**
- Consumes: 기존 `MSGraph.INFRA`, `MSGraph.indicatorTypes`, `MSGraph.setVolume`
- Produces: `MSGraph.BASIC = ["ma","macd","rsi","bollinger","volume"]` · `MSGraph.basicGraph(ForgeCore) -> {nodes, edges}`

- [ ] **Step 1: 실패하는 테스트를 `graph.test.mjs` 끝에 추가한다**

```js
test("basicGraph 는 지표가 정확히 Basic 5종뿐이다", () => {
  const g = MSGraph.basicGraph(ForgeCore);
  const inds = MSGraph.indicatorTypes(g).sort();
  assert.deepEqual(inds, [...MSGraph.BASIC].sort());
});

test("basicGraph 도 엔진이 실제로 돈다", () => {
  const g = MSGraph.basicGraph(ForgeCore);
  const d = ForgeCore.makeDemoSeries(400);
  const res = ForgeCore.run(g, d, { futW: 60, timeframe: "1day" });
  assert.ok(Number.isFinite(res.verdict.score));
  assert.equal(res.prediction.path.length, 60);
});

test("basicGraph 와 full32Graph 의 판정이 다르다 — 같으면 가지치기가 안 먹은 것", () => {
  const d = ForgeCore.makeDemoSeries(400);
  const b = ForgeCore.run(MSGraph.basicGraph(ForgeCore), d, { futW: 60, timeframe: "1day" });
  const f = ForgeCore.run(MSGraph.full32Graph(ForgeCore), d, { futW: 60, timeframe: "1day" });
  assert.notEqual(b.verdict.confluence.total, f.verdict.confluence.total);
});

test("basicGraph 도 volume 노드의 baked 합성 시리즈를 지운다", () => {
  const g = MSGraph.basicGraph(ForgeCore);
  const vn = g.nodes.find(n => n.blockType === "volume");
  assert.ok(vn, "volume 노드가 없다");
  assert.equal(vn.series, undefined, "sampleGraph 의 합성 BTC 거래량이 남았다");
});

test("basicGraph 에도 setVolume 이 먹는다", () => {
  const g = MSGraph.basicGraph(ForgeCore);
  assert.equal(MSGraph.setVolume(g, [10, 20, 30]), true);
  assert.deepEqual(g.nodes.find(n => n.blockType === "volume").series, [10, 20, 30]);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/graph.test.mjs`
Expected: FAIL — `MSGraph.basicGraph is not a function`

- [ ] **Step 3: 구현 — `graph.js` 의 `full32Graph` 아래에 추가하고 export 에 넣는다**

```js
  // Basic 티어 = 핵심 5지표(Lv1). Full 대비 5031봉에서 약 128배 싸다(20.2ms vs 2581.7ms).
  var BASIC = ["ma", "macd", "rsi", "bollinger", "volume"];

  function basicGraph(ForgeCore) {
    var g = full32Graph(ForgeCore);   // 합성 거래량 제거·conviction 0 처리를 그대로 물려받는다
    var drop = {};
    (g.nodes || []).forEach(function (n) {
      if (!n.blockType || INFRA.indexOf(n.blockType) >= 0) return;
      if (BASIC.indexOf(n.blockType) < 0) drop[n.id] = true;
    });
    g.nodes = g.nodes.filter(function (n) { return !drop[n.id]; });
    g.edges = g.edges.filter(function (e) { return !drop[e.from] && !drop[e.to]; });
    return g;
  }
```

export 를 `return { INFRA: INFRA, MISSING: MISSING, BASIC: BASIC, indicatorTypes: indicatorTypes, full32Graph: full32Graph, basicGraph: basicGraph, setVolume: setVolume };` 로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `cd map/mobile && node --test test/graph.test.mjs`
Expected: PASS (기존 6 + 신규 5 = 11건)

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/graph.js map/mobile/test/graph.test.mjs
git commit -m "mobile(p1): basicGraph — Basic 티어 5지표 그래프

full32Graph 를 가지쳐 만든다(합성 거래량 제거·conviction 0 처리를 물려받기 위해).
5031봉 20.2ms 로 Full 대비 128배 싸다. graph.test.mjs 11건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: api.js — loadTicker (조회 + 제안)

**Files:**
- Modify: `map/mobile/www/api.js`
- Modify: `map/mobile/test/api.test.mjs`

**Interfaces:**
- Consumes: 기존 `MSApi.ohlcUrl`, `MSApi.normalizeCandles`
- Produces: `MSApi.loadTicker(sym, tf, fetchImpl) -> Promise<{ok:true, ...normalized}>`. 실패 시 `Error` 를 던지며, `notfound` 인 경우 `err.notfound === true` 와 `err.suggest = [{s, n}]` 를 붙인다. `fetchImpl` 은 테스트 주입구(생략 시 전역 `fetch`)

- [ ] **Step 1: 실패하는 테스트를 `api.test.mjs` 끝에 추가한다**

```js
function fakeFetch(payload, status) {
  return async () => ({ ok: (status || 200) < 400, status: status || 200, json: async () => payload });
}

test("loadTicker 는 정상 응답을 정규화해서 돌려준다", async () => {
  const r = fakeResponse(250);
  const out = await MSApi.loadTicker("AAPL", "1day", fakeFetch(r));
  assert.equal(out.candle.length, 250);
  assert.equal(out.asOf, r.candles[249].t);
});

test("notfound 는 suggest 를 붙여서 던진다", async () => {
  const payload = { ok: false, error: "notfound", symbol: "APPL", suggest: [{ s: "AAPL", n: "Apple Inc." }] };
  await assert.rejects(
    () => MSApi.loadTicker("APPL", "1day", fakeFetch(payload, 502)),
    err => {
      assert.equal(err.notfound, true);
      assert.deepEqual(err.suggest, [{ s: "AAPL", n: "Apple Inc." }]);
      return true;
    }
  );
});

test("suggest 가 없는 실패는 notfound 로 표시하지 않는다", async () => {
  await assert.rejects(
    () => MSApi.loadTicker("AAPL", "1day", fakeFetch({ ok: false, error: "badsymbol" }, 400)),
    err => { assert.notEqual(err.notfound, true); return /badsymbol/.test(err.message); }
  );
});

test("네트워크 예외는 그대로 전파된다", async () => {
  const boom = async () => { throw new Error("network down"); };
  await assert.rejects(() => MSApi.loadTicker("AAPL", "1day", boom), /network down/);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/api.test.mjs`
Expected: FAIL — `MSApi.loadTicker is not a function`

- [ ] **Step 3: 구현 — `api.js` 에 추가하고 export 에 넣는다**

```js
  // 조회 + 오타 구제. 서버가 notfound 일 때 Yahoo 기반 제안을 최대 3건 준다(forge-api.php).
  function loadTicker(symbol, tf, fetchImpl) {
    var f = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!f) return Promise.reject(new Error("fetch 없음"));
    return f(ohlcUrl(symbol, tf)).then(function (res) { return res.json(); }).then(function (json) {
      if (json && json.ok) return normalizeCandles(json);
      var err = new Error("OHLC 실패: " + ((json && json.error) || "unknown"));
      if (json && json.error === "notfound") { err.notfound = true; err.suggest = json.suggest || []; }
      throw err;
    });
  }
```

export 에 `loadTicker: loadTicker` 추가.

- [ ] **Step 4: 통과 확인**

Run: `cd map/mobile && node --test test/api.test.mjs`
Expected: PASS (기존 8 + 신규 4 = 12건)

- [ ] **Step 5: 라이브 확인**

```bash
cd map/mobile && node -e '
const A=require("./www/api.js");
A.loadTicker("APPL","1day").catch(e=>console.log("notfound:",e.notfound,"제안:",JSON.stringify(e.suggest)));
A.loadTicker("AAPL","1day").then(o=>console.log("정상:",o.candle.length,"봉 ·",o.name));'
```
Expected: 제안 3건(`AAPL` 포함) · 정상 4000봉 이상

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/api.js map/mobile/test/api.test.mjs
git commit -m "mobile(p1): loadTicker — 조회 + 오타 제안

notfound 일 때 서버가 주는 Yahoo 기반 제안을 err.suggest 로 올린다(APPL -> AAPL).
fetchImpl 주입구로 테스트는 네트워크 없이 돈다. api.test.mjs 12건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: scan.js — 순차 스캔 큐

**Files:**
- Create: `map/mobile/www/scan.js`
- Create: `map/mobile/test/scan.test.mjs`

**Interfaces:**
- Consumes: 없음(모든 의존을 주입받는다)
- Produces: `MSScan.createScanner({ loadOne, analyze, sleep, gap, maxRetry })` → `{ run(syms, onEach) -> Promise<{done, failed}> }`
  - `loadOne(sym) -> Promise<normalized>` · `analyze(sym, normalized) -> Rec` · `sleep(ms) -> Promise` (테스트 주입)
  - `onEach(sym, rec|null, err|null)` 를 종목마다 즉시 호출한다 — 전체 완료를 기다리지 않는다
  - `gap` 기본 900(ms), `maxRetry` 기본 2. 재시도 지연은 `gap * 2^attempt`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/scan.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSScan = require("../www/scan.js");

function harness(behavior) {
  const slept = [];
  const calls = [];
  const scanner = MSScan.createScanner({
    loadOne: async sym => { calls.push(sym); const b = behavior[sym]; if (typeof b === "function") return b(); return { sym }; },
    analyze: (sym, data) => ({ sym, price: 1 }),
    sleep: async ms => { slept.push(ms); },
    gap: 100, maxRetry: 2
  });
  return { scanner, slept, calls };
}

test("종목을 입력 순서대로 처리한다", async () => {
  const h = harness({});
  const seen = [];
  await h.scanner.run(["AAPL", "NVDA", "MSFT"], s => seen.push(s));
  assert.deepEqual(h.calls, ["AAPL", "NVDA", "MSFT"]);
  assert.deepEqual(seen, ["AAPL", "NVDA", "MSFT"]);
});

test("각 종목 결과를 즉시 콜백한다 — 전체 완료를 기다리지 않는다", async () => {
  const h = harness({});
  const at = [];
  await h.scanner.run(["AAPL", "NVDA"], (sym, rec) => at.push([sym, rec && rec.price]));
  assert.deepEqual(at, [["AAPL", 1], ["NVDA", 1]]);
});

test("실패는 지수 백오프로 재시도하고, 소진되면 err 로 콜백한 뒤 계속 간다", async () => {
  let n = 0;
  const h = harness({ AAPL: () => { n++; throw new Error("429"); } });
  const out = [];
  const r = await h.scanner.run(["AAPL", "NVDA"], (sym, rec, err) => out.push([sym, !!err]));
  assert.equal(n, 3, "1회 + 재시도 2회여야 한다");
  assert.deepEqual(h.slept.filter(x => x >= 100), [100, 200, 100], "백오프 100·200 후 다음 종목 간격 100");
  assert.deepEqual(out, [["AAPL", true], ["NVDA", false]]);
  assert.deepEqual(r, { done: 1, failed: 1 });
});

test("한 번 실패 후 성공하면 재시도 결과를 쓴다", async () => {
  let n = 0;
  const h = harness({ AAPL: () => { n++; if (n === 1) throw new Error("429"); return { sym: "AAPL" }; } });
  const out = [];
  await h.scanner.run(["AAPL"], (sym, rec, err) => out.push([sym, !!rec, !!err]));
  assert.deepEqual(out, [["AAPL", true, false]]);
});

test("빈 목록은 즉시 끝난다", async () => {
  const h = harness({});
  assert.deepEqual(await h.scanner.run([], () => {}), { done: 0, failed: 0 });
  assert.equal(h.slept.length, 0);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/scan.test.mjs`
Expected: FAIL — `Cannot find module '../www/scan.js'`

- [ ] **Step 3: 구현**

`map/mobile/www/scan.js`:

```js
// 워치리스트 스캔 큐. 순차 처리 + 지수 백오프.
// 순차인 이유: TwelveData 무료가 분당 8회다. 서버가 일봉을 1시간 캐시하므로 웜 종목은
// 빠르게 지나가고, 한도에 실제로 걸리는 것은 콜드 종목뿐이다.
// 부분 결과를 즉시 콜백한다 — 8종목 전체를 기다리면 첫 정보까지 수 초가 죽는다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSScan = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createScanner(opts) {
    var loadOne = opts.loadOne, analyze = opts.analyze;
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var gap = (opts.gap == null) ? 900 : opts.gap;
    var maxRetry = (opts.maxRetry == null) ? 2 : opts.maxRetry;

    async function one(sym) {
      var lastErr = null;
      for (var attempt = 0; attempt <= maxRetry; attempt++) {
        if (attempt > 0) await sleep(gap * Math.pow(2, attempt - 1));
        try { return analyze(sym, await loadOne(sym)); }
        catch (e) { lastErr = e; }
      }
      throw lastErr || new Error("scan failed: " + sym);
    }

    async function run(syms, onEach) {
      var list = Array.isArray(syms) ? syms : [];
      var done = 0, failed = 0;
      for (var i = 0; i < list.length; i++) {
        var sym = list[i];
        try { var rec = await one(sym); done++; onEach && onEach(sym, rec, null); }
        catch (e) { failed++; onEach && onEach(sym, null, e); }
        if (i < list.length - 1) await sleep(gap);
      }
      return { done: done, failed: failed };
    }

    return { run: run };
  }

  return { createScanner: createScanner };
});
```

- [ ] **Step 4: 통과 확인**

Run: `cd map/mobile && node --test test/scan.test.mjs`
Expected: PASS (5건)

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/scan.js map/mobile/test/scan.test.mjs
git commit -m "mobile(p1): scan — 순차 스캔 큐(지수 백오프·부분 결과 즉시 콜백)

순차인 이유는 TwelveData 분당 8회. 서버 1시간 캐시가 웜 종목을 흡수하므로
한도에 걸리는 건 콜드뿐이다. 전체 완료를 기다리면 첫 정보까지 수 초가 죽는다.
sleep 주입으로 테스트는 실시간 대기 없이 돈다. scan.test.mjs 5건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: chart-layout.js — 패널 레이아웃과 11키 M

이 태스크가 Phase 1 차트의 뼈대다. 여기서 만든 `M` 이 Task 6·7 의 포팅 함수에 그대로 들어간다.

**Files:**
- Create: `map/mobile/www/chart-layout.js`
- Create: `map/mobile/test/chart-layout.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `MSChartLayout.chartLayout(opts) -> Layout` · `MSChartLayout.RATIOS`
  - `opts` = `{ candle, prediction, width, height, pad?, tailBars?, panels? }` (`panels` 기본 `["price","volume","rsi","macd"]`)
  - `Layout` = `{ fiToX, nowFi, fiMin, tail, fut, bw, order, panels: { [name]: { rect:{x,y,w,h}, M } } }`
  - `M` = `{ fiToX, pToY, nowFi, fiMin, reveal, xRight, xNow, futBars, focused, badgeY, lastPrice }`

**중요**: `fi` 는 **꼬리 구간 내 인덱스가 아니라 원본 `candle` 배열의 절대 인덱스**다. PC 포팅 함수가 `fiMin`~`nowFi` 범위로 순회하므로 절대 인덱스여야 지표 시계열과 정렬된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/chart-layout.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const CL = require("../www/chart-layout.js");

function candles(n, flat) {
  const out = [];
  for (let i = 0; i < n; i++) { const b = flat ? 100 : 100 + i; out.push({ o: b, h: b + 2, l: b - 1, c: b + (i % 2 ? 1 : -1), v: 1000 + i }); }
  return out;
}
function prediction(n) {
  const path = [], lo = [], hi = [];
  for (let i = 0; i < n; i++) { path.push(200 + i); lo.push(195 + i); hi.push(205 + i); }
  return { path, lo, hi, futW: n };
}
const base = () => ({ candle: candles(300), prediction: prediction(24), width: 372, height: 520, pad: 10, tailBars: 120 });

test("패널 높이 합이 전체 높이에서 패딩을 뺀 값과 같다", () => {
  const L = CL.chartLayout(base());
  const hs = L.order.map(k => L.panels[k].rect.h);
  const gaps = (L.order.length - 1) * CL.GAP;
  assert.ok(Math.abs(hs.reduce((a, b) => a + b, 0) + gaps - (520 - 20)) < 0.01);
});

test("패널은 위에서 아래로 겹치지 않게 쌓인다", () => {
  const L = CL.chartLayout(base());
  let prevBottom = -1;
  for (const k of L.order) {
    const r = L.panels[k].rect;
    assert.ok(r.y >= prevBottom, k + " 패널이 위 패널과 겹친다");
    prevBottom = r.y + r.h;
  }
});

test("fi 는 원본 배열의 절대 인덱스다 — nowFi 는 마지막 봉", () => {
  const L = CL.chartLayout(base());
  assert.equal(L.nowFi, 299);
  assert.equal(L.fiMin, 180, "300봉 중 꼬리 120 => 180 부터");
});

test("가격 패널 pToY 는 최고/최저를 rect 경계에 매핑한다", () => {
  const L = CL.chartLayout(base());
  const p = L.panels.price, M = p.M;
  const tail = candles(300).slice(180);
  const lo = Math.min(...tail.map(b => b.l), ...prediction(24).lo);
  const hi = Math.max(...tail.map(b => b.h), ...prediction(24).hi);
  assert.ok(Math.abs(M.pToY(hi) - p.rect.y) < 0.01);
  assert.ok(Math.abs(M.pToY(lo) - (p.rect.y + p.rect.h)) < 0.01);
});

test("RSI 패널은 0-100 고정 스케일이다", () => {
  const L = CL.chartLayout(base());
  const r = L.panels.rsi;
  assert.ok(Math.abs(r.M.pToY(100) - r.rect.y) < 0.01);
  assert.ok(Math.abs(r.M.pToY(0) - (r.rect.y + r.rect.h)) < 0.01);
});

test("M 은 포팅 함수가 요구하는 11키를 모두 갖는다", () => {
  const L = CL.chartLayout(base());
  const need = ["fiToX", "pToY", "nowFi", "fiMin", "reveal", "xRight", "xNow", "futBars", "focused", "badgeY", "lastPrice"];
  for (const k of Object.keys(L.panels)) {
    for (const key of need) assert.ok(key in L.panels[k].M, k + " 패널 M 에 " + key + " 없음");
  }
});

test("reveal 은 Infinity — Phase 1 에 리빌 애니메이션이 없다", () => {
  const L = CL.chartLayout(base());
  assert.equal(L.panels.price.M.reveal, Infinity);
});

test("예측이 있으면 xNow 가 마지막 실봉 x, xRight 가 플롯 오른쪽 끝", () => {
  const L = CL.chartLayout(base());
  const M = L.panels.price.M;
  assert.ok(M.xNow < M.xRight, "예측 구간이 오른쪽에 없다");
  assert.ok(Math.abs(M.xNow - L.fiToX(L.nowFi)) < 0.01);
});

test("평탄 시리즈에서 NaN 이 나오지 않는다", () => {
  const L = CL.chartLayout(Object.assign(base(), { candle: candles(60, true).map(() => ({ o: 100, h: 100, l: 100, c: 100, v: 0 })), prediction: null }));
  assert.ok(Number.isFinite(L.panels.price.M.pToY(100)));
  assert.ok(Number.isFinite(L.panels.volume.M.pToY(0)));
});

test("패널을 빼면 남은 패널이 높이를 나눠 갖는다", () => {
  const L = CL.chartLayout(Object.assign(base(), { panels: ["price", "volume"] }));
  assert.deepEqual(L.order, ["price", "volume"]);
  assert.equal(L.panels.rsi, undefined);
  const hs = L.order.map(k => L.panels[k].rect.h);
  assert.ok(Math.abs(hs.reduce((a, b) => a + b, 0) + CL.GAP - (520 - 20)) < 0.01);
});

test("lastPrice 는 마지막 종가다 — 거래량 레이어가 쓴다", () => {
  const L = CL.chartLayout(base());
  const c = candles(300);
  assert.equal(L.panels.volume.M.lastPrice, c[299].c);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/chart-layout.test.mjs`
Expected: FAIL — `Cannot find module '../www/chart-layout.js'`

- [ ] **Step 3: 구현**

`map/mobile/www/chart-layout.js`:

```js
// 4단 적층 차트의 좌표계. 각 패널이 자기 pToY 를 갖고 fiToX 를 공유한다 —
// 이 M 이 PC 에서 포팅한 _drawXLayers(c, data, M) 의 인자와 같은 모양이라 수정 없이 꽂힌다.
// fi 는 꼬리 구간 인덱스가 아니라 원본 candle 배열의 절대 인덱스다(지표 시계열과 정렬해야 하므로).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSChartLayout = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RATIOS = { price: 0.52, volume: 0.12, rsi: 0.18, macd: 0.18 };
  var GAP = 8;                      // 패널 사이 여백(px)
  var AXIS_W = 44;                  // 우측 가격축 폭

  function chartLayout(o) {
    var candle = o.candle || [], pred = o.prediction || null;
    var W = o.width, H = o.height, pad = (o.pad == null ? 10 : o.pad);
    var order = (o.panels && o.panels.length) ? o.panels.slice() : ["price", "volume", "rsi", "macd"];

    var n = candle.length;
    var tail = Math.min(o.tailBars || 120, n);
    var fiMin = Math.max(0, n - tail), nowFi = n - 1;
    var fut = (pred && pred.path) ? pred.path.length : 0;

    var plotW = W - pad * 2 - AXIS_W;
    var slots = Math.max(1, tail + fut);
    var dx = plotW / slots;
    function fiToX(fi) { return pad + (fi - fiMin + 0.5) * dx; }
    var xNow = fiToX(nowFi), xRight = pad + plotW;

    // 높이 배분 — 요청된 패널의 비율만 정규화한다
    var sum = order.reduce(function (s, k) { return s + (RATIOS[k] || 0); }, 0) || 1;
    var avail = H - pad * 2 - GAP * Math.max(0, order.length - 1);

    function mapper(rect, lo, hi) {
      if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
      if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
      return function (v) { return rect.y + rect.h * (1 - (v - lo) / (hi - lo)); };
    }

    var tailBars = candle.slice(fiMin);
    var pLo = Infinity, pHi = -Infinity;
    tailBars.forEach(function (b) { if (b.l < pLo) pLo = b.l; if (b.h > pHi) pHi = b.h; });
    if (pred) {
      (pred.lo || []).forEach(function (v) { if (v < pLo) pLo = v; });
      (pred.hi || []).forEach(function (v) { if (v > pHi) pHi = v; });
    }
    var vMax = 0;
    tailBars.forEach(function (b) { var v = (b.v != null && isFinite(b.v)) ? b.v : 0; if (v > vMax) vMax = v; });

    var scales = { price: [pLo, pHi], volume: [0, vMax], rsi: [0, 100], macd: null };
    var lastPrice = n ? candle[n - 1].c : 0;

    var panels = {}, y = pad;
    order.forEach(function (k, i) {
      var h = avail * ((RATIOS[k] || 0) / sum);
      var rect = { x: pad, y: y, w: plotW, h: h };
      var sc = scales[k];
      // 서브패널(volume·rsi·macd)의 pToY 는 Phase 1 에서 쓰이지 않는다 — fcDrawX 렌더러가
      // (cw, ch) 를 받아 자체 기하를 계산하기 때문이다. 그래도 채워 두는 이유는 두 가지:
      // M 계약을 패널마다 동일하게 유지하는 것과, 크로스헤어를 서브패널까지 확장할 때 필요한 것.
      var pToY = sc ? mapper(rect, sc[0], sc[1]) : mapper(rect, -1, 1);
      panels[k] = {
        rect: rect,
        M: { fiToX: fiToX, pToY: pToY, nowFi: nowFi, fiMin: fiMin, reveal: Infinity,
             xRight: xRight, xNow: xNow, futBars: fut, focused: false,
             badgeY: rect.y + 14, lastPrice: lastPrice }
      };
      y += h + GAP;
    });

    return { fiToX: fiToX, nowFi: nowFi, fiMin: fiMin, tail: tail, fut: fut,
             bw: Math.max(1, dx * 0.62), order: order, panels: panels,
             plot: { x: pad, w: plotW }, axisW: AXIS_W, priceRange: [pLo, pHi] };
  }

  return { RATIOS: RATIOS, GAP: GAP, AXIS_W: AXIS_W, chartLayout: chartLayout };
});
```

- [ ] **Step 4: 통과 확인**

Run: `cd map/mobile && node --test test/chart-layout.test.mjs`
Expected: PASS (11건)

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/chart-layout.js map/mobile/test/chart-layout.test.mjs
git commit -m "mobile(p1): chart-layout — 4단 적층 좌표계와 11키 M

각 패널이 자기 pToY 를 갖고 fiToX 를 공유한다. 이 M 이 PC _drawXLayers 의
인자 모양과 같아서 포팅 함수가 수정 없이 꽂힌다.
fi 는 꼬리 인덱스가 아니라 원본 배열의 절대 인덱스 — 지표 시계열과 정렬해야 한다.
chart-layout.test.mjs 11건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: draw-layers.js — PC 포팅 A (가격 패널 오버레이·배지)

**Files:**
- Create: `map/mobile/www/draw-layers.js`
- Create: `map/mobile/test/draw-layers.test.mjs`
- Read-only 참조: `map/forge-draw.js` (**수정 금지**)

**Interfaces:**
- Consumes: Task 5 의 `M`
- Produces: `MSLayers = { resetLabels(w, h), ma(c, maData, M), bollinger(c, bbData, M), rsiBadge(c, rsiData, M), macdBadge(c, macdData, M), volumeBadge(c, volData, M) }`
  - 데이터는 엔진 출력 그대로: `ForgeCore.analyzeMA/analyzeBollinger/analyzeRSI/analyzeMACD/analyzeVolume`

**포팅 절차** — `map/forge-draw.js` 에서 아래 심볼을 **원문 그대로** 복사한다. 줄 번호는 현재 파일 기준의 참고값이며, **심볼 이름으로 찾는 것이 정본**이다(파일이 바뀌면 번호가 밀린다).

```
FC_BULL FC_BEAR FC_DIM CW CDASH _skFrac _polyLen _skStroke _skReady
_evLabelBoxes _labelMode _KEYLBL _evW _evLabel _drawProjLine _predDir
_projMarkScale _projMark _projFwd
_drawMALayers _drawRsiLayers _drawVolumeLayers _drawBollingerLayers _drawMacdLayers
```

현재 줄 구간(참고): `7-9, 35-36, 1278-1286, 1295, 1310-1311, 1836, 1838-1867, 1923-1947, 2002-2011, 2117-2175, 2361-2381, 2383-2413, 2545-2571, 2573-2580` — 합계 24심볼 229줄.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/draw-layers.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L  = require("../www/draw-layers.js");
const CL = require("../www/chart-layout.js");
const FC = require("../../forge-core.js");

// 캔버스는 반환값이 아니라 실제 페인트를 단언해야 한다(이 저장소의 스와치 사고 교훈).
function recCtx() {
  const calls = [], st = { fillStyle: null, strokeStyle: null, lineWidth: null, globalAlpha: 1, font: null, textAlign: null, letterSpacing: null };
  const rec = n => (...a) => calls.push({ op: n, args: a, fill: st.fillStyle, stroke: st.strokeStyle, alpha: st.globalAlpha });
  const c = {};
  for (const n of ["save","restore","beginPath","closePath","moveTo","lineTo","fill","stroke","fillRect","strokeRect","arc","setLineDash","fillText","clip","rect","translate","roundRect","quadraticCurveTo","bezierCurveTo"]) c[n] = rec(n);
  c.measureText = t => ({ width: String(t).length * 6 });
  c.createLinearGradient = () => ({ addColorStop() {} });
  for (const k of Object.keys(st)) Object.defineProperty(c, k, { get: () => st[k], set: v => { st[k] = v; } });
  c.calls = calls;
  return c;
}

const d = FC.makeDemoSeries(400);
const price = d.price;
const vol = d.candle.map((_, i) => 1e6 + Math.abs(Math.sin(i * 0.3)) * 5e5);
const candle = d.candle.map((b, i) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: vol[i] }));
const layout = () => CL.chartLayout({ candle, prediction: { path: [], lo: [], hi: [] }, width: 372, height: 520, pad: 10, tailBars: 120 });

test("MA 레이어가 실제로 선을 긋는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  L.ma(c, FC.analyzeMA(price, { len: 20, ema: false }), layout().panels.price.M);
  assert.ok(c.calls.filter(x => x.op === "stroke").length >= 3, "MA 다중선이 3개 미만");
  assert.ok(c.calls.length > 200, "페인트 콜이 " + c.calls.length + " 개뿐 — 기준선 508");
});

test("볼린저가 밴드를 채우고 상하단을 점선으로 긋는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  L.bollinger(c, FC.analyzeBollinger(price, { len: 20, k: 2 }), layout().panels.price.M);
  assert.ok(c.calls.some(x => x.op === "fill"), "밴드 채움이 없다");
  assert.ok(c.calls.some(x => x.op === "setLineDash" && Array.isArray(x.args[0]) && x.args[0].length), "상하단 점선이 없다");
  assert.ok(c.calls.length > 200, "페인트 콜이 " + c.calls.length + " 개뿐 — 기준선 621");
});

test("배지 3종은 텍스트를 그린다", () => {
  const M = layout();
  for (const [name, data, m] of [
    ["rsiBadge", FC.analyzeRSI(price, { len: 14 }), M.panels.price.M],
    ["macdBadge", FC.analyzeMACD(price, { fast: 12, slow: 26, signal: 9 }), M.panels.price.M],
    ["volumeBadge", FC.analyzeVolume(vol, price), M.panels.price.M]
  ]) {
    const c = recCtx(); L.resetLabels(372, 520);
    L[name](c, data, m);
    assert.ok(c.calls.some(x => x.op === "fillText"), name + " 가 텍스트를 안 그렸다");
  }
});

test("resetLabels 를 부르지 않아도 던지지 않는다", () => {
  const c = recCtx();
  assert.doesNotThrow(() => L.ma(c, FC.analyzeMA(price, { len: 20 }), layout().panels.price.M));
});

test("빈 데이터에도 던지지 않는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  assert.doesNotThrow(() => L.bollinger(c, { mid: [], upper: [], lower: [] }, layout().panels.price.M));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/draw-layers.test.mjs`
Expected: FAIL — `Cannot find module '../www/draw-layers.js'`

- [ ] **Step 3: 구현 — 포팅**

`map/mobile/www/draw-layers.js` 를 만들고, 아래 껍데기 사이에 위 24심볼을 `forge-draw.js` 원문 그대로 붙여넣는다.

```js
// PC 스쿱포지 forge-draw.js 에서 포팅 — 가격 패널 오버레이·배지.
// 작도는 엔진과 달리 단일 원본이 아니다(표현이지 분석이 아니며 폼팩터가 다르다).
// 숫자는 여전히 forge-core.js 단일 원본이다.
// 원본 심볼: FC_BULL FC_BEAR FC_DIM CW CDASH _skFrac _polyLen _skStroke _skReady
//           _evLabelBoxes _labelMode _KEYLBL _evW _evLabel _drawProjLine _predDir
//           _projMarkScale _projMark _projFwd
//           _drawMALayers _drawRsiLayers _drawVolumeLayers _drawBollingerLayers _drawMacdLayers
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSLayers = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ── 심: PC 가 전역/다른 파일에서 받던 것들 ──
  var FC_GOLD = "#e8b463";                    // 핸드오프 gold
  var _ov = null, _evLegend = null;           // PC 오버레이 상태 — 모바일 미사용
  var _axisLabelBoxes = [], _predLabelBoxes = [];
  function _hzFmt(v) { return (Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()); }  // forge-app.js:161

  /* ===== 여기부터 forge-draw.js 원문 복사 ===== */
  /* ... 24심볼 ... */
  /* ===== 원문 복사 끝 ===== */

  // 매 프레임 라벨 레지스트리 초기화 — 안 부르면 이전 프레임 박스가 남아 라벨이 밀린다
  function resetLabels(w, h) {
    _evLabelBoxes = []; _axisLabelBoxes = []; _predLabelBoxes = [];
    _evW = w; _evH = h; _labelMode = "all";
  }

  return { resetLabels: resetLabels,
           ma: _drawMALayers, bollinger: _drawBollingerLayers,
           rsiBadge: _drawRsiLayers, macdBadge: _drawMacdLayers, volumeBadge: _drawVolumeLayers };
});
```

**포팅 시 주의 두 가지(스파이크에서 실제로 걸린 것)**

1. `_evW` 와 `_evH` 는 **한 줄에 함께 선언**돼 있다(`let _evW = 0, _evH = 0;`). 심에서 `_evH` 를 또 선언하면 `SyntaxError: Identifier '_evH' has already been declared` 가 난다. 심에는 넣지 말 것.
2. `FC_BULL`/`FC_BEAR` 도 인접 줄에 함께 있다. 범위를 겹쳐 복사하면 같은 중복 선언 오류가 난다.

- [ ] **Step 4: 통과 확인**

Run: `cd map/mobile && node --test test/draw-layers.test.mjs`
Expected: PASS (5건). MA 는 약 508콜, 볼린저는 약 621콜이 나와야 한다 — 자릿수가 다르면 포팅이 잘린 것이다.

- [ ] **Step 5: 전체 스위트**

Run: `cd map/mobile && npm test`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/draw-layers.js map/mobile/test/draw-layers.test.mjs
git commit -m "mobile(p1): draw-layers — PC 가격 패널 오버레이 포팅(MA·볼린저 + 배지 3종)

forge-draw.js 24심볼 229줄을 원문 복사 + 심. forge-draw.js 는 수정하지 않았다.
페인트 단언은 recording-ctx 로 — MA 508콜·볼린저 621콜이 기준선.
draw-layers.test.mjs 5건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: draw-panels.js — PC 포팅 B (서브패널 3종)

`_drawRsiLayers` 는 RSI 서브패널을 그리지 않는다 — 가격 차트 위 배지일 뿐이다(Task 6). 진짜 서브패널은 `fcDrawRsi` 계열이며 자기 캔버스를 DOM 에서 직접 잡으므로 **머리 3줄을 인자로 바꾸는 수술**이 필요하다.

**Files:**
- Create: `map/mobile/www/draw-panels.js`
- Create: `map/mobile/test/draw-panels.test.mjs`
- Read-only 참조: `map/forge-draw.js` (**수정 금지**)

**Interfaces:**
- Consumes: Task 5 의 `panels[k].rect`
- Produces: `MSPanels = { rsi(c, cw, ch, rsiData, reveal), macd(c, cw, ch, macdData, reveal), volume(c, cw, ch, volData, reveal) }`
  - `reveal` 은 항상 `Infinity` 를 넘긴다(Phase 1 에 리빌 애니메이션 없음)
  - 호출 전에 `c.save()` + `c.translate(rect.x, rect.y)` 로 원점을 옮기고, 끝나면 `c.restore()` — 함수 내부는 `(0,0)` 기준으로 그린다

**포팅 대상 심볼**: `FC_ACC FC_DIM _oscA fcFit _osReveal fcDrawRsi fcDrawMacd fcDrawVol` (8심볼 99줄). 현재 줄 구간(참고): `2, 9, 16, 198-207, 430-464, 538-553, 576-610`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/draw-panels.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P  = require("../www/draw-panels.js");
const FC = require("../../forge-core.js");

function recCtx() {
  const calls = [], st = { fillStyle: null, strokeStyle: null, lineWidth: null, globalAlpha: 1, font: null, textAlign: null };
  const rec = n => (...a) => calls.push({ op: n, args: a, fill: st.fillStyle, stroke: st.strokeStyle });
  const c = {};
  for (const n of ["save","restore","beginPath","closePath","moveTo","lineTo","fill","stroke","fillRect","clearRect","setLineDash","fillText","arc","rect","clip","translate","roundRect","quadraticCurveTo"]) c[n] = rec(n);
  c.measureText = t => ({ width: String(t).length * 6 });
  c.createLinearGradient = () => ({ addColorStop() {} });
  for (const k of Object.keys(st)) Object.defineProperty(c, k, { get: () => st[k], set: v => { st[k] = v; } });
  c.calls = calls;
  return c;
}

const d = FC.makeDemoSeries(400), price = d.price;
const vol = d.candle.map((_, i) => 1e6 + Math.abs(Math.sin(i * 0.3)) * 5e5);

test("RSI 패널이 라인과 70/30 가이드를 그린다", () => {
  const c = recCtx();
  P.rsi(c, 372, 90, FC.analyzeRSI(price, { len: 14 }), Infinity);
  assert.ok(c.calls.length > 300, "콜 " + c.calls.length + " — 기준선 990");
  assert.ok(c.calls.filter(x => x.op === "stroke").length >= 3, "가이드선 3개(30/50/70)가 없다");
  assert.ok(c.calls.some(x => x.op === "fillText"), "눈금 숫자가 없다");
});

test("MACD 패널이 히스토그램 막대를 그린다", () => {
  const c = recCtx();
  P.macd(c, 372, 90, FC.analyzeMACD(price, { fast: 12, slow: 26, signal: 9 }), Infinity);
  const bars = c.calls.filter(x => x.op === "fillRect").length;
  assert.ok(bars > 100, "히스토그램 막대가 " + bars + "개뿐 — 기준선 480");
});

test("거래량 패널이 막대를 그린다", () => {
  const c = recCtx();
  P.volume(c, 372, 60, FC.analyzeVolume(vol, price), Infinity);
  assert.ok(c.calls.filter(x => x.op === "fillRect").length > 20, "거래량 막대가 없다");
  assert.ok(c.calls.length > 200, "콜 " + c.calls.length + " — 기준선 554");
});

test("데이터가 비면 안내 문구만 그리고 던지지 않는다", () => {
  for (const [name, empty] of [["rsi", { series: [] }], ["macd", { macd: [], sig: [], hist: [] }], ["volume", { series: [] }]]) {
    const c = recCtx();
    assert.doesNotThrow(() => P[name](c, 372, 90, empty, Infinity), name + " 가 빈 데이터에 던졌다");
    assert.ok(c.calls.some(x => x.op === "fillText"), name + " 가 안내 문구를 안 그렸다");
  }
});

test("DOM 없이 동작한다 — document 를 참조하지 않는다", () => {
  assert.equal(typeof globalThis.document, "undefined", "이 테스트는 DOM 없는 환경을 전제한다");
  const c = recCtx();
  assert.doesNotThrow(() => P.rsi(c, 372, 90, FC.analyzeRSI(price, { len: 14 }), Infinity));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/draw-panels.test.mjs`
Expected: FAIL — `Cannot find module '../www/draw-panels.js'`

- [ ] **Step 3: 구현 — 포팅 + 머리 수술**

`map/mobile/www/draw-panels.js`:

```js
// PC 스쿱포지 forge-draw.js 에서 포팅 — 오실레이터·거래량 서브패널.
// 원본은 자기 캔버스를 document.getElementById 로 직접 잡으므로 머리 3줄을 인자로 바꿨다.
// 원본 심볼: FC_ACC FC_DIM _oscA fcFit _osReveal fcDrawRsi fcDrawMacd fcDrawVol
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSPanels = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ── 심 ──
  var _oscRGB = "232,180,99";            // 핸드오프 gold #e8b463 의 rgb — 정확히 일치한다
  var FC_OSC  = "#e8b463";
  function _hbarRsi() { return ""; }     // 원본은 meta HTML 게이지용. 모바일은 Counted 섹션이 대신한다

  /* ===== 여기부터 forge-draw.js 원문 복사(머리 수술 적용) ===== */
  /* ... 8심볼 ... */
  /* ===== 원문 복사 끝 ===== */

  return { rsi: fcDrawRsi, macd: fcDrawMacd, volume: fcDrawVol };
});
```

**머리 수술 — 세 함수 각각**

`fcDrawRsi` 원문 머리:

```js
  function fcDrawRsi(rsi, reveal) {
    const cv = document.getElementById("fcRsi"); if (!cv) return;
    const ch = cv.clientHeight || 120, c = fcFit(cv, ch), cw = cv.clientWidth || 400;
    c.clearRect(0, 0, cw, ch);
```

로 바꾼다:

```js
  function fcDrawRsi(c, cw, ch, rsi, reveal) {
    c.clearRect(0, 0, cw, ch);
```

`fcDrawMacd` 도 같은 형태다. **`fcDrawVol` 만 머리 형태가 다르다**:

```js
  function fcDrawVol(va, reveal) {
    const cv = document.getElementById("fcVol"); if (!cv) return;
    const cw = cv.clientWidth || 300, ch = cv.clientHeight || 120;
    const c = fcFit(cv, ch); c.clearRect(0, 0, cw, ch);
```

로 바꾼다:

```js
  function fcDrawVol(c, cw, ch, va, reveal) {
    c.clearRect(0, 0, cw, ch);
```

세 함수 본문에 남아 있는 `document.getElementById("fc*Meta")` 블록은 **통째로 삭제한다**(PC 의 텍스트 게이지 갱신용이며, 모바일은 같은 값을 Counted 섹션에서 보여준다). 삭제 후 `grep -c "document\." map/mobile/www/draw-panels.js` 가 **0** 이어야 한다.

- [ ] **Step 4: DOM 참조가 남지 않았는지 확인**

```bash
cd map/mobile && grep -c "document\.\|clientWidth\|clientHeight" www/draw-panels.js
```
Expected: `0`

- [ ] **Step 5: 통과 확인**

Run: `cd map/mobile && node --test test/draw-panels.test.mjs`
Expected: PASS (5건). RSI 약 990콜 · MACD `fillRect` 약 480 · 거래량 약 554콜.

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/draw-panels.js map/mobile/test/draw-panels.test.mjs
git commit -m "mobile(p1): draw-panels — PC 서브패널 포팅(RSI·MACD·거래량)

_drawRsiLayers 는 배지일 뿐이고 진짜 서브패널은 fcDrawRsi 계열이다.
자기 캔버스를 DOM 에서 잡으므로 머리 3줄을 (c, cw, ch, data, reveal) 로 수술.
meta 텍스트 갱신 블록은 삭제(모바일은 Counted 섹션이 대신한다). document 참조 0.
draw-panels.test.mjs 5건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: chart-draw.js — 캔들·콘·축·크로스헤어

**Files:**
- Create: `map/mobile/www/chart-draw.js`
- Create: `map/mobile/test/chart-draw.test.mjs`
- Delete: `map/mobile/www/chart.js`, `map/mobile/test/chart.test.mjs`

**Interfaces:**
- Consumes: Task 5 의 `Layout`
- Produces: `MSChartDraw = { drawCandles(c, layout, candle, col), drawCone(c, layout, prediction, col), drawAxes(c, layout, candle, col, opts), drawCrosshair(c, layout, fi, candle, col), fiAtX(layout, x) -> number }`
  - `col` = `{ bull, bear, gold, cone, ink4, ink5, hairline }`
  - `opts` = `{ ticks?: number }` (기본 4)

Phase 0 `chart.js` 의 `chartGeometry`/`drawChart` 는 폐기한다 — `chartLayout` 이 좌표계를, 아래 함수들이 페인트를 대신한다. 기존 `chart.test.mjs` 10건 중 기하 관련 6건은 Task 5 에서 이미 대체됐고, 페인트 4건은 아래로 이관한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/chart-draw.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const D  = require("../www/chart-draw.js");
const CL = require("../www/chart-layout.js");

const COL = { bull: "#4fb98a", bear: "#d96a6a", gold: "#e8b463", cone: "rgba(232,180,99,.09)",
              ink4: "#7c8598", ink5: "#78819a", hairline: "rgba(238,241,247,.06)" };

function recCtx() {
  const calls = [], st = { fillStyle: null, strokeStyle: null, lineWidth: null, font: null, textAlign: null, globalAlpha: 1 };
  const rec = n => (...a) => calls.push({ op: n, args: a, fill: st.fillStyle, stroke: st.strokeStyle, font: st.font });
  const c = {};
  for (const n of ["save","restore","beginPath","closePath","moveTo","lineTo","fill","stroke","fillRect","setLineDash","fillText","rect","clip","translate","roundRect"]) c[n] = rec(n);
  c.measureText = t => ({ width: String(t).length * 6 });
  for (const k of Object.keys(st)) Object.defineProperty(c, k, { get: () => st[k], set: v => { st[k] = v; } });
  c.calls = calls;
  return c;
}
function candles(n) {
  const out = [];
  for (let i = 0; i < n; i++) { const b = 100 + i; out.push({ o: b, h: b + 2, l: b - 1, c: b + (i % 2 ? 1 : -1), v: 1000 + i, t: "2026-01-01" }); }
  return out;
}
const pred = { path: [130, 131, 132], lo: [128, 129, 130], hi: [132, 133, 134], futW: 3 };
const L = () => CL.chartLayout({ candle: candles(150), prediction: pred, width: 372, height: 520, pad: 10, tailBars: 120 });

test("상승봉은 bull, 하락봉은 bear 로 실제로 칠해진다 — 봉마다 대응을 고정", () => {
  const c = recCtx(), lay = L(), cd = candles(150);
  D.drawCandles(c, lay, cd, COL);
  const rects = c.calls.filter(x => x.op === "fillRect");
  assert.equal(rects.length, lay.tail, "몸통 수가 꼬리 봉 수와 다르다");
  const tail = cd.slice(lay.fiMin);
  tail.forEach((b, i) => {
    assert.equal(rects[i].fill, (b.c >= b.o) ? COL.bull : COL.bear, "봉 " + i + " up=" + (b.c >= b.o));
  });
});

test("몸통 높이는 최소 1px — 도지가 사라지지 않는다", () => {
  const doji = Array.from({ length: 130 }, () => ({ o: 100, h: 101, l: 99, c: 100, v: 1, t: "2026-01-01" }));
  const c = recCtx();
  D.drawCandles(c, CL.chartLayout({ candle: doji, prediction: null, width: 372, height: 520, pad: 10, tailBars: 120 }), doji, COL);
  assert.ok(c.calls.filter(x => x.op === "fillRect").every(r => r.args[3] >= 1));
});

test("콘을 cone 색으로 채우고 경로를 gold 로 긋는다", () => {
  const c = recCtx();
  D.drawCone(c, L(), pred, COL);
  assert.ok(c.calls.some(x => x.op === "fill" && x.fill === COL.cone), "콘 채움이 없다");
  assert.ok(c.calls.some(x => x.op === "stroke" && x.stroke === COL.gold), "예측 경로 gold 스트로크가 없다");
});

test("예측이 없으면 콘도 경로도 그리지 않는다", () => {
  const c = recCtx();
  D.drawCone(c, CL.chartLayout({ candle: candles(150), prediction: null, width: 372, height: 520 }), null, COL);
  assert.equal(c.calls.filter(x => x.op === "fill" || x.op === "stroke").length, 0);
});

test("축 글자는 10.5px 이상이다 — 이보다 작으면 폰에서 안 읽힌다", () => {
  const c = recCtx();
  D.drawAxes(c, L(), candles(150), COL);
  const texts = c.calls.filter(x => x.op === "fillText");
  assert.ok(texts.length >= 4, "가격 눈금이 " + texts.length + "개뿐");
  for (const t of texts) {
    const m = /(\d+(?:\.\d+)?)px/.exec(t.font || "");
    assert.ok(m, "font 에 px 크기가 없다: " + t.font);
    assert.ok(parseFloat(m[1]) >= 10.5, "축 글자 " + m[1] + "px < 10.5px");
  }
});

test("현재가 태그를 gold 로 그린다", () => {
  const c = recCtx();
  D.drawAxes(c, L(), candles(150), COL);
  assert.ok(c.calls.some(x => (x.op === "fillRect" || x.op === "roundRect") && x.fill === COL.gold), "현재가 태그가 없다");
});

test("예측 시작선을 점선으로 긋는다", () => {
  const c = recCtx();
  D.drawAxes(c, L(), candles(150), COL);
  assert.ok(c.calls.some(x => x.op === "setLineDash" && Array.isArray(x.args[0]) && x.args[0].length), "예측 시작 점선이 없다");
});

test("fiAtX 는 x 를 절대 봉 인덱스로 되돌린다", () => {
  const lay = L();
  assert.equal(D.fiAtX(lay, lay.fiToX(lay.nowFi)), lay.nowFi);
  assert.equal(D.fiAtX(lay, lay.fiToX(lay.fiMin)), lay.fiMin);
  assert.equal(D.fiAtX(lay, -1e6), lay.fiMin, "왼쪽 밖은 fiMin 으로 클램프");
  assert.equal(D.fiAtX(lay, 1e6), lay.nowFi, "오른쪽 밖은 nowFi 로 클램프");
});

test("크로스헤어는 모든 패널을 관통하고 값 라벨을 그린다", () => {
  const c = recCtx(), lay = L();
  D.drawCrosshair(c, lay, lay.nowFi - 5, candles(150), COL);
  assert.ok(c.calls.filter(x => x.op === "stroke").length >= 1, "세로선이 없다");
  assert.ok(c.calls.some(x => x.op === "fillText"), "값 라벨이 없다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/chart-draw.test.mjs`
Expected: FAIL — `Cannot find module '../www/chart-draw.js'`

- [ ] **Step 3: 구현**

`map/mobile/www/chart-draw.js`:

```js
// 캔들 · 예측 콘 · 축 · 크로스헤어. 좌표는 전부 chart-layout 의 Layout 에서 온다.
// 핀치줌·팬·로그축·전체화면은 Phase 1 범위 밖이다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSChartDraw = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var AXIS_FONT = "600 11px Pretendard, ui-monospace, monospace";   // 11px — 하한 10.5px 를 넘긴다

  function drawCandles(c, lay, candle, col) {
    var p = lay.panels.price; if (!p) return;
    var M = p.M, bw = lay.bw;
    c.save();
    for (var fi = lay.fiMin; fi <= lay.nowFi; fi++) {
      var b = candle[fi]; if (!b) continue;
      var up = b.c >= b.o, color = up ? col.bull : col.bear;
      var x = M.fiToX(fi);
      c.strokeStyle = color; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, M.pToY(b.h)); c.lineTo(x, M.pToY(b.l)); c.stroke();
      c.fillStyle = color;
      var yO = M.pToY(b.o), yC = M.pToY(b.c);
      c.fillRect(x - bw / 2, Math.min(yO, yC), bw, Math.max(1, Math.abs(yC - yO)));
    }
    c.restore();
  }

  function drawCone(c, lay, pred, col) {
    if (!pred || !pred.path || !pred.path.length) return;
    var p = lay.panels.price; if (!p) return;
    var M = p.M, n = pred.path.length;
    var xs = [], i;
    for (i = 0; i < n; i++) xs.push(M.fiToX(lay.nowFi + 1 + i));
    c.save();
    if (pred.hi && pred.lo && pred.hi.length && pred.lo.length) {
      c.beginPath();
      for (i = 0; i < n; i++) { var yh = M.pToY(pred.hi[i]); i ? c.lineTo(xs[i], yh) : c.moveTo(xs[i], yh); }
      for (i = n - 1; i >= 0; i--) c.lineTo(xs[i], M.pToY(pred.lo[i]));
      c.closePath(); c.fillStyle = col.cone; c.fill();
    }
    c.beginPath();
    for (i = 0; i < n; i++) { var y = M.pToY(pred.path[i]); i ? c.lineTo(xs[i], y) : c.moveTo(xs[i], y); }
    c.strokeStyle = col.gold; c.lineWidth = 1.25; c.stroke();
    c.restore();
  }

  function drawAxes(c, lay, candle, col, opts) {
    var p = lay.panels.price; if (!p) return;
    var ticks = (opts && opts.ticks) || 4;
    var lo = lay.priceRange[0], hi = lay.priceRange[1];
    var xr = lay.plot.x + lay.plot.w;
    c.save();
    c.font = AXIS_FONT; c.textAlign = "left";

    for (var i = 0; i <= ticks; i++) {                       // 우측 가격축
      var v = lo + (hi - lo) * (i / ticks), y = p.M.pToY(v);
      c.strokeStyle = col.hairline; c.lineWidth = 1;
      c.beginPath(); c.moveTo(lay.plot.x, y); c.lineTo(xr, y); c.stroke();
      c.fillStyle = col.ink5;
      c.fillText((Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()), xr + 6, y + 3.5);
    }

    var last = candle[lay.nowFi];                            // 골드 현재가 태그
    if (last) {
      var ly = p.M.pToY(last.c), tag = (Math.abs(last.c) < 10 ? last.c.toFixed(2) : Math.round(last.c).toLocaleString());
      c.fillStyle = col.gold; c.fillRect(xr + 2, ly - 8, lay.axisW - 4, 16);
      c.fillStyle = "#1a1408"; c.fillText(tag, xr + 6, ly + 3.5);
    }

    if (lay.fut > 0) {                                       // 예측 시작 점선
      var xs = lay.fiToX(lay.nowFi) + (lay.fiToX(lay.nowFi) - lay.fiToX(lay.nowFi - 1)) / 2;
      c.strokeStyle = col.ink4; c.lineWidth = 1; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(xs, lay.panels[lay.order[0]].rect.y);
      var lastP = lay.panels[lay.order[lay.order.length - 1]].rect;
      c.lineTo(xs, lastP.y + lastP.h); c.stroke(); c.setLineDash([]);
    }

    var bottom = lay.panels[lay.order[lay.order.length - 1]].rect;   // 하단 날짜축
    c.fillStyle = col.ink5;
    var lt = candle[lay.nowFi] && candle[lay.nowFi].t;
    if (lt) c.fillText(String(lt).slice(5).replace("-", "."), lay.plot.x, bottom.y + bottom.h + 14);
    c.restore();
  }

  function fiAtX(lay, x) {
    var d = lay.fiToX(lay.fiMin + 1) - lay.fiToX(lay.fiMin);
    var fi = Math.round(lay.fiMin + (x - lay.fiToX(lay.fiMin)) / (d || 1));
    return Math.max(lay.fiMin, Math.min(lay.nowFi, fi));
  }

  function drawCrosshair(c, lay, fi, candle, col) {
    var b = candle[fi]; if (!b) return;
    var x = lay.fiToX(fi);
    var top = lay.panels[lay.order[0]].rect;
    var bot = lay.panels[lay.order[lay.order.length - 1]].rect;
    c.save();
    c.strokeStyle = col.ink4; c.lineWidth = 1; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(x, top.y); c.lineTo(x, bot.y + bot.h); c.stroke(); c.setLineDash([]);
    var p = lay.panels.price;
    if (p) {
      var y = p.M.pToY(b.c);
      c.strokeStyle = col.ink4; c.beginPath(); c.moveTo(lay.plot.x, y); c.lineTo(lay.plot.x + lay.plot.w, y); c.stroke();
      c.font = AXIS_FONT; c.textAlign = "left";
      var t = (b.t ? String(b.t).slice(5) + "  " : "") + (Math.abs(b.c) < 10 ? b.c.toFixed(2) : Math.round(b.c).toLocaleString());
      c.fillStyle = col.gold; c.fillText(t, lay.plot.x + 4, top.y + 12);
    }
    c.restore();
  }

  return { drawCandles: drawCandles, drawCone: drawCone, drawAxes: drawAxes,
           drawCrosshair: drawCrosshair, fiAtX: fiAtX, AXIS_FONT: AXIS_FONT };
});
```

- [ ] **Step 4: 통과 확인**

Run: `cd map/mobile && node --test test/chart-draw.test.mjs`
Expected: PASS (9건)

- [ ] **Step 5: Phase 0 차트 모듈 삭제**

```bash
cd map/mobile && rm www/chart.js test/chart.test.mjs && npm test
```
Expected: PASS. `chart.js` 를 참조하는 곳이 없어야 한다 — `grep -rn "chart\.js" www/ test/` 가 비어야 한다(`chart-layout.js`·`chart-draw.js` 는 다른 이름이다).

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add -A map/mobile/www map/mobile/test
git commit -m "mobile(p1): chart-draw — 캔들·콘·축·크로스헤어, Phase 0 chart.js 폐기

축 글자 11px(하한 10.5px)·골드 현재가 태그·예측 시작 점선.
봉마다 up<->bull 대응을 고정하는 테스트 — Phase 0 리뷰에서 색을 뒤바꿔도
통과하던 구멍이 있었다. chart-draw.test.mjs 9건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: 앱 셸 + 워치리스트 화면

여기부터는 배선이다. 순수 로직은 Task 1-8 에 있고 이 파일들에는 없다 — 그래서 단위 테스트도 없다.

**Files:**
- Create: `map/mobile/www/ui.js`, `map/mobile/www/app.js`, `map/mobile/www/screens/watchlist.js`
- Replace: `map/mobile/www/index.html`, `map/mobile/www/style.css`
- Delete: `map/mobile/www/spike.js`

**Interfaces:**
- Consumes: `MSStore` · `MSScan` · `MSApi` · `MSGraph` · `ForgeCore`
- Produces: `MSUi = { el(tag, cls, text), fmtPrice(v), fmtChg(v), sparkPath(points, w, h), dotClass(dir) }` · `MSApp = { go(route, params), current() }` · `MSWatchlist = { render(root) }`
  - 라우트는 `"watchlist"` 와 `"report"` 둘뿐. `MSApp.go("report", { sym: "AAPL" })`

- [ ] **Step 1: `index.html` 을 쓴다**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>MoneyScoop</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="app"></div>
<script src="vendor/forge-core.js"></script>
<script src="api.js"></script>
<script src="graph.js"></script>
<script src="store.js"></script>
<script src="scan.js"></script>
<script src="chart-layout.js"></script>
<script src="draw-layers.js"></script>
<script src="draw-panels.js"></script>
<script src="chart-draw.js"></script>
<script src="ui.js"></script>
<script src="screens/watchlist.js"></script>
<script src="screens/report.js"></script>
<script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `style.css` 를 쓴다 — 토큰 전체 + 워치리스트**

```css
:root {
  --bg:#0a0d12; --bg-raised:#0b0e15; --sheet:#11151d;
  --hairline:rgba(238,241,247,.06); --hairline-2:rgba(238,241,247,.09);
  --border:rgba(238,241,247,.10); --border-strong:rgba(238,241,247,.16);
  --track:rgba(238,241,247,.07);
  --ink:#eef1f7; --ink-2:#c5ccdb; --ink-3:#9aa3b6; --ink-4:#7c8598; --ink-5:#78819a;
  --gold:#e8b463; --gold-dim:#c0a069; --gold-ink:#1a1408;
  --steel:#8892a6; --platinum:#b9c4dc;
  --bull:#4fb98a; --bear:#d96a6a; --bear-text:#e08a8a; --neutral:#4a5368;
}
* { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
body {
  margin:0; background:var(--bg); color:var(--ink);
  font-family:Pretendard, system-ui, -apple-system, sans-serif;
  font-variant-numeric:tabular-nums; letter-spacing:-0.01em;
  padding-bottom:env(safe-area-inset-bottom);
}
.scr { padding:0 20px 40px; }
.scr-head { display:flex; align-items:baseline; justify-content:space-between; padding:18px 0 12px; }
.scr-title { font-size:25px; font-weight:600; letter-spacing:-.03em; margin:0; }
.overline { font-size:10.5px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-5); }

.wl-row { display:flex; align-items:center; gap:10px; height:64px; border-bottom:1px solid var(--hairline); }
.wl-dot { width:7px; height:7px; border-radius:99px; flex:0 0 7px; background:var(--neutral); }
.wl-dot.bull { background:var(--bull); } .wl-dot.bear { background:var(--bear); }
.wl-id { flex:1 1 auto; min-width:0; }
.wl-sym { font-size:13.5px; font-weight:600; }
.wl-name { font-size:11px; color:var(--ink-4); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wl-spark { flex:0 0 64px; height:20px; }
.wl-px { text-align:right; flex:0 0 auto; }
.wl-price { font-size:13px; font-weight:600; }
.wl-chg { font-size:11px; } .wl-chg.up { color:var(--bull); } .wl-chg.dn { color:var(--bear-text); }
.wl-conf { flex:0 0 auto; min-width:34px; text-align:right; font-size:11px; color:var(--ink-4); }
.wl-asof { font-size:10.5px; color:var(--ink-5); }

.btn { min-height:44px; border:0; border-radius:11px; font:inherit; font-weight:600; padding:0 18px; }
.btn-primary { background:var(--gold); color:var(--gold-ink); }
.btn-ghost { background:transparent; color:var(--ink-2); border:1px solid var(--border-strong); }
.row-tap { display:flex; width:100%; background:none; border:0; color:inherit; font:inherit; text-align:left; padding:0; }
.empty { padding:40px 0; text-align:center; color:var(--ink-4); font-size:12.5px; line-height:1.7; }
```

- [ ] **Step 3: `ui.js` 를 쓴다**

```js
// 화면들이 공유하는 작은 조각. 순수 함수만 둔다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSUi = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function fmtPrice(v) { return (Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()); }
  function fmtChg(v) { return (v > 0 ? "+" : "") + v.toFixed(2) + "%"; }
  function dotClass(dir) { return "wl-dot" + (dir === "bull" ? " bull" : dir === "bear" ? " bear" : ""); }
  // 스파크라인 SVG path — 값 배열을 w×h 박스에 정규화한다
  function sparkPath(pts, w, h) {
    if (!pts || pts.length < 2) return "";
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), sp = (hi - lo) || 1;
    return pts.map(function (v, i) {
      var x = (i / (pts.length - 1)) * w, y = h - ((v - lo) / sp) * h;
      return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
  }
  return { el: el, fmtPrice: fmtPrice, fmtChg: fmtChg, dotClass: dotClass, sparkPath: sparkPath };
});
```

- [ ] **Step 4: `screens/watchlist.js` 를 쓴다**

요구 동작:

- `MSStore.seedIfEmpty()` 후 `MSStore.getWatchlist()` 와 `MSStore.allScans()` 로 **즉시** 렌더한다. 네트워크를 기다리지 않는다
- 각 행: 신호 도트(`rec.dir`, 없으면 회색) · 심볼 + 회사명 · 스파크라인(`rec.spark`, 없으면 빈칸) · 가격 + 등락 · 확신(`rec.confluence`). 행 높이 64px, 헤어라인 구분선
- 행 전체가 `<button class="row-tap">` — 최소 44px 를 넘긴다. 탭하면 `MSApp.go("report", { sym })`
- 상단 우측 `스캔` 버튼. 누르면 `MSScan.createScanner({ loadOne, analyze })` 로 순차 스캔하며 **행 하나씩** 갱신하고, 버튼은 `스캔 중 3/8` 로 바뀐다
  - `loadOne = sym => MSApi.loadTicker(sym, "1day")`
  - `analyze = (sym, data) => { ... }` — `MSGraph.basicGraph(ForgeCore)` 로 그래프를 만들고 `MSGraph.setVolume` 으로 실거래량을 심은 뒤 `ForgeCore.run` 을 돌려 `Rec` 을 만든다. `dir` 은 `score > 8 ? "bull" : score < -8 ? "bear" : "neutral"`, `spark` 은 최근 64개 종가
  - 결과는 즉시 `MSStore.setScan(sym, rec)` 로 저장한다 — 중간에 앱을 닫아도 남는다
  - 실패한 행은 마지막 값을 유지하고 `갱신 실패` 배지를 붙인다
- 하단 `＋ 티커 추가` — `prompt()` 로 심볼을 받아 `MSApi.loadTicker` 로 확인한다. 성공하면 `MSStore.addTicker` 후 재렌더, `err.notfound` 면 `err.suggest` 를 버튼 목록으로 보여주고 고르면 추가한다
- 행을 **길게 눌러(600ms)** 삭제 확인 → `MSStore.removeTicker`. 스와이프는 쓰지 않는다(세로 스크롤과 충돌한다)
- 워치리스트가 비면 안내 문구와 `＋ 티커 추가` 만 보여준다

- [ ] **Step 5: `app.js` 를 쓴다**

```js
// 라우팅 — 화면 둘뿐이라 히스토리 API 대신 상태 하나로 충분하다.
(function () {
  "use strict";
  var state = { route: "watchlist", params: {} };
  var rootEl = null;

  function render() {
    rootEl.innerHTML = "";
    if (state.route === "report" && window.MSReport) MSReport.render(rootEl, state.params);
    else MSWatchlist.render(rootEl);
    window.scrollTo(0, 0);
  }
  function go(route, params) { state.route = route; state.params = params || {}; render(); }

  window.MSApp = { go: go, current: function () { return { route: state.route, params: state.params }; } };

  document.addEventListener("DOMContentLoaded", function () {
    rootEl = document.getElementById("app");
    if (typeof ForgeCore === "undefined") {
      rootEl.innerHTML = "<p class='empty'>vendor/forge-core.js 를 불러오지 못했습니다.<br>npm run sync 후 다시 여세요.</p>";
      return;
    }
    render();
  });
})();
```

- [ ] **Step 6: `screens/report.js` 스텁을 만든다**

`index.html` 이 이 파일을 로드하므로 Task 10 전에도 존재해야 한다(없으면 404 가 콘솔에 남는다). Task 10 이 통째로 교체한다.

```js
// Task 10 이 교체한다.
(function () {
  "use strict";
  window.MSReport = { render: function (root, params) {
    var p = document.createElement("p"); p.className = "empty";
    p.textContent = (params && params.sym ? params.sym + " " : "") + "리포트는 Task 10 에서 구현합니다.";
    var b = document.createElement("button"); b.className = "btn btn-ghost"; b.textContent = "워치리스트로";
    b.addEventListener("click", function () { MSApp.go("watchlist"); });
    root.appendChild(p); root.appendChild(b);
  } };
})();
```

- [ ] **Step 7: `spike.js` 삭제 후 전체 스위트**

```bash
cd map/mobile && rm -f www/spike.js && npm test
```
Expected: PASS

- [ ] **Step 8: 브라우저 확인 (사람 수행)**

```bash
cd map/mobile && npm run sync && python3 -m http.server 8123 --bind 0.0.0.0 --directory www
```

`http://<host>:8123` 을 연다. 확인 항목: 기본 3종목이 보인다 · `스캔` 이 행을 하나씩 채운다 · 행을 탭하면 (아직 빈) 리포트로 간다 · `＋ 티커 추가` 에서 `APPL` 을 넣으면 제안 3건이 뜬다 · 길게 눌러 삭제된다.

- [ ] **Step 9: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add -A map/mobile/www
git commit -m "mobile(p1): 앱 셸 + 워치리스트 화면

캐시로 즉시 렌더하고 스캔은 명시적 액션 — 시안 경제의 유료 액션(-2 Scoops)과
같은 모양이라 v3 에서 가격만 붙이면 된다. 스캔 결과는 행마다 즉시 저장한다.
삭제는 길게 눌러 확인(스와이프는 세로 스크롤과 충돌).
배선 파일이라 단위 테스트 없음 — 순수 로직은 store/scan/api/graph 에 있다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Basic 리포트 화면

**Files:**
- Create: `map/mobile/www/screens/report.js`
- Modify: `map/mobile/www/style.css` (리포트 스타일 추가)

**Interfaces:**
- Consumes: `MSStore` · `MSApi` · `MSGraph` · `MSChartLayout` · `MSLayers` · `MSPanels` · `MSChartDraw` · `MSUi` · `ForgeCore`
- Produces: `MSReport = { render(root, params) }` (`params = { sym }`)

**화면 구성(시안 `#6a`/`#2a`)**

1. 헤더 — 뒤로 · `심볼` + 워치리스트 내 위치(`2 / 8`). Scoops pill 자리는 비운다(v2)
2. 티어 칩 `BASIC`(steel) + 설명줄 `5 indicators` + 증거 미터 1/3
3. 판정 — 방향 단어(27~31px/700) + 확신 + 정직한 범위 + **빠진 것의 크기**
4. **4단 적층 차트**(아래 §합성)
5. **Counted** — MA·MACD·RSI·볼린저·거래량 5개 판독값
6. **Not counted** — `MSGraph.MISSING` 13종 + full32 에만 있는 나머지 = 27종 회색 칩(`--ink-5`)
7. 주기 행 — 일간은 값, 주간·월간은 `locked`
8. 비활성 CTA `곧 제공`

**차트 합성 순서** (이 순서가 곧 z-order 다)

```js
var lay = MSChartLayout.chartLayout({ candle, prediction, width, height: 520, pad: 10, tailBars: 120 });
MSChartDraw.drawAxes(c, lay, candle, COL);          // 격자·눈금 먼저 — 데이터 아래로
MSChartDraw.drawCone(c, lay, prediction, COL);
MSChartDraw.drawCandles(c, lay, candle, COL);
MSLayers.resetLabels(cssW, cssH);                    // 라벨 레지스트리 초기화 — 매 프레임 필수
MSLayers.bollinger(c, bb, lay.panels.price.M);
MSLayers.ma(c, ma, lay.panels.price.M);
MSLayers.rsiBadge(c, rsi, lay.panels.price.M);
MSLayers.macdBadge(c, macd, lay.panels.price.M);
MSLayers.volumeBadge(c, va, lay.panels.price.M);
["volume", "rsi", "macd"].forEach(function (k) {     // 서브패널은 원점을 옮겨 그린다
  var r = lay.panels[k].rect;
  c.save(); c.translate(r.x, r.y);
  MSPanels[k](c, r.w, r.h, dataOf[k], Infinity);
  c.restore();
});
```

**크로스헤어**

- `pointerdown` 에 350ms 타이머를 건다. 그 전에 `pointermove` 가 8px 넘게 움직이면 타이머를 취소한다 — 스크롤로 넘긴다
- 타이머가 살아서 발동하면 `setPointerCapture` 를 잡고 `preventDefault` 를 켠다. 이후 `pointermove` 는 `MSChartDraw.fiAtX` 로 봉을 찾아 다시 그린다
- `pointerup`/`pointercancel` 에 해제하고 크로스헤어 없이 다시 그린다
- **홀드 전에는 `preventDefault` 를 부르지 않는다.** 이것이 스크롤 충돌을 구조적으로 막는 지점이다

**DPR**

```js
var dpr = window.devicePixelRatio || 1;
cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
cv.style.height = cssH + "px";
var c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);   // 한 번만 — 두 번 적용하면 배로 커진다
```

**데이터 획득**

세션 메모리 캐시(`MSReport` 모듈 스코프 `Map`)에 있으면 즉시, 없으면 `MSApi.loadTicker(sym, "1day")`. 로딩 중에는 최종 행 높이와 같은 스켈레톤을 보여준다 — 전체 화면 스피너는 쓰지 않는다.

**오류**

- 봉 부족(`MIN_BARS` 미달): 분석 대신 사유를 표시한다. 빈 차트를 그리지 않는다
- 네트워크 실패: 사유 + `다시 시도` 버튼. 화면을 비우지 않는다

- [ ] **Step 1: `report.js` 를 위 사양대로 쓴다**

- [ ] **Step 2: `style.css` 에 리포트 스타일을 추가한다**

필요한 클래스: `.rp-head` `.rp-tier`(steel 칩) `.rp-evi`(3분할 미터) `.rp-verdict`(27~31px/700/-.025em) `.rp-conf` `.rp-range` `.rp-chart` `.rp-sec` `.rp-count-row` `.rp-chip`(회색 칩, `--ink-5`) `.rp-tf-row` `.rp-locked` `.rp-cta[disabled]`. **좌측 세로 accent bar 를 만들지 말 것.**

- [ ] **Step 3: 전체 스위트**

Run: `cd map/mobile && npm test`
Expected: PASS

- [ ] **Step 4: 브라우저 확인 (사람 수행)**

`http://<host>:8123` 에서 종목을 탭한다. 확인 항목: 4단 차트가 다 그려진다(MA 다중선·볼린저 밴드·거래량 막대·RSI 라인과 70/30·MACD 히스토그램) · 우측 가격축과 골드 현재가 태그 · 예측 콘과 점선 · **차트를 짧게 드래그하면 페이지가 스크롤되고, 길게 눌렀다 끌면 크로스헤어가 나온다** · Not counted 칩 27개가 읽히는 회색이다.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add -A map/mobile/www
git commit -m "mobile(p1): Basic 리포트 화면 — 4단 적층 차트 합성

축->콘->캔들->오버레이->배지->서브패널 순으로 겹친다. 매 프레임 resetLabels.
크로스헤어는 350ms 홀드 진입이라 홀드 전에는 preventDefault 를 부르지 않는다 —
스크롤 충돌이 구조적으로 안 생긴다. DPR 은 setTransform 한 번만.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: 실기기 확인 · 문서 갱신

**Files:**
- Modify: `map/mobile/docs/BACKLOG-mobile.md`
- Create: `map/mobile/docs/phase1-notes.md`

- [ ] **Step 1: 전체 관문**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
```
Expected: 전체 통과. Phase 0 기준 400건에서 Phase 1 신규분만큼 늘어난다.

- [ ] **Step 2: 폴드7 확인 (사람 수행)**

```bash
cd map/mobile && npm run sync
python3 -m http.server 8123 --bind 0.0.0.0 --directory www
```

폰 Chrome 에서 `http://<tailscale-ip>:8123`. **`--bind` 를 tailscale IP 하나로 주면 폰에서 안 붙는다 — 반드시 `0.0.0.0`**(Phase 0 에서 시간을 쓴 함정).

확인 항목:
- 워치리스트 스캔이 3종목을 채운다
- 리포트 4단 차트가 411px 폭에서 다 읽힌다(축 글자 포함)
- 차트 위 짧은 드래그 = 페이지 스크롤 / 길게 눌러 끌기 = 크로스헤어
- 접은 화면과 펼친 화면 양쪽에서 레이아웃이 깨지지 않는다

- [ ] **Step 3: `phase1-notes.md` 에 기록한다**

폰에서 관찰한 것: Basic 분석 실측 시간 · 스캔 총 소요 · 차트 렌더 체감 · 크로스헤어 오작동 여부 · 폴드 펼침 시 레이아웃. 빈칸을 남기지 말 것.

- [ ] **Step 4: `BACKLOG-mobile.md` 갱신**

Phase 1 을 `✅ 완료` 로 옮기고 커밋 범위를 적는다. Phase 1 에서 발견된 후속 항목을 `📋 예정` 에 넣는다.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/docs
git commit -m "mobile(p1): 실기기 확인 기록 + 백로그 갱신

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 완료 기준

1. 폴드7 에서 워치리스트 → 종목 탭 → Basic 리포트 → 4단 차트가 끊김 없이 동작한다
2. `map/tests/run.sh` 전체 통과 (엔진 251 · 도구 81 · 랜딩 28 무회귀 포함)
3. `map/forge-core.js`·`forge-tools.js`·`forge-draw.js` 가 **한 줄도 바뀌지 않았다**
4. `draw-panels.js` 에 `document.` 참조가 0 이다
5. 차트 위 짧은 드래그가 페이지를 스크롤하고, 길게 눌러 끌면 크로스헤어가 나온다
6. `phase1-notes.md` 에 실기기 관찰이 빈칸 없이 적혀 있다

## 하지 않는 것

티어 선택 시트 · 지갑 · 광고 · 계정 · Full/Custom · 핀치줌 · 팬 · 전체화면 차트 · A/L 토글 · 더블탭 리셋 · 온보딩 5단계 · 다국어 · 폴드 2단 레이아웃 · 종목 간 가로 스와이프 · Capacitor 빌드(별도 과제).
