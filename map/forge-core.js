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
      price.push(cl); // price === candle close (예측 seam이 마지막 캔들과 정확히 정합)
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
        const eff = keys.map(k => {
          const manual = (w[k] != null ? w[k] : 1);
          const sw = (byId[k] && byId[k].weight != null && isFinite(byId[k].weight)) ? byId[k].weight : 50;
          const arr = values[k];
          return (arr && arr.length) ? manual * (sw / 50) : 0;
        });
        const tot = eff.reduce((a, e) => a + e, 0) || 1;
        const len = Math.max(0, ...keys.map(k => (values[k] ? values[k].length : 0)));
        const out = new Array(len).fill(0);
        keys.forEach((k, j) => {
          const wk = eff[j] / tot;
          const arr = values[k] || [];
          for (let t = 0; t < len; t++) out[t] += (arr[t] || 0) * wk;
        });
        values[id] = out;
      } else if (n.blockType === "phasefold") {
        const src = ins[0] || data.price, dn = detrendNorm(src);
        const sc = scanPeriod(dn, { pmin: (n.params && n.params.pmin) || 8, pmax: (n.params && n.params.pmax) || Math.floor(src.length / 3) });
        values[id] = dn;
        meta[id] = { best: sc.best, theta: pdmTheta(dn, sc.best), curve: sc.curve };
      } else if (n.blockType === "trend") {
        values[id] = rollingSlope(ins[0] || data.price, (n.params && n.params.len) || 40);
      } else if (n.blockType === "rsi") {
        values[id] = rsiSeries(ins[0] || data.price, (n.params && n.params.period) || 14);
      } else if (n.blockType === "fib") {
        values[id] = fibPos(ins[0] || data.price, (n.params && n.params.len) || 120);
      } else if (n.blockType === "elliott") {
        const src = ins[0] || data.price;
        const sens = (n.params && n.params.swing != null) ? n.params.swing / 100 : 0.03;
        const ea = elliottAnalyze(src, sens);
        values[id] = ea.values;
        meta[id] = { waves: ea.waves, current: ea.current };
      } else if (n.blockType === "volume") {
        values[id] = [];
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

  function rollingSlope(arr, len) {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const a = Math.max(0, i - len + 1), win = arr.slice(a, i + 1);
      const { b } = linfit(win);
      out.push(Math.max(-1.5, Math.min(1.5, tanh(b * 6))));
    }
    return out;
  }

  function rsiSeries(arr, period) {
    const out = [], n = arr.length; let avgG = 0, avgL = 0;
    for (let i = 0; i < n; i++) {
      if (i === 0) { out.push(0); continue; }
      const ch = arr[i] - arr[i - 1], g = Math.max(0, ch), l = Math.max(0, -ch);
      if (i <= period) { avgG += g / period; avgL += l / period; }
      else { avgG = (avgG * (period - 1) + g) / period; avgL = (avgL * (period - 1) + l) / period; }
      const rs = avgL === 0 ? 100 : avgG / avgL, rsi = 100 - 100 / (1 + rs);
      out.push((rsi - 50) / 50);
    }
    return out;
  }

  function fibPos(arr, len) {
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const a = Math.max(0, i - len + 1), win = arr.slice(a, i + 1);
      const lo = Math.min(...win), hi = Math.max(...win), rng = (hi - lo) || 1;
      out.push(((arr[i] - lo) / rng) * 2 - 1);
    }
    return out;
  }

  function detectSwings(arr, sens) {
    const n = arr.length; if (n < 2) return [];
    const rng = (Math.max(...arr) - Math.min(...arr)) || 1;
    const thr = rng * (sens || 0.03);
    const piv = [{ idx: 0, price: arr[0] }];
    let trend = 0, extIdx = 0, extVal = arr[0];
    for (let i = 1; i < n; i++) {
      const v = arr[i];
      if (trend >= 0) {
        if (v > extVal) { extVal = v; extIdx = i; }
        else if (extVal - v >= thr) { if (piv[piv.length - 1].idx !== extIdx) piv.push({ idx: extIdx, price: extVal }); trend = -1; extVal = v; extIdx = i; }
      } else if (trend < 0) {
        if (v < extVal) { extVal = v; extIdx = i; }
        else if (v - extVal >= thr) { if (piv[piv.length - 1].idx !== extIdx) piv.push({ idx: extIdx, price: extVal }); trend = 1; extVal = v; extIdx = i; }
      }
    }
    if (extIdx !== piv[piv.length - 1].idx) piv.push({ idx: extIdx, price: extVal });
    return piv;
  }

  function elliottAnalyze(arr, sens) {
    const n = arr.length;
    const sw = detectSwings(arr, sens);
    const values = new Array(n).fill(0);
    if (sw.length < 2) return { values, waves: [], current: { label: "-", dir: 0 } };
    const labels = ["1", "2", "3", "4", "5", "A", "B", "C"];
    const legs = [];
    for (let i = 1; i < sw.length; i++) legs.push({ from: sw[i - 1], to: sw[i], up: sw[i].price >= sw[i - 1].price });
    const recent = legs.slice(-8);
    recent.forEach((lg, i) => { lg.label = labels[i] || ""; });
    recent.forEach(lg => { const val = lg.up ? 0.7 : -0.7; for (let t = lg.from.idx; t <= lg.to.idx && t < n; t++) values[t] = val; });
    const last = recent[recent.length - 1];
    return {
      values,
      waves: recent.map(lg => ({ idx: lg.to.idx, price: lg.to.price, label: lg.label })),
      current: { label: last.label || "-", dir: last.up ? 1 : -1 }
    };
  }

  function aggregateConviction(graph) {
    let s = 0, w = 0;
    (graph.nodes || []).forEach(n => {
      const v = n && n.conviction;
      if (typeof v === "number" && isFinite(v) && v !== 0) {
        const wi = (n.weight != null && isFinite(n.weight)) ? n.weight : 50;
        s += v * wi;
        w += wi;
      }
    });
    return w ? s / w : 0;
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
    const vbias = (opts && typeof opts.visionBias === "number" && isFinite(opts.visionBias)) ? opts.visionBias : 0;
    const bias = aggregateConviction(graph) + vbias, K = 0.5;
    const sigB = bias ? signal.map(v => Math.max(-100, Math.min(100, Math.round(v + bias * K)))) : signal;
    const lastSig = sigB.slice(-10).reduce((s, v) => s + v, 0) / 10;
    /* 예측 모델: 로그공간 평균회귀(OU형) + 감쇠 모멘텀 + 신호 드리프트, √시간 밴드.
       log P(k) = log(last) + 평균회귀(편차 보정) + 감쇠 모멘텀 + 신호 드리프트
       - 평균회귀: 현재가가 평활 베이스라인(EMA)에서 벗어난 만큼 시간에 따라 되돌림(추세 폭주 방지)
       - 모멘텀: 최근 로그수익률, 시간에 따라 감쇠(영원히 지속 안 함)
       - 신호: 확신·중요도·visionBias 종합(lastSig) 방향 */
    const price = data.price, n = price.length, last = price[n - 1];
    const logP = price.map(p => Math.log(Math.max(1e-9, p)));
    const W = Math.min(n - 1, Math.max(12, Math.round(n * 0.3)));
    const lr = [];
    for (let i = Math.max(1, n - W); i < n; i++) { const r = logP[i] - logP[i - 1]; if (isFinite(r)) lr.push(r); }
    const muMom = lr.length ? lr.reduce((s, v) => s + v, 0) / lr.length : 0;
    let vsum = 0; for (const r of lr) vsum += (r - muMom) * (r - muMom);
    let sigma = lr.length > 1 ? Math.sqrt(vsum / (lr.length - 1)) : 0.05;
    sigma = Math.max(sigma, 0.008);
    // 평활 베이스라인(EMA of log price, span ~2·horizon) → 평균회귀 목표
    const span = Math.max(8, Math.min(n, 2 * futW)), alpha = 2 / (span + 1);
    let ema = logP[0]; for (let i = 1; i < n; i++) ema += alpha * (logP[i] - ema);
    const dev = logP[n - 1] - ema;                  // 현재가의 베이스라인 대비 로그편차
    const theta = 0.045;                            // 평균회귀 속도(반감기 ~15봉)
    const tauM = Math.max(3, futW * 0.4);           // 모멘텀 감쇠 시정수
    const sigDriftTotal = (lastSig / 100) * 0.20;   // 신호 방향 누적 드리프트(만점 ±20%)
    const sigBand = Math.min(sigma, 0.085);
    const path = [], lo = [], hi = [];
    for (let k = 1; k <= futW; k++) {
      const rev = -dev * (1 - Math.exp(-theta * k));                                       // 평균회귀
      const mom = Math.max(-0.12, Math.min(0.12, muMom * tauM * (1 - Math.exp(-k / tauM)))); // 감쇠 모멘텀
      const sig = sigDriftTotal * (k / futW);                                              // 신호 드리프트
      const m = rev + mom + sig, sd = sigBand * Math.sqrt(k) * 0.85;
      path.push(last * Math.exp(m));
      lo.push(last * Math.exp(m - sd));
      hi.push(last * Math.exp(m + sd));
    }
    const regime = lastSig > 12 ? "bull" : lastSig < -12 ? "bear" : "neutral";
    const target = path[path.length - 1];                  // 예측 horizon 끝값
    const invIdx = Math.min(2, futW - 1);                  // 근단기 반대 밴드 = 무효화 기준
    const invalidation = regime === "bear" ? hi[invIdx] : lo[invIdx];
    return {
      values, meta, prediction: { path, lo, hi, futW, anchor: price[n - 1] }, signal: sigB,
      verdict: { regime, score: Math.round(lastSig), target, invalidation }
    };
  }

  function runSteps(graph, data, opts) {
    const { order } = buildDAG(graph);
    const allNodes = graph.nodes || [], allEdges = graph.edges || [];
    if (!order.length) {
      const r = run(graph, data, opts);
      return [{ nodeId: null, signal: r.signal, prediction: r.prediction, verdict: r.verdict }];
    }
    const steps = [];
    for (let k = 1; k <= order.length; k++) {
      const ids = new Set(order.slice(0, k));
      const nodes = allNodes.filter(n => (n.kind === "block" && ids.has(n.id)) || n.kind !== "block");
      const nidset = new Set(nodes.map(n => n.id));
      const edges = allEdges.filter(e => nidset.has(e.from) && nidset.has(e.to));
      const r = run({ nodes, edges }, data, opts);
      steps.push({ nodeId: order[k - 1], signal: r.signal, prediction: r.prediction, verdict: r.verdict });
    }
    return steps;
  }

  function visionBiasFrom(b) {
    if (!b || typeof b !== "object") return 0;
    const SCALE = 60;
    const s = (typeof b.strength === "number" && isFinite(b.strength)) ? Math.max(0, Math.min(1, b.strength)) : 0;
    const dir = b.dir === "bull" ? 1 : b.dir === "bear" ? -1 : 0;
    return dir * s * SCALE;
  }

  function sampleSeries() {
    const n = 480, out = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let v = 30000 + 38000 * t;                         // 상승추세 30k→68k
      v += 5000 * Math.sin(t * Math.PI * 2.2);           // 큰 주기
      v += 1800 * Math.sin(t * Math.PI * 5.5 + 0.8);     // 작은 주기
      if (t > 0.50 && t < 0.68) v -= 8000 * Math.sin((t - 0.50) / 0.18 * Math.PI); // 중간 조정 딥
      // 마지막 상승 강화 (t > 0.72)
      if (t > 0.72) v += 4000 * Math.sin((t - 0.72) / 0.28 * Math.PI * 0.5);
      out.push(Math.round(v));
    }
    return out;
  }

  function sampleGraph() {
    const T = (imgId, label) => ({ imgId, label });
    const nodes = [
      { id: "s_price", kind: "block", blockType: "price",     params: {},                 x: 40,  y: 120, title: "가격",        conviction: 0,   weight: 50, thumb: T("smp_main", "BTC/USD"), desc: "BTC/USD 일봉 — 상승추세 속 단기 조정 구간" },
      { id: "s_ma",    kind: "block", blockType: "ma",        params: { len: 20 },        x: 320, y: 0,   title: "이동평균(20)", conviction: 40,  weight: 55, thumb: T("smp_ma", "MA20"),     desc: "가격이 MA20 상회 — 추세 지지 유효" },
      { id: "s_wave",  kind: "block", blockType: "phasefold", params: { pmin: 16, pmax: 128 }, x: 320, y: 100, title: "파동 스캔",  conviction: 0,   weight: 60, thumb: T("smp_wave", "주기"),   desc: "지배 주기 검출 — 다음 저점 구간 추정" },
      { id: "s_rsi",   kind: "block", blockType: "rsi",       params: { period: 14 },     x: 320, y: 200, title: "RSI(14)",     conviction: -20, weight: 50, thumb: T("smp_rsi", "RSI"),     desc: "최근 상승 가속 — 단기 과열 주의" },
      { id: "s_fib",   kind: "block", blockType: "fib",       params: { len: 120 },       x: 320, y: 300, title: "피보나치",    conviction: 30,  weight: 50, thumb: T("smp_fib", "Fib"),     desc: "조정 구간 저점 반등 — 단기 범위 하단 지지" },
      { id: "s_trend", kind: "block", blockType: "trend",     params: { len: 40 },        x: 320, y: 400, title: "추세선",      conviction: 35,  weight: 70, thumb: T("smp_trend", "Trend"), desc: "상승 회귀선 — 우상향 추세 유지" },
      { id: "s_ell",   kind: "block", blockType: "elliott",   params: { swing: 3 },       x: 320, y: 500, title: "엘리어트",    conviction: 25,  weight: 55, thumb: T("smp_elliott", "Wave"),desc: "파동 구간 분석 — 추세 전환점 추정" },
      { id: "s_comb",  kind: "block", blockType: "combine",   params: {},                 x: 600, y: 250, title: "가중결합",    conviction: 0,   weight: 50, desc: "소스별 weight 가중 결합" },
      { id: "s_pred",  kind: "block", blockType: "predict",   params: {},                 x: 860, y: 250, title: "예측·시그널", conviction: 0,   weight: 50, thumb: T("smp_predict", "예측"), desc: "" },
      { id: "s_memo",  kind: "free",  blockType: null,        params: {},                 x: 40,  y: 320, title: "포지 메모",   conviction: 0,   weight: 50, desc: "종합: 상승 우세. RSI 과열로 단기 조정 가능하나 추세선·피보 지지로 추가 상승 시나리오 우위." }
    ];
    const E = (from, to) => ({ from, fromSide: "right", to, toSide: "left" });
    const edges = [
      E("s_price", "s_ma"), E("s_price", "s_wave"), E("s_price", "s_rsi"),
      E("s_price", "s_fib"), E("s_price", "s_trend"), E("s_price", "s_ell"),
      E("s_ma", "s_comb"), E("s_wave", "s_comb"), E("s_rsi", "s_comb"),
      E("s_fib", "s_comb"), E("s_trend", "s_comb"), E("s_ell", "s_comb"),
      E("s_comb", "s_pred")
    ];
    const series = sampleSeries();
    const vision = {
      series,
      bias: { dir: "bull", strength: 0.55 },
      note: "베이크된 BTC/USD 샘플 — 상승추세 속 조정 후 반등",
      waves: [{ from: 0, to: 160, label: "1파" }, { from: 160, to: 326, label: "조정" }, { from: 326, to: 479, label: "상승" }]
    };
    return { nodes, edges, vision, themeImgId: "smp_main" };
  }

  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run, runSteps, visionBiasFrom, sampleSeries, sampleGraph };
});
