import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Stub = require("../www/wallet-local-stub.js");
const MSStore = require("../www/store.js");
const MSWallet = require("../www/wallet.js");

function memBackend() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
// 기기 시계를 고정해 출석 규칙을 결정적으로 시험한다. 스텁은 서버 시간을 못 쓰므로
// 이 주입이 곧 그 한계를 드러내는 지점이기도 하다(설계서 §4.1).
function at(iso) { return function () { return new Date(iso); }; }
function mk(nowFn) {
  MSStore.install(memBackend());
  return Stub.create({ costOf: MSWallet.costOf, now: nowFn || at("2026-08-12T09:00:00Z") });
}

test("첫 사용에 5개를 시드하고 상한은 20이다", async () => {
  const b = mk();
  const r = await b.get();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.balance, 5);
  assert.strictEqual(r.state.cap, 20);
});

test("spend — 차감되고 잔량이 줄어든다", async () => {
  const b = mk();
  const r = await b.spend("full", "i1");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.balance, 2, "5 - 3");
});

test("spend 멱등 — 같은 idem 이 두 번 와도 한 번만 차감된다", async () => {
  const b = mk();
  const a = await b.spend("full", "same");
  const c = await b.spend("full", "same");
  assert.strictEqual(a.state.balance, 2);
  assert.strictEqual(c.state.balance, 2, "두 번 차감됐다");
  assert.strictEqual(c.replayed, true);
});

test("spend — 잔량이 부족하면 실패하고 잔량이 그대로다", async () => {
  const b = mk();
  await b.spend("full", "i1");          // 5 → 2
  const r = await b.spend("full", "i2"); // 2 로는 3 을 못 낸다
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "insufficient");
  assert.strictEqual(r.state.balance, 2);
});

test("spend — 무료(scan)는 잔량을 건드리지 않는다", async () => {
  const b = mk();
  const r = await b.spend("scan", "i1");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.balance, 5);
});

test("refund — 잔량이 원복되고 원장에 두 줄이 남는다", async () => {
  const b = mk();
  await b.spend("full", "i1");
  const r = await b.refund("i1");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.balance, 5);
  assert.strictEqual(r.entryCount, 2, "차감 한 줄 + 환급 한 줄");
});

test("refund — 없는 idem 이거나 이미 환급했으면 아무 일도 없다", async () => {
  const b = mk();
  await b.spend("full", "i1");
  await b.refund("i1");
  const again = await b.refund("i1");
  assert.strictEqual(again.ok, false);
  assert.strictEqual(again.state.balance, 5, "두 번 환급됐다");
  const none = await b.refund("never");
  assert.strictEqual(none.ok, false);
});

test("checkin — 하루 1회, 다음날이면 스트릭이 느는다", async () => {
  const b1 = mk(at("2026-08-12T09:00:00Z"));
  const a = await b1.checkin();
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.granted, 1);
  assert.strictEqual(a.state.balance, 6);
  assert.strictEqual(a.state.streakDays, 1);
  const dup = await b1.checkin();
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(dup.reason, "already-checked-in");
  assert.strictEqual(dup.state.balance, 6);
});

test("checkin — 하루 건너뛰면 스트릭이 1 로 리셋된다", async () => {
  let d = "2026-08-12T09:00:00Z";
  const b = Stub.create({ costOf: MSWallet.costOf, now: () => new Date(d) });
  MSStore.install(memBackend());
  await b.checkin();                       // day1
  d = "2026-08-13T09:00:00Z"; await b.checkin();  // day2 → streak 2
  d = "2026-08-15T09:00:00Z";                     // 하루 건너뜀
  const r = await b.checkin();
  assert.strictEqual(r.state.streakDays, 1);
});

test("checkin — 7일 연속이면 상자 +5 가 더해진다", async () => {
  let d = new Date("2026-08-12T09:00:00Z");
  MSStore.install(memBackend());
  const b = Stub.create({ costOf: MSWallet.costOf, now: () => d });
  let last = null;
  for (let i = 0; i < 7; i++) {
    last = await b.checkin();
    d = new Date(d.getTime() + 86400000);
  }
  assert.strictEqual(last.state.streakDays, 7);
  assert.strictEqual(last.granted, 6, "출석 1 + 상자 5");
});

test("상한 20 을 넘는 지급은 절삭되고 그 사실이 결과에 담긴다", async () => {
  let d = new Date("2026-08-12T09:00:00Z");
  MSStore.install(memBackend());
  const b = Stub.create({ costOf: MSWallet.costOf, now: () => d });
  // 출석만으로 상한까지 밀어올린다(5 시드 + 매일 1, 7일차 +5)
  let last = null;
  for (let i = 0; i < 20; i++) {
    last = await b.checkin();
    d = new Date(d.getTime() + 86400000);
  }
  assert.strictEqual(last.state.balance, 20, "상한을 넘었다");
  assert.strictEqual(last.capped, true);
});
