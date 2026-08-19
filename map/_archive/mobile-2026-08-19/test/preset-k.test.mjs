// 프리셋 배율 k 는 지어낸 값이 아니라 측정값이다(P2 T9, 2026-08-17). 그 성질을 여기서 지킨다.
//
// 이 관문이 막으려는 것은 "누군가 시안의 예시 숫자(2.0/1.4/0.6/0.3)를 보고 코드에 그대로
// 옮겨 적는 것"이다. 그 숫자를 썼다면 추세 추종의 확률 오차가 두 배 넘게 나빠졌을 것이다.
// 그래서 코드의 k 와 **측정 보고서**를 대조한다 — 사람이 기억하는 근거가 아니라 파일이 근거다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const T = require("../www/ind-tiers.js");
const HOLDOUT = JSON.parse(readFileSync(new URL("../../backtest/preset-k-holdout.json", import.meta.url), "utf8"));

test("배율을 가진 프리셋은 표본 밖 확인을 통과한 것뿐이다", () => {
  T.PRESETS.forEach(p => {
    const h = HOLDOUT.presets[p.key];
    assert.ok(h, p.key + " 가 측정 보고서에 없다 — 재보지 않은 프리셋에 배율을 주면 안 된다");
    const k = T.kOf(p.key);
    if (k === 1.0) return;   // 배율 없음은 언제나 안전한 기본값이라 근거를 요구하지 않는다
    assert.equal(h.verdict, "signal",
      p.name + " 의 k=" + k + " 는 표본 밖 확인을 통과하지 못했다(" + h.verdict + ") — " +
      "한쪽 반쪽에서만 좋아진 값은 표본을 외운 것이다");
    assert.equal(k, h.kBest,
      p.name + " 의 코드 배율(" + k + ")이 측정이 고른 값(" + h.kBest + ")과 다르다");
  });
});

test("표본 밖에서 뒤집힌 값은 코드에 없다 — 인샘플 최선값을 주워 담지 않는다", () => {
  Object.keys(HOLDOUT.presets).forEach(key => {
    const h = HOLDOUT.presets[key];
    if (h.verdict === "signal" || h.verdict === "no-scaling") return;
    assert.equal(T.kOf(key), 1.0,
      h.name + " 는 표본 밖에서 뒤집혔는데(" + h.halves.A.deltaPP + "%p · " +
      h.halves.B.deltaPP + "%p) 코드가 배율 " + T.kOf(key) + " 를 쓴다");
  });
});

test("weightsOf 는 집합 안만 배율을 받고, Lv1 로 딸려온 것은 1.0 이다", () => {
  const core = T.TIERS[0].types;
  T.PRESETS.forEach(p => {
    const w = T.weightsOf(p.key, core);
    const k = T.kOf(p.key);
    p.types.forEach(t => {
      if (w[t] === undefined) return;   // tunable 이 아니면 애초에 빠진다
      assert.equal(w[t], k, p.name + " 의 " + t + " 가 집합 안인데 배율이 " + w[t] + " 다");
    });
    Object.keys(w).forEach(t => {
      if (p.types.indexOf(t) < 0) assert.equal(w[t], 1.0,
        p.name + " 의 " + t + " 는 집합 밖(Lv1 로 딸려온 것)인데 배율 " + w[t] + " 를 받았다");
    });
  });
});

test("시안의 예시 숫자를 그대로 쓰지 않는다", () => {
  // 1.4 · 0.6 · 0.3 은 시안 슬라이더의 예시값이다. 측정이 고른 값 집합과 겹치지 않아야 한다 —
  // 겹치면 근거가 측정인지 시안인지 구분이 안 된다. (2.0 은 평균 회귀가 실제로 측정으로 얻은
  // 값이라 예외다 — 우연히 같은 숫자인 것과 베껴 적은 것은 다르고, 그 구분은 위 두 관문이 한다.)
  const MOCKUP_ONLY = [1.4, 0.6, 0.3];
  T.PRESETS.forEach(p => {
    assert.ok(MOCKUP_ONLY.indexOf(T.kOf(p.key)) < 0,
      p.name + " 의 배율 " + T.kOf(p.key) + " 가 시안 예시 숫자다 — 측정 보고서에 없는 값이다");
  });
});
