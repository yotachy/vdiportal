// map/backtest/retro/graph-ablate.js — 지표 노드 열거 + 그래프 ablation(순수)
"use strict";

const NON_INDICATOR = new Set(["ticker", "price", "combine", "predict"]);

function listIndicatorNodes(graph) {
  return (graph.nodes || [])
    .filter(n => n.kind === "block" && !NON_INDICATOR.has(n.blockType))
    .map(n => ({ id: n.id, blockType: n.blockType }));
}

// nodeId 노드와 그를 참조하는 엣지 제거. 깊은 복제(원본 불변).
function ablateGraph(graph, nodeId) {
  const g = JSON.parse(JSON.stringify(graph));
  g.nodes = (g.nodes || []).filter(n => n.id !== nodeId);
  g.edges = (g.edges || []).filter(e => e.from !== nodeId && e.to !== nodeId);
  return g;
}

// blockType 지표를 추가하고 combine 노드로 배선. 깊은 복제(원본 불변).
function addIndicatorNode(graph, blockType, params) {
  const g = JSON.parse(JSON.stringify(graph));
  const id = "add_" + blockType;
  g.nodes = g.nodes || [];
  g.edges = g.edges || [];
  g.nodes.push({ id, kind: "block", blockType, params: params || {}, conviction: 0, weight: 50 });
  const comb = g.nodes.find(n => n.blockType === "combine");
  if (comb) g.edges.push({ id: "e_" + id, from: id, fromSide: "right", to: comb.id, toSide: "left" });
  return g;
}

module.exports = { listIndicatorNodes, ablateGraph, addIndicatorNode };
