# Upbit 가격 소스 교체(한국 차트 복구) + 온체인 시각화 보강 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한국에서 Binance 지오블록(451)으로 빈 가격 차트를, Upbit(한국 거래소) 캔들 + CoinGecko USD 티커로 교체해 복구하고, 가스·스테이킹 지표에 시각 요소를 보강한다.

**Architecture:** `loadBinance`를 `loadUpbit`로 교체 — Upbit `candles/{days,weeks,months}`(페이지네이션)로 동일한 `S.ethbtc/S.week/S.month/S.ma200/S.band`를 채우고(점수·차트 로직 불변), 티커(USD)는 CoinGecko `simple/price`. 밸류 차트는 원화(₩) 기준(분위·비율·% 분석은 통화 무관 → 점수 불변). 가스·스테이킹은 미니바/링으로 시각화.

**Tech Stack:** 순수 HTML5·CSS3·Vanilla JS. 클라이언트 사이드 fetch. 신규 소스: Upbit 공개 API(노키·CORS), CoinGecko simple/price(노키·CORS, 기존 사용).

## Global Constraints

- 단일 파일: `signal/scoopsignal.html`만 수정. 파일 분리 금지.
- 디자인 토큰만(`--gold/--ink/--bull/--neutral/--bear/--muted/--panel/--panel-2/--line/--text/--faint`). 하드코딩 색 금지. 좌측 컬러바 금지.
- `html{zoom:1.35}` 유지. UI 텍스트 한국어. 2 spaces, 기존 압축형 스타일.
- 점수 산식(`scoreMom/Liq/Fun/Val`)·`recompute()` 계산부·뷰 라우터·차트 draw 함수 로직 불변. 데이터 출처만 교체(`S.*` 형태 동일 유지).
- 밸류 차트는 원화(₩) 기준 — 분위/비율/%/로그 분석은 통화 무관이라 점수 영향 없음. 티커는 USD(CoinGecko).
- 그레이스풀: Upbit/CoinGecko 실패해도 나머지·점수 정상(`Promise.allSettled`), 차트는 기존처럼 빈 상태 가드.

**검증 방식:** 테스트 프레임워크 없는 정적 HTML. 로컬 서버 + 헤드리스 Chromium DOM/스크린샷. **핵심: Binance를 route abort로 차단한 채(한국 시뮬) 검증** — 이래야 실제 사용자 환경과 같음.
```bash
cd /home/jschoi0223/projects/vdiportal/signal && python3 -m http.server 8099
```
헤드리스: chrome `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`, `require("/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core")`, `LD_LIBRARY_PATH=/tmp/chrlibs node script.js`. Binance 차단: `await ctx.route(/api\.binance\.com/, r=>r.abort());`

---

## File Structure

- Modify only: `signal/scoopsignal.html`
  - Task 1: `loadBinance`→`loadUpbit`(+ `upCandles` 헬퍼) 교체, `refresh` 호출/상태 교체, 밸류 차트 ₩ 라벨.
  - Task 2: 가스(소각률 미니바)·스테이킹(링/막대) 시각화 + 배포.

---

### Task 1: Upbit 가격 소스 교체 (Binance 대체) + ₩ 라벨

**Files:** Modify `signal/scoopsignal.html` (script: loadBinance 교체, refresh, 상태 푸터, drawBand 라벨)

**Interfaces:**
- Consumes: `jget`, `setF`, `chg`, `fmtUsd`, `fmtPct`, `sma`, `fitPower`, `pctRank`, `setStatus`, 기존 `S.ethbtc/S.week/S.month/S.ma200/S.band` 소비처(점수·차트).
- Produces: `upCandles(unit,market,need)` → `[{t,c}]`(오름차순), `loadUpbit()`(= 기존 loadBinance 대체, 동일 S.* 채움 + CoinGecko 티커).

- [ ] **Step 1: upCandles 페이지네이션 헬퍼 추가**

`loadBinance` 정의 바로 앞에 추가:
```js
// Upbit 캔들 페이지네이션 → 오름차순 [{t,c}] (c=종가 trade_price)
async function upCandles(unit,market,need){
  const out=[];let to='';
  for(let guard=0;guard<10&&out.length<need;guard++){
    const u=`https://api.upbit.com/v1/candles/${unit}?market=${market}&count=200`+(to?`&to=${encodeURIComponent(to)}`:'');
    const arr=await jget(u);
    if(!Array.isArray(arr)||!arr.length)break;
    out.push(...arr);                                   // 각 페이지 최신→과거
    to=arr[arr.length-1].candle_date_time_utc+'Z';      // 가장 과거 캔들 시각(UTC) → 다음 페이지 기준
    if(arr.length<200)break;
  }
  const seen=new Set(),res=[];
  out.reverse().forEach(d=>{const t=Date.parse(d.candle_date_time_utc+'Z');if(isFinite(t)&&!seen.has(t)){seen.add(t);res.push({t,c:+d.trade_price});}});
  return res;
}
```

- [ ] **Step 2: loadBinance → loadUpbit 교체**

`async function loadBinance(){ … }` 전체를 아래 `loadUpbit`로 **교체**한다(동일 S.* 산출, 티커는 CoinGecko):
```js
async function loadUpbit(){
  // 티커(USD): CoinGecko simple/price
  try{
    const sp=await jget('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,btc&include_24hr_change=true');
    const e=sp&&sp.ethereum;
    if(e){ if(e.usd!=null){setF('ethUsd',fmtUsd(e.usd));chg('ethChg',+e.usd_24h_change||0);}
           if(e.btc!=null){setF('ethBtc',(+e.btc).toFixed(5));chg('ethBtcChg',+e.btc_24h_change||0);} }
  }catch(_){}
  // 캔들(Upbit): ETH/BTC 일봉(모멘텀) · KRW-ETH 주/월봉(밸류 차트, 원화)
  const[ebD,wk,mo]=await Promise.all([
    upCandles('days','BTC-ETH',400),
    upCandles('weeks','KRW-ETH',470),
    upCandles('months','KRW-ETH',200)
  ]);
  // ETH/BTC vs 50일선 + 자체 분포(퍼센타일)
  const ebC=ebD.map(p=>p.c),last=ebC.length-1;
  const s50=sma(ebC,50,last),s50p=sma(ebC,50,last-10);
  const ebHist=[];for(let i=49;i<ebC.length;i++)ebHist.push((ebC[i]/sma(ebC,50,i)-1)*100);
  S.ethbtc={dist:(ebC[last]/s50-1)*100,slope:(s50/s50p-1)*100,hist:ebHist};
  S.week={t:wk.map(p=>p.t),c:wk.map(p=>p.c)};
  S.month={t:mo.map(p=>p.t),c:mo.map(p=>p.c)};
  // 200주선 배수 + 분포
  const wc=S.week.c,wl=wc.length-1,ma200=sma(wc,200,wl),m200Hist=[];
  for(let i=199;i<wc.length;i++)m200Hist.push(wc[i]/sma(wc,200,i));
  S.ma200={mult:wc[wl]/ma200,hist:m200Hist};
  // 로그-로그 파워로 회귀(주간, 제네시스 기준 — 가용 데이터로 적합)
  const t0=Date.parse('2015-07-30');
  S.band=fitPower(S.week.t,wc,t0);S.band.t0=t0;
  const dNow=Math.log((S.week.t[wl]-t0)/864e5),resNow=Math.log(wc[wl])-(S.band.a+S.band.b*dNow);
  S.band.resNow=resNow;S.band.z=resNow/S.band.sigma;S.band.pct=pctRank(S.band.res,resNow);
}
```
주의: `chg`/`setF`/`sma`/`fitPower`/`pctRank` 기존 함수 그대로 사용. ETH/USD·ETH/BTC 티커만 CoinGecko, 차트 데이터는 Upbit. BTC/USD 티커 표시는 이미 제거된 상태(domVal로 대체됨)이라 추가 작업 없음.

- [ ] **Step 3: refresh() 오케스트레이션 + 상태 푸터 교체**

`refresh()`의 allSettled에서 `loadBinance()`를 `loadUpbit()`로 바꾼다:
```js
  const r=await Promise.allSettled([loadUpbit(),loadLlama(),loadDollar(),loadFred(),loadBeacon(),loadCoinGecko(),loadUltrasound()]);
```
바로 다음 `setStatus('binance',r[0].status==='fulfilled'?'ok':'err');`를:
```js
  setStatus('price',r[0].status==='fulfilled'?'ok':'err');
```
로 바꾼다. (S._ok의 `r[0]` 참조는 그대로 — 이제 Upbit.)

상태 푸터 마크업에서 `<span class="s"><i id="st-binance"></i>Binance 가격·사이클</span>`을:
```html
        <span class="s"><i id="st-price"></i>Upbit·CoinGecko 가격</span>
```
로 바꾼다(id `st-price`가 `setStatus('price',…)`와 일치).

- [ ] **Step 4: 밸류 차트 원화(₩) 라벨**

`drawBand`의 lineChart 호출에서 `yLabel:'USD(로그)'`를 `yLabel:'₩(로그)'`로 바꾼다. 그리고 `#bandStats` 또는 band 뷰 `page-sub`에 "원화(₩) 기준" 표기가 없으면, band 뷰 `<p class="page-sub">` 끝(`<span id="bandStats">` 앞)에 `원화(₩) 기준 · ` 문구를 추가한다. (다른 밸류 차트는 %·배수·지수라 통화 라벨 없음 → 변경 불필요.)

검증용 grep:
```bash
cd /home/jschoi0223/projects/vdiportal/signal
grep -c "function loadBinance" scoopsignal.html   # 0 (교체됨)
grep -c "function loadUpbit" scoopsignal.html      # 1
grep -c "api.binance.com" scoopsignal.html          # 0
grep -c "function upCandles" scoopsignal.html       # 1
```

- [ ] **Step 5: 검증 — Binance 차단(한국 시뮬) 하에 차트 복구**

헤드리스에서 **Binance를 차단**한 채(`ctx.route(/api\.binance\.com/, r=>r.abort())`) 로드(~6s 대기, Upbit 페이지네이션 시간 고려):
```js
({ethbtc:!!S.ethbtc, week:S.week?S.week.c.length:0, weekFirst:S.week?new Date(S.week.t[0]).toISOString().slice(0,7):null, month:S.month?S.month.c.length:0, ma200:S.ma200?S.ma200.mult.toFixed(2):null, bandR2:S.band?S.band.r2.toFixed(2):null, score:document.querySelector('#scoreNum').textContent, ethUsd:document.querySelector('[data-f="ethUsd"]').textContent})
// 기대: ethbtc:true, week>400, weekFirst≈"2017-1x", month>100, ma200 양수, bandR2 0~1, score 숫자, ethUsd "$..."(CoinGecko)
```
- 각 패턴 뷰(season/cycle/halving/band/mayer/dd/vol/spiral) `showView` 후 캔버스/히트맵이 **실제로 그려지는지** + 스크린샷(band·season·spiral 1뷰씩) 육안 확인. band Y축이 ₩ 스케일.
- 콘솔 JS 에러 0. Upbit 주봉이 2017까지 페이지네이션 되는지(weekFirst) 확인 — 안 되면 `to` 처리(append 'Z' 등) 조정.
- 200주 배수·로그밴드·사이클 오버레이가 채워지는지(장기 히스토리 의존) 확인.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 가격 소스 Binance→Upbit(한국 차트 복구) + CoinGecko USD 티커, 밸류 차트 ₩

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 가스·스테이킹 시각화 보강 + 배포

**Files:** Modify `signal/scoopsignal.html` (script `renderOnchain`, style)

**Interfaces:**
- Consumes: 기존 `renderOnchain()`, `S.us`, `#gasStats`/`#stakingStats`, `clamp`, `sigOf`.
- Produces: 가스 소각률 미니바·스테이킹 비율 링/막대 마크업(renderOnchain 내).

- [ ] **Step 1: CSS — 미니바·링**

`<style>`에 추가:
```css
  .ob-bars{display:flex;flex-direction:column;gap:9px;margin-top:6px}
  .ob-bar{display:grid;grid-template-columns:64px 1fr 92px;align-items:center;gap:9px;font-size:11.5px;color:var(--muted)}
  .ob-bar .bar{height:7px;border-radius:4px;background:var(--panel-2);overflow:hidden}
  .ob-bar .bar i{display:block;height:100%;border-radius:4px;background:var(--neutral)}
  .ob-bar .num{font-family:var(--mono);text-align:right;color:var(--text)}
  .ring-wrap{display:flex;align-items:center;gap:16px;margin-top:4px}
  .ring{width:96px;height:96px;flex:0 0 auto}
  .ring .rbg{fill:none;stroke:var(--panel-2);stroke-width:10}
  .ring .rfg{fill:none;stroke:var(--gold);stroke-width:10;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%;transition:stroke-dashoffset .6s}
  .ring-c{font-family:var(--mono);font-size:13px;fill:var(--text)}
```

- [ ] **Step 2: renderOnchain — 가스 미니바 + 스테이킹 링**

`renderOnchain()` 안에서 `#gasStats` 채우는 부분을 다음으로 교체(소각률을 미니바로; 24h를 max 기준 정규화):
```js
  const g=$('#gasStats');if(g){if(S.us){
    const rates=[['24h',S.us.burn24h],['7d',S.us.burn7d],['30d',S.us.burn30d]];
    const mx=Math.max(1,...rates.map(r=>r[1]||0));
    const bars=rates.map(([k,v])=>`<div class="ob-bar"><span>소각 ${k}</span><span class="bar"><i style="width:${clamp((v||0)/mx*100,2,100)}%"></i></span><span class="num">${Math.round(v||0).toLocaleString()}/yr</span></div>`).join('');
    g.innerHTML=`<div class="mrow"><span class="k">기준 가스(base fee)</span><span class="v"><b style="color:var(--text)">${S.us.baseFeeGwei!=null?S.us.baseFeeGwei.toFixed(2)+' gwei':'—'}</b></span></div><div class="ob-bars">${bars}</div>`;
  }else g.innerHTML='<div class="mrow"><span class="k">데이터</span><span class="v">연결 필요</span></div>';}
```
그리고 `#stakingStats` 채우는 부분을 링 게이지로 교체:
```js
  const stv=$('#stakingStats');if(stv){
    const ratio=(S.us&&S.us.stakedEth&&S.us.supplyNow)?(S.us.stakedEth/S.us.supplyNow*100):null;
    if(ratio!=null){const C=2*Math.PI*42,off=C*(1-clamp(ratio,0,100)/100);
      stv.innerHTML=`<div class="ring-wrap"><svg class="ring" viewBox="0 0 100 100"><circle class="rbg" cx="50" cy="50" r="42"/><circle class="rfg" cx="50" cy="50" r="42" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/><text class="ring-c" x="50" y="54" text-anchor="middle">${ratio.toFixed(1)}%</text></svg><div><div class="mrow"><span class="k">스테이킹 물량</span><span class="v">${(S.us.stakedEth/1e6).toFixed(2)}M ETH</span></div><div class="mrow"><span class="k">총공급</span><span class="v">${(S.us.supplyNow/1e6).toFixed(2)}M ETH</span></div></div></div>`;
    }else stv.innerHTML='<div class="mrow"><span class="k">데이터</span><span class="v">연결 필요</span></div>';}
```

- [ ] **Step 3: 검증**

헤드리스(Binance 차단 무관 — ultrasound 의존):
- `gas` 뷰: 기준 가스 + 소각률 3개 미니바(24h/7d/30d, 길이=상대 크기). `staking` 뷰: 링 게이지(비율 % 중앙) + 물량·총공급.
- ultrasound 실패 시 "연결 필요". 콘솔 JS 에러 0. 스크린샷 육안 확인.
```js
(()=>{window.showView('gas');return {bars:document.querySelectorAll('#gasStats .ob-bar').length, ring:!!document.querySelector('#stakingStats .ring')||(window.showView('staking'),!!document.querySelector('#stakingStats .ring'))};})()
```

- [ ] **Step 4: Commit + 배포**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 가스 소각률 미니바 + 스테이킹 비율 링 게이지

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
# cafe24 SFTP로 scoopsignal.html 배포(메모리 절차), 라이브 HTTP200 + 마커 확인
```

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지**
- Binance→Upbit 캔들(동일 S.ethbtc/week/month/ma200/band) → Task 1 Step 1·2 ✅
- 티커 USD(CoinGecko simple/price) → Task 1 Step 2 ✅
- refresh/상태 교체 → Task 1 Step 3 ✅
- 밸류 차트 ₩ 라벨 → Task 1 Step 4 ✅
- 점수 로직 불변(S.* 형태 동일·통화 무관) → Global Constraints + 동일 산출 ✅
- 그레이스풀 + Binance 차단 하 검증 → Task 1 Step 5 ✅
- 가스 미니바·스테이킹 링 → Task 2 ✅

**2. 자리표시 스캔:** TBD/TODO 없음. 모든 코드 스텝 실제 코드. Upbit `to` 페이지네이션 검증 단계 명시 ✅

**3. 타입/이름 일관성:** `upCandles(unit,market,need)→[{t,c}]`·`loadUpbit()`가 Task 1 정의→refresh 사용 일치. `S.week={t,c}`/`S.month={t,c}`/`S.ethbtc{dist,slope,hist}`/`S.ma200{mult,hist}`/`S.band` 형태가 기존 소비처(scoreMom/scoreVal/draw*)와 동일. `setStatus('price')`↔`#st-price` 일치. `renderOnchain`의 `#gasStats`/`#stakingStats`는 Task 2서 내용만 교체(id 유지). `clamp`/`sigOf` 기존 사용 ✅
