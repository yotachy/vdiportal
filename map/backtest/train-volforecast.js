// backtest/train-volforecast.js — 변동성 예보 모델 학습·계수 추출(엔진 내장용).
// OOS(60/40) 정확도 재확인 + 전체학습 계수를 forge-core에 박을 형태로 출력.
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, STRIDE = 2, WARM = 220, TRAIN_FRAC = 0.6;
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function feats(price, hi, lo, t) {
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const atr = atrp(hi, lo, price, t, 14);
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  return [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60)];
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
function acc(M, TE) { const z = x => x.map((v, j) => (v - M.mean[j]) / M.std[j]); let h = 0; for (const r of TE) { let s = M.b; const zx = z(r.x); for (let j = 0; j < M.w.length; j++) s += M.w[j] * zx[j]; if ((s >= 0 ? 1 : 0) === r.y) h++; } return h / TE.length; }

const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
const all = [];
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
  if (N < WARM + H + 40) continue;
  const local = [];
  for (let t = WARM; t <= N - H - 1; t += STRIDE) { const x = feats(price, hi, lo, t); if (!x || x.some(v => !isFinite(v))) continue; const cv = rvol(price, t, H), fv = rvol(price, t + H, H); local.push({ x, y: fv > cv ? 1 : 0 }); }
  const cut = Math.floor(local.length * TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; all.push(r); });
}
const D = all[0].x.length;
const oos = fit(all.filter(r => r._tr), D);
console.log("OOS(60/40) 정확도: " + (acc(oos, all.filter(r => !r._tr)) * 100).toFixed(1) + "%  (재확인)");
const full = fit(all, D);
console.log("전체학습 in-sample 정확도: " + (acc(full, all) * 100).toFixed(1) + "%");
const R = a => a.map(x => +x.toFixed(5));
const out = { mean: R(full.mean), std: R(full.std), w: R(full.w), b: +full.b.toFixed(5) };
fs.writeFileSync(path.join(__dirname, "volforecast-model.json"), JSON.stringify(out));
console.log("\n// forge-core 내장용 계수:");
console.log("mean=" + JSON.stringify(out.mean));
console.log("std =" + JSON.stringify(out.std));
console.log("w   =" + JSON.stringify(out.w));
console.log("b   =" + out.b);
