// backtest/meta-lab3.js — 메타라벨링 3단계: 변동성 함정 제거.
// 배리어를 ATR로 정규화(±1.5×ATR) + 터치된 봉만(decided) → 순수 "어느 방향 먼저" 예측력만 측정.
// base가 ~50%인데 ML이 부분집합서 >60%면 = 진짜 방향/평균회귀 edge(변동성 재탕 아님).
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, STRIDE = 2, WARM = 220, TRAIN_FRAC = 0.65, ATRK = 1.5;
function sma(a, e, n) { if (e < n - 1) return null; let s = 0; for (let i = e - n + 1; i <= e; i++) s += a[i]; return s / n; }
function stdev(a, e, n, m) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += (a[i] - m) ** 2; return Math.sqrt(s / n); }
function rsiAt(a, n, e) { if (e < n) return null; let g = 0, l = 0; for (let i = e - n + 1; i <= e; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); }
function ema(a, e, n) { const k = 2 / (n + 1); let v = a[Math.max(0, e - n * 3)]; for (let i = Math.max(1, e - n * 3 + 1); i <= e; i++) v = a[i] * k + v * (1 - k); return v; }
function atrAt(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n; }

function feats(price, t) {
  const c = price[t];
  const ma20 = sma(price, t, 20), ma50 = sma(price, t, 50), ma200 = sma(price, t, 200);
  const ma200p = sma(price, t - 20, 200), ma50p = sma(price, t - 10, 50), ma20p = sma(price, t - 10, 20);
  if (!ma20 || !ma50 || !ma200 || !ma200p || !ma50p || !ma20p) return null;
  const sd20 = stdev(price, t, 20, ma20); if (!sd20) return null;
  const rsi = rsiAt(price, 14, t), rsi3 = rsiAt(price, 14, t - 3); if (rsi == null || rsi3 == null) return null;
  const pctB = (c - (ma20 - 2 * sd20)) / (4 * sd20) - 0.5;
  const macd = ema(price, t, 12) - ema(price, t, 26);
  const hi60 = Math.max.apply(null, price.slice(t - 60, t + 1)), lo60 = Math.min.apply(null, price.slice(t - 60, t + 1));
  const hi20 = Math.max.apply(null, price.slice(t - 20, t + 1)), lo20 = Math.min.apply(null, price.slice(t - 20, t + 1));
  const vol20 = (function () { let s = 0; for (let i = t - 19; i <= t; i++) s += Math.log(price[i] / price[i - 1]) ** 2; return Math.sqrt(s / 20); })();
  const vol60 = (function () { let s = 0; for (let i = t - 59; i <= t; i++) s += Math.log(price[i] / price[i - 1]) ** 2; return Math.sqrt(s / 60); })();
  const dd = hi60 > 0 ? c / hi60 - 1 : 0, ru = lo60 > 0 ? c / lo60 - 1 : 0;
  const slMA200 = (ma200 / ma200p - 1) * 100, slMA50 = (ma50 / ma50p - 1) * 100, slMA20 = (ma20 / ma20p - 1) * 100;
  const range60 = hi60 > lo60 ? (c - lo60) / (hi60 - lo60) - 0.5 : 0, range20 = hi20 > lo20 ? (c - lo20) / (hi20 - lo20) - 0.5 : 0;
  const rsiSlope = (rsi - rsi3) / 20, volR = vol60 ? vol20 / vol60 - 1 : 0, rsiN = (rsi - 50) / 50;
  let up = 0; for (let i = t; i > t - 10 && price[i] > price[i - 1]; i--) up++;
  return [
    c / price[t - 5] - 1, c / price[t - 10] - 1, c / price[t - 20] - 1, c / price[t - 60] - 1,
    rsiN, rsiSlope, pctB, macd / c * 100,
    (c / ma20 - 1) * 100, (c / ma50 - 1) * 100, (c / ma200 - 1) * 100, slMA20, slMA50, slMA200,
    vol20 * 100, volR, range20, range60, dd * 100, ru * 100, up / 10,
    pctB * volR, dd * rsiSlope * 10, range60 * slMA200, pctB * slMA200, rsiN * slMA200, dd * slMA200,
  ];
}
function train(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.12, L2 = 2e-3, EP = 350;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return { pred: x => { const zx = z(x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; return 1 / (1 + Math.exp(-s)); }, w };
}
function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const TR = [], TE = []; let dec = 0, tot = 0;
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
    if (N < WARM + H + 40) continue;
    const rows = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) {
      const x = feats(price, t); if (!x || x.some(v => !isFinite(v))) continue;
      const atr = atrAt(hi, lo, price, t, 14); if (!atr) continue;
      const tg = price[t] + ATRK * atr, st = price[t] - ATRK * atr;   // ATR 정규화 배리어
      let y = -1; for (let k = t + 1; k <= t + H; k++) { if (hi[k] >= tg) { y = 1; break; } if (lo[k] <= st) { y = 0; break; } }
      tot++; if (y < 0) continue; dec++;   // decided(터치)만
      rows.push({ x, y });
    }
    const cut = Math.floor(rows.length * TRAIN_FRAC);
    for (let i = 0; i < rows.length; i++) (i < cut ? TR : TE).push(rows[i]);
  }
  const D = TR[0].x.length, P = x => (x * 100).toFixed(1) + "%";
  const m = train(TR, D);
  const te = TE.map(r => ({ p: m.pred(r.x), y: r.y })).sort((a, b) => Math.abs(b.p - 0.5) - Math.abs(a.p - 0.5));
  const base = TE.reduce((a, r) => a + r.y, 0) / TE.length;
  console.log("=== 메타라벨링 3단계: ATR정규화 배리어 · decided만 (일봉 " + files.length + "종) ===");
  console.log("배리어 ±" + ATRK + "×ATR · 터치율 " + P(dec / tot) + " · train " + TR.length + " test " + TE.length + " · 피처 " + D);
  console.log("무조건 '위 먼저' 비율(base): " + P(base) + " (≈50%면 변동성 중립 — 순수 방향력 테스트)\n");
  console.log("  커버리지  베팅수   적중   base대비   위콜%");
  for (const cov of [1.0, 0.5, 0.3, 0.2, 0.1, 0.05]) {
    const n = Math.max(1, Math.floor(te.length * cov)), sub = te.slice(0, n);
    let hit = 0, one = 0; for (const r of sub) { const call = r.p >= 0.5 ? 1 : 0; if (call === r.y) hit++; if (call === 1) one++; }
    const hr = hit / n, mk = (hr >= 0.6) ? "  ★>60%" : hr > base + 0.01 ? "  +초과" : "";
    console.log("    " + P(cov).padStart(6) + "  " + String(n).padStart(6) + "   " + P(hr) + "   " + (hr - base >= 0 ? "+" : "") + P(hr - base) + "   " + P(one / n) + mk);
  }
  const FN = ["ret5", "ret10", "ret20", "ret60", "rsi", "rsiSlope", "%B", "macd", "distMA20", "distMA50", "distMA200", "slMA20", "slMA50", "slMA200", "vol20", "volR", "range20", "range60", "dd60", "ru60", "upStreak", "%B×volR", "dd×rsiSlope", "range60×slMA200", "%B×slMA200", "rsi×slMA200", "dd×slMA200"];
  const imp = m.w.map((v, j) => ({ j, v })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 7);
  console.log("\n영향 큰 피처: " + imp.map(o => FN[o.j] + "(" + o.v.toFixed(2) + ")").join(" · "));
  console.log("→ 변동성(vol)이 상위 아니고, base≈50%인데 부분집합서 >60%면 = 진짜 방향 edge.");
}
main();
