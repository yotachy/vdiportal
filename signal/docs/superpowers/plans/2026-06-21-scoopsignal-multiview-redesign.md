# ScoopSignal 멀티뷰 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ScoopSignal(`scoopsignal.html`)을 표준 헤더 + 자산 스위쳐 + 8개 전용 뷰(SPA) 구조로 재배치하고, 금지된 좌측 컬러바를 은은한 틴트 신호로 교체한다.

**Architecture:** 단일 정적 HTML 파일을 유지한 채 JS 뷰 라우터(`showView`)로 다중 페이지를 구현한다. 데이터 로더·점수 산식·`recompute()` 계산 로직은 손대지 않고, HTML 구조 재배치 + 헤더/틴트 CSS + 탭로직→뷰 라우터 교체만 수행한다.

**Tech Stack:** 순수 HTML5 · CSS3 · Vanilla JS (빌드 도구·프레임워크·외부 라이브러리 없음). 폰트 CDN 2종(Pretendard, JetBrains Mono)만 외부.

## Global Constraints

- 단일 파일: 모든 변경은 `signal/scoopsignal.html` 한 파일 안에서. 파일 분리 금지.
- 디자인 토큰만: 색·라운드·그림자는 `:root` CSS 변수만. 하드코딩 색 금지. 신호 틴트가 필요하면 `:root`에 `--*-tint` 토큰을 추가해 사용.
- 전역 줌 유지: `html{zoom:1.35}` 리셋 금지.
- 좌측 바 금지: 카드·네비 어디에도 `::before` 좌측 컬러바, `box-shadow:inset Npx 0` 좌측 바를 두지 않는다.
- UI 텍스트 한국어. `--mono`(JetBrains Mono)로 숫자. `%`와 `%ile` 인접 금지(분위는 `prMeter` 막대로).
- 데이터·산식 불변: `loadBinance/loadLlama/loadDollar/loadFred/loadBeacon`, `scoreMom/scoreLiq/scoreFun/scoreVal`, `recompute()`의 계산부, 튜닝/`CFG`/localStorage 동작을 변경하지 않는다.
- 방어적 동작 보존: `Promise.allSettled` 그레이스풀 디그레이드, 캔버스는 표시 후 그리기(숨김 상태 0크기 렌더 금지).
- 자산 스위쳐: 이더리움만 활성(`aria-current="page"`), 전체·비트코인·알트는 비활성 + `준비중`.
- 코드 스타일: 기존 압축형(한 줄 다문장) 컨벤션과 2-space 들여쓰기 유지.

**검증 방식 안내:** 이 프로젝트는 테스트 프레임워크가 없는 정적 HTML이다. 각 태스크의 "테스트"는 (a) 로컬 정적 서버 + 헤드리스 Chromium 스크린샷(WSL: 메모리 `headless-verify-wsl` 참조), (b) DOM/콘솔 점검으로 한다. 단위테스트 코드는 작성하지 않는다.

검증용 로컬 서버(한 번만 띄움):
```bash
cd /home/jschoi0223/projects/vdiportal/signal && python3 -m http.server 8080
# → http://localhost:8080/scoopsignal.html
```

---

## File Structure

- Modify only: `signal/scoopsignal.html`
  - `<head><style>` — 헤더/자산 스위쳐/틴트/네비/뷰/패턴 페이지 CSS. 죽은 탭 CSS 제거.
  - `<body>` — 상단 헤더 신설, 사이드바 축소(네비+상태), 메인을 8개 `data-view` 섹션으로 재배치.
  - `<script>` — `showView` 라우터, `activeView` 기반 차트 렌더, 자산 스위쳐 바인딩, 최소 `showToast` 유틸. 데이터/산식 불변.

진행 순서는 "항상 화면이 깨지지 않게" 설계했다: 먼저 라우팅 골격(뷰 분리) → 헤더/스위쳐 → 틴트/네비 → 패턴 페이지 다듬기 → 정리/검증.

---

### Task 1: 뷰 라우터 골격 — 탭 로직을 뷰 전환으로 교체

주기 패턴 탭(`data-tab`/`.panel-chart`/`selectPattern`)을 일반 뷰 라우터로 바꾸고, 대시보드를 하나의 뷰로 묶는다. 이 태스크 후에도 화면 구성은 거의 동일하되, "대시보드"와 각 패턴이 별개 뷰로 분리되어 한 번에 하나만 보인다.

**Files:**
- Modify: `signal/scoopsignal.html` (body 메인 영역 + script 라우팅부)

**Interfaces:**
- Consumes: 기존 `S`, `recompute()`, `draw*` 함수들, `updateSideBadges()`.
- Produces:
  - 전역 `let activeView='dashboard';`
  - `function showView(key)` — 네비 `.on` 토글 + `[data-view]` 섹션 표시 토글 + 패턴이면 해당 차트 draw.
  - `const VIEW_DRAW = {season:drawHeatmap, cycle:drawCycle, halving:drawHalving, band:drawBand, mayer:drawMayer, dd:drawDrawdown, vol:drawVol};`
  - `function drawActiveView()` — `activeView`가 패턴이면 `VIEW_DRAW[activeView]()` 호출(데이터 가드 포함).

- [ ] **Step 1: 메인 영역을 8개 뷰 섹션으로 감싼다**

`<main class="main">` 내부를 아래 구조로 재배치한다. 티커는 모든 뷰 공통이므로 뷰 밖 최상단에 유지. 기존 hero/dims/tune/method 블록은 그대로 `data-view="dashboard"` 섹션 안으로 이동. 기존 7개 `.panel-chart` 각각을 독립 `<section class="view" data-view="{key}">`로 승격한다.

```html
<main class="main">
  <!-- 티커: 모든 뷰 공통 -->
  <div class="ticker"> … 기존 그대로 … </div>

  <!-- 뷰: 대시보드 -->
  <section class="view active" data-view="dashboard">
    … 기존 <section class="hero">, 축별 상세 <section>, <details class="tune">, <details class="method"> 를 이 안으로 이동 …
  </section>

  <!-- 뷰: 계절성 -->
  <section class="view" data-view="season">
    <div class="page-head"><h2>계절성</h2><p class="page-sub">월별 수익률(%) — 행=연도, 열=월. <span class="up">초록</span>=상승 <span class="down">빨강</span>=하락. 맨 아래 <b>평균</b> 행이 계절성입니다.</p></div>
    <div class="hm" id="heatmap"></div>
  </section>

  <!-- 뷰: 사이클 오버레이 -->
  <section class="view" data-view="cycle">
    <div class="page-head"><h2>사이클 오버레이</h2><p class="page-sub">각 사이클 바닥을 100으로 맞춰 겹쳐봅니다(로그). 현재가 과거 사이클의 어느 구간인지 비교용입니다.</p></div>
    <canvas id="cvCycle"></canvas>
  </section>

  <!-- 뷰: 반감기 -->
  <section class="view" data-view="halving">
    <div class="page-head"><h2>반감기</h2><p class="page-sub">BTC 반감기 시점을 100으로 맞춰 겹친 사이클(로그). 과거=회색, <span style="color:var(--gold)">현재(2024)=골드</span>. x축=반감기 후 경과(주). <span id="hvStats" style="color:var(--muted)"></span></p></div>
    <canvas id="cvHalving"></canvas>
  </section>

  <!-- 뷰: 로그 밴드 -->
  <section class="view" data-view="band">
    <div class="page-head"><h2>로그 회귀 밴드</h2><p class="page-sub">주간 종가의 <b>로그-로그 파워로 회귀</b> 채널(±1σ·±2σ, ETH 제네시스 기준). 하단=상대적 저평가, 상단=과열.<br><span id="bandStats" style="color:var(--muted)"></span></p></div>
    <canvas id="cvBand"></canvas>
  </section>

  <!-- 뷰: 200주 배수 -->
  <section class="view" data-view="mayer">
    <div class="page-head"><h2>200주 배수</h2><p class="page-sub">현재가 / 200주 이동평균 배수(메이어 멀티플). 밴드는 ETH 자체 분포 기준(저평가 하위 20%·과열 상위 20%). <span id="mayerStats" style="color:var(--muted)"></span></p></div>
    <canvas id="cvMayer"></canvas>
  </section>

  <!-- 뷰: 드로다운 -->
  <section class="view" data-view="dd">
    <div class="page-head"><h2>드로다운</h2><p class="page-sub">전고점(ATH) 대비 낙폭(%). 0 아래로 깊을수록 약세장 바닥권에 가깝습니다. <span id="ddStats" style="color:var(--muted)"></span></p></div>
    <canvas id="cvDD"></canvas>
  </section>

  <!-- 뷰: 변동성 -->
  <section class="view" data-view="vol">
    <div class="page-head"><h2>변동성</h2><p class="page-sub">주간 수익률 기반 실현 변동성(연율 %). 낮은 구간=압축(큰 움직임 전조로 자주 거론). <span id="volStats" style="color:var(--muted)"></span></p></div>
    <canvas id="cvVol"></canvas>
  </section>
</main>
```

주의: 기존 `<section class="charts">`(주기 패턴 박스)와 그 안의 `.panel-chart` 래퍼·`.chart-note`·`.sec-head`는 제거하고 위 구조로 분해한다. `id`(`heatmap`, `cvCycle`, `cvHalving`, `cvBand`, `cvMayer`, `cvDD`, `cvVol`, `bandStats`, `ddStats`, `hvStats`, `volStats`, `mayerStats`)는 그대로 보존해 JS가 찾을 수 있게 한다.

- [ ] **Step 2: 뷰/페이지헤더 CSS 추가, 죽은 패턴-탭 CSS 제거**

`<style>`에 추가:
```css
/* views */
.view{display:none}
.view.active{display:block}
.page-head{margin:2px 2px 14px}
.page-head h2{font-size:18px;font-weight:800;letter-spacing:-.02em}
.page-head .page-sub{font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.6;max-width:78ch}
```
제거: `.charts{…}`, `.panel-chart{display:none}`, `.panel-chart.active{display:block}`, `.chart-note{…}` (이제 미사용). `canvas{…height:300px}` 규칙은 Task 5에서 조정하므로 지금은 유지.

- [ ] **Step 3: 네비 항목을 data-view 키로 교체**

사이드바 `<nav class="snav">`를 대시보드 항목 + 두 그룹으로 교체. `data-tab`을 `data-view`로 바꾸고 `dashboard` 항목 추가:
```html
<nav class="snav" aria-label="화면 이동">
  <button class="snav-item on" data-view="dashboard">대시보드</button>
  <div class="snav-group">사이클</div>
  <button class="snav-item" data-view="season">계절성 <span class="snav-badge">—</span></button>
  <button class="snav-item" data-view="cycle">사이클 오버레이 <span class="snav-badge">—</span></button>
  <button class="snav-item" data-view="halving">반감기 <span class="snav-badge">—</span></button>
  <div class="snav-group">밸류·리스크</div>
  <button class="snav-item" data-view="band">로그 밴드 <span class="snav-badge">—</span></button>
  <button class="snav-item" data-view="mayer">200주 배수 <span class="snav-badge">—</span></button>
  <button class="snav-item" data-view="dd">드로다운 <span class="snav-badge">—</span></button>
  <button class="snav-item" data-view="vol">변동성 <span class="snav-badge">—</span></button>
</nav>
```

- [ ] **Step 4: JS — selectPattern/activeTab/drawActiveChart를 뷰 라우터로 교체**

기존 코드 블록(파일 하단부)을 교체한다.

제거 대상(기존):
```js
let activeTab='season';
function drawActiveChart(){({season:drawHeatmap,cycle:drawCycle,band:drawBand,dd:drawDrawdown,halving:drawHalving,vol:drawVol,mayer:drawMayer}[activeTab]||(()=>{}))();}
…
function selectPattern(tab){
  activeTab=tab;
  document.querySelectorAll('.snav-item').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  document.querySelectorAll('.panel-chart').forEach(p=>p.classList.toggle('active',p.dataset.panel===tab));
  if(S.month)drawActiveChart();
}
document.querySelectorAll('.snav-item').forEach(b=>b.addEventListener('click',()=>selectPattern(b.dataset.tab)));
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(S.month&&activeTab!=='season')drawActiveChart();},200);});
```

교체 후:
```js
let activeView='dashboard';
const VIEW_DRAW={season:drawHeatmap,cycle:drawCycle,halving:drawHalving,band:drawBand,mayer:drawMayer,dd:drawDrawdown,vol:drawVol};
function drawActiveView(){const fn=VIEW_DRAW[activeView];if(fn&&S.month)fn();}
function showView(key){
  activeView=key;
  document.querySelectorAll('.snav-item').forEach(b=>b.classList.toggle('on',b.dataset.view===key));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===key));
  drawActiveView();              // 표시 후 그리기(캔버스 0크기 회피)
}
document.querySelectorAll('.snav-item').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(S.month&&VIEW_DRAW[activeView])drawActiveView();},200);});
```

- [ ] **Step 5: recompute()의 차트 호출을 뷰 기반으로 교체**

`recompute()` 내부 마지막의:
```js
  if(S.month)drawActiveChart();
  updateSideBadges();
```
를:
```js
  if(S.month)drawActiveView();
  updateSideBadges();
```
로 바꾼다. (대시보드 게이지/레이더/사이클시계 렌더는 그 위에 그대로 두고, 패턴 차트만 활성 뷰일 때 그린다.)

- [ ] **Step 6: 검증 — 뷰 전환 동작**

로컬 서버로 `scoopsignal.html`을 연다. 헤드리스 스크린샷 또는 수동 확인으로:
- 기본 화면 = 대시보드(게이지+카드)만 보이고 패턴 차트 섹션은 숨김.
- 사이드바에서 "로그 밴드" 클릭 → 밴드 캔버스가 정상 크기로 렌더, 대시보드는 숨김.
- "계절성" 클릭 → 히트맵 표시. 다시 "대시보드" → 게이지 복귀.
- 콘솔 에러 없음(`drawActiveChart is not defined` 등 부재 확인).
- 좁은 폭(<900px)에서 네비가 상단 그리드로 전환되는지(기존 반응형 유지).

Expected: 8개 뷰 전환 정상, 캔버스 4종 모두 보일 때 정상 크기.

- [ ] **Step 7: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 탭 로직을 뷰 라우터로 교체(대시보드+패턴 8뷰 분리)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 표준 상단 헤더 + 자산 스위쳐

브랜드를 사이드바에서 빼고, 전 자산 에디션이 공유할 표준 헤더를 신설한다. 자산 스위쳐로 ETH 에디션임을 인지시킨다.

**Files:**
- Modify: `signal/scoopsignal.html` (body 최상단 헤더 신설, 사이드바 브랜드 제거, script 스위쳐 바인딩 + 최소 토스트)

**Interfaces:**
- Consumes: 기존 `#refreshBtn`, `#updatedAt`, `refresh()`.
- Produces:
  - `function showToast(msg)` — 우하단 토스트(요소 없으면 생성). 전역.
  - `const ASSETS=[{key:'all',label:'전체',live:false},{key:'btc',label:'비트코인',live:false},{key:'eth',label:'이더리움',live:true},{key:'alt',label:'알트',live:false}];`
  - 헤더 DOM: `.top-bar` > `.brand-row`(아이브로우+워드마크+자산 스위쳐) + `.tagline` + 우측 액션(refresh+updatedAt).

- [ ] **Step 1: 헤더 DOM 추가(.app 위, body 직속)**

`<body>` 바로 다음, `<div class="app">` 위에 삽입:
```html
<header class="top-bar">
  <div class="tb-left">
    <div class="eyebrow">머니스쿱</div>
    <div class="brand-row">
      <h1 class="wordmark">Scoop<span class="em">Signal</span></h1>
      <nav class="asset-switch" aria-label="자산 에디션">
        <button class="asset" data-asset="all" disabled title="준비 중">전체</button>
        <button class="asset" data-asset="btc" disabled title="준비 중">비트코인</button>
        <button class="asset on" data-asset="eth" aria-current="page">이더리움</button>
        <button class="asset" data-asset="alt" disabled title="준비 중">알트</button>
      </nav>
    </div>
    <p class="tagline">이더리움 신호 엔진 · 가격·온체인·유동성·사이클 4축 점수화</p>
  </div>
  <div class="tb-right">
    <button class="refresh" id="refreshBtn" type="button"><span class="dot"></span>새로고침</button>
    <span id="updatedAt">불러오는 중…</span>
  </div>
</header>
```

- [ ] **Step 2: 사이드바에서 브랜드/새로고침 블록 제거**

사이드바 `<aside class="side">`에서 `.side-brand` div와 `.upd` div(새로고침 버튼+`#updatedAt`)를 **삭제**한다. (둘 다 헤더로 이전됨. `#refreshBtn`·`#updatedAt`는 헤더에 새로 존재하므로 id 중복 없음.) 사이드바에는 `<nav class="snav">`와 `.side-foot`(상태)만 남는다.

- [ ] **Step 3: 헤더/스위쳐 CSS 추가**

```css
/* top bar (표준 헤더 — 전 에디션 공유) */
.top-bar{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;
  max-width:1180px;margin:0 auto 16px;padding:14px 4px 14px;border-bottom:1px solid var(--line);background:rgba(11,15,20,.82);backdrop-filter:blur(8px)}
.tb-left{min-width:0}
.brand-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:3px}
.wordmark{font-size:22px;font-weight:800;letter-spacing:-.01em}
.wordmark .em{color:var(--gold)}
.tagline{font-size:12.5px;color:var(--muted);margin-top:5px}
.asset-switch{display:inline-flex;gap:2px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:3px}
.asset{appearance:none;font:inherit;font-size:12px;font-weight:600;color:var(--muted);background:none;border:none;border-radius:7px;padding:6px 11px;cursor:pointer}
.asset:not([disabled]):hover{color:var(--text)}
.asset.on{background:var(--gold);color:#0B0F14}
.asset[disabled]{color:var(--faint);cursor:not-allowed}
.asset:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.tb-right{display:flex;align-items:center;gap:12px}
.tb-right #updatedAt{font-family:var(--mono);font-size:11px;color:var(--faint);white-space:nowrap}
@media(max-width:560px){.top-bar{align-items:flex-start;flex-direction:column}.tb-right{align-self:stretch;justify-content:space-between}}
```
참고: 기존 `.side-brand` 관련 CSS와 `.side .upd` CSS는 이제 미사용 → 제거(죽은 코드). `.brand h1{…}` 등 옛 헤더 셀렉터가 남아 있으면 함께 제거.

- [ ] **Step 4: 최소 토스트 유틸 + 자산 스위쳐 바인딩(JS)**

스크립트 하단(초기화 직전)에 추가:
```js
/* 토스트(요소 없으면 생성) */
function showToast(msg){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);}t.textContent=msg;t.classList.add('show');clearTimeout(showToast._t);showToast._t=setTimeout(()=>t.classList.remove('show'),2200);}
/* 자산 스위쳐: ETH만 활성, 나머지 준비중 */
document.querySelectorAll('.asset').forEach(b=>b.addEventListener('click',()=>{if(b.disabled)return;if(b.dataset.asset!=='eth')showToast('준비 중인 에디션입니다');}));
```
토스트 CSS도 추가:
```css
.toast{position:fixed;right:24px;bottom:24px;z-index:50;background:#1B232D;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:11px 16px;font-size:12.5px;opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .2s,transform .2s}
.toast.show{opacity:1;transform:translateY(0)}
```
(비활성 버튼은 클릭 이벤트가 막히는 브라우저가 있어, 추후 확장 대비 핸들러는 둔다. 현재는 ETH만 활성이므로 동작상 무해.)

- [ ] **Step 5: 검증 — 헤더/스위쳐**

로컬에서 확인:
- 헤더에 `머니스쿱 / ScoopSignal / [전체][비트코인][●이더리움][알트] / 태그라인`이 보이고, 이더리움이 골드 활성.
- 새로고침 버튼·업데이트 시각이 헤더 우측에 있고 클릭 시 데이터 갱신.
- 사이드바 상단에 브랜드/새로고침이 더는 없고 네비부터 시작.
- 콘솔 에러 없음, `#updatedAt`이 새로고침 후 시각으로 갱신.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 표준 상단 헤더 + 자산 스위쳐(ETH 활성/나머지 준비중)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 좌측 컬러바 제거 → 틴트 신호(카드) + 네비 활성 재표현

금지된 좌측 바를 카드 면 틴트 + 테두리 신호색으로, 활성 네비를 좌측 바 없이 재표현한다.

**Files:**
- Modify: `signal/scoopsignal.html` (`<style>` 카드/네비 규칙)

**Interfaces:**
- Consumes: 기존 `.card[data-sig]`, `.snav-item.on`, `:root` 토큰.
- Produces: `:root`에 `--bull-tint/--neutral-tint/--bear-tint` 토큰 추가.

- [ ] **Step 1: 틴트 토큰 추가**

`:root`의 dim 토큰 줄 아래에 추가:
```css
    --bull-tint:rgba(70,194,142,.06); --neutral-tint:rgba(224,169,59,.06); --bear-tint:rgba(224,106,106,.06);
```

- [ ] **Step 2: 카드 좌측 바 제거 + 틴트/테두리로 교체**

제거(기존):
```css
  .card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--faint);transition:background .4s}
  .card[data-sig="bull"]::before{background:var(--bull)}.card[data-sig="neutral"]::before{background:var(--neutral)}.card[data-sig="bear"]::before{background:var(--bear)}
```
교체(신규): `.card`의 `overflow:hidden`은 유지하되 좌측 바 대신 면/테두리 신호색.
```css
  .card{transition:background .4s,border-color .4s}
  .card[data-sig="bull"]{background:var(--bull-tint);border-color:rgba(70,194,142,.3)}
  .card[data-sig="neutral"]{background:var(--neutral-tint);border-color:rgba(224,169,59,.3)}
  .card[data-sig="bear"]{background:var(--bear-tint);border-color:rgba(224,106,106,.3)}
  .card[data-sig="load"]{background:var(--panel);border-color:var(--line)}
```
(`.card` 기본 규칙의 `position:relative;overflow:hidden`은 그대로 둔다 — 다른 내부 요소에 영향 없음.)

- [ ] **Step 3: 네비 활성 — 좌측 바 제거**

제거(기존):
```css
  .snav-item.on{background:var(--panel-2);color:var(--text);border-color:var(--line);box-shadow:inset 3px 0 0 var(--gold)}
```
교체(신규, 좌측 바 없이 배경+테두리+골드 텍스트):
```css
  .snav-item.on{background:var(--panel-2);color:var(--gold);border-color:var(--line);font-weight:700}
```

- [ ] **Step 4: 검증 — 금지 패턴 부재 + 틴트 표시**

```bash
cd /home/jschoi0223/projects/vdiportal/signal
grep -nE "inset [0-9]+px 0|::before\{[^}]*width:3px" scoopsignal.html || echo "OK: 좌측 바 없음"
```
Expected: `OK: 좌측 바 없음` (좌측 인셋 바/3px ::before 규칙이 검색되지 않음).
시각 확인: 데이터 로드 후 4축 카드가 신호색별로 면 전체가 은은히 틴트되고 테두리가 신호색. 활성 네비 항목은 좌측 바 없이 골드 텍스트+배경.

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 좌측 컬러바 제거 → 카드 틴트 신호 + 네비 활성 재표현

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 패턴 전용 페이지 다듬기 — 차트 키우기 + 페이지 헤더 정리

전용 페이지답게 차트 높이를 키우고, 페이지 헤더(제목+설명+현재값)가 일관되게 보이도록 마무리한다.

**Files:**
- Modify: `signal/scoopsignal.html` (`<style>` 캔버스 높이, 필요 시 페이지헤더 미세 조정)

**Interfaces:**
- Consumes: Task 1의 `.view`, `.page-head`, 캔버스 id들.
- Produces: 패턴 뷰 전용 캔버스 높이 규칙.

- [ ] **Step 1: 패턴 뷰 캔버스 높이 상향**

기존 `canvas{display:block;width:100%;height:300px}`를 유지하되, 패턴 뷰 안에서는 더 크게:
```css
  .view[data-view] canvas{height:300px}
  .view[data-view="cycle"] canvas,
  .view[data-view="halving"] canvas,
  .view[data-view="band"] canvas,
  .view[data-view="mayer"] canvas,
  .view[data-view="dd"] canvas,
  .view[data-view="vol"] canvas{height:clamp(360px,52vh,460px)}
```
(히트맵 `season`은 캔버스가 아니므로 영향 없음. clamp으로 화면 높이에 적응.)

- [ ] **Step 2: 히트맵 폭 — 전용 페이지에서 넉넉히**

기존 `.hm-row{… min-width:560px}`는 좁은 탭 기준이었다. 전용 페이지에서 가독성을 위해 그대로 두되, 컨테이너가 넓어졌으므로 `.hm`이 가로 스크롤 없이 채워지는지 확인만 한다(별도 변경 불필요. 깨지면 `min-width`를 640px로 상향).

- [ ] **Step 3: 검증 — 전용 페이지 판독성**

각 패턴 뷰를 열어 캔버스가 360~460px 높이로 크게 렌더되는지, 페이지 헤더(제목+설명+현재값 통계)가 차트 위에 일관되게 보이는지 확인. resize 후에도 재렌더 정상.

- [ ] **Step 4: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 패턴 전용 페이지 차트 높이 상향 + 페이지 헤더 정리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 산식 안내문 갱신 + 죽은 CSS 정리 + 최종 검증/배포

대시보드 하단 산식 아코디언의 "좌측 사이드바 탭" 문구를 새 구조에 맞게 갱신하고, 미사용 CSS를 정리한 뒤 헤드리스 스크린샷으로 최종 검증하고 배포한다.

**Files:**
- Modify: `signal/scoopsignal.html` (method 본문 문구, 죽은 CSS)

**Interfaces:**
- Consumes: 전체 결과물.

- [ ] **Step 1: method 아코디언 문구 갱신**

`<details class="method">` 본문 중 패턴 관련 안내문을 새 구조에 맞게 수정한다. 기존:
```
주기 패턴(계절성·…)은 좌측 사이드바에서 선택하며, 각 항목 옆 배지는 현재값입니다.
```
→ 의미 보존하되 "전용 페이지" 표현으로:
```
주기 패턴(계절성·사이클/반감기 오버레이·로그밴드·200주배수·드로다운·변동성)은 좌측 네비의 전용 페이지에서 보며, 각 항목 옆 배지는 현재값입니다.
```
(다른 산식 설명은 데이터/로직 불변이므로 수정하지 않는다.)

- [ ] **Step 2: 죽은 CSS 스캔/제거**

다음 셀렉터가 더 이상 마크업에서 쓰이지 않으면 제거: `.charts`, `.panel-chart`, `.chart-note`, `.sec-head`(대시보드에서 아직 쓰면 유지), `.side-brand`, `.side .upd`, 옛 `.brand h1/.brand p`, `.refresh`가 사이드바 전용으로 남긴 규칙(헤더에서 재사용하므로 `.refresh`는 유지). 사용처 확인:
```bash
cd /home/jschoi0223/projects/vdiportal/signal
for s in charts panel-chart chart-note side-brand; do echo "== $s =="; grep -n "class=\"[^\"]*$s" scoopsignal.html; done
```
마크업에서 0건이면 해당 CSS 규칙 삭제.

- [ ] **Step 3: 헤드리스 스크린샷 최종 검증(WSL)**

메모리 `headless-verify-wsl` 절차로 대시보드 + 패턴 1뷰(예: 로그 밴드) 스크린샷을 찍어 확인:
- 헤더/스위쳐/네비/뷰 전환/카드 틴트/큰 차트가 의도대로.
- 콘솔 에러 0.
```bash
cd /home/jschoi0223/projects/vdiportal/signal && python3 -m http.server 8080 &
# playwright chromium 으로 http://localhost:8080/scoopsignal.html 스크린샷(대시보드/밴드 뷰)
```

- [ ] **Step 4: Commit + 배포**

메모리 `commit-deploy-as-one-set`·`scoopsignal-deploy`에 따라 커밋·push·배포를 한 세트로 실행(사용자 추가 요구 전 1차 배포).
```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 산식 안내문 갱신 + 죽은 CSS 정리(멀티뷰 최종)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
# 이어서 scoopsignal.html 을 cafe24 www/portal/signal/ 로 배포(메모리 절차)
```

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지**
- 표준 헤더 + 자산 스위쳐 → Task 2 ✅
- ETH 인지(스위쳐 활성/나머지 준비중) → Task 2 ✅
- 대시보드 메뉴 분리 + 패턴 1개=전용 페이지(8뷰) → Task 1 ✅
- 좌측 컬러바 금지/대체(카드 틴트 + 네비 활성) → Task 3 ✅
- 전용 페이지 차트 키우기 → Task 4 ✅
- 데이터/산식 불변 → 전 태스크 Global Constraints에 명시, 계산부 미수정 ✅
- 안내문/죽은 CSS 정리 + 검증/배포 → Task 5 ✅

**2. 자리표시 스캔:** TBD/TODO/"적절히 처리" 없음. 각 코드 스텝에 실제 코드 포함 ✅

**3. 타입/이름 일관성:** `showView`/`activeView`/`VIEW_DRAW`/`drawActiveView`가 Task 1 정의 후 Task 5까지 동일 명칭으로 사용. `data-view` 키(`dashboard/season/cycle/halving/band/mayer/dd/vol`)가 HTML·네비·`VIEW_DRAW`에서 일치. 캔버스 id(`cvCycle/cvHalving/cvBand/cvMayer/cvDD/cvVol`)·통계 id(`bandStats/ddStats/hvStats/volStats/mayerStats`)가 기존 draw 함수가 찾는 이름과 일치 ✅
