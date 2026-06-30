# 차트 데이터-윈도 내비게이션 + 오토 스케일 + 무제한 과거 — 설계

- 작성일: 2026-06-30
- 대상: 스쿱포지(Scoop Forge) — `forge.html` + `forge-api.php`
- 선행: 티커 캔들차트(실 OHLC fetch·캔들 렌더·hero `_heroZoom` 균일 줌·log 토글) 배포됨.
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 배경 / 문제

티커 캔들차트의 3가지 한계:
1. **fetch 400봉** 상한 → 과거 부족.
2. **저장 250봉 캡**(POST<128KB) + **렌더 180봉 윈도** → 일봉이 ~8개월만 보임.
3. **y범위가 종가(close) 기준** + **균일 변환 줌**(`_heroZoom`: x·y 동시 픽셀 확대) → ① 캔들 심지(고저) 잘림, ② 보이는 구간에 y가 재적합 안 됨(평탄 구간 확대해도 디테일 안 보임).

사용자 요청: **오토 스케일**(보이는 구간 y 자동 적합) + **무제한 과거**(일봉/주봉 전체 탐색).

## 2. 핵심 결정

- **무제한 과거 = 재fetch 모델**: OHLC를 문서에 저장하지 않는다(128KB 제약 회피). 캔들은 **인메모리 전용**(`n._series`/`n._ohlc`, 언더스코어 = 직렬화 제외). 문서엔 심볼/tf만. 포지 로드 시 **자동 재fetch**(서버 캐시로 저렴). 오프라인이면 차트 없음(그레이스풀).
- **데이터-윈도 내비게이션**: 균일 변환 줌(`_heroZoom`)을 **보이는 봉 범위(`_chartWin`)** 모델로 교체 — 휠=시간축 줌, 드래그=과거 스크롤.
- **오토 스케일**: y범위 = 보이는 윈도 캔들 **고저(h/l)** 기준, 윈도 변할 때마다 재계산.

## 3. 데이터 깊이 (`forge-api.php`)

- OHLC 프록시 `outputsize` 400 → **5000**(Twelve Data 무료 티어가 허용하는 큰 outputsize; 일봉 ~20년·주월 최대). Stooq 폴백은 CSV 전체(이미 일봉 장기). 캐시 TTL 동일.

## 4. 재fetch 인메모리 모델 (`forge.html`)

### 4.1 저장 분리
- `applyTickerOHLC(n, r)`: 수신 캔들 전체를 **인메모리**로 — `n._ohlc = candles`(전체, 캡 없음), `n._series = candles.map(c=>c.c)`. 문서 영속 필드는 작게: `n.params.symbol`, `n.params.tf`, `n.params.price`(마지막 종가, 스케일 정합), **`n.params.fetched = true`**(재fetch 대상 표시).
- `serializeActive()`는 이미 `_`접두 필드를 제외하므로 `_ohlc`/`_series`는 자동 미저장 → 문서 항상 <128KB(캔들 없음). (기존 `n.series`/`n.ohlc` 사용처를 `_series`/`_ohlc`로 이전.)

### 4.2 소비처 이전 (ticker 노드 한정)
- `priceSeries()`: **ticker 노드의 `_series`**(길이≥20·유한) 최우선 채택(기존 ticker `n.series`→`n._series`). **price 블록의 `n.series`(사용자 붙여넣기·영속)는 그대로 유지** — 이전 대상 아님(그 경로는 직렬화돼야 함).
- `priceOHLC()`: **ticker 노드 `_ohlc`** 반환(기존 `n.ohlc`→`n._ohlc`).
- 그 외 ticker `n.ohlc`/`n.series` 참조처(예: 편집기 현재가 readonly 판정 `Array.isArray(n.ohlc)`)도 `_ohlc`/`_series`로 이전. price 블록 참조는 불변.

### 4.3 자동 재fetch (로드 시·비차단)
- `loadDoc(id)`가 보드·차트를 먼저 렌더한 뒤(블로킹 안 함), `params.fetched` 인 ticker 노드마다 `fetchOHLC(symbol, tf)`를 **비동기로** 호출 → 성공 시 `_series`/`_ohlc` 채우고 재렌더(`runForge`/`renderChart`). 보통 1개. 로딩 표시(토스트/배지), 오프라인·실패면 무시(그레이스풀 — 차트 비거나 직전 상태 유지). 문서 로드 자체는 fetch를 기다리지 않음.
- **샘플 ticker는 `fetched` 미설정** → 자동 재fetch 안 함(수동 불러오기 유지, 기존 결정 보존).

## 5. 데이터-윈도 내비게이션 (`_chartWin`)

### 5.1 상태
- 전역 `_chartWin = { start, count }` — 보이는 봉 = `series[start … start+count)`. `N`=전체 봉 수.
- 기본: 데이터 로드/변경 시 `count = min(180, N)`, `start = N - count`(최근). 예측존은 우측에 별도(과거 아님).
- `resetChartWin()`로 기본 복귀(더블클릭·⊕).

### 5.2 인터랙션 (기존 `_heroZoom` 핸들러 대체)
- **휠 = 시간축 줌**: `factor = deltaY<0 ? 0.85 : 1/0.85`; `count' = clamp(20, N, round(count*factor))`. 커서 아래 봉 인덱스 `bi`를 고정: `start' = clamp(0, N-count', bi - (bi-start)*count'/count)`. 재렌더.
- **드래그 = 과거 스크롤**: 가로 이동 px → 봉 수 환산(`dBars = -dx / barW`), `start' = clamp(0, N-count, start + dBars)`. 임계 6px(미만 클릭은 포커스/툴팁).
- **`_heroZoom` 균일 변환 줌 제거(차트 한정)**: `fcDrawMainChart`/`_drawEvidence`의 `c.translate/scale(_heroZoom)`를 항등으로 두거나 제거. 줌/팬은 `_chartWin`이 담당(픽셀 변환 아님·매 윈도 재렌더라 선명). ⊕ 리셋 버튼은 `resetChartWin` 연결.

## 6. 렌더 + 오토 스케일 (`fcDrawMainChart`)

- `const hist = series.slice(_chartWin.start, _chartWin.start + _chartWin.count)` (윈도). OHLC도 동일 윈도(`priceOHLC().slice(win)`).
- **y범위(오토 스케일)**: 보이는 윈도의 **캔들 고저** — `loV = min(visible lows)`, `hiV = max(visible highs)`(OHLC 있으면 h/l, 없으면 close). 최신봉이 윈도에 포함될 때만 예측 밴드(lo/hi) 포함. + 10% 여백. **윈도 바뀔 때마다 재계산** → 보이는 구간에 꽉 참, 심지 안 잘림.
- `toXh(i)`는 윈도 내 상대 인덱스 기준. `_mainGeo`에 `start`/`count`/`winLo`/`winHi` 포함(evidence·호버 공유). log 토글(`tvLog`)은 그대로 적용.

## 7. 근거 작도 · 예측 콘 정합

- evidence chart-mode `fiToX`: **절대 인덱스 → 윈도 x** 매핑 = `i => (i >= start && i < start+count) ? toXh(i - start) : null/clip`. 윈도 밖 구간은 클립(선이 차트 밖으로 안 나감). 지표 분석(analyzeMA 등)은 전체 시계열 대상, 작도만 윈도 매핑(`fiMin`/clamp 확장).
- **예측 콘은 최신봉이 윈도 우측 끝에 보일 때만** 표시(과거로 스크롤하면 숨김 — 표준 차트). 콘 폭은 예측 길이 비율 유지.
- 호버 툴팁: 윈도 기준 x→봉 인덱스(`start + round(...)`)로 가격 조회. DPR·log·근거 포커스는 윈도 위에서 동작.

## 8. 영향 / 호환 / 비목표

- `forge-core.js` 무변경(전부 표현/프록시 계층). 코어 테스트 83/0 유지.
- **128KB 회피**: 캔들 인메모리(`_` 접두) → 문서 미저장. 재방문 자동 재fetch(서버 캐시).
- 티커 미로드·데이터 없음 시 기존(이미지/비전/baked) 동작(회귀 0). `_chartWin`는 데이터 있을 때만 의미.
- 비목표(YAGNI): 캔버스 핀치줌(휠/드래그만), 가로 날짜축 라벨 정밀화, 윈도 줌 애니메이션, 여러 티커 동시 비교, 인트라데이.
- 단일 HTML·바닐라 JS·무빌드·다크 토큰·한국어·noindex 유지.

## 9. 검증

- 프록시: 라이브 curl — `outputsize` 반영해 더 많은 봉(일봉 수천).
- 클라: forge.html 인라인 파싱·코어 83/0. 헤드리스/라이브: 티커 불러오기 → 휠로 시간축 줌·드래그로 과거 스크롤, **보이는 구간마다 y 자동 적합**(심지 안 잘림), 최신 윈도에서만 예측 콘, 근거 작도가 윈도에 정합·밖은 클립; 포지 재방문 시 자동 재fetch로 차트 복원(문서엔 캔들 없음 = 작은 POST); log 토글·호버 정상.
