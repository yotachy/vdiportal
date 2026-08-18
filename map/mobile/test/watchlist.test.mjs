// 워치리스트(시안 14a, P1a Task 6) — **실제 조립**을 잰다. 소스 정규식이 아니라 vm 이 아닌
// 최소 가짜 DOM 위에 진짜 store.js·wallet.js·sheet.js·ticker-picker.js·scan.js·엔진을 얹고
// screens/watchlist.js 를 실제로 실행해 나온 결과를 본다. 패턴은 tier-sheet.test.mjs(P1a
// Task 5, MSSheet 첫 소비자 검증)와 같다 — 이 저장소엔 jsdom 이 없어 손으로 최소 DOM 을
// 흉내낸다. wallet-screens.test.mjs 머리 주석이 짚었듯 이 화면(특히 ＋Add 시트)은 그동안
// 소스 문자열만 봤다 — "시트가 document.body 에 실제로 붙는가", "MSSheet 를 실제로 부르는가"
// 는 소스 모양으로는 안 보인다. 이 파일이 그 빈틈을 메운다.
//
// screens/watchlist.js·screens/wallet.js 는 UMD 가 아니라 옛 `window.X = {...}` 평범한 IIFE다
// (index.html 이 classic script 로 붙인다는 전제) — 그래서 require 전에 `global.window = global`
// 로 자기참조시켜 둔다. 자유 변수(MSStore·MSApi·... )는 Node 의 전역 스코프 체인이 그대로
// 찾아주므로 window 객체 자체에 따로 심을 필요는 없다.
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// ── 최소 가짜 DOM(FakeNode) — tier-sheet.test.mjs 를 확장한다. 이 화면은 추가로
// disabled(스캔 버튼 비활성)·classList(MSSheet 의 body 스크롤 잠금)·document.querySelectorAll
// (wallet.js refreshPills 가 실제로 부른다)이 필요하다. ──────────────────────────────────
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
  this.value = "";
  this.classList = {
    _set: new Set(),
    add: function (c) { this._set.add(c); },
    remove: function (c) { this._set.delete(c); },
    contains: function (c) { return this._set.has(c); }
  };
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
FakeNode.prototype.removeEventListener = function () {};
FakeNode.prototype.dispatch = function (type, evt) {
  (this._listeners[type] || []).slice().forEach(function (fn) { fn(evt || {}); });
};
FakeNode.prototype.click = function () { this.dispatch("click", { target: this }); };
Object.defineProperty(FakeNode.prototype, "textContent", {
  get: function () { return this.children.length ? this.children.map(function (c) { return c.textContent; }).join("") : this._text; },
  set: function (v) { this._text = String(v == null ? "" : v); this.children = []; }
});
Object.defineProperty(FakeNode.prototype, "innerHTML", {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v == null ? "" : v); this.children = []; }
});

// 트리 탐색 — className 토큰으로 찾는다(재귀). 이 파일의 단언은 전부 이걸 쓴다.
function findAll(node, pred, out) {
  out = out || [];
  if (pred(node)) out.push(node);
  (node.children || []).forEach(function (c) { findAll(c, pred, out); });
  return out;
}
function hasClass(node, cls) { return String(node.className || "").split(/\s+/).indexOf(cls) >= 0; }
function byClass(node, cls) { return findAll(node, function (n) { return hasClass(n, cls); }); }
// wallet.js refreshPills() 는 document.querySelectorAll(".ms-pill") 로 찾은 각 노드에
// 다시 .querySelector(".ms-pill-n") 를 부른다 — 노드 자신에도 이 메서드가 있어야 한다
// (document 레벨 querySelectorAll 만으로는 부족하다, 실행해서 unhandledRejection 으로 확인함).
FakeNode.prototype.querySelector = function (sel) {
  var cls = String(sel || "").replace(/^\./, "");
  var hit = byClass(this, cls);
  return hit.length ? hit[0] : null;
};
function byAttr(node, k, v) {
  return findAll(node, function (n) { return n.getAttribute(k) === v; });
}

function makeDoc() {
  var body = new FakeNode("body");
  return {
    createElement: function (tag) { return new FakeNode(tag); },
    createTextNode: function (text) { var n = new FakeNode("#text"); n.textContent = String(text == null ? "" : text); return n; },
    body: body,
    // wallet.js refreshPills() 가 부르는 실제 API — 이 시험 범위에선 ".ms-pill" 하나뿐이라
    // 단순 클래스 셀렉터만 지원한다(옛 harness들이 querySelector 자체를 안 흉내내는 이유와
    // 같다 — 필요한 형태만 채운다).
    querySelectorAll: function (sel) {
      var cls = String(sel || "").replace(/^\./, "");
      return byClass(body, cls);
    },
    querySelector: function (sel) {
      var r = this.querySelectorAll(sel);
      return r.length ? r[0] : null;
    }
  };
}

// ── 합성 OHLCV — onboarding.test.mjs 의 fakeCandles 와 같은 모양(230봉, 엔진이 실제로
// 도는 것을 그 시험이 이미 확인했다). 스캔이 실제 엔진을 거쳐 MSStore.setScan 까지
// 도달하는지(④ "스캔은 무료" 시험)를 실제로 재려면 이 정도 데이터가 있어야 ForgeCore.run
// 이 정상 값을 낸다.
function fakeCandles(n) {
  var out = [], p = 100, i;
  for (i = 0; i < n; i++) {
    var o = p, c = p * (1 + Math.sin(i / 7) * 0.01);
    out.push({ o: o, h: Math.max(o, c) * 1.005, l: Math.min(o, c) * 0.995, c: c, v: 1000 + i, t: "2026-08-01" });
    p = c;
  }
  return out;
}
function fakeOhlc(sym) {
  var candle = fakeCandles(230);
  return { price: candle.map(function (b) { return b.c; }), candle: candle, asOf: "2026-08-01", name: sym, source: "synthetic" };
}

// ── 전역 배선 + 모듈 재로드. screens/watchlist.js·sheet.js 는 모듈 스코프에 상태를 들고
// 있어(query/chip/scanRun/scanFailed — 헤더 주석이 이유를 설명한다 — 그리고 sheet.js 의
// stack) 시험마다 require 캐시를 비워 새로 돈다. store.js·wallet.js 는 install() 로 자기
// 상태를 리셋하는 API 가 있어 캐시를 비우지 않아도 된다(오히려 비우면 install 로 넘긴
// nowFn 인스턴스가 두 벌이 될 수 있어 안 비운다). ──────────────────────────────────────
function load(opts) {
  var o = opts || {};
  var doc = makeDoc();
  global.window = global;         // window.MSWatchlist = {...} 가 죽지 않게(자기참조)
  global.document = doc;
  global.MSUi = require("../www/ui.js");
  global.MSStr = require("../www/strings.js");

  var MSStore = require("../www/store.js");
  MSStore.install(null, function () { return new Date(); });
  global.MSStore = MSStore;
  global.MSWatchlistModel = require("../www/watchlist-model.js");
  global.MSPredLog = require("../www/predictions.js");

  var MSWallet = require("../www/wallet.js");
  var spendCalls = [];
  MSWallet.install({
    get: function () { return Promise.resolve({ ok: true, state: { balance: o.balance == null ? 0 : o.balance, cap: 20 } }); },
    spend: function (runType, idem, ref) { spendCalls.push({ runType: runType, idem: idem, ref: ref }); return Promise.resolve({ ok: false, reason: "spend-should-not-fire" }); }
  });
  global.MSWallet = MSWallet;
  delete require.cache[require.resolve("../www/screens/wallet.js")];
  require("../www/screens/wallet.js");         // window.MSWalletScreen = {...} (자기참조라 global 에 붙는다)
  // 위 require 는 window.MSWalletScreen 을 만들 뿐 값을 안 돌려준다(module.exports 없는
  // 평범한 IIFE) — global.MSWalletScreen 으로 읽는다(global===window, 위에서 자기참조했다).

  delete require.cache[require.resolve("../www/sheet.js")];
  global.MSSheet = require("../www/sheet.js");   // 진짜 MSSheet — 이 시험의 핵심 관측 대상
  global.MSTickerPicker = require("../www/ticker-picker.js");

  global.MSApi = o.api || { loadTicker: function (sym) { return Promise.resolve(fakeOhlc(sym)); } };
  global.MSGraph = require("../www/graph.js");
  global.ForgeCore = require("../../forge-core.js");
  global.MSReportModel = require("../www/report-model.js");
  global.MSScan = require("../www/scan.js");

  var goCalls = [];
  var current = { route: "watchlist", params: {} };
  global.MSApp = {
    go: function (route, params) { goCalls.push({ route: route, params: params }); current = { route: route, params: params || {} }; },
    current: function () { return current; }
  };

  delete require.cache[require.resolve("../www/screens/watchlist.js")];
  require("../www/screens/watchlist.js");        // window.MSWatchlist = {...}

  return { doc: doc, MSWatchlist: global.MSWatchlist, MSStore: MSStore, MSWallet: MSWallet, MSSheet: global.MSSheet, spendCalls: spendCalls, goCalls: goCalls };
}

function seedWatchlist(MSStore, items) { MSStore.setWatchlist(items); }

async function tick(n) {
  for (var i = 0; i < (n || 5); i++) await new Promise(function (r) { setTimeout(r, 5); });
}

// ── ① 헤더 스쿱 필 — 마크(svg), 다이아몬드 리터럴이 아니다 ──────────────────────────────
test("헤더에 스쿱 필이 있다 — 아이콘이 마크(scoopMark svg)다, 다이아몬드 리터럴이 아니다", () => {
  const { doc, MSWatchlist, MSStore } = load();
  seedWatchlist(MSStore, [{ sym: "AAPL", name: "애플" }]);
  const root = new FakeNode("div");
  MSWatchlist.render(root, {});

  const pill = byClass(root, "ms-pill")[0];
  assert.ok(pill, "헤더에 스쿱 필이 없다");
  const ico = byClass(pill, "ms-pill-ico")[0];
  assert.ok(ico, "필 안에 아이콘 슬롯이 없다");
  assert.match(ico.innerHTML, /<svg/, "아이콘이 svg 마크가 아니다");
  assert.strictEqual(ico.textContent, "", "아이콘이 여전히 텍스트(◆ 등)로 그려진다");
  assert.strictEqual(ico.innerHTML.indexOf("◆"), -1, "다이아몬드 리터럴이 남아 있다");
});

// ── ② 행 구성 — 읽음 점 · 심볼+회사명 · 가격/등락. 확신 배지는 없다 ──────────────────────
test("행 — 읽음 상태 점 · 이름/심볼 · 가격/등락률만 그린다, 확신 배지는 없다", () => {
  const { doc, MSWatchlist, MSStore } = load();
  seedWatchlist(MSStore, [{ sym: "AAPL", name: "Apple Inc." }]);
  MSStore.setScan("AAPL", { price: 234.1, chg: 0.12, dir: "bull", conf: 0.8, scannedAt: "2026-08-17T00:00:00.000Z", asOf: "2026-08-16" });
  const root = new FakeNode("div");
  MSWatchlist.render(root, {});

  const row = byClass(root, "wl-row")[0];
  assert.ok(row, "행이 없다");
  assert.strictEqual(byClass(row, "wl-dot").length, 1, "읽음 상태 점이 정확히 하나가 아니다");
  const title = byClass(row, "wl-title")[0];
  assert.strictEqual(title.textContent, "Apple", "회사명(접미사 뗀)이 안 보인다");
  const meta = byClass(row, "wl-meta")[0];
  assert.match(meta.textContent, /^AAPL/, "심볼이 메타 줄에 없다");
  const price = byClass(row, "wl-price")[0];
  assert.strictEqual(price.textContent, "234.10", "가격이 없다");
  assert.ok(byClass(row, "wl-chg")[0], "등락률이 없다");
  // 확신 배지 — 이 화면 어디에도 없어야 한다(스포일러 방지, 시안 14a). 등락률(wl-chg)의
  // "%" 는 정당한 값이라 별개다 — rec.conf(0.8, "80%"로 나올 값)가 어디에도 안 보이는지를
  // 확인한다.
  ["conf", "confidence", "badge", "wl-badge"].forEach(cls => {
    assert.strictEqual(byClass(row, cls).length, 0, "확신 배지(" + cls + ")가 남아 있다 — 목록이 판정을 흘린다");
  });
  assert.doesNotMatch(row.textContent, /80\s*%/, "확신(80%)이 행 텍스트에 새고 있다");
  assert.strictEqual(byClass(row, "wl-chg").length, 1, "등락률(정당한 %)이 정확히 하나가 아니다");
});

// ── ③ 읽음 상태 3종 ──────────────────────────────────────────────────────────────────
test("읽음 상태 3종 — 바이올렛 채움(unread) · 빈 링(read) · 회색(old)이 갈린다", () => {
  const { MSWatchlist, MSStore } = load();
  const today = MSStore.localDate(new Date());
  seedWatchlist(MSStore, [
    { sym: "AAPL", name: "애플" },   // unread — 아직 안 봄
    { sym: "NVDA", name: "엔비디아" }, // read — 오늘 스캔을 오늘 봤다
    { sym: "TSLA", name: "테슬라" }    // old — 예전에 봤고, 그 스캔의 기준일도 오래됐다
  ]);
  MSStore.setScan("AAPL", { price: 1, chg: 0, scannedAt: "S1", asOf: today });
  MSStore.setScan("NVDA", { price: 1, chg: 0, scannedAt: "S2", asOf: today });
  MSStore.markScanViewed("NVDA", "S2");
  MSStore.setScan("TSLA", { price: 1, chg: 0, scannedAt: "S3", asOf: "2000-01-01" });
  MSStore.markScanViewed("TSLA", "S3");

  const root = new FakeNode("div");
  MSWatchlist.render(root, {});

  function dotOf(sym) {
    const row = byAttr(root, "data-sym", sym)[0];
    assert.ok(row, sym + " 행이 없다");
    return byClass(row, "wl-dot")[0];
  }
  assert.ok(hasClass(dotOf("AAPL"), "unread"), "AAPL 이 unread 가 아니다");
  assert.ok(!hasClass(dotOf("AAPL"), "read") && !hasClass(dotOf("AAPL"), "old"));
  assert.ok(hasClass(dotOf("NVDA"), "read"), "NVDA 가 read 가 아니다");
  assert.ok(!hasClass(dotOf("NVDA"), "unread") && !hasClass(dotOf("NVDA"), "old"));
  assert.ok(hasClass(dotOf("TSLA"), "old"), "TSLA 가 old 가 아니다");
  assert.ok(!hasClass(dotOf("TSLA"), "unread") && !hasClass(dotOf("TSLA"), "read"));

  // 문구도 세 갈래로 갈린다 — 점 색과 옆 글자가 다른 말을 하면 안 된다.
  const MSStr = global.MSStr;
  assert.match(byAttr(root, "data-sym", "AAPL")[0].textContent, new RegExp(MSStr.t.wlUnread));
  assert.match(byAttr(root, "data-sym", "NVDA")[0].textContent, new RegExp(MSStr.t.wlRead));
  assert.match(byAttr(root, "data-sym", "TSLA")[0].textContent, new RegExp(MSStr.t.wlOld));
});

// ── ④ 스캔은 무료 — 잔량 0에서도 눌린다 ──────────────────────────────────────────────
test("스캔은 무료다 — 잔량 0에서도 눌리고, 결제(spend)를 아예 안 부르고, 실제로 스캔이 끝난다", async () => {
  const { MSWatchlist, MSStore, spendCalls } = load({ balance: 0 });
  seedWatchlist(MSStore, [{ sym: "AAPL", name: "애플" }]);   // 한 종목뿐 — scan.js 의 심볼 간 sleep(900ms)을 피한다
  assert.strictEqual(MSStore.getScan("AAPL"), null, "테스트 전제가 깨졌다 — 이미 스캔 기록이 있다");

  const root = new FakeNode("div");
  MSWatchlist.render(root, {});
  const scanBtn = byClass(root, "wl-scan")[0];
  assert.ok(scanBtn, "스캔 버튼이 없다");
  assert.strictEqual(scanBtn.disabled, false, "잔량 0인데 스캔 버튼이 이미 비활성이다");

  scanBtn.click();
  // 클릭 직후 — 결제로 가로막히지 않고 바로 진행 상태로 들어간다.
  assert.strictEqual(scanBtn.disabled, true, "클릭했는데 진행 중 표시가 안 된다 — 스캔이 시작되지 않았다");
  assert.match(scanBtn.textContent, /스캔 중/, "진행 문구가 안 보인다");

  await tick(20);   // 실제 엔진 계산(동기)이 끝나고 마이크로태스크 체인이 흐를 시간

  assert.strictEqual(spendCalls.length, 0, "스캔이 무료가 아니다 — MSWallet.spend 가 불렸다(잔량 0에서 결제를 시도했다)");
  const rec = MSStore.getScan("AAPL");
  assert.ok(rec, "스캔이 실제로 끝나지 않았다 — MSStore 에 기록이 없다");
  assert.strictEqual(typeof rec.price, "number", "스캔 결과에 가격이 없다");
});

// ── ⑤ 상태 4종 ────────────────────────────────────────────────────────────────────
test("상태 — 워치리스트가 비면 빈 안내 + 종목 추가만 보인다", () => {
  const { MSWatchlist, MSStore } = load();
  const root = new FakeNode("div");
  MSWatchlist.render(root, {});
  assert.match(root.textContent, new RegExp(global.MSStr.t.wlEmpty.split("\n")[0]));
  assert.ok(byClass(root, "wl-add")[0], "빈 상태에도 종목 추가 버튼은 있어야 한다");
  assert.strictEqual(byClass(root, "wl-row").length, 0);
});

test("상태 — 검색·칩 결과가 없으면 안내만 뜨고 행은 안 그린다", () => {
  const { MSWatchlist, MSStore } = load();
  seedWatchlist(MSStore, [{ sym: "AAPL", name: "애플" }]);
  const root = new FakeNode("div");
  MSWatchlist.render(root, {});
  const input = findAll(root, n => hasClass(n, "wl-search-input"))[0];
  assert.ok(input, "검색창이 없다");
  input.value = "존재하지않는종목이름";
  input.dispatch("input", {});
  assert.match(root.textContent, new RegExp(global.MSStr.t.wlNoMatch));
  assert.strictEqual(byClass(root, "wl-row").length, 0, "결과가 없어야 하는데 행이 남았다");
});

test("상태 — 스캔 중엔 진행률(done/total) 문구가 뜬다", async () => {
  const { MSWatchlist, MSStore } = load();
  seedWatchlist(MSStore, [{ sym: "AAPL", name: "애플" }, { sym: "NVDA", name: "엔비디아" }]);
  const root = new FakeNode("div");
  MSWatchlist.render(root, {});
  const scanBtn = byClass(root, "wl-scan")[0];
  scanBtn.click();
  assert.match(scanBtn.textContent, /스캔 중\s*0\/2/, "진행률 문구(0/2)가 안 보인다");
  await tick(30);
});

test("상태 — 스캔 실패는 행에 '스캔 실패' 표시로 남는다", async () => {
  const failing = { loadTicker: function () { return Promise.reject(new Error("network down")); } };
  const { MSWatchlist, MSStore } = load({ api: failing });
  seedWatchlist(MSStore, [{ sym: "AAPL", name: "애플" }]);
  const root = new FakeNode("div");
  MSWatchlist.render(root, {});
  const scanBtn = byClass(root, "wl-scan")[0];
  scanBtn.click();
  // watchlist.js 는 scan.js 를 기본값(gap 900ms·maxRetry 2)으로 쓴다 — 여기엔 테스트용
  // sleep 주입 통로가 없다(scan.test.mjs 의 harness 와 달리, watchlist.js 가 만드는
  // scanner 는 loadOne·analyze 만 넘긴다). 백오프 900+1800=2700ms 를 실제로 흘려보낸다.
  await tick(650);

  const row = byAttr(root, "data-sym", "AAPL")[0];
  assert.ok(row, "행이 사라졌다");
  const fail = byClass(row, "wl-asof")[0];
  assert.ok(fail, "스캔 실패 표시가 없다");
  assert.strictEqual(fail.textContent, global.MSStr.t.wlScanFail);
});

// ── ⑥ ＋종목 추가 시트가 MSSheet 를 실제로 부른다 ─────────────────────────────────────
test("＋종목 추가 — MSSheet 를 실제로 연다(.ms-sheet-backdrop), 옛 .sheet-scrim/.sheet 가 아니다", () => {
  const { doc, MSWatchlist, MSStore, MSSheet } = load();
  seedWatchlist(MSStore, [{ sym: "AAPL", name: "애플" }]);
  const root = new FakeNode("div");
  MSWatchlist.render(root, {});
  doc.body.appendChild(root);   // wallet.js refreshPills() 의 querySelectorAll(".ms-pill") 처럼
                                 // document 트리에서 찾는 경로가 있으면 이게 있어야 보인다

  const addBtn = byClass(root, "wl-add")[0];
  assert.ok(addBtn, "종목 추가 버튼이 없다");
  assert.strictEqual(MSSheet.isOpen(), false, "시작 전인데 이미 시트가 열려 있다");
  addBtn.click();

  assert.strictEqual(MSSheet.isOpen(), true, "MSSheet 가 실제로 열리지 않았다");
  const backdrop = byClass(doc.body, "ms-sheet-backdrop")[0];
  assert.ok(backdrop, "MSSheet 의 backdrop 이 document.body 에 없다 — 자체 시트를 그렸을 수 있다");
  assert.strictEqual(byClass(doc.body, "sheet-scrim").length, 0, "옛 .sheet-scrim 이 남아 있다");
  // ".sheet" 자체(옛 최상위 카드)만 정확히 찾는다 — "sheet-tier" 등 다른 접두는 정당하다.
  assert.strictEqual(byClass(doc.body, "sheet").length, 0, "옛 .sheet 카드가 남아 있다");
  assert.ok(byClass(backdrop, "ms-sheet-body").length, "MSSheet 의 body 컨테이너가 없다");
  // ticker-picker.js 의 단일 모드 chrome(tp-title)이 들어 있어야 한다 — MSSheet 자체엔
  // title 을 안 줬으므로(두 벌 방지, watchlist.js 주석 참고) 이게 유일한 제목이다.
  assert.ok(byClass(backdrop, "tp-title").length, "피커의 자기 제목(tp-title)이 없다 — chrome 이 안 붙었다");

  // 고른다 — 이미 담은 AAPL 은 잠겨 있으니 새 종목(큐레이션 8종 중 하나, 삼성전자)을 고른다.
  // ticker-picker.js 는 칩 클릭을 위임(grid 하나에만 리스너)으로 받는다(ticker-picker.test.mjs
  // 의 관례와 같다 — 실제 이벤트 버블링이 없는 이 가짜 DOM에선 grid 에 target 을 실어 쏜다).
  const grid = byClass(backdrop, "tp-grid")[0];
  assert.ok(grid, "종목 그리드가 없다");
  const chip = byAttr(grid, "data-sym", "005930")[0];
  assert.ok(chip, "삼성전자 칩이 없다");
  grid.dispatch("click", { target: chip });
  const confirm = byClass(backdrop, "tp-confirm")[0];
  assert.ok(confirm, "확인 버튼이 없다");
  assert.strictEqual(confirm.disabled, false, "종목을 골랐는데 확인 버튼이 그대로 비활성이다");
  confirm.click();

  assert.strictEqual(MSSheet.isOpen(), false, "확정 후에도 시트가 안 닫혔다");
  assert.ok(MSStore.getWatchlist().some(x => x.sym === "005930"), "고른 종목이 워치리스트에 안 심겼다");
});
