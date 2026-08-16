// 지표 4등급(Lv1~Lv4). 시안 20a 의 판독문 화면이 이 라벨로 섹션을 나눈다.
//
// 원본은 PC 의 forge-state.js `IND_TIERS` 다. 모바일이 그 파일을 로드하지 않으므로(엔진만
// 공유하고 UI 는 갈린다) 여기 한 벌이 더 존재한다 — **두 벌이 생기는 것 자체가 위험**이라
// 관문(ind-tiers.test.mjs)이 세 가지를 대조한다: ① 합이 ForgeCore.indicatorCount 와 같은가
// ② Lv1 이 MSGraph.BASIC(기본 티어가 읽는 5종)과 같은가 ③ 중복·누락이 없는가.
// 셋 중 하나라도 어긋나면 등급표가 낡았다는 뜻이고, 화면은 "32개 중 24개"라고 말하면서
// 목록에는 다른 수를 그리게 된다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSIndTiers = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TIERS = [
    { lv: 1, name: "핵심 지표", types: ["ma", "macd", "rsi", "bollinger", "volume"] },
    { lv: 2, name: "주요 지표", types: ["trend", "adx", "stochastic", "fib", "ichimoku", "pivot", "psar", "gann"] },
    { lv: 3, name: "보조·전문", types: ["vwap", "supertrend", "atr", "volumeprofile", "structure", "keltner", "donchian", "cci", "williams", "aroon", "mfi"] },
    { lv: 4, name: "고급·심화", types: ["elliott", "smc", "cycle", "phasefold", "roc", "ao", "cmf", "pattern"] }
  ];

  // 전문분석 가중치 레일에서 빠지는 둘(인벤토리 §0 충돌 1). 판독문·심화 판정은 32종 전부지만,
  // 사용자가 배율을 만지는 대상은 30종이다.
  var NOT_TUNABLE = ["gann", "pattern"];

  // ── 투자성향 프리셋 4종 (사용자 결정 D5, 2026-08-17) ────────────────────────────────
  // 지표 집합의 출처는 PC 의 forge-ui.js `_PRESET_DEF` 다 — 시안 4종이 위험성향이 아니라
  // **매매 스타일**이라 포지의 프리셋과 거의 그대로 대응한다. 지어낸 것이 아니다.
  //
  // 프리셋이 하는 일 둘:
  //  ① 선택 집합 — 포지의 프리셋이 원래 하던 일(표시할 지표 집합). Lv1 5종은 언제나 더해진다.
  //  ② 배율 k   — 집합에 든 지표를 k 배로 올린다. **k 는 아직 1.0 이다**(사용자 결정 D6):
  //     시안의 예시 숫자(2.0/1.4/0.6/0.3)를 확정값으로 쓰지 않고 백테스트로 정한다.
  //     k=1.0 이어도 프리셋은 그대로 동작한다 — ①이 판정 분모와 예측을 실제로 바꾼다.
  //     측정이 끝나면 이 상수 하나가 바뀐다.
  var PRESET_K = 1.0;

  var PRESETS = [
    { key: "trend",      name: "추세 추종",   types: ["ma", "trend", "ichimoku", "supertrend", "adx"] },
    { key: "momentum",   name: "단기 모멘텀", types: ["rsi", "macd", "stochastic", "bollinger"] },
    { key: "reversion",  name: "평균 회귀",   types: ["rsi", "stochastic", "bollinger", "fib", "elliott", "structure"] },
    { key: "volatility", name: "변동성 우선", types: ["bollinger", "atr", "supertrend", "adx", "structure", "volume"] }
  ];

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
      out[t] = (inSet.indexOf(t) >= 0) ? PRESET_K : 1.0;
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

  return { TIERS: TIERS, NOT_TUNABLE: NOT_TUNABLE, PRESETS: PRESETS, PRESET_K: PRESET_K,
           selectionOf: selectionOf, weightsOf: weightsOf, all: all, tunable: tunable, lvOf: lvOf };
});
