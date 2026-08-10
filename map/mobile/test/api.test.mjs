import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSApi = require("../www/api.js");

function fakeResponse(n, over) {
  const candles = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2020, 0, 1 + i));
    candles.push({ t: d.toISOString().slice(0, 10), o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i, v: 1000 + i });
  }
  return Object.assign({ ok: true, symbol: "AAPL", tf: "1day", source: "twelvedata", name: "Apple", full: true, candles }, over);
}

test("ohlcUrl 은 심볼을 인코딩하고 since 는 있을 때만 붙인다", () => {
  assert.equal(MSApi.ohlcUrl("AAPL", "1day"),
    MSApi.API_BASE + "?ohlc=1&symbol=AAPL&tf=1day");
  assert.equal(MSApi.ohlcUrl("BTC/USD", "1week", "2026-01-31"),
    MSApi.API_BASE + "?ohlc=1&symbol=BTC%2FUSD&tf=1week&since=2026-01-31");
});

test("ohlcUrl 은 tf 를 생략하면 1day 로 떨어진다", () => {
  assert.match(MSApi.ohlcUrl("AAPL"), /tf=1day$/);
});

test("normalizeCandles 는 문자열 수치를 숫자로 바꾼다", () => {
  const r = fakeResponse(250);
  r.candles[0].o = "100";  r.candles[0].c = "101";
  const out = MSApi.normalizeCandles(r);
  assert.strictEqual(out.candle[0].o, 100);
  assert.strictEqual(out.candle[0].c, 101);
  assert.strictEqual(out.price[0], 101);
  assert.equal(out.price.length, 250);
});

test("거래량이 null 이면 undefined 로 둔다 — 0 으로 바꾸면 mfi·cmf 가 오염된다", () => {
  const r = fakeResponse(250);
  r.candles[5].v = null;
  const out = MSApi.normalizeCandles(r);
  assert.strictEqual(out.candle[5].v, undefined);
  assert.strictEqual(out.candle[6].v, 1006);
});

test("asOf 는 마지막 봉 날짜 10자리", () => {
  const r = fakeResponse(250);
  r.candles[249].t = "2026-08-07T00:00:00Z";
  assert.equal(MSApi.normalizeCandles(r).asOf, "2026-08-07");
});

test("ok:false 면 서버 error 를 담아 던진다", () => {
  assert.throws(() => MSApi.normalizeCandles({ ok: false, error: "notfound" }), /notfound/);
});

test("봉이 부족하면 던진다 — 주기별 하한이 다르다", () => {
  assert.throws(() => MSApi.normalizeCandles(fakeResponse(219, { tf: "1day" })), /봉 부족/);
  assert.doesNotThrow(() => MSApi.normalizeCandles(fakeResponse(220, { tf: "1day" })));
  assert.throws(() => MSApi.normalizeCandles(fakeResponse(59, { tf: "1month" })), /봉 부족/);
  assert.doesNotThrow(() => MSApi.normalizeCandles(fakeResponse(60, { tf: "1month" })));
});

test("candles 가 배열이 아니면 던진다", () => {
  assert.throws(() => MSApi.normalizeCandles({ ok: true, tf: "1day", candles: null }), /봉 부족/);
});
