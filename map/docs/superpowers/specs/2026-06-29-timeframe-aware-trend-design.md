# 타임프레임 인지 추세 가중 (Timeframe-Aware Trend) — 설계

- 작성일: 2026-06-29
- 대상: 스쿱포지(Scoop Forge) — `forge.html` + `forge-core.js`
- 선행: [다각도 추세 분석](2026-06-29-multi-angle-trend-design.md) (이미 구현·배포됨)
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 배경 / 문제

다각도 추세(`analyzeTrend`)는 블렌드 가중치가 **타임프레임과 무관하게 고정**(`장0.5·중0.3·단0.2`)이고, 예측 추세성분도 모든 차트에 동일하게 적용된다.

사용자 요구: **분석 최초 이미지의 차트 타임프레임에 따라 접근을 달리한다.**
- 월봉 이상(장기) → 장기추세에 더 가중, **예측 가격에도 더 강하게 반영**.
- 일·주봉(중기) → 균형.
- 인트라데이(분·시간, 단주기) → 장기 비중↓, 예측 추세 영향↓.

타임프레임은 비전 분석에서 추출된 `_visionTF` 문자열(예: "일봉", "월봉", "1시간")로 이미 존재한다. `_tfUnit()`가 개월/주/일/봉으로 분류하지만, 추세 가중에는 쓰이지 않고 있다.

## 2. 목표

타임프레임을 3단계로 분류해, **작도 블렌드 가중치**와 **예측 추세 강도**를 티어별로 조정한다. 단일 출처(`ForgeCore`) 원칙을 유지해 작도·예측이 같은 프로파일을 공유한다.

### 비목표 (YAGNI)
- 타임프레임 수동 오버라이드 UI(자동 감지값 사용).
- 3중 회귀선의 시각(굵기/색) 자체를 티어별로 바꾸기 — 선은 항상 3개 그대로, 변하는 건 블렌드(예측 주도)와 라벨.
- 연속 스케일(단계 없는 함수) — 3단계 버킷으로 충분.

## 3. 아키텍처 (단일 출처 — 선행 설계 연장)

타임프레임→프로파일 매핑을 코어 순수 함수 하나로 두고, 예측(`run`)과 작도(`forge.html`)가 공유한다.

## 4. 코어: `ForgeCore.trendProfileForTF(tf)` (신규 순수 함수)

```js
trendProfileForTF(tf:string|null) → {
  tier:   "long" | "mid" | "intra" | "default",
  weights:{ long:number, mid:number, short:number },  // analyzeTrend로 전달
  trendScale:number,                                   // 예측 추세성분 배율
  label:  string                                       // 범례 표시용(한국어)
}
```

### 4.1 분류 (순서 중요)
tf 문자열 정규식 매칭, **위에서부터** 첫 매치:
1. `/월|분기|년|연/` → **long** (월봉+). ("분기"의 `분`이 intra로 새지 않게 long을 먼저 검사)
2. `/주|일/` → **mid** (일·주봉)
3. `/분|시간|시/` → **intra** (인트라데이)
4. 그 외(`null`·`""`·"봉"·미상) → **default**

### 4.2 프로파일 표

| tier | 조건 | weights 장/중/단 | trendScale | label |
|---|---|---|---|---|
| long    | 월봉+        | 0.6 / 0.3 / 0.1  | 1.0  | "월봉 장기가중" |
| mid     | 일·주봉      | 0.45 / 0.35 / 0.2| 0.8  | "일·주봉 균형" |
| intra   | 분·시간      | 0.25 / 0.35 / 0.4| 0.45 | "단주기 단기가중" |
| default | 미상/기타    | 0.5 / 0.3 / 0.2  | 0.8  | "" (라벨 없음) |

- 순수 함수(부수효과 없음). `tf`가 falsy면 default.

## 5. 예측 연동: `forge-core.js` `run(graph, data, opts)`

- `opts.timeframe`(문자열)을 받아 `const prof = trendProfileForTF(opts && opts.timeframe)`.
- 기존 `analyzeTrend(price, {...})` 호출에 `weights: prof.weights` 추가 → 블렌드 기울기가 티어별로 장기/단기로 기운다.
- 추세성분에 배율 적용:
  현행 `const trend = trS * k * Math.exp(-k / (futW * 1.6));`
  → `const trend = trS * prof.trendScale * k * Math.exp(-k / (futW * 1.6));`
- `runSteps`는 내부에서 `run(graph, data, opts)`로 opts를 그대로 전달하므로 별도 수정 불필요(전파됨).

> 주의: `trendScale`은 예측 추세 투영의 크기만 스케일한다. 평균회귀·모멘텀·계절성·밴드는 불변. default·mid가 0.8이라 선행 구현(암묵 1.0) 대비 추세 영향이 다소 완화되나, 이는 의도된 튜닝(타임프레임 미상 차트도 과도 외삽 억제). 회귀 테스트로 NaN·급변 없음 확인.

## 6. 작도: `forge.html`

### 6.1 엔진 호출부에 timeframe 전달
- `runForge()`의 `ForgeCore.run(g, d, { futW: visionFutW(), visionBias: visionBiasLive() })` → `, timeframe: _visionTF` 추가.
- `playAnalysis`의 `ForgeCore.runSteps(boardToGraph(), currentData(), { futW: visionFutW(), visionBias: visionBiasLive() })` → `, timeframe: _visionTF` 추가.

### 6.2 작도 `analyzeTrend` 호출에 weights 전달
`_drawEvidence`의 차트·오버레이 두 trend 분기에서, `analyzeTrend(price, { shortLen, pivotSwing, channelK })` 호출에 `weights: ForgeCore.trendProfileForTF(_visionTF).weights` 추가. (3중선 작도 자체는 weights와 무관하나, `blend`/`dominant` 정합을 위해 동일 프로파일 사용)

### 6.3 범례 라벨에 티어 표시
trend 범례 텍스트를 동적으로: `EV_LABEL.trend` 기본 "추세선(다각도)"에 프로파일 라벨이 있으면 `· {label}` 덧붙임 → 예) "추세선(다각도·월봉 장기가중)". 구현은 `_drawEvidence` trend 분기에서 `legend.push`할 때 `t`를 동적 조립(상수 `EV_LABEL.trend`는 유지).

## 7. 테스트 (`forge-core.test.js`)

- `trendProfileForTF`: 입력 "월봉"→long(0.6/0.3/0.1, scale 1.0), "일봉"·"주봉"→mid, "1시간"·"5분"→intra(0.25/0.35/0.4, scale 0.45), "분기"→long(분 오분류 안 됨), `null`→default(0.5/0.3/0.2, scale 0.8).
- `run` 타임프레임 반영: 동일 상승 데이터에 `opts.timeframe:"월봉"` vs `"5분"` → 월봉의 `gain=target/anchor`가 더 큼(장기 가중+배율 1.0 vs 0.45). 두 경로 모두 `path` 유한(NaN 없음).
- 회귀: `opts.timeframe` 없이 호출해도(=default) 예외 없이 동작, path 유한.

## 8. 영향 / 호환

- 데이터 모델 변경 없음. `analyzeTrend` 시그니처 불변(기존 `weights` opt 재사용).
- `trendProfileForTF`는 순수 함수 → 테스트 용이, export 추가.
- 단일 HTML·바닐라 JS·무빌드 유지. 다크 토큰·한국어 UI 유지.
- 작도·예측 정합 강화(같은 프로파일 공유).
