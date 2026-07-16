# 내부자 매수 → 중소형주 상대방향 재검증 Plan

> 연구 랩. 데이터 획득(유니버스 마이닝·OHLC·이벤트) 후 IWM 벤치 rel 증강. forge-core 미변경. 산출=판정.

**Goal:** 내부자 매수 잦은 중소형주에서 내부자 신호가 rel(vs IWM) 예측에 +1.5pp 증분 주는지 판정.

**Constraints:** forge-core 미변경(246/246) · look-ahead=filed일 · 서바이버십 편향 명시 · rel 사전등록 관문.

---

### Task 1: `mine-insider-universe.py` — 매수 상위 유니버스 선정

**Files:** Create `map/backtest/mine-insider-universe.py` → `insider-universe.json`

- DERA 전 분기(2006q1~2026q1) 재처리(collect-insider 다운로드 패턴 재사용). form=="4"·ISSUERTRADINGSYMBOL 유효·TRANS_CODE=="P" → 티커별 매수 건수 + 순매수$ 집계.
- 제외: 기존 31 대형주·비-common(티커 길이>5·'N/A'·숫자시작). 매수건수 내림차순 top 60 → JSON(티커·buyCount·buyDollars).
- [ ] Step 1 작성·실행(백그라운드, ~10분). Step 2 상위 리스트 확인. 커밋.

### Task 2: `fetch-smallcap.js` — OHLC(날짜 포함) 수집

**Files:** Create `map/backtest/fetch-smallcap.js` → `fixtures-smallcap/{sym}.json`

- 유니버스 top 60 + `IWM`·`SPY`. forge-api `?ohlc=1&symbol=X&tf=1day` fetch, `{symbol,from,to,candle:[{t,o,h,l,c}]}` 저장(**t 유지**). 실패/결측 스킵+로그. fetch 간 ~1.5s(rate-limit). ≥1000봉만 채택.
- [ ] Step 1 작성. Step 2 실행(백그라운드) → 채택종목·커버율 리포트. 커밋(fixtures-smallcap/ git).

### Task 3: 내부자 이벤트 (채택 유니버스)

**Files:** Modify `collect-insider.py`(티커셋 파라미터화: env `TICKERS_FILE`), run → `insider-events-smallcap.json`

- `TICKERS_FILE`(채택종목 리스트) 있으면 그 셋으로 수집·출력파일명 `insider-events-smallcap.json`.
- [ ] Step 1 파라미터화(기존 31 기본 유지·회귀 없음). Step 2 실행(백그라운드). 커밋.

### Task 4: `insider-smallcap-lab.js` — IWM 벤치 rel 증강 검증

**Files:** Create `map/backtest/insider-smallcap-lab.js`

- 채택종목별 dated candles ∩ IWM dates → 공통 close·R=close/IWM. structFeats(P)+structFeats(R)+beta(vs IWM)=x25. 내부자 이벤트 filed≤candle date로 insiderFeats 부착(정확 정렬).
- base(25) vs aug(25+6): 프리필터(단변량·증분) + 관문(+1.5pp·LOSO·전후반). feat-lib.logitFit/acc/splitIdx.
- [ ] Step 1 작성. Step 2 실행. 커밋.

### Task 5: 판정 → 기록

- [ ] Step 1 해석(서바이버십 감안). **통과 시** 승격 계획 별도(라이브 EDGAR+소형주 파이프라인·모델·validatedAxes·스코어카드 채택축). **기각 시** 스코어카드 탐구표 r:no + 백로그 + 메모리 갱신. Step 2 커밋+push·스코어카드 배포.
