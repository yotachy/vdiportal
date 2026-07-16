# 내부자 매수 → 중소형주 상대방향(IWM) 재검증 설계

- 날짜: 2026-07-16 · 상태: 승인됨 · 성격: 연구/검증 랩 (내부자 슬라이스 유니버스 재검증)
- 배경: [[scoopforge-insider-slice]](대형주 기각=98% 매도·유니버스 문제) · [[scoopforge-earnings-axis]](외부데이터 승자 기준) · [[scoopforge-rel-axis]]
- 인프라 재사용: `collect-insider.py`·`insider-feats.js`·`feat-lib.js`(structFeats·logitFit·acc·splitIdx)

## 1. 가설 / 목표
내부자 매수 신호는 **매수가 잦은 중소형주**에서 상대방향(vs IWM 소형주지수, size factor 제거) 예측에 증분을 준다. 대형주 기각은 유니버스 문제(매수 희박)였으므로, **매수가 실재하는 유니버스**에서 원 가설을 공정하게 재검증.

## 2. 유니버스 (데이터기반 선정)
- `mine-insider-universe.py`: DERA 전 분기(2006~) 재처리, **US 티커별 총 내부자 매수(P) 건수 집계** → 랭크. 제외: 기존 31 대형주·비-common(ETF/펀드/'N/A')·심볼 이상. **매수 상위 ~50 후보** → OHLC 가용분만 채택(목표 ~30-40종).
- **서바이버십 주의**: OHLC는 생존 종목만 프록시로 가용(상장폐지 소형주 누락) → 상방 편향 가능. 리포트에 명시·보수 해석.

## 3. 데이터 수집
- **OHLC** (`fetch-smallcap.js`): forge-api 프록시(`?ohlc=1&symbol=X&tf=1day`, **날짜 t 포함 저장**) → `fixtures-smallcap/{sym}.json`(`{candle:[{t,o,h,l,c}]}`). IWM·SPY 벤치도. Rate-limit(프록시 8/min TwelveData) 준수·백그라운드.
- **내부자 이벤트**: `collect-insider.py`를 새 유니버스로(티커셋 env/파일 파라미터화) → `insider-events-smallcap.json`.

## 4. 검증 (`insider-smallcap-lab.js`)
- **날짜 기반 정렬**(소형주 IPO 시점 상이): 각 종목 dates ∩ IWM dates → 공통 시계열. `R = close/IWM_close`. 내부자 이벤트는 **filed ≤ candle date**로 정확 부착(대형주 랩의 선형보간 불필요 — 날짜 있음).
- base = rel 25피처(structFeats P + structFeats R + beta[vs IWM]) vs **aug = 25 + 내부자6**.
- 타깃 = 상대 아웃퍼폼(P[t+h]/P[t] > IWM[t+h]/IWM[t]) h=10/20/40. OOS 심볼별 60/40 + LOSO + 전후반.
- **프리필터**: 내부자 단변량·증분 Δ. **관문**: +1.5pp(지평 다수)·LOSO 다수 양수·전후반 양수.

## 5. 격리 / 산출
- forge-core **미변경**(통과 시에만 라이브 파이프라인+모델·validatedAxes). 랩·수집·데이터 map/backtest/.
- 산출 = 판정 + 근거. **통과 시 첫 소형주 내부자축**(실적 이후 두번째 신규 데이터축), 기각 시 정직 기록(+서바이버십 주의).
- 회귀: forge-core 미변경 → 246/246.

## 6. 리스크
- OHLC 커버율·품질(소형주 프록시 결측·짧은 이력) → 채택 종목 리포트. 서바이버십(생존편향, 상방) — 통과해도 이 편향 감안한 보수 해석.
- 내부자 매수도 소형주선 노이즈 많음(펌프·저정보) → opportunistic·군집·직위 게이트로 강화. 기각 가능성 실재하나 **매수 신호가 실재하는 유일한 유니버스**라 공정한 테스트.
