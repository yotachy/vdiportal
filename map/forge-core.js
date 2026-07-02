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

  function ema(arr, len) {
    const out = [], a = 2 / (len + 1); let prev;
    for (let i = 0; i < arr.length; i++) { const v = arr[i]; prev = (i === 0) ? v : (prev + a * (v - prev)); out.push(prev); }
    return out;
  }

  function analyzeMA(price, opts) {
    opts = opts || {};
    const len = opts.len || 20, useEma = !!opts.ema, srPct = opts.srPct != null ? opts.srPct : 0.015;
    const P = price.length;
    const EMPTY = { mas: { short: null, mid: null, long: null }, cross: { type: null, barsAgo: null }, align: { order: "mixed", score: 0 }, sr: { ma: null, side: null, distPct: null }, bias: 0 };
    if (P < 2) return EMPTY;
    const mk = period => {
      const series = useEma ? ema(price, period) : sma(price, period);
      const last = series[P - 1];
      const w = Math.max(2, Math.min(period, P - 1));
      const seg = series.slice(P - w);
      const f = linfit(seg);   // {a:절편, b:기울기}
      const slope = Math.max(-1, Math.min(1, Math.tanh((f.b / (Math.abs(last) || 1)) * 100)));
      return { period, series, slope, last };
    };
    const short = mk(len), mid = mk(len * 3), long = mk(len * 6), pl = price[P - 1];
    let cross = { type: null, barsAgo: null };
    const lim = Math.min(P - 1, len * 6);
    for (let i = P - 1; i >= Math.max(1, P - 1 - lim); i--) {
      const ds = short.series[i] - long.series[i], dp = short.series[i - 1] - long.series[i - 1];
      if (ds === 0) continue;
      if (dp <= 0 && ds > 0) { cross = { type: "golden", barsAgo: (P - 1) - i }; break; }
      if (dp >= 0 && ds < 0) { cross = { type: "dead", barsAgo: (P - 1) - i }; break; }
    }
    const pairs = [pl > short.last, short.last > mid.last, mid.last > long.last];
    const upCnt = pairs.filter(Boolean).length;
    const bull = pl > short.last && short.last > mid.last && mid.last > long.last;
    const bear = pl < short.last && short.last < mid.last && mid.last < long.last;
    let order = "mixed", score = 0;
    if (bull) { order = "bull"; score = upCnt / 3; }
    else if (bear) { order = "bear"; score = (3 - upCnt) / 3; }
    const cand = [["short", short.last], ["mid", mid.last], ["long", long.last]];
    let near = null, nd = Infinity;
    for (const [name, val] of cand) { const d = Math.abs(pl - val) / (Math.abs(pl) || 1); if (d < nd) { nd = d; near = name; } }
    let sr = { ma: null, side: null, distPct: null };
    if (near && nd <= srPct) { const val = near === "short" ? short.last : near === "mid" ? mid.last : long.last; sr = { ma: near, side: pl >= val ? "support" : "resistance", distPct: nd }; }
    const alignDir = order === "bull" ? 1 : order === "bear" ? -1 : 0;
    let crossDir = cross.type === "golden" ? 1 : cross.type === "dead" ? -1 : 0;
    if (crossDir !== 0 && cross.barsAgo != null) crossDir *= Math.max(0, 1 - cross.barsAgo / (len * 6));
    const bias = Math.max(-1, Math.min(1, 0.5 * alignDir * score + 0.3 * crossDir + 0.2 * long.slope));
    return { mas: { short, mid, long }, cross, align: { order, score }, sr, bias };
  }

  function maSteps(ma, len) {
    const a = ma.align.order, aTxt = a === "bull" ? "정배열" : a === "bear" ? "역배열" : "혼조";
    const cTxt = ma.cross.type ? (ma.cross.type === "golden" ? "골든크로스 " : "데드크로스 ") + ma.cross.barsAgo + "봉 전" : "교차 신호 없음";
    const sl = ma.mas.long ? ma.mas.long.slope : 0, slopeTxt = sl > 0.1 ? "상승" : sl < -0.1 ? "하락" : "횡보";
    const srTxt = ma.sr.ma ? " · " + (ma.sr.side === "support" ? "지지" : "저항") + " 근접" : "";
    const bTxt = ma.bias > 0.1 ? "상승" : ma.bias < -0.1 ? "하락" : "중립";
    return [
      "단·중·장 MA 산출 (" + len + "/" + (len * 3) + "/" + (len * 6) + ")",
      aTxt + " (정렬도 " + Math.round(ma.align.score * 100) + "%)",
      cTxt,
      "장기 기울기 " + slopeTxt + srTxt,
      "종합 방향 " + bTxt + " (bias " + ma.bias.toFixed(2) + ")"
    ];
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
    nbins = nbins || 12;
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

  /* 실수열 DFT 진폭 스펙트럼(k=1..n/2). n≤~600이라 단순 DFT로 충분(분석당 1회). */
  function dftSpectrum(z) {
    const n = z.length, half = Math.floor(n / 2), mag = new Array(half + 1).fill(0);
    for (let k = 1; k <= half; k++) {
      let re = 0, im = 0; const w = -2 * Math.PI * k / n;
      for (let i = 0; i < n; i++) { const a = w * i; re += z[i] * Math.cos(a); im += z[i] * Math.sin(a); }
      mag[k] = Math.sqrt(re * re + im * im);
    }
    return mag;
  }
  /* chart.html 수준 주기 스캔: FFT 지배 주파수로 앵커 + PDM 정밀화.
     장주기 편향 차단(최소 2.5주기 보장: pmax ≤ n/2.5). FFT 피크가 뚜렷하면 그 근방 PDM 최소를,
     아니면 전역 PDM 최소를 채택. */
  function scanPeriod(z, opts) {
    const o = opts || {}, n = z.length, step = o.step || 0.5;
    const pmin = Math.max(4, o.pmin || 8);
    const hardMax = Math.floor(n / 2.5);                       // 장주기 편향 차단(≥2.5주기)
    const pmax = Math.max(pmin + 2, Math.min(o.pmax || hardMax, hardMax));
    // 전역 PDM 곡선 + 최소
    const curve = []; let best = pmin, bt = Infinity;
    for (let P = pmin; P <= pmax; P += step) { const t = pdmTheta(z, P); curve.push({ P, theta: t }); if (!isNaN(t) && t < bt) { bt = t; best = P; } }
    // FFT 지배 주파수 → 주기 후보
    const mag = dftSpectrum(z);
    const kmin = Math.max(1, Math.ceil(n / pmax)), kmax = Math.min(mag.length - 1, Math.floor(n / pmin));
    let kbest = kmin, mbest = -1, msum = 0, mc = 0;
    for (let k = 1; k < mag.length; k++) { msum += mag[k]; mc++; }
    for (let k = kmin; k <= kmax; k++) { if (mag[k] > mbest) { mbest = mag[k]; kbest = k; } }
    const pFFT = kbest > 0 ? n / kbest : best;
    const strength = (msum / (mc || 1)) > 0 ? mbest / (msum / mc) : 0;   // 피크/평균 (뚜렷할수록 큼)
    // FFT 앵커 ±15% 근방 PDM 정밀화
    let refined = pFFT, rt = Infinity;
    for (let P = pFFT * 0.85; P <= pFFT * 1.15; P += 0.25) { if (P < pmin || P > pmax) continue; const t = pdmTheta(z, P); if (!isNaN(t) && t < rt) { rt = t; refined = P; } }
    // 채택: FFT 피크가 뚜렷하면(평균의 1.8배+) FFT 정밀화 결과, 아니면 전역 PDM 최소
    const useFFT = strength >= 1.8 && isFinite(refined);
    return { best: useFFT ? refined : best, curve, pFFT, kbest, strength, pdmBest: best, method: useFFT ? "FFT+PDM" : "PDM" };
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
        const w = (n.params && n.params.weights) || {}, keys = inputsOf[id].filter(k => byId[k] && byId[k].blockType !== "volume" && byId[k].blockType !== "ticker");
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
        meta[id] = { best: sc.best, theta: pdmTheta(dn, sc.best), curve: sc.curve, pFFT: sc.pFFT, kbest: sc.kbest, strength: sc.strength, method: sc.method };
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
        meta[id] = { waves: ea.waves, current: ea.current, primary: ea.primary };
      } else if (n.blockType === "volume") {
        values[id] = (Array.isArray(n.series) && n.series.length) ? n.series.slice() : [];   // 거래량 시계열 통과
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

  function analyzeRSI(price, opts) {
    opts = opts || {};
    const period = opts.period || 14, swing = opts.swing != null ? opts.swing : 0.03;
    const P = price.length;
    const EMPTY = { series: [], last: 50, zone: "neutral", trend: 0, cross50: "above", divergence: { type: null, pricePts: null }, bias: 0 };
    if (P < 2) return EMPTY;
    const series = new Array(P); let avgG = 0, avgL = 0;
    for (let i = 0; i < P; i++) {
      if (i === 0) { series[i] = 50; continue; }
      const ch = price[i] - price[i - 1], g = Math.max(0, ch), l = Math.max(0, -ch);
      if (i <= period) { avgG += g / period; avgL += l / period; }
      else { avgG = (avgG * (period - 1) + g) / period; avgL = (avgL * (period - 1) + l) / period; }
      const rs = avgL === 0 ? 100 : avgG / avgL;
      series[i] = 100 - 100 / (1 + rs);
    }
    const last = series[P - 1];
    const zone = last >= 70 ? "overbought" : last <= 30 ? "oversold" : "neutral";
    const w = Math.max(2, Math.min(period, P - 1)), seg = series.slice(P - w), f = linfit(seg);
    const trend = Math.max(-1, Math.min(1, Math.tanh(f.b * 0.5)));
    const prev = series[P - 2];
    let cross50 = last >= 50 ? "above" : "below";
    if (prev < 50 && last >= 50) cross50 = "cross_up";
    else if (prev >= 50 && last < 50) cross50 = "cross_down";
    const sw = detectSwings(price, swing), pts = sw.map(p => ({ idx: p.idx, price: p.price }));
    const lows = [], highs = [];
    for (let i = 0; i < pts.length; i++) {
      const pr = pts[i - 1], nx = pts[i + 1], pv = pts[i].price;
      const isHigh = (pr && nx) ? (pv >= pr.price && pv >= nx.price) : (nx ? pv >= nx.price : (pr ? pv >= pr.price : true));
      (isHigh ? highs : lows).push(pts[i]);
    }
    const rsiAt = idx => series[Math.max(0, Math.min(P - 1, idx))];
    let divergence = { type: null, pricePts: null };
    if (lows.length >= 2) { const a = lows[lows.length - 2], b = lows[lows.length - 1]; if (b.price < a.price && rsiAt(b.idx) > rsiAt(a.idx)) divergence = { type: "bullish", pricePts: [a, b] }; }
    if (!divergence.type && highs.length >= 2) { const a = highs[highs.length - 2], b = highs[highs.length - 1]; if (b.price > a.price && rsiAt(b.idx) < rsiAt(a.idx)) divergence = { type: "bearish", pricePts: [a, b] }; }
    const divDir = divergence.type === "bullish" ? 1 : divergence.type === "bearish" ? -1 : 0;
    // 국면(Cardwell RSI range rule): 최근 RSI 평균으로 강세/약세 국면 판정 → 추세장에선 과열/과매도를 추세 역행 신호로 쓰지 않음
    const rWin = series.slice(Math.max(0, P - period * 2)), rAvg = rWin.reduce((a, b) => a + b, 0) / (rWin.length || 1);
    const regime = rAvg >= 55 ? 1 : rAvg <= 45 ? -1 : 0;   // 강세 / 약세 / 중립 국면
    // 과매도=반등(강세·중립 강함, 약세 약함) / 과열=조정(약세·중립 강함, 강세 경미 — 추세 지속 존중)
    const zoneDir = zone === "oversold" ? (regime < 0 ? 0.2 : 0.5)
      : zone === "overbought" ? (regime > 0 ? -0.15 : -0.5) : 0;
    const crossDir = cross50 === "cross_up" ? 0.3 : cross50 === "cross_down" ? -0.3 : 0;
    const bias = Math.max(-1, Math.min(1, 0.5 * divDir + zoneDir + 0.3 * crossDir));
    return { series, last, zone, trend, cross50, regime, divergence, bias };
  }

  function rsiSteps(rsi) {
    const zTxt = rsi.zone === "overbought" ? "과열" : rsi.zone === "oversold" ? "과매도" : "중립";
    const c50 = (rsi.cross50 === "above" || rsi.cross50 === "cross_up") ? "50선 위" : "50선 아래";
    const tTxt = rsi.trend > 0.1 ? "상승" : rsi.trend < -0.1 ? "하락" : "횡보";
    const dv = rsi.divergence.type === "bullish" ? "강세 다이버전스" : rsi.divergence.type === "bearish" ? "약세 다이버전스" : "다이버전스 없음";
    const bTxt = rsi.bias > 0.1 ? "상승" : rsi.bias < -0.1 ? "하락" : "중립";
    const gTxt = rsi.regime > 0 ? " \xb7 강세 국면" : rsi.regime < 0 ? " \xb7 약세 국면" : "";
    return [
      "RSI " + Math.round(rsi.last) + " \xb7 " + zTxt + gTxt,
      c50 + " \xb7 추세 " + tTxt,
      dv,
      "RSI 오실레이터 갱신",
      "종합 방향 " + bTxt + " (bias " + rsi.bias.toFixed(2) + ")"
    ];
  }

  function synthVolume(price) {
    const n = price.length;
    if (n < 2) return [];
    const BASE = 1000000, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const ret = i > 0 ? (price[i] - price[i - 1]) / (Math.abs(price[i - 1]) || 1) : 0;
      const cyc = 0.6 * Math.abs(Math.sin(i * 0.5));
      out[i] = Math.round(BASE * (1 + 3.2 * Math.abs(ret) + cyc));
    }
    return out;
  }

  function analyzeVolume(price, volume, opts) {
    opts = opts || {};
    const len = opts.len || 12, spikeMult = opts.spikeMult != null ? opts.spikeMult : 1.5;
    const P = price.length;
    const EMPTY = { series: [], obv: [], trend: 0, ratio: 1, state: "normal", obvTrend: 0, relationship: "weakening", divergence: { type: null, pricePts: null }, bias: 0 };
    const vol = (Array.isArray(volume) && volume.length >= 2) ? volume : synthVolume(price);
    const L = Math.min(P, vol.length);
    if (L < 2) return EMPTY;
    const offset = P - L;
    const priceA = price.slice(P - L), series = vol.slice(vol.length - L);
    const obv = new Array(L); obv[0] = 0;
    for (let i = 1; i < L; i++) obv[i] = obv[i - 1] + (priceA[i] > priceA[i - 1] ? series[i] : priceA[i] < priceA[i - 1] ? -series[i] : 0);
    const w = Math.max(2, Math.min(len, L - 1));
    const fV = linfit(series.slice(L - w));
    let meanV = 0; for (const v of series) meanV += v; meanV = (meanV / L) || 1;
    const trend = Math.max(-1, Math.min(1, Math.tanh((fV.b / (Math.abs(meanV) || 1)) * 100)));
    const rN = Math.min(3, L), bN = Math.min(len, L);
    let rs = 0; for (let i = L - rN; i < L; i++) rs += series[i]; const recent = rs / rN;
    let bs = 0; for (let i = L - bN; i < L; i++) bs += series[i]; const base = bs / bN;
    const ratio = base > 0 ? recent / base : 1;
    const state = ratio >= spikeMult ? "spike" : ratio <= 1 / spikeMult ? "contract" : "normal";
    const fO = linfit(obv.slice(L - w));
    let maxAbsO = 1; for (const v of obv) maxAbsO = Math.max(maxAbsO, Math.abs(v));
    const obvTrend = Math.max(-1, Math.min(1, Math.tanh((fO.b / maxAbsO) * 100)));
    const pw = Math.min(6, L - 1);
    const priceUp = priceA[L - 1] > priceA[L - 1 - pw], volUp = recent > base;
    const relationship = priceUp ? (volUp ? "confirm" : "weakening") : (volUp ? "selling" : "capitulation");
    const sw = detectSwings(priceA, 0.03), pts = sw.map(p => ({ idx: p.idx, price: p.price }));
    const lows = [], highs = [];
    for (let i = 0; i < pts.length; i++) {
      const pr = pts[i - 1], nx = pts[i + 1], pv = pts[i].price;
      const isHigh = (pr && nx) ? (pv >= pr.price && pv >= nx.price) : (nx ? pv >= nx.price : (pr ? pv >= pr.price : true));
      (isHigh ? highs : lows).push(pts[i]);
    }
    const obvAt = idx => obv[Math.max(0, Math.min(L - 1, idx))];
    const abs = p => ({ idx: p.idx + offset, price: p.price });
    let divergence = { type: null, pricePts: null };
    if (lows.length >= 2) { const a = lows[lows.length - 2], b = lows[lows.length - 1]; if (b.price < a.price && obvAt(b.idx) > obvAt(a.idx)) divergence = { type: "bullish", pricePts: [abs(a), abs(b)] }; }
    if (!divergence.type && highs.length >= 2) { const a = highs[highs.length - 2], b = highs[highs.length - 1]; if (b.price > a.price && obvAt(b.idx) < obvAt(a.idx)) divergence = { type: "bearish", pricePts: [abs(a), abs(b)] }; }
    const divDir = divergence.type === "bullish" ? 1 : divergence.type === "bearish" ? -1 : 0;
    const confDir = relationship === "confirm" ? 1 : relationship === "weakening" ? -0.4 : relationship === "selling" ? -0.7 : 0.3;
    const bias = Math.max(-1, Math.min(1, 0.45 * divDir + 0.35 * confDir + 0.20 * obvTrend));
    return { series, obv, trend, ratio, state, obvTrend, relationship, divergence, bias };
  }

  function volumeSteps(va) {
    const tTxt = va.trend > 0.1 ? "증가 ↑" : va.trend < -0.1 ? "감소 ↓" : "횡보 →";
    const sTxt = va.state === "spike" ? "급증" : va.state === "contract" ? "위축" : "평이";
    const rel = va.relationship === "confirm" ? "상승에 거래량 동반 — 추세 건강(확인)"
      : va.relationship === "weakening" ? "상승하나 거래량 감소 — 추진력 약화"
      : va.relationship === "selling" ? "하락에 거래량 증가 — 매도 압력"
      : "하락+거래량 위축 — 투매 진정(바닥 가능)";
    const dv = va.divergence.type === "bullish" ? "강세 거래량 다이버전스"
      : va.divergence.type === "bearish" ? "약세 거래량 다이버전스"
      : "OBV " + (va.obvTrend > 0.1 ? "상승" : va.obvTrend < -0.1 ? "하락" : "횡보");
    const bTxt = va.bias > 0.1 ? "상승" : va.bias < -0.1 ? "하락" : "중립";
    return [
      "거래량 추세 " + tTxt,
      "최근/평균 " + va.ratio.toFixed(2) + "x \xb7 " + sTxt,
      "가격-거래량: " + rel,
      dv,
      "종합 방향 " + bTxt + " (bias " + va.bias.toFixed(2) + ")"
    ];
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

  function detectSwings(arr, sens, opts) {
    const n = arr.length; if (n < 2) return [];
    // opts.log: 임계를 로그가격 범위로(지수성장 자산서 시대별 스윙 감지 편향 제거·척도불변). 기본=선형(하위호환).
    const useLog = !!(opts && opts.log);
    const val = useLog ? arr.map(x => Math.log(Math.max(1e-9, x))) : arr;
    const rng = (Math.max(...val) - Math.min(...val)) || 1;
    const thr = rng * (sens || 0.03);
    const piv = [{ idx: 0, price: arr[0] }];   // price는 항상 원가격
    let trend = 0, extIdx = 0, extVal = val[0];
    for (let i = 1; i < n; i++) {
      const v = val[i];
      if (trend >= 0) {
        if (v > extVal) { extVal = v; extIdx = i; }
        else if (extVal - v >= thr) { if (piv[piv.length - 1].idx !== extIdx) piv.push({ idx: extIdx, price: arr[extIdx] }); trend = -1; extVal = v; extIdx = i; }
      } else if (trend < 0) {
        if (v < extVal) { extVal = v; extIdx = i; }
        else if (v - extVal >= thr) { if (piv[piv.length - 1].idx !== extIdx) piv.push({ idx: extIdx, price: arr[extIdx] }); trend = 1; extVal = v; extIdx = i; }
      }
    }
    if (extIdx !== piv[piv.length - 1].idx) piv.push({ idx: extIdx, price: arr[extIdx] });
    return piv;
  }

  // 시계열 [s0..끝] 구간의 지배 스윙(최저↔최고, 방향=나중에 온 극점 기준). null=자료부족
  function _domSwing(price, s0) {
    const seg = price.slice(s0);
    if (seg.length < 2) return null;
    const hiV = Math.max(...seg), loV = Math.min(...seg);
    const hiIdx = s0 + seg.indexOf(hiV), loIdx = s0 + seg.indexOf(loV);
    const dir = hiIdx >= loIdx ? "up" : "down";
    return dir === "up"
      ? { fromIdx: loIdx, fromPrice: loV, toIdx: hiIdx, toPrice: hiV, dir }
      : { fromIdx: hiIdx, fromPrice: hiV, toIdx: loIdx, toPrice: loV, dir };
  }

  // 한 스윙(degree)의 되돌림/확장 레벨·존·bias 계산. sw={fromIdx,toIdx,fromPrice,toPrice,dir}
  function _fibDegree(price, sw, len, srPct) {
    const RETR = [0, .236, .382, .5, .618, .786, 1], EXT = [1.272, 1.414, 1.618, 2.0, 2.618];
    const { fromIdx, toIdx, fromPrice, toPrice, dir } = sw;
    const P = price.length;
    const hi = Math.max(fromPrice, toPrice), lo = Math.min(fromPrice, toPrice), rng = (hi - lo) || 1;
    const priceAt = (r, kind) => kind === "retr"
      ? (dir === "up" ? hi - rng * r : lo + rng * r)
      : (dir === "up" ? hi + rng * (r - 1) : lo - rng * (r - 1));
    // 2차(len 창 hi/lo) 레벨 — 합류 판정
    const s2 = Math.max(0, P - len), seg2 = price.slice(s2);
    const hi2 = Math.max(...seg2), lo2 = Math.min(...seg2), rng2 = (hi2 - lo2) || 1;
    const sec = RETR.map(r => dir === "up" ? hi2 - rng2 * r : lo2 + rng2 * r);
    const levels = [];
    for (const r of RETR) { const p = priceAt(r, "retr"); levels.push({ ratio: r, price: p, kind: "retr", golden: (r >= 0.618 && r <= 0.65), confluent: sec.some(q => Math.abs(p - q) / (Math.abs(p) || 1) <= srPct) }); }
    for (const r of EXT) levels.push({ ratio: r, price: priceAt(r, "ext"), kind: "ext", golden: false, confluent: false });
    const pl = price[P - 1];
    let nearest = null, nd = Infinity;
    for (const L of levels) { const d = Math.abs(pl - L.price) / (Math.abs(pl) || 1); if (d < nd) { nd = d; nearest = { ratio: L.ratio, price: L.price, side: pl >= L.price ? "support" : "resistance" }; } }
    const gpA = priceAt(0.618, "retr"), gpB = priceAt(0.65, "retr");
    const goldenLo = Math.min(gpA, gpB), goldenHi = Math.max(gpA, gpB);
    const inGolden = pl >= goldenLo && pl <= goldenHi;
    let lower = null, upper = null;
    const rs = levels.filter(L => L.kind === "retr").slice().sort((x, y) => x.price - y.price);
    for (let i = 0; i < rs.length - 1; i++) { if (pl >= rs[i].price && pl <= rs[i + 1].price) { lower = rs[i].ratio; upper = rs[i + 1].ratio; break; } }
    const srDir = nearest ? (nearest.side === "support" ? 1 : -1) : 0;
    const proximity = nearest ? Math.max(0, 1 - nd / srPct) : 0;
    const goldenBoost = inGolden ? (dir === "up" ? 0.25 : dir === "down" ? -0.25 : 0) : 0;
    const bias = Math.max(-1, Math.min(1, srDir * proximity + goldenBoost));
    return { dir, swing: { fromIdx, toIdx, fromPrice, toPrice }, levels, zone: { nearest, inGolden, lower, upper, goldenLo, goldenHi }, bias };
  }

  // 단기(최근 피벗 스윙)·중기(len 창 지배 스윙)·장기(전체 지배 스윙) 3 degree 동시 분석.
  // top-level shape(dir/swing/levels/zone/bias)=단기(하위호환·combine 보호: values는 fibPos 별도). degrees=[{name,...}] 추가.
  function analyzeFib(price, opts) {
    opts = opts || {};
    const len = opts.len || 120, swing = opts.swing != null ? opts.swing : 0.05, srPct = opts.srPct != null ? opts.srPct : 0.01;
    const P = price.length;
    const EMPTY = { dir: null, swing: null, levels: [], zone: { nearest: null, inGolden: false, lower: null, upper: null, goldenLo: null, goldenHi: null }, bias: 0, degrees: [] };
    if (P < 2) return EMPTY;
    // 단기: 최근 피벗 스윙(없으면 len 창 폴백)
    const sw = detectSwings(price, swing);
    let shortSw;
    if (sw.length >= 2) { const a = sw[sw.length - 2], b = sw[sw.length - 1]; shortSw = { fromIdx: a.idx, fromPrice: a.price, toIdx: b.idx, toPrice: b.price, dir: b.price >= a.price ? "up" : "down" }; }
    else shortSw = _domSwing(price, Math.max(0, P - len)) || _domSwing(price, 0);
    if (!shortSw) return EMPTY;
    const shortDeg = _fibDegree(price, shortSw, len, srPct); shortDeg.name = "단기";
    const degrees = [shortDeg];
    const dup = (deg, s) => deg.swing.fromIdx === s.fromIdx && deg.swing.toIdx === s.toIdx;
    // 중기: 최근 len(기본 120)봉 지배 스윙
    const midSw = _domSwing(price, Math.max(0, P - len));
    if (midSw && !dup(shortDeg, midSw)) { const m = _fibDegree(price, midSw, len, srPct); m.name = "중기"; degrees.push(m); }
    // 장기: 전체 시계열 지배 스윙
    const longSw = _domSwing(price, 0);
    if (longSw && !degrees.some(d => dup(d, longSw))) { const l = _fibDegree(price, longSw, len, srPct); l.name = "장기"; degrees.push(l); }
    // bias 블렌드(존재 degree만 가중 재정규화: 단.5/중.3/장.2)
    const W = { "단기": 0.5, "중기": 0.3, "장기": 0.2 };
    let bw = 0, bs = 0; for (const d of degrees) { bw += W[d.name]; bs += W[d.name] * d.bias; }
    const bias = bw ? Math.max(-1, Math.min(1, bs / bw)) : shortDeg.bias;
    return { dir: shortDeg.dir, swing: shortDeg.swing, levels: shortDeg.levels, zone: shortDeg.zone, bias: bias, degrees: degrees };
  }

  function fibSteps(fib) {
    const fmt = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
    const d = fib.dir === "up" ? "상승" : fib.dir === "down" ? "하락" : "중립";
    const ext = fib.levels.find(L => L.kind === "ext" && Math.abs(L.ratio - 1.618) < 1e-9);
    const conf = fib.levels.filter(L => L.confluent).length;
    const near = fib.zone.nearest;
    const zTxt = near ? (near.side === "support" ? "지지" : "저항") + " 근접(" + near.ratio + ")" : "구간 중앙";
    const bTxt = fib.bias > 0.1 ? "상승" : fib.bias < -0.1 ? "하락" : "중립";
    const multi = fib.degrees && fib.degrees.length > 1 ? " · " + fib.degrees.map(g => g.name.charAt(0)).join("·") + " " + fib.degrees.length + "단계 작도" : "";
    return [
      (fib.swing ? d + " 스윙 식별 (" + fmt(fib.swing.fromPrice) + "→" + fmt(fib.swing.toPrice) + ")" : "스윙 식별 폴백") + multi,
      "되돌림 레벨 7개" + (conf ? " · 합류 " + conf + "곳" : ""),
      ext ? "확장 목표 1.618 = " + fmt(ext.price) : "확장 레벨",
      (fib.zone.inGolden ? "골든포켓 진입 · " : "") + zTxt,
      "종합 방향 " + bTxt + " (bias " + fib.bias.toFixed(2) + ")"
    ];
  }

  function analyzeTrend(price, opts) {
    opts = opts || {};
    const shortLen = opts.shortLen || 40;
    const pivotSwing = opts.pivotSwing != null ? opts.pivotSwing : 0.08;
    const channelK = opts.channelK != null ? opts.channelK : 2;
    const weights = opts.weights || { long: 0.5, mid: 0.3, short: 0.2 };
    const P = price.length;
    const EMPTY = {
      windows: { long: null, mid: null, short: null },
      pivots: { support: null, resistance: null, points: [] },
      channel: null, blend: { slopeLog: 0, channelSigmaLog: 0 }, dominant: null
    };
    if (P < 2) return EMPTY;
    const logP = price.map(p => Math.log(Math.max(1e-9, p)));

    function winFit(m) {
      if (m < 2 || m > P) return null;
      const start = P - m, seg = price.slice(start), lseg = logP.slice(start);
      const fr = linfit(seg), fl = linfit(lseg);   // {a:절편, b:기울기}
      let mean = 0, meanL = 0; for (let i = 0; i < m; i++) { mean += seg[i]; meanL += lseg[i]; } mean /= m; meanL /= m;
      let ssT = 0, ssR = 0, ssTL = 0, ssRL = 0;
      for (let i = 0; i < m; i++) {
        const pr = fr.a + fr.b * i, d = seg[i] - mean, e = seg[i] - pr; ssT += d * d; ssR += e * e;
        const prl = fl.a + fl.b * i, dl = lseg[i] - meanL, el = lseg[i] - prl; ssTL += dl * dl; ssRL += el * el;
      }
      const r2 = ssT > 0 ? Math.max(0, 1 - ssR / ssT) : 0;
      // 로그공간 R²: 지수성장 자산(예: BTC)에서 장기 로그추세의 신뢰도를 올바로 반영(블렌드 가중은 slopeLog를 쓰므로 로그 적합도로 가중)
      const r2Log = ssTL > 0 ? Math.max(0, 1 - ssRL / ssTL) : 0;
      return { startIdx: start, m, slopeRaw: fr.b, bRaw: fr.a, slopeLog: fl.b, bLog: fl.a, r2, r2Log };
    }

    let long = winFit(P), mid = winFit(Math.round(P * 0.5)), short = winFit(Math.min(P, shortLen));
    if (mid && long && mid.m >= long.m) mid = null;
    if (short && mid && short.m >= mid.m) short = null;
    else if (short && !mid && long && short.m >= long.m) short = null;
    if (P < 15) { mid = null; short = null; }

    // 피봇 분류(지그재그는 교대 → 이웃 비교로 high/low). 로그 임계로 시대별 편향 제거(척도불변).
    const sw = detectSwings(price, pivotSwing, { log: true }), points = [];
    for (let i = 0; i < sw.length; i++) {
      const pv = sw[i].price, pr = sw[i - 1], nx = sw[i + 1];
      let type;
      if (pr && nx) type = (pv >= pr.price && pv >= nx.price) ? "high" : "low";
      else if (nx) type = pv >= nx.price ? "high" : "low";
      else if (pr) type = pv >= pr.price ? "high" : "low";
      else type = "high";
      points.push({ idx: sw[i].idx, price: pv, type });
    }
    function fitPivots(pts) {
      if (pts.length < 2) return null;
      // 리센시 가중 최소제곱: 최근 피봇에 더 큰 가중(오래된 극단이 선을 과하게 끌지 않게)
      const i0 = pts[0].idx, iN = pts[pts.length - 1].idx, span = (iN - i0) || 1;
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const p of pts) { const wt = 0.4 + 0.6 * ((p.idx - i0) / span); sw += wt; sx += wt * p.idx; sy += wt * p.price; sxx += wt * p.idx * p.idx; sxy += wt * p.idx * p.price; }
      const denom = (sw * sxx - sx * sx) || 1, slope = (sw * sxy - sx * sy) / denom, b = (sy - slope * sx) / sw;
      return { slope, b, fromIdx: pts[0].idx, toIdx: pts[pts.length - 1].idx };
    }
    const support = fitPivots(points.filter(p => p.type === "low"));
    const resistance = fitPivots(points.filter(p => p.type === "high"));

    // 채널(장기 원시회귀 잔차 σ) + 채널 로그 σ(예측용)
    let channel = null, channelSigmaLog = 0;
    if (long) {
      let s = 0; const r = [];
      for (let i = 0; i < P; i++) { const e = price[i] - (long.bRaw + long.slopeRaw * i); r.push(e); s += e; }
      const mu = s / P; let v = 0; for (const e of r) v += (e - mu) * (e - mu);
      const dof = Math.max(1, P - 2);   // 회귀 잔차 자유도(P-2) — 모분산(/P)의 과소추정 보정
      channel = { slopeRaw: long.slopeRaw, bRaw: long.bRaw, sigma: Math.sqrt(v / dof), k: channelK };
      let sl = 0; const rl = [];
      for (let i = 0; i < P; i++) { const e = logP[i] - (long.bLog + long.slopeLog * i); rl.push(e); sl += e; }
      const ml = sl / P; let vl = 0; for (const e of rl) vl += (e - ml) * (e - ml);
      channelSigmaLog = Math.sqrt(vl / dof);
    }

    // 블렌드(R²가중·장기우선) + 지배창
    const wins = [["long", long], ["mid", mid], ["short", short]];
    let num = 0, den = 0, dominant = null, best = -1;
    for (const [name, w] of wins) {
      if (!w) continue;
      const rq = (w.r2Log != null ? w.r2Log : w.r2);   // slopeLog 가중은 로그공간 적합도로
      const eff = (weights[name] || 0) * rq; num += eff * w.slopeLog; den += eff;
      const sc = Math.abs(w.slopeLog) * rq; if (sc > best) { best = sc; dominant = name; }
    }
    const slopeLog = den > 0 ? num / den : (long ? long.slopeLog : 0);

    return { windows: { long, mid, short }, pivots: { support, resistance, points }, channel, blend: { slopeLog, channelSigmaLog }, dominant };
  }

  function trendProfileForTF(tf) {
    const s = typeof tf === "string" ? tf : "";
    // shortScale: '단기' 창 길이 배율(월봉은 40봉=3.3년이라 과함→0.5로 축소, 단주기는 확대). "단기"의 실제 기간을 tf 간 정규화.
    if (/월|분기|년|연/.test(s)) return { tier: "long", weights: { long: 0.6, mid: 0.3, short: 0.1 }, trendScale: 1.0, shortScale: 0.5, label: "월봉 장기가중" };
    if (/주|일/.test(s)) return { tier: "mid", weights: { long: 0.45, mid: 0.35, short: 0.2 }, trendScale: 0.8, shortScale: 1.0, label: "일·주봉 균형" };
    if (/분|시간|시/.test(s)) return { tier: "intra", weights: { long: 0.25, mid: 0.35, short: 0.4 }, trendScale: 0.45, shortScale: 2.0, label: "단주기 단기가중" };
    return { tier: "default", weights: { long: 0.5, mid: 0.3, short: 0.2 }, trendScale: 0.8, shortScale: 1.0, label: "" };
  }

  function elliottAnalyze(arr, sens) {
    const n = arr.length;
    const sw = detectSwings(arr, sens);
    const values = new Array(n).fill(0);
    if (sw.length < 2) return { values, waves: [], current: { label: "-", dir: 0 }, structure: "uncertain", primary: null };
    const legs = [];
    for (let i = 1; i < sw.length; i++) legs.push({ from: sw[i - 1], to: sw[i], up: sw[i].price >= sw[i - 1].price });
    const deg = elliottDegree(legs);   // 구조 인지 라벨(임펄스=숫자·조정=문자) 공유
    const recent = legs.slice(-8);
    recent.forEach(lg => { const val = lg.up ? 0.7 : -0.7; for (let t = lg.from.idx; t <= lg.to.idx && t < n; t++) values[t] = val; });
    let primary = null;
    const ps = primarySwings(arr, sens);
    if (ps && ps.swings.length >= 2) {
      const pl = [];
      for (let i = 1; i < ps.swings.length; i++) pl.push({ from: ps.swings[i - 1], to: ps.swings[i], up: ps.swings[i].price >= ps.swings[i - 1].price });
      const pd = elliottDegree(pl);
      primary = { current: pd.current, structure: pd.structure };
    }
    return { values, waves: deg.waves, current: deg.current, structure: deg.structure, primary: primary };
  }

  // 차트 전체를 덮는 대형 degree용 스윙 추출: 큰 다리 6~9개를 목표로 민감도 적응 선택(결정적)
  function primarySwings(price, minorSens) {
    const P = Array.isArray(price) ? price.length : 0;
    if (P < 40) return null;                      // 너무 짧으면 대형 의미 없음
    const LADDER = [0.30, 0.22, 0.16, 0.12, 0.09];
    let pick = null, bestDist = Infinity;
    for (const s of LADDER) {
      if (s <= minorSens) continue;               // 소형보다 굵어야 의미
      const sw = detectSwings(price, s);
      const legs = sw.length - 1;
      const dist = (legs >= 6 && legs <= 9) ? 0 : (legs < 6 ? 6 - legs : legs - 9);
      if (dist < bestDist) { bestDist = dist; pick = { swings: sw, sens: s, legs: legs }; }
      if (dist === 0) break;                       // 6~9 구간의 첫(가장 굵은) 민감도 채택
    }
    if (!pick || pick.legs < 5 || pick.swings.length < 2) return null;  // 5파도 못 그리면 생략
    return { swings: pick.swings, sens: pick.sens };
  }

  // 한 degree의 파동 카운트/규칙/구조/투영/bias 계산 (legs = 인접 스윙 다리 배열)
  function elliottDegree(legs) {
    const EMPTYD = { waves: [], rules: { r1: false, r2: false, r3: false, score: 0 }, structure: "uncertain", current: { label: "-", dir: 0 }, next: null, bias: 0 };
    if (!legs || !legs.length) return EMPTYD;
    const len = lg => Math.abs(lg.to.price - lg.from.price);
    // ── degree별 앵커 카운팅 ──
    // '마지막 8다리 재라벨'식 드리프트 대신, 최근 구간의 방향 극단(상승=최저점 / 하락=최고점)을
    // 현재 임펄스의 기점(wave 1 시작)으로 고정해 1..5 → A,B,C로 카운트. 봉이 늘어도 번호가 밀리지 않음.
    const LOOK = Math.min(legs.length, 13);          // 최근 최대 13다리에서 기점 탐색
    const tail = legs.slice(-LOOK);
    const netUp = tail[tail.length - 1].to.price >= tail[0].from.price;
    let anchorRel = 0, ext = tail[0].from.price;
    for (let i = 0; i < tail.length; i++) {
      const p = tail[i].from.price;
      if (netUp ? (p < ext) : (p > ext)) { ext = p; anchorRel = i; }
    }
    // 앵커부터 현재까지 = 현재 degree 진행 파동(최대 8 = 임펄스 5 + 조정 ABC). 초과 시 최근 8로 재앵커(새 사이클).
    let recent = tail.slice(anchorRel);
    if (recent.length > 8) recent = recent.slice(-8);
    const last = recent[recent.length - 1];
    const imp = recent.slice(0, 5), dirUp = imp.length ? imp[0].up : true, sgn = dirUp ? 1 : -1;
    // 엘리어트 3대 불가침 규칙
    let r1 = false, r2 = false, r3 = false;
    if (imp.length >= 2) { const w1s = imp[0].from.price, w2e = imp[1].to.price; r1 = dirUp ? (w2e >= w1s) : (w2e <= w1s); }   // 2파는 1파 시작을 넘지 않음
    if (imp.length >= 3) { const l1 = len(imp[0]), l3 = len(imp[2]), l5 = imp.length >= 5 ? len(imp[4]) : Infinity; r2 = !(l3 <= l1 && l3 <= l5); }   // 3파가 1·3·5 중 최단 아님
    if (imp.length >= 4) { const w1e = imp[0].to.price, w4e = imp[3].to.price; r3 = dirUp ? (w4e > w1e) : (w4e < w1e); }   // 4파는 1파 영역과 겹치지 않음
    const passed = [r1, r2, r3].filter(Boolean).length;
    const checked = imp.length >= 4 ? 3 : imp.length >= 3 ? 2 : imp.length >= 2 ? 1 : 0;
    const completeness = Math.min(1, imp.length / 5);
    const score = checked ? (passed / checked) * completeness : 0;
    // 교대(alternation): 1·3·5 동일 방향, 2·4 반대 방향
    const allDirOk = imp.length >= 5 && imp[0].up === imp[2].up && imp[0].up === imp[4].up && imp[1].up !== imp[0].up && imp[3].up !== imp[0].up;
    // 임펄스(motive)로 인정하려면 5파 완성 + 3대 규칙 전부 + 교대 충족. 아니면 조정/발달중.
    const impulseValid = imp.length >= 5 && r1 && r2 && r3 && allDirOk;
    // 구조: 앵커(추세 극단)부터 세므로 1~5는 항상 '모티브'(추세 방향). 조정 A,B,C는 5파 이후의 '역추세' 다리(6~8)에만 붙음.
    //  → 상승 모티브에 a,b,c가 찍히던 이론 오류 제거(ABC는 완성 임펄스 뒤 되돌림에만).
    let structure;
    if (impulseValid) structure = (recent.length > 5) ? "corrective" : (dirUp ? "impulse_up" : "impulse_down");
    else structure = "uncertain";                            // 불완전 모티브 = 발달중/복합(숫자 카운트)
    // 라벨: 항상 1,2,3,4,5(모티브) → A,B,C(완성 후 역추세 조정). 문자는 6번째 다리부터만.
    const LAB = ["1", "2", "3", "4", "5", "A", "B", "C"];
    const waves = recent.map((lg, i) => ({ idx: lg.to.idx, price: lg.to.price, label: LAB[i] || "" }));
    const current = { label: (waves[waves.length - 1] && waves[waves.length - 1].label) || "-", dir: last.up ? 1 : -1 };
    const span1 = imp.length ? Math.abs(imp[0].to.price - imp[0].from.price) : 0;
    // 투영: 발달중 임펄스(2끝→3 / 4끝→5) · 완성 임펄스 뒤 조정(A→B→C 순차, 역추세).
    let next = null;
    if (impulseValid) {
      const span15 = Math.abs(imp[4].to.price - imp[0].from.price);
      const clab = ["A", "B", "C"][Math.max(0, Math.min(recent.length - 5, 2))];
      next = { label: clab, target: imp[4].to.price - sgn * 0.5 * span15, dir: -sgn };
    } else if (recent.length === 2 && imp.length >= 2) {
      next = { label: "3", target: imp[1].to.price + sgn * 1.618 * span1, dir: sgn };
    } else if (recent.length === 4 && imp.length >= 4) {
      next = { label: "5", target: imp[3].to.price + sgn * span1, dir: sgn };
    }
    let bias;
    if (structure === "impulse_up") bias = 0.4 + 0.6 * score;
    else if (structure === "impulse_down") bias = -(0.4 + 0.6 * score);
    else if (structure === "corrective") bias = -current.dir * 0.4;   // 조정 종료 후 추세 재개 방향
    else bias = 0;
    bias = Math.max(-1, Math.min(1, bias));
    return { waves, rules: { r1, r2, r3, score }, structure, current, next, bias };
  }

  function analyzeElliott(price, opts) {
    opts = opts || {};
    const swing = opts.swing != null ? opts.swing : 0.03;
    const P = price.length;
    const EMPTY = { waves: [], rules: { r1: false, r2: false, r3: false, score: 0 }, structure: "uncertain", current: { label: "-", dir: 0 }, next: null, bias: 0 };
    if (P < 2) return EMPTY;
    const sw = detectSwings(price, swing);
    if (sw.length < 2) return EMPTY;
    const legs = [];
    for (let i = 1; i < sw.length; i++) legs.push({ from: sw[i - 1], to: sw[i], up: sw[i].price >= sw[i - 1].price });
    const minor = elliottDegree(legs);
    let primary = null, bias = minor.bias;
    if (!opts._minorOnly) {
      const ps = primarySwings(price, swing);
      if (ps && ps.swings.length >= 2) {
        const pl = [];
        for (let i = 1; i < ps.swings.length; i++) pl.push({ from: ps.swings[i - 1], to: ps.swings[i], up: ps.swings[i].price >= ps.swings[i - 1].price });
        primary = elliottDegree(pl);
        bias = Math.max(-1, Math.min(1, minor.bias * 0.35 + primary.bias * 0.65));
      }
    }
    return { waves: minor.waves, rules: minor.rules, structure: minor.structure, current: minor.current, next: minor.next, primary: primary, bias: bias };
  }

  function elliottSteps(ea) {
    const fmt = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
    const stKo = (s, wc, cl) => { const isL = cl && /[A-Z]/.test(cl); return s === "impulse_up" ? "상승 임펄스" : s === "impulse_down" ? "하락 임펄스" : s === "corrective" ? "조정 진행(" + cl + ")" : isL ? "되돌림 진행(" + cl + ")" : ((wc || 0) >= 2 ? "발달중 임펄스" : "불확실"); };
    const ok = [ea.rules.r1, ea.rules.r2, ea.rules.r3].filter(Boolean).length;
    const nx = ea.next ? "다음 " + ea.next.label + "파 목표 " + fmt(ea.next.target) : "투영 없음";
    const bTxt = ea.bias > 0.1 ? "상승" : ea.bias < -0.1 ? "하락" : "중립";
    const lines = [
      ea.waves.length ? "파동 카운트 " + ea.waves.length + "개 (현재 " + ea.current.label + ")" : "스윙 부족",
      "규칙 " + ok + "/3 · 유효 " + ea.rules.score.toFixed(2),
      stKo(ea.structure, ea.waves.length, ea.current.label) + " 분류",
      nx,
      "종합 방향 " + bTxt + " (bias " + ea.bias.toFixed(2) + ")"
    ];
    if (ea.primary) lines.push("대형 " + stKo(ea.primary.structure, ea.primary.waves ? ea.primary.waves.length : 0, ea.primary.current.label) + " · 현재 " + ea.primary.current.label + "(" + (ea.primary.current.dir > 0 ? "↑" : ea.primary.current.dir < 0 ? "↓" : "–") + ")");
    return lines;
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
    const futW = Math.min(((opts && opts.futW) || 24), 60);   // 예측 horizon 상한(과도한 장기 외삽 방지)
    const ev = evalBlocks(graph, data), { values, meta } = ev;
    const outNode = graph.nodes.find(n => n.kind === "block" && (n.blockType === "predict"));
    const inputsOf = buildDAG(graph).inputsOf;
    // 합성 시그널: 출력 입력(없으면 combine/마지막) 시계열을 정규화
    let sigSrc = null;
    if (outNode) {
      const ins = inputsOf[outNode.id] || [];
      // 방향성 없는 거래량/티커는 시그널 베이스에서 제외(원시 거래량 오염 방지)
      const dirIns = ins.filter(id => { const nn = graph.nodes.find(x => x.id === id); return nn && nn.blockType !== "volume" && nn.blockType !== "ticker"; });
      if (dirIns[0]) sigSrc = values[dirIns[0]];
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
    // 평활 베이스라인(최근 구간 EMA of log price) → 평균회귀 목표.
    // span을 '최근'으로 캡(최대 24봉): 장기 추세주(예: 280배 성장)에서 옛 저가로 회귀하는 폭락 예측 방지.
    const span = Math.max(6, Math.min(n - 1, 2 * futW, 24)), alpha = 2 / (span + 1);
    let ema = logP[Math.max(0, n - 1 - span * 3)]; for (let i = Math.max(1, n - 1 - span * 3) + 1; i < n; i++) ema += alpha * (logP[i] - ema);
    const dev = logP[n - 1] - ema;                  // 현재가의 (최근)베이스라인 대비 로그편차
    const theta = 0.045;                            // 평균회귀 속도(반감기 ~15봉)
    const tauM = Math.max(3, futW * 0.4);           // 모멘텀 감쇠 시정수
    const sigDriftTotal = (lastSig / 100) * 0.28;   // 신호 방향 누적 드리프트(만점 ±28%)
    const sigBand = Math.max(0.02, Math.min(sigma, 0.18));   // 밴드 변동성 상한 0.18(고변동주의 실제 변동폭 반영)
    /* 계절성(주기) 성분 — phasefold 노드가 검출한 지배주기를 예측에 직접 반영(chart.html 시즌 형상).
       로그가격 추세 잔차의 위상별 평균 형상을 미래 위상에 투영. 신뢰도(정합 θ↓·FFT 피크↑)로 진폭 스케일. */
    let seasFn = null, seasInfo = null;
    const pfNode = graph.nodes.find(nn => nn.kind === "block" && nn.blockType === "phasefold");
    if (pfNode && meta[pfNode.id] && meta[pfNode.id].best > 2 && n >= 24) {
      const P = meta[pfNode.id].best, th = meta[pfNode.id].theta, str = meta[pfNode.id].strength || 0;
      const rel = Math.max(0, Math.min(1, 1 - (isFinite(th) ? th : 1))) * Math.min(1, str / 3);   // 0..1
      if (rel > 0.05) {
        const NBP = 48;
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let i = 0; i < n; i++) { sx += i; sy += logP[i]; sxx += i * i; sxy += i * logP[i]; }
        const sl = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), ic = (sy - sl * sx) / n;
        const sum = new Array(NBP).fill(0), cnt = new Array(NBP).fill(0);
        for (let i = 0; i < n; i++) { const r = logP[i] - (ic + sl * i); let b = Math.floor(((i % P) / P) * NBP); if (b >= NBP) b = NBP - 1; sum[b] += r; cnt[b]++; }
        const seas = new Array(NBP), filled = [];
        for (let b = 0; b < NBP; b++) { if (cnt[b] > 0) { seas[b] = sum[b] / cnt[b]; filled.push(b); } else seas[b] = NaN; }
        if (filled.length) { for (let b = 0; b < NBP; b++) if (isNaN(seas[b])) { let lo2 = filled[0], hi2 = filled[0], dl = 1e9, dh = 1e9; for (const fb of filled) { const d1 = ((b - fb) + NBP) % NBP; if (d1 < dl) { dl = d1; lo2 = fb; } const d2 = ((fb - b) + NBP) % NBP; if (d2 < dh) { dh = d2; hi2 = fb; } } const t = dl / (dl + dh || 1); seas[b] = seas[lo2] * (1 - t) + seas[hi2] * t; } }
        else seas.fill(0);
        const sm = new Array(NBP); for (let b = 0; b < NBP; b++) sm[b] = (seas[(b - 1 + NBP) % NBP] + 2 * seas[b] + seas[(b + 1) % NBP]) / 4;
        const seasAt = ph => { const fb = ph * NBP - 0.5, b0 = Math.floor(fb), t = fb - b0, i0 = ((b0 % NBP) + NBP) % NBP, i1 = (i0 + 1) % NBP; return sm[i0] * (1 - t) + sm[i1] * t; };
        const s0 = seasAt(((n - 1) % P) / P);
        seasFn = k => (seasAt((((n - 1 + k) % P) / P)) - s0) * rel;   // k=0에서 0(이음매 없음)
        seasInfo = { period: Math.round(P * 10) / 10, rel: Math.round(rel * 100) / 100 };
      }
    }
    // 추세 추종 성분 — 다각도 블렌드(장기우선·R²가중) 로그기울기, 캡 ±3%/봉으로 완화
    const _tn = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "trend");
    const _tp = (_tn && _tn.params) || {};
    const _prof = trendProfileForTF(opts && opts.timeframe);
    const _mn = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "ma");
    const _ma = _mn ? analyzeMA(price, { len: (_mn.params && _mn.params.len) || 20, ema: !!(_mn.params && _mn.params.ema) }) : null;
    const maDrift = _ma ? _ma.bias * _prof.trendScale * 0.10 : 0;   // MA 국면 방향 드리프트(±10% 상한·TF가중)
    const _fn = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "fib");
    const _fib = _fn ? analyzeFib(price, { len: (_fn.params && _fn.params.len) || 120, swing: ((_fn.params && _fn.params.swing) != null ? _fn.params.swing : 5) / 100 }) : null;
    const fibDrift = _fib ? _fib.bias * _prof.trendScale * 0.08 : 0;   // 피보 S/R 방향 드리프트(±8% 상한·TF가중)
    const _en = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "elliott");
    const _ew = _en ? analyzeElliott(price, { swing: ((_en.params && _en.params.swing) != null ? _en.params.swing : 3) / 100 }) : null;
    const ewDrift = _ew ? _ew.bias * _prof.trendScale * 0.08 : 0;   // 엘리어트 추진/조정 방향 드리프트(±8%·TF가중·유효도 반영)
    const _rn = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "rsi");
    const _rsi = _rn ? analyzeRSI(price, { period: (_rn.params && _rn.params.period) || 14 }) : null;
    const rsiDrift = _rsi ? _rsi.bias * _prof.trendScale * 0.06 : 0;   // RSI 다이버전스/구간 방향 드리프트(±6%·TF가중·보수적)
    const _vn = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "volume");
    const _vol = _vn ? ((Array.isArray(values[_vn.id]) && values[_vn.id].length >= 2) ? values[_vn.id] : synthVolume(price)) : null;
    const volDrift = _vol ? analyzeVolume(price, _vol).bias * _prof.trendScale * 0.05 : 0;   // 거래량 확인 방향 드리프트(±5% 상한·TF가중·보수적)
    const _ta = analyzeTrend(price, { shortLen: Math.max(8, Math.round((_tp.len || 40) * (_prof.shortScale || 1))), pivotSwing: (_tp.pivotSwing != null ? _tp.pivotSwing / 100 : 0.08), channelK: _tp.channelK || 2, weights: _prof.weights });
    const trS = Math.max(-0.03, Math.min(0.03, _ta.blend.slopeLog));
    const trChSig = _ta.blend.channelSigmaLog;
    const REV_W = 0.5;                                          // 평균회귀 약화(추세 추종)
    const path = [], lo = [], hi = [];
    for (let k = 1; k <= futW; k++) {
      const rev = -dev * (1 - Math.exp(-theta * k)) * REV_W;                                // 평균회귀(약화)
      const mom = Math.max(-0.20, Math.min(0.20, muMom * tauM * (1 - Math.exp(-k / tauM)))); // 감쇠 모멘텀(상향)
      const trend = trS * _prof.trendScale * k * Math.exp(-k / (futW * 1.6));                  // 추세 투영(타임프레임 배율·완만 감쇠)
      const sig = sigDriftTotal * (k / futW);                                              // 신호 드리프트
      const seas = seasFn ? seasFn(k) : 0;                                                 // 계절성(주기)
      const m = rev + mom + trend + sig + seas + maDrift * (k / futW) + fibDrift * (k / futW) + ewDrift * (k / futW) + rsiDrift * (k / futW) + volDrift * (k / futW), sd = Math.sqrt(sigBand * sigBand + 0.36 * trChSig * trChSig) * Math.sqrt(k) * 0.85;
      path.push(last * Math.exp(m));
      lo.push(last * Math.exp(m - sd));
      hi.push(last * Math.exp(m + sd));
    }
    const regime = lastSig > 12 ? "bull" : lastSig < -12 ? "bear" : "neutral";
    const target = path[path.length - 1];                  // 예측 horizon 끝값
    const invIdx = Math.min(2, futW - 1);                  // 근단기 반대 밴드 = 무효화 기준
    const invalidation = regime === "bear" ? hi[invIdx] : lo[invIdx];
    return {
      values, meta, prediction: { path, lo, hi, futW, anchor: price[n - 1], target, seasonal: seasInfo }, signal: sigB,
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
      { id: "s_ticker", kind: "block", blockType: "ticker", params: { symbol: "BTC-USD", tf: "1day" }, x: 40, y: 30, title: "티커", conviction: 0, weight: 50, desc: "실 종목 데이터 — 불러오기로 실 캔들 적용" },
      { id: "s_price", kind: "block", blockType: "price",     params: {},                 x: 40,  y: 120, title: "가격",        conviction: 0,   weight: 50, thumb: T("smp_main", "BTC/USD"), desc: "BTC/USD 일봉 — 상승추세 속 단기 조정 구간" },
      { id: "s_ma",    kind: "block", blockType: "ma",        params: { len: 20 },        x: 320, y: 0,   title: "이동평균(20)", conviction: 40,  weight: 55, thumb: T("smp_ma", "MA20"),     desc: "가격이 MA20 상회 — 추세 지지 유효" },
      { id: "s_wave",  kind: "block", blockType: "phasefold", params: { pmin: 16, pmax: 128 }, x: 320, y: 100, title: "파동 스캔",  conviction: 0,   weight: 60, thumb: T("smp_wave", "주기"),   desc: "지배 주기 검출 — 다음 저점 구간 추정" },
      { id: "s_rsi",   kind: "block", blockType: "rsi",       params: { period: 14 },     x: 320, y: 200, title: "RSI(14)",     conviction: -20, weight: 50, thumb: T("smp_rsi", "RSI"),     desc: "최근 상승 가속 — 단기 과열 주의" },
      { id: "s_fib",   kind: "block", blockType: "fib",       params: { len: 120 },       x: 320, y: 300, title: "피보나치",    conviction: 30,  weight: 50, thumb: T("smp_fib", "Fib"),     desc: "조정 구간 저점 반등 — 단기 범위 하단 지지" },
      { id: "s_trend", kind: "block", blockType: "trend",     params: { len: 40 },        x: 320, y: 400, title: "추세선",      conviction: 35,  weight: 70, thumb: T("smp_trend", "Trend"), desc: "상승 회귀선 — 우상향 추세 유지" },
      { id: "s_ell",   kind: "block", blockType: "elliott",   params: { swing: 3 },       x: 320, y: 500, title: "엘리어트",    conviction: 25,  weight: 55, thumb: T("smp_elliott", "Wave"),desc: "파동 구간 분석 — 추세 전환점 추정" },
      { id: "s_vol",   kind: "block", blockType: "volume",    params: {},                 x: 320, y: 600, title: "거래량",      conviction: 0,   weight: 55, thumb: T("smp_main", "거래량"), desc: "상승 구간 거래량 동반 — 추세 확인", series: synthVolume(sampleSeries()) },
      { id: "s_comb",  kind: "block", blockType: "combine",   params: {},                 x: 600, y: 250, title: "가중결합",    conviction: 0,   weight: 50, desc: "소스별 weight 가중 결합" },
      { id: "s_pred",  kind: "block", blockType: "predict",   params: {},                 x: 860, y: 250, title: "예측·시그널", conviction: 0,   weight: 50, thumb: T("smp_predict", "예측"), desc: "" },
      { id: "s_memo",  kind: "free",  blockType: null,        params: {},                 x: 40,  y: 320, title: "포지 메모",   conviction: 0,   weight: 50, desc: "종합: 상승 우세. RSI 과열로 단기 조정 가능하나 추세선·피보 지지로 추가 상승 시나리오 우위." }
    ];
    const E = (from, to) => ({ from, fromSide: "right", to, toSide: "left" });
    const edges = [
      E("s_price", "s_ma"), E("s_price", "s_wave"), E("s_price", "s_rsi"),
      E("s_price", "s_fib"), E("s_price", "s_trend"), E("s_price", "s_ell"), E("s_price", "s_vol"),
      E("s_ma", "s_comb"), E("s_wave", "s_comb"), E("s_rsi", "s_comb"),
      E("s_fib", "s_comb"), E("s_trend", "s_comb"), E("s_ell", "s_comb"), E("s_vol", "s_comb"),
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

  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run, runSteps, visionBiasFrom, sampleSeries, sampleGraph, analyzeTrend, trendProfileForTF, analyzeMA, maSteps, analyzeFib, fibSteps, analyzeElliott, elliottSteps, primarySwings, analyzeRSI, rsiSteps, synthVolume, analyzeVolume, volumeSteps };
});
