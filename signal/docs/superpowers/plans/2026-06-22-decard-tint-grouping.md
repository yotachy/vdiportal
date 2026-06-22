# 박스 남발 제거 — 틴트 그룹 + 상단 크롬 접기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** scoopsignal.html의 중첩 카드(보더+배경+라운드) 박스를 은은한 틴트 그룹으로 정리하고, 대시보드 상단 크롬(튜닝·방법론)을 한 줄 토글로 접어 시각 품질을 높인다.

**Architecture:** 순수 CSS/마크업 시각 정리. 보더를 제거하고 기존 토큰(`--ink`<`--panel`<`--panel-2`) 배경 차이로 그룹핑. `tune`/`method` `<details>`를 한 줄 토글 바(`.toolbar`)로 재배치(열면 본문 전폭). 데이터 상태(`.status`)는 이미 사이드바 하단에 보더 없이 존재 → 변경 없음. 점수 산식·데이터 로더·차트 렌더·뷰 라우터·티어 배지 로직은 일절 손대지 않는다.

**Tech Stack:** 순수 HTML5/CSS3/Vanilla JS 단일 파일. 빌드·프레임워크·라이브러리 없음. 검증은 WSL 헤드리스 playwright-core(chromium) 스크립트.

## Global Constraints

- 단일 파일 `signal/scoopsignal.html` 유지(분리 금지). 외부 의존성 추가 금지.
- 색은 전부 CSS 변수만(하드코딩 색 금지). 새 토큰 도입 금지 — 기존 `--ink/--panel/--panel-2/--line/--gold/--bull/--neutral/--bear` 및 `*-tint/*-dim`만 사용.
- `html{zoom:1.35}` 유지. UI 텍스트 한국어. 들여쓰기 2 spaces. 압축형 코드 스타일 유지.
- 좌측 컬러바 금지(아이콘 면·버튼만).
- **불변(절대 수정 금지):** 점수 산식(`scoreMom/Liq/Fun/Val`, `recompute`, `normW`), 데이터 로더(`loadUpbit/Llama/Dollar/Fred/Beacon/Etf`), 차트 렌더(`lineChart`/`buildGauge`/`renderRadar`/`renderQuad`/`drawCycle/Band/Heatmap`), 뷰 라우터(`showView`/`VIEW_DRAW`/`activeView`), 티어(`CHART_TIER`/`applyTierBadges`), 햄버거 드로어 JS(`openSide`/백드롭/ESC/resize). 렌더 대상 id(`#gasStats`/`#stakingStats`/`#scoreNum` 등)·함수명 불변.
- 디자인 원칙: 카드(보더+배경+라운드) 박스 남발 금지. 보더는 외곽 1겹 또는 입력/버튼에만. 라운드는 최외곽 컨테이너에만. 박스 안의 박스(중첩 카드) 금지. 카드 형태는 클릭 가능한 타일에만.
- 모바일 드로어(≤900px) `.side`는 오버레이라 배경(`--panel`)·`border-right` 유지(가독성). 데스크톱(>900px)만 무패널.

---

## 검증 하니스 (모든 Task 공통)

각 Task는 아래 헤드리스 스크립트로 검증한다. WSL에서 sudo 없이 추출한 chromium을 사용한다.

**1회 준비 (libs가 없을 때만):**
```bash
# playwright-core 모듈/크로미움 경로 (이 환경 기준)
PWC=/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core
CHROME=~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome
# /tmp/chrlibs 에 chromium 의존 .so 추출이 안돼 있으면 한 번 추출 (이미 있으면 생략)
ls /tmp/chrlibs >/dev/null 2>&1 || echo "최초 1회: 기존 메모리 headless-verify-wsl 절차로 /tmp/chrlibs 준비"
```

**검증 스크립트 템플릿** (`/tmp/verify.mjs`, Task별 ASSERTIONS만 교체):
```js
import { chromium } from '/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.js';
const file = 'file:///home/jschoi0223/projects/vdiportal/signal/scoopsignal.html';
const errs = [];
const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--no-sandbox'] });
for (const w of [1280, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`[${w}] JS: ${e.message}`));      // 미처리 JS 예외만 (네트워크 실패 무시)
  await p.goto(file, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => { /* ASSERTIONS: return object */ });
  console.log(`viewport ${w}:`, JSON.stringify(r));
  await p.screenshot({ path: `/tmp/decard-${w}.png`, fullPage: true });
  await ctx.close();
}
await b.close();
if (errs.length) { console.error('PAGEERRORS:', errs); process.exit(1); }
console.log('no JS pageerrors');
```
실행: `CHROME_BIN=~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome LD_LIBRARY_PATH=/tmp/chrlibs node /tmp/verify.mjs`

**환경이 준비 안 됐으면** (chromium libs 없음): 스크립트가 실행 불가하면 BLOCKED 처리하지 말고, 변경한 CSS의 정합성을 육안 확인 + `grep`으로 셀렉터 잔존 확인 후 보고하라. 컨트롤러가 최종 헤드리스 스크린샷을 별도 수행한다.

`pageerror` = 미처리 JS 예외만 집계한다(`console` 네트워크 4xx/5xx·CORS 실패는 데이터 소스 미연결 정상이므로 무시).

---

## Task 1: 디자인 원칙 지침 추가

**Files:**
- Modify: `signal/CLAUDE.md` (§8 코딩 컨벤션 말미)

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (문서 전용)

- [ ] **Step 1: §8 코딩 컨벤션에 원칙 항목 추가**

`signal/CLAUDE.md`의 `## 8. 코딩 컨벤션` 섹션에서 `- **톤:** 미니멀·다크.` 로 시작하는 줄을 찾아, 그 **바로 위**에 아래 한 항목(2줄)을 삽입한다:

```markdown
- **카드 박스 남발 금지.** 콘텐츠는 기본 "면(面)"으로 두고, 구분이 필요할 때만 배경 틴트 차이(`--ink`→`--panel`→`--panel-2`)와 여백으로 그룹핑한다. 보더(`--line`)는 외곽 1겹 또는 입력/버튼에만, 라운드는 최외곽 컨테이너에만 쓴다. 박스 안의 박스(중첩 카드) 금지. 카드 형태(보더+배경+라운드)는 클릭 가능한 타일에만 허용.
```

- [ ] **Step 2: 삽입 확인**

Run: `grep -n "카드 박스 남발 금지" signal/CLAUDE.md`
Expected: 1줄 매치(§8 안, 톤 항목 위).

- [ ] **Step 3: Commit**

```bash
git add signal/CLAUDE.md
git commit -m "ScoopSignal: 디자인 원칙 추가 — 카드 박스 남발 금지(틴트 그룹)"
```

---

## Task 2: 상단 크롬 접기 — 튜닝·방법론 한 줄 토글

**Files:**
- Modify: `signal/scoopsignal.html` (CSS `details.method`/`details.tune` 블록 146-172; 마크업 `<details class="tune">`/`<details class="method">` 373-401 주변)

**Interfaces:**
- Consumes: 기존 `<details class="tune">`(summary + `.tbody` 슬라이더), `<details class="method">`(summary + `.mbody`). 슬라이더 id(`wLiq`/`wMom`/…/`pS2`)·`#tReset`·`bindTune`/`syncTuneUI` 불변.
- Produces: `.toolbar` 컨테이너(두 토글을 감싸 한 줄 배치, 열면 전폭).

- [ ] **Step 1: 마크업 — 두 `<details>`를 `.toolbar`로 감싸기**

`signal/scoopsignal.html`에서 `<details class="tune">`(373행 부근) 바로 앞에 `<div class="toolbar">`를 열고, `</details>`(method 닫힘, 430행 부근 `.mbody` 종료 직후)의 뒤에 `</div>`를 닫는다. 즉 tune·method 두 `<details>`가 `.toolbar` 안에 연속으로 들어가도록 한다. 두 `<details>`의 **내부 마크업은 그대로** 둔다.

삽입 형태(전후 구조):
```html
  </section>            <!-- hero2 종료 -->

  <div class="toolbar">
  <details class="tune">
    ...기존 그대로...
  </details>

  <details class="method">
    ...기존 그대로...
  </details>
  </div>
```

- [ ] **Step 2: CSS — `details.tune`/`details.method` 박스 제거 + 한 줄 토글 스타일**

CSS에서 아래 두 블록을 교체한다.

기존 `/* status / methodology / footer */` 안의 method 관련(146-152)을 다음으로 교체:
```css
  details.method{background:none;border:none;border-radius:0;padding:0;margin:0}
  details.method summary{cursor:pointer;list-style:none;padding:4px 0;font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;gap:7px;color:var(--muted)}
  details.method summary::-webkit-details-marker{display:none}
  details.method summary:hover{color:var(--gold)}
  details.method summary:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:6px}
  details.method .arw{color:var(--gold);font-family:var(--mono)} details.method[open] .arw{transform:rotate(90deg)}
  .mbody{margin-top:6px;padding:12px 14px;background:var(--panel);border-radius:10px;font-size:12.5px;color:var(--muted);display:flex;flex-direction:column;gap:8px}
  .mbody code{font-family:var(--mono);color:var(--gold);background:var(--panel-2);padding:1px 5px;border-radius:4px;font-size:11.5px}
  .mbody h4{color:var(--text);font-size:12px;margin-top:8px}
```
(`footer` 줄 153은 그대로 유지.)

기존 `/* tuning panel */` 블록의 컨테이너·summary·body(156-165)를 다음으로 교체(슬라이더 `.trow`/`.tgrp-title`/`.treset` 규칙 166-172는 그대로 유지):
```css
  details.tune{background:none;border:none;border-radius:0;padding:0;margin:0;box-shadow:none}
  details.tune summary{cursor:pointer;list-style:none;padding:4px 0;font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;gap:9px;color:var(--gold)}
  details.tune summary::-webkit-details-marker{display:none}
  details.tune summary:hover{color:var(--gold);text-decoration:underline}
  details.tune summary:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:8px}
  details.tune .sum-left{display:inline-flex;align-items:center;gap:9px;flex-wrap:wrap}
  details.tune .sum-ic{color:var(--gold);display:inline-flex}
  details.tune .sum-badge{font-size:10.5px;font-weight:700;color:var(--gold);background:var(--neutral-dim);border-radius:999px;padding:3px 9px;white-space:nowrap}
  details.tune .arw{color:var(--gold);font-family:var(--mono);font-size:18px} details.tune[open] .arw{transform:rotate(90deg)}
  .tbody{margin-top:6px;padding:12px 14px;background:var(--panel);border-radius:10px;display:flex;flex-direction:column;gap:14px}
```
(`.sum-badge`의 `border:1px solid …` 제거됨 — 틴트 칩만. `.tbody`의 `border-top` 제거됨.)

- [ ] **Step 3: CSS — `.toolbar` 레이아웃 추가**

위 method 블록 바로 앞(또는 `/* status / methodology / footer */` 주석 직후)에 추가:
```css
  .toolbar{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:flex-start;margin:2px 2px 14px}
  .toolbar > details{flex:0 0 auto}
  .toolbar > details[open]{flex-basis:100%}
```
이로써 닫힘 상태에선 두 토글이 한 줄에 나란히, 펼치면 그 토글이 전폭을 차지하고 본문이 아래에 전폭으로 표시된다.

- [ ] **Step 4: 헤드리스 검증 (토글 동작 + 박스 제거 + 점수 반영)**

`/tmp/verify.mjs`의 ASSERTIONS를 다음으로 채워 실행:
```js
() => {
  const cs = el => el ? getComputedStyle(el) : null;
  const tune = document.querySelector('details.tune');
  const tuneSum = tune?.querySelector('summary');
  const tb = cs(tune);
  // 1) 튜닝 컨테이너 보더 0
  const tuneNoBorder = tb && tb.borderTopWidth === '0px' && tb.borderLeftWidth === '0px';
  // 2) 펼치기 동작 + 점수 재계산 호출 흔적: 슬라이더 input 발생 시 점수 노출 텍스트 존재
  tune.open = true;
  const bodyVisible = tune.querySelector('.tbody').offsetHeight > 0;
  // 3) toolbar 존재 + 닫힘 시 method/tune 같은 줄(top 동일) 확인용 위치
  const tcss = cs(document.querySelector('.toolbar'));
  return { tuneNoBorder, bodyVisible, toolbarDisplay: tcss?.display };
}
```
실행: `CHROME_BIN=~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome LD_LIBRARY_PATH=/tmp/chrlibs node /tmp/verify.mjs`
Expected: `tuneNoBorder:true, bodyVisible:true, toolbarDisplay:"flex"`, 그리고 `no JS pageerrors`. (환경 미준비 시 하니스 안내대로 grep+육안.)

- [ ] **Step 5: 슬라이더→점수 반영 비회귀 육안 확인**

`/tmp/decard-1280.png` 스크린샷에서 콘텐츠 위에 보더 박스가 없고 "⚙ 튜닝"·"방법론" 텍스트 토글만 보이는지 확인. (슬라이더 조작→recompute는 `bindTune` 불변이므로 로직 회귀 없음.)

- [ ] **Step 6: Commit**

```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 상단 크롬 접기 — 튜닝·방법론 한 줄 토글(.toolbar), 박스 제거"
```

---

## Task 3: 틴트 그룹 — 컨테이너 보더 제거

**Files:**
- Modify: `signal/scoopsignal.html` (CSS: `.ticker`/`.tk` 45-46, `.pane` 52, `.card`+data-sig 67-72, `.trig` 123, `.side` 219, hover 247; 마크업: gas/staking `.card` 래퍼 535·539 부근)

**Interfaces:**
- Consumes: Task 2 결과(toolbar). 렌더 대상 id `#gasStats`/`#stakingStats` 불변.
- Produces: 없음 (시각 전용).

- [ ] **Step 1: CSS — 티커 틴트 스트립**

`.ticker`(45)·`.tk`(46)를 교체:
```css
  .ticker{display:grid;grid-template-columns:repeat(3,1fr);gap:0;background:var(--panel);border-radius:12px;overflow:hidden;margin-bottom:16px}
  .tk{padding:12px 16px}
```
(외곽 `border` 제거, 셀 구분용 `gap:1px;background:var(--line)` 제거 → 단일 틴트 스트립. `.tk`의 `background:var(--panel)` 제거 — 스트립 배경 상속.)

- [ ] **Step 2: CSS — `.pane` 보더 제거**

`.pane`(52)를 교체:
```css
  .pane{background:var(--panel);border-radius:16px;padding:16px;display:flex;flex-direction:column}
```

- [ ] **Step 3: CSS — `.card` 보더 제거(틴트 유지)**

`.card` 관련(67-72)을 교체:
```css
  .card{background:var(--panel);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;position:relative;overflow:hidden}
  .card{transition:background .4s}
  .card[data-sig="bull"]{background:var(--bull-tint)}
  .card[data-sig="neutral"]{background:var(--neutral-tint)}
  .card[data-sig="bear"]{background:var(--bear-tint)}
  .card[data-sig="load"]{background:var(--panel)}
```
(모든 `border`/`border-color` 제거, transition에서 `border-color` 제거. `overflow:hidden` 등 기능 속성 유지.)

- [ ] **Step 4: CSS — `.trig` 가벼운 틴트 행**

`.trig`(123)를 교체:
```css
  .trig{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:9px;background:var(--panel);font-size:12.5px;color:var(--muted)}
```
(`--panel-2` 풀필 → `--panel` 가벼운 틴트. `.trig.on`/`.tdot`/`.tval` 규칙 124-128은 그대로.)

- [ ] **Step 5: CSS — 데스크톱 사이드바 무패널**

`.side`(219)를 교체:
```css
  .side{position:sticky;top:calc(var(--top-bar-h) + 16px);align-self:start;background:none;border:none;border-radius:0;padding:0;display:flex;flex-direction:column;gap:14px}
```
(데스크톱 패널 제거. ≤900px 미디어쿼리(234)가 드로어용 배경/`border-right`/padding을 재지정하므로 모바일은 영향 없음 — 234행은 수정 금지.)

- [ ] **Step 6: CSS — 클릭 타일 hover(보더 없음)**

`.signal-pane:hover,.hero-tile:hover`(247)와 `.hero-tile`(251)을 교체:
```css
  .signal-pane:hover,.hero-tile:hover{box-shadow:inset 0 0 0 1px var(--gold)}
```
```css
  .hero-tile{background:var(--panel);border-radius:14px;padding:14px;cursor:pointer;display:flex;flex-direction:column;gap:11px;flex:1}
```
(hover의 `border-color:gold` → 레이아웃 흔들림 없는 inset 골드 링. `.hero-tile` 보더 제거.)

- [ ] **Step 7: 마크업 — gas/staking `.card` 래퍼 제거**

gas 뷰(535행 부근):
```html
    <div class="card" style="max-width:520px"><div id="gasStats"></div></div>
```
→
```html
    <div id="gasStats" style="max-width:520px"></div>
```
staking 뷰(539행 부근):
```html
    <div class="card" style="max-width:520px"><div id="stakingStats"></div></div>
```
→
```html
    <div id="stakingStats" style="max-width:520px"></div>
```

- [ ] **Step 8: 헤드리스 검증 (보더 제거 + 모바일 드로어 배경 유지 + 회귀 0)**

`/tmp/verify.mjs`의 ASSERTIONS를 다음으로 채워 실행(뷰포트 1280·390 둘 다 자동):
```js
() => {
  const w = window.innerWidth;
  const bw = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).borderTopWidth : 'none'; };
  const sideBg = getComputedStyle(document.querySelector('.side')).backgroundColor;
  return {
    w,
    tickerBorder: bw('.ticker'),      // 두 뷰포트 모두 '0px' 기대
    paneBorder: bw('.pane'),          // '0px'
    sideBorderTop: bw('.side'),       // 데스크톱 '0px'
    sideBg,                           // 데스크톱 transparent(rgba 0), 모바일 패널색
    gasIsCard: !!document.querySelector('.view[data-view="gas"] .card'),  // false 기대
  };
}
```
실행: `CHROME_BIN=~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome LD_LIBRARY_PATH=/tmp/chrlibs node /tmp/verify.mjs`
Expected:
- viewport 1280: `tickerBorder:"0px", paneBorder:"0px", sideBorderTop:"0px", sideBg:"rgba(0, 0, 0, 0)", gasIsCard:false`
- viewport 390: `sideBg` = 패널색(`rgb(20, 26, 34)` = `#141A22`, 드로어 배경 유지), `tickerBorder:"0px"`
- `no JS pageerrors`
(환경 미준비 시 하니스 안내대로 grep으로 `.ticker{`/`.pane{`/`.side{`/gas·staking 마크업 잔존 확인 + 육안.)

- [ ] **Step 9: 스크린샷 육안 — 박스 수프 해소**

`/tmp/decard-1280.png`·`/tmp/decard-390.png`에서: 데스크톱 사이드바 무패널·항목 hover 틴트, 콘텐츠 영역 중첩 보더 박스 사라짐, 모바일 ☰ 드로어 정상(배경 유지). 차트·게이지 정상 렌더(데이터 미연결 부분은 "연결 필요" 정상).

- [ ] **Step 10: Commit**

```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 틴트 그룹 적용 — 티커·pane·card·사이드바·트리거 보더 제거 + gas/staking 카드 래퍼 제거"
```

---

## 최종 통합 검증 (전 Task 완료 후)

- [ ] 데스크톱(1280)·모바일(390) 헤드리스 스크린샷 최종본으로 박스 감소 육안 확인.
- [ ] 대시보드에서 ⚙ 튜닝 펼쳐 슬라이더 1개 조작 → 게이지 점수 변화(=`recompute` 정상) 육안 확인.
- [ ] 각 뷰(season/band/mayer/supply/gas/staking/treasury/trigger/squeeze/etf 등) 순회하며 차트·스탯 렌더 정상·JS 에러 0.
- [ ] 모바일 ☰ 드로어 열기/항목 클릭 닫힘/ESC/백드롭 회귀 0.

## Self-Review 메모 (작성자 점검 완료)

- **Spec 커버리지:** 원칙 추가(T1), 상단 크롬 접기·튜닝/방법론 토글(T2), 티커·사이드바·시그널면·히어로타일·4축card·gas/staking·trig 틴트화(T3) — spec §2·§4 전 항목 매핑. spec의 "데이터 상태 사이드바 이동"은 현 코드에서 이미 충족(§4.1) → 별도 Task 불요(계획 서두 명시).
- **불변 보장:** 모든 Task가 CSS/마크업 시각 속성만 변경, 함수·id·로직 미변경(Global Constraints).
- **타입/이름 일관성:** 신규 클래스 `.toolbar` 1개만 도입(T2 produce → T3 consume). 기존 셀렉터명 유지.
- **모바일 회귀 가드:** `.side` 데스크톱 규칙만 변경, ≤900px 미디어쿼리(234) 수정 금지를 T3 Step5에 명시.
