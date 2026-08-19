import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("../www/layout.js");

// 폴드7 실측(2026-08-11): 커버 411×814 · 펼침 749×654
test("실측 네 상태의 모드 판정", () => {
  assert.equal(L.isDual(411, 814), false, "커버 세로");
  assert.equal(L.isDual(814, 411), false, "커버 가로 — 높이 411 에 두 칸을 세우면 리포트를 못 쓴다");
  assert.equal(L.isDual(749, 654), true, "펼침 세로");
  assert.equal(L.isDual(654, 749), true, "펼침 가로");
});

test("모드 경계는 600×480 이다", () => {
  // 리터럴로 적는다 — L.MIN_W/L.MIN_H 를 읽으면 상수를 바꿨을 때 기대값이 함께 움직여 항등식이 된다.
  assert.equal(L.isDual(599, 480), false, "폭 하한 미달");
  assert.equal(L.isDual(600, 480), true, "경계는 포함");
  assert.equal(L.isDual(600, 479), false, "높이 하한 미달");
});

test("MODE_QUERY 는 완성된 문자열이다", () => {
  assert.equal(L.MODE_QUERY, "(min-width: 600px) and (min-height: 480px)");
});

test("MODE_QUERY 와 isDual 이 같은 경계를 말한다 — 두 출처 이탈 방지", () => {
  const m = /min-width:\s*(\d+)px[\s\S]*min-height:\s*(\d+)px/.exec(L.MODE_QUERY);
  assert.ok(m, "MODE_QUERY 에서 경계값을 못 읽었다: " + L.MODE_QUERY);
  const w = +m[1], h = +m[2];
  assert.equal(L.isDual(w, h), true, "쿼리가 통과시키는 크기를 isDual 이 막는다");
  assert.equal(L.isDual(w - 1, h), false, "쿼리가 막는 폭을 isDual 이 통과시킨다");
  assert.equal(L.isDual(w, h - 1), false, "쿼리가 막는 높이를 isDual 이 통과시킨다");
});

test("목록 폭 — 펼침 749 에서 255", () => {
  assert.equal(L.listWidth(749), 255);
});

test("목록 폭 clamp — 240 아래·300 위로 안 나간다", () => {
  assert.equal(L.listWidth(600), 240, "600×0.34=204 → 하한이 물어야 한다");
  assert.equal(L.listWidth(1400), 300, "1400×0.34=476 → 상한이 물어야 한다");
});

test("차트 높이 — 단일은 520 고정(Phase 1~4 검증값)", () => {
  assert.equal(L.chartHeight(false, 814), 520, "커버 세로");
  assert.equal(L.chartHeight(false, 411), 520, "커버 가로에서도 단일이면 안 바뀐다");
});

test("차트 높이 — 펼침 654 에서 414", () => {
  assert.equal(L.chartHeight(true, 654), 414);
});

test("차트 높이 clamp — 320~460", () => {
  assert.equal(L.chartHeight(true, 500), 320, "500-240=260 → 하한");
  assert.equal(L.chartHeight(true, 900), 460, "900-240=660 → 상한");
});

test("이상 입력에 NaN 을 뱉지 않는다 — 캔버스 width/height 로 바로 들어간다", () => {
  const bads = [NaN, undefined, null, Infinity];
  for (const bad of bads) {
    assert.ok(isFinite(L.listWidth(bad)), "listWidth(" + bad + ") = " + L.listWidth(bad));
    assert.ok(isFinite(L.chartHeight(true, bad)), "chartHeight(true," + bad + ") = " + L.chartHeight(true, bad));
    assert.ok(isFinite(L.chartHeight(false, bad)), "chartHeight(false," + bad + ")");
  }
});
