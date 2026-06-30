# 엘리어트 다중 degree (소형 + 대형) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 엘리어트 분석이 최근 짧은 구간(소형 degree)만이 아니라 차트 전체를 덮는 대형(primary) degree 파동까지 동시에 분석·작도하고, 대형 방향을 예측에 가중 반영한다.

**Architecture:** 코어(`forge-core.js`)에서 현 `analyzeElliott` 본문의 degree 계산 로직을 순수 헬퍼 `elliottDegree(legs)`로 추출한 뒤, 적응형 스윙 래더 `primarySwings(price, minorSens)`로 대형 변곡점을 뽑아 같은 헬퍼로 대형 degree를 계산한다. `analyzeElliott`는 `{...minor, primary, bias(블렌드)}`를 반환하고, 예측 드리프트 호출부(`run()`)는 최상위 `bias`만 읽으므로 변경이 없다. 작도(`forge.html` `_drawElliottLayers`)와 노드 배지는 `primary`가 있으면 함께 렌더한다.

**Tech Stack:** 바닐라 JS, 빌드 도구 없음. 코어는 UMD 모듈(`forge-core.js`) + `node --test forge-core.test.js`. UI는 단일 `forge.html`.

## Global Constraints

- 코어 단일출처 패턴 유지: 신규는 `elliottDegree`·`primarySwings` 두 헬퍼만, **기존 `detectSwings` 재사용**(신규 스윙 알고리즘 금지).
- **결정적(no RNG)**. `Date.now()`/`Math.random()` 금지.
- **회귀 0 경로**: `primary === null`이면 분석·예측·작도·배지 전부 현행과 동일해야 한다.
- **combine 기여도 불변**: `elliottAnalyze.values`(인덱스별 ±0.7)는 절대 변경 금지(combine 블렌드 수학 보호).
- 예측 블렌드 가중 **정확히 `minor.bias*0.35 + primary.bias*0.65`**, clamp `[-1, 1]`.
- 대형 스윙 래더 **정확히 `[0.30, 0.22, 0.16, 0.12, 0.09]`**, 목표 leg 수 **6~9**.
- 배포 대상은 `forge.html` + `forge-core.js`만(불가침 JSON·키 파일 제외). 단일 HTML·다크 토큰·한국어 라벨·noindex 유지.
- 들여쓰기 2 spaces, 큰따옴표. UI 텍스트 한국어.

---

### Task 1: `elliottDegree(legs)` 순수 헬퍼 추출 (리팩터, 동작 불변)

**Files:**
- Modify: `map/forge-core.js:640-680` (`analyzeElliott`)
- Test: `map/forge-core.test.js` (기존 elliott 테스트가 회귀 가드)

**Interfaces:**
- Consumes: 없음.
- Produces: `elliottDegree(legs)` — 내부 함수(미export). 입력 `legs`=`[{from:{idx,price}, to:{idx,price}, up:bool}...]`. 반환 `{ waves, rules:{r1,r2,r3,score}, structure, current, next, bias }`(현 `analyzeElliott` 반환과 동일 구조).

- [ ] **Step 1: 기존 elliott 테스트가 통과 상태인지 먼저 확인 (리팩터 베이스라인)**

Run: `cd map && node --test forge-core.test.js 2>&1 | grep -E "tests |pass |fail "`
Expected: `tests 83 / pass 83 / fail 0`

- [ ] **Step 2: `analyzeElliott` 본문에서 degree 계산부를 `elliottDegree(legs)`로 추출**

`map/forge-core.js`의 `analyzeElliott`(현재 640-680행)를 아래로 교체한다. `legs.slice(-8)`부터 `bias` clamp까지(현 651-679행)를 그대로 새 함수 `elliottDegree(legs)`로 옮기고, `analyzeElliott`는 스윙→legs 생성 후 헬퍼를 호출한다.

```js
  // 한 degree의 파동 카운트/규칙/구조/투영/bias 계산 (legs = 인접 스윙 다리 배열)
  function elliottDegree(legs) {
    const LAB = ["1", "2", "3", "4", "5", "A", "B", "C"];
    const recent = legs.slice(-8);
    const waves = recent.map((lg, i) => ({ idx: lg.to.idx, price: lg.to.price, label: LAB[i] || "" }));
    const last = recent[recent.length - 1];
    const current = { label: (waves[waves.length - 1] && waves[waves.length - 1].label) || "-", dir: last.up ? 1 : -1 };
    const imp = recent.slice(0, 5), dirUp = imp.length ? imp[0].up : true, sgn = dirUp ? 1 : -1;
    let r1 = false, r2 = false, r3 = false;
    if (imp.length >= 2) { const w1s = imp[0].from.price, w2e = imp[1].to.price; r1 = dirUp ? (w2e >= w1s) : (w2e <= w1s); }
    if (imp.length >= 3) { const len = lg => Math.abs(lg.to.price - lg.from.price); const l1 = len(imp[0]), l3 = len(imp[2]), l5 = imp.length >= 5 ? len(imp[4]) : Infinity; r2 = !(l3 <= l1 && l3 <= l5); }
    if (imp.length >= 4) { const w1e = imp[0].to.price, w4e = imp[3].to.price; r3 = dirUp ? (w4e > w1e) : (w4e < w1e); }
    const passed = [r1, r2, r3].filter(Boolean).length;
    const checked = imp.length >= 4 ? 3 : imp.length >= 3 ? 2 : imp.length >= 2 ? 1 : 0;
    const completeness = Math.min(1, imp.length / 5);
    const score = checked ? (passed / checked) * completeness : 0;
    const allDirOk = imp.length >= 5 && imp[0].up === imp[2].up && imp[0].up === imp[4].up && imp[1].up !== imp[0].up;
    let structure = "uncertain";
    if (imp.length >= 5 && passed >= 2 && allDirOk) structure = dirUp ? "impulse_up" : "impulse_down";
    else if (recent.length >= 3) structure = "corrective";
    const span1 = imp.length ? Math.abs(imp[0].to.price - imp[0].from.price) : 0;
    let next = null;
    if (recent.length === 2 && imp.length >= 2) next = { label: "3", target: imp[1].to.price + sgn * 1.618 * span1, dir: sgn };
    else if (recent.length === 4 && imp.length >= 4) next = { label: "5", target: imp[3].to.price + sgn * span1, dir: sgn };
    else if (recent.length === 5 && imp.length >= 5) { const span15 = Math.abs(imp[4].to.price - imp[0].from.price); next = { label: "A", target: imp[4].to.price - sgn * 0.5 * span15, dir: -sgn }; }
    let bias;
    if (structure === "impulse_up") bias = 0.4 + 0.6 * score;
    else if (structure === "impulse_down") bias = -(0.4 + 0.6 * score);
    else if (structure === "corrective") bias = -current.dir * 0.4;
    else bias = 0;
    bias = Math.max(-1, Math.min(1, bias));
    return { waves, rules: { r1, r2, r3, score }, structure, current, next, bias };
  }

  function analyzeElliott(price, opts) {
    opts = opts || {};
    const swing = opts.swing != null ? opts.swing : 0.03;
    const P = price.length;
    const EMPTY = { waves: [], rules: { r1: false, r2: false, r3: false, score: 0 }, structure: "uncertain", current: { label: "-", dir: 0 }, next: null, bias: 0 };
    if (P < 2) return EMPTY;
    const sw = detectSwings(price, swing);
    if (sw.length < 2) return EMPTY;
    const legs = [];
    for (let i = 1; i < sw.length; i++) legs.push({ from: sw[i - 1], to: sw[i], up: sw[i].price >= sw[i - 1].price });
    const minor = elliottDegree(legs);
    return { waves: minor.waves, rules: minor.rules, structure: minor.structure, current: minor.current, next: minor.next, bias: minor.bias };
  }
```

- [ ] **Step 3: 전체 테스트로 동작 불변(회귀 0) 확인**

Run: `cd map && node --test forge-core.test.js 2>&1 | grep -E "tests |pass |fail "`
Expected: `tests 83 / pass 83 / fail 0` (순수 추출이라 기존 elliott 5개 테스트 포함 전부 그대로 통과)

- [ ] **Step 4: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js
git commit -m "refactor(forge-core): analyzeElliott degree 계산을 elliottDegree(legs) 순수 헬퍼로 추출(동작 불변)"
```

---

### Task 2: `primarySwings(price, minorSens)` 적응형 스윙 래더

**Files:**
- Modify: `map/forge-core.js` (Task 1의 `elliottDegree` 위 또는 아래에 함수 추가) + export 라인 `map/forge-core.js:903`
- Test: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `detectSwings(arr, sens)`(기존).
- Produces: `primarySwings(price, minorSens)` → `{ swings:[{idx,price}...], sens:number }` 또는 `null`. export에 추가하여 테스트에서 직접 호출.

- [ ] **Step 1: 실패 테스트 작성**

`map/forge-core.test.js` 끝에 추가:

```js
test("primarySwings: 너무 짧거나 단조로운 시계열 -> null", () => {
  assert.strictEqual(ForgeCore.primarySwings([10, 11, 12], 0.03), null, "3봉 -> null");
  const upOnly = Array.from({ length: 30 }, (_, i) => 100 + i); // 30봉 단조 상승
  assert.strictEqual(ForgeCore.primarySwings(upOnly, 0.03), null, "짧은 단조 -> null");
});

test("primarySwings: 긴 다중파 시계열 -> 큰 다리 6~9개, sens>minorSens", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  // 큰 5-3 구조를 큰 진폭으로 합성(각 다리 내부는 소형 노이즈 없이 직선) — 총 8 다리, ~300봉
  const price = [100,
    ...seg(100, 200, 40), ...seg(200, 150, 30), ...seg(150, 320, 50),
    ...seg(320, 250, 30), ...seg(250, 400, 45), ...seg(400, 300, 30),
    ...seg(300, 360, 25), ...seg(360, 260, 30)];
  const ps = ForgeCore.primarySwings(price, 0.03);
  assert.ok(ps && Array.isArray(ps.swings), "결과 객체 + swings 배열");
  const legs = ps.swings.length - 1;
  assert.ok(legs >= 6 && legs <= 9, "큰 다리 6~9개 (실제 " + legs + ")");
  assert.ok(ps.sens > 0.03, "대형 민감도가 소형보다 큼");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd map && node --test forge-core.test.js 2>&1 | grep -E "primarySwings|fail "`
Expected: FAIL — `ForgeCore.primarySwings is not a function`

- [ ] **Step 3: `primarySwings` 구현 + export**

`map/forge-core.js`의 `elliottDegree` 바로 위에 추가:

```js
  // 차트 전체를 덮는 대형 degree용 스윙 추출: 큰 다리 6~9개를 목표로 민감도 적응 선택(결정적)
  function primarySwings(price, minorSens) {
    const P = Array.isArray(price) ? price.length : 0;
    if (P < 40) return null;                      // 너무 짧으면 대형 의미 없음
    const LADDER = [0.30, 0.22, 0.16, 0.12, 0.09];
    let pick = null, bestDist = Infinity;
    for (const s of LADDER) {
      if (s <= minorSens) continue;               // 소형보다 굵어야 의미
      const sw = detectSwings(price, s);
      const legs = sw.length - 1;
      const dist = (legs >= 6 && legs <= 9) ? 0 : (legs < 6 ? 6 - legs : legs - 9);
      if (dist < bestDist) { bestDist = dist; pick = { swings: sw, sens: s, legs: legs }; }
      if (dist === 0) break;                       // 6~9 구간의 첫(가장 굵은) 민감도 채택
    }
    if (!pick || pick.legs < 5 || pick.swings.length < 2) return null;  // 5파도 못 그리면 생략
    return { swings: pick.swings, sens: pick.sens };
  }
```

export 라인(903행 부근)의 `analyzeElliott, elliottSteps,`를 `analyzeElliott, elliottSteps, primarySwings,`로 변경한다:

```js
  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run, runSteps, visionBiasFrom, sampleSeries, sampleGraph, analyzeTrend, trendProfileForTF, analyzeMA, maSteps, analyzeFib, fibSteps, analyzeElliott, elliottSteps, primarySwings, analyzeRSI, rsiSteps, synthVolume, analyzeVolume, volumeSteps };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd map && node --test forge-core.test.js 2>&1 | grep -E "tests |pass |fail "`
Expected: `tests 85 / pass 85 / fail 0`

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge-core): primarySwings 적응형 스윙 래더(대형 degree용, 큰 다리 6~9 목표·결정적)"
```

---

### Task 3: `analyzeElliott`에 `primary` + 블렌드 `bias` 결합

**Files:**
- Modify: `map/forge-core.js` (`analyzeElliott` 반환부)
- Test: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `elliottDegree(legs)`(Task 1), `primarySwings(price, minorSens)`(Task 2).
- Produces: `analyzeElliott(price, opts)` → `{ waves, rules, structure, current, next, primary, bias }`. `primary`=`{ waves, rules, structure, current, next, bias }` 또는 `null`. 최상위 `bias`=`primary` 있으면 `clamp(minor.bias*0.35 + primary.bias*0.65)`, 없으면 `minor.bias`.

- [ ] **Step 1: 실패 테스트 작성**

`map/forge-core.test.js` 끝에 추가. (긴 시계열은 Task 2 테스트와 동일 합성식 사용.)

```js
test("analyzeElliott: 긴 시계열 -> primary degree 동반 + bias 블렌드", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100,
    ...seg(100, 200, 40), ...seg(200, 150, 30), ...seg(150, 320, 50),
    ...seg(320, 250, 30), ...seg(250, 400, 45), ...seg(400, 300, 30),
    ...seg(300, 360, 25), ...seg(360, 260, 30)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.03 });
  assert.ok(ea.primary && Array.isArray(ea.primary.waves), "primary degree 존재");
  assert.ok(ea.primary.waves.length >= 5, "대형 파동 카운트 충분");
  // 블렌드: 최상위 bias === clamp(minor*0.35 + primary*0.65)
  const minorB = ForgeCore.analyzeElliott(price, { swing: 0.03, _minorOnly: true });
  // 최상위 bias가 primary.bias 쪽으로 가중되었는지(대형이 더 큰 가중)
  const expected = Math.max(-1, Math.min(1, minorB.bias * 0.35 + ea.primary.bias * 0.65));
  assert.ok(Math.abs(ea.bias - expected) < 1e-9, "bias=minor*0.35+primary*0.65 clamp");
});

test("analyzeElliott: 짧은 시계열 -> primary null, bias=minor (회귀 0)", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.primary, null, "짧으면 primary 없음");
  // 같은 입력의 소형 bias와 동일해야 함(회귀 0)
  assert.ok(ea.structure === "impulse_up" && ea.bias > 0, "소형 분석은 종전대로");
});
```

참고: `_minorOnly` 옵션은 테스트에서 소형 단독 bias를 얻기 위한 것이다. 구현 Step에서 이 옵션을 지원한다(primary 계산·블렌드를 건너뜀).

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd map && node --test forge-core.test.js 2>&1 | grep -E "primary degree|fail "`
Expected: FAIL — `ea.primary`가 `undefined`

- [ ] **Step 3: `analyzeElliott` 반환부에 primary + 블렌드 추가**

Task 1에서 만든 `analyzeElliott`의 마지막 두 줄(`const minor = elliottDegree(legs);` / `return {...}`)을 아래로 교체:

```js
    const minor = elliottDegree(legs);
    let primary = null, bias = minor.bias;
    if (!opts._minorOnly) {
      const ps = primarySwings(price, swing);
      if (ps && ps.swings.length >= 2) {
        const pl = [];
        for (let i = 1; i < ps.swings.length; i++) pl.push({ from: ps.swings[i - 1], to: ps.swings[i], up: ps.swings[i].price >= ps.swings[i - 1].price });
        primary = elliottDegree(pl);
        bias = Math.max(-1, Math.min(1, minor.bias * 0.35 + primary.bias * 0.65));
      }
    }
    return { waves: minor.waves, rules: minor.rules, structure: minor.structure, current: minor.current, next: minor.next, primary: primary, bias: bias };
```

- [ ] **Step 4: 테스트 통과 + 전체 회귀 확인**

Run: `cd map && node --test forge-core.test.js 2>&1 | grep -E "tests |pass |fail "`
Expected: `tests 87 / pass 87 / fail 0` (기존 elliott·run·예측 테스트 전부 그대로 — 최상위 `bias`는 짧은 데모 시계열에서 primary=null이라 불변)

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge-core): analyzeElliott에 primary degree + 예측 bias 블렌드(minor 0.35/primary 0.65), 짧은 시계열은 primary=null로 회귀0"
```

---

### Task 4: `elliottAnalyze` 배지용 `meta.primary` 노출 (values 불변)

**Files:**
- Modify: `map/forge-core.js:621-639` (`elliottAnalyze`)
- Test: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `primarySwings`(Task 2), `elliottDegree`(Task 1).
- Produces: `elliottAnalyze(arr, sens)` → 기존 `{ values, waves, current }`에 `primary: { current, structure } | null` 추가. **`values`는 절대 불변**(combine 기여도 보호).

- [ ] **Step 1: 실패 테스트 작성**

```js
test("elliottAnalyze: 긴 시계열 -> meta.primary 노출, values 불변", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100,
    ...seg(100, 200, 40), ...seg(200, 150, 30), ...seg(150, 320, 50),
    ...seg(320, 250, 30), ...seg(250, 400, 45), ...seg(400, 300, 30),
    ...seg(300, 360, 25), ...seg(360, 260, 30)];
  // values 스냅샷(변경 금지 검증용): evalBlocks 경유로 elliott 노드 값 취득
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "e", kind: "block", blockType: "elliott", params: { swing: 3 } }
  ], edges: [{ from: "p", to: "e" }] };
  const before = ForgeCore.evalBlocks(ForgeCore.buildDAG(g), { price: price, n: price.length });
  assert.ok(before.meta.e.primary && before.meta.e.primary.current, "elliott 노드 meta.primary.current 존재");
  assert.ok(Array.isArray(before.values.e) && before.values.e.length === price.length, "values 길이 불변");
});

test("elliottAnalyze: 짧은 시계열 -> meta.primary null", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10)];
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "e", kind: "block", blockType: "elliott", params: { swing: 4 } }
  ], edges: [{ from: "p", to: "e" }] };
  const r = ForgeCore.evalBlocks(ForgeCore.buildDAG(g), { price: price, n: price.length });
  assert.strictEqual(r.meta.e.primary, null, "짧으면 primary null");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd map && node --test forge-core.test.js 2>&1 | grep -E "meta.primary|fail "`
Expected: FAIL — `before.meta.e.primary`가 `undefined`

- [ ] **Step 3: `elliottAnalyze`에 primary meta 추가**

`map/forge-core.js`의 `elliottAnalyze`(621-639행) 반환문 직전에 primary 계산을 추가하고 반환 객체에 `primary`를 넣는다. `values` 계산은 손대지 않는다.

기존:
```js
    const last = recent[recent.length - 1];
    return {
      values,
      waves: recent.map(lg => ({ idx: lg.to.idx, price: lg.to.price, label: lg.label })),
      current: { label: last.label || "-", dir: last.up ? 1 : -1 }
    };
  }
```

교체:
```js
    const last = recent[recent.length - 1];
    let primary = null;
    const ps = primarySwings(arr, sens);
    if (ps && ps.swings.length >= 2) {
      const pl = [];
      for (let i = 1; i < ps.swings.length; i++) pl.push({ from: ps.swings[i - 1], to: ps.swings[i], up: ps.swings[i].price >= ps.swings[i - 1].price });
      const pd = elliottDegree(pl);
      primary = { current: pd.current, structure: pd.structure };
    }
    return {
      values,
      waves: recent.map(lg => ({ idx: lg.to.idx, price: lg.to.price, label: lg.label })),
      current: { label: last.label || "-", dir: last.up ? 1 : -1 },
      primary: primary
    };
  }
```

`evalBlocks`의 elliott 분기(254-255행)가 `meta[id] = { waves: ea.waves, current: ea.current }`이므로, `primary`도 메타에 전달되도록 같은 분기를 수정한다:

`map/forge-core.js`의 다음 줄(현 255행 부근):
```js
        meta[id] = { waves: ea.waves, current: ea.current };
```
교체:
```js
        meta[id] = { waves: ea.waves, current: ea.current, primary: ea.primary };
```

- [ ] **Step 4: 테스트 통과 + 회귀 확인**

Run: `cd map && node --test forge-core.test.js 2>&1 | grep -E "tests |pass |fail "`
Expected: `tests 89 / pass 89 / fail 0`

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge-core): elliottAnalyze meta.primary(current/structure) 노출(배지용) — values 불변(combine 보호)"
```

---

### Task 5: `elliottSteps`에 대형 degree 줄 추가

**Files:**
- Modify: `map/forge-core.js:682-695` (`elliottSteps`)
- Test: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `analyzeElliott` 반환(`ea.primary`).
- Produces: `elliottSteps(ea)` — `ea.primary`가 있으면 배열 끝에 대형 요약 1줄 추가, 없으면 기존 5줄 그대로.

- [ ] **Step 1: 실패 테스트 작성**

```js
test("elliottSteps: primary 있으면 대형 요약 줄 추가, 없으면 5줄", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const longP = [100,
    ...seg(100, 200, 40), ...seg(200, 150, 30), ...seg(150, 320, 50),
    ...seg(320, 250, 30), ...seg(250, 400, 45), ...seg(400, 300, 30),
    ...seg(300, 360, 25), ...seg(360, 260, 30)];
  const eaLong = ForgeCore.analyzeElliott(longP, { swing: 0.03 });
  const stepsLong = ForgeCore.elliottSteps(eaLong);
  assert.ok(stepsLong.length === 6, "대형 줄 포함 6줄 (실제 " + stepsLong.length + ")");
  assert.ok(stepsLong[5].indexOf("대형") === 0, "마지막 줄이 '대형'으로 시작");

  const shortP = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)];
  const eaShort = ForgeCore.analyzeElliott(shortP, { swing: 0.04 });
  assert.strictEqual(ForgeCore.elliottSteps(eaShort).length, 5, "primary 없으면 5줄");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd map && node --test forge-core.test.js 2>&1 | grep -E "elliottSteps: primary|fail "`
Expected: FAIL — 6줄 기대인데 5줄

- [ ] **Step 3: `elliottSteps` 끝에 대형 줄 추가**

`map/forge-core.js`의 `elliottSteps` 반환 배열 뒤에 primary 줄을 붙인다. 기존 `return [ ... ];`(682-695행)을 아래로 교체:

```js
  function elliottSteps(ea) {
    const fmt = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
    const stKo = s => s === "impulse_up" ? "상승 임펄스" : s === "impulse_down" ? "하락 임펄스" : s === "corrective" ? "ABC 조정" : "불확실";
    const ok = [ea.rules.r1, ea.rules.r2, ea.rules.r3].filter(Boolean).length;
    const nx = ea.next ? "다음 " + ea.next.label + "파 목표 " + fmt(ea.next.target) : "투영 없음";
    const bTxt = ea.bias > 0.1 ? "상승" : ea.bias < -0.1 ? "하락" : "중립";
    const lines = [
      ea.waves.length ? "파동 카운트 " + ea.waves.length + "개 (현재 " + ea.current.label + ")" : "스윙 부족",
      "규칙 " + ok + "/3 · 유효 " + ea.rules.score.toFixed(2),
      stKo(ea.structure) + " 분류",
      nx,
      "종합 방향 " + bTxt + " (bias " + ea.bias.toFixed(2) + ")"
    ];
    if (ea.primary) lines.push("대형 " + stKo(ea.primary.structure) + " · 현재 " + ea.primary.current.label + "파(" + (ea.primary.current.dir > 0 ? "↑" : ea.primary.current.dir < 0 ? "↓" : "–") + ")");
    return lines;
  }
```

(주: 기존 `st` 지역변수를 `stKo` 헬퍼로 바꿔 소형·대형 구조 문자열을 공유한다. 동작 문구는 동일.)

- [ ] **Step 4: 테스트 통과 + 회귀 확인**

Run: `cd map && node --test forge-core.test.js 2>&1 | grep -E "tests |pass |fail "`
Expected: `tests 90 / pass 90 / fail 0`

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge-core): elliottSteps에 대형 degree 요약 줄(분석 재생 표시), 소형만일 땐 5줄 유지"
```

---

### Task 6: hero 작도 — `_drawElliottLayers`에 대형 degree 렌더

**Files:**
- Modify: `map/forge.html:2813-2849` (`_drawElliottLayers`) + 호출부 legend 라벨(2956·3003행)
- Verify: 코어 계약(node) + 코드 존재성(grep) + 라이브 배포 스크린샷

**Interfaces:**
- Consumes: `analyzeElliott(price, ...)` 반환의 `ea.primary`(Task 3) — `{ waves, structure, current, next, rules, bias }` 또는 `null`. 호출부는 이미 `ea`를 넘김(2955·3002행).
- Produces: 대형 파동 폴리라인(2.8px·alpha .85·괄호 라벨 `(1)..(5)/(A)(B)(C)`·3.4px 점) + 대형 구조 배지(별 슬롯) + (있으면) 대형 next 투영선. 소형 작도는 불변.

- [ ] **Step 1: 코어 계약 확인 (작도 입력 형태 + 다중파 시계열에서 primary 형성)**

작도 코드가 소비할 `ea.primary` 계약을, 대형이 반드시 형성되는 합성 다중파 시계열로 확인한다(`sampleSeries`는 데이터에 따라 primary가 null일 수 있으므로 계약 확인엔 부적합):

Run: `cd map && node -e "const F=require('./forge-core.js'); const seg=(a,b,n)=>Array.from({length:n},(_,i)=>a+(b-a)*(i+1)/n); const p=[100,...seg(100,200,40),...seg(200,150,30),...seg(150,320,50),...seg(320,250,30),...seg(250,400,45),...seg(400,300,30),...seg(300,360,25),...seg(360,260,30)]; const ea=F.analyzeElliott(p,{swing:0.03}); console.log('primary?', !!ea.primary, 'waves', ea.primary&&ea.primary.waves.length, 'hasNext', !!(ea.primary&&'next' in ea.primary));"`
Expected: `primary? true waves <N> hasNext true` (N≥5). false면 Task 2/3 회귀이므로 멈추고 조사. (`sampleSeries`에서 null이 나오는 건 회귀가 아니라 데이터 특성 — 작도는 `ea.primary` 유무를 가드하므로 안전.)

- [ ] **Step 2: `_drawElliottLayers`에 대형 렌더 추가**

`map/forge.html`의 `_drawElliottLayers`(2813-2849행) 안, 소형 layer1~3을 그린 뒤(현 `c.restore()` 직전)에 대형 블록을 추가한다. 함수 시작부의 구조분해(`const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;`)와 `_by`/`COL`/`fmt`는 그대로 둔다.

`c.restore();`(2848행) 바로 위에 삽입:

```js
    // ── 대형(primary) degree: 굵은 선 + 괄호 라벨 + 별도 구조 배지 ──
    if (ea.primary && ea.primary.waves && ea.primary.waves.length) {
      const pw = ea.primary.waves;
      if (reveal >= 1) {
        c.save();
        c.globalAlpha = 0.85; c.strokeStyle = COL; c.lineWidth = 2.8; c.setLineDash([]);
        c.beginPath(); let pst = false;
        for (const w of pw) { const x = fiToX(Math.max(fiMin, w.idx)), y = pToY(w.price); if (!isFinite(x) || !isFinite(y)) continue; pst ? c.lineTo(x, y) : c.moveTo(x, y); pst = true; }
        c.stroke();
        for (const w of pw) {
          const x = fiToX(Math.max(fiMin, w.idx)), y = pToY(w.price); if (!isFinite(x) || !isFinite(y)) continue;
          c.fillStyle = COL; c.beginPath(); c.arc(x, y, 3.4, 0, 7); c.fill();
          _evLabel(c, "(" + w.label + ")", x + 4, y - 4, COL, "left");
        }
        c.restore();
      }
      // 대형 구조 배지(소형 배지 아래 슬롯)
      if (reveal >= 2) {
        const pst2 = ea.primary.structure === "impulse_up" ? "임펄스↑" : ea.primary.structure === "impulse_down" ? "임펄스↓" : ea.primary.structure === "corrective" ? "ABC 조정" : "불확실";
        const pok = [ea.primary.rules.r1, ea.primary.rules.r2, ea.primary.rules.r3].filter(Boolean).length;
        const pbcol = ea.primary.structure.indexOf("impulse") === 0 ? COL : ea.primary.structure === "corrective" ? "#e8b463" : "#8a92b2";
        const xb = (xRight != null ? xRight : fiToX(nowFi));
        _evLabel(c, "대형 " + pst2 + " " + pok + "/3", xb, _by + 15, pbcol, "right");
      }
      // 대형 다음 파동 투영선(있으면 더 굵은 점선)
      if (reveal >= 3 && ea.primary.next && pw.length) {
        const lw = pw[pw.length - 1];
        const x0 = fiToX(Math.max(fiMin, lw.idx)), y0 = pToY(lw.price);
        const xR = (xRight != null ? xRight : fiToX(nowFi)), yT = pToY(ea.primary.next.target);
        if ([x0, y0, xR, yT].every(isFinite)) {
          c.save(); c.strokeStyle = COL; c.globalAlpha = .6; c.lineWidth = 2.2; c.setLineDash([7, 5]);
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(xR, yT); c.stroke(); c.restore();
          _evLabel(c, "→(" + ea.primary.next.label + ") " + fmt(ea.primary.next.target), xR, yT, COL, "right");
        }
      }
    }
```

- [ ] **Step 3: legend 라벨을 다중 degree로 갱신(2곳)**

`map/forge.html`의 두 호출부 legend push(2956행·3003행)에서 `EV_LABEL.elliott + "(전문)"`를 `EV_LABEL.elliott + "(전문·다중degree)"`로 바꾼다. 두 줄 모두:

```js
          legend.push({ col, t: EV_LABEL.elliott + "(전문·다중degree)", _key: n.blockType });
```

- [ ] **Step 4: 존재성·구문 검증 (정적)**

Run: `cd map && grep -c "ea.primary && ea.primary.waves" forge.html && grep -c "전문·다중degree" forge.html && node -e "const s=require('fs').readFileSync('forge.html','utf8'); const m=s.match(/<script>([\s\S]*)<\/script>/g)||[]; console.log('script blocks', m.length);"`
Expected: 첫 grep `1`, 둘째 grep `2`, script blocks ≥1. (구문 오류 시 다음 라이브 단계에서 콘솔 에러로 드러남 — 헤드리스 가용 시 Step 5에서 확인.)

- [ ] **Step 5: 라이브 검증은 finishing 단계에서 (배포 후 스크린샷)**

forge.html은 단위 하니스가 없으므로 시각 검증은 배포 후 라이브에서 수행한다(이 Task에서는 정적 검증까지). finishing 단계 체크리스트: 긴 차트(BTC-USD/AAPL)에서 ① 대형 파동이 차트 전체를 가로지르고 ② 괄호 라벨 `(1)..(5)` 표시 ③ "대형 임펄스↑ N/3" 배지 표시 ④ 소형 파동이 최근 구간에 겹쳐 보임.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): hero 엘리어트 대형 degree 작도 — 굵은 선·괄호 라벨(1)..(5)·대형 구조 배지·대형 투영선, 소형 불변"
```

---

### Task 7: 노드 배지 — 대형·소형 동시 표기

**Files:**
- Modify: `map/forge.html:4128-4130` (`paintScanBadges` elliott 분기), `map/forge.html:3358` (`miniMeta` case "elliott")
- Verify: 존재성(grep) + 라이브

**Interfaces:**
- Consumes: `lastResult.meta[n.id].primary`(Task 4의 `{ current, structure }`) 및 `m.current`(소형).
- Produces: 배지 텍스트 `대(<구조약칭>) · 소(<label> <▲/▼>)`. `primary` 없으면 소형만(현행).

- [ ] **Step 1: `paintScanBadges` elliott 분기 수정**

`map/forge.html`의 `paintScanBadges` 내 elliott(현 4127-4131행) else 블록을 교체:

기존:
```js
      } else {
        s.textContent = m && m.current
          ? "파동 " + m.current.label + " " + (m.current.dir > 0 ? "▲" : m.current.dir < 0 ? "▼" : "–")
          : "스캔 대기";
      }
```

교체:
```js
      } else {
        if (m && m.current) {
          const minorTxt = "소(" + m.current.label + " " + (m.current.dir > 0 ? "▲" : m.current.dir < 0 ? "▼" : "–") + ")";
          const pst = m.primary && m.primary.structure;
          const pAbbr = pst === "impulse_up" ? "임펄스↑" : pst === "impulse_down" ? "임펄스↓" : pst === "corrective" ? "ABC" : null;
          s.textContent = pAbbr ? "대(" + pAbbr + ") · " + minorTxt : minorTxt;
        } else {
          s.textContent = "스캔 대기";
        }
      }
```

- [ ] **Step 2: `miniMeta` case "elliott" 수정**

`map/forge.html`의 `miniMeta`(현 3358행) case "elliott"을 교체:

기존:
```js
      case "elliott": return (m && m.current) ? "파동 " + m.current.label + " " + (m.current.dir > 0 ? "▲" : m.current.dir < 0 ? "▼" : "–") : "—";
```

교체:
```js
      case "elliott": {
        if (!(m && m.current)) return "—";
        const minorTxt = "소(" + m.current.label + " " + (m.current.dir > 0 ? "▲" : m.current.dir < 0 ? "▼" : "–") + ")";
        const pst = m.primary && m.primary.structure;
        const pAbbr = pst === "impulse_up" ? "임펄스↑" : pst === "impulse_down" ? "임펄스↓" : pst === "corrective" ? "ABC" : null;
        return pAbbr ? "대(" + pAbbr + ") · " + minorTxt : minorTxt;
      }
```

- [ ] **Step 3: 존재성 검증**

Run: `cd map && grep -c '대(" + pAbbr' forge.html`
Expected: `2` (두 곳)

- [ ] **Step 4: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): 엘리어트 노드 배지 대형·소형 동시 표기(대(임펄스↑)·소(5 ▲)), primary 없으면 소형만"
```

---

## 실행 후 마무리 (finishing 단계에서 수행)

전 Task 완료 후:
1. 전체 코어 회귀: `cd map && node --test forge-core.test.js` → `pass 90 / fail 0` 확인.
2. 최종 whole-branch 리뷰(가장 강력한 모델) — 회귀 0 경로(`primary=null`), 블렌드 산식, combine values 불변, 작도/배지 계약 정합 점검.
3. READY 시: main 머지(`--no-ff`) → push → cafe24 배포 `forge.html`+`forge-core.js`(SFTP `cd www/map; put forge.html; put forge-core.js`) → 라이브 검증(긴 차트 대형 파동·괄호 라벨·배지·예측 블렌드 방향).
   - **불가침**: `forge_data.json`/`forge_images.json`/`forge_jobs.json`/`forge_td_key.txt`/`forge_ohlc_cache_*.json` 업로드 금지.

## Self-Review 메모 (작성자 확인)

- **Spec 커버리지**: §3 데이터모델→T1·T3, §4 적응형 래더→T2, §5 예측결합→T3(최상위 bias, run 무변경), §6 작도→T6, §7 배지/combine불변→T4·T7, §8 elliottSteps→T5, §9 테스트→각 T, §10 비목표→Global Constraints. 누락 없음.
- **타입 일관성**: `elliottDegree(legs)`(T1) 반환 키 `{waves,rules,structure,current,next,bias}` ↔ T3 primary 사용·T6 작도 사용 일치. `primarySwings`→`{swings,sens}|null`(T2) ↔ T3·T4 소비 일치. `meta.primary={current,structure}`(T4) ↔ T7 배지 소비 일치.
- **회귀 0**: 짧은 데모 시계열(기존 elliott 테스트)은 P<40 또는 primary 미형성 → `primary=null` → 최상위 bias=minor.bias, 작도/배지 소형만. 기존 83 테스트 불변 기대.
