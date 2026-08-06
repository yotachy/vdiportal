const test = require("node:test");
const assert = require("node:assert");
const T = require("./forge-tools.js");

const TIMES = ["2026-01-05","2026-01-06","2026-01-07","2026-01-08","2026-01-09"];

test("tToFi: 정확히 일치하는 날짜는 그 인덱스", () => {
  assert.strictEqual(T.tToFi(TIMES, "2026-01-05"), 0);
  assert.strictEqual(T.tToFi(TIMES, "2026-01-08"), 3);
});

test("tToFi: 두 봉 사이는 선형 보간(일봉 선을 주봉에서 볼 때)", () => {
  // 01-06 과 01-07 사이의 중간 지점
  const fi = T.tToFi(["2026-01-06","2026-01-08"], "2026-01-07");
  assert.ok(fi > 0 && fi < 1, "0과 1 사이여야: " + fi);
  assert.ok(Math.abs(fi - 0.5) < 0.001, "중간이어야: " + fi);
});

test("tToFi: 첫 봉 이전은 음수(창 밖 → 클립 대상)", () => {
  assert.ok(T.tToFi(TIMES, "2026-01-01") < 0);
});

test("tToFi: 마지막 봉 이후는 마지막 간격으로 외삽(예측 구간)", () => {
  const fi = T.tToFi(TIMES, "2026-01-11");   // 마지막(idx 4)에서 2일 뒤
  assert.ok(fi > 4, "4보다 커야: " + fi);
  assert.ok(Math.abs(fi - 6) < 0.001, "하루=1봉 간격이면 6: " + fi);
});

test("tToFi: 빈 배열·잘못된 입력은 NaN", () => {
  assert.ok(Number.isNaN(T.tToFi([], "2026-01-05")));
  assert.ok(Number.isNaN(T.tToFi(TIMES, "")));
});

test("fiToT: 봉 위치 → 날짜(반올림), 범위 밖은 양끝으로 클램프", () => {
  assert.strictEqual(T.fiToT(TIMES, 2), "2026-01-07");
  assert.strictEqual(T.fiToT(TIMES, 2.4), "2026-01-07");
  assert.strictEqual(T.fiToT(TIMES, -3), "2026-01-05");
  assert.strictEqual(T.fiToT(TIMES, 99), "2026-01-09");
});

test("segDist: 선분 위의 점은 0, 수직 거리, 끝점 너머는 끝점까지", () => {
  assert.ok(T.segDist(5, 0, 0, 0, 10, 0) < 1e-9);      // 선분 위
  assert.ok(Math.abs(T.segDist(5, 3, 0, 0, 10, 0) - 3) < 1e-9);   // 수직
  assert.ok(Math.abs(T.segDist(-4, 0, 0, 0, 10, 0) - 4) < 1e-9);  // 왼쪽 너머
  assert.ok(Math.abs(T.segDist(14, 0, 0, 0, 10, 0) - 4) < 1e-9);  // 오른쪽 너머
});

test("chanOff: 기준선에서 점까지의 수직 가격 차(부호 유지)", () => {
  const a = { fi: 0, p: 100 }, b = { fi: 10, p: 200 };   // 봉당 +10
  assert.ok(Math.abs(T.chanOff(a, b, { fi: 5, p: 150 })) < 1e-9);   // 선 위 = 0
  assert.ok(Math.abs(T.chanOff(a, b, { fi: 5, p: 170 }) - 20) < 1e-9);
  assert.ok(Math.abs(T.chanOff(a, b, { fi: 5, p: 130 }) + 20) < 1e-9);
});
