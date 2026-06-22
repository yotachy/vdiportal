# ETH 온체인·네트워크 지표 4종 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ETH 고유 지표 4종(순발행·공급 / 가스·수수료 / 스테이킹 비율 / ETH DeFi 지배력)을 사이드바 새 그룹 "온체인·네트워크"의 표시전용 뷰로 추가한다.

**Architecture:** `scoopsignal.html` 단일 파일. 신규 `loadUltrasound()`(ultrasound.money 3 엔드포인트, CORS·노키 검증됨) + DeFi 지배력은 기존 `loadLlama`의 chains 재사용. 4개 뷰는 기존 패턴 뷰와 동일 골격(사이드바 직접 진입). canvas 2개(supply·defidom)는 `lineChart` 재사용, gas·staking은 현재값 스탯. 점수 산식·뷰 라우터 골격 불변.

**Tech Stack:** 순수 HTML5·CSS3·Vanilla JS. 데이터 fetch는 클라이언트 사이드. 신규 외부 의존: ultrasound.money 공개 API(노키).

## Global Constraints

- 단일 파일: 모든 변경은 `signal/scoopsignal.html`. 파일 분리 금지.
- 디자인 토큰만(`--gold/--ink/--bull/--neutral/--bear/--muted/--panel/--panel-2/--line/--text/--faint`). 하드코딩 색 금지. 좌측 컬러바 금지(아이콘 면).
- `html{zoom:1.35}` 유지. UI 텍스트 한국어. 들여쓰기 2 spaces, 기존 압축형 스타일.
- 점수 산식(`scoreMom/Liq/Fun/Val`)·`recompute()` 계산부·뷰 라우터(`showView`/`activeView`) 골격·기존 지표 불변.
- 그레이스풀: ultrasound/DeFiLlama 실패해도 나머지·점수 정상(`Promise.allSettled`). 실패 뷰는 "연결 필요"/— 표시.
- 단위 환산: ultrasound supply 필드=ETH 그대로 · effective-balance-sum `sum`=Gwei(÷1e9=ETH) · baseFeePerGas=wei(÷1e9=gwei) · burnRate=wei/s(연율 ETH=×31.536e6÷1e18).
- 4뷰 모두 표시전용·`CHART_TIER` Basic 등록(점수 미반영).

**검증 방식:** 테스트 프레임워크 없는 정적 HTML. 로컬 서버 + 헤드리스 Chromium DOM/스크린샷. 단위테스트 코드 없음.
```bash
cd /home/jschoi0223/projects/vdiportal/signal && python3 -m http.server 8099
```
헤드리스: chrome `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`, `require("/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core")`, `LD_LIBRARY_PATH=/tmp/chrlibs node script.js`.

---

## File Structure

- Modify only: `signal/scoopsignal.html`
  - Task 1: script — `loadUltrasound()`, `loadLlama`에 DeFi 지배력·TVL times, `refresh` allSettled, 상태 푸터 항목.
  - Task 2: 마크업 — 사이드바 새 그룹+4항목(아이콘), 4 뷰 섹션, CSS, `CHART_TIER` 4항목.
  - Task 3: script — `drawSupply`/`drawDefiDom`/`renderOnchain`, `VIEW_DRAW`/`recompute`/`updateSideBadges` 연결 + 배포.

---

### Task 1: 데이터 레이어 (ultrasound + DeFi 지배력)

**Files:** Modify `signal/scoopsignal.html` (script: loadUltrasound, loadLlama 추가, refresh, 상태 푸터)

**Interfaces:**
- Consumes: `jget`, `setStatus`, `Promise.allSettled` 오케스트레이션, 기존 `loadLlama` chains/tvl.
- Produces: `S.us`(공급 시계열·가스·소각·스테이킹), `S.defidom`({pct,ethTvl}), `S.tvl.times`.

- [ ] **Step 1: loadUltrasound() 추가**

다른 로더(`loadCoinGecko` 근처) 뒤에 추가:
```js
async function loadUltrasound(){
  try{
    const[so,fa,eb]=await Promise.all([
      jget('https://ultrasound.money/api/v2/fees/supply-over-time'),
      jget('https://ultrasound.money/api/fees/all'),
      jget('https://ultrasound.money/api/v2/fees/effective-balance-sum')
    ]);
    const raw=so.sinceMerge||so.d30||so.d7||so.d1||[];
    const series=raw.filter(p=>p&&p.supply!=null&&p.timestamp).map(p=>({t:Date.parse(p.timestamp),supply:+p.supply}));
    const br=fa.burnRates||{};
    const annual=w=>(+w||0)*31.536e6/1e18;   // wei/s → 연율 ETH
    S.us={
      series, supplyNow: series.length?series[series.length-1].supply:null,
      baseFeeGwei: fa.baseFeePerGas!=null?(+fa.baseFeePerGas/1e9):null,
      burn24h: annual(br.burnRate24h), burn7d: annual(br.burnRate7d), burn30d: annual(br.burnRate30d),
      defl: fa.deflationaryStreak||null,
      stakedEth: eb&&eb.sum!=null?(+eb.sum/1e9):null
    };
    setStatus('ultrasound','ok');
  }catch(e){S.us=null;setStatus('ultrasound','warn');}
}
```

- [ ] **Step 2: loadLlama에 DeFi 지배력 + TVL times 추가**

`loadLlama` 안에서 `const tv=tvl.map(d=>d.tvl);S.tvl={series:tv,...};` 줄을 찾아, 그 줄을 다음으로 바꾼다(times 추가):
```js
  const tv=tvl.map(d=>d.tvl);S.tvl={series:tv,times:tvl.map(d=>d.date*1000),chg30:pctChange(tv,30),hist:rollChanges(tv,30)};
```
그리고 `chains.forEach(...)`로 l2sum 구하는 줄 근처(같은 함수 내, chains 사용 가능 위치)에 DeFi 지배력 산출 추가:
```js
  const ethC=chains.find(c=>c.name==='Ethereum'),totalTvl=chains.reduce((a,c)=>a+(c.tvl||0),0);
  S.defidom=(ethC&&totalTvl>0)?{pct:ethC.tvl/totalTvl*100,ethTvl:ethC.tvl}:null;
```

- [ ] **Step 3: refresh() allSettled + 상태 푸터**

`refresh()`의 allSettled를:
```js
  const r=await Promise.allSettled([loadBinance(),loadLlama(),loadDollar(),loadFred(),loadBeacon(),loadCoinGecko(),loadUltrasound()]);
```
로 바꾼다(loadUltrasound는 자체 `setStatus('ultrasound',...)` 호출 → `r[6]` 별도 처리 불필요).

상태 푸터에서 `<span class="s"><i id="st-coingecko"></i>도미넌스</span>` 다음에 추가:
```html
        <span class="s"><i id="st-ultrasound"></i>온체인</span>
```

- [ ] **Step 4: 검증 — 데이터 로드**

로컬 서버 + 헤드리스 evaluate(데이터 도착 대기 ~4s):
```js
({us:S.us?{n:S.us.series.length,supply:Math.round(S.us.supplyNow),gwei:S.us.baseFeeGwei,staked:Math.round(S.us.stakedEth),burn30d:Math.round(S.us.burn30d)}:null, defidom:S.defidom?Math.round(S.defidom.pct*10)/10:null, tvlTimes:S.tvl&&S.tvl.times?S.tvl.times.length:0})
```
기대(값은 변동): `us`에 series 길이>0·supply≈1.2e8·staked≈4e7·gwei 양수, `defidom` 양수 %(예 ~55), `tvlTimes`>100. ultrasound 차단 시 `us:null`(디그레이드, 에러 아님) — 콘솔에 ultrasound 키 로그(`Object.keys(so)`)도 한 번 찍어 series 키 확인. 콘솔 JS 에러 0.
```bash
grep -c 'function loadUltrasound' scoopsignal.html   # 1
grep -c 'loadUltrasound()' scoopsignal.html           # 2 (정의 + allSettled)
grep -c 'S.defidom' scoopsignal.html                  # ≥1
```

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: ETH 온체인 데이터 로더(ultrasound + DeFi 지배력)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 사이드바 그룹 + 4 뷰 마크업 + 아이콘 + 등급 + CSS

**Files:** Modify `signal/scoopsignal.html` (사이드바 nav, 뷰 섹션, `<style>`, CHART_TIER)

**Interfaces:**
- Consumes: 기존 `.snav`/`.snav-group`/`.snav-item`/`.snav-main`/`.snav-ic`/`.snav-badge`, `.view`/`.page-head`/`.card`/`.mrow`, `CHART_TIER`.
- Produces: 뷰 `supply`/`gas`/`staking`/`defidom` + canvas `#cvSupply`/`#cvDefiDom` + 통계 `#supplyStats`/`#gasStats`/`#stakingStats`/`#defidomStats`.

- [ ] **Step 1: 사이드바 새 그룹 + 4 항목(듀오톤 아이콘)**

사이드바 nav에서 변동성 항목(`data-view="vol"` 버튼) 바로 뒤, `</nav>` 앞에 추가:
```html
      <div class="snav-group">온체인·네트워크</div>
      <button class="snav-item" data-view="supply"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7.5" ry="3" fill="currentColor"/><path fill="currentColor" fill-opacity=".4" d="M4.5 6v5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6c0 1.66-3.36 3-7.5 3S4.5 7.66 4.5 6Z"/><path fill="currentColor" fill-opacity=".4" d="M4.5 11v5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-5c0 1.66-3.36 3-7.5 3s-7.5-1.34-7.5-3Z"/></svg></span>순발행·공급</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="gas"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-opacity=".4" d="M12 2c3 3.5 6 6.4 6 10.5A6 6 0 0 1 6 12.5C6 8.4 9 5.5 12 2Z"/><path fill="currentColor" d="M12 21a3.6 3.6 0 0 1-3.6-3.6c0-2 1.6-3.4 3.6-5.4 2 2 3.6 3.4 3.6 5.4A3.6 3.6 0 0 1 12 21Z"/></svg></span>가스·수수료</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="staking"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.4" fill="currentColor" fill-opacity=".4"/><path fill="currentColor" d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5h-2.4V8a2.1 2.1 0 0 0-4.2 0v2.5Z"/><circle cx="12" cy="15.2" r="1.8" fill="currentColor"/></svg></span>스테이킹 비율</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="defidom"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".4"/><path fill="currentColor" d="M12 3a9 9 0 0 1 8.49 6H12Z"/></svg></span>DeFi 지배력</span> <span class="snav-badge">—</span></button>
```

- [ ] **Step 2: 4개 뷰 섹션 추가**

`data-view="vol"` 뷰 섹션의 닫는 `</section>` 다음(`</main>` 앞)에 추가:
```html
  <section class="view" data-view="supply">
    <div class="page-head"><h2>순발행·공급</h2><p class="page-sub">Merge 이후 발행(스테이킹 보상)−소각(base fee)으로 결정되는 ETH 공급 추이. 공급이 줄면 디플레(ultrasound). <span id="supplyStats" style="color:var(--muted)"></span></p></div>
    <canvas id="cvSupply"></canvas>
  </section>
  <section class="view" data-view="gas">
    <div class="page-head"><h2>가스·수수료</h2><p class="page-sub">네트워크 수요 지표 — 기준 가스(base fee)와 소각률(연율 ETH). 소각이 발행보다 크면 디플레. <span id="gasStatsLine" style="color:var(--muted)"></span></p></div>
    <div class="card" style="max-width:520px"><div id="gasStats"></div></div>
  </section>
  <section class="view" data-view="staking">
    <div class="page-head"><h2>스테이킹 비율</h2><p class="page-sub">총공급 대비 스테이킹된 ETH 비율(PoS 고유). 높을수록 유통 물량 잠김·네트워크 보안↑. <span id="stakingStatsLine" style="color:var(--muted)"></span></p></div>
    <div class="card" style="max-width:520px"><div id="stakingStats"></div></div>
  </section>
  <section class="view" data-view="defidom">
    <div class="page-head"><h2>ETH DeFi 지배력</h2><p class="page-sub">전체 체인 DeFi TVL 중 이더리움 비중과 ETH DeFi TVL 추이. '디파이 본진' 위상. <span id="defidomStats" style="color:var(--muted)"></span></p></div>
    <canvas id="cvDefiDom"></canvas>
  </section>
```

- [ ] **Step 3: CSS (캔버스 높이 + 스탯 행)**

`<style>`의 패턴 캔버스 높이 규칙에 supply·defidom 추가. 기존 `.view[data-view="vol"] canvas{height:clamp(360px,52vh,460px)}` 줄을 찾아 그 앞 셀렉터 목록에 두 줄 추가하거나, 다음 규칙을 새로 추가:
```css
  .view[data-view="supply"] canvas,.view[data-view="defidom"] canvas{height:clamp(360px,52vh,460px)}
  #gasStats .mrow,#stakingStats .mrow{padding:5px 0;font-size:13px}
  #gasStats .mrow:not(:last-child),#stakingStats .mrow:not(:last-child){border-bottom:1px solid var(--line)}
```

- [ ] **Step 4: CHART_TIER에 4뷰 Basic 등록**

`const CHART_TIER={...}`에서 마지막 `vol:'basic'` 뒤에 추가(쉼표 주의):
```js
  band:'basic', mayer:'basic', dd:'basic', vol:'basic',
  supply:'basic', gas:'basic', staking:'basic', defidom:'basic'
```
(기존 줄 `band:'basic', mayer:'basic', dd:'basic', vol:'basic'`을 위와 같이 교체.)

- [ ] **Step 5: 검증 — 마크업/등급**

헤드리스 DOM:
```js
({nav:['supply','gas','staking','defidom'].map(k=>!!document.querySelector('.snav-item[data-view="'+k+'"]')),
  views:['supply','gas','staking','defidom'].map(k=>!!document.querySelector('.view[data-view="'+k+'"]')),
  group:[...document.querySelectorAll('.snav-group')].some(g=>g.textContent.includes('온체인')),
  cv:[!!document.querySelector('#cvSupply'),!!document.querySelector('#cvDefiDom')]})
// 기대: nav[4×true], views[4×true], group:true, cv[true,true]
```
- `showView('gas')`/`showView('staking')`/`showView('supply')`/`showView('defidom')` 콘솔 호출 시 각 뷰 표시(통계는 Task 3 전이라 비어있음 — 정상).
- 사이드바에 "온체인·네트워크" 그룹 + 4항목(듀오톤 아이콘) 보임. 각 헤더에 Basic 배지(applyTierBadges 자동). 콘솔 에러 0.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 온체인·네트워크 사이드 그룹 + 4뷰 마크업/아이콘/Basic 등급

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 렌더 함수 + 배선 + 배포

**Files:** Modify `signal/scoopsignal.html` (script: draw/render 함수, VIEW_DRAW, recompute, updateSideBadges)

**Interfaces:**
- Consumes: Task 1 `S.us`/`S.defidom`/`S.tvl.times`, Task 2 canvas/stat id, 기존 `lineChart`/`yearTicks`/`setBadge`/`fmtUsd`/`clamp`.
- Produces: `drawSupply()`, `drawDefiDom()`, `renderOnchain()`.

- [ ] **Step 1: drawSupply / drawDefiDom / renderOnchain 추가**

`drawVol` 등 draw 함수 근처에 추가:
```js
function drawSupply(){
  const cv=$('#cvSupply');if(!cv)return;
  if(!S.us||!S.us.series||S.us.series.length<2){const e=$('#supplyStats');if(e)e.innerHTML='연결 필요';lineChart(cv,[],{});return;}
  const s=S.us.series,times=s.map(p=>p.t),vals=s.map(p=>p.supply);
  lineChart(cv,[{label:'ETH 공급',color:css('--gold'),values:vals,w:1.8,markLast:true}],{xTicks:yearTicks(times),xLabel:'기간',yLabel:'공급 ETH'});
  const first=vals[0],last=vals[vals.length-1],chg=last-first;
  const st=$('#supplyStats');if(st)st.innerHTML=`현재 <b style="color:var(--text)">${(last/1e6).toFixed(2)}M ETH</b> · 구간 변화 <span class="${chg<=0?'up':'down'}">${chg>=0?'+':''}${chg.toFixed(0)} ETH</span> ${chg<=0?'<span class="up">디플레</span>':'<span class="down">인플레</span>'} · 30d 소각 <b style="color:var(--text)">${Math.round(S.us.burn30d).toLocaleString()} ETH/yr</b>`;
}
function drawDefiDom(){
  const cv=$('#cvDefiDom');if(!cv)return;
  if(!S.tvl||!S.tvl.series||S.tvl.series.length<2){const e=$('#defidomStats');if(e)e.innerHTML='연결 필요';lineChart(cv,[],{});return;}
  lineChart(cv,[{label:'ETH DeFi TVL',color:css('--gold'),values:S.tvl.series,w:1.8,markLast:true}],{logY:true,xTicks:S.tvl.times?yearTicks(S.tvl.times):[],xLabel:'연도',yLabel:'TVL $(로그)'});
  const st=$('#defidomStats');
  if(st){const dom=S.defidom?S.defidom.pct.toFixed(1)+'%':'—',tvlB=S.defidom?'$'+(S.defidom.ethTvl/1e9).toFixed(1)+'B':'—';
    st.innerHTML=`ETH DeFi 지배력 <b style="color:var(--text)">${dom}</b> · ETH TVL <b style="color:var(--text)">${tvlB}</b> · 30d <span class="${S.tvl.chg30>=0?'up':'down'}">${fmtPct(S.tvl.chg30)}</span>`;}
}
function renderOnchain(){
  // 가스
  const g=$('#gasStats');if(g){g.innerHTML=S.us?
    `<div class="mrow"><span class="k">기준 가스(base fee)</span><span class="v">${S.us.baseFeeGwei!=null?S.us.baseFeeGwei.toFixed(2)+' gwei':'—'}</span></div>
     <div class="mrow"><span class="k">소각률 24h(연율)</span><span class="v">${Math.round(S.us.burn24h).toLocaleString()} ETH/yr</span></div>
     <div class="mrow"><span class="k">소각률 7d(연율)</span><span class="v">${Math.round(S.us.burn7d).toLocaleString()} ETH/yr</span></div>
     <div class="mrow"><span class="k">소각률 30d(연율)</span><span class="v">${Math.round(S.us.burn30d).toLocaleString()} ETH/yr</span></div>`
    :'<div class="mrow"><span class="k">데이터</span><span class="v">연결 필요</span></div>';}
  // 스테이킹
  const stv=$('#stakingStats');if(stv){
    const ratio=(S.us&&S.us.stakedEth&&S.us.supplyNow)?(S.us.stakedEth/S.us.supplyNow*100):null;
    stv.innerHTML=S.us&&ratio!=null?
    `<div class="mrow"><span class="k">스테이킹 비율</span><span class="v"><b style="color:var(--text)">${ratio.toFixed(1)}%</b></span></div>
     <div class="mrow"><span class="k">스테이킹 물량</span><span class="v">${(S.us.stakedEth/1e6).toFixed(2)}M ETH</span></div>
     <div class="mrow"><span class="k">총공급</span><span class="v">${(S.us.supplyNow/1e6).toFixed(2)}M ETH</span></div>`
    :'<div class="mrow"><span class="k">데이터</span><span class="v">연결 필요</span></div>';}
}
```

- [ ] **Step 2: VIEW_DRAW에 canvas 뷰 등록**

`const VIEW_DRAW={...}`에 `supply`/`defidom` 추가(gas·staking은 canvas 없어 미등록):
```js
const VIEW_DRAW={season:drawHeatmap,spiral:drawSpiral,cycle:drawCycle,halving:drawHalving,band:drawBand,mayer:drawMayer,dd:drawDrawdown,vol:drawVol,supply:drawSupply,defidom:drawDefiDom};
```

- [ ] **Step 3: recompute()에서 renderOnchain 호출**

`recompute()` 끝부분의 `updateSideBadges();` 앞에 추가:
```js
  renderOnchain();
```
(gas·staking 통계는 canvas가 아니므로 매 recompute에 채움. supply·defidom canvas는 `drawActiveView`가 활성 시 그림.)

- [ ] **Step 4: updateSideBadges에 4개 현재값 배지**

`updateSideBadges()` 끝(변동성 배지 다음, 함수 닫기 `}` 앞)에 추가:
```js
  // 온체인·네트워크
  if(S.us&&S.us.series&&S.us.series.length>1){const s=S.us.series,chg=s[s.length-1].supply-s[0].supply;setBadge('supply',(chg<=0?'':'+')+(chg/1e3).toFixed(1)+'k',chg<=0?'bull':'bear');}else setBadge('supply','—','muted');
  if(S.us&&S.us.baseFeeGwei!=null)setBadge('gas',S.us.baseFeeGwei.toFixed(1)+'gwei','muted');else setBadge('gas','—','muted');
  if(S.us&&S.us.stakedEth&&S.us.supplyNow)setBadge('staking',(S.us.stakedEth/S.us.supplyNow*100).toFixed(0)+'%','muted');else setBadge('staking','—','muted');
  if(S.defidom)setBadge('defidom',S.defidom.pct.toFixed(0)+'%','muted');else setBadge('defidom','—','muted');
```

- [ ] **Step 5: 검증 — 렌더/배선**

헤드리스(1280px, ~4.5s 대기):
- `supply` 뷰: 공급 추이 라인 + 통계(현재 공급 M·디플레/인플레·30d 소각). `defidom` 뷰: ETH TVL 추이(로그) + 지배력 %·TVL$B. `gas` 뷰: 기준가스 gwei + 소각률 3행. `staking` 뷰: 비율 %·물량·총공급.
- 사이드 배지 4개 값 표시. 헤더 Basic 배지 4뷰.
- ultrasound 차단 시 supply/gas/staking "연결 필요", 나머지·점수 정상(회귀 0).
```js
(()=>{window.showView('gas');return {gasRows:document.querySelectorAll('#gasStats .mrow').length,view:document.querySelector('.view[data-view="gas"]').classList.contains('active')};})()
// 기대(ultrasound 로드 시): {gasRows:4, view:true} / 차단 시 gasRows:1
```
- 콘솔 JS 에러 0, 기존 점수·패턴 뷰 회귀 없음. 스크린샷으로 4뷰 육안 확인.

- [ ] **Step 6: Commit + 배포**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 온체인 4뷰 렌더·배선(공급/가스/스테이킹/DeFi지배력)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
# cafe24 SFTP로 scoopsignal.html 배포(메모리 절차), 라이브 HTTP200 + 마커 확인
```

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지**
- loadUltrasound(3 엔드포인트)·S.us → Task 1 ✅
- DeFi 지배력(loadLlama 재사용)·S.defidom·S.tvl.times → Task 1 ✅
- 새 그룹 "온체인·네트워크" + 4항목(아이콘·배지) → Task 2 Step 1 ✅
- 4뷰(supply/gas/staking/defidom) + canvas/stat → Task 2 Step 2 ✅
- Basic 등급 → Task 2 Step 4(CHART_TIER) ✅
- supply·defidom 라인차트(lineChart 재사용)·gas·staking 스탯 → Task 3 Step 1 ✅
- 그레이스풀(연결 필요) → Task 1/Task 3 가드 ✅
- 사이드 현재값 배지 4 → Task 3 Step 4 ✅
- 단위 환산(wei/Gwei/wei·s) → Task 1 Step 1 주석 ✅
- 점수/라우터 골격 불변 → Global Constraints ✅

**2. 자리표시 스캔:** TBD/TODO 없음. 모든 코드 스텝 실제 코드. supply 시계열 키는 방어적(`sinceMerge||d30||d7||d1`) ✅

**3. 타입/이름 일관성:** `S.us`(series/supplyNow/baseFeeGwei/burn24h/burn7d/burn30d/stakedEth)·`S.defidom`(pct/ethTvl)·`S.tvl.times`가 Task 1 정의→Task 3 사용 동일. 뷰 키(`supply/gas/staking/defidom`)·canvas id(`cvSupply/cvDefiDom`)·stat id(`supplyStats/gasStats/stakingStats/defidomStats`)가 Task 2 정의→Task 3 사용 일치. `drawSupply/drawDefiDom/renderOnchain`·`VIEW_DRAW` 등록 정합. `lineChart`/`yearTicks`/`css`/`fmtPct`/`setBadge` 기존 시그니처 사용 ✅
