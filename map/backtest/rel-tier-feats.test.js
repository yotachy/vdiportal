const test = require("node:test"), assert = require("node:assert");
const FC = require("../forge-core.js");
const { relTierFeats } = require("./rel-tier-feats.js");
test("relTierFeats: length 5, range, short input, deterministic", () => {
  const price = FC.makeDemoSeries({ n: 300, seed: 5, period: 48 }).price;
  const f = relTierFeats(price);
  assert.strictEqual(f.length, 5);
  assert.ok(f.every(v => v >= -1 && v <= 1));
  assert.deepStrictEqual(relTierFeats(price), f);
  assert.deepStrictEqual(relTierFeats([1, 2, 3]), [0, 0, 0, 0, 0]);
});
