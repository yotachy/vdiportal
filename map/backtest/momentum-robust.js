// backtest/momentum-robust.js — 횡단면 모멘텀 견고성 검증(롱온리·거래비용·기간분할·K·유니버스).
// 엔진 불필요(가격만). momentum-xs 확장.
"use strict";
const fs = require("fs"), path = require("path");

const US = ["AAPL", "MSFT", "NVDA", "INTC", "BABA", "PYPL", "DIS", "T", "IBM", "CSCO", "VZ", "PFE", "KO", "GE"];
const HOLD = 20, COST = 0.001;   // 리밸런싱 주기 · 편도 거래비용(0.1%)

function load() {
  const dir = path.join(__dirname, "fixtures");
  const series = {}; let minLen = Infinity;
  for (const s of US) { const p = path.join(dir, s + "-1day.json"); if (!fs.existsSync(p)) continue; const c = JSON.parse(fs.readFileSync(p, "utf8")).candle.map(x => x.c); series[s] = c; minLen = Math.min(minLen, c.length); }
  const syms = Object.keys(series); for (const s of syms) series[s] = series[s].slice(-minLen);
  return { series, syms, minLen };
}

function run(series, syms, LB, K, t0, t1, longOnly, cost) {
  const spreads = [], longEx = []; let wins = 0, n = 0;
  for (let t = Math.max(LB, t0); t <= t1 - HOLD - 1; t += HOLD) {
    const mom = syms.map(s => ({ s, m: series[s][t] / series[s][t - LB] - 1, fwd: series[s][t + HOLD] / series[s][t] - 1 })).filter(o => isFinite(o.m) && isFinite(o.fwd));
    if (mom.length < 2 * K) continue;
    mom.sort((a, b) => b.m - a.m);
    const longs = mom.slice(0, K), shorts = mom.slice(-K);
    const lr = longs.reduce((a, o) => a + o.fwd, 0) / K, sr = shorts.reduce((a, o) => a + o.fwd, 0) / K;
    const mkt = mom.reduce((a, o) => a + o.fwd, 0) / mom.length;   // 등가중 전체(시장)
    const c = cost ? COST * 2 : 0;   // 왕복 비용
    if (longOnly) { spreads.push(lr - mkt - c); longEx.push(lr - mkt); if (lr - mkt - c > 0) wins++; }
    else { spreads.push(lr - sr - 2 * c); if (lr - sr - 2 * c > 0) wins++; }
    n++;
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  let eq = 1; for (const s of spreads) eq *= (1 + s);
  return { avg: avg(spreads), win: n ? wins / n : 0, cum: eq - 1, n };
}

function main() {
  const { series, syms, minLen } = load();
  const P = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";
  console.log("종목 " + syms.length + " · 길이 " + minLen + "봉 · 리밸 " + HOLD + "봉 · 비용 왕복 " + P(COST * 2) + "\n");

  console.log("=== A) 롱숏 vs 롱온리(초과) · 거래비용 반영 (LB=250·K=4) ===");
  for (const [nm, lo, cost] of [["롱숏(무비용)", false, false], ["롱숏(비용)", false, true], ["롱온리 초과(무비용)", true, false], ["롱온리 초과(비용)", true, true]]) {
    const r = run(series, syms, 250, 4, 250, minLen, lo, cost);
    console.log("  " + nm.padEnd(18) + " 회당 " + P(r.avg) + " · 승률 " + (r.win * 100).toFixed(0) + "% · 누적 " + P(r.cum) + " (" + r.n + "회)");
  }
  console.log("\n=== B) 기간 분할(안정성) — 롱숏 비용반영 LB=250·K=4 ===");
  const mid = Math.floor((250 + minLen) / 2);
  for (const [nm, a, b] of [["전체", 250, minLen], ["전반부", 250, mid], ["후반부", mid, minLen]]) {
    const r = run(series, syms, 250, 4, a, b, false, true);
    console.log("  " + nm.padEnd(8) + " 회당 " + P(r.avg) + " · 승률 " + (r.win * 100).toFixed(0) + "% (" + r.n + "회)");
  }
  console.log("\n=== C) 파라미터 강건성 — 롱숏 비용반영 ===");
  for (const LB of [60, 120, 250]) for (const K of [3, 4, 5]) {
    const r = run(series, syms, LB, K, 250, minLen, false, true);
    console.log("  LB" + String(LB).padStart(3) + "·K" + K + " → 회당 " + P(r.avg) + " · 승률 " + (r.win * 100).toFixed(0) + "% (" + r.n + "회)");
  }
  console.log("\n→ 비용 후에도 양(+)·후반부 유지·다양한 LB/K서 견고하면 진짜 팩터.");
}
main();
