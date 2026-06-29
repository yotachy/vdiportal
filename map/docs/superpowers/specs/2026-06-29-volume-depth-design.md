# 거래량 심화 (Volume Depth) — 설계

- 작성일: 2026-06-29
- 대상: 스쿱포지(Scoop Forge) — `forge.html` + `forge-core.js`
- 선행: 추세선·MA·피보·엘리어트·RSI 심화 + 시연 상세화 프레임워크(Plan B) 구현·배포됨.
- 상태: 설계 승인됨 (구현 계획 대기)
- 위치: 도구 심화 로드맵 **5번(거래량) — 마지막**. 단일출처·TF가중·다레이어 reveal 작도·시연 단계 패턴 재사용 + 거래량 막대 서브패널 신설 + **거래량 데이터 합성(synthVolume)**.

## 1. 배경 / 문제

현재 거래량(`volume`)은 도구 중 가장 얕고, 분석 로직이 **흩어져 중복**돼 있다:
- eval: `evalBlocks` volume 케이스(256–257행) — 노드 자체 시계열 `n.series`를 통과만(블록 값).
- 예측: `run`에 **인라인 `volBias`**(652–664행) — 가격-거래량 확인 점수를 signal `bias`에 직접 가산(단일출처 아님, TF가중 없음, 형제 지표의 drift 경로와 불일치).
- 작도: **없음** — 거래량은 "참고 입력(계산 없음)" 블록.
- 시연: 전용 단계 없음.
- nodeExpert(우측 전문분석): volume 케이스(3278–3289행)가 또 **별도로** 최근/평균 비율·거래량 추세·가격-거래량 관계를 계산(중복 경로).

문제: 거래량 분석이 (a) 단일출처가 아니라 `run`·nodeExpert에 중복 구현, (b) 예측 반영이 형제 지표와 다른 경로(인라인 bias), (c) 전용 작도/시연/서브패널이 없으며, (d) **데모/샘플에 거래량 시계열이 아예 없어** 시연 불가.

## 2. 목표

전문가급 거래량 분석을 코어 단일 함수 `analyzeVolume`로 모아 예측·작도·시연·서브패널·nodeExpert가 공유. 거래량 데이터는 단일출처 `synthVolume`로 합성 폴백(항상 시연 가능). 시연은 Plan B 프레임워크 재사용. 기존 `evalBlocks` 블록값 통과 경로는 불변(combine→signal 회귀 없음).

### 비목표 (YAGNI)
- 거래량 프로파일(가격대별 거래량 분포)·VWAP·매물대.
- 거래량+다른 지표 합류, 멀티 타임프레임 거래량.
- 히든 다이버전스(클래식 가격-OBV 다이버전스만).

## 3. 아키텍처

```
synthVolume(price) ─┐ (volume 없거나 짧을 때 폴백)
                    ↓
price, volume ─→ analyzeVolume(price, volume, opts) ─→ { series, obv, trend, ratio, state,
                                                         obvTrend, relationship, divergence, bias }
                    │
   ┌────────────────┼─────────────────┬──────────────────┬─────────────────┐
   ↓                ↓                  ↓                  ↓                 ↓
 run (volDrift)  _drawVolumeLayers   fcDrawVol         volumeSteps      nodeExpert
 (예측)          (hero 차트/오버레이)  (서브패널)        (시연)           (전문분석)
```

- `analyzeVolume`·`synthVolume`·`volumeSteps`는 코어 순수/결정적 함수 → 단위테스트. export 추가.
- 기존 `evalBlocks` volume 통과(블록값) 유지. **인라인 `volBias`는 제거**하고 `analyzeVolume` 기반 `volDrift`로 단일화.

## 4. 데이터: `synthVolume(price)` (신규 순수 함수, 결정적)

```js
synthVolume(price) → number[]   // price와 동일 길이, 무작위 없음(결정적)
```

- 큰 가격 변동에 거래량이 동반되도록 합성: 각 봉의 수익률 절댓값과 보조 주기로 변조.
  - `ret[i] = i>0 ? (price[i]-price[i-1])/(|price[i-1]|||1) : 0`
  - `cyc[i] = 0.6 · |sin(i · 0.5)|` (결정적 소주기 — 거래량의 자연스러운 기복)
  - `vol[i] = round(BASE · (1 + 3.2·|ret[i]| + cyc[i]))`, `BASE = 1_000_000`
- price 길이 < 2면 `[]`. (상대 크기만 의미 있음 — 절대 단위는 표시용)

## 5. 코어: `analyzeVolume(price, volume, { len=12, spikeMult=1.5 })` (신규 순수 함수)

```js
analyzeVolume(price, volume, opts) → {
  series: number[],                  // 정렬된 거래량(price와 동일 인덱스; 폴백 시 synthVolume)
  obv: number[],                     // OBV 누적(price와 동일 인덱스)
  trend: number,                     // 거래량 기울기 -1..1 (tanh)
  ratio: number,                     // 최근3봉 평균 / 최근 len봉 평균
  state: "spike" | "contract" | "normal",   // ratio ≥ spikeMult / ≤ 1/spikeMult / 그 외
  obvTrend: number,                  // OBV 기울기 -1..1 (tanh)
  relationship: "confirm" | "weakening" | "selling" | "capitulation",
  divergence: { type: "bullish" | "bearish" | null,
                pricePts: [{idx,price},{idx,price}] | null },   // 가격-OBV 다이버전스
  bias: number,                      // -1..1
}
```

### 5.1 정렬 / 폴백
- `volume`이 배열이고 길이 ≥ 2면 사용, 아니면 `synthVolume(price)` 폴백.
- price·volume 길이 상이 시 **뒤쪽 겹치는 구간** 기준 정렬: `L = min(price.length, volume.length)`, 둘 다 마지막 L개 사용. 반환 `series`/`obv`는 길이 L(절대 가격인덱스 매핑용 offset = `price.length - L`).
- 마커/피벗 `idx`는 **절대 가격인덱스**(offset 가산)로 반환 → hero `fiToX`가 그대로 사용.
- L < 2면 폴백 객체: `{series:[], obv:[], trend:0, ratio:1, state:"normal", obvTrend:0, relationship:"weakening", divergence:{type:null,pricePts:null}, bias:0}`.

### 5.2 추세·급증
- `trend`: 정렬 거래량의 최근 `min(len, L-1)`봉 회귀 기울기 → `tanh` 정규화(-1..1). (정규화 분모는 `series` 평균으로 스케일 — `Math.tanh((f.b/(mean||1))·100)` 캡 [-1,1].)
- `ratio = recent3 / baseLen`, `recent3` = 마지막 3봉 평균, `baseLen` = 마지막 `min(len,L)`봉 평균.
- `state`: `ratio ≥ spikeMult` → `"spike"`(급증), `ratio ≤ 1/spikeMult` → `"contract"`(위축), 그 외 `"normal"`.

### 5.3 OBV
- 표준 OBV: `obv[0]=0`; `i≥1`: `obv[i] = obv[i-1] + (priceAligned[i] > priceAligned[i-1] ? series[i] : priceAligned[i] < priceAligned[i-1] ? -series[i] : 0)`.
- `obvTrend`: OBV 최근 `min(len,L-1)`봉 회귀 기울기 → `tanh` 정규화. (분모는 `max(|obv| 최댓값,1)`.)

### 5.4 가격-거래량 관계 (relationship)
최근 창(`pw = min(6, L-1)`)에서 `priceUp = priceAligned[L-1] > priceAligned[L-1-pw]`, `volUp = recent3 > baseLen`:
- priceUp & volUp → `"confirm"`(상승에 거래량 동반 — 추세 건강).
- priceUp & !volUp → `"weakening"`(상승하나 거래량 감소 — 추진력 약화).
- !priceUp & volUp → `"selling"`(하락에 거래량 증가 — 매도 압력).
- !priceUp & !volUp → `"capitulation"`(하락+거래량 위축 — 투매 진정·바닥 가능).

### 5.5 다이버전스 (가격-OBV, 클래식)
- `detectSwings(priceAligned, 0.03)`로 가격 피벗. 최근 저점 2개·고점 2개 식별.
- **강세(bullish)**: 가격 저점2 < 저점1 (LL) 이고 OBV(저점2 idx) > OBV(저점1 idx) (OBV HL).
- **약세(bearish)**: 가격 고점2 > 고점1 (HH) 이고 OBV(고점2 idx) < OBV(고점1 idx) (OBV LH).
- 둘 다 성립 시 더 최근 피벗 기준 택1. 없으면 `type:null, pricePts:null`. `pricePts` = 두 가격 피벗 `[{idx,price},{idx,price}]`(idx 절대 가격인덱스).

### 5.6 bias
- `divDir`: bullish=+1, bearish=−1, null=0.
- `confDir`: confirm=+1, weakening=−0.4, selling=−0.7, capitulation=+0.3.
- `obvDir`: `obvTrend`(이미 -1..1).
- `bias = clamp(-1, 1, 0.45·divDir + 0.35·confDir + 0.20·obvDir)` (다이버전스 우선, 확인 다음, OBV 보조 — 보수적).

## 6. 예측 연동: `forge-core.js` `run` (인라인 volBias 대체)

- **기존 인라인 `volBias`(652–664행) 및 `bias` 합산에서의 `volBias` 항 제거.** `aggregateConviction(graph) + vbias + volBias` → `aggregateConviction(graph) + vbias`.
- `run`에서 volume 블록이 그래프에 있으면 거래량 시계열 확보(`values[volN.id]`가 길이≥2면 사용, 아니면 `synthVolume(data.price)`) → `analyzeVolume(data.price, vol)`로 `bias` 산출.
- `volDrift = volume블록있음 ? analyzeVolume(...).bias · trendProfileForTF(opts.timeframe).trendScale · 0.05 : 0` (**±5% 상한** — 거래량은 확인지표라 가장 보수적·TF가중). 예측 루프 `m`에 `+ volDrift · (k/futW)` 가산(단일경로·이중계상 방지). volume 블록 없으면 0.
- volume 블록 판정: **형제 지표(MA/RSI 등)와 동일하게 블록 존재 기준** `graph.nodes.find(n => n.kind==="block" && n.blockType==="volume")` (predict 직접 연결 불필요 — 옛 인라인 volBias는 직접 엣지를 요구했으나 형제 일관성·샘플 정합을 위해 존재 기준으로 통일). 시계열은 해당 노드의 `series`(없으면 `synthVolume(data.price)`).

## 7. 작도(가격 hero): `forge.html` `_drawVolumeLayers(c, va, M)` (차트·오버레이, reveal 인지)

- `M = {fiToX, pToY, nowFi, fiMin, reveal, xRight}`. `_evLabel`(경계 클램프). `c.save()/restore()`. 형제 `_drawRsiLayers`/`_drawElliottLayers`와 동일 규약.
- 레이어:
  1. **가격-OBV 다이버전스 선**(reveal≥1): `divergence.pricePts` 두 가격 피벗을 잇는 선(강세 `#46c28e`/약세 `#e06a6a`, 점선) + "강세/약세 거래량 다이버전스" 라벨. 없으면 생략.
  2. **급증 봉 마커 + 상태 배지**(reveal≥2): 거래량 급증(`state==="spike"`) 시 **마지막 봉(현재, 절대 idx=price.length−1)** 위치에 골드 틱 마커 + 우상단 `_evLabel` "거래량 급증·상승 확인" 형태(state/relationship 조합, 색=관계 방향). spike 아니면 배지만(마커 생략).
- 기존엔 volume 작도 분기가 없으므로(참고 블록), **차트·오버레이 draw 루프에 volume 케이스 신설**(형제 지표 호출부와 동형: M 구성 → `analyzeVolume` → `_drawVolumeLayers`). `reveal: _playing ? (_evReveal[n.id]||0) : Infinity`. 범례에 "거래량(전문)" 추가. 거래량 시계열은 노드 series→없으면 `synthVolume(data.price)`.

## 8. 거래량 막대 서브패널 (신규)

- 결과 패널(`.fc-wrap`)에 `#fcVolPanel`(`.fc-panel`, 캔버스 `#fcVol`) 추가 — 주기/RSI 패널과 같은 형식, `.fc-rgutter` 구분선 포함.
- `fcDrawVol(va)`: 거래량 **막대**(해당 봉 가격 상승=bull `#46c28e`/하락=bear `#e06a6a`, 급증 봉=골드 `#e8b463` 강조) + **OBV 라인**(보조 스케일, `--eth` 색) + 다이버전스 피벗 마커(가격 피벗 idx의 거래량 막대 강조) + 현재 상태 라벨("거래량 급증 1.8x" 등). `fcFit`/`FC_DIM` 재사용(blur/더블스케일 없음).
- **표시 조건**: volume 블록이 보드에 있을 때만(`toggleVolPanel()`, `togglePhasefoldPanels`/`toggleRsiPanel` 방식 차용). renderChart에서 `fcDrawVol(analyzeVolume(...))` 호출. 거래량 데이터는 노드 series→없으면 `synthVolume`.

## 9. nodeExpert 통일

- nodeExpert volume 케이스(3278–3289행)의 자체 비율·추세·관계 계산을 **제거**하고 `ForgeCore.analyzeVolume`로 단일화 — `state`/`ratio`/`trend`/`relationship`/`divergence`/`bias`를 한국어 텍스트로 표시(기존 출력 톤 유지). 흩어진 중복 경로 정리(RSI에서 남긴 nodeExpert 미통일 carryover를 거래량에선 처음부터 통일).

## 10. 시연 (Plan B 프레임워크 재사용)

- 코어 `volumeSteps(va) → string[5]`(테스트 가능): ① "거래량 추세 {증가↑/감소↓/횡보→}" ② "최근/평균 {ratio}x · {급증/위축/평이}" ③ "가격-거래량: {확인/약화/매도/투매진정}" ④ 다이버전스 있으면 "{강세/약세} 거래량 다이버전스" 없으면 "OBV {상승/하락/횡보}" ⑤ "종합 방향 {상승/하락/중립} (bias {n})".
- `analysisSteps` volume 케이스: `n.blockType==="volume"` → 거래량 확보(노드 series→`synthVolume`) → `ForgeCore.analyzeVolume(price, vol)` → `volumeSteps`, layers `[1,1,2,2,2]`.

## 11. 샘플 포지 거래량 추가

- `forge-core.js` `sampleGraph()`에 거래량 노드 추가: `{ id:"s_vol", blockType:"volume", series:synthVolume(sampleSeries()), conviction, weight, thumb, desc }` + 엣지 `price→s_vol`, `s_vol→combine`. (베이크 시계열은 `synthVolume`로 결정적 생성 — 단일출처.)
- `forge.html` `buildSampleForge()`/주입 경로가 거래량 노드를 함께 보드에 반영(추가 분기 불필요 — 노드 배열에 포함되면 자동). 샘플 실행 시 거래량 막대 패널·hero 마커·예측 volDrift가 실제 동작.

## 12. 테스트 (`forge-core.test.js`)

- `synthVolume`: 길이 = price 길이, 모든 값 유한·양수, 큰 변동 봉에서 더 큰 값(단조 증가 구간 대비 급변 구간 비교), 소량(<2)→`[]`.
- `analyzeVolume`:
  - 거래량 증가 + 가격 상승 동반 → `relationship:"confirm"`, `trend>0`, `bias>0` 경향.
  - 가격 상승 + 거래량 감소 → `relationship:"weakening"`.
  - 강세 다이버전스 합성(가격 LL·OBV HL) → `divergence.type:"bullish"`, `bias>0` 경향.
  - 약세 다이버전스 → `bearish`.
  - 급증 합성(최근 3봉 큰 값) → `state:"spike"`, `ratio>spikeMult`.
  - volume 미입력(null) → `synthVolume` 폴백으로 유한 결과(예외 없음).
  - 소량/피벗부족 → 폴백 객체(divergence null, bias 유한).
- `volumeSteps`: 5단계 텍스트, 관계·다이버전스·bias 반영.
- 예측: volume 블록 + 강세 다이버전스/확인 데이터에서 volume 유무로 타깃 격리(`notStrictEqual`), `timeframe:"월봉"` vs `"5분"` 차이, 둘 다 유한. **인라인 volBias 제거 회귀**: volume 블록 없는 기존 그래프의 예측이 제거 후에도 유한·정상.

> 합성 데이터가 detectSwings/관계와 어긋나면 **테스트 데이터만** 조정(단언·로직 불변).

## 13. 영향 / 호환

- volume 블록 `n.series`(사용자 입력) 유지. `analyzeVolume`·`synthVolume`·`volumeSteps` 순수/결정적 → 테스트 용이. export 추가.
- 기존 `evalBlocks` 블록값 통과(257행) 불변 → combine 경로 회귀 없음. **인라인 volBias만 단일출처로 대체**(예측값은 의도적으로 변함 — TF가중·analyzeVolume 기반으로 정합).
- 신규 서브패널·hero 마커는 volume 블록 있을 때만(없으면 기존 UI 불변).
- nodeExpert volume 통일로 중복 경로 제거.
- 시연 프레임워크 재사용. 단일 HTML·바닐라 JS·무빌드·다크 토큰·한국어·작도/예측 정합·noindex 유지.
