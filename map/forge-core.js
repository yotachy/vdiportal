(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ForgeCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const version = "0.1.0";

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeDemoSeries(opts) {
    const o = opts || {}, n = o.n || 480, period = o.period || 64, rnd = mulberry32(o.seed || 1);
    const price = [], orange = [], blue = [], candle = [];
    let p = 100, trend = 0.02;
    for (let i = 0; i < n; i++) {
      const cyc = Math.sin(2 * Math.PI * i / period), cyc2 = Math.sin(2 * Math.PI * i / (period * 1.6) + 0.7);
      const noise = (rnd() - 0.5) * 1.2;
      p = p + trend + cyc * 0.6 + noise;
      const op = p - (rnd() - 0.5) * 0.8, cl = p + (rnd() - 0.5) * 0.8;
      const hi = Math.max(op, cl) + rnd() * 0.6, lo = Math.min(op, cl) - rnd() * 0.6;
      price.push(p);
      candle.push({ o: op, h: hi, l: lo, c: cl });
      orange.push(cyc + (rnd() - 0.5) * 0.15);
      blue.push(cyc2 + (rnd() - 0.5) * 0.15);
    }
    return { price, orange, blue, candle, n };
  }

  function buildDAG(graph) {
    const blocks = graph.nodes.filter(n => n.kind === "block");
    const ids = new Set(blocks.map(n => n.id)), byId = {};
    blocks.forEach(n => byId[n.id] = n);
    const inputsOf = {}; blocks.forEach(n => inputsOf[n.id] = []);
    graph.edges.forEach(e => { if (ids.has(e.from) && ids.has(e.to)) inputsOf[e.to].push(e.from); });
    const indeg = {}; blocks.forEach(n => indeg[n.id] = inputsOf[n.id].length);
    const q = blocks.filter(n => indeg[n.id] === 0).map(n => n.id), order = [];
    const adj = {}; blocks.forEach(n => adj[n.id] = []);
    graph.edges.forEach(e => { if (ids.has(e.from) && ids.has(e.to)) adj[e.from].push(e.to); });
    while (q.length) { const u = q.shift(); order.push(u);
      adj[u].forEach(v => { if (--indeg[v] === 0) q.push(v); }); }
    if (order.length !== blocks.length) throw new Error("cycle");
    return { order, byId, inputsOf };
  }

  function sma(arr, len) {
    const out = [];
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      s += arr[i];
      if (i >= len) s -= arr[i - len];
      out.push(s / Math.min(i + 1, len));
    }
    return out;
  }

  function detrendNorm(y) {
    const n = y.length;
    if (!n) return [];
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      sx += i;
      sy += y[i];
      sxx += i * i;
      sxy += i * y[i];
    }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
    const d = y.map((v, i) => v - (a + b * i));
    let m = 0;
    d.forEach(v => m += v);
    m /= n;
    let s = 0;
    d.forEach(v => s += (v - m) * (v - m));
    s = Math.sqrt(s / n) || 1;
    return d.map(v => (v - m) / s);
  }

  function pdmTheta(z, P, nbins) {
    nbins = nbins || 10;
    const n = z.length;
    const bins = Array.from({ length: nbins }, () => []);
    for (let i = 0; i < n; i++) {
      const ph = ((i % P) + P) % P / P;
      bins[Math.min(nbins - 1, Math.floor(ph * nbins))].push(z[i]);
    }
    let num = 0, cnt = 0, gm = 0;
    for (let i = 0; i < n; i++) gm += z[i];
    gm /= n;
    let gv = 0;
    for (let i = 0; i < n; i++) gv += (z[i] - gm) * (z[i] - gm);
    gv /= n;
    bins.forEach(b => {
      if (b.length < 2) return;
      let m = 0;
      b.forEach(v => m += v);
      m /= b.length;
      let v = 0;
      b.forEach(x => v += (x - m) * (x - m));
      num += v;
      cnt += b.length - 1;
    });
    return cnt > 0 && gv > 0 ? (num / cnt) / gv : NaN;
  }

  function scanPeriod(z, opts) {
    const o = opts || {}, pmin = o.pmin || 8, pmax = o.pmax || Math.floor(z.length / 3), step = o.step || 0.5;
    const curve = [];
    let best = pmin, bt = Infinity;
    for (let P = pmin; P <= pmax; P += step) {
      const t = pdmTheta(z, P);
      curve.push({ P, theta: t });
      if (!isNaN(t) && t < bt) {
        bt = t;
        best = P;
      }
    }
    return { best, curve };
  }

  function evalBlocks(graph, data) {
    const { order, byId, inputsOf } = buildDAG(graph), values = {}, meta = {};
    for (const id of order) {
      const n = byId[id], ins = inputsOf[id].map(i => values[i]);
      if (n.blockType === "price") {
        values[id] = data.price.slice();
      } else if (n.blockType === "ma") {
        values[id] = sma(ins[0] || data.price, (n.params && n.params.len) || 5);
      } else if (n.blockType === "combine") {
        const w = (n.params && n.params.weights) || {}, keys = inputsOf[id];
        const tot = keys.reduce((a, k) => a + (w[k] != null ? w[k] : 1), 0) || 1;
        const len = ins[0] ? ins[0].length : 0, out = new Array(len).fill(0);
        keys.forEach((k, j) => {
          const wk = (w[k] != null ? w[k] : 1) / tot;
          for (let t = 0; t < len; t++) out[t] += (ins[j][t] || 0) * wk;
        });
        values[id] = out;
      } else if (n.blockType === "phasefold") {
        const src = ins[0] || data.price, dn = detrendNorm(src);
        const sc = scanPeriod(dn, { pmin: (n.params && n.params.pmin) || 8, pmax: (n.params && n.params.pmax) || Math.floor(src.length / 3) });
        values[id] = dn;
        meta[id] = { best: sc.best, theta: pdmTheta(dn, sc.best), curve: sc.curve };
      } else {
        values[id] = ins[0] ? ins[0].slice() : [];
      }
    }
    return { values, meta };
  }

  function tanh(x) {
    const e = Math.exp(-2 * x);
    return (1 - e) / (1 + e);
  }

  function linfit(y) {
    const n = y.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      sx += i;
      sy += y[i];
      sxx += i * i;
      sxy += i * y[i];
    }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
    return { a, b };
  }

  function aggregateConviction(graph) {
    let s = 0, c = 0;
    (graph.nodes || []).forEach(n => {
      const v = n && n.conviction;
      if (typeof v === "number" && isFinite(v) && v !== 0) {
        s += v;
        c++;
      }
    });
    return c ? s / c : 0;
  }

  function run(graph, data, opts) {
    const futW = (opts && opts.futW) || 120;
    const ev = evalBlocks(graph, data), { values, meta } = ev;
    const outNode = graph.nodes.find(n => n.kind === "block" && (n.blockType === "predict"));
    const inputsOf = buildDAG(graph).inputsOf;
    // 합성 시그널: 출력 입력(없으면 combine/마지막) 시계열을 정규화
    let sigSrc = null;
    if (outNode) {
      const ins = inputsOf[outNode.id];
      if (ins && ins[0]) sigSrc = values[ins[0]];
    }
    if (!sigSrc) {
      const c = graph.nodes.find(n => n.blockType === "combine");
      if (c) sigSrc = values[c.id];
    }
    if (!sigSrc) sigSrc = data.price;
    const dn = detrendNorm(sigSrc), signal = dn.map(v => Math.max(-100, Math.min(100, Math.round(100 * tanh(v / 1.5)))));
    // 확신 바이어스 적용
    const bias = aggregateConviction(graph), K = 0.5;
    const sigB = bias ? signal.map(v => Math.max(-100, Math.min(100, Math.round(v + bias * K)))) : signal;
    // 예측: 가격 추세 + (phasefold 메타 있으면) 주기 외삽
    const price = data.price, { a, b } = linfit(price), n = price.length;
    const fmeta = Object.values(meta || {}).find(m => m && m.best);
    // 잔차표준편차
    let res = 0;
    for (let i = 0; i < n; i++) {
      const e = price[i] - (a + b * i);
      res += e * e;
    }
    res = Math.sqrt(res / n);
    const path = [], lo = [], hi = [];
    for (let k = 1; k <= futW; k++) {
      const i = n - 1 + k;
      let v = a + b * i;
      if (fmeta) {
        const P = fmeta.best;
        v += Math.sin(2 * Math.PI * i / P) * res * 0.8;
      }
      const band = res * (0.6 + 0.02 * k);
      path.push(v);
      lo.push(v - band);
      hi.push(v + band);
    }
    const lastSig = sigB.slice(-10).reduce((s, v) => s + v, 0) / 10;
    const regime = lastSig > 12 ? "bull" : lastSig < -12 ? "bear" : "neutral";
    const last = price[n - 1], target = last * (1 + lastSig / 1000);
    const recent = price.slice(-30), invalidation = regime === "bear" ? Math.max(...recent) : Math.min(...recent);
    return {
      values, meta, prediction: { path, lo, hi, futW }, signal: sigB,
      verdict: { regime, score: Math.round(lastSig), target, invalidation }
    };
  }

  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run };
});
