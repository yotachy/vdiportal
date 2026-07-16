# 공매도잔고(FINRA) → 상대방향 증강 검증 설계

- 날짜: 2026-07-17 · 상태: 승인됨 · 성격: 연구/검증 랩 (신규 외부 데이터 슬라이스)
- 배경: [[scoopforge-insider-slice]](포지셔닝 슬라이스 파이프라인 선례·기각) · [[scoopforge-earnings-axis]](데이터소스·**deployed base 위 증분 교훈**) · [[scoopforge-rel-axis]]
- 인프라 재사용: `feat-lib.js`(structFeats·logitFit·acc·splitIdx) · `fetch-smallcap.js`·`mine-insider-universe.py` 패턴 · insider-smallcap-lab 구조

## 1. 가설 / 프레이밍
공매도잔고(정보성 숏 → 상대약세 예측 or 과다 숏 → 스퀴즈 반등)가 **상대방향(vs IJR 소형주지수, base~50% 공정)** 예측에 증분. 신호가 강한 **고공매도 소/중형주** 유니버스. **VIX 교훈 처음부터 적용: 증분은 vol-only가 아니라 deployed base(rel-25) 위에서 측정.**

## 2. 데이터 (무료·FINRA API, 2019~현재 격주)
- 소스: `api.finra.org/data/group/otcMarket/name/consolidatedShortInterest`(settlementDate 파티션·종목별 `currentShortPositionQuantity·previousShortPositionQuantity·averageDailyVolumeQuantity·daysToCoverQuantity·changePercent`).
- `mine-shortint-universe.js`: 최근 여러 settlement 쿼리 → 종목별 평균 days-to-cover 랭크 → **고공매도 top ~60**(벤치·비상장 제외).
- `collect-shortint.js`: 전 settlementDate(2019~·~180) 쿼리 → 유니버스 종목만 추출 → `shortint-series.json` = `{sym:[{settle, pub, curShort, prevShort, dtc, changePct, advol}]}`.
- **look-ahead**: 잔고는 settlement 후 공시 지연 → **pub = settle + 14일(보수)**, 랩에서 pub ≤ 캔들날짜만 사용.

## 3. 신호 피처 (`shortint-feats.js`, pub ≤ d만·순수)
- `[dtc(정규화·log), changePct(SI변화), curShort/advol, SI 자기이력 백분위−0.5]` ~4피처. 가용 최근 공시분. 없으면 0.

## 4. 데이터 수집
- **OHLC**(`fetch-smallcap.js` 재사용): 유니버스 top60 + IJR·SPY, 날짜 포함 → `fixtures-shortint/{sym}.json`. rate-limit 8s·retry·skip-cached.

## 5. 검증 (`shortint-rel-lab.js`)
- 날짜 정렬(캔들 t 날짜 ↔ SI pub). R=close/IJR. structFeats(P)+structFeats(R)+beta = rel25. **base = rel25 vs aug = rel25 + SI4.**
- 타깃 상대아웃퍼폼(vs IJR) h=10/20/40. 종목내 60/40 + LOSO + 전후반. 프리필터(단변량·증분).
- **관문(2단계·VIX 교훈)**: ①naive(rel25 base) 증분 ②**deployed 재검증**: rel25 자체가 이미 배포 모델이라 여기선 base=rel25가 곧 deployed → 증분 +1.5pp·LOSO 다수·전후반 양수. (rel 위에 SI가 순증분인지 직접.)

## 6. 격리 / 산출
- forge-core **미변경**(통과 시에만 라이브 FINRA+모델·validatedAxes). 랩·수집·데이터 map/backtest/. 산출=판정.
- 회귀: forge-core 미변경 → 246/246. shortint-feats 단위테스트.

## 7. 리스크 / 예상
- **이력 얕음(2019~7년·격주 ~168)**: fixtures 20년보다 얕아 OOS 파워↓ — 단 밈스퀴즈·COVID·2022약세 포함 풍부 구간. bi-monthly라 SI 피처는 격주 계단형(캔들 t마다 최근 공시 유지).
- **서바이버십**: 생존 종목만 OHLC(고공매도 후 상폐/스퀴즈 파산 누락) — 편향 방향 복잡(상폐=숏 옳았음 누락→신호 과소 or 스퀴즈 생존만→과대), 명시·보수 해석.
- **선택 편향**: 고SI로 유니버스 선정=stock characteristic(per-timepoint 신호는 look-ahead 안전). 내부자 선례와 동일 캐빗.
- **예상**: 정보성 숏은 학술 알파(Boehmer 등)이나 현대 유동주식·rel 모멘텀에 흡수됐을 수 있음. 정직 검증.
