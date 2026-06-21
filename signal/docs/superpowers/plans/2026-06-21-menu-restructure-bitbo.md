# 메뉴 재구성(BitBo 참고) + 프리미엄 플랫 듀오톤 아이콘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상단 바에 업그레이드 버튼(향후 유료 진입점, 토스트만)을 추가하고, 사이드바 각 항목에 통일감 있는 프리미엄 플랫 듀오톤 아이콘을 넣되 주제 그룹·현재값 배지를 유지한다.

**Architecture:** `scoopsignal.html` 단일 파일. 상단은 `.tb-right`에 `.upgrade-btn` 추가. 사이드바는 각 `.snav-item`을 `[아이콘][라벨][배지]` 구조로 재작성하고, 아이콘은 24×24 듀오톤 인라인 SVG(`currentColor`)로 항목 색을 상속한다. Signature 표시는 기존 네비 골드 점을 제거하고 아이콘을 골드로 일원화한다. 데이터/산식/뷰 라우터는 불변.

**Tech Stack:** 순수 HTML5·CSS3·Vanilla JS (빌드/프레임워크/외부 아이콘 라이브러리 없음). 폰트 CDN 2종만 외부.

## Global Constraints

- 단일 파일: 모든 변경은 `signal/scoopsignal.html` 한 파일 안에서. 파일 분리 금지.
- 외부 아이콘 라이브러리 금지 — 아이콘은 인라인 SVG. 기본 속성은 면(fill) 기반 듀오톤, `viewBox="0 0 24 24"`.
- 디자인 토큰만: 색은 `:root` 변수(`--gold/--ink/--muted/--panel-2/--line/--text`)만. 하드코딩 색 금지. 아이콘은 `currentColor`로 항목 색 상속.
- 좌측 컬러바 금지: Signature 표시는 아이콘 색(골드)으로. `box-shadow:inset Npx 0`·좌측 3px 바·점 마커 금지.
- `html{zoom:1.35}` 유지. UI 텍스트 한국어. 들여쓰기 2 spaces, 기존 압축형 스타일 유지.
- 데이터/산식 불변: 데이터 로더·`scoreMom/Liq/Fun/Val`·`recompute()`·뷰 라우터(`showView`/`VIEW_DRAW`)·`CHART_TIER` 분류를 변경하지 않는다.
- 업그레이드 버튼은 `showToast`만 호출(실제 결제/로그인/요금제 없음 — YAGNI).
- 주제 그룹(사이클 / 밸류·리스크)·현재값 배지·데이터 상태 푸터 유지.

**검증 방식:** 테스트 프레임워크 없는 정적 HTML. 검증은 로컬 서버 + 헤드리스 Chromium 스크린샷/DOM 조회로 한다. 단위테스트 코드 없음.
```bash
cd /home/jschoi0223/projects/vdiportal/signal && python3 -m http.server 8099
```
헤드리스: chrome `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`, `require("/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core")`, `LD_LIBRARY_PATH=/tmp/chrlibs node script.js`.

---

## File Structure

- Modify only: `signal/scoopsignal.html`
  - Task 1: `<header>` `.tb-right` 마크업 + `.upgrade-btn` CSS + 클릭 토스트.
  - Task 2: `<nav class="snav">` 전체 재작성(아이콘+`.snav-main`) + `.snav-ic`/`.snav-main`/tier-sig 아이콘 CSS + `applyTierBadges()` 점 제거.

---

### Task 1: 상단 업그레이드 버튼

**Files:**
- Modify: `signal/scoopsignal.html` (style `.upgrade-btn`, header `.tb-right` 마크업, script 클릭 핸들러)

**Interfaces:**
- Consumes: 기존 `.tb-right`, `showToast(msg)`(전역), `$`(querySelector 별칭).
- Produces: `#upgradeBtn` 버튼 + 클릭 시 토스트.

- [ ] **Step 1: 업그레이드 버튼 CSS 추가**

`<style>`에서 `.tb-right{...}` 규칙(현재 파일 line ~166) 바로 다음에 추가:
```css
  .upgrade-btn{appearance:none;display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:700;color:var(--ink);background:var(--gold);border:none;border-radius:9px;padding:7px 13px;cursor:pointer;white-space:nowrap}
  .upgrade-btn:hover{filter:brightness(1.06)}
  .upgrade-btn:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .upgrade-btn svg{width:15px;height:15px;display:block}
```

- [ ] **Step 2: 버튼 마크업 추가(.tb-right 맨 앞)**

현재 `.tb-right`:
```html
  <div class="tb-right">
    <span id="updatedAt">불러오는 중…</span>
```
를 다음으로 바꾼다(왕관 아이콘 + 텍스트, `#updatedAt` 앞에 삽입):
```html
  <div class="tb-right">
    <button class="upgrade-btn" id="upgradeBtn" type="button" title="요금제 업그레이드">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 7.6l3.7 3 3.4-5.1a1.1 1.1 0 0 1 1.8 0l3.4 5.1 3.7-3a1 1 0 0 1 1.6 1.05l-1.8 8.2a1.2 1.2 0 0 1-1.18.95H5.36a1.2 1.2 0 0 1-1.18-.95L2.4 8.65A1 1 0 0 1 3 7.6Z"/></svg>
      업그레이드
    </button>
    <span id="updatedAt">불러오는 중…</span>
```
(기존 `#updatedAt`·새로고침 버튼은 그대로 뒤에 유지. ≤560px에서 `.tb-right`가 이미 `flex` + wrap이라 업그레이드 버튼도 함께 줄바꿈.)

- [ ] **Step 3: 클릭 토스트 바인딩(JS)**

스크립트 하단의 이벤트 바인딩부(`$('#refreshBtn').addEventListener('click',refresh);` 근처)에 추가:
```js
$('#upgradeBtn').addEventListener('click',()=>showToast('요금제는 준비 중입니다'));
```

- [ ] **Step 4: 검증**

로컬 서버로 확인:
- 헤더 우측에 골드 "👑 업그레이드" 버튼 표시.
- 클릭 시 우하단 토스트 "요금제는 준비 중입니다".
- 콘솔 JS 에러 0. ≤560px에서 버튼이 헤더 우측 클러스터와 함께 wrap.
```js
// 헤드리스 evaluate 예
({btn:!!document.querySelector('#upgradeBtn'), label:document.querySelector('#upgradeBtn').textContent.trim()})
// 기대: {btn:true, label:"업그레이드"}
```

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 상단 업그레이드 버튼(향후 유료 진입점, 토스트)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 사이드바 프리미엄 플랫 듀오톤 아이콘 + 구조 재작성

**Files:**
- Modify: `signal/scoopsignal.html` (`<nav class="snav">` 마크업 전체, `.snav-ic`/`.snav-main`/tier-sig CSS, `applyTierBadges()`)

**Interfaces:**
- Consumes: 기존 `.snav-item[data-view]`, `.snav-badge`, `.snav-item.on`, `applyTierBadges()`, `CHART_TIER`.
- Produces: 각 항목 `[.snav-ic][라벨]` = `.snav-main` + `.snav-badge`. Signature 아이콘 골드(CSS).

- [ ] **Step 1: `<nav class="snav">` 블록 전체 교체(아이콘 + .snav-main)**

현재 nav 블록(현재 파일 line ~239–250)을 아래로 **통째 교체**한다. 각 아이콘은 24×24 듀오톤(베이스 `fill-opacity=".4"` + 핵심 풀 불투명, 둘 다 `currentColor`):
```html
    <nav class="snav" aria-label="화면 이동">
      <button class="snav-item on" data-view="dashboard"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" fill="currentColor"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2" fill="currentColor" fill-opacity=".4"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="2" fill="currentColor" fill-opacity=".4"/><rect x="13" y="13" width="7.5" height="7.5" rx="2" fill="currentColor" fill-opacity=".4"/></svg></span>이더리움 대시보드</span></button>
      <div class="snav-group">사이클</div>
      <button class="snav-item" data-view="season"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="3" fill="currentColor" fill-opacity=".4"/><rect x="7" y="3" width="2.4" height="5" rx="1.2" fill="currentColor"/><rect x="14.6" y="3" width="2.4" height="5" rx="1.2" fill="currentColor"/><rect x="12.8" y="12.5" width="4.7" height="4.7" rx="1.4" fill="currentColor"/></svg></span>계절성</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="cycle"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-opacity=".4" fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm0 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"/><circle cx="12" cy="3.6" r="2.5" fill="currentColor"/></svg></span>사이클 오버레이</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="halving"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".4"/><path fill="currentColor" d="M12 3a9 9 0 0 1 0 18Z"/></svg></span>반감기</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="spiral"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".4"/><path fill="currentColor" d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5 1.6 1.6 0 0 1-3.2 0 2.3 2.3 0 1 0-2.3 2.3 1.6 1.6 0 0 1 0 3.2A5.5 5.5 0 0 1 12 6.5Z"/></svg></span>스네일 차트</span> <span class="snav-badge">—</span></button>
      <div class="snav-group">밸류·리스크</div>
      <button class="snav-item" data-view="band"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6.2" width="17" height="2.8" rx="1.4" fill="currentColor" fill-opacity=".4"/><rect x="3.5" y="15" width="17" height="2.8" rx="1.4" fill="currentColor" fill-opacity=".4"/><rect x="3.5" y="10.6" width="17" height="2.8" rx="1.4" fill="currentColor"/></svg></span>로그 밴드</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="mayer"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="10.6" y="3" width="2.8" height="18" rx="1.4" fill="currentColor" fill-opacity=".4" transform="rotate(45 12 12)"/><rect x="10.6" y="3" width="2.8" height="18" rx="1.4" fill="currentColor" transform="rotate(-45 12 12)"/></svg></span>200주 배수</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="dd"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="2.6" rx="1.3" fill="currentColor" fill-opacity=".4"/><path fill="currentColor" d="M13.4 9.2a1.4 1.4 0 0 0-2.8 0v6.2l-2.3-2.3a1.4 1.4 0 0 0-2 2l4.7 4.7a1.4 1.4 0 0 0 2 0l4.7-4.7a1.4 1.4 0 0 0-2-2l-2.3 2.3Z"/></svg></span>드로다운</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="vol"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="11" width="17" height="2.4" rx="1.2" fill="currentColor" fill-opacity=".4"/><path fill="currentColor" d="M3.5 11.2h3.2l2-5.6a1.3 1.3 0 0 1 2.5.1l2.2 8.2 1.3-3.4a1.3 1.3 0 0 1 1.2-.8h4.6v2.6h-3.7l-2.2 5.7a1.3 1.3 0 0 1-2.5-.1l-2.1-7.9-1.1 3a1.3 1.3 0 0 1-1.2.8H3.5Z"/></svg></span>변동성</span> <span class="snav-badge">—</span></button>
    </nav>
```
주의: `data-view` 키·라벨·`.snav-badge`는 보존(JS가 의존). 각 항목 = `<button><span class="snav-main"><span class="snav-ic">SVG</span>라벨</span> <span class="snav-badge">—</span></button>`. 대시보드는 배지 없음.

- [ ] **Step 2: 아이콘/.snav-main CSS 추가 + tier-sig 골드 아이콘 + 점 CSS 제거**

`<style>`에서 기존 `.snav-item.tier-sig` 관련 두 줄(현재 파일 line ~98–99):
```css
  .snav-item.tier-sig{position:relative}
  .snav-item.tier-sig .snav-label-dot{width:5px;height:5px;border-radius:50%;background:var(--gold);flex:0 0 auto;margin-right:6px;display:inline-block}
```
를 다음으로 **교체**한다:
```css
  .snav-main{display:inline-flex;align-items:center;gap:9px;min-width:0}
  .snav-ic{width:17px;height:17px;flex:0 0 auto;display:inline-flex;color:inherit}
  .snav-ic svg{width:100%;height:100%;display:block}
  .snav-item.tier-sig .snav-ic{color:var(--gold)}
```
(`.snav-item{display:flex;justify-content:space-between}`는 그대로 — `.snav-main`이 좌측, `.snav-badge`가 우측에 정렬됨.)

- [ ] **Step 3: applyTierBadges() — 네비 점 삽입 제거**

현재 함수의 네비 마커 블록(현재 파일 line ~915–921):
```js
    if(tier==='signature'){
      const nav=document.querySelector('.snav-item[data-view="'+key+'"]');
      if(nav&&!nav.classList.contains('tier-sig')){
        nav.classList.add('tier-sig');
        const dot=document.createElement('span');dot.className='snav-label-dot';
        nav.insertBefore(dot,nav.firstChild);
      }
    }
```
를 다음으로 바꾼다(클래스만 부여 → CSS가 아이콘을 골드로):
```js
    if(tier==='signature'){
      const nav=document.querySelector('.snav-item[data-view="'+key+'"]');
      if(nav)nav.classList.add('tier-sig');   // 아이콘 골드(.snav-item.tier-sig .snav-ic)
    }
```

- [ ] **Step 4: 검증 — 데스크톱 아이콘/통일감/Signature**

로컬 서버 + 헤드리스 스크린샷(1280px):
- 9개 항목 모두 라벨 앞 듀오톤 아이콘, 동일 옵티컬 사이즈로 통일.
- 활성 항목(대시보드) 아이콘 골드. 비활성 muted 듀오톤.
- 스네일 항목 아이콘 골드(점 없음), 페이지 헤더 `◆ Signature` 배지 유지.
- 현재값 배지·주제 그룹 정상. 콘솔 JS 에러 0.
```js
// DOM 점검
({icons:document.querySelectorAll('.snav-ic svg').length,
  dot:document.querySelectorAll('.snav-label-dot').length,
  sigClass:document.querySelector('.snav-item[data-view="spiral"]').classList.contains('tier-sig')})
// 기대: {icons:9, dot:0, sigClass:true}
```
스크린샷으로 아이콘 고급/통일감 육안 확인. 어색하면 해당 아이콘 path를 미세 조정(범위 내).

- [ ] **Step 5: 검증 — 모바일 pill**

헤드리스 390px(isMobile)로:
- 가로 스크롤 pill에 `[아이콘] 라벨` 표시, 현재값 배지는 숨김(기존 규칙).
- 헤더 슬림 유지, 업그레이드 버튼 wrap, JS 에러 0.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 사이드바 프리미엄 플랫 듀오톤 아이콘 + Signature 골드 아이콘 일원화

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 7: 배포**

메모리 절차(commit-deploy-as-one-set·scoopsignal-deploy)에 따라 push + cafe24 SFTP로 `scoopsignal.html`만 배포, 라이브 HTTP 200 + 마커 반영 확인.

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지**
- 상단 업그레이드 버튼(토스트만) → Task 1 ✅
- 사이드바 아이콘 + 그룹/배지 유지 → Task 2 Step 1,2 ✅
- 프리미엄 플랫 듀오톤 아이콘 시스템(24×24, 2레이어 currentColor) → Task 2 Step 1 (9개 SVG) ✅
- Signature 일원화(점 제거 → 골드 아이콘) → Task 2 Step 2,3 ✅
- 모바일 pill 아이콘 + 업그레이드 wrap → Task 2 Step 5 / Task 1 ✅
- 데이터/산식/라우터/CHART_TIER 불변 → Global Constraints ✅

**2. 자리표시 스캔:** TBD/TODO 없음. 9개 아이콘·버튼·CSS·JS 모두 실제 코드 포함 ✅

**3. 타입/이름 일관성:** `.snav-main`/`.snav-ic`/`.upgrade-btn`/`#upgradeBtn`/`.snav-item.tier-sig .snav-ic`가 Task 1~2에서 동일. `data-view` 키(`dashboard/season/cycle/halving/spiral/band/mayer/dd/vol`)는 기존과 일치. `applyTierBadges`에서 `.snav-label-dot` 완전 제거(Step 3)와 CSS 제거(Step 2)가 정합 ✅
