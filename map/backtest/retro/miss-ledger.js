// map/backtest/retro/miss-ledger.js — 오류 원장 수집(엔진 1패스 + 지표 drop-ablation)
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../../forge-core.js");
const BT = require("../backtest.js");
const M = require("../metrics.js");
const { regimeTags } = require("./regime.js");
const { listIndicatorNodes, ablateGraph, addIndicatorNode } = require("./graph-ablate.js");
const { ABSENT, ABSENT_DEFAULTS } = require("./add-defs.js");

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
  const dropGraphs = ablationTargets(graph).map(tg => ({ id: tg.id, g: ablateGraph(graph, tg.id) }));
  const addGraphs = ABSENT.map(bt => ({ bt, g: addIndicatorNode(graph, bt, ABSENT_DEFAULTS[bt]) }));
  const upOf = r => M.upProbFromPrediction(r.prediction);
  const out = [];
  for (let t = WARMUP; t <= N - H - 1; t += stride) {
    const s0 = Math.max(0, t + 1 - LOOKBACK);
    const past = { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) };
    let base; try { base = FC.run(graph, past, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
    if (!base.prediction || !base.prediction.path) continue;
    const ab = {};
    for (const ag of dropGraphs) {
      try { ab[ag.id] = { up: upOf(FC.run(ag.g, past, { futW: H, timeframe: "1day" })) }; } catch (e) {}
    }
    const addAb = {};
    for (const ag of addGraphs) {
      try { addAb[ag.bt] = { up: upOf(FC.run(ag.g, past, { futW: H, timeframe: "1day" })) }; } catch (e) {}
    }
    out.push({
      sym: fixture.symbol, t,
      base: price[t], a20: price[t + H2], a60: price[t + H],
      up: upOf(base),
      regime: regimeTags(price, t),
      ab, addAb,
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
    console.error("엔진 drop+add ablation 1패스 수집 시작 — 지표수×시점 (~3h 소요 가능)…");
    collectAll();
  }
}

module.exports = { collectFixture, collectAll, CACHE };
