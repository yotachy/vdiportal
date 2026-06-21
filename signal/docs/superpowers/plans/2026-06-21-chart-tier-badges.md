# 차트 등급(Basic / Signature) 배지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 각 차트에 Basic/Signature 등급을 단일 출처 메타데이터로 부여하고, 차트 페이지 헤더 배지 + 네비 Signature 마커 + 의미 안내를 추가한다(표시 전용, 실제 게이팅 없음).

**Architecture:** `scoopsignal.html` 단일 파일에 `CHART_TIER`/`TIER_META` 객체(단일 출처)와 멱등 `applyTierBadges()`를 추가해, 초기화 시 1회 DOM에 배지/마커를 주입한다. 데이터 로더·점수 산식·뷰 라우터는 손대지 않는다.

**Tech Stack:** 순수 HTML5·CSS3·Vanilla JS (빌드/프레임워크/라이브러리 없음). 폰트 CDN 2종만 외부.

## Global Constraints

- 단일 파일: 모든 변경은 `signal/scoopsignal.html` 한 파일 안에서. 파일 분리 금지.
- 디자인 토큰만: 색·라운드는 `:root` CSS 변수만(`--gold/--ink/--muted/--panel-2/--line` 등). 하드코딩 색 금지.
- `html{zoom:1.35}` 유지. UI 텍스트 한국어. 들여쓰기 2 spaces, 기존 압축형 스타일 유지.
- 좌측 컬러바 금지: 네비 Signature 표시는 **점(dot)**으로(좌측 바·`box-shadow:inset Npx 0` 금지).
- 데이터/산식 불변: 데이터 로더·`scoreMom/Liq/Fun/Val`·`recompute()`·뷰 라우터(`showView`/`VIEW_DRAW`)를 변경하지 않는다.
- 주제 그룹(사이클 / 밸류·리스크) 유지 — 재편 금지.
- 분류 단일 출처: 등급은 `CHART_TIER` 한 곳에서만 정의(중복 금지). 배지는 거기서 파생.
- 실제 게이팅/결제/잠금 없음(YAGNI).

**검증 방식:** 테스트 프레임워크 없는 정적 HTML. 검증은 (a) 로컬 정적 서버 + 헤드리스 Chromium DOM 조회/스크린샷, (b) DOM/콘솔 점검으로 한다. 단위테스트 코드는 작성하지 않는다.
```bash
cd /home/jschoi0223/projects/vdiportal/signal && python3 -m http.server 8099
# → http://localhost:8099/scoopsignal.html
```

---

## File Structure

- Modify only: `signal/scoopsignal.html`
  - `<head><style>`: `.tier-badge`/`.tier-signature`/`.tier-basic` + `.snav-item.tier-sig::before` 규칙.
  - `<script>`: `CHART_TIER`/`TIER_META` 객체, `applyTierBadges()` 함수, 초기화에서 1회 호출.
  - `<details class="method">` 본문: Basic/Signature 의미 안내 한 줄.

분류·배지·안내가 한 책임(등급 표시)으로 응집되므로 **단일 태스크**로 구현한다.

---

### Task 1: 차트 등급 메타데이터 + 배지/마커 + 안내

**Files:**
- Modify: `signal/scoopsignal.html` (style 규칙, script 객체+함수+초기화 호출, method 안내문)

**Interfaces:**
- Consumes: 기존 `.view[data-view]` 섹션과 그 안의 `.page-head h2`, 기존 `.snav-item[data-view]`, 기존 초기화 시퀀스(`loadCfg(); buildGauge(); ... refresh(); showView(activeView); ...`), 기존 `details.method .mbody`.
- Produces:
  - 전역 `const CHART_TIER` (viewKey → 'basic'|'signature').
  - 전역 `const TIER_META` (tier → {label,title}).
  - `function applyTierBadges()` — 멱등; `.page-head h2`에 `.tier-badge` 주입 + Signature 네비에 `.tier-sig` 클래스 부여.

- [ ] **Step 1: CSS 추가 (배지 + 네비 마커)**

`<style>` 안, 기존 `.page-head` 규칙 근처(예: `.page-head .page-sub{...}` 다음 줄)에 추가한다:
```css
  .page-head h2{display:inline-flex;align-items:center;gap:9px;flex-wrap:wrap}
  .tier-badge{font-size:10.5px;font-weight:700;letter-spacing:.04em;border-radius:999px;padding:3px 9px;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;vertical-align:middle}
  .tier-signature{color:var(--ink);background:var(--gold)}
  .tier-basic{color:var(--muted);background:var(--panel-2);border:1px solid var(--line)}
  .snav-item.tier-sig{position:relative}
  .snav-item.tier-sig .snav-label-dot{width:5px;height:5px;border-radius:50%;background:var(--gold);flex:0 0 auto;margin-right:6px;display:inline-block}
```
주의: `.page-head h2`를 `inline-flex`로 바꿔 배지가 제목과 같은 줄에 정렬되게 한다(기존 h2는 블록 제목이었음 — 줄바꿈/정렬 깨짐 방지).

- [ ] **Step 2: 메타데이터 객체 추가 (단일 출처)**

`<script>` 안에서 뷰 라우터 부근(예: `const VIEW_DRAW={...};` 다음 줄)에 추가한다:
```js
/* 차트 등급(표시 전용) — 새 차트는 여기 한 줄만 추가. 향후 유료 게이팅의 단일 스위치. */
const CHART_TIER={
  spiral:'signature',
  season:'basic', cycle:'basic', halving:'basic',
  band:'basic', mayer:'basic', dd:'basic', vol:'basic'
};
const TIER_META={
  signature:{label:'Signature',title:'크립토시그널이 자체 해석·도출한 지표'},
  basic:{label:'Basic',title:'공개적으로 널리 쓰이는 표준 지표'}
};
```

- [ ] **Step 3: applyTierBadges() 함수 추가 (멱등 주입)**

같은 `<script>` 안, `showView` 정의 근처에 추가한다:
```js
function applyTierBadges(){
  Object.keys(CHART_TIER).forEach(key=>{
    const tier=CHART_TIER[key],meta=TIER_META[tier];if(!meta)return;
    // 페이지 헤더 배지(멱등)
    const h2=document.querySelector('.view[data-view="'+key+'"] .page-head h2');
    if(h2&&!h2.querySelector('.tier-badge')){
      const b=document.createElement('span');
      b.className='tier-badge tier-'+tier;b.title=meta.title;
      b.textContent=(tier==='signature'?'◆ ':'')+meta.label;
      h2.appendChild(b);
    }
    // 네비 Signature 마커(멱등)
    if(tier==='signature'){
      const nav=document.querySelector('.snav-item[data-view="'+key+'"]');
      if(nav&&!nav.classList.contains('tier-sig')){
        nav.classList.add('tier-sig');
        const dot=document.createElement('span');dot.className='snav-label-dot';
        nav.insertBefore(dot,nav.firstChild);
      }
    }
  });
}
```
설명: `.page-head h2`가 없는 키(예: `dashboard`는 `CHART_TIER`에 없음)는 자연히 스킵. 배지/마커가 이미 있으면 재추가하지 않음(멱등).

- [ ] **Step 4: 초기화에서 1회 호출**

`<script>` 하단 초기화 시퀀스에서 `showView(activeView);` 바로 다음 줄에 추가한다. 현재 시퀀스:
```js
refresh();
showView(activeView);
setInterval(refresh,60000);
```
를:
```js
refresh();
showView(activeView);
applyTierBadges();
setInterval(refresh,60000);
```
로 바꾼다. (정적 주입이라 1회면 충분 — 매 렌더 호출 불필요.)

- [ ] **Step 5: method 안내문 추가**

`<details class="method">` 본문(`.mbody`)에서 데이터 출처 안내 문단 근처에 한 줄 추가한다. 기존 문단:
```html
      <p>가중치·ROC 기간·밴드 σ폭은 상단 튜닝 패널에서 조정하며 브라우저(localStorage)에 저장됩니다.</p>
```
바로 다음에 삽입:
```html
      <p><b style="color:var(--text)">Basic</b> = 어디서나 볼 수 있는 표준 지표 · <b style="color:var(--gold)">Signature</b> = 크립토시그널이 자체 해석·도출한 지표. 향후 데이터 공개 범위가 회원 등급별로 달라질 수 있습니다.</p>
```
(이 `<p>` 앵커가 파일에 없으면, `.mbody` 안 마지막 `<p>` 다음에 삽입한다.)

- [ ] **Step 6: 검증 — 배지/마커/멱등/회귀**

로컬 서버를 띄우고 헤드리스 또는 수동으로 확인한다.
```bash
cd /home/jschoi0223/projects/vdiportal/signal && python3 -m http.server 8099
# http://localhost:8099/scoopsignal.html
```
확인 항목:
1. `spiral` 뷰 헤더에 골드 `◆ Signature` 배지 + 네비 "스네일 차트" 라벨 앞 골드 점.
2. `season/cycle/halving/band/mayer/dd/vol` 7개 뷰 헤더에 회색 `Basic` 배지, 네비 점 없음.
3. `dashboard`(대시보드)에는 배지 없음.
4. 배지 `title` 호버 설명 노출(DOM `title` 속성 확인).
5. method 아코디언에 Basic/Signature 안내문 노출.
6. 멱등성: 콘솔에서 `applyTierBadges();applyTierBadges();` 두 번 호출 후 `document.querySelectorAll('.tier-badge').length`가 8(스네일1+Basic7)로 유지(중복 주입 없음).
7. 회귀: 콘솔 JS 에러 0, 게이지/차트 정상 렌더, 뷰 전환 정상.

DOM 점검 예(헤드리스 evaluate):
```js
({badges:document.querySelectorAll('.tier-badge').length,
  sig:document.querySelector('.view[data-view="spiral"] .tier-signature')?.textContent,
  navDot:!!document.querySelector('.snav-item[data-view="spiral"].tier-sig'),
  dashBadge:!!document.querySelector('.view[data-view="dashboard"] .tier-badge')})
// 기대: {badges:8, sig:"◆ Signature", navDot:true, dashBadge:false}
```

- [ ] **Step 7: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 차트 등급(Basic/Signature) 배지 + 네비 마커 + 안내

- CHART_TIER 단일 출처(스네일=signature, 나머지 패턴=basic)
- applyTierBadges() 멱등 주입: 페이지헤더 배지 + Signature 네비 골드 점
- method 안내문(Basic/Signature 의미 + 향후 등급별 데이터 차등)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 8: 배포**

메모리 절차(commit-deploy-as-one-set·scoopsignal-deploy)에 따라 push + cafe24 SFTP로 `scoopsignal.html`만 배포하고, 라이브 HTTP 200 + 마커 반영을 확인한다.

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지**
- 단일 출처 메타데이터(`CHART_TIER`/`TIER_META`) → Step 2 ✅
- 페이지 헤더 배지(Signature 골드/Basic 회색 + title) → Step 1,3 ✅
- 네비 Signature 골드 점(좌측 바 아님) → Step 1,3 ✅
- 대시보드 미부여 → Step 2(객체에서 제외) + Step 6 확인 ✅
- 의미 안내문 → Step 5 ✅
- 확장성(새 차트 한 줄) → Step 2 주석 + 구조 ✅
- 멱등성 → Step 3 가드 + Step 6 검증 ✅
- 데이터/산식/라우터 불변 → Global Constraints + 주입 독립 ✅

**2. 자리표시 스캔:** TBD/TODO 없음. 각 코드 스텝에 실제 코드 포함 ✅

**3. 타입/이름 일관성:** `CHART_TIER`·`TIER_META`·`applyTierBadges`·클래스명(`tier-badge`/`tier-signature`/`tier-basic`/`tier-sig`/`snav-label-dot`)이 Step 1~6에서 동일하게 사용. 뷰 key(`spiral`/`season`/.../`vol`)는 기존 `data-view`·`VIEW_DRAW`와 일치 ✅
