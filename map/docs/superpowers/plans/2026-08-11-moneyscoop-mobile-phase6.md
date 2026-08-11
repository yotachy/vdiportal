# 머니스쿱 모바일 Phase 6 — 리포트 시안 보강 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리포트 화면에 확신 퍼센트 · 지평 3카드 · 적중/오답 행을 넣고, 상승확률 계산을 PC와 단일 출처로 합친다.

**Architecture:** PC(`forge-app.js`)에만 있던 확률 수학 3개를 공유 엔진 `forge-core.js`로 올려 PC·모바일이 같은 함수를 부르게 한다. 백테스트 실측치는 `sync-engine.mjs`가 원본 JSON에서 요약을 생성해 vendor로 내린다. 모바일 화면 계산(지평 행·확신 뒤집기·중립 규칙)은 새 순수 모듈 `MSReportModel`이 맡고 `report.js`는 DOM만 그린다.

**Tech Stack:** 바닐라 JS(엔진·PC는 ES2015+, `mobile/www/`는 ES5) · UMD · `node:test` · 빌드 도구 없음

## Global Constraints

- **`mobile/www/` 아래 JS 는 ES5 문법만** — `var` + `function`. 화살표 함수·`let`/`const`·템플릿 리터럴·옵셔널 체이닝 금지. **`map/forge-core.js`·`map/forge-app.js` 는 예외** — 기존 파일이 `const`/화살표를 쓰므로 그 파일의 기존 스타일을 따른다. 테스트 파일(`mobile/test/*.test.mjs`)은 ESM, `map/*.test.js`는 CommonJS
- 새 `mobile/www/*.js` 모듈은 **UMD 팩토리** — `(function(root,factory){ if (typeof module!=="undefined"&&module.exports) module.exports=factory(); else root.MSXxx=factory(); })(typeof self!=="undefined"?self:this, function(){...})`
- **엔진을 쓰는 모바일 모듈은 `ForgeCore` 를 인자로 받는다** — `MSGraph.basicGraph(ForgeCore)` 가 이 프로젝트의 선례다. 전역을 직접 읽지 않는다
- **UI 문자열은 영어**, `mobile/www/strings.js` 단일 출처. 코드에 문구를 직접 쓰지 않는다. `strings.test.mjs` 가 ①참조된 키의 실존 ②미사용(죽은) 키 ③소스의 한글 UI 문자열을 모두 검사한다
- **CSS 색은 `var(--토큰)`**, **항목 좌측 세로 컬러 라인 절대 금지**(accent bar·`box-shadow:inset Npx 0 0`·`::before` 세로 마커). 강조는 배경색·텍스트색으로만
- **CSS 에 `@media` 금지** — 2단 스타일은 `body.ms-dual` 클래스를 쓴다(Phase 5 §3.1)
- **`mobile/www/vendor/` 는 커밋하지 않는 생성물** — 직접 수정 금지, `sync-engine.mjs` 가 만든다
- **테스트 기대값은 리터럴로.** 구현 상수를 읽어 기대값을 만들면 항등식이 된다 — Phase 3·4·5에서 네 번 재발했다
- 관문: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh`. **현재 기준선 536건** (forge-core 251 · forge-tools 81 · landing 28 · moneyscoop-mobile 176). `forge-tools` 81 · `landing` 28 은 끝까지 변동 없어야 한다
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

**설계서:** [`../specs/2026-08-11-moneyscoop-mobile-phase6-design.md`](../specs/2026-08-11-moneyscoop-mobile-phase6-design.md)

**작업 디렉토리:** 모든 경로는 `map/` 기준.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `forge-core.js` | 확률 수학 단일 출처 — `upProb`·`aggUpProb` | 수정 |
| `forge-core.test.js` | 위 함수 단위 테스트 | 수정 |
| `forge-app.js` | PC UI — 지역 사본 삭제하고 엔진 호출 | 수정 |
| `mobile/sync-engine.mjs` | 백테스트 요약 생성 | 수정 |
| `mobile/test/sync.test.mjs` | 요약이 원본과 일치하는지 | 수정 |
| `mobile/www/vendor/backtest-summary.js` | 생성물 | 신규(gitignore) |
| `mobile/www/report-model.js` | 지평 행·확신·적중률 순수 계산 | 신규 |
| `mobile/test/report-model.test.mjs` | 위 모듈 테스트 | 신규 |
| `mobile/www/strings.js` | 신규 문구 · 죽은 키 정리 | 수정 |
| `mobile/www/screens/report.js` | 판정 블록 재구성 + 지평 카드 DOM | 수정 |
| `mobile/www/style.css` | 지평 카드 · 적중 행 | 수정 |
| `mobile/www/index.html` | 스크립트 태그 2개 | 수정 |
| `mobile/docs/BACKLOG-mobile.md` | 종료 기록 · 확인 항목 | 수정 |

---

### Task 1: `forge-core` — 확률 수학을 엔진으로

**Files:**
- Modify: `map/forge-core.js` (`calibrateUpProb` 정의 바로 위 · export 객체)
- Test: `map/forge-core.test.js` (파일 끝에 추가)

**Interfaces:**
- Consumes: 기존 `calibrateUpProb(p)` (같은 파일)
- Produces:
  - `ForgeCore.upProb(pred, hi, anchor)` → `number` 0..100 (보정 전). 인자가 하나라도 0 이하/비유한이면 `50`
  - `ForgeCore.aggUpProb(prediction)` → `number` 0..100 (보정 적용) 또는 `null` (경로 없음)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/forge-core.test.js` **파일 끝에** 추가:

```js
test("upProb — 예측이 현재가와 같으면 50", () => {
  assert.strictEqual(ForgeCore.upProb(100, 110, 100), 50);
});

test("upProb — 예측이 현재가보다 높으면 50 초과, 낮으면 미만", () => {
  assert.ok(ForgeCore.upProb(110, 120, 100) > 50);
  assert.ok(ForgeCore.upProb(90, 95, 100) < 50);
});

test("upProb — 밴드가 좁을수록 확률이 극단으로 간다", () => {
  const wide = ForgeCore.upProb(110, 140, 100);
  const narrow = ForgeCore.upProb(110, 112, 100);
  assert.ok(narrow > wide, "좁은 밴드 " + narrow + " 가 넓은 밴드 " + wide + " 보다 크지 않다");
});

test("upProb — 0·음수·NaN 에 죽지 않고 50 을 준다", () => {
  for (const bad of [0, -5, NaN, undefined, null]) {
    assert.strictEqual(ForgeCore.upProb(bad, 110, 100), 50, "pred=" + bad);
    assert.strictEqual(ForgeCore.upProb(110, bad, 100), 50, "hi=" + bad);
    assert.strictEqual(ForgeCore.upProb(110, 120, bad), 50, "anchor=" + bad);
  }
});

test("aggUpProb — 경로가 없으면 null", () => {
  assert.strictEqual(ForgeCore.aggUpProb(null), null);
  assert.strictEqual(ForgeCore.aggUpProb({}), null);
  assert.strictEqual(ForgeCore.aggUpProb({ path: [] }), null);
});

test("aggUpProb — 가까운 지평에 더 큰 가중(1/√h)이 걸린다", () => {
  // 1봉째만 강한 상승, 나머지는 중립인 경로 vs 마지막 봉만 강한 상승인 경로.
  // 가중이 1/√h 이면 앞쪽이 센 경로의 종합 확률이 더 높아야 한다.
  // 밴드 상단은 반드시 예측가보다 위여야 한다 — hi < pred 면 sd 가 음수가 되어 확률이 뒤집힌다.
  const anchor = 100;
  const mk = vals => ({ anchor, path: vals, hi: vals.map((v, k) => v + 6 * Math.sqrt(k + 1)) });
  const front = mk([112, 100, 100, 100]);
  const back = mk([100, 100, 100, 112]);
  assert.ok(ForgeCore.aggUpProb(front) > ForgeCore.aggUpProb(back),
    "앞쪽 가중이 안 걸렸다: " + ForgeCore.aggUpProb(front) + " vs " + ForgeCore.aggUpProb(back));
});

test("aggUpProb — 보정을 실제로 통과한다(raw 와 다르다)", () => {
  const p = { anchor: 100, path: [110, 112, 114], hi: [115, 120, 125] };
  const agg = ForgeCore.aggUpProb(p);
  // 같은 입력의 보정 전 가중평균을 손으로 재현
  let s = 0, w = 0;
  for (let k = 0; k < p.path.length; k++) {
    const wt = 1 / Math.sqrt(k + 1);
    s += ForgeCore.upProb(p.path[k], p.hi[k], p.anchor) * wt; w += wt;
  }
  const raw = Math.round(s / w);
  assert.notStrictEqual(agg, raw, "보정이 적용되지 않았다(raw 와 동일)");
  assert.strictEqual(agg, ForgeCore.calibrateUpProb(raw));
});

test("aggUpProb — anchor 가 없으면 경로 첫 값을 기준으로 삼는다", () => {
  const withAnchor = ForgeCore.aggUpProb({ anchor: 100, path: [100, 105], hi: [110, 115] });
  const noAnchor = ForgeCore.aggUpProb({ path: [100, 105], hi: [110, 115] });
  assert.strictEqual(noAnchor, withAnchor);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map && node --test forge-core.test.js 2>&1 | tail -20
```

기대: `ForgeCore.upProb is not a function` 류로 신규 8건 실패.

- [ ] **Step 3: 함수를 추가한다**

`forge-core.js` 에서 `function calibrateUpProb(p) {` 정의를 찾아 그 **바로 위**에 넣는다:

```js
  // 로그정규 상승확률(%) — m=log(예측/현재), sd=log(상단/예측).
  // PC(forge-app)와 모바일이 같은 확률을 말해야 하므로 여기가 단일 출처다.
  // 한쪽만 보정 상수를 고치면 두 제품이 서로 다른 확률을 표시하고, 화면 비교로도 안 잡힌다.
  function _normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
  function upProb(pred, hi, anchor) {
    if (!(pred > 0 && hi > 0 && anchor > 0)) return 50;
    const m = Math.log(pred / anchor), sd = Math.log(hi / pred);
    return Math.round(_normCdf(m / (sd || 1e-6)) * 100);
  }
  // 시점 가중 종합 상승확률(%) — 가까운 시점일수록 신뢰가 높다(1/√h).
  function aggUpProb(pred) {
    const path = pred && pred.path; if (!path || !path.length) return null;
    const anchor = (pred.anchor != null && isFinite(pred.anchor)) ? pred.anchor : path[0];
    let s = 0, w = 0;
    for (let k = 0; k < path.length; k++) { const h = k + 1, wt = 1 / Math.sqrt(h); s += upProb(path[k], pred.hi && pred.hi[k], anchor) * wt; w += wt; }
    if (!w) return null;
    const raw = Math.round(s / w);   // 캘리브레이션(v1.4): 과신 교정 → 표기 확률이 실제와 일치(OOS ECE 8.6→0.7%p)
    return calibrateUpProb(raw);
  }
```

- [ ] **Step 4: export 에 두 이름을 더한다**

`forge-core.js` 맨 끝의 `return { version, indicatorCount, validatedAxes, calibrateUpProb, ...` 한 줄에서 `calibrateUpProb,` 바로 뒤에 `upProb, aggUpProb,` 를 삽입한다. 다른 항목의 순서는 건드리지 않는다.

- [ ] **Step 5: 통과를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map && node --test forge-core.test.js 2>&1 | tail -6
```

기대: 실패 0. 이어서 관문:

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
```

기대: `전체 통과 — 544건` (536 + 신규 8). 모바일 176 · forge-tools 81 · landing 28 은 그대로.

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add forge-core.js forge-core.test.js
git commit -m "engine(p6): 상승확률 upProb/aggUpProb 을 엔진으로 — PC·모바일 단일 출처

PC forge-app.js 에만 있던 로그정규 상승확률과 지평 가중 종합을 공유 엔진으로
올린다. calibrateUpProb 이 이미 여기 있어 자연스러운 자리다.

한쪽만 보정 상수를 고치면 두 제품이 서로 다른 확률을 말하고 화면 비교로도
안 잡힌다 — 이 저장소가 두 출처 이탈로 세 번 당한 뒤의 결정이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `forge-app` — PC를 엔진 함수로 갈아끼운다

**Files:**
- Modify: `map/forge-app.js` (정의 3곳 삭제 · 호출부 5곳)

**Interfaces:**
- Consumes: `ForgeCore.upProb(pred, hi, anchor)` · `ForgeCore.aggUpProb(prediction)` (Task 1)
- Produces: 없음 (PC UI 내부 정리)

**테스트 없음.** `forge-app.js` 는 PC UI 배선이고 단위 테스트가 없는 파일이다. 검증은 관문(엔진 수학 회귀)과 **사람의 화면 확인**(Task 6 체크리스트)이다.

- [ ] **Step 1: 지역 정의 3개를 지운다**

`forge-app.js` 에서 아래 셋을 **삭제**한다. 줄 번호가 아니라 내용으로 찾아라:

1. `function _normCdf(z) { const t = 1 / (1 + 0.2316419 * ...` 한 줄 전체
2. `/* 현재가 대비 상승확률(%) — 로그정규: m=log(예측/현재), sd=log(상단/예측) */` 주석과 뒤따르는 `function _upProb(pred, hi, anchor) { ... }` 블록(4줄)
3. `/* 시점 가중 종합 상승확률(%) — 가까운 시점일수록 신뢰↑. 헤더 국면/시그널 문구에 통합 표기 */` 주석과 뒤따르는 `function aggUpProb(pred) { ... }` 블록(9줄)

- [ ] **Step 2: 호출부를 바꾼다**

다섯 곳이다. `grep -n "_upProb\|aggUpProb" forge-app.js` 로 전부 찾아 하나도 빠뜨리지 마라.

| 위치(내용으로 식별) | 변경 |
|---|---|
| `const upF = _upProb(vF, hiF, anchor);` | `const upF = ForgeCore.upProb(vF, hiF, anchor);` |
| `const _upF = (typeof aggUpProb === "function") ? aggUpProb(lastResult && lastResult.prediction) : null;` | `const _upF = ForgeCore.aggUpProb(lastResult && lastResult.prediction);` |
| `const v = res.verdict \|\| {}, pr = res.prediction \|\| {}, up = aggUpProb(pr);` | `... up = ForgeCore.aggUpProb(pr);` |
| `const up = (typeof aggUpProb === "function") ? Math.round(aggUpProb(r.prediction) * 100) : 50;` | `const up = Math.round(ForgeCore.aggUpProb(r.prediction) * 100);` — **`* 100` 을 그대로 둔다**(아래 주의) |
| `const upP = ((typeof aggUpProb === "function" ? aggUpProb(pred) : 50) \|\| 50);` | `const upP = (ForgeCore.aggUpProb(pred) \|\| 50);` |

> **주의 — `* 100` 을 고치지 마라.** 네 번째 호출부는 `aggUpProb`(이미 0..100)에 100 을 또 곱한다. **Phase 6 이 만든 것이 아니라 원래 있던 스케일 결함**이고, 예측 로깅 경로라 값을 바꾸면 기록 형식이 달라진다. 이번 범위 밖이고 Task 6 에서 백로그로 이월한다. 리뷰어가 신규 결함으로 오인하지 않도록 보고서에도 적어라.

`typeof aggUpProb === "function"` 가드가 사라지는 것은 의도된 것이다 — `forge-core.js` 는 `forge-app.js` 보다 먼저 로드되는 것이 `forge.html` 의 고정 순서(core→state→ui→draw→tools→app)라 `ForgeCore` 는 항상 존재한다.

- [ ] **Step 3: 잔존 참조가 없는지 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map && grep -n "_upProb\|_normCdf\|[^.]aggUpProb" forge-app.js
```

기대: **출력 없음**. (`ForgeCore.aggUpProb` 는 앞에 `.` 이 있어 걸리지 않는다.)

- [ ] **Step 4: 구문·관문 확인**

```bash
cd /home/jschoi0223/projects/vdiportal/map && node --check forge-app.js && ./tests/run.sh
```

기대: 구문 통과 + `전체 통과 — 544건`.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add forge-app.js
git commit -m "forge(p6): PC 확률 계산을 엔진 함수로 교체 — 지역 사본 3개 삭제

_normCdf·_upProb·aggUpProb 지역 정의를 지우고 ForgeCore.* 를 부른다.
호출부 5곳 전부 교체. 예측 로깅의 '* 100' 스케일 결함은 선행 결함이라
그대로 두고 백로그로 이월한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `sync-engine` — 백테스트 요약 생성

**Files:**
- Modify: `map/mobile/sync-engine.mjs`
- Test: `map/mobile/test/sync.test.mjs` (파일 끝에 추가)

**Interfaces:**
- Consumes: `map/forge-backtest-report.json` (기존 파일, 2026-07 생성)
- Produces:
  - `syncBacktest(srcDir, destDir)` → 요약 객체를 반환하고 `destDir/backtest-summary.js` 를 쓴다
  - 생성 파일이 브라우저에 심는 전역: `window.MSBacktest = { directionHitRate, calibrationECE, coneCoverage, avgWin, avgLoss, nForecasts, nSeries, generatedAt }`

**실측 확인된 값**(이 태스크의 테스트 기대값): `directionHitRate` 0.5805571790375998 · `calibrationECE` 0.0012607950215900523 · `coneCoverage` 0.7774320548641097 · `pnl.avgWin` 0.18973960773197449 · `pnl.avgLoss` −0.10705739205097957 · `universe` 86개 · `universe[].points` 합 31496 · `generatedAt` `"2026-07"`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/sync.test.mjs` **파일 끝에** 추가. 파일 상단의 기존 import 에 `syncBacktest` 를 더해야 한다(`import { syncEngine, ENGINE_FILES } from ...` → `import { syncEngine, syncBacktest, ENGINE_FILES } from ...`):

```js
test("백테스트 요약이 원본 리포트의 값을 그대로 담는다", () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dst = tmp("ms-bt-");
  const s = syncBacktest(src, dst);
  const raw = JSON.parse(readFileSync(join(src, "forge-backtest-report.json"), "utf8"));
  assert.strictEqual(s.directionHitRate, raw.overall.directionHitRate);
  assert.strictEqual(s.calibrationECE, raw.overall.calibrationECE);
  assert.strictEqual(s.coneCoverage, raw.overall.coneCoverage);
  assert.strictEqual(s.avgWin, raw.overall.pnl.avgWin);
  assert.strictEqual(s.avgLoss, raw.overall.pnl.avgLoss);
  assert.strictEqual(s.nSeries, raw.universe.length);
  assert.strictEqual(s.generatedAt, raw.generatedAt);
});

test("백테스트 요약의 실측값 — 2026-07 리포트", () => {
  // 리터럴이다. raw 에서 읽어 비교하면 위 테스트와 같은 항등식이 되어 값이 바뀌어도 안 잡힌다.
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const s = syncBacktest(src, tmp("ms-bt2-"));
  assert.strictEqual(Math.round(s.directionHitRate * 1000) / 1000, 0.581);
  assert.strictEqual(Math.round(s.coneCoverage * 1000) / 1000, 0.777);
  assert.strictEqual(s.nForecasts, 31496);
  assert.strictEqual(s.nSeries, 86);
});

test("생성 파일은 window.MSBacktest 를 심는 JS 다 — fetch 없이 script 로 읽는다", () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dst = tmp("ms-bt3-");
  syncBacktest(src, dst);
  const js = readFileSync(join(dst, "backtest-summary.js"), "utf8");
  assert.match(js, /window\.MSBacktest\s*=/);
  assert.doesNotMatch(js, /fetch|XMLHttpRequest/);
});

test("리포트가 없으면 조용히 넘어가지 않고 던진다", () => {
  assert.throws(() => syncBacktest(tmp("ms-nosrc-"), tmp("ms-nodst-")), /백테스트 리포트 없음/);
});
```

파일 상단에서 `readFileSync` 가 이미 import 돼 있는지 확인하고, 없으면 `node:fs` import 에 더해라.

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/sync.test.mjs 2>&1 | tail -15
```

기대: `syncBacktest is not a function` 또는 import 오류로 신규 4건 실패.

- [ ] **Step 3: 구현한다**

`mobile/sync-engine.mjs` 의 `export const ENGINE_FILES = [...]` 아래에 추가:

```js
export const BACKTEST_FILE = "forge-backtest-report.json";

// 백테스트 실측치를 화면에 쓰려면 앱이 그 값을 알아야 한다. 하드코딩하면 엔진을 재측정할 때
// 갈라지므로, 원본 JSON 을 단일 출처로 두고 여기서 요약만 뽑는다.
// JSON 이 아니라 JS 로 내리는 이유: fetch 없이 <script> 로 읽어 비동기를 끌어들이지 않는다.
export function syncBacktest(srcDir, destDir) {
  const src = join(srcDir, BACKTEST_FILE);
  if (!existsSync(src)) throw new Error("백테스트 리포트 없음: " + src);
  const r = JSON.parse(readFileSync(src, "utf8"));
  const o = r.overall || {}, p = o.pnl || {}, uni = r.universe || [];
  const summary = {
    directionHitRate: o.directionHitRate,
    calibrationECE: o.calibrationECE,
    coneCoverage: o.coneCoverage,
    avgWin: p.avgWin,
    avgLoss: p.avgLoss,
    nForecasts: uni.reduce((s, u) => s + (u.points || 0), 0),
    nSeries: uni.length,
    generatedAt: r.generatedAt
  };
  mkdirSync(destDir, { recursive: true });
  writeFileSync(join(destDir, "backtest-summary.js"),
    "// 생성물 — sync-engine.mjs 가 forge-backtest-report.json 에서 만든다. 직접 고치지 말 것.\n" +
    "window.MSBacktest = " + JSON.stringify(summary, null, 2) + ";\n");
  return summary;
}
```

파일 하단의 CLI 블록에서 `syncEngine` 호출 뒤에 요약 생성도 붙인다:

```js
const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = syncEngine(join(here, ".."), join(here, "www", "vendor"));
  for (const [f, sha] of Object.entries(m)) console.log("  " + f + "  " + sha);
  const b = syncBacktest(join(here, ".."), join(here, "www", "vendor"));
  console.log("  backtest-summary.js  " + b.nForecasts + "건 · " + b.nSeries + "시리즈 · " + b.generatedAt);
}
```

- [ ] **Step 4: 통과 확인 + 실제 생성**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/sync.test.mjs 2>&1 | tail -6 && npm run sync && cat www/vendor/backtest-summary.js
```

기대: 테스트 통과, `www/vendor/backtest-summary.js` 가 생성되고 내용에 `window.MSBacktest` 와 `"nForecasts": 31496` 이 보인다.

- [ ] **Step 5: 생성물이 커밋 대상이 아닌지 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git status --short mobile/www/vendor/
```

기대: **출력 없음**(vendor 전체가 gitignore). 만약 나타나면 멈추고 보고해라 — gitignore 를 고쳐야 한다.

- [ ] **Step 6: 관문 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
git add mobile/sync-engine.mjs mobile/test/sync.test.mjs
git commit -m "mobile(p6): 백테스트 요약 생성 — 실측치 단일 출처

forge-backtest-report.json 을 원본으로 두고 sync-engine 이 요약을 vendor 로
내린다. 앱에 하드코딩하면 엔진 재측정 때 갈라진다.

JSON 대신 JS 로 내려 fetch 없이 script 로 읽는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

기대 건수: `전체 통과 — 548건` (544 + 신규 4).

---

### Task 4: `MSReportModel` — 화면 계산 순수 모듈

**Files:**
- Create: `map/mobile/www/report-model.js`
- Test: `map/mobile/test/report-model.test.mjs`

**Interfaces:**
- Consumes: `ForgeCore.upProb` · `ForgeCore.aggUpProb` (Task 1) — **인자로 받는다**, 전역을 읽지 않는다
- Produces:
  - `MSReportModel.HORIZONS` → `[{ key:"d1", bars:1 }, { key:"w1", bars:5 }, { key:"m1", bars:21 }]`
  - `MSReportModel.confidence(FC, prediction, regime)` → `number` 0..100 또는 `null`
  - `MSReportModel.horizonRows(FC, prediction, regime)` → `[{ key, bars, price, chgPct, prob }]`
  - `MSReportModel.hitRate(summary)` → `{ right:number, wrong:number }` 또는 `null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/report-model.test.mjs` 신규 생성:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const M = require("../www/report-model.js");
const FC = require("../../forge-core.js");

// 24봉 예측 — futW 기본값과 같은 길이. 값은 단조 상승, 밴드는 √k 로 벌어진다.
function pred(n = 24, dir = 1) {
  const anchor = 100, path = [], lo = [], hi = [];
  for (let k = 1; k <= n; k++) {
    const v = anchor + dir * k * 0.4, band = 3 * Math.sqrt(k);
    path.push(v); lo.push(v - band); hi.push(v + band);
  }
  return { anchor, path, lo, hi, futW: n };
}

test("지평은 1·5·21봉 세 개다", () => {
  assert.deepEqual(M.HORIZONS.map(h => h.bars), [1, 5, 21]);
  assert.deepEqual(M.HORIZONS.map(h => h.key), ["d1", "w1", "m1"]);
});

test("지평 행이 해당 봉의 예측가를 집어온다", () => {
  const p = pred();
  const rows = M.horizonRows(FC, p, "bull");
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0].price, p.path[0]);    // 1봉 → index 0
  assert.strictEqual(rows[1].price, p.path[4]);    // 5봉 → index 4
  assert.strictEqual(rows[2].price, p.path[20]);   // 21봉 → index 20
});

test("변화율은 현재가 대비 퍼센트다", () => {
  const rows = M.horizonRows(FC, pred(), "bull");
  // anchor 100, 1봉 예측 100.4 → +0.4%
  assert.strictEqual(Math.round(rows[0].chgPct * 10) / 10, 0.4);
});

test("경로가 짧으면 그 지평 행을 건너뛴다", () => {
  const rows = M.horizonRows(FC, pred(6), "bull");
  assert.deepEqual(rows.map(r => r.bars), [1, 5], "21봉 행이 남아 있다");
});

test("경로가 없으면 빈 배열", () => {
  assert.deepEqual(M.horizonRows(FC, null, "bull"), []);
  assert.deepEqual(M.horizonRows(FC, { path: [] }, "bull"), []);
});

test("중립 판정이면 달성확률만 null 이고 가격·변화율은 남는다", () => {
  const rows = M.horizonRows(FC, pred(), "neutral");
  assert.strictEqual(rows.length, 3);
  for (const r of rows) {
    assert.strictEqual(r.prob, null, "중립인데 확률이 있다");
    assert.ok(isFinite(r.price), "가격이 사라졌다");
  }
});

test("확신 — 상승 판정이면 상승확률 그대로, 하락 판정이면 뒤집는다", () => {
  const p = pred();
  const up = FC.aggUpProb(p);
  assert.strictEqual(M.confidence(FC, p, "bull"), up);
  assert.strictEqual(M.confidence(FC, p, "bear"), 100 - up);
});

test("확신 — 중립이면 null, 경로 없으면 null", () => {
  assert.strictEqual(M.confidence(FC, pred(), "neutral"), null);
  assert.strictEqual(M.confidence(FC, null, "bull"), null);
});

test("적중률 — 요약이 없으면 null(생성물 미로드 방어)", () => {
  assert.strictEqual(M.hitRate(null), null);
  assert.strictEqual(M.hitRate(undefined), null);
  assert.strictEqual(M.hitRate({}), null);
});

test("적중률 — 소수 첫째 자리까지, 합이 100", () => {
  const r = M.hitRate({ directionHitRate: 0.5805571790375998 });
  assert.strictEqual(r.right, 58.1);
  assert.strictEqual(r.wrong, 41.9);
  assert.strictEqual(Math.round((r.right + r.wrong) * 10) / 10, 100);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/report-model.test.mjs 2>&1 | tail -10
```

기대: `Cannot find module '../www/report-model.js'` 로 전부 실패.

- [ ] **Step 3: 구현한다**

`map/mobile/www/report-model.js` 신규 생성 (**ES5 문법**):

```js
// 리포트 화면의 계산만 담는다 — DOM 도 전역 엔진도 만지지 않는다.
// ForgeCore 를 인자로 받는 것은 MSGraph.basicGraph(ForgeCore) 와 같은 규약이다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSReportModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 시안 2a 의 Tomorrow / In 1 week / In 1 month. 3개월(63봉)은 futW 상한(60)과
  // 콘 비중(28%→50%) 때문에 뺐다 — 설계서 §3.2.
  var HORIZONS = [{ key: "d1", bars: 1 }, { key: "w1", bars: 5 }, { key: "m1", bars: 21 }];

  function anchorOf(p) {
    if (!p || !p.path || !p.path.length) return null;
    return (p.anchor != null && isFinite(p.anchor)) ? p.anchor : p.path[0];
  }

  // 부른 방향이 맞을 확률. 중립이면 가리킬 방향이 없으므로 null —
  // 없는 방향에 "그 방향이 맞을 확률"을 붙일 수 없다(설계서 §6.1).
  function confidence(FC, prediction, regime) {
    if (regime !== "bull" && regime !== "bear") return null;
    var up = FC.aggUpProb(prediction);
    if (up == null || !isFinite(up)) return null;
    return regime === "bull" ? up : 100 - up;
  }

  function horizonRows(FC, prediction, regime) {
    var a = anchorOf(prediction);
    if (a == null) return [];
    var path = prediction.path, hi = prediction.hi || [], out = [], i;
    var neutral = (regime !== "bull" && regime !== "bear");
    for (i = 0; i < HORIZONS.length; i++) {
      var h = HORIZONS[i], idx = h.bars - 1;
      if (idx >= path.length) continue;            // 경로가 짧으면 그 행은 없다
      var v = path[idx];
      var chg = a ? ((v - a) / a) * 100 : 0;
      var prob = null;
      if (!neutral) {
        var raw = FC.upProb(v, hi[idx], a);
        prob = (chg >= 0) ? raw : 100 - raw;       // '그 변화가 일어날' 확률(PC 와 같은 정의)
      }
      out.push({ key: h.key, bars: h.bars, price: v, chgPct: chg, prob: prob });
    }
    return out;
  }

  // 생성물(vendor/backtest-summary.js)이 없으면 null — 적중 행만 감추고 화면은 성립한다.
  function hitRate(summary) {
    if (!summary || typeof summary.directionHitRate !== "number" || !isFinite(summary.directionHitRate)) return null;
    var right = Math.round(summary.directionHitRate * 1000) / 10;
    return { right: right, wrong: Math.round((100 - right) * 10) / 10 };
  }

  return { HORIZONS: HORIZONS, confidence: confidence, horizonRows: horizonRows, hitRate: hitRate };
});
```

- [ ] **Step 4: 통과 확인**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/report-model.test.mjs 2>&1 | tail -6
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
```

기대: 신규 10건 통과, `전체 통과 — 558건` (548 + 10).

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/report-model.js mobile/test/report-model.test.mjs
git commit -m "mobile(p6): 리포트 계산 순수 모듈 MSReportModel

지평 행(1·5·21봉)·확신 뒤집기·중립 규칙·적중률을 DOM 에서 떼어낸다.
report.js 가 이미 515줄이고 판정 블록이 이번에 커진다.

중립 판정이면 확신과 달성확률이 null — 부른 방향이 없는데 '그 방향이 맞을
확률'을 붙일 수 없다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 화면 배선 — 판정 블록 재구성 + 지평 카드

**Files:**
- Modify: `map/mobile/www/strings.js` · `screens/report.js` · `style.css` · `index.html`

**Interfaces:**
- Consumes: `MSReportModel.confidence(FC, prediction, regime)` · `MSReportModel.horizonRows(FC, prediction, regime)` · `MSReportModel.hitRate(summary)` · `MSReportModel.HORIZONS` (Task 4) · 전역 `window.MSBacktest` (Task 3 생성물)
- Produces: 없음 (최종 소비자)

**테스트 없음** — 배선이다. 검증은 `strings.test.mjs` 의 세 가드(키 실존 · 죽은 키 · 한글 부재)와 관문이다.

- [ ] **Step 1: 문자열을 정리한다**

`mobile/www/strings.js` 의 `t` 객체에서 **삭제**: `rpRange` · `rpRough` · `rpBarsAfter`. (셋 다 `report.js` 의 범위 문장에서만 쓰였고 그 문장을 시안 표기로 바꾼다. 남겨두면 죽은 키 가드가 실패한다.)

**추가**:

```js
    rpBullish: "Bullish", rpBearish: "Bearish",   // 판정 헤드라인 — 시안 2a·6a 표기.
                                                  // rpUp/rpDown("Up"/"Down")은 주기 행·지표 판독용이라 그대로 둔다.
    rpRangeLabel: "Range ",                       // 시안 2a: "Range 142.8 – 187.4"
    rpCone: " · 80% cone",                        // 시안 2a. 설계 목표치이며 실측 커버리지는 77.7%
    rpHitRight: "% right · ", rpHitWrong: "% wrong",
    rpHitNote1: "Four calls in ten that looked like this one did not work out. Size your position for that, not for the ",
    rpHitNote2: "%.",                             // 사이에 확신 퍼센트가 들어간다(보간 장치 없음 — 연결만)
    rpHzTomorrow: "Tomorrow", rpHzWeek: "In 1 week", rpHzMonth: "In 1 month",
```

- [ ] **Step 2: 스크립트 태그를 추가한다**

`mobile/www/index.html` 에서 `<script src="chart-legend.js"></script>` **바로 아래**에 두 줄을 넣는다. 순서가 중요하다 — `report-model.js` 는 `screens/report.js` 보다 먼저여야 하고, 생성물은 없을 수도 있으므로 뒤쪽에 둔다:

```html
<script src="report-model.js"></script>
<script src="vendor/backtest-summary.js"></script>
```

- [ ] **Step 3: 판정 블록을 다시 쓴다**

`mobile/www/screens/report.js` 의 `buildVerdict()` 함수 전체를 아래로 교체한다:

```js
    // 시안 6a·2a 순서: 판정(방향+확신%) → 적중/오답 → 일치도 → 범위 → 안 센 것.
    // 중립이면 확신과 적중/오답을 함께 감춘다 — 부른 방향이 없으면 둘 다 가리킬 대상이 없다.
    function verdictWord(regime) {
      return regime === "bull" ? MSStr.t.rpBullish : regime === "bear" ? MSStr.t.rpBearish : MSStr.t.rpFlat;
    }
    function buildVerdict() {
      var v = an.out.verdict, pr = an.out.prediction;
      var wrap = MSUi.el("div", "rp-verdict-wrap");
      var dirCls = v.regime === "bull" ? "bull" : v.regime === "bear" ? "bear" : "neutral";

      var conf = MSReportModel.confidence(ForgeCore, pr, v.regime);
      var head = MSUi.el("div", "rp-verdict " + dirCls);
      head.appendChild(MSUi.el("span", null, verdictWord(v.regime)));
      if (conf != null) head.appendChild(MSUi.el("span", "rp-conf-pct", conf + "%"));
      wrap.appendChild(head);

      var hit = (conf != null) ? MSReportModel.hitRate(window.MSBacktest) : null;
      if (hit) {
        wrap.appendChild(MSUi.el("div", "rp-hit", hit.right + MSStr.t.rpHitRight + hit.wrong + MSStr.t.rpHitWrong));
        wrap.appendChild(MSUi.el("div", "rp-hit-note", MSStr.t.rpHitNote1 + conf + MSStr.t.rpHitNote2));
      }

      var total = v.confluence.total, agree = v.confluence.agree;
      var confText = total ? (agree + MSStr.t.rpAgree + total + MSStr.t.rpAgreeTail) : MSStr.t.rpAgreeNone;
      wrap.appendChild(MSUi.el("div", "rp-conf", confText));

      var last = pr.lo.length - 1;
      var rangeText = (last >= 0)
        ? (MSStr.t.rpRangeLabel + MSUi.fmtPrice(pr.lo[last]) + " – " + MSUi.fmtPrice(pr.hi[last]) + MSStr.t.rpCone)
        : MSStr.t.rpRangeNone;
      wrap.appendChild(MSUi.el("div", "rp-range", rangeText));

      wrap.appendChild(MSUi.el("div", "rp-missing",
        MSStr.t.rpNotCountedLead + notCountedLabels().length + MSStr.t.rpNotCountedTail));
      return wrap;
    }
```

- [ ] **Step 4: 지평 카드 빌더를 추가한다**

`buildVerdict()` 정의 **바로 아래**에 넣는다:

```js
    // 시안 2a 의 지평 표 — 차트 앞에 온다(숫자 먼저, 그림 나중).
    function hzLabel(key) {
      return key === "d1" ? MSStr.t.rpHzTomorrow : key === "w1" ? MSStr.t.rpHzWeek : MSStr.t.rpHzMonth;
    }
    function buildHorizons() {
      var rows = MSReportModel.horizonRows(ForgeCore, an.out.prediction, an.out.verdict.regime);
      if (!rows.length) return null;
      var sec = MSUi.el("div", "rp-hz");
      rows.forEach(function (r) {
        var row = MSUi.el("div", "rp-hz-row");
        row.appendChild(MSUi.el("span", "rp-hz-when", hzLabel(r.key)));
        row.appendChild(MSUi.el("span", "rp-hz-px", MSUi.fmtPrice(r.price)));
        var cls = r.chgPct > 0.05 ? " up" : r.chgPct < -0.05 ? " dn" : "";
        row.appendChild(MSUi.el("span", "rp-hz-chg" + cls, MSUi.fmtChg(r.chgPct)));
        row.appendChild(MSUi.el("span", "rp-hz-prob", r.prob == null ? "" : r.prob + "%"));
        sec.appendChild(row);
      });
      return sec;
    }
```

- [ ] **Step 5: `draw()` 에 끼워 넣는다**

`draw()` 안의 `scr.appendChild(buildVerdict());` **바로 다음 줄**에 추가한다(차트보다 앞):

```js
        var hz = buildHorizons();
        if (hz) scr.appendChild(hz);
```

- [ ] **Step 6: 스타일을 붙인다**

`mobile/www/style.css` 에서 `.rp-conf` 규칙 **바로 위**에 확신 퍼센트를, 파일의 2단 블록(`/* ===== 2단 (폴드 펼침) ===== */`) **바로 위**에 나머지를 넣는다:

```css
/* 판정 퍼센트 — 방향어와 같은 줄, 시안 2a "Bullish 68%" */
.rp-verdict { display:flex; align-items:baseline; gap:10px; }
.rp-conf-pct { font-size:22px; font-weight:600; letter-spacing:-.02em; }

/* 적중/오답 — 막대를 그리지 않는다. 두 값이 합해서 100 이라 막대가 더해주는 정보가 없고,
   이 화면에서 시선을 끌 것은 판정 퍼센트다(시안 2a "골드는 화면당 한 번만"). */
.rp-hit { font-size:12.5px; color:var(--ink-3); margin-top:8px; font-variant-numeric:tabular-nums; }
.rp-hit-note { font-size:11.5px; color:var(--ink-5); margin-top:4px; line-height:1.5; }

/* 지평 3행 — 차트 앞. 라벨 / 예측가 / 변화율 / 달성확률 */
.rp-hz { margin-bottom:20px; }
.rp-hz-row { display:flex; align-items:baseline; gap:10px; height:38px; border-bottom:1px solid var(--hairline); font-size:12.5px; font-variant-numeric:tabular-nums; }
.rp-hz-when { flex:1 1 auto; color:var(--ink-2); font-weight:600; }
.rp-hz-px { flex:0 0 auto; color:var(--ink); }
.rp-hz-chg { flex:0 0 62px; text-align:right; color:var(--ink-3); }
.rp-hz-chg.up { color:var(--bull); }
.rp-hz-chg.dn { color:var(--bear-text); }
.rp-hz-prob { flex:0 0 42px; text-align:right; color:var(--ink-4); }
```

- [ ] **Step 7: 문자열 가드와 관문을 돌린다**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/strings.test.mjs 2>&1 | tail -8
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
```

기대: `전체 통과 — 558건`(신규 테스트 없음). 죽은 키·미존재 키가 잡히면 Step 1 로 돌아가 정리해라.

- [ ] **Step 8: 구문 확인**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --check www/screens/report.js && node -e "require('./www/report-model.js'); console.log('ok')"
```

기대: `ok`.

- [ ] **Step 9: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/strings.js mobile/www/screens/report.js mobile/www/style.css mobile/www/index.html
git commit -m "mobile(p6): 리포트 판정 블록 재구성 + 지평 3카드

시안 2a·6a 순서로: 판정(Bullish 68%) → 적중/오답 → 일치도 → Range · 80% cone
→ 지평 3행 → 차트.

- 헤드라인 방향어를 Up/Down 에서 Bullish/Bearish 로(시안 표기). rpUp/rpDown 은
  주기 행·지표 판독용이라 유지
- 'Likely somewhere in' 이 가격 범위에 잘못 붙어 있던 것을 시안의 Range 로 정정
  (그 문구는 시안에선 확신 구간용). rpRange·rpRough·rpBarsAfter 죽은 키 삭제
- 적중/오답은 막대 없이 텍스트 두 줄 — 합이 100 이라 막대가 정보를 더하지 않는다
- MSBacktest 미로드 시 적중 행만 감추고 화면은 성립

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 백로그 + 확인 항목

**Files:**
- Modify: `map/mobile/docs/BACKLOG-mobile.md`

**Interfaces:**
- Consumes: Task 1~5 결과
- Produces: 없음 (문서)

- [ ] **Step 1: 완료 기록을 추가한다**

`## 🔥 다음` 섹션 **바로 위**(Phase 5 항목 다음)에 넣는다:

```markdown
- **Phase 6 — 리포트 시안 보강**(2026-08-11): 확신 퍼센트 · 지평 3카드 · 적중/오답 행.
  - **엔진 무수정 원칙을 처음 깼다** — `upProb`/`aggUpProb` 을 `forge-app.js` 에서 `forge-core.js` 로
    올리고 PC 가 그것을 부르게 했다. 확률은 두 출처가 갈라지면 화면 비교로도 안 잡히는 종류라
    단일 출처가 회귀 위험보다 크다고 봤다
  - 확신 퍼센트는 일치도가 아니라 **콘에서 나온 보정 확률**(ECE 0.13%)이다. Phase 1 이 워치리스트에서
    퍼센트를 버린 근거(4지표 일치도라 값이 5개뿐)는 여기 적용되지 않는다. 시안 6a 대로 일치도도 함께 남겼다
  - 지평은 3개(1·5·21봉). 시안의 3개월(63봉)은 `futW` 상한이 60이고, 60으로 올리면 감쇠 상수가 전부
    `futW` 에 걸려 있어 **앞쪽 24봉의 모양까지 바뀐다** — 차트를 잘라 그려도 지금 보던 콘이 아니다
  - 확신 구간(시안 `55–67%`)은 티어별 고정 폭으로 보이고 근거가 없어 넣지 않았다. 대신 잘못 붙어 있던
    `Likely somewhere in`(시안에선 확신 구간용)을 가격 범위에서 떼고 시안의 `Range … · 80% cone` 으로 되돌렸다
  - 백테스트 실측치는 `sync-engine.mjs` 가 `forge-backtest-report.json` 에서 요약을 생성해 vendor 로 내린다.
    앱에 하드코딩하면 재측정 때 갈라진다
  - 판정 헤드라인 방향어를 `Up`/`Down` → `Bullish`/`Bearish` 로(시안 표기). `rpUp`/`rpDown` 은 주기 행·지표
    판독용이라 유지
  - 테스트 536 → 558(`map/tests/run.sh`). `forge-tools` 81 · `landing` 28 무변동
  - **PC 지평 표 육안 확인 미실시** — 아래 참조
```

- [ ] **Step 2: 확인 항목 섹션을 만든다**

`## 🔥 다음` 섹션 **바로 아래**에 넣는다(Phase 5 의 미검증 섹션이 아직 있으면 그 위에):

```markdown
## 미검증 — 사용자 확인 필요 (Phase 6)

**① PC 스쿱포지 — 엔진 이관의 유일한 회귀 지점.** `forge.html` 을 열고 종목 하나를 웹분석한 뒤
2번 패널의 **예측 시점별 표**(달성확률 %)가 이전과 같은 값을 내는지 확인할 것. 관문 251건이 수학
회귀는 잡지만 화면은 못 본다.

**② 모바일** — `cd map/mobile/www && python3 -m http.server 8000 --bind 0.0.0.0` 후 폰 Chrome:

1. 판정이 `Bullish 68%` 형태로 뜬다(방향어 + 퍼센트).
2. 그 아래 `58.1% right · 41.9% wrong` 과 해설 문장이 보인다.
3. 지평 3행(Tomorrow · In 1 week · In 1 month)이 차트 **앞**에 온다.
4. 중립(`Flat`) 판정 종목에서는 퍼센트·적중 행이 사라지고 지평 행의 달성확률만 빈다.
5. 폴드 2단(리포트 칸 493px)에서 지평 행이 깨지지 않는다.
6. `npm run sync` 를 안 한 상태로 열어도 화면이 성립한다(적중 행만 없음).
```

- [ ] **Step 3: 이월 항목을 `📋 예정` 맨 위에 추가한다**

```markdown
- **`forge-app.js` 예측 로깅의 스케일 결함** — `Math.round(ForgeCore.aggUpProb(r.prediction) * 100)` 이
  이미 0..100 인 값에 100 을 또 곱한다. **Phase 6 이전부터 있던 결함**이고 로깅 경로라 값을 바꾸면 기록
  형식이 달라져 이번 범위에서 제외했다. 예측 로그를 다룰 때 함께 정리할 것.
- **`80% cone` 라벨과 실측 77.7%의 간극** — 시안 표기를 그대로 썼다. 방법론 화면(10a)이 붙을 때 함께 정리.
- **헤드라인 확신과 지평 확률의 관계 설명** — 헤드라인 68%는 경로 24봉 전체를 1/√h 로 가중한 값이고,
  카드에는 3개 지점만 보인다. 불일치는 아니지만 "62·58·55인데 왜 68?"이 나올 수 있다. 실사용에서 걸리면
  설명 한 줄을 붙일 것.
- **워치리스트 확신 표기** — 시안은 `68%`, 현재 `4/5 agree`. 리포트에 퍼센트가 자리 잡았으니 다시 판단할 것.
```

- [ ] **Step 4: 관문 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
git add mobile/docs/BACKLOG-mobile.md
git commit -m "mobile(p6): Phase 6 종료 문서 + 확인 항목

PC 지평 표 육안 확인이 엔진 이관의 유일한 회귀 지점이다.
forge-app 예측 로깅의 선행 스케일 결함을 이월.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

기대: `전체 통과 — 558건`.

---

## 완료 조건

- `./tests/run.sh` 통과, **558건** (forge-core 259 · forge-tools 81 · landing 28 · moneyscoop-mobile 190)
- `forge-tools` 81 · `landing` 28 무변동
- `grep -n "_upProb\|_normCdf\|[^.]aggUpProb" forge-app.js` 출력 없음
- `git status --short mobile/www/vendor/` 출력 없음(생성물 미커밋)
- 커밋 6개
- **PC 지평 표와 모바일 화면 확인은 미검증 상태로 백로그에 남는다** — 사람의 몫이다
