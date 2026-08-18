# 머니스쿱 앱 개편 P1a — 무료 경로 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 무료 사용자가 워치리스트에서 종목을 골라 기본분석을 받고, **무엇을 사면 무엇이 좋아지는지**를 한 화면에서 보고, 단계 선택 시트까지 끊기지 않고 걸어갈 수 있게 한다.

**Architecture:** P0 의 뼈대(라우터·셸·공용 시트) 위에 화면을 얹는다. 리포트는 **블록 선언**(무엇을 어떤 순서로 그리는가)과 **블록 렌더러**를 분리해, 심화(P1b)·전문(P1c)이 같은 선언 구조에 블록만 더하도록 만든다. 적중률·커버리지는 `window.MSBacktest` 한 곳에서만 읽는다. 단계 선택 시트를 P0 의 `MSSheet` 로 이관해 "넷이 같은 것을 쓴다"의 첫 소비자를 만들고, 그 위에서 하드웨어 뒤로가기를 실증한다.

**Tech Stack:** 바닐라 JS(UMD/IIFE, `www/**` 문법 하한은 ES2017 — Global Constraints·`map/CLAUDE.md §⑤` 참조) · Node `node:test` · Capacitor(안드로이드) · 크로미움 CLI 관문. **빌드 도구·npm 런타임 의존성 없음**(단 Task 7 이 공식 Capacitor 플러그인 하나를 도입한다 — 아래 판정 참조).

**Spec:** [`docs/superpowers/specs/2026-08-18-moneyscoop-p1-design.md`](../specs/2026-08-18-moneyscoop-p1-design.md) (상위: [`2026-08-18-moneyscoop-app-rebuild-design.md`](../specs/2026-08-18-moneyscoop-app-rebuild-design.md))

## Global Constraints

- **`map/mobile/www/**` 는 ES2017 문법 하한** — `const`/`let`·화살표 함수·템플릿 리터럴·async/await 는 이미 프로덕션에 쓰이고 있어 허용(2026-08-18 컨트롤러 판정, Task 1 — "ES5 만"은 스쿱 시리즈 정적 사이트에서 상속된 규칙이었고 이 런타임 근거가 없었다). ES2017 보다 확실히 나중이면서 지금 안 쓰는 문법(옵셔널 체이닝·null 병합·논리 대입·private 필드·`Object.hasOwn`·`groupBy`·배열 비파괴 복사)만 금지. (`mobile/test/**`·`mobile/tools/**` 는 Node 라 예외). 관문은 `mobile/test/syntax-floor.test.mjs`, 근거는 `map/CLAUDE.md §⑤`
- **UI 문자열은 `www/strings.js` 단일 출처.** 화면 파일에 한국어 리터럴 금지. **지표명은 영어 유지**
- **적중률·콘 커버리지·ECE 는 `window.MSBacktest` 에서만 읽는다.** 리터럴 금지 — 관문이 막는다
- **전문 티어 수치는 "측정 중"** (실측 부재)
- **티어 3색**: 기본 `--steel` `#8892a6` · 심화 `--gold` `#e8b463` · 전문 `--platinum` `#b9c4dc`. 바이올렛 `#b892f5` 는 **행동 전용**
- **금지: 항목 좌측 세로 컬러 라인.** 활성·선택은 배경색·텍스트색·체크·아웃라인으로만
- **터치 대상 최소 44px.** 숫자는 `font-variant-numeric: tabular-nums`
- `:root` 밖 헥스 리터럴 금지(`test/style-tokens.test.mjs`)
- **엔진(`forge-core.js`)·서버(`wallet-*.php`)·저장 키(`ms_onboarded`·`ms_watchlist` 등) 불변**
- 표본 20건 미만 퍼센트 금지 · 잔량 낙관적 증가 금지 · 못 준 값 미차감 · 막다른 골목 금지
- 테스트: `./tests/run.sh` (저장소 루트 `map/`) 전량 통과
- **브라우저 관문: `cd mobile && node tools/gate-browser.mjs` 전량 통과** — 매 태스크 완료 조건
- 커밋 메시지 한국어 + `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `www/report-blocks.js` (재작성) | **블록 선언** — 티어별로 무엇을 어떤 순서로 그리는가. 데이터만, DOM 없음 |
| `www/report-model.js` (재작성) | 엔진 결과 → 블록이 먹을 뷰모델. 순수 함수 |
| `www/tier-compare.js` (신규) | 3단 대조 데이터 — `MSBacktest` 에서 폭·적중률을 뽑고 문장을 만든다. 순수 |
| `www/screens/report.js` (재작성) | 블록 선언을 DOM 으로 조립. 기본 티어만(심화는 P1b) |
| `www/screens/watchlist.js` (재작성) | 시안 14a — 헤더·검색·그룹 칩·행·스캔·종목 추가 |
| `www/tier-sheet.js` (재작성) | 시안 6b — `MSSheet` 위에 얹는다 |
| `www/style-report.css` · `style-watchlist.css` · `style-sheet.css` (수정) | 위 화면들의 시안 값 |
| `www/strings.js` (수정) | 새 문구 |
| `test/syntax-floor.test.mjs` (Task 1 에서 이미 생성) | `www/**` 문법 하한(ES2017) 관문 — 원래 `es5-sweep.test.mjs`/ES5 전면 강제로 계획했으나 2026-08-18 컨트롤러 판정으로 재정의됨 |
| `test/tier-compare.test.mjs` (신규) | 3단 대조 — 실측 출처·축 표기·전문 "측정 중" |
| `test/report-blocks.test.mjs` (재작성) | 티어별 블록 수·순서 |
| `test/tier-sheet.test.mjs` (신규) | 시트가 `MSSheet` 를 쓰는가 · 비용 미리보기 규칙 |
| `test/watchlist.test.mjs` (신규) | 행 구성·읽음 상태·스캔 무료 |

---

## ~~Task 1: ES5 규율을 진짜로 만든다~~ — ✅ 재정의·완료(2026-08-18 컨트롤러 판정)

**이 섹션의 원래 지시("위반 3파일을 ES5 로 고친다"·`es5-sweep.test.mjs` 생성)는 폐기됐다 — 실행 대상으로 읽지 말 것.**

프리플라이트 실측에서 "ES5 만" 규칙의 전제 자체가 틀렸음이 드러났다: 위반이 3줄이 아니라 161줄(캔버스 작도 코드 전량)이었고, 런타임 하한(`minSdkVersion 24` + Capacitor 8 + Play 업데이트 WebView + admob 의 GMS 의존)은 ES5 를 요구한 적이 없었다 — "ES5 만"은 스쿱 시리즈 정적 사이트(구형 브라우저 대응)에서 상속된 규칙이었다.

**실제로 수행한 것:**
1. 하한을 **ES2017** 로 확정(근거: `mobile/android/variables.gradle:2` · `node_modules/@capacitor/android/capacitor/build.gradle:46` · `mobile/docs/phase0-measurements.md` · admob 의 GMS 하드 의존)
2. 관문 `mobile/test/syntax-floor.test.mjs` 작성 — ES2017 보다 확실히 나중이면서 지금 안 쓰는 문법(옵셔널 체이닝·null 병합·논리 대입·private 필드·`Object.hasOwn`·`groupBy`·배열 비파괴 복사)만 금지. 규칙마다 자기 위반 샘플이 걸리는지 확인하는 자기검증 시험 포함
3. `map/CLAUDE.md`(§⑤ 신설) · P1 설계서(§4 사전조건 2) · 이 계획서(Global Constraints·Tech Stack·File Structure·본 섹션) 정정
4. **`draw-panels.js`·`draw-layers.js`·`draw-preds.js` 는 고치지 않았다** — 이번 판정의 요점이 "고치지 않는다"였다

판정 근거·확인한 출처·불확실했던 지점의 전체 기록은 `map/CLAUDE.md §⑤`(요약)와 SDD 태스크 보고서(`task-1-report.md`, 저장소 밖 스크래치 공간)에 있다.

---

## Task 2: 리포트 블록 선언 · 뷰모델 분리

**왜 먼저인가:** 기본(3블록)·심화(8블록)·전문(9블록)이 **같은 선언 구조**를 공유해야 P1b·P1c 가 블록만 더한다. 지금 분리하지 않으면 세 화면이 각자 조립 코드를 갖고, "전문이 심화보다 한 줄이라도 적으면 안 된다"는 규칙을 기계가 검사할 수 없다.

**Files:**
- Rewrite: `mobile/www/report-blocks.js` · `mobile/www/report-model.js`
- Rewrite: `mobile/test/report-blocks.test.mjs`

**Interfaces:**
- Consumes: `window.MSBacktest`(실측) · `ForgeCore` 결과
- Produces:
  - `MSReportBlocks.forTier(tier) → [{ id, kind }]` — 그릴 블록의 **선언과 순서**. `tier` 는 `"basic"|"full"|"custom"`
  - `MSReportBlocks.COUNTS → { basic: 3, full: 8, custom: 9 }`
  - `MSReportModel.verdict(an) → { dir, agree, dissent, noDir, total }`
  - `MSReportModel.sentence(an) → string` — 19b 의 「한 문장으로」. 방향·과열·저항 세 값의 규칙 조합

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/report-blocks.test.mjs`:

```js
// 티어별 블록 수·순서가 이 개편의 판매 논거다(설계 §3.2·§3.5·§3.7).
// 전문이 심화보다 적으면 5스쿱을 낸 사용자가 손해를 본 것이다 — 기계가 지킨다.
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const B = require("../www/report-blocks.js");

test("블록 수 — 기본 3 · 심화 8 · 전문 9", () => {
  assert.strictEqual(B.forTier("basic").length, 3);
  assert.strictEqual(B.forTier("full").length, 8);
  assert.strictEqual(B.forTier("custom").length, 9);
  assert.deepStrictEqual(B.COUNTS, { basic: 3, full: 8, custom: 9 });
});

test("전문은 심화의 모든 블록을 유지한 채 조절판만 더한다", () => {
  const full = B.forTier("full").map(b => b.id);
  const custom = B.forTier("custom").map(b => b.id);
  for (const id of full) assert.ok(custom.indexOf(id) >= 0, "전문에서 심화 블록이 빠졌다: " + id);
  const extra = custom.filter(id => full.indexOf(id) < 0);
  assert.deepStrictEqual(extra, ["weights"], "전문이 더한 것은 조절판 하나여야 한다");
});

test("심화 순서는 값이 큰 것부터 — 「한 문장으로」가 맨 위 (시안 19b)", () => {
  const ids = B.forTier("full").map(b => b.id);
  assert.strictEqual(ids[0], "sentence", "숫자를 먼저 내면 대부분은 해석을 못 하고 닫는다");
  assert.ok(ids.indexOf("dissent") < ids.indexOf("horizons"), "반대 의견이 기간보다 아래다");
  assert.ok(ids.indexOf("hitrate") < ids.indexOf("readings"), "적중률이 판독문보다 아래다");
});

test("전문의 조절판은 판정보다 위다 (시안 18c)", () => {
  const ids = B.forTier("custom").map(b => b.id);
  assert.ok(ids.indexOf("weights") < ids.indexOf("sentence"), "조절판이 판정 아래로 내려갔다");
});

test("기본에는 확률·판독문 블록이 없다 — 방향과 범위만 말한다", () => {
  const ids = B.forTier("basic").map(b => b.id);
  for (const forbidden of ["hitrate", "readings", "dissent", "horizons"])
    assert.ok(ids.indexOf(forbidden) < 0, "기본이 " + forbidden + " 를 그린다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd mobile && node --test test/report-blocks.test.mjs`
Expected: FAIL

- [ ] **Step 3: 블록 선언을 구현한다**

`mobile/www/report-blocks.js`:

```js
// 리포트가 무엇을 어떤 순서로 그리는가 — 선언만. DOM 도 계산도 없다.
//
// 세 티어가 같은 선언을 공유하는 이유: 전문은 심화의 블록을 하나도 빼지 않고 조절판만
// 더한 것이다(설계 §3.7). 각 화면이 자기 조립 코드를 갖고 있으면 그 규칙을 사람이
// 눈으로 지켜야 하고, 5스쿱을 낸 사용자가 한 줄 손해 보는 것을 아무도 못 잡는다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSReportBlocks", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 기본은 셋뿐이다. 화면 아래가 비는 것이 설계다 — 스크롤할 것이 없다는 사실 자체가
  // "여기까지가 무료"를 말한다(시안 18a).
  var BASIC = ["verdict", "comb", "chart"];

  // 심화는 값이 큰 것부터. 「한 문장으로」가 맨 위인 이유는 숫자를 먼저 내면 대부분이
  // 해석을 못 하고 닫기 때문이다(시안 19b).
  var FULL = ["sentence", "forecast", "chart", "dissent", "horizons", "hitrate", "readings", "compare"];

  // 조절판은 판정보다 위에 온다(시안 18c) — 내가 만진 것이 결과를 바꿨다는 순서다.
  var CUSTOM = ["weights"].concat(FULL);

  var KIND = {
    verdict: "verdict", comb: "comb", chart: "chart", sentence: "sentence",
    forecast: "forecast", dissent: "dissent", horizons: "horizons",
    hitrate: "hitrate", readings: "readings", compare: "compare", weights: "weights"
  };

  function forTier(tier) {
    var ids = tier === "custom" ? CUSTOM : (tier === "full" ? FULL : BASIC);
    var out = [], i;
    for (i = 0; i < ids.length; i++) out.push({ id: ids[i], kind: KIND[ids[i]] });
    return out;
  }

  return { forTier: forTier, COUNTS: { basic: BASIC.length, full: FULL.length, custom: CUSTOM.length } };
});
```

> **주의**: 기본 티어의 3블록에 "3단 대조"와 "해제 블록"은 세지 않는다 — 시안이 세는 **정보 블록**은 판정·빗·차트 셋이고, 대조와 해제는 크롬(chrome)이다. 이 셈이 무너지면 "여기까지가 무료"라는 시안의 계산이 무너진다.

- [ ] **Step 4: 뷰모델을 구현한다**

`mobile/www/report-model.js` 에 `verdict()`·`sentence()` 를 둔다. `sentence()` 는 **템플릿**이다(생성 문구가 아니다) — 방향·과열·저항 세 값을 받아 `MSStr` 의 조각을 조합한다. 문구는 `strings.js` 에 두고 이 파일은 조합만 한다.

- [ ] **Step 5: 통과 확인 · 관문 · 커밋**

Run: `cd mobile && node --test test/report-blocks.test.mjs && cd .. && ./tests/run.sh && cd mobile && node tools/gate-browser.mjs`

```bash
git add mobile/www/report-blocks.js mobile/www/report-model.js mobile/www/strings.js mobile/test/report-blocks.test.mjs
git commit -m "$(cat <<'EOF'
feat(mobile): 리포트 블록 선언 — 세 티어가 한 구조를 공유한다

전문은 심화의 블록을 하나도 빼지 않고 조절판만 더한 것이다. 각 화면이 자기 조립
코드를 갖고 있으면 그 규칙을 사람이 눈으로 지켜야 하고, 5스쿱을 낸 사용자가 한 줄
손해 보는 것을 아무도 못 잡는다. 선언으로 뽑아 기계가 세게 했다.

기본 3블록에 3단 대조와 해제 블록은 안 센다 — 시안이 세는 정보 블록은 판정·빗·
차트 셋이고 나머지는 크롬이다. 이 셈이 무너지면 "여기까지가 무료"가 무너진다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 기본분석 리포트 (시안 18a·6a)

**Files:**
- Rewrite: `mobile/www/screens/report.js`(기본 티어 경로만) · `mobile/www/style-report.css`
- Modify: `mobile/www/strings.js`
- Modify: `mobile/tools/gate-routes.mjs`(리포트 단언 강화)

**Interfaces:**
- Consumes: `MSReportBlocks.forTier`(Task 2) · `MSChartDraw.specOf("basic")` · `MSApi.loadTicker`
- Produces: 기본 리포트 화면. 라우트 id `report` 유지

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/report-basic.test.mjs` — 소스 정규식이 아니라 **실제 조립을 재는** 시험으로 쓴다(가짜 DOM + vm, `test/shell-backbutton.test.mjs` 가 쓰는 방식). 단언:
1. 기본 티어 렌더 결과에 **정보 블록이 정확히 3개**
2. 판정 문구에 **퍼센트가 없다**(5개면 값이 0·20·40·60·80·100 뿐이라 확률로 오독된다 — 시안 18a)
3. 빗이 **스틸 5 + 연한 골드 27** = 32칸이고, 자물쇠 문구가 **차트 밖 한 줄**로 존재
4. 해제 블록에서 **광고 버튼이 스쿱 버튼보다 먼저**(DOM 순서) — 자발적 시청이 목표이므로
5. 읽은 도구는 **접힌 한 줄**이고 32개 목록이 펼쳐져 있지 않다

- [ ] **Step 2: 실패 확인** — `cd mobile && node --test test/report-basic.test.mjs`

- [ ] **Step 3: 화면을 구현한다**

블록 렌더러를 `id → function(vm) → Element` 표로 두고, `MSReportBlocks.forTier(tier)` 를 순회하며 조립한다. 조립 순서를 코드가 정하지 않게 하는 것이 이 구조의 요점이다.

시안 값: 판정 헤드라인 40~44px/800/−0.05em · 빗 막대 하나가 도구 하나(위=상승, 아래=하락) · 차트 높이 150 · 성향 칩이 헤더에.

- [ ] **Step 4: 통과 확인 + 관문 + 스크린샷 육안 확인**

Run: `cd mobile && node --test test/report-basic.test.mjs && cd .. && ./tests/run.sh && cd mobile && node tools/gate-browser.mjs`
**`docs/rebuild/shots/app-report.png` 를 직접 열어** 판정 헤드라인·빗 32칸·차트·해제 블록이 시안 18a 와 같은 위계로 보이는지 확인하고, 본 것을 보고서에 적는다.

- [ ] **Step 5: 커밋**

---

## Task 4: 3단 대조 (시안 7a) — 이 개편의 판매 논거

**Files:**
- Create: `mobile/www/tier-compare.js` · `mobile/test/tier-compare.test.mjs`
- Modify: `mobile/www/screens/report.js`(대조 카드 삽입) · `style-report.css` · `strings.js`

**Interfaces:**
- Consumes: `window.MSBacktest`(실측) · 현재 예측의 폭
- Produces: `MSTierCompare.rows(pred) → [{ tier, lo, hi, width, rate, note }]` — `rate` 가 없으면 `null`(화면은 "측정 중")

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// 이 카드가 개편의 판매 논거다. 숫자가 틀리면 나머지 전부를 잃는다(시안 7a).
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../www/tier-compare.js");
const SRC = readFileSync(new URL("../www/tier-compare.js", import.meta.url), "utf8");

test("적중률은 MSBacktest 에서만 온다 — 리터럴 금지", () => {
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m,p)=>p);
  assert.ok(!/\b(58|61|63|67)\s*[.%]/.test(body), "적중률처럼 보이는 리터럴이 있다");
  assert.match(body, /MSBacktest/, "실측 출처를 안 읽는다");
});

test("전문 티어는 실측이 없으므로 rate 가 null 이다 — 화면이 '측정 중'을 그린다", () => {
  const rows = C.rows({ lo: 232, hi: 236, mid: 234.2, err: 1.1 });
  const pro = rows.filter(r => r.tier === "custom")[0];
  assert.strictEqual(pro.rate, null, "없는 값을 지어냈다");
});

test("심화의 폭이 기본의 절반 가까이여야 카드가 말이 된다", () => {
  const rows = C.rows({ lo: 232, hi: 236, mid: 234.2, err: 1.1 });
  const basic = rows.filter(r => r.tier === "basic")[0];
  const full = rows.filter(r => r.tier === "full")[0];
  assert.ok(full.width < basic.width, "심화가 기본보다 좁지 않다 — 팔 것이 없다");
});

test("방향 적중률은 자명 기준선을 동반한다", () => {
  assert.ok(C.baseline() > 0.5, "기준선을 노출하지 않으면 58%가 좋아 보인다");
});
```

- [ ] **Step 2~5**: 실패 확인 → 구현 → 통과 → 커밋.

**구현 시 지킬 것**
- 축은 **55~70% 확대**이고 그 사실을 화면에 표기한다(없으면 과장 그래프)
- 심화 카드의 "불리한 사실"은 **실측으로 만든 문장**이다 — 시안의 "2%p 만 오릅니다"는 샘플이고 실측은 **+0.3%p**다. 문장을 `MSBacktest` 값에서 만들고 리터럴을 박지 않는다
- 심화가 파는 것은 **범위**임을 말한다(콘 커버리지 73.8%→77.1%)
- 전문 카드엔 **"기본분석보다 낮아질 수 있다"** 경고

---

## Task 5: 해제 블록 + 단계 선택 시트 (시안 6b) — `MSSheet` 첫 소비자

**Files:**
- Rewrite: `mobile/www/tier-sheet.js` · `mobile/test/tier-sheet.test.mjs`(신규)
- Modify: `mobile/www/style-sheet.css`(구 `.sheet` 소비자 정리) · `screens/report.js`(해제 블록에서 시트 열기)

**Interfaces:**
- Consumes: `MSSheet.open({title, body, onClose}) → {close, body}`(P0) · `MSWallet.get()`
- Produces: `MSTierSheet.open({sym, onPick})` — `onPick(tier)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

단언:
1. **`MSSheet` 를 쓴다** — 자체 백드롭·자체 스크림을 만들지 않는다(`grep` 이 아니라 실제 호출 관측)
2. 제목이 `얼마나 정밀하게?`(strings 키 경유)
3. 기본분석 행은 **`받음`(비활성)**
4. **비용 미리보기는 살 수 있을 때만** — 잔량 부족이면 `12 → 9` 를 아예 그리지 않는다
5. 심화 행에만 **`가장 많이 씀` 배지**

- [ ] **Step 2~5**: 실패 확인 → 구현 → 통과 → 커밋.

**구현 시 지킬 것**
- 구 `.sheet`/`.sheet-scrim` 을 쓰던 다른 소비자(`screens/watchlist.js` 의 종목 추가)가 **함께 깨지지 않게** 한다. 이 태스크에서 워치리스트까지 이관할지, Task 6 으로 미룰지 **구현자가 판단하고 보고서에 근거를 적는다**
- 실행 버튼 바이올렛(행동) · 비용 숫자 골드(화폐) · 티어 이름 3색

---

## Task 6: 워치리스트 (시안 14a)

**Files:**
- Rewrite: `mobile/www/screens/watchlist.js` · `mobile/www/style-watchlist.css`
- Create: `mobile/test/watchlist.test.mjs`
- Modify: `mobile/tools/gate-routes.mjs`

**Interfaces:**
- Consumes: `MSStore.getWatchlist/allScans` · `MSScan` · `MSSheet`(종목 추가)
- Produces: 워치리스트 화면. **결과 카드(P3)는 아직 없다** — 자리만 비워둔다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

단언:
1. 헤더에 **스쿱 필**(마크 + 잔량 숫자)이 있다 — 지금은 다이아몬드 배지다
2. 행 구성: **읽음 상태 점** · 심볼 + 회사명 · 스파크라인 · 가격/등락. **확신 배지는 없다**(스포일러)
3. 읽음 상태 **3종**: 바이올렛 채움(안 읽음) · 빈 링(읽음) · 회색(오래됨)
4. **스캔은 무료** — 잔량 0에서도 눌린다
5. 상태 4종: 비어 있음 / 검색·칩 결과 없음 / 스캔 중 / 스캔 실패. **"스캔 결과 없음 — 스쿱 반환"은 없다**(무료화로 삭제)

- [ ] **Step 2~5**: 실패 확인 → 구현 → 통과 → **스크린샷 육안 확인** → 커밋.

---

## Task 7: 하드웨어 뒤로가기 배선

**왜 지금인가:** P0 는 이것을 "미동작"으로 정직하게 남겼다. 이제 `MSSheet` 의 프로덕션 소비자가 생겼으므로(Task 5) **"뒤로가기가 시트를 먼저 닫는다"를 실증할 수 있다.** 그 전에는 실증할 시트가 앱에 없었다.

**판정(컨트롤러):** `@capacitor/app` 을 도입한다. Global Constraints 의 "새 npm 의존성 금지"는 **빌드 도구·프런트엔드 라이브러리**를 막으려는 규칙이고, 이 저장소는 이미 `@capacitor-community/admob` 을 쓴다 — 공식 Capacitor 플러그인은 그 금지의 대상이 아니다. **안드로이드에서 뒤로가기가 앱을 즉시 종료하는 것은 사용자가 이상하게 여길 동작이고, 그것을 고치는 유일한 길이다.**

**Files:**
- Modify: `mobile/package.json`(의존성 1) · `mobile/www/shell.js` · `mobile/test/shell-backbutton.test.mjs`
- Modify: `map/CLAUDE.md`(의존성 정책에 이 예외를 명시)

- [ ] **Step 1: 플러그인을 더하고 배선을 바꾼다**

`App.addListener("backButton", ...)` 로 교체하되, **Cordova `backbutton` 리스너도 남긴다**(두 경로가 공존해도 해가 없고, 플러그인이 없는 빌드에서 조용히 죽는 것보다 낫다). `@capacitor/app` 이 없을 때를 대비한 가드를 둔다.

- [ ] **Step 2: 시험을 실기기 계약에 맞게 고친다**

`shell-backbutton.test.mjs` 는 여전히 핸들러 안쪽을 재지만, **어느 API 로 등록했는지**를 단언에 더한다. P0 에서 붙인 "이 시험은 안드로이드가 부르는지는 못 잰다"는 주석은 유지한다 — 그건 여전히 사실이고, 실기기 확인이 그 자리를 메운다.

- [ ] **Step 3: 관문 + APK 빌드 + 실기기 확인 항목에 뒤로가기를 되돌린다**

`PROGRESS.md` 의 "막힌 것"에서 하드웨어 뒤로가기 항목을 지우고, APK 확인 항목에 **`뒤로가기가 시트 → 화면 → 앱 종료 순으로 동작한다`** 를 되살린다.

- [ ] **Step 4: 커밋**

---

## Task 8: P1a 마감

- [ ] **Step 1: 관문 3중** — `./tests/run.sh` · `node tools/gate-browser.mjs` · (지갑 서버를 건드렸다면 `./tests/run.sh concurrency`)
- [ ] **Step 2: 시안 대조** — `tools/spec-shot.py` 로 `14a`·`18a`·`6a`·`7a`·`6b` 를 뽑아 `shots/` 의 앱 화면과 **나란히 놓고 본다.** 다른 점을 전부 적고, 각각 "고칠 것 / 의도적으로 다른 것(근거)"으로 분류한다
- [ ] **Step 3: APK 빌드** — `ANDROID-BUILD.md` 절차. ⚠️ 실행하지 않는다(운영 지갑에 붙는다)
- [ ] **Step 4: 원장 갱신** — `PROGRESS.md` 의 현재 위치·진행표·태스크 로그·다음 한 걸음(P1b)·사용자 대기 항목
- [ ] **Step 5: 커밋**

---

## Self-Review

**스펙 커버리지** — P1 설계서 §3.2(기본 리포트)는 Task 3, §3.3(3단 대조)은 Task 4, §3.4(시트)는 Task 5, §4 사전조건 2(ES5→ES2017 재정의)는 ~~Task 1~~(완료·본문 참조), 3(시트 이관)은 Task 5, 1(하드웨어 백)은 Task 7 이 덮는다. §3.5~3.8(심화·전환·전문·판독문)은 **의도적으로 P1b·P1c** 이며 이 계획서 밖이다. §3.1(티어 3색)은 Task 2~4 에 걸쳐 토큰으로 들어간다.

**의도적으로 남긴 것** — 워치리스트의 **결과 카드**(시안 14a 상단)는 P3(다음날 여정)이다. P1a 는 그 자리를 비워둔다. 비워둔 자리가 "미완"으로 읽히지 않도록 Task 6 에서 코드 주석으로 P3 소관임을 남긴다.

**타입 일관성** — `MSReportBlocks.forTier(tier) → [{id, kind}]` 는 Task 2 정의와 Task 3·4 사용이 일치한다. `MSTierCompare.rows(pred) → [{tier, lo, hi, width, rate, note}]` 의 `rate: null` 계약은 Task 4 정의와 화면의 "측정 중" 분기가 일치한다. `MSTierSheet.open({sym, onPick})` 은 Task 5 정의와 Task 3 의 해제 블록 호출이 일치한다. `MSSheet.open` 은 P0 계약 그대로다.

**남은 위험** — Task 3·6 이 큰 화면 재작성이라 한 태스크가 부풀 수 있다. 리뷰가 "이 태스크는 둘로 잘랐어야 한다"고 판단하면 **분할이 정답**이며, 그 판단을 원장에 남기고 다음 태스크 경계를 조정한다.
