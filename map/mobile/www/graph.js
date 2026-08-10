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

  // 그래프의 volume 노드에 실거래량을 심는다. 엔진의 거래량 계열 드리프트
  // (volume·volumeprofile·vwap·mfi·cmf)는 data.volume 이 아니라 이 노드의 values 를 읽는다
  // (forge-core.js run() `_vol`/`_vpvol`/`_vwvol`/`_mfvol`/`_cmvol`) — 그래서 data.volume 만
  // 넘기면 실거래량이 드리프트에 닿지 않고 synthVolume(price) 합성치가 쓰인다.
  // volume=null 이면 series 를 지워 엔진 합성 폴백으로 되돌린다(주기마다 초기화 필요 —
  // 안 지우면 앞 주기의 거래량이 뒤 주기에 남는다).
  function setVolume(graph, volume) {
    var vn = (graph.nodes || []).find(function (n) { return n.blockType === "volume"; });
    if (!vn) return false;
    var ok = Array.isArray(volume) && volume.length >= 2 &&
             volume.every(function (v) { return typeof v === "number" && isFinite(v); });
    if (ok) vn.series = volume.slice();
    else delete vn.series;
    return ok;
  }

  function full32Graph(ForgeCore) {
    // 깊은 복사 — sampleGraph 는 호출마다 새 객체를 주지만, 캐시로 바뀌어도 안전하도록.
    var g = JSON.parse(JSON.stringify(ForgeCore.sampleGraph()));
    // 시연용 확신값이 판정에 섞이면 측정치가 그래프 구성이 아니라 하드코딩 값을 반영한다.
    // volume 노드의 series 는 sampleGraph 가 구워 넣은 합성 BTC 표본(30k→68k)이라
    // 그대로 두면 어떤 종목을 분석하든 거래량 지표가 그 표본을 읽는다 — 반드시 지운다.
    g.nodes.forEach(function (n) {
      n.conviction = 0;
      if (n.blockType === "volume") delete n.series;
    });

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

  // Basic 티어 = 핵심 5지표(Lv1). Full 대비 5031봉에서 약 128배 싸다(20.2ms vs 2581.7ms).
  var BASIC = ["ma", "macd", "rsi", "bollinger", "volume"];

  function basicGraph(ForgeCore) {
    var g = full32Graph(ForgeCore);   // 합성 거래량 제거·conviction 0 처리를 그대로 물려받는다
    var drop = {};
    (g.nodes || []).forEach(function (n) {
      if (!n.blockType || INFRA.indexOf(n.blockType) >= 0) return;
      if (BASIC.indexOf(n.blockType) < 0) drop[n.id] = true;
    });
    g.nodes = g.nodes.filter(function (n) { return !drop[n.id]; });
    g.edges = g.edges.filter(function (e) { return !drop[e.from] && !drop[e.to]; });
    return g;
  }

  return { INFRA: INFRA, MISSING: MISSING, BASIC: BASIC, indicatorTypes: indicatorTypes, full32Graph: full32Graph, basicGraph: basicGraph, setVolume: setVolume };
});
