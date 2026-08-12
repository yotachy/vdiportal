import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const W = require("../www/wallet.js");

function spyBackend() {
  const calls = [];
  const state = { balance: 5, cap: 20, streakDays: 1, canCheckin: true };
  return {
    calls,
    get() { calls.push(["get"]); return Promise.resolve({ ok: true, state: state }); },
    spend(rt, idem) { calls.push(["spend", rt, idem]); return Promise.resolve({ ok: true, state: state }); },
    refund(idem) { calls.push(["refund", idem]); return Promise.resolve({ ok: true, state: state }); },
    checkin() { calls.push(["checkin"]); return Promise.resolve({ ok: true, state: state, granted: 1 }); }
  };
}

test("비용표 — 시안이 정한 값 그대로", () => {
  assert.strictEqual(W.COSTS.full, 3);
  assert.strictEqual(W.COSTS.custom, 5);
  assert.strictEqual(W.COSTS.slot, 1);
  assert.strictEqual(W.COSTS.scan, 0, "스캔은 가격이 시안에 없어 무료다");
});

test("costOf — 모르는 종류는 null(0 이 아니다)", () => {
  assert.strictEqual(W.costOf("full"), 3);
  assert.strictEqual(W.costOf("scan"), 0);
  assert.strictEqual(W.costOf("nope"), null);
  assert.strictEqual(W.costOf(undefined), null);
  assert.strictEqual(W.costOf("toString"), null, "프로토타입 체인이 새면 안 된다");
});

test("newIdem — 매번 다르고 비어 있지 않다", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const v = W.newIdem();
    assert.ok(typeof v === "string" && v.length >= 8, "이상한 idem: " + v);
    assert.ok(!seen.has(v), "idem 이 중복됐다: " + v);
    seen.add(v);
  }
});

test("백엔드가 없으면 넷 다 no-backend 로 떨어지고 던지지 않는다", async () => {
  W.install(null);
  assert.strictEqual(W.isInstalled(), false);
  for (const p of [W.get(), W.spend("full", "i1"), W.refund("i1"), W.checkin()]) {
    const r = await p;
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "no-backend");
    assert.strictEqual(r.state, null);
  }
});

test("설치하면 그대로 위임한다 — 인자가 보존된다", async () => {
  const b = spyBackend();
  W.install(b);
  assert.strictEqual(W.isInstalled(), true);
  await W.get();
  await W.spend("full", "idem-A");
  await W.refund("idem-A");
  await W.checkin();
  assert.deepEqual(b.calls, [["get"], ["spend", "full", "idem-A"], ["refund", "idem-A"], ["checkin"]]);
  W.install(null);
});

test("모르는 runType 은 백엔드에 닿기 전에 막힌다", async () => {
  const b = spyBackend();
  W.install(b);
  const r = await W.spend("nope", "idem-B");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "unknown-runtype");
  assert.deepEqual(b.calls, [], "백엔드가 불렸다");
  W.install(null);
});

test("백엔드가 동기적으로 던져도 Promise 로 떨어진다 — 호출부가 안 깨진다", async () => {
  W.install({
    get() { throw new Error("boom"); },
    spend() { throw new Error("boom"); },
    refund() { throw new Error("boom"); },
    checkin() { throw new Error("boom"); }
  });
  for (const p of [W.get(), W.spend("full", "i1"), W.refund("i1"), W.checkin()]) {
    const r = await p;
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "backend-error");
    assert.strictEqual(r.state, null);
  }
  W.install(null);
});

test("백엔드가 거부된 Promise 를 줘도 같은 봉투로 떨어진다", async () => {
  W.install({
    get() { return Promise.reject(new Error("net")); },
    spend() { return Promise.reject(new Error("net")); },
    refund() { return Promise.reject(new Error("net")); },
    checkin() { return Promise.reject(new Error("net")); }
  });
  const r = await W.spend("full", "i2");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "backend-error");
  W.install(null);
});

test("백엔드가 Promise 가 아닌 것을 돌려줘도 죽지 않는다", async () => {
  W.install({ get() { return 42; }, spend() { return 42; }, refund() { return 42; }, checkin() { return 42; } });
  const r = await W.get();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "backend-error");
  W.install(null);
});
