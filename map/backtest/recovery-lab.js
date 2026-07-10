// backtest/recovery-lab.js — 새 리스크 축 후보 "낙폭 회복(drawdown recovery)" 엄밀 검증.
// 질문: 이미 낙폭 상태(최근 60봉 고점 대비 하락)일 때, 향후 직전 고점 회복이 예측 가능한가.
//   (a) 회복(분류): H봉 내 직전 고점(−2% 이내) 회복 여부 — 변동성구조+가격구조 피처. 다수결·지속성 이중 대조.
//   (b) 회복 속도(회귀): 회복까지 걸리는 봉 수를 예측 가능한가.
//   (c) 방향 판별: 회복 예측 = 단순 상방 드리프트(방향)인가, 낙폭 조건부 진짜 신호인가.
// 규율: 이중 베이스라인 ①다수결 ②지속성 둘 다 ≥+1%p 초과해야 채택. OOS 종목별 앞60%/뒤40%. lookahead 금지.
//   회복은 시장 상방 탓에 base-rate가 높을 수 있음 — 다수결 초과가 관건. 신기루면 명확히 기각.
"use strict";
const fs = require("fs"), path = require("path");

const HS = [20, 40, 60];        // 회복 지평(봉)
const DDS = [0.05, 0.10];       // 낙폭 문턱(고점 대비): 5% / 10%
const REC = 0.98;               // 회복 판정: 직전 고점의 −2% 이내 도달 = 회복
const PEAKWIN = 60;             // "직전 고점" 참조 창(60봉 롤링 고점)
const STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6;
const MAXH = Math.max.apply(null, HS);

// ── 지표 ──────────────────────────────────────────────
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function sma(a, e, n) { if (e < n - 1) return null; let s = 0; for (let i = e - n + 1; i <= e; i++) s += a[i]; return s / n; }
function rsiAt(a, n, e) { if (e < n) return null; let g = 0, l = 0; for (let i = e - n + 1; i <= e; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); }
function maxHi(hi, e, n) { let m = -Infinity; for (let i = e - n + 1; i <= e; i++) if (hi[i] > m) m = hi[i]; return m; }
function argMaxHi(hi, e, n) { let m = -Infinity, ai = e; for (let i = e - n + 1; i <= e; i++) if (hi[i] > m) { m = hi[i]; ai = i; } return ai; }
function minLo(lo, e, n) { let m = Infinity; for (let i = e - n + 1; i <= e; i++) if (lo[i] < m) m = lo[i]; return m; }

// ── 피처: 변동성구조(10) + 가격구조(10) = 20 ─────────────
function feats(price, hi, lo, t) {
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const atr = atrp(hi, lo, price, t, 14);
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  const hist = []; for (let k = t - 252; k <= t; k += 3) { if (k - 20 >= 0) { const vv = rvol(price, k, 20); if (vv) hist.push(vv); } }
  let pct = 0.5; if (hist.length > 5) { let c = 0; for (const v of hist) if (v <= v20) c++; pct = c / hist.length; }
  const volS = [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60), pct];

  // 가격구조
  const peak = maxHi(hi, t, PEAKWIN), pkI = argMaxHi(hi, t, PEAKWIN);
  const dd = price[t] / peak - 1;                       // 낙폭 깊이(음수)
  const barsSince = (t - pkI) / PEAKWIN;                // 고점 후 경과(정규화)
  const mom10 = price[t] / price[t - 10] - 1;
  const mom20 = price[t] / price[t - 20] - 1;
  const rsi = rsiAt(price, 14, t), rsi3 = rsiAt(price, 14, t - 3);
  const rsiUp = (rsi != null && rsi3 != null) ? (rsi - rsi3) : 0;
  const m50 = sma(price, t, 50), m200 = sma(price, t, 200), m200p = sma(price, t - 20, 200);
  const distM50 = m50 ? price[t] / m50 - 1 : 0;
  const distM200 = m200 ? price[t] / m200 - 1 : 0;
  const m200slope = (m200 && m200p) ? m200 / m200p - 1 : 0;   // falling knife: 음수
  const recLo = minLo(lo, t, 20);
  const fromLow = recLo > 0 ? price[t] / recLo - 1 : 0;        // 최근 저점 대비 반등폭
  const priceS = [dd * 100, barsSince, mom10 * 100, mom20 * 100, (rsi || 50), rsiUp, distM50 * 100, distM200 * 100, m200slope * 100, fromLow * 100];

  return { x: volS.concat(priceS), dd, peak };
}

// ── 로지스틱(표준화) ────────────────────────────────
function fit(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 3e-3, EP = 400;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return { mean, std, w, b, z };
}
// 분류 평가: 정확도 + 다수결 + 지속성(_p) + 양성률. cols=피처 인덱스 부분집합(생략=전체).
function evalClf(rows, key, baseKey, cols) {
  const proj = x => cols ? cols.map(j => x[j]) : x;
  const TR = rows.filter(r => r._tr && r[key] != null), TE = rows.filter(r => !r._tr && r[key] != null);
  if (TR.length < 80 || TE.length < 40) return null;
  const M = fit(TR.map(r => ({ x: proj(r.x), y: r[key] })), proj(TR[0].x).length);
  let hit = 0, bh = 0, pos = 0;
  for (const r of TE) { let s = M.b; const zx = M.z(proj(r.x)); for (let j = 0; j < M.w.length; j++) s += M.w[j] * zx[j]; if ((s >= 0 ? 1 : 0) === r[key]) hit++; if (r[baseKey] === r[key]) bh++; if (r[key]) pos++; }
  return { n: TE.length, acc: hit / TE.length, pers: bh / TE.length, base: Math.max(pos / TE.length, 1 - pos / TE.length), posRate: pos / TE.length };
}

// ── 선형회귀(표준화, ridge) — (b) 회복 속도 ─────────────
function fitLin(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  const ym = TR.reduce((a, r) => a + r.y, 0) / TR.length;
  let w = new Array(D).fill(0), b = ym; const LR = 0.05, L2 = 5e-3, EP = 500;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let p = b; for (let j = 0; j < D; j++) p += w[j] * zx[j]; const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return { mean, std, w, b, z, ym };
}
function evalReg(rows, key) {
  const TR = rows.filter(r => r._tr && r[key] != null), TE = rows.filter(r => !r._tr && r[key] != null);
  if (TR.length < 80 || TE.length < 40) return null;
  const M = fitLin(TR.map(r => ({ x: r.x, y: r[key] })), TR[0].x.length);
  const ybar = TR.reduce((a, r) => a + r[key], 0) / TR.length;
  let sse = 0, sst = 0, mae = 0, maeBase = 0;
  for (const r of TE) { let p = M.b; const zx = M.z(r.x); for (let j = 0; j < M.w.length; j++) p += M.w[j] * zx[j]; sse += (p - r[key]) ** 2; sst += (r[key] - ybar) ** 2; mae += Math.abs(p - r[key]); maeBase += Math.abs(ybar - r[key]); }
  return { n: TE.length, r2: 1 - sse / sst, mae: mae / TE.length, maeBase: maeBase / TE.length, ybar };
}

// ── 데이터 구축 ─────────────────────────────────────
function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  // 낙폭문턱 × 지평별 버킷
  const B = {}; for (const dd of DDS) for (const H of HS) B[dd + "|" + H] = [];
  let usedFiles = 0, totalDrawStates = 0;
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
    if (N < WARM + MAXH + 40) continue;
    usedFiles++;
    const local = {}; for (const k in B) local[k] = [];
    for (let t = WARM; t <= N - MAXH - 1; t += STRIDE) {
      const F = feats(price, hi, lo, t); if (!F || F.x.some(v => !isFinite(v))) continue;
      const peak = F.peak;
      for (const dd of DDS) {
        if (F.dd > -dd) continue;               // 낙폭 상태 필터: 고점 대비 ≥dd 하락일 때만 대상
        for (const H of HS) {
          const target = REC * peak;             // 회복 목표 = 직전 고점 −2% 이내
          // (a) 회복 여부(미래 H봉 종가가 목표 도달)
          let rec = 0, recBar = null;
          for (let i = 1; i <= H; i++) { if (price[t + i] >= target) { rec = 1; recBar = i; break; } }
          // 지속성 베이스라인(_p): 과거 H봉 미러 — t−H의 직전 고점을 t까지 회복했나(뒤돌아보기)
          const pkPast = maxHi(hi, t - H, PEAKWIN), tgtPast = REC * pkPast;
          let recPast = 0; for (let i = t - H + 1; i <= t; i++) { if (price[i] >= tgtPast) { recPast = 1; break; } }
          // (c) 방향 대조: 같은 낙폭 상태에서 단순 H봉 전방수익>0 (순수 방향)
          const dir = price[t + H] > price[t] ? 1 : 0;
          const dirPast = price[t] > price[t - H] ? 1 : 0;
          local[dd + "|" + H].push({ x: F.x, rec, _pRec: recPast, dir, _pDir: dirPast, recBar });
        }
      }
    }
    // 종목별 앞60%/뒤40% OOS 분할
    for (const k in local) { const arr = local[k]; const cut = Math.floor(arr.length * TRAIN_FRAC); arr.forEach((r, i) => { r._tr = i < cut; B[k].push(r); }); if (k.startsWith(DDS[0] + "|" + HS[0])) totalDrawStates += arr.length; }
  }

  const P = x => (x * 100).toFixed(1) + "%";
  console.log("=== 낙폭 회복(drawdown recovery) 검증 (일봉 " + usedFiles + "종 · OOS 종목별 앞60/뒤40 · 20피처) ===");
  console.log("낙폭상태 = 최근 " + PEAKWIN + "봉 고점 대비 ≥문턱 하락 시점만 대상. 회복 = H봉 내 직전 고점 −2% 이내 도달.");
  console.log("진짜 = 다수결·지속성 둘 다 ≥+1%p 초과.\n");

  // ── (a) 회복 예측 ──
  console.log("【(a) 회복 예측 — 분류】");
  console.log("낙폭 · 지평 |    n   | 정확도 | 다수결 | 지속성 | 양성률(회복율) | 판정");
  const verdicts = [];
  for (const dd of DDS) {
    for (const H of HS) {
      const rows = B[dd + "|" + H];
      const r = evalClf(rows, "rec", "_pRec");
      if (!r) { console.log("  " + Math.round(dd * 100) + "% · " + H + "봉  — 표본부족(n=" + rows.length + ")"); continue; }
      const beatMaj = r.acc - r.base, beatPers = r.acc - r.pers;
      const win = beatMaj >= 0.01 && beatPers >= 0.01;
      verdicts.push({ dd, H, r, win, beatMaj, beatPers });
      console.log("  " + String(Math.round(dd * 100) + "% · " + H + "봉").padEnd(9) + " | " + String(r.n).padStart(6) + " | " + P(r.acc).padStart(6) + " | " + P(r.base).padStart(6) + " | " + P(r.pers).padStart(6) + " | " + P(r.posRate).padStart(13) + " | " + (win ? "✓진짜 (다수결+" + (beatMaj * 100).toFixed(1) + "p·지속성+" + (beatPers * 100).toFixed(1) + "p)" : "✗ (다수결" + (beatMaj >= 0 ? "+" : "") + (beatMaj * 100).toFixed(1) + "p·지속성" + (beatPers >= 0 ? "+" : "") + (beatPers * 100).toFixed(1) + "p)"));
    }
  }

  // ── (b) 회복 속도(회귀) — 회복한 표본만 대상, 회복까지 봉 수 ──
  console.log("\n【(b) 회복 속도 — 회귀(회복한 표본만, 목표=회복까지 봉 수)】");
  console.log("낙폭 · 지평 |    n   |  OOS R² | 모델 MAE(봉) | 평균예측 MAE(봉) | 판정");
  for (const dd of DDS) {
    for (const H of HS) {
      const rows = B[dd + "|" + H].filter(r => r.rec === 1).map(r => ({ x: r.x, recBar: r.recBar, _tr: r._tr }));
      const r = evalReg(rows, "recBar");
      if (!r) { console.log("  " + Math.round(dd * 100) + "% · " + H + "봉  — 표본부족(n=" + rows.length + ")"); continue; }
      const win = r.r2 >= 0.02 && r.mae < r.maeBase - 0.1;
      console.log("  " + String(Math.round(dd * 100) + "% · " + H + "봉").padEnd(9) + " | " + String(r.n).padStart(6) + " | " + r.r2.toFixed(3).padStart(7) + " | " + r.mae.toFixed(2).padStart(11) + " | " + r.maeBase.toFixed(2).padStart(15) + " | " + (win ? "✓의미있음" : "✗ (평균예측 수준)"));
    }
  }

  // ── (c) 방향 판별 ──
  console.log("\n【(c) 방향 판별 — 회복 예측 vs 순수 방향(H봉 전방수익>0)】");
  console.log("같은 낙폭 상태·같은 피처로 '회복'과 '방향'을 각각 예측. 회복 우위가 없으면 회복 = 방향의 재포장.");
  console.log("낙폭 · 지평 | 회복 다수결초과 | 방향 다수결초과 | 회복⟺방향 일치율 | 해석");
  for (const dd of DDS) {
    for (const H of HS) {
      const rows = B[dd + "|" + H];
      const rc = evalClf(rows, "rec", "_pRec");
      const dr = evalClf(rows, "dir", "_pDir");
      if (!rc || !dr) { console.log("  " + Math.round(dd * 100) + "% · " + H + "봉  — 표본부족"); continue; }
      const recBeat = rc.acc - rc.base, dirBeat = dr.acc - dr.base;
      // 회복과 방향 라벨의 일치율(OOS)
      const TE = rows.filter(r => !r._tr); let same = 0; for (const r of TE) if (r.rec === r.dir) same++; const agree = same / TE.length;
      let interp;
      if (recBeat >= 0.01 && recBeat > dirBeat + 0.005) interp = "회복이 방향보다 우위 → 조건부 진짜 신호 가능";
      else if (recBeat >= 0.01 && dirBeat >= 0.01) interp = "둘 다 예측됨 → 상당부분 방향 성격";
      else if (recBeat < 0.01) interp = "회복 자체가 다수결 미초과 → 신호 아님";
      else interp = "회복만 초과·방향은 아님 → 방향과 구분되는 신호";
      console.log("  " + String(Math.round(dd * 100) + "% · " + H + "봉").padEnd(9) + " | " + (recBeat >= 0 ? "+" : "") + (recBeat * 100).toFixed(1) + "p".padStart(11) + " | " + (dirBeat >= 0 ? "+" : "") + (dirBeat * 100).toFixed(1) + "p".padStart(11) + " | " + P(agree).padStart(14) + " | " + interp);
    }
  }

  // ── (d) 피처 소거 검증: 회복 = 단순 "고점까지 거리(낙폭깊이)"인가, 구조가 더 있나 ──
  //   depth-only([10]) vs 변동성구조([0..9]) vs 가격구조−깊이([11..19]) vs 전체.
  //   전체 ≈ depth-only면 새 축이 아님(그냥 얼마나 근접했나). 전체 ≫ depth면 진짜 구조.
  const IDX = { depth: [10], vol: [0,1,2,3,4,5,6,7,8,9], priceNoDepth: [11,12,13,14,15,16,17,18,19] };
  console.log("\n【(d) 피처 소거 — 회복 예측의 구동 요인(다수결 대비 초과 %p)】");
  console.log("낙폭 · 지평 | 깊이만 | 변동성구조 | 가격구조−깊이 | 전체20 | 해석");
  for (const dd of DDS) {
    for (const H of HS) {
      const rows = B[dd + "|" + H];
      const base = evalClf(rows, "rec", "_pRec"); if (!base) continue;
      const dOnly = evalClf(rows, "rec", "_pRec", IDX.depth);
      const vOnly = evalClf(rows, "rec", "_pRec", IDX.vol);
      const pND = evalClf(rows, "rec", "_pRec", IDX.priceNoDepth);
      const bm = m => m ? (m.acc - m.base) : NaN;
      const bd = bm(dOnly), bf = bm(base);
      const interp = bf > bd + 0.02 ? "전체>깊이 → 깊이 외 구조 존재" : (bf >= 0.01 ? "전체≈깊이 → 대부분 '고점 근접도'" : "초과 미미");
      console.log("  " + String(Math.round(dd * 100) + "% · " + H + "봉").padEnd(9) + " | " + (bd*100).toFixed(1).padStart(5) + "p | " + (bm(vOnly)*100).toFixed(1).padStart(8) + "p | " + (bm(pND)*100).toFixed(1).padStart(11) + "p | " + (bf*100).toFixed(1).padStart(5) + "p | " + interp);
    }
  }

  // ── 종합 판정 ──
  const wins = verdicts.filter(v => v.win).length;
  console.log("\n=== 종합 판정 ===");
  console.log("(a) 회복 예측: " + verdicts.length + "개 (낙폭×지평) 조합 중 " + wins + "개가 이중 베이스라인 초과.");
  if (wins === 0) {
    console.log("→ 기각: 어떤 조합도 다수결·지속성을 함께 넘지 못함. 회복은 시장 상방 base-rate의 신기루.");
  } else {
    const best = verdicts.filter(v => v.win).sort((a, b) => Math.min(b.beatMaj, b.beatPers) - Math.min(a.beatMaj, a.beatPers))[0];
    console.log("→ 조건부 채택 후보: " + Math.round(best.dd * 100) + "% 낙폭 · " + best.H + "봉 (다수결+" + (best.beatMaj * 100).toFixed(1) + "p·지속성+" + (best.beatPers * 100).toFixed(1) + "p). (c) 방향 판별표에서 방향 재포장 여부 확인 필수.");
  }
  console.log("주의: 회복율(양성률)이 매우 높으면 다수결이 강해 초과가 어렵다 — base-rate 신기루 경계.");
}
main();
