// 리포트가 무엇을 어떤 순서로 그리는가 — 선언만. DOM 도 계산도 없다.
//
// 세 티어가 같은 선언을 공유하는 이유: 전문은 심화의 블록을 하나도 빼지 않고 조절판만
// 더한 것이다(설계 §3.7). 각 화면이 자기 조립 코드를 갖고 있으면 그 규칙을 사람이
// 눈으로 지켜야 하고, 5스쿱을 낸 사용자가 한 줄 손해 보는 것을 아무도 못 잡는다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSReportBlocks", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 기본은 셋뿐이다. 화면 아래가 비는 것이 설계다 — 스크롤할 것이 없다는 사실 자체가
  // "여기까지가 무료"를 말한다(시안 18a).
  var BASIC = ["verdict", "comb", "chart"];

  // 심화는 값이 큰 것부터. 「한 문장으로」가 맨 위인 이유는 숫자를 먼저 내면 대부분이
  // 해석을 못 하고 닫기 때문이다(시안 19b).
  var FULL = ["sentence", "forecast", "chart", "dissent", "horizons", "hitrate", "readings", "compare"];

  // 조절판은 판정보다 위에 온다(시안 18c) — 내가 만진 것이 결과를 바꿨다는 순서다.
  var CUSTOM = ["weights"].concat(FULL);

  var KIND = {
    verdict: "verdict", comb: "comb", chart: "chart", sentence: "sentence",
    forecast: "forecast", dissent: "dissent", horizons: "horizons",
    hitrate: "hitrate", readings: "readings", compare: "compare", weights: "weights"
  };

  function forTier(tier) {
    var ids = tier === "custom" ? CUSTOM : (tier === "full" ? FULL : BASIC);
    var out = [], i;
    for (i = 0; i < ids.length; i++) out.push({ id: ids[i], kind: KIND[ids[i]] });
    return out;
  }

  return { forTier: forTier, COUNTS: { basic: BASIC.length, full: FULL.length, custom: CUSTOM.length } };
});
