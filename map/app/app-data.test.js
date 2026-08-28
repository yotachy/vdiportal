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

// ── 전송 정책(2026-08-25): 델타 머지 · 경량(lite) · 경량→전량 승격 · 전량 캐시가 경량 요청을 대신 ──
test("mergeCandles: t 기준 병합 — 같은 t 는 새 값, 새 봉 추가, 정렬 유지", () => {
  const prev = [{ t: "2026-08-20", c: 1 }, { t: "2026-08-21", c: 2 }];
  const m = data.mergeCandles(prev, [{ t: "2026-08-21", c: 2.5 }, { t: "2026-08-22", c: 3 }]);
  assert.deepEqual(m.map((c) => c.t), ["2026-08-20", "2026-08-21", "2026-08-22"]);
  assert.equal(m[1].c, 2.5);
});

test("fetch: 재갱신은 since= 델타 · 응답을 캐시에 머지 · 경량은 limit= · 전량 캐시가 있으면 경량 요청도 캐시", async () => {
  const urls = [];
  let now = 1000;
  const io = {
    now: () => now,
    fetchJson: async (url) => {
      urls.push(url);
      if (/limit=/.test(url)) return { ok: true, full: false, limit: 60, candles: [{ t: "2026-08-21", c: 2 }, { t: "2026-08-22", c: 3 }] };
      if (/since=/.test(url)) return { ok: true, full: false, candles: [{ t: "2026-08-22", c: 3.5 }, { t: "2026-08-23", c: 4 }] };
      return { ok: true, full: true, candles: [{ t: "2026-08-20", c: 1 }, { t: "2026-08-21", c: 2 }, { t: "2026-08-22", c: 3 }] };
    }
  };
  const store = data.createOHLC(io);
  const a = await store.fetch("NVDA", "일", { lite: true });      // 경량 최초 → limit
  assert.ok(/limit=60/.test(urls[0]) && !/since=/.test(urls[0]));
  assert.equal(a.candles.length, 2);
  const b = await store.fetch("NVDA", "일");                      // 분석용 → 전량(limit 없음) 승격
  assert.ok(!/limit=/.test(urls[1]) && !/since=/.test(urls[1]), "전량 승격은 limit·since 없음: " + urls[1]);
  assert.equal(b.candles.length, 3);
  const c = await store.fetch("NVDA", "일", { lite: true });      // 전량 캐시 신선 → 네트워크 없음
  assert.equal(urls.length, 2);
  assert.equal(c.candles.length, 3);
  now += 10 * 60e3;                                               // 신선도 만료 → 델타
  const d = await store.fetch("NVDA", "일");
  assert.ok(/since=2026-08-22/.test(urls[2]), "델타 since: " + urls[2]);
  assert.deepEqual(d.candles.map((x) => x.c), [1, 2, 3.5, 4]);
  assert.equal(store._cache["NVDA|1day"].full, true, "델타 후에도 전량 표식 유지");
});

// ── 종목 검색(2026-08-28) — 서버 ?search= 를 감싼 세션 캐시 ─────────────────────
// 왜 필요한가: 시트가 MASTER 11종만 걸러 보여주면서 카피는 "미국 전 종목"이라고 적고 있었다.
test("createSearch: 2글자 미만은 서버를 부르지 않는다(노이즈·비용)", async () => {
  let calls = 0;
  const io = { now: () => 1000, fetchJson: async () => { calls++; return { ok: true, items: [] }; } };
  const s = data.createSearch(io);
  assert.deepEqual(await s.find("a"), []);
  assert.deepEqual(await s.find(" "), []);
  assert.equal(calls, 0);
});

test("createSearch: 같은 질의는 캐시 — 서버 1회", async () => {
  let calls = 0;
  const io = { now: () => 1000, fetchJson: async () => { calls++; return { ok: true, items: [{ s: "AAPL", n: "Apple Inc.", t: "stock" }] }; } };
  const s = data.createSearch(io);
  const a = await s.find("apple");
  assert.equal(a.length, 1);
  assert.equal(a[0].s, "AAPL");
  await s.find("apple");
  await s.find("APPLE");                     // 대소문자 무관 같은 질의
  assert.equal(calls, 1);
});

test("createSearch: 서버 실패·형식 이상이면 빈 배열(화면이 죽지 않는다)", async () => {
  const bad = data.createSearch({ now: () => 1, fetchJson: async () => ({ ok: false, error: "upstream" }) });
  assert.deepEqual(await bad.find("apple"), []);
  const junk = data.createSearch({ now: () => 1, fetchJson: async () => null });
  assert.deepEqual(await junk.find("apple"), []);
  const thrown = data.createSearch({ now: () => 1, fetchJson: async () => { throw new Error("net"); } });
  assert.deepEqual(await thrown.find("apple"), []);
});

test("createSearch: 실패는 캐시하지 않는다(다시 시도할 수 있어야 한다)", async () => {
  let calls = 0, fail = true;
  const io = { now: () => 1, fetchJson: async () => { calls++; return fail ? { ok: false } : { ok: true, items: [{ s: "NVDA", n: "NVIDIA", t: "stock" }] }; } };
  const s = data.createSearch(io);
  assert.deepEqual(await s.find("nvda"), []);
  fail = false;
  const r = await s.find("nvda");
  assert.equal(r.length, 1);
  assert.equal(calls, 2);
});

test("createSearch: 질의는 소문자·URL 인코딩으로 나간다(캐시 적중률 — Yahoo 는 대소문자 무관)", async () => {
  let url = null;
  const io = { now: () => 1, fetchJson: async (u) => { url = u; return { ok: true, items: [] }; } };
  await data.createSearch(io).find("BRK B");
  assert.ok(url.indexOf("search=brk%20b") >= 0, url);
});
