// backtest/cone-precision-lab.js — B(실현범위 예측) 콘 정밀화의 엄밀 검증·계수 추출.
// 가설: 향후 실현변동성/직전 변동성 "비율"을 예측해 콘 폭을 국면별로 스케일하면
//   (1) 전체 커버리지는 보존(≈현행)하면서 (2) 국면별 조건부 커버리지가 평탄해지고(=정밀화 이득)
//   (3) up-prob ECE는 Platt 재적합으로 복원 가능한가?  아니면 기각.
// 방법: 실제 FC.run()을 일봉 walk-forward로 1회 실행해 각 시점 콘(m[],s[])·features·미래가를 기록 →
//   로그비율 릿지(mean-1 센터링·bound)로 승수 산출 → 사후 재적용으로 커버리지·조건부·ECE 평가.
// 규율: 일봉 한정(모델 검증 도메인). OOS 종목별 앞60%/뒤40%. lookahead 금지. 과장 금지 — 관문 미달 시 기각.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");

const WARMUP = 200, LOOKBACK = 600, STRIDE = 20, H = 60, TRAIN_FRAC = 0.6, LAMBDA = 1e-1;
const MULT_LO = 0.75, MULT_HI = 1.35;
const CACHE = path.join(__dirname, "cone-precision-recs.json");   // 느린 엔진 패스 결과 캐시(재분석 고속화)

// ── 변동성 구조 11피처 (range-forecast-lab / train-volforecast 동일) ──
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function gk(op, hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const u = Math.log(hi[i] / lo[i]), d = Math.log(cl[i] / op[i]); s += 0.5 * u * u - (2 * Math.log(2) - 1) * d * d; } const v = s / n; return v > 0 ? Math.sqrt(v) : 0; }
function feats(price, op, hi, lo, t) {
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const atr = atrp(hi, lo, price, t, 14);
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  const hist = []; for (let k = t - 252; k <= t; k += 3) { if (k - 20 >= 0) { const vv = rvol(price, k, 20); if (vv) hist.push(vv); } }
  let pct = 0.5; if (hist.length > 5) { let c = 0; for (const v of hist) if (v <= v20) c++; pct = c / hist.length; }
  const gk20 = gk(op, hi, lo, price, t, 20), gkR = v20 ? gk20 / v20 : 1;
  return { x: [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60), pct, gkR], pct };
}

// ── 릿지(표준화 X·중심화 y·정규방정식) ──
function fitRidge(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  let ym = 0; for (const r of TR) ym += r.y; ym /= TR.length;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  const A = Array.from({ length: D }, () => new Array(D).fill(0)), g = new Array(D).fill(0);
  for (const r of TR) { const zx = z(r.x), dy = r.y - ym; for (let i = 0; i < D; i++) { g[i] += zx[i] * dy; for (let j = 0; j < D; j++) A[i][j] += zx[i] * zx[j]; } }
  for (let i = 0; i < D; i++) A[i][i] += LAMBDA * TR.length;
  const w = solve(A, g, D);
  return { mean, std, ym, w };
}
function predRidge(M, x) { let s = M.ym; for (let j = 0; j < x.length; j++) s += M.w[j] * (x[j] - M.mean[j]) / M.std[j]; return s; }
function solve(A, b, n) {
  const Mx = A.map((row, i) => row.concat(b[i]));
  for (let c = 0; c < n; c++) { let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(Mx[r][c]) > Math.abs(Mx[piv][c])) piv = r; [Mx[c], Mx[piv]] = [Mx[piv], Mx[c]]; const d = Mx[c][c] || 1e-12; for (let r = 0; r < n; r++) { if (r === c) continue; const f = Mx[r][c] / d; for (let k = c; k <= n; k++) Mx[r][k] -= f * Mx[c][k]; } }
  const x = new Array(n); for (let i = 0; i < n; i++) x[i] = Mx[i][n] / (Mx[i][i] || 1e-12); return x;
}
function _normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
const _sig = x => 1 / (1 + Math.exp(-x));
const _logit = q => { const c = Math.min(0.9999, Math.max(0.0001, q)); return Math.log(c / (1 - c)); };

// ── 데이터 구축: 실제 엔진 1회 실행 ──
function standardGraph() { const g = FC.sampleGraph(); (g.nodes || []).forEach(n => { if (n.conviction) n.conviction = 0; }); return g; }
const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
let rows = [], nfx = 0;
if (fs.existsSync(CACHE) && !process.env.REBUILD) {
  const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  rows = cached.rows; nfx = cached.nfx;
  console.log("캐시 로드: 일봉 " + nfx + "종 · " + rows.length + "시점 (REBUILD=1로 재생성)");
} else {
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const candle = fx.candle, price = candle.map(c => c.c), op = candle.map(c => c.o), hi = candle.map(c => c.h), lo = candle.map(c => c.l), N = price.length;
    if (N < WARMUP + H + 40) continue;
    const graph = standardGraph();
    const sym = f.replace("-1day.json", "");
    const local = [];
    for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
      const ft = feats(price, op, hi, lo, t); if (!ft || ft.x.some(v => !isFinite(v))) continue;
      const trail = rvol(price, t, H), fwd = rvol(price, t + H, H);
      if (!trail || !isFinite(fwd) || !fwd) continue;
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      const past = { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) };
      let r; try { r = FC.run(graph, past, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
      const pred = r.prediction; if (!pred || !pred.path || !pred.hi || pred.path.length < H) continue;
      const anchor = pred.anchor, mArr = [], sArr = [];
      let ok = true;
      for (let k = 0; k < pred.path.length; k++) {
        const pk = pred.path[k], hk = pred.hi[k];
        if (!(pk > 0 && hk > 0 && anchor > 0)) { ok = false; break; }
        mArr.push(+Math.log(pk / anchor).toFixed(6)); sArr.push(+Math.log(hk / pk).toFixed(6));
      }
      if (!ok) continue;
      local.push({ sym, x: ft.x.map(v => +v.toFixed(6)), pct: +ft.pct.toFixed(4), m: mArr, s: sArr, anchor: +anchor.toFixed(6),
        actual: +price[t + H].toFixed(6), loH: +pred.lo[H - 1].toFixed(6), hiH: +pred.hi[H - 1].toFixed(6),
        y: +Math.log(fwd / trail).toFixed(6) });   // 타깃: 로그비율(향후/직전 실현변동성)
    }
    const cut = Math.floor(local.length * TRAIN_FRAC);
    local.forEach((r, i) => { r._tr = i < cut; rows.push(r); });
    nfx++;
    console.error("  " + sym + " → " + local.length + "시점");
  }
  fs.writeFileSync(CACHE, JSON.stringify({ nfx, rows }));
  console.log("일봉 " + nfx + "종 · 총 " + rows.length + "시점 (H=" + H + ", stride=" + STRIDE + ") · 캐시 기록");
}

const TR = rows.filter(r => r._tr), TE = rows.filter(r => !r._tr);
const D = 11;
const M = fitRidge(TR.map(r => ({ x: r.x, y: r.y })), D);
// 센터링: train 예측 로그비율 평균을 빼 승수 기하평균≈1 (전체 커버리지 보존)
let cbar = 0; for (const r of TR) cbar += predRidge(M, r.x); cbar /= TR.length;
const multOf = x => Math.max(MULT_LO, Math.min(MULT_HI, Math.exp(predRidge(M, x) - cbar)));

// ── (A) 비율 예측 OOS 품질: 승수가 실제 로그비율을 맞히나(다중=1 대비) ──
function maeCorr(pred, act) { let n = pred.length, sp = 0, sa = 0; for (let i = 0; i < n; i++) { sp += pred[i]; sa += act[i]; } sp /= n; sa /= n; let mae = 0, cov = 0, vp = 0, va = 0; for (let i = 0; i < n; i++) { mae += Math.abs(pred[i] - act[i]); const dp = pred[i] - sp, da = act[i] - sa; cov += dp * da; vp += dp * dp; va += da * da; } return { mae: mae / n, corr: Math.sqrt(vp * va) ? cov / Math.sqrt(vp * va) : 0 }; }
const teAct = TE.map(r => r.y);
const teModel = TE.map(r => predRidge(M, r.x) - cbar);   // 예측 로그비율(센터)
const teBase = TE.map(() => 0);                          // 승수=1(로그비율 0)
const qModel = maeCorr(teModel, teAct.map(a => a - (TR.reduce((s, r) => s + r.y, 0) / TR.length))), // 센터 정렬 비교용
      qm = maeCorr(teModel, teAct), qb = maeCorr(teBase, teAct);
console.log("\n[A] 로그비율 예측 OOS (센터링 후):");
console.log("  승수=1(현행)   MAE " + qb.mae.toFixed(4) + " · 상관 " + qb.corr.toFixed(3));
console.log("  모델(11피처)   MAE " + qm.mae.toFixed(4) + " · 상관 " + qm.corr.toFixed(3) + "  → " + (qm.mae < qb.mae ? "개선 -" + ((1 - qm.mae / qb.mae) * 100).toFixed(1) + "%" : "미개선"));

// ── (B) 커버리지: 전체 + 국면별(변동성 백분위 3구간) ──
function coverBucket(recs, useMult) {
  const buck = { lo: [0, 0], mid: [0, 0], hi: [0, 0], all: [0, 0] };
  for (const r of recs) {
    const mlt = useMult ? multOf(r.x) : 1;
    const sd = r.s[H - 1] * mlt, hiV = r.anchor * Math.exp(r.m[H - 1] + sd), loV = r.anchor * Math.exp(r.m[H - 1] - sd);
    const inB = (r.actual >= loV && r.actual <= hiV) ? 1 : 0;
    const b = r.pct < 0.33 ? "lo" : r.pct > 0.66 ? "hi" : "mid";
    buck[b][0] += inB; buck[b][1]++; buck.all[0] += inB; buck.all[1]++;
  }
  const p = a => a[1] ? a[0] / a[1] : 0;
  return { lo: p(buck.lo), mid: p(buck.mid), hi: p(buck.hi), all: p(buck.all),
    spread: Math.max(p(buck.lo), p(buck.mid), p(buck.hi)) - Math.min(p(buck.lo), p(buck.mid), p(buck.hi)) };
}
const cvBase = coverBucket(TE, false), cvMod = coverBucket(TE, true);
const P = x => (x * 100).toFixed(1) + "%";
console.log("\n[B] 콘 커버리지(H=" + H + ") — 전체 보존 + 국면별 평탄화가 목표:");
console.log("             압축국면   중간    확대국면   전체    편차(작을수록 평탄)");
console.log("  현행(=1)   " + P(cvBase.lo).padStart(7) + " " + P(cvBase.mid).padStart(7) + " " + P(cvBase.hi).padStart(8) + " " + P(cvBase.all).padStart(7) + "   " + P(cvBase.spread));
console.log("  모델승수   " + P(cvMod.lo).padStart(7) + " " + P(cvMod.mid).padStart(7) + " " + P(cvMod.hi).padStart(8) + " " + P(cvMod.all).padStart(7) + "   " + P(cvMod.spread));

// ── (C) ECE: 현행 Platt vs 모델승수+Platt재적합 ──
function aggUp(r, useMult) {
  const mlt = useMult ? multOf(r.x) : 1;
  let s = 0, w = 0;
  for (let k = 0; k < r.m.length; k++) { const wt = 1 / Math.sqrt(k + 1); const sd = (r.s[k] || 1e-6) * mlt; s += _normCdf(r.m[k] / sd) * 100 * wt; w += wt; }
  return w ? s / w : 50;   // raw 집계(0~100)
}
// 현행 Platt(A/B) = calibrateUpProb
function ece(recs, upFn) {
  const bins = {};
  for (const r of recs) { const up = upFn(r); const k = Math.min(9, Math.floor(up / 10)); (bins[k] = bins[k] || []).push({ up, y: r.actual > r.anchor ? 1 : 0 }); }
  let tot = 0; for (const k in bins) tot += bins[k].length; let e = 0;
  for (const k in bins) { const rs = bins[k], pr = rs.reduce((s, x) => s + x.up, 0) / rs.length / 100, ac = rs.reduce((s, x) => s + x.y, 0) / rs.length; e += rs.length / tot * Math.abs(pr - ac); }
  return e;
}
// Platt 재적합(train raw 집계 → 실제 up). q=raw/100 → sig(A*logit(q)+B)
function fitPlatt(recs, useMult) {
  const pts = recs.map(r => ({ q: aggUp(r, useMult) / 100, y: r.actual > r.anchor ? 1 : 0 }));
  let A = 1, B = 0; const LR = 0.05;
  for (let ep = 0; ep < 3000; ep++) { let gA = 0, gB = 0; for (const p of pts) { const z = A * _logit(p.q) + B, pr = _sig(z), e = pr - p.y; gA += e * _logit(p.q); gB += e; } A -= LR * gA / pts.length; B -= LR * gB / pts.length; }
  return { A, B };
}
const curUp = r => FC.calibrateUpProb(Math.round(aggUp(r, false)));   // 현행: 승수1 + 배포 Platt
const eceCur = ece(TE, curUp);
const pl = fitPlatt(TR, true);   // 모델승수 raw로 Platt 재적합(train)
const modUp = r => Math.round(_sig(pl.A * _logit(aggUp(r, true) / 100) + pl.B) * 100);
const eceMod = ece(TE, modUp);
// 참고: 모델승수 + 현행 Platt(재적합 안 함)
const eceModNoRefit = ece(TE, r => FC.calibrateUpProb(Math.round(aggUp(r, true))));
console.log("\n[C] up-prob ECE (낮을수록 정직):");
console.log("  현행(승수1·배포Platt)          " + P(eceCur));
console.log("  모델승수·Platt 재적합 안 함     " + P(eceModNoRefit) + "  ← 캘리브 훼손 확인");
console.log("  모델승수·Platt 재적합(A=" + pl.A.toFixed(4) + " B=" + pl.B.toFixed(4) + ")  " + P(eceMod));

// ── 판정 ──
console.log("\n══════════ 판정 ══════════");
const covOk = Math.abs(cvMod.all - cvBase.all) < 0.02;
const flatOk = cvMod.spread < cvBase.spread - 0.01;
const eceOk = eceMod < 0.03 && eceMod < eceCur + 0.005;
console.log("  전체 커버리지 보존(±2%p): " + (covOk ? "✓" : "✗") + " (" + P(cvBase.all) + "→" + P(cvMod.all) + ")");
console.log("  조건부 커버리지 평탄화:   " + (flatOk ? "✓" : "✗") + " (편차 " + P(cvBase.spread) + "→" + P(cvMod.spread) + ")");
console.log("  ECE 복원(≤3%·현행 근접):  " + (eceOk ? "✓" : "✗") + " (" + P(eceCur) + "→" + P(eceMod) + ")");
console.log("  → " + (covOk && flatOk && eceOk ? "채택 가능 — 배포계수 아래" : "기각 또는 재설계 필요"));

console.log("\n[배포계수] (일봉 한정 콘 승수, 11피처)");
console.log("MEAN=" + JSON.stringify(M.mean.map(v => +v.toFixed(5))));
console.log("STD =" + JSON.stringify(M.std.map(v => +v.toFixed(5))));
console.log("W   =" + JSON.stringify(M.w.map(v => +v.toFixed(5))));
console.log("YM  =" + M.ym.toFixed(5) + "  CBAR=" + cbar.toFixed(5) + "  (승수=clamp(exp((ym+Σw·z)-cbar), " + MULT_LO + ", " + MULT_HI + "))");
console.log("PLATT(재적합)  A=" + pl.A.toFixed(5) + "  B=" + pl.B.toFixed(5));
