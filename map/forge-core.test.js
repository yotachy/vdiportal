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

test("evalBlocks computes price, ma, weighted combine", () => {
  const data = { price: [2, 4, 6, 8, 10], n: 5 };
  const g = {
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "m", kind: "block", blockType: "ma", params: { len: 2 } },
      { id: "c", kind: "block", blockType: "combine", params: { weights: { p: 1, m: 1 } } }
    ],
    edges: [{ from: "p", to: "m" }, { from: "p", to: "c" }, { from: "m", to: "c" }]
  };
  const { values } = ForgeCore.evalBlocks(g, data);
  assert.deepStrictEqual(values.p, [2, 4, 6, 8, 10]);
  assert.deepStrictEqual(values.m, [2, 3, 5, 7, 9]);            // len2 SMA(앞쪽 부분창)
  assert.deepStrictEqual(values.c, [2, 3.5, 5.5, 7.5, 9.5]);    // (p+m)/2
});

test("PDM finds the embedded period", () => {
  const P0 = 40, z = []; for (let i = 0; i < 400; i++) z.push(Math.sin(2 * Math.PI * i / P0));
  const dn = ForgeCore.detrendNorm(z);
  assert.strictEqual(dn.length, z.length);
  const tNear = ForgeCore.pdmTheta(dn, P0), tFar = ForgeCore.pdmTheta(dn, P0 * 1.37);
  assert.ok(tNear < tFar); // 진짜 주기에서 θ가 더 작다
  const { best } = ForgeCore.scanPeriod(dn, { pmin: 20, pmax: 80, step: 1 });
  assert.ok(Math.abs(best - P0) <= 2); // 임베드 주기 복원
});

test("evalBlocks phasefold attaches period meta", () => {
  const P0 = 32, price = []; for (let i = 0; i < 256; i++) price.push(100 + Math.sin(2 * Math.PI * i / P0));
  const g = { nodes: [{ id: "p", kind: "block", blockType: "price" },
                      { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 16, pmax: 64 } }],
           edges: [{ from: "p", to: "f" }] };
  const r = ForgeCore.evalBlocks(g, { price, n: price.length });
  assert.ok(r.meta && r.meta.f && Math.abs(r.meta.f.best - P0) <= 2);
});

test("run returns prediction, signal, verdict shapes", () => {
  const data = ForgeCore.makeDemoSeries({n:300, seed:3, period:48});
  const g = { nodes:[
      {id:"p",kind:"block",blockType:"price"},
      {id:"f",kind:"block",blockType:"phasefold",params:{pmin:20,pmax:96}},
      {id:"m",kind:"block",blockType:"ma",params:{len:10}},
      {id:"c",kind:"block",blockType:"combine"},
      {id:"o",kind:"block",blockType:"predict"}
    ], edges:[{from:"p",to:"f"},{from:"p",to:"m"},{from:"f",to:"c"},{from:"m",to:"c"},{from:"c",to:"o"}] };
  const out = ForgeCore.run(g, data, {futW:60});
  assert.strictEqual(out.prediction.path.length, 60);
  assert.strictEqual(out.prediction.lo.length, 60);
  assert.ok(out.prediction.hi[0] >= out.prediction.lo[0]);
  assert.strictEqual(out.signal.length, data.n);
  assert.ok(out.signal.every(v => v>=-100 && v<=100));
  assert.ok(["bull","bear","neutral"].includes(out.verdict.regime));
  assert.ok(typeof out.verdict.target === "number");
});
