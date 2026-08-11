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

// §① 최종수정웨이브 — 지평 행 확률이 캘리브레이션을 거치는지 리터럴로 고정한다. 헤드라인 확신
// (FC.aggUpProb)과 차트 레전드(forge-draw.js:_predPCal)는 이미 FC.calibrateUpProb 를 통과하므로,
// 지평 행만 원값을 쓰면 Platt 절편(+0.3501)만큼 어긋난다.
test("지평 행 확률은 캘리브레이션을 거친다 — 미보정 원값과 다르다", () => {
  const p = pred();
  const rows = M.horizonRows(FC, p, "bull");
  const raw0 = FC.upProb(p.path[0], p.hi[0], p.anchor);   // d1 행 = index 0
  assert.notStrictEqual(rows[0].prob, raw0, "보정을 거치지 않은 원값과 같다");
  assert.strictEqual(rows[0].prob, FC.calibrateUpProb(raw0), "FC.calibrateUpProb 결과와 다르다");
});

// 지평 행 확률은 "그 판정이 맞을 확률"이 아니라 "그 행의 가격 변화가 실현될 확률"이다 — regime
// 을 bull↔bear 로 뒤집어도(판정만 바뀌고 예측 경로 path/hi/lo 는 그대로이므로) 행 확률은 불변이어야
// 한다. confidence()는 정반대로 regime 에 따라 뒤집힌다 — 그 계약과 섞이면 안 된다.
test("지평 행 확률은 regime 이 아니라 그 행의 변화 방향으로만 뒤집힌다 — bull/bear 전환에 불변", () => {
  const p = pred();
  const bullRows = M.horizonRows(FC, p, "bull");
  const bearRows = M.horizonRows(FC, p, "bear");
  assert.deepEqual(bullRows.map(r => r.prob), bearRows.map(r => r.prob));
  assert.deepEqual(bullRows.map(r => r.dir), bearRows.map(r => r.dir));
});

// §⑥ 최종수정웨이브 — dir 필드는 색 판정(screens/report.js)과 확률 뒤집기가 공유하는 단일 임계.
test("dir — FLAT_EPS 데드존 경계에서 up/down/flat 이 갈린다", () => {
  const eps = M.FLAT_EPS;
  assert.strictEqual(typeof eps, "number");
  const p = pred(1, 1);   // 1봉, anchor 100 → path[0] = 100.4 (+0.4%, up)
  assert.strictEqual(M.horizonRows(FC, p, "bull")[0].dir, "up");
});

// §② 최종수정웨이브(사용자 결정) — 방향별 적중률. 전역 directionHitRate 대신 그 방향의 실측치를 쓴다.
test("적중률 — bull 이면 bullHitRate, bear 면 bearHitRate 을 쓴다(리터럴)", () => {
  const summary = { bullHitRate: 0.6150851968066092, bearHitRate: 0.4259028642590286 };
  const bull = M.hitRate(summary, "bull");
  assert.strictEqual(bull.right, 61.5);
  assert.strictEqual(bull.wrong, 38.5);
  const bear = M.hitRate(summary, "bear");
  assert.strictEqual(bear.right, 42.6);
  assert.strictEqual(bear.wrong, 57.4);
});

test("적중률 — 요약이 없거나 해당 방향 필드가 없거나 regime 이 중립/미지정이면 null", () => {
  assert.strictEqual(M.hitRate(null, "bull"), null);
  assert.strictEqual(M.hitRate(undefined, "bear"), null);
  assert.strictEqual(M.hitRate({}, "bull"), null, "bullHitRate 필드가 없다");
  assert.strictEqual(M.hitRate({ bullHitRate: 0.6 }, "bear"), null, "bearHitRate 필드가 없다");
  assert.strictEqual(M.hitRate({ bullHitRate: 0.6, bearHitRate: 0.4 }, "neutral"), null);
  assert.strictEqual(M.hitRate({ bullHitRate: 0.6, bearHitRate: 0.4 }), null, "regime 미지정");
});
