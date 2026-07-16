// backtest/earn-multiscale-lab.js — 실적 촉촉/확장 근접 버킷 증분 검증
// 가설: 현 5피처(D≤10·D≤20·램프·D≤5·경과)에 촘촘 버킷(D≤3·D≤5·D≤40)을 더하면 갭/급변/변동성 예보 증분?
// 격리: forge-core 미변경. earnings-lab 헬퍼 재사용. 관문=종목내 AND 종목외 각 +1%p.
"use strict";
const E = require("./earnings-lab.js");

// 촘촘/확장 버킷: 현 earnFeats 5 + [tn<=3, tn<=5, tn<=40] = 8
function earnFeatsMS(toNext, since, t) {
  const tn = toNext[t];
  return E.earnFeats(toNext, since, t).concat([tn <= 3 ? 1 : 0, tn <= 5 ? 1 : 0, tn <= 40 ? 1 : 0]);
}

function build(targetFn) {
  const all = [];
  for (const sym of E.syms) {
    const cds = E.data[sym].candles, price = cds.map(c => c.c), hi = cds.map(c => c.h), lo = cds.map(c => c.l), op = cds.map(c => c.o), dates = cds.map(c => c.t), N = price.length;
    const ei = E.earnIndices(dates, E.data[sym].earnings || []);
    if (ei.length < 8) continue;
    const toNext = E.toNextArr(N, ei), since = E.sinceArr(N, ei);
    const gap = new Array(N).fill(0); for (let i = 1; i < N; i++) gap[i] = op[i] / price[i - 1] - 1;
    const local = [];
    for (let t = E.WARM; t <= N - E.H - 1; t += E.STRIDE) {
      const vf = E.volFeats(price, hi, lo, t); if (!vf) continue;
      const e5 = E.earnFeats(toNext, since, t), eMS = earnFeatsMS(toNext, since, t);
      const tg = targetFn(price, hi, lo, gap, t); if (tg == null) continue;
      local.push({ xF5: [...vf, ...e5], xFMS: [...vf, ...eMS], y: tg.y, sym });
    }
    const cut = Math.floor(local.length * E.TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; all.push(r); });
  }
  return all;
}

const P = x => (x * 100).toFixed(1) + "%";
function evalTarget(name, tgFn) {
  const all = build(tgFn); if (!all.length) { console.log("── " + name + ": 표본없음"); return null; }
  const TR = all.filter(r => r._tr), TE = all.filter(r => !r._tr);
  // 종목내 OOS: 현5(15차) vs 촘촘8(18차)
  const m5 = E.fit(TR.map(r => ({ x: r.xF5, y: r.y })), 15);
  const a5b = accOn(m5, TE, r => r.xF5), aMSb = accOn(E.fit(TR.map(r => ({ x: r.xFMS, y: r.y })), 18), TE, r => r.xFMS);
  const dIn = aMSb - a5b;
  // 종목외 LOSO(서브샘플 근사)
  let x5 = 0, xMS = 0, xn = 0;
  const symset = [...new Set(all.map(r => r.sym))];
  for (const s of symset) {
    const tr = all.filter((r, i) => r.sym !== s && i % 2 === 0), te = all.filter(r => r.sym === s && !r._tr);
    if (te.length < 20 || tr.length < 200) continue;
    const f5 = E.fit(tr.map(r => ({ x: r.xF5, y: r.y })), 15, 120), fMS = E.fit(tr.map(r => ({ x: r.xFMS, y: r.y })), 18, 120);
    x5 += accOn(f5, te, r => r.xF5); xMS += accOn(fMS, te, r => r.xFMS); xn++;
  }
  const xs5 = xn ? x5 / xn : NaN, xsMS = xn ? xMS / xn : NaN, dXs = xsMS - xs5;
  console.log("── " + name + " (n_te=" + TE.length + ") ──");
  console.log("  종목내: 현5 " + P(a5b) + " · 촘촘8 " + P(aMSb) + " → 증분 " + (dIn >= 0 ? "+" : "") + (dIn * 100).toFixed(1) + "%p");
  console.log("  종목외LOSO: 현5 " + P(xs5) + " · 촘촘8 " + P(xsMS) + " → 증분 " + (dXs >= 0 ? "+" : "") + (dXs * 100).toFixed(1) + "%p");
  const pass = dIn >= 0.01 && dXs >= 0.01;
  console.log("  관문(종목내 AND 종목외 +1%p): " + (pass ? "★PASS" : "기각"));
  return { name, dIn, dXs, pass };
}
// earnings-lab acc는 M.w.length로 순회하되 r.x를 slc로 뽑음 — 여기선 xF5/xFMS 직접 지정 위해 로컬 acc
function accOn(M, TE, pick) { let h = 0; for (const r of TE) { const xx = pick(r); let s = M.b; for (let j = 0; j < M.w.length; j++) s += M.w[j] * (xx[j] - M.mean[j]) / M.std[j]; if ((s >= 0 ? 1 : 0) === r.y) h++; } return h / TE.length; }

if (require.main === module) {
  const t0 = Date.now();
  console.log("=== 실적 촉촉-버킷 증분 검증 (현 5피처 vs +D≤3·5·40) ===");
  console.log("base=vol10+earn5(현 검증모델) vs aug=vol10+earn8. 종목내 AND 종목외 +1%p여야 채택.\n");
  const rs = [E.tgGap, E.tgSpike, E.tgVol].map((fn, i) => evalTarget(["갭", "급변", "변동성확대"][i], fn));
  const any = rs.filter(Boolean).some(r => r.pass);
  console.log("\n=== 종합 판정: " + (any ? "PASS(촘촘버킷 증분 유의 — 승격 검토)" : "REJECT(촘촘버킷 증분 무의미 — 현 램프 인코딩과 중복)") + " ===");
  console.log("(소요 " + ((Date.now() - t0) / 1000).toFixed(1) + "s)");
}
