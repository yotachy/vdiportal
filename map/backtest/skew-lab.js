// backtest/skew-lab.js — 실현 왜도/꼬리 비대칭(tail asymmetry) 새 축 정직 검증(신규 랩·공유파일 불변).
// 질문: 향후 H봉 수익분포의 3차 모멘트(왜도) 부호/비대칭을 변동성구조+가격구조 피처로 예측 가능한가?
//   타깃(a) 분류: 향후 H봉 로그수익 표본 왜도의 부호(≥0=우편향/멜트업 성향, <0=좌편향/크래시 성향)
//   타깃(b) 회귀: log(하방 준분산 DSV / 상방 준분산 USV)  ← semivariance 비율(더 안정적)
// 규율:
//   1) OOS 종목별 앞60% train / 뒤40% test, lookahead 금지
//   2) 종목외(train종목↔test종목 disjoint) walk-forward 병행
//   3) 이중 베이스라인: 분류=다수결 & 지속성(과거 H봉 미러) 둘 다 ≥+1%p 초과 / 회귀=무조건평균 & 보정trailing 둘 다 유의 초과
//   4) 방향 판별(신기루 차단): 예측군의 향후 상승률 ≈50%여야 순수 3차 신호(가격방향 재포장 아님)
//   5) 피처 소거: 이득이 단순 과거왜도(미러)에서만 나오는지 — no-mirror / mirror-only 대조
"use strict";
const fs = require("fs"), path = require("path");
const STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6;
const HS = [20, 40];
const EPS = 1e-9, CLIP = 4;   // semivariance 로그비 극단 클립

// ── 변동성 추정기(공유 랩과 동일) ──
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }

// 로그수익 창 통계 [a,b] (i는 price[i]/price[i-1]) — mean/sd/skew/DSV/USV
function winStats(price, a, b) {
  const r = []; for (let i = a; i <= b; i++) r.push(Math.log(price[i] / price[i - 1]));
  const n = r.length; let m = 0; for (const v of r) m += v; m /= n;
  let s2 = 0, s3 = 0, dsv = 0, usv = 0;
  for (const v of r) { const d = v - m; s2 += d * d; s3 += d * d * d; if (v < 0) dsv += v * v; else usv += v * v; }
  const varr = s2 / n, sd = Math.sqrt(varr);
  const skew = sd > 0 ? (s3 / n) / (sd * sd * sd) : 0;
  return { n, mean: m, sd, skew, dsv, usv };
}
function logSVR(st) { let v = Math.log((st.dsv + EPS) / (st.usv + EPS)); return Math.max(-CLIP, Math.min(CLIP, v)); }

// ── 피처(모두 과거만, index t, 미러창=H) ──
// idx0 = 과거왜도(미러), idx1 = 과거logSVR(미러) — 소거 대상. 나머지 = 변동성구조 + 가격구조.
function feats(price, hi, lo, t, H) {
  if (t - H < 1 || t - 120 < 1) return null;
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const past = winStats(price, t - H + 1, t);     // 미러창(타깃과 동일 길이)
  const short = winStats(price, t - 9, t);          // 단기 10봉 비대칭
  const atr = atrp(hi, lo, price, t, 14);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  const mom = Math.log(price[t] / price[t - H]);    // 가격방향 프록시(모멘텀)
  const x = [
    past.skew,          // 0 MIRROR: 과거 왜도
    logSVR(past),       // 1 MIRROR: 과거 로그 준분산비
    short.skew,         // 2 단기 왜도
    v20 / v60 - 1,      // 3
    v20 / v120 - 1,     // 4
    v60 / v120 - 1,     // 5
    atr * 100,          // 6
    rng * 100,          // 7
    v20 * 100,          // 8
    mom * 100,          // 9 방향 프록시
    vov,                // 10 vol-of-vol
  ];
  if (x.some(v => !isFinite(v))) return null;
  return { x, pastSkewSign: past.skew >= 0 ? 1 : 0, pastLogSVR: logSVR(past) };
}
const MIRROR_IDX = [0, 1];
function dropMirror(x) { return x.filter((_, j) => !MIRROR_IDX.includes(j)); }
const VOL_IDX = [3, 4, 5, 6, 7, 8, 10];   // 순수 변동성구조(기존 축) — 재분류 검증용
const ASYM_IDX = [0, 1, 2];               // 비대칭 전용(과거왜도·과거logSVR·단기왜도)
function pick(x, idx) { return idx.map(j => x[j]); }

// ── 로지스틱(분류) ──
function logit(TR, D) {
  const mean = Array(D).fill(0), std = Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  let w = Array(D).fill(0), b = 0;
  for (let ep = 0; ep < 400; ep++) { const gw = Array(D).fill(0); let gb = 0;
    for (const r of TR) { let s = b; for (let j = 0; j < D; j++) s += w[j] * (r.x[j] - mean[j]) / std[j]; const p = 1 / (1 + Math.exp(-s)), e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * (r.x[j] - mean[j]) / std[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= 0.1 * (gw[j] / TR.length + 2e-3 * w[j]); b -= 0.1 * gb / TR.length; }
  const f = x => { let s = b; for (let j = 0; j < D; j++) s += w[j] * (x[j] - mean[j]) / std[j]; return 1 / (1 + Math.exp(-s)); };
  f.mean = mean; f.std = std; f.w = w; f.b = b; return f;
}
// ── 릿지(회귀, range-forecast-lab과 동일) ──
const LAMBDA = 1e-1;
function fitRidge(TR, D) {
  const mean = Array(D).fill(0), std = Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  let ymean = 0; for (const r of TR) ymean += r.y; ymean /= TR.length;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  const A = Array.from({ length: D }, () => Array(D).fill(0)), g = Array(D).fill(0);
  for (const r of TR) { const zx = z(r.x), dy = r.y - ymean; for (let i = 0; i < D; i++) { g[i] += zx[i] * dy; for (let j = 0; j < D; j++) A[i][j] += zx[i] * zx[j]; } }
  for (let i = 0; i < D; i++) A[i][i] += LAMBDA * TR.length;
  const w = solve(A, g, D);
  const predict = x => { const zx = z(x); let s = ymean; for (let j = 0; j < D; j++) s += w[j] * zx[j]; return s; };
  return { mean, std, ymean, w, predict };
}
function solve(A, b, n) {
  const M = A.map((row, i) => row.concat(b[i]));
  for (let c = 0; c < n; c++) { let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r; [M[c], M[piv]] = [M[piv], M[c]]; const d = M[c][c] || 1e-12; for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  const x = Array(n); for (let i = 0; i < n; i++) x[i] = M[i][n] / (M[i][i] || 1e-12); return x;
}
function mae(p, a) { let s = 0; for (let i = 0; i < p.length; i++) s += Math.abs(p[i] - a[i]); return s / p.length; }
function corr(p, a) { const n = p.length; let mp = 0, ma = 0; for (let i = 0; i < n; i++) { mp += p[i]; ma += a[i]; } mp /= n; ma /= n; let cov = 0, vp = 0, va = 0; for (let i = 0; i < n; i++) { const dp = p[i] - mp, da = a[i] - ma; cov += dp * da; vp += dp * dp; va += da * da; } const den = Math.sqrt(vp * va); return den ? cov / den : 0; }

// ── 데이터 구축(지평별) ──
function buildRows(files, dir, H) {
  const rows = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
    if (N < WARM + H + 40) continue;
    const sym = f.replace("-1day.json", "");
    const local = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) {
      const ff = feats(price, hi, lo, t, H); if (!ff) continue;
      const fut = winStats(price, t + 1, t + H);
      const skewSign = fut.skew >= 0 ? 1 : 0;
      const yLogSVR = logSVR(fut);
      const fwdRet = price[t + H] / price[t] - 1;
      if (!isFinite(yLogSVR) || !isFinite(fwdRet)) continue;
      local.push({ x: ff.x, sym, skewSign, yLogSVR, fwdRet,
        pSkewSign: ff.pastSkewSign, pLogSVR: ff.pastLogSVR });
    }
    const cut = Math.floor(local.length * TRAIN_FRAC);
    local.forEach((r, i) => { r._tr = i < cut; rows.push(r); });
  }
  return rows;
}

const P = x => (x * 100).toFixed(1) + "%";

// ═══════════ 분류 타깃 평가 ═══════════
function evalSkewSign(rows, label) {
  const TR = rows.filter(r => r._tr), TE = rows.filter(r => !r._tr);
  const mk = r => ({ x: r.x, y: r.skewSign });
  const D = rows[0].x.length;
  const full = logit(TR.map(mk), D);
  const noM = logit(TR.map(r => ({ x: dropMirror(r.x), y: r.skewSign })), D - MIRROR_IDX.length);
  const onlyM = logit(TR.map(r => ({ x: [r.pSkewSign, r.pLogSVR], y: r.skewSign })), 2);
  const volOnly = logit(TR.map(r => ({ x: pick(r.x, VOL_IDX), y: r.skewSign })), VOL_IDX.length);
  const asymOnly = logit(TR.map(r => ({ x: pick(r.x, ASYM_IDX), y: r.skewSign })), ASYM_IDX.length);
  let hF = 0, hN = 0, hO = 0, hV = 0, hA = 0, bPers = 0, pos = 0;
  // 방향 판별용: 예측=좌편향(0)군의 상승률, 예측=우편향(1)군의 상승률
  let leftN = 0, leftUp = 0, rightN = 0, rightUp = 0;
  const probs = [], fwd = [];
  for (const r of TE) {
    const cF = full(r.x) >= 0.5 ? 1 : 0;
    if (cF === r.skewSign) hF++;
    if ((noM(dropMirror(r.x)) >= 0.5 ? 1 : 0) === r.skewSign) hN++;
    if ((onlyM([r.pSkewSign, r.pLogSVR]) >= 0.5 ? 1 : 0) === r.skewSign) hO++;
    if ((volOnly(pick(r.x, VOL_IDX)) >= 0.5 ? 1 : 0) === r.skewSign) hV++;
    if ((asymOnly(pick(r.x, ASYM_IDX)) >= 0.5 ? 1 : 0) === r.skewSign) hA++;
    if (r.pSkewSign === r.skewSign) bPers++;
    if (r.skewSign === 1) pos++;
    probs.push(full(r.x)); fwd.push(r.fwdRet > 0 ? 1 : 0);
    if (cF === 0) { leftN++; if (r.fwdRet > 0) leftUp++; } else { rightN++; if (r.fwdRet > 0) rightUp++; }
  }
  const n = TE.length, posRate = pos / n, base = Math.max(posRate, 1 - posRate);
  const accF = hF / n, accN = hN / n, accO = hO / n, accV = hV / n, accA = hA / n, pers = bPers / n;
  const probFwdCorr = corr(probs, fwd);   // 예측확률 vs 향후상승 상관(신기루면 큼)
  const labelDir = corr(rows.filter(r => !r._tr).map(r => r.skewSign), fwd); // 타깃 자체의 방향오염
  const beat = accF > base + 0.01 && accF > pers + 0.01;
  return { label, n, posRate, base, accF, accN, accO, accV, accA, pers, beat,
    leftUp: leftN ? leftUp / leftN : NaN, rightUp: rightN ? rightUp / rightN : NaN,
    leftN, rightN, probFwdCorr, labelDir };
}

// ═══════════ 회귀 타깃 평가 ═══════════
function fitCalibTrail(TR) { let n = TR.length, sx = 0, sy = 0, sxx = 0, sxy = 0; for (const r of TR) { sx += r.pLogSVR; sy += r.yLogSVR; sxx += r.pLogSVR * r.pLogSVR; sxy += r.pLogSVR * r.yLogSVR; } const a = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1e-12), b = (sy - a * sx) / n; return t => a * t + b; }
function withinCorr(TE, predFn) {
  const bySym = {}; for (let i = 0; i < TE.length; i++) { const s = TE[i].sym; (bySym[s] || (bySym[s] = [])).push(i); }
  const dp = [], da = []; const p = TE.map(predFn), a = TE.map(r => r.yLogSVR);
  for (const s in bySym) { const idx = bySym[s]; let mp = 0, ma = 0; for (const i of idx) { mp += p[i]; ma += a[i]; } mp /= idx.length; ma /= idx.length; for (const i of idx) { dp.push(p[i] - mp); da.push(a[i] - ma); } }
  return corr(dp, da);
}
function evalLogSVR(rows, label) {
  const TR = rows.filter(r => r._tr), TE = rows.filter(r => !r._tr);
  const D = rows[0].x.length;
  const M = fitRidge(TR.map(r => ({ x: r.x, y: r.yLogSVR })), D);
  const Mno = fitRidge(TR.map(r => ({ x: dropMirror(r.x), y: r.yLogSVR })), D - MIRROR_IDX.length);
  const calib = fitCalibTrail(TR);
  let ymean = 0; for (const r of TR) ymean += r.yLogSVR; ymean /= TR.length;
  const act = TE.map(r => r.yLogSVR);
  const pModel = TE.map(r => M.predict(r.x));
  const pNo = TE.map(r => Mno.predict(dropMirror(r.x)));
  const pTrail = TE.map(r => r.pLogSVR);
  const pCalib = TE.map(r => calib(r.pLogSVR));
  const pUncond = TE.map(() => ymean);
  const maeModel = mae(pModel, act), maeNo = mae(pNo, act), maeTrail = mae(pTrail, act), maeCalib = mae(pCalib, act), maeUncond = mae(pUncond, act);
  const wcModel = withinCorr(TE, r => M.predict(r.x)), wcCalib = withinCorr(TE, r => calib(r.pLogSVR)), wcNo = withinCorr(TE, r => Mno.predict(dropMirror(r.x)));
  // 방향 판별: 예측 logSVR 상위 1/3(하방편중 예측)군의 향후 상승률
  const order = TE.map((r, i) => [pModel[i], i]).sort((a, b) => b[0] - a[0]);
  const k = Math.floor(order.length / 3);
  let topUp = 0, botUp = 0;
  for (let i = 0; i < k; i++) if (TE[order[i][1]].fwdRet > 0) topUp++;
  for (let i = order.length - k; i < order.length; i++) if (TE[order[i][1]].fwdRet > 0) botUp++;
  const predDirCorr = corr(pModel, TE.map(r => r.fwdRet));
  const labelDirCorr = corr(act, TE.map(r => r.fwdRet));
  const maeGainCalib = (maeCalib - maeModel) / maeCalib * 100;
  const maeGainUncond = (maeUncond - maeModel) / maeUncond * 100;
  const featBeats = maeGainCalib > 1.0 && (wcModel - wcCalib) > 0.01;
  return { label, n: TE.length, ymean, maeModel, maeNo, maeTrail, maeCalib, maeUncond,
    wcModel, wcCalib, wcNo, maeGainCalib, maeGainUncond, featBeats,
    topUp: topUp / k, botUp: botUp / k, k, predDirCorr, labelDirCorr };
}

// ═══════════ 실행 ═══════════
function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  console.log("=== 실현 왜도/꼬리 비대칭 새 축 정직 검증 (일봉 " + files.length + "종 · OOS · 3차 모멘트) ===");
  console.log("피처 11: [0]과거왜도(미러) [1]과거logSVR(미러) [2]단기왜도 [3-5]vol비 [6]atr [7]rng [8]v20 [9]모멘텀(방향) [10]vov\n");

  for (const H of HS) {
    const rows = buildRows(files, dir, H);
    console.log("──────────── 지평 H=" + H + "봉 · 총 " + rows.length + "시점 (train " + rows.filter(r => r._tr).length + "/test " + rows.filter(r => !r._tr).length + ") ────────────");

    // ── 타깃(a) 분류: 왜도 부호 ──
    const s = evalSkewSign(rows, "종목내 60/40");
    console.log("\n[타깃a] 향후 " + H + "봉 왜도 부호 (1=우편향/멜트업, 0=좌편향/크래시)");
    console.log("  양성률(우편향) " + P(s.posRate) + " · 다수결 " + P(s.base) + " · 지속성(과거왜도부호) " + P(s.pers));
    console.log("  정확도  전체 " + P(s.accF) + " (vs다수결 " + (s.accF - s.base >= 0 ? "+" : "") + ((s.accF - s.base) * 100).toFixed(1) + "%p, vs지속성 " + (s.accF - s.pers >= 0 ? "+" : "") + ((s.accF - s.pers) * 100).toFixed(1) + "%p)" + (s.beat ? "  ✓두기준초과" : "  (미달)"));
    console.log("  소거    no-mirror " + P(s.accN) + " · mirror-only " + P(s.accO) + "  → 전체−nomirror " + ((s.accF - s.accN) * 100).toFixed(1) + "%p");
    console.log("  소거    vol구조-only " + P(s.accV) + " (기존축) · 비대칭전용-only " + P(s.accA) + "  → vol-only가 다수결 대비 " + (s.accV - s.base >= 0 ? "+" : "") + ((s.accV - s.base) * 100).toFixed(1) + "%p, 비대칭전용 " + (s.accA - s.base >= 0 ? "+" : "") + ((s.accA - s.base) * 100).toFixed(1) + "%p");
    console.log("  방향판별 예측=좌편향군 상승률 " + P(s.leftUp) + "(n=" + s.leftN + ") · 예측=우편향군 " + P(s.rightUp) + "(n=" + s.rightN + ") | 예측확률↔상승 상관 " + s.probFwdCorr.toFixed(3) + " · 타깃↔방향오염 " + s.labelDir.toFixed(3));

    // 종목외 walk-forward (분류)
    const setA = files.filter((_, i) => i % 2 === 0), setB = files.filter((_, i) => i % 2 === 1);
    const rowsA = buildRows(setA, dir, H).map(r => ({ ...r, _tr: true })).concat(buildRows(setB, dir, H).map(r => ({ ...r, _tr: false })));
    const sOut = evalSkewSign(rowsA, "종목외");
    console.log("  [종목외] 전체 " + P(sOut.accF) + " (vs다수결 " + (sOut.accF - sOut.base >= 0 ? "+" : "") + ((sOut.accF - sOut.base) * 100).toFixed(1) + "%p, vs지속성 " + (sOut.accF - sOut.pers >= 0 ? "+" : "") + ((sOut.accF - sOut.pers) * 100).toFixed(1) + "%p)" + (sOut.beat ? "  ✓" : "  (미달)"));

    // ── 타깃(b) 회귀: log 준분산비 ──
    const g = evalLogSVR(rows, "종목내 60/40");
    console.log("\n[타깃b] 향후 " + H + "봉 log(DSV/USV) — 하방/상방 준분산비 (양수=하방편중)");
    console.log("  " + "방법".padEnd(14) + "MAE".padStart(8) + "종목내상관".padStart(12));
    console.log("  " + "무조건평균".padEnd(14) + g.maeUncond.toFixed(4).padStart(8) + "0.000".padStart(12));
    console.log("  " + "trailing".padEnd(14) + g.maeTrail.toFixed(4).padStart(8) + "".padStart(12));
    console.log("  " + "보정trailing".padEnd(14) + g.maeCalib.toFixed(4).padStart(8) + g.wcCalib.toFixed(3).padStart(12));
    console.log("  " + "no-mirror".padEnd(14) + g.maeNo.toFixed(4).padStart(8) + g.wcNo.toFixed(3).padStart(12));
    console.log("  " + "모델(전체)".padEnd(14) + g.maeModel.toFixed(4).padStart(8) + g.wcModel.toFixed(3).padStart(12));
    console.log("  → 모델 vs 무조건: MAE -" + g.maeGainUncond.toFixed(1) + "% · vs 보정trailing: MAE " + (g.maeGainCalib >= 0 ? "-" : "+") + Math.abs(g.maeGainCalib).toFixed(1) + "% · 종목내상관Δ(모델−보정) " + (g.wcModel - g.wcCalib >= 0 ? "+" : "") + (g.wcModel - g.wcCalib).toFixed(3) + (g.featBeats ? "  ✓피처순증분" : "  (미달)"));
    console.log("  방향판별 예측 상위1/3(하방편중)군 상승률 " + P(g.topUp) + " · 하위1/3군 " + P(g.botUp) + "(각 n=" + g.k + ") | 예측↔방향 상관 " + g.predDirCorr.toFixed(3) + " · 타깃↔방향오염 " + g.labelDirCorr.toFixed(3));

    const gOut = evalLogSVR(rowsA, "종목외");
    console.log("  [종목외] 모델 MAE " + gOut.maeModel.toFixed(4) + " vs 보정trailing " + gOut.maeCalib.toFixed(4) + " (MAE " + (gOut.maeGainCalib >= 0 ? "-" : "+") + Math.abs(gOut.maeGainCalib).toFixed(1) + "%) · 종목내상관Δ " + (gOut.wcModel - gOut.wcCalib >= 0 ? "+" : "") + (gOut.wcModel - gOut.wcCalib).toFixed(3) + (gOut.featBeats ? "  ✓" : "  (미달)"));
    console.log("");
  }

  console.log("판정 기준: 분류=다수결&지속성 둘 다 +1%p초과 & 방향군상승률≈50% / 회귀=보정trailing MAE -1%초과 & 종목내상관Δ +0.01초과 & 방향상관≈0");
}
main();
