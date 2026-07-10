// backtest/range-forecast-lab.js — 콘(예측밴드) 폭 정밀화 리서치.
// 질문: 향후 H봉 "실현변동성"(타깃1) / "실현범위"(타깃2)를 변동성구조 피처로 회귀 예측하면
//        무조건평균·trailing(지속성) 베이스라인을 유의하게 이기나? (회귀 → MAE/상관으로 평가)
// 규율: OOS 종목별 앞60%/뒤40%, lookahead 금지, 과장 금지. trailing을 못 이기면 기각.
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6, LAMBDA = 1e-1;

// ── 변동성 추정기 (train-volforecast.js / train-ddrisk.js와 동일) ──
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function garmanKlass(op, hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const u = Math.log(hi[i] / lo[i]), d = Math.log(cl[i] / op[i]); s += 0.5 * u * u - (2 * Math.log(2) - 1) * d * d; } const v = s / n; return v > 0 ? Math.sqrt(v) : 0; }
function feats(price, op, hi, lo, t) {
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const atr = atrp(hi, lo, price, t, 14);
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  const hist = []; for (let k = t - 252; k <= t; k += 3) { if (k - 20 >= 0) { const vv = rvol(price, k, 20); if (vv) hist.push(vv); } }
  let pct = 0.5; if (hist.length > 5) { let c = 0; for (const v of hist) if (v <= v20) c++; pct = c / hist.length; }
  const gk20 = garmanKlass(op, hi, lo, price, t, 20), gkRatio = v20 ? gk20 / v20 : 1;
  return [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60), pct, gkRatio];
}

// ── 릿지 회귀 (표준화 X, 중심화 y, 정규방정식 가우스소거) ──
function fitRidge(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  let ymean = 0; for (const r of TR) ymean += r.y; ymean /= TR.length;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  // A = Z^T Z + λI, g = Z^T (y - ymean)
  const A = Array.from({ length: D }, () => new Array(D).fill(0)), g = new Array(D).fill(0);
  for (const r of TR) { const zx = z(r.x), dy = r.y - ymean; for (let i = 0; i < D; i++) { g[i] += zx[i] * dy; for (let j = 0; j < D; j++) A[i][j] += zx[i] * zx[j]; } }
  for (let i = 0; i < D; i++) A[i][i] += LAMBDA * TR.length;
  const w = solve(A, g, D);
  return { mean, std, ymean, w, predict(x) { const zx = z(x); let s = this.ymean; for (let j = 0; j < D; j++) s += this.w[j] * zx[j]; return s; } };
}
function solve(A, b, n) {
  const M = A.map((row, i) => row.concat(b[i]));
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n); for (let i = 0; i < n; i++) x[i] = M[i][n] / (M[i][i] || 1e-12); return x;
}

// ── 평가지표 ──
function mae(pred, act) { let s = 0; for (let i = 0; i < pred.length; i++) s += Math.abs(pred[i] - act[i]); return s / pred.length; }
function corr(pred, act) {
  const n = pred.length; let mp = 0, ma = 0; for (let i = 0; i < n; i++) { mp += pred[i]; ma += act[i]; } mp /= n; ma /= n;
  let cov = 0, vp = 0, va = 0; for (let i = 0; i < n; i++) { const dp = pred[i] - mp, da = act[i] - ma; cov += dp * da; vp += dp * dp; va += da * da; }
  const den = Math.sqrt(vp * va); return den ? cov / den : 0;
}

// ── 데이터 구축 ──
const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
const rowsVol = [], rowsRange = [];   // 타깃1 / 타깃2
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const price = fx.candle.map(c => c.c), op = fx.candle.map(c => c.o), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
  if (N < WARM + H + 40) continue;
  const localV = [], localR = [];
  for (let t = WARM; t <= N - H - 1; t += STRIDE) {
    const x = feats(price, op, hi, lo, t); if (!x || x.some(v => !isFinite(v))) continue;
    // 타깃1: 향후 H봉 실현변동성(logret² rms) — v20와 동일 추정기의 미래버전.
    const fwdVol = rvol(price, t + H, H);
    // trailing1: 직전 H봉 실현변동성 = v20(t).
    const trailVol = rvol(price, t, H);
    // 타깃2: 향후 H봉 실현범위 (max high − min low)/현재가.
    let mx = -Infinity, mn = Infinity; for (let i = t + 1; i <= t + H; i++) { if (hi[i] > mx) mx = hi[i]; if (lo[i] < mn) mn = lo[i]; }
    const fwdRange = (mx - mn) / price[t];
    // trailing2: 직전 H봉 실현범위 /현재가.
    let pmx = -Infinity, pmn = Infinity; for (let i = t - H + 1; i <= t; i++) { if (hi[i] > pmx) pmx = hi[i]; if (lo[i] < pmn) pmn = lo[i]; }
    const trailRange = (pmx - pmn) / price[t];
    if (!isFinite(fwdVol) || !isFinite(trailVol) || !isFinite(fwdRange) || !isFinite(trailRange)) continue;
    localV.push({ x, y: fwdVol, trail: trailVol });
    localR.push({ x, y: fwdRange, trail: trailRange });
  }
  const sym = f.replace("-1day.json", "");
  const cutV = Math.floor(localV.length * TRAIN_FRAC);
  localV.forEach((r, i) => { r._tr = i < cutV; r.sym = sym; rowsVol.push(r); });
  const cutR = Math.floor(localR.length * TRAIN_FRAC);
  localR.forEach((r, i) => { r._tr = i < cutR; r.sym = sym; rowsRange.push(r); });
}

// 보정 trailing: train에서 y = a·trail + b OLS 적합(단순 2모수) → 무조건 스케일/오프셋 보정한 지속성.
function fitCalibTrail(TR) {
  let n = TR.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const r of TR) { sx += r.trail; sy += r.y; sxx += r.trail * r.trail; sxy += r.trail * r.y; }
  const a = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1e-12), b = (sy - a * sx) / n;
  return t => a * t + b;
}
// 종목내(within-symbol) 상관: 각 종목 test 평균을 뺀 편차로 상관 — 횡단면 레벨차 제거, 순수 시계열 예측력.
function withinCorr(TE, predFn) {
  const bySym = {}; for (let i = 0; i < TE.length; i++) { const s = TE[i].sym; (bySym[s] || (bySym[s] = [])).push(i); }
  const dp = [], da = []; const p = TE.map(predFn), a = TE.map(r => r.y);
  for (const s in bySym) { const idx = bySym[s]; let mp = 0, ma = 0; for (const i of idx) { mp += p[i]; ma += a[i]; } mp /= idx.length; ma /= idx.length; for (const i of idx) { dp.push(p[i] - mp); da.push(a[i] - ma); } }
  return corr(dp, da);
}
// 종목별 MAE 개선 중앙값: 모델이 대다수 종목에서 trailing보다 나은지(pooling 착시 방지).
function perSymMaeGain(TE, predModel, predTrail) {
  const bySym = {}; for (let i = 0; i < TE.length; i++) { const s = TE[i].sym; (bySym[s] || (bySym[s] = [])).push(i); }
  const gains = []; let wins = 0, tot = 0;
  for (const s in bySym) { const idx = bySym[s]; let mm = 0, mt = 0; for (const i of idx) { mm += Math.abs(predModel[i] - TE[i].y); mt += Math.abs(predTrail[i] - TE[i].y); } mm /= idx.length; mt /= idx.length; const g = (mt - mm) / mt * 100; gains.push(g); tot++; if (g > 0) wins++; }
  gains.sort((a, b) => a - b); const med = gains[Math.floor(gains.length / 2)];
  return { median: med, winRate: wins / tot * 100, n: tot };
}

function evalTarget(name, unit, rows) {
  const D = rows[0].x.length;
  const TR = rows.filter(r => r._tr), TE = rows.filter(r => !r._tr);
  const M = fitRidge(TR, D);
  let trainYmean = 0; for (const r of TR) trainYmean += r.y; trainYmean /= TR.length;
  const act = TE.map(r => r.y);
  const predModel = TE.map(r => M.predict(r.x));
  const predTrail = TE.map(r => r.trail);
  const predUncond = TE.map(() => trainYmean);
  // 스케일 변환: 변동성/범위 → 퍼센트로 보기 좋게
  const S = unit;
  const tblRow = (label, pred) => {
    const m = mae(pred, act) * S, c = corr(pred, act);
    return { label, mae: m, corr: c };
  };
  const calib = fitCalibTrail(TR);
  const predCalib = TE.map(r => calib(r.trail));
  const model = tblRow("모델(릿지)", predModel);
  const trail = tblRow("trailing-" + H, predTrail);
  const ctrail = tblRow("보정trailing", predCalib);
  const uncond = tblRow("무조건평균", predUncond);
  console.log("\n═══ " + name + "  (N_test=" + TE.length + ", 단위 ×" + S + ") ═══");
  console.log("  " + "방법".padEnd(14) + "MAE".padStart(10) + "상관(pool)".padStart(12) + "상관(종목내)".padStart(13));
  const wcUncond = 0, wcTrail = withinCorr(TE, r => r.trail), wcCalib = withinCorr(TE, r => calib(r.trail)), wcModel = withinCorr(TE, r => M.predict(r.x));
  const rowsMeta = [[uncond, wcUncond], [trail, wcTrail], [ctrail, wcCalib], [model, wcModel]];
  for (const [r, wc] of rowsMeta) {
    console.log("  " + r.label.padEnd(14) + r.mae.toFixed(4).padStart(10) + (isFinite(r.corr) ? r.corr.toFixed(3) : "n/a").padStart(12) + wc.toFixed(3).padStart(13));
  }
  const maeGain = (trail.mae - model.mae) / trail.mae * 100;
  const maeGainVsCalib = (ctrail.mae - model.mae) / ctrail.mae * 100;
  const corrGain = model.corr - trail.corr;
  const wcGainVsCalib = wcModel - wcCalib;
  const ps = perSymMaeGain(TE, predModel, predTrail);
  console.log("  → 모델 vs trailing:      MAE -" + maeGain.toFixed(1) + "% · pool상관 Δ+" + corrGain.toFixed(3));
  console.log("  → 모델 vs 보정trailing:  MAE " + (maeGainVsCalib >= 0 ? "-" : "+") + Math.abs(maeGainVsCalib).toFixed(1) + "% · 종목내상관 Δ" + (wcGainVsCalib >= 0 ? "+" : "") + wcGainVsCalib.toFixed(3) + "  ← 피처 순증분");
  console.log("  → 종목별 MAE개선 중앙값 " + ps.median.toFixed(1) + "% · 개선종목 " + ps.winRate.toFixed(0) + "% (" + ps.n + "종목)");
  const ymeanTest = act.reduce((a, b) => a + b, 0) / act.length;
  console.log("  (참고) test 타깃 평균 = " + (ymeanTest * S).toFixed(4));
  return { model, trail, ctrail, uncond, maeGain, maeGainVsCalib, corrGain, wcGainVsCalib, wcModel, wcCalib, perSym: ps };
}

console.log("범위/변동성 예측 리서치 — H=" + H + ", 종목 " + files.length + "개, WARM=" + WARM + ", λ=" + LAMBDA);
console.log("전체 샘플: vol=" + rowsVol.length + ", range=" + rowsRange.length);
const r1 = evalTarget("타깃1: 향후 " + H + "봉 실현변동성", 100, rowsVol);
const r2 = evalTarget("타깃2: 향후 " + H + "봉 실현범위", 100, rowsRange);

console.log("\n══════════ 판정 (기준: 보정trailing 대비 순증분 = 피처의 진짜 기여) ══════════");
function verdict(name, r) {
  // 원-trailing은 스케일/오프셋 미보정이라 이기기 쉬움. 진짜 관문은 '보정trailing' 초과 여부.
  const featBeats = r.maeGainVsCalib > 1.0 && r.wcGainVsCalib > 0.01;
  if (r.maeGainVsCalib > 3 && r.wcGainVsCalib > 0.03) console.log(name + ": 보정trailing마저 뚜렷이 이김 (MAE -" + r.maeGainVsCalib.toFixed(1) + "%, 종목내상관 Δ+" + r.wcGainVsCalib.toFixed(3) + ") → 변동성구조 피처가 실질 예측력 추가. 콘 스케일 후보 유효.");
  else if (featBeats) console.log(name + ": 보정trailing을 소폭 이김 (MAE -" + r.maeGainVsCalib.toFixed(1) + "%, 종목내상관 Δ+" + r.wcGainVsCalib.toFixed(3) + ") — 실질 개선 있으나 작음. 콘 반영은 보수적으로.");
  else console.log(name + ": 보정trailing을 유의하게 못 이김 (MAE " + (r.maeGainVsCalib >= 0 ? "-" : "+") + Math.abs(r.maeGainVsCalib).toFixed(1) + "%, 종목내상관 Δ" + (r.wcGainVsCalib >= 0 ? "+" : "") + r.wcGainVsCalib.toFixed(3) + ") → 사실상 기각. 원-trailing 대비 이득은 대부분 스케일보정(=평균회귀)일 뿐, 지표피처의 순기여는 미미.");
}
verdict("타깃1(실현변동성)", r1);
verdict("타깃2(실현범위)", r2);
