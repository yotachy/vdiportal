// map/backtest/retro/lib.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./lib.js");

// z를 국면 g에서 drop(ab) 또는 add(addAb)했을 때의 up을 담은 합성 레코드
function rec(sym, t, a20, up, altUp, g, map) {
  const r = { sym, t, base: 100, a20, a60: a20, up, regime: [g] };
  r[map] = { z: { up: altUp } };
  return r;
}

test("realDir/predDir(up 기반)", () => {
  assert.strictEqual(L.realDir({ base: 100, a20: 110 }), 1);
  assert.strictEqual(L.realDir({ base: 100, a20: 90 }), -1);
  assert.strictEqual(L.predDir(70), 1);
  assert.strictEqual(L.predDir(30), -1);
  assert.strictEqual(L.predDir(50), 1);
  assert.strictEqual(L.predDir(null), 1);
});

test("accBase uses up", () => {
  const recs = [{ base: 100, a20: 90, up: 70, regime: [] }, { base: 100, a20: 110, up: 70, regime: [] }];
  assert.strictEqual(L.accBase(recs), 0.5); // 하나는 up70(상승콜) 실제하락=오답, 하나는 상승=정답
});

test("accMod drop(ab): dropping a betraying indicator raises accuracy in-regime", () => {
  const recs = [
    rec("A", 1, 90, 70, 30, "vol-high", "ab"), // base up70(상승콜) 실제하락 오답 → drop시 up30(하락콜) 정답
    rec("A", 2, 80, 80, 20, "vol-high", "ab"),
  ];
  assert.strictEqual(L.accBase(recs), 0);
  assert.strictEqual(L.accMod(recs, "vol-high", "z", "a20", "ab"), 1);
  assert.strictEqual(L.accMod(recs, "trend-up", "z", "a20", "ab"), 0); // 다른 국면 무변화
});

test("accMod add(addAb): adding an indicator flips misses", () => {
  const recs = [
    rec("A", 1, 110, 30, 70, "vol-low", "addAb"), // base up30(하락콜) 실제상승 오답 → add시 up70 정답
    rec("A", 2, 120, 20, 80, "vol-low", "addAb"),
  ];
  assert.strictEqual(L.accBase(recs), 0);
  assert.strictEqual(L.accMod(recs, "vol-low", "z", "a20", "addAb"), 1);
});

test("indicatorIds reads the requested map", () => {
  const recs = [{ ab: { x: { up: 50 } }, addAb: { y: { up: 50 } } }];
  assert.deepStrictEqual(L.indicatorIds(recs, "ab"), ["x"]);
  assert.deepStrictEqual(L.indicatorIds(recs, "addAb"), ["y"]);
});
