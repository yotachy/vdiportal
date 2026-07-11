// eightk-lab2.js — 비실적 8-K 축 최종 판정: 3축(갭·급변·변동성) × 8-K피처 2변형(전체 vs 고임팩트).
// 각 축의 배포 완전모델(변동성+갭/실적 포함) 위에 8-K 증분 측정. 종목내 OOS + 종목외 LOSO 양쪽 +1%p 관문.
// 어느 조합도 미달이면 비실적 8-K 축 정직 기각(변동성 구조와 공선). 실적축 갭+6.3/급변+3.4/변동성+2.6pp와 대조.
"use strict";
const fs = require("fs"), path = require("path");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "earn-ohlc.json"), "utf8"));
const ev8k = JSON.parse(fs.readFileSync(path.join(__dirname, "8k-events.json"), "utf8"));
const H = 20, WARM = 260, STRIDE = 3, TRAIN_FRAC = 0.6;
const HIGH_IMPACT = ["1.01", "1.03", "2.01", "2.05", "2.06", "3.01", "4.01", "4.02", "5.02"];
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function gk(op, hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const u = Math.log(hi[i] / lo[i]), d = Math.log(cl[i] / op[i]); s += 0.5 * u * u - (2 * Math.log(2) - 1) * d * d; } const v = s / n; return v > 0 ? Math.sqrt(v) : 0; }
function vol10(price, hi, lo, t) { const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120); if (!v20 || !v60 || !v120) return null; const atr = atrp(hi, lo, price, t, 14); const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); } const vm = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vm) ** 2, 0) / vs.length) / (vm || 1); let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5; const hist = []; for (let k = t - 252; k <= t; k += 3) { if (k - 20 >= 0) { const vv = rvol(price, k, 20); if (vv) hist.push(vv); } } let pct = 0.5; if (hist.length > 5) { let c = 0; for (const v of hist) if (v <= v20) c++; pct = c / hist.length; } return [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60), pct]; }
function gapFeats(price, gap, t) { const v20 = rvol(price, t, 20) || 1e-9; let gs = 0, gc = 0; for (let i = t - 59; i <= t; i++) if (i >= 1) { gs += gap[i] * gap[i]; gc++; } const gv = gc ? Math.sqrt(gs / gc) : 0; const lastAbs = Math.abs(gap[t]); let cl = 0; for (let i = t - 19; i <= t; i++) if (i >= 1 && Math.abs(gap[i]) > 1.5 * gv) cl++; let r5 = 0; for (let i = t - 4; i <= t; i++) if (i >= 1) r5 += Math.abs(gap[i]); r5 /= 5; return [gv * 100, lastAbs * 100, cl, r5 * 100, gv / v20]; }
function earnF(tN, sc, t) { const tn = tN[t], s = sc[t]; const vis = tn <= 20 ? tn : 99; return [tn <= 10 ? 1 : 0, tn <= 20 ? 1 : 0, vis === 99 ? 1 : vis / 20, Math.min(s, 20) / 20, s <= 5 ? 1 : 0]; }
function eIdx(dates, ed) { const x = []; for (const e of ed) { let lo = 0, hi = dates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < e) lo = m + 1; else hi = m; } if (lo < dates.length) x.push(lo); } return [...new Set(x)].sort((a, b) => a - b); }
function tNA(N, ei) { const o = new Array(N).fill(9999); let p = 0; for (let i = 0; i < N; i++) { while (p < ei.length && ei[p] < i) p++; if (p < ei.length) o[i] = ei[p] - i; } return o; }
function sA(N, ei) { const o = new Array(N).fill(9999); let p = ei.length - 1; for (let i = N - 1; i >= 0; i--) { while (p >= 0 && ei[p] > i) p--; if (p >= 0) o[i] = i - ei[p]; } return o; }
function cntWin(ei8, t, w) { let c = 0; for (let k = ei8.length - 1; k >= 0; k--) { const d = t - ei8[k]; if (d < 0) continue; if (d <= w) c++; else break; } return c; }
// 8-K 피처 2변형
function feat8kBroad(sAll, ei8, t) { return [Math.min(sAll[t], 60) / 60, cntWin(ei8, t, 20), cntWin(ei8, t, 60), cntWin(ei8, t, 10) >= 2 ? 1 : 0, sAll[t] <= 5 ? 1 : 0]; }
function feat8kHi(sHi, eiHi, t) { return [Math.min(sHi[t], 90) / 90, cntWin(eiHi, t, 20), cntWin(eiHi, t, 60), cntWin(eiHi, t, 10) >= 1 ? 1 : 0, sHi[t] <= 10 ? 1 : 0]; }
function fit(TR, D, EP) { EP = EP || 350; const mean = new Array(D).fill(0), std = new Array(D).fill(0); for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length; for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1; let w = new Array(D).fill(0), b = 0; for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0; for (const r of TR) { let s = b; for (let j = 0; j < D; j++) s += w[j] * (r.x[j] - mean[j]) / std[j]; const p = 1 / (1 + Math.exp(-s)), e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * (r.x[j] - mean[j]) / std[j]; gb += e; } for (let j = 0; j < D; j++) w[j] -= 0.1 * (gw[j] / TR.length + 2e-3 * w[j]); b -= 0.1 * gb / TR.length; } return { mean, std, w, b }; }
function acc(M, TE) { let h = 0; for (const r of TE) { let s = M.b; for (let j = 0; j < M.w.length; j++) s += M.w[j] * (r.x[j] - M.mean[j]) / M.std[j]; if ((s >= 0 ? 1 : 0) === r.y) h++; } return h / TE.length; }
const P = x => (x * 100).toFixed(1) + "%";
const syms = Object.keys(data).filter(s => data[s] && data[s].candles && data[s].candles.length > WARM + H + 40 && ev8k[s] && ev8k[s].length >= 20);

function runAxis(name, axis) {
  const all = [];
  for (const sym of syms) {
    const cds = data[sym].candles, price = cds.map(c => c.c), hi = cds.map(c => c.h), lo = cds.map(c => c.l), op = cds.map(c => c.o), dates = cds.map(c => c.t), N = price.length;
    const ei = eIdx(dates, data[sym].earnings || []); if (ei.length < 8) continue;
    const tN = tNA(N, ei), sc = sA(N, ei);
    const nonEarn = ev8k[sym].filter(e => !e.items.includes("2.02")).map(e => e.d);
    const highImp = ev8k[sym].filter(e => !e.items.includes("2.02") && HIGH_IMPACT.some(it => e.items.includes(it))).map(e => e.d);
    const ei8 = eIdx(dates, nonEarn), eiHi = eIdx(dates, highImp); if (ei8.length < 10) continue;
    const s8 = sA(N, ei8), s8Hi = sA(N, eiHi);
    const gap = new Array(N).fill(0); for (let i = 1; i < N; i++) gap[i] = op[i] / price[i - 1] - 1;
    const loc = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) {
      const v = vol10(price, hi, lo, t); if (!v) continue;
      const ef = earnF(tN, sc, t);
      // 축별 baseline(배포 완전모델)
      let base;
      if (axis === "gap") { const gvv0 = (function () { let s = 0, c = 0; for (let i = t - 59; i <= t; i++) if (i >= 1) { s += gap[i] * gap[i]; c++; } return c ? Math.sqrt(s / c) : 0; })(); if (!gvv0) continue; base = [...v, ...gapFeats(price, gap, t), ...ef]; }
      else if (axis === "vol") { const g20 = gk(op, hi, lo, price, t, 20), v20 = rvol(price, t, 20); base = [...v, v20 ? g20 / v20 : 1, ...ef]; }
      else base = [...v, ...ef]; // spk
      // 타깃
      let y;
      if (axis === "gap") { const gvv = (function () { let s = 0, c = 0; for (let i = t - 59; i <= t; i++) if (i >= 1) { s += gap[i] * gap[i]; c++; } return c ? Math.sqrt(s / c) : 0; })(); y = 0; for (let i = t + 1; i <= t + H; i++) if (Math.abs(gap[i]) > 2.2 * gvv) { y = 1; break; } }
      else if (axis === "spk") { const sv = rvol(price, t, 20); if (!sv) continue; y = 0; for (let i = t + 1; i <= t + H; i++) if (Math.abs(price[i] / price[i - 1] - 1) > 2.5 * sv) { y = 1; break; } }
      else { const cur = rvol(price, t, H), fwd = rvol(price, t + H, H); if (!cur || !isFinite(fwd)) continue; y = fwd > cur ? 1 : 0; }
      loc.push({ base, broad: base.concat(feat8kBroad(s8, ei8, t)), hi: base.concat(feat8kHi(s8Hi, eiHi, t)), y, sym });
    }
    const cut = Math.floor(loc.length * TRAIN_FRAC); loc.forEach((r, i) => { r._tr = i < cut; all.push(r); });
  }
  const DB = all[0].base.length;
  const TR = all.filter(r => r._tr), TE = all.filter(r => !r._tr);
  const ss = [...new Set(all.map(r => r.sym))];
  function evalSet(key, D) {
    const aIn = acc(fit(TR.map(r => ({ x: r[key], y: r.y })), D), TE.map(r => ({ x: r[key], y: r.y })));
    let xs = 0, xn = 0;
    for (const s of ss) { const tr = all.filter((r, i) => r.sym !== s && i % 2 === 0), te = all.filter(r => r.sym === s && !r._tr); if (te.length < 20 || tr.length < 200) continue; xs += acc(fit(tr.map(r => ({ x: r[key], y: r.y })), D, 120), te.map(r => ({ x: r[key], y: r.y }))); xn++; }
    return { in: aIn, out: xs / xn };
  }
  const b = evalSet("base", DB), br = evalSet("broad", DB + 5), h = evalSet("hi", DB + 5);
  const gate = (r) => ((r.in - b.in) >= 0.01 && (r.out - b.out) >= 0.01) ? "★채택" : "기각";
  const d = (a, c) => ((a - c >= 0 ? "+" : "") + ((a - c) * 100).toFixed(1)) + "%p";
  console.log("── " + name + " (baseline " + DB + "피처, 양성률 " + P(TE.filter(r => r.y).length / TE.length) + ") ──");
  console.log("  baseline        종목내 " + P(b.in) + " · 종목외 " + P(b.out));
  console.log("  +8K 전체비실적   종목내 " + P(br.in) + " (" + d(br.in, b.in) + ") · 종목외 " + P(br.out) + " (" + d(br.out, b.out) + ")  " + gate(br));
  console.log("  +8K 고임팩트만   종목내 " + P(h.in) + " (" + d(h.in, b.in) + ") · 종목외 " + P(h.out) + " (" + d(h.out, b.out) + ")  " + gate(h));
  console.log("");
}
console.log("=== 비실적 8-K 축 최종 판정 (US주식 " + syms.length + "종) ===\n");
runAxis("갭 (오버나잇 2.2σ·20봉)", "gap");
runAxis("급변 (일중 2.5σ·20봉)", "spk");
runAxis("변동성 확대 (20봉)", "vol");
