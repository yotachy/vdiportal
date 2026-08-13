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
  assert.strictEqual(W.COSTS.scan, 2, "시안 2c 의 Spend 목록: Watchlist signal scan 2");
});

test("costOf — 모르는 종류는 null(0 이 아니다)", () => {
  assert.strictEqual(W.costOf("full"), 3);
  assert.strictEqual(W.costOf("scan"), 2);
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

// 빈 idem 이 새면 원장이 "키 없음"끼리 같은 항목으로 보고 두 번째부터 멱등 재생으로 답한다 —
// 한 번의 실수로 그 뒤 모든 Full 이 공짜가 된다. 백엔드에 닿기 전에 막혀야 한다.
test("idem 이 없거나 문자열이 아니면 백엔드에 닿기 전에 거부된다", async () => {
  const b = spyBackend();
  W.install(b);
  for (const bad of [undefined, null, "", 0, 123, {}, []]) {
    const r = await W.spend("full", bad);
    assert.strictEqual(r.ok, false, "허용된 idem: " + String(bad));
    assert.strictEqual(r.reason, "bad-idem");
    assert.strictEqual(r.state, null);
  }
  assert.deepEqual(b.calls, [], "백엔드가 불렸다");
  const good = await W.spend("full", "idem-ok");
  assert.strictEqual(good.ok, true);
  W.install(null);
});

test("백엔드가 없어도 idem 검증이 먼저다 — 잘못된 키가 조용히 지나가지 않는다", async () => {
  W.install(null);
  const r = await W.spend("full", "");
  assert.strictEqual(r.reason, "bad-idem");
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

// 8b — spend 가 3인자(runType, idem, ref)로 넓어졌다. ref 는 24시간 종목 권리 판정을
// 서버에서 하기 위한 값(예: 종목 심볼)이라 spend 를 부를 때마다 그대로 백엔드까지 실려가야 한다.
test("spend 가 ref 를 백엔드로 넘긴다", async () => {
  const seen = [];
  W.install({
    get: async () => ({ ok: true, state: null }),
    spend: async (t, i, ref) => { seen.push([t, i, ref]); return { ok: true, state: null }; },
    refund: async () => ({ ok: true, state: null }),
    checkin: async () => ({ ok: true, state: null })
  });
  await W.spend("full", "k1", "AAPL");
  assert.deepEqual(seen[0], ["full", "k1", "AAPL"]);
  W.install(null);
});

// ref 를 안 주면 undefined 가 아니라 null 로 넘겨야 한다 — undefined 는 JSON.stringify 에서
// 키째로 사라져 서버·가짜 백엔드마다 다르게 해석될 수 있다(w_field_str 은 없으면 기본값,
// null 이면 명시적으로 "없음"으로 처리).
test("ref 를 안 주면 null 로 넘긴다 — undefined 가 JSON 에서 사라지면 안 된다", async () => {
  const seen = [];
  W.install({
    get: async () => ({ ok: true, state: null }),
    spend: async (t, i, ref) => { seen.push(ref); return { ok: true, state: null }; },
    refund: async () => ({ ok: true, state: null }),
    checkin: async () => ({ ok: true, state: null })
  });
  await W.spend("scan", "k1");
  assert.strictEqual(seen[0], null);
  W.install(null);
});
