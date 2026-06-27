# 스쿱포지 — 연속형(과거+예측) 메인 차트 설계

- 날짜: 2026-06-27
- 선행: BTC/USD 풀 샘플 포지 배포. R2에서 "대표=이미지 + 200px 미래존(자체 y축, 이미지축 정밀정렬은 R5로 미룸)" 구조로 둔 것의 미완성 지점 해소.
- 문제: 대표 영역이 정적 이미지 + 분리된 200px 예측 콘이라, **분석 중인 시계열을 그린 차트가 없고 예측이 그 차트에서 이어지지 않음**(샘플에서 그대로 드러남).

## 0. 결정 (브레인스토밍)

1. **차트 모드 조건 = `_visionData`(분석 시계열) 존재.** 시계열이 있을 때만 대표 영역을 연속 차트로 그림(샘플·R5b 비전 추출 결과). 데모 분석엔 영향 없음.
2. **과거 윈도우 = 최근 ~180pt.** (전체 480 압축 아님 — 우측 예측 구간 비율 자연스럽게.)
3. **시계열 있으면 대표 영역을 차트로 교체.** 정적 이미지(smp_main 등)는 시계열 없는 경우(사용자가 차트 스크린샷만 업로드)의 폴백으로만.
4. **재생도 차트 위 모핑.** ▷ 포지 분석 재생이 연속 차트의 예측 구간을 프레임마다 모핑.

## 1. 동작 규칙 (모드 분기)

`renderChart(result, data)` 및 재생에서 전역 `_visionData` 로 분기:
- `_visionData` 존재 → **차트 모드**: `#fcMainChart`(전폭) 표시 + `#fcHeroImg`/`#fcFuture` 숨김. `fcDrawMainChart(currentData().price, pred)`.
- `_visionData` 없음 & `themeState.imgId` 있음 → **이미지 모드**(현행): `#fcHeroImg`(이미지) + `#fcFuture`(200px 콘). `renderHero()` + `fcDrawFuture(pred)`.
- 둘 다 없음(데모/빈) → 현행 placeholder + `fcDrawFuture` 미리보기.

데모만 있는 포지는 차트 모드 미발동(회귀 0). 시계열이 생기는 순간(샘플 로드/비전 결과 반영)만 연속 차트.

## 2. 연속 차트 렌더 — `fcDrawMainChart(series, pred)`

대표 패널 전폭 캔버스 `#fcMainChart` 하나에 과거+예측을 **공유 y축**으로:

- **윈도우**: `hist = series.slice(-180)`. (series<180이면 전체.)
- **x 배분**: 전체 폭을 `hist.length : pred.path.length` 비율로 좌(과거)·우(예측) 분할. 좌우 패딩 8px, 상하 16px.
- **y 범위**: `min/max(hist ∪ pred.lo ∪ pred.hi ∪ pred.anchor)` + 10% 패딩. 과거·예측 동일 축.
- **과거**: hist 종가 라인(`FC_GOLD`/그린 계열, lineWidth 2). 마지막 점 = anchor.
- **이음새("지금")**: 과거/예측 경계 x에 세로 점선(`#2b3647`) + "지금" 라벨. 예측은 **anchor(=마지막 종가)에서 연속 시작**.
- **예측**: 콘 채움(lo/hi, `rgba(232,180,99,.14)`) + 점선 경로(`FC_GOLD`, dash[5,4]). `fcDrawFuture`의 콘/경로 공식 재사용하되 좌표를 연속 캔버스 기준으로.
- **라벨**: 우측 y축에 최고/최저가, 마지막 종가, 예측 종착가(소수 적당히). 좌상단 작은 타이틀(예: 분석 시계열 / "지금" 기준).
- `fcFit(cv, h)`로 DPR 대응(기존 패널과 동일).

## 3. 레이아웃 (DOM/CSS)

`.fc-hero`(flex row)에 캔버스 추가:
```html
<div class="fc-hero">
  <div class="fc-hero-img" id="fcHeroImg">…</div>   <!-- 이미지 모드 -->
  <canvas id="fcFuture" class="fc-cv"></canvas>      <!-- 이미지 모드 200px 콘 -->
  <canvas id="fcMainChart" class="fc-cv"></canvas>   <!-- 차트 모드 전폭 -->
</div>
```
- `#fcMainChart{flex:1;height:100%}` (차트 모드).
- 모드 토글: 차트 모드 → `#fcMainChart` `display:block`(flex:1), `#fcHeroImg`/`#fcFuture` `display:none`. 이미지 모드 → 반대. 토글 헬퍼 `fcHeroMode(mode)`.
- 패널 헤더 라벨(`fc-t`)은 차트 모드에서 "분석 차트 · 과거+예측"으로 갱신(이미지 모드는 "대표 이미지 · 가격 차트").

## 4. R5a "포지 분석" 재생 연동

- 현재 재생(`playAnalysis`)은 단계별 보간 예측을 `fcDrawFuture`로 모핑.
- 차트 모드에선 프레임마다 `fcDrawMainChart(currentData().price, 보간예측)` 재호출 → **과거 고정, 예측 콘만 수렴 모핑**(실제 차트 위에서). 이미지 모드는 기존 `fcDrawFuture` 모핑 유지.
- 공통 진입점 `fcRenderForecast(pred)`: `_visionData` 있으면 `fcDrawMainChart(currentData().price, pred)`, 없으면 `fcDrawFuture(pred)`. `renderChart`와 `playAnalysis`가 이 함수만 호출 → 분기 한 곳.

## 5. 검증

- **헤드리스(실 chromium)**: 샘플 로드 → `#fcMainChart` 표시(이미지/200px콘 `display:none`), 과거 라인 + "지금" 이음새 + 예측 콘이 한 캔버스에 연속, y축 라벨 존재, 콘솔 에러 0. 스크린샷 육안.
- **회귀**: 시계열 없는 데모/이미지-only 포지에서 차트 모드 미발동(기존 이미지/placeholder 동작 유지).
- **재생**: ▷ 포지 분석이 차트 위에서 예측 모핑(중간 프레임 캡처).
- **배포**: forge.html (forge-core 변경 없음). `forge_*.json` 불가침.

## 6. 비범위

- 캔들(OHLC) 차트 — 현재 종가 라인(샘플=종가). `data.candle` 있을 때 캔들 렌더는 이후.
- 이미지 위 픽셀 정밀 보조선(R5b-2).
- 줌/팬·툴팁 등 차트 인터랙션.

## 7. 산출물 요약

| 파일 | 변경 |
|---|---|
| `forge.html` | `#fcMainChart` 캔버스 + CSS, `fcDrawMainChart()`, `fcHeroMode()`, `fcRenderForecast()` 분기, `renderChart`/`playAnalysis`가 분기 진입점 사용 |
| `forge-core.js` | 변경 없음 |
