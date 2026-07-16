const test = require("node:test"), assert = require("node:assert");
const FC = require("../forge-core.js");
const { structTierBias, multiScaleStructBias } = require("./multiscale-struct.js");

test("structTierBias maps events/trend like analyzeStructure", () => {
  assert.strictEqual(structTierBias({ event: "BOS_up" }), 0.6);
  assert.strictEqual(structTierBias({ event: "CHoCH_down" }), -0.5);
  assert.strictEqual(structTierBias({ event: "none", trend: "up" }), 0.3);
  assert.strictEqual(structTierBias({ event: "none", trend: "none" }), 0);
});
test("multiScaleStructBias is significance-weighted, clamped, deterministic", () => {
  const price = FC.makeDemoSeries({ n: 200, seed: 9, period: 48 }).price;
  const b = multiScaleStructBias(price, {});
  assert.ok(b >= -1 && b <= 1);
  assert.strictEqual(multiScaleStructBias(price, {}), b);
  assert.strictEqual(multiScaleStructBias([1, 2, 3], {}), 0);
});
