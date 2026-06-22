# 대시보드 과감한 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** scoopsignal.html 대시보드를 조밀한 지표 그리드(스탯바 + 컴팩트 시그널/레이더 + KPI 타일 13개 + 스파크라인)로 개편하고, 자산 탭을 또렷하게, 새로고침 버튼 제거, 폰트 스케일 통일.

**Architecture:** 기존 `updateSideBadges()`의 14지표 계산을 `buildMetrics()` 단일 출처로 분리(`S._metrics` 맵) → 사이드바 배지 + 새 KPI 타일이 공유(DRY). 대시보드 뷰 본문을 스탯바·컴팩트 앵커·KPI 그리드로 재구성, `recompute()`에서 `renderKpiGrid()` 호출(캐시만, 재fetch 없음). 점수 산식·데이터 로더·14개 상세 뷰·`showView`/`VIEW_DRAW` 불변.

**Tech Stack:** 순수 HTML5/CSS3/Vanilla JS 단일 파일. 무빌드. 검증은 WSL 헤드리스 playwright-core(chromium).

## Global Constraints

- 단일 파일 `signal/scoopsignal.html`. 외부 의존성 추가 금지. 색은 기존 CSS 변수만(하드코딩 색·신규 색 토큰 금지): `--ink/--panel/--panel-2/--line/--gold/--eth/--bull/--neutral/--bear/--muted/--faint/--text` 및 `*-tint/*-dim`. `html{zoom:1.35}`, 한국어, 2 spaces, 압축형 코드 스타일. 좌측 컬러바 금지.
- **박스 남발 금지 원칙**: 콘텐츠는 약한 틴트 면(`--panel`)+여백으로 그룹, 보더는 버튼·배지·구분선에만, 라운드는 외곽만, 중첩 카드 금지.
- **폰트 타입 스케일(통일, CSS px @ zoom1.35)** — 모든 신규/수정 컴포넌트가 이 스케일을 따른다:
  - 숫자=`var(--mono)`, 텍스트=`var(--sans)`.
  - 게이지 점수 30 / 스탯값 18 / 타일값 17 / 카드·섹션 제목 14 / 타일·스탯 라벨 11.5(`--muted`) / 그룹 소제목 10(uppercase, letter-spacing .16em, `--faint`) / 본문 12.5 / 캡션 11.
  - letter-spacing: 제목 -.02em, 본문 -.01em.
- **불변(절대 수정 금지):** 점수 산식(`scoreMom/Liq/Fun/Val`,`recompute` 계산부,`normW`), 데이터 로더(`loadUpbit/Llama/Dollar/Fred/Beacon/CoinGecko/Ultrasound/Treasury/Etf`), 14개 상세 뷰, `showView`/`VIEW_DRAW`/`activeView`, `lineChart`/`buildGauge`/`renderGauge`/`renderRadar`. 헤더 2단·드로어 JS(`openSide`/`#sideClose`). 기존 `data-f` 스탯 훅(`ethUsd/ethChg/ethBtc/ethBtcChg/domVal`)·`setF`/`chg`·`css`/`sigOf`/`clamp`/`setBadge` 헬퍼.
- KPI 타일·스탯·스파크라인은 전부 `S` 캐시에서 렌더(재fetch 없음).

## 검증 하니스 (모든 Task 공통)

WSL chromium 사용. playwright-core는 CommonJS:
```js
import pkg from '/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.js';
const { chromium } = pkg;
```
launch `chromium.launch({ executablePath: process.env.CHROME_BIN, args:['--no-sandbox'] })`, 실행:
`CHROME_BIN=/home/jschoi0223/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome LD_LIBRARY_PATH=/tmp/chrlibs node /tmp/<script>.mjs`
파일 URL `file:///home/jschoi0223/projects/vdiportal/signal/scoopsignal.html`. `goto` 후 `waitForTimeout(2500)`(데이터 로드 대기). `pageerror`(미처리 JS 예외)만 실패 집계(네트워크/CORS 무시). 스크린샷 + computed-style/DOM 단정. file://에선 일부 소스가 비어 일부 지표가 "—"일 수 있음 — 정상(그레이스풀). 환경 불가 시 grep+육안 폴백 후 보고.

---

## Task 1: buildMetrics() — 14지표 단일 출처 리팩터 (DRY)

**Files:**
- Modify: `signal/scoopsignal.html` — `updateSideBadges()`(현 1252-1279행)

**Interfaces:**
- Consumes: 기존 `S` 필드(month/week/band/ma200/us/defidom/treasury/etf), `pctRank`/`lerp`/`trigEval`/`supply30dChg`/`VOL_WIN`.
- Produces: 전역 `buildMetrics()` → `S._metrics = { key:{val:string, sig:'bull'|'bear'|'muted'} }` (keys: season,spiral,cycle,halving,band,mayer,dd,vol,supply,gas,staking,defidom,treasury,trigger,squeeze,etf). Task 4가 소비.

- [ ] **Step 1: `updateSideBadges()`를 `buildMetrics()` + 소비로 분리**

현재 `updateSideBadges()`(1252-1279행, 각 지표를 `setBadge(view,txt,sig)`로 직접 호출)를 아래로 교체한다. **수치·색 로직은 100% 동일**(setBadge 인자를 맵에 담는 것으로만 변경):

```js
function buildMetrics(){
  const m={};
  const set=(k,val,sig)=>{m[k]={val,sig:sig||'muted'};};
  // 계절성: 이번 달 과거 평균 수익률
  if(S.month&&S.month.c&&S.month.c.length>2){const t=S.month.t,c=S.month.c,mo=new Date(t[t.length-1]).getUTCMonth();let s=0,n=0;for(let i=1;i<c.length;i++){if(new Date(t[i]).getUTCMonth()===mo){s+=(c[i]/c[i-1]-1)*100;n++;}}const a=n?s/n:0;set('season',(a>=0?'+':'')+a.toFixed(1)+'%',a>=0?'bull':'bear');}else set('season','—','muted');
  if(S.month&&S.month.t&&S.month.t.length){const t=S.month.t,yrs=((t[t.length-1]-t[0])/(365.25*864e5));set('spiral',yrs.toFixed(0)+'년','muted');}else set('spiral','—','muted');
  const wk=S.week&&S.week.t&&S.week.t.length?S.week.t:null;
  const nearW=tt=>{let bi=0,bd=1e18;for(let i=0;i<wk.length;i++){const d=Math.abs(wk[i]-tt);if(d<bd){bd=d;bi=i;}}return wk.length-1-bi;};
  if(wk){set('cycle',nearW(Date.parse('2022-06-18'))+'주','muted');set('halving',nearW(Date.parse('2024-04-20'))+'주','muted');}else{set('cycle','—','muted');set('halving','—','muted');}
  if(S.band&&isFinite(S.band.z)){const z=S.band.z;set('band','z='+(z>=0?'+':'')+z.toFixed(1)+'σ',z>0.7?'bear':z<-0.7?'bull':'muted');}else set('band','—','muted');
  if(S.ma200&&isFinite(S.ma200.mult)){const mm=S.ma200.mult,pr=S.ma200.hist?pctRank(S.ma200.hist,mm):0.5;set('mayer',mm.toFixed(2)+'×',pr>0.8?'bear':pr<0.2?'bull':'muted');}else set('mayer','—','muted');
  if(S.week&&S.week.c&&S.week.c.length){const c=S.week.c;let pk=-Infinity,last=0;for(const v of c){if(v>pk)pk=v;last=(v/pk-1)*100;}set('dd',last.toFixed(0)+'%',last<-50?'bear':last>-15?'bull':'muted');}else set('dd','—','muted');
  if(S.week&&S.week.c&&S.week.c.length>VOL_WIN+1){const c=S.week.c,r=[];for(let i=1;i<c.length;i++)r.push(Math.log(c[i]/c[i-1]));let mn=0;for(let j=r.length-VOL_WIN;j<r.length;j++)mn+=r[j];mn/=VOL_WIN;let s=0;for(let j=r.length-VOL_WIN;j<r.length;j++)s+=(r[j]-mn)*(r[j]-mn);const v=Math.sqrt(s/VOL_WIN)*Math.sqrt(52)*100;set('vol',v.toFixed(0)+'%','muted');}else set('vol','—','muted');
  if(S.us&&S.us.series&&S.us.series.length>1){const s=S.us.series,chg2=s[s.length-1].supply-s[0].supply;set('supply',(chg2<=0?'':'+')+(chg2/1e3).toFixed(1)+'k',chg2<=0?'bull':'bear');}else set('supply','—','muted');
  if(S.us&&S.us.baseFeeGwei!=null)set('gas',S.us.baseFeeGwei.toFixed(1)+'gwei','muted');else set('gas','—','muted');
  if(S.us&&S.us.stakedEth&&S.us.supplyNow)set('staking',(S.us.stakedEth/S.us.supplyNow*100).toFixed(0)+'%','muted');else set('staking','—','muted');
  if(S.defidom)set('defidom',S.defidom.pct.toFixed(0)+'%','muted');else set('defidom','—','muted');
  if(S.treasury&&isFinite(S.treasury.dom))set('treasury',S.treasury.dom.toFixed(1)+'%','muted');else set('treasury','—','muted');
  {const T=trigEval(),av=T.filter(t=>t.a),lit=av.filter(t=>t.on).length;set('trigger',av.length?lit+'/'+av.length:'—',lit>=5?'bull':lit<=2?'bear':'muted');}
  {const p=[],s30=supply30dChg();if(s30!=null)p.push(lerp([[0.5,15],[0.1,40],[0,55],[-0.1,75],[-0.4,92]],s30));if(S.us&&S.us.stakedEth&&S.us.supplyNow)p.push(lerp([[20,25],[28,50],[33,68],[40,90]],S.us.stakedEth/S.us.supplyNow*100));if(S.treasury&&isFinite(S.treasury.dom))p.push(lerp([[2,30],[4,48],[6,62],[10,88]],S.treasury.dom));set('squeeze',p.length?Math.round(p.reduce((a,b)=>a+b,0)/p.length)+'':'—','muted');}
  if(S.etf&&S.etf.total!=null)set('etf',(S.etf.unit==='eth'?(S.etf.total/1e6).toFixed(1)+'M':'$'+(S.etf.total/1e9).toFixed(1)+'B'),'muted');else set('etf','—','muted');
  S._metrics=m;return m;
}
function updateSideBadges(){const m=S._metrics||buildMetrics();for(const k in m)setBadge(k,m[k].val,m[k].sig);}
```

- [ ] **Step 2: `recompute()`에서 buildMetrics가 updateSideBadges 전에 돌도록 보장**

`recompute()`(현 1321행) `updateSideBadges();`를 `buildMetrics();updateSideBadges();`로 교체(맵을 먼저 생성 → 배지·Task4 타일 동일 맵 사용).

- [ ] **Step 3: 헤드리스 검증 — 사이드바 배지 회귀 0 + 맵 생성**

`/tmp/v1.mjs` ASSERTIONS:
```js
() => {
  const badges = {};
  document.querySelectorAll('.snav-item[data-view] .snav-badge').forEach(e=>{
    const v=e.closest('.snav-item').dataset.view; badges[v]=e.textContent;
  });
  return { hasMetrics: !!window.S && !!S._metrics, metricKeys: S._metrics?Object.keys(S._metrics).length:0,
           sampleBadges:{season:badges.season,mayer:badges.mayer,gas:badges.gas,trigger:badges.trigger} };
}
```
Expected: `hasMetrics:true`, `metricKeys` ≥ 13, 배지 텍스트가 리팩터 전과 동일(값 형식 `±x.x%`/`x.xx×`/`x.xgwei`/`n/m`). JS 에러 0.

- [ ] **Step 4: Commit**
```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: buildMetrics() 단일 출처 리팩터 — 14지표 값/색 맵(S._metrics), 사이드바 배지 회귀 0"
```

---

## Task 2: 자산 탭 또렷하게 + 새로고침 제거

**Files:**
- Modify: `signal/scoopsignal.html` — `.asset`/`.hdr-nav` CSS(현 195-200 부근), 헤더 `#refreshBtn` 마크업, 드로어 `.refresh-ic` 마크업, `refresh()`/바인딩

**Interfaces:**
- Consumes: 없음. Produces: 없음(시각/제거).

- [ ] **Step 1: 자산 탭 가독성·활성 강조 강화 (CSS)**

`.asset`/`.asset.on`/`.asset[disabled]`/`.asset .soon` 규칙을 아래로 교체(타입 스케일 13px·또렷 대비·활성 강조):
```css
  .asset{appearance:none;font:inherit;font-size:13px;font-weight:600;color:var(--muted);background:none;border:none;border-bottom:2px solid transparent;border-radius:0;padding:9px 2px;margin-bottom:-1px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;letter-spacing:-.01em}
  .asset:not([disabled]):hover{color:var(--text)}
  .asset.on{color:var(--gold);font-weight:800;border-bottom-color:var(--gold)}
  .asset[disabled]{color:var(--faint);cursor:not-allowed}
  .asset .soon{font-size:8px;font-weight:700;color:var(--faint);background:var(--panel-2);border-radius:4px;padding:1px 3px;letter-spacing:0}
  .asset:focus-visible{outline:2px solid var(--gold);outline-offset:-2px;border-radius:4px}
```
(비활성 라벨이 `--faint`라 흐릿했던 걸 활성=골드 굵게로 또렷이 구분, 준비중 칩은 더 작게 `--panel-2` 배경.)

- [ ] **Step 2: 헤더 새로고침 버튼 제거**

헤더 `.hdr-status`에서 `#refreshBtn` 버튼 전체(`<button class="refresh-ic" id="refreshBtn" ...>…</button>`)를 삭제. 남는 `.hdr-status`는 `.hdr-status-txt`(갱신 텍스트)만 포함.

- [ ] **Step 3: 드로어 새로고침 버튼 제거**

드로어 `.side-acct-upd`의 새로고침 버튼(`<button class="refresh-ic" type="button" title="새로고침" ...>…</button>`)을 삭제. `.side-acct-upd`는 "마지막 갱신 …" 텍스트만 남긴다(`<div class="side-acct-upd">마지막 갱신 <span id="updatedAtSide">—</span></div>`로 환원).

- [ ] **Step 4: refresh() 바인딩 정리 (자동 갱신 유지)**

`refresh()` 내부의 `.refresh-ic` 토글 2줄은 빈 NodeList여도 무해하나, 죽은 코드 정리를 위해 제거한다:
- `document.querySelectorAll('.refresh-ic').forEach(b=>{b.disabled=true;b.classList.add('spinning');});` 줄 삭제
- `document.querySelectorAll('.refresh-ic').forEach(b=>{b.disabled=false;b.classList.remove('spinning');});` 줄 삭제
- 클릭 바인딩 `document.querySelectorAll('.refresh-ic').forEach(b=>b.addEventListener('click',refresh));` 줄 삭제
`setInterval(refresh,120000);`와 최초 `refresh();` 호출은 유지(자동 갱신).

- [ ] **Step 5: 헤드리스 검증 (1280 + 390 드로어)**

`/tmp/v2.mjs`:
```js
() => {
  const cs=el=>getComputedStyle(el);
  const eth=[...document.querySelectorAll('.asset')].find(a=>a.dataset.asset==='eth');
  return {
    noRefreshBtn: !document.querySelector('#refreshBtn'),
    noRefreshIc: document.querySelectorAll('.refresh-ic').length===0,
    ethBold: cs(eth).fontWeight,            // '800'
    ethColor: cs(eth).color,                // gold rgb(232,180,99)
    autoText: !!document.querySelector('#updatedAt'),
  };
}
```
Expected: `noRefreshBtn:true`, `noRefreshIc:true`, `ethBold:"800"`, `ethColor:"rgb(232, 180, 99)"`, `autoText:true`, JS 에러 0. 1280·390(드로어 열어 `.side-acct-upd`에 버튼 없음 확인) 스크린샷.

- [ ] **Step 6: Commit**
```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 자산 탭 또렷하게(활성 골드 강조)·새로고침 버튼 제거(자동 갱신 유지)"
```

---

## Task 3: 대시보드 — 압축 스탯바 + 컴팩트 시그널/레이더 앵커

**Files:**
- Modify: `signal/scoopsignal.html` — 전역 `.ticker` 마크업(현 374-378)·CSS(45-48), 대시보드 `.hero2` 마크업(384-409)·CSS(273-293), `updateHeroTiles()`(1325-1331)

**Interfaces:**
- Consumes: 기존 `data-f`(ethUsd/ethChg/ethBtc/ethBtcChg/domVal), `#scoreNum`/`#verdictText`/`#verdictRead`/`#heroRadarBars`, `renderGauge`/`verdict`/`updateHeroTiles`. Task1의 무관.
- Produces: `.dash-stats`(전역 스탯바, `#statScore` 종합점수 칩), `.dash-anchor`(컴팩트 시그널+레이더), `#cyclePhase` 칩. 그 아래 KPI 그리드 자리(Task4).

- [ ] **Step 1: 전역 티커 → 압축 스탯바 마크업 교체**

`<div class="ticker">…</div>`(374-378, 3개 `.tk`) 전체를 아래로 교체(데이터 훅 `data-f` 유지):
```html
  <div class="dash-stats">
    <div class="ds"><span class="ds-lab">ETH / USD</span><span class="ds-val mono" data-f="ethUsd">—</span><span class="ds-chg mono" data-f="ethChg">—</span></div>
    <div class="ds"><span class="ds-lab">ETH / BTC</span><span class="ds-val mono" data-f="ethBtc">—</span><span class="ds-chg mono" data-f="ethBtcChg">—</span></div>
    <div class="ds"><span class="ds-lab">ETH 도미넌스</span><span class="ds-val mono" data-f="domVal">—</span><span class="ds-chg mono" style="color:var(--faint)">시총 점유</span></div>
    <div class="ds ds-score" id="statScore" role="button" tabindex="0" aria-label="ETH 시그널 상세"><span class="ds-lab">종합 시그널</span><span class="ds-val mono" id="statScoreVal">—</span><span class="ds-chg" id="statScoreVerdict">측정 중</span></div>
  </div>
```

- [ ] **Step 2: 티커 CSS → 스탯바 CSS 교체**

`.ticker`/`.tk`/`.tk .lab`/`.tk .val`/`.tk .chg`(45-48)를 아래로 교체:
```css
  .dash-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border-radius:10px;overflow:hidden;margin-bottom:14px}
  .ds{background:var(--panel);padding:9px 14px;display:flex;flex-direction:column;gap:1px;min-width:0}
  .ds-lab{font-size:11.5px;color:var(--muted);letter-spacing:-.01em}
  .ds-val{font-size:18px;font-weight:700;color:var(--text)}
  .ds-chg{font-size:11.5px;color:var(--faint)}
  .ds-score{cursor:pointer}
  .ds-score #statScoreVerdict{font-weight:700}
  .ds-score:hover{background:var(--panel-2)}
  .ds-score:focus-visible{outline:2px solid var(--gold);outline-offset:-2px}
  @media(max-width:680px){.dash-stats{grid-template-columns:repeat(2,1fr)}}
```
(틴트 그룹: 셀은 `--line` 1px 격자로 분리되는 단일 스트립. 보더 박스 아님.)

- [ ] **Step 3: 대시보드 hero2 → 컴팩트 앵커 마크업 교체**

`<section class="hero2">…</section>`(384-409) 전체를 아래로 교체(게이지 SVG·`#scoreNum`·`#verdict*`·`#heroRadarBars` id 유지, 사이클 타일 제거→시그널 카드 내 `#cyclePhase` 칩):
```html
  <section class="dash-anchor">
    <div class="pane signal-pane" data-goto="signal" role="button" tabindex="0" aria-label="ETH 시그널 상세 보기">
      <div class="ptitle">ETH 시그널 <span class="go">상세 ›</span></div>
      <div class="sig-row">
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
        <div class="sig-meta">
          <h3 id="verdictText">측정 중…</h3>
          <p id="verdictRead"></p>
          <span class="cycle-chip">사이클 <b id="cyclePhase">—</b></span>
        </div>
      </div>
    </div>
    <div class="pane radar-tile" data-goto="radar" role="button" tabindex="0" aria-label="ETH 레이더 4축 상세 보기">
      <div class="ptitle">ETH 레이더 · 4축 <span class="go">›</span></div>
      <div class="tile-bars" id="heroRadarBars"></div>
    </div>
  </section>
```

- [ ] **Step 4: hero2 CSS → dash-anchor CSS 교체 (컴팩트)**

`.hero2`/`.signal-pane`/`.signal-pane .gauge-wrap`/`.hero-tiles`/`.hero-tile`/`.tile-*`/`@media(max-width:880px)` 중 hero2 관련 규칙(273-293)을 아래로 교체:
```css
  .dash-anchor{display:grid;grid-template-columns:1.15fr 1fr;gap:12px;margin-bottom:16px;align-items:stretch}
  .signal-pane,.radar-tile{cursor:pointer}
  .signal-pane:hover,.radar-tile:hover{box-shadow:inset 0 0 0 1px var(--gold)}
  .signal-pane:focus-visible,.radar-tile:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .ptitle .go{color:var(--gold);font-size:11px;font-weight:700;float:right}
  .sig-row{display:flex;align-items:center;gap:14px;margin-top:6px}
  .sig-row .gauge-wrap{width:150px;flex:0 0 auto;margin:0}
  .sig-meta{min-width:0}
  .sig-meta h3{font-size:16px;font-weight:800;color:var(--muted);letter-spacing:-.02em}
  .sig-meta p{font-size:12px;color:var(--muted);margin-top:5px;line-height:1.5}
  .sig-meta p strong{color:var(--text)}
  .cycle-chip{display:inline-block;margin-top:8px;font-size:11px;color:var(--muted);background:var(--panel-2);border-radius:999px;padding:3px 10px}
  .cycle-chip b{color:var(--text);font-weight:700}
  .tile-bars{display:flex;flex-direction:column;gap:9px;margin-top:8px}
  .tile-bar{display:grid;grid-template-columns:62px 1fr 30px;align-items:center;gap:8px;font-size:11.5px;color:var(--muted)}
  .tile-bar .bar{height:6px;border-radius:3px;background:var(--panel-2);overflow:hidden}
  .tile-bar .bar i{display:block;height:100%;border-radius:3px}
  .tile-bar .num{font-family:var(--mono);text-align:right;color:var(--text)}
  @media(max-width:880px){.dash-anchor{grid-template-columns:1fr}}
  @media(max-width:520px){.sig-row{flex-direction:column;align-items:flex-start}.sig-row .gauge-wrap{width:170px}}
```
(게이지 폭 150px = 현재 절반 수준. 시그널 카드는 게이지+메타 가로 배치.)

- [ ] **Step 5: `updateHeroTiles()` — 사이클 라벨을 `#cyclePhase`로, 스탯 점수 칩 채우기**

`updateHeroTiles(mom,liq,fun,val)`(1325-1331)에서 `#heroCycleLabel` 대신 `#cyclePhase`에 위상을 쓰고, 스탯바 점수 칩도 채운다. 함수 말미(`const cl=...heroCycleLabel...` 줄)를 아래로 교체:
```js
  const cp=document.getElementById('cyclePhase');if(cp){cp.textContent=label[0];cp.style.color='var(--'+label[1]+')';}
}
```
그리고 `recompute()`의 `renderGauge(score);` 다음 줄에 스탯 점수 동기화를 추가:
```js
  {const sv=document.getElementById('statScoreVal');if(sv)sv.textContent=Math.round(score);
   const vv=document.getElementById('statScoreVerdict');if(vv){const sg=sigOf(score);vv.textContent=sg==='bull'?'강세':sg==='bear'?'약세':'중립';vv.style.color='var(--'+sg+')';}}
```

- [ ] **Step 6: 스탯 점수 칩 클릭 → 시그널 상세 바인딩**

`[data-goto]` 바인딩이 `#statScore`에는 안 걸리므로(스탯엔 data-goto 없음), 기존 `[data-goto]` 처리부 근처에 추가:
```js
{const ss=document.getElementById('statScore');if(ss){const g=()=>showView('signal');ss.addEventListener('click',g);ss.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();g();}});}}
```

- [ ] **Step 7: 헤드리스 검증 (1280/390)**

`/tmp/v3.mjs`:
```js
() => {
  const cs=el=>getComputedStyle(el);
  return {
    statsCols: cs(document.querySelector('.dash-stats')).gridTemplateColumns.split(' ').length, // 4 (desktop)
    gaugeW: Math.round(document.querySelector('.sig-row .gauge-wrap').getBoundingClientRect().width),
    radarBars: document.querySelectorAll('#heroRadarBars .tile-bar').length, // 4
    tickerGone: !document.querySelector('.ticker'),
    hero2Gone: !document.querySelector('.hero2'),
    cyclePhase: !!document.querySelector('#cyclePhase'),
    statScore: !!document.querySelector('#statScoreVal'),
  };
}
```
Expected(1280): `statsCols:4`, `gaugeW` ≈ 150×1.35 ≈ 200(±30), `radarBars:4`, `tickerGone:true`, `hero2Gone:true`, `cyclePhase:true`, `statScore:true`, JS 에러 0. 스크린샷 1280·390(스탯 2열).

- [ ] **Step 8: Commit**
```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 대시보드 압축 스탯바 + 컴팩트 시그널/레이더 앵커(게이지 절반·사이클 칩·스탯 점수)"
```

---

## Task 4: KPI 지표 그리드 + 스파크라인

**Files:**
- Modify: `signal/scoopsignal.html` — 대시보드 뷰에 `#kpiGrid` 마크업 추가(Task3 앵커 다음), 신규 CSS(`.kpi-*`), 신규 JS(`KPI_META`/`sparkline`/`renderKpiGrid`), `recompute()` 훅

**Interfaces:**
- Consumes: Task1 `S._metrics[key]={val,sig}`, `showView`, `sigOf`, `clamp`, `S.ma200.hist`/`S.us.series`/`S.week.c`.
- Produces: `renderKpiGrid()` (recompute에서 호출), `sparkline(cv,series,sig)`.

- [ ] **Step 1: `#kpiGrid` 컨테이너 마크업 추가**

Task3에서 만든 `<section class="dash-anchor">…</section>` 닫힘 **바로 다음**에 추가:
```html
  <div class="kpi-grid" id="kpiGrid"></div>
```

- [ ] **Step 2: KPI CSS 추가**

`.dash-anchor` 관련 CSS 블록 다음에 추가:
```css
  .kpi-grid{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
  .kpi-group{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:10px 2px 4px}
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .kpi{background:var(--panel);border-radius:12px;padding:11px 13px;display:flex;flex-direction:column;gap:5px;cursor:pointer;border:none;text-align:left;font:inherit;position:relative;min-width:0}
  .kpi:hover{box-shadow:inset 0 0 0 1px var(--gold)}
  .kpi:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .kpi-lab{font-size:11.5px;color:var(--muted);letter-spacing:-.01em;display:flex;justify-content:space-between;align-items:center}
  .kpi-lab .go{color:var(--faint);font-size:12px}
  .kpi-val{font-family:var(--mono);font-size:17px;font-weight:700}
  .kpi-sub{font-size:10.5px;color:var(--faint)}
  .kpi-spark{width:100%;height:26px;display:block}
  @media(max-width:880px){.kpi-row{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:420px){.kpi-row{grid-template-columns:1fr}}
```

- [ ] **Step 3: KPI 구성·스파크라인·렌더 JS 추가**

`updateHeroTiles` 함수 정의 **다음**에 추가:
```js
const KPI_META=[
  {title:'밸류·리스크', keys:[
    {k:'mayer',label:'200주 배수',sub:'장기 이평 대비',view:'mayer'},
    {k:'band',label:'로그 밴드',sub:'회귀 채널 z',view:'band'},
    {k:'dd',label:'드로다운',sub:'ATH 대비',view:'dd'},
    {k:'vol',label:'변동성',sub:'연율 실현',view:'vol'}]},
  {title:'온체인·네트워크', keys:[
    {k:'supply',label:'순발행·공급',sub:'Merge 이후',view:'supply'},
    {k:'gas',label:'가스·수수료',sub:'기준 가스',view:'gas'},
    {k:'staking',label:'스테이킹 비율',sub:'공급 대비',view:'staking'},
    {k:'defidom',label:'DeFi 지배력',sub:'ETH 비중',view:'defidom'}]},
  {title:'사이클·기관', keys:[
    {k:'cycle',label:'사이클',sub:'바닥 후 경과',view:'cycle'},
    {k:'season',label:'계절성',sub:'이번 달 평균',view:'season'},
    {k:'treasury',label:'기관 ETH 보유',sub:'공급 점유',view:'treasury'},
    {k:'squeeze',label:'공급압력 지수',sub:'0~100',view:'squeeze'},
    {k:'trigger',label:'강세 전환 트리거',sub:'점등/조건',view:'trigger'}]},
];
function sparkSeries(k){
  if(k==='mayer'&&S.ma200&&S.ma200.hist&&S.ma200.hist.length>4)return S.ma200.hist.slice(-80);
  if(k==='supply'&&S.us&&S.us.series&&S.us.series.length>4)return S.us.series.map(x=>x.supply);
  if((k==='dd'||k==='band'||k==='vol')&&S.week&&S.week.c&&S.week.c.length>30){
    const c=S.week.c.slice(-120);
    if(k==='dd'){let pk=-Infinity;return c.map(v=>{if(v>pk)pk=v;return (v/pk-1)*100;});}
    return c; // band/vol: 가격 추세를 스파크라인으로
  }
  return null;
}
function sparkline(cv,series,sig){
  const dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;
  if(!W||!H||!series||series.length<2)return;
  cv.width=W*dpr;cv.height=H*dpr;const x=cv.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,W,H);
  let mn=Infinity,mx=-Infinity;for(const v of series){if(v<mn)mn=v;if(v>mx)mx=v;}
  if(!isFinite(mn)||mx===mn){mx=mn+1;}
  const col=getComputedStyle(document.documentElement).getPropertyValue('--'+(sig||'muted')).trim()||'#8B98A6';
  x.beginPath();series.forEach((v,i)=>{const px=i/(series.length-1)*(W-2)+1,py=H-2-((v-mn)/(mx-mn))*(H-4);i?x.lineTo(px,py):x.moveTo(px,py);});
  x.strokeStyle=col;x.lineWidth=1.5;x.lineJoin='round';x.stroke();
}
function renderKpiGrid(){
  const grid=document.getElementById('kpiGrid');if(!grid)return;
  const m=S._metrics||{};
  grid.innerHTML=KPI_META.map(g=>`<div class="kpi-group">${g.title}</div><div class="kpi-row">`+
    g.keys.map(it=>{const d=m[it.k]||{val:'—',sig:'muted'};const hasSpark=!!sparkSeries(it.k);
      return `<button class="kpi" data-view="${it.view}" type="button">`+
        `<span class="kpi-lab">${it.label}<span class="go">›</span></span>`+
        `<span class="kpi-val" style="color:var(--${d.sig})">${d.val}</span>`+
        (hasSpark?`<canvas class="kpi-spark" data-spark="${it.k}"></canvas>`:`<span class="kpi-sub">${it.sub}</span>`)+
      `</button>`;}).join('')+`</div>`).join('');
  // 스파크라인 그리기
  grid.querySelectorAll('canvas[data-spark]').forEach(cv=>{const k=cv.dataset.spark;sparkline(cv,sparkSeries(k),(m[k]||{}).sig);});
  // 클릭 바인딩(위임)
  if(!grid._bound){grid._bound=true;grid.addEventListener('click',e=>{const b=e.target.closest('.kpi[data-view]');if(b)showView(b.dataset.view);});}
}
```

- [ ] **Step 4: `recompute()`에 renderKpiGrid 훅**

`recompute()` 말미 `buildMetrics();updateSideBadges();`(Task1 적용분) **다음 줄**에 추가:
```js
  renderKpiGrid();
```

- [ ] **Step 5: 헤드리스 검증 (1280/880/390)**

`/tmp/v4.mjs`:
```js
() => {
  const grid=document.querySelector('#kpiGrid');
  const tiles=grid.querySelectorAll('.kpi');
  const groups=grid.querySelectorAll('.kpi-group').length;
  const sparks=grid.querySelectorAll('canvas[data-spark]').length;
  // 클릭→상세 뷰
  const first=grid.querySelector('.kpi[data-view="mayer"]'); first&&first.click();
  const mayerActive=document.querySelector('.view[data-view="mayer"]').classList.contains('active');
  if(window.showView)showView('dashboard');
  const cols=getComputedStyle(grid.querySelector('.kpi-row')).gridTemplateColumns.split(' ').length;
  return { tiles:tiles.length, groups, sparks, mayerActive, cols };
}
```
Expected(1280): `tiles` ≥ 13, `groups:3`, `sparks` ≥ 1, `mayerActive:true`, `cols:4`. 880에서 `cols:2`. JS 에러 0. 스크린샷 1280·880·390(그리드 조밀·스파크라인·그룹).

- [ ] **Step 6: Commit**
```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: KPI 지표 그리드(13타일·3그룹·미니 스파크라인·클릭→상세) — recompute 훅"
```

---

## 최종 통합 검증 (전 Task 완료 후)

- [ ] 1280/880/390 헤드리스 스크린샷 최종: 스탯바 조밀, 시그널+레이더 컴팩트, KPI 그리드 3그룹·13타일·스파크라인 → "빈약" 해소, 전문 분석 밀도.
- [ ] 자산 탭 또렷·이더리움 활성 강조. 새로고침 버튼 헤더·드로어 모두 없음·자동 갱신 표기 유지.
- [ ] KPI 타일 클릭 → 해당 상세 뷰. 사이드바 배지 값 회귀 0(buildMetrics 동일). 점수·게이지·레이더 정상.
- [ ] 폰트 스케일 일관(타일값·스탯값 mono 17/18, 라벨 11.5, 그룹 10). JS 에러 0, 14개 상세 뷰 회귀 0.

## Self-Review 메모 (작성자 점검 완료)

- **Spec 커버리지:** buildMetrics DRY(T1)·자산탭+새로고침(T2)·스탯바+컴팩트앵커(T3)·KPI그리드+스파크라인(T4)·폰트 스케일(Global Constraints+전 컴포넌트 적용) — spec §4·5·6·7·8 전 항목 매핑.
- **불변 보장:** 점수/로더/상세뷰/showView/lineChart 미변경. `data-f` 훅·`#scoreNum`/`#heroRadarBars`/`#verdict*` id 유지. T1은 순수 리팩터(수치 동일).
- **타입/이름 일관성:** `S._metrics`(T1 produce → T4 consume), `renderKpiGrid`/`sparkline`/`KPI_META`/`sparkSeries`(T4 내부), `#cyclePhase`/`#statScoreVal`(T3 produce, T3에서 채움). KPI `data-view` 값은 기존 뷰 키와 일치.
- **순서 의존:** T4가 T1(S._metrics)·T3(#kpiGrid 위치) 의존 → 1→2→3→4. T2는 독립(헤더/탭).
- **그레이스풀:** file://·지오블록 시 일부 지표 "—", 스파크라인 없으면 sub 표시. 회귀 아님.
