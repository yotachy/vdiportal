const { test } = require("node:test");
const assert = require("node:assert");
const { attribute } = require("./attribution.js");

// vol-high 국면에서 지표 z가 base를 반대로 밀어 틀리게 하는 합성 train
function mk(n) {
  const recs = [];
  for (let i = 0; i < n; i++) {
    const up_ = i % 2 === 0;                   // 절반 상승/하락
    const a20 = up_ ? 110 : 90;
    // base는 vol-high에서 항상 반대(오답), z drop 시 정답 방향
    const g = i < n * 0.7 ? "vol-high" : "trend-up";
    const up = up_ ? 30 : 70;        // base 오답: 상승인데 up30(하락콜), 하락인데 up70(상승콜)
    const abZ = up_ ? 70 : 30;       // z 제거 시 정답 방향
    recs.push({ sym: "A", t: i, base: 100, a20, a60: a20, up, regime: [g], ab: { z: { up: abZ }, w: { up } } });
  }
  return recs;
}

test("attribute surfaces the betraying indicator in its regime", () => {
  const diags = attribute(mk(600), { minN: 100, minGain: 0.01 });
  const hit = diags.find(d => d.indicator === "z" && d.regime === "vol-high");
  assert.ok(hit, "vol-high에서 z 배신 진단 기대: " + JSON.stringify(diags));
  assert.ok(hit.stat.trainGain > 0.01, "trainGain>0.01");
  assert.strictEqual(hit.kind, "betray");
});

test("no diagnosis when regime sample below minN", () => {
  const diags = attribute(mk(60), { minN: 500 });
  assert.strictEqual(diags.length, 0);
});
