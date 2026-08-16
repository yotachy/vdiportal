// backtest/tier-backtest.js — 티어별 방향 적중률 실측
//
// 왜 필요한가: 앱이 "기본분석 / 심화분석" 두 값을 나란히 보여준다. 그런데 지금 우리가 가진
// 실측치는 하나뿐이고(19지표 sampleGraph, 58.1%) 그건 기본(5)도 심화(32)도 아니다.
// 두 티어의 숫자를 지어내면 사용자가 3스쿱을 내는 근거 자체가 거짓이 된다.
//
// 그래서 같은 walk-forward 하네스를 지표 구성만 바꿔 두 번 돌린다. 결과가 "심화가 더 낫다"로
// 나오지 않을 수도 있다 — 그 경우 화면 문구를 '더 맞는다'에서 '더 많이 본다'로 바꾸는 것이
// 정직한 대응이지, 숫자를 고르는 것이 아니다.
"use strict";
const fs = require("fs");
const path = require("path");
const FC = require("../forge-core.js");
const BT = require("./backtest.js");

// forge-state.js 의 IND_TIERS 를 그대로 옮긴 것. 그 파일은 브라우저 UI 라 require 할 수 없어
// 리터럴로 두되, 아래에서 엔진이 스스로 세는 개수와 대조해 갈라지면 즉시 죽는다.
const IND_TIERS = {
  1: ["ma", "macd", "rsi", "bollinger", "volume"],
  2: ["trend", "adx", "stochastic", "fib", "ichimoku", "pivot", "psar", "gann"],
  3: ["vwap", "supertrend", "atr", "volumeprofile", "structure", "keltner", "donchian", "cci", "williams", "aroon", "mfi"],
  4: ["elliott", "smc", "cycle", "phasefold", "roc", "ao", "cmf", "pattern"],
};
const ALL = [].concat(IND_TIERS[1], IND_TIERS[2], IND_TIERS[3], IND_TIERS[4]);

// 티어 정의는 화면이 파는 상품 그 자체다. 엔진에 지표가 하나 추가됐는데 여기 목록이 그대로면
// '심화 = 전부'가 조용히 거짓이 된다 — 그 순간 측정을 멈춘다.
if (ALL.length !== FC.indicatorCount)
  throw new Error("티어 목록 " + ALL.length + "종 ≠ 엔진 배터리 " + FC.indicatorCount +
    "종 — forge-state.js 의 IND_TIERS 와 맞출 것");
{
  const dup = ALL.filter((t, i) => ALL.indexOf(t) !== i);
  if (dup.length) throw new Error("티어 목록에 중복: " + dup.join(", "));
}

// price → 지표 → combine → predict. sampleGraph 의 토폴로지와 같은 모양을 지표 목록만 바꿔 짓는다.
//
// `kind:"block"` 이 필수다. 빠뜨리면 buildDAG 가 노드를 블록으로 인정하지 않아 **지표가 하나도
// 평가되지 않고**, 그런데도 run() 은 정상적으로 예측을 돌려준다 — 5종과 32종이 똑같은 점수를
// 내는 것으로만 드러난다. 조용히 통과하는 실패라 여기 적어둔다.
//
// weight 는 전 지표 균일 50. sampleGraph 는 지표마다 다른 가중치(55·60…)를 쓰는데, 그걸 쓰면
// 티어 비교가 '지표 수의 차이'가 아니라 '누가 어떤 가중치를 받았나'의 차이가 된다.
// params 는 비워 엔진 기본값을 쓴다 — 모바일 사용자가 실제로 받는 구성이 그것이다.
function node(id, blockType) {
  return { id: id, kind: "block", blockType: blockType, params: {}, conviction: 0, weight: 50 };
}
function graphOf(types) {
  const nodes = [node("n_price", "price")];
  const edges = [];
  types.forEach(function (t, i) {
    const id = "n_" + i + "_" + t;
    nodes.push(node(id, t));
    edges.push({ from: "n_price", fromSide: "right", to: id, toSide: "left" });
    edges.push({ from: id, fromSide: "right", to: "n_comb", toSide: "left" });
  });
  nodes.push(node("n_comb", "combine"));
  nodes.push(node("n_pred", "predict"));
  edges.push({ from: "n_comb", fromSide: "right", to: "n_pred", toSide: "left" });
  return { nodes: nodes, edges: edges };
}

const TIERS = [
  { key: "basic", label: "기본분석", types: IND_TIERS[1] },
  { key: "deep", label: "심화분석", types: ALL },
];
// 전문분석(pro)은 심화와 같은 32종에 사용자 가중치만 얹는다. 가중치는 사람마다 달라서
// 하나의 적중률로 잴 수 없다 — 그래서 여기서 재지 않는다. 화면도 pro 에 별도 숫자를 걸면 안 된다.

function main() {
  const dir = path.join(__dirname, "fixtures");
  let files = [];
  try { files = fs.readdirSync(dir).filter(function (f) { return f.endsWith(".json"); }); } catch (e) {}
  if (!files.length) { console.error("픽스처 없음 — 먼저 `node backtest/fetch-fixtures.js` 실행"); process.exit(1); }
  const fixtures = files.map(function (f) { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); });

  const out = { generatedAt: process.env.BT_STAMP || null, engineVersion: FC.version, indicatorCount: FC.indicatorCount, tiers: {} };
  for (const tier of TIERS) {
    console.error("\n=== " + tier.label + " (" + tier.types.length + "종) ===");
    const rep = BT.runBacktest(fixtures, { generatedAt: out.generatedAt, graph: graphOf(tier.types) });
    const o = rep.overall;
    out.tiers[tier.key] = {
      label: tier.label, indicators: tier.types.length, types: tier.types,
      directionHitRate: o.directionHitRate, baselineAlwaysUp: o.baselineAlwaysUp,
      bullHitRate: o.bullHitRate, bearHitRate: o.bearHitRate,
      coneCoverage: o.coneCoverage, calibrationECE: o.calibrationECE, priceMAE: o.priceMAE,
      nForecasts: rep.universe.reduce(function (s, u) { return s + (u.points || 0); }, 0),
      nSeries: rep.universe.length,
      byRegime: rep.byRegime, byTimeframe: rep.byTimeframe,
    };
  }

  const b = out.tiers.basic, d = out.tiers.deep;
  out.deepMinusBasicPP = (b.directionHitRate != null && d.directionHitRate != null)
    ? Math.round((d.directionHitRate - b.directionHitRate) * 1000) / 10 : null;

  fs.writeFileSync(path.join(__dirname, "tier-report.json"), JSON.stringify(out, null, 2));
  const pct = function (x) { return x == null ? "–" : (x * 100).toFixed(1) + "%"; };
  console.log("\n=== 티어별 방향 적중 (엔진 " + FC.version + ") ===");
  for (const t of TIERS) {
    const r = out.tiers[t.key];
    console.log("  " + t.label + " (" + r.indicators + "종, n=" + r.nForecasts + ") : " + pct(r.directionHitRate) +
      "  강세콜 " + pct(r.bullHitRate) + " / 약세콜 " + pct(r.bearHitRate) +
      "  콘커버 " + pct(r.coneCoverage) + "  vs 항상상승 " + pct(r.baselineAlwaysUp));
  }
  console.log("  심화 − 기본 : " + (out.deepMinusBasicPP == null ? "–" :
    (out.deepMinusBasicPP >= 0 ? "+" : "") + out.deepMinusBasicPP + "%p"));
  console.log("→ tier-report.json 기록됨\n");
}

if (require.main === module) main();
module.exports = { graphOf, IND_TIERS, ALL };
