# 헤더 2단 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** scoopsignal.html 헤더를 브랜드/자산네비/계정·유틸 3존이 분명한 2단 구조로 재설계하고 모바일 반응형을 정비한다(유료 서비스 대비).

**Architecture:** `.top-bar` 안을 `.hdr-top`(브랜드 좌 + 유틸리티 우)과 `.hdr-nav`(자산 밑줄탭 스트립) 2단으로 재구성. 데스크톱은 유틸 4요소 전체 노출, ≤900px는 우측을 `[⟳][업그레이드]`로 축약하고 플랜·로그인·갱신시각을 햄버거 드로어 상단 계정 블록(`.side-acct`)으로 이전. 점수·데이터·차트·뷰 라우터 로직 불변, 기존 id/핸들러 유지.

**Tech Stack:** 순수 HTML5/CSS3/Vanilla JS 단일 파일. 무빌드. 검증은 WSL 헤드리스 playwright-core(chromium).

## Global Constraints

- 단일 파일 `signal/scoopsignal.html`. 외부 의존성 추가 금지. 색은 기존 CSS 변수만(하드코딩 색·신규 토큰 금지). `html{zoom:1.35}`, 한국어, 2 spaces, 압축형 코드 스타일. 좌측 컬러바 금지(마크는 SVG 면).
- "박스 남발 금지" 원칙: 유틸리티는 면+여백으로 구분, 보더는 버튼(`.login-btn`/`.upgrade-btn`)·배지(`.plan-badge`)·네비바 하단선에만.
- **불변(절대 수정 금지):** 점수 산식·데이터 로더·차트 렌더·뷰 라우터·티어 로직. 기존 id `#brandHome`(클릭→대시보드)·`#refreshBtn`·`#upgradeBtn`·`#updatedAt`·`#hambBtn`·`#sideClose`와 그 핸들러(`showView`/`openSide`/새로고침). 마크업 재배치만 허용.
- 자산 메뉴명·`준비중` 칩·disabled(비트코인/알트코인) 현행 유지. 이더리움 활성.

## 검증 하니스 (모든 Task 공통)

WSL chromium 사용(설치돼 있음). playwright-core는 CommonJS — 기본 import 후 구조분해:
```js
import pkg from '/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.js';
const { chromium } = pkg;
```
launch: `chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--no-sandbox'] })`
실행: `CHROME_BIN=/home/jschoi0223/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome LD_LIBRARY_PATH=/tmp/chrlibs node /tmp/verifyHdr.mjs`
파일 URL: `file:///home/jschoi0223/projects/vdiportal/signal/scoopsignal.html`. `pageerror`(미처리 JS 예외)만 실패로 집계(네트워크/CORS 콘솔 노이즈 무시). 스크린샷 저장 + computed-style/DOM 단정. 환경이 안 되면 grep+육안 폴백 후 보고(컨트롤러가 최종 헤드리스 수행).

---

## Task 1: 데스크톱 2단 헤더 구조

**Files:**
- Modify: `signal/scoopsignal.html` — 헤더 마크업(현 281-304행), top-bar CSS 블록(현 183-220행), `--top-bar-h`(21행), `#updatedAt` 기록부(현 1271행)

**Interfaces:**
- Consumes: 기존 id `#brandHome`/`#refreshBtn`/`#upgradeBtn`/`#updatedAt`/`#hambBtn`.
- Produces: 클래스 `.hdr-top`/`.hdr-brand`/`.brand`/`.brand-mark`/`.hdr-util`/`.hdr-status`/`.hdr-status-txt`/`.plan-badge`/`.login-btn`/`.hdr-nav`. (Task 2가 반응형에서 소비.)

- [ ] **Step 1: 헤더 마크업 교체 (2단 구조)**

`signal/scoopsignal.html`의 현재 `<header class="top-bar">` … `</header>` 전체(281행 `<header`부터 304행 `</div>` 다음의 `</header>`까지)를 아래로 교체한다. (기존 hamburger/upgrade/refresh SVG는 그대로 재사용.)

```html
<header class="top-bar">
  <div class="hdr-top">
    <div class="hdr-brand">
      <button class="hamb" id="hambBtn" type="button" aria-label="메뉴 열기" aria-expanded="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg></button>
      <a class="brand" id="brandHome" role="link" tabindex="0" title="이더리움 대시보드로 이동">
        <svg class="brand-mark" viewBox="0 0 32 32" width="20" height="20" aria-hidden="true"><path fill="currentColor" fill-opacity=".55" d="M16 3 16 12.3 24 16Z"/><path fill="currentColor" d="M16 3 8 16 16 12.3Z"/><path fill="currentColor" fill-opacity=".55" d="M16 17.6 16 29 24 17.5Z"/><path fill="currentColor" d="M16 29 16 17.6 8 17.5Z"/><path fill="currentColor" fill-opacity=".3" d="M16 16.1 8 16 16 12.3Z"/><path fill="currentColor" fill-opacity=".45" d="M24 16 16 16.1 16 12.3Z"/></svg>
        <span class="wordmark">Crypto<span class="em">Signal</span> <span class="by">by MoneyScoop</span></span>
      </a>
    </div>
    <div class="hdr-util">
      <div class="hdr-status">
        <button class="refresh-ic" id="refreshBtn" type="button" title="새로고침" aria-label="새로고침"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.36"/><path d="M21 4v5h-5"/></svg></button>
        <span class="hdr-status-txt"><span id="updatedAt">불러오는 중…</span><span class="auto">· 자동</span></span>
      </div>
      <span class="plan-badge">무료</span>
      <button class="login-btn" type="button" disabled title="준비 중">로그인</button>
      <button class="upgrade-btn" id="upgradeBtn" type="button" title="요금제 업그레이드"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 7.6l3.7 3 3.4-5.1a1.1 1.1 0 0 1 1.8 0l3.4 5.1 3.7-3a1 1 0 0 1 1.6 1.05l-1.8 8.2a1.2 1.2 0 0 1-1.18.95H5.36a1.2 1.2 0 0 1-1.18-.95L2.4 8.65A1 1 0 0 1 3 7.6Z"/></svg>업그레이드</button>
    </div>
  </div>
  <nav class="hdr-nav" aria-label="자산 전환">
    <button class="asset" data-asset="all" disabled>암호화폐 전체 <span class="soon">준비중</span></button>
    <button class="asset" data-asset="btc" disabled>비트코인 <span class="soon">준비중</span></button>
    <button class="asset on" data-asset="eth" aria-current="page">이더리움</button>
    <button class="asset" data-asset="alt" disabled>알트코인 <span class="soon">준비중</span></button>
  </nav>
</header>
```

`#brandHome`이 `<h1>`에서 `<a>`로 옮겨졌지만 id 동일 → 기존 클릭 핸들러 그대로 동작. 태그라인(`.tagline`)·`.eth-logo`·`.tb-left/.brand-row/.tb-right` 마크업은 제거됨.

- [ ] **Step 2: top-bar CSS 블록 교체**

CSS에서 `/* top bar (표준 헤더 — 전 에디션 공유) */` 주석부터 그 아래 `@media(max-width:560px){…}` 블록 끝(현 183-220행)까지를 아래로 교체한다. **(≤560 반응형은 Task 2에서 추가하므로 여기선 데스크톱 규칙만.)**

```css
  /* top bar — 2단 헤더 (브랜드 / 자산 네비 / 계정·유틸) */
  .top-bar{position:sticky;top:0;z-index:20;max-width:1180px;margin:0 auto 16px;background:rgba(11,15,20,.82);backdrop-filter:blur(8px)}
  .hdr-top{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 4px}
  .hdr-brand{display:flex;align-items:center;gap:10px;min-width:0}
  .brand{display:inline-flex;align-items:center;gap:9px;cursor:pointer;text-decoration:none;color:inherit}
  .brand:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:6px}
  .brand-mark{color:var(--eth);flex:0 0 auto}
  .brand:hover .em{filter:brightness(1.12)}
  .wordmark{font-size:21px;font-weight:800;letter-spacing:-.01em;white-space:nowrap}
  .wordmark .em{color:var(--gold)}
  .wordmark .by{font-size:12px;font-weight:600;color:var(--muted);letter-spacing:0;margin-left:3px}
  .hdr-util{display:flex;align-items:center;gap:14px;flex:0 0 auto}
  .hdr-status{display:flex;align-items:center;gap:7px}
  .hdr-status-txt{font-family:var(--mono);font-size:11px;color:var(--faint);white-space:nowrap}
  .hdr-status-txt .auto{margin-left:3px;opacity:.8}
  .plan-badge{font-size:10.5px;font-weight:700;color:var(--muted);background:var(--panel);border-radius:999px;padding:3px 10px;white-space:nowrap}
  .login-btn{appearance:none;font:inherit;font-size:12px;font-weight:600;color:var(--muted);background:none;border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer;white-space:nowrap}
  .login-btn:not([disabled]):hover{color:var(--text);border-color:var(--muted)}
  .login-btn[disabled]{color:var(--faint);cursor:not-allowed}
  .upgrade-btn{appearance:none;display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:700;color:var(--ink);background:var(--gold);border:none;border-radius:9px;padding:7px 13px;cursor:pointer;white-space:nowrap}
  .upgrade-btn:hover{filter:brightness(1.06)}
  .upgrade-btn:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .upgrade-btn svg{width:15px;height:15px;display:block}
  .hdr-nav{display:flex;align-items:stretch;gap:18px;padding:0 4px;border-bottom:1px solid var(--line)}
  .asset{appearance:none;font:inherit;font-size:12.5px;font-weight:600;color:var(--muted);background:none;border:none;border-bottom:2px solid transparent;border-radius:0;padding:9px 1px;margin-bottom:-1px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
  .asset:not([disabled]):hover{color:var(--text)}
  .asset.on{color:var(--gold);font-weight:800;border-bottom-color:var(--gold)}
  .asset[disabled]{color:var(--faint);cursor:not-allowed}
  .asset .soon{font-size:8.5px;font-weight:700;color:var(--faint);background:var(--panel);border-radius:4px;padding:1px 4px;letter-spacing:0}
  .asset:focus-visible{outline:2px solid var(--gold);outline-offset:-2px;border-radius:4px}
```

이전 `.wordmark`/`.asset-switch`/`.asset`/`.tagline`/`.tb-*`/`.upgrade-btn` 규칙은 위 블록으로 일원화되어 사라진다(중복 정의 금지 — 교체로 처리).

- [ ] **Step 3: `#updatedAt` 기록부 — 시각 포맷 정리 + 사이드 동기화 대비**

CSS/JS의 `#updatedAt` 기록 줄(현 1271행)
```js
  $('#updatedAt').textContent='업데이트 '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
```
을 아래로 교체한다(드로어용 `#updatedAtSide`는 Task 2에서 추가되며, 없으면 무시):
```js
  const _tm=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
  $('#updatedAt').textContent='갱신 '+_tm;
  const _us=document.querySelector('#updatedAtSide'); if(_us)_us.textContent=_tm;
```

- [ ] **Step 4: `--top-bar-h` 토큰을 실제 2단 높이로 재산정**

헤드리스로 데스크톱(1280) `.top-bar` 실제 높이를 측정한다. `/tmp/measureHdr.mjs`:
```js
import pkg from '/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.js';
const { chromium } = pkg;
const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const p = await ctx.newPage();
await p.goto('file:///home/jschoi0223/projects/vdiportal/signal/scoopsignal.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(800);
const h = await p.evaluate(()=>Math.round(document.querySelector('.top-bar').getBoundingClientRect().height));
console.log('top-bar height(px):', h);
await b.close();
```
실행: `CHROME_BIN=/home/jschoi0223/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome LD_LIBRARY_PATH=/tmp/chrlibs node /tmp/measureHdr.mjs`
출력된 높이(px)를 CSS 21행 `--top-bar-h:104px;`의 값으로 교체한다(예: 측정값이 92면 `--top-bar-h:92px;`). 이 값은 데스크톱 사이드바 sticky 위치(`.side{top:calc(var(--top-bar-h)+16px)}`)에만 쓰인다(모바일은 `.top-bar{position:static}`이라 무관).

- [ ] **Step 5: 헤드리스 검증 (데스크톱 1280)**

`/tmp/verifyHdr.mjs` ASSERTIONS:
```js
() => {
  const cs = el => getComputedStyle(el);
  const hdrTop = document.querySelector('.hdr-top');
  const eth = [...document.querySelectorAll('.hdr-nav .asset')].find(a=>a.dataset.asset==='eth');
  // 타이틀 클릭 → 대시보드
  if (window.showView) showView('season');
  document.querySelector('#brandHome').click();
  const dashActive = document.querySelector('.view[data-view="dashboard"]').classList.contains('active');
  return {
    hdrTopDisplay: cs(hdrTop).display,                 // flex
    utilExists: !!document.querySelector('.hdr-util'),
    statusTxtVisible: cs(document.querySelector('.hdr-status-txt')).display !== 'none', // 데스크톱 true
    planBadge: !!document.querySelector('.hdr-util .plan-badge'),
    loginBtn: !!document.querySelector('.hdr-util .login-btn'),
    navBorder: cs(document.querySelector('.hdr-nav')).borderBottomWidth, // 1px
    ethUnderline: cs(eth).borderBottomColor,           // gold rgb(232,180,99)
    taglineGone: !document.querySelector('.tagline'),  // true
    dashActive,                                        // true
  };
}
```
1280 단정: `hdrTopDisplay:"flex"`, `utilExists:true`, `statusTxtVisible:true`, `planBadge:true`, `loginBtn:true`, `navBorder:"1px"`, `ethUnderline` = `rgb(232, 180, 99)`, `taglineGone:true`, `dashActive:true`, JS 에러 0. 스크린샷 `/tmp/hdr-1280.png` 저장.

- [ ] **Step 6: 잔존 참조 확인**

Run: `grep -nE 'tb-left|tb-right|brand-row|class="tagline"|asset-switch' signal/scoopsignal.html`
Expected: 매치 없음(모두 제거됨). 있으면 정리.

- [ ] **Step 7: Commit**

```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 헤더 2단 구조(데스크톱) — 브랜드 마크+유틸 클러스터(상태·플랜·로그인·업그레이드)+자산 네비바, 태그라인 제거, --top-bar-h 재산정"
```

---

## Task 2: 반응형 + 드로어 계정 블록

**Files:**
- Modify: `signal/scoopsignal.html` — `@media(max-width:900px)` 블록(현 ~239-243행 부근), 신규 `@media(max-width:560px)` 블록, `.side-acct` CSS, 드로어 마크업(`.side` 안 `#sideClose` 아래), `.side-acct` base 숨김

**Interfaces:**
- Consumes: Task 1의 `.hdr-util`/`.hdr-status-txt`/`.plan-badge`/`.login-btn`/`.hdr-nav`/`.asset`, 기존 `.side`/`#sideClose`/`#updatedAtSide` 기록(Task1 Step3).
- Produces: `.side-acct` 계정 블록(드로어 전용).

- [ ] **Step 1: 드로어 계정 블록 마크업 추가**

`signal/scoopsignal.html`의 `<aside class="side">` 안, `<button class="side-close" id="sideClose" …></button>` 줄 **바로 다음**에 아래를 삽입한다(`.snav` 위):
```html
    <div class="side-acct">
      <div class="side-acct-row"><span class="plan-badge">무료</span><button class="login-btn" type="button" disabled title="준비 중">로그인</button></div>
      <div class="side-acct-upd">마지막 갱신 <span id="updatedAtSide">—</span></div>
    </div>
```

- [ ] **Step 2: `.side-acct` 기본(데스크톱) 숨김 CSS**

CSS에서 `.side-close{display:none}` 줄 **바로 다음**에 추가:
```css
  .side-acct{display:none}
```

- [ ] **Step 3: ≤900px 반응형 규칙 추가**

`@media(max-width:900px){` 블록 안(현재 `.side-backdrop.show{…}` 다음, 닫는 `}` 앞)에 아래를 추가한다:
```css
    .hdr-util .hdr-status-txt{display:none}
    .hdr-util .plan-badge,.hdr-util .login-btn{display:none}
    .hdr-util{gap:10px}
    .side-acct{display:flex;flex-direction:column;gap:10px;padding:0 2px 12px;border-bottom:1px solid var(--line);margin-bottom:4px}
    .side-acct-row{display:flex;align-items:center;gap:10px}
    .side-acct-upd{font-family:var(--mono);font-size:10.5px;color:var(--faint)}
```
(헤더 우측은 ⟳+업그레이드만 남고, 플랜·로그인은 헤더에서 숨겨지며 드로어 `.side-acct`에서 다시 보인다 — 드로어 `.plan-badge`/`.login-btn`은 `.hdr-util` 스코프 숨김 규칙에 안 걸리므로 자동 표시.)

- [ ] **Step 4: ≤560px 반응형 블록 신규 추가**

Task 1 Step 2에서 ≤560 블록을 제거했으므로, top-bar CSS 블록(마지막 `.asset:focus-visible{…}` 줄) **바로 다음**에 아래 블록을 추가한다:
```css
  @media(max-width:560px){
    body{padding-top:10px}
    .hdr-top{padding:8px 4px}
    .wordmark{font-size:17px}
    .wordmark .by{display:none}
    .upgrade-btn{padding:6px 10px;font-size:11.5px}
    .hdr-nav{gap:14px}
    .asset{font-size:11.5px;padding:8px 1px}
    .asset .soon{display:none}
  }
```

- [ ] **Step 5: 헤드리스 검증 (768 / 390 + 드로어 계정 블록)**

`/tmp/verifyHdr2.mjs` — 768·390 순회:
```js
() => {
  const cs = el => getComputedStyle(el);
  const w = window.innerWidth;
  const statusTxt = cs(document.querySelector('.hdr-status-txt')).display;       // none
  const hdrPlan = cs(document.querySelector('.hdr-util .plan-badge')).display;   // none
  document.querySelector('#hambBtn').click();
  const acct = document.querySelector('.side-acct');
  const acctDisplay = cs(acct).display;                                          // flex
  const drawerPlanShown = cs(acct.querySelector('.plan-badge')).display !== 'none'; // true
  const sideUpd = !!document.querySelector('#updatedAtSide');
  document.querySelector('#sideClose').click();
  return { w, statusTxt, hdrPlan, acctDisplay, drawerPlanShown, sideUpd };
}
```
단정: 두 폭 모두 `statusTxt:"none"`, `hdrPlan:"none"`, `acctDisplay:"flex"`, `drawerPlanShown:true`, `sideUpd:true`. JS 에러 0. 스크린샷 `/tmp/hdr-768.png`·`/tmp/hdr-390-open.png`(드로어 열린 상태) 저장.

- [ ] **Step 6: 갱신 동기화 확인 (드로어 시각)**

refresh가 1회 돈 뒤 `#updatedAt`과 `#updatedAtSide`가 같은 시각(HH:MM)을 갖는지 헤드리스로 확인하거나, file:// 데이터 미연결로 갱신이 안 돌면 수동으로 `recompute`/갱신 함수 호출 후 두 텍스트 비교. 최소 확인: 두 요소가 존재하고 갱신 함수가 둘 다 기록하도록 Task1 Step3가 적용됐는지 grep(`updatedAtSide`).

Run: `grep -c "updatedAtSide" signal/scoopsignal.html`
Expected: 2 (마크업 1 + JS 기록 1).

- [ ] **Step 7: Commit**

```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 헤더 반응형 — ≤900 우측 축약+드로어 계정 블록(.side-acct), ≤560 브랜드·탭 컴팩트, 갱신시각 드로어 동기화"
```

---

## 최종 통합 검증 (전 Task 완료 후)

- [ ] 1280/768/390 헤드리스 스크린샷 최종본: 위계 명확(브랜드/네비/유틸 분리), "엉망" 해소 육안.
- [ ] 데스크톱: 타이틀·마크 클릭→대시보드, 새로고침 동작, 자산탭 이더리움 활성.
- [ ] 모바일: ☰ 열기→계정 블록(무료·로그인·마지막 갱신) 표시→X 닫기, 우측 [⟳][업그레이드]만, 자산탭 1줄·깨짐 없음.
- [ ] 사이드바 sticky가 콘텐츠와 안 겹침(`--top-bar-h` 정상). JS 에러 0, 점수·차트 회귀 0.

## Self-Review 메모 (작성자 점검 완료)

- **Spec 커버리지:** 2단 구조(T1 Step1-2)·우측 4요소(T1 Step1)·태그라인 제거(T1 Step1-2)·`--top-bar-h` 재산정(T1 Step4)·≤900 축약+드로어 계정(T2 Step1-3)·≤560 컴팩트(T2 Step4)·`#updatedAt` 양쪽 동기화(T1 Step3 + T2 Step1)·기존 id/핸들러 유지 — spec §4·5·7 전 항목 매핑.
- **불변 보장:** 마크업 재배치 + CSS + `#updatedAt` 기록 1줄 외 로직 무변경. 기존 id 전부 유지(`#brandHome`은 `<a>`로 이동, id 동일).
- **타입/이름 일관성:** Task1 produce 클래스(`.hdr-util`/`.hdr-status-txt`/`.plan-badge`/`.login-btn`/`.side` 등)를 Task2가 동일명으로 소비. `#updatedAtSide`는 T1 Step3(기록)·T2 Step1(마크업)에서 동일.
- **반응형 가드:** `.hdr-util` 스코프 숨김(`.hdr-util .plan-badge`)으로 드로어 사본은 영향 없음 — 재표시 규칙 불필요(명시).
