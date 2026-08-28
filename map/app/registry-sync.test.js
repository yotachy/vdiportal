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

test("레지스트리가 유일한 목록 — 개수는 밖에서 고정한 기대값과 대조", () => {
  const reg = core.indicatorRegistry;
  // ⚠ 기대값은 구현이 아니라 밖에서 온다. indicatorCount·등급표·앱 화면은 전부 이 배열에서
  // 파생되므로 그것들과 대조하면 항등식이 된다. 지표를 추가할 때 **의도적으로** 갱신할 곳은
  // 이 숫자 하나이고, 나머지(PC 레일·백테스트 등급표·앱 UI·분석)는 전부 자동으로 따라온다.
  assert.equal(reg.length, 32, "지표 수가 바뀌었다면 이 기대값을 의도적으로 갱신할 것");
  assert.equal(reg.filter((e) => e.tier === 1).length, 5, "기본 티어(Lv1) 종수");
  assert.equal(reg.length, core.indicatorCount, "indicatorCount 는 레지스트리 파생이어야 한다");
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

// ── 사본 금지 가드(2026-08-28) — 목록을 다시 적으면 자동 확장이 깨진다 ──────────────
// 실측 배경: 가짜 33번째 지표를 레지스트리에 넣었을 때 앱은 33 으로 확장됐지만 PC 레일은
// 32 에 멈췄다(forge-state.js 에 지표 id 목록 사본이 있었기 때문). 그 사본들을 파생으로
// 바꿨고, 다시 생기지 않게 소스를 직접 본다.
const fs = require("node:fs");
const path = require("node:path");
function srcOf(rel) { return fs.readFileSync(path.join(__dirname, "..", rel), "utf8"); }

test("레지스트리 kind: 모든 항목이 osc/overlay 로 분류돼 있다", () => {
  // 앱 배지(app-chart OSC)·PC 게이지 판정이 이 필드에서 파생된다 — 누락되면 조용히 빠진다.
  const reg = core.indicatorRegistry;
  reg.forEach((e) => assert.ok(e.kind === "osc" || e.kind === "overlay", e.id + " kind 누락/이상: " + e.kind));
  assert.equal(reg.filter((e) => e.kind === "osc").length, 15, "오실레이터 종수(밖에서 고정한 기대값)");
  const chart = require("./app-chart.js");
  assert.deepEqual(chart.OSC.slice().sort(), reg.filter((e) => e.kind === "osc").map((e) => e.id).sort(),
    "앱 배지 OSC 는 레지스트리 kind 파생이어야 한다");
});

test("사본 금지: forge-state·ind-tiers·app-chart·forge-ui 는 목록을 엔진에서 파생한다", () => {
  const st = srcOf("forge-state.js");
  assert.ok(/IND_TIERS\s*=\s*ForgeCore\.indicatorTiers\(\)/.test(st),
    "forge-state 의 IND_TIERS 가 레지스트리 파생이 아니다");
  const it = srcOf("backtest/ind-tiers.js");
  assert.ok(/TIERS\s*=\s*core\.indicatorTiers\(\)/.test(it),
    "backtest/ind-tiers 의 TIERS 가 레지스트리 파생이 아니다");
  assert.ok(/OSC\s*=\s*core\.indicatorRegistry\.filter/.test(srcOf("app/app-chart.js")),
    "app-chart 의 OSC 가 레지스트리 파생이 아니다");
  assert.ok(/GAUGE_TYPES\s*=\s*ForgeCore\.indicatorRegistry\.map/.test(srcOf("forge-ui.js")),
    "forge-ui 의 GAUGE_TYPES 가 레지스트리 파생이 아니다");
  // 등급표 사본이 다시 생기는 것만 겨냥한다 — `lv:` 와 지표 id 나열이 한 줄에 같이 있으면 사본이다.
  // 겨냥에서 빼는 것 둘(자동 확장 대상이 아니다):
  //  · NEW_INDICATORS — 레일 'new' 배지용 편집 목록(사람이 올리고 내린다)
  //  · 프리셋(`key:`) — 백테스트로 k 를 정한 큐레이션 집합(새 지표가 조용히 끼면 안 된다)
  [["forge-state.js", st], ["backtest/ind-tiers.js", it],
   ["app/app-chart.js", srcOf("app/app-chart.js")], ["forge-ui.js", srcOf("forge-ui.js")]].forEach(function (pair) {
    const ids = core.indicatorRegistry.map((e) => e.id);
    pair[1].split("\n").forEach(function (ln, i) {
      // 자동 확장 대상이 아닌 것들 — 배지 편집 목록·성격 태그·큐레이션 프리셋(PC _PRESET_DEF 는
      // { name, t:[...] }, 백테스트 프리셋은 { key, types:[...] }). 새 지표가 조용히 끼면 안 된다.
      if (/NEW_INDICATORS|PATTERN_NATURE|\bkey\s*:/.test(ln)) return;
      if (/\bname\s*:/.test(ln) && /\bt\s*:\s*\[/.test(ln)) return;
      const hits = ids.filter((id) => new RegExp('"' + id + '"').test(ln)).length;
      if (/\blv\s*:/.test(ln)) {
        assert.ok(hits < 3, pair[0] + ":" + (i + 1) + " 에 등급표 사본으로 보이는 줄이 있다");
      }
      // 한 줄에 지표 id 를 8개 이상 나열 = 전체 목록 사본(GAUGE_TYPES·OSC 가 그랬다)
      assert.ok(hits < 8, pair[0] + ":" + (i + 1) + " 에 지표 전체 목록 사본으로 보이는 줄이 있다");
    });
  });
});

test("자동 확장: 가짜 33번째를 넣으면 등급표·개수가 함께 늘어난다", () => {
  const reg = core.indicatorRegistry;
  const fake = { id: "__fake33", label: "가짜", tier: 2, group: "m", input: "price",
    analyze: function (p) { return { bias: 0, last: p[p.length - 1] }; } };
  reg.push(fake);
  try {
    assert.equal(core.indicatorTiers().reduce((s, t) => s + t.types.length, 0), 33);
    assert.ok(core.indicatorTiers()[1].types.indexOf("__fake33") >= 0, "Lv2 에 들어가야 한다");
    assert.equal(engine.fullSet().length, 33, "앱 브리지도 33 으로");
  } finally { reg.pop(); }
  assert.equal(core.indicatorTiers().reduce((s, t) => s + t.types.length, 0), 32);
});
