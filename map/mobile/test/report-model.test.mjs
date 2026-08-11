import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const M = require("../www/report-model.js");
const FC = require("../../forge-core.js");

// 24봉 예측 — futW 기본값과 같은 길이. 값은 단조 상승, 밴드는 √k 로 벌어진다.
function pred(n = 24, dir = 1) {
  const anchor = 100, path = [], lo = [], hi = [];
  for (let k = 1; k <= n; k++) {
    const v = anchor + dir * k * 0.4, band = 3 * Math.sqrt(k);
    path.push(v); lo.push(v - band); hi.push(v + band);
  }
  return { anchor, path, lo, hi, futW: n };
}

test("지평은 1·5·21봉 세 개다", () => {
  assert.deepEqual(M.HORIZONS.map(h => h.bars), [1, 5, 21]);
  assert.deepEqual(M.HORIZONS.map(h => h.key), ["d1", "w1", "m1"]);
});

test("지평 행이 해당 봉의 예측가를 집어온다", () => {
  const p = pred();
  const rows = M.horizonRows(FC, p, "bull");
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0].price, p.path[0]);    // 1봉 → index 0
  assert.strictEqual(rows[1].price, p.path[4]);    // 5봉 → index 4
  assert.strictEqual(rows[2].price, p.path[20]);   // 21봉 → index 20
});

test("변화율은 현재가 대비 퍼센트다", () => {
  const rows = M.horizonRows(FC, pred(), "bull");
  // anchor 100, 1봉 예측 100.4 → +0.4%
  assert.strictEqual(Math.round(rows[0].chgPct * 10) / 10, 0.4);
});

test("경로가 짧으면 그 지평 행을 건너뛴다", () => {
  const rows = M.horizonRows(FC, pred(6), "bull");
  assert.deepEqual(rows.map(r => r.bars), [1, 5], "21봉 행이 남아 있다");
});

test("경로가 없으면 빈 배열", () => {
  assert.deepEqual(M.horizonRows(FC, null, "bull"), []);
  assert.deepEqual(M.horizonRows(FC, { path: [] }, "bull"), []);
});

test("중립 판정이면 달성확률만 null 이고 가격·변화율은 남는다", () => {
  const rows = M.horizonRows(FC, pred(), "neutral");
  assert.strictEqual(rows.length, 3);
  for (const r of rows) {
    assert.strictEqual(r.prob, null, "중립인데 확률이 있다");
    assert.ok(isFinite(r.price), "가격이 사라졌다");
  }
});

test("확신 — 상승 판정이면 상승확률 그대로, 하락 판정이면 뒤집는다", () => {
  const p = pred();
  const up = FC.aggUpProb(p);
  assert.strictEqual(M.confidence(FC, p, "bull"), up);
  assert.strictEqual(M.confidence(FC, p, "bear"), 100 - up);
});

test("확신 — 중립이면 null, 경로 없으면 null", () => {
  assert.strictEqual(M.confidence(FC, pred(), "neutral"), null);
  assert.strictEqual(M.confidence(FC, null, "bull"), null);
});

test("적중률 — 요약이 없으면 null(생성물 미로드 방어)", () => {
  assert.strictEqual(M.hitRate(null), null);
  assert.strictEqual(M.hitRate(undefined), null);
  assert.strictEqual(M.hitRate({}), null);
});

test("적중률 — 소수 첫째 자리까지, 합이 100", () => {
  const r = M.hitRate({ directionHitRate: 0.5805571790375998 });
  assert.strictEqual(r.right, 58.1);
  assert.strictEqual(r.wrong, 41.9);
  assert.strictEqual(Math.round((r.right + r.wrong) * 10) / 10, 100);
});
