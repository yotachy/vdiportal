// map/backtest/retro/regime.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { regimeTags, REGIMES } = require("./regime.js");

test("warmup before t=200", () => {
  const price = Array.from({ length: 210 }, (_, i) => 100 + i);
  assert.deepStrictEqual(regimeTags(price, 100), ["warmup"]);
});

test("uptrend + steady gives trend-up and a vol tag", () => {
  const price = Array.from({ length: 260 }, (_, i) => 100 * Math.pow(1.002, i)); // 완만 상승
  const tags = regimeTags(price, 255);
  assert.ok(tags.includes("trend-up"), "trend-up 기대: " + tags);
  assert.ok(tags.some(t => t.startsWith("vol-")), "vol 태그 기대: " + tags);
});

test("downtrend gives trend-down", () => {
  const price = Array.from({ length: 260 }, (_, i) => 100 * Math.pow(0.998, i));
  assert.ok(regimeTags(price, 255).includes("trend-down"));
});

test("REGIMES includes all pseudo-regime and 6 concrete tags", () => {
  assert.ok(REGIMES.includes("all"));
  ["trend-up", "trend-down", "trend-flat", "vol-high", "vol-mid", "vol-low"].forEach(g =>
    assert.ok(REGIMES.includes(g), g));
});
