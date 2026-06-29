# 다각도 추세 분석 (Multi-Angle Trend Analysis) — 설계

- 작성일: 2026-06-29
- 대상: 스쿱포지(Scoop Forge) — `forge.html` + `forge-core.js`
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 배경 / 문제

TSLA 월봉 같은 **장기 강추세** 종목을 분석할 때 추세선이 제대로 안 나온다.

현재 추세 로직은 세 군데에 **따로** 존재한다:

| 위치 | 동작 | 룩백 |
|---|---|---|
| 추세 블록 신호 (`forge-core.js`, `evalGraph` 내 `blockType==="trend"`) | `rollingSlope(가격, len)` | 기본 40봉 |
| 작도 선 (`forge.html` `_drawEvidence` trend 분기, 차트/오버레이) | 최근 `len`봉 회귀선 1개 | 기본 40봉 |
| 예측 추세성분 (`forge-core.js` 투영부 `trSlope`/`trS`) | 로그가격 장기회귀 기울기, ±1.2%/봉 캡 | 고정 40% 창 |

증상:
- **작도가 최근 40봉만** 회귀 → 월봉이면 오른쪽 끝 토막만 그려져 "추세선이 안 보임/마지막 부분만 그려짐".
- **다각도(여러 룩백) 분석 없음** — 단일 회귀선 하나뿐.
- **예측 추세성분이 작도와 따로 놀고** ±1.2%/봉 강한 캡에 눌려 장기추세를 거의 반영 못 함.

## 2. 목표

전문가급 다각도 추세 분석을 **선으로 전부 작도**하고, **같은 분석이 예측 가격에도 일관되게 반영**되게 한다.

- 작도: 장/중/단 3중 회귀선 + 피봇 지지/저항 추세선 + 회귀 채널(±σ) + 강도/각도 라벨.
- 예측: 장기 우선·R² 가중 블렌드 기울기로 중심경로, 채널폭으로 예측 밴드, 과외삽 캡 완화.
- **단일 출처**: 추세 수학을 `ForgeCore.analyzeTrend()` 하나로 모아 작도와 예측이 항상 일치.

### 비목표 (YAGNI)
- 다중 타임프레임 데이터 동시 로드(여기선 단일 시계열의 여러 룩백 창만).
- 추세선 수동 편집/드래그.
- 채널 돌파 알림 등 신호 자동화.

## 3. 아키텍처 (접근법 A — 단일 출처)

추세 수학을 `forge-core.js`에 `analyzeTrend()` 함수 하나로 만들고 `ForgeCore`로 export.
`forge.html` 작도와 `forge-core.js` 예측이 **같은 결과 객체를 공유**한다 (현재처럼 두 곳에서 따로 계산해 어긋나는 문제 제거).

결과는 **인덱스(봉) 공간**으로 반환. 작도는 화면좌표 변환만(`toX/toY`·`xOf/yOf`), 예측은 로그기울기·채널σ만 사용.

## 4. 코어 API: `ForgeCore.analyzeTrend(price, opts)`

```js
analyzeTrend(price, {
  shortLen = 40,         // 단기 창 길이(봉)
  pivotSwing = 0.08,     // 지그재그 스윙 임계(비율)
  channelK = 2,          // 채널 ±k·σ
  weights = { long: 0.5, mid: 0.3, short: 0.2 },  // 블렌드 base 가중(장기 우선)
}) → {
  windows: {
    long:  { startIdx, m, slopeRaw, bRaw, slopeLog, r2 },  // long  = 전체 P봉
    mid:   { startIdx, m, slopeRaw, bRaw, slopeLog, r2 },  // mid   = 최근 round(P*0.5)
    short: { startIdx, m, slopeRaw, bRaw, slopeLog, r2 },  // short = 최근 shortLen봉
  },
  pivots: {
    support:    { slope, b, fromIdx, toIdx } | null,  // 스윙 저점 회귀(상승 지지)
    resistance: { slope, b, fromIdx, toIdx } | null,  // 스윙 고점 회귀(하락 저항)
    points:     [{ idx, price, type:"high"|"low" }],
  },
  channel: { slopeRaw, bRaw, sigma, k },     // 장기회귀 기준 ±k·σ (원시 잔차)
  blend:   { slopeLog, channelSigmaLog },    // 예측용
  dominant:"long"|"mid"|"short",             // |slopeLog|·r2 최대 창
}
```

### 4.1 창(window) 정의
- `long` = 전체 `P`봉 (장기추세 = 메인).
- `mid`  = 최근 `round(P*0.5)`봉.
- `short`= 최근 `min(P, shortLen)`봉.
- **소량 데이터 가드**: 창이 서로 겹치거나(예: `mid`/`short` 길이가 같아짐) `P < 15`이면 해당 창을 **`null`**로 둔다(작도에서 스킵, 블렌드에서 제외). 최소 `long`은 항상 존재(`P ≥ 2`); `P < 2`면 전체 `null` 반환(작도·예측 모두 추세성분 0).

### 4.2 회귀
- 각 창에서 **원시가격 선형회귀**(작도용): `slopeRaw`(봉당), `bRaw`(창 시작 인덱스에서의 값), `r2`.
- 동시에 **로그가격 선형회귀**(예측용·스케일 불변): `slopeLog`(봉당). 가격 ≤ 0 방어(`Math.max(1e-9, v)`).
- `r2` = 결정계수(원시 기준).

### 4.3 피봇 (고전 TA)
- 코어의 기존 지그재그 피벗 검출 로직 재사용(현재 `evalGraph` 부근 `trend/extIdx/extVal` 누적 검출 → 공용 헬퍼 `zigzagPivots(price, swing)`로 추출). `forge.html` `_zigzag`와 동일 결과를 보장하도록 임계 의미를 맞춘다.
- `support` = 최근 스윙 **저점들**에 선형회귀(또는 마지막 2저점 연결). `resistance` = 최근 스윙 **고점들**.
- 저점/고점이 2개 미만이면 해당 선 `null`.

### 4.4 채널
- `long` 원시회귀선 기준 잔차 `resid[i] = price[i] - (slopeRaw*i + bRaw)`.
- `sigma = std(resid)`. 상단 = long + `k·sigma`, 하단 = long − `k·sigma`.

### 4.5 블렌드 (예측용)
- `effWeightᵢ = baseWeightᵢ · r2ᵢ`. `slopeLog = Σ(effWeightᵢ·slopeLogᵢ) / Σ(effWeightᵢ)` (분모 0 방어).
- `channelSigmaLog` = `long` **로그**회귀 잔차의 표준편차(예측 밴드용, 스케일 불변).

## 5. 작도: `forge.html` `_drawEvidence` trend 분기

차트 모드(`mode==="chart"`)와 오버레이/콘 모드(`else`) **양쪽** 교체.
`analyzeTrend()` 한 번 호출 후 4레이어를 순서대로 그린다. 기존 다크 외곽선 대비 스타일 계승.

| 레이어 | 스타일 |
|---|---|
| 장/중/단 3중 회귀선 | 장기=2.6px 골드/그린(외곽 다크), 중기=2.0px 블루, 단기=1.6px 점선 muted. 각 선 예측영역까지 점선 연장 |
| 피봇 지지/저항 | 지지=`#46c28e` 점선, 저항=`#e06a6a` 점선. 스윙 구간~지금 연장 |
| 회귀 채널 | 장기선 ±k·σ 평행선(faint) + 옅은 밴드 채움 |
| 강도/각도 라벨 | 3중 회귀선·채널 우측 끝 소형 모노 라벨: 예) `장기 +1.2%/봉 R²0.94 ▲` |

- 좌표: 차트 모드 `toXh/toY`, 오버레이 `xOf/yOf`+`clipY` 사용(현 구조 그대로). 인덱스→x는 창 `startIdx`/`m` 기준.
- 라벨은 회귀선/채널만(피봇은 선만) — 클러터 제어. alpha·얇은 선 사용.
- `◈ 근거`(`_evidenceShow`) 토글·범례(`legend`) 그대로 적용. 범례 항목은 "추세선(다각도)" 단일 + 필요 시 채널 표시.

### 5.1 추세 블록 편집기 파라미터
`renderEditor`의 trend 행에 추가(`numRow`):
- `단기 길이(len)` (기존)
- `피봇 민감도(%)` → `pivotSwing`
- `채널 σ배수(k)` → `channelK`

`n.params = { len, pivotSwing, channelK }`. 미지정 시 기본값.

## 6. 예측 연동: `forge-core.js` 투영부

현 `trSlope`(고정 40% 로그회귀)·`trS`(±0.012 캡) 교체:
- 중심경로 추세성분 기울기 = `analyzeTrend(price, opts).blend.slopeLog`.
- 캡 완화: `trS = clamp(slopeLog, ±0.03)` (±1.2%/봉 → ±3%/봉). 감쇠 `trS*k*exp(-k/(futW*1.6))` 유지.
- 밴드: 채널 σ 결합 — `sd = √(sigBand² + (0.6·channelSigmaLog)²)·√k·0.85`.
- 추세 블록 파라미터(`shortLen`/`pivotSwing`/`channelK`)를 그래프에서 읽어 `analyzeTrend`에 전달(블록 없으면 기본값).

> 주의: 밴드/캡 변경은 타 종목 예측에도 영향. 보수적 계수(0.6·, ±0.03)로 시작하고 회귀 테스트로 급변 없음을 확인.

## 7. 테스트 (`forge-core.test.js` 추가)

- **완전 직선**: `r2≈1`, `slopeRaw`/`slopeLog` 정확, `blend.slopeLog ≈ 단일 기울기`.
- **지수성장(로그직선)**: `slopeLog` 일정, `channel.sigma`(원시)는 커도 `channelSigmaLog` 작음.
- **알려진 지그재그**: `pivots.points` 고점/저점 인덱스 정확, support/resistance 기울기 부호 타당.
- **노이즈 직선**: `channel.sigma > 0` 타당 범위.
- **소량 데이터(P<15)**: 가드 동작(예외 없이 `long`만 반환).
- **예측 회귀**: 동일 입력에서 캡 완화 전후 경로가 NaN 없이 단조 변화(스모크).

## 8. 영향 / 호환

- 데이터 모델 변경 없음(추세 블록 `params`만 확장 — 하위호환: 미지정 시 기본값).
- `analyzeTrend`는 순수 함수(부수효과 없음) → 테스트 용이.
- 단일 HTML/바닐라 JS·무빌드 원칙 유지. 외부 라이브러리 없음.
- 작도·예측 정합 원칙(CLAUDE.md) 강화.
