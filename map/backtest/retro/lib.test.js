// map/backtest/retro/lib.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./lib.js");

// z가 국면 g에서 항상 반대로 밀어 base를 틀리게 만든 합성 레코드
function rec(sym, t, base, a20, score, abScore, g) {
  return { sym, t, base, a20, a60: a20, score, up: 50, regime: [g], ab: { z: { score: abScore } } };
}

test("realDir/predDir 기본", () => {
  assert.strictEqual(L.realDir({ base: 100, a20: 110 }), 1);
  assert.strictEqual(L.realDir({ base: 100, a20: 90 }), -1);
  assert.strictEqual(L.predDir(-0.2), -1);
  assert.strictEqual(L.predDir(0), 1);
});

test("inRegime: all matches everything", () => {
  assert.ok(L.inRegime({ regime: ["vol-high"] }, "all"));
  assert.ok(L.inRegime({ regime: ["vol-high"] }, "vol-high"));
  assert.ok(!L.inRegime({ regime: ["vol-high"] }, "trend-up"));
});

test("accMod: dropping a betraying indicator raises accuracy in-regime", () => {
  // base score 양수인데 실제 하락(오답) → z drop 시 abScore 음수(정답)
  const recs = [
    rec("A", 1, 100, 90, +0.3, -0.3, "vol-high"),
    rec("A", 2, 100, 80, +0.4, -0.4, "vol-high"),
  ];
  assert.strictEqual(L.accBase(recs), 0);          // 둘 다 base 오답
  assert.strictEqual(L.accMod(recs, "vol-high", "z"), 1); // drop하면 둘 다 정답
  assert.strictEqual(L.accMod(recs, "trend-up", "z"), 0); // 다른 국면이면 무변화
});
