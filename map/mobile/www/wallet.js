// 지갑 계약. 서버가 이미 있는 것처럼 짠다 — SPEC-economy.md 가 "되돌리기 어려운 둘"로 지목한
// 원장의 위치와 보상 경로를 나중에 붙일 수 있게 하는 이음매다.
// 클라이언트는 잔량도 델타도 계산하지 않는다. 의도(spend)만 보내고 백엔드가 준 state 를 그린다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSWallet = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // full·custom 은 시안 5a·4a, slot 은 2b("Add TSLA — Costs 1 Scoop")에서 왔다.
  // scan 은 SPEC 의 runType 목록과 2c 의 Spend 목록에 이름만 있고 가격이 어디에도 없다 —
  // 워치리스트의 기본 동작이라 값을 임의로 정하지 않고 무료로 둔다.
  var COSTS = { full: 3, custom: 5, slot: 1, scan: 0 };
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

  function get() { return backend ? backend.get() : noBackend(); }
  function spend(runType, idem) {
    if (!backend) return noBackend();
    if (costOf(runType) == null) return Promise.resolve({ ok: false, reason: "unknown-runtype", state: null });
    return backend.spend(runType, idem);
  }
  function refund(idem) { return backend ? backend.refund(idem) : noBackend(); }
  function checkin() { return backend ? backend.checkin() : noBackend(); }

  return { COSTS: COSTS, install: install, isInstalled: isInstalled, costOf: costOf,
           newIdem: newIdem, get: get, spend: spend, refund: refund, checkin: checkin };
});
