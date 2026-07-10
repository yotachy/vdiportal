// backtest/vol-improve.js — 변동성 예보 모델 개선 실험(작동 축 강화).
// 동일 per-fixture 60/40 OOS 분할로 baseline(9피처) vs 후보 피처추가 vs GBT 대조.
// 규율: OOS 정확도가 견고히(≥+1pp) 오를 때만 채택. in-sample만 오르면 과적합 기각.
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6;
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }

// baseline 9피처(현행 forge-core와 동일)
function baseFeats(price, hi, lo, t) {
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const atr = atrp(hi, lo, price, t, 14);
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  return [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60)];
}
// 후보 추가 피처 — 각각 이름 붙여 개별 검증
function candFeats(price, hi, lo, vol, t) {
  const v20 = rvol(price, t, 20);
  // ① 변동성 국면 백분위(자기 252봉 v20 분포에서 현재 위치) — 낮을수록 확대 여지
  const hist = []; for (let k = t - 252; k <= t; k += 3) { if (k - 20 >= 0) { const vv = rvol(price, k, 20); if (vv) hist.push(vv); } }
  let pct = 0.5; if (hist.length > 5) { let c = 0; for (const v of hist) if (v <= v20) c++; pct = c / hist.length; }
  // ② 레버리지 효과: 최근 20봉 로그수익(음수 → 미래 고변동)
  const ret20 = t >= 20 ? Math.log(price[t] / price[t - 20]) : 0;
  const ret5 = t >= 5 ? Math.log(price[t] / price[t - 5]) : 0;
  // ③ 하방 반실현변동성 / 상방 비율(음수수익 변동성 편중)
  let dn = 0, upn = 0, dc = 0, uc = 0; for (let i = t - 19; i <= t; i++) { const r = Math.log(price[i] / price[i - 1]); if (r < 0) { dn += r * r; dc++; } else { upn += r * r; uc++; } }
  const semiR = (uc && dc) ? Math.sqrt(dn / dc) / (Math.sqrt(upn / uc) || 1e-9) : 1;
  // ④ 거래량 급증비(최근5 vs 최근60 평균) — 거래량이 변동성 선행
  let volR = 1; if (vol && vol.length > t) { let a = 0, b = 0; for (let i = t - 4; i <= t; i++) a += vol[i]; for (let i = t - 59; i <= t; i++) b += vol[i]; a /= 5; b /= 60; volR = b ? a / b : 1; }
  // ⑤ 거래량 변동성(거래량 자체의 변동)
  let vvol = 0; if (vol && vol.length > t) { const lv = []; for (let i = t - 19; i <= t; i++) lv.push(Math.log((vol[i] || 1) + 1)); const m = lv.reduce((a, b) => a + b, 0) / lv.length; vvol = Math.sqrt(lv.reduce((a, b) => a + (b - m) ** 2, 0) / lv.length); }
  return { pct, ret20: ret20 * 100, ret5: ret5 * 100, absret20: Math.abs(ret20) * 100, semiR, volR, vvol };
}

// ── 데이터 적재 ──
const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
const all = [];
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), vol = fx.candle.map(c => c.v), N = price.length;
  if (N < WARM + H + 40) continue;
  const local = [];
  for (let t = WARM; t <= N - H - 1; t += STRIDE) {
    const b = baseFeats(price, hi, lo, t); if (!b || b.some(v => !isFinite(v))) continue;
    const c = candFeats(price, hi, lo, vol, t);
    const cv = rvol(price, t, H), fv = rvol(price, t + H, H);
    local.push({ b, c, y: fv > cv ? 1 : 0 });
  }
  const cut = Math.floor(local.length * TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; all.push(r); });
}
console.log("총 샘플: " + all.length + " (train " + all.filter(r => r._tr).length + " / test " + all.filter(r => !r._tr).length + ")");

// ── 로지스틱 학습/평가 ──
function fit(TR, D, getx) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) { const x = getx(r); for (let j = 0; j < D; j++) mean[j] += x[j]; } for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) { const x = getx(r); for (let j = 0; j < D; j++) std[j] += (x[j] - mean[j]) ** 2; } for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 2e-3, EP = 400;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const x = getx(r); let s = b; for (let j = 0; j < D; j++) s += w[j] * (x[j] - mean[j]) / std[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * (x[j] - mean[j]) / std[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return { mean, std, w, b };
}
function accL(M, TE, getx) { let h = 0; for (const r of TE) { let s = M.b; const x = getx(r); for (let j = 0; j < M.w.length; j++) s += M.w[j] * (x[j] - M.mean[j]) / M.std[j]; if ((s >= 0 ? 1 : 0) === r.y) h++; } return h / TE.length; }
const TR = all.filter(r => r._tr), TE = all.filter(r => !r._tr);
function runLogit(name, getx, D) { const M = fit(TR, D, getx); const oos = accL(M, TE, getx), ins = accL(M, TR, getx); console.log(name.padEnd(34) + " OOS " + (oos * 100).toFixed(1) + "%  in-sample " + (ins * 100).toFixed(1) + "%"); return oos; }

console.log("\n── 로지스틱: baseline vs 후보 피처 ──");
const base = runLogit("baseline(9)", r => r.b, 9);
const CANDS = ["pct", "ret20", "ret5", "absret20", "semiR", "volR", "vvol"];
for (const key of CANDS) runLogit("+" + key, r => r.b.concat([r.c[key]]), 10);
runLogit("+pct+semiR+volR", r => r.b.concat([r.c.pct, r.c.semiR, r.c.volR]), 12);
runLogit("+ALL cand", r => r.b.concat(CANDS.map(k => r.c[k])), 9 + CANDS.length);

// ── GBT(간단 그래디언트부스팅, 결정그루터기) — 비선형 상호작용 검증 ──
function buildX(r) { return r.b.concat(CANDS.map(k => r.c[k])); }
function gbt(TR, TE, nTree, depth, lr) {
  const D = buildX(TR[0]).length;
  const X = TR.map(buildX), Y = TR.map(r => r.y), XT = TE.map(buildX);
  let F = new Array(TR.length).fill(0), FT = new Array(TE.length).fill(0);
  const sig = z => 1 / (1 + Math.exp(-z));
  function bestSplit(idx, resid) {
    let best = null;
    for (let j = 0; j < D; j++) {
      const vals = idx.map(i => X[i][j]).slice().sort((a, b) => a - b);
      for (let q = 1; q < 8; q++) { const thr = vals[Math.floor(vals.length * q / 8)];
        let ls = 0, ln = 0, rs = 0, rn = 0; for (const i of idx) { if (X[i][j] <= thr) { ls += resid[i]; ln++; } else { rs += resid[i]; rn++; } }
        if (ln < 20 || rn < 20) continue; const gain = ls * ls / ln + rs * rs / rn;
        if (!best || gain > best.gain) best = { j, thr, gain, lv: ls / ln, rv: rs / rn }; }
    }
    return best;
  }
  for (let m = 0; m < nTree; m++) {
    const resid = TR.map((r, i) => r.y - sig(F[i]));
    // depth-1 stump (depth 무시, 단순화)
    const idxAll = TR.map((_, i) => i);
    const sp = bestSplit(idxAll, resid); if (!sp) break;
    for (let i = 0; i < TR.length; i++) F[i] += lr * (X[i][sp.j] <= sp.thr ? sp.lv : sp.rv);
    for (let i = 0; i < TE.length; i++) FT[i] += lr * (XT[i][sp.j] <= sp.thr ? sp.lv : sp.rv);
  }
  let h = 0; for (let i = 0; i < TE.length; i++) if ((FT[i] >= 0 ? 1 : 0) === TE[i].y) h++;
  return h / TE.length;
}
console.log("\n── GBT(그루터기, 비선형) ──");
for (const nt of [30, 80, 150]) console.log(("GBT tree=" + nt).padEnd(34) + " OOS " + (gbt(TR, TE, nt, 1, 0.3) * 100).toFixed(1) + "%");
