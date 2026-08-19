import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSBench = require("../www/bench.js");

// 가짜 시계 — 실제 시간에 의존하지 않는 테스트.
// measure 는 반복마다 clock() 을 두 번 부른다(시작·종료). 짝수번째 호출은 시작 시각을
// 그대로 주고, 홀수번째 호출에서 소요분을 더한 뒤 준다 = 그 반복의 경과시간이 deltas[k].
function clockFrom(deltas) {
  let t = 0, i = 0;
  return () => {
    if (i % 2 === 1) t += deltas[(i - 1) >> 1];
    i++;
    return t;
  };
}

test("워밍업 1회는 표본에서 빠진다", () => {
  let calls = 0;
  MSBench.measure(() => { calls++; }, 5, clockFrom([1, 1, 1, 1, 1]));
  assert.equal(calls, 6, "워밍업 포함 6회여야 한다");
});

test("중앙값·최소·최대를 정렬해서 낸다", () => {
  const r = MSBench.measure(() => {}, 5, clockFrom([50, 10, 30, 20, 40]));
  assert.equal(r.min, 10);
  assert.equal(r.max, 50);
  assert.equal(r.median, 30);
  assert.equal(r.n, 5);
  assert.deepEqual(r.samples, [10, 20, 30, 40, 50]);
});

test("n 을 생략하면 5회", () => {
  const r = MSBench.measure(() => {}, undefined, clockFrom([1, 2, 3, 4, 5]));
  assert.equal(r.n, 5);
  assert.equal(r.samples.length, 5);
});

test("짝수 표본에서도 중앙값이 표본 안의 값이다", () => {
  const r = MSBench.measure(() => {}, 4, clockFrom([10, 20, 30, 40]));
  assert.ok(r.samples.includes(r.median));
});
