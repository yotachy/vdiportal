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

test("undo 스택: 빈 스택은 null", () => {
  const T2 = require("./forge-tools.js");
  T2._undoReset();
  assert.strictEqual(T2._undoPop(), null, "빈 스택은 null");
});

test("undo 스택: push/pop 왕복 — 저장된 상태를 그대로 복원", () => {
  const T2 = require("./forge-tools.js");
  const original = [
    { id: "d_001", type: "trend", a: { t: "2026-01-05", p: 100 }, b: { t: "2026-01-06", p: 110 } }
  ];
  T2.drawsLoad(original);
  T2._undoReset();
  T2._undoPush();

  // 라이브 상태 변경
  T2.drawsLoad([
    { id: "d_002", type: "channel", a: { t: "2026-01-07", p: 120 }, b: { t: "2026-01-08", p: 130 } }
  ]);

  // pop 하면 원래 상태가 나와야 함
  const restored = T2._undoPop();
  assert.strictEqual(restored.length, 1);
  assert.strictEqual(restored[0].id, "d_001");
  assert.strictEqual(restored[0].type, "trend");
  assert.strictEqual(restored[0].a.p, 100);
});

test("undo 스택: 스냅샷 격리 — 복원된 상태가 라이브 상태와 독립", () => {
  const T2 = require("./forge-tools.js");
  const original = [{ id: "d_001", type: "trend", a: { t: "2026-01-05", p: 100 }, b: { t: "2026-01-06", p: 110 } }];
  T2.drawsLoad(original);
  T2._undoReset();
  T2._undoPush();

  // 복원된 상태를 뮤테이트
  const restored = T2._undoPop();
  restored[0].a.p = 999;

  // 라이브 상태가 변하지 않았는지 확인
  const live = T2.drawsAll();
  assert.strictEqual(live[0].a.p, 100, "라이브 상태는 독립적이어야 함");
});

test("undo 스택: 최대 30개 제한 — 31개 push 시 첫 번째가 삭제됨", () => {
  const T2 = require("./forge-tools.js");
  T2._undoReset();

  // 31개 push
  for (let i = 0; i < 31; i++) {
    T2.drawsLoad([{ id: `d_${String(i).padStart(3, "0")}`, type: "trend", a: { t: "2026-01-05", p: 100 + i }, b: { t: "2026-01-06", p: 110 + i } }]);
    T2._undoPush();
  }

  // 정확히 30개만 pop 가능
  let count = 0;
  let oldestRemaining = null;
  let popped;
  while ((popped = T2._undoPop()) !== null) {
    oldestRemaining = popped;  // 마지막 pop이 가장 오래된 남은 것
    count++;
  }
  assert.strictEqual(count, 30, "정확히 30개만 pop 가능해야 함");
  assert.strictEqual(oldestRemaining[0].id, "d_001", "가장 오래된 유지된 스냅샷은 d_001이어야 함 (d_000이 삭제됨)");
});

test("drawStyle: color·w 가 없으면 도구 기본색과 CW.base", () => {
  const T2 = require("./forge-tools.js");
  const s = T2.drawStyle({ type: "trend" });
  assert.strictEqual(typeof s.color, "string");
  assert.ok(s.color.length >= 4, "기본색이 있어야: " + s.color);
  assert.ok(Math.abs(s.w - 1.25) < 1e-9, "기본 굵기는 CW.base(1.25): " + s.w);
});

test("drawStyle: 저장된 color·w 를 그대로 쓴다", () => {
  const T2 = require("./forge-tools.js");
  const s = T2.drawStyle({ type: "trend", color: "#46c28e", w: "bold" });
  assert.strictEqual(s.color, "#46c28e");
  assert.ok(Math.abs(s.w - 1.6) < 1e-9, "bold 는 1.6: " + s.w);
});

test("drawStyle: 알 수 없는 w 는 base 로 떨어진다", () => {
  const T2 = require("./forge-tools.js");
  assert.ok(Math.abs(T2.drawStyle({ type: "trend", w: "zzz" }).w - 1.25) < 1e-9);
});

test("스와치 상수: 색 5종·굵기 3단", () => {
  const T2 = require("./forge-tools.js");
  assert.strictEqual(T2.SW_COLORS.length, 5);
  assert.deepStrictEqual(T2.SW_W, ["thin", "base", "bold"]);
});
