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

// ── 합성 OHLCV — MIN_BARS["1day"]=220(api.js) 이상, 결정적 의사난수 + 드리프트로 방향을
// 강제한다(Math.random 은 재현이 안 돼 실패가 간헐적이 된다). 드리프트 크기는 실측으로 골랐다
// (node 로 basicGraph 를 직접 돌려 regime 을 확인 — 드리프트 0.12 는 둘 다 neutral 로 떨어져
// 색 규칙을 시험할 방향이 아예 없었다. 0.3 은 매번 bull/bear 로 갈렸다). ──
function pseudo(seed) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }
function makeCandles(n, drift) {
  const out = [];
  let price = 100;
  const t0 = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    price = Math.max(1, price + drift + (pseudo(i) - 0.5) * 1.4);
    const c = price, o = price - 0.3, h = price + 0.6, l = price - 0.6;
    const v = 1000000 + Math.round(pseudo(i + 999) * 400000);
    out.push({ t: t0 + i * 86400000, o, h, l, c, v });
  }
  return out;
}
function fakeData(drift, name) {
  const candles = makeCandles(240, drift);
  return { candle: candles, price: candles.map(c => c.c),
    asOf: String(candles[candles.length - 1].t), name, source: "synthetic" };
}
// 두 종목 — 하나는 판정이 bull, 하나는 bear 로 떨어지게(실측 확인) 만든다. 지표 빗의
// "동의=스틸·반대=자기 방향색" 규칙이 판정 방향에 매여 있는지(뒤집힌 입력에서도 규칙이
// 따라 뒤집히는지)는 한 방향만 봐서는 증명이 안 된다.
const DATA_BY_SYM = {
  AAPL: fakeData(0.3, "Apple"), MSFT: fakeData(-0.3, "Microsoft"),
  // 판정 자체가 neutral 인데 개별 지표는 방향을 가진 경우(실측: tone [bull,muted,muted,muted,bull])
  // — combRole() 이 "판정이 중립이면 동의도 반대도 성립하지 않는다"로 nodir 를 매기는지,
  // 그리고 그 칸이 위치(is-on)는 그대로 보이면서 role 만 agree/dissent 가 아닌지를 잰다.
  // 이 경로가 바로 리뷰가 잡은 버그의 재발 지점이었다(실 라이브 데이터가 종종 neutral 로
  // 떨어지는데, 그 경우 "on 인데 역할이 없다"로 관문이 죽었었다).
  TSLA: fakeData(0.02, "Tesla")
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
async function renderReady(ctx, sym) {
  const root = new FakeNode("div");
  ctx.MSReport.render(root, { sym });
  // startLoad() → loadOne().then(finishData) → draw() 순으로 도는 프로미스 체인을 흘려보낸다.
  // 240봉 basicGraph 분석은 가벼워 실제로는 한 틱이면 끝나지만, 실제 타이머 한 바퀴로 여유를 둔다.
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
    if (byClass(root, "rp-comb-bar").length) break;   // ready 상태까지 도달했다
  }
  return root;
}

let ROOT, ROOT_BEAR, ROOT_NEUTRAL;
before(async () => {
  const ctx = vm.createContext(fakeWindow());
  SRCS.forEach(src => {
    const code = readFileSync(WWW + src, "utf8");
    new vm.Script(code, { filename: src }).runInContext(ctx);
  });
  // 네트워크·서버 프록시를 걷어내고 합성 데이터로 갈아끼운다 — report.js 는 MSApi 를 자유
  // 변수로 매 호출 시점에 조회하므로(loadOne), 스크립트 로드가 끝난 뒤 메서드만 바꿔치기해도
  // 실제 호출이 이 값을 본다. 종목별로 다른 방향(DATA_BY_SYM)을 돌려준다.
  ctx.MSApi.loadTicker = function (sym) { return Promise.resolve(DATA_BY_SYM[sym]); };

  ROOT = await renderReady(ctx, "AAPL");        // 드리프트 +0.3 — bull 로 떨어진다(실측)
  ROOT_BEAR = await renderReady(ctx, "MSFT");    // 드리프트 -0.3 — bear 로 떨어진다(실측)
  ROOT_NEUTRAL = await renderReady(ctx, "TSLA"); // 드리프트 +0.02 — neutral 로 떨어진다(실측)
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

// ── 지표 빗 색 규칙(리뷰 2026-08-18) — 위치는 방향(위=상승·아래=하락), 색은 **반대**를
// 말한다: 판정에 동의하는 칸은 --steel(무채색), 반대하는 칸만 그 칸 자신의 방향색.
// spec-18a.png 픽셀 샘플링 실측(5칸 중 4칸이 정확히 --steel, 반대 1칸만 방향색)이 근거다.
// 다수를 방향색으로 채우면 사용자가 초록/빨강 개수를 세어 판정에서 걷어낸 바로 그 퍼센트
// 오독을 색으로 재현하게 된다 — 그래서 "존재"가 아니라 "어느 칸이 어느 역할인지"를 잰다.
function roleOf(span) {
  if (!span) return "?";
  if (hasClass(span, "rp-comb-agree")) return "agree";
  if (hasClass(span, "rp-comb-dissent")) return "dissent";
  if (hasClass(span, "rp-comb-nodir")) return "nodir";
  return "?";
}
function combRoles(root) {
  const bar = firstByClass(root, "rp-comb-bar");
  const steel = bar.children.filter(c => hasClass(c, "is-steel"));
  return steel.map(cell => {
    const up = cell.children.filter(c => hasClass(c, "rp-comb-up"))[0];
    const down = cell.children.filter(c => hasClass(c, "rp-comb-down"))[0];
    if (up && hasClass(up, "is-on")) return { tone: "bull", role: roleOf(up) };
    if (down && hasClass(down, "is-on")) return { tone: "bear", role: roleOf(down) };
    return { tone: "muted", role: (hasClass(up, "is-faint") && hasClass(down, "is-faint")) ? "nodir" : "?" };
  });
}

test("지표 빗 — 판정(bull)에 동의하는 칸은 스틸, 반대하는 칸만 자기 방향색이다", () => {
  const roles = combRoles(ROOT);
  assert.strictEqual(roles.length, 5, "스틸 칸이 5개가 아니다");
  // 합성 데이터(드리프트 +0.3) 실측: tone = [bull, muted, bear, bull, bear] → bull 판정.
  const agree = roles.filter(r => r.role === "agree");
  const dissent = roles.filter(r => r.role === "dissent");
  const nodir = roles.filter(r => r.role === "nodir");
  assert.strictEqual(agree.length + dissent.length + nodir.length, 5, "역할을 못 매긴 칸이 있다(? 로 남음): " + JSON.stringify(roles));
  assert.ok(agree.length > 0 && dissent.length > 0, "동의·반대가 둘 다 있어야 규칙을 실제로 시험한다: " + JSON.stringify(roles));
  // 동의 칸은 전부 bull 톤(판정과 같은 방향)이어야 하고, 반대 칸은 전부 bear 톤이어야 한다.
  assert.ok(agree.every(r => r.tone === "bull"), "bull 판정인데 동의 칸에 bear 톤이 섞여 있다: " + JSON.stringify(roles));
  assert.ok(dissent.every(r => r.tone === "bear"), "bull 판정인데 반대 칸에 bull 톤이 섞여 있다(자기 방향색 규칙 위반): " + JSON.stringify(roles));
});

test("지표 빗 — 판정 방향이 뒤집히면(bear) 동의·반대 매핑도 따라 뒤집힌다", () => {
  const roles = combRoles(ROOT_BEAR);
  assert.strictEqual(roles.length, 5, "스틸 칸이 5개가 아니다");
  // 합성 데이터(드리프트 -0.3) 실측: tone = [bear, bear, bull, bear, bull] → bear 판정.
  const agree = roles.filter(r => r.role === "agree");
  const dissent = roles.filter(r => r.role === "dissent");
  assert.ok(agree.length > 0 && dissent.length > 0, "동의·반대가 둘 다 있어야 규칙을 실제로 시험한다: " + JSON.stringify(roles));
  // bear 판정에서는 동의가 bear 톤, 반대가 bull 톤이다 — bull 시나리오와 정확히 반대.
  assert.ok(agree.every(r => r.tone === "bear"), "bear 판정인데 동의 칸에 bull 톤이 섞여 있다: " + JSON.stringify(roles));
  assert.ok(dissent.every(r => r.tone === "bull"), "bear 판정인데 반대 칸에 bear 톤이 섞여 있다(자기 방향색 규칙 위반): " + JSON.stringify(roles));
});

test("지표 빗 — 다수(동의)를 색으로 채우지 않는다(오독 재현 방지)", () => {
  // 두 방향 다: role==='agree' 인 칸(다수인 경우가 흔하다)이 스틸 클래스(rp-comb-agree)를
  // 쓰지 dissent 클래스는 안 쓴다는 걸 앞의 두 시험이 이미 확인했다 — 여기서는 CSS 토큰
  // 자체가 방향색(rp-comb-dissent)과 스틸(rp-comb-agree)로 분리돼 있어 같은 span 이 둘 다
  // 가질 수 없음을 마크업 구조로도 확인한다(동시에 두 role 클래스가 붙으면 스타일이
  // 경합한다 — 실제로 그런 케이스가 없는지 본다).
  [ROOT, ROOT_BEAR].forEach(root => {
    const bar = firstByClass(root, "rp-comb-bar");
    bar.children.filter(c => hasClass(c, "is-steel")).forEach(cell => {
      cell.children.forEach(span => {
        const roleClasses = ["rp-comb-agree", "rp-comb-dissent", "is-faint"].filter(c => hasClass(span, c));
        assert.ok(roleClasses.length <= 1, "한 칸에 역할 클래스가 둘 이상 붙었다: " + span.className);
      });
    });
  });
});

test("지표 빗 — 판정 자체가 중립이면 개별 지표가 방향을 가져도 동의·반대로 세지 않는다(nodir)", () => {
  const roles = combRoles(ROOT_NEUTRAL);
  assert.strictEqual(roles.length, 5, "스틸 칸이 5개가 아니다");
  // 합성 데이터(드리프트 +0.02) 실측: tone = [bull, muted, muted, muted, bull] → neutral 판정.
  // 위치(is-on)는 그대로 켜지지만(bull 톤 2칸) role 은 반드시 nodir 여야 한다 — agree/dissent
  // 는 비교할 판정 방향이 있을 때만 성립한다.
  const onCells = roles.filter(r => r.tone !== "muted");
  assert.ok(onCells.length > 0, "이 시나리오는 방향이 있는(is-on) 칸이 최소 하나 있어야 시험이 성립한다: " + JSON.stringify(roles));
  assert.ok(onCells.every(r => r.role === "nodir"),
    "중립 판정인데 agree/dissent 로 채색된 칸이 있다(비교 대상 없는 동의·반대): " + JSON.stringify(roles));
});
