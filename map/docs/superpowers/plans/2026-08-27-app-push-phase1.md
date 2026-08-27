# FCM 푸시 Phase 1 구현 플랜 — 확신도 게이트 · 인앱 하이라이트 · 스캐너 · 등록부

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱이 꺼져 있어도 관심종목의 "엔진이 강하게 동의하는" 시그널을 하루 한 번 전달할 수 있는 배선(게이트·스캐너·등록부·발송로그)을 Firebase 없이 전부 완성하고, 그 게이트를 **앱 안 '엔진 확신' 하이라이트**로 즉시 사용자 가치로 만든다.

**Architecture:** 감지(`app-signals.detect`)와 판정(`app-engine.analyze`)은 이미 있는 원본을 **그대로** 쓴다 — 새 분석 구현 0. 그 둘을 잇는 순수 함수 `rankSignal(sig, verdict)` 하나를 추가해 **앱과 외부 node 스캐너가 같은 함수를 호출**한다(드리프트 원천 차단). 서버(`app-push-lib.php`)는 감지 결과를 저장하지 않고 **등록부 + 발송로그**만 갖는다(감지는 봉 위 결정적 함수라 앱이 재현한다). 실제 FCM 발송은 자격증명(`app_fcm.json`) 부재로 자연히 꺼져 있다 — Phase 2에서 파일 하나로 켜진다.

**Tech Stack:** 바닐라 JS(UMD, ES2017 하한) · node 22 `node --test` · ESM(`.mjs`, 스캐너만) · PHP 8 + PDO SQLite · 빌드 도구 없음

**Spec:** `map/docs/superpowers/specs/2026-08-26-app-push-signals-design.md` (승인 2026-08-26)

## Global Constraints

- **엔진 단일 원본(§②)**: `forge-core.js`·`app-signals.js`·`app-engine.js`를 **원본 require**. 사본·PHP 재구현 금지. `rankSignal`은 엔진 출력을 *읽기만* 하고 판정·확률을 바꾸지 않는다.
- **정책 숫자는 `app-config.js` `POLICY`만**. 화면·라이브러리·스캐너에 리터럴 임계값 금지(`MS.config.POLICY.signal.*`).
- **문법 하한 ES2017**(`app/syntax-floor.test.js`가 옵셔널 체이닝·null 병합·`Object.hasOwn` 등을 금지). `app/**`는 classic script + UMD, `defer`/`async` 금지, 로드 순서 고정.
- **관문**: `cd map && ./tests/run.sh` — **착수 시점 기준선 970건 전체 통과**. 새 스위트는 여기에 편입한다. 서버 파일을 만졌으므로 배포 전 `./tests/run.sh concurrency`는 **불필요**(wallet-lib 미수정 — 만졌다면 필수).
- **데이터 불가침**: `<data>/app_push.db`·`app_scan_key.txt`·`app_fcm.json`은 서버 생성물·자격증명 — 배포 시 절대 업로드/덮어쓰기 금지.
- **정직 표기**: 푸시·하이라이트 문구는 실측 근거(시그널 why + 엔진 확신)만. 통계·표본 수를 지어내지 않는다.
- **좌측 컬러 라인 금지**(전역 디자인 규율): 강조는 배경·텍스트·배지로만.
- **커밋 스코프 `app`**, 다중 태스크이므로 **브랜치 작업 → `merge:` 커밋**(§③).
- 작업 디렉토리는 `map/`. git 저장소 루트는 그 상위이므로 커밋 경로는 `map/...`.
- ⚠ 작업 시작 시 `map/forge-engine.html`에 **레인 A(엔진 백서)의 미커밋 변경**이 있다. 이 플랜은 그 파일을 건드리지 않으며 커밋에 포함하지 않는다(`git add`에 개별 경로만 쓸 것 — `git add -A` 금지).

---

## 확정 계약 (이 플랜이 정하는 것 — 설계서 §4.1·§8 미결의 해소)

**시그널 확신도 판정(verdict) 계약** — 앱·스캐너가 동일해야 하므로 여기서 못박는다:

| 항목 | 값 | 이유 |
|---|---|---|
| 판정 함수 | `MS.engine.analyze({symbol, tfKo:"일", tier:"basic", candles})` → `.verdict` | 앱·스캐너가 **같은 함수**를 호출(사본 0). `app-engine.js`는 UMD라 node에서 `require` 가능 — 이미 `app-engine.test.js`가 node로 돌고 있다. |
| 티어 | `"basic"`(Lv1 5지표) | 무과금·경량. 12종목을 앱 안에서 백그라운드로 돌 수 있는 유일한 티어(심화 32종은 종목당 수 초). |
| 봉 | **전량 이력**(`lite` 아님) | 판정·목표가는 이력 길이에 따라 달라진다는 실측(PROGRESS 2026-08-25 봉 전송 정책). 앱이 경량 60봉으로 판정하면 스캐너와 다른 답이 나온다. |
| 타임프레임 | `"일"` | 시그널 감지 단위가 일봉. |

`POLICY.signal.verdictTier`가 이 값의 단일 출처다(리모트 컨피그 대상).

---

## File Structure

| 파일 | 신규/수정 | 책임 |
|---|---|---|
| `map/app/app-config.js` | 수정 | `POLICY.signal` 신설(conv·pushCap·pushHourKST·verdictTier) |
| `map/app/app-signals.js` | 수정 | `rankSignal(sig, verdict, opts)` 공유 게이트 추가 · UMD에 config 주입 |
| `map/app/app-signals.test.js` | 수정 | rankSignal 테스트 |
| `map/scan/scan-core.mjs` | 신규 | 순수 로직: 종목 합집합 · 디바이스별 선별/캡 · 다이제스트 문구 |
| `map/scan/scan-core.test.mjs` | 신규 | 위 순수 로직 테스트(실 rankSignal 경유) |
| `map/scan/scanner.mjs` | 신규 | 배선: registry fetch → OHLC → detect → analyze → push_send |
| `map/scan/scanner.config.sample.json` | 신규 | 설정 템플릿(실 config는 gitignore) |
| `map/scan/README.md` | 신규 | 스캐너 실행·cron 절차 |
| `map/app-push-lib.php` | 신규 | 등록부·발송로그 SQLite · 스캐너 키 · FCM HTTP v1 발송(자격증명 게이트) |
| `map/app-api.php` | 수정 | `push_register`(앱) / `scan_registry`·`push_send`(스캐너 키) 디스패치 |
| `map/tests/app-push.test.php` | 신규 | 등록 upsert · 키 인증 · 하루 1회 멱등 · 킬스위치 |
| `map/tests/run.sh` | 수정 | `scan`·`app-push` 스위트 편입 |
| `map/app/app-push.js` | 신규 | 등록 송신 · 인앱 확신도 랭킹(캐시) |
| `map/app/app-screen-signal.js` | 수정 | '엔진 확신' 하이라이트·우선 정렬·푸터 문구 |
| `map/app/index.html` | 수정 | `app-push.js` 로드(순서: signals 뒤, ui 앞) |
| `map/.gitignore` | 수정 | `scan/scanner.config.json` |
| `map/docs/design-v2/LAUNCH.md` · `PROGRESS.md` | 수정 | FCM 절 갱신·세션 로그 |

---

### Task 1: 확신도 게이트 `rankSignal` (공유 순수함수)

**Files:**
- Modify: `map/app/app-config.js` (POLICY에 `signal` 블록 추가 — `limits` 블록 바로 뒤)
- Modify: `map/app/app-signals.js` (UMD 팩토리 시그니처 + `rankSignal` + export)
- Test: `map/app/app-signals.test.js` (기존 파일에 append)

**Interfaces:**
- Consumes: `MS.config.POLICY`(브라우저), `require("./app-config.js")`(node)
- Produces:
  - `POLICY.signal = { conv: number, pushCap: number, pushHourKST: number, verdictTier: string }`
  - `MS.signals.rankSignal(sig, verdict, opts) -> { important: boolean, aligned: boolean, score: number }`
    - `sig`: `detect()` 산출 1건(`{sym, rule, group, dir, barT, key, title, d, why, mean}`), 쓰는 필드는 `dir`뿐
    - `verdict`: `{ regime: "bull"|"bear"|"neutral", prob: number /* 0~100 */ }`
    - `opts`: `{ conv?: number }` — 생략 시 `POLICY.signal.conv`
    - `score` = 정렬 시 `|prob-50|/50` ∈ [0,1], 미정렬이면 0

- [ ] **Step 1: `POLICY.signal` 블록 추가**

`map/app/app-config.js`의 `limits: { ... },` 블록 **바로 다음 줄**에 삽입한다(`persona:` 블록 앞):

```js
    // 시그널 확신도 게이트·푸시(설계서 2026-08-26 §4.1). limits.signal(보관·페이지)과 다른 축이다 —
    // 여기는 '무엇을 중요하다고 볼 것인가'. 전부 리모트 컨피그 대상(§15).
    signal: {
      conv: 0.30,            // |prob-50|/50 ≥ conv 면 확신(0.30 = 상승확률 65% 이상 또는 35% 이하)
      pushCap: 3,            // 디바이스 하루 푸시 최대 건수
      pushHourKST: 7,        // 다이제스트 발송 시각(스캐너 cron 기준 — 서버는 강제하지 않는다)
      verdictTier: "basic"   // 확신도 판정 티어 — 앱·스캐너 공통(사본 없음). 전량 이력·일봉 고정
    },
```

- [ ] **Step 2: 실패하는 테스트 작성**

`map/app/app-signals.test.js` 맨 아래에 append:

```js
// ── 확신도 게이트(rankSignal) — 앱 하이라이트와 스캐너 푸시 선별이 같은 함수를 쓴다 ──
// 기대값은 설계서 §4.1에서 직접 계산한다(구현 상수 재사용 금지):
// strength = |prob-50|/50, 기본 문턱 conv=0.30 → prob 65 이상 / 35 이하가 확신.
test("rankSignal: 상승 시그널 + 강한 상승 판정 = 중요", () => {
  const r = signals.rankSignal({ dir: 1 }, { regime: "bull", prob: 70 });
  assert.equal(r.aligned, true);
  assert.equal(r.important, true);
  assert.equal(Math.round(r.score * 100) / 100, 0.4);
});

test("rankSignal: 상승 시그널 + 하락 국면 = 미정렬(중요 아님·score 0)", () => {
  const r = signals.rankSignal({ dir: 1 }, { regime: "bear", prob: 20 });
  assert.equal(r.aligned, false);
  assert.equal(r.important, false);
  assert.equal(r.score, 0);
});

test("rankSignal: 정렬돼도 확신이 약하면 중요 아님", () => {
  const r = signals.rankSignal({ dir: 1 }, { regime: "bull", prob: 58 });
  assert.equal(r.aligned, true);
  assert.equal(r.important, false);   // strength 0.16 < 0.30
});

test("rankSignal: 하락 시그널은 하락 국면과 정렬", () => {
  assert.equal(signals.rankSignal({ dir: -1 }, { regime: "bear", prob: 30 }).important, true);
  assert.equal(signals.rankSignal({ dir: -1 }, { regime: "bull", prob: 80 }).important, false);
});

test("rankSignal: 국면 중립이면 확률 방향으로 정렬 판정", () => {
  assert.equal(signals.rankSignal({ dir: 1 }, { regime: "neutral", prob: 68 }).aligned, true);
  assert.equal(signals.rankSignal({ dir: 1 }, { regime: "neutral", prob: 32 }).aligned, false);
});

test("rankSignal: 방향 없는 룰(거래량·변동성)은 어느 쪽이든 강한 방향관이면 중요", () => {
  assert.equal(signals.rankSignal({ dir: 0 }, { regime: "bear", prob: 25 }).important, true);
  assert.equal(signals.rankSignal({ dir: 0 }, { regime: "neutral", prob: 52 }).important, false);
});

test("rankSignal: 판정이 없으면(엔진 실패) 중요 아님 — 지어내지 않는다", () => {
  assert.equal(signals.rankSignal({ dir: 1 }, null).important, false);
  assert.equal(signals.rankSignal({ dir: 1 }, { regime: "bull" }).important, false);
});

test("rankSignal: 문턱은 POLICY.signal.conv — opts.conv 로 덮어쓸 수 있다", () => {
  assert.equal(require("./app-config.js").POLICY.signal.conv, 0.30);
  assert.equal(signals.rankSignal({ dir: 1 }, { regime: "bull", prob: 58 }, { conv: 0.1 }).important, true);
});
```

파일 상단에 `signals`가 어떤 이름으로 require 돼 있는지 먼저 확인하고(`const signals = require("./app-signals.js");` 형태) 다르면 그 이름을 쓴다.

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd map/app && node --test app-signals.test.js
```
Expected: FAIL — `signals.rankSignal is not a function`

- [ ] **Step 4: 구현**

`map/app/app-signals.js` UMD 헤더를 config 주입으로 바꾼다(기존 3줄 교체):

```js
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("../forge-core.js"), require("./app-config.js"));
  else { root.MS = root.MS || {}; root.MS.signals = factory(root.ForgeCore, root.MS.config); }
})(typeof self !== "undefined" ? self : this, function (core, config) {
```

`scan()` 함수 **바로 앞**에 추가:

```js
  // 확신도 게이트(설계서 2026-08-26 §4.1) — 감지된 시그널이 '중요'한가를 엔진 판정으로 가른다.
  // 앱(인앱 하이라이트)과 외부 스캐너(푸시 선별)가 이 함수 하나를 공유한다 — 두 번 구현하면 드리프트한다.
  // 엔진 판정·확률을 바꾸지 않는다(§② 불변) — 읽어서 분류만 한다.
  function rankSignal(sig, verdict, opts) {
    const conv = (opts && typeof opts.conv === "number") ? opts.conv
      : (config && config.POLICY.signal ? config.POLICY.signal.conv : 0.3);
    const p = (verdict && typeof verdict.prob === "number" && isFinite(verdict.prob)) ? verdict.prob : null;
    if (p === null) return { important: false, aligned: false, score: 0 };   // 판정 없음 = 중요 아님(지어내지 않는다)
    const strength = Math.min(1, Math.abs(p - 50) / 50);
    const dir = sig && typeof sig.dir === "number" ? sig.dir : 0;
    const side = p > 50 ? 1 : p < 50 ? -1 : 0;
    const regSide = verdict.regime === "bull" ? 1 : verdict.regime === "bear" ? -1 : 0;
    // 방향 있는 룰: 국면이 서면 국면과, 국면이 중립이면 확률 방향과 일치해야 정렬.
    // 방향 없는 룰(거래량 급증·변동성 확대): 방향관이 강하기만 하면 중요(어느 쪽으로든 결정 국면).
    const aligned = dir === 0 ? true : (regSide === 0 ? side === dir : regSide === dir);
    return { important: aligned && strength >= conv, aligned: aligned, score: aligned ? strength : 0 };
  }
```

맨 아래 반환문 교체:

```js
  return { detect: detect, scan: scan, rankSignal: rankSignal, TH: TH };
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd map/app && node --test app-signals.test.js && cd .. && ./tests/run.sh app
```
Expected: 전부 PASS(app 스위트가 88 → 96건). 브라우저 로드 순서는 이미 config(25행) → signals(31행)이라 안전하다.

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/app/app-config.js map/app/app-signals.js map/app/app-signals.test.js
git commit -m "feat(app): 시그널 확신도 게이트 rankSignal — 앱·스캐너 공유 순수함수

$(printf '')"
```
커밋 메시지 본문에 `POLICY.signal(conv 0.30·pushCap 3·pushHourKST 7·verdictTier basic) 신설. 설계서 2026-08-26 §4.1.` 을 넣는다.

---

### Task 2: 스캐너 순수 로직 `scan-core.mjs`

**Files:**
- Create: `map/scan/scan-core.mjs`
- Test: `map/scan/scan-core.test.mjs`
- Modify: `map/tests/run.sh`

**Interfaces:**
- Consumes: `MS.signals.rankSignal`(Task 1) — `createRequire`로 원본 로드
- Produces (모두 named export):
  - `symbolUnion(registry) -> string[]` — `registry`는 `[{device, picks:string[], on:boolean}]`, 결과는 중복 제거·사전순
  - `pickImportant(entry, signalsBySym, verdictBySym, opts) -> [{sig, score}]` — `opts:{conv, cap}`, score 내림차순·상위 cap
  - `digestText(items) -> { title: string, body: string }`
  - `buildSends(registry, signalsBySym, verdictBySym, opts) -> [{device, title, body, data:{day, keys:string[]}}]` — `opts:{conv, cap, day}`, 중요 0건 디바이스는 제외

- [ ] **Step 1: 실패하는 테스트 작성**

`map/scan/scan-core.test.mjs`:

```js
// scan-core — 스캐너 순수 로직. 엔진·네트워크 없이 도는 부분만 여기서 검증한다.
// 게이트는 실제 app-signals.rankSignal 을 경유한다(사본 금지 — 설계서 §7).
import { test } from "node:test";
import assert from "node:assert";
import { symbolUnion, pickImportant, digestText, buildSends } from "./scan-core.mjs";

const REG = [
  { device: "d1", picks: ["NVDA", "TSLA"], on: true },
  { device: "d2", picks: ["TSLA", "AAPL"], on: true }
];
const sig = (sym, rule, dir, title) => ({ sym, rule, dir, title, barT: "2026-08-27", key: sym + "|" + rule + "|2026-08-27" });

test("symbolUnion: 디바이스 종목 합집합(중복 제거·사전순)", () => {
  assert.deepEqual(symbolUnion(REG), ["AAPL", "NVDA", "TSLA"]);
});

test("symbolUnion: 종목 없는 등록은 무시", () => {
  assert.deepEqual(symbolUnion([{ device: "x", picks: [], on: true }, { device: "y", picks: null, on: true }]), []);
});

test("pickImportant: 게이트 통과분만·확신 강한 순", () => {
  const sigs = {
    NVDA: [sig("NVDA", "vol_surge", 0, "거래량 평균의 2.4배")],
    TSLA: [sig("TSLA", "ma20_up", 1, "20일선 상향 돌파")]
  };
  const verdicts = { NVDA: { regime: "bull", prob: 66 }, TSLA: { regime: "bull", prob: 84 } };
  const got = pickImportant(REG[0], sigs, verdicts, { conv: 0.3, cap: 3 });
  assert.deepEqual(got.map((x) => x.sig.sym), ["TSLA", "NVDA"]);   // 0.68 > 0.32
});

test("pickImportant: 미정렬·약한 확신은 탈락", () => {
  const sigs = { NVDA: [sig("NVDA", "ma20_up", 1, "20일선 상향 돌파")], TSLA: [sig("TSLA", "gap", -1, "갭 하락 3.1%")] };
  const verdicts = { NVDA: { regime: "bull", prob: 55 }, TSLA: { regime: "bull", prob: 90 } };
  assert.equal(pickImportant(REG[0], sigs, verdicts, { conv: 0.3, cap: 3 }).length, 0);
});

test("pickImportant: 디바이스 하루 캡", () => {
  const sigs = { NVDA: [sig("NVDA", "a", 1, "A"), sig("NVDA", "b", 1, "B"), sig("NVDA", "c", 1, "C")] };
  const verdicts = { NVDA: { regime: "bull", prob: 90 } };
  assert.equal(pickImportant({ device: "d", picks: ["NVDA"], on: true }, sigs, verdicts, { conv: 0.3, cap: 2 }).length, 2);
});

test("pickImportant: 판정 없는 종목은 통째로 탈락(엔진 실패 시 지어내지 않는다)", () => {
  const sigs = { NVDA: [sig("NVDA", "ma20_up", 1, "20일선 상향 돌파")] };
  assert.equal(pickImportant(REG[0], sigs, {}, { conv: 0.3, cap: 3 }).length, 0);
});

test("digestText: 실제 감지 제목만 · 건수 정직", () => {
  const items = [{ sig: sig("TSLA", "ma20_up", 1, "20일선 상향 돌파"), score: 0.68 },
    { sig: sig("NVDA", "vol_surge", 0, "거래량 평균의 2.4배"), score: 0.32 }];
  const d = digestText(items);
  assert.equal(d.title, "오늘 주목할 신호 2건");
  assert.equal(d.body, "TSLA 20일선 상향 돌파 · NVDA 거래량 평균의 2.4배");
});

test("digestText: 1건이면 종목·제목을 제목에 그대로", () => {
  const d = digestText([{ sig: sig("TSLA", "ma20_up", 1, "20일선 상향 돌파"), score: 0.68 }]);
  assert.equal(d.title, "TSLA 20일선 상향 돌파");
  assert.ok(d.body.indexOf("엔진") >= 0);
});

test("buildSends: 중요 0건 디바이스는 발송 대상에서 빠진다", () => {
  const sigs = { TSLA: [sig("TSLA", "ma20_up", 1, "20일선 상향 돌파")] };
  const verdicts = { TSLA: { regime: "bull", prob: 84 } };
  const sends = buildSends(REG, sigs, verdicts, { conv: 0.3, cap: 3, day: "2026-08-27" });
  assert.equal(sends.length, 2);           // 둘 다 TSLA 를 담고 있다
  assert.equal(sends[0].device, "d1");
  assert.deepEqual(sends[0].data.keys, ["TSLA|ma20_up|2026-08-27"]);
  assert.equal(sends[0].data.day, "2026-08-27");

  const none = buildSends([{ device: "d3", picks: ["MSFT"], on: true }], sigs, verdicts, { conv: 0.3, cap: 3, day: "2026-08-27" });
  assert.equal(none.length, 0);
});

test("buildSends: 알림 끈 디바이스는 제외", () => {
  const sigs = { TSLA: [sig("TSLA", "ma20_up", 1, "20일선 상향 돌파")] };
  const verdicts = { TSLA: { regime: "bull", prob: 84 } };
  assert.equal(buildSends([{ device: "off", picks: ["TSLA"], on: false }], sigs, verdicts,
    { conv: 0.3, cap: 3, day: "2026-08-27" }).length, 0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd map/scan && node --test scan-core.test.mjs
```
Expected: FAIL — `Cannot find module .../scan-core.mjs`

- [ ] **Step 3: 구현**

`map/scan/scan-core.mjs`:

```js
// 머니스쿱 시그널 스캐너 — 순수 로직(네트워크·엔진 배선 없음).
// 감지(app-signals.detect)와 판정(app-engine.analyze)은 호출자가 넘긴다. 여기서 하는 일은
// '누구에게 무엇을 보낼지' 뿐 — 게이트는 앱과 공유하는 rankSignal 원본을 그대로 쓴다(설계서 §7).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signals = require("../app/app-signals.js");

export function symbolUnion(registry) {
  const seen = Object.create(null);
  (registry || []).forEach(function (e) {
    (e && Array.isArray(e.picks) ? e.picks : []).forEach(function (s) {
      if (typeof s === "string" && s) seen[s] = 1;
    });
  });
  return Object.keys(seen).sort();
}

export function pickImportant(entry, signalsBySym, verdictBySym, opts) {
  const conv = opts && typeof opts.conv === "number" ? opts.conv : undefined;
  const cap = opts && typeof opts.cap === "number" ? opts.cap : 3;
  const picks = entry && Array.isArray(entry.picks) ? entry.picks : [];
  const out = [];
  picks.forEach(function (sym) {
    const list = (signalsBySym && signalsBySym[sym]) || [];
    const verdict = verdictBySym ? verdictBySym[sym] : null;
    if (!verdict) return;                       // 판정 실패 종목은 통째로 제외
    list.forEach(function (sig) {
      const r = signals.rankSignal(sig, verdict, conv === undefined ? null : { conv: conv });
      if (r.important) out.push({ sig: sig, score: r.score });
    });
  });
  out.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.sig.key < b.sig.key ? -1 : a.sig.key > b.sig.key ? 1 : 0;   // 결정적 정렬(같은 점수)
  });
  return out.slice(0, cap);
}

// 다이제스트 문구 — 실제 감지 제목만 쓴다(지어내지 않는다).
export function digestText(items) {
  const n = items.length;
  if (n === 1) {
    return { title: items[0].sig.sym + " " + items[0].sig.title,
      body: "엔진 판정과 같은 방향으로 붙은 신호예요 · 앱에서 근거를 확인하세요" };
  }
  return { title: "오늘 주목할 신호 " + n + "건",
    body: items.map(function (x) { return x.sig.sym + " " + x.sig.title; }).join(" · ") };
}

export function buildSends(registry, signalsBySym, verdictBySym, opts) {
  const day = (opts && opts.day) || "";
  const sends = [];
  (registry || []).forEach(function (e) {
    if (!e || e.on === false) return;
    const items = pickImportant(e, signalsBySym, verdictBySym, opts);
    if (!items.length) return;
    const t = digestText(items);
    sends.push({ device: e.device, title: t.title, body: t.body,
      data: { day: day, keys: items.map(function (x) { return x.sig.key; }) } });
  });
  return sends;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd map/scan && node --test scan-core.test.mjs
```
Expected: PASS 10건

- [ ] **Step 5: run.sh 에 스위트 편입**

`map/tests/run.sh`에서 `app-shell` 스위트 줄 **바로 아래**에 추가(같은 `app` 스코프 블록 안):

```bash
  run_suite "scan"        "$ROOT/scan" bash -c 'node --test ./*.test.mjs'   # 시그널 스캐너 순수 로직(푸시 Phase 1)
```

- [ ] **Step 6: 관문 통과 확인**

```bash
cd map && ./tests/run.sh
```
Expected: 전체 통과, 합계 980건(970 + rankSignal 8 + scan-core 10에서 스위트 편입분 반영 — 정확한 수치는 출력으로 확인하고 이후 문서에 그 값을 쓴다)

- [ ] **Step 7: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/scan/scan-core.mjs map/scan/scan-core.test.mjs map/tests/run.sh
git commit -m "feat(app): 스캐너 순수 로직 scan-core — 종목 합집합·확신 선별·다이제스트"
```

---

### Task 3: 서버 등록부 · 발송로그 `app-push-lib.php`

**Files:**
- Create: `map/app-push-lib.php`
- Modify: `map/app-api.php` (스캐너 ops는 device 검증 **앞**, 앱 op는 기존 디스패치 안)
- Test: `map/tests/app-push.test.php`
- Modify: `map/tests/run.sh`

**Interfaces:**
- Produces (PHP 전역 함수):
  - `pl_db($dir) -> PDO` — `<data>/app_push.db` 열기·마이그레이션
  - `pl_register($db, $device, $p, $now) -> array{ok:true}` — `$p = ["token"=>?string, "picks"=>string[], "on"=>bool]`
  - `pl_registry($db) -> array` — `[["device"=>..,"token"=>..,"picks"=>[..],"on"=>true], ...]` (on=1만)
  - `pl_send($db, $sends, $now, $sender = null) -> array{sent:int, skipped:int, queued:int, results:array}` — `$sends`는 `[["device"=>..,"title"=>..,"body"=>..,"data"=>array], ...]`. `$sender`가 null이면 발송 안 하고 `queued`
  - `pl_scan_key($dir) -> ?string` — 파일 없으면 null(fail-closed)
  - `pl_fcm_conf($dir) -> ?array` — `app_fcm.json` 없으면 null(킬스위치)
- API ops: `push_register`(앱, device 필요) · `scan_registry`·`push_send`(`X-Scan-Key` 헤더)

- [ ] **Step 1: 실패하는 테스트 작성**

`map/tests/app-push.test.php`:

```php
<?php
// 앱 푸시 등록부·발송로그(Phase 1) 단위 테스트.
// 기대값은 설계서(2026-08-26 §4.3)에서 직접 — 구현 상수 재사용 금지.
require_once __DIR__ . "/../app-push-lib.php";

$PASS = 0; $FAIL = 0;
function ok($cond, $name) {
  global $PASS, $FAIL;
  if ($cond) { $PASS++; }
  else { $FAIL++; echo "not ok - ", $name, "\n"; }
}

$dir = sys_get_temp_dir() . "/ap_test_" . getmypid();
@mkdir($dir, 0700, true);
@unlink($dir . "/app_push.db");
$db = pl_db($dir);
$NOW = 1756000000;   // 2026-08-24 KST 기준 고정 시각(Date 의존 제거)

// ── 등록부 ──
pl_register($db, "devA", array("token" => "tokA", "picks" => array("NVDA", "TSLA"), "on" => true), $NOW);
$reg = pl_registry($db);
ok(count($reg) === 1 && $reg[0]["device"] === "devA", "register: 1행 생성");
ok($reg[0]["picks"] === array("NVDA", "TSLA"), "register: 종목 그대로 보관");
ok($reg[0]["token"] === "tokA", "register: 토큰 보관");

pl_register($db, "devA", array("token" => "tokA2", "picks" => array("AAPL"), "on" => true), $NOW + 60);
$reg = pl_registry($db);
ok(count($reg) === 1 && $reg[0]["picks"] === array("AAPL") && $reg[0]["token"] === "tokA2", "register: 같은 기기는 upsert(행 안 늘어남)");

pl_register($db, "devB", array("token" => null, "picks" => array("MSFT"), "on" => true), $NOW);
ok(count(pl_registry($db)) === 2, "register: 토큰 없이도 등록된다(웹·권한 미허용)");

pl_register($db, "devB", array("token" => null, "picks" => array("MSFT"), "on" => false), $NOW + 1);
$reg = pl_registry($db);
ok(count($reg) === 1 && $reg[0]["device"] === "devA", "registry: 알림 끈 기기는 빠진다");

// ── 발송(자격증명 없음 = 큐만) ──
$sends = array(array("device" => "devA", "title" => "오늘 주목할 신호 2건", "body" => "AAPL 갭 상승 3.1%", "data" => array("day" => "2026-08-24")));
$r = pl_send($db, $sends, $NOW, null);
ok($r["queued"] === 1 && $r["sent"] === 0, "send: 자격증명 없으면 발송 안 하고 큐 기록(킬스위치)");

$r2 = pl_send($db, $sends, $NOW + 120, null);
ok($r2["skipped"] === 1 && $r2["queued"] === 0, "send: 같은 날 재실행은 멱등(하루 1회)");

$r3 = pl_send($db, array(array("device" => "devA", "title" => "다음날", "body" => "x", "data" => array("day" => "2026-08-25"))), $NOW + 86400, null);
ok($r3["queued"] === 1, "send: 날이 바뀌면 다시 보낸다");

// ── 실발송 경로(주입된 sender) ──
$calls = array();
$sender = function ($token, $title, $body, $data) use (&$calls) { $calls[] = array($token, $title); return true; };
$r4 = pl_send($db, array(array("device" => "devA", "title" => "T", "body" => "B", "data" => array("day" => "2026-08-26"))), $NOW + 172800, $sender);
ok($r4["sent"] === 1 && count($calls) === 1 && $calls[0][0] === "tokA2", "send: sender 주입 시 해석된 토큰으로 발송");

$r5 = pl_send($db, array(array("device" => "nosuch", "title" => "T", "body" => "B", "data" => array("day" => "2026-08-26"))), $NOW + 172800, $sender);
ok($r5["sent"] === 0, "send: 등록 안 된 기기는 발송하지 않는다");

// ── 게이트 파일 ──
ok(pl_scan_key($dir) === null, "scanKey: 파일 없으면 null(fail-closed)");
file_put_contents($dir . "/app_scan_key.txt", "  s3cret\n");
ok(pl_scan_key($dir) === "s3cret", "scanKey: 공백·개행 제거");
ok(pl_fcm_conf($dir) === null, "fcm: app_fcm.json 없으면 null(푸시 전체 꺼짐)");

echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd map && php tests/app-push.test.php
```
Expected: FAIL — `Failed opening required '.../app-push-lib.php'`

- [ ] **Step 3: 구현 — `map/app-push-lib.php`**

```php
<?php
// 머니스쿱 앱 — 푸시 등록부·발송로그(설계서 2026-08-26 Phase 1).
// 규율: 웹루트 밖 SQLite · 서버는 '감지 시그널'을 저장하지 않는다(감지는 봉 위 결정적 함수라
// 앱이 재현한다 — 서버의 고유 가치는 닫힌 앱에 닿는 것 하나뿐) · 실발송은 자격증명이 있을 때만.
// 하루 1회 캡은 발송로그의 unique(device, day)가 강제한다(스캐너가 두 번 돌아도 재발송 없음).

function pl_db($dir) {
  if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
    throw new Exception("푸시 데이터 디렉토리를 만들 수 없다: " . $dir);
  }
  if (!is_writable($dir)) throw new Exception("푸시 데이터 디렉토리에 쓸 수 없다: " . $dir);
  $db = new PDO("sqlite:" . $dir . "/app_push.db");
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
  $db->exec("pragma busy_timeout = 5000");
  for ($i = 0; $i < 5; $i++) {
    try { $db->exec("pragma journal_mode = WAL"); break; }
    catch (Throwable $e) { usleep(20000 * ($i + 1)); }
  }
  @chmod($dir . "/app_push.db", 0600);
  pl_migrate($db);
  return $db;
}

function pl_migrate($db) {
  $db->exec("create table if not exists devices (
    device text primary key,
    token text,                     -- FCM 등록 토큰(없으면 null — 웹·권한 미허용)
    picks text not null default '[]',
    on_flag integer not null default 1,
    upd_at text not null
  )");
  $db->exec("create table if not exists sends (
    id integer primary key autoincrement,
    device text not null,
    day text not null,              -- 다이제스트 날짜(KST) — 하루 1회 키
    title text not null, body text not null, data text,
    state text not null,            -- queued|sent|failed
    at text not null,
    unique(device, day)
  )");
  $db->exec("create index if not exists idx_send_day on sends(day)");
}

function pl_register($db, $device, $p, $now) {
  $picks = array();
  if (isset($p["picks"]) && is_array($p["picks"])) {
    foreach ($p["picks"] as $s) {
      if (is_string($s) && $s !== "" && strlen($s) <= 16) $picks[] = $s;
      if (count($picks) >= 24) break;
    }
  }
  $token = (isset($p["token"]) && is_string($p["token"]) && $p["token"] !== "") ? substr($p["token"], 0, 512) : null;
  $on = (isset($p["on"]) && !$p["on"]) ? 0 : 1;
  $st = $db->prepare("insert into devices (device, token, picks, on_flag, upd_at) values (?,?,?,?,?)
    on conflict(device) do update set token = coalesce(excluded.token, devices.token),
      picks = excluded.picks, on_flag = excluded.on_flag, upd_at = excluded.upd_at");
  $st->execute(array($device, $token, json_encode($picks, JSON_UNESCAPED_UNICODE), $on, gmdate("c", $now)));
  return array("ok" => true);
}

function pl_registry($db) {
  $rows = $db->query("select device, token, picks, on_flag from devices where on_flag = 1 order by device")->fetchAll();
  $out = array();
  foreach ($rows as $r) {
    $picks = json_decode($r["picks"], true);
    $out[] = array("device" => $r["device"], "token" => $r["token"],
      "picks" => is_array($picks) ? $picks : array(), "on" => true);
  }
  return $out;
}

// $sender = function($token, $title, $body, $data) : bool — null 이면 발송하지 않고 큐로만 기록(Phase 1).
function pl_send($db, $sends, $now, $sender = null) {
  $sent = 0; $skipped = 0; $queued = 0; $failed = 0;
  foreach (($sends === null ? array() : $sends) as $s) {
    if (!isset($s["device"], $s["title"], $s["body"])) continue;
    $day = isset($s["data"]["day"]) && $s["data"]["day"] !== "" ? (string)$s["data"]["day"] : gmdate("Y-m-d", $now + 9 * 3600);
    $dev = $db->prepare("select token from devices where device = ? and on_flag = 1");
    $dev->execute(array($s["device"]));
    $row = $dev->fetch();
    if (!$row) continue;                       // 미등록·알림 끈 기기
    $state = "queued";
    if ($sender !== null && $row["token"]) {
      $okSend = false;
      try { $okSend = (bool)$sender($row["token"], $s["title"], $s["body"], isset($s["data"]) ? $s["data"] : array()); }
      catch (Throwable $e) { $okSend = false; }
      $state = $okSend ? "sent" : "failed";
    }
    try {
      $ins = $db->prepare("insert into sends (device, day, title, body, data, state, at) values (?,?,?,?,?,?,?)");
      $ins->execute(array($s["device"], $day, $s["title"], $s["body"],
        json_encode(isset($s["data"]) ? $s["data"] : array(), JSON_UNESCAPED_UNICODE), $state, gmdate("c", $now)));
    } catch (Throwable $e) {
      $skipped++;                              // unique(device, day) — 같은 날 재발송 차단(멱등)
      continue;
    }
    if ($state === "sent") $sent++;
    else if ($state === "failed") $failed++;
    else $queued++;
  }
  return array("ok" => true, "sent" => $sent, "skipped" => $skipped, "queued" => $queued, "failed" => $failed);
}

function pl_scan_key($dir) {
  $f = $dir . "/app_scan_key.txt";
  if (!is_file($f)) return null;               // fail-closed — 키 없으면 스캐너 ops 전부 403
  $v = trim((string)@file_get_contents($f));
  return $v === "" ? null : $v;
}

function pl_fcm_conf($dir) {
  $f = $dir . "/app_fcm.json";                 // 킬스위치 — 부재 = 푸시 전체 꺼짐
  if (!is_file($f)) return null;
  $j = json_decode((string)@file_get_contents($f), true);
  if (!is_array($j) || empty($j["client_email"]) || empty($j["private_key"]) || empty($j["project_id"])) return null;
  return $j;
}

// FCM HTTP v1 발송기 — 자격증명이 있을 때만 만들어진다(Phase 2 에서 켜짐).
// 서비스 계정 JWT → OAuth2 액세스 토큰 → messages:send. legacy 서버키 아님(2024 폐지).
function pl_fcm_sender($conf) {
  if (!$conf || !function_exists("curl_init") || !function_exists("openssl_sign")) return null;
  $tokenCache = array("v" => null, "exp" => 0);
  return function ($token, $title, $body, $data) use ($conf, &$tokenCache) {
    $now = time();
    if (!$tokenCache["v"] || $tokenCache["exp"] < $now + 60) {
      $head = rtrim(strtr(base64_encode(json_encode(array("alg" => "RS256", "typ" => "JWT"))), "+/", "-_"), "=");
      $claim = array("iss" => $conf["client_email"], "scope" => "https://www.googleapis.com/auth/firebase.messaging",
        "aud" => "https://oauth2.googleapis.com/token", "iat" => $now, "exp" => $now + 3600);
      $payload = rtrim(strtr(base64_encode(json_encode($claim)), "+/", "-_"), "=");
      $sig = "";
      if (!openssl_sign($head . "." . $payload, $sig, $conf["private_key"], "sha256")) return false;
      $jwt = $head . "." . $payload . "." . rtrim(strtr(base64_encode($sig), "+/", "-_"), "=");
      $ch = curl_init("https://oauth2.googleapis.com/token");
      curl_setopt_array($ch, array(CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_POSTFIELDS => http_build_query(array("grant_type" => "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion" => $jwt))));
      $res = json_decode((string)curl_exec($ch), true); curl_close($ch);
      if (!is_array($res) || empty($res["access_token"])) return false;
      $tokenCache = array("v" => $res["access_token"], "exp" => $now + (int)(isset($res["expires_in"]) ? $res["expires_in"] : 3600));
    }
    $msg = array("message" => array("token" => $token,
      "notification" => array("title" => $title, "body" => $body),
      "data" => array_map("strval", is_array($data) ? array_map(function ($v) { return is_array($v) ? json_encode($v) : $v; }, $data) : array())));
    $ch = curl_init("https://fcm.googleapis.com/v1/projects/" . rawurlencode($conf["project_id"]) . "/messages:send");
    curl_setopt_array($ch, array(CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
      CURLOPT_HTTPHEADER => array("Authorization: Bearer " . $tokenCache["v"], "Content-Type: application/json"),
      CURLOPT_POSTFIELDS => json_encode($msg, JSON_UNESCAPED_UNICODE)));
    $out = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return $code >= 200 && $code < 300 && $out !== false;
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd map && php tests/app-push.test.php
```
Expected: `ℹ pass 15` / `ℹ fail 0`

- [ ] **Step 5: `app-api.php` 디스패치 — 스캐너 ops(device 검증 앞)**

`map/app-api.php`에서 `$device = isset($in["device"]) ...` 줄 **바로 앞**에 삽입:

```php
// ── 스캐너 ops(설계서 2026-08-26 §4.3) — 디바이스가 아니라 스캐너 키로 인증한다.
// device 검증 앞에 둔다: 외부 스캐너는 기기가 아니다. 키 파일 부재 = 전부 403(fail-closed).
$opRaw = (string)$in["op"];
if ($opRaw === "scan_registry" || $opRaw === "push_send") {
  require_once __DIR__ . "/app-push-lib.php";
  $realKey = pl_scan_key($AL_DIR);
  $gotKey = isset($_SERVER["HTTP_X_SCAN_KEY"]) ? (string)$_SERVER["HTTP_X_SCAN_KEY"] : "";
  if ($realKey === null || $gotKey === "" || !hash_equals($realKey, $gotKey)) {
    al_out(array("ok" => false, "error" => "scan-key"), 403);
  }
  try {
    $pdb = pl_db($AL_DIR);
    if ($opRaw === "scan_registry") al_out(array("ok" => true, "registry" => pl_registry($pdb)));
    $sends = isset($in["sends"]) && is_array($in["sends"]) ? array_slice($in["sends"], 0, 50) : array();
    $conf = pl_fcm_conf($AL_DIR);
    al_out(pl_send($pdb, $sends, time(), $conf ? pl_fcm_sender($conf) : null));
  } catch (Throwable $e) {
    al_out(array("ok" => false, "error" => "server"), 500);
  }
}
```

앱 op는 기존 `try {` 블록 안, `if ($op === "register") {` **바로 앞**에 삽입:

```php
  // 푸시 등록(앱) — 토큰은 Phase 2(네이티브 셸)부터 실린다. 지금은 종목·설정만으로도 등록된다.
  if ($op === "push_register") {
    require_once __DIR__ . "/app-push-lib.php";
    $pdb = pl_db($AL_DIR);
    al_out(pl_register($pdb, $device, array(
      "token" => isset($in["token"]) ? $in["token"] : null,
      "picks" => isset($in["picks"]) ? $in["picks"] : array(),
      "on" => isset($in["on"]) ? (bool)$in["on"] : true
    ), time()));
  }
```

- [ ] **Step 6: HTTP 경로 실측(로컬 PHP 서버)**

```bash
cd map && php -S 127.0.0.1:8941 -t . > /tmp/php-push.log 2>&1 &
sleep 1
curl -s -X POST http://127.0.0.1:8941/app-api.php -H 'Content-Type: application/json' \
  -d '{"op":"push_register","device":"pushsmoke01","picks":["NVDA"],"on":true}'
echo
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8941/app-api.php \
  -H 'X-Scan-Key: nope' -d '{"op":"scan_registry"}'
kill %1
```
Expected: 첫 줄 `{"ok":true}` · 둘째 줄 `403`(키 파일 없음 = fail-closed)

- [ ] **Step 7: run.sh 편입 + 전체 관문**

`map/tests/run.sh`의 `run_suite "app-sync" ...` 줄 아래에 추가:

```bash
    run_suite "app-push" "$ROOT" php tests/app-push.test.php
```

```bash
cd map && ./tests/run.sh
```
Expected: 전체 통과(app-push 15건 포함)

- [ ] **Step 8: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/app-push-lib.php map/app-api.php map/tests/app-push.test.php map/tests/run.sh
git commit -m "feat(app): 푸시 등록부·발송로그 서버(app-push-lib) + push_register/scan_registry/push_send"
```

---

### Task 4: 스캐너 배선 `scanner.mjs`

**Files:**
- Create: `map/scan/scanner.mjs`, `map/scan/scanner.config.sample.json`, `map/scan/README.md`
- Modify: `map/.gitignore`

**Interfaces:**
- Consumes: `scan-core.mjs`(Task 2), `app-signals.js`·`app-engine.js`·`app-config.js` 원본, `scan_registry`/`push_send`(Task 3)
- Produces: CLI — `node scan/scanner.mjs [--dry-run] [--config <path>]`, stdout에 1줄 JSON 요약, 실패 시 exit 1

- [ ] **Step 1: 설정 템플릿·gitignore**

`map/scan/scanner.config.sample.json`:

```json
{
  "serverBase": "https://parksvc.mycafe24.com/map",
  "scannerKey": "<서버 <data>/app_scan_key.txt 와 같은 값>",
  "batch": 50
}
```

`map/.gitignore` 맨 아래에 추가:

```
scan/scanner.config.json
```

- [ ] **Step 2: 스캐너 구현**

`map/scan/scanner.mjs`:

```js
// 머니스쿱 시그널 스캐너 — 하루 1회(07:00 KST) 한 번 실행 = 한 번의 전체 스캔 패스.
// 앱이 꺼져 있어도 관심종목을 대신 훑는다. 감지·판정은 앱과 같은 원본을 require 한다(사본 0).
//   node scan/scanner.mjs [--dry-run] [--config scan/scanner.config.json]
// 종료코드 0 = 정상(발송 0건이어도 정상), 1 = 실패.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { symbolUnion, buildSends } from "./scan-core.mjs";

const require = createRequire(import.meta.url);
const signals = require("../app/app-signals.js");
const engine = require("../app/app-engine.js");
const config = require("../app/app-config.js");

const argv = process.argv.slice(2);
const DRY = argv.indexOf("--dry-run") >= 0;
const ci = argv.indexOf("--config");
const CONF_PATH = ci >= 0 ? argv[ci + 1] : new URL("./scanner.config.json", import.meta.url).pathname;

function loadConf() {
  const raw = JSON.parse(readFileSync(CONF_PATH, "utf8"));
  if (!raw.serverBase || !raw.scannerKey) throw new Error("config: serverBase·scannerKey 필수");
  return { serverBase: String(raw.serverBase).replace(/\/+$/, ""), scannerKey: String(raw.scannerKey), batch: raw.batch || 50 };
}

async function api(conf, body) {
  const r = await fetch(conf.serverBase + "/app-api.php", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Scan-Key": conf.scannerKey },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => null);
  if (!j || j.ok !== true) throw new Error("api " + body.op + ": " + (j && j.error ? j.error : r.status));
  return j;
}

async function ohlc(conf, sym) {
  // 전량 이력 — 판정은 이력 길이에 의존한다(봉 전송 정책 2026-08-25). limit 금지.
  const r = await fetch(conf.serverBase + "/forge-api.php?ohlc=1&symbol=" + encodeURIComponent(sym) + "&tf=1day");
  const j = await r.json().catch(() => null);
  return (j && j.ok && Array.isArray(j.candles) && j.candles.length) ? j.candles : null;
}

function kstDay(now) {
  const t = new Date(now + 9 * 3600000);
  const p = (v) => String(v).padStart(2, "0");
  return t.getUTCFullYear() + "-" + p(t.getUTCMonth() + 1) + "-" + p(t.getUTCDate());
}

async function main() {
  const conf = loadConf();
  const POLICY = config.POLICY;
  const reg = (await api(conf, { op: "scan_registry" })).registry || [];
  const syms = symbolUnion(reg);
  const signalsBySym = {}, verdictBySym = {};
  const errs = [];

  for (const sym of syms) {
    try {
      const candles = await ohlc(conf, sym);
      if (!candles) { errs.push(sym + ":ohlc"); continue; }
      const det = signals.detect(sym, candles);
      if (!det.length) continue;                       // 감지 0건이면 판정도 필요 없다(엔진 호출 절약)
      signalsBySym[sym] = det;
      const rep = await engine.analyze({ symbol: sym, tfKo: "일", tier: POLICY.signal.verdictTier, candles: candles });
      verdictBySym[sym] = { regime: rep.verdict.regime, prob: rep.verdict.prob };
    } catch (e) { errs.push(sym + ":" + (e && e.message ? e.message : "err")); }
  }

  const sends = buildSends(reg, signalsBySym, verdictBySym,
    { conv: POLICY.signal.conv, cap: POLICY.signal.pushCap, day: kstDay(Date.now()) });

  let result = { queued: 0, sent: 0, skipped: 0, failed: 0 };
  if (!DRY) {
    for (let i = 0; i < sends.length; i += conf.batch) {
      const r = await api(conf, { op: "push_send", sends: sends.slice(i, i + conf.batch) });
      ["queued", "sent", "skipped", "failed"].forEach((k) => { result[k] += (r[k] || 0); });
    }
  }
  console.log(JSON.stringify({ at: new Date().toISOString(), devices: reg.length, symbols: syms.length,
    detected: Object.keys(signalsBySym).length, sends: sends.length, dryRun: DRY, result: result, errors: errs }));
}

main().catch((e) => { console.error(String(e && e.stack ? e.stack : e)); process.exit(1); });
```

- [ ] **Step 3: 배선 실측(dry-run · 로컬 서버 · 실 티커 없이)**

로컬 PHP에는 curl 확장이 없어 시세 프록시가 안 도니, **등록부·게이트 배선만** 확인한다:

```bash
cd map
php -S 127.0.0.1:8941 -t . > /tmp/php-push.log 2>&1 &
sleep 1
DATA=$(cd .. && pwd)/data   # <data> = 웹루트 밖(app-api 의 $AL_DIR 와 같은 경로 규칙)
mkdir -p "$DATA" && printf 'devkey123' > "$DATA/app_scan_key.txt"
curl -s -X POST http://127.0.0.1:8941/app-api.php -H 'Content-Type: application/json' \
  -d '{"op":"push_register","device":"pushsmoke01","picks":["NVDA"],"on":true}'; echo
cat > scan/scanner.config.json <<'JSON'
{ "serverBase": "http://127.0.0.1:8941", "scannerKey": "devkey123", "batch": 50 }
JSON
node scan/scanner.mjs --dry-run
kill %1
```

⚠ `$AL_DIR`는 `dirname(dirname(__DIR__)) . "/data"` — `php -S -t .`를 `map/`에서 띄우면 `__DIR__`가 `map/`이므로 `<repo부모>/data`가 된다. 위 `DATA` 계산이 그 경로와 같은지 먼저 `php -r 'echo dirname(dirname("'"$PWD"'/app-api.php"))."/data\n";'` 로 확인하고 다르면 그 경로에 키를 쓴다.

Expected: JSON 1줄 — `"devices":1, "symbols":1, "detected":0`(시세 프록시가 안 도니 `errors:["NVDA:ohlc"]`), `sends:0`. **`errors`에 `scan-key`가 없어야 한다**(키 인증 통과 확인).

- [ ] **Step 4: 라이브 읽기 검증(프로덕션 GET만 — 쓰기 없음)**

실 엔진 경로가 도는지 실데이터로 한 번 확인한다(읽기 전용 GET이라 허용 — 메모리 `headless-live-tests-readonly`):

```bash
cd map && node -e '
const signals=require("./app/app-signals.js"), engine=require("./app/app-engine.js"), cfg=require("./app/app-config.js");
(async()=>{
  const r=await fetch("https://parksvc.mycafe24.com/map/forge-api.php?ohlc=1&symbol=NVDA&tf=1day");
  const j=await r.json();
  const det=signals.detect("NVDA", j.candles);
  const rep=await engine.analyze({symbol:"NVDA",tfKo:"일",tier:cfg.POLICY.signal.verdictTier,candles:j.candles});
  const v={regime:rep.verdict.regime,prob:rep.verdict.prob};
  console.log(JSON.stringify({bars:j.candles.length, det:det.map(d=>d.rule), verdict:v,
    ranked:det.map(d=>[d.rule, signals.rankSignal(d,v).important, Math.round(signals.rankSignal(d,v).score*100)/100])}));
})();'
```
Expected: 실봉 수천 건, verdict `{regime, prob}` 실값, `ranked` 배열 출력. 소요 시간도 눈으로 확인(basic 티어가 종목당 1~2초 이내여야 인앱 랭킹이 성립한다 — 넘으면 Task 5에서 동시 실행 수를 줄인다).

- [ ] **Step 5: `map/scan/README.md` 작성**

```markdown
# 시그널 스캐너 (푸시 Phase 1)

앱이 꺼져 있어도 관심종목을 대신 훑어, **엔진이 강하게 동의하는** 시그널만 골라 서버에 발송을 요청한다.
감지·판정은 앱과 **같은 원본**(`../app/app-signals.js` · `../app/app-engine.js` · `../forge-core.js`)을 require 한다 — 사본 없음.

## 실행

    cp scanner.config.sample.json scanner.config.json   # 편집: serverBase·scannerKey
    node scanner.mjs --dry-run                          # 발송 없이 선별 결과만
    node scanner.mjs                                    # 실행(하루 1회)

`scanner.config.json` 은 gitignore — 커밋 금지.
서버 쪽 키는 `<data>/app_scan_key.txt`(웹루트 밖·불가침). 없으면 스캐너 ops 는 전부 403(fail-closed).

## cron (07:00 KST)

    0 22 * * * cd /path/to/map && /usr/bin/node scan/scanner.mjs >> /var/log/ms-scan.log 2>&1   # UTC 22:00 = KST 07:00

호스트는 코드와 무관하다(어디서 불려도 같은 결과). cafe24 에는 cron 이 없다 — 개발기 또는 작은 상시 호스트.

## Phase 1 에서 실제로 일어나는 일

`app_fcm.json`(서버 자격증명)이 없으므로 **실발송은 일어나지 않는다** — 발송로그에 `queued` 로만 쌓인다(킬스위치).
같은 날 두 번 돌려도 `unique(device, day)` 가 재발송을 막는다(멱등).
```

- [ ] **Step 6: 정리 + 커밋**

```bash
cd map && rm -f scan/scanner.config.json    # 로컬 실측용 설정은 커밋하지 않는다
cd /home/jschoi0223/projects/vdiportal
git add map/scan/scanner.mjs map/scan/scanner.config.sample.json map/scan/README.md map/.gitignore
git commit -m "feat(app): 시그널 스캐너 배선 scanner.mjs — 등록부→실봉→감지→엔진 판정→발송 요청"
```

---

### Task 5: 앱 클라이언트 — 등록 송신 + '엔진 확신' 하이라이트

**Files:**
- Create: `map/app/app-push.js`
- Modify: `map/app/index.html` (스크립트 로드 — `app-signals.js` 다음 줄)
- Modify: `map/app/app-screen-signal.js` (`MS.scanSignals` 뒤 랭킹 훅 · `rowHtml` 배지 · 정렬 · 푸터 문구)

**Interfaces:**
- Consumes: `MS.signals.rankSignal`(Task 1), `MS.data.api`(op 디스패치 — device 자동 주입), `MS.data.ohlc.fetch`, `MS.engine.analyze`, `MS.config.POLICY.signal`
- Produces:
  - `MS.push.register()` -> Promise<void> — `push_register` 송신(picks·on). 실패는 조용히 삼킨다(오프라인 허용)
  - `MS.push.rankList(list)` -> Promise<{[key:string]: {important:boolean, score:number}}> — 시그널 목록에 확신도 부여. 종목별 판정은 메모리 캐시(`sym|barT`)
  - 스토어 필드 `sigRank`(key→{important,score}) · `sigImpN`(중요 건수) — **비영속**(휘발 — `persistKeys` 건드리지 않는다)

- [ ] **Step 1: `app-push.js` 작성**

```js
/* 머니스쿱 앱 — 푸시 등록·인앱 확신도 랭킹(설계서 2026-08-26 Phase 1).
   푸시 자체는 네이티브 셸+Firebase(Phase 2)에서 켜진다. Phase 1 에서 이 파일이 하는 일은 둘:
   ① 등록부 송신(관심종목·알림설정) — 서버 스캐너가 무엇을 훑을지 알게 한다.
   ② 인앱 하이라이트 — 스캐너가 쓸 게이트(rankSignal)를 앱에서도 돌려 '엔진이 강하게 동의하는'
      시그널을 눈에 띄게 한다. 판정은 스캐너와 같은 계약(전량 이력·일봉·POLICY.signal.verdictTier). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const vCache = Object.create(null);   // 'SYM|barT' → {regime, prob} (세션 메모리 — 봉이 바뀌면 자동 무효)
  let regTimer = null;

  async function register() {
    const s = MS.store.get();
    try {
      await MS.data.api("push_register", { picks: s.picks || [], on: s.notiOff ? false : true });
    } catch (e) { /* 오프라인·서버 미배포 — 등록은 다음 기회에(조용히) */ }
  }
  function registerSoon() {
    if (regTimer) clearTimeout(regTimer);
    regTimer = setTimeout(function () { regTimer = null; register(); }, 3000);
  }

  // 종목 판정(스캐너와 같은 계약: 전량 이력 · 일봉 · POLICY.signal.verdictTier)
  async function verdictOf(sym, barT) {
    const ck = sym + "|" + barT;
    if (vCache[ck]) return vCache[ck];
    const r = await MS.data.ohlc.fetch(sym, "일");            // 전량(경량 캐시는 자동 승격)
    if (!r.ok || !r.candles || r.candles.length < 24) return null;
    const rep = await MS.engine.analyze({ symbol: sym, tfKo: "일",
      tier: MS.config.POLICY.signal.verdictTier, candles: r.candles });
    const v = { regime: rep.verdict.regime, prob: rep.verdict.prob };
    vCache[ck] = v;
    return v;
  }

  // 시그널 목록에 확신도 부여. 종목 단위로 순차 처리(한 번에 한 종목 — 저사양 기기 배려),
  // 종목 하나가 끝날 때마다 onProgress 로 부분 결과를 흘려보내 화면이 점진적으로 채워지게 한다.
  async function rankList(list, onProgress) {
    const out = Object.create(null);
    const bySym = Object.create(null);
    (list || []).forEach(function (x) { (bySym[x.sym] = bySym[x.sym] || []).push(x); });
    const syms = Object.keys(bySym);
    for (let i = 0; i < syms.length; i++) {
      const sym = syms[i];
      const rows = bySym[sym];
      let v = null;
      try { v = await verdictOf(sym, rows[0].barT); } catch (e) { v = null; }
      if (!v) continue;                                       // 판정 실패 종목은 표시 없음(지어내지 않는다)
      rows.forEach(function (x) {
        const r = MS.signals.rankSignal(x, v);
        out[x.key] = { important: r.important, score: r.score, prob: v.prob };
      });
      if (onProgress) onProgress(out);
    }
    return out;
  }

  function impCount(rank) {
    let n = 0;
    Object.keys(rank || {}).forEach(function (k) { if (rank[k].important) n++; });
    return n;
  }

  MS.push = { register: register, registerSoon: registerSoon, rankList: rankList, impCount: impCount };
})();
```

- [ ] **Step 2: 로드 배선**

`map/app/index.html`의 `app-signals.js` 줄 **바로 다음**에 추가(캐시버스터 값은 그 줄과 동일하게):

```html
<script src="app-push.js?v=20260826k"></script>
```

- [ ] **Step 3: `MS.scanSignals`에 랭킹 훅 + 등록 송신**

`map/app/app-screen-signal.js`의 `MS.scanSignals` 끝부분(`MS.store.set({ sigTodayN: unreadToday, sigList: all }); return all;`)을 교체:

```js
    MS.store.set({ sigTodayN: unreadToday, sigList: all });
    // 확신도 랭킹은 백그라운드 — 목록은 즉시 보이고, 종목 판정이 끝나는 대로 배지가 붙는다.
    // 등록부 송신도 같이(스캐너가 무엇을 훑을지 알게 — 푸시 Phase 1).
    if (MS.push) {
      MS.push.registerSoon();
      if (all.length) {
        MS.push.rankList(all, function (partial) {
          MS.store.set({ sigRank: partial, sigImpN: MS.push.impCount(partial) });
        }).then(function (rank) {
          MS.store.set({ sigRank: rank, sigImpN: MS.push.impCount(rank) });
        }).catch(function () {});
      }
    }
    return all;
```

⚠ `sigRank`·`sigImpN`은 `app-state.js`의 `persistKeys`에 **넣지 않는다**(세션 휘발 — 봉이 바뀌면 다시 계산).

- [ ] **Step 4: 화면 — 배지·정렬·푸터**

(1) `rowHtml(x)` 안, `const psy = ...` 다음 줄에 추가:

```js
      const rk = (MS.store.get().sigRank || {})[x.key];
      const imp = !!(rk && rk.important);
```

(2) 같은 함수의 제목 줄(`esc(x.title)`가 들어간 `<span>`) **바로 뒤**에 배지를 넣는다:

```js
        (imp ? '<span style="flex:none;font-size:10px;font-weight:700;color:var(--up);background:rgba(46,194,142,0.14);border:1px solid rgba(46,194,142,0.35);border-radius:99px;padding:2px 7px">엔진 확신</span>' : "") +
```

(3) 펼침 영역의 `내 페르소나(...)` 안내 줄 **앞**에 근거 한 줄 추가(정직 표기 — 실측 확률만):

```js
          (imp ? '<div style="margin-top:6px;font-size:11.5px;color:var(--up)">기본 5지표 분석의 상승 확률 ' + Math.round(rk.prob) + '% — 이 신호와 같은 방향이라 먼저 올렸어요</div>' : "") +
```

(4) `render()`의 정렬을 '중요 먼저 → 페르소나 → 최신' 3단으로 바꾼다. 기존 `if (pg) { rows = rows.slice().sort(...) }` 블록을 통째로 교체:

```js
      const rank = s.sigRank || {};
      rows = rows.slice().sort(function (a2, b2) {
        const ia = rank[a2.key] && rank[a2.key].important ? 1 : 0;
        const ib = rank[b2.key] && rank[b2.key].important ? 1 : 0;
        if (ia !== ib) return ib - ia;                       // ① 엔진 확신
        if (pg) {                                            // ② 내 성향(골드 우선 — 지침서 §7)
          const ga = a2.group === pg ? 1 : 0, gb = b2.group === pg ? 1 : 0;
          if (ga !== gb) return gb - ga;
        }
        return a2.barT < b2.barT ? 1 : a2.barT > b2.barT ? -1 : 0;   // ③ 최신 봉
      });
```

⚠ `bind()`의 스크롤 핸들러 안에도 **같은 정렬 블록이 복제돼 있다**(현행 코드의 중복). 거기서는 `rows.length` 계산에만 쓰이므로, 그 복제 블록은 `let rows = (list || []).filter(...)` 한 줄만 남기고 정렬을 지운다(길이는 정렬과 무관).

(5) 화면 상단 설명 줄(`관심 종목의 눈에 띄는 움직임을…`) 다음, 그리고 하단 푸터 문구를 상태에 맞게 고친다:

```js
        '<div style="margin:14px 16px 0;font-size:11px;color:var(--m2);text-align:center">' +
        ((s.sigImpN || 0) > 0 ? '엔진 확신 ' + s.sigImpN + '건 — 기본 5지표 판정과 같은 방향인 신호예요 · ' : "") +
        '감지는 봉 확정 기준이라 표시가 늦을 수 있어요</div>' +
```

(기존 `푸시 알림은 준비 중이에요 · 감지는 봉 확정 기준이라 표시가 늦을 수 있어요` 줄을 이걸로 교체 — 푸시는 Phase 2에서 켜지므로 "준비 중" 표기는 그때까지 사실이지만, 하이라이트가 생긴 지금은 이 문구가 화면 상태를 더 정확히 설명한다.)

- [ ] **Step 5: 스토어 갱신이 화면에 반영되게**

`sigRank`가 바뀌면 시그널 화면이 다시 그려져야 한다. `mount` 안 `MS.scanSignals().then(...)` 블록 **바로 뒤**에 구독을 추가한다(라우터가 unmount 할 때 해제):

```js
    // 확신도가 백그라운드로 채워지면 목록을 다시 그린다(배지·정렬 반영)
    unsubRank = MS.store.sub(function (keys) {
      if (keys.indexOf("sigRank") >= 0 && MS.store.get().screen === "signal") render();
    });
```

`mount` 상단(`let list = ...` 옆)에 `let unsubRank = null;`를 선언하고, 모듈 하단 `MS.router.register("signal", { ... unmount: ... })`의 unmount 에 해제를 더한다:

```js
  MS.router.register("signal", { mount: mount,
    unmount: function () {
      if (sigTimer) { clearInterval(sigTimer); sigTimer = null; }
      if (unsubRank) { unsubRank(); unsubRank = null; }
    } });
```

⚠ `unsubRank`는 `mount` 지역 변수라 `unmount`에서 안 보인다 — **모듈 스코프**(`let sigTimer = null;` 옆)로 선언한다.

⚠ `MS.store.sub`의 실제 시그니처를 먼저 확인한다:
```bash
grep -n "sub\b\|function sub\|subs.push" map/app/app-state.js map/app/app-ui.js | head
```
콜백 인자가 `keys` 배열이 아니면(예: 상태 객체) 그 형태에 맞춘다 — `app-ui.js:471`이 `keys.indexOf(...)`를 쓰는 것으로 보아 키 배열이 맞다.

- [ ] **Step 6: 헤드리스 화면 검증**

```bash
cd map && php -S 127.0.0.1:8941 -t . > /tmp/php-push.log 2>&1 &
sleep 1
LD_LIBRARY_PATH=~/.local/pwlibs/usr/lib/x86_64-linux-gnu NODE_PATH=~/.npm/_npx/705bc6b22212b352/node_modules \
node -e '
const {chromium}=require("playwright-core");
(async()=>{
  const b=await chromium.launch({executablePath:require("fs").readdirSync(process.env.HOME+"/.cache/ms-playwright").filter(d=>d.startsWith("chromium")).map(d=>process.env.HOME+"/.cache/ms-playwright/"+d+"/chrome-linux/chrome")[0]});
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://127.0.0.1:8941/app/index.html?fixture=1");
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{ MS.store.set({picks:["NVDA","TSLA"]}); MS.router.go("signal"); });
  await p.waitForTimeout(6000);
  await p.screenshot({path:"/tmp/sig-rank.png", fullPage:false});
  console.log(JSON.stringify({errs, impN: await p.evaluate(()=>MS.store.get().sigImpN),
    badges: await p.evaluate(()=>document.body.innerText.split("엔진 확신").length-1)}));
  await b.close();
})();'
kill %1
```
Expected: `errs` 빈 배열, `impN`은 숫자(0일 수 있다 — fixture 합성봉이 게이트를 통과 못 할 수 있으니 **0이어도 실패 아님**. 대신 `MS.store.get().sigRank`가 채워졌는지 확인한다). 스크린샷 `/tmp/sig-rank.png`를 눈으로 확인해 배지·정렬이 깨지지 않았는지 본다.

fixture 에서 중요 건이 안 나오면, 게이트가 실제로 도는지 콘솔에서 강제로 확인한다:
```js
await p.evaluate(()=>MS.signals.rankSignal({dir:1},{regime:"bull",prob:80}))   // → {important:true,...}
```

- [ ] **Step 7: 문법 하한·전체 관문**

```bash
cd map && ./tests/run.sh
```
Expected: 전체 통과(`app/syntax-floor.test.js`가 새 파일 `app-push.js`도 검사한다 — 옵셔널 체이닝·`??` 사용 시 여기서 걸린다)

- [ ] **Step 8: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/app/app-push.js map/app/index.html map/app/app-screen-signal.js
git commit -m "feat(app): 인앱 '엔진 확신' 하이라이트 + 푸시 등록부 송신"
```

---

### Task 6: 문서 갱신 · 배포

**Files:**
- Modify: `map/docs/design-v2/LAUNCH.md` (FCM 절)
- Modify: `map/docs/design-v2/PROGRESS.md` (§0 표 · §3 배포 세트 · §5 세션 로그)
- Modify: `map/docs/superpowers/specs/2026-08-26-app-push-signals-design.md` (상태줄 — Phase 1 구현 완료)
- Modify: `map/CLAUDE.md` (앱 트랙 배포 세트에 `app-push-lib.php` · 불가침 3파일 추가)

- [ ] **Step 1: LAUNCH.md FCM 절 갱신**

FCM 섹션에 다음을 반영한다(기존 "전무 — Firebase 프로젝트부터" 서술을 대체):
- Phase 1 구축 완료(등록부·발송로그·스캐너·게이트·인앱 하이라이트) — **지금 켤 것은 없다**.
- Phase 2 활성 순서: ① Firebase 프로젝트 → `google-services.json`(app-shell/android/app/) ② 서버 `<data>/app_fcm.json`(서비스 계정 JSON — 킬스위치) ③ `<data>/app_scan_key.txt` 생성(스캐너 키) ④ 스캐너 호스트에 `scan/scanner.config.json` ⑤ cron 22:00 UTC.
- 검증: `curl -s -X POST <base>/app-api.php -H 'X-Scan-Key: <키>' -d '{"op":"scan_registry"}'` → `ok:true`(키 없으면 403이 정상).

- [ ] **Step 2: CLAUDE.md 배포 세트 갱신**

`map/CLAUDE.md` §앱 트랙 배포 줄의 **서버 동반 세트**에 `app-push-lib.php`를 더하고, **배포 불가침**에 `<data>/app_push.db`·`app_scan_key.txt`·`app_fcm.json`을 더한다. `scan/`은 cafe24 배포 대상이 아님을 한 줄로 명시.

- [ ] **Step 3: PROGRESS.md 갱신**

- §0 표 `다음` 행: FCM ③ 을 "Phase 1 구축 완료 · Phase 2(Firebase)만 대기"로.
- §3 배포 상태: 서버 동반 세트에 `app-push-lib.php` 추가, 불가침 3파일 추가.
- §5 로그에 오늘 항목 append(아래 형식):

```markdown
### 2026-08-27 — FCM 푸시 Phase 1(Firebase 무관 전량 구축)
- **확신도 게이트 `rankSignal`(app-signals, 공유 순수함수)**: `strength=|prob−50|/50`, 정렬(방향 시그널=국면/확률 방향 일치, 무방향 룰=강한 방향관) ∧ `strength ≥ POLICY.signal.conv(0.30)`. **앱과 스캐너가 같은 함수를 호출**한다(사본 0). `POLICY.signal` 신설(conv·pushCap 3·pushHourKST 7·**verdictTier basic**).
- **판정 계약 확정**: 시그널 확신도 = `app-engine.analyze({tier:"basic", tfKo:"일", 전량 이력})`. 티어·봉 길이를 못박은 이유 = 판정이 이력 길이에 의존(2026-08-25 실측), 앱은 12종목을 백그라운드로 돌 수 있어야 한다.
- **스캐너 `scan/`**: `scan-core.mjs`(순수 — 종목 합집합·선별·캡·다이제스트) + `scanner.mjs`(배선 — registry→OHLC 전량→detect→analyze→push_send, `--dry-run`) + README(cron 22:00 UTC = 07:00 KST). 엔진·감지는 `../app/*` 원본 require.
- **서버 `app-push-lib.php`**: `<data>/app_push.db`(devices·sends) · `push_register`(앱) · `scan_registry`/`push_send`(`X-Scan-Key`, 키 파일 부재=403 fail-closed) · **하루 1회 캡은 `unique(device, day)`가 강제**(스캐너 재실행 멱등) · FCM HTTP v1 발송기는 `app_fcm.json` 있을 때만 생성(킬스위치 — Phase 1은 `queued`만).
- **인앱 하이라이트**: `app-push.js`(등록 송신 디바운스 + 종목별 판정 캐시 `sym|barT` + 순차 랭킹·부분 결과 스트리밍) → 시그널 화면 '엔진 확신' 배지 · 정렬 3단(확신 → 페르소나 → 최신) · 펼침에 실측 확률 표기. `sigRank`/`sigImpN`은 휘발(영속 아님).
- 관문 <실제 수치>건. 라이브 배포(앱+서버 세트, 캐시버스터 <STAMP>).
- **남은 것(Phase 2 · Firebase 게이트)**: 푸시 플러그인·토큰 포착·딥링크·APK 재빌드·`app_fcm.json`. 미결: 스캐너 cron 호스트(운영 결정 — 코드 무관).
```

- [ ] **Step 4: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/docs/design-v2/LAUNCH.md map/docs/design-v2/PROGRESS.md \
  map/docs/superpowers/specs/2026-08-26-app-push-signals-design.md map/CLAUDE.md
git commit -m "docs(app): 푸시 Phase 1 구축 완료 반영 — LAUNCH·PROGRESS·배포 세트"
```

- [ ] **Step 5: 브랜치 머지**

```bash
cd /home/jschoi0223/projects/vdiportal && git checkout main && git merge --no-ff <브랜치> -m "merge: 앱 푸시 Phase 1 — 확신도 게이트·스캐너·등록부·인앱 하이라이트"
```

- [ ] **Step 6: 캐시버스터 + 배포**

```bash
cd map && python3 scripts/stamp-cachebust.py 20260827a && git add -u map/app map/forge.html 2>/dev/null; cd /home/jschoi0223/projects/vdiportal && git add map/app/index.html && git commit -m "chore(app): 캐시버스터 20260827a"
```

업로드(lftp SFTP `parksvc.mycafe24.com`, 비밀번호는 메모리 `scoopforge-deploy`):
- 앱: `www/map/app/` ← `index.html`·`app-push.js`·`app-signals.js`·`app-config.js`·`app-screen-signal.js`(+ 캐시버스터가 바꾼 파일 전부)
- 서버 동반 세트: `www/map/` ← `app-api.php`·`app-push-lib.php`
- **올리지 않는 것**: `scan/**`(외부 호스트), `*.test.*`, `<data>/*`(불가침), `forge-engine.html`(레인 A 미커밋 작업)

검증:
```bash
curl -s -X POST https://parksvc.mycafe24.com/map/app-api.php -H 'Content-Type: application/json' \
  -d '{"op":"push_register","device":"pushsmoke01","picks":["NVDA"],"on":true}'   # → {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://parksvc.mycafe24.com/map/app-api.php \
  -H 'X-Scan-Key: nope' -d '{"op":"scan_registry"}'                              # → 403 (키 파일 없음 = 정상)
curl -s https://parksvc.mycafe24.com/map/app/app-push.js | head -3               # → 배포 반영 확인
```
라이브 `https://parksvc.mycafe24.com/map/app/` 를 열어 시그널 화면에 배지가 붙는지(관심종목에 감지가 있을 때) 확인한다.

---

## Self-Review

**1. 스펙 커버리지**
- §4.1 `rankSignal` → Task 1 ✅ (TH.conv → `POLICY.signal.conv`로 승격, 설계서보다 엄격하게 단일 출처화)
- §4.2 스캐너(순수 분리·config·원본 require·종목당 run 1회·판정 정합) → Task 2·4 ✅ — **판정 정합은 "같은 함수를 호출"로 해결**(설계서가 열어둔 "UMD 추출 또는 분리"의 선택: `app-engine.js`가 이미 node-require 가능하므로 추출 불필요). 정합 회귀 테스트 대신 **구조적 보장**(같은 함수·같은 계약)을 택했고, Task 4 Step 4가 실데이터로 그 경로를 실행해 확인한다.
- §4.3 서버 3 ops·SQLite·스캐너 키·킬스위치·하루 1회 멱등 → Task 3 ✅
- §4.4 클라이언트 Phase 1(하이라이트·설정·등록) → Task 5 ✅ — 설정 토글은 기존 `notiOff`를 그대로 실어 보낸다(새 토글 신설 없음 = YAGNI).
- §5 Phase 1 목록 5개 + 관문 편입 → Task 1~5 ✅
- §6 파일 구조 → 전부 ✅ (`app-push-lib.test.*` = `tests/app-push.test.php`)
- §7 보안·규율 → Global Constraints + 각 태스크 ✅
- §8 미결: cron 호스트(운영 — Task 4 README에 절차만), 문구 톤(Task 2 `digestText`), 임계 정밀값(POLICY), Phase 2 플러그인(범위 밖) ✅

**2. 플레이스홀더**: 없음 — 모든 코드 블록이 실제 내용. `<브랜치>`·`<STAMP>`·`<실제 수치>`는 실행 시점에만 정해지는 값이라 의도적으로 남겼고 채우는 방법을 함께 적었다.

**3. 타입 일관성**: `rankSignal(sig, verdict, opts) -> {important, aligned, score}` — Task 1 정의, Task 2(`scan-core.pickImportant`)·Task 5(`app-push.rankList`)에서 같은 형태로 소비 ✅. `verdict = {regime, prob}` — Task 4 스캐너·Task 5 클라 모두 `rep.verdict`에서 같은 두 필드만 뽑는다 ✅. `sends[] = {device, title, body, data:{day, keys}}` — Task 2 생성 ↔ Task 3 `pl_send` 소비 필드 일치 ✅. `registry[] = {device, token, picks, on}` — Task 3 `pl_registry` 생성 ↔ Task 2 `symbolUnion`/`buildSends` 소비 ✅.

**알려진 위험 2건**(실행 중 확인):
- 인앱 랭킹 비용 — basic 티어 × 전량 이력이 종목당 1~2초를 넘으면 저사양 기기에서 체감된다. Task 4 Step 4가 실측 지점이고, 넘으면 Task 5에서 "오늘 봉 시그널이 있는 종목만" 으로 좁힌다.
- `MS.store.sub` 시그니처 — Task 5 Step 5에 확인 명령을 넣었다.
