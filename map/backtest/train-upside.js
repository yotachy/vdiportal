// backtest/train-upside.js — 이익목표 예보 모델 학습·계수 추출(엔진 내장용, 멀티 지평).
// 타깃: 향후 H봉 내 현재가 대비 ≥문턱 낙폭 발생. 지평스케일 문턱 thr=5%×√(H/20)(H20→5%·H40→7.1%·H60→8.7%).
// ddrisk-horizons 검증: 전 지평 OOS ~67-69%(다수결·지속성 둘 다 초과). 10피처(변동성구조9+vol-regime백분위).
"use strict";
const fs = require("fs"), path = require("path");
const HS = [20, 40, 60], STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6;
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function feats(price, hi, lo, t) {
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const atr = atrp(hi, lo, price, t, 14);
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  const hist = []; for (let k = t - 252; k <= t; k += 3) { if (k - 20 >= 0) { const vv = rvol(price, k, 20); if (vv) hist.push(vv); } }
  let pct = 0.5; if (hist.length > 5) { let c = 0; for (const v of hist) if (v <= v20) c++; pct = c / hist.length; }
  return [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60), pct];
}
function fit(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 2e-3, EP = 400;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return { mean, std, w, b };
}
function acc(M, TE) { const z = x => x.map((v, j) => (v - M.mean[j]) / M.std[j]); let h = 0, bh = 0, pos = 0; for (const r of TE) { let s = M.b; const zx = z(r.x); for (let j = 0; j < M.w.length; j++) s += M.w[j] * zx[j]; if ((s >= 0 ? 1 : 0) === r.y) h++; if (r._p === r.y) bh++; if (r.y) pos++; } return { acc: h / TE.length, pers: bh / TE.length, base: Math.max(pos / TE.length, 1 - pos / TE.length), posRate: pos / TE.length }; }

const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
const MAXH = Math.max.apply(null, HS);
const byH = {}; for (const H of HS) byH[H] = [];
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
  if (N < WARM + MAXH + 40) continue;
  const local = {}; for (const H of HS) local[H] = [];
  for (let t = WARM; t <= N - MAXH - 1; t += STRIDE) {
    const x = feats(price, hi, lo, t); if (!x || x.some(v => !isFinite(v))) continue;
    for (const H of HS) {
      const thr = 0.05 * Math.sqrt(H / 20);
      let hi1 = -Infinity; for (let i = t + 1; i <= t + H; i++) { const rr = price[i] / price[t] - 1; if (rr > hi1) hi1 = rr; }
      let phiHi = -Infinity; for (let i = t - H + 1; i <= t; i++) { const rr = price[i] / price[t - H] - 1; if (rr > phiHi) phiHi = rr; }
      local[H].push({ x, y: hi1 >= thr ? 1 : 0, _p: phiHi >= thr ? 1 : 0 });
    }
  }
  for (const H of HS) { const cut = Math.floor(local[H].length * TRAIN_FRAC); local[H].forEach((r, i) => { r._tr = i < cut; byH[H].push(r); }); }
}
const R = a => a.map(x => +x.toFixed(5));
const out = { horizons: {} };
for (const H of HS) {
  const rows = byH[H], D = rows[0].x.length;
  const oosM = fit(rows.filter(r => r._tr), D), o = acc(oosM, rows.filter(r => !r._tr));
  const full = fit(rows, D);
  const thrPct = +(5 * Math.sqrt(H / 20)).toFixed(1);
  out.horizons[H] = { dd: Math.round(thrPct), thrPct, base: Math.round(o.posRate * 100), mean: R(full.mean), std: R(full.std), w: R(full.w), b: +full.b.toFixed(5) };
  console.log("H" + H + " (문턱 " + thrPct + "%): OOS " + (o.acc * 100).toFixed(1) + "% · 다수결 " + (o.base * 100).toFixed(1) + "% · 지속성 " + (o.pers * 100).toFixed(1) + "% · 양성률 " + (o.posRate * 100).toFixed(1) + "%");
}
fs.writeFileSync(path.join(__dirname, "upside-model.json"), JSON.stringify(out));
console.log("\n// forge-core 내장용(MEAN/STD 공유, W/BB 지평별):");
for (const H of HS) { const m = out.horizons[H]; console.log("H" + H + " dd" + m.dd + "% base" + m.base + " W=" + JSON.stringify(m.w) + " BB=" + m.b); }
console.log("MEAN=" + JSON.stringify(out.horizons[20].mean));
console.log("STD =" + JSON.stringify(out.horizons[20].std));
