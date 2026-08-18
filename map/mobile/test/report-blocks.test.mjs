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

// PENDING 이 있는 티어는 사면 안 된다 — 위 가드가 "선언 vs 빌더" 간극을 드러내는 것과 짝을
// 이루는 반대쪽 가드다: 간극이 있다는 사실을 아는 것과, 그 간극이 있는 동안 돈을 안 받는 것은
// 별개 보장이라 둘 다 있어야 한다. tier-sheet.js 가 report.js 의 pendingOf()/tierBuyable() 이
// 준 locked 를 실제로 반영하는지는 tier-sheet.js 자체를 읽어야 확인되므로, 여기서는 "지금
// full·custom 에 PENDING 항목이 실제로 있다"(=잠겨야 하는 상태)는 사실 자체를 고정한다 —
// 이 항목이 전부 비면(=P1b 가 다 채우면) 이 단언은 스스로 무의미해지고, 그때 지워도 된다.
test("PENDING 이 비어있지 않은 티어가 실제로 있다 — 그 티어는 tier-sheet.js 가 잠가야 한다", () => {
  const pendingBlock = REPORT.match(/var PENDING = \{([\s\S]*?)\n  \};/);
  const pendingKeys = [...pendingBlock[1].matchAll(/^\s{4}([a-zA-Z]+)\s*:/gm)].map(m => m[1]);
  ["full", "custom"].forEach(t => {
    const ids = B.forTier(t).map(b => b.id);
    const pending = ids.filter(id => pendingKeys.indexOf(id) >= 0);
    assert.ok(pending.length > 0, t + " 에 PENDING 블록이 없다 — 이제 구매를 막을 이유가 없다면 " +
      "tier-sheet.js 의 locked 배선과 이 단언을 함께 정리할 것");
  });
});
