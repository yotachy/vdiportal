// backtest/calib-refit-all.js — v1.7.1 콘 축소(_CONE_CAL) 후 calibrateUpProb 재적합.
// 전체 타임프레임(일·주·월) 픽스처에서 엔진의 RAW 상승확률(calibrateUpProb 우회)로 Platt WLS 적합.
// train(과거)→test(미래) OOS ECE로 검증. 방향 불변(단조맵).
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");
const WARM = 200, LOOKBACK = 600, TRAIN_FRAC = 0.6;
function H(tf) { return /월|month/.test(tf) ? 12 : /주|week/.test(tf) ? 52 : 60; }
function stride(tf) { return /일|day/.test(tf) ? 10 : 3; }
const ncdf = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
// RAW 상승확률(calibrateUpProb 미적용) — metrics._upProb 아날로그
function rawUp(pr) {
  const pathA = pr.path; if (!pathA || !pathA.length) return null;
  const a = (pr.anchor != null && isFinite(pr.anchor)) ? pr.anchor : pathA[0]; let s = 0, w = 0;
  for (let k = 0; k < pathA.length; k++) { const pred = pathA[k], hi = pr.hi && pr.hi[k]; if (!(pred > 0 && hi > 0 && a > 0)) continue; const sd = Math.log(hi / pred) || 1e-6; const wt = 1 / Math.sqrt(k + 1); s += Math.round(ncdf(Math.log(pred / a) / sd) * 100) * wt; w += wt; }
  return w ? s / w : null;
}
const logit = p => Math.log(Math.min(0.999, Math.max(0.001, p)) / (1 - Math.min(0.999, Math.max(0.001, p)))), sig = x => 1 / (1 + Math.exp(-x));
function ece(recs) { const bins = {}; for (const r of recs) { const b = Math.min(9, Math.floor(r.p * 10)); (bins[b] = bins[b] || []).push(r); } let e = 0, n = 0; for (const k in bins) { const g = bins[k]; const mp = g.reduce((a, r) => a + r.p, 0) / g.length, ma = g.reduce((a, r) => a + r.y, 0) / g.length; e += g.length * Math.abs(mp - ma); n += g.length; } return n ? e / n : 0; }

const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && /-1(day|week|month)\.json$/.test(f));
const TR = [], TE = [];
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), tf = fx.tf || "1day";
  const price = fx.candle.map(c => c.c), N = price.length, h = H(tf), st = stride(tf); if (N < WARM + h + 40) continue;
  const g = B.standardGraph(); const recs = [];
  for (let t = WARM; t <= N - h - 1; t += st) {
    const s0 = Math.max(0, t + 1 - LOOKBACK);
    let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: h, timeframe: tf }); } catch (e) { continue; }
    const up = rawUp(r.prediction); if (up == null) continue;
    recs.push({ p: up / 100, y: price[t + h] > price[t] ? 1 : 0 });
  }
  const cut = Math.floor(recs.length * TRAIN_FRAC);
  for (let i = 0; i < recs.length; i++) (i < cut ? TR : TE).push(recs[i]);
  console.error("  " + fx.symbol + " " + tf);
}
// WLS Platt(train)
const bins = {}; for (const r of TR) { const b = Math.min(9, Math.floor(r.p * 10)); (bins[b] = bins[b] || []).push(r); }
let sx = 0, sy = 0, sxx = 0, sxy = 0, sw = 0;
for (const k in bins) { const g = bins[k]; const mp = g.reduce((a, r) => a + r.p, 0) / g.length, ma = g.reduce((a, r) => a + r.y, 0) / g.length; const x = logit(mp), y = logit(ma), w = g.length; sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y; }
const A = (sw * sxy - sx * sy) / (sw * sxx - sx * sx), Bc = (sy - A * sx) / sw;
const cal = p => sig(A * logit(p) + Bc);
// 전체적합(배포용)
const binsF = {}; for (const r of TR.concat(TE)) { const b = Math.min(9, Math.floor(r.p * 10)); (binsF[b] = binsF[b] || []).push(r); }
let fx2 = 0, fy = 0, fxx = 0, fxy = 0, fw = 0;
for (const k in binsF) { const g = binsF[k]; const mp = g.reduce((a, r) => a + r.p, 0) / g.length, ma = g.reduce((a, r) => a + r.y, 0) / g.length; const x = logit(mp), y = logit(ma), w = g.length; fw += w; fx2 += w * x; fy += w * y; fxx += w * x * x; fxy += w * x * y; }
const Af = (fw * fxy - fx2 * fy) / (fw * fxx - fx2 * fx2), Bf = (fy - Af * fx2) / fw;
const P = x => (x * 100).toFixed(2) + "%p";
console.log("\n=== calibrateUpProb 재적합 (전체 TF · v1.7.1 콘) ===");
console.log("train " + TR.length + " · test " + TE.length);
console.log("TEST ECE  raw " + P(ece(TE)) + " → 재적합후 " + P(ece(TE.map(r => ({ p: cal(r.p), y: r.y })))) + "  (OOS)");
console.log("배포용 전체적합: A=" + Af.toFixed(4) + " B=" + Bf.toFixed(4) + "  (train-only A=" + A.toFixed(4) + " B=" + Bc.toFixed(4) + ")");
console.log("교정예시: " + [0.3, 0.5, 0.7].map(p => (p * 100).toFixed(0) + "→" + (sig(Af * logit(p) + Bf) * 100).toFixed(0)).join(" · "));
