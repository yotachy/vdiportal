# 대시보드 슬림 재구성 + 히어로 드릴다운 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 티커를 ETH 중심(ETH/USD·ETH/BTC·ETH 도미넌스)으로 바꾸고, 대시보드 히어로를 작게(시그널 게이지 메인 + 레이더·사이클 컴팩트 타일)로 만들어 각 항목 클릭 시 전용 상세 뷰로 드릴다운하며, 축별 상세 4카드를 레이더 상세 뷰로 이동한다.

**Architecture:** `scoopsignal.html` 단일 파일. 신규 `loadCoinGecko()`로 도미넌스 추가. 대시보드 마크업을 재배치(레이더·사분면 SVG·4카드를 신규 상세 뷰 `signal`/`radar`/`clock`으로 이동)하고, 클릭은 `data-goto` 속성 → `showView` 바인딩. `recompute()`는 계산부 불변, 렌더 타깃 재배치 + 타일/상세 갱신 헬퍼 호출만 추가.

**Tech Stack:** 순수 HTML5·CSS3·Vanilla JS (빌드/프레임워크/외부 라이브러리 없음). 데이터 fetch는 클라이언트 사이드.

## Global Constraints

- 단일 파일: 모든 변경은 `signal/scoopsignal.html`. 파일 분리 금지.
- 디자인 토큰만(`--gold/--ink/--bull/--neutral/--bear/--muted/--panel/--panel-2/--line/--text` 등). 하드코딩 색 금지. 좌측 컬러바 금지(신호는 면/틴트).
- `html{zoom:1.35}` 유지. UI 텍스트 한국어. 들여쓰기 2 spaces, 기존 압축형 스타일.
- 점수 산식(`scoreMom/Liq/Fun/Val`)·`recompute()` 계산부·뷰 라우터(`showView`/`activeView`/`VIEW_DRAW`) 골격 불변. CoinGecko 외 데이터 로더 불변.
- SVG/4카드 id 보존: `#gFill/#gTrack/#gTicks/#gNeedle/#scoreNum/#radarG/#quadG/#cMom/#cLiq/#cFun/#cVal` 및 모든 `data-f` 키. 이동만, 삭제·개명 금지.
- 상세 뷰(`signal`/`radar`/`clock`)는 사이드바 `.snav-item`에 노출하지 않음. `CHART_TIER`에도 추가 안 함.
- 그레이스풀 디그레이드: 도미넌스 실패해도 나머지 정상.

**검증 방식:** 테스트 프레임워크 없는 정적 HTML. 로컬 서버 + 헤드리스 Chromium DOM/스크린샷으로 검증. 단위테스트 코드 없음.
```bash
cd /home/jschoi0223/projects/vdiportal/signal && python3 -m http.server 8099
```
헤드리스: chrome `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`, `require("/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core")`, `LD_LIBRARY_PATH=/tmp/chrlibs node script.js`. (CoinGecko는 환경/지오에 따라 막힐 수 있음 — 막히면 도미넌스 칸이 — 로 디그레이드되는지 확인.)

---

## File Structure

- Modify only: `signal/scoopsignal.html`
  - Task 1: `.ticker` 마크업, `loadCoinGecko()` + `refresh()` allSettled + 도미넌스 표시.
  - Task 2: 대시보드 `<section data-view="dashboard">` 마크업 재구성(슬림 히어로+타일) + 신규 뷰 `signal`/`radar`/`clock`(레이더·사분면·4카드 이동) + CSS.
  - Task 3: JS 배선(`data-goto`→showView, `updateHeroTiles`, `updateSignalDetail`, `recompute` 호출) + 배포.

진행 순서: 티커(독립) → 마크업/CSS 재구성(레이아웃) → JS 배선(인터랙션) → 배포.

---

### Task 1: 티커 ETH 도미넌스 + CoinGecko 로더

**Files:**
- Modify: `signal/scoopsignal.html` (`.ticker` 마크업, script `loadCoinGecko`/`refresh`/`loadBinance`)

**Interfaces:**
- Consumes: 기존 `S`, `setF`, `jget`, `Promise.allSettled` 오케스트레이션, `setStatus`.
- Produces: `S.dom={eth:<pct>}|null`, `loadCoinGecko()`, 티커 `data-f="domVal"`.

- [ ] **Step 1: 티커 BTC/USD 칸 → ETH 도미넌스 교체**

현재(파일 line 277):
```html
    <div class="tk"><div class="lab">BTC / USD</div><div class="val mono" data-f="btcUsd">—</div><div class="chg mono" data-f="btcChg">—</div></div>
```
를:
```html
    <div class="tk"><div class="lab">ETH 도미넌스</div><div class="val mono" data-f="domVal">—</div><div class="chg mono" style="color:var(--faint)">전체 시총 점유율</div></div>
```
(ETH/USD·ETH/BTC 칸은 그대로 유지.)

- [ ] **Step 2: loadBinance에서 btcUsd 표시 제거**

현재(파일 line 606):
```js
  setF('btcUsd',fmtUsd(+btc.lastPrice));chg('btcChg',+btc.priceChangePercent);
```
이 줄을 **삭제**한다. (위 줄의 `btc` 변수 fetch·destructuring은 그대로 둔다 — 제거하면 `Promise.all` 인덱스가 바뀌어 위험. 표시만 제거.)

- [ ] **Step 3: loadCoinGecko() 추가**

다른 로더(`loadBeacon` 근처) 뒤에 추가:
```js
async function loadCoinGecko(){
  try{
    const g=await jget('https://api.coingecko.com/api/v3/global');
    const eth=g&&g.data&&g.data.market_cap_percentage&&g.data.market_cap_percentage.eth;
    if(eth==null||!isFinite(+eth))throw new Error('no eth dom');
    S.dom={eth:+eth};setF('domVal',(+eth).toFixed(1)+'%');setStatus('coingecko','ok');
  }catch(e){S.dom=null;setF('domVal','—');setStatus('coingecko','warn');}
}
```

- [ ] **Step 4: refresh() 오케스트레이션에 추가 + 상태등**

현재(파일 line 955):
```js
  const r=await Promise.allSettled([loadBinance(),loadLlama(),loadDollar(),loadFred(),loadBeacon()]);
```
를:
```js
  const r=await Promise.allSettled([loadBinance(),loadLlama(),loadDollar(),loadFred(),loadBeacon(),loadCoinGecko()]);
```
로 바꾼다. (`loadCoinGecko`가 자체 `setStatus('coingecko',...)`를 호출하므로 `r[5]` 별도 처리 불필요.)

상태 푸터에 coingecko 항목 추가: 데이터 상태 리스트(`<span class="s"><i id="st-beacon"></i>스테이킹</span>` 줄) 다음에:
```html
        <span class="s"><i id="st-coingecko"></i>도미넌스</span>
```
(`setStatus(id,cls)`는 `#st-<id>`를 찾으므로 id는 `st-coingecko`.)

- [ ] **Step 5: 검증**

로컬 서버 + 헤드리스:
- 티커 3칸: ETH/USD, ETH/BTC, ETH 도미넌스(값 또는 —). BTC/USD 없음.
- `grep -c 'data-f="btcUsd"'` → 1(마크업 제거했으니 0이어야). 정확히: 마크업에서 `btcUsd` 0건.
```bash
cd /home/jschoi0223/projects/vdiportal/signal
grep -c 'data-f="btcUsd"' scoopsignal.html   # 0 기대
grep -c 'data-f="domVal"' scoopsignal.html   # 1 기대
grep -c 'loadCoinGecko' scoopsignal.html      # 2 기대(함수 정의 + allSettled 호출)
```
- 헤드리스 DOM: `document.querySelectorAll('.tk').length===3`, 도미넌스 칸 텍스트가 값 또는 '—'. 콘솔 JS 에러 0(CoinGecko 차단 시 warn 디그레이드, 에러 아님).

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 티커 BTC/USD → ETH 도미넌스(CoinGecko, 그레이스풀)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 대시보드 슬림 히어로 + 상세 뷰 마크업/CSS

**Files:**
- Modify: `signal/scoopsignal.html` (대시보드 뷰 마크업 재구성, 신규 뷰 3개, `<style>`)

**Interfaces:**
- Consumes: 기존 게이지/레이더/사분면 SVG·4카드 마크업, `.view`/`.page-head` 클래스, `showView`(전역).
- Produces: `.hero2`/`.signal-pane`/`.hero-tile`/`.tile-bars`/`#heroRadarBars`/`#heroCycleLabel`/`.backlink`/`#signalDetail` + 뷰 `signal`/`radar`/`clock`. 클릭 요소엔 `data-goto` 속성(바인딩은 Task 3).

- [ ] **Step 1: 대시보드 뷰 본문 재구성 (HERO + DIMENSION CARDS 블록 교체)**

현재 파일의 `<!-- HERO: gauge + radar + quadrant -->`부터 `<!-- DIMENSION CARDS -->` 섹션 끝(`</section>` 직전, 파일 line 284–347: `<section class="hero">…</section>`와 그 다음 `<section>…축별 상세…</section>`)을 아래로 **교체**한다. 게이지 SVG 내부(gTrack/gFill/gTicks/gNeedle/scoreNum)는 그대로 보존:
```html
  <!-- HERO (슬림): 시그널 메인 + 컴팩트 타일 2 -->
  <section class="hero2">
    <div class="pane signal-pane" data-goto="signal" role="button" tabindex="0" aria-label="ETH 시그널 상세 보기">
      <div class="ptitle">ETH 시그널 <span class="go">상세 ›</span></div>
      <div class="gauge-wrap">
        <svg class="gauge" viewBox="0 0 240 142" role="img" aria-label="종합 점수 게이지">
          <path id="gTrack" fill="none" stroke="#232D38" stroke-width="14" stroke-linecap="round"/>
          <path id="gFill" fill="none" stroke="#46C28E" stroke-width="14" stroke-linecap="round"/>
          <g id="gTicks"></g>
          <line id="gNeedle" x1="120" y1="120" x2="120" y2="36" stroke="#E6EDF3" stroke-width="2.5" stroke-linecap="round" style="transition:transform .8s cubic-bezier(.2,.7,.2,1)"/>
          <circle cx="120" cy="120" r="5.5" fill="#0B0F14" stroke="#E6EDF3" stroke-width="2"/>
        </svg>
        <div class="gauge-center"><div class="gauge-score mono"><span id="scoreNum">—</span><small>/100</small></div></div>
      </div>
      <div class="verdict"><h3 id="verdictText">측정 중…</h3><p id="verdictRead"></p></div>
    </div>
    <div class="hero-tiles">
      <div class="hero-tile" data-goto="radar" role="button" tabindex="0" aria-label="ETH 레이더 4축 상세 보기">
        <div class="tile-head">ETH 레이더 · 4축 <span class="go">›</span></div>
        <div class="tile-bars" id="heroRadarBars"></div>
      </div>
      <div class="hero-tile" data-goto="clock" role="button" tabindex="0" aria-label="ETH 사이클 상세 보기">
        <div class="tile-head">ETH 사이클 <span class="go">›</span></div>
        <div class="tile-cycle" id="heroCycleLabel">—</div>
      </div>
    </div>
  </section>
```
주의: 위 블록이 기존 `<section class="hero">`(3 pane)와 `<section>축별 상세(.dims)</section>` **둘 다**를 대체한다. 4카드(.dims)와 레이더/사분면 SVG는 Step 2에서 신규 상세 뷰로 옮겨 붙인다(삭제 아님).

- [ ] **Step 2: 신규 상세 뷰 3개 추가 (대시보드 뷰 닫힘 직후)**

대시보드 뷰의 닫는 `</section>`(튜닝·산식 아코디언 다음, 첫 패턴 뷰 `data-view="season"` 앞) 바로 뒤에 3개 뷰를 추가한다. 레이더 SVG·사분면 SVG·사분면 범례·4카드는 **기존 마크업을 그대로 이동**해 넣는다(id/​data-f 보존):
```html
  <!-- 상세: 시그널 -->
  <section class="view" data-view="signal">
    <button class="backlink" data-goto="dashboard" type="button">‹ 대시보드</button>
    <div class="page-head"><h2>ETH 시그널 상세</h2><p class="page-sub">종합 점수의 산식·가중치·4축 기여도</p></div>
    <div class="detail-body" id="signalDetail"></div>
  </section>

  <!-- 상세: 레이더 -->
  <section class="view" data-view="radar">
    <button class="backlink" data-goto="dashboard" type="button">‹ 대시보드</button>
    <div class="page-head"><h2>ETH 레이더 — 4축 분해</h2><p class="page-sub">유동성·모멘텀·펀더멘털·밸류 4축 점수와 원자료 + 분위 막대(길이=과거 분포 내 위치, 색=호악)</p></div>
    <svg class="radar radar-lg" viewBox="0 0 240 220" role="img" aria-label="4축 레이더"><g id="radarG"></g></svg>
    <div class="dims">
      <div class="card" data-sig="load" id="cMom">
        <div class="top"><div><h3>모멘텀</h3><div class="dimscore" data-f="momScore">—</div></div><div class="chip" data-sig="load" data-f="momChip">대기</div></div>
        <div class="mrow"><span class="k">ETH/BTC vs 50일선</span><span class="v" data-f="ebVal">—</span></div>
        <div class="mrow"><span class="k">3개월 가격 ROC</span><span class="v" data-f="rocVal">—</span></div>
      </div>
      <div class="card" data-sig="load" id="cLiq">
        <div class="top"><div><h3>유동성</h3><div class="dimscore" data-f="liqScore">—</div></div><div class="chip" data-sig="load" data-f="liqChip">대기</div></div>
        <div class="mrow"><span class="k">순유동성 추세</span><span class="v" data-f="nlVal">—</span></div>
        <div class="mrow"><span class="k">10Y 실질금리</span><span class="v" data-f="ryVal">—</span></div>
        <div class="mrow"><span class="k">달러강도(DXY근사)</span><span class="v" data-f="dxyVal">—</span></div>
      </div>
      <div class="card" data-sig="load" id="cFun">
        <div class="top"><div><h3>펀더멘털</h3><div class="dimscore" data-f="funScore">—</div></div><div class="chip" data-sig="load" data-f="funChip">대기</div></div>
        <div class="mrow"><span class="k">ETH DeFi TVL 30d</span><span class="v" data-f="tvlVal">—</span></div>
        <div class="mrow"><span class="k">스테이블(ETH) 30d</span><span class="v" data-f="stVal">—</span></div>
        <div class="mrow"><span class="k">L2 TVL 30d</span><span class="v" data-f="l2Val">—</span></div>
        <div class="mrow"><span class="k">스테이킹−10Y 스프레드</span><span class="v" data-f="spVal">—</span></div>
        <div class="mrow"><span class="k">검증자 큐</span><span class="v" data-f="qVal">—</span></div>
      </div>
      <div class="card" data-sig="load" id="cVal">
        <div class="top"><div><h3>밸류·사이클</h3><div class="dimscore" data-f="valScore">—</div></div><div class="chip" data-sig="load" data-f="valChip">대기</div></div>
        <div class="mrow"><span class="k">200주선 배수</span><span class="v" data-f="m200Val">—</span></div>
        <div class="mrow"><span class="k">로그밴드 위치</span><span class="v" data-f="bandVal">—</span></div>
      </div>
    </div>
  </section>

  <!-- 상세: 사이클 -->
  <section class="view" data-view="clock">
    <button class="backlink" data-goto="dashboard" type="button">‹ 대시보드</button>
    <div class="page-head"><h2>ETH 사이클 시계</h2><p class="page-sub">유동성(가로)×모멘텀(세로) 사분면에서 현재 국면 위치</p></div>
    <svg class="quad quad-lg" viewBox="0 0 240 220" role="img" aria-label="사이클 사분면"><g id="quadG"></g></svg>
    <div class="quad-leg">
      <span style="color:var(--bull)">↗ 상승 (유동성·모멘텀 ↑)</span>
      <span style="color:var(--neutral)">↖ 축적 (유동성 ↑·모멘텀 ↓)</span>
      <span style="color:var(--neutral)">↘ 분배 (유동성 ↓·모멘텀 ↑)</span>
      <span style="color:var(--bear)">↙ 하락 (둘 다 ↓)</span>
    </div>
  </section>
```
**중복 방지**: Step 1·2 적용 후 `#radarG`·`#quadG`·`#cMom`은 파일에 **각각 1개씩만** 존재해야 한다(기존 위치에서 옮긴 것이지 복제가 아님). Step 1 교체로 기존 hero/dims가 삭제되고, Step 2에서 상세 뷰로 다시 들어가므로 순증 0.

- [ ] **Step 3: CSS 추가**

`<style>`에 추가(기존 `.hero`/`.pane`/`.gauge-wrap` 규칙은 그대로 두되 신규 클래스 추가):
```css
  /* 슬림 히어로 + 드릴다운 */
  .hero2{display:grid;grid-template-columns:1.1fr 1fr;gap:12px;margin-bottom:14px;align-items:stretch}
  .signal-pane{cursor:pointer}
  .signal-pane .gauge-wrap{max-width:180px}
  .signal-pane:hover,.hero-tile:hover{border-color:var(--gold)}
  .signal-pane:focus-visible,.hero-tile:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .ptitle .go,.tile-head .go{color:var(--gold);font-size:11px;font-weight:700;float:right}
  .hero-tiles{display:flex;flex-direction:column;gap:12px}
  .hero-tile{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;cursor:pointer;display:flex;flex-direction:column;gap:11px;flex:1}
  .tile-head{font-size:12.5px;font-weight:700;color:var(--text)}
  .tile-bars{display:flex;flex-direction:column;gap:8px}
  .tile-bar{display:grid;grid-template-columns:58px 1fr 30px;align-items:center;gap:8px;font-size:11px;color:var(--muted)}
  .tile-bar .bar{height:6px;border-radius:3px;background:var(--panel-2);overflow:hidden}
  .tile-bar .bar i{display:block;height:100%;border-radius:3px}
  .tile-bar .num{font-family:var(--mono);text-align:right;color:var(--text)}
  .tile-cycle{font-family:var(--mono);font-size:22px;font-weight:700;letter-spacing:-.01em}
  .backlink{appearance:none;background:none;border:none;color:var(--gold);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:4px 2px;margin-bottom:4px}
  .backlink:hover{text-decoration:underline}
  .backlink:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:6px}
  .radar-lg,.quad-lg{max-width:380px;width:100%;margin:6px auto 16px;display:block}
  .detail-body{font-size:13px;color:var(--muted);line-height:1.7}
  @media(max-width:880px){.hero2{grid-template-columns:1fr}.signal-pane .gauge-wrap{max-width:200px}}
```

- [ ] **Step 4: 검증 — 마크업/레이아웃**

로컬 서버 + 헤드리스(아직 클릭 바인딩 전이므로 `showView`를 콘솔에서 직접 호출해 확인):
```js
// DOM 점검
({radar:document.querySelectorAll('#radarG').length, quad:document.querySelectorAll('#quadG').length,
  cMom:document.querySelectorAll('#cMom').length,
  views:['signal','radar','clock'].map(k=>!!document.querySelector('.view[data-view="'+k+'"]')),
  dimsInDash:!!document.querySelector('.view[data-view="dashboard"] .dims'),
  gotos:document.querySelectorAll('[data-goto]').length})
// 기대: {radar:1, quad:1, cMom:1, views:[true,true,true], dimsInDash:false, gotos:6}
```
- 콘솔에서 `showView('radar')` → 큰 레이더 + 4카드 보임. `showView('clock')` → 사분면. `showView('dashboard')` → 게이지(작아짐) + 타일 2(아직 비어있음).
- 콘솔 JS 에러 0. 게이지/레이더/사분면이 recompute로 렌더됨(값 표시).
- 스크린샷으로 대시보드 슬림화(박스 감소) 육안 확인.

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 대시보드 슬림 히어로 + 상세 뷰 3개 마크업/CSS(레이더·사분면·4카드 이전)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 드릴다운 JS 배선 + 타일/상세 갱신 + 배포

**Files:**
- Modify: `signal/scoopsignal.html` (script: data-goto 바인딩, `updateHeroTiles`, `updateSignalDetail`, `recompute` 호출)

**Interfaces:**
- Consumes: Task 2의 `[data-goto]`·`#heroRadarBars`·`#heroCycleLabel`·`#signalDetail`, 기존 `showView`·`recompute`·`normW`·`sigOf`·`clamp`.
- Produces: `updateHeroTiles(mom,liq,fun,val)`, `updateSignalDetail(score,d,w)`, `[data-goto]` 클릭/키보드 바인딩.

- [ ] **Step 1: data-goto 내비게이션 바인딩**

스크립트 하단의 네비 바인딩부(`document.querySelectorAll('.snav-item').forEach(...showView...)` 줄 근처)에 추가:
```js
document.querySelectorAll('[data-goto]').forEach(el=>{
  const go=()=>showView(el.dataset.goto);
  el.addEventListener('click',go);
  el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
});
```

- [ ] **Step 2: updateHeroTiles() 추가 (레이더 미니바 + 사이클 라벨)**

`recompute` 정의 앞(또는 근처)에 추가:
```js
function updateHeroTiles(mom,liq,fun,val){
  const axes=[['유동성',liq],['모멘텀',mom],['펀더멘털',fun],['밸류',val]];
  const bars=axes.map(([k,v])=>{const s=sigOf(v);return `<div class="tile-bar"><span>${k}</span><span class="bar"><i style="width:${clamp(v,0,100)}%;background:var(--${s})"></i></span><span class="num">${Math.round(v)}</span></div>`;}).join('');
  const hb=document.getElementById('heroRadarBars');if(hb)hb.innerHTML=bars;
  const label=liq>=50&&mom>=50?['상승','bull']:liq>=50&&mom<50?['축적','neutral']:liq<50&&mom>=50?['분배','neutral']:['하락','bear'];
  const cl=document.getElementById('heroCycleLabel');if(cl){cl.textContent=label[0];cl.style.color='var(--'+label[1]+')';}
}
```

- [ ] **Step 3: updateSignalDetail() 추가 (산식·기여도)**

```js
function updateSignalDetail(score,d,w){
  const el=document.getElementById('signalDetail');if(!el)return;
  const n={liq:'유동성',mom:'모멘텀',fun:'펀더멘털',val:'밸류'};
  const rows=['liq','mom','fun','val'].map(k=>{const sc=d[k],wt=w[k],contrib=sc*wt;return `<div class="mrow"><span class="k">${n[k]} <span style="color:var(--faint)">×${Math.round(wt*100)}%</span></span><span class="v">${Math.round(sc)} → <b style="color:var(--text)">${contrib.toFixed(1)}</b></span></div>`;}).join('');
  el.innerHTML=`
    <p><b style="color:var(--text)">종합 ${Math.round(score)} / 100</b> = 0.30·유동성 + 0.25·모멘텀 + 0.25·펀더멘털 + 0.20·밸류 (현재 가중치 적용)</p>
    <div class="fc" style="margin-top:10px">${rows}</div>
    <p style="margin-top:12px">판정 구간: 0–27 약세 지속 · 28–42 약세 우위 · 43–57 중립 · 58–71 강세 전환 · 72–100 강세</p>`;
}
```
(`.mrow`·`.fc` 등은 기존 CSS 재사용. 가중치는 `recompute`가 넘기는 `normW()` 결과.)

- [ ] **Step 4: recompute()에서 헬퍼 호출**

현재(파일 line 984–986):
```js
  verdict(score,{mom,liq,fun,val});
  if(S.month)drawActiveView();
  updateSideBadges();
```
를:
```js
  verdict(score,{mom,liq,fun,val});
  updateHeroTiles(mom,liq,fun,val);
  updateSignalDetail(score,{mom,liq,fun,val},w);
  if(S.month)drawActiveView();
  updateSideBadges();
```
로 바꾼다. (`w`는 바로 위 `const w=normW();`로 이미 정의됨.)

- [ ] **Step 5: 검증 — 인터랙션 + 갱신**

헤드리스(1280px + 390px):
- 대시보드: 시그널 게이지(작음) + 레이더 타일에 4축 미니바(유동성/모멘텀/펀더멘털/밸류 값·색) + 사이클 타일에 현재 국면 라벨(상승/축적/분배/하락, 색).
- 시그널 패널 클릭 → `signal` 상세(종합 점수·가중치·4축 기여 행·판정 구간). 백링크 클릭 → 대시보드.
- 레이더 타일 클릭 → `radar` 상세(큰 레이더 + 4카드 원자료). 사이클 타일 클릭 → `clock` 상세(사분면+범례).
- 키보드: 타일에 Tab 포커스 후 Enter로 진입.
- 회귀: 콘솔 JS 에러 0, 기존 패턴 뷰(계절성~변동성) 정상, 60초 갱신 후 타일/게이지 갱신.
```js
// 클릭 시뮬레이션 점검
(()=>{document.querySelector('[data-goto="radar"]').click();return {active:document.querySelector('.view[data-view="radar"]').classList.contains('active'), bars:document.querySelectorAll('#heroRadarBars .tile-bar').length};})()
// 기대: {active:true, bars:4}
```
스크린샷으로 대시보드/상세 3뷰 육안 확인.

- [ ] **Step 6: Commit + 배포**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 히어로 드릴다운 배선 + 타일/시그널상세 갱신(recompute)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
# cafe24 SFTP로 scoopsignal.html 배포(메모리 절차), 라이브 HTTP200 + 마커 확인
```

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지**
- 티커 ETH/USD·ETH/BTC·도미넌스(CoinGecko, 그레이스풀) → Task 1 ✅
- 히어로 작게(게이지 축소) + 컴팩트 타일 2 → Task 2 Step 1,3 ✅
- 3개 클릭 → 드릴다운 상세 뷰(signal/radar/clock) + 백링크 → Task 2 Step 2 + Task 3 Step 1 ✅
- 축별 4카드를 레이더 상세로 이동(대시보드 미표시) → Task 2 Step 1,2 + 검증 `dimsInDash:false` ✅
- 박스 감소 → Task 2(7→~3 패널) ✅
- 레이더·사분면 SVG 상세로 이전, 게이지는 대시보드, recompute 계산부 불변 → Task 2/Task 3 Step 4 ✅
- 상세 뷰 사이드바 미노출·CHART_TIER 미추가 → Task 2(snav 미수정) ✅

**2. 자리표시 스캔:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드 ✅

**3. 타입/이름 일관성:** `updateHeroTiles(mom,liq,fun,val)`·`updateSignalDetail(score,d,w)`·`#heroRadarBars`·`#heroCycleLabel`·`#signalDetail`·`data-goto`·뷰 키(`signal/radar/clock`)가 Task 2 정의 후 Task 3에서 동일하게 사용. `recompute`의 `w=normW()`를 `updateSignalDetail`에 전달(정의 순서 일치). SVG/4카드 id 보존(이동만) ✅
