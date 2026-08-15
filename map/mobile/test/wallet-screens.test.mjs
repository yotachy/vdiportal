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
// 그 줄을 지우고 돌려보니 MSStore.addTicker 는 불렸는데(스토어에는 NVDA 가 있음) 화면의 .wl-sym 목록엔
// 여전히 AAPL 하나뿐이었다(아래 마지막 단언 실패, 되돌림). 스토어에 값이 들어간 것과 사용자 눈에
// 보이는 것은 별개라는 걸 실행으로 잡는다.
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
    var syms = root.querySelectorAll(".wl-sym").map(function (n) { return n.textContent; });
    assert.ok(syms.indexOf("NVDA") >= 0, "새로 추가한 심볼이 재렌더된 목록에 없다: " + syms.join(","));
    assert.ok(syms.indexOf("AAPL") >= 0, "기존 종목이 재렌더 후 사라졌다: " + syms.join(","));
  });
});

// 회사명을 버리고 심으면(addTicker(sym, "")) store.js 가 name = 심볼로 폴백해 두 가지가 조용히
// 죽는다: 행이 심볼을 두 번 찍고(wl-sym·wl-name), 회사명 검색이 이 종목만 빠진다
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

    var syms = root.querySelectorAll(".wl-sym").map(function (n) { return n.textContent; });
    var names = root.querySelectorAll(".wl-name").map(function (n) { return n.textContent; });
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
    signedIn: function () { return false; }
  };
}

function setupWalletGlobals() {
  const g = globalThis;
  const saved = {};
  const put = (k, v) => { saved[k] = Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; g[k] = v; };
  put("document", { createElement: function (t) { return new WlNode(t); } });
  put("window", { open: function () {} });
  put("MSUi", require("../www/ui.js"));
  put("MSStr", S);
  put("MSApp", { go: function () {}, current: function () { return { params: {} }; } });
  const W = fakeMSWallet();
  put("MSWallet", W);
  return { saved: saved, W: W };
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
  const { saved, W } = setupWalletGlobals();
  try { return await fn(new WlNode("div"), W); }
  finally { restoreWalletGlobals(saved); }
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

// 무중단 스위치. 서버에 자격증명이 없으면 눌러도 아무 일 없는 죽은 버튼이 된다.
// 리뷰 Critical(실행으로 확인됨): 행은 지우면서 "Waiting for the browser…" 는 안 지워서, 서버에
// 자격증명이 없는(=오늘 모든 사용자가 겪는) 경로에서 대기 문구가 버튼도 없이 영원히 남아 있었다.
// 같은 msg 노드를 클릭 시점에 붙잡아 뒀다가 resolve 뒤 내용이 비었는지 직접 본다.
test("authStart 가 auth-disabled 면 로그인 행이 사라지고 대기 문구도 함께 지워진다", async () => {
  await withWalletDom(async (root, W) => {
    W.signedIn = function () { return false; };
    W.authStart = function () { return Promise.resolve({ ok: false, reason: "auth-disabled" }); };
    MSWalletScreen.render(root);
    await flush();
    findText(root, S.t.wSignIn).dispatch("click");
    var waitingMsg = findText(root, S.t.wSignInWaiting);
    assert.ok(waitingMsg, "클릭 직후 대기 문구가 안 떴다");
    await flush();
    assert.ok(!findText(root, S.t.wSignIn), "죽은 로그인 버튼이 남아 있다");
    assert.strictEqual(waitingMsg.textContent, "",
      "행은 지웠는데 'Waiting for the browser…' 문구가 그대로 남아 있다 — 버튼 없이 문구만 영원히 남는다");
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
// 리뷰 Minor(채택): auth-disabled 와 같은 방식으로 다룬다 — 행을 지운다. 안 지우면
// authStart 는 기기 상태와 무관하게 항상 성공하므로, 사용자가 재탭 → 구글 로그인 왕복을
// 통째로 다시 거치고도 같은 벽에 부딪히는 것을 반복할 수 있다.
test("authPoll 이 device-claimed 면 폴링을 멈추고 재설치를 안내하며 행을 지운다", async () => {
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
    // flush() 자신도 setTimeout(fn,0) 을 쓰므로 0 은 허용하고, 그보다 큰(=POLL_MS 재시도) 예약만 본다.
    assert.ok(scheduled.every(function (ms) { return !ms; }),
      "device-claimed 인데 다음 폴링 setTimeout 을 예약했다: " + scheduled.join(","));
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
    var row = findText(root, S.t.walCheckin).parentNode.parentNode;
    assert.ok(row.classList.contains("is-off"), "병합된 지갑인데 출석 행이 활성으로 그려졌다");
    assert.strictEqual(row.listeners.click, undefined,
      "비활성 행인데 클릭 리스너가 붙어 있다 — 탭하면 항상 실패하는 checkin 을 제공한다");
  });
});
