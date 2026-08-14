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

// UTC 자정 근처(00:00~08:59 KST)에서 toISOString() 을 쓰면 하루가 이르게 찍힌다.
// 호스트 시간대에 기대는 대신 가짜 시계(now)를 주입해 그 경계를 항상 재현한다 —
// "테스트가 도는 시각 밖에서만 통과하는 테스트는 없느니만 못하다".
test("addedAt 은 UTC 가 아니라 로컬 달력일이다 — 자정 경계에서 하루 밀리면 안 된다", () => {
  // 연도를 2099로 잡는 이유: 실제 시스템 시각과 절대 우연히 일치하지 않게 하기 위해서다.
  // (실제로 2026-08-13T17:58Z를 썼더니 이 테스트를 만든 바로 그 시각 근처에 실행돼
  // "진짜 Date()를 계속 부르는" 회귀도 우연히 통과했다 — 값만 비교하면 벽시계에 기댄다.)
  var calls = 0;
  MSStore.install(memBackend(), function () {
    calls++;
    return {
      getFullYear: () => 2099, getMonth: () => 0, getDate: () => 5,   // 로컬: 2099-01-05
      toISOString: () => "2098-12-31T17:58:00.000Z"                   // UTC(=toISOString): 2098-12-31
    };
  });
  MSStore.addTicker("AAPL", "Apple Inc.");
  assert.ok(calls > 0, "addTicker 가 주입된 시계를 쓰지 않는다 — 진짜 Date() 를 부른다");
  assert.equal(MSStore.getWatchlist()[0].addedAt, "2099-01-05",
    "로컬 달력일이 아니다 — UTC(toISOString) 로 찍혔거나 오프셋으로 흉내 냈을 가능성이 있다");
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
