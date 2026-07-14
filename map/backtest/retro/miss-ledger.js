// map/backtest/retro/miss-ledger.js — 오류 원장 수집(엔진 1패스 + 지표 drop-ablation)
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../../forge-core.js");
const BT = require("../backtest.js");
const M = require("../metrics.js");
const { regimeTags } = require("./regime.js");
const { listIndicatorNodes, ablateGraph } = require("./graph-ablate.js");

const CACHE = path.join(__dirname, "retro-records.json");
const WARMUP = 280, STRIDE = 20, LOOKBACK = 600, H = 60, H2 = 20;
// v1 ablation 화이트리스트(사용자가 주로 튜닝하는 핵심 Lv1+Lv2). RETRO_ALL_INDS=1이면 전 지표.
const CORE = new Set(["ma", "rsi", "bollinger", "macd", "volume", "trend", "adx", "stochastic", "ichimoku", "fib"]);

function ablationTargets(graph) {
  const inds = listIndicatorNodes(graph);
  if (process.env.RETRO_ALL_INDS === "1") return inds;
  return inds.filter(n => CORE.has(n.blockType));
}

function collectFixture(fixture, opts = {}) {
  const stride = opts.stride || STRIDE;
  const candle = fixture.candle, price = candle.map(c => c.c), N = price.length;
  if (N < WARMUP + H + 10) return [];
  const graph = BT.standardGraph();
  const targets = ablationTargets(graph);
  // ablation 그래프 사전 생성(노드당 1회) — t 루프에서 재사용
  const abGraphs = targets.map(tg => ({ id: tg.id, blockType: tg.blockType, g: ablateGraph(graph, tg.id) }));
  const out = [];
  for (let t = WARMUP; t <= N - H - 1; t += stride) {
    const s0 = Math.max(0, t + 1 - LOOKBACK);
    const past = { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) };
    let base; try { base = FC.run(graph, past, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
    if (!base.prediction || !base.prediction.path) continue;
    const ab = {};
    for (const ag of abGraphs) {
      try { const r = FC.run(ag.g, past, { futW: H, timeframe: "1day" }); ab[ag.id] = { score: (r.verdict && r.verdict.score) || 0 }; }
      catch (e) { /* 이 지표 ablation 스킵 */ }
    }
    out.push({
      sym: fixture.symbol, t,
      base: price[t], a20: price[t + H2], a60: price[t + H],
      score: (base.verdict && base.verdict.score) || 0,
      up: M.upProbFromPrediction(base.prediction),
      regime: regimeTags(price, t),
      ab,
    });
  }
  return out;
}

function collectAll() {
  const dir = path.join(__dirname, "..", "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const out = [];
  for (const f of files) {
    const t0 = Date.now();
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const recs = collectFixture(fx);
    out.push(...recs);
    console.error("  " + fx.symbol + " → +" + recs.length + " (누적 " + out.length + ", " + ((Date.now() - t0) / 1000).toFixed(0) + "s)");
  }
  fs.writeFileSync(CACHE, JSON.stringify(out));
  console.error("→ retro-records.json 기록 (" + out.length + " 레코드)");
  return out;
}

if (require.main === module) {
  if (fs.existsSync(CACHE) && !process.argv.includes("--recollect")) {
    console.error("캐시 존재: retro-records.json (재수집: --recollect)");
  } else {
    console.error("엔진 ablation 1패스 수집 시작 — 지표수×시점 (수십 분 소요 가능)…");
    collectAll();
  }
}

module.exports = { collectFixture, collectAll, CACHE };
