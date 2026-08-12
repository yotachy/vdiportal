# 머니스쿱 모바일 Phase 7 — 워치리스트 시안 재작업 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 워치리스트를 시안 1a 의 구조·치수로 다시 그린다 — 브랜드 헤더 · 검색창 · 그룹 칩 · 확신 배지.

**Architecture:** 판별·필터·배지 규칙을 순수 모듈 `MSWatchlistModel` 로 빼서 테스트를 붙이고, `screens/watchlist.js` 는 DOM 만 남긴다. 렌더를 셸/행/버튼 3단위로 쪼개 스캔 중에도 검색 입력이 살아남게 한다. 색 토큰은 이미 시안과 일치하므로 건드리지 않고, 1a 의 치수와 빠진 구조만 채운다.

**Tech Stack:** 바닐라 JS(ES5) · UMD · `node:test` · 빌드 도구 없음

## Global Constraints

- **`mobile/www/` 아래 JS 는 ES5 문법만** — `var` + `function`. 화살표 함수·`let`/`const`·템플릿 리터럴·옵셔널 체이닝 금지. 테스트 파일(`mobile/test/*.test.mjs`)은 ESM 이라 예외
- 새 `mobile/www/*.js` 는 **UMD 팩토리** — `(function(root,factory){ if (typeof module!=="undefined"&&module.exports) module.exports=factory(); else root.MSXxx=factory(); })(typeof self!=="undefined"?self:this, function(){...})`
- **UI 문자열은 영어**, `mobile/www/strings.js` 단일 출처. **코드에 문구를 직접 쓰지 않는다.** `strings.test.mjs` 가 ①참조된 키의 실존 ②미사용(죽은) 키 ③소스의 한글 UI 문자열을 검사한다
- **CSS 색은 `var(--토큰)`** — `style.css` `:root` 의 토큰만. `:root` 는 핸드오프 README 의 디자인 토큰 표와 이미 일치하므로 **기존 토큰 값을 바꾸지 않는다.** 추가만 한다
- **항목 좌측 세로 컬러 라인 절대 금지** — accent bar · `box-shadow:inset Npx 0 0 color` · `::before` 세로 마커. 강조는 배경색·텍스트색으로만
- **CSS 에 `@media` 금지** — 2단(폴드) 스타일은 `body.ms-dual` 클래스를 읽는다
- **테스트 기대값은 리터럴로.** 구현 상수를 읽어 기대값을 만들면 항등식이 된다 — Phase 3·4·5·6에서 네 번 재발했다
- `map/forge-core.js`·`forge-tools.js`·`forge-app.js`·`forge-draw.js`·`mobile/www/vendor/` 는 건드리지 않는다. **이번 Phase 는 엔진을 수정하지 않는다**
- 관문: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh`. **현재 기준선 561건**(forge-core 259 · forge-tools 81 · landing 28 · moneyscoop-mobile 193). `forge-core`·`forge-tools`·`landing` 은 끝까지 변동 없어야 한다
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

**설계서:** [`../specs/2026-08-12-moneyscoop-mobile-phase7-design.md`](../specs/2026-08-12-moneyscoop-mobile-phase7-design.md)

**작업 디렉토리:** 모든 경로는 `map/` 기준.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `mobile/www/watchlist-model.js` | 시장 판별 · 칩 목록 · 필터 · 배지 (순수) | 신규 |
| `mobile/test/watchlist-model.test.mjs` | 위 모듈 테스트 | 신규 |
| `mobile/www/screens/watchlist.js` | DOM 배선 — 헤더·검색·칩·행, 렌더 3단위, `buildRec` 에 `conf` | 수정 |
| `mobile/www/strings.js` | 브랜드·검색·칩 문구 추가, 죽은 키 삭제 | 수정 |
| `mobile/www/index.html` | 스크립트 태그 1개 | 수정 |
| `mobile/www/style.css` | 헤더·검색·칩·행·배지 + 틴트 토큰 2개 | 수정 |
| `mobile/docs/BACKLOG-mobile.md` | 종료 기록 · 확인 항목 | 수정 |

---

### Task 1: `MSWatchlistModel` — 판별·필터·배지 순수 모듈

**Files:**
- Create: `map/mobile/www/watchlist-model.js`
- Test: `map/mobile/test/watchlist-model.test.mjs`

**Interfaces:**
- Consumes: 없음 (의존성 제로 — 엔진도 DOM 도 안 만진다)
- Produces:
  - `MSWatchlistModel.market(sym)` → `"KR" | "ETF" | "US"`
  - `MSWatchlistModel.chips(list)` → `[{ key, count }]` — `key` 는 `"all"`·`"US"`·`"KR"`·`"ETF"`. `all` 이 항상 첫 번째
  - `MSWatchlistModel.filter(list, opts)` → 걸러진 배열. `opts = { chip, query }`
  - `MSWatchlistModel.badge(rec)` → `{ text, tone } | null`. `tone` 은 `"bull"|"bear"|"neutral"`

> **설계서와 다른 점 하나**: 설계서 §6 은 `chips` 가 `{key,label,count}` 를 돌려준다고 적었으나, **`label` 은 UI 문자열이라 `strings.js` 가 단일 출처여야 한다**(전역 제약). 모델은 `key` 만 돌려주고 화면이 `MSStr.t.wlChipAll` 등으로 옮긴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/watchlist-model.test.mjs` 신규 생성:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const M = require("../www/watchlist-model.js");

const LIST = [
  { sym: "NVDA", name: "NVIDIA Corporation" },
  { sym: "AAPL", name: "Apple Inc." },
  { sym: "005930", name: "Samsung Electronics" },
  { sym: "SPY", name: "S&P 500 ETF" }
];

test("market — 6자리 숫자는 한국 종목", () => {
  assert.strictEqual(M.market("005930"), "KR");
  assert.strictEqual(M.market("000660"), "KR");
});

test("market — 알려진 ETF 는 ETF, 대소문자 무관", () => {
  assert.strictEqual(M.market("SPY"), "ETF");
  assert.strictEqual(M.market("spy"), "ETF");
  assert.strictEqual(M.market("QQQ"), "ETF");
});

test("market — 나머지는 US", () => {
  assert.strictEqual(M.market("NVDA"), "US");
  assert.strictEqual(M.market("BRK.B"), "US");
});

test("market — 빈 값·null 에 죽지 않는다", () => {
  for (const bad of ["", null, undefined, "   "]) {
    assert.strictEqual(M.market(bad), "US", "입력 " + bad);
  }
});

test("chips — All 이 첫 번째이고 전체 개수를 갖는다", () => {
  const c = M.chips(LIST);
  assert.strictEqual(c[0].key, "all");
  assert.strictEqual(c[0].count, 4);
});

test("chips — 보유한 시장만 칩이 된다", () => {
  const c = M.chips(LIST);
  assert.deepEqual(c.map(x => x.key), ["all", "US", "KR", "ETF"]);
  const onlyUs = M.chips([{ sym: "NVDA", name: "NVIDIA" }, { sym: "AAPL", name: "Apple" }]);
  assert.deepEqual(onlyUs.map(x => x.key), ["all", "US"], "없는 시장 칩이 생겼다");
});

test("chips — 빈 목록이면 All 하나(개수 0)", () => {
  const c = M.chips([]);
  assert.deepEqual(c.map(x => x.key), ["all"]);
  assert.strictEqual(c[0].count, 0);
});

test("filter — 칩만 적용", () => {
  assert.deepEqual(M.filter(LIST, { chip: "KR" }).map(x => x.sym), ["005930"]);
  assert.deepEqual(M.filter(LIST, { chip: "ETF" }).map(x => x.sym), ["SPY"]);
  assert.strictEqual(M.filter(LIST, { chip: "all" }).length, 4);
});

test("filter — 검색은 심볼과 회사명 둘 다, 대소문자 무시", () => {
  assert.deepEqual(M.filter(LIST, { query: "nvd" }).map(x => x.sym), ["NVDA"]);
  assert.deepEqual(M.filter(LIST, { query: "samsung" }).map(x => x.sym), ["005930"]);
  assert.deepEqual(M.filter(LIST, { query: "APPLE" }).map(x => x.sym), ["AAPL"]);
});

test("filter — 검색어가 공백뿐이면 전체", () => {
  assert.strictEqual(M.filter(LIST, { query: "   " }).length, 4);
  assert.strictEqual(M.filter(LIST, {}).length, 4);
  assert.strictEqual(M.filter(LIST, null).length, 4);
});

test("filter — 칩과 검색을 함께", () => {
  assert.deepEqual(M.filter(LIST, { chip: "US", query: "a" }).map(x => x.sym), ["NVDA", "AAPL"]);
});

test("filter — 목록에 없는 시장의 칩이면 All 로 떨어진다", () => {
  // 마지막 KR 종목을 지운 직후 KR 칩이 활성인 상태. 빈 화면 대신 전체를 보여준다.
  const noKr = [{ sym: "NVDA", name: "NVIDIA" }, { sym: "SPY", name: "S&P 500 ETF" }];
  assert.strictEqual(M.filter(noKr, { chip: "KR" }).length, 2);
});

test("badge — conf 가 없으면 null(옛 스캔 레코드·미스캔)", () => {
  assert.strictEqual(M.badge(null), null);
  assert.strictEqual(M.badge({}), null);
  assert.strictEqual(M.badge({ conf: null, dir: "bull" }), null);
  assert.strictEqual(M.badge({ conf: NaN, dir: "bull" }), null);
});

test("badge — 퍼센트 문자열과 방향 tone", () => {
  assert.deepEqual(M.badge({ conf: 68, dir: "bull" }), { text: "68%", tone: "bull" });
  assert.deepEqual(M.badge({ conf: 46.4, dir: "bear" }), { text: "46%", tone: "bear" });
  assert.deepEqual(M.badge({ conf: 50, dir: "neutral" }), { text: "50%", tone: "neutral" });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/watchlist-model.test.mjs 2>&1 | tail -10
```

기대: `Cannot find module '../www/watchlist-model.js'` 로 14건 전부 실패.

- [ ] **Step 3: 최소 구현**

`map/mobile/www/watchlist-model.js` 신규 생성 (**ES5 문법**):

```js
// 워치리스트의 판별·필터·배지 규칙. DOM 도 엔진도 만지지 않는다.
// screens/watchlist.js 는 스캔 큐·오타 제안·롱프레스 삭제가 얽힌 배선이라
// 규칙을 그 안에 두면 테스트가 안 붙는다 — MSLegend·MSReportModel 과 같은 분리다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSWatchlistModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 시안 1a 의 그룹 칩은 US Tech·Semis 같은 섹터인데 이 앱엔 섹터 데이터가 없다
  // (10a 의 포지션: "가격·거래량·시간만. 회사 리서치 없음"). 심볼만으로 갈리는 축으로 대체한다.
  var ETFS = ["SPY", "QQQ", "VOO", "VTI", "IWM", "DIA", "VXUS", "IJR", "IJH"];
  var ORDER = ["US", "KR", "ETF"];

  function market(sym) {
    var s = String(sym == null ? "" : sym).trim().toUpperCase();
    if (!s) return "US";
    if (/^\d{6}$/.test(s)) return "KR";
    for (var i = 0; i < ETFS.length; i++) { if (ETFS[i] === s) return "ETF"; }
    return "US";
  }

  function chips(list) {
    var items = list || [], counts = {}, i, m;
    for (i = 0; i < items.length; i++) {
      m = market(items[i] && items[i].sym);
      counts[m] = (counts[m] || 0) + 1;
    }
    var out = [{ key: "all", count: items.length }];
    for (i = 0; i < ORDER.length; i++) {
      if (counts[ORDER[i]]) out.push({ key: ORDER[i], count: counts[ORDER[i]] });
    }
    return out;
  }

  function filter(list, opts) {
    var items = list || [], o = opts || {};
    var chip = o.chip || "all";
    var q = String(o.query == null ? "" : o.query).trim().toLowerCase();
    // 활성 칩의 시장이 목록에서 사라졌으면(마지막 KR 종목 삭제 등) All 로 떨어뜨린다 —
    // 빈 화면이 뜨는 것보다 낫고, 셸이 다시 그려지며 그 칩도 사라진다.
    if (chip !== "all") {
      var has = false, j;
      for (j = 0; j < items.length; j++) { if (market(items[j].sym) === chip) { has = true; break; } }
      if (!has) chip = "all";
    }
    return items.filter(function (it) {
      if (chip !== "all" && market(it.sym) !== chip) return false;
      if (!q) return true;
      var sym = String(it.sym || "").toLowerCase(), name = String(it.name || "").toLowerCase();
      return sym.indexOf(q) >= 0 || name.indexOf(q) >= 0;
    });
  }

  // 확신이 없으면(옛 스캔 레코드·미스캔) 배지를 안 그린다 — 회색 자리표시자를 두지 않는다.
  function badge(rec) {
    if (!rec || typeof rec.conf !== "number" || !isFinite(rec.conf)) return null;
    var tone = rec.dir === "bull" ? "bull" : rec.dir === "bear" ? "bear" : "neutral";
    return { text: Math.round(rec.conf) + "%", tone: tone };
  }

  return { market: market, chips: chips, filter: filter, badge: badge, ETFS: ETFS };
});
```

- [ ] **Step 4: 통과 확인**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/watchlist-model.test.mjs 2>&1 | tail -6
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
```

기대: 신규 14건 통과, `전체 통과 — 575건`(561 + 14). `forge-core` 259 · `forge-tools` 81 · `landing` 28 무변동.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/watchlist-model.js mobile/test/watchlist-model.test.mjs
git commit -m "mobile(p7): 워치리스트 판별·필터·배지 순수 모듈 MSWatchlistModel

시안 1a 의 섹터 칩(US Tech·Semis)은 앱에 섹터 데이터가 없어 심볼로 갈리는
축(US·KR·ETF)으로 대체한다 — 10a 의 '가격·거래량·시간만' 포지션을 지킨다.

활성 칩의 시장이 목록에서 사라지면 All 로 떨어뜨린다. 확신이 없으면
배지를 안 그린다(옛 스캔 레코드).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 화면 재구성 — 브랜드 헤더 · 검색 · 칩 · 배지 · 렌더 3단위

**Files:**
- Modify: `map/mobile/www/screens/watchlist.js` (대부분)
- Modify: `map/mobile/www/strings.js`
- Modify: `map/mobile/www/index.html`

**Interfaces:**
- Consumes: `MSWatchlistModel.market/chips/filter/badge` (Task 1) · `MSReportModel.confidence(ForgeCore, prediction, regime)`(Phase 6) · `MSStore` · `MSScan` · `MSUi` · `MSApp`
- Produces: DOM 계약 — Task 3 의 CSS 가 이 클래스들에 건다:
  - 헤더: `.wl-head > .wl-brand-mark(svg) + .wl-brand + .wl-scan`
  - 검색: `.wl-search > svg + input.wl-search-input`
  - 칩: `.wl-chips > button.wl-chip(.on)`
  - 행 컨테이너: `.wl-rows`
  - 행: `button.row-tap.wl-row[data-sym]` > `.wl-dot` + `.wl-id(.wl-sym/.wl-name)` + `.wl-spark` + `.wl-px(.wl-price/.wl-chg)` + `.wl-badge(.bull/.bear/.neutral)`
  - 빈 결과: `.empty`

**테스트 없음.** 배선 파일이고 이 프로젝트는 여기에 단위 테스트를 두지 않는다(`screens/watchlist.js` 머리 주석이 그 관례를 명시). 검증은 `strings.test.mjs` 의 가드 셋과 통합 관문이다.

- [ ] **Step 1: 문자열을 정리한다**

`mobile/www/strings.js` 의 `t` 객체에서 **삭제**: `wlTitle`. (새 헤더는 `Watchlist` 타이틀 대신 브랜드 워드마크를 쓴다. 안 지우면 죽은 키 가드가 관문을 빨갛게 만든다.)

**추가**:

```js
    wlBrand: "MoneyScoop",                       // 시안 1a 워드마크 — 15px/700
    wlSearch: "Search ticker or company",        // 시안 1a 검색 플레이스홀더
    wlChipAll: "All", wlChipUS: "US", wlChipKR: "KR", wlChipETF: "ETF",
    wlNoMatch: "No tickers match.",              // 검색·칩 결과가 비었을 때
```

- [ ] **Step 2: 스크립트 태그를 추가한다**

`mobile/www/index.html` 의 `<script src="report-model.js"></script>` **바로 위**에 넣는다(`screens/watchlist.js` 보다 앞이기만 하면 된다):

```html
<script src="watchlist-model.js"></script>
```

- [ ] **Step 3: 실패를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/strings.test.mjs 2>&1 | tail -8
```

기대: 미사용 키 가드가 `참조되지 않는 MSStr.t 키 7건: wlBrand, wlSearch, wlChipAll, wlChipUS, wlChipKR, wlChipETF, wlNoMatch` 류로 FAIL. **의도된 실패다** — 다음 단계에서 화면이 그 키들을 쓰면 해소된다.

- [ ] **Step 4: `buildRec` 에 확신을 넣고 방향 기준을 통일한다**

`screens/watchlist.js` 의 `buildRec` 과 `analyze` 를 아래로 교체한다:

```js
  // OHLC → Rec.
  function buildRec(data, verdict, prediction) {
    var price = data.price, n = price.length;
    var last = price[n - 1], prev = price[n - 2];
    var chg = (prev != null && isFinite(prev) && prev !== 0) ? +(((last - prev) / prev) * 100).toFixed(2) : 0;
    // 방향은 엔진의 regime 하나로 통일한다. 예전엔 score>8/<-8 자체 문턱이었는데,
    // 확신 배지가 regime 기준이라 두 기준이 섞이면 한 행에서 초록 점 옆에 하락 확신이 붙는다.
    var dir = verdict.regime === "bull" ? "bull" : verdict.regime === "bear" ? "bear" : "neutral";
    var conf = MSReportModel.confidence(ForgeCore, prediction, verdict.regime);
    return {
      price: last, chg: chg, spark: price.slice(-64), dir: dir,
      score: verdict.score, confluence: verdict.confluence,
      conf: (typeof conf === "number" && isFinite(conf)) ? conf : null,
      asOf: data.asOf, scannedAt: new Date().toISOString()
    };
  }

  // 방향 드리프트는 그래프 volume 노드를 읽고, combine 계열(mfi 등)은 data.volume 을 읽는다 —
  // 실거래량을 판정에 반영하려면 둘 다 심어야 한다(graph.js setVolume 주석 참고).
  // 부분 배열(거래정지 봉 등)은 통째로 생략보다 나쁘므로 전 봉이 유한할 때만 싣는다.
  function analyze(sym, data) {
    var graph = MSGraph.basicGraph(ForgeCore);
    var vol = data.candle.map(function (c) { return c.v; });
    var okVol = vol.length >= 2 && vol.every(function (v) { return typeof v === "number" && isFinite(v); });
    var d = { price: data.price, candle: data.candle };
    if (okVol) d.volume = vol;
    MSGraph.setVolume(graph, okVol ? vol : null);
    var out = ForgeCore.run(graph, d, { timeframe: "1day" });
    return buildRec(data, out.verdict, out.prediction);
  }
```

- [ ] **Step 5: 렌더를 셸/행/버튼 3단위로 쪼갠다**

`render(root)` 안의 `draw()` 를 아래 셋으로 교체한다. **`row()`·`attachLongPress`·`addBtn`·`startAddTicker`·`suggestPanel`·`startScan` 은 그대로 두고**, `draw()` 를 부르던 자리만 아래 규칙으로 바꾼다.

먼저 `render(root)` 의 상태 변수 줄에 둘을 더한다:

```js
    var scanning = false, scanDone = 0, scanTotal = 0;
    var failedSyms = {};      // 이번 화면 세션 한정 — 마지막 값 유지 + "갱신 실패" 배지만 붙인다
    var pendingSuggest = null; // { query, list:[{s,n}] } — 추가 실패 시 오타 제안
    var query = "", chip = "all";   // 검색어·활성 칩. 셸이 다시 그려져도 유지된다
    var rowsEl = null, scanBtnEl = null;   // drawRows/updateScanBtn 이 잡고 있는 노드
```

그리고 `draw()` 를 통째로 아래로 교체한다:

```js
    function brandSvg() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">' +
        '<path d="M3 17l5-6 4 4 5-8 4 5"/><circle cx="8" cy="11" r="1.6"/><circle cx="17" cy="7" r="1.6"/></svg>';
    }
    function searchSvg() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">' +
        '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
    }
    function chipLabel(key) {
      return key === "all" ? MSStr.t.wlChipAll
        : key === "US" ? MSStr.t.wlChipUS
        : key === "KR" ? MSStr.t.wlChipKR
        : MSStr.t.wlChipETF;
    }

    function updateScanBtn() {
      if (!scanBtnEl) return;
      scanBtnEl.textContent = scanning ? (MSStr.t.wlScanning + scanDone + "/" + scanTotal) : MSStr.t.wlScan;
      scanBtnEl.disabled = scanning;
    }

    // 행만 다시 그린다 — 스캔 틱·검색 입력·칩 전환이 여기로 온다.
    // 셸을 건드리지 않으므로 검색창의 포커스와 입력값이 살아남는다.
    function drawRows() {
      if (!rowsEl) return;
      rowsEl.innerHTML = "";
      var list = MSWatchlistModel.filter(MSStore.getWatchlist(), { chip: chip, query: query });
      if (!list.length) { rowsEl.appendChild(MSUi.el("p", "empty", MSStr.t.wlNoMatch)); return; }
      var scans = MSStore.allScans();
      list.forEach(function (item) { rowsEl.appendChild(row(item, scans[item.sym])); });
    }

    // 셸 — 목록 자체가 바뀔 때만(추가·삭제·오타 제안·최초).
    function drawShell() {
      root.innerHTML = "";
      rowsEl = null; scanBtnEl = null;
      var scr = MSUi.el("div", "scr");
      var list = MSStore.getWatchlist();

      var head = MSUi.el("div", "wl-head");
      var mark = MSUi.el("span", "wl-brand-mark");
      mark.innerHTML = brandSvg();
      head.appendChild(mark);
      head.appendChild(MSUi.el("span", "wl-brand", MSStr.t.wlBrand));
      if (list.length) {
        scanBtnEl = MSUi.el("button", "wl-scan");
        scanBtnEl.addEventListener("click", startScan);
        head.appendChild(scanBtnEl);
        updateScanBtn();
      }
      scr.appendChild(head);

      if (!list.length) {
        scr.appendChild(MSUi.el("p", "empty", MSStr.t.wlEmpty));
        scr.appendChild(addBtn());
        root.appendChild(scr);
        return;
      }

      var sb = MSUi.el("div", "wl-search");
      var icon = MSUi.el("span", "wl-search-ico");
      icon.innerHTML = searchSvg();
      sb.appendChild(icon);
      var input = document.createElement("input");
      input.className = "wl-search-input";
      input.type = "search";
      input.value = query;
      input.setAttribute("placeholder", MSStr.t.wlSearch);
      input.addEventListener("input", function () { query = input.value; drawRows(); });
      sb.appendChild(input);
      scr.appendChild(sb);

      var chipsEl = MSUi.el("div", "wl-chips");
      MSWatchlistModel.chips(list).forEach(function (c) {
        var b = MSUi.el("button", "wl-chip" + (c.key === chip ? " on" : ""),
                        c.key === "all" ? (chipLabel(c.key) + " " + c.count) : chipLabel(c.key));
        b.addEventListener("click", function () {
          chip = c.key;
          var all = chipsEl.querySelectorAll(".wl-chip");
          for (var i = 0; i < all.length; i++) all[i].classList.remove("on");
          b.classList.add("on");
          drawRows();
        });
        chipsEl.appendChild(b);
      });
      scr.appendChild(chipsEl);

      rowsEl = MSUi.el("div", "wl-rows");
      scr.appendChild(rowsEl);

      scr.appendChild(addBtn());
      if (pendingSuggest) scr.appendChild(suggestPanel());

      root.appendChild(scr);
      drawRows();
    }
```

- [ ] **Step 6: `draw()` 호출부를 세 단위로 나눈다**

`draw()` 라는 이름은 이제 없다. 부르던 자리를 전부 바꾼다 — `grep -n "draw()" screens/watchlist.js` 로 찾아라.

| 위치 | 바꿀 것 | 이유 |
|---|---|---|
| `startAddTicker` 의 성공·실패 콜백 3곳 | `drawShell()` | 목록·제안 패널이 바뀐다 |
| `suggestPanel` 의 선택·취소 콜백 2곳 | `drawShell()` | 같음 |
| `attachLongPress` 의 삭제 후 | `drawShell()` | 목록이 줄어 칩도 바뀐다 |
| `startScan` 시작 직후 | `updateScanBtn()` | 버튼 라벨만 |
| `startScan` 의 종목별 콜백 | `updateScanBtn(); drawRows();` | **셸을 건드리면 검색 입력이 날아간다** |
| `startScan` 의 완료 `.then` | `updateScanBtn(); drawRows();` | 같음 |
| `render()` 맨 끝 | `drawShell()` | 최초 렌더 |

- [ ] **Step 7: 행에 배지를 넣는다**

`row(item, rec)` 안에서 `wl-conf` 를 만드는 줄을 찾아 아래로 교체한다:

```js
      var bg = MSWatchlistModel.badge(rec);
      var badgeEl = MSUi.el("div", "wl-badge" + (bg ? " " + bg.tone : ""), bg ? bg.text : "");
      btn.appendChild(badgeEl);
```

나머지(`wl-dot`·`wl-id`·`wl-spark`·`wl-px`·`data-sym`·`is-sel`·롱프레스)는 **그대로 둔다.**

- [ ] **Step 8: 관문**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/strings.test.mjs 2>&1 | tail -6
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
cd mobile && node --check www/screens/watchlist.js && node -e "require('./www/watchlist-model.js'); console.log('ok')"
```

기대: `전체 통과 — 575건`(신규 테스트 없음). 죽은 키·미존재 키가 잡히면 Step 1 로 돌아가 정리해라.

- [ ] **Step 9: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/screens/watchlist.js mobile/www/strings.js mobile/www/index.html
git commit -m "mobile(p7): 워치리스트 화면 재구성 — 브랜드 헤더·검색·칩·확신 배지

시안 1a 구조로. overline+25px 타이틀을 로고+워드마크로 바꾸고 검색창과
그룹 칩을 넣는다. 확신은 회색 텍스트에서 방향색 배지로.

렌더를 셸/행/버튼 3단위로 쪼갠다 — 지금 draw() 는 스캔 틱마다 화면 전체를
다시 그려서(6종목이면 8회) 검색창을 넣으면 타이핑이 날아간다.

신호등 방향을 score>8 자체 문턱에서 엔진 regime 으로 통일 — 확신 배지가
regime 기준이라 섞이면 초록 점 옆에 하락 확신이 붙는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 스타일 — 1a 치수를 현 토큰으로

**Files:**
- Modify: `map/mobile/www/style.css`

**Interfaces:**
- Consumes: Task 2 의 DOM 계약(`.wl-head`·`.wl-brand-mark`·`.wl-brand`·`.wl-scan`·`.wl-search`·`.wl-search-ico`·`.wl-search-input`·`.wl-chips`·`.wl-chip`·`.on`·`.wl-rows`·`.wl-badge`·`.bull`/`.bear`/`.neutral`)
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: 배지 틴트 토큰 둘을 추가한다**

`style.css` 의 `:root` 에서 `--gold-soft` 가 있는 줄 **다음 줄**에 추가한다. **기존 토큰 값은 하나도 바꾸지 마라** — README 디자인 토큰 표와 일치하는 상태다:

```css
  --bull-soft:rgba(79,185,138,.14); --bear-soft:rgba(217,106,106,.14); --steel-soft:rgba(136,146,166,.16);
```

- [ ] **Step 2: 기존 워치리스트 규칙을 시안 치수로 고친다**

`style.css` 의 `.wl-row` ~ `.wl-asof` 블록을 아래로 교체한다. `.wl-add` 는 그대로 둔다:

```css
/* ===== 워치리스트 — 시안 1a 의 치수를 현 토큰으로(핸드오프 README §2 "redraw with the tokens") ===== */
.wl-head { display:flex; align-items:center; gap:10px; padding:12px 0 10px; border-bottom:1px solid var(--border); }
.wl-brand-mark { display:flex; color:var(--gold); flex:0 0 22px; }
.wl-brand { flex:1 1 auto; font-size:15px; font-weight:700; letter-spacing:-.01em; }
/* Scan 은 아웃라인 pill — 시안 1a 는 골드 버튼이 아니다.
   ::before 는 6px 원형 점이지 '항목 좌측 세로 컬러 라인'이 아니다 — 금지 규칙과 무관. */
.wl-scan { display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border:1px solid var(--border-strong);
           border-radius:99px; background:transparent; color:var(--steel); font:inherit; font-size:11px; }
.wl-scan::before { content:""; width:6px; height:6px; border-radius:99px; background:var(--bull); }
.wl-scan[disabled] { opacity:.6; }

.wl-search { display:flex; align-items:center; gap:8px; height:38px; padding:0 12px; margin-top:10px;
             background:var(--sheet); border:1px solid var(--border); border-radius:9px; }
.wl-search-ico { display:flex; color:var(--ink-5); flex:0 0 15px; }
.wl-search-input { flex:1 1 auto; min-width:0; background:none; border:0; color:var(--ink); font:inherit; font-size:12.5px; outline:none; }
.wl-search-input::placeholder { color:var(--ink-5); }
.wl-search-input::-webkit-search-cancel-button { -webkit-appearance:none; }

.wl-chips { display:flex; flex-wrap:wrap; gap:6px; padding:10px 0 2px; }
.wl-chip { padding:6px 11px; border-radius:99px; background:var(--sheet); border:1px solid var(--border);
           color:var(--steel); font:inherit; font-size:11.5px; }
/* 활성 칩은 시안 1a 그대로 골드다. README 삼색 규칙("Basic 화면에 골드 0회")과 충돌하지만
   같은 README 가 Basic 리포트에 gold current-price tag 를 지시하므로 규칙이 문자 그대로 지켜지지 않는다.
   목업을 따른다(설계서 §2.3). */
.wl-chip.on { background:var(--gold); border-color:var(--gold); color:var(--gold-ink); font-weight:700; }

.wl-row { display:flex; align-items:center; gap:11px; height:64px; border-bottom:1px solid var(--hairline); }
.wl-dot { width:8px; height:8px; border-radius:99px; flex:0 0 8px; background:var(--neutral);
          box-shadow:0 0 0 3px var(--track); }
.wl-dot.bull { background:var(--bull); box-shadow:0 0 0 3px var(--bull-soft); }
.wl-dot.bear { background:var(--bear); box-shadow:0 0 0 3px var(--bear-soft); }
.wl-id { flex:0 0 74px; min-width:0; }
.wl-sym { font-size:14px; font-weight:700; letter-spacing:-.01em; }
.wl-name { font-size:10.5px; color:var(--ink-5); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wl-spark { flex:0 0 64px; height:20px; }
.wl-px { flex:1 1 auto; text-align:right; }
.wl-price { font-size:14px; font-weight:600; font-family:ui-monospace,Menlo,monospace; }
.wl-chg { font-size:11px; font-family:ui-monospace,Menlo,monospace; margin-top:2px; }
.wl-chg.up { color:var(--bull); } .wl-chg.dn { color:var(--bear-text); }
/* 확신 배지 — 엔진 출력이라 색을 갖는 몇 안 되는 요소다 */
.wl-badge { flex:0 0 52px; text-align:right; }
.wl-badge:not(:empty) { padding:3px 6px; border-radius:4px; font-size:10px; font-weight:700; text-align:center; }
.wl-badge.bull { background:var(--bull-soft); color:var(--bull); }
.wl-badge.bear { background:var(--bear-soft); color:var(--bear-text); }
.wl-badge.neutral { background:var(--track); color:var(--ink-4); }
.wl-asof { font-size:10.5px; color:var(--ink-5); }
```

- [ ] **Step 3: 2단(폴드) 규칙을 새 구조에 맞춘다**

파일 끝의 `body.ms-dual` 블록에서 `.wl-spark, .wl-conf` 를 숨기던 줄을 찾아 아래로 교체한다. **`.wl-conf` 는 이제 존재하지 않는다**:

```css
/* A′ 의 핵심: 스파크라인 64px 를 덜어 차트에 돌린다. 확신 배지(52px)는 남긴다 —
   엔진 출력이고 목록에서 색을 갖는 유일한 요소라 이것까지 빼면 목록이 회색 덩어리가 된다. */
body.ms-dual .pane-list .wl-spark { display:none; }
```

- [ ] **Step 4: 골드가 2단에서 둘이 되지 않게 한다**

Phase 5 가 넣은 선택 하이라이트가 골드인데 활성 칩도 골드가 되어 한 화면에 골드가 둘이 된다. 선택 하이라이트를 steel 로 내린다 — 선택은 **사용자 상태**이지 엔진 출력이 아니다. `body.ms-dual .wl-row.is-sel` 규칙을 찾아 바꾼다:

```css
body.ms-dual .wl-row.is-sel { background:var(--steel-soft); }
```

- [ ] **Step 5: 관문**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
grep -n "@media\|wl-conf" mobile/www/style.css
```

기대: `전체 통과 — 575건`(스타일만 고쳤으니 변동 없음). `@media` 와 `wl-conf` 는 **출력이 없어야** 한다.

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/style.css
git commit -m "mobile(p7): 워치리스트 스타일 — 1a 치수를 현 토큰으로

핸드오프 README 가 1a 를 pre-refinement 패스로 명시하고 '토큰으로 다시
그리라' 했다. 치수는 1a 그대로(74px 심볼 칸·8px 글로우 신호등·monospace
숫자·52px 배지), 색은 현 토큰으로. 행 배경(#101623)은 뺀다 — README 가
'hairline dividers instead of card borders' 로 지시한 부분.

2단 선택 하이라이트를 골드에서 steel 로 — 활성 칩이 골드가 되어 한 화면에
골드가 둘이 된다. 선택은 사용자 상태이지 엔진 출력이 아니다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 백로그 + 확인 항목

**Files:**
- Modify: `map/mobile/docs/BACKLOG-mobile.md`

**Interfaces:**
- Consumes: Task 1~3 결과
- Produces: 없음 (문서)

- [ ] **Step 1: 완료 기록을 추가한다**

`## 🔥 다음` 섹션 **바로 위**(Phase 6 항목 다음)에 넣는다:

```markdown
- **Phase 7 — 워치리스트 시안 재작업**(2026-08-12): 브랜드 헤더 · 검색창 · 그룹 칩 · 확신 배지.
  - 핸드오프 README 가 `1a` 를 **pre-refinement 패스**로 명시하고 *"redraw with the tokens above"* 라고
    지시해 뒀다 — 목업의 인라인 스타일(옛 팔레트 `#0b0f14`·`#46c28e`·`#5d667f`)을 그대로 옮기면 안 되는
    화면이었다. **치수는 1a, 색은 README 토큰**으로 다시 그렸다
  - **토큰은 이미 맞았다** — `style.css` 의 `:root` 가 README 디자인 토큰 표와 한 글자도 다르지 않다(Phase 3).
    그래서 이번 작업은 색이 아니라 빠진 구조와 치수를 채우는 일이었다. 추가한 토큰은 배지 틴트 3개뿐
  - 헤더가 완전히 바뀌었다 — `overline "MONEYSCOOP"` + 25px 타이틀 → 로고 마크 + 워드마크 15px + 아웃라인
    Scan pill(골드 버튼 아님). 시안엔 overline 도 큰 타이틀도 없다
  - **섹터 칩(`US Tech`·`Semis`)은 못 만든다** — 앱에 섹터 데이터가 없고, 10a 의 포지션이 *"가격·거래량·시간만.
    회사 리서치 없음"* 이다. 칩의 자리·모양은 시안 그대로 두고 심볼로 갈리는 축(`All · US · KR · ETF`)으로 대체
  - **렌더를 셸/행/버튼 3단위로 쪼갰다** — 기존 `draw()` 는 스캔 틱마다 화면 전체를 다시 그려서(6종목이면 8회)
    검색창을 넣는 순간 타이핑이 날아간다. Phase 5 가 셸에서 푼 것과 같은 분리
  - **신호등 방향을 `regime` 으로 통일** — 예전엔 워치리스트 자체 문턱(`score>8`)이었는데 확신 배지가 `regime`
    기준이라, 섞이면 한 행에서 초록 점 옆에 하락 확신이 붙는다
  - 테스트 561 → 575(`map/tests/run.sh`). **엔진 무수정** — `forge-core` 259 · `forge-tools` 81 · `landing` 28 변동 없음
  - 실기기 육안 확인은 **미실시** — 아래 참조
```

- [ ] **Step 2: 확인 항목 섹션을 만든다**

`## 🔥 다음` 섹션 **바로 아래**에 넣는다(Phase 6 확인 섹션이 있으면 그 위에):

```markdown
## 미검증 — 사용자 확인 필요 (Phase 7)

`cd map/mobile/www && python3 -m http.server 8000 --bind 0.0.0.0` 후 폰 Chrome:

1. 헤더가 로고 + `MoneyScoop` + 아웃라인 `Scan` pill 로 바뀌고 **골드 버튼이 사라졌다.**
2. 검색창에 입력하면 목록이 좁혀진다 — **심볼과 회사명 둘 다** 매치.
3. **스캔 중에 검색어를 타이핑해도 입력이 날아가지 않는다**(렌더 3단위 분리의 이유).
4. 그룹 칩이 보유 종목에 맞게만 뜬다 — KR 종목이 없으면 KR 칩이 없다. `All` 에만 개수가 붙는다.
5. 확신 배지가 방향색으로 뜨고, **스캔 안 한 종목은 빈칸**이다(회색 자리표시자 없음).
6. **검색창 38px 이 실제로 누르기 불편한가** — 시안 값이지만 이 프로젝트의 터치 대상 최소 44px 보다 작다.
7. 폴드 2단 목록 칸(255px)에서 칩·배지가 깨지지 않는다. 선택 하이라이트(steel)와 활성 칩(골드)이 구분된다.
8. 신호등 색이 리포트 화면의 판정 방향과 같다(`regime` 통일).
```

- [ ] **Step 3: 이월 항목을 `📋 예정` 맨 위에 추가한다**

```markdown
- **우상단 스쿱 필** — 11a 확정 사양이 워치리스트에 *"우상단 스쿱 필 상시"* 를 지시하지만 재화 체계가 통째로
  미구현이라 넣지 않았다. 지금 넣으면 빈 껍데기이거나 거짓 잔량이고, 후자는 8a 가 세운 제품의 태도와 어긋난다.
  재화 페이즈와 함께 온다.
- **사용자 정의 그룹** — 시안의 `US Tech`·`Semis` 를 만들려면 사용자가 직접 그룹을 만드는 화면이 필요하다.
  자동 분류(`US·KR·ETF`)로 충분한지 실사용 후 판단.
- **ETF 판별이 하드코딩 목록** — `SPY`·`QQQ`·`VOO`·`VTI`·`IWM`·`DIA`·`VXUS`·`IJR`·`IJH` 9종. 목록 밖 ETF 는
  `US` 로 분류된다. 티커 메타데이터가 생기면 교체.
- **`＋ Add ticker` 가 아직 `prompt()`** — 시안 3b 는 검색 중심의 추가 화면이다. 온보딩 페이즈와 함께.
```

- [ ] **Step 4: 관문 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
git add mobile/docs/BACKLOG-mobile.md
git commit -m "mobile(p7): Phase 7 종료 문서 + 확인 항목

시안 1a 가 pre-refinement 패스였다는 것이 이번의 핵심 발견 — 목업 스타일을
그대로 옮기면 안 되는 화면이었다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

기대: `전체 통과 — 575건`.

---

## 완료 조건

- `./tests/run.sh` 통과, **575건**(forge-core 259 · forge-tools 81 · landing 28 · moneyscoop-mobile 207)
- `forge-core` · `forge-tools` · `landing` 무변동 — 이번 Phase 는 엔진을 건드리지 않는다
- `grep -n "@media\|wl-conf" mobile/www/style.css` 출력 없음
- `grep -n "draw()" mobile/www/screens/watchlist.js` 출력 없음 — 렌더 3단위로 대체됐다
- 커밋 4개
- **실기기 확인 8항목은 미검증 상태로 백로그에 남는다** — 사람의 몫이다
