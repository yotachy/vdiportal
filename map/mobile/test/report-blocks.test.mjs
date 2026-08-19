// 티어별 블록 수·순서가 이 개편의 판매 논거다(설계 §3.2·§3.5·§3.7).
// 전문이 심화보다 적으면 5스쿱을 낸 사용자가 손해를 본 것이다 — 기계가 지킨다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const B = require("../www/report-blocks.js");
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");

test("블록 수 — 기본 3 · 심화 8 · 전문 9", () => {
  assert.strictEqual(B.forTier("basic").length, 3);
  assert.strictEqual(B.forTier("full").length, 8);
  assert.strictEqual(B.forTier("custom").length, 9);
  assert.deepStrictEqual(B.COUNTS, { basic: 3, full: 8, custom: 9 });
});

test("전문은 심화의 모든 블록을 유지한 채 조절판만 더한다", () => {
  const full = B.forTier("full").map(b => b.id);
  const custom = B.forTier("custom").map(b => b.id);
  for (const id of full) assert.ok(custom.indexOf(id) >= 0, "전문에서 심화 블록이 빠졌다: " + id);
  const extra = custom.filter(id => full.indexOf(id) < 0);
  assert.deepStrictEqual(extra, ["weights"], "전문이 더한 것은 조절판 하나여야 한다");
});

test("심화 순서는 값이 큰 것부터 — 「한 문장으로」가 맨 위 (시안 19b)", () => {
  const ids = B.forTier("full").map(b => b.id);
  assert.strictEqual(ids[0], "sentence", "숫자를 먼저 내면 대부분은 해석을 못 하고 닫는다");
  assert.ok(ids.indexOf("dissent") < ids.indexOf("horizons"), "반대 의견이 기간보다 아래다");
  assert.ok(ids.indexOf("hitrate") < ids.indexOf("readings"), "적중률이 판독문보다 아래다");
});

test("전문의 조절판은 판정보다 위다 (시안 18c)", () => {
  const ids = B.forTier("custom").map(b => b.id);
  assert.ok(ids.indexOf("weights") < ids.indexOf("sentence"), "조절판이 판정 아래로 내려갔다");
});

test("기본에는 확률·판독문 블록이 없다 — 방향과 범위만 말한다", () => {
  const ids = B.forTier("basic").map(b => b.id);
  for (const forbidden of ["hitrate", "readings", "dissent", "horizons"])
    assert.ok(ids.indexOf(forbidden) < 0, "기본이 " + forbidden + " 를 그린다");
});


// 2026-08-18 리뷰(Critical): 선언(forTier)이 새 id 를 늘려도 report.js 의 BUILD 표가 못 따라가면
// 그 블록은 화면에서 **조용히** 사라진다(if (!fn) return). 브라우저 관문은 기본 티어만 열어서
// 이 사고를 못 잡았다 — 관문 6/6 인 채로 심화·전문이 8개 중 3개, 9개 중 4개만 그리고 있었다.
// 그래서 "빌더도 PENDING 도 없는 id"를 소스 정적 분석으로 강제한다: 선언된 모든 id 는 반드시
// BUILD(그린다) 또는 PENDING(아직 못 그린다, 사유 있음) 둘 중 하나에 있어야 한다.
test("선언된 모든 블록은 빌더(BUILD)에 있거나 PENDING 에 있다 — 조용히 사라지는 블록을 막는다", () => {
  const buildBlock = REPORT.match(/var BUILD = \{([\s\S]*?)\n        \};/);
  assert.ok(buildBlock, "report.js 에서 BUILD 표를 못 찾았다 — 정규식이 report.js 구조 변경을 못 따라갔다");
  const builtKeys = [...buildBlock[1].matchAll(/^\s{10}([a-zA-Z]+)\s*:/gm)].map(m => m[1]);

  const pendingBlock = REPORT.match(/var PENDING = \{([\s\S]*?)\n  \};/);
  assert.ok(pendingBlock, "report.js 에서 PENDING 표를 못 찾았다");
  const pendingKeys = [...pendingBlock[1].matchAll(/^\s{4}([a-zA-Z]+)\s*:/gm)].map(m => m[1]);

  const declared = [...new Set(["basic", "full", "custom"].flatMap(t => B.forTier(t).map(b => b.id)))];
  const orphans = declared.filter(id => builtKeys.indexOf(id) < 0 && pendingKeys.indexOf(id) < 0);
  assert.deepStrictEqual(orphans, [],
    "빌더도 PENDING 도 없는 블록(조용히 사라진다): " + orphans.join(", "));
});

// P1b Task 6 이 PENDING 을 비웠다 — 위 "PENDING 이 비어있지 않은 티어가 있다" 단언은 자기
// 예고대로(그 테스트의 옛 주석 마지막 줄) 이제 무의미해져 지웠다. 그 반대쪽 가드로 교체한다:
// 선언(full·custom)에 PENDING 항목이 하나도 안 남았는지, 즉 report.js 의 tierBuyable()이
// 실제로 둘 다 true 를 돌려줄 조건이 성립하는지를 잠근다. tierBuyable() 자신은 report.js
// 모듈 스코프 클로저라 여기서 직접 부를 수 없으므로(이 파일은 report-blocks.js 만 require
// 한다), 그 함수와 같은 계산(pendingOf(tier).length === 0)을 정적 분석으로 그대로 재현한다
// — report-full.test.mjs 가 이걸 vm 으로 실행해 한 번 더 잰다(설치된 훅으로 실함수 호출).
test("잠금 해제 — 심화·전문 둘 다 PENDING 이 없다(tierBuyable() 이 참일 조건)", () => {
  const pendingBlock = REPORT.match(/var PENDING = \{([\s\S]*?)\n  \};/);
  assert.ok(pendingBlock, "report.js 에서 PENDING 표를 못 찾았다");
  const pendingKeys = [...pendingBlock[1].matchAll(/^\s{4}([a-zA-Z]+)\s*:/gm)].map(m => m[1]);
  ["full", "custom"].forEach(t => {
    const ids = B.forTier(t).map(b => b.id);
    const pending = ids.filter(id => pendingKeys.indexOf(id) >= 0);
    assert.deepStrictEqual(pending, [], t + " 에 아직 PENDING 블록이 남아 있다: " + pending.join(", "));
  });
});
