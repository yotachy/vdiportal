// 온보딩 3단계("성향을 고르면 같은 구간의 판정이 바뀐다")가 성립하는지 측정한다.
// 짓기 전에 잰다 — 4종 성향이 결과를 안 가르면 그 화면은 아무 일도 안 일어나는 화면이고
// 설계의 한 축이 무너진다(task-1-brief.md). 이 파일은 버리지 않는다 — 표본을 다시 고를
// 때마다 이 질문을 다시 물어야 한다(make-onboarding-sample.mjs 가 이 스크립트를 재사용한다).
//
// API 시그니처는 추측하지 않고 기존 시험에서 확인했다:
//   - MSGraph.full32Graph(ForgeCore) / basicGraph(ForgeCore) / customGraph(ForgeCore, weights)
//     (test/graph.test.mjs)
//   - MSIndTiers.selectionOf(presetKey, core) / weightsOf(presetKey, core)
//     (www/ind-tiers.js — core 는 항상 포함되는 Lv1 5종, 즉 MSGraph.BASIC)
//   - ForgeCore.run(graph, data, opts) → { verdict: { regime, score, ... } }
//     (test/graph.test.mjs, test/custom-weights.test.mjs)
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const FC = require("../../forge-core.js");
const G = require("../www/graph.js");
const Tiers = require("../www/ind-tiers.js");
const RM = require("../www/report-model.js");
const S = require("../www/onboarding-sample.js");

const GUESS_CUT = 12;               // onboarding.js / make-onboarding-sample.mjs 와 동일해야 한다
const VISIBLE = S.candle.length - GUESS_CUT;
const TF_KO = RM.tfKo("1day");

function visibleInput() {
  const win = S.candle.slice(0, VISIBLE);
  return { price: win.map(c => c.c), candle: win, volume: win.map(c => c.v) };
}

function runGraph(graph, input, weights) {
  G.setVolume(graph, input.volume);
  const opt = { timeframe: TF_KO };
  if (weights) opt.driftWeights = G.driftWeightsOf(graph, weights);
  const out = FC.run(graph, input, opt);
  return { regime: out.verdict.regime, score: out.verdict.score,
           indicatorCount: G.indicatorTypes(graph).length };
}

export function measure() {
  const input = visibleInput();
  const results = {};

  results.basic5 = runGraph(G.basicGraph(FC), input, null);
  results.full32 = runGraph(G.full32Graph(FC), input, null);

  Tiers.PRESETS.forEach(p => {
    const weights = Tiers.weightsOf(p.key, G.BASIC);
    const graph = G.customGraph(FC, weights);
    results[p.key] = Object.assign({ name: p.name, k: Tiers.kOf(p.key) }, runGraph(graph, input, weights));
  });

  return results;
}

function report(results) {
  console.log("측정 구간: 가려진 " + GUESS_CUT + "봉 제외 " + VISIBLE + "봉 (asOf=" + S.asOf + ")\n");

  console.log("== 5도구 vs 32도구 (basicGraph vs full32Graph, 성향 미적용) ==");
  console.log(row("도구", "지표수", "regime", "score"));
  console.log(row("5도구(basic)", results.basic5.indicatorCount, results.basic5.regime, results.basic5.score));
  console.log(row("32도구(full)", results.full32.indicatorCount, results.full32.regime, results.full32.score));

  console.log("\n== 4종 성향 (customGraph, Lv1 5종 항상 포함) ==");
  console.log(row("성향", "지표수", "regime", "score", "k"));
  const presetKeys = Tiers.PRESETS.map(p => p.key);
  presetKeys.forEach(key => {
    const r = results[key];
    console.log(row(r.name + "(" + key + ")", r.indicatorCount, r.regime, r.score, r.k));
  });

  const regimes = new Set(presetKeys.map(k => results[k].regime));
  const scores = presetKeys.map(k => results[k].score);
  const scoreSpread = Math.max(...scores) - Math.min(...scores);
  const REGIME_THRESHOLD = 12;   // forge-core.js: regime = _dirSig > 12 ? bull : < -12 ? bear : neutral

  // 여기서 "유의미하다"를 자동으로 결정하지 않는다 — 문지방값을 코드에 박으면 다음에
  // 표본이 바뀔 때 그 값이 왜 5였는지 아무도 모르게 된다. 대신 regime 을 가르는 실제
  // 기준(±12)과 나란히 숫자만 보여준다 — 판정은 이 숫자를 읽는 사람(보고서)이 내린다.
  console.log("\n== 판정에 필요한 원자료 ==");
  console.log("성향 간 서로 다른 regime 종류:", [...regimes].join(", "), "(" + regimes.size + "종)");
  console.log("성향 간 score 범위:", Math.min(...scores), "~", Math.max(...scores),
    "(스프레드 " + scoreSpread + ", regime 경계는 ±" + REGIME_THRESHOLD + ")");

  return { regimeCount: regimes.size, regimes: [...regimes], scoreSpread, scores };
}

function row(...cells) {
  return cells.map(c => String(c).padEnd(16)).join(" ");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const results = measure();
  report(results);
}
