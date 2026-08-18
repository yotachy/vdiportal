// "전문기업 다운 품질"을 검사 가능한 다섯 규칙으로 바꾼 것(설계서 §5).
// 말로 두면 안 지켜진다 — 사용자 판정이 "개연성/스토리/UX/직관적으로 품질이 떨어져"였다.
//
// 적용 대상(APPLIES)을 두는 이유: 단계를 하나씩 고쳐 나가므로, 아직 손대지 않은 단계까지
// 검사하면 관문이 처음부터 빨갛고 아무도 신뢰하지 않게 된다. 대신 마지막 태스크가
// "7단계 전부가 목록에 있다"를 단언해 예외가 영구화되는 것을 막는다.
//
// 이 태스크(Task 2) 시점엔 등록할 단계가 하나도 없다 — 그래서 "APPLIES 가 비어 있으면
// 실패" 단언은 여기 없다(아래 "배열이고 중복이 없다"까지만). 그 단언을 지금 켜면 이
// 태스크 자신의 완료 조건(전량 통과)과 즉시 모순된다 — Task 3(1단계 화면)이 APPLIES 에
// 1 을 처음 넣으면서 test/onboarding.test.mjs 쪽에 그 단언을 함께 켠다(컨트롤러 판정,
// 2026-08-19). "왜 비어있음 검사가 없지?"로 헤매지 않도록 여기 남겨 둔다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Q = require("../www/onboarding-quality.js");

test("Q1 — metric 은 값과 기준을 한 그룹으로 묶는다", () => {
  const el = Q.metric({ value: "32.10", unit: "USD", asOf: "2006.04.25", label: "오늘 종가" });
  const txt = el.textContent || "";
  assert.match(txt, /32\.10/, "값이 없다");
  assert.match(txt, /2006\.04\.25/, "기준 시점이 값과 같은 그룹에 없다 — 값만 있는 숫자는 금지다");
  assert.match(txt, /오늘 종가/, "무엇의 값인지가 없다");
});

test("Q1 — 기준 시점 없이 부르면 던진다", () => {
  assert.throws(() => Q.metric({ value: "32.10", label: "오늘 종가" }), /기준/,
    "기준 없는 수치를 만들 수 있으면 규칙이 아니다");
});

test("Q5 — stat 은 해석 없이 만들 수 없다", () => {
  const m = Q.metric({ value: "1.2", unit: "%", asOf: "2006.04.25", label: "오차" });
  assert.throws(() => Q.stat({ metric: m }), /해석/,
    "값만 던지고 해석 없는 블록을 만들 수 있으면 규칙이 아니다");
  const ok = Q.stat({ metric: m, meaning: "이 폭 안에 들 가능성이 큽니다" });
  assert.match(ok.textContent || "", /가능성이 큽니다/);
});

test("관문이 실제로 잡는다 — 규칙마다 위반 샘플이 걸린다", () => {
  assert.throws(() => Q.metric({ value: "1" }), /기준/);
  assert.throws(() => Q.stat({ metric: Q.metric({ value: "1", unit: "", asOf: "x", label: "y" }) }), /해석/);
});

test("APPLIES 는 단계 번호 배열이고 중복이 없다", () => {
  assert.ok(Array.isArray(Q.APPLIES));
  assert.strictEqual(new Set(Q.APPLIES).size, Q.APPLIES.length, "같은 단계가 두 번 들어 있다");
});
