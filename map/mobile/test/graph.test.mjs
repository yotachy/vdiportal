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
  // 실측 26. >= 20 은 오타 하나(26→25)를 통과시켜 이름 검증 구실을 못 했다.
  assert.ok(res.verdict.confluence.total >= 26,
    "합류 표본 " + res.verdict.confluence.total + " < 26 — 추가 노드가 반영되지 않았다");
});

// blockType 이름 오타는 개수로 안 잡힌다(개수는 그대로 32). 엔진은 모르는 blockType 을
// `values[id] = ins[0].slice()` 로 처리해 원시 종가(수백 단위)를 combine 에 흘려보낸다 —
// −1..1 오실레이터들 사이에 DC 오프셋이 섞이는데 아무도 눈치채지 못한다.
// 오라클: 정상 오버레이는 zeros, 정상 오실레이터는 자기 계열, 미지의 타입만 price 사본.
test("MISSING 의 모든 blockType 이 엔진이 아는 이름이다 (모르면 price 가 통과된다)", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  const d = ForgeCore.makeDemoSeries(400);
  const { values } = ForgeCore.evalBlocks(g, d);
  for (const bt of MSGraph.MISSING) {
    const n = g.nodes.find(x => x.blockType === bt);
    assert.ok(n, bt + " 노드 없음");
    assert.notDeepEqual(values[n.id], d.price, bt + " — 엔진이 모르는 blockType (price 통과)");
  }
});

test("volume 노드의 sampleGraph 합성 표본을 지운다 — 남기면 모든 종목이 그 BTC 표본을 읽는다", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  const vn = g.nodes.find(n => n.blockType === "volume");
  assert.ok(vn, "volume 노드 없음");
  assert.equal(vn.series, undefined, "구워진 series 잔존");
  assert.ok(ForgeCore.sampleGraph().nodes.find(n => n.blockType === "volume").series.length > 0,
    "원본에 series 가 없다면 이 방어는 의미가 없다 — 엔진 구조가 바뀐 것");
});

test("실거래량이 판정에 실제로 닿는다 — 후반 거래량 급증이 score 를 바꾼다", () => {
  const d = ForgeCore.makeDemoSeries(400);
  const flat = d.price.map(() => 1000);
  const spike = flat.slice();
  for (let i = spike.length - 20; i < spike.length; i++) spike[i] = 50000;

  function score(vol) {
    const g = MSGraph.full32Graph(ForgeCore);
    const data = { price: d.price, candle: d.candle };
    if (vol) { data.volume = vol; MSGraph.setVolume(g, vol); }
    return ForgeCore.run(g, data, { futW: 60, timeframe: "1day" }).verdict.score;
  }
  assert.notEqual(score(spike), score(null), "거래량 급증이 판정에 반영되지 않았다 — 배선이 끊겼다");
  assert.notEqual(score(spike), score(flat), "평탄 거래량과 급증 거래량이 같은 판정 — 배선이 끊겼다");
});

test("setVolume 은 전 봉 유효할 때만 심고, 아니면 엔진 합성 폴백으로 되돌린다", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  const vn = g.nodes.find(n => n.blockType === "volume");

  assert.equal(MSGraph.setVolume(g, [10, 20, 30]), true);
  assert.deepEqual(vn.series, [10, 20, 30]);

  // 앞 주기 거래량이 남으면 다음 주기 판정이 오염된다 — 무효 입력은 반드시 지운다.
  assert.equal(MSGraph.setVolume(g, [10, undefined, 30]), false);
  assert.equal(vn.series, undefined, "무효 입력인데 앞 값이 남았다");

  assert.equal(MSGraph.setVolume(g, null), false);
  assert.equal(vn.series, undefined);
});

test("basicGraph 는 지표가 정확히 Basic 5종뿐이다", () => {
  const g = MSGraph.basicGraph(ForgeCore);
  const inds = MSGraph.indicatorTypes(g).sort();
  assert.deepEqual(inds, [...MSGraph.BASIC].sort());
});

test("basicGraph 도 엔진이 실제로 돈다", () => {
  const g = MSGraph.basicGraph(ForgeCore);
  const d = ForgeCore.makeDemoSeries(400);
  const res = ForgeCore.run(g, d, { futW: 60, timeframe: "1day" });
  assert.ok(Number.isFinite(res.verdict.score));
  assert.equal(res.prediction.path.length, 60);
});

test("basicGraph 와 full32Graph 의 판정이 다르다 — 같으면 가지치기가 안 먹은 것", () => {
  const d = ForgeCore.makeDemoSeries(400);
  const b = ForgeCore.run(MSGraph.basicGraph(ForgeCore), d, { futW: 60, timeframe: "1day" });
  const f = ForgeCore.run(MSGraph.full32Graph(ForgeCore), d, { futW: 60, timeframe: "1day" });
  assert.notEqual(b.verdict.confluence.total, f.verdict.confluence.total);
});

test("basicGraph 도 volume 노드의 baked 합성 시리즈를 지운다", () => {
  const g = MSGraph.basicGraph(ForgeCore);
  const vn = g.nodes.find(n => n.blockType === "volume");
  assert.ok(vn, "volume 노드가 없다");
  assert.equal(vn.series, undefined, "sampleGraph 의 합성 BTC 거래량이 남았다");
});

test("basicGraph 에도 setVolume 이 먹는다", () => {
  const g = MSGraph.basicGraph(ForgeCore);
  assert.equal(MSGraph.setVolume(g, [10, 20, 30]), true);
  assert.deepEqual(g.nodes.find(n => n.blockType === "volume").series, [10, 20, 30]);
});
