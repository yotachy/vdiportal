import { test } from "node:test";
import { allCss } from "./_css.mjs";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const O = require("../www/screens/onboarding.js");
const S = require("../www/strings.js");
const API = require("../www/api.js");
const SAMPLE = require("../www/onboarding-sample.js");
const FC = require("../../forge-core.js");
const G = require("../www/graph.js");
const IND = require("../www/indicators.js");
const RD = require("../www/readings.js");
const RM = require("../www/report-model.js");
const CL = require("../www/chart-layout.js");
const Q = require("../www/onboarding-quality.js");
const APP = readFileSync(new URL("../www/app.js", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");
const CSS = allCss();
const OB = readFileSync(new URL("../www/screens/onboarding.js", import.meta.url), "utf8");
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");


test("next 는 막힌 단계에서 제자리다", () => {
  assert.strictEqual(O.next(1, {}), 1, "찍지 않았는데 넘어간다");
  assert.strictEqual(O.next(1, { guessed: "up" }), 2);
  assert.strictEqual(O.next(3, { style: null }), 3, "성향 선택 없이 체험으로 넘어간다");
  assert.strictEqual(O.next(3, { style: "trend" }), 4);
  assert.strictEqual(O.next(7, { style: "trend" }), 7, "마지막 단계에서 더 나아간다");
});

test("render 는 함수다 — 게이트가 부를 수 있어야 한다", () => {
  assert.strictEqual(typeof O.render, "function");
});

// 부팅에서 seedIfEmpty 가 남아 있으면 4단계가 무의미해지고, 사용자가 고르지 않은
// 종목이 워치리스트에 생긴다.
// 파일 이름을 손으로 적지 않는다 — 이 태스크를 문 버그가 정확히 "두 번째 파일도 그걸 불렀다"였다
// (app.js 만 걷어낸 상태로 브라우저를 열었더니 AAPL·NVDA·MSFT 3행이 그대로 떴다). 인스턴스가
// 아니라 부류를 막는다: www/ 전체를 훑는다. vendor/ 는 생성물이라 제외.
function wwwSources() {
  const base = new URL("../www/", import.meta.url);
  const out = [];
  (function walk(rel) {
    for (const e of readdirSync(new URL(rel, base), { withFileTypes: true })) {
      if (e.name === "vendor") continue;
      if (e.isDirectory()) walk(rel + e.name + "/");
      else if (e.name.endsWith(".js")) out.push(rel + e.name);
    }
  })("");
  return out;
}

// seedIfEmpty 는 죽은 프로덕션 코드였다(호출자가 없었고, 자기 테스트만 살아 있었다) — 삭제됐다.
// 예전 정규식(/MSStore\.seedIfEmpty\s*\(/)은 "호출"만 봤으므로 함수 정의 자체가 store.js 에
// 되살아나도(아무도 안 부르는 채로) 통과했을 것이다 — 재도입을 막는 관문이 아니라 절반짜리였다.
// 이제 이름 자체를 훑는다: 정의든 호출이든 export 든 www/ 어디에도 있으면 걸린다.
test("www 어느 파일도 seedIfEmpty 를 갖고 있지 않다 — 죽은 코드 재도입 방지", () => {
  const files = wwwSources();
  assert.ok(files.length > 20, "훑은 파일이 " + files.length + "개뿐이다 — 스윕이 망가졌다");
  const offenders = files.filter(f =>
    /seedIfEmpty/.test(readFileSync(new URL("../www/" + f, import.meta.url), "utf8")));
  assert.deepStrictEqual(offenders, [], "seedIfEmpty 가 남아 있는 파일: " + offenders.join(", "));
});

test("app.js 에 온보딩 게이트가 있다", () => {
  assert.match(APP, /MSStore\.onboarded\s*\(\s*\)/);
  assert.match(APP, /MSOnboarding\.render/);
});

// 게이트는 '아니면 통과'가 아니라 '아니면 셸을 그리지 않는다'여야 한다. onboarded() 를
// 부르기만 하고 그 뒤로 셸을 계속 그리면 위 두 정규식은 통과하는데 온보딩 위에 셸이 겹쳐 그려진다.
test("게이트는 온보딩을 띄운 뒤 부팅을 중단한다", () => {
  var m = APP.match(/if\s*\(\s*!\s*MSStore\.onboarded\s*\(\s*\)\s*\)\s*\{[\s\S]*?\n\s*\}/);
  assert.ok(m, "!MSStore.onboarded() 게이트 블록이 없다");
  assert.match(m[0], /MSOnboarding\.render/, "게이트 안에서 온보딩을 그리지 않는다");
  assert.match(m[0], /\breturn\b/, "게이트가 return 으로 부팅을 끊지 않는다");
});

// index.html 은 로드 시점에 전역을 캡처한다 — 순서가 틀리면 브라우저에서만 죽는다.

// onboarding 이 로드 시점이 아니라 render 시점에 읽는 전역들 — 그래도 태그가 아예 없으면
// 브라우저에서 1·2단계가 빈 화면이 된다. node 테스트는 이 결손을 볼 수 없다.
// paintChart 는 MSZoom·MSChartLayout·MSChartDraw 가 없으면 **조용히 early-return** 한다 —
// 태그 하나가 빠지면 JS 에러 0 인 채로 캔버스만 비는, 알아채기 가장 어려운 실패다.
// MSLayers(draw-layers)·MSPredDraw(draw-preds)는 drawCone 이 내부에서 부른다.

test("온보딩 문구가 strings.js 에 있다", () => {
  // 목록을 손으로 들지 않는다 — 화면이 실제로 읽는 키를 소스에서 뽑아 그 전부가 실재하는지
  // 본다. 손으로 들면 새 문구가 늘 때마다 목록이 낡고, 낡은 순간 이 관문은 아무것도 안 본다.
  // 주석을 벗기고 센다 — 설명에 쓴 MSStr.t.X 는 코드가 아니다.
  const code = OB.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "");
  const used = [...new Set([...code.matchAll(/MSStr\.t\.([A-Za-z0-9_]+)/g)].map(m => m[1]))];
  assert.ok(used.length >= 30, "화면이 읽는 키를 못 찾았다(정규식이 낡았다): " + used.length);
  used.forEach(k => {
    assert.ok(typeof S.t[k] === "string" && S.t[k].length > 0,
      k + " 를 화면이 읽는데 strings.js 에 없다 — 빈 문구가 그대로 렌더된다");
  });
});

// 온보딩 전체에서 네트워크 호출이 3단계의 지갑 호출 하나뿐임을 세는 것이 핵심이다.
// 1·2단계가 시세 API 를 타기 시작하면 첫 화면이 콜드 수신(942ms 실측)을 기다리게 되는데,
// 눈으로는 "좀 느리네"로만 보이므로 소스에서 막는다.


test("가격표는 MSWallet.COSTS 에서 읽는다 — 지갑 화면과 같은 출처", () => {
  assert.match(OB, /MSWallet\.COSTS/);
});

// ── 4·5단계: 완료 ─────────────────────────────────────────────────────────────
test("완료는 setOnboarded 로 약관 버전을 남긴다", () => {
  assert.match(OB, /setOnboarded\(/);
  assert.match(OB, /TERMS_VERSION/, "약관 버전 상수가 없다");
});

// seedTo 는 store 를 인자로 받는 순수 함수라 소스에 "MSStore.addTicker(" 라는 리터럴은
// 없다(테스트가 가짜 store 를 넣을 수 있어야 하기 때문 — 아래 순수 함수 테스트 참고).
// 그 대신 완료 핸들러가 실제 MSStore 로 seedTo 를 부르는지를 본다.

// 미리 선택된 3종을 해제했는데도 남는 종류의 결함을 잡는다. 소스 검사로는 안 보인다 —
// state.picked 를 순회하는지 SEED 를 순회하는지가 눈으로 구별되지 않기 때문이다.
test("심기는 목록이 state.picked 와 정확히 같고, 이름도 함께 간다", () => {
  const added = [];
  const store = {
    SEED: [{ sym: "AAPL" }, { sym: "NVDA" }, { sym: "MSFT" }],
    addTicker: (s, n) => { added.push([s, n]); },
    setOnboarded: () => {},
    onboarded: () => false,
    getWatchlist: () => []
  };
  // seedTo 는 완료 시 워치리스트를 심는 부분만 떼어낸 순수 함수다. picked 는 {sym,name} 목록이다 —
  // 이름을 버리면 store.js 가 name = 심볼로 폴백해 행이 심볼을 두 번 찍고 회사명 검색이 죽는다.
  O.seedTo(store, [{ sym: "TSLA", name: "Tesla" }, { sym: "AMD", name: "AMD" }]);
  assert.deepEqual(added, [["TSLA", "Tesla"], ["AMD", "AMD"]], "고르지 않은 종목이 심겼거나 이름이 버려졌다");
  added.length = 0;
  O.seedTo(store, []);
  assert.deepEqual(added, [], "아무것도 안 골랐는데 심겼다");
});

// 부류를 막는다(위 seedIfEmpty 스윕과 같은 방식) — 어느 화면에서 추가하든 이름이 함께 가야 한다.
// 인스턴스 하나를 고치고 다른 호출지점을 빈 이름으로 남기는 것이 정확히 이 결함의 모양이었다.
test("www 어느 파일도 빈 이름으로 종목을 심지 않는다", () => {
  // 주석을 먼저 걷어낸다 — 이 결함을 설명하는 주석("addTicker(sym, \"\") 로 이름을 버렸다")이
  // 그대로 걸려서, 고쳐 놓고도 빨간불이 뜬다(실제로 그랬다).
  const strip = s => s.split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");
  const offenders = wwwSources().filter(f =>
    /addTicker\(\s*[^,)]+,\s*""\s*\)/.test(strip(readFileSync(new URL("../www/" + f, import.meta.url), "utf8"))));
  assert.deepStrictEqual(offenders, [], "빈 이름으로 심는 파일: " + offenders.join(", "));
});

// 끝에서 끝까지, 가짜 store 가 아니라 진짜 store.js 로. 이 결함의 증상 두 개는 전부 store.js 의
// 폴백(name || sym)에서 나왔으므로, 그 폴백을 실제로 지나가야 잡힌다.
test("고른 종목이 회사명을 달고 심기고, 회사명으로 검색된다", () => {
  const RealStore = require("../www/store.js");
  const P = require("../www/ticker-picker.js");
  const WM = require("../www/watchlist-model.js");
  const m = new Map();
  RealStore.install({ getItem: k => (m.has(k) ? m.get(k) : null),
                      setItem: (k, v) => m.set(k, String(v)) });

  // 4단계가 완료 때 넘기는 것과 같은 모양 — 피커가 이름을 만들고 seedTo 가 심는다.
  O.seedTo(RealStore, [{ sym: "TSLA", name: P.nameOf("TSLA") }]);
  const row = RealStore.getWatchlist()[0];
  assert.strictEqual(row.sym, "TSLA");
  assert.strictEqual(row.name, "테슬라", "이름이 심볼로 폴백했다 — 행이 심볼을 두 번 찍는다");
  assert.notStrictEqual(row.name, row.sym, "wl-sym 과 wl-name 이 같은 글자가 된다");

  // 회사명 검색(watchlist-model.filter 는 it.name 을 본다). 이름을 버리면 여기서 0건이 된다.
  assert.deepStrictEqual(
    WM.filter(RealStore.getWatchlist(), { query: "테슬라", chip: "all" }).map(x => x.sym),
    ["TSLA"], "회사명으로 검색이 안 된다");
  assert.deepStrictEqual(
    WM.filter(RealStore.getWatchlist(), { query: "tsla", chip: "all" }).map(x => x.sym),
    ["TSLA"], "심볼 검색까지 깨졌다");
});


// Task 2 가 ticker-picker.js 만 만들고 스타일을 안 붙였다 — 클래스가 CSS 에 없으면
// 4단계가 스타일 없는 버튼 더미가 된다. 온보딩 클래스와 함께 여기서 못박는다.
test("온보딩·종목 고르기 클래스가 style.css 에 있다", () => {
  [".ob", ".ob-prog", ".ob-seg", ".ob-step", ".ob-h", ".ob-sub", ".ob-canvas",
   ".ob-comb", ".ob-bar", ".ob-nav", ".ob-over", ".ob-cap",
   ".ob-grant", ".ob-retry", ".ob-costs", ".ob-cost-row", ".ob-cost-name", ".ob-cost-num",
   ".ob-risk", ".ob-agree", ".ob-agree-txt",
   ".ob-tools", ".ob-tool", ".ob-tool-name", ".ob-tool-hint",
   ".ob-read", ".ob-read-verdict", ".ob-read-label", ".ob-read-row", ".ob-read-name",
   ".ob-read-text", ".ob-read-empty", ".ob-tail",
   ".ob-period", ".ob-cols", ".ob-col", ".ob-col-app", ".ob-app-note",
   ".ob32-cmp", ".ob32-cmp-row", ".ob32-cmp-k", ".ob32-cmp-v", ".ob32-verdict-note",
   ".ob32-sec", ".ob32-sec-head", ".ob32-sec-label", ".ob32-sec-count",
   ".ob32-rows", ".ob32-row", ".ob32-name", ".ob32-text", ".ob32-bias", ".ob32-expand",
   ".ob-styles", ".ob-style", ".ob-style-name", ".ob-style-desc",
   ".tp", ".tp-grid", ".tp-chip", ".tp-chip-label", ".tp-free", ".tp-msg",
   ".tp-input", ".tp-add"].forEach(function (c) {
    assert.ok(new RegExp("\\" + c + "(?![-\\w])").test(CSS), c + " 규칙이 없다");
  });
});

// 프로젝트 전역 금지 — 항목 좌측 세로 컬러 라인(accent bar/rail).
test("온보딩·고르기 스타일에 좌측 세로 컬러 라인이 없다", () => {
  var block = CSS.slice(CSS.indexOf("/* ===== 온보딩"));
  assert.ok(block.length > 200, "온보딩 CSS 블록을 찾지 못했다");
  assert.doesNotMatch(block, /border-left\s*:\s*(?!0)/, "border-left 로 세로 라인을 그렸다");
  assert.doesNotMatch(block, /box-shadow\s*:\s*inset\s+\d/, "inset box-shadow 로 세로 라인을 그렸다");
});

// ── 번들 시계가 진짜 작도 경로에 꽂히는가 ───────────────────────────────────────
// Task 1 은 "loadTicker 와 같은 모양"이라고 주장만 했다. 그 주장을 여기서 실행한다.
function fakeCandles(n) {
  var out = [], p = 100, i;
  for (i = 0; i < n; i++) {
    var o = p, c = p * (1 + Math.sin(i / 7) * 0.01);
    out.push({ o: o, h: Math.max(o, c) * 1.005, l: Math.min(o, c) * 0.995, c: c, v: 1000 + i,
               t: "2026-01-01" });
    p = c;
  }
  return out;
}

test("번들 시계는 loadTicker 가 주는 모양을 덮는다", () => {
  var live = API.normalizeCandles({ ok: true, tf: "1day", candles: fakeCandles(230), source: "x", name: "X" });
  ["price", "candle", "asOf"].forEach(function (k) {
    assert.ok(k in SAMPLE, "번들 시계에 " + k + " 가 없다");
    assert.strictEqual(typeof SAMPLE[k], typeof live[k], k + " 의 타입이 다르다");
  });
  Object.keys(live.candle[0]).forEach(function (k) {
    assert.ok(k in SAMPLE.candle[0], "봉에 " + k + " 가 없다");
    assert.strictEqual(typeof SAMPLE.candle[0][k], typeof live.candle[0][k], "봉 " + k + " 타입이 다르다");
  });
  assert.ok(Array.isArray(SAMPLE.price) && SAMPLE.price.length === SAMPLE.candle.length);
});

test("번들 시계로 엔진이 실제로 돈다 — 예측 경로가 나온다", () => {
  var graph = G.full32Graph(FC);
  var vol = SAMPLE.candle.map(function (c) { return c.v; });
  G.setVolume(graph, vol);
  var out = FC.run(graph, { price: SAMPLE.price, candle: SAMPLE.candle, volume: vol },
                   { timeframe: RM.tfKo("1day") });
  assert.ok(out && out.prediction, "예측이 없다");
  assert.ok(out.prediction.path && out.prediction.path.length > 0, "예측 경로가 비었다");
  assert.ok(out.prediction.hi && out.prediction.lo, "콘 밴드가 없다");
});

// 시안은 32라고 적었지만 방향을 물을 수 있는 것은 30종이다 — trend·phasefold 는 bias 가 없다.

// 두 벌 작도가 갈리는 것을 막는다 — 온보딩은 report.js 와 같은 모듈을 부른다.
// 2026-08-18 재설계: 가격 한 장 → 가격(MA·볼린저 오버레이) + 거래량 서브패널. TOOLS 배열
// (screens/onboarding.js) 이 정확히 이 둘을 요구하므로 패널도 ["price","volume"] 둘이어야 한다.
test("작도는 기존 모듈을 그대로 쓴다 — 온보딩용 작도를 새로 쓰지 않는다", () => {
  withDom((root, spy) => {
    O.render(root, { sample: SAMPLE });
    assert.ok(spy.layout.length >= 1, "chartLayout 을 부르지 않는다 — 자체 작도를 쓴 것이다");
    assert.deepStrictEqual(spy.layout[0].panels, ["price", "volume"],
      "1단계는 가격+거래량 두 패널이어야 한다(MA·볼린저는 가격 패널 오버레이)");
  });
});

// ES5 전용(WebView). 화살표 함수·템플릿 리터럴·const/let 이 들어오면 구형 WebView 에서 죽는다.
test("온보딩은 ES5 다", () => {
  var code = OB.split("\n").map(function (l) { return l.replace(/\/\/.*$/, ""); }).join("\n");
  assert.doesNotMatch(code, /=>/, "화살표 함수");
  assert.doesNotMatch(code, /`/, "템플릿 리터럴");
  assert.doesNotMatch(code, /\b(const|let)\s/, "const/let");
  assert.doesNotMatch(code, /\?\./, "옵셔널 체이닝");
  assert.doesNotMatch(code, /\.\.\./, "스프레드");
});

// ── 작은 DOM 하네스 ──────────────────────────────────────────────────────────────
// 이 저장소의 화면 테스트 관례는 소스 문자열 검사다(wallet-screens.test.mjs 머리말 — DOM 이
// 없어서다). 여기만 예외를 둔다: 1·2단계는 "무엇을 그렸는가"가 곧 요구사항이라(캔버스 한 장 ·
// 막대 30개) 소스 검사로는 **빈 화면과 정상 화면을 구분할 수 없다**. jsdom 은 안 들인다 —
// 필요한 것이 createElement/appendChild/querySelector/2d 컨텍스트뿐이다.
function ctxStub() {
  const calls = [];
  const target = {
    __calls: calls,
    measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; }
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== "string") return undefined;
      return function () { calls.push(k); };
    },
    set() { return true; }
  });
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.className = ""; this.style = {}; this.children = [];
    this.listeners = {}; this.parentNode = null;
    this.clientWidth = 360; this.disabled = false; this._text = "";
    this.width = 0; this.height = 0;
    this._ctx = null;
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  // progress-analyze.js(MSAnalyzeView) 가 close()/finish() 에서 실제로 부른다(6단계가
  // 처음으로 이 모듈을 끌어들인다 — report.js 쪽 구매 흐름은 노드 시험이 아예 안 재서
  // 지금까지 이 메서드가 없어도 아무도 눈치채지 못했다).
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  // progress-analyze.js 의 paint() 가 teeth[i].classList.add("on") 을 부른다 — className
  // 문자열을 그대로 다루는 최소 셰이프. get 으로 매번 새로 만들어도(캐싱 안 함) 부작용 없다
  // (className 이 항상 최신 진실원이다).
  get classList() {
    const self = this;
    return {
      add(c) { if ((" " + self.className + " ").indexOf(" " + c + " ") < 0) self.className = (self.className ? self.className + " " : "") + c; },
      remove(c) { self.className = (" " + self.className + " ").split(" " + c + " ").join(" ").trim(); },
      contains(c) { return (" " + self.className + " ").indexOf(" " + c + " ") >= 0; }
    };
  }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  click() { (this.listeners.click || []).forEach(f => f({})); }
  // ticker-picker.js 는 칩 클릭을 개별 버튼이 아니라 부모 `.tp-grid` 에 위임한다
  // (delegated listener, e.target 을 훑어 data-sym 을 찾는다) — 이 El.click() 은 버블링을
  // 흉내내지 않으므로(그러면 다른 30여 개 시험의 전제가 바뀐다), ticker-picker.test.mjs 의
  // FakeNode.dispatch 와 같은 방식을 여기도 추가한다: 그리드에 `{target: 칩}` 을 직접 쏜다.
  dispatch(t, evt) { (this.listeners[t] || []).slice().forEach(f => f(evt || {})); }
  setAttribute(k, v) { this["attr_" + k] = v; }
  getAttribute(k) { return this["attr_" + k]; }
  getContext() { if (!this._ctx) this._ctx = ctxStub(); return this._ctx; }
  set innerHTML(v) { if (v === "") this.children = []; }
  get innerHTML() { return ""; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  find(pred) {
    for (const c of this.children) {
      if (pred(c)) return c;
      const hit = c.find(pred);
      if (hit) return hit;
    }
    return null;
  }
  querySelector(sel) {
    const cls = String(sel).replace(/^\./, "");
    return this.find(c => (" " + c.className + " ").indexOf(" " + cls + " ") >= 0);
  }
  findAll(pred, out) {
    out = out || [];
    for (const c of this.children) {
      if (pred(c)) out.push(c);
      c.findAll(pred, out);
    }
    return out;
  }
  querySelectorAll(sel) {
    const cls = String(sel).replace(/^\./, "");
    return this.findAll(c => (" " + c.className + " ").indexOf(" " + cls + " ") >= 0);
  }
}

// El.textContent 는(위 getter) 자기 자신에 직접 쓴 텍스트만 본다 — 자식을 타고 내려가며
// 모으지 않는다(다른 대부분의 단언은 리프 노드의 .textContent 만 재므로 문제되지 않았다).
// MSObQuality.metric()/stat() 은 값·라벨·해석을 여러 겹의 자식 노드로 나눠 넣으므로,
// 그 바깥 래퍼(.ob-col 등)의 textContent 를 그대로 재면 항상 빈 문자열이라 단언이 공허하게
// 통과한다(3열 텍스트가 비어도 doesNotMatch(/%/)가 거짓으로 초록이 되는 함정) — 자식까지
// 실제로 내려가 모은다.
function deepText(node) {
  if (!node) return "";
  if (!node.children || !node.children.length) return node.textContent || "";
  return node.children.map(deepText).join("");
}

// 5단계 — ticker-picker.js 는 칩 클릭을 개별 버튼이 아니라 부모 `.tp-grid` 에 위임한다
// (delegated listener, e.target 을 훑어 data-sym 을 찾는다). `.tp-grid` 안의 실제 칩
// 노드를 찾아 그리드에 `{target}` 이벤트를 쏜다 — El.dispatch 참고. sym 을 안 주면 첫
// 번째 칩(그리드 순서상 CURATED[0] = 삼성전자)을 고른다.
function pickChip(root, sym) {
  const grid = root.querySelector(".tp-grid");
  if (!grid) throw new Error("종목 고르기 그리드(.tp-grid)가 없다");
  const chip = sym
    ? grid.children.filter(c => c.getAttribute("data-sym") === sym)[0]
    : grid.children.filter(c => (" " + c.className + " ").indexOf(" tp-chip ") >= 0)[0];
  if (!chip) throw new Error("칩을 못 찾았다: " + (sym || "(첫 칩)"));
  grid.dispatch("click", { target: chip });
  return chip;
}

// 4·5단계용 기본 가짜 store — 실제 store.js(localStorage)는 쓰지 않는다. 여러 테스트가
// 같은 모듈 인스턴스를 require 캐시로 공유하면 상태가 샌다 — spyWallet 과 같은 이유.
function defaultFakeStore(watchlist) {
  return {
    SEED: [{ sym: "AAPL", name: "Apple Inc." }, { sym: "NVDA", name: "NVIDIA Corporation" },
            { sym: "MSFT", name: "Microsoft Corporation" }],
    addTicker: function () {}, setOnboarded: function () {}, onboarded: function () { return false; },
    getWatchlist: function () { return watchlist || []; }
  };
}

// extra — 5단계의 [분석 시작]이 실제로 확인하는 대상(MSApi)을 시험이 주입할 수 있게 하는
// 자리다. 기본 하네스는 MSApi 를 아예 안 심는다(loadPick 이 "API 층 자체가 없다" 분기로
// 물러선다) — "못 찾음"·"봉 부족" 표본을 실제로 만들려면 이 자리로 가짜 MSApi 를 넣는다.
function withDom(fn, storeOverride, extra) {
  const g = globalThis;
  const saved = {};
  const put = (k, v) => { saved[k] = Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; g[k] = v; };
  const htmlEl = new El("html"), bodyEl = new El("body");
  htmlEl.appendChild(bodyEl);
  // body/querySelector — 6단계가 처음으로 MSAnalyzeView.play() 를 끌어들인다. 그 모듈은
  // document.body.appendChild(scrim) 로 오버레이를 붙이고 close() 에서 document.querySelector
  // (".an-scrim") 로 되찾아 뗀다 — El 자신의 querySelector(문서 트리를 훑는 그 구현)를 그대로
  // 재사용한다(새 탐색 로직을 만들지 않는다).
  const doc = { createElement: t => new El(t), documentElement: htmlEl, body: bodyEl,
    querySelector: sel => htmlEl.querySelector(sel) };
  put("document", doc);
  put("window", { devicePixelRatio: 3 });         // 3 = 실기기(폴드) 값. 1 이면 DPR 실수가 안 보인다
  put("getComputedStyle", () => ({ getPropertyValue: () => "" }));   // 토큰은 폴백으로 떨어진다
  // requestAnimationFrame 을 동기로 흉내낸다 — progress-analyze.js 의 frame() 이 다음 프레임을
  // 이 함수로 예약하는데, 동기로 즉시 부르면 재귀가 stepper 가 다 끝날 때까지(최대 32회) 그
  // 자리에서 풀려 onDone 이 같은 tick 안에서 불린다. 그 onDone 은 draw() 를 다시 부르는데,
  // 실제 호출부(screens/onboarding.js draw() 의 꼬리, `if (step===6) ob6Reveal();`)가 이미
  // **바깥 draw() 가 return 하기 직전**에 이 함수를 부르도록 설계돼 있어 재진입 문제가 없다
  // (바깥 draw() 가 이 줄 다음에 더 할 일이 없다) — 실제 브라우저에서 rAF 가 다음 페인트까지
  // 미뤄지는 것과 최종 결과(= state.ob6 가 채워진 뒤의 완성된 DOM)는 같다, 그 사이 타이밍만
  // 다르다. 시험이 flush() 연쇄 없이 6단계를 곧바로 잴 수 있는 이유가 이것이다.
  put("requestAnimationFrame", fn => { fn(); return 1; });
  put("cancelAnimationFrame", () => {});
  put("MSAnalyzeView", require("../www/progress-analyze.js"));
  put("MSUi", require("../www/ui.js"));
  put("MSStr", S);
  put("ForgeCore", FC);
  put("MSGraph", G);
  put("MSReadings", RD);
  put("MSReportModel", RM);
  put("MSTickerPicker", require("../www/ticker-picker.js"));
  put("MSIndTiers", require("../www/ind-tiers.js"));
  put("MSBacktest", JSON.parse((() => { const r = readFileSync(new URL("../www/vendor/backtest-summary.js", import.meta.url), "utf8"); return r.slice(r.indexOf("{"), r.lastIndexOf("}") + 1); })()));
  put("MSStore", storeOverride || defaultFakeStore());
  put("MSObQuality", Q);

  // ── 인자 스파이. 메서드 **이름**만 기록하면 티어("basic"→"full")·패널 구성·캔버스 높이를
  // 바꿔도 전부 초록이다(리뷰가 실제로 그렇게 통과시켰다). 호출된 인자를 붙잡는다.
  // require 캐시를 오염시키지 않도록 얕은 복사본에만 래퍼를 씌운다 — 두 모듈 다 내부에서는
  // 클로저로 서로를 부르므로 복사본 교체가 원본 동작을 바꾸지 않는다.
  const spy = { cone: [], layout: [], readings: [] };
  const draw = require("../www/chart-draw.js");
  const layout = require("../www/chart-layout.js");
  put("MSChartDraw", Object.assign({}, draw, {
    drawCone(c, lay, pred, col, tier, opts) {
      spy.cone.push({ tier, opts });
      return draw.drawCone(c, lay, pred, col, tier, opts);
    }
  }));
  put("MSChartLayout", Object.assign({}, layout, {
    chartLayout(o) { spy.layout.push(o); return layout.chartLayout(o); }
  }));
  // 1단계의 판독문이 "지금 계산한 것"인지(하드코딩이 아닌지)를 재려면 실제 호출을 붙잡아야
  // 한다 — readings() 가 몇 번, 무엇을 받아 불렸는지를 spy.readings 에 남긴다.
  put("MSIndicators", Object.assign({}, IND, {
    readings(FCArg, graphArg, dataArg, ctxArg) {
      const rows = IND.readings(FCArg, graphArg, dataArg, ctxArg);
      spy.readings.push({ graph: graphArg, data: dataArg, rows });
      return rows;
    }
  }));
  put("MSPredDraw", require("../www/draw-preds.js"));
  // 지표 레이어(MA·볼린저 오버레이, 거래량 서브패널)가 "실제로 그려지는가"를 캔버스 호출
  // 개수만으로 재면 candles 가 늘어난 것과 구분이 안 된다 — 함수가 **불렸는지** 자체를 잰다.
  const layers = require("../www/draw-layers.js");
  const panels = require("../www/draw-panels.js");
  put("MSLayers", Object.assign({}, layers, {
    ma(c, ma, M) { spy.ma = (spy.ma || 0) + 1; return layers.ma(c, ma, M); },
    bollinger(c, bb, M) { spy.bollinger = (spy.bollinger || 0) + 1; return layers.bollinger(c, bb, M); }
  }));
  put("MSPanels", Object.assign({}, panels, {
    volume(c, cw, ch, va, reveal) { spy.volumePanel = (spy.volumePanel || 0) + 1; return panels.volume(c, cw, ch, va, reveal); }
  }));
  put("MSZoom", require("../www/chart-zoom.js"));
  if (extra) Object.keys(extra).forEach(function (k) { put(k, extra[k]); });
  try { return fn(new El("div"), spy); }
  finally { Object.keys(saved).forEach(k => { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; }); }
}

// PRED_TIERS.full = ["p1","p3"] — "full" 이 새면 온보딩이 3차 예측선을 조용히 덧그린다.
// 소스 정규식 /"basic"/ 은 이 줄의 **주석**에도 걸려서 호출을 바꿔도 통과한다. 인자를 본다.
test("1단계는 예측을 그리지 않는다 — 엔진의 답을 먼저 보여주면 찍을 이유가 사라진다", () => {
  withDom((root, spy) => {
    O.render(root, { sample: SAMPLE });
    assert.strictEqual(spy.cone.length, 0,
      "찍기 전에 예측선을 그렸다 — 답을 보여주고 맞혀보라고 하는 화면이 된다");
    // 찍은 뒤에도 이 화면은 실제 봉을 열어 보여줄 뿐이다(예측이 아니라 사실).
    root.querySelector(".ob-guess-btn").click();
    assert.strictEqual(spy.cone.length, 0, "정답 공개에 예측선이 섞였다");
  });
});

test("차트는 가격+거래량 두 패널이고, 날짜축 자리를 미리 뗀다", () => {
  withDom((root, spy) => {
    O.render(root, { sample: SAMPLE });
    assert.strictEqual(spy.layout.length, 1, "chartLayout 이 한 번 불리지 않았다");
    const o = spy.layout[0];
    assert.deepStrictEqual(o.panels, ["price", "volume"],
      "rsi·macd 서브패널이 딸려 오거나 거래량이 빠졌다 — 온보딩 1단계는 가격+거래량이다");

    // 날짜축 여백은 이제 chart-layout.js 안에서 뗀다(report.js 도 같은 계약을 쓰게 하려고
    // 공용화했다) — 그래서 호출자는 더 이상 스스로 빼지 않고 캔버스 전체 높이를 그대로 넘긴다.
    const cssH = parseFloat(root.querySelector(".ob-canvas").style.height);
    assert.strictEqual(o.height, cssH,
      "온보딩이 여전히 스스로 축 여백을 빼고 있다 — chart-layout 의 공용 예약과 이중으로 뗀다");

    // 기대값을 온보딩의 상수가 아니라 실제 레이아웃 결과(마지막 패널의 실제 y+h)에서 뽑는다 —
    // 구현 상수로 기대값을 만들면 항등식이 된다. drawAxes 는 하단 날짜축을
    // '마지막 패널 아래 14px' 에 찍는다(chart-draw.js drawAxes). chart-layout 이 축 여백을
    // 예약하지 않게 되면(회귀) 이 라벨이 캔버스 밖으로 나가 여기서 걸린다.
    const lay = CL.chartLayout(o);
    const last = lay.panels[lay.order[lay.order.length - 1]].rect;
    const labelBaseline = last.y + last.h + 14;
    assert.ok(labelBaseline <= cssH,
      "하단 날짜축이 캔버스 밖으로 나간다: 베이스라인 " + labelBaseline + " > 캔버스 " + cssH);
  });
});

test("1단계는 캔버스에 실제로 그린다 — 빈 캔버스가 아니다", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    const cv = root.querySelector(".ob-canvas");
    assert.ok(cv, "캔버스가 없다");
    const calls = cv.getContext("2d").__calls;
    // DPR — 안 하면 폰에서 흐리다. node 는 흐림을 못 보므로 트랜스폼 호출과 픽셀 크기로 본다.
    assert.ok(calls.includes("setTransform"), "DPR 트랜스폼을 설정하지 않았다");
    assert.strictEqual(cv.width, 360 * 3, "캔버스 픽셀 폭이 DPR 을 안 탄다");
    assert.ok(calls.includes("fillRect"), "캔들을 그리지 않았다");
    assert.ok(calls.filter(c => c === "fillRect").length > 20, "캔들이 몇 개뿐이다: " + calls.length);
    // 진행 막대는 7칸, 첫 칸만 켜져 있다
    const segs = root.querySelector(".ob-prog").children;
    assert.strictEqual(segs.length, 7, "진행바가 7칸이 아니다");
    assert.strictEqual(segs[0].className, "ob-seg is-on");
    assert.strictEqual(root.querySelector(".ob-back"), null, "1단계엔 뒤로가 없다");
    // 찍기 전에는 계속하기가 막혀 있다 — 설명 대신 직접 찍게 하는 화면이다.
    assert.strictEqual(root.querySelector(".ob-next").disabled, true);
    assert.ok(root.querySelector(".ob-guess-btn"), "찍기 버튼이 없다");
  });
});


test("뒤로 가면 1단계가 다시 그려진다", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    root.querySelector(".ob-guess-btn").click();
    root.querySelector(".ob-next").click();
    root.querySelector(".ob-back").click();
    assert.ok(root.querySelector(".ob-canvas"), "1단계로 안 돌아왔다");
    // Task 4 재설계: 2단계는 이제 32도구 화면(.ob32-cmp) 이다 — 옛 표식(.ob-styles) 은
    // 더는 어디서도 그려지지 않아 이 단언이 항상 공허하게 통과하므로 실제로 그려지는
    // 새 표식으로 잰다.
    assert.strictEqual(root.querySelector(".ob32-cmp"), null, "이전 단계 DOM 이 남아 있다");
  });
});

test("번들 시계가 없어도 던지지 않는다 — 첫 화면이 흰 화면이 되면 안 된다", () => {
  withDom(root => {
    delete globalThis.MSOnboardingSample;
    assert.doesNotThrow(() => O.render(root, {}));
    assert.ok(root.querySelector(".ob-h"), "헤드라인조차 안 그렸다");
  });
});

// ── 3단계: 지갑 호출 ───────────────────────────────────────────────────────────
// 위 withDom 은 동기 콜백 전제다 — try { return fn(...) } finally { 복구 } 라서, fn 이 비동기면
// fn 의 await 가 끝나기 전에 finally 가 먼저 돌아 document/MSWallet 이 사라진다(재시도 버튼이
// document.createElement 를 다시 부르는 순간 터진다). 3단계는 Promise 를 기다려야 하므로
// 별도의 비동기 헬퍼를 쓴다 — 기존 withDom 은 건드리지 않는다(다른 30여 개 동기 테스트가 문다).
// extra — withDom 의 같은 자리와 같은 이유(가짜 MSApi 주입). 5단계의 [분석 시작]이
// 비동기(Promise)로 확인·실패하는 경로를 재려면 async 안전한 이 하네스가 필요하다 —
// withDom(동기 전제)은 await 가 끝나기 전에 finally 가 먼저 돌아 document 가 사라진다.
async function withDomWallet(wallet, fn, extra) {
  const g = globalThis;
  const saved = {};
  const put = (k, v) => { saved[k] = Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; g[k] = v; };
  const htmlEl = new El("html"), bodyEl = new El("body");
  htmlEl.appendChild(bodyEl);
  put("document", { createElement: t => new El(t), documentElement: htmlEl, body: bodyEl,
    querySelector: sel => htmlEl.querySelector(sel) });
  put("window", { devicePixelRatio: 3 });
  put("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  // withDom 의 같은 스텁과 같은 이유 — toStep7() 이 6단계를 실제로 지나가며 MSAnalyzeView.play()
  // 를 부른다(ob6Reveal, draw() 꼬리에서). 동기 rAF 로 그 자리에서 끝맺는다.
  put("requestAnimationFrame", fn => { fn(); return 1; });
  put("cancelAnimationFrame", () => {});
  put("MSAnalyzeView", require("../www/progress-analyze.js"));
  put("MSUi", require("../www/ui.js"));
  put("MSStr", S);
  put("MSWallet", wallet);
  // 7단계까지 실제로 걸어가려면 4~6단계가 엔진을 돌릴 수 있어야 한다 — 지갑만 있는 하네스로는
  // 5단계에서 멈춘다(종목을 못 고르면 넘어가지 않는 것이 사양이다).
  put("MSTickerPicker", require("../www/ticker-picker.js"));
  put("MSIndTiers", require("../www/ind-tiers.js"));
  put("ForgeCore", FC);
  put("MSGraph", G);
  put("MSIndicators", IND);
  put("MSReadings", RD);
  put("MSReportModel", RM);
  put("MSStore", defaultFakeStore());
  put("MSChartLayout", require("../www/chart-layout.js"));
  put("MSChartDraw", require("../www/chart-draw.js"));
  put("MSLayers", require("../www/draw-layers.js"));
  put("MSZoom", require("../www/chart-zoom.js"));
  put("MSObQuality", Q);
  if (extra) Object.keys(extra).forEach(function (k) { put(k, extra[k]); });
  try {
    return await fn(new El("div"));
  } finally {
    Object.keys(saved).forEach(k => { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; });
  }
}

function flush() { return new Promise(r => setTimeout(r, 0)); }

// 리뷰 C2 — 5단계의 "못 찾음"/"봉 부족" 시험은 www/api.js 를 통째 우회하는 손으로 짠 가짜
// MSApi 대신, **실물** api.js(loadTicker→normalizeCandles)를 그대로 태우고 global.fetch 만
// 갈아끼운다. 그래야 온보딩이 실제로 받는 오류 모양(err.notfound·err.message 접두)이 그대로
// 재현된다 — 손으로 짠 가짜는 "봉 부족"을 온보딩이 상상하는 모양으로만 만들 수 있어서, 실제
// api.js 가 이미 1day 에 220을 강제한다는 사실(온보딩의 옛 로컬 문턱 60과 어긋났다)을 이
// 시험이 하나도 못 봤다.
function fetchReturning(json) {
  return function () { return Promise.resolve({ json: function () { return Promise.resolve(json); } }); };
}

// isInstalled() 를 흉내내지 않는다 — 실 MSWallet.get() 은 backend 미설치를 그냥 { ok:false } 로
// 돌려준다(wallet.js noBackend), onboarding.js 도 그 경로 하나만 탄다.
function spyWallet(result, costs) {
  const calls = [];
  return {
    calls,
    COSTS: costs || { full: 3, scan: 2, slot: 1 },
    get() { calls.push(1); return Promise.resolve(result); }
  };
}

// 6단계까지 실제로 걸어간다(toStep7 과 같은 절차, 5->6 클릭에서 멈춘다). withDom 의 rAF
// 스텁이 동기라 이 클릭 하나로 MSAnalyzeView.play() 의 재생까지 전부 끝난다 — 그래서
// 여기서 더 기다리지 않고 바로 6단계 DOM 을 잴 수 있다(실 브라우저에선 비동기지만 최종
// 상태는 같다, 위 withDom 의 requestAnimationFrame 스텁 주석 참고).
function toStep6(root) {
  O.render(root, { sample: SAMPLE });
  root.querySelector(".ob-guess-btn").click();          // 1: 직접 찍기
  root.querySelector(".ob-next").click();               // 1 -> 2
  root.querySelector(".ob-next").click();               // 2 -> 3
  root.querySelector(".ob-next").click();               // 3 -> 4
  root.querySelector(".ob-agree").click();              // 4: 동의 체크
  root.querySelector(".ob-next").click();               // 4 -> 5
  pickChip(root);                                       // 5: 종목 하나 고른다
  root.querySelector(".ob-pick-start").click();         // 5: [분석 시작]
  return flush().then(function () {                     // 실 데이터 적재(또는 번들 폴백)를 기다린다
    root.querySelector(".ob-next").click();              // 5 -> 6, 재생도 이 안에서 동기로 끝난다
  });
}

// 7단계까지 실제로 걸어간다. 각 단계가 요구하는 것을 실제로 충족시키면서 간다 —
// 상태를 밖에서 밀어 넣으면 "그 요구가 정말 화면에서 채워지는가"를 안 재게 된다.
async function toStep7(root) {
  O.render(root, { sample: SAMPLE });
  root.querySelector(".ob-guess-btn").click();          // 1: 직접 찍기
  root.querySelector(".ob-next").click();               // 1 -> 2
  root.querySelector(".ob-next").click();               // 2 -> 3 (32도구 화면은 입력 없이 넘어간다)
  root.querySelector(".ob-next").click();               // 3 -> 4 (성향은 기본 선택으로 입력 없이 넘어간다)
  root.querySelector(".ob-agree").click();              // 4: 동의 체크
  root.querySelector(".ob-next").click();               // 4 -> 5
  pickChip(root);                                       // 5: 종목 하나 고른다(선택 — 아직 분석 아님)
  root.querySelector(".ob-pick-start").click();         // 5: [분석 시작] — 여기서 처음 돈다
  await flush();                                        // 실 데이터 적재(또는 번들 폴백)를 기다린다
  root.querySelector(".ob-next").click();               // 5 -> 6
  root.querySelector(".ob-next").click();               // 6 -> 7
}

// 뮤테이션 (a): 지급액을 리터럴로 박아 넣으면 여기서 잡힌다 — 스파이가 5 가 아닌 11 을 돌려준다.
test("지급액은 서버가 돌려준 값이다 — 클라이언트가 지어내지 않는다", async () => {
  const wallet = spyWallet({ ok: true, state: { balance: 11 } });
  await withDomWallet(wallet, async (root) => {
    await toStep7(root);
    await flush();
    const box = root.querySelector(".ob-grant");
    assert.ok(box, "지급 영역이 없다");
    assert.strictEqual(box.textContent, "11" + S.t.obGranted,
      "표시된 문구가 서버 값(11)을 쓰지 않는다: " + box.textContent);
  });
});

// 가격표 값도 스파이의 COSTS 를 그대로 반영해야 한다(실제 COSTS 와 다른 값을 줘서 리터럴화를 잡는다).
// 슬롯 행은 없다 — spend("slot") 이 어디에도 없고 addTicker 는 무료·무제한이라 뺐다(코디네이터
// 판정). 행은 full·scan 둘뿐이다.
test("가격표 숫자는 MSWallet.COSTS 값 그대로다 — 다시 적지 않는다", async () => {
  const wallet = spyWallet({ ok: true, state: { balance: 5 } }, { full: 30, custom: 50, scan: 0 });
  await withDomWallet(wallet, async (root) => {
    await toStep7(root);
    await flush();
    const rows = root.querySelector(".ob-costs").children;
    assert.strictEqual(rows.length, 2);
    const nums = rows.map(r => r.querySelector(".ob-cost-num").textContent);
    assert.deepStrictEqual(nums, ["30", "50"], "가격표가 COSTS(심화 30·전문 50)를 안 따라간다: " + nums.join(","));
  });
});

// 0 은 "0 스쿱"이 아니라 "무료"다. 숫자 0 을 값으로 걸면 가격이 있는데 아주 싼 것처럼 읽히고,
// 지갑 화면(walScan 행)은 이미 무료로 그리므로 두 화면이 같은 값을 다르게 말하게 된다.
// 2026-08-17 사용자 결정으로 실제 COSTS.scan 이 0 이 되어 이 갈래가 상시 경로가 됐다.
test("가격이 0 인 행은 숫자가 아니라 무료로 적는다 — 지갑 화면과 같은 말을 한다", async () => {
  const wallet = spyWallet({ ok: true, state: { balance: 5 } }, { full: 30, custom: 0, scan: 0 });
  await withDomWallet(wallet, async (root) => {
    await toStep7(root);
    await flush();
    const nums = root.querySelector(".ob-costs").children
      .map(r => r.querySelector(".ob-cost-num").textContent);
    assert.strictEqual(nums[0], "30", "유료 행이 숫자를 잃었다");
    assert.strictEqual(nums[1], S.t.walFree,
      "무료 행이 '" + nums[1] + "' 로 그려졌다 — 0 을 값으로 걸면 싼 가격처럼 읽힌다");
  });
});

// 뮤테이션 (b): 실패 시 진행을 막으면 여기서 잡힌다 — 재시도 버튼은 뜨되 Continue 는 살아 있어야 한다.
test("지급 실패해도 진행이 막히지 않는다 — 재시도 버튼이 뜨고 계속하기는 눌린다", async () => {
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    await toStep7(root);
    await flush();
    const box = root.querySelector(".ob-grant");
    assert.strictEqual(box.textContent, S.t.obGrantOffline);
    assert.ok(root.querySelector(".ob-retry"), "재시도 버튼이 없다");
    assert.strictEqual(root.querySelector(".ob-next").disabled, false,
      "지갑 실패가 계속하기 버튼을 막았다");
  });
});

// 뮤테이션 (c): draw() 마다 재호출하면 여기서 잡힌다 — 3단계를 두 번 그려도 호출은 한 번이어야 한다.
//
// 리뷰 지적: 호출 횟수만 세면 "빈 화면"이 통과한다 — step3() 는 매번 새 빈 .ob-grant div 를
// 만들고, 그리기(paintGrant)는 state.grantStarted 가 가드하는 발신과는 별개로 매 진입마다
// 다시 불려야 한다. 호출 수뿐 아니라 텍스트도 반드시 같이 본다.

// Task 6(Q4) 이 뒤로가기를 2·3단계로 좁히면서 이 시험은 잴 경로를 잃었다 — 7단계엔 더는
// `.ob-back` 이 없고, 4단계 이후는 전진만이라 "7단계를 떠났다가 돌아온다" 자체가 새
// 설계에서 도달 불가능하다(step6 도 뒤로가기가 없어 7단계에서 6단계로도 못 돌아간다).
// 이 시험이 지키던 회귀(재진입 시 실패 안내가 사라지는 빈 화면)는 이제 재현할 UI 경로가
// 없으므로 지운다 — 아래 두 시험(실패해도 진행이 막히지 않는다 · 재시도가 지갑을 다시
// 부른다)이 같은 실패 상태의 나머지 절반(첫 렌더 정확성·수동 재시도)을 계속 지킨다.

// 재시도 버튼은 수동으로는 다시 부를 수 있어야 한다(위 가드는 자동 발신만 막는다).
test("재시도 버튼을 누르면 지갑을 다시 부른다", async () => {
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    await toStep7(root);
    await flush();
    assert.strictEqual(wallet.calls.length, 1);
    root.querySelector(".ob-retry").click();
    await flush();
    assert.strictEqual(wallet.calls.length, 2, "재시도 버튼이 지갑을 다시 안 불렀다");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════
// 시안 정본 7단계(DESIGN-INVENTORY §2, t17). 이전 5단계는 시안이 도착하기 이틀 전에 만든
// 자체 흐름이었고, P1 이 그것을 "기존 화면"으로 분류해 재스킨 대상으로 두면서 교체가
// 누락됐다 — 여기 관문은 그 누락이 되돌아오지 못하게 한다.
// ══════════════════════════════════════════════════════════════════════════════════

test("7단계다 — 시안 정본", () => { assert.strictEqual(O.STEPS, 7); });

test("각 단계가 요구하는 것: 찍기 · [2단계는 보여줄 뿐] · 성향 · 동의 · 종목 확정", () => {
  assert.equal(O.canAdvance(1, {}), false, "1단계는 직접 찍어야 넘어간다");
  assert.equal(O.canAdvance(1, { guessed: "up" }), true);
  // Task 4 재설계: 2단계는 32도구를 보여주는 화면이라 입력을 요구하지 않는다 — 옛 성향
  // 요구는 지웠다(성향 선택은 이후 태스크가 3단계에서 다시 짓는다).
  assert.equal(O.canAdvance(2, {}), true, "2단계는 32도구를 보여줄 뿐이라 입력을 요구하지 않는다");
  // Task 5(3단계 재설계): 성향 4종 중 1개가 선택돼 있어야 한다는 불변 — 기본값이 항상
  // 채워지므로 실사용에서 막히지는 않지만, 선택이 비어 있는 상태를 canAdvance 가 통과시켜선
  // 안 된다(단언 1 "1개 필수").
  assert.equal(O.canAdvance(3, {}), false, "3단계는 성향 선택이 필수다");
  assert.equal(O.canAdvance(3, { style: "momentum" }), true);
  // Task 6(4단계 — 동의): 체크박스 하나가 전부다. r1 같은 계산 결과와 무관하다 — 값이
  // 있어도 agreed 가 없으면 막혀야 한다(엔진 결과가 동의를 대신할 수 없다).
  assert.equal(O.canAdvance(4, {}), false, "4단계는 동의 체크가 필수다");
  assert.equal(O.canAdvance(4, { r1: {} }), false, "r1 이 있어도 동의를 대신하지 않는다");
  assert.equal(O.canAdvance(4, { agreed: true }), true);
  // Task 6(5단계 — 종목 선택·분석 시작): **state.pick(칩을 골랐다) 만으로는 안 열린다.**
  // 이것이 옛 버그("클릭만으로 분석 시작")의 정반대 증명이다 — 선택은 진행 조건이 아니다.
  // state.sym([분석 시작]이 확정한 값)만 진행을 연다. state.r1 이 있어도 sym 이 없으면
  // 막혀야 한다 — 진행 조건이 계산 결과의 부수 효과가 아니라는 것을 이 줄이 직접 증명한다.
  assert.equal(O.canAdvance(5, {}), false, "5단계는 아무것도 없으면 막힌다");
  assert.equal(O.canAdvance(5, { pick: { sym: "AAPL", name: "애플" } }), false,
    "칩을 고른 것(pick)만으로 진행이 열리면 안 된다 — 그게 옛 버그다");
  assert.equal(O.canAdvance(5, { r1: {}, r2: {} }), false,
    "r1/r2 계산 결과가 있어도 sym 이 없으면 막혀야 한다 — 진행 조건이 부수 효과면 안 된다");
  assert.equal(O.canAdvance(5, { sym: "AAPL" }), true, "sym 이 확정되면(=분석 시작을 눌렀으면) 열린다");
});

test("가격은 마지막에만 공개된다 — 값을 겪기 전에 숫자를 보여주지 않는다", () => {
  // 인벤토리 §2: "가격표를 먼저 보여주면 3스쿱이 그냥 숫자다." COSTS 를 읽는 자리가
  // 7단계(step7) 안에만 있어야 한다.
  const at = OB.indexOf("function step7");
  assert.ok(at > 0, "step7 이 없다");
  const before = OB.slice(0, at);
  assert.ok(before.indexOf("MSWallet.COSTS") < 0,
    "7단계보다 앞에서 가격표를 읽는다 — 값을 겪기 전에 가격이 나온다");
});

test("지급도 마지막이다 — 1~6단계에서 이탈하면 계정이 안 생긴다", () => {
  // 소스 위치가 아니라 **부르는 자리**로 잰다(fetchGrant 정의는 위에 있어도 된다).
  const calls = OB.match(/fetchGrant\(\)/g) || [];
  assert.ok(calls.length >= 1, "지급을 부르는 자리가 없다");
  const gate = OB.match(/if \(step === 7\)[\s\S]{0,200}?fetchGrant\(\)/);
  assert.ok(gate, "지급이 7단계 게이트 안에서 불리지 않는다");
});

// Task 6(5단계 재설계)로 옛 "체험 3종 고정" 개념(tutSyms/tutPicks, 시안 16a)이 사라졌다 —
// 5단계는 이제 ticker-picker.js 의 CURATED 8종(+직접 입력) 중 **하나**를 고르는 화면이고,
// 그 목록의 정본은 이미 ticker-picker.test.mjs("큐레이션 목록은 시안 12a 의 8종이다")가
// 지킨다. tutSyms/tutPicks 함수와 그 export 는 죽은 코드라 지웠다 — 이 시험도 함께 지운다.

// Task 4 재설계로 2단계가 32도구 화면으로 바뀌면서 성향 선택 UI(옛 step2)가 잠시
// 사라졌다 — 위 "성향 목록은 MSIndTiers.PRESETS 가 정본이다" 시험은 그 UI 를 재던 것이라
// 지금은 잴 대상이 없다(성향 선택은 이후 태스크가 3단계에서 다시 짓는다, 그때 이 시험도
// 그 자리에서 되살아난다). 지금 남겨 두면 "이 화면이 존재해야 한다"는 거짓 전제를 관문이
// 강제하게 된다 — 삭제가 맞다.

test("고른 성향이 실제로 쓰인다 — 죽은 컨트롤이 아니다", () => {
  const STORE = readFileSync(new URL("../www/store.js", import.meta.url), "utf8");
  const XP = readFileSync(new URL("../www/screens/expert.js", import.meta.url), "utf8");
  assert.match(STORE, /setStyle/, "store 에 성향을 저장할 자리가 없다");
  assert.match(OB, /setStyle\(/, "온보딩이 고른 성향을 저장하지 않는다");
  assert.match(XP, /getStyle/, "전문분석 편집기가 저장된 성향을 읽지 않는다 — 고르게만 하고 안 쓴다");
});

// Task 6(5단계 재설계)로 옛 "심화분석 체험"(시안 16b, 기본/심화 콘커버 두 막대 비교)이
// 사라졌다 — 그 화면이 지키던 진실 규칙(우리 엔진은 "범위가 절반으로 좁아진다"가 아니라
// "정직한 범위"다)은 화면 자체가 없어지며 검사 대상을 잃었다. 아래 인프라 시험(번들
// 실측 존재 확인)은 화면과 무관하게 유효하므로 남긴다.
test("번들 요약에 티어 실측이 실려 있다 — 없으면 그 블록을 그릴 수 없다", () => {
  const raw = readFileSync(new URL("../www/vendor/backtest-summary.js", import.meta.url), "utf8");
  const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  assert.ok(j.tiers && j.tiers.basic && j.tiers.deep, "tiers 가 없다 — sync-engine 이 안 실었다");
  ["coneCoverage", "calibrationECE", "directionHitRate"].forEach(k => {
    assert.equal(typeof j.tiers.basic[k], "number", "basic." + k);
    assert.equal(typeof j.tiers.deep[k], "number", "deep." + k);
  });
});

// coverGap() 도 옛 "심화분석 체험" 전용 헬퍼였다 — 함수·export 를 지웠으니 이 시험도 지운다.

// "전문분석 체험은 가중치를 두 경로에 함께 넘긴다"(recomputeCustom·state.trendW·슬라이더)도
// 옛 6단계 전용이었다 — Task 7 이 6단계를 "실제 분석"으로 갈아치우며 그 함수·상태·마크업을
// 통째로 지웠다(위 coverGap() 과 같은 부류). driftWeights/customGraph 리터럴은 소스에
// 계속 남지만(3단계 visibleStyle() 이 여전히 runTier("custom", wts) 로 성향 가중치를
// 쓴다 — 그 자리는 이 태스크가 손대지 않았다), 이 시험이 재던 대상(전문분석 체험) 자체가
// 없어졌으니 남겨두면 통과는 하되 거짓 전제("전문분석 체험이 있다")를 관문이 고정한다.

test("완료는 고른 종목만 심는다 — SEED 를 몰래 얹지 않는다", () => {
  const seeded = [];
  const store = { addTicker: (s, n) => seeded.push({ sym: s, name: n }), getWatchlist: () => seeded };
  O.seedTo(store, [{ sym: "AAPL", name: "애플" }]);
  assert.deepEqual(seeded, [{ sym: "AAPL", name: "애플" }]);
});

test("빈 항목은 심지 않는다 — 이름 없는 유령 종목이 생기지 않는다", () => {
  const seeded = [];
  const store = { addTicker: (s, n) => seeded.push({ sym: s, name: n }), getWatchlist: () => seeded };
  O.seedTo(store, [null, {}, { name: "이름만" }, { sym: "NVDA", name: "엔비디아" }]);
  assert.deepEqual(seeded, [{ sym: "NVDA", name: "엔비디아" }]);
});

// ══════════════════════════════════════════════════════════════════════════════════
// 1단계 재설계(2026-08-18) — 사인파 합성 → 실제 시세 구간 선별 + 지표 힌트 + 엔진 판독.
// "실제 조립을 재라"는 지시대로 소스 정규식이 아니라 vm+실제 DOM(withDom)으로 잰다.
// ══════════════════════════════════════════════════════════════════════════════════

// 실제 봉 데이터의 로그수익률 부호를 통째로 뒤집은 "거울" 표본을 만든다. 사인파 같은 인공
// 곡선 대신 쓰는 이유: 실제 변동성 결(노이즈 질감)은 그대로 두고 추세만 반대로 만들어야
// "번들을 바꾸면 해설이 바뀐다"를 인공적으로 조작한 것처럼 보이지 않는다. o/h/l 은 종가 대비
// 비율을 그대로 옮기므로(양수 배율은 h≥max(o,c)·l≤min(o,c) 부등식을 보존한다) 봉 정합성도
// 유지된다 — 실측(아래 첫 테스트)으로 SAMPLE 은 bull, 거울은 bear 로 갈라짐을 확인했다.
function mirrorSample(s) {
  var out = { price: [], candle: [] };
  var q = s.candle[0].c;
  var r0o = s.candle[0].o / s.candle[0].c, r0h = s.candle[0].h / s.candle[0].c, r0l = s.candle[0].l / s.candle[0].c;
  out.candle.push({ o: +(q * r0o).toFixed(4), h: +(q * r0h).toFixed(4), l: +(q * r0l).toFixed(4),
                     c: +q.toFixed(4), v: s.candle[0].v, t: s.candle[0].t });
  out.price.push(+q.toFixed(4));
  for (let i = 1; i < s.candle.length; i++) {
    const r = Math.log(s.candle[i].c / s.candle[i - 1].c);
    q = q * Math.exp(-r);
    const ro = s.candle[i].o / s.candle[i].c, rh = s.candle[i].h / s.candle[i].c, rl = s.candle[i].l / s.candle[i].c;
    out.candle.push({ o: +(q * ro).toFixed(4), h: +(q * rh).toFixed(4), l: +(q * rl).toFixed(4),
                       c: +q.toFixed(4), v: s.candle[i].v, t: s.candle[i].t });
    out.price.push(+q.toFixed(4));
  }
  out.asOf = out.candle[out.candle.length - 1].t;
  return out;
}

test("1단계는 지표 레이어를 실제로 그린다 — 축·캔들만이 아니다", () => {
  withDom((root, spy) => {
    O.render(root, { sample: SAMPLE });
    assert.ok(spy.ma >= 1, "MA 오버레이(MSLayers.ma)를 부르지 않았다");
    assert.ok(spy.bollinger >= 1, "볼린저 오버레이(MSLayers.bollinger)를 부르지 않았다");
    assert.ok(spy.volumePanel >= 1, "거래량 서브패널(MSPanels.volume)을 부르지 않았다");
    // 찍은 뒤(가려졌던 봉을 여는 화면)에도 세 레이어가 계속 그려져야 한다 — 힌트만 보여주고
    // 결과 화면에서 사라지면 "왜 이렇게 됐는지"를 다시 볼 수 없다.
    const before = { ma: spy.ma, bollinger: spy.bollinger, volumePanel: spy.volumePanel };
    root.querySelector(".ob-guess-btn").click();
    assert.ok(spy.ma > before.ma, "찍은 뒤 MA 오버레이를 다시 안 그린다");
    assert.ok(spy.bollinger > before.bollinger, "찍은 뒤 볼린저 오버레이를 다시 안 그린다");
    assert.ok(spy.volumePanel > before.volumePanel, "찍은 뒤 거래량 패널을 다시 안 그린다");
  });
});

test("힌트 줄은 그려진 도구 수와 정확히 같다 — MA·볼린저·거래량 3개", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    const rows = root.querySelectorAll(".ob-tool");
    assert.strictEqual(rows.length, 3, "힌트 줄이 3개가 아니다: " + rows.length);
    const names = Array.from(rows).map(r => r.querySelector(".ob-tool-name").textContent);
    assert.deepStrictEqual(names, [S.ind("ma"), S.ind("bollinger"), S.ind("volume")],
      "힌트 도구 이름·순서가 실제 작도(MA→볼린저→거래량)와 다르다");
    rows.forEach(r => {
      assert.ok(r.querySelector(".ob-tool-hint").textContent.length > 0, r.className + " 의 설명이 비어 있다");
    });
    // 찍기 전 화면에만 있다 — 결과 화면은 힌트 대신 판독을 보여준다(같은 자리에 둘 다
    // 뜨면 화면이 붐빈다).
    root.querySelector(".ob-guess-btn").click();
    assert.strictEqual(root.querySelectorAll(".ob-tool").length, 0, "찍은 뒤에도 힌트가 남아 있다");
  });
});

test("판독은 지금 계산한 것이다 — 렌더 시점에 엔진을 실제로 부른다(하드코딩이 아니다)", () => {
  withDom((root, spy) => {
    O.render(root, { sample: SAMPLE });
    root.querySelector(".ob-guess-btn").click();
    assert.ok(spy.readings.length >= 1, "MSIndicators.readings 를 부르지 않았다 — 결과가 미리 구운 문구다");
    const call = spy.readings[spy.readings.length - 1];
    // 가려진 12봉을 뺀 228봉만 봤어야 한다 — 정답을 미리 안 상태에서 판정한 것이어야 한다.
    const expectedN = Math.max(30, SAMPLE.candle.length - 12);
    assert.strictEqual(call.data.price.length, expectedN,
      "판독이 가려진 구간까지 포함해서 계산했다 — 찍기 전 정보만 써야 한다");
    // DOM 에 실제로 실린 근거/반대 행 텍스트가 이 호출의 rows 와 정확히 같은 문자열이어야
    // 한다 — 화면이 별도로 문구를 지어내지 않았다는 증거.
    const domTexts = Array.from(root.querySelectorAll(".ob-read-text")).map(e => e.textContent);
    const rowTexts = call.rows.filter(r => ["ma", "bollinger", "volume"].indexOf(r.type) >= 0).map(r => r.text);
    domTexts.forEach(t => assert.ok(rowTexts.indexOf(t) >= 0, "DOM 문구 '" + t + "' 가 엔진 rows 에 없다"));
    assert.ok(domTexts.length > 0, "판독 행이 화면에 하나도 없다");
  });
});

test("판독은 데이터가 바뀌면 함께 바뀐다 — 같은 문구를 고정해 두지 않았다", () => {
  const mirror = mirrorSample(SAMPLE);
  let upVerdict, downVerdict;
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    root.querySelector(".ob-guess-btn").click();
    upVerdict = root.querySelector(".ob-read-verdict").textContent;
  });
  withDom(root => {
    O.render(root, { sample: mirror });
    root.querySelector(".ob-guess-btn").click();
    downVerdict = root.querySelector(".ob-read-verdict").textContent;
  });
  assert.notStrictEqual(upVerdict, downVerdict,
    "추세를 뒤집은 표본인데 판정 문구가 똑같다 — 하드코딩된 것으로 보인다");
  assert.ok(upVerdict.indexOf(S.t.rpBullish) >= 0, "번들 표본은 상승 판정이어야 한다: " + upVerdict);
  assert.ok(downVerdict.indexOf(S.t.rpBearish) >= 0, "거울 표본은 하락 판정이어야 한다: " + downVerdict);
});

test("맞힘·틀림 두 갈래가 둘 다 렌더된다 — 한쪽만 재고 넘어가지 않는다", () => {
  let rightSeen = false, wrongSeen = false;
  ["up", "down"].forEach(dir => {
    withDom(root => {
      O.render(root, { sample: SAMPLE });
      root.querySelectorAll(".ob-guess-btn")[dir === "up" ? 0 : 1].click();
      const tail = root.querySelector(".ob-tail");
      assert.ok(tail && tail.textContent.length > 0, dir + " 를 찍었는데 갈래 문구가 없다");
      if (tail.textContent.indexOf(S.t.obTailRightB) >= 0) rightSeen = true;
      if (tail.textContent.indexOf(S.t.obTailWrongB) >= 0) wrongSeen = true;
    });
  });
  // 정답은 하나뿐이므로 up/down 을 각각 찍으면 반드시 하나는 맞고 하나는 틀린다 — 둘 다
  // 관측돼야 두 갈래 모두 실제로 렌더됨이 증명된다(한쪽만 항상 렌더되는 결함을 잡는다).
  assert.ok(rightSeen, "맞힘 갈래가 한 번도 안 보였다");
  assert.ok(wrongSeen, "틀림 갈래가 한 번도 안 보였다");
});

// ══════════════════════════════════════════════════════════════════════════════════
// Task 3(1단계 재설계) — x축 기준(주기·기간) + 당신/앱/실제 3열 대조. 브리프 단언 5건.
// ══════════════════════════════════════════════════════════════════════════════════

test("차트 상단에 주기와 기간이 있다 — 일봉인지 주봉인지, 어느 구간인지 모른다는 원 판정에 대한 답", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    const p = root.querySelector(".ob-period");
    assert.ok(p && p.textContent, "주기·기간 표기 노드가 없다");
    assert.ok(p.textContent.indexOf(S.t.rpDaily) >= 0, "주기(일봉) 표기가 없다: " + p.textContent);
    // 표본 첫 봉은 2023-06-02, 가려진 뒤(228봉)의 마지막은 2024-04-29 — 연월로 둘 다 있어야 한다.
    assert.ok(p.textContent.indexOf("2023.06") >= 0, "시작 연월이 없다: " + p.textContent);
    assert.ok(p.textContent.indexOf("2024.04") >= 0, "종료 연월(가려진 뒤)이 없다: " + p.textContent);
    // 찍은 뒤엔 가려졌던 12봉까지 열려 종료 연월이 2024.05 로 넘어간다 — 그림과 라벨이 같은
    // 구간을 말해야 한다(paintGuess 와 같은 데이터 소스를 읽는지 확인).
    root.querySelector(".ob-guess-btn").click();
    const p2 = root.querySelector(".ob-period");
    assert.ok(p2.textContent.indexOf("2024.05") >= 0, "찍은 뒤 종료 연월이 안 넘어간다: " + p2.textContent);
  });
});

test("찍은 뒤 당신/앱/실제 3열이 있고 셋 다 값이 채워진다", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    root.querySelector(".ob-guess-btn").click();
    const cols = root.querySelectorAll(".ob-col");
    assert.strictEqual(cols.length, 3, "3열이 아니다: " + cols.length);
    const you = deepText(root.querySelector(".ob-col-you")), app = deepText(root.querySelector(".ob-col-app")),
          actual = deepText(root.querySelector(".ob-col-actual"));
    [you, app, actual].forEach((t, i) => {
      assert.ok(t && t.trim().length > 0, ["당신", "앱", "실제"][i] + " 열이 비어 있다");
    });
    assert.ok(you.indexOf(S.t.obGuessUp) >= 0 || you.indexOf(S.t.obGuessDown) >= 0,
      "당신 열에 실제로 찍은 값이 없다: " + you);
    assert.ok(actual.indexOf(S.t.obGuessActualUp) >= 0 || actual.indexOf(S.t.obGuessActualDown) >= 0,
      "실제 열에 실제 결과 값이 없다: " + actual);
  });
});

test("앱 열에 확신 퍼센트가 없다 — 5도구는 값 여섯 개뿐이라 확률로 오독된다", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    root.querySelector(".ob-guess-btn").click();
    const app = deepText(root.querySelector(".ob-col-app"));
    // 먼저 내용이 실제로 있는지 확인한다 — 빈 문자열이면 아래 doesNotMatch 가 공허하게 통과한다.
    assert.ok(app && app.trim().length > 0, "앱 열이 비어 있다 — 이 검사가 무의미해진다");
    assert.doesNotMatch(app, /%/, "앱 열에 퍼센트가 있다: " + app);
  });
});

// 콘질 조작 없이(브리프 단언 4) 앞 228봉은 번들 그대로 두고(그래서 찍기 전 판정은 실측된
// bull 그대로다) 가려진 마지막 12봉만 급락으로 갈아끼운다 — "앱은 방향을 하나 골랐고, 실제는
// 반대로 갔다"를 인위적 사인파가 아니라 최소 개입으로 만든다. 실측(node 로 확인, 위 브리핑
// 참고): 이 표본은 regime=bull·실제=하락으로 결정적이다.
function wrongSample(s) {
  var CUT = 12;
  var base = s.candle.slice(0, s.candle.length - CUT);   // 찍기 전 228봉은 손대지 않는다
  var candle = base.slice(), price = base.map(function (c) { return c.c; });
  var d = new Date(base[base.length - 1].t + "T00:00:00Z");
  var c = base[base.length - 1].c;
  for (var i = 0; i < CUT; i++) {
    c = c * 0.94;                                          // 12봉 연속 급락
    d.setUTCDate(d.getUTCDate() + 1);
    var o = c * 1.01, h = Math.max(o, c) * 1.01, l = Math.min(o, c) * 0.99;
    candle.push({ o: +o.toFixed(4), h: +h.toFixed(4), l: +l.toFixed(4), c: +c.toFixed(4),
                  v: 5000000, t: d.toISOString().slice(0, 10) });
    price.push(+c.toFixed(4));
  }
  return { price: price, candle: candle, asOf: candle[candle.length - 1].t };
}

test("앱이 틀린 표본을 주입하면 앱 열이 틀렸다고 쓴다 — 맞은 경우만 골라 넘어가지 않는다", () => {
  withDom(root => {
    const bad = wrongSample(SAMPLE);
    O.render(root, { sample: bad });
    root.querySelector(".ob-guess-btn").click();   // 방향은 무관하다 — 앱 자신의 판정만 잰다
    const app = deepText(root.querySelector(".ob-col-app"));
    assert.match(app, /틀렸/, "앱이 틀렸는데 앱 열이 틀렸다고 안 쓴다: " + app);
    // 맞은 표본(번들 SAMPLE)에서는 반대로 "맞았다"가 실제로 렌더돼야 한다 — 한쪽만 도는
    // 문구가 아니라는 증거(브리프: "맞은 표본만 골라 보여주지 않는다"의 반증 갈래).
    withDom(root2 => {
      O.render(root2, { sample: SAMPLE });
      root2.querySelector(".ob-guess-btn").click();
      const app2 = deepText(root2.querySelector(".ob-col-app"));
      assert.match(app2, /맞았/, "맞은 표본인데 앱 열이 맞았다고 안 쓴다: " + app2);
    });
  });
});

test("\"앱은 도구 5개만 보고 이렇게 말했습니다\" 문구가 있다 — 2단계를 벌어들이는 줄", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    root.querySelector(".ob-guess-btn").click();
    const note = root.querySelector(".ob-app-note");
    assert.ok(note, "앱 도구 개수 안내 문구가 없다");
    const G = require("../www/graph.js");
    assert.strictEqual(note.textContent, S.t.obAppSawA + G.BASIC.length + S.t.obAppSawB,
      "문구가 MSGraph.BASIC.length 를 안 따라간다(리터럴로 박혔을 수 있다): " + note.textContent);
    assert.ok(note.textContent.indexOf("5") >= 0, "기본분석 도구 수(5)가 안 보인다: " + note.textContent);
  });
});

test("예시 데이터임이 화면에 표기된다 — 성적이 아니라 예시 한 건이다", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    const note = root.querySelector(".ob-over");
    assert.strictEqual(note && note.textContent, S.t.obSampleNote, "예시 데이터 표기가 없다");
    // 찍은 뒤에도 표기가 사라지면 안 된다 — 결과 화면이야말로 "이건 성적이 아니다"를 잊기 쉽다.
    root.querySelector(".ob-guess-btn").click();
    const note2 = root.querySelector(".ob-over");
    assert.strictEqual(note2 && note2.textContent, S.t.obSampleNote, "찍은 뒤 예시 데이터 표기가 사라진다");
  });
});

test("엔진을 못 돌리면 판독 대신 이유를 말한다 — 첫 화면이 깨지지 않는다", () => {
  withDom(root => {
    // visibleAnalysis() 는 처음 성공하면 sample 참조로 캐싱한다 — render 뒤에 지우면 이미
    // 계산해 둔 분석을 그대로 돌려주므로 "엔진이 없다"를 재현하지 못한다. render 전에 지운다.
    delete globalThis.ForgeCore;   // 엔진 로드 실패(스크립트 누락 등)를 흉내낸다
    O.render(root, { sample: SAMPLE });
    assert.doesNotThrow(() => root.querySelector(".ob-guess-btn").click(),
      "엔진이 없을 때 클릭이 던진다 — 콜드오픈 첫 화면이 깨진다");
    const empty = root.querySelector(".ob-read-empty");
    assert.strictEqual(empty && empty.textContent, S.t.obReadUnavailable,
      "엔진 부재 시 대체 문구가 안 뜬다");
    // 맞힘/틀림 갈래는 엔진과 무관(가려진 봉 실제 값 비교일 뿐)하므로 계속 렌더돼야 한다.
    const tail = root.querySelector(".ob-tail");
    assert.ok(tail && tail.textContent.length > 0, "엔진이 없어도 맞힘/틀림 갈래는 계속 렌더돼야 한다");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════
// Task 4(2단계 재설계) — 같은 구간, 32개 전부. 브리프 단언 5건.
// ══════════════════════════════════════════════════════════════════════════════════

// 1단계(찍기)를 채우고 2단계로 넘어간다 — canAdvance(1,{}) 가 guessed 를 요구하므로 클릭
// 없이는 .ob-next 가 막혀 있다.
function toStep2(root, sampleObj) {
  O.render(root, { sample: sampleObj });
  root.querySelector(".ob-guess-btn").click();
  root.querySelector(".ob-next").click();
}

// 2단계(32도구)는 입력 없이 넘어간다 — 1 -> 2 -> 3.
function toStep3(root, sampleObj) {
  toStep2(root, sampleObj);
  root.querySelector(".ob-next").click();
}

// 반대(dissent)가 더 많이 나오는 표본 — 마지막 12봉(가려지는 구간)은 그대로 두고, 보이는
// 228봉 전체에 진폭 3%·주기 20봉의 사인파를 얹는다. node 로 실측: regime=bull·반대 7건
// (기본 표본의 2건보다 뚜렷이 많다 — "반대가 접기 문턱을 넘어도 전부 그려지는가"를 재려면
// 기본 표본 하나로는 부족하다).
function manyDissentSample() {
  const CUT = 12, AMP = 0.03, PERIOD = 20;
  const base = SAMPLE.candle.slice(0, SAMPLE.candle.length - CUT);
  const candle = base.map((c, i) => {
    const f = 1 + AMP * Math.sin(2 * Math.PI * i / PERIOD);
    const cl = c.c * f;
    const o = cl * 1.005, h = Math.max(o, cl) * 1.01, l = Math.min(o, cl) * 0.99;
    return { o: +o.toFixed(4), h: +h.toFixed(4), l: +l.toFixed(4), c: +cl.toFixed(4), v: c.v, t: c.t };
  });
  const tail = SAMPLE.candle.slice(SAMPLE.candle.length - CUT);
  const full = candle.concat(tail);
  return { price: full.map(c => c.c), candle: full, asOf: full[full.length - 1].t };
}

// 5도구 판정과 32도구 판정이 실제로 갈리는 표본 — 보이는 228봉 중 마지막 20봉을 각각
// 원래 종가 대비 -3% 로 눌러 놓는다(가려지는 12봉은 손대지 않는다). node 로 실측:
// 5도구(basic)는 bull 을 유지하지만 32도구(full)는 neutral 로 갈린다 — 추가된 27개
// 지표가 최근 힘 빠짐을 더 크게 반영하기 때문이다.
function divergeSample() {
  const CUT = 12, TAIL_N = 20, MAG = -0.03;
  const base = SAMPLE.candle.slice(0, SAMPLE.candle.length - CUT);
  const candle = base.map(c => Object.assign({}, c));
  const m = candle.length;
  for (let i = m - TAIL_N; i < m; i++) {
    const c = base[i].c * (1 + MAG);
    const o = c * 1.005, h = Math.max(o, c) * 1.01, l = Math.min(o, c) * 0.99;
    candle[i] = { o: +o.toFixed(4), h: +h.toFixed(4), l: +l.toFixed(4), c: +c.toFixed(4), v: base[i].v, t: base[i].t };
  }
  const tail = SAMPLE.candle.slice(SAMPLE.candle.length - CUT);
  const full = candle.concat(tail);
  return { price: full.map(c => c.c), candle: full, asOf: full[full.length - 1].t };
}

// 리뷰(2026-08-19 Important) — 거래량이 없는 표본. www/screens/onboarding.js 의
// classifyFull32() 가 MSReadings.voiced() 를 거치지 않던 시절엔 mfi·cmf 가 스스로
// "이 종목은 거래량 데이터가 없습니다"라고 자백해 놓고도 "동의"에 세어졌다(리뷰어 실측:
// ALL agree=22 dissent=2 flat=6 대 VOICED agree=18 dissent=2 flat=4, mfi·cmf 가 각각
// ALL agree=true, VOICED agree=false). 마지막 12봉(가려지는 구간)은 그대로 두고 보이는
// 228봉의 거래량만 지운다 — sliced() 가 읽는 자리 그대로다.
function noVolumeSample() {
  const CUT = 12;
  const base = SAMPLE.candle.slice(0, SAMPLE.candle.length - CUT).map(c => {
    const d = Object.assign({}, c); delete d.v; return d;
  });
  const tail = SAMPLE.candle.slice(SAMPLE.candle.length - CUT);
  const full = base.concat(tail);
  return { price: full.map(c => c.c), candle: full, asOf: full[full.length - 1].t };
}

// 단언 1 — 동의·반대·무판정·자백(못 읽음) 네 통의 합이 32와 같다. 네 값은 DOM 의
// .ob32-sec-count(각 섹션이 자기 list.length 를 그대로 적은 것) 에서 읽는다 — 접힌
// 섹션도 count 는 전체 개수를 담고 있으므로 "실제 분류 결과"를 그대로 재는 것이다
// (하드코딩 32 대 하드코딩 합의 항등식이 아니다 — 32는 이 시험이 아는 외부 불변, 네
// 값은 실행 결과다). 리뷰 Important — 자백 통을 32에서 조용히 빼면 그 자체가 불투명
// 하므로, 번들 표본(거래량 있음, 자백 0~1건)과 거래량 없는 표본(자백 여러 건) 둘 다에서
// 합이 32를 유지하는지 잰다 — 0건일 때만 재면 자백 통이 실제로 채워지는 경로를 안 잰다.
test("2단계 — 동의·반대·무판정·자백 네 통의 합이 32와 같다(실제 분류 결과에서 센다)", () => {
  withDom(root => {
    toStep2(root, SAMPLE);
    const counts = Array.from(root.querySelectorAll(".ob32-sec-count")).map(e => Number(e.textContent));
    assert.strictEqual(counts.length, 4, "동의·반대·무판정·자백 네 섹션이 다 있어야 한다: " + counts.length);
    const sum = counts.reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, 32, "네 통의 합이 32가 아니다(" + counts.join("+") + "=" + sum + ")");
  });
  withDom(root => {
    toStep2(root, noVolumeSample());
    const counts = Array.from(root.querySelectorAll(".ob32-sec-count")).map(e => Number(e.textContent));
    assert.strictEqual(counts.length, 4, "거래량 없는 표본에서도 네 섹션이 다 있어야 한다: " + counts.length);
    const sum = counts.reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, 32, "거래량 없는 표본에서 네 통의 합이 32가 아니다(" + counts.join("+") + "=" + sum + ")");
  });
});

// 단언 1 보강 — 자백 통이 실제로 채워지는 경로를 직접 잰다("0건일 때만 도는 시험은
// 아무것도 안 잰다"는 리뷰 지적에 대한 답). mfi·cmf 처럼 거래량에 의존하는 지표는
// voiced() 가 걸러내 동의/반대 어디에도 안 들어가고, 자백 섹션에 이름과 자백 문구로
// 노출되며, 방향 기여도(숫자)는 보이지 않는다(자백 행은 "사실이 아닌 수치"를 감춘다).
test("2단계 — 거래량 없는 표본에서 자백(못 읽음) 통이 실제로 채워진다", () => {
  withDom(root => {
    toStep2(root, noVolumeSample());
    const sec = root.querySelector(".ob32-sec-refused");
    assert.ok(sec, "자백 섹션이 없다");
    const count = Number(sec.querySelector(".ob32-sec-count").textContent);
    assert.ok(count > 0, "거래량 없는 표본인데 자백이 0건이다 — voiced() 를 실제로 거치지 않는다");
    const names = Array.from(sec.querySelectorAll(".ob32-row")).map(r => r.querySelector(".ob32-name").textContent);
    assert.ok(names.indexOf(S.ind("mfi")) >= 0 || names.indexOf(S.ind("cmf")) >= 0 || names.indexOf(S.ind("vwap")) >= 0,
      "거래량 의존 지표(mfi/cmf/vwap)가 자백 통에 하나도 없다: " + names.join(", "));
    // 자백 행엔 방향 기여도(숫자)를 안 보인다 — 그 값은 합성 거래량 등으로 계산된
    // "사실이 아닌 수치"다(readings.js 머리말 규율 4).
    Array.from(sec.querySelectorAll(".ob32-row")).forEach(r => {
      assert.strictEqual(r.querySelector(".ob32-bias"), null,
        r.querySelector(".ob32-name").textContent + " 자백 행에 수치가 보인다 — 못 읽었다면서 숫자를 댄다");
    });
  });
  // 번들 표본(거래량 있음)과 대조 — 같은 지표(mfi)가 거래량이 있을 땐 동의/반대/무판정
  // 어딘가에 정상적으로 들어가야 한다(자백 통이 항상 도는 죽은 가지가 아님을 증명).
  withDom(root => {
    toStep2(root, SAMPLE);
    const refusedSec = root.querySelector(".ob32-sec-refused");
    const refusedNames = refusedSec ? Array.from(refusedSec.querySelectorAll(".ob32-row"))
      .map(r => r.querySelector(".ob32-name").textContent) : [];
    assert.ok(refusedNames.indexOf(S.ind("mfi")) < 0, "거래량이 있는 번들 표본인데 mfi 가 자백 통에 있다");
  });
});

// 단언 2 — 반대는 개수와 무관하게 접히지 않는다. 작은 표본(2건)·큰 표본(7건) 둘 다
// "펼치기 버튼이 없고, count 만큼 행이 전부 그려진다"를 재야 한다 — 작은 쪽만 재면
// "우연히 문턱 밑이라 안 접혔다"를 반대와 구분할 수 없다.
test("2단계 — 반대 도구가 접혀 있지 않다(개수가 늘어도 전부 그려진다)", () => {
  withDom(root => {
    toStep2(root, SAMPLE);
    const sec = root.querySelector(".ob32-sec-dissent");
    assert.ok(sec, "반대 섹션이 없다");
    const count = Number(sec.querySelector(".ob32-sec-count").textContent);
    assert.ok(count > 0, "이 표본은 반대가 있어야 의미 있는 시험이다: " + count);
    assert.strictEqual(sec.querySelector(".ob32-expand"), null, "반대 섹션에 펼치기 버튼이 있다 — 접혀 있다는 뜻이다");
    assert.strictEqual(sec.querySelectorAll(".ob32-row").length, count,
      "반대 " + count + "건 중 일부만 그려졌다");
  });
  withDom(root => {
    toStep2(root, manyDissentSample());
    const sec = root.querySelector(".ob32-sec-dissent");
    const count = Number(sec.querySelector(".ob32-sec-count").textContent);
    assert.ok(count >= 6, "반대를 늘리려는 표본인데 " + count + "건뿐이다 — 변이가 약하다");
    assert.strictEqual(sec.querySelector(".ob32-expand"), null,
      "반대가 " + count + "건으로 늘어나자 펼치기 버튼이 생겼다 — 접힌다는 뜻");
    assert.strictEqual(sec.querySelectorAll(".ob32-row").length, count,
      "반대가 늘어나자(" + count + "건) 일부만 그려졌다");
  });
});

// 단언 3 — 각 도구 행에 이름(영어) · 무엇을 봤는지 · 실측 수치가 있다. 동의·반대 행(둘 다
// bias 를 갖는다)에서 잰다 — trend·phasefold(무판정 쪽)는 구조적으로 bias 가 없어(readings.js
// NO_BIAS) 이 시험의 대상이 아니다.
test("2단계 — 각 도구 행에 이름(영어) · 무엇을 봤는지 · 실측 수치가 있다", () => {
  withDom(root => {
    toStep2(root, SAMPLE);
    // 이 저장소의 가짜 DOM(El.querySelectorAll) 은 단일 클래스 선택자만 지원한다(콤마·
    // 후손 결합자 없음) — 두 섹션을 각각 스코프로 잡아 합친다.
    const agreeSec = root.querySelector(".ob32-sec-agree"), dissentSec = root.querySelector(".ob32-sec-dissent");
    const rows = [...agreeSec.querySelectorAll(".ob32-row"), ...dissentSec.querySelectorAll(".ob32-row")];
    assert.ok(rows.length > 0, "동의·반대 행이 하나도 없다");
    Array.from(rows).forEach(row => {
      const name = row.querySelector(".ob32-name");
      const text = row.querySelector(".ob32-text");
      const bias = row.querySelector(".ob32-bias");
      assert.ok(name && name.textContent.trim().length > 0, "이름이 비었다");
      assert.match(name.textContent, /^[A-Za-z][A-Za-z0-9 /%.]*$/, "이름이 영어가 아니다: " + name.textContent);
      assert.ok(text && text.textContent.trim().length > 0, "무엇을 봤는지 문구가 비었다: " + name.textContent);
      assert.ok(bias && /^[+-]\d/.test(bias.textContent), name.textContent + " 행에 실측 수치(방향 기여도)가 없다");
    });
  });
});

// 단언 4 — 5도구 판정과 32도구 판정이 나란히 있다.
test("2단계 — 5도구 판정과 32도구 판정이 나란히 있다", () => {
  withDom(root => {
    toStep2(root, SAMPLE);
    const rows = root.querySelectorAll(".ob32-cmp-row");
    assert.strictEqual(rows.length, 2, "5도구·32도구 판정 행이 2개가 아니다: " + rows.length);
    const k0 = rows[0].querySelector(".ob32-cmp-k").textContent;
    const k1 = rows[1].querySelector(".ob32-cmp-k").textContent;
    const G = require("../www/graph.js"), FC = require("../../forge-core.js");
    assert.ok(k0.indexOf(String(G.BASIC.length)) >= 0, "첫 행이 5도구 판정이 아니다: " + k0);
    assert.ok(k1.indexOf(String(FC.indicatorCount)) >= 0, "둘째 행이 32도구 판정이 아니다: " + k1);
    const words = [S.t.rpBullish, S.t.rpBearish, S.t.rpFlat];
    [rows[0], rows[1]].forEach(r => {
      const v = r.querySelector(".ob32-cmp-v").textContent;
      assert.ok(words.indexOf(v) >= 0, "판정 값이 판정어가 아니다: " + v);
    });
  });
});

// 단언 5 — 두 판정이 같을 때도, 다를 때도 화면이 성립한다. 다를 때만 재고 넘어가면 그
// 갈래가 영영 안 돈다(이 표본에서 5·32 도구 판정은 실제로 같을 공산이 크다 — 그래서
// "같을 때" 를 기본 표본으로, "다를 때" 를 별도 변이 표본(divergeSample)으로 각각 돈다).
test("2단계 — 두 판정이 같을 때도, 다를 때도 화면이 성립한다(양쪽 다 실제로 돈다)", () => {
  withDom(root => {
    toStep2(root, SAMPLE);   // 실측: 이 표본은 5도구·32도구 판정이 같다(둘 다 bull)
    const note = root.querySelector(".ob32-verdict-note");
    assert.ok(note, "판정 비교 문구가 없다");
    assert.ok(note.className.indexOf("is-same") >= 0, "같은 판정인데 is-same 이 아니다: " + note.className);
    assert.strictEqual(note.textContent, S.t.ob32SameNote, "같을 때 문구가 다르다: " + note.textContent);
  });
  withDom(root => {
    toStep2(root, divergeSample());   // 실측: 5도구=bull, 32도구=neutral
    const note = root.querySelector(".ob32-verdict-note");
    assert.ok(note, "판정 비교 문구가 없다");
    assert.ok(note.className.indexOf("is-diff") >= 0, "다른 판정인데 is-diff 가 아니다: " + note.className);
    assert.ok(note.textContent.indexOf(S.t.rpBullish) >= 0 && note.textContent.indexOf(S.t.rpFlat) >= 0,
      "다를 때 문구에 두 판정어가 둘 다 있어야 한다: " + note.textContent);
  });
});

// state 캐시 — 3단계(성향)가 32도구 결과를 비교 기준으로 쓴다(브리프 Produces).
test("2단계 — 32도구 결과가 state.full32 에 캐시된다", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    root.querySelector(".ob-guess-btn").click();
    root.querySelector(".ob-next").click();
    // render() 의 내부 state 는 밖에서 안 보이므로, 캐시가 실제로 동작한다는 사실은 DOM
    // 자체가 증언한다(값이 그려졌다는 것은 계산되고 어딘가에 있었다는 뜻) — 소스에
    // "state.full32" 대입문이 있는지로 이중 확인한다(리터럴이 아니라 실제 배선인지).
    assert.match(OB, /state\.full32\s*=/, "32도구 결과를 state 에 캐시하는 대입문이 없다");
    assert.ok(root.querySelector(".ob32-cmp"), "캐시 이전에 화면 자체가 안 그려졌다");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════
// Task 5(3단계 재설계) — 성향을 고르면 같은 구간의 판정·근거가 실제로 갱신된다.
// 브리프 단언 5건. Task 1 실측(확정 표본 PG, sliced 228봉)이 이 화면의 전제다:
// trend=bull(9종) · momentum=neutral(6종, 경계 ±12에서 score 11) · reversion=bull(9종) ·
// volatility=bull(9종) — 32도구(state.full32)도 bull 이라 4종 중 momentum 만 갈린다.
// ══════════════════════════════════════════════════════════════════════════════════

// 성향 이름으로 카드를 찾아 클릭한다 — PRESETS 배열 순서에 기대지 않는다(순서가 바뀌어도
// 시험이 안 깨진다). ind-tiers.js 가 이름의 정본이다(expert.js 가 이미 같은 방식으로 읽는다).
function pickStyle(root, key) {
  const Tiers = require("../www/ind-tiers.js");
  const p = Tiers.PRESETS.filter(x => x.key === key)[0];
  assert.ok(p, "프리셋을 못 찾았다: " + key);
  const btn = root.querySelectorAll(".ob-style").filter(b => b.querySelector(".ob-style-name").textContent === p.name)[0];
  assert.ok(btn, "성향 버튼을 못 찾았다: " + key + "(" + p.name + ")");
  btn.click();
  return { preset: p, btn };
}

// "판정·근거가 갱신됐다"를 문자열 전체 비교로 재면 사소한 차이로도 통과한다(브리프 경고) —
// 그래서 무엇이 달라졌는지를 구체적으로 짚는다: 네 통의 개수(동의·반대·무판정·자백, 순서
// 고정)와 비교 행의 두 번째 값(성향 기준 판정어)을 이어붙인 서명이다.
function sig3(root) {
  const counts = root.querySelectorAll(".ob32-sec-count").map(e => e.textContent);
  const rows = root.querySelectorAll(".ob32-cmp-row");
  const v = rows[1] ? rows[1].querySelector(".ob32-cmp-v").textContent : "";
  return counts.join(",") + "|" + v;
}

// 단언 1 — 성향 4종이 있고 언제나 정확히 1개가 선택돼 있다("1개 필수").
test("3단계 — 성향 4종이 있고, 언제나 정확히 1개가 선택돼 있다", () => {
  withDom(root => {
    toStep3(root, SAMPLE);
    const btns = root.querySelectorAll(".ob-style");
    assert.strictEqual(btns.length, 4, "성향 카드가 4개가 아니다: " + btns.length);
    const on = btns.filter(b => b.className.indexOf("is-on") >= 0);
    assert.strictEqual(on.length, 1, "선택된 성향이 정확히 1개가 아니다: " + on.length);
  });
  // 순수 함수 쪽도 같은 불변을 지킨다 — 선택이 비어 있으면 진행을 막는다.
  assert.equal(O.canAdvance(3, {}), false, "3단계는 성향 선택이 필수다");
  assert.equal(O.canAdvance(3, { style: "momentum" }), true);
});

// 단언 5 — "여기까지는 과거였습니다" 전환 문구. 1·2단계(고정된 방식)가 끝났고, 이제부터는
// 사용자가 고른 방식으로 본다는 경계선이다.
test("3단계 — \"여기까지는 과거였습니다\" 전환 문구가 있다", () => {
  withDom(root => {
    toStep3(root, SAMPLE);
    const over = root.querySelector(".ob-over");
    assert.ok(over && over.textContent, "전환 문구 노드가 없다");
    assert.strictEqual(over.textContent, S.t.obPastDone, "전환 문구가 다르다: " + over.textContent);
    assert.match(over.textContent, /과거/, "전환 문구에 '과거'가 없다: " + over.textContent);
  });
});

// 단언 2 — 고르면 같은 구간의 판정·근거가 갱신된다. momentum 은 이 표본에서 판정 단어
// 자체가 bull → neutral 로 실제로 갈린다(Task 1 실측) — 가장 강한 형태의 증명이다.
test("3단계 — 고르면 같은 구간의 판정·근거가 실제로 갱신된다(momentum 은 판정 자체가 바뀐다)", () => {
  withDom(root => {
    toStep3(root, SAMPLE);   // 기본 선택은 trend — 32도구와 같은 결론(bull)이다.
    const before = sig3(root);
    pickStyle(root, "momentum");
    const after = sig3(root);
    assert.notStrictEqual(before, after, "성향을 바꿨는데 화면(판정+근거 구성)이 그대로다");
    const note = root.querySelector(".ob32-verdict-note");
    assert.ok(note && note.textContent, "판정 비교 문구가 없다");
    assert.ok(note.className.indexOf("is-diff") >= 0,
      "momentum(실측 neutral)인데 판정이 안 바뀐 것으로 표시된다: " + note.className);
    assert.ok(note.textContent.indexOf(S.t.rpBullish) >= 0 && note.textContent.indexOf(S.t.rpFlat) >= 0,
      "판정이 바뀌었는데 두 판정어(상승 우세/보합)가 문구에 둘 다 없다: " + note.textContent);
  });
});

// 단언 3 — 다른 성향으로 바꿔 되돌릴 수 있다. 두 번 고르면 두 번 갱신되고, 같은 성향으로
// 되돌리면 처음과 같은 결과가 다시 나온다(계산이 안정적이다) — 죽은 컨트롤이 아니다.
test("3단계 — 다른 성향으로 바꿔 되돌릴 수 있다(두 번 고르면 두 번 갱신된다)", () => {
  withDom(root => {
    toStep3(root, SAMPLE);
    const s0 = sig3(root);
    pickStyle(root, "momentum");
    const s1 = sig3(root);
    assert.notStrictEqual(s0, s1, "첫 번째 선택(momentum)이 갱신되지 않았다");
    const { preset: trendPreset } = pickStyle(root, "trend");
    const s2 = sig3(root);
    assert.notStrictEqual(s1, s2, "두 번째 선택(trend 로 되돌리기)이 갱신되지 않았다");
    assert.strictEqual(s0, s2, "같은 성향(trend)으로 되돌렸는데 결과가 다르다 — 계산이 안정적이지 않다");
    const on = root.querySelectorAll(".ob-style").filter(b => b.className.indexOf("is-on") >= 0);
    assert.strictEqual(on.length, 1, "되돌린 뒤 선택 표시가 1개가 아니다: " + on.length);
    assert.strictEqual(on[0].querySelector(".ob-style-name").textContent, trendPreset.name,
      "되돌린 뒤 선택 표시가 trend 카드에 있지 않다");
  });
});

// 단언 4 — 판정이 안 바뀌는 성향에서도 화면이 정직하다. 이 표본에서는 trend·reversion·
// volatility 셋 다 32도구와 같은 결론(bull)이다 — 사용자 넷 중 셋이 보는 주 경로다. "같음"이
// 초라해 보이지 않는지는 문구가 실제로 "당신 기준으로도 같은 결론입니다"를 말하는지로,
// "아무 일도 안 하는 화면"이 아닌지는 판정 문구가 같아도 근거 구성(네 통의 개수)이 실제로
// 달라지는지로 각각 잰다.
test("3단계 — 판정이 안 바뀌는 성향에서도 화면이 정직하다(\"당신 기준으로도 같은 결론입니다\")", () => {
  withDom(root => {
    toStep3(root, SAMPLE);
    const note = root.querySelector(".ob32-verdict-note");
    assert.ok(note, "판정 비교 문구가 없다");
    assert.ok(note.className.indexOf("is-same") >= 0,
      "기본 선택(trend)은 32도구와 같은 결론(실측 bull)이어야 하는데 is-same 이 아니다: " + note.className);
    assert.strictEqual(note.textContent, S.t.ob3SameNote, "같을 때 문구가 다르다: " + note.textContent);
    const before = sig3(root);
    pickStyle(root, "reversion");   // 실측: reversion 도 bull — 판정 문구는 그대로다.
    const note2 = root.querySelector(".ob32-verdict-note");
    assert.ok(note2.className.indexOf("is-same") >= 0,
      "reversion(실측 bull)도 같은 판정이어야 하는데 is-same 이 아니다: " + note2.className);
    assert.strictEqual(note2.textContent, S.t.ob3SameNote, "같을 때 문구가 다르다: " + note2.textContent);
    const after = sig3(root);
    assert.notStrictEqual(before, after,
      "판정 문구는 같은데(trend→reversion) 근거 구성(동의·반대·무판정·자백 개수)까지 완전히 " +
      "똑같다 — 화면이 아무 일도 안 한 것처럼 보인다");
  });
});

// 구조 검증 — 네 통(동의·반대·무판정·자백)의 합이 그 성향이 실제로 선택한 지표 수와 같다
// (4종 전부). 기대값은 onboarding.js 를 다시 구현해 뽑지 않는다 — ind-tiers.js(이미 검증된
// 별도 모듈)를 직접 불러 비교한다(2단계의 "합이 32" 시험과 같은 원칙, 외부 불변 대 실행 결과).
test("3단계 — 네 통의 합이 그 성향의 선택 지표 수와 같다(4종 전부)", () => {
  const Tiers = require("../www/ind-tiers.js");
  const G2 = require("../www/graph.js");
  Tiers.PRESETS.forEach(p => {
    withDom(root => {
      toStep3(root, SAMPLE);
      if (p.key !== "trend") pickStyle(root, p.key);   // trend 는 기본 선택이라 이미 그 상태다
      const counts = root.querySelectorAll(".ob32-sec-count").map(e => Number(e.textContent));
      assert.strictEqual(counts.length, 4, p.key + " — 동의·반대·무판정·자백 네 섹션이 다 있어야 한다");
      const sum = counts.reduce((a, b) => a + b, 0);
      const n = Tiers.selectionOf(p.key, G2.BASIC).length;
      assert.strictEqual(sum, n, p.key + " — 네 통의 합(" + sum + ")이 선택 지표 수(" + n + ")와 다르다");
      const onDesc = root.querySelectorAll(".ob-style").filter(b => b.className.indexOf("is-on") >= 0)[0]
        .querySelector(".ob-style-desc").textContent;
      assert.ok(onDesc.indexOf(String(n)) >= 0, p.key + " 카드 설명에 지표 수(" + n + ")가 안 보인다: " + onDesc);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════
// Task 5 리뷰 1/5 — Important 3건 + Minor 1건. 셋 다 화면의 존재 이유("성향이 판정을
// 바꾸는 것을 겪게 한다")에 직접 닿는다.
// ══════════════════════════════════════════════════════════════════════════════════

// 리뷰 A — 판정이 중립(momentum)이면 classifyFull32 가 voiced 행을 전부 무판정으로
// 보낸다(want===0). 개별 지표는 뚜렷한 방향(Stochastic −0.62 등)을 말하는데도 그렇다 —
// 이 화면이 그 경로를 처음으로 그린다(2단계는 이 표본에서 늘 bull 이라 안 그려졌다).
// 분류 로직은 그대로 두고(브리프·리뷰 둘 다 금지) 설명 문구만 추가했다 — 중립일 때만
// 나오고, 방향이 있는 판정(trend·reversion·volatility)의 "약한 신호" 무판정에는 안 나온다
// (그 경우 이 설명은 사실과 다르다 — 지표가 진짜로 약하게 말한 것이다).
test("3단계(리뷰 A) — 판정이 중립일 때만 무판정 설명이 나오고, 방향이 있을 때는 안 나온다", () => {
  withDom(root => {
    toStep3(root, SAMPLE);   // 기본 trend — 실측 bull, 방향이 있다.
    const note = deepText(root.querySelector(".ob-step"));
    assert.doesNotMatch(note, /전체 판정이 중립이라/, "판정이 방향(bull)인데 중립 설명이 나온다");
    pickStyle(root, "momentum");   // 실측 neutral.
    const flatSec = root.querySelector(".ob32-sec-flat");
    assert.ok(flatSec, "무판정 섹션이 없다");
    const before = flatSec.parentNode;   // .ob-step — 설명은 flat 섹션 바로 앞에 형제로 붙는다
    const explain = Array.from(before.children).filter(c => c.className === "ob-note")[0];
    assert.ok(explain, "판정이 중립인데 무판정 설명 문구가 없다");
    assert.strictEqual(explain.textContent, S.t.ob3FlatNeutralNote, "설명 문구가 다르다: " + explain.textContent);
    // momentum(neutral)에서 flat 은 voiced 전부다 — 그 안에 방향이 뚜렷한 지표(예: Stochastic)가
    // 실제로 있고, 이름·판독 문장·기여도 숫자가 전부 살아있어야 한다(리뷰: "6줄 전부 노출"
    // 확인을 회귀로 잠근다 — 숫자가 조용히 사라지면 이 리뷰가 다시 필요해진다).
    const rows = flatSec.querySelectorAll(".ob32-row");
    assert.ok(rows.length > 0, "momentum 인데 무판정 행이 하나도 없다");
    rows.forEach(r => {
      const name = r.querySelector(".ob32-name"), text = r.querySelector(".ob32-text"), bias = r.querySelector(".ob32-bias");
      assert.ok(name && name.textContent.trim(), "무판정 행에 이름이 없다");
      assert.ok(text && text.textContent.trim(), name.textContent + " 무판정 행에 판독 문장이 없다");
      // RSI 처럼 bias 가 정확히 0인 지표는 "0.00"(부호 없음)으로 찍힌다(full32Row: r.bias>0
      // 일 때만 "+") — 부호가 아니라 **숫자가 실제로 있는지**를 잰다(리뷰가 확인한
      // "6줄 전부 기여도 숫자 노출"이 재는 것도 이것이다).
      assert.ok(bias && /^[+-]?\d/.test(bias.textContent), name.textContent + " 무판정 행에 기여도 숫자가 없다 — momentum 화면이 텅 비어 보인다");
    });
  });
});

// 리뷰 B — obSub3 가 "언제든 바꿀 수 있습니다"만 말하면 판정이 달라질 수도 있다는 유인이
// 없다. 문구에 "달라질 수도 있습니다"를 더하되, 어느 성향이 실제로 갈리는지는 안 말한다
// (표본이 바뀌면 거짓말이 된다 — 리뷰 지시). 카드 설명도 "사용"(수동태) 대신 "다시
// 판정"(고르는 행위가 새 계산을 일으킨다는 신호)으로 바꿨다.
test("3단계(리뷰 B) — 판정이 달라질 수 있다는 유인이 있고, 어느 성향인지는 안 밝힌다", () => {
  assert.match(S.t.obSub3, /달라질 수도 있습니다/, "판정이 바뀔 수 있다는 유인 문구가 없다");
  assert.doesNotMatch(S.t.obSub3, /모멘텀|momentum/i, "어느 성향이 갈리는지 미리 일러바친다 — 표본이 바뀌면 거짓말이 된다");
  assert.match(S.t.obStyleIndicatorSuffix, /판정/, "카드 설명이 판정에 영향을 준다는 신호가 없다(그냥 '사용'뿐)");
  withDom(root => {
    toStep3(root, SAMPLE);
    const sub = root.querySelector(".ob-sub");
    assert.ok(sub && sub.textContent.indexOf("달라질 수도 있습니다") >= 0, "실제 렌더된 부제에 유인 문구가 없다");
  });
});

// 리뷰 C — is-diff 가 is-same 보다 강조가 약했다(같음=ink-2 밝음, 다름=기본 ink-3 어두움).
// 소스 레벨에서 재검증한다(밝기는 노드 DOM 으로 못 재므로 색 토큰 이름으로 잰다 — ink 가
// ink-2 보다 밝다는 사실은 style-base.css 의 토큰 정의 순서 자체다). 2단계도 같은 클래스를
// 공유하므로 이 규칙은 2단계에도 함께 적용된다.
test("3단계·2단계 공유(리뷰 C) — 판정이 갈렸을 때(is-diff)가 같을 때(is-same)보다 약하게 강조되지 않는다", () => {
  const block = CSS.slice(CSS.indexOf(".ob32-verdict-note"));
  const sameRule = block.match(/\.ob32-verdict-note\.is-same\s*\{([^}]*)\}/);
  const diffRule = block.match(/\.ob32-verdict-note\.is-diff\s*\{([^}]*)\}/);
  assert.ok(sameRule && diffRule, "is-same/is-diff 규칙을 둘 다 찾지 못했다");
  assert.match(sameRule[1], /color:\s*var\(--ink-2\)/, "is-same 규칙이 바뀌었다 — 이 시험의 전제가 깨졌다");
  // 좌측 세로 컬러 라인 금지(프로젝트 전역 규칙) — 강조는 색·굵기로만.
  assert.doesNotMatch(diffRule[1], /border-left\s*:\s*(?!0)/, "is-diff 가 border-left 로 세로 라인을 그렸다");
  assert.doesNotMatch(diffRule[1], /box-shadow\s*:\s*inset\s+\d/, "is-diff 가 inset box-shadow 로 세로 라인을 그렸다");
  // --ink(#eef1f7)가 --ink-2(#c5ccdb)보다 밝다(style-base.css) — is-diff 는 그 중 더 밝은
  // 쪽을 쓰고, 굵기까지 더해 최소한 같은 만큼은 아니라 **더** 눈에 띄게 했다.
  assert.match(diffRule[1], /color:\s*var\(--ink\)(?!-)/, "is-diff 가 가장 밝은 --ink 토큰을 안 쓴다: " + diffRule[1]);
  assert.match(diffRule[1], /font-weight/, "is-diff 에 --ink-2 대비 추가 강조(굵기)가 없다: " + diffRule[1]);
});

// ══════════════════════════════════════════════════════════════════════════════════
// 4·5단계(설계서 §4.4·4.5, Task 6) — 동의의 개연성 · 선택과 실행의 분리
// ══════════════════════════════════════════════════════════════════════════════════

function toStep4(root) {
  O.render(root, { sample: SAMPLE });
  root.querySelector(".ob-guess-btn").click();   // 1: 직접 찍기
  root.querySelector(".ob-next").click();        // 1 -> 2
  root.querySelector(".ob-next").click();        // 2 -> 3 (32도구 화면은 입력 없이 넘어간다)
  root.querySelector(".ob-next").click();        // 3 -> 4 (성향은 기본 선택으로 입력 없이 넘어간다)
}
function toStep5(root) {
  toStep4(root);
  root.querySelector(".ob-agree").click();       // 4: 동의 체크
  root.querySelector(".ob-next").click();        // 4 -> 5
}

// 단언 1 — 4단계가 "지금부터 미래를 말한다" 전환으로 열린다. 3단계의 obPastDone("여기까지는
// 과거였습니다")을 그대로 반복하지 않고 그 질문에 실제로 답해야 한다.
test("4단계 — 지금부터 미래를 말한다는 전환으로 열린다(3단계 obPastDone 을 받는다)", () => {
  withDom(root => {
    toStep4(root);
    const over = root.querySelector(".ob-over");
    assert.ok(over, "4단계에 전환 문구(.ob-over) 가 없다");
    const overText = deepText(over);
    assert.ok(overText && overText.trim().length > 0, "전환 문구가 비어 있다");
    assert.strictEqual(overText, S.t.obFutureOver, "4단계 전환 문구가 obFutureOver 가 아니다");
    assert.notStrictEqual(overText, S.t.obPastDone,
      "3단계 문구('여기까지는 과거였습니다')를 그대로 반복했다 — 답이 아니라 메아리다");
    assert.match(overText, /미래/, "미래를 말한다는 전환이 실제 문구에 없다: " + overText);
    const h1 = root.querySelector(".ob-h");
    assert.ok(h1 && deepText(h1).trim().length > 0, "4단계 제목이 비어 있다");
    const sub = root.querySelector(".ob-sub");
    assert.ok(sub && deepText(sub).trim().length > 0, "4단계 부제가 비어 있다");
  });
});

// 단언 2 — 하지 않는 것 셋(매수·매도 권유 아님·수익 약속 아님·손실 책임)이 명시된다.
test("4단계 — 하지 않는 것 셋이 실제로 렌더된다", () => {
  withDom(root => {
    toStep4(root);
    const items = root.querySelectorAll(".ob-consent-item");
    assert.strictEqual(items.length, 3, "하지 않는 것 세 줄이 아니다: " + items.length);
    const texts = items.map(deepText);
    texts.forEach((t, i) => assert.ok(t && t.trim().length > 0, i + "번째 줄이 비어 있다"));
    assert.deepStrictEqual(texts, [S.t.obConsentNotAdvice, S.t.obConsentNoProfit, S.t.obConsentLossOwn]);
    assert.match(texts[0], /권유/, "매수·매도 권유가 아니라는 말이 없다: " + texts[0]);
    assert.match(texts[1], /약속/, "수익을 약속하지 않는다는 말이 없다: " + texts[1]);
    assert.match(texts[2], /책임/, "손실 책임이 본인에게 있다는 말이 없다: " + texts[2]);
  });
});

// 단언 3(전반) — 체크 없이는 진행 불가. disabled 속성만 보지 않는다 — 실제로 클릭해서
// next() 자체가 거부하는지까지 잰다(브리프 주의사항).
test("4단계 — 체크 없이는 진행이 실제로 막힌다(클릭해도 안 넘어간다)", () => {
  withDom(root => {
    toStep4(root);
    const fwd = root.querySelector(".ob-next");
    assert.strictEqual(fwd.disabled, true, "체크 전인데 다음 버튼이 활성이다");
    fwd.click();   // disabled 속성이 아니라 클릭 자체가 막히는지 — 진짜 next() 를 통과한다
    assert.ok(root.querySelector(".ob-consent-list"), "체크 없이 클릭했는데 4단계를 벗어났다");
    root.querySelector(".ob-agree").click();
    assert.strictEqual(root.querySelector(".ob-next").disabled, false, "체크했는데도 여전히 막혀 있다");
    root.querySelector(".ob-next").click();
    assert.ok(root.querySelector(".tp-grid"), "체크 후 클릭했는데 5단계로 안 넘어갔다");
  });
});

// 단언 3(후반) — 동의 완료 후 ms_consent 에 시각·약관 버전이 실제로 기록된다(기존 키 유지).
// 실물 store.js 로 끝까지 걸어간다 — 가짜 store 는 setOnboarded 를 no-op 으로 두므로 이
// 기록 형식 자체를 못 잰다.
test("4단계 — 완료 후 ms_consent 에 시각·약관 버전이 기록된다(기존 키 그대로)", () => {
  const RealStore = require("../www/store.js");
  const m = new Map();
  RealStore.install({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) });
  assert.strictEqual(RealStore.consent(), null, "시작 전인데 이미 동의 기록이 있다 — 시험 격리가 샜다");
  withDom(root => {
    toStep5(root);
    pickChip(root);
    root.querySelector(".ob-pick-start").click();   // API 층이 없는 하네스라 즉시 확정된다
    root.querySelector(".ob-next").click();          // 5 -> 6
    root.querySelector(".ob-next").click();          // 6 -> 7
    root.querySelector(".ob-next").click();          // 7: 완료
    const c = RealStore.consent();
    assert.ok(c, "완료 후에도 ms_consent 가 비어 있다");
    assert.strictEqual(typeof c.termsVersion, "string", "약관 버전이 문자열이 아니다");
    assert.ok(c.termsVersion.length > 0, "약관 버전이 비어 있다");
    assert.ok(typeof c.at === "string" && c.at.length > 0, "동의 시각(at)이 없다");
    assert.ok(RealStore.onboarded(), "완료했는데 onboarded 가 안 켜졌다");
  }, RealStore);
});

// 단언 4 — 5단계: 종목을 골라도 분석이 시작되지 않는다. 선택 후에도 결과가 없고, [분석 시작]
// 버튼을 눌러야 시작된다. canAdvance(5) 가 state.r1 을 안 쓴다는 것은 위 "각 단계가 요구하는
// 것" 시험이 이미 구조로 증명했다 — 여기서는 실제 화면(DOM)에서 같은 사실을 잰다.
test("5단계 — 종목을 골라도 분석이 시작되지 않는다, [분석 시작]을 눌러야 시작된다", () => {
  withDom(root => {
    toStep5(root);
    assert.strictEqual(root.querySelector(".ob-next").disabled, true, "5단계 진입 시점부터 이미 열려 있다");
    // 이제 종목명이 앞에 붙는다(리뷰 C1) — 정확한 이름을 요구하면 어느 칩을 골랐는지에
    // 시험이 결합된다, 접미 문구 포함 여부만 본다.
    const readyNote = () => root.querySelectorAll(".ob-note").filter(n => deepText(n).indexOf(S.t.obPickReadySuffix) >= 0);
    assert.strictEqual(readyNote().length, 0, "5단계에 들어오자마자 '선택을 마쳤습니다'가 떠 있다");

    pickChip(root);   // 선택만 한다 — 아직 아무것도 실행하지 않는다
    assert.strictEqual(root.querySelector(".ob-next").disabled, true,
      "종목을 고르기만 했는데 다음이 열렸다 — 선택이 곧 실행이 된 옛 버그가 되돌아왔다");
    assert.strictEqual(readyNote().length, 0, "선택만 했는데 결과 문구가 이미 떴다 — 결과가 없어야 한다");

    const startBtn = root.querySelector(".ob-pick-start");
    assert.ok(startBtn, "[분석 시작] 버튼이 없다");
    assert.strictEqual(startBtn.disabled, false, "종목을 골랐는데 시작 버튼이 비활성이다");

    startBtn.click();   // 여기서 처음 실행된다
    assert.strictEqual(root.querySelector(".ob-next").disabled, false,
      "[분석 시작]을 눌렀는데도 다음이 안 열렸다");
    assert.strictEqual(readyNote().length, 1, "실행 후에도 결과 문구가 없다");
  });
});

// 리뷰 C1(2026-08-19) — 확정한 뒤 다른 종목으로 바꾸면 "다음"이 열린 채로 남고, 6·7단계로
// 넘어가면 화면에 보이는 새 선택이 아니라 옛 확정 종목의 분석 결과가 나갔다. onChange 가
// state.pickError 만 지우고 state.sym/tut/r1/r2 는 그대로 뒀던 것이 원인이다.
//
// 선택을 "바꾸는" 실제 제스처는 두 클릭이다 — 피커가 multi:true,max:1 이라 정원이 찬
// 상태에서 다른 칩을 바로 누르면 그 클릭 자체가 거부된다(가득 찼다는 안내만 뜨고
// onChange 가 안 불린다 — ticker-picker.js toggle() 의 기존 동작, 이 태스크가 만든
// 결함이 아니다). 그래서 먼저 확정된 칩을 다시 눌러 끄고(해제), 그다음 새 칩을 누른다 —
// 무효화가 정확히 "해제되는 순간"(item 이 없어지는 순간) 일어나는지를 잰다.
test("5단계(리뷰 C1) — 확정한 뒤 선택을 해제하면 확정이 무효화된다(다음이 다시 닫힌다)", () => {
  withDom(root => {
    toStep5(root);
    const first = pickChip(root);                    // 005930(삼성전자) — CURATED[0]
    root.querySelector(".ob-pick-start").click();     // 확정 — API 층이 없으니 즉시
    assert.strictEqual(root.querySelector(".ob-next").disabled, false, "확정했는데 다음이 안 열렸다");
    const readyAfterFirst = root.querySelectorAll(".ob-note").filter(n => deepText(n).indexOf(S.t.obPickReadySuffix) >= 0);
    assert.strictEqual(readyAfterFirst.length, 1, "첫 확정 후 결과 문구가 없다");
    assert.strictEqual(first.getAttribute("data-sym"), "005930", "pickChip 의 기본 선택 전제(CURATED[0])가 바뀌었다");
    assert.ok(deepText(readyAfterFirst[0]).indexOf("삼성전자") >= 0,
      "첫 확정 결과 문구가 그 종목(삼성전자)을 안 담았다: " + deepText(readyAfterFirst[0]));

    pickChip(root, "005930");                          // 확정된 칩을 다시 눌러 해제한다(선택 변경의 첫 클릭)
    assert.strictEqual(root.querySelector(".ob-next").disabled, true,
      "선택을 해제했는데 '다음'이 여전히 열려 있다 — 옛 확정(005930)이 무효화되지 않았다");
    const readyAfterDeselect = root.querySelectorAll(".ob-note").filter(n => deepText(n).indexOf(S.t.obPickReadySuffix) >= 0);
    assert.strictEqual(readyAfterDeselect.length, 0,
      "선택을 해제했는데 옛 확정의 결과 문구가 아직 남아 있다");

    pickChip(root, "NVDA");                            // 이제 정원이 비었으니 새 칩을 고를 수 있다
    assert.strictEqual(root.querySelector(".ob-next").disabled, true,
      "새 종목을 고르기만 했는데 다음이 열렸다 — 선택이 곧 실행이 되는 옛 버그다");

    // 새로 고른 종목으로 다시 [분석 시작]을 눌러야 비로소 다음이 열리고, 그 결과가 실제로
    // NVDA(엔비디아) 것이어야 한다 — 옛 확정(005930)의 잔재가 아니다.
    root.querySelector(".ob-pick-start").click();
    assert.strictEqual(root.querySelector(".ob-next").disabled, false, "재확정 후에도 다음이 안 열렸다");
    const readyAfterReconfirm = root.querySelectorAll(".ob-note").filter(n => deepText(n).indexOf(S.t.obPickReadySuffix) >= 0);
    assert.strictEqual(readyAfterReconfirm.length, 1, "재확정 후 결과 문구가 없다");
    assert.ok(deepText(readyAfterReconfirm[0]).indexOf("엔비디아") >= 0,
      "재확정 결과 문구가 새 종목(엔비디아)을 안 담았다: " + deepText(readyAfterReconfirm[0]));
  });
});

// 리뷰 D(2026-08-19) — 정원(max:1)이 찬 상태에서 다른 칩을 한 번 누르면(교체 의도) 옛
// ticker-picker.js 는 그 클릭을 거부하고 "지금은 더 고를 수 없습니다"(tpFull)를 띄웠다 —
// 5단계는 하나만 고르는 화면이라 그 안내가 사용자 의도와 정반대였다. swapAtMax:true 로
// 그 클릭이 실제로 교체(onChange 호출 포함)가 되는지, 그리고 tpFull 이 이 경로에서 다시
// 살아나지 않는지를 함께 잰다.
test("5단계(리뷰 D) — 확정 후 다른 칩을 한 번 누르면 교체된다(정원 안내가 안 뜬다)", () => {
  withDom(root => {
    toStep5(root);
    pickChip(root);                                     // 005930(삼성전자) 확정
    root.querySelector(".ob-pick-start").click();      // 확정 — 정원이 찼다
    assert.strictEqual(root.querySelector(".ob-next").disabled, false, "확정했는데 다음이 안 열렸다");

    const second = pickChip(root, "NVDA");             // 정원이 찬 채로 다른 칩을 "한 번" 누른다
    assert.ok(second, "NVDA 칩을 못 찾았다");
    // 교체가 실제로 일어났다 — onChange 가 불려 invalidateConfirmed() 가 돌았다(리뷰 C1 의
    // 무효화 로직이 이 경로에서도 정상 작동한다는 증거).
    assert.strictEqual(root.querySelector(".ob-next").disabled, true,
      "다른 칩을 한 번 눌렀는데 교체가 안 됐다 — onChange 가 안 불렸거나 무효화가 안 됐다");
    // draw() 가 클릭마다 그리드를 통째로 새로 그린다 — first/second 는 클릭 "이전" 스냅샷이라
    // 그 자체의 className 은 다시 안 바뀐다(detached). 지금 상태는 살아있는 DOM 에서 다시
    // 찾아야 한다(3단계 momBtn 재조회와 같은 이유).
    const chipsNow = root.querySelectorAll(".tp-chip");
    const nvdaNow = chipsNow.filter(c => c.getAttribute("data-sym") === "NVDA")[0];
    const samsungNow = chipsNow.filter(c => c.getAttribute("data-sym") === "005930")[0];
    assert.ok(nvdaNow && nvdaNow.className.indexOf("is-on") >= 0, "NVDA 칩이 켜지지 않았다");
    assert.ok(samsungNow && samsungNow.className.indexOf("is-on") < 0,
      "005930 칩이 여전히 켜져 있다 — 더한 것이지 바뀐 게 아니다");
    // "지금은 더 고를 수 없습니다" 가 이 경로에서 다시 뜨면 안 된다(옛 동작의 잔존).
    const msg = root.querySelector(".tp-msg");
    assert.ok(msg, ".tp-msg 자체가 없다");
    assert.notStrictEqual(deepText(msg), S.t.tpFull, "정원 안내(tpFull)가 이 경로에서 떴다 — 옛 동작이 살아 있다");

    root.querySelector(".ob-pick-start").click();      // 새로 고른 종목으로 재확정
    assert.strictEqual(root.querySelector(".ob-next").disabled, false, "재확정 후에도 다음이 안 열렸다");
    const ready = root.querySelectorAll(".ob-note").filter(n => deepText(n).indexOf(S.t.obPickReadySuffix) >= 0);
    assert.strictEqual(ready.length, 1, "재확정 후 결과 문구가 없다");
    assert.ok(deepText(ready[0]).indexOf("엔비디아") >= 0,
      "재확정 결과가 새 종목(엔비디아)을 안 담았다: " + deepText(ready[0]));
  });
});

// canAdvance(5) 소스 자체가 state.r1 을 참조하지 않는지 — "말로는 안 쓴다"가 아니라 실제
// 코드 모양으로 잰다(구조적 증명, 위 두 시험은 행동으로 증명한다).
test("5단계 — canAdvance 의 5단계 분기는 state.r1 을 참조하지 않는다(소스 형태)", () => {
  const m = OB.match(/if\s*\(\s*step\s*===\s*5\s*\)\s*return[^;]+;/);
  assert.ok(m, "canAdvance 에 5단계 분기가 없다");
  assert.doesNotMatch(m[0], /\br1\b/, "5단계 진행 조건이 여전히 state.r1 을 본다: " + m[0]);
  assert.match(m[0], /\bsym\b/, "5단계 진행 조건이 state.sym 을 안 본다: " + m[0]);
});

// 단언 5 — 종목을 못 찾거나 봉이 부족하면 다음 행동 버튼이 있다(막다른 골목 금지). 정상
// 경로만 돌리고 "버튼 있음"을 단언하면 자명 통과다 — 실제로 그 상태를 만들어 잰다.
test("5단계 — 종목을 못 찾으면 '다른 종목 선택' 버튼이 실제로 뜬다(막다른 골목 금지, 실물 MSApi 경로)", async () => {
  const RealApi = require("../www/api.js");
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep5(root);
    pickChip(root);
    root.querySelector(".ob-pick-start").click();
    await flush();
    const warn = root.querySelector(".ob-warn");
    assert.ok(warn, "못 찾음 상태인데 경고 문구가 없다");
    assert.strictEqual(deepText(warn), S.t.obPickNotFound, "못 찾음 문구가 obPickNotFound 가 아니다: " + deepText(warn));
    const retry = root.querySelector(".ob-retry");
    assert.ok(retry, "다음 행동 버튼(.ob-retry)이 없다 — 막다른 골목이다");
    assert.strictEqual(deepText(retry), S.t.obPickRetry, "다음 행동 버튼 문구가 obPickRetry 가 아니다");
    assert.strictEqual(root.querySelector(".ob-next").disabled, true, "실패했는데 다음이 열려 있다");
    // 다음 행동이 실제로 동작한다 — 눌렀을 때 다시 고를 수 있는 상태로 돌아가야 한다.
    retry.click();
    assert.ok(root.querySelector(".tp-grid"), "다시 골라야 하는데 종목 고르기 그리드가 사라졌다");
    assert.strictEqual(root.querySelector(".ob-warn"), null, "다시 고르는 화면에 옛 경고가 남아 있다");
  }, { MSApi: RealApi, fetch: fetchReturning({ ok: false, error: "notfound", suggest: [] }) });
});

// 리뷰 C2(2026-08-19) — 손으로 짠 가짜 MSApi(candle.length<=60)는 온보딩의 옛 로컬 문턱만
// 격리해서 쟀다. 실물 api.js 는 1day 에 220을 강제하고(MIN_BARS), 그 미달은 err.notfound
// 없는 일반 Error 로 던진다(리뷰어 실측: "not enough bars: 80 < 220 (1day), notfound
// flag: undefined") — 이 시험은 정확히 그 모양을 실물 경로로 재현한다: candles 를 80개만
// 주는 성공 JSON(ok:true)을 fetch 가 돌려주면, normalizeCandles() 가 실제로 그 오류를
// 던지고 MSApi.isBarsShort() 가 그것을 알아본다.
test("5단계(리뷰 C2) — 봉이 부족하면(실물 api.js 의 220 하한 미달) '다른 종목 선택' 버튼이 뜬다 — 조용한 번들 치환 없음", async () => {
  const RealApi = require("../www/api.js");
  const thinCandles = [];
  for (let i = 0; i < 80; i++) thinCandles.push({ o: 1, h: 1.1, l: 0.9, c: 1, v: 100, t: "2026-01-01" });
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep5(root);
    pickChip(root);
    root.querySelector(".ob-pick-start").click();
    await flush();
    const warn = root.querySelector(".ob-warn");
    assert.ok(warn, "봉 부족 상태인데 경고 문구가 없다 — 조용히 번들로 치환됐을 수 있다(리뷰 C2가 잡은 바로 그 결함)");
    assert.strictEqual(deepText(warn), S.t.obPickThin, "봉 부족 문구가 obPickThin 이 아니다: " + deepText(warn));
    const retry = root.querySelector(".ob-retry");
    assert.ok(retry, "다음 행동 버튼(.ob-retry)이 없다 — 막다른 골목이다");
    assert.strictEqual(root.querySelector(".ob-next").disabled, true, "봉이 부족한데 다음이 열려 있다");
    retry.click();
    assert.ok(root.querySelector(".tp-grid"), "다시 골라야 하는데 종목 고르기 그리드가 사라졌다");
  }, { MSApi: RealApi, fetch: fetchReturning({ ok: true, tf: "1day", candles: thinCandles, symbol: "PLTR", name: "Palantir" }) });
});

// 리뷰 E(2026-08-19) — commit(data, true)(일반 네트워크 오류·API 층 부재)가 state.tut.fallback
// 을 켜는데, 그 플래그를 렌더하는 코드가 어디에도 없었다 — notfound·thin(리뷰 C2)은 막혔지만
// 세 번째 경로(일반 오류)는 무통보로 조용히 남아 있었다. fetch 자체가 reject 하는(fetch 계층
// 실패 — notfound 도 아니고 normalizeCandles 의 봉 부족 메시지도 아닌 진짜 "그 외" 오류)
// 표본을 실물 MSApi 로 주입해, 폴백이 실제로 화면에 밝혀지는지를 잰다.
function fetchRejecting(message) {
  return function () { return Promise.reject(new Error(message || "network down")); };
}

test("5단계(리뷰 E) — 일반 네트워크 오류로 대체됐으면 그 사실을 화면에 밝힌다(5·6·7단계)", async () => {
  const RealApi = require("../www/api.js");
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep5(root);
    pickChip(root);
    root.querySelector(".ob-pick-start").click();
    await flush();
    // 낙관적 폴백이라 진행은 막히지 않는다 — 다만 그 사실을 숨기지 않는다.
    assert.strictEqual(root.querySelector(".ob-next").disabled, false, "네트워크 오류인데 폴백이 진행까지 막았다");
    const notice5 = root.querySelectorAll(".ob-warn").filter(n => deepText(n) === S.t.obFallbackNotice);
    assert.strictEqual(notice5.length, 1, "5단계에 폴백 사실을 밝히는 표시가 없다");

    root.querySelector(".ob-next").click();   // 5 -> 6("지금 답" 숫자가 보이는 화면)
    const notice6 = root.querySelectorAll(".ob-warn").filter(n => deepText(n) === S.t.obFallbackNotice);
    assert.strictEqual(notice6.length, 1, "숫자가 보이는 6단계에 폴백 표시가 없다");

    root.querySelector(".ob-next").click();   // 6 -> 7(기본·심화·전문 표가 보이는 화면)
    const notice7 = root.querySelectorAll(".ob-warn").filter(n => deepText(n) === S.t.obFallbackNotice);
    assert.strictEqual(notice7.length, 1, "숫자가 보이는 7단계에 폴백 표시가 없다");
  }, { MSApi: RealApi, fetch: fetchRejecting("network down") });
});

test("5단계(리뷰 E) — 정상 경로(실 데이터 확보)에서는 폴백 표시가 안 뜬다(양쪽 갈래 확인)", async () => {
  const RealApi = require("../www/api.js");
  const fullCandles = [];
  for (let i = 0; i < 230; i++) fullCandles.push({ o: 100, h: 101, l: 99, c: 100, v: 1000, t: "2026-01-01" });
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep5(root);
    pickChip(root);
    root.querySelector(".ob-pick-start").click();
    await flush();
    assert.strictEqual(root.querySelector(".ob-next").disabled, false, "정상 데이터인데 확정이 안 됐다");
    const notice = root.querySelectorAll(".ob-warn").filter(n => deepText(n) === S.t.obFallbackNotice);
    assert.strictEqual(notice.length, 0, "정상 경로인데 폴백 표시가 떴다 — 오탐이다");
  }, { MSApi: RealApi, fetch: fetchReturning({ ok: true, tf: "1day", candles: fullCandles, symbol: "AAPL", name: "Apple" }) });
});

// ══════════════════════════════════════════════════════════════════════════════════
// 6단계 — 실제 분석(설계서 §4.6, Task 7). 브리프 단언 7건을 실제 조립(withDomWallet + 실물
// api.js)으로 잰다 — 가짜 DOM 빈 문자열 통과나 조건부 if 로 건너뛰는 단언을 두지 않는다.
// ══════════════════════════════════════════════════════════════════════════════════

// 실측(node, ForgeCore.run 직접 호출)으로 미리 확인해 둔 표본이다 — 항등식이 되지 않도록
// 기대값(방향)은 엔진 밖에서, 실제 계산 결과를 보고 정했다(테스트 기대값은 밖에서 원칙).
// 꾸준한 상승 230봉 — regime=bull, 내일·1주·1개월 세 지평이 전부 "up" 으로 갈리지 않는다
// (엇갈림 없음의 대조군이자, 1~4번 단언의 주 표본).
function steadyUpCandles() {
  var out = [], p = 80, i;
  for (i = 0; i < 230; i++) {
    p = p * 1.004;
    out.push({ o: p, h: p * 1.01, l: p * 0.99, c: p, v: 1000 + i, t: "2026-01-01" });
  }
  return out;
}

// 장기 완만한 상승 뒤 최근 20봉만 급락(−3.5%/봉) — regime=bull 이지만 내일(momentum, 최근
// 반등 여력)은 up, 1개월(평균회귀+구조적 하락 드리프트)은 down 으로 실제로 갈린다(위 sweep
// 실측: d1 +0.115%, m1 −0.996%). 세 지평 배열도 report.js 의 HORIZONS 순서(d1·w1·m1)를 그대로
// 따르므로 rows[0]=d1, rows[last]=m1 이다.
function mixedHorizonCandles() {
  var out = [], p = 80, i;
  for (i = 0; i < 210; i++) { p = p * 1.005; out.push({ o: p, h: p * 1.01, l: p * 0.99, c: p, v: 1000 + i, t: "2026-01-01" }); }
  for (i = 0; i < 20; i++) { p = p * (1 - 0.035); out.push({ o: p, h: p * 1.01, l: p * 0.99, c: p, v: 1210 + i, t: "2026-01-01" }); }
  return out;
}

test("6단계 단언 1 — 오늘 종가가 기준 시각과 함께, 가장 먼저 나온다", async () => {
  const RealApi = require("../www/api.js");
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep5(root);
    pickChip(root);
    root.querySelector(".ob-pick-start").click();
    await flush();
    root.querySelector(".ob-next").click();   // 5 -> 6, 재생도 동기로 여기서 끝난다
    assert.strictEqual(root.querySelector(".ob-canvas"), null, "6단계에 엉뚱한 1단계 DOM 이 남아 있다");
    const step = root.querySelector(".ob-step");
    assert.ok(step, "6단계 본문이 없다");
    // 오늘 종가 블록(.ob6-today)이 세 지평(.ob6-hz)보다 DOM 순서상 먼저다.
    const todayIdx = step.children.findIndex(c => c.className.indexOf("ob6-today") >= 0);
    const hzIdx = step.children.findIndex(c => c.className.indexOf("ob6-hz") >= 0);
    assert.ok(todayIdx >= 0, "오늘 종가 블록(.ob6-today)이 없다");
    assert.ok(hzIdx >= 0, "세 지평 블록(.ob6-hz)이 없다");
    assert.ok(todayIdx < hzIdx, "오늘 종가가 세 지평보다 먼저 나오지 않는다");
    const today = step.children[todayIdx];
    const value = today.querySelector(".obq-value"), asOf = today.querySelector(".obq-asof");
    assert.ok(value && deepText(value).trim().length > 0, "오늘 종가 값이 비어 있다");
    assert.match(deepText(value), /\d/, "오늘 종가에 숫자가 없다");
    assert.ok(asOf && deepText(asOf).trim().length > 0, "오늘 종가에 기준 시각이 없다 — 값만 있는 숫자다");
  }, { MSApi: RealApi, fetch: fetchReturning({ ok: true, tf: "1day", candles: steadyUpCandles(), symbol: "AAPL", name: "Apple" }) });
});

test("6단계 단언 2·3 — 세 지평이 각각 중심값 ± 오차 + 해석과 함께 있다", async () => {
  const RealApi = require("../www/api.js");
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep5(root);
    pickChip(root);
    root.querySelector(".ob-pick-start").click();
    await flush();
    root.querySelector(".ob-next").click();   // 5 -> 6
    const hz = root.querySelector(".ob6-hz");
    assert.ok(hz, "세 지평 블록이 없다");
    const stats = hz.findAll(c => c.className.indexOf("obq-stat") >= 0);
    assert.strictEqual(stats.length, 3, "지평이 3개(내일·1주·1개월)가 아니다: " + stats.length);
    const labels = stats.map(s => deepText(s.querySelector(".obq-label")));
    assert.deepStrictEqual(labels, [S.t.rpHzTomorrow, S.t.rpHzWeek, S.t.rpHzMonth],
      "지평 라벨 순서가 내일·1주·1개월이 아니다: " + labels.join(","));
    stats.forEach((s, i) => {
      const value = s.querySelector(".obq-value"), unit = s.querySelector(".obq-unit"), meaning = s.querySelector(".obq-meaning");
      assert.ok(value && deepText(value).trim().length > 0, labels[i] + " 값이 비어 있다");
      assert.match(deepText(value), /\d/, labels[i] + " 값에 숫자가 없다 — 중심값이 아니다");
      assert.ok(unit && /±/.test(deepText(unit)), labels[i] + " 에 오차(±) 표기가 없다");
      // 단언 3(Q5) — 값만 있는 블록 금지. 해석 텍스트가 실제로 비어있지 않아야 한다(자명
      // 통과 방지 — deepText 로 실제 내용을 보고, 비어있지 않음도 함께 잰다).
      assert.ok(meaning, labels[i] + " 에 해석 블록이 없다");
      const meaningText = deepText(meaning).trim();
      assert.ok(meaningText.length > 0, labels[i] + " 해석이 비어 있다");
      // 방향이 있으면 "…봅니다." 뒤에 "(NN%)" 확신이 붙을 수 있다(regime 이 방향을 가리킬
      // 때만) — 그래서 접두 일치로 본다. 무판정(flat)은 접미 없이 정확히 일치해야 한다.
      assert.ok(meaningText.indexOf(S.t.obHzUpMeaning) === 0 || meaningText === S.t.obHzFlatMeaning
        || meaningText.indexOf(S.t.obHzDownMeaning) === 0, labels[i] + " 해석 문구가 예상 형식이 아니다: " + meaningText);
    });
  }, { MSApi: RealApi, fetch: fetchReturning({ ok: true, tf: "1day", candles: steadyUpCandles(), symbol: "AAPL", name: "Apple" }) });
});

test("6단계 단언 4 — 근거가 2단계와 같은 형식(동의/반대/무판정/자백, 합이 32)으로 있다", async () => {
  const RealApi = require("../www/api.js");
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep5(root);
    pickChip(root);
    root.querySelector(".ob-pick-start").click();
    await flush();
    root.querySelector(".ob-next").click();   // 5 -> 6
    const counts = root.querySelectorAll(".ob32-sec-count").map(e => Number(deepText(e)));
    assert.strictEqual(counts.length, 4, "네 통(동의·반대·무판정·자백)이 아니다: " + counts.length);
    const sum = counts.reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, 32, "네 통의 합이 32가 아니다 — 2단계와 같은 분류 경로를 안 탔다: " + sum);
    const dissentSec = root.querySelector(".ob32-sec-dissent");
    assert.ok(dissentSec, "반대 섹션이 없다");
    assert.strictEqual(dissentSec.querySelector(".ob32-expand"), null, "반대가 접혀 있다 — 2단계는 반대를 항상 전부 보여준다");
    // El.querySelectorAll 은 단일 클래스만 본다(후손 결합자 " " 미지원) — 섹션을 먼저 찾고
    // 그 안에서 행을 찾는다(2단계 시험이 이미 쓰는 방식).
    const agreeSec = root.querySelector(".ob32-sec-agree");
    assert.ok(agreeSec, "동의 섹션 자체가 없다");
    const agreeRows = agreeSec.querySelectorAll(".ob32-row");
    assert.ok(agreeRows.length > 0, "동의가 있어야 하는 표본(steadyUpCandles)인데 동의 행이 없다");
    const r0 = agreeRows[0];
    assert.ok(r0.querySelector(".ob32-name") && deepText(r0.querySelector(".ob32-name")).trim().length > 0, "근거 행에 도구 이름이 없다");
    assert.ok(r0.querySelector(".ob32-text") && deepText(r0.querySelector(".ob32-text")).trim().length > 0, "근거 행에 판독 문장이 없다");
  }, { MSApi: RealApi, fetch: fetchReturning({ ok: true, tf: "1day", candles: steadyUpCandles(), symbol: "AAPL", name: "Apple" }) });
});

// 단언 5 — 방향이 다른 입력을 실제로 주입해 "엇갈리면 엇갈린다고 쓰는지" 확인한다. 이 표본
// (mixedHorizonCandles)에서 우연히 세 지평이 같은 방향이면 이 시험은 안 도는데, 위에서 실측
// 확정했다(d1=up, m1=down) — 그리고 대조군(steadyUpCandles, d1=up, m1=up)으로 "안 엇갈리면
// 안 쓴다"도 같은 시험에서 함께 잰다(브리프 경고: 우연히 같은 방향인 표본만으로 그 갈래가
// 죽지 않게 한다).
test("6단계 단언 5 — 세 지평이 엇갈리면 엇갈린다고 쓰고, 안 엇갈리면 안 쓴다", async () => {
  const RealApi = require("../www/api.js");
  async function noteFor(candles) {
    const wallet = spyWallet({ ok: false, state: null, reason: "network" });
    return withDomWallet(wallet, async (root) => {
      toStep5(root);
      pickChip(root);
      root.querySelector(".ob-pick-start").click();
      await flush();
      root.querySelector(".ob-next").click();   // 5 -> 6
      const notes = root.querySelectorAll(".ob-note").filter(n => deepText(n).indexOf(S.t.rpHzMixedA) === 0);
      return notes.length ? deepText(notes[0]) : null;
    }, { MSApi: RealApi, fetch: fetchReturning({ ok: true, tf: "1day", candles: candles, symbol: "AAPL", name: "Apple" }) });
  }
  const mixedNote = await noteFor(mixedHorizonCandles());
  assert.ok(mixedNote, "방향이 실제로 갈리는 표본인데(d1=up·m1=down 실측) 엇갈림 문구가 없다");
  assert.ok(mixedNote.indexOf(S.t.rpHzMixedUp) >= 0, "엇갈림 문구가 첫 지평의 실제 방향(up)을 안 담았다: " + mixedNote);

  const sameNote = await noteFor(steadyUpCandles());
  assert.strictEqual(sameNote, null, "안 갈리는 표본(둘 다 up)인데 엇갈림 문구가 떴다 — 오탐이다");
});

// 단언 6 — 진행 중계가 실제 엔진 호출 수에 묶인다. readingStepper 를 스파이해 total(=
// ForgeCore.indicatorCount)만큼 step() 이 불렸는지, 그 결과 rows 가 그대로 근거가 됐는지를
// 잰다 — 전역 Q3 시험(소스에 고정 setTimeout/setInterval 이 없다)과 다른 각도: 여기는
// **6단계가 실제로 이 반복자를 쓰는지**를 통합 경로로 확인한다.
test("6단계 단언 6 — 진행 중계는 readingStepper(analyzeX 실호출)에 묶인다, 고정 시간이 아니다", async () => {
  const RealApi = require("../www/api.js");
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  let stepCalls = 0, capturedTotal = null;
  const IndSpy = Object.assign({}, IND, {
    readingStepper(FCArg, graphArg, dataArg, ctxArg) {
      const real = IND.readingStepper(FCArg, graphArg, dataArg, ctxArg);
      capturedTotal = real.total;
      // Object.assign 으로 wrap 하면 안 된다 — get done()/get index() 를 "소스"로 합칠 때
      // Object.assign 은 게터를 그 순간의 값으로 한 번만 읽어 정적 프로퍼티로 굳혀버린다
      // (진짜 걸렸던 사고 — done 이 생성 시점 false 로 얼어붙어 MSAnalyzeView.play() 의
      // while(!st.done) 이 끝나지 않고 동기 rAF 재귀가 스택을 넘쳤다). 순수 객체 리터럴로
      // 살아있는 게터를 만든다.
      return {
        total: real.total,
        get done() { return real.done; },
        get index() { return real.index; },
        rows: real.rows,
        step() { const r = real.step(); if (r) stepCalls++; return r; },
        drain() { return real.drain(); }
      };
    }
  });
  await withDomWallet(wallet, async (root) => {
    toStep5(root);
    pickChip(root);
    root.querySelector(".ob-pick-start").click();
    await flush();
    root.querySelector(".ob-next").click();   // 5 -> 6 — 여기서 재생이 실제로 돈다
    assert.ok(capturedTotal > 0, "readingStepper 를 아예 안 불렀다");
    assert.strictEqual(stepCalls, capturedTotal, "진행이 stepper.total 만큼 실제로 step() 되지 않았다: " + stepCalls + "/" + capturedTotal);
    assert.strictEqual(root.querySelector(".ob-next").disabled, false, "재생이 끝났는데 다음이 안 열렸다(state.ob6 미반영)");
  }, { MSApi: RealApi, MSIndicators: IndSpy, fetch: fetchReturning({ ok: true, tf: "1day", candles: steadyUpCandles(), symbol: "AAPL", name: "Apple" }) });
});

// 단언 7 — 로드(엔진 실행) 실패 시 다음 행동이 있다. 5단계는 이미 성공했어도(state.sym 존재)
// runTier("full") 자체가 실패할 수 있다 — 실제로는 5단계 commit() 이 [분석 시작] 시점에
// state.r1/state.r2 를 **함께** 계산해 두므로(6단계는 그 결과를 다시 계산하지 않는다), r2
// 가 null 이 되는 진짜 실패 지점은 그 commit() 호출이다. MSGraph.full32Graph 를 **두 번째
// 호출**에서만 던지게 만든다 — 첫 번째는 2단계(옛 예시 표본, sliced())가 이미 쓰고, 그
// 다음(두 번째)이 5단계가 실제 종목 데이터로 부르는 호출이다(실측: toStep5() 경로에서
// 정확히 이 순서로 두 번만 불린다). runTier 의 try/catch(실제 통합 경로)를 그대로 태워
// r2 를 진짜 null 로 만든다 — "버튼 있음"만 단언하는 자명 통과가 아니다.
function fullGraphThrowsOnSecondCall(G) {
  var calls = 0;
  return Object.assign({}, G, {
    full32Graph: function (FC) {
      calls++;
      if (calls === 2) throw new Error("engine exploded — 단언 7 주입");
      return G.full32Graph(FC);
    }
  });
}

test("6단계 단언 7 — 분석(runTier full)이 실패하면 막다른 골목 없이 다음 행동(재시도)이 있다", async () => {
  const RealApi = require("../www/api.js");
  const G2 = fullGraphThrowsOnSecondCall(G);
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep5(root);
    pickChip(root);
    root.querySelector(".ob-pick-start").click();
    // [분석 시작] 이 실제 종목 데이터로 runTier("full") 을 부르는 순간(commit(), 두 번째
    // 호출) 던진다 — state.sym 은 그래도 설정되므로(리뷰: commit() 이 r1/r2 성패와 무관하게
    // sym 을 확정한다) 5단계는 정상적으로 다음이 열리고, r2 만 null 로 남는다.
    await flush();
    root.querySelector(".ob-next").click();   // 5 -> 6 — 실패는 이미 일어나 있었다, 여기서 드러날 뿐
    const warn = root.querySelector(".ob-warn");
    assert.ok(warn, "분석 실패 상태인데 경고 문구가 없다");
    assert.strictEqual(deepText(warn), S.t.obAnalysisFailed, "실패 문구가 obAnalysisFailed 가 아니다: " + deepText(warn));
    const retry = root.querySelector(".ob-retry");
    assert.ok(retry, "다음 행동 버튼(.ob-retry)이 없다 — 막다른 골목이다(뒤로가기도 없는 단계다)");
    assert.strictEqual(root.querySelector(".ob-next").disabled, true, "분석이 실패했는데 다음이 열려 있다");
    assert.strictEqual(root.querySelector(".ob6-today"), null, "실패했는데 없는 값(오늘 종가)을 그렸다");
    // 다음 행동이 실제로 동작한다 — 재시도하면 이번엔(두 번째 호출) 성공해 실제 내용이 뜬다.
    retry.click();
    assert.strictEqual(root.querySelector(".ob-warn"), null, "재시도 후에도 실패 문구가 남아 있다");
    const today = root.querySelector(".ob6-today");
    assert.ok(today, "재시도가 성공했는데(두 번째 호출은 안 던진다) 실제 내용이 안 그려졌다");
  }, { MSApi: RealApi, MSGraph: G2, fetch: fetchReturning({ ok: true, tf: "1day", candles: steadyUpCandles(), symbol: "AAPL", name: "Apple" }) });
});

// ══════════════════════════════════════════════════════════════════════════════════
// 품질 다섯 규칙(설계서 §5, Task 2) — Q1·Q5 는 onboarding-quality.js 의 metric()·stat() 이
// 스스로 강제한다(기준 시점·해석 없이는 만들 수 없다, test/onboarding-quality.test.mjs 참고).
// Q2·Q4 는 여기서 각 단계 렌더 결과를 재고, Q3 은 소스 형태를 잰다.
//
// MSObQuality.APPLIES 에 등록된 단계만 검사한다 — 단계를 하나씩 고쳐 나가므로, 아직
// 손대지 않은 단계까지 검사하면 관문이 처음부터 빨갛고 아무도 신뢰하지 않게 된다.
//
// Task 3(1단계 콜드오픈)이 APPLIES 에 1 을 처음 넣었다 — 아래 forEach 가 이제부터 실제로
// 1단계를 돈다. "APPLIES 가 비어 있으면 실패" 단언은 여기가 아니라
// test/onboarding-quality.test.mjs 에 켜져 있다(그 파일이 APPLIES 의 정본 검사처다) — 다음
// 태스크가 자기 단계 등록을 잊으면 그쪽 관문이 빨갛게 알려준다.
// ══════════════════════════════════════════════════════════════════════════════════

// 목표 단계까지 "다음"을 눌러 걸어간다 — 각 단계가 요구하는 최소 입력만 채운다(target=1 이면
// 루프가 안 돌아 1단계 초기 렌더 그대로다). Task 3 이 등록한 1단계부터 실제로 이 경로를 돈다
// (toStep7 이 이미 하는 것과 같은 방식).
function walkToStep(root, target) {
  O.render(root, { sample: SAMPLE });
  for (var s = 1; s < target; s++) {
    if (s === 1) root.querySelector(".ob-guess-btn").click();
    // Task 5: 3단계(성향)는 기본 선택이 항상 채워져 있어 별도 입력 없이 다음으로 넘어간다.
    if (s === 4) root.querySelector(".ob-agree").click();
    // Task 7: 5단계를 실제로 떠나려면(6단계 이상을 걷는 호출) 칩을 고르고 [분석 시작]까지
    // 눌러야 한다. 이 하네스(withDom)는 MSApi 를 안 심으므로 loadPick() 이 "API 층 자체가
    // 없다" 분기로 물러서 동기로(fetch 없이) 즉시 확정된다 — walkToStep 이 async 일 필요가
    // 없는 이유다.
    if (s === 5) { pickChip(root); root.querySelector(".ob-pick-start").click(); }
    root.querySelector(".ob-next").click();
  }
}

Q.APPLIES.forEach((step) => {
  test("Q2 — " + step + "단계는 진행 표시와 단계 제목을 함께 보여준다", () => {
    withDom((root) => {
      walkToStep(root, step);
      assert.ok(root.querySelector(".ob-prog"), step + "단계에 진행 표시 노드가 없다");
      assert.ok(root.querySelector(".ob-h"), step + "단계에 단계 제목 노드가 없다");
    });
  });

  // 리뷰 C2: 1단계에도 뒤로가기를 요구했었다 — 실제 렌더(screens/onboarding.js draw(),
  // `step > 1`)와 애초에 안 맞는 규칙이었다(1단계는 시작점이라 되돌릴 앞이 없다. 부재가
  // 정상이지 위반이 아니다). 규칙을 "뒤로가기는 2~3단계에만 있다"로 확정한다. 세 갈래를
  // if(n!==1) 로 건너뛰지 않는다 — 1단계·2~3단계·4단계 이후 전부 각자 실제로 무언가를
  // 잰다(이 저장소가 조용한 건너뜀에 여러 번 데었다).
  test("Q4 — " + step + "단계의 뒤로가기 가능 여부가 규칙과 맞는다(1 없음·2~3 있음·4+ 없음)", () => {
    withDom((root) => {
      walkToStep(root, step);
      const back = root.querySelector(".ob-back");
      if (step === 1) {
        assert.strictEqual(back, null, "1단계는 시작점이라 뒤로 이동할 앞이 없어야 한다");
      } else if (step === 2 || step === 3) {
        assert.ok(back, step + "단계는 뒤로 이동 가능해야 한다(2~3단계)");
      } else {
        assert.strictEqual(back, null, step + "단계는 뒤로 이동 불가해야 한다(4단계 이후)");
      }
    });
  });
});

// 리뷰 C1: [^)]* 는 콜백의 첫 "(" (예: function(){ 의 여는 괄호)에서 곧바로 막혀
// 몸체 안의 step/prog 변이에 닿지 못했다(빨간불이 떠야 할 setTimeout(function(){ step++; })
// 가 초록으로 통과했다 — 실측은 아래 "증명" 참고). 정규식으로 콜백 몸체 경계를 잡는 시도
// 자체를 버린다 — 괄호 깊이를 세어 호출의 짝이 맞는 닫는 ")" 까지를 진짜로 잘라낸 뒤,
// 그 몸체 문자열 **안에서만** step/prog 변이를 찾는다. 문자열 리터럴·주석까지 완벽히
// 파싱하지 않는다(과잉이다) — 유효한 JS 라면 괄호는 항상 짝이 맞으므로(중괄호는 괄호
// 안에 항상 중첩되어 있다) 괄호 깊이 세기만으로 호출 전체(콜백 몸체 포함)를 정확히
// 잘라낼 수 있다.
function timerCallBodies(src, name) {
  const re = new RegExp("\\b" + name + "\\s*\\(", "g");
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;   // 여는 "(" 바로 다음
    let depth = 1, i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    out.push(src.slice(start, i - 1));     // 짝이 맞는 ")" 바로 앞까지 — 호출 인자 전체(콜백 몸체 포함)
    re.lastIndex = i;                      // 이 호출 뒤부터 다음 호출을 찾는다(중첩 setTimeout 도 놓치지 않는다)
  }
  return out;
}

// Q3 은 특정 단계가 아니라 소스 전체의 형태를 잰다 — 진행이 시간에 묶이면(고정 타이머) 그
// 진행이 실제 계산·응답을 반영하지 않게 된다. APPLIES 가 비어 있어도 지금 소스에 위반이
// 없는지는 바로 검사할 수 있으므로 unconditional 로 둔다(회귀 방지).
test("Q3 — 진행은 고정 타이머로 오르지 않는다 — 엔진 이벤트에 묶여야 한다", () => {
  const accumRe = /\b(step|prog)\s*(\+\+|\+=|=\s*\1\s*\+)/;
  ["setInterval", "setTimeout"].forEach((name) => {
    timerCallBodies(OB, name).forEach((body) => {
      assert.doesNotMatch(body, accumRe,
        name + " 콜백이 진행(step/prog)을 누적한다 — 시간이 아니라 엔진 이벤트에 묶여야 한다: " + body.slice(0, 120));
    });
  });
});
