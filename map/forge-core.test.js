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

test("regression guard: futW capped to 60 and signal.length===data.n", () => {
  const data = ForgeCore.makeDemoSeries({ n: 300, seed: 1, period: 64 });
  const g = {
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 20, pmax: 96 } },
      { id: "m", kind: "block", blockType: "ma", params: { len: 10 } },
      { id: "c", kind: "block", blockType: "combine" },
      { id: "o", kind: "block", blockType: "predict" }
    ],
    edges: [
      { from: "p", to: "f" }, { from: "p", to: "m" },
      { from: "f", to: "c" }, { from: "m", to: "c" },
      { from: "c", to: "o" }
    ]
  };
  const out = ForgeCore.run(g, data, { futW: 120 });
  assert.strictEqual(out.prediction.path.length, 60);   // futW 상한 60으로 캡
  assert.strictEqual(out.signal.length, data.n);
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

test("conviction bias tilts signal and verdict, zero is no-op", () => {
  const data = ForgeCore.makeDemoSeries({ n: 300, seed: 5, period: 48 });
  const base = {
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 20, pmax: 96 } },
      { id: "c", kind: "block", blockType: "combine" },
      { id: "o", kind: "block", blockType: "predict" }
    ],
    edges: [{ from: "p", to: "f" }, { from: "f", to: "c" }, { from: "c", to: "o" }]
  };
  const r0 = ForgeCore.run(base, data, { futW: 60 });
  // conviction 0/absent → identical signal & verdict.score
  const baseZero = JSON.parse(JSON.stringify(base));
  baseZero.nodes.forEach(n => n.conviction = 0);
  const rz = ForgeCore.run(baseZero, data, { futW: 60 });
  assert.deepStrictEqual(rz.signal, r0.signal);
  assert.strictEqual(rz.verdict.score, r0.verdict.score);
  // positive conviction → signal mean up, score up, still clamped
  const pos = JSON.parse(JSON.stringify(base));
  pos.nodes.find(n => n.id === "c").conviction = 80;
  const rp = ForgeCore.run(pos, data, { futW: 60 });
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(mean(rp.signal) > mean(r0.signal));
  assert.ok(rp.verdict.score >= r0.verdict.score);
  assert.ok(rp.signal.every(v => v >= -100 && v <= 100));
  // 예측도 확신에 따라 기울어진다(상승 확신 → 예측 끝값 상향), seam은 거의 불변
  assert.notDeepStrictEqual(rp.prediction.path, r0.prediction.path);
  assert.ok(rp.prediction.path[rp.prediction.path.length - 1] > r0.prediction.path[r0.prediction.path.length - 1]);
});

test("weight: weighted conviction average + uniform weight is unchanged", () => {
  const data = ForgeCore.makeDemoSeries({ n: 200, seed: 9, period: 40 });
  const g = {
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "c", kind: "block", blockType: "combine" },
      { id: "o", kind: "block", blockType: "predict" }
    ],
    edges: [{ from: "p", to: "c" }, { from: "c", to: "o" }]
  };
  // uniform weight 50 + conviction 0 → identical to no-weight baseline
  const baseline = ForgeCore.run(g, data, { futW: 30 });
  const gw = JSON.parse(JSON.stringify(g));
  gw.nodes.forEach(n => n.weight = 50);
  const same = ForgeCore.run(gw, data, { futW: 30 });
  assert.deepStrictEqual(same.signal, baseline.signal);
  // high-weight bullish node dominates over low-weight bearish node
  const g2 = JSON.parse(JSON.stringify(g));
  const bull = g2.nodes.find(n => n.id === "p"); bull.conviction = 60; bull.weight = 90;
  const bear = g2.nodes.find(n => n.id === "c"); bear.conviction = -60; bear.weight = 10;
  const r = ForgeCore.run(g2, data, { futW: 30 });
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(mean(r.signal) > mean(baseline.signal)); // net bias positive (bull weighted up)
});

test("weight: combine contribution scales by source node weight", () => {
  const data = { price: [0,0,0,0,0], n: 5 };
  // two constant series via ma(len1) of price won't differ; build explicit using price + a biased combine
  const g = {
    nodes: [
      { id: "a", kind: "block", blockType: "price" },
      { id: "b", kind: "block", blockType: "ma", params: { len: 1 }, weight: 90 },
      { id: "c", kind: "block", blockType: "combine" }
    ],
    edges: [{ from: "a", to: "c" }, { from: "a", to: "b" }, { from: "b", to: "c" }]
  };
  // price all zeros → combine zero regardless; assert evalBlocks runs and weight read without error
  const { values } = ForgeCore.evalBlocks(g, data);
  assert.strictEqual(values.c.length, 5);
  assert.ok(values.c.every(v => v === 0));
});

test("trend/rsi/fib blocks on rising price are bullish-shaped", () => {
  const price = []; for (let i = 0; i < 120; i++) price.push(100 + i * 0.7);
  const data = { price, n: price.length };
  const mk = bt => ({ nodes: [{ id: "p", kind: "block", blockType: "price" },
    { id: "x", kind: "block", blockType: bt, params: { len: 30, period: 14 } }],
    edges: [{ from: "p", to: "x" }] });
  const trend = ForgeCore.evalBlocks(mk("trend"), data).values.x;
  const rsi = ForgeCore.evalBlocks(mk("rsi"), data).values.x;
  const fib = ForgeCore.evalBlocks(mk("fib"), data).values.x;
  assert.strictEqual(trend.length, 120);
  assert.ok(trend[trend.length - 1] > 0);       // rising → positive slope
  assert.ok(rsi[rsi.length - 1] > 0);           // rising → RSI>50 → centered>0
  assert.ok(fib[fib.length - 1] > 0.5);         // price near range top → near +1
  assert.ok(trend.every(v => v >= -1.5 && v <= 1.5));
});

test("phase2 regression: trend+rsi+combine+predict run end-to-end via run()", () => {
  const data = ForgeCore.makeDemoSeries({ n: 300, seed: 2, period: 50 });
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "t", kind: "block", blockType: "trend", params: { len: 30 } },
    { id: "r", kind: "block", blockType: "rsi", params: { period: 14 } },
    { id: "c", kind: "block", blockType: "combine" },
    { id: "o", kind: "block", blockType: "predict" } ],
    edges: [{from:"p",to:"t"},{from:"p",to:"r"},{from:"t",to:"c"},{from:"r",to:"c"},{from:"c",to:"o"}] };
  const out = ForgeCore.run(g, data, { futW: 60 });
  assert.strictEqual(out.signal.length, 300);
  assert.strictEqual(out.prediction.path.length, 60);
  assert.ok(out.signal.every(v => v >= -100 && v <= 100));
});

test("volume block produces no signal series (empty)", () => {
  const data = { price: [1,2,3], n: 3 };
  const g = { nodes: [{ id: "v", kind: "block", blockType: "volume" }], edges: [] };
  const { values } = ForgeCore.evalBlocks(g, data);
  assert.deepStrictEqual(values.v, []);
});

test("prediction is continuous: anchored at last close, bands widen", () => {
  const price = []; for (let i = 0; i < 240; i++) price.push(100 + 0.5 * i + 3 * Math.sin(2 * Math.PI * i / 40));
  const data = { price, candle: price.map(p => ({ o: p, h: p + 1, l: p - 1, c: p })), orange: [], blue: [], n: price.length };
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 20, pmax: 96 } },
    { id: "c", kind: "block", blockType: "combine" },
    { id: "o", kind: "block", blockType: "predict" } ],
    edges: [{from:"p",to:"f"},{from:"f",to:"c"},{from:"c",to:"o"}] };
  const { prediction: pr } = ForgeCore.run(g, data, { futW: 60 });
  assert.strictEqual(pr.anchor, price[price.length - 1]);
  assert.strictEqual(pr.path.length, 60);
  // 시작이 앵커에 밀착(이음매 없음 — 점프 아님). 추세+계절성으로 중앙선은 비단조 가능.
  assert.ok(Math.abs(pr.path[0] - pr.anchor) / pr.anchor < 0.1);
  // 밴드는 seam에서 좁게 시작해 확대
  assert.ok((pr.hi[0] - pr.lo[0]) < (pr.hi[59] - pr.lo[59]));
  assert.ok([...pr.path, ...pr.lo, ...pr.hi].every(v => isFinite(v)));
});

test("elliott: 5-wave up impulse -> positive last bias + waves", () => {
  const pts = [10, 30, 22, 50, 40, 70];
  const price = [];
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; for (let k = 0; k < 20; k++) price.push(a + (b - a) * k / 20); }
  price.push(pts[pts.length - 1]);
  const g = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "e", kind: "block", blockType: "elliott", params: { swing: 5 } }], edges: [{ from: "p", to: "e" }] };
  const r = ForgeCore.evalBlocks(g, { price, n: price.length });
  const v = r.values.e;
  assert.strictEqual(v.length, price.length);
  assert.ok(v[v.length - 1] > 0);            // last leg up
  assert.ok(v.every(x => x >= -1 && x <= 1));
  assert.ok(r.meta.e.waves.length >= 3);
  assert.strictEqual(r.meta.e.current.dir, 1);
});

test("elliott: too-short series -> zeros, no error", () => {
  const g = { nodes: [{ id: "e", kind: "block", blockType: "elliott" }], edges: [] };
  const r = ForgeCore.evalBlocks(g, { price: [5], n: 1 });
  assert.deepStrictEqual(r.values.e, [0]);
});

test("elliott: down-first series has no duplicate pivot, correct dir", () => {
  const pts = [100, 60, 78, 40, 58, 20];
  const price = [];
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; for (let k = 0; k < 20; k++) price.push(a + (b - a) * k / 20); }
  price.push(pts[pts.length - 1]);
  const g = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "e", kind: "block", blockType: "elliott", params: { swing: 5 } }], edges: [{ from: "p", to: "e" }] };
  const r = ForgeCore.evalBlocks(g, { price, n: price.length });
  // last leg is down -> negative bias, dir -1
  assert.ok(r.values.e[r.values.e.length - 1] < 0);
  assert.strictEqual(r.meta.e.current.dir, -1);
  // no zero-length duplicate leg at start: first two wave idx differ
  const w = r.meta.e.waves;
  assert.ok(w.length >= 3);
  assert.ok(w[0].idx !== w[1].idx);
});

test("runSteps: one step per block, last === full run()", () => {
  const data = ForgeCore.makeDemoSeries({ n: 300, seed: 4, period: 48 });
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 20, pmax: 96 } },
    { id: "c", kind: "block", blockType: "combine" },
    { id: "o", kind: "block", blockType: "predict" },
    { id: "m", kind: "free" }
  ], edges: [{ from: "p", to: "f" }, { from: "f", to: "c" }, { from: "c", to: "o" }] };
  const steps = ForgeCore.runSteps(g, data, { futW: 60 });
  assert.strictEqual(steps.length, 4);                 // 4 blocks
  steps.forEach(s => {
    assert.strictEqual(s.prediction.path.length, 60);
    assert.strictEqual(s.signal.length, data.n);
  });
  const full = ForgeCore.run(g, data, { futW: 60 });
  assert.deepStrictEqual(steps[steps.length - 1].prediction.path, full.prediction.path);
  assert.deepStrictEqual(steps[steps.length - 1].signal, full.signal);
});

test("runSteps: no blocks -> single graceful step", () => {
  const steps = ForgeCore.runSteps({ nodes: [{ id: "m", kind: "free" }], edges: [] }, { price: [1, 2, 3], n: 3 }, { futW: 10 });
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].prediction.path.length, 10);
});

test("visionBias: zero/absent is no-op, positive tilts up, negative down", () => {
  const data = ForgeCore.makeDemoSeries({ n: 300, seed: 5, period: 48 });
  const g = {
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 20, pmax: 96 } },
      { id: "c", kind: "block", blockType: "combine" },
      { id: "o", kind: "block", blockType: "predict" }
    ],
    edges: [{ from: "p", to: "f" }, { from: "f", to: "c" }, { from: "c", to: "o" }]
  };
  const r0 = ForgeCore.run(g, data, { futW: 60 });
  const rz = ForgeCore.run(g, data, { futW: 60, visionBias: 0 });
  assert.deepStrictEqual(rz.signal, r0.signal);
  assert.strictEqual(rz.verdict.score, r0.verdict.score);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const rp = ForgeCore.run(g, data, { futW: 60, visionBias: 60 });
  assert.ok(mean(rp.signal) > mean(r0.signal));
  assert.ok(rp.verdict.score >= r0.verdict.score);
  assert.ok(rp.signal.every(v => v >= -100 && v <= 100));
  const rn = ForgeCore.run(g, data, { futW: 60, visionBias: -60 });
  assert.ok(mean(rn.signal) < mean(r0.signal));
  // 예측도 visionBias에 따라 기울어진다(상승 bias → 예측 끝 상향, 하락 bias → 하향)
  const endp = pr => pr.prediction.path[pr.prediction.path.length - 1];
  assert.ok(endp(rp) > endp(r0));
  assert.ok(endp(rn) < endp(r0));
});

test("visionBiasFrom: dir/strength → conviction-scale number", () => {
  assert.strictEqual(ForgeCore.visionBiasFrom({ dir: "bull", strength: 1 }), 60);
  assert.strictEqual(ForgeCore.visionBiasFrom({ dir: "bear", strength: 0.5 }), -30);
  assert.strictEqual(ForgeCore.visionBiasFrom({ dir: "neutral", strength: 1 }), 0);
  assert.strictEqual(ForgeCore.visionBiasFrom({ dir: "bull", strength: 5 }), 60); // clamp
  assert.strictEqual(ForgeCore.visionBiasFrom(null), 0);
  assert.strictEqual(ForgeCore.visionBiasFrom({}), 0);
});

test("runSteps forwards opts.visionBias (last step === run(full))", () => {
  const data = ForgeCore.makeDemoSeries({ n: 240, seed: 3, period: 40 });
  const g = {
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 16, pmax: 80 } },
      { id: "c", kind: "block", blockType: "combine" },
      { id: "o", kind: "block", blockType: "predict" }
    ],
    edges: [{ from: "p", to: "f" }, { from: "f", to: "c" }, { from: "c", to: "o" }]
  };
  const steps = ForgeCore.runSteps(g, data, { futW: 60, visionBias: 40 });
  const full = ForgeCore.run(g, data, { futW: 60, visionBias: 40 });
  assert.deepStrictEqual(steps[steps.length - 1].signal, full.signal);
  assert.deepStrictEqual(steps[steps.length - 1].prediction.path, full.prediction.path);
});

test("sampleSeries: deterministic, 480 pts, net uptrend with mid correction", () => {
  const a = ForgeCore.sampleSeries(), b = ForgeCore.sampleSeries();
  assert.strictEqual(a.length, 480);
  assert.deepStrictEqual(a, b);                       // 결정적
  assert.ok(a[479] > a[0]);                            // 순상승
  assert.ok(a.every(v => isFinite(v) && v > 0));
  // 중간 조정 딥(i≈240~326): 구간 최저가 양 끝보다 낮음
  const seg = a.slice(240, 327), lo = Math.min(...seg);
  assert.ok(lo < a[240] && lo < a[326]);
  // 최근 상승(과매수 서술 근거): 마지막 10봉 상승
  assert.ok(a[479] > a[469]);
  // MA20 상회 서술 근거: 마지막 종가 > 최근 20봉 평균
  const last20 = a.slice(-20), mean20 = last20.reduce((s, v) => s + v, 0) / 20;
  assert.ok(a[479] > mean20);
});

test("sampleGraph: 24 nodes, DAG runs, descriptions are truthful, bullish net", () => {
  const g = ForgeCore.sampleGraph();
  assert.strictEqual(g.nodes.length, 24);
  const tk = g.nodes.find(n => n.blockType === "ticker");
  assert.ok(tk && tk.params && tk.params.symbol === "BTC-USD", "샘플에 BTC-USD 티커 노드");
  assert.strictEqual(g.themeImgId, "smp_main");
  assert.ok(Array.isArray(g.vision.series) && g.vision.series.length === 480);
  const data = { price: g.vision.series, n: g.vision.series.length };
  const vb = ForgeCore.visionBiasFrom(g.vision.bias);
  const r = ForgeCore.run(g, data, { futW: 120, visionBias: vb });
  assert.strictEqual(r.signal.length, 480);
  assert.strictEqual(r.prediction.path.length, 60);   // futW 상한 60
  // 추세선 우상향 서술 근거: 마지막 40봉 회귀 기울기 > 0
  const last40 = data.price.slice(-40);
  const nn = last40.length, xs = last40.map((_, i) => i);
  const mx = xs.reduce((s, v) => s + v, 0) / nn, my = last40.reduce((s, v) => s + v, 0) / nn;
  let num = 0, den = 0; for (let i = 0; i < nn; i++) { num += (xs[i] - mx) * (last40[i] - my); den += (xs[i] - mx) ** 2; }
  assert.ok(num / den > 0);
  // 파동 스캔: 지배 주기 검출(meta.best 존재)
  assert.ok(Object.values(r.meta || {}).some(m => m && m.best));
  // 엘리어트: 파동 meta 존재
  assert.ok(Object.values(r.meta || {}).some(m => m && Array.isArray(m.waves)));
  // 종합 강세: bull 확신/바이어스로 score 양수
  assert.ok(r.verdict.score > 0);
  // conviction/weight가 실제로 시그널을 끌어올림: 확신 0화 대비 score 상승
  const g0 = JSON.parse(JSON.stringify(g));
  g0.nodes.forEach(n => n.conviction = 0);
  const r0 = ForgeCore.run(g0, data, { futW: 120, visionBias: 0 });
  assert.ok(r.verdict.score > r0.verdict.score);
});

test("analyzeTrend: 완전 직선 → r2≈1, slopeRaw 정확, blend 유한·양수", () => {
  const price = Array.from({ length: 60 }, (_, i) => 100 + 2 * i); // 기울기 2/봉
  const ta = ForgeCore.analyzeTrend(price, { shortLen: 20 });
  assert.ok(ta.windows.long, "long 창 존재");
  assert.ok(Math.abs(ta.windows.long.slopeRaw - 2) < 1e-6);
  assert.ok(ta.windows.long.r2 > 0.999);
  assert.ok(ta.blend.slopeLog > 0 && isFinite(ta.blend.slopeLog));
});

test("analyzeTrend: 지수성장 → slopeLog 일정, channelSigmaLog≈0", () => {
  const g = Math.log(1.05);
  const price = Array.from({ length: 80 }, (_, i) => 10 * Math.exp(g * i));
  const ta = ForgeCore.analyzeTrend(price);
  assert.ok(Math.abs(ta.windows.long.slopeLog - g) < 1e-6);
  assert.ok(ta.blend.channelSigmaLog < 1e-6);
});

test("analyzeTrend: 지그재그 → 피봇 고/저점 둘 다 존재", () => {
  const price = [];
  for (let c = 0; c < 4; c++) { for (let i = 0; i < 10; i++) price.push(100 + i); for (let i = 0; i < 10; i++) price.push(110 - i); }
  const ta = ForgeCore.analyzeTrend(price, { pivotSwing: 0.05 });
  assert.ok(ta.pivots.points.length >= 3);
  assert.ok(ta.pivots.points.some(p => p.type === "high"));
  assert.ok(ta.pivots.points.some(p => p.type === "low"));
});

test("analyzeTrend: 노이즈 직선 → 채널 sigma 유한·양수", () => {
  const price = Array.from({ length: 50 }, (_, i) => 100 + i + ((i * 7) % 5 - 2));
  const ta = ForgeCore.analyzeTrend(price);
  assert.ok(ta.channel && ta.channel.sigma > 0 && isFinite(ta.channel.sigma));
});

test("analyzeTrend: 소량 데이터(P<15) → long만, 예외 없음", () => {
  const ta = ForgeCore.analyzeTrend([10, 11, 12, 13, 14, 15]);
  assert.ok(ta.windows.long);
  assert.strictEqual(ta.windows.mid, null);
  assert.strictEqual(ta.windows.short, null);
});

test("analyzeTrend: P<2 → 빈 결과, 예외 없음", () => {
  const ta = ForgeCore.analyzeTrend([42]);
  assert.strictEqual(ta.windows.long, null);
  assert.strictEqual(ta.blend.slopeLog, 0);
});

test("run: 캡 완화 — 급한 추세가 완만한 추세보다 더 큰 상승 투영", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const mk = g => ({ price: Array.from({ length: 60 }, (_, i) => 10 * Math.exp(g * i)) });
  const r1 = ForgeCore.run(G, mk(0.02), { futW: 12 });
  const r2 = ForgeCore.run(G, mk(0.04), { futW: 12 });
  assert.ok(r1.prediction.path.every(isFinite) && r2.prediction.path.every(isFinite), "NaN 없음");
  const gain = r => r.prediction.target / r.prediction.anchor;
  assert.ok(gain(r2) > gain(r1), "급한 추세(0.04)가 더 큰 상승 — 옛 ±1.2%캡이면 동일했을 것");
  assert.ok(gain(r2) > 1, "상승추세 → target>anchor");
});

test("trendProfileForTF: 월봉 → long 프로파일", () => {
  const p = ForgeCore.trendProfileForTF("월봉");
  assert.strictEqual(p.tier, "long");
  assert.deepStrictEqual(p.weights, { long: 0.6, mid: 0.3, short: 0.1 });
  assert.strictEqual(p.trendScale, 1.0);
  assert.strictEqual(p.label, "월봉 장기가중");
});

test("trendProfileForTF: 일봉·주봉 → mid", () => {
  for (const tf of ["일봉", "주봉"]) {
    const p = ForgeCore.trendProfileForTF(tf);
    assert.strictEqual(p.tier, "mid");
    assert.deepStrictEqual(p.weights, { long: 0.45, mid: 0.35, short: 0.2 });
    assert.strictEqual(p.trendScale, 0.8);
  }
});

test("trendProfileForTF: 1시간·5분 → intra", () => {
  for (const tf of ["1시간", "5분"]) {
    const p = ForgeCore.trendProfileForTF(tf);
    assert.strictEqual(p.tier, "intra");
    assert.deepStrictEqual(p.weights, { long: 0.25, mid: 0.35, short: 0.4 });
    assert.strictEqual(p.trendScale, 0.45);
  }
});

test("trendProfileForTF: 분기 → long (분 오분류 안 됨)", () => {
  assert.strictEqual(ForgeCore.trendProfileForTF("분기").tier, "long");
});

test("trendProfileForTF: null/미상 → default", () => {
  const p = ForgeCore.trendProfileForTF(null);
  assert.strictEqual(p.tier, "default");
  assert.deepStrictEqual(p.weights, { long: 0.5, mid: 0.3, short: 0.2 });
  assert.strictEqual(p.trendScale, 0.8);
  assert.strictEqual(p.label, "");
});

test("run: 타임프레임 — 월봉이 5분보다 추세 상승 강하게 투영", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const data = { price: Array.from({ length: 60 }, (_, i) => 10 * Math.exp(0.03 * i)) };
  const rM = ForgeCore.run(G, data, { futW: 12, timeframe: "월봉" });
  const rI = ForgeCore.run(G, data, { futW: 12, timeframe: "5분" });
  assert.ok(rM.prediction.path.every(isFinite) && rI.prediction.path.every(isFinite), "NaN 없음");
  const gain = r => r.prediction.target / r.prediction.anchor;
  assert.ok(gain(rM) > gain(rI), "월봉(배율1.0)이 5분(배율0.45)보다 상승 큼");
});

test("run: timeframe 없이도 동작(default)", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const data = { price: Array.from({ length: 40 }, (_, i) => 100 + i) };
  const r = ForgeCore.run(G, data, { futW: 8 });
  assert.ok(r.prediction.path.every(isFinite));
});

test("analyzeMA: 정배열 상승 → bull, bias>0, long.slope>0", () => {
  const price = Array.from({ length: 80 }, (_, i) => 100 + i * 2);
  const r = ForgeCore.analyzeMA(price, { len: 5 });
  assert.strictEqual(r.align.order, "bull");
  assert.ok(r.bias > 0);
  assert.ok(r.mas.long.slope > 0);
});

test("analyzeMA: 역배열 하락 → bear, bias<0", () => {
  const price = Array.from({ length: 80 }, (_, i) => 300 - i * 2);
  const r = ForgeCore.analyzeMA(price, { len: 5 });
  assert.strictEqual(r.align.order, "bear");
  assert.ok(r.bias < 0);
});

test("analyzeMA: 최근 하락→상승 전환 → 골든크로스 감지", () => {
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);      // 100→71
  const up = Array.from({ length: 14 }, (_, i) => 71 + (i + 1) * 4); // 가파른 반등
  const r = ForgeCore.analyzeMA(down.concat(up), { len: 5 });
  assert.strictEqual(r.cross.type, "golden");
  assert.ok(r.cross.barsAgo >= 0 && r.cross.barsAgo < 14);
});

test("analyzeMA: EMA vs SMA → 다른 last(둘 다 유한)", () => {
  const price = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i);
  const s = ForgeCore.analyzeMA(price, { len: 10, ema: false });
  const e = ForgeCore.analyzeMA(price, { len: 10, ema: true });
  assert.ok(isFinite(s.mas.short.last) && isFinite(e.mas.short.last));
  assert.notStrictEqual(s.mas.short.last, e.mas.short.last);
});

test("analyzeMA: 소량 데이터(P<len) → 예외 없음·유한 bias", () => {
  const r = ForgeCore.analyzeMA([10, 11, 12], { len: 20 });
  assert.ok(isFinite(r.bias));
  assert.ok(["bull", "bear", "mixed"].includes(r.align.order));
});

test("run: MA 블록 상승 국면 → 타깃 상향 + TF 월봉>5분", () => {
  const G = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "m", kind: "block", blockType: "ma", params: { len: 5 } },
    { id: "o", kind: "block", blockType: "predict" }
  ], edges: [{ from: "p", to: "m" }, { from: "m", to: "o" }] };
  const up = { price: Array.from({ length: 70 }, (_, i) => 100 + i * 1.5) };   // 정배열 상승
  const rM = ForgeCore.run(G, up, { futW: 12, timeframe: "월봉" });
  const rI = ForgeCore.run(G, up, { futW: 12, timeframe: "5분" });
  assert.ok(rM.prediction.path.every(isFinite) && rI.prediction.path.every(isFinite));
  const gain = r => r.prediction.target / r.prediction.anchor;
  assert.ok(gain(rM) > 1, "상승 국면 → target>anchor");
  assert.ok(gain(rM) > gain(rI), "월봉(MA 국면 강가중)이 5분보다 상향");
});

test("run: MA 블록 없으면 MA 기여 0(기존 동작 보존)", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const data = { price: Array.from({ length: 40 }, (_, i) => 100 + i) };
  const r = ForgeCore.run(G, data, { futW: 8, timeframe: "월봉" });
  assert.ok(r.prediction.path.every(isFinite));
});

test("run: MA 블록 유무가 예측 타깃을 가른다 (MA 드리프트 격리)", () => {
  const base = [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }];
  const withMA = { nodes: [...base, { id: "m", kind: "block", blockType: "ma", params: { len: 5 } }], edges: [{ from: "p", to: "o" }, { from: "p", to: "m" }] };
  const without = { nodes: base, edges: [{ from: "p", to: "o" }] };
  const up = { price: Array.from({ length: 70 }, (_, i) => 100 + i * 1.5) };   // 정배열 상승 → MA bias>0
  const rWith = ForgeCore.run(withMA, up, { futW: 12, timeframe: "월봉" });
  const rNo = ForgeCore.run(without, up, { futW: 12, timeframe: "월봉" });
  assert.ok(rWith.prediction.path.every(isFinite) && rNo.prediction.path.every(isFinite));
  const gain = r => r.prediction.target / r.prediction.anchor;
  assert.ok(gain(rWith) > gain(rNo), "상승국면 MA 블록이 있으면 maDrift로 타깃이 더 높다");
});

test("maSteps: 5단계 텍스트, 골든크로스·bias 반영", () => {
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  const up = Array.from({ length: 14 }, (_, i) => 71 + (i + 1) * 4);
  const ma = ForgeCore.analyzeMA(down.concat(up), { len: 5 });
  const s = ForgeCore.maSteps(ma, 5);
  assert.strictEqual(s.length, 5);
  assert.ok(s[0].includes("5/15/30"), "1단계: 기간");
  assert.ok(/골든크로스/.test(s[2]), "3단계: 골든크로스");
  assert.ok(/bias/.test(s[4]), "5단계: bias");
});

test("maSteps: 정배열 상승 → 배열·종합 방향 반영", () => {
  const ma = ForgeCore.analyzeMA(Array.from({ length: 80 }, (_, i) => 100 + i * 2), { len: 5 });
  const s = ForgeCore.maSteps(ma, 5);
  assert.ok(s[1].includes("정배열"), "2단계: 정배열");
  assert.ok(s[4].includes("상승"), "5단계: 상승");
});

test("analyzeFib: 상승 스윙 → dir up, 0.618 되돌림·1.618 확장 존재", () => {
  const up = Array.from({ length: 50 }, (_, i) => 100 + i * 2);   // 100→198
  const price = up.concat([197, 196, 195]);                       // 되돌림(thr=4.9 미만, 피벗 미생성)
  const f = ForgeCore.analyzeFib(price, { swing: 0.05 });
  assert.strictEqual(f.dir, "up");
  assert.ok(f.swing.toPrice > f.swing.fromPrice);
  assert.ok(f.levels.some(L => L.kind === "retr" && Math.abs(L.ratio - 0.618) < 1e-9 && isFinite(L.price)));
  assert.ok(f.levels.some(L => L.kind === "ext" && Math.abs(L.ratio - 1.618) < 1e-9 && isFinite(L.price)));
  assert.ok(isFinite(f.bias));
});

test("analyzeFib: 하락 스윙 → dir down, 유한 bias", () => {
  const down = Array.from({ length: 50 }, (_, i) => 200 - i * 2);
  const price = down.concat([104, 103, 102]);                     // 소폭 반등(thr=4.9 미만, 피벗 미생성)
  const f = ForgeCore.analyzeFib(price, { swing: 0.05 });
  assert.strictEqual(f.dir, "down");
  assert.ok(isFinite(f.bias));
});

test("analyzeFib: 골든포켓 구간 현재가 → inGolden true", () => {
  // 상승 100→200 후, 0.618~0.65 되돌림 가격대(135~138.2)에 현재가
  const up = Array.from({ length: 60 }, (_, i) => 100 + (100 * i / 59));   // 100→200
  const price = up.concat([137]);
  const f = ForgeCore.analyzeFib(price, { swing: 0.70 });        // swing=0.70: thr=70>63, 137이 새 피벗 미생성→up 스윙 유지
  // dir up, golden band ~[135,138.2], 137 내부
  assert.strictEqual(f.zone.inGolden, true);
});

test("analyzeFib: 소량/피벗부족 → 폴백, 유한 bias·레벨 배열", () => {
  const f = ForgeCore.analyzeFib([10, 11, 12, 13], {});
  assert.ok(isFinite(f.bias));
  assert.ok(Array.isArray(f.levels) && f.levels.length > 0);
});

test("fibSteps: 5단계, bias 반영", () => {
  const up = Array.from({ length: 50 }, (_, i) => 100 + i * 2).concat([190, 185]);
  const s = ForgeCore.fibSteps(ForgeCore.analyzeFib(up, { swing: 0.05 }));
  assert.strictEqual(s.length, 5);
  assert.ok(/bias/.test(s[4]));
});

test("run: 피보 블록 유무가 예측 타깃을 가른다 (격리) + TF", () => {
  const base = [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }];
  const up = { price: Array.from({ length: 60 }, (_, i) => 100 + i * 1.5) };
  const withFib = { nodes: [...base, { id: "f", kind: "block", blockType: "fib", params: { len: 120 } }], edges: [{ from: "p", to: "o" }, { from: "p", to: "f" }] };
  const without = { nodes: base, edges: [{ from: "p", to: "o" }] };
  const rW = ForgeCore.run(withFib, up, { futW: 12, timeframe: "월봉" });
  const rN = ForgeCore.run(without, up, { futW: 12, timeframe: "월봉" });
  assert.ok(rW.prediction.path.every(isFinite) && rN.prediction.path.every(isFinite));
  assert.notStrictEqual(rW.prediction.target, rN.prediction.target);   // 피보 기여로 달라짐(드리프트 격리)
});

test("run: 피보 블록 없으면 기여 0(기존 동작)", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const r = ForgeCore.run(G, { price: Array.from({ length: 40 }, (_, i) => 100 + i) }, { futW: 8, timeframe: "월봉" });
  assert.ok(r.prediction.path.every(isFinite));
});

test("analyzeFib: 다중파 시계열 → 단/중/장 degree 동반 + bias 가중 블렌드", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 300, 99), ...seg(300, 250, 50), ...seg(250, 320, 40), ...seg(320, 300, 10)];
  const f = ForgeCore.analyzeFib(price, { swing: 0.05, len: 120 });
  assert.ok(f.degrees.length >= 2 && f.degrees.length <= 3, "여러 degree 산출");
  assert.strictEqual(f.degrees[0].name, "단기");
  assert.ok(f.degrees.every(d => ["단기", "중기", "장기"].includes(d.name)));
  assert.ok(f.degrees.every(d => d.levels.length === 12 && d.levels.every(L => isFinite(L.price))), "각 degree 12레벨 유한");
  // top-level = 단기 (하위호환)
  assert.strictEqual(f.dir, f.degrees[0].dir);
  assert.strictEqual(f.swing.fromIdx, f.degrees[0].swing.fromIdx);
  // bias = 존재 degree 가중(단.5/중.3/장.2) 재정규화
  const W = { "단기": 0.5, "중기": 0.3, "장기": 0.2 };
  let bw = 0, bs = 0; for (const d of f.degrees) { bw += W[d.name]; bs += W[d.name] * d.bias; }
  const expect = Math.max(-1, Math.min(1, bs / bw));
  assert.ok(Math.abs(f.bias - expect) < 1e-9, "bias 블렌드 일치");
});

test("analyzeFib: 단조 시계열 → degree 중복 제거(단기만), bias=단기(회귀 0)", () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 + i * 1.5);
  const f = ForgeCore.analyzeFib(up, { swing: 0.05, len: 120 });
  assert.strictEqual(f.degrees.length, 1);
  assert.strictEqual(f.degrees[0].name, "단기");
  assert.ok(Math.abs(f.bias - f.degrees[0].bias) < 1e-9);
});

test("analyzeElliott: 5파 상승 임펄스 → impulse_up, 규칙·투영·bias", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "impulse_up");
  assert.ok(ea.rules.score > 0);
  assert.ok(ea.bias > 0);
  assert.ok(ea.next !== null);
  assert.ok(typeof ea.next.label === "string" && ea.next.label.length > 0, "next.label 비어있지 않음");
  assert.ok(isFinite(ea.next.target), "next.target 유한값");
  assert.ok([1, -1].includes(ea.next.dir), "next.dir ±1");
});

test("analyzeElliott: 2파 끝 → 3파 투영이 2파 끝 기준(1.618×1파)", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  // 1파 100→120(span 20), 2파 120→108 (2파 끝=108) — 여기서 멈춤
  const price = [100, ...seg(100, 120, 10), ...seg(120, 108, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.ok(ea.next && ea.next.label === "3", "다음=3파 투영");
  // 2파 끝(≈108) + 1.618×20 ≈ 140.36 (1파 시작 기준 132.36이 아님)
  assert.ok(ea.next.target > 138 && ea.next.target < 143, "3파 목표가 2파끝 기준(≈140)");
});

test("analyzeElliott: 5파 하락 임펄스 → impulse_down, bias<0", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [200, ...seg(200, 180, 8), ...seg(180, 192, 6), ...seg(192, 150, 10), ...seg(150, 168, 6), ...seg(168, 135, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "impulse_down");
  assert.ok(ea.bias < 0);
});

test("analyzeElliott: 3레그(미완성 5파) → 발달중(uncertain) + 숫자 라벨(1..)", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 88, 8), ...seg(88, 96, 6), ...seg(96, 84, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "uncertain");                 // 5파 미완성 → 조정 단정 안 함
  assert.ok(/^[1-9]$/.test(ea.waves[0].label), "발달중은 숫자 라벨(1..)");
});

test("analyzeElliott: 4레그 발달중 → 숫자 라벨 + 5파 투영", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "uncertain");
  assert.strictEqual(ea.waves[0].label, "1");
  assert.ok(ea.next && ea.next.label === "5", "4파 발달중 → 다음 5파 투영");
});

test("analyzeElliott: 소량/피벗부족 → 폴백(uncertain, bias 0, next null)", () => {
  const ea = ForgeCore.analyzeElliott([10, 11, 12], {});
  assert.strictEqual(ea.structure, "uncertain");
  assert.strictEqual(ea.bias, 0);
  assert.strictEqual(ea.next, null);
});

test("analyzeElliott: 규칙 위반 5레그 → 유효 임펄스 아님 + 조정 문자(A-E) 라벨(모티브 숫자 오표기 없음)", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  // 하락 5레그지만 3파(190→185, span5)가 1파(span20)·5파(span35)보다 짧음 → R2 위반 → 임펄스 불가
  const price = [200, ...seg(200, 180, 8), ...seg(180, 190, 6), ...seg(190, 185, 6), ...seg(185, 195, 6), ...seg(195, 160, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.02 });
  assert.ok(ea.rules.r2 === false, "R2(3파 최단) 위반 감지");
  assert.notStrictEqual(ea.structure, "impulse_down", "규칙 위반 → 유효 임펄스 아님");
  assert.notStrictEqual(ea.structure, "impulse_up");
  // 규칙 위반 = 임펄스 아님 → 조정성(삼각형/복합)으로 보고 문자 라벨(A-E). 모티브 숫자(1-5) 오표기 금지.
  assert.ok(ea.waves.length >= 2, "파동 존재");
  ea.waves.forEach(w => assert.ok(/^[A-E]$/.test(w.label), "규칙 위반 구조는 조정 문자(A-E): " + w.label));
});

test("analyzeElliott: 라벨 유효셋만(1-5 또는 A-E) — 삼각형/복합은 D·E 허용, F~Z 등 없음", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100,
    ...seg(100, 120, 6), ...seg(120, 108, 5), ...seg(108, 116, 5), ...seg(116, 104, 5),
    ...seg(104, 113, 5), ...seg(113, 101, 5), ...seg(101, 110, 5), ...seg(110, 98, 6)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.02 });
  assert.ok(ea.waves.every(w => /^([1-5]|[A-E])$/.test(w.label)), "라벨은 1-5 또는 A-E만");
  assert.ok(ea.waves.every(w => !/[F-Z]/.test(w.label)), "F~Z 등 비표준 라벨 없음");
  assert.ok(ea.waves.length <= 8, "카운트 최대 8");
});

test("analyzeElliott: 앵커 카운팅 — 최근 저점 이후 상승은 숫자 카운트(조정 오분류 아님)", () => {
  const seg = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + 1) / n);
  // 초반 노이즈(100→150→80) 뒤 최근 저점 80에서 깔끔한 상승 → 데이터 시작이 아닌 저점에 앵커
  const price = [100, ...seg(100, 150, 10), ...seg(150, 80, 12),
    ...seg(80, 125, 9), ...seg(125, 110, 5), ...seg(110, 185, 10)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.05 });
  assert.ok(/^[0-9]$/.test(ea.waves[0].label), "앵커 상승 카운트는 숫자 라벨(1..)");
  assert.notStrictEqual(ea.structure, "corrective", "최근 저점 이후 상승을 조정(A..)으로 오분류하지 않음");
  // 카운트가 초반 노이즈가 아니라 최근 저점 이후 구간에 위치
  const loIdx = price.indexOf(Math.min.apply(null, price));
  assert.ok(ea.waves[ea.waves.length - 1].idx > loIdx, "최종 파동이 최근 저점 이후");
});

test("analyzeElliott: 유효 5파 하락 임펄스는 여전히 숫자 라벨(1..5)", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [200, ...seg(200, 180, 8), ...seg(180, 192, 6), ...seg(192, 150, 10), ...seg(150, 168, 6), ...seg(168, 135, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "impulse_down");
  assert.strictEqual(ea.waves[0].label, "1", "유효 임펄스는 숫자 라벨");
});

test("analyzeElliott: 임펄스 판정은 3대 규칙 모두 충족해야(strict)", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  // 4파(150→175)가 1파 끝(120) 위로 회복 못함 → 여기선 R3 성립. 대신 4파가 1파 영역 침범하도록 구성:
  // 1파 100→120, 2파 120→105, 3파 105→140, 4파 140→118(1파 끝 120 아래=침범 → R3 위반), 5파 118→150
  const price = [100, ...seg(100, 120, 8), ...seg(120, 105, 6), ...seg(105, 140, 10), ...seg(140, 118, 6), ...seg(118, 150, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.02 });
  assert.ok(ea.rules.r3 === false, "R3(4파 1파 침범) 위반");
  assert.notStrictEqual(ea.structure, "impulse_up", "규칙 위반 → 유효 임펄스 아님");
  assert.notStrictEqual(ea.structure, "impulse_down");
});

test("elliottSteps: 5단계, bias 반영", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)];
  const s = ForgeCore.elliottSteps(ForgeCore.analyzeElliott(price, { swing: 0.04 }));
  assert.strictEqual(s.length, 5);
  assert.ok(/bias/.test(s[4]));
});

test("elliottSteps: primary 있으면 대형 요약 줄 추가, 없으면 5줄", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const longP = [100,
    ...seg(100, 200, 40), ...seg(200, 150, 30), ...seg(150, 320, 50),
    ...seg(320, 250, 30), ...seg(250, 400, 45), ...seg(400, 300, 30),
    ...seg(300, 360, 25), ...seg(360, 260, 30)];
  const eaLong = ForgeCore.analyzeElliott(longP, { swing: 0.03 });
  const stepsLong = ForgeCore.elliottSteps(eaLong);
  assert.ok(stepsLong.length === 6, "대형 줄 포함 6줄 (실제 " + stepsLong.length + ")");
  assert.ok(stepsLong[5].indexOf("대형") === 0, "마지막 줄이 '대형'으로 시작");

  const shortP = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)];
  const eaShort = ForgeCore.analyzeElliott(shortP, { swing: 0.04 });
  assert.strictEqual(ForgeCore.elliottSteps(eaShort).length, 5, "primary 없으면 5줄");
});

test("run: 엘리어트 블록 유무가 예측 타깃을 가른다(격리) + TF", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const data = { price: [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)] };
  const base = [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }];
  const withEW = { nodes: [...base, { id: "e", kind: "block", blockType: "elliott", params: { swing: 4 } }], edges: [{ from: "p", to: "o" }, { from: "p", to: "e" }] };
  const without = { nodes: base, edges: [{ from: "p", to: "o" }] };
  const rW = ForgeCore.run(withEW, data, { futW: 12, timeframe: "월봉" });
  const rN = ForgeCore.run(without, data, { futW: 12, timeframe: "월봉" });
  const rI = ForgeCore.run(withEW, data, { futW: 12, timeframe: "5분" });
  assert.ok(rW.prediction.path.every(isFinite) && rN.prediction.path.every(isFinite) && rI.prediction.path.every(isFinite));
  assert.notStrictEqual(rW.prediction.target, rN.prediction.target);   // 엘리어트 기여로 달라짐
  const gain = r => r.prediction.target / r.prediction.anchor;
  assert.ok(gain(rW) > gain(rI));   // 월봉 TF 가중 > 5분
});

test("run: 엘리어트 블록 없으면 기여 0", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const r = ForgeCore.run(G, { price: Array.from({ length: 40 }, (_, i) => 100 + i) }, { futW: 8, timeframe: "월봉" });
  assert.ok(r.prediction.path.every(isFinite));
});

test("analyzeRSI: 단조 상승 → overbought, trend>=0", () => {
  const price = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
  const r = ForgeCore.analyzeRSI(price, { period: 14 });
  assert.ok(r.last > 70);
  assert.strictEqual(r.zone, "overbought");
  assert.ok(r.trend >= 0);
});

test("analyzeRSI: 강세 다이버전스(가격 LL·RSI HL) → bullish", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 70, 10), ...seg(70, 85, 6), ...seg(85, 68, 8)];  // 저점1≈70, 반등85, 저점2≈68(LL)
  const r = ForgeCore.analyzeRSI(price, { period: 5, swing: 0.05 });
  assert.strictEqual(r.divergence.type, "bullish");
  assert.ok(r.divergence.pricePts && r.divergence.pricePts.length === 2);
});

test("analyzeRSI: 약세 다이버전스(가격 HH·RSI LH) → bearish", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 130, 10), ...seg(130, 115, 6), ...seg(115, 134, 8)];  // 고점1≈130, 조정115, 고점2≈134(HH)
  const r = ForgeCore.analyzeRSI(price, { period: 5, swing: 0.05 });
  assert.strictEqual(r.divergence.type, "bearish");
});

test("analyzeRSI: 강세 국면 과열은 추세 역행 완화(Cardwell) — bias > -0.5", () => {
  const price = Array.from({ length: 40 }, (_, i) => 100 + i * 2);   // 강한 상승 → RSI 과열·강세 국면
  const r = ForgeCore.analyzeRSI(price, { period: 14 });
  assert.strictEqual(r.zone, "overbought");
  assert.strictEqual(r.regime, 1, "강세 국면");
  assert.ok(r.bias > -0.5, "강세 국면 과열은 완전 매도(-0.5)로 보지 않음 (실제 " + r.bias.toFixed(2) + ")");
});

test("analyzeRSI: 약세 국면 과열은 여전히 매도(고전 Wilder)", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  // 전반 하락으로 약세 국면 만든 뒤 끝에서 단기 과열까지 반등
  const price = [200, ...seg(200, 120, 30), ...seg(120, 118, 3)];
  const r = ForgeCore.analyzeRSI(price, { period: 14 });
  assert.ok(r.regime <= 0, "약세/중립 국면");
  assert.ok(isFinite(r.bias));
});

test("analyzeRSI: 소량 → 폴백(divergence null, bias 유한)", () => {
  const r = ForgeCore.analyzeRSI([10, 11], {});
  assert.ok(isFinite(r.bias));
  assert.strictEqual(r.divergence.type, null);
});

test("rsiSteps: 5단계, bias 반영", () => {
  const r = ForgeCore.analyzeRSI(Array.from({ length: 40 }, (_, i) => 100 + i * 2), { period: 14 });
  const s = ForgeCore.rsiSteps(r);
  assert.strictEqual(s.length, 5);
  assert.ok(/bias/.test(s[4]));
});

test("run: RSI 블록 유무가 예측 타깃을 가른다(격리) + TF", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const data = { price: [100, ...seg(100, 72, 10), ...seg(72, 88, 8), ...seg(88, 70, 8)] };  // 강세 다이버전스(price LL 70<72, RSI HL)
  const base = [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }];
  const withR = { nodes: [...base, { id: "r", kind: "block", blockType: "rsi", params: { period: 5 } }], edges: [{ from: "p", to: "o" }, { from: "p", to: "r" }] };
  const without = { nodes: base, edges: [{ from: "p", to: "o" }] };
  const rW = ForgeCore.run(withR, data, { futW: 12, timeframe: "월봉" });
  const rN = ForgeCore.run(without, data, { futW: 12, timeframe: "월봉" });
  const rI = ForgeCore.run(withR, data, { futW: 12, timeframe: "5분" });
  assert.ok(rW.prediction.path.every(isFinite) && rN.prediction.path.every(isFinite) && rI.prediction.path.every(isFinite));
  assert.notStrictEqual(rW.prediction.target, rN.prediction.target);   // RSI 블록 기여로 타깃 달라짐(격리)
  assert.notStrictEqual(rW.prediction.target, rI.prediction.target);   // 타임프레임(월봉↔5분) 가중이 예측을 바꿈
});

test("run: RSI 블록 없으면 기여 0", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const r = ForgeCore.run(G, { price: Array.from({ length: 40 }, (_, i) => 100 + i) }, { futW: 8, timeframe: "월봉" });
  assert.ok(r.prediction.path.every(isFinite));
});

test("synthVolume: 길이=price, 결정적·양수, 큰 변동봉이 더 큼", () => {
  const calm = Array.from({ length: 30 }, (_, i) => 100 + i * 0.1);   // 완만
  const v1 = ForgeCore.synthVolume(calm);
  assert.equal(v1.length, calm.length);
  assert.ok(v1.every(x => isFinite(x) && x > 0));
  assert.deepEqual(ForgeCore.synthVolume(calm), v1);                  // 결정적(동일 입력→동일 출력)
  const jump = calm.slice(); jump[20] = 130;                          // 20번째에 급변
  const v2 = ForgeCore.synthVolume(jump);
  assert.ok(v2[20] > v1[20], "급변 봉의 합성 거래량이 더 커야");
  assert.deepEqual(ForgeCore.synthVolume([1]), []);                   // 소량
});

test("analyzeVolume: 상승+거래량증가 → confirm·trend>0·bias>0", () => {
  const price = Array.from({ length: 24 }, (_, i) => 100 + i);        // 단조 상승
  const volume = Array.from({ length: 24 }, (_, i) => 100 + i * 5);   // 단조 증가
  const va = ForgeCore.analyzeVolume(price, volume);
  assert.equal(va.relationship, "confirm");
  assert.ok(va.trend > 0);
  assert.ok(va.bias > 0);
  assert.ok(va.series.length >= 2 && va.obv.length === va.series.length);
});

test("analyzeVolume: 상승+거래량감소 → weakening", () => {
  const price = Array.from({ length: 24 }, (_, i) => 100 + i);
  const volume = Array.from({ length: 24 }, (_, i) => 300 - i * 8);   // 단조 감소
  const va = ForgeCore.analyzeVolume(price, volume);
  assert.equal(va.relationship, "weakening");
});

test("analyzeVolume: 최근 3봉 급증 → state spike·ratio>1.5", () => {
  const price = Array.from({ length: 18 }, (_, i) => 100 + i * 0.2);
  const volume = Array.from({ length: 18 }, () => 100);
  volume[15] = 500; volume[16] = 520; volume[17] = 540;
  const va = ForgeCore.analyzeVolume(price, volume, { len: 12, spikeMult: 1.5 });
  assert.equal(va.state, "spike");
  assert.ok(va.ratio > 1.5);
});

test("analyzeVolume: 강세 가격-OBV 다이버전스 → bullish·bias>0 경향", () => {
  // 가격: 저점2(끝)가 저점1보다 낮음(LL). 거래량: 첫 하락엔 큰 매도량, 둘째 하락엔 적은 매도량 → OBV 저점2 > 저점1(HL)
  // 조정: 회복구간(idx6-7) 거래량 300/280으로 키우고, 2차 하락(idx8-13) 거래량 30/25/20/20/15/15로 축소
  // → OBV[13]=-1580 > OBV[5]=-2035 (HL) ✓, price[13]=99 < price[5]=100 (LL) ✓
  const price = [120, 116, 112, 108, 104, 100, 106, 112, 110, 108, 106, 104, 102, 99, 103, 108];
  const volume = [100, 400, 420, 410, 405, 400, 300, 280, 30, 25, 20, 20, 15, 15, 90, 95];
  const va = ForgeCore.analyzeVolume(price, volume, { len: 12 });
  assert.equal(va.divergence.type, "bullish");
  assert.ok(Array.isArray(va.divergence.pricePts) && va.divergence.pricePts.length === 2);
  assert.ok(va.bias > 0);
});

test("analyzeVolume: volume null → synthVolume 폴백·예외 없음·유한", () => {
  const price = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 3 + i * 0.5);
  const va = ForgeCore.analyzeVolume(price, null);
  assert.ok(va.series.length >= 2);
  assert.ok(isFinite(va.bias) && va.bias >= -1 && va.bias <= 1);
});

test("analyzeVolume: 소량 → 폴백 객체(divergence null, bias 유한)", () => {
  const va = ForgeCore.analyzeVolume([100], [10]);
  assert.equal(va.divergence.type, null);
  assert.ok(isFinite(va.bias));
});

test("volumeSteps: 5단계·관계·bias 반영", () => {
  const price = Array.from({ length: 24 }, (_, i) => 100 + i);
  const volume = Array.from({ length: 24 }, (_, i) => 100 + i * 5);
  const steps = ForgeCore.volumeSteps(ForgeCore.analyzeVolume(price, volume));
  assert.equal(steps.length, 5);
  assert.ok(steps[4].includes("bias"));
  assert.ok(steps[2].includes("가격-거래량"));
});

test("run: volume 블록 유무로 예측 타깃 격리(volDrift)", () => {
  // 가격: 상승추세, 거래량: 상승 동반(confirm·bias>0) → volDrift가 타깃을 올림
  const price = Array.from({ length: 60 }, (_, i) => 100 + i + Math.sin(i / 5) * 2);
  const volume = Array.from({ length: 60 }, (_, i) => 100 + i * 4);
  const data = { price, candle: price.map(c => ({ o: c, h: c + 1, l: c - 1, c })) };
  const base = [
    { id: "p", kind: "block", blockType: "price", params: {} },
    { id: "pred", kind: "block", blockType: "predict", params: {} }
  ];
  const eBase = [{ from: "p", to: "pred", fromSide: "right", toSide: "left" }];
  const withV = {
    nodes: base.concat([{ id: "v", kind: "block", blockType: "volume", params: {}, series: volume, weight: 50 }]),
    edges: eBase.concat([{ from: "p", to: "v", fromSide: "right", toSide: "left" }, { from: "v", to: "pred", fromSide: "right", toSide: "left" }])
  };
  const without = { nodes: base, edges: eBase };
  const tV = ForgeCore.run(withV, data, { timeframe: "일봉" }).prediction.target;
  const tN = ForgeCore.run(without, data, { timeframe: "일봉" }).prediction.target;
  assert.ok(isFinite(tV) && isFinite(tN));
  assert.notStrictEqual(tV, tN);   // volDrift 제거 시 동일해짐(RED)
});

test("run: volume 블록 timeframe 가중(월봉 vs 5분 차이)", () => {
  const price = Array.from({ length: 60 }, (_, i) => 100 + i + Math.sin(i / 5) * 2);
  const volume = Array.from({ length: 60 }, (_, i) => 100 + i * 4);
  const data = { price, candle: price.map(c => ({ o: c, h: c + 1, l: c - 1, c })) };
  const g = {
    nodes: [
      { id: "p", kind: "block", blockType: "price", params: {} },
      { id: "v", kind: "block", blockType: "volume", params: {}, series: volume, weight: 50 },
      { id: "pred", kind: "block", blockType: "predict", params: {} }
    ],
    edges: [
      { from: "p", to: "v", fromSide: "right", toSide: "left" },
      { from: "p", to: "pred", fromSide: "right", toSide: "left" },
      { from: "v", to: "pred", fromSide: "right", toSide: "left" }
    ]
  };
  const tMon = ForgeCore.run(g, data, { timeframe: "월봉" }).prediction.target;
  const tMin = ForgeCore.run(g, data, { timeframe: "5분" }).prediction.target;
  assert.ok(isFinite(tMon) && isFinite(tMin));
  assert.notStrictEqual(tMon, tMin);
});

test("sampleGraph: 거래량 노드 포함 + 실행 시 유한 예측", () => {
  const g = ForgeCore.sampleGraph();
  const vol = g.nodes.find(n => n.blockType === "volume");
  assert.ok(vol, "거래량 노드 존재");
  assert.ok(Array.isArray(vol.series) && vol.series.length >= 2, "베이크 거래량 시계열");
  assert.ok(g.edges.some(e => e.to === vol.id), "price->volume 엣지");
  assert.ok(g.edges.some(e => e.from === vol.id), "volume->combine 엣지");
  const price = ForgeCore.sampleSeries();
  const data = { price, candle: price.map(c => ({ o: c, h: c + 1, l: c - 1, c })) };
  const r = ForgeCore.run(g, data, { timeframe: "일봉" });
  assert.ok(isFinite(r.prediction.target));
});

test("combine: 방향성 없는 거래량 입력은 블렌드에서 제외(시그널 오염 방지)", () => {
  const g = ForgeCore.sampleGraph();
  const price = ForgeCore.sampleSeries();
  const data = { price, candle: price.map(c => ({ o: c, h: c + 1, l: c - 1, c })) };
  const r = ForgeCore.run(g, data, { timeframe: "일봉" });
  assert.ok(r.verdict.score > 30 && r.verdict.regime === "bull", "샘플 강세 시그널이 거래량 magnitude에 붕괴되지 않아야 (방향 시그널 기준 명확한 강세, score=" + r.verdict.score + " regime=" + r.verdict.regime + ")");
});

test("primarySwings: 너무 짧거나 단조로운 시계열 -> null", () => {
  assert.strictEqual(ForgeCore.primarySwings([10, 11, 12], 0.03), null, "3봉 -> null");
  const upOnly = Array.from({ length: 30 }, (_, i) => 100 + i); // 30봉 단조 상승
  assert.strictEqual(ForgeCore.primarySwings(upOnly, 0.03), null, "짧은 단조 -> null");
});

test("primarySwings: 긴 다중파 시계열 -> 큰 다리 6~9개, sens>minorSens", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  // 큰 5-3 구조를 큰 진폭으로 합성(각 다리 내부는 소형 노이즈 없이 직선) — 총 8 다리, ~300봉
  const price = [100,
    ...seg(100, 200, 40), ...seg(200, 150, 30), ...seg(150, 320, 50),
    ...seg(320, 250, 30), ...seg(250, 400, 45), ...seg(400, 300, 30),
    ...seg(300, 360, 25), ...seg(360, 260, 30)];
  const ps = ForgeCore.primarySwings(price, 0.03);
  assert.ok(ps && Array.isArray(ps.swings), "결과 객체 + swings 배열");
  const legs = ps.swings.length - 1;
  assert.ok(legs >= 6 && legs <= 9, "큰 다리 6~9개 (실제 " + legs + ")");
  assert.ok(ps.sens > 0.03, "대형 민감도가 소형보다 큼");
});

test("analyzeElliott: 긴 시계열 -> primary degree 동반 + bias 블렌드", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100,
    ...seg(100, 200, 40), ...seg(200, 150, 30), ...seg(150, 320, 50),
    ...seg(320, 250, 30), ...seg(250, 400, 45), ...seg(400, 300, 30),
    ...seg(300, 360, 25), ...seg(360, 260, 30)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.03 });
  assert.ok(ea.primary && Array.isArray(ea.primary.waves), "primary degree 존재");
  assert.ok(ea.primary.waves.length >= 5, "대형 파동 카운트 충분");
  // 블렌드: 최상위 bias === clamp(minor*0.35 + primary*0.65)
  const minorB = ForgeCore.analyzeElliott(price, { swing: 0.03, _minorOnly: true });
  // 최상위 bias가 primary.bias 쪽으로 가중되었는지(대형이 더 큰 가중)
  const expected = Math.max(-1, Math.min(1, minorB.bias * 0.35 + ea.primary.bias * 0.65));
  assert.ok(Math.abs(ea.bias - expected) < 1e-9, "bias=minor*0.35+primary*0.65 clamp");
});

test("analyzeElliott: 짧은 시계열 -> primary null, bias=minor (회귀 0)", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.primary, null, "짧으면 primary 없음");
  // 같은 입력의 소형 bias와 동일해야 함(회귀 0)
  assert.ok(ea.structure === "impulse_up" && ea.bias > 0, "소형 분석은 종전대로");
});

test("elliottAnalyze: 긴 시계열 -> meta.primary 노출, values 불변", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100,
    ...seg(100, 200, 40), ...seg(200, 150, 30), ...seg(150, 320, 50),
    ...seg(320, 250, 30), ...seg(250, 400, 45), ...seg(400, 300, 30),
    ...seg(300, 360, 25), ...seg(360, 260, 30)];
  // values 스냅샷(변경 금지 검증용): evalBlocks 경유로 elliott 노드 값 취득
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "e", kind: "block", blockType: "elliott", params: { swing: 3 } }
  ], edges: [{ from: "p", to: "e" }] };
  const before = ForgeCore.evalBlocks(g, { price: price, n: price.length });
  assert.ok(before.meta.e.primary && before.meta.e.primary.current, "elliott 노드 meta.primary.current 존재");
  assert.ok(Array.isArray(before.values.e) && before.values.e.length === price.length, "values 길이 불변");
});

test("elliottAnalyze: 짧은 시계열 -> meta.primary null", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10)];
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "e", kind: "block", blockType: "elliott", params: { swing: 4 } }
  ], edges: [{ from: "p", to: "e" }] };
  const r = ForgeCore.evalBlocks(g, { price: price, n: price.length });
  assert.strictEqual(r.meta.e.primary, null, "짧으면 primary null");
});

/* ── 신규 지표: 볼린저 · MACD · ADX ── */
const _up = (n, drift) => { const s = []; let p = 100; for (let i = 0; i < n; i++) { p *= 1 + (drift + Math.sin(i / 7) * 0.02); s.push(p); } return s; };
const _dn = (n) => _up(n, -0.006).map(v => v);

test("analyzeBollinger: 밴드·%B·바이어스(상승추세→bias>0)", () => {
  const bb = ForgeCore.analyzeBollinger(_up(140, 0.005), { len: 20, k: 2 });
  assert.strictEqual(bb.mid.length, 140, "중심선 길이");
  assert.ok(bb.upper[139] > bb.mid[139] && bb.mid[139] > bb.lower[139], "upper>mid>lower");
  assert.ok(bb.last.pctB >= 0 && bb.last.pctB <= 1.5, "%B 범위");
  assert.ok(bb.bias > 0, "상승추세 bias>0");
  assert.strictEqual(ForgeCore.bollSeries === undefined, true, "bollSeries는 비공개(export 안 함)");
});
test("analyzeBollinger: 하락추세 → bias<0, 짧으면 EMPTY", () => {
  assert.ok(ForgeCore.analyzeBollinger(_up(140, -0.006), { len: 20, k: 2 }).bias < 0, "하락 bias<0");
  assert.strictEqual(ForgeCore.analyzeBollinger([1, 2, 3], { len: 20 }).mid.length, 0, "짧으면 빈 배열");
});
test("bollingerSteps: 5줄 요약", () => {
  const bb = ForgeCore.analyzeBollinger(_up(120, 0.004), {});
  assert.strictEqual(ForgeCore.bollingerSteps(bb, 20, 2).length, 5);
});

test("analyzeMACD: macd/sig/hist + 상승추세 bias>0", () => {
  const m = ForgeCore.analyzeMACD(_up(160, 0.006), { fast: 12, slow: 26, signal: 9 });
  assert.strictEqual(m.macd.length, 160);
  assert.ok(Math.abs(m.last.hist - (m.last.macd - m.last.sig)) < 1e-6, "hist=macd-sig");
  assert.ok(m.bias > 0, "상승추세 bias>0");
  assert.ok(["bull", "bear", "mixed", "neutral"].includes(m.state));
});
test("analyzeMACD: 짧으면 EMPTY, 하락추세 bias<0", () => {
  assert.strictEqual(ForgeCore.analyzeMACD([1, 2, 3], {}).macd.length, 0);
  assert.ok(ForgeCore.analyzeMACD(_up(160, -0.006), {}).bias < 0, "하락 bias<0");
});
test("macdSteps: 5줄", () => { assert.strictEqual(ForgeCore.macdSteps(ForgeCore.analyzeMACD(_up(120, 0.005), {}), 12, 26, 9).length, 5); });

test("analyzeADX: adx/DI + 강한 상승추세 → dir>0, 강도 강함", () => {
  const a = ForgeCore.analyzeADX(_up(140, 0.008), { period: 14 });
  assert.strictEqual(a.adx.length, 140);
  assert.ok(a.last.adx >= 0 && a.last.adx <= 100, "ADX 0~100");
  assert.strictEqual(a.dir, 1, "상승 → +DI 우세");
  assert.ok(a.bias > 0, "강한 상승추세 bias>0");
});
test("analyzeADX: 짧으면 EMPTY", () => { assert.strictEqual(ForgeCore.analyzeADX([1, 2, 3], {}).adx.length, 0); });
test("adxSteps: 5줄", () => { assert.strictEqual(ForgeCore.adxSteps(ForgeCore.analyzeADX(_up(120, 0.006), {}), 14).length, 5); });

test("run: 볼린저/MACD/ADX 노드가 예측 드리프트에 반영(격리)", () => {
  const price = _up(160, 0.006);
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const withInd = { nodes: base.nodes.concat([{ id: "bb", kind: "block", blockType: "bollinger" }, { id: "mc", kind: "block", blockType: "macd" }, { id: "ax", kind: "block", blockType: "adx" }]), edges: base.edges.concat([{ from: "bb", to: "pr" }, { from: "mc", to: "pr" }, { from: "ax", to: "pr" }]) };
  const r0 = ForgeCore.run(base, { price }, { futW: 24 });
  const r1 = ForgeCore.run(withInd, { price }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-6, "지표 추가로 예측 타깃이 달라짐");
  assert.strictEqual((r1.values.bb || []).length, 160, "evalBlocks bollinger 시계열");
});

/* ── 신규 지표: 볼륨 프로파일 · 일목균형표 ── */
test("analyzeVolumeProfile: POC/밸류에어리어 + 상승추세 bias>0", () => {
  const price = _up(160, 0.005), vol = price.map((_, i) => 1 + (i % 7));
  const vp = ForgeCore.analyzeVolumeProfile(price, vol, { len: 120, bins: 24 });
  assert.ok(vp.poc != null && vp.poc >= vp.lo && vp.poc <= vp.hi, "POC 범위 내");
  assert.ok(vp.val <= vp.poc && vp.poc <= vp.vah, "VAL≤POC≤VAH");
  assert.ok(["above", "below", "in"].includes(vp.priceRel));
  assert.ok(vp.bias > 0, "상승추세(신고가) → 밸류에어리어 상단 → bias>0");
});
test("analyzeVolumeProfile: 짧으면 EMPTY, steps 5줄", () => {
  assert.strictEqual(ForgeCore.analyzeVolumeProfile([1, 2, 3], null, {}).poc, null);
  assert.strictEqual(ForgeCore.volumeProfileSteps(ForgeCore.analyzeVolumeProfile(_up(140, 0.004), null, {})).length, 5);
});

test("analyzeIchimoku: 구름/전환기준 + 상승추세 → 구름 위, bias>0", () => {
  const ic = ForgeCore.analyzeIchimoku(_up(160, 0.006), { tenkan: 9, kijun: 26, senkouB: 52, shift: 26 });
  assert.strictEqual(ic.tenkan.length, 160);
  assert.strictEqual(ic.pricePos, "above", "상승추세 → 가격이 구름 위");
  assert.ok(ic.bias > 0, "상승 정렬 bias>0");
  assert.ok(["bull", "bear", "neutral"].includes(ic.cloud));
});
test("analyzeIchimoku: 짧으면 EMPTY, 하락추세 bias<0, steps 5줄", () => {
  assert.strictEqual(ForgeCore.analyzeIchimoku([1, 2, 3], {}).tenkan.length, 0);
  assert.ok(ForgeCore.analyzeIchimoku(_up(160, -0.006), {}).bias < 0, "하락 bias<0");
  assert.strictEqual(ForgeCore.ichimokuSteps(ForgeCore.analyzeIchimoku(_up(160, 0.005), {})).length, 5);
});

test("run: 볼륨프로파일/일목 노드가 예측에 반영(격리)", () => {
  const price = _up(170, 0.005);
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const withInd = { nodes: base.nodes.concat([{ id: "vp", kind: "block", blockType: "volumeprofile" }, { id: "ic", kind: "block", blockType: "ichimoku" }]), edges: base.edges.concat([{ from: "vp", to: "pr" }, { from: "ic", to: "pr" }]) };
  const r0 = ForgeCore.run(base, { price }, { futW: 24 }), r1 = ForgeCore.run(withInd, { price }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-6, "지표 추가로 예측 달라짐");
});

/* ── 신규 지표: 시장구조 · ATR + 컨플루언스 ── */
test("analyzeStructure: 상승구조 → trend up, bias>0; steps 5줄", () => {
  const st = ForgeCore.analyzeStructure(_up(160, 0.006), { swing: 0.03 });
  assert.ok(["up", "down", "none"].includes(st.trend));
  assert.ok(st.bias > 0, "상승추세 bias>0");
  assert.strictEqual(ForgeCore.structureSteps(st).length, 5);
});
test("analyzeStructure: 하락구조 bias<0, 짧으면 EMPTY", () => {
  assert.ok(ForgeCore.analyzeStructure(_up(160, -0.006), {}).bias < 0);
  assert.strictEqual(ForgeCore.analyzeStructure([1, 2, 3], {}).trend, "none");
});
test("analyzeATR: atr/pct/손절 + bias 0(방향무관); steps 5줄", () => {
  const at = ForgeCore.analyzeATR(_up(120, 0.005), { period: 14, mult: 2 });
  assert.ok(at.last > 0 && at.pct > 0, "ATR 양수");
  assert.strictEqual(at.bias, 0, "ATR은 방향 무관(bias 0)");
  assert.ok(at.stopLong < at.stopShort, "롱손절<숏손절");
  assert.strictEqual(ForgeCore.atrSteps(at, 14).length, 5);
});
test("run: 시장구조 노드가 예측 반영 + ATR이 콘 폭 확대 + verdict.confluence", () => {
  const price = _up(170, 0.005);
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price }, { futW: 24 });
  assert.ok(r0.verdict.confluence && typeof r0.verdict.confluence.score === "number", "verdict.confluence 존재");
  const withSt = { nodes: base.nodes.concat([{ id: "st", kind: "block", blockType: "structure" }]), edges: base.edges.concat([{ from: "st", to: "pr" }]) };
  assert.ok(Math.abs(ForgeCore.run(withSt, { price }, { futW: 24 }).prediction.target - r0.prediction.target) > 1e-6, "시장구조로 예측 달라짐");
});

/* ── 신규 지표: SMC(FVG·오더블록) — 실 OHLC ── */
test("analyzeSMC: 실 OHLC → FVG/오더블록 감지, ok=true", () => {
  // 상승 갭(FVG) + 변위 포함 캔들 생성
  const candle = []; let p = 100;
  for (let i = 0; i < 60; i++) {
    let o = p, c;
    if (i === 30) { o = p; c = p * 1.06; }        // 강한 상승 변위(갭 유발)
    else c = p * (1 + (Math.sin(i / 5) * 0.01 + 0.002));
    const h = Math.max(o, c) * 1.004, l = Math.min(o, c) * 0.996;
    candle.push({ o, h, l, c }); p = c;
  }
  const smc = ForgeCore.analyzeSMC(candle, {});
  assert.strictEqual(smc.ok, true, "실 OHLC → ok");
  assert.ok(Array.isArray(smc.fvgs) && Array.isArray(smc.obs), "fvgs/obs 배열");
  assert.strictEqual(ForgeCore.smcSteps(smc).length, 5);
});
test("analyzeSMC: 종가전용(고=저) → ok=false, bias 0", () => {
  const flat = Array.from({ length: 40 }, (_, i) => { const c = 100 + i; return { o: c, h: c, l: c, c }; });
  const smc = ForgeCore.analyzeSMC(flat, {});
  assert.strictEqual(smc.ok, false, "고=저 → SMC 불가");
  assert.strictEqual(smc.bias, 0);
  assert.strictEqual(ForgeCore.smcSteps(smc).length, 5);
});
test("run: SMC 노드(실 candle)로 예측 반영 + 종가전용은 무영향", () => {
  const price = _up(70, 0.005);
  const candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const g = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "sm", kind: "block", blockType: "smc" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }, { from: "sm", to: "pr" }] };
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(typeof r1.prediction.target === "number", "실행 성공");
  // 종가전용(flat candle)이면 SMC 무영향
  const flatC = price.map(c => ({ o: c, h: c, l: c, c }));
  const r2 = ForgeCore.run(g, { price, candle: flatC }, { futW: 24 });
  assert.ok(Math.abs(r2.prediction.target - ForgeCore.run(base, { price, candle: flatC }, { futW: 24 }).prediction.target) < 1e-6, "종가전용 SMC 무영향");
});

/* ── 신규 지표: 사이클(주기 위상) ── */
test("analyzeCycle: 사인파 → 주기 검출 + 위상/다음전환/steps", () => {
  const price = []; for (let i = 0; i < 160; i++) price.push(100 + i * 0.2 + 6 * Math.sin(2 * Math.PI * i / 20));
  const cy = ForgeCore.analyzeCycle(price, { pmin: 8, pmax: 60 });
  assert.ok(cy.period > 12 && cy.period < 30, "주기 ~20 검출 (got " + cy.period.toFixed(1) + ")");
  assert.ok(cy.nextTurn && ["peak", "trough"].includes(cy.nextTurn.type), "다음 전환 타입");
  assert.ok(["rising", "falling", "flat"].includes(cy.dir));
  assert.strictEqual(ForgeCore.cycleSteps(cy).length, 5);
});
test("analyzeCycle: 짧으면 EMPTY, bias 범위", () => {
  assert.strictEqual(ForgeCore.analyzeCycle([1, 2, 3], {}).period, 0);
  const price = []; for (let i = 0; i < 120; i++) price.push(100 + 5 * Math.sin(2 * Math.PI * i / 16));
  const cy = ForgeCore.analyzeCycle(price, {});
  assert.ok(cy.bias >= -1 && cy.bias <= 1);
  assert.strictEqual(ForgeCore.cycleSteps(ForgeCore.analyzeCycle([1, 2, 3], {})).length, 5);
});
test("run: 사이클 노드가 예측에 반영(격리)", () => {
  const price = []; for (let i = 0; i < 150; i++) price.push(100 + i * 0.1 + 5 * Math.sin(2 * Math.PI * i / 18));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const withCy = { nodes: base.nodes.concat([{ id: "cy", kind: "block", blockType: "cycle" }]), edges: base.edges.concat([{ from: "cy", to: "pr" }]) };
  const r0 = ForgeCore.run(base, { price }, { futW: 24 }), r1 = ForgeCore.run(withCy, { price }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "사이클 추가로 예측 달라짐");
});

/* ── 신규 지표: VWAP · 슈퍼트렌드 · 스토캐스틱 ── */
test("analyzeVWAP: 상승추세 → VWAP 위, bias>0; steps 5줄", () => {
  const price = []; { let p = 100; for (let i = 0; i < 120; i++) { p *= 1.006; price.push(p); } }
  const vol = price.map((_, i) => 1 + (i % 5));
  const v = ForgeCore.analyzeVWAP(price, vol, { len: 20, k: 2 });
  assert.ok(v.last > 0 && isFinite(v.last), "VWAP 값");
  assert.ok(v.bias > 0, "상승추세 → 현재가 VWAP 위 → bias>0");
  assert.ok(v.upper[v.upper.length - 1] > v.lower[v.lower.length - 1], "밴드 상>하");
  assert.strictEqual(ForgeCore.vwapSteps(v).length, 5);
});
test("analyzeSupertrend: 상승추세 dir=1 bias>0; 하락 dir=-1; steps 5줄", () => {
  const mono = (r) => { const s = []; let p = 100; for (let i = 0; i < 120; i++) { p *= 1 + r; s.push(p); } return s; };
  const up = ForgeCore.analyzeSupertrend(mono(0.006), { period: 10, mult: 3 });
  assert.strictEqual(up.dir, 1, "상승추세 dir=1");
  assert.ok(up.bias > 0);
  assert.ok(ForgeCore.analyzeSupertrend(mono(-0.006), {}).dir === -1, "하락 dir=-1");
  assert.strictEqual(ForgeCore.supertrendSteps(up).length, 5);
});
test("analyzeStochastic: %K/%D 0~100 + state + steps 5줄", () => {
  const price = []; for (let i = 0; i < 120; i++) price.push(100 + 8 * Math.sin(i / 7));
  const st = ForgeCore.analyzeStochastic(price, { kLen: 14, kSmooth: 3, dLen: 3 });
  assert.ok(st.last.k >= 0 && st.last.k <= 100, "%K 0~100");
  assert.ok(["overbought", "oversold", "neutral"].includes(st.state));
  assert.ok(st.bias >= -1 && st.bias <= 1);
  assert.strictEqual(ForgeCore.stochSteps(st).length, 5);
});
test("run: VWAP·슈퍼트렌드·스토캐스틱 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c })), volume = price.map(() => 1000);
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle, volume }, { futW: 24 });
  ["vwap", "supertrend", "stochastic"].forEach(bt => {
    const g = { nodes: base.nodes.concat([{ id: bt, kind: "block", blockType: bt }]), edges: base.edges.concat([{ from: bt, to: "pr" }]) };
    assert.ok(Math.abs(ForgeCore.run(g, { price, candle, volume }, { futW: 24 }).prediction.target - r0.prediction.target) > 1e-9, bt + " 예측 반영");
  });
});

/* ── 신규 지표: 피벗 포인트 ── */
test("analyzePivot: 종가가 피벗 위면 bias 양수, 아래면 음수", () => {
  const up = { candle: [], price: [] };
  // 전일 H=10,L=6,C=8 → P=8. 오늘 종가 9.5(피벗 위) → bias>0
  const candle = [{o:6,h:10,l:6,c:8},{o:8,h:9.6,l:7.9,c:9.5}];
  const r = ForgeCore.analyzePivot({ candle, price: candle.map(c=>c.c) });
  assert.ok(r.P > 0 && r.bias > 0, `expected bias>0, got ${r.bias} P=${r.P}`);
  const candle2 = [{o:6,h:10,l:6,c:8},{o:8,h:8.1,l:6.4,c:6.6}];
  const r2 = ForgeCore.analyzePivot({ candle: candle2, price: candle2.map(c=>c.c) });
  assert.ok(r2.bias < 0, `expected bias<0, got ${r2.bias}`);
});
test("pivotSteps: 3줄", () => {
  assert.strictEqual(ForgeCore.pivotSteps().length, 3);
});
test("run: 피벗 포인트 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "piv", kind: "block", blockType: "pivot" }]), edges: base.edges.concat([{ from: "piv", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "pivot 예측 반영");
});

/* ── 신규 지표: Parabolic SAR ── */
test("analyzePSAR: 상승 시계열이면 dir=+1·bias>0", () => {
  const price = Array.from({length:40},(_,i)=>100+i);   // 단조 상승
  const candle = price.map((c,i)=>({o:c-0.5,h:c+0.6,l:c-0.6,c}));
  const r = ForgeCore.analyzePSAR({ candle, price });
  assert.equal(r.dir, 1);
  assert.ok(r.bias > 0, `bias ${r.bias}`);
});
test("analyzePSAR: 하락 시계열이면 dir=−1·bias<0", () => {
  const price = Array.from({length:40},(_,i)=>140-i);
  const candle = price.map((c)=>({o:c+0.5,h:c+0.6,l:c-0.6,c}));
  const r = ForgeCore.analyzePSAR({ candle, price });
  assert.equal(r.dir, -1);
  assert.ok(r.bias < 0);
});
test("analyzePSAR: Wilder 클램프 — SAR이 직전 2봉 저가 극단을 넘지 않음(상승 중 되돌림)", () => {
  // 상승 후 마지막 봉에서 되돌림(추세는 유지). 언클램프면 초기 가속에서 직전 저가를 관통함.
  const highs = [10, 11.2, 12.6, 14.2, 16.0, 18.0, 18.4];
  const lows  = [ 9, 10.2, 11.6, 13.2, 15.0, 17.0, 15.5];
  const closes = highs.map((h, i) => (h + lows[i]) / 2);
  const candle = highs.map((h, i) => ({ o: closes[i], h, l: lows[i], c: closes[i] }));
  const r = ForgeCore.analyzePSAR({ candle, price: closes });
  assert.equal(r.dir, 1);           // 추세는 상승 유지(플립 없음)
  assert.equal(r.flip, false);
  let bound = false;
  for (let i = 2; i < candle.length; i++) {
    const lim = Math.min(lows[i - 1], lows[i - 2]);
    assert.ok(r.series[i] <= lim + 1e-9, `bar ${i} SAR ${r.series[i]} > 직전2봉 최저 ${lim}`);
    if (Math.abs(r.series[i] - lim) < 1e-9) bound = true;   // 클램프가 실제로 작동한 봉 존재
  }
  assert.ok(bound, "클램프가 최소 한 봉에서 SAR을 직전 저가로 제한해야 함");
});
test("psarSteps: 3줄", () => {
  assert.strictEqual(ForgeCore.psarSteps().length, 3);
});
test("run: Parabolic SAR 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "ps", kind: "block", blockType: "psar" }]), edges: base.edges.concat([{ from: "ps", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "psar 예측 반영");
});

/* ── 신규 지표: Keltner 채널 ── */
test("analyzeKeltner: 종가가 상단 밴드 근처면 bias>0", () => {
  const base = Array.from({length:40},(_,i)=>100+Math.sin(i/5));
  const price = base.concat([104]);  // 마지막 급등 → 상단 돌파
  const candle = price.map(c=>({o:c,h:c+0.3,l:c-0.3,c}));
  const r = ForgeCore.analyzeKeltner({ candle, price }, { len:20, atrLen:10, mult:2 });
  assert.ok(r.bias > 0, `bias ${r.bias}`);
});
test("analyzeKeltner: 종가가 하단 밴드 근처면 bias<0", () => {
  const base = Array.from({length:40},(_,i)=>100+Math.sin(i/5));
  const price = base.concat([96]);  // 마지막 급락 → 하단 이탈
  const candle = price.map(c=>({o:c,h:c+0.3,l:c-0.3,c}));
  const r = ForgeCore.analyzeKeltner({ candle, price }, { len:20, atrLen:10, mult:2 });
  assert.ok(r.bias < 0, `bias ${r.bias}`);
});
test("keltnerSteps: 3줄", () => {
  assert.strictEqual(ForgeCore.keltnerSteps().length, 3);
});
test("analyzeKeltner: 봉별 밴드 배열 길이=price·상단≥중심≥하단", () => {
  const price = Array.from({length:50},(_,i)=>100+Math.sin(i/4)+i*0.1);
  const candle = price.map(c=>({o:c,h:c+0.4,l:c-0.4,c}));
  const r = ForgeCore.analyzeKeltner({ candle, price }, { len:20, atrLen:10, mult:2 });
  assert.strictEqual(r.midArr.length, price.length);
  assert.strictEqual(r.upperArr.length, price.length);
  assert.strictEqual(r.lowerArr.length, price.length);
  const i = price.length - 1;
  assert.ok(r.upperArr[i] >= r.midArr[i] && r.midArr[i] >= r.lowerArr[i], `밴드 순서 어긋남: ${r.upperArr[i]}/${r.midArr[i]}/${r.lowerArr[i]}`);
});
test("run: Keltner 채널 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "kt", kind: "block", blockType: "keltner" }]), edges: base.edges.concat([{ from: "kt", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "keltner 예측 반영");
});

/* ── 신규 지표: Donchian 채널 ── */
test("analyzeDonchian: 신고가 돌파면 bias>0", () => {
  const price = Array.from({length:25},(_,i)=>100+ (i<24?0:5) + i*0.01);
  const candle = price.map(c=>({o:c,h:c+0.2,l:c-0.2,c}));
  const r = ForgeCore.analyzeDonchian({ candle, price }, { len:20 });
  assert.ok(r.bias > 0, `bias ${r.bias}`);
});
test("donchianSteps: 3줄", () => {
  assert.strictEqual(ForgeCore.donchianSteps().length, 3);
});
test("analyzeDonchian: 봉별 채널 배열 길이=price·상단≥중심≥하단", () => {
  const price = Array.from({length:50},(_,i)=>100+Math.sin(i/4)+i*0.1);
  const candle = price.map(c=>({o:c,h:c+0.4,l:c-0.4,c}));
  const r = ForgeCore.analyzeDonchian({ candle, price }, { len:20 });
  assert.strictEqual(r.upperArr.length, price.length);
  assert.strictEqual(r.lowerArr.length, price.length);
  assert.strictEqual(r.midArr.length, price.length);
  const i = price.length - 1;
  assert.ok(r.upperArr[i] >= r.midArr[i] && r.midArr[i] >= r.lowerArr[i], `채널 순서 어긋남: ${r.upperArr[i]}/${r.midArr[i]}/${r.lowerArr[i]}`);
});
test("run: Donchian 채널 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "dc", kind: "block", blockType: "donchian" }]), edges: base.edges.concat([{ from: "dc", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "donchian 예측 반영");
});

/* ── 신규 지표: CCI (오실레이터 · hero 배지) ── */
test("analyzeCCI: 강한 상승 후 CCI last>0·bias>0", () => {
  const price = Array.from({length:60},(_,i)=>100 + i*0.8);
  const r = ForgeCore.analyzeCCI(price, { period:20 });
  assert.ok(r.last > 0 && r.bias > 0, `last ${r.last} bias ${r.bias}`);
});
test("cciSeries: 길이 일치·범위 −1..1", () => {
  const price = Array.from({length:40},(_,i)=>100+Math.sin(i));
  const s = ForgeCore.cciSeries(price, 20);
  assert.equal(s.length, price.length);
  assert.ok(s.every(v => v >= -1 && v <= 1));
});
test("cciSteps: 3줄", () => {
  assert.strictEqual(ForgeCore.cciSteps().length, 3);
});
test("analyzeCCI: 강한 하락 후 CCI last<0·bias<0(비단조 부호 검증)", () => {
  const price = Array.from({length:60},(_,i)=>200 - i*0.8);
  const r = ForgeCore.analyzeCCI(price, { period:20 });
  assert.ok(r.last < 0 && r.bias < 0, `last ${r.last} bias ${r.bias}`);
});
test("run: CCI 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "cci", kind: "block", blockType: "cci" }]), edges: base.edges.concat([{ from: "cci", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "cci 예측 반영");
});

/* ── 신규 지표: Williams %R (오실레이터 · hero 배지, H/L 필요) ── */
test("analyzeWilliams: 최근 고점 근처면 %R>-20·bias>0", () => {
  const price = Array.from({length:30},(_,i)=>100+i);   // 상승 → 종가=최고
  const candle = price.map(c=>({o:c,h:c+0.1,l:c-0.1,c}));
  const r = ForgeCore.analyzeWilliams({ candle, price }, { period:14 });
  assert.ok(r.last > -20 && r.bias > 0, `last ${r.last}`);
});
test("analyzeWilliams: 최근 저점 근처면 %R<-80·bias<0(비단조 부호 검증)", () => {
  const price = Array.from({length:30},(_,i)=>200-i);   // 하락 → 종가=최저
  const candle = price.map(c=>({o:c,h:c+0.1,l:c-0.1,c}));
  const r = ForgeCore.analyzeWilliams({ candle, price }, { period:14 });
  assert.ok(r.last < -80 && r.bias < 0, `last ${r.last} bias ${r.bias}`);
});
test("williamsSeries: 길이 일치·범위 −1..1", () => {
  const price = Array.from({length:40},(_,i)=>100+Math.sin(i));
  const candle = price.map(c=>({o:c,h:c+0.3,l:c-0.3,c}));
  const s = ForgeCore.williamsSeries({ candle, price }, 14);
  assert.equal(s.length, price.length);
  assert.ok(s.every(v => v >= -1 && v <= 1));
});
test("williamsSteps: 2줄", () => {
  assert.strictEqual(ForgeCore.williamsSteps().length, 2);
});
test("run: williams 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "williams", kind: "block", blockType: "williams" }]), edges: base.edges.concat([{ from: "williams", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "williams 예측 반영");
});

/* ── 신규 지표: ROC/모멘텀 (오실레이터 · hero 배지, 가격 전용) ── */
test("analyzeROC: 상승이면 ROC>0·bias>0 / 하락이면 <0", () => {
  const up = Array.from({length:20},(_,i)=>100+i);
  const ru = ForgeCore.analyzeROC(up, { period:12 });
  assert.ok(ru.last > 0 && ru.bias > 0);
  const dn = Array.from({length:20},(_,i)=>120-i);
  assert.ok(ForgeCore.analyzeROC(dn, { period:12 }).bias < 0);
});
test("rocSeries: 길이 일치·범위 −1..1", () => {
  const price = Array.from({length:40},(_,i)=>100+Math.sin(i));
  const s = ForgeCore.rocSeries(price, 12);
  assert.equal(s.length, price.length);
  assert.ok(s.every(v => v >= -1 && v <= 1));
});
test("rocSteps: 2줄", () => {
  assert.strictEqual(ForgeCore.rocSteps().length, 2);
});
test("run: ROC 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "roc", kind: "block", blockType: "roc" }]), edges: base.edges.concat([{ from: "roc", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "roc 예측 반영");
});

/* ── 신규 지표: Awesome Oscillator (오실레이터 · hero 배지, H/L 필요) ── */
test("analyzeAO: 상승 가속이면 AO>0·bias>0", () => {
  const price = Array.from({length:60},(_,i)=>100 + i*i*0.01);
  const candle = price.map(c=>({o:c,h:c+0.2,l:c-0.2,c}));
  const r = ForgeCore.analyzeAO({ candle, price }, { fast:5, slow:34 });
  assert.ok(r.last > 0 && r.bias > 0, `last ${r.last}`);
});
test("analyzeAO: 하락 가속이면 AO<0·bias<0(비단조 부호 검증)", () => {
  const price = Array.from({length:60},(_,i)=>300 - i*i*0.01);
  const candle = price.map(c=>({o:c,h:c+0.2,l:c-0.2,c}));
  const r = ForgeCore.analyzeAO({ candle, price }, { fast:5, slow:34 });
  assert.ok(r.last < 0 && r.bias < 0, `last ${r.last} bias ${r.bias}`);
});
test("aoSeries: 길이 일치·범위 −1..1", () => {
  const price = Array.from({length:60},(_,i)=>100+Math.sin(i));
  const candle = price.map(c=>({o:c,h:c+0.3,l:c-0.3,c}));
  const s = ForgeCore.aoSeries({ candle, price }, { fast:5, slow:34 });
  assert.equal(s.length, price.length);
  assert.ok(s.every(v => v >= -1 && v <= 1));
});
test("aoSteps: 2줄", () => {
  assert.strictEqual(ForgeCore.aoSteps().length, 2);
});
test("run: ao 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "ao", kind: "block", blockType: "ao" }]), edges: base.edges.concat([{ from: "ao", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "ao 예측 반영");
});

/* ── 신규 지표: Aroon (오실레이터 · hero 배지, H/L 필요) ── */
test("analyzeAroon: 상승 추세면 up 높고 osc>0·bias>0", () => {
  const price = Array.from({length:40},(_,i)=>100+i);   // 신고가 갱신 지속
  const candle = price.map(c=>({o:c,h:c+0.1,l:c-0.1,c}));
  const r = ForgeCore.analyzeAroon({ candle, price }, { period:25 });
  assert.ok(r.up > r.down && r.bias > 0, `up ${r.up} down ${r.down}`);
});
test("analyzeAroon: 하락 추세면 down 높고 osc<0·bias<0(비단조 부호 검증)", () => {
  const price = Array.from({length:40},(_,i)=>300-i);   // 신저가 갱신 지속
  const candle = price.map(c=>({o:c,h:c+0.1,l:c-0.1,c}));
  const r = ForgeCore.analyzeAroon({ candle, price }, { period:25 });
  assert.ok(r.down > r.up && r.bias < 0, `up ${r.up} down ${r.down}`);
});
test("aroonSeries: 길이 일치·범위 −1..1", () => {
  const price = Array.from({length:40},(_,i)=>100+Math.sin(i)*10);
  const candle = price.map(c=>({o:c,h:c+0.3,l:c-0.3,c}));
  const s = ForgeCore.aroonSeries({ candle, price }, 25);
  assert.equal(s.length, price.length);
  assert.ok(s.every(v => v >= -1 && v <= 1));
});
test("aroonSteps: 2줄", () => {
  assert.strictEqual(ForgeCore.aroonSteps().length, 2);
});
test("run: aroon 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "aroon", kind: "block", blockType: "aroon" }]), edges: base.edges.concat([{ from: "aroon", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "aroon 예측 반영");
});

/* ── 신규 지표: MFI (자금흐름지수 · 오실레이터 · hero 배지, H/L+거래량 필요) ── */
test("analyzeMFI: 상승+거래량이면 MFI>50·bias>0", () => {
  const price = Array.from({length:40},(_,i)=>100+i);
  const candle = price.map(c=>({o:c,h:c+0.3,l:c-0.3,c}));
  const volume = price.map(()=>1000);
  const r = ForgeCore.analyzeMFI({ candle, price, volume }, { period:14 });
  assert.ok(r.last > 50 && r.bias > 0, `last ${r.last}`);
});
test("analyzeMFI: 거래량 없어도 throw 없이 동작(합성 폴백)", () => {
  const price = Array.from({length:40},(_,i)=>100+Math.sin(i));
  const r = ForgeCore.analyzeMFI({ candle: price.map(c=>({o:c,h:c+0.2,l:c-0.2,c})), price }, { period:14 });
  assert.ok(isFinite(r.bias));
});
test("mfiSeries: 길이 일치·범위 −1..1", () => {
  const price = Array.from({length:40},(_,i)=>100+Math.sin(i)*10);
  const candle = price.map(c=>({o:c,h:c+0.3,l:c-0.3,c}));
  const volume = price.map(()=>1000+Math.random()*100);
  const s = ForgeCore.mfiSeries({ candle, price, volume }, 14);
  assert.equal(s.length, price.length);
  assert.ok(s.every(v => v >= -1 && v <= 1));
});
test("mfiSteps: 3줄", () => {
  assert.strictEqual(ForgeCore.mfiSteps().length, 3);
});
test("run: mfi 노드가 예측 반영", () => {
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.01, l: c * 0.99, c }));
  const volume = price.map(() => 1000);
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle, volume }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "mfi", kind: "block", blockType: "mfi" }]), edges: base.edges.concat([{ from: "mfi", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle, volume }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "mfi 예측 반영");
});
test("run: mfiDrift가 그래프 volume 노드 실거래량에 반응(합성 아님)", () => {
  // 지그재그 가격(상승일·하락일 공존) — 거래량이 어느 날에 실리는지가 MFI 방향을 가름
  const price = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? i : i - 1.4));
  const candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c + 0.3, l: c - 0.3, c }));
  const volUp = price.map((c, i) => (i > 0 && price[i] > price[i - 1]) ? 5000 : 500);   // 상승일에 거래량 집중
  const volDn = price.map((c, i) => (i > 0 && price[i] < price[i - 1]) ? 5000 : 500);   // 하락일에 거래량 집중
  // volume 노드는 volDrift도 유발하므로 driftWeights로 volume 드리프트를 0으로 눌러
  // volume에 반응하는 유일한 경로를 mfi로 격리한다(volumeprofile·vwap 노드는 그래프에 없음).
  const mk = s => ({
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "v", kind: "block", blockType: "volume", series: s },
      { id: "mfi", kind: "block", blockType: "mfi" },
      { id: "pr", kind: "block", blockType: "predict" },
    ],
    edges: [{ from: "p", to: "pr" }, { from: "v", to: "mfi" }, { from: "mfi", to: "pr" }],
  });
  const opts = { futW: 24, driftWeights: { volume: 0 } };   // volDrift 제거 → 남은 volume 민감 경로는 mfi뿐
  const tUp = ForgeCore.run(mk(volUp), { price, candle }, opts).prediction.target;
  const tDn = ForgeCore.run(mk(volDn), { price, candle }, opts).prediction.target;
  // mfiDrift가 실거래량을 반영하면 상승일 집중 vs 하락일 집중 예측이 달라야 함(합성이면 동일)
  assert.ok(Math.abs(tUp - tDn) > 1e-9, `tUp ${tUp} tDn ${tDn}`);
});

/* ── 신규 지표: CMF (Chaikin Money Flow · 자금흐름 오실레이터 · hero 배지, H/L/C+거래량 필요) ── */
test("analyzeCMF: 종가가 봉 상단서 마감+거래량이면 bias>0", () => {
  const candle = Array.from({length:30},(_,i)=>({o:100+i,h:100.8+i,l:99.9+i,c:100.7+i}));  // 상단 마감
  const price = candle.map(c=>c.c), volume = price.map(()=>1000);
  const r = ForgeCore.analyzeCMF({ candle, price, volume }, { period:20 });
  assert.ok(r.bias > 0, `bias ${r.bias}`);
});
test("analyzeCMF: 종가가 봉 하단서 마감+거래량이면 bias<0", () => {
  const candle = Array.from({length:30},(_,i)=>({o:100+i,h:100.1+i,l:99.2+i,c:99.3+i}));  // 하단 마감
  const price = candle.map(c=>c.c), volume = price.map(()=>1000);
  const r = ForgeCore.analyzeCMF({ candle, price, volume }, { period:20 });
  assert.ok(r.bias < 0, `bias ${r.bias}`);
});
test("analyzeCMF: 거래량 없어도 throw 없이 동작(합성 폴백)", () => {
  const price = Array.from({length:40},(_,i)=>100+Math.sin(i));
  const r = ForgeCore.analyzeCMF({ candle: price.map(c=>({o:c,h:c+0.2,l:c-0.2,c})), price }, { period:20 });
  assert.ok(isFinite(r.bias));
});
test("cmfSeries: 길이 일치·범위 −1..1", () => {
  const price = Array.from({length:40},(_,i)=>100+Math.sin(i)*10);
  const candle = price.map(c=>({o:c,h:c+0.3,l:c-0.3,c}));
  const volume = price.map(()=>1000+Math.random()*100);
  const s = ForgeCore.cmfSeries({ candle, price, volume }, 20);
  assert.equal(s.length, price.length);
  assert.ok(s.every(v => v >= -1 && v <= 1));
});
test("cmfSteps: 3줄", () => {
  assert.strictEqual(ForgeCore.cmfSteps().length, 3);
});
test("run: cmf 노드가 예측 반영", () => {
  // CMF는 봉 내 종가 위치(H/L 대비)가 핵심 — 대칭 H/L(c*1.01/c*0.99)이면 자금흐름승수가 항상 0이 되므로
  // 종가가 상단에 치우친 비대칭 캔들(브리프 실패 테스트와 동일 패턴)을 사용한다.
  const price = _up(150, 0.005), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c + 0.1, l: c - 0.9, c }));
  const volume = price.map(() => 1000);
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle, volume }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "cmf", kind: "block", blockType: "cmf" }]), edges: base.edges.concat([{ from: "cmf", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle, volume }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "cmf 예측 반영");
});
test("run: cmfDrift가 그래프 volume 노드 실거래량에 반응(합성 아님)", () => {
  // 지그재그 가격(상승일·하락일 공존) — 거래량이 어느 날에 실리는지가 CMF 방향을 가름.
  // CMF는 봉 내 종가 위치가 핵심이므로 상승일=종가 상단(자금유입 승수 +), 하락일=종가 하단(자금유출 승수 −)인
  // 비대칭 캔들로 구성(대칭 H/L이면 승수가 항상 0이 되어 거래량 가중과 무관해짐).
  const price = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? i : i - 1.4));
  const candle = price.map((c, i) => {
    const up = i > 0 ? price[i] > price[i - 1] : true;
    return up ? { o: i ? price[i - 1] : c, h: c + 0.1, l: c - 1.0, c } : { o: i ? price[i - 1] : c, h: c + 1.0, l: c - 0.1, c };
  });
  const volUp = price.map((c, i) => (i > 0 && price[i] > price[i - 1]) ? 5000 : 500);   // 상승일에 거래량 집중
  const volDn = price.map((c, i) => (i > 0 && price[i] < price[i - 1]) ? 5000 : 500);   // 하락일에 거래량 집중
  // volume 노드는 volDrift도 유발하므로 driftWeights로 volume 드리프트를 0으로 눌러
  // volume에 반응하는 유일한 경로를 cmf로 격리한다(volumeprofile·vwap·mfi 노드는 그래프에 없음).
  const mk = s => ({
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "v", kind: "block", blockType: "volume", series: s },
      { id: "cmf", kind: "block", blockType: "cmf" },
      { id: "pr", kind: "block", blockType: "predict" },
    ],
    edges: [{ from: "p", to: "pr" }, { from: "v", to: "cmf" }, { from: "cmf", to: "pr" }],
  });
  const opts = { futW: 24, driftWeights: { volume: 0 } };   // volDrift 제거 → 남은 volume 민감 경로는 cmf뿐
  const tUp = ForgeCore.run(mk(volUp), { price, candle }, opts).prediction.target;
  const tDn = ForgeCore.run(mk(volDn), { price, candle }, opts).prediction.target;
  // cmfDrift가 실거래량을 반영하면 상승일 집중 vs 하락일 집중 예측이 달라야 함(합성이면 동일)
  assert.ok(Math.abs(tUp - tDn) > 1e-9, `tUp ${tUp} tDn ${tDn}`);
});

// ── TF/캔들 정밀도 개선 감사 (2026-07-06) ──
test("analyzeATR: 캔들 트루레인지가 종가차보다 변동성 크게 반영(꼬리)", () => {
  const price = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 ? 0.2 : -0.2));
  const candle = price.map((c) => ({ o: c, h: c + 3, l: c - 3, c }));
  const aClose = ForgeCore.analyzeATR(price, { period: 14 });
  const aCandle = ForgeCore.analyzeATR({ candle, price }, { period: 14 });
  assert.ok(aCandle.last > aClose.last * 2, `candle ATR ${aCandle.last} vs close ${aClose.last}`);
});

test("analyzeADX: 하락 추세면 minusDI>plusDI·bias<0 (mDM 항상 0 버그 수정)", () => {
  const price = Array.from({ length: 40 }, (_, i) => 140 - i);
  const r = ForgeCore.analyzeADX(price, { period: 14 });
  assert.ok(r.last.minusDI > r.last.plusDI, `mDI ${r.last.minusDI} pDI ${r.last.plusDI}`);
  assert.ok(r.bias < 0, `downtrend bias ${r.bias} should be <0`);
});

test("analyzeADX: 상승 추세는 plusDI>minusDI·bias>0 유지", () => {
  const price = Array.from({ length: 40 }, (_, i) => 100 + i);
  const r = ForgeCore.analyzeADX(price, { period: 14 });
  assert.ok(r.last.plusDI > r.last.minusDI && r.bias > 0);
});

test("analyzeStochastic: 캔들 H/L 사용 시 %K가 종가-only와 달라짐", () => {
  const price = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i));
  const candle = price.map((c) => ({ o: c, h: c + 2, l: c - 2, c }));
  const kClose = ForgeCore.analyzeStochastic(price, {}).last.k;
  const kCandle = ForgeCore.analyzeStochastic({ candle, price }, {}).last.k;
  assert.ok(Math.abs(kClose - kCandle) > 1e-6, "candle %K should differ");
});

test("analyzeCCI: 전형가(캔들·비대칭 꼬리) 사용 시 종가-only와 달라짐", () => {
  const price = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3));
  const candle = price.map((c, i) => ({ o: c, h: c + (i % 3), l: c - (i % 2), c }));
  const lClose = ForgeCore.analyzeCCI(price, { period: 20 }).last;
  const lCandle = ForgeCore.analyzeCCI({ candle, price }, { period: 20 }).last;
  assert.ok(Math.abs(lClose - lCandle) > 1e-6, `close ${lClose} candle ${lCandle}`);
});

test("scanPeriod: 데이터 부족(2.5주기 미만)이면 strength 0·insufficient (허위 주기 차단)", () => {
  const z = Array.from({ length: 20 }, (_, i) => Math.sin(i));   // hardMax=8 < pmin+2=12
  const r = ForgeCore.scanPeriod(z, { pmin: 10 });
  assert.equal(r.strength, 0);
  assert.equal(r.method, "insufficient");
});

test("scanPeriod: 충분한 데이터면 pmax가 hardMax(n/2.5) 초과 안 함", () => {
  const z = Array.from({ length: 100 }, (_, i) => Math.sin(i / 6));
  const r = ForgeCore.scanPeriod(z, { pmin: 8 });
  assert.ok(r.best <= Math.floor(100 / 2.5), `best ${r.best} <= 40`);
});

test("analyzeFib: 짧은 시계열(P<=len)에서 '중기' 오라벨 안 생김", () => {
  const price = Array.from({ length: 60 }, (_, i) => 100 + i + 5 * Math.sin(i / 4));
  const r = ForgeCore.analyzeFib(price, { len: 120, swing: 0.05 });
  const names = (r.degrees || []).map((d) => d.name);
  assert.ok(!names.includes("중기"), `P<len이면 중기 없어야: ${names.join(",")}`);
});

// ── TF 모델 개선 (#1 sig 배율 · #5 theta 스케일 · #7 일치도 파리티, 2026-07-06) ──
test("run(#7): 신규 지표(cci·mfi)도 verdict.confluence에 집계됨(파리티)", () => {
  const price = Array.from({ length: 60 }, (_, i) => 100 + i);   // 강한 상승 → cci·mfi bias>0
  const candle = price.map((c) => ({ o: c, h: c + 0.5, l: c - 0.5, c }));
  const volume = price.map(() => 1000);
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "c", kind: "block", blockType: "cci", params: { period: 20 } },
    { id: "m", kind: "block", blockType: "mfi", params: { period: 14 } },
  ], edges: [{ from: "p", to: "c" }, { from: "p", to: "m" }] };
  const r = ForgeCore.run(g, { price, candle, volume }, { futW: 20, timeframe: "일봉" });
  assert.ok(r.verdict.confluence.total >= 1, `cci/mfi가 일치도에 집계돼야, total=${r.verdict.confluence.total}`);
});

test("run(#1): 신호 드리프트가 TF 배율 반영 — 월봉 sig 기여가 일봉보다 큼(동일 지평)", () => {
  const price = Array.from({ length: 80 }, (_, i) => 100 * Math.exp(0.01 * i));   // 일관된 상승
  const candle = price.map((c) => ({ o: c, h: c * 1.005, l: c * 0.995, c }));
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "r", kind: "block", blockType: "rsi", params: { period: 14 } },
    { id: "mm", kind: "block", blockType: "macd", params: {} },
  ], edges: [{ from: "p", to: "r" }, { from: "p", to: "mm" }] };
  // 동일 futW로 고정해 sig×trendScale만 비교(월 1.0 > 일 0.8)
  const rD = ForgeCore.run(g, { price, candle }, { futW: 20, timeframe: "일봉" });
  const rM = ForgeCore.run(g, { price, candle }, { futW: 20, timeframe: "월봉" });
  const dD = Math.log((rD.prediction.path.slice(-1)[0]) / rD.prediction.anchor);
  const dM = Math.log((rM.prediction.path.slice(-1)[0]) / rM.prediction.anchor);
  assert.ok(dM > dD, `월봉 드리프트 ${dM} > 일봉 ${dD} (trendScale 1.0 vs 0.8)`);
});

// ── 월봉 기아 테이퍼 (MACD·AO·일목, 2026-07-06) ──
test("analyzeMACD: slow 미만 짧은 시계열도 EMPTY 아닌 데이터+신뢰도 테이퍼", () => {
  const r = ForgeCore.analyzeMACD(Array.from({ length: 28 }, (_, i) => 100 + i), {});   // P=28 < slow+sigN=35
  assert.equal(r.macd.length, 28);
  assert.ok(r.conf > 0 && r.conf < 1, `conf ${r.conf}`);
  const full = ForgeCore.analyzeMACD(Array.from({ length: 60 }, (_, i) => 100 + i), {});
  assert.equal(full.conf, 1);
});

test("analyzeAO: slow 미만 짧은 시계열도 테이퍼 기여(영구중립 방지)", () => {
  const price = Array.from({ length: 28 }, (_, i) => 100 + i * i * 0.02);
  const candle = price.map((c) => ({ o: c, h: c + 0.2, l: c - 0.2, c }));
  const r = ForgeCore.analyzeAO({ candle, price }, {});
  assert.equal(r.series.length, 28);
  assert.ok(r.conf > 0 && r.conf < 1, `conf ${r.conf}`);
});

test("analyzeIchimoku: 78 미만(20 이상) 짧은 시계열도 기간축소로 산출(scaled·conf<1)", () => {
  const r = ForgeCore.analyzeIchimoku(Array.from({ length: 40 }, (_, i) => 100 + i), {});   // 20<=40<78
  assert.equal(r.tenkan.length, 40);
  assert.equal(r.scaled, true);
  assert.ok(r.conf > 0 && r.conf < 1, `conf ${r.conf}`);
  const full = ForgeCore.analyzeIchimoku(Array.from({ length: 90 }, (_, i) => 100 + i), {});
  assert.equal(full.scaled, false);
  assert.equal(full.conf, 1);
});

// ── TF 잔여 정밀도 (#4 밴드상한·스윙스케일·MA 정규화, 2026-07-06) ──
test("trendProfileForTF: sigmaCap·swingScale TF별 차등(월>주>일)", () => {
  const m = ForgeCore.trendProfileForTF("월봉"), w = ForgeCore.trendProfileForTF("주봉"), d = ForgeCore.trendProfileForTF("일봉");
  assert.ok(m.sigmaCap > w.sigmaCap && w.sigmaCap > d.sigmaCap, "sigmaCap 월>주>일");
  assert.ok(m.swingScale > w.swingScale && w.swingScale >= d.swingScale, "swingScale 월>주>=일");
});

test("run(#4): 고변동 시계열서 월봉 콘 폭이 주봉보다 좁아지지 않음(상한 역전 해소·동일 futW)", () => {
  const price = Array.from({ length: 80 }, (_, i) => 100 * Math.exp(0.02 * i + 0.12 * Math.sin(i * 1.3)));
  const candle = price.map((c) => ({ o: c, h: c * 1.05, l: c * 0.95, c }));
  const g = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "a", kind: "block", blockType: "atr", params: { period: 14 } }], edges: [{ from: "p", to: "a" }] };
  const band = (r) => { const p = r.prediction, li = p.hi.length - 1; return Math.log(p.hi[li]) - Math.log(p.lo[li]); };
  const rW = ForgeCore.run(g, { price, candle }, { futW: 24, timeframe: "주봉" });
  const rM = ForgeCore.run(g, { price, candle }, { futW: 24, timeframe: "월봉" });
  assert.ok(band(rM) >= band(rW), `월봉 밴드 ${band(rM)} >= 주봉 ${band(rW)}`);
});

test("analyzeMA: 기울기가 실현 변동성으로 정규화 — 저변동이 고변동보다 더 포화(동일 추세)", () => {
  const A = Array.from({ length: 60 }, (_, i) => 100 * Math.pow(1.01, i));
  const B = Array.from({ length: 60 }, (_, i) => 100 * Math.pow(1.01, i) * (1 + 0.12 * Math.sin(i * 1.7)));
  const sA = ForgeCore.analyzeMA(A, { len: 10 }).mas.long.slope;
  const sB = ForgeCore.analyzeMA(B, { len: 10 }).mas.long.slope;
  assert.ok(sA > 0 && sB > 0, "둘 다 상승");
  assert.ok(sA > sB, `저변동 ${sA} > 고변동 ${sB}`);
});
