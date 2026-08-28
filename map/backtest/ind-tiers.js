// 지표 4등급(Lv1~Lv4). 시안 20a 의 판독문 화면이 이 라벨로 섹션을 나눈다.
//
// **사본이 아니다(2026-08-28)** — 등급표는 엔진 레지스트리(`ForgeCore.indicatorTiers()`)에서
// 파생한다. 예전엔 여기에 지표 id 목록이 한 벌 더 있었고, 지표를 추가하면 두 곳이 갈렸다.
// 이제 엔진에 지표 하나를 넣으면 이 표도 자동으로 늘어난다(열린 엔진 원칙).
// 브라우저에서는 MSGlobals 로, node 에서는 require 로 같은 원본을 본다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("../forge-core.js"));
  else MSGlobals.define("MSIndTiers", factory(root.ForgeCore));
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  var TIERS = core.indicatorTiers();   // 엔진 레지스트리 파생 — 여기에 목록을 다시 적지 말 것

  // 전문분석 가중치 레일에서 빠지는 둘(인벤토리 §0 충돌 1). 판독문·심화 판정은 32종 전부지만,
  // 사용자가 배율을 만지는 대상은 30종이다.
  var NOT_TUNABLE = ["gann", "pattern"];

  // ── 투자성향 프리셋 4종 (사용자 결정 D5, 2026-08-17) ────────────────────────────────
  // 지표 집합의 출처는 PC 의 forge-ui.js `_PRESET_DEF` 다 — 시안 4종이 위험성향이 아니라
  // **매매 스타일**이라 포지의 프리셋과 거의 그대로 대응한다. 지어낸 것이 아니다.
  //
  // 프리셋이 하는 일 둘:
  //  ① 선택 집합 — 포지의 프리셋이 원래 하던 일(표시할 지표 집합). Lv1 5종은 언제나 더해진다.
  //  ② 배율 k   — 집합에 든 지표를 k 배로 올린다. **측정으로 정했다**(P2 T9, 2026-08-17):
  //     backtest/preset-k.js 가 픽스처 87종 × k 6값을 walk-forward 로 재고,
  //     backtest/preset-k-holdout.js 가 종목을 짝/홀로 갈라 양쪽에서 같은 방향으로
  //     좋아지는지 확인했다. **한쪽에서만 좋아진 값은 채택하지 않았다.**
  //
  //     고를 때 쓴 지표는 방향 적중이 아니라 ECE(확률 오차)다. 방향은 k 전 구간에서
  //     소수점 둘째 자리까지 **고정**이었다 — 가중치는 확신의 크기를 바꾸지 부호를
  //     바꾸지 않는다. 가중치로 방향을 사려는 시도는 성립하지 않는다.
  //
  //     시안의 예시 숫자(2.0/1.4/0.6/0.3)를 그대로 썼으면 손해였다: 추세 추종은 k 가
  //     오를수록 ECE 가 단조롭게 나빠진다(1.18 → 3.56%p). 그래서 1.0 이다 — 값이 없어서
  //     남은 기본값이 아니라, 재보고 고른 값이다.
  var PRESET_K = 1.0;   // k 를 안 정한 프리셋의 기본값(배율 없음)

  var PRESETS = [
    // k 없음: 스윕이 단조 악화를 보였다(ECE 1.18 → 3.56%p). 콘 커버는 반대로 좋아지지만
    // (73.5 → 77.6%) 고르는 지표를 둘로 두면 좋은 쪽을 주워 담게 된다 — ECE 하나로 고정했다.
    { key: "trend",      name: "추세 추종",   types: ["ma", "trend", "ichimoku", "supertrend", "adx"] },
    // 양쪽 반쪽 다 개선(A −0.45%p · B −0.18%p). 폭은 2.5배 차이라 크기는 못 믿는다 — 부호만 믿는다.
    { key: "momentum",   name: "단기 모멘텀", types: ["rsi", "macd", "stochastic", "bollinger"], k: 2.5 },
    // 양쪽 반쪽이 정확히 같은 폭으로 개선(−0.28%p · −0.28%p).
    { key: "reversion",  name: "평균 회귀",   types: ["rsi", "stochastic", "bollinger", "fib", "elliott", "structure"], k: 2.0 },
    // 인샘플에선 k=2.5 가 최선(0.55 → 0.39%p)이었으나 **표본 밖에서 뒤집혔다**(A −0.13 · B +0.05).
    // 표본을 외운 값이라 채택하지 않는다. 넷 중 이미 콘 커버가 가장 정직한 프리셋이다(79.1%).
    { key: "volatility", name: "변동성 우선", types: ["bollinger", "atr", "supertrend", "adx", "structure", "volume"] }
  ];

  // 프리셋의 배율 — 안 정한 프리셋은 배율 없음(1.0). 측정으로 신호가 확인된 것만 값을 갖는다.
  function kOf(presetKey) {
    for (var i = 0; i < PRESETS.length; i++)
      if (PRESETS[i].key === presetKey) return PRESETS[i].k || PRESET_K;
    return PRESET_K;
  }

  // 프리셋 → 선택 집합. Lv1 핵심 5종은 언제나 더해진다(시안 10a "항상 포함").
  function selectionOf(presetKey, core) {
    var p = null, i;
    for (i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === presetKey) p = PRESETS[i];
    var tun = tunable();
    var set = (p ? p.types : tun).filter(function (t) { return tun.indexOf(t) >= 0; });
    (core || []).forEach(function (t) { if (set.indexOf(t) < 0 && tun.indexOf(t) >= 0) set.push(t); });
    return set;
  }

  // 프리셋 → 가중치 맵(= MSGraph.customGraph 의 입력). 선택된 것만 키를 갖는다 —
  // 키가 없다는 것이 곧 "미선택"이고, 그래프에서 노드가 빠진다.
  function weightsOf(presetKey, core) {
    var p = null, i;
    for (i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === presetKey) p = PRESETS[i];
    var inSet = p ? p.types : [];
    var out = {};
    selectionOf(presetKey, core).forEach(function (t) {
      out[t] = (inSet.indexOf(t) >= 0) ? kOf(presetKey) : 1.0;
    });
    return out;
  }

  function all() {
    var out = [];
    TIERS.forEach(function (t) { out = out.concat(t.types); });
    return out;
  }
  function tunable() {
    return all().filter(function (t) { return NOT_TUNABLE.indexOf(t) < 0; });
  }
  function lvOf(type) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].types.indexOf(type) >= 0) return TIERS[i].lv;
    return null;
  }

  return { TIERS: TIERS, NOT_TUNABLE: NOT_TUNABLE, PRESETS: PRESETS, PRESET_K: PRESET_K, kOf: kOf,
           selectionOf: selectionOf, weightsOf: weightsOf, all: all, tunable: tunable, lvOf: lvOf };
});
