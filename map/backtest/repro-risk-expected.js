// backtest/repro-risk-expected.js — 스코어카드 재현 위젯의 리스크모델(변동성·낙폭·이익목표) 종목별 기대값 산출.
// 위젯과 동일 walk-forward(H=60·WARMUP200·LOOKBACK600·STRIDE10) + 리스크모델 20봉 채점.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const H = 60, WARMUP = 200, LOOKBACK = 600, STRIDE = 10, DDH = 20;
function rvol(p, e, n) { let s = 0, c = 0; for (let i = e - n + 1; i <= e; i++) { if (i < 1) continue; const a = p[i - 1], b = p[i]; if (a > 0 && b > 0) { const lr = Math.log(b / a); s += lr * lr; c++; } } return c ? Math.sqrt(s / c) : 0; }
const SYMS = process.argv.slice(2).length ? process.argv.slice(2) : ["BABA", "PYPL", "PFE", "NVDA"];
const dir = path.join(__dirname, "fixtures");
for (const sym of SYMS) {
  const f = path.join(dir, sym + "-1day.json");
  if (!fs.existsSync(f)) { console.log(sym + ": (fixture 없음)"); continue; }
  const fx = JSON.parse(fs.readFileSync(f, "utf8"));
  const candle = fx.candle, price = candle.map(c => c.c), N = price.length;
  const g = FC.sampleGraph(); (g.nodes || []).forEach(n => { if (n.conviction) n.conviction = 0; });
  let volN = 0, volHit = 0, ddN = 0, ddEv = 0, ddPS = 0, upN = 0, upEv = 0, upPS = 0;
  for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
    if (t + DDH >= N || t - DDH < 0) continue;
    const s0 = Math.max(0, t + 1 - LOOKBACK);
    let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) }, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
    const ctx = r.verdict && r.verdict.context; if (!ctx) continue;
    const vf = ctx.volForecast, dd = ctx.ddRisk, ut = ctx.upTarget;
    // 변동성: 예측 expand vs 실제(20봉 후 vs 전)
    if (vf) { const vb = rvol(price, t, DDH), va = rvol(price, t + DDH, DDH); if (vb > 0 && va > 0) { volN++; if ((vf.expand ? 1 : 0) === (va > vb ? 1 : 0)) volHit++; } }
    // 낙폭/이익목표: 20봉 ±5%
    let lo = Infinity, hi = -Infinity; for (let i = t + 1; i <= t + DDH; i++) { const c = price[i]; if (c < lo) lo = c; if (c > hi) hi = c; }
    const a = price[t];
    if (dd && dd.curve && dd.curve[0]) { ddN++; ddEv += (lo / a - 1 <= -0.05) ? 1 : 0; ddPS += dd.curve[0].prob; }
    if (ut && ut.curve && ut.curve[0]) { upN++; upEv += (hi / a - 1 >= 0.05) ? 1 : 0; upPS += ut.curve[0].prob; }
  }
  const pc = x => (x * 100).toFixed(1);
  console.log(sym + ": " +
    `vol=${volN ? (volHit / volN).toFixed(3) : "–"}(n${volN}) ` +
    `dd_pred=${ddN ? (ddPS / ddN / 100).toFixed(3) : "–"} dd_act=${ddN ? (ddEv / ddN).toFixed(3) : "–"}(n${ddN}) ` +
    `up_pred=${upN ? (upPS / upN / 100).toFixed(3) : "–"} up_act=${upN ? (upEv / upN).toFixed(3) : "–"}(n${upN})`);
}
