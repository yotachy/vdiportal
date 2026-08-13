import { test } from "node:test";
import assert from "node:assert";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// app.js 는 UMD 가 아니라 IIFE 라 require 로 부를 수 없다 — 그래서 지금까지 이 파일에 대한
// 검사는 전부 소스 정규식이었다(wallet-http.test.mjs 의 URL 검사). 소스 검사로는 이 파일의
// 핵심 사고를 못 잡는다: "어떤 조건에서 운영 지갑을 설치하는가"는 값의 문제이고, 정규식은
// http/https/capacitor 를 구별해 주지 않는다. vm 에 최소 전역을 깔고 실제로 실행한다.
const SRC = readFileSync(new URL("../www/app.js", import.meta.url), "utf8");

function El() {
  this.className = ""; this.style = {}; this.children = []; this.innerHTML = "";
}
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.classList = null;

// 부팅 한 번을 통째로 돌린다. protocol 을 바꿔가며 같은 코드를 다시 평가하므로 컨텍스트도
// 매번 새로 만든다(모듈 스코프 플래그가 테스트 간에 새면 boot 재진입 테스트가 거짓 초록이 된다).
function runApp(opts) {
  const o = opts || {};
  const installed = [];
  const modeListeners = [];
  const onboardOpts = [];
  const rootEl = new El();
  rootEl.classList = { add() {}, remove() {} };

  let domReady = null;
  const doc = {
    getElementById: () => rootEl,
    addEventListener: (t, f) => { if (t === "DOMContentLoaded") domReady = f; },
    body: { classList: { add() {}, remove() {} } },
    createElement: () => new El()
  };
  const win = {
    innerWidth: 400,
    matchMedia: () => ({
      matches: !!o.dual,
      addEventListener: (t, f) => { modeListeners.push(f); },
      addListener: (f) => { modeListeners.push(f); }
    }),
    addEventListener: () => {},
    scrollTo: () => {}
  };

  const ctx = {
    window: win,
    document: doc,
    location: { protocol: o.protocol || "https:" },
    ForgeCore: {},
    MSStr: { t: { bootVendorMissing: "x", rpPickSym: "y" } },
    MSLayout: { MODE_QUERY: "(min-width: 600px)", listWidth: () => 300 },
    MSUi: { el: () => new El() },
    MSWatchlist: { render: () => {} },
    MSReport: { render: () => {} },
    MSWalletScreen: { render: () => {} },
    MSStore: {
      onboarded: () => !!o.onboarded,
      getWatchlist: () => o.watchlist || [],
      getLastSym: () => null,
      setLastSym: () => {}
    },
    MSWallet: {
      isInstalled: () => installed.length > 0,
      install: (b) => { installed.push(b); }
    },
    MSOnboarding: { render: (el, oo) => { onboardOpts.push(oo); } }
  };
  if (o.walletHttp !== false) ctx.MSWalletHttp = { create: (c) => ({ __url: c.url }) };
  ctx.globalThis = ctx;

  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  assert.ok(domReady, "app.js 가 DOMContentLoaded 를 걸지 않았다");
  domReady();
  return { installed, modeListeners, onboardOpts, ctx };
}

// ── Fix 1: 개발 스킴에서 운영 지갑을 설치하지 않는다 ────────────────────────────────
// 실제로 일어난 사고: www/ 에서 python3 -m http.server 로 화면을 한 번 연 것만으로 운영
// 서버에 계정이 생겼다(온보딩 3단계가 첫 로드에서 지갑을 부른다).
test("http: 로 열면 운영 지갑을 설치하지 않는다 — 로컬 미리보기가 계정을 만들면 안 된다", () => {
  const r = runApp({ protocol: "http:" });
  assert.deepStrictEqual(r.installed, [],
    "http: 에서 지갑이 설치됐다 — 로컬 서버가 운영 서버에 계정을 만든다");
});

test("file: 로 열어도 설치하지 않는다", () => {
  const r = runApp({ protocol: "file:" });
  assert.deepStrictEqual(r.installed, []);
});

test("https: (Capacitor 안드로이드) 에서는 설치한다 — 가드가 앱까지 꺼뜨리면 안 된다", () => {
  const r = runApp({ protocol: "https:" });
  assert.strictEqual(r.installed.length, 1, "실기기 경로에서 지갑이 설치되지 않았다");
  assert.strictEqual(r.installed[0].__url, "https://parksvc.mycafe24.com/map/wallet-api.php");
});

// 이 테스트가 거부 목록/허용 목록을 가른다. `location.protocol === "https:"` 라는 허용 목록으로
// 바꿔도 위 세 테스트는 전부 통과한다 — iOS 타깃(capacitor://)을 더하는 날 지갑이 조용히 죽고,
// 증상은 "지급이 안 된다"뿐이라 원인까지 가기 멀다. 미래 스킴은 통과해야 한다.
test("모르는 스킴(capacitor:)은 통과시킨다 — 허용 목록이 아니라 개발 스킴 거부 목록이다", () => {
  const r = runApp({ protocol: "capacitor:" });
  assert.strictEqual(r.installed.length, 1,
    "https 허용 목록으로 좁혀졌다 — iOS 타깃을 더하는 날 지갑이 조용히 꺼진다");
});

test("MSWalletHttp 가 없으면(태그 누락) 던지지 않는다", () => {
  assert.doesNotThrow(() => runApp({ protocol: "https:", walletHttp: false }));
});

// ── boot() 재진입 ──────────────────────────────────────────────────────────────
// 지금 boot() 를 두 번 부르는 경로는 온보딩의 finished 래치가 막고 있을 뿐이다. 그 래치는
// 다른 이유로 존재하므로, 여기가 스스로 막지 않으면 남의 가드에 목숨을 맡기는 셈이다.
test("boot() 를 두 번 돌려도 matchMedia 리스너는 하나다", () => {
  const r = runApp({ protocol: "https:", onboarded: false });
  assert.strictEqual(r.onboardOpts.length, 1, "온보딩이 안 떴다");
  assert.strictEqual(r.modeListeners.length, 0, "온보딩 전인데 셸이 부팅됐다");
  r.onboardOpts[0].onDone();
  assert.strictEqual(r.modeListeners.length, 1, "첫 부팅에서 모드 리스너가 안 붙었다");
  r.onboardOpts[0].onDone();   // 온보딩의 finished 래치를 우회한 두 번째 부팅
  assert.strictEqual(r.modeListeners.length, 1,
    "boot() 재진입마다 matchMedia 리스너가 쌓인다 — 회전 한 번에 renderShell 이 여러 번 돈다");
});

// 온보딩을 마친 사용자는 바로 셸로 간다 — 게이트가 반대로 걸리면 여기서 걸린다.
test("이미 온보딩을 마쳤으면 온보딩을 그리지 않고 곧장 부팅한다", () => {
  const r = runApp({ protocol: "https:", onboarded: true });
  assert.strictEqual(r.onboardOpts.length, 0, "이미 마쳤는데 온보딩이 다시 떴다");
  assert.strictEqual(r.modeListeners.length, 1, "셸이 부팅되지 않았다");
});
