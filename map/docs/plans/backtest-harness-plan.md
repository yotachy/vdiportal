# 백테스트 하네스 구현 계획 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans 으로 태스크 단위 실행. 단계는 체크박스(`- [ ]`).

**Goal:** `forge-core.js` 예측 엔진의 과거 정확도를 walk-forward로 측정하는 node CLI 하네스를 만든다(방향적중률·확률캘리브레이션·콘커버리지·예측MAE·가상수익률 + 베이스라인).

**Architecture:** 유닛테스트와 동일하게 `forge-core.js`(UMD)를 node에서 로드. `metrics.js`(순수 채점) → `backtest.js`(walk-forward 통합·리포트) → `fetch-fixtures.js`(실데이터 수집). 전부 `map/backtest/`, **배포 제외**.

**Tech Stack:** Node ≥18(내장 `fetch`·`node --test`), 바닐라 JS. 외부 의존성 없음.

## Global Constraints

- 모든 산출물은 `map/backtest/` 아래. **정적 배포 대상 아님**(배포는 종전 7파일 + forge-api.php만).
- **lookahead 금지**: `run()`에 넣는 데이터는 항상 `[0..t]` 슬라이스. `t` 이후 값 참조 금지.
- **결정론**: 하네스 코드에서 `Date.now()`·`Math.random()`·argless `new Date()` 미사용. 타임스탬프는 인자/환경변수로 주입.
- **표준 그래프**: `ForgeCore.sampleGraph()` 사용하되 **conviction 전부 0으로 리셋**(앱 seedDefaultStrategy 조건과 일치. sampleGraph는 conviction 내장이라 안 하면 +편향).
- 엔진 호출: `ForgeCore.run(graph, {price, candle}, { futW:H, timeframe:tf })`. 반환 `{prediction:{path,lo,hi,anchor,target,...}, verdict:{regime,score,...}}`.
- 상승확률은 **앱 `aggUpProb`/`_upProb`/`_normCdf`를 그대로 복제**(로그정규 CDF 기반). 임의 근사 금지 — 화면 표시 확률과 캘리브레이션이 일치해야 함.

---

### Task 1: metrics.js — 순수 채점 함수 + 단위테스트

**Files:**
- Create: `map/backtest/metrics.js`
- Test: `map/backtest/metrics.test.js`

**Interfaces:**
- Produces:
  - `upProbFromPrediction(pred) → 0..100`
  - `directionHitRate(records) → {rate,n,bullRate,bullN,bearRate,bearN}`
  - `calibration(records, binW=10) → {ece, curve:[{binLo,binHi,predicted,actual,n}]}`
  - `coneCoverage(records) → {coverage,n}`
  - `priceMAE(records) → {mae,n}`
  - `simulatePnL(records, opts) → {startEquity,finalEquity,totalReturn,winRate,avgWin,avgLoss,maxDrawdown,trades}`
  - `baselines(records, firstPrice, lastPrice) → {alwaysUpHitRate,coinFlip,buyHoldReturn}`
  - Record 형식: `{ t:int, H:int, dir:+1|-1|0, up:0..100, tgt:number, loH:number, hiH:number, base:number, actual:number }`

- [ ] **Step 1: 실패 테스트 작성** — `metrics.test.js`

```js
const test = require("node:test");
const assert = require("node:assert");
const M = require("./metrics.js");

test("directionHitRate: 방향 일치/중립 제외", () => {
  const recs = [
    { dir: 1, base: 100, actual: 110 },  // 상승예측·상승 → hit
    { dir: 1, base: 100, actual: 90 },   // 상승예측·하락 → miss
    { dir: -1, base: 100, actual: 90 },  // 하락예측·하락 → hit
    { dir: 0, base: 100, actual: 200 },  // 중립 → 제외
  ];
  const r = M.directionHitRate(recs);
  assert.strictEqual(r.n, 3);
  assert.ok(Math.abs(r.rate - 2 / 3) < 1e-9, "적중 2/3");
  assert.ok(Math.abs(r.bullRate - 0.5) < 1e-9);
  assert.ok(Math.abs(r.bearRate - 1) < 1e-9);
});

test("coneCoverage: 밴드 포함 비율", () => {
  const recs = [
    { loH: 90, hiH: 110, actual: 100 }, // in
    { loH: 90, hiH: 110, actual: 120 }, // out
  ];
  assert.ok(Math.abs(M.coneCoverage(recs).coverage - 0.5) < 1e-9);
});

test("priceMAE: |예측/실제 − 1| 평균", () => {
  const recs = [{ tgt: 110, actual: 100 }, { tgt: 90, actual: 100 }];
  assert.ok(Math.abs(M.priceMAE(recs).mae - 0.1) < 1e-9);
});

test("calibration: 빈별 예측 vs 실제 + ECE", () => {
  const recs = [
    { up: 65, base: 100, actual: 110 }, // 60-70 빈, 실제 상승
    { up: 62, base: 100, actual: 90 },  // 60-70 빈, 실제 하락
  ];
  const c = M.calibration(recs);
  const b = c.curve.find(x => x.binLo === 60);
  assert.strictEqual(b.n, 2);
  assert.ok(Math.abs(b.actual - 0.5) < 1e-9, "실제 상승률 0.5");
  assert.ok(c.ece >= 0);
});

test("simulatePnL: 롱온리·비중첩·복리", () => {
  const recs = [
    { t: 0, H: 10, up: 70, base: 100, actual: 110 }, // 롱, +10%
    { t: 5, H: 10, up: 80, base: 100, actual: 90 },  // t<nextFree(10) → 스킵
    { t: 12, H: 10, up: 30, base: 100, actual: 90 }, // 롱온리라 플랫(스킵)
    { t: 24, H: 10, up: 65, base: 100, actual: 95 }, // 롱, −5%
  ];
  const p = M.simulatePnL(recs, { threshold: 55, mode: "long", startEquity: 10000 });
  assert.strictEqual(p.trades, 2);
  assert.ok(Math.abs(p.finalEquity - 10000 * 1.10 * 0.95) < 1e-6);
});

test("baselines: 항상상승 적중률·Buy&Hold", () => {
  const recs = [{ base: 100, actual: 110 }, { base: 100, actual: 90 }];
  const b = M.baselines(recs, 100, 130);
  assert.ok(Math.abs(b.alwaysUpHitRate - 0.5) < 1e-9);
  assert.ok(Math.abs(b.buyHoldReturn - 0.3) < 1e-9);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test map/backtest/metrics.test.js`
Expected: FAIL (`Cannot find module './metrics.js'`)

- [ ] **Step 3: metrics.js 구현** (앱 상승확률 공식 그대로 복제)

```js
// map/backtest/metrics.js — 순수 채점 함수(네트워크·엔진 의존 없음)
"use strict";

// ── 앱(forge-app.js)에서 그대로 복제: 화면 상승확률과 캘리브레이션 일치 ──
function _normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
function _upProb(pred, hi, anchor) { if (!(pred > 0 && hi > 0 && anchor > 0)) return 50; const m = Math.log(pred / anchor), sd = Math.log(hi / pred); return Math.round(_normCdf(m / (sd || 1e-6)) * 100); }
function upProbFromPrediction(pred) {
  const path = pred && pred.path; if (!path || !path.length) return null;
  const anchor = (pred.anchor != null && isFinite(pred.anchor)) ? pred.anchor : path[0];
  let s = 0, w = 0;
  for (let k = 0; k < path.length; k++) { const h = k + 1, wt = 1 / Math.sqrt(h); s += _upProb(path[k], pred.hi && pred.hi[k], anchor) * wt; w += wt; }
  return w ? Math.round(s / w) : null;
}

function directionHitRate(records) {
  let hit = 0, n = 0, bH = 0, bN = 0, eH = 0, eN = 0;
  for (const r of records) {
    if (!r.dir) continue;
    const real = Math.sign(r.actual - r.base);
    if (real === 0) continue;
    n++; const ok = (r.dir > 0 ? 1 : -1) === real; if (ok) hit++;
    if (r.dir > 0) { bN++; if (ok) bH++; } else { eN++; if (ok) eH++; }
  }
  return { rate: n ? hit / n : null, n, bullRate: bN ? bH / bN : null, bullN: bN, bearRate: eN ? eH / eN : null, bearN: eN };
}

function calibration(records, binW = 10) {
  const bins = {};
  for (const r of records) { if (r.up == null) continue; const k = Math.min(Math.floor(100 / binW) - 1, Math.floor(r.up / binW)); (bins[k] = bins[k] || []).push(r); }
  const tot = Object.values(bins).reduce((s, a) => s + a.length, 0);
  const curve = []; let ece = 0;
  Object.keys(bins).map(Number).sort((a, b) => a - b).forEach(k => {
    const rs = bins[k], n = rs.length;
    const pred = rs.reduce((s, r) => s + r.up, 0) / n / 100;
    const act = rs.filter(r => r.actual > r.base).length / n;
    curve.push({ binLo: k * binW, binHi: (k + 1) * binW, predicted: pred, actual: act, n });
    ece += (n / tot) * Math.abs(pred - act);
  });
  return { ece, curve };
}

function coneCoverage(records) {
  let cov = 0, n = 0;
  for (const r of records) { if (!isFinite(r.loH) || !isFinite(r.hiH)) continue; n++; if (r.actual >= r.loH && r.actual <= r.hiH) cov++; }
  return { coverage: n ? cov / n : null, n };
}

function priceMAE(records) {
  let s = 0, n = 0;
  for (const r of records) { if (!isFinite(r.tgt) || !(r.actual > 0)) continue; n++; s += Math.abs(r.tgt / r.actual - 1); }
  return { mae: n ? s / n : null, n };
}

// 비중첩 롱온리(기본): up>=threshold 롱 / up<=100-threshold 숏(ls모드만) / 그 외 플랫. t+H 전엔 신규진입 없음.
function simulatePnL(records, opts = {}) {
  const { threshold = 55, mode = "long", startEquity = 10000 } = opts;
  const sorted = records.slice().sort((a, b) => a.t - b.t);
  let eq = startEquity, peak = startEquity, mdd = 0, wins = 0, losses = 0, sumWin = 0, sumLoss = 0, trades = 0, nextFree = -Infinity;
  for (const r of sorted) {
    if (r.t < nextFree) continue;
    let pos = 0;
    if (r.up >= threshold) pos = 1; else if (r.up <= 100 - threshold) pos = (mode === "ls" ? -1 : 0);
    if (!pos) continue;
    const ret = pos * (r.actual / r.base - 1);
    eq *= (1 + ret); trades++; nextFree = r.t + r.H;
    if (ret > 0) { wins++; sumWin += ret; } else { losses++; sumLoss += ret; }
    if (eq > peak) peak = eq; const dd = eq / peak - 1; if (dd < mdd) mdd = dd;
  }
  return { startEquity, finalEquity: eq, totalReturn: eq / startEquity - 1, winRate: trades ? wins / trades : null, avgWin: wins ? sumWin / wins : null, avgLoss: losses ? sumLoss / losses : null, maxDrawdown: mdd, trades };
}

function baselines(records, firstPrice, lastPrice) {
  let up = 0, n = 0;
  for (const r of records) { const real = Math.sign(r.actual - r.base); if (real === 0) continue; n++; if (real > 0) up++; }
  return { alwaysUpHitRate: n ? up / n : null, coinFlip: 0.5, buyHoldReturn: (firstPrice > 0 && lastPrice > 0) ? lastPrice / firstPrice - 1 : null };
}

module.exports = { upProbFromPrediction, directionHitRate, calibration, coneCoverage, priceMAE, simulatePnL, baselines };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test map/backtest/metrics.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add map/backtest/metrics.js map/backtest/metrics.test.js
git commit -m "feat(backtest): metrics.js 순수 채점 함수 + 단위테스트"
```

---

### Task 2: backtest.js — walk-forward 하네스 + 합성 픽스처 스모크 테스트

**Files:**
- Create: `map/backtest/backtest.js`
- Test: `map/backtest/backtest.test.js`

**Interfaces:**
- Consumes: `metrics.js`(Task 1), `../forge-core.js`(`run`, `sampleGraph`)
- Produces:
  - `standardGraph() → graph`(sampleGraph + conviction 0)
  - `horizonForTF(tf) → int`(일 60·주 52·월 12·기타 24)
  - `walkForward(fixture) → { records, firstPrice, lastPrice }`
  - `runBacktest(fixtures, {generatedAt}) → report객체`(§8 형식)
  - CLI: `node map/backtest/backtest.js` → `fixtures/*.json` 로드 → 콘솔 요약 + `backtest-report.json` 기록
  - `makeSyntheticFixture(symbol, tf, {n, drift, vol}) → fixture`(테스트/오프라인용, Math.random 미사용 — 사인 합성)

- [ ] **Step 1: 실패 테스트 작성** — `backtest.test.js`

```js
const test = require("node:test");
const assert = require("node:assert");
const B = require("./backtest.js");

test("standardGraph: conviction 전부 0", () => {
  const g = B.standardGraph();
  const conv = (g.nodes || []).reduce((s, n) => s + Math.abs(n.conviction || 0), 0);
  assert.strictEqual(conv, 0, "sampleGraph conviction이 0으로 리셋되어야");
});

test("horizonForTF: TF별 지평", () => {
  assert.strictEqual(B.horizonForTF("1day"), 60);
  assert.strictEqual(B.horizonForTF("1week"), 52);
  assert.strictEqual(B.horizonForTF("1month"), 12);
});

test("walkForward: 합성 상승 데이터에서 lookahead 없이 레코드 생성", () => {
  const fx = B.makeSyntheticFixture("SYN", "1day", { n: 320, drift: 0.002, vol: 0.01 });
  const { records, firstPrice, lastPrice } = B.walkForward(fx);
  assert.ok(records.length > 0, "레코드 생성");
  assert.ok(records.every(r => r.actual != null && r.base != null && r.t >= 200), "워밍업 이후·실제값 존재");
  assert.ok(lastPrice > firstPrice, "상승 합성 데이터");
});

test("runBacktest: 합성 픽스처로 리포트 구조 산출", () => {
  const fx = [B.makeSyntheticFixture("SYN", "1day", { n: 320, drift: 0.002, vol: 0.01 })];
  const rep = B.runBacktest(fx, { generatedAt: "2026-07-07T00:00:00Z" });
  assert.ok(rep.overall.directionHitRate != null);
  assert.ok(rep.overall.pnl.finalEquity > 0);
  assert.ok(Array.isArray(rep.calibrationCurve));
  assert.ok(rep.overall.baselineAlwaysUp != null);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test map/backtest/backtest.test.js`
Expected: FAIL (`Cannot find module './backtest.js'`)

- [ ] **Step 3: backtest.js 구현**

```js
// map/backtest/backtest.js — walk-forward 하네스
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test map/backtest/backtest.test.js`
Expected: PASS (4 tests). (엔진 로드·walk-forward·리포트 구조 검증)

- [ ] **Step 5: 커밋**

```bash
git add map/backtest/backtest.js map/backtest/backtest.test.js
git commit -m "feat(backtest): walk-forward 하네스 + 합성 픽스처 스모크 테스트"
```

---

### Task 3: fetch-fixtures.js — 실데이터 픽스처 수집 + 실측 리포트

**Files:**
- Create: `map/backtest/fetch-fixtures.js`
- Create(생성물): `map/backtest/fixtures/*.json`, `map/backtest/backtest-report.json`
- Read(참조): `map/forge-app.js`의 `loadTicker`(OHLC fetch URL·응답 파싱 형식 확인용), `map/forge-api.php`(엔드포인트 파라미터)

**Interfaces:**
- Consumes: 배포된 `forge-api.php`(OHLC 프록시)
- Produces: `fixtures/{SYMBOL}-{tf}.json` (`{symbol, tf, candle:[{o,h,l,c,v}]}`)

- [ ] **Step 1: loadTicker의 fetch 규약 확인**

`map/forge-app.js`의 `loadTicker`(≈1731행)와 `map/forge-api.php`를 읽어 **OHLC 요청 URL 형식과 응답 JSON 구조**를 파악한다(어떤 파라미터로 티커·주기·개수를 넘기고, 응답의 캔들 필드명이 무엇인지). 이 형식을 `fetch-fixtures.js`가 그대로 미러링한다.

- [ ] **Step 2: fetch-fixtures.js 작성** — 유니버스 상수 + fetch + 저장

유니버스(§4): `[["NVDA","1day"],["AAPL","1day"],["BTC/USD","1day"],["USD/KRW","1week"],["005930","1day"]]` 등 6~10개(각 3~5년치 요청). 각 심볼·주기에 대해 Step 1에서 확인한 URL로 `fetch`(node18 내장) → 응답을 `{o,h,l,c,v}` 캔들 배열로 변환 → `fixtures/{SYMBOL}-{tf}.json` 저장(슬래시는 파일명에서 `-`로). API 베이스는 상수(`https://parksvc.mycafe24.com/map/forge-api.php`) 또는 인자.

```js
// 골격(Step 1에서 확인한 실제 파라미터·필드로 채운다)
"use strict";
const fs = require("fs"), path = require("path");
const API = process.env.BT_API || "https://parksvc.mycafe24.com/map/forge-api.php";
const UNIVERSE = [["NVDA","1day"],["AAPL","1day"],["BTC/USD","1day"],["USD/KRW","1week"],["005930","1day"]];
async function fetchOne(symbol, tf) {
  const url = /* Step 1에서 확인한 URL 형식 (loadTicker와 동일 파라미터) */;
  const res = await fetch(url); const j = await res.json();
  const candle = /* j의 캔들 배열 → [{o,h,l,c,v}] 매핑 (loadTicker 파싱과 동일) */;
  return { symbol, tf, candle };
}
(async () => {
  fs.mkdirSync(path.join(__dirname, "fixtures"), { recursive: true });
  for (const [sym, tf] of UNIVERSE) {
    try {
      const fx = await fetchOne(sym, tf);
      if (!fx.candle || fx.candle.length < 260) { console.warn("건너뜀(데이터 부족):", sym, tf); continue; }
      const name = sym.replace(/[\/\\]/g, "-") + "-" + tf + ".json";
      fs.writeFileSync(path.join(__dirname, "fixtures", name), JSON.stringify(fx));
      console.log("저장:", name, fx.candle.length, "봉");
    } catch (e) { console.warn("실패:", sym, tf, e.message); }
  }
})();
```

- [ ] **Step 3: 픽스처 수집 실행**

Run: `node map/backtest/fetch-fixtures.js`
Expected: `fixtures/*.json` 다수 생성(각 260봉↑). 네트워크/일부 심볼 실패는 경고 후 계속(치명 아님).
검증: `ls map/backtest/fixtures/` 로 파일·크기 확인.

- [ ] **Step 4: 실측 백테스트 실행**

Run: `BT_STAMP=2026-07-07T00:00:00Z node map/backtest/backtest.js`
Expected: 콘솔 요약(엔진 vs 베이스라인) + `backtest-report.json` 생성. **방향 적중률이 "항상상승" 베이스라인을 유의미하게 상회하는지**, 콘 커버리지가 ~68% 근처인지, ECE가 낮은지 확인(엔진 품질 진단 — 낮으면 후속 튜닝 대상).

- [ ] **Step 5: 커밋** (픽스처는 재현성 위해 커밋. 배포엔 미포함)

```bash
git add map/backtest/fetch-fixtures.js map/backtest/fixtures map/backtest/backtest-report.json
git commit -m "feat(backtest): 실데이터 픽스처 수집 + 실측 리포트"
```

---

## Self-Review (계획 자체 점검)

1. **Spec 커버리지**: §3 파일 5종 → Task1(metrics·test) Task2(backtest·test) Task3(fetch·fixtures·report) 전부 매핑. §5 walk-forward → Task2 walkForward. §6 표준그래프 → Task2 standardGraph. §7 지표 5종 → Task1 함수 5종 + Task2 통합. §7-6 베이스라인 → baselines + 리포트 병기. §8 출력 → main + report JSON.
2. **플레이스홀더**: Task3 Step2의 URL/파싱만 "Step1에서 확인해 채움"으로 남김 — forge-api.php 실제 응답 형식이 필요해 의도적. 나머지 전부 완성 코드.
3. **타입 정합**: record 형식(`{t,H,dir,up,tgt,loH,hiH,base,actual}`)이 Task1 정의 ↔ Task2 생성 ↔ Task1 소비에서 일치. `simulatePnL`은 `t,H,up,base,actual` 사용(정합).
4. **결정론**: 하네스·합성픽스처 Math.random 미사용. 스탬프 `BT_STAMP` 주입.
5. **위험**: Task3만 네트워크 의존(1회성). Task1·2는 완전 오프라인·결정론이라 하네스 정확성은 실데이터 없이도 검증됨.
