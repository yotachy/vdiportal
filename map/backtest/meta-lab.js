// backtest/meta-lab.js — 메타라벨링 1단계: 풍부한 피처로 '예측가능한 부분집합' 존재 검증.
// 엔진 불필요(가격 피처만)·로지스틱 회귀·시간분할(train 과거/test 미래, 미래 미참조)·커버리지-정밀도 곡선.
// 핵심 질문: 확신 높은 상위 X%만 베팅하면 방향 승률 >60% & 항상상승 초과가 나오나?
"use strict";
const fs = require("fs"), path = require("path");

const H = 20, STRIDE = 2, WARM = 220, TRAIN_FRAC = 0.65;
function sma(a, e, n) { if (e < n - 1) return null; let s = 0; for (let i = e - n + 1; i <= e; i++) s += a[i]; return s / n; }
function stdev(a, e, n, m) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += (a[i] - m) ** 2; return Math.sqrt(s / n); }
function rsiAt(a, n, e) { if (e < n) return null; let g = 0, l = 0; for (let i = e - n + 1; i <= e; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); }
function ema(a, e, n) { const k = 2 / (n + 1); let v = a[Math.max(0, e - n * 3)]; for (let i = Math.max(1, e - n * 3 + 1); i <= e; i++) v = a[i] * k + v * (1 - k); return v; }

function feats(price, t) {
  const c = price[t];
  const ma20 = sma(price, t, 20), ma50 = sma(price, t, 50), ma200 = sma(price, t, 200);
  const ma20p = sma(price, t - 10, 20), ma50p = sma(price, t - 10, 50), ma200p = sma(price, t - 20, 200);
  if (!ma20 || !ma50 || !ma200 || !ma20p || !ma50p || !ma200p) return null;
  const sd20 = stdev(price, t, 20, ma20);
  const rsi = rsiAt(price, 14, t), rsi3 = rsiAt(price, 14, t - 3);
  if (rsi == null || rsi3 == null || !sd20) return null;
  const macd = ema(price, t, 12) - ema(price, t, 26), macdSig = (function () { /* 9-ema of macd approx */ let s = 0, cnt = 0; for (let i = t - 8; i <= t; i++) { s += ema(price, i, 12) - ema(price, i, 26); cnt++; } return s / cnt; })();
  const hi60 = Math.max.apply(null, price.slice(t - 60, t + 1)), lo60 = Math.min.apply(null, price.slice(t - 60, t + 1));
  const hi20 = Math.max.apply(null, price.slice(t - 20, t + 1)), lo20 = Math.min.apply(null, price.slice(t - 20, t + 1));
  const vol20 = (function () { let s = 0; for (let i = t - 19; i <= t; i++) s += Math.log(price[i] / price[i - 1]) ** 2; return Math.sqrt(s / 20); })();
  const vol60 = (function () { let s = 0; for (let i = t - 59; i <= t; i++) s += Math.log(price[i] / price[i - 1]) ** 2; return Math.sqrt(s / 60); })();
  let up = 0; for (let i = t; i > t - 10 && price[i] > price[i - 1]; i--) up++;
  return [
    price[t] / price[t - 5] - 1, price[t] / price[t - 10] - 1, price[t] / price[t - 20] - 1, price[t] / price[t - 60] - 1,   // 모멘텀 5/10/20/60
    (rsi - 50) / 50, (rsi - rsi3) / 20,                                     // RSI 수준·기울기
    ((c - (ma20 - 2 * sd20)) / (4 * sd20) - 0.5) * 2,                       // %B(중앙0)
    macd / c * 100, (macd - macdSig) / c * 100,                            // MACD·히스토그램
    (c / ma20 - 1) * 100, (c / ma50 - 1) * 100, (c / ma200 - 1) * 100,     // MA 거리
    (ma20 / ma20p - 1) * 100, (ma50 / ma50p - 1) * 100, (ma200 / ma200p - 1) * 100,   // MA 기울기
    vol20 * 100, vol60 ? vol20 / vol60 - 1 : 0,                            // 변동성·비율
    hi20 > lo20 ? (c - lo20) / (hi20 - lo20) - 0.5 : 0,                     // 20봉 레인지 위치
    hi60 > lo60 ? (c - lo60) / (hi60 - lo60) - 0.5 : 0,                     // 60봉 레인지 위치
    hi60 > 0 ? (c / hi60 - 1) * 100 : 0, lo60 > 0 ? (c / lo60 - 1) * 100 : 0,   // 낙폭/반등폭
    up / 10,                                                                // 연속 상승
  ];
}

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const TR = [], TE = [];   // {x:features, y:0/1}
  for (const f of files) {
    const price = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).candle.map(c => c.c), N = price.length;
    if (N < WARM + H + 40) continue;
    const rows = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) { const x = feats(price, t); if (!x || x.some(v => !isFinite(v))) continue; rows.push({ x, y: price[t + H] > price[t] ? 1 : 0 }); }
    const cut = Math.floor(rows.length * TRAIN_FRAC);       // 시간분할: 앞=train, 뒤=test(미래)
    for (let i = 0; i < rows.length; i++) (i < cut ? TR : TE).push(rows[i]);
  }
  const D = TR[0].x.length;
  // 표준화(train 통계)
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  // 로지스틱 회귀 (경사하강 + L2)
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 1e-3, EP = 300;
  for (let ep = 0; ep < EP; ep++) {
    const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length;
  }
  const pred = x => { const zx = z(x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; return 1 / (1 + Math.exp(-s)); };
  // 테스트: 확신도(|p-0.5|)순 커버리지-정밀도
  const te = TE.map(r => ({ p: pred(r.x), y: r.y })); te.sort((a, b2) => Math.abs(b2.p - 0.5) - Math.abs(a.p - 0.5));
  const baseUp = TE.reduce((a, r) => a + r.y, 0) / TE.length;   // 테스트셋 항상상승
  const P = x => (x * 100).toFixed(1) + "%";
  console.log("=== 메타라벨링 1단계: 방향 예측가능 부분집합 (일봉 " + files.length + "종) ===");
  console.log("train " + TR.length + " · test " + TE.length + " · 피처 " + D + " · 지평 " + H + "봉");
  console.log("테스트셋 항상상승 베이스라인: " + P(baseUp) + "  (이걸·60%를 동시에 넘어야 진짜)\n");
  console.log("커버리지  베팅수   방향승률   항상상승대비   상승콜%");
  for (const cov of [1.0, 0.5, 0.3, 0.2, 0.1, 0.05]) {
    const n = Math.max(1, Math.floor(te.length * cov)), sub = te.slice(0, n);
    let hit = 0, upc = 0; for (const r of sub) { const call = r.p >= 0.5 ? 1 : 0; if (call === r.y) hit++; if (call === 1) upc++; }
    const hr = hit / n, mark = (hr >= 0.6 && hr > baseUp) ? "  ★>60%&초과" : hr > baseUp ? "  +초과" : "";
    console.log("  " + P(cov).padStart(6) + "  " + String(n).padStart(6) + "   " + P(hr) + "   " + (hr - baseUp >= 0 ? "+" : "") + P(hr - baseUp) + "     " + P(upc / n) + mark);
  }
  // 상위 피처(가중치 절대값)
  const imp = w.map((v, j) => ({ j, v })).sort((a, b2) => Math.abs(b2.v) - Math.abs(a.v)).slice(0, 6);
  const FN = ["ret5", "ret10", "ret20", "ret60", "rsi", "rsiSlope", "%B", "macd", "macdHist", "distMA20", "distMA50", "distMA200", "slMA20", "slMA50", "slMA200", "vol20", "volRatio", "range20", "range60", "dd60", "ru60", "upStreak"];
  console.log("\n영향 큰 피처: " + imp.map(o => FN[o.j] + "(" + o.v.toFixed(2) + ")").join(" · "));
  console.log("\n→ 커버리지 낮출수록 승률 오르고 ★(>60%&항상상승초과)가 나오면 = 예측가능 부분집합 존재 → 메타라벨링 유효.");
}
main();
