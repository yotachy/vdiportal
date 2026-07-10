// backtest/repro-cone-expected.js — 재현 위젯 EXPECTED의 종목별 콘 커버리지 재계산(v1.7.1 콘 축소 반영).
// 위젯과 동일 walk-forward(H60·WARM200·LOOK600·STRIDE10) — 현행 forge-core(_CONE_CAL 적용) 그대로.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const H = 60, WARMUP = 200, LOOKBACK = 600, STRIDE = 10;
const SYMS = process.argv.slice(2).length ? process.argv.slice(2) : ["BABA", "PYPL", "PFE", "NVDA"];
const dir = path.join(__dirname, "fixtures");
for (const sym of SYMS) {
  const f = path.join(dir, sym + "-1day.json");
  if (!fs.existsSync(f)) { console.log(sym + ": (fixture 없음)"); continue; }
  const fx = JSON.parse(fs.readFileSync(f, "utf8"));
  const candle = fx.candle, price = candle.map(c => c.c), N = price.length;
  const g = FC.sampleGraph(); (g.nodes || []).forEach(n => { if (n.conviction) n.conviction = 0; });
  let cn = 0, cov = 0, dn = 0, hit = 0;
  for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
    const s0 = Math.max(0, t + 1 - LOOKBACK);
    let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) }, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
    const pr = r.prediction; if (!pr || !pr.lo || !pr.hi) continue;
    const loH = pr.lo[H - 1], hiH = pr.hi[H - 1], act = price[t + H];
    if (isFinite(loH) && isFinite(hiH)) { cn++; if (act >= loH && act <= hiH) cov++; }
    const real = Math.sign(act - price[t]), d = Math.sign(r.verdict.score || 0);
    if (d && real) { dn++; if ((d > 0 ? 1 : -1) === real) hit++; }
  }
  console.log(sym + ": cone=" + (cn ? (cov / cn).toFixed(3) : "–") + "(n" + cn + ") dir=" + (dn ? (hit / dn).toFixed(3) : "–"));
}
