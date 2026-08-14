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
  var nowFn = function () { return new Date(); };   // 테스트가 시계를 주입할 수 있게 한 겹 둔다

  // now 는 테스트 전용 — 실제 시각을 흉내 내는 아무 객체(Date 아니어도 getFullYear 등만 있으면 됨).
  function install(b, now) { backend = b || null; mem = {}; nowFn = now || function () { return new Date(); }; }
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

  // 로컬 달력일 — getFullYear/getMonth/getDate 는 기기의 로컬 시간대를 읽는다. 사용자는 KST(UTC+9)라
  // toISOString()(UTC)을 쓰면 00:00~08:59 KST 사이엔 날짜가 하루 이르게 찍힌다. +9시간을 더해
  // toISOString 을 다시 쓰는 식으로 "고치면" 그 경계가 다른 시간대로 옮겨갈 뿐 같은 부류의 버그다.
  function localDate(d) {
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return y + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  }

  function addTicker(sym, name) {
    var s = String(sym || "").trim().toUpperCase();
    if (!s) return false;
    var list = getWatchlist();
    for (var i = 0; i < list.length; i++) if (list[i].sym === s) return false;
    list.push({ sym: s, name: name || s, addedAt: localDate(nowFn()) });
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
           allScans: allScans,
           getLastSym: getLastSym, setLastSym: setLastSym,
           onboarded: onboarded, setOnboarded: setOnboarded, consent: consent,
           read0: read, write0: write };
});
