const { test } = require("node:test");
const assert = require("node:assert");
const { ABSENT_DEFAULTS, ABSENT } = require("./add-defs.js");

test("ABSENT lists the 11 indicators absent from the standard graph", () => {
  assert.deepStrictEqual([...ABSENT].sort(), ["ao","aroon","cci","cmf","donchian","keltner","mfi","pivot","psar","roc","williams"]);
});

test("williams carries a period (the params:{} bug that made it inert)", () => {
  assert.deepStrictEqual(ABSENT_DEFAULTS.williams, { period: 14 });
});

test("params match BLOCK_DEFS verbatim for a sample", () => {
  assert.deepStrictEqual(ABSENT_DEFAULTS.keltner, { len: 20, atrLen: 10, mult: 2 });
  assert.deepStrictEqual(ABSENT_DEFAULTS.psar, { step: 0.02, max: 0.2 });
  assert.deepStrictEqual(ABSENT_DEFAULTS.pivot, {});
});
