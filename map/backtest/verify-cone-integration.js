// backtest/verify-cone-integration.js — 통합된 콘 정밀화(v1.9.2)를 실제 하네스(backtest.js)로 A/B 재검증.
// FORGE_NO_CONEMULT 게이트로 승수 off/on 두 번 돌려 일봉 콘 커버리지·조건부 평탄화·ECE·MAE 비교.
// 규율: 실 엔진·실 하네스. 전체 커버 보존 + 조건부 평탄화 + ECE 불변이어야 채택 확정.
"use strict";
const fs = require("fs"), path = require("path");
const M = require("./metrics.js");
const { walkForward } = require("./backtest.js");

const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));   // 승수는 일봉 한정 → 일봉만 A/B

// 각 시점 변동성 백분위(국면) 재계산용
function rv(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }

function runAll(label) {
  const recs = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c);
    const { records } = walkForward(fx);
    for (const r of records) {
      // 국면(변동성 백분위): base 인덱스 t에서 v20의 252봉 백분위
      const t = r.t; let pct = 0.5;
      if (t >= 272) { const v20 = rv(price, t, 20); const hist = []; for (let k = t - 252; k <= t; k += 3) { if (k - 20 >= 0) { const vv = rv(price, k, 20); if (vv) hist.push(vv); } } if (hist.length > 5) { let c = 0; for (const vv of hist) if (vv <= v20) c++; pct = c / hist.length; } }
      r.pct = pct; recs.push(r);
    }
  }
  const cov = M.coneCoverage(recs), cal = M.calibration(recs), mae = M.priceMAE(recs);
  // 조건부 커버리지(변동성 3구간)
  const bk = { lo: [0, 0], mid: [0, 0], hi: [0, 0] };
  for (const r of recs) { if (!isFinite(r.loH) || !isFinite(r.hiH)) continue; const b = r.pct < 0.33 ? "lo" : r.pct > 0.66 ? "hi" : "mid"; bk[b][1]++; if (r.actual >= r.loH && r.actual <= r.hiH) bk[b][0]++; }
  const p = a => a[1] ? a[0] / a[1] : 0;
  const spread = Math.max(p(bk.lo), p(bk.mid), p(bk.hi)) - Math.min(p(bk.lo), p(bk.mid), p(bk.hi));
  return { label, n: cov.n, cov: cov.coverage, ece: cal.ece, mae: mae.mae, lo: p(bk.lo), mid: p(bk.mid), hi: p(bk.hi), spread };
}

const P = x => (x * 100).toFixed(1) + "%";
process.env.FORGE_NO_CONEMULT = "1";
const off = runAll("승수 OFF(현행)");
delete process.env.FORGE_NO_CONEMULT;
const on = runAll("승수 ON(v1.9.2)");

console.log("\n══════ 콘 정밀화 통합 A/B — 실 하네스(backtest.js) · 일봉 " + files.length + "종 ══════");
console.log("                 전체커버   ECE     MAE     압축    중간    확대    편차(평탄)");
for (const r of [off, on]) console.log("  " + r.label.padEnd(14) + " " + P(r.cov).padStart(7) + " " + P(r.ece).padStart(6) + " " + P(r.mae).padStart(6) + "  " + P(r.lo).padStart(6) + " " + P(r.mid).padStart(6) + " " + P(r.hi).padStart(6) + "  " + P(r.spread).padStart(6));
console.log("\n판정:");
console.log("  전체 커버리지 보존(±2%p): " + (Math.abs(on.cov - off.cov) < 0.02 ? "✓" : "✗") + " (" + P(off.cov) + "→" + P(on.cov) + ")");
console.log("  조건부 편차 평탄화:       " + (on.spread < off.spread - 0.005 ? "✓" : "✗") + " (" + P(off.spread) + "→" + P(on.spread) + ")");
console.log("  ECE 불변(±0.5%p):         " + (Math.abs(on.ece - off.ece) < 0.005 ? "✓" : "✗") + " (" + P(off.ece) + "→" + P(on.ece) + ")");
console.log("  MAE 불변(±0.3%p):         " + (Math.abs(on.mae - off.mae) < 0.003 ? "✓" : "✗") + " (" + P(off.mae) + "→" + P(on.mae) + ")");
