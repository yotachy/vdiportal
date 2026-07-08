// backtest/direction-lab.js — 방향 예측 규칙 실험(엔진 개선 목표: raw 적중률 60%+)
// 엔진 1패스로 시점별 신호+특성 캡처 → 여러 방향 규칙을 메모리에서 평가.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");

const WARMUP = 200, LOOKBACK = 600, HORIZONS = [3, 5, 10, 20, 40, 60], MAXH = 60, STRIDE = 10;

function slopeLog(price, end, n) {  // 최근 n봉 로그가격 회귀 기울기(/봉)
  if (end < n) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { const x = i, y = Math.log(price[end - n + 1 + i] || 1e-9); sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const d = n * sxx - sx * sx; return d ? (n * sxy - sx * sy) / d : 0;
}
function sma(price, end, n) { if (end < n - 1) return null; let s = 0; for (let i = end - n + 1; i <= end; i++) s += price[i]; return s / n; }

function capture() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const recs = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), N = price.length;
    const g = B.standardGraph();
    let cnt = 0;
    for (let t = WARMUP; t <= N - MAXH - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: MAXH, timeframe: "1day" }); } catch (e) { continue; }
      const ctx = r.verdict && r.verdict.context; if (!ctx) continue;
      const m50 = sma(price, t, 50), m200 = sma(price, t, 200), m200p = t >= 220 ? sma(price, t - 20, 200) : null;
      const act = {}; for (const h of HORIZONS) act[h] = Math.sign(price[t + h] - price[t]);
      recs.push({
        eng: Math.sign(r.verdict.score || 0),
        score: r.verdict.score || 0,
        state: ctx.state,
        sl50: slopeLog(price, t, 50), sl200: slopeLog(price, t, 200),
        ma50: m50 ? price[t] / m50 - 1 : 0, ma200: m200 ? price[t] / m200 - 1 : 0,
        ma200up: (m200 && m200p) ? (m200 >= m200p ? 1 : -1) : 0,
        ret5: t >= 5 ? price[t] / price[t - 5] - 1 : 0, ret20: t >= 20 ? price[t] / price[t - 20] - 1 : 0, ret60: t >= 60 ? price[t] / price[t - 60] - 1 : 0,
        act,
      });
      cnt++;
    }
    console.error("  " + fx.symbol + " → " + cnt);
  }
  return recs;
}

function evalRule(recs, fn, h) {
  let hit = 0, tot = 0, dnN = 0, dnHit = 0;
  for (const r of recs) {
    const a = r.act[h]; if (!a) continue;
    const p = fn(r, h); if (!p) continue;
    tot++; const ok = Math.sign(p) === a; if (ok) hit++;
    if (p < 0) { dnN++; if (ok) dnHit++; }
  }
  return { rate: tot ? hit / tot : 0, n: tot, dn: dnN ? dnHit / dnN : 0, dnN };
}

function main() {
  const recs = capture();
  const P = x => (x * 100).toFixed(1) + "%";
  // 지평별 모멘텀/평균회귀 특성이 다르니 규칙도 지평 인식
  const momH = h => h <= 10 ? "ret5" : "ret20";
  const rules = [
    ["엔진 현행", r => r.eng || 1],
    ["항상 상승", r => 1],
    ["단기모멘텀 추종", (r, h) => (r[momH(h)] >= 0 ? 1 : -1)],
    ["단기 평균회귀(모멘텀 반대)", (r, h) => (r[momH(h)] >= 0 ? -1 : 1)],
    ["200일 추세추종", r => r.sl200 >= 0 ? 1 : -1],
    ["엔진, 하락은 200MA하락만", r => (r.eng < 0 && r.ma200up < 0) ? -1 : 1],
    ["횡보=평균회귀 / 추세=추세추종", (r, h) => r.state === "range" ? (r[momH(h)] >= 0 ? -1 : 1) : (r.sl200 >= 0 ? 1 : -1)],
    ["횡보=엔진 / 추세=추세추종", r => r.state === "range" ? (r.eng || 1) : (r.sl200 >= 0 ? 1 : -1)],
  ];
  console.log("\n=== 방향 규칙 × 지평 실험 (일봉 · " + recs.length + "시점) ===");
  for (const h of HORIZONS) {
    const baseUp = recs.filter(r => r.act[h] > 0).length / recs.filter(r => r.act[h]).length;
    console.log("\n[지평 " + h + "봉] 실제 상승비율(항상상승 상한) " + P(baseUp));
    const out = rules.map(([name, fn]) => ({ name, e: evalRule(recs, fn, h) })).sort((a, b) => b.e.rate - a.e.rate);
    for (const o of out.slice(0, 5)) {
      const skill = o.e.dnN > 30 && o.e.dn > 0.5 ? " ★하락콜>50%" : "";
      console.log("  " + o.name.padEnd(28) + " 적중 " + P(o.e.rate) + " · 하락콜 " + P(o.e.dn) + "(" + o.e.dnN + ")" + skill);
    }
  }
  console.log("\n→ ★ = 하락콜 50%+ (진짜 방향 스킬). 적중 60%+ 이면서 ★인 (지평,규칙) 조합을 찾는다.");
}
main();
