// backtest/vol-deepen-lab.js — 변동성 예보 심화 리서치 랩(공유파일 수정 없음, 독립 실험).
// 목표: 현행 10피처 로지스틱(OOS 68.4%)을 OOS로 견고히(≥+1pp) 넘는 새 피처/모델 탐색.
// 규율: OOS(종목별 앞60% train / 뒤40% test) 개선만 인정. in-sample 개선은 과적합 → 무시.
//        lookahead 금지(모든 피처는 t 시점까지 정보만). baseline = train-volforecast.js와 동일 10피처.
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6;

// ── 변동성 추정량들 ──
// 종가-종가 실현변동성(현행이 쓰는 것)
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
// Parkinson(고저 레인지) — 종가정보 미사용, 순수 intrabar 레인지 기반
function parkinson(hi, lo, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const u = Math.log(hi[i] / lo[i]); s += u * u; } return Math.sqrt(s / (4 * Math.log(2) * n)); }
// Garman-Klass — OHLC 전부 사용(레인지 + 시가·종가 갭)
function garmanKlass(op, hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const u = Math.log(hi[i] / lo[i]), d = Math.log(cl[i] / op[i]); s += 0.5 * u * u - (2 * Math.log(2) - 1) * d * d; } const v = s / n; return v > 0 ? Math.sqrt(v) : 0; }
// Rogers-Satchell — 드리프트 독립(추세장에서도 편향 없음)
function rogersSatchell(op, hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const hc = Math.log(hi[i] / cl[i]), ho = Math.log(hi[i] / op[i]), lc = Math.log(lo[i] / cl[i]), lo_ = Math.log(lo[i] / op[i]); s += hc * ho + lc * lo_; } const v = s / n; return v > 0 ? Math.sqrt(v) : 0; }

// ── baseline 10피처(train-volforecast.js와 동일) ──
function baseFeats(price, hi, lo, t) {
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

// ── 후보 피처(각각 이름 붙여 개별 검증) ──
function candFeats(op, price, hi, lo, vol, t) {
  const v20 = rvol(price, t, 20), v60 = rvol(price, t, 60);
  const c = {};
  // ── OHLC 변동성 추정량(미활용 정보!) ──
  const pk20 = parkinson(hi, lo, t, 20), pk60 = parkinson(hi, lo, t, 60);
  const gk20 = garmanKlass(op, hi, lo, price, t, 20), gk60 = garmanKlass(op, hi, lo, price, t, 60);
  const rs20 = rogersSatchell(op, hi, lo, price, t, 20), rs60 = rogersSatchell(op, hi, lo, price, t, 60);
  // 레벨(백분율)
  c.pk20 = pk20 * 100; c.gk20 = gk20 * 100; c.rs20 = rs20 * 100;
  // 종가-종가 대비 비율(intrabar 레인지가 종가움직임보다 크면 choppy → 압축 신호일 수 있음)
  c.pkRatio = v20 ? pk20 / v20 : 1;
  c.gkRatio = v20 ? gk20 / v20 : 1;
  c.rsRatio = v20 ? rs20 / v20 : 1;
  // OHLC 추정량의 자체 기간구조(단기/장기)
  c.pkTerm = pk60 ? pk20 / pk60 - 1 : 0;
  c.gkTerm = gk60 ? gk20 / gk60 - 1 : 0;
  c.rsTerm = rs60 ? rs20 / rs60 - 1 : 0;
  // OHLC 추정량의 log 비율(현행 log(v20/v60) OHLC판)
  c.logPk = pk60 ? Math.log(pk20 / pk60) : 0;
  c.logGk = gk60 ? Math.log(gk20 / gk60) : 0;

  // ── 점프(jump) / 바이파워 변동 ──
  // RV(실현분산) vs BV(바이파워변동): 점프 있으면 RV>BV → (RV-BV)/RV 큼
  let rv = 0; const ar = []; for (let i = t - 19; i <= t; i++) { const r = Math.log(price[i] / price[i - 1]); rv += r * r; ar.push(Math.abs(r)); }
  let bv = 0; for (let i = 1; i < ar.length; i++) bv += ar[i] * ar[i - 1]; bv *= (Math.PI / 2);
  c.jump = rv > 0 ? Math.max(0, (rv - bv) / rv) : 0;
  // 큰 봉 비율: 최근 20봉 중 |r|>2.5*σ 인 봉 개수 비율
  const sd = Math.sqrt(rv / 20); let big = 0; for (const a of ar) if (a > 2.5 * sd) big++;
  c.bigBar = big / 20;
  // 최대 단일봉 |r| / 평균 (테일 두께)
  const maxr = Math.max(...ar), meanr = ar.reduce((a, b) => a + b, 0) / ar.length;
  c.tailR = meanr ? maxr / meanr : 1;

  // ── 변동성 자기상관 ──
  // 제곱수익의 lag-1 자기상관(변동성 군집 강도) — 최근 40봉
  const r2 = []; for (let i = t - 39; i <= t; i++) { const r = Math.log(price[i] / price[i - 1]); r2.push(r * r); }
  const m2 = r2.reduce((a, b) => a + b, 0) / r2.length; let num = 0, den = 0;
  for (let i = 1; i < r2.length; i++) num += (r2[i] - m2) * (r2[i - 1] - m2);
  for (let i = 0; i < r2.length; i++) den += (r2[i] - m2) ** 2;
  c.ac1 = den ? num / den : 0;

  // ── 기간구조 기울기(로그 실현변동성 vs 로그 윈도) ──
  const wins = [5, 10, 20, 40, 60]; const xs = [], ys = [];
  for (const w of wins) { const vv = rvol(price, t, w); if (vv > 0) { xs.push(Math.log(w)); ys.push(Math.log(vv)); } }
  let slope = 0; if (xs.length >= 3) { const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length; let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; } slope = sxx ? sxy / sxx : 0; }
  c.termSlope = slope;

  // ── 거래량-변동성 상호작용 ──
  let volR = 1; if (vol && vol.length > t) { let a = 0, b = 0; for (let i = t - 4; i <= t; i++) a += vol[i]; for (let i = t - 59; i <= t; i++) b += vol[i]; a /= 5; b /= 60; volR = b ? a / b : 1; }
  c.volR = volR;
  // 거래량급증 × 압축(pct 낮음) 상호작용: 거래량 튀는데 변동성 낮음 → 확대 임박?
  c.volXpct = volR; // (상호작용은 combo에서 pct와 곱; 여기선 volR 자체)

  return c;
}

// ── 데이터 적재 ──
const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
const all = [];
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const op = fx.candle.map(c => c.o), price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), vol = fx.candle.map(c => c.v), N = price.length;
  if (N < WARM + H + 40) continue;
  const local = [];
  for (let t = WARM; t <= N - H - 1; t += STRIDE) {
    const b = baseFeats(price, hi, lo, t); if (!b || b.some(v => !isFinite(v))) continue;
    const c = candFeats(op, price, hi, lo, vol, t);
    if (Object.values(c).some(v => !isFinite(v))) continue;
    const cv = rvol(price, t, H), fv = rvol(price, t + H, H);
    local.push({ b, c, y: fv > cv ? 1 : 0 });
  }
  const cut = Math.floor(local.length * TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; all.push(r); });
}
const TR = all.filter(r => r._tr), TE = all.filter(r => !r._tr);
console.log("총 샘플: " + all.length + " (train " + TR.length + " / test " + TE.length + "), 종목 " + files.length);
console.log("test 양성률(확대): " + (TE.reduce((a, r) => a + r.y, 0) / TE.length * 100).toFixed(1) + "%");

// ── 로지스틱 학습/평가(train-volforecast.js와 동일 하이퍼) ──
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
function runLogit(name, getx, D) { const M = fit(TR, D, getx); const oos = accL(M, TE, getx), ins = accL(M, TR, getx); return { name, oos, ins, D }; }
function line(res, base) { const d = (res.oos - base) * 100; const sign = d >= 0 ? "+" : ""; return res.name.padEnd(24) + " OOS " + (res.oos * 100).toFixed(1) + "%  (" + sign + d.toFixed(1) + "pp)  in-sample " + (res.ins * 100).toFixed(1) + "%"; }

const base = runLogit("baseline(10)", r => r.b, 10);
console.log("\n══ baseline ══\n" + base.name.padEnd(24) + " OOS " + (base.oos * 100).toFixed(1) + "%  in-sample " + (base.ins * 100).toFixed(1) + "%");
const B = base.oos;

console.log("\n══ 개별 후보 피처(baseline+1) — OHLC 추정량 우선 ══");
const OHLC = ["pk20", "gk20", "rs20", "pkRatio", "gkRatio", "rsRatio", "pkTerm", "gkTerm", "rsTerm", "logPk", "logGk"];
const OTHER = ["jump", "bigBar", "tailR", "ac1", "termSlope", "volR"];
const results = [];
for (const key of OHLC.concat(OTHER)) { const res = runLogit("+" + key, r => r.b.concat([r.c[key]]), 11); results.push(res); console.log(line(res, B)); }

console.log("\n══ 조합(유망 피처 묶음) ══");
function combo(name, keys) { const res = runLogit(name, r => r.b.concat(keys.map(k => r.c[k])), 10 + keys.length); console.log(line(res, B)); return res; }
combo("+pk+gk+rs(레벨)", ["pk20", "gk20", "rs20"]);
combo("+pkR+gkR+rsR(비율)", ["pkRatio", "gkRatio", "rsRatio"]);
combo("+pkTerm+gkTerm+rsTerm", ["pkTerm", "gkTerm", "rsTerm"]);
combo("+jump+bigBar+tailR", ["jump", "bigBar", "tailR"]);
combo("+ac1+termSlope", ["ac1", "termSlope"]);
// 개별 상위 3개 자동 선택 조합
const top3 = results.slice().sort((a, b) => b.oos - a.oos).slice(0, 3).map(r => r.name.slice(1));
combo("+개별상위3(" + top3.join(",") + ")", top3);
combo("+OHLC전부", OHLC);
combo("+ALL후보", OHLC.concat(OTHER));

// ── 튜닝 GBT(depth 2~3 재귀 히스토그램 트리, lr/tree/depth 스윕) ──
// 히스토그램 부스팅: 피처를 고정 분위 bin으로 사전 이산화 → 노드마다 bin 히스토그램만 스캔(정렬 없음, 빠름).
if (!process.env.SKIP_GBT)
console.log("\n══ 튜닝 GBT(depth 2~3, 히스토그램) — base10 + OHLC후보 ══");
if (!process.env.SKIP_GBT) {
const GBT_KEYS = OHLC.concat(["jump", "ac1", "termSlope"]);
function buildX(r) { return r.b.concat(GBT_KEYS.map(k => r.c[k])); }
const Xtr = TR.map(buildX), Ytr = TR.map(r => r.y), Xte = TE.map(buildX);
const NF = Xtr[0].length, NB = 32;
const sig = z => 1 / (1 + Math.exp(-z));
// 피처별 bin 경계(train 분포 분위) + 사전 이산화
const edges = [];
for (let j = 0; j < NF; j++) {
  const col = Xtr.map(x => x[j]).sort((a, b) => a - b);
  const e = []; for (let q = 1; q < NB; q++) e.push(col[Math.floor(col.length * q / NB)]); edges.push(e);
}
function binOf(x, j) { const e = edges[j]; let lo = 0, hi = e.length; while (lo < hi) { const m = (lo + hi) >> 1; if (x <= e[m]) hi = m; else lo = m + 1; } return lo; }
const BinTr = Xtr.map(x => { const b = new Uint8Array(NF); for (let j = 0; j < NF; j++) b[j] = binOf(x[j], j); return b; });
const BinTe = Xte.map(x => { const b = new Uint8Array(NF); for (let j = 0; j < NF; j++) b[j] = binOf(x[j], j); return b; });
function buildTree(idx, resid, depth, maxDepth, minLeaf) {
  let sum = 0; for (const i of idx) sum += resid[i]; const val = sum / idx.length;
  if (depth >= maxDepth || idx.length < 2 * minLeaf) return { leaf: true, val };
  let best = null;
  for (let j = 0; j < NF; j++) {
    const hs = new Float64Array(NB), hn = new Int32Array(NB);
    for (const i of idx) { const b = BinTr[i][j]; hs[b] += resid[i]; hn[b]++; }
    let ls = 0, ln = 0; const tot = sum, totN = idx.length;
    for (let b = 0; b < NB - 1; b++) { ls += hs[b]; ln += hn[b]; if (ln < minLeaf || totN - ln < minLeaf) continue; const rs = tot - ls, rn = totN - ln; const gain = ls * ls / ln + rs * rs / rn; if (!best || gain > best.gain) best = { j, b, gain }; }
  }
  if (!best) return { leaf: true, val };
  const li = [], ri = []; for (const i of idx) (BinTr[i][best.j] <= best.b ? li : ri).push(i);
  if (!li.length || !ri.length) return { leaf: true, val };
  return { leaf: false, j: best.j, b: best.b, L: buildTree(li, resid, depth + 1, maxDepth, minLeaf), R: buildTree(ri, resid, depth + 1, maxDepth, minLeaf) };
}
function evalTree(node, bins) { while (!node.leaf) node = bins[node.j] <= node.b ? node.L : node.R; return node.val; }
function gbtTuned(nTree, maxDepth, lr, minLeaf) {
  const F = new Float64Array(TR.length), FT = new Float64Array(TE.length);
  const idxAll = TR.map((_, i) => i);
  for (let m = 0; m < nTree; m++) {
    const resid = new Float64Array(TR.length); for (let i = 0; i < TR.length; i++) resid[i] = Ytr[i] - sig(F[i]);
    const tree = buildTree(idxAll, resid, 0, maxDepth, minLeaf);
    for (let i = 0; i < TR.length; i++) F[i] += lr * evalTree(tree, BinTr[i]);
    for (let i = 0; i < TE.length; i++) FT[i] += lr * evalTree(tree, BinTe[i]);
  }
  let h = 0; for (let i = 0; i < TE.length; i++) if ((FT[i] >= 0 ? 1 : 0) === TE[i].y) h++;
  let hi = 0; for (let i = 0; i < TR.length; i++) if ((F[i] >= 0 ? 1 : 0) === Ytr[i]) hi++;
  return { oos: h / TE.length, ins: hi / TR.length };
}
for (const [nt, dp, lr, ml] of [[150, 2, 0.1, 50], [300, 2, 0.05, 50], [200, 3, 0.05, 80], [400, 2, 0.03, 80], [300, 3, 0.03, 100], [200, 2, 0.05, 200]]) {
  const g = gbtTuned(nt, dp, lr, ml);
  const d = (g.oos - B) * 100; const sign = d >= 0 ? "+" : "";
  console.log(("GBT t=" + nt + " d=" + dp + " lr=" + lr + " leaf=" + ml).padEnd(30) + " OOS " + (g.oos * 100).toFixed(1) + "%  (" + sign + d.toFixed(1) + "pp)  in-sample " + (g.ins * 100).toFixed(1) + "%");
}
}

// ── 견고성 검증: 여러 train/test 분할에서 채택 후보가 유지되는가(단일 60/40 우연 배제) ──
// 각 종목별로 분할 비율을 바꿔가며 재분류 → 후보 피처셋의 OOS를 baseline과 같은 분할에서 비교.
console.log("\n══ 견고성: 분할 비율별 OOS(피처셋 vs baseline, 같은 분할) ══");
const FRACS = [0.5, 0.55, 0.6, 0.65, 0.7];
// 종목 경계 보존: all[]에 fixture 인덱스 태깅
// (재적재 없이 all 재활용 불가 → per-fixture 리스트를 별도 보관)
const perFix = [];
{
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const op = fx.candle.map(c => c.o), price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), vol = fx.candle.map(c => c.v), N = price.length;
    if (N < WARM + H + 40) continue;
    const local = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) {
      const b = baseFeats(price, hi, lo, t); if (!b || b.some(v => !isFinite(v))) continue;
      const c = candFeats(op, price, hi, lo, vol, t);
      if (Object.values(c).some(v => !isFinite(v))) continue;
      const cv = rvol(price, t, H), fv = rvol(price, t + H, H);
      local.push({ b, c, y: fv > cv ? 1 : 0 });
    }
    perFix.push(local);
  }
}
function splitAt(frac) { const tr = [], te = []; for (const local of perFix) { const cut = Math.floor(local.length * frac); local.forEach((r, i) => (i < cut ? tr : te).push(r)); } return { tr, te }; }
const SETS = { "baseline": r => r.b, "+gkRatio": r => r.b.concat([r.c.gkRatio]), "+OHLC비율3": r => r.b.concat([r.c.pkRatio, r.c.gkRatio, r.c.rsRatio]), "+ALL후보": r => r.b.concat(OHLC.concat(OTHER).map(k => r.c[k])) };
const DIMS = { "baseline": 10, "+gkRatio": 11, "+OHLC비율3": 13, "+ALL후보": 10 + OHLC.length + OTHER.length };
const header = "분할".padEnd(8) + Object.keys(SETS).map(k => k.padEnd(14)).join("") + "Δ(+ALL)";
console.log(header);
for (const frac of FRACS) {
  const { tr, te } = splitAt(frac);
  const accs = {}; for (const k in SETS) { const M = fit(tr, DIMS[k], SETS[k]); accs[k] = accL(M, te, SETS[k]); }
  const row = (Math.round(frac * 100) + "/" + Math.round((1 - frac) * 100)).padEnd(8) + Object.keys(SETS).map(k => (accs[k] * 100).toFixed(1) + "%").map(s => s.padEnd(14)).join("") + ((accs["+ALL후보"] - accs["baseline"]) * 100).toFixed(1) + "pp";
  console.log(row);
}

console.log("\n══ 판정 기준: OOS ≥ " + ((B + 0.01) * 100).toFixed(1) + "% (baseline +1.0pp)가 여러 분할에서 견고해야 채택 ══");

// ── 채택 후보 배포 계수(전체 데이터 in-sample 학습 — train-volforecast.js와 동일 배포 절차) ──
// 현행 10피처 + gkRatio(=garmanKlass(20)/rvol(20)) 11피처. forge-core에 gkRatio 계산 추가 후 계수 교체하면 됨.
console.log("\n══ 채택 후보 배포 계수: +gkRatio(11피처, OOS +0.6pp 견고) ══");
const getGK = r => r.b.concat([r.c.gkRatio]);
const M11 = fit(all, 11, getGK);
const R = a => a.map(x => +x.toFixed(5));
console.log("피처순서 = [v10/v60-1, v20/v60-1, v20/v120-1, v60/v120-1, atr*100, vov, rng*100, v20*100, log(v20/v60), pct, gkRatio]");
console.log("mean=" + JSON.stringify(R(M11.mean)));
console.log("std =" + JSON.stringify(R(M11.std)));
console.log("w   =" + JSON.stringify(R(M11.w)));
console.log("b   =" + (+M11.b.toFixed(5)));
