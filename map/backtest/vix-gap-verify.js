// backtest/vix-gap-verify.js — GAP 증분 적대적 검증: VIX가 deployed base(vol+earn) 위에도 증분? 전후반 안정?
"use strict";
const fs = require("fs"), path = require("path");
const E = require("./earnings-lab.js");
const { buildVixArrays, vixIndexForDate, vixFeats } = require("./vix-feats.js");
const V = buildVixArrays(JSON.parse(fs.readFileSync(path.join(__dirname, "vix-series.json"), "utf8")));

function build() {
  const all = [];
  for (const sym of E.syms) {
    const cds = E.data[sym].candles, price = cds.map(c => c.c), hi = cds.map(c => c.h), lo = cds.map(c => c.l), op = cds.map(c => c.o), dates = cds.map(c => c.t), N = price.length;
    const ei = E.earnIndices(dates, E.data[sym].earnings || []);
    const toNext = E.toNextArr(N, ei), since = E.sinceArr(N, ei);
    const vidx = dates.map(d => vixIndexForDate(V.dates, d));
    const gap = new Array(N).fill(0); for (let i = 1; i < N; i++) gap[i] = op[i] / price[i - 1] - 1;
    const local = [];
    for (let t = E.WARM; t <= N - E.H - 1; t += E.STRIDE) {
      const vf = E.volFeats(price, hi, lo, t); if (!vf) continue;
      const ef = E.earnFeats(toNext, since, t), vx = vixFeats(V.dates, V.vix, V.vix3m, vidx[t]);
      const tg = E.tgGap(price, hi, lo, gap, t); if (tg == null) continue;
      local.push({ vol: vf, ve: [...vf, ...ef], vv: [...vf, ...vx], vev: [...vf, ...ef, ...vx], y: tg.y });
    }
    const cut = Math.floor(local.length * E.TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; all.push(r); });
  }
  return all;
}
function accOn(M, TE, pick) { let h = 0; for (const r of TE) { const x = pick(r); let s = M.b; for (let j = 0; j < M.w.length; j++) s += M.w[j] * (x[j] - M.mean[j]) / M.std[j]; if ((s >= 0 ? 1 : 0) === r.y) h++; } return h / TE.length; }
function fa(TR, TE, D, pick) { return accOn(E.fit(TR.map(r => ({ x: pick(r), y: r.y })), D), TE, pick); }
const P = x => (x * 100).toFixed(1) + "%";

const all = build(); const TR = all.filter(r => r._tr), TE = all.filter(r => !r._tr);
console.log("=== GAP 증분 적대적 검증 (n_te=" + TE.length + ") ===");
const aVol = fa(TR, TE, 10, r => r.vol), aVE = fa(TR, TE, 15, r => r.ve), aVV = fa(TR, TE, 14, r => r.vv), aVEV = fa(TR, TE, 19, r => r.vev);
console.log("vol(10)        " + P(aVol));
console.log("vol+earn(15)   " + P(aVE) + "   (earn 증분 " + ((aVE - aVol) * 100).toFixed(1) + "pp)");
console.log("vol+vix(14)    " + P(aVV) + "   (vix 증분 over vol " + ((aVV - aVol) * 100).toFixed(1) + "pp)");
console.log("vol+earn+vix   " + P(aVEV) + "   (vix 증분 over vol+earn " + ((aVEV - aVE) * 100).toFixed(1) + "pp)  ← 승격 핵심");
// 전후반(TE 시간 분할)
const half = Math.floor(TE.length / 2), A = TE.slice(0, half), B = TE.slice(half);
const dA = fa(TR, A, 19, r => r.vev) - fa(TR, A, 15, r => r.ve);
const dB = fa(TR, B, 19, r => r.vev) - fa(TR, B, 15, r => r.ve);
console.log("\n전/후반 vix 증분(over vol+earn): 전 " + (dA * 100).toFixed(1) + "pp / 후 " + (dB * 100).toFixed(1) + "pp");
const key = aVEV - aVE;
console.log("\n판정: vix가 deployed base(vol+earn) 위 증분 " + (key * 100).toFixed(1) + "pp · 전후반 " + (dA > 0 && dB > 0 ? "둘다 양수" : "불안정") + " → " + (key >= 0.01 && dA > 0 && dB > 0 ? "★승격 후보(견고)" : key >= 0.005 ? "약한 증분(경계)" : "vol+earn과 중복(기각)"));
