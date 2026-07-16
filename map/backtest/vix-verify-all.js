// 전 타깃 적대적 검증: VIX가 deployed base(vol+earn) 위에도 증분? (naive base=vol-only의 착시 제거)
"use strict";
const fs = require("fs"), path = require("path");
const E = require("./earnings-lab.js");
const { buildVixArrays, vixIndexForDate, vixFeats } = require("./vix-feats.js");
const V = buildVixArrays(JSON.parse(fs.readFileSync(path.join(__dirname, "vix-series.json"), "utf8")));

function build(tgFn) {
  const all = [];
  for (const sym of E.syms) {
    const cds = E.data[sym].candles, price = cds.map(c => c.c), hi = cds.map(c => c.h), lo = cds.map(c => c.l), op = cds.map(c => c.o), dates = cds.map(c => c.t), N = price.length;
    const ei = E.earnIndices(dates, E.data[sym].earnings || []);
    const toNext = E.toNextArr(N, ei), since = E.sinceArr(N, ei), vidx = dates.map(d => vixIndexForDate(V.dates, d));
    const gap = new Array(N).fill(0); for (let i = 1; i < N; i++) gap[i] = op[i] / price[i - 1] - 1;
    const local = [];
    for (let t = E.WARM; t <= N - E.H - 1; t += E.STRIDE) {
      const vf = E.volFeats(price, hi, lo, t); if (!vf) continue;
      const ef = E.earnFeats(toNext, since, t), vx = vixFeats(V.dates, V.vix, V.vix3m, vidx[t]);
      const tg = tgFn(price, hi, lo, gap, t); if (tg == null) continue;
      local.push({ ve: [...vf, ...ef], vev: [...vf, ...ef, ...vx], y: tg.y });
    }
    const cut = Math.floor(local.length * E.TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; all.push(r); });
  }
  return all;
}
function accOn(M, TE, pick) { let h = 0; for (const r of TE) { const x = pick(r); let s = M.b; for (let j = 0; j < M.w.length; j++) s += M.w[j] * (x[j] - M.mean[j]) / M.std[j]; if ((s >= 0 ? 1 : 0) === r.y) h++; } return h / TE.length; }
function fa(TR, TE, D, pick) { return accOn(E.fit(TR.map(r => ({ x: pick(r), y: r.y })), D), TE, pick); }

console.log("=== VIX 증분 over deployed base(vol+earn) — 전 타깃 ===");
for (const [nm, fn] of [["갭", E.tgGap], ["급변", E.tgSpike], ["변동성확대", E.tgVol]]) {
  const all = build(fn), TR = all.filter(r => r._tr), TE = all.filter(r => !r._tr);
  const ve = fa(TR, TE, 15, r => r.ve), vev = fa(TR, TE, 19, r => r.vev), d = vev - ve;
  const half = Math.floor(TE.length / 2), A = TE.slice(0, half), B = TE.slice(half);
  const dA = fa(TR, A, 19, r => r.vev) - fa(TR, A, 15, r => r.ve), dB = fa(TR, B, 19, r => r.vev) - fa(TR, B, 15, r => r.ve);
  console.log(nm.padEnd(6) + " vol+earn " + (ve * 100).toFixed(1) + "% → +vix " + (vev * 100).toFixed(1) + "%  증분 " + (d >= 0 ? "+" : "") + (d * 100).toFixed(1) + "pp · 전후반 " + (dA * 100).toFixed(1) + "/" + (dB * 100).toFixed(1) + "pp → " + (d >= 0.01 && dA > 0 && dB > 0 ? "★유의" : "중복/기각"));
}
