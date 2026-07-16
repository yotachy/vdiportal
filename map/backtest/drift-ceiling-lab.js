// backtest/drift-ceiling-lab.js — 드리프트 영향 천장 검증
// 각 지표 bias를 +1 vs -1 극단으로 강제 → sign(verdict.score) 뒤집힘 비율 = 그 지표가 엔진 방향에 미칠
// 최대 영향의 천장. 천장~0이면 다중스케일 포함 어떤 재공식화도 엔진 방향 무효. forge-core 기본 동작 불변.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const WARMUP = 200, LOOKBACK = 600, MAXH = 60, STRIDE = 20, H = 20;
const INDS = ["pivot", "gann", "volume"];

function run() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const stat = {}; INDS.forEach(k => stat[k] = { flip: 0, n: 0, plusHit: 0, minusHit: 0, flipN: 0 });
  let sanChk = 0, sanFail = 0, nT = 0;
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const candle = fx.candle, price = candle.map(c => c.c), N = price.length, g = FC.sampleGraph();
    for (let t = WARMUP; t <= N - MAXH - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK), w = { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) };
      let base;
      try {
        base = FC.run(g, w, { timeframe: "1day" }).verdict.score;
        if (sanChk < 30) { sanChk++; if (FC.run(g, w, { timeframe: "1day", _biasSet: {} }).verdict.score !== base) sanFail++; }
      } catch (e) { continue; }
      const act = Math.sign(price[t + H] - price[t]); nT++;
      for (const ind of INDS) {
        let sP, sM;
        try { sP = Math.sign(FC.run(g, w, { timeframe: "1day", _biasSet: { [ind]: 1 } }).verdict.score);
              sM = Math.sign(FC.run(g, w, { timeframe: "1day", _biasSet: { [ind]: -1 } }).verdict.score); }
        catch (e) { continue; }
        const S = stat[ind]; S.n++;
        if (sP !== sM) { S.flip++; if (act !== 0) { S.flipN++; if (sP === act) S.plusHit++; if (sM === act) S.minusHit++; } }
      }
    }
  }
  return { stat, sanChk, sanFail, nT };
}

const { stat, sanChk, sanFail, nT } = run();
console.log("=== 드리프트 영향 천장 검증 (bias +1 vs -1 극단 → 엔진 sign 뒤집힘) ===");
console.log("시점 " + nT + " · walk-forward 55종 · sanity(_biasSet{}==표준): " + (sanFail === 0 ? "OK(" + sanChk + ")" : "FAIL " + sanFail));
console.log("\n지표   | 캡    | 천장(뒤집힘%) | 뒤집힘시 +1방향적중 / -1방향적중");
const CAP = { pivot: 0.04, gann: 0.05, volume: 0.05 };
let allLow = true;
for (const ind of INDS) {
  const S = stat[ind], ceil = S.n ? S.flip / S.n : 0;
  if (ceil >= 0.02) allLow = false;
  const ph = S.flipN ? (S.plusHit / S.flipN * 100).toFixed(0) : "-", mh = S.flipN ? (S.minusHit / S.flipN * 100).toFixed(0) : "-";
  console.log(ind.padEnd(7) + "| " + CAP[ind] + " | " + (ceil * 100).toFixed(2) + "% (" + S.flip + "/" + S.n + ")   | " + ph + "% / " + mh + "%  (n=" + S.flipN + ")");
}
console.log("\n=== 판정: " + (allLow ? "REJECT 확정 — 천장 <2%, 세 지표 다 엔진 방향 거의 못 바꿈 → 다중스케일 포함 재공식화 무효" : "일부 천장 유의 — 별도 정밀검증") + " ===");
