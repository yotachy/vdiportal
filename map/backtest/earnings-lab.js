// backtest/earnings-lab.js — 실적 근접성(earnings proximity) 축 검증. 외부 데이터(실적일·가격 아님)가
// 갭/급변/변동성 확대 예측을 price+변동성 대비 유의하게 개선하는가? 통과분만 통합. 과장 금지.
// 데이터: earn-ohlc.json (yfinance) = { sym: {candles:[{t,o,h,l,c,v}], earnings:[YYYY-MM-DD...]} } US주식.
// 규율: 가격+변동성(베이스A) vs +실적근접 증분을 OOS 종목별 60/40 + 종목외(LOSO)로 측정. 공선성·방향판별.
"use strict";
const fs = require("fs"), path = require("path");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "earn-ohlc.json"), "utf8"));
const H = 20, WARM = 260, STRIDE = 3, TRAIN_FRAC = 0.6;

// ── 변동성 구조 10피처(gap-lab volFeats 동형 = 베이스A) ──
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function volFeats(price, hi, lo, t) {
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

// ── 실적 근접 피처(E) — 순수 캘린더(가격 아님) ──
function earnIndices(dates, edates) {
  const idxs = [];
  for (const e of edates) { let lo = 0, hi = dates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < e) lo = m + 1; else hi = m; } if (lo < dates.length) idxs.push(lo); }
  return [...new Set(idxs)].sort((a, b) => a - b);
}
function toNextArr(N, ei) { const out = new Array(N).fill(9999); let p = 0; for (let i = 0; i < N; i++) { while (p < ei.length && ei[p] < i) p++; if (p < ei.length) out[i] = ei[p] - i; } return out; }
function sinceArr(N, ei) { const out = new Array(N).fill(9999); let p = ei.length - 1; for (let i = N - 1; i >= 0; i--) { while (p >= 0 && ei[p] > i) p--; if (p >= 0) out[i] = i - ei[p]; } return out; }
function earnFeats(toNext, since, t) {
  const tn = toNext[t], sc = since[t];
  return [tn <= 10 ? 1 : 0, tn <= 20 ? 1 : 0, Math.min(tn, 63) / 63, Math.min(sc, 63) / 63, sc <= 5 ? 1 : 0];   // earnIn10·earnIn20·toNextNorm·sinceNorm·postEarn5
}

// ── 로지스틱 ──
function fit(TR, D, EP) { EP = EP || 350;
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  let w = new Array(D).fill(0), b = 0;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { let s = b; for (let j = 0; j < D; j++) s += w[j] * (r.x[j] - mean[j]) / std[j]; const p = 1 / (1 + Math.exp(-s)), e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * (r.x[j] - mean[j]) / std[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= 0.1 * (gw[j] / TR.length + 2e-3 * w[j]); b -= 0.1 * gb / TR.length; }
  return { mean, std, w, b }; }
function acc(M, TE, slc) { const idx = slc || (x => x); let h = 0; for (const r of TE) { let s = M.b; const xx = idx(r.x); for (let j = 0; j < M.w.length; j++) s += M.w[j] * (xx[j] - M.mean[j]) / M.std[j]; if ((s >= 0 ? 1 : 0) === r.y) h++; } return h / TE.length; }

// ── 데이터 구축 ──
const syms = Object.keys(data).filter(s => data[s] && data[s].candles && data[s].candles.length > WARM + H + 40);
const DV = 10, DE = 5;
function build(targetFn) {
  const all = [];
  for (const sym of syms) {
    const cds = data[sym].candles, price = cds.map(c => c.c), hi = cds.map(c => c.h), lo = cds.map(c => c.l), op = cds.map(c => c.o), dates = cds.map(c => c.t), N = price.length;
    const ei = earnIndices(dates, data[sym].earnings || []);
    if (ei.length < 8) continue;   // 실적일 너무 적으면 제외
    const toNext = toNextArr(N, ei), since = sinceArr(N, ei);
    const gap = new Array(N).fill(0); for (let i = 1; i < N; i++) gap[i] = op[i] / price[i - 1] - 1;
    const local = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) {
      const vf = volFeats(price, hi, lo, t); if (!vf) continue;
      const ef = earnFeats(toNext, since, t);
      const tg = targetFn(price, hi, lo, gap, t);
      if (tg == null) continue;
      local.push({ xv: vf, xe: ef, x: [...vf, ...ef], y: tg.y, up: tg.up, sym });
    }
    const cut = Math.floor(local.length * TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; all.push(r); });
  }
  return all;
}
// 타깃들
function tgGap(price, hi, lo, gap, t) { const gv = (() => { let s = 0, c = 0; for (let i = t - 59; i <= t; i++) if (i >= 1) { s += gap[i] * gap[i]; c++; } return c ? Math.sqrt(s / c) : 0; })(); if (!gv) return null; let f = 0; for (let i = t + 1; i <= t + H; i++) if (Math.abs(gap[i]) > 2.2 * gv) { f = 1; break; } return { y: f, up: price[t + H] > price[t] ? 1 : 0 }; }
function tgSpike(price, hi, lo, gap, t) { const sv = rvol(price, t, 20); if (!sv) return null; let f = 0; for (let i = t + 1; i <= t + H; i++) if (Math.abs(price[i] / price[i - 1] - 1) > 2.5 * sv) { f = 1; break; } return { y: f, up: price[t + H] > price[t] ? 1 : 0 }; }
function tgVol(price, hi, lo, gap, t) { const cur = rvol(price, t, H), fwd = rvol(price, t + H, H); if (!cur || !isFinite(fwd)) return null; return { y: fwd > cur ? 1 : 0, up: price[t + H] > price[t] ? 1 : 0 }; }

const P = x => (x * 100).toFixed(1) + "%";
function evalTarget(name, tgFn) {
  const all = build(tgFn); if (!all.length) { console.log("── " + name + ": 표본없음"); return; }
  const TR = all.filter(r => r._tr), TE = all.filter(r => !r._tr);
  const pos = TE.filter(r => r.y).length / TE.length, base = Math.max(pos, 1 - pos);
  // 종목내 OOS
  const mV = fit(TR.map(r => ({ x: r.xv, y: r.y })), DV), aV = acc(mV, TE, x => x);
  const mE = fit(TR.map(r => ({ x: r.xe, y: r.y })), DE), aE = acc(mE, TE, x => x);
  const mF = fit(TR.map(r => ({ x: r.x, y: r.y })), DV + DE), aF = acc(mF, TE, x => x);
  // 종목외 LOSO (서브샘플 근사)
  let xF = 0, xV = 0, xn = 0;
  const symset = [...new Set(all.map(r => r.sym))];
  for (const s of symset) {
    const tr = all.filter((r, i) => r.sym !== s && i % 2 === 0), te = all.filter(r => r.sym === s && !r._tr);
    if (te.length < 20 || tr.length < 200) continue;
    const f = fit(tr.map(r => ({ x: r.x, y: r.y })), DV + DE, 120), v = fit(tr.map(r => ({ x: r.xv, y: r.y })), DV, 120);
    xF += acc(f, te, x => x); xV += acc(v, te, x => x); xn++;
  }
  const xsF = xn ? xF / xn : NaN, xsV = xn ? xV / xn : NaN;
  // 방향 판별: 실적피처 모델의 상위 예측군 상승률
  const pr = TE.map(r => { let s = mF.b; for (let j = 0; j < mF.w.length; j++) s += mF.w[j] * (r.x[j] - mF.mean[j]) / mF.std[j]; return { s, up: r.up }; }).sort((a, b) => b.s - a.s);
  const top = pr.slice(0, Math.floor(pr.length / 3)), upRate = top.reduce((a, r) => a + r.up, 0) / top.length;
  console.log("── " + name + " (n_te=" + TE.length + " 양성률 " + P(pos) + ") ──");
  console.log("  다수결 " + P(base) + " · 변동성만(A) " + P(aV) + " · 실적만(E) " + P(aE) + " · 합침(A+E) " + P(aF));
  console.log("  종목내 증분(합침−변동성만): " + ((aF - aV >= 0 ? "+" : "") + ((aF - aV) * 100).toFixed(1)) + "%p");
  console.log("  종목외 LOSO: 합침 " + P(xsF) + " · 변동성만 " + P(xsV) + " → 증분 " + ((xsF - xsV >= 0 ? "+" : "") + ((xsF - xsV) * 100).toFixed(1)) + "%p");
  console.log("  방향판별: 상위3분위 상승률 " + P(upRate) + " (≈50%면 비방향 OK)");
  const passIn = (aF - aV) >= 0.01, passXs = (xsF - xsV) >= 0.01;
  console.log("  관문: 종목내 +1%p " + (passIn ? "PASS" : "FAIL") + " · 종목외 +1%p " + (passXs ? "PASS" : "FAIL") + " → " + (passIn && passXs ? "★채택 후보" : "기각"));
}

console.log("=== 실적 근접성 축 검증 (US주식 " + syms.length + "종 · 외부 데이터=실적일) ===");
console.log("베이스A=변동성구조 10피처 vs +실적근접 5피처. 종목외에서도 순증분 ≥+1%p여야 진짜.\n");
evalTarget("갭 (2.2σ·20봉)", tgGap);
console.log("");
evalTarget("급변 (2.5σ·20봉)", tgSpike);
console.log("");
evalTarget("변동성 확대 (20봉)", tgVol);
