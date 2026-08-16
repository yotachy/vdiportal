// localStorage 래퍼. OHLC 는 저장하지 않는다 — AAPL 하나가 394KB 라 쿼터를 깬다.
// 모든 접근을 try/catch 로 감싸고 실패 시 메모리로 떨어진다(WebView 쿼터·프라이빗 모드).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSStore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYS = { watchlist: "ms_watchlist", scan: "ms_scan", viewed: "ms_wl_viewed", lastSym: "ms_last_sym",
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
    var viewed = allViewed();         // 같은 이유 — 지운 종목의 "읽음" 표시가 다음 추가 때 유령으로 뜬다
    if (Object.prototype.hasOwnProperty.call(viewed, s)) { delete viewed[s]; write(KEYS.viewed, viewed); }
    if (getLastSym() === s) write(KEYS.lastSym, null);   // 지운 종목이 다음 부팅에 유령으로 뜬다
    return true;
  }

  function allScans() { var v = read(KEYS.scan, {}); return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }
  function getScan(sym) { var v = allScans()[String(sym || "").toUpperCase()]; return v || null; }
  function setScan(sym, rec) { var s = allScans(); s[String(sym || "").toUpperCase()] = rec; write(KEYS.scan, s); }

  // 워치리스트 행의 읽음 상태 — 시안 14a. "본 적 있다"를 시각으로 안 재고 스캔의 정체성
  // (rec.scannedAt, analyze() 가 찍는 ISO 문자열)으로 잰다. 저장하는 건 "마지막으로 본 스캔이
  // 몇 번째냐"이지 "언제 봤냐"가 아니다 — 그래서 새 스캔이 들어오면(scannedAt 이 바뀌면) 어제
  // 읽었던 행도 다시 안 읽음으로 돌아간다. 이게 핵심 동작이다: 다음 날 아침 스캔이 새 판정을
  // 만들면 그게 곧 "새 판정"이어야지, "어제 한 번 열어봤으니 오늘도 읽음"이면 안 된다.
  // 오래됨(3번째 상태)은 여기서 다루지 않는다 — 시간 문턱을 지금 박으면 시안이 실제로 쓰는
  // 단위(21a "봉이 하나 더 생겼습니다" = 확정 캔들 수)와 다른 임의의 숫자가 되고, 그 숫자가
  // 맞는지 아무도 확인할 방법이 없다. 예측 기록이 생기는 후속 단계에서 붙인다.
  function allViewed() { var v = read(KEYS.viewed, {}); return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }
  function viewedScanKey(sym) { var v = allViewed()[String(sym || "").toUpperCase()]; return (typeof v === "string" && v) ? v : null; }
  function markScanViewed(sym, scanKey) {
    var s = String(sym || "").trim().toUpperCase();
    if (!s || !scanKey) return;
    var v = allViewed();
    v[s] = scanKey;
    write(KEYS.viewed, v);
  }

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
           allScans: allScans, viewedScanKey: viewedScanKey, markScanViewed: markScanViewed,
           getLastSym: getLastSym, setLastSym: setLastSym,
           onboarded: onboarded, setOnboarded: setOnboarded, consent: consent,
           read0: read, write0: write };
});
