// localStorage 래퍼. OHLC 는 저장하지 않는다 — AAPL 하나가 394KB 라 쿼터를 깬다.
// 모든 접근을 try/catch 로 감싸고 실패 시 메모리로 떨어진다(WebView 쿼터·프라이빗 모드).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSStore", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYS = { watchlist: "ms_watchlist", scan: "ms_scan", viewed: "ms_wl_viewed", lastSym: "ms_last_sym",
               onboarded: "ms_onboarded", consent: "ms_consent", style: "ms_style",
               preds: "ms_preds" };
  // 이름은 한국어(2026-08-16 재스킨) — AAPL·NVDA 는 ticker-picker.js 의 CURATED 와 반드시
  // 같은 이름("애플"·"엔비디아")을 써야 한다. 두 벌이 갈리면 온보딩 4단계가 이 SEED 를
  // 프리셋으로 그릴 때 같은 종목이 화면마다 다른 이름으로 보인다(카드추가 항목 1).
  // MSFT 는 새 CURATED 8종 밖이라 표준 이름이 이 파일뿐이다.
  var SEED = [{ sym: "AAPL", name: "애플" }, { sym: "NVDA", name: "엔비디아" }, { sym: "MSFT", name: "마이크로소프트" }];
  // TUTORIAL_SYMS(옛 시안 16a "체험 종목 정확히 3개")는 Task 6 리뷰(Minor)에서 지웠다 —
  // 온보딩 5단계가 ticker-picker.js 의 CURATED 8종을 직접 쓰면서(tutSyms/tutPicks 삭제)
  // 이 export 를 참조하는 곳이 www/·test/ 어디에도 안 남았다(grep 로 확인).

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
  // 오래됨(3번째 상태, P1a Task 6 에서 붙었다) — "언제 봤냐"가 아니라 rec.asOf(스캔이 근거한
  // 마지막 확정 봉의 날짜)가 오늘의 달력일보다 이전인가로 잰다. 21a "봉이 하나 더 생겼습니다"와
  // 같은 단위(확정 캔들 수)를 시각으로 근사한 것이다 — 예측 판정(predictions.js judgeBar)처럼
  // 서버가 실제로 새 봉을 냈는지 확인하지 않고 "적어도 하루가 지났으니 새 봉이 있을 것"으로
  // 본다. 이 파일은 그 today 값을 안 만든다(localDate 를 내보낼 뿐) — 계산은 순수해야 하는
  // watchlist-model.js readState() 가 today 를 인자로 받아 한다.
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
  // 온보딩을 처음부터 다시 보게 한다. **동의 기록은 지우지 않는다** — 약관에 동의한 것은
  // 이미 일어난 사실이고, 그것을 지우면 언제 무엇에 동의했는지 말할 수 없게 된다.
  // 워치리스트도 건드리지 않는다(온보딩 4단계는 추가만 한다).
  function replayOnboarding() { write(KEYS.onboarded, false); }

  function consent() {
    var c = read(KEYS.consent, null);
    return (c && typeof c === "object" && c.termsVersion) ? c : null;
  }

  // 투자성향(온보딩 2단계, 시안 11c). 전문분석 편집기의 가중치 기본값이 여기서 나온다 —
  // 고르게만 하고 아무 데도 안 쓰면 그 화면은 죽은 컨트롤이다. 값은 MSIndTiers.PRESETS 의 key.
  function getStyle() { var v = read(KEYS.style, null); return (typeof v === "string" && v) ? v : null; }
  function setStyle(key) { write(KEYS.style, String(key || "")); }

  // ── 예측 기록(앱의 고리) ──────────────────────────────────────────────────────
  // 오늘 무엇을 말했는지 적어두고 내일 판정한다. 서버 없이 기기에서 닫는다 — 서버는
  // 기기 간 동기화용이지 고리의 전제가 아니다(그렇게 오해해서 오래 미뤄뒀다).
  // 상한을 둔다: 무한히 쌓이면 localStorage 를 채우고 부팅이 느려진다. 오래된 것부터 버린다.
  var PRED_MAX = 200;

  function getPreds() { var v = read(KEYS.preds, []); return Array.isArray(v) ? v : []; }
  function setPreds(list) {
    var arr = Array.isArray(list) ? list : [];
    write(KEYS.preds, arr.length > PRED_MAX ? arr.slice(arr.length - PRED_MAX) : arr);
  }
  // 같은 종목·같은 기준일을 두 번 적지 않는다 — 리포트를 두 번 열었다고 예측이 둘이 되면
  // 적중률의 분모가 조용히 부풀고, 결과 카드에 같은 것이 두 번 뜬다.
  function addPred(rec) {
    if (!rec || !rec.sym || !rec.asOf) return getPreds();
    var list = getPreds();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].sym === rec.sym && list[i].asOf === rec.asOf) {
        // 더 높은 티어로 다시 봤으면 그것으로 갱신한다(전문 > 심화). 판정 결과는 지우지 않는다.
        if (list[i].judgedOn) return list;
        list[i] = rec;
        setPreds(list);
        return list;
      }
    }
    list.push(rec);
    setPreds(list);
    return list;
  }
  // 판정 결과를 기록에 못박는다. 판정은 한 번만 — 다시 재면 오늘 데이터로 어제 말을 고치게 된다.
  function settlePred(sym, asOf, judged) {
    var list = getPreds(), changed = false;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r && r.sym === sym && r.asOf === asOf && !r.judgedOn) {
        r.judgedOn = judged.judgedOn; r.hit = judged.hit; r.miss = judged.miss;
        r.actual = judged.actual; r.basicHit = judged.basicHit;
        r.narrowedAndMissed = judged.narrowedAndMissed;
        r.seen = false;   // 사용자가 아직 결과를 못 봤다 — 결과 카드가 이것으로 뜬다
        changed = true;
      }
    }
    if (changed) setPreds(list);
    return list;
  }
  function markPredSeen(sym, asOf) {
    var list = getPreds(), changed = false;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r && r.sym === sym && r.asOf === asOf && r.seen === false) { r.seen = true; changed = true; }
    }
    if (changed) setPreds(list);
    return list;
  }

  return { KEYS: KEYS, SEED: SEED, PRED_MAX: PRED_MAX,
           replayOnboarding: replayOnboarding,
           getPreds: getPreds, setPreds: setPreds, addPred: addPred,
           settlePred: settlePred, markPredSeen: markPredSeen, install: install, getWatchlist: getWatchlist, setWatchlist: setWatchlist,
           getStyle: getStyle, setStyle: setStyle,
           addTicker: addTicker, removeTicker: removeTicker, getScan: getScan, setScan: setScan,
           allScans: allScans, viewedScanKey: viewedScanKey, markScanViewed: markScanViewed,
           getLastSym: getLastSym, setLastSym: setLastSym,
           onboarded: onboarded, setOnboarded: setOnboarded, consent: consent,
           localDate: localDate,
           read0: read, write0: write };
});
