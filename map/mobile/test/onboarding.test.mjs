import { test } from "node:test";
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
const RM = require("../www/report-model.js");
const CL = require("../www/chart-layout.js");
const APP = readFileSync(new URL("../www/app.js", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../www/style.css", import.meta.url), "utf8");
const OB = readFileSync(new URL("../www/screens/onboarding.js", import.meta.url), "utf8");
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");

test("5단계다", () => { assert.strictEqual(O.STEPS, 5); });

test("4단계는 최소 1종목, 5단계는 약관 동의를 요구한다", () => {
  assert.strictEqual(O.canAdvance(1, {}), true);
  assert.strictEqual(O.canAdvance(2, {}), true);
  assert.strictEqual(O.canAdvance(3, {}), true, "지급 실패해도 막지 않는다");
  // {} 만으로는 "아직 안 물어봤다"와 "물어봤는데 실패했다"를 구분 못한다 — grant() 가
  // 실패 시 실제로 심는 값(granted:null)으로도 같은 결과를 확인한다.
  assert.strictEqual(O.canAdvance(3, { granted: null }), true, "지급 실패 상태에서도 막지 않는다");
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
// paintChart 는 MSZoom·MSChartLayout·MSChartDraw 가 없으면 **조용히 early-return** 한다 —
// 태그 하나가 빠지면 JS 에러 0 인 채로 캔버스만 비는, 알아채기 가장 어려운 실패다.
// MSLayers(draw-layers)·MSPreds(draw-preds)는 drawCone 이 내부에서 부른다.
test("1·2단계 작도가 쓰는 모듈이 index.html 에 전부 있다", () => {
  ["vendor/forge-core.js", "graph.js", "indicators.js", "report-model.js",
   "chart-layout.js", "chart-zoom.js", "chart-draw.js", "draw-preds.js",
   "draw-layers.js", "ui.js"].forEach(function (f) {
    assert.ok(HTML.indexOf('<script src="' + f + '">') > 0, f + " 태그가 없다");
  });
});

test("온보딩 문구가 strings.js 에 있다", () => {
  ["obBack", "obNext", "obSampleNote", "obH1", "obSub1", "obH2", "obSub2", "obCombCap",
   "obH3", "obSub3", "obGranting", "obGranted", "obGrantOffline", "obRetry",
   "obCostFull", "obCostScan", "obCostSlot",
   "obH4", "obSub4", "obH5", "obRisk", "obAgree", "obFree", "obFinish"].forEach(function (k) {
    assert.ok(typeof S.t[k] === "string" && S.t[k].length > 0, k + " 가 없다");
  });
});

// 온보딩 전체에서 네트워크 호출이 3단계의 지갑 호출 하나뿐임을 세는 것이 핵심이다.
// 1·2단계가 시세 API 를 타기 시작하면 첫 화면이 콜드 수신(942ms 실측)을 기다리게 되는데,
// 눈으로는 "좀 느리네"로만 보이므로 소스에서 막는다.
test("1·2단계는 번들 시계를 쓴다 — 시세 API 를 부르지 않는다", () => {
  assert.doesNotMatch(OB, /MSApi\.loadTicker/);
});

test("지갑은 3단계에서만 부른다", () => {
  const calls = OB.match(/MSWallet\.\w+\(/g) || [];
  assert.deepEqual(calls, ["MSWallet.get("], "지갑 호출: " + calls.join(", "));
});

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
test("4단계가 고른 것만 심는다 — seedIfEmpty 를 부르지 않는다", () => {
  assert.doesNotMatch(OB, /seedIfEmpty/);
  assert.match(OB, /seedTo\(\s*MSStore\s*,/, "완료 핸들러가 MSStore 로 seedTo 를 부르지 않는다");
});

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

test("약관 체크박스가 5단계의 진행을 막는다", () => {
  assert.strictEqual(O.canAdvance(5, { agreed: false }), false);
});

// Task 2 가 ticker-picker.js 만 만들고 스타일을 안 붙였다 — 클래스가 CSS 에 없으면
// 4단계가 스타일 없는 버튼 더미가 된다. 온보딩 클래스와 함께 여기서 못박는다.
test("온보딩·종목 고르기 클래스가 style.css 에 있다", () => {
  [".ob", ".ob-prog", ".ob-seg", ".ob-step", ".ob-h", ".ob-sub", ".ob-canvas",
   ".ob-comb", ".ob-bar", ".ob-nav", ".ob-over", ".ob-cap",
   ".ob-grant", ".ob-retry", ".ob-costs", ".ob-cost-row", ".ob-cost-name", ".ob-cost-num",
   ".ob-risk", ".ob-agree", ".ob-agree-txt",
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
test("2단계 빗은 30개다 — 방향을 물을 수 있는 지표만", () => {
  var graph = G.full32Graph(FC);
  var vol = SAMPLE.candle.map(function (c) { return c.v; });
  G.setVolume(graph, vol);
  var input = { price: SAMPLE.price, candle: SAMPLE.candle, volume: vol };
  var rows = IND.biases(FC, graph, input);
  assert.strictEqual(rows.length, FC.indicatorCount - IND.NO_BIAS.length);
  assert.strictEqual(rows.length, 30);
  rows.forEach(function (r) { assert.ok(isFinite(r.bias), r.type + " 의 bias 가 숫자가 아니다"); });
  // biases 로 바꾼 근거 — readings 와 같은 30행을 준다. 같지 않다면 바꾼 것이 열화다.
  var viaReadings = IND.readings(FC, graph, input, IND.ctxFrom(input));
  assert.deepStrictEqual(rows.map(function (r) { return [r.type, r.bias]; }),
                         viaReadings.map(function (r) { return [r.type, r.bias]; }),
                         "biases 와 readings 의 행이 다르다");
});

// 두 벌 작도가 갈리는 것을 막는다 — 온보딩은 report.js 와 같은 모듈을 부른다.
test("paintChart 는 기존 작도 모듈을 부른다", () => {
  ["MSChartLayout.chartLayout", "MSChartDraw.drawAxes", "MSChartDraw.drawCandles",
   "MSChartDraw.drawCone", "ForgeCore.run"].forEach(function (call) {
    assert.ok(OB.indexOf(call) > 0, call + " 를 부르지 않는다");
  });
  // DPR 블록은 MSUi.fitCanvas 한 벌이다 — 리포트와 온보딩이 각자 갖고 있다가 이미 갈렸다.
  assert.match(OB, /MSUi\.fitCanvas\(/);
  assert.doesNotMatch(OB, /devicePixelRatio/, "DPR 블록을 다시 손으로 폈다");
  assert.match(REPORT, /MSUi\.fitCanvas\(/, "리포트가 자기 DPR 블록으로 되돌아갔다");
  // 티어("basic")·패널·높이는 소스 문자열이 아니라 실제 인자로 본다(아래 스파이 테스트) —
  // 정규식은 주석에도 걸려서 호출을 바꿔도 초록인 채로 통과한다.
  // 빗은 방향만 쓴다. noDirRows(trend·phasefold)를 섞으면 32가 되고 bias 가 null 인 둘이
  // "중립 막대"로 위장한다 — 못 읽은 것과 중립은 다르다. readings 는 안 쓴다(문장 30개를 버린다).
  assert.doesNotMatch(OB, /noDirRows/);
  assert.doesNotMatch(OB, /MSIndicators\.readings/);
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

function withDom(fn, storeOverride) {
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
  put("MSTickerPicker", require("../www/ticker-picker.js"));
  put("MSStore", storeOverride || defaultFakeStore());

  // ── 인자 스파이. 메서드 **이름**만 기록하면 티어("basic"→"full")·패널 구성·캔버스 높이를
  // 바꿔도 전부 초록이다(리뷰가 실제로 그렇게 통과시켰다). 호출된 인자를 붙잡는다.
  // require 캐시를 오염시키지 않도록 얕은 복사본에만 래퍼를 씌운다 — 두 모듈 다 내부에서는
  // 클로저로 서로를 부르므로 복사본 교체가 원본 동작을 바꾸지 않는다.
  const spy = { cone: [], layout: [] };
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
  put("MSPreds", require("../www/draw-preds.js"));
  put("MSLayers", require("../www/draw-layers.js"));
  put("MSZoom", require("../www/chart-zoom.js"));
  try { return fn(new El("div"), spy); }
  finally { Object.keys(saved).forEach(k => { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; }); }
}

// PRED_TIERS.full = ["p1","p3"] — "full" 이 새면 온보딩이 3차 예측선을 조용히 덧그린다.
// 소스 정규식 /"basic"/ 은 이 줄의 **주석**에도 걸려서 호출을 바꿔도 통과한다. 인자를 본다.
test("예측선은 1차만 — drawCone 이 basic 티어로 불린다", () => {
  withDom((root, spy) => {
    O.render(root, { sample: SAMPLE });
    assert.strictEqual(spy.cone.length, 1, "drawCone 이 한 번 불리지 않았다");
    assert.strictEqual(spy.cone[0].tier, "basic",
      "티어가 " + spy.cone[0].tier + " 다 — basic 이 아니면 예측선이 하나가 아니다");
    // 꿈틀 씨앗은 실종목명이 아니어야 한다 — 예시 시계를 그 종목의 예측처럼 읽히게 만든다.
    assert.strictEqual(spy.cone[0].opts.sym, "SAMPLE");
  });
});

test("차트는 가격 패널 한 장이고, 날짜축 자리를 미리 뗀다", () => {
  withDom((root, spy) => {
    O.render(root, { sample: SAMPLE });
    assert.strictEqual(spy.layout.length, 1, "chartLayout 이 한 번 불리지 않았다");
    const o = spy.layout[0];
    assert.deepStrictEqual(o.panels, ["price"],
      "서브패널(volume·rsi·macd)이 딸려 온다 — 온보딩 1단계는 가격 한 장이다");

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

// ── 4단계: 종목 고르기 ──────────────────────────────────────────────────────────
// tp-grid 는 이벤트 위임(클릭이 grid 에서 잡힌다)이라, 이 DOM 스텁의 El.click() 은 부모로
// 버블링하지 않는다 — grid 의 리스너를 target 을 지정해 직접 부른다.
function pressCell(grid, sym) {
  var cell = grid.children.filter(function (c) { return c.getAttribute("data-sym") === sym; })[0];
  if (!cell) throw new Error("셀을 못 찾았다: " + sym);
  grid.listeners.click[0]({ target: cell });
}
function onSyms(grid) {
  return grid.children.filter(function (c) { return c.className.indexOf("is-on") >= 0; })
    .map(function (c) { return c.getAttribute("data-sym"); });
}
function toStep4(root) {
  O.render(root, { sample: SAMPLE });
  root.querySelector(".ob-next").click();   // 1 -> 2
  root.querySelector(".ob-next").click();   // 2 -> 3
  root.querySelector(".ob-next").click();   // 3 -> 4 (지갑이 없어 실패해도 막지 않는다)
}

test("4단계는 SEED 3종이 프리셋으로 켜져 있고, 계속하기가 열려 있다", () => {
  withDom((root) => {
    toStep4(root);
    var grid = root.querySelector(".tp-grid");
    assert.ok(grid, "종목 그리드가 없다");
    assert.deepStrictEqual(onSyms(grid).slice().sort(), ["AAPL", "MSFT", "NVDA"],
      "프리셋 3종이 처음부터 켜져 있어야 한다");
    assert.strictEqual(root.querySelector(".ob-next").disabled, false);
  });
});

test("4단계: 전부 지우면 계속하기가 막힌다", () => {
  withDom((root) => {
    toStep4(root);
    var grid = root.querySelector(".tp-grid");
    ["AAPL", "NVDA", "MSFT"].forEach(function (sym) { pressCell(grid, sym); });
    assert.deepStrictEqual(onSyms(grid), [], "전부 껐는데 켜진 채로 남아 있다");
    assert.strictEqual(root.querySelector(".ob-next").disabled, true,
      "아무것도 안 골랐는데 계속하기가 열려 있다");
  });
});

// 뒤로/앞으로를 오가는 재진입 회귀 — 3단계 grantBox 와 같은 종류의 결함. 프리셋을 전부
// 지운 뒤 3단계로 갔다 다시 오면, step4() 가 매번 새 픽커를 만들면서 프리셋(SEED)을 다시
// preset 으로 주면 지운 선택이 되살아난다. 소스 검사로는 안 보인다 — state.picked 를
// preset 으로 쓰는지 SEED 를 쓰는지가 코드 모양만으로 구별되지 않기 때문이다.
test("4단계: 프리셋을 지운 뒤 뒤로/앞으로 가도 프리셋으로 되돌아가지 않는다", () => {
  withDom((root) => {
    toStep4(root);
    var grid = root.querySelector(".tp-grid");
    ["AAPL", "NVDA", "MSFT"].forEach(function (sym) { pressCell(grid, sym); });
    assert.deepStrictEqual(onSyms(grid), [], "전부 껐는데 켜진 채로 남아 있다");
    root.querySelector(".ob-back").click();   // 4 -> 3
    root.querySelector(".ob-next").click();   // 3 -> 4, 다시 그려짐
    grid = root.querySelector(".tp-grid");
    assert.deepStrictEqual(onSyms(grid), [],
      "지운 선택이 프리셋으로 되돌아갔다 — 재진입 시 state.picked 로 다시 칠해야 한다");
  });
});

// 기존 워치리스트를 가진 사람의 4단계 규칙(사용자 결정, 2026-08-15): 이미 갖고 있는 종목은
// 잠긴 채 보존되고(해제 불가) 상한은 걸지 않는다. 상한까지 걸면 뺄 수도 없고(잠김) 넣을 수도
// 없어(상한 도달) 아무것도 못 하는 읽기 전용 화면이 된다.
test("4단계: 기존 워치리스트 종목은 잠기고, 그 위에 자유롭게 더할 수 있다", () => {
  withDom((root) => {
    toStep4(root);
    var grid = root.querySelector(".tp-grid");
    assert.deepStrictEqual(onSyms(grid).slice().sort(), ["AAPL", "AMZN", "MSFT", "NVDA"],
      "4종 프리셋이 전부 켜진 채로 시작하지 않았다");

    pressCell(grid, "AMZN");   // 잠긴 종목 — 꺼지면 안 된다(seedTo 가 추가만 하므로 거짓말이 된다)
    assert.deepStrictEqual(onSyms(grid).slice().sort(), ["AAPL", "AMZN", "MSFT", "NVDA"],
      "워치리스트에 있는 종목이 해제됐다 — 화면은 뺐다는데 목록엔 남는다");
    var msg = grid.parentNode.querySelector(".tp-msg");
    assert.strictEqual(msg.textContent, S.t.tpKept, "왜 안 빠지는지 말하지 않았다");

    // TSLA — CURATED 8종(시안 12a) 중 이 4종 프리셋 밖에 있는 심볼. 상한이 없어야 그
    // 위에 더 얹을 수 있다(예전엔 CURATED 12종 중 하나였던 META 로 같은 것을 확인했다).
    pressCell(grid, "TSLA");
    assert.deepStrictEqual(onSyms(grid).slice().sort(), ["AAPL", "AMZN", "MSFT", "NVDA", "TSLA"],
      "상한에 걸려 더 넣지 못했다 — 기존 목록이 있으면 상한을 걸지 않는다");
    assert.notStrictEqual(grid.parentNode.querySelector(".tp-msg").textContent, S.t.tpFull);
    assert.strictEqual(root.querySelector(".ob-next").disabled, false);
  }, defaultFakeStore([
    { sym: "AAPL", name: "Apple Inc." }, { sym: "NVDA", name: "NVIDIA Corporation" },
    { sym: "MSFT", name: "Microsoft Corporation" }, { sym: "AMZN", name: "Amazon.com" }
  ]));
});

// 재진입 함정(리뷰 Important 1 의 새 규칙판): lockedSyms 를 매번 다시 재면 "지금 고른 것"이
// "원래 갖고 있던 것"으로 둔갑한다 — 4단계에서 새로 더한 TSLA 까지 잠겨버려 다시 뺄 수 없게 된다.
// (예전엔 CURATED 12종 중 하나였던 META 로 같은 것을 확인했다 — 시안 12a 의 8종엔 없다.)
test("4단계: 재진입해도 잠금은 원래 워치리스트에만 걸린다 — 새로 더한 것은 뺄 수 있다", () => {
  withDom((root) => {
    toStep4(root);
    var grid = root.querySelector(".tp-grid");
    pressCell(grid, "TSLA");                  // 새로 더한다(잠기면 안 된다)
    root.querySelector(".ob-back").click();   // 4 -> 3
    root.querySelector(".ob-next").click();   // 3 -> 4, 다시 그려짐
    grid = root.querySelector(".tp-grid");
    assert.ok(onSyms(grid).indexOf("TSLA") >= 0, "새로 더한 종목이 재진입에서 사라졌다");
    pressCell(grid, "TSLA");
    assert.ok(onSyms(grid).indexOf("TSLA") < 0,
      "새로 더한 종목까지 잠겼다 — lockedSyms 를 재진입마다 다시 재고 있다");
    pressCell(grid, "AAPL");
    assert.ok(onSyms(grid).indexOf("AAPL") >= 0, "원래 워치리스트 종목의 잠금이 풀렸다");
  }, defaultFakeStore([
    { sym: "AAPL", name: "Apple Inc." }, { sym: "NVDA", name: "NVIDIA Corporation" },
    { sym: "MSFT", name: "Microsoft Corporation" }, { sym: "AMZN", name: "Amazon.com" }
  ]));
});
test("4단계: 프리셋이 3종 이하면 상한은 그대로 3이다", () => {
  withDom((root) => {
    toStep4(root);
    var grid = root.querySelector(".tp-grid");
    pressCell(grid, "005930");   // AAPL·NVDA·MSFT 3종이 이미 켜져 있으니 4번째는 상한 초과다(삼성전자, CURATED 8종 중 하나)
    assert.deepStrictEqual(onSyms(grid).slice().sort(), ["AAPL", "MSFT", "NVDA"],
      "3종 프리셋인데 상한이 3보다 커졌다");
    var msg = grid.parentNode.querySelector(".tp-msg");
    assert.strictEqual(msg.textContent, S.t.tpFull, "상한 안내가 안 떴다");
  }, defaultFakeStore([]));   // 빈 목록 → SEED(AAPL/NVDA/MSFT) 3종 프리셋
});

// 위 4단계 재진입의 정확한 쌍둥이. 이쪽이 더 나쁘다: 4단계는 선택이 되살아나는 것으로 눈에
// 보이지만, 5단계는 **화면상 체크가 꺼진 채로 완료 버튼만 열려 있다**. 그 상태로 누르면
// 사용자가 보기엔 동의하지 않았는데 동의 기록(setOnboarded)이 남는다 — 시안이 "법적 효력이
// 있는 자리"라고 부른 유일한 컨트롤이다. canAdvance(5,{agreed:false}) 만 보는 순수 함수
// 테스트로는 절대 안 보인다(state 는 살아 있고 DOM 만 새것이기 때문).
test("5단계: 체크한 뒤 뒤로/앞으로 가도 체크박스가 켜진 채로 다시 그려진다", () => {
  var onboardedCalls = 0;
  var store = defaultFakeStore([]);
  store.setOnboarded = function () { onboardedCalls++; };
  withDom((root) => {
    toStep4(root);
    root.querySelector(".ob-next").click();   // 4 -> 5
    var cb = function () {
      return root.querySelector(".ob-agree").children.filter(function (c) { return c.tagName === "INPUT"; })[0];
    };
    assert.strictEqual(!!cb().checked, false, "처음부터 체크돼 있다");
    assert.strictEqual(root.querySelector(".ob-next").disabled, true);

    cb().checked = true;
    cb().listeners.change[0]({});
    assert.strictEqual(root.querySelector(".ob-next").disabled, false);

    root.querySelector(".ob-back").click();   // 5 -> 4
    root.querySelector(".ob-next").click();   // 4 -> 5, 새 DOM

    assert.strictEqual(root.querySelector(".ob-next").disabled, false,
      "state.agreed 가 살아 있으니 완료는 열려 있어야 한다");
    assert.strictEqual(cb().checked, true,
      "완료 버튼은 열려 있는데 체크박스는 꺼져 있다 — 화면상 동의하지 않은 채로 동의가 기록된다");
    // 그리고 그 상태에서 누르면 실제로 기록이 남는다는 것까지 확인한다.
    root.querySelector(".ob-next").click();
    assert.strictEqual(onboardedCalls, 1);
  }, store);
});

// 이미 워치리스트가 있는 사람(지금까지 쓰던 테스터)이 온보딩을 처음 만나는 경우. SEED 를
// 프리셋으로 주면 자기가 고르지 않은 3종이 자기 목록에 얹힌다 — 이 단계가 없애려던 그 상태다.
// 워치리스트가 있다고 온보딩을 건너뛰지는 않는다(동의 기록은 법적 효력이 있는 자리라 한 번은
// 받아야 한다) — 그래서 '건너뛰었는가'가 아니라 '무엇이 켜져 있는가'로 확인한다.
test("4단계: 기존 워치리스트가 있으면 그것이 프리셋이다 — SEED 3종이 얹히지 않는다", () => {
  withDom((root) => {
    toStep4(root);
    var grid = root.querySelector(".tp-grid");
    // PLTR 은 CURATED 밖이지만 이제 격자에 셀이 생겨 켜진다(paint()가 CURATED 밖 선택
    // 항목도 그린다) — 켜진 칸은 TSLA·PLTR 둘이어야 하고, 무엇보다 SEED 3종이 하나도
    // 켜져 있으면 안 된다.
    assert.deepStrictEqual(onSyms(grid).slice().sort(), ["PLTR", "TSLA"],
      "기존 목록 대신 SEED 가 프리셋으로 들어왔거나 CURATED 밖 종목이 안 켜졌다: " + onSyms(grid).join(","));
  }, defaultFakeStore([{ sym: "TSLA", name: "Tesla, Inc." }, { sym: "PLTR", name: "Palantir" }]));
});

// 이 태스크가 정확히 문 버그: 워치리스트 전체가 CURATED 밖이면(예: PLTR 하나뿐) 예전엔
// selected()가 참인데 격자엔 켜진 셀이 하나도 없어 "아무것도 안 고른 것처럼" 보였다.
test("4단계: 워치리스트 전체가 CURATED 밖이어도 그 종목이 켜진 채로 보인다", () => {
  withDom((root) => {
    toStep4(root);
    var grid = root.querySelector(".tp-grid");
    assert.deepStrictEqual(onSyms(grid), ["PLTR"],
      "CURATED 밖 유일한 프리셋이 셀로 안 그려졌다 — 화면엔 아무것도 안 고른 것처럼 보인다");
    assert.strictEqual(root.querySelector(".ob-next").disabled, false,
      "선택은 있는데(selected()===['PLTR']) 계속하기가 막혀 있다");
  }, defaultFakeStore([{ sym: "PLTR", name: "Palantir" }]));
});

test("4단계: 워치리스트가 비어 있을 때만 SEED 로 떨어진다", () => {
  withDom((root) => {
    toStep4(root);
    assert.deepStrictEqual(onSyms(root.querySelector(".tp-grid")).slice().sort(),
      ["AAPL", "MSFT", "NVDA"], "빈 목록인데 SEED 프리셋이 안 켜졌다");
  }, defaultFakeStore([]));
});

// 기존 목록은 격자 밖(CURATED 에 없는 심볼)에 있어도 완료 시 그대로 살아남아야 한다 —
// 프리셋에서 슬그머니 빠지면 테스터의 종목이 사라진다.
test("4단계: 기존 목록은 격자에 칸이 없어도 완료까지 살아남는다", () => {
  var added = [];
  var store = defaultFakeStore([{ sym: "TSLA", name: "Tesla, Inc." }, { sym: "PLTR", name: "Palantir" }]);
  store.addTicker = function (s, n) { added.push([s, n]); };
  withDom((root) => {
    toStep4(root);
    root.querySelector(".ob-next").click();   // 4 -> 5
    var cb = root.querySelector(".ob-agree").children.filter(function (c) { return c.tagName === "INPUT"; })[0];
    cb.checked = true;
    cb.listeners.change[0]({});
    root.querySelector(".ob-next").click();
    // TSLA 는 CURATED 심볼이라 표준 이름("테슬라")을 심는다 — 워치리스트에 저장된 다른
    // 표기("Tesla, Inc.")로 덮이지 않는다. PLTR 은 CURATED 밖이라 프리셋이 준 워치리스트
    // 이름("Palantir")을 그대로 싣는다(ticker-picker.js 의 resolved 시딩). 심볼이 빠지는
    // 것만은 안 된다.
    assert.deepStrictEqual(added, [["TSLA", "테슬라"], ["PLTR", "Palantir"]],
      "기존 종목/이름이 완료에서 달라졌다: " + JSON.stringify(added));
  }, store);
});

// ── 5단계: 위험 고지 + 약관 + 완료 ────────────────────────────────────────────────
test("5단계: 체크 전엔 완료가 막히고, 체크 후 완료가 고른 종목만 정확히 심는다", () => {
  var added = [];
  var onboardedArg = null;
  var doneCalled = false;
  var store = {
    SEED: [{ sym: "AAPL" }, { sym: "NVDA" }, { sym: "MSFT" }],
    addTicker: function (s, n) { added.push([s, n]); },
    setOnboarded: function (v) { onboardedArg = v; },
    onboarded: function () { return false; },
    getWatchlist: function () { return []; }
  };
  withDom((root) => {
    O.render(root, { sample: SAMPLE, onDone: function () { doneCalled = true; } });
    root.querySelector(".ob-next").click();   // 1 -> 2
    root.querySelector(".ob-next").click();   // 2 -> 3
    root.querySelector(".ob-next").click();   // 3 -> 4
    var grid = root.querySelector(".tp-grid");
    // NVDA 하나만 남긴다 — 프리셋 그대로 두면 "고른 것과 SEED 를 심는 것"을 구별 못한다.
    pressCell(grid, "AAPL"); pressCell(grid, "MSFT");
    assert.deepStrictEqual(onSyms(grid), ["NVDA"]);
    root.querySelector(".ob-next").click();   // 4 -> 5

    var fwd = root.querySelector(".ob-next");
    assert.strictEqual(fwd.textContent, S.t.obFinish, "마지막 버튼 문구가 완료 문구가 아니다");
    assert.strictEqual(fwd.disabled, true, "체크 전인데 완료 버튼이 열려 있다");
    fwd.click();   // canAdvance 가스로도 다시 막는다 — disabled 우회 클릭에 대한 방어
    assert.strictEqual(doneCalled, false, "체크 전인데 완료 콜백이 불렸다");
    assert.strictEqual(added.length, 0, "체크 전인데 워치리스트가 심겼다");
    assert.strictEqual(onboardedArg, null, "체크 전인데 동의가 남았다");

    var cb = root.querySelector(".ob-agree").children.filter(function (c) { return c.tagName === "INPUT"; })[0];
    assert.ok(cb, "체크박스가 없다");
    cb.checked = true;
    cb.listeners.change[0]({});
    assert.strictEqual(fwd.disabled, false, "체크 후에도 완료 버튼이 막혀 있다");

    fwd.click();
    // 심볼뿐 아니라 이름까지 본다 — 이름이 빈 채로 가면 store.js 가 심볼로 폴백해
    // 워치리스트 행이 심볼을 두 번 찍고 회사명 검색에서 빠진다(picker 의 CURATED 이름).
    assert.deepStrictEqual(added, [["NVDA", "엔비디아"]], "심긴 종목/이름이 고른 것과 다르다: " + JSON.stringify(added));
    assert.strictEqual(onboardedArg, "terms-2026-08", "약관 버전이 정확히 안 남았다: " + onboardedArg);
    assert.strictEqual(doneCalled, true, "완료 콜백이 안 불렸다");
  }, store);
});

// 리뷰 지적(실행으로 확인됨): 완료 버튼을 연타하면 seedTo·setOnboarded·onDone 이 전부 두 번
// 발화했다. 실 MSStore.addTicker(store.js)는 심볼로 중복을 걸러 "워치리스트 중복 행"으로는
// 안 드러나지만, opts.onDone() 은 그런 안전장치가 없다 — app.js 가 boot() 에 그대로 연결하므로
// 연타 한 번이 부팅 시퀀스를 두 번 돌린다. 여기서는 **중복 제거 없는** 가짜 store 를 쓴다 —
// 실 addTicker 의 dedup 을 빌리면 심는 횟수 자체가 두 번인 증상이 가려진다(리뷰가 지적한 함정).
test("5단계: 완료 버튼 연타(더블탭)에도 한 번만 심고 한 번만 완료한다", () => {
  var added = [];
  var onboardedCalls = 0;
  var doneCalls = 0;
  var store = {
    SEED: [{ sym: "AAPL" }, { sym: "NVDA" }, { sym: "MSFT" }],
    addTicker: function (s) { added.push(s); },              // 의도적으로 중복 제거 안 함
    setOnboarded: function () { onboardedCalls++; },
    onboarded: function () { return false; },
    getWatchlist: function () { return []; }
  };
  withDom((root) => {
    O.render(root, { sample: SAMPLE, onDone: function () { doneCalls++; } });
    root.querySelector(".ob-next").click();   // 1 -> 2
    root.querySelector(".ob-next").click();   // 2 -> 3
    root.querySelector(".ob-next").click();   // 3 -> 4
    root.querySelector(".ob-next").click();   // 4 -> 5 (프리셋 3종 그대로)
    var cb = root.querySelector(".ob-agree").children.filter(function (c) { return c.tagName === "INPUT"; })[0];
    cb.checked = true;
    cb.listeners.change[0]({});
    var fwd = root.querySelector(".ob-next");
    fwd.click();
    fwd.click();   // 더블탭 — 같은 버튼 인스턴스에 연속 두 번(disabled 반영과 무관하게 둘 다 발화)
    assert.strictEqual(onboardedCalls, 1, "setOnboarded 가 두 번 불렸다: " + onboardedCalls);
    assert.strictEqual(doneCalls, 1, "onDone 이 두 번 불렸다 — app.js 가 boot() 를 두 번 돌린다: " + doneCalls);
    assert.strictEqual(added.length, 3, "심기가 두 번 실행됐다(연타로 워치리스트가 중복 심겼다): " + added.length);
  }, store);
});

// 리뷰 지적: state.finished 는 seedTo/setOnboarded/onDone 이 돌기 **전에** 켜진다(연타 방지를
// 위해서다) — 그런데 그중 하나가 던지면 래치가 켜진 채 멈춘다. 그러면 버튼은 disabled=true 로
// 굳고, onDone 도 못 불려 앱이 영영 부팅하지 않는다. store.js write() 가 오늘은 모든 localStorage
// 예외를 삼켜 이 경로가 실제로 던질 일이 없지만, 그건 이 가드가 아니라 다른 파일의 방어력에
// 기대는 것이다 — 가짜 store 로 강제로 던져서 이 핸들러 스스로 복구하는지 검사한다.
test("5단계: 완료 처리 중 예외가 나면 래치를 풀고 버튼을 다시 열어 재시도할 수 있다", () => {
  var doneCalls = 0;
  var shouldThrow = true;
  var store = {
    SEED: [{ sym: "AAPL" }, { sym: "NVDA" }, { sym: "MSFT" }],
    addTicker: function () {},
    setOnboarded: function () { if (shouldThrow) throw new Error("quota exceeded"); },
    onboarded: function () { return false; },
    getWatchlist: function () { return []; }
  };
  withDom((root) => {
    O.render(root, { sample: SAMPLE, onDone: function () { doneCalls++; } });
    root.querySelector(".ob-next").click();   // 1 -> 2
    root.querySelector(".ob-next").click();   // 2 -> 3
    root.querySelector(".ob-next").click();   // 3 -> 4
    root.querySelector(".ob-next").click();   // 4 -> 5 (프리셋 3종 그대로)
    var cb = root.querySelector(".ob-agree").children.filter(function (c) { return c.tagName === "INPUT"; })[0];
    cb.checked = true;
    cb.listeners.change[0]({});
    var fwd = root.querySelector(".ob-next");

    assert.throws(function () { fwd.click(); }, /quota exceeded/,
      "예외가 조용히 삼켜졌다 — 원인이 안 보이면 디버깅할 수 없다");
    assert.strictEqual(fwd.disabled, false,
      "예외 후에도 완료 버튼이 비활성인 채 남았다 — 사용자가 5단계에 갇힌다");
    assert.strictEqual(doneCalls, 0, "예외가 났는데 완료 콜백이 불렸다");

    shouldThrow = false;   // 다음 시도는 성공한다 — 사용자가 다시 눌러 복구되는지 확인
    fwd.click();
    assert.strictEqual(doneCalls, 1, "래치를 풀어도 재시도가 끝까지 완료되지 않는다");
  }, store);
});

// ── 3단계: 지갑 호출 ───────────────────────────────────────────────────────────
// 위 withDom 은 동기 콜백 전제다 — try { return fn(...) } finally { 복구 } 라서, fn 이 비동기면
// fn 의 await 가 끝나기 전에 finally 가 먼저 돌아 document/MSWallet 이 사라진다(재시도 버튼이
// document.createElement 를 다시 부르는 순간 터진다). 3단계는 Promise 를 기다려야 하므로
// 별도의 비동기 헬퍼를 쓴다 — 기존 withDom 은 건드리지 않는다(다른 30여 개 동기 테스트가 문다).
async function withDomWallet(wallet, fn) {
  const g = globalThis;
  const saved = {};
  const put = (k, v) => { saved[k] = Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; g[k] = v; };
  put("document", { createElement: t => new El(t), documentElement: new El("html") });
  put("window", { devicePixelRatio: 3 });
  put("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  put("MSUi", require("../www/ui.js"));
  put("MSStr", S);
  put("MSWallet", wallet);
  try {
    return await fn(new El("div"));
  } finally {
    Object.keys(saved).forEach(k => { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; });
  }
}

function flush() { return new Promise(r => setTimeout(r, 0)); }

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

function toStep3(root) {
  O.render(root, { sample: SAMPLE });
  root.querySelector(".ob-next").click();   // 1 -> 2
  root.querySelector(".ob-next").click();   // 2 -> 3
}

// 뮤테이션 (a): 지급액을 리터럴로 박아 넣으면 여기서 잡힌다 — 스파이가 5 가 아닌 11 을 돌려준다.
test("지급액은 서버가 돌려준 값이다 — 클라이언트가 지어내지 않는다", async () => {
  const wallet = spyWallet({ ok: true, state: { balance: 11 } });
  await withDomWallet(wallet, async (root) => {
    toStep3(root);
    await flush();
    const box = root.querySelector(".ob-grant");
    assert.ok(box, "지급 영역이 없다");
    assert.strictEqual(box.textContent, "11" + S.t.obGranted,
      "표시된 문구가 서버 값(11)을 쓰지 않는다: " + box.textContent);
  });
});

// 가격표 값도 스파이의 COSTS 를 그대로 반영해야 한다(실제 COSTS 와 다른 값을 줘서 리터럴화를 잡는다).
test("가격표 숫자는 MSWallet.COSTS 값 그대로다 — 다시 적지 않는다", async () => {
  const wallet = spyWallet({ ok: true, state: { balance: 5 } }, { full: 30, scan: 20, slot: 10 });
  await withDomWallet(wallet, async (root) => {
    toStep3(root);
    await flush();
    const rows = root.querySelector(".ob-costs").children;
    assert.strictEqual(rows.length, 3);
    const nums = rows.map(r => r.querySelector(".ob-cost-num").textContent);
    assert.deepStrictEqual(nums, ["30", "20", "10"], "가격표가 COSTS(30/20/10)를 안 따라간다: " + nums.join(","));
  });
});

// 뮤테이션 (b): 실패 시 진행을 막으면 여기서 잡힌다 — 재시도 버튼은 뜨되 Continue 는 살아 있어야 한다.
test("지급 실패해도 진행이 막히지 않는다 — 재시도 버튼이 뜨고 계속하기는 눌린다", async () => {
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep3(root);
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
test("자동 지급 호출은 한 번뿐이다 — 3단계를 다시 그려도 재호출하지 않고, 결과는 다시 그려진다", async () => {
  const wallet = spyWallet({ ok: true, state: { balance: 5 } });
  await withDomWallet(wallet, async (root) => {
    toStep3(root);
    await flush();
    assert.strictEqual(wallet.calls.length, 1, "첫 진입에서 지갑을 한 번이 아니게 불렀다");
    assert.strictEqual(root.querySelector(".ob-grant").textContent, "5" + S.t.obGranted,
      "첫 진입에서 지급액이 안 그려졌다");
    root.querySelector(".ob-back").click();   // 3 -> 2
    root.querySelector(".ob-next").click();   // 2 -> 3, 다시 그려짐
    await flush();
    assert.strictEqual(wallet.calls.length, 1,
      "3단계를 다시 그리며 지갑을 또 불렀다 — 자동 호출은 render() 생애 동안 한 번이어야 한다");
    // 핵심 회귀 지점 — 재호출은 안 해도 새로 만들어진 .ob-grant 는 비어 있다. 기억한 state
    // (granted)로 다시 칠하지 않으면 여기서 빈 문자열이 나온다.
    assert.strictEqual(root.querySelector(".ob-grant").textContent, "5" + S.t.obGranted,
      "뒤로/앞으로 후 지급액 표시가 사라졌다(빈 화면) — 재진입 시 state 로 다시 그려야 한다");
  });
});

// 같은 회귀를 실패 경로에서도 확인한다 — 실패 결과(오프라인 안내 + 재시도 버튼)도
// 재진입 시 다시 그려져야 한다. 그리지 않으면 "실패도 성공도 아닌 빈 화면"이 되어
// 사용자가 뭐가 잘못됐는지 알 방법이 없다.
test("실패 결과도 뒤로/앞으로 후 다시 그려진다 — 빈 화면이 되면 안 된다", async () => {
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep3(root);
    await flush();
    assert.strictEqual(root.querySelector(".ob-grant").textContent, S.t.obGrantOffline);
    assert.ok(root.querySelector(".ob-retry"), "첫 진입에서 재시도 버튼이 없다");
    root.querySelector(".ob-back").click();   // 3 -> 2
    root.querySelector(".ob-next").click();   // 2 -> 3, 다시 그려짐
    await flush();
    assert.strictEqual(wallet.calls.length, 1, "재진입에서 지갑을 또 불렀다 — 자동 호출은 한 번이어야 한다");
    assert.strictEqual(root.querySelector(".ob-grant").textContent, S.t.obGrantOffline,
      "뒤로/앞으로 후 실패 안내가 사라졌다(빈 화면)");
    assert.ok(root.querySelector(".ob-retry"), "뒤로/앞으로 후 재시도 버튼이 사라졌다 — 복구 수단이 없다");
  });
});

// 재시도 버튼은 수동으로는 다시 부를 수 있어야 한다(위 가드는 자동 발신만 막는다).
test("재시도 버튼을 누르면 지갑을 다시 부른다", async () => {
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    toStep3(root);
    await flush();
    assert.strictEqual(wallet.calls.length, 1);
    root.querySelector(".ob-retry").click();
    await flush();
    assert.strictEqual(wallet.calls.length, 2, "재시도 버튼이 지갑을 다시 안 불렀다");
  });
});
