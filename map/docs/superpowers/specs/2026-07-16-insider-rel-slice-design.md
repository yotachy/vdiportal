# 내부자 거래(Form 4) → 상대방향 증강 검증 설계

- 날짜: 2026-07-16 · 상태: 승인됨 · 성격: 연구/검증 랩 (신규 외부 데이터 슬라이스 후보)
- 배경: [[scoopforge-earnings-axis]](실적=첫 외부데이터 승자·비공선 인과) · [[scoopforge-rel-axis]](상대방향 base~50% 공정) · [[scoopforge-engine-multiscale-rejected]](지표 재공식화 무효→새 데이터만)
- 인프라: `map/backtest/rel-lab.js`·`feat-lib.js`(structFeats·logitFit·acc·splitIdx) · `fixtures/*-1day.json`(US 31종+SPY)

## 1. 가설 / 목표
내부자(임원·이사) **순매수 군집**이 rel 축(SPY 대비 아웃퍼폼, base~50% 공정)에 **증분 예측력**을 준다. 근거: 내부자는 가격과 **비공선**(내부 정보)·**인과**·**무료**(EDGAR)·**look-ahead 안전**(공시일 명확) — 실적과 같은 승자 조건. Cohen-Malloy-Pomorski: **opportunistic 내부자**(불규칙 타이밍)가 방향 신호를 가짐(routine은 없음).

## 2. 데이터 수집 (`collect-insider.js` → `insider-events.json`)
- EDGAR: 티커→CIK(`company_tickers.json`) → Form 4 accession 전체(`data.sec.gov/submissions/CIK….json` + `filings.files` 과거 페이지네이션) → 각 Form 4 XML 파싱.
- 추출: `transactionCode`(P매수·S매도)·`transactionShares`·`transactionPricePerShare`·거래가치·`reportingOwner`(isOfficer/isDirector·officerTitle·rptOwnerCik)·거래일(`periodOfReport`)·**filing 수락일(acceptanceDateTime)**.
- 유니버스 = rel-lab **31 US종목**. 산출: `{ sym: [{filed, txn, code, shares, value, roleRank, ownerCik}] }`.
- **규율**: 10 req/s·`User-Agent` 헤더 필수. **look-ahead = filed(공시)일 기준**(거래일 아님). 매수 P·매도 S만(옵션행사 등 제외). 백그라운드 수집(~30~90분).

## 3. 신호 피처 (`insider-feats.js` — 순수, 시점 t·`filed ≤ t`만)
트레일링 창(90거래일 근사)으로:
- **군집/순매수**: 순매수$ (해당 종목 거래대금/변동성으로 정규화)·고유 매수자 수·매수건/(매수+매도)건 비율·마지막 군집매수 경과일(감쇠).
- **Opportunistic**: 각 ownerCik의 거래 타이밍 규칙성 판정(과거 매매 간격 분산) → 불규칙(opportunistic) 내부자 순매수 가중.
- **직위 가중**: CEO/CFO(roleRank↑) > 이사. ~5-7피처. 이벤트 없으면 0 벡터.

## 4. 검증 (`insider-rel-lab.js` — rel-lab 증강, rel-multiscale-lab 패턴)
- base = rel 25피처(structFeats P + structFeats R + beta) vs **aug = 25 + 내부자 N**.
- 타깃 = 상대 아웃퍼폼(P[t+h]/P[t] > SPY[t+h]/SPY[t]) h=10/20/40. OOS **심볼별 60/40** + **LOSO**(종목 홀드아웃) + 자명규칙(±모멘텀·지속성).
- **프리필터**: 내부자 피처 단변량 OOS·증분예측력 Δ(logit(25) vs logit(25+N)). 약함+증분≈0이면 조기 기각.
- **관문(rel-lab 사전등록)**: 증강이 base 대비 **+1.5pp↑(지평 다수)·자명규칙 초과·전후반 양수·LOSO 유지**. 충족해야 승격.

## 5. 격리 / 산출
- forge-core **미변경**(승격 시에만: 내부자 데이터 라이브 파이프라인 + 증강 rel 모델 재학습 + validatedAxes 등록). 랩·수집기·데이터는 `map/backtest/`.
- 산출 = 판정 + 근거 숫자. **통과 시 첫 신규 데이터축**(실적 이후), 기각 시 스코어카드 탐구표 정직 기록.
- 회귀: forge-core 미변경 → 246/246.

## 6. 리스크 / 예상
- **데이터 수집 실패/부분**: EDGAR rate-limit·XML 스키마 변형(구식 Form 4는 TXT). 31종 중 커버율 리포트·부족 종목 제외.
- **신호 감쇠**: 현대 시장에서 내부자 알파는 약해짐(특히 대형주·routine). opportunistic·군집 게이트로 강화. 기각 가능성 실재 — 하지만 **비공선 인과 데이터라 실적처럼 통할 여지**.
- **표본**: 31 대형주 위주(내부자 신호는 소형주서 강함) → 커버율·LOSO로 견고성. 유니버스 확장은 후속.
- look-ahead 엄수: filed일 이전 이벤트만. 거래일≠공시일(최대 2영업일 지연) 반영.
