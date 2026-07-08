// backtest/refine-support.js — 지지반등 신호 정교화 스윕
// 엔진 1회 패스로 시점별 특성(%B·RSI·MA거리·RSI기울기·거래량비·국면)+미래수익 캡처 → 메모리 스윕.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");

const WARMUP = 200, LOOKBACK = 600, STRIDE = 5, HOLDS = [10, 20, 40], MAXH = 40;

// ── 지표 헬퍼(윈도우 마지막 시점 기준) ──
function sma(a, n) { if (a.length < n) return null; let s = 0; for (let i = a.length - n; i < a.length; i++) s += a[i]; return s / n; }
function std(a, n, m) { if (a.length < n) return null; let s = 0; for (let i = a.length - n; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / n); }
function rsiAt(a, n, end) { // RSI(n) at index end
  if (end < n) return null; let g = 0, l = 0;
  for (let i = end - n + 1; i <= end; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; }
  const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs);
}
function pctB(price, end) { const w = price.slice(0, end + 1), m = sma(w, 20); if (m == null) return null; const sd = std(w, 20, m); if (!sd) return null; const up = m + 2 * sd, lo = m - 2 * sd; return (price[end] - lo) / (up - lo); }

function capture() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const recs = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), vol = fx.candle.map(c => c.v || 0), N = price.length;
    const g = B.standardGraph();
    let cnt = 0;
    for (let t = WARMUP; t <= N - MAXH - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: 60, timeframe: "1day" }); } catch (e) { continue; }
      const ctx = r.verdict && r.verdict.context; if (!ctx) continue;
      const pb = pctB(price, t), rsi = rsiAt(price, 14, t), rsi3 = rsiAt(price, 14, t - 3);
      const m20 = sma(price.slice(0, t + 1), 20), m50 = sma(price.slice(0, t + 1), 50);
      const av = vol.slice(Math.max(0, t - 19), t + 1).reduce((a, b) => a + b, 0) / 20;
      if (pb == null || rsi == null) continue;
      const out = {}; for (const h of HOLDS) out[h] = price[t + h] / price[t] - 1;
      recs.push({
        sym: fx.symbol, t,
        range: ctx.state === "range", strength: ctx.strength,
        pb, rsi, rsiUp: rsi3 != null ? rsi - rsi3 : 0,
        smaDist: m20 ? price[t] / m20 - 1 : 0, sma50Dist: m50 ? price[t] / m50 - 1 : 0,
        volR: av > 0 ? (vol[t] || 0) / av : 1,
        out,
      });
      cnt++;
    }
    console.error("  " + fx.symbol + " → " + cnt + "시점");
  }
  return recs;
}

function evalCfg(recs, pred, H) {
  const rets = []; for (const r of recs) if (pred(r)) rets.push(r.out[H]);
  if (rets.length < 30) return { n: rets.length, exp: null, wr: null };
  const exp = rets.reduce((a, b) => a + b, 0) / rets.length;
  const wr = rets.filter(x => x > 0).length / rets.length;
  return { n: rets.length, exp, wr };
}

function main() {
  const recs = capture();
  fs.writeFileSync(path.join(__dirname, "support-features.json"), JSON.stringify(recs));
  const rng = recs.filter(r => r.range);
  console.log("\n=== 지지반등 정교화 스윕 (일봉 · 횡보시점 " + rng.length + "/" + recs.length + ") ===");
  const P = x => x == null ? " – " : (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";
  const W = x => x == null ? " – " : (x * 100).toFixed(1) + "%";

  // 0) 현행 기준
  const base = r => r.range && r.pb <= 0.2 && r.rsi < 45;
  console.log("\n[현행] range·%B≤0.2·RSI<45");
  for (const H of HOLDS) { const e = evalCfg(recs, base, H); console.log("  홀드" + H + ": 거래 " + e.n + " · 기대값 " + P(e.exp) + " · 승률 " + W(e.wr)); }

  // 1) %B × RSI 그리드 (홀드 20 기준 기대값)
  console.log("\n[%B × RSI 그리드 · 홀드20 기대값(거래수)]");
  const PBs = [0.10, 0.15, 0.20, 0.25], RSIs = [30, 35, 40, 45, 100];
  process.stdout.write("        " + RSIs.map(x => (x === 100 ? "RSI무시" : "RSI<" + x).padStart(13)).join("") + "\n");
  for (const pb of PBs) {
    let row = ("%B≤" + pb).padEnd(8);
    for (const rs of RSIs) { const e = evalCfg(recs, r => r.range && r.pb <= pb && r.rsi < rs, 20); row += (P(e.exp) + "(" + e.n + ")").padStart(13); }
    console.log(row);
  }

  // 2) 필터 마진 효과(기준: range·%B≤0.2·RSI<45, 홀드20)
  console.log("\n[필터 마진 · 기준 range·%B≤0.2·RSI<45 · 홀드20]");
  const filters = [
    ["기준(필터없음)", r => true],
    ["+ RSI 반등중(rsiUp>0)", r => r.rsiUp > 0],
    ["+ 깊은눌림(20MA -5%↓)", r => r.smaDist < -0.05],
    ["+ 깊은눌림(20MA -8%↓)", r => r.smaDist < -0.08],
    ["+ 거래량스파이크(>1.3x)", r => r.volR > 1.3],
    ["+ 강한횡보(strength<0.2)", r => r.strength < 0.2],
    ["+ 50MA 위(추세잔존)", r => r.sma50Dist > 0],
    ["+ 50MA 아래(과매도심화)", r => r.sma50Dist < 0],
  ];
  for (const [name, f] of filters) {
    const e = evalCfg(recs, r => base(r) && f(r), 20);
    const e40 = evalCfg(recs, r => base(r) && f(r), 40);
    console.log("  " + name.padEnd(26) + " 거래 " + String(e.n).padStart(4) + " · 기대값20 " + P(e.exp) + " · 승률 " + W(e.wr) + " · 기대값40 " + P(e40.exp));
  }

  // 3) 랜덤 대조(횡보 전체)
  let s = 0, n = 0, i = 0; for (const r of rng) { s += ((i++ % 2) ? -1 : 1) * r.out[20]; n++; }
  console.log("\n랜덤대조(홀드20): " + P(n ? s / n : 0) + " — 정교화 후보는 이걸 넉넉히 넘고 거래수 충분해야 채택");
}
main();
