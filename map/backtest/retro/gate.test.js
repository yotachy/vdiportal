// map/backtest/retro/gate.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { gateCandidate } = require("./gate.js");

// z가 vol-high에서 항상 배신(drop하면 정답). 시간·종목 일관되게 배치.
function mkTest(n) {
  const recs = [];
  for (let i = 0; i < n; i++) {
    const up = i % 2 === 0, a20 = up ? 110 : 90;
    recs.push({
      sym: i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "C", t: i,
      base: 100, a20, a60: a20,
      score: up ? -0.3 : +0.3,               // base 오답
      up: 50, regime: ["vol-high"], ab: { z: { score: up ? +0.3 : -0.3 } },
    });
  }
  return recs;
}
const CAND = { id: "retro-vol-high-drop-z", regime: "vol-high", change: { op: "drop", indId: "z" } };

test("adopts a candidate that robustly fixes misses OOS", () => {
  const r = gateCandidate(CAND, mkTest(300), { minN: 50 });
  assert.strictEqual(r.verdict, "adopt", JSON.stringify(r.evidence));
  assert.ok(r.evidence.oosDelta > 0.4);
  assert.ok(r.evidence.halves[0] >= 0 && r.evidence.halves[1] >= 0);
  assert.strictEqual(r.evidence.symbolConsistency, 1);
});

test("insufficient-sample when regime test set below minN", () => {
  const r = gateCandidate(CAND, mkTest(40), { minN: 100 });
  assert.strictEqual(r.verdict, "insufficient-sample");
});

test("no-improvement when drop does not help (indicator was neutral)", () => {
  // ab score == base score → 변화 없음
  const recs = mkTest(300).map(x => ({ ...x, ab: { z: { score: x.score } } }));
  const r = gateCandidate(CAND, recs, { minN: 50 });
  assert.strictEqual(r.verdict, "no-improvement");
});
