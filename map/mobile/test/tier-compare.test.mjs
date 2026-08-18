// 이 카드가 개편의 판매 논거다. 숫자가 틀리면 나머지 전부를 잃는다(시안 7a).
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../www/tier-compare.js");
const SRC = readFileSync(new URL("../www/tier-compare.js", import.meta.url), "utf8");

test("적중률은 MSBacktest 에서만 온다 — 리터럴 금지", () => {
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m,p)=>p);
  assert.ok(!/\b(58|61|63|67)\s*[.%]/.test(body), "적중률처럼 보이는 리터럴이 있다");
  assert.match(body, /MSBacktest/, "실측 출처를 안 읽는다");
});

test("전문 티어는 실측이 없으므로 rate 가 null 이다 — 화면이 '측정 중'을 그린다", () => {
  const rows = C.rows({ lo: 232, hi: 236, mid: 234.2, err: 1.1 });
  const pro = rows.filter(r => r.tier === "custom")[0];
  assert.strictEqual(pro.rate, null, "없는 값을 지어냈다");
});

test("심화의 폭이 기본의 절반 가까이여야 카드가 말이 된다", () => {
  const rows = C.rows({ lo: 232, hi: 236, mid: 234.2, err: 1.1 });
  const basic = rows.filter(r => r.tier === "basic")[0];
  const full = rows.filter(r => r.tier === "full")[0];
  assert.ok(full.width < basic.width, "심화가 기본보다 좁지 않다 — 팔 것이 없다");
});

test("방향 적중률은 자명 기준선을 동반한다", () => {
  assert.ok(C.baseline() > 0.5, "기준선을 노출하지 않으면 58%가 좋아 보인다");
});

// ── 여기부터 이 태스크가 더한 시험 ──────────────────────────────────────────────────────

test("기본·심화 rate 는 실측(현재 데이터: 58.2 / 58.5)이고 리터럴이 아니라 계산값이다", () => {
  const rows = C.rows({ lo: 232, hi: 236, mid: 234.2, err: 1.1 });
  const basic = rows.filter(r => r.tier === "basic")[0];
  const full = rows.filter(r => r.tier === "full")[0];
  assert.ok(typeof basic.rate === "number" && basic.rate > 50 && basic.rate < 70, "기본 rate 가 그럴듯한 범위 밖이다: " + basic.rate);
  assert.ok(typeof full.rate === "number" && full.rate >= basic.rate, "심화 rate 가 기본보다 낮다 — 실측과 안 맞는다");
});

test("심화 카드의 note 는 기본→심화 두 rate 숫자와 콘 커버리지를 실제로 담는다(문구가 비어있지 않다)", () => {
  const rows = C.rows({ lo: 232, hi: 236, mid: 234.2, err: 1.1 });
  const full = rows.filter(r => r.tier === "full")[0];
  assert.ok(full.note && full.note.length > 10, "심화 카드에 불리한 사실 문장이 없다");
  assert.ok(/%p/.test(full.note), "적중률 차이(%p)가 문장에 없다");
  assert.ok(/콘 커버리지/.test(full.note), "심화가 파는 것(범위·콘 커버리지)을 말하지 않는다");
});

test("전문 카드에는 '기본분석보다 낮아질 수 있다' 경고가 있다", () => {
  const rows = C.rows({ lo: 232, hi: 236, mid: 234.2, err: 1.1 });
  const pro = rows.filter(r => r.tier === "custom")[0];
  assert.ok(pro.note && /낮아질/.test(pro.note), "전문 카드에 하향 경고 문구가 없다: " + pro.note);
});

test("전문 티어는 폭도 낼 수 없다 — lo/hi/width 전부 null(설정에 따라 달라진다)", () => {
  const rows = C.rows({ lo: 232, hi: 236, mid: 234.2, err: 1.1 });
  const pro = rows.filter(r => r.tier === "custom")[0];
  assert.strictEqual(pro.lo, null);
  assert.strictEqual(pro.hi, null);
  assert.strictEqual(pro.width, null);
});

test("axisPos 는 55~70% 확대 축 위의 위치를 0~100 으로 클램프한다", () => {
  assert.strictEqual(C.axisPos(55), 0);
  assert.strictEqual(C.axisPos(70), 100);
  assert.strictEqual(C.axisPos(40), 0, "축 아래 값은 0으로 클램프돼야 한다");
  assert.strictEqual(C.axisPos(90), 100, "축 위 값은 100으로 클램프돼야 한다");
  const mid = C.axisPos(62.5);
  assert.ok(mid > 45 && mid < 55, "축 중앙 근처 값이 아니다: " + mid);
});

test("데이터가 없으면(pred 필드 누락) 각 필드가 null 로 물러나고 던지지 않는다", () => {
  const rows = C.rows({});
  const basic = rows.filter(r => r.tier === "basic")[0];
  assert.strictEqual(basic.lo, null);
  assert.strictEqual(basic.width, null);
});
