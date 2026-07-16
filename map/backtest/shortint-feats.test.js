const test = require("node:test"), assert = require("node:assert");
const { shortIntFeats, NF } = require("./shortint-feats.js");
const ev = [
  { settle: "2023-01-15", pub: "2023-01-29", cur: 1000, prev: 800, dtc: 5, chg: 25, adv: 200 },
  { settle: "2023-01-31", pub: "2023-02-14", cur: 1400, prev: 1000, dtc: 8, chg: 40, adv: 175 },
  { settle: "2023-02-15", pub: "2023-03-01", cur: 900, prev: 1400, dtc: 4, chg: -35, adv: 225 },
];
test("shortIntFeats: length NF, pub look-ahead, growth sign, empty, deterministic", () => {
  const f = shortIntFeats(ev, "2023-02-15");   // pub<=2/15 → 1/29·2/14 가용(2번째가 최신)
  assert.strictEqual(f.length, NF);
  assert.ok(f[2] > 0, "SI growth > 0 (1000→1400)");
  // look-ahead: 2/14 공시분(2번째)까지만; 3번째(pub 3/01)는 미래라 제외
  const f2 = shortIntFeats(ev, "2023-03-05");   // 3번째 가용 → 감소
  assert.ok(f2[2] < 0, "최신분 SI growth < 0 (1400→900)");
  assert.deepStrictEqual(shortIntFeats(ev, "2022-01-01"), new Array(NF).fill(0));   // 전부 미래
  assert.deepStrictEqual(shortIntFeats([], "2023-01-01"), new Array(NF).fill(0));
  assert.deepStrictEqual(shortIntFeats(ev, "2023-02-15"), f);   // 결정성
});
