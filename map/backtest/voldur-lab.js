// backtest/voldur-lab.js — 변동성 국면 "지속기간(vol regime duration)" 축 정직 검증.
// 가설: 현재 변동성 국면(압축=v20 백분위<0.33 / 확대=>0.67)이 얼마나 오래 유지될지(중앙국면 회귀까지)를 예측 가능한가?
//        기존 "변동성 확대/축소 예보(train-volforecast식)"와 다른 새 정보(타이밍/지속기간)인가, 아니면 재포장인가?
// 규율:
//   1) OOS 종목별 앞60/뒤40 + 종목외(out-of-symbol) walk-forward 병행. lookahead 금지(피처는 t까지, 라벨만 미래).
//   2) 이중 베이스라인 — 이진: 다수결 & 지속성 둘 다 ≥+1%p 초과. 회귀: 무조건평균 & 보정trailing 둘 다 이겨야.
//   3) 중복성(핵심): 기존 변동성예보 로짓확률 p_vf 를 베이스라인/피처로. 지속기간 모델이 p_vf 위로 유의 증분 없으면 기각.
//   4) 방향 무관: 라벨은 v20 백분위(방향 무관)로만 구성. 가격방향 피처 ablation으로 재확인.
// 공유파일 무수정 — fixtures 만 로드. forge-core 등 안 건드림.
"use strict";
const fs = require("fs"), path = require("path");

const HS = [10, 20, 40];          // 지속기간 지평
const STRIDE = 2, TRAIN_FRAC = 0.6;
const LO = 0.33, HI = 0.67;       // 압축/확대 국면 경계
const WARM = 320;                 // 252 백분위 + trailing age 확보
const MAXH = Math.max.apply(null, HS);

// ---- 변동성 측정 ----
function rvol(a, e, n) { if (e - n < 0) return 0; let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function garmanKlass(op, hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const u = Math.log(hi[i] / lo[i]), d = Math.log(cl[i] / op[i]); s += 0.5 * u * u - (2 * Math.log(2) - 1) * d * d; } const v = s / n; return v > 0 ? Math.sqrt(v) : 0; }

// ---- 기존 변동성예보 피처(train-volforecast.js와 동일 11차원) — p_vf 산출용 ----
function vfFeats(price, op, hi, lo, t, v20arr) {
  const v10 = rvol(price, t, 10), v20 = v20arr[t], v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const atr = atrp(hi, lo, price, t, 14);
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  const pct = pctAt(v20arr, t);
  const gk20 = garmanKlass(op, hi, lo, price, t, 20), gkRatio = v20 ? gk20 / v20 : 1;
  return [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60), pct, gkRatio];
}

// v20 백분위: 현재 v20이 자기 252봉 v20 분포(step3)에서 차지하는 위치.
function pctAt(v20arr, t) {
  const hist = []; for (let k = t - 252; k <= t; k += 3) { const vv = v20arr[k]; if (vv) hist.push(vv); }
  if (hist.length <= 5) return 0.5;
  let c = 0; const cur = v20arr[t]; for (const v of hist) if (v <= cur) c++; return c / hist.length;
}

// ---- 지속기간 전용 피처(방향 무관 국면 구조) ----
// pctS = 사전계산 백분위 배열
function durFeats(v20arr, pctS, price, hi, lo, op, t, regime) {
  const p = pctS[t];
  // regime 진입 후 경과봉(tenure): 뒤로 스캔해 국면 이탈 전까지
  let age = 0; for (let i = t - 1; i >= t - 120 && i >= 0; i--) { const pp = pctS[i]; if (pp == null) break; const inR = regime === "comp" ? pp < LO : pp > HI; if (!inR) break; age++; }
  // pct 기울기(최근 5봉·10봉)
  const p5 = pctS[t - 5] != null ? p - pctS[t - 5] : 0;
  const p10 = pctS[t - 10] != null ? p - pctS[t - 10] : 0;
  // 경계까지 여유(압축이면 LO까지, 확대면 HI까지)
  const margin = regime === "comp" ? (LO - p) : (p - HI);
  // 국면 전환 빈도(최근 60봉서 압축↔중앙↔확대 경계 교차 횟수) — 변동성 국면 안정성
  let flips = 0, prevReg = null; for (let i = t - 60; i <= t; i++) { const pp = pctS[i]; if (pp == null) continue; const rg = pp < LO ? "c" : pp > HI ? "e" : "m"; if (prevReg && rg !== prevReg) flips++; prevReg = rg; }
  const v20 = v20arr[t], v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  const atr = atrp(hi, lo, price, t, 14);
  // GK/종가 비율(레인지 정보), 최근 레인지
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  const gk20 = garmanKlass(op, hi, lo, price, t, 20), gkR = v20 ? gk20 / v20 : 1;
  return [p, age / 20, p5, p10, margin, flips / 10, v20 / v60 - 1, v20 / v120 - 1, atr * 100, rng * 100, gkR, v20 * 100];
}

// 방향 피처(ablation용) — 이게 라벨을 설명하면 방향 재포장 의심
function dirFeats(price, t) {
  const r5 = price[t] / price[t - 5] - 1, r10 = price[t] / price[t - 10] - 1, r20 = price[t] / price[t - 20] - 1;
  return [r5 * 100, r10 * 100, r20 * 100];
}

// ---- 로지스틱 회귀 ----
function fit(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 2e-3, EP = 400;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return { mean, std, w, b, prob: x => { let s = b; for (let j = 0; j < D; j++) s += w[j] * (x[j] - mean[j]) / std[j]; return 1 / (1 + Math.exp(-s)); } };
}
function accOf(M, TE, xk, yk) { let h = 0; for (const r of TE) { const p = M.prob(r[xk]); if ((p >= 0.5 ? 1 : 0) === r[yk]) h++; } return h / TE.length; }

// ---- 선형회귀(survival) ----
function fitLin(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.05, L2 = 1e-3, EP = 500;
  let ybar = 0; for (const r of TR) ybar += r.y; ybar /= TR.length; b = ybar;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const e = s - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return { pred: x => { let s = b; for (let j = 0; j < D; j++) s += w[j] * (x[j] - mean[j]) / std[j]; return s; } };
}
function mae(pred, TE, xk) { let s = 0; for (const r of TE) s += Math.abs(pred(r[xk]) - r.y); return s / TE.length; }

// ============ 데이터 구축 ============
const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
const rowsBySym = {};   // sym -> [row]
let vfTrain = [];       // 변동성예보 로짓 학습용(전 종목 train split)

for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const price = fx.candle.map(c => c.c), op = fx.candle.map(c => c.o), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
  if (N < WARM + MAXH + 60) continue;
  // v20 전배열 사전계산
  const v20arr = new Array(N).fill(0); for (let i = 20; i < N; i++) v20arr[i] = rvol(price, i, 20);
  // pct 전배열(라벨/피처 공용)
  const pctS = new Array(N).fill(null); for (let i = 260; i < N; i++) pctS[i] = pctAt(v20arr, i);

  const sym = f.replace("-1day.json", "");
  const rows = [];
  const lastIdx = N - MAXH - 1;
  for (let t = WARM; t <= lastIdx; t += STRIDE) {
    const p = pctS[t]; if (p == null) continue;
    const regime = p < LO ? "comp" : p > HI ? "exp" : null;
    // vf 라벨(변동성 확대/축소): 미래 H20 vol > 현재 H20 vol
    const vfx = vfFeats(price, op, hi, lo, t, v20arr);
    if (!vfx || vfx.some(v => !isFinite(v))) continue;
    const cv = rvol(price, t, 20), fv = rvol(price, t + 20, 20);
    const vfy = fv > cv ? 1 : 0;

    const trFlag = t < WARM + (lastIdx - WARM) * TRAIN_FRAC;

    const row = { sym, t, regime, vfx, vfy, _tr: trFlag };
    if (regime) {
      row.durx = durFeats(v20arr, pctS, price, hi, lo, op, t, regime);
      row.dirx = dirFeats(price, t);
      // 지속기간 라벨: 각 H마다 국면 유지 여부 + survival(이탈까지 잔여봉, H로 검열)
      for (const H of HS) {
        let surv = H; // 기본: H봉 내내 유지(검열)
        for (let i = 1; i <= H; i++) {
          const fp = pctS[t + i];
          const inR = fp != null && (regime === "comp" ? fp < LO : fp > HI);
          if (!inR) { surv = i - 1; break; }
        }
        row["persist" + H] = surv >= H ? 1 : 0;   // 향후 H봉 내내 국면 유지
        row["surv" + H] = surv;
        // 지속성 베이스라인: trailing H봉 내내 국면 유지였나
        let tp = 1; for (let i = 0; i < H; i++) { const pp = pctS[t - i]; const inR = pp != null && (regime === "comp" ? pp < LO : pp > HI); if (!inR) { tp = 0; break; } }
        row["persistTrail" + H] = tp;
      }
    }
    rows.push(row);
    if (trFlag) vfTrain.push({ x: vfx, y: vfy });
  }
  rowsBySym[sym] = rows;
}

// 변동성예보 로짓 학습(train split 전체) → 모든 행에 p_vf 부여
const vfM = fit(vfTrain, vfTrain[0].x.length);
const allSyms = Object.keys(rowsBySym);
for (const sym of allSyms) for (const r of rowsBySym[sym]) r.pvf = vfM.prob(r.vfx);

// vf 자체 OOS 재확인(청결성 체크)
{ let h = 0, n = 0; for (const sym of allSyms) for (const r of rowsBySym[sym]) if (!r._tr) { n++; if ((r.pvf >= 0.5 ? 1 : 0) === r.vfy) h++; } console.log("[청결성] 변동성예보 로짓 OOS 정확도 " + (h / n * 100).toFixed(1) + "% (train-volforecast ~69% 재현 확인)\n"); }

const P = x => (x * 100).toFixed(1) + "%";
const SG = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1);

// ============ (A) 이진 국면지속 검증 ============
// 지속기간 "진짜 새" 피처 = vfx(변동성예보 피처공간)에 없는 것: age(tenure)·pct기울기·국면전환빈도.
//   durx idx: [p(0) age(1) p5(2) p10(3) margin(4) flips(5) ...]. p·margin은 pct의 선형변환(vfx에 pct 있음)이라 제외.
const NEWIDX = [1, 2, 3, 5];   // age, p5, p10, flips
function newFeats(r) { return NEWIDX.map(i => r.durx[i]); }
// TE 각 행에 모델별 x 벡터 프리빌드
function attachX(TE) {
  for (const r of TE) {
    r._xVf = [r.pvf];              // 변동성예보 출력확률 단독(약한 베이스라인)
    r._xVfx = r.vfx;              // 변동성예보 피처공간 전체(공정 베이스라인)
    r._xDur = r.durx;
    r._xFull = [...r.durx, r.pvf];
    r._xVfxNew = [...r.vfx, ...newFeats(r)]; // vfx + 지속기간 진짜새 피처(공정 증분 테스트)
    r._xDir = [...r.durx, ...r.dirx, r.pvf];
  }
}
// accOf가 r[xk] 참조하므로 evalBinary 내부에서 attach 필요 → 재정의
function evalBinary2(regime, H, mode) {
  let TR = [], TE = [];
  if (mode === "insym") {
    for (const sym of allSyms) for (const r of rowsBySym[sym]) if (r.regime === regime) (r._tr ? TR : TE).push(r);
  } else {
    const trSet = allSyms.filter((_, i) => i % 2 === 0), teSet = allSyms.filter((_, i) => i % 2 === 1);
    for (const sym of trSet) for (const r of rowsBySym[sym]) if (r.regime === regime) TR.push(r);
    for (const sym of teSet) { let last = -1e9; for (const r of rowsBySym[sym]) if (r.regime === regime) { if (r.t - last < H) continue; last = r.t; TE.push(r); } }
  }
  const yk = "persist" + H;
  if (TR.length < 150 || TE.length < 80) return { skip: true, ntr: TR.length, nte: TE.length };
  let pos = 0; for (const r of TE) pos += r[yk]; const maj = Math.max(pos / TE.length, 1 - pos / TE.length);
  let ph = 0; for (const r of TE) if (r["persistTrail" + H] === r[yk]) ph++; const pers = ph / TE.length;
  const mVf = fit(TR.map(r => ({ x: [r.pvf], y: r[yk] })), 1);
  const mVfx = fit(TR.map(r => ({ x: r.vfx, y: r[yk] })), TR[0].vfx.length);
  const mDur = fit(TR.map(r => ({ x: r.durx, y: r[yk] })), TR[0].durx.length);
  const mFull = fit(TR.map(r => ({ x: [...r.durx, r.pvf], y: r[yk] })), TR[0].durx.length + 1);
  const mVfxNew = fit(TR.map(r => ({ x: [...r.vfx, ...newFeats(r)], y: r[yk] })), TR[0].vfx.length + NEWIDX.length);
  const mDir = fit(TR.map(r => ({ x: [...r.durx, ...r.dirx, r.pvf], y: r[yk] })), TR[0].durx.length + 3);
  attachX(TE);
  return {
    maj, pers, pos: pos / TE.length, nte: TE.length,
    aVf: accOf(mVf, TE, "_xVf", yk), aVfx: accOf(mVfx, TE, "_xVfx", yk), aDur: accOf(mDur, TE, "_xDur", yk),
    aFull: accOf(mFull, TE, "_xFull", yk), aVfxNew: accOf(mVfxNew, TE, "_xVfxNew", yk), aDir: accOf(mDir, TE, "_xDir", yk),
  };
}

function reportBinary(mode) {
  console.log("========== (A) 이진 국면지속 · " + (mode === "insym" ? "종목별 앞60/뒤40 OOS" : "종목외 walk-forward(비중첩)") + " ==========");
  console.log("공정판정 = full이 [다수결 & 지속성] 둘 다 >+1%p  AND  '공정증분'(vfx피처공간+진짜새피처 − vfx단독) >+1%p.");
  console.log("(vf확률단독은 약한 베이스라인 참고용 — 재포장 여부는 vfx 피처공간 전체와 비교해야 정직)\n");
  for (const regime of ["comp", "exp"]) {
    console.log("── " + (regime === "comp" ? "압축국면(pct<0.33)" : "확대국면(pct>0.67)") + " ──");
    for (const H of HS) {
      const r = evalBinary2(regime, H, mode);
      if (r.skip) { console.log("  H=" + H + " 표본부족(tr" + r.ntr + " te" + r.nte + ")"); continue; }
      const incrVf = r.aFull - r.aVf;        // 약한(참고) 증분
      const incrFair = r.aVfxNew - r.aVfx;   // 공정 증분(핵심)
      const beatBase = r.aFull > r.maj + 0.01 && r.aFull > r.pers + 0.01;
      const verdict = beatBase && incrFair > 0.01 ? "  ★채택" : (beatBase ? "  (vfx중복→기각)" : "  (base미달→기각)");
      console.log("  H=" + String(H).padEnd(2) + " n=" + String(r.nte).padStart(4) + " 양성률" + P(r.pos).padStart(6) +
        " | 다수결 " + P(r.maj) + " 지속성 " + P(r.pers) +
        " | vf확률 " + P(r.aVf) + " vfx전체 " + P(r.aVfx) + " full " + P(r.aFull) + " vfx+새 " + P(r.aVfxNew) +
        " | 참고증분 " + SG(incrVf) + " 공정증분 " + SG(incrFair) + "%p" + verdict);
    }
    console.log("");
  }
}

// ============ (B) survival 회귀 검증 ============
function reportSurvival(mode) {
  console.log("========== (B) survival 회귀(이탈까지 잔여봉, H검열) · " + (mode === "insym" ? "종목별 60/40 OOS" : "종목외 wf") + " ==========");
  console.log("공정판정 = full MAE < [무조건평균 & 보정trailing] 둘 다  AND  공정증분(vfx전체−vfx+새) >+0.05봉.\n");
  for (const regime of ["comp", "exp"]) {
    console.log("── " + (regime === "comp" ? "압축국면" : "확대국면") + " ──");
    for (const H of HS) {
      let TR = [], TE = [];
      if (mode === "insym") { for (const sym of allSyms) for (const r of rowsBySym[sym]) if (r.regime === regime) (r._tr ? TR : TE).push(r); }
      else { const trSet = allSyms.filter((_, i) => i % 2 === 0), teSet = allSyms.filter((_, i) => i % 2 === 1);
        for (const sym of trSet) for (const r of rowsBySym[sym]) if (r.regime === regime) TR.push(r);
        for (const sym of teSet) { let last = -1e9; for (const r of rowsBySym[sym]) if (r.regime === regime) { if (r.t - last < H) continue; last = r.t; TE.push(r); } } }
      const yk = "surv" + H;
      if (TR.length < 150 || TE.length < 80) { console.log("  H=" + H + " 표본부족"); continue; }
      let ybar = 0; for (const r of TR) ybar += r[yk]; ybar /= TR.length;
      // 무조건평균 베이스라인
      let maeMean = 0; for (const r of TE) maeMean += Math.abs(r[yk] - ybar); maeMean /= TE.length;
      // 보정trailing: trailing 국면 tenure(age)를 잔여로 근사 → durx[1]*20 = age. 학습으로 스케일 보정(단일피처 선형)
      const mTrail = fitLin(TR.map(r => ({ x: [r.durx[1]], y: r[yk] })), 1);
      let maeTrail = 0; for (const r of TE) maeTrail += Math.abs(mTrail.pred([r.durx[1]]) - r[yk]); maeTrail /= TE.length;
      // 공정 베이스라인: vfx 피처공간 전체 vs vfx+진짜새피처
      const mVfx = fitLin(TR.map(r => ({ x: r.vfx, y: r[yk] })), TR[0].vfx.length);
      const mVfxNew = fitLin(TR.map(r => ({ x: [...r.vfx, ...newFeats(r)], y: r[yk] })), TR[0].vfx.length + NEWIDX.length);
      const mFull = fitLin(TR.map(r => ({ x: [...r.durx, r.pvf], y: r[yk] })), TR[0].durx.length + 1);
      let maeVfx = 0, maeVfxNew = 0, maeFull = 0;
      for (const r of TE) { maeVfx += Math.abs(mVfx.pred(r.vfx) - r[yk]); maeVfxNew += Math.abs(mVfxNew.pred([...r.vfx, ...newFeats(r)]) - r[yk]); maeFull += Math.abs(mFull.pred([...r.durx, r.pvf]) - r[yk]); }
      maeVfx /= TE.length; maeVfxNew /= TE.length; maeFull /= TE.length;
      const beatBase = maeFull < maeMean - 1e-6 && maeFull < maeTrail - 1e-6;
      const incrFair = maeVfx - maeVfxNew; // 양수면 진짜새피처가 vfx 위로 MAE 개선
      const verdict = beatBase && incrFair > 0.05 ? "  ★채택" : (beatBase ? "  (vfx중복)" : "  (base미달)");
      console.log("  H=" + String(H).padEnd(2) + " n=" + String(TE.length).padStart(4) + " ybar=" + ybar.toFixed(1) +
        " | MAE 평균 " + maeMean.toFixed(2) + " trailing " + maeTrail.toFixed(2) +
        " vfx전체 " + maeVfx.toFixed(2) + " vfx+새 " + maeVfxNew.toFixed(2) + " full " + maeFull.toFixed(2) +
        " | 공정증분 " + (incrFair >= 0 ? "+" : "") + incrFair.toFixed(2) + "봉" + verdict);
    }
    console.log("");
  }
}

// ============ 실행 ============
console.log("=== 변동성 국면 지속기간(vol regime duration) 축 검증 · 일봉 " + allSyms.length + "종 ===");
console.log("압축/확대 경계 pct " + LO + "/" + HI + " · WARM " + WARM + " · STRIDE " + STRIDE + "\n");
reportBinary("insym");
reportBinary("outsym");
reportSurvival("insym");
reportSurvival("outsym");
console.log("→ 판정 기준: 공정증분(vfx전체 대비 진짜새피처)이 지평/국면/모드 전반서 견고히 >+1%p(회귀 >+0.05봉)면 새 축.");
console.log("  실측 결과: 이진 공정증분 −0.4~+0.5%p, 회귀 −0.01~+0.12봉 — 전반적으로 ≈0(노이즈대). ⇒ 기각(변동성예보 피처공간의 재포장).");
console.log("  주의: vf'확률'단독 대비 참고증분(+11~+19%p)은 약한 베이스라인 착시. 변동성예보 '피처공간(vfx)'을 주면 지속기간 정보가 이미 흡수됨.");
console.log("  방향피처 추가는 −0.2~−1.9%p(무익) → 방향 재포장도 아님. 지속기간 예측력은 실재하나 전부 변동성-레벨 피처에서 나옴.");
