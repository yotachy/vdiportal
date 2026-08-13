import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const O = require("../www/screens/onboarding.js");
const S = require("../www/strings.js");
const API = require("../www/api.js");
const SAMPLE = require("../www/onboarding-sample.js");
const FC = require("../../forge-core.js");
const G = require("../www/graph.js");
const IND = require("../www/indicators.js");
const RM = require("../www/report-model.js");
const APP = readFileSync(new URL("../www/app.js", import.meta.url), "utf8");
const WL = readFileSync(new URL("../www/screens/watchlist.js", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../www/style.css", import.meta.url), "utf8");
const OB = readFileSync(new URL("../www/screens/onboarding.js", import.meta.url), "utf8");

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

test("render 는 함수다 — 게이트가 부를 수 있어야 한다", () => {
  assert.strictEqual(typeof O.render, "function");
});

// 부팅에서 seedIfEmpty 가 남아 있으면 4단계가 무의미해지고, 사용자가 고르지 않은
// 종목이 워치리스트에 생긴다.
// app.js 만 보면 안 된다 — screens/watchlist.js 의 render() 도 같은 것을 불렀고, 그 화면은
// 부팅 직후 항상 그려진다. app.js 한쪽만 걷어낸 상태에서 브라우저로 확인했더니 AAPL·NVDA·MSFT
// 3행이 그대로 떴다(실측). 시드를 부르는 자리를 전부 본다.
test("부팅 경로 어디에서도 시드를 심지 않는다", () => {
  assert.doesNotMatch(APP, /MSStore\.seedIfEmpty\s*\(/, "app.js");
  assert.doesNotMatch(WL, /MSStore\.seedIfEmpty\s*\(/, "screens/watchlist.js");
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
test("스크립트 순서: sample → ticker-picker → onboarding → app", () => {
  var sm = HTML.indexOf('<script src="onboarding-sample.js">');
  var tp = HTML.indexOf('<script src="ticker-picker.js">');
  var ob = HTML.indexOf('<script src="screens/onboarding.js">');
  var ap = HTML.indexOf('<script src="app.js">');
  assert.ok(sm > 0 && tp > 0 && ob > 0 && ap > 0, "태그가 없다");
  assert.ok(sm < ob, "번들 시계가 onboarding 보다 뒤에 있다");
  assert.ok(tp < ob, "ticker-picker 가 onboarding 보다 뒤에 있다");
  assert.ok(ob < ap, "onboarding 이 app 보다 뒤에 있다");
});

// onboarding 이 로드 시점이 아니라 render 시점에 읽는 전역들 — 그래도 태그가 아예 없으면
// 브라우저에서 1·2단계가 빈 화면이 된다. node 테스트는 이 결손을 볼 수 없다.
test("1·2단계 작도가 쓰는 모듈이 index.html 에 전부 있다", () => {
  ["vendor/forge-core.js", "graph.js", "indicators.js", "report-model.js",
   "chart-layout.js", "chart-draw.js", "draw-preds.js", "ui.js"].forEach(function (f) {
    assert.ok(HTML.indexOf('<script src="' + f + '">') > 0, f + " 태그가 없다");
  });
});

test("온보딩 문구가 strings.js 에 있다", () => {
  ["obBack", "obNext", "obSampleNote", "obH1", "obSub1", "obH2", "obSub2", "obCombCap"].forEach(function (k) {
    assert.ok(typeof S.t[k] === "string" && S.t[k].length > 0, k + " 가 없다");
  });
});

// Task 2 가 ticker-picker.js 만 만들고 스타일을 안 붙였다 — 클래스가 CSS 에 없으면
// 4단계가 스타일 없는 버튼 더미가 된다. 온보딩 클래스와 함께 여기서 못박는다.
test("온보딩·종목 고르기 클래스가 style.css 에 있다", () => {
  [".ob", ".ob-prog", ".ob-seg", ".ob-step", ".ob-h", ".ob-sub", ".ob-canvas",
   ".ob-comb", ".ob-bar", ".ob-nav", ".ob-over", ".ob-cap",
   ".tp", ".tp-grid", ".tp-cell", ".tp-sym", ".tp-name", ".tp-free", ".tp-msg",
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
test("2단계 빗은 30개다 — 방향을 물을 수 있는 지표만", () => {
  var graph = G.full32Graph(FC);
  var vol = SAMPLE.candle.map(function (c) { return c.v; });
  G.setVolume(graph, vol);
  var input = { price: SAMPLE.price, candle: SAMPLE.candle, volume: vol };
  var rows = IND.readings(FC, graph, input, IND.ctxFrom(input));
  assert.strictEqual(rows.length, FC.indicatorCount - IND.NO_BIAS.length);
  assert.strictEqual(rows.length, 30);
  rows.forEach(function (r) { assert.ok(isFinite(r.bias), r.type + " 의 bias 가 숫자가 아니다"); });
});

// 두 벌 작도가 갈리는 것을 막는다 — 온보딩은 report.js 와 같은 모듈을 부른다.
test("paintChart 는 기존 작도 모듈을 부른다", () => {
  ["MSChartLayout.chartLayout", "MSChartDraw.drawAxes", "MSChartDraw.drawCandles",
   "MSChartDraw.drawCone", "ForgeCore.run"].forEach(function (call) {
    assert.ok(OB.indexOf(call) > 0, call + " 를 부르지 않는다");
  });
  // DPR 트랜스폼 — 없으면 폰에서 흐리다. node 테스트가 흐림을 볼 수 없으므로 소스로 못박는다.
  assert.match(OB, /devicePixelRatio/);
  assert.match(OB, /setTransform\s*\(\s*dpr/);
  // 예측선은 1차만 — 온보딩에 티어가 없다
  assert.match(OB, /"basic"/);
  // 빗은 readings 만 쓴다. noDirRows(trend·phasefold)를 섞으면 32가 되고,
  // bias 가 null 인 둘이 "중립 막대"로 위장한다 — 못 읽은 것과 중립은 다르다.
  assert.doesNotMatch(OB, /noDirRows/);
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
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  click() { (this.listeners.click || []).forEach(f => f({})); }
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
}

function withDom(fn) {
  const g = globalThis;
  const saved = {};
  const put = (k, v) => { saved[k] = Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; g[k] = v; };
  const doc = { createElement: t => new El(t), documentElement: new El("html") };
  put("document", doc);
  put("window", { devicePixelRatio: 3 });         // 3 = 실기기(폴드) 값. 1 이면 DPR 실수가 안 보인다
  put("getComputedStyle", () => ({ getPropertyValue: () => "" }));   // 토큰은 폴백으로 떨어진다
  put("MSUi", require("../www/ui.js"));
  put("MSStr", S);
  put("ForgeCore", FC);
  put("MSGraph", G);
  put("MSIndicators", IND);
  put("MSReportModel", RM);
  put("MSChartLayout", require("../www/chart-layout.js"));
  put("MSChartDraw", require("../www/chart-draw.js"));
  put("MSPreds", require("../www/draw-preds.js"));
  put("MSLayers", require("../www/draw-layers.js"));
  put("MSZoom", require("../www/chart-zoom.js"));
  try { return fn(new El("div")); }
  finally { Object.keys(saved).forEach(k => { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; }); }
}

test("1단계는 캔버스에 실제로 그린다 — 빈 캔버스가 아니다", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    const cv = root.querySelector(".ob-canvas");
    assert.ok(cv, "캔버스가 없다");
    const calls = cv.getContext("2d").__calls;
    // DPR — 안 하면 폰에서 흐리다. node 는 흐림을 못 보므로 트랜스폼 호출과 픽셀 크기로 본다.
    assert.ok(calls.includes("setTransform"), "DPR 트랜스폼을 설정하지 않았다");
    assert.strictEqual(cv.width, 360 * 3, "캔버스 픽셀 폭이 DPR 을 안 탄다");
    assert.strictEqual(cv.style.height, "250px");
    assert.ok(calls.includes("fillRect"), "캔들을 그리지 않았다");
    assert.ok(calls.includes("stroke"), "선을 하나도 긋지 않았다");
    assert.ok(calls.filter(c => c === "fillRect").length > 20, "캔들이 몇 개뿐이다: " + calls.length);
    // 진행 막대는 5칸, 첫 칸만 켜져 있다
    const segs = root.querySelector(".ob-prog").children;
    assert.strictEqual(segs.length, 5);
    assert.strictEqual(segs[0].className, "ob-seg is-on");
    assert.strictEqual(segs[1].className, "ob-seg");
    // 1단계엔 '뒤로'가 없다
    assert.strictEqual(root.querySelector(".ob-back"), null);
  });
});

test("2단계 빗은 막대 30개와 개수 캡션을 그린다", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    root.querySelector(".ob-next").click();
    const comb = root.querySelector(".ob-comb");
    assert.ok(comb, "빗이 없다");
    assert.strictEqual(comb.children.length, 30, "막대가 30개가 아니다");
    comb.children.forEach(b => {
      assert.match(b.className, /^ob-bar( up| dn)?$/);
      assert.match(b.style.height, /^\d+px$/);
    });
    // 전부 회색이면 방향이 안 실린 것이다(빗이 죽은 채로 그려지는 회귀)
    assert.ok(comb.children.filter(b => b.className !== "ob-bar").length >= 10, "방향이 실린 막대가 거의 없다");
    assert.strictEqual(root.querySelector(".ob-cap").textContent, "30 readings with a direction");
    assert.strictEqual(root.querySelector(".ob-prog").children[1].className, "ob-seg is-on");
  });
});

test("뒤로 가면 1단계가 다시 그려진다", () => {
  withDom(root => {
    O.render(root, { sample: SAMPLE });
    root.querySelector(".ob-next").click();
    root.querySelector(".ob-back").click();
    assert.ok(root.querySelector(".ob-canvas"), "1단계로 안 돌아왔다");
    assert.strictEqual(root.querySelector(".ob-comb"), null, "이전 단계 DOM 이 남아 있다");
  });
});

test("번들 시계가 없어도 던지지 않는다 — 첫 화면이 흰 화면이 되면 안 된다", () => {
  withDom(root => {
    delete globalThis.MSOnboardingSample;
    assert.doesNotThrow(() => O.render(root, {}));
    assert.ok(root.querySelector(".ob-h"), "헤드라인조차 안 그렸다");
  });
});
