import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// ⚠ 소스 문자열 검사다(readings.test.mjs 의 report.js 검사와 같은 이유 — report.js·
// tier-sheet.js·screens/wallet.js 에 DOM 하네스가 없다). 초록이라고 화면이 옳다는 뜻이 아니라
// "호출 모양"만 본다. 리뷰 라운드 1의 I-H(이중 과금 방지 idem 재사용)·I-I(오프라인 잔량 안내)를
// 위한 소스 계약을 못박는다 — 둘 다 회귀해도 wallet-http.test.mjs 는 못 잡는 자리다(그쪽은
// 어댑터 단위이고, 이건 화면이 그 어댑터를 어떻게 쓰는지다).
// watchlist.js 는 파일 아래쪽(＋Add 시트)에서 예외를 둔다 — onboarding.test.mjs 와 같은 이유로,
// "시트가 document.body 에 붙는가"·"추가 후 재렌더로 실제로 보이는가"는 소스 모양으로는 안 보인다.

const require = createRequire(import.meta.url);
const MSWallet = require("../www/wallet.js");
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");
const WATCHLIST = readFileSync(new URL("../www/screens/watchlist.js", import.meta.url), "utf8");
const TIER = readFileSync(new URL("../www/tier-sheet.js", import.meta.url), "utf8");
const WALLET_SCR = readFileSync(new URL("../www/screens/wallet.js", import.meta.url), "utf8");

// ── I-H: maybeCharged 분류기 자체는 wallet.test.mjs 가 이미 본다. 여기서는 report.js·
// watchlist.js 가 실제로 그 분류를 idem 재사용에 쓰는지를 소스 모양으로 확인한다.

test("wallet.js — maybeCharged 가 network·server-error·busy 만 재시도-안전으로 분류한다", () => {
  assert.strictEqual(MSWallet.maybeCharged("network"), true);
  assert.strictEqual(MSWallet.maybeCharged("server-error"), true);
  assert.strictEqual(MSWallet.maybeCharged("busy"), true);
  ["insufficient", "bad-idem", "bad-ref", "unauthorized", "unknown-runtype",
   "backend-error", "no-backend", undefined, null, ""].forEach(function (r) {
    assert.strictEqual(MSWallet.maybeCharged(r), false, "definitely-not-charged 사유가 재시도-안전으로 잘못 분류됐다: " + r);
  });
});

test("report.js 소스 모양 — purchaseFull 이 이전 시도의 idem 을 재사용한다(새로 뽑지 않는다)", () => {
  // 이전 rec.idem 이 있으면 그걸 쓰고, 그 다음은 저장소에 남은 값(지난 실행의 미확인 시도),
  // 둘 다 없을 때만 새로 뽑는다. "항상 새로 뽑는다"(구버전)로 되돌아가면 maybe-charged
  // 재시도가 원장에서 별개 키가 되어 이중 차감된다.
  assert.match(REPORT, /var idem = \(rec && rec\.idem\) \? rec\.idem : \(pendingFullIdem\(sym\) \|\| MSWallet\.newIdem\(\)\);/,
    "purchaseFull 이 무조건 새 idem 을 뽑는다 — maybe-charged 재시도가 이중 차감될 수 있다");
});

// 최종 리뷰(LIVE A): idem 재사용 장치가 전부 모듈 스코프 변수라 프로세스와 함께 죽었다.
// 응답 유실 → 강제 종료 → 재실행이 정확히 이 장치가 막으려던 시나리오인데, 그때만 사라졌다.
test("report.js 소스 모양 — 진행 중 idem 이 저장소에 남는다(실행보다 오래 산다)", () => {
  assert.match(REPORT, /var K_PEND_FULL = "ms_pending_full_idem";/, "종목별 미확인 idem 저장 키가 없다");
  assert.match(REPORT, /MSStore\.read0\(K_PEND_FULL/, "저장된 idem 을 읽지 않는다");
  assert.match(REPORT, /MSStore\.write0\(K_PEND_FULL/, "idem 을 저장하지 않는다 — 강제 종료로 사라진다");
  // 순서가 핵심이다: spend 를 "보내기 전에" 적어야 응답 유실 창이 덮인다.
  const write = REPORT.indexOf("setPendingFullIdem(sym, idem);");
  const send = REPORT.indexOf('MSWallet.spend("full"');
  assert.ok(write > 0 && send > 0 && write < send,
    "spend 를 보낸 뒤에 idem 을 적는다 — 이중 과금이 나는 창(요청은 나갔고 응답은 못 받은 구간)이 그대로 열려 있다");
});

test("report.js 소스 모양 — 확정 결과에서만 저장된 idem 을 지운다", () => {
  assert.match(REPORT, /rec\.runs = r\.runs;\s*\n\s*setPendingFullIdem\(sym, null\);/,
    "성공했는데 idem 이 남는다 — 다음 구매가 남의 키를 재사용해 재생(무과금)으로 흡수된다");
  assert.match(REPORT, /delete purchases\[sym\];[\s\S]{0,120}setPendingFullIdem\(sym, null\);/,
    "확정 실패·환급인데 저장된 idem 을 안 지운다");
});

// 최종 리뷰(MINOR): 세 번째 인자 sym 을 빼도 761/761 초록이었다 — 그런데 서버는 full·custom 에
// ref 가 없으면 bad-ref 로 거절한다(w_spend). 즉 프로덕션에서 Full 을 아무도 못 산다.
test("report.js 소스 모양 — Full 구매가 ref 로 종목을 함께 보낸다", () => {
  assert.match(REPORT, /MSWallet\.spend\("full", idem, sym\)/,
    "ref(sym) 없이 full 을 결제한다 — 서버가 bad-ref 로 전부 거절해 Full 을 살 수 없다");
});

test("report.js 소스 모양 — maybe-charged 실패는 idem 을 지우지 않는다(definitely-not-charged 만 지운다)", () => {
  assert.match(REPORT,
    /r\.kind === "unknown" \|\| \(r\.kind === "spend-fail" && MSWallet\.maybeCharged\(r\.reason\)\)/,
    "spend-fail 의 maybeCharged 분기가 없다 — 모든 실패가 무조건 idem 을 지우는 옛 동작으로 보인다");
});

test("report.js 소스 모양 — spend 실패 안내 문구도 maybeCharged 로 갈린다", () => {
  assert.match(REPORT, /MSWallet\.maybeCharged\(r\.reason\) \? MSStr\.t\.tsSpendFailedUnknown/,
    "'Nothing was charged' 문구를 maybe-charged 에도 그대로 쓰면 거짓말이 될 수 있다");
});

// ── report.js 소스 모양 — 잔량 부족 광고 권유(Phase 8d) ──────────────────────────
// report.js 는 canvas·ForgeCore·MSApi 등에 깊이 얽혀 있어 wallet.js 같은 DOM 실행 하네스가
// 없다(이 파일 머리말 참고). 위 idem 재사용 테스트들과 같은 이유로 소스 모양만 본다 — 초록이
// 화면이 옳다는 뜻은 아니고 "호출 모양"을 못박는다.

test("report.js 소스 모양 — Go deeper 는 잔량이 실제로 부족할 때만(bal!=null && bal<cost) 광고 권유로 바꾼다", () => {
  assert.match(REPORT, /bal != null && bal < MSWallet\.COSTS\.full/,
    "잔량 부족 판정이 없다 — bal==null(오프라인 등)까지 광고 권유로 잘못 분류할 수 있다");
  assert.match(REPORT, /showLowBalanceAd\(wrap, bal\)/,
    "잔량 부족인데 단계 선택 시트를 그대로 연다 — 광고 권유 자리가 없다");
});

// 계약 ①(태스크 지시): customData 는 화면이 가공하지 않는다. show(unit) 은 "quick"/"full"
// 문자열 키만 받는다 — 객체로 감싸거나 customData 를 직접 조립해 넘기면 SSV 콜백이 버려진다.
test("report.js 소스 모양 — 광고 요청은 unit 문자열만 넘긴다(customData 를 가공하지 않는다)", () => {
  assert.match(REPORT, /MSAds\.show\(pair\[0\]\)|MSAds\.show\(unit\)/,
    "MSAds.show() 호출 모양이 없다");
  assert.doesNotMatch(REPORT, /MSAds\.show\(\s*\{/,
    "MSAds.show() 에 객체를 넘긴다 — unit 문자열만 넘겨야 한다(customData 가공 금지)");
});

// 이 태스크의 핵심 규율 — 낙관적으로 잔량을 올려 그리지 않는다. bal(before)+reward 같은
// 클라이언트 계산이 있으면 SSV 가 안 왔을 때 뺏는 상황이 생긴다.
test("report.js 소스 모양 — 광고 완료를 클라이언트가 계산해 잔량에 더하지 않는다", () => {
  assert.doesNotMatch(REPORT, /bal\s*\+\s*(reward|1|3)\b/,
    "광고 보상을 클라이언트가 계산해 더한다 — SSV 가 정본이어야 한다(8b 원칙)");
  assert.match(REPORT, /r\.state\.balance > before/,
    "afterCtaAd 가 서버 잔량이 실제로 올랐는지 확인하지 않는다");
});

// 세대 가드 — report.js 는 이미 gen/isCurrent() 를 자기 방식으로 갖고 있다(구매 폴링과 같은
// 장치). 광고 폴링도 새 가드를 따로 만들지 않고 그걸 재사용해야 한다 — 재사용하지 않으면
// 종목을 바꾸거나 화면을 나간 뒤에도 옛 광고 폴링이 살아 다른 종목 화면을 덮어쓸 수 있다.
test("report.js 소스 모양 — 광고 폴링(afterCtaAd)이 report.js 자신의 세대 가드(isCurrent)를 쓴다", () => {
  const start = REPORT.indexOf("function afterCtaAd");
  const end = REPORT.indexOf("function watchCtaAd");
  assert.ok(start > 0 && end > start, "afterCtaAd 를 찾을 수 없다");
  const body = REPORT.slice(start, end);
  assert.match(body, /isCurrent\(\)/, "afterCtaAd 가 isCurrent() 세대 가드를 안 쓴다");
});

test("watchlist.js 소스 모양 — beginScan 이 pendingScanIdem 을 재사용하고, 확정 실패에만 비운다", () => {
  assert.match(WATCHLIST, /var idem = pendingScanIdem\(\) \|\| MSWallet\.newIdem\(\);/,
    "beginScan 이 이전 실패의 idem 을 재사용하지 않는다");
  assert.match(WATCHLIST, /if \(!MSWallet\.maybeCharged\(sp\.reason\)\) setPendingScanIdem\(null\);/,
    "maybe-charged 실패인데 idem 을 보존하지 않는다 — 재시도가 새 idem 을 써 이중 차감될 수 있다");
});

// 최종 리뷰(LIVE A): scan 은 w_entitled_types() 에 없어 서버 권리(spend-cached)라는 뒷받침이
// 없다 — 재시도가 새 키면 2 스쿱이 그냥 두 번 나간다. 그런데 그 키가 모듈 변수였다:
// 응답 유실 → 강제 종료 → 재실행이라는, 이 장치가 존재하는 이유 그 자체인 경로에서만 사라졌다.
test("watchlist.js 소스 모양 — 진행 중 스캔 idem 이 저장소에 남는다(실행보다 오래 산다)", () => {
  assert.match(WATCHLIST, /var K_PEND_SCAN = "ms_pending_scan_idem";/, "미확인 스캔 idem 저장 키가 없다");
  assert.match(WATCHLIST, /MSStore\.read0\(K_PEND_SCAN/, "저장된 idem 을 읽지 않는다");
  assert.match(WATCHLIST, /MSStore\.write0\(K_PEND_SCAN/, "idem 을 저장하지 않는다 — 강제 종료로 사라진다");
  const write = WATCHLIST.indexOf("setPendingScanIdem(idem);");
  const send = WATCHLIST.indexOf('MSWallet.spend("scan"');
  assert.ok(write > 0 && send > 0 && write < send,
    "spend 를 보낸 뒤에 idem 을 적는다 — 이중 과금이 나는 창이 그대로 열려 있다");
  assert.match(WATCHLIST, /setPendingScanIdem\(null\);\s*\/\/ 확정 성공/,
    "확정 성공인데 저장된 idem 을 안 지운다 — 다음 스캔이 그 키를 물려받아 재생(무과금)으로 흡수된다");
});

// ── I-I: 잔량을 못 읽었을 때(오프라인 등) 0 으로 그리지 않고, 실행 버튼을 막는다.

test("tier-sheet.js 소스 모양 — 잔량을 모르면(bal==null) Run 버튼을 막는다", () => {
  assert.match(TIER, /var unavailable = \(bal == null\);/, "bal==null 판정이 없다");
  assert.match(TIER, /run\.disabled = short \|\| unavailable;/,
    "run.disabled 가 unavailable 을 안 본다 — 잔량 불명인데 버튼이 활성으로 남을 수 있다(옛 버그)");
});

test("screens/wallet.js 소스 모양 — get() 이 실패하면(잔량 불명) 안내 메시지를 그린다(0으로 그리지 않는다)", () => {
  assert.match(WALLET_SCR, /draw\(r\.state,\s*\(!r\.ok \|\| !r\.state\) \? MSStr\.t\.walUnavailable : ""\);/,
    "MSWallet.get() 실패 시 안내 없이 빈 게이지(=0처럼 보임)를 그린다");
});

// ── strings.js — 새 문구가 실제로 있고 비어 있지 않은지(오탈자로 undefined 를 그리면 화면에
// "undefined" 문자열이 노출된다).

test("strings.js — I-I/I-H 에서 쓰는 새 문구가 모두 채워져 있다", () => {
  const MSStr = require("../www/strings.js");
  ["walUnavailable", "tsUnavailable", "tsSpendFailedUnknown"].forEach(function (k) {
    assert.strictEqual(typeof MSStr.t[k], "string", k + " 가 문자열이 아니다(누락되면 화면에 'undefined' 가 뜬다)");
    assert.ok(MSStr.t[k].length > 0, k + " 가 빈 문자열이다");
  });
});

// ── 온보딩: ＋Add 의 prompt() 제거 ──────────────────────────────────────────────
// 예쁜 온보딩 옆에 브라우저 prompt 가 남으면 같은 앱으로 안 보인다.

test("워치리스트가 prompt() 를 쓰지 않는다", () => {
  assert.doesNotMatch(WATCHLIST, /\bprompt\s*\(/);
});
test("워치리스트가 MSTickerPicker 를 쓴다", () => {
  assert.match(WATCHLIST, /MSTickerPicker\.create\(/);
});

// ── 위 두 소스-모양 테스트만으로는 부족하다: "MSTickerPicker.create( 가 소스에 있다"는
// 주석에도, 죽은 분기에도, 잘못된 인자로 불러도 걸린다. 이전 태스크에서 정확히 이 함정이
// 실제로 벌어졌다(정규식이 소스 주석에 매치해 통과) — 여기서는 실행해서 본다.
//
// watchlist.js 는 UMD 가 아니라 require 시점에 곧바로 `window.MSWatchlist = ...` 를 실행한다
// (다른 www/*.js 는 전부 `typeof module !== "undefined"` 분기가 있다). 그래서 require 하기
// "전에" window 를 세워 둬야 한다 — 이후에는 캡처한 MSWatchlist 참조만 쓰고 window 는
// 매 테스트마다 새로 갈아 끼운다(다른 모듈이 우연히 옛 window 를 들고 있지 않도록).
const MSWatchlist = (function () {
  var hadWindow = Object.prototype.hasOwnProperty.call(global, "window");
  var prevWindow = global.window;
  global.window = global;
  require("../www/screens/watchlist.js");
  var got = global.MSWatchlist;
  delete global.MSWatchlist;               // 전역 오염 최소화 — 이후에는 지역 변수로만 쓴다
  if (hadWindow) global.window = prevWindow; else delete global.window;
  return got;
})();

// ── 최소 DOM 스텁(ticker-picker.test.mjs·onboarding.test.mjs 와 같은 요령) ────────────
// querySelector(All) + classList 만 얹은 최소 트리. innerHTML="" 대입이 실제 브라우저처럼
// 자식을 지운다 — drawShell() 의 `root.innerHTML = ""` 재렌더가 무엇을 파괴하는지를 보려면
// 이 동작이 정확해야 한다.
function WlNode(tag) {
  this.tagName = String(tag || "div").toUpperCase();
  this.className = ""; this.children = []; this.parentNode = null;
  this.listeners = {}; this._attrs = {}; this._text = "";
  this.style = {}; this.value = ""; this.type = ""; this.disabled = false;
  var self = this;
  this.classList = {
    add: function (c) {
      var set = self.className.split(" ").filter(Boolean);
      if (set.indexOf(c) < 0) { set.push(c); self.className = set.join(" "); }
    },
    remove: function (c) {
      self.className = self.className.split(" ").filter(function (x) { return x !== c; }).join(" ");
    },
    toggle: function (c, force) {
      var has = self.className.split(" ").indexOf(c) >= 0;
      var want = (force === undefined) ? !has : force;
      if (want && !has) self.classList.add(c);
      if (!want && has) self.classList.remove(c);
    },
    contains: function (c) { return self.className.split(" ").indexOf(c) >= 0; }
  };
}
WlNode.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
WlNode.prototype.removeChild = function (c) {
  var i = this.children.indexOf(c);
  if (i >= 0) this.children.splice(i, 1);
  c.parentNode = null;
  return c;
};
WlNode.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
WlNode.prototype.getAttribute = function (k) {
  return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
};
WlNode.prototype.addEventListener = function (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); };
WlNode.prototype.dispatch = function (type, evt) {
  (this.listeners[type] || []).slice().forEach(function (fn) { fn(evt || {}); });
};
WlNode.prototype.find = function (pred) {
  for (var i = 0; i < this.children.length; i++) {
    var c = this.children[i];
    if (pred(c)) return c;
    var hit = c.find(pred);
    if (hit) return hit;
  }
  return null;
};
WlNode.prototype.findAll = function (pred, out) {
  out = out || [];
  for (var i = 0; i < this.children.length; i++) {
    var c = this.children[i];
    if (pred(c)) out.push(c);
    c.findAll(pred, out);
  }
  return out;
};
WlNode.prototype.querySelector = function (sel) {
  var cls = String(sel).replace(/^\./, "");
  return this.find(function (c) { return c.classList.contains(cls); });
};
WlNode.prototype.querySelectorAll = function (sel) {
  var cls = String(sel).replace(/^\./, "");
  return this.findAll(function (c) { return c.classList.contains(cls); });
};
Object.defineProperty(WlNode.prototype, "textContent", {
  get: function () { return this._text; },
  set: function (v) { this._text = String(v); this.children.forEach(function (c) { c.parentNode = null; }); this.children = []; }
});
Object.defineProperty(WlNode.prototype, "innerHTML", {
  get: function () { return ""; },
  set: function () { this.children.forEach(function (c) { c.parentNode = null; }); this.children = []; }
});

function fakeStore(list) {
  // getWatchlist() 는 매번 살아있는 스냅샷을 돌려준다 — addTicker 가 배열에 push 한 뒤
  // 다음 drawShell() 이 그걸 봐야 "화면에 실제로 나타났는가"를 검증할 수 있다.
  return {
    getWatchlist: function () { return list.slice(); },
    allScans: function () { return {}; },
    addTicker: function (sym, name) { list.push({ sym: sym, name: name || sym }); },
    removeTicker: function () {},
    setScan: function () {}, getScan: function () {},
    // 읽음 상태(시안 14a) — 이 스위트는 스캔 결과가 없는 행만 다루므로(allScans 가 항상 {})
    // row() 가 호출은 하되 항상 null 을 받는다. 그래도 함수 자체가 없으면 TypeError 로 죽는다.
    viewedScanKey: function () { return null; }, markScanViewed: function () {},
    read0: function (k, d) { return d; }, write0: function () {}
  };
}

function setupWatchlistGlobals(opts) {
  const g = globalThis;
  const saved = {};
  const put = (k, v) => { saved[k] = Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; g[k] = v; };
  const doc = {
    createElement: function (t) { return new WlNode(t); },
    createTextNode: function (text) { var n = new WlNode("#text"); n.textContent = String(text); return n; },
    body: new WlNode("body")
  };
  put("document", doc);
  put("MSUi", require("../www/ui.js"));
  put("MSStr", require("../www/strings.js"));
  put("MSWatchlistModel", require("../www/watchlist-model.js"));
  put("MSTickerPicker", require("../www/ticker-picker.js"));
  put("MSApi", opts.api || { loadTicker: function () { return Promise.reject(new Error("unused in this test")); } });
  put("MSStore", opts.store);
  put("MSApp", { current: function () { return { params: {} }; }, go: function () {} });
  put("MSWalletScreen", { pill: function () { return new WlNode("span"); }, refreshPills: function () {} });
  put("MSScan", { createScanner: function () { return { run: function () { return Promise.resolve({ done: 0 }); } }; } });
  put("MSWallet", { costOf: function () { return 0; } });
  return { saved: saved, doc: doc };
}
function restoreGlobals(saved) {
  const g = globalThis;
  Object.keys(saved).forEach(k => { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; });
}
function withWatchlistDom(opts, fn) {
  const { saved, doc } = setupWatchlistGlobals(opts);
  try { return fn(new WlNode("div"), doc); }
  finally { restoreGlobals(saved); }
}
// 위 withWatchlistDom 은 동기 전제다(onboarding.test.mjs 의 withDom 과 같은 함정) — fn 이 비동기면
// try { return fn(...) } finally { 복구 } 에서 fn 의 await 가 끝나기 전에 finally 가 먼저 돌아
// document/MSStore 가 사라진다. 오타 제안 테스트는 flush() 를 기다려야 하므로 별도 async 버전을 쓴다.
async function withWatchlistDomAsync(opts, fn) {
  const { saved, doc } = setupWatchlistGlobals(opts);
  try { return await fn(new WlNode("div"), doc); }
  finally { restoreGlobals(saved); }
}
function flush() { return new Promise(function (r) { setTimeout(r, 0); }); }

// 뮤테이션 (a): 시트를 document.body 대신 워치리스트 자신의 DOM(root/scr) 안에 붙이면 여기서 잡힌다 —
// 실행해서 확인했다: openAddSheet 안의 `document.body.appendChild(scrim)` 을 `root.appendChild(scrim)` 로
// 바꿔 돌려보니 아래 "root 안에는 없다" 단언과 "재렌더 후에도 살아있다" 단언이 둘 다 실패했다(되돌림).
test("watchlist.js 실행 — ＋Add 시트는 document.body 에 붙고, 워치리스트 재렌더 후에도 살아남는다", () => {
  withWatchlistDom({ store: fakeStore([{ sym: "AAPL", name: "Apple" }]) }, function (root, doc) {
    MSWatchlist.render(root);
    var addBtnEl = root.querySelector(".wl-add");
    assert.ok(addBtnEl, "Add 버튼이 없다");
    addBtnEl.dispatch("click");

    var sheet = doc.body.querySelector(".sheet-scrim");
    assert.ok(sheet, "시트가 document.body 에 없다");
    assert.strictEqual(sheet.parentNode, doc.body, "시트의 부모가 document.body 가 아니다");
    assert.strictEqual(root.querySelector(".sheet-scrim"), null,
      "시트가 워치리스트 자신의 DOM 트리 안에도 들어 있다 — root.innerHTML='' 재렌더가 지운다");

    // 워치리스트가 다시 그려져도(drawShell 재호출과 같은 경로) 열려 있는 시트는 그대로 남아야 한다.
    MSWatchlist.render(root);
    assert.strictEqual(doc.body.querySelector(".sheet-scrim"), sheet,
      "워치리스트 재렌더가 열려 있던 시트를 지웠다");
  });
});

// 뮤테이션 (b): onChange 안에서 `onAdded()`(=drawShell) 호출을 빼면 여기서 잡힌다 — 실행해서 확인했다:
// 그 줄을 지우고 돌려보니 MSStore.addTicker 는 불렸는데(스토어에는 NVDA 가 있음) 화면의 .wl-meta 목록엔
// 여전히 AAPL 하나뿐이었다(아래 마지막 단언 실패, 되돌림). 스토어에 값이 들어간 것과 사용자 눈에
// 보이는 것은 별개라는 걸 실행으로 잡는다.
// 시안 14a 재스킨으로 심볼은 .wl-sym 이 아니라 .wl-meta 에 그려진다(위 = 회사명 .wl-title,
// 아래 = "심볼[· 상태]" .wl-meta). 이 fakeStore 는 allScans() 가 항상 {} 라 rec 이 없고,
// 상태 접미사도 안 붙어 .wl-meta 텍스트는 심볼 그대로다.
test("watchlist.js 실행 — 종목을 고르면 시트가 닫히고, 새 심볼이 재렌더된 목록에 실제로 나타난다", () => {
  withWatchlistDom({ store: fakeStore([{ sym: "AAPL", name: "Apple" }]) }, function (root, doc) {
    MSWatchlist.render(root);
    root.querySelector(".wl-add").dispatch("click");

    var grid = doc.body.querySelector(".tp-grid");
    assert.ok(grid, "피커 그리드가 시트 안에 없다");
    var cell = grid.children.filter(function (c) { return c.getAttribute("data-sym") === "NVDA"; })[0];
    assert.ok(cell, "NVDA 셀이 없다");
    grid.dispatch("click", { target: cell });   // ticker-picker.js 는 grid 자신에 위임 리스너를 둔다

    assert.strictEqual(doc.body.querySelector(".sheet-scrim"), null, "종목을 고른 뒤에도 시트가 안 닫혔다");
    var syms = root.querySelectorAll(".wl-meta").map(function (n) { return n.textContent; });
    assert.ok(syms.indexOf("NVDA") >= 0, "새로 추가한 심볼이 재렌더된 목록에 없다: " + syms.join(","));
    assert.ok(syms.indexOf("AAPL") >= 0, "기존 종목이 재렌더 후 사라졌다: " + syms.join(","));
  });
});

// 회사명을 버리고 심으면(addTicker(sym, "")) store.js 가 name = 심볼로 폴백해 두 가지가 조용히
// 죽는다: 행이 심볼을 두 번 찍고(wl-title·wl-meta), 회사명 검색이 이 종목만 빠진다
// (watchlist-model.filter 는 it.name 을 본다). 화면에 그려진 두 칸을 직접 비교한다 —
// 소스 검사로는 인자 하나가 ""인지 실제 이름인지 구별이 안 된다.
test("watchlist.js 실행 — 추가한 종목이 회사명을 달고 그려지고, 회사명으로 검색된다", () => {
  var list = [{ sym: "AAPL", name: "Apple Inc." }];
  withWatchlistDom({ store: fakeStore(list) }, function (root, doc) {
    MSWatchlist.render(root);
    root.querySelector(".wl-add").dispatch("click");
    var grid = doc.body.querySelector(".tp-grid");
    grid.dispatch("click", { target: grid.children.filter(function (c) {
      return c.getAttribute("data-sym") === "NVDA"; })[0] });

    var added = list.filter(function (x) { return x.sym === "NVDA"; })[0];
    assert.ok(added, "NVDA 가 스토어에 안 들어갔다");
    assert.strictEqual(added.name, "NVIDIA",
      "이름이 심볼로 폴백했다 — 피커가 회사명을 안 넘겼다: " + added.name);

    var syms = root.querySelectorAll(".wl-meta").map(function (n) { return n.textContent; });
    var names = root.querySelectorAll(".wl-title").map(function (n) { return n.textContent; });
    var i = syms.indexOf("NVDA");
    assert.ok(i >= 0, "새 심볼이 목록에 없다");
    assert.strictEqual(names[i], "NVIDIA", "행에 그려진 회사명이 틀렸다: " + names[i]);
    assert.notStrictEqual(names[i], syms[i], "행이 심볼을 두 번 찍는다: " + syms[i] + " / " + names[i]);

    // 회사명 검색. 사용자가 "nvidia" 를 치면 이 종목이 나와야 한다.
    var WM = require("../www/watchlist-model.js");
    assert.deepStrictEqual(WM.filter(list, { query: "nvidia", chip: "all" }).map(function (x) { return x.sym; }),
      ["NVDA"], "회사명으로 검색이 안 된다");
  });
});

// 스크림 바깥 클릭(자기 자신)과 닫기 버튼 둘 다 오버레이를 완전히 지워야 한다 — 하나만 지우고
// document.body 에 빈 스크림이 남으면 화면 전체가 클릭을 못 받는 유령 오버레이가 된다.
test("watchlist.js 실행 — 스크림 클릭·닫기 버튼 모두 시트를 지우고 오버레이를 안 남긴다", () => {
  withWatchlistDom({ store: fakeStore([{ sym: "AAPL", name: "Apple" }]) }, function (root, doc) {
    MSWatchlist.render(root);

    root.querySelector(".wl-add").dispatch("click");
    var scrim = doc.body.querySelector(".sheet-scrim");
    assert.ok(scrim);
    scrim.dispatch("click", { target: scrim });   // 바깥(스크림 자신) 클릭
    assert.strictEqual(doc.body.querySelector(".sheet-scrim"), null, "스크림 클릭으로 안 닫혔다");
    assert.strictEqual(doc.body.children.length, 0, "닫은 뒤에도 document.body 에 남은 노드가 있다");

    root.querySelector(".wl-add").dispatch("click");
    scrim = doc.body.querySelector(".sheet-scrim");
    var x = scrim.querySelector(".sheet-x");
    assert.ok(x, "닫기 버튼(×)이 없다");
    x.dispatch("click");
    assert.strictEqual(doc.body.querySelector(".sheet-scrim"), null, "닫기 버튼으로 안 닫혔다");
    assert.strictEqual(doc.body.children.length, 0, "닫은 뒤에도 document.body 에 남은 노드가 있다");
  });
});

// 오타 제안은 이제 시트 안(피커)에 있다 — watchlist.js 는 이 경로를 전혀 모른다.
// 8a 백로그의 "빈 워치리스트에서 오타 제안이 안 뜬다" 항목이 이걸로 해소됐다는 것을 실행으로 확인한다.
test("watchlist.js 실행 — 시트 안 직접 입력에서 오타면 후보가 뜬다(워치리스트가 빈 상태에서도)", async () => {
  var err = new Error("notfound");
  err.notfound = true;
  err.suggest = [{ s: "AAPL" }, { s: "AMZN" }];
  var api = { loadTicker: function () { return Promise.reject(err); } };
  await withWatchlistDomAsync({ store: fakeStore([]), api: api }, async function (root, doc) {
    MSWatchlist.render(root);
    // 빈 워치리스트 화면에도 addBtn() 이 그려진다(drawShell 의 !list.length 분기).
    var addBtnEl = root.querySelector(".wl-add");
    assert.ok(addBtnEl, "빈 목록에서 Add 버튼이 없다");
    addBtnEl.dispatch("click");

    var input = doc.body.querySelector(".tp-input");
    var tpAddBtn = doc.body.querySelector(".tp-add");
    assert.ok(input && tpAddBtn, "피커의 직접 입력 UI 가 시트 안에 없다");
    input.value = "aaply";
    tpAddBtn.dispatch("click");
    await flush();

    var msg = doc.body.querySelector(".tp-msg");
    assert.ok(msg.textContent.indexOf("AAPL") >= 0 && msg.textContent.indexOf("AMZN") >= 0,
      "오타 후보 안내가 시트 안에 없다: " + msg.textContent);
    assert.ok(doc.body.querySelector(".sheet-scrim"), "실패했는데 시트가 닫혔다");
  });
});

// ── 지갑 화면 DOM 실행 테스트 (Phase 8c: 구글 로그인 행) ──────────────────────────
// 위 소스-모양 테스트들과 이유가 다르다: "로그인 전엔 로그인 행, 후엔 로그아웃 행" 같은
// 요구사항은 실제로 무엇이 그려졌는가의 문제라 소스 검사로는 빈 화면과 정상 화면을 구분
// 못한다(onboarding.test.mjs 1·2단계와 같은 이유). screens/wallet.js 도 watchlist.js 처럼
// UMD 가 아니라 require 시점에 곧바로 window.MSWalletScreen 을 실행한다 — 위 MSWatchlist 캡처와
// 같은 요령을 쓴다.
const MSWalletScreen = (function () {
  var hadWindow = Object.prototype.hasOwnProperty.call(global, "window");
  var prevWindow = global.window;
  global.window = global;
  require("../www/screens/wallet.js");
  var got = global.MSWalletScreen;
  delete global.MSWalletScreen;
  if (hadWindow) global.window = prevWindow; else delete global.window;
  return got;
})();

const S = require("../www/strings.js");

// w_merge(wallet-lib.php)는 이 기기의 잔량을 버릴 뿐 구글 계정으로 옮기지 않는다 — 구글
// 계정 쪽 잔량은 그 계정 자신의 기존 총량이다. 옛 문구("This device's Scoops now live on
// your Google account")는 버린 수량이 그대로 넘어간 것처럼 읽혔다(2026-08-15 리뷰 지적).
// DOM 을 안 세워도 되는 순수 문자열 검사라 여기서 바로 한다.
// 태스크 6(지갑 재스킨)에서 wMerged 가 한국어로 번역되며 이 가드도 함께 옮겼다 — "merged into"
// 영문 대신 그 번역어("계정으로 넘어갔습니다")를 확인한다. 지키는 대상(액수를 암시하지 않고
// 계정이 바뀌었다는 사실만 말한다)은 그대로다.
test("wMerged — 버린 잔량이 그대로 넘어간 것처럼 말하지 않는다", () => {
  var v = S.t.wMerged;
  assert.doesNotMatch(v, /그대로.*(넘어갔|옮겨갔|살아있)/,
    "옛 과장 문구처럼 버린 수량이 그대로 넘어간 것처럼 읽힌다");
  assert.match(v, /계정으로 넘어갔습니다/,
    "계정이 바뀌었다는 사실만 말해야 하는데('계정으로 넘어갔습니다') 그 표현이 없다");
});

// 재스킨(시안 10b)이 adQuick/adFull 을 리터럴로 되돌리지 않았는지 소스 모양으로 확인한다 —
// 위 DOM 테스트들(reward 7/42 반영 등)이 이미 실행으로 보지만, 소스 자체가 adCfg.*.reward 를
// 계속 참조하는지도 못박아 둔다(리뷰 I3 재발 방지).
test("광고 보상 수치는 여전히 설정에서 온다 — 리터럴로 되돌아가지 않았다", () => {
  assert.match(WALLET_SCR, /adCfg\.quick\.reward/, "quick 보상이 설정에서 오지 않는다");
  assert.match(WALLET_SCR, /adCfg\.full\.reward/, "full 보상이 설정에서 오지 않는다");
  // 좁힌 범위(리뷰 지시 2026-08-16): 파일 전체가 아니라 adQuick/adFull(그리고 같은 명명
  // 관례를 따르는 미래의 세 번째 광고 행)을 만드는 earnRow(...) 호출 줄만 본다. 파일 전체를
  // 보면 adConfig() 와 무관한 고정 보상(출석 체크인의 상시 +1, SPEC-economy §1)까지 걸려
  // 오탐한다 — 그 오탐을 "+" + 1 로 피했더니 이번엔 진짜 회귀(미래의 "+" + 3 같은 하드코딩)도
  // 못 잡는 가드가 됐다(실행으로 확인됨). 두 양성 단언(adCfg.*.reward 존재)이 핵심 위험을 이미
  // 덮고, 이 음성 단언은 나중에 리터럴을 낀 세 번째 광고 행이 추가되는 것만 잡으면 된다.
  const adRowLines = WALLET_SCR.split("\n").filter(l => /earnRow\(MSStr\.t\.ad\w+/.test(l));
  assert.ok(adRowLines.length >= 2,
    "adQuick/adFull 을 만드는 earnRow(...) 호출을 찾지 못했다 — 가드 범위 산정이 틀렸다");
  adRowLines.forEach(l => {
    assert.doesNotMatch(l, /["'`]\+[13]["'`]/,
      "광고 행 보상이 리터럴로 박혔다 — 콘솔·ad_units.json·문자열 세 곳이 한 숫자의 진실원이 된다: " + l.trim());
  });
});

// 텍스트로 노드를 찾는다 — MSUi.el() 이 leaf 노드에 라벨을 textContent 로 직접 심으므로
// (자식 없이) 자기 자신의 텍스트만 비교하면 된다. WlNode(위)는 watchlist DOM 테스트가 이미
// 쓰는 스텁(createElement/appendChild/classList/textContent)이라 새로 만들지 않는다.
function findText(root, text) {
  return root.find(function (n) { return n !== root && n.textContent === text; });
}

function fakeMSWallet() {
  return {
    COSTS: { full: 3, custom: 5, slot: 1, scan: 2 },
    get: function () {
      return Promise.resolve({ ok: true, state: { balance: 5, cap: 20, streakDays: 2, canCheckin: true } });
    },
    checkin: function () {
      return Promise.resolve({ ok: true, state: { balance: 6, cap: 20, streakDays: 3, canCheckin: false },
                               granted: 1, capped: false });
    },
    authStart: function () { return Promise.resolve({ ok: false, reason: "auth-disabled" }); },
    authPoll: function () { return Promise.resolve({ ok: false, pending: false, reason: "network" }); },
    signOut: function () {},
    signedIn: function () { return false; },
    // 광고(Phase 8d) — 기본값은 "서버에 ad_units.json 이 없다"다. 광고를 실제로 쓰는 테스트만
    // adConfig/adState 를 덮어쓴다 — 그 외 기존(로그인·체크인) 테스트는 광고 줄이 안 보이는
    // 채로 그대로 통과해야 한다(무관한 회귀가 안 생기게).
    adConfig: function () { return Promise.resolve({ ok: false, reason: "ads-disabled" }); },
    adState: function () { return Promise.resolve({ ok: false, remaining: 0, nextAt: null }); }
  };
}

// MSAds 파사드의 가짜. available()=true(플러그인이 있다고 가정) 지만 privacyOptionsRequired 는
// 기본 false — 재열람 지역이 아닌 것이 기본이라, 이 필드를 안 건드리는 테스트에선 설정 행이
// 안 뜨는 게 맞다. show() 의 기본값은 "안 떴다"다 — 실제로 광고를 보는 테스트만 shown:true 로
// 덮어쓴다.
function fakeMSAds() {
  return {
    available: function () { return true; },
    install: function () { return null; },
    init: function () { return Promise.resolve(null); },
    show: function () { return Promise.resolve({ shown: false, reason: "unavailable" }); },
    consentNeeded: function () { return Promise.resolve(false); },
    showConsent: function () { return Promise.resolve(true); },
    privacyOptionsRequired: function () { return Promise.resolve(false); },
    showPrivacyOptions: function () { return Promise.resolve(true); }
  };
}

function setupWalletGlobals() {
  const g = globalThis;
  const saved = {};
  const put = (k, v) => { saved[k] = Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; g[k] = v; };
  // querySelectorAll(".ms-pill") — refreshPills() 는 checkin() 성공 뒤 항상 불린다(2단 화면의
  // 옆 칸 필 갱신용). 이 하네스엔 필이 없으니 빈 배열이면 충분하다 — 없으면 merged/체크인
  // 흐름을 도는 테스트마다 TypeError 로 죽는다(실제로 처음엔 그렇게 죽었다).
  put("document", {
    createElement: function (t) { return new WlNode(t); },
    querySelectorAll: function () { return []; }
  });
  put("window", { open: function () {} });
  put("MSUi", require("../www/ui.js"));
  put("MSStr", S);
  put("MSApp", { go: function () {}, current: function () { return { params: {} }; } });
  const W = fakeMSWallet();
  put("MSWallet", W);
  const A = fakeMSAds();
  put("MSAds", A);
  return { saved: saved, W: W, A: A };
}
function restoreWalletGlobals(saved) {
  const g = globalThis;
  Object.keys(saved).forEach(function (k) { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; });
}
// render() 는 즉시 MSWallet.get().then(draw) 를 걸어 둔다(잔량 비동기 로드) — finally 의 전역
// 복구가 그 마이크로태스크보다 먼저 돌면, 나중에 그 콜백이 이미 지워진 MSUi/document 를 참조해
// 엉뚱한(나중) 테스트 실행 중에 처리되지 않은 reject 로 터진다(watchlist.js 의
// withWatchlistDomAsync 머리말과 같은 함정). 그래서 항상 async 로 열고, 안에서 최소 한 번
// flush() 로 그 체인을 다 비운 뒤에만 복구한다 — 동기 버전은 따로 두지 않는다.
async function withWalletDom(fn) {
  const { saved, W, A } = setupWalletGlobals();
  try { return await fn(new WlNode("div"), W, A); }
  finally { restoreWalletGlobals(saved); }
}
// 광고 시청 후 잔량 폴링(AD_POLL_MS=2000 × AD_POLL_LIMIT=5)을 실제로 10초 기다리지 않고
// 끝까지 돌린다. setTimeout 지연을 이 구간에서만 0 으로 접어 실행하고, 매 회 예약되는 다음
// setTimeout 을 흘려보내기 위해 flush() 를 여러 차례 반복한다(재렌더 고아 루프 테스트가
// 이미 쓰던 "예약된 콜백을 손으로 발화" 요령의 자동화 버전).
async function flushPolling() {
  const real = global.setTimeout;
  global.setTimeout = function (fn) { return real(fn, 0); };
  try {
    for (let i = 0; i < 12; i++) await flush();
  } finally {
    global.setTimeout = real;
  }
}

test("지갑 화면 — 로그인 전엔 로그인 행, 후엔 로그아웃 행", async () => {
  await withWalletDom(async (root, W) => {
    W.signedIn = function () { return false; };
    MSWalletScreen.render(root);
    await flush();
    assert.ok(findText(root, S.t.wSignIn), "로그인 행이 없다");

    W.signedIn = function () { return true; };
    MSWalletScreen.render(root);
    await flush();
    assert.ok(findText(root, S.t.wSignOut), "로그아웃 행이 없다");
    assert.ok(!findText(root, S.t.wSignIn), "로그인·로그아웃 행이 동시에 떴다");
  });
});

// 전체 브랜치 리뷰(실행으로 확인됨): 로그아웃 클릭 핸들러가 클로저의 옛 state 를 그대로
// draw(state,"") 에 넘겨 재사용했다 — 잔량 12로 로그인해 있다가 로그아웃해도 화면은 계속
// 12를 보여줬고 get() 은 0번 불렸다. 소스가 아니라 get() 호출 횟수를 직접 스파이해서 본다.
test("로그아웃하면 옛 잔량을 재사용하지 않고 다시 조회한다", async () => {
  await withWalletDom(async (root, W) => {
    var getCalls = 0;
    var signedIn = true;
    W.signedIn = function () { return signedIn; };
    W.signOut = function () { signedIn = false; };
    W.get = function () {
      getCalls++;
      return signedIn
        ? Promise.resolve({ ok: true, state: { balance: 12, cap: 20, streakDays: 5, canCheckin: false } })
        : Promise.resolve({ ok: true, state: { balance: 0, cap: 20, streakDays: 0, canCheckin: true } });
    };
    MSWalletScreen.render(root);
    await flush();
    assert.strictEqual(getCalls, 1, "최초 렌더가 get() 을 정확히 한 번 불러야 한다 — 테스트 전제가 틀렸다");
    assert.ok(findText(root, "12"), "로그인 상태의 잔량(12)이 화면에 없다");

    findText(root, S.t.wSignOut).dispatch("click");
    await flush();

    assert.ok(getCalls >= 2,
      "로그아웃 후 get() 을 다시 안 불렀다 — 옛 잔량을 재사용한 화면을 그대로 보여준다: " + getCalls);
    assert.ok(!findText(root, "12"), "로그아웃 후에도 옛 잔량(12)이 그대로 남아 있다");
    assert.ok(findText(root, "0"), "로그아웃 후 새로 받아온 잔량(0)이 화면에 없다");

    // 출석 행도 새로 받아온 canCheckin 을 따라야 한다 — 옛 값(비활성) 그대로면 눌러도 항상 실패한다.
    var checkinRow = findText(root, S.t.walCheckin).parentNode.parentNode;
    assert.ok(!checkinRow.classList.contains("is-off"),
      "로그아웃 후 canCheckin 이 갱신됐는데 출석 행이 여전히 비활성이다 — 옛 state 를 그리고 있다");
  });
});

// 전체 브랜치 리뷰(실행으로 확인됨): 체크인이 merged 로 거절돼도 화면은 모든 !r.ok 를
// walUnavailable("연결을 확인하라")로 뭉뚱그렸다 — 연결 문제가 아니라 지갑이 구글 계정으로
// 넘어간 것이라, 사용자에게는 "로그아웃했더니 스쿱이 사라졌다"로 읽힌다.
test("체크인이 merged 로 거절되면 연결 문제가 아니라 계정 이전을 사실대로 말한다", async () => {
  await withWalletDom(async (root, W) => {
    W.get = function () {
      return Promise.resolve({ ok: true, state: { balance: 0, cap: 20, streakDays: 0, canCheckin: true } });
    };
    W.checkin = function () {
      return Promise.resolve({ ok: false, reason: "merged", granted: 0, capped: false,
        state: { balance: 0, cap: 20, streakDays: 0, canCheckin: false } });
    };
    MSWalletScreen.render(root);
    await flush();
    var checkinRow = findText(root, S.t.walCheckin).parentNode.parentNode;
    checkinRow.dispatch("click");
    await flush();

    assert.ok(findText(root, S.t.wMerged), "merged 사유를 사실대로 안내하지 않았다");
    assert.ok(!findText(root, S.t.walUnavailable),
      "merged 인데 '연결을 확인하라'는 문구를 보였다 — 옮겨졌을 뿐인 잔량을 잃어버린 것처럼 읽힌다");
  });
});

// 무중단 스위치. 서버에 자격증명이 없으면 눌러도 아무 일 없는 죽은 버튼이 된다.
// 리뷰 Critical 1차(실행으로 확인됨): 행은 지우면서 "Waiting for the browser…" 는 안 지워서, 서버에
// 자격증명이 없는(=오늘 모든 사용자가 겪는) 경로에서 대기 문구가 버튼도 없이 영원히 남아 있었다.
// 리뷰 2차(전체 브랜치 리뷰, 실행으로 확인됨): 1차 수정(msg.textContent="") 은 "지금 이 draw() 만"
// 고쳤을 뿐이다 — 체크인·로그아웃처럼 draw() 를 다시 부르는 아무 동작 뒤에는 authDisabled 판정을
// 기억하지 않는 조립 로직이 죽은 버튼을 또 그려 넣었다(눌러서 사라졌다가 다음 재조립에 되살아나고
// 또 눌러서 사라지는 반복). 지금은 행 대신 안정된 안내 하나로 통째로 바뀌고, 그 판정이
// render() 생애주기 동안 유지되는지까지 본다.
test("authStart 가 auth-disabled 면 로그인 섹션이 안정된 안내로 바뀌고, 이후 draw() 에도 버튼이 되살아나지 않는다", async () => {
  await withWalletDom(async (root, W) => {
    W.signedIn = function () { return false; };
    W.authStart = function () { return Promise.resolve({ ok: false, reason: "auth-disabled" }); };
    W.get = function () {
      return Promise.resolve({ ok: true, state: { balance: 5, cap: 20, streakDays: 2, canCheckin: true } });
    };
    W.checkin = function () {
      return Promise.resolve({ ok: true, capped: false,
        state: { balance: 6, cap: 20, streakDays: 3, canCheckin: false } });
    };
    MSWalletScreen.render(root);
    await flush();
    findText(root, S.t.wSignIn).dispatch("click");
    await flush();

    assert.ok(findText(root, S.t.wSignInUnavailable), "안정된 안내('지금은 로그인을 쓸 수 없다')가 안 떴다");
    assert.ok(!findText(root, S.t.wSignIn), "죽은 로그인 버튼이 남아 있다");
    assert.ok(!findText(root, S.t.wSignInWaiting), "'Waiting for the browser…' 가 버튼 없이 남아 있다");
    assert.ok(!findText(root, S.t.wSignInHint),
      "탭할 게 없는데 'Keeps your Scoops...' 힌트가 허공에 매달려 있다");

    // 체크인처럼 draw() 를 다시 부르는 아무 동작 이후에도 로그인 행이 되살아나면 안 된다.
    var checkinRow = findText(root, S.t.walCheckin).parentNode.parentNode;
    checkinRow.dispatch("click");
    await flush();

    assert.ok(findText(root, S.t.wSignInUnavailable), "재조립(체크인) 이후 안정된 안내가 사라졌다");
    assert.ok(!findText(root, S.t.wSignIn), "재조립(체크인) 이후 죽은 로그인 버튼이 되살아났다");
  });
});

// 리뷰 Important 1(실행으로 확인됨): 응답 오기 전에 두 번 누르면 authStart 가 두 번 나가 각자
// 다른 nonce 로 브라우저를 두 번 열고, 각자의 poll() 이 같은 authMsg 를 두고 경합했다.
test("응답 오기 전에 로그인 버튼을 두 번 눌러도 authStart 는 한 번만 나간다", async () => {
  await withWalletDom(async (root, W) => {
    var calls = 0, resolveAuthStart;
    W.signedIn = function () { return false; };
    W.authStart = function () {
      calls++;
      return new Promise(function (resolve) { resolveAuthStart = resolve; });
    };
    MSWalletScreen.render(root);
    await flush();
    var btn = findText(root, S.t.wSignIn);
    btn.dispatch("click");
    btn.dispatch("click");   // 첫 응답이 오기 전에 동기적으로 또 누른다
    assert.strictEqual(calls, 1, "authStart 가 두 번 나갔다 — 로그인 시도가 동시에 두 개 돈다: " + calls);
    resolveAuthStart({ ok: false, reason: "auth-disabled" });
    await flush();
  });
});

test("두 번째 기기 병합이면 버려진 수량을 사용자에게 말한다", async () => {
  await withWalletDom(async (root, W) => {
    W.signedIn = function () { return false; };
    W.authStart = function () { return Promise.resolve({ ok: true, authUrl: "https://x/a", nonce: "n1" }); };
    W.authPoll = function () {
      return Promise.resolve({ ok: true, pending: false, discarded: 5, state: { balance: 3 } });
    };
    MSWalletScreen.render(root);
    await flush();
    findText(root, S.t.wSignIn).dispatch("click");
    await flush();
    // "조용히 사라진 5개"가 없어야 한다 — 문의로 돌아온다.
    assert.ok(findText(root, S.t.wMergeDiscarded.replace("{n}", "5")),
      "버려진 잔량을 사용자에게 말하지 않았다");
  });
});

// device-claimed: 이 기기가 이미 다른 구글 계정에 묶여 있다 — 재시도해도 답이 바뀌지 않는
// 종결 상태다. 계속 폴링하거나 일반 실패 문구("다시 시도")를 보이면 거짓 희망을 준다 —
// 사실대로 말하고(다른 계정에 묶여 있다), 유일한 복구(재설치)를 안내해야 한다.
// 리뷰 Minor(채택, 1차): auth-disabled 와 같은 방식으로 다룬다 — 행을 지운다.
// 리뷰(2차, 2026-08-15): 1차 수정은 행만 지웠을 뿐 판정을 기억하지 않아서, auth-disabled 에서
// 이미 잡혔던 것과 같은 결함이 그대로 남아 있었다 — 체크인처럼 draw() 를 다시 부르는 아무
// 동작 뒤에 죽은 "Sign in" 버튼이 되살아났고, wSignInHint 는 그 전부터 허공에 매달려 있었다.
// 이제 auth-disabled 와 완전히 같은 방식(render 생애주기 동안 기억, 섹션 전체 교체)으로 본다.
test("authPoll 이 device-claimed 면 폴링을 멈추고 재설치를 안내하며 섹션 전체가 바뀌고, 이후 draw() 에도 버튼이 되살아나지 않는다", async () => {
  await withWalletDom(async (root, W) => {
    W.signedIn = function () { return false; };
    W.authStart = function () { return Promise.resolve({ ok: true, authUrl: "https://x/a", nonce: "n1" }); };
    W.authPoll = function () {
      return Promise.resolve({ ok: false, pending: false, reason: "device-claimed" });
    };
    MSWalletScreen.render(root);
    await flush();

    // setTimeout 스파이 — 지연시간이 아니라 "재시도를 예약했는가" 자체를 본다. POLL_MS(2000ms)를
    // 기다렸다 안 불렸는지 확인하는 방식은 "언젠가 2초 뒤에 재시도"하는 회귀를 못 잡는다
    // (관문이 그렇게 오래 기다려주지 않는다) — 예약 자체가 없어야 한다.
    var realSetTimeout = global.setTimeout;
    var scheduled = [];
    global.setTimeout = function (fn, ms) { scheduled.push(ms); return realSetTimeout(fn, ms); };
    try {
      findText(root, S.t.wSignIn).dispatch("click");
      await flush();
    } finally {
      global.setTimeout = realSetTimeout;
    }

    assert.ok(findText(root, S.t.wDeviceClaimed), "기기 잠김 안내가 없다");
    assert.ok(!findText(root, S.t.wSignInFailed),
      "일반 실패 문구('다시 시도')를 보였다 — device-claimed 는 재시도해도 소용없다");
    assert.ok(!findText(root, S.t.wSignIn),
      "device-claimed 인데 로그인 행이 그대로 남아 있다 — 다시 눌러도 같은 벽에 부딪힌다");
    assert.ok(!findText(root, S.t.wSignInHint),
      "device-claimed 인데 탭할 게 없는 'Keeps your Scoops...' 힌트가 허공에 매달려 있다");
    // flush() 자신도 setTimeout(fn,0) 을 쓰므로 0 은 허용하고, 그보다 큰(=POLL_MS 재시도) 예약만 본다.
    assert.ok(scheduled.every(function (ms) { return !ms; }),
      "device-claimed 인데 다음 폴링 setTimeout 을 예약했다: " + scheduled.join(","));

    // 체크인처럼 draw() 를 다시 부르는 아무 동작 이후에도 로그인 행이 되살아나면 안 된다 —
    // auth-disabled 에서 먼저 잡힌 것과 같은 결함(리뷰 2차 실측)이라 여기서도 반드시 본다.
    var checkinRow = findText(root, S.t.walCheckin).parentNode.parentNode;
    checkinRow.dispatch("click");
    await flush();

    assert.ok(findText(root, S.t.wDeviceClaimed), "재조립(체크인) 이후 기기 잠김 안내가 사라졌다");
    assert.ok(!findText(root, S.t.wSignIn), "재조립(체크인) 이후 죽은 로그인 버튼이 되살아났다");
  });
});

// 리뷰 Important 2(실행으로 확인됨): app.js 는 지갑 화면을 나갈 때 render() 클로저에게 알릴
// 방법이 없다(pane.innerHTML="" 로 DOM 만 지운다). 세대 카운터가 없으면, 로그인 도중 화면을
// 나갔다 돌아와도 옛 폴링 루프가 detached 노드를 향해 계속 authPoll() 을 부른다.
test("재렌더(네비게이션) 후에는 이전 폴링 루프가 authPoll 을 다시 부르지 않는다", async () => {
  await withWalletDom(async (root, W) => {
    var pollCalls = 0;
    W.signedIn = function () { return false; };
    W.authStart = function () { return Promise.resolve({ ok: true, authUrl: "https://x/a", nonce: "n1" }); };
    W.authPoll = function () {
      pollCalls++;
      return Promise.resolve({ ok: true, pending: true });   // 계속 대기 중 — 다음 폴링을 예약한다
    };

    var realSetTimeout = global.setTimeout;
    var scheduledFns = [];
    global.setTimeout = function (fn, ms) { scheduledFns.push(fn); return realSetTimeout(fn, ms); };
    try {
      MSWalletScreen.render(root);
      await flush();
      findText(root, S.t.wSignIn).dispatch("click");
      await flush();   // authStart → authPoll(1회) → pending → 다음 poll() 을 setTimeout 으로 예약
      assert.strictEqual(pollCalls, 1, "첫 authPoll 이 안 나갔다 — 테스트 전제가 틀렸다");

      // 사용자가 지갑 화면을 나갔다 돌아온다 — app.js 는 매번 MSWalletScreen.render() 를 새로
      // 부른다. 같은 root 에 다시 render() 만 불러 그 재진입을 흉내낸다.
      MSWalletScreen.render(root);
      await flush();

      // 예약돼 있던 옛 poll() 재시도를 지금 손으로 발화시킨다(2초를 실제로 기다리지 않는다).
      var stalePoll = scheduledFns[0];
      assert.ok(stalePoll, "poll 재시도가 애초에 예약되지 않았다 — 테스트 전제가 틀렸다");
      stalePoll();
      await flush();

      assert.strictEqual(pollCalls, 1,
        "재렌더 이후에도 옛 폴링 루프가 authPoll 을 또 불렀다 — 고아 루프가 안 죽었다: " + pollCalls);
    } finally {
      global.setTimeout = realSetTimeout;
    }
  });
});

// backend-error 는 authUrl/nonce 가 아예 없는 응답이다(façade 가 예외를 삼키고 이 사유만
// 채운다) — ok 를 먼저 안 보고 authUrl/nonce 를 읽으면 window.open(undefined) 을 부르거나
// 존재하지 않는 nonce 로 폴링을 시작할 수 있다.
test("authStart 가 backend-error 면 authUrl 없이도 안전하게 실패 처리한다(폴링·브라우저 오픈 없음)", async () => {
  await withWalletDom(async (root, W) => {
    var openedUrl = null, polled = false;
    global.window.open = function (u) { openedUrl = u; };
    W.signedIn = function () { return false; };
    W.authStart = function () { return Promise.resolve({ ok: false, reason: "backend-error" }); };
    W.authPoll = function () { polled = true; return Promise.resolve({ ok: false, pending: false, reason: "network" }); };
    MSWalletScreen.render(root);
    await flush();
    findText(root, S.t.wSignIn).dispatch("click");
    await flush();
    assert.strictEqual(openedUrl, null, "authUrl 없이 window.open 을 불렀다: " + openedUrl);
    assert.strictEqual(polled, false, "authUrl/nonce 없이 폴링을 시작했다");
    assert.ok(findText(root, S.t.wSignInFailed), "실패 안내가 없다");
  });
});

// 병합된(익명) 지갑은 서버가 canCheckin:false 로 이미 말해준다(wallet-lib.php w_state) — 화면이
// 그걸 무시하고 출석 행을 활성으로 그리면 눌러도 항상 실패하는(reason:"merged") 죽은 버튼이
// 된다. off 인 행엔 애초에 클릭 리스너를 안 붙이는지까지 본다 — "리스너는 있는데 안 눌러봤다"
// 와 "애초에 탭할 수 없다"는 다르다.
test("병합된 지갑(canCheckin:false)의 출석 행은 비활성이고 탭 리스너가 없다", async () => {
  await withWalletDom(async (root, W) => {
    W.get = function () {
      return Promise.resolve({ ok: true, state: { balance: 3, cap: 20, streakDays: 4, canCheckin: false } });
    };
    MSWalletScreen.render(root);
    await flush();
    // streakDays:4>0 인데 canCheckin:false 라, 이 화면은 이 상태를 "오늘 이미 받음"으로 보고
    // 헤드라인을 walCheckedInTitle("오늘 출석 완료", 시안 10b)로 바꾼다 — walCheckin("출석체크")
    // 은 아직 안 받은 상태 전용이라 이 픽스처에선 안 뜬다(2026-08-16 리뷰 지시로 상태별 헤드라인
    // 분리 후 갱신).
    var checkinNode = findText(root, S.t.walCheckedInTitle) || findText(root, S.t.walCheckin);
    assert.ok(checkinNode, "출석 행 헤드라인을 찾지 못했다(walCheckedInTitle/walCheckin 둘 다 없음)");
    var row = checkinNode.parentNode.parentNode;
    assert.ok(row.classList.contains("is-off"), "병합된 지갑인데 출석 행이 활성으로 그려졌다");
    assert.strictEqual(row.listeners.click, undefined,
      "비활성 행인데 클릭 리스너가 붙어 있다 — 탭하면 항상 실패하는 checkin 을 제공한다");
  });
});

// ── 지갑 화면 — 광고(Phase 8d, AdMob SSV) ──────────────────────────────────────
// adQuick/adFull 은 earnRow() 가 "이름 + 부제" 레이아웃으로 나눠 그린다 — checkin 행과 같은
// "행 전체가 탭 타깃"(one-tap) 패턴이라 findText() 로 잡히는 건 안쪽 라벨 leaf 다. 실제
// 클릭 리스너는 그 조부모(.wal-row)에 붙는다 — walCheckin 테스트가 이미 쓰는 요령 그대로다.
function adRow(root, label) {
  var n = findText(root, label);
  return n ? n.parentNode.parentNode : null;
}

// adQuick/adFull 은 Phase 8d 리뷰 I3 수정 이후 "{n}" 치환 템플릿이다(wMergeDiscarded 와 같은
// 관례) — wallet.js 는 adCfg[unit].reward 로 채운다. 이 파일의 광고 테스트는 전부
// quick:{reward:1}/full:{reward:3} 을 쓰므로 그 값으로 치환해 실제 렌더 텍스트를 찾는다.
function adLabel(unit, n) {
  return (unit === "quick" ? S.t.adQuick : S.t.adFull).replace("{n}", String(n));
}

test("ads-disabled(ad_units.json 없음) 면 광고 줄이 아예 없다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: false, reason: "ads-disabled" });
    MSWalletScreen.render(root);
    await flush();
    assert.ok(!findText(root, adLabel("quick", 1)), "눌러도 아무 일 없는 광고 줄이 남아 있다");
    assert.ok(!findText(root, adLabel("full", 3)), "눌러도 아무 일 없는 광고 줄이 남아 있다");
  });
});

// 뮤테이션 (a): 이 분기를 "remaining===0" 하나로 뭉치면(nextAt 을 안 보면) 이 테스트가 깨진다 —
// 실행해서 확인했다: nextAt 분기를 지우고 돌리니 이 테스트에서 adDailyDone 이 떴다(병합인데
// "내일 다시 오라"고 말한 것과 같다, 되돌림).
test("일 상한을 다 쓰면(remaining:0, nextAt 있음) 줄을 숨기지 않고 문구를 바꾼다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 0, nextAt: "2099-01-01T00:00:00Z" });
    MSWalletScreen.render(root);
    await flush();
    // 사라지면 사용자는 앱이 고장난 줄 안다(온보딩 auth-disabled 와 같은 판단)
    assert.ok(findText(root, S.t.adDailyDone), "상한 안내가 없다");
    assert.ok(!findText(root, S.t.wMerged), "일반 상한인데 병합 문구를 보였다");
  });
});

// 계약 ②(태스크 지시): remaining:0 + nextAt:null = 이 기기의 지갑이 구글 계정으로 넘어가
// 얼어붙었다는 뜻이지 "오늘 8개를 다 썼다"가 아니다. adDailyDone("오늘은 여기까지")을 보이면
// 병합된 사용자에게 "내일 다시 오라"고 거짓 희망을 준다.
test("병합된 지갑(remaining:0, nextAt:null)은 '오늘 다 썼다'가 아니라 계정 이전을 말한다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 0, nextAt: null });
    MSWalletScreen.render(root);
    await flush();
    assert.ok(findText(root, S.t.wMerged), "병합 사유를 사실대로 안내하지 않았다");
    assert.ok(!findText(root, S.t.adDailyDone),
      "병합된 지갑에게 '오늘은 여기까지'(내일 다시 오라)라고 말했다 — 지갑은 다시 안 열린다");
  });
});

test("낱개 시청 쿨다운 중(remaining>0, nextAt 이 가까운 미래)이면 분 단위 안내로 바뀐다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 5, nextAt: new Date(Date.now() + 90000).toISOString() });
    MSWalletScreen.render(root);
    await flush();
    assert.ok(findText(root, S.t.adCooldown.replace("{m}", "2")), "쿨다운 분 안내가 없다(90초→2분 올림)");
    assert.ok(!findText(root, adLabel("quick", 1)), "쿨다운 중인데 광고 줄이 그대로 남아 있다");
  });
});

// ── 리뷰 Critical(실행으로 확인됨, 2026-08-16): adState() 의 network/backend 실패 모양이
// {ok:false, remaining:0, nextAt:null} 이고(wallet-http.js), 이건 "병합돼 얼어붙었다"
// (remaining:0 + nextAt:null, ok:true)와 **필드만 보면 완전히 같다.** adSt.ok 를 안 보고
// remaining/nextAt 만 보면 흔한 일시적 실패가 "지갑이 구글 계정으로 넘어갔다"는 확정적
// 거짓말이 된다 — 계약 ②가 막으려던 결함의 거울상이다.
test("adState() 가 network 실패해도(merged 와 같은 모양) 병합됐다고 말하지 않는다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    // wallet-http.js 의 adState() 가 실패 시 그대로 내는 모양 — ok 만 다르고 나머지 필드는
    // 병합 상태와 동일하다.
    W.adState = () => Promise.resolve({ ok: false, remaining: 0, nextAt: null });
    MSWalletScreen.render(root);
    await flush();
    assert.ok(!findText(root, S.t.wMerged),
      "adState() 가 실패했을 뿐인데(ok:false) 병합됐다고 말했다 — 실패 모양이 merged 와 같아서 생긴 결함");
    assert.ok(findText(root, S.t.walUnavailable), "실패했으면 확인 불가를 사실대로 말해야 한다");
    assert.ok(!findText(root, S.t.adDailyDone), "실패했을 뿐인데 '오늘은 다 썼다'고도 말했다");
    assert.ok(!findText(root, adLabel("quick", 1)), "잔량 상태를 모르는데 광고 줄을 그대로 그렸다");
  });
});

// 최종 리뷰(I1, 실행으로 확인됨): 최초 MSWallet.get() 이 실패해도 adConfig/adState 는 독립된
// 별개 요청이라 성공할 수 있다 — 그러면 lastState 는 null 인 채로 광고 줄만 그려지고,
// watchAd() 의 before(= lastState ? balance : 0)가 0으로 지어내진다. 첫 폴링이 아무 실
// 잔량(예: 5)이나 만나면 "5 > 0" 이 참이 되어, 아무것도 확인되지 않은 시청이 성공으로
// 처리된다 — 15초를 본 사용자에게 아무 말도 없이 화면이 조용히 넘어간다. 수정은 state 가
// 없으면 광고 줄 자체를 그리지 않는 것이다(watchAd() 안에서 막는 대안도 있었지만, 기준점 없는
// 시청을 애초에 시작 못 하게 하는 편이 이 파일의 기존 관례 — 죽은 버튼 대신 없는 행 — 와 맞다).
test("최초 잔량 로드가 실패하면 adConfig/adState 가 성공해도 광고 줄을 그리지 않는다(before 기준점이 없다)", async () => {
  await withWalletDom(async (root, W, A) => {
    W.get = () => Promise.resolve({ ok: false });
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    A.show = () => Promise.resolve({ shown: true, reason: "" });
    MSWalletScreen.render(root);
    await flush();
    assert.ok(!adRow(root, adLabel("quick", 1)),
      "잔량을 못 읽었는데(state==null) 광고 줄을 그렸다 — before 기준점 없이 시청이 시작될 수 있다");
    assert.ok(!adRow(root, adLabel("full", 3)), "잔량을 못 읽었는데 Full 광고 줄을 그렸다");
    // walUnavailable 메시지 자체의 지속 여부는 여기서 안 본다 — get() 실패 draw()와 adConfig
    // 초기화 체인의 마지막 draw(lastState, "")가 어느 쪽이 나중에 도는지에 따라 메시지 칸이
    // 비워질 수 있는 별개의(더 오래된, 이 태스크 범위 밖의) 경합이다. I1 이 고치는 것은
    // "광고 줄이 기준점 없이 그려지는가"뿐이다.
  });
});

// 최종 리뷰(I2, 실행으로 확인됨): 잔량이 이미 상한(before>=cap)일 때 시청하면 서버 w_ad_grant
// 는 granted:0 으로 조용히 버리고 일일 슬롯만 소모한다 — 잔량은 절대 before 를 못 넘으므로
// 폴링은 timeout 까지 실패로만 보인다. 옛 코드는 이 경우도 adPending("아직 안 왔다. 곧 올
// 것이다")을 그대로 냈다 — 이미 도착해서 버려진 보상을 "아직" 이라고 말하는 거짓이었고, 상한에
// 걸린 사용자는 8개 일일 슬롯을 전부 "곧 온다"는 말을 들으며 태울 수 있었다. 아래 두 테스트를
// 함께 둔다 — 하나만 보면 "항상 walCapped 로 바꿨다"는 뮤테이션도 초록일 수 있다.
test("잔량이 이미 상한이면 폴링 시간 초과 시 '상한 도달'을 말한다(대기 중이라 하지 않는다)", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    W.get = () => Promise.resolve({ ok: true, state: { balance: 20, cap: 20, streakDays: 1, canCheckin: true } });
    A.show = () => Promise.resolve({ shown: true, reason: "" });
    MSWalletScreen.render(root);
    await flush();
    adRow(root, adLabel("quick", 1)).dispatch("click");
    await flushPolling();
    assert.ok(findText(root, S.t.walCapped),
      "상한에서 시청했는데(before>=cap) 시간 초과 뒤에도 상한 도달을 말하지 않았다");
    assert.ok(!findText(root, S.t.adPending),
      "상한에서 시청한 보상은 이미 버려졌는데 '아직 안 왔다'는 거짓 대기 안내를 냈다");
  });
});

test("잔량이 상한 아래면 폴링 시간 초과 시 여전히 대기 안내(adPending)를 말한다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    W.get = () => Promise.resolve({ ok: true, state: { balance: 5, cap: 20, streakDays: 1, canCheckin: true } });
    A.show = () => Promise.resolve({ shown: true, reason: "" });
    MSWalletScreen.render(root);
    await flush();
    adRow(root, adLabel("quick", 1)).dispatch("click");
    await flushPolling();
    assert.ok(findText(root, S.t.adPending), "상한 아래(before<cap)인데 시간 초과 대기 안내가 없다");
    assert.ok(!findText(root, S.t.walCapped), "상한이 아닌데 '상한 도달'을 말했다 — 두 경로가 뒤섞였다");
  });
});

// 최종 리뷰(I3, 실행으로 확인됨): adQuick/adFull 이 "+1"/"+3" 문자열 리터럴이면, 표시 금액·
// ad_units.json·AdMob 콘솔 reward_amount 세 곳이 독립된 진실원이 된다 — 운영이 콘솔 기본값
// 1로 두 유닛을 다 만들면 화면은 영원히 +3 을 약속하고 원장은 1만 지급한다. adCfg[unit].reward
// 를 렌더에 반영해 리터럴을 없앤다.
test("광고 표시 금액은 adConfig() 의 reward 값을 그대로 반영한다(문자열 리터럴이 아니다)", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 7 }, full: { unitId: "f", reward: 42 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    MSWalletScreen.render(root);
    await flush();
    assert.ok(findText(root, adLabel("quick", 7)), "quick 표시 금액이 adConfig().quick.reward(7)를 반영하지 않았다");
    assert.ok(findText(root, adLabel("full", 42)), "full 표시 금액이 adConfig().full.reward(42)를 반영하지 않았다");
    assert.ok(!findText(root, S.t.adQuick), "치환 안 된 원본 템플릿('+{n}')이 그대로 남아 있다");
    assert.ok(!findText(root, adLabel("quick", 1)), "reward 를 무시하고 옛 하드코딩 값(+1)을 그렸다");
  });
});

// 같은 결함의 두 번째 발현 지점 — afterAd() 의 사후 adState() 재조회. 광고를 보고 실제로
// 크레딧된 직후, 그 부가 재조회 하나가 hiccup 나면 이전(정상)의 adSt 를 지켜야 한다 —
// 방금 상을 받은 사용자에게 "지갑이 얼어붙었다"고 말하는 것이 가장 나쁘다.
test("광고로 크레딧된 직후 adState() 재조회가 실패해도 병합됐다고 말하지 않는다(이전 상태를 지킨다)", async () => {
  await withWalletDom(async (root, W, A) => {
    var adStateCalls = 0;
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => {
      adStateCalls++;
      // 1회차 = 최초 로드(정상). 2회차 = 광고 시청 뒤 afterAd() 의 재조회 — 여기서 hiccup 난다.
      if (adStateCalls === 1) return Promise.resolve({ ok: true, remaining: 8, nextAt: null });
      return Promise.resolve({ ok: false, remaining: 0, nextAt: null });
    };
    var getCalls = 0;
    W.get = () => {
      getCalls++;
      var bal = getCalls === 1 ? 5 : 6;   // 최초 로드=5, 광고 후 폴링부터는 6(올랐다)
      return Promise.resolve({ ok: true, state: { balance: bal, cap: 20, streakDays: 1, canCheckin: true } });
    };
    A.show = () => Promise.resolve({ shown: true, reason: "" });
    MSWalletScreen.render(root);
    await flush();
    adRow(root, adLabel("quick", 1)).dispatch("click");
    await flush();
    assert.ok(!findText(root, S.t.wMerged),
      "광고로 잔량이 오른 직후 adState() 재조회가 실패했는데(merged 와 같은 모양) 병합됐다고 말했다");
    // wMerged 부재만으로는 이 자리(afterAd 의 s.ok 가드)를 못 잡는다 — draw() 게이트의
    // !adSt.ok 분기 하나만으로도 wMerged 는 이미 안 뜬다(walUnavailable 로 대신 떨어질 뿐).
    // 이 자리가 실제로 하는 일은 "실패한 재조회로 덮어쓰지 않고 직전의 유효한 adSt(remaining:8)
    // 를 지키는 것" — 그래서 광고 줄이 여전히(재조회 실패에도 불구하고) 정상 표시돼야 한다.
    // 여기서 s.ok 가드를 빼면(if (s) adSt = s;) adSt 가 실패 모양으로 덮여 walUnavailable 로
    // 떨어지고 이 단언이 빨간불이 된다 — 실행해서 확인했다.
    assert.ok(adRow(root, adLabel("quick", 1)), "재조회 실패로 직전의 유효한 광고 상태(remaining:8)가 사라졌다");
    assert.ok(!findText(root, S.t.walUnavailable),
      "광고 시청은 이미 성공했는데 부가 재조회 hiccup 하나로 '확인 불가'로 떨어졌다");
  });
});

test("광고를 본 뒤 잔량이 오를 때까지 기다린다 — 줄어드는 순간도, 낙관적으로 오른 순간도 만들지 않는다", async () => {
  await withWalletDom(async (root, W, A) => {
    var seen = [];
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    // before(초기 로드) 도 이후 폴링도 항상 6 — 서버가 아직 지급하지 않은 상황을 흉내낸다.
    W.get = () => { seen.push("get"); return Promise.resolve({ ok: true, state: { balance: 6, cap: 20, streakDays: 1, canCheckin: true } }); };
    A.show = () => Promise.resolve({ shown: true, reason: "" });
    MSWalletScreen.render(root);
    await flush();
    adRow(root, adLabel("quick", 1)).dispatch("click");
    await flush();
    assert.ok(seen.length >= 2, "광고를 본 뒤 서버에 다시 묻지 않았다(초기 로드 1회 + 폴링 1회 이상)");
    // "7" 이 어디에도 없어야 한다 — 서버가 준 적 없는 값을 클라이언트가 계산해 그린 것이다.
    assert.ok(!findText(root, "7"), "서버가 주지도 않은 값(6+1)을 그렸다 — 낙관적 반영이다");
  });
});

test("SSV 가 안 오면(10초 안에 잔량이 그대로) 조용히 실패하지 않고 말한다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    W.get = () => Promise.resolve({ ok: true, state: { balance: 5, cap: 20, streakDays: 1, canCheckin: true } });   // 안 오른다
    A.show = () => Promise.resolve({ shown: true, reason: "" });
    MSWalletScreen.render(root);
    await flush();
    adRow(root, adLabel("quick", 1)).dispatch("click");
    await flushPolling();
    assert.ok(findText(root, S.t.adPending), "잔량이 안 올랐는데 아무 말도 안 한다");
  });
});

// show() 가 shown:false 로 답할 때(동의 차단·유닛 없음·플러그인 없음 등) — 조용히 아무 일도
// 안 하는 버튼을 남기지 않는다(태스크 계약 ④). adBusy 도 풀려 다시 탭할 수 있어야 한다.
test("광고가 아예 안 뜨면(show shown:false) 조용히 넘어가지 않고 말하며, 재시도할 수 있다", async () => {
  await withWalletDom(async (root, W, A) => {
    var calls = 0;
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    A.show = () => { calls++; return Promise.resolve({ shown: false, reason: "consent-required" }); };
    MSWalletScreen.render(root);
    await flush();
    var row = adRow(root, adLabel("quick", 1));
    row.dispatch("click");
    await flush();
    assert.ok(findText(root, S.t.adFailed), "광고가 안 떴는데 아무 안내도 없다");
    row.dispatch("click");
    await flush();
    assert.strictEqual(calls, 2, "실패 뒤 재시도가 막혀 있다(adBusy 가 안 풀렸다)");
  });
});

// 계약 ①: customData 는 화면이 가공하지 않는다 — MSAds.show(unit) 은 "quick"/"full" 문자열
// 키만 받는다. 감싸거나 조합한 인자를 넘기면(예: {unit, customData}) SSV 콜백이 조용히 버려진다.
test("광고 요청은 unit 문자열만 넘긴다 — customData 를 이 화면이 가공하지 않는다", async () => {
  await withWalletDom(async (root, W, A) => {
    var seenArgs = [];
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 }, customData: "0123456789abcdef" });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    A.show = function (u) { seenArgs.push(u); return Promise.resolve({ shown: false, reason: "unavailable" }); };
    MSWalletScreen.render(root);
    await flush();
    adRow(root, adLabel("full", 3)).dispatch("click");
    await flush();
    assert.deepStrictEqual(seenArgs, ["full"], "show() 인자가 가공됐다: " + JSON.stringify(seenArgs));
  });
});

// 리뷰가 실측한 함정과 같은 모양(로그인 버튼 연타) — 응답 오기 전에 두 번 눌러도 show() 는
// 한 번만 나가야 한다. 안 그러면 두 광고가 동시에 돌고 같은 메시지 자리를 두고 경합한다.
test("응답 오기 전에 광고 줄을 두 번 눌러도 show() 는 한 번만 나간다", async () => {
  await withWalletDom(async (root, W, A) => {
    var calls = 0, resolveShow;
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    A.show = function () { calls++; return new Promise(function (resolve) { resolveShow = resolve; }); };
    MSWalletScreen.render(root);
    await flush();
    var row = adRow(root, adLabel("quick", 1));
    row.dispatch("click");
    row.dispatch("click");   // 첫 응답이 오기 전에 동기적으로 또 누른다
    assert.strictEqual(calls, 1, "show() 가 두 번 나갔다 — 광고 시청이 동시에 두 개 돈다: " + calls);
    resolveShow({ shown: false, reason: "failed" });
    await flush();
  });
});

// app.js 는 화면을 나갈 때 render() 클로저에게 알릴 방법이 없다(pane.innerHTML="" 로 DOM 만
// 지운다) — 세대 가드가 없으면 재렌더 뒤에도 옛 폴링 루프가 detached 노드를 향해 계속 get() 을
// 부른다(로그인 폴링에서 먼저 잡힌 것과 같은 결함, 여기서도 반드시 본다).
test("재렌더(네비게이션) 후에는 이전 광고 폴링 루프가 get() 을 다시 부르지 않는다", async () => {
  await withWalletDom(async (root, W, A) => {
    var getCalls = 0;
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    W.get = function () { getCalls++; return Promise.resolve({ ok: true, state: { balance: 5, cap: 20, streakDays: 1, canCheckin: true } }); };
    A.show = () => Promise.resolve({ shown: true, reason: "" });

    var realSetTimeout = global.setTimeout;
    var scheduledFns = [];
    global.setTimeout = function (fn, ms) { scheduledFns.push(fn); return realSetTimeout(fn, ms); };
    try {
      MSWalletScreen.render(root);
      await flush();
      var before = getCalls;   // 최초 로드가 이미 get() 을 한 번 이상 불렀을 수 있다
      adRow(root, adLabel("quick", 1)).dispatch("click");
      await flush();   // show() → afterAd(get 1회, balance 그대로) → 다음 폴링을 setTimeout 으로 예약
      var afterFirstPoll = getCalls;
      assert.ok(afterFirstPoll > before, "첫 afterAd 의 get() 이 안 나갔다 — 테스트 전제가 틀렸다");

      // 사용자가 지갑 화면을 나갔다 돌아온다 — app.js 는 매번 MSWalletScreen.render() 를 새로
      // 부른다. 같은 root 에 다시 render() 만 불러 그 재진입을 흉내낸다.
      MSWalletScreen.render(root);
      await flush();

      var stalePoll = scheduledFns[scheduledFns.length - 1];   // 옛 render() 가 예약해 둔 재시도
      assert.ok(stalePoll, "폴링 재시도가 애초에 예약되지 않았다 — 테스트 전제가 틀렸다");
      var beforeStale = getCalls;
      stalePoll();
      await flush();

      assert.strictEqual(getCalls, beforeStale,
        "재렌더 이후에도 옛 광고 폴링 루프가 get() 을 또 불렀다 — 고아 루프가 안 죽었다");
    } finally {
      global.setTimeout = realSetTimeout;
    }
  });
});

test("현금 가치 없음 고지가 지갑 화면에 상시 있다", async () => {
  await withWalletDom(async (root, W, A) => {
    MSWalletScreen.render(root);
    await flush();
    // 리워드 화폐에 요구되는 문구다 — 스토어 심사가 본다(SPEC §6). 광고가 꺼져 있어도(기본
    // fakeMSWallet 은 ads-disabled) 스쿱 자체는 체크인으로 쌓이므로 조건 없이 떠야 한다.
    assert.ok(findText(root, S.t.walNoCashValue), "고지가 없다");
  });
});

// ── UMP 재열람("광고 설정") 행 — privacyOptionsRequired() 로만 켠다 ─────────────────
// 태스크 지시(계약 ③): consentNeeded() 나 폼 존재 여부가 아니라 반드시 privacyOptionsRequired()
// 다. consentNeeded 는 최초 동의 흐름용이라 이미 동의를 마친 사용자에겐 계속 false 라, 그걸로
// 게이팅하면 이미 동의한 EEA 사용자에게서 재열람 경로가 사라진다.
test("동의가 필요 없는 지역(privacyOptionsRequired:false)에선 광고 설정 행이 없다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    A.privacyOptionsRequired = () => Promise.resolve(false);
    MSWalletScreen.render(root);
    await flush();
    assert.ok(!findText(root, S.t.adSettings), "누를 것이 없는 행이 남아 있다");
  });
});

test("동의가 필요한 지역(privacyOptionsRequired:true)에선 광고 설정 행이 뜨고 재열람 폼을 연다", async () => {
  await withWalletDom(async (root, W, A) => {
    let opened = 0;
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    A.privacyOptionsRequired = () => Promise.resolve(true);
    A.showPrivacyOptions = () => { opened++; return Promise.resolve(true); };
    MSWalletScreen.render(root);
    await flush();
    const row = findText(root, S.t.adSettings);
    assert.ok(row, "동의 재열람 경로가 없다 — EEA·영국·캐나다 정책 위반이다");
    row.dispatch("click");
    await flush();
    assert.strictEqual(opened, 1, "행을 눌러도 showPrivacyOptions() 가 안 불렸다");
  });
});

// 뮤테이션 가드 — consentNeeded() 로 게이팅했다면 여기서 잡힌다: consentNeeded 는 true(=최초
// 동의가 필요)인데 privacyOptionsRequired 는 false(=재열람 대상 지역이 아니다)인 조합이다.
// 올바른 구현은 후자만 보므로 행이 없어야 한다.
test("뮤테이션 가드 — consentNeeded 가 true 여도 privacyOptionsRequired 가 false 면 설정 행이 없다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    A.consentNeeded = () => Promise.resolve(true);
    A.privacyOptionsRequired = () => Promise.resolve(false);
    MSWalletScreen.render(root);
    await flush();
    assert.ok(!findText(root, S.t.adSettings),
      "consentNeeded() 로 게이팅했다 — privacyOptionsRequired() 만 봐야 한다(태스크 계약 ③)");
  });
});
