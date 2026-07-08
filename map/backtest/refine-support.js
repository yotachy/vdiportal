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
      const pw = price.slice(0, t + 1);
      const m20 = sma(pw, 20), m50 = sma(pw, 50), m200 = sma(pw, 200), m200p = t >= 220 ? sma(price.slice(0, t + 1 - 20), 200) : null;
      const av = vol.slice(Math.max(0, t - 19), t + 1).reduce((a, b) => a + b, 0) / 20;
      if (pb == null || rsi == null) continue;
      const out = {}; for (const h of HOLDS) out[h] = price[t + h] / price[t] - 1;
      recs.push({
        sym: fx.symbol, t,
        range: ctx.state === "range", strength: ctx.strength,
        pb, rsi, rsiUp: rsi3 != null ? rsi - rsi3 : 0,
        smaDist: m20 ? price[t] / m20 - 1 : 0, sma50Dist: m50 ? price[t] / m50 - 1 : 0,
        sma200Dist: m200 ? price[t] / m200 - 1 : 0,                    // 200MA 대비(장기추세 위치)
        ma200Slope: (m200 && m200p) ? m200 / m200p - 1 : 0,           // 200MA 20봉 기울기(하락추세 여부)
        ret60: t >= 60 ? price[t] / price[t - 60] - 1 : 0,            // 최근 60봉 수익
        ret120: t >= 120 ? price[t] / price[t - 120] - 1 : 0,
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

  // 현재 채택 규칙(정교화): range·%B≤0.2·RSI반등
  const base = r => r.range && r.pb <= 0.2 && r.rsiUp > 0;
  console.log("\n[현재 규칙] range·%B≤0.2·RSI반등");
  for (const H of HOLDS) { const e = evalCfg(recs, base, H); console.log("  홀드" + H + ": 거래 " + e.n + " · 기대값 " + P(e.exp) + " · 승률 " + W(e.wr)); }

  // 하락추세 배제 필터 후보(기준 규칙 위에 얹음, 홀드20·40)
  console.log("\n[하락추세 배제 필터 · 기준 위에 적용]");
  const filters = [
    ["기준(필터없음)", r => true],
    ["+ 200MA 위(장기추세 위)", r => r.sma200Dist >= 0],
    ["+ 200MA -5% 이내", r => r.sma200Dist >= -0.05],
    ["+ 200MA 기울기 ≥0(비하락)", r => r.ma200Slope >= 0],
    ["+ 200MA -5%이내 & 기울기≥-0.5%", r => r.sma200Dist >= -0.05 && r.ma200Slope >= -0.005],
    ["+ 최근60봉 ≥ -8%", r => r.ret60 >= -0.08],
    ["+ 최근120봉 ≥ -10%", r => r.ret120 >= -0.10],
    ["+ 200MA-5%이내 & 60봉≥-8%", r => r.sma200Dist >= -0.05 && r.ret60 >= -0.08],
  ];
  for (const [name, f] of filters) {
    const e = evalCfg(recs, r => base(r) && f(r), 20), e40 = evalCfg(recs, r => base(r) && f(r), 40);
    console.log("  " + name.padEnd(28) + " 거래 " + String(e.n).padStart(4) + " · 기대값20 " + P(e.exp) + " · 승률 " + W(e.wr) + " · 기대값40 " + P(e40.exp));
  }

  // 종목별 지지반등 성적(현재 규칙) — 하락추세 종목이 손실 유발하는지(VZ 확인)
  console.log("\n[종목별 · 현재 규칙 · 홀드20 기대값(거래수) · 200MA대비 평균]");
  const bySym = {};
  for (const r of recs) if (base(r)) { (bySym[r.sym] = bySym[r.sym] || []).push(r); }
  Object.entries(bySym).sort((a, b) => a[1].reduce((s, r) => s + r.out[20], 0) / a[1].length - b[1].reduce((s, r) => s + r.out[20], 0) / b[1].length)
    .forEach(([sym, rs]) => {
      const e = rs.reduce((s, r) => s + r.out[20], 0) / rs.length, d200 = rs.reduce((s, r) => s + r.sma200Dist, 0) / rs.length;
      console.log("  " + sym.padEnd(9) + " " + (P(e) + "(" + rs.length + ")").padStart(12) + " · 200MA " + (d200 * 100).toFixed(1) + "%");
    });

  // 필터 적용 후 종목별 손실종목 제거 확인
  const filt = r => base(r) && r.sma200Dist >= -0.05 && r.ret60 >= -0.08;
  console.log("\n[최종후보 필터(200MA-5%이내 & 60봉≥-8%) 적용 후 손실종목]");
  const bySym2 = {}; for (const r of recs) if (filt(r)) { (bySym2[r.sym] = bySym2[r.sym] || []).push(r); }
  const losers = Object.entries(bySym2).filter(([s, rs]) => rs.reduce((a, r) => a + r.out[20], 0) / rs.length < 0);
  console.log("  손실종목: " + (losers.length ? losers.map(([s, rs]) => s + " " + P(rs.reduce((a, r) => a + r.out[20], 0) / rs.length)).join(", ") : "없음 ✅"));

  let s = 0, n = 0, i = 0; for (const r of rng) { s += ((i++ % 2) ? -1 : 1) * r.out[20]; n++; }
  console.log("\n랜덤대조(홀드20): " + P(n ? s / n : 0));
}
main();
