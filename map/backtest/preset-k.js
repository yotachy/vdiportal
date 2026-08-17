// backtest/preset-k.js — 투자성향 프리셋 배율 k 측정 (모바일 P2 T9)
//
// 왜 필요한가: 시안이 가중치 슬라이더에 2.0 · 1.4 · 0.6 · 0.3 을 적어뒀지만 그건 **예시 숫자**다.
// 실제 프리셋 배율은 어디에도 없었고(인벤토리 §0 충돌 9 "지어내면 안 됨"), 그래서 앱은
// PRESET_K = 1.0 으로 나갔다 — 프리셋이 선택 집합으로만 동작하고 배율은 아직 없는 상태.
// 이 스크립트가 그 상수 하나를 정한다.
//
// **무엇으로 고르는가가 이 측정의 핵심이다.** 방향 적중률로 고르면 안 된다. 티어 실측이 이미
// 말했다 — 지표를 5종에서 32종으로 늘려도 방향은 +0.36%p 뿐이고(하락장 +0.03 · 횡보장 +0.02),
// 대신 확률 오차가 4배 정직해지고 콘 커버가 라벨에 가까워진다. 가중치도 같은 축일 것이라
// 보는 게 자연스럽고, 방향으로 고르면 잡음에서 최댓값을 주워 올 위험이 크다.
// 그래서 **ECE(낮을수록 좋다)와 콘 커버 오차(80% 라벨에서 얼마나 벗어났나)로 고른다.**
//
// 가중치는 두 경로를 함께 움직인다(P2 설계 §5): driftWeights[blockType] 는 드리프트 항을,
// node.weight 는 combine 합성을 바꾼다. 한쪽만 주면 "가중치를 올렸는데 반대 개수만 바뀌고
// 예측선은 그대로"가 실제로 난다.
//
//   node backtest/preset-k.js                 # 전체 픽스처, 기본 k 후보
//   node backtest/preset-k.js --fixtures 20   # 빠른 탐색
//   node backtest/preset-k.js --ks 1.0,1.5,2.0
"use strict";
const fs = require("fs");
const path = require("path");
const FC = require("../forge-core.js");
const BT = require("./backtest.js");

// 프리셋 정의는 앱과 같은 파일에서 읽는다 — 여기 베껴 적으면 앱이 바뀌었을 때 측정만 낡는다.
const Tiers = require("../mobile/www/ind-tiers.js");

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
const K_LIST = String(arg("ks", "1.0,1.2,1.4,1.6,2.0,2.5")).split(",").map(Number);
const N_FIX = Number(arg("fixtures", "0")) || 0;

const CORE = Tiers.TIERS[0].types;          // Lv1 5종 — 프리셋과 무관하게 언제나 포함
const TUNABLE = Tiers.tunable();            // gann·pattern 제외 30종

function node(id, blockType, weight) {
  return { id: id, kind: "block", blockType: blockType, params: {}, conviction: 0, weight: weight };
}

// 선택 집합 + 배율로 그래프를 짓는다. weight 50 이 기준(1.0×)이라 k 배는 50*k 다.
function graphFor(types, weights) {
  const nodes = [node("n_price", "price", 50)];
  const edges = [];
  types.forEach(function (t, i) {
    const id = "n_" + i + "_" + t;
    nodes.push(node(id, t, Math.round(50 * (weights[t] || 1))));
    edges.push({ from: "n_price", fromSide: "right", to: id, toSide: "left" });
    edges.push({ from: id, fromSide: "right", to: "n_comb", toSide: "left" });
  });
  nodes.push(node("n_comb", "combine", 50));
  nodes.push(node("n_pred", "predict", 50));
  edges.push({ from: "n_comb", fromSide: "right", to: "n_pred", toSide: "left" });
  return { nodes: nodes, edges: edges };
}

// 80% 콘이 실제로 몇 %를 덮었는가에서 라벨(0.80)까지의 거리. 방향과 달리 "정직함"의 척도다.
function coneErr(cov) { return cov == null ? null : Math.abs(cov - 0.80); }

function main() {
  const dir = path.join(__dirname, "fixtures");
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch (e) {}
  if (!files.length) { console.error("픽스처 없음 — 먼저 `node backtest/fetch-fixtures.js`"); process.exit(1); }
  if (N_FIX) files = files.slice(0, N_FIX);
  const fixtures = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

  console.error("프리셋 " + Tiers.PRESETS.length + "종 × k " + K_LIST.length + "값 × 픽스처 " +
                fixtures.length + " — 엔진 " + FC.version);

  const out = { generatedAt: process.env.BT_STAMP || null, engineVersion: FC.version,
                fixtures: fixtures.length, ks: K_LIST, presets: {} };

  for (const p of Tiers.PRESETS) {
    const sel = Tiers.selectionOf(p.key, CORE);
    out.presets[p.key] = { name: p.name, selected: sel.length, types: sel, byK: {} };
    for (const k of K_LIST) {
      // 집합에 든 것만 k, Lv1 로 딸려온 나머지는 1.0 — 앱의 weightsOf 와 같은 규칙이다.
      const w = {};
      sel.forEach(t => { w[t] = (p.types.indexOf(t) >= 0) ? k : 1.0; });
      const rep = BT.runBacktest(fixtures, { graph: graphFor(sel, w), runOpts: { driftWeights: w }, progress: false });
      const o = rep.overall;
      out.presets[p.key].byK[k] = {
        directionHitRate: o.directionHitRate, calibrationECE: o.calibrationECE,
        coneCoverage: o.coneCoverage, coneErr: coneErr(o.coneCoverage), priceMAE: o.priceMAE,
        n: rep.universe.reduce((s, u) => s + (u.points || 0), 0),
      };
      const r = out.presets[p.key].byK[k];
      console.error("  " + p.name + " k=" + k + " → ECE " + (r.calibrationECE * 100).toFixed(2) +
                    "%p · 콘 " + (r.coneCoverage * 100).toFixed(1) + "% · 방향 " +
                    (r.directionHitRate * 100).toFixed(2) + "%");
    }
  }

  // 프리셋마다 최선의 k — ECE 우선, 동률이면 콘 오차. 방향은 **고르는 데 쓰지 않고** 기록만 한다.
  const picks = {};
  for (const key of Object.keys(out.presets)) {
    const byK = out.presets[key].byK;
    picks[key] = K_LIST.slice().sort((a, b) => {
      const A = byK[a], B = byK[b];
      if (A.calibrationECE !== B.calibrationECE) return A.calibrationECE - B.calibrationECE;
      return A.coneErr - B.coneErr;
    })[0];
  }
  out.bestPerPreset = picks;

  // 하나의 상수로 쓰려면 프리셋 넷을 함께 만족해야 한다 — ECE 순위 합이 가장 낮은 k.
  const rankSum = {};
  K_LIST.forEach(k => { rankSum[k] = 0; });
  for (const key of Object.keys(out.presets)) {
    const byK = out.presets[key].byK;
    K_LIST.slice().sort((a, b) => byK[a].calibrationECE - byK[b].calibrationECE)
      .forEach((k, rank) => { rankSum[k] += rank; });
  }
  out.rankSum = rankSum;
  out.bestSingleK = K_LIST.slice().sort((a, b) => rankSum[a] - rankSum[b])[0];

  fs.writeFileSync(path.join(__dirname, "preset-k-report.json"), JSON.stringify(out, null, 2));
  console.log("\n=== 프리셋 배율 k (엔진 " + FC.version + ", 픽스처 " + fixtures.length + ") ===");
  for (const key of Object.keys(out.presets)) {
    const P = out.presets[key];
    console.log("  " + P.name + " (" + P.selected + "종) 최선 k=" + picks[key] +
      "  ECE " + (P.byK[picks[key]].calibrationECE * 100).toFixed(2) + "%p" +
      "  (k=1.0 일 때 " + (P.byK[K_LIST[0]] ? (P.byK[K_LIST[0]].calibrationECE * 100).toFixed(2) : "–") + "%p)");
  }
  console.log("  단일 상수로 쓴다면 k=" + out.bestSingleK + " (ECE 순위합 " + rankSum[out.bestSingleK] + ")");
  console.log("→ preset-k-report.json 기록됨\n");
}

if (require.main === module) main();
module.exports = { graphFor, coneErr };
