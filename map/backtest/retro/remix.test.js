const { test } = require("node:test");
const assert = require("node:assert");
const { candidatesFrom } = require("./remix.js");

test("each diagnosis becomes one drop candidate with deterministic id", () => {
  const diags = [{ regime: "vol-high", indicator: "z", kind: "betray", stat: { trainGain: 0.03, n: 400 } }];
  const cands = candidatesFrom(diags);
  assert.strictEqual(cands.length, 1);
  const c = cands[0];
  assert.strictEqual(c.id, "retro-vol-high-drop-z");
  assert.deepStrictEqual(c.change, { op: "drop", indId: "z" });
  assert.strictEqual(c.regime, "vol-high");
  assert.ok(/z/.test(c.rationale) && /vol-high/.test(c.rationale), "근거에 지표·국면 포함");
});

test("deduplicates identical (regime, indicator) diagnoses", () => {
  const d = { regime: "all", indicator: "z", kind: "betray", stat: { trainGain: 0.02, n: 900 } };
  assert.strictEqual(candidatesFrom([d, d]).length, 1);
});

test("missing diagnosis becomes an add candidate", () => {
  const diags = [{ regime: "vol-low", indicator: "cci", kind: "missing", stat: { trainGain: 0.02, n: 400 } }];
  const c = candidatesFrom(diags)[0];
  assert.strictEqual(c.id, "retro-vol-low-add-cci");
  assert.deepStrictEqual(c.change, { op: "add", indId: "cci" });
  assert.ok(/추가/.test(c.rationale), "add 근거 문구");
});
