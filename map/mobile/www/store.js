// localStorage 래퍼. OHLC 는 저장하지 않는다 — AAPL 하나가 394KB 라 쿼터를 깬다.
// 모든 접근을 try/catch 로 감싸고 실패 시 메모리로 떨어진다(WebView 쿼터·프라이빗 모드).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSStore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYS = { watchlist: "ms_watchlist", scan: "ms_scan", lastSym: "ms_last_sym",
               onboarded: "ms_onboarded", consent: "ms_consent" };
  var SEED = [{ sym: "AAPL", name: "Apple Inc." }, { sym: "NVDA", name: "NVIDIA Corporation" }, { sym: "MSFT", name: "Microsoft Corporation" }];

  var mem = {};                       // 백엔드 실패 시 폴백 저장소
  var backend = null;

  function install(b) { backend = b || null; mem = {}; }
  function be() {
    if (backend) return backend;
    try { if (typeof localStorage !== "undefined" && localStorage) return localStorage; } catch (e) {}
    return null;
  }
  function read(key, fallback) {
    var raw = null;
    try { var b = be(); raw = b ? b.getItem(key) : null; } catch (e) { raw = null; }
    if (raw == null && Object.prototype.hasOwnProperty.call(mem, key)) raw = mem[key];
    if (raw == null) return fallback;
    try { var v = JSON.parse(raw); return (v == null) ? fallback : v; } catch (e) { return fallback; }
  }
  function write(key, val) {
    var s = JSON.stringify(val);
    mem[key] = s;                     // 항상 메모리에도 둔다 — 쓰기 실패해도 세션 내 일관성 유지
    try { var b = be(); if (b) b.setItem(key, s); } catch (e) {}
  }

  function getWatchlist() { var v = read(KEYS.watchlist, []); return Array.isArray(v) ? v : []; }
  function setWatchlist(list) { write(KEYS.watchlist, Array.isArray(list) ? list : []); }

  function addTicker(sym, name) {
    var s = String(sym || "").trim().toUpperCase();
    if (!s) return false;
    var list = getWatchlist();
    for (var i = 0; i < list.length; i++) if (list[i].sym === s) return false;
    list.push({ sym: s, name: name || s, addedAt: new Date().toISOString().slice(0, 10) });
    setWatchlist(list);
    return true;
  }

  function removeTicker(sym) {
    var s = String(sym || "").trim().toUpperCase();
    var list = getWatchlist(), out = list.filter(function (x) { return x.sym !== s; });
    if (out.length === list.length) return false;
    setWatchlist(out);
    var scans = allScans();           // 캐시를 남기면 다시 추가했을 때 옛 신호가 유령처럼 뜬다
    if (scans[s]) { delete scans[s]; write(KEYS.scan, scans); }
    if (getLastSym() === s) write(KEYS.lastSym, null);   // 지운 종목이 다음 부팅에 유령으로 뜬다
    return true;
  }

  function allScans() { var v = read(KEYS.scan, {}); return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }
  function getScan(sym) { var v = allScans()[String(sym || "").toUpperCase()]; return v || null; }
  function setScan(sym, rec) { var s = allScans(); s[String(sym || "").toUpperCase()] = rec; write(KEYS.scan, s); }

  // 2단 레이아웃의 오른쪽 칸이 부팅 시 무엇을 보여줄지 — 커버로 보다 펴는 흐름에선
  // selectedSym 이 이미 메모리에 있으므로, 이 값이 실제로 쓰이는 건 앱을 새로 켠 순간뿐이다.
  function getLastSym() {
    var v = read(KEYS.lastSym, null);
    return (typeof v === "string" && v) ? v.toUpperCase() : null;
  }
  function setLastSym(sym) {
    var s = String(sym == null ? "" : sym).trim().toUpperCase();
    write(KEYS.lastSym, s || null);
  }

  function seedIfEmpty() {
    if (getWatchlist().length) return false;
    SEED.forEach(function (x) { addTicker(x.sym, x.name); });
    return true;
  }

  function onboarded() { return read(KEYS.onboarded, false) === true; }

  // 약관 버전과 시각을 함께 남긴다 — 불리언만 남기면 약관이 개정됐을 때
  // 누가 무엇에 동의했는지 말할 수 없다. 서버로는 보내지 않는다(8c 에서 계정에 붙일 자리).
  function setOnboarded(termsVersion) {
    write(KEYS.consent, { termsVersion: String(termsVersion || ""), at: new Date().toISOString() });
    write(KEYS.onboarded, true);
  }
  function consent() {
    var c = read(KEYS.consent, null);
    return (c && typeof c === "object" && c.termsVersion) ? c : null;
  }

  return { KEYS: KEYS, SEED: SEED, install: install, getWatchlist: getWatchlist, setWatchlist: setWatchlist,
           addTicker: addTicker, removeTicker: removeTicker, getScan: getScan, setScan: setScan,
           allScans: allScans, seedIfEmpty: seedIfEmpty,
           getLastSym: getLastSym, setLastSym: setLastSym,
           onboarded: onboarded, setOnboarded: setOnboarded, consent: consent,
           read0: read, write0: write };
});
