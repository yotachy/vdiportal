// backtest/bounce-meta.js — 되는 방향에 ML: 검증된 반등신호(edge 있음)를 메타필터링해 품질↑.
// 후보=오버솔드+RSI반등(평균회귀 진입군). ML이 P(승)로 상위만 선별 → 승률·기대값 오르나?(out-of-sample)
// 방향예측(edge 없음)이 아니라 '이미 edge 있는 진입의 선별' — 메타라벨링 올바른 용법.
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, STRIDE = 1, WARM = 220, TRAIN_FRAC = 0.6;
function sma(a, e, n) { if (e < n - 1) return null; let s = 0; for (let i = e - n + 1; i <= e; i++) s += a[i]; return s / n; }
function stdev(a, e, n, m) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += (a[i] - m) ** 2; return Math.sqrt(s / n); }
function rsiAt(a, n, e) { if (e < n) return null; let g = 0, l = 0; for (let i = e - n + 1; i <= e; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); }
function ema(a, e, n) { const k = 2 / (n + 1); let v = a[Math.max(0, e - n * 3)]; for (let i = Math.max(1, e - n * 3 + 1); i <= e; i++) v = a[i] * k + v * (1 - k); return v; }

function ctx(price, t) {   // 후보판정 + 피처 동시 계산
  const c = price[t];
  const ma20 = sma(price, t, 20), ma50 = sma(price, t, 50), ma200 = sma(price, t, 200);
  const ma200p = sma(price, t - 20, 200), ma50p = sma(price, t - 10, 50), ma20p = sma(price, t - 10, 20);
  if (!ma20 || !ma50 || !ma200 || !ma200p || !ma50p || !ma20p) return null;
  const sd20 = stdev(price, t, 20, ma20); if (!sd20) return null;
  const rsi = rsiAt(price, 14, t), rsi3 = rsiAt(price, 14, t - 3); if (rsi == null || rsi3 == null) return null;
  const pctB = (c - (ma20 - 2 * sd20)) / (4 * sd20) - 0.5;   // 중앙0
  const rsiSlope = (rsi - rsi3) / 20;
  const hi60 = Math.max.apply(null, price.slice(t - 60, t + 1)), lo60 = Math.min.apply(null, price.slice(t - 60, t + 1));
  const hi20 = Math.max.apply(null, price.slice(t - 20, t + 1)), lo20 = Math.min.apply(null, price.slice(t - 20, t + 1));
  const dd = hi60 > 0 ? c / hi60 - 1 : 0, ru = lo60 > 0 ? c / lo60 - 1 : 0;
  const vol20 = (function () { let s = 0; for (let i = t - 19; i <= t; i++) s += Math.log(price[i] / price[i - 1]) ** 2; return Math.sqrt(s / 20); })();
  const vol60 = (function () { let s = 0; for (let i = t - 59; i <= t; i++) s += Math.log(price[i] / price[i - 1]) ** 2; return Math.sqrt(s / 60); })();
  const macd = ema(price, t, 12) - ema(price, t, 26);
  const slMA200 = (ma200 / ma200p - 1) * 100, slMA50 = (ma50 / ma50p - 1) * 100, slMA20 = (ma20 / ma20p - 1) * 100;
  const range60 = hi60 > lo60 ? (c - lo60) / (hi60 - lo60) - 0.5 : 0, range20 = hi20 > lo20 ? (c - lo20) / (hi20 - lo20) - 0.5 : 0;
  const rsiN = (rsi - 50) / 50, volR = vol60 ? vol20 / vol60 - 1 : 0;
  // 후보: RSI 반등 + (밴드하단 or 낙폭) — 평균회귀 진입군
  const cand = rsiSlope > 0 && (pctB <= -0.2 || dd <= -0.10);
  const x = [
    c / price[t - 5] - 1, c / price[t - 10] - 1, c / price[t - 20] - 1, c / price[t - 60] - 1,
    rsiN, rsiSlope, pctB, macd / c * 100,
    (c / ma20 - 1) * 100, (c / ma50 - 1) * 100, (c / ma200 - 1) * 100, slMA20, slMA50, slMA200,
    vol20 * 100, volR, range20, range60, dd * 100, ru * 100,
    pctB * volR, dd * rsiSlope * 10, range60 * slMA200, pctB * slMA200, dd * slMA200,
  ];
  return { cand, x };
}
function train(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 3e-3, EP = 400;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return { pred: x => { const zx = z(x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; return 1 / (1 + Math.exp(-s)); }, w };
}
function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const TR = [], TE = [];
  for (const f of files) {
    const price = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).candle.map(c => c.c), N = price.length;
    if (N < WARM + H + 40) continue;
    const rows = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) {
      const cc = ctx(price, t); if (!cc || !cc.cand || cc.x.some(v => !isFinite(v))) continue;
      const ret = price[t + H] / price[t] - 1;
      rows.push({ x: cc.x, y: ret > 0 ? 1 : 0, ret });
    }
    const cut = Math.floor(rows.length * TRAIN_FRAC);
    for (let i = 0; i < rows.length; i++) (i < cut ? TR : TE).push(rows[i]);
  }
  const D = TR[0].x.length, P = x => (x * 100).toFixed(1) + "%", Pe = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";
  const m = train(TR, D);
  const te = TE.map(r => ({ p: m.pred(r.x), y: r.y, ret: r.ret })).sort((a, b) => b.p - a.p);   // P(승) 높은순
  const baseWr = TE.reduce((a, r) => a + r.y, 0) / TE.length, baseEx = TE.reduce((a, r) => a + r.ret, 0) / TE.length;
  console.log("=== 반등신호 메타필터 (일봉 " + files.length + "종 · 후보=오버솔드+RSI반등 · 지평 " + H + ") ===");
  console.log("train후보 " + TR.length + " · test후보 " + TE.length + " · 피처 " + D);
  console.log("전체 후보(필터 없음): 승률 " + P(baseWr) + " · 기대값 " + Pe(baseEx) + "\n");
  console.log("  ML상위   신호수   승률      기대값/거래   승률Δ");
  for (const cov of [1.0, 0.5, 0.3, 0.2, 0.1]) {
    const n = Math.max(1, Math.floor(te.length * cov)), sub = te.slice(0, n);
    const wr = sub.reduce((a, r) => a + r.y, 0) / n, ex = sub.reduce((a, r) => a + r.ret, 0) / n;
    const mk = (wr >= 0.6) ? "  ★>60%" : wr > baseWr + 0.01 ? "  +향상" : "";
    console.log("  " + P(cov).padStart(6) + "  " + String(n).padStart(6) + "   " + P(wr) + "   " + Pe(ex) + "     " + (wr - baseWr >= 0 ? "+" : "") + P(wr - baseWr) + mk);
  }
  const FN = ["ret5", "ret10", "ret20", "ret60", "rsi", "rsiSlope", "%B", "macd", "distMA20", "distMA50", "distMA200", "slMA20", "slMA50", "slMA200", "vol20", "volR", "range20", "range60", "dd60", "ru60", "%B×volR", "dd×rsiSlope", "range60×slMA200", "%B×slMA200", "dd×slMA200"];
  const imp = m.w.map((v, j) => ({ j, v })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 7);
  console.log("\n영향 큰 피처: " + imp.map(o => FN[o.j] + "(" + o.v.toFixed(2) + ")").join(" · "));
  console.log("→ ML상위 선별 시 승률·기대값이 전체보다 오르면(vol이 유일요인 아니면) = 메타필터 유효 → 엔진 반영.");
}
main();
