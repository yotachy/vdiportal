// backtest/meta-lab2.js — 메타라벨링 2단계: ① 상호작용 피처(비선형) ② 타깃 2종(방향 + 트리플배리어).
// 트리플배리어(±4% H내 먼저 터치)는 방향보다 예측가능(지지반등 62% pocket 존재) → ML이 >60% 부분집합 찾나?
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, STRIDE = 2, WARM = 220, TRAIN_FRAC = 0.65, TB = 0.04;
function sma(a, e, n) { if (e < n - 1) return null; let s = 0; for (let i = e - n + 1; i <= e; i++) s += a[i]; return s / n; }
function stdev(a, e, n, m) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += (a[i] - m) ** 2; return Math.sqrt(s / n); }
function rsiAt(a, n, e) { if (e < n) return null; let g = 0, l = 0; for (let i = e - n + 1; i <= e; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); }
function ema(a, e, n) { const k = 2 / (n + 1); let v = a[Math.max(0, e - n * 3)]; for (let i = Math.max(1, e - n * 3 + 1); i <= e; i++) v = a[i] * k + v * (1 - k); return v; }

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
  const distMA200 = (c / ma200 - 1) * 100, slMA200 = (ma200 / ma200p - 1) * 100, slMA50 = (ma50 / ma50p - 1) * 100, slMA20 = (ma20 / ma20p - 1) * 100;
  const range60 = hi60 > lo60 ? (c - lo60) / (hi60 - lo60) - 0.5 : 0, range20 = hi20 > lo20 ? (c - lo20) / (hi20 - lo20) - 0.5 : 0;
  const rsiSlope = (rsi - rsi3) / 20, volR = vol60 ? vol20 / vol60 - 1 : 0, rsiN = (rsi - 50) / 50;
  let up = 0; for (let i = t; i > t - 10 && price[i] > price[i - 1]; i--) up++;
  const base = [
    c / price[t - 5] - 1, c / price[t - 10] - 1, c / price[t - 20] - 1, c / price[t - 60] - 1,
    rsiN, rsiSlope, pctB, macd / c * 100,
    (c / ma20 - 1) * 100, (c / ma50 - 1) * 100, distMA200, slMA20, slMA50, slMA200,
    vol20 * 100, volR, range20, range60, dd * 100, ru * 100, up / 10,
    // 상호작용(비선형 pocket 포착): 과매도×저변동, 낙폭×RSI반등, 레인지위치×추세, 과매도×추세비하락
    pctB * (volR), dd * rsiSlope * 10, range60 * slMA200, pctB * slMA200, rsiN * slMA200, dd * slMA200,
  ];
  return base;
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
function covCurve(name, TE, model, baseKey) {
  const te = TE.map(r => ({ p: model.pred(r.x), y: r[baseKey] })).sort((a, b) => Math.abs(b.p - 0.5) - Math.abs(a.p - 0.5));
  const base = TE.reduce((a, r) => a + r[baseKey], 0) / TE.length;
  const P = x => (x * 100).toFixed(1) + "%";
  console.log("\n[" + name + "] test " + TE.length + " · 무조건 베이스 " + P(base));
  console.log("  커버리지  베팅수   적중(P>0.5=1)   베이스대비   1콜%");
  for (const cov of [1.0, 0.3, 0.2, 0.1, 0.05, 0.02]) {
    const n = Math.max(1, Math.floor(te.length * cov)), sub = te.slice(0, n);
    let hit = 0, one = 0; for (const r of sub) { const call = r.p >= 0.5 ? 1 : 0; if (call === r.y) hit++; if (call === 1) one++; }
    const hr = hit / n, mk = (hr >= 0.6 && hr > base) ? "  ★>60%&초과" : hr > base + 0.01 ? "  +초과" : "";
    console.log("    " + P(cov).padStart(6) + "  " + String(n).padStart(6) + "     " + P(hr) + "      " + (hr - base >= 0 ? "+" : "") + P(hr - base) + "    " + P(one / n) + mk);
  }
}

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const TR = [], TE = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
    if (N < WARM + H + 40) continue;
    const rows = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) {
      const x = feats(price, t); if (!x || x.some(v => !isFinite(v))) continue;
      let tb = 0; const tg = price[t] * (1 + TB), st = price[t] * (1 - TB);   // 트리플배리어 ±4%
      for (let k = t + 1; k <= t + H; k++) { if (hi[k] >= tg) { tb = 1; break; } if (lo[k] <= st) { tb = 0; break; } }
      rows.push({ x, yDir: price[t + H] > price[t] ? 1 : 0, yTB: tb });
    }
    const cut = Math.floor(rows.length * TRAIN_FRAC);
    for (let i = 0; i < rows.length; i++) (i < cut ? TR : TE).push(rows[i]);
  }
  const D = TR[0].x.length;
  console.log("=== 메타라벨링 2단계 (일봉 " + files.length + "종 · 피처 " + D + "[상호작용포함] · 지평 " + H + ") ===");
  console.log("train " + TR.length + " · test " + TE.length);
  const mDir = train(TR.map(r => ({ x: r.x, y: r.yDir })), D);
  const mTB = train(TR.map(r => ({ x: r.x, y: r.yTB })), D);
  covCurve("타깃=방향(up/down)", TE, mDir, "yDir");
  covCurve("타깃=트리플배리어(+4%먼저)", TE, mTB, "yTB");
  console.log("\n→ 트리플배리어 커버리지 낮출 때 ★(>60%&초과)면 = ML이 진입우위 부분집합을 선별 → 메타라벨링 실전화 가능.");
}
main();
