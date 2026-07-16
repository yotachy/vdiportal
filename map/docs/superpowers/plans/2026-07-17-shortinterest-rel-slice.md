# 공매도잔고 → 상대방향 증강 검증 Plan

> 연구 랩. FINRA API(2019~) 데이터 획득 후 IJR 벤치 rel 증강(deployed base 위). forge-core 미변경. 산출=판정.

**Goal:** 고공매도 소/중형주에서 공매도잔고 신호가 rel(vs IJR) 예측에 +1.5pp 순증분 주는지 판정.

**Constraints:** forge-core 미변경(246/246) · look-ahead=공시일(settle+14일) · 증분은 deployed base(rel25) 위 · rel 사전등록 관문.

---

### Task 1: settlement 날짜 프로브 + `mine-shortint-universe.js`

**Files:** Create `map/backtest/mine-shortint-universe.js` → `shortint-universe.json`

- 먼저 settlementDate 형식 확인(최근 range 쿼리로 distinct 날짜 추출). 격주(≈15일·월말).
- 최근 ~8개 settlement 쿼리 → 종목별 평균 daysToCover 집계 → 고공매도 top 60(벤치 IJR/SPY·비상장·티커이상 제외).
- [ ] Step 1 날짜 프로브. Step 2 마이너 작성·실행. Step 3 커밋.

### Task 2: `collect-shortint.js` — 전 이력 수집

**Files:** Create `map/backtest/collect-shortint.js` → `shortint-series.json`

- 유니버스 top60 대상. settlementDate 리스트(2019~·생성 or 프로브) 각 쿼리 → 유니버스 종목 추출. pub=settle+14일. `{sym:[{settle,pub,curShort,prevShort,dtc,changePct,advol}]}` (pub 오름차순).
- [ ] Step 1 작성. Step 2 실행(백그라운드) → 커버리지. 커밋.

### Task 3: `fetch-smallcap.js` 재사용 → shortint OHLC

**Files:** `fetch-shortint.js`(fetch-smallcap 복제·유니버스/디렉토리만 교체) → `fixtures-shortint/`

- top60 + IJR·SPY 날짜 OHLC. 8s·retry·skip. ≥1000봉.
- [ ] Step 1 작성. Step 2 실행(백그라운드). 커밋.

### Task 4: `shortint-feats.js` + 단위테스트

**Files:** Create `map/backtest/shortint-feats.js`, `.test.js`

- `shortIntFeats(events, cutoffDate) → [dtcLog, changePct, shortToAdv, siPctile]` (pub≤cutoff 최근분). 없으면 0벡터. 순수·결정적.
- 테스트: pub 필터(미래 제외)·값 범위·빈·결정성.
- [ ] TDD 5스텝. 커밋.

### Task 5: `shortint-rel-lab.js` — IJR 벤치 rel 증분

**Files:** Create `map/backtest/shortint-rel-lab.js` (insider-smallcap-lab 구조 재사용)

- fixtures-shortint dated ∩ IJR → R=close/IJR·rel25. shortIntFeats(events[sym], 캔들날짜) 부착. base=rel25 vs aug=rel25+SI4.
- 프리필터(단변량·증분) + 관문(+1.5pp·LOSO·전후반). 서바이버십 경고.
- [ ] Step 1 작성. Step 2 실행. 커밋.

### Task 6: 판정 → 기록

- [ ] Step 1 해석(서바이버십·이력깊이 감안). **통과 시** 승격 계획 별도. **기각 시** 스코어카드 탐구표 r:no + 백로그 + 메모리. Step 2 커밋+push·스코어카드 배포.
