// backtest/dipbounce-lab.js — '하락후/깊은낙폭 반등' 후보 신호 엄밀 검증(P&L·랜덤·종목별).
// 현행 지지반등(range 한정)을 넘어 하락국면/큰낙폭 반등까지 잡을지 — falling knife 아닌지 확인.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");

const WARMUP = 200, LOOKBACK = 600, STRIDE = 5, HOLDS = [10, 20, 40], MAXH = 40;
function sma(a, e, n) { if (e < n - 1) return null; let s = 0; for (let i = e - n + 1; i <= e; i++) s += a[i]; return s / n; }
function rsiAt(a, n, e) { if (e < n) return null; let g = 0, l = 0; for (let i = e - n + 1; i <= e; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); }

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const recs = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), N = price.length;
    const g = B.standardGraph();
    for (let t = WARMUP; t <= N - MAXH - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: 60, timeframe: "1day" }); } catch (e) { continue; }
      const ctx = r.verdict && r.verdict.context; if (!ctx) continue;
      const rsi = rsiAt(price, 14, t), rsi3 = rsiAt(price, 14, t - 3);
      const m200 = sma(price, t, 200), m200p = t >= 220 ? sma(price, t - 20, 200) : null;
      const hh = Math.max.apply(null, price.slice(Math.max(0, t - 60)));
      const out = {}; for (const h of HOLDS) out[h] = price[t + h] / price[t] - 1;
      recs.push({
        sym: fx.symbol, t, state: ctx.state,
        rsiUp: rsi3 != null ? rsi - rsi3 : 0,
        dd: hh > 0 ? price[t] / hh - 1 : 0,
        ma200down: (m200 && m200p) ? (m200 < m200p ? 1 : 0) : 0,
        opp: ctx.opportunity ? ctx.opportunity.kind : null,
        out,
      });
    }
    console.error("  " + fx.symbol);
  }
  const P = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%", pp = x => (x * 100).toFixed(1) + "%";
  // P&L: 비중첩 등가중, 종목별 손실 확인 + 랜덤대조
  function evalSig(name, f, H) {
    const rs = recs.filter(f); if (rs.length < 40) return null;
    const exp = rs.reduce((a, r) => a + r.out[H], 0) / rs.length;
    const wr = rs.filter(r => r.out[H] > 0).length / rs.length;
    const bySym = {}; for (const r of rs) (bySym[r.sym] = bySym[r.sym] || []).push(r.out[H]);
    const losers = Object.entries(bySym).filter(([s, a]) => a.reduce((x, y) => x + y, 0) / a.length < -0.005).length;
    // 랜덤 대조: 같은 시점에 랜덤진입(전체 평균수익)
    return { n: rs.length, exp, wr, syms: Object.keys(bySym).length, losers };
  }
  const allAvg = {}; for (const H of HOLDS) allAvg[H] = recs.reduce((a, r) => a + r.out[H], 0) / recs.length;   // 아무때나(랜덤 롱) 기준
  console.log("\n=== 하락후/낙폭 반등 후보 검증 (" + recs.length + "시점) ===");
  console.log("랜덤 롱(아무때나) 기준수익: " + HOLDS.map(h => h + "봉 " + P(allAvg[h])).join(" · ") + "\n");
  const sigs = [
    ["현행 지지반등(opp=buy)", r => r.opp === "buy"],
    ["하락국면 반등(down·RSI반등)", r => r.state === "down" && r.rsiUp > 0],
    ["큰낙폭 반등(dd≤-12%·RSI반등)", r => r.dd <= -0.12 && r.rsiUp > 0],
    ["큰낙폭 반등, 200MA급락 제외", r => r.dd <= -0.12 && r.rsiUp > 0 && r.ma200down === 0],
    ["깊은낙폭 반등(dd≤-18%·RSI반등)", r => r.dd <= -0.18 && r.rsiUp > 0],
    ["통합: 지지반등 OR 큰낙폭반등", r => r.opp === "buy" || (r.dd <= -0.12 && r.rsiUp > 0)],
  ];
  for (const [nm, f] of sigs) {
    const parts = HOLDS.map(H => { const e = evalSig(nm, f, H); return e ? (H + "봉 " + P(e.exp) + "/승" + pp(e.wr) + "(vs랜덤" + P(e.exp - allAvg[H]) + ")") : "-"; });
    const e20 = evalSig(nm, f, 20);
    console.log("  " + nm.padEnd(28) + " n=" + (e20 ? e20.n : "-") + " 손실종목 " + (e20 ? e20.losers + "/" + e20.syms : "-"));
    console.log("      " + parts.join(" · "));
  }
  console.log("\n→ 랜덤 대비 +(모든 홀드)·손실종목 적으면 진짜 반등 edge. falling knife면 랜덤 이하·손실종목 많음.");
}
main();
