# 머니스쿱 P1b — 유료 경로 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 심화(full)·전문(custom) 티어의 잠금을 풀어, 사용자가 번 스쿱을 실제로 쓸 수 있게 한다.

**Architecture:** 잠금의 실체는 `screens/report.js` 의 `PENDING` 표 네 줄(`sentence`·`forecast`·`hitrate`·`compare`)이다. 조사 결과 **넷 중 셋은 계산이 이미 있고 배선만 없다** — `forecast` 는 `MSReportModel.horizonRows()`(이미 호출 중), `hitrate` 는 `MSReportModel.hitRate()`(구현됐으나 호출부 0건), `compare` 는 `buildHorizons()` 안의 `prevBasic()`(이미 렌더 중). 진짜 새 로직이 필요한 것은 `sentence` 하나이고, 그것도 템플릿(`MSReportModel.sentence()`)은 있고 **입력 두 값(`an.overheat`·`an.resistance`)이 어디에서도 계산되지 않는다.** 그래서 이 계획은 "네 블록을 짓는다"가 아니라 **"한 계산을 만들고 셋을 잇고 잠금을 연다"** 이다.

**Tech Stack:** 순수 HTML·CSS·바닐라 JS(빌드 도구 없음), classic `<script src>`, `MSGlobals.define` 전역 등록, `node --test` + 헤드리스 크로미움 관문(`tools/gate-browser.mjs`).

**Spec:** `docs/superpowers/specs/2026-08-18-moneyscoop-p1-design.md` §3.5~3.8 · §4 조건 4 · §5
사실 조사: `mobile/docs/rebuild/p1b-facts.md` (A~F, 근거 파일:줄 포함 — **각 태스크 착수 전 해당 절을 읽는다**)

---

## 실행 그룹 — 이 순서에는 이유가 있다

| 그룹 | 태스크 | 끝나면 무엇이 되는가 |
|---|---|---|
| **G0 사전조건** | 1 | 관문이 **늦게 터진 오류를 잡는다**. 이게 먼저인 이유: P1b 는 비동기 재생이 늘어 정확히 그 구간에서 터지는데, 지금 관문은 그걸 못 본다. 눈을 고치기 전에 짓지 않는다 |
| **G1 잠금 해제** | 2~6 | **심화·전문이 열린다.** 여기서 멈춰도 제품은 성립한다 — 스쿱에 쓸 곳이 생긴다 |
| **G2 재생 품질** | 7 | 19a·8b 가 설계서 §3.6 을 만족한다 |
| **G3 판독문 32** | 8~9 | 시안 20a 의 3줄 구조. **비용이 크고 분리 가능하다** — 아래 §판독문 결정 참고 |
| **마감** | 10 | 문서·스코어카드·APK |

**G1 이 끝나는 시점이 이 계획의 최소 출하 지점이다.**

## Global Constraints

설계서 §5 와 `map/CLAUDE.md` 에서 그대로 옮긴다. 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **`www/**` 문법 하한 ES2017** — 옵셔널 체이닝(`?.`)·null 병합(`??`)·논리 대입·private 필드·`Object.hasOwn`·`groupBy`·배열 비파괴 복사 **금지**(관문 `test/syntax-floor.test.mjs`)
- **UI 문자열은 `www/strings.js` 단일 출처** — 화면 파일에 한국어 리터럴 금지. **지표명은 영어 유지**
- **`:root` 밖 헥스 리터럴 금지**(관문 `test/style-tokens.test.mjs`). 색은 토큰으로
- **항목 좌측 세로 컬러 라인 절대 금지**(사용자 명시 금지) — `border-left`·`box-shadow: inset Npx 0 0`·`::before` 세로 마커. 강조는 배경색·텍스트색·체크·아웃라인으로만
- **터치 44px** · 숫자 `tabular-nums` · 전역은 **`MSGlobals.define`** 경유
- **엔진·서버·저장 키 불변** — `map/forge-core.js`·`forge-tools.js` 를 이 계획에서 고치지 않는다. 저장 키(`store.js` `KEYS`)도 불변
- **새 npm 의존성 금지**(공식 Capacitor 플러그인 제외 — 이 계획엔 해당 없음)
- **적중률·커버리지·ECE 는 `window.MSBacktest` 에서만.** 리터럴 금지
- **표본 20건 미만이면 퍼센트를 쓰지 않는다** · **방향 적중률에는 기준선(`baselineAlwaysUp`, 60.96%)을 병기한다** · **잔량을 낙관적으로 올리지 않는다** · **못 준 값은 받지 않는다**
- **막다른 골목 금지** — 막히는 상태 전부에 다음 행동 버튼
- **전문 티어 적중률은 "측정 중"** — `MSBacktest.tiers` 에 `custom`/`expert` 필드가 없다(조사 A3 확인). 리터럴로 지어내지 않는다
- **조건부 `if` 안에 갇혀 조용히 건너뛰는 단언 금지** · **자명 통과 금지**(텍스트 단언은 실제 내용 + 비어있지 않음을 함께 단언)
- **주입이 실제 통합 경로를 우회하지 않게** — 목업이 `api.js` 를 통째로 대체하면 실전 결함을 못 본다(P4 전례)
- 테스트는 `./tests/run.sh` **전량**(`engine` 만 돌리지 않는다) · 화면을 건드렸으면 `cd mobile && node tools/gate-browser.mjs`
- 주석은 WHY 만, 한국어. 커밋 한국어 + `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## 파일 구조 — 무엇이 어디로 가는가

| 파일 | 책임 | 이 계획에서 |
|---|---|---|
| `www/report-model.js` (174줄) | **DOM 없는 순수 계산** | `overheat()`·`resistance()` 신설(Task 2·3). 새 계산은 전부 여기 |
| `www/screens/report.js` (1569줄) | DOM 빌드 + 화면 상태기계 + 구매 흐름 | `build*` 4개 추가, `PENDING` 비우기. **분할하지 않는다** — 조사 E: 완료 후 1750~1800줄 추정, `report.js` 는 기존 8개 `build*` 와 같은 패턴이라 구조적 이질감 없음. 분할은 `report-model` 경계가 이미 잡혀 있어 실익이 없다 |
| `www/report-blocks.js` (37줄) | 티어별 블록 id 선언 순서 | Task 6 이 `compare` 위치를 정하면 그때만 수정 |
| `www/progress-reveal.js` (92줄) | 8b 해제 전환 | Task 7 이 세 통 배선 |
| `www/progress-analyze.js` (177줄) | 19a 진행 중계 | Task 7 이 빗 강조·현재 위치 |
| `www/readings.js` (486줄) | 판독문 코퍼스 32종 | Task 8·9 (G3) |
| `www/screens/readings-list.js` | 판독문 화면 | Task 9 (G3) |
| `mobile/tools/gate-browser.mjs` | 헤드리스 관문 러너 | Task 1 이 오류 수집 시점 수정 |
| `mobile/tools/gate-routes.mjs` | 관문 라우트 정의 | Task 1·6·7 |

## 판독문 32(G3) 결정 — 실행 전 확인할 것

`readings-list.js` 헤더가 이 항목을 **"사용자 확인 대기"** 로 못박아 뒀다. 설계서 §3.8 은 3줄을 지시하지만, 조사 B 가 잰 실제 비용은 이렇다:

- 32개 `SAY` 함수가 **`string` 을 반환**한다 → 3줄이면 `{plain, measured}` 구조로 **반환 타입 전체 리팩터링**
- 코퍼스 주석에 **엔진 함정 최소 14건**(지표 기준 17개)의 회피 근거가 박혀 있다 — 미계산 구간·거래량 대체·스윙 문턱·한국어 라벨 누출·카운트 캡. `trend` 는 창을 잘못 섞어 **220봉 300계열 중 78계열(26%)에서 기울기 부호가 어긋났던** 실측 회귀 기록까지 있다
- 숫자 자체는 24~28/32 가 이미 함수 안에 있다(추출은 쉽다). **어려운 것은 가드 로직을 어느 줄에 두느냐**

**G3 는 G1·G2 와 독립이다.** 실행 여부·시점을 사용자가 정한다.

---

## Task 1: 관문이 늦게 터진 오류를 잡게 한다 (G0 사전조건)

**설계서 §4 조건 4 가 "P1b 착수 전"으로 지정한 항목.** 조사 D 가 실증했다 — 스냅샷 200ms 뒤에 던진 `console.error` 는 관문을 **통과**(`✓`), 400ms 전에 던진 동일 오류는 잡혔다(`✗`).

**Files:**
- Modify: `mobile/tools/gate-browser.mjs:241-244`(오류 스탬프 시점) · `:279`(virtual-time-budget·dump-dom)
- Modify: `mobile/tools/gate-routes.mjs`(구매 흐름 라우트 신설)

**Interfaces:**
- Produces: 관문이 **가상 시간 종료 시점까지의** 오류를 싣는다. 이후 모든 태스크가 이 관문을 신뢰한다
- Produces: 라우트 `report-purchase` — `report.js` 구매→19a→8b→draw 시퀀스를 실제로 태운다(현재 이 경로를 태우는 시험·라우트가 **하나도 없다**, `PROGRESS.md:109`)

- [ ] **Step 1: 실패하는 라우트 두 개를 쓴다 — 지금 관문이 못 잡는 것을 고정한다**

`mobile/tools/gate-routes.mjs` 에 추가한다. 조사 D 가 쓴 것과 같은 형태다.

```js
  {
    name: "late-error-probe",
    // 스냅샷 이후에 터지는 오류를 관문이 잡는지 재는 라우트. P1b 는 비동기 재생이
    // 구매 흐름에 끼므로 정확히 이 구간에서 터진다 — 여기가 눈멀면 나머지가 다 헛것이다.
    html: "<div id=probe>x</div>",
    scripts: [{ at: 2600, code: 'console.error("LATE_ERROR_PROBE")' }],
    delay: 1200,
    assert: '!!document.getElementById("probe")'
  }
```

**주의**: 이 라우트는 **오류가 나야 정상**이다. 관문이 이 라우트를 `✗` 로 보고해야 통과다 — 관문 러너가 "실패를 기대하는 라우트"를 표현할 방법이 없다면 **표현 수단을 먼저 만들고**(예: `expectFail: true`), 그 수단 자체도 변이로 증명하십시오(기대 실패 라우트가 통과해 버리면 빨개지는지).

- [ ] **Step 2: 실패 확인**

Run: `cd mobile && node tools/gate-browser.mjs late-error-probe`
Expected: **현재는 `✓`(통과)** — 즉 오류를 놓친다. 이것이 고쳐야 할 상태다. 출력을 보고서에 그대로 남긴다.

- [ ] **Step 3: 오류 수집을 종료 시점까지 살아 있게 고친다**

현재 `gate-browser.mjs:241-244` 는 `route.delay` 시점에 **딱 한 번** `document.title` 에 `errs` 를 굳힌다:

```js
js += '\n<script>setTimeout(function(){var ok=false,err="";' +
  'try{ok=!!(' + route.assert + ');}catch(e){err=String(e);}' +
  'document.title="GATE:"+JSON.stringify({ok:ok,err:err,errs:(window.__gateErrs||[]),warns:(window.__gateWarns||[])});},' +
  (route.delay || 1500) + ');</script>';
```

`--dump-dom`(`:279`)은 **가상 시간 종료 시점**의 DOM 을 읽는다. 그러니 오류를 title 이 아니라 **DOM 노드에 계속 갱신**하면 종료 시점 값이 잡힌다. `ok`/`err`(단언 결과)는 지금처럼 `delay` 시점 값이 맞다 — 단언은 그 시점을 재는 것이므로.

```js
// 단언 결과는 delay 시점 값이 맞다(그 시점을 재는 것이므로). 그러나 오류는 다르다 —
// 스냅샷 이후에 터진 것도 오류다. 그래서 오류만 DOM 노드에 계속 갱신하고,
// --dump-dom 이 읽는 **가상 시간 종료 시점** 값을 쓴다(실증: late-error-probe).
js += '\n<script>' +
  'var __gp=document.createElement("pre");__gp.id="__gate_errs";' +
  'document.documentElement.appendChild(__gp);' +
  'function __gsync(){__gp.textContent=JSON.stringify({errs:(window.__gateErrs||[]),warns:(window.__gateWarns||[])});}' +
  '__gsync();setInterval(__gsync,50);' +
  'setTimeout(function(){var ok=false,err="";' +
  'try{ok=!!(' + route.assert + ');}catch(e){err=String(e);}' +
  '__gsync();document.title="GATE:"+JSON.stringify({ok:ok,err:err});},' +
  (route.delay || 1500) + ');</script>';
```

그리고 결과 파싱부에서 `errs`/`warns` 를 title 이 아니라 dump 된 DOM 의 `#__gate_errs` 텍스트에서 읽도록 고친다.

**주의 1**: `setInterval` 은 **관문 러너의 계측 코드**다 — `www/**` 의 "진행을 타이머로 올리지 않는다"(Q3) 규칙은 화면 코드에 대한 것이지 관문 계측에 대한 것이 아니다. 그래도 Q3 시험이 이 파일을 훑는지 확인하고, 훑는다면 왜 예외인지 주석으로 남긴다.

**주의 2**: `--virtual-time-budget` 이 `delay+3000`(`:279`)이다. 구매 흐름은 19a + 8b(3초 고정) + draw 라 **3초를 넘는다.** Step 5 의 라우트가 이 예산 안에 안 들어가면 예산도 함께 키운다 — 그 값을 **왜 그 수로 잡았는지** 주석에 적는다.

- [ ] **Step 4: 통과 확인**

Run: `cd mobile && node tools/gate-browser.mjs late-error-probe`
Expected: **`✗`** — `LATE_ERROR_PROBE` 를 잡아낸다.

그리고 조사 D 가 쓴 반대 방향도 확인한다: `at: 800`(스냅샷 **전**)으로 바꿔도 여전히 잡히는지. 두 방향 모두 확인 후 원복.

Run: `cd mobile && node tools/gate-browser.mjs` (전체)
Expected: 기존 11개 라우트가 **그대로 통과**한다. 이 수정이 기존 라우트의 판정을 바꾸면 안 된다 — 바뀐 라우트가 있으면 **그것은 원래 오류를 숨기고 있던 라우트다.** 무엇이 왜 빨개졌는지 보고서에 적고, 그 오류 자체를 고칠지 판정을 요청한다.

- [ ] **Step 5: 구매 흐름 라우트를 신설한다**

`PROGRESS.md:109` 가 "위험도 상승"으로 등록한 구멍이다 — `progress-analyze.js` 의 두 번째 호출자(`report.js:1161`)와 `progress-reveal.js` 의 유일한 호출자(`report.js:1153`)를 태우는 라우트가 **없다**.

```js
  {
    name: "report-purchase",
    // 구매→19a(진행 중계)→8b(해제 전환, 3초 고정)→draw 시퀀스를 실제로 태운다.
    // delay 를 재생시간보다 넉넉히 잡는 이유: 스냅샷이 재생 도중에 찍히면 그 뒤 오류를
    // 놓친다(Task 1 Step 2 에서 실증한 실패 모드).
    delay: 6000,
    assert: '(function(){' +
      'var an=document.querySelector(".an-scrim"), rv=document.querySelector(".rv-scrim");' +
      // 재생이 끝나 둘 다 사라지고 리포트가 그려졌는가
      'if(an||rv) return false;' +
      'var cards=document.querySelectorAll(".rp-card");' +
      'if(!cards.length) return false;' +
      'return true;})()'
  }
```

**정확한 진입 방법**(어느 화면에서 무엇을 클릭해 구매 흐름에 들어가는지)은 **추측하지 말고** 기존 `report`·`report-locked-tiers` 라우트가 어떻게 화면을 세우는지 읽고 같은 방식을 쓰십시오. 지갑 잔량이 필요하면 기존 라우트가 지갑을 어떻게 세우는지도 그대로 따르십시오 — **운영 서버에 실제로 붙지 않게** 하는 것이 특히 중요합니다(기존 라우트가 이미 그 처리를 하고 있습니다).

**현 시점에는 티어가 잠겨 있어 구매가 막힙니다.** 그래서 이 라우트는 Task 6(잠금 해제) 전까지는 "잠금 화면이 정직하게 뜬다"를 재고, Task 6 이 잠금을 풀면 **실제 구매 시퀀스를 재도록 확장**합니다. Task 6 브리프에 그 확장이 들어 있습니다 — 여기서는 지금 태울 수 있는 만큼만 태우고, **무엇을 아직 안 재는지 라우트 주석에 적으십시오.**

- [ ] **Step 6: 전량 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
./tests/run.sh && cd mobile && node tools/gate-browser.mjs
git add mobile/tools/gate-browser.mjs mobile/tools/gate-routes.mjs
git commit -m "fix(mobile): 관문이 스냅샷 이후 오류를 놓치던 것을 고친다 — P1b 사전조건

가상 시간 종료 시점까지 오류를 모으고, 구매 흐름을 태우는 라우트를 세운다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 과열·저항선을 무엇으로 정할지 **먼저 잰다** (G1)

`MSReportModel.sentence()` 는 이미 있다(`report-model.js:163-170`). 그런데 그것이 읽는 `an.overheat`·`an.resistance` 를 **코드베이스 어디에서도 만들지 않는다**(조사 A1). 지금 켜면 방향 한 줄만 나오고 두 절은 영원히 안 붙는다.

**정의를 추측으로 정하지 않는다.** 문턱을 잘못 잡으면 둘 중 하나가 된다 — 늘 붙어서 의미가 없거나, 거의 안 붙어서 블록이 헛것이거나. P4 Task 1(성향 민감도)이 같은 이유로 측정을 먼저 했고, 그 측정이 죽은 화면 하나를 막았다.

**Files:**
- Create: `mobile/tools/measure-sentence-signals.mjs`
- Read: `mobile/backtest/earn-ohlc.json`(실 OHLC 표본 풀 — `tools/make-onboarding-sample.mjs` 가 쓰는 것과 같은 원천. **정확한 로드 방법은 그 파일에서 확인**)

**Interfaces:**
- Produces: 과열·저항 판정의 **문턱과 출처**(측정으로 뒷받침된 값). Task 3 이 그대로 구현한다

- [ ] **Step 1: 후보 정의를 코드로 적는다**

조사 A1 이 지목한 후보 출처:

- **과열(overheat)** 후보: RSI 존(`rsi.zone` — `readings.js:130` 의 `RSI_ZONE` 이 쓰는 것과 같은 소스) · 볼린저 상태(`bb.state`) · CCI/Williams 과열대
- **저항(resistance)** 후보: MA 근접(`ma.sr`, `{ma, side, distPct}` — `forge-core.js:126`) · 피벗/피보나치 최근접 레벨(`forge-core.js:1175`)

**32지표 그래프에서만 나오는 값이 있다**(pivot·fib 은 basic 5지표에 없다) — 그래서 이 문장은 유료 티어 전용이다. 그 사실을 측정에도 반영한다.

```js
// 후보마다 "이 정의로 몇 %의 창에서 절이 붙는가"를 잰다. 붙는 비율이 극단이면
// (거의 100% 거나 거의 0%) 그 정의는 정보가 없다 — 문장이 늘 같아지거나 늘 없어진다.
const CANDIDATES = {
  overheat_rsi70:   (an) => an.rsi && an.rsi.zone === "overbought",
  overheat_bbUpper: (an) => an.bb && an.bb.state === "upper",
  overheat_both:    (an) => (an.rsi && an.rsi.zone === "overbought") && (an.bb && an.bb.state === "upper"),
  resist_ma2pct:    (an) => an.ma && an.ma.sr && an.ma.sr.side === "resistance" && an.ma.sr.distPct <= 0.02,
  resist_ma1pct:    (an) => an.ma && an.ma.sr && an.ma.sr.side === "resistance" && an.ma.sr.distPct <= 0.01
};
```

**주의**: 위 필드명(`zone`·`state`·`sr.distPct`)은 조사 보고서가 읽어 낸 것이다. **API 시그니처를 추측하지 말고** `readings.js` 의 해당 지표 함수와 `forge-core.js` 에서 실제 필드를 확인하고 맞추십시오 — 이 저장소에서 시그니처 추측이 이미 여러 번 틀렸습니다.

- [ ] **Step 2: 실 데이터로 잰다**

표본 풀 전체를 훑어 각 후보의 발생 비율을 낸다. **최소 200창 이상**을 재고, 실제로 몇 창을 쟀는지 출력한다.

Run: `cd mobile && node tools/measure-sentence-signals.mjs`
Expected: 후보별 `발생 n / 전체 N (비율%)` 표가 나온다.

- [ ] **Step 3: 판정한다**

**판정 규칙**(보고서에 근거와 함께 적는다):
- 발생률이 **5% 미만**이면 그 절은 거의 안 나온다 → 문장이 사실상 한 줄. 정의를 넓히거나 그 절을 포기한다
- 발생률이 **80% 초과**면 늘 붙는다 → 정보가 아니다. 정의를 좁힌다
- **둘 다 아닌 후보 중 가장 해석이 단순한 것**을 고른다 — 사용자에게 설명 가능해야 한다

두 신호가 **동시에 붙는 비율**도 재십시오. 늘 같이 붙으면 두 절을 나눈 의미가 없습니다.

- [ ] **Step 4: 시험으로 잠근다**

측정값이 조용히 뒤집히지 않게 한다. P4 Task 1 의 선례(`test/onboarding-sample.test.mjs` 가 성향 민감도를 잠근 방식)를 따른다.

```js
// 문턱이 바뀌어 절이 늘 붙거나 아예 안 붙게 되면 여기서 걸린다 — 그때 문장 블록은
// 정보를 잃는다(늘 같은 문장 = 정보 0).
test("과열·저항 절이 극단 비율이 아니다(정보가 있다)", () => {
  const r = measure();
  assert.ok(r.overheat.rate > 0.05 && r.overheat.rate < 0.80,
    "과열 절 발생률이 극단이다 — " + (r.overheat.rate * 100).toFixed(1) + "%");
  assert.ok(r.resistance.rate > 0.05 && r.resistance.rate < 0.80,
    "저항 절 발생률이 극단이다 — " + (r.resistance.rate * 100).toFixed(1) + "%");
});
```

**실패 메시지에 실제 비율과 문턱까지의 여유를 적으십시오** — P4 Task 1 의 `경계까지 N점` 형식이 그 선례입니다. 여유가 얼마 안 남았다는 것을 사람이 즉시 알아야 합니다.

- [ ] **Step 5: 전량 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
git add mobile/tools/measure-sentence-signals.mjs mobile/test/
git commit -m "measure(mobile): 「한 문장으로」의 과열·저항 절이 실제로 붙는지 먼저 잰다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `sentence` 블록 — 계산과 화면 (G1)

**Files:**
- Modify: `mobile/www/report-model.js`(`overheat()`·`resistance()` 신설 + `sentence()` 호출 경로)
- Modify: `mobile/www/screens/report.js`(`analyzeFull()` 반환에 두 필드 추가 · `buildSentence()` · BUILD 표)
- Modify: `mobile/www/style-report.css` · `mobile/www/strings.js`(필요 시)
- Test: `mobile/test/report-model.test.mjs`(있으면 확장, 없으면 신설)

**Interfaces:**
- Consumes: Task 2 가 확정한 문턱
- Produces: `MSReportModel.overheat(an) → boolean` · `MSReportModel.resistance(an) → boolean` · `an.overheat`·`an.resistance` 필드 · 화면 블록 `sentence`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```js
test("sentence — 과열이면 과열 절이 붙고, 아니면 안 붙는다(양쪽 갈래)", () => {
  const hot  = MSReportModel.sentence({ dir: "bull", overheat: true,  resistance: false });
  const cool = MSReportModel.sentence({ dir: "bull", overheat: false, resistance: false });
  assert.match(hot, /과열/, "과열인데 과열 절이 없다");
  assert.doesNotMatch(cool, /과열/, "과열이 아닌데 과열 절이 붙었다");
  assert.notStrictEqual(hot, cool, "두 갈래가 같은 문장이다 — 조건이 안 먹는다");
});

test("sentence — 실제 분석 결과에서 overheat/resistance 가 계산된다(더 이상 항상 undefined 가 아니다)", () => {
  // 실제 엔진 경로로 an 을 만들어 두 필드가 boolean 인지 본다.
  // undefined 면 지금과 같은 상태다 — 템플릿은 있고 입력이 없는.
  const an = buildRealAnalysis();   // 아래 Step 3 에서 실제 조립 방식 확정
  assert.strictEqual(typeof an.overheat, "boolean", "overheat 가 계산되지 않았다");
  assert.strictEqual(typeof an.resistance, "boolean", "resistance 가 계산되지 않았다");
});
```

**`buildRealAnalysis()` 는 실제 조립으로 쓰십시오** — vm + 실제 모듈. `test/report-basic.test.mjs` 가 그 방식의 본보기입니다. 목업으로 `an` 을 손으로 만들면 "계산이 배선됐는가"를 재지 못합니다.

- [ ] **Step 2: 실패 확인**

Run: `cd mobile && node --test test/report-model.test.mjs`
Expected: 둘째 시험이 `typeof undefined !== "boolean"` 으로 실패.

- [ ] **Step 3: 계산을 `report-model.js` 에 넣고 `analyzeFull()` 이 채우게 한다**

```js
  // 「한 문장으로」의 두 절. 문턱은 Task 2 가 실측으로 정했다(발생률 5~80% 구간) —
  // 여기 숫자를 바꾸면 test/*.mjs 의 극단 비율 시험이 먼저 빨개진다.
  function overheat(an) { /* Task 2 확정 정의 */ }
  function resistance(an) { /* Task 2 확정 정의 */ }
```

`report.js:216-217` 의 `analyzeFull()` 반환 객체에 두 필드를 더한다:

```js
    return { out: out, graph: graph, vol: okVol ? vol : null,
             ma: ma, rsi: rsi, bb: bb, macd: macd, va: va,
             maP: maP, rsiP: rsiP, bbP: bbP, mcP: mcP,
             // 「한 문장으로」가 읽는 두 값. 여기서 채우지 않으면 sentence() 의 두 절이
             // 영원히 안 붙는다(P1b 이전 상태가 정확히 그랬다).
             overheat: MSReportModel.overheat(...), resistance: MSReportModel.resistance(...) };
```

**두 함수에 무엇을 넘길지**(`an` 전체인지 `{rsi, bb, ma}` 만인지)는 순환 참조가 안 생기는 형태로 정하고 근거를 적으십시오 — `analyzeFull` 이 아직 `an` 을 만드는 중이므로 자기 자신을 넘길 수 없습니다.

- [ ] **Step 4: 화면 블록 `buildSentence()`**

`report.js` 의 기존 `build*` 패턴을 그대로 따른다(`buildComb` 29줄이 규모 기준선). BUILD 표(`report.js:1468-1487`)에 `sentence: function () { return buildSentence(); }` 를 더한다.

**설계서 §3.5**: 「한 문장으로」가 **맨 위**다 — 숫자를 먼저 내면 대부분은 해석을 못 하고 닫는다. `FULL` 선언(`report-blocks.js:18`)이 이미 `sentence` 를 첫 번째로 두고 있으니 순서는 이미 맞다. **확인만 하고 바꾸지 마십시오.**

- [ ] **Step 5: 통과 확인 + 관문**

Run: `cd mobile && node --test test/report-model.test.mjs`
Expected: PASS

Run: `cd .. && ./tests/run.sh && cd mobile && node tools/gate-browser.mjs`
Expected: 전량 통과 · 관문 전체 통과

- [ ] **Step 6: 커밋**

```bash
git add mobile/www/report-model.js mobile/www/screens/report.js mobile/www/strings.js mobile/www/style-report.css mobile/test/
git commit -m "feat(mobile): 「한 문장으로」— 과열·저항 판정을 계산하고 문장을 조립한다

템플릿은 있었고 입력이 없었다. sentence() 의 두 절은 an.overheat/an.resistance 를
읽는데 그 두 필드를 아무도 채우지 않아 방향 한 줄만 나오고 있었다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `forecast` 블록 — 「내일 예상 + 확신」 (G1)

계산은 이미 있다. `MSReportModel.horizonRows()`(`report-model.js:55-77`)가 `prob` 를 포함해 세 지평을 돌려주고 `buildHorizons()` 가 이미 쓴다. **이 태스크는 배선이다.**

**Files:**
- Modify: `mobile/www/screens/report.js`(`buildForecast()` · BUILD 표)
- Modify: `mobile/www/style-report.css` · `mobile/www/strings.js`
- Test: `mobile/test/report-full.test.mjs`(신설 — 심화 티어 화면 시험)

**Interfaces:**
- Consumes: `MSReportModel.horizonRows(FC, prediction, price)` — **정확한 인자는 `buildHorizons()` 호출부에서 확인**. 추측 금지
- Produces: 화면 블록 `forecast`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```js
test("forecast — 내일 중심값·오차·확신이 모두 있고, 확신은 horizonRows 의 prob 다", () => {
  const dom = renderFullReport();          // 실제 조립(vm + 실제 모듈)
  const box = dom.querySelector(".rp-forecast");
  assert.ok(box, "forecast 블록이 없다");
  const txt = deepText(box);
  assert.ok(txt.trim().length > 0, "forecast 블록이 비어 있다");
  assert.match(txt, /±/, "오차 범위 표기가 없다");
});

test("forecast — 확신 퍼센트에 기준선이 병기되지 않는다(그 자리는 hitrate 블록이다)", () => {
  // 규율: 방향 적중률에는 기준선을 병기한다. 그러나 여기 prob 는 적중률이 아니라
  // 캘리브레이션된 모델 확신이다(report-model.js:66-70). 두 수를 같은 카드에 놓으면
  // 사용자가 "60% 맞힌다"로 읽는다 — 그래서 적중률은 Task 5 의 독립 블록이다.
  const txt = deepText(renderFullReport().querySelector(".rp-forecast"));
  assert.doesNotMatch(txt, /60\.96|기준선/, "확신 카드에 기준선이 섞였다");
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd mobile && node --test test/report-full.test.mjs` / Expected: `forecast 블록이 없다`

- [ ] **Step 3: `buildForecast()` 구현**

`horizonRows()` 의 `rows[0]`(내일)을 쓴다. 규모 기준선: `buildHorizons`(83줄)의 서브셋이므로 40~60줄.

**가격 표기는 `MSUi.fmtPrice` 를 쓰십시오** — `report.js` 가 이미 8곳에서 씁니다(원화 종목에서 `71096.26` 대신 `71,096`). 오차폭에도 같은 규칙을 적용합니다(`report.js:572` 선례).

- [ ] **Step 4: 통과 확인** — Run: `cd mobile && node --test test/report-full.test.mjs` / Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add mobile/www/screens/report.js mobile/www/strings.js mobile/www/style-report.css mobile/test/report-full.test.mjs
git commit -m "feat(mobile): 심화 리포트 「내일 예상 + 확신」 — 이미 있던 horizonRows 를 잇는다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `hitrate` 블록 — 적중률, 기준선과 범위를 달고 (G1)

`MSReportModel.hitRate()`(`report-model.js:85-105`)는 **완성돼 있는데 `report.js` 어디서도 안 불린다**(조사 A3, grep 0건).

**Files:**
- Modify: `mobile/www/screens/report.js`(`buildHitrate()` · BUILD 표)
- Modify: `mobile/www/strings.js` · `mobile/www/style-report.css`
- Test: `mobile/test/report-full.test.mjs`(Task 4 가 만든 파일 확장)

**Interfaces:**
- Consumes: `MSReportModel.hitRate(summary, regime) → {right, wrong, n, series, baseline} | null`
- Produces: 화면 블록 `hitrate`

- [ ] **Step 1: 표본 정합을 먼저 판정한다 — 이게 이 태스크의 핵심 결정**

조사 A3 이 **서로 다른 세 표본**을 찾았다:

| 출처 | 무엇 | 값 |
|---|---|---|
| `MSBacktest.bullHitRate`/`bearHitRate` (top-level) | **19지표 sampleGraph** 기준 | 61.7% / 42.5% |
| `MSBacktest.tiers.basic` | 5지표 | 58.2% |
| `MSBacktest.tiers.deep` | 32지표 | 58.5% |

`MSReportModel.hitRate()` 는 **첫째**를 읽고, 3단 대조(`tier-compare.js`)는 **둘째·셋째**를 읽는다. 심화 리포트에 첫째를 쓰면 **같은 화면 흐름 안에서 두 적중률이 다른 표본으로 나온다.**

→ **어느 표본을 쓸지 정하고 근거를 보고서에 적으십시오.** 판정 기준: 심화 리포트는 32지표로 낸 판정이다 — 그렇다면 `tiers.deep` 이 그 판정에 대응한다. 그러나 `hitRate()` 는 방향별(bull/bear)로 갈리고 `tiers` 는 안 갈린다. **둘 다 필요하면 화면이 어느 수를 무엇에 대해 말하는지 반드시 밝혀야 합니다**(설계서 §3.5: 적중률에 **범위 주석 필수** `rpHitScopeShort` — 이 종목의 성적이 아니라 엔진 전체 측정값).

- [ ] **Step 2: 실패하는 시험을 쓴다**

```js
test("hitrate — 적중률 옆에 기준선이 반드시 병기된다", () => {
  const txt = deepText(renderFullReport().querySelector(".rp-hitrate"));
  assert.ok(txt.trim().length > 0, "hitrate 블록이 비어 있다");
  // 규율: 방향 적중률을 단독으로 놓으면 사용자는 "동전보다 낫다"로 읽는다.
  // 이 자산·이 기간의 기준선은 50%가 아니라 60.96%이고 방향 판정은 그 아래다.
  const base = (globalThis.MSBacktest.baselineAlwaysUp * 100).toFixed(1);
  assert.ok(txt.indexOf(base) >= 0, "기준선(" + base + "%)이 병기되지 않았다");
});

test("hitrate — 범위 주석이 있다(이 종목의 성적이 아니라는 것)", () => {
  const txt = deepText(renderFullReport().querySelector(".rp-hitrate"));
  assert.match(txt, /전체|엔진|시리즈/, "무엇에 대해 잰 수치인지 범위가 없다");
});

test("hitrate — 값이 없으면 블록 자체를 감춘다(비교 없는 숫자는 안 낸다)", () => {
  const dom = renderFullReport({ backtest: null });   // 생성물 부재 상황
  assert.strictEqual(dom.querySelector(".rp-hitrate"), null,
    "백테스트 요약이 없는데 적중률 블록이 떴다");
});
```

- [ ] **Step 3: 실패 확인** — Run: `cd mobile && node --test test/report-full.test.mjs`

- [ ] **Step 4: `buildHitrate()` 구현**

`hitRate()` 가 `null` 을 돌려주면(중립 regime · 생성물 부재 · 필드 없음) **블록을 아예 안 붙인다**. `report-model.js:99-102` 주석이 그 규약을 이미 적어 뒀다 — "비교 없는 숫자는 안 낸다".

**`n < 20` 규칙**: `nForecasts=31971`, `nSeries=87` 둘 다 안전하다(조사 A3). 그래도 **코드가 그 사실에 기대지 말고 검사하게** 하십시오 — 생성물이 바뀌면 조용히 깨집니다.

- [ ] **Step 5: 통과 확인 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh && cd mobile && node tools/gate-browser.mjs
cd .. && git add mobile/www/screens/report.js mobile/www/strings.js mobile/www/style-report.css mobile/test/report-full.test.mjs
git commit -m "feat(mobile): 심화 리포트 적중률 블록 — 기준선·범위와 함께

hitRate() 는 구현돼 있었으나 호출부가 0건이었다. 표본이 셋(19지표·5지표·32지표)이라
화면이 어느 수를 무엇에 대해 말하는지 밝힌다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: `compare` 판정 · `PENDING` 비우기 · **잠금 해제** (G1 완결)

**이 태스크가 끝나면 심화·전문이 열린다.**

**Files:**
- Modify: `mobile/www/screens/report.js`(`PENDING` 표 `:54-68` · 필요 시 `buildCompare` 분리 · `buildLast()` 판정)
- Modify: `mobile/www/report-blocks.js`(compare 위치를 바꾸는 경우만)
- Modify: `mobile/tools/gate-routes.mjs`(`report-locked-tiers` 의 주석 처리된 옛 단언 되살리기 · `report-purchase` 확장)
- Test: `mobile/test/report-blocks.test.mjs` · `mobile/test/report-full.test.mjs`

**Interfaces:**
- Consumes: Task 3·4·5 의 세 블록
- Produces: `tierBuyable("full") === true` · `tierBuyable("custom") === true`

- [ ] **Step 1: `compare` 를 독립 카드로 뽑을지 판정한다**

설계서와 `report.js:64-67` 주석이 이 결정을 명시적으로 P1b 에 위임했다. 사실:

- 내용은 이미 `buildHorizons()` 안 `prevBasic()`(`report.js:634-640`)이 그리고 있다(`.rp-hz-prev`)
- `compare: buildHorizons` 로 이으면 **같은 카드를 두 번 그린다**(중복)
- **폭 전제가 뒤집혔다**: 최종 리뷰 독립 실측(28창) — 심화가 더 좁은 사례 **0.0%**, 폭 비율 중앙값 **1.78배**, 최대 **7.09배**. 유료 사용자는 돈을 낸 직후 **더 넓어진** 범위를 본다

→ **판정하고 근거를 적으십시오.** 그리고 어느 쪽을 고르든 **화면이 "넓어졌다"는 사실을 먼저 말해야 합니다**(설계서 §3.5 정정 + `report.js:855-861` 주석). "좁아진다"는 문구를 쓰면 결함입니다.

- [ ] **Step 2: 폭 대소를 실데이터로 재는 시험을 쓴다**

```js
test("compare — 심화 폭이 기본보다 넓으면 화면이 그 사실을 먼저 말한다", () => {
  const dom = renderFullReport();          // 실제 조립
  const cmp = dom.querySelector(".rp-hz-prev, .rp-compare");
  assert.ok(cmp, "직전 대조가 없다");
  const txt = deepText(cmp);
  assert.ok(txt.trim().length > 0, "직전 대조가 비어 있다");
  // 실측: 심화가 더 좁은 사례 0.0%. "좁아진다"고 쓰면 반대 사실을 말하는 것이다.
  assert.doesNotMatch(txt, /좁아|절반/, "실측과 반대되는 문구가 있다");
});
```

- [ ] **Step 3: `PENDING` 네 줄을 지운다**

```js
  // P1b 가 네 블록을 전부 지었다 — 이 표는 이제 비어 있고, 그래서 tierBuyable()이
  // full·custom 둘 다 true 를 돌려준다. CUSTOM = ["weights"].concat(FULL) 이고
  // weights 는 애초에 이 표에 없었으므로 전문도 같은 시점에 열린다.
  var PENDING = {};
```

- [ ] **Step 4: 잠금이 실제로 풀렸는지 재는 시험**

```js
test("잠금 해제 — 심화·전문 둘 다 구매 가능하다", () => {
  assert.strictEqual(tierBuyable("full"), true, "심화가 여전히 잠겨 있다");
  assert.strictEqual(tierBuyable("custom"), true, "전문이 여전히 잠겨 있다");
});

test("선언한 블록을 전부 그린다 — 5스쿱 낸 사용자가 한 줄도 손해 보지 않는다", () => {
  ["full", "custom"].forEach(function (tier) {
    const dom = renderReport({ tier: tier });
    MSReportBlocks.forTier(tier).forEach(function (b) {
      assert.ok(dom.querySelector("[data-block='" + b.id + "']"),
        tier + " 티어에서 " + b.id + " 블록이 안 그려졌다");
    });
  });
});
```

**둘째 시험을 위해 각 블록 노드에 `data-block` 속성을 붙이십시오** — 지금은 클래스명으로만 구분되어 "선언한 것을 다 그렸는가"를 구조적으로 물을 수 없습니다. 이 속성이 P1c 이후에도 같은 질문을 가능하게 합니다.

- [ ] **Step 5: 되살릴 단언과 죽은 코드를 정리한다**

세 가지가 이 시점을 기다리고 있다(`PROGRESS.md:41`·`:110`·`:44`):

1. **`report-locked-tiers` 라우트의 주석 처리된 옛 단언** — 잠금이 풀렸으니 CTA 버튼·시트 순서 단언이 되살아난다. 주석을 풀고 **실제로 통과하는지** 확인
2. **`buildLast()` / `.rp-last-more`** — `report-blocks.js` 의 어느 티어 선언에도 안 물린 죽은 코드. **배선할지 지울지 판정하고 근거를 적으십시오**(설계서에 `last` 블록이 없으면 지우는 쪽이 맞다)
3. **"가장 많이 씀" 배지 노출 조건** — 잠금과 무관하게 보일지 재검토 대상으로 지정돼 있다. 판정하고 근거를 적으십시오

- [ ] **Step 6: `report-purchase` 라우트를 실제 구매 시퀀스까지 확장한다**

Task 1 Step 5 가 세운 라우트는 잠금 때문에 절반만 태웠다. 이제 **구매→19a→8b→draw** 전체를 태운다. `delay` 를 재생시간(19a + 8b 3초 + draw)보다 넉넉히 잡고 그 수의 근거를 주석에 적는다.

- [ ] **Step 7: 전량 + 관문 3회 + 커밋**

관문을 **3회 반복**하십시오 — 새 라우트가 재생을 태우므로 flakiness 가 여기서 처음 드러납니다.

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
cd mobile && node tools/gate-browser.mjs && node tools/gate-browser.mjs && node tools/gate-browser.mjs
cd .. && git add -A mobile/
git commit -m "feat(mobile): 심화·전문 잠금 해제 — PENDING 이 비었다

네 블록이 전부 지어져 tierBuyable()이 full·custom 둘 다 true 를 돌려준다.
CUSTOM = weights + FULL 이고 weights 는 애초에 PENDING 에 없었으므로 전문도 함께 열린다.
이제 사용자가 번 스쿱에 쓸 곳이 생긴다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: 19a 빗 강조 · 8b 세 통 (G2)

조사 C 가 잰 §3.6 대비 미구현 3건. **둘 다 몸통은 완성돼 있고 배선·CSS 규모다.**

**Files:**
- Modify: `mobile/www/progress-analyze.js`(현재 위치 표시)
- Modify: `mobile/www/progress-reveal.js`(세 통)
- Modify: `mobile/www/style-reveal.css`(빗 강조)
- Modify: `mobile/www/screens/report.js:1152-1153`(8b 에 넘기는 값)
- Test: `mobile/test/progress-analyze.test.mjs`(존재) · `mobile/test/progress-reveal.test.mjs`

**Interfaces:**
- Consumes: `MSReportModel.verdict(an) → {dir, agree, dissent, noDir, total}` — **합이 검산돼 있다**(`report-model.js:140-151`)
- Produces: 8b 가 세 통을 받는다

- [ ] **Step 1: 실패하는 시험을 쓴다**

```js
test("8b — 동의·반대·무판정 세 통의 합이 카운터와 같다", () => {
  const dom = renderReveal({ agree: 18, dissent: 6, noDir: 8, total: 32 });
  const txt = deepText(dom.querySelector(".rv-count, .rv-buckets"));
  assert.match(txt, /18/, "동의 수가 없다");
  assert.match(txt, /6/,  "반대 수가 없다");
  assert.match(txt, /8/,  "무판정 수가 없다");
});

test("8b — 세 통의 합이 카운터와 어긋나면 드러난다", () => {
  // verdict() 가 합을 보장하지만, 8b 가 그 함수를 안 쓰고 딴 값을 받으면 어긋난다.
  // 지금이 정확히 그 상태다(engine confluence.agree 하나만 받는다).
  const st = revealState({ agree: 18, dissent: 6, noDir: 8, total: 32 });
  assert.strictEqual(st.agree + st.dissent + st.noDir, st.total,
    "세 통의 합이 카운터와 다르다");
});

test("19a — 지금 읽는 칸이 읽은 칸·대기 칸과 구별된다", () => {
  const dom = renderAnalyzeAt(12, 32);
  assert.ok(dom.querySelector(".an-tooth.an-now"), "현재 위치 표시가 없다");
  assert.strictEqual(dom.querySelectorAll(".an-tooth.an-now").length, 1,
    "현재 위치가 둘 이상이다");
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd mobile && node --test test/progress-reveal.test.mjs test/progress-analyze.test.mjs`

- [ ] **Step 3: 8b 가 `verdict()` 를 쓰게 한다**

지금 `report.js:1152` 가 `verdict.confluence.agree` 하나만 넘긴다. `MSReportModel.verdict(an)` 은 셋을 **합 검산까지 해서** 돌려준다 — 재료가 있는데 안 쓰는 상태다.

- [ ] **Step 4: 19a 현재 위치 · 진하기**

`style-reveal.css:63-66` 의 `.an-tooth` 는 `on`(gold) / 비-on(track) / `an-core`(steel) 3상태뿐이다. **흰 막대**(현재 위치)와 **지난 것 흐려짐**을 더한다.

**주의**: 흐려짐은 **읽은 순서**를 알아야 한다. `progress-analyze.js` 가 지금 그 순서를 들고 있는지 확인하고, 없으면 어떻게 얻을지 정하십시오(인덱스로 충분할 수 있습니다).

- [ ] **Step 5: 통과 + 관문 3회 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
cd mobile && node tools/gate-browser.mjs && node tools/gate-browser.mjs && node tools/gate-browser.mjs
cd .. && git add mobile/www/progress-analyze.js mobile/www/progress-reveal.js mobile/www/style-reveal.css mobile/www/screens/report.js mobile/test/
git commit -m "feat(mobile): 19a 현재 위치 · 8b 세 통 — 재료는 있었고 배선이 없었다

verdict() 가 동의·반대·무판정을 합 검산까지 해서 돌려주는데 8b 는 engine 의
confluence.agree 하나만 받고 있었다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 판독문 반환 타입을 구조로 바꾼다 — 함정 가드를 잃지 않고 (G3)

**G3 는 G1·G2 와 독립이다.** 사용자가 실행 여부를 정한다(위 §판독문 결정).

32개 `SAY` 함수가 `string` 을 반환한다. 3줄(이름+기여도 / 평이한 해석 / **실측 수치**)이려면 구조를 돌려줘야 한다. **진짜 비용은 숫자 추출이 아니라, 조사 B 가 목록화한 함정 14건의 가드가 어느 줄에 속하는지 하나씩 재배치하는 것이다.**

**Files:**
- Modify: `mobile/www/readings.js`(반환 타입 · 대표 지표 이행)
- Test: `mobile/test/readings.test.mjs`

**Interfaces:**
- Produces: `SAY[k](r, ctx) → { plain: string, measured: string }` (거절 시 `{ plain: NONE|NO_VOL|..., measured: "" }`)

- [ ] **Step 1: 규약과 시험을 먼저 세운다**

```js
test("판독문 — 모든 지표가 구조를 돌려준다(문자열이 아니다)", () => {
  Object.keys(MSReadings.SAY).forEach(function (k) {
    const out = callSay(k);   // 실제 엔진 결과로
    assert.strictEqual(typeof out, "object", k + " 가 아직 문자열을 돌려준다");
    assert.strictEqual(typeof out.plain, "string", k + " 에 plain 이 없다");
    assert.strictEqual(typeof out.measured, "string", k + " 에 measured 가 없다");
  });
});

test("판독문 — 거절(NONE·NO_VOL·NO_SWINGS)은 measured 가 비고 plain 이 사유를 담는다", () => {
  const out = callSay("volume", { noVolume: true });
  assert.strictEqual(out.measured, "", "거절인데 실측 줄이 채워졌다");
  assert.ok(out.plain.length > 0, "거절 사유가 없다");
});

test("판독문 — 함정 가드가 살아 있다: 거래량 없는 종목에서 5종이 전부 거절한다", () => {
  // 조사 B-2: volume·vwap·volumeprofile·mfi·cmf 는 거래량이 없으면 엔진이 조용히
  // 대체한다(synthVolume·모든 봉 1). 그 값으로 문장을 쓰면 없는 사실을 말한다.
  ["volume", "vwap", "volumeprofile", "mfi", "cmf"].forEach(function (k) {
    const out = callSay(k, { noVolume: true });
    assert.strictEqual(out.measured, "", k + " 가 거래량 없이 실측을 말했다");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd mobile && node --test test/readings.test.mjs`

- [ ] **Step 3: 반환 타입을 바꾸고 함정 있는 지표부터 이행한다**

**함정이 있는 것부터** 옮긴다(조사 B 목록): `adx` · 거래량 5종 · `elliott` · `cycle` · `roc` · `ao` · `cmf` · `pattern` · `trend` · `structure` · `aroon` · `smc` · `fib` · `ichimoku`.

**각 지표를 옮길 때 그 함수의 주석을 그대로 가져가십시오.** 주석이 근거이고, 근거를 잃으면 다음 사람이 같은 함정에 빠집니다. **주석을 요약하거나 지우지 마십시오.**

- [ ] **Step 4: 통과 확인 + 커밋** (Run: `cd mobile && node --test test/readings.test.mjs`)

```bash
git add mobile/www/readings.js mobile/test/readings.test.mjs
git commit -m "refactor(mobile): 판독문을 해석/실측 두 줄로 가른다 — 함정 가드를 그대로 안고

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: 판독문 화면 3줄 (G3)

**Files:**
- Modify: `mobile/www/screens/readings-list.js`(3줄 렌더 · 헤더 주석 정정)
- Modify: `mobile/www/style-report.css`
- Test: `mobile/test/readings-list.test.mjs`

**Interfaces:**
- Consumes: Task 8 의 `{plain, measured}`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```js
test("판독문 화면 — 지표당 세 줄이다(이름+기여도 / 해석 / 실측)", () => {
  const dom = renderReadingsList();
  const row = dom.querySelector(".rd-row");
  assert.ok(row.querySelector(".rd-head"),  "이름+기여도 줄이 없다");
  assert.ok(row.querySelector(".rd-plain"), "해석 줄이 없다");
  assert.ok(row.querySelector(".rd-meas"),  "실측 줄이 없다");
});

test("판독문 화면 — 방향 없는 둘은 기여도가 대시다(0.00 이 아니다)", () => {
  // 0.00 으로 적으면 "중립"으로 읽히는데 실제로는 방향을 물을 수 없는 지표다.
  const dom = renderReadingsList();
  ["trend", "phasefold"].forEach(function (k) {
    const row = dom.querySelector("[data-ind='" + k + "']");
    assert.ok(row, k + " 행이 없다");
    assert.match(deepText(row.querySelector(".rd-head")), /—/, k + " 기여도가 대시가 아니다");
  });
});

test("판독문 화면 — 실측 줄이 빈 지표는 그 줄을 아예 안 그린다(빈 칸을 남기지 않는다)", () => {
  const dom = renderReadingsList({ noVolume: true });
  const row = dom.querySelector("[data-ind='volume']");
  assert.strictEqual(row.querySelector(".rd-meas"), null,
    "거절인데 빈 실측 줄이 남았다");
});
```

- [ ] **Step 2~4: 실패 확인 → 구현 → 통과 확인 + 관문**

`readings-list.js` 헤더의 "2줄이다 … 사용자 확인 대기 항목" 주석을 **지금 상태에 맞게 정정**하십시오 — 안 고치면 다음 사람이 이미 끝난 일을 대기 항목으로 읽습니다.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh && cd mobile && node tools/gate-browser.mjs
cd .. && git add mobile/www/screens/readings-list.js mobile/www/style-report.css mobile/test/
git commit -m "feat(mobile): 판독문 32 — 시안 20a 의 세 줄 구조

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: 마감 — 문서 · 스코어카드 · APK

**Files:**
- Modify: `mobile/docs/rebuild/PROGRESS.md`(P1b 완료 · 다음 한 걸음 · 이월)
- Modify: `map/docs/superpowers/specs/2026-08-18-moneyscoop-p1-design.md`(§3.5 정정 반영 여부 · P1b 완료 표시)
- Modify: `map/forge-scorecard.html`(`PRODUCTS`·`PRODUCTS_ASOF` — 웹↔모바일 비교표)

- [ ] **Step 1: `forge-scorecard.html` 의 웹↔모바일 비교표를 갱신한다**

`map/CLAUDE.md §⓪` 불변 규율 6번: **모바일 개편 페이즈가 끝날 때마다** 그 표를 갱신한다. 이번 라운드가 바꾼 것 — 유료 티어가 열렸다(정보의 **양**이 단계로 갈리는 구조가 실제로 작동하기 시작).

- [ ] **Step 2: `PROGRESS.md` 갱신** — P1b 완료 · 다음 한 걸음(P1c 는 F 조사상 사실상 함께 열렸으므로 **무엇이 남았는지 실제로 확인하고 적을 것**) · 이 계획이 남긴 이월

- [ ] **Step 3: APK 빌드 + 웹 미리보기 갱신**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile
npm run sync
# 웹 미리보기: mobile/www/ → cafe24 www/map/dl-a280f1cd1ee8/app/ (mirror -R --delete)
```

`mobile/docs/ANDROID-BUILD.md` 의 절차를 따르십시오. **`mobile/` 은 cafe24 에 안 올라갑니다** — 올라가는 것은 웹 미리보기 경로뿐입니다.

- [ ] **Step 4: 전량 + 관문 3회 + 커밋 + 푸시**

---

## Self-Review

**1. 스펙 커버리지**

| 설계서 | 태스크 |
|---|---|
| §3.5 심화 8블록 | Task 3(sentence)·4(forecast)·5(hitrate)·6(compare). `dissent`·`horizons`·`readings`·`chart` 는 **이미 구현돼 있고 PENDING 에 없다**(조사 A) — 새 태스크 불필요 |
| §3.5 "직전 상태를 위에 남긴다" + 폭 전제 정정 | Task 6 Step 1·2 |
| §3.5 적중률 범위 주석 필수 | Task 5 Step 2 |
| §3.6 19a·8b | Task 7 (미구현 3건만 — 몸통은 완성) |
| §3.7 전문 | **별도 태스크 없음** — 조사 F: `weights` 는 PENDING 에 없고 `expert.js` 슬라이더(0.1~3.0)도 이미 구현. Task 6 이 PENDING 을 비우면 함께 열린다. Task 6 Step 4 가 `custom` 도 단언한다 |
| §3.8 판독문 32 | Task 8·9 (G3) |
| §4 조건 4 관문 errs | Task 1 |
| §5 규율 | Global Constraints |

**2. 플레이스홀더 스캔** — Task 3 Step 3 의 `overheat()`/`resistance()` 본문은 의도적으로 비워 뒀다. **Task 2 의 측정 결과가 그 내용이기 때문이다** — 지금 값을 적으면 측정 전에 답을 정하는 것이 된다. 그 외 "TBD"·"적절히 처리" 류 없음.

**3. 타입 일관성** — `MSReportModel.hitRate(summary, regime) → {right,wrong,n,series,baseline}|null`(Task 5), `verdict(an) → {dir,agree,dissent,noDir,total}`(Task 7), `SAY[k](r,ctx) → {plain,measured}`(Task 8→9). Task 6 이 도입하는 `data-block` 속성은 Task 6 Step 4 에서만 쓰인다.

**4. 남은 위험**

- **Task 2 가 "쓸 만한 정의가 없다"를 낼 수 있다.** 그러면 Task 3 은 「한 문장으로」를 방향 한 줄로만 내고 두 절을 포기해야 한다 — 그것도 정직한 결과다. 그 경우 설계서 §3.5 의 "방향·과열·저항선 세 값" 문구를 실측으로 정정한다(P4 에서 "절반으로 좁아진다" 전제를 정정한 것과 같은 절차)
- **Task 6 이 잠금을 푸는 순간 지갑 spend 경로가 처음으로 실사용된다.** `wallet.js` 의 `slot` COST 가 지금까지 어디서도 spend 되지 않았다(P1a 리뷰 기록). 그 경로가 실제로 도는지 Task 6 Step 6 의 라우트가 태워야 한다
- **Task 8 이 가장 크다.** 32개 함수 × 함정 14건 재배치. 리뷰가 "둘로 잘랐어야 한다"고 판단하면 **분할이 정답**이며, 그 판정을 원장에 남기고 Task 9 경계를 조정한다
