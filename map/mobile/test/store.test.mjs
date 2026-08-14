import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSStore = require("../www/store.js");

function memBackend(throwOnSet) {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (throwOnSet) throw new Error("QuotaExceededError"); m.set(k, String(v)); },
    _map: m
  };
}

test("워치리스트 왕복", () => {
  MSStore.install(memBackend());
  assert.deepEqual(MSStore.getWatchlist(), []);
  MSStore.setWatchlist([{ sym: "AAPL", name: "Apple Inc.", addedAt: "2026-08-10" }]);
  assert.equal(MSStore.getWatchlist()[0].sym, "AAPL");
});

test("addTicker 는 중복을 거부하고 대소문자를 정규화한다", () => {
  MSStore.install(memBackend());
  assert.equal(MSStore.addTicker("aapl", "Apple Inc."), true);
  assert.equal(MSStore.getWatchlist()[0].sym, "AAPL");
  assert.equal(MSStore.addTicker("AAPL", "Apple Inc."), false, "중복이 통과했다");
  assert.equal(MSStore.getWatchlist().length, 1);
});

test("removeTicker 는 스캔 캐시도 함께 지운다 — 남으면 유령 신호가 뜬다", () => {
  MSStore.install(memBackend());
  MSStore.addTicker("AAPL", "Apple Inc.");
  MSStore.setScan("AAPL", { price: 1, chg: 0, spark: [1], dir: "bull", score: 10, confluence: 50, asOf: "2026-08-07", scannedAt: "2026-08-10T00:00:00Z" });
  assert.equal(MSStore.removeTicker("AAPL"), true);
  assert.equal(MSStore.getWatchlist().length, 0);
  assert.equal(MSStore.getScan("AAPL"), null, "스캔 캐시가 남았다");
});

test("스캔 레코드 왕복 · 없는 심볼은 null", () => {
  MSStore.install(memBackend());
  const rec = { price: 313.33, chg: -0.42, spark: [1, 2, 3], dir: "neutral", score: 0, confluence: 56, asOf: "2026-08-07", scannedAt: "2026-08-10T02:00:00Z" };
  MSStore.setScan("AAPL", rec);
  assert.deepEqual(MSStore.getScan("AAPL"), rec);
  assert.equal(MSStore.getScan("NVDA"), null);
});

test("쿼터 예외가 나도 던지지 않고 메모리로 계속 동작한다", () => {
  MSStore.install(memBackend(true));
  assert.doesNotThrow(() => MSStore.addTicker("AAPL", "Apple Inc."));
  assert.equal(MSStore.getWatchlist()[0].sym, "AAPL", "쓰기 실패 후 읽기가 비었다");
});

test("깨진 JSON 은 예외 대신 기본값으로 떨어진다", () => {
  const b = memBackend(); b._map.set(MSStore.KEYS.watchlist, "{{깨짐");
  MSStore.install(b);
  assert.deepEqual(MSStore.getWatchlist(), []);
});

test("seedIfEmpty 는 비었을 때만 3종목을 넣는다", () => {
  MSStore.install(memBackend());
  assert.equal(MSStore.seedIfEmpty(), true);
  assert.deepEqual(MSStore.getWatchlist().map(x => x.sym), ["AAPL", "NVDA", "MSFT"]);
  assert.equal(MSStore.seedIfEmpty(), false, "두 번째 호출이 또 시드했다");
  assert.equal(MSStore.getWatchlist().length, 3);
});

test("lastSym 왕복 — 대소문자 정규화", () => {
  MSStore.install(memBackend());
  assert.equal(MSStore.getLastSym(), null, "초기값은 null 이어야 한다");
  MSStore.setLastSym("aapl");
  assert.equal(MSStore.getLastSym(), "AAPL");
});

test("lastSym 은 빈 값으로 지워진다", () => {
  MSStore.install(memBackend());
  MSStore.setLastSym("AAPL");
  MSStore.setLastSym("");
  assert.equal(MSStore.getLastSym(), null);
});

test("종목을 지우면 lastSym 도 같이 지워진다 — 부팅 시 유령 선택 방지", () => {
  MSStore.install(memBackend());
  MSStore.addTicker("AAPL", "Apple Inc.");
  MSStore.addTicker("NVDA", "NVIDIA Corporation");
  MSStore.setLastSym("AAPL");
  MSStore.removeTicker("AAPL");
  assert.equal(MSStore.getLastSym(), null, "지운 종목이 lastSym 에 남았다");
});

test("다른 종목을 지워도 lastSym 은 유지된다", () => {
  MSStore.install(memBackend());
  MSStore.addTicker("AAPL", "Apple Inc.");
  MSStore.addTicker("NVDA", "NVIDIA Corporation");
  MSStore.setLastSym("AAPL");
  MSStore.removeTicker("NVDA");
  assert.equal(MSStore.getLastSym(), "AAPL");
});

test("온보딩 완료 플래그와 동의 기록", () => {
  const mem = {};
  MSStore.install({ getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } });
  assert.strictEqual(MSStore.onboarded(), false);
  assert.strictEqual(MSStore.consent(), null);
  MSStore.setOnboarded("terms-2026-08");
  assert.strictEqual(MSStore.onboarded(), true);
  const c = MSStore.consent();
  assert.strictEqual(c.termsVersion, "terms-2026-08");
  // 불리언만 남기면 약관이 개정됐을 때 누가 무엇에 동의했는지 말할 수 없다
  assert.match(c.at, /^\d{4}-\d{2}-\d{2}T/);
});
