// backtest/excursion-lab.js — MFE/MAE 여정(path excursion) 예측 후보의 정직 검증.
// 가설: 각 시점 진입 후 향후 H봉 동안 MFE(위로 최대이동)·MAE(아래로 최대이동)의 비율/형상을
//   변동성구조+가격구조 피처로 예측 가능한가? 특히 MAE(경로 중 최대 역행)가 ddRisk(엔드포인트/종가 낙폭)
//   보다 손절 배치에 유용한 "새 정보"인지.
// 정의(방향중립): MFE = max_{i∈t+1..t+H}(high_i/entry − 1),  MAE = max(1 − low_i/entry).  entry = close_t.
// 관문(전부 통과해야 채택):
//   1) OOS 종목별 앞60/뒤40 + 종목외(홀드아웃 종목) 병행. lookahead 금지.
//   2) 회귀: 무조건평균 baseline & 보정trailing(a·trail+b) baseline 둘 다 유의 초과(R²>0).
//      이진: 다수결 & 지속성 둘 다 ≥ +1%p.
//   3) ddRisk 중복성: ddRisk 예측(엔드포인트 종가낙폭)을 baseline/피처로 두고 MFE/MAE가 그 위로 증분을 주는가.
//   4) 방향 판별: 예측 비율이 사실 방향(효율시장=불가) 예측의 재포장인지 — 예측군별 forward return 무차별이어야.
// 규율: 일봉 한정. 공유파일 무수정(forge-core 등). fixtures만 로드. 과장 금지 — 관문 미달 시 정직 기각.
"use strict";
const fs = require("fs"), path = require("path");

const HS = [20, 40], STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6, LAMBDA = 1e-1, EPS = 0.002;

// ── 변동성 구조 10피처 (train-ddrisk / upside 동일) ──
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function sma(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += a[i]; return s / n; }
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
// ── 가격 구조 4피처 (방향/추세 — 방향 누수 여부 확인용) ──
function priceFeats(price, t) {
  const mom20 = price[t] / price[t - 20] - 1, mom60 = price[t] / price[t - 60] - 1;
  let mn = Infinity, mx = -Infinity; for (let i = t - 59; i <= t; i++) { if (price[i] < mn) mn = price[i]; if (price[i] > mx) mx = price[i]; }
  const rangePos = mx > mn ? (price[t] - mn) / (mx - mn) : 0.5;
  const distMA = price[t] / sma(price, t, 100) - 1;
  return [mom20, mom60, rangePos, distMA];
}

// ── 릿지 회귀 (표준화 X·중심화 y·정규방정식) ──
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
// ── 로지스틱 (표준화·L2) ──
function fitLogit(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 2e-3, EP = 400;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return { mean, std, w, b };
}
function predLogit(M, x) { let s = M.b; for (let j = 0; j < x.length; j++) s += M.w[j] * (x[j] - M.mean[j]) / M.std[j]; return 1 / (1 + Math.exp(-s)); }

// ── OOS R² 헬퍼: 모델 SSE vs baseline SSE ──
function sse(rows, predFn) { let s = 0; for (const r of rows) { const e = r.y - predFn(r); s += e * e; } return s; }

// ════════════════════ 데이터 구축 ════════════════════
const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json")).sort();
const MAXH = Math.max.apply(null, HS);
// byH[H] = 전 종목 통합 행. 각 행에 _tr(종목내 앞60/뒤40)·_sym(종목 인덱스) 표식.
const byH = {}; for (const H of HS) byH[H] = [];
let symIdx = 0, usedSyms = [];
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
  if (N < WARM + MAXH + 40) continue;
  const local = {}; for (const H of HS) local[H] = [];
  for (let t = WARM; t <= N - MAXH - 1; t += STRIDE) {
    const vf = volFeats(price, hi, lo, t); if (!vf) continue;
    const pf = priceFeats(price, t);
    const x = vf.concat(pf); if (x.some(v => !isFinite(v))) continue;
    for (const H of HS) {
      const thr = 0.05 * Math.sqrt(H / 20);   // 지평스케일 문턱 (H20→5%·H40→7.1%)
      // 미래 경로 통계 (lookahead: 오직 t+1..t+H)
      let mfe = 0, mae = 0, loClose = 0;
      for (let i = t + 1; i <= t + H; i++) {
        const upH = hi[i] / price[t] - 1; if (upH > mfe) mfe = upH;
        const dnL = 1 - lo[i] / price[t]; if (dnL > mae) mae = dnL;
        const rc = price[i] / price[t] - 1; if (rc < loClose) loClose = rc;  // 종가 경로 최저(ddRisk 기준)
      }
      const fwdRet = price[t + H] / price[t] - 1;
      const logRatio = Math.log((mfe + EPS) / (mae + EPS));       // (a) 여정 비대칭
      const logTotal = Math.log(mfe + mae + EPS);                 // 총 여정폭 (변동성 성분)
      // 과거 경로 통계 (trailing baseline: 오직 t-H..t)
      let pmfe = 0, pmae = 0; const base0 = price[t - H];
      for (let i = t - H + 1; i <= t; i++) { const u = hi[i] / base0 - 1; if (u > pmfe) pmfe = u; const d = 1 - lo[i] / base0; if (d > pmae) pmae = d; }
      const trailRatio = Math.log((pmfe + EPS) / (pmae + EPS));
      const trailTotal = Math.log(pmfe + pmae + EPS);
      const ddY = loClose <= -thr ? 1 : 0;            // ddRisk 타깃(종가 경로 최저)
      const maeY = mae >= thr ? 1 : 0;                // MAE 이진(저가 경로 최저)
      const pDDY = (function () { let l = 0; for (let i = t - H + 1; i <= t; i++) { const rc = price[i] / base0 - 1; if (rc < l) l = rc; } return l <= -thr ? 1 : 0; })(); // 지속성 baseline(과거 ddY)
      const pMAEY = (function () { let m = 0; for (let i = t - H + 1; i <= t; i++) { const d = 1 - lo[i] / base0; if (d > m) m = d; } return m >= thr ? 1 : 0; })();
      local[H].push({ x, vf, mfe, mae, fwdRet, thr, logRatio, logTotal, trailRatio, trailTotal, ddY, maeY, pDDY, pMAEY });
    }
  }
  for (const H of HS) { const cut = Math.floor(local[H].length * TRAIN_FRAC); local[H].forEach((r, i) => { r._tr = i < cut; r._sym = symIdx; byH[H].push(r); }); }
  usedSyms.push(f.replace("-1day.json", "")); symIdx++;
}
const NSYM = symIdx;
const P = x => (x * 100).toFixed(1) + "%";
const F3 = x => (x >= 0 ? "+" : "") + x.toFixed(3);

console.log("=== MFE/MAE 여정(path excursion) 예측 정직 검증 ===");
console.log("일봉 " + NSYM + "종 · OOS 종목내 앞60/뒤40 · 14피처(변동성10+가격4) · entry=close_t · 방향중립 정의\n");

// ════════════════════ §1 타깃 분포 / base rate ════════════════════
console.log("── §1 타깃 분포 (전 종목 통합) ──");
for (const H of HS) {
  const R = byH[H];
  const mMfe = R.reduce((a, r) => a + r.mfe, 0) / R.length, mMae = R.reduce((a, r) => a + r.mae, 0) / R.length;
  const mRatio = R.reduce((a, r) => a + r.logRatio, 0) / R.length;
  const maeRate = R.reduce((a, r) => a + r.maeY, 0) / R.length, ddRate = R.reduce((a, r) => a + r.ddY, 0) / R.length;
  console.log("H" + H + " (문턱 " + (5 * Math.sqrt(H / 20)).toFixed(1) + "%): 평균MFE " + P(mMfe) + " · 평균MAE " + P(mMae) +
    " · 평균log(MFE/MAE) " + F3(mRatio) + " · MAE>문턱 " + P(maeRate) + " · ddRisk(종가) " + P(ddRate) + " · N=" + R.length);
}

// ════════════════════ §2 회귀: log(MFE/MAE) 예측 ════════════════════
// baseline1=무조건평균(train ym), baseline2=보정trailing(a·trailRatio+b). 모델=14피처 릿지.
// R²_vs_mean, R²_vs_trail 둘 다 >0(유의)이어야 관문2 통과.
function regEval(rows, yKey, trailKey) {
  const TR = rows.filter(r => r._tr).map(r => ({ x: r.x, y: r[yKey] }));
  const TE = rows.filter(r => !r._tr).map(r => ({ x: r.x, y: r[yKey], trail: r[trailKey] }));
  if (TR.length < 100 || TE.length < 50) return null;
  const M = fitRidge(TR, TR[0].x.length);
  // trailing baseline 적합 (train에서 a·trail+b)
  const TRt = rows.filter(r => r._tr).map(r => ({ x: [r[trailKey]], y: r[yKey] }));
  const Mt = fitRidge(TRt, 1);
  const meanY = TR.reduce((a, r) => a + r.y, 0) / TR.length;
  const sseM = sse(TE, r => predRidge(M, r.x));
  const sseMean = sse(TE, () => meanY);
  const sseTrail = sse(TE, r => predRidge(Mt, [r.trail]));
  return { r2mean: 1 - sseM / sseMean, r2trail: 1 - sseM / sseTrail, sseM, sseMean, sseTrail, n: TE.length,
    predFn: r => predRidge(M, r.x), rowsTE: rows.filter(r => !r._tr) };
}
console.log("\n── §2 회귀 log(MFE/MAE) [비대칭] — OOS 종목내 앞60/뒤40 ──");
console.log("관문2: R²(vs 무조건평균)>0 AND R²(vs 보정trailing)>0 둘 다");
const regRatio = {};
for (const H of HS) {
  const r = regEval(byH[H], "logRatio", "trailRatio"); regRatio[H] = r;
  const pass = r.r2mean > 0.005 && r.r2trail > 0.005;
  console.log("  H" + H + ": R²(vs 평균) " + F3(r.r2mean) + " · R²(vs trailing) " + F3(r.r2trail) + (pass ? "  ✓" : "  ✗(기각권)"));
}

// ════════════════════ §3 분해: 총여정폭(변동성) vs 비대칭(방향) ════════════════════
// log(MFE+MAE)=총폭(변동성 성분,예측가능 기대) / log(MFE/MAE)=비대칭(방향 성분,불가능 기대)
console.log("\n── §3 분해: 총여정폭 vs 비대칭 (어느 성분이 예측 가능한가) ──");
for (const H of HS) {
  const rt = regEval(byH[H], "logTotal", "trailTotal");
  const rr = regRatio[H];
  console.log("  H" + H + ": 총여정폭 R²(vs평균) " + F3(rt.r2mean) + " / 비대칭 R²(vs평균) " + F3(rr.r2mean) +
    "   → " + (rt.r2mean > rr.r2mean + 0.02 ? "총폭(변동성)만 예측가능·비대칭은 방향" : "혼재"));
}

// ════════════════════ §4 이진 MAE>문턱 + ddRisk 중복성 ════════════════════
// (i) 다수결·지속성 이중 baseline. (ii) ddRisk 중복성: ddY와 maeY 일치율 + MAE 모델이 ddRisk예측 위로 증분 주는가.
console.log("\n── §4 이진 MAE>문턱 — OOS ──");
console.log("관문2: 정확도 ≥ 다수결+1%p AND ≥ 지속성+1%p / 관문3: ddRisk 위 증분");
for (const H of HS) {
  const rows = byH[H];
  const TR = rows.filter(r => r._tr), TE = rows.filter(r => !r._tr);
  const M = fitLogit(TR.map(r => ({ x: r.x, y: r.maeY })), TR[0].x.length);
  let hit = 0, pers = 0, pos = 0; for (const r of TE) { const p = predLogit(M, r.x); if ((p >= 0.5 ? 1 : 0) === r.maeY) hit++; if (r.pMAEY === r.maeY) pers++; if (r.maeY) pos++; }
  const acc = hit / TE.length, persAcc = pers / TE.length, posRate = pos / TE.length, maj = Math.max(posRate, 1 - posRate);
  // ddRisk 중복성: maeY vs ddY 일치율(같은 정보?) + ddRisk예측(pDD)만으로 maeY 예측 vs 풀피처
  let agree = 0; for (const r of TE) if (r.maeY === r.ddY) agree++;
  const Mdd = fitLogit(TR.map(r => ({ x: r.x, y: r.ddY })), TR[0].x.length);  // ddRisk 예측기(종가 낙폭)
  // ddRisk 확률 단일피처로 maeY 예측 (baseline-ddRisk)
  const TRdd1 = TR.map(r => ({ x: [predLogit(Mdd, r.x)], y: r.maeY }));
  const Mdd1 = fitLogit(TRdd1, 1);
  let hitDD = 0; for (const r of TE) { const p = predLogit(Mdd1, [predLogit(Mdd, r.x)]); if ((p >= 0.5 ? 1 : 0) === r.maeY) hitDD++; }
  const accDD = hitDD / TE.length;
  const beat = acc >= maj + 0.01 && acc >= persAcc + 0.01;
  console.log("  H" + H + ": 정확도 " + P(acc) + " · 다수결 " + P(maj) + " · 지속성 " + P(persAcc) + " · 양성률 " + P(posRate) +
    (beat ? "  ✓관문2" : "  ✗관문2"));
  console.log("       ddRisk 중복성: maeY↔ddY 일치율 " + P(agree / TE.length) + " · ddRisk예측만으로 maeY " + P(accDD) +
    " · 풀피처 증분 " + F3(acc - accDD) + "%p" + (acc - accDD > 0.01 ? "" : "  → 증분≈0(중복)"));
}

// ════════════════════ §5 방향 판별 ════════════════════
// 예측 log(MFE/MAE)를 5분위 → 각 분위 realized fwd return(무차별이어야 非방향) & realized ratio(단조면 신호존재).
console.log("\n── §5 방향 판별: 예측비율 5분위별 realized (fwd return 무차별? / 실제비율 단조?) ──");
for (const H of HS) {
  const r = regRatio[H];
  const TE = r.rowsTE.map(row => ({ pred: r.predFn(row), fwd: row.fwdRet, ratio: row.logRatio }));
  TE.sort((a, b) => a.pred - b.pred);
  const q = 5, per = Math.floor(TE.length / q);
  const line = [];
  for (let k = 0; k < q; k++) {
    const seg = TE.slice(k * per, k === q - 1 ? TE.length : (k + 1) * per);
    const mf = seg.reduce((a, x) => a + x.fwd, 0) / seg.length;
    const mr = seg.reduce((a, x) => a + x.ratio, 0) / seg.length;
    line.push({ mf, mr });
  }
  const fwdSpread = line[q - 1].mf - line[0].mf;
  console.log("  H" + H + " (Q1저→Q5고 예측비율):");
  console.log("    realized fwdRet: " + line.map(x => F3(x.mf)).join(" ") + "   (Q5−Q1=" + F3(fwdSpread) + " → " + (Math.abs(fwdSpread) > 0.02 ? "방향 편차 큼=방향재포장 의심" : "무차별") + ")");
  console.log("    realized ratio : " + line.map(x => F3(x.mr)).join(" "));
}

// ════════════════════ §6 종목외(홀드아웃 종목) 병행 ════════════════════
console.log("\n── §6 종목외 OOS (짝수idx 종목 train → 홀수idx 종목 test) ──");
for (const H of HS) {
  const rows = byH[H];
  const TR = rows.filter(r => r._sym % 2 === 0).map(r => ({ x: r.x, y: r.logRatio }));
  const TE = rows.filter(r => r._sym % 2 === 1);
  const M = fitRidge(TR, TR[0].x.length);
  const meanY = TR.reduce((a, r) => a + r.y, 0) / TR.length;
  const sseM = sse(TE.map(r => ({ x: r.x, y: r.logRatio })), r => predRidge(M, r.x));
  const sseMean = sse(TE.map(r => ({ y: r.logRatio })), () => meanY);
  const r2 = 1 - sseM / sseMean;
  // 이진 maeY 종목외
  const Mb = fitLogit(rows.filter(r => r._sym % 2 === 0).map(r => ({ x: r.x, y: r.maeY })), rows[0].x.length);
  let hit = 0, pos = 0, pers = 0; for (const r of TE) { const p = predLogit(Mb, r.x); if ((p >= 0.5 ? 1 : 0) === r.maeY) hit++; if (r.maeY) pos++; if (r.pMAEY === r.maeY) pers++; }
  const acc = hit / TE.length, maj = Math.max(pos / TE.length, 1 - pos / TE.length);
  console.log("  H" + H + ": 비대칭 R²(vs평균) " + F3(r2) + " · MAE이진 정확도 " + P(acc) + " (다수결 " + P(maj) + " · 지속성 " + P(pers / TE.length) + ")");
}

console.log("\n(해석은 리서치 보고 참조 — 각 관문 통과/미달 종합)");
