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

// ── P2: 32종 · 프리셋 · 커스텀 ──

test("FULL_SET 32종 · 그룹 배분 t8 m7 v6 q5 s6(시안 GRP 동수)", () => {
  assert.equal(engine.FULL_SET.length, 32);
  const cnt = {};
  engine.FULL_SET.forEach((id) => {
    const g = engine.IND_META[id].group;
    cnt[g] = (cnt[g] || 0) + 1;
  });
  assert.deepEqual(cnt, { t: 8, m: 7, v: 6, q: 5, s: 6 });
  // 표시 순서 = 그룹 순서(추세→모멘텀→변동성→거래량→구조)
  const order = engine.FULL_SET.map((id) => engine.IND_META[id].group).join("");
  assert.equal(order, "t".repeat(8) + "m".repeat(7) + "v".repeat(6) + "q".repeat(5) + "s".repeat(6));
});

test("deep 분석: onStep 32회·해설문 전부 채워짐·지표 32", async () => {
  const steps = [];
  const r = await engine.analyze({ symbol: "T", tfKo: "일", tier: "deep", preset: "전체 종합", candles: FIX },
    (s) => steps.push(s));
  assert.equal(steps.length, 32);
  assert.equal(r.indicators.length, 32);
  r.indicators.forEach((ind) => assert.ok(ind.text.length > 0, ind.id + " 해설 비어 있음"));
  assert.equal(r.preset, "전체 종합");
  assert.equal(r.prediction.custom, null);          // deep 은 3차 없음
  assert.ok(r.prediction.counter.length > 0);       // 2차 반대 시나리오
});

test("프리셋 가중: 전체 종합=전부 1, 추세 중심=추세군 10/6·모멘텀군 4/6, 0~3 클램프", () => {
  const all = engine.presetWeights("전체 종합");
  engine.FULL_SET.forEach((id) => assert.equal(all[id], 1));
  const tr = engine.presetWeights("추세 중심");   // prof [10,4,4,3,5] = [t,m,q,v,s]
  assert.ok(Math.abs(tr.ma - 10 / 6) < 1e-9);
  assert.ok(Math.abs(tr.macd - 4 / 6) < 1e-9);
  assert.ok(Math.abs(tr.volume - 4 / 6) < 1e-9);
  assert.ok(Math.abs(tr.bollinger - 3 / 6) < 1e-9);
  assert.ok(Math.abs(tr.fib - 5 / 6) < 1e-9);
  const comp = engine.composeWeights("추세 중심", { ma: 3, macd: 0 });
  assert.equal(comp.ma, 3);                        // 10/6×3=5 → 3 클램프
  assert.equal(comp.macd, 0);                      // 제외(0)
});

test("custom: 이중 실행 — 1차(종합)≠3차(가중) 실좌표, 판정은 가중 실행", async () => {
  const r = await engine.analyze({ symbol: "T", tfKo: "일", tier: "custom",
    preset: "추세 중심", weights: { ma: 3, rsi: 0 }, candles: FIX });
  assert.ok(Array.isArray(r.prediction.custom));
  assert.equal(r.prediction.custom.length, r.prediction.path.length);
  const diff = r.prediction.custom.some((v, i) => v !== r.prediction.path[i]);
  assert.ok(diff, "가중 경로가 종합 경로와 동일 — 가중이 반영 안 됨");
  assert.equal(typeof r.verdict.prob, "number");
});

test("horizons: 일봉 60 지평 → +10/+20/+40/+60일, 확률 0~100", async () => {
  const r = await engine.analyze({ symbol: "T", tfKo: "일", tier: "deep", preset: "전체 종합", candles: FIX });
  assert.deepEqual(r.horizons.map((h) => h.label), ["+10일", "+20일", "+40일", "+60일"]);
  r.horizons.forEach((h) => {
    assert.ok(h.prob >= 0 && h.prob <= 100);
    assert.ok(isFinite(h.price) && h.lo < h.hi);
  });
});

test("PRESETS 9종 · 이름·설명·prof 5축", () => {
  assert.equal(engine.PRESETS.length, 9);
  engine.PRESETS.forEach((p) => {
    assert.ok(p.name && p.desc);
    assert.equal(p.prof.length, 5);
  });
});
