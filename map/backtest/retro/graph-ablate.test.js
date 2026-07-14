// map/backtest/retro/graph-ablate.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const FC = require("../../forge-core.js");
const { listIndicatorNodes, ablateGraph, addIndicatorNode } = require("./graph-ablate.js");

test("listIndicatorNodes excludes ticker/price/combine/predict", () => {
  const g = FC.sampleGraph();
  const inds = listIndicatorNodes(g);
  const types = new Set(inds.map(n => n.blockType));
  ["ticker", "price", "combine", "predict"].forEach(t => assert.ok(!types.has(t), "제외 실패: " + t));
  assert.ok(inds.some(n => n.blockType === "rsi"), "rsi 지표 포함 기대");
});

test("ablateGraph removes node and its edges, leaves original intact", () => {
  const g = FC.sampleGraph();
  const n0 = g.nodes.length, e0 = g.edges.length;
  const ab = ablateGraph(g, "s_rsi");
  assert.strictEqual(ab.nodes.filter(n => n.id === "s_rsi").length, 0);
  assert.strictEqual(ab.edges.filter(e => e.from === "s_rsi" || e.to === "s_rsi").length, 0);
  assert.strictEqual(g.nodes.length, n0, "원본 노드 불변");
  assert.strictEqual(g.edges.length, e0, "원본 엣지 불변");
});

test("ablated graph still runs and yields a different score", () => {
  const g = FC.sampleGraph(); g.nodes.forEach(n => { if (n.conviction) n.conviction = 0; });
  const price = Array.from({ length: 320 }, (_, i) => 100 * Math.pow(1.0015, i) * (1 + 0.01 * Math.sin(i * 0.6)));
  const candle = price.map((c, i) => ({ o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 }));
  const past = { price, candle };
  const base = FC.run(g, past, { futW: 20, timeframe: "1day" });
  const ab = FC.run(ablateGraph(g, "s_ma"), past, { futW: 20, timeframe: "1day" });
  assert.ok(base.verdict && ab.verdict, "둘 다 실행되어야");
  assert.notStrictEqual(base.verdict.score, ab.verdict.score, "지표 제거 시 score 변화 기대");
});

test("addIndicatorNode adds a wired node without mutating the original", () => {
  const g = FC.sampleGraph();
  const n0 = g.nodes.length, e0 = g.edges.length;
  const comb = g.nodes.find(n => n.blockType === "combine");
  const ag = addIndicatorNode(g, "roc", { period: 12 });
  const added = ag.nodes.find(n => n.id === "add_roc");
  assert.ok(added, "add_roc 노드 생성");
  assert.deepStrictEqual(added.params, { period: 12 });
  assert.strictEqual(added.conviction, 0);
  assert.ok(ag.edges.some(e => e.from === "add_roc" && e.to === comb.id), "combine으로 배선");
  assert.strictEqual(g.nodes.length, n0, "원본 노드 불변");
  assert.strictEqual(g.edges.length, e0, "원본 엣지 불변");
});

test("added indicator actually changes the engine prediction (roc on an uptrend)", () => {
  const g = FC.sampleGraph(); g.nodes.forEach(n => { if (n.conviction) n.conviction = 0; });
  const price = Array.from({ length: 340 }, (_, i) => 100 * Math.pow(1.003, i));
  const candle = price.map(c => ({ o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 }));
  const past = { price, candle };
  const base = FC.run(g, past, { futW: 20, timeframe: "1day" });
  const add = FC.run(addIndicatorNode(g, "roc", { period: 12 }), past, { futW: 20, timeframe: "1day" });
  assert.ok(base.verdict && add.verdict, "둘 다 실행");
  assert.notStrictEqual(add.verdict.score, base.verdict.score, "roc 추가 시 score 변화 기대");
});
