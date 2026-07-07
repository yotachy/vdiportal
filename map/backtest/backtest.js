// backtest/backtest.js — walk-forward 하네스
"use strict";
const fs = require("fs");
const path = require("path");
const FC = require("../forge-core.js");
const M = require("./metrics.js");

const WARMUP = 200;
function horizonForTF(tf) { const s = tf || ""; if (/월|month/.test(s)) return 12; if (/주|week/.test(s)) return 52; if (/일|day/.test(s)) return 60; return 24; }
function strideForTF(tf) { return /일|day/.test(tf || "") ? 5 : 2; }

function standardGraph() { const g = FC.sampleGraph(); (g.nodes || []).forEach(n => { if (n.conviction) n.conviction = 0; }); return g; }

// 결정론적 합성 픽스처(Math.random 미사용 — 사인 합성). 테스트·오프라인용.
function makeSyntheticFixture(symbol, tf, opts = {}) {
  const { n = 320, drift = 0.001, vol = 0.01 } = opts;
  const candle = []; let p = 100;
  for (let i = 0; i < n; i++) {
    const wig = Math.sin(i * 0.7) * vol + Math.sin(i * 0.13) * vol * 0.7 + Math.cos(i * 0.31) * vol * 0.5;
    const op = p; p = Math.max(0.01, p * (1 + drift + wig));
    candle.push({ o: op, h: Math.max(op, p) * (1 + vol * 0.4), l: Math.min(op, p) * (1 - vol * 0.4), c: p, v: 1e6 });
  }
  return { symbol, tf, candle };
}

function walkForward(fixture) {
  const candle = fixture.candle, price = candle.map(c => c.c), N = price.length;
  const tf = fixture.tf, H = horizonForTF(tf), STRIDE = strideForTF(tf);
  const graph = standardGraph();
  const records = [];
  for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
    const past = { price: price.slice(0, t + 1), candle: candle.slice(0, t + 1) };   // [0..t] — lookahead 차단
    let r; try { r = FC.run(graph, past, { futW: H, timeframe: tf }); } catch (e) { continue; }
    const pred = r.prediction, v = r.verdict; if (!pred || !pred.path) continue;
    records.push({
      t, H,
      dir: Math.sign(v.score || 0),
      up: M.upProbFromPrediction(pred),
      tgt: pred.target,
      loH: pred.lo[H - 1], hiH: pred.hi[H - 1],
      base: price[t], actual: price[t + H],
    });
  }
  return { records, firstPrice: price[WARMUP], lastPrice: price[N - 1] };
}

function runBacktest(fixtures, opts = {}) {
  const perFixture = [], allRecords = [];
  let bhSum = 0, bhN = 0, pnlSum = 0, pnlN = 0;
  for (const fx of fixtures) {
    const { records, firstPrice, lastPrice } = walkForward(fx);
    if (!records.length) continue;
    const dir = M.directionHitRate(records), cov = M.coneCoverage(records), mae = M.priceMAE(records);
    const bl = M.baselines(records, firstPrice, lastPrice), pnl = M.simulatePnL(records, {});
    perFixture.push({ symbol: fx.symbol, tf: fx.tf, points: records.length, directionHitRate: dir.rate, coneCoverage: cov.coverage, priceMAE: mae.mae, baselineAlwaysUp: bl.alwaysUpHitRate, pnl, buyHoldReturn: bl.buyHoldReturn });
    allRecords.push(...records);
    if (bl.buyHoldReturn != null) { bhSum += bl.buyHoldReturn; bhN++; }
    pnlSum += pnl.totalReturn; pnlN++;
  }
  const dirAll = M.directionHitRate(allRecords), covAll = M.coneCoverage(allRecords), maeAll = M.priceMAE(allRecords);
  const calAll = M.calibration(allRecords), blAll = M.baselines(allRecords);
  const pnlAll = M.simulatePnL(allRecords, {});   // 풀드(전 종목 시점 통합) 자본곡선
  return {
    generatedAt: opts.generatedAt || null,
    universe: perFixture.map(p => ({ symbol: p.symbol, tf: p.tf, points: p.points })),
    overall: {
      directionHitRate: dirAll.rate, baselineAlwaysUp: blAll.alwaysUpHitRate, coinFlip: 0.5,
      bullHitRate: dirAll.bullRate, bearHitRate: dirAll.bearRate,
      calibrationECE: calAll.ece, coneCoverage: covAll.coverage, priceMAE: maeAll.mae,
      pnl: { ...pnlAll, avgFixtureReturn: pnlN ? pnlSum / pnlN : null, buyHoldReturn: bhN ? bhSum / bhN : null },
    },
    perFixture, calibrationCurve: calAll.curve,
  };
}

function _pct(x) { return x == null ? "–" : (x * 100).toFixed(1) + "%"; }
function main() {
  const dir = path.join(__dirname, "fixtures");
  let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch (e) {}
  if (!files.length) { console.error("픽스처 없음 — 먼저 `node backtest/fetch-fixtures.js` 실행"); process.exit(1); }
  const fixtures = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const generatedAt = process.env.BT_STAMP || null;   // 결정론: 스탬프는 환경변수로 주입
  const rep = runBacktest(fixtures, { generatedAt });
  const o = rep.overall;
  console.log("\n=== 스쿱포지 백테스트 요약 (" + rep.universe.length + " 픽스처) ===");
  console.log("방향 적중률   : " + _pct(o.directionHitRate) + "  (항상상승 " + _pct(o.baselineAlwaysUp) + " · 동전 50.0%)");
  console.log("  강세/약세   : " + _pct(o.bullHitRate) + " / " + _pct(o.bearHitRate));
  console.log("확률 ECE      : " + (o.calibrationECE * 100).toFixed(1) + "%p (낮을수록 정직)");
  console.log("콘 커버리지   : " + _pct(o.coneCoverage) + " (목표 ~68%)");
  console.log("예측가 MAE    : " + _pct(o.priceMAE));
  console.log("가상수익(풀드): $" + o.pnl.startEquity + " → $" + o.pnl.finalEquity.toFixed(0) + " (" + _pct(o.pnl.totalReturn) + ", 승률 " + _pct(o.pnl.winRate) + ", MDD " + _pct(o.pnl.maxDrawdown) + ", 거래 " + o.pnl.trades + ")");
  console.log("  vs Buy&Hold : " + _pct(o.pnl.buyHoldReturn));
  fs.writeFileSync(path.join(__dirname, "backtest-report.json"), JSON.stringify(rep, null, 2));
  console.log("→ backtest-report.json 기록됨\n");
}

if (require.main === module) main();
module.exports = { standardGraph, horizonForTF, strideForTF, walkForward, runBacktest, makeSyntheticFixture };
