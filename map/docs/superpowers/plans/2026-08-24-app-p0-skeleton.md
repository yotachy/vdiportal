# 머니스쿱 앱 P0 — 골격 구현 플랜

> **상태: ✅ 완료(2026-08-24).** Task 1~8 전부 실행·검증됨(관문 826건·헤드리스 스크린샷 4종).
> 실행 중 조정 2건: ① 로드 순서 — 화면 모듈이 로드 시 `MS.router.register` 를 호출하므로
> `app-main.js`(라우터)가 화면들보다 **먼저** 로드된다(부팅은 DOMContentLoaded 로 지연).
> ② run.sh app 스위트는 `node --test <파일 나열>` 로 호출(`./` 디렉토리 인자는 미지원).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `map/app/` 신설 — 토큰·테마, 정책/문자열/상태 모듈, 라우터, 공통 크롬(헤더·탭바·시트·토스트·스켈레톤), 빈 홈. 이후 모든 페이즈가 얹힐 기반.

**Architecture:** 바닐라 JS classic script, `window.MS` 네임스페이스, 로직 모듈은 UMD(node 테스트 가능). 시안 크롬 마크업을 프로토타입 원문에서 이식(줄 번호 인용), 색은 전부 CSS 토큰.

**Tech Stack:** HTML5·CSS3·Vanilla JS(ES2017 하한)·node --test·PHP(이후 페이즈).

**Spec:** `map/docs/design-v2/BUILD-PLAN.md`(마스터) + `map/docs/design-v2/dissection/01~03`(프로토 해부·줄 번호 원본).

## Global Constraints

- ES2017 하한 — 옵셔널 체이닝·null 병합·논리 대입 금지(async/await·const/let·화살표 허용).
- 색·라운드·그림자 하드코딩 금지 — `app.css` 토큰(`var(--…)`)만. 좌측 accent bar 금지.
- 문자열은 `MS.str()` 경유, 정책 숫자는 `MS.config.POLICY` 경유 — 화면 코드에 리터럴 금지.
- 모든 HTML `<head>`에 `<meta name="robots" content="noindex, nofollow">`.
- 시트는 탭바를 가리지 않는다. 터치 타깃 44px+. 아이콘 전용 컨트롤 aria-label.
- 테스트 기대값은 구현 상수 재사용 금지(밖에서 계산해 리터럴로).
- 커밋 스코프 `feat(app):`/`test(app):`. 엔진 파일 수정 없음.

## 확정 반영 (2026-08-24 사용자 승인)

Q1 적중 환급 +1 구현(P3에서) · Q2 레벨 기저 42 제거, xp 0 시작 · Q3 24h 재분석 무차감 심화·커스텀 대칭 · Q5 엔진 32종이 정본.

---

### Task 1: 디렉토리 + app.css (토큰·키프레임·베이스)

**Files:** Create `map/app/app.css`

- 토큰: 프로토 L49(`:root` 다크) · L50(`[data-th="light"]`) **원문 그대로**. 라이트 `--cu`는 토큰값 `#c97a08` 채택(프로토 T_CU 라이트 `#b8860b`과 미세 불일치 — 토큰 승, 주석으로 기록).
- 키프레임 28종: 프로토 L20~48 원문 그대로(ms* 접두 유지).
- 베이스: 프로토 L15~19(body 폰트·letter-spacing −0.011em·스크롤바 숨김) + `#msApp` 앱 컨테이너(모바일 전폭, 배경 radial 보라 글로우 L70 데스크톱 한정) + Google Fonts는 index.html `<link>`.
- 크롬용 클래스: `.ms-header` `.ms-tabbar` `.ms-tab` `.ms-sheet` `.ms-sheet-dim` `.ms-snack` `.ms-skel` 등 — 마크업 원문(02 §3)의 인라인 스타일을 클래스로 이관하되 수치·색 동일.
- 검증: 토큰 키 수 다크=라이트 동일(전환 leak 방지 — map.html THEMES 교훈).

- [ ] app.css 작성 → 스텁 HTML로 두 테마 렌더 확인 → 커밋

### Task 2: app-config.js — POLICY 테이블 (UMD)

**Files:** Create `map/app/app-config.js`, Test `map/app/app-config.test.js`

**Produces:** `MS.config.POLICY`(동결 객체) · `MS.config.scoopCap(level)` · `MS.config.levelOf(xp)` · `MS.config.applyRemote(obj)`(딥 머지, 미지 키 무시).

POLICY 전 항목 = 01 §4 전수표 기준선(+확정 Q2·Q3). 섹션: `scoop`(start 15 · capBase 15 · capPerLevel 2 · costDeep 2 · costCustom 3 · checkin {amount 1, intervalSec 21600} · streak {days 7, bonus 5} · ad {scoop 3, xp 5} · hitRefund 1) / `analysis`(ttlMs 86400000 · warnMs 10800000 · basicCount 5 · fullCount 32 · concurrent 1 · reanalysisFreeTiers ['deep','custom'] — Q3 대칭) / `xp`(firstVisit 5 · menuFirst 3 · analysisFirst 5 · signalView 5 · scoreView 5 · personaAnswer 1 · drawToggle {xp 1, perDay 3} · stockAdd {xp 1, perDay 3} · levels [40,70,110,160] · levelBase 0 — Q2) / `limits`(stocksMax 12 · stockOpsPerDay 6 · signal {keepDays 3, page 20, more 10} · score {keepDays 90, page 20, more 10} · persona {perDay 5, guestMax 3}) / `persona`(stages [0,4,9,16,31,61] · stageNames) / `ui`(sheetClosePx 90 · skeletonMs 180 · toastMs 1800 · toastNegMs 3200 · swipePx 40 · haptics {deduct:[30,40,30], done:[15,30,60], earn:[20], warn:[60,50,60], stop:[25], tick:[12]}).

- [ ] **테스트 먼저** — 기대값은 지침서 수치로 직접:

```js
const { test } = require('node:test'); const assert = require('node:assert');
const config = require('./app-config.js');
test('스쿱 상한: Lv1=15 Lv3=19 Lv5=23', () => {
  assert.equal(config.scoopCap(1), 15);
  assert.equal(config.scoopCap(3), 19);
  assert.equal(config.scoopCap(5), 23);
});
test('레벨: 0→1, 40→2, 69→2, 70→3, 110→4, 160→5 (기저 없음)', () => {
  assert.equal(config.levelOf(0), 1); assert.equal(config.levelOf(40), 2);
  assert.equal(config.levelOf(69), 2); assert.equal(config.levelOf(70), 3);
  assert.equal(config.levelOf(110), 4); assert.equal(config.levelOf(160), 5);
});
test('applyRemote: 아는 키만 갱신·미지 키 무시·원본 불변 아님(교체)', () => {
  config.applyRemote({ scoop: { costDeep: 4 }, hacker: { x: 1 } });
  assert.equal(config.POLICY.scoop.costDeep, 4);
  assert.equal(config.POLICY.hacker, undefined);
  config.applyRemote({ scoop: { costDeep: 2 } });
});
test('정책 기준선 스모크', () => {
  const P = config.POLICY;
  assert.equal(P.scoop.costCustom, 3); assert.equal(P.analysis.ttlMs, 86400000);
  assert.equal(P.limits.stocksMax, 12); assert.deepEqual(P.xp.levels, [40,70,110,160]);
  assert.deepEqual(P.ui.haptics.deduct, [30,40,30]);
});
```

- [ ] 실패 확인 → 구현(UMD, forge-core 패턴) → 통과 → 커밋

### Task 3: app-strings.js — 문자열 키 사전 (UMD)

**Files:** Create `map/app/app-strings.js`, Test `map/app/app-strings.test.js`

**Produces:** `MS.str(path)` — 점 표기 키 조회, 미존재 시 키 문자열 반환(빈 화면 방지). `MS.strings.TABLE`.

P0 수록: app(title 머니스쿱) · tabs(홈/시그널/분석/채점/통계/내 스쿱) · header(종목 · aria 3종) · toast(guardRun 문구 등 공통 4종) · common(확인/닫기/뒤로). 이후 페이즈가 화면별 섹션 추가.

- [ ] 테스트: `str('tabs.home')==='홈'` · `str('없는.키')==='없는.키'` · 모든 값 비어있지 않음 순회 → 실패 → 구현 → 통과 → 커밋

### Task 4: app-state.js — 스토어·영속화 (UMD)

**Files:** Create `map/app/app-state.js`, Test `map/app/app-state.test.js`

**Produces:**
- `MS.state.create(initial, io)` → `{ get(), set(patch), subscribe(fn)→unsub, snapshot() }` — set은 얕은 병합+변경 키 목록으로 구독자 호출.
- `MS.state.initialState()` — 01 §1-1 필드 승계(스쿱 15·theme dark 등. 프로토 dead 필드 `yInclBasic/obN/scope/mode/wstep` 제외 — 02 부록).
- `MS.state.persistKeys` — 영속 대상: picks·analyzed·analyzedAt·scoops·theme·gLinked·personaIdx·personaAns·personaApply·xp·xpToday·fontZoom·dayVisit·**weights·checks·indOff**(Q8 승격: 프로토 미저장이었으나 계약상 저장)·**dayCounters**(stockOps·stockAddXp·personaToday·streak — 비영속 버그 해소, 01 §6-3).
- `MS.state.serialize(state)` / `MS.state.restore(raw, now)` — 키 `ms_app_v1` `{v:1, ...전체키}`. restore 규칙(01 §2-2 승계): analyzed는 `now−at < ttlMs`만 생존(analyzedAt 원본 유지) · scoops 숫자 아니면 15 · theme 'light' 외 'dark' · xpToday·dayCounters는 dayKey 일치 시만 · picks 비면 첫 실행 취급(null 반환).
- `MS.state.dayKey(now)` — KST 기준 YYYY-MM-DD(Q11).

- [ ] 테스트(핵심만 발췌 — 실제 파일에는 아래 전부):

```js
test('restore: 24h 지난 분석은 analyzed에서 제거, analyzedAt은 유지', () => {
  const now = 1756000000000;
  const raw = JSON.stringify({ v:1, picks:['NVDA'], scoops:9, theme:'dark',
    analyzed:{ 'NVDA|일':'deep', 'AAPL|일':'custom' },
    analyzedAt:{ 'NVDA|일': now-86400001, 'AAPL|일': now-1000 } });
  const s = state.restore(raw, now);
  assert.equal(s.analyzed['NVDA|일'], undefined);
  assert.equal(s.analyzed['AAPL|일'], 'custom');
  assert.equal(s.analyzedAt['NVDA|일'], now-86400001);
});
test('restore: picks 없으면 null(첫 실행)', () => {
  assert.equal(state.restore(JSON.stringify({v:1,picks:[]}), 0), null);
  assert.equal(state.restore('null', 0), null);
  assert.equal(state.restore('{broken', 0), null);
});
test('dayKey: KST 자정 경계 — UTC 15:00 = KST 자정', () => {
  assert.equal(state.dayKey(Date.UTC(2026,7,24,14,59)), '2026-08-24');
  assert.equal(state.dayKey(Date.UTC(2026,7,24,15,0)), '2026-08-25');
});
test('store: set 병합·구독 통지·unsub', () => { /* 카운터 구독 검증 */ });
test('serialize→restore 왕복: persistKeys 전부 보존(weights·dayCounters 포함)', () => { /* 왕복 동등성 */ });
```

- [ ] 실패 → 구현(localStorage 접근은 io 주입 — node 테스트는 메모리 io) → 통과 → 커밋

### Task 5: app-ui.js — 공통 크롬

**Files:** Create `map/app/app-ui.js`, Modify `map/app/app.css`(크롬 클래스)

**Produces:** `MS.ui.renderHeader(host)` · `MS.ui.renderTabbar(host)` · `MS.ui.flash(text, delta)` · `MS.ui.openSheet(name, contentEl)/closeSheet()` · `MS.ui.skeleton(on)` · `MS.ui.hap(kind)` · 전부 상태 구독으로 자동 갱신.

마크업 이식(원문 줄): 헤더 L75~104(로고 SVG 3분할+파동 없음 주의 — 헤더 로고는 L77 rect 3개, 상태바 L73은 **이식하지 않음**·실앱은 OS 상태바) · 탭바 L1643~1668(6칸·배지·◈ 스쿱 — 채점 배지 '3' 하드코딩은 상태 바인딩으로 교체) · 토스트 L1712~1714(+snackB 99/20px, 감액 3.2s 적색 msShakeX — 03 §7-5) · 시트 딤 L1716~1718(bottom 88px, deduct 제외 규칙은 P2) · 시트 드래그 닫기 90px+스크롤 가드(03 §7-5 로직 이식) · 스켈레톤 L1849~1861(180ms).

- [ ] 크롬 렌더 + 상태 연동(스쿱 숫자·활성 탭·배지) 구현
- [ ] 헤드리스 스크린샷: 다크/라이트 × 헤더/탭바/토스트/시트/스켈레톤 — 프로토타입과 나란히 비교
- [ ] 커밋

### Task 6: index.html + app-main.js(라우터) + 빈 홈

**Files:** Create `map/app/index.html`, `map/app/app-main.js`, `map/app/app-screen-home.js`

**Produces:** `MS.router.register(name, screen)` — screen = `{ mount(host), unmount() }` · `MS.router.go(name)`(heavy 화면 스켈레톤 180ms·visitXp 훅 자리·시트 자동 닫힘·sig 이탈 초기화 훅 — 03 §7-5) · 부팅: restore 성공→home, 실패→home 빈 상태(P1에서 boot/landing 분기 대체).

index.html 로드 순서(고정, defer 금지): `app-config → app-strings → app-state → app-ui → app-screen-home → app-main`. `../forge-core.js`는 P1부터.
빈 홈: "오늘의 종목 스쿱" 헤더행 + 빈 상태 카드(noMy 유사) — P1이 교체.

- [ ] 라우터 UMD 코어 테스트(등록·전환·미등록 화면 에러) → 구현 → 브라우저 부팅 확인 → 커밋

### Task 7: 관문 편입 — run.sh app 스위트 + 문법 하한

**Files:** Create `map/app/syntax-floor.test.js`, Modify `map/tests/run.sh`

- syntax-floor: `map/app/*.js`(테스트 제외) 소스를 읽어 ES2017 초과 문법 정규식 검사 — `?.` `??` `??=` `||=` `&&=` `#priv` `Object.hasOwn` `at(` 비파괴 배열(`toSorted|toReversed|toSpliced|with(`) 금지(주석·문자열 오탐은 한국어 백틱 표기 교훈 반영 — 코드 라인만). **_archive는 읽지 않고 새로 작성.**
- run.sh: `app` 스코프 추가(`node --test app/*.test.js`), `all`에 편입.

- [ ] 스위트 추가 → `./tests/run.sh` 전량 초록 확인 → 커밋

### Task 8: P0 종합 검증 + 문서

- [ ] `./tests/run.sh` 전량 통과(기존 800 + app 신규)
- [ ] 헤드리스: 부팅→홈, 탭 전환 4종, 테마 전환, 토스트, 시트 열고 닫기 — 스크린샷 세트 저장·시안 대조
- [ ] `map/CLAUDE.md`에 app 트랙 섹션 추가(파일 목록·로드 순서·관문·배포 미정 표기)
- [ ] BUILD-PLAN §7 P0 행에 완료 표기 · 커밋+푸시

## Self-Review 결과

- 커버리지: P0 범위(BUILD-PLAN §7 P0 행) 전 항목이 Task 1~8에 배정됨. FAB·PiP·레벨업 오버레이는 분석 흐름 소속 — P2로 명시 이월(마크업 원문 줄은 02 §3에 확보됨).
- 타입 일관성: `MS.config/str/state/ui/router` 시그니처를 Task 간 교차 인용으로 통일.
- 플레이스홀더: 테스트 코드는 실코드, UI 마크업은 프로토 원문 줄 번호가 원본(중복 전사 대신 인용) — 실행자는 본 세션(전체 컨텍스트 보유)이므로 인라인 실행.
