import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSGraph = require("../www/graph.js");
const ForgeCore = require("../../forge-core.js");

test("full32Graph 의 지표 노드 수가 엔진의 indicatorCount 와 같다", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  const inds = MSGraph.indicatorTypes(g);
  assert.equal(inds.length, ForgeCore.indicatorCount, "지표 " + inds.length + "종 ≠ 엔진 " + ForgeCore.indicatorCount + "종");
});

test("지표 종류에 중복이 없다", () => {
  const inds = MSGraph.indicatorTypes(MSGraph.full32Graph(ForgeCore));
  assert.equal(new Set(inds).size, inds.length);
});

test("원본 sampleGraph 를 변형하지 않는다", () => {
  const before = JSON.stringify(ForgeCore.sampleGraph());
  MSGraph.full32Graph(ForgeCore);
  assert.equal(JSON.stringify(ForgeCore.sampleGraph()), before);
});

test("추가한 노드는 price 를 먹고 combine 으로 나간다", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  const price = g.nodes.find(n => n.blockType === "price");
  const comb = g.nodes.find(n => n.blockType === "combine");
  for (const bt of MSGraph.MISSING) {
    const node = g.nodes.find(n => n.blockType === bt);
    assert.ok(node, bt + " 노드 없음");
    assert.ok(g.edges.some(e => e.from === price.id && e.to === node.id), bt + " ← price 엣지 없음");
    assert.ok(g.edges.some(e => e.from === node.id && e.to === comb.id), bt + " → combine 엣지 없음");
  }
});

test("conviction 을 0 으로 눕혀 시연용 확신값이 판정에 섞이지 않게 한다", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  assert.ok(g.nodes.every(n => !n.conviction), "conviction 잔존");
});

test("엔진이 이 그래프로 실제로 돈다", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  const d = ForgeCore.makeDemoSeries(800);
  const res = ForgeCore.run(g, d, { futW: 60, timeframe: "1day" });
  assert.ok(res.verdict, "verdict 없음");
  assert.ok(Number.isFinite(res.verdict.score));
  assert.equal(res.prediction.path.length, 60);
  assert.ok(res.verdict.confluence.total >= 20, "합류 표본이 19지표 수준 — 추가 노드가 반영되지 않았다");
});
