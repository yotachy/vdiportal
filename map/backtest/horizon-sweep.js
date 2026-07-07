// backtest/horizon-sweep.js — 지평별 방향 예측력 측정
// 방향 시그널(verdict.score=_dirSig)은 futW 무관 → 시점당 run() 1회, 여러 지평의 실제 결과와 대조.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const M = require("./metrics.js");
const B = require("./backtest.js");

const WARMUP = 200, LOOKBACK = 600;
const HORIZONS = [3, 5, 10, 20, 40, 60];
const MAXH = Math.max(...HORIZONS);

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  const fixtures = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const byH = {}, byHreg = {};   // 전체 / 국면별
  HORIZONS.forEach(h => { byH[h] = []; byHreg[h] = { bull: [], bear: [], side: [] }; });

  for (const fx of fixtures) {
    const _t0 = Date.now();
    const price = fx.candle.map(c => c.c), candle = fx.candle, N = price.length;
    const tf = fx.tf, STRIDE = /일|day/.test(tf) ? 10 : 3;
    const graph = B.standardGraph();
    const bh = price[N - 1] / price[WARMUP] - 1;
    const regime = B.classifyRegime ? B.classifyRegime(bh) : (bh > 0.3 ? "bull" : bh < -0.1 ? "bear" : "side");
    let pts = 0;
    for (let t = WARMUP; t <= N - MAXH - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      const past = { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) };
      let r; try { r = FC.run(graph, past, { futW: 60, timeframe: tf }); } catch (e) { continue; }
      if (!r.verdict) continue;
      const dir = Math.sign(r.verdict.score || 0); pts++;
      for (const H of HORIZONS) { const rec = { dir, base: price[t], actual: price[t + H] }; byH[H].push(rec); byHreg[H][regime].push(rec); }
    }
    console.error("  " + fx.symbol + " " + fx.tf + " (" + regime + ") → " + pts + "시점 (" + ((Date.now() - _t0) / 1000).toFixed(0) + "s)");
  }

  const P = x => x == null ? "  – " : (x * 100).toFixed(1).padStart(5) + "%";
  console.log("\n=== 지평별 방향 예측력 (엔진 vs 항상상승) ===");
  console.log("지평 |  엔진   항상상승   초과(lift) | 강세콜  약세콜 | n");
  const report = { generatedAt: process.env.BT_STAMP || null, horizons: {} };
  for (const H of HORIZONS) {
    const d = M.directionHitRate(byH[H]), b = M.baselines(byH[H]);
    const lift = (d.rate != null && b.alwaysUpHitRate != null) ? d.rate - b.alwaysUpHitRate : null;
    console.log(String(H).padStart(3) + "봉| " + P(d.rate) + "  " + P(b.alwaysUpHitRate) + "   " + (lift >= 0 ? "+" : "") + (lift * 100).toFixed(1) + "%p" + (lift > 0 ? " ✅" : " 🔴") + " | " + P(d.bullRate) + " " + P(d.bearRate) + " | " + d.n);
    report.horizons[H] = { engine: d.rate, alwaysUp: b.alwaysUpHitRate, lift, bullCall: d.bullRate, bearCall: d.bearRate, n: d.n };
  }
  console.log("\n국면별 초과성과(lift %p) — 지평별:");
  console.log("지평 | 강세장  하락장  횡보장");
  for (const H of HORIZONS) {
    const row = ["bull", "bear", "side"].map(k => { const rec = byHreg[H][k]; if (!rec.length) return "  –  "; const d = M.directionHitRate(rec), b = M.baselines(rec); const l = d.rate - b.alwaysUpHitRate; return ((l >= 0 ? "+" : "") + (l * 100).toFixed(1)).padStart(6); });
    console.log(String(H).padStart(3) + "봉| " + row.join("  "));
  }
  fs.writeFileSync(path.join(__dirname, "horizon-report.json"), JSON.stringify(report, null, 2));
  console.log("\n→ horizon-report.json 기록");
}

if (require.main === module) main();
module.exports = { main };
