// P2 §5 — 전문분석 가중치가 **실제로 엔진에 닿는가**.
//
// 이 관문이 없으면 조절판이 장식이어도 초록이다. 슬라이더를 UI 상태로만 두고 엔진에 안
// 넘겨도 화면은 완벽히 동작하는 것처럼 보인다 — 5스쿱을 받고 아무것도 안 바꾸는 것이다.
// 그래서 "값을 바꿨을 때 예측 경로가 실제로 달라지는가"를 잰다.
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const G = require("../www/graph.js");
const T = require("../www/ind-tiers.js");
const FC = require("../../forge-core.js");

// 결정적 표본 — 난수를 쓰면 "달라졌다"가 우연일 수 있다.
function series(n) {
  const price = [], candle = [], volume = [];
  for (let i = 0; i < n; i++) {
    const base = 100 + i * 0.35 + Math.sin(i / 7) * 4 + Math.sin(i / 23) * 9;
    price.push(base);
    candle.push({ t: "2026-01-01", o: base - 0.4, h: base + 1.1, l: base - 1.2, c: base, v: 1000 + (i % 17) * 30 });
    volume.push(1000 + (i % 17) * 30);
  }
  return { price, candle, volume };
}
const DATA = series(320);

function runWith(weights) {
  const g = G.customGraph(FC, weights);
  G.setVolume(g, DATA.volume);
  return FC.run(g, DATA, { driftWeights: G.driftWeightsOf(g, weights) });
}
function pathOf(out) { return (out && out.prediction && out.prediction.path) || []; }

// 모든 조절 대상을 1.0 으로 둔 기준선.
const BASE_W = {};
T.tunable().forEach(t => { BASE_W[t] = 1; });

test("가중치를 바꾸면 예측 경로가 실제로 달라진다 — 조절판이 장식이 아니다", () => {
  const a = pathOf(runWith(BASE_W));
  const heavy = Object.assign({}, BASE_W, { rsi: 3.0, macd: 3.0, ma: 0.1 });
  const b = pathOf(runWith(heavy));
  assert.ok(a.length && b.length, "예측 경로가 비었다 — 표본이 너무 짧거나 그래프가 깨졌다");
  assert.strictEqual(a.length, b.length, "경로 길이가 달라졌다 — 가중치가 지평까지 바꿨다면 다른 문제다");
  const diff = a.some((v, i) => Math.abs(v - b[i]) > 1e-9);
  assert.ok(diff, "가중치를 3배·0.1배로 바꿨는데 예측 경로가 한 점도 안 움직였다 — 엔진에 안 닿는다");
});

test("driftWeights 를 빼면 결과가 달라진다 — 두 경로 중 하나만 연결해도 반쪽이다", () => {
  const heavy = Object.assign({}, BASE_W, { rsi: 3.0, ma: 0.1 });
  const g = G.customGraph(FC, heavy);
  G.setVolume(g, DATA.volume);
  const withDW = pathOf(FC.run(g, DATA, { driftWeights: G.driftWeightsOf(g, heavy) }));
  const noDW = pathOf(FC.run(g, DATA, {}));
  assert.ok(withDW.some((v, i) => Math.abs(v - noDW[i]) > 1e-9),
    "driftWeights 를 안 넘겨도 결과가 같다 — node.weight 만으로는 방향 드리프트가 안 움직인다");
});

test("배율 → 엔진 단위 변환: node.weight = 50 × 배율", () => {
  const g = G.customGraph(FC, Object.assign({}, BASE_W, { rsi: 2.0, ma: 0.6 }));
  const byType = {};
  g.nodes.forEach(n => { if (n.blockType) byType[n.blockType] = n; });
  assert.strictEqual(byType.rsi.weight, 100, "2.0× 가 weight 100 이 아니다");
  assert.strictEqual(byType.ma.weight, 30, "0.6× 가 weight 30 이 아니다");
  assert.strictEqual(byType.macd.weight, 50, "1.0× 가 weight 50 이 아니다");
});

test("범위를 벗어난 값은 클램프된다 — 엔진 클램프(0~3)와 시안 범위(0.1~3.0) 안쪽", () => {
  assert.strictEqual(G.clampW(99), G.W_MAX);
  assert.strictEqual(G.clampW(-5), G.W_MIN);
  assert.strictEqual(G.clampW(0), G.W_MIN, "0 은 '미선택'이 아니라 최소 배율로 다뤄야 한다(미선택은 키 부재)");
  assert.strictEqual(G.clampW(NaN), 1);
  assert.strictEqual(G.clampW(undefined), 1);
});

// 미선택은 배율 0 이 아니라 **노드 제거**다. 0 으로 두면 드리프트만 죽고 combine·판독문에는
// 남아 "안 골랐는데 목록에 있는" 상태가 된다.
test("미선택 지표는 그래프에서 사라진다 — 배율 0 으로 남기지 않는다", () => {
  const only = { rsi: 1, macd: 1 };
  const g = G.customGraph(FC, only);
  const types = G.indicatorTypes(g);
  assert.ok(types.indexOf("ichimoku") < 0, "미선택 지표가 그래프에 남아 있다");
  assert.ok(types.indexOf("rsi") >= 0 && types.indexOf("macd") >= 0, "선택한 지표가 빠졌다");
  const dw = G.driftWeightsOf(g, only);
  assert.ok(!("ichimoku" in dw), "없는 노드의 배율을 엔진에 넘긴다 — 조용히 무시되고 나중에 원인 추적이 어려워진다");
});

// 시안 10a: "Lv1 핵심 5 · 기본분석과 같은 것 — 항상 포함".
test("Lv1 핵심 5종은 선택 목록에 없어도 남는다(배율 1.0)", () => {
  const g = G.customGraph(FC, { rsi: 2 });
  const types = G.indicatorTypes(g);
  G.BASIC.forEach(t => assert.ok(types.indexOf(t) >= 0, "핵심 지표가 빠졌다: " + t));
  const byType = {};
  g.nodes.forEach(n => { if (n.blockType) byType[n.blockType] = n; });
  assert.strictEqual(byType.bollinger.weight, 50, "지정 안 한 핵심 지표가 1.0 이 아니다");
});

// 사용자 결정 D7 — 전문분석 판정 분모는 30(gann·pattern 제외). 만질 수 없는 지표가 판정에
// 들어가면 조절판이 거짓말이 된다.
test("조절할 수 없는 둘(gann·pattern)은 전문 그래프에서 빠진다 — 분모가 30 이다", () => {
  const g = G.customGraph(FC, BASE_W);
  const types = G.indicatorTypes(g);
  T.NOT_TUNABLE.forEach(t => assert.ok(types.indexOf(t) < 0, "조절 불가 지표가 판정에 남아 있다: " + t));
  assert.strictEqual(types.length, 30, "전문 판정 지표가 30 종이 아니다: " + types.length);
});

test("심화(32)와 전문(30)은 실제로 다른 그래프다", () => {
  assert.strictEqual(G.indicatorTypes(G.full32Graph(FC)).length, FC.indicatorCount);
  assert.strictEqual(G.indicatorTypes(G.customGraph(FC, BASE_W)).length, FC.indicatorCount - 2);
});

// ── 투자성향 프리셋 4종 (사용자 결정 D5) ────────────────────────────────────────────
test("프리셋 4종의 지표 집합이 포지(forge-ui _PRESET_DEF)에서 온 그대로다", () => {
  const expect = {
    trend: ["ma", "trend", "ichimoku", "supertrend", "adx"],
    momentum: ["rsi", "macd", "stochastic", "bollinger"],
    reversion: ["rsi", "stochastic", "bollinger", "fib", "elliott", "structure"],
    volatility: ["bollinger", "atr", "supertrend", "adx", "structure", "volume"]
  };
  assert.strictEqual(T.PRESETS.length, 4, "시안 성향은 4종이다");
  T.PRESETS.forEach(p => {
    assert.deepEqual(p.types, expect[p.key], p.key + " 집합이 포지와 다르다 — 지어낸 값이면 실패다");
    p.types.forEach(t => assert.ok(T.all().indexOf(t) >= 0, p.key + " 에 없는 지표: " + t));
  });
});

// D6 — 시안의 예시 숫자(2.0/1.4/0.6/0.3)를 확정값으로 쓰지 않는다. 백테스트가 정할 때까지 1.0.
test("배율 k 는 아직 1.0 이다 — 시안 예시 숫자를 확정처럼 쓰지 않는다", () => {
  assert.strictEqual(T.PRESET_K, 1.0,
    "k 가 1.0 이 아니다. 백테스트(preset-sweep)로 정했다면 그 결과 파일을 근거로 이 단정을 바꿀 것");
});

// k=1.0 이어도 프리셋은 동작해야 한다 — 선택 집합이 판정 분모와 예측을 실제로 바꾼다.
// 이 단정이 없으면 "k 가 1이라 프리셋은 나중에" 로 미뤄져 버튼이 죽은 채로 출시된다.
test("k 가 1.0 이어도 프리셋은 실제로 다른 결과를 낸다 — 선택 집합이 다르기 때문", () => {
  const a = pathOf(runWith(T.weightsOf("trend", G.BASIC)));
  const b = pathOf(runWith(T.weightsOf("reversion", G.BASIC)));
  assert.ok(a.length && b.length, "예측이 비었다");
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 1e-9),
    "성향을 바꿔도 예측이 같다 — 프리셋 버튼이 아무 일도 안 한다");
});

test("어떤 프리셋이든 Lv1 핵심 5종은 선택에 남는다", () => {
  T.PRESETS.forEach(p => {
    const w = T.weightsOf(p.key, G.BASIC);
    G.BASIC.forEach(t => assert.ok(t in w, p.key + " 에서 핵심 지표가 빠졌다: " + t));
  });
});

test("프리셋은 조절 불가 지표(gann·pattern)를 선택하지 않는다", () => {
  T.PRESETS.forEach(p => {
    const w = T.weightsOf(p.key, G.BASIC);
    T.NOT_TUNABLE.forEach(t => assert.ok(!(t in w), p.key + " 가 조절 불가 지표를 담았다: " + t));
  });
});
