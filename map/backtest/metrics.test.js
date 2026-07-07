const test = require("node:test");
const assert = require("node:assert");
const M = require("./metrics.js");

test("directionHitRate: 방향 일치/중립 제외", () => {
  const recs = [
    { dir: 1, base: 100, actual: 110 },  // 상승예측·상승 → hit
    { dir: 1, base: 100, actual: 90 },   // 상승예측·하락 → miss
    { dir: -1, base: 100, actual: 90 },  // 하락예측·하락 → hit
    { dir: 0, base: 100, actual: 200 },  // 중립 → 제외
  ];
  const r = M.directionHitRate(recs);
  assert.strictEqual(r.n, 3);
  assert.ok(Math.abs(r.rate - 2 / 3) < 1e-9, "적중 2/3");
  assert.ok(Math.abs(r.bullRate - 0.5) < 1e-9);
  assert.ok(Math.abs(r.bearRate - 1) < 1e-9);
});

test("coneCoverage: 밴드 포함 비율", () => {
  const recs = [
    { loH: 90, hiH: 110, actual: 100 }, // in
    { loH: 90, hiH: 110, actual: 120 }, // out
  ];
  assert.ok(Math.abs(M.coneCoverage(recs).coverage - 0.5) < 1e-9);
});

test("priceMAE: |예측/실제 − 1| 평균", () => {
  const recs = [{ tgt: 110, actual: 100 }, { tgt: 90, actual: 100 }];
  assert.ok(Math.abs(M.priceMAE(recs).mae - 0.1) < 1e-9);
});

test("calibration: 빈별 예측 vs 실제 + ECE", () => {
  const recs = [
    { up: 65, base: 100, actual: 110 }, // 60-70 빈, 실제 상승
    { up: 62, base: 100, actual: 90 },  // 60-70 빈, 실제 하락
  ];
  const c = M.calibration(recs);
  const b = c.curve.find(x => x.binLo === 60);
  assert.strictEqual(b.n, 2);
  assert.ok(Math.abs(b.actual - 0.5) < 1e-9, "실제 상승률 0.5");
  assert.ok(c.ece >= 0);
});

test("simulatePnL: 롱온리·비중첩·복리", () => {
  const recs = [
    { t: 0, H: 10, up: 70, base: 100, actual: 110 }, // 롱, +10%
    { t: 5, H: 10, up: 80, base: 100, actual: 90 },  // t<nextFree(10) → 스킵
    { t: 12, H: 10, up: 30, base: 100, actual: 90 }, // 롱온리라 플랫(스킵)
    { t: 24, H: 10, up: 65, base: 100, actual: 95 }, // 롱, −5%
  ];
  const p = M.simulatePnL(recs, { threshold: 55, mode: "long", startEquity: 10000 });
  assert.strictEqual(p.trades, 2);
  assert.ok(Math.abs(p.finalEquity - 10000 * 1.10 * 0.95) < 1e-6);
});

test("baselines: 항상상승 적중률·Buy&Hold", () => {
  const recs = [{ base: 100, actual: 110 }, { base: 100, actual: 90 }];
  const b = M.baselines(recs, 100, 130);
  assert.ok(Math.abs(b.alwaysUpHitRate - 0.5) < 1e-9);
  assert.ok(Math.abs(b.buyHoldReturn - 0.3) < 1e-9);
});
