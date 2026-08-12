// 지갑 계약. 서버가 이미 있는 것처럼 짠다 — SPEC-economy.md 가 "되돌리기 어려운 둘"로 지목한
// 원장의 위치와 보상 경로를 나중에 붙일 수 있게 하는 이음매다.
// 클라이언트는 잔량도 델타도 계산하지 않는다. 의도(spend)만 보내고 백엔드가 준 state 를 그린다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSWallet = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 전부 시안에서 온 값이다 — full·custom 은 5a·4a, slot 은 2b("Add TSLA — Costs 1 Scoop"),
  // scan 은 2c 의 Spend 목록("Watchlist signal scan 2"). 8a 는 scan 을 "값이 없다"고 잘못 읽어
  // 무료로 뒀다가 2026-08-12 사용자 결정으로 시안 값으로 돌렸다.
  var COSTS = { full: 3, custom: 5, slot: 1, scan: 2 };
  var backend = null;

  function install(b) { backend = b || null; }
  function isInstalled() { return !!backend; }

  function costOf(runType) {
    return Object.prototype.hasOwnProperty.call(COSTS, runType) ? COSTS[runType] : null;
  }

  // 멱등 키 — 모바일망은 재시도한다. 이게 없으면 한 분석에 두 번 과금된다(SPEC §1).
  function newIdem() {
    try { if (typeof crypto !== "undefined" && crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "i-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }

  function noBackend() { return Promise.resolve({ ok: false, reason: "no-backend", state: null }); }

  // 백엔드가 동기적으로 던져도 호출부는 늘 Promise 를 받아야 한다 —
  // 그러지 않으면 await 하는 쪽이 try/catch 없이 깨진다.
  function callBackend(fn) {
    try {
      var p = fn();
      if (!p || typeof p.then !== "function") return Promise.resolve({ ok: false, reason: "backend-error", state: null });
      return p["catch"](function () { return { ok: false, reason: "backend-error", state: null }; });
    } catch (e) {
      return Promise.resolve({ ok: false, reason: "backend-error", state: null });
    }
  }

  function get() { return backend ? callBackend(function () { return backend.get(); }) : noBackend(); }

  // 계약: spend(runType, idem) → { ok, state, reason? }
  // idem 은 필수다. 비어 있으면 원장이 "키 없음"끼리 같은 항목으로 보고 두 번째부터 멱등 재생으로
  // 답한다 — MSWallet.spend("full") 한 번이면 그 뒤 모든 Full 이 공짜가 된다. 돈 코드라 진입부에서 막는다.
  function spend(runType, idem) {
    if (typeof idem !== "string" || idem === "") return Promise.resolve({ ok: false, reason: "bad-idem", state: null });
    if (!backend) return noBackend();
    if (costOf(runType) == null) return Promise.resolve({ ok: false, reason: "unknown-runtype", state: null });
    return callBackend(function () { return backend.spend(runType, idem); });
  }
  function refund(idem) { return backend ? callBackend(function () { return backend.refund(idem); }) : noBackend(); }

  // 계약: checkin() → { ok, state, granted, capped, reason? }
  // granted = 실제로 지급된 개수(출석 1 + 7일 상자 5). capped = 상한 때문에 지급하려던 것보다 적게
  // 준 경우 true — 화면이 "cap reached, the rest was discarded" 를 띄우는 근거다(SPEC-economy §3).
  // 8b 서버 원장도 이 필드를 반드시 돌려줘야 한다. 빠지면 그 안내가 조용히 사라진다.
  function checkin() { return backend ? callBackend(function () { return backend.checkin(); }) : noBackend(); }

  return { COSTS: COSTS, install: install, isInstalled: isInstalled, costOf: costOf,
           newIdem: newIdem, get: get, spend: spend, refund: refund, checkin: checkin };
});
