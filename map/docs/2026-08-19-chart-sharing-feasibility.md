# 차트 작도 공유 타당성 조사 (PC 스쿱포지 ↔ 머니스쿱 모바일)

조사일 2026-08-19 · 읽기 전용 조사 · 코드 변경 없음(`git status` 클린)

---

## 결론 (한 줄)

**(C) 지표별 레이어 전체까지 공유 가능하다 — 31개 `_drawXLayers(c, data, M)` 는 이미 DOM·전역
의존이 사실상 0 이고 모바일이 그중 5개를 "머리 수술 + 한글 리터럴 교체" 만으로 무수정 이식해
돌리고 있다. 막는 것은 아키텍처가 아니라 한글 UI 문자열 149개와 forge-draw.js 에 테스트가
0건이라는 사실뿐이다. 반면 그 바깥(캔버스 획득·서브패널 meta HTML·리스크/최적화 도구·
`_drawEvidence` 디스패처)은 공유 대상이 아니며 공유하려 해서도 안 된다.**

---

## 0. 실측 요약

| 항목 | 실측 |
|---|---|
| `forge-draw.js` | 3,449줄 · top-level 함수 141개 · **테스트 0건**(`forge-draw.test.js` 없음) |
| ├ DOM 미접촉 함수 줄합 | **1,762줄** (51%) |
| └ DOM 접촉 함수 줄합 | 1,674줄 (49%) — 43개 함수 |
| 지표 레이어 영역 (2036–2996) | **961줄 / 31함수** — `document` 0 · `getElementById` 0 · `ForgeCore` 0 · `window` 1 |
| 로드 시점 DOM 접촉 | **단 2건** (`forge-draw.js:1317`, `:1366` 의 top-level `document.addEventListener`) |
| 모바일 작도 | 1,129줄 중 **450줄(39.9%)이 forge-draw.js 원문 복사**, 679줄(60.1%)이 모바일 고유 |
| 이미 이식된 레이어 | 5 / 31 (`ma·bollinger·rsi·macd·volume` = Lv1 핵심 5종) = PC 151줄 |
| 미이식 레이어 | **26 / 31 = PC 822줄** (= C1~C3 트랙의 실체) |

---

## 1. PC 작도가 실제로 무엇에 의존하는가 (전수)

### 1-1. DOM·브라우저 전역 (파일 전체)

| 종류 | 건수 | 비고 |
|---|---|---|
| `document.getElementById` | **60** | 고유 id **46종**(아래) |
| `document.addEventListener` | 5 | **그중 2건이 top-level**(1317, 1366) — 유일한 로드시점 DOM |
| `document.body` | 4 | |
| `document.createElement` | 3 | |
| `document.removeEventListener` | 2 | |
| `document.documentElement` | 2 | `getComputedStyle` 대상 |
| `document.querySelector(All)` | 6 | `.fc-panel-hero .fc-t` · `img` · `.rkpf` · `[data-tw]` |
| `getComputedStyle` | **2** | `forge-draw.js:21`(`_syncChartColors`), `:1890`(`_evLegend`) |
| `window.devicePixelRatio` | 1 | `fcFit` |
| `window.innerWidth` | 3 | |
| `window.matchMedia` | 1 | `_reduceMotion` |
| `.getContext("2d")` | 9 | 전부 함수 내부 |

의존하는 DOM id 46종 (전량 `forge.html` 고유):
`fcMainChart`(4) `fcLegend`(3) `tuneModal` `rkDiag` `riskDir` `optResult` `fcHeroImg` `fcFuture`
`fcCone` `evOptPop`(각2) · `viewToggle` `tuneBtn` `rrRisk` `rrReward` `rkShow` `rkEV` `rkAmt`
`riskModal` `optSurface` `optSel` `optRun` `optModal` `optH` `logBtn` `lblChk` `fcWilliams(Meta)`
`fcVol(Meta)` `fcSrcBadge` `fcRsi(Meta)` `fcPdm` `fcMfi(Meta)` `fcMain` `fcMacd(Meta)`
`fcEvidence(Hi)` `fcComet` `fcCci(Meta)` `fcAdx(Meta)` `evToggle`(각1)

### 1-2. CSS 변수·테마

**2곳뿐이며 둘 다 국소적이다.**
- `forge-draw.js:19-39` `_syncChartColors()` — `--chart-bg` · `--panel` · `--gold` 을 읽어 모듈
  전역 `FC_CHART_BG/FC_GRID/FC_GOLD/FC_OSC/_warmRGB/_oscRGB` 를 재대입. **`try{}catch{}` 로
  감싸여 있어 DOM 없는 환경에서 조용히 넘어간다**(그래서 node 로드가 가능하다).
- `forge-draw.js:1890` `_evLegend()` — `--gold` 폴백.

즉 색은 "그리는 함수가 읽는 것"이 아니라 **모듈 전역 상수로 한 번 주입되는 값**이다. 모바일
`draw-layers.js:14`·`draw-panels.js:11-19` 가 그 자리에 하드코딩 심(`#e8b463` 등)을 넣어 그대로
동작시키고 있다 — 이 설계가 이미 공유를 가능하게 만들어 둔 지점이다.

### 1-3. 다른 파일의 전역 (스코프 분석 — 지역 선언·인자 제외)

**총 61 심볼 / 243회.**

| 원본 파일 | 심볼 수 | 참조 횟수 | 주요 심볼(횟수) |
|---|---|---|---|
| `forge-app.js` | 24 | **114** | `lastResult`(29) `_hzFmt`(13) `currentData`(11) `activeTF`(7) `_driftW`(7) `tfUnit`(5) `_hbarRsi`(4) `hasRealSeries`(4) `_clearComets`(4) `runForge`(4) `renderChart`(3) `_visionData`(3) `_scanning`(3) … |
| `forge-state.js` | 13 | **77** | `_heroZoom`(14) `boardState`(13) `_logChart`(12) `_chartWin`(10) `tvLog`(8) `_yScale`(7) `heroImgId`(3) `markDirty`(3) … |
| `forge-ui.js` | 23 | **50** | `_an`(19) `renderIndRail`(4) `bToast`(4) `_fcLastResult`(3) + `_anVolume`·`_anGet`·`_anVP`·`_anSMC` 등 지표별 캐시 래퍼 18종(각 1) |
| `forge-tools.js` | 1 | 2 | `drawsRender`(2) |

**결정적 사실 — 이 61 심볼은 파일 전체에 골고루 퍼져 있지 않다.**
지표 레이어 영역(2036–2996, 961줄)만 떼어 보면 그 안에서 참조되는 외부 전역은 **단 2종 7회**다:

```
_logChart : 2회 (로그축 여부 — 불리언)
_hzFmt    : 5회 (숫자 포맷터 — forge-app.js:161, 3줄짜리 순수 함수)
```

DOM 0 · `getElementById` 0 · `ForgeCore` 0 · `window` 1.

### 1-4. `forge.html` DOM 구조 의존

캔버스 8종(`fcMainChart` `fcRsi` `fcMfi` `fcWilliams` `fcCci` `fcMacd` `fcAdx` `fcVol` `fcPdm`
`fcCone` `fcEvidence` `fcFuture` `fcComet`) + 메타 `<div>` 7종(`fc*Meta` — `innerHTML` 로 HTML
게이지를 쓴다) + 모달 3종(risk·opt·tune) + 토글 버튼류. **전부 `fcDraw*`·`open*Tool`·`toggle*`
계열 함수에만 있고, `_drawXLayers` 안에는 하나도 없다.**

### 1-5. 실험 — node 에서 require 하면 무엇이 터지는가

```
$ node -e "require('./forge-draw.js')"
THROW: ReferenceError | document is not defined        ← 로드 즉시
```
그러나 **1317~1321 과 1366 의 top-level `document.addEventListener` 2블록만 제거하면**:
```
LOADED OK — 로드 시점 DOM 접촉은 그 2건뿐
```
(ForgeCore 를 global 에 미리 넣어야 함. 실험 후 임시 파일 삭제, 원본 무변경.)

→ **forge-draw.js 는 "DOM 에 뿌리내린 파일"이 아니라 "게으른 DOM 접근 + top-level 리스너 2건"
파일이다.** 이것이 이 조사의 가장 중요한 단일 사실이다.

---

## 2. `forge-tools.js` 는 왜 공유가 됐는가 — 그리고 사실은 공유되고 있지 않다

### 2-1. 먼저, 사실 정정

`sync-engine.mjs:9` 의 `ENGINE_FILES = ["forge-core.js", "forge-tools.js"]` 가 `forge-tools.js`
를 `mobile/www/vendor/` 로 복사한다. 그러나:

- **`mobile/www/index.html` 은 `vendor/forge-tools.js` 를 로드하지 않는다**(스크립트 태그 52개
  전수 확인 — `vendor/forge-core.js`(21행)와 `vendor/backtest-summary.js`(49행)뿐).
- `mobile/www/**` · `mobile/test/**` · `mobile/tools/**` 어디에도 `forge-tools` 참조가 없다
  (vendor 사본 자체 제외).
- `forge-tools.test.js` 81건은 `map/` 루트에서 도는 **PC 측 테스트**다(`tests/run.sh:61`).

**즉 `forge-tools.js` 는 "공유되는 드로잉 도구"가 아니라 "모바일로 복사만 되고 아무도 안 읽는
사문(死文)"이다.** 브리프의 "왜 이건 됐는지"라는 질문의 전제 자체를 정정해야 한다 — 그것은
성공한 공유 선례가 아니라 **동기화 대상 목록에 이름만 오른 상태**다.

### 2-2. 그래도 배울 것은 있다 — 무엇이 그 파일을 "떼어질 수 있게" 만들었나

`forge-tools.js` 는 DOM-free 가 아니다. `document.` 10회 · `getElementById` 7회 ·
`getContext` 1회 · `devicePixelRatio` 1회를 쓴다. 그런데도 `node --test` 로 81건이 돈다.
이유는 셋이다:

1. **UMD 래퍼 + 지연 DOM 접근.** 모든 DOM 터치가 함수 안에 있고, 파일 하단의
   `if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", …)`
   가드가 로드시점 접촉을 막는다.
2. **DOM 접점이 좁고 이름이 정해져 있다.** 사실상 `getElementById("fcMainChart")._mainGeo`
   (기하 객체)와 전역 `priceTimes()` 둘뿐이다.
3. **테스트가 그 좁은 접점을 통째로 스텁한다.** `forge-tools.test.js:176-184` 가
   `global.document`·`global.window`·`global.priceTimes` 를 가짜로 갈아끼우고
   `makeCanvas()`·가짜 `ctx` 를 넣는다. 970·1409행은 `global.FC_GOLD`·`global.FC_CHART_BG`
   까지 주입한다.

### 2-3. `forge-draw.js` 와 무엇이 다른가

| | `forge-tools.js` | `forge-draw.js` |
|---|---|---|
| 래퍼 | UMD (IIFE + `module.exports`) | **없음** — 벌거벗은 전역 스크립트 |
| 로드시점 DOM | 0 (DOMContentLoaded 가드) | **2건** |
| DOM 접점 | 사실상 2종(`fcMainChart._mainGeo`, `priceTimes`) | **id 46종 + 셀렉터 4종** |
| 타 파일 전역 | 소수(`priceTimes` 등) | **61 심볼 / 243회** |
| 테스트 | 81건 | **0건** |

**같은 방법(UMD + 스텁)을 `forge-draw.js` 전체에 그대로 쓰는 것은 막힌다** — 61개 전역과 46개
DOM id 를 전부 스텁해야 하고, 그 스텁 자체가 `forge-app.js` 의 재구현이 된다.
**그러나 지표 레이어 영역(961줄)에만 쓰면 즉시 통한다** — 스텁해야 할 것이 `_logChart`(불리언)와
`_hzFmt`(3줄 함수) 둘뿐이기 때문이다. 실제로 모바일이 이미 그렇게 했다(`draw-layers.js:21`
가 `_hzFmt` 를 3줄로 재선언하며 `// forge-app.js:161` 이라 출처를 적어 뒀다).

---

## 3. 모바일 작도가 실제로 무엇을 하는가

### 3-1. 원문 복사 vs 모바일 고유 (줄 수)

세 파일이 **자기 헤더에 복사한 PC 줄 번호를 명시**하고 있다:

| 파일 | 총 줄 | 원문 복사 블록 | 복사 줄수 | 고유 줄수 |
|---|---|---|---|---|
| `draw-layers.js` | 300 | 23–282 (`forge-draw.js` 7-9, 35-36, 1278-1286, 1295-1311, 1836, 1838-1867, 1923-1947, 2002-2011, 2117-2175, 2361-2381, 2383-2413, 2545-2571, 2573-2580) | **260** | 40 |
| `draw-preds.js` | 231 | 54–154 (47-52, 56-69, 80-145, 1949-1957) | **101** | 130 |
| `draw-panels.js` | 108 | 17–105 (2, 9, 16, 430-464, 538-553, 576-610) | **89** | 19 |
| `chart-draw.js` | 253 | — | 0 | 253 |
| `chart-legend.js` | 108 | — | 0 | 108 |
| `chart-layout.js` | 86 | — | 0 | 86 |
| `chart-zoom.js` | 43 | — | 0 | 43 |
| **합** | **1,129** | | **450 (39.9%)** | **679 (60.1%)** |

### 3-2. PC 와 같은 것 / 모바일 전용

**PC 와 같은 것(450줄, 원문 복사)** — 지표 오버레이 5종(`ma·bollinger·rsi·macd·volume`),
오실레이터 서브패널 3종(`fcDrawRsi·fcDrawMacd·fcDrawVol`), 예측선 꿈틀·신뢰 감쇠·페이드
스트로크·진앙 마커·`_predPCal`, 라벨 충돌 회피 레지스트리(`_evLabel`·`_fitBoxY`), 작도 스타일
토큰(`CW`·`CDASH`), 스케치 스트로크(`_skStroke`·`_skReady`·`_polyLen`).

**모바일 전용(679줄)** —
- `chart-layout.js`(86) 4단 적층 패널 좌표계·비율 배분. PC 는 별도 캔버스 4개, 모바일은 한
  캔버스 4단이라 **폼팩터 차이에서 오는 정당한 고유 코드**.
- `chart-zoom.js`(43) 핀치 줌. PC 는 `_chartWin{start,count}` + 휠, 모바일은 tail 하나. 헤더가
  근거를 적어 뒀다(팬 미도입이므로 상태가 하나면 충분).
- `chart-draw.js`(253) 캔들·콘·축·크로스헤어 **+ 티어 정책**(`CHART_TIERS`). 이 중 티어
  정책(basic=선/콘없음, full=캔들+콘, custom=+2차선)은 **PC 에 존재하지 않는 개념**(CLAUDE.md
  §⓪-5: PC 는 과금이 없다) — 공유 대상이 아니다.
- `chart-legend.js`(108) 고정 레전드 행 데이터. PC 는 배지를 차트 위에 그리지만 모바일은
  Phase 3 에서 레전드로 옮겼다(작은 화면).
- 세 이식 파일의 심(shim) 부분 189줄 — 색 상수 하드코딩, `Str`(i18n) 주입, UMD 래퍼.

### 3-3. 다르게 그리는 곳 — 의도된 차이인가 표류인가

이식된 5개 레이어 + 3개 서브패널을 현행 PC 원본과 **전량 diff** 했다. 차이는 정확히 세 종류뿐:

| 유형 | 예 | 판정 |
|---|---|---|
| ① 머리 수술 | `fcDrawRsi(rsi, reveal)` → `fcDrawRsi(c, cw, ch, rsi, reveal)`; `document.getElementById("fcRsi")` + `fcFit()` 3줄 제거 | **의도** — 캔버스 획득을 호출부 책임으로 옮김 |
| ② i18n | `"골든 "` → `Str.t.legGolden`, `"과열"` → `Str.RSI_ZONE[...]` | **의도**(Phase 5 규약: "조건·계산·좌표는 한 글자도 안 건드렸다") |
| ③ 배지 게이트 | `if (reveal >= 2)` → `if (reveal >= 2 && M.badges !== false)` | **의도** — 모바일이 배지를 레전드로 뺀 결과 |
| 부수 | `fcDrawRsi` 끝의 `fcRsiMeta.innerHTML = …` 제거 / `const { …, reveal = Infinity } = M` 방어 기본값 | **의도** |

**계산·좌표·조건의 표류는 0건이다.** `_drawMALayers` 60줄 중 실질 차이 4곳, `_drawBollingerLayers`
28줄 중 5곳, `_drawVolumeLayers` 32줄 중 6곳 — 전부 위 3분류 안에 든다.

**단, 표류가 하나 있다 — i18n 이 라벨 우선순위 장치를 죽였다.**
`draw-layers.js:46` 은 `_KEYLBL = /목표|반대|지지|저항|골든포켓|장기|중기|단기/` 를 **한글
정규식 그대로** 복사했다. 그런데 모든 라벨 텍스트는 ②에 의해 영어로 바뀌었으므로 이 정규식은
**절대 매치되지 않는다**. `_labelMode === "key"` 면 라벨이 전멸한다. 모바일은
`resetLabels()`(287행)에서 `_labelMode = "all"` 로 강제해 이를 우회했다.

결과: **작은 화면인 모바일이 전체 라벨을, 큰 화면인 PC 가 핵심 라벨만 그린다.** 화면 크기와
반대다. 이것은 의도된 폼팩터 차이가 아니라 **원문 복사 방식이 만들어낸 조용한 표류**이며, 소스가
하나였다면 발생할 수 없었다(정규식이 아니라 라벨 종류를 키로 넘겼을 것이므로).

**연결 누락도 1건.** `draw-layers.js` 는 `macdBadge` 를 export 하지만
`chart-draw.js:24` 의 `FULL_OVERLAYS = ["bollinger","ma","rsiBadge","volumeBadge"]` 와
`screens/report.js:21-24` 의 디스패치 표에 **`macdBadge` 가 없다** — 이식했는데 화면에 안 닿는다.
(5개 이식 / 4개 배선)

---

## 4. 공유의 실제 후보 범위 — A / B / C 판정

### (A) 순수 기하·계산만 — **가능, 그러나 이미 대부분 끝났고 남는 이득이 적다**

좌표 변환(`fiToX`/`pToY`)은 PC 와 모바일이 애초에 다른 레이아웃에서 나오므로 공유 대상이
아니다(모바일 `chart-layout.js` 헤더가 "M 이 PC 의 `_drawXLayers(c,data,M)` 인자와 같은 모양이라
수정 없이 꽂힌다"고 적었다 — **계약은 이미 공유되고 구현은 각자**가 올바른 배치다).
콘 폭·신뢰 감쇠(`_predConfAt`·`_predHorizonK`·`_predBandW`)와 `upProb` 계산은 **이미 공유되고
있다**(전자는 `draw-preds.js` 로 원문 복사, 후자는 Phase 6 에서 `forge-core.js` 로 승격돼 모바일이
`require("../../forge-core.js")` 로 직접 부른다). A 만 하면 **새로 얻는 것이 거의 없다.**

### (B) `ctx` 를 인자로 받는 순수 그리기 프리미티브 — **가능. 이미 사실상 성립해 있다**

`_evLabel(c, text, x, y, color, align, force)` · `_fitBoxY` · `_skStroke` · `_polyLen` ·
`_drawProjLine` · `_projFwd` · `_projMark` · `_predDir` · `_strokePredLine` · `_epicenterMark`
— 전부 `c` 를 첫 인자로 받고 DOM 을 모른다. 모바일이 이 세트를 통째로 복사해 쓰고 있다.
UMD 로 묶어 내보내는 데 필요한 작업은 **한글 리터럴 제거와 모듈 경계 긋기뿐**이다.

### (C) 지표별 레이어 전체 (31종) — **가능하다. 이것이 이 조사의 답이다**

근거 4개:

1. **인터페이스가 이미 균일하다.** 31개 전부 `_drawXLayers(c, data, M)` 단일 시그니처
   (`forge-draw.js:2036~2968`). `M` 은 순수 데이터 계약이다 —
   `{fiToX, pToY, nowFi, fiMin, reveal, xNow, xRight, futBars, focused}`
   (`forge-draw.js:3080` 호출부). 함수·숫자·불리언뿐, DOM 요소가 없다.
2. **영역 전체가 이미 DOM-free 다.** 961줄에서 `document` 0 · `getElementById` 0 ·
   `getContext` 0 · `ForgeCore` 0 · `window` 1.
3. **외부 전역 의존이 2종 7회뿐.** `_logChart`(2) · `_hzFmt`(5). 나머지는 전부 같은 영역 안의
   헬퍼(`_evLabel` 56 · `CW` 28 · `_skReady` 25 · `CDASH` 21 · `FC_GOLD` 12 · `_skStroke` 8 ·
   `_polyLen` 8 · `_projMark` 5 · `_projFwd` 4 …)이며 **모바일이 이미 그 헬퍼 세트를 전부
   이식해 뒀다**(`draw-layers.js` 헤더의 원본 심볼 목록과 정확히 일치).
4. **경험적 증명.** 그 5/31 이 지금 프로덕션에서 돌고 있고, diff 결과 계산 표류 0건이다.

**따라서 C1~C3 트랙(26종 · PC 822줄)은 "이식"이 아니라 "노출"로 바뀔 수 있다.**
미이식 26종과 PC 줄수:

```
Trend(86) Fib(97) Elliott(87) Pivot(55) Gann(59) Donchian(41) Psar(40) Ichimoku(40)
Cycle(35) Structure(33) Keltner(30) Supertrend(28) Pattern(25) Vwap(25) Smc(21)
VolumeProfile(21) Atr(13) Stoch(11) Cci(11) Williams(10) Roc(9) Ao(9) Aroon(9)
Mfi(9) Cmf(9) Adx(9)
```

**공유 대상이 아닌 것(명시)** — `fcDrawMainChart`(315) · `_drawEvidence`(260, 디스패처) ·
`computeRisk`/`openRiskTool`(121) · `openOptTool`/`runOptimize`/`renderOptResult`/`drawOptSurface`
(약 100) · `fcDrawPdm`(78) · `fcDrawFold`(99) · `_drawComets`(40) · `_legDragInit`(16) ·
`bindConeDrag`(31) · `fcHeroMode`/`updateViewToggle`/`updateSrcBadge`. 이들은 PC 작업대 전용
도구이거나 `forge.html` DOM 그 자체다.

---

## 5. 비용과 위험

### 5-1. PC 를 깨뜨릴 위험 — **이 조사에서 가장 큰 리스크**

- **`forge-draw.js` 는 테스트가 0건이다.** `map/*.test.js` 는 `forge-core`(259) ·
  `forge-tools`(81) · `landing`(28) 셋뿐. 259+81 건은 `forge-draw.js` 를 **한 줄도 검사하지
  않는다.** 리팩터링 사고가 났을 때 잡아 줄 그물이 PC 쪽엔 없다.
- 반면 **모바일에는 그물이 있다** — `draw-layers.test.mjs` · `draw-panels.test.mjs` ·
  `draw-preds.test.mjs` · `chart-draw.test.mjs` · `chart-layout.test.mjs` 등. 즉
  **"이식된 작도"가 "원본 작도"보다 검증이 잘 돼 있는 역전 상태**다.
- 위험 완화 경로는 명확하다: **레이어 영역만 파일로 분리하고, 분리 즉시 모바일 스타일
  UMD + node 테스트를 붙인다.** 분리 대상이 DOM 0·외부전역 2종이므로, `forge-tools.js` 가
  쓴 스텁 기법(가짜 `ctx` 로 호출 시퀀스를 기록해 단언)을 그대로 적용할 수 있다.
- **로드 순서·전역 공유 규율은 안 깨진다.** 분리 후에도 새 파일을 `forge-draw.js` 앞에 classic
  `<script src>` 로 끼우면 되고(`forge.html:284-289` 패턴 그대로, `defer`/`async` 금지 유지),
  UMD 브라우저 분기가 전역에 이름을 그대로 뿌리므로 `forge-draw.js` 의 호출부는 무수정이다.
  (`forge-tools.js:5-9` 가 정확히 이 패턴이다 — `for (const k in api) root[k] = api[k]`.)

### 5-2. 모바일 제약(ES2017 · 빌드 없음 · classic script) 만족 여부 — **레이어 영역은 만족**

`mobile/test/syntax-floor.test.mjs` 의 금지 7종을 `forge-draw.js` 전체에 대해 grep:

| 금지 문법 | 파일 전체 | 레이어 영역(2036–2996) |
|---|---|---|
| 옵셔널 체이닝 `?.` | 0 | 0 |
| **null 병합 `??`** | **2** (`forge-draw.js:1707`) | **0** |
| 논리 대입 · private 필드 · `Object.hasOwn` · `groupBy` · `toSorted` 류 | 0 | 0 |

유일한 위반 `??` 는 1707행 `runOptimize()` — **PC 전용 최적화 도구**이므로 공유 대상 밖이다.
그 외 사용 문법은 `const/let`(ES2015) · 화살표 · 템플릿 리터럴(48) · `for-of`(34) · 구조분해(40)
로 전부 **ES2015~2017 범위 안**이며, `map/CLAUDE.md §⑤` 가 확정한 하한을 넘지 않는다.
(`forge-core.js`·`forge-tools.js` 도 위반 0건 — 이미 같은 하한에서 돌고 있다는 방증.)
빌드 도구 불필요 · classic `<script src>` 로 로드 가능.

### 5-3. 작업량 추정 (줄 수 · 단계)

| 단계 | 내용 | 규모 | 위험 |
|---|---|---|---|
| S1 | 레이어 영역 + 필요한 헬퍼를 `forge-layers.js`(가칭) 로 분리. UMD 래퍼. 브라우저 분기는 전역 살포로 `forge-draw.js` 호출부 무수정 | 이동 **약 1,050줄**(레이어 961 + `_evLabel`·`_fitBoxY`·`_skStroke`·`_polyLen`·`_projMark`류·`CW`·`CDASH`·`FC_*` 약 90줄) · 신규 코드 ~30줄 | **중** — PC 테스트 0건. S2 를 같은 세트로 묶어야 함 |
| S2 | 그 파일에 node 테스트 신설(가짜 `ctx` 로 호출 시퀀스 단언). `tests/run.sh engine` 에 편입 | 테스트 신규 300~500줄 | 낮음 |
| S3 | 한글 리터럴 **149개**를 `forge-layers.js` 밖의 문자열 테이블로 인출(PC 는 한국어 표, 모바일은 영어 표 주입). `_KEYLBL` 정규식 → **라벨 종류 키**로 교체(§3-3 표류 근절) | 149처 치환 + 표 2벌 | **중** — 여기가 실제 난이도의 대부분 |
| S4 | 외부 전역 2종 제거: `_logChart` → `M.logChart`, `_hzFmt` → 주입(모바일이 이미 3줄 재선언 중) | 7처 | 낮음 |
| S5 | `sync-engine.mjs:9` `ENGINE_FILES` 에 `forge-layers.js` 추가. 모바일 `draw-layers.js` 의 원문 복사 블록 260줄을 **삭제**하고 vendor 호출로 교체 | 모바일 −260줄 | 낮음(모바일 테스트가 지킴) |
| S6 | 미이식 26종을 화면에 배선 — 티어 정책·오버레이 목록·i18n 표만 손대면 되고 **작도 코드는 0줄** | 배선 ~100줄 | 낮음 |

**핵심: S6 이 원래의 C1~C3(822줄 재이식)을 대체한다.** 총량으로 보면 "822줄 이식 + 영구
이중관리" 가 "1,050줄 이동 + 149처 i18n + 테스트 신설" 로 바뀌는 교환이며, 두 번째 쪽만
**32종을 두 번 이식하지 않는다.**

### 5-4. 남는 위험

- **부분 배포 위험.** `forge.html` 동반 배포 파일이 8종 → 9종이 된다(`map/CLAUDE.md`
  §스쿱포지 파일의 "하나라도 빠지면 동작 불가" 목록). 문서 갱신을 빠뜨리면 배포 사고가 난다.
- **`--pred2` 색 충돌**(PROGRESS.md:143 이 C2 조건으로 적어 둔 것) 은 이 조사로 해소되지 않는다
  — 색 토큰 판정은 여전히 별도로 필요하다.
- S3 를 대충 하면(예: 표만 만들고 `_KEYLBL` 를 그대로 두면) 지금의 표류가 공유 소스 안으로
  들어가 **양쪽이 동시에 틀리게 된다**. i18n 은 이 작업의 곁가지가 아니라 본체다.

---

## 6. 대안

### 대안 1 — 계산만 떼고 그리기는 각자 (=A 만)

- 비용: 낮음(대부분 이미 완료).
- 위험: 낮음.
- **문제: 목적을 달성하지 못한다.** C1~C3 의 822줄은 "계산"이 아니라 "그리기"다. A 만 하면
  26종을 여전히 손으로 옮겨야 하고, §3-3 의 `_KEYLBL` 류 표류가 26번 더 생길 자리를 만든다.

### 대안 2 — 모바일 작도를 PC 로 역수출 (모바일을 정본으로)

- 근거는 있다: 모바일 쪽이 테스트가 있고, UMD 로 정리돼 있고, i18n 이 이미 분리돼 있다.
- **그러나 방향이 틀렸다.** 모바일이 가진 것은 **5/31 뿐**이며, 나머지 26종의 원본은 PC 에만
  있다. 역수출하면 26종은 여전히 PC 에서 모바일 형식으로 다시 써야 한다 — 이식량은 그대로다.
- 또한 `map/CLAUDE.md §⓪-1`("분석 기법은 PC 에서만 만든다")과 정면 충돌한다. 작도는 분석의
  표현이고, 새 지표는 PC 에서 태어난다. 정본이 모바일이면 새 지표를 만들 때마다 역방향
  왕복이 생긴다.
- 비용: 중~높음 / 위험: 높음(규율 충돌).

### 대안 3 — 공유 포기, 규약만 문서로 일치

- 비용: 매우 낮음(지금 상태 + 문서).
- **위험: 가장 높다.** §3-3 이 증거다 — 지금도 규약("조건·계산·좌표는 한 글자도 안 건드린다")이
  문서와 주석에 명시돼 있는데, 그 규약을 지킨 채로도 `_KEYLBL` 표류가 발생했다. 문서는
  "복사할 때 무엇을 바꾸지 말라"는 말할 수 있어도 "복사한 뒤 원본이 바뀌면 어떻게 되는가"를
  막지 못한다. 실제로 `draw-panels.js:17` 이 인용한 PC 줄번호(430-464)는 현행(441-471)과
  이미 어긋나 있다 — 원본이 움직였다는 뜻이고, 다음에 움직일 때 내용까지 갈라지지 않으리라는
  보장은 없다.
- 26종을 이 방식으로 옮기면 **PC 3,449줄과 모바일 1,951줄이 영구히 짝을 이루어 관리된다.**

---

## 7. 권고

**(C)까지 간다. 단 "레이어 영역만" 이라는 경계를 명확히 긋는다.**

1. 분리 대상은 `forge-draw.js` 2036–2996(31 레이어) + 그들이 쓰는 헬퍼·상수 약 90줄. 그 밖은
   PC 에 남긴다 — 특히 `fcDrawMainChart`·`_drawEvidence`·리스크/최적화 도구.
2. **S1(분리)과 S2(테스트 신설)를 한 세트로 묶는다.** PC 에 그물이 없는 상태에서 1,050줄을
   옮기는 것이 이 작업의 유일한 진짜 위험이다.
3. **i18n(S3)을 곁가지로 취급하지 않는다.** 149개 한글 리터럴과 `_KEYLBL` 정규식이 실제
   난이도이며, 여기를 대충 하면 지금의 표류가 공유 소스 안으로 승격된다.
4. 착수 전 `sync-engine.mjs` 의 `forge-tools.js` 사문(§2-1)을 정리한다 — 동기화 목록이
   "실제로 쓰이는 것"과 어긋나 있으면 다음 사람이 "공유 중"을 잘못 읽는다(이 조사의 브리프가
   실제로 그렇게 읽었다).
5. 부수적으로 확인된 결함 2건은 이 트랙과 무관하게 별도 처리 가능:
   `macdBadge` 미배선(§3-3), 모바일 라벨 우선순위 무력화(§3-3).

---

## 부록 — 확인하지 못한 것

- **실행 시 동등성은 검증하지 않았다.** PC 와 모바일에 같은 입력을 넣어 같은 픽셀이 나오는지는
  이 조사에서 재지 않았다(읽기 전용 · 헤드리스 미실행). 정적 diff 로 "계산 표류 0"까지만 말한다.
- **`--pred2` 색 충돌**(PROGRESS.md:143)의 내용은 문서에 한 줄 언급뿐이라 실체를 확인하지 못했다.
- 미이식 26종 각각이 필요로 하는 **엔진 출력 필드**가 모바일 `graph.js` 경로에서 실제로
  생산되는지는 확인하지 않았다(레이어 코드의 이식 가능성과는 별개 문제).
- `forge-draw.js` 의 141개 함수 중 DOM 미접촉으로 분류한 1,762줄이 **전부** 공유 가능하다는
  뜻은 아니다 — 레이어 영역 961줄만 외부 전역까지 확인했고, 나머지 800여 줄은 DOM 여부만 셌다.
