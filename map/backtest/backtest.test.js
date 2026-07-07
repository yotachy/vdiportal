const test = require("node:test");
const assert = require("node:assert");
const B = require("./backtest.js");

test("standardGraph: conviction 전부 0", () => {
  const g = B.standardGraph();
  const conv = (g.nodes || []).reduce((s, n) => s + Math.abs(n.conviction || 0), 0);
  assert.strictEqual(conv, 0, "sampleGraph conviction이 0으로 리셋되어야");
});

test("horizonForTF: TF별 지평", () => {
  assert.strictEqual(B.horizonForTF("1day"), 60);
  assert.strictEqual(B.horizonForTF("1week"), 52);
  assert.strictEqual(B.horizonForTF("1month"), 12);
});

test("walkForward: 합성 상승 데이터에서 lookahead 없이 레코드 생성", () => {
  const fx = B.makeSyntheticFixture("SYN", "1day", { n: 320, drift: 0.002, vol: 0.01 });
  const { records, firstPrice, lastPrice } = B.walkForward(fx);
  assert.ok(records.length > 0, "레코드 생성");
  assert.ok(records.every(r => r.actual != null && r.base != null && r.t >= 200), "워밍업 이후·실제값 존재");
  assert.ok(lastPrice > firstPrice, "상승 합성 데이터");
});

test("runBacktest: 합성 픽스처로 리포트 구조 산출", () => {
  const fx = [B.makeSyntheticFixture("SYN", "1day", { n: 320, drift: 0.002, vol: 0.01 })];
  const rep = B.runBacktest(fx, { generatedAt: "2026-07-07T00:00:00Z" });
  assert.ok(rep.overall.directionHitRate != null);
  assert.ok(rep.overall.pnl.finalEquity > 0);
  assert.ok(Array.isArray(rep.calibrationCurve));
  assert.ok(rep.overall.baselineAlwaysUp != null);
});
