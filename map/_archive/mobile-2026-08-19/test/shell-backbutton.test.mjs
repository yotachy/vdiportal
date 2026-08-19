// 뒤로가기 배선 — 등록부와 로직을 함께 잰다.
//
// P1a Task 7 이전엔 이 시험이 재는 것이 backbutton 핸들러 "안쪽 로직"(시트 우선 →
// router.back() → 종료)뿐이었다. "안드로이드가 이 핸들러를 실제로 부르는가"는 그때 거짓이었다
// (P0 리뷰 C1 실측 — Capacitor 8 인데 `@capacitor/app` 미도입이라 backbutton 은 Cordova 전용
// 이벤트로 실기기에서 발화하지 않았다). Task 7 이 `@capacitor/app` 을 도입하면서 실제로 부르는
// 경로가 바뀌었다 — `App.addListener("backButton", ...)`. 이 파일은 이제 **어느 API 로
// 등록됐는지**까지 단언한다: capApp.addListener 가 정확히 "backButton" 이름으로 불렸는가.
// 그래도 여전히 남는 한계가 있다 — "네이티브가 그 콜백을 실제로 발화하는가" 자체는 이 시험이
// 못 잰다(안드로이드 Bridge/JS 브리지 왕복은 이 파일이 흉내내는 최소 DOM 밖의 일이다). 그건
// APK 실기기 확인에서만 닫힌다.
//
// 뒤로가기 배선(Task 5) — "시트가 열려 있으면 화면을 바꾸지 않는다"는 이 프로젝트가 죽었던
// 유형의 결함이다: 소스 정규식(/closeTop/·/stack/)은 그 이름의 함수·변수가 있기만 하면
// 통과하고, shell.test.mjs 는 backbutton 을 발화시키지 않으며, app.test.mjs 는 MSShell.mount
// 자체를 페이크로 대체해 실제 리스너 등록부를 안 지난다. 브라우저 관문도 Cordova
// backbutton 이벤트를 흉내내지 않는다 — 관문은 초록인데 배선은 아무도 실행해서 보지 않았다.
// (end-to-end 로 실제 MSSheet/MSTierSheet 를 열어 검증하는 시험은
// shell-backbutton-e2e.test.mjs — 이 파일은 스텁 MSSheet 로 로직만 잰다.)
//
// 여기서는 shell.js 를 실제로 require 해(module.exports 분기를 타는 UMD 라 순수 require 로
// 실행 가능 — ticker-picker.test.mjs 와 같은 패턴) MSShell.mount() 를 부르고,
// document.addEventListener("backbutton", ...) 와 (있으면) Capacitor App 플러그인의
// addListener("backButton", ...) 로 등록된 핸들러를 직접 붙잡아 발화시킨다.
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
//
// withCapApp: true 면 window.Capacitor.Plugins.App 을 심어 실제 배선 코드가 그 경로도
// 타게 만든다(가드가 정말 있으면 없을 때/있을 때 둘 다 안 던져야 한다 — 아래 두 붐 모두 시험).
function boot(opts) {
  const o = opts || {};
  const backCalls = [];
  const closeTopCalls = [];
  const exitCalls = [];
  const capAddListenerCalls = [];   // [name, fn] 쌍 — "어느 API 로 등록했는지" 확인용

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

  // window 는 브라우저 전역이다(shell.js 가 typeof window !== "undefined" 로 가드한다).
  // withCapApp 이 없으면 아예 지운다 — "플러그인이 없는 빌드"를 흉내낸다(가드가 진짜
  // 동작하는지는 이 부재 케이스가 던지지 않는 것으로 확인된다).
  if (o.withCapApp) {
    global.window = {
      Capacitor: {
        Plugins: {
          App: {
            addListener(name, fn) { capAddListenerCalls.push([name, fn]); }
          }
        }
      }
    };
  } else {
    delete global.window;
  }

  delete require.cache[require.resolve("../www/shell.js")];
  delete require.cache[require.resolve("../www/router.js")];
  const MSShell = require("../www/shell.js");
  const rootEl = makeRootEl();
  const router = MSShell.mount(rootEl, []);   // 화면 등록 없이 배선만 확인 — render() 는 안 탄다
  router.back = function () { backCalls.push(1); return !!o.backReturns; };   // mount 가 돌려준 것과
  // shell.js 내부 클로저의 router 는 같은 참조다(MSRouter.create() 를 한 번만 호출) — 이 대입이
  // 실제 backbutton 핸들러가 부르는 router.back 을 스파이로 바꾼다.

  const docHandler = global.document._listeners.backbutton;
  assert.ok(docHandler, "mount() 가 document 'backbutton' 리스너를 안 걸었다");

  if (!o.skipFire) docHandler();

  return { backCalls, closeTopCalls, exitCalls, capAddListenerCalls, docHandler };
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

// ── P1a Task 7: 어느 API 로 등록했는지 ─────────────────────────────────────────
test("Capacitor App 플러그인이 있으면 App.addListener('backButton', ...) 로도 등록한다", () => {
  const r = boot({ withCapApp: true, sheetOpen: false, backReturns: true, skipFire: true });
  assert.strictEqual(r.capAddListenerCalls.length, 1, "capApp.addListener 가 정확히 한 번 안 불렸다");
  assert.strictEqual(r.capAddListenerCalls[0][0], "backButton", "이벤트 이름이 'backButton'(Capacitor)이 아니다");
  assert.strictEqual(typeof r.capAddListenerCalls[0][1], "function", "핸들러가 함수로 안 넘어갔다");
});

test("App.addListener 로 등록된 핸들러를 직접 발화해도 같은 로직(시트 우선)이 돈다", () => {
  const r = boot({ withCapApp: true, sheetOpen: true, skipFire: true });
  const capHandler = r.capAddListenerCalls[0][1];
  capHandler();   // 네이티브가 실제로 부르는 경로를 직접 발화
  assert.strictEqual(r.closeTopCalls.length, 1, "capApp 경로로 불렀는데 closeTop() 이 안 불렸다");
  assert.strictEqual(r.backCalls.length, 0, "시트가 열려 있는데 router.back() 도 불렸다");
});

test("Capacitor 플러그인이 없어도(가드) mount() 가 던지지 않고 document 경로는 그대로 산다", () => {
  // withCapApp 없이 boot() 하는 것 자체가 이 케이스다(위 네 시험 전부가 이미 통과시켰다) —
  // 여기서는 그 사실을 명시적으로 이름 붙여 확인한다.
  assert.doesNotThrow(() => boot({ sheetOpen: false, backReturns: true }));
});

// ── 중복 처리 방지 ────────────────────────────────────────────────────────────
// document 'backbutton' 과 Capacitor App 'backButton' 두 경로가 공존한다(shell.js 주석
// 참고 — 실기기에선 App 경로만 실제로 불리지만, 플랫폼이 훗날 바뀌거나 두 경로가 같은 틱에
// 겹치는 상황을 방어적으로 막는다). 같은 물리적 누름을 흉내내 두 핸들러를 연달아 불러도
// closeTop()/router.back() 이 딱 한 번씩만 불려야 한다 — 두 번째는 재진입 가드에 막힌다.
test("같은 틱에 두 경로가 겹쳐 불려도 한 번만 처리된다(중복 방지)", () => {
  const r = boot({ withCapApp: true, sheetOpen: true, skipFire: true });
  const capHandler = r.capAddListenerCalls[0][1];
  r.docHandler();     // 경로 ① — 처리된다
  capHandler();        // 경로 ② — 같은 누름이라 가드에 막혀야 한다
  assert.strictEqual(r.closeTopCalls.length, 1, "두 경로가 겹쳐 불려 closeTop() 이 두 번 불렸다 — 중복 처리다");
});
