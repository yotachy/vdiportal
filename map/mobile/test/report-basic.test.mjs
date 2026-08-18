// 기본분석 리포트(시안 18a·6a, P1a Task 3) — **실제 조립**을 잰다. 소스 정규식이 아니라
// index.html 이 선언한 순서 그대로 전체 앱을 vm 에 태우고, MSApi.loadTicker 만 합성 데이터로
// 갈아끼운 뒤 MSReport.render()를 실제로 불러 나온 DOM 트리를 검사한다
// (test/shell-backbutton.test.mjs 가 shell.js 를 실물로 돌리는 것과 같은 태도 —
// 여기서는 report.js 혼자가 아니라 그 의존 전체를 boot-smoke.test.mjs 방식으로 태운다).
//
// 왜 이렇게까지 하는가 — report.js 는 report-blocks.js 의 선언(forTier)을 소스로 조립 순서를
// 정한다(draw() 의 BUILD 표). 선언과 그리는 함수가 실제로 맞물리는지, 그리고 그 결과가
// 화면에 몇 개의 블록으로 나오는지는 두 파일을 따로 읽어서는 확인할 수 없다 — 조립까지
// 실제로 돌려야 "관문은 초록인데 화면은 다른 말을 한다"는 이 프로젝트가 반복해서 겪은 사고를
// 피한다.
import { test, before } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const WWW = fileURLToPath(new URL("../www/", import.meta.url));
const INDEX = readFileSync(WWW + "index.html", "utf8");
const SRCS = [...INDEX.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

// ── 가짜 DOM — boot-smoke.test.mjs 의 fakeWindow() 를 확장한다. 그쪽은 "던지지 않고
// 로드되는가"만 재서 children/className/textContent 를 진짜로 안 쫓아도 됐다. 여기서는
// 조립 결과를 노드에서 읽어야 하므로 그 셋을 실제로 추적하는 최소 DOM 을 쓴다. ──
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
// innerHTML 은 report.js 에서 쓰기 전용이다("" 로 리셋하는 용도뿐) — 읽기는 구현하지 않는다.
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
FakeNode.prototype.querySelector = function () { return null; };
FakeNode.prototype.querySelectorAll = function () { return []; };

// 캔버스 2D 컨텍스트 — 실제로 그리지 않는다(픽셀은 이 시험의 관심사가 아니다). 어떤 메서드를
// 불러도 던지지만 않으면 된다. measureText/createLinearGradient 만 도형이 아니라 값을
// 기대하는 소비자가 있어(draw-preds.js·draw-panels.js) 모양을 맞춰 돌려준다.
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
    // 실제 타이머를 쓴다(boot-smoke 는 no-op 이었다) — report.js 의 loadTicker().then() 체인이
    // 이 시험에서 실제로 흘러야 하고, 흘렸는지는 뒤에서 real setTimeout 으로 확인한다.
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

// ── 합성 OHLCV — MIN_BARS["1day"]=220(api.js) 이상, 결정적 의사난수로 완만한 상승 추세를
// 만든다(Math.random 은 재현이 안 돼 실패가 간헐적이 된다). ──
function pseudo(seed) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }
function makeCandles(n) {
  const out = [];
  let price = 100;
  const t0 = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    price = Math.max(1, price + 0.12 + (pseudo(i) - 0.5) * 1.4);
    const c = price, o = price - 0.3, h = price + 0.6, l = price - 0.6;
    const v = 1000000 + Math.round(pseudo(i + 999) * 400000);
    out.push({ t: t0 + i * 86400000, o, h, l, c, v });
  }
  return out;
}
const CANDLES = makeCandles(240);
const FAKE_DATA = {
  candle: CANDLES, price: CANDLES.map(c => c.c),
  asOf: String(CANDLES[CANDLES.length - 1].t), name: "Apple", source: "synthetic"
};

// ── 트리 탐색 유틸 ──
function hasClass(el, cls) { return (el && el.className || "").split(/\s+/).indexOf(cls) >= 0; }
function findAll(node, pred, out) {
  out = out || [];
  (node.children || []).forEach(c => {
    if (pred(c)) out.push(c);
    findAll(c, pred, out);
  });
  return out;
}
function byClass(root, cls) { return findAll(root, n => hasClass(n, cls)); }
function firstByClass(root, cls) { return byClass(root, cls)[0] || null; }

// ── 앱 전체를 한 번만 부팅하고(비싸다), 여러 test() 가 같은 렌더 결과를 나눠서 검사한다. ──
let ROOT;
before(async () => {
  const ctx = vm.createContext(fakeWindow());
  SRCS.forEach(src => {
    const code = readFileSync(WWW + src, "utf8");
    new vm.Script(code, { filename: src }).runInContext(ctx);
  });
  // 네트워크·서버 프록시를 걷어내고 합성 데이터로 갈아끼운다 — report.js 는 MSApi 를 자유
  // 변수로 매 호출 시점에 조회하므로(loadOne), 스크립트 로드가 끝난 뒤 메서드만 바꿔치기해도
  // 실제 호출이 이 값을 본다.
  ctx.MSApi.loadTicker = function () { return Promise.resolve(FAKE_DATA); };

  const root = new FakeNode("div");
  ctx.MSReport.render(root, { sym: "AAPL" });

  // startLoad() → loadOne().then(finishData) → draw() 순으로 도는 프로미스 체인을 흘려보낸다.
  // 240봉 basicGraph 분석은 가벼워 실제로는 한 틱이면 끝나지만, 실제 타이머 한 바퀴로 여유를 둔다.
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
    if (byClass(root, "rp-comb-bar").length) break;   // ready 상태까지 도달했다
  }
  ROOT = root;
});

test("기본 티어 렌더 결과의 정보 블록이 정확히 3개다(verdict·comb·chart) — 다른 유료 블록은 없다", () => {
  assert.ok(ROOT, "렌더된 root 가 없다");
  assert.strictEqual(byClass(ROOT, "rp-verdict-wrap").length, 1, "판정 카드가 정확히 1개가 아니다");
  assert.strictEqual(byClass(ROOT, "rp-comb").length, 1, "지표 빗이 정확히 1개가 아니다");
  assert.strictEqual(byClass(ROOT, "rp-chart").length, 1, "차트가 정확히 1개가 아니다");
  // 유료 전용 블록(against/dissent·weights·readings 링크)은 basic 화면에 없어야 한다 —
  // 있으면 3개보다 많은 정보 블록을 공짜로 보여주는 것이다.
  assert.strictEqual(byClass(ROOT, "rp-against").length, 0, "반대 의견(유료) 블록이 basic 에 떴다");
  assert.strictEqual(byClass(ROOT, "rp-weights").length, 0, "조절판(전문 전용) 블록이 basic 에 떴다");
  assert.strictEqual(byClass(ROOT, "rp-rdlink").length, 0, "판독문 링크(유료)가 basic 에 떴다");
});

test("판정 문구에 퍼센트가 없다 — 도구 5개는 확률로 오독된다", () => {
  const wrap = firstByClass(ROOT, "rp-verdict-wrap");
  assert.ok(wrap, "판정 카드를 못 찾았다");
  const txt = wrap.textContent;
  assert.ok(!/%/.test(txt), "판정 카드에 % 문자가 있다: " + JSON.stringify(txt));
  // 부제가 "도구 N개 중 M개가 방향을 가리킴" 패턴이거나(방향이 있을 때) 무방향 문구여야 한다.
  const sub = firstByClass(ROOT, "rp-verdict-sub");
  assert.ok(sub, "부제 문구가 없다");
  assert.ok(/도구 \d+개 중 \d+개가 (상승|하락)을 가리킴/.test(sub.textContent) ||
            /뚜렷한 방향/.test(sub.textContent),
    "부제가 기대한 형태가 아니다: " + sub.textContent);
});

test("지표 빗이 32칸이고 스틸 5 / 연한 골드 27 로 갈리며, 잠금 문구는 차트 밖 한 줄이다", () => {
  const bar = firstByClass(ROOT, "rp-comb-bar");
  assert.ok(bar, "빗 막대 컨테이너가 없다");
  assert.strictEqual(bar.children.length, 32, "칸 수가 32 가 아니다: " + bar.children.length);
  const steel = bar.children.filter(c => hasClass(c, "is-steel"));
  const locked = bar.children.filter(c => hasClass(c, "is-locked"));
  assert.strictEqual(steel.length, 5, "스틸 칸이 5 가 아니다: " + steel.length);
  assert.strictEqual(locked.length, 27, "연한 골드(잠김) 칸이 27 이 아니다: " + locked.length);
  assert.strictEqual(steel.length + locked.length, bar.children.length, "칸 분류가 32 를 다 못 덮는다");

  const note = firstByClass(ROOT, "rp-comb-note");
  assert.ok(note, "잠금 안내 한 줄이 없다");
  assert.ok(/27/.test(note.textContent), "잠금 안내에 27 이 없다: " + note.textContent);
  // "차트 밖" — comb 의 자물쇠 문구가 차트 컨테이너 내부에 있으면 안 된다(막대 옆에 아이콘을
  // 박지 않고 한 줄로 뺀다는 설계 §3.2 의 요점).
  const chart = firstByClass(ROOT, "rp-chart");
  assert.ok(chart, "차트 컨테이너가 없다");
  assert.strictEqual(byClass(chart, "rp-comb-note").length, 0, "잠금 문구가 차트 안에 들어가 있다");
  // comb 블록 자체도 차트 블록의 자식이 아니어야 한다(형제 블록).
  assert.strictEqual(byClass(chart, "rp-comb").length, 0, "comb 블록이 차트 블록 안에 중첩돼 있다");
});

test("해제 블록에서 광고 버튼이 스쿱 버튼보다 DOM 순서상 먼저다", () => {
  const unlock = firstByClass(ROOT, "rp-unlock");
  assert.ok(unlock, "해제 블록이 없다");
  const kids = unlock.children;
  const adIdx = kids.findIndex(c => hasClass(c, "rp-cta-ad"));
  const scoopIdx = kids.findIndex(c => hasClass(c, "rp-cta-scoop"));
  assert.ok(adIdx >= 0, "광고 버튼을 못 찾았다");
  assert.ok(scoopIdx >= 0, "스쿱 버튼을 못 찾았다");
  assert.ok(adIdx < scoopIdx, "광고 버튼이 스쿱 버튼보다 뒤에 있다(순서: 광고 " + adIdx + ", 스쿱 " + scoopIdx + ")");
});

test("해제 CTA 가 실제로 존재한다 — 직전 라운드에 이 진입점이 통째로 사라진 사고가 있었다", () => {
  const unlock = firstByClass(ROOT, "rp-unlock");
  assert.ok(unlock, "해제 블록 자체가 없다");
  const buttons = byClass(unlock, "rp-cta");
  assert.ok(buttons.length >= 2, "해제 블록 안 버튼이 2개 미만이다(광고+스쿱) — " + buttons.length);
});

test("읽은 도구가 접힌 한 줄이다 — 32개 목록을 펼치지 않는다", () => {
  const rt = firstByClass(ROOT, "rp-readtools");
  assert.ok(rt, "읽은 도구 줄이 없다");
  assert.strictEqual(rt.children.length, 0, "읽은 도구 줄이 하위 목록을 갖고 있다(접힌 한 줄이 아니다)");
  assert.ok(/5개/.test(rt.textContent), "읽은 도구 수가 5개로 안 보인다: " + rt.textContent);
  // 32개짜리 판독문 리스트(유료 전용, readings-list.js 의 행 클래스)가 이 화면에 없어야 한다.
  assert.strictEqual(byClass(ROOT, "rp-reason-row").length, 0, "판독문 32행이 basic 화면에 펼쳐져 있다");
});
