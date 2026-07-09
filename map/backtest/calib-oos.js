// backtest/calib-oos.js — 확률 캘리브레이션 OOS 검증. train(과거)로 Platt 적합 → test(미래) ECE 측정.
// in-sample 신기루 방지: 맵이 미래에도 ECE를 줄이면 진짜(단조맵이라 방향 불변·안전).
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const M = require("./metrics.js");
const B = require("./backtest.js");
const WARM = 200, LOOKBACK = 600, H = 60, STRIDE = 10, TRAIN_FRAC = 0.6;
const logit = p => Math.log(Math.min(0.999, Math.max(0.001, p)) / (1 - Math.min(0.999, Math.max(0.001, p)))), sig = x => 1 / (1 + Math.exp(-x));

function ece(recs) {   // 10% 빈 가중 |pred-act|
  const bins = {}; for (const r of recs) { const b = Math.min(9, Math.floor(r.p * 10)); (bins[b] = bins[b] || []).push(r); }
  let e = 0, n = 0; for (const k in bins) { const g = bins[k]; const mp = g.reduce((a, r) => a + r.p, 0) / g.length, ma = g.reduce((a, r) => a + r.y, 0) / g.length; e += g.length * Math.abs(mp - ma); n += g.length; }
  return n ? e / n : 0;
}
function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const TR = [], TE = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), N = price.length; if (N < WARM + H + 40) continue;
    const g = B.standardGraph(); const recs = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
      const up = M.upProbFromPrediction(r.prediction); if (up == null) continue;
      recs.push({ p: up / 100, y: price[t + H] > price[t] ? 1 : 0 });
    }
    const cut = Math.floor(recs.length * TRAIN_FRAC);
    for (let i = 0; i < recs.length; i++) (i < cut ? TR : TE).push(recs[i]);
    console.error("  " + fx.symbol);
  }
  // Platt 적합(train): actual_logit ≈ A*pred_logit + B (빈 가중)
  const bins = {}; for (const r of TR) { const b = Math.min(9, Math.floor(r.p * 10)); (bins[b] = bins[b] || []).push(r); }
  let sx = 0, sy = 0, sxx = 0, sxy = 0, sw = 0;
  for (const k in bins) { const g = bins[k]; const mp = g.reduce((a, r) => a + r.p, 0) / g.length, ma = g.reduce((a, r) => a + r.y, 0) / g.length; const x = logit(mp), y = logit(ma), w = g.length; sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y; }
  const A = (sw * sxy - sx * sy) / (sw * sxx - sx * sx), Bc = (sy - A * sx) / sw;
  const cal = p => sig(A * logit(p) + Bc);
  const teRaw = TE.map(r => ({ p: r.p, y: r.y })), teCal = TE.map(r => ({ p: cal(r.p), y: r.y }));
  const trRaw = TR.map(r => ({ p: r.p, y: r.y })), trCal = TR.map(r => ({ p: cal(r.p), y: r.y }));
  const P = x => (x * 100).toFixed(2) + "%p";
  console.log("\n=== 확률 캘리브레이션 OOS 검증 (일봉 " + files.length + "종) ===");
  console.log("train " + TR.length + " · test " + TE.length + " · Platt A=" + A.toFixed(4) + " B=" + Bc.toFixed(4));
  console.log("TRAIN ECE  전 " + P(ece(trRaw)) + " → 후 " + P(ece(trCal)) + "  (in-sample)");
  console.log("TEST  ECE  전 " + P(ece(teRaw)) + " → 후 " + P(ece(teCal)) + "  ← 이게 개선되면 진짜(OOS)");
  // 방향 불변 확인(단조맵이라 sign 안 바뀜)
  console.log("\n교정 예시: " + [0.35, 0.5, 0.65, 0.8].map(p => (p * 100).toFixed(0) + "%→" + (cal(p) * 100).toFixed(0) + "%").join(" · "));
  console.log("→ TEST ECE가 줄면 캘리브레이션 반영. 단조맵이라 방향예측/신호는 불변(안전).");
}
main();
