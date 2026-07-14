const { test } = require("node:test");
const assert = require("node:assert");
const BT = require("../backtest.js");
const { collectFixture } = require("./miss-ledger.js");

test("collectFixture yields records with ablation scores and regime tags", () => {
  const fx = BT.makeSyntheticFixture("SYNTH", "1day", { n: 360, drift: 0.001, vol: 0.012 });
  const recs = collectFixture(fx, { stride: 40 }); // 빠른 테스트용 큰 stride
  assert.ok(recs.length > 0, "레코드 생성 기대");
  const r = recs[0];
  assert.strictEqual(r.sym, "SYNTH");
  assert.ok(Number.isFinite(r.base) && Number.isFinite(r.a20) && Number.isFinite(r.a60));
  assert.ok(Array.isArray(r.regime) && r.regime.length >= 1);
  assert.ok(r.ab && Object.keys(r.ab).length >= 1, "ablation 최소 1개 지표");
  for (const k of Object.keys(r.ab)) assert.ok(Number.isFinite(r.ab[k].score), "ab score 유한");
});
