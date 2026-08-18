// 티어별 블록 수·순서가 이 개편의 판매 논거다(설계 §3.2·§3.5·§3.7).
// 전문이 심화보다 적으면 5스쿱을 낸 사용자가 손해를 본 것이다 — 기계가 지킨다.
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const B = require("../www/report-blocks.js");

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
