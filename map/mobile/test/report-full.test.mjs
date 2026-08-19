// 심화(full)·전문(custom) 티어 리포트 — 실제 조립을 잰다(report-basic.test.mjs 와 같은 태도:
// index.html 이 선언한 순서 그대로 전체 앱을 vm 에 태우고, MSReport.render() 를 실제로 불러
// 나온 DOM 을 검사한다).
//
// [2026-08-19, P1b Task 6 갱신] PENDING(sentence·forecast·hitrate·compare) 이 이제 비었다 —
// tierBuyable('full')·tierBuyable('custom') 이 둘 다 true 라 buildCta() 가 광고·스쿱 버튼을
// 그린다. `.rp-cta-scoop` 를 클릭하는 **브라우저 경로도 이제 열려 있다**(gate-routes.mjs
// report-purchase 라우트가 그 시퀀스를 태운다) — 그래도 이 파일은 여전히 아래 우회를 쓴다:
// 노드 단일 프로세스에서 초 단위 재생(19a·8b)을 매 시험 기다리는 것보다, report.js 자신이
// 이미 제공하는 "이미 산 것" 지름길로 render() 를 직접 겨냥하는 편이 빠르고 결정적이다 —
// 재생 자체가 실제로 도는지는 브라우저 관문(report-purchase) 몫으로 남긴다(역할 분담이지
// 이 파일이 못 가서가 아니다).
//
// render() 맨 끝(report.js — "이 세션에서 이미 산 것" 분기)은 purchases[sym|tier].an 이
// 있으면 로드·구매 절차 없이 바로 그 tier 로 draw() 한다(재진입 시 재과금하지 않기 위한
// 실제 프로덕션 경로 — 우리가 지어낸 우회가 아니다). purchases·analyzeFull·tierBuyable·
// basicSnap 은 report.js 모듈 스코프 클로저라 밖에서 안 보이므로, installTestHooks() 가 vm 에
// 태우는 소스 "사본"에만(디스크의 실 파일은 그대로) render() 진입부 바로 앞에 한 줄을 심어
// 꺼내 쓴다. analyzeFull() 은 report.js 실물 함수이므로 계산을 다시 구현하지 않는다 —
// analyzeFull() 이 낸 an 을 그대로 구매 레코드에 심을 뿐이다.
import { test, before } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const WWW = fileURLToPath(new URL("../www/", import.meta.url));
const INDEX = readFileSync(WWW + "index.html", "utf8");
const SRCS = [...INDEX.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

// ── 가짜 DOM — report-basic.test.mjs 의 FakeNode 를 그대로 가져오되, querySelector/
// querySelectorAll 을 스텁(null 고정)에서 실제 클래스 셀렉터 탐색으로 바꿨다. 브리프가 준
// 시험 원문이 `dom.querySelector(".rp-forecast")` 로 직접 찾기 때문이다. ──
function FakeNode(tag) {
  this.tagName = String(tag || "div").toUpperCase();
  this.className = "";
  this.children = [];
  this.parentNode = null;
  this._text = "";
  this._attrs = {};
  this.style = {};
  this.classList = { add() {}, remove() {}, contains() { return false; } };
}
Object.defineProperty(FakeNode.prototype, "textContent", {
  get() { return this.children.length ? this.children.map(c => c.textContent).join("") : this._text; },
  set(v) { this._text = (v == null) ? "" : String(v); this.children = []; }
});
Object.defineProperty(FakeNode.prototype, "innerHTML", {
  get() { return ""; },
  set(v) { if (v === "") { this.children.forEach(c => { c.parentNode = null; }); this.children = []; } }
});
FakeNode.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
FakeNode.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
FakeNode.prototype.getAttribute = function (k) { return this._attrs[k]; };
FakeNode.prototype.addEventListener = function () {};
FakeNode.prototype.removeEventListener = function () {};
FakeNode.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 320, height: 26 }; };
FakeNode.prototype._hasClass = function (cls) { return (" " + this.className + " ").indexOf(" " + cls + " ") >= 0; };
FakeNode.prototype._findAll = function (pred, out) {
  out = out || [];
  this.children.forEach(c => { if (pred(c)) out.push(c); c._findAll(pred, out); });
  return out;
};
// data-block(P1b Task 6) 은 클래스가 아니라 속성이다 — `[data-block="x"]` 꼴 셀렉터도 여기서
// 받아야 "선언한 블록을 전부 그렸는가"(브리프 Step 4)를 이 fake DOM 으로 잴 수 있다. 클래스
// 셀렉터 쪽 동작은 그대로 두고 속성 셀렉터만 갈라 처리한다 — 둘을 한 정규식으로 합치면
// 클래스 셀렉터의 기존 단순 구현(진짜 CSS 엔진이 아니다)이 더 읽기 어려워진다.
function matchPred(sel) {
  const attrM = String(sel).match(/^\[([\w-]+)=(['"])([^'"]*)\2\]$/);
  if (attrM) return (c) => c.getAttribute(attrM[1]) === attrM[3];
  const cls = String(sel).replace(/^\./, "");
  return (c) => c._hasClass(cls);
}
FakeNode.prototype.querySelector = function (sel) {
  return this._findAll(matchPred(sel))[0] || null;
};
FakeNode.prototype.querySelectorAll = function (sel) {
  return this._findAll(matchPred(sel));
};

function fakeCtx2d() {
  const state = {};
  return new Proxy({}, {
    get(t, prop) {
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient")
        return () => ({ addColorStop() {} });
      if (prop === "getImageData") return () => ({ data: [] });
      if (prop in state) return state[prop];
      return () => {};
    },
    set(t, prop, v) { state[prop] = v; return true; }
  });
}
function makeElement(tag) {
  const n = new FakeNode(tag);
  if (String(tag).toLowerCase() === "canvas") {
    n.getContext = function () { return fakeCtx2d(); };
    n.width = 0; n.height = 0;
  }
  return n;
}
function fakeWindow() {
  const body = makeElement("body");
  const docEl = makeElement("html");
  const doc = {
    createElement: makeElement, body: body, documentElement: docEl,
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, getElementById() { return null; }
  };
  const win = {
    document: doc, navigator: { userAgent: "node" }, location: { href: "https://localhost/" },
    matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a),
    setInterval() { return 0; }, clearInterval() {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    crypto: { getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = i; return a; } },
    fetch() { return Promise.resolve({ ok: false, json: () => Promise.resolve(null) }); },
    alert() {}, console, innerHeight: 800, innerWidth: 400
  };
  win.window = win; win.self = win; win.globalThis = win;
  return win;
}

// ── 합성 OHLCV — report-basic.test.mjs 와 같은 결정적 의사난수 생성기. base 를 받아 원화
// 대형주(7만원대)처럼 만들 수 있게 했다 — fmtPrice() 의 "1000 이상은 정수+천단위" 분기를
// 실제로 태우는 표본이 하나는 있어야 한다(원화 종목이 71096.26 으로 안 찍히는지 확인). ──
function pseudo(seed) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }
function makeCandles(n, drift, base) {
  const out = [];
  let price = base == null ? 100 : base;
  const t0 = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    price = Math.max(1, price + drift + (pseudo(i) - 0.5) * 1.4 * (base == null ? 1 : base / 100));
    const c = price, o = price - 0.3, h = price + 0.6, l = price - 0.6;
    const v = 1000000 + Math.round(pseudo(i + 999) * 400000);
    out.push({ t: t0 + i * 86400000, o, h, l, c, v });
  }
  return out;
}
function fakeData(drift, name, base) {
  const candles = makeCandles(240, drift, base);
  return { candle: candles, price: candles.map(c => c.c),
    asOf: String(candles[candles.length - 1].t), name, source: "synthetic" };
}

// report-basic.test.mjs 의 deepText 는 textContent(위 getter가 이미 자식까지 내려가 모은다)
// 그대로다 — 별도 이름을 주는 이유는 이 파일이 브리프 원문 시험을 그대로 담기 위해서다.
// 얕은 textContent 로 착각해 빈 wrapper 를 재는 실수(다른 프로젝트에서 실제로 있었던 함정,
// onboarding.test.mjs 의 deepText 주석 참고)를 막기 위해 여기서도 이름으로 의도를 밝힌다.
function deepText(node) { return node ? node.textContent : ""; }

// report.js 는 UMD 가 아니라 window.MSReport = { render } 만 연다 — purchases(구매 레코드)·
// analyzeFull(실 분석 함수)은 render() 의 형제 함수로 모듈 스코프 클로저에 갇혀 있다. 이
// 문자열 패치는 vm 에 태우는 "사본"에만 적용된다 — 디스크의 실 www/screens/report.js 는
// 건드리지 않는다(git status 로 항상 확인 가능). 앵커는 render() 정의 시작 한 줄, 그 위치가
// purchases·analyzeFull 둘 다 이미 정의된 뒤라 어느 쪽도 아직 초기화 전인 채로 참조하는
// 일이 없다.
//
// P1b Task 6 이 둘을 더했다: tierBuyable(잠금 해제를 실함수로 직접 잰다, 브리프 Step 4) ·
// basicSnap(compare 블록의 G1/G2 재료 — 8a 대조는 "직전 기본분석" 스냅샷이 같은 종목·같은
// 기준일로 이미 있어야만 그려진다. render() 의 "이미 산 것" 지름길은 startLoad()/finishData()
// 를 안 태우므로 basicSnap 이 절대 저절로 안 채워진다 — 시험이 그 자리를 직접 채워야
// compare 카드가 실제로 그려지는 경로를 밟는다).
function installTestHooks(src) {
  const anchor = "function render(root, params) {";
  const at = src.indexOf(anchor);
  assert.ok(at > 0, "render() 앵커를 못 찾았다 — report.js 구조가 바뀌었다");
  return src.slice(0, at) +
    "window.__TEST_HOOKS__ = { purchases: purchases, analyzeFull: analyzeFull, " +
    "tierBuyable: tierBuyable, basicSnap: basicSnap };\n  " +
    src.slice(at);
}

let CTX;
before(() => {
  const ctx = vm.createContext(fakeWindow());
  CTX = ctx;
  SRCS.forEach(src => {
    let code = readFileSync(WWW + src, "utf8");
    if (src === "screens/report.js") code = installTestHooks(code);
    new vm.Script(code, { filename: src }).runInContext(ctx);
  });
});

// 이미 산 것으로 만든다(report.js:1578 의 실제 프로덕션 분기가 그 상태를 그대로 읽어
// 로드·구매 절차 없이 즉시 draw() 한다) — data/an 은 analyzeFull() 실물 호출로 만든다(재구현
// 아님). runs 는 purchaseRun() 이 성공 시 남기는 것과 같은 모양({tf,out}) 이다.
//
// Task 5 가 이 헬퍼를 그대로 이어 쓴다: sym·drift·base 를 바꿔 다른 판정(bull/bear/neutral)·
// 다른 가격대(원화 대형주 등)로 같은 조립 경로를 다시 태울 수 있다.
//
// [Task 5 리뷰 지적 보강] 프로덕션 purchaseRun()(report.js:420-424)은 항상 세 주기
// ["1day","1week","1month"] 를 채우는데, 이 헬퍼는 그동안 1day 하나만 넣고 있었다 — 주기
// 교차를 보는 블록이 실제보다 얇은 표본("1/1 동의" 류)을 재게 되는 함정. 같은 합성 데이터를
// 재사용해 세 주기를 다시 분석한다 — analyzeFull() 은 tf 인자로 트렌드 프로필만 바꾸고
// 캔들을 재구성하지 않으므로(report.js:200 runOpts.timeframe) 계산을 다시 구현하는 게 아니다.
//
// opts.backtest — 지정하면(명시적 null 포함) 이 렌더 동안만 window.MSBacktest 를 그 값으로
// 바꾼다(tier-compare.test.mjs 의 "ctx.window.MSBacktest 직접 주입" 과 같은 기법). 이 파일의
// CTX 는 before() 에서 한 번만 만들어 모든 test 가 공유하므로, 되돌리지 않으면 뒤 테스트가
// 오염된다 — 그래서 항상 finally 로 원래 값을 복원한다.
// P1b Task 6 — renderFullReport() 의 조립 절반(구매 레코드 만들기)을 tier 인자로 뽑아
// renderCustomReport() 와 공유한다(아래). o.prevBasic 을 주면 basicSnap[sym] 도 같은
// 기준일로 채운다 — "compare" 블록(8a 대조)은 G1/G2 를 지켜 이 값이 없으면 안 그려지므로,
// 그 블록이 실제로 그려지는 경로를 잡으려면 이 시험 스스로 그 재료를 심어야 한다(프로덕션의
// "이미 산 것" 지름길은 finishData()/snapBasic() 을 안 태워 basicSnap 이 저절로 안 찬다).
function buildPurchase(tier, opts) {
  const o = opts || {};
  const sym = String(o.sym || "AAPL").toUpperCase();
  const drift = o.drift == null ? 0.3 : o.drift;   // report-basic 실측: +0.3 은 결정적으로 bull
  const data = fakeData(drift, o.name || "Apple", o.base);
  // custom 은 weights 가 truthy 여야 buildWeights() 가 그려진다(myWeights 없으면 조절판
  // 카드는 "가중치를 조절한 적 없다"가 아니라 애초에 안 그려진다 — report.js buildWeights()
  // 참고). 기본값은 지어낸 임의 숫자가 아니라 실 프리셋(MSIndTiers.weightsOf, 온보딩이 미리
  // 고르는 첫 프리셋 "추세 추종"과 같은 값)이다 — §3.7 "아무것도 안 만져도 실행 가능해야
  // 한다"와 같은 기본값 경로를 시험도 탄다.
  const weights = tier === "custom" ? (o.weights || CTX.MSIndTiers.weightsOf("trend", [])) : null;
  const an = CTX.__TEST_HOOKS__.analyzeFull(data, true, "1day", weights);
  const runs = ["1day", "1week", "1month"].map(tf => {
    const a = tf === "1day" ? an : CTX.__TEST_HOOKS__.analyzeFull(data, true, tf, weights);
    return { tf: tf, out: a.out };
  });
  CTX.__TEST_HOOKS__.purchases[sym + "|" + tier] = { data: data, an: an, runs: runs, weights: weights };
  if (o.prevBasic) {
    // asOfOf() 는 String(마지막 봉의 t) 다 — G2(같은 기준일)를 맞추려면 그 규약을 그대로 따른다.
    const asOf = String(data.candle[data.candle.length - 1].t);
    CTX.__TEST_HOOKS__.basicSnap[sym] = Object.assign({ asOf: asOf }, o.prevBasic);
  }
  return { sym: sym, data: data, an: an };
}

function renderWithBacktest(sym, opts) {
  const o = opts || {};
  const hasBT = Object.prototype.hasOwnProperty.call(o, "backtest");
  const prevBT = CTX.window.MSBacktest;
  if (hasBT) CTX.window.MSBacktest = o.backtest;
  const root = new FakeNode("div");
  try {
    CTX.MSReport.render(root, { sym: sym });
  } finally {
    if (hasBT) CTX.window.MSBacktest = prevBT;
  }
  return root;
}

function renderFullReport(opts) {
  const built = buildPurchase("full", opts);
  return renderWithBacktest(built.sym, opts);
}

// P1b Task 6 — custom(전문) 티어도 같은 "이미 산 것" 지름길로 그린다. renderFullReport() 를
// 이미 부르는 기존 시험은 그대로 두고(회귀 없음), 8블록 렌더 증명(브리프 Step 4)이 이 함수를 쓴다.
function renderCustomReport(opts) {
  const built = buildPurchase("custom", opts);
  return renderWithBacktest(built.sym, opts);
}

test("forecast — 내일 중심값·오차·확신이 모두 있고, 확신은 horizonRows 의 prob 다", () => {
  const dom = renderFullReport();          // 실제 조립(vm + 실제 모듈)
  const box = dom.querySelector(".rp-forecast");
  assert.ok(box, "forecast 블록이 없다");
  const txt = deepText(box);
  assert.ok(txt.trim().length > 0, "forecast 블록이 비어 있다");
  assert.match(txt, /±/, "오차 범위 표기가 없다");
  // prob 는 horizonRows() 가 낸 것과 정확히 같은 값이어야 한다(다시 계산하지 않는다) —
  // 드리프트 +0.3 은 bull 로 결정적이라 prob 은 반드시 있다(null 이면 시험이 성립하지 않는다).
  const rows = CTX.MSReportModel.horizonRows(CTX.ForgeCore,
    CTX.__TEST_HOOKS__.purchases["AAPL|full"].an.out.prediction,
    CTX.__TEST_HOOKS__.purchases["AAPL|full"].an.out.verdict.regime);
  assert.ok(rows[0] && rows[0].prob != null, "이 표본은 prob 이 없다 — 시험 전제가 깨졌다");
  const confVal = dom.querySelector(".rp-forecast-conf-val");
  assert.ok(confVal, "확신 값 칸이 없다");
  assert.strictEqual(deepText(confVal), rows[0].prob + "%",
    "확신 값이 horizonRows() 의 prob 과 다르다: " + deepText(confVal) + " vs " + rows[0].prob + "%");
});

test("forecast — 확신 퍼센트에 기준선이 병기되지 않는다(그 자리는 hitrate 블록이다)", () => {
  // 규율: 방향 적중률에는 기준선을 병기한다. 그러나 여기 prob 는 적중률이 아니라
  // 캘리브레이션된 모델 확신이다(report-model.js:66-70). 두 수를 같은 카드에 놓으면
  // 사용자가 "60% 맞힌다"로 읽는다 — 그래서 적중률은 Task 5 의 독립 블록이다.
  const dom = renderFullReport();
  const box = dom.querySelector(".rp-forecast");
  // 자명 통과 방지 — 부재만 재면 블록이 통째로 비어도(구현이 지워져도) 초록이 된다.
  // 존재·비어있지 않음을 먼저 확인한 뒤에야 "안에 무엇이 없는지"를 잰다.
  assert.ok(box, "forecast 블록이 없다");
  const txt = deepText(box);
  assert.ok(txt.trim().length > 0, "forecast 블록이 비어 있다 — 부재 시험이 공허하게 통과할 뻔했다");
  assert.doesNotMatch(txt, /60\.96|기준선/, "확신 카드에 기준선이 섞였다");
});

test("forecast — 판정이 중립(무방향)이면 확신 칸 자체가 없다 — 없는 방향에 확률을 안 붙인다", () => {
  // report-basic.test.mjs 실측: 드리프트 +0.02 는 neutral 로 결정적으로 떨어진다.
  const dom = renderFullReport({ sym: "TSLA", drift: 0.02, name: "Tesla" });
  const box = dom.querySelector(".rp-forecast");
  assert.ok(box, "중립 판정에서도 forecast 블록 자체는 있어야 한다(범위는 방향 무관하게 답한다)");
  assert.ok(deepText(box).trim().length > 0, "중립 판정에서 forecast 블록이 비어 있다");
  assert.strictEqual(dom.querySelector(".rp-forecast-conf"), null,
    "중립 판정인데 확신 칸이 떴다 — 없는 방향에 확률을 붙였다");
  assert.match(deepText(box), /±/, "중립 판정에서도 범위(±)는 여전히 있어야 한다");
});

test("forecast — 원화 대형주(1000 이상)는 가격이 소수점 없이 천단위 구분으로 찍힌다", () => {
  // MSUi.fmtPrice: 1000 이상이면 반올림 + toLocaleString(). 71096.26 처럼 소수점이 그대로
  // 남으면 report.js 의 다른 자리(예: rp-px)와 표기가 어긋난다.
  const dom = renderFullReport({ sym: "KRW1", drift: 30, name: "원화대형주", base: 71000 });
  const box = dom.querySelector(".rp-forecast");
  assert.ok(box, "forecast 블록이 없다");
  const px = dom.querySelector(".rp-forecast-px");
  assert.ok(px, "중심값 칸이 없다");
  const pxText = deepText(px);
  assert.doesNotMatch(pxText, /\.\d/, "가격에 소수점이 남았다(원화 종목 71096.26 함정): " + pxText);
  assert.match(pxText, /\d,\d{3}/, "천단위 구분자가 없다: " + pxText);
  // ±(오차 범위) 자체의 크기는 가격 스케일과 독립이라(콘 폭은 가격이 아니라 변동성이 정한다)
  // 1000 미만으로 나올 수 있다 — 그 경우 fmtPrice() 규칙대로 소수 2자리가 맞는 표기다
  // (report.js:572 선례와 동일 규칙). 그래서 "소수점 없음"을 강제하지 않고, fmtPrice() 가
  // 실제로 적용됐는지(규칙에서 벗어난 원값 그대로 새는 자릿수가 없는지)만 확인한다.
  const pm = dom.querySelector(".rp-forecast-pm");
  assert.ok(pm, "오차 범위 칸이 없다");
  assert.match(deepText(pm), /^\s*±\s*[\d,]+(\.\d{1,2})?$/, "오차 범위 표기가 fmtPrice 규칙과 다르다: " + deepText(pm));
});

// ── runs 3-요소 보강(Task 4 리뷰 지적) — 위 renderFullReport() 가 이제 프로덕션과 같은
// 모양([{tf:"1day"},{tf:"1week"},{tf:"1month"}])을 채우는지를 직접 확인한다. 이 자체를
// 못 박아 두지 않으면 다음 사람이 다시 1-tf 로 줄여도 아무 시험도 못 잡는다. ──────────────
test("runs — 헬퍼가 세 주기(1day·1week·1month)를 모두 채운다(프로덕션 purchaseRun() 과 같은 모양)", () => {
  renderFullReport();
  const runs = CTX.__TEST_HOOKS__.purchases["AAPL|full"].runs;
  assert.strictEqual(runs.length, 3, "runs 가 3-요소가 아니다: " + runs.length);
  assert.deepStrictEqual(runs.map(r => r.tf), ["1day", "1week", "1month"],
    "주기 순서가 프로덕션(report.js:420)과 다르다");
  runs.forEach(r => assert.ok(r.out && r.out.verdict, r.tf + " 주기의 out.verdict 가 없다"));
});

// ── hitrate(적중률) 블록 — 브리프 원문 시험(Task 5 Step 2)을 그대로 담는다. globalThis 대신
// CTX.window 를 읽는다 — 이 harness 의 실측 출처(window.MSBacktest)는 vm 컨텍스트 안에만
// 있고 Node 프로세스의 globalThis 에는 없다(브리프 예시는 harness 구조가 다른 원문이라
// 이 파일의 실제 접근 경로에 맞춰 옮겼다, 값·의도는 그대로). ──────────────────────────────
test("hitrate — 적중률 옆에 기준선이 반드시 병기된다", () => {
  const dom = renderFullReport();          // 기본 drift(+0.3) → bull 결정적
  const box = dom.querySelector(".rp-hitrate");
  assert.ok(box, "hitrate 블록이 없다");
  const txt = deepText(box);
  assert.ok(txt.trim().length > 0, "hitrate 블록이 비어 있다");
  // 규율: 방향 적중률을 단독으로 놓으면 사용자는 "동전보다 낫다"로 읽는다. 이 자산·이 기간의
  // 기준선은 50%가 아니라 60.96%이고 방향 판정은 그 아래다.
  const base = (CTX.window.MSBacktest.baselineAlwaysUp * 100).toFixed(1);
  assert.ok(txt.indexOf(base) >= 0, "기준선(" + base + "%)이 병기되지 않았다: " + txt);
});

test("hitrate — 범위 주석이 있다(이 종목의 성적이 아니라는 것)", () => {
  const dom = renderFullReport();
  const box = dom.querySelector(".rp-hitrate");
  assert.ok(box, "hitrate 블록이 없다");
  const txt = deepText(box);
  assert.ok(txt.trim().length > 0, "hitrate 블록이 비어 있다 — 부재 시험이 공허하게 통과할 뻔했다");
  assert.match(txt, /전체|엔진|시리즈/, "무엇에 대해 잰 수치인지 범위가 없다: " + txt);
});

test("hitrate — 범위 주석에 지표 수(graphIndicators)가 리터럴이 아니라 생성물 값으로 들어간다", () => {
  // [리뷰 Critical, 2026-08-19] "이 종목 얘기가 아니다"만으로는 부족했다 — 이 화면(심화 리포트)
  // 은 32개 도구로 분석했다는 배지를 이미 달고 있는데, 이 적중률은 그와 다른 도구 수
  // (MSBacktest.graphIndicators)로 잰 값이다. 그 개수가 실제로 화면에 박히는지, 리터럴이
  // 아니라 생성물에서 왔는지를 직접 잰다(truth-rules.test.mjs 의 소스 스캔과는 다른 각도 —
  // 이건 렌더된 텍스트 자체를 본다).
  const dom = renderFullReport();
  const txt = deepText(dom.querySelector(".rp-hitrate"));
  const gi = CTX.window.MSBacktest.graphIndicators;
  assert.strictEqual(typeof gi, "number", "이 표본에 graphIndicators 가 없다 — 시험 전제가 깨졌다");
  assert.ok(txt.indexOf(String(gi)) >= 0,
    "지표 수(" + gi + ")가 범위 문구에 없다 — 사용자는 이 리포트(32개)와 같은 표본으로 착각한다: " + txt);
  // 이 리포트(full 티어)는 32개 도구를 쓴다(rpTierCountFull) — graphIndicators(19)와 달라야
  // "다른 표본"이라는 사실 자체가 의미를 갖는다. 우연히 같아지면 이 시험은 통과해도 화면의
  // 경고는 무의미해진다 — 그래서 부등호도 함께 잠근다.
  assert.notStrictEqual(gi, 32, "이 표본에서는 graphIndicators 가 32(이 리포트의 지표 수)와 같다 — 구분 경고가 무의미해진다");
});

test("hitrate — graphIndicators 가 없는 생성물이면 블록을 감춘다(n·series 와 같은 필수 취급)", () => {
  const dom = renderFullReport({
    backtest: { bullHitRate: 0.617, bearHitRate: 0.425, baselineAlwaysUp: 0.6096, nForecasts: 31971, nSeries: 87 }
  });
  assert.strictEqual(dom.querySelector(".rp-hitrate"), null,
    "graphIndicators 없는 생성물인데 적중률 블록이 떴다 — 몇 개 도구로 쟀는지 못 밝히는 채로 나갔다");
});

test("hitrate — 값이 없으면 블록 자체를 감춘다(비교 없는 숫자는 안 낸다) — 생성물 부재", () => {
  const dom = renderFullReport({ backtest: null });   // 생성물 부재 상황(sync 전 등)
  assert.strictEqual(dom.querySelector(".rp-hitrate"), null,
    "백테스트 요약이 없는데 적중률 블록이 떴다");
});

test("hitrate — 판정이 중립(무방향)이면 블록을 감춘다 — 없는 방향의 적중률은 없다", () => {
  // report-basic.test.mjs 실측: 드리프트 +0.02 는 neutral 로 결정적으로 떨어진다.
  const dom = renderFullReport({ sym: "TSLA", drift: 0.02, name: "Tesla" });
  assert.strictEqual(dom.querySelector(".rp-hitrate"), null,
    "중립 판정인데 hitrate 블록이 떴다 — hitRate() 는 bull/bear 에만 값을 준다");
});

test("hitrate — 기준선 없는 생성물이면 감춘다(옛 생성물 시뮬레이션, R2 규율의 이 블록판)", () => {
  // baselineAlwaysUp 이 없는 생성물 — report-model.js hitRate() 가 baseline:null 을 돌려주고,
  // buildHitrate() 가 그 즉시 hit 을 통째로 접어야 한다("비교 없는 숫자는 안 낸다").
  const dom = renderFullReport({
    backtest: { bullHitRate: 0.617, bearHitRate: 0.425, nForecasts: 31971, nSeries: 87 }
  });
  assert.strictEqual(dom.querySelector(".rp-hitrate"), null,
    "베이스라인 없는 생성물인데 적중 행이 떴다");
});

test("hitrate — 표본이 20건 미만이면 블록을 감춘다(리터럴에 기대지 않고 코드가 직접 검사한다)", () => {
  const dom = renderFullReport({
    backtest: { bullHitRate: 0.617, bearHitRate: 0.425, baselineAlwaysUp: 0.6096, nForecasts: 19, nSeries: 87 }
  });
  assert.strictEqual(dom.querySelector(".rp-hitrate"), null,
    "nForecasts=19(<20)인데 적중률 블록이 떴다");
});

test("hitrate — 상승(bull) 판정은 bullHitRate 실측을 그대로 쓴다(전역 directionHitRate 아님)", () => {
  const dom = renderFullReport();          // drift +0.3 → bull 결정적
  const txt = deepText(dom.querySelector(".rp-hitrate"));
  const bt = CTX.window.MSBacktest;
  const rightBull = (bt.bullHitRate * 100).toFixed(1);
  assert.ok(txt.indexOf(rightBull) >= 0, "bull 적중률(" + rightBull + "%)이 화면에 없다: " + txt);
  // R2 규율(report-model.js:79-82) — 전역 directionHitRate(방향 무관 종합)를 쓰면 안 된다.
  // bull·bear 값이 그 값과 우연히 같지 않은 표본이라 이 시험이 성립한다(실측: 58.2% vs 61.7%).
  const directionAll = (bt.directionHitRate * 100).toFixed(1);
  assert.notStrictEqual(rightBull, directionAll,
    "이 표본에서는 bullHitRate 와 directionHitRate 가 같다 — 이 시험이 그 둘을 구분 못 한다");
});

test("hitrate — 하락(bear) 판정은 bearHitRate 실측을 그대로 쓴다(기준선은 방향 무관 동일)", () => {
  // report-basic.test.mjs 실측: 드리프트 -0.3 은 bear 로 결정적으로 떨어진다.
  const dom = renderFullReport({ sym: "MSFT", drift: -0.3, name: "Microsoft" });
  const txt = deepText(dom.querySelector(".rp-hitrate"));
  const bt = CTX.window.MSBacktest;
  const rightBear = (bt.bearHitRate * 100).toFixed(1);
  const base = (bt.baselineAlwaysUp * 100).toFixed(1);
  assert.ok(txt.indexOf(rightBear) >= 0, "bear 적중률(" + rightBear + "%)이 화면에 없다: " + txt);
  assert.ok(txt.indexOf(base) >= 0, "bear 판정에도 기준선(" + base + "%)이 병기되어야 한다: " + txt);
  // bearHitRate(42.5%)는 기준선(61.0%)보다 한참 아래다 — 하락 콜은 구조적으로 절반 아래에서
  // 맞는다(report-model.js:79-82 주석). 적중률이 기준선을 웃도는 조작이 섞이면 이 시험이 죈다.
  assert.ok(bt.bearHitRate < bt.baselineAlwaysUp, "이 표본은 bearHitRate<baseline 전제가 깨졌다");
});

// ── P1b Task 6 — 잠금 해제 실측(브리프 Step 4) ────────────────────────────────────────
// PENDING 이 비었으므로 tierBuyable() 이 실제로 두 티어 다 true 를 돌려주는지, "선언한 것을
// 다 그리는지"를 직접 잰다. 정적 분석(report-blocks.test.mjs)이 소스 텍스트로 같은 사실을
// 다른 각도에서 잠그는 것과 짝이다 — 여기는 실함수·실 DOM 이다.
test("잠금 해제 — 심화·전문 둘 다 tierBuyable() 이 true 다(실함수를 직접 부른다)", () => {
  assert.strictEqual(CTX.__TEST_HOOKS__.tierBuyable("full"), true, "심화가 여전히 잠겨 있다");
  assert.strictEqual(CTX.__TEST_HOOKS__.tierBuyable("custom"), true, "전문이 여전히 잠겨 있다");
});

test("선언한 블록을 전부 그린다 — 5스쿱 낸 사용자가 한 줄도 손해 보지 않는다(data-block 실측)", () => {
  // prevBasic 을 준다 — 안 주면 compare 는 G1 에 걸려 정당하게 null 이 되고, 그러면 이 시험이
  // "compare 가 원래 안 그려지는 것"과 "선언인데 못 그린 것"을 구분 못 한다.
  const domFull = renderFullReport({
    sym: "BLKF", name: "BlockFull", prevBasic: { lo: 150, hi: 154, width: 4 }
  });
  CTX.MSReportBlocks.forTier("full").forEach((b) => {
    assert.ok(domFull.querySelector("[data-block='" + b.id + "']"),
      "full 티어에서 " + b.id + " 블록이 안 그려졌다");
  });

  const domCustom = renderCustomReport({
    sym: "BLKC", name: "BlockCustom", prevBasic: { lo: 150, hi: 154, width: 4 }
  });
  CTX.MSReportBlocks.forTier("custom").forEach((b) => {
    assert.ok(domCustom.querySelector("[data-block='" + b.id + "']"),
      "custom 티어에서 " + b.id + " 블록이 안 그려졌다");
  });
});

// ── compare(8a 직전 상태 대조, 브리프 Step 1·2) ───────────────────────────────────────
test("compare — G1 재료가 있으면 뜨고, 폭이 넓어졌다는 사실을 숫자보다 먼저 말한다", () => {
  const dom = renderFullReport({
    sym: "CMPW", name: "CompareWide", prevBasic: { lo: 150, hi: 154, width: 4 }
  });
  const box = dom.querySelector(".rp-compare");
  assert.ok(box, "compare 블록이 없다 — G1 재료를 심었는데도 안 그려졌다");
  const txt = deepText(box);
  assert.ok(txt.trim().length > 0, "compare 블록이 비어 있다 — 부재 시험이 공허하게 통과할 뻔했다");
  // 실측(최종 리뷰어 독립 28창): 심화가 더 좁은 사례 0.0%, 폭 비율 중앙값 1.78배. 유료
  // 사용자는 돈을 낸 직후 더 "넓어진" 범위를 본다 — "좁아진다·절반"은 반대 사실이다.
  assert.doesNotMatch(txt, /좁아|절반/, "실측과 반대되는 문구가 있다: " + txt);
  assert.match(txt, /넓어졌습니다/, "폭이 넓어졌다는 사실을 먼저 말하지 않는다(설계서 §3.5): " + txt);
  assert.ok(box.querySelector(".rp-hz-prev"), "직전 기본분석 값 행이 없다");
});

test("compare — G1 재료(직전 기본분석 스냅샷)가 없으면 카드 자체가 없다(추정치로 채우지 않는다)", () => {
  const dom = renderFullReport({ sym: "CMPN", name: "CompareNone" });   // prevBasic 없음
  assert.strictEqual(dom.querySelector(".rp-compare"), null,
    "재료가 없는데 compare 블록이 떴다 — G1(직전 기본분석 값 없으면 행을 통째로 생략)을 어겼다");
});
