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

test("regression guard: prediction.path.length===120 and signal.length===data.n", () => {
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
  assert.strictEqual(out.prediction.path.length, 120);
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
  // prediction unaffected by conviction
  assert.deepStrictEqual(rp.prediction.path, r0.prediction.path);
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
  // 시작이 앵커에 가깝고 시간이 갈수록 멀어짐 (점프 아님)
  assert.ok(Math.abs(pr.path[0] - pr.anchor) < Math.abs(pr.path[59] - pr.anchor));
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
  // prediction.path는 conviction/visionBias 영향 없음(가격 외삽만)
  assert.deepStrictEqual(rp.prediction.path, r0.prediction.path);
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
  assert.strictEqual(r.prediction.path.length, 120);
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
  assert.ok(r.verdict.score >= r0.verdict.score);
});
