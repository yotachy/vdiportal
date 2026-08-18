# 온보딩 7단계 재설계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일곱 화면이 각자 존재하던 온보딩을, 각 단계가 앞 단계의 질문에 답하는 **하나의 이야기**로 다시 짓는다 — 한 종목을 끝까지 따라가며, 앱의 실력을 **근거의 투명성**으로 증명한다.

**Architecture:** 3막 구조(과거로 배운다 → 내 기준을 넣는다 → 내 종목으로). 각 단계는 기존 자산을 재사용한다 — 예시 구간은 `onboarding-sample.js`, 작도는 `draw-layers`/`draw-panels`, 판독은 `MSIndicators.readings`, 성향 가중치는 `ind-tiers.js` 의 `PRESETS`. **"전문기업 다운 품질"은 검사 가능한 다섯 규칙(Q1~Q5)으로 바꿔 관문에 넣고**, 단계마다 그 관문의 적용 대상에 자기를 등록한다.

**Tech Stack:** 바닐라 브라우저 JS(ES2017 하한, UMD/IIFE) · Node `node:test` · 크로미움 CLI 브라우저 관문 · Capacitor(안드로이드). **빌드 도구·새 npm 의존성 없음.**

**Spec:** [`docs/superpowers/specs/2026-08-18-moneyscoop-onboarding-redesign.md`](../specs/2026-08-18-moneyscoop-onboarding-redesign.md) (상위: [`2026-08-18-moneyscoop-app-rebuild-design.md`](../specs/2026-08-18-moneyscoop-app-rebuild-design.md))

## Global Constraints

- **`map/mobile/www/**` 문법 하한 ES2017** — 옵셔널 체이닝(`?.`)·null 병합(`??`)·논리 대입·private 필드·`Object.hasOwn`·`groupBy`·배열 비파괴 복사(`toSorted` 등) **금지**. 관문 `mobile/test/syntax-floor.test.mjs`, 근거 `map/CLAUDE.md`
- **UI 문자열은 `www/strings.js` 단일 출처.** 화면 파일에 한국어 리터럴 금지. **지표명은 영어 유지**
- **`:root` 밖 헥스 리터럴 금지**(관문 `test/style-tokens.test.mjs`). 티어 3색: 기본 `--steel` · 심화 `--gold` · 전문 `--platinum`. 바이올렛 `#b892f5` 는 **행동 전용**
- **금지: 항목 좌측 세로 컬러 라인.** 터치 대상 최소 44px. 숫자는 `font-variant-numeric: tabular-nums`
- **적중률·커버리지·ECE 는 `window.MSBacktest` 에서만.** 리터럴 금지. **온보딩에서는 적중률을 주장하지 않는다** — 부득이하면 자명 기준선(60.96%) 병기 + 범위 주석 필수
- **1단계에서 확신 퍼센트를 쓰지 않는다**(5개 도구는 0·20·40·60·80·100 여섯 값뿐이라 확률로 오독된다)
- 전역은 `MSGlobals.define` 경유 · **엔진(`forge-core.js`)·서버(`wallet-*.php`)·저장 키(`ms_onboarded`·`ms_consent`·`ms_watchlist`) 불변** · 새 npm 의존성 금지
- **조건부 `if` 안에 갇혀 조용히 건너뛰는 단언 금지** — 이 저장소가 다섯 번 데인 패턴
- **온보딩 체험은 과금 경로를 타지 않는다** — 32도구 체험은 심화·전문 잠금(P1b 소관)과 무관하게 동작해야 한다
- 테스트: `./tests/run.sh`(저장소 루트 `map/`) 전량 + `cd mobile && node tools/gate-browser.mjs` 전 라우트 — **매 태스크 완료 조건**
- 주석은 WHY 만, 한국어. 커밋 메시지 한국어 + `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `tools/measure-preset-sensitivity.mjs` (신규) | 표본에서 5↔32도구·성향 4종이 판정을 실제로 가르는지 측정. **버리지 않는다** — 표본을 다시 고를 때 재실행 |
| `tools/make-onboarding-sample.mjs` (수정) | 필요 시 선별 기준에 **성향 민감도** 추가 |
| `www/onboarding-sample.js` (생성물) | 확정된 표본 |
| `www/onboarding-quality.js` (신규) | Q1~Q5 를 화면이 지키게 돕는 **조립 헬퍼** — 수치+기준을 한 그룹으로 묶는 `metric()`, 해석을 동반시키는 `stat()` |
| `test/onboarding-quality.test.mjs` (신규) | Q1~Q5 관문. **적용 대상 단계 목록**을 갖고, 목록에 없는 단계는 검사하지 않는다 |
| `www/screens/onboarding.js` (수정) | 7단계 본체. 단계별로 나눠 고친다 |
| `www/style-onboarding.css` (수정) | 새 블록 스타일 |
| `www/strings.js` (수정) | 새 문구 |
| `tools/gate-routes.mjs` (수정) | 온보딩 7단계 라우트 |
| `test/onboarding.test.mjs` (수정) | 단계별 조립 시험 |

> `screens/onboarding.js` 는 현재 699줄이고 이 작업으로 더 커진다. **파일을 쪼개지 않는다** — 단계 간 상태(`state`)가 촘촘히 얽혀 있어 지금 쪼개면 그 결합이 모듈 경계를 넘나드는 형태로 굳는다. 대신 단계별 함수(`step1`~`step7`)의 경계를 분명히 유지하고, 700줄을 크게 넘기면 **마지막 태스크에서 분할 여부를 판정**한다.

---

## Task 1: 성향 민감도 측정 — 3단계가 성립하는지부터 확인한다

**왜 먼저인가:** 3단계의 요점은 "성향을 고르면 **같은 구간의 판정이 바뀐다**"이다. 그런데 현재 표본에서 4종 성향이 결과를 **안 가를 수도 있다.** 그러면 그 화면은 아무 일도 일어나지 않는 화면이 되고, 설계의 한 축이 무너진다. 짓기 전에 잰다.

**Files:**
- Create: `mobile/tools/measure-preset-sensitivity.mjs`
- Modify (조건부): `mobile/tools/make-onboarding-sample.mjs` · `mobile/www/onboarding-sample.js`

**Interfaces:**
- Consumes: `www/onboarding-sample.js`(표본) · `www/graph.js` · `www/ind-tiers.js` · `../../forge-core.js`
- Produces: 측정 결과(콘솔 + 보고서) · 필요 시 교체된 표본

- [ ] **Step 1: 측정 스크립트를 쓴다**

**주의 — API 시그니처를 추측하지 말 것.** 컨트롤러가 이 측정을 시도하다 두 번 틀렸다. 정답은 기존 시험이 알고 있다:

```bash
grep -n "full32Graph\|basicGraph\|customGraph\|selectionOf\|weightsOf" mobile/test/graph.test.mjs mobile/test/custom-weights.test.mjs mobile/test/ind-tiers.test.mjs | head -20
```

거기서 확인한 **실제 호출 형태**를 그대로 쓰십시오(예: `MSGraph.full32Graph(ForgeCore)` 처럼 엔진을 인자로 받는지, `customGraph` 가 무엇을 받는지).

측정할 것:
1. 같은 구간(가려진 12봉 제외)에서 **5도구 판정** vs **32도구 판정** — `regime` 과 `score`
2. **4종 성향**(`trend`·`momentum`·`reversion`·`volatility`) 각각의 `regime`·`score`·선택 지표 수
3. 성향 간 **판정이 갈리는가**(regime 이 서로 다른 조합이 하나라도 있는가) 또는 **최소한 score 가 유의미하게 다른가**

- [ ] **Step 2: 측정을 실행하고 결과를 기록한다**

Run: `cd mobile && node tools/measure-preset-sensitivity.mjs`
결과를 보고서에 **표로** 옮기십시오.

- [ ] **Step 3: 판정한다**

- **성향이 판정을 가른다면**(regime 이 갈리거나 score 차가 눈에 띄면) → 표본을 그대로 두고 Task 5 로 간다
- **안 가른다면** → `make-onboarding-sample.mjs` 의 선별 기준에 **"성향 민감도"** 를 추가한다: 후보 창마다 4종 성향을 돌려 **regime 이 최소 2종으로 갈리는 창만** 남긴다. 그다음 기존 규칙(전형 밴드 p40~p60 · confluence 최댓값)을 그대로 적용한다
  - 생성기를 다시 돌려 표본을 교체하고, **기존 회귀 시험**(`test/onboarding-sample.test.mjs` — 표본이 이동폭 극단이 아님)이 여전히 통과하는지 확인한다
  - 새 표본에서 **1단계 도구 3종 판독이 여전히 유효한지** 확인한다(비거부 판독). 깨지면 선별 기준의 우선순위를 조정하고 근거를 남긴다

- [ ] **Step 4: 관문**

Run: `cd .. && ./tests/run.sh && cd mobile && node tools/gate-browser.mjs`
Expected: 전량 통과. 표본을 바꿨다면 1단계 스크린샷이 달라진다 — **직접 열어 확인**하고 본 것을 보고서에 적는다.

- [ ] **Step 5: 커밋**

```bash
git add mobile/tools/measure-preset-sensitivity.mjs mobile/tools/make-onboarding-sample.mjs mobile/www/onboarding-sample.js
git commit -m "$(cat <<'EOF'
measure(mobile): 성향이 판정을 실제로 가르는지 먼저 잰다

온보딩 3단계의 요점은 "성향을 고르면 같은 구간의 판정이 바뀐다"인데, 그게 표본에
따라 성립하지 않을 수 있다. 성립 안 하면 아무 일도 일어나지 않는 화면이 되고 설계의
한 축이 무너진다 — 짓기 전에 쟀다.

측정 스크립트는 버리지 않는다. 표본을 다시 고를 때마다 이 질문을 다시 해야 한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 품질 다섯 규칙(Q1~Q5)을 관문으로 만든다

**왜 지금인가:** "전문기업 다운 품질"은 말로 두면 안 지켜진다. 화면을 짓기 **전에** 규칙을 세워야 이후 태스크가 그 아래서 지어진다. 나중에 세우면 이미 지어진 것에 예외를 뚫게 된다.

**Files:**
- Create: `mobile/www/onboarding-quality.js` · `mobile/test/onboarding-quality.test.mjs`
- Modify: `mobile/www/index.html`(스크립트 등록) · `mobile/www/style-onboarding.css`

**Interfaces:**
- Consumes: `MSUi.el`
- Produces:
  - `MSObQuality.metric({ value, unit, asOf, label }) → Element` — **수치와 기준을 한 그룹으로** 묶는다(Q1)
  - `MSObQuality.stat({ metric, meaning }) → Element` — 수치 블록에 **해석을 동반**시킨다(Q5). `meaning` 없이 부르면 throw
  - `MSObQuality.APPLIES → number[]` — Q1~Q5 를 적용할 단계 번호 목록. 각 태스크가 자기 단계를 여기 넣는다

- [ ] **Step 1: 실패하는 관문을 쓴다**

`mobile/test/onboarding-quality.test.mjs`:

```js
// "전문기업 다운 품질"을 검사 가능한 다섯 규칙으로 바꾼 것(설계서 §5).
// 말로 두면 안 지켜진다 — 사용자 판정이 "개연성/스토리/UX/직관적으로 품질이 떨어져"였다.
//
// 적용 대상(APPLIES)을 두는 이유: 단계를 하나씩 고쳐 나가므로, 아직 손대지 않은 단계까지
// 검사하면 관문이 처음부터 빨갛고 아무도 신뢰하지 않게 된다. 대신 마지막 태스크가
// "7단계 전부가 목록에 있다"를 단언해 예외가 영구화되는 것을 막는다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Q = require("../www/onboarding-quality.js");

test("Q1 — metric 은 값과 기준을 한 그룹으로 묶는다", () => {
  const el = Q.metric({ value: "32.10", unit: "USD", asOf: "2006.04.25", label: "오늘 종가" });
  const txt = el.textContent || "";
  assert.match(txt, /32\.10/, "값이 없다");
  assert.match(txt, /2006\.04\.25/, "기준 시점이 값과 같은 그룹에 없다 — 값만 있는 숫자는 금지다");
  assert.match(txt, /오늘 종가/, "무엇의 값인지가 없다");
});

test("Q1 — 기준 시점 없이 부르면 던진다", () => {
  assert.throws(() => Q.metric({ value: "32.10", label: "오늘 종가" }), /기준/,
    "기준 없는 수치를 만들 수 있으면 규칙이 아니다");
});

test("Q5 — stat 은 해석 없이 만들 수 없다", () => {
  const m = Q.metric({ value: "1.2", unit: "%", asOf: "2006.04.25", label: "오차" });
  assert.throws(() => Q.stat({ metric: m }), /해석/,
    "값만 던지고 해석 없는 블록을 만들 수 있으면 규칙이 아니다");
  const ok = Q.stat({ metric: m, meaning: "이 폭 안에 들 가능성이 큽니다" });
  assert.match(ok.textContent || "", /가능성이 큽니다/);
});

test("관문이 실제로 잡는다 — 규칙마다 위반 샘플이 걸린다", () => {
  assert.throws(() => Q.metric({ value: "1" }), /기준/);
  assert.throws(() => Q.stat({ metric: Q.metric({ value: "1", unit: "", asOf: "x", label: "y" }) }), /해석/);
});

test("APPLIES 는 단계 번호 배열이고 중복이 없다", () => {
  assert.ok(Array.isArray(Q.APPLIES));
  assert.strictEqual(new Set(Q.APPLIES).size, Q.APPLIES.length, "같은 단계가 두 번 들어 있다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd mobile && node --test test/onboarding-quality.test.mjs`
Expected: FAIL — `Cannot find module '../www/onboarding-quality.js'`

- [ ] **Step 3: 헬퍼를 구현한다**

`mobile/www/onboarding-quality.js` — `metric()` 은 `asOf` 가 없으면 던지고, `stat()` 은 `meaning` 이 없으면 던진다. **던지는 것이 요점이다** — 규칙을 어길 수 있는 API 는 규칙이 아니다. 노드에서 시험 가능하도록 `document` 가 없으면 최소 셰이프(`{textContent, appendChild}`)를 만드는 폴백을 두되, 브라우저에서는 반드시 실제 DOM 을 쓴다.

- [ ] **Step 4: Q2·Q3·Q4 를 화면 단언으로 추가한다**

`test/onboarding.test.mjs` 에 `Q.APPLIES` 의 각 단계에 대해:
- **Q2**: 렌더 결과에 진행 표시 노드와 단계 제목 노드가 **둘 다** 있다
- **Q3**: 진행이 고정 타이머로 오르지 않는다 — 소스에 `setInterval`/누적 `setTimeout` 기반 진행 증가가 없다(엔진 이벤트에 묶여야 한다)
- **Q4**: 뒤로가기 버튼은 2·3단계에만 있다(1단계는 시작점이라 없음이 정상 · 4단계 이후는 전진만). 세 갈래 모두 적극 단언 — 예외 처리 금지

지금은 `APPLIES` 가 비어 있으므로 이 단언들은 **아무 단계도 검사하지 않는다**. 그래서 **`APPLIES` 가 비어 있으면 실패**하도록 한 줄을 두십시오 — 그래야 다음 태스크가 자기 단계를 등록하는 것을 잊지 않는다.

- [ ] **Step 5: 통과 확인 + 관문 + 커밋**

Run: `cd mobile && node --test test/onboarding-quality.test.mjs && cd .. && ./tests/run.sh && cd mobile && node tools/gate-browser.mjs`

```bash
git add mobile/www/onboarding-quality.js mobile/test/onboarding-quality.test.mjs mobile/www/index.html mobile/test/onboarding.test.mjs
git commit -m "$(cat <<'EOF'
test(mobile): 온보딩 품질 다섯 규칙을 관문으로 — 말로 두면 안 지켜진다

사용자 판정이 "개연성/스토리/UX/직관적으로 품질이 떨어져"였다. 그런 지적은 문구를
고쳐서 닫히지 않는다 — 검사 가능한 규칙으로 바꿔야 한다.

핵심은 metric()·stat() 이 규칙을 어길 수 없게 만든 것이다. 기준 시점 없이 수치를
만들려 하면 던지고, 해석 없이 수치 블록을 만들려 하면 던진다. 어길 수 있는 API 는
규칙이 아니다.

APPLIES 목록을 둬서 아직 안 고친 단계는 검사하지 않되, 목록이 비면 관문이 실패한다 —
다음 태스크가 자기 단계를 등록하는 것을 잊지 않게.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 1단계 — x축 기준 · 당신/앱/실제 3열

**Files:**
- Modify: `mobile/www/screens/onboarding.js`(`step1`) · `style-onboarding.css` · `strings.js` · `tools/gate-routes.mjs`
- Modify: `mobile/test/onboarding.test.mjs`

**Interfaces:**
- Consumes: `MSObQuality.metric/stat/APPLIES`(Task 2) · 확정 표본(Task 1) · `MSLayers`·`MSPanels`·`MSIndicators.readings`
- Produces: `APPLIES` 에 `1` 등록

- [ ] **Step 1: 실패하는 시험을 쓴다** — 실제 조립으로(vm + 실제 모듈, `test/report-basic.test.mjs` 방식). 단언:
  1. 차트 상단에 **주기와 기간**이 있다(`일봉` + 시작·종료 연월)
  2. 찍은 뒤 **세 열**이 있다 — 당신 / 앱 / 실제. 셋 다 값이 채워진다
  3. 앱 열에 **확신 퍼센트가 없다**(5도구는 여섯 값뿐이라 확률로 오독)
  4. 앱이 틀린 표본을 주입하면 앱 열이 **틀렸다고 쓴다**(맞은 경우만 재고 넘어가지 않는다)
  5. "앱은 도구 5개만 보고 이렇게 말했습니다" 문구가 있다 — 2단계를 벌어들이는 줄

- [ ] **Step 2: 실패 확인** — `cd mobile && node --test test/onboarding.test.mjs`

- [ ] **Step 3: 구현** — `MSObQuality.metric` 으로 수치를 만들고, `APPLIES` 에 `1` 을 넣는다. 3열은 좌우 스크롤 없이 폭 안에 들어와야 한다(폴드 접힘 411px 기준)

- [ ] **Step 4: 관문 + 스크린샷 육안 확인** — `docs/rebuild/shots/app-onboarding.png` 를 열어 **본 것을 적는다**

- [ ] **Step 5: 커밋**

---

## Task 4: 2단계 신설 — 같은 구간, 32개 전부 (증거)

**이 화면이 이 온보딩의 핵심이다.**

**Files:**
- Modify: `mobile/www/screens/onboarding.js`(`step2` 를 32도구 화면으로 재작성) · `style-onboarding.css` · `strings.js` · `tools/gate-routes.mjs` · `test/onboarding.test.mjs`

**Interfaces:**
- Consumes: Task 3 의 1단계 · `MSGraph.full32Graph` · `MSIndicators.readings` · `MSObQuality`
- Produces: `APPLIES` 에 `2` 등록 · 32도구 결과를 `state` 에 캐시(3단계가 비교 기준으로 쓴다)

- [ ] **Step 1: 실패하는 시험을 쓴다.** 단언:
  1. 동의·반대·**무판정** 세 통의 합이 **32와 같다**
  2. **반대 도구가 접혀 있지 않다** — 반대가 있으면 화면에 보인다(펼치기 뒤에 숨지 않는다)
  3. 각 도구 행에 **이름(영어) · 무엇을 봤는지 · 실측 수치**가 있다
  4. **5도구 판정과 32도구 판정이 나란히** 있다
  5. 두 판정이 **같을 때도 화면이 성립한다**("더 많은 도구가 같은 결론을 지지했다") — 다를 때만 재고 넘어가지 않는다

- [ ] **Step 2~5**: 실패 확인 → 구현 → 관문·스크린샷 → 커밋.

**구현 시 지킬 것**: 32줄을 한 번에 쏟지 않는다(대표 몇 줄 + 펼치기). 몇 줄을 먼저 보일지는 **실물을 보고 판단**하고 근거를 보고서에 적는다. 32도구 실행 비용은 240봉에서 40ms 미만이라 문제없다(설계서 §4.2).

---

## Task 5: 3단계 — 성향이 판정을 바꾸는 것을 겪게 한다

**Files:**
- Modify: `mobile/www/screens/onboarding.js`(`step3` → 성향) · `style-onboarding.css` · `strings.js` · `tools/gate-routes.mjs` · `test/onboarding.test.mjs`

**Interfaces:**
- Consumes: Task 1 의 측정 결과 · Task 4 의 32도구 캐시 · `MSIndTiers.PRESETS`
- Produces: `APPLIES` 에 `3` 등록 · `state.style`

- [ ] **Step 1: 실패하는 시험을 쓴다.** 단언:
  1. 성향 4종이 있고 **1개 필수**
  2. **고르면 같은 구간의 판정·근거가 갱신된다** — 고르기 전후의 렌더 결과가 다르다
  3. **다른 성향으로 바꿔 되돌릴 수 있다**(두 번 고르면 두 번 갱신된다)
  4. **판정이 안 바뀌는 성향에서도 화면이 정직하다** — "당신 기준으로도 같은 결론입니다"가 나오고, 바뀐 척하지 않는다
  5. "여기까지는 과거였습니다" 전환 문구가 있다

- [ ] **Step 2~5**: 실패 확인 → 구현 → 관문·스크린샷 → 커밋.

**Task 1 의 측정 결과를 반드시 반영하십시오** — 성향이 판정을 안 가르는 표본이면 4번 단언이 이 화면의 주된 경로가 된다.

---

## Task 6: 4·5단계 — 동의의 개연성 · 선택과 실행의 분리

**Files:**
- Modify: `mobile/www/screens/onboarding.js`(`step4`·`step5`) · `style-onboarding.css` · `strings.js` · `tools/gate-routes.mjs` · `test/onboarding.test.mjs`

**Interfaces:**
- Consumes: Task 5 의 전환 문구 · `MSTickerPicker`
- Produces: `APPLIES` 에 `4`·`5` 등록 · `state.agreed` · `state.sym`

- [ ] **Step 1: 실패하는 시험을 쓴다.** 단언:
  1. 4단계가 **"지금부터 미래를 말한다"** 전환으로 열린다(1막·2막이 과거였음을 받는다)
  2. 하지 **않는** 것 셋이 명시된다 — 매수·매도 권유 아님 / 수익 약속 아님 / 손실 책임
  3. 체크 없이는 진행 불가. 동의 시 `ms_consent` 에 **시각·약관 버전** 기록(기존 키 유지)
  4. **5단계: 종목을 골라도 분석이 시작되지 않는다** — 선택 후에도 결과가 없고, **[분석 시작] 버튼을 눌러야** 시작된다. 진행 조건이 `state.r1` 같은 부수 효과가 **아니다**
  5. 종목을 못 찾거나 봉이 부족하면 **다음 행동 버튼**이 있다(막다른 골목 금지)

- [ ] **Step 2~5**: 실패 확인 → 구현 → 관문·스크린샷 → 커밋.

**주의**: 현행 `canNext()` 의 `step === 4` 분기가 `!!state.r1` 이다. 이것이 "클릭만으로 분석 시작"의 정체다 — **버튼 클릭이 진행을 여는 형태로 바꾸십시오.**

---

## Task 7: 6단계 — 실제 분석 · 오늘값부터 · 근거까지

**Files:**
- Modify: `mobile/www/screens/onboarding.js`(`step6`) · `style-onboarding.css` · `strings.js` · `tools/gate-routes.mjs` · `test/onboarding.test.mjs`
- Modify (필요 시): `mobile/www/progress-analyze.js`

**Interfaces:**
- Consumes: Task 6 의 `state.sym`·`state.agreed` · `MSApi.loadTicker` · `MSObQuality`
- Produces: `APPLIES` 에 `6` 등록 · `state.r1`

- [ ] **Step 1: 실패하는 시험을 쓴다.** 단언:
  1. **오늘 종가가 기준 시각과 함께** 가장 먼저 나온다(Q1)
  2. **세 지평**(내일·1주·1개월)이 각각 중심값 ± 오차로 있다
  3. 각 지평에 **해석이 동반된다**(Q5 — 값만 있는 블록 금지)
  4. **근거**(동의/반대 도구)가 2단계에서 배운 형식으로 있다
  5. 세 지평이 **엇갈리면 엇갈린다고 쓴다** — 방향이 다른 입력을 주입해 확인한다
  6. **진행 중계가 타이머가 아니다**(Q3) — 엔진 호출 수에 묶인다
  7. 로드 실패 시 **다음 행동**이 있다

- [ ] **Step 2~5**: 실패 확인 → 구현 → 관문·스크린샷 → 커밋.

---

## Task 8: 7단계 + 마감

**Files:**
- Modify: `mobile/www/screens/onboarding.js`(`step7`) · `strings.js` · `tools/gate-routes.mjs` · `test/onboarding-quality.test.mjs`
- Modify: `mobile/docs/rebuild/PROGRESS.md` · `map/docs/superpowers/specs/2026-08-18-moneyscoop-app-rebuild-design.md`(P4 상태)

- [ ] **Step 1: 7단계 시험 + 구현** — 단언:
  1. **방금 받은 것**이 가격표보다 **먼저** 요약된다(도구 32 · 지평 3 · 근거)
  2. 가격표가 그다음, 스쿱 10개 지급이 마지막
  3. **온보딩 체험이 상시 무료로 읽히지 않는다** — 가격표가 그 사실을 분명히 한다
  4. 지급은 서버 확정 후에만 잔량이 오른다(낙관적 증가 금지 — 상위 설계서 §9.3 규칙 1)

- [ ] **Step 2: `APPLIES` 완주 단언을 켠다**

`test/onboarding-quality.test.mjs` 에 추가: **`APPLIES` 가 1~7 을 모두 담는다.** 이 단언이 예외의 영구화를 막는다.

- [ ] **Step 3: 파일 크기 판정** — `screens/onboarding.js` 가 크게 늘었으면 분할 여부를 판정하고 **근거를 보고서에 적는다**(쪼갠다면 단계 간 `state` 결합을 어떻게 다룰지 함께)

- [ ] **Step 4: 관문 3중 + 7단계 스크린샷 전수**

Run: `cd .. && ./tests/run.sh && cd mobile && node tools/gate-browser.mjs`
**7단계 스크린샷을 전부 열어** 이야기가 이어지는지 보고, 각 단계가 앞 단계의 질문에 답하는지 **본 것을 적는다.**

- [ ] **Step 5: 문서 갱신** — `PROGRESS.md`(P4 완료·다음 한 걸음은 P1b) · 상위 설계서 §6 의 P4 행에 이 설계서 링크

- [ ] **Step 6: 커밋**

---

## Self-Review

**스펙 커버리지** — 설계서 §4.1(1단계)은 Task 3, §4.2(2단계)는 Task 4, §4.3(3단계)은 Task 5, §4.4·4.5(4·5단계)는 Task 6, §4.6(6단계)은 Task 7, §4.7(7단계)은 Task 8. §5(품질 5규칙)는 Task 2 가 세우고 각 태스크가 `APPLIES` 에 등록하며 Task 8 이 완주를 단언한다. §6(주장하지 않는 것)은 Global Constraints + 각 태스크 단언. §8(검증)은 각 태스크의 관문 스텝. §10 의 열린 항목 둘 중 "성향 민감도"는 **Task 1** 이, "32줄 접기"는 Task 4 가 실물 판단으로 닫는다.

**의도적으로 남긴 것** — `screens/onboarding.js` 분할은 Task 8 에서 판정한다. 지금 쪼개면 단계 간 `state` 결합이 모듈 경계를 넘나드는 형태로 굳는다.

**타입 일관성** — `MSObQuality.metric({value, unit, asOf, label}) → Element` 와 `stat({metric, meaning}) → Element` 는 Task 2 정의와 Task 3·7 사용이 일치한다. `APPLIES` 는 Task 2 가 만들고 Task 3~7 이 자기 번호를 넣으며 Task 8 이 1~7 완주를 단언한다 — 이름과 의미가 전 태스크에서 동일하다.

**남은 위험** — Task 4(32도구 화면)와 Task 7(실제 분석)이 크다. 리뷰가 "둘로 잘랐어야 한다"고 판단하면 **분할이 정답**이며, 그 판단을 원장에 남기고 다음 태스크 경계를 조정한다.
