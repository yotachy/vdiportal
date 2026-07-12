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

test("aggregatePnL: 등가중 평균·B&H 이긴 종목수·풀드 승률", () => {
  const pf = [
    { pnl: { totalReturn: 0.20, wins: 6, losses: 4, sumWin: 0.5, sumLoss: -0.2, maxDrawdown: -0.1, trades: 10 }, buyHoldReturn: 0.30 }, // B&H 못이김
    { pnl: { totalReturn: 0.40, wins: 5, losses: 5, sumWin: 0.6, sumLoss: -0.3, maxDrawdown: -0.2, trades: 10 }, buyHoldReturn: 0.10 }, // B&H 이김
  ];
  const a = M.aggregatePnL(pf);
  assert.ok(Math.abs(a.avgReturn - 0.30) < 1e-9, "평균 (0.2+0.4)/2");
  assert.strictEqual(a.beatBuyHold, 1);
  assert.strictEqual(a.nFixtures, 2);
  assert.ok(Math.abs(a.winRate - 11 / 20) < 1e-9, "풀드 승률 11/20");
});

test("brierDecomp: 완벽 예측 → BS 0 · BSS 1", () => {
  const pairs = [...Array(100)].map((_, i) => ({ p: i % 2, y: i % 2 }));
  const b = M.brierDecomp(pairs);
  assert.ok(b.brier < 1e-12); assert.ok(Math.abs(b.bss - 1) < 1e-9);
});

test("brierDecomp: 베이스레이트 상수 예측 → resolution 0 · BSS 0", () => {
  const pairs = [...Array(100)].map((_, i) => ({ p: 0.5, y: i % 2 }));
  const b = M.brierDecomp(pairs);
  assert.ok(b.resolution < 1e-12); assert.ok(Math.abs(b.bss) < 1e-9);
  assert.ok(Math.abs(b.uncertainty - 0.25) < 1e-9);
});

test("brierDecomp: Murphy 항등식 BS = REL − RES + UNC (빈 내 상수 예측)", () => {
  const pairs = [];
  for (let i = 0; i < 50; i++) pairs.push({ p: 0.25, y: i < 15 ? 1 : 0 });   // 빈2: 예측25% 실제30%
  for (let i = 0; i < 50; i++) pairs.push({ p: 0.75, y: i < 35 ? 1 : 0 });   // 빈7: 예측75% 실제70%
  const b = M.brierDecomp(pairs);
  assert.ok(Math.abs(b.brier - (b.reliability - b.resolution + b.uncertainty)) < 1e-9);
});

test("brier(records): up/actual/base 래핑 동작", () => {
  const recs = [{ up: 80, actual: 110, base: 100 }, { up: 20, actual: 90, base: 100 }, { up: null, actual: 1, base: 1 }];
  const b = M.brier(recs);
  assert.equal(b.n, 2); assert.ok(b.brier < 0.05);
});
