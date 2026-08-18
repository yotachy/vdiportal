// "전문기업 다운 품질"을 검사 가능한 다섯 규칙으로 바꾼 것(설계서 §5).
// 말로 두면 안 지켜진다 — 사용자 판정이 "개연성/스토리/UX/직관적으로 품질이 떨어져"였다.
//
// 적용 대상(APPLIES)을 두는 이유: 단계를 하나씩 고쳐 나가므로, 아직 손대지 않은 단계까지
// 검사하면 관문이 처음부터 빨갛고 아무도 신뢰하지 않게 된다. 대신 마지막 태스크가
// "7단계 전부가 목록에 있다"를 단언해 예외가 영구화되는 것을 막는다.
//
// Task 3(1단계 콜드오픈)이 APPLIES 에 1 을 처음 넣었다 — 그래서 "APPLIES 가 비어 있으면
// 실패" 단언을 이제 여기 켠다(컨트롤러 판정, 2026-08-19). 다음 태스크가 자기 단계 등록을
// 잊으면 이 관문은 빨개지지 않는다(비어 있지만 않으면 통과) — 대신 test/onboarding.test.mjs
// 의 Q2·Q4 단언이 등록되지 않은 단계에서 조용히 건너뛰어 그쪽에서 드러난다.
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

// Task 3 이 처음 켠다(위 헤더 주석) — 등록 없이는 이 다섯 규칙이 실제로 어느 화면에도
// 적용되지 않은 채로 "완료"라 말할 수 있었다. 빈 배열로 되돌아가면 그것 자체가 회귀다.
test("APPLIES 가 비어 있으면 실패 — 등록 없이 품질 규칙만 만들어두고 끝내지 않는다", () => {
  assert.ok(Q.APPLIES.length > 0, "APPLIES 가 비어 있다 — 어느 단계도 Q2·Q4 검사를 받지 않는다");
});

// ── 리뷰 I1 — 공백뿐인 문자열이 규칙을 우회한다 ──────────────────────────────────
// !opts.asOf 같은 falsy 검사는 "   "(공백뿐) 를 truthy 로 보고 통과시킨다 — "어길 수
// 없는 API"라는 이 태스크의 존재 이유가 공백 하나로 뚫리면 무너진다. trim 후 내용이
// 남는지로 검사해야 한다.
test("I1 — 공백뿐인 기준 시점은 있는 것으로 치지 않는다", () => {
  assert.throws(() => Q.metric({ value: "1", unit: "USD", asOf: "   ", label: "종가" }), /기준/,
    "공백뿐인 asOf 로 metric 을 만들 수 있다 — falsy 검사가 공백에 뚫렸다");
});

test("I1 — 공백뿐인 해석은 있는 것으로 치지 않는다", () => {
  const m = Q.metric({ value: "1", unit: "%", asOf: "2006.04.25", label: "오차" });
  assert.throws(() => Q.stat({ metric: m, meaning: "   " }), /해석/,
    "공백뿐인 meaning 으로 stat 을 만들 수 있다 — falsy 검사가 공백에 뚫렸다");
});

// "0"은 유효한 값이다(예: 오차 0%) — trim 검사가 "0"을 falsy 로 오판하면 새 규칙이
// 또 다른 방식으로 뚫린다. 그 경계도 함께 잠근다.
test("I1 — \"0\"은 유효한 값이라 계속 통과한다(trim 이 숫자 0을 falsy 로 오판하지 않는다)", () => {
  assert.doesNotThrow(() => Q.metric({ value: "0", unit: "%", asOf: "0", label: "오차" }),
    "asOf가 \"0\"이면 유효한 값인데도 던졌다");
  const m = Q.metric({ value: "0", unit: "%", asOf: "2006.04.25", label: "오차" });
  assert.doesNotThrow(() => Q.stat({ metric: m, meaning: "0" }),
    "meaning이 \"0\"이면 유효한 값인데도 던졌다");
});
