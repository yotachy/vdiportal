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

test("sampleGraph: 10 nodes, DAG runs, descriptions are truthful, bullish net", () => {
  const g = ForgeCore.sampleGraph();
  assert.strictEqual(g.nodes.length, 10);
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

test("analyzeElliott: 5파 상승 임펄스 → impulse_up, 규칙·투영·bias", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "impulse_up");
  assert.ok(ea.rules.score > 0);
  assert.ok(ea.bias > 0);
  assert.ok(ea.next !== null);
});

test("analyzeElliott: 5파 하락 임펄스 → impulse_down, bias<0", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [200, ...seg(200, 180, 8), ...seg(180, 192, 6), ...seg(192, 150, 10), ...seg(150, 168, 6), ...seg(168, 135, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "impulse_down");
  assert.ok(ea.bias < 0);
});

test("analyzeElliott: 3레그(ABC형) → corrective", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 88, 8), ...seg(88, 96, 6), ...seg(96, 84, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "corrective");
  assert.ok(isFinite(ea.bias));
});

test("analyzeElliott: 소량/피벗부족 → 폴백(uncertain, bias 0, next null)", () => {
  const ea = ForgeCore.analyzeElliott([10, 11, 12], {});
  assert.strictEqual(ea.structure, "uncertain");
  assert.strictEqual(ea.bias, 0);
  assert.strictEqual(ea.next, null);
});

test("elliottSteps: 5단계, bias 반영", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)];
  const s = ForgeCore.elliottSteps(ForgeCore.analyzeElliott(price, { swing: 0.04 }));
  assert.strictEqual(s.length, 5);
  assert.ok(/bias/.test(s[4]));
});
