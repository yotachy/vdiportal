# 머니스쿱 모바일 Phase 6 — 리포트 시안 보강 (확신 퍼센트 · 지평 카드 · 적중/오답 바)

- 날짜: 2026-08-11
- 대상: `map/forge-core.js` · `map/forge-app.js` · `map/mobile/sync-engine.mjs` · `mobile/www/report-model.js`(신규) · `strings.js` · `screens/report.js` · `style.css` · `index.html`
- 선행: [`2026-08-11-moneyscoop-mobile-phase5-design.md`](2026-08-11-moneyscoop-mobile-phase5-design.md) · 대조 근거 [`../../../mobile/docs/design-audit.md`](../../../mobile/docs/design-audit.md)
- 상태: 설계 승인됨 (2026-08-11)

## 1. 배경 — 시안 대조가 지목한 가장 싼 항목

목업 24장 전수 대조(`design-audit.md`) 결과 정식 화면 흐름 7단계 중 구현은 2개, 그것도 부분이었다. 가장 큰 공백은 재화(Scoops) 체계지만 화면 5개가 거기 묶여 있어 크다.

**리포트 보강은 재화와 무관하고 엔진이 데이터를 이미 갖고 있어 비용이 가장 싸다.** 그래서 먼저 한다.

시안이 요구하는데 없는 것 넷:

| 시안 | 보드 | 현 구현 |
|---|---|---|
| `Bullish 68%` 확신 퍼센트 | 2a · 6a | 없음 (일치도만) |
| 지평별 목표 카드 | 2a · 1a | 없음 |
| `58.1% right · 41.9% wrong` | 8b | 없음 |
| `Range … · 80% cone` | 2a | 문구가 다른 양에 붙어 있음 |

## 2. 확인된 사실 (설계 중 실측 — 그대로 신뢰해도 된다)

1. **계산이 이미 있다.** `forge-app.js`에 `_normCdf`·`_upProb`(로그정규 상승확률)·`aggUpProb`(지평 가중 종합)이 있고, `forge-core.js`에 `calibrateUpProb`(Platt, v1.7.1 재적합)이 이미 export 돼 있다. 시안의 `68%`가 정확히 `aggUpProb`이다.
2. **백테스트 수치가 실재한다.** `map/forge-backtest-report.json`(2026-07 생성, 86 시리즈 · 31,496 예측): `directionHitRate` **0.58056** · `calibrationECE` **0.00126** · `coneCoverage` **0.77743** · `pnl.avgWin` **0.18974** / `avgLoss` **−0.10706**. 시안 8a·8b의 숫자가 전부 여기서 나왔다.
3. **`futW`는 기본 24, 상한 60.** 모바일은 기본값을 쓴다. 24 일봉 안에 1·5·21봉(내일·1주·1개월)이 전부 들어간다.
4. **`futW`는 경로 모양 자체를 바꾼다.** 감쇠·회귀 상수가 전부 `futW`에 걸려 있다(`exp(-k/(futW*0.55))` · `k/futW` · 모멘텀 시정수 `futW*0.4` · `theta = 1/max(6, futW*0.55)`). 그래서 60으로 올리면 **앞쪽 24봉의 모양도 달라진다.**
5. **백테스트 `byRegime`은 시장 국면이다.** `classifyRegime(buyHoldReturn)` — 시리즈 전체 기간 바이앤홀드가 >30%면 bull, <−10%면 bear. 엔진이 지금 이 종목에 내린 방향 판정(`verdict.regime`)과 **다른 개념**이라 이어 붙이면 안 된다.

## 3. 결정 사항과 그 이유

### 3.1 확신 퍼센트를 도입하되 일치도도 남긴다

시안 6a·2a가 실제로 둘을 같이 보여준다(`Bullish 68%` + `17 up · 6 flat · 9 down`). 둘은 다른 것을 말한다 — 퍼센트는 **얼마나 확실한가**, 일치도는 **무엇이 그렇게 말하나**.

Phase 1이 워치리스트에서 퍼센트를 버리고 `agree/total`로 간 이력이 있으나 **그 근거는 여기 적용되지 않는다.** 당시 이유는 "Basic 4지표 일치도라 값이 0/25/50/75/100뿐이라 확률처럼 오독됨"이었다. 지금 도입하는 68%는 일치도가 아니라 콘에서 나온 **보정된 확률**이고(ECE 0.13%), 연속값이며, 실제로 확률이다.

**정의**: `aggUpProb`이 상승확률을 주므로 — 판정이 상승이면 그 값, 하락이면 `100 − 값`. 즉 **"엔진이 부른 방향이 맞을 확률"**.

### 3.2 지평은 3개 (내일 · 1주 · 1개월)

시안은 넷이다(+3개월). 넣으려면 `futW`를 60으로 올려야 하는데:

- 차트 예측 구간 비중이 28% → **50%**. Phase 3이 실기기 불만("예측 구간이 좁다")을 듣고 맞춘 값이고 Phase 4 줌이 그 위에서 검증됐다
- §2.4에 따라 **앞쪽 24봉의 모양도 달라진다** — 차트를 잘라 그려도 지금 보던 콘이 아니다
- "숫자용 60봉 + 차트용 24봉" 두 번 실행도 안 된다. 표와 차트가 서로 다른 예측을 말하게 된다

3개월은 예측 길이 자체를 다룰 때(백로그 "봉 수 ↔ 정확도 실측") 함께 판단한다.

### 3.3 적중/오답 바를 넣는다

68%를 헤드라인으로 올리는 이상 그 옆에 "그래도 10번 중 4번은 틀린다"가 없으면 68%가 확신처럼 읽힌다. 시안 8a가 정확히 그것을 경계했다 — *"'57.9% 적중'이 아니라 '10번 중 4번은 틀립니다'를 먼저 말합니다. 같은 숫자인데 과장이 사라집니다."*

**이 58.1%는 엔진 전체 평균이지 이 종목·이 설정의 성적이 아니다.** 시안 6a의 `Track record of this setup · 41 times in 3 years`(설정별)는 Full 티어 것이다. 문구가 그것을 오해시키지 않아야 한다.

국면별 수치는 §2.5 때문에 쓸 수 없다.

### 3.4 확신 구간(`55–67%`)은 보류한다

시안은 티어별 고정 폭으로 보인다(Basic ±6 · Full ±4 · Custom ±4) — **어디서 나온 값인지 근거가 없다.** 그대로 구현하면 하드코딩한 폭을 "이 판정의 불확실성"이라고 말하는 셈이고, 지어낸 통계를 정직 장치인 척 붙이는 것은 이 제품이 가장 하지 말아야 할 일이다(8a).

대신 **잘못 붙은 카피를 시안 자리로 되돌린다**: 지금 `Likely somewhere in`(시안에선 확신 구간용)이 가격 범위에 붙어 있다. 가격 범위는 시안 2a의 제 라벨 `Range … · 80% cone`으로 바꾼다.

`80% cone`은 설계 목표치이고 실측 커버리지는 77.7%다. 시안 표기를 그대로 쓰되 다르다는 것을 알고 쓴다 — 방법론 화면(10a)이 붙을 때 함께 노출할 자리다.

## 4. 확률 계산 단일화 — 엔진으로 올린다

`_normCdf`·`upProb`·`aggUpProb` 셋을 `forge-core.js`로 옮기고 `forge-app.js`의 사본을 지운다.

```js
ForgeCore.upProb(pred, hi, anchor)   // 로그정규 상승확률(%) 0..100, 보정 전
ForgeCore.aggUpProb(prediction)      // 지평 가중(1/√h) 종합 → calibrateUpProb 적용. 경로 없으면 null
```

**왜 공유하는가**: 이 저장소는 "두 출처가 갈라진다"로 이미 세 번 당했다(Phase 3 상태 어휘 · Phase 4 `plotWidth` · Phase 5 브레이크포인트). 확률 계산은 그중 가장 위험하다 — 한쪽만 보정 상수를 고치면 PC와 모바일이 **서로 다른 확률**을 말하고, 화면 비교로도 안 잡힌다. `calibrateUpProb`이 이미 엔진에 있으니 자연스러운 자리다.

**지평 목록은 옮기지 않는다.** PC의 `_hzList`는 주기 단위별 `[10,20,40,60]` 식이고 모바일은 `1/5/21`이다. 이건 수학이 아니라 제품 선택이다 — 공유해야 할 경계는 "확률을 어떻게 계산하는가"까지다.

**대가**: Phase 3·4·5가 지킨 "엔진 무수정"을 처음 깬다. 관문 251건이 수학 회귀는 잡지만 **PC 4패널 지평 표는 사람이 눈으로 확인해야 한다**(§8).

## 5. 백테스트 수치가 앱에 도달하는 경로

`forge-backtest-report.json`이 단일 출처다. 앱에 하드코딩하면 엔진 재측정 때 갈라진다.

**`sync-engine.mjs`가 요약을 생성한다** — 이미 엔진을 vendor로 복사하는 그 스크립트다.

```
map/forge-backtest-report.json
        │  sync-engine.mjs (npm run sync)
        ▼
mobile/www/vendor/backtest-summary.js        ← 생성물, gitignore
  window.MSBacktest = {
    directionHitRate: 0.58056, calibrationECE: 0.00126,
    coneCoverage: 0.77743, avgWin: 0.18974, avgLoss: -0.10706,
    nForecasts: 31496, nSeries: 86, generatedAt: "2026-07"
  };
```

JSON이 아니라 **JS 파일**로 만드는 이유는 `fetch` 없이 `<script>`로 읽기 위함이다 — 나머지 모듈과 같은 방식이고 비동기가 끼어들지 않는다.

**테스트는 생성물이 아니라 원본 JSON을 직접 읽어** 화면에 쓰는 수치와 대조한다. 생성물은 커밋되지 않으므로 그것이 유일하게 정직한 검증이다.

**미로드 방어**: `npm run sync`를 안 돌린 상태로 열면 `window.MSBacktest`가 없다. 적중/오답 바만 조용히 감추고 나머지는 정상 동작한다. 엔진 누락처럼 화면을 막지 않는다 — 부가 정보라 없어도 리포트가 성립한다.

## 6. 화면 구조

시안 6a·2a 순서를 따른다. 판정 블록이 커지고 지평 카드가 **차트 앞**에 들어간다.

```
BASIC · 5 indicators · Evidence 1/3
─────────────────────────────────
Bullish  68%                         ← 신규(헤드라인 퍼센트)
58.1% right · 41.9% wrong            ← 신규(적중/오답 바)
"Four calls in ten that looked like this one did not work out.
 Size your position for that, not for the 68%."
4 of 5 agree with this direction     ← 기존 유지(보조)
Range 142.80 – 187.40 · 80% cone     ← 카피 정정
Indicators not used in this verdict: 27 — see below
─────────────────────────────────
Tomorrow      164.90   +1.7%   62%   ← 신규 지평 3카드
In 1 week     168.20   +3.7%   58%
In 1 month    170.70   +5.2%   55%
─────────────────────────────────
[차트] … 이하 기존(예측선 범례 · What was read · Not checked · Timeframe · CTA)
```

### 6.0 "적중/오답 바"는 그래픽이 아니라 텍스트 행이다

시안 8b의 요소를 두 줄로 옮긴다 — 수치 행(`58.1% right · 41.9% wrong`)과 해설 한 문장. **막대 그래픽은 그리지 않는다.** 두 값이 합해서 100이라 막대가 더해주는 정보가 없고, 이 화면에서 시선을 끌어야 할 것은 판정 퍼센트다(2a: *"골드는 화면당 한 번만"*).

영문 문구는 시안 8b 원문을 그대로 `strings.js`에 넣는다:

> `Four calls in ten that looked like this one did not work out. Size your position for that, not for the 68%.`

퍼센트가 문장 안에 박혀 있으므로 값을 넣을 자리를 나눠 보관한다(보간 장치는 없다 — `strings.js`는 문자열 연결만 한다).

### 6.1 중립(`Flat`) 판정의 규칙

**퍼센트와 적중/오답 바를 둘 다 감춘다.** 부른 방향이 없는데 "그 방향이 맞을 확률"을 쓸 수 없고, 옆의 "10번 중 4번 틀린다"도 가리킬 대상이 없다. 일치도와 범위만 남긴다.

지평 카드는 그대로 둔다 — 예측가·변화율은 방향 판정과 무관하게 존재한다. 달성확률만 감춘다.

### 6.2 지평 카드

| 라벨 | 봉 |
|---|---|
| `Tomorrow` | 1 |
| `In 1 week` | 5 |
| `In 1 month` | 21 |

각 행: 예측가 · 현재가 대비 변화율 · 달성확률(%). 달성확률은 PC와 같은 정의 — 그 시점 예측 변화가 상승이면 `upProb`, 하락이면 `100 − upProb`.

`path`가 해당 봉보다 짧으면 그 행을 건너뛴다. `futW` 기본값이 24라 정상 경로에선 셋 다 나오지만, 방어한다.

## 7. 파일 분해

| 파일 | 변경 | 테스트 |
|---|---|---|
| **`map/forge-core.js`** | `_normCdf`·`upProb`·`aggUpProb` 추가 + export | ✅ `forge-core.test.js` 신규 케이스 |
| **`map/forge-app.js`** | 지역 사본 3개 삭제 → `ForgeCore.*` 호출 | 없음(PC UI) · 사람 눈 확인 |
| **`map/mobile/sync-engine.mjs`** | 백테스트 요약 생성 추가 | ✅ `test/sync.test.mjs` 확장 |
| `map/mobile/www/vendor/backtest-summary.js` | 생성물(gitignore) | — |
| **`map/mobile/www/report-model.js`** 🆕 | `MSReportModel` 순수 — 지평 행·확신·적중률 | ✅ `test/report-model.test.mjs` 🆕 |
| `map/mobile/www/strings.js` | 신규 문구 | 기존 문자열 가드 |
| `map/mobile/www/screens/report.js` | 판정 블록 재구성 + 지평 카드 | 없음(배선) |
| `map/mobile/www/style.css` | 지평 카드·적중바 | 없음 |
| `map/mobile/www/index.html` | 스크립트 태그 2개 | — |

**`report-model.js`를 따로 두는 이유**: `report.js`는 이미 515줄이고 이번에 판정 블록이 커진다. 계산(어느 봉이 1주인가 · 확신을 어느 방향으로 뒤집는가 · 중립이면 무엇을 감추는가)을 DOM에서 떼어내면 그 규칙에 테스트를 붙일 수 있다. Phase 3의 `chart-legend.js`(`MSLegend.rows`)가 같은 패턴이다.

## 8. 테스트

**`forge-core.test.js`**
- `upProb`: 예측=현재가면 50 · 예측>현재가면 >50 · 분산이 0에 가까우면 극단 · 0·음수·NaN에 죽지 않음
- `aggUpProb`: 가까운 지평에 큰 가중(1/√h) · 빈 경로면 `null` · `calibrateUpProb`을 실제로 통과했는지(보정 전 raw와 값이 다름)

**`test/report-model.test.mjs`**
- 지평 3행이 1·5·21봉을 집어옴 · `path`가 짧으면 그 행을 건너뜀
- 확신 뒤집기: 하락 판정이면 `100 − upProb`
- 중립이면 퍼센트·적중바가 `null`, 지평 행의 달성확률만 `null`
- **백테스트 수치가 `map/forge-backtest-report.json` 원본과 일치**

**`test/sync.test.mjs`**
- 생성된 요약이 원본 JSON의 값을 그대로 담는지

**기대값은 리터럴로 적는다.** 구현 상수에서 유도하면 항등식이 된다 — Phase 3·4·5에서 네 번 나온 패턴이다.

**관문**: `./tests/run.sh`. `forge-tools` 81 · `landing` 28은 변동 없어야 한다.

## 9. 범위 밖

- **3개월 지평** — `futW` 상한과 콘 비중 충돌(§3.2)
- **확신 구간 `55–67%`** — 근거 없는 폭(§3.4)
- **설정별 성적** `Track record of this setup` — Full 티어
- **국면별 적중률** — `byRegime`이 다른 개념(§2.5)
- **헤더 현재가·등락**(시안 2a `162.20 / +3.82 +2.41%`) — 판정 보강과 독립. 다음에
- **Misses 탭 · 방법론 화면 · 숫자 역추적** — 정직 장치 묶음은 별도 페이즈
- **워치리스트 확신 표기** — 시안은 `68%`, 현재 `4/5 agree`. 리포트가 자리 잡은 뒤 판단

## 10. 실기기·육안 확인이 필요한 항목

1. **PC 스쿱포지 4패널 지평 표가 이전과 같은 값을 낸다** — 엔진 이관의 유일한 회귀 지점
2. 리포트에 확신 퍼센트·적중오답 바·지평 3카드가 뜬다
3. 중립 판정 종목에서 퍼센트와 적중바가 사라진다
4. 지평 카드가 폴드 2단(리포트 칸 493px)에서 깨지지 않는다
5. `npm run sync` 안 한 상태에서 열어도 화면이 성립한다(적중바만 없음)

## 11. 열린 항목

- **`80% cone` 라벨과 실측 77.7%의 간극** — 방법론 화면이 붙을 때 함께 정리
- **`aggUpProb`의 지평 가중이 모바일 3지평과 맞는가** — PC는 경로 전체(24봉)를 가중 평균한다. 모바일이 3개 지점만 보여주는데 헤드라인 확신은 전체 경로에서 나온다. 불일치는 아니지만(전체가 더 안정적) 사용자가 "62·58·55인데 왜 68?"이라 물을 수 있다. 실사용에서 걸리면 설명 한 줄을 붙인다
