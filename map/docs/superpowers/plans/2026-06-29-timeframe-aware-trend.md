# 타임프레임 인지 추세 가중 (Timeframe-Aware Trend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분석 이미지의 차트 타임프레임(`_visionTF`)에 따라 추세 블렌드 가중치와 예측 추세 강도를 3티어(월봉+/일·주봉/인트라)로 조정한다.

**Architecture:** 타임프레임→프로파일 매핑을 코어 순수 함수 `ForgeCore.trendProfileForTF(tf)` 하나로 두고, 예측(`run`)과 작도(`forge.html`)가 같은 프로파일을 공유한다. `analyzeTrend`의 기존 `weights` 옵션을 재사용하고, 예측 추세성분에 `trendScale` 배율을 곱한다.

**Tech Stack:** Vanilla JS(무빌드), `node:test`/`node:assert`, HTML5 Canvas.

## Global Constraints

- 바닐라 JS · 빌드도구/외부 라이브러리 금지 · 단일 `forge.html` + 단일 `forge-core.js` 유지.
- UI 텍스트 한국어. 다크 테마 토큰 색만.
- 작도·예측은 같은 프로파일(`trendProfileForTF`) 공유(정합).
- `trendProfileForTF`는 **순수 함수**(부수효과 없음). `tf` falsy → default.
- 단위 테스트 실행: `node --test forge-core.test.js`.
- 프로파일 표(verbatim):
  - long(월봉+, `/월|분기|년|연/`): weights `{long:0.6, mid:0.3, short:0.1}`, trendScale `1.0`, label `"월봉 장기가중"`
  - mid(일·주봉, `/주|일/`): weights `{long:0.45, mid:0.35, short:0.2}`, trendScale `0.8`, label `"일·주봉 균형"`
  - intra(분·시간, `/분|시간|시/`): weights `{long:0.25, mid:0.35, short:0.4}`, trendScale `0.45`, label `"단주기 단기가중"`
  - default(미상/기타): weights `{long:0.5, mid:0.3, short:0.2}`, trendScale `0.8`, label `""`
  - 분류 순서: long → mid → intra → default (위에서부터 첫 매치).

---

### Task 1: 코어 `trendProfileForTF()` + export + 단위 테스트

**Files:**
- Modify: `forge-core.js` (`analyzeTrend` 함수 정의 다음에 삽입; export `forge-core.js:571`)
- Test: `forge-core.test.js` (파일 끝)

**Interfaces:**
- Produces: `trendProfileForTF(tf:string|null) → { tier:"long"|"mid"|"intra"|"default", weights:{long,mid,short}, trendScale:number, label:string }`. 순수 함수.

- [ ] **Step 1: 실패 테스트 작성** — `forge-core.test.js` 끝에 추가

```js
test("trendProfileForTF: 월봉 → long 프로파일", () => {
  const p = ForgeCore.trendProfileForTF("월봉");
  assert.strictEqual(p.tier, "long");
  assert.deepStrictEqual(p.weights, { long: 0.6, mid: 0.3, short: 0.1 });
  assert.strictEqual(p.trendScale, 1.0);
  assert.strictEqual(p.label, "월봉 장기가중");
});

test("trendProfileForTF: 일봉·주봉 → mid", () => {
  for (const tf of ["일봉", "주봉"]) {
    const p = ForgeCore.trendProfileForTF(tf);
    assert.strictEqual(p.tier, "mid");
    assert.deepStrictEqual(p.weights, { long: 0.45, mid: 0.35, short: 0.2 });
    assert.strictEqual(p.trendScale, 0.8);
  }
});

test("trendProfileForTF: 1시간·5분 → intra", () => {
  for (const tf of ["1시간", "5분"]) {
    const p = ForgeCore.trendProfileForTF(tf);
    assert.strictEqual(p.tier, "intra");
    assert.deepStrictEqual(p.weights, { long: 0.25, mid: 0.35, short: 0.4 });
    assert.strictEqual(p.trendScale, 0.45);
  }
});

test("trendProfileForTF: 분기 → long (분 오분류 안 됨)", () => {
  assert.strictEqual(ForgeCore.trendProfileForTF("분기").tier, "long");
});

test("trendProfileForTF: null/미상 → default", () => {
  const p = ForgeCore.trendProfileForTF(null);
  assert.strictEqual(p.tier, "default");
  assert.deepStrictEqual(p.weights, { long: 0.5, mid: 0.3, short: 0.2 });
  assert.strictEqual(p.trendScale, 0.8);
  assert.strictEqual(p.label, "");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test forge-core.test.js`
Expected: FAIL — `ForgeCore.trendProfileForTF is not a function`

- [ ] **Step 3: 구현** — `forge-core.js`의 `analyzeTrend` 함수 정의 **바로 다음 줄**에 삽입

```js
  function trendProfileForTF(tf) {
    const s = typeof tf === "string" ? tf : "";
    if (/월|분기|년|연/.test(s)) return { tier: "long", weights: { long: 0.6, mid: 0.3, short: 0.1 }, trendScale: 1.0, label: "월봉 장기가중" };
    if (/주|일/.test(s)) return { tier: "mid", weights: { long: 0.45, mid: 0.35, short: 0.2 }, trendScale: 0.8, label: "일·주봉 균형" };
    if (/분|시간|시/.test(s)) return { tier: "intra", weights: { long: 0.25, mid: 0.35, short: 0.4 }, trendScale: 0.45, label: "단주기 단기가중" };
    return { tier: "default", weights: { long: 0.5, mid: 0.3, short: 0.2 }, trendScale: 0.8, label: "" };
  }
```

- [ ] **Step 4: export에 추가** — `forge-core.js:571` 의 return 객체 끝에 `trendProfileForTF` 삽입

```js
  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run, runSteps, visionBiasFrom, sampleSeries, sampleGraph, analyzeTrend, trendProfileForTF };
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test forge-core.test.js`
Expected: PASS (신규 5개 포함 전체 통과)

- [ ] **Step 6: 커밋**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): ForgeCore.trendProfileForTF — 타임프레임 3티어 추세 프로파일"
```

---

### Task 2: 예측 `run` 타임프레임 연동 + 테스트

**Files:**
- Modify: `forge-core.js` (`run` 내: analyzeTrend 호출 `forge-core.js:471`, 추세성분 `forge-core.js:479`)
- Test: `forge-core.test.js`

**Interfaces:**
- Consumes: `trendProfileForTF` (Task 1). `run` 스코프 변수 `price`, `opts`, `trS`, `k`, `futW`.
- Produces: `run(graph, data, { ..., timeframe })` 가 타임프레임별로 다른 예측 산출.

- [ ] **Step 1: 실패 테스트 작성** — `forge-core.test.js` 끝에 추가

```js
test("run: 타임프레임 — 월봉이 5분보다 추세 상승 강하게 투영", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const data = { price: Array.from({ length: 60 }, (_, i) => 10 * Math.exp(0.03 * i)) };
  const rM = ForgeCore.run(G, data, { futW: 12, timeframe: "월봉" });
  const rI = ForgeCore.run(G, data, { futW: 12, timeframe: "5분" });
  assert.ok(rM.prediction.path.every(isFinite) && rI.prediction.path.every(isFinite), "NaN 없음");
  const gain = r => r.prediction.target / r.prediction.anchor;
  assert.ok(gain(rM) > gain(rI), "월봉(배율1.0)이 5분(배율0.45)보다 상승 큼");
});

test("run: timeframe 없이도 동작(default)", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const data = { price: Array.from({ length: 40 }, (_, i) => 100 + i) };
  const r = ForgeCore.run(G, data, { futW: 8 });
  assert.ok(r.prediction.path.every(isFinite));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test forge-core.test.js`
Expected: FAIL — `gain(rM) > gain(rI)` (현재 timeframe 무시 → 두 결과 동일)

- [ ] **Step 3: 프로파일 산출 + weights 전달** — `forge-core.js:471` 의 `const _ta = analyzeTrend(...)` 줄 **바로 앞**에 한 줄 추가하고, 이어서 471 줄을 교체

추가(471 앞):
```js
    const _prof = trendProfileForTF(opts && opts.timeframe);
```
교체(기존 471 — analyzeTrend 호출에 `weights: _prof.weights` 추가):
```js
    const _ta = analyzeTrend(price, { shortLen: _tp.len || 40, pivotSwing: (_tp.pivotSwing != null ? _tp.pivotSwing / 100 : 0.08), channelK: _tp.channelK || 2, weights: _prof.weights });
```

- [ ] **Step 4: 추세성분에 배율 적용** — `forge-core.js:479` 의 추세 투영 줄을 교체

```js
      const trend = trS * _prof.trendScale * k * Math.exp(-k / (futW * 1.6));                  // 추세 투영(타임프레임 배율·완만 감쇠)
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test forge-core.test.js`
Expected: PASS (전체)

- [ ] **Step 6: 커밋**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): 예측 run에 타임프레임 프로파일 — weights+trendScale 배율"
```

---

### Task 3: 작도 `forge.html` — 엔진에 timeframe 전달 + 작도 weights + 범례 라벨

**Files:**
- Modify: `forge.html` (엔진 호출 `forge.html:3650`·`forge.html:3743`; 차트 trend 분기 `forge.html:2558`·`forge.html:2565`; 오버레이 trend 분기 `forge.html:2612`·`forge.html:2619`)

**Interfaces:**
- Consumes: `ForgeCore.trendProfileForTF` (Task 1), `_visionTF`(전역 타임프레임 문자열|null), `ForgeCore.analyzeTrend`.
- Produces: 없음(작도/엔진 배선).

- [ ] **Step 1: 엔진 호출부에 timeframe 추가** — 두 곳

`forge.html:3743` (runForge):
```js
      lastResult = ForgeCore.run(g, d, { futW: visionFutW(), visionBias: visionBiasLive(), timeframe: _visionTF });
```
`forge.html:3650` (playAnalysis):
```js
    try { steps = ForgeCore.runSteps(boardToGraph(), currentData(), { futW: visionFutW(), visionBias: visionBiasLive(), timeframe: _visionTF }); }
```

- [ ] **Step 2: 차트 trend 분기 — 프로파일 산출·weights·동적 범례** — `forge.html:2558` 의 `const ta = ...` 줄 앞에 프로파일 추가, ta 호출에 weights 추가, `forge.html:2565` 의 legend.push 교체

`forge.html:2558` 영역을 아래로 교체(프로파일 줄 추가 + weights 추가):
```js
          const _prof = ForgeCore.trendProfileForTF(_visionTF);
          const ta = ForgeCore.analyzeTrend(price, { shortLen: (n.params && n.params.len) || 40, pivotSwing: (n.params && n.params.pivotSwing != null ? n.params.pivotSwing / 100 : 0.08), channelK: (n.params && n.params.channelK) || 2, weights: _prof.weights });
```
`forge.html:2565` 교체(동적 라벨):
```js
          legend.push({ col, t: EV_LABEL.trend + (_prof.label ? " · " + _prof.label : "") });
```

- [ ] **Step 3: 오버레이 trend 분기 — 동일 적용** — `forge.html:2612` 영역 교체 + `forge.html:2619` legend.push 교체

`forge.html:2612` 영역을 아래로 교체:
```js
          const _prof = ForgeCore.trendProfileForTF(_visionTF);
          const ta = ForgeCore.analyzeTrend(price, { shortLen: (n.params && n.params.len) || 40, pivotSwing: (n.params && n.params.pivotSwing != null ? n.params.pivotSwing / 100 : 0.08), channelK: (n.params && n.params.channelK) || 2, weights: _prof.weights });
```
`forge.html:2619` 교체:
```js
          legend.push({ col, t: EV_LABEL.trend + (_prof.label ? " · " + _prof.label : "") });
```

> `_prof`는 각 분기 블록 스코프 내 지역 변수 — 두 분기가 서로 독립이라 이름 충돌 없음. `_visionTF`·`EV_LABEL`·`col`은 기존 스코프에 존재.

- [ ] **Step 4: 구문 검증**

`forge.html`의 인라인 `<script>`를 추출해 `node --check` → 구문 오류 없음 확인. 명령·결과를 보고에 기재. (캔버스/DOM 단위테스트 없음 — 컨트롤러가 배포 후 라이브 시각검증)

- [ ] **Step 5: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): 작도에 타임프레임 프로파일 — 엔진 timeframe 전달·weights·범례 티어 라벨"
```

---

## Self-Review

**Spec coverage:**
- §4 `trendProfileForTF`(분류·프로파일 표·순수) → Task 1 + 테스트 5개 ✅
- §5 예측 연동(weights 전달·trendScale 배율·runSteps 전파) → Task 2 + 테스트 ✅ (runSteps는 `run`에 opts 전달하므로 자동 전파)
- §6.1 엔진 호출부 timeframe → Task 3 Step 1 ✅
- §6.2 작도 analyzeTrend weights → Task 3 Step 2·3 ✅
- §6.3 범례 티어 라벨 → Task 3 Step 2·3 (동적 조립) ✅
- §7 테스트(분류 매핑·월봉vs5분·default 안전) → Task 1·2 테스트 ✅

**Placeholder scan:** 모든 코드·명령·기대출력 구체값. TODO/TBD 없음. 작도 검증은 단위테스트 불가 영역이라 구문검사 + 라이브 시각검증 명시.

**Type consistency:** `trendProfileForTF` 반환 키(`tier`/`weights{long,mid,short}`/`trendScale`/`label`)를 Task 2(`_prof.weights`,`_prof.trendScale`)·Task 3(`_prof.weights`,`_prof.label`)에서 동일 사용. `analyzeTrend`의 `weights` 옵션은 선행 구현에 이미 존재(시그니처 불변) ✅.
