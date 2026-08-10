// Full 티어(32지표) 전략 그래프. sampleGraph() 는 지표가 19종뿐이라 13종을 덧붙인다.
// 노드 스키마: {id, kind:"block", blockType, params:{}, x, y, title, conviction, weight}
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSGraph = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 지표가 아닌 블록 — 지표 개수를 셀 때 제외한다.
  var INFRA = ["ticker", "price", "combine", "predict"];

  // sampleGraph 에 없는 13종(IND_TIERS 32종 − sampleGraph 19종).
  var MISSING = ["pivot", "psar", "gann", "keltner", "donchian", "cci",
                 "williams", "aroon", "mfi", "roc", "ao", "cmf", "pattern"];

  function indicatorTypes(graph) {
    var seen = [];
    (graph.nodes || []).forEach(function (n) {
      if (!n.blockType || INFRA.indexOf(n.blockType) >= 0) return;
      if (seen.indexOf(n.blockType) < 0) seen.push(n.blockType);
    });
    return seen;
  }

  function full32Graph(ForgeCore) {
    // 깊은 복사 — sampleGraph 는 호출마다 새 객체를 주지만, 캐시로 바뀌어도 안전하도록.
    var g = JSON.parse(JSON.stringify(ForgeCore.sampleGraph()));
    // 시연용 확신값이 판정에 섞이면 측정치가 그래프 구성이 아니라 하드코딩 값을 반영한다.
    g.nodes.forEach(function (n) { n.conviction = 0; });

    var price = g.nodes.find(function (n) { return n.blockType === "price"; });
    var comb = g.nodes.find(function (n) { return n.blockType === "combine"; });
    if (!price || !comb) throw new Error("sampleGraph 구조 변경 — price/combine 노드를 찾을 수 없다");

    var have = indicatorTypes(g);
    MISSING.forEach(function (bt, i) {
      if (have.indexOf(bt) >= 0) return;   // 엔진이 sampleGraph 에 추가했다면 건너뛴다
      var id = "m_" + bt;
      g.nodes.push({ id: id, kind: "block", blockType: bt, params: {},
                     x: 620, y: i * 70, title: bt, conviction: 0, weight: 50 });
      g.edges.push({ from: price.id, to: id }, { from: id, to: comb.id });
    });
    return g;
  }

  return { INFRA: INFRA, MISSING: MISSING, indicatorTypes: indicatorTypes, full32Graph: full32Graph };
});
