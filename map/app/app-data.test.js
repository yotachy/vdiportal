// app-data — 종목 마스터·OHLC 캐시·시세 파생 테스트. fetch·시각은 주입.
const { test } = require("node:test");
const assert = require("node:assert");
const data = require("./app-data.js");

const CANDLES = [
  { o: 100, h: 104, l: 98, c: 102, v: 1000 },
  { o: 102, h: 106, l: 101, c: 105, v: 1200 },
  { o: 105, h: 107, l: 100, c: 101, v: 900 },
  { o: 101, h: 103, l: 99, c: 102.5, v: 1100 }
];

test("MASTER: 11종·심볼·한글명", () => {
  assert.equal(data.MASTER.length, 11);
  const nvda = data.MASTER.find((t) => t.sym === "NVDA");
  assert.equal(nvda.name, "엔비디아");
  assert.ok(data.MASTER.some((t) => t.sym === "BTC/USD" && t.crypto));
  data.MASTER.forEach((t) => { assert.ok(t.sym && t.name); });
});

test("tfApi: 일/주/월 → 1day/1week/1month, 이상값은 1day", () => {
  assert.equal(data.tfApi("일"), "1day");
  assert.equal(data.tfApi("주"), "1week");
  assert.equal(data.tfApi("월"), "1month");
  assert.equal(data.tfApi("분"), "1day");
});

test("quote: 마지막 종가·전봉 대비 등락%", () => {
  const q = data.quote(CANDLES);
  assert.equal(q.price, 102.5);
  assert.ok(Math.abs(q.chg - ((102.5 / 101 - 1) * 100)) < 1e-9);
  assert.equal(q.up, true);
  assert.equal(data.quote([]), null);
  assert.equal(data.quote([CANDLES[0]]).chg, 0);   // 1봉이면 등락 0
});

test("spark: 종가 정규화 0..1, 요청 개수만큼(부족하면 전부)", () => {
  const s = data.spark(CANDLES, 3);
  assert.equal(s.length, 3);
  const min = Math.min.apply(null, s), max = Math.max.apply(null, s);
  assert.ok(min >= 0 && max <= 1 && max > min);
  assert.equal(data.spark(CANDLES, 99).length, 4);
  // 평평한 시계열도 NaN 없이(0.5 고정)
  const flat = data.spark([{ c: 5 }, { c: 5 }], 2);
  assert.ok(flat.every((v) => v === 0.5));
});

test("fetchOHLC: 캐시 적중 시 재요청 없음, 신선도 만료 시 재요청", async () => {
  let calls = 0;
  let now = 1000000;
  const io = {
    now: () => now,
    fetchJson: async () => { calls++; return { ok: true, candles: CANDLES, symbol: "NVDA", name: "NVIDIA" }; }
  };
  const store = data.createOHLC(io);
  const a = await store.fetch("NVDA", "일");
  assert.equal(a.ok, true);
  assert.equal(a.candles.length, 4);
  assert.equal(calls, 1);
  await store.fetch("NVDA", "일");
  assert.equal(calls, 1);                    // 5분 내 캐시 적중
  now += 5 * 60e3 + 1;
  await store.fetch("NVDA", "일");
  assert.equal(calls, 2);                    // 신선도 만료 → 재fetch
});

test("fetchOHLC: 실패 시 이전 캔들로 버팀(stale), 캐시 없으면 ok:false", async () => {
  let fail = false;
  let now = 0;
  const io = {
    now: () => now,
    fetchJson: async () => {
      if (fail) throw new Error("net");
      return { ok: true, candles: CANDLES, symbol: "NVDA" };
    }
  };
  const store = data.createOHLC(io);
  await store.fetch("NVDA", "일");
  fail = true;
  now = 10 * 60e3;                           // 만료 → 재fetch 시도 → 실패
  const r = await store.fetch("NVDA", "일");
  assert.equal(r.ok, true);
  assert.equal(r.stale, true);
  assert.equal(r.candles.length, 4);
  const miss = await store.fetch("AAPL", "일");
  assert.equal(miss.ok, false);
});
