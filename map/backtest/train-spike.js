// backtest/train-spike.js — 단일봉 급변(shock) 예보 모델 학습·계수 추출(v1.8 엔진 내장용).
// 타깃: 향후 20봉 내 |일수익| > 2.5×현재20봉변동성 발생. tail-lab 검증(OOS 65%·다수결56·지속성45 초과).
// 10피처(=_riskFeatures와 동일: 변동성구조 9 + vol-regime 백분위). OOS 60/40 재확인 + 계수 출력.
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, K = 2.5, STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6;
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
const all = [];
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
  if (N < WARM + H + 40) continue;
  const local = [];
  for (let t = WARM; t <= N - H - 1; t += STRIDE) {
    const x = feats(price, hi, lo, t); if (!x || x.some(v => !isFinite(v))) continue;
    const v20 = rvol(price, t, 20), thr = K * v20;
    let fut = 0; for (let i = t + 1; i <= t + H; i++) { if (Math.abs(price[i] / price[i - 1] - 1) > thr) { fut = 1; break; } }
    let pas = 0; for (let i = t - H + 1; i <= t; i++) { if (i >= 1 && Math.abs(price[i] / price[i - 1] - 1) > thr) { pas = 1; break; } }
    local.push({ x, y: fut, _p: pas });
  }
  const cut = Math.floor(local.length * TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; all.push(r); });
}
const D = all[0].x.length;
const oosM = fit(all.filter(r => r._tr), D), o = acc(oosM, all.filter(r => !r._tr));
console.log("급변(2.5σ·20봉) OOS: 정확도 " + (o.acc * 100).toFixed(1) + "% · 다수결 " + (o.base * 100).toFixed(1) + "% · 지속성 " + (o.pers * 100).toFixed(1) + "% · 양성률 " + (o.posRate * 100).toFixed(1) + "%");
const full = fit(all, D);
const R = a => a.map(x => +x.toFixed(5));
const out = { dd: 0, mean: R(full.mean), std: R(full.std), w: R(full.w), b: +full.b.toFixed(5), base: Math.round(o.posRate * 100), acc: Math.round(o.acc * 100) };
fs.writeFileSync(path.join(__dirname, "spike-model.json"), JSON.stringify(out));
console.log("\n// forge-core 내장용:");
console.log("W  =" + JSON.stringify(out.w));
console.log("BB =" + out.b + "  base=" + out.base + " acc=" + out.acc);
console.log("(MEAN/STD는 _DD_MEAN/_DD_STD 재사용 — 동일 피처·데이터)");
console.log("MEAN=" + JSON.stringify(out.mean));
console.log("STD =" + JSON.stringify(out.std));
