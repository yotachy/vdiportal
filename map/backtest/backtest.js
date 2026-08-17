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

// 측정 그래프가 읽는 지표 종수. 전체 배터리(FC.indicatorCount)와 다르다 — 이 숫자를 리포트에
// 박아두지 않으면 "58%는 몇 개짜리로 잰 값인가"를 나중에 아무도 답할 수 없다.
const NON_INDICATOR = new Set(["ticker", "price", "combine", "predict"]);
function countIndicators(graph) {
  return (graph.nodes || []).filter(n => n.blockType && !NON_INDICATOR.has(n.blockType)).length;
}

// 측정 대상 종목 집합의 지문. 엔진 버전만 찍으면 "픽스처가 늘었는데 재측정을 안 한" 경우를
// 못 잡는다 — 실제로 7월 리포트는 86시리즈였고 그 뒤 한 종목이 늘었는데 숫자는 그대로 나갔다.
// 파일 목록 자체를 해싱하므로 종목이 늘든 줄든 바뀌든 잡힌다.
function fixturesFingerprint(dir) {
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort(); } catch (e) { return null; }
  if (!files.length) return null;
  return files.length + ":" + require("crypto").createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
}

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

// graph 를 받으면 그것으로 잰다(티어별 측정). 기본값은 표준 그래프라 기존 호출부는 그대로다.
function walkForward(fixture, graphIn, runOpts) {
  const candle = fixture.candle, price = candle.map(c => c.c), N = price.length;
  const tf = fixture.tf, H = horizonForTF(tf), STRIDE = strideForTF(tf);
  const graph = graphIn || standardGraph();
  const records = [];
  for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
    const s0 = Math.max(0, t + 1 - LOOKBACK);   // 최근 LOOKBACK봉 창(속도)
    const past = { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) };   // [s0..t] — lookahead 차단(t 이후 없음)
    // runOpts 는 엔진에 그대로 얹힌다(driftWeights 등). 없으면 예전과 완전히 같은 호출이다 —
    // 티어 측정과 가중치 측정이 같은 하네스를 써야 두 숫자를 나란히 놓을 수 있다.
    const ro = { futW: H, timeframe: tf };
    if (runOpts) for (const k in runOpts) ro[k] = runOpts[k];
    let r; try { r = FC.run(graph, past, ro); } catch (e) { continue; }
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

function classifyRegime(buyHoldReturn) { return buyHoldReturn == null ? "side" : buyHoldReturn > 0.3 ? "bull" : buyHoldReturn < -0.1 ? "bear" : "side"; }

function runBacktest(fixtures, opts = {}) {
  const perFixture = [], allRecords = [], byRegime = { bull: [], bear: [], side: [] }, byTf = {};
  const graph = opts.graph || standardGraph();
  for (const fx of fixtures) {
    const _t0 = Date.now();
    const { records, firstPrice, lastPrice } = walkForward(fx, graph, opts.runOpts);
    if (opts.progress !== false) console.error("  " + fx.symbol + " " + fx.tf + " → " + records.length + "시점 (" + ((Date.now() - _t0) / 1000).toFixed(0) + "s)");
    if (!records.length) continue;
    const dir = M.directionHitRate(records), cov = M.coneCoverage(records), mae = M.priceMAE(records);
    const bl = M.baselines(records, firstPrice, lastPrice), pnl = M.simulatePnL(records, {});
    const regime = classifyRegime(bl.buyHoldReturn);
    perFixture.push({ symbol: fx.symbol, tf: fx.tf, from: fx.from || "", to: fx.to || "", points: records.length, regime, directionHitRate: dir.rate, coneCoverage: cov.coverage, priceMAE: mae.mae, baselineAlwaysUp: bl.alwaysUpHitRate, pnl, buyHoldReturn: bl.buyHoldReturn });
    allRecords.push(...records); byRegime[regime].push(...records);
    (byTf[fx.tf] = byTf[fx.tf] || []).push(...records);
  }
  const dirAll = M.directionHitRate(allRecords), covAll = M.coneCoverage(allRecords), maeAll = M.priceMAE(allRecords);
  const calAll = M.calibration(allRecords), blAll = M.baselines(allRecords);
  const pnl = M.aggregatePnL(perFixture);   // 등가중 집계(계좌 순차복리 금지 — 정직)
  // 국면별 방향 성능(약세편향이 진짜인지: 하락·횡보 국면서도 베이스라인 이기나?)
  const regimes = {};
  for (const k of ["bull", "bear", "side"]) { const rec = byRegime[k]; if (!rec.length) continue; const d = M.directionHitRate(rec), b = M.baselines(rec); regimes[k] = { n: rec.length, directionHitRate: d.rate, baselineAlwaysUp: b.alwaysUpHitRate, bullHitRate: d.bullRate, bearHitRate: d.bearRate, lift: (d.rate != null && b.alwaysUpHitRate != null) ? d.rate - b.alwaysUpHitRate : null }; }
  // 일/주/월 타임프레임별 방향 성능
  const timeframes = {};
  for (const k of Object.keys(byTf)) { const rec = byTf[k]; if (!rec.length) continue; const d = M.directionHitRate(rec), b = M.baselines(rec), c = M.coneCoverage(rec); timeframes[k] = { n: rec.length, fixtures: perFixture.filter(f => f.tf === k).length, directionHitRate: d.rate, baselineAlwaysUp: b.alwaysUpHitRate, coneCoverage: c.coverage, lift: (d.rate != null && b.alwaysUpHitRate != null) ? d.rate - b.alwaysUpHitRate : null }; }
  return {
    generatedAt: opts.generatedAt || null,
    // 이 리포트를 만든 엔진. 앱이 화면에 띄우는 유일한 실측치라, 엔진이 올라간 뒤 재측정을 잊으면
    // 옛 숫자가 오늘의 사실로 계속 나간다. 스탬프가 있어야 sync 가 그걸 잡는다.
    engineVersion: FC.version,
    indicatorCount: FC.indicatorCount,          // 엔진의 전체 지표 배터리
    graphIndicators: countIndicators(graph),    // 그중 이 측정이 실제로 읽은 종수
    fixtures: opts.fixturesFingerprint || null, // 어떤 종목 집합으로 쟀는지
    universe: perFixture.map(p => ({ symbol: p.symbol, tf: p.tf, regime: p.regime, points: p.points })),
    overall: {
      directionHitRate: dirAll.rate, baselineAlwaysUp: blAll.alwaysUpHitRate, coinFlip: 0.5,
      bullHitRate: dirAll.bullRate, bearHitRate: dirAll.bearRate,
      calibrationECE: calAll.ece, coneCoverage: covAll.coverage, priceMAE: maeAll.mae, pnl,
    },
    byRegime: regimes, byTimeframe: timeframes, perFixture, calibrationCurve: calAll.curve,
  };
}

function _pct(x) { return x == null ? "–" : (x * 100).toFixed(1) + "%"; }
function main() {
  const dir = path.join(__dirname, "fixtures");
  let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch (e) {}
  if (!files.length) { console.error("픽스처 없음 — 먼저 `node backtest/fetch-fixtures.js` 실행"); process.exit(1); }
  const fixtures = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const generatedAt = process.env.BT_STAMP || null;   // 결정론: 스탬프는 환경변수로 주입
  const rep = runBacktest(fixtures, { generatedAt, fixturesFingerprint: fixturesFingerprint(dir) });
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
  console.log("\n국면별 방향 적중 (약세편향 진위 판별 — 하락·횡보서도 베이스라인 이기나?):");
  const RG = { bull: "강세장", bear: "하락장", side: "횡보장" };
  for (const k of ["bull", "bear", "side"]) { const g = rep.byRegime[k]; if (!g) continue; console.log("  " + RG[k] + " (n=" + g.n + ") : 방향 " + _pct(g.directionHitRate) + " vs 항상상승 " + _pct(g.baselineAlwaysUp) + "  → 초과 " + (g.lift >= 0 ? "+" : "") + (g.lift * 100).toFixed(1) + "%p" + (g.lift > 0 ? " ✅" : " 🔴") + "  (강세콜 " + _pct(g.bullHitRate) + "/약세콜 " + _pct(g.bearHitRate) + ")"); }
  console.log("\n일/주/월 타임프레임별 방향 적중:");
  const TF = { "1day": "일봉", "1week": "주봉", "1month": "월봉" };
  for (const k of ["1day", "1week", "1month"]) { const g = rep.byTimeframe[k]; if (!g) continue; console.log("  " + (TF[k] || k) + " (" + g.fixtures + "종·n=" + g.n + ") : 방향 " + _pct(g.directionHitRate) + " vs 항상상승 " + _pct(g.baselineAlwaysUp) + "  → 초과 " + (g.lift >= 0 ? "+" : "") + (g.lift * 100).toFixed(1) + "%p  콘커버 " + _pct(g.coneCoverage)); }
  const json = JSON.stringify(rep, null, 2);
  fs.writeFileSync(path.join(__dirname, "backtest-report.json"), json);
  // 모바일 sync 가 읽는 자리. 손으로 복사하던 것을 여기서 같이 쓴다 — 복사를 잊으면 두 벌이 갈린다.
  fs.writeFileSync(path.join(__dirname, "..", "forge-backtest-report.json"), json);
  console.log("→ backtest-report.json · forge-backtest-report.json 기록됨 (엔진 " + rep.engineVersion +
              " · 측정 지표 " + rep.graphIndicators + "/" + rep.indicatorCount + "종)\n");
}

if (require.main === module) main();
module.exports = { standardGraph, horizonForTF, strideForTF, walkForward, runBacktest, makeSyntheticFixture, fixturesFingerprint };
