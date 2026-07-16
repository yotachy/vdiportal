# 소형주 PEAD(실적후 드리프트) → 상대방향(vs IJR) 증강 검증 설계

- 날짜: 2026-07-17 · 상태: 승인됨 · 성격: 연구/검증 랩 (실적 축 심화 — 소형주 확장)
- 배경: [[scoopforge-earnings-axis]](실적=유일 승자) · 대형주 PEAD 기각(50.2% 원신호·모멘텀 흡수, `2026-07-17-pead-rel-lab-design.md`) · [[scoopforge-insider-slice]](deployed base 교훈)
- 남은 여지: **PEAD는 소/중형·비유동주서 강함(대형주만 차익거래로 소멸)**. 소형주 유니버스에서 재검증 = 유일하게 남은 방향-신호 여지.
- 인프라: `fixtures-shortint`(52종 dated OHLC·IJR·SPY 보유) · `pead-feats.js`(peadArray·look-ahead 안전) · `feat-lib.js`(structFeats·logitFit·acc·splitIdx) · EDGAR(실적일 소스)

## 1. 가설
실적일 **반응**(발표 전후 가격이 드러낸 서프라이즈) 방향으로 수주간 드리프트가 이어진다(PEAD). 대형주선 소멸했으나 소/중형·고서프라이즈주(바이오/성장주)선 차익거래가 덜해 살아있을 수 있다. **이벤트-조건부**·비공선. **rel25(배포 relative 모델·모멘텀 포함) 위 순증분** 검증 — PEAD가 일반 모멘텀에 흡수됐는지가 관건.

## 2. 유니버스 / 실적일 데이터
- **유니버스**: `fixtures-shortint` 52종(고SI 중소형주, IJR 벤치마크 이미 존재). 사용자 확정.
- **실적일 소스 = EDGAR 8-K item 2.02**(Results of Operations, 전체이력·무료·검증됨):
  - ticker→CIK: `https://www.sec.gov/files/company_tickers.json`.
  - 종목별 `https://data.sec.gov/submissions/CIK{10자리}.json` → `filings.recent`에서 `form=='8-K' && items.includes('2.02')`인 `filingDate` 수집 + `filings.files[]` 구 shard도 순회(전체이력).
  - **외국계(BNS·CM·ENB·CNQ·INFY 등)**: 8-K 미제출(40-F/6-K) → 실적일 0건. 그대로 두면 PEAD 피처 전부 0 → 신호서 자동 제외. 유효 유니버스 ~45종.
  - 산출: `map/backtest/smallcap-earnings.json` = `{ [sym]: ["YYYY-MM-DD", ...] }`(중복 제거·정렬).
  - EDGAR 예의: User-Agent에 연락처, 요청 간 지연.

## 3. 신호 피처 (`pead-feats.js` 재사용 — 순수·look-ahead 안전)
- 각 실적일 → 캔들 eIdx(날짜≥실적일 최근·이진탐색). **반응 = close[eIdx+1]/close[eIdx−1]−1**(2일·BMO/AMC 무관). 시점 t가 `eIdx+2 ≤ t ≤ eIdx+45`면:
  - `[reaction(clamp±0.5), barsSince/45, reaction×감쇠(1−bars/45), |reaction|]`. 창 밖 = 0.
  - reaction은 t≥eIdx+2에서만 참조 → look-ahead 안전. 실적일 사전공지.

## 4. 타깃 / base
- 타깃 = **IJR 대비 상대 아웃퍼폼** h=10/20/40(드리프트 1~3달·20/40 핵심). R=close/IJR.
- **base = rel25**(structFeats P + structFeats R=P/IJR + beta) vs **aug = rel25 + PEAD4**.

## 5. 검증 (`pead-smallcap-lab.js`)
- 종목별: full 시계열 peadArray 계산 → IJR 날짜맵 정렬(ijrMap)로 (P,IJR,R,peadAligned). 종목내 60/40 시간분할 + LOSO + 전후반. 프리필터(단변량·증분).
- **PEAD-창 부분집합 리포트**: 실적후 창 시점(신호≠0)만 따로 적중률(창 밖은 신호 0이라 희석되므로).
- **관문 +1.5pp**(전체 증분) + LOSO 과반 + 전후반 부호 일관.

## 6. 격리 / 산출
- forge-core **미변경**(246/246 유지). 새 파일은 backtest 전용. 산출 = 판정.
- **통과 시**: 실적 축의 첫 방향 확장(승격 후보) → 스코어카드·백로그·메모리 기록 후 엔진 이식 별도 스펙.
- **기각 시**: 스코어카드 탐구표 r:no + 백로그(소형주 PEAD도 흡수) + 메모리 갱신.

## 7. 예상 / 리스크
- **모멘텀 흡수**: PEAD=post-earnings momentum. rel25 mom(20/60/120/250)이 이미 포착했을 수 있음. 실적일 반응 특정·이벤트조건부라 차별 여지. 증분이 판정.
- **서바이버십**: fixtures-shortint=현존 종목만(상장폐지 소형주 누락) → 통과여도 상방편향 감안·경고 명기.
- **얕은 이력/외국계**: 최근 IPO·외국계는 실적일 희박 → 신호 커버리지 낮음. 유효 종목수 리포트.
- 가이던스·IV crush는 무료이력 벽으로 이번 스코프 제외.
