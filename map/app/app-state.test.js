// app-state — 스토어·영속화 계약 테스트.
// 영속 계약 원본: dissection/01 §2(ms_proto_v1) 를 승계하되 전체 키 명명·v1 버저닝으로 재정의(BUILD-PLAN Task4).
const { test } = require("node:test");
const assert = require("node:assert");
const state = require("./app-state.js");

const TTL = 86400000; // 24h — 지침서 §10

test("initialState: 핵심 기본값", () => {
  const s = state.initialState();
  assert.equal(s.screen, "boot");
  assert.deepEqual(s.picks, []);
  assert.equal(s.scoops, 15);
  assert.equal(s.theme, "dark");
  assert.equal(s.gLinked, 0);
  assert.equal(s.xp, 0);
  assert.equal(s.tf, "일");
  assert.deepEqual(s.analyzed, {});
  assert.equal(typeof s.weights, "object");   // 커스텀 가중치 — Q8 영속 승격 대상
  assert.equal(typeof s.dayCounters, "object");
});

test("store: set 얕은 병합 + 구독 통지 + unsub", () => {
  const st = state.create({ a: 1, b: 2 });
  let calls = 0, lastKeys = null;
  const un = st.subscribe((keys) => { calls++; lastKeys = keys; });
  st.set({ b: 3 });
  assert.equal(st.get().a, 1);
  assert.equal(st.get().b, 3);
  assert.equal(calls, 1);
  assert.deepEqual(lastKeys, ["b"]);
  un();
  st.set({ a: 9 });
  assert.equal(calls, 1);
});

test("store: 함수형 set(prev => patch)", () => {
  const st = state.create({ n: 10 });
  st.set((prev) => ({ n: prev.n + 5 }));
  assert.equal(st.get().n, 15);
});

test("serialize→restore 왕복: persistKeys 전부 보존", () => {
  const now = 1756000000000;
  const s = state.initialState();
  s.picks = ["NVDA", "AAPL"];
  s.scoops = 9;
  s.theme = "light";
  s.xp = 44;
  s.weights = { "이동평균": 2 };
  s.indOff = { 3: 1 };
  s.dayCounters = { d: state.dayKey(now), stockOps: 2, personaToday: 1 }; // 일일 리셋 비발동 조건
  s.analyzed = { "NVDA|일": "deep" };
  s.analyzedAt = { "NVDA|일": now - 1000 };
  const raw = state.serialize(s);
  const r = state.restore(raw, now);
  state.persistKeys.forEach((k) => {
    assert.deepEqual(r[k], s[k], "persist 키 유실: " + k);
  });
});

test("restore: 24h 지난 분석은 analyzed 에서 제거, analyzedAt 은 유지(만료 표기용)", () => {
  const now = 1756000000000;
  const raw = JSON.stringify({ v: 1, picks: ["NVDA"], scoops: 9, theme: "dark",
    analyzed: { "NVDA|일": "deep", "AAPL|일": "custom" },
    analyzedAt: { "NVDA|일": now - TTL - 1, "AAPL|일": now - 1000 } });
  const r = state.restore(raw, now);
  assert.equal(r.analyzed["NVDA|일"], undefined);
  assert.equal(r.analyzed["AAPL|일"], "custom");
  assert.equal(r.analyzedAt["NVDA|일"], now - TTL - 1);
});

test("restore: picks 비면 첫 실행 취급(null). 깨진 입력도 null", () => {
  assert.equal(state.restore(JSON.stringify({ v: 1, picks: [] }), 0), null);
  assert.equal(state.restore("null", 0), null);
  assert.equal(state.restore(undefined, 0), null);
  assert.equal(state.restore("{broken json", 0), null);
});

test("restore: 값 보정 — scoops 비수치→15, theme 이상값→dark", () => {
  const raw = JSON.stringify({ v: 1, picks: ["NVDA"], scoops: "x", theme: "hotdog" });
  const r = state.restore(raw, 0);
  assert.equal(r.scoops, 15);
  assert.equal(r.theme, "dark");
});

test("restore: dayCounters·xpToday 는 오늘 것만 살린다(dayKey 불일치 시 리셋)", () => {
  const now = Date.UTC(2026, 7, 24, 3, 0); // KST 2026-08-24 12:00
  const rawToday = JSON.stringify({ v: 1, picks: ["A"], xpToday: 7,
    dayCounters: { d: "2026-08-24", stockOps: 4 } });
  const rToday = state.restore(rawToday, now);
  assert.equal(rToday.xpToday, 7);
  assert.equal(rToday.dayCounters.stockOps, 4);
  const rawOld = JSON.stringify({ v: 1, picks: ["A"], xpToday: 7,
    dayCounters: { d: "2026-08-23", stockOps: 4 } });
  const rOld = state.restore(rawOld, now);
  assert.equal(rOld.xpToday, 0);
  assert.equal(rOld.dayCounters.stockOps, 0);
  assert.equal(rOld.dayCounters.d, "2026-08-24");
});

test("dayKey: KST 자정 경계 — UTC 14:59 는 당일, 15:00 은 다음 날", () => {
  assert.equal(state.dayKey(Date.UTC(2026, 7, 24, 14, 59)), "2026-08-24");
  assert.equal(state.dayKey(Date.UTC(2026, 7, 24, 15, 0)), "2026-08-25");
});

test("io 주입: save/load 가 주어진 io 를 쓴다(localStorage 없는 node 에서 동작)", () => {
  const mem = {};
  const io = {
    read: () => mem.raw,
    write: (raw) => { mem.raw = raw; }
  };
  const st = state.create(state.initialState(), io);
  st.set({ picks: ["NVDA"], scoops: 11 });
  st.persistNow(1756000000000);
  assert.ok(mem.raw && mem.raw.indexOf("NVDA") >= 0);
  const r = state.restore(mem.raw, 1756000000000);
  assert.equal(r.scoops, 11);
});
