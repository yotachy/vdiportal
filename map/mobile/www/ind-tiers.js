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

  return { TIERS: TIERS, NOT_TUNABLE: NOT_TUNABLE, all: all, tunable: tunable, lvOf: lvOf };
});
