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

// 0 으로 바꾸면 '거래 없음'이라는 거짓 사실이 되고, 무엇보다 소비 측이 빠진 봉을
// 구분할 방법을 잃는다. spike.js 는 candle.every(v => 유효) 로 "전 봉에 거래량이
// 있는가"를 판별해 부분 배열이면 통째로 넘기지 않는다(엔진 _mfiRaw 가 vol[j] || 0 으로
// 읽어 빠진 봉을 거래량 0 으로 만들기 때문). 그 판별의 근거가 이 undefined 다.
test("거래량이 null 이면 0 이 아니라 undefined — 부분 결측을 소비 측이 식별할 수 있어야 한다", () => {
  const r = fakeResponse(250);
  r.candles[5].v = null;
  const out = MSApi.normalizeCandles(r);
  assert.strictEqual(out.candle[5].v, undefined);
  assert.strictEqual(out.candle[6].v, 1006);
  assert.equal(out.candle.every(c => typeof c.v === "number"), false, "부분 결측이 식별돼야 한다");
});

test("OHLC 에 비수치가 있으면 던진다 — NaN 은 조용히 번져 빈 차트·\"NaN\" 목표가가 된다", () => {
  for (const bad of ["-", null, undefined, "N/A"]) {
    for (const k of ["o", "h", "l", "c"]) {
      const r = fakeResponse(250);
      r.candles[7][k] = bad;
      assert.throws(() => MSApi.normalizeCandles(r), /OHLC value invalid/,
        "봉 7 의 " + k + "=" + String(bad) + " 를 통과시켰다");
    }
  }
});

test("정상 응답은 전 봉 OHLC 가 유한하다", () => {
  const out = MSApi.normalizeCandles(fakeResponse(250));
  assert.ok(out.candle.every(c => [c.o, c.h, c.l, c.c].every(Number.isFinite)));
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
  assert.throws(() => MSApi.normalizeCandles(fakeResponse(219, { tf: "1day" })), /not enough bars/);
  assert.doesNotThrow(() => MSApi.normalizeCandles(fakeResponse(220, { tf: "1day" })));
  assert.throws(() => MSApi.normalizeCandles(fakeResponse(59, { tf: "1month" })), /not enough bars/);
  assert.doesNotThrow(() => MSApi.normalizeCandles(fakeResponse(60, { tf: "1month" })));
});

test("candles 가 배열이 아니면 던진다", () => {
  assert.throws(() => MSApi.normalizeCandles({ ok: true, tf: "1day", candles: null }), /not enough bars/);
});

function fakeFetch(payload, status) {
  return async () => ({ ok: (status || 200) < 400, status: status || 200, json: async () => payload });
}

test("loadTicker 는 정상 응답을 정규화해서 돌려준다", async () => {
  const r = fakeResponse(250);
  const out = await MSApi.loadTicker("AAPL", "1day", fakeFetch(r));
  assert.equal(out.candle.length, 250);
  assert.equal(out.asOf, r.candles[249].t);
});

test("notfound 는 suggest 를 붙여서 던진다", async () => {
  const payload = { ok: false, error: "notfound", symbol: "APPL", suggest: [{ s: "AAPL", n: "Apple Inc." }] };
  await assert.rejects(
    () => MSApi.loadTicker("APPL", "1day", fakeFetch(payload, 502)),
    err => {
      assert.equal(err.notfound, true);
      assert.deepEqual(err.suggest, [{ s: "AAPL", n: "Apple Inc." }]);
      return true;
    }
  );
});

test("suggest 가 없는 실패는 notfound 로 표시하지 않는다", async () => {
  await assert.rejects(
    () => MSApi.loadTicker("AAPL", "1day", fakeFetch({ ok: false, error: "badsymbol" }, 400)),
    err => { assert.notEqual(err.notfound, true); return /badsymbol/.test(err.message); }
  );
});

test("네트워크 예외는 그대로 전파된다", async () => {
  const boom = async () => { throw new Error("network down"); };
  await assert.rejects(() => MSApi.loadTicker("AAPL", "1day", boom), /network down/);
});
