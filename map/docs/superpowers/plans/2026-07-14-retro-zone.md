# 회고 존 (Retro Zone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 백테스트 범위 안의 격리된 "회고 존"을 만들어, 엔진의 미스를 오류 귀속(지표 drop-ablation)으로 분석하고, 지표 재조합 후보를 정직한 관문(OOS/시간분할/종목일관성/자명규칙)으로 걸러 `retro-catalog.json`으로 산출한다.

**Architecture:** `map/backtest/retro/` 신규 격리 디렉토리. forge-core.js는 **무수정**(instrumentation 불필요) — 지표 기여는 노드를 그래프에서 제거하고 재실행한 `verdict.score` 변화(marginal ablation)로 측정한다. 파이프라인 5단(오류 원장 → 귀속 → 재조합 후보 → 게이트 → 대장)은 전부 결정론 순수 함수 + 한 개의 수집 러너로 구성되며, ablation 캐시(`retro-records.json`)가 귀속과 게이트 양쪽을 무추가연산으로 서빙한다.

**Tech Stack:** Vanilla Node.js (CommonJS), `node --test`, 기존 하네스 재사용(`forge-core.js`·`backtest.js`·`metrics.js`·`feat-lib.js`). 빌드 도구 없음.

## Global Constraints

- **forge-core.js 무수정**: 게이트 통과 전까지 엔진 파일에 손대지 않는다. 지표 기여는 그래프 조작(ablation)으로만 측정.
- **배포 제외**: `map/backtest/retro/` 전체는 배포 산출물이 아니다(랩 인프라 규율). 배포는 스쿱포지 7개 정적 파일 + `forge-api.php`만.
- **결정론**: 순수 모듈(regime/lib/attribution/remix/gate)에는 `Date.now()`·`Math.random()` 사용 금지(테스트 재현성). 수집 러너(`miss-ledger.js`·`build-catalog.js`)의 `Date.now()`는 **stderr 진행 로그 전용** — 캐시/대장 데이터에 절대 반영 금지(stack-lab.js 선례).
- **lookahead 금지**: 시점 t 예측 입력은 `[s0..t]`만(`t` 이후 캔들 사용 금지). 미래값 `a20`/`a60`은 채점에만 사용.
- **스누핑 차단(핵심)**: 진단(attribution)은 **train 레코드에서만** 도출하고, 게이트 채점은 **test 레코드에서만** 수행한다. 대장의 모든 개선 수치는 OOS(test)만 표기 — in-sample 수치 노출 금지.
- **채택 관문(사전 고정)**: `oosDelta ≥ +0.01(=1.0pp)` AND 전/후반 시간분할 양쪽 ≥0 AND 종목일관성 ≥0.5 AND 국면 내 수정정확도 ≥ 항상상승. 미달은 `no-improvement`, 표본<임계는 `insufficient-sample`. **"개선 없음"이 기대 기본값** — null도 대장에 기록.
- **horizon 규약**: 축 검증 지평 `H=20`(레코드 `a20`)을 방향 채점 기본값으로. `a60`도 저장(후속 분석용).
- **저자유도**: 진단 1건 → 재조합 변경 1개. v1은 **drop(지표 제거)만** 정확 지원(캐시로 무추가연산 채점). downweight/add(누락 지표)는 v2로 명시 유보.

---

## File Structure

```
map/backtest/retro/
  regime.js          # 국면 태깅 (순수)
  regime.test.js
  lib.js             # 방향·정확도·국면필터 공유 헬퍼 (순수)
  lib.test.js
  graph-ablate.js    # 지표 노드 열거 + 그래프 ablation (순수)
  graph-ablate.test.js
  miss-ledger.js     # 오류 원장 수집 러너 → retro-records.json (엔진 1패스+ablation)
  attribution.js     # train 레코드 → 진단 카드 (순수)
  attribution.test.js
  remix.js           # 진단 → 재조합 후보 (순수)
  remix.test.js
  gate.js            # 후보 → 게이트 판정 (순수, 캐시 채점)
  gate.test.js
  build-catalog.js   # 파이프라인 러너 → retro-catalog.json + 요약
  README.md          # 실행법·정직 주의·유보 범위
```

산출물(gitignore 아님, 배포 제외): `retro-records.json`(ablation 캐시, 대용량) · `retro-catalog.json`(대장).

---

### Task 1: 국면 태깅 (regime.js)

**Files:**
- Create: `map/backtest/retro/regime.js`
- Test: `map/backtest/retro/regime.test.js`

**Interfaces:**
- Produces: `regimeTags(price: number[], t: number) -> string[]` — 시점 t의 국면 태그. 추세 태그 1개(`trend-up`|`trend-down`|`trend-flat`) + 변동성 태그 1개(`vol-high`|`vol-mid`|`vol-low`). `t<200`이면 `["warmup"]`.
- Produces: `REGIMES: string[]` — 귀속이 순회할 국면 어휘(위 6개 + `all`).

- [ ] **Step 1: Write the failing test**

```javascript
// map/backtest/retro/regime.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { regimeTags, REGIMES } = require("./regime.js");

test("warmup before t=200", () => {
  const price = Array.from({ length: 210 }, (_, i) => 100 + i);
  assert.deepStrictEqual(regimeTags(price, 100), ["warmup"]);
});

test("uptrend + steady gives trend-up and a vol tag", () => {
  const price = Array.from({ length: 260 }, (_, i) => 100 * Math.pow(1.002, i)); // 완만 상승
  const tags = regimeTags(price, 255);
  assert.ok(tags.includes("trend-up"), "trend-up 기대: " + tags);
  assert.ok(tags.some(t => t.startsWith("vol-")), "vol 태그 기대: " + tags);
});

test("downtrend gives trend-down", () => {
  const price = Array.from({ length: 260 }, (_, i) => 100 * Math.pow(0.998, i));
  assert.ok(regimeTags(price, 255).includes("trend-down"));
});

test("REGIMES includes all pseudo-regime and 6 concrete tags", () => {
  assert.ok(REGIMES.includes("all"));
  ["trend-up", "trend-down", "trend-flat", "vol-high", "vol-mid", "vol-low"].forEach(g =>
    assert.ok(REGIMES.includes(g), g));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd map/backtest/retro && node --test regime.test.js`
Expected: FAIL — `Cannot find module './regime.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// map/backtest/retro/regime.js — 국면 태깅(순수, 결정론)
"use strict";

function _sma(p, t, n) { let s = 0; for (let i = t - n + 1; i <= t; i++) s += p[i]; return s / n; }
function _rv(p, t, n) { let s = 0; for (let i = t - n + 1; i <= t; i++) { const r = Math.log(p[i] / p[i - 1]); s += r * r; } return Math.sqrt(s / n); }

// 시점 t의 국면 태그: 추세 1 + 변동성 1. t<200이면 warmup.
function regimeTags(price, t) {
  if (t < 200 || t >= price.length) return ["warmup"];
  const tags = [];
  const ma50 = _sma(price, t, 50), ma200 = _sma(price, t, 200), px = price[t];
  if (px > ma50 && ma50 > ma200) tags.push("trend-up");
  else if (px < ma50 && ma50 < ma200) tags.push("trend-down");
  else tags.push("trend-flat");
  const v20 = _rv(price, t, 20), v120 = _rv(price, t, 120);
  tags.push(v20 > v120 * 1.15 ? "vol-high" : v20 < v120 * 0.85 ? "vol-low" : "vol-mid");
  return tags;
}

const REGIMES = ["all", "trend-up", "trend-down", "trend-flat", "vol-high", "vol-mid", "vol-low"];

module.exports = { regimeTags, REGIMES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd map/backtest/retro && node --test regime.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/regime.js map/backtest/retro/regime.test.js
git commit -m "feat(retro): 국면 태깅(추세·변동성) 순수 모듈"
```

---

### Task 2: 방향·정확도 공유 헬퍼 (lib.js)

**Files:**
- Create: `map/backtest/retro/lib.js`
- Test: `map/backtest/retro/lib.test.js`

**Interfaces:**
- Consumes: 레코드 스키마 `{ sym, t, base, a20, a60, score, up, regime: string[], ab: { [indId]: { score } } }` (Task 4가 생성).
- Produces:
  - `realDir(rec, hKey="a20") -> -1|0|1` — 실제 미래 방향 `sign(rec[hKey]-rec.base)`.
  - `predDir(score) -> -1|1` — 예측 방향 `score>=0?1:-1`.
  - `inRegime(rec, g) -> bool` — `g==="all"` 또는 `rec.regime.includes(g)`.
  - `accBase(recs, hKey?) -> number|null` — 기본 전략 방향 정확도(realDir≠0만).
  - `accMod(recs, g, indId, hKey?) -> number|null` — 국면 g 안에서 지표 indId를 drop한 수정 전략 정확도(g 밖은 base score, g 안은 ab[indId].score; ab 없으면 base로 폴백).
  - `indicatorIds(recs) -> string[]` — 레코드 ab 키의 합집합.

- [ ] **Step 1: Write the failing test**

```javascript
// map/backtest/retro/lib.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./lib.js");

// z가 국면 g에서 항상 반대로 밀어 base를 틀리게 만든 합성 레코드
function rec(sym, t, base, a20, score, abScore, g) {
  return { sym, t, base, a20, a60: a20, score, up: 50, regime: [g], ab: { z: { score: abScore } } };
}

test("realDir/predDir 기본", () => {
  assert.strictEqual(L.realDir({ base: 100, a20: 110 }), 1);
  assert.strictEqual(L.realDir({ base: 100, a20: 90 }), -1);
  assert.strictEqual(L.predDir(-0.2), -1);
  assert.strictEqual(L.predDir(0), 1);
});

test("inRegime: all matches everything", () => {
  assert.ok(L.inRegime({ regime: ["vol-high"] }, "all"));
  assert.ok(L.inRegime({ regime: ["vol-high"] }, "vol-high"));
  assert.ok(!L.inRegime({ regime: ["vol-high"] }, "trend-up"));
});

test("accMod: dropping a betraying indicator raises accuracy in-regime", () => {
  // base score 양수인데 실제 하락(오답) → z drop 시 abScore 음수(정답)
  const recs = [
    rec("A", 1, 100, 90, +0.3, -0.3, "vol-high"),
    rec("A", 2, 100, 80, +0.4, -0.4, "vol-high"),
  ];
  assert.strictEqual(L.accBase(recs), 0);          // 둘 다 base 오답
  assert.strictEqual(L.accMod(recs, "vol-high", "z"), 1); // drop하면 둘 다 정답
  assert.strictEqual(L.accMod(recs, "trend-up", "z"), 0); // 다른 국면이면 무변화
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd map/backtest/retro && node --test lib.test.js`
Expected: FAIL — `Cannot find module './lib.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// map/backtest/retro/lib.js — 방향·정확도·국면필터 공유 헬퍼(순수)
"use strict";

function realDir(rec, hKey = "a20") { return Math.sign(rec[hKey] - rec.base); }
function predDir(score) { return score >= 0 ? 1 : -1; }
function inRegime(rec, g) { return g === "all" || (rec.regime && rec.regime.includes(g)); }

function accBase(recs, hKey = "a20") {
  let hit = 0, n = 0;
  for (const r of recs) { const rd = realDir(r, hKey); if (rd === 0) continue; n++; if (predDir(r.score) === rd) hit++; }
  return n ? hit / n : null;
}

// 국면 g 안에서 indId를 drop한 수정 전략의 정확도. g 밖 또는 ab 없으면 base score 사용.
function accMod(recs, g, indId, hKey = "a20") {
  let hit = 0, n = 0;
  for (const r of recs) {
    const rd = realDir(r, hKey); if (rd === 0) continue; n++;
    const useAb = inRegime(r, g) && r.ab && r.ab[indId];
    const sc = useAb ? r.ab[indId].score : r.score;
    if (predDir(sc) === rd) hit++;
  }
  return n ? hit / n : null;
}

function indicatorIds(recs) {
  const s = new Set();
  for (const r of recs) if (r.ab) for (const k of Object.keys(r.ab)) s.add(k);
  return [...s];
}

module.exports = { realDir, predDir, inRegime, accBase, accMod, indicatorIds };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd map/backtest/retro && node --test lib.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/lib.js map/backtest/retro/lib.test.js
git commit -m "feat(retro): 방향·정확도·국면필터 공유 헬퍼"
```

---

### Task 3: 그래프 ablation (graph-ablate.js)

**Files:**
- Create: `map/backtest/retro/graph-ablate.js`
- Test: `map/backtest/retro/graph-ablate.test.js`

**Interfaces:**
- Produces: `listIndicatorNodes(graph) -> {id, blockType}[]` — ablation 대상 지표 노드(비지표 blockType 제외: `ticker`·`price`·`combine`·`predict`, `kind!=="block"` 제외).
- Produces: `ablateGraph(graph, nodeId) -> graph` — 깊은 복제 후 nodeId 노드와 그를 참조하는 엣지 전부 제거(원본 불변).

- [ ] **Step 1: Write the failing test**

```javascript
// map/backtest/retro/graph-ablate.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const FC = require("../../forge-core.js");
const { listIndicatorNodes, ablateGraph } = require("./graph-ablate.js");

test("listIndicatorNodes excludes ticker/price/combine/predict", () => {
  const g = FC.sampleGraph();
  const inds = listIndicatorNodes(g);
  const types = new Set(inds.map(n => n.blockType));
  ["ticker", "price", "combine", "predict"].forEach(t => assert.ok(!types.has(t), "제외 실패: " + t));
  assert.ok(inds.some(n => n.blockType === "rsi"), "rsi 지표 포함 기대");
});

test("ablateGraph removes node and its edges, leaves original intact", () => {
  const g = FC.sampleGraph();
  const n0 = g.nodes.length, e0 = g.edges.length;
  const ab = ablateGraph(g, "s_rsi");
  assert.strictEqual(ab.nodes.filter(n => n.id === "s_rsi").length, 0);
  assert.strictEqual(ab.edges.filter(e => e.from === "s_rsi" || e.to === "s_rsi").length, 0);
  assert.strictEqual(g.nodes.length, n0, "원본 노드 불변");
  assert.strictEqual(g.edges.length, e0, "원본 엣지 불변");
});

test("ablated graph still runs and yields a different score", () => {
  const g = FC.sampleGraph(); g.nodes.forEach(n => { if (n.conviction) n.conviction = 0; });
  const price = Array.from({ length: 320 }, (_, i) => 100 * Math.pow(1.0015, i) * (1 + 0.01 * Math.sin(i * 0.6)));
  const candle = price.map((c, i) => ({ o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 }));
  const past = { price, candle };
  const base = FC.run(g, past, { futW: 20, timeframe: "1day" });
  const ab = FC.run(ablateGraph(g, "s_ma"), past, { futW: 20, timeframe: "1day" });
  assert.ok(base.verdict && ab.verdict, "둘 다 실행되어야");
  assert.notStrictEqual(base.verdict.score, ab.verdict.score, "지표 제거 시 score 변화 기대");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd map/backtest/retro && node --test graph-ablate.test.js`
Expected: FAIL — `Cannot find module './graph-ablate.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// map/backtest/retro/graph-ablate.js — 지표 노드 열거 + 그래프 ablation(순수)
"use strict";

const NON_INDICATOR = new Set(["ticker", "price", "combine", "predict"]);

function listIndicatorNodes(graph) {
  return (graph.nodes || [])
    .filter(n => n.kind === "block" && !NON_INDICATOR.has(n.blockType))
    .map(n => ({ id: n.id, blockType: n.blockType }));
}

// nodeId 노드와 그를 참조하는 엣지 제거. 깊은 복제(원본 불변).
function ablateGraph(graph, nodeId) {
  const g = JSON.parse(JSON.stringify(graph));
  g.nodes = (g.nodes || []).filter(n => n.id !== nodeId);
  g.edges = (g.edges || []).filter(e => e.from !== nodeId && e.to !== nodeId);
  return g;
}

module.exports = { listIndicatorNodes, ablateGraph };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd map/backtest/retro && node --test graph-ablate.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/graph-ablate.js map/backtest/retro/graph-ablate.test.js
git commit -m "feat(retro): 지표 노드 열거 + 그래프 ablation"
```

---

### Task 4: 오류 원장 수집 러너 (miss-ledger.js)

**Files:**
- Create: `map/backtest/retro/miss-ledger.js`
- Test: `map/backtest/retro/miss-ledger.test.js`

**Interfaces:**
- Consumes: `regimeTags`(Task 1), `listIndicatorNodes`/`ablateGraph`(Task 3), `FC.run`·`BT.standardGraph`·`M.upProbFromPrediction`.
- Produces (모듈 export, 테스트용): `collectFixture(fixture, opts) -> record[]` — 한 픽스처의 레코드 배열. 레코드 스키마: `{ sym, t, base, a20, a60, score, up, regime: string[], ab: { [nodeId]: { score } } }`.
- Produces (CLI): `node miss-ledger.js [--recollect]` → `retro-records.json` 기록.
- 상수: `WARMUP=280`, `STRIDE=20`, `LOOKBACK=600`, `H=60`, `H2=20`. 기본 ablation 대상 = 핵심 지표(`CORE` 화이트리스트에 속한 present 지표); `RETRO_ALL_INDS=1` 시 전 지표.

- [ ] **Step 1: Write the failing test**

```javascript
// map/backtest/retro/miss-ledger.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const BT = require("../backtest.js");
const { collectFixture } = require("./miss-ledger.js");

test("collectFixture yields records with ablation scores and regime tags", () => {
  const fx = BT.makeSyntheticFixture("SYNTH", "1day", { n: 360, drift: 0.001, vol: 0.012 });
  const recs = collectFixture(fx, { stride: 40 }); // 빠른 테스트용 큰 stride
  assert.ok(recs.length > 0, "레코드 생성 기대");
  const r = recs[0];
  assert.strictEqual(r.sym, "SYNTH");
  assert.ok(Number.isFinite(r.base) && Number.isFinite(r.a20) && Number.isFinite(r.a60));
  assert.ok(Array.isArray(r.regime) && r.regime.length >= 1);
  assert.ok(r.ab && Object.keys(r.ab).length >= 1, "ablation 최소 1개 지표");
  for (const k of Object.keys(r.ab)) assert.ok(Number.isFinite(r.ab[k].score), "ab score 유한");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd map/backtest/retro && node --test miss-ledger.test.js`
Expected: FAIL — `Cannot find module './miss-ledger.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd map/backtest/retro && node --test miss-ledger.test.js`
Expected: PASS (1 test, ~수초)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/miss-ledger.js map/backtest/retro/miss-ledger.test.js
git commit -m "feat(retro): 오류 원장 수집 러너(엔진 ablation 1패스)"
```

---

### Task 5: 오류 귀속 (attribution.js)

**Files:**
- Create: `map/backtest/retro/attribution.js`
- Test: `map/backtest/retro/attribution.test.js`

**Interfaces:**
- Consumes: `lib.js`(`accBase`/`accMod`/`inRegime`/`indicatorIds`/`realDir`), `regime.js`(`REGIMES`).
- Produces: `attribute(trainRecords, opts) -> diagnosis[]`. 진단 스키마: `{ regime, indicator, kind: "betray", stat: { trainGain, n } }`. `opts`: `{ minN=200, topPerRegime=3, minGain=0.005, hKey="a20" }`.
  - 국면 g마다 realDir≠0 & inRegime 레코드가 `minN` 이상일 때만 평가. 각 지표 z에 대해 `trainGain = accMod(train,g,z) - accBase(train)`. `trainGain > minGain` 상위 `topPerRegime`개를 진단으로.

- [ ] **Step 1: Write the failing test**

```javascript
// map/backtest/retro/attribution.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { attribute } = require("./attribution.js");

// vol-high 국면에서 지표 z가 base를 반대로 밀어 틀리게 하는 합성 train
function mk(n) {
  const recs = [];
  for (let i = 0; i < n; i++) {
    const up = i % 2 === 0;                    // 절반 상승/하락
    const a20 = up ? 110 : 90;
    // base는 vol-high에서 항상 반대(오답), z drop 시 정답 방향
    const g = i < n * 0.7 ? "vol-high" : "trend-up";
    const score = up ? -0.3 : +0.3;            // base 오답
    const abZ = up ? +0.3 : -0.3;              // z 제거 시 정답
    recs.push({ sym: "A", t: i, base: 100, a20, a60: a20, score, up: 50, regime: [g], ab: { z: { score: abZ }, w: { score } } });
  }
  return recs;
}

test("attribute surfaces the betraying indicator in its regime", () => {
  const diags = attribute(mk(600), { minN: 100, minGain: 0.01 });
  const hit = diags.find(d => d.indicator === "z" && d.regime === "vol-high");
  assert.ok(hit, "vol-high에서 z 배신 진단 기대: " + JSON.stringify(diags));
  assert.ok(hit.stat.trainGain > 0.01, "trainGain>0.01");
  assert.strictEqual(hit.kind, "betray");
});

test("no diagnosis when regime sample below minN", () => {
  const diags = attribute(mk(60), { minN: 500 });
  assert.strictEqual(diags.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd map/backtest/retro && node --test attribution.test.js`
Expected: FAIL — `Cannot find module './attribution.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// map/backtest/retro/attribution.js — train 레코드 → 진단 카드(순수)
"use strict";
const { REGIMES } = require("./regime.js");
const { accBase, accMod, inRegime, indicatorIds, realDir } = require("./lib.js");

function attribute(train, opts = {}) {
  const { minN = 200, topPerRegime = 3, minGain = 0.005, hKey = "a20" } = opts;
  const inds = indicatorIds(train);
  const baseAcc = accBase(train, hKey);
  const out = [];
  for (const g of REGIMES) {
    const gN = train.filter(r => realDir(r, hKey) !== 0 && inRegime(r, g)).length;
    if (gN < minN) continue;
    const cand = inds.map(z => ({ indicator: z, trainGain: accMod(train, g, z, hKey) - baseAcc, n: gN }));
    cand.sort((a, b) => b.trainGain - a.trainGain);
    for (const c of cand.slice(0, topPerRegime)) {
      if (c.trainGain <= minGain) continue;
      out.push({ regime: g, indicator: c.indicator, kind: "betray", stat: { trainGain: c.trainGain, n: c.n } });
    }
  }
  return out;
}

module.exports = { attribute };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd map/backtest/retro && node --test attribution.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/attribution.js map/backtest/retro/attribution.test.js
git commit -m "feat(retro): 오류 귀속 — 국면별 지표 배신 진단"
```

---

### Task 6: 재조합 후보 (remix.js)

**Files:**
- Create: `map/backtest/retro/remix.js`
- Test: `map/backtest/retro/remix.test.js`

**Interfaces:**
- Consumes: 진단 스키마(Task 5).
- Produces: `candidatesFrom(diagnoses) -> candidate[]`. 후보 스키마: `{ id, regime, change: { op: "drop", indId }, rationale, sourceDiag }`. `id`는 결정론(`retro-<regime>-drop-<indId>`). `rationale`는 한국어 자연어.

- [ ] **Step 1: Write the failing test**

```javascript
// map/backtest/retro/remix.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { candidatesFrom } = require("./remix.js");

test("each diagnosis becomes one drop candidate with deterministic id", () => {
  const diags = [{ regime: "vol-high", indicator: "z", kind: "betray", stat: { trainGain: 0.03, n: 400 } }];
  const cands = candidatesFrom(diags);
  assert.strictEqual(cands.length, 1);
  const c = cands[0];
  assert.strictEqual(c.id, "retro-vol-high-drop-z");
  assert.deepStrictEqual(c.change, { op: "drop", indId: "z" });
  assert.strictEqual(c.regime, "vol-high");
  assert.ok(/z/.test(c.rationale) && /vol-high/.test(c.rationale), "근거에 지표·국면 포함");
});

test("deduplicates identical (regime, indicator) diagnoses", () => {
  const d = { regime: "all", indicator: "z", kind: "betray", stat: { trainGain: 0.02, n: 900 } };
  assert.strictEqual(candidatesFrom([d, d]).length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd map/backtest/retro && node --test remix.test.js`
Expected: FAIL — `Cannot find module './remix.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// map/backtest/retro/remix.js — 진단 → 재조합 후보(순수, 저자유도: drop만)
"use strict";

function candidatesFrom(diagnoses) {
  const seen = new Set(), out = [];
  for (const d of diagnoses) {
    const id = "retro-" + d.regime + "-drop-" + d.indicator;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      regime: d.regime,
      change: { op: "drop", indId: d.indicator },
      rationale: "국면 '" + d.regime + "'에서 지표 '" + d.indicator + "'가 방향을 반대로 밀어(train 개선 +" +
        (d.stat.trainGain * 100).toFixed(1) + "pp). 이 국면에서 제외 검토.",
      sourceDiag: d,
    });
  }
  return out;
}

module.exports = { candidatesFrom };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd map/backtest/retro && node --test remix.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/remix.js map/backtest/retro/remix.test.js
git commit -m "feat(retro): 재조합 후보 생성(drop, 결정론 id)"
```

---

### Task 7: 승격 게이트 (gate.js)

**Files:**
- Create: `map/backtest/retro/gate.js`
- Test: `map/backtest/retro/gate.test.js`

**Interfaces:**
- Consumes: `lib.js`(`accBase`/`accMod`/`inRegime`/`realDir`), 후보 스키마(Task 6).
- Produces: `gateCandidate(candidate, testRecords, opts) -> { verdict, evidence }`.
  - `verdict ∈ {"adopt","no-improvement","insufficient-sample"}`.
  - `evidence = { oosDelta, halves:[h1,h2], symbolConsistency, modAcc, curAcc, modAccG, alwaysUp, n }` (전부 test 기준).
  - `opts`: `{ minN=100, minDelta=0.01, hKey="a20" }`.
  - 판정: `n(국면 test) < minN` → insufficient-sample. 아니면 `pass = oosDelta≥minDelta && h1≥0 && h2≥0 && symbolConsistency≥0.5 && modAccG≥alwaysUp` → adopt/no-improvement.

- [ ] **Step 1: Write the failing test**

```javascript
// map/backtest/retro/gate.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { gateCandidate } = require("./gate.js");

// z가 vol-high에서 항상 배신(drop하면 정답). 시간·종목 일관되게 배치.
function mkTest(n) {
  const recs = [];
  for (let i = 0; i < n; i++) {
    const up = i % 2 === 0, a20 = up ? 110 : 90;
    recs.push({
      sym: i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "C", t: i,
      base: 100, a20, a60: a20,
      score: up ? -0.3 : +0.3,               // base 오답
      up: 50, regime: ["vol-high"], ab: { z: { score: up ? +0.3 : -0.3 } },
    });
  }
  return recs;
}
const CAND = { id: "retro-vol-high-drop-z", regime: "vol-high", change: { op: "drop", indId: "z" } };

test("adopts a candidate that robustly fixes misses OOS", () => {
  const r = gateCandidate(CAND, mkTest(300), { minN: 50 });
  assert.strictEqual(r.verdict, "adopt", JSON.stringify(r.evidence));
  assert.ok(r.evidence.oosDelta > 0.4);
  assert.ok(r.evidence.halves[0] >= 0 && r.evidence.halves[1] >= 0);
  assert.strictEqual(r.evidence.symbolConsistency, 1);
});

test("insufficient-sample when regime test set below minN", () => {
  const r = gateCandidate(CAND, mkTest(40), { minN: 100 });
  assert.strictEqual(r.verdict, "insufficient-sample");
});

test("no-improvement when drop does not help (indicator was neutral)", () => {
  // ab score == base score → 변화 없음
  const recs = mkTest(300).map(x => ({ ...x, ab: { z: { score: x.score } } }));
  const r = gateCandidate(CAND, recs, { minN: 50 });
  assert.strictEqual(r.verdict, "no-improvement");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd map/backtest/retro && node --test gate.test.js`
Expected: FAIL — `Cannot find module './gate.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// map/backtest/retro/gate.js — 후보 → 게이트 판정(순수, 캐시 채점, OOS만)
"use strict";
const { accBase, accMod, inRegime, realDir } = require("./lib.js");

function gateCandidate(candidate, test, opts = {}) {
  const { minN = 100, minDelta = 0.01, hKey = "a20" } = opts;
  const g = candidate.regime, z = candidate.change.indId;
  const valid = test.filter(r => realDir(r, hKey) !== 0);
  const gTest = valid.filter(r => inRegime(r, g));
  if (gTest.length < minN) return { verdict: "insufficient-sample", evidence: { n: gTest.length } };

  const curAcc = accBase(valid, hKey);
  const modAcc = accMod(valid, g, z, hKey);
  const oosDelta = modAcc - curAcc;

  const sorted = valid.slice().sort((a, b) => (a.t - b.t) || (a.sym < b.sym ? -1 : 1));
  const mid = Math.floor(sorted.length / 2);
  const h1 = accMod(sorted.slice(0, mid), g, z, hKey) - accBase(sorted.slice(0, mid), hKey);
  const h2 = accMod(sorted.slice(mid), g, z, hKey) - accBase(sorted.slice(mid), hKey);

  const syms = [...new Set(valid.map(r => r.sym))];
  let pos = 0, tot = 0;
  for (const s of syms) {
    const sr = valid.filter(r => r.sym === s);
    if (!sr.some(r => inRegime(r, g))) continue;
    tot++; if ((accMod(sr, g, z, hKey) - accBase(sr, hKey)) >= 0) pos++;
  }
  const symbolConsistency = tot ? pos / tot : 0;

  const alwaysUp = gTest.filter(r => realDir(r, hKey) > 0).length / gTest.length;
  const modAccG = accMod(gTest, g, z, hKey);

  const pass = oosDelta >= minDelta && h1 >= 0 && h2 >= 0 && symbolConsistency >= 0.5 && modAccG >= alwaysUp;
  return {
    verdict: pass ? "adopt" : "no-improvement",
    evidence: { oosDelta, halves: [h1, h2], symbolConsistency, modAcc, curAcc, modAccG, alwaysUp, n: gTest.length },
  };
}

module.exports = { gateCandidate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd map/backtest/retro && node --test gate.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/gate.js map/backtest/retro/gate.test.js
git commit -m "feat(retro): 승격 게이트 — OOS/시간분할/종목일관성/자명규칙"
```

---

### Task 8: 파이프라인 러너 + 대장 + README (build-catalog.js)

**Files:**
- Create: `map/backtest/retro/build-catalog.js`
- Create: `map/backtest/retro/README.md`

**Interfaces:**
- Consumes: `miss-ledger.js`(`CACHE`/`collectAll`), `attribution.js`, `remix.js`, `gate.js`, `feat-lib.js`(`splitIdx`).
- Produces (CLI): `node build-catalog.js` → `retro-catalog.json` + stderr 정직 요약.
- 대장 스키마: `{ id, diagnosis, remix, verdict, evidence, promoted:false }[]` (스펙 §D와 정합). train/test = 종목별 시간 60/40 분할(`splitIdx`).

- [ ] **Step 1: Write the runner**

```javascript
// map/backtest/retro/build-catalog.js — 회고 파이프라인 러너 → retro-catalog.json
"use strict";
const fs = require("fs"), path = require("path");
const F = require("../feat-lib.js");
const { CACHE, collectAll } = require("./miss-ledger.js");
const { attribute } = require("./attribution.js");
const { candidatesFrom } = require("./remix.js");
const { gateCandidate } = require("./gate.js");

const OUT = path.join(__dirname, "retro-catalog.json");

function splitBySymbol(recs) {
  const bySym = {}; for (const r of recs) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const train = [], test = [];
  for (const s of Object.keys(bySym)) {
    const a = bySym[s].slice().sort((x, y) => x.t - y.t);
    const k = F.splitIdx(a.length);           // 60% 시점 분할(시간순)
    train.push(...a.slice(0, k)); test.push(...a.slice(k));
  }
  return { train, test };
}

function main() {
  let recs;
  if (fs.existsSync(CACHE)) recs = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  else { console.error("retro-records.json 없음 — 수집 실행…"); recs = collectAll(); }
  console.error("레코드 " + recs.length + " · 종목 " + new Set(recs.map(r => r.sym)).size);

  const { train, test } = splitBySymbol(recs);
  const diagnoses = attribute(train);
  const candidates = candidatesFrom(diagnoses);
  console.error("진단 " + diagnoses.length + " → 후보 " + candidates.length);

  const catalog = candidates.map(c => {
    const g = gateCandidate(c, test);
    return { id: c.id, diagnosis: c.sourceDiag, remix: { change: c.change, rationale: c.rationale }, verdict: g.verdict, evidence: g.evidence, promoted: false };
  });
  fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2));

  const by = k => catalog.filter(e => e.verdict === k).length;
  console.error("\n=== 회고 대장 요약 ===");
  console.error("후보 " + catalog.length + " · 채택 " + by("adopt") + " · 개선없음 " + by("no-improvement") + " · 표본부족 " + by("insufficient-sample"));
  const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";
  for (const e of catalog.filter(e => e.verdict === "adopt").sort((a, b) => b.evidence.oosDelta - a.evidence.oosDelta)) {
    console.error("  [채택] " + e.id + "  OOS " + pp(e.evidence.oosDelta) + " · 종목일관 " + (e.evidence.symbolConsistency * 100).toFixed(0) + "% · n=" + e.evidence.n);
  }
  if (by("adopt") === 0) console.error("  (채택 0 — '가격 재조합=새 정보 0' 벽. 예상된 정직 결과. 대장에 null도 기록됨)");
  console.error("→ retro-catalog.json 기록됨");
}

if (require.main === module) main();
module.exports = { splitBySymbol };
```

- [ ] **Step 2: Write the README**

```markdown
<!-- map/backtest/retro/README.md -->
# 회고 존 (Retro Zone)

백테스트 안의 격리된 회고분석 영역. 엔진의 미스를 오류 귀속으로 분석해 **지표 재조합 후보**를 발굴하고, 정직한 관문으로 걸러 `retro-catalog.json`으로 산출한다. **forge-core.js는 무수정** — 지표 기여는 그래프에서 노드를 빼고 재실행한 score 변화(ablation)로 측정한다.

설계: `docs/superpowers/specs/2026-07-14-retro-zone-design.md`

## 실행

```bash
# 1) 오류 원장 수집(엔진 ablation 1패스 — 수십 분, 캐시됨)
node backtest/retro/miss-ledger.js            # retro-records.json 생성
#    전 지표 ablation: RETRO_ALL_INDS=1 node backtest/retro/miss-ledger.js
# 2) 파이프라인 → 대장
node backtest/retro/build-catalog.js          # retro-catalog.json + 요약
# 3) 단위 테스트
node --test backtest/retro/*.test.js
```

## 정직 규율

- 진단은 **train**에서만, 게이트 채점은 **test**에서만(스누핑 차단). 대장의 개선 수치는 전부 OOS.
- **"개선 없음"이 기대 기본값**("가격 재조합=새 정보 0" 벽). null도 대장에 기록 — 그것도 정보.
- 배포 제외. `retro-records.json`·`retro-catalog.json`은 서버·배포에 올리지 않는다.

## v1 유보 범위

- **drop(지표 제외)만** 정확 지원. downweight(감가)·add(누락 지표 투입)는 v2.
- 진단 kind는 `betray`(제외 시 개선)만. `overconfident`·`missing`은 v2.
- ablation 대상 기본 = 핵심 Lv1+Lv2 지표(`CORE`). 전 지표는 `RETRO_ALL_INDS=1`.
- 채택분의 forge-core 실제 반영(국면조건부 드리프트 조정)은 대장에 채택이 나온 뒤 별도 커밋.
- R3 사용자 선택 심화 UI는 2차 스펙(대장 스키마가 데이터 계약).
```

- [ ] **Step 3: Verify the runner on synthetic data (no full collect needed)**

임시 스모크: 합성 픽스처로 소량 레코드를 만들어 파이프라인이 끝까지 도는지 확인.

Run:
```bash
cd map/backtest/retro && node -e "
const BT=require('../backtest.js'), ml=require('./miss-ledger.js');
const {splitBySymbol}=require('./build-catalog.js');
const {attribute}=require('./attribution.js'), {candidatesFrom}=require('./remix.js'), {gateCandidate}=require('./gate.js');
let recs=[]; for(const s of ['P','Q','R']) recs=recs.concat(ml.collectFixture(BT.makeSyntheticFixture(s,'1day',{n:420,drift:0.001,vol:0.013}),{stride:30}));
const {train,test}=splitBySymbol(recs);
const cands=candidatesFrom(attribute(train,{minN:20,minGain:0.005}));
console.log('recs',recs.length,'cands',cands.length);
const cat=cands.map(c=>({id:c.id,...gateCandidate(c,test,{minN:20})}));
console.log('verdicts',cat.map(e=>e.verdict));
console.log('OK pipeline runs end-to-end');
"
```
Expected: `recs N` (N>0), `cands` 출력, `OK pipeline runs end-to-end` — 예외 없이 완료. (합성 데이터라 채택 여부는 무의미, 파이프라인 무결성만 확인.)

- [ ] **Step 4: Commit**

```bash
git add map/backtest/retro/build-catalog.js map/backtest/retro/README.md
git commit -m "feat(retro): 파이프라인 러너 + 대장 산출 + README"
```

- [ ] **Step 5: (선택) 실데이터 첫 수집·대장 산출** — 시간 여유 시

```bash
cd map && node backtest/retro/miss-ledger.js && node backtest/retro/build-catalog.js
```
Expected: 요약에 채택/개선없음/표본부족 카운트. **채택 0이 정상적 가능 결과**(정직 노선). 결과를 스코어카드 개선이력에 기록([[scoopforge-scorecard-changelog]] 규율) — 채택 0이어도 "회고 존 v1 가동, 채택 N건" 한 줄.

---

## Self-Review

**1. Spec coverage:**
- R1(격리 관리 존) → Task 1–8 전부 `retro/` 격리, forge-core 무수정. ✅
- R2(단방향 승격 게이트) → Task 7 gate + Task 8 대장 `promoted:false`, 실제 반영은 별도 커밋으로 유보 명시. ✅
- R3(사용자 선택 심화) → 범위 밖(2차). 대장 스키마(Task 8)가 데이터 계약. README·plan에 유보 명시. ✅
- 오류귀속 5단(원장→귀속→후보→게이트→대장) → Task 4/5/6/7/8. ✅
- 정직 원칙(train/test 분리, OOS만 표기) → Global Constraints + Task 5(train)·Task 7/8(test). ✅
- 저자유도·drop만·유보(add/downweight/overconfident/missing) → README v1 유보 범위. ✅

**2. Placeholder scan:** 모든 스텝에 실제 코드·명령·기대출력 포함. "적절한 처리"류 없음. ✅

**3. Type consistency:** 레코드 스키마 `{sym,t,base,a20,a60,score,up,regime[],ab:{[id]:{score}}}`는 Task 4 생성 → Task 2/5/7 소비 일관. 후보 스키마 `{id,regime,change:{op,indId},rationale,sourceDiag}`는 Task 6 생성 → Task 7/8 소비 일관. 진단 `{regime,indicator,kind,stat:{trainGain,n}}`는 Task 5 생성 → Task 6 소비(`d.regime`/`d.indicator`/`d.stat.trainGain`) 일관. `accMod(recs,g,indId,hKey)` 시그니처 Task 2 정의 → Task 5/7 동일 호출. ✅
```
