# 머니스쿱 앱 개편 P0 — 뼈대 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱에 3탭 셸·라우터·화면 레지스트리·공용 시트를 세우고, 브라우저에서 화면을 실제로 열어보는 관문을 만든다. 그 과정에서 리포트를 100% 죽이고 있는 전역 이름 충돌을 없앤다.

**Architecture:** 전역 등록을 `MSGlobals.define()` 한 곳으로 모아 이름 충돌을 등록 시점에 죽인다. 네비게이션은 DOM-free UMD 모듈(`router.js`)로 분리해 노드에서 값으로 검증하고, DOM 조립은 `shell.js`(탭바·화면 컨테이너)와 `sheet.js`(공용 하단 시트)가 맡는다. `app.js` 는 부팅만 남긴다. 새 관문 `tools/gate-browser.mjs` 가 모든 라우트를 실제 크로미움에서 열어 콘솔 오류·단언·스크린샷을 한 번에 얻는다.

**Tech Stack:** 바닐라 ES5 브라우저 JS(UMD/IIFE) · Node `node:test`(테스트) · Capacitor(안드로이드) · 크로미움 CLI(관문). **빌드 도구·npm 런타임 의존성 없음.**

**Spec:** [`docs/superpowers/specs/2026-08-18-moneyscoop-app-rebuild-design.md`](../specs/2026-08-18-moneyscoop-app-rebuild-design.md)

## Global Constraints

- **ES5 문법만.** `var`·`function`. 화살표·`const`/`let`·템플릿 리터럴·옵셔널 체이닝 금지 (`map/mobile/www/**` 규율)
- **빌드 도구·외부 라이브러리 금지.** 새 npm 의존성을 추가하지 않는다
- **UI 문자열은 `www/strings.js` 단일 출처.** 화면 파일에 한국어 리터럴을 박지 않는다. 단, **지표명은 영어 유지**
- **색·크기는 토큰으로.** 캔버스는 `MSUi.readToken()` 으로 CSS 변수를 읽는다
- **금지: 항목 좌측 세로 컬러 라인(accent bar/rail).** 활성·선택은 배경색·텍스트색·체크·아웃라인으로만
- **터치 대상 최소 44px.** 모든 숫자에 `font-variant-numeric: tabular-nums`
- **엔진(`forge-core.js`)·서버(`wallet-*.php`)를 건드리지 않는다.** P0 는 UI 계층 전용
- **저장 키를 바꾸지 않는다** — `ms_onboarded`·`ms_consent`·`ms_watchlist`·`ms_preds`·`ms_scan` 등 `store.js` 의 키 스키마 유지
- 테스트: `./tests/run.sh` (저장소 루트 `map/` 에서) — 전량 통과가 태스크 완료 조건
- 브라우저 관문: `node mobile/tools/gate-browser.mjs` — Task 2 이후 모든 태스크의 완료 조건
- 커밋 메시지는 한국어, 마지막 줄에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `www/globals.js` (신규) | 전역 이름 단일 출처. `define(name, value)` — 중복이면 throw |
| `www/router.js` (신규) | DOM-free 네비게이션 상태기계. 화면 레지스트리 · 탭별 스택 · go/back/switchTab |
| `www/shell.js` (신규) | DOM 조립 — 하단 탭바 + 화면 컨테이너. 라우터의 렌더 콜백을 받는다 |
| `www/sheet.js` (신규) | 공용 하단 시트 — 라운드 28 · 최대 82vh · 안전영역 · 백드롭 · 뒤로가기 닫힘 |
| `www/style-shell.css` (신규) | 탭바 · 화면 컨테이너 · 안전영역 |
| `www/app.js` (재작성) | 부팅만 — 벤더 확인 · 지갑 설치 · 온보딩 게이트 · 라우터/셸 기동 |
| `www/draw-preds.js` (수정) | 전역명 `MSPreds` → **`MSPredDraw`** |
| `www/predictions.js` (수정) | 전역명 `MSPreds` → **`MSPredLog`** |
| `www/chart-draw.js`·`chart-legend.js` (수정) | 브라우저 분기에서 `root.MSPredDraw` 를 받는다 |
| `www/screens/{report,watchlist,record}.js` (수정) | `MSPreds` → `MSPredLog` |
| `www/index.html` (수정) | `globals.js` 최선두 · `router.js`·`shell.js`·`sheet.js` 추가 · `style-shell.css` 링크 |
| `tools/gate-browser.mjs` (신규) | 브라우저 관문 — 라우트별 프로브 · 콘솔 오류 0 · 단언 · 스크린샷 |
| `test/globals.test.mjs` (신규) | 전역 이름 유일성 · define 사용 강제 |
| `test/router.test.mjs` (신규) | 탭별 스택 · go/back/switchTab 계약 |
| `test/shell.test.mjs` (신규) | 탭바 구조 · 시안 실측값 · 배지 규칙 |
| `test/sheet.test.mjs` (신규) | 시트 계약 — 라운드/최대높이/백드롭/닫힘 경로 |

---

## Task 1: 전역 이름 단일 출처 + `MSPreds` 분해

리포트를 100% 죽이고 있는 결함을 먼저 없앤다. 이걸 고치지 않으면 Task 2 의 관문이 첫날부터 빨간 채로 시작해 신호가 안 된다.

**Files:**
- Create: `mobile/www/globals.js`
- Create: `mobile/test/globals.test.mjs`
- Modify: `mobile/www/draw-preds.js:12-15` · `mobile/www/predictions.js:15-17` · `mobile/www/chart-draw.js:3-6` · `mobile/www/chart-legend.js:5-9`
- Modify: `mobile/www/screens/record.js` · `mobile/www/screens/watchlist.js` · `mobile/www/screens/report.js` (`MSPreds` → `MSPredLog`)
- Modify: `mobile/www/index.html` (globals.js 최선두)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `MSGlobals.define(name, value) → value` (중복 시 throw) · `MSGlobals.names() → string[]` · 전역 `MSPredDraw`(작도) · 전역 `MSPredLog`(기록)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/globals.test.mjs`:

```js
// 2026-08-18 감사에서 드러난 사고를 이름 등록 시점에 죽인다:
// draw-preds.js(작도)와 predictions.js(기록)가 둘 다 전역 MSPreds 를 등록했고,
// chart-draw.js 가 로드 시점에 캡처한 전역이 기록 모듈이라 리포트가 100% 죽었다.
// 모듈 테스트는 require 로 각각 독립 객체를 받아 이 사고를 원리적으로 못 본다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WWW = fileURLToPath(new URL("../www/", import.meta.url));

function jsFiles() {
  const out = [];
  for (const f of readdirSync(WWW)) {
    if (f.endsWith(".js")) out.push(f);
  }
  for (const f of readdirSync(path.join(WWW, "screens"))) {
    if (f.endsWith(".js")) out.push("screens/" + f);
  }
  return out.filter(f => !f.startsWith("vendor/"));
}

// 브라우저 분기에서 전역에 붙는 이름을 모은다. define() 형태와 옛 직접대입 형태 둘 다 잡는다.
function registrations() {
  const map = new Map();
  for (const f of jsFiles()) {
    const src = readFileSync(path.join(WWW, f), "utf8");
    for (const m of src.matchAll(/MSGlobals\.define\(\s*"([A-Za-z0-9_]+)"/g)) {
      if (!map.has(m[1])) map.set(m[1], []);
      map.get(m[1]).push(f);
    }
    for (const m of src.matchAll(/\broot\.(MS[A-Za-z0-9_]+)\s*=/g)) {
      if (!map.has(m[1])) map.set(m[1], []);
      map.get(m[1]).push(f);
    }
  }
  return map;
}

test("전역 이름은 파일 하나에서만 등록된다", () => {
  const dup = [];
  for (const [name, files] of registrations()) {
    if (files.length > 1) dup.push(name + " ← " + files.join(", "));
  }
  assert.deepStrictEqual(dup, [], "전역 이름 충돌: " + dup.join(" / "));
});

test("MSPreds 라는 이름은 폐기됐다 — 작도는 MSPredDraw, 기록은 MSPredLog", () => {
  for (const f of jsFiles()) {
    const src = readFileSync(path.join(WWW, f), "utf8");
    assert.ok(!/\bMSPreds\b/.test(src), f + " 에 폐기된 이름 MSPreds 가 남아 있다");
  }
});

test("전역 등록은 MSGlobals.define 을 거친다 — 직접 대입 금지", () => {
  const direct = [];
  for (const f of jsFiles()) {
    if (f === "globals.js") continue;
    const src = readFileSync(path.join(WWW, f), "utf8");
    if (/\broot\.MS[A-Za-z0-9_]+\s*=/.test(src)) direct.push(f);
  }
  assert.deepStrictEqual(direct, [], "define 을 안 거치는 전역 대입: " + direct.join(", "));
});

test("중복 등록은 즉시 던진다", async () => {
  const src = readFileSync(path.join(WWW, "globals.js"), "utf8");
  const root = {};
  new Function("self", src).call(root, root);
  root.MSGlobals.define("MSThing", { a: 1 });
  assert.throws(() => root.MSGlobals.define("MSThing", { a: 2 }), /충돌/);
});

test("index.html 은 globals.js 를 첫 스크립트로 싣는다", () => {
  const html = readFileSync(path.join(WWW, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.strictEqual(scripts[0], "globals.js", "globals.js 가 첫 스크립트가 아니다 — 뒤 모듈이 define 을 못 찾는다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd mobile && node --test test/globals.test.mjs`
Expected: FAIL — `globals.js` 없음(ENOENT) · `MSPreds` 잔존 · 중복 등록.

- [ ] **Step 3: `globals.js` 를 만든다**

`mobile/www/globals.js`:

```js
// 전역 이름 단일 출처. 모듈이 자기 이름을 여기에 등록하고, 이미 있으면 즉시 던진다.
//
// 이 파일이 존재하는 이유(2026-08-18 감사): draw-preds.js 와 predictions.js 가 둘 다
// `MSPreds` 를 등록했고, chart-draw.js 가 **로드 시점에** 전역을 캡처하는 UMD 라
// index.html 순서상 기록 모듈이 이긴 뒤였다 — drawCone() 이 부르는 MSPreds.seed 가 없어
// 리포트가 종목·티어와 무관하게 100% 죽었다. 조용히 덮이는 대신 등록에서 죽게 만든다.
//
// 노드 테스트는 이 파일을 안 거친다(모듈마다 require 로 독립 객체를 받는다). 그래서
// 이 방어는 브라우저 전용이고, 짝이 되는 관문이 tools/gate-browser.mjs 다.
(function (root) {
  "use strict";
  var taken = {};

  function define(name, value) {
    if (Object.prototype.hasOwnProperty.call(taken, name)) {
      throw new Error("전역 이름 충돌: " + name + " 은 이미 등록됐다");
    }
    taken[name] = true;
    root[name] = value;
    return value;
  }

  function names() {
    var out = [], k;
    for (k in taken) { if (Object.prototype.hasOwnProperty.call(taken, k)) out.push(k); }
    return out.sort();
  }

  root.MSGlobals = { define: define, names: names };
})(typeof self !== "undefined" ? self : this);
```

- [ ] **Step 4: `MSPreds` 를 둘로 가른다**

`mobile/www/draw-preds.js` 의 UMD 머리(12~15줄)를 이렇게 바꾼다:

```js
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports)
    module.exports = factory(require("./draw-layers.js"), require("../../forge-core.js"));
  // 이름이 MSPredDraw 인 이유: 예측 **작도**다. 예측 **기록**은 predictions.js 의 MSPredLog.
  // 둘 다 MSPreds 였고, 뒤에 로드된 쪽이 앞을 덮어 리포트를 죽였다(2026-08-18 감사).
  else MSGlobals.define("MSPredDraw", factory(root.MSLayers, root.ForgeCore));
})(typeof self !== "undefined" ? self : this, function (Layers, FCore) {
```

`mobile/www/predictions.js` 의 UMD 머리(15~17줄):

```js
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSPredLog", factory());
})(typeof self !== "undefined" ? self : this, function () {
```

`mobile/www/chart-draw.js` 의 머리(3~6줄) — **노드 분기는 이미 옳았다. 깨져 있던 것은 브라우저 분기뿐이다**:

```js
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./draw-preds.js"));
  else MSGlobals.define("MSChartDraw", factory(root.MSPredDraw));
})(typeof self !== "undefined" ? self : this, function (MSPredDraw) {
```

그리고 이 파일 본문의 `MSPreds.` 6곳(`seed`·`wiggle`·`confSeq`·`strokeLine`·`pcal`·`endDeco`)을 `MSPredDraw.` 로 바꾼다.

`mobile/www/chart-legend.js` 의 머리(5~9줄):

```js
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports)
    module.exports = factory(require("./strings.js"), require("./draw-preds.js"));
  else MSGlobals.define("MSLegend", factory(root.MSStr, root.MSPredDraw));
})(typeof self !== "undefined" ? self : this, function (Str, Preds) {
```

기록 쪽 소비자는 `MSPreds` → `MSPredLog` 로 바꾼다:
- `screens/record.js` — `hitRate`·`MIN_N`(3곳)
- `screens/watchlist.js` — `typeof` 가드 2곳 · `pending`·`judge`·`recent`·`hitRate`·`MIN_N`
- `screens/report.js` — `pending`·`make`·`judge`

- [ ] **Step 5: 나머지 모듈의 전역 등록을 `define` 으로 바꾼다**

`www/*.js` 와 `www/screens/*.js` 에서 `else root.MSXxx = factory(...);` 형태를 전부
`else MSGlobals.define("MSXxx", factory(...));` 로 바꾼다. 기계적 치환이며 노드 분기는 손대지 않는다.
`vendor/` 는 생성물이므로 제외한다(`sync-engine.mjs` 가 만든다).

- [ ] **Step 6: `index.html` 최선두에 `globals.js` 를 싣는다**

`<script src="vendor/forge-core.js"></script>` **위**에 넣는다:

```html
<!-- 전역 이름 단일 출처. 반드시 첫 스크립트여야 한다 — 뒤 모듈이 전부 MSGlobals.define 을 부른다. -->
<script src="globals.js"></script>
```

- [ ] **Step 7: 테스트 통과를 확인한다**

Run: `cd mobile && node --test test/globals.test.mjs`
Expected: PASS (5건)

- [ ] **Step 8: 전량 관문**

Run: `cd .. && ./tests/run.sh`
Expected: 전체 통과. 실패하면 `MSPreds` 를 참조하던 기존 테스트(`draw-preds.test.mjs`·`chart-draw.test.mjs`)의 이름도 함께 갱신한다.

- [ ] **Step 9: 커밋**

```bash
git add mobile/www mobile/test/globals.test.mjs
git commit -m "$(cat <<'EOF'
fix(mobile): 전역 이름 충돌로 리포트가 100% 죽어 있었다 — MSPreds 를 둘로 가른다

draw-preds.js(예측선 작도)와 predictions.js(예측 기록)가 둘 다 전역 MSPreds 를
등록했다. chart-draw.js 는 UMD 라 **로드 시점에** 전역을 캡처하는데, index.html
순서상 그때 MSPreds 는 이미 기록 모듈이었다 — drawCone() 이 부르는 seed 가 없어
종목·티어와 무관하게 리포트가 죽었다. 8/17 APK 에 그대로 들어 있던 결함이다.

관문 1505건이 못 본 이유가 핵심이다: 노드 테스트는 모듈마다 require 로 독립
객체를 받아 브라우저 전역 하나를 두 파일이 다투는 사고를 원리적으로 못 본다.
그래서 이름을 가르는 것으로 끝내지 않고 globals.js 를 둔다 — 중복 등록이면
그 자리에서 던진다. 조용히 덮이는 것보다 시끄럽게 죽는 편이 낫다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 브라우저 관문

모듈 테스트가 원리적으로 못 보는 것을 보는 관문. 이번 실패의 재발을 막는 유일한 장치다.

**Files:**
- Create: `mobile/tools/gate-browser.mjs`
- Create: `mobile/tools/gate-routes.mjs` (라우트별 프로브 정의 — 화면이 늘면 여기만 는다)
- Modify: `tests/run.sh` (스코프 `browser` 추가)
- Modify: `mobile/.gitignore` 또는 저장소 `.gitignore` (`mobile/tools/.gate/` 제외)

**Interfaces:**
- Consumes: Task 1 의 `MSGlobals`(중복 등록이 콘솔 오류로 드러난다)
- Produces: `node mobile/tools/gate-browser.mjs [라우트명...]` → 종료코드 0/1, `mobile/docs/rebuild/shots/app-<라우트>.png` 갱신
- Produces: `gate-routes.mjs` 의 `ROUTES` 배열 — `{ name, seed, go, assert }`

- [ ] **Step 1: 라우트 정의 파일을 쓴다**

`mobile/tools/gate-routes.mjs`:

```js
// 관문이 열어볼 화면 목록. 화면이 늘면 여기에 한 줄 는다.
// seed: localStorage 에 심을 상태 / go: 부팅 후 이동 / assert: 페이지 안에서 돌 단언(문자열)
//
// 상태를 심는 이유: 이 앱의 화면 대부분이 상태 의존적이라, 상태 없이 열면 "아무것도 안 바뀐
// 앱"만 보게 된다(2026-08-17 사고). 관문은 그 상태를 스스로 만든다.
const WL = [{ sym: "AAPL", name: "애플" }, { sym: "NVDA", name: "엔비디아" }, { sym: "TSLA", name: "테슬라" }];
const ON = {
  ms_onboarded: true,
  ms_consent: { termsVersion: "2026-08-17", at: "2026-08-16T00:00:00Z" },
  ms_watchlist: WL
};
const PREDS = [
  { sym: "AAPL", name: "애플", tier: "full", asOf: "2026-08-14", base: 233.0, mid: 234.2,
    lo: 233.1, hi: 235.3, basicLo: 232.0, basicHi: 236.0, judgedOn: "2026-08-15",
    hit: true, miss: 0, actual: 233.9, basicHit: true, narrowedAndMissed: false, seen: false },
  { sym: "TSLA", name: "테슬라", tier: "full", asOf: "2026-08-14", base: 244.0, mid: 245.2,
    lo: 244.0, hi: 246.4, basicLo: 242.0, basicHi: 250.0, judgedOn: "2026-08-15",
    hit: false, miss: 0.4, actual: 246.8, basicHit: true, narrowedAndMissed: true, seen: false }
];

export const ROUTES = [
  { name: "onboarding", seed: {}, go: null,
    assert: "document.querySelectorAll('button, [role=button]').length > 0" },
  { name: "watchlist", seed: { ...ON, ms_preds: PREDS }, go: null,
    assert: "document.querySelectorAll('[data-sym]').length === 3" },
  { name: "report", seed: { ...ON, ms_preds: PREDS }, go: '"report",{sym:"AAPL"}', delay: 1200,
    assert: "!/불러오지 못했습니다/.test(document.body.textContent)" },
  { name: "wallet", seed: ON, go: '"wallet"',
    assert: "document.body.textContent.indexOf('스쿱') >= 0" },
  { name: "record", seed: { ...ON, ms_preds: PREDS }, go: '"record"',
    assert: "document.body.textContent.length > 50" },
  { name: "result", seed: { ...ON, ms_preds: PREDS }, go: '"result",{sym:"TSLA",asOf:"2026-08-14"}',
    assert: "document.body.textContent.length > 50" }
];
```

- [ ] **Step 2: 관문을 쓴다**

`mobile/tools/gate-browser.mjs`. 핵심 계약 넷: ①포트 좀비 확인 ②콘솔 오류 0 ③단언 통과 ④스크린샷 갱신.

```js
#!/usr/bin/env node
// 브라우저 관문 — 화면을 실제로 열어본다.
//
// 왜 필요한가: 노드 테스트는 모듈을 require 로 각각 독립 객체로 받는다. 브라우저 전역
// 하나를 두 파일이 다투는 사고(2026-08-18 MSPreds)를 원리적으로 못 본다. 1505건이 초록인
// 채로 앱의 본체가 죽어 있었다. 이 관문이 그 구멍이다.
//
// 의존성 0 — 이미 있는 크로미움 바이너리를 CLI 로 몬다(저장소 규율: 빌드 도구 없음).
// 한 번의 실행에서 셋을 얻는다: 콘솔 로그(stderr) · 단언 결과(document.title) · 스크린샷.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import https from "node:https";
import { ROUTES } from "./gate-routes.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));      // mobile/
const WWW = path.join(ROOT, "www");
const OUT = path.join(ROOT, "docs/rebuild/shots");
const WORK = path.join(ROOT, "tools/.gate");
const PORT = 8943;
const HOST = "parksvc.mycafe24.com";
const CHROME = path.join(process.env.HOME, ".cache/ms-playwright/chromium-1228/chrome-linux64/chrome");

// ── ① 포트 좀비 확인 ─────────────────────────────────────────────────────────
// 2026-08-18 대조에서 전날 세션의 서버가 포트를 잡고 있어 새 mock 이 한 번도 안 떴다.
// 조용히 옛 결과를 보게 되는 종류의 사고라, 관문은 이걸 먼저 확인하고 죽는다.
function assertPortFree() {
  const r = spawnSync("ss", ["-lntp"], { encoding: "utf8" });
  if (r.status !== 0) return;                       // ss 가 없으면 통과(치명적이지 않다)
  const line = (r.stdout || "").split("\n").find(l => l.includes(":" + PORT + " "));
  if (line) {
    console.error("포트 " + PORT + " 가 이미 점유돼 있다 — 옛 서버의 결과를 보게 된다:\n  " + line.trim());
    process.exit(1);
  }
}

// ── 자체서명 인증서(캐시) ────────────────────────────────────────────────────
// https 여야 하는 이유: app.js 가 개발 스킴(http:/file:)에서 지갑 설치를 거부한다.
function ensureCert() {
  mkdirSync(WORK, { recursive: true });
  const key = path.join(WORK, "key.pem"), crt = path.join(WORK, "cert.pem");
  if (!existsSync(key) || !existsSync(crt)) {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", crt,
      "-days", "30", "-nodes", "-subj", "/CN=" + HOST], { stdio: "ignore" });
  }
  return { key: readFileSync(key), cert: readFileSync(crt) };
}

// ── 합성 OHLC · 지갑 mock ────────────────────────────────────────────────────
// 실서버를 부르지 않는다. 관문이 네트워크에 의존하면 관문이 아니라 날씨가 된다.
function candles() {
  const out = [], day = new Date("2026-08-17T00:00:00Z");
  for (let i = 0; i < 360; i++) {
    const v = 200 + i * 0.12 + Math.sin(i / 11) * 6 + Math.sin(i / 37) * 14;
    const t = new Date(day.getTime() - (359 - i) * 86400000).toISOString().slice(0, 10);
    out.push({ t, o: +(v - 1).toFixed(2), h: +(v + 1.8).toFixed(2), l: +(v - 1.6).toFixed(2),
               c: +v.toFixed(2), v: 1000000 + (i % 23) * 40000 });
  }
  return out;
}
const STATE = { balance: 9, cap: 20, streak: 3, checkedIn: true, today: "2026-08-17" };
const WALLET = {
  hello: { ok: true, token: "t", accountId: "a1", state: STATE },
  get: { ok: true, state: STATE },
  spend: { ok: true, state: STATE, charged: false },
  checkin: { ok: true, state: STATE, granted: 1, capped: false },
  adConfig: { ok: true, quick: { unitId: "q", reward: 1, secs: 15 },
              full: { unitId: "f", reward: 3, secs: 30 }, customData: "cd" },
  adState: { ok: true, remaining: 6, nextAt: null }
};

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png" };

function serve(creds) {
  return https.createServer(creds, (req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", d => { body += d; });
      req.on("end", () => {
        let op = "";
        try { op = JSON.parse(body || "{}").op || ""; } catch (e) {}
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(WALLET[op] || { ok: true }));
      });
      return;
    }
    const url = decodeURIComponent(req.url.split("?")[0]);
    if (url === "/map/forge-api.php") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, tf: "1day", symbol: "AAPL", candles: candles() }));
      return;
    }
    const file = path.join(WWW, url.replace(/^\/+/, ""));
    if (!file.startsWith(WWW) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
}

// ── 프로브 페이지 ────────────────────────────────────────────────────────────
// 상태를 심고 → 라우트로 이동 → 단언을 돌려 document.title 에 GATE:{json} 으로 적는다.
function probe(route) {
  const base = readFileSync(path.join(WWW, "index.html"), "utf8");
  const TAG = '<script src="app.js"></script>';
  let js = "<script>try{localStorage.clear();";
  for (const [k, v] of Object.entries(route.seed || {})) {
    js += "localStorage.setItem(" + JSON.stringify(k) + "," + JSON.stringify(JSON.stringify(v)) + ");";
  }
  js += "}catch(e){}</script>\n" + TAG;
  if (route.go) js += '\n<script>setTimeout(function(){try{MSApp.go(' + route.go + ');}catch(e){console.error("GO_FAILED",e);}},400);</script>';
  js += '\n<script>setTimeout(function(){var ok=false,err="";' +
        'try{ok=!!(' + route.assert + ');}catch(e){err=String(e);}' +
        'document.title="GATE:"+JSON.stringify({ok:ok,err:err});},' + (route.delay || 1500) + ');</script>';
  const name = "__gate_" + route.name + ".html";
  writeFileSync(path.join(WWW, name), base.replace(TAG, js));
  return name;
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
function shoot(route, page) {
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--ignore-certificate-errors",
    "--host-resolver-rules=MAP " + HOST + ":443 127.0.0.1:" + PORT + ", MAP * 127.0.0.1:1, EXCLUDE 127.0.0.1",
    "--enable-logging=stderr", "--v=0", "--window-size=390,1000",
    "--screenshot=" + path.join(OUT, "app-" + route.name + ".png"),
    "--dump-dom", "--virtual-time-budget=20000",
    "https://" + HOST + "/" + page];
  const r = spawnSync(CHROME, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { dom: r.stdout || "", log: r.stderr || "" };
}

function judge(route, res) {
  const problems = [];
  // ② 콘솔 오류 0 — 전역 중복 등록(globals.js throw)도 여기로 떨어진다
  for (const line of res.log.split("\n")) {
    if (!/CONSOLE|Uncaught/.test(line)) continue;
    if (/ERROR:CONSOLE|SEVERE|Uncaught/.test(line)) problems.push("콘솔 오류: " + line.trim());
  }
  // ③ 단언
  const m = res.dom.match(/<title>GATE:(.*?)<\/title>/);
  if (!m) problems.push("단언이 실행되지 않았다(title 없음) — 화면이 그려지기 전에 죽었을 수 있다");
  else {
    let v = {};
    try { v = JSON.parse(m[1].replace(/&quot;/g, '"')); } catch (e) { problems.push("단언 결과 파싱 실패"); }
    if (!v.ok) problems.push("단언 실패: " + route.assert + (v.err ? " (" + v.err + ")" : ""));
  }
  return problems;
}

assertPortFree();
mkdirSync(OUT, { recursive: true });
const creds = ensureCert();
const server = serve(creds);
await new Promise(r => server.listen(PORT, "127.0.0.1", r));

const only = process.argv.slice(2);
const routes = only.length ? ROUTES.filter(r => only.includes(r.name)) : ROUTES;
let failed = 0;
for (const route of routes) {
  const page = probe(route);
  const problems = judge(route, shoot(route, page));
  rmSync(path.join(WWW, page), { force: true });
  if (problems.length) { failed++; console.log("✗ " + route.name); problems.forEach(p => console.log("    " + p)); }
  else console.log("✓ " + route.name);
}
server.close();
console.log(failed ? "\n브라우저 관문 실패 " + failed + "건" : "\n브라우저 관문 " + routes.length + "건 통과");
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: 관문을 돌려 Task 1 의 수정을 증명한다**

Run: `cd mobile && node tools/gate-browser.mjs`
Expected: 6건 통과. **특히 `report` 가 통과해야 한다** — Task 1 이전이면 `단언 실패: !/불러오지 못했습니다/` 로 빨갛다.

- [ ] **Step 4: 관문이 실제로 잡는지 변이로 증명한다**

`www/chart-draw.js` 의 `MSPredDraw` 를 일부러 `MSPredLog` 로 바꾸고 관문을 돌린다.

Run: `node tools/gate-browser.mjs report`
Expected: FAIL — 콘솔 오류(`seed is not a function`) + 단언 실패. **확인한 뒤 반드시 되돌린다.**

- [ ] **Step 5: `tests/run.sh` 에 스코프를 더한다**

`map/tests/run.sh` 의 mobile 블록 아래에 붙인다:

```bash
if [ "$SCOPE" = "browser" ]; then
  if [ -x "$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome" ]; then
    run_suite "browser-gate" "$ROOT/mobile" node tools/gate-browser.mjs
  else
    printf '── %-22s 건너뜀 (크로미움 없음)\n' "browser-gate"
  fi
fi
```

`all` 에 넣지 않는다 — 크로미움이 없는 환경에서 전량 관문이 통째로 실패하면 안 되고, 실행이 느리다. 대신 **P0 이후 모든 태스크의 완료 조건**으로 계획서가 명시한다(`wallet concurrency` 와 같은 취급).

- [ ] **Step 6: 커밋**

```bash
git add mobile/tools/gate-browser.mjs mobile/tools/gate-routes.mjs tests/run.sh .gitignore
git commit -m "$(cat <<'EOF'
test(mobile): 브라우저 관문 — 화면을 실제로 열어본다

1505건이 초록인 채로 앱의 본체가 죽어 있었던 이유는 하나다. 노드 테스트는 모듈을
require 로 각각 독립 객체로 받아, 브라우저 전역 하나를 두 파일이 다투는 사고를
원리적으로 못 본다. 그 구멍을 메우는 관문이다.

한 번의 크로미움 실행에서 셋을 얻는다 — 콘솔 로그(stderr) · 단언 결과(title) ·
스크린샷. 실패 판정은 콘솔 오류 하나라도 있으면, 단언이 false 면, 단언이 아예
실행되지 못했으면(화면이 그려지기 전에 죽은 경우).

포트 점유를 먼저 확인하고 죽는다 — 8/18 대조에서 전날 세션 서버가 포트를 잡고
있어 새 mock 이 한 번도 안 떴고, 조용히 옛 결과를 보고 있었다.

변이로 증명했다: chart-draw 의 MSPredDraw 를 MSPredLog 로 바꾸면 report 라우트가
콘솔 오류와 단언 실패로 빨갛게 된다. 원복 확인.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 라우터 — 화면 레지스트리 · 탭별 스택

**Files:**
- Create: `mobile/www/router.js`
- Create: `mobile/test/router.test.mjs`

**Interfaces:**
- Consumes: `MSGlobals.define`(Task 1)
- Produces: `MSRouter.create(opts) → router`
  - `register({ id, tab, render })` — `tab` 은 `"list"|"analysis"|"scoop"`
  - `go(id, params)` → `void` (해당 탭으로 전환 + 그 탭 스택에 push)
  - `replace(id, params)` → `void` (스택 top 을 교체)
  - `back()` → `boolean` (처리했으면 true, 앱을 닫아야 하면 false)
  - `switchTab(tab)` → `void`
  - `current()` → `{ id, params, tab }`
  - `stackOf(tab)` → `[{ id, params }]` (진단·테스트용)
  - `opts.onRender(entry)` — 그릴 때마다 호출. DOM 은 셸이 맡는다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/router.test.mjs`:

```js
// 라우터는 DOM 을 모른다 — 그래야 값으로 잴 수 있다. DOM 조립은 shell.js 담당.
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSRouter = require("../www/router.js");

function mk() {
  const rendered = [];
  const r = MSRouter.create({ onRender: e => rendered.push(e.id) });
  r.register({ id: "watchlist", tab: "list", render: function () {} });
  r.register({ id: "report", tab: "analysis", render: function () {} });
  r.register({ id: "readings", tab: "analysis", render: function () {} });
  r.register({ id: "wallet", tab: "scoop", render: function () {} });
  r.register({ id: "record", tab: "scoop", render: function () {} });
  return { r, rendered };
}

test("go 는 화면이 속한 탭으로 전환하고 그 탭 스택에 쌓는다", () => {
  const { r } = mk();
  r.go("watchlist");
  r.go("report", { sym: "AAPL" });
  assert.deepStrictEqual(r.current(), { id: "report", params: { sym: "AAPL" }, tab: "analysis" });
  assert.deepStrictEqual(r.stackOf("analysis").map(e => e.id), ["report"]);
  assert.deepStrictEqual(r.stackOf("list").map(e => e.id), ["watchlist"]);
});

test("탭 전환은 스택을 버리지 않는다 — 돌아오면 보던 화면이 그대로다", () => {
  const { r } = mk();
  r.go("watchlist");
  r.go("report", { sym: "AAPL" });
  r.go("readings");
  r.switchTab("list");
  assert.strictEqual(r.current().id, "watchlist");
  r.switchTab("analysis");
  assert.strictEqual(r.current().id, "readings", "탭으로 돌아왔더니 스택이 초기화됐다");
});

test("back 은 현재 탭 스택만 판다", () => {
  const { r } = mk();
  r.go("report", { sym: "AAPL" });
  r.go("readings");
  assert.strictEqual(r.back(), true);
  assert.strictEqual(r.current().id, "report");
});

test("탭 루트에서의 back — 목록 탭이 아니면 목록 탭으로, 목록 탭이면 false(앱 종료)", () => {
  const { r } = mk();
  r.go("watchlist");
  r.go("wallet");
  assert.strictEqual(r.back(), true, "지갑 루트에서 back 이 앱을 닫으려 했다");
  assert.strictEqual(r.current().tab, "list");
  assert.strictEqual(r.back(), false, "목록 루트의 back 은 앱에 넘겨야 한다");
});

test("같은 화면을 연달아 go 하면 쌓지 않고 교체한다 — 뒤로가기가 같은 화면을 반복하지 않게", () => {
  const { r } = mk();
  r.go("report", { sym: "AAPL" });
  r.go("report", { sym: "NVDA" });
  assert.deepStrictEqual(r.stackOf("analysis").map(e => e.params.sym), ["NVDA"]);
});

test("등록되지 않은 화면으로 가면 던진다 — 오타가 조용히 빈 화면이 되지 않게", () => {
  const { r } = mk();
  assert.throws(() => r.go("reprot"), /등록되지 않은/);
});

test("onRender 는 그릴 때마다 정확히 한 번 불린다", () => {
  const { r, rendered } = mk();
  r.go("watchlist");
  r.go("report", { sym: "AAPL" });
  r.switchTab("list");
  r.back();
  assert.deepStrictEqual(rendered, ["watchlist", "report", "watchlist", "watchlist"]);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd mobile && node --test test/router.test.mjs`
Expected: FAIL — `Cannot find module '../www/router.js'`

- [ ] **Step 3: 라우터를 구현한다**

`mobile/www/router.js`:

```js
// 네비게이션 상태기계. DOM 을 모른다 — 그래야 노드에서 값으로 잴 수 있고, 2단·3단 레이아웃이
// 들어와도 여기는 안 바뀐다(설계 §5). DOM 조립은 shell.js.
//
// 탭마다 독립 스택을 두는 이유: 시안의 탭 3개는 서로 다른 볼일이다. 지갑에 들렀다 목록으로
// 돌아왔을 때 보던 리포트가 사라지면, 사용자는 자기가 어디 있었는지를 매번 다시 만들어야 한다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSRouter", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TABS = ["list", "analysis", "scoop"];
  var HOME = "list";

  function create(opts) {
    var o = opts || {};
    var screens = {};
    var stacks = { list: [], analysis: [], scoop: [] };
    var tab = HOME;

    function register(s) {
      if (!s || !s.id) throw new Error("화면 등록에 id 가 없다");
      if (TABS.indexOf(s.tab) < 0) throw new Error("모르는 탭: " + s.tab);
      if (screens[s.id]) throw new Error("화면 id 중복: " + s.id);
      screens[s.id] = s;
      return s;
    }

    function entryOf(id, params) {
      var s = screens[id];
      if (!s) throw new Error("등록되지 않은 화면: " + id);
      return { id: id, params: params || {}, tab: s.tab, screen: s };
    }

    function top() {
      var st = stacks[tab];
      return st.length ? st[st.length - 1] : null;
    }

    function draw() {
      var e = top();
      if (e && o.onRender) o.onRender(e);
    }

    function go(id, params) {
      var e = entryOf(id, params);
      tab = e.tab;
      var st = stacks[tab];
      // 같은 화면을 연달아 부르면 쌓지 않고 교체한다 — 종목을 갈아타며 리포트를 열 때
      // 스택에 같은 화면이 열 개 쌓이면 뒤로가기가 같은 화면을 반복하게 된다.
      if (st.length && st[st.length - 1].id === id) st[st.length - 1] = e;
      else st.push(e);
      draw();
    }

    function replace(id, params) {
      var e = entryOf(id, params);
      tab = e.tab;
      var st = stacks[tab];
      if (st.length) st[st.length - 1] = e; else st.push(e);
      draw();
    }

    function switchTab(t) {
      if (TABS.indexOf(t) < 0) throw new Error("모르는 탭: " + t);
      tab = t;
      draw();
    }

    // 반환값은 "우리가 처리했는가"다. false 면 호출자(안드로이드 백 버튼)가 앱을 닫는다.
    function back() {
      var st = stacks[tab];
      if (st.length > 1) { st.pop(); draw(); return true; }
      if (tab !== HOME) { tab = HOME; draw(); return true; }
      return false;
    }

    function current() {
      var e = top();
      return e ? { id: e.id, params: e.params, tab: e.tab } : null;
    }

    function stackOf(t) {
      return (stacks[t] || []).map(function (e) { return { id: e.id, params: e.params }; });
    }

    return { register: register, go: go, replace: replace, switchTab: switchTab,
             back: back, current: current, stackOf: stackOf, tab: function () { return tab; } };
  }

  return { create: create, TABS: TABS, HOME: HOME };
});
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `cd mobile && node --test test/router.test.mjs`
Expected: PASS (7건)

- [ ] **Step 5: 커밋**

```bash
git add mobile/www/router.js mobile/test/router.test.mjs
git commit -m "$(cat <<'EOF'
feat(mobile): 라우터 — 화면 레지스트리와 탭별 스택

지금 셸은 if (state.showing === ...) 사슬이라 화면을 더하는 일이 분기를 더하는
일이었고, 그래서 개편으로 만든 화면들이 갈 곳 없이 남았다(마지막 커밋이 지갑에
임시 통로를 뚫은 것이 그 증상이다).

DOM 을 모르는 상태기계로 뽑는다 — 노드에서 값으로 재고, 폴드 2단·태블릿 3단이
들어와도 여기는 안 바뀐다. 탭마다 독립 스택을 두는 것은 시안의 탭 3개가 서로
다른 볼일이기 때문이다. 지갑에 들렀다 돌아왔을 때 보던 리포트가 사라지면
사용자가 자기 위치를 매번 다시 만들어야 한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 셸 + 하단 탭바

시안 14a 의 실측값을 그대로 쓴다. **탭바가 없다는 것이 이번 감사에서 드러난 가장 큰 구조 결손이다.**

**Files:**
- Create: `mobile/www/shell.js` · `mobile/www/style-shell.css`
- Create: `mobile/test/shell.test.mjs`
- Modify: `mobile/www/app.js` (부팅만 남기고 셸/라우터로 넘긴다)
- Modify: `mobile/www/index.html` (`router.js`·`shell.js` 스크립트 · `style-shell.css` 링크)
- Modify: `mobile/tools/gate-routes.mjs` (탭바 단언 추가)

**Interfaces:**
- Consumes: `MSRouter.create/register/go/back/switchTab/current`(Task 3)
- Produces: `MSShell.mount(rootEl) → void` · `MSShell.router() → router` · 전역 `MSApp.go(route, params)`(기존 호출부 호환 유지)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/shell.test.mjs`:

```js
// 탭바는 시안 14a 의 실측값을 그대로 쓴다. 값이 흔들리면 "개편했는데 그대로"가 된다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { allCss, cssFiles } from "./_css.mjs";

const SRC = readFileSync(new URL("../www/shell.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../www/style-shell.css", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");

test("탭은 셋이고 순서가 시안과 같다 — 목록 · 분석 · 스쿱", () => {
  const ids = [...SRC.matchAll(/tab:\s*"(list|analysis|scoop)"/g)].map(m => m[1]);
  assert.deepStrictEqual(ids.slice(0, 3), ["list", "analysis", "scoop"]);
});

test("탭 높이 46 · 컨테이너 라운드 999 · 배경 #11151d (시안 14a 실측)", () => {
  assert.match(CSS, /\.ms-tabbar\b[^}]*background:\s*#11151d/s, "탭바 배경이 시안 값이 아니다");
  assert.match(CSS, /\.ms-tab\b[^}]*height:\s*46px/s, "탭 높이가 46 이 아니다");
  assert.match(CSS, /\.ms-tabbar\b[^}]*border-radius:\s*999px/s);
});

test("터치 대상 44px 하한을 지킨다", () => {
  const m = CSS.match(/\.ms-tab\b[^}]*height:\s*(\d+)px/s);
  assert.ok(m && Number(m[1]) >= 44, "탭 높이가 44 미만이다");
});

test("좌측 세로 accent 라인 금지 — 활성은 배경으로만 말한다", () => {
  assert.ok(!/border-left:\s*[2-9]/.test(CSS), "좌측 컬러 라인이 들어왔다");
  assert.match(CSS, /\.ms-tab\.is-on\b[^}]*background:/s, "활성 탭을 배경으로 표시하지 않는다");
});

test("스쿱 탭 배지는 받을 것이 있을 때만 켜진다", () => {
  assert.match(SRC, /badge/, "배지 로직이 없다");
  assert.ok(!/\.ms-tab-badge[^}]*display:\s*block/.test(CSS.replace(/\.is-on[^}]*}/g, "")),
    "배지가 상시 노출이다 — 켜는 조건이 있어야 한다");
});

test("index.html 은 라우터·셸을 app.js 보다 먼저 싣는다", () => {
  const s = [...HTML.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(s.indexOf("router.js") < s.indexOf("shell.js"), "셸이 라우터보다 먼저 온다");
  assert.ok(s.indexOf("shell.js") < s.indexOf("app.js"), "app.js 가 셸보다 먼저 온다");
});

test("style-shell.css 가 캐스케이드에 들어 있다", () => {
  assert.ok(cssFiles().includes("style-shell.css"), "index.html 이 style-shell.css 를 링크하지 않는다");
  assert.match(allCss(), /\.ms-tabbar/);
});

test("app.js 는 화면 분기를 갖지 않는다 — 부팅만 한다", () => {
  const app = readFileSync(new URL("../www/app.js", import.meta.url), "utf8");
  assert.ok(!/state\.showing/.test(app), "app.js 에 옛 화면 분기가 남아 있다");
  assert.match(app, /MSShell\.mount/, "app.js 가 셸을 띄우지 않는다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd mobile && node --test test/shell.test.mjs`
Expected: FAIL — `shell.js`·`style-shell.css` 없음(ENOENT)

- [ ] **Step 3: `style-shell.css` 를 쓴다 (시안 14a 실측값)**

```css
/* 셸 — 하단 탭바 + 화면 컨테이너. 값은 전부 시안 14a 실물에서 잰 것이다.
   탭바가 없던 것이 2026-08-18 감사에서 드러난 가장 큰 구조 결손이다: 앱의 뼈대가
   개편 이전 그대로라 만든 화면들이 갈 곳이 없었다. */
.ms-screen { padding-bottom: 96px; }        /* 탭바(46+12) + 홈 인디케이터(22) + 여유 */

.ms-tabbar-wrap {
  position: fixed; left: 0; right: 0; bottom: 0;
  padding: 16px 20px calc(14px + env(safe-area-inset-bottom));
  background: var(--bg);
}
.ms-tabbar {
  display: flex; gap: 4px; padding: 6px;
  border-radius: 999px; background: #11151d;
}
.ms-tab {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
  height: 46px; border-radius: 999px; position: relative;
  border: 0; background: transparent; cursor: pointer;
  font: 600 13px/1 Pretendard, sans-serif; color: var(--ink-4);
  letter-spacing: -0.01em;
}
.ms-tab.is-on { background: rgba(238, 241, 247, .07); color: var(--ink); font-weight: 700; }
.ms-tab svg { stroke: currentColor; }
/* 배지 — 받을 것이 있을 때만 붙인다(요소 자체를 안 만든다). */
.ms-tab-badge {
  position: absolute; top: 9px; left: 24px;
  width: 7px; height: 7px; border-radius: 999px;
  background: var(--gold); border: 2px solid #11151d;
}
```

- [ ] **Step 4: `shell.js` 를 쓴다**

```js
// DOM 조립 — 하단 탭바 + 화면 컨테이너. 네비게이션 판단은 router.js 가 한다.
// 아이콘 path 는 시안 14a 실물에서 옮긴 것이다(목록=선 3개 / 분석=막대 4개 / 스쿱=마크).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSShell", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TAB_DEFS = [
    { tab: "list", home: "watchlist", label: "wlTabList",
      icon: '<path d="M2.5 4.2h12M2.5 8.5h12M2.5 12.8h7.5"/>' },
    { tab: "analysis", home: "report", label: "wlTabAnalysis",
      icon: '<path d="M2.2 13.4V8.6M6.4 13.4V3.4M10.6 13.4V10.4M14.8 13.4V6"/>' },
    { tab: "scoop", home: "wallet", label: "wlTabScoop", mark: true }
  ];

  var router = null, screenEl = null, barEl = null, badge = false;

  function tabIcon(def) {
    if (def.mark) return MSUi.scoopMark(42);
    return '<svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" ' +
           'stroke-width="1.7" stroke-linecap="round" aria-hidden="true">' + def.icon + '</svg>';
  }

  function drawBar() {
    if (!barEl) return;
    barEl.innerHTML = "";
    var cur = router.tab();
    TAB_DEFS.forEach(function (def) {
      var b = MSUi.el("button", "ms-tab" + (def.tab === cur ? " is-on" : ""));
      b.type = "button";
      b.setAttribute("data-tab", def.tab);
      b.innerHTML = tabIcon(def) + '<span>' + MSStr.t[def.label] + '</span>';
      // 배지는 받을 것이 있을 때만 요소를 만든다 — 숨김 처리로 두면 "왜 안 보이나"가
      // CSS 문제인지 상태 문제인지 구분이 안 된다.
      if (def.tab === "scoop" && badge) b.appendChild(MSUi.el("span", "ms-tab-badge"));
      b.addEventListener("click", function () { onTab(def); });
      barEl.appendChild(b);
    });
  }

  function onTab(def) {
    // 이미 그 탭이면 그 탭의 홈으로 되돌린다(스택을 비운다) — 목록 깊이 들어갔다가
    // 같은 탭을 다시 눌렀을 때 "처음으로"가 되는 것은 널리 학습된 동작이다.
    if (router.tab() === def.tab) router.go(def.home);
    else router.switchTab(def.tab);
  }

  function render(entry) {
    screenEl.innerHTML = "";
    screenEl.scrollTop = 0;
    entry.screen.render(screenEl, entry.params);
    drawBar();
  }

  function mount(rootEl, screens) {
    router = MSRouter.create({ onRender: render });
    screens.forEach(function (s) { router.register(s); });

    rootEl.innerHTML = "";
    screenEl = MSUi.el("div", "ms-screen");
    var wrap = MSUi.el("div", "ms-tabbar-wrap");
    barEl = MSUi.el("div", "ms-tabbar");
    wrap.appendChild(barEl);
    rootEl.appendChild(screenEl);
    rootEl.appendChild(wrap);

    // 안드로이드 하드웨어 백. 라우터가 false 를 주면 앱에 넘긴다(종료).
    document.addEventListener("backbutton", function () {
      if (!router.back() && root.navigator && root.navigator.app) root.navigator.app.exitApp();
    });
    return router;
  }

  function setBadge(on) { badge = !!on; drawBar(); }

  return { mount: mount, setBadge: setBadge, router: function () { return router; } };
});
```

- [ ] **Step 5: `app.js` 를 부팅만 남기고 재작성한다**

기존 `renderShell`·`renderReportPane`·`go` 분기를 전부 걷어내고, 화면 등록 + 셸 기동만 남긴다. 2단(`MSLayout`) 처리는 **P5 로 미룬다** — 지금은 단일 열만 그린다(설계 §6, P5 부가층).

```js
// 부팅만 한다. 화면 분기는 router.js, DOM 조립은 shell.js.
(function () {
  "use strict";

  var SCREENS = [
    { id: "watchlist", tab: "list",     render: function (el) { MSWatchlist.render(el); } },
    { id: "report",    tab: "analysis", render: function (el, p) { MSReport.render(el, { sym: p.sym || MSStore.getLastSym() }); } },
    { id: "readings",  tab: "analysis", render: function (el, p) { MSReadingsList.render(el, p); } },
    { id: "expert",    tab: "analysis", render: function (el, p) { MSExpert.render(el, p); } },
    { id: "wallet",    tab: "scoop",    render: function (el) { MSWalletScreen.render(el); } },
    { id: "record",    tab: "scoop",    render: function (el) { MSRecord.render(el); } },
    { id: "result",    tab: "list",     render: function (el, p) { MSResult.render(el, { sym: p.sym, asOf: p.asOf }); } },
    { id: "scanresult",tab: "list",     render: function (el) { MSScanResult.render(el); } }
  ];

  var router = null;

  // 기존 화면들이 MSApp.go("report", {sym}) 로 부른다 — 그 계약을 유지한다.
  // 라우트 이름이 곧 화면 id 라 변환이 필요 없다.
  window.MSApp = {
    go: function (route, params) {
      if (route === "report" && params && params.sym) MSStore.setLastSym(String(params.sym).toUpperCase());
      router.go(route, params || {});
    },
    current: function () { return router.current(); },
    back: function () { return router.back(); }
  };

  document.addEventListener("DOMContentLoaded", function () {
    var rootEl = document.getElementById("app");
    if (typeof ForgeCore === "undefined") {
      rootEl.innerHTML = "<p class='empty'>" + MSStr.t.bootVendorMissing + "</p>";
      return;
    }

    // 개발 스킴(http:·file:)에서는 운영 지갑을 설치하지 않는다 — www/ 를 로컬에서 한 번
    // 열어본 것만으로 운영 서버에 진짜 계정이 생겼던 사고가 있었다. 거부 목록으로 판정하는
    // 이유는 iOS 의 capacitor:// 같은 새 스킴을 허용 목록이 조용히 꺼뜨리기 때문이다.
    var devHost = (location.protocol === "http:" || location.protocol === "file:");
    if (!devHost && typeof MSWalletHttp !== "undefined" && !MSWallet.isInstalled()) {
      MSWallet.install(MSWalletHttp.create({ url: "https://parksvc.mycafe24.com/map/wallet-api.php" }));
    }

    if (!MSStore.onboarded()) {
      MSOnboarding.render(rootEl, { onDone: function () { boot(rootEl); } });
      return;
    }
    boot(rootEl);
  });

  function boot(rootEl) {
    router = MSShell.mount(rootEl, SCREENS);
    router.go("watchlist");
  }
})();
```

- [ ] **Step 6: `index.html` · `strings.js` 를 갱신한다**

`index.html` — `<link rel="stylesheet" href="style-shell.css">` 를 `style-base.css` 바로 뒤에 넣고, 스크립트에 `router.js`·`shell.js` 를 `app.js` **앞**에 넣는다.

`strings.js` 에 탭 라벨 3개를 더한다:

```js
wlTabList: "목록",
wlTabAnalysis: "분석",
wlTabScoop: "스쿱",
```

- [ ] **Step 7: 테스트와 관문을 돌린다**

Run: `cd mobile && node --test test/shell.test.mjs && cd .. && ./tests/run.sh`
Expected: PASS 전량. 옛 `app.test.mjs` 는 `state.showing` 기반 단언이 있으므로 새 계약(부팅·지갑 설치 판정)에 맞춰 갱신한다 — **지갑 설치 스킴 판정 테스트는 반드시 남긴다**(그 방어가 사라지면 로컬에서 화면 한 번 열어본 것으로 운영 계정이 생긴다).

- [ ] **Step 8: 탭바 단언을 관문에 더한다**

`tools/gate-routes.mjs` 의 `watchlist` 라우트 단언을 바꾼다:

```js
  { name: "watchlist", seed: { ...ON, ms_preds: PREDS }, go: null,
    assert: "document.querySelectorAll('[data-sym]').length === 3 && document.querySelectorAll('.ms-tab').length === 3" },
```

Run: `node tools/gate-browser.mjs`
Expected: 6건 통과. `mobile/docs/rebuild/shots/app-watchlist.png` 에 하단 탭바가 보여야 한다 — 눈으로 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add mobile/www mobile/test/shell.test.mjs mobile/tools/gate-routes.mjs
git commit -m "$(cat <<'EOF'
feat(mobile): 하단 탭바 3개 — 앱의 뼈대를 시안 구조로 세운다

감사에서 드러난 가장 큰 구조 결손이 이것이다. 시안 14a 는 목록·분석·스쿱 세 탭
위에 서 있는데 앱에는 탭바가 아예 없었다 — 앱의 뼈대가 개편 이전 그대로였고,
그래서 개편으로 만든 화면들이 갈 곳이 없었다(지갑에 "더 보기"라는 임시 통로를
뚫은 마지막 커밋이 그 증상이다).

값은 시안 14a 실물에서 잰 것을 그대로 쓴다: 컨테이너 #11151d·라운드 999·패딩 6,
탭 높이 46, 활성은 배경 rgba(238,241,247,.07) 로만 말한다(좌측 컬러 라인 금지).
배지는 받을 것이 있을 때만 요소를 만든다 — 숨김으로 두면 안 보이는 이유가 CSS
문제인지 상태 문제인지 구분되지 않는다.

app.js 는 부팅만 남겼다. 화면 추가가 이제 분기 한 줄이 아니라 등록 한 줄이다.
2단 레이아웃은 P5 로 미룬다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 공용 하단 시트

단계 선택(6b)·종목 추가(12a)·성향 변경(12b)·광고 권유가 전부 이 하나를 쓴다. 지금은 화면마다 제각각이라 P1 에서 넷이 갈라진다.

**Files:**
- Create: `mobile/www/sheet.js`
- Modify: `mobile/www/style-sheet.css` (시안 값으로 재작성)
- Create: `mobile/test/sheet.test.mjs`
- Modify: `mobile/www/index.html`

**Interfaces:**
- Consumes: `MSUi.el`(기존) · `MSGlobals.define`(Task 1)
- Produces: `MSSheet.open({ title, body, onClose }) → { close }` · `MSSheet.isOpen() → boolean` · `MSSheet.closeTop() → boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/sheet.test.mjs`:

```js
// 시트는 공용이다 — 단계 선택 · 종목 추가 · 성향 변경 · 광고 권유가 같은 것을 쓴다.
// 화면마다 제각각 만들면 라운드·최대높이·닫힘 경로가 조용히 갈린다(자물쇠가 그랬다).
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../www/sheet.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../www/style-sheet.css", import.meta.url), "utf8");

test("상단 라운드 28 · 최대 82vh · 하단 안전영역 (시안 공통 컴포넌트)", () => {
  assert.match(CSS, /\.ms-sheet\b[^}]*border-radius:\s*28px\s+28px\s+0\s+0/s);
  assert.match(CSS, /\.ms-sheet\b[^}]*max-height:\s*82vh/s);
  assert.match(CSS, /\.ms-sheet\b[^}]*env\(safe-area-inset-bottom\)/s);
});

test("백드롭이 있고, 백드롭 탭으로 닫힌다", () => {
  assert.match(CSS, /\.ms-sheet-backdrop\b/);
  assert.match(SRC, /backdrop[\s\S]{0,400}addEventListener\("click"/);
});

test("뒤로가기로 닫힌다 — 시트가 열린 채로 화면이 바뀌지 않게", () => {
  assert.match(SRC, /closeTop/, "뒤로가기가 부를 진입점이 없다");
});

test("여러 장이 쌓여도 위에서부터 닫힌다", () => {
  assert.match(SRC, /stack/, "시트 스택이 없다 — 광고 권유가 단계 선택 시트 위에 열린다(시안 진입점 1)");
});

test("좌측 세로 accent 라인 금지", () => {
  assert.ok(!/border-left:\s*[2-9]/.test(CSS));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd mobile && node --test test/sheet.test.mjs`
Expected: FAIL — `sheet.js` 없음

- [ ] **Step 3: `sheet.js` 를 구현한다**

```js
// 공용 하단 시트. 단계 선택(6b) · 종목 추가(12a) · 성향 변경(12b) · 광고 권유가 같은 것을 쓴다.
//
// 스택인 이유: 시안의 광고 진입점 1번은 "막힌 순간, 시트 안에서 바로" 전환한다 — 즉 시트
// 위에 시트가 열린다. 한 장만 가정하면 그 동선에서 아래 시트가 사라지고, 광고를 본 뒤
// "원래 하려던 분석"으로 돌아갈 자리가 없어진다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSSheet", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var stack = [];

  function open(opts) {
    var o = opts || {};
    var backdrop = MSUi.el("div", "ms-sheet-backdrop");
    var sheet = MSUi.el("div", "ms-sheet");
    var head = MSUi.el("div", "ms-sheet-head");
    if (o.title) head.appendChild(MSUi.el("h2", "ms-sheet-title", o.title));
    sheet.appendChild(head);
    var body = MSUi.el("div", "ms-sheet-body");
    if (o.body) body.appendChild(o.body);
    sheet.appendChild(body);

    var entry = { backdrop: backdrop, sheet: sheet, onClose: o.onClose };
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) close(entry); });
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);
    document.body.classList.add("ms-sheet-open");
    stack.push(entry);
    return { close: function () { close(entry); }, body: body };
  }

  function close(entry) {
    var i = stack.indexOf(entry);
    if (i < 0) return false;
    stack.splice(i, 1);
    if (entry.backdrop.parentNode) entry.backdrop.parentNode.removeChild(entry.backdrop);
    if (!stack.length) document.body.classList.remove("ms-sheet-open");
    if (entry.onClose) entry.onClose();
    return true;
  }

  // 뒤로가기가 부른다 — 시트가 열려 있으면 화면을 바꾸지 않고 시트만 닫는다.
  function closeTop() {
    if (!stack.length) return false;
    return close(stack[stack.length - 1]);
  }

  function isOpen() { return stack.length > 0; }

  return { open: open, closeTop: closeTop, isOpen: isOpen };
});
```

- [ ] **Step 4: `style-sheet.css` 를 시안 값으로 재작성한다**

```css
/* 공용 하단 시트 — 시안 공통 컴포넌트(상단 라운드 28 · 최대 82vh · 하단 안전영역). */
.ms-sheet-backdrop {
  position: fixed; inset: 0; z-index: 40;
  display: flex; align-items: flex-end;
  background: rgba(6, 8, 12, .62);
}
.ms-sheet {
  width: 100%; max-height: 82vh; overflow-y: auto;
  border-radius: 28px 28px 0 0;
  background: #11151d;
  padding: 18px 20px calc(20px + env(safe-area-inset-bottom));
}
.ms-sheet-title {
  margin: 0 0 14px;
  font: 800 20px/1.25 Pretendard, sans-serif; letter-spacing: -0.03em; color: var(--ink);
}
.ms-sheet-open { overflow: hidden; }
```

- [ ] **Step 5: 뒤로가기를 시트에 먼저 물린다**

`shell.js` 의 `backbutton` 핸들러를 바꾼다:

```js
    document.addEventListener("backbutton", function () {
      // 시트가 열려 있으면 화면을 바꾸지 않는다 — 시트만 닫는다.
      if (MSSheet.closeTop()) return;
      if (!router.back() && root.navigator && root.navigator.app) root.navigator.app.exitApp();
    });
```

`index.html` 에 `<script src="sheet.js"></script>` 를 `shell.js` **앞**에 넣는다.

- [ ] **Step 6: 테스트와 관문**

Run: `cd mobile && node --test test/sheet.test.mjs && cd .. && ./tests/run.sh && cd mobile && node tools/gate-browser.mjs`
Expected: 전량 PASS · 관문 6건 통과

- [ ] **Step 7: 커밋**

```bash
git add mobile/www mobile/test/sheet.test.mjs
git commit -m "$(cat <<'EOF'
feat(mobile): 공용 하단 시트 — 넷이 같은 것을 쓴다

단계 선택(6b) · 종목 추가(12a) · 성향 변경(12b) · 광고 권유가 전부 이 하나를
쓴다. 화면마다 제각각 만들면 라운드·최대높이·닫힘 경로가 조용히 갈린다 — 이
저장소엔 rx 가 다른 자물쇠 두 개가 실재했던 전례가 있다.

스택으로 만든 이유는 시안의 광고 진입점 1번이다: "막힌 순간, 시트 안에서 바로"
전환하므로 시트 위에 시트가 열린다. 한 장만 가정하면 그 동선에서 아래 시트가
사라지고 광고를 본 뒤 돌아갈 자리가 없어진다.

뒤로가기는 시트를 먼저 본다 — 시트가 열린 채로 화면이 바뀌면 사용자는 자기가
무엇을 취소한 건지 알 수 없다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: P0 마감 — 관문 전량 · APK · 원장 갱신

**Files:**
- Modify: `mobile/docs/rebuild/PROGRESS.md`
- Modify: `map/CLAUDE.md` (테스트 건수·브라우저 관문 규율 반영)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 사용자 확인용 APK · 갱신된 진행 원장

- [ ] **Step 1: 관문 3중을 전부 돌린다**

```bash
cd map && ./tests/run.sh && cd mobile && node tools/gate-browser.mjs
```
Expected: 모듈 관문 전량 통과 · 브라우저 관문 6건 통과

- [ ] **Step 2: 스크린샷을 눈으로 확인한다**

`mobile/docs/rebuild/shots/app-*.png` 6장을 열어 시안(`spec-*.png`)과 나란히 본다. **탭바가 모든 화면 하단에 있어야 하고, 리포트가 더 이상 "불러오지 못했습니다"가 아니어야 한다.**

- [ ] **Step 3: APK 를 빌드한다**

```bash
cd mobile && npm run sync && npx cap sync android
cd android && ./gradlew assembleDebug
ls -la app/build/outputs/apk/debug/app-debug.apk
```
절차 상세는 `mobile/docs/ANDROID-BUILD.md`. ⚠️ **APK 로 열면 지갑이 실서버에 붙는다** — 진짜 계정이 생기고 개설 지급이 실행된다.

- [ ] **Step 4: `CLAUDE.md` 의 관문 규율을 갱신한다**

`map/CLAUDE.md` 의 "① 테스트는 항상 `./tests/run.sh`" 절에 한 줄 더한다:

```markdown
- **화면을 건드렸으면 `cd mobile && node tools/gate-browser.mjs` 도 돌린다.** 모듈 테스트는
  모듈마다 독립 객체를 받으므로 브라우저 전역 충돌을 원리적으로 못 본다 — 1505건이 초록인
  채로 리포트가 100% 죽어 있던 사고(2026-08-18)가 그 구멍이었다. `all` 에 넣지 않은 이유는
  크로미움이 없는 환경에서 전량 관문이 통째로 죽지 않게 하기 위해서다.
```

건수 표기(`561건`)도 실제 값으로 갱신한다.

- [ ] **Step 5: 진행 원장을 갱신한다**

`mobile/docs/rebuild/PROGRESS.md` 의 **현재 위치**·**페이즈 진행표**(P0 → ✅, 커밋 해시)·**태스크 로그**를 채우고, **다음 한 걸음**을 `P1 설계 세부 → 계획서 작성`으로 바꾼다. 사용자 실기기 확인 대기 중이면 **막힌 것 / 사용자 대기**에 적는다.

- [ ] **Step 6: 커밋**

```bash
git add mobile/docs/rebuild/PROGRESS.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(mobile): P0 마감 — 뼈대 완료, 브라우저 관문을 규율에 올린다

CLAUDE.md 의 테스트 절에 브라우저 관문을 명시한다. 모듈 테스트가 브라우저 전역
충돌을 못 본다는 사실은 이 저장소가 비싸게 배운 것이고, 문서에 없으면 다음 세션이
같은 구멍으로 걸어 들어간다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: 사용자에게 APK 를 넘기고 확인을 기다린다**

확인 항목: ①하단 탭 3개가 보이고 눌린다 ②탭을 오갔다 돌아오면 보던 화면이 남아 있다 ③리포트가 열린다(이전 APK 는 여기서 죽었다) ④뒤로가기가 시트 → 화면 → 앱 종료 순으로 동작한다.

**확인 전에는 P1 에 착수하지 않는다**(설계 §3 D4).

---

## Self-Review

**스펙 커버리지** — 설계서 §4(아키텍처)는 Task 1·4, §5(앱 셸)는 Task 3·4·5, §8.2(브라우저 관문)는 Task 2, §11(기록)은 Task 6 이 덮는다. §6~§7(P1~P5·차트 트랙)·§9(수치 정책)·§10(시안 충돌)은 **의도적으로 P0 밖**이며 각 페이즈 계획서가 덮는다.

**빠진 것을 의도적으로 남긴 곳** — 2단 레이아웃(`MSLayout`·`body.ms-dual`)은 P0 에서 단일 열만 그리도록 후퇴시킨다. 지금 2단을 라우터 위에 얹으면 "왼쪽 칸은 무슨 라우트인가"라는 답 없는 질문이 생기고, 시안 9b/9c 는 좌측 레일까지 요구하므로 P5 에서 통째로 설계하는 편이 싸다. **이 후퇴는 폴드 사용자에게 일시적 기능 축소**이므로 P5 착수 전까지 PROGRESS 의 "막힌 것"에 남긴다.

**타입 일관성** — `router.go/back/switchTab/current/stackOf/tab` 은 Task 3 정의와 Task 4 사용이 일치한다. `MSShell.mount(rootEl, screens) → router` 는 Task 4 에서 정의하고 `app.js` 가 그대로 쓴다. `MSSheet.closeTop() → boolean` 은 Task 5 정의와 `shell.js` 사용이 일치한다. 전역명은 `MSPredDraw`(작도)·`MSPredLog`(기록)로 Task 1 이후 전 태스크에서 동일하다.
