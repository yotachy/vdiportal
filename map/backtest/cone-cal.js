// backtest/cone-cal.js — 예측 콘(밴드) 폭 보정. 변동성 예측 가능(상관0.79)인데 콘이 과대(커버86%).
// 앵커±스케일×(밴드)로 스케일 스윕 → 커버리지 ~68% 되는 배수 탐색.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");

const WARMUP = 200, LOOKBACK = 600, STRIDE = 12;
function horizonForTF() { return 60; }

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const recs = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), N = price.length, H = 60;
    const g = B.standardGraph();
    for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
      const p = r.prediction; if (!p || !p.path || !p.lo || !p.hi) continue;
      const anchor = (p.anchor != null && isFinite(p.anchor)) ? p.anchor : p.path[0];
      const lo = p.lo[H - 1], hi = p.hi[H - 1], actual = price[t + H];
      if (![anchor, lo, hi, actual].every(isFinite) || !(hi > lo)) continue;
      recs.push({ anchor, lo, hi, actual, pred: p.path[H - 1] });
    }
    console.error("  " + fx.symbol);
  }
  const P = x => (x * 100).toFixed(1) + "%";
  console.log("\n=== 콘 폭 스케일 → 커버리지 (" + recs.length + "시점, 지평60봉) ===");
  console.log("현재 스케일 1.0 = 배포 콘. 목표 커버 ~68%(정규 ±1σ).\n");
  // 로그공간에서 앵커 기준 밴드 스케일
  for (const sc of [1.0, 0.9, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5]) {
    let cov = 0, n = 0;
    for (const r of recs) {
      const loS = r.anchor * Math.pow(r.lo / r.anchor, sc);
      const hiS = r.anchor * Math.pow(r.hi / r.anchor, sc);
      n++; if (r.actual >= Math.min(loS, hiS) && r.actual <= Math.max(loS, hiS)) cov++;
    }
    const c = cov / n, mark = (c >= 0.66 && c <= 0.72) ? "  ★목표근접" : "";
    console.log("스케일 " + sc.toFixed(2) + " → 커버 " + P(c) + mark);
  }
  console.log("\n→ 커버 68% 되는 스케일을 콘에 곱하면 밴드가 실제 변동성에 정합(과대 해소).");
}
main();
