# 회고 존 v2 (누락 지표 add + up 기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회고 존을 up 기반으로 전환하고 누락 지표 add를 측정해, drop+add를 합쳐 "지표 membership으로는 방향 예측 개선 불가"를 실측 종결한다.

**Architecture:** v1의 `map/backtest/retro/` 8모듈을 **in-place 진화** + 신규 `add-defs.js` 1개. 방향 판정을 `sign(score)`→`up≥50`(예측 경로/드리프트 기반)으로 바꾸고, drop-ablation(`ab`)과 대칭으로 add-injection(`addAb`)을 수집한다. forge-core.js는 무수정 — add도 노드 추가+combine 배선+재실행으로만 측정한다.

**Tech Stack:** Vanilla Node.js (CommonJS), `node --test`, 기존 하네스 재사용. 빌드 도구 없음.

## Global Constraints

- **forge-core.js 무수정.** add는 그래프 조작(노드 추가)으로만.
- **배포 제외 + gitignore**(이미 `map/.gitignore`에 `retro-records.json`·`retro-catalog.json` 등록됨).
- **lookahead 금지**: 시점 t 엔진 입력은 `[s0..t]`만. `a20`/`a60`은 채점 전용.
- **결정론**: 순수 모듈(add-defs/regime/lib/attribution/remix/gate) `Date.now()`·`Math.random()` 금지. 러너(miss-ledger/build-catalog)의 `Date.now()`는 stderr 진행 로그 전용, 데이터 미반영.
- **스누핑 차단**: 진단은 train, 게이트 채점은 test. 대장 개선 수치 전부 OOS.
- **up 기반(핵심 전환)**: 방향 판정 = `predDir(up) = (up==null?50:up) >= 50 ? 1 : -1`. `realDir` 불변(`sign(a20-base)`). v1의 `score` 기반은 폐기.
- **레코드 스키마 v2 EXACT**: `{ sym, t, base, a20, a60, up, regime:string[], ab:{[id]:{up}}, addAb:{[blockType]:{up}} }`. **`score` 필드 없음.**
- **누락 지표 기본 파라미터(BLOCK_DEFS forge-state.js:210-220, verbatim)**: `pivot:{}` · `psar:{step:0.02,max:0.2}` · `keltner:{len:20,atrLen:10,mult:2}` · `donchian:{len:20}` · `cci:{period:20}` · `roc:{period:12}` · `williams:{period:14}` · `ao:{fast:5,slow:34}` · `aroon:{period:25}` · `mfi:{period:14}` · `cmf:{period:20}`.
- **accMod 시그니처 EXACT**: `accMod(recs, g, key, hKey="a20", map="ab")` — `map`은 `"ab"`(drop) 또는 `"addAb"`(add). attribution·gate가 의존.

## File Structure

```
map/backtest/retro/
  add-defs.js         # NEW: 누락 11종 기본 파라미터 + ABSENT 목록 (순수)
  add-defs.test.js    # NEW
  graph-ablate.js     # +addIndicatorNode (combine 배선)
  lib.js              # up 기반 전환 + map-aware accMod/indicatorIds
  miss-ledger.js      # ab(up)+addAb(up) 수집, score 필드 제거
  attribution.js      # drop(betray)+add(missing) 진단
  remix.js            # op drop/add
  gate.js             # change.op로 ab/addAb 분기 (T7 마이너 해결)
  build-catalog.js    # 통합 대장 + not-measured + 종결 요약
  regime.js           # 불변
```

---

### Task 1: 누락 지표 기본 파라미터 (add-defs.js)

**Files:**
- Create: `map/backtest/retro/add-defs.js`
- Test: `map/backtest/retro/add-defs.test.js`

**Interfaces:**
- Produces: `ABSENT_DEFAULTS: { [blockType]: params }` — 표준 그래프에 없는 11종의 검증된 기본 파라미터.
- Produces: `ABSENT: string[]` — `Object.keys(ABSENT_DEFAULTS)` (11종).

- [ ] **Step 1: Write the failing test**

```javascript
// map/backtest/retro/add-defs.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { ABSENT_DEFAULTS, ABSENT } = require("./add-defs.js");

test("ABSENT lists the 11 indicators absent from the standard graph", () => {
  assert.deepStrictEqual([...ABSENT].sort(), ["ao","aroon","cci","cmf","donchian","keltner","mfi","pivot","psar","roc","williams"]);
});

test("williams carries a period (the params:{} bug that made it inert)", () => {
  assert.deepStrictEqual(ABSENT_DEFAULTS.williams, { period: 14 });
});

test("params match BLOCK_DEFS verbatim for a sample", () => {
  assert.deepStrictEqual(ABSENT_DEFAULTS.keltner, { len: 20, atrLen: 10, mult: 2 });
  assert.deepStrictEqual(ABSENT_DEFAULTS.psar, { step: 0.02, max: 0.2 });
  assert.deepStrictEqual(ABSENT_DEFAULTS.pivot, {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd map/backtest/retro && node --test add-defs.test.js`
Expected: FAIL — `Cannot find module './add-defs.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// map/backtest/retro/add-defs.js — 표준 그래프에 없는 지표 기본 파라미터(BLOCK_DEFS 추출)
"use strict";

const ABSENT_DEFAULTS = {
  pivot: {},
  psar: { step: 0.02, max: 0.2 },
  keltner: { len: 20, atrLen: 10, mult: 2 },
  donchian: { len: 20 },
  cci: { period: 20 },
  roc: { period: 12 },
  williams: { period: 14 },
  ao: { fast: 5, slow: 34 },
  aroon: { period: 25 },
  mfi: { period: 14 },
  cmf: { period: 20 },
};
const ABSENT = Object.keys(ABSENT_DEFAULTS);

module.exports = { ABSENT_DEFAULTS, ABSENT };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd map/backtest/retro && node --test add-defs.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/add-defs.js map/backtest/retro/add-defs.test.js
git commit -m "feat(retro): 누락 지표 11종 기본 파라미터(add-defs)"
```

---

### Task 2: add-노드 구성 (graph-ablate.js 확장)

**Files:**
- Modify: `map/backtest/retro/graph-ablate.js`
- Modify: `map/backtest/retro/graph-ablate.test.js`

**Interfaces:**
- Consumes: (test) `../../forge-core.js`.
- Produces: `addIndicatorNode(graph, blockType, params) -> graph` — 깊은 복제 후 `{id:"add_<bt>", kind:"block", blockType, params, conviction:0, weight:50}` 노드 + `combine` 노드로 향하는 엣지 1개 추가(원본 불변). combine 노드 없으면 노드만 추가.
- 기존 `listIndicatorNodes`/`ablateGraph` 유지.

- [ ] **Step 1: Write the failing test (append to existing graph-ablate.test.js)**

```javascript
// append to map/backtest/retro/graph-ablate.test.js
const { addIndicatorNode } = require("./graph-ablate.js");

test("addIndicatorNode adds a wired node without mutating the original", () => {
  const g = FC.sampleGraph();
  const n0 = g.nodes.length, e0 = g.edges.length;
  const comb = g.nodes.find(n => n.blockType === "combine");
  const ag = addIndicatorNode(g, "roc", { period: 12 });
  const added = ag.nodes.find(n => n.id === "add_roc");
  assert.ok(added, "add_roc 노드 생성");
  assert.deepStrictEqual(added.params, { period: 12 });
  assert.strictEqual(added.conviction, 0);
  assert.ok(ag.edges.some(e => e.from === "add_roc" && e.to === comb.id), "combine으로 배선");
  assert.strictEqual(g.nodes.length, n0, "원본 노드 불변");
  assert.strictEqual(g.edges.length, e0, "원본 엣지 불변");
});

test("added indicator actually changes the engine prediction (roc on an uptrend)", () => {
  const g = FC.sampleGraph(); g.nodes.forEach(n => { if (n.conviction) n.conviction = 0; });
  const price = Array.from({ length: 340 }, (_, i) => 100 * Math.pow(1.003, i));
  const candle = price.map(c => ({ o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 }));
  const past = { price, candle };
  const base = FC.run(g, past, { futW: 20, timeframe: "1day" });
  const add = FC.run(addIndicatorNode(g, "roc", { period: 12 }), past, { futW: 20, timeframe: "1day" });
  assert.ok(base.verdict && add.verdict, "둘 다 실행");
  assert.notStrictEqual(add.verdict.score, base.verdict.score, "roc 추가 시 score 변화 기대");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd map/backtest/retro && node --test graph-ablate.test.js`
Expected: FAIL — `addIndicatorNode is not a function`

- [ ] **Step 3: Add the implementation to graph-ablate.js**

Add this function and export it (keep existing functions/exports):

```javascript
// nodeId 대신 blockType 지표를 추가하고 combine 노드로 배선. 깊은 복제(원본 불변).
function addIndicatorNode(graph, blockType, params) {
  const g = JSON.parse(JSON.stringify(graph));
  const id = "add_" + blockType;
  g.nodes = g.nodes || [];
  g.edges = g.edges || [];
  g.nodes.push({ id, kind: "block", blockType, params: params || {}, conviction: 0, weight: 50 });
  const comb = g.nodes.find(n => n.blockType === "combine");
  if (comb) g.edges.push({ id: "e_" + id, from: id, fromSide: "right", to: comb.id, toSide: "left" });
  return g;
}

module.exports = { listIndicatorNodes, ablateGraph, addIndicatorNode };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd map/backtest/retro && node --test graph-ablate.test.js`
Expected: PASS (5 tests — 3 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/graph-ablate.js map/backtest/retro/graph-ablate.test.js
git commit -m "feat(retro): add-노드 구성(combine 배선)"
```

---

### Task 3: up 기반 전환 + map-aware 헬퍼 (lib.js)

**Files:**
- Modify: `map/backtest/retro/lib.js`
- Modify: `map/backtest/retro/lib.test.js`
- Modify: `map/backtest/retro/attribution.test.js` (픽스처를 score→up 마이그레이션 — 로직 불변)
- Modify: `map/backtest/retro/gate.test.js` (픽스처를 score→up 마이그레이션 — 로직 불변)

**Interfaces (Produces):**
- `realDir(rec, hKey="a20") -> -1|0|1` (불변).
- `predDir(up) -> -1|1` — `(up==null?50:up) >= 50 ? 1 : -1`. **인자 의미가 score→up으로 바뀜.**
- `inRegime(rec, g) -> bool` (불변).
- `accBase(recs, hKey="a20") -> number|null` — `predDir(rec.up)` 기준.
- `accMod(recs, g, key, hKey="a20", map="ab") -> number|null` — 국면 g 안에서 `rec[map][key].up`, 밖/부재 시 `rec.up`.
- `indicatorIds(recs, map="ab") -> string[]` — `rec[map]` 키 합집합.

**중요:** 이 태스크는 lib 로직을 up 기반으로 바꾸므로, 아직 score 픽스처를 쓰는 `attribution.test.js`·`gate.test.js`가 깨진다. 두 테스트의 인라인 레코드를 up 필드로 마이그레이션한다(소비 모듈 `attribution.js`/`gate.js` **로직은 건드리지 않음** — accMod의 map 기본값 "ab"로 그대로 동작). add 기능은 Task 5/7에서 얹는다.

- [ ] **Step 1: Rewrite lib.test.js for up-basis**

```javascript
// map/backtest/retro/lib.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./lib.js");

// z를 국면 g에서 drop(ab) 또는 add(addAb)했을 때의 up을 담은 합성 레코드
function rec(sym, t, a20, up, altUp, g, map) {
  const r = { sym, t, base: 100, a20, a60: a20, up, regime: [g] };
  r[map] = { z: { up: altUp } };
  return r;
}

test("realDir/predDir(up 기반)", () => {
  assert.strictEqual(L.realDir({ base: 100, a20: 110 }), 1);
  assert.strictEqual(L.realDir({ base: 100, a20: 90 }), -1);
  assert.strictEqual(L.predDir(70), 1);
  assert.strictEqual(L.predDir(30), -1);
  assert.strictEqual(L.predDir(50), 1);
  assert.strictEqual(L.predDir(null), 1);
});

test("accBase uses up", () => {
  const recs = [{ base: 100, a20: 90, up: 70, regime: [] }, { base: 100, a20: 110, up: 70, regime: [] }];
  assert.strictEqual(L.accBase(recs), 0.5); // 하나는 up70(상승콜) 실제하락=오답, 하나는 상승=정답
});

test("accMod drop(ab): dropping a betraying indicator raises accuracy in-regime", () => {
  const recs = [
    rec("A", 1, 90, 70, 30, "vol-high", "ab"), // base up70(상승콜) 실제하락 오답 → drop시 up30(하락콜) 정답
    rec("A", 2, 80, 80, 20, "vol-high", "ab"),
  ];
  assert.strictEqual(L.accBase(recs), 0);
  assert.strictEqual(L.accMod(recs, "vol-high", "z", "a20", "ab"), 1);
  assert.strictEqual(L.accMod(recs, "trend-up", "z", "a20", "ab"), 0); // 다른 국면 무변화
});

test("accMod add(addAb): adding an indicator flips misses", () => {
  const recs = [
    rec("A", 1, 110, 30, 70, "vol-low", "addAb"), // base up30(하락콜) 실제상승 오답 → add시 up70 정답
    rec("A", 2, 120, 20, 80, "vol-low", "addAb"),
  ];
  assert.strictEqual(L.accBase(recs), 0);
  assert.strictEqual(L.accMod(recs, "vol-low", "z", "a20", "addAb"), 1);
});

test("indicatorIds reads the requested map", () => {
  const recs = [{ ab: { x: { up: 50 } }, addAb: { y: { up: 50 } } }];
  assert.deepStrictEqual(L.indicatorIds(recs, "ab"), ["x"]);
  assert.deepStrictEqual(L.indicatorIds(recs, "addAb"), ["y"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd map/backtest/retro && node --test lib.test.js`
Expected: FAIL (accMod arity/up behavior mismatch).

- [ ] **Step 3: Rewrite lib.js**

```javascript
// map/backtest/retro/lib.js — 방향(up 기반)·정확도·국면필터 공유 헬퍼(순수)
"use strict";

function realDir(rec, hKey = "a20") { return Math.sign(rec[hKey] - rec.base); }
function predDir(up) { return (up == null ? 50 : up) >= 50 ? 1 : -1; }
function inRegime(rec, g) { return g === "all" || (rec.regime && rec.regime.includes(g)); }

function accBase(recs, hKey = "a20") {
  let hit = 0, n = 0;
  for (const r of recs) { const rd = realDir(r, hKey); if (rd === 0) continue; n++; if (predDir(r.up) === rd) hit++; }
  return n ? hit / n : null;
}

// 국면 g 안에서 key 지표를 map(ab=drop / addAb=add)으로 치환한 수정 전략의 정확도.
// g 밖 또는 해당 항목 부재 시 base up.
function accMod(recs, g, key, hKey = "a20", map = "ab") {
  let hit = 0, n = 0;
  for (const r of recs) {
    const rd = realDir(r, hKey); if (rd === 0) continue; n++;
    const alt = inRegime(r, g) && r[map] && r[map][key];
    const up = alt ? r[map][key].up : r.up;
    if (predDir(up) === rd) hit++;
  }
  return n ? hit / n : null;
}

function indicatorIds(recs, map = "ab") {
  const s = new Set();
  for (const r of recs) if (r[map]) for (const k of Object.keys(r[map])) s.add(k);
  return [...s];
}

module.exports = { realDir, predDir, inRegime, accBase, accMod, indicatorIds };
```

- [ ] **Step 4: Run lib.test.js to verify it passes**

Run: `cd map/backtest/retro && node --test lib.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Migrate attribution.test.js and gate.test.js fixtures score→up**

In `attribution.test.js`, the helper `mk(n)` builds records with `score`/`ab:{z:{score}}`. Replace direction fields with up: a record that is a base MISS becomes `up` on the wrong side, and `ab:{z:{up}}` on the correct side. Concretely change the `mk` builder body to:

```javascript
// inside attribution.test.js mk(n): replace score/abZ lines
    const g = i < n * 0.7 ? "vol-high" : "trend-up";
    const up = up_ ? 30 : 70;        // base 오답: 상승인데 up30(하락콜), 하락인데 up70(상승콜)
    const abZ = up_ ? 70 : 30;       // z 제거 시 정답 방향
    recs.push({ sym: "A", t: i, base: 100, a20, a60: a20, up, regime: [g], ab: { z: { up: abZ }, w: { up } } });
```
(rename the loop's `up` boolean to `up_` to avoid the shadow; `a20 = up_ ? 110 : 90`.)

In `gate.test.js`, `mkTest(n)` and the neutral-case map similarly switch `score`→`up`: base miss = `up` on wrong side, `ab:{z:{up}}` on correct side:
```javascript
    const up = isUp ? 30 : 70;                 // base 오답
    recs.push({ sym:..., t: i, base: 100, a20, a60: a20, up, regime: ["vol-high"], ab: { z: { up: isUp ? 70 : 30 } } });
```
(rename the loop's `up` boolean to `isUp`; `a20 = isUp ? 110 : 90`.) The neutral "no-improvement" case sets `ab:{z:{up: x.up}}` (equal to base).

Do NOT change attribution.js or gate.js logic in this task.

- [ ] **Step 6: Run the affected suites to verify green**

Run: `cd map/backtest/retro && node --test lib.test.js attribution.test.js gate.test.js`
Expected: PASS (all — attribution/gate now green on up fixtures).

- [ ] **Step 7: Commit**

```bash
git add map/backtest/retro/lib.js map/backtest/retro/lib.test.js map/backtest/retro/attribution.test.js map/backtest/retro/gate.test.js
git commit -m "feat(retro): up 기반 방향 전환 + map-aware accMod/indicatorIds"
```

---

### Task 4: 수집 러너 — ab(up)+addAb(up) (miss-ledger.js)

**Files:**
- Modify: `map/backtest/retro/miss-ledger.js`
- Modify: `map/backtest/retro/miss-ledger.test.js`

**Interfaces:**
- Consumes: `add-defs.js`(`ABSENT`,`ABSENT_DEFAULTS`), `graph-ablate.js`(`addIndicatorNode`).
- Produces (record): `{ sym, t, base, a20, a60, up, regime, ab:{[id]:{up}}, addAb:{[bt]:{up}} }` — **score 필드 제거**, ab는 drop 후 up, addAb는 각 누락 지표 add 후 up.

- [ ] **Step 1: Update miss-ledger.test.js**

```javascript
// map/backtest/retro/miss-ledger.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const BT = require("../backtest.js");
const { collectFixture } = require("./miss-ledger.js");

test("collectFixture yields up-based records with drop(ab) and add(addAb) maps", () => {
  const fx = BT.makeSyntheticFixture("SYNTH", "1day", { n: 360, drift: 0.001, vol: 0.012 });
  const recs = collectFixture(fx, { stride: 40 });
  assert.ok(recs.length > 0);
  const r = recs[0];
  assert.strictEqual(r.sym, "SYNTH");
  assert.ok(Number.isFinite(r.base) && Number.isFinite(r.a20) && Number.isFinite(r.a60));
  assert.strictEqual(r.score, undefined, "score 필드는 제거됨");
  assert.ok(Array.isArray(r.regime) && r.regime.length >= 1);
  assert.ok(r.ab && Object.keys(r.ab).length >= 1, "drop ablation 최소 1개");
  for (const k of Object.keys(r.ab)) assert.ok(Number.isFinite(r.ab[k].up) || r.ab[k].up === null, "ab up");
  assert.ok(r.addAb && Object.keys(r.addAb).length >= 5, "add injection 다수");
  for (const k of Object.keys(r.addAb)) assert.ok("up" in r.addAb[k], "addAb up 필드");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd map/backtest/retro && node --test miss-ledger.test.js`
Expected: FAIL (addAb undefined / score still present).

- [ ] **Step 3: Rewrite collectFixture (and add imports)**

Replace the `require` for graph-ablate to include `addIndicatorNode`, add the add-defs import, and rewrite `collectFixture`:

```javascript
const { listIndicatorNodes, ablateGraph, addIndicatorNode } = require("./graph-ablate.js");
const { ABSENT, ABSENT_DEFAULTS } = require("./add-defs.js");
```

```javascript
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
```

(Update the CLI notice string to mention "drop+add ablation ~3h" if desired; not required.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd map/backtest/retro && node --test miss-ledger.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/miss-ledger.js map/backtest/retro/miss-ledger.test.js
git commit -m "feat(retro): 수집 러너 up 기반 + add-injection(addAb)"
```

---

### Task 5: 오류 귀속 — drop + add 진단 (attribution.js)

**Files:**
- Modify: `map/backtest/retro/attribution.js`
- Modify: `map/backtest/retro/attribution.test.js`

**Interfaces:**
- Produces: `attribute(train, opts) -> diagnosis[]`. 진단 `{ regime, indicator, kind:"betray"|"missing", stat:{trainGain, n} }`. betray=drop(ab)로 개선, missing=add(addAb)로 개선. 국면별 drop·add 후보를 합쳐 trainGain 상위 `topPerRegime`(>minGain).

- [ ] **Step 1: Add a failing test (append to attribution.test.js)**

```javascript
// append to attribution.test.js — add(missing) diagnosis
function mkAdd(n) {
  const recs = [];
  for (let i = 0; i < n; i++) {
    const up_ = i % 2 === 0, a20 = up_ ? 110 : 90;
    // base 오답(up 반대), 지표 z를 ADD하면 정답 방향
    recs.push({ sym: "A", t: i, base: 100, a20, a60: a20, up: up_ ? 30 : 70,
      regime: ["vol-low"], ab: {}, addAb: { z: { up: up_ ? 70 : 30 } } });
  }
  return recs;
}
test("attribute surfaces a missing (add) indicator", () => {
  const diags = require("./attribution.js").attribute(mkAdd(600), { minN: 100, minGain: 0.01 });
  const hit = diags.find(d => d.indicator === "z" && d.regime === "vol-low" && d.kind === "missing");
  assert.ok(hit, "vol-low에서 z 누락 진단 기대: " + JSON.stringify(diags));
  assert.ok(hit.stat.trainGain > 0.01);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd map/backtest/retro && node --test attribution.test.js`
Expected: FAIL (missing kind never produced).

- [ ] **Step 3: Rewrite attribute()**

```javascript
// map/backtest/retro/attribution.js — train 레코드 → 진단(drop betray + add missing)(순수)
"use strict";
const { REGIMES } = require("./regime.js");
const { accBase, accMod, inRegime, indicatorIds, realDir } = require("./lib.js");

function attribute(train, opts = {}) {
  const { minN = 200, topPerRegime = 3, minGain = 0.005, hKey = "a20" } = opts;
  const baseAcc = accBase(train, hKey);
  const dropInds = indicatorIds(train, "ab");
  const addInds = indicatorIds(train, "addAb");
  const out = [];
  for (const g of REGIMES) {
    const gN = train.filter(r => realDir(r, hKey) !== 0 && inRegime(r, g)).length;
    if (gN < minN) continue;
    const scored = [];
    for (const z of dropInds) scored.push({ kind: "betray", key: z, gain: accMod(train, g, z, hKey, "ab") - baseAcc });
    for (const bt of addInds) scored.push({ kind: "missing", key: bt, gain: accMod(train, g, bt, hKey, "addAb") - baseAcc });
    scored.sort((a, b) => b.gain - a.gain);
    for (const c of scored.slice(0, topPerRegime)) {
      if (c.gain <= minGain) continue;
      out.push({ regime: g, indicator: c.key, kind: c.kind, stat: { trainGain: c.gain, n: gN } });
    }
  }
  return out;
}

module.exports = { attribute };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd map/backtest/retro && node --test attribution.test.js`
Expected: PASS (existing betray tests + new missing test).

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/attribution.js map/backtest/retro/attribution.test.js
git commit -m "feat(retro): 귀속에 add(missing) 진단 추가"
```

---

### Task 6: 재조합 후보 — drop/add op (remix.js)

**Files:**
- Modify: `map/backtest/retro/remix.js`
- Modify: `map/backtest/retro/remix.test.js`

**Interfaces:**
- Produces: `candidatesFrom(diagnoses) -> candidate[]`. `{ id, regime, change:{op:"drop"|"add", indId}, rationale, sourceDiag }`. op = kind `missing`→`add`, else `drop`. id `retro-<regime>-<op>-<indId>`. rationale는 op별 문구.

- [ ] **Step 1: Add a failing test (append to remix.test.js)**

```javascript
test("missing diagnosis becomes an add candidate", () => {
  const diags = [{ regime: "vol-low", indicator: "cci", kind: "missing", stat: { trainGain: 0.02, n: 400 } }];
  const c = require("./remix.js").candidatesFrom(diags)[0];
  assert.strictEqual(c.id, "retro-vol-low-add-cci");
  assert.deepStrictEqual(c.change, { op: "add", indId: "cci" });
  assert.ok(/추가/.test(c.rationale), "add 근거 문구");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd map/backtest/retro && node --test remix.test.js`
Expected: FAIL (id uses "drop" for missing).

- [ ] **Step 3: Rewrite candidatesFrom()**

```javascript
// remix.js — 진단 → 재조합 후보(drop/add, 순수)
"use strict";

function candidatesFrom(diagnoses) {
  const seen = new Set(), out = [];
  for (const d of diagnoses) {
    const op = d.kind === "missing" ? "add" : "drop";
    const id = "retro-" + d.regime + "-" + op + "-" + d.indicator;
    if (seen.has(id)) continue;
    seen.add(id);
    const gainPP = (d.stat.trainGain * 100).toFixed(1);
    const rationale = op === "add"
      ? "국면 '" + d.regime + "'에서 지표 '" + d.indicator + "' 추가 시 방향 개선(train +" + gainPP + "pp). 이 국면에서 투입 검토."
      : "국면 '" + d.regime + "'에서 지표 '" + d.indicator + "'가 방향을 반대로 밀어(train +" + gainPP + "pp). 이 국면에서 제외 검토.";
    out.push({ id, regime: d.regime, change: { op, indId: d.indicator }, rationale, sourceDiag: d });
  }
  return out;
}

module.exports = { candidatesFrom };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd map/backtest/retro && node --test remix.test.js`
Expected: PASS (existing drop test + new add test).

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/remix.js map/backtest/retro/remix.test.js
git commit -m "feat(retro): 재조합 후보에 add op 추가"
```

---

### Task 7: 게이트 — op 분기 (gate.js)

**Files:**
- Modify: `map/backtest/retro/gate.js`
- Modify: `map/backtest/retro/gate.test.js`

**Interfaces:**
- Produces: `gateCandidate(candidate, test, opts) -> {verdict, evidence}` (필드 v1과 동일). `map = candidate.change.op === "add" ? "addAb" : "ab"`로 채점 — drop/add 모두 지원. **T7 마이너(op 미검사) 해결.**

- [ ] **Step 1: Add a failing test (append to gate.test.js)**

```javascript
test("gates an add candidate using the addAb map", () => {
  const recs = [];
  for (let i = 0; i < 300; i++) {
    const isUp = i % 2 === 0, a20 = isUp ? 110 : 90;
    recs.push({ sym: i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "C", t: i, base: 100, a20, a60: a20,
      up: isUp ? 30 : 70, regime: ["vol-low"], addAb: { cci: { up: isUp ? 70 : 30 } } });
  }
  const cand = { id: "retro-vol-low-add-cci", regime: "vol-low", change: { op: "add", indId: "cci" } };
  const r = require("./gate.js").gateCandidate(cand, recs, { minN: 50 });
  assert.strictEqual(r.verdict, "adopt", JSON.stringify(r.evidence));
  assert.ok(r.evidence.oosDelta > 0.4);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd map/backtest/retro && node --test gate.test.js`
Expected: FAIL (gate reads `ab`, add candidate scores as no-op → not "adopt").

- [ ] **Step 3: Edit gate.js — derive map from op**

Change the top of `gateCandidate` to compute `map` and thread it into every `accMod` call:

```javascript
function gateCandidate(candidate, test, opts = {}) {
  const { minN = 100, minDelta = 0.01, hKey = "a20" } = opts;
  const g = candidate.regime, z = candidate.change.indId;
  const map = candidate.change.op === "add" ? "addAb" : "ab";
  const valid = test.filter(r => realDir(r, hKey) !== 0);
  const gTest = valid.filter(r => inRegime(r, g));
  if (gTest.length < minN) return { verdict: "insufficient-sample", evidence: { n: gTest.length } };

  const curAcc = accBase(valid, hKey);
  const modAcc = accMod(valid, g, z, hKey, map);
  const oosDelta = modAcc - curAcc;

  const sorted = valid.slice().sort((a, b) => (a.t - b.t) || (a.sym < b.sym ? -1 : 1));
  const mid = Math.floor(sorted.length / 2);
  const h1 = accMod(sorted.slice(0, mid), g, z, hKey, map) - accBase(sorted.slice(0, mid), hKey);
  const h2 = accMod(sorted.slice(mid), g, z, hKey, map) - accBase(sorted.slice(mid), hKey);

  const syms = [...new Set(valid.map(r => r.sym))];
  let pos = 0, tot = 0;
  for (const s of syms) {
    const sr = valid.filter(r => r.sym === s);
    if (!sr.some(r => inRegime(r, g))) continue;
    tot++; if ((accMod(sr, g, z, hKey, map) - accBase(sr, hKey)) >= 0) pos++;
  }
  const symbolConsistency = tot ? pos / tot : 0;

  const alwaysUp = gTest.filter(r => realDir(r, hKey) > 0).length / gTest.length;
  const modAccG = accMod(gTest, g, z, hKey, map);

  const pass = oosDelta >= minDelta && h1 >= 0 && h2 >= 0 && symbolConsistency >= 0.5 && modAccG >= alwaysUp;
  return {
    verdict: pass ? "adopt" : "no-improvement",
    evidence: { oosDelta, halves: [h1, h2], symbolConsistency, modAcc, curAcc, modAccG, alwaysUp, n: gTest.length },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd map/backtest/retro && node --test gate.test.js`
Expected: PASS (existing drop tests + new add test).

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/gate.js map/backtest/retro/gate.test.js
git commit -m "feat(retro): 게이트 op 분기(add/drop) — T7 마이너 해결"
```

---

### Task 8: 통합 대장 + not-measured + 종결 요약 (build-catalog.js)

**Files:**
- Modify: `map/backtest/retro/build-catalog.js`
- Modify: `map/backtest/retro/README.md`

**Interfaces:**
- Produces (CLI): `retro-catalog.json`(drop+add 통합) + stderr 종결 요약(drop 분포·add 분포·verdict 카운트·not-measured 목록·종결 진술).
- Produces (export, 테스트용): `splitBySymbol`(불변) + `notMeasuredAdds(recs) -> string[]` — 모든 레코드에서 `addAb[bt].up === base up`인(한 번도 예측을 안 움직인) 지표 목록.

- [ ] **Step 1: Rewrite build-catalog.js main + add notMeasuredAdds + dist summary**

```javascript
// map/backtest/retro/build-catalog.js — 회고 파이프라인 러너(drop+add) → retro-catalog.json
"use strict";
const fs = require("fs"), path = require("path");
const F = require("../feat-lib.js");
const L = require("./lib.js");
const { REGIMES } = require("./regime.js");
const { CACHE, collectAll } = require("./miss-ledger.js");
const { attribute } = require("./attribution.js");
const { candidatesFrom } = require("./remix.js");
const { gateCandidate } = require("./gate.js");

const OUT = path.join(__dirname, "retro-catalog.json");
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "pp";

function splitBySymbol(recs) {
  const bySym = {}; for (const r of recs) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const train = [], test = [];
  for (const s of Object.keys(bySym)) {
    const a = bySym[s].slice().sort((x, y) => x.t - y.t);
    const k = F.splitIdx(a.length);
    train.push(...a.slice(0, k)); test.push(...a.slice(k));
  }
  return { train, test };
}

// 한 번도 예측 up을 움직이지 않은 add 지표(no-op) — "개선 없음"이 아니라 "미측정"으로 분리.
function notMeasuredAdds(recs) {
  const types = L.indicatorIds(recs, "addAb");
  const moved = new Set();
  for (const r of recs) for (const bt of types) if (r.addAb && r.addAb[bt] && r.addAb[bt].up !== r.up) moved.add(bt);
  return types.filter(bt => !moved.has(bt));
}

// 국면×(drop/add) 최대 개선 분포(train) — 종결 진술의 정량 근거.
function distByRegime(train, map, minN) {
  const base = L.accBase(train), keys = L.indicatorIds(train, map), rows = [];
  for (const g of REGIMES) {
    const gN = train.filter(r => L.realDir(r) !== 0 && L.inRegime(r, g)).length;
    if (gN < minN) continue;
    let best = -1, bestK = "";
    for (const k of keys) { const gain = L.accMod(train, g, k, "a20", map) - base; if (gain > best) { best = gain; bestK = k; } }
    rows.push({ g, gN, best, bestK });
  }
  return rows;
}

function main() {
  let recs;
  if (fs.existsSync(CACHE)) recs = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  else { console.error("retro-records.json 없음 — 수집 실행…"); recs = collectAll(); }
  console.error("레코드 " + recs.length + " · 종목 " + new Set(recs.map(r => r.sym)).size);

  const { train, test } = splitBySymbol(recs);
  const catalog = candidatesFrom(attribute(train)).map(c => {
    const gr = gateCandidate(c, test);
    return { id: c.id, diagnosis: c.sourceDiag, remix: { change: c.change, rationale: c.rationale }, verdict: gr.verdict, evidence: gr.evidence, promoted: false };
  });
  fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2));

  const by = k => catalog.filter(e => e.verdict === k).length;
  const notMeasured = notMeasuredAdds(recs);
  console.error("\n=== 회고 대장 요약 (up 기반) ===");
  console.error("train base 방향정확도: " + (L.accBase(train) * 100).toFixed(2) + "%");
  console.error("후보 " + catalog.length + " · 채택 " + by("adopt") + " · 개선없음 " + by("no-improvement") + " · 표본부족 " + by("insufficient-sample"));
  if (notMeasured.length) console.error("add 미측정(예측 무변동): " + notMeasured.join(", "));
  console.error("\n[drop 분포] 국면별 최대 제거이득:");
  for (const r of distByRegime(train, "ab", 200)) console.error("  " + r.g.padEnd(11) + " n=" + String(r.gN).padStart(5) + "  " + r.bestK.padEnd(10) + pp(r.best));
  console.error("[add 분포] 국면별 최대 추가이득:");
  for (const r of distByRegime(train, "addAb", 200)) console.error("  " + r.g.padEnd(11) + " n=" + String(r.gN).padStart(5) + "  " + r.bestK.padEnd(10) + pp(r.best));
  for (const e of catalog.filter(e => e.verdict === "adopt").sort((a, b) => b.evidence.oosDelta - a.evidence.oosDelta)) {
    console.error("  [채택] " + e.id + "  OOS " + pp(e.evidence.oosDelta) + " · 종목일관 " + (e.evidence.symbolConsistency * 100).toFixed(0) + "% · n=" + e.evidence.n);
  }
  if (by("adopt") === 0) console.error("\n→ membership 레버(add+drop) 방향 개선 0 — up 기반 실측, 재조합 가설 종결.");
  console.error("→ retro-catalog.json 기록됨");
}

if (require.main === module) main();
module.exports = { splitBySymbol, notMeasuredAdds };
```

- [ ] **Step 2: Update README.md v1 유보 범위 → v2 반영**

In `map/backtest/retro/README.md`, replace the "v1 유보 범위" bullet list so it reflects v2:
```markdown
## v2 범위 (2026-07-14)
- 방향 판정 = `up`(예측 확률·드리프트 포함), score 아님.
- drop(제거) + add(누락 지표 투입) 둘 다 측정 → membership 종결.
- add 대상 = 표준 그래프에 없는 11종(add-defs.js). 예측을 한 번도 안 움직인 지표는 "미측정"으로 분리.
- 유보(별도 스펙): downweight·overconfident 진단·combination(재가중=v3, 이 캐시 부트스트랩)·R3 UI·승격 게이트 강화(자명규칙+BSS).
```

- [ ] **Step 3: Unit-test notMeasuredAdds via synthetic (no full collect)**

Run:
```bash
cd map/backtest/retro && node -e '
const {notMeasuredAdds}=require("./build-catalog.js");
const recs=[
  {up:60, addAb:{moved:{up:40}, still:{up:60}}},
  {up:55, addAb:{moved:{up:70}, still:{up:55}}},
];
const nm=notMeasuredAdds(recs);
console.log("notMeasured:",JSON.stringify(nm));
if(JSON.stringify(nm)!=="[\"still\"]") { console.error("FAIL"); process.exit(1); }
console.log("OK notMeasuredAdds");
'
```
Expected: `notMeasured: ["still"]` / `OK notMeasuredAdds`.

- [ ] **Step 4: Synthetic end-to-end smoke (no full collect)**

Run:
```bash
cd map/backtest/retro && node -e '
const BT=require("../backtest.js"), ml=require("./miss-ledger.js");
const {splitBySymbol}=require("./build-catalog.js");
const {attribute}=require("./attribution.js"), {candidatesFrom}=require("./remix.js"), {gateCandidate}=require("./gate.js");
let recs=[]; for(const s of ["P","Q","R"]) recs=recs.concat(ml.collectFixture(BT.makeSyntheticFixture(s,"1day",{n:420,drift:0.001,vol:0.013}),{stride:30}));
const {train,test}=splitBySymbol(recs);
const cands=candidatesFrom(attribute(train,{minN:20,minGain:0.005}));
const cat=cands.map(c=>({id:c.id,...gateCandidate(c,test,{minN:20})}));
console.log("recs",recs.length,"addAb keys",Object.keys(recs[0].addAb).length,"cands",cands.length,"verdicts",cat.map(e=>e.verdict));
console.log("OK v2 pipeline runs end-to-end");
'
```
Expected: `recs N`, `addAb keys` ≥5, `OK v2 pipeline runs end-to-end` — no exception. (합성 데이터라 채택 여부 무의미; 무결성만.)

- [ ] **Step 5: Commit**

```bash
git add map/backtest/retro/build-catalog.js map/backtest/retro/README.md
git commit -m "feat(retro): 통합 대장(drop+add)+not-measured+종결 요약(up 기반)"
```

- [ ] **Step 6: (별도 실행) 실데이터 재수집 + 종결 대장** — 컨트롤러가 최종 리뷰 후 백그라운드 실행

```bash
cd map && node backtest/retro/miss-ledger.js --recollect && node backtest/retro/build-catalog.js
```
Expected: ~3h. drop 분포·add 분포·채택 카운트. **채택 0이면 "membership 종결" 진술 출력** = 성과. 결과를 스코어카드 changelog + [[scoopforge-retro-zone]] 메모리에 기록.

---

## Self-Review

**1. Spec coverage:**
- up 기반 전환(§A) → Task 3(lib) + 4(miss-ledger up 저장) + 픽스처 마이그레이션. ✅
- 레코드 스키마 v2 ab/addAb{up}(§B) → Task 4. ✅
- add-defs.js + addIndicatorNode + 위생 검사(§C) → Task 1·2 + Task 8 notMeasuredAdds. ✅
- 파이프라인 진화(§D): attribution add → T5, remix op → T6, gate op(+T7 마이너) → T7, build-catalog 통합+종결 → T8. ✅
- 종결 진술(§E) → Task 8 main. ✅
- 비목표(combination v3·downweight·R3) → README(T8) 반영. ✅

**2. Placeholder scan:** 모든 스텝 실제 코드·명령·기대출력. 없음. ✅

**3. Type consistency:** `accMod(recs,g,key,hKey="a20",map="ab")` — Task 3 정의 → Task 5(`"ab"`/`"addAb"`)·Task 7(`map`)·Task 8(distByRegime) 동일 호출. 레코드 `{...,up,ab:{[id]:{up}},addAb:{[bt]:{up}}}` — Task 4 생성 → Task 3/5/7/8 소비 일관(`score` 필드 없음 일관). 후보 `{id,regime,change:{op,indId},rationale,sourceDiag}` — Task 6 생성 → Task 7/8 소비. 진단 `{regime,indicator,kind,stat:{trainGain,n}}` — Task 5 → Task 6(`d.kind`). ✅
```
