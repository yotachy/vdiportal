# 스쿱포지 백테스트 하네스 — 설계 명세 (Design Spec)

작성: 2026-07-07 · 상태: 승인됨(구현 대기)

## 1. 목적 (Goal)

`forge-core.js` 예측 엔진이 **과거 데이터에서 실제로 얼마나 정확했는지**를, 미래 훔쳐보기(lookahead) 없이 walk-forward로 자동 측정한다. "예쁜 도구"를 "검증된 도구"로 바꾸는 신뢰 근거를 숫자로 산출한다.

- **1단계(본 명세)**: 내부 검증·튜닝용 node CLI 하네스. 결정론적·오프라인·CI 가능.
- **2단계(후속)**: 1단계 산출 요약(JSON)을 사이트에 노출. 별도 명세로 다룸.

## 2. 접근 (Architecture)

유닛테스트(`forge-core.test.js`)와 동일한 방식으로 `forge-core.js`(UMD)를 node에서 로드해 실행하는 CLI 하네스. 브라우저 백테스트 대비 결정론적·CI 가능·기존 인프라 재사용이라 채택. **배포 제외 산출물**(정적 배포는 종전 7파일 + forge-api.php만).

## 3. 파일 구성 (`map/backtest/`, 배포 제외)

| 파일 | 책임 |
|---|---|
| `backtest.js` | 하네스 본체 — walk-forward 루프 · 채점 · 집계 · 콘솔 리포트 · JSON 출력 |
| `metrics.js` | 순수 채점 함수(방향·캘리브레이션·커버리지·MAE·P&L·베이스라인). 단위테스트 대상 |
| `fetch-fixtures.js` | 픽스처 1회 수집 — api 프록시(TwelveData/Stooq/Naver)로 과거 OHLC 받아 JSON 저장 |
| `fixtures/*.json` | 번들 고정 데이터셋. 형식 `{ symbol, tf, candle:[{o,h,l,c,v}], time?:[...] }` |
| `backtest-report.json` | 집계 결과(2단계 사이트가 읽을 요약). 하네스가 생성 |
| `metrics.test.js` | `metrics.js` 순수함수 단위테스트(`node --test`) |

`price` 배열은 `candle.map(c => c.c)`로 파생. 엔진 입력은 `{ price, candle }`.

## 4. 데이터 (Fixtures)

- **번들 고정 데이터셋**: 재현성 확보(언제 돌려도 같은 수치). `fetch-fixtures.js`로 1회 수집 후 커밋(또는 로컬 고정). 배포 안 함.
- **테스트 유니버스(시작)**: 자산군 대표 6~10종 × 주기(일·주). 각 3~5년치.
  - 미국주식: `NVDA`, `AAPL` · 크립토: `BTC/USD` · 환율: `USD/KRW` · 국내: `005930`
  - 확장 가능(픽스처 추가만으로 유니버스 확장).
- 최소 길이: `워밍업(≈200봉) + 지평(H) + 통계 유의 시점 수` 이상.

## 5. 핵심 알고리즘 (walk-forward)

각 픽스처(종목×주기)에 대해:

```
WARMUP = 200                     // 엔진이 지표 산출에 필요한 최소 히스토리
H       = horizonForTF(tf)        // 지평: 일 60 · 주 52 · 월 12 (엔진과 동일)
STRIDE  = tf==='1day' ? 5 : 2     // 시점 간격(중첩 축소·런타임 조절)

for t = WARMUP ; t <= N - H ; t += STRIDE:
  1. past = { price: price[0..t], candle: candle[0..t] }   // ← lookahead 차단(핵심)
  2. graph = standardGraph()                                // §6
  3. r = ForgeCore.run(graph, past, { futW: H, timeframe: tf })
  4. 예측 기록:
       dir  = sign(r.verdict.score)            // +1/−1/0(중립)
       up   = upProbFromPrediction(r.prediction) // §7-2, 앱 aggUpProb 복제
       tgt  = r.prediction.target
       loH  = r.prediction.lo[H-1], hiH = r.prediction.hi[H-1]
  5. 실제: actual = price[t+H], base = price[t]
       realRet = actual/base − 1
  6. §7 지표 채점(시점 결과를 누적 버퍼에 push)

전체 시점·전체 픽스처 집계 → 리포트
```

**불변식**: 4단계 `run()`에 들어가는 데이터는 반드시 `[0..t]` 슬라이스만. 어떤 지표·계산도 `t` 이후 값을 참조하면 안 됨(lookahead=백테스트 거짓말의 원인).

## 6. 표준 전략 그래프 (`standardGraph()`)

실제 앱 기본값과 동일 조건으로 엔진을 평가한다.

```js
const g = ForgeCore.sampleGraph();
g.nodes.forEach(n => { if (n.conviction) n.conviction = 0; }); // 앱 seedDefaultStrategy는 conviction 0
return g;
```

> 주의: `sampleGraph()`는 conviction이 내장돼 있어 그대로 쓰면 +편향(2026-07-07 발견). 반드시 0으로 리셋해 실제 앱(seedDefaultStrategy) 조건과 일치시킨다.

## 7. 지표 정의 (`metrics.js`, 순수함수)

각 시점의 `{dir, up, tgt, loH, hiH, base, actual, realRet}`를 받아 집계.

### 7-1. 방향 적중률 (Direction Hit Rate)
- `predDir = dir(+1/−1/0)`, `realDir = sign(realRet)`
- **중립(dir=0) 제외**. `hitRate = Σ(predDir==realDir) / Σ(predDir≠0)`
- 강세예측·약세예측 각각 별도 집계(편향 확인용).

### 7-2. 확률 캘리브레이션 (Calibration)
- `upProbFromPrediction(pred)`: 앱 `aggUpProb`/`_upProb` 로직 복제 —
  콘 각 스텝 `k`에서 `z=(path[k]−anchor)/(hi[k]−path[k])`, `p_k=100/(1+e^(−1.7z))`, `1/√(k+1)` 가중 평균.
- 상승확률을 10%p 빈(50–60,60–70,…)으로 나눠, 각 빈의 **실제 상승률**(`realRet>0` 비율) vs **예측 중앙값** 비교.
- 단일 수치 **ECE**(Expected Calibration Error) = Σ (빈비중 × |예측 − 실제|).
- 출력: 캘리브레이션 곡선(빈별 표) + ECE.

### 7-3. 콘 커버리지 (Cone Coverage)
- `covered = (loH ≤ actual ≤ hiH)`. `coverage = Σcovered / N`.
- 밴드가 ±1σ이므로 **목표 ≈ 68%**. 실제 커버리지 보고(과대=콘 넓음, 과소=콘 좁음).

### 7-4. 예측가 오차 (MAE)
- `err = |tgt/actual − 1|`. `MAE = mean(err)` (%).

### 7-5. 가상수익률 (P&L)
- **규칙(기본, 조정 가능)**: `up ≥ 55%`면 롱 · `up ≤ 45%`면 (기본:플랫 / 옵션:숏) · 그 외 플랫.
- **비중첩 체결**: t 진입 후 다음 판정은 t+H(거래 겹침 없음, "얼마 넣으면 얼마" 명확).
- 종목별 자본 곡선: **시작 $10,000 → 최종 $X**, 트레이드별 수익 복리.
- 산출: 총수익률·승률·평균수익/평균손실·최대낙폭(MDD)·거래수.
- 모드: 기본 **롱온리**(현실적·방어적), 옵션 롱/숏.

### 7-6. 베이스라인 (정직성 장치 — 필수)
동일 구간·동일 시점에서 비교:
- 방향: **"항상 상승"** 적중률 · **동전던지기** 50%.
- P&L: **Buy&Hold**(시작~끝 보유) 수익률·MDD.
- 리포트는 엔진 수치를 **베이스라인과 나란히** 표기해 **초과성과(lift)** 로 해석.

## 8. 출력 (Output)

- **콘솔**: 전체 요약 표(지표별 엔진 vs 베이스라인) + 픽스처별 브레이크다운.
- **`backtest-report.json`**: 집계 수치(2단계 사이트가 읽음). 예:
  ```json
  {
    "generatedAt": "<ISO, 인자로 주입>",
    "universe": [{ "symbol": "NVDA", "tf": "1day", "points": 240 }],
    "overall": {
      "directionHitRate": 0.61, "baselineAlwaysUp": 0.57, "coinFlip": 0.50,
      "calibrationECE": 0.06, "coneCoverage": 0.66,
      "priceMAE": 0.031,
      "pnl": { "startEquity": 10000, "finalEquity": 12840, "totalReturn": 0.284,
               "winRate": 0.58, "avgWin": 0.041, "avgLoss": -0.028, "maxDrawdown": -0.14,
               "buyHoldReturn": 0.22 }
    },
    "perFixture": [ ... ],
    "calibrationCurve": [ { "bin": "60-70%", "predicted": 0.65, "actual": 0.62, "n": 88 } ]
  }
  ```
- Date/random 제약: 엔진 유닛테스트와 동일하게 `Date.now()`·`Math.random()` 하네스 코드에서 미사용(결정론). `generatedAt`은 실행 인자로 주입.

## 9. 비목표 / 제약 (Non-goals · Constraints)

- 실시간 매매·주문 연동 없음(순수 사후 시뮬레이션).
- 수수료·슬리피지·세금은 **1단계 옵션**(기본 0, 플래그로 반영 가능) — 정직성 위해 후속에서 기본 반영 검토.
- **규제 프레이밍**: 가상수익률은 내부 검증엔 문제없음. 2단계 공개 시 "과거 데이터 시뮬레이션 · 미래수익 보장 아님 · 투자자문 아님" 면책 필수(별도 명세).
- 배포 제외: `backtest/` 전체는 정적 배포 대상 아님.

## 10. 성공 기준 (Definition of Done)

- `node backtest.js` 실행 시 6~10 픽스처 walk-forward 완료·콘솔 요약 + `backtest-report.json` 생성.
- `metrics.js` 순수함수가 `metrics.test.js`로 검증(합성 케이스에서 알려진 정답 일치).
- lookahead 없음(코드 리뷰 + 슬라이스 불변식 확인).
- 엔진 vs 베이스라인 초과성과가 리포트에 나란히 표기.
