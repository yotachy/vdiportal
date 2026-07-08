// backtest/conditional-acc.js — 조건부 방향 정확도. 엔진이 '어디서' 믿을 만한지 선별.
// 신뢰도(|score|)·변동성·국면으로 쪼개 방향 적중 + 그 구간 항상상승(로컬 베이스라인) 대비 lift.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");

const WARMUP = 200, LOOKBACK = 600, H = 60, STRIDE = 10;
function rvol(price, a, b) { let m = 0, n = 0; const rs = []; for (let i = a + 1; i <= b; i++) { const r = Math.log(price[i] / price[i - 1]); rs.push(r); m += r; n++; } m /= (n || 1); let s = 0; for (const r of rs) s += (r - m) * (r - m); return Math.sqrt(s / (n || 1)); }

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const recs = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), N = price.length;
    const g = B.standardGraph();
    for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
      const v = r.verdict, ctx = v && v.context; if (!ctx) continue;
      recs.push({ eng: Math.sign(v.score || 0), abs: Math.abs(v.score || 0), state: ctx.state, vol: rvol(price, t - 40, t), act: Math.sign(price[t + H] - price[t]) });
    }
    console.error("  " + fx.symbol);
  }
  const P = x => (x * 100).toFixed(1) + "%";
  // 변동성 3분위 경계
  const vols = recs.map(r => r.vol).filter(isFinite).sort((a, b) => a - b);
  const vLo = vols[Math.floor(vols.length / 3)], vHi = vols[Math.floor(vols.length * 2 / 3)];
  const volBucket = r => r.vol < vLo ? "저변동" : r.vol > vHi ? "고변동" : "중변동";

  function seg(name, rs) {
    const d = rs.filter(r => r.act && r.eng);
    if (d.length < 60) return null;
    const hit = d.filter(r => r.eng === r.act).length / d.length;
    const up = rs.filter(r => r.act).length ? rs.filter(r => r.act > 0).length / rs.filter(r => r.act).length : 0;   // 로컬 항상상승
    return { name, n: d.length, hit, base: up, lift: hit - up };
  }
  const rows = [];
  // |score| 신뢰도 버킷
  for (const [nm, f] of [["|score|<20 (약)", r => r.abs < 20], ["20~40", r => r.abs >= 20 && r.abs < 40], ["40~60", r => r.abs >= 40 && r.abs < 60], ["60+ (강)", r => r.abs >= 60]]) rows.push(seg("신뢰 " + nm, recs.filter(f)));
  // 변동성
  for (const b of ["저변동", "중변동", "고변동"]) rows.push(seg("변동성 " + b, recs.filter(r => volBucket(r) === b)));
  // 국면
  for (const st of ["range", "up", "down"]) rows.push(seg("국면 " + st, recs.filter(r => r.state === st)));
  // 조합: 강한신호 × 저변동 × 국면
  rows.push(seg("강신호(60+)×저변동", recs.filter(r => r.abs >= 60 && volBucket(r) === "저변동")));
  rows.push(seg("강신호(60+)×상승추세", recs.filter(r => r.abs >= 60 && r.state === "up")));
  rows.push(seg("강신호(60+)×저변동×상승", recs.filter(r => r.abs >= 60 && volBucket(r) === "저변동" && r.state === "up")));
  rows.push(seg("약신호(<20)=관망", recs.filter(r => r.abs < 20)));

  console.log("\n=== 조건부 방향 정확도 (" + recs.length + "시점) — 어디서 믿을 만한가 ===");
  console.log("전체 방향 " + P(seg("전체", recs).hit) + " · 항상상승 " + P(seg("전체", recs).base) + "\n");
  for (const s of rows.filter(Boolean)) {
    const good = s.hit >= 0.58 ? " ★적중58+" : "", lift = s.lift > 0.005 ? " ✅lift+" : "";
    console.log("  " + s.name.padEnd(26) + " 적중 " + P(s.hit) + " · 로컬항상상승 " + P(s.base) + " · lift " + (s.lift >= 0 ? "+" : "") + (s.lift * 100).toFixed(1) + "%p (n=" + s.n + ")" + good + lift);
  }
  console.log("\n→ ★=적중58%+ / ✅=항상상승 초과(진짜 스킬). 둘 다인 구간=고신뢰 시그널로 선별 가능.");
}
main();
