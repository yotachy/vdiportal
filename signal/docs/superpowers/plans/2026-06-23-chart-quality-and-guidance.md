# 차트 품질·해석 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상세 차트의 캔버스 선명도(blur)·크기·축 가독성을 고치고, 차트마다 판단 카드(판정·해석·참고)를 더하며, 자산 탭 가독성을 높인다.

**Architecture:** 공용 `hidpi(cv)` 헬퍼로 모든 캔버스 백스토어를 `clientWidth×dpr×zoom`로 보정(blur 해결). `lineChart`/`drawSpiral`이 이를 사용하고, 회전 세로축 제목 렌더 제거 + `fmtTick` 백만(M)/십억(B) + X눈금 겹침 가드 + 캔버스 높이 축소. 차트 아래 `.chart-guide` 카드를 `chartGuide()`+`guideFor(view)`로 렌더(판정은 `S._metrics`/`S`에서 도출). 점수 산식·데이터·라우터 불변.

**Tech Stack:** 순수 HTML/CSS/Vanilla JS 단일 파일, canvas 직접. 검증은 WSL 헤드리스 playwright-core.

## Global Constraints

- 단일 파일 `signal/scoopsignal.html`. 외부 의존성·차트 라이브러리 금지. 색은 기존 CSS 변수만(canvas는 기존 리터럴 hex 유지, 신규 하드코딩 색 금지). `html{zoom:1.35}`, 한국어, 2 spaces, 압축형 코드.
- 박스 남발 금지: 판단 카드는 약한 틴트 면(보더 없음), 그룹/구분은 여백.
- 판단 카드 문구는 **중립·사실 기반**(투자 권유 아님), 면책과 일관.
- **불변(수정 금지):** 점수 산식(`scoreMom/Liq/Fun/Val`,`recompute` 계산부,`normW`), 데이터 로더, 뷰 라우터(`showView`/`VIEW_DRAW`/`activeView`/`drawActiveView`), `S._metrics`(buildMetrics), 기존 `*Stats` 팩트 라인. lineChart 시그니처는 하위호환(새 옵션 기본값).

## 검증 하니스 (공통)

WSL chromium. playwright-core CommonJS:
```js
import pkg from '/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.js';
const { chromium } = pkg;
```
launch `chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox']})`, 실행:
`CHROME_BIN=/home/jschoi0223/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome LD_LIBRARY_PATH=/tmp/chrlibs node /tmp/<s>.mjs`. file:// 로드, `waitForTimeout(3000)`. 차트 뷰는 `showView('supply')` 등으로 전환 후 평가. `pageerror`만 실패 집계.
참고: 헤드리스 `devicePixelRatio=1`. zoom 보정(z≈1.35)으로 캔버스 `width`는 `Math.round(clientWidth*1*1.35)`가 되어야 함(검증 포인트).

---

## Task 1: 캔버스 선명도(hidpi) + 축·포맷·높이 정리

**Files:**
- Modify: `signal/scoopsignal.html` — `fmtTick`(716), `lineChart`(717-753), `drawSpiral`(1020-1021), 캔버스 높이 CSS(101-107,129)

**Interfaces:**
- Produces: 전역 `hidpi(cv)` → `{ctx,W,H}` (백스토어를 device px로 잡고 ctx를 CSS px 좌표계로 스케일). lineChart/drawSpiral가 사용.

- [ ] **Step 1: `hidpi(cv)` 헬퍼 추가**

`fmtTick` 정의(716행) **바로 위**에 추가:
```js
function hidpi(cv){
  const dpr=window.devicePixelRatio||1, r=cv.getBoundingClientRect();
  const W=cv.clientWidth||Math.round(r.width), H=cv.clientHeight||Math.round(r.height);
  const z=(W&&r.width)?(r.width/W):1, s=dpr*(z||1);
  cv.width=Math.max(1,Math.round(W*s)); cv.height=Math.max(1,Math.round(H*s));
  const ctx=cv.getContext('2d'); ctx.setTransform(s,0,0,s,0,0); ctx.clearRect(0,0,W,H);
  return {ctx,W,H};
}
```

- [ ] **Step 2: `fmtTick` 백만/십억 포맷**

`fmtTick`(716행)을 교체:
```js
function fmtTick(val){const a=Math.abs(val);if(a>=1e9)return (val/1e9).toFixed(a>=1e10?0:1)+'B';if(a>=1e6)return (val/1e6).toFixed(a>=1e8?0:1)+'M';if(a>=1000)return (val/1000).toFixed(a>=10000?0:1)+'k';if(a>=100)return val.toFixed(0);if(a>=10)return val.toFixed(0);if(a>=1)return val.toFixed(2);return val.toFixed(a>=0.1?2:3);}
```

- [ ] **Step 3: `lineChart` — hidpi 적용 + 회전 yLabel 제거 + X눈금 겹침 가드**

`lineChart`(717-753) 시작부 2줄(718-719)
```js
  const dpr=window.devicePixelRatio||1, W=cv.clientWidth, H=cv.clientHeight;
  cv.width=W*dpr;cv.height=H*dpr;const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);
```
를 아래로 교체:
```js
  const {ctx,W,H}=hidpi(cv);
```
그리고 회전 yLabel 렌더(739-740) 중 yLabel 블록을 제거(축 단위는 헤더·stat 라인이 제공 → 눈금값 겹침 해소). 739-741을 아래로 교체:
```js
  ctx.fillStyle='#8B98A6';ctx.font='9px Pretendard';
  if(xLabel){ctx.textAlign='right';ctx.fillText(xLabel,W-pad.r,H-4);}
```
X눈금 겹침 가드 — X눈금 렌더(736-737)를 아래로 교체(직전 라벨 우측 끝과 겹치면 라벨 생략, 보조선은 유지):
```js
  ctx.textAlign='center';let lastLabelR=-1e9;
  xTicks.forEach(t=>{const xx=pad.l+PW*clamp(t.frac,0,1);ctx.strokeStyle='#1c252f';ctx.beginPath();ctx.moveTo(xx,pad.t);ctx.lineTo(xx,pad.t+PH);ctx.stroke();
    const tw=ctx.measureText(t.text).width;if(xx-tw/2>lastLabelR+6){ctx.fillStyle='#5C6875';ctx.fillText(t.text,xx,pad.t+PH+15);lastLabelR=xx+tw/2;}});
```
(yLabel 인자는 시그니처에 남겨두되 미사용 — 하위호환. 호출부는 수정 안 함.)

- [ ] **Step 4: `drawSpiral` — hidpi 적용**

`drawSpiral`의 2줄(1020-1021)
```js
  const dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;
  cv.width=W*dpr;cv.height=H*dpr;const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);
```
를 아래로 교체:
```js
  const {ctx,W,H}=hidpi(cv);
```

- [ ] **Step 4b: `sparkline`(KPI 타일 미니차트)도 hidpi 적용**

`sparkline(cv,series,sig)` 함수 시작부의 캔버스 사이징
```js
  const dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;
  if(!W||!H||!series||series.length<2)return;
  cv.width=W*dpr;cv.height=H*dpr;const x=cv.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,W,H);
```
를 아래로 교체(빈/짧은 시계열 가드 유지):
```js
  if(!series||series.length<2)return;
  const {ctx:x,W,H}=hidpi(cv);
  if(!W||!H)return;
```
이후 본문에서 `x`(컨텍스트)·`W`·`H` 사용은 그대로 유효.

- [ ] **Step 5: 캔버스 높이 축소 (CSS)**

101-107행 블록을 아래로 교체:
```css
  .view[data-view="cycle"] canvas,
  .view[data-view="halving"] canvas,
  .view[data-view="band"] canvas,
  .view[data-view="mayer"] canvas,
  .view[data-view="dd"] canvas,
  .view[data-view="vol"] canvas{height:clamp(260px,38vh,360px)}
  .view[data-view="supply"] canvas,.view[data-view="defidom"] canvas{height:clamp(260px,38vh,360px)}
```
129행을 교체:
```css
  .view[data-view="spiral"] canvas{height:clamp(360px,52vh,480px)}
```

- [ ] **Step 6: 헤드리스 검증 (선명도·축·높이)**

`/tmp/c1.mjs` — supply·band 뷰 전환 후:
```js
async (page)=>{}; // (아래 evaluate)
```
ASSERTIONS(평가, supply 뷰 전환 후):
```js
() => {
  if(window.showView)showView('supply');
  const cv=document.querySelector('#cvSupply');
  const r=cv.getBoundingClientRect();
  const z=r.width/cv.clientWidth;
  return {
    backstoreSharp: cv.width===Math.round(cv.clientWidth*(window.devicePixelRatio||1)*z), // true
    zoomApprox: Math.round(z*100)/100,   // ~1.35
    cvH: cv.clientHeight,                 // 축소(≤ ~360)
  };
}
```
Expected: `backstoreSharp:true`, `zoomApprox`≈1.35, `cvH`≤360. JS 에러 0. supply·band·mayer 스크린샷 — 텍스트 선명·회전 축제목 없음·Y눈금 M포맷(`121.8M`)·X라벨 안 겹침·차트 작아짐 육안.

- [ ] **Step 7: Commit**
```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 캔버스 선명도(hidpi zoom보정)·fmtTick M/B·회전축제목 제거·X눈금 겹침가드·차트 높이 축소"
```

---

## Task 2: 판단 카드 (판정·해석·참고)

**Files:**
- Modify: `signal/scoopsignal.html` — 상세 뷰 마크업(각 차트 뷰), 신규 CSS(`.chart-guide`), 신규 JS(`chartGuide`/`guideFor`), `drawActiveView` 훅

**Interfaces:**
- Consumes: `S._metrics[key]={val,sig}`, `S`(band/ma200/week/us/tvl/defidom), `sigOf`, `activeView`.
- Produces: `chartGuide(view)` (해당 `[data-guide]`에 카드 주입), `guideFor(view)` → `{sig,verdict,reading,watch}|null`.

- [ ] **Step 1: `.chart-guide` CSS 추가**

`.chart-guide`가 들어갈 자리(예: page 공통 CSS 영역, `.page-sub` 규칙 근처)에 추가:
```css
  .chart-guide{margin-top:14px;background:var(--panel);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:7px}
  .cg-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
  .cg-badge{font-size:11px;font-weight:800;border-radius:999px;padding:3px 10px;white-space:nowrap}
  .cg-badge[data-sig="bull"]{color:var(--bull);background:var(--bull-dim)}
  .cg-badge[data-sig="neutral"]{color:var(--neutral);background:var(--neutral-dim)}
  .cg-badge[data-sig="bear"]{color:var(--bear);background:var(--bear-dim)}
  .cg-read{font-size:12.5px;color:var(--text);line-height:1.6;letter-spacing:-.01em}
  .cg-watch{font-size:11.5px;color:var(--muted);line-height:1.55}
  .cg-watch b{color:var(--text)}
```

- [ ] **Step 2: 상세 뷰에 `.chart-guide` 컨테이너 추가**

아래 각 뷰의 `<canvas ...></canvas>`(또는 차트 컨테이너) **바로 다음**에 `<div class="chart-guide" data-guide="{view}"></div>`를 삽입한다(해당 view 키로):
- `band`(`#cvBand` 뒤), `mayer`(`#cvMayer`), `dd`(`#cvDD`), `vol`(`#cvVol`), `supply`(`#cvSupply`), `defidom`(`#cvDefiDom`), `cycle`(`#cvCycle`), `halving`(`#cvHalving`), `spiral`(`#cvSpiral`), `season`(`#heatmap` 뒤).
예: `<canvas id="cvSupply"></canvas>` → 다음 줄 `<div class="chart-guide" data-guide="supply"></div>`.

- [ ] **Step 3: `guideFor(view)` + `chartGuide` JS 추가**

`drawActiveView` 정의 근처(또는 VIEW_DRAW 다음)에 추가. 판정 sig·현재값은 `S._metrics`/`S`에서 도출, 문구는 중립 서술:
```js
function pick(sig,b,n,be){return sig==='bull'?b:sig==='bear'?be:n;}
function guideFor(v){
  const m=S._metrics||{};
  const G=(sig,verdict,reading,watch)=>({sig,verdict,reading,watch});
  if(v==='mayer'&&m.mayer&&m.mayer.val!=='—'){const s=m.mayer.sig;
    return G(s,pick(s,'저평가 구간','중립','과열 구간'),`200주 이동평균 대비 ${m.mayer.val}. 장기 평균선과의 거리로 과열·저평가를 본다.`,'<b>0.8× 이하</b>=역사적 저평가, <b>2.4× 이상</b>=과열. 1.0× 회복 여부를 주시.');}
  if(v==='band'&&S.band&&isFinite(S.band.z)){const s=m.band?m.band.sig:'muted';
    return G(s,pick(s,'채널 하단(저평가)','채널 중앙','채널 상단(과열)'),`로그 회귀 추세선 대비 z=${(S.band.z>=0?'+':'')+S.band.z.toFixed(2)}σ (적합도 R²=${S.band.r2.toFixed(2)}).`,'<b>-2σ 부근</b>=바닥권, <b>+2σ 부근</b>=과열. 추세선(중앙) 회귀 방향을 주시.');}
  if(v==='dd'&&m.dd&&m.dd.val!=='—'){const s=m.dd.sig;
    return G(s,pick(s,'얕은 낙폭','중간 낙폭','깊은 낙폭(바닥권)'),`전고점 대비 현재 ${m.dd.val}. 깊을수록 약세장 바닥에 가깝다(역발상).`,'<b>-50%↓</b>=역사적 바닥권. 낙폭이 줄며 신고가에 다가가는지 주시.');}
  if(v==='vol'&&m.vol&&m.vol.val!=='—'){
    return G('neutral','변동성 '+m.vol.val,`주간 실현 변동성(연율) ${m.vol.val}. 낮은 구간(압축)은 큰 움직임의 전조로 자주 거론된다.`,'<b>하위 20%(압축)</b> 지속 후 확장 전환을 주시. 방향은 변동성만으론 알 수 없음.');}
  if(v==='supply'&&S.us&&S.us.series&&S.us.series.length>1){const s=m.supply?m.supply.sig:'muted';
    return G(s,pick(s,'디플레(감소)','중립','인플레(증가)'),`Merge 이후 발행−소각 누적. 구간 변화 ${m.supply?m.supply.val:'—'} (${s==='bull'?'공급 감소=디플레':'공급 증가=인플레'}).`,'수요가 약하면 소각이 줄어 공급이 는다. <b>하향 전환(디플레)</b>이 강세 우호 신호.');}
  if(v==='defidom'&&S.defidom){
    return G('neutral','DeFi 지배력 '+S.defidom.pct.toFixed(0)+'%',`전체 체인 DeFi TVL 중 이더리움 비중 ${S.defidom.pct.toFixed(0)}%. '디파이 본진' 위상.`,'비중 상승=상대적 강세, 하락=L2·타체인 이탈. 추세 방향을 주시.');}
  if(v==='cycle'&&m.cycle&&m.cycle.val!=='—'){
    return G('neutral','직전 바닥 후 '+m.cycle.val,`2022 바닥 기준 ${m.cycle.val} 경과. 과거 사이클 궤적과 겹쳐 현재 위치를 가늠.`,'과거 사이클 대비 가격 궤적이 위/아래 어디인지, 사이클 중반·후반 위치를 주시.');}
  if(v==='halving'){
    return G('neutral','반감기 사이클','2024-04-20 반감기 기준 경과. 과거 반감기 후 궤적과 비교.',' 반감기 후 12~18개월 구간의 과거 패턴과 현재 위치를 주시.');}
  if(v==='season'&&S.month){
    const s=m.season?m.season.sig:'muted';
    return G(s,'계절성',`행=연도·열=월의 월별 수익률. 맨 아래 평균 행이 계절 경향(이번 달 평균 ${m.season?m.season.val:'—'}).`,'이번 달(강조 셀)의 과거 평균이 양/음인지, 특정 월 반복 패턴을 참고(표본 적음 주의).');}
  if(v==='spiral'&&S.month){
    return G('neutral','스네일(계절 나선)','월별 등락을 나선으로. 같은 각도(달)에서 색이 반복되면 계절성.',' 같은 달 위치의 색(초록=상승/빨강=하락) 반복 여부, 바깥 끝(현재)의 방향을 참고.');}
  return null;
}
function chartGuide(view){
  const el=document.querySelector(`.chart-guide[data-guide="${view}"]`);if(!el)return;
  const g=guideFor(view);
  if(!g){el.style.display='none';el.innerHTML='';return;}
  el.style.display='';
  el.innerHTML=`<div class="cg-top"><span class="cg-badge" data-sig="${g.sig}">${g.verdict}</span></div>`+
    `<div class="cg-read">${g.reading}</div>`+
    `<div class="cg-watch">참고 — ${g.watch}</div>`;
}
```

- [ ] **Step 4: `drawActiveView`에서 활성 뷰 판단 카드 렌더 훅**

`drawActiveView()`가 활성 뷰 차트를 그린 뒤 `chartGuide(activeView)`를 호출하도록 추가. `drawActiveView` 함수 본문 끝(차트 그린 직후)에 한 줄 추가:
```js
  chartGuide(activeView);
```
(activeView가 guide 대상이 아니면 guideFor가 null→카드 숨김. 데이터 없으면 숨김.)

- [ ] **Step 5: 헤드리스 검증 (판단 카드)**

`/tmp/c2.mjs` — 여러 뷰 전환하며:
```js
() => {
  const out={};
  ['supply','mayer','band','dd','cycle'].forEach(v=>{ if(window.showView)showView(v);
    const el=document.querySelector(`.chart-guide[data-guide="${v}"]`);
    out[v]= el? {shown:getComputedStyle(el).display!=='none', badge:(el.querySelector('.cg-badge')||{}).textContent||'', hasRead:!!el.querySelector('.cg-read'), hasWatch:!!el.querySelector('.cg-watch')} : 'absent';
  });
  if(window.showView)showView('dashboard');
  return out;
}
```
Expected: 데이터 있는 뷰는 `shown:true`·badge 텍스트·hasRead·hasWatch 모두 true. 배지 색(data-sig)이 해당 `S._metrics` sig와 정합. JS 에러 0. 스크린샷(supply·mayer)에서 차트 아래 판정 배지+해석+참고 표시 육안.

- [ ] **Step 6: Commit**
```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 차트 판단 카드(.chart-guide) — 판정 배지+해석+참고, 10개 상세 뷰, S._metrics 도출"
```

---

## Task 3: 자산 탭 가독성 추가 개선

**Files:**
- Modify: `signal/scoopsignal.html` — `.asset`/`.asset.on`/`.asset[disabled]`/`.asset .soon` CSS

**Interfaces:** Consumes/Produces 없음(시각).

- [ ] **Step 1: 자산 탭 대비·강조 강화 (CSS)**

`.asset` 관련 규칙을 아래로 교체(비활성 명도↑·활성 골드 채움형 강조·준비중 칩 축소):
```css
  .asset{appearance:none;font:inherit;font-size:13px;font-weight:700;color:var(--text);background:none;border:none;border-bottom:2px solid transparent;border-radius:0;padding:9px 3px;margin-bottom:-1px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;letter-spacing:-.01em}
  .asset:not([disabled]):hover{color:var(--gold)}
  .asset.on{color:var(--gold);border-bottom-color:var(--gold)}
  .asset[disabled]{color:var(--muted);font-weight:600;cursor:not-allowed}
  .asset .soon{font-size:8px;font-weight:700;color:var(--ink);background:var(--faint);border-radius:3px;padding:0 3px;letter-spacing:0}
  .asset:focus-visible{outline:2px solid var(--gold);outline-offset:-2px;border-radius:4px}
```
(비활성 라벨 `--faint`→`--muted`로 또렷, 활성 골드 굵게+underline, 준비중 칩은 작고 `--faint` 배경 작은 태그.)

- [ ] **Step 2: 헤드리스 검증**

`/tmp/c3.mjs`:
```js
() => {
  const cs=el=>getComputedStyle(el);
  const eth=[...document.querySelectorAll('.asset')].find(a=>a.dataset.asset==='eth');
  const all=[...document.querySelectorAll('.asset')].find(a=>a.dataset.asset==='all');
  return {ethW:cs(eth).fontWeight, ethColor:cs(eth).color, disabledColor:cs(all).color};
}
```
Expected: `ethW:"700"`, `ethColor`=gold `rgb(232, 180, 99)`, `disabledColor`= `--muted` `rgb(139, 152, 166)`(또렷). JS 에러 0. 1280·390 스크린샷 — 탭 또렷·활성 강조 육안.

- [ ] **Step 3: Commit**
```bash
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 자산 탭 가독성 강화(비활성 명도↑·활성 골드 강조·준비중 칩 축소)"
```

---

## 최종 통합 검증 (전 Task 완료 후)

- [ ] supply·band·mayer·dd·vol·season·cycle·spiral·defidom 뷰 헤드리스 스크린샷: 텍스트 선명·회전축제목 없음·M포맷·X라벨 안겹침·차트 축소·판단 카드(판정 배지+해석+참고) 표시.
- [ ] KPI 스파크라인도 선명(Task1 hidpi 미적용 시 별도 — sparkline은 자체 DPR 처리이므로 흐리면 hidpi로 교체 검토; 본 계획 범위 밖이면 기록).
- [ ] 자산 탭 또렷. JS 에러 0, 점수·라우터·데이터 회귀 0.

## Self-Review 메모 (작성자 점검 완료)

- **Spec 커버리지:** blur(T1 hidpi)·축소(T1 높이)·축정리(T1 yLabel제거·fmtTick·X겹침)·판단카드+기준선(T2; 기준선은 기존 데이터셋 태그로 이미 존재, 카드가 해석 보강)·탭(T3) — spec §4·5·6 매핑.
- **불변 보장:** lineChart 시그니처 하위호환(yLabel 인자 유지·미사용). 점수·로더·라우터·*Stats 팩트라인 미변경. 판단 카드는 `S._metrics`/`S`만 소비.
- **타입/이름 일관성:** `hidpi`(T1 produce→lineChart/drawSpiral 소비), `chartGuide`/`guideFor`/`.chart-guide[data-guide]`(T2 내부 일관), guide view 키가 실제 view 키와 일치.
- **스파크라인 주의:** KPI 스파크라인(sparkline 함수)은 자체 DPR 처리 — Task1 hidpi와 별개. 흐리면 최종검증에서 hidpi로 교체(작은 후속). 본 계획은 상세 차트 우선.
- **기준선:** 대부분 차트가 이미 점선 기준선(과열/저평가/0선/바닥100)을 데이터셋으로 가짐 → spec의 "기준선"은 충족, 신규 zones 옵션은 불필요(YAGNI)로 제외.
