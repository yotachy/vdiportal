# ScoopSignal 항목4·5·6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ScoopSignal에 스테이킹−10Y 스프레드(펀더멘털 편입)·L2 TVL 점수 승격·튜닝 패널(localStorage)을 추가한다.

**Architecture:** `refresh()`를 *fetch 전용*으로 줄이고 점수+렌더를 `recompute()`로 분리한다. 전역 `CFG`(localStorage 저장)가 가중치·ROC기간·σ폭을 보유하며, 튜닝 패널 변경 시 재fetch 없이 `recompute()`만 호출한다. 신규 데이터(ETH.STORE APR, FRED DGS10, L2 3개 히스토리)는 기존 그레이스풀 디그레이드 패턴(try/catch + 예시 배지)으로 편입한다.

**Tech Stack:** 순수 HTML5 · CSS3 · 바닐라 JS. 빌드·프레임워크·라이브러리 없음. 단일 파일 `signal/scoopsignal.html`.

## Global Constraints

- **단일 파일 유지** — 모든 CSS·JS·데이터는 `signal/scoopsignal.html` 내부. 외부 파일 분리 금지.
- **무의존** — 프레임워크·차트 라이브러리·빌드 도구 금지. 차트는 canvas/SVG 직접.
- **디자인 토큰만** — 색은 `:root` CSS 변수(`--ink/--panel/--gold/--bull/--neutral/--bear` 등). 하드코딩 색 금지. 숫자는 `--mono`.
- **그레이스풀 디그레이드** — 모든 fetch는 `try/catch`, `Promise.allSettled`. 한 소스 실패가 전체를 깨면 안 됨. 미연결 시 fallback + `예시`/`연결 필요` 배지.
- **UI 텍스트 한국어.** 백분위는 `%ile` 텍스트 대신 `prMeter` 분위 막대.
- **검증은 브라우저 기반** — 테스트 러너 없음. `python3 -m http.server`로 띄워 콘솔 에러 0 + 화면 확인, 필요 시 헤드리스 스크린샷(WSL: 로컬 lib 추출 + `LD_LIBRARY_PATH`로 playwright chromium).
- **localStorage** — 키 `scoopsignal_cfg` 한정 사용(튜닝 설정 전용).
- **배포(완료 후, vdi-log 방식):** 커밋 → `git push`(`git@github.com:yotachy/vdiportal.git`) → cafe24 SFTP `www/portal/signal/scoopsignal.html`(자격증명 `~/projects/park/deploy.sh`). 배포 대상은 `scoopsignal.html`만.

**기준 설계:** `signal/docs/superpowers/specs/2026-06-20-scoopsignal-features-456-design.md`

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `signal/scoopsignal.html` | 대시보드 전체(HTML+CSS+JS) | 전 task에서 수정 |
| `signal/CLAUDE.md` | 프로젝트 컨텍스트 가이드 | Task 7에서 §4/§10/§11 갱신 |

모든 코드 변경은 `signal/scoopsignal.html` 한 파일에서 일어난다. 줄 번호는 작업 시점에 grep으로 재확인한다(편집에 따라 이동).

---

### Task 1: CFG 도입 + refresh/recompute 분리 (동작 불변 리팩터)

가중치를 코드 상수에서 `CFG.w`로 옮기고, `refresh()`에서 점수+렌더 부분을 `recompute()`로 분리한다. **기본값에서 화면 출력은 기존과 동일해야 한다.**

**Files:**
- Modify: `signal/scoopsignal.html` (config 블록 `267-269`, `refresh()` `545-574`)

**Interfaces:**
- Produces:
  - 전역 `CFG` 객체 `{ w:{liq,mom,fun,val}, rocMonths:number, bandSigma:{s1,s2} }`
  - `loadCfg()` → localStorage 머지하여 `CFG` 설정 / `saveCfg()` → 저장 / `resetCfg()` → 기본값 복원+저장
  - `recompute()` — 캐시된 `S` + `CFG`로 점수 계산 및 전 렌더(네트워크 없음)
  - `refresh()` — fetch만 수행 후 `recompute()` 호출

- [ ] **Step 1: config 블록에 CFG 추가**

`signal/scoopsignal.html`의 config 블록(현재 `267-269`) 바로 아래에 추가:

```js
/* ===== tunable config (localStorage) ===== */
const CFG_KEY="scoopsignal_cfg";
const CFG_DEFAULTS={ w:{liq:0.30,mom:0.25,fun:0.25,val:0.20}, rocMonths:3, bandSigma:{s1:1,s2:2} };
let CFG=JSON.parse(JSON.stringify(CFG_DEFAULTS));
function loadCfg(){try{const r=JSON.parse(localStorage.getItem(CFG_KEY)||"{}");
  CFG={ w:{...CFG_DEFAULTS.w,...(r.w||{})}, rocMonths:r.rocMonths||CFG_DEFAULTS.rocMonths, bandSigma:{...CFG_DEFAULTS.bandSigma,...(r.bandSigma||{})} };
}catch(e){CFG=JSON.parse(JSON.stringify(CFG_DEFAULTS));}}
function saveCfg(){try{localStorage.setItem(CFG_KEY,JSON.stringify(CFG));}catch(e){}}
function resetCfg(){CFG=JSON.parse(JSON.stringify(CFG_DEFAULTS));saveCfg();}
function normW(){const w=CFG.w,s=w.liq+w.mom+w.fun+w.val||1;return{liq:w.liq/s,mom:w.mom/s,fun:w.fun/s,val:w.val/s};}
```

- [ ] **Step 2: refresh() 분리 — recompute() 추출**

기존 `refresh()`(현재 `545-574`)를 아래 두 함수로 교체한다. fetch/status 부분은 `refresh()`에, 점수+렌더는 `recompute()`에 둔다.

```js
async function refresh(){
  $('#refreshBtn').disabled=true;
  const r=await Promise.allSettled([loadBinance(),loadLlama(),loadDollar(),loadFred(),loadBeacon()]);
  setStatus('binance',r[0].status==='fulfilled'?'ok':'err');
  setStatus('llama',r[1].status==='fulfilled'?'ok':'err');
  setStatus('fx',r[2].status==='fulfilled'?'ok':'err');
  setStatus('fred',(S.netLiq&&!S.netLiq.fb)?'ok':'warn');
  if(!S.realY){S.realY={val:FALLBACK.realYield,prev:FALLBACK.realYieldPrev,fb:true};}
  if(!S.netLiq){S.netLiq={chg:FALLBACK.netLiqChg,fb:true};}
  S._ok={mom:r[0].status==='fulfilled',val:r[0].status==='fulfilled',fun:r[1].status==='fulfilled'};
  recompute();
  $('#updatedAt').textContent='업데이트 '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  $('#refreshBtn').disabled=false;
}
function recompute(){
  const ok=S._ok||{mom:!!S.ethbtc,val:!!S.ma200,fun:!!S.tvl};
  let mom=50,liq=50,fun=50,val=50;
  if(ok.mom){mom=scoreMom();} if(ok.val){val=scoreVal();}
  liq=scoreLiq();
  if(ok.fun)fun=scoreFun();
  chip('momChip',mom);cardSig('#cMom',mom);setF('momScore',mom+' / 100');
  chip('liqChip',liq);cardSig('#cLiq',liq);setF('liqScore',liq+' / 100');
  chip('funChip',fun);cardSig('#cFun',fun);setF('funScore',fun+' / 100');
  chip('valChip',val);cardSig('#cVal',val);setF('valScore',val+' / 100');
  const w=normW();
  const score=clamp(Math.round(liq*w.liq+mom*w.mom+fun*w.fun+val*w.val),0,100);
  renderGauge(score);
  renderRadar([{label:'밸류',score:val},{label:'유동성',score:liq},{label:'펀더멘털',score:fun},{label:'모멘텀',score:mom}]);
  renderQuad(liq,mom);
  verdict(score,{mom,liq,fun,val});
  if(S.month)drawActiveChart();
}
```

- [ ] **Step 3: 초기화에서 loadCfg() 호출**

파일 하단 초기화 블록(현재 `585-588`의 `buildGauge();refresh();...`)에서 `buildGauge()` 앞에 `loadCfg();` 추가:

```js
loadCfg();
buildGauge();
refresh();
setInterval(refresh,60000);
$('#refreshBtn').addEventListener('click',refresh);
```

- [ ] **Step 4: 동작 불변 검증**

Run:
```bash
cd /home/jschoi0223/projects/vdiportal/signal && python3 -m http.server 8080 >/tmp/ss.log 2>&1 &
```
브라우저(또는 헤드리스)로 `http://localhost:8080/scoopsignal.html` 열기.
Expected: 콘솔 에러 0. 게이지 점수·4축 카드·레이더·차트가 **리팩터 이전과 동일**하게 표시. `localStorage.getItem('scoopsignal_cfg')`는 아직 `null`(저장은 Task 4에서). `python3 -c "import json"` 불필요.

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: CFG 도입 + refresh/recompute 분리(동작 불변)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: 모멘텀 ROC 기간을 CFG.rocMonths로

`scoreMom`이 고정 3개월 대신 `CFG.rocMonths`로 `S.roc`를 재계산하게 한다. 기본값 3에서 출력 불변.

**Files:**
- Modify: `signal/scoopsignal.html` (`loadBinance` 의 `S.roc` 계산 `391`, `scoreMom` `453-460`)

**Interfaces:**
- Consumes: `CFG.rocMonths` (Task 1), `S.month.c` (원본 월간 종가, 보존됨)
- Produces: ROC 기간 가변. `recompute()`가 호출될 때마다 `CFG.rocMonths` 반영.

- [ ] **Step 1: loadBinance에서 원본 월간 종가만 보존**

`loadBinance` 내 현재 `const mc=S.month.c;S.roc={now:pctChange(mc,3),hist:rollChanges(mc,3)};`(`391`) 줄을 삭제한다(ROC 계산은 `scoreMom`으로 이동). `S.month`(`t`,`c`)는 그대로 둔다.

- [ ] **Step 2: scoreMom에서 CFG.rocMonths로 ROC 계산**

`scoreMom()`(`453`) 시작부에 ROC 재계산을 추가:

```js
function scoreMom(){
  const k=clamp(CFG.rocMonths|0,1,6);
  const mc=S.month.c; S.roc={now:pctChange(mc,k),hist:rollChanges(mc,k)};
  const e=S.ethbtc,pe=pctRank(e.hist,e.dist);
  let a=clamp(pe*100+(e.slope>0?6:-6),0,100);
  setF('ebVal',`<span class="${e.dist>=0?'up':'down'}">${e.dist>=0?'+':''}${e.dist.toFixed(1)}%</span>${prMeter(pe,sigOf(pe*100))}`);
  const pr=pctRank(S.roc.hist,S.roc.now);
  setF('rocVal',`<span class="${S.roc.now>=0?'up':'down'}">${fmtPct(S.roc.now)}</span>${prMeter(pr,sigOf(pr*100))}`);
  return Math.round(a*0.6+pr*100*0.4);
}
```

- [ ] **Step 3: 카드 라벨에 기간 반영**

펀더멘털이 아닌 모멘텀 카드의 "3개월 가격 ROC" 라벨(현재 HTML `194`)을 동적으로 갱신하도록, `scoreMom` 끝에 라벨 갱신 한 줄 추가:

```js
  const lab=document.querySelector('#cMom .mrow:nth-child(3) .k'); if(lab)lab.textContent=k+'개월 가격 ROC';
```
(위 Step 2의 `return` 직전에 삽입)

- [ ] **Step 4: 검증**

`http://localhost:8080/scoopsignal.html` 새로고침.
Expected: 콘솔 에러 0. 모멘텀 점수·ROC 값이 기존(3개월)과 동일. 카드 라벨 "3개월 가격 ROC" 유지.

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 모멘텀 ROC 기간을 CFG.rocMonths로\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: 밴드 σ폭을 CFG.bandSigma로

`drawBand`가 하드코딩 1·2σ 대신 `CFG.bandSigma.s1/s2`를 쓰게 한다. 점수(`scoreVal`)는 σ폭과 무관하게 유지.

**Files:**
- Modify: `signal/scoopsignal.html` (`drawBand` `525-540`)

**Interfaces:**
- Consumes: `CFG.bandSigma` (Task 1)
- Produces: 밴드 채널 σ 배수 가변.

- [ ] **Step 1: drawBand에서 CFG.bandSigma 사용**

`drawBand()`(`525`) 내부의 채널 계산·라벨을 교체한다:

```js
function drawBand(){
  const t=S.week.t,c=S.week.c,{a,b,sigma,t0,r2,z,pct}=S.band;
  const s1=CFG.bandSigma.s1, s2=CFG.bandSigma.s2;
  const f=i=>a+b*Math.log((t[i]-t0)/864e5);
  const mid=c.map((_,i)=>Math.exp(f(i)));
  const u2=c.map((_,i)=>Math.exp(f(i)+s2*sigma)),u1=c.map((_,i)=>Math.exp(f(i)+s1*sigma));
  const d1=c.map((_,i)=>Math.exp(f(i)-s1*sigma)),d2=c.map((_,i)=>Math.exp(f(i)-s2*sigma));
  lineChart($('#cvBand'),[
    {label:`+${s2}σ`,color:'#E06A6A',values:u2,w:1,dash:[5,4]},
    {color:'#9C7A45',values:u1,w:0.7,dash:[2,3]},
    {label:'추세',color:'#8B98A6',values:mid,w:1.2},
    {color:'#3E8C68',values:d1,w:0.7,dash:[2,3]},
    {label:`-${s2}σ`,color:'#46C28E',values:d2,w:1,dash:[5,4]},
    {label:'ETH',color:'#E8B463',values:c,w:2}
  ],{logY:true});
  const st=$('#bandStats');if(st)st.innerHTML=`적합도 R²=<b style="color:var(--text)">${r2.toFixed(3)}</b> · 현재 z=<b style="color:var(--text)">${z>=0?'+':''}${z.toFixed(2)}σ</b> · 추세선 대비 백분위 <b style="color:var(--text)">${Math.round(pct*100)}</b> ${pct<.35?'<span class="up">저평가</span>':pct>.7?'<span class="down">과열</span>':'<span class="flat">중립</span>'}`;
}
```

- [ ] **Step 2: 검증**

차트 탭에서 "로그 회귀 밴드" 선택.
Expected: 기본값(s1=1,s2=2)에서 기존과 동일한 채널. 라벨 `+2σ`/`-2σ`.

- [ ] **Step 3: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 밴드 σ폭을 CFG.bandSigma로\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: 튜닝 패널 (가중치·ROC·σ폭 + localStorage)

방법론 위에 접이식 튜닝 패널을 추가하고, 변경 시 `CFG` 저장 + `recompute()`.

**Files:**
- Modify: `signal/scoopsignal.html` (CSS `<style>` 끝 부분, HTML 방법론 `details.method`(`240`) 앞, JS 초기화 블록)

**Interfaces:**
- Consumes: `CFG`,`saveCfg`,`resetCfg`,`recompute`,`drawBand`,`normW` (Task 1·3)
- Produces: `bindTune()` — 패널 DOM에 입력값 주입 + 이벤트 바인딩, `syncTuneUI()` — CFG→UI 반영

- [ ] **Step 1: 패널 CSS 추가**

`<style>` 블록 끝(미디어쿼리 앞, 현재 `116` 부근)에 추가:

```css
  /* tuning panel */
  details.tune{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:0 16px;margin-bottom:14px}
  details.tune summary{cursor:pointer;list-style:none;padding:15px 0;font-size:13.5px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
  details.tune summary::-webkit-details-marker{display:none}
  details.tune .arw{color:var(--gold);font-family:var(--mono)} details.tune[open] .arw{transform:rotate(90deg)}
  .tbody{padding:6px 0 16px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:14px}
  .trow{display:grid;grid-template-columns:120px 1fr 56px;align-items:center;gap:12px;font-size:12px}
  .trow label{color:var(--muted)}
  .trow input[type=range]{width:100%;accent-color:var(--gold)}
  .trow .tval{font-family:var(--mono);font-size:12px;color:var(--text);text-align:right}
  .tgrp-title{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
  .treset{appearance:none;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px 12px;font:inherit;font-size:12px;cursor:pointer;align-self:flex-start}
  .treset:hover{border-color:var(--gold);color:var(--gold)}
```

- [ ] **Step 2: 패널 HTML 추가**

`<details class="method">`(현재 `240`) **바로 앞**에 삽입:

```html
  <details class="tune">
    <summary>튜닝 — 가중치·기간·밴드 조정 <span class="arw">›</span></summary>
    <div class="tbody">
      <div>
        <div class="tgrp-title">종합 가중치 (합 100%로 정규화)</div>
        <div class="trow"><label>유동성</label><input type="range" min="0" max="60" step="1" id="wLiq"><span class="tval" id="wLiqV">—</span></div>
        <div class="trow"><label>모멘텀</label><input type="range" min="0" max="60" step="1" id="wMom"><span class="tval" id="wMomV">—</span></div>
        <div class="trow"><label>펀더멘털</label><input type="range" min="0" max="60" step="1" id="wFun"><span class="tval" id="wFunV">—</span></div>
        <div class="trow"><label>밸류</label><input type="range" min="0" max="60" step="1" id="wVal"><span class="tval" id="wValV">—</span></div>
      </div>
      <div>
        <div class="tgrp-title">파라미터</div>
        <div class="trow"><label>ROC 기간(개월)</label><input type="range" min="1" max="6" step="1" id="pRoc"><span class="tval" id="pRocV">—</span></div>
        <div class="trow"><label>밴드 σ(안쪽)</label><input type="range" min="0.5" max="2" step="0.5" id="pS1"><span class="tval" id="pS1V">—</span></div>
        <div class="trow"><label>밴드 σ(바깥)</label><input type="range" min="1" max="3" step="0.5" id="pS2"><span class="tval" id="pS2V">—</span></div>
      </div>
      <button class="treset" type="button" id="tReset">기본값으로 초기화</button>
    </div>
  </details>
```

- [ ] **Step 3: 패널 JS — syncTuneUI + bindTune**

초기화 블록(파일 하단) 앞에 추가:

```js
function syncTuneUI(){
  const nw=normW();
  const set=(id,val,disp)=>{const e=$('#'+id);if(e)e.value=val;const v=$('#'+id+'V');if(v)v.textContent=disp;};
  set('wLiq',Math.round(CFG.w.liq*100),Math.round(nw.liq*100)+'%');
  set('wMom',Math.round(CFG.w.mom*100),Math.round(nw.mom*100)+'%');
  set('wFun',Math.round(CFG.w.fun*100),Math.round(nw.fun*100)+'%');
  set('wVal',Math.round(CFG.w.val*100),Math.round(nw.val*100)+'%');
  set('pRoc',CFG.rocMonths,CFG.rocMonths+'개월');
  set('pS1',CFG.bandSigma.s1,CFG.bandSigma.s1+'σ');
  set('pS2',CFG.bandSigma.s2,CFG.bandSigma.s2+'σ');
}
function bindTune(){
  const onW=()=>{CFG.w={liq:+$('#wLiq').value/100,mom:+$('#wMom').value/100,fun:+$('#wFun').value/100,val:+$('#wVal').value/100};saveCfg();syncTuneUI();recompute();};
  ['wLiq','wMom','wFun','wVal'].forEach(id=>$('#'+id).addEventListener('input',onW));
  $('#pRoc').addEventListener('input',()=>{CFG.rocMonths=+$('#pRoc').value;saveCfg();syncTuneUI();recompute();});
  const onS=()=>{CFG.bandSigma={s1:+$('#pS1').value,s2:+$('#pS2').value};saveCfg();syncTuneUI();if(S.band&&activeTab==='band')drawBand();};
  $('#pS1').addEventListener('input',onS);$('#pS2').addEventListener('input',onS);
  $('#tReset').addEventListener('click',()=>{resetCfg();syncTuneUI();recompute();});
}
```

- [ ] **Step 4: 초기화에서 호출**

초기화 블록을 다음으로:

```js
loadCfg();
buildGauge();
bindTune();
syncTuneUI();
refresh();
setInterval(refresh,60000);
$('#refreshBtn').addEventListener('click',refresh);
```

- [ ] **Step 5: 검증**

`http://localhost:8080/scoopsignal.html`.
Expected:
- 튜닝 패널 펼침 → 슬라이더 7개 + 리셋 버튼.
- 유동성 가중치 올리면 정규화 %·게이지·레이더 즉시 변화.
- ROC 슬라이더 변경 → 모멘텀 카드 ROC 값 변화.
- σ 슬라이더 변경 → 밴드 차트 채널 폭 변화.
- 새로고침(F5) 후 변경값 유지(`localStorage.getItem('scoopsignal_cfg')` 존재).
- 리셋 → 기본값(30/25/25/20·3개월·1·2σ) 복원.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 튜닝 패널(가중치·ROC·σ폭, localStorage)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: 항목5 — L2 TVL 점수 승격

L2 3개 히스토리를 합산해 30d 분위를 펀더멘털에 편입하고, 카드 행을 점수형으로.

**Files:**
- Modify: `signal/scoopsignal.html` (`loadLlama` `404-415`, `scoreFun` `471-482`)

**Interfaces:**
- Consumes: `pctRank`,`pctChange`,`rollChanges`,`prMeter`,`sigOf`,`setF` (기존)
- Produces: `S.l2 = { now:number, series:number[], chg30:number, hist:number[] }` (기존 `{now}`에서 확장)

- [ ] **Step 1: loadLlama에서 L2 히스토리 합산**

`loadLlama()`(`404`) 내 L2 처리부(현재 `411-412`의 `const L2=[...]` ~ `S.l2={now:l2sum};`)를 교체한다. `chains` 합계는 표시용 `now`로 유지하되, 히스토리 3개를 추가 fetch해 합산한다:

```js
async function loadLlama(){
  const[tvl,chains,stab]=await Promise.all([
    jget('https://api.llama.fi/v2/historicalChainTvl/Ethereum'),
    jget('https://api.llama.fi/v2/chains'),
    jget('https://stablecoins.llama.fi/stablecoincharts/Ethereum')
  ]);
  const tv=tvl.map(d=>d.tvl);S.tvl={series:tv,chg30:pctChange(tv,30),hist:rollChanges(tv,30)};
  const L2=['Arbitrum','Base','OP Mainnet','Optimism','zkSync Era','Linea','Scroll','Starknet','Polygon zkEVM','Mantle','Blast'];
  let l2sum=0;chains.forEach(c=>{if(L2.includes(c.name))l2sum+=c.tvl||0;});
  // 점수용 히스토리: 주요 L2 3개 historicalChainTvl 합산(가용분만)
  const L2H=['Arbitrum','Base','OP Mainnet'];
  const hres=await Promise.allSettled(L2H.map(n=>jget('https://api.llama.fi/v2/historicalChainTvl/'+encodeURIComponent(n))));
  const byDate={};let nh=0;
  hres.forEach(r=>{if(r.status==='fulfilled'&&Array.isArray(r.value)){nh++;r.value.forEach(d=>{byDate[d.date]=(byDate[d.date]||0)+(d.tvl||0);});}});
  const ser=Object.keys(byDate).map(Number).sort((a,b)=>a-b).map(k=>byDate[k]);
  if(nh&&ser.length>30){S.l2={now:l2sum,series:ser,chg30:pctChange(ser,30),hist:rollChanges(ser,30)};}
  else{S.l2={now:l2sum};} // 히스토리 실패 시 표시 전용으로 디그레이드
  const sc=stab.map(d=>+(d.totalCirculatingUSD&&(d.totalCirculatingUSD.peggedUSD||d.totalCirculatingUSD))||0).filter(x=>x>0);
  S.stable={series:sc,chg30:pctChange(sc,30),hist:rollChanges(sc,30)};
}
```

- [ ] **Step 2: scoreFun에 L2 분위 편입 + 카드 행**

`scoreFun()`(`471`)의 L2 표시부(현재 `477`의 `if(S.l2){setF('l2Val',...)}`)를 교체한다:

```js
  if(S.l2&&S.l2.hist){const lp=pctRank(S.l2.hist,S.l2.chg30);parts.push(lp*100);
    setF('l2Val',`$${(S.l2.now/1e9).toFixed(1)}B <span class="d ${S.l2.chg30>=0?'up':'down'}">${fmtPct(S.l2.chg30)}</span>${prMeter(lp,sigOf(lp*100))}`);}
  else if(S.l2){setF('l2Val',`$${(S.l2.now/1e9).toFixed(1)}B`);}
```

- [ ] **Step 3: 검증**

새로고침. DeFiLlama가 안정적이므로 정상 로드.
Expected: 펀더멘털 카드 "L2 TVL 30d" 행에 `$XX.XB` + 30d 증감 + 분위 막대. 펀더멘털 점수가 L2 포함으로 재계산됨. 네트워크 탭에 L2 historicalChainTvl 3건 호출. 히스토리 실패를 흉내(예: 오프라인) 내도 콘솔 에러 없이 표시 전용으로 디그레이드.

- [ ] **Step 4: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: L2 TVL 점수 승격(주요 3개 히스토리 합산)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: 항목4 — 스테이킹 APR − 10Y 스프레드

ETH.STORE APR + FRED DGS10(명목 10Y)로 스프레드를 만들어 고정 lerp로 점수화, 펀더멘털 편입.

**Files:**
- Modify: `signal/scoopsignal.html` (HTML 펀더멘털 카드 `202-208`, `loadFred` `429-440`, `loadBeacon` `442-447`, `scoreFun` `471-482`)

**Interfaces:**
- Consumes: `lerp`,`pctRank`,`setF`,`fmtPct` (기존), `S.staking`,`S.tenY`
- Produces: `S.staking={apr:number,fb:boolean}`, `S.tenY={val:number,fb:boolean}`

- [ ] **Step 1: 펀더멘털 카드에 스프레드 행 추가**

HTML `#cFun` 카드(현재 `202-208`)의 검증자 큐 행(`207`) **앞**에 추가:

```html
        <div class="mrow"><span class="k">스테이킹−10Y 스프레드</span><span class="v" data-f="spVal">—</span></div>
```

- [ ] **Step 2: loadBeacon에 ETH.STORE APR 추가**

`loadBeacon()`(`442`)을 교체:

```js
async function loadBeacon(){
  try{
    const q=await jget('https://beaconcha.in/api/v1/validators/queue');
    S.queue={enter:q.data.beaconchain_entering,exit:q.data.beaconchain_exiting};setStatus('beacon','ok');
  }catch(e){S.queue=null;setStatus('beacon','warn');}
  try{
    const a=await jget('https://beaconcha.in/api/v1/ethstore/latest');
    const apr=a&&a.data&&(a.data.apr!=null?a.data.apr:a.data.cl_apr);
    const v=+apr; S.staking={apr:isFinite(v)?(v<=1?v*100:v):3.0,fb:!isFinite(v)};
  }catch(e){S.staking={apr:3.0,fb:true};}
}
```
(주: ETH.STORE의 apr 필드가 소수(0.03)면 ×100, 퍼센트(3.0)면 그대로 — 방어적 정규화. 구현 시 실제 응답 형태를 콘솔로 1회 확인.)

- [ ] **Step 3: loadFred에 DGS10 추가**

`loadFred()`(`429`)에서 fallback 분기와 정상 분기 양쪽에 10Y 명목금리를 채운다:

```js
async function loadFred(){
  if(!FRED_API_KEY||!FRED_PROXY){S.realY={val:FALLBACK.realYield,prev:FALLBACK.realYieldPrev,fb:true};S.netLiq={chg:FALLBACK.netLiqChg,fb:true};S.tenY={val:4.3,fb:true};return;}
  const base=`${FRED_PROXY}/series/observations`,q=(id,l)=>`${base}?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${l}`;
  const num=o=>o.observations.filter(x=>x.value!=='.').map(x=>+x.value);
  try{const r=num(await jget(q('DFII10',25)));S.realY={val:r[0],prev:r[Math.min(20,r.length-1)],fb:false};}catch(e){S.realY={val:FALLBACK.realYield,prev:FALLBACK.realYieldPrev,fb:true};}
  try{const r=num(await jget(q('DGS10',5)));S.tenY={val:r[0],fb:false};}catch(e){S.tenY={val:4.3,fb:true};}
  try{
    const[w,rrp,tga]=await Promise.all([jget(q('WALCL',14)),jget(q('RRPONTSYD',60)),jget(q('WTREGEN',14))]);
    const W=num(w),R=num(rrp),T=num(tga);
    const nlNow=W[0]/1000-R[0]-T[0]/1000, nlPrev=W[Math.min(8,W.length-1)]/1000-R[Math.min(40,R.length-1)]-T[Math.min(8,T.length-1)]/1000;
    S.netLiq={chg:(nlNow/nlPrev-1)*100,fb:false};
  }catch(e){S.netLiq={chg:FALLBACK.netLiqChg,fb:true};}
}
```

- [ ] **Step 4: refresh() fallback 가드에 tenY 추가**

`refresh()`(Task 1에서 작성한 버전)의 fallback 가드 줄들 옆에 추가:

```js
  if(!S.staking){S.staking={apr:3.0,fb:true};}
  if(!S.tenY){S.tenY={val:4.3,fb:true};}
```
(`if(!S.netLiq){...}` 다음 줄에 삽입)

- [ ] **Step 5: scoreFun에 스프레드 lerp 편입**

`scoreFun()`의 검증자 큐 처리(현재 `478-480`) **앞**에 추가:

```js
  if(S.staking&&S.tenY){const spread=S.staking.apr-S.tenY.val;
    const sS=clamp(lerp([[-3,15],[-1,35],[0,50],[1.5,70],[3,88]],spread),0,100);parts.push(sS);
    const fb=S.staking.fb||S.tenY.fb;
    setF('spVal',`<span class="${spread>=0?'up':'down'}">${spread>=0?'+':''}${spread.toFixed(1)}%p</span>${fb?'<span class="badge">예시</span>':''}`);}
```

- [ ] **Step 6: 상태바 라벨 확인**

상태바 "스테이킹" 표시등(`#st-beacon`, HTML `143`)은 큐 기준으로 ok/warn 설정됨(현행 유지). 스프레드는 fb 배지로 신뢰도 표시하므로 별도 표시등 변경 불필요.

- [ ] **Step 7: 검증**

새로고침.
Expected: 펀더멘털 카드에 "스테이킹−10Y 스프레드" 행 = `+X.X%p`(+ FRED 미연결이면 `예시` 배지). 펀더멘털 점수가 스프레드 포함 재계산. beaconcha CORS 차단 시에도 예시 3.0%로 디그레이드(콘솔 에러 0). 헤드리스 스크린샷으로 카드 4행 확인.

- [ ] **Step 8: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 스테이킹-10Y 스프레드 펀더멘털 편입\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: 문서 갱신 (방법론 본문 + CLAUDE.md)

화면 내 방법론 텍스트와 `signal/CLAUDE.md`를 신규 기능에 맞춘다.

**Files:**
- Modify: `signal/scoopsignal.html` (method 본문 `244-255`)
- Modify: `signal/CLAUDE.md` (§4 데이터 흐름, §10 설정값, §11 로드맵)

- [ ] **Step 1: 방법론 본문 갱신**

method `.mbody`(현재 `244-255`)의 축 구성·데이터 단락에 반영:
- 펀더멘털 줄에 "L2 TVL 30d(점수)·스테이킹−10Y 스프레드" 추가.
- 데이터 줄에 "beaconcha.in(검증자 큐·ETH.STORE APR)·FRED(…·DGS10)" 반영.
- 새 단락 한 줄: "가중치·ROC 기간·밴드 σ폭은 상단 튜닝 패널에서 조정하며 브라우저에 저장됩니다."

```html
      <p><code>펀더멘털</code> ETH DeFi TVL·스테이블·L2 TVL 30일 증감 + 스테이킹−10Y 스프레드 (+검증자 큐)<br>
```
(해당 `<code>펀더멘털</code>` 줄 교체. 데이터 단락의 beaconcha/FRED 괄호도 위 내용대로 수정.)

- [ ] **Step 2: CLAUDE.md §4 데이터 흐름 갱신**

`signal/CLAUDE.md` §4의 `refresh()` 설명을 "refresh()=fetch 후 recompute() 호출, recompute()=캐시 S+CFG로 점수·렌더(재fetch 없이 튜닝 반영)"로 보강.

- [ ] **Step 3: CLAUDE.md §10·§5·§9 설정값/소스 갱신**

- §10 config 블록에 `CFG`(localStorage `scoopsignal_cfg`: 가중치·rocMonths·bandSigma) 추가 서술.
- §9의 "localStorage 미사용" 문장을 "튜닝 설정 한정 `scoopsignal_cfg` 사용"으로 수정.
- §5 데이터 소스 표에 beaconcha ETH.STORE APR, FRED DGS10, DeFiLlama L2 히스토리 행/주석 추가.

- [ ] **Step 4: CLAUDE.md §11 로드맵 체크**

§11에서 항목 4·5·6을 완료(`[x]`)로 표시.

- [ ] **Step 5: 검증**

`http://localhost:8080/scoopsignal.html` 방법론 펼쳐 문구 확인. `signal/CLAUDE.md` 일관성 확인(점수 산식·소스·설정 위치가 코드와 일치).

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html signal/CLAUDE.md && \
git commit -m "$(printf 'ScoopSignal: 방법론·CLAUDE.md 문서 갱신(항목4·5·6)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 8: 최종 검증 + 운영 배포 (vdi-log 방식)

전체 통합 확인 후 cafe24 배포.

**Files:** 없음(배포만)

- [ ] **Step 1: 통합 검증**

`http://localhost:8080/scoopsignal.html`:
- 콘솔 에러 0.
- 5개 소스 status 표시등 정상(또는 warn/예시 배지로 디그레이드).
- 펀더멘털 카드 5지표(TVL·스테이블·L2·스프레드·검증자큐) 표시.
- 튜닝 패널: 가중치·ROC·σ 즉시 반영, 새로고침 유지, 리셋 동작.
- 헤드리스 스크린샷 1장 확보(WSL playwright chromium).

- [ ] **Step 2: cafe24 배포**

```bash
cd /home/jschoi0223/projects/vdiportal && \
PW=$(grep -oP 'PASS="\K[^"]+' ~/projects/park/deploy.sh) && \
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:$PW@parksvc.mycafe24.com; mkdir -p www/portal/signal; cd www/portal/signal; put signal/scoopsignal.html -o scoopsignal.html"
```
Expected: 업로드 성공. `https://parksvc.mycafe24.com/portal/signal/scoopsignal.html` 접속 확인.

- [ ] **Step 3: push**

```bash
cd /home/jschoi0223/projects/vdiportal && git push
```

---

## Self-Review

**Spec coverage:**
- 설계 §1 아키텍처(CFG+recompute) → Task 1 ✅
- §3 항목4 스프레드 → Task 6 ✅
- §4 항목5 L2 승격 → Task 5 ✅
- §5 항목6 튜닝(가중치/ROC/σ) → Task 2·3·4 ✅
- §7 검증 → 각 Task Step + Task 8 ✅
- §8 배포 → Task 8 ✅
- CLAUDE.md 갱신 의무 → Task 7 ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. ETH.STORE apr 필드·OP Mainnet 슬러그는 "구현 시 실제 응답 1회 확인" 주석으로 명시(방어적 파싱 코드 제공) — 미완 자리표시 아님.

**Type consistency:** `CFG`/`normW`/`recompute`/`saveCfg`/`resetCfg`/`S.l2{now,series,chg30,hist}`/`S.staking{apr,fb}`/`S.tenY{val,fb}`가 정의 task와 사용 task에서 일치. `S._ok`는 Task 1에서 도입, recompute에서 소비. ROC 기간 `k`는 Task 2에서 scoreMom 내 계산.
