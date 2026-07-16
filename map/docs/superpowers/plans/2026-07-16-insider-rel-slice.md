# 내부자 거래 → 상대방향 증강 검증 Plan

> 연구 랩. 수집기(EDGAR)가 첫 태스크·시간소요. forge-core 미변경. 산출=판정(+1.5pp 관문). 컨트롤러 실행·해석.

**Goal:** 내부자(Form 4) 순매수 피처가 rel 25피처에 상대방향 증분(+1.5pp OOS·LOSO)을 주는지 판정.

**Constraints:** forge-core 미변경(246/246) · look-ahead=filed일 기준 · EDGAR 10req/s+User-Agent · rel-lab 사전등록 관문.

---

### Task 1: `collect-insider.js` — EDGAR Form 4 수집

**Files:** Create `map/backtest/collect-insider.js` → `map/backtest/insider-events.json`

- 유니버스 = rel-lab의 31 US 티커(하드코딩 리스트 복제).
- 단계: (a) `sec.gov/files/company_tickers.json` → 티커→CIK. (b) `data.sec.gov/submissions/CIK{10d}.json` → recent + `filings.files[].name`(과거) 순회, form==="4" accession+acceptanceDateTime 수집. (c) 각 Form 4: `Archives/edgar/data/{cik}/{accNoDashes}/` 인덱스에서 XML 문서 URL → fetch → 파싱(nonDerivativeTransaction: transactionCode P/S·shares·pricePerShare·value; reportingOwner: isOfficer/isDirector/officerTitle/rptOwnerCik; periodOfReport). (d) 취합 `{sym:[{filed,txn,code,shares,value,roleRank,ownerCik}]}`.
- 규율: 각 요청 사이 ≥110ms(10/s)·`User-Agent: "scoopforge-research moneyscdev@gmail.com"`. 실패/구식(TXT-only) 스킵+카운트. 매수 P·매도 S만.
- roleRank: CEO/CFO title 매칭 3 · 기타 officer 2 · director 1.

- [ ] Step 1: 수집기 작성(재개 가능하게 부분저장). Step 2: **소표본 3종(AAPL·MSFT·JPM)으로 스모크**(events 구조·filed>txn 확인). Step 3: 커밋 `feat(backtest): EDGAR Form 4 내부자 수집기`. Step 4: **전체 31종 수집(백그라운드)** → insider-events.json + 커버율 리포트.

---

### Task 2: `insider-feats.js` — 신호 피처 + 단위테스트

**Files:** Create `map/backtest/insider-feats.js`, `insider-feats.test.js`

- `insiderFeats(events, tFiledCutoff, opts) → [netBuyNorm, numBuyers, buyRatio, sinceLastBuyDecay, oppNet, roleWtNet]` (길이 고정). `filed ≤ cutoff` 이벤트만. 이벤트 없으면 0 벡터.
- opportunistic: ownerCik별 과거 매매 간격 분산 큰(불규칙) 내부자 가중. 순수·결정적.
- 테스트: 고정 이벤트셋 → 순매수 부호·매수자 카운트·cutoff 필터(미래 이벤트 제외)·빈 입력 0벡터·결정성.

- [ ] TDD 5스텝. 커밋 `test(backtest): 내부자 신호 피처 + 단위테스트`

---

### Task 3: `insider-rel-lab.js` — rel 증강 + 프리필터 + 관문

**Files:** Create `map/backtest/insider-rel-lab.js`

- rel-lab `buildRows` 패턴(P·R=P/SPY·x25) + 각 t에 `insiderFeats(events[sym], date[t])` 부착(날짜 정렬 — fixtures 캔들 t와 insider filed 매핑).
- 프리필터: 내부자 피처 단변량 OOS(vs 상대아웃퍼폼 y20)·증분 `logit(25)` vs `logit(25+N)` TEST 적중률(feat-lib.logitFit·splitIdx 60/40).
- 관문: 증분 지평 다수 **+1.5pp↑** · **LOSO**(종목 홀드아웃 증분 분포) · 전후반 양수 · 자명규칙 초과. 콘솔 표+판정.

- [ ] Step 1 작성 · Step 2 실행(insider-events.json 준비 후) · 커밋 `feat(backtest): 내부자→상대방향 증강 검증 랩`

---

### Task 4: 판정 → 기록

- [ ] Step 1: 실행 해석(통과/기각). Step 2: **통과 시** 승격 계획 별도(라이브 EDGAR 파이프라인·증강 rel 재학습·validatedAxes·스코어카드 채택축). **기각 시** 스코어카드 탐구표 r:no + 백로그 + 메모리. Step 3: 커밋+push·스코어카드 배포.
