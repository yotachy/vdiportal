# 03 — 동작·플로우·이벤트 로직 전수 조사

대상: `docs/design-v2/raw/handoff-1/MoneyScoop 체험 프로토타입.dc.html` (2,924줄)
로직 본체: `class Component extends DCLogic` (L2135) — 상태 선언 L2136, 메서드 L2202~2296, `renderVals()` L2298~2920.
줄 번호는 모두 위 파일 기준. **타이머·조건식은 코드 그대로 인용** — 실개발 동작 명세의 근거 문서.

---

## 0. 상태 좌표계 (요약)

- `state` 초기값 전체: **L2136**. 핵심: `screen:'boot'`, `scoops:15`, `tier:null`, `preset:'전체 종합'`, `deep:false`, `prog:0`, `tf:'일'`, `left:8047`(출석 카운트다운 초), `gLeft:27480`(채점 마감 카운트다운 초), `analyzed:{}` / `analyzedAt:{}`(키 = `sym|tf`, 값 = `'basic'|'deep'|'custom'` / epoch ms), `wts`·`chk`(커스텀 7지표 가중치·체크, 기본 전부 1/on).
- 커스텀 가중치 부호 맵 `MIXSIGN` (L2137): 이동평균·슈퍼트렌드·MACD·볼린저밴드·거래량 = `+1`, RSI 다이버전스·거래량 다이버전스 = `−1`.
- 지표 32종 배열 `IND` (L2142): `[이름, 한줄판정, 'u'|'d'|'n', 강도]`.
- 프리셋 9종 `P` (L2141) + 5분류 배분 프로파일 `PROF` (L2139).
- 영속화 `persist()` (L2266): localStorage 키 `ms_proto_v1`, 스키마 `{p:pickArr, a:analyzed, at:analyzedAt, s:scoops, t:theme, g:gLinked, q:pQi, pa:pAns, x:xp, xt:xpToday, fz, dv:dVisit}`. **tier·prog·runLive는 저장 안 함** — 앱 재시작 시 진행 중 분석은 소멸.

---

## 1. 분석 실행 파이프라인 (최중요)

### 1-1. 진입 → 단계(tier) 시트

- 진입점: FAB/CTA `startSim` (L2637) 및 `openTier` (L2803) → `sheet:'tier'`. 미분석 상태에서 작도 칩 탭 `chipTap` (L2843)도 `sheet:'tier'`.
- tier 시트의 3버튼 (L2806~2808) — **셋 모두 `guardRun()` 선행**(§2-4):

```js
pickBasic:()=>{if(this.guardRun())return;this.setState({tier:'basic',deep:false,seg:'evi'});this.startRun()},            // L2806 — 무료·프리셋 생략·즉시 실행
pickDeep:()=>{if(this.guardRun())return;if(st.scoops>=2)this.setState({tier:'deep',sheet:'preset'});else{this.hap('warn');this.setState({sheet:'short'})}},   // L2807
pickCustom:()=>{if(this.guardRun())return;if(st.scoops>=3)this.setState({tier:'custom',sheet:'preset'});else{this.hap('warn');this.setState({sheet:'short'})}}, // L2808
```

- 잔액 부족 힌트: `deepHint`(scoops<2 → '2 부족'), `custHint`(scoops<3 → 'N 부족') (L2804~2805). 부족 시 `sheet:'short'`(잔액 부족 시트, 템플릿 L1831~) — 광고 보기(`watchAd`)·기본 분석(`pickBasic`) 대안 제공.

### 1-2. 프리셋(preset) 시트

- 상단 추천 3카드 `presetTop` (L2813~2817): ① 전체 종합(표준) ② 추세 중심('요즘 잘 맞음') ③ **내 성향** — `per = st.gLinked && st.pQi>0`일 때만 실카드(추천명 `'스윙'` 고정 더미). 게스트/무답이면 **dashed 잠금 카드**: 탭 시 `sheet:null` + flash('홈의 페르소나 카드에서 질문에 답해 보세요') — 프리셋 선택이 아니라 시트를 닫는다.
- 전체 9종 접이식 `presets` (L2809~2812): `PROF` 5분류(추세·모멘텀·거래량·변동성·구조) 배분 바, 최대 항목 강조. 접기 상태 `presetMoreOn` (L2818): 기본 접힘, **비추천 프리셋이 이미 선택돼 있으면 자동 펼침** (`['전체 종합','추세 중심','스윙'].indexOf(st.preset)<0`).
- 선택은 `pick(n)` = `setState({preset:n})` (L2347). CTA 문구 `ctaCost` (L2844): custom → `'비중 조절로 →'`, deep → `'◈ 2 차감'`.

### 1-3. 차감 확인(deduct) — 심화 경로

```js
confirmDeduct:()=>{if(st.tier==='custom'){this.setState({screen:'mix',sheet:null});this.flash('비중을 조절한 뒤 분석을 시작하세요. 아직 차감 전이에요','');return}
  this.setState({sheet:'deduct'});clearTimeout(this.a1);
  this.a1=setTimeout(()=>{this.hap('deduct');this.setState(s=>({scoops:s.scoops-2,deep:true}));setTimeout(this.persist,80);this.flash('◈ 2 차감 · 분석을 시작합니다','−2');this.startRun()},1050)}, // L2824
```

- **custom은 여기서 차감하지 않고 mix 화면으로 넘어간다**(차감은 §1-5의 `runCustom`에서).
- deduct 시트(템플릿 L1817~1829)는 **버튼 없는 1050ms 자동 진행 오버레이**: `◈ scoops → afterScoops` 취소선 연출 후 자동으로 차감·실행.

### 1-4. 커스텀 가중치(mix 화면) → 페르소나 확인(pfit)

- `mixRows` (L2826~2828): 7지표 각각 체크 토글(`chk`)과 슬라이더 `set`(`wts[n]=parseFloat`, NaN이면 1).
- 2차 예측선 미리보기 오프셋 (L2829~2831):
  - `p2dy`: `d = Σ_checked (wts[n]−1)×MIXSIGN[n]` → `clamp(−28, 28, −d×5)` px.
  - `p3dy`: p2dy 기준 `b>=0 ? b+16 : b−16`.
  - `p2label`: `d>0.2 → '내 조합 · 1차보다 상향'` / `d<−0.2 → 하향` / 그 외 `'1차와 비슷'`.
- `startFromMix` (L2835) → `screen:'pfit'`(페르소나 반영 확인 화면). `mixBack` (L2839) → chart+`sheet:'preset'`, `backToMix` (L2837), `pfitClose` (L2838, tier 초기화 후 chart).
- pfit 분기 (L2841~2842): `pfitYes` → `pApply:1` + flash + `runCustom()` / `pfitNo` → `pApply:0` + `runCustom()`. `pfitEmpty` = `pQi===0` (L2840).

### 1-5. runCustom — 커스텀 차감 및 24h 재분석 무료 규칙

```js
runCustom=()=>{if(this.guardRun())return;const s=this.state;const k=(s.ticker||'NVDA')+'|'+s.tf;const tv=s.analyzed[k];const at=(s.analyzedAt||{})[k]||0;
  const live=!!tv&&(Date.now()-at)<86400000&&(tv==='deep'||tv==='custom');
  if(!live){this.setState({sheet:'deduct'});clearTimeout(this.a1);
    this.a1=setTimeout(()=>{this.hap('deduct');this.setState(s2=>({scoops:s2.scoops-3,deep:true,sheet:null}));setTimeout(this.persist,80);this.flash('◈ 3 차감 · 분석을 시작합니다','−3');this.startRun()},1050)
  }else{this.startRun()}};  // L2215~2216
```

- **같은 `sym|tf`에 24h 내 심화/커스텀 결과가 살아 있으면 커스텀 재실행은 무차감**(`live` 분기). deep 경로(`confirmDeduct`)에는 이 무료 규칙이 없다 — 비대칭 주의.

### 1-6. startRun — 실행 본체 (전문)

```js
startRun=()=>{
  clearInterval(this.t);clearTimeout(this.stepT);clearTimeout(this.v1);clearTimeout(this.v2);clearTimeout(this.v3);clearInterval(this.v4);
  this.setState({screen:'run',prog:0,sheet:null,chZoom:1,chPan:0,vidOut:0,runLive:1,runDoneN:null,runSym:this.state.ticker||'NVDA',runTf:this.state.tf||'일'});
  const s0=this.state;const cust=s0.tier==='custom';const deep=s0.tier==='deep';const tot=s0.tier==='basic'?5:32;
  const rnd=(i,a)=>{const v=Math.sin(i*91.7+a*57.3+7.3)*43758.5453;return v-Math.floor(v)};
  const step=p=>{
    if(!this.state.runLive)return;
    const bgWatch=()=>{clearInterval(this.v4);this.v4=setInterval(()=>{if(!this.state.runLive){clearInterval(this.v4);return}
      if(this.state.screen!=='run'){clearInterval(this.v4);clearTimeout(this.v2);this.v2=setTimeout(this.endApply,3200)}},400)};
    if(p>=tot&&cust){this.setState({prog:32});
      if(this.state.pApply)this.v1=setTimeout(()=>this.setState({prog:33}),3300);
      this.v2=setTimeout(this.endApply,30000);bgWatch();return}
    if(p>=30&&deep){this.setState({prog:30});
      this.v1=setTimeout(()=>this.setState(s=>({prog:Math.min(31,s.prog+1)})),2600);
      this.v2=setTimeout(this.endApply,30000);bgWatch();return}
    if(p>tot){this.finishRun();return}
    this.setState({prog:p});
    const dur=rnd(p,1)>0.76?(880+rnd(p,2)*520):(230+rnd(p,3)*270);
    this.stepT=setTimeout(()=>step(p+1),dur);
  };
  step(0);
};  // L2236~2256
```

핵심 사실:

- **runSym/runTf 동결**: 실행 시작 시점의 종목·주기를 별도 저장(L2238) — 실행 중 화면에서 다른 종목을 봐도 결과는 동결본에 기록(§2-1).
- **스텝 타이밍**: 결정적 sin-해시 `rnd`. `rnd(p,1)>0.76`(약 24% 확률)이면 **긴 스텝 880~1400ms**, 아니면 **짧은 스텝 230~500ms**. 총 진행: basic 6스텝(0..5), deep/custom 지표 30/32스텝 후 특별 구간.
- **deep 특별 구간**: `p>=30`에서 `prog:30` 고정 → **2600ms** 뒤 `prog:31`(가중치 표기 없는 합산 연출) → 엔진 영상 재생, 최대 **30000ms**(v2) 후 강제 `endApply`.
- **custom 특별 구간**: `p>=32`에서 `prog:32`(내 가중치 적용) → `pApply`면 **3300ms** 뒤 `prog:33`(페르소나 미세 조정) → 영상, 최대 30000ms.
- **basic은 특별 구간·영상·중단 버튼 없음** — `p>tot`(6번째 스텝)에서 즉시 `finishRun`.
- **bgWatch(백그라운드 감시)**: 특별 구간 진입 후 400ms 폴링. `screen!=='run'`(사용자 이탈)이면 30초 영상 대기를 **3200ms로 단축**해 `endApply` — 이탈 시 빨리 끝내주는 규칙.

### 1-7. 작도 시퀀스·원뿔·카메라·영상

- **그룹별 작도 시퀀스 `runDraw`** (L2436~2447): `v = prog % 6` 순환 —
  `0`: 이동평균 `ma1`(#5b8def) / `1`: 볼린저 `bu`+`bd`(#4a86c9) / `2`: 일목 구름 `cloud`(시안 면) / `3`: 회귀채널 `chU`+`chD` / `4`: 피벗 수평 2줄(amber 점선, `M8 132H403`·`M8 302H403`) / `5`: 피보나치 3줄(보라 점선). 각 프레임 `msVidIn 0.5s`.
  custom `prog>=32` 특별 작도: `dy = clamp(−28,28, −Σ(wts−1)×MIXSIGN×5)`만큼 이동한 **청록 점선 ma1**(가중치 반영선), `pApply && prog>=33`이면 **핑크 점선**(dy±16, 페르소나선) 추가, `msDrawCycle 0.9s`.
- **원뿔(예측 콘) 페이드인** `runConeO` (L2448): `st.prog >= (st.tier==='basic' ? 4 : 29)` → opacity 0→1, `transition:opacity 0.9s` (템플릿 L637). ※ 지침서에 "29/32"로 통용되는 그 지점 — 정확한 조건은 **basic 4 / 그 외 29**.
- **카메라 워크 `runCamV`** (L2449~2458): 영상 구간(`custom? prog>=32 : deep&&prog>=30`)이 아니고 `screen==='run'`일 때, prog별 결정적 난수로 `hz` 산출 — `r(0)<0.24→0(장기 전체 조망), <0.58→1(중기 구간 관찰), else 2(단기 구간 확대)`. hz별 scale/translate 계산 후 SVG `<g>` transform, `transition:transform 0.9s cubic-bezier(0.3,0.7,0.25,1)` (템플릿 L632), 좌상단 라벨 pill (L641~642).
- **엔진 영상 `vidOn`** (L2847~2849): `screen==='run' && (tier==='custom' ? prog>=32 : (tier==='deep' && prog>=30))`. deep → `assets/engine-deep.mp4`, custom → `assets/engine-apply.mp4` (템플릿 L692/695), `onEnded={vidEnd}` = `endApply`. 캡션 `vidCap`/`vidSub` (L2852~2853).
- **진행률 표기(구간식)** `progPct` (L2874~2878, 주석 원문 L2876): basic = `min(99, (min(5,prog+1)/5)*100)%`; deep/custom = **지표 32개 = 0~94% · 가중치 = 96% · 페르소나 = 98% · `vidOut` = 100%**. `progPhase`: '지표 계산' → '보정 · 가중치' → '보정 · 페르소나' → '완료' (L2880).
- **틱 게이지 `ticks`** (L2858~2867): 32칸 그룹색 — 추세8·모멘텀7·변동성6·거래량5·구조6 (`GRP='tttttttt'+'mmmmmmm'+'vvvvvv'+'qqqqq'+'ssssss'`). deep/custom은 33번째 **가중치 틱(#7b6cff)**, custom은 34번째 **페르소나 틱(#d2a516)** 추가(높이 22px·글로우, 주석 원문 L2864: "33번째 = 가중치(보라), 34번째 = 페르소나(노랑) — 지표 아님").
- 하단 로그 `logLines` (L2882): 평시엔 `IND.slice(prog-3, prog+1)` 슬라이딩 4줄; custom `prog>=32`부턴 '지표 32개 계산 완료 · 1차 예측 확정' + '내 가중치 적용: …(×N 목록 또는 모두 ×1)' + (`pApply && prog>=33`) '페르소나 미세 조정: 답변 N개 표본 반영'.

### 1-8. 종료 — endApply → finishRun

```js
endApply=()=>{clearTimeout(this.v1);clearTimeout(this.v2);clearInterval(this.v4);
  if(this.state.screen!=='run'){this.finishRun();return}
  this.setState({vidOut:1});clearTimeout(this.v3);this.v3=setTimeout(this.finishRun,1250)};  // L2257
```

- 종료 트리거 3종: ① 영상 `onEnded` ② v2 30000ms 타임아웃 ③ 백그라운드 3200ms(bgWatch). 화면에 있으면 `vidOut:1`(영상 페이드아웃 + '분석 완료 100%' doneFlash, 템플릿 L688~) 후 **1250ms** 뒤 finishRun; 이탈 상태면 즉시 finishRun.

```js
finishRun=()=>{this.hap('done');const s=this.state;
  if(s.tier==='deep'||s.tier==='custom'){/* 일일 첫 회 ax_deep/ax_custom → 900ms 후 addXp(5, '(커스텀|심화) 분석 · 오늘 첫 회') */}   // L2259~2260
  const away=s.screen!=='run'&&!s.obFlow;
  const rSym=s.runSym||s.ticker||'NVDA',rTf=s.runTf||s.tf;
  this.setState({screen:away?s.screen:(s.obFlow?'obres':'chart'),ticker:away?s.ticker:rSym,tf:away?s.tf:rTf,
    runLive:0,runDoneN:away?{sym:rSym}:null,runFrom:null,prog:0,
    seg:s.tier==='basic'?'evi':'narr',
    analyzed:Object.assign({},s.analyzed,{[rSym+'|'+rTf]:(s.tier||'basic')}),
    analyzedAt:Object.assign({},s.analyzedAt,{[rSym+'|'+rTf]:Date.now()})});
  if(away)this.flash(rSym+' 분석이 끝났어요 — 아래 카드를 눌러 결과 보기','');
  setTimeout(this.persist,80)};  // L2258~2265
```

- 결과 화면 분기: **away**(이탈 중) → 현재 화면 유지 + `runDoneN:{sym}`(완료 PiP 카드) + 토스트 / **obFlow**(온보딩) → `'obres'` / 평시 → `'chart'`. 결과 세그먼트 초기값: basic은 '근거(evi)', 심화·커스텀은 '해설(narr)'.
- `analyzed[runSym|runTf] = tier` 기록 — **같은 키 재분석은 덮어쓴다**(그날 마지막 1건만 남음, §4-1의 채점 적재 규칙의 근거).

### 1-9. 중단(전액 반환)·실패·재시도·동시 실행 차단

```js
cancelRun=()=>{clearInterval(this.t);clearTimeout(this.stepT);clearTimeout(this.v1);clearTimeout(this.v2);clearTimeout(this.v3);
  const s=this.state;const paid=s.tier==='custom'?3:(s.tier==='deep'?2:0);
  this.setState({screen:(s.runFrom==='yest'?'yest':'chart'),runFrom:null,prog:0,tier:null,deep:false,scoops:s.scoops+paid,sheet:null,runLive:0,runDoneN:null});
  if(paid){this.hap('stop');this.flash('중단했어요. '+paid+'스쿱을 돌려드렸습니다'+(s.runFrom==='yest'?' · 채점 목록으로 돌아왔어요':''),'+'+paid)}
  setTimeout(this.persist,80)};  // L2228~2234
```

- 중단 가능 조건 `runCancelable` (L2914): `(tier==='deep'||tier==='custom') && !runErr` — basic은 중단 UI 없음. `runFrom==='yest'`면 채점 목록으로 복귀.
- `runFail` (L2217~2223): 모든 타이머 해제, `runErr:1`, **전액 반환**, `hap('warn')`, flash. 템플릿 트리거는 데모 전용 버튼(L723, "개발 참조 — 네트워크 오류 상태 미리 보기").
- `runRetry` (L2224~2227): 잔액 부족이면 `sheet:'short'`로 이탈; 충분하면 **재차감** 후 `startRun`. `runErrBack` (L2916): tier 초기화 후 chart 복귀.
- **동시 1건 차단 `guardRun`** (L2235): `runLive`면 `hap('warn')` + flash('분석이 이미 진행 중이에요 — 한 번에 하나만 돌릴 수 있어요') + **`screen:'run'` 강제 복귀** 후 true. 호출 지점 4곳: `runCustom`(L2215)·`pickBasic`·`pickDeep`·`pickCustom`(L2806~2808).
- `skip` (L2846): 즉시 finishRun 하는 바인딩이 정의돼 있으나 **템플릿 어디서도 참조 안 됨**(dead code).

---

## 2. 백그라운드 PiP

### 2-1. 동결과 away 판정

- `startRun`이 `runSym`·`runTf`를 동결(L2238). `finishRun`은 away면 사용자의 현재 ticker/tf를 건드리지 않고 동결본으로만 기록(L2262~2263).
- away 정의: `s.screen!=='run' && !s.obFlow` (L2261). away 완료 시: 화면 유지 + `runDoneN:{sym}` + `flash(sym+' 분석이 끝났어요 — 아래 카드를 눌러 결과 보기')` (L2264). 화면에 있으면 자동으로 chart 전환.

### 2-2. PiP 카드 2종 (템플릿 L1671~1687)

- **진행 카드** `pipRunOn` = `!!st.runLive && st.screen!=='run'` (L2535). 내용: tier 색 점(pulse) + `pipSym pipTier 분석 중 pipPct` + 미니 진행바. `pipPct` (L2540): `tot = custom?34 : deep?33 : 5`, `min(99, round(prog/tot*100))%`.
  - `pipBack` (L2541): `screen:'run'` 복귀 + **ticker/tf를 runSym/runTf로 되돌림**.
- **완료 카드** `pipDoneOn` = `!!st.runDoneN && st.screen!=='run'` (L2536). `pipDoneGo` (L2543): chart 전환 + `runDoneN:null` + ticker=완료 심볼 + `seg:'narr'`.
- 백그라운드 중 대기 단축: §1-6 bgWatch(3200ms).
- 동시 1건 차단 지점 전부: §1-9 `guardRun` 4곳. 그 외 `reset`(L2918)·`runErrBack`(L2916)·`cancelRun`·`runFail`이 `runLive:0`으로 해제.

---

## 3. 스쿱·XP 트랜잭션

### 3-1. 스쿱 이동 지점 전부

| 지점 | 금액 | 줄 | 비고 |
|---|---|---|---|
| 심화 차감 `confirmDeduct` | −2 | L2824 | 1050ms 지연 후, `hap('deduct')` |
| 커스텀 차감 `runCustom` | −3 | L2216 | 24h 내 심화/커스텀 live면 무차감 |
| 재시도 재차감 `runRetry` | −cost | L2226 | cost = custom 3 / deep 2 |
| 중단 반환 `cancelRun` | +paid | L2231 | 전액, `hap('stop')` |
| 실패 반환 `runFail` | +paid | L2220 | 전액, `hap('warn')` |
| 출석 `claimAtt` | +1 | L2274 | `left<=0`일 때만, 이후 `left:21600`(6h), cap 클램프 |
| 광고 `watchAd` | +3 | L2884 | 1400ms 재생 시뮬 후, cap 클램프. **재생 중 재탭 = 중단·무보상**('끝까지 봐야 ◈3 적립'). 적립 2600ms 뒤 `addXp(5,'광고 시청')` |
| 7일 연속 `hsTap` | +5 | L2435 | `strk7>=7`일 때, cap 클램프, 후 `strk7:0`. 미만이면 **데모 분기**(하루 방문 +1 시뮬) |

- **상한 정책 `capNow`** (L2269~2270, 주석 원문 L2269): "기본 15 시작 · 레벨업마다 +2 (게스트 15 고정, Lv.1=15 Lv.2=17 … Lv.5=23)". 코드: `xp=42+state.xp`, 레벨 임계 `[40,70,110,160]` → Lv1~5, cap = `15+(lv-1)*2`. 적립은 항상 `Math.min(this.capNow(), scoops+n)`.
- 잔액 표기: `capacityLine`(L2901) '심화 N번 · 커스텀 N번 · 기본 무제한', `capCells`(L2903), `capNote`(L2904) '가득 참 — 쓰기 전엔 적립 안 돼요'.
- 원장 `ledger`(L2906)는 정적 더미 4건 — 실거래 기록 아님(실개발 시 실제 원장 필요).

### 3-2. 햅틱 `hap` — 패턴 맵 전문

```js
// 햅틱 명세(개발 이관용): deduct 차감 확정 / done 분석 완료 / earn 적립 / warn 부족·에러 / stop 중단 / tick 페르소나 답변   // L2267
hap=(k)=>{try{const P={deduct:[30,40,30],done:[15,30,60],earn:[20],warn:[60,50,60],stop:[25],tick:[12]}[k];if(P&&navigator.vibrate)navigator.vibrate(P)}catch(e){}};  // L2268
```

호출 지점: deduct(L2216·2226·2824), done(L2258·2276 로그인 완료·addXp 레벨업 L2272), earn(L2274·2435·2884·addXp n≥5), warn(L2220·2225·2235·2807·2808·2884 중단), stop(L2232), tick(L2272 게스트/소액·L2276).

### 3-3. XP — `addXp` 전문과 적립 지점

```js
addXp=(n,label)=>{if(!this.state.gLinked){this.hap('tick');this.setState(s=>({xpFx:{v:'경험치 +'+n,t:'구글 로그인하면 쌓여요',k:…,guest:1}}));return}
  this.hap(n>=5?'earn':'tick');const was=this.lvOf(this.state.xp||0);
  this.setState(s=>({xp:(s.xp||0)+n,xpToday:(s.xpToday||0)+n,xpFx:{v:'경험치 +'+n,t:label||'',k:…},hdrXp:(s.hdrXp||0)+n}));
  clearTimeout(this.hx1);this.hx1=setTimeout(()=>this.setState({hdrXp:0}),2600);
  const now=this.lvOf((this.state.xp||0)+n);
  if(now>was){clearTimeout(this.lu1);this.lu1=setTimeout(()=>{this.hap('done');this.setState({lvUp:{from:was,to:now}})},650)}
  setTimeout(this.persist,80)};  // L2272
```

- **게스트는 XP 미적립** — guest 스타일 xpFx 배지('구글 로그인하면 쌓여요')만 뜬다.
- **레벨업 감지**: `lvOf`(L2271, xp+42 기준 임계 [40,70,110,160]) 전후 비교 → **650ms** 뒤 `hap('done')` + `lvUp` 오버레이(`lvUpOn` L2397, 닫기 `lvUpClose` L2273, 캐릭터 진화 `charAt` L2277~2295 — "레벨업마다 진화(개발 시 아트 에셋 교체 지점)"). 헤더 +XP 표시 `hdrXp`는 2600ms 후 소멸.
- **적립 지점 전수**:
  - `visitXp(sc)` (L2211~2213): 게스트 제외. 일일 키 `dayKey()`(L2208) 기준 `dVisit`. **오늘 첫 방문 +5**(450ms 지연) → 이후 `['sig','yest','peers','chart','wallet']` 각 **메뉴 첫 방문 +3**(450ms 지연). `go()`가 매 이동마다 호출(L2214). 부팅 복원 시 1400ms 뒤 `visitXp('dash')`(L2202).
  - `drawXp` (L2209~2210, 주석: "작도 조작 +1XP · 하루 3회 한도"): 작도 토글 시 +1, `dv.dw>=3`이면 무시, 350ms 지연.
  - 페르소나 답변 +1 (L2740, §6-3).
  - 종목 추가 +1 (L2690): `stkXpN<3` 세션 한도.
  - **채점 확인 +5** (L2361): 오늘 만기(today) 항목 첫 펼침, `xpG[k]`로 1회 제한.
  - **시그널 확인 +5** (L2581): '오늘' 신호 첫 펼침(읽음 키 기준).
  - **심화/커스텀 분석 오늘 첫 회 +5** (L2259~2260): `dv.ax_deep`/`dv.ax_custom`, 900ms 지연.
  - 광고 시청 +5 (L2884, 적립 2600ms 후).
- **일일 카운터**: `xpToday`(L2272에서 증가, 부팅 시 날짜 다르면 0 리셋 L2202), 오늘의 미션 목록 `walletMissions`(L2423~2433) — 첫 방문/메뉴 5종 순회/심화 1회/커스텀 1회/페르소나 5답/작도 3회, 각 항목 미완이면 해당 화면으로 이동시키는 `go` 포함. 미션 그리드 `dm3`(L2407)는 안내용(첫 3항목만 화면 이동).

---

## 4. 채점(yest) 로직

### 4-1. 채점 대상 적재 규칙

- 대기(wait) 행 생성 (L2354): `Object.keys(st.analyzed).filter(k2=>st.analyzed[k2]!=='basic')` — **심화·커스텀만 채점 대상, basic 제외**. 키가 `sym|tf`이므로 같은 종목·주기 재분석은 덮어써 **그날 마지막 1건만** 남는다(§1-8).
- 행 필드: `sub = 분석시각(fd) · 커스텀|심화`, `wait:1`, `cdOn: tf==='일'`(카운트다운 노출), 스냅샷 문구에 `st.preset` 포함.
- 데모 채점 완료 3건 `demo` (L2350~2352): NVDA 적중(+1.4%)·MSFT 빗나감(−0.8%, 힌트 보유)·AAPL 주봉 적중.

### 4-2. 만기 D-day

- `res:(tf==='일'?'D-1':(tf==='주'?'D-5':'D-22'))` (L2354) — 일봉 D-1, 주봉 D-5, 월봉 D-22.
- 전역 마감 카운트다운 `gLeft`(초기 27480초, 1s 감쇠 L2202) → `gCd`(L2515)·`HCD`(L2325) 포맷. 주말 안내 `yHolidayOn` (L2899): `getDay()===0||6` → '주말엔 증시 휴장 — 주식은 월요일 아침 채점 · 암호화폐는 매일'.

### 4-3. 필터·검색·페이지네이션

- 카운트 `cnt` (L2356): all/due(만기·`today`)/hit/miss/wait. 필터링 `fl` (L2357): `ySearch`(심볼 일치) → `yFilter`('due'|'hit'|'miss'|'wait').
- 탭 `ySegs` (L2520): 필터 변경 시 `gN:20` 리셋. 검색 `ySearchTog`/`yClear`/`ySugs` (L2516~2519 — 제안 목록은 고정 3종 + analyzed에서 파생). 기간 `yRanges`(7/30/90일, L2521) — **표시 건수 문구만 바뀌는 더미**(L2522, 30일='42건' 등 상수).
- 페이지네이션: `gN` 기본 20, `gLoad` +10 (L2528), 무한 스크롤 `gScrollH`: `scrollHeight-scrollTop-clientHeight<90`이면 +10 (L2529).

### 4-4. 항목 펼침·복기 힌트·재분석

- 펼침 `tog` (L2361): `yOpen[k]` 토글. `fresh = !wait && today && !xpG[k]`면 `xpG` 마킹 + `addXp(5,'채점 확인')`.
- 복기 힌트: `hint` 플래그 항목(MSFT 데모)만. `hintTog`(`gHintOpen[k]` 토글), `hintRows` **고정 5행** (L2359): RSI 다이버전스/거래량 다이버전스/스토캐스틱/ROC 모멘텀/윌리엄스 %R + 설명.
- **`reGo`(복기 CTA — 프리셋 미리 선택)** (L2359):

```js
reGo:()=>{this.setState({ticker:g.sym,tf:g.tf||'일',preset:'모멘텀 중심',tier:null,deep:false,screen:'chart',sheet:'tier',runFrom:'yest'});
  this.flash('모멘텀 중심을 미리 골라뒀어요 · 단계만 고르면 시작합니다','')}
```

- `againGo` (L2360): 프리셋 유지 채 tier 시트만 연다(모르는 심볼이면 NVDA 폴백). `runFrom:'yest'`는 중단 시 채점 목록 복귀에 쓰임(§1-9).

---

## 5. 시그널(sig) 로직

### 5-1. 피드 생성 `sigAll` (L2327~2341)

- 손작성 5건(오늘 4건 + 어제 1건, 각각 `why`(수치 근거)·`mean`(해석)·`stat`(표본 통계) 3단 콘텐츠) + 템플릿 6종(`tpl`) × 24건 자동 생성: `i<10 → '어제'`, 그 외 '그제', 시각 `hh = i<10 ? 18-floor(i/2) : 19-floor((i-10)/2)`, 분 `(i*17+7)%60`. **총 29건 = 3일 보관분**(오늘/어제/그제 — '3일 누적 감지' L2478).

### 5-2. 펼침·읽음·XP

- `sigFeed` (L2578~2581): 검색 필터(`sigSearch`) → `slice(0, sigN||20)`.

```js
tog:()=>{const rk=f.sym+'|'+f.t+'|'+f.title;const fresh=!this.state.sigRead[rk]&&f.t.indexOf('오늘')===0;
  this.setState(s=>({sgOpen:…toggle ix…, sigRead:…[rk]:1…}));if(fresh)this.addXp(5,'시그널 확인')}   // L2581
```

- 펼침과 동시에 **읽음 처리**(키 = `sym|t|title`). '오늘' 신호의 첫 열람만 +5 XP. `go`: 이벤트 전파 차단 후 해당 종목 chart로.
- **페르소나 골드 강조** `psyOn` (L2579): `(st.pQi||0)>0 && (/거래량|급증|모멘텀|돌파|신고가/.test(f.title) || /거래량/.test(f.d))` — 정규식 매칭 더미. 문구 `psyT`: '내 페르소나(거래량·모멘텀 관심)와 맞닿은 신호라 먼저 올렸어요'.
- 배지: `sigBadgeOn` (L2476) = 오늘·미읽음 존재 여부. ⚠️ **`sigTodayN`이 이중 정의됨** — L2475(오늘·미읽음 수)와 L2509(읽음 무관 오늘 전체 수). 객체 리터럴 후자 승 → **배지 숫자는 읽음 처리해도 줄지 않는다**(버그로 판단, 실개발에선 L2475 의도 채택 권장).

### 5-3. 페이지네이션·이탈 초기화

- `sigN` 기본 20, `sigLoad` +10 (L2587), 무한 스크롤 `sigScroll` <90px (L2588). `sigShownN/sigTotalN/sigMore/sigEnd/sigEmptyOn` (L2582~2586).
- **`leftSig`** (L2214, `go()` 내부): `screen==='sig' && sc!=='sig'`면 `sgOpen:{}` — **시그널 화면을 떠날 때 펼침 상태 전량 초기화**(읽음 `sigRead`는 유지).
- 요약 캐러셀 `sgc*` (L2477~2487): 4장(감지 흐름/오늘 요약/종목별/페르소나 연동), 터치 스와이프 임계 40px (L2484), 종목별 집계 `sigSyms`(L2485, 페르소나 매칭분 분리 막대), 타임라인 도트 `sigSum`(L2487, 09:00~16:00 → 1~97% 배치).

---

## 6. 페르소나(pfit)

### 6-1. 질문 은행과 차원

- `QB` 15문 (L2704~2719): 각 답 = `[라벨, 차원 idx, 강도 0~2]`. 차원 `DIMS` = 위험 성향/매매 호흡/보는 근거/지표 깊이/복기 성향 (L2720), 차원별 3단 라벨 `LVS` (L2721). 총 은행 표기 `BANK=500`(더미, L2724).
- 히트맵 `heat[5][3]` (L2722~2723): `pAns.slice(0, pQi)` 누적 — **답을 되돌려도(pBack) pQi까지만 집계**.

### 6-2. 질문 배급 규칙

- `dayMax=5`, `dayN=st.pqDay`, `dayFull = !guest && dayN>=dayMax` (L2728).
- 노출 조건 `pqOn` (L2729): `!done && !gLock && !dayFull && (dayN===0 || !!st.pqPull)` — **하루 첫 답은 자동 노출, 2번째부터는 '질문 하나 더 받기'(`pqPull`, L2730~2731)를 눌러야 다음 문항이 나온다**(풀 방식 배급).
- **게스트 3문 잠금** `gLock = guest && st.pQi>=3` (L2726). 게스트 표기: `pIdx='맛보기 N/3'`, 진행률 3문 기준 (L2735~2737); 홈 카드도 `hpPct` 상한 24%·'맛보기' (L2364~2366).
- 현재 문항 `cur = QB[min(pQi, QB.length-1)]` (L2725), 완주 `done = pQi>=QB.length`.

### 6-3. 답변 저장·이전 답 고치기

```js
pqOpts:cur[1].map((o,j)=>({n:o[0],go:()=>{this.addXp(1,'페르소나');
  this.setState(s=>{const pa=(s.pAns||[]).slice();pa[s.pQi]=j;return{pQi:s.pQi+1,pAns:pa,pAsk:0,dmPq:1,pqDay:(s.pqDay||0)+1,pqPull:0}});
  setTimeout(this.persist,80);if(this.state.pQi+1>=QB.length)this.flash('답변 저장 · 커스텀 분석이 나에게 맞춰집니다','')}}))   // L2740
pBack:()=>{this.setState(s=>({pQi:Math.max(0,s.pQi-1)}));setTimeout(this.persist,80)}   // L2742
```

- **고치기 = 인덱스 후퇴**: `pBack`은 답을 지우지 않고 `pQi`만 −1 — 재답 시 `pa[pQi]=j` 덮어쓰기. 집계는 `slice(0,pQi)`라 후퇴 즉시 반영.

### 6-4. 정밀도 단계·레이더·연동

- 단계표 `LVT` (L2727): `[[0,'첫 스케치'],[4,'윤곽 잡는 중'],[9,'또렷해지는 중'],[16,'정밀'],[31,'초정밀'],[61,'현미경급']]`. 진행률 `pProg` = 구간 내 비율(최소 6%). 홈 카드 대응표 `hpStage`(L2365): 스케치/윤곽/또렷/정밀/초정밀/현미경.
- **레이더 `pHmField`** (L2744~2780): 캐시 키 `pQi|pAns|theme|gLinked`(L2744 — 동일 입력 재생성 방지). 차원값 `val(d) = (heat[d][1]+heat[d][2]*2)/(tot*2)`, 16스포크 보간 + 결정적 노이즈, 정밀도 `prec = min(99, round(totAll/20*100))`. 우측 5차원 게이지: 표본 있으면 우세 라벨 `LVS[d][bi] · ×표본수`, 없으면 '미측정'. 칩 `pHmChips` (L2781~2782): 무표본 = '아직 몰라요'.
- 연동: 커스텀 런 `pApply`(§1-4·1-6), 프리셋 '내 성향' 카드(§1-2), 시그널 골드 강조(§5-2), 시그널 카드 문구 `sigPsyD`(L2410 — 게스트/무답/유답 3분기).

---

## 7. 기타 전역 동작

### 7-1. 온보딩 플로우(obFlow)

- 부팅: `screen:'boot'` → `assets/intro.mp4` `onEnded`/Skip 버튼(템플릿 L1874·1876) → `bootDone` (L2703): boot일 때만 `'landing'`. **localStorage 복원 성공 시(`v.p.length`) boot를 건너뛰고 바로 `'dash'`** (L2202).
- landing → `goPick` (L2623) → pick 화면. `pickChips` (L2624): **`pickArr:[t[0]]` 통째 교체 = 단일 선택**(온보딩에선 종목 1개만).
- `startOnboard` (L2630): `{ticker:pickArr[0], tier:'basic', tf:'일', deep:false, seg:'evi', obFlow:1}` → 콜백에서 `startRun()` — **온보딩 첫 분석은 무료 basic 실주행**. finishRun의 obFlow 분기로 `'obres'` 도착(L2263).
- obres → `obGo2..obGo7` (L2633, 각 `go('obN')` — visitXp 경유) → `obFinish` (L2634): `{screen:'dash', obFlow:0, dashKick+1}` + flash('준비 끝. 내일 아침 채점에서 만나요'). 매 단계 `obSkip` (L2635): pickArr 있으면 dash, 없으면 pick + flash('소개는 헤더 ⓘ에서 다시 볼 수 있어요').

### 7-2. 24h 만료(analyzedAt)

- TTL 상수: `86400000` (L2305). 판정 헬퍼: `vLive(k)` = 존재 && 나이<TTL, `vExp(k)` = 존재 && 나이≥TTL (L2307~2308).
- **부팅 필터** (L2202): 로드 시 `Date.now()-at[k]<86400000`인 것만 `analyzed`로 복원(analyzedAt은 원본 유지 → '만료' 표기 가능).
- 만료 임박: `stStatus`/`stFg`/`stBd` (L2675~2677): 잔여 `<10800000`(3h)이면 amber '곧 만료 — N 남음'. 잔여 표기 `leftH` (L2313): ≥1h는 시간 올림, 미만은 분.
- 매트릭스 셀 노화 (L2506): 나이비 `ag`, `ag<0.33` 글로우, `ag>0.7` `msCellOld` 점멸, 만료 셀은 amber dashed '만료'.

### 7-3. 출석 카운트다운

- 1초 인터벌 (L2202): `document.hidden`이면 감쇠 정지. `left`(초기 8047) / `gLeft`(초기 27480) 동시 감쇠.
- `left===0` → 헤더/지갑 출석 활성(`attReady` L2887, `msAttGlow` 애니 L2889·2891). 헤더 스쿱 탭 `hdrScoopTap` (L2893): `left<=0`이면 `claimAtt`, 아니면 지갑으로. 수령 후 `left:21600`(6h).
- 게스트 칩 문구 분기 `cdChip` (L2886): 게스트 '출석 +1'/풀 카운트다운, 로그인 `−h:mm`.

### 7-4. 테마·글자 크기

- 테마 `thTog` (L2802): `theme` 토글 + `document.body.setAttribute('data-th', nt)` + persist. 부팅 복원 시에도 data-th 세팅(L2202). 라이트/다크 팔레트 상수 세트 L2300.
- 글자 크기 `fz` (L2796~2801): `fzZoom` 1.12 배율 + 폭 `367px` 환산(`411/1.12`), `fzSmall`/`fzLarge`는 idempotent(같은 값이면 무시), flash 안내. persist 대상.

### 7-5. 스켈레톤·토스트·시트 제스처

- **스켈레톤**: `go()` (L2214) — heavy 화면(`dash·sig·yest·peers·chart`)으로 "다른 화면에서" 이동할 때만 `skel:1` → **180ms** 후 해제. 템플릿 shimmer `msSkelMove 1.1s` + 요소별 `animation-delay 0.08~0.32s` (L1849~1860). ⚠️ 브리프에 언급된 **430ms 값은 소스에 존재하지 않는다**(grep 0건) — 180ms 단일.
- **토스트 `flash(txt, d)`** (L2296): `pulse`+`delta`(±금액)+`toast` 동시 세팅. 지속: **음수(차감) 3200ms / 그 외 1800ms**. 차감이면 `deltaNeg` → 적색 배경(`snackBg` L2648)·`msShakeX 0.5s`(L2655). 하단 오프셋 `snackB` (L2647): 탭바 있는 화면 99px, 그 외 20px.
- **바텀시트 드래그 닫기** `shTS/shTM/shTE` (L2681~2683): 터치 시작 시 내부 스크롤 컨테이너 탐색(overflowY auto/scroll && 실스크롤 존재), 컨테이너가 scrollTop>1이면 드래그 무시, 아래로 **90px 초과** 드래그 후 놓으면 `sheet:null`. 복귀 스프링 `transform 0.34s cubic-bezier(0.32,1.28,0.42,1)` (L2680).
- FAB 숨김 `chScroll` (L2685): 스크롤 다운 && `scrollTop>140` → `fabHide` → `translateY(140px)` (L2684).
- 차트 줌/팬: `chZoomIn/Out` 0.5 스텝, 1~3배 (L2461~2462); 팬 드래그 배율 1.15, 범위 `0~411*(z-1)` (L2463~2465).

### 7-6. 종목 관리 한도

- 추가 (L2690): 최대 **12개**('하나를 빼고 추가하세요'), 일 변경 한도 **6회**(`stkOpN`, 추가·삭제 공용 — `rmStock` L2204도 동일 검사), 추가 XP는 세션 3회(`stkXpN`). ⚠️ `stkOpN`·`stkXpN`은 **persist 안 되고 날짜 리셋 로직도 없다** — '내일 초기화' 문구는 실개발에서 구현 필요.
- 대시보드 stale (L2326): `dashPicks`(마지막 집계 시점 목록)와 현재 `pickArr` 불일치 시 흐림(`dashDim 0.3`) + `dashRefresh` (L2468)로 재계산.

### 7-7. 데모 전용 트리거 (프로덕션 제거 대상 목록)

| 트리거 | 위치 | 동작 |
|---|---|---|
| '데모: 출석 5초로' | 템플릿 L2004 → `fast5` L2895 | `left:5` 강제 |
| '개발 참조 — 네트워크 오류 상태 미리 보기' | 템플릿 L723 → `runFail` L2217 | 실행 중 에러 상태 재현(runCancelable 구간에만 노출) |
| 7일 연속 스트릭 데모 분기 | `hsTap` L2435 | `strk7<7`이면 탭마다 +1일 시뮬('데모: 하루 방문 추가') |
| `reset` | L2918 (about 시트) | localStorage 소거 + 전상태 초기화 → boot |
| `gLogin` 시뮬 | L2276 | 1100ms 가짜 OAuth('실서비스: OAuth 창' 주석 L2275), 게스트 기록 이관 문구 |
| `watchAd` 시뮬 | L2884 | 1400ms 가짜 재생(실서비스는 리워드 광고 SDK) |
| `withdrawTap` | L2795 | flash 문구만('실제 앱에서는 확인 절차 후…') |
| 부팅 Skip 버튼 | L1876 | 유지 여부 판단 필요(UX상 존치 가능) |
| `skip` 바인딩 | L2846 | **미사용 dead code** |
| `wstep` 웹분석 위젯 | L2136 초기 0, `webArc/webSteps/webLog` L2638~2640 | **wstep을 바꾸는 코드가 없다** — 0단계 고정 정지 위젯(미완 흔적) |
| `mode:'sim'` | L2136 | 참조처 없음(dead state) |

---

## 8. 지침서와 어긋나거나 미묘한 것 (요약)

1. **스켈레톤 430ms 부재** — 소스엔 180ms 단일(§7-5). 브리프의 430ms는 이 파일에 근거 없음.
2. **원뿔 페이드인은 29 고정이 아니라 `basic?4:29`** (L2448) — basic 5지표 런도 원뿔이 뜬다.
3. **커스텀만 24h 재분석 무료**(`runCustom` live 분기, L2215) — 심화(confirmDeduct)에는 같은 규칙이 없다. 실개발 시 정책 통일 여부 결정 필요.
4. **`sigTodayN` 이중 정의 버그** (L2475 vs L2509) — 후자 승, 배지 숫자가 읽음 처리에 반응하지 않음.
5. **종목 변경 6회/일·XP 일일 한도 일부가 비영속**(`stkOpN`·`stkXpN`·`pqDay`·`strk7` 미persist) — '내일 초기화' 문구와 실코드 불일치.
6. **페르소나 질문은 풀 배급**: 하루 첫 답만 자동, 이후 '질문 하나 더 받기' 버튼 필요(L2729~2731) — 연타 5답 UI가 아니다.
7. **guardRun은 차단 + run 화면 강제 이동**까지 한다(L2235) — 단순 토스트가 아님.
8. `skip`·`mode:'sim'`·`wstep` 등 dead/미완 코드 존재(§7-7).
