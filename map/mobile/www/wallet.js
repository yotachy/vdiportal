// 지갑 계약. 서버가 이미 있는 것처럼 짠다 — SPEC-economy.md 가 "되돌리기 어려운 둘"로 지목한
// 원장의 위치와 보상 경로를 나중에 붙일 수 있게 하는 이음매다.
// 클라이언트는 잔량도 델타도 계산하지 않는다. 의도(spend)만 보내고 백엔드가 준 state 를 그린다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSWallet = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 전부 시안에서 온 값이다 — full·custom 은 5a·4a, slot 은 2b("Add TSLA — Costs 1 Scoop").
  // 금액은 서버(wallet-lib.php w_costs)가 정본이고 이 표는 시트의 미리보기 표시용이다.
  //
  // scan = 0 (무료, 사용자 결정 2026-08-17). 값이 2c 목록("Watchlist signal scan 2")과 무료
  // 사이를 두 번 오갔는데, 이번 결정의 근거는 시안 판독이 아니라 경제다: 온보딩 지급이 5 인데
  // 스캔이 2 면 두 번 만에 바닥나 **목록을 훑어보는 주 루프가 유료가 된다.** 스쿱은 심화·전문
  // 분석에서만 쓴다. 서버 w_costs 도 같은 라운드에 0 이 됐다 — 한쪽만 바꾸면 표시와 차감이 갈린다.
  // watchlist.js beginScan 은 원래부터 `if (!cost)` 무료 갈래를 갖고 있어 이 값 하나로 차감이
  // 사라진다(과금 배선은 지우지 않는다 — 값이 되돌아오면 그대로 다시 산다).
  var COSTS = { full: 3, custom: 5, slot: 1, scan: 0 };
  var backend = null;

  function install(b) { backend = b || null; }
  function isInstalled() { return !!backend; }

  function costOf(runType) {
    return Object.prototype.hasOwnProperty.call(COSTS, runType) ? COSTS[runType] : null;
  }

  // 멱등 키 — 모바일망은 재시도한다. 이게 없으면 한 분석에 두 번 과금된다(SPEC §1).
  // ledger.idem 은 전역 UNIQUE(모든 계정을 통틀어)라, 두 클라이언트가 우연히 같은 키를 뽑으면
  // 나중 쪽이 "이미 있음" 으로 튕긴다 — wallet-http.js 의 uuid()(deviceId)에서 이미 거부한
  // Date.now()+Math.random() 패턴을 여기서도 쓰고 있었다(리뷰 지적). 같은 이유로 같은 처방:
  // crypto.getRandomValues 로 진짜 엔트로피를 뽑는다.
  function newIdem() {
    try {
      if (typeof crypto !== "undefined" && crypto && crypto.getRandomValues) {
        var bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        var hex = "";
        for (var i = 0; i < bytes.length; i++) hex += ("0" + bytes[i].toString(16)).slice(-2);
        return "i-" + hex;
      }
    } catch (e) {}
    // crypto 가 없는 극단적 구형 런타임 전용 최후 폴백 — 실배포 대상엔 crypto.getRandomValues 가 있다.
    return "i-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
                + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  }

  // 재시도 안전성 분류. "definitely-not-charged" 사유는 idem 을 버리고 새로 사도 안전하다 —
  // 서버가 spend 자체를 시작하지 않았다고 확신할 수 있다. "maybe-charged" 사유(응답을 못 받았을
  // 뿐 서버는 이미 처리했을 수 있다)는 idem 을 반드시 재사용해야 한다: 새 idem 은 원장(전역
  // UNIQUE)에서 완전히 다른 키라 멱등이 못 잡고 이중 차감된다(I-H, 리뷰 지적).
  var MAYBE_CHARGED = { network: 1, "server-error": 1, busy: 1 };
  function maybeCharged(reason) {
    return Object.prototype.hasOwnProperty.call(MAYBE_CHARGED, reason || "");
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

  // 계약: spend(runType, idem, ref?) → { ok, state, reason? }
  // idem 은 필수다. 비어 있으면 원장이 "키 없음"끼리 같은 항목으로 보고 두 번째부터 멱등 재생으로
  // 답한다 — MSWallet.spend("full") 한 번이면 그 뒤 모든 Full 이 공짜가 된다. 돈 코드라 진입부에서 막는다.
  // ref 는 옵션(종목 심볼 등) — 8b 는 24시간 종목 권리 판정을 서버에서 한다. 안 주면 null 로
  // 넘긴다: undefined 를 그대로 보내면 JSON.stringify 가 그 키 자체를 지워 백엔드마다 다르게 해석한다.
  function spend(runType, idem, ref) {
    if (typeof idem !== "string" || idem === "") return Promise.resolve({ ok: false, reason: "bad-idem", state: null });
    if (!backend) return noBackend();
    if (costOf(runType) == null) return Promise.resolve({ ok: false, reason: "unknown-runtype", state: null });
    return callBackend(function () { return backend.spend(runType, idem, ref || null); });
  }
  function refund(idem) { return backend ? callBackend(function () { return backend.refund(idem); }) : noBackend(); }

  // 계약: checkin() → { ok, state, granted, capped, reason? }
  // granted = 실제로 지급된 개수(출석 1 + 7일 상자 5). capped = 상한 때문에 지급하려던 것보다 적게
  // 준 경우 true — 화면이 "cap reached, the rest was discarded" 를 띄우는 근거다(SPEC-economy §3).
  // 8b 서버 원장도 이 필드를 반드시 돌려줘야 한다. 빠지면 그 안내가 조용히 사라진다.
  function checkin() { return backend ? callBackend(function () { return backend.checkin(); }) : noBackend(); }

  // get/spend/refund/checkin 과 같은 이유로 callBackend 를 거친다(위 55행 주석) — 백엔드가
  // 동기적으로 던지거나 프로미스를 reject 해도 호출부는 늘 Promise 를 받아야 한다.
  function authStart() { return backend ? callBackend(function () { return backend.authStart(); }) : noBackend(); }
  function authPoll(n) { return backend ? callBackend(function () { return backend.authPoll(n); }) : noBackend(); }
  // signOut 은 원래 동기다(서버 op 없음) — 그래도 백엔드가 던지면 호출부까지 그대로 새어나가면
  // 안 되므로 try/catch 로 삼킨다.
  function signOut() { try { if (backend && backend.signOut) backend.signOut(); } catch (e) {} }
  function signedIn() { return !!(backend && backend.signedIn && backend.signedIn()); }

  // get/spend/refund/checkin/authStart/authPoll 과 같은 이유로 callBackend 를 거친다(위 55행
  // 주석) — 백엔드가 동기적으로 던지거나 프로미스를 reject 해도 호출부는 늘 Promise 를 받는다.
  function adConfig() { return backend ? callBackend(function () { return backend.adConfig(); }) : noBackend(); }
  function adState() { return backend ? callBackend(function () { return backend.adState(); }) : noBackend(); }

  return { COSTS: COSTS, install: install, isInstalled: isInstalled, costOf: costOf,
           newIdem: newIdem, maybeCharged: maybeCharged, get: get, spend: spend, refund: refund, checkin: checkin,
           authStart: authStart, authPoll: authPoll, signOut: signOut, signedIn: signedIn,
           adConfig: adConfig, adState: adState };
});
