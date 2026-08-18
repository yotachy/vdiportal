import { test } from "node:test";
import assert from "node:assert";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// app.js 는 UMD 가 아니라 IIFE 라 require 로 부를 수 없다 — 그래서 이 파일에 대한 검사는
// vm 에 최소 전역을 깔고 실제로 실행한다(소스 정규식으로는 "어떤 조건에서 운영 지갑을
// 설치하는가" 같은 값의 문제를 못 잡는다).
//
// 태스크 4(셸 + 하단 탭바) 이후 계약: app.js 는 화면 분기(state.showing)를 갖지 않고 부팅만
// 한다 — 화면 등록(SCREENS) + MSShell.mount() 호출 + router.go("watchlist"). 2단(폴드)
// 레이아웃은 이 라운드에 후퇴했다 — app.js 가 dual 판정(matchMedia)과 body.ms-dual
// 부여를 걷어낸 것이지, MSLayout(layout.js) 모듈이나 관련 CSS 자체를 지운 게 아니다
// (그 둘은 P5 재설계 때까지 그대로 남아 있다, chartHeight 등 일부는 지금도 쓰인다).
// 그래서 옛 app.test.mjs 의 "boot() 재진입 시 matchMedia 리스너가 하나" 시험은 더 이상
// 대상이 없다. 대신 셸 자체의 이중 마운트(탭바 중복·backbutton 리스너 중복)를 재본다.
const SRC = readFileSync(new URL("../www/app.js", import.meta.url), "utf8");

function El() {
  this.className = ""; this.style = {}; this.children = []; this.innerHTML = "";
}
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.classList = null;

// 부팅 한 번을 통째로 돌린다. protocol 을 바꿔가며 같은 코드를 다시 평가하므로 컨텍스트도
// 매번 새로 만든다(모듈 스코프 플래그가 테스트 간에 새면 재진입 시험이 거짓 초록이 된다).
function runApp(opts) {
  const o = opts || {};
  const installed = [];
  const onboardOpts = [];
  const mounts = [];   // MSShell.mount 호출 기록 — [rootEl, screens]
  const rootEl = new El();
  rootEl.classList = { add() {}, remove() {} };

  let domReady = null;
  const doc = {
    getElementById: () => rootEl,
    addEventListener: (t, f) => { if (t === "DOMContentLoaded") domReady = f; }
  };
  const win = { location: null };

  // 실제 셸(shell.js)은 여기서 테스트 대상이 아니다(shell.test.mjs 가 그것을 문자열로
  // 잰다) — app.js 가 그것을 "부르는가·몇 번 부르는가·router.go 를 뭐로 부르는가"만 본다.
  const fakeRouter = {
    go: function (id, params) { fakeRouter._goCalls.push([id, params]); },
    back: function () { return false; },
    current: function () { return fakeRouter._current; },
    _goCalls: [], _current: null
  };
  const ctx = {
    window: win,
    document: doc,
    location: { protocol: o.protocol || "https:" },
    ForgeCore: {},
    MSStr: { t: { bootVendorMissing: "x" } },
    MSShell: { mount: function (el, screens) { mounts.push([el, screens]); return fakeRouter; } },
    MSStore: {
      onboarded: () => !!o.onboarded,
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
  return { installed, onboardOpts, mounts, fakeRouter, ctx };
}

// ── Fix 1: 개발 스킴에서 운영 지갑을 설치하지 않는다 ────────────────────────────────
// 실제로 일어난 사고: www/ 에서 python3 -m http.server 로 화면을 한 번 연 것만으로 운영
// 서버에 계정이 생겼다(온보딩 3단계가 첫 로드에서 지갑을 부른다). 태스크 4는 이 판정문
// 자체를 옮기지 않았지만(개편 대상이 아니다), 부팅 경로가 새로 짜였으니 회귀가 없는지
// 다시 잰다 — 그 방어가 사라지면 로컬에서 화면 한 번 열어본 것으로 운영 계정이 생긴다.
test("http: 로 열면 운영 지갑을 설치하지 않는다 — 로컬 미리보기가 계정을 만들면 안 된다", () => {
  const r = runApp({ protocol: "http:", onboarded: true });
  assert.deepStrictEqual(r.installed, [],
    "http: 에서 지갑이 설치됐다 — 로컬 서버가 운영 서버에 계정을 만든다");
});

test("file: 로 열어도 설치하지 않는다", () => {
  const r = runApp({ protocol: "file:", onboarded: true });
  assert.deepStrictEqual(r.installed, []);
});

test("https: (Capacitor 안드로이드) 에서는 설치한다 — 가드가 앱까지 꺼뜨리면 안 된다", () => {
  const r = runApp({ protocol: "https:", onboarded: true });
  assert.strictEqual(r.installed.length, 1, "실기기 경로에서 지갑이 설치되지 않았다");
  assert.strictEqual(r.installed[0].__url, "https://parksvc.mycafe24.com/map/wallet-api.php");
});

// 이 테스트가 거부 목록/허용 목록을 가른다. `location.protocol === "https:"` 라는 허용 목록으로
// 바꿔도 위 세 테스트는 전부 통과한다 — iOS 타깃(capacitor://)을 더하는 날 지갑이 조용히 죽고,
// 증상은 "지급이 안 된다"뿐이라 원인까지 가기 멀다. 미래 스킴은 통과해야 한다.
test("모르는 스킴(capacitor:)은 통과시킨다 — 허용 목록이 아니라 개발 스킴 거부 목록이다", () => {
  const r = runApp({ protocol: "capacitor:", onboarded: true });
  assert.strictEqual(r.installed.length, 1,
    "https 허용 목록으로 좁혀졌다 — iOS 타깃을 더하는 날 지갑이 조용히 꺼진다");
});

test("MSWalletHttp 가 없으면(태그 누락) 던지지 않는다", () => {
  assert.doesNotThrow(() => runApp({ protocol: "https:", walletHttp: false, onboarded: true }));
});

// ── 부팅 계약(태스크 4) ─────────────────────────────────────────────────────────
// app.js 는 화면 분기를 갖지 않는다 — 셸에 화면을 등록하고 맡긴다.
test("boot 은 MSShell.mount 를 부르고 곧장 watchlist 로 간다", () => {
  const r = runApp({ protocol: "https:", onboarded: true });
  assert.strictEqual(r.mounts.length, 1, "MSShell.mount 가 정확히 한 번 불려야 한다");
  assert.strictEqual(r.fakeRouter._goCalls.length, 1, "부팅 직후 라우트 이동이 한 번이어야 한다");
  assert.deepStrictEqual(r.fakeRouter._goCalls[0], ["watchlist", undefined],
    "부팅이 watchlist 로 시작하지 않는다");
});

// readings·expert 는 죽은 라우트를 심지 않는다(MSExpert 는 render 가 없고, MSReadingsList
// 는 report.js 가 계산한 rows 없이는 못 그린다 — 브리프 원안엔 있었으나 실측으로 뺐다).
test("SCREENS 레지스트리는 readings·expert 를 등록하지 않는다 — 등록하면 라우팅되는 순간 죽는다", () => {
  const r = runApp({ protocol: "https:", onboarded: true });
  // SCREENS 는 app.js(vm 컨텍스트)가 만든 배열이라 다른 realm 소속이다 — Array.from 을
  // (이 파일의, 즉 바깥 realm 의) Array 로 새로 지어야 deepStrictEqual 이 realm 불일치로
  // "구조는 같은데 참조가 다르다"고 오탐하지 않는다.
  const ids = Array.from(r.mounts[0][1], s => s.id).sort();
  assert.deepStrictEqual(ids,
    ["record", "report", "result", "scanresult", "wallet", "watchlist"]);
});

// 온보딩이 4단계에서 워치리스트를 심는다. 온보딩을 통과한 뒤에만 셸이 뜬다 — 게이트가
// 반대로 걸리면 온보딩 위에 셸이 겹쳐 그려진다.
test("온보딩을 안 마쳤으면 셸을 마운트하지 않고 온보딩을 그린다", () => {
  const r = runApp({ protocol: "https:", onboarded: false });
  assert.strictEqual(r.onboardOpts.length, 1, "온보딩이 안 떴다");
  assert.strictEqual(r.mounts.length, 0, "온보딩 전인데 셸이 마운트됐다");
});

test("이미 온보딩을 마쳤으면 온보딩을 그리지 않고 곧장 셸을 마운트한다", () => {
  const r = runApp({ protocol: "https:", onboarded: true });
  assert.strictEqual(r.onboardOpts.length, 0, "이미 마쳤는데 온보딩이 다시 떴다");
  assert.strictEqual(r.mounts.length, 1, "셸이 마운트되지 않았다");
});

// 셸은 mount() 마다 탭바-wrap 을 새로 만들고 backbutton 리스너를 새로 건다(shell.js, 재마운트를
// 스스로 막지 않는다) — 두 번 마운트되면 탭바가 겹쳐 그려지고 백버튼이 두 번 처리된다.
// 온보딩의 onDone 은 원래 한 번만 불려야 하는데, 그 래치는 온보딩 쪽 책임이라 app.js 가
// 스스로도 막는다(구 app.js 의 modeBound 와 같은 이유의 방어 — 남의 가드에 목숨을 맡기지 않는다).
test("온보딩 onDone 이 래치를 우회해 두 번 불려도 셸은 한 번만 마운트된다", () => {
  const r = runApp({ protocol: "https:", onboarded: false });
  assert.strictEqual(r.mounts.length, 0);
  r.onboardOpts[0].onDone();
  assert.strictEqual(r.mounts.length, 1, "첫 onDone 에서 셸이 마운트되지 않았다");
  r.onboardOpts[0].onDone();   // 래치 우회
  assert.strictEqual(r.mounts.length, 1,
    "boot() 재진입마다 셸이 다시 마운트된다 — 탭바 중복·backbutton 리스너 중복으로 이어진다");
});

// ── MSApp 전역 — 기존 화면들의 호출부 호환 ─────────────────────────────────────
// 화면 모듈은 여전히 MSApp.go(route, params) 로 이동하고 MSApp.current() 로 현재 위치를 읽는다
// (watchlist.js 선택 하이라이트, report.js 결과-반영 유효성 판정). router.current() 는
// {id, params, tab} 을 주는데 화면들은 옛 셸부터 .route 를 읽어 왔다 — id→route 로 옮기지
// 않으면 report.js 의 isCurrent() 가 항상 거짓이 되어 결과 반영이 조용히 죽는다.
// window 는 vm 샌드박스의 전역(ctx) 자신이 아니라 우리가 넣어준 별도 mock 객체(win) 다 —
// app.js 의 `window.MSApp = {...}` 는 그 mock 위에 얹힌다. 그래서 조회는 r.ctx.window.MSApp.
test("MSApp.go 는 sym 이 있으면 setLastSym 을 부르고 router.go 로 넘긴다", () => {
  const r = runApp({ protocol: "https:", onboarded: true });
  let lastSet = null;
  r.ctx.MSStore.setLastSym = (s) => { lastSet = s; };
  r.ctx.window.MSApp.go("report", { sym: "aapl" });
  assert.strictEqual(lastSet, "AAPL", "소문자 심볼이 대문자로 정규화되지 않았다");
  assert.deepStrictEqual(r.fakeRouter._goCalls[r.fakeRouter._goCalls.length - 1],
    ["report", { sym: "aapl" }]);
});

test("MSApp.current() 는 router.current() 의 id 를 route 로 옮겨 준다 — 화면들의 옛 계약", () => {
  const r = runApp({ protocol: "https:", onboarded: true });
  r.fakeRouter._current = { id: "report", params: { sym: "AAPL" }, tab: "analysis" };
  // current() 의 반환 객체는 app.js(vm 컨텍스트)가 지은 것이라 다른 realm 소속이다 —
  // JSON 왕복으로 realm 을 떼어내고 값만 비교한다(위 readings·expert 시험의 배열과 같은 이유).
  const cur = JSON.parse(JSON.stringify(r.ctx.window.MSApp.current()));
  assert.deepStrictEqual(cur, { route: "report", params: { sym: "AAPL" }, tab: "analysis" });
});

test("MSApp.current() 는 router.current() 가 null 이면 null 을 그대로 돌려준다", () => {
  const r = runApp({ protocol: "https:", onboarded: true });
  r.fakeRouter._current = null;
  assert.strictEqual(r.ctx.window.MSApp.current(), null);
});
