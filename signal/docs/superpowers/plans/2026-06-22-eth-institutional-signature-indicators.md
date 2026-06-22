# ETH 기관·시그니처 지표 3종 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ETH 전용 지표 3종(기관 ETH 보유 Basic + 강세 전환 트리거 보드 Signature + ETH 공급압력 지수 Signature)을 신규 사이드 그룹 "기관·플로우"의 표시전용 뷰로 추가한다.

**Architecture:** `loadTreasury()`(CoinGecko public_treasury, 캐시)로 `S.treasury` 추가하고, 트리거·공급압력은 기존 `S.us/S.band/S.ma200/S.ethbtc/S.roc/S.netLiq/S.queue/S.treasury`를 재사용해 합성. 3개 뷰는 DOM/SVG(캔버스 없음), `recompute()`가 매 사이클 렌더. 기존 `.ob-bar`/`.ring` CSS 재사용(DRY).

**Tech Stack:** 순수 HTML5·CSS3·Vanilla JS. 클라이언트 fetch. 신규: CoinGecko `/companies/public_treasury/ethereum`(노키·CORS).

## Global Constraints

- 단일 파일: `signal/scoopsignal.html`만. 디자인 토큰만. 좌측 컬러바 금지. `html{zoom:1.35}` 유지. 한국어. 2 spaces, 압축형.
- 점수 산식·`recompute()` 계산부·뷰 라우터 골격·기존 지표 불변. 신규 3뷰는 표시전용(점수 미반영).
- `CHART_TIER`: treasury=basic, trigger·signature, squeeze·signature.
- 그레이스풀: CoinGecko treasury 실패→treasury/squeeze(기관 흡수)/trigger#8 디그레이드, 나머지 정상. 트리거·공급압력은 가용 S.*만으로 부분 계산(없는 조건/요소 제외, NaN 방지).
- lerp 임계값은 휴리스틱(기존 유동성 lerp 성격). 기존 `lerp`/`clamp`/`pctRank`/`$`/`css` 재사용(재정의 금지).

**검증 방식:** 정적 HTML, 로컬 서버 + 헤드리스 DOM/스크린샷. **Binance 차단(한국 시뮬)** 권장. 단위테스트 없음.
헤드리스: chrome `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`, `require(".../playwright-core")`, `LD_LIBRARY_PATH=/tmp/chrlibs node script.js`, `ctx.route(/api\.binance\.com/,r=>r.abort())`.

---

## File Structure

- Modify only: `signal/scoopsignal.html`
  - Task 1: `loadTreasury()` + `supply30dChg()` 헬퍼 + refresh/status + S.treasury 캐시.
  - Task 2: 사이드 그룹 "기관·플로우" + 3뷰 마크업·듀오톤 아이콘 + CSS + CHART_TIER.
  - Task 3: `renderTreasury`/`renderTriggers`/`renderSqueeze` + recompute/배지 + 배포.

---

### Task 1: 데이터 — loadTreasury + supply30dChg

**Files:** Modify `signal/scoopsignal.html` (script: loadTreasury, supply30dChg, refresh, 상태 푸터)

**Interfaces:**
- Consumes: `jget`, `setStatus`, `Promise.allSettled`, 기존 `S.us`.
- Produces: `S.treasury={total,usd,dom,companies}|null`, `loadTreasury()`, `supply30dChg()→number|null`.

- [ ] **Step 1: loadTreasury() + supply30dChg() 추가**

`loadUltrasound` 정의 근처 뒤에 추가:
```js
async function loadTreasury(){
  // 스냅샷 — 자주 안 변함, 20분 캐시
  if(S.treasury&&S._trAt&&(Date.now()-S._trAt)<1200000){setStatus('treasury','ok');return;}
  try{
    const g=await jget('https://api.coingecko.com/api/v3/companies/public_treasury/ethereum');
    if(!g||g.total_holdings==null)throw new Error('no treasury');
    S.treasury={total:+g.total_holdings,usd:+g.total_value_usd,dom:+g.market_cap_dominance,companies:Array.isArray(g.companies)?g.companies:[]};
    S._trAt=Date.now();setStatus('treasury','ok');
  }catch(e){S.treasury=null;setStatus('treasury','warn');}
}
// S.us 공급 시계열에서 최근 30일 변화율(%) — 디플레/공급압력용
function supply30dChg(){
  const s=S.us&&S.us.series;if(!s||s.length<2)return null;
  const last=s[s.length-1],cutoff=last.t-30*864e5;
  let i=s.length-1;while(i>0&&s[i].t>cutoff)i--;
  return s[i].supply>0?(last.supply/s[i].supply-1)*100:null;
}
```

- [ ] **Step 2: refresh() allSettled + 상태 푸터**

`refresh()`의 allSettled에 `loadTreasury()` 추가:
```js
  const r=await Promise.allSettled([loadUpbit(),loadLlama(),loadDollar(),loadFred(),loadBeacon(),loadCoinGecko(),loadUltrasound(),loadTreasury()]);
```
(loadTreasury 자체 setStatus 호출 → r[7] 별도 처리 불필요.)

상태 푸터에서 `<span class="s"><i id="st-ultrasound"></i>온체인</span>` 다음에 추가:
```html
        <span class="s"><i id="st-treasury"></i>기관</span>
```

- [ ] **Step 3: 검증 — 데이터**

헤드리스(~4s):
```js
({tr:S.treasury?{total:Math.round(S.treasury.total),dom:S.treasury.dom,cos:S.treasury.companies.length}:null, s30:supply30dChg()})
// 기대: tr.total≈7.6e6, tr.dom 양수(~6), cos>0; s30 숫자(±작은 %). 차단 시 tr:null(디그레이드)
```
greps: `grep -c "function loadTreasury"`→1, `grep -c "loadTreasury()"`→2, `grep -c "function supply30dChg"`→1. 콘솔 JS 에러 0.

- [ ] **Step 4: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 기관 ETH 보유 로더(CoinGecko treasury) + supply30dChg 헬퍼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 사이드 그룹 + 3 뷰 마크업 + 아이콘 + 등급 + CSS

**Files:** Modify `signal/scoopsignal.html` (사이드 nav, 뷰 섹션, `<style>`, CHART_TIER)

**Interfaces:**
- Consumes: `.snav`/`.snav-group`/`.snav-item`/`.snav-main`/`.snav-ic`/`.snav-badge`, `.view`/`.page-head`, 기존 `.ob-bar`/`.ring` CSS, `CHART_TIER`.
- Produces: 뷰 `treasury`/`trigger`/`squeeze` + 컨테이너 `#treasuryStats`/`#treasuryList`/`#triggerSummary`/`#triggerBoard`/`#squeezeGauge`/`#squeezeStats`.

- [ ] **Step 1: 사이드 새 그룹 + 3 항목(듀오톤 아이콘)**

사이드 nav에서 `data-view="defidom"` 버튼 바로 뒤(`</nav>` 앞)에 추가:
```html
      <div class="snav-group">기관·플로우</div>
      <button class="snav-item" data-view="treasury"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-opacity=".4" d="M3.5 9.5 12 4l8.5 5.5v1.5H3.5Z"/><rect x="5" y="12" width="2.4" height="6" fill="currentColor"/><rect x="10.8" y="12" width="2.4" height="6" fill="currentColor"/><rect x="16.6" y="12" width="2.4" height="6" fill="currentColor"/><rect x="3.5" y="19" width="17" height="2.2" rx="1" fill="currentColor" fill-opacity=".4"/></svg></span>기관 ETH 보유</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="trigger"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="5" fill="currentColor" fill-opacity=".4"/><circle cx="12" cy="7.5" r="2.6" fill="currentColor"/><circle cx="12" cy="16.5" r="2.6" fill="currentColor" fill-opacity=".55"/></svg></span>강세 전환 트리거</span> <span class="snav-badge">—</span></button>
      <button class="snav-item" data-view="squeeze"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-opacity=".4" d="M4 4h16v3.2H4Zm0 12.8h16V20H4Z"/><path fill="currentColor" d="M12 8.2 8 12h2.6v2.2H8L12 18l4-3.8h-2.6V12H16Z"/></svg></span>공급압력 지수</span> <span class="snav-badge">—</span></button>
```

- [ ] **Step 2: 3개 뷰 섹션 추가**

`data-view="defidom"` 뷰 섹션의 닫는 `</section>` 다음(`</main>` 앞)에 추가:
```html
  <section class="view" data-view="treasury">
    <div class="page-head"><h2>기관 ETH 보유</h2><p class="page-sub">상장사 등 기관의 ETH 보유량과 공급 점유율(CoinGecko). 기관 채택 신호. <span id="treasuryStats" style="color:var(--muted)"></span></p></div>
    <div class="ob-bars" id="treasuryList"></div>
  </section>
  <section class="view" data-view="trigger">
    <div class="page-head"><h2>강세 전환 트리거 보드</h2><p class="page-sub">강세 전환에 우호적인 조건이 몇 개 점등하는지 — 스쿱시그널 종합 신호판. <span id="triggerSummary" style="color:var(--muted)"></span></p></div>
    <div class="trig-grid" id="triggerBoard"></div>
  </section>
  <section class="view" data-view="squeeze">
    <div class="page-head"><h2>ETH 공급압력 지수</h2><p class="page-sub">순발행(−)·스테이킹 잠김·기관 흡수를 합성한 유통 물량 압박(0~100). 높을수록 강세 우호. <span id="squeezeLine" style="color:var(--muted)"></span></p></div>
    <div class="squeeze-wrap"><div id="squeezeGauge"></div><div class="ob-bars" id="squeezeStats" style="flex:1;min-width:200px"></div></div>
  </section>
```

- [ ] **Step 3: CSS — 트리거 보드 + squeeze 래퍼**

`<style>`에 추가(`.ob-bar`/`.ring`은 기존 재사용):
```css
  .trig-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
  .trig{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:9px;background:var(--panel-2);font-size:12.5px;color:var(--muted)}
  .trig .tdot{width:8px;height:8px;border-radius:50%;background:var(--faint);flex:0 0 auto}
  .trig.on{color:var(--text)} .trig.on .tdot{background:var(--bull)}
  .trig.na{opacity:.5}
  .trig .tval{margin-left:auto;font-family:var(--mono);font-size:11px}
  .trig.on .tval{color:var(--bull)}
  .squeeze-wrap{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:4px}
  @media(max-width:560px){.trig-grid{grid-template-columns:1fr}}
```

- [ ] **Step 4: CHART_TIER에 3뷰 등록**

`const CHART_TIER={...}`의 마지막 줄 `supply:'basic', gas:'basic', staking:'basic', defidom:'basic'`를 다음으로 교체(끝 쉼표 추가 + 3줄):
```js
  supply:'basic', gas:'basic', staking:'basic', defidom:'basic',
  treasury:'basic', trigger:'signature', squeeze:'signature'
```

- [ ] **Step 5: 검증 — 마크업/등급**

헤드리스 DOM:
```js
({nav:['treasury','trigger','squeeze'].map(k=>!!document.querySelector('.snav-item[data-view="'+k+'"]')), views:['treasury','trigger','squeeze'].map(k=>!!document.querySelector('.view[data-view="'+k+'"]')), group:[...document.querySelectorAll('.snav-group')].some(g=>g.textContent.includes('기관·플로우')), icons:document.querySelectorAll('.snav-item[data-view="treasury"] .snav-ic svg,.snav-item[data-view="trigger"] .snav-ic svg,.snav-item[data-view="squeeze"] .snav-ic svg').length, sigBadge:!!document.querySelector('.view[data-view="trigger"] .tier-signature')})
// 기대: nav[3×true], views[3×true], group:true, icons:3, sigBadge:true(applyTierBadges 후)
```
`showView('treasury'/'trigger'/'squeeze')` 시 각 뷰 표시(내용 비어있음 — Task 3 전). trigger·squeeze 헤더 골드 Signature 배지·네비 골드 아이콘. 콘솔 에러 0. 스크린샷으로 새 그룹·아이콘 확인.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 기관·플로우 사이드 그룹 + 3뷰 마크업/아이콘/등급(treasury·trigger·squeeze)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 렌더 함수 + 배선 + 배포

**Files:** Modify `signal/scoopsignal.html` (script: render 함수, recompute, updateSideBadges)

**Interfaces:**
- Consumes: Task1 `S.treasury`/`supply30dChg`, Task2 컨테이너 id, 기존 `S.band/S.ma200/S.ethbtc/S.roc/S.netLiq/S.queue`, `lerp`/`clamp`/`pctRank`/`$`/`setBadge`.
- Produces: `renderTreasury()`, `renderTriggers()`, `renderSqueeze()`.

- [ ] **Step 1: 3개 렌더 함수 추가**

`renderOnchain` 정의 근처에 추가:
```js
function renderTreasury(){
  const st=$('#treasuryStats'),li=$('#treasuryList');if(!st&&!li)return;
  if(!S.treasury){if(st)st.innerHTML='연결 필요';if(li)li.innerHTML='';return;}
  const t=S.treasury;
  if(st)st.innerHTML=`총 보유 <b style="color:var(--text)">${(t.total/1e6).toFixed(2)}M ETH</b> · <b style="color:var(--text)">$${(t.usd/1e9).toFixed(1)}B</b> · 공급 비중 <b style="color:var(--text)">${(t.dom||0).toFixed(1)}%</b>`;
  const cos=(t.companies||[]).slice(0,12),mx=Math.max(1,...cos.map(c=>+c.total_holdings||0));
  if(li)li.innerHTML=cos.map(c=>{const h=+c.total_holdings||0;return `<div class="ob-bar"><span title="${(c.name||'').replace(/"/g,'')}">${(c.name||'').slice(0,16)}</span><span class="bar"><i style="width:${clamp(h/mx*100,2,100)}%;background:var(--gold)"></i></span><span class="num">${Math.round(h).toLocaleString()}</span></div>`;}).join('');
}
function trigEval(){
  const T=[],add=(k,ok,a)=>T.push({k,on:!!ok,a:!!a});
  const s30=supply30dChg();
  add('디플레(순발행−)',s30!=null&&s30<=0,s30!=null);
  add('밴드 저평가',S.band&&isFinite(S.band.z)&&S.band.z<-0.5,!!(S.band&&isFinite(S.band.z)));
  add('200주 저평가',S.ma200&&S.ma200.hist&&pctRank(S.ma200.hist,S.ma200.mult)<0.3,!!(S.ma200&&S.ma200.hist));
  add('ETH/BTC 강세',S.ethbtc&&S.ethbtc.dist>0&&S.ethbtc.slope>0,!!S.ethbtc);
  add('모멘텀 ROC+',S.roc&&S.roc.now>0,!!S.roc);
  add('순유동성 개선',S.netLiq&&S.netLiq.chg>0,!!S.netLiq);
  add('검증자 순유입',S.queue&&(S.queue.enter-S.queue.exit)>0,!!S.queue);
  add('기관 보유 ≥6%',S.treasury&&S.treasury.dom>=6,!!S.treasury);
  return T;
}
function renderTriggers(){
  const el=$('#triggerBoard');if(!el)return;
  const T=trigEval(),avail=T.filter(t=>t.a),lit=avail.filter(t=>t.on).length;
  el.innerHTML=T.map(t=>`<div class="trig ${!t.a?'na':t.on?'on':'off'}"><span class="tdot"></span>${t.k}<span class="tval">${!t.a?'대기':t.on?'점등':'소등'}</span></div>`).join('');
  const sm=$('#triggerSummary');if(sm){const sig=lit>=5?['강세 전환 유력','bull']:lit>=3?['혼조·대기','neutral']:['약세 우위','bear'];sm.innerHTML=`<b style="color:var(--${sig[1]})">${lit} / ${avail.length} 점등</b> · ${sig[0]}`;}
}
function renderSqueeze(){
  const parts=[],s30=supply30dChg();
  if(s30!=null)parts.push(['순발행 압력',lerp([[0.5,15],[0.1,40],[0,55],[-0.1,75],[-0.4,92]],s30)]);
  if(S.us&&S.us.stakedEth&&S.us.supplyNow)parts.push(['스테이킹 잠김',lerp([[20,25],[28,50],[33,68],[40,90]],S.us.stakedEth/S.us.supplyNow*100)]);
  if(S.treasury&&isFinite(S.treasury.dom))parts.push(['기관 흡수',lerp([[2,30],[4,48],[6,62],[10,88]],S.treasury.dom)]);
  const g=$('#squeezeGauge'),st=$('#squeezeStats'),ln=$('#squeezeLine');
  if(!parts.length){if(g)g.innerHTML='';if(st)st.innerHTML='연결 필요';return;}
  const idx=Math.round(parts.reduce((a,b)=>a+b[1],0)/parts.length);
  const C=2*Math.PI*42,off=C*(1-clamp(idx,0,100)/100);
  if(g)g.innerHTML=`<svg class="ring" viewBox="0 0 100 100"><circle class="rbg" cx="50" cy="50" r="42"/><circle class="rfg" cx="50" cy="50" r="42" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/><text class="ring-c" x="50" y="54" text-anchor="middle">${idx}</text></svg>`;
  if(st)st.innerHTML=parts.map(([k,v])=>`<div class="ob-bar"><span>${k}</span><span class="bar"><i style="width:${clamp(v,2,100)}%;background:var(--gold)"></i></span><span class="num">${Math.round(v)}</span></div>`).join('');
  if(ln)ln.innerHTML=`지수 <b style="color:var(--text)">${idx}/100</b>`;
}
```

- [ ] **Step 2: recompute()에서 호출**

`recompute()`의 `renderOnchain();` 다음 줄에 추가:
```js
  renderTreasury();renderTriggers();renderSqueeze();
```

- [ ] **Step 3: updateSideBadges에 3 배지**

`updateSideBadges()` 끝(함수 닫기 `}` 앞)에 추가:
```js
  // 기관·플로우
  if(S.treasury&&isFinite(S.treasury.dom))setBadge('treasury',S.treasury.dom.toFixed(1)+'%','muted');else setBadge('treasury','—','muted');
  {const T=trigEval(),av=T.filter(t=>t.a),lit=av.filter(t=>t.on).length;setBadge('trigger',av.length?lit+'/'+av.length:'—',lit>=5?'bull':lit<=2?'bear':'muted');}
  {const p=[],s30=supply30dChg();if(s30!=null)p.push(lerp([[0.5,15],[0.1,40],[0,55],[-0.1,75],[-0.4,92]],s30));if(S.us&&S.us.stakedEth&&S.us.supplyNow)p.push(lerp([[20,25],[28,50],[33,68],[40,90]],S.us.stakedEth/S.us.supplyNow*100));if(S.treasury&&isFinite(S.treasury.dom))p.push(lerp([[2,30],[4,48],[6,62],[10,88]],S.treasury.dom));setBadge('squeeze',p.length?Math.round(p.reduce((a,b)=>a+b,0)/p.length)+'':'—','muted');}
```

- [ ] **Step 4: 검증 — 렌더/배선**

헤드리스(Binance 차단=한국, ~5s):
- `treasury`: 총 보유·비중 + 기업별 막대(상위 12). `trigger`: 8조건 점등판(2열) + N/8 종합(색). `squeeze`: 링 게이지(지수) + 3요소 분해 막대.
- 사이드 배지 3개 값. trigger·squeeze 헤더 골드 Signature 배지·네비 골드 아이콘. treasury=Basic.
- CoinGecko treasury 차단 시 treasury "연결 필요", trigger#8 '대기', squeeze 기관흡수 제외(2요소). 기존 점수·차트 회귀 0, JS 에러 0.
```js
(()=>{window.showView('trigger');return {trigs:document.querySelectorAll('#triggerBoard .trig').length, summary:document.querySelector('#triggerSummary').textContent.slice(0,20), squeezeBadge:document.querySelector('.snav-item[data-view="squeeze"] .snav-badge').textContent};})()
// 기대: trigs:8, summary "N / M 점등 ...", squeezeBadge 숫자
```
스크린샷으로 trigger 보드·squeeze 링·treasury 막대 육안 확인.

- [ ] **Step 5: Commit + 배포**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 기관 보유·트리거 보드·공급압력 지수 렌더·배선

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
# cafe24 SFTP로 scoopsignal.html 배포(메모리 절차), 라이브 HTTP200 + 마커 확인
```

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지**
- loadTreasury(CoinGecko, 캐시 20분)·S.treasury → Task 1 ✅
- supply30dChg(30일 변화) → Task 1 ✅
- 새 그룹 "기관·플로우" + 3항목·아이콘 → Task 2 Step 1 ✅
- 3뷰(treasury/trigger/squeeze) → Task 2 Step 2 ✅
- CHART_TIER(treasury=basic, trigger·squeeze=signature) → Task 2 Step 4 ✅
- 기관 보유 막대 → Task 3 renderTreasury ✅
- 트리거 8종 점등판 + 종합 → Task 3 renderTriggers/trigEval ✅
- 공급압력 3요소 lerp 합성 + 링 → Task 3 renderSqueeze ✅
- 그레이스풀(부분 계산·연결 필요) → Task1/Task3 가드 ✅
- 사이드 배지 3 → Task 3 Step 3 ✅
- 표시전용·점수 불변 → Global Constraints ✅

**2. 자리표시 스캔:** TBD/TODO 없음. 모든 코드 스텝 실제 코드 ✅

**3. 타입/이름 일관성:** `S.treasury{total,usd,dom,companies}`·`supply30dChg()`·`trigEval()`·`renderTreasury/renderTriggers/renderSqueeze`가 Task1 정의→Task3 사용 일치. 컨테이너 id(`treasuryStats/treasuryList/triggerSummary/triggerBoard/squeezeGauge/squeezeStats/squeezeLine`)가 Task2 정의→Task3 사용 일치. 뷰 키(`treasury/trigger/squeeze`)가 nav·뷰·CHART_TIER·setBadge 동일. `.ob-bar`/`.ring`/`.trig` CSS 재사용. `lerp`/`clamp`/`pctRank`/`setBadge` 기존 시그니처 사용 ✅
