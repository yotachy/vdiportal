// 단계 선택 시트(시안 6b) — MSSheet 의 첫 프로덕션 소비자(P1a Task 5).
//
// 이 시험이 재는 가장 중요한 것은 "MSSheet 를 실제로 쓰는가"다. 소스 정규식(/MSSheet\.open/)은
// 이름만 있으면 통과한다 — 이 저장소는 그 함정을 이미 여러 번 겪었다(shell-backbutton.test.mjs
// 머리말 참고). 그래서 여기서는 sheet.js 를 실제로 require 해 tier-sheet.js 와 함께 돌리고,
// document 에 실제로 무엇이 붙는지를 본다: `.sheet-scrim`/`.sheet`(옛 자체 백드롭)가 전혀
// 없고 `.ms-sheet-backdrop`/`.ms-sheet-body`(MSSheet 의 것)만 있어야 통과다.
//
// 패턴은 ticker-picker.test.mjs·sheet.test.mjs·shell-backbutton.test.mjs 와 같다 — 이
// 저장소엔 jsdom 이 없어(package.json) 최소 DOM 을 손으로 흉내낸다.
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

function FakeNode(tag) {
  this.tagName = String(tag || "").toUpperCase();
  this.className = "";
  this.children = [];
  this.parentNode = null;
  this._attrs = {};
  this._listeners = {};
  this._text = "";
  this._html = "";
  this.disabled = false;
}
FakeNode.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
FakeNode.prototype.removeChild = function (c) {
  var i = this.children.indexOf(c);
  if (i >= 0) this.children.splice(i, 1);
  c.parentNode = null;
  return c;
};
FakeNode.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
FakeNode.prototype.getAttribute = function (k) {
  return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
};
FakeNode.prototype.addEventListener = function (type, fn) {
  (this._listeners[type] = this._listeners[type] || []).push(fn);
};
FakeNode.prototype.dispatch = function (type, evt) {
  (this._listeners[type] || []).slice().forEach(function (fn) { fn(evt || {}); });
};
Object.defineProperty(FakeNode.prototype, "textContent", {
  get: function () { return this._text; },
  set: function (v) { this._text = String(v); this.children = []; }
});
Object.defineProperty(FakeNode.prototype, "innerHTML", {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v); this.children = []; }
});

function makeDoc() {
  var body = new FakeNode("body");
  body.classList = {
    _set: new Set(),
    add: function (c) { this._set.add(c); },
    remove: function (c) { this._set.delete(c); },
    contains: function (c) { return this._set.has(c); }
  };
  return { createElement: function (tag) { return new FakeNode(tag); }, body: body };
}

// 트리를 훑어 className 토큰으로 찾는다(재귀) — DOM 구조를 몰라도 되게.
function findAll(node, pred, out) {
  out = out || [];
  if (pred(node)) out.push(node);
  (node.children || []).forEach(function (c) { findAll(c, pred, out); });
  return out;
}
function hasClass(node, cls) {
  return String(node.className || "").split(/\s+/).indexOf(cls) >= 0;
}
function byClass(node, cls) { return findAll(node, function (n) { return hasClass(n, cls); }); }

function load() {
  var doc = makeDoc();
  global.document = doc;
  global.MSUi = require("../www/ui.js");
  global.MSStr = require("../www/strings.js");
  global.MSWallet = require("../www/wallet.js");
  delete require.cache[require.resolve("../www/sheet.js")];
  global.MSSheet = require("../www/sheet.js");   // 진짜 MSSheet — 스텁이 아니다
  // [리뷰 C1] 둘 다 잠긴 시트의 "워치리스트로 돌아가기" 버튼이 실제로 MSApp.go 를 부르는지
  // 재려면 이 전역이 있어야 한다 — report.js 가 어디서나 쓰는 것과 같은 계약(route, params).
  var goCalls = [];
  global.MSApp = { go: function (route, params) { goCalls.push({ route: route, params: params }); } };
  delete require.cache[require.resolve("../www/tier-sheet.js")];
  var MSTierSheet = require("../www/tier-sheet.js");
  return { MSTierSheet: MSTierSheet, doc: doc, goCalls: goCalls };
}

// ── ① MSSheet 를 쓴다 — 자체 백드롭·자체 스크림을 만들지 않는다 ──────────────────
test("MSTierSheet.open() 이 MSSheet 를 실제로 호출한다 — .sheet-scrim/.sheet 가 아니라 .ms-sheet-* 가 붙는다", () => {
  const { MSTierSheet, doc } = load();
  MSTierSheet.open({ sym: "AAPL", balance: 12, cap: 20, locked: { full: false, custom: true }, onRun: () => {} });

  assert.strictEqual(doc.body.children.length, 1, "document.body 에 뭔가 하나 붙어야 한다(MSSheet 의 backdrop)");
  const backdrop = doc.body.children[0];
  assert.ok(hasClass(backdrop, "ms-sheet-backdrop"), "MSSheet 가 만드는 backdrop 이 아니다 — 자체 시트를 그렸다");
  assert.strictEqual(byClass(backdrop, "sheet-scrim").length, 0, "옛 자체 스크림(.sheet-scrim)이 남아 있다");
  // .sheet 자체는 옛 컴포넌트의 최상위 카드 이름이자 지금도 tier-tier 클래스 접두어와 겹칠 수
  // 있으니(.sheet-tier 등은 정당하다) 정확히 "sheet" 토큰만 찾는다.
  assert.strictEqual(byClass(backdrop, "sheet").length, 0, "옛 자체 카드(.sheet)가 남아 있다");
  assert.strictEqual(byClass(backdrop, "ms-sheet-body").length, 1, "MSSheet 의 body 컨테이너가 없다");

  MSTierSheet.close();
});

// ── ② 제목 ────────────────────────────────────────────────────────────────
test("제목이 '얼마나 정밀하게?'다(strings 키 경유, 리터럴 아님)", () => {
  const { MSTierSheet, doc } = load();
  const MSStr = global.MSStr;
  MSTierSheet.open({ sym: "AAPL", balance: 12, locked: { full: false, custom: true }, onRun: () => {} });

  const titles = byClass(doc.body, "ms-sheet-title");
  assert.strictEqual(titles.length, 1, "MSSheet 제목 요소가 없다");
  assert.strictEqual(titles[0].textContent, MSStr.t.tsTitle);
  assert.strictEqual(MSStr.t.tsTitle, "얼마나 정밀하게?", "strings.js 값 자체가 시안과 다르다");
  MSTierSheet.close();
});

// ── ③ 기본분석 = 받음(비활성) ────────────────────────────────────────────────
test("기본분석 행은 '받음' 배지를 달고, 고를 수 있는 onPick 이 없다", () => {
  const { MSTierSheet, doc } = load();
  const MSStr = global.MSStr;
  MSTierSheet.open({ sym: "AAPL", balance: 12, locked: { full: false, custom: true }, onRun: () => {} });

  const basicRow = byClass(doc.body, "tier-basic")[0];
  assert.ok(basicRow, "기본분석 행이 없다");
  const done = byClass(basicRow, "sheet-tier-done")[0];
  assert.ok(done, "'받음' 배지가 없다");
  assert.strictEqual(done.textContent, MSStr.t.tsDone);
  assert.strictEqual(byClass(basicRow, "sheet-tier-price").length, 0, "기본분석에 값이 붙으면 안 된다 — 이미 받았다");
  // 클릭해도 아무 것도 안 바뀐다는 것을 관측으로 — onPick 이 안 달렸으므로 dispatch 는 무해해야 한다.
  basicRow.dispatch("click");
  MSTierSheet.close();
});

// ── ④ 비용 미리보기는 살 수 있을 때만 ────────────────────────────────────────
test("잔량이 충분하면 '쓰면 N → M' 미리보기가 뜬다", () => {
  const { MSTierSheet, doc } = load();
  const MSWallet = global.MSWallet;
  MSTierSheet.open({ sym: "AAPL", balance: 12, cap: 20, locked: { full: false, custom: true }, onRun: () => {} });

  const pv = byClass(doc.body, "sheet-cost-pv")[0];
  assert.ok(pv, "살 수 있는데 비용 미리보기가 없다");
  assert.strictEqual(pv.textContent, 12 + " → " + (12 - MSWallet.COSTS.full));
  MSTierSheet.close();
});

test("잔량이 부족하면 비용 미리보기(N → M)를 아예 그리지 않는다 — 못 살 값을 보여주지 않는다", () => {
  const { MSTierSheet, doc } = load();
  const MSWallet = global.MSWallet;
  MSTierSheet.open({ sym: "AAPL", balance: MSWallet.COSTS.full - 1, locked: { full: false, custom: true }, onRun: () => {} });

  assert.strictEqual(byClass(doc.body, "sheet-cost-pv").length, 0, "살 수 없는데 미리보기가 그려졌다");
  MSTierSheet.close();
});

test("잔량을 모르면(balance 없음) 비용 미리보기를 그리지 않고 Run 을 막는다", () => {
  const { MSTierSheet, doc } = load();
  MSTierSheet.open({ sym: "AAPL", locked: { full: false, custom: true }, onRun: () => {} });

  assert.strictEqual(byClass(doc.body, "sheet-cost-pv").length, 0);
  const run = byClass(doc.body, "sheet-run")[0];
  assert.ok(run, "실행 버튼이 없다");
  assert.strictEqual(run.disabled, true, "잔량 불명인데 실행 버튼이 활성이다");
  MSTierSheet.close();
});

// ── ⑤ 배지는 심화(full) 행에만 ──────────────────────────────────────────────
test("추천 배지(tsPopular)는 심화분석 행에만 붙는다 — 리뷰 I1: 문구는 사용 빈도 주장에서 편집적 추천으로 바뀌었다", () => {
  const { MSTierSheet, doc } = load();
  const MSStr = global.MSStr;
  MSTierSheet.open({ sym: "AAPL", balance: 12, locked: { full: false, custom: false }, onRun: () => {} });

  const full = byClass(doc.body, "tier-full")[0];
  const custom = byClass(doc.body, "tier-custom")[0];
  const basic = byClass(doc.body, "tier-basic")[0];
  assert.strictEqual(byClass(full, "sheet-pop").length, 1, "심화분석에 배지가 없다");
  assert.strictEqual(byClass(full, "sheet-pop")[0].textContent, MSStr.t.tsPopular);
  assert.strictEqual(byClass(custom, "sheet-pop").length, 0, "전문분석에 배지가 붙었다");
  assert.strictEqual(byClass(basic, "sheet-pop").length, 0, "기본분석에 배지가 붙었다");
  MSTierSheet.close();
});

// ── 추가: 잠금 상태가 정직하다(가격이 안 남고, run 이 잠긴 티어를 고를 수 없다) ──────
test("두 유료 티어가 모두 잠기면 값·배지 없이 '곧 지원 예정'만 뜨고 Run 이 막힌다", () => {
  const { MSTierSheet, doc } = load();
  const MSStr = global.MSStr;
  MSTierSheet.open({ sym: "AAPL", balance: 12, locked: { full: true, custom: true }, onRun: () => {} });

  const full = byClass(doc.body, "tier-full")[0];
  const custom = byClass(doc.body, "tier-custom")[0];
  assert.ok(hasClass(full, "is-locked") && hasClass(custom, "is-locked"));
  assert.strictEqual(byClass(full, "sheet-tier-price").length, 0, "잠긴 티어에 값이 남았다");
  assert.strictEqual(byClass(custom, "sheet-tier-price").length, 0, "잠긴 티어에 값이 남았다");
  assert.strictEqual(full.disabled, true);
  assert.strictEqual(custom.disabled, true);
  const run = byClass(doc.body, "sheet-run")[0];
  assert.strictEqual(run.disabled, true, "고를 게 없는데 실행 버튼이 활성이다");
  assert.strictEqual(byClass(doc.body, "sheet-short")[0].textContent, MSStr.t.tsSoon);
  MSTierSheet.close();
});

// [리뷰 C1] 막다른 골목 금지 — 둘 다 잠기면 백드롭 닫기 말고 할 행동이 있어야 한다.
test("두 유료 티어가 모두 잠기면 '워치리스트로 돌아가기' 버튼이 뜨고, 누르면 시트를 닫고 이동한다", () => {
  const { MSTierSheet, doc, goCalls } = load();
  const MSStr = global.MSStr;
  MSTierSheet.open({ sym: "AAPL", balance: 12, locked: { full: true, custom: true }, onRun: () => {} });

  const back = byClass(doc.body, "sheet-back-list")[0];
  assert.ok(back, "다음 행동 버튼이 없다 — 백드롭 닫기뿐이면 막다른 골목이다");
  assert.strictEqual(back.textContent, MSStr.t.tsBackToList);

  back.dispatch("click");
  assert.strictEqual(doc.body.children.length, 0, "버튼을 눌러도 시트가 안 닫혔다");
  assert.deepEqual(goCalls, [{ route: "watchlist", params: undefined }],
    "MSApp.go('watchlist') 를 부르지 않는다");
});

// 잠기지 않았을 때는(고를 게 있을 때) 이 탈출 버튼이 필요 없다 — 있으면 Run 옆에 불필요한
// 자리를 차지한다(picked!==null 분기는 정상 구매 흐름이라 이미 Run 이 다음 행동이다).
test("적어도 하나가 잠기지 않으면 '워치리스트로 돌아가기' 버튼을 그리지 않는다", () => {
  const { MSTierSheet, doc } = load();
  MSTierSheet.open({ sym: "AAPL", balance: 12, locked: { full: false, custom: true }, onRun: () => {} });
  assert.strictEqual(byClass(doc.body, "sheet-back-list").length, 0);
  MSTierSheet.close();
});

// ── 추가: Run 클릭이 실제로 onRun(picked) 을 부른다(선택 변경 포함) ───────────────
test("전문분석을 고르고 Run 을 누르면 onRun('custom') 이 불린다 — picked 를 안 버린다", () => {
  const { MSTierSheet, doc } = load();
  var got = null;
  MSTierSheet.open({
    sym: "AAPL", balance: 12, locked: { full: false, custom: false },
    onRun: function (picked) { got = picked; }
  });

  const custom = byClass(doc.body, "tier-custom")[0];
  custom.dispatch("click");   // full → custom 으로 선택 변경(paint 재실행)

  const run = byClass(doc.body, "sheet-run")[0];
  run.dispatch("click");
  assert.strictEqual(got, "custom", "custom 을 고르고 실행했는데 onRun 이 다른 값을 받았다");
  MSTierSheet.close();
});

// ── 추가: close() 는 열려 있지 않아도 안전하다(report.js 가 여러 경로에서 무조건 부른다) ──
test("열려 있지 않을 때 close() 를 불러도 던지지 않는다", () => {
  const { MSTierSheet } = load();
  assert.doesNotThrow(() => MSTierSheet.close());
});

// ── 추가: 재오픈 시 스택에 두 장이 쌓이지 않는다(같은 시트를 다시 여는 것은 교체다) ──
test("연달아 open() 해도 시트가 하나만 남는다", () => {
  const { MSTierSheet, doc } = load();
  MSTierSheet.open({ sym: "AAPL", balance: 12, locked: { full: false, custom: true }, onRun: () => {} });
  MSTierSheet.open({ sym: "TSLA", balance: 12, locked: { full: false, custom: true }, onRun: () => {} });
  assert.strictEqual(doc.body.children.length, 1, "재오픈이 스택에 쌓였다");
  MSTierSheet.close();
});
