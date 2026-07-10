// backtest/curve-lab.js — 기존 검증 축(급변 v1.8·변동성예보 v1.8.1)의 멀티지평 곡선화 정직 검증.
// 공유파일 불변. train-spike / ddrisk-horizons / train-volforecast 패턴을 복제해 격자/지평 스윕.
//   (1) 급변 곡선   : (2σ/2.5σ/3σ) × (10/20/40봉) 격자 스윕 — 각 셀 OOS·다수결·지속성·양성률 + 배포계수
//   (2) 변동성 예보 : H=10/20/40 각각 OOS — 지평별 계수, 짧은/긴 지평서 예측력 유지 여부
// 규율: OOS(종목별 앞60%train/뒤40%test) · lookahead 금지 · 다수결&지속성 둘 다 ≥+1%p 초과해야 채택.
"use strict";
const fs = require("fs"), path = require("path");
const STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6;

// ── 공유 랩과 동일한 변동성 구조 피처 ──
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function garmanKlass(op, hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const u = Math.log(hi[i] / lo[i]), d = Math.log(cl[i] / op[i]); s += 0.5 * u * u - (2 * Math.log(2) - 1) * d * d; } const v = s / n; return v > 0 ? Math.sqrt(v) : 0; }

// 급변 곡선: 10피처(train-spike·tail-lab 동일)
function feats10(price, hi, lo, t) {
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
// 변동성 예보: 11피처(train-volforecast 동일 — gkRatio 추가)
function feats11(price, op, hi, lo, t) {
  const base = feats10(price, hi, lo, t); if (!base) return null;
  const v20 = rvol(price, t, 20);
  const gk20 = garmanKlass(op, hi, lo, price, t, 20), gkRatio = v20 ? gk20 / v20 : 1;
  return base.concat([gkRatio]);
}

function fit(TR, D) {
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
// key=타깃 라벨, baseKey=지속성 라벨. OOS 정확도·다수결·지속성·양성률.
function evalTarget(rows, key, baseKey) {
  const TR = rows.filter(r => r._tr && r[key] != null).map(r => ({ x: r.x, y: r[key] })), TE = rows.filter(r => !r._tr && r[key] != null);
  if (TR.length < 100 || TE.length < 50) return null;
  const D = TR[0].x.length, M = fit(TR, D), z = x => x.map((v, j) => (v - M.mean[j]) / M.std[j]);
  let hit = 0, bhit = 0, pos = 0;
  for (const r of TE) { let s = M.b; const zx = z(r.x); for (let j = 0; j < D; j++) s += M.w[j] * zx[j]; const call = s >= 0 ? 1 : 0; if (call === r[key]) hit++; if (r[baseKey] === r[key]) bhit++; if (r[key] === 1) pos++; }
  const acc = hit / TE.length, pers = bhit / TE.length, posRate = pos / TE.length, base = Math.max(posRate, 1 - posRate);
  return { acc, pers, base, posRate, beat: acc > base + 0.01 && acc > pers + 0.01, n: TE.length };
}
// 채택 셀 배포계수(전체학습). MEAN/STD는 피처·데이터 공유 → 곡선 1개만 저장하면 됨.
function fitFull(rows, key) {
  const TRr = rows.filter(r => r[key] != null).map(r => ({ x: r.x, y: r[key] }));
  return fit(TRr, TRr[0].x.length);
}
const P = x => (x * 100).toFixed(1) + "%";
const R = a => a.map(x => +x.toFixed(5));

const KS = [2.0, 2.5, 3.0];      // 급변 배수(σ)
const HS = [10, 20, 40];         // 지평(봉) — 약 2주/1달/2달
const MAXH = Math.max.apply(null, HS);

const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));

// ═══ (1) 급변 곡선: (K × H) 격자 ═══
const spikeRows = [];
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
  if (N < WARM + MAXH + 40) continue;
  const local = [];
  for (let t = WARM; t <= N - MAXH - 1; t += STRIDE) {
    const x = feats10(price, hi, lo, t); if (!x || x.some(v => !isFinite(v))) continue;
    const v20 = rvol(price, t, 20), row = { x };
    for (const K of KS) {
      const thr = K * v20;
      for (const H of HS) {
        let fut = 0; for (let i = t + 1; i <= t + H; i++) { if (Math.abs(price[i] / price[i - 1] - 1) > thr) { fut = 1; break; } }
        let pas = 0; for (let i = t - H + 1; i <= t; i++) { if (i >= 1 && Math.abs(price[i] / price[i - 1] - 1) > thr) { pas = 1; break; } }
        row["s_" + K + "_" + H] = fut; row["_ps_" + K + "_" + H] = pas;
      }
    }
    local.push(row);
  }
  const cut = Math.floor(local.length * TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; spikeRows.push(r); });
}

console.log("═══════════════════════════════════════════════════════════════");
console.log(" (1) 급변 곡선 — (2σ/2.5σ/3σ) × (10/20/40봉) 격자 (일봉 " + files.length + "종 · OOS · 10피처)");
console.log("     문턱 = K×현재20봉변동성 (단일봉 |수익|). 지평 H = 향후 스캔 봉수.");
console.log("     채택 = 다수결 & 지속성 둘 다 ≥+1%p 초과 · 양성률 25~50% 밴드 선호");
console.log("═══════════════════════════════════════════════════════════════");
const spikePass = [];
for (const K of KS) {
  console.log("\n── " + K + "σ ─────────────────────────────────────────────");
  console.log("  지평   정확도   다수결   지속성   양성률   판정");
  for (const H of HS) {
    const r = evalTarget(spikeRows, "s_" + K + "_" + H, "_ps_" + K + "_" + H);
    if (!r) { console.log("  " + (H + "봉").padEnd(6) + " 표본부족"); continue; }
    const band = r.posRate >= 0.25 && r.posRate <= 0.50 ? "" : (r.posRate < 0.25 ? " (희귀)" : " (흔함)");
    const mk = r.beat ? (band === "" ? "✓채택" : "✓채택" + band) : "(신기루)" + band;
    console.log("  " + (H + "봉").padEnd(6) + " " + P(r.acc).padStart(6) + "  " + P(r.base).padStart(6) + "  " + P(r.pers).padStart(6) + "  " + P(r.posRate).padStart(6) + "   " + mk);
    if (r.beat) spikePass.push({ K, H, r });
  }
}

// ═══ (2) 변동성 예보 다지평: H=10/20/40 ═══
const volByH = {}; for (const H of HS) volByH[H] = [];
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const price = fx.candle.map(c => c.c), op = fx.candle.map(c => c.o), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
  if (N < WARM + MAXH + 40) continue;
  const local = {}; for (const H of HS) local[H] = [];
  for (let t = WARM; t <= N - MAXH - 1; t += STRIDE) {
    const x = feats11(price, op, hi, lo, t); if (!x || x.some(v => !isFinite(v))) continue;
    for (const H of HS) {
      if (t - H < 1) continue;
      const cv = rvol(price, t, H), fv = rvol(price, t + H, H), pv = rvol(price, t - H, H);
      if (!cv || !isFinite(fv) || !isFinite(pv)) continue;
      // 타깃: 향후 H봉 실현변동성이 현재 H봉보다 상승. 지속성 = 최근 H봉에 변동성이 상승했으면 계속 상승 예측.
      local[H].push({ x, y: fv > cv ? 1 : 0, _p: cv > pv ? 1 : 0 });
    }
  }
  for (const H of HS) { const cut = Math.floor(local[H].length * TRAIN_FRAC); local[H].forEach((r, i) => { r._tr = i < cut; volByH[H].push(r); }); }
}

console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log(" (2) 변동성 예보 다지평 — H=10/20/40 (일봉 " + files.length + "종 · OOS · 11피처+gkRatio)");
console.log("     타깃 = 향후 H봉 실현변동성 > 현재 H봉. 지속성 = 최근 H봉 변동성 상승 추세.");
console.log("═══════════════════════════════════════════════════════════════");
console.log("  지평   정확도   다수결   지속성   양성률   판정");
const volPass = [];
for (const H of HS) {
  const r = evalTarget(volByH[H], "y", "_p");
  if (!r) { console.log("  " + (H + "봉").padEnd(6) + " 표본부족"); continue; }
  const band = r.posRate >= 0.25 && r.posRate <= 0.50 ? "" : (r.posRate < 0.25 ? " (희귀)" : " (흔함)");
  const mk = r.beat ? "✓채택" + band : "(신기루)" + band;
  console.log("  " + (H + "봉").padEnd(6) + " " + P(r.acc).padStart(6) + "  " + P(r.base).padStart(6) + "  " + P(r.pers).padStart(6) + "  " + P(r.posRate).padStart(6) + "   " + mk);
  if (r.beat) volPass.push({ H, r });
}

// ═══ 배포계수 ═══
console.log("\n\n═══════════════════════════════════════════════════════════════");
console.log(" 배포계수 (전체학습) — 채택 셀만");
console.log("═══════════════════════════════════════════════════════════════");
if (spikePass.length) {
  // MEAN/STD 는 피처·데이터 공유(급변 10피처). 대표 1개 저장 + 셀별 w/b.
  const rep = fitFull(spikeRows, "s_" + spikePass[0].K + "_" + spikePass[0].H);
  console.log("\n[급변 곡선] MEAN/STD 공유(10피처):");
  console.log("MEAN=" + JSON.stringify(R(rep.mean)));
  console.log("STD =" + JSON.stringify(R(rep.std)));
  console.log("셀별 W/B (base=OOS양성률·acc=OOS정확도):");
  for (const { K, H, r } of spikePass) {
    const M = fitFull(spikeRows, "s_" + K + "_" + H);
    console.log("  " + K + "σ·" + H + "봉  W=" + JSON.stringify(R(M.w)) + "  B=" + M.b.toFixed(5) + "  base=" + Math.round(r.posRate * 100) + " acc=" + Math.round(r.acc * 100));
  }
} else console.log("\n[급변 곡선] 채택 셀 없음 — 단일(2.5σ·20봉) 유지 권고.");

if (volPass.length) {
  console.log("\n[변동성 예보] 지평별 전체계수(11피처, mean/std/w/b 각각):");
  for (const { H, r } of volPass) {
    const M = fitFull(volByH[H], "y");
    console.log("  H=" + H + "  base=" + Math.round(r.posRate * 100) + " acc=" + Math.round(r.acc * 100));
    console.log("    mean=" + JSON.stringify(R(M.mean)));
    console.log("    std =" + JSON.stringify(R(M.std)));
    console.log("    w   =" + JSON.stringify(R(M.w)));
    console.log("    b   =" + M.b.toFixed(5));
  }
} else console.log("\n[변동성 예보] 채택 지평 없음 — 단일(H=20) 유지 권고.");
console.log("");
