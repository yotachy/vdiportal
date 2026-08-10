import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const LG = require("../www/chart-legend.js");
const FC = require("../../forge-core.js");

const d = FC.makeDemoSeries(400);
const vol = d.candle.map(() => 1e6);
const an = {
  ma: FC.analyzeMA(d.price, { len: 20 }),
  rsi: FC.analyzeRSI(d.price, { period: 14 }),
  bb: FC.analyzeBollinger(d.price, { len: 20, k: 2 }),
  macd: FC.analyzeMACD(d.price, { fast: 12, slow: 26, signal: 9 }),
  va: FC.analyzeVolume(d.price, vol, {})
};
const pred = FC.run(FC.sampleGraph(), { price: d.price, candle: d.candle }, { timeframe: "1day" }).prediction;
const KEYS = ["ma", "macd", "rsi", "bb", "vol", "pred", "predpx"];

test("7행이 정해진 순서로 나오고 key 가 중복되지 않는다", () => {
  const r = LG.rows(an, pred, null);
  assert.deepEqual(r.map(x => x.key), KEYS);
  assert.equal(new Set(r.map(x => x.key)).size, KEYS.length);
});

test("라벨은 시안 표기 그대로다", () => {
  const by = {}; LG.rows(an, pred, null).forEach(r => { by[r.key] = r.label; });
  assert.equal(by.ma, "Moving average");
  assert.equal(by.macd, "MACD");
  assert.equal(by.rsi, "RSI");
  assert.equal(by.bb, "Bollinger");
  assert.equal(by.vol, "Volume");
});

test("모든 value 가 비어있지 않고 한글이 없다", () => {
  LG.rows(an, pred, null).forEach(r => {
    assert.ok(r.value && String(r.value).length, r.key + " value 가 비었다");
    assert.ok(!/[가-힣]/.test(String(r.value) + r.label), r.key + " 에 한글: " + r.label + "/" + r.value);
  });
});

test("tone 은 세 값 중 하나다", () => {
  LG.rows(an, pred, null).forEach(r =>
    assert.ok(["bull", "bear", "muted"].indexOf(r.tone) >= 0, r.key + " tone=" + r.tone));
});

test("fi 를 바꾸면 숫자 행은 바뀌고 상태 문구는 안 바뀐다 — 과거 봉에서 '지금 정배열'은 거짓이다", () => {
  const late = LG.rows(an, pred, 400), early = LG.rows(an, pred, 200);
  const v = (rs, k) => rs.find(x => x.key === k).value;
  assert.notEqual(v(late, "rsi"), v(early, "rsi"), "RSI 가 fi 를 안 따른다");
  assert.notEqual(v(late, "bb"), v(early, "bb"), "%B 가 fi 를 안 따른다");
  assert.notEqual(v(late, "macd"), v(early, "macd"), "MACD 히스토그램이 fi 를 안 따른다");
  // MA 정렬·거래량 관계는 시계열 전체 판정 — fi 무관 고정
  assert.equal(v(late, "ma"), v(early, "ma"), "MA 상태가 fi 를 따라 바뀌었다");
  assert.equal(v(late, "vol"), v(early, "vol"), "거래량 상태가 fi 를 따라 바뀌었다");
});

test("fi=null 은 최신 봉과 같다", () => {
  const n = an.rsi.series.length - 1;
  assert.deepEqual(LG.rows(an, pred, null), LG.rows(an, pred, n));
});

test("pred 가 없으면 예측 2행이 muted 자리표시자로 남는다 — 행 수는 유지", () => {
  const r = LG.rows(an, null, null);
  assert.deepEqual(r.map(x => x.key), KEYS, "pred 없다고 행이 사라지면 안 된다");
  ["pred", "predpx"].forEach(k => {
    const row = r.find(x => x.key === k);
    assert.equal(row.tone, "muted");
    assert.ok(row.value.length, k + " 자리표시자가 비었다");
  });
});

test("결측·이상 입력에도 던지지 않는다", () => {
  assert.doesNotThrow(() => LG.rows(an, pred, -5));
  assert.doesNotThrow(() => LG.rows(an, pred, 99999));
  assert.doesNotThrow(() => LG.rows(Object.assign({}, an, { ma: Object.assign({}, an.ma, { sr: { ma: null, side: null } }) }), pred, null));
  assert.doesNotThrow(() => LG.rows(Object.assign({}, an, { macd: Object.assign({}, an.macd, { cross: { type: null, barsAgo: null } }) }), pred, null));
});

test("반대가 우세한 예측(pcal<50)은 muted 로 강등된다 — 차트 회색 강등과 같은 규칙", () => {
  const weak = { path: [100, 99.5], lo: [96, 96], hi: [104, 108], anchor: 100, futW: 2 };
  const row = LG.rows(an, weak, null).find(x => x.key === "pred");
  assert.equal(row.tone, "muted", "pcal=" + row.value + " 인데 muted 가 아니다");
});
