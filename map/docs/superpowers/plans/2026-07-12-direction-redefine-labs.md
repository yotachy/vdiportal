# 방향 예측 재정의 3트랙 랩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방향 예측을 베이스레이트 ~50% 질문(상대 방향·초과 방향)으로 재정의한 랩 2종 + 6축 스태킹 절대방향 재도전 랩 1종 + Brier 분해 채점 확장을 구현·실행하고, 사전 등록된 관문으로 정직하게 판정한다.

**Architecture:** 기존 `map/backtest/` 하네스 규약(결정론·lookahead 금지·배포 제외)에 랩 3개를 추가한다. 공통 피처/로지스틱 코드는 `feat-lib.js`로 공유(DRY), Brier/Murphy 분해는 `metrics.js`에 추가. 엔진(`forge-core.js`)은 이 계획에서 **수정하지 않는다** — 관문 통과분의 엔진 통합은 결과 확인 후 별도 계획.

**Tech Stack:** Node.js(내장 `node --test`), 순수 JS(외부 라이브러리 금지), 기존 fixtures JSON.

## Global Constraints

- 결정론: 결과 산출 경로에서 `Math.random`·`Date.now`·인자 없는 `new Date` 금지(진행 로그의 소요시간 표기만 backtest.js 선례대로 허용). 로지스틱은 zero-init 배치 GD(랜덤 없음).
- lookahead 금지: 시점 t의 피처는 `[..t]`만 사용, 타깃만 `t+H` 참조.
- `map/backtest/`는 배포 제외 디렉토리 — cafe24 업로드 금지.
- 채택 관문(사전 등록, spec `2026-07-12-direction-redefine-design.md`): OOS에서 모든 공정 베이스라인 +1.5pp↑ · 전/후반 분할 양쪽 양수 · LOSO 유지. Track 3은 (a) 항상상승 +1.5pp↑ 또는 (b) ECE ≤2.5% 유지 + resolution 유의미 증가.
- 관문 미달은 기각으로 결과 문서에 기록(과장 금지).
- 실데이터 랩 실행 결과 수치는 콘솔 출력을 결과 문서에 그대로 옮긴다(반올림 외 가공 금지).

---

### Task 1: metrics.js Brier + Murphy 분해 + BSS

**Files:**
- Modify: `map/backtest/metrics.js` (마지막 함수 `baselines` 뒤, `module.exports` 앞에 추가)
- Test: `map/backtest/metrics.test.js` (기존 파일 끝에 테스트 추가)

**Interfaces:**
- Produces: `brierDecomp(pairs, binW?)` — `pairs=[{p:0..1, y:0|1}]` → `{brier, reliability, resolution, uncertainty, bss, n, baseRate}`. `brier(records)` — 하네스 record(`{up:0..100, actual, base}`) 래퍼. 이후 모든 랩이 `brierDecomp`를 소비.

- [ ] **Step 1: 실패 테스트 작성** — `metrics.test.js` 끝에 추가:

```js
test("brierDecomp: 완벽 예측 → BS 0 · BSS 1", () => {
  const pairs = [...Array(100)].map((_, i) => ({ p: i % 2, y: i % 2 }));
  const b = M.brierDecomp(pairs);
  assert.ok(b.brier < 1e-12); assert.ok(Math.abs(b.bss - 1) < 1e-9);
});
test("brierDecomp: 베이스레이트 상수 예측 → resolution 0 · BSS 0", () => {
  const pairs = [...Array(100)].map((_, i) => ({ p: 0.5, y: i % 2 }));
  const b = M.brierDecomp(pairs);
  assert.ok(b.resolution < 1e-12); assert.ok(Math.abs(b.bss) < 1e-9);
  assert.ok(Math.abs(b.uncertainty - 0.25) < 1e-9);
});
test("brierDecomp: Murphy 항등식 BS = REL − RES + UNC (빈 내 상수 예측)", () => {
  const pairs = [];
  for (let i = 0; i < 50; i++) pairs.push({ p: 0.25, y: i < 15 ? 1 : 0 });   // 빈2: 예측25% 실제30%
  for (let i = 0; i < 50; i++) pairs.push({ p: 0.75, y: i < 35 ? 1 : 0 });   // 빈7: 예측75% 실제70%
  const b = M.brierDecomp(pairs);
  assert.ok(Math.abs(b.brier - (b.reliability - b.resolution + b.uncertainty)) < 1e-9);
});
test("brier(records): up/actual/base 래핑 동작", () => {
  const recs = [{ up: 80, actual: 110, base: 100 }, { up: 20, actual: 90, base: 100 }, { up: null, actual: 1, base: 1 }];
  const b = M.brier(recs);
  assert.equal(b.n, 2); assert.ok(b.brier < 0.05);
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd map && node --test backtest/metrics.test.js` → Expected: FAIL `M.brierDecomp is not a function`

- [ ] **Step 3: 구현** — `metrics.js`의 `baselines` 함수 뒤에 추가:

```js
// Brier score + Murphy 분해(uncertainty/reliability/resolution) + BSS(베이스레이트 대비 스킬).
// resolution↑ = 확률이 상황을 실제로 구별(정보성). BSS 0 = 베이스레이트 상수 예측과 동급.
function brierDecomp(pairs, binW = 0.1) {
  const N = pairs.length; if (!N) return null;
  let bs = 0, ybar = 0;
  for (const { p, y } of pairs) { bs += (p - y) ** 2; ybar += y; }
  bs /= N; ybar /= N;
  const bins = new Map();
  for (const pr of pairs) { const k = Math.min(Math.ceil(1 / binW) - 1, Math.floor(pr.p / binW)); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(pr); }
  let rel = 0, res = 0;
  for (const arr of bins.values()) {
    const n = arr.length;
    const pb = arr.reduce((s, r) => s + r.p, 0) / n, yb = arr.reduce((s, r) => s + r.y, 0) / n;
    rel += n / N * (pb - yb) ** 2; res += n / N * (yb - ybar) ** 2;
  }
  const unc = ybar * (1 - ybar);
  return { brier: bs, reliability: rel, resolution: res, uncertainty: unc, bss: unc ? 1 - bs / unc : null, n: N, baseRate: ybar };
}
function brier(records) {
  const pairs = [];
  for (const r of records) {
    if (r.up == null || !(r.actual > 0) || !(r.base > 0) || r.actual === r.base) continue;
    pairs.push({ p: r.up / 100, y: r.actual > r.base ? 1 : 0 });
  }
  return brierDecomp(pairs);
}
```

그리고 `module.exports`에 `brierDecomp, brier` 추가:

```js
module.exports = { upProbFromPrediction, directionHitRate, calibration, coneCoverage, priceMAE, simulatePnL, aggregatePnL, baselines, brierDecomp, brier };
```

- [ ] **Step 4: 통과 확인** — Run: `cd map && node --test backtest/metrics.test.js` → Expected: 전체 PASS (기존 테스트 포함)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/metrics.js map/backtest/metrics.test.js
git commit -m "feat(backtest): metrics에 Brier+Murphy 분해+BSS 추가 — 방향 채점 다각화"
```

---

### Task 2: feat-lib.js 공유 피처·로지스틱 라이브러리

**Files:**
- Create: `map/backtest/feat-lib.js`
- Test: `map/backtest/feat-lib.test.js`

**Interfaces:**
- Produces:
  - `structFeats(p, t)` → 12-피처 배열 또는 null(t<280). 순서: `[mom20, mom60, mom120, mom250, distMA200, slopeMA200, pctB20, rsiC, rsiSlope, ddHi60, volRatio, volPct]`
  - `FEAT_NAMES` — 위 12개 이름 배열(리포트용)
  - `logitFit(X, y, opts?)` → `{W, B, MEAN, STD, predict(x)}` (결정론·zero-init GD)
  - `sma(p,t,n)`, `vol(p,t,n)`, `rsi(p,t,n?)` 헬퍼
  - `acc(probs, ys, thr?)` → 적중률, `splitIdx(n, frac?)` → 시간분할 경계 인덱스

- [ ] **Step 1: 실패 테스트 작성** — `map/backtest/feat-lib.test.js` 생성:

```js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const F = require("./feat-lib.js");

function synth(n) {   // 결정적 사인 합성 시계열
  const p = [100];
  for (let i = 1; i < n; i++) p.push(Math.max(1, p[i - 1] * (1 + 0.0005 + Math.sin(i * 0.7) * 0.01 + Math.cos(i * 0.13) * 0.007)));
  return p;
}

test("structFeats: 워밍업 미달 → null, 이후 12개 유한값", () => {
  const p = synth(400);
  assert.equal(F.structFeats(p, 279), null);
  const x = F.structFeats(p, 350);
  assert.equal(x.length, 12);
  assert.equal(F.FEAT_NAMES.length, 12);
  x.forEach(v => assert.ok(isFinite(v)));
});
test("logitFit: 선형분리 데이터 분리 + 결정론", () => {
  const X = [], y = [];
  for (let i = 0; i < 200; i++) { const c = i % 2; X.push([c * 2 - 1 + Math.sin(i) * 0.1]); y.push(c); }
  const m1 = F.logitFit(X, y), m2 = F.logitFit(X, y);
  assert.ok(m1.predict([-1]) < 0.2); assert.ok(m1.predict([1]) > 0.8);
  assert.deepEqual(m1.W, m2.W);   // 결정론
});
test("acc/splitIdx 기본 동작", () => {
  assert.equal(F.acc([0.9, 0.1], [1, 0]), 1);
  assert.equal(F.splitIdx(100, 0.6), 60);
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd map && node --test backtest/feat-lib.test.js` → Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `map/backtest/feat-lib.js` 생성:

```js
// backtest/feat-lib.js — 랩 공유: 구조 피처 + 결정론 로지스틱(엔진·네트워크 의존 없음)
"use strict";

function sma(p, t, n) { let s = 0; for (let i = t - n + 1; i <= t; i++) s += p[i]; return s / n; }
function vol(p, t, n) { let s = 0; for (let i = t - n + 1; i <= t; i++) { const r = Math.log(p[i] / p[i - 1]); s += r * r; } return Math.sqrt(s / n); }
function rsi(p, t, n = 14) { let g = 0, l = 0; for (let i = t - n + 1; i <= t; i++) { const d = p[i] - p[i - 1]; if (d > 0) g += d; else l -= d; } return (g + l) ? 100 * g / (g + l) : 50; }

const FEAT_NAMES = ["mom20", "mom60", "mom120", "mom250", "distMA200", "slopeMA200", "pctB20", "rsiC", "rsiSlope", "ddHi60", "volRatio", "volPct"];

// 시점 t의 가격 구조 12피처. t<280(mom250+RSI슬랙) 또는 비유한 시 null.
function structFeats(p, t) {
  if (t < 280 || t >= p.length) return null;
  const mom = n => p[t] / p[t - n] - 1;
  const ma200 = sma(p, t, 200), ma200p = sma(p, t - 20, 200), m20 = sma(p, t, 20);
  let sd = 0; for (let i = t - 19; i <= t; i++) sd += (p[i] - m20) ** 2; sd = Math.sqrt(sd / 20);
  const pctB = sd ? (p[t] - (m20 - 2 * sd)) / (4 * sd) : 0.5;
  let hi60 = -Infinity; for (let i = t - 59; i <= t; i++) if (p[i] > hi60) hi60 = p[i];
  const v20 = vol(p, t, 20), v120 = vol(p, t, 120);
  let below = 0; const back = Math.min(252, t - 21);
  for (let i = t - back; i <= t; i += 4) if (vol(p, i, 20) <= v20) below++;   // 4봉 서브샘플(속도) — 백분위 근사
  const x = [mom(20), mom(60), mom(120), mom(250), p[t] / ma200 - 1, ma200 / ma200p - 1,
    pctB, rsi(p, t) / 100 - 0.5, (rsi(p, t) - rsi(p, t - 5)) / 100, p[t] / hi60 - 1,
    v120 ? v20 / v120 - 1 : 0, below / (Math.floor(back / 4) + 1) - 0.5];
  return x.every(isFinite) ? x : null;
}

// 결정론 로지스틱(zero-init 배치 GD + L2). 표준화 내장, predict는 원 스케일 입력.
function logitFit(X, y, opts = {}) {
  const { iters = 400, lr = 0.3, l2 = 1e-3 } = opts;
  const n = X.length, d = X[0].length;
  const MEAN = new Array(d).fill(0), STD = new Array(d).fill(0);
  for (let j = 0; j < d; j++) {
    let s = 0; for (const x of X) s += x[j]; MEAN[j] = s / n;
    let v = 0; for (const x of X) v += (x[j] - MEAN[j]) ** 2; STD[j] = Math.sqrt(v / n) || 1;
  }
  const Z = X.map(x => x.map((v, j) => (v - MEAN[j]) / STD[j]));
  const W = new Array(d).fill(0); let B = 0;
  for (let it = 0; it < iters; it++) {
    const gW = new Array(d).fill(0); let gB = 0;
    for (let i = 0; i < n; i++) {
      let s = B; for (let j = 0; j < d; j++) s += W[j] * Z[i][j];
      const e = 1 / (1 + Math.exp(-s)) - y[i];
      for (let j = 0; j < d; j++) gW[j] += e * Z[i][j]; gB += e;
    }
    for (let j = 0; j < d; j++) W[j] -= lr * (gW[j] / n + l2 * W[j]);
    B -= lr * gB / n;
  }
  const predict = x => { let s = B; for (let j = 0; j < d; j++) s += W[j] * ((x[j] - MEAN[j]) / STD[j]); return 1 / (1 + Math.exp(-s)); };
  return { W, B, MEAN, STD, predict };
}

function acc(probs, ys, thr = 0.5) { let h = 0; for (let i = 0; i < probs.length; i++) if ((probs[i] >= thr ? 1 : 0) === ys[i]) h++; return probs.length ? h / probs.length : null; }
function splitIdx(n, frac = 0.6) { return Math.floor(n * frac); }

module.exports = { sma, vol, rsi, structFeats, FEAT_NAMES, logitFit, acc, splitIdx };
```

- [ ] **Step 4: 통과 확인** — Run: `cd map && node --test backtest/feat-lib.test.js` → Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add map/backtest/feat-lib.js map/backtest/feat-lib.test.js
git commit -m "feat(backtest): feat-lib 공유 라이브러리 — 구조 12피처 + 결정론 로지스틱"
```

---

### Task 3: SPY 픽스처 수집

**Files:**
- Modify: `map/backtest/fetch-fixtures.js` (UNIVERSE 배열)
- Output: `map/backtest/fixtures/SPY-1day.json`

**Interfaces:**
- Produces: `fixtures/SPY-1day.json` — rel-lab의 시장 기준 시계열. 기존 픽스처와 동일 포맷 `{symbol, tf, from, to, candle:[{o,h,l,c,v?}]}`.

- [ ] **Step 1: UNIVERSE에 SPY 추가** — `fetch-fixtures.js`의 `// 미국 대형주 확대` 블록 앞에 한 줄:

```js
  // 시장 기준(벤치마크) — 상대 방향 랩(rel-lab)용
  ["SPY", "1day"],
```

- [ ] **Step 2: 수집 실행** — Run: `cd map && node backtest/fetch-fixtures.js`
Expected: 기존 파일 전부 `스킵(기존):` · 마지막에 `저장: SPY-1day.json 5000 봉`(±, 260봉 이상이면 OK)

- [ ] **Step 3: 검증** — Run: `cd map && node -e "const f=require('./backtest/fixtures/SPY-1day.json');console.log(f.symbol,f.candle.length,f.from,f.to)"`
Expected: `SPY 4000~5000 <2006~2007경> <2026-07경>`

- [ ] **Step 4: Commit**

```bash
git add map/backtest/fetch-fixtures.js map/backtest/fixtures/SPY-1day.json
git commit -m "feat(backtest): SPY 벤치마크 픽스처 — 상대 방향 랩 기준 시계열"
```

---

### Task 4: rel-lab.js — Track 1 상대 방향(시장 대비 아웃퍼폼)

**Files:**
- Create: `map/backtest/rel-lab.js`

**Interfaces:**
- Consumes: `feat-lib.js`(structFeats/logitFit/acc/splitIdx), `metrics.js`(brierDecomp), `fixtures/*.json`
- Produces: 콘솔 리포트(H=10/20/40 × {풀모델, 모멘텀단독} vs 베이스라인 3종, LOSO, 전/후반, 시장국면별 base) — 결과 문서(Task 7)의 원자료

**설계 요점(코드에 반영):**
- 타깃: `y = P[t+H]/P[t] > S[t+H]/S[t]` (S=SPY). 베이스레이트 ~50% 확인을 리포트 1행으로.
- 정렬: 끝 정렬(momentum-xs 선례 — 미국주식+SPY 동일 거래일 근사). 주의 주석 명기.
- 피처: 자기 구조 12 + 상대시계열(P/S) 구조 12 + beta proxy(60봉 corr×volRatio) = 25.
- 베이스라인: ①다수결(train) ②지속성(직전 H봉 상대수익 부호) ③**모멘텀 부호 단독**(rel mom250>0) — 재포장 방지 관문.
- OOS: 종목별 시간분할 60/40(테스트=후반). LOSO: 다른 종목 train구간으로 학습→보류 종목 test구간 채점.
- stride 5(중첩 완화), H별 독립 평가.

- [ ] **Step 1: 스모크 테스트 작성(랩 파일에 `--smoke` 모드 내장)** — 아래 Step 2 코드의 `if (process.argv.includes("--smoke"))` 분기가 스모크. 합성 데이터: `A = S×exp(+누적신호)`, `B = S×exp(−누적신호)`에서 신호가 rel mom에 실리므로 풀모델 OOS ≥ 65% 기대.

- [ ] **Step 2: 구현** — `map/backtest/rel-lab.js` 생성:

```js
// backtest/rel-lab.js — Track 1: 상대 방향(시장(SPY) 대비 H봉 아웃퍼폼 확률)
// 재정의 근거: 절대 방향은 드리프트 오염(base 55~68%)으로 스킬 측정 불가. 상대 방향은 base ~50%.
// 관문(사전 등록): OOS서 다수결·지속성·모멘텀단독 전부 +1.5pp↑ · 전/후반 양수 · LOSO 유지.
// 주의: 끝 정렬(slice(-minLen)) = 동일 거래일 근사(momentum-xs 선례, 미국주식+SPY 공통 캘린더).
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");
const M = require("./metrics.js");

const US = ["AAPL","MSFT","NVDA","INTC","BABA","PYPL","DIS","T","IBM","CSCO","VZ","PFE","KO","WBA","GE",
  "JPM","BAC","WMT","HD","PG","JNJ","UNH","XOM","CVX","V","MA","ORCL","CRM","AMD","QCOM","CAT"];
const HS = [10, 20, 40], STRIDE = 5, START = 300;

function loadCloses() {
  const dir = path.join(__dirname, "fixtures"), out = {};
  for (const s of US.concat(["SPY"])) {
    const fp = path.join(dir, s + "-1day.json");
    if (fs.existsSync(fp)) out[s] = JSON.parse(fs.readFileSync(fp, "utf8")).candle.map(c => c.c);
  }
  return out;
}

function betaProxy(P, S, t, n = 60) {
  let sp = 0, ss = 0, spp = 0, sss = 0, sps = 0;
  for (let i = t - n + 1; i <= t; i++) {
    const rp = Math.log(P[i] / P[i - 1]), rs = Math.log(S[i] / S[i - 1]);
    sp += rp; ss += rs; spp += rp * rp; sss += rs * rs; sps += rp * rs;
  }
  const vs = sss / n - (ss / n) ** 2;
  return vs > 0 ? (sps / n - sp * ss / n / n) / vs : 1;   // 회귀 베타
}

// rows: {sym, t, x[25], y{}, prevRel, relMom250}
function buildRows(closes) {
  const S = closes.SPY;
  const syms = Object.keys(closes).filter(s => s !== "SPY");
  const minLen = Math.min(...syms.map(s => closes[s].length), S.length);
  const spy = S.slice(-minLen);
  const rows = [];
  for (const sym of syms) {
    const P = closes[sym].slice(-minLen);
    const R = P.map((v, i) => v / spy[i]);   // 상대 시계열
    for (let t = START; t <= minLen - Math.max(...HS) - 1; t += STRIDE) {
      const xo = F.structFeats(P, t), xr = F.structFeats(R, t);
      if (!xo || !xr) continue;
      const x = xo.concat(xr, [betaProxy(P, spy, t)]);
      const y = {}; for (const H of HS) y[H] = (P[t + H] / P[t] > spy[t + H] / spy[t]) ? 1 : 0;
      const prevRel = {}; for (const H of HS) prevRel[H] = (P[t] / P[t - H] > spy[t] / spy[t - H]) ? 1 : 0;
      rows.push({ sym, t, x, y, prevRel, relMom250: R[t] / R[t - 250] - 1, mktUp: spy[t] / spy[t - 60] > 1 ? 1 : 0 });
    }
  }
  return { rows, minLen, nSym: syms.length };
}

const pct = x => x == null ? "–" : (x * 100).toFixed(1) + "%";
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

function evalH(rows, H, label) {
  // 종목별 시간분할 60/40 — train은 전 종목의 전반부, test는 전 종목의 후반부(시간 순서 보존)
  const bySym = {};
  for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const tr = [], te = [];
  for (const s of Object.keys(bySym)) {
    const a = bySym[s], k = F.splitIdx(a.length);
    tr.push(...a.slice(0, k)); te.push(...a.slice(k));
  }
  const fit = (rs, cols) => F.logitFit(rs.map(r => cols ? cols(r) : r.x), rs.map(r => r.y[H]));
  const full = fit(tr), momOnly = fit(tr, r => [r.relMom250]);
  const yTe = te.map(r => r.y[H]);
  const pFull = te.map(r => full.predict(r.x)), pMom = te.map(r => momOnly.predict([r.relMom250]));
  const base = yTe.reduce((s, v) => s + v, 0) / yTe.length;
  const majTrain = tr.map(r => r.y[H]).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
  const majAcc = yTe.filter(v => v === majTrain).length / yTe.length;
  const persAcc = te.filter(r => r.prevRel[H] === r.y[H]).length / te.length;
  const momSignAcc = te.filter(r => (r.relMom250 > 0 ? 1 : 0) === r.y[H]).length / te.length;
  const aFull = F.acc(pFull, yTe), aMom = F.acc(pMom, yTe);
  const worst = Math.max(majAcc, persAcc, momSignAcc);
  // 전/후반 안정성(테스트 구간 반분)
  const mid = Math.floor(te.length / 2);
  const h1 = F.acc(pFull.slice(0, mid), yTe.slice(0, mid)), h2 = F.acc(pFull.slice(mid), yTe.slice(mid));
  const b1 = Math.max(yTe.slice(0, mid).filter(v => v === majTrain).length / mid,
    te.slice(0, mid).filter(r => r.prevRel[H] === r.y[H]).length / mid,
    te.slice(0, mid).filter(r => (r.relMom250 > 0 ? 1 : 0) === r.y[H]).length / mid);
  const b2 = Math.max(yTe.slice(mid).filter(v => v === majTrain).length / (te.length - mid),
    te.slice(mid).filter(r => r.prevRel[H] === r.y[H]).length / (te.length - mid),
    te.slice(mid).filter(r => (r.relMom250 > 0 ? 1 : 0) === r.y[H]).length / (te.length - mid));
  const brier = M.brierDecomp(pFull.map((p, i) => ({ p, y: yTe[i] })));
  // 시장 국면별 base(고베타 편향 체크)
  const upTe = te.filter(r => r.mktUp), dnTe = te.filter(r => !r.mktUp);
  console.log(`\n[${label} H=${H}] test n=${te.length} base(아웃퍼폼율)=${pct(base)}`);
  console.log(`  풀모델 ${pct(aFull)} · 모멘텀단독모델 ${pct(aMom)} | 다수결 ${pct(majAcc)} · 지속성 ${pct(persAcc)} · 모멘텀부호 ${pct(momSignAcc)}`);
  console.log(`  vs 최강베이스라인 ${pp(aFull - worst)} · 모멘텀단독 대비 증분 ${pp(aFull - Math.max(aMom, momSignAcc))}`);
  console.log(`  전/후반: ${pp(h1 - b1)} / ${pp(h2 - b2)} · BSS ${brier.bss.toFixed(3)} · resolution ${brier.resolution.toFixed(4)} · ECE류 rel ${brier.reliability.toFixed(4)}`);
  console.log(`  시장상승기 base ${pct(upTe.length ? upTe.reduce((s, r) => s + r.y[H], 0) / upTe.length : null)} (n=${upTe.length}) · 하락기 base ${pct(dnTe.length ? dnTe.reduce((s, r) => s + r.y[H], 0) / dnTe.length : null)} (n=${dnTe.length})`);
  return { H, aFull, worst, momIncr: aFull - Math.max(aMom, momSignAcc) };
}

function evalLOSO(rows, H) {
  const syms = [...new Set(rows.map(r => r.sym))];
  let hit = 0, n = 0, blHit = 0;
  for (const held of syms) {
    const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
    const tr = [], te = [];
    for (const s of syms) {
      const a = bySym[s], k = F.splitIdx(a.length);
      if (s === held) te.push(...a.slice(k)); else tr.push(...a.slice(0, k));   // 종목·기간 이중 분리
    }
    if (!te.length || !tr.length) continue;
    const m = F.logitFit(tr.map(r => r.x), tr.map(r => r.y[H]));
    for (const r of te) { n++; if ((m.predict(r.x) >= 0.5 ? 1 : 0) === r.y[H]) hit++; if ((r.relMom250 > 0 ? 1 : 0) === r.y[H]) blHit++; }
  }
  console.log(`  [LOSO H=${H}] 풀모델 ${pct(hit / n)} vs 모멘텀부호 ${pct(blHit / n)} → ${pp(hit / n - blHit / n)} (n=${n})`);
}

function smoke() {
  // 합성: S 완만상승, A=S×exp(+w), B=S×exp(−w) — 상대추세가 지속되므로 rel 피처로 분리 가능해야 함
  const n = 900, S = [100], w = [0];
  for (let i = 1; i < n; i++) { S.push(S[i - 1] * (1 + 0.0004 + Math.sin(i * 0.5) * 0.008)); w.push(w[i - 1] + 0.0006 + Math.sin(i * 0.05) * 0.0004); }
  const closes = { SPY: S, AAA: S.map((v, i) => v * Math.exp(w[i])), BBB: S.map((v, i) => v * Math.exp(-w[i])) };
  const { rows } = buildRows(closes);
  const r = evalH(rows, 20, "SMOKE");
  if (!(r.aFull > 0.65)) { console.error("SMOKE FAIL: 분리 가능한 합성서 65% 미달"); process.exit(1); }
  console.log("SMOKE OK");
}

function main() {
  if (process.argv.includes("--smoke")) return smoke();
  const closes = loadCloses();
  if (!closes.SPY) { console.error("SPY 픽스처 없음 — fetch-fixtures 먼저"); process.exit(1); }
  const { rows, minLen, nSym } = buildRows(closes);
  console.log(`상대 방향 랩 — 종목 ${nSym} · 정렬 ${minLen}봉 · 표본 ${rows.length} (끝정렬 근사·stride ${STRIDE})`);
  const res = HS.map(H => evalH(rows, H, "REL"));
  for (const H of HS) evalLOSO(rows, H);
  console.log("\n관문: 최강베이스라인 +1.5pp↑ & 전/후반 양수 & LOSO 유지 & (신규축 주장 시) 모멘텀단독 +1pp↑");
  res.forEach(r => console.log(`  H=${r.H}: lift ${pp(r.aFull - r.worst)} · 모멘텀 증분 ${pp(r.momIncr)}`));
}
main();
```

- [ ] **Step 3: 스모크 실행** — Run: `cd map && node backtest/rel-lab.js --smoke` → Expected: `SMOKE OK`(풀모델 >65%)

- [ ] **Step 4: 실데이터 실행·결과 보존** — Run: `cd map && node backtest/rel-lab.js | tee backtest/rel-lab-out.txt`
Expected: H=10/20/40 각 리포트 + LOSO + 관문 요약(수치는 실측 — 어떤 값이든 그대로 기록)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/rel-lab.js map/backtest/rel-lab-out.txt
git commit -m "research(backtest): rel-lab — 상대 방향(SPY 대비) Track 1 실측"
```

---

### Task 5: excess-lab.js — Track 2 초과 방향(자기 드리프트 대비)

**Files:**
- Create: `map/backtest/excess-lab.js`

**Interfaces:**
- Consumes: `feat-lib.js`, `metrics.js`(brierDecomp), `fixtures/*-1day.json` 전체(자동 스캔)
- Produces: 콘솔 리포트 — 타깃 3정의(vs드리프트·vs0·vs중앙값) 병렬 채점, H=10/20/40

**설계 요점:**
- 주 타깃: `y = log(P[t+H]/P[t]) > drift252(t)×H`, `drift252 = mean(log ret, 최근 252봉)`.
- 대조 타깃: vs 0(기존 정의 — 드리프트 오염 확인용), vs 과거 H봉 로그수익 중앙값.
- 베이스라인: 다수결(train) · 지속성(직전 H봉 초과수익 부호) · 동전 50.
- 피처: `structFeats` 12만(엔진 불필요 — 저렴·전 픽스처).

- [ ] **Step 1: 구현** — `map/backtest/excess-lab.js` 생성:

```js
// backtest/excess-lab.js — Track 2: 초과 방향(자기 트레일링 드리프트 대비 H봉 초과수익 부호)
// "지금이 이 종목의 평소 대비 좋은 진입 시점인가" — 홀드 대비 타이밍 가치. base ~50% 설계.
// 대조 타깃 vs0(드리프트 오염 확인)·vs중앙값 병렬 채점. 관문은 공통(+1.5pp·전후반·LOSO).
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");
const M = require("./metrics.js");

const HS = [10, 20, 40], STRIDE = 5, START = 300;

function loadDaily() {
  const dir = path.join(__dirname, "fixtures");
  return fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    .filter(fx => fx.candle.length >= 600);
}

function drift252(p, t) { let s = 0; for (let i = t - 251; i <= t; i++) s += Math.log(p[i] / p[i - 1]); return s / 252; }
function medH(p, t, H) {   // 과거 H봉 로그수익 분포 중앙값(252봉 창·H 간격 샘플)
  const a = []; for (let i = t; i - H >= t - 252; i -= H) a.push(Math.log(p[i] / p[i - H]));
  a.sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}

function buildRows(fixtures) {
  const rows = [];
  for (const fx of fixtures) {
    const p = fx.candle.map(c => c.c), N = p.length;
    for (let t = START; t <= N - Math.max(...HS) - 1; t += STRIDE) {
      const x = F.structFeats(p, t); if (!x) continue;
      const d = drift252(p, t);
      const y = {}, y0 = {}, yMed = {}, prev = {};
      for (const H of HS) {
        const fwd = Math.log(p[t + H] / p[t]);
        y[H] = fwd > d * H ? 1 : 0;
        y0[H] = fwd > 0 ? 1 : 0;
        yMed[H] = fwd > medH(p, t, H) ? 1 : 0;
        prev[H] = Math.log(p[t] / p[t - H]) > d * H ? 1 : 0;
      }
      rows.push({ sym: fx.symbol, x, y, y0, yMed, prev });
    }
  }
  return rows;
}

const pct = x => x == null ? "–" : (x * 100).toFixed(1) + "%";
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

function evalTarget(rows, H, key, label) {
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const tr = [], te = [];
  for (const s of Object.keys(bySym)) { const a = bySym[s], k = F.splitIdx(a.length); tr.push(...a.slice(0, k)); te.push(...a.slice(k)); }
  const m = F.logitFit(tr.map(r => r.x), tr.map(r => r[key][H]));
  const yTe = te.map(r => r[key][H]), pTe = te.map(r => m.predict(r.x));
  const base = yTe.reduce((s, v) => s + v, 0) / yTe.length;
  const majTrain = tr.map(r => r[key][H]).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
  const majAcc = yTe.filter(v => v === majTrain).length / yTe.length;
  const persAcc = te.filter(r => r.prev[H] === r[key][H]).length / te.length;
  const worst = Math.max(majAcc, persAcc, 0.5);
  const a = F.acc(pTe, yTe);
  const mid = Math.floor(te.length / 2);
  const h1 = F.acc(pTe.slice(0, mid), yTe.slice(0, mid)) - Math.max(yTe.slice(0, mid).filter(v => v === majTrain).length / mid, te.slice(0, mid).filter(r => r.prev[H] === r[key][H]).length / mid);
  const h2 = F.acc(pTe.slice(mid), yTe.slice(mid)) - Math.max(yTe.slice(mid).filter(v => v === majTrain).length / (te.length - mid), te.slice(mid).filter(r => r.prev[H] === r[key][H]).length / (te.length - mid));
  const brier = M.brierDecomp(pTe.map((p, i) => ({ p, y: yTe[i] })));
  console.log(`  [${label} H=${H}] base ${pct(base)} · 모델 ${pct(a)} | 다수결 ${pct(majAcc)} 지속성 ${pct(persAcc)} → lift ${pp(a - worst)} · 전/후반 ${pp(h1)}/${pp(h2)} · BSS ${brier.bss.toFixed(3)}`);
  return { a, worst };
}

function evalLOSO(rows, H, key) {
  const syms = [...new Set(rows.map(r => r.sym))];
  let hit = 0, n = 0, mHit = 0, mN = 0;
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  for (const held of syms) {
    const tr = [], te = [];
    for (const s of syms) { const a = bySym[s], k = F.splitIdx(a.length); if (s === held) te.push(...a.slice(k)); else tr.push(...a.slice(0, k)); }
    if (!te.length || !tr.length) continue;
    const m = F.logitFit(tr.map(r => r.x), tr.map(r => r[key][H]));
    const majTrain = tr.map(r => r[key][H]).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
    for (const r of te) { n++; if ((m.predict(r.x) >= 0.5 ? 1 : 0) === r[key][H]) hit++; mN++; if (r[key][H] === majTrain) mHit++; }
  }
  console.log(`  [LOSO H=${H}] 모델 ${pct(hit / n)} vs 다수결 ${pct(mHit / mN)} → ${pp(hit / n - mHit / mN)} (n=${n})`);
}

function main() {
  const fixtures = loadDaily();
  const rows = buildRows(fixtures);
  console.log(`초과 방향 랩 — 픽스처 ${fixtures.length} · 표본 ${rows.length}`);
  console.log("\n== 주 타깃: vs 자기 드리프트(252봉) ==");
  for (const H of HS) evalTarget(rows, H, "y", "EXCESS");
  for (const H of HS) evalLOSO(rows, H, "y");
  console.log("\n== 대조: vs 0 (드리프트 오염 확인 — base가 50%서 벗어날 것) ==");
  for (const H of HS) evalTarget(rows, H, "y0", "VS0");
  console.log("\n== 대조: vs 과거 H봉 중앙값 ==");
  for (const H of HS) evalTarget(rows, H, "yMed", "VSMED");
}
main();
```

- [ ] **Step 2: 실행·결과 보존** — Run: `cd map && node backtest/excess-lab.js | tee backtest/excess-lab-out.txt`
Expected: 주 타깃 base가 ~50%(vs0 base는 55%+로 벌어짐 = 오염 입증), lift 수치는 실측 그대로.

- [ ] **Step 3: Commit**

```bash
git add map/backtest/excess-lab.js map/backtest/excess-lab-out.txt
git commit -m "research(backtest): excess-lab — 초과 방향(드리프트 대비) Track 2 실측"
```

---

### Task 6: stack-lab.js — Track 3 6축 스태킹 절대방향 재도전 + Brier 해상도

**Files:**
- Create: `map/backtest/stack-lab.js`
- Output(캐시): `map/backtest/stack-records.json` (엔진 1패스 결과 — regime-hold-records.json 선례)

**Interfaces:**
- Consumes: `../forge-core.js`(FC.run·standardGraph 경유는 `backtest.js`의 `standardGraph` require), `metrics.js`(upProbFromPrediction·brierDecomp·calibration), `feat-lib.js`(logitFit/acc/splitIdx)
- Produces: 콘솔 리포트 — (a) 정확도 vs 항상상승/현행엔진 (b) Brier 분해: 현행 캘리브레이션 확률 vs 스태킹 확률(동일 테스트셋)

**설계 요점:**
- 수집(1패스·캐시): 일봉 픽스처 전체, WARMUP 280·stride 10·LOOKBACK 600, `FC.run(graph, past, {futW:60, timeframe:"1day"})` → verdict.context 6축 + score + 캘리브레이션 up + 실제 20/60봉 뒤 가격. 소요 ~15–25분(1회, 이후 캐시).
- 피처 13: `[score, up, vol(raw), dd, upt, spk, gap, gapNull, tpP, tpDir, strength, stateUp, stateDown]` — null 임퓨트: vol 50·dd 34·upt 40·spk 44·gap 49(+gapNull=1)·tpP 50(+tpDir 0).
- 타깃: y60(=H60, 헤드라인 58.1% 비교용)·y20(축 검증 지평) 각각.
- R:R 귀속: upt·dd 제외 축소모델도 병렬 → R:R 비대칭의 기여 분리.
- Brier: 동일 테스트 레코드에서 베이스라인 pairs `p=up/100` vs 스태킹 pairs — resolution·reliability·BSS 비교. ECE는 `M.calibration` 재사용(레코드 up 필드에 모델확률×100 주입).

- [ ] **Step 1: 구현** — `map/backtest/stack-lab.js` 생성:

```js
// backtest/stack-lab.js — Track 3: 검증 6축 출력 스태킹으로 절대 방향 재도전 + Brier 해상도.
// 목표 2단: (a) 정확도 vs 항상상승(+1.5pp 관문 — 전례상 낮은 확률, 정직 보고)
//          (b) 해상도: ECE ≤2.5% 유지하며 resolution↑ (확률 정보성 — 정확도 없이도 채택 가치)
// R:R(이익도달 vs 낙폭 확률)은 기존 방향 실험(07-09) 이후 생긴 피처 — 방향 투입 최초.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const BT = require("./backtest.js");
const M = require("./metrics.js");
const F = require("./feat-lib.js");

const CACHE = path.join(__dirname, "stack-records.json");
const WARMUP = 280, STRIDE = 10, LOOKBACK = 600, H = 60, H2 = 20;

function collect() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const graph = BT.standardGraph();
  const out = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const candle = fx.candle, price = candle.map(c => c.c), N = price.length;
    if (N < WARMUP + H + 10) continue;
    const t0 = Date.now();
    for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      const past = { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) };
      let r; try { r = FC.run(graph, past, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
      const v = r.verdict, ctx = (v && v.context) || {};
      if (!r.prediction || !r.prediction.path) continue;
      out.push({
        sym: fx.symbol, t,
        score: v.score || 0, up: M.upProbFromPrediction(r.prediction),
        vol: ctx.volForecast ? ctx.volForecast.raw : null,
        dd: ctx.ddRisk ? ctx.ddRisk.prob : null,
        upt: ctx.upTarget ? ctx.upTarget.prob : null,
        spk: ctx.spikeRisk ? ctx.spikeRisk.prob : null,
        gap: ctx.gapRisk ? ctx.gapRisk.prob : null,
        tpP: ctx.trendPersist ? ctx.trendPersist.persist : null,
        tpDir: ctx.trendPersist ? (ctx.trendPersist.state === "up" ? 1 : -1) : 0,
        state: ctx.state || "", strength: ctx.strength || 0,
        base: price[t], a20: price[t + H2], a60: price[t + H],
      });
    }
    console.error("  " + fx.symbol + " → 누적 " + out.length + " (" + ((Date.now() - t0) / 1000).toFixed(0) + "s)");
  }
  fs.writeFileSync(CACHE, JSON.stringify(out));
  return out;
}

function feats(r) {
  return [r.score, r.up == null ? 50 : r.up,
    r.vol == null ? 50 : r.vol, r.dd == null ? 34 : r.dd, r.upt == null ? 40 : r.upt,
    r.spk == null ? 44 : r.spk, r.gap == null ? 49 : r.gap, r.gap == null ? 1 : 0,
    r.tpP == null ? 50 : r.tpP, r.tpDir, r.strength,
    r.state === "up" ? 1 : 0, r.state === "down" ? 1 : 0];
}
function featsNoRR(r) { const x = feats(r); return x.slice(0, 3).concat(x.slice(5)); }   // dd·upt 제외

const pct = x => x == null ? "–" : (x * 100).toFixed(1) + "%";
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

function evalDir(recs, aKey, label) {
  const rows = recs.filter(r => r[aKey] > 0 && r.base > 0 && r[aKey] !== r.base && r.up != null);
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const tr = [], te = [];
  for (const s of Object.keys(bySym)) { const a = bySym[s], k = F.splitIdx(a.length); tr.push(...a.slice(0, k)); te.push(...a.slice(k)); }
  const yOf = r => r[aKey] > r.base ? 1 : 0;
  const full = F.logitFit(tr.map(feats), tr.map(yOf));
  const noRR = F.logitFit(tr.map(featsNoRR), tr.map(yOf));
  const yTe = te.map(yOf);
  const pFull = te.map(r => full.predict(feats(r))), pNoRR = te.map(r => noRR.predict(featsNoRR(r)));
  const alwaysUp = yTe.reduce((s, v) => s + v, 0) / yTe.length;
  const engineAcc = te.filter(r => (r.score >= 0 ? 1 : 0) === yOf(r)).length / te.length;
  const aFull = F.acc(pFull, yTe), aNoRR = F.acc(pNoRR, yTe);
  const mid = Math.floor(te.length / 2);
  const lift1 = F.acc(pFull.slice(0, mid), yTe.slice(0, mid)) - yTe.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
  const lift2 = F.acc(pFull.slice(mid), yTe.slice(mid)) - yTe.slice(mid).reduce((s, v) => s + v, 0) / (te.length - mid);
  console.log(`\n[${label}] test n=${te.length} · 항상상승 ${pct(alwaysUp)} · 현행엔진 ${pct(engineAcc)}`);
  console.log(`  스태킹 ${pct(aFull)} (vs 항상상승 ${pp(aFull - alwaysUp)} · 전/후반 ${pp(lift1)}/${pp(lift2)}) · R:R 제외 ${pct(aNoRR)} (R:R 기여 ${pp(aFull - aNoRR)})`);
  // ── Brier 해상도: 현행 캘리브레이션 up vs 스태킹 확률(동일 테스트셋) ──
  const bBase = M.brierDecomp(te.map(r => ({ p: r.up / 100, y: yOf(r) })));
  const bStack = M.brierDecomp(pFull.map((p, i) => ({ p, y: yTe[i] })));
  const eceBase = M.calibration(te.map(r => ({ up: r.up, actual: yOf(r), base: 0.5 })), 10).ece;       // actual>base 규약 재사용
  const eceStack = M.calibration(pFull.map((p, i) => ({ up: p * 100, actual: yTe[i], base: 0.5 })), 10).ece;
  console.log(`  Brier   현행 up: BS ${bBase.brier.toFixed(4)} REL ${bBase.reliability.toFixed(4)} RES ${bBase.resolution.toFixed(4)} BSS ${bBase.bss.toFixed(3)} ECE ${(eceBase * 100).toFixed(1)}%`);
  console.log(`  Brier 스태킹   : BS ${bStack.brier.toFixed(4)} REL ${bStack.reliability.toFixed(4)} RES ${bStack.resolution.toFixed(4)} BSS ${bStack.bss.toFixed(3)} ECE ${(eceStack * 100).toFixed(1)}%`);
  console.log(`  → 해상도 ${bStack.resolution > bBase.resolution ? "증가" : "감소"} ×${(bStack.resolution / (bBase.resolution || 1e-9)).toFixed(2)} · ECE ${(eceStack * 100).toFixed(1)}% (관문 ≤2.5%)`);
  return { aFull, alwaysUp };
}

function evalLOSO(recs, aKey) {
  const rows = recs.filter(r => r[aKey] > 0 && r.base > 0 && r[aKey] !== r.base && r.up != null);
  const syms = [...new Set(rows.map(r => r.sym))];
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  let hit = 0, n = 0, upHit = 0;
  for (const held of syms) {
    const tr = [], te = [];
    for (const s of syms) { const a = bySym[s], k = F.splitIdx(a.length); if (s === held) te.push(...a.slice(k)); else tr.push(...a.slice(0, k)); }
    if (!te.length || !tr.length) continue;
    const yOf = r => r[aKey] > r.base ? 1 : 0;
    const m = F.logitFit(tr.map(feats), tr.map(yOf));
    for (const r of te) { n++; if ((m.predict(feats(r)) >= 0.5 ? 1 : 0) === yOf(r)) hit++; if (yOf(r) === 1) upHit++; }
  }
  console.log(`  [LOSO ${aKey}] 스태킹 ${pct(hit / n)} vs 항상상승 ${pct(upHit / n)} → ${pp(hit / n - upHit / n)} (n=${n})`);
}

function main() {
  let recs;
  if (fs.existsSync(CACHE) && !process.argv.includes("--recollect")) {
    recs = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    console.log("캐시 사용: " + recs.length + " 레코드 (재수집: --recollect)");
  } else { console.log("엔진 1패스 수집 시작(~15–25분)…"); recs = collect(); }
  evalDir(recs, "a60", "H=60 (헤드라인 비교)");
  evalDir(recs, "a20", "H=20 (축 검증 지평)");
  evalLOSO(recs, "a60"); evalLOSO(recs, "a20");
}
main();
```

- [ ] **Step 2: 소표본 스모크** — Run: `cd map && node -e "
const BT=require('./backtest/backtest.js'),FC=require('./forge-core.js'),M=require('./backtest/metrics.js');
const fx=BT.makeSyntheticFixture('SYN','1day',{n:420});
const g=BT.standardGraph();const price=fx.candle.map(c=>c.c);
const past={price:price.slice(0,301),candle:fx.candle.slice(0,301)};
const r=FC.run(g,past,{futW:60,timeframe:'1day'});
const ctx=r.verdict.context||{};
console.log('score',r.verdict.score,'up',M.upProbFromPrediction(r.prediction),'vol',ctx.volForecast&&ctx.volForecast.raw,'dd',ctx.ddRisk&&ctx.ddRisk.prob,'upt',ctx.upTarget&&ctx.upTarget.prob,'spk',ctx.spikeRisk&&ctx.spikeRisk.prob,'gap',ctx.gapRisk===null?'null(합성 무갭 정상)':ctx.gapRisk&&ctx.gapRisk.prob,'tp',ctx.trendPersist&&ctx.trendPersist.persist);
"` → Expected: 각 필드 숫자 또는 null(gap은 합성 무갭이라 null 정상) — 피처 추출 경로 검증

- [ ] **Step 3: 수집+평가 실행(장시간)·결과 보존** — Run: `cd map && node backtest/stack-lab.js | tee backtest/stack-lab-out.txt` (약 15–25분)
Expected: H=60/H=20 각 정확도·R:R 기여·Brier 비교·LOSO. 수치는 실측 그대로.

- [ ] **Step 4: Commit** (stack-records.json은 수 MB면 커밋, 10MB 초과 시 .gitignore 추가하고 재수집 가능 명시)

```bash
git add map/backtest/stack-lab.js map/backtest/stack-lab-out.txt map/backtest/stack-records.json
git commit -m "research(backtest): stack-lab — 6축 스태킹 방향 재도전 + Brier 해상도 실측"
```

---

### Task 7: 결과 종합·관문 판정 문서

**Files:**
- Create: `map/docs/plans/2026-07-12-direction-redefine-results.md`

**Interfaces:**
- Consumes: Task 4~6의 `*-out.txt` 실측 출력
- Produces: 트랙별 관문 판정표 + 채택/기각/보류 결론 + (채택 시) 엔진 통합 후보 목록 — 사용자 보고의 단일 근거 문서

- [ ] **Step 1: 결과 문서 작성** — 아래 골격에 `*-out.txt`의 실측 수치를 그대로 옮겨 채움(가공 금지). 골격:

```markdown
# 방향 예측 재정의 3트랙 — 실측 결과 (2026-07-12)

## 관문(사전 등록) 재확인
OOS 모든 공정 베이스라인 +1.5pp↑ · 전/후반 양수 · LOSO 유지. Track 3은 (a) 또는 (b) ECE≤2.5%+resolution↑.

## Track 1 상대 방향 (rel-lab-out.txt)
| H | base | 풀모델 | 최강 베이스라인 | lift | 모멘텀 증분 | 전/후반 | LOSO | 판정 |
(실측 수치)

## Track 2 초과 방향 (excess-lab-out.txt)
(동일 표 + vs0 대조에서 base 오염 확인 여부)

## Track 3 6축 스태킹 (stack-lab-out.txt)
| 지평 | 스태킹 | 항상상승 | lift | R:R 기여 | RES 배율 | ECE | 판정 |
(실측 수치)

## 종합 판정
- 채택: (관문 통과분 — 엔진 통합 후보와 근거)
- 기각: (미달분 — 수치와 함께. 재시도 불필요 여부 명시)
- 다음 단계 제안: (통합 계획 / 후속 실험)
```

- [ ] **Step 2: 판정 정합 자체검증** — 각 판정 셀이 관문 수치 기준과 일치하는지 표의 숫자로 재확인(예: lift +1.2pp인데 "통과"로 적혀 있으면 오류).

- [ ] **Step 3: Commit**

```bash
git add map/docs/plans/2026-07-12-direction-redefine-results.md
git commit -m "docs(backtest): 방향 재정의 3트랙 실측 결과·관문 판정"
```

---

## 후속(이 계획 범위 밖 — 결과 확인 후 별도 진행)

- 관문 통과분의 엔진 통합: 기존 패턴(train-*.js 계수 산출 → forge-core 상수·forecast 함수 → verdict.context → 판정바 셀 → 스코어카드 CHANGELOG·버전차트·BACKTEST_SUMMARY·라이브 원장) — 통과 축이 정해져야 정확한 코드가 나옴.
- 전부 기각 시: 스코어카드 CHANGELOG에 실험 wave 기록(실패도 기록 = 신뢰 서사) + 메모리 갱신.
```
