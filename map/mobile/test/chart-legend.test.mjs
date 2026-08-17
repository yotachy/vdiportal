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

// value 는 태스크 8 에서 한국어로 번역됐다(legGolden/legDead/legBars 등, strings.js 단일
// 출처) — 지표 5행(ma/macd/rsi/bb/vol)의 라벨만 지표 표시명이라 언어와 무관하게 영어로
// 고정한다(strings.test.mjs). pred/predpx 라벨(legPred/legTarget)은 지표명이 아니라 프로젝트
// 카피라 한국어가 맞다.
const IND_KEYS = ["ma", "macd", "rsi", "bb", "vol"];
test("모든 value 가 비어있지 않다 — 지표 라벨은 한글이 없다", () => {
  LG.rows(an, pred, null).forEach(r => {
    assert.ok(r.value && String(r.value).length, r.key + " value 가 비었다");
    if (IND_KEYS.indexOf(r.key) >= 0)
      assert.ok(!/[가-힣]/.test(String(r.label)), r.key + " 라벨에 한글: " + r.label);
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

// Fix round 1 — 카피 정정 회귀 테스트

test("MACD 교차 문구는 차트용 대문자·이중구분자를 물려받지 않는다", () => {
  const bull = Object.assign({}, an.macd, { cross: { type: "bull", barsAgo: 5 } });
  const bear = Object.assign({}, an.macd, { cross: { type: "bear", barsAgo: 3 } });
  const none = Object.assign({}, an.macd, { cross: { type: null, barsAgo: null } });
  const vBull = LG.rows(Object.assign({}, an, { macd: bull }), pred, null).find(x => x.key === "macd").value;
  const vBear = LG.rows(Object.assign({}, an, { macd: bear }), pred, null).find(x => x.key === "macd").value;
  const vNone = LG.rows(Object.assign({}, an, { macd: none }), pred, null).find(x => x.key === "macd").value;
  // 태스크 8 에서 골든/데드크로스 문구가 한국어로 바뀌었다 — 검증 대상은 그대로(대문자·이중
  // 구분자 없음), 언어만 뒤집혔다.
  assert.match(vBull, /^[+-]?\d+\.\d · 골든크로스 \d+봉 전$/, "bull cross: " + vBull);
  assert.match(vBear, /^[+-]?\d+\.\d · 데드크로스 \d+봉 전$/, "bear cross: " + vBear);
  assert.match(vNone, / · 교차 없음$/, "no cross: " + vNone);
  [vBull, vBear, vNone].forEach(v => {
    assert.ok(!/·\s*·/.test(v), "이중 구분자: " + v);
    assert.ok(!/golden|dead/i.test(v), "영문 잔존: " + v);
  });
});

test("목표가는 1000 미만이면 소수 두 자리, 1000 이상이면 정수다", () => {
  const small = { path: [100, 99.5], lo: [96, 96], hi: [104, 108], anchor: 100, futW: 2 };
  const big = { path: [1000, 1234.5], lo: [900, 900], hi: [1000, 1300], anchor: 1000, futW: 2 };
  const vSmall = LG.rows(an, small, null).find(x => x.key === "predpx").value;
  const vBig = LG.rows(an, big, null).find(x => x.key === "predpx").value;
  assert.equal(vSmall, "99.50", "1000 미만 목표가: " + vSmall);
  assert.match(vBig, /^\d[\d,]*$/, "1000 이상 목표가에 소수점: " + vBig);
  assert.ok(vBig.indexOf(".") === -1, "1000 이상 목표가에 소수점: " + vBig);
});

test("반올림하면 0 이 되는 MACD 히스토그램은 부호 없이 렌더된다 — 크로스헤어로 끌 때 +0.0/-0.0 이 번갈아 뜨면 고장으로 보인다", () => {
  const histPos = an.macd.hist.slice(); histPos[histPos.length - 1] = 0.02;
  const histNeg = an.macd.hist.slice(); histNeg[histNeg.length - 1] = -0.02;
  const mPos = Object.assign({}, an.macd, { hist: histPos });
  const mNeg = Object.assign({}, an.macd, { hist: histNeg, cross: mPos.cross });
  const vPos = LG.rows(Object.assign({}, an, { macd: mPos }), pred, null).find(x => x.key === "macd").value;
  const vNeg = LG.rows(Object.assign({}, an, { macd: mNeg }), pred, null).find(x => x.key === "macd").value;
  assert.ok(vPos.indexOf("0.0") === 0, "양의 데드밴드 값에 부호가 남아있다: " + vPos);
  assert.ok(vNeg.indexOf("0.0") === 0, "음의 데드밴드 값에 부호가 남아있다: " + vNeg);
  assert.equal(vPos, vNeg, "같은 데드밴드인데 부호로 값이 갈렸다: " + vPos + " / " + vNeg);
});
