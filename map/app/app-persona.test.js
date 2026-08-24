// app-persona — 페르소나 로직 테스트. 기대값은 지침·확정 정책에서 직접(단계 경계 [0,4,9,16,31,61]).
const { test } = require("node:test");
const assert = require("node:assert");
const persona = require("./app-persona.js");

const STAGES = [0, 4, 9, 16, 31, 61];
const NAMES = ["첫 스케치", "윤곽 잡는 중", "또렷해지는 중", "정밀", "초정밀", "현미경급"];

test("heat: 차원×강도 집계", () => {
  const h = persona.heat([{ d: 0, l: 2 }, { d: 0, l: 2 }, { d: 2, l: 0 }]);
  assert.equal(h[0][2], 2);
  assert.equal(h[2][0], 1);
  assert.equal(h[1][0] + h[1][1] + h[1][2], 0);
});

test("stageOf: 경계 정확 — 0첫스케치·4윤곽·9또렷·16정밀·31초정밀·61현미경(마지막은 계속)", () => {
  assert.equal(persona.stageOf(0, STAGES, NAMES).name, "첫 스케치");
  assert.equal(persona.stageOf(3, STAGES, NAMES).name, "첫 스케치");
  assert.equal(persona.stageOf(4, STAGES, NAMES).name, "윤곽 잡는 중");
  assert.equal(persona.stageOf(9, STAGES, NAMES).name, "또렷해지는 중");
  assert.equal(persona.stageOf(16, STAGES, NAMES).name, "정밀");
  assert.equal(persona.stageOf(31, STAGES, NAMES).name, "초정밀");
  assert.equal(persona.stageOf(61, STAGES, NAMES).name, "현미경급");
  assert.equal(persona.stageOf(999, STAGES, NAMES).name, "현미경급");
  assert.equal(persona.stageOf(999, STAGES, NAMES).last, true);   // 끝없는 진척 — 총량·% 없음
  const s = persona.stageOf(6, STAGES, NAMES);   // 윤곽(4~9) 중 6 → 40%
  assert.equal(s.inPct, 40);
});

test("vector: (중+2×고)/(2×표본)", () => {
  const v = persona.vector([{ d: 0, l: 2 }, { d: 0, l: 0 }]);   // (0+2)/(2*2)=0.5
  assert.equal(v[0], 0.5);
  assert.equal(v[1], 0);
});

test("chips: 표본 있는 차원만·최빈 라벨", () => {
  const c = persona.chips([{ d: 1, l: 2 }, { d: 1, l: 2 }, { d: 1, l: 0 }]);
  assert.equal(c.length, 1);
  assert.equal(c[0].label, "장기 호흡");
  assert.equal(c[0].n, 3);
});

test("radarValues: 16스포크·0.06~1·결정적", () => {
  const ans = [{ d: 0, l: 2 }, { d: 2, l: 1 }];
  const a = persona.radarValues(ans);
  const b = persona.radarValues(ans);
  assert.equal(a.length, 16);
  a.forEach((v) => assert.ok(v >= 0.06 && v <= 1));
  assert.deepEqual(a, b);
});

test("suggestPreset: 추세 성향 → 추세 계열 프리셋, 무표본 → null", () => {
  const PRESETS = require("./app-engine.js").PRESETS;
  const trendAns = [{ d: 2, l: 0 }, { d: 1, l: 2 }, { d: 0, l: 0 }];   // 추세 우선·장기·방어
  const sug = persona.suggestPreset(trendAns, PRESETS);
  assert.ok(["추세 중심", "장기 투자", "스윙"].indexOf(sug) >= 0, "추세 계열이 아님: " + sug);
  assert.equal(persona.suggestPreset([], PRESETS), null);
  assert.equal(persona.suggestPreset([{ d: 3, l: 2 }], PRESETS), null);   // 방향성 없는 차원만
});

test("groupWeights: 배율 0.85~1.15 캡·무표본=전부 1", () => {
  const w0 = persona.groupWeights([]);
  ["t", "m", "v", "q", "s"].forEach((k) => assert.equal(w0[k], 1));
  const w = persona.groupWeights([{ d: 2, l: 0 }, { d: 2, l: 0 }, { d: 1, l: 2 }]);   // 추세 몰빵
  assert.ok(w.t > 1 && w.t <= 1.15, "추세 상향 " + w.t);
  ["t", "m", "v", "q", "s"].forEach((k) => assert.ok(w[k] >= 0.85 && w[k] <= 1.15));
});
