// app-engine — 엔진 브리지 v1 테스트. ForgeCore 원본을 그대로 물려 실계산으로 검증한다.
// 픽스처는 결정적 합성 캔들(Date/난수 없음) — 기대값은 형태·범위·결정성으로 검증(수치 하드코딩은
// 엔진 버전업에 따라 변하므로 계약만 고정).
const { test } = require("node:test");
const assert = require("node:assert");
const engine = require("./app-engine.js");
const core = require("../forge-core.js");

function fixtureCandles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = 100 * Math.exp(0.0015 * i) + 6 * Math.sin(i / 9);
    out.push({ o: c * 0.995, h: c * 1.012, l: c * 0.988, c: c, v: 1000 + 300 * Math.sin(i / 5) });
  }
  return out;
}
const FIX = fixtureCandles(300);

test("basic 분석: onStep 5회(순서·그룹) + Report 계약", async () => {
  const steps = [];
  const r = await engine.analyze({ symbol: "TEST", tfKo: "일", tier: "basic", candles: FIX },
    (s) => steps.push(s));
  assert.equal(steps.length, 5);
  assert.deepEqual(steps.map((s) => s.id), ["ma", "rsi", "macd", "bollinger", "volume"]); // 시안 표기 순서
  assert.deepEqual(steps.map((s) => s.group), ["t", "m", "m", "v", "q"]);
  steps.forEach((s, i) => { assert.equal(s.i, i); assert.equal(s.total, 5); assert.ok(s.text.length > 0); });

  assert.equal(r.tier, "basic");
  assert.equal(r.indicators.length, 5);
  assert.ok(["up", "down", "neutral"].indexOf(r.verdict.dir) >= 0);
  assert.ok(r.verdict.prob >= 0 && r.verdict.prob <= 100);
  assert.ok(isFinite(r.verdict.target) && r.verdict.target > 0);
  assert.ok(isFinite(r.verdict.invalid) && r.verdict.invalid > 0);
  assert.ok(r.verdict.rangeLo < r.verdict.rangeHi);
  assert.ok(r.verdict.totalInd >= r.verdict.agree);
  assert.equal(r.prediction.path.length, r.prediction.futW);
  assert.equal(r.prediction.futW, 60);                    // 일봉 지평(PC horizonForTF 승계)
  assert.equal(r.engineVersion, core.version);
  r.indicators.forEach((ind) => {
    assert.ok(ind.strength >= 0 && ind.strength <= 100);
    assert.ok(typeof ind.bias === "number");
  });
});

test("주봉·월봉 지평: 52·12", async () => {
  const w = await engine.analyze({ symbol: "T", tfKo: "주", tier: "basic", candles: FIX });
  const m = await engine.analyze({ symbol: "T", tfKo: "월", tier: "basic", candles: FIX });
  assert.equal(w.prediction.futW, 52);
  assert.equal(m.prediction.futW, 12);
});

test("결정성: 같은 입력 → 같은 verdict·경로", async () => {
  const a = await engine.analyze({ symbol: "T", tfKo: "일", tier: "basic", candles: FIX });
  const b = await engine.analyze({ symbol: "T", tfKo: "일", tier: "basic", candles: FIX });
  assert.deepEqual(a.verdict, b.verdict);
  assert.deepEqual(a.prediction.path, b.prediction.path);
});

test("PC 레시피 정합: 같은 그래프·데이터로 직접 run() 한 결과와 target·확률 일치", async () => {
  const r = await engine.analyze({ symbol: "T", tfKo: "일", tier: "basic", candles: FIX });
  const price = FIX.map((c) => c.c);
  const graph = engine.buildGraph("basic", FIX.map((c) => c.v));
  const res = core.run(graph, { price: price, candle: FIX.map((c) => ({ o: c.o, h: c.h, l: c.l, c: c.c })), n: price.length },
    { futW: 60, timeframe: "일봉", driftWeights: {} });
  assert.equal(r.verdict.target, res.verdict.target);
  assert.equal(r.verdict.prob, core.aggUpProb(res.prediction));
});

test("캔들 부족(<24) 은 오류", async () => {
  await assert.rejects(engine.analyze({ symbol: "T", tfKo: "일", tier: "basic", candles: FIX.slice(0, 10) }));
});
