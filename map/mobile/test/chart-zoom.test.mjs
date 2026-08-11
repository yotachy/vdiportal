import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Z = require("../www/chart-zoom.js");
const CL = require("../www/chart-layout.js");

const FUT = 24;
const pw = (W) => CL.plotWidth(W, 10);

test("화면폭별 한계가 실측값과 일치한다", () => {
  const want = { 320: [20, 104], 373: [20, 131], 673: [27, 281], 884: [44, 386], 1000: [54, 400] };
  for (const W of Object.keys(want)) {
    const L = Z.limits(pw(+W), FUT);
    assert.deepEqual([L.min, L.max], want[W], "W=" + W);
  }
});

test("절대 가드가 실제로 무는 경우가 있다 — 봉폭만으로는 무의미한 값이 나온다", () => {
  // 커버(373)는 봉폭 12px 로는 1.75봉 → BAR_MIN 20 이 걸린다
  assert.equal(Z.limits(pw(373), FUT).min, 20);
  // W=1000 은 봉폭 2px 로는 444봉 → BAR_MAX 400 이 걸린다
  assert.equal(Z.limits(pw(1000), FUT).max, 400);
});

test("clamp 는 범위 밖을 경계로 당기고 범위 안은 그대로 둔다", () => {
  const p = pw(373);                       // min 20 · max 131
  assert.equal(Z.clamp(p, FUT, 5), 20);
  assert.equal(Z.clamp(p, FUT, 999), 131);
  assert.equal(Z.clamp(p, FUT, 60), 60);
  assert.equal(Z.clamp(p, FUT, 60.4), 60, "소수는 반올림");
});

test("clamp 는 이상 입력에 기본값으로 떨어진다", () => {
  const p = pw(373);
  assert.equal(Z.clamp(p, FUT, NaN), Z.DEFAULT_TAIL);
  assert.equal(Z.clamp(p, FUT, undefined), Z.DEFAULT_TAIL);
});

test("폴드 전개 재클램프 — 커버 20봉은 펼침에서 44봉으로 끌어올려진다", () => {
  assert.equal(Z.clamp(pw(373), FUT, 20), 20, "커버에선 20봉이 유효");
  assert.equal(Z.clamp(pw(884), FUT, 20), 44, "펼침 하한 밖이라 끌어올려야 한다");
});

test("fromPinch — 벌리면 줄고 오므리면 는다", () => {
  assert.ok(Z.fromPinch(60, 100, 200) < 60, "벌림(dist 증가)이 줌인이 아니다");
  assert.ok(Z.fromPinch(60, 200, 100) > 60, "오므림이 줌아웃이 아니다");
  assert.equal(Z.fromPinch(60, 100, 100), 60, "안 움직이면 그대로");
});

test("fromPinch 는 단조다 — 더 벌릴수록 더 줄어야 한다", () => {
  let prev = Infinity;
  for (const d of [100, 150, 200, 300, 500]) {
    const t = Z.fromPinch(60, 100, d);
    assert.ok(t <= prev, "d=" + d + " 에서 단조가 깨졌다: " + t + " > " + prev);
    prev = t;
  }
});

test("fromPinch 는 0·음수·NaN 에 죽지 않는다", () => {
  for (const bad of [0, -5, NaN, undefined, Infinity]) {
    const t = Z.fromPinch(60, 100, bad);
    assert.ok(isFinite(t), "dist=" + bad + " → " + t);
  }
  assert.ok(isFinite(Z.fromPinch(60, 0, 100)));
  assert.ok(isFinite(Z.fromPinch(NaN, 100, 200)));
});

test("클램프 범위 전 구간에서 실제 봉폭이 2~12px 안이다 — 반올림 여유 0.5px", () => {
  // 경계값은 설계서 §4 에서 온 리터럴이다. Z.DX_MIN/DX_MAX 를 읽으면
  // 그 상수를 바꿨을 때 한계와 기대값이 함께 움직여 테스트가 항등식이 된다.
  var DX_LO = 2, DX_HI = 12, SLACK = 0.5;
  for (const W of [320, 373, 673, 884, 1000]) {
    const p = pw(W), L = Z.limits(p, FUT);
    for (const tail of [L.min, Math.round((L.min + L.max) / 2), L.max]) {
      const dx = p / (tail + FUT);
      assert.ok(dx >= DX_LO - SLACK, "W=" + W + " tail=" + tail + " 봉폭 " + dx.toFixed(2) + "px 가 너무 좁다");
      assert.ok(dx <= DX_HI + SLACK, "W=" + W + " tail=" + tail + " 봉폭 " + dx.toFixed(2) + "px 가 너무 넓다");
    }
  }
});

test("기본 60봉은 어느 화면에서도 예측 비중 28% 를 유지한다 — Phase 3 회귀 방지", () => {
  assert.equal(Z.DEFAULT_TAIL, 60);
  for (const W of [373, 884]) {
    const lay = CL.chartLayout({
      candle: Array.from({ length: 300 }, (_, i) => ({ o: 100, h: 101, l: 99, c: 100, v: 1, t: "2026-01-01" })),
      prediction: { path: new Array(FUT).fill(100), lo: new Array(FUT).fill(98), hi: new Array(FUT).fill(102) },
      width: W, height: 520, pad: 10, tailBars: Z.DEFAULT_TAIL
    });
    const dx = lay.fiToX(lay.fiMin + 1) - lay.fiToX(lay.fiMin);
    const seam = lay.fiToX(lay.nowFi) + dx / 2, coneR = lay.fiToX(lay.nowFi + FUT);
    const share = (coneR - seam) / lay.plot.w;
    assert.ok(share > 0.25, "W=" + W + " 예측 비중 " + (share * 100).toFixed(1) + "% 가 25% 미만");
  }
});
