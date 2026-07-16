# 추세선·fib 위계 통일 (작도 전용) 설계

- 날짜: 2026-07-16
- 상태: 설계 승인됨 (구현 대기)
- 선행: S/R·structure 다중스케일 위계(`2026-07-16-multiscale-sr-structure-design.md`) · Gann 다중앵커. 배경 메모리 [[scoopforge-multiscale-drawing]]
- 백로그: `docs/BACKLOG.md` 항목 0 [남은 확장]

## 1. 배경 / 목표

Gann·S/R·structure에 적용한 "데이터기반 다중스케일 + 중요도 위계(강조/디밍)"를 **추세선(trend)**·**피보나치(fib)** 작도에도 통일한다. 두 지표는 이미 다중스케일 데이터를 계산하지만 상태가 다르다:

- **fib** (`_drawFibLayers`): `analyzeFib`가 **단/중/장 3 degrees**(각 12레벨·zone·swing)를 계산하나, 작도는 **단기(shortDeg) 하나만**. 중/장기는 bias 블렌드용으로만 계산되고 미표시.
- **trend** (`_drawTrendLayers`): **장/중/단 3 회귀창**+채널+피봇 S/R선을 이미 그림. 굵기·방향색·weak(R²) 디밍의 자체 위계 보유.

목표: fib는 3 degrees를 다 그리고 위계 부여, trend는 강조/디밍 **시각 언어를 4지표 공통 규약**으로 정렬.

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

### 5.1 fib — `_drawFibLayers` 재작성

- 현재 `fib.levels`(단기) 대신 **`fib.degrees` 순회**(단/중/장). 각 degree의 `.levels` 작도.
- **degree 기반 base 위계**: `단기`=강조 티어 / `중기`=중간 / `장기`=디밍. (degree base alpha 예: 단기 0.9·중기 0.5·장기 0.28에 핵심비율/합류 가중.)
- **핵심비율**(0.382/0.5/0.618 되돌림·1.618/2.618 확장)은 해당 degree 내 강조+라벨, 비핵심은 그 degree base alpha로 디밍.
- **교차-degree 합류**: 모든 degree의 레벨 가격을 근접(범위 비율 tol)으로 클러스터 → 2개 이상 degree가 겹치는 가격은 `confluent`로 승격(bold + ✦ + 라벨). draw-side 계산(순수).
- 라벨: 핵심비율 + 합류만(기존 클러터 정책). 확장 목표는 우측, 되돌림은 좌측(기존 유지).
- reveal 게이팅: `reveal>=1` 되돌림, `reveal>=2` 확장, `reveal>=3` 골든존(기존 단계 유지, 전 degree에 적용).
- 좌표/스케일 매퍼(`fiToX`·`pToY`·`xL`/`xR`)와 `_skFrac`(손그림) 진행은 기존 유지.

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
