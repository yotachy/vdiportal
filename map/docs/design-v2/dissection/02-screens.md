# 02 — 화면·내비게이션·마크업 구조 전수 조사

대상: `docs/design-v2/raw/handoff-1/MoneyScoop 체험 프로토타입.dc.html` (2,924줄)
구조: L9–2133 `<x-dc>` 템플릿(L10–69 helmet CSS 포함) + L2134–2922 `<script type="text/x-dc">` React 유사 로직(`class Component extends DCLogic`).
바인딩 문법: `{{ key }}` 값 주입, `<sc-if value="{{ flag }}">` 조건, `<sc-for list="{{ arr }}" as="x">` 반복, `onClick`/`onScroll`/`onTouchStart` 등 핸들러도 `{{ fn }}` 주입, `style-active="…"`는 프레스 상태 스타일. 모든 `renderVals()`(L2298–2920)의 반환 키가 템플릿에 주입된다.

---

## 1. 화면 인벤토리 (`state.screen`)

초기값 `screen:'boot'` (L2136). `componentDidMount`(L2202)가 localStorage `ms_proto_v1` 복원 성공 시(종목 보유) 곧장 `'dash'`로 점프.

| screen 값 | 화면 | 템플릿 줄 범위 | 진입 경로 (로직 줄) |
|---|---|---|---|
| `boot` | 부팅 인트로 비디오(`assets/intro.mp4`, Skip 버튼) | L1872–1879 | 초기값. `bootDone`→`landing` (L2703). `reset`→boot (L2918) |
| `landing` | 랜딩(로고·가치제안 4카드·₩0·시작하기) | L108–149 | boot 종료, 종목 0개일 때 홈 탭 (L2597) |
| `pick` | 첫 종목 고르기 (1/7) | L151–172 | `goPick` (L2623), `obSkip`(종목 없을 때, L2635) |
| `obres` | 온보딩 1/7 — 첫 분석 결과 | L174–200 | `startOnboard`(L2630)→basic `startRun`→`finishRun`이 `obFlow`면 obres (L2263) |
| `ob2`~`ob7` | 온보딩 2/7 시그널 · 3/7 분석 · 4/7 채점 · 5/7 페르소나 · 6/7 통계 · 7/7 무료 | ob2 L202–219 · ob3 L221–238 · ob4 L240–257 · ob5 L259–281 · ob6 L283–301 · ob7 L303–329 | `obGo2..7` (L2633). `obFinish`→dash (L2634), 각 화면 `obSkip` (L2635) |
| `chart` | 분석 리포트(차트+판정+4세그먼트) | L333–624 | 탭 `tabGoChart`(L2598), 시그널 `f.go`(L2581), 관심종목 카드(L2618), 분석현황 셀(L2506), stocks 시트(L2689/2693), 채점 `reGo`/`againGo`(L2359–2360), `finishRun`(L2263), `pipDoneGo`(L2543), `pfitClose`(L2838) |
| `run` | 분석 실행(엔진 라이브 뷰) | L626–727 | `startRun` (L2236–2256; pickBasic L2806 · confirmDeduct L2824 · runCustom L2215 경유), `guardRun`(L2235), `pipBack`(L2541) |
| `mix` | 커스텀 지표 비중 조절 | L729–776 | `confirmDeduct`(custom일 때, L2824), `chipTap`(custom 완료 상태, L2843) |
| `pfit` | 페르소나 반영 확인 | L778–807 | `startFromMix` (L2835). `backToMix`→mix (L2837) |
| `yest` | 채점(어제의 판정) | L995–1226 | 탭 `goYest`(L2917), 대시 히어로 3번째 카드(L1392), `cancelRun`(runFrom==='yest', L2231) |
| `sig` | 시그널 피드 | L1228–1368 | 탭 `goSig`(L2572), 대시 히어로 2번째 카드(L1383) |
| `peers` | 통계(함께 보는 머니스쿱) | L809–993 | 탭 `goPeers`(L2555), 페르소나 카드 "통계 보기 →"(L1577) |
| `dash` | 홈(오늘의 종목 스쿱) | L1370–1629 | `tabGoHome`(L2597: 종목 있으면 dash, 없으면 landing; 같은 화면 재탭=`dashKick` 새로고침), `obFinish`, `scrollPersona`(L2207) |
| `wallet` | 내 스쿱 (화면이지만 오버레이형 — 헤더/탭바 유지) | L1924–2056 (`sWallet`) | `openWallet`(L2803), `lvTap`(L2384), `hdrScoopTap`(L2893), `acctTap`(연결 시, L2561), 탭바 6번째 |

내비 핵심 함수 `go(sc)` (L2214): `visitXp` 호출 → heavy 화면(dash·sig·yest·peers·chart) 전환 시 `skel:1` 180ms 스켈레톤 → `sheet:null`로 시트 자동 닫힘 → sig 이탈 시 `sgOpen` 초기화.
분석 흐름 전이 요약: `chart →(FAB startSim L2637)→ sheet:tier →(pickDeep/pickCustom L2807–2808)→ sheet:preset →(confirmDeduct L2824)→ [deep: sheet:deduct 1.05s→startRun] / [custom: screen:mix →(startFromMix)→ pfit →(pfitYes/pfitNo L2841–2842)→ runCustom(deduct)→startRun] → run → finishRun → chart(seg:'narr')`. run 중 이탈하면 PiP 미니카드, 완료 시 runDoneN 카드(§3). `cancelRun`(L2228)은 스쿱 전액 반환 후 chart(또는 yest) 복귀.

---

## 2. 각 화면의 섹션 구조 (위→아래 순서, 소비 renderVals 키)

### landing (L108–149)
1. 로고 궤도 애니메이션(듀얼 dasharray 원 + 76px 로고) L112–118
2. 워드마크 "머니스쿱" + "스쿱 엔진" 그라디언트 타이틀 L119–123
3. 2×2 가치 카드(시그널 알림·3단계 분석·아침 자동 채점·열린 통계) L124–141
4. `₩0 전부 무료 · 광고로 운영 · 결제 없음` L142
5. CTA `시작하기`(`goPick`) + "가입 선물 ◈15" L144–147

### pick (L151–172)
타이틀 → 종목 칩 `pickChips`(단일 선택, L2624: `pickArr:[t[0]]` — **1개만 담김**) → 가입 선물 박스 → CTA `startOnboard`(`pickCta/pickCtaBg/pickCtaFg/pickCtaSub/pickCtaShadow`) → "1 / 7" 카운터.

### 온보딩 obres·ob2~ob7 (공통 골격)
상단 배지 `N / 7 · 주제` + 큰 타이틀 + 설명 → 예시 카드 1개 → 하단 고정 CTA(`bottom:45px`, 그라디언트 페이드 배경) + `건너뛰고 바로 시작`(`obSkip`). ob7만 skip 없음(L327). 예시 카드: obres=분석 결과 카드(`tk.sym`, 홈에 저장됨, L180–194) / ob2=시그널 3행 / ob3=기본·심화·커스텀 3단 카드 / ob4=채점 3행 / ob5=페르소나 정밀도+태그칩 / ob6=주간 막대+62.4% / ob7=스쿱·레벨·페르소나 3개념+적립 칩 4종.

### dash (L1370–1629) — `key={{ dashKick }}`로 강제 리렌더
1. 헤더행 "오늘의 종목 스쿱" + `dashMeta` L1372
2. **히어로 3카드** L1373–1401: ①오늘의 관심종목(`heroAvg/heroAvgC/heroUp/heroDn/heroUpW/heroDnW/heroTop/heroTopC`) ②오늘의 시그널(`sigTodayN/sigLastLine`, `goSig`) ③오늘의 채점(`heroDueN/heroWaitN/heroCd` 카운트다운, `goYest`)
3. **주간 분석 + 연속 방문** 2분할 카드 L1402–1423: `hwBars`(7일 막대)/`hwLine`, `hsN/hsDots/hsBg/hsCta/hsCtaC/hsTap`
4. **레벨 카드** L1425–1498: 궤도 SVG 장식(`lvRingD/lvRing2D`) + 캐릭터(`lvOn`: `charNode/charName/charBand/lvAuraC/lvAc`) 또는 잠김(`lvLocked`: ??? + 구글 CTA `gLink`) + 레벨 정보(`lvN/lvName/lvPct/lvNext`) + 페르소나 게이지(`hpPct/hpStage`, `goPersonaCardStop`) + 경험치 TIP 무한 마퀴(`dm3` 2회 반복 렌더 L1487–1492, `dm3R/dm3C`)
5. **내 관심 종목** L1499–1532: 헤더+`myCount`+추가 버튼(`openStocks`) → 2열 그리드 `myCards`(sym, `slots` 일/주/월 분석 배지, price/chg, 삭제 X) 또는 빈 상태(`noMy`)
6. **분석 현황** L1533–1563: 접힘(`anaFoldOn`, `anaSum`) / 펼침(`anaMxOn`): 종목×(일봉/주봉/월봉) 매트릭스 `anaMx`(셀 = 등급명·만료·—, 신선도 glow/점멸, 클릭→chart) + 범례 "24시간이 지나면 자동 폐기"
7. (`noMy`일 때 보조 빈 상태 카드 L1565–1571)
8. **페르소나 카드** `#msPersonaCard` L1572–1619: 골드 헤더+진행(`pIdx/pProg/pProgLv/pProgNote`)+통계 보기 링크 → 레이더 히트맵 `pHmField`(React SVG, L2744–2780) + `pHmChips` → 질문 UI(`pqOn`: `pqT/pqOpts`, 이전 답 고치기 `pBack`) / 하나 더 받기(`pqPullOn`) / 오늘 몫 완료(`pDayFull`) / 게스트 3문 잠금(`pGLock` — 구글 연결 CTA) / 완료(`pDone`, `pFootNote`)
9. 시세 지연 고지 + 면책 푸터(`openAbout`) L1620–1627

### sig (L1228–1368)
1. 헤더 "시그널 오늘 N건 · 3일 보관 N/N"(`sigTodayN/sigShownN/sigTotalN`) L1230
2. **스와이프 요약 카드**(4페이지, `sgcI`) L1231–1300: 제목/부제/배지(`sgcTitle/sgcSub/sgcBadge/sgcBadgeC`), 터치 스와이프(`sgcTS/sgcTE`), 페이지 ①시간대 막대 `sigHours`(페르소나 골드 스택) ②유형 분포 스택바+타임라인 점 `sigSum` ③종목별 누적 `sigSyms` ④시그널×페르소나 안내(`sigPsyD/sigPsyCta/sigPsyGo`) + 도트 `sgcDots`
3. 종목 검색 바 + 서제스트 드롭다운(`sgSel/sgNoSel/sgSOpenF/sgSugs/sgSearch/sgClear`) L1301–1323
4. 빈 상태(`sigEmptyOn`) L1324–1329
5. **피드 카드** `sigFeed` L1330–1359: 헤더행(dot 색=유형, sym, title, 시각, 카릿) → 요약 `f.d` → 펼침(`f.open`): 감지/해석/과거에는(+페르소나 `f.psyOn/f.psyT`) 4행 + CTA "이 종목 분석하기"(`f.go`→chart)
6. 더 보기/끝(`sigMore/sigLoad/sigEnd`, 무한 스크롤 `sigScroll`) L1360–1365 → 푸시 준비 중 안내 L1366

### chart (L333–624) — §5에서 상세

### run (L626–727) — §5 하단 참조

### mix (L729–776)
상단 미니 차트(148px, 비중 변화가 `p2dy`·`mixMaW/mixMaO/mixBolO`로 즉시 반영, 2차선 라벨 `p2label`) L731–746 → 시트: 헤더(뒤로 `mixBack`, 닫기 `pfitClose`) → 안내행("0 = 제외 · ×3 = 세 배") → **7행 슬라이더** `mixRows`(체크박스+▲▼ 부호+이름+range 0~3 step0.5+배율, L2826–2828; 대상 7지표는 `state.wts` L2136, 부호는 `MIXSIGN` L2137) → "나머지 25개는 ×1" → CTA `startFromMix` "이 조합으로 계속 →".

### pfit (L778–807)
딤 배경 오버레이(z-6) → 시트: 헤더 "내 페르소나도 추가 적용"(`backToMix`/`pfitClose`) → 페르소나 히트맵 `pHmField` 재사용 → 설명 → `pHmChips` → 빈 상태(`pfitEmpty`) → CTA 2개: 골드 `pfitYes`(페르소나 반영, `pApply:1`) / 아웃라인 `pfitNo` — 둘 다 `runCustom`으로.

### yest (L995–1226)
1. 타이틀 "채점" + 주말 휴장 안내(`yHolidayOn/yHolidayText`) + 채점 규칙 설명 L997–1004
2. **스와이프 요약 카드**(4페이지 `ycI`, `ycTitle/ycSub/ycBadge/ycBadgeC/ycDots/ycTS/ycTE`) L1005–1091: ①오늘 만기/적중/빗나감/대기 4스탯(`ycDue/ycHit/ycMiss/ycWait`)+비율 스택바(`ycWHit/ycWMiss/ycWWait`) ②누적 링 58%+주별 막대(`gSum`, 기준선 60.96% 점선) ③주기별 적중률(`ycTf`, 일/주/월 + 기준선) ④최근 14일(`day14` 적중/빗나감 스택) — 하단 "보정 없는 원본 기록" 고지
3. 필터 세그 `ySegs`(전체/오늘 만기/적중/빗나감/진행 중 + 건수, 밑줄형) L1092–1100 + "기본 분석은 기록 안 함" 고지
4. 종목 검색(`ySel/ySOpenF/ySugs/ySearchTog/yClear`) L1103–1125 + 기간 칩 `yRanges`(7/30/90일, `rgNote`) L1126–1129
5. **채점 목록** `gRows`(GD 로직 L2348–2361) L1131–1209: 행 = sym+「오늘 채점」펄스 배지+TF 배지+티어 점+sub / 중앙 예측●-실제┃ 게이지(`q.pp/q.ap`) / 결과(`q.res`)+카운트다운(`q.cdOn`+`gCd`) / 카릿. 펼침(`q.open`): 스냅샷 문장 → `q.big`이면 대형 회고 차트 SVG(`yst.*` L1156–1165)+칩+적중 3지표 → `q.hint`면 빗나감 복기(하락 의견 5개 접이 `q.hintRows`+재분석 CTA `q.reGo`) → `q.wait` 안내 → 적중 환급 배너(`q.rebOn`) → "다시 분석하기"(`q.againGo`)
6. 더 보기(`gMore/gLoad`, 스크롤 `gScrollH`)/끝(`gEnd`)/빈 목록(`gEmptyOn`) → 90일 보관 고지 → 누적 성적 요약 문장 L1220 → 면책 푸터

### peers (L809–993)
1. 타이틀 "함께 보는 머니스쿱 · 익명 통계" L811
2. **엔진 스와이프 카드**(4페이지 `engI`, `engTitle/engSub/engBadge/engS0..3/engDots/engTS/engTE`) L815–864: ①사용량 막대 `peer.trend` ②백테스트 링 62.6% ③학습 막대 `engLearn` ④가동/누적/버전 3스탯
3. 최다 분석 종목 `peer.tops`(HOT·내 관심 배지) L865–877
4. 성향 파이 3종 `pvPies`(SVG 도넛, L2546–2553) L878–901
5. 가중치 수정 톱5 `wtsTop`(중앙 기준 다이버징 바) L902–920
6. 잘 맞는 관점 `styleFit`(+기준선 60.96%) L921–939
7. 리더보드 3종: 적중 `peer.leads` / 다작 `peer.vols` / 레벨 `lvBoard` + 나의 적중률(`peer.meHit/meRank`) L940–986
8. 집계 고지 + 면책 푸터 L987–991

### wallet (L1924–2056) — `top:102px;bottom:87px` 오버레이(헤더·탭바 노출 유지)
1. 타이틀 "내 스쿱" → 3개념 표(스쿱/레벨/페르소나) L1928–1947
2. 레벨 카드: 잠김(`lvLocked` 구글 CTA) L1949–1958 / 연결(`lvOn`): 레벨 정보+`lvCap/lvPerk`+**오늘의 미션** `walletMissions`(6행, L2423–2433: 첫 방문·메뉴 둘러보기·심화·커스텀·페르소나·작도) + 캐릭터 L1959–1997
3. 스쿱 잔고: 큰 숫자+`scoopCap/capNote`+데모 버튼 `fast5` → 상한 셀 `capCells` → 출석 카드(`claimAtt/attTitle/attRight/attBd/attBg/attAn/attClock`) → 광고 버튼(`watchAd/adLabel`) L1999–2016
4. 계정·설정: 구글 행(`gAcctTitle/gAcctSub/gAcctBtn`, `gLink`=연결/로그아웃 토글) → 알림 토글(`setNotiTog/setNotiBg/setNotiX`) → 테마 토글(`thTog/thLabel`) → 글자 크기(`fzSmall/fzLarge`) → 앱 버전 → 초기화(`reset`) → 회원 탈퇴(`withdrawTap`) L2018–2054

---

## 3. 공통 크롬

- **디바이스 프레임** L70–71: 중앙 `width:{{ fzW }}`(411px, 글자 크게 시 367px) + `zoom:{{ fzZoom }}`(1/1.12). 배경 radial 보라 글로우.
- **상태바** L73: `9:41 / 5G · 93%`, `visibility:{{ chromeVis }}` — boot에서만 hidden (L2700).
- **헤더** L75–104 (58px, 하단 1px 보더): ①로고 SVG+워드마크(`tabGoHome`) ②ⓘ(`openAbout`) ③우측 `종목` 캡슐(`openStocks`, 축소 시 라벨 숨김 `fzLbl`) ④스쿱 캡슐 — 펄스 상태(L85–87, `pulse/pulseFg/pulseBg/pulseGlow/pulseShake` + `delta` 플로트업)와 평시(L88–94, `hdrScoopTap`: 출석 도착 시 즉시 수령, 아니면 wallet행, 카운트다운 칩 `cdChip`) 두 벌; 내부에 LV 미니 배지+게이지(`hdrLvOn/lvN/lvPct`)와 `+XP` 팝(`hdrXpOn/hdrXpV2`) ⑤계정(`acctTap`: 연결=이니셜 아바타 `acctInitial`, 게스트=점선 원+구글 G, L95–102).
- **하단 탭바** L1642–1669: `showTabs` = dash·chart·yest·sig·peers·pfit·mix·wallet·run (L2534). **6칸**: 홈/시그널(배지 `sigTodayN`, `sigBadgeOn`)/분석/채점(배지 `3` 하드코딩 L1657)/통계/내 스쿱(`◈ {{ scoops }}`, 라벨만 있고 활성 pill 없음). 활성 = pill 배경 `rgba(123,108,255,0.14)`+`T_AC` 색+굵기 700 (`tHomeP/C/W` 등 L2589–2596).
- **FAB** L1633–1640: `fabOn` = chart && !sheet (L2532). 라벨 `fabLabel`(분석하기/다시 분석, L2533), `startSim`→sheet tier. 스크롤 다운 시 `fabShift` translateY(140px) 숨김(`chScroll` L2685).
- **PiP 미니카드**: 실행 중(L1671–1680, `pipRunOn`=runLive&&screen≠run): 점멸 도트+`pipSym/pipTier/pipPct`+미니 진행바, 클릭 `pipBack`→run. 완료(L1681–1686, `pipDoneOn`=runDoneN&&screen≠run): ✓+"분석 완료 — 결과 보기", `pipDoneGo`→chart(seg narr).
- **XP 팝업** L1687 `{{ xpFxNode }}`: renderVals가 React 요소 직접 생성(L2395). 게스트는 회색 점선("구글 로그인하면 쌓여요").
- **레벨업 오버레이** L1688–1711 (`lvUpOn`): 풀스크린 딤+블러, 카드에 구캐릭터→신캐릭터(`lvUpCharOld/New`, `charAt` L2278–2295 저폴리 SVG 5단계), 혜택 배지 `lvUpPerk`, 탭 닫기 `lvUpClose`.
- **토스트(스낵바)** L1712–1714: `toast/toastText`, `msSnack` 2.4s 자동 소멸(`flash` L2296), 위치 `snackB`(탭 화면 99px/그 외 20px, L2647), 감액 시 적색 변형(`snackBg/snackDot`, deltaNeg).
- **시트 딤** L1716–1718: `sheetOn` = sheet && sheet≠'deduct' (L2679). `bottom:{{ sheetB }}`(탭 화면 88px — 탭바는 딤 밖, L2686).
- **스켈레톤** L1849–1862 (`skelOn`): bg0 전면 + 6블록 shimmer(`skBg` 테마별, `msSkelMove`), heavy 화면 전환 시 180ms (L2214).
- **온보딩 매니페스토 바** L1864–1870 (`obManiOn` = landing·pick·ob* L2632): 하단 고정 "MANIFESTO · 만든 사람의 변" → `openAbout`.
- **코치마크** L425–430 (`coachOn` = chart && 분석완료 && !coachDone && !sheet, L2558): 손가락 SVG+"눌러서 직접 꺼보세요" `msPoke` 애니 — 작도 칩을 가리킴. `openDraws` 시 `coachDone:1`(L2601).

---

## 4. 시트/오버레이 전수 (`state.sheet`)

시트 공통: `bottom:{{ sheetB }}`, 상단 드래그 핸들(38×4px), `msSheetUp` 등장, `onTouchStart/Move/End={{ shTS/shTM/shTE }}` 아래로 90px 초과 드래그 시 닫힘(L2681–2683, 내부 스크롤 요소 감지 포함), `closeSheet`(L2803).

| sheet 값 | 템플릿 | 내용 구조 |
|---|---|---|
| `tier` | L1720–1743 | 헤더 "얼마나 깊이 볼까요" + 잔고 캡슐 → `capacityLine` → 기본(무료·무제한, `pickBasic`) / 심화(◈2, `pickDeep`, 부족 시 `deepHint`) / 커스텀(◈3 골드, `pickCustom`, `custHint`) 3카드 → "차감은 마지막 확인에서 한 번뿐" |
| `preset` | L1745–1815 (top:26px 고정 시트) | 헤더 "어떤 스타일로 볼까요?"+티어 배지(`tierLabel/tierBadgeBg/Fg`, 뒤로 `backToTier`) → **스타일 추천 3장** `presetTop`(전체 종합=표준/추세 중심=요즘 잘 맞음/내 성향(페르소나 유무 분기), 라디오형 L1764–1775) → "9가지 스타일 직접 고르기" 접이(`presetMoreOn/presetMoreTog`) → 카테고리 범례 5색 → **9프리셋 2열 그리드** `presets`(이름+포커스+5분할 비중 스택바 `p.segs`, 데이터 `P`/`PROF` L2139–2141) → 하단 고정 CTA `confirmDeduct`("{{preset}}으로 {{tierLabel}} 분석" + `ctaCost`) + 잔고 예고 |
| `deduct` | L1817–1829 | 중앙 모달(딤 자체 포함, sheetOn 제외): `◈ N`(취소선) → `◈ N-cost`(글로우) + 문구. 1.05s 후 로직이 자동 진행(L2216/2824) |
| `short` | L1831–1847 | 스쿱 부족: 현재 판정 요약(`sheetVNote`) → "{{tk.sym}}에서 지금 못 보고 있는 것" 4항목 → 광고 보기(`watchAd`, +3스쿱+5XP)/출석 카운트다운(`countdown`)/기본 분석으로 계속(`pickBasic`) |
| `about` | L1881–1918 (max-height:72%) | 머니스쿱 소개: MANIFESTO+CERTIFIED WEIRDO 배지 → 만든 사람의 변 → 엔진 이미지(`assets/manifesto-engine-v2.png`) → "엔진은 이렇게 일합니다" 4단계 → 운영 방식 → 면책사항 → Contact → © |
| `draws` | L2058–2081 (max-height:58%) | **작도 토글 시트**: 헤더 "차트에 그릴 작도"+`drawsCnt`+모두 켜기/끄기(`drawsAllOn/Off`) → 2열 그리드 `drawsList`(색 스와치+지표명+✓/－, 토글 시 `indOff` 갱신+`drawXp`) → ● 안내 |
| `stocks` | L2083–2128 (max-height:76%) | 담아둔 종목: 헤더 `myCount`/12 → 빈 상태(`myEmpty`) → 내 종목 행 `myStocks`(보는 중/분석됨 배지, 삭제) → 구분띠 → **종목 추가**: 검색 input(`stkInput`) → 12개 만석(`myFull`)/결과 없음(`stkNoResult`)/유휴 안내(`stkIdle`) → 후보 행 `moreStocks`(추가만 `r.add` / 바로 분석 → `r.go`) |

- `sMenu`(L2697 계산)는 **템플릿에 대응 블록이 없다 — 죽은 키**.
- `wallet`은 sheet가 아니라 screen이지만 시트형 UI(§2).
- run 화면이 아닌 곳의 `sStocks`는 run·mix에서 강제 비표시(L2686).
- 레벨업 오버레이·XP팝·토스트·스켈레톤은 §3 참조.

---

## 5. 차트 영역 상세 (chart L333–624, run L626–727)

### 차트 화면 상단
- 서브헤더 L335–340: ← `goHome` / `tk.sym·tk.name·▾`(모두 `openStocks`) / 우측 `tk.price`+`tk.chg`.
- 워치리스트 칩 마퀴 L341–348: `swChips2`(5개 초과 시 배열 2배 복제 L2620 + `marqAnim` = `msMarq N s linear infinite` L2621), 우측 고정 ＋버튼.
- TF 세그 L349–356: 일/주/월(`tfD/tfW/tfM`), 각 탭에 분석 티어색 도트(`tfMkD/W/M`, L2674). 우측 상태 칩 `stStatus/stFg/stBd/stDash`(미확정 점선 / N시간 남음 / 곧 만료 앰버, L2675–2678), `chipTap`(L2843: 미분석→tier 시트, 커스텀→mix).

### 차트 캔버스 (SVG, L357–392)
`viewBox="0 0 411 411" height=396`, 루트 `g transform={{ chT }}`(줌·팬, L2459 — 단 `chZoomIn/Out` 버튼은 템플릿 미사용, 팬 제스처만 L2463–2466 · 오버레이 div L393).
레이어 순서(아래→위):
1. 가로 격자 4줄(`stroke:#171b23` 하드코딩 — 라이트 모드는 helmet의 속성 선택자 L51로 뒤집음)
2. `isDeep`일 때 심화 작도 L361–372: 일목 구름 `ch.cloud`(`dwCloud`) / 피보 0.618·0.382 점선(`dwFib`) / 회귀채널 `ch.chU/chD`(`dwCh`) / 내부 콘 `ch.cin` / 신뢰 레일 `ch.rail`(`dwRail`) / 슈퍼트렌드 녹색선(고정 path) / 앰버 S·R 2줄 / 보라 점선 피벗 3줄 / Gann 대각 2줄 — `dw*` 플래그는 draws 시트의 지표→작도그룹 매핑(`indG` L2603)에서 유도(L2609–2610)
3. 예측 콘 `ch.cone`(`tierAny`, `coneFill` deep=보라/basic=회색, `msConePulse`) L374
4. 볼린저 `ch.bu/bd`(`dwBoll`) · MA `ch.ma1`(`dwMa`) L375–376
5. 캔들: 심지 `ch.wk`(#465061) + 양봉 `ch.ub`(#2ed9a0) + 음봉 `ch.db`(#ff5c7a) L377–379
6. **예측선 1차** L380–384: `ch.p1a` 2회 — 헤일로(width 6, opacity .14) + 본선(width 1.9, `predDash`, `msPredPulse`) / 후반부 `ch.p1b`(dasharray 1.5 4.5 — 점점 성김)
7. **2차** L385–387(`p2Show` = chart && (custom|deep) && !drawOff.p2, L2611): `g translate(0 {{ p2dy }})`에 1차 path 재사용, #22d3ee, 다른 dash·위상
8. **3차** L388–390(`p3Show` = custom 한정, L2612): `p3dy`(2차±16), #f472b6

차트 위 오버레이:
- 포인터 캡처 div L393(`chDown/chMove/chUp`, `touch-action:pan-y`)
- **예측선 범례** L394–402(`p2Show`일 때 우하단): `1차 종합`(predColor)/`2차 반대 시나리오`(#22d3ee)/`3차 가중치·페르소나`(#f472b6, p3Show)
- 분석 전 배지 L403–405(`isPreview`)
- 심화 주석 배지 L406–411("슈퍼트렌드 · 상승"/"MA 정배열" — 고정 텍스트)
- **작도 칩** L412–424(`showDrawChip`): 3색 미니 라인 + `drawChip`("작도 N/32") + "지표별 보기·숨기기" + 카릿, `msRing` 펄스, `openDraws`
- 코치마크 L425–430(§3)
- **신뢰지평 배지** L431–433(`isDeep`, 우하단): "신뢰지평 · 멀어질수록 확률 낮아짐"

### 판정·세그먼트 (L436–622)
- 판정 블록 L436–482: 스윕 하이라이트(`tierAny`) → `verdict/vColor`(msVerdictPop) + deep 시 `agree/agreePct` + 가격 → **확률 바**(▼`down`/▲`up`, `upPct` 채움 + 60.96% 시장 평균 세로 마커 L452, 고정 60.96%) → 국면 칩(`regime` + "지지 반등 기회 [검증됨]") → `oneLine/plainLine` + 예상 범위 `range`/목표 `target` → 분석 전 placeholder(`noTier`) → 채점 예고(`gradeNote`)/기본 미채점 고지(`basicNote`)
- 기본 티어 업셀 L484–502(`isBasicTier`): `basicDone` 시 심화 CTA 카드 + 잠금 행 `lockRows`(확신도/세 시점/반대 의견/지표 해설 32개, 각 행 `openTier`)
- **세그 탭** L504–509: `segs` = 근거(evi)/시점별(hz)/지표(ind)/해설(narr) (L2665), 아래 한 줄 설명 `segDesc`(L2897). 탭 전환 시 스크롤 위치 보존(L2321).
  - `segEvi` L511–522: "지표 신호 `sigCount`(5행/31행) · 강도순" + `sigs`(▲▼– + 이름/설명 + 강도 바)
  - `segHz` L524–555: deep → `hz` 4행(시점/예측%/가격/달성확률 + 범위 바 `h.l/h.w` + 현재가 세로선 37.3% + 예측가 도트 `h.d`) + 범례 / basic → 잠금 placeholder(`openTier`)
  - `segInd` L557–574: `agree`+`dist` + 다이버징 바 `bars`(중앙 50% 기준, basic 6행/deep 18행)
  - `segNarr` L576–616: deep → `conclusion` 문단 + 반대 의견 적색 박스(고정 2지표) + "지표별 해설 32개" 아코디언 `cards`(7개 생성, `c.open` 토글) / basic → 잠금 placeholder
- 푸터 L618–622: "시세 15분 지연 · 08:42 기준 · 실봉 5,023개 계산" + 투자 유의 박스

### run 화면 (L626–727)
- 상단: 풀블리드 차트(`preserveAspectRatio:none`) — `runCamV.t`로 카메라 줌/팬 시네마틱(0.9s 전환, L2449–2458; 배지 "⤢ 장기 전체 조망/중기/단기" L641–643) + `{{ runDraw }}`(진행 지표마다 다른 작도를 `msDrawCycle`로 순환 렌더, React 요소, L2436–2447) + 콘 페이드인(`runConeO`) + 중단 칩(`vidOn` 시 우상단) + `drawNote` 상태 배지
- 하단 시트(L650–725): 핸들 → `curName/curStep/progLabel` → **틱 바** `ticks`(기본 5/그외 32칸 + 커스텀 33·34번째 가중치(보라)·페르소나(골드) 특수칸, 그룹색 5종 L2858–2867) → 범례 `tickLegend`(추세/모멘텀/변동성/거래량/구조, basic 제외) → 진행바(`progPct` 구간식: 지표 94%→가중치 96%→페르소나 98%→100%, `progPhase/progBarEnd`) → 마무리 보정 박스(`boostOn`, `boostW/boostP`) → 완료 플래시(`doneFlash`) → **엔진 비디오 카드**(`vidOn`: deep=`assets/engine-deep.mp4`/custom=`assets/engine-apply.mp4`, `vidCap/vidSub`, `onEnded={{ vidEnd }}`) → 로그 4줄 `logLines` → 안내 박스 → 네트워크 오류 박스(`runErrOn`: 다시 시도/돌아가기) → 중단 버튼(`runCancelable`=deep·custom만) + "개발 참조 — 오류 미리 보기"(`runFail`)

---

## 6. 스타일 체계

### helmet (L10–69)
- 폰트: Google Fonts `IBM Plex Sans KR`(300–700) + `IBM Plex Mono`(400–600) L11–13. 숫자·코드성 표기는 전부 Mono + `font-variant-numeric:tabular-nums`.
- base: `body{margin:0;background:var(--bg0);color:var(--t1);letter-spacing:-0.011em}` L15, 링크 var(--ac), 스크롤바 전면 숨김 L18–19.
- **키프레임 28종** L20–48: msPing(도트 파문)·msDrawCycle(작도 순환)·msPredPulse(예측선 점멸)·msConePulse·msVidIn·msLv*(레벨업 6종)·msSpinY(◈ 회전)·msRing(코치 링)·msPoke·msShakeX(감액 흔들림)·msDeltaUp·msRevealUp(섹션 등장 — 화면마다 지연 계단식 사용)·msSnack·msTipScroll·msAttGlow(출석 글로우)·msVerdictPop·msSweepX·msSheetUp·msXpPop·msCellOld(만료 임박 점멸)·msAuraPulse·msSkelMove·msFloatY·msMarq.

### 토큰과 다크/라이트
- `:root`(다크 기본) L49: `--bg0 --cu(골드) --sf0..3(표면) --gr --ln0..2(라인) --m1..3(뮤트) --t1..3(텍스트) --ac/--ach(보라 액센트) --up/--updeep/--dn --cy --am --bl/--bl2 --pk --lv --ovr(오버레이 RGB 트리플 "15,17,22" — `rgba(var(--ovr),0.92)` 식으로 사용)`.
- `[data-th="light"]` L50: 같은 토큰 전체 재정의. 전환은 JS가 `document.body.setAttribute('data-th', …)`(L2202 복원, L2802 `thTog`) — 클래스가 아니라 **body 속성**.
- **하드코딩 hex 뒤집기 셀렉터** L51–66: SVG에 하드코딩된 `stroke="#171b23"` 등 15종을 `[data-th="light"] [stroke="#…"]{stroke:…}` 속성 선택자로 라이트에서 교체. 즉 차트 격자·캔들색·예측선 하드코딩이 이 장치에 의존한다 — 포팅 시 그대로 옮기거나 토큰화 필요.

### T_ 색 상수 주입 (renderVals)
- L2300: `const L = theme==='light'` 후 `T_UP/T_DN/T_AC/T_MU/T_TX1/T_TX2/T_AM/T_CU/T_M2/T_M3/T_L1/T_L2/T_S1/T_S2/T_S3` 15개를 다크/라이트 삼항으로 정의. 이 값들이 renderVals 반환 객체를 통해 **인라인 style 문자열**로 템플릿에 주입된다(예: `fg:on?T_TX1:T_TX2`). CSS 변수와 병용 — 목록/카드류 조건부 색은 T_ 상수, 정적 마크업은 `var(--…)`.
- 카테고리 5색 `CAT`(추세 블루/모멘텀 핑크/거래량 시안/변동성 앰버/구조 라벤더) L2317, 티어 3색 `tCol`(기본 #8b93a7/심화 #7b6cff/커스텀 var(--cu)) L2311과 알파 헬퍼 `tColA` L2312.

### 반복 수치·패턴 (인라인 스타일 관찰치)
- 여백 리듬: 페이지 좌우 16px, 카드 간 8~12px, 섹션 헤더 상단 16px. 카드 radius 12/14px, 칩·캡슐 99px, 버튼 CTA 높이 52~54px(radius 12), 보조 버튼 44~48px.
- 대표 그라디언트: CTA 보라 `linear-gradient(135deg,#7b6cff,#4a3ce0)` / 심화 배지 `#b3a9ff→#7b6cff` / 커스텀 골드 `#ecca5e→#c1901a` / 기본 실버 `#e8edf5→#b7c0d1` / 레벨 게이지 `#8b93a7→#7b6cff 55%→#d2a516`.
- 폰트 크기 층: 타이틀 19~22px(-0.03em) / 카드 제목 13.5px / 본문 13px / 보조 11~12.5px / 마이크로 9.5~10.5px. 큰 숫자 22~38px Mono.
- 시장 기준선 `60.96%`가 4곳(판정 바 L452, 채점 gSum L1043·ycTf L1063, peers styleFit L932)에서 하드코딩 반복 — 정직 표기 상수.

### 상태 영속·환경
- localStorage `ms_proto_v1`(L2202 로드, `persist` L2266 저장): 종목·분석결과(24h TTL 필터)·스쿱·테마·구글연결·페르소나 답·XP·글자크기·일일 방문 기록.
- `support.js` 외부 로드(L6) — .dc 런타임(DCLogic·React) 제공, 파일에는 없음.
- 햅틱 명세 주석 L2267–2268(`hap`: deduct/done/earn/warn/stop/tick — navigator.vibrate 패턴), 개발 이관용 명시.

---

## 부록 — 계산되지만 템플릿에서 안 쓰이는 죽은 키 (포팅 제외 대상, 전수 grep 확인)

`sMenu`(메뉴 시트 템플릿 자체 부재) · `webArc/webSteps/webLog`(구 웹분석 위젯 잔재) · `navs` · `ledger`(스쿱 내역 — wallet에 미노출) · `dashPerf` · `swChips`(swChips2로 대체) · `heroSpark` · `dashRefresh/dashStale/dashDim` · `pendList/pendHas/pendCount` · `goPreview` · `skip` · `d14Hit/d14Miss/d14Rate` · `sigPeak` · `peer.trendUp/peer.presets` · `hpLine` · `acctFg/acctBg/acctBd/acctBanTxt/acctName` · `chipEdit` · `isCustomDone/isCustomRun` · `gLinkTitle/gLinkSub/gLinkBtn`(gLinkC/gLinkBd만 사용) · `pMoreOn` · `chZoomL/chZoomIn/chZoomOut`(줌 버튼 UI 없음 — 팬 제스처만 동작) · `barPreview/barDone/showBar` · `hasTier` · `attReady` · 로컬 상수 `heatD`(L2346).
