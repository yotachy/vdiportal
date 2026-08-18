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
  assert.strictEqual(O.next(3, { agreed: false }), 3, "동의 없이 체험으로 넘어간다");
  assert.strictEqual(O.next(3, { agreed: true }), 4);
  assert.strictEqual(O.next(7, { agreed: true }), 7, "마지막 단계에서 더 나아간다");
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

// 4·5단계용 기본 가짜 store — 실제 store.js(localStorage)는 쓰지 않는다. 여러 테스트가
// 같은 모듈 인스턴스를 require 캐시로 공유하면 상태가 샌다 — spyWallet 과 같은 이유.
function defaultFakeStore(watchlist) {
  return {
    SEED: [{ sym: "AAPL", name: "Apple Inc." }, { sym: "NVDA", name: "NVIDIA Corporation" },
            { sym: "MSFT", name: "Microsoft Corporation" }],
    // 온보딩 체험 종목은 실물 store 에서 가져온다 — 가짜가 목록을 따로 들면 화면이
    // 실제로 몇 개를 제시하는지 시험이 못 본다.
    TUTORIAL_SYMS: require("../www/store.js").TUTORIAL_SYMS,
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



// 뒤로/앞으로를 오가는 재진입 회귀 — 3단계 grantBox 와 같은 종류의 결함. 프리셋을 전부
// 지운 뒤 3단계로 갔다 다시 오면, step4() 가 매번 새 픽커를 만들면서 프리셋(SEED)을 다시
// preset 으로 주면 지운 선택이 되살아난다. 소스 검사로는 안 보인다 — state.picked 를
// preset 으로 쓰는지 SEED 를 쓰는지가 코드 모양만으로 구별되지 않기 때문이다.

// 기존 워치리스트를 가진 사람의 4단계 규칙(사용자 결정, 2026-08-15): 이미 갖고 있는 종목은
// 잠긴 채 보존되고(해제 불가) 상한은 걸지 않는다. 상한까지 걸면 뺄 수도 없고(잠김) 넣을 수도
// 없어(상한 도달) 아무것도 못 하는 읽기 전용 화면이 된다.

// 재진입 함정(리뷰 Important 1 의 새 규칙판): lockedSyms 를 매번 다시 재면 "지금 고른 것"이
// "원래 갖고 있던 것"으로 둔갑한다 — 4단계에서 새로 더한 TSLA 까지 잠겨버려 다시 뺄 수 없게 된다.
// (예전엔 CURATED 12종 중 하나였던 META 로 같은 것을 확인했다 — 시안 12a 의 8종엔 없다.)

// 위 4단계 재진입의 정확한 쌍둥이. 이쪽이 더 나쁘다: 4단계는 선택이 되살아나는 것으로 눈에
// 보이지만, 5단계는 **화면상 체크가 꺼진 채로 완료 버튼만 열려 있다**. 그 상태로 누르면
// 사용자가 보기엔 동의하지 않았는데 동의 기록(setOnboarded)이 남는다 — 시안이 "법적 효력이
// 있는 자리"라고 부른 유일한 컨트롤이다. canAdvance(5,{agreed:false}) 만 보는 순수 함수
// 테스트로는 절대 안 보인다(state 는 살아 있고 DOM 만 새것이기 때문).

// 이미 워치리스트가 있는 사람(지금까지 쓰던 테스터)이 온보딩을 처음 만나는 경우. SEED 를
// 프리셋으로 주면 자기가 고르지 않은 3종이 자기 목록에 얹힌다 — 이 단계가 없애려던 그 상태다.
// 워치리스트가 있다고 온보딩을 건너뛰지는 않는다(동의 기록은 법적 효력이 있는 자리라 한 번은
// 받아야 한다) — 그래서 '건너뛰었는가'가 아니라 '무엇이 켜져 있는가'로 확인한다.

// 이 태스크가 정확히 문 버그: 워치리스트 전체가 CURATED 밖이면(예: PLTR 하나뿐) 예전엔
// selected()가 참인데 격자엔 켜진 셀이 하나도 없어 "아무것도 안 고른 것처럼" 보였다.


// 기존 목록은 격자 밖(CURATED 에 없는 심볼)에 있어도 완료 시 그대로 살아남아야 한다 —
// 프리셋에서 슬그머니 빠지면 테스터의 종목이 사라진다.

// ── 5단계: 위험 고지 + 약관 + 완료 ────────────────────────────────────────────────

// 리뷰 지적(실행으로 확인됨): 완료 버튼을 연타하면 seedTo·setOnboarded·onDone 이 전부 두 번
// 발화했다. 실 MSStore.addTicker(store.js)는 심볼로 중복을 걸러 "워치리스트 중복 행"으로는
// 안 드러나지만, opts.onDone() 은 그런 안전장치가 없다 — app.js 가 boot() 에 그대로 연결하므로
// 연타 한 번이 부팅 시퀀스를 두 번 돌린다. 여기서는 **중복 제거 없는** 가짜 store 를 쓴다 —
// 실 addTicker 의 dedup 을 빌리면 심는 횟수 자체가 두 번인 증상이 가려진다(리뷰가 지적한 함정).

// 리뷰 지적: state.finished 는 seedTo/setOnboarded/onDone 이 돌기 **전에** 켜진다(연타 방지를
// 위해서다) — 그런데 그중 하나가 던지면 래치가 켜진 채 멈춘다. 그러면 버튼은 disabled=true 로
// 굳고, onDone 도 못 불려 앱이 영영 부팅하지 않는다. store.js write() 가 오늘은 모든 localStorage
// 예외를 삼켜 이 경로가 실제로 던질 일이 없지만, 그건 이 가드가 아니라 다른 파일의 방어력에
// 기대는 것이다 — 가짜 store 로 강제로 던져서 이 핸들러 스스로 복구하는지 검사한다.

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
  // 7단계까지 실제로 걸어가려면 4~6단계가 엔진을 돌릴 수 있어야 한다 — 지갑만 있는 하네스로는
  // 4단계에서 멈춘다(결과가 없으면 넘어가지 않는 것이 사양이다).
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

// 7단계까지 실제로 걸어간다. 각 단계가 요구하는 것을 실제로 충족시키면서 간다 —
// 상태를 밖에서 밀어 넣으면 "그 요구가 정말 화면에서 채워지는가"를 안 재게 된다.
async function toStep7(root) {
  O.render(root, { sample: SAMPLE });
  root.querySelector(".ob-guess-btn").click();          // 1: 직접 찍기
  root.querySelector(".ob-next").click();               // 1 -> 2
  root.querySelector(".ob-next").click();               // 2 -> 3 (32도구 화면은 입력 없이 넘어간다)
  const cb = root.querySelector(".ob-agree-cb");        // 3: 약관 체크
  cb.checked = true;
  (cb.listeners.change || []).forEach(f => f({}));
  root.querySelector(".ob-next").click();               // 3 -> 4
  root.querySelector(".ob-pick").click();               // 4: 종목 하나
  await flush();                                        // 실 데이터 적재(또는 번들 폴백)를 기다린다
  root.querySelector(".ob-next").click();               // 4 -> 5
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

// 같은 회귀를 실패 경로에서도 확인한다 — 실패 결과(오프라인 안내 + 재시도 버튼)도
// 재진입 시 다시 그려져야 한다. 그리지 않으면 "실패도 성공도 아닌 빈 화면"이 되어
// 사용자가 뭐가 잘못됐는지 알 방법이 없다.
test("실패 결과도 뒤로/앞으로 후 다시 그려진다 — 빈 화면이 되면 안 된다", async () => {
  const wallet = spyWallet({ ok: false, state: null, reason: "network" });
  await withDomWallet(wallet, async (root) => {
    await toStep7(root);
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

test("각 단계가 요구하는 것: 찍기 · [2단계는 보여줄 뿐] · 동의 · 기본분석 결과", () => {
  assert.equal(O.canAdvance(1, {}), false, "1단계는 직접 찍어야 넘어간다");
  assert.equal(O.canAdvance(1, { guessed: "up" }), true);
  // Task 4 재설계: 2단계는 32도구를 보여주는 화면이라 입력을 요구하지 않는다 — 옛 성향
  // 요구는 지웠다(성향 선택은 이후 태스크가 3단계에서 다시 짓는다).
  assert.equal(O.canAdvance(2, {}), true, "2단계는 32도구를 보여줄 뿐이라 입력을 요구하지 않는다");
  assert.equal(O.canAdvance(3, {}), false, "3단계는 약관 동의가 필수다");
  assert.equal(O.canAdvance(3, { agreed: true }), true);
  // 4단계는 결과가 실제로 나왔을 때만 넘어간다 — 계산 중에 넘기면 5단계가 빈 값을 비교한다.
  assert.equal(O.canAdvance(4, {}), false);
  assert.equal(O.canAdvance(4, { r1: {} }), true);
});

test("위험 고지가 분석 결과보다 앞이다 — 체험 전에 동의를 받는다", () => {
  // 시안 §2 가 3단계에 둔 이유가 이것이다. 결과를 보여준 뒤 동의를 받으면 이미 본 것을
  // 되돌릴 수 없다. 단계 번호로 잰다 — 3(고지) < 4~6(체험).
  const risk = OB.indexOf("obRisk"), tut = OB.indexOf("obTut1H");
  assert.ok(risk > 0 && tut > 0 && risk < tut,
    "위험 고지가 체험보다 뒤에 온다 — 결과를 보여준 뒤 동의를 받는 순서가 됐다");
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

test("체험 종목은 정확히 3개다 — 고르는 데 시간 쓰면 튜토리얼이 안 시작된다", () => {
  const ST = require("../www/store.js");
  globalThis.MSStore = ST;
  assert.equal(O.tutSyms().length, 3, "시안 16a 는 정확히 3개다: " + O.tutSyms().length);
  // 이름은 ticker-picker 가 정본이다 — 온보딩이 다시 적으면 워치리스트와 갈린다.
  const TP = require("../www/ticker-picker.js");
  globalThis.MSTickerPicker = TP;
  O.tutPicks().forEach(p => {
    assert.ok(p.sym, "심볼이 없다");
    assert.equal(p.name, TP.nameOf(p.sym) || p.sym, p.sym + " 이름이 CURATED 와 다르다");
  });
  delete globalThis.MSTickerPicker;
  delete globalThis.MSStore;
});

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

test("심화분석 체험이 시안의 거짓 주장을 옮겨 적지 않았다", () => {
  // 시안 16b 는 "답이 절반으로 좁아졌습니다"라고 쓰지만 우리 엔진에서는 거짓이다 —
  // 실측하면 심화의 범위가 오히려 넓어진다(티어 백테스트 콘커버 73.8% → 77.1%).
  // 화면이 할 수 있는 말의 경계는 측정이 정한다(P2 §2 진실 규칙).
  const t = S.t.obTut2H + " " + S.t.obTut2Sub + " " + S.t.obTut2Note;
  assert.ok(t.indexOf("절반") < 0, "'절반으로 좁아졌다'를 그대로 옮겼다: " + t);
  assert.match(S.t.obTut2H, /정직/, "심화가 파는 것(정직한 범위)을 말하지 않는다");
});

test("체험 화면의 커버 숫자는 번들 실측에서 온다 — 손으로 적지 않는다", () => {
  assert.ok(OB.indexOf("MSBacktest.tiers") > 0, "티어 실측을 읽지 않는다");
  // 73.8 / 77.1 같은 값이 소스에 리터럴로 있으면 재측정해도 화면이 안 따라온다.
  const code = OB.split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");
  assert.doesNotMatch(code, /7[0-9]\.[0-9]\s*%|0\.7[0-9]{2,}/,
    "커버리지 숫자가 소스에 박혀 있다 — 측정치가 아니라 기억이 된다");
});

test("번들 요약에 티어 실측이 실려 있다 — 없으면 그 블록을 그릴 수 없다", () => {
  const raw = readFileSync(new URL("../www/vendor/backtest-summary.js", import.meta.url), "utf8");
  const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  assert.ok(j.tiers && j.tiers.basic && j.tiers.deep, "tiers 가 없다 — sync-engine 이 안 실었다");
  ["coneCoverage", "calibrationECE", "directionHitRate"].forEach(k => {
    assert.equal(typeof j.tiers.basic[k], "number", "basic." + k);
    assert.equal(typeof j.tiers.deep[k], "number", "deep." + k);
  });
});

test("coverGap 은 라벨 80% 에서 얼마나 벗어났는지를 잰다", () => {
  assert.equal(O.coverGap(0.80), 0);
  assert.ok(Math.abs(O.coverGap(0.738) - 0.062) < 1e-9);
  assert.ok(Math.abs(O.coverGap(0.771) - 0.029) < 1e-9);
  assert.equal(O.coverGap(null), null, "값이 없으면 지어내지 않는다");
});

test("전문분석 체험은 가중치를 두 경로에 함께 넘긴다 — 한쪽만이면 예측선이 안 움직인다", () => {
  assert.match(OB, /driftWeights/, "드리프트 가중치를 안 넘긴다");
  assert.match(OB, /customGraph/, "combine 쪽 그래프를 안 만든다");
});

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
    if (s === 3) {
      var cb = root.querySelector(".ob-agree-cb");
      if (cb) { cb.checked = true; (cb.listeners.change || []).forEach(function (f) { f({}); }); }
    }
    if (s === 4) {
      var pick = root.querySelector(".ob-pick");
      if (pick) pick.click();
    }
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
