# 머니스쿱 모바일 Phase 5 — 폴드 2단 레이아웃 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폴드7 펼침(749×654)에서 왼쪽 워치리스트 · 오른쪽 리포트의 2단 리스트-디테일로 그린다. 커버(411×814) 동작은 그대로 둔다.

**Architecture:** 창 크기 판정·기하 계산을 DOM 무관 순수 모듈 `MSLayout`에 모으고, `app.js`가 라우트 대신 `selectedSym` 하나를 들고 두 칸을 조립한다. CSS는 자기 미디어쿼리를 갖지 않고 `app.js`가 `<body>`에 붙이는 `ms-dual` 클래스만 읽는다 — 경계값이 두 곳에 적히면 조용히 갈라진다.

**Tech Stack:** 바닐라 JS(ES5 문법·UMD 팩토리) · `node:test` · 빌드 도구 없음

## Global Constraints

- **ES5 문법 유지** — `www/` 아래 파일은 전부 `var` + `function`. 화살표 함수·`let`/`const`·템플릿 리터럴·옵셔널 체이닝 금지. (테스트 파일 `test/*.test.mjs`는 ESM이라 예외)
- **UMD 팩토리 패턴** — 새 `www/*.js` 모듈은 기존과 동일한 껍데기: `(function(root,factory){ if (typeof module!=="undefined"&&module.exports) module.exports=factory(); else root.MSXxx=factory(); })(typeof self!=="undefined"?self:this, function(){...})`
- **엔진 무수정** — `map/forge-core.js` · `map/forge-tools.js` · `mobile/www/vendor/` 를 건드리지 않는다. vendor 는 생성물이다.
- **테스트 관문은 `./tests/run.sh`** (저장소 루트 `map/` 에서). 현재 기준선 **522건**. 엔진을 안 건드리므로 forge-core 251 · forge-tools 81 · landing 28 은 그대로여야 한다.
- **기대값은 리터럴로** — 테스트가 `MSLayout.MIN_W` 같은 구현 상수를 읽어 기대값을 만들면 항등식이 된다. Phase 3·4에서 세 번 재발한 결함이다.
- **UI 문자열은 영어**, `www/strings.js` 단일 출처. 새 문구를 코드에 직접 쓰지 않는다.
- **항목 좌측 컬러 라인 금지** — 선택 강조는 배경색으로만. 세로 accent bar·`box-shadow:inset Npx 0 0` 금지.
- **CSS 색은 `var(--토큰)`** — `style.css` `:root`에 있는 토큰만.
- **커밋 메시지 말미**: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

**설계서:** [`../specs/2026-08-11-moneyscoop-mobile-phase5-design.md`](../specs/2026-08-11-moneyscoop-mobile-phase5-design.md)

**작업 디렉토리:** 모든 경로는 `map/mobile/` 기준. 테스트 실행만 `map/` 에서.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `www/layout.js` | 창 크기 → 모드·칸 폭·차트 높이. 순수 함수, DOM 무관 | 신규 |
| `test/layout.test.mjs` | 위 모듈 단위 테스트 | 신규 |
| `www/store.js` | `lastSym` 영속 2개 추가 | 수정 |
| `test/store.test.mjs` | `lastSym` 테스트 3건 추가 | 수정 |
| `www/app.js` | 셸 — 두 칸 조립·모드 전환·선택 상태 | 재작성 |
| `www/strings.js` | 빈 안내 문구 1건 | 수정 |
| `test/strings.test.mjs` | 스캔 대상에 `app.js` 추가 | 수정 |
| `www/screens/watchlist.js` | 행에 `data-sym` 1줄 | 수정 |
| `www/screens/report.js` | 차트 높이를 `MSLayout`에서 | 수정 |
| `www/style.css` | `body.ms-dual` 블록 | 수정 |
| `www/index.html` | `layout.js` 스크립트 태그 | 수정 |
| `docs/BACKLOG-mobile.md` | Phase 5 종료 기록 + 실기기 항목 | 수정 |

---

### Task 1: `MSLayout` — 순수 기하 모듈

**Files:**
- Create: `map/mobile/www/layout.js`
- Test: `map/mobile/test/layout.test.mjs`

**Interfaces:**
- Consumes: 없음 (의존성 제로)
- Produces:
  - `MSLayout.MODE_QUERY` → `string` — `matchMedia()`에 그대로 넣는 미디어쿼리 문자열
  - `MSLayout.isDual(w, h)` → `boolean`
  - `MSLayout.listWidth(totalW)` → `number` (px 정수)
  - `MSLayout.chartHeight(dual, vh)` → `number` (px 정수)
  - `MSLayout.MIN_W`, `MSLayout.MIN_H`, `MSLayout.LIST_MIN`, `MSLayout.LIST_MAX` (상수 노출 — 디버깅용, 테스트 기대값으로 쓰지 말 것)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/layout.test.mjs` 신규 생성:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("../www/layout.js");

// 폴드7 실측(2026-08-11): 커버 411×814 · 펼침 749×654
test("실측 네 상태의 모드 판정", () => {
  assert.equal(L.isDual(411, 814), false, "커버 세로");
  assert.equal(L.isDual(814, 411), false, "커버 가로 — 높이 411 에 두 칸을 세우면 리포트를 못 쓴다");
  assert.equal(L.isDual(749, 654), true, "펼침 세로");
  assert.equal(L.isDual(654, 749), true, "펼침 가로");
});

test("모드 경계는 600×480 이다", () => {
  // 리터럴로 적는다 — L.MIN_W/L.MIN_H 를 읽으면 상수를 바꿨을 때 기대값이 함께 움직여 항등식이 된다.
  assert.equal(L.isDual(599, 480), false, "폭 하한 미달");
  assert.equal(L.isDual(600, 480), true, "경계는 포함");
  assert.equal(L.isDual(600, 479), false, "높이 하한 미달");
});

test("MODE_QUERY 는 완성된 문자열이다", () => {
  assert.equal(L.MODE_QUERY, "(min-width: 600px) and (min-height: 480px)");
});

test("MODE_QUERY 와 isDual 이 같은 경계를 말한다 — 두 출처 이탈 방지", () => {
  const m = /min-width:\s*(\d+)px[\s\S]*min-height:\s*(\d+)px/.exec(L.MODE_QUERY);
  assert.ok(m, "MODE_QUERY 에서 경계값을 못 읽었다: " + L.MODE_QUERY);
  const w = +m[1], h = +m[2];
  assert.equal(L.isDual(w, h), true, "쿼리가 통과시키는 크기를 isDual 이 막는다");
  assert.equal(L.isDual(w - 1, h), false, "쿼리가 막는 폭을 isDual 이 통과시킨다");
  assert.equal(L.isDual(w, h - 1), false, "쿼리가 막는 높이를 isDual 이 통과시킨다");
});

test("목록 폭 — 펼침 749 에서 255", () => {
  assert.equal(L.listWidth(749), 255);
});

test("목록 폭 clamp — 240 아래·300 위로 안 나간다", () => {
  assert.equal(L.listWidth(600), 240, "600×0.34=204 → 하한이 물어야 한다");
  assert.equal(L.listWidth(1400), 300, "1400×0.34=476 → 상한이 물어야 한다");
});

test("차트 높이 — 단일은 520 고정(Phase 1~4 검증값)", () => {
  assert.equal(L.chartHeight(false, 814), 520, "커버 세로");
  assert.equal(L.chartHeight(false, 411), 520, "커버 가로에서도 단일이면 안 바뀐다");
});

test("차트 높이 — 펼침 654 에서 414", () => {
  assert.equal(L.chartHeight(true, 654), 414);
});

test("차트 높이 clamp — 320~460", () => {
  assert.equal(L.chartHeight(true, 500), 320, "500-240=260 → 하한");
  assert.equal(L.chartHeight(true, 900), 460, "900-240=660 → 상한");
});

test("이상 입력에 NaN 을 뱉지 않는다 — 캔버스 width/height 로 바로 들어간다", () => {
  const bads = [NaN, undefined, null, Infinity];
  for (const bad of bads) {
    assert.ok(isFinite(L.listWidth(bad)), "listWidth(" + bad + ") = " + L.listWidth(bad));
    assert.ok(isFinite(L.chartHeight(true, bad)), "chartHeight(true," + bad + ") = " + L.chartHeight(true, bad));
    assert.ok(isFinite(L.chartHeight(false, bad)), "chartHeight(false," + bad + ")");
  }
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd map/mobile && node --test test/layout.test.mjs
```

기대: `Cannot find module '../www/layout.js'` 로 전부 실패.

- [ ] **Step 3: 최소 구현**

`map/mobile/www/layout.js` 신규 생성:

```js
// 창 크기 → 레이아웃 결정. 순수 함수 — DOM 도 상태도 갖지 않는다.
// 경계값(MIN_W·MIN_H)은 이 두 상수가 유일한 출처다. CSS 는 자기 미디어쿼리를 갖지 않고
// app.js 가 붙이는 body.ms-dual 클래스를 읽는다 — 두 곳에 적으면 한쪽만 고쳤을 때
// "JS 는 2단이라 믿는데 CSS 는 단일로 그리는" 상태가 조용히 생긴다(설계 §3.1).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSLayout = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN_W = 600;              // 안드로이드 medium 구간 시작
  var MIN_H = 480;              // 커버 가로회전(814×411)을 2단에서 배제한다 — 높이 411 에 두 칸은 못 쓴다
  var LIST_RATIO = 0.34;
  var LIST_MIN = 240, LIST_MAX = 300;
  var CHART_H_SINGLE = 520;     // Phase 1~4 가 커버에서 검증한 값 — 단일 모드에선 건드리지 않는다
  var CHART_H_MIN = 320, CHART_H_MAX = 460;
  var CHART_CHROME = 240;       // 헤드·티어행·판정·레전드가 먹는 세로(실측)

  var MODE_QUERY = "(min-width: " + MIN_W + "px) and (min-height: " + MIN_H + "px)";

  function isDual(w, h) { return w >= MIN_W && h >= MIN_H; }

  function listWidth(totalW) {
    var w = Math.round(totalW * LIST_RATIO);
    if (!isFinite(w)) return LIST_MIN;
    return Math.max(LIST_MIN, Math.min(LIST_MAX, w));
  }

  function chartHeight(dual, vh) {
    if (!dual) return CHART_H_SINGLE;
    var h = Math.round(vh - CHART_CHROME);
    if (!isFinite(h)) return CHART_H_MIN;
    return Math.max(CHART_H_MIN, Math.min(CHART_H_MAX, h));
  }

  return { MODE_QUERY: MODE_QUERY, isDual: isDual, listWidth: listWidth, chartHeight: chartHeight,
           MIN_W: MIN_W, MIN_H: MIN_H, LIST_MIN: LIST_MIN, LIST_MAX: LIST_MAX };
});
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd map/mobile && node --test test/layout.test.mjs
```

기대: 10건 전부 PASS.

- [ ] **Step 5: 통합 관문**

```bash
cd map && ./tests/run.sh
```

기대: `전체 통과 — 532건` (522 + 신규 10).

- [ ] **Step 6: 커밋**

```bash
cd map && git add mobile/www/layout.js mobile/test/layout.test.mjs
git commit -m "mobile(p5): 레이아웃 판정 순수 함수 MSLayout — 모드·칸 폭·차트 높이

폴드7 실측 749×654. 모드 판정에 높이 조건(480px)이 필수다 — 없으면
커버 가로회전 814×411 이 2단으로 떨어져 리포트를 못 쓴다.

경계값은 MIN_W/MIN_H 두 상수만 출처. MODE_QUERY 를 거기서 조립하고
CSS 는 미디어쿼리 대신 body.ms-dual 을 읽는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `MSStore` — 마지막 본 종목

**Files:**
- Modify: `map/mobile/www/store.js:9` (KEYS), `:47-55` (removeTicker), `:67-69` (export)
- Test: `map/mobile/test/store.test.mjs` (파일 끝에 추가)

**Interfaces:**
- Consumes: Task 1 없음 (독립)
- Produces:
  - `MSStore.getLastSym()` → `string|null` — 대문자 정규화된 심볼, 없으면 `null`
  - `MSStore.setLastSym(sym)` → `undefined` — 빈 문자열/`null` 을 주면 지운다
  - `MSStore.KEYS.lastSym` → `"ms_last_sym"`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/store.test.mjs` 파일 **끝에** 추가:

```js
test("lastSym 왕복 — 대소문자 정규화", () => {
  MSStore.install(memBackend());
  assert.equal(MSStore.getLastSym(), null, "초기값은 null 이어야 한다");
  MSStore.setLastSym("aapl");
  assert.equal(MSStore.getLastSym(), "AAPL");
});

test("lastSym 은 빈 값으로 지워진다", () => {
  MSStore.install(memBackend());
  MSStore.setLastSym("AAPL");
  MSStore.setLastSym("");
  assert.equal(MSStore.getLastSym(), null);
});

test("종목을 지우면 lastSym 도 같이 지워진다 — 부팅 시 유령 선택 방지", () => {
  MSStore.install(memBackend());
  MSStore.addTicker("AAPL", "Apple Inc.");
  MSStore.addTicker("NVDA", "NVIDIA Corporation");
  MSStore.setLastSym("AAPL");
  MSStore.removeTicker("AAPL");
  assert.equal(MSStore.getLastSym(), null, "지운 종목이 lastSym 에 남았다");
});

test("다른 종목을 지워도 lastSym 은 유지된다", () => {
  MSStore.install(memBackend());
  MSStore.addTicker("AAPL", "Apple Inc.");
  MSStore.addTicker("NVDA", "NVIDIA Corporation");
  MSStore.setLastSym("AAPL");
  MSStore.removeTicker("NVDA");
  assert.equal(MSStore.getLastSym(), "AAPL");
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd map/mobile && node --test test/store.test.mjs
```

기대: `MSStore.setLastSym is not a function` 으로 4건 실패.

- [ ] **Step 3: 최소 구현**

`www/store.js` 9번 줄 `KEYS` 에 키를 추가한다:

```js
  var KEYS = { watchlist: "ms_watchlist", scan: "ms_scan", lastSym: "ms_last_sym" };
```

`allScans`/`getScan`/`setScan` 정의(현 57-59줄) **바로 아래**에 두 함수를 추가한다:

```js
  // 2단 레이아웃의 오른쪽 칸이 부팅 시 무엇을 보여줄지 — 커버로 보다 펴는 흐름에선
  // selectedSym 이 이미 메모리에 있으므로, 이 값이 실제로 쓰이는 건 앱을 새로 켠 순간뿐이다.
  function getLastSym() {
    var v = read(KEYS.lastSym, null);
    return (typeof v === "string" && v) ? v.toUpperCase() : null;
  }
  function setLastSym(sym) {
    var s = String(sym == null ? "" : sym).trim().toUpperCase();
    write(KEYS.lastSym, s || null);
  }
```

`removeTicker` 안에서 스캔 캐시를 지우는 줄(현 52-53줄) **바로 아래**에 추가한다:

```js
    if (getLastSym() === s) write(KEYS.lastSym, null);   // 지운 종목이 다음 부팅에 유령으로 뜬다
```

마지막으로 export 객체(현 67-69줄)에 두 이름을 더한다:

```js
  return { KEYS: KEYS, SEED: SEED, install: install, getWatchlist: getWatchlist, setWatchlist: setWatchlist,
           addTicker: addTicker, removeTicker: removeTicker, getScan: getScan, setScan: setScan,
           allScans: allScans, seedIfEmpty: seedIfEmpty,
           getLastSym: getLastSym, setLastSym: setLastSym };
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd map/mobile && node --test test/store.test.mjs
```

기대: 기존 테스트 + 신규 4건 전부 PASS.

- [ ] **Step 5: 통합 관문**

```bash
cd map && ./tests/run.sh
```

기대: `전체 통과 — 536건`.

- [ ] **Step 6: 커밋**

```bash
cd map && git add mobile/www/store.js mobile/test/store.test.mjs
git commit -m "mobile(p5): 마지막 본 종목 영속 — getLastSym/setLastSym

removeTicker 가 lastSym 도 같이 지운다 — 안 지우면 지운 종목이 다음
부팅에서 오른쪽 칸에 유령으로 뜬다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 셸 배선 — `app.js` 재작성

**Files:**
- Rewrite: `map/mobile/www/app.js` (전체 25줄 → 약 90줄)
- Modify: `map/mobile/www/index.html:15` (스크립트 태그 추가)
- Modify: `map/mobile/www/strings.js` (`t` 객체에 키 1개)
- Modify: `map/mobile/test/strings.test.mjs:12-13` (`KEY_SCAN_FILES` 에 `app.js` 추가)
- Modify: `map/mobile/www/screens/watchlist.js:93-94` (`data-sym` 1줄)

**Interfaces:**
- Consumes: `MSLayout.MODE_QUERY` · `MSLayout.listWidth(totalW)` (Task 1) · `MSStore.getLastSym()` · `MSStore.setLastSym(sym)` (Task 2)
- Produces:
  - `MSApp.go(route, params)` — 기존 시그니처 유지(`route`=`"report"`/`"watchlist"`, `params.sym`). `watchlist.js`의 행 클릭과 `report.js`의 뒤로가기 버튼이 이미 이 이름으로 부른다
  - `MSApp.current()` → `{ route, params: { sym } }`
  - DOM 계약: 2단에서 `<body class="ms-dual">`, 셸은 `.shell > .pane.pane-list + .pane.pane-report`, 선택된 행은 `.row-tap.wl-row.is-sel` — Task 4 의 CSS 가 이 이름들에 건다
  - 워치리스트 행에 `data-sym="AAPL"` 속성

**테스트 없음.** 이 파일은 배선이고 `screens/watchlist.js`가 이미 같은 이유로 테스트가 없다(파일 헤더 주석). 검증은 ①`strings.test.mjs` 의 키 가드 ②통합 관문 ③실기기(Task 5).

- [ ] **Step 1: 문자열 키를 추가한다**

`www/strings.js` 의 `var t = {` 안, 리포트 관련 키들 옆에 추가한다:

```js
    rpPickSym: "Pick a ticker on the left.",
```

- [ ] **Step 2: 문자열 테스트의 스캔 대상을 넓힌다**

`test/strings.test.mjs:12-13` 의 `KEY_SCAN_FILES` 에 `app.js` 를 더한다. **이 단계를 빼먹으면 `rpPickSym` 이 "참조되지 않는 죽은 키"로 잡혀 관문이 빨개진다** (파일 하단 미사용 키 가드):

```js
const KEY_SCAN_FILES = ["../www/screens/report.js", "../www/screens/watchlist.js", "../www/draw-layers.js",
                         "../www/chart-legend.js", "../www/draw-panels.js", "../www/app.js"];
```

- [ ] **Step 3: 실패를 확인한다**

```bash
cd map/mobile && node --test test/strings.test.mjs
```

기대: 미사용 키 가드가 `참조되지 않는 MSStr.t 키 1건: rpPickSym` 으로 FAIL. (아직 `app.js` 가 안 쓰므로 — 다음 단계에서 해소된다)

- [ ] **Step 4: `app.js` 를 재작성한다**

`www/app.js` 전체를 아래로 교체한다:

```js
// 셸 — 화면이 둘뿐이라 라우트 대신 '선택 종목' 하나로 충분하다.
// 접었다 펴도 보던 종목이 따라오는 것이 여기서 공짜로 나온다: 같은 selectedSym 을
// 레이아웃만 달리 그린다(설계 §5). 라우트를 유지한 채 2단을 얹으면
// "왼쪽 칸은 무슨 라우트인가" 같은 답 없는 질문이 생긴다.
(function () {
  "use strict";

  var state = { selectedSym: null, showing: "watchlist" };
  var rootEl = null, dual = false;
  var listPane = null, reportPane = null;

  function inWatchlist(sym) {
    if (!sym) return false;
    var wl = MSStore.getWatchlist(), i;
    for (i = 0; i < wl.length; i++) { if (wl[i].sym === sym) return true; }
    return false;
  }

  // 왼쪽 칸을 다시 그리지 않고 하이라이트만 옮긴다 — 재렌더하면 스크롤이 맨 위로 튀고
  // 진행 중인 스캔 UI 가 죽는다(MSWatchlist.render 가 scanning=false 로 시작한다).
  function markSelected() {
    if (!listPane) return;
    var rows = listPane.querySelectorAll("[data-sym]"), i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute("data-sym") === state.selectedSym) rows[i].classList.add("is-sel");
      else rows[i].classList.remove("is-sel");
    }
  }

  function renderReportPane() {
    reportPane.innerHTML = "";
    reportPane.scrollTop = 0;
    if (state.selectedSym) MSReport.render(reportPane, { sym: state.selectedSym });
    else reportPane.appendChild(MSUi.el("p", "empty", MSStr.t.rpPickSym));
    markSelected();
  }

  function renderShell() {
    rootEl.innerHTML = "";
    listPane = null; reportPane = null;
    if (dual) document.body.classList.add("ms-dual");
    else document.body.classList.remove("ms-dual");

    if (dual) {
      var shell = MSUi.el("div", "shell");
      shell.style.gridTemplateColumns = MSLayout.listWidth(window.innerWidth) + "px 1fr";
      listPane = MSUi.el("div", "pane pane-list");
      reportPane = MSUi.el("div", "pane pane-report");
      shell.appendChild(listPane);
      shell.appendChild(reportPane);
      rootEl.appendChild(shell);
      MSWatchlist.render(listPane);
      renderReportPane();
      return;
    }

    if (state.showing === "report" && state.selectedSym) MSReport.render(rootEl, { sym: state.selectedSym });
    else MSWatchlist.render(rootEl);
    window.scrollTo(0, 0);
  }

  function go(route, params) {
    var sym = (params && params.sym) ? String(params.sym).trim().toUpperCase() : null;
    if (route === "report" && sym) {
      state.selectedSym = sym;
      state.showing = "report";
      MSStore.setLastSym(sym);
      if (dual) { renderReportPane(); return; }   // 오른쪽만 교체 — 목록 칸은 손대지 않는다
    } else {
      state.showing = "watchlist";
    }
    renderShell();
  }

  window.MSApp = {
    go: go,
    current: function () { return { route: state.showing, params: { sym: state.selectedSym } }; }
  };

  document.addEventListener("DOMContentLoaded", function () {
    rootEl = document.getElementById("app");
    if (typeof ForgeCore === "undefined") {
      rootEl.innerHTML = "<p class='empty'>vendor/forge-core.js 를 불러오지 못했습니다.<br>npm run sync 후 다시 여세요.</p>";
      return;
    }

    // 시드를 먼저 심어야 inWatchlist 판정이 첫 부팅에서도 맞는다(워치리스트 화면도 다시 부르지만 무해).
    MSStore.seedIfEmpty();
    var last = MSStore.getLastSym();
    if (inWatchlist(last)) state.selectedSym = last;
    // showing 은 건드리지 않는다 — 단일 모드 부팅에서 목록 대신 리포트로 떨어지면 당황스럽다.
    // 2단이면 selectedSym 만으로 오른쪽 칸이 채워진다.

    var mq = window.matchMedia(MSLayout.MODE_QUERY);
    dual = mq.matches;
    function onMode(e) { dual = e.matches; renderShell(); }
    if (mq.addEventListener) mq.addEventListener("change", onMode);
    else mq.addListener(onMode);   // 구형 WebView 폴백

    renderShell();
  });
})();
```

- [ ] **Step 5: 스크립트 태그를 추가한다**

`www/index.html` 의 `<script src="store.js"></script>` **바로 아래** 줄에 삽입한다. `app.js` 보다 먼저 로드되기만 하면 된다:

```html
<script src="layout.js"></script>
```

- [ ] **Step 6: 워치리스트 행에 `data-sym` 을 단다**

`www/screens/watchlist.js:93` 의 `var btn = MSUi.el("button", "row-tap wl-row");` **바로 다음 줄**에 추가한다:

```js
      btn.setAttribute("data-sym", item.sym);   // app.js 가 하이라이트를 옮길 때 쓰는 앵커(목록 재렌더 회피)
```

- [ ] **Step 7: 통합 관문**

```bash
cd map && ./tests/run.sh
```

기대: `전체 통과 — 536건`. `strings.test.mjs` 의 미사용 키 가드가 이제 통과해야 한다.

- [ ] **Step 8: 커밋**

```bash
cd map && git add mobile/www/app.js mobile/www/index.html mobile/www/strings.js \
  mobile/www/screens/watchlist.js mobile/test/strings.test.mjs
git commit -m "mobile(p5): 셸 배선 — 라우트를 selectedSym 으로 교체, 두 칸 조립

화면이 둘뿐이라 라우트가 벌어주는 게 없다. selectedSym 하나를 레이아웃만
달리 그리면 접었다 펴도 보던 종목이 따라오는 게 별도 처리 없이 나온다.

선택이 바뀌어도 목록 칸은 재렌더하지 않고 data-sym 으로 하이라이트만
옮긴다 — 재렌더하면 스크롤이 튀고 진행 중인 스캔 UI 가 죽는다.

부팅 시 lastSym 복원은 selectedSym 만 채우고 showing 은 안 건드린다.
단일 모드 부팅에서 목록 대신 리포트로 떨어지면 당황스럽다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 2단 스타일 + 차트 높이

**Files:**
- Modify: `map/mobile/www/style.css` (파일 끝에 블록 추가)
- Modify: `map/mobile/www/screens/report.js:9` · `:110-131` · `:147-149` · `:252-258` · `:493`

**Interfaces:**
- Consumes: `MSLayout.chartHeight(dual, vh)` (Task 1) · Task 3 의 DOM 계약(`body.ms-dual` · `.shell` · `.pane-list` · `.pane-report` · `.is-sel`)
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: `report.js` 의 차트 높이를 모드에 딸리게 한다**

9번 줄

```js
  var CHART_H = 520, PAD = 10;
```

을 아래로 바꾼다:

```js
  var PAD = 10;
  // 차트 높이는 모드에 딸린다 — 커버 520(Phase 1~4 검증값)은 그대로, 펼침은 세로 654 라 414 로 줄인다.
  // 520 을 그대로 두면 654 화면에서 차트만으로 80% 를 먹는다.
  function chartH() { return MSLayout.chartHeight(document.body.classList.contains("ms-dual"), window.innerHeight); }
```

- [ ] **Step 2: `paintChart` 안의 `CHART_H` 참조를 지역 변수로 바꾼다**

113-115번 줄의 지역 변수 선언에 한 줄 더한다:

```js
    var cssW = wrap.clientWidth || 320;
    var lay = null;
    var chartHpx = chartH();          // relayout 마다 다시 읽는다 — 회전·폴드 전환을 따라간다
    var tail = MSZoom.DEFAULT_TAIL;   // 화면 유지 중에만 산다. 종목을 바꾸면 paintChart 가 다시 불려 기본값으로 돌아간다.
```

`relayout()` (117-130번 줄) 안에서 세 곳을 바꾼다:

```js
    function relayout() {
      var dpr = window.devicePixelRatio || 1;
      chartHpx = chartH();
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(chartHpx * dpr);
      cv.style.height = chartHpx + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // DPR 트랜스폼 — 리사이즈 시점에만 설정
      // 한계가 plotW 에 딸려 있다 — 폴드를 펴면 커버에서 쓰던 봉 수가 새 하한 밖일 수 있다.
      // (커버 20봉 → 펼침 하한 44봉). 폴드는 두 화면을 상시로 오가므로 예외가 아니라 일상 경로다.
      var fut = (an.out.prediction && an.out.prediction.path) ? an.out.prediction.path.length : 0;
      tail = MSZoom.clamp(MSChartLayout.plotWidth(cssW, PAD), fut, tail);
      lay = MSChartLayout.chartLayout({
        candle: data.candle, prediction: an.out.prediction,
        width: cssW, height: chartHpx, pad: PAD, tailBars: tail
      });
    }
```

`frame()` (147-149번 줄) 첫 두 줄:

```js
    function frame(hoverFi) {
      ctx.clearRect(0, 0, cssW, chartHpx);
      MSLayers.resetLabels(cssW, chartHpx);             // 매 프레임 맨 앞 — 이 뒤에 등록되는 라벨만 서로를 본다.
```

- [ ] **Step 3: `onResize` 가 높이 변화도 잡게 한다**

252-258번 줄의 `onResize` 를 바꾼다. **폭이 그대로여도 모드가 바뀌면 차트 높이가 달라진다** — 지금 조건은 폭만 본다:

```js
    function onResize() {
      var w2 = wrap.clientWidth || cssW, h2 = chartH();
      if (w2 === cssW && h2 === chartHpx) return;
      cssW = w2;
      relayout();   // 재클램프는 relayout() 안에서 이미 일어난다 — 폴드 회전(커버 20봉 → 펼침 하한 44봉)에도 별도 처리 불필요
      frame(null);
    }
```

- [ ] **Step 4: 스켈레톤 높이도 따라가게 한다**

493번 줄:

```js
        scr.appendChild(skeletonBlock(chartH())); // 차트
```

- [ ] **Step 5: `style.css` 에 2단 블록을 붙인다**

파일 **맨 끝**에 추가한다:

```css
/* ===== 2단 (폴드 펼침) =====
   미디어쿼리를 쓰지 않는다 — 경계값은 layout.js 의 MIN_W/MIN_H 가 유일한 출처이고,
   app.js 가 matchMedia 결과를 body.ms-dual 로 내려준다. 여기에 @media 를 또 적으면
   한쪽만 고쳤을 때 JS 와 CSS 가 조용히 갈라진다(설계 §3.1). */
body.ms-dual { padding-bottom:0; overflow:hidden; }
body.ms-dual .shell { display:grid; height:100vh; height:100dvh; }
body.ms-dual .pane {
  min-width:0;                      /* 그리드 칸이 콘텐츠 폭에 밀려 넘치는 것을 막는다 */
  overflow-y:auto; overscroll-behavior:contain;
  padding-bottom:env(safe-area-inset-bottom);
}
body.ms-dual .pane-list { border-right:1px solid var(--hairline-2); }
/* 목록 칸은 255px 다 — 기본 20px 좌우 패딩이면 콘텐츠가 215px 로 남는다 */
body.ms-dual .pane-list .scr { padding:0 14px 24px; }
/* A′ 의 핵심: 스파크라인 64px + 확신 34px 를 덜어 차트에 돌린다 */
body.ms-dual .pane-list .wl-spark,
body.ms-dual .pane-list .wl-conf { display:none; }
/* 2단엔 '뒤로'가 없다 — 목록이 옆에 그대로 있다 */
body.ms-dual .pane-report .rp-back { display:none; }
/* 선택 강조는 배경색만. 좌측 세로 컬러 라인 금지(프로젝트 규율) */
body.ms-dual .wl-row.is-sel { background:rgba(232,180,99,.10); }
```

- [ ] **Step 6: 통합 관문**

```bash
cd map && ./tests/run.sh
```

기대: `전체 통과 — 536건`. 이 태스크는 테스트를 추가하지 않으므로 건수가 그대로여야 한다 — 줄었다면 무언가 깨진 것이다.

- [ ] **Step 7: 문법 확인 (브라우저 없이)**

```bash
cd map/mobile && node -e "require('./www/layout.js'); console.log('layout ok')" \
  && node --check www/app.js && node --check www/screens/report.js \
  && node --check www/screens/watchlist.js && echo "구문 통과"
```

기대: `layout ok` + `구문 통과`. (`app.js`·`report.js` 는 DOM 전역을 쓰므로 `require` 는 못 하고 `--check` 로 구문만 본다)

- [ ] **Step 8: 커밋**

```bash
cd map && git add mobile/www/style.css mobile/www/screens/report.js
git commit -m "mobile(p5): 2단 스타일 + 차트 높이를 모드에 연동

펼침 세로가 654 라 차트 520 을 그대로 두면 뷰포트의 80% 를 먹는다.
MSLayout.chartHeight 로 2단에서만 414 로 줄이고 커버 520 은 유지.

onResize 가 폭만 보고 있었다 — 모드가 바뀌면 폭이 같아도 높이가 달라져
차트가 옛 높이로 남는다. 높이 비교를 추가.

CSS 는 미디어쿼리 없이 body.ms-dual 만 읽는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 백로그 갱신 + 실기기 확인 항목

**Files:**
- Modify: `map/mobile/docs/BACKLOG-mobile.md`

**Interfaces:**
- Consumes: Task 1~4 의 결과
- Produces: 없음 (문서)

- [ ] **Step 1: 완료 기록을 추가한다**

`## 🔥 다음` 섹션 **바로 위**, Phase 4 항목 다음에 추가한다:

```markdown
- **Phase 5 — 폴드 2단 레이아웃(리스트-디테일)**(2026-08-11): 펼침에서 좌 워치리스트 · 우 리포트.
  - **실측이 전제를 뒤집었다** — 폴드7 펼침은 749×654다. 커진 게 아니라 **짧고 넓어진** 것(가로 +82%,
    세로 −20%). 749에서는 "목록도 두고 차트도 키운다"가 성립하지 않아, 목록에서 스파크라인·확신을
    덜어내 차트에 봉 폭 +27%를 돌리는 A′안으로 갔다
  - 모드 판정에 **높이 조건(480px)이 필수**였다 — 폭만 보면 커버 가로회전(814×411)이 2단으로 떨어져
    리포트를 못 쓴다
  - 라우트를 버리고 `selectedSym` 하나로 — 접었다 펴도 보던 종목이 따라오는 것이 별도 처리 없이 나온다
  - **경계값 단일 출처**: `layout.js` 의 `MIN_W`/`MIN_H` 에서 `MODE_QUERY` 를 조립하고, CSS 는
    미디어쿼리 대신 `body.ms-dual` 클래스를 읽는다. Phase 3에서 상태 어휘가 두 파일로 갈렸던 것과 같은 모양을 선제 차단
  - 선택 변경 시 목록 칸은 재렌더하지 않는다(`data-sym` 하이라이트만 이동) — 재렌더하면 스크롤이 튀고
    진행 중인 스캔 UI 가 죽는다
  - `onResize` 가 폭만 보고 있던 결함 발견 — 모드 전환은 폭이 같아도 차트 높이를 바꾼다
  - 테스트 522 → 536(`map/tests/run.sh`, 모바일 162 → 176). `forge-core.js`·`forge-tools.js` 무수정 유지
  - 실기기 육안 확인은 **미실시** — 아래 참조
```

- [ ] **Step 2: 실기기 확인 섹션을 만든다**

`## 🔥 다음` 섹션 **바로 아래**에 추가한다:

```markdown
## 미검증 — 사용자 육안 확인 필요

Phase 5(폴드 2단) 실기기 확인은 브라우저·실기기가 없는 에이전트 환경이라 수행하지 못했다. 사람이

```
cd map/mobile/www && python3 -m http.server 8000 --bind 0.0.0.0
폰 Chrome → http://<tailscale-ip>:8000
```

로 아래 9항목을 확인할 것:

1. 펴면 2단(좌 목록·우 리포트), 접으면 단일로 바뀐다.
2. 커버에서 종목을 보다가 펴면 **그 종목이 오른쪽 칸에 그대로 있다.** 반대로 2단에서 고른 종목이 접었을 때 리포트로 남는다.
3. 왼쪽에서 다른 종목을 눌러도 **목록 스크롤 위치가 유지된다**(맨 위로 안 튄다).
4. 스캔 중에 종목을 눌러도 진행 표시가 안 죽는다.
5. 차트 위 한 손가락 세로 드래그로 **오른쪽 칸이** 스크롤된다(페이지 전체 아님).
6. 차트 위 350ms 홀드 크로스헤어가 2단에서도 동작한다(Phase 1 계약).
7. 두 손가락 핀치 줌이 2단에서도 동작한다(Phase 4 계약).
8. 커버를 눕혀도 2단으로 넘어가지 않는다.
9. 펴고 접기를 여러 번 반복해도 차트가 정상이다(리사이즈 리스너 누수 — Phase 1에서 한 번 고친 자리).
```

기존 Phase 3·4 의 미검증 항목이 `📋 예정` 에 남아 있다면 건드리지 않는다.

- [ ] **Step 3: 이월 항목을 `📋 예정` 에 추가한다**

`## 📋 예정` 목록 맨 위에 추가한다:

```markdown
- **커버 가로회전의 520px 차트** — 뷰포트 높이 411에 차트 520이 들어간다. Phase 5 **이전부터 있던**
  결함이고 모드 판정이 커버 가로를 단일로 떨어뜨려 동작도 안 바뀌었다. 회전을 실제로 쓰는지 확인 후 판단.
- **모드 전환 시 리포트 재분석** — `report.js` 의 `cache` Map 이 OHLC 를 들고 있어 네트워크는 안 타지만
  `analyzeFull` 은 다시 돈다. 폴드는 전환이 잦은 기기라 체감되면 분석 결과까지 캐시할 것.
- **목록 255px 종목명 잘림** — `.wl-name` 이 ellipsis 라 깨지진 않으나 "NVIDIA Corporation" 같은 긴
  이름은 대부분 잘린다. 실기기 확인 후 판단.
- **2단에서 선택 종목을 롱프레스 삭제하면 오른쪽 칸이 남는다** — `MSWatchlist` 가 자기 `draw()` 만
  부르고 app 에 알리지 않는다. `MSStore.removeTicker` 가 `lastSym` 은 지우므로 다음 부팅은 깨끗하다.
  실사용에서 걸리면 삭제 콜백을 붙일 것.
- **3단·확장(≥840px) 레이아웃** — 폴드7이 749라 실측 근거가 없다. 태블릿을 지원할 때.
```

- [ ] **Step 4: 최종 관문**

```bash
cd map && ./tests/run.sh
```

기대: `전체 통과 — 536건`. 실제 출력이 536이 아니면 Step 1 에 적은 숫자를 실측값으로 정정한다.

- [ ] **Step 5: 커밋**

```bash
cd map && git add mobile/docs/BACKLOG-mobile.md
git commit -m "mobile(p5): Phase 5 종료 문서 + 실기기 확인 9항목

커버 가로회전 차트 높이·모드 전환 재분석·종목명 잘림·선택 종목 삭제 시
잔여 리포트를 예정으로 이월.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 완료 조건

- `./tests/run.sh` 전체 통과, 모바일 스위트가 162 → 176건(신규 14건: layout 10 + store 4)
- `forge-core` 251 · `forge-tools` 81 · `landing` 28 이 변동 없음 (엔진 무수정 확인)
- `git status` 깨끗, 커밋 5개
- 실기기 9항목은 **미검증 상태로 백로그에 남는다** — 사람이 확인할 몫이다
