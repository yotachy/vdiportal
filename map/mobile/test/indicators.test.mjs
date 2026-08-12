import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const I = require("../www/indicators.js");
const FC = require("../../forge-core.js");
const MSGraph = require("../www/graph.js");

// 결정론적 합성 시세. 사인 합성이라 Math.random 없이 매번 같은 값이 나온다.
function fixture(n = 300, drift = 0.0012) {
  const price = [], candle = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + drift + Math.sin(i * 0.7) * 0.012 + Math.cos(i * 0.23) * 0.006);
    price.push(p);
    candle.push({ o, h: Math.max(o, p) * 1.006, l: Math.min(o, p) * 0.994, c: p, v: 1e6 * (1 + 0.3 * Math.sin(i * 0.4)) });
  }
  return { price, candle, volume: candle.map(c => c.v) };
}

// 이 파일의 핵심 계약: 인자 형태를 틀리면 예외가 아니라 bias 0 이 조용히 나온다.
// 그래서 "호출이 안 깨진다"가 아니라 "실제로 방향을 읽어낸다"를 검사한다.
test("표에 있는 지표는 전부 방향을 읽어낸다 — null 이 없다", () => {
  const d = fixture();
  const dead = Object.keys(I.SHAPES).filter(t => I.biasOf(FC, t, d, {}) === null);
  assert.deepEqual(dead, [], "방향을 못 읽은 지표: " + dead.join(", "));
});

test("캔들·거래량이 필요한 지표는 price 만으로는 0 이 된다 — 표가 있어야 하는 이유", () => {
  const d = fixture();
  const priceOnly = { price: d.price, candle: [], volume: null };
  // data 형태를 쓰는 것 중 대표 셋. 잘못된 입력에선 방향이 사라진다(예외가 아니라 0).
  ["psar", "williams", "aroon"].forEach(t => {
    const good = I.biasOf(FC, t, d, {});
    const bad = FC["analyze" + { psar: "PSAR", williams: "Williams", aroon: "Aroon" }[t]](priceOnly.price, {});
    assert.notStrictEqual(good, 0, t + " 는 정상 입력에서 방향이 있어야 한다");
    assert.strictEqual(bad.bias, 0, t + " 는 price 만 주면 0 이 된다");
  });
});

test("방향을 물을 수 없는 둘은 표에 없다", () => {
  I.NO_BIAS.forEach(t => assert.ok(!I.SHAPES[t], t + " 는 SHAPES 에 있으면 안 된다"));
  assert.strictEqual(typeof FC.analyzeTrend, "function");
  assert.strictEqual(FC.analyzeTrend(fixture().price, { shortLen: 32 }).bias, undefined,
    "analyzeTrend 가 bias 를 돌려주기 시작하면 표에 넣어야 한다");
  assert.strictEqual(FC.analyzePhasefold, undefined, "analyzePhasefold 가 생기면 표에 넣어야 한다");
});

test("32지표 그래프의 지표는 두 예외만 빼고 전부 표가 덮는다", () => {
  const g = MSGraph.full32Graph(FC);
  const types = MSGraph.indicatorTypes(g);
  const uncovered = types.filter(t => !I.SHAPES[t] && I.NO_BIAS.indexOf(t) < 0);
  assert.deepEqual(uncovered, [], "표도 예외 목록도 모르는 지표: " + uncovered.join(", "));
});

test("opposing — 중립 판정에는 반대가 없다", () => {
  const g = MSGraph.full32Graph(FC);
  assert.deepEqual(I.opposing(FC, g, fixture(), "neutral"), []);
  assert.deepEqual(I.opposing(FC, g, fixture(), null), []);
});

test("opposing — 상승 판정이면 하락 지표만, |bias| 큰 순으로", () => {
  const g = MSGraph.full32Graph(FC);
  const rows = I.opposing(FC, g, fixture(), "bull");
  assert.ok(rows.length > 0, "합성 시세에서 반대 지표가 하나도 없을 수는 없다");
  rows.forEach(r => assert.ok(r.bias < 0, r.type + " 가 상승인데 반대 목록에 있다"));
  for (let i = 1; i < rows.length; i++) {
    assert.ok(Math.abs(rows[i - 1].bias) >= Math.abs(rows[i].bias), "정렬이 깨졌다");
  }
});

test("opposing — 하락 판정이면 상승 지표만, 방향을 뒤집으면 목록도 뒤집힌다", () => {
  const g = MSGraph.full32Graph(FC), d = fixture();
  const bull = I.opposing(FC, g, d, "bull").map(r => r.type);
  const bear = I.opposing(FC, g, d, "bear").map(r => r.type);
  I.opposing(FC, g, d, "bear").forEach(r => assert.ok(r.bias > 0));
  bull.forEach(t => assert.ok(bear.indexOf(t) < 0, t + " 가 양쪽 목록에 다 있다"));
});

test("opposing — 데드존 안(|bias| ≤ EPS)은 반대로 세지 않는다", () => {
  const g = { nodes: [{ blockType: "rsi", params: {} }] };
  // bias 를 직접 심은 가짜 엔진으로 경계만 시험한다 — 실제 지표값에 의존하지 않는다.
  const tiny = { analyzeRSI: () => ({ bias: -I.EPS }) };
  const over = { analyzeRSI: () => ({ bias: -(I.EPS + 0.001) }) };
  assert.deepEqual(I.opposing(tiny, g, fixture(), "bull"), []);
  assert.strictEqual(I.opposing(over, g, fixture(), "bull").length, 1);
});

test("biasOf — 모르는 지표·없는 함수는 null(0 이 아니다)", () => {
  const d = fixture();
  assert.strictEqual(I.biasOf(FC, "nope", d, {}), null);
  assert.strictEqual(I.biasOf({}, "rsi", d, {}), null);
  assert.strictEqual(I.biasOf(FC, "toString", d, {}), null, "프로토타입 체인이 새면 안 된다");
});

test("biasOf — 분석 함수가 던져도 null 로 받는다", () => {
  const boom = { analyzeRSI: () => { throw new Error("boom"); } };
  assert.strictEqual(I.biasOf(boom, "rsi", fixture(), {}), null);
});
