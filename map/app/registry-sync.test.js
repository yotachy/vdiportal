// 열린 엔진 연계 관문 — 엔진 레지스트리가 단일 출처이고, 지표가 추가되면 앱이 자동 확장됨을 증명.
// ① 레지스트리 ↔ indicatorCount ↔ IND_TIERS(backtest 사본) 3자 동기(드리프트 가드)
// ② 가짜 33번째 지표를 레지스트리에 넣으면 브리지가 별도 구현 없이 33개로 분석(자동 확장 증명)
const { test } = require("node:test");
const assert = require("node:assert");
const core = require("../forge-core.js");
const tiers = require("../backtest/ind-tiers.js");
const engine = require("./app-engine.js");

function fixtureCandles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = 100 * Math.exp(0.0015 * i) + 6 * Math.sin(i / 9);
    out.push({ o: c * 0.995, h: c * 1.012, l: c * 0.988, c: c, v: 1000 + 300 * Math.sin(i / 5) });
  }
  return out;
}

test("레지스트리 = indicatorCount = IND_TIERS 사본 (3자 완전 동기)", () => {
  const reg = core.indicatorRegistry;
  assert.equal(reg.length, core.indicatorCount, "레지스트리 수 ≠ indicatorCount");
  const byTier = {};
  reg.forEach((e) => { (byTier[e.tier] = byTier[e.tier] || []).push(e.id); });
  tiers.TIERS.forEach((t) => {
    assert.deepEqual(byTier[t.lv].slice().sort(), t.types.slice().sort(),
      "tier " + t.lv + " 구성 불일치(레지스트리 vs ind-tiers)");
  });
  // 필수 필드
  reg.forEach((e) => {
    assert.ok(e.id && e.label && e.group && e.tier >= 1 && e.tier <= 4, e.id + " 필드 누락");
    assert.ok(["t", "m", "v", "q", "s"].indexOf(e.group) >= 0, e.id + " 그룹 코드 이상");
    assert.ok(e.analyze || e.input === "scan", e.id + " analyze 부재");
  });
});

test("브리지 파생: basicSet=tier1, fullSet=전체(그룹 순서), 개수=엔진", () => {
  assert.deepEqual(engine.basicSet().slice().sort(),
    tiers.TIERS[0].types.slice().sort());
  assert.equal(engine.fullSet().length, core.indicatorCount);
  assert.equal(engine.indicatorCount(), core.indicatorCount);
});

test("자동 확장 증명: 가짜 33번째 지표 추가 → 별도 구현 없이 33개로 분석", async () => {
  const FIX = fixtureCandles(300);
  const fake = { id: "fake33", label: "테스트 지표", tier: 4, group: "m", input: "price",
    analyze: function (price) { return { bias: 0.5 }; } };
  core.indicatorRegistry.push(fake);
  try {
    assert.equal(engine.indicatorCount(), 33);
    assert.equal(engine.fullSet().length, 33);
    const steps = [];
    const r = await engine.analyze({ symbol: "T", tfKo: "일", tier: "deep", preset: "전체 종합", candles: FIX },
      (st) => steps.push(st));
    assert.equal(steps.length, 33, "onStep 33회가 아님");
    assert.equal(r.indicators.length, 33, "리포트 지표 33개가 아님");
    const f = r.indicators.filter((x) => x.id === "fake33")[0];
    assert.ok(f, "가짜 지표가 리포트에 없음");
    assert.equal(f.name, "테스트 지표");
    assert.equal(f.bias, 0.5);                       // 범용 폴백이 analyze 를 실행
    assert.ok(f.text.length > 0);
    // 가중치 파생에도 자동 포함
    const w = engine.presetWeights("모멘텀 중심");
    assert.ok(Math.abs(w.fake33 - 10 / 6) < 1e-9);   // m축 10/6
  } finally {
    core.indicatorRegistry.pop();                     // 반드시 원복
  }
  assert.equal(engine.indicatorCount(), 32);
});
