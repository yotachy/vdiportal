# 추세선·fib 위계 통일 (작도 전용) 설계

- 날짜: 2026-07-16
- 상태: 설계 승인됨 (구현 대기)
- 선행: S/R·structure 다중스케일 위계(`2026-07-16-multiscale-sr-structure-design.md`) · Gann 다중앵커. 배경 메모리 [[scoopforge-multiscale-drawing]]
- 백로그: `docs/BACKLOG.md` 항목 0 [남은 확장]

## 1. 배경 / 목표

Gann·S/R·structure에 적용한 "데이터기반 다중스케일 + 중요도 위계(강조/디밍)"를 **추세선(trend)**·**피보나치(fib)** 작도에도 통일한다. 두 지표는 이미 다중스케일을 계산·작도하지만 **자체 스타일 규약**을 쓰고 있어 4지표 간 시각 언어가 어긋나고, 교차-degree 합류가 없다.

> **구현 전 실측(2026-07-16)로 정정**: 당초 "fib는 단기만 작도"로 봤으나, `_drawFibLayers`는 **이미 단/중/장 3 degrees를 모두 그린다** — 단기=풀 그리드(retr+ext+골든존, 핵심비율/합류 강조), 중/장기=핵심 되돌림(0.382/0.5/0.618)+스윙 스팬(`STY` 맵의 별도 색/굵기). 따라서 fib 작업은 "degree 추가"가 아니라 **①교차-degree 합류 강조 신설 ②중/장 별도 스타일을 공통 규약으로 정렬**이다.

- **fib** (`_drawFibLayers`): 3 degrees 이미 작도. **없는 것 = 교차-degree 합류**(단기 내 `L.confluent`만 있고, 단+중+장이 같은 가격에 겹치는 최강 S/R은 미강조). **어긋난 것 = 중/장 `STY` 색/굵기**(`_warmA(.5)`·w1.2·gold0.85 등)가 공통 규약(`CW.bold`/`CW.hair`+alpha 규약)과 불일치.
- **trend** (`_drawTrendLayers`): 장/중/단 3 회귀창+채널+피봇 S/R선을 그림. 강조가 **기간(long 최굵)** 기준 — 분석 `ta.dominant`(최고 R² 창, 실측 "short")와 불일치. weak(R²<0.15) 디밍은 있음.

목표: fib에 교차-degree 합류 강조 신설 + 중/장 스타일을 공통 규약으로 정렬, trend는 **지배창(`ta.dominant`) 강조**로 전환 + 디밍/채널/피봇을 공통 규약으로 정렬. **4지표 시각 언어 통일.**

## 2. 핵심 제약 (불변 규율)

- **엔진 완전 불변**: `forge-core.js` 미변경. fib degrees·trend windows는 이미 계산되어 있으므로 **작도(`forge-draw.js`)만** 수정. `analyzeFib`/`analyzeTrend`의 bias·필드·`run()` 무접촉 → 단위테스트 244/244 그대로.
- **좌측 컬러 라인 금지** ([[no-left-accent-line]]): 위계는 굵기·alpha·라벨·색 계열로만. accent bar/rail·inset box-shadow·::before 세로 마커 금지.
- **reveal 게이팅**: 시뮬레이션 재생 중 형제 지표와 노출 타이밍 정합(기존 fib/trend의 reveal 로직 유지).
- **라벨 클러터 방지**: 강조/핵심/합류만 라벨(디밍은 라벨 생략).

## 3. 비목표 (YAGNI)

- fib를 `collectAnchors` 상위 N 스윙으로 더 넓히는 것(현 3 degrees로 충분 — 사용자 결정). 
- trend에 스윙 대각 추세선 신규 추가(현 회귀창 유지 — 사용자 결정, 시각 언어만 통일).
- 엔진 bias의 다중스케일화(별도 큰 과제, 향후).

## 4. 공통 위계 시각 규약 (codify)

S/R(Task 4)·Gann이 쓰는 언어. trend·fib를 여기 맞춘다.

| 구분 | lineWidth | alpha | dash | 라벨 |
|---|---|---|---|---|
| 강조(핵심·근접·지배) | `CW.bold` | ≈0.9 | 실선/핵심대시 | O |
| 디밍(보조) | `CW.hair` | `max(0.12, 0.15 + sig*0.4)` 또는 낮은 고정 | fine-dash | X |
| 합류(confluence) | `CW.bold` | ≈0.95 | 실선 | O + ✦ |

- 방향색(trend: 상승 `FC_BULL`/하락 `FC_BEAR`/횡보 중립)·fib 골드 계열은 유지. 위계는 굵기·alpha·라벨로만 표현.

## 5. 아키텍처 (forge-draw.js만)

### 5.1 fib — `_drawFibLayers` 위계 통일 + 교차 합류

기존 구조(단기 풀 그리드 + 중/장 핵심 레벨)를 **유지**하되:

- **교차-degree 합류(신설)**: 함수 초입에서 전 degree(`fib.degrees`)의 핵심 되돌림 레벨 가격을 근접(범위 비율 tol≈0.006)으로 클러스터 → **2개 이상 degree가 겹치는 가격 = 합류**. 합류 가격 집합을 만들어, 각 레벨 그릴 때 합류면 **최강조(`CW.bold`+alpha0.95+✦+라벨)**. draw-side 순수 계산.
- **중/장 스타일 정렬**: `STY` 맵의 bespoke 색/굵기(`_warmA(.5)`·w1.2·`rgba(201,146,46,.85)`·w1.6)를 **공통 규약**으로 — 중기=디밍(`CW.hair`·중간 alpha), 장기=더 디밍(`CW.hair`·낮은 alpha). degree 위계는 alpha로(단기>중기>장기). 색은 골드 계열 유지.
- 단기 풀 그리드(핵심/합류 강조·나머지 디밍)는 이미 규약과 정합 — **유지**. 단기의 confluent 판정에 교차-degree 합류도 반영.
- 라벨: 핵심비율 + 합류만(기존 클러터 정책 유지). reveal 게이팅(retr≥1·ext≥2·zone≥3) 유지. `fiToX`·`pToY`·`_skFrac` 유지.

### 5.2 trend — `_drawTrendLayers` 시각 언어 정렬

- **장/중/단 3 회귀창·채널·피봇 S/R선 유지**, 방향색 유지.
- **강조창 선택**: `ta.dominant`(있으면) 또는 R²(`r2Log`/`r2`) 최고 창을 강조(핵심), 나머지 디밍. 강조=`CW.bold`+라벨, 디밍=`CW.hair`+낮은 alpha+라벨은 `_labelMode==='all'`에서만.
- **weak(R²<0.15)**: 현행 디밍 유지하되 alpha를 공통 규약(`max(0.12,…)`)으로 정렬.
- **채널·피봇 S/R선**: 디밍-컨텍스트 스타일(fine-dash·낮은 alpha)로 언어 정렬(현재 이미 흐리지만 규약값으로 통일).
- 투영선(미래)·라벨·손그림(`_skReady`) 로직은 기존 유지.

## 6. 파일별 변경

| 파일 | 변경 |
|---|---|
| `forge-draw.js` | `_drawFibLayers`(degrees 순회+합류+위계) · `_drawTrendLayers`(강조창 선택+디밍 규약 정렬) |
| `forge.html` | `?v=` 캐시버스터 갱신(draw) |

- `forge-core.js`·`forge-ui.js`·테스트 파일 **미변경**.

## 7. 테스트 / 검증

- **회귀**: `node --test forge-core.test.js` → 244/244 그대로(엔진 미변경 실증).
- **문법**: `node --check forge-draw.js`.
- **시각(헤드리스)**: 데모 씨딩(makeDemoSeries→ticker노드→runForge)으로:
  - fib: 단기 강조 + 중/장기 표시(디밍) + 교차 degree 합류 ✦ 확인. 라벨 클러터 없음.
  - trend: 지배창 강조 + 나머지 디밍 + 채널/피봇선 디밍 정렬 확인.
  - **4지표 시각 일관성**: S/R·structure·trend·fib 강조/디밍 언어가 통일되어 보이는지 합동 스크린샷.
- 콘솔 에러 0.

## 8. 리스크 / 완화

- **fib 3-degree 클러터**: 36레벨(3×12)이 겹쳐 복잡해질 수 있음 → 디밍 강하게(장기 alpha 낮게)+라벨은 핵심/합류만. 실차트 헤드리스로 튜닝(degree base alpha·tol).
- **trend 강조창 오선택**: `ta.dominant`가 null일 때 R² 폴백. 강조창이 없으면(전부 weak) 현행 동작 유지.
- **합류 계산 비용**: 36레벨 클러스터링은 O(레벨²) 소규모 → 무시 가능(draw 프레임 캐시 밖 1회).

## 9. 스코어카드

엔진 불변(작도 개선)이므로 백테스트 성적 무변화. 스코어카드 개선이력에 "추세선·fib 위계 통일 — 4지표 작도 언어 통일, 엔진 불변" 1줄([[scoopforge-scorecard-changelog]]).
