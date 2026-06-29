# RSI 심화 (RSI Depth) — 설계

- 작성일: 2026-06-29
- 대상: 스쿱포지(Scoop Forge) — `forge.html` + `forge-core.js`
- 선행: 추세선·MA·피보·엘리어트 심화 + 시연 상세화 프레임워크(Plan B) 구현·배포됨.
- 상태: 설계 승인됨 (구현 계획 대기)
- 위치: 도구 심화 로드맵 **4번(RSI)**. 단일출처·TF가중·다레이어 reveal 작도·시연 단계 패턴 재사용 + RSI 오실레이터 서브패널 신설.

## 1. 배경 / 문제

현재 RSI(`rsi`)는 가장 얕다:
- eval: `rsiSeries(arr, period)` — 정규화 RSI((rsi-50)/50) 시계열.
- 작도: **없음** — 차트·오버레이 분기 모두 범례 칩("RSI N 과열/과매도")만 push(legend-only).
- 신호: `cl(last)`(정규화 RSI).
- 시연: `nodeReadText` "RSI N · 과열/과매도/중립" 한 줄.

문제: RSI는 0~100 오실레이터라 가격 위 직접 작도가 없어 텍스트만 있고, **다이버전스·구간·50선·추세 분석이 없으며**, 예측 반영이 단순값이고 전용 시각화(오실레이터 패널)가 없다.

## 2. 목표

전문가급 RSI 분석으로 심화: 다이버전스 검출(가격 vs RSI)·과열/과매도 구간·50선/추세 + **RSI 오실레이터 서브패널** 신설. 예측·작도·시연에 일관 반영. 시연은 Plan B 프레임워크 재사용. 기존 `rsiSeries`(블록 값)는 불변.

### 비목표 (YAGNI)
- 다중 기간 RSI·스토캐스틱RSI·RSI+다른 지표 합류.
- 히든 다이버전스(클래식 다이버전스만).

## 3. 아키텍처

RSI 분석을 코어 순수 함수 `analyzeRSI`로 모아 예측(`run`)·작도(`_drawRsiLayers`)·서브패널(`fcDrawRsi`)이 공유. 시연 텍스트는 코어 `rsiSteps`로 분리(테스트 가능). 기존 `rsiSeries`(블록 값 시계열) 유지(combine→signal 경로 불변).

## 4. 코어: `ForgeCore.analyzeRSI(price, opts)` (신규 순수 함수)

```js
analyzeRSI(price, { period=14, swing=0.03 }) → {
  series: number[],                       // RSI 0~100 (price와 동일 길이)
  last: number, zone: "overbought" | "oversold" | "neutral",   // ≥70 / ≤30 / 그 외
  trend: number,                          // 최근 RSI 기울기(-1..1, tanh)
  cross50: "above" | "below" | "cross_up" | "cross_down",       // 50선 상태/최근 교차
  divergence: { type: "bullish" | "bearish" | null, pricePts: [{idx,price},{idx,price}] | null },
  bias: number,                           // -1..1
}
```

### 4.1 RSI 0~100 시계열
- Wilder RSI(기존 `rsiSeries` 로직 재사용하되 0~100로): `rsi100 = (rsiSeries_value × 50) + 50` 또는 동일 공식 재계산. `series[i]` = i번째 봉 RSI(0~100). `last = series[P-1]`.
- `zone`: last≥70 overbought, last≤30 oversold, else neutral.

### 4.2 추세·50선
- `trend`: 최근 `min(period, P-1)`봉 RSI 회귀 기울기 → tanh 정규화(-1..1).
- `cross50`: 현재 last>50 above / <50 below. 직전 봉이 반대편이었으면 `cross_up`(아래→위)·`cross_down`(위→아래).

### 4.3 다이버전스 (클래식)
- `detectSwings(price, swing)`로 가격 피벗. 최근 **저점 2개**(강세 후보)·**고점 2개**(약세 후보) 식별.
- **강세(bullish)**: 가격 저점2 < 저점1 (LL) 이고 RSI(저점2 idx) > RSI(저점1 idx) (HL).
- **약세(bearish)**: 가격 고점2 > 고점1 (HH) 이고 RSI(고점2 idx) < RSI(고점1 idx) (LH).
- 둘 다 성립 시 더 최근 피벗 기준 택1. 없으면 `type:null, pricePts:null`. `pricePts` = 작도용 두 가격 피벗 `[{idx,price},{idx,price}]`.

### 4.4 bias
- `divDir`: bullish=+1, bearish=−1, null=0.
- `zoneDir`: oversold=+0.5, overbought=−0.5, neutral=0 (역추세 회귀 관점: 과매도→반등).
- `crossDir`: cross_up=+0.3, cross_down=−0.3, else 0.
- `bias = clamp(-1, 1, 0.5×divDir + zoneDir + 0.3×crossDir)` (다이버전스 우선, 구간·교차 보조).

## 5. 예측 연동: `forge-core.js` `run`

- `run`에서 RSI 블록이 있으면 `analyzeRSI(price, {period})`로 `bias` 산출.
- `rsiDrift = bias × trendProfileForTF(opts.timeframe).trendScale × 0.06` (±6% 상한 — RSI는 역추세/진동 신호라 추세성분보다 보수적·TF가중). 예측 루프 `m`에 `+ rsiDrift × (k/futW)` 가산(단일경로·이중계상 방지). RSI 블록 없으면 0.
- period: 정수 그대로(`(_rn.params&&_rn.params.period)||14`).

## 6. 작도(가격 hero): `forge.html` `_drawRsiLayers(c, rsi, M)` (차트·오버레이, reveal 인지)

- `M = {fiToX, pToY, nowFi, fiMin, reveal, xRight}`. `_evLabel`(경계 클램프). `c.save()/restore()`.
- 레이어:
  1. **다이버전스 선**(reveal≥1): `divergence.pricePts` 두 가격 피벗을 잇는 선(강세=`#46c28e`/약세=`#e06a6a`, 점선) + "강세/약세 다이버전스" 라벨. 다이버전스 없으면 생략.
  2. **값/구간 배지**(reveal≥2): 우상단 `_evLabel` "RSI 62 · 과열근접/과매도/중립" (zone색).
- 기존 RSI legend-only 분기(차트·오버레이 2곳)를 `analyzeRSI`+`_drawRsiLayers` 호출로 교체(+범례 "RSI"→"RSI(전문)"). `reveal: _playing ? (_evReveal[n.id]||0) : Infinity`.

## 7. RSI 오실레이터 서브패널 (신규)

- 결과 패널(`.fc-wrap`)에 `#fcRsiPanel`(`.fc-panel`, 캔버스 `#fcRsi`) 추가 — 주기/폴드 패널과 같은 형식, 높이 ~120px.
- `fcDrawRsi(rsi)`: 0~100 매핑 곡선 + **30/70 음영대**(과매도/과열) + **50 중심선**(점선) + 현재값 라벨 + 다이버전스 피벗 마커(가격 피벗 idx의 RSI 위치). 색: 골드 곡선, 과열 bear soft·과매도 bull soft.
- **표시 조건**: RSI 블록이 보드에 있을 때만(없으면 패널 숨김) — 기존 `togglePhasefoldPanels()` 방식 차용(`toggleRsiPanel()`). renderChart에서 `fcDrawRsi(analyzeRSI(...))` 호출.
- 분석 전/RSI 블록 없음: 패널 숨김 또는 "RSI 블록 없음" 안내.

## 8. 시연 (Plan B 프레임워크 재사용)

- 코어 `rsiSteps(rsi) → string[5]`(테스트 가능): ① "RSI {last} · {구간}" ② "50선 {above/below} · 추세 {상승/하락/횡보}" ③ 다이버전스 있으면 "{강세/약세} 다이버전스" 없으면 "다이버전스 없음" ④ "RSI 오실레이터 갱신" ⑤ "종합 방향 {상승/하락/중립} (bias {n})".
- `analysisSteps` RSI 케이스: `n.blockType==="rsi"` → `ForgeCore.analyzeRSI(price,{period})` → `rsiSteps`, layers `[1,1,1,2,2]`(hero 작도가 다이버전스=1·배지=2뿐이라 레이어 적음).

## 9. 테스트 (`forge-core.test.js`)

- `analyzeRSI`:
  - 단조 상승 데이터 → `last` 높음·`zone:"overbought"`(또는 근접), `trend>0`.
  - 강세 다이버전스 합성(가격 LL·RSI HL) → `divergence.type:"bullish"`, `bias>0` 경향.
  - 약세 다이버전스 → `bearish`.
  - 소량/피벗부족 → 폴백(divergence null, bias 유한, 예외 없음).
- `rsiSteps`: 5단계 텍스트, 구간·다이버전스·bias 반영.
- 예측: RSI 블록 + 강세 다이버전스 데이터에서 RSI 유무로 타깃 격리(notStrictEqual), `timeframe:"월봉"` vs `"5분"` 차이, 둘 다 유한.

> 다이버전스 합성 데이터가 detectSwings와 어긋나면 테스트 데이터만 조정(단언·로직 불변).

## 10. 영향 / 호환

- RSI 블록 `params.period` 유지. `analyzeRSI`·`rsiSteps` 순수/결정적 → 테스트 용이. export 추가.
- 기존 `rsiSeries`(블록 값) 불변 → combine 경로 회귀 없음.
- 신규 서브패널은 RSI 블록 있을 때만 표시(없으면 기존 UI 불변).
- 시연 프레임워크 재사용. 단일 HTML·바닐라 JS·무빌드·다크 토큰·한국어·작도/예측 정합·noindex 유지.
