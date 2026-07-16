const test = require("node:test"), assert = require("node:assert");
const { insiderFeats, NF } = require("./insider-feats.js");

const ev = [
  { filed: "2020-01-10", code: "P", shares: 1000, value: 100000, roleRank: 3, ownerCik: "A" },
  { filed: "2020-01-15", code: "P", shares: 500, value: 50000, roleRank: 2, ownerCik: "B" },
  { filed: "2020-02-01", code: "S", shares: 200, value: 20000, roleRank: 1, ownerCik: "C" },
  { filed: "2021-06-01", code: "S", shares: 300, value: 40000, roleRank: 1, ownerCik: "C" },
];
test("insiderFeats: length NF, look-ahead cutoff, net-buy sign, empty→0", () => {
  const f = insiderFeats(ev, "2020-01-20");   // 매수 2건만 가용
  assert.strictEqual(f.length, NF);
  assert.ok(f[0] > 0, "netBuyFrac > 0 (매수만)");
  assert.ok(f[2] > 0, "numBuyers > 0 (2명)");
  // cutoff 이전만: 2021 매도는 제외
  const f2 = insiderFeats(ev, "2020-02-05");
  assert.ok(f2[0] < f[0], "매도 추가 시 netBuyFrac 하락");
  // look-ahead: cutoff 전 이벤트 없음 → 0벡터
  assert.deepStrictEqual(insiderFeats(ev, "2019-01-01"), new Array(NF).fill(0));
  assert.deepStrictEqual(insiderFeats([], "2020-01-01"), new Array(NF).fill(0));
  // 결정성
  assert.deepStrictEqual(insiderFeats(ev, "2020-01-20"), f);
});
