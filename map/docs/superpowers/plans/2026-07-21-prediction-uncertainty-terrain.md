# 예측선 불확실성 지형 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스쿱포지 4패널 차트의 예측 작도에 "①시간이 갈수록 못 맞힌다 ②목표 도달 확률 자체가 낮다"를 시각·수치로 인지시키는 확률 지형(확률 감쇠 레일 + 분위수 팬 + 선 해체)을 추가한다.

**Architecture:** 확률을 두 축으로 분리한다 — 화면에 **숫자로 노출하는 값**은 `ForgeCore.calibrateUpProb`를 통과한 방향 적중 확률 `pCal(k)`(정직·과신 없음), **시각 감쇠를 구동하는 값**은 압축 없는 정보량 `z(k) = |log(center/anchor)| / log(hi/center)`(숫자로 노출 안 함). 기존의 지평 비율 기반 선형 페이드(`_predLineFade(t)`)를 z 기반 `conf(k)`로 전면 교체하고, 기존 가우시안 밀도 구름을 경계가 읽히는 분위수 팬으로 대체한다. 전부 `forge-draw.js` 작도층이며 엔진(`forge-core.js`)은 한 줄도 건드리지 않는다.

**Tech Stack:** 순수 HTML5 · CSS3 · Vanilla JS(빌드 도구 없음) · Canvas 2D · Node.js `node --test`(엔진 회귀만) · 실소스 추출 검증 스크립트(Node)

**설계 문서:** `docs/superpowers/specs/2026-07-21-prediction-uncertainty-terrain-design.md`

## Global Constraints

- **엔진 불변.** `forge-core.js`를 수정하지 않는다. 작업 종료 시 `node --test forge-core.test.js` 가 **246/246 통과**해야 한다(현행과 동일 수치).
- **확률 근거는 엔진 산출값만.** `backtest/horizon-report.json` 등 백테스트 산출 파일을 런타임에서 참조하지 않는다.
- **결정론·난수 없음.** 작도에 `Math.random()` 금지. 꿈틀 시드는 기존 `_predSeed` 규약 유지.
- **웹분석 후에만 예측 작도.** `window._fcPreview` 가 truthy면 예측 요소를 전혀 그리지 않는 기존 분기를 유지한다.
- **세로 스케일 불변.** `lo`/`hi` 가 여전히 예측 영역 최외곽. 프레이밍 계산(`fcDrawMainChart` 의 밴드 세로범위 코드)을 바꾸지 않는다.
- **여러 classic script가 전역 스코프 공유.** 로드 순서(core→state→ui→draw→app) 고정, `defer`/`async` 금지, 중복 최상위 선언 금지.
- **항목 좌측 컬러 라인(accent bar/rail) 절대 금지.** 활성/선택 표시는 배경색·텍스트색·체크·아웃라인으로만.
- **색 하드코딩 최소화.** 방향색(bull `70,194,142` / bear `224,106,106`)·중립 슬레이트(`138,146,178`)는 이 파일의 기존 상수 규약을 따른다(테마 무관 상수).
- 들여쓰기 2 spaces · 큰따옴표 · 주석은 WHY 위주 한국어.
- 배포 시 정적 7종 동반: `forge.html` `forge.css` `forge-core.js` `forge-state.js` `forge-ui.js` `forge-draw.js` `forge-app.js`. 서버 생성 데이터(`forge_data.json` 등) 불가침.

## File Structure

| 파일 | 역할 | 이번 변경 |
|---|---|---|
| `forge-draw.js` | 캔버스 작도 전부 | **주 작업 대상.** 확률/신뢰 커널 4함수 신규, `_predWigVal` 시그니처 변경, `_wigStroke` 재작성, `_drawPredFan`·`_drawPredRail` 신규, `_predCloudCol`·`_predLineFade` 삭제, 범례 항목 2개 추가 |
| `forge.html` | 스크립트 참조 | `forge-draw.js?v=` 캐시버스터만 갱신 |
| `backtest/verify-pred-terrain.js` | 실소스 추출 검증(신규) | `forge-draw.js` 텍스트에서 순수 함수를 추출·평가해 단언. 배포 제외 디렉터리 |
| `forge-core.js` / `forge-core.test.js` | 엔진 | **변경 없음.** 회귀 확인용으로만 실행 |
| `forge.css` | 스타일 | **변경 없음** (범례 스와치 `.fc-leg-sw.sq` 기존 클래스 재사용) |

`forge-draw.js` 는 3,200줄대의 기존 대형 파일이며 이 프로젝트의 확립된 구조다. 이번 작업으로 분할하지 않는다(관련 없는 리팩터링 금지).

---

### Task 1: 확률·신뢰 커널 (순수 함수 4종)

**Files:**
- Modify: `forge-draw.js` — `_predLineFade`/`_predCloudFade` 정의 직후(현재 38~40행 부근)에 삽입
- Test: `backtest/verify-pred-terrain.js` (신규 생성)

**Interfaces:**
- Consumes: 전역 `_upProb(pred, hi, anchor)` (`forge-app.js:164` 정의, 같은 전역 스코프에서 이미 `forge-draw.js` 가 호출 중), 전역 `ForgeCore.calibrateUpProb(p)`
- Produces:
  - `_Z_LO = 0.08`, `_Z_HI = 0.50`, `_Z_HORIZON = 0.25` (상수)
  - `_predZ(center, hi, anchor) -> number` — 정보량 z, 0 이상. 비유한/불가 입력이면 0
  - `_predConf(z) -> number` — 0..1
  - `_predHorizonK(centerArr, hiArr, anchor) -> number|null` — z가 `_Z_HORIZON` 미만이 되는 첫 배열 index(최소 1). 끝까지 유지되면 `null`
  - `_predPCal(centerArr, hiArr, anchor, k) -> number` — 0..100 정수, 그 봉의 예측 방향이 실현될 캘리브레이션 확률

- [ ] **Step 1: 검증 스크립트를 작성한다 (실패하는 테스트)**

Create `backtest/verify-pred-terrain.js`:

```js
/* forge-draw.js 실소스 추출 검증 — 예측 불확실성 지형 순수 함수.
   forge-draw.js는 브라우저 전용(IIFE·DOM 의존)이라 require 불가 → 함수 소스만 텍스트에서 잘라 eval 한다. */
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const SRC = fs.readFileSync(path.join(__dirname, "..", "forge-draw.js"), "utf8");

/* 이름으로 함수 소스 추출(중괄호 균형 매칭). 실패하면 즉시 에러 — 함수명이 바뀌면 검증이 조용히 통과하지 않게. */
function grabFn(name) {
  const at = SRC.indexOf("function " + name + "(");
  if (at < 0) throw new Error("함수를 찾지 못함: " + name);
  let i = SRC.indexOf("{", at), depth = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === "{") depth++;
    else if (SRC[j] === "}") { depth--; if (depth === 0) return SRC.slice(at, j + 1); }
  }
  throw new Error("중괄호 불균형: " + name);
}

/* 상수 추출 — `const _Z_LO = 0.08, _Z_HI = 0.50, _Z_HORIZON = 0.25;` 형태 한 줄 */
function grabConstLine(marker) {
  const line = SRC.split("\n").find(l => l.includes(marker) && l.trim().startsWith("const "));
  if (!line) throw new Error("상수 줄을 찾지 못함: " + marker);
  return line.trim();
}

const sandbox = {};
const setup = [
  grabConstLine("_Z_HORIZON"),
  grabFn("_predZ"),
  grabFn("_predConf"),
  grabFn("_predHorizonK"),
  grabFn("_predPCal"),
].join("\n");

/* _predPCal 의 외부 의존은 스텁으로 주입(엔진·앱 레이어를 끌어오지 않는다) */
const harness = new Function("stub", `
  const _upProb = stub._upProb, ForgeCore = stub.ForgeCore;
  ${setup}
  return { _predZ, _predConf, _predHorizonK, _predPCal, _Z_LO, _Z_HI, _Z_HORIZON };
`);

/* 스텁: 실제 forge-app.js/_forge-core.js 구현과 동일 수식 */
function _normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
const stub = {
  _upProb(pred, hi, anchor) {
    if (!(pred > 0 && hi > 0 && anchor > 0)) return 50;
    const m = Math.log(pred / anchor), sd = Math.log(hi / pred);
    return Math.round(_normCdf(m / (sd || 1e-6)) * 100);
  },
  ForgeCore: {
    calibrateUpProb(p) {
      if (p == null || !isFinite(p)) return p;
      const q = Math.min(0.999, Math.max(0.001, p / 100)), A = 0.2117, B = 0.3501;
      return Math.round((1 / (1 + Math.exp(-(A * Math.log(q / (1 - q)) + B)))) * 100);
    }
  }
};

const K = harness(stub);
let pass = 0;
function ok(name, fn) { fn(); pass++; console.log("  ok  " + name); }

/* ── 1. _predZ ── */
ok("z: 정상 입력에서 양수", () => {
  const z = K._predZ(110, 120, 100);
  assert.ok(z > 0 && isFinite(z), "z=" + z);
});
ok("z: 밴드가 넓어지면 감소(지평 감쇠의 근원)", () => {
  const near = K._predZ(102, 104, 100);   // 변위 2%, 밴드 2%
  const far = K._predZ(104, 120, 100);    // 변위 4%, 밴드 15%
  assert.ok(near > far, "near=" + near + " far=" + far);
});
ok("z: hi <= center 면 0", () => {
  assert.strictEqual(K._predZ(110, 110, 100), 0);
  assert.strictEqual(K._predZ(110, 90, 100), 0);
});
ok("z: 비유한/0/음수 입력이면 0", () => {
  assert.strictEqual(K._predZ(NaN, 120, 100), 0);
  assert.strictEqual(K._predZ(110, 120, 0), 0);
  assert.strictEqual(K._predZ(-5, 120, 100), 0);
});
ok("z: 하락 예측도 양수(절대값)", () => {
  assert.ok(K._predZ(90, 95, 100) > 0);
});

/* ── 2. _predConf ── */
ok("conf: Z_LO 이하면 0, Z_HI 이상이면 1", () => {
  assert.strictEqual(K._predConf(0), 0);
  assert.strictEqual(K._predConf(K._Z_LO), 0);
  assert.strictEqual(K._predConf(K._Z_HI), 1);
  assert.strictEqual(K._predConf(99), 1);
});
ok("conf: 중간은 선형", () => {
  const mid = (K._Z_LO + K._Z_HI) / 2;
  assert.ok(Math.abs(K._predConf(mid) - 0.5) < 1e-9);
});

/* ── 3. _predHorizonK ── */
ok("horizon: 임계 교차 index 반환", () => {
  const anchor = 100;
  const center = [102, 104, 105, 106, 106];
  const hi = [103, 108, 118, 130, 145];   // 뒤로 갈수록 밴드 폭발 → z 급감
  const k = K._predHorizonK(center, hi, anchor);
  assert.ok(k !== null && k >= 1 && k < center.length, "k=" + k);
  assert.ok(K._predZ(center[k], hi[k], anchor) < K._Z_HORIZON);
  assert.ok(K._predZ(center[k - 1], hi[k - 1], anchor) >= K._Z_HORIZON);
});
ok("horizon: 끝까지 신뢰 유지면 null", () => {
  const center = [110, 120, 130], hi = [111, 121, 131];
  assert.strictEqual(K._predHorizonK(center, hi, 100), null);
});
ok("horizon: k=0 은 절대 반환하지 않음(seam 겹침 방지)", () => {
  const center = [100.0001, 100.0001, 100.0001], hi = [200, 200, 200];   // 첫 봉부터 무신뢰
  const k = K._predHorizonK(center, hi, 100);
  assert.ok(k === null || k >= 1, "k=" + k);
});
ok("horizon: 빈 배열이면 null", () => {
  assert.strictEqual(K._predHorizonK([], [], 100), null);
});

/* ── 4. _predPCal ── */
ok("pCal: 상승 예측이면 상승확률 그대로", () => {
  const center = [110], hi = [115], anchor = 100;
  const raw = stub._upProb(110, 115, 100), cal = stub.ForgeCore.calibrateUpProb(raw);
  assert.strictEqual(K._predPCal(center, hi, anchor, 0), cal);
});
ok("pCal: 하락 예측이면 100 - 상승확률", () => {
  const center = [90], hi = [95], anchor = 100;
  const raw = stub._upProb(90, 95, 100), cal = stub.ForgeCore.calibrateUpProb(raw);
  assert.strictEqual(K._predPCal(center, hi, anchor, 0), 100 - cal);
});
ok("pCal: 50% 미만이 나올 수 있다(정직성 — 반대 우세를 숨기지 않음)", () => {
  const center = [99.5], hi = [125], anchor = 100;   // 약한 하락 예측 + 넓은 밴드
  const p = K._predPCal(center, hi, anchor, 0);
  assert.ok(p < 50, "p=" + p);
});
ok("pCal: 항상 0~100 정수", () => {
  for (const [cv, hv] of [[110, 115], [90, 95], [100.01, 400], [1, 2]]) {
    const p = K._predPCal([cv], [hv], 100, 0);
    assert.ok(Number.isInteger(p) && p >= 0 && p <= 100, "p=" + p);
  }
});

console.log("\n" + pass + "/" + pass + " 통과");
```

- [ ] **Step 2: 실행해서 실패를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node backtest/verify-pred-terrain.js`
Expected: FAIL — `Error: 상수 줄을 찾지 못함: _Z_HORIZON`

- [ ] **Step 3: 커널을 구현한다**

`forge-draw.js` 에서 `_predCloudFade` 정의 줄(현재 40행 부근, `function _predCloudFade(t) { ... }`) **바로 아래**에 삽입:

```js
  // ── 불확실성 지형(spec 2026-07-21 terrain): 표기용 확률 ≠ 시각 감쇠용 정보량 ──
  // 캘리브레이션은 값을 55~65%로 압축해 감쇠 서사를 못 싣고, raw는 과신(OOS ECE 8.8%p). 그래서 두 축으로 분리한다.
  const _Z_LO = 0.08, _Z_HI = 0.50, _Z_HORIZON = 0.25;   // conf 하한/상한 · 신뢰 지평 임계
  // 정보량 z = 예측 변위 / 밴드 반폭. 압축 없이 지평 감쇠가 선명 → 시각(알파·굵기·해체)만 구동. 숫자로 노출 금지.
  function _predZ(center, hi, anchor) {
    if (!(center > 0 && hi > 0 && anchor > 0)) return 0;
    const sd = Math.log(hi / center);
    if (!(sd > 0) || !isFinite(sd)) return 0;
    const z = Math.abs(Math.log(center / anchor)) / sd;
    return isFinite(z) ? z : 0;
  }
  function _predConf(z) { return Math.max(0, Math.min(1, (z - _Z_LO) / (_Z_HI - _Z_LO))); }
  // 신뢰 지평 = z가 임계 아래로 처음 떨어지는 봉. k=0은 반환하지 않음(seam 선과 겹치면 판독 불가).
  function _predHorizonK(center, hi, anchor) {
    if (!center || !hi) return null;
    for (let k = 1; k < center.length; k++) if (_predZ(center[k], hi[k], anchor) < _Z_HORIZON) return k;
    return null;
  }
  // 표기용 확률: 그 봉의 예측 '방향'이 실현될 캘리브레이션 확률(%). 50 미만이면 반대가 우세하다는 뜻 — 숨기지 않는다.
  function _predPCal(center, hi, anchor, k) {
    const raw = _upProb(center[k], hi[k], anchor);
    const cal = (typeof ForgeCore !== "undefined" && ForgeCore && ForgeCore.calibrateUpProb) ? ForgeCore.calibrateUpProb(raw) : raw;
    return (center[k] >= anchor) ? cal : (100 - cal);
  }
```

- [ ] **Step 4: 실행해서 통과를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node backtest/verify-pred-terrain.js`
Expected: PASS — `15/15 통과`

- [ ] **Step 5: 엔진 회귀를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test forge-core.test.js 2>&1 | tail -5`
Expected: `# pass 246`, `# fail 0`

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add forge-draw.js backtest/verify-pred-terrain.js
git commit -m "feat(forge): 예측 불확실성 커널 — 표기용 pCal / 시각용 z·conf 분리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 선 해체 — 공용 스트로크 헬퍼 + conf 전환 (1·2·3차 동시)

**Files:**
- Modify: `forge-draw.js` — `_predWigVal`(현재 73~78행 부근), `_predLineFade`/`_PRED_T0`/`_PRED_T1` 삭제(38~39행 부근), `_strokePredLine`·`_predConfSeq` 신설, `fcDrawMainChart` 내 `_wigStroke`(현재 1043행 부근), `drawEvidence` 내 2차 예측선 블록(현재 2996~3001행 부근)
- Test: `backtest/verify-pred-terrain.js` (케이스 추가)

**Interfaces:**
- Consumes: Task 1의 `_predZ` / `_predConf` / `_predHorizonK`
- Produces:
  - `_predWigVal(center, loK, hiK, wv, conf) -> number` — **시그니처 변경**(기존 `(k, futW, center, loK, hiK, wv)`). `k`/`futW` 제거, 마지막에 `conf` 추가. `conf` 가 `null`/`undefined`/비유한이면 1로 취급
  - `_predConfSeq(centerArr, hiArr, anchor) -> { conf: number[], kEnd: number }` — 봉별 신뢰도 배열과 실선/점묘 경계 index(지평 없으면 `centerArr.length`)
  - `_strokePredLine(c, opts)` — `opts = { n, x0, y0, xAt(k), yAt(k), conf, kEnd, rgb, dash, lw }`. 반환값 없음
  - `_wigStroke(vals, rgb, dash, lw, sd)` — 시그니처 불변, 내부만 헬퍼 위임

> **1·2·3차를 한 Task로 묶는 이유:** `_predWigVal` 시그니처를 바꾸면 세 호출부가 동시에 바뀌어야 한다. 나눠 커밋하면 중간 커밋에서 2차 예측선이 잘못된 인자로 그려진다.

- [ ] **Step 1: 검증 케이스를 추가한다 (실패하는 테스트)**

`backtest/verify-pred-terrain.js` 의 `setup` 배열과 `harness` return 을 다음으로 교체:

```js
const setup = [
  grabConstLine("_Z_HORIZON"),
  grabFn("_predZ"),
  grabFn("_predConf"),
  grabFn("_predHorizonK"),
  grabFn("_predPCal"),
  grabFn("_predWigVal"),
  grabFn("_predConfSeq"),
].join("\n");

const harness = new Function("stub", `
  const _upProb = stub._upProb, ForgeCore = stub.ForgeCore;
  ${setup}
  return { _predZ, _predConf, _predHorizonK, _predPCal, _predWigVal, _predConfSeq, _Z_LO, _Z_HI, _Z_HORIZON };
`);
```

그리고 마지막 `console.log("\n" + pass ...)` 줄 **바로 위**에 삽입:

```js
/* ── 5. _predWigVal (conf 전환) ── */
ok("wigVal: conf=0 이면 꿈틀 없음(center 그대로)", () => {
  assert.strictEqual(K._predWigVal(100, 90, 110, 1, 0), 100);
  assert.strictEqual(K._predWigVal(100, 90, 110, -1, 0), 100);
});
ok("wigVal: conf=1 이면 최대 진폭 = 국소 밴드 반폭의 0.5배", () => {
  // amp = 0.5 * ((hi-lo)/2) = 0.5 * 10 = 5
  assert.strictEqual(K._predWigVal(100, 90, 110, 1, 1), 105);
  assert.strictEqual(K._predWigVal(100, 90, 110, -1, 1), 95);
});
ok("wigVal: conf 생략(null/undefined)이면 1로 취급", () => {
  assert.strictEqual(K._predWigVal(100, 90, 110, 1, null), 105);
  assert.strictEqual(K._predWigVal(100, 90, 110, 1), 105);
});
ok("wigVal: 밴드 밖으로 절대 나가지 않음(하드 클램프)", () => {
  assert.strictEqual(K._predWigVal(109, 90, 110, 1, 1), 110);
  assert.strictEqual(K._predWigVal(91, 90, 110, -1, 1), 90);
});
ok("wigVal: 시그니처에서 k/futW가 제거됐다(옛 호출 잔존 방지)", () => {
  assert.strictEqual(K._predWigVal.length, 5, "인자 수=" + K._predWigVal.length);
});

/* ── 6. _predConfSeq ── */
ok("confSeq: conf 길이 = center 길이, 전부 0..1", () => {
  const r = K._predConfSeq([102, 104, 105], [103, 108, 118], 100);
  assert.strictEqual(r.conf.length, 3);
  for (const v of r.conf) assert.ok(v >= 0 && v <= 1, "v=" + v);
});
ok("confSeq: 지평이 있으면 kEnd = 그 index", () => {
  const center = [102, 104, 105, 106, 106], hi = [103, 108, 118, 130, 145];
  const r = K._predConfSeq(center, hi, 100);
  assert.strictEqual(r.kEnd, K._predHorizonK(center, hi, 100));
  assert.ok(r.kEnd < center.length, "kEnd=" + r.kEnd);
});
ok("confSeq: 지평이 없으면 kEnd = 전체 길이(점묘 구간 없음)", () => {
  const center = [110, 120, 130], hi = [111, 121, 131];
  assert.strictEqual(K._predConfSeq(center, hi, 100).kEnd, 3);
});
```

- [ ] **Step 2: 실행해서 실패를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node backtest/verify-pred-terrain.js`
Expected: FAIL — `Error: 함수를 찾지 못함: _predConfSeq`

- [ ] **Step 3: `_predWigVal` 을 교체한다**

`forge-draw.js` 의 다음 블록을

```js
  function _predWigVal(k, futW, center, loK, hiK, wv) {   // 꿈틀 y값(가격): center + 진폭·워크값(wv∈[-1,1])·페이드, 밴드[lo,hi] 하드 클램프
    const t = futW > 0 ? k / futW : 0, amp = 0.5 * ((hiK - loK) / 2);
    const v = center + amp * wv * _predLineFade(t);
    return Math.max(loK, Math.min(hiK, v));
  }
```

이것으로 교체:

```js
  // 꿈틀 y값(가격): center + 진폭·워크값(wv∈[-1,1])·신뢰도(conf), 밴드[lo,hi] 하드 클램프.
  // 페이드 근거를 지평 비율 t → 정보량 기반 conf 로 교체(종목·밴드폭에 반응).
  function _predWigVal(center, loK, hiK, wv, conf) {
    const amp = 0.5 * ((hiK - loK) / 2), cf = (conf == null || !isFinite(conf)) ? 1 : conf;
    const v = center + amp * wv * cf;
    return Math.max(loK, Math.min(hiK, v));
  }
```

- [ ] **Step 4: 공용 스트로크 헬퍼를 신설한다**

방금 교체한 `_predWigVal` **바로 아래**에 삽입:

```js
  // 봉별 신뢰도 배열 + 실선/점묘 경계. 1·2·3차가 같은 계산을 쓰도록 한 곳에 둔다.
  function _predConfSeq(center, hi, anchor) {
    const n = center.length, cf = new Array(n);
    for (let k = 0; k < n; k++) cf[k] = _predConf(_predZ(center[k], hi[k], anchor));
    const kh = _predHorizonK(center, hi, anchor);
    return { conf: cf, kEnd: (kh == null) ? n : kh };
  }
  // 예측선 공통 스트로크: 신뢰 구간은 봉별 알파·굵기 세그먼트 실선, 신뢰 지평 이후는 점묘.
  // 점묘는 '연결된 경로'라는 주장 자체를 철회하는 표현이므로 1·2·3차가 반드시 같은 규칙을 공유해야 한다.
  // 좌표 변환·클램프는 호출부마다 다르므로 xAt/yAt 콜백으로 주입받는다.
  function _strokePredLine(c, o) {
    const n = o.n; if (!(n > 0)) return;
    c.save(); c.lineJoin = "round"; c.lineCap = "round";
    let x0 = o.x0, y0 = o.y0;
    for (let k = 0; k < o.kEnd; k++) {
      const x1 = o.xAt(k), y1 = o.yAt(k); if (!isFinite(x1) || !isFinite(y1)) continue;
      c.strokeStyle = "rgba(" + o.rgb + "," + (0.25 + 0.75 * o.conf[k]).toFixed(3) + ")";
      c.lineWidth = o.lw * (0.55 + 0.45 * o.conf[k]);
      if (o.dash) c.setLineDash(o.dash); else c.setLineDash([]);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      x0 = x1; y0 = y1;
    }
    c.setLineDash([]);
    for (let k = o.kEnd; k < n; k++) {   // 지평 이후: 점만 — 사이를 잇지 않는다
      const x1 = o.xAt(k), y1 = o.yAt(k); if (!isFinite(x1) || !isFinite(y1)) continue;
      c.fillStyle = "rgba(" + o.rgb + "," + (0.15 + 0.35 * o.conf[k]).toFixed(3) + ")";
      c.beginPath(); c.arc(x1, y1, 1.3, 0, 7); c.fill();
    }
    c.restore();
  }
```

- [ ] **Step 5: `_wigStroke`(1·3차)을 헬퍼 위임으로 재작성한다**

`fcDrawMainChart` 안의 다음 블록을

```js
      const _wigStroke = (vals, rgb, dash, lw, sd) => {
        const seq = _predWigSeqSR(vals.length, vals, lo, hi, _levels, _tex, sd);   // 계산된 꿈틀(S/R 반응 + AR 결)
        c.save(); c.lineWidth = lw; c.lineJoin = "round"; c.lineCap = "round"; if (dash) c.setLineDash(dash);
        const grad = c.createLinearGradient(seamX, 0, coneR, 0);
        for (let i = 0; i <= 10; i++) { const t = i / 10; grad.addColorStop(t, "rgba(" + rgb + "," + _predLineFade(t).toFixed(3) + ")"); }
        c.strokeStyle = grad; c.beginPath(); c.moveTo(seamX, _cy(toY(anchor)));
        for (let k = 0; k < vals.length; k++) c.lineTo(toXf(k), _cy(toY(_predWigVal(k, _fw, vals[k], lo[k], hi[k], seq[k]))));
        c.stroke(); c.setLineDash([]); c.restore();
      };
```

이것으로 교체:

```js
      const _wigStroke = (vals, rgb, dash, lw, sd) => {
        const n = vals.length; if (!n) return;
        const seq = _predWigSeqSR(n, vals, lo, hi, _levels, _tex, sd);   // 계산된 꿈틀(S/R 반응 + AR 결)
        const cs = _predConfSeq(vals, hi, anchor);
        _strokePredLine(c, {
          n: n, x0: seamX, y0: _cy(toY(anchor)),
          xAt: k => toXf(k),
          yAt: k => _cy(toY(_predWigVal(vals[k], lo[k], hi[k], seq[k], cs.conf[k]))),
          conf: cs.conf, kEnd: cs.kEnd, rgb: rgb, dash: dash, lw: lw
        });
      };
```

- [ ] **Step 6: 2차 예측선을 같은 헬퍼로 교체한다**

`drawEvidence` 의 "2차 예측선(표시중 지표 조합)" 블록에서 다음 6줄을

```js
            c.save(); c.lineWidth = 3.2; c.setLineDash([9, 4]); c.lineJoin = "round"; c.lineCap = "round";
            const grad2 = c.createLinearGradient(_sx, 0, _cR, 0);
            for (let i = 0; i <= 10; i++) { const t = i / 10; grad2.addColorStop(t, "rgba(77,208,255," + _predLineFade(t).toFixed(3) + ")"); }
            c.strokeStyle = grad2; c.beginPath(); c.moveTo(_sx, _cy2(toY(g.anchor)));
            for (let k = 0; k < _pl; k++) { const bd = _2band(k), x = _t2x(k), y = _cy2(toY(_predWigVal(k, _pl, p2.path[k], bd[0], bd[1], _seq2[k]))); if (isFinite(x) && isFinite(y)) c.lineTo(x, y); }
            c.stroke(); c.setLineDash([]); c.restore();
```

이것으로 교체:

```js
            const _cs2 = _predConfSeq(p2.path, _2hi, g.anchor);
            _strokePredLine(c, {
              n: _pl, x0: _sx, y0: _cy2(toY(g.anchor)),
              xAt: k => _t2x(k),
              yAt: k => _cy2(toY(_predWigVal(p2.path[k], _2lo[k], _2hi[k], _seq2[k], _cs2.conf[k]))),
              conf: _cs2.conf, kEnd: _cs2.kEnd, rgb: "77,208,255", dash: [9, 4], lw: 3.2
            });
```

- [ ] **Step 7: `_predLineFade` 를 삭제한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && grep -n "_predLineFade" forge-draw.js`
Expected: 정의 줄 1개만 남음(호출 0)

`forge-draw.js` 의 다음 2줄을

```js
  const _PRED_T0 = 0.15, _PRED_T1 = 0.75, _PRED_C0 = 0.10, _PRED_C1 = 0.70;   // 크로스페이드 상수(선 페이드아웃 / 구름 페이드인)
  function _predLineFade(t) { return Math.max(0, Math.min(1, 1 - (t - _PRED_T0) / (_PRED_T1 - _PRED_T0))); }   // 선 불투명·꿈틀 진폭: 근거리1→원거리0
```

이 1줄로 축약:

```js
  const _PRED_C0 = 0.10, _PRED_C1 = 0.70;   // 분위수 팬 페이드인 구간(근거리 0 → 원거리 1)
```

- [ ] **Step 8: 잔존 참조·옛 호출이 0인지 확인한다**

Run:
```bash
cd /home/jschoi0223/projects/vdiportal/map
grep -c "_predLineFade" forge-draw.js || echo "_predLineFade 0건 — 정상"
grep -n "_predWigVal(k, " forge-draw.js || echo "옛 6인자 호출 0건 — 정상"
grep -c "_predWigVal(" forge-draw.js
```
Expected: `_predLineFade 0건 — 정상` / `옛 6인자 호출 0건 — 정상` / `_predWigVal(` 는 3건(정의 1 + 1·3차 1 + 2차 1)

- [ ] **Step 9: 검증·구문·회귀 실행**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node -e 'new Function(require("fs").readFileSync("forge-draw.js","utf8"));console.log("구문 OK")' && node backtest/verify-pred-terrain.js && node --test forge-core.test.js 2>&1 | tail -3`
Expected: `구문 OK` / `23/23 통과` / `# pass 246` / `# fail 0`

- [ ] **Step 10: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add forge-draw.js backtest/verify-pred-terrain.js
git commit -m "feat(forge): 예측선 해체 — conf 세그먼트 스트로크 + 신뢰지평 이후 점묘(1·2·3차 공용 헬퍼)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: (Task 2 에 병합됨 — 실행하지 않음)

2차 예측선의 conf 전환·점묘 적용은 Task 2 Step 6 에서 공용 헬퍼 `_strokePredLine` 로 함께 처리한다. `_predWigVal` 시그니처를 바꾸는 순간 세 호출부가 동시에 바뀌어야 하므로 분리 커밋이 불가능하다.

---

### Task 4: 분위수 팬 (가우시안 밀도 구름 대체)

**Files:**
- Modify: `forge-draw.js` — `_predCloudCol` 삭제(현재 79~87행 부근), `_drawPredFan` 신설, `fcDrawMainChart` 의 `if (_predVis.band)` 블록 내 구름 루프 교체(현재 1030~1041행 부근), `_predVis` 초기값(현재 88행)

**Interfaces:**
- Consumes: `_predCloudFade`
- Produces:
  - `_Q50 = 0.6745` (정규분포 50% 구간 z값)
  - `_drawPredFan(c, pathArr, loArr, hiArr, seamX, coneR, toXf, toY, anchor, rgb)` — 반환값 없음
  - `_predVis` 에 `fan: true` 키 추가

- [ ] **Step 1: 분위수 층 가격 계산을 검증한다 (실패하는 테스트)**

`backtest/verify-pred-terrain.js` 에 `grabFn("_predQ50")` 를 `setup`/`harness` return 에 추가하고, 마지막 `console.log` 위에 삽입:

```js
/* ── 6. 분위수 층 ── */
ok("q50: lo < q50lo < path < q50hi < hi 순서", () => {
  const r = K._predQ50(100, 90, 115);
  assert.ok(90 < r.lo && r.lo < 100 && 100 < r.hi && r.hi < 115,
    JSON.stringify(r));
});
ok("q50: 밴드가 넓어지면 50% 층도 넓어진다", () => {
  const narrow = K._predQ50(100, 98, 102), wide = K._predQ50(100, 80, 125);
  assert.ok((wide.hi - wide.lo) > (narrow.hi - narrow.lo));
});
ok("q50: hi <= path 같은 퇴화 입력이면 path 로 붕괴(NaN 없음)", () => {
  const r = K._predQ50(100, 90, 100);
  assert.ok(isFinite(r.lo) && isFinite(r.hi));
  assert.strictEqual(r.hi, 100);
});
ok("q50: 결과는 항상 [lo, hi] 안", () => {
  const r = K._predQ50(100, 99, 101);
  assert.ok(r.lo >= 99 && r.hi <= 101);
});
```

- [ ] **Step 2: 실행해서 실패를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node backtest/verify-pred-terrain.js`
Expected: FAIL — `Error: 함수를 찾지 못함: _predQ50`

- [ ] **Step 3: `_predCloudCol` 을 삭제하고 팬을 구현한다**

`forge-draw.js` 에서 `_predCloudCol` 함수 전체(주석 줄 `// 밀도 구름 1열: ...` 포함)를 삭제하고, 그 자리에 삽입:

```js
  // ── 분위수 팬 — 밀도 구름을 대체. 구름은 경계가 없어 '얼마나 넓은지'를 읽을 수 없었다. ──
  const _Q50 = 0.6745;   // 정규분포 중앙 50% 구간의 z. sd = log(hi/path) 를 1σ로 취급(현행 밴드 ±1σ≈68%, 실측 콘 커버 ~78%와 근사 정합)
  function _predQ50(centerK, loK, hiK) {
    const sd = (centerK > 0 && hiK > centerK) ? Math.log(hiK / centerK) : 0;
    return {
      hi: Math.min(hiK, centerK * Math.exp(_Q50 * sd)),
      lo: Math.max(loK, centerK * Math.exp(-_Q50 * sd))
    };
  }
  function _drawPredFan(c, pathArr, loArr, hiArr, seamX, coneR, toXf, toY, anchor, rgb) {
    const n = pathArr.length; if (!n || !(coneR > seamX)) return;
    const qlo = new Array(n), qhi = new Array(n);
    for (let k = 0; k < n; k++) { const q = _predQ50(pathArr[k], loArr[k], hiArr[k]); qlo[k] = q.lo; qhi[k] = q.hi; }
    // 가로 알파는 그라데이션으로 — 근거리엔 거의 안 보이고, 선이 해체되는 자리에서 층이 올라온다.
    const gfill = a => { const g = c.createLinearGradient(seamX, 0, coneR, 0); for (let i = 0; i <= 10; i++) { const t = i / 10; g.addColorStop(t, "rgba(" + rgb + "," + (a * _predCloudFade(t)).toFixed(3) + ")"); } return g; };
    const poly = (lA, hA) => { c.beginPath(); c.moveTo(seamX, toY(anchor)); for (let k = 0; k < n; k++) c.lineTo(toXf(k), toY(hA[k])); for (let k = n - 1; k >= 0; k--) c.lineTo(toXf(k), toY(lA[k])); c.closePath(); };
    c.save();
    poly(loArr, hiArr); c.fillStyle = gfill(0.07); c.fill();     // 68% 층
    poly(qlo, qhi); c.fillStyle = gfill(0.16); c.fill();          // 50% 층(덧칠되어 안쪽이 진해짐)
    c.lineWidth = CW.hair; c.strokeStyle = gfill(0.35);           // 50% 경계 헤어라인 — 크기를 읽을 수 있게
    c.beginPath(); c.moveTo(seamX, toY(anchor)); for (let k = 0; k < n; k++) c.lineTo(toXf(k), toY(qhi[k])); c.stroke();
    c.beginPath(); c.moveTo(seamX, toY(anchor)); for (let k = 0; k < n; k++) c.lineTo(toXf(k), toY(qlo[k])); c.stroke();
    // 층 라벨 — 우측 끝은 끝점 라벨·가격 pill로 붐비므로 콘 span 의 72% 지점에 얹는다
    const kL = Math.max(0, Math.min(n - 1, Math.round((n - 1) * 0.72)));
    c.font = "9px ui-monospace,monospace"; c.textAlign = "center";
    c.fillStyle = "rgba(" + rgb + ",.62)"; c.fillText("50%", toXf(kL), toY(qhi[kL]) - 3);
    c.fillStyle = "rgba(138,146,178,.55)"; c.fillText("68%", toXf(kL), toY(hiArr[kL]) - 3);
    c.restore();
  }
```

- [ ] **Step 4: `_predVis` 에 `fan` 을 추가한다**

```js
  let _predVis = { band: true, fan: true, rail: true, p1: true, p2: true, p3: true };   // 예측선 범례 토글 상태(세션·기본 전부 켜짐)
```

(`rail` 은 Task 5에서 쓰지만 여기서 함께 선언한다 — 한 줄을 두 번 고치지 않기 위해.)

- [ ] **Step 5: 구름 루프를 팬 호출로 교체한다**

`fcDrawMainChart` 의 `if (_predVis.band) { ... }` 블록에서 다음 루프를

```js
        for (let k = 0; k < _fw; k++) {
          const cf = _predCloudFade(_fw > 0 ? k / _fw : 0); if (cf <= 0.01) continue;
          const x0 = toXf(k), x1 = (k + 1 < _fw) ? toXf(k + 1) : coneR, colW = Math.max(1.6, x1 - x0);
          _predCloudCol(c, x0 - colW * 0.5, colW * 1.5, lo[k], hi[k], path[k], toY, _rgb1, 0.17 * cf);
          if (_hasCtr) _predCloudCol(c, x0 - colW * 0.5, colW * 1.5, lo[k], hi[k], _counter[k], toY, _crgb, 0.10 * cf);
        }
```

삭제하고, `if (_predVis.band) { ... }` 블록이 **닫힌 직후**에 팬 호출을 추가한다(팬은 `band` 와 독립 토글):

```js
      if (_predVis.fan) _drawPredFan(c, path, lo, hi, seamX, coneR, toXf, toY, anchor, _rgb1);
```

> 3차(반대) 팬은 그리지 않는다 — 1차 팬 + 3차 점묘선으로 충분하고, 두 팬이 겹치면 층 경계가 읽히지 않는다.

- [ ] **Step 6: 잔존 참조 0을 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && grep -c "_predCloudCol" forge-draw.js || echo "0건 — 정상"`
Expected: `0건 — 정상`

- [ ] **Step 7: 검증·회귀 실행**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node backtest/verify-pred-terrain.js && node --test forge-core.test.js 2>&1 | tail -3`
Expected: `27/27 통과` / `# pass 246` / `# fail 0`

- [ ] **Step 8: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add forge-draw.js backtest/verify-pred-terrain.js
git commit -m "feat(forge): 분위수 팬(50%/68%)으로 밀도 구름 대체 — 폭을 읽을 수 있게

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 확률 감쇠 레일

**Files:**
- Modify: `forge-draw.js` — `_drawPredRail` 신설(`_drawPredFan` 바로 아래), `fcDrawMainChart` 예측 블록에서 호출

**Interfaces:**
- Consumes: Task 1 커널(`_predZ`/`_predConf`/`_predPCal`), 전역 `_hzList(unit, fb)`(`forge-app.js:170`), 전역 `tfUnit()`
- Produces:
  - `_RAIL_H = 14` (레일 스트립 높이 px)
  - `_drawPredRail(c, pathArr, hiArr, anchor, seamX, coneR, toXf, padTop, rgb)` — 반환값 없음

- [ ] **Step 1: 레일을 구현한다**

`forge-draw.js` 의 `_drawPredFan` 함수 **바로 아래**에 삽입:

```js
  // ── 확률 감쇠 레일 — 예측 구역 상단 스트립. 막대=정보량(시각), 숫자=캘리브레이션 방향확률(정직). ──
  const _RAIL_H = 14;
  function _drawPredRail(c, pathArr, hiArr, anchor, seamX, coneR, toXf, padTop, rgb) {
    const n = pathArr.length; if (!n || !(coneR > seamX)) return;
    const yB = padTop + 2 + _RAIL_H;
    c.save();
    c.fillStyle = "rgba(" + rgb + ",.5)";
    for (let k = 0; k < n; k++) {
      const cf = _predConf(_predZ(pathArr[k], hiArr[k], anchor));
      const x0 = toXf(k), x1 = (k + 1 < n) ? toXf(k + 1) : coneR;
      if (!isFinite(x0) || !isFinite(x1)) continue;
      const w = Math.max(1, x1 - x0 - 0.6), h = Math.max(0.8, cf * _RAIL_H);
      c.fillRect(x0, yB - h, w, h);
    }
    // 눈금 숫자는 _hzList 시점(+10/+20/+40/+60 등)에만. 겹치면 뒤엣것 생략.
    c.font = "9px ui-monospace,monospace"; c.textAlign = "center"; c.fillStyle = "rgba(138,146,178,.75)";
    let lastR = -1e9;
    try {
      const hs = _hzList(tfUnit(), n);
      for (let i = 0; i < hs.length; i++) {
        const k = hs[i] - 1; if (k < 0 || k >= n) continue;
        const x = toXf(k); if (!isFinite(x)) continue;
        const t = _predPCal(pathArr, hiArr, anchor, k) + "%", w = c.measureText(t).width;
        if (x - w / 2 < lastR + 6) continue;
        c.fillText(t, x, yB + 10); lastR = x + w / 2;
      }
    } catch (e) {}
    c.restore();
  }
```

- [ ] **Step 2: `fcDrawMainChart` 에서 호출한다**

Task 4 Step 5에서 추가한 팬 호출 **바로 아래**에 삽입:

```js
      if (_predVis.rail) _drawPredRail(c, path, hi, anchor, seamX, coneR, toXf, padTop, _rgb1);
```

- [ ] **Step 3: 브라우저 콘솔 에러 없이 렌더되는지 헤드리스로 확인한다**

Run:
```bash
cd /home/jschoi0223/projects/vdiportal/map
node -e '
const fs=require("fs"), s=fs.readFileSync("forge-draw.js","utf8");
for (const nm of ["_drawPredRail","_drawPredFan","_predQ50"]) {
  if (!s.includes("function "+nm+"(")) { console.error("누락: "+nm); process.exit(1); }
}
if (s.includes("_predVis.rail") && s.includes("_predVis.fan")) console.log("호출 배선 OK");
else { console.error("호출 배선 누락"); process.exit(1); }
new Function(s);   // 구문 오류 검사
console.log("구문 OK");
'
```
Expected: `호출 배선 OK` / `구문 OK`

- [ ] **Step 4: 검증·회귀 실행**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node backtest/verify-pred-terrain.js && node --test forge-core.test.js 2>&1 | tail -3`
Expected: `27/27 통과` / `# pass 246` / `# fail 0`

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add forge-draw.js
git commit -m "feat(forge): 확률 감쇠 레일 — 예측구역 상단 정보량 막대 + 시점별 캘리브레이션 확률

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 신뢰 지평선 + 배지

**Files:**
- Modify: `forge-draw.js` — `fcDrawMainChart` 예측 블록(레일 호출 직후)

**Interfaces:**
- Consumes: Task 1의 `_predHorizonK`, Task 5의 `_RAIL_H`, 기존 `CDASH.fine`
- Produces: 지역 변수 `_kH1`(1차 기준 신뢰 지평 index 또는 null) — Task 7에서 재사용하지 않음(독립)

- [ ] **Step 1: 지평선을 그린다**

Task 5 Step 2의 레일 호출 **바로 아래**에 삽입:

```js
      // 신뢰 지평 — 여기서부터 예측선은 점묘로 해체되며, 목표는 참고치일 뿐이다.
      const _kH1 = _predHorizonK(path, hi, anchor);
      if (_kH1 != null) {
        const _hx = toXf(_kH1);
        if (isFinite(_hx)) {
          c.save();
          c.strokeStyle = "rgba(138,146,178,.3)"; c.lineWidth = 1; c.setLineDash(CDASH.fine);
          c.beginPath(); c.moveTo(_hx, padTop); c.lineTo(_hx, ch - padBot); c.stroke(); c.setLineDash([]);
          const _by = padTop + _RAIL_H + 16;
          c.font = "700 9.5px Pretendard,'Malgun Gothic',sans-serif"; c.textAlign = "left";
          const _bt = "신뢰 지평", _bw = c.measureText(_bt).width + 10;
          c.fillStyle = "rgba(11,15,20,.8)";
          if (c.roundRect) { c.beginPath(); c.roundRect(_hx + 3, _by, _bw, 14, 3); c.fill(); } else c.fillRect(_hx + 3, _by, _bw, 14);
          c.fillStyle = "rgba(180,188,210,.95)"; c.fillText(_bt, _hx + 8, _by + 10.5);
          c.font = "500 9px Pretendard,'Malgun Gothic',sans-serif"; c.fillStyle = "rgba(138,146,178,.7)";
          c.fillText("이후는 참고", _hx + 8, _by + 24);
          c.restore();
        }
      }
```

- [ ] **Step 2: 구문·배선 확인**

Run:
```bash
cd /home/jschoi0223/projects/vdiportal/map
node -e '
const fs=require("fs"), s=fs.readFileSync("forge-draw.js","utf8");
new Function(s);
if (!s.includes("신뢰 지평")) { console.error("배지 텍스트 누락"); process.exit(1); }
console.log("구문 OK · 배지 OK");
'
```
Expected: `구문 OK · 배지 OK`

- [ ] **Step 3: 검증·회귀 실행**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node backtest/verify-pred-terrain.js && node --test forge-core.test.js 2>&1 | tail -3`
Expected: `27/27 통과` / `# pass 246` / `# fail 0`

- [ ] **Step 4: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add forge-draw.js
git commit -m "feat(forge): 신뢰 지평선 + '이후는 참고' 배지

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 끝점 라벨을 캘리브레이션 확률로 전환 (1·2·3차)

**Files:**
- Modify: `forge-draw.js` — `fcDrawMainChart` 의 3차 블록(현재 1050~1056행 부근)·1차 블록(1057~1063행 부근), `drawEvidence` 의 2차 끝점 라벨(현재 3003~3005행 부근)

**Interfaces:**
- Consumes: Task 1의 `_predPCal`, 기존 `_predEndDeco(c, pathArr, seamX, coneR, toY, box, col, label, labelDy, showPx)`, 기존 `_epicenterMark(c, x, y, col, scale)`
- Produces: 없음. `_p1s`/`_p1w`/`_p1up`/`_p1disp`/`_cs`/`_cw`/`_upP`/`_cProb`/`_p2s`/`_p2w`/`_p2up`/`_p2disp` 지역 변수는 전부 제거된다

> `_epicenterMark` 의 5번째 인자는 알파가 아니라 **scale** 이다. 확률 50% 미만일 때 마커를 약화시키는 수단은 scale 축소(0.6)로 한다.

- [ ] **Step 1: 3차 라벨을 교체한다**

다음 3줄을

```js
        let _cs = 0, _cw = 0; for (let k = 0; k < _fw; k++) { const wt = 1 / Math.sqrt(k + 1); _cs += _upProb(path[k], hi[k], anchor) * wt; _cw += wt; }
        const _upP = _cw ? _cs / _cw : 50, _cProb = Math.round(_pd > 0 ? (100 - _upP) : _upP);
        const _cUp = _counter[_counter.length - 1] >= anchor;
        _wigStroke(_counter, _crgb, [6, 4], 2.2, (_seed ^ 0x9e3779b9) >>> 0);
        _predEndDeco(c, _counter, seamX, coneR, toY, { padX, plotW, padTop, padBot, ch }, "rgb(" + _crgb + ")", "3차·" + _cProb + "%", (_cUp ? -12 : 14), true);
```

이것으로 교체:

```js
        const _cProb = _predPCal(_counter, hi, anchor, _fw - 1);   // 끝점의 캘리브레이션 방향확률
        const _cUp = _counter[_counter.length - 1] >= anchor;
        _wigStroke(_counter, _crgb, [6, 4], 2.2, (_seed ^ 0x9e3779b9) >>> 0);
        _predEndDeco(c, _counter, seamX, coneR, toY, { padX, plotW, padTop, padBot, ch }, (_cProb < 50 ? "#8a92b2" : "rgb(" + _crgb + ")"), "3차·" + _cProb + "%", (_cUp ? -12 : 14), true);
```

- [ ] **Step 2: 1차 라벨을 교체한다**

다음 5줄을

```js
      let _p1s = 0, _p1w = 0; for (let k = 0; k < _fw; k++) { const wt = 1 / Math.sqrt(k + 1); _p1s += _upProb(path[k], hi[k], anchor) * wt; _p1w += wt; }
      const _p1up = _p1w ? _p1s / _p1w : 50, _p1disp = Math.round(_pd >= 0 ? _p1up : (100 - _p1up));
      if (_predVis.p1) {
        _wigStroke(path, _rgb1, null, 2.7, _seed);
        _predEndDeco(c, path, seamX, coneR, toY, { padX, plotW, padTop, padBot, ch }, CT.core, "1차·" + _p1disp + "%", -12, true);
      }
```

이것으로 교체:

```js
      const _p1disp = _predPCal(path, hi, anchor, _fw - 1);   // 끝점의 캘리브레이션 방향확률(50 미만 = 반대가 우세)
      if (_predVis.p1) {
        _wigStroke(path, _rgb1, null, 2.7, _seed);
        _predEndDeco(c, path, seamX, coneR, toY, { padX, plotW, padTop, padBot, ch }, (_p1disp < 50 ? "#8a92b2" : CT.core), "1차·" + _p1disp + "%", -12, true);
      }
```

- [ ] **Step 3: 확률이 낮으면 목표 마커를 축소한다**

`_predEndDeco` 안의 `_epicenterMark(c, ex, ey, col, 1);` 를 다음으로 교체(라벨 색이 회색으로 강등된 경우 = 확률 50 미만 → 마커도 작게):

```js
    _epicenterMark(c, ex, ey, col, col === "#8a92b2" ? 0.6 : 1);   // 반대 우세(회색 강등)면 목표 마커도 약하게
```

- [ ] **Step 4: 2차 라벨을 교체한다**

`drawEvidence` 의 다음 2줄을

```js
            let _p2s = 0, _p2w = 0; for (let k = 0; k < p2.path.length; k++) { const wt = 1 / Math.sqrt(k + 1); const _hk = (g.hi && g.hi[k]) || p2.path[k]; _p2s += _upProb(p2.path[k], _hk, g.anchor) * wt; _p2w += wt; }
            const _p2up = _p2w ? _p2s / _p2w : 50, _p2dir = p2.path[p2.path.length - 1] >= g.anchor, _p2disp = Math.round(_p2dir ? _p2up : (100 - _p2up));
            _predEndDeco(c, p2.path, _sx, _cR, toY, { padX: g.padX, plotW: g.plotW, padTop: g.padTop, padBot: g.padBot, ch: g.ch }, "#4dd0ff", "2차·" + _p2disp + "%", 12, true);
```

이것으로 교체:

```js
            const _p2disp = _predPCal(p2.path, _2hi, g.anchor, _pl - 1);   // 끝점의 캘리브레이션 방향확률
            _predEndDeco(c, p2.path, _sx, _cR, toY, { padX: g.padX, plotW: g.plotW, padTop: g.padTop, padBot: g.padBot, ch: g.ch }, (_p2disp < 50 ? "#8a92b2" : "#4dd0ff"), "2차·" + _p2disp + "%", 12, true);
```

- [ ] **Step 5: 죽은 변수가 남지 않았는지 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && grep -nE "_p1up|_p1s|_p2up|_p2s|_upP\b" forge-draw.js || echo "죽은 변수 0건 — 정상"`
Expected: `죽은 변수 0건 — 정상`

- [ ] **Step 6: 검증·회귀 실행**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node -e 'new Function(require("fs").readFileSync("forge-draw.js","utf8"));console.log("구문 OK")' && node backtest/verify-pred-terrain.js && node --test forge-core.test.js 2>&1 | tail -3`
Expected: `구문 OK` / `27/27 통과` / `# pass 246` / `# fail 0`

- [ ] **Step 7: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add forge-draw.js
git commit -m "feat(forge): 끝점 라벨을 캘리브레이션 방향확률로 — 50% 미만이면 회색 강등+마커 축소

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 범례에 분위수 팬 · 확률 레일 추가

**Files:**
- Modify: `forge-draw.js` — `_renderChartLegend`(현재 813~838행 부근)

**Interfaces:**
- Consumes: Task 4에서 확장된 `_predVis`(`band`/`fan`/`rail`/`p1`/`p2`/`p3`)
- Produces: 없음. 클릭 토글 핸들러는 `k in _predVis` 로 동작하므로 **추가 배선 불필요**

- [ ] **Step 1: `items` 배열을 교체한다**

`_renderChartLegend` 의 `const items = [ ... ];` 를 이것으로 교체:

```js
    const items = [
      ["band", "밴드 경계", band, "sq", "기술적으로 도달 가능한 최저~최고 경계입니다. 피보나치·구조 스윙·매물대·볼린저·일목·VWAP 종합. 클릭하면 숨김/표시."],
      ["fan", "분위수 팬", band, "sq", "예측이 이 안에 들어올 확률입니다. 안쪽 진한 층 50%, 바깥 경계 68%. 뒤로 갈수록 벌어지는 폭 자체가 불확실성의 크기입니다. 클릭하면 숨김/표시."],
      ["rail", "확률 레일", "rgba(138,146,178,.85)", "sq", "각 시점의 예측 신뢰도입니다. 막대가 낮아질수록 그 시점 예측은 근거가 약합니다. 숫자는 캘리브레이션된 방향 적중 확률. 클릭하면 숨김/표시."],
      ["p1", "1차 종합지표", core, "", "전체 지표를 융합한 종합 예측선입니다. 신뢰 지평까지는 실선, 이후는 점묘로 해체됩니다. 끝점 확률이 50% 미만이면 반대 시나리오가 우세하다는 뜻입니다. 클릭하면 숨김/표시."],
      ["p2", "2차 선택지표", "#4dd0ff", "", "범례에서 표시(체크)한 지표 조합만으로 다시 계산한 예측선입니다. 특정 관점 비교용. 클릭하면 숨김/표시."],
      ["p3", "3차 최대역치", c3, "", "예상과 반대로 움직였을 때 가격이 향할 반대 시나리오선입니다. 클릭하면 숨김/표시."]
    ];
```

- [ ] **Step 2: 6항목이 모두 토글 가능한지 확인한다**

Run:
```bash
cd /home/jschoi0223/projects/vdiportal/map
node -e '
const fs=require("fs"), s=fs.readFileSync("forge-draw.js","utf8");
new Function(s);
const keys=["band","fan","rail","p1","p2","p3"];
const vis=s.match(/let _predVis = \{[^}]*\}/)[0];
for (const k of keys) {
  if (!vis.includes(k+":")) { console.error("_predVis 누락: "+k); process.exit(1); }
  if (!s.includes(`["`+k+`", "`)) { console.error("범례 항목 누락: "+k); process.exit(1); }
}
console.log("범례 6항목 · _predVis 6키 OK");
'
```
Expected: `범례 6항목 · _predVis 6키 OK`

- [ ] **Step 3: 검증·회귀 실행**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node backtest/verify-pred-terrain.js && node --test forge-core.test.js 2>&1 | tail -3`
Expected: `27/27 통과` / `# pass 246` / `# fail 0`

- [ ] **Step 4: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add forge-draw.js
git commit -m "feat(forge): 범례에 분위수 팬·확률 레일 토글 추가 + 툴팁 갱신

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: 통합 시각 검증 · 캐시버스터 · 배포

**Files:**
- Modify: `forge.html:263` — `forge-draw.js?v=` 캐시버스터
- Modify: `docs/BACKLOG.md` — 완료 항목 추가

**Interfaces:**
- Consumes: Task 1~8 전부
- Produces: 배포된 `www/map/`

- [ ] **Step 1: 로컬 서버를 띄운다**

```bash
cd /home/jschoi0223/projects/vdiportal/map && python3 -m http.server 8123 &
sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8123/forge.html
```
Expected: `200`

- [ ] **Step 2: 헤드리스 스크린샷으로 시각 검증한다**

메모리 `[[headless-verify-wsl]]` 절차(sudo 없이 로컬 lib 추출 + `LD_LIBRARY_PATH` + playwright chromium)를 따라 `http://localhost:8123/forge.html` 을 열고, **예시 데이터 상태에서 웹분석 버튼을 눌러** 예측을 확정시킨 뒤 차트 영역을 캡처한다.

**중요:** 쓰기 함수(`_addTickerDoc` / `loadTicker`)를 절대 호출하지 않는다 — 사용자 실데이터가 손상된다([[headless-live-tests-readonly]]). 예시 데이터만 사용한다.

확인 항목(전부 육안 확인):
1. 예측 구역 상단에 **확률 레일 막대**가 왼쪽에서 오른쪽으로 낮아진다
2. 레일 아래 **시점별 `NN%` 숫자**가 겹치지 않고 표시된다
3. **분위수 팬**의 50% 층 경계 헤어라인이 보이고 `50%` `68%` 라벨이 있다
4. **신뢰 지평 세로 점선** + `신뢰 지평` / `이후는 참고` 배지가 있다
5. 지평 **이후 구간의 1/2/3차 선이 점묘**로 끊겨 있다
6. 끝점 라벨이 `1차·NN%` 형태이고, NN이 50 미만이면 회색이다
7. 브라우저 콘솔에 에러 0건

- [ ] **Step 3: 범례 토글 6종을 전부 꺼서 에러가 없는지 확인한다**

같은 헤드리스 세션에서 범례 6항목을 모두 클릭해 off 로 만든 뒤 스크린샷.
Expected: 예측 영역에 밴드·팬·레일·선이 전부 사라지고, **콘솔 에러 0건**, 캔들·축·현재가선은 정상 표시

- [ ] **Step 4: 서버를 정리한다**

```bash
pkill -f "http.server 8123" || true
```

- [ ] **Step 5: 캐시버스터를 갱신한다**

`forge.html:263` 을 다음으로 변경:

```html
  <script src="forge-draw.js?v=20260721d"></script>
```

- [ ] **Step 6: BACKLOG 를 갱신한다**

`docs/BACKLOG.md` 의 `## ✅ 완료 (최근)` 섹션 맨 위에 한 줄 추가:

```markdown
- 예측 불확실성 지형(확률 감쇠 레일 + 분위수 팬 + 신뢰 지평 이후 점묘 해체 + 끝점 캘리브레이션 확률) — **작도 전용·엔진 불변**(246/246 유지, 정확도 변화 없음). spec `2026-07-21-prediction-uncertainty-terrain-design.md`
```

- [ ] **Step 7: 최종 회귀를 실행한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node backtest/verify-pred-terrain.js && node --test forge-core.test.js 2>&1 | tail -3 && git status --short`
Expected: `27/27 통과` / `# pass 246` / `# fail 0` / 변경 파일은 `forge.html` `docs/BACKLOG.md` 만 남음

- [ ] **Step 8: 커밋 · push · 배포 (한 세트)**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add forge.html docs/BACKLOG.md
git commit -m "chore(forge): 예측 불확실성 지형 캐시버스터 + 백로그 갱신

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

배포는 이 저장소의 기존 배포 스크립트로 `www/map/` 에 정적 7종(`forge.html` `forge.css` `forge-core.js` `forge-state.js` `forge-ui.js` `forge-draw.js` `forge-app.js`)만 올린다.
**절대 덮어쓰지 말 것:** `forge_data.json` · `forge_images.json` · `forge_jobs.json` · `forge_td_key.txt` · `forge_ohlc_cache_*.json`.

- [ ] **Step 9: 배포본을 확인한다**

```bash
curl -s "https://parksvc.mycafe24.com/map/forge-draw.js?v=20260721d" | grep -c "_drawPredRail"
```
Expected: `1` 이상 (0이면 업로드 실패)

- [ ] **Step 10: 스코어카드에 기록한다**

스코어카드 개선이력에 항목을 추가한다([[scoopforge-scorecard-changelog]]). **엔진 정확도 변화 없음(작도 전용)** 임을 명시할 것 — 이 변경은 예측 성능이 아니라 예측의 불확실성 전달을 고친 것이다.

---

## Self-Review 결과

**1. 스펙 커버리지**

| 스펙 항목 | 담당 Task |
|---|---|
| §1 pCal 정의 | Task 1 (`_predPCal`) |
| §1 z / conf / Z 상수 | Task 1 (`_predZ`·`_predConf`·`_Z_*`) |
| §2 A 분위수 팬 + 구름 삭제 | Task 4 |
| §2 B 확률 감쇠 레일 | Task 5 |
| §2 C 선 해체(conf·세그먼트·점묘) | Task 2 (1·2·3차, 공용 헬퍼 `_strokePredLine`) |
| §2 D 신뢰 지평선 + 배지 | Task 6 |
| §2 E 끝점 라벨 개정 | Task 7 |
| §2 F 범례 fan/rail + 툴팁 | Task 8 |
| 테스트 1~6 | Task 1(1·3·4) · Task 2(2 conf·confSeq) · Task 4(5 분위수) · Task 9 Step 3(6 전 항목 off 회귀) |
| 헤드리스 시각 검증 | Task 9 Step 2 |
| 커밋+배포 한 세트 | Task 9 Step 8 |

갭 없음.

**2. 실행 전 사전점검 반영 2건(사용자 승인)**
- Task 2/3 분리 시 중간 커밋에서 2차 예측선이 옛 시그니처로 호출돼 깨진다 → **Task 2·3 병합**(Task 3은 실행하지 않는 병합 표시로 남김).
- 2차 스트로크가 `_wigStroke` 로직의 verbatim 복제였다 → **공용 헬퍼 `_strokePredLine` + `_predConfSeq` 추출**, 1·2·3차 공유.

**3. 스펙과의 의도적 편차 3건**
- 스펙 §2 E는 "`_epicenterMark` 알파를 낮춘다"이나, 실제 시그니처의 5번째 인자는 **scale**(알파 아님). → scale 0.6 으로 구현(Task 7 Step 3에 명시).
- 스펙 §2 A는 팬 라벨에 `_evLabel` 회피 레지스트리 사용을 언급했으나, `_evLabelBoxes` 는 이후 `drawEvidence` 에서 리셋되어 무의미하다. → 붐비는 우측 끝을 피해 콘 span 72% 지점에 배치하는 방식으로 대체(Task 4 Step 3에 명시).
- 스펙이 `forge.css` 를 대상 파일로 들었으나 기존 `.fc-leg-sw.sq` 클래스로 충분 → **CSS 변경 없음**(File Structure에 명시).

**4. 타입·이름 일관성**
- `_predWigVal(center, loK, hiK, wv, conf)` — Task 2 정의, `_wigStroke`·2차 블록에서 동일 5인자로 호출. ✓
- `_predPCal(centerArr, hiArr, anchor, k)` — Task 1 정의, Task 5·7에서 동일 4인자 호출. ✓
- `_predHorizonK(centerArr, hiArr, anchor)` — Task 1 정의, Task 2(`_predConfSeq`)·Task 6에서 동일 3인자. ✓
- `_predVis` 6키 — Task 4에서 한 번에 선언, Task 5(`rail`)·Task 8(범례) 참조. ✓
- `_strokePredLine(c, {n,x0,y0,xAt,yAt,conf,kEnd,rgb,dash,lw})` — Task 2 정의, 1·3차(`_wigStroke`)·2차 블록에서 동일 opts 형태로 호출. ✓
- 검증 스크립트 누적 케이스 수: Task 1 = 15, Task 2 = +8 → 23, Task 4 = +4 → 27. 각 Task의 Expected 수치와 일치. ✓
