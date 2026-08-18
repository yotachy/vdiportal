import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../www/onboarding-sample.js");

test("번들 시계는 240봉이고 작도에 필요한 것을 다 갖췄다", () => {
  assert.strictEqual(S.candle.length, 240);
  assert.strictEqual(S.price.length, 240);
  assert.match(S.asOf, /^\d{4}-\d{2}-\d{2}$/);
  S.candle.forEach((c, i) => {
    ["o", "h", "l", "c", "v"].forEach(k => assert.ok(isFinite(c[k]), "봉 " + i + " 의 " + k));
    assert.match(c.t, /^\d{4}-\d{2}-\d{2}$/, "봉 " + i + " 의 날짜");
    assert.ok(c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c), "봉 " + i + " 고저가 어긋난다");
  });
  assert.deepEqual(S.price, S.candle.map(c => c.c), "price 는 종가 배열이어야 한다");
});

// 엔진의 synthVolume 은 거래량을 **가격에서** 만든다. 그걸 쓰면 "상승에 거래량이 동반됐다"가
// 동어반복이 되고, 8b 가 거짓으로 판정한 바로 그 모양이 첫 화면에 걸린다.
test("거래량은 가격과 독립이다 — 수익률과 상관이 낮다", () => {
  const r = [], v = [];
  for (let i = 1; i < S.candle.length; i++) {
    r.push(S.candle[i].c / S.candle[i - 1].c - 1);
    v.push(S.candle[i].v);
  }
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const mr = mean(r), mv = mean(v);
  let num = 0, dr = 0, dv = 0;
  for (let i = 0; i < r.length; i++) {
    num += (r[i] - mr) * (v[i] - mv); dr += (r[i] - mr) ** 2; dv += (v[i] - mv) ** 2;
  }
  const corr = num / Math.sqrt(dr * dv);
  assert.ok(Math.abs(corr) < 0.25, "거래량이 가격에서 파생된 것처럼 보인다: corr=" + corr.toFixed(3));
});

test("파일이 작다 — 첫 화면이 이걸 기다린다", () => {
  const bytes = readFileSync(new URL("../www/onboarding-sample.js", import.meta.url)).length;
  assert.ok(bytes < 120000, "번들 시계가 " + bytes + "바이트다");
});

// ══════════════════════════════════════════════════════════════════════════════════
// 2026-08-19 리뷰 수정 — "출하된 표본이 후보 풀의 극단이 아니다"를 잠근다. 리뷰가 재현한
// 사고: 옛 랭킹(확신도+이동폭)이 후보 581건 중 이동폭 상위 1%(99.0 퍼센타일)를 골랐다 —
// "엔진이 맞힌 사례"인 것은 유지하되(온보딩 뒤 단계·심화 리포트가 실패 사례를 가르친다)
// "가장 극적인 사례"를 첫인상으로 파는 건 과장이다(프로젝트 메모리 "예측선 너무 정확=착시").
// 생성기가 이동폭 상위 10%(또는 하위 10%)로 돌아가면 이 시험이 빨개진다.
// ══════════════════════════════════════════════════════════════════════════════════
// 두 시험이 같은 후보 풀(buildCandidates)을 쓴다 — 매번 재계산하면 20여 초가 든다(엔진을
// 후보당 두 번 돌린다). 지연 계산 1회로 캐싱한다.
let _candCache = null;
async function pool() {
  if (_candCache) return _candCache;
  const Gen = await import("../tools/make-onboarding-sample.mjs");
  const raw = JSON.parse(readFileSync(new URL("../../backtest/earn-ohlc.json", import.meta.url)));
  _candCache = { Gen, list: Gen.buildCandidates(raw) };
  return _candCache;
}

test("출하된 표본은 후보 풀 이동폭의 극단(상·하위 10%)이 아니다 — 가장 극적인 예를 팔지 않는다", async () => {
  const { Gen, list: candidates } = await pool();
  assert.ok(candidates.length > 50, "후보 풀이 너무 작다 — 선별 기준이 과하게 좁아졌다: " + candidates.length);

  const moveSizesSorted = candidates.map(c => c.moveSize).sort((a, b) => a - b);
  // 출하된 파일(S) 자체에서 이동폭을 독립적으로 다시 잰다 — 생성기의 pick 객체를 그대로
  // 신뢰하지 않는다(그러면 생성기가 스스로 계산한 값을 생성기가 맞다고 우기는 항등식이 된다).
  const n = Math.max(30, S.candle.length - Gen.GUESS_CUT);
  const before = S.price[n - 1], after = S.price[S.price.length - 1];
  const shippedMove = Math.abs(Math.log(after / before)) * 100;
  const pct = Gen.percentileRank(moveSizesSorted, shippedMove);

  assert.ok(pct <= 90,
    "출하된 표본의 이동폭이 후보 풀 상위 10% 안이다(" + pct.toFixed(1) + "퍼센타일) — 가장 극적인 예로 되돌아갔다");
  assert.ok(pct >= 10,
    "출하된 표본의 이동폭이 후보 풀 하위 10% 안이다(" + pct.toFixed(1) + "퍼센타일) — 너무 미미해 학습 효과가 없다");
});

test("생성기의 pickTypical 은 confluence 최댓값을 전형적 밴드 안에서 고른다 — 재현", async () => {
  const { Gen, list: candidates } = await pool();
  const { pick, typical } = Gen.pickTypical(candidates);
  assert.ok(typical.every(c => c.conf <= pick.conf), "typical 밴드 안에 pick 보다 확신도가 높은 후보가 남아 있다");
  assert.ok(typical.indexOf(pick) >= 0, "pick 이 typical 밴드 밖에서 나왔다");
});

// ══════════════════════════════════════════════════════════════════════════════════
// 2026-08-19 리뷰 Important — 표본을 골랐던 근거("성향이 판정을 가른다")를 잠그는 시험이
// 없었다(task-1-report.md 의 측정은 스크립트를 수동으로 돌려야만 드러났다). 그리고 이건
// 살얼음판이다: 유일하게 갈리는 momentum 의 score 가 11 이고 regime 경계가 ±12 라
// **1점 차이**다. forge-core.js 반올림 규칙이나 ind-tiers.js 프리셋 재공식화가 조용히
// momentum 을 bull 로 되돌리면, 표본을 갈아가며 확보한 그 성향 분기가 소리 없이
// 사라지고 온보딩 3단계는 "아무 일도 안 일어나는 화면"으로 되돌아간다 — 지금은 아무것도
// 그걸 빨갛게 만들지 않는다. tools/measure-preset-sensitivity.mjs 의 measure() 를 그대로
// 재사용해 "출하된 표본은 4종 성향 중 최소 2종 regime 을 낸다"를 잠근다.
// ══════════════════════════════════════════════════════════════════════════════════
test("출하된 표본은 4종 성향 중 최소 2종 regime 을 낸다 — 3단계가 아무 일도 안 하는 화면이 아니다", async () => {
  const { measure } = await import("../tools/measure-preset-sensitivity.mjs");
  const results = measure();
  const REGIME_THRESHOLD = 12;   // forge-core.js: regime = _dirSig > 12 ? bull : < -12 ? bear : neutral
  const presetKeys = ["trend", "momentum", "reversion", "volatility"];

  const rows = presetKeys.map(k => {
    const r = results[k];
    const margin = REGIME_THRESHOLD - Math.abs(r.score);   // 경계까지 남은 점수(작을수록 위험)
    return k + "=" + r.regime + "(score=" + r.score + ", 경계까지 " + margin + "점)";
  });
  const regimes = new Set(presetKeys.map(k => results[k].regime));

  assert.ok(regimes.size >= 2,
    "4종 성향이 전부 같은 regime 이다 — 3단계에서 성향을 바꿔도 판정이 안 바뀐다. " +
    "측정값: " + rows.join(" · ") + " (regime 경계 ±" + REGIME_THRESHOLD + ")");
});
