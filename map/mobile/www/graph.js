// Full 티어(32지표) 전략 그래프. sampleGraph() 는 지표가 19종뿐이라 13종을 덧붙인다.
// 노드 스키마: {id, kind:"block", blockType, params:{}, x, y, title, conviction, weight}
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./ind-tiers.js"));
  else root.MSGraph = factory(root.MSIndTiers);
})(typeof self !== "undefined" ? self : this, function (Tiers) {
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

  // ── 전문분석(custom) — 사용자 가중치를 엔진 인자로 옮긴다 ──────────────────────────────
  //
  // **엔진을 고칠 것이 없다.** forge-core.js 가 이미 두 경로를 받는다:
  //   opts.driftWeights[blockType] — run() 의 DW(t), 0~3 클램프(forge-core.js:1989).
  //                                  지표별 bias 기여 배율이라 예측선·판정이 여기서 갈린다.
  //   node.weight (기본 50)        — evalBlocks 의 combine 가중(sw/50) + aggregateConviction.
  // 시안의 0.1–3.0× 는 driftWeights 의 클램프 범위와 그대로 맞는다. 우연이 아니라 같은 축이다.
  //
  // ⚠ 두 경로를 **함께** 움직인다. 한쪽만 바꾸면 방향(드리프트)과 합성 시계열이 서로 다른
  // 가중을 쓰게 되고, 화면은 "가중치를 올렸는데 반대 개수만 바뀌고 예측선은 그대로"처럼 보인다.
  var W_MIN = 0.1, W_MAX = 3.0;   // 시안 10a 의 슬라이더 범위. 엔진 클램프(0~3) 안쪽이다.

  function clampW(m) {
    if (typeof m !== "number" || !isFinite(m)) return 1;
    return Math.max(W_MIN, Math.min(W_MAX, m));
  }

  // 사용자가 만질 수 있는 지표 30종(gann·pattern 제외 — 인벤토리 §0 충돌 1, 사용자 결정 D7).
  function tunableTypes() { return Tiers ? Tiers.tunable() : []; }

  // weights = { blockType: 배율 }. **키가 없는 지표는 미선택**이라 그래프에서 노드를 지운다.
  // 배율 0 으로 두지 않는 이유: 0 은 드리프트만 죽이고 combine·판독문에는 남아
  // "안 골랐는데 목록에 있는" 상태가 된다.
  function customGraph(ForgeCore, weights) {
    var w = weights || {};
    var g = full32Graph(ForgeCore);
    var tun = tunableTypes();
    var drop = {};
    (g.nodes || []).forEach(function (n) {
      if (!n.blockType || INFRA.indexOf(n.blockType) >= 0) return;
      // Lv1 핵심 5종은 시안이 "항상 포함"이라 못박았다 — 선택 목록에 없어도 남는다(배율 1.0).
      var core = BASIC.indexOf(n.blockType) >= 0;
      var tunableHere = tun.indexOf(n.blockType) >= 0;
      // 조절 대상이 아닌 지표(gann·pattern)는 전문분석 판정에서 빠진다 — 18c 가 분모를
      // 30 으로 그린다. 만질 수 없는 지표가 판정에 들어가면 조절판이 거짓말이 된다.
      if (!core && !tunableHere) { drop[n.id] = true; return; }
      var has = Object.prototype.hasOwnProperty.call(w, n.blockType);
      if (!has && !core) { drop[n.id] = true; return; }
      n.weight = Math.round(50 * clampW(has ? w[n.blockType] : 1));
    });
    g.nodes = g.nodes.filter(function (n) { return !drop[n.id]; });
    g.edges = g.edges.filter(function (e) { return !drop[e.from] && !drop[e.to]; });
    return g;
  }

  // run(graph, data, opts) 에 넘길 opts.driftWeights. 그래프에 남은 지표만 담는다 —
  // 없는 노드의 배율을 넘기면 엔진이 그 지표를 안 읽으므로 조용히 무시되고, 나중에
  // "왜 이 값이 아무 효과가 없나"를 다시 조사하게 된다.
  function driftWeightsOf(graph, weights) {
    var w = weights || {}, out = {};
    (graph.nodes || []).forEach(function (n) {
      if (!n.blockType || INFRA.indexOf(n.blockType) >= 0) return;
      out[n.blockType] = clampW(Object.prototype.hasOwnProperty.call(w, n.blockType) ? w[n.blockType] : 1);
    });
    return out;
  }

  return { INFRA: INFRA, MISSING: MISSING, BASIC: BASIC, indicatorTypes: indicatorTypes,
           full32Graph: full32Graph, basicGraph: basicGraph, setVolume: setVolume,
           customGraph: customGraph, driftWeightsOf: driftWeightsOf,
           tunableTypes: tunableTypes, clampW: clampW, W_MIN: W_MIN, W_MAX: W_MAX };
});
