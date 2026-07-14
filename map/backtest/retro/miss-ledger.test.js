const { test } = require("node:test");
const assert = require("node:assert");
const BT = require("../backtest.js");
const { collectFixture } = require("./miss-ledger.js");

test("collectFixture yields up-based records with drop(ab) and add(addAb) maps", () => {
  const fx = BT.makeSyntheticFixture("SYNTH", "1day", { n: 360, drift: 0.001, vol: 0.012 });
  const recs = collectFixture(fx, { stride: 40 });
  assert.ok(recs.length > 0);
  const r = recs[0];
  assert.strictEqual(r.sym, "SYNTH");
  assert.ok(Number.isFinite(r.base) && Number.isFinite(r.a20) && Number.isFinite(r.a60));
  assert.strictEqual(r.score, undefined, "score 필드는 제거됨");
  assert.ok(Array.isArray(r.regime) && r.regime.length >= 1);
  assert.ok(r.ab && Object.keys(r.ab).length >= 1, "drop ablation 최소 1개");
  for (const k of Object.keys(r.ab)) assert.ok(Number.isFinite(r.ab[k].up) || r.ab[k].up === null, "ab up");
  assert.ok(r.addAb && Object.keys(r.addAb).length >= 5, "add injection 다수");
  for (const k of Object.keys(r.addAb)) assert.ok("up" in r.addAb[k], "addAb up 필드");
});
