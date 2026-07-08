// backtest/bounce-lab.js — 반등/평균회귀 셋업을 트리플배리어로 평가(방향 아닌 '목표먼저' 우위).
// 여러 진입조건 × 대칭(±5%)·비대칭(+6/−4%) 배리어 · 목표먼저%·기대값·랜덤대조.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");

const WARMUP = 200, LOOKBACK = 600, H = 40, STRIDE = 6;
function sma(a, e, n) { if (e < n - 1) return null; let s = 0; for (let i = e - n + 1; i <= e; i++) s += a[i]; return s / n; }
function pctB(price, e) { const w = price.slice(0, e + 1), m = sma(w, w.length - 1, 20); if (m == null) return null; let sd = 0; for (let i = w.length - 20; i < w.length; i++) sd += (w[i] - m) ** 2; sd = Math.sqrt(sd / 20); if (!sd) return null; return (price[e] - (m - 2 * sd)) / (4 * sd); }
function rsiAt(a, n, e) { if (e < n) return null; let g = 0, l = 0; for (let i = e - n + 1; i <= e; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); }

function barrier(hi, lo, t, entry, up, dn) { // +1 목표먼저 / -1 손절먼저 / 0 무터치
  const tg = entry * (1 + up), st = entry * (1 - dn);
  for (let k = t + 1; k <= t + H; k++) { if (hi[k] >= tg) return 1; if (lo[k] <= st) return -1; }
  return 0;
}

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const recs = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
    const g = B.standardGraph();
    for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: 60, timeframe: "1day" }); } catch (e) { continue; }
      const ctx = r.verdict && r.verdict.context; if (!ctx) continue;
      const pb = pctB(price, t), rsi = rsiAt(price, 14, t), rsi3 = rsiAt(price, 14, t - 3);
      const m200 = sma(price, t, 200), m200p = t >= 220 ? sma(price, t - 20, 200) : null;
      if (pb == null || rsi == null) continue;
      const hh = Math.max(...price.slice(Math.max(0, t - 60), t + 1));
      recs.push({
        state: ctx.state, opp: ctx.opportunity ? ctx.opportunity.kind : null,
        pb, rsi, rsiUp: rsi3 != null ? rsi - rsi3 : 0,
        ma200down: (m200 && m200p) ? (m200 < m200p ? 1 : 0) : 0,
        ret60: t >= 60 ? price[t] / price[t - 60] - 1 : 0,
        dd: hh > 0 ? price[t] / hh - 1 : 0,   // 최근 60봉 고점 대비 낙폭
        b5: barrier(hi, lo, t, price[t], 0.05, 0.05),      // 대칭 ±5%
        b64: barrier(hi, lo, t, price[t], 0.06, 0.04),     // 비대칭 +6/−4 (R:R 1.5)
        fwd: price[t + H] / price[t] - 1,
      });
    }
    console.error("  " + fx.symbol);
  }
  const P = x => (x * 100).toFixed(1) + "%";
  function ev(rs, key) { const d = rs.filter(r => r[key] !== 0); const tg = d.filter(r => r[key] === 1).length; return { n: rs.length, dec: d.length, tf: d.length ? tg / d.length : 0, exp: rs.reduce((a, r) => a + r.fwd, 0) / (rs.length || 1) }; }
  const setups = [
    ["전체(아무때나)", r => true],
    ["현행 지지반등(opp=buy)", r => r.opp === "buy"],
    ["횡보+깊은눌림(%B≤.2·RSI반등)", r => r.state === "range" && r.pb <= 0.2 && r.rsiUp > 0],
    ["하락후반등(down국면·RSI반등)", r => r.state === "down" && r.rsiUp > 0],
    ["큰낙폭후반등(dd≤-12%·RSI반등)", r => r.dd <= -0.12 && r.rsiUp > 0],
    ["과매도반등(%B≤.15·RSI반등·200MA비하락)", r => r.pb <= 0.15 && r.rsiUp > 0 && !r.ma200down],
    ["낙폭+과매도+반등(dd≤-10·%B≤.2·RSI반등)", r => r.dd <= -0.10 && r.pb <= 0.2 && r.rsiUp > 0],
    ["범위확장: 횡보OR하락 + %B≤.2 + RSI반등", r => (r.state === "range" || r.state === "down") && r.pb <= 0.2 && r.rsiUp > 0],
  ];
  console.log("\n=== 반등 셋업 트리플배리어 (" + recs.length + "시점 · 지평" + H + "봉) ===");
  console.log("목표먼저%: 대칭±5% / 비대칭+6-4%(RR1.5) · 기대값=" + H + "봉 평균수익\n");
  for (const [nm, f] of setups) {
    const rs = recs.filter(f); if (rs.length < 40) { console.log("  " + nm.padEnd(38) + " (표본부족 " + rs.length + ")"); continue; }
    const s5 = ev(rs, "b5"), s64 = ev(rs, "b64");
    const g5 = s5.tf >= 0.6 ? " ★" : "";
    console.log("  " + nm.padEnd(38) + " n=" + String(rs.length).padStart(4) + " · 목표먼저 ±5% " + P(s5.tf) + g5 + " · +6/-4 " + P(s64.tf) + " · 기대값 " + (s5.exp >= 0 ? "+" : "") + P(s5.exp));
  }
  console.log("\n→ 목표먼저 ±5%>60%(★) & 비대칭서도 높으면 진짜 진입우위. 현행 지지반등보다 나은/보완 셋업 채택.");
}
main();
