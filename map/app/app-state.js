/* 머니스쿱 앱 — 중앙 상태 스토어·영속화.
   영속 계약: localStorage 키 ms_app_v1 {v:1, ...persistKeys}. 프로토(ms_proto_v1, dissection/01 §2)의
   규칙을 승계하되 전체 키 명명·버저닝으로 재정의. 프로토에서 비영속이던 일일 한도(stockOps 등)와
   커스텀 가중치·작도 토글(Q8)은 영속으로 승격 — 서버 동기화(P8) 전까지의 로컬 원본.
   일일 리셋 기준은 KST 자정(Q11). localStorage 접근은 io 주입(노드 테스트·미리보기 샌드박스 안전). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.MS = root.MS || {}; root.MS.state = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORE_KEY = "ms_app_v1";
  const TTL_MS = 86400000;          // config 와 독립 상수 — restore 는 config 로드 전에도 안전해야 함
  const KST_OFFSET_MS = 9 * 3600000;

  // 영속 대상(이 목록이 곧 저장 스키마 v1)
  const persistKeys = [
    "picks", "analyzed", "analyzedAt", "scoops", "theme", "gLinked",
    "personaIdx", "personaAns", "personaApply", "xp", "xpToday", "fontZoom",
    "dayVisit", "weights", "checks", "indOff", "dayCounters", "sigRead", "xpSeen", "notiOff",
    "analysisMeta"   // 'SYM|TF' → {tier,preset,weights,personaApply} — 리포트 재구성(재계산 무료·결정적)용
  ];

  function initialState() {
    return {
      // 화면·내비
      screen: "boot", sheet: null, seg: "evi", tf: "일", ticker: null,
      // 데이터
      picks: [], analyzed: {}, analyzedAt: {},
      // 경제·성장
      scoops: 15, xp: 0, xpToday: 0, gLinked: 0,
      // 페르소나
      personaIdx: 0, personaAns: [], personaApply: 0,
      // 커스텀 조합·작도 (Q8: 영속)
      weights: {}, checks: {}, indOff: {}, drawOff: {}, analysisMeta: {},
      // 시그널·XP
      sigRead: {}, sgOpen: {}, xpSeen: {}, notiOff: 0,
      // 설정
      theme: "dark", fontZoom: 0,
      // 실행
      tier: null, preset: "전체 종합", prog: 0,
      runLive: 0, runSym: null, runTf: null, runFrom: null, runDoneN: null, runErr: 0,
      // 일일
      dayVisit: null,
      dayCounters: { d: null, stockOps: 0, stockAddXp: 0, personaToday: 0, drawXp: 0, streak: 0 },
      // UI 휘발
      toast: "", skel: 0
    };
  }

  function dayKey(now) {
    const t = new Date((typeof now === "number" ? now : Date.now()) + KST_OFFSET_MS);
    const y = t.getUTCFullYear();
    const m = String(t.getUTCMonth() + 1);
    const d = String(t.getUTCDate());
    return y + "-" + (m.length < 2 ? "0" + m : m) + "-" + (d.length < 2 ? "0" + d : d);
  }

  function serialize(s) {
    const out = { v: 1 };
    persistKeys.forEach(function (k) { out[k] = s[k]; });
    return JSON.stringify(out);
  }

  function restore(raw, now) {
    let v = null;
    try { v = JSON.parse(raw || "null"); } catch (e) { return null; }
    if (!v || !v.picks || !v.picks.length) return null;   // 관심 종목 없으면 첫 실행 취급(프로토 규칙)

    const s = initialState();
    persistKeys.forEach(function (k) { if (k in v) s[k] = v[k]; });

    // 값 보정(프로토 L2202 승계)
    if (typeof s.scoops !== "number" || !isFinite(s.scoops)) s.scoops = 15;
    s.theme = s.theme === "light" ? "light" : "dark";
    if (typeof s.xp !== "number" || !isFinite(s.xp)) s.xp = 0;
    if (!s.analyzed || typeof s.analyzed !== "object") s.analyzed = {};
    if (!s.analyzedAt || typeof s.analyzedAt !== "object") s.analyzedAt = {};

    // 24h 만료 필터 — analyzed 만 걸러내고 analyzedAt 은 만료 표기용으로 보존
    const at = s.analyzedAt;
    const live = {};
    Object.keys(s.analyzed).forEach(function (k) {
      if (!at[k] || (now - at[k]) < TTL_MS) live[k] = s.analyzed[k];
    });
    s.analyzed = live;

    // 일일 값은 오늘 것만(KST) — 아니면 리셋
    const today = dayKey(now);
    const dc = (s.dayCounters && typeof s.dayCounters === "object") ? s.dayCounters : {};
    if (dc.d !== today) {
      s.dayCounters = { d: today, stockOps: 0, stockAddXp: 0, personaToday: 0, drawXp: 0,
        streak: (typeof dc.streak === "number" ? dc.streak : 0) };  // 연속 방문은 날짜 리셋 대상 아님
      s.xpToday = 0;
    }
    if (s.dayVisit && s.dayVisit.d !== today) s.dayVisit = null;

    s.ticker = s.picks[0];
    return s;
  }

  // ── 스토어 ──
  function create(initial, io) {
    let state = initial || initialState();
    const subs = [];
    let persistT = null;

    function get() { return state; }

    function set(patch) {
      const p = (typeof patch === "function") ? patch(state) : patch;
      if (!p) return;
      const keys = Object.keys(p);
      if (!keys.length) return;
      const next = {};
      Object.keys(state).forEach(function (k) { next[k] = state[k]; });
      keys.forEach(function (k) { next[k] = p[k]; });
      state = next;
      subs.slice().forEach(function (fn) { fn(keys, state); });
    }

    function subscribe(fn) {
      subs.push(fn);
      return function () {
        const i = subs.indexOf(fn);
        if (i >= 0) subs.splice(i, 1);
      };
    }

    function persistNow(now) {
      if (!io || !io.write) return;
      try { io.write(serialize(state), now); } catch (e) { /* 저장 실패는 조용히 — 메모리 폴백 */ }
    }

    function persistSoon() {                 // 프로토의 setTimeout(persist, 80~120) 승계 — 디바운스 100ms
      if (persistT) clearTimeout(persistT);
      persistT = setTimeout(function () { persistT = null; persistNow(Date.now()); }, 100);
    }

    return { get: get, set: set, subscribe: subscribe,
      persistNow: persistNow, persistSoon: persistSoon,
      snapshot: function () { return serialize(state); } };
  }

  // 브라우저 기본 io — localStorage(try/catch, 샌드박스 폴백)
  function browserIO() {
    return {
      read: function () {
        try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
      },
      write: function (raw) {
        try { localStorage.setItem(STORE_KEY, raw); } catch (e) { /* 폴백: 메모리만 */ }
      }
    };
  }

  return { STORE_KEY: STORE_KEY, persistKeys: persistKeys, initialState: initialState,
    dayKey: dayKey, serialize: serialize, restore: restore, create: create, browserIO: browserIO };
});
