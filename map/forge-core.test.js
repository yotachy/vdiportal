const test = require("node:test");
const assert = require("node:assert");
const ForgeCore = require("./forge-core.js");

test("forge-core exposes a version string", () => {
  assert.strictEqual(typeof ForgeCore.version, "string");
  assert.ok(ForgeCore.version.length > 0);
});

test("makeDemoSeries is deterministic and well-shaped", () => {
  const a = ForgeCore.makeDemoSeries({ n: 100, seed: 7, period: 50 });
  const b = ForgeCore.makeDemoSeries({ n: 100, seed: 7, period: 50 });
  assert.strictEqual(a.n, 100);
  assert.strictEqual(a.price.length, 100);
  assert.strictEqual(a.candle.length, 100);
  assert.deepStrictEqual(a.price, b.price); // 같은 seed → 동일
  const c = ForgeCore.makeDemoSeries({ n: 100, seed: 8, period: 50 });
  assert.notDeepStrictEqual(a.price, c.price); // 다른 seed → 상이
  for (const k of a.candle) assert.ok(k.h >= k.o && k.h >= k.c && k.l <= k.o && k.l <= k.c);
});

test("buildDAG topo-sorts blocks, drops free nodes, detects cycles", () => {
  const g = {
    nodes: [
      { id: "src", kind: "block", blockType: "price" },
      { id: "ma", kind: "block", blockType: "ma", params: { len: 5 } },
      { id: "note", kind: "free" },
      { id: "out", kind: "block", blockType: "predict" }
    ],
    edges: [{ from: "src", to: "ma" }, { from: "ma", to: "out" }, { from: "note", to: "out" }]
  };
  const d = ForgeCore.buildDAG(g);
  assert.deepStrictEqual(d.order, ["src", "ma", "out"]); // note 제외, 위상순
  assert.deepStrictEqual(d.inputsOf["out"], ["ma"]);   // free 입력 제외
  const cyc = {
    nodes: [{ id: "a", kind: "block", blockType: "ma" }, { id: "b", kind: "block", blockType: "ma" }],
    edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }]
  };
  assert.throws(() => ForgeCore.buildDAG(cyc), /cycle/);
});
