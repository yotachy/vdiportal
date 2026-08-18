// 뒤로가기 배선(Task 5) — "시트가 열려 있으면 화면을 바꾸지 않는다"는 이 프로젝트가 죽었던
// 유형의 결함이다: 소스 정규식(/closeTop/·/stack/)은 그 이름의 함수·변수가 있기만 하면
// 통과하고, shell.test.mjs 는 backbutton 을 발화시키지 않으며, app.test.mjs 는 MSShell.mount
// 자체를 페이크로 대체해 실제 리스너 등록부를 안 지난다. 브라우저 관문도 Cordova
// backbutton 이벤트를 흉내내지 않는다 — 관문은 초록인데 배선은 아무도 실행해서 보지 않았다.
//
// 여기서는 shell.js 를 실제로 require 해(module.exports 분기를 타는 UMD 라 순수 require 로
// 실행 가능 — ticker-picker.test.mjs 와 같은 패턴) MSShell.mount() 를 부르고,
// document.addEventListener("backbutton", ...) 로 등록된 핸들러를 직접 붙잡아 발화시킨다.
// router.js 는 실제 모듈을 그대로 쓴다(DOM 을 모르는 순수 상태기계라 require 만으로 동작) —
// router.back() 이 실제로 호출되는지/안 되는지를 스텁이 아니라 실물로 잰다.
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

function FakeNode(tag) {
  this.tagName = String(tag || "").toUpperCase();
  this.className = "";
  this.children = [];
  this.parentNode = null;
  this.textContent = "";
  this._attrs = {};
}
FakeNode.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
FakeNode.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
FakeNode.prototype.addEventListener = function () {};   // 탭 버튼 클릭 배선은 shell.test.mjs 대상 밖

function makeRootEl() {
  const el = new FakeNode("div");
  el.classList = { add() {}, remove() {}, contains() { return false; } };
  el.parentNode = new FakeNode("div");   // #app 의 형제 wrap 을 받아줄 부모
  return el;
}

// 실행마다 새 컨텍스트가 필요하다 — shell.js 모듈 스코프의 router/barEl 이 테스트 간에
// 새면(require 캐시가 같은 인스턴스를 돌려주면) 뒤 테스트가 앞 테스트의 router 를 본다.
function boot(opts) {
  const o = opts || {};
  const backCalls = [];
  const closeTopCalls = [];
  const exitCalls = [];

  global.document = {
    createElement: tag => new FakeNode(tag),
    _listeners: {},
    addEventListener(type, fn) { this._listeners[type] = fn; }
  };
  global.MSUi = require("../www/ui.js");
  global.MSRouter = require("../www/router.js");
  global.MSSheet = {
    closeTop() { closeTopCalls.push(1); return !!o.sheetOpen; }
  };
  // Node 21+ 는 전역 navigator 가 getter-only 라 직접 대입이 TypeError 다 — defineProperty 로 덮는다.
  Object.defineProperty(global, "navigator", {
    value: o.hasApp ? { app: { exitApp() { exitCalls.push(1); } } } : {},
    configurable: true
  });

  delete require.cache[require.resolve("../www/shell.js")];
  delete require.cache[require.resolve("../www/router.js")];
  const MSShell = require("../www/shell.js");
  const rootEl = makeRootEl();
  const router = MSShell.mount(rootEl, []);   // 화면 등록 없이 배선만 확인 — render() 는 안 탄다
  router.back = function () { backCalls.push(1); return !!o.backReturns; };   // mount 가 돌려준 것과
  // shell.js 내부 클로저의 router 는 같은 참조다(MSRouter.create() 를 한 번만 호출) — 이 대입이
  // 실제 backbutton 핸들러가 부르는 router.back 을 스파이로 바꾼다.

  const handler = global.document._listeners.backbutton;
  assert.ok(handler, "mount() 가 backbutton 리스너를 안 걸었다");
  handler();

  return { backCalls, closeTopCalls, exitCalls };
}

test("시트가 열려 있으면 closeTop() 만 불리고 router.back() 은 안 불린다", () => {
  const r = boot({ sheetOpen: true });
  assert.strictEqual(r.closeTopCalls.length, 1, "closeTop() 이 안 불렸다");
  assert.strictEqual(r.backCalls.length, 0, "시트가 열려 있는데 router.back() 도 불렸다 — 화면이 같이 바뀐다");
});

test("시트가 없으면 router.back() 이 불린다", () => {
  const r = boot({ sheetOpen: false, backReturns: true });
  assert.strictEqual(r.closeTopCalls.length, 1, "closeTop() 을 먼저 확인하지 않았다");
  assert.strictEqual(r.backCalls.length, 1, "시트가 없는데 router.back() 이 안 불렸다");
});

test("router.back() 이 false 면(더 갈 곳 없음) 앱 종료 경로로 넘어간다", () => {
  const r = boot({ sheetOpen: false, backReturns: false, hasApp: true });
  assert.strictEqual(r.backCalls.length, 1);
  assert.strictEqual(r.exitCalls.length, 1, "router.back() 이 false 인데 navigator.app.exitApp() 이 안 불렸다");
});

test("router.back() 이 true 면(뒤로 갈 곳이 있었다) 앱을 종료하지 않는다", () => {
  const r = boot({ sheetOpen: false, backReturns: true, hasApp: true });
  assert.strictEqual(r.backCalls.length, 1);
  assert.strictEqual(r.exitCalls.length, 0, "뒤로 갈 곳이 있었는데 앱이 종료됐다");
});
