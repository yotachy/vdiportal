// End-to-end 실증(P1a Task 7) — 실제 MSTierSheet(+MSSheet 스택) 를 열어놓고, shell.js 가
// 실제로 등록한 backbutton 리스너를 발화시켜 ①시트가 닫히는지 ②라우터가 화면을 안 바꾸는지,
// 그리고 시트가 없을 때는 같은 리스너로 라우터가 실제로 움직이는지를 잰다.
//
// 왜 필요한가(Task 5 리뷰가 지적한 공백): shell-backbutton.test.mjs 는 MSSheet 를 통째로
// `{ closeTop() {...} }` 스텁으로 갈아 끼운다 — 그래서 프로덕션에 실재하는 MSTierSheet+MSSheet
// 스택과 한 번도 안 만난다. tier-sheet.test.mjs 는 MSSheet 가 진짜지만 뒤로가기(shell.js)를
// 전혀 안 부른다. 이 둘을 잇는 시험이 없었다 — 스텁이 "시트가 있다고 치면" 옳게 동작해도,
// 실제 시트 DOM(.ms-sheet-backdrop)이 shell.js 의 핸들러가 부르는 MSSheet.closeTop() 으로
// 정말 지워지는지는 아무도 실행해서 본 적이 없었다. 여기서는 shell.js·sheet.js·tier-sheet.js·
// router.js 를 전부 실제로 require 해 그 이음매를 실제로 잰다(스텁 0개).
//
// 등록 API 자체(App.addListener vs document.addEventListener)는 shell-backbutton.test.mjs
// 소관이다 — 여기서는 document 경로로 잡은 핸들러를 쓴다(두 경로 모두 handleBack() 하나로
// 모인다는 것은 그 파일이 이미 증명했다).
//
// 변이 증명(수행 기록, 이 주석에 남긴다) — shell.js 의 `if (MSSheet.closeTop()) return;` 줄을
// 잠깐 지우고 이 파일만 돌리면 첫 시험("시트가 열려 있으면...")이 빨간불이 된다: closeTop() 이
// 안 불려 시트가 그대로 남고, router.back() 이 곧장 불려 report 스택이 pop 되며
// router.current().id 가 "report" 대신 "watchlist" 로 바뀐다 — 두 단언 모두 깨진다. 확인 후
// 원복했다(작업본에는 원본 로직이 남아 있다).
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// ── 최소 DOM (tier-sheet.test.mjs·sheet.test.mjs 와 같은 패턴 — 이 저장소엔 jsdom 이 없다) ──
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

function FakeClassList() {
  var set = new Set();
  this.add = function (c) { set.add(c); };
  this.remove = function (c) { set.delete(c); };
  this.contains = function (c) { return set.has(c); };
}

function makeDoc() {
  var listeners = {};
  var doc = {
    createElement: function (tag) { var n = new FakeNode(tag); n.classList = new FakeClassList(); return n; },
    _listeners: listeners,
    addEventListener: function (type, fn) { listeners[type] = fn; }   // shell.js 는 backbutton 딱 한 번 건다
  };
  doc.body = doc.createElement("body");
  return doc;
}

// #app 자리 — shell.js 의 mount(rootEl, screens) 가 기대하는 모양(classList·parentNode).
function makeRootEl(doc) {
  var el = doc.createElement("div");
  el.parentNode = doc.createElement("div");   // #app 의 형제 wrap(탭바)을 받아줄 부모
  return el;
}

// 화면 스텁 둘 — 라우터가 실제로 스택·전환하게 최소한만 채운다. 여기서 재는 것은 화면
// "내용"이 아니라 "어느 화면에 있는가"다 — render() 는 아무것도 안 그려도 된다.
function makeScreens() {
  return [
    { id: "watchlist", tab: "list", render: function () {} },
    { id: "report", tab: "list", render: function () {} }
  ];
}

function load() {
  var doc = makeDoc();
  global.document = doc;
  global.MSUi = require("../www/ui.js");
  global.MSStr = require("../www/strings.js");
  global.MSWallet = require("../www/wallet.js");
  delete require.cache[require.resolve("../www/router.js")];
  global.MSRouter = require("../www/router.js");
  delete require.cache[require.resolve("../www/sheet.js")];
  global.MSSheet = require("../www/sheet.js");            // 진짜 MSSheet — 스텁이 아니다
  delete require.cache[require.resolve("../www/tier-sheet.js")];
  var MSTierSheet = require("../www/tier-sheet.js");       // 진짜 첫 프로덕션 소비자(Task 5)
  delete require.cache[require.resolve("../www/shell.js")];
  var MSShell = require("../www/shell.js");

  var rootEl = makeRootEl(doc);
  var router = MSShell.mount(rootEl, makeScreens());
  router.go("watchlist");
  router.go("report");   // 스택 깊이 2 — back() 이 실제로 뭔가 할 게 있는 상태를 만든다

  var handler = doc._listeners.backbutton;
  assert.ok(handler, "shell.js 가 backbutton 리스너를 안 걸었다");

  return { doc: doc, router: router, MSTierSheet: MSTierSheet, backbutton: handler };
}

test("시트가 열려 있으면: 뒤로가기가 시트를 닫고, 화면은 안 바뀐다(실제 MSTierSheet+MSSheet 스택)", () => {
  var ctx = load();
  ctx.MSTierSheet.open({ sym: "AAPL", balance: 12, cap: 20, locked: { full: false, custom: true }, onRun: function () {} });

  assert.strictEqual(ctx.doc.body.children.length, 1, "시트를 열었는데 backdrop 이 실제 DOM(body)에 없다");
  var before = ctx.router.current();
  assert.strictEqual(before.id, "report", "사전조건: report 화면에 있어야 한다");

  ctx.backbutton();   // shell.js 가 실제로 등록한 그 핸들러 — 스텁이 아니라 진짜 로직

  assert.strictEqual(ctx.doc.body.children.length, 0, "뒤로가기를 눌렀는데 시트(backdrop)가 실제 DOM 에서 안 지워졌다");
  var after = ctx.router.current();
  assert.strictEqual(after.id, "report", "시트가 열려 있었는데 화면이 바뀌었다 — 뒤로가기가 시트보다 라우터를 먼저 건드렸다");

  ctx.MSTierSheet.close();   // 정리(안전 — 이미 닫혀 있으면 no-op)
});

test("시트가 없으면: 같은 리스너가 라우터를 실제로 움직인다", () => {
  var ctx = load();
  assert.strictEqual(ctx.doc.body.children.length, 0, "사전조건: 시트가 닫혀 있어야 한다(연 적이 없다)");

  var before = ctx.router.current();
  assert.strictEqual(before.id, "report");

  ctx.backbutton();

  var after = ctx.router.current();
  assert.strictEqual(after.id, "watchlist", "시트가 없는데 뒤로가기가 라우터를 안 움직였다");
});
