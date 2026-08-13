# 온보딩 5단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 실행에 온보딩 5단계를 세우고, 하드코딩 시드 3종과 `＋ Add ticker` 의 `prompt()` 를 없앤다.

**Architecture:** 신규 `screens/onboarding.js`(`MSOnboarding`)가 셸 밖에서 5단계를 돌고, `app.js` 부팅에 완료 플래그 게이트가 하나 들어간다. 1·2단계는 번들 시계로 진짜 엔진을 돌리고, 3단계에서 첫 `hello` 를 보내 서버가 5스쿱을 지급한다. 4단계의 종목 선택 컴포넌트(`MSTickerPicker`)를 워치리스트의 `＋ Add` 도 함께 쓴다.

**Tech Stack:** 바닐라 JS(ES5 — `var`/`function`), UMD, `node --test`. 빌드 도구·프레임워크 없음.

설계서: `map/docs/superpowers/specs/2026-08-14-moneyscoop-mobile-onboarding-design.md`

## Global Constraints

- **서버를 건드리지 않는다.** `map/wallet-lib.php` · `map/wallet-api.php` · `map/forge-api.php` · `map/forge-core.js` · `map/forge-tools.js` · `map/mobile/www/vendor/` 수정 금지.
- **관문**: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh` — 현재 **848건**(forge-core 259 · forge-tools 81 · landing 28 · wallet 67 · wallet-dispatcher 71 · moneyscoop-mobile 342). 앞의 다섯은 **무변동**이어야 한다. `./tests/run.sh concurrency` · `dispatcher` 도 무변동.
- **ES5 in `map/mobile/www/**`**: `var`/`function` 만. 화살표함수·템플릿리터럴·optional chaining·`const`/`let`·전개 금지. `map/mobile/test/**` 는 ESM 이라 최신 문법 허용.
- **사용자에게 보이는 문자열은 전부 `map/mobile/www/strings.js`.** 한국어는 코드 주석에만, WHY 만.
- 2 spaces, 큰따옴표.
- **클라이언트는 잔량을 계산하지 않는다.** 화면이 "5개를 드렸습니다"라고 말할 때 그 5는 서버가 준 값이어야 한다.
- **`index.html` 의 스크립트 순서는 load-bearing** — 브라우저는 로드 시점에 전역을 캡처한다. 순서를 고정하는 테스트가 이미 있고, 새 파일도 같은 방식으로 못박는다.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `map/mobile/www/onboarding-sample.json` | 번들 시계 240봉(캔들+날짜+거래량) | **신규(생성물, 커밋)** |
| `map/mobile/tools/make-onboarding-sample.mjs` | 위 파일을 결정론적으로 만드는 생성기 | **신규** |
| `map/mobile/www/ticker-picker.js` | `MSTickerPicker` — 큐레이션 그리드 + 직접 입력 | **신규** |
| `map/mobile/www/screens/onboarding.js` | `MSOnboarding` — 5단계 | **신규** |
| `map/mobile/www/store.js` | 온보딩 완료 플래그 · 동의 기록 | 수정 |
| `map/mobile/www/app.js` | 게이트. `seedIfEmpty()` 제거 | 수정 |
| `map/mobile/www/index.html` | 스크립트 태그 3개 | 수정 |
| `map/mobile/www/strings.js` | 온보딩 문자열 | 수정 |
| `map/mobile/www/style.css` | 온보딩·피커 스타일 | 수정 |
| `map/mobile/www/screens/watchlist.js` | `prompt()` → `MSTickerPicker` | 수정 |
| `map/mobile/docs/BACKLOG-mobile.md` | 완료 기록 | 수정 |

`MSTickerPicker` 를 `MSOnboarding` 밖에 두는 것이 핵심이다 — 온보딩 4단계와 워치리스트 `＋ Add` 가 같은 화면이어야 하고, 온보딩 안에 묻어두면 둘이 갈린다.

---

## Task 1: 번들 시계 + 저장소 플래그

**Files:**
- Create: `map/mobile/tools/make-onboarding-sample.mjs` · `map/mobile/www/onboarding-sample.json`
- Modify: `map/mobile/www/store.js`
- Test: `map/mobile/test/store.test.mjs` · `map/mobile/test/onboarding-sample.test.mjs`(신규)

**Interfaces:**
- Produces:
  - `onboarding-sample.json` — `{ price: number[], candle: [{o,h,l,c,v,t}], asOf: string }`. `MSApi.loadTicker` 의 반환과 같은 모양이라 기존 작도 경로가 그대로 먹는다
  - `MSStore.onboarded() -> boolean` · `MSStore.setOnboarded(termsVersion: string) -> void`
  - `MSStore.consent() -> { termsVersion, at } | null`

- [ ] **Step 1: 테스트를 먼저 쓴다**

`map/mobile/test/onboarding-sample.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
const S = JSON.parse(readFileSync(new URL("../www/onboarding-sample.json", import.meta.url), "utf8"));

test("번들 시계는 240봉이고 작도에 필요한 것을 다 갖췄다", () => {
  assert.strictEqual(S.candle.length, 240);
  assert.strictEqual(S.price.length, 240);
  assert.match(S.asOf, /^\d{4}-\d{2}-\d{2}$/);
  S.candle.forEach((c, i) => {
    ["o", "h", "l", "c", "v"].forEach(k => assert.ok(isFinite(c[k]), "봉 " + i + " 의 " + k));
    assert.match(c.t, /^\d{4}-\d{2}-\d{2}$/, "봉 " + i + " 의 날짜");
    assert.ok(c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c), "봉 " + i + " 고저가 어긋난다");
  });
  assert.deepEqual(S.price, S.candle.map(c => c.c), "price 는 종가 배열이어야 한다");
});

// 엔진의 synthVolume 은 거래량을 **가격에서** 만든다. 그걸 쓰면 "상승에 거래량이 동반됐다"가
// 동어반복이 되고, 8b 가 거짓으로 판정한 바로 그 모양이 첫 화면에 걸린다.
test("거래량은 가격과 독립이다 — 수익률과 상관이 낮다", () => {
  const r = [], v = [];
  for (let i = 1; i < S.candle.length; i++) {
    r.push(S.candle[i].c / S.candle[i - 1].c - 1);
    v.push(S.candle[i].v);
  }
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const mr = mean(r), mv = mean(v);
  let num = 0, dr = 0, dv = 0;
  for (let i = 0; i < r.length; i++) {
    num += (r[i] - mr) * (v[i] - mv); dr += (r[i] - mr) ** 2; dv += (v[i] - mv) ** 2;
  }
  const corr = num / Math.sqrt(dr * dv);
  assert.ok(Math.abs(corr) < 0.25, "거래량이 가격에서 파생된 것처럼 보인다: corr=" + corr.toFixed(3));
});

test("파일이 작다 — 첫 화면이 이걸 기다린다", () => {
  const bytes = readFileSync(new URL("../www/onboarding-sample.json", import.meta.url)).length;
  assert.ok(bytes < 120000, "번들 시계가 " + bytes + "바이트다");
});
```

`map/mobile/test/store.test.mjs` 끝(출력 블록이 없으므로 파일 끝)에 추가:

```js
test("온보딩 완료 플래그와 동의 기록", () => {
  const mem = {};
  MSStore.install({ getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } });
  assert.strictEqual(MSStore.onboarded(), false);
  assert.strictEqual(MSStore.consent(), null);
  MSStore.setOnboarded("terms-2026-08");
  assert.strictEqual(MSStore.onboarded(), true);
  const c = MSStore.consent();
  assert.strictEqual(c.termsVersion, "terms-2026-08");
  // 불리언만 남기면 약관이 개정됐을 때 누가 무엇에 동의했는지 말할 수 없다
  assert.match(c.at, /^\d{4}-\d{2}-\d{2}T/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/onboarding-sample.test.mjs test/store.test.mjs`
Expected: FAIL — `Cannot find module '../www/onboarding-sample.json'`, `MSStore.onboarded is not a function`

- [ ] **Step 3: 생성기를 쓴다**

`map/mobile/tools/make-onboarding-sample.mjs`:

```js
// 온보딩 1·2단계가 쓰는 번들 시계. 네트워크 없이 즉시 뜨게 하려고 파일로 굽는다.
// 결정론적이다 — Math.random 을 쓰지 않으므로 다시 돌려도 같은 파일이 나온다.
//
// 실제 종목을 쓰지 않는 이유: 특정 종목의 과거 차트를 첫 화면에 두면 추천으로 읽힌다.
// 엔진의 synthVolume 을 쓰지 않는 이유: 그건 거래량을 가격 수익률에서 만들어서,
// 거래량 지표 5종이 "상승에 거래량 동반"을 동어반복으로 확인하게 된다.
import { writeFileSync } from "node:fs";

const N = 240;
const START = Date.UTC(2025, 8, 1);   // 고정 시작일 — 재실행해도 같은 날짜가 나온다
const out = { price: [], candle: [], asOf: "" };

let p = 100;
for (let i = 0; i < N; i++) {
  // 가격: 사인 합성 + 완만한 추세. 예측 콘이 볼 만하게 나오는 모양이면 된다
  const drift = 0.0009;
  const wave = Math.sin(i * 0.11) * 0.011 + Math.cos(i * 0.037) * 0.006 + Math.sin(i * 0.53) * 0.003;
  const o = p;
  p = p * (1 + drift + wave);
  const hi = Math.max(o, p) * (1 + 0.004 + 0.003 * Math.abs(Math.sin(i * 0.7)));
  const lo = Math.min(o, p) * (1 - 0.004 - 0.003 * Math.abs(Math.cos(i * 0.9)));
  // 거래량: 가격과 **다른 주파수**로 돈다. 파생이 아니라 독립 계열이다
  const v = Math.round(1.4e6 * (1 + 0.42 * Math.sin(i * 0.29) + 0.18 * Math.cos(i * 0.83)));
  const d = new Date(START + i * 86400000);
  const t = d.toISOString().slice(0, 10);
  out.candle.push({ o: +o.toFixed(4), h: +hi.toFixed(4), l: +lo.toFixed(4), c: +p.toFixed(4), v: v, t: t });
  out.price.push(+p.toFixed(4));
}
out.asOf = out.candle[N - 1].t;

writeFileSync(new URL("../www/onboarding-sample.json", import.meta.url),
              JSON.stringify(out) + "\n");
console.log("wrote onboarding-sample.json —", N, "bars,", out.candle[0].t, "→", out.asOf);
```

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node tools/make-onboarding-sample.mjs`

- [ ] **Step 4: `store.js` 에 플래그와 동의 기록을 넣는다**

`KEYS` 에 두 개를 더한다:

```js
  var KEYS = { watchlist: "ms_watchlist", scan: "ms_scan", lastSym: "ms_last_sym",
               onboarded: "ms_onboarded", consent: "ms_consent" };
```

`seedIfEmpty` 아래에 추가하고 반환 객체에 넣는다:

```js
  function onboarded() { return read(KEYS.onboarded, false) === true; }

  // 약관 버전과 시각을 함께 남긴다 — 불리언만 남기면 약관이 개정됐을 때
  // 누가 무엇에 동의했는지 말할 수 없다. 서버로는 보내지 않는다(8c 에서 계정에 붙일 자리).
  function setOnboarded(termsVersion) {
    write(KEYS.consent, { termsVersion: String(termsVersion || ""), at: new Date().toISOString() });
    write(KEYS.onboarded, true);
  }
  function consent() {
    var c = read(KEYS.consent, null);
    return (c && typeof c === "object" && c.termsVersion) ? c : null;
  }
```

- [ ] **Step 5: 통과 확인 + 전량 관문**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/onboarding-sample.test.mjs test/store.test.mjs`
Expected: PASS

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh`
Expected: 848 → 852 근처. forge-core 259 · forge-tools 81 · landing 28 · wallet 67 · wallet-dispatcher 71 **무변동**.

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/tools/make-onboarding-sample.mjs map/mobile/www/onboarding-sample.json \
        map/mobile/www/store.js map/mobile/test/onboarding-sample.test.mjs map/mobile/test/store.test.mjs
git commit -m "$(cat <<'EOF'
온보딩: 번들 시계 + 완료 플래그·동의 기록

첫 화면이 네트워크에 달리면 안 된다(콜드 수신 942ms 실측). 240봉을 파일로
구워 즉시 뜨게 한다. 생성기는 결정론적이라 다시 돌려도 같은 파일이 나온다.

거래량을 엔진의 synthVolume 으로 만들지 않았다 — 그건 거래량을 가격 수익률에서
파생시켜서 거래량 지표 5종이 "상승에 거래량 동반"을 동어반복으로 확인하게 된다.
8b 가 거짓으로 판정한 그 모양이다. 가격과 다른 주파수로 도는 독립 계열로 굽고,
수익률과의 상관이 낮다는 것을 테스트로 박았다.

동의는 불리언이 아니라 약관 버전 + 시각으로 남긴다. 약관이 개정되면 불리언은
누가 무엇에 동의했는지 말하지 못한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `MSTickerPicker`

**Files:**
- Create: `map/mobile/www/ticker-picker.js` · `map/mobile/test/ticker-picker.test.mjs`
- Modify: `map/mobile/www/strings.js` · `map/mobile/www/index.html`

**Interfaces:**
- Consumes: `MSStore.SEED`
- Produces:
  - `MSTickerPicker.CURATED` — `[{sym, name}]` 12종
  - `MSTickerPicker.toggle(sel: string[], sym: string, max: number|null) -> string[]` — 순수 함수. `max` 도달 후 새 항목은 무시
  - `MSTickerPicker.create(opts) -> { el: HTMLElement, selected: () => string[] }`
    `opts = { multi: bool, max: number|null, preset: string[], onChange: fn, api?, strings? }`

- [ ] **Step 1: 테스트를 먼저 쓴다**

`map/mobile/test/ticker-picker.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../www/ticker-picker.js");

test("큐레이션 목록에 시드 3종이 들어 있다 — 미리 선택될 것들이다", () => {
  const syms = P.CURATED.map(x => x.sym);
  ["AAPL", "NVDA", "MSFT"].forEach(s => assert.ok(syms.indexOf(s) >= 0, s + " 가 없다"));
  assert.ok(P.CURATED.length >= 8, "고를 게 너무 적다: " + P.CURATED.length);
  assert.strictEqual(new Set(syms).size, syms.length, "중복 심볼");
  P.CURATED.forEach(x => assert.ok(x.name && x.name.length > 1, x.sym + " 에 이름이 없다"));
});

test("toggle 은 넣고 빼고, 상한에서 멈춘다", () => {
  assert.deepEqual(P.toggle([], "AAPL", 3), ["AAPL"]);
  assert.deepEqual(P.toggle(["AAPL"], "AAPL", 3), []);
  assert.deepEqual(P.toggle(["A", "B", "C"], "D", 3), ["A", "B", "C"], "상한을 넘겨 담았다");
  // 상한에 걸려도 이미 있는 것은 빼져야 한다 — 안 그러면 3개 고른 뒤 아무것도 못 바꾼다
  assert.deepEqual(P.toggle(["A", "B", "C"], "B", 3), ["A", "C"]);
  assert.deepEqual(P.toggle(["A", "B", "C"], "D", null), ["A", "B", "C", "D"], "상한 없음");
});

test("심볼은 대문자로 정규화된다", () => {
  assert.deepEqual(P.toggle([], "aapl", null), ["AAPL"]);
  assert.deepEqual(P.toggle(["AAPL"], " aapl ", null), []);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/ticker-picker.test.mjs`
Expected: FAIL — `Cannot find module '../www/ticker-picker.js'`

- [ ] **Step 3: `ticker-picker.js` 를 만든다**

```js
// 종목 고르기. 온보딩 4단계(다중)와 워치리스트 ＋Add(단일)가 같은 화면을 쓴다 —
// 온보딩 안에 묻어두면 둘이 갈리고, 예쁜 온보딩 옆에 prompt() 가 남는다.
//
// 검색 전용 엔드포인트는 없다. forge-api.php 는 심볼을 못 찾을 때만 Yahoo 후보를 주므로
// (api.js 의 err.suggest) 큐레이션 그리드 + 직접 입력 + 오타 제안으로 간다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSTickerPicker = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CURATED = [
    { sym: "AAPL", name: "Apple" },        { sym: "NVDA", name: "NVIDIA" },
    { sym: "MSFT", name: "Microsoft" },    { sym: "GOOGL", name: "Alphabet" },
    { sym: "AMZN", name: "Amazon" },       { sym: "META", name: "Meta" },
    { sym: "TSLA", name: "Tesla" },        { sym: "AMD", name: "AMD" },
    { sym: "AVGO", name: "Broadcom" },     { sym: "NFLX", name: "Netflix" },
    { sym: "SPY", name: "S&P 500 ETF" },   { sym: "QQQ", name: "Nasdaq 100 ETF" }
  ];

  function norm(s) { return String(s == null ? "" : s).trim().toUpperCase(); }

  // 상한에 걸려 있어도 '빼는 것'은 언제나 된다 — 안 그러면 상한까지 고른 뒤
  // 마음을 바꿀 방법이 없다.
  function toggle(sel, sym, max) {
    var s = norm(sym);
    if (!s) return sel.slice();
    var i = sel.indexOf(s);
    if (i >= 0) { var out = sel.slice(); out.splice(i, 1); return out; }
    if (max != null && sel.length >= max) return sel.slice();
    return sel.concat([s]);
  }

  function create(opts) {
    var o = opts || {};
    var Str = o.strings || (typeof MSStr !== "undefined" ? MSStr : null);
    var api = o.api || (typeof MSApi !== "undefined" ? MSApi : null);
    var multi = !!o.multi, max = (o.max == null) ? null : o.max;
    var sel = (o.preset || []).map(norm);
    var el = document.createElement("div");
    el.className = "tp";
    var grid = document.createElement("div");
    grid.className = "tp-grid";
    var msg = document.createElement("p");
    msg.className = "tp-msg";

    function fire() { if (o.onChange) o.onChange(sel.slice()); }

    function paint() {
      grid.innerHTML = "";
      CURATED.forEach(function (x) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "tp-cell" + (sel.indexOf(x.sym) >= 0 ? " is-on" : "");
        b.setAttribute("data-sym", x.sym);
        var s = document.createElement("span"); s.className = "tp-sym"; s.textContent = x.sym;
        var n = document.createElement("span"); n.className = "tp-name"; n.textContent = x.name;
        b.appendChild(s); b.appendChild(n);
        grid.appendChild(b);
      });
    }

    grid.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== grid && !t.getAttribute("data-sym")) t = t.parentNode;
      if (!t || t === grid) return;
      var sym = t.getAttribute("data-sym");
      if (!multi) { sel = [sym]; } else { sel = toggle(sel, sym, max); }
      msg.textContent = "";
      paint(); fire();
    });

    var row = document.createElement("div");
    row.className = "tp-free";
    var input = document.createElement("input");
    input.className = "fi tp-input";
    input.type = "text";
    input.setAttribute("placeholder", Str ? Str.t.tpPlaceholder : "");
    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn tp-add";
    addBtn.textContent = Str ? Str.t.tpAdd : "";
    row.appendChild(input); row.appendChild(addBtn);

    function tryAdd() {
      var sym = norm(input.value);
      if (!sym) return;
      msg.textContent = Str ? Str.t.tpChecking : "";
      if (!api) { msg.textContent = Str ? Str.t.tpUnavailable : ""; return; }
      api.loadTicker(sym, "1day").then(function () {
        input.value = "";
        msg.textContent = "";
        if (!multi) { sel = [sym]; } else { sel = toggle(sel, sym, max); }
        if (sel.indexOf(sym) < 0 && multi) { msg.textContent = Str ? Str.t.tpFull : ""; return; }
        paint(); fire();
      })["catch"](function (err) {
        // 오타 구제 — 서버가 notfound 일 때만 후보를 준다(api.js)
        if (err && err.notfound && err.suggest && err.suggest.length) {
          msg.textContent = (Str ? Str.t.tpDidYouMean : "") + err.suggest.map(function (x) { return x.s; }).join(", ");
        } else {
          msg.textContent = Str ? Str.t.tpNotFound : "";
        }
      });
    }
    addBtn.addEventListener("click", tryAdd);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") tryAdd(); });

    paint();
    el.appendChild(grid); el.appendChild(row); el.appendChild(msg);
    return { el: el, selected: function () { return sel.slice(); } };
  }

  return { CURATED: CURATED, toggle: toggle, create: create };
});
```

- [ ] **Step 4: 문자열과 스크립트 태그**

`strings.js` 의 `t` 에 추가:

```js
    tpPlaceholder: "Symbol (e.g. TSLA)",
    tpAdd: "Add",
    tpChecking: "Checking…",
    tpNotFound: "We could not find that symbol.",
    tpDidYouMean: "Did you mean: ",
    tpFull: "That is all the slots for now.",
    tpUnavailable: "Search is unavailable right now.",
```

`index.html` — `api.js` **뒤**, `app.js` **앞**에 넣는다:

```html
<script src="ticker-picker.js"></script>
```

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/ticker-picker.test.mjs`
Expected: PASS

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/ticker-picker.js map/mobile/test/ticker-picker.test.mjs \
        map/mobile/www/strings.js map/mobile/www/index.html
git commit -m "$(cat <<'EOF'
온보딩: 종목 고르기 컴포넌트

온보딩 4단계와 워치리스트 ＋Add 가 같은 화면을 쓴다. 온보딩 안에 묻어두면 둘이
갈리고 예쁜 온보딩 옆에 prompt() 가 남는다.

검색 전용 엔드포인트는 없다 — forge-api.php 는 심볼을 못 찾을 때만 Yahoo 후보를
준다. 그래서 큐레이션 그리드 + 직접 입력 + 기존 오타 제안 경로로 간다.

toggle 은 상한에 걸려 있어도 빼는 것은 허용한다. 안 그러면 3개를 고른 뒤
마음을 바꿀 방법이 없다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 게이트 + 1·2단계

**Files:**
- Create: `map/mobile/www/screens/onboarding.js` · `map/mobile/test/onboarding.test.mjs`
- Modify: `map/mobile/www/app.js` · `index.html` · `strings.js` · `style.css`

**Interfaces:**
- Consumes: `MSStore.onboarded()` · `MSTickerPicker` · `onboarding-sample.json`
- Produces:
  - `MSOnboarding.STEPS` — `5`
  - `MSOnboarding.next(step, state) -> number` — 순수. 진행 가능하면 `step+1`, 아니면 같은 값
  - `MSOnboarding.canAdvance(step, state) -> boolean` — 4단계는 `state.picked.length >= 1`, 5단계는 `state.agreed`
  - `MSOnboarding.render(rootEl, opts)` — `opts = { onDone: fn, store?, wallet?, sample? }`

- [ ] **Step 1: 테스트를 먼저 쓴다**

`map/mobile/test/onboarding.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const O = require("../www/screens/onboarding.js");
const APP = readFileSync(new URL("../www/app.js", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");

test("5단계다", () => { assert.strictEqual(O.STEPS, 5); });

test("4단계는 최소 1종목, 5단계는 약관 동의를 요구한다", () => {
  assert.strictEqual(O.canAdvance(1, {}), true);
  assert.strictEqual(O.canAdvance(2, {}), true);
  assert.strictEqual(O.canAdvance(3, {}), true, "지급 실패해도 막지 않는다");
  assert.strictEqual(O.canAdvance(4, { picked: [] }), false);
  assert.strictEqual(O.canAdvance(4, { picked: ["AAPL"] }), true);
  assert.strictEqual(O.canAdvance(5, { agreed: false }), false);
  assert.strictEqual(O.canAdvance(5, { agreed: true }), true);
});

test("next 는 막힌 단계에서 제자리다", () => {
  assert.strictEqual(O.next(4, { picked: [] }), 4);
  assert.strictEqual(O.next(4, { picked: ["AAPL"] }), 5);
  assert.strictEqual(O.next(5, { agreed: true }), 5, "마지막 단계를 넘어가지 않는다");
});

// 부팅에서 seedIfEmpty 가 남아 있으면 4단계가 무의미해지고, 사용자가 고르지 않은
// 종목이 워치리스트에 생긴다.
test("app.js 부팅이 더 이상 시드를 심지 않는다", () => {
  assert.doesNotMatch(APP, /MSStore\.seedIfEmpty\s*\(/);
});

test("app.js 에 온보딩 게이트가 있다", () => {
  assert.match(APP, /MSStore\.onboarded\s*\(\s*\)/);
  assert.match(APP, /MSOnboarding\.render/);
});

// index.html 은 로드 시점에 전역을 캡처한다 — 순서가 틀리면 브라우저에서만 죽는다.
test("스크립트 순서: ticker-picker → onboarding → app", () => {
  var tp = HTML.indexOf('<script src="ticker-picker.js">');
  var ob = HTML.indexOf('<script src="screens/onboarding.js">');
  var ap = HTML.indexOf('<script src="app.js">');
  assert.ok(tp > 0 && ob > 0 && ap > 0, "태그가 없다");
  assert.ok(tp < ob, "ticker-picker 가 onboarding 보다 뒤에 있다");
  assert.ok(ob < ap, "onboarding 이 app 보다 뒤에 있다");
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/onboarding.test.mjs`
Expected: FAIL — `Cannot find module '../www/screens/onboarding.js'`

- [ ] **Step 3: `screens/onboarding.js` 뼈대 + 1·2단계**

```js
// 온보딩 5단계. 셸 밖에서 돈다 — 완료 전까지 워치리스트/리포트/지갑은 그리지 않는다.
// 1·2단계는 번들 시계(onboarding-sample.json)로 진짜 엔진을 돌린다. 네트워크를 타면
// 첫 화면이 콜드 수신(실측 942ms)을 기다리게 되고, 그게 앱의 첫인상이 된다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSOnboarding = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STEPS = 5;

  function canAdvance(step, state) {
    var s = state || {};
    if (step === 4) return !!(s.picked && s.picked.length >= 1);
    if (step === 5) return !!s.agreed;
    return true;   // 3단계는 지급이 실패해도 막지 않는다 — Basic 리포트는 무료다
  }
  function next(step, state) {
    if (step >= STEPS) return step;
    return canAdvance(step, state) ? step + 1 : step;
  }

  // 나머지(render)는 Task 4·5 가 채운다.
  return { STEPS: STEPS, canAdvance: canAdvance, next: next };
});
```

⚠️ Task 3 의 `render` 는 1·2단계까지만 그린다. 3·4·5 는 다음 태스크에서 붙인다 — 그때까지 `render` 는 2단계에서 `onDone` 을 부르지 않고 멈춘다(테스트는 순수 함수만 검사하므로 관문은 초록이다). **이 상태를 사람 손으로 브라우저에서 열어보지 말 것** — 미완성이다.

`render(rootEl, opts)` 를 추가한다. 1단계는 번들 시계로 차트+콘, 2단계는 `MSIndicators.readings()` 30개를 막대로:

```js
  function frag(cls) { var e = document.createElement("div"); e.className = cls; return e; }

  function progress(step) {
    var w = frag("ob-prog");
    for (var i = 1; i <= STEPS; i++) {
      var seg = frag("ob-seg" + (i === step ? " is-on" : ""));
      w.appendChild(seg);
    }
    return w;
  }

  function render(rootEl, opts) {
    var o = opts || {};
    var Str = (typeof MSStr !== "undefined") ? MSStr : null;
    var state = { picked: [], agreed: false, granted: null, sample: o.sample || null };
    var step = 1;

    function draw() {
      rootEl.innerHTML = "";
      var scr = frag("ob");
      scr.appendChild(progress(step));
      if (step === 1) scr.appendChild(step1());
      else if (step === 2) scr.appendChild(step2());
      var nav = frag("ob-nav");
      if (step > 1) {
        var back = document.createElement("button");
        back.type = "button"; back.className = "btn btn-ghost";
        back.textContent = Str ? Str.t.obBack : "";
        back.addEventListener("click", function () { step = step - 1; draw(); });
        nav.appendChild(back);
      }
      var fwd = document.createElement("button");
      fwd.type = "button"; fwd.className = "btn btn-primary ob-next";
      fwd.textContent = Str ? Str.t.obNext : "";
      fwd.disabled = !canAdvance(step, state);
      fwd.addEventListener("click", function () {
        var n = next(step, state);
        if (n !== step) { step = n; draw(); }
      });
      nav.appendChild(fwd);
      scr.appendChild(nav);
      rootEl.appendChild(scr);
      if (step === 1) paintChart(scr);
      if (step === 2) paintComb(scr);
    }

    // …step1() · step2() · paintChart() · paintComb() 는 아래 Step 4 에서.
    draw();
  }
```

- [ ] **Step 4: 1·2단계 본문을 그린다**

`render` 안에 넣는다. **차트는 기존 작도 모듈을 그대로 쓴다** — 온보딩용 작도를 새로 쓰지 않는다(두 벌이 되면 갈린다):

```js
    // 번들 시계는 앱 자산이라 같은 출처에서 온다 — 교차 출처도 프리플라이트도 없다.
    // 주입(opts.sample)을 먼저 보는 이유는 테스트가 파일 없이 돌 수 있어야 하기 때문이다.
    function loadSample(done) {
      if (state.sample) { done(state.sample); return; }
      fetch("onboarding-sample.json").then(function (r) { return r.json(); })
        .then(function (j) { state.sample = j; done(j); })
        ["catch"](function () { done(null); });
    }
    function sample() { return state.sample; }

    function step1() {
      var w = frag("ob-step");
      w.appendChild(el("p", "ob-over", Str ? Str.t.obSampleNote : ""));   // "예시 시계"
      w.appendChild(el("h1", "ob-h", Str ? Str.t.obH1 : ""));
      var cv = document.createElement("canvas");
      cv.className = "ob-canvas";
      w.appendChild(cv);
      w.appendChild(el("p", "ob-sub", Str ? Str.t.obSub1 : ""));
      return w;
    }

    function step2() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", Str ? Str.t.obH2 : ""));
      var comb = frag("ob-comb");
      w.appendChild(comb);
      w.appendChild(el("p", "ob-sub", Str ? Str.t.obSub2 : ""));
      return w;
    }
```

`el(tag, cls, text)` 는 `MSUi.el` 을 쓴다(이미 있다).

`draw()` 끝의 `if (step === 1) paintChart(scr);` 를 `loadSample` 로 감싼다 — 파일이 오기 전에 그리면 빈 캔버스가 된다:

```js
      if (step === 1) loadSample(function () { paintChart(scr); });
      if (step === 2) loadSample(function () { paintComb(scr); });
```

**`paintChart(scr)` 는 새 작도를 쓰지 않는다.** `screens/report.js` 의 `paintChart` 가 정본이므로 그 호출 순서를 그대로 따른다 — 그 함수를 읽고 아래만 덜어낸다:

- 크로스헤어(350ms 홀드)·핀치 줌·리사이즈 리스너 — 온보딩은 정적 한 장이다
- 티어 게이팅 — 예측선은 1차(`p1`)만 그린다
- 레전드 행 — 1단계는 헤드라인 하나로 말한다

남기는 것: `ForgeCore.run(graph, data, {timeframe: MSReportModel.tfKo("1day")})` → `MSChartLayout.chartLayout(...)` → `MSChartDraw` 캔들 → `MSPreds` 예측선·콘. DPR 트랜스폼 설정도 그대로 가져온다(안 하면 폰에서 흐리다).

`paintComb(scr)` 는:

```js
    function paintComb(scr) {
      var s = sample();
      var comb = scr.querySelector(".ob-comb");
      if (!s || !comb || typeof ForgeCore === "undefined" || typeof MSIndicators === "undefined") return;
      var graph = MSGraph.full32Graph(ForgeCore);
      MSGraph.setVolume(graph, s.candle.map(function (c) { return c.v; }));
      var input = { price: s.price, candle: s.candle, volume: s.candle.map(function (c) { return c.v; }) };
      var rows = MSIndicators.readings(ForgeCore, graph, input, { price: s.price, candle: s.candle });
      // 시안은 32라고 적었지만 방향을 물을 수 있는 것은 30종이다 — trend·phasefold 는 bias 가 없다.
      // REASONING 의 "30 with a direction" 과 같은 규율.
      rows.forEach(function (r) {
        var bar = document.createElement("span");
        var dir = r.bias > 0.02 ? " up" : r.bias < -0.02 ? " dn" : "";
        bar.className = "ob-bar" + dir;
        bar.style.height = Math.max(4, Math.round(Math.abs(r.bias) * 26)) + "px";
        comb.appendChild(bar);
      });
      var cap = document.createElement("p");
      cap.className = "ob-cap";
      cap.textContent = rows.length + (Str ? Str.t.obCombCap : "");
      comb.parentNode.appendChild(cap);
    }
```

- [ ] **Step 5: `app.js` 게이트 + 스크립트 태그 + 문자열 + CSS**

`app.js` — `MSStore.seedIfEmpty();` 줄을 **지우고**, 그 자리에 게이트를 넣는다:

```js
    // 온보딩이 4단계에서 워치리스트를 심는다. 여기서 시드를 심으면 사용자가 고르지 않은
    // 종목이 생기고 4단계가 무의미해진다.
    if (!MSStore.onboarded()) {
      MSOnboarding.render(rootEl, { onDone: function () { boot(); } });
      return;
    }
    boot();
```

기존 부팅 본문(`getLastSym` 이하 셸 렌더까지)을 `function boot() { … }` 으로 감싼다.

`index.html` — `ticker-picker.js` **뒤**, `app.js` **앞**:

```html
<script src="screens/onboarding.js"></script>
```

`strings.js` 에 추가:

```js
    obBack: "Back", obNext: "Continue",
    obSampleNote: "Example series",
    obH1: "Where does this chart go next?",
    obSub1: "Every reading below comes from this chart — nothing is hand-written.",
    obH2: "Thirty readings, one verdict.",
    obSub2: "Each bar is one indicator. They collapse into a single call.",
    obCombCap: " readings with a direction",
```

`style.css` 에 `.ob`·`.ob-prog`·`.ob-seg`·`.ob-step`·`.ob-h`·`.ob-sub`·`.ob-canvas`·`.ob-comb`·`.ob-bar`·`.ob-nav`·`.tp`·`.tp-grid`·`.tp-cell`·`.tp-sym`·`.tp-name`·`.tp-free`·`.tp-msg` 를 추가한다. **토큰만 쓴다**(`var(--gold)`·`var(--bull)`·`var(--bear)`·`var(--ink-2)` 등). **행 좌측 세로 컬러 라인 금지** — 사용자가 명시적으로 금지한 패턴이다.

- [ ] **Step 6: 통과 확인 + 전량 관문 + 커밋**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/onboarding.test.mjs`
Expected: PASS

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh`
Expected: forge-core 259 · forge-tools 81 · landing 28 · wallet 67 · wallet-dispatcher 71 무변동.

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/screens/onboarding.js map/mobile/test/onboarding.test.mjs \
        map/mobile/www/app.js map/mobile/www/index.html map/mobile/www/strings.js map/mobile/www/style.css
git commit -m "$(cat <<'EOF'
온보딩: 게이트 + 1·2단계

부팅에서 seedIfEmpty 를 걷어냈다 — 남아 있으면 4단계가 무의미해지고 사용자가
고르지 않은 종목이 워치리스트에 생긴다. 그 자리에 완료 플래그 게이트가 들어간다.

1·2단계는 번들 시계로 진짜 엔진을 돌린다. 막대는 32가 아니라 30이다 —
방향을 물을 수 있는 것이 30종이고(trend·phasefold 는 bias 가 없다) REASONING 에서
정한 "30 with a direction" 과 같은 규율이다.

index.html 순서를 테스트로 못박았다. 브라우저는 로드 시점에 전역을 캡처하므로
순서가 틀리면 node 테스트는 전부 초록인 채 브라우저에서만 죽는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 3단계 — 경제 설명 + 지급

**Files:**
- Modify: `map/mobile/www/screens/onboarding.js` · `strings.js` · `style.css`
- Test: `map/mobile/test/onboarding.test.mjs`

**Interfaces:**
- Consumes: `MSWallet.get()` · `MSWallet.COSTS`
- Produces: `state.granted` — 서버가 준 `state.balance` 또는 `null`(실패)

- [ ] **Step 1: 테스트를 먼저 쓴다**

`onboarding.test.mjs` 에 추가. **온보딩 전체에서 네트워크 호출이 3단계의 지갑 호출 하나뿐**임을 세는 것이 핵심이다:

```js
const SRC = readFileSync(new URL("../www/screens/onboarding.js", import.meta.url), "utf8");

test("1·2단계는 번들 시계를 쓴다 — 시세 API 를 부르지 않는다", () => {
  // 첫 화면이 콜드 수신(942ms 실측)을 기다리면 그게 앱의 첫인상이 된다.
  // 눈으로는 "좀 느리네"로만 보이므로 소스에서 막는다.
  assert.doesNotMatch(SRC, /MSApi\.loadTicker/);
});

test("지갑은 3단계에서만 부른다", () => {
  const calls = SRC.match(/MSWallet\.\w+\(/g) || [];
  assert.deepEqual(calls, ["MSWallet.get("], "지갑 호출: " + calls.join(", "));
});

test("가격표는 MSWallet.COSTS 에서 읽는다 — 지갑 화면과 같은 출처", () => {
  assert.match(SRC, /MSWallet\.COSTS/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/onboarding.test.mjs`
Expected: FAIL — 지갑 호출이 0건이라 `deepEqual` 이 어긋난다

- [ ] **Step 3: 3단계를 구현한다**

`render` 안에 추가하고 `draw()` 의 분기에 `else if (step === 3) scr.appendChild(step3());` 를 넣는다:

```js
    // 3단계에 도달했을 때 처음 hello 를 보낸다. 1~2단계에서 이탈하면 계정이 안 생겨
    // IP당 신규계정 상한도 안 쓴다. 그리고 화면이 "5개를 드렸습니다"라고 말할 때
    // 그 5는 서버가 실제로 준 값이다 — 클라이언트가 그려놓고 나중에 맞추지 않는다.
    function grant(scr) {
      var box = scr.querySelector(".ob-grant");
      if (!box) return;
      box.textContent = Str ? Str.t.obGranting : "";
      if (typeof MSWallet === "undefined" || !MSWallet.isInstalled()) {
        box.textContent = Str ? Str.t.obGrantOffline : "";
        return;
      }
      MSWallet.get().then(function (r) {
        if (r && r.ok && r.state) {
          state.granted = r.state.balance;
          box.textContent = String(r.state.balance) + (Str ? Str.t.obGranted : "");
        } else {
          state.granted = null;
          box.textContent = Str ? Str.t.obGrantOffline : "";
          box.appendChild(retryBtn(scr));
        }
      });
    }
    function retryBtn(scr) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn btn-sm ob-retry";
      b.textContent = Str ? Str.t.obRetry : "";
      b.addEventListener("click", function () { grant(scr); });
      return b;
    }

    function step3() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", Str ? Str.t.obH3 : ""));
      w.appendChild(el("p", "ob-sub", Str ? Str.t.obSub3 : ""));
      w.appendChild(el("div", "ob-grant", ""));
      var C = (typeof MSWallet !== "undefined") ? MSWallet.COSTS : {};
      var tbl = frag("ob-costs");
      [["full", Str ? Str.t.obCostFull : ""], ["scan", Str ? Str.t.obCostScan : ""],
       ["slot", Str ? Str.t.obCostSlot : ""]].forEach(function (p) {
        var row = frag("ob-cost-row");
        row.appendChild(el("span", "ob-cost-name", p[1]));
        row.appendChild(el("span", "ob-cost-num", String(C[p[0]])));
        tbl.appendChild(row);
      });
      w.appendChild(tbl);
      return w;
    }
```

`draw()` 끝에 `if (step === 3) grant(scr);` 를 더한다.

`strings.js`:

```js
    obH3: "Why it is free",
    obSub3: "Deep analysis costs Scoops. You earn them by checking in — and later by watching a short ad.",
    obGranting: "Setting up your wallet…",
    obGranted: " Scoops to start",
    obGrantOffline: "We could not reach the wallet. You can continue — Basic reports are always free.",
    obRetry: "Try again",
    obCostFull: "Deep analysis", obCostScan: "Watchlist scan", obCostSlot: "Extra ticker slot",
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/onboarding.test.mjs` → PASS
Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh` → 앞의 다섯 스위트 무변동

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/screens/onboarding.js map/mobile/test/onboarding.test.mjs \
        map/mobile/www/strings.js map/mobile/www/style.css
git commit -m "$(cat <<'EOF'
온보딩: 3단계 — 경제 설명과 지급

3단계에 도달했을 때 처음 hello 가 나간다. 1~2단계 이탈자는 계정이 안 생겨
IP당 신규계정 상한도 안 쓴다. 화면이 "5개"라고 말할 때 그 5는 서버가 준 값이다.

실패해도 진행을 막지 않는다 — 네트워크 하나로 앱이 안 열리면 안 되고,
Basic 리포트는 무료라 앱은 쓸 수 있다.

온보딩 전체에서 네트워크 호출이 이것 하나뿐임을 소스 검사로 박았다.
1·2단계가 시세 API 를 타기 시작하면 첫 화면이 콜드 수신을 기다리는데,
눈으로는 "좀 느리네"로만 보인다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 4·5단계 + 완료

**Files:**
- Modify: `map/mobile/www/screens/onboarding.js` · `strings.js` · `style.css`
- Test: `map/mobile/test/onboarding.test.mjs`

**Interfaces:**
- Consumes: `MSTickerPicker.create` · `MSStore.setOnboarded`
- Produces: 완료 시 `opts.onDone()` 호출. 그 전에 고른 종목이 워치리스트에 심긴다

- [ ] **Step 1: 테스트를 먼저 쓴다**

```js
test("완료는 setOnboarded 로 약관 버전을 남긴다", () => {
  assert.match(SRC, /setOnboarded\(/);
  assert.match(SRC, /TERMS_VERSION/, "약관 버전 상수가 없다");
});

test("4단계가 고른 것만 심는다 — seedIfEmpty 를 부르지 않는다", () => {
  assert.doesNotMatch(SRC, /seedIfEmpty/);
  assert.match(SRC, /MSStore\.addTicker\(/);
});

// 미리 선택된 3종을 해제했는데도 남는 종류의 결함을 잡는다. 소스 검사로는 안 보인다 —
// state.picked 를 순회하는지 SEED 를 순회하는지가 눈으로 구별되지 않기 때문이다.
test("심기는 목록이 state.picked 와 정확히 같다", () => {
  const added = [];
  const store = {
    SEED: [{ sym: "AAPL" }, { sym: "NVDA" }, { sym: "MSFT" }],
    addTicker: (s) => { added.push(s); },
    setOnboarded: () => {},
    onboarded: () => false
  };
  // seedTo 는 완료 시 워치리스트를 심는 부분만 떼어낸 순수 함수다(아래 Step 3 참조)
  O.seedTo(store, ["TSLA", "AMD"]);
  assert.deepEqual(added, ["TSLA", "AMD"], "고르지 않은 종목이 심겼다");
  added.length = 0;
  O.seedTo(store, []);
  assert.deepEqual(added, [], "아무것도 안 골랐는데 심겼다");
});

test("약관 체크박스가 5단계의 진행을 막는다", () => {
  assert.strictEqual(O.canAdvance(5, { agreed: false }), false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/onboarding.test.mjs`
Expected: FAIL — `TERMS_VERSION` 없음

- [ ] **Step 3: 4·5단계를 구현한다**

모듈 상단에 상수를 둔다:

```js
  // 동의 기록에 남는 값. 약관 본문을 고치면 이 값도 올린다 — 안 그러면 개정 후에
  // 누가 무엇에 동의했는지 말할 수 없다.
  var TERMS_VERSION = "terms-2026-08";
```

`draw()` 분기에 4·5를 더하고:

```js
    function step4() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", Str ? Str.t.obH4 : ""));
      w.appendChild(el("p", "ob-sub", Str ? Str.t.obSub4 : ""));
      var picker = MSTickerPicker.create({
        multi: true, max: 3, preset: MSStore.SEED.map(function (x) { return x.sym; }),
        onChange: function (sel) {
          state.picked = sel;
          var fwd = rootEl.querySelector(".ob-next");
          if (fwd) fwd.disabled = !canAdvance(4, state);
        }
      });
      state.picked = picker.selected();
      w.appendChild(picker.el);
      return w;
    }

    function step5() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", Str ? Str.t.obH5 : ""));
      w.appendChild(el("p", "ob-risk", Str ? Str.t.obRisk : ""));
      var lab = document.createElement("label");
      lab.className = "ob-agree";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.addEventListener("change", function () {
        state.agreed = cb.checked;
        var fwd = rootEl.querySelector(".ob-next");
        if (fwd) fwd.disabled = !canAdvance(5, state);
      });
      lab.appendChild(cb);
      lab.appendChild(el("span", "ob-agree-txt", Str ? Str.t.obAgree : ""));
      w.appendChild(lab);
      w.appendChild(el("p", "ob-sub", Str ? Str.t.obFree : ""));
      return w;
    }
```

심는 부분은 `render` 클로저 밖에 순수 함수로 꺼내 노출한다. DOM 없이 검사할 수 있어야
"고른 것과 정확히 같은 목록"이 관문이 된다 — 클로저 안에 있으면 소스 문자열 검사밖에 못 하는데,
`state.picked` 를 순회하는지 `SEED` 를 순회하는지는 소스를 봐도 눈으로 구별되지 않는다:

```js
  // store 를 인자로 받는다 — 테스트가 가짜 store 로 부를 수 있어야 하기 때문이다.
  function seedTo(store, picked) {
    picked.forEach(function (s) { store.addTicker(s, ""); });
  }
```

`MSOnboarding` 의 노출 객체에 `seedTo: seedTo` 를 더한다.

마지막 단계의 버튼은 `Continue` 대신 완료로 동작한다 — `draw()` 의 `fwd` 핸들러를 고친다:

```js
      fwd.textContent = (step === STEPS) ? (Str ? Str.t.obFinish : "") : (Str ? Str.t.obNext : "");
      fwd.addEventListener("click", function () {
        if (step === STEPS) {
          if (!canAdvance(STEPS, state)) return;
          seedTo(MSStore, state.picked);
          MSStore.setOnboarded(TERMS_VERSION);
          if (o.onDone) o.onDone();
          return;
        }
        var n = next(step, state);
        if (n !== step) { step = n; draw(); }
      });
```

`strings.js`:

```js
    obH4: "Pick your first tickers",
    obSub4: "Three slots to start. You can change them any time.",
    obH5: "Before you start",
    obRisk: "MoneyScoop reads price, volume and time. It does not know company news, earnings or anything a person told you. Nothing here is investment advice, and a forecast is not a promise.",
    obAgree: "I understand and accept the terms.",
    obFree: "Your first deep analysis is free.",
    obFinish: "Start",
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/*.test.mjs` → PASS
Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh` → 앞의 다섯 스위트 무변동

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/screens/onboarding.js map/mobile/test/onboarding.test.mjs \
        map/mobile/www/strings.js map/mobile/www/style.css
git commit -m "$(cat <<'EOF'
온보딩: 4·5단계와 완료

4단계가 워치리스트를 심는다 — 고른 것만, 정확히 그것만. 5단계는 위험 고지와
약관 체크박스이고 체크 없이는 완료되지 않는다.

동의는 불리언이 아니라 약관 버전과 시각으로 남는다. 약관 본문을 고치면
TERMS_VERSION 도 올려야 한다 — 안 그러면 개정 후에 누가 무엇에 동의했는지
말할 수 없다.

UMP 개인화 광고 토글과 크래시 리포트 토글은 넣지 않았다. UMP 는 AdMob SDK
기능이고 안드로이드 빌드가 아직 안 돌았다. 동의 화면은 법적 효력을 갖는
자리라, 실제로 아무 일도 안 하는 토글을 진짜처럼 보이게 두지 않는다(8d).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `＋ Add` 의 `prompt()` 제거 + 백로그

**Files:**
- Modify: `map/mobile/www/screens/watchlist.js` · `map/mobile/docs/BACKLOG-mobile.md`
- Test: `map/mobile/test/wallet-screens.test.mjs`(기존 소스 검사 파일에 추가)

- [ ] **Step 1: 테스트를 먼저 쓴다**

`map/mobile/test/wallet-screens.test.mjs` 에 추가:

```js
const WL = readFileSync(new URL("../www/screens/watchlist.js", import.meta.url), "utf8");

test("워치리스트가 prompt() 를 쓰지 않는다", () => {
  // 예쁜 온보딩 옆에 브라우저 prompt 가 남으면 같은 앱으로 안 보인다.
  assert.doesNotMatch(WL, /\bprompt\s*\(/);
});
test("워치리스트가 MSTickerPicker 를 쓴다", () => {
  assert.match(WL, /MSTickerPicker\.create\(/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/wallet-screens.test.mjs`
Expected: FAIL — `prompt(` 가 남아 있다

- [ ] **Step 3: `addBtn()` 을 시트로 바꾼다**

`screens/watchlist.js` 의 `addBtn()` 핸들러에서 `prompt()` 를 지우고 하단 시트를 띄운다:

```js
  // 시트는 워치리스트 DOM 밖(document.body)에 붙인다. 안에 붙이면 draw() 재렌더가
  // 열려 있는 시트를 통째로 날린다.
  function openAddSheet(onAdded) {
    var back = document.createElement("div");
    back.className = "sheet-back";
    var sheet = document.createElement("div");
    sheet.className = "sheet";
    function close() { if (back.parentNode) document.body.removeChild(back); }
    back.addEventListener("click", function (e) { if (e.target === back) close(); });

    var head = document.createElement("div");
    head.className = "sheet-head";
    head.appendChild(MSUi.el("span", "sheet-title", MSStrings ? MSStrings.t.addTitle : ""));
    var x = MSUi.el("button", "sheet-x", "×");
    x.addEventListener("click", close);
    head.appendChild(x);
    sheet.appendChild(head);

    var picker = MSTickerPicker.create({
      multi: false, max: null, preset: [],
      onChange: function (sel) {
        if (!sel.length) return;
        close();
        MSStore.addTicker(sel[0], "");
        onAdded();
      }
    });
    sheet.appendChild(picker.el);
    back.appendChild(sheet);
    document.body.appendChild(back);
  }
```

`addBtn()` 의 클릭 핸들러는 이제 한 줄이다:

```js
    b.addEventListener("click", function () { openAddSheet(draw); });
```

`pendingSuggest` 와 `suggestPanel()` 은 함께 제거한다 — 오타 제안이 이제 피커 안에 있다.
`draw()` 안에서 `pendingSuggest` 를 읽던 자리도 같이 지운다(남기면 항상 null 이라 죽은 분기다).
백로그의 *"빈 워치리스트에서 오타 제안이 안 뜬다"* 항목도 이걸로 해소되므로 함께 지운다.

`strings.js` 에 `addTitle: "Add a ticker",` 를 더한다.

`style.css`:

```css
.sheet-back{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:flex;align-items:flex-end}
.sheet{width:100%;max-height:82vh;overflow:auto;background:var(--panel);
  border-radius:12px 12px 0 0;padding:14px 14px 22px}
.sheet-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.sheet-title{font-size:15px;font-weight:600;color:var(--ink)}
.sheet-x{background:none;border:0;color:var(--eth);font-size:22px;line-height:1;padding:2px 6px}
```

- [ ] **Step 4: 백로그를 갱신한다**

`✅ 완료` 에 온보딩 항목을 추가하고, **왜 빠져 있었는지**를 남긴다(설계서 §1 요약). `📋 예정` 에서 `＋ Add ticker 가 아직 prompt()` 와 `빈 워치리스트에서 오타 제안이 안 뜬다` 를 지운다. `🔥 다음` 을 갱신한다(실기기 확인 → 8c → 8d).

새 이월 항목으로 남긴다:
- **슬롯 과금 미구현** — `slot`(1스쿱)이 가격표에 있으나 호출부가 없다. 4번째 종목부터 받을지는 실사용 후
- **1단계 언어 칩 없음** — 로케일 전환이 v1 밖이라 죽은 컨트롤을 두지 않았다
- **온보딩 재실행 경로 없음** — 설정에서 다시 보기

- [ ] **Step 5: 전량 관문 + 커밋**

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh` · `./tests/run.sh concurrency` · `./tests/run.sh dispatcher`
Expected: 앞의 다섯 스위트 무변동, mobile 만 증가

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/screens/watchlist.js map/mobile/test/wallet-screens.test.mjs \
        map/mobile/www/strings.js map/mobile/www/style.css \
        map/mobile/docs/BACKLOG-mobile.md
git commit -m "$(cat <<'EOF'
온보딩: ＋Add 의 prompt() 를 피커로 교체 + 백로그

예쁜 온보딩 옆에 브라우저 prompt 가 남으면 같은 앱으로 안 보인다. 오타 제안이
피커 안으로 들어가면서 "빈 워치리스트에서 오타 제안이 안 뜬다"는 이월 항목도
함께 해소됐다.

백로그에 온보딩이 왜 빠져 있었는지를 적었다 — 페이즈를 기술 위험 순서로 잡아서
"새 사용자가 처음 무엇을 만나는가"가 어느 페이즈의 질문도 아니었다. 같은 종류의
누락이 또 나지 않으려면 이유가 남아 있어야 한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 완료 조건

- `./tests/run.sh` 통과, **forge-core 259 · forge-tools 81 · landing 28 · wallet 67 · wallet-dispatcher 71 무변동**
- `./tests/run.sh concurrency` · `dispatcher` 무변동
- `grep -rn "seedIfEmpty" map/mobile/www/` 가 `store.js` 의 정의 한 곳만 남는다(부팅 호출 없음)
- `grep -rn "prompt(" map/mobile/www/` 가 비어 있다
- `git diff main -- map/wallet-lib.php map/wallet-api.php map/forge-core.js map/forge-tools.js` 가 비어 있다
- 백로그에 온보딩 완료와 누락 이유, 새 이월 셋이 적혀 있다
