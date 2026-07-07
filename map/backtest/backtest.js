// backtest/backtest.js — walk-forward 하네스
"use strict";
const fs = require("fs");
const path = require("path");
const FC = require("../forge-core.js");
const M = require("./metrics.js");

const WARMUP = 200;
const LOOKBACK = 600;   // 각 시점 엔진 입력 창 상한(최근 N봉만) — 실사용 부합 + 속도(전체 5000봉 슬라이스 방지)
function horizonForTF(tf) { const s = tf || ""; if (/월|month/.test(s)) return 12; if (/주|week/.test(s)) return 52; if (/일|day/.test(s)) return 60; return 24; }
function strideForTF(tf) { return /일|day/.test(tf || "") ? 10 : 3; }

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
    const s0 = Math.max(0, t + 1 - LOOKBACK);   // 최근 LOOKBACK봉 창(속도)
    const past = { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) };   // [s0..t] — lookahead 차단(t 이후 없음)
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
  for (const fx of fixtures) {
    const _t0 = Date.now();
    const { records, firstPrice, lastPrice } = walkForward(fx);
    if (opts.progress !== false) console.error("  " + fx.symbol + " " + fx.tf + " → " + records.length + "시점 (" + ((Date.now() - _t0) / 1000).toFixed(0) + "s)");
    if (!records.length) continue;
    const dir = M.directionHitRate(records), cov = M.coneCoverage(records), mae = M.priceMAE(records);
    const bl = M.baselines(records, firstPrice, lastPrice), pnl = M.simulatePnL(records, {});
    perFixture.push({ symbol: fx.symbol, tf: fx.tf, points: records.length, directionHitRate: dir.rate, coneCoverage: cov.coverage, priceMAE: mae.mae, baselineAlwaysUp: bl.alwaysUpHitRate, pnl, buyHoldReturn: bl.buyHoldReturn });
    allRecords.push(...records);
  }
  const dirAll = M.directionHitRate(allRecords), covAll = M.coneCoverage(allRecords), maeAll = M.priceMAE(allRecords);
  const calAll = M.calibration(allRecords), blAll = M.baselines(allRecords);
  const pnl = M.aggregatePnL(perFixture);   // 등가중 집계(계좌 순차복리 금지 — 정직)
  return {
    generatedAt: opts.generatedAt || null,
    universe: perFixture.map(p => ({ symbol: p.symbol, tf: p.tf, points: p.points })),
    overall: {
      directionHitRate: dirAll.rate, baselineAlwaysUp: blAll.alwaysUpHitRate, coinFlip: 0.5,
      bullHitRate: dirAll.bullRate, bearHitRate: dirAll.bearRate,
      calibrationECE: calAll.ece, coneCoverage: covAll.coverage, priceMAE: maeAll.mae, pnl,
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
  const p = o.pnl;
  console.log("가상수익(등가중, 종목별 $" + p.startEquity + " 독립):");
  console.log("  평균 수익률 : " + _pct(p.avgReturn) + " (중앙값 " + _pct(p.medianReturn) + ")  vs Buy&Hold 평균 " + _pct(p.avgBuyHold));
  console.log("  B&H 이긴 종목: " + p.beatBuyHold + "/" + p.nFixtures + "   승률 " + _pct(p.winRate) + "  평균MDD " + _pct(p.avgMDD) + "  거래 " + p.trades);
  fs.writeFileSync(path.join(__dirname, "backtest-report.json"), JSON.stringify(rep, null, 2));
  console.log("→ backtest-report.json 기록됨\n");
}

if (require.main === module) main();
module.exports = { standardGraph, horizonForTF, strideForTF, walkForward, runBacktest, makeSyntheticFixture };
