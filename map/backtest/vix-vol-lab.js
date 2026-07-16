// backtest/vix-vol-lab.js — VIX 기간구조 → 변동성 예보 증분 검증
// base=vol10(realized) vs aug=vol10+vix4(implied 기간구조). 갭/급변/변동성. 종목내60/40+종목외LOSO. 관문 +1%p.
"use strict";
const fs = require("fs"), path = require("path");
const E = require("./earnings-lab.js");
const { buildVixArrays, vixIndexForDate, vixFeats } = require("./vix-feats.js");
const V = buildVixArrays(JSON.parse(fs.readFileSync(path.join(__dirname, "vix-series.json"), "utf8")));
const DV = 10, DX = 4;

function build(targetFn) {
  const all = [];
  for (const sym of E.syms) {
    const cds = E.data[sym].candles, price = cds.map(c => c.c), hi = cds.map(c => c.h), lo = cds.map(c => c.l), op = cds.map(c => c.o), dates = cds.map(c => c.t), N = price.length;
    const vidx = dates.map(d => vixIndexForDate(V.dates, d));
    const gap = new Array(N).fill(0); for (let i = 1; i < N; i++) gap[i] = op[i] / price[i - 1] - 1;
    const local = [];
    for (let t = E.WARM; t <= N - E.H - 1; t += E.STRIDE) {
      const vf = E.volFeats(price, hi, lo, t); if (!vf) continue;
      const vx = vixFeats(V.dates, V.vix, V.vix3m, vidx[t]);
      const tg = targetFn(price, hi, lo, gap, t); if (tg == null) continue;
      local.push({ xv: vf, xF: [...vf, ...vx], y: tg.y, sym });
    }
    const cut = Math.floor(local.length * E.TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; all.push(r); });
  }
  return all;
}
function accOn(M, TE, pick) { let h = 0; for (const r of TE) { const x = pick(r); let s = M.b; for (let j = 0; j < M.w.length; j++) s += M.w[j] * (x[j] - M.mean[j]) / M.std[j]; if ((s >= 0 ? 1 : 0) === r.y) h++; } return h / TE.length; }
function fitAcc(TR, TE, D, pick) { return accOn(E.fit(TR.map(r => ({ x: pick(r), y: r.y })), D), TE, pick); }
function uni(rows, fi) { let h = 0, n = 0; for (const r of rows) { const p = Math.sign(r.xF[10 + fi]); if (!p) continue; n++; if ((p > 0 ? 1 : 0) === r.y) h++; } return n ? h / n : null; }
const P = x => x == null ? "-" : (x * 100).toFixed(1) + "%";

function evalTarget(name, tgFn) {
  const all = build(tgFn); if (!all.length) { console.log("── " + name + ": 표본없음"); return; }
  const TR = all.filter(r => r._tr), TE = all.filter(r => !r._tr);
  const aV = fitAcc(TR, TE, DV, r => r.xv), aF = fitAcc(TR, TE, DV + DX, r => r.xF), dIn = aF - aV;
  // 종목외 LOSO(서브샘플)
  let xV = 0, xF = 0, xn = 0;
  for (const s of [...new Set(all.map(r => r.sym))]) {
    const tr = all.filter((r, i) => r.sym !== s && i % 2 === 0), te = all.filter(r => r.sym === s && !r._tr);
    if (te.length < 20 || tr.length < 200) continue;
    xV += fitAcc(tr, te, DV, r => r.xv); xF += fitAcc(tr, te, DV + DX, r => r.xF); xn++;
  }
  const dXs = xn ? (xF - xV) / xn : NaN;
  console.log("── " + name + " (n_te=" + TE.length + ") ──");
  console.log("  종목내: vol " + P(aV) + " · +vix " + P(aF) + " → 증분 " + (dIn >= 0 ? "+" : "") + (dIn * 100).toFixed(1) + "%p");
  console.log("  종목외LOSO: 증분 " + (dXs >= 0 ? "+" : "") + (dXs * 100).toFixed(1) + "%p");
  console.log("  vix피처 단변량: 레벨 " + P(uni(TE, 0)) + " · 기간구조 " + P(uni(TE, 1)) + " · 5일변화 " + P(uni(TE, 2)) + " · 백분위 " + P(uni(TE, 3)));
  const pass = dIn >= 0.01 && dXs >= 0.01;
  console.log("  관문(종목내 AND 종목외 +1%p): " + (pass ? "★PASS" : "기각"));
  return pass;
}

console.log("=== VIX 기간구조 → 변동성 예보 증분 검증 (US주식 " + E.syms.length + "종) ===");
console.log("base=변동성구조 10피처(realized) vs +VIX 4피처(레벨·기간구조·5일변화·백분위). 종목내 AND 종목외 +1%p여야.\n");
const rs = [["갭", E.tgGap], ["급변", E.tgSpike], ["변동성확대", E.tgVol]].map(([n, f]) => evalTarget(n, f));
console.log("\n=== 종합: " + (rs.some(Boolean) ? "PASS(VIX 기간구조 증분 유의)" : "REJECT(VIX 기간구조 증분 무의미 — realized vol과 공선)") + " ===");
