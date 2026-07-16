const test = require("node:test"), assert = require("node:assert");
const { buildVixArrays, vixIndexForDate, vixFeats, NF } = require("./vix-feats.js");
const series = {}; const base = "2020-01-";
for (let d = 1; d <= 28; d++) series[base + String(d).padStart(2, "0")] = { vix: 15 + d, vix3m: 20 };
const V = buildVixArrays(series);
test("vixIndexForDate binary search (<=)", () => {
  assert.strictEqual(V.dates[vixIndexForDate(V.dates, "2020-01-10")], "2020-01-10");
  assert.strictEqual(V.dates[vixIndexForDate(V.dates, "2020-01-10T00:00")], "2020-01-10");   // 문자열 <= 안전
  assert.strictEqual(vixIndexForDate(V.dates, "2019-12-01"), -1);
});
test("vixFeats: term structure sign, range, boundaries, empty", () => {
  const i = vixIndexForDate(V.dates, "2020-01-20");   // vix=35 > vix3m=20 → 백워데이션>0
  const f = vixFeats(V.dates, V.vix, V.vix3m, i);
  assert.strictEqual(f.length, NF);
  assert.ok(f[1] > 0, "vix>vix3m → term>0 (backwardation)");
  assert.ok(f[3] >= -0.5 && f[3] <= 0.5, "percentile centered");
  assert.deepStrictEqual(vixFeats(V.dates, V.vix, V.vix3m, -1), new Array(NF).fill(0));
  // vix3m null → term 0
  const s2 = { "2020-02-01": { vix: 30, vix3m: null } }; const V2 = buildVixArrays(s2);
  assert.strictEqual(vixFeats(V2.dates, V2.vix, V2.vix3m, 0)[1], 0);
});
