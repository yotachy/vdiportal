// 예측 기록·판정 — 앱의 고리(핸드오프 README §B). 여기서 재는 것은 "무엇을 맞았다고
// 부르는가"의 정의다. 그 정의가 화면마다 달라지면 같은 결과가 화면에 따라 다르게 읽힌다.
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const P = require("../www/predictions.js");

function rec(over) {
  return P.make(Object.assign({
    sym: "aapl", name: "애플", tier: "full", asOf: "2026-08-16",
    base: 233.0, mid: 234.2, lo: 233.1, hi: 235.3, basicLo: 232, basicHi: 236,
    at: "2026-08-16T09:41:00Z", engineVersion: "1.11.0"
  }, over || {}));
}
function bars(list) { return list.map(x => ({ t: x[0], c: x[1] })); }

test("기록은 심볼을 대문자로 정규화하고, 값이 없으면 만들지 않는다", () => {
  assert.equal(rec().sym, "AAPL");
  assert.equal(P.make({ sym: "AAPL", asOf: "2026-08-16" }), null, "중심·범위 없이 기록이 생겼다");
  assert.equal(P.make(null), null);
  assert.equal(P.make({ asOf: "2026-08-16", mid: 1, lo: 0, hi: 2 }), null, "심볼 없이 기록이 생겼다");
});

test("기준일과 같은 날 봉으로는 판정하지 않는다 — 예측한 그 봉을 자기가 맞혔다고 말하게 된다", () => {
  const r = rec();
  assert.equal(P.judge(r, bars([["2026-08-16", 234.0]])), null,
    "기준일 당일 봉으로 판정했다");
  assert.equal(P.judge(r, bars([["2026-08-15", 231.0]])), null, "기준일 이전 봉으로 판정했다");
  assert.ok(P.judge(r, bars([["2026-08-17", 234.0]])), "다음 봉이 있는데 판정하지 않는다");
});

test("결과가 아직 없으면 없다고 한다 — 빈 값을 0 으로 채우지 않는다", () => {
  assert.equal(P.judge(rec(), []), null);
  assert.equal(P.judge(rec(), null), null);
  assert.equal(P.judge(rec(), bars([["2026-08-17", null]])), null, "종가 없는 봉으로 판정했다");
});

test("적중은 방향이 아니라 **범위**로 잰다", () => {
  const r = rec();   // 233.1 – 235.3
  // 방향(오름)은 맞았지만 범위 밖 — 시안이 말하는 적중이 아니다.
  const up = P.judge(r, bars([["2026-08-17", 240.0]]));
  assert.equal(up.hit, false, "범위를 벗어났는데 적중으로 쳤다");
  assert.ok(Math.abs(up.miss - 4.7) < 1e-9, "벗어난 거리: " + up.miss);
  const inside = P.judge(r, bars([["2026-08-17", 233.9]]));
  assert.equal(inside.hit, true);
  assert.equal(inside.miss, 0, "안쪽인데 벗어난 거리가 있다");
});

test("경계값은 안쪽이다 — 말한 범위를 지킨 것이다", () => {
  const r = rec();
  assert.equal(P.judge(r, bars([["2026-08-17", 233.1]])).hit, true, "하단 경계가 밖으로 밀렸다");
  assert.equal(P.judge(r, bars([["2026-08-17", 235.3]])).hit, true, "상단 경계가 밖으로 밀렸다");
});

test("좁혀서 빗나간 경우를 구분한다 — 14b 가 그 말을 할 수 있는 유일한 조건", () => {
  const r = rec();   // 심화 233.1–235.3 · 기본 232–236
  const j = P.judge(r, bars([["2026-08-17", 235.8]]));
  assert.equal(j.hit, false);
  assert.equal(j.basicHit, true, "기본 범위 안인데 아니라고 한다");
  assert.equal(j.narrowedAndMissed, true,
    "'기본분석이었다면 적중이었습니다'를 말할 수 있는 상태를 못 알아본다");
  // 둘 다 빗나가면 그 문장은 거짓이다.
  const both = P.judge(r, bars([["2026-08-17", 300]]));
  assert.equal(both.narrowedAndMissed, false, "둘 다 빗나갔는데 기본이 맞았다고 말하려 한다");
});

test("기본 범위를 기록하지 않았으면 그 비교를 하지 않는다 — 지어내지 않는다", () => {
  const r = rec({ basicLo: undefined, basicHi: undefined });
  const j = P.judge(r, bars([["2026-08-17", 240]]));
  assert.equal(j.basicHit, null, "없는 기본 범위를 있다고 판정했다");
  assert.equal(j.narrowedAndMissed, false);
});

test("개인 적중률은 20건 미만이면 내지 않는다 — 14건에 67% 는 거짓말이다", () => {
  const mk = n => Array.from({ length: n }, (_, i) => ({ hit: i % 2 === 0 }));
  assert.equal(P.hitRate(mk(19)), null, "19건인데 퍼센트를 냈다");
  assert.equal(P.hitRate([]), null);
  const r = P.hitRate(mk(20));
  assert.ok(r && r.n === 20, "20건인데 안 낸다");
  assert.ok(Math.abs(r.rate - 0.5) < 1e-9, "적중률 계산이 틀렸다: " + r.rate);
  assert.equal(P.MIN_N, 20, "문턱이 20 이 아니다 — 핸드오프 원칙 5");
});

test("판정 안 된 것만 대기 목록에 남는다", () => {
  const list = [{ sym: "A" }, { sym: "B", judgedOn: "2026-08-17" }, null];
  assert.deepEqual(P.pending(list).map(r => r.sym), ["A"]);
});

test("최근 결과는 판정일 최신순 3건이다 — 시안 14a", () => {
  const j = [
    { sym: "A", judgedOn: "2026-08-15" }, { sym: "B", judgedOn: "2026-08-17" },
    { sym: "C", judgedOn: "2026-08-16" }, { sym: "D", judgedOn: "2026-08-14" }
  ];
  assert.deepEqual(P.recent(j).map(r => r.sym), ["B", "C", "A"]);
  assert.equal(P.recent(j, 2).length, 2);
});

test("판정은 기록에 적힌 값으로만 한다 — 오늘 다시 계산하지 않는다", () => {
  // 기록에 범위가 있으면 그 값으로 잰다. 판정 시점에 엔진을 다시 돌리면 그때의 데이터가
  // 아니라 오늘 데이터로 재게 되고, "어제 이렇게 말했다"가 사후 수정된다.
  const r = rec({ lo: 100, hi: 110, mid: 105 });
  const j = P.judge(r, bars([["2026-08-17", 105]]));
  assert.equal(j.lo, 100);
  assert.equal(j.hi, 110);
  assert.equal(j.width, 10);
  assert.equal(j.hit, true);
});
