# VIX 기간구조 → 변동성 예보 증분 검증 설계

- 날짜: 2026-07-17 · 상태: 승인됨 · 성격: 연구/검증 랩 (무료 옵션-포지셔닝 프록시)
- 배경: [[scoopforge-earnings-axis]](외부 데이터소스 조사결론: "VIX=무료·실현vol 공선 위험·미시도") · [[scoopforge-insider-slice]](직전 슬라이스 기각)
- 인프라: `earnings-lab.js`(volFeats·tgVol/tgSpike/tgGap·fit·acc·LOSO export) · `earn-ohlc.json`(날짜 t 포함 US주식)

## 1. 목표 / 핵심 질문
종목별 옵션(put/call·dealer gamma)은 유료라 막힘(선행 재확인). 무료 대체 = 시장전체 **VIX 기간구조**(VIX/VIX3M = 백워데이션↔콘탱고 = forward-looking implied vol positioning). **질문: implied vol 기간구조가 종목별 realized-vol 기반 변동성 예보에 증분 정보를 주는가.** 선행 결론의 "실현vol 공선 위험" 가설을 직접 실측 — 공선이면 기각(예상), 아니면 승자.

## 2. 데이터 (무료·FRED)
- `collect-vix.js`(또는 .py): FRED CSV `fredgraph.csv?id=VIXCLS`(VIX 1990~)·`id=VXVCLS`(VIX3M 2007~) → `vix-series.json` = `{ "YYYY-MM-DD": {vix, vix3m} }`. 결측(".") 스킵. 2회 fetch.

## 3. 신호 피처 (`vix-feats.js` — 순수, 날짜 d·≤d만 = look-ahead 안전[VIX 종가 EOD 가용])
`vixFeats(dates, vixArr, vix3mArr, i)` (해당 종목 시계열의 캔들 i의 날짜에 대응하는 VIX 인덱스):
- `[ vix/20−1(레벨), vix/vix3m−1(기간구조·백워데이션>0), (vix−vix_{−5})/vix_{−5}(5일변화), vix 1년(252) 백분위−0.5 ]` = 4피처. VIX 없으면(정렬 실패) 0벡터.
- 날짜 매핑: 각 종목 캔들 t의 날짜 → VIX 시계열에서 그 날짜 이하 최근 인덱스(주말/휴일 보정).

## 4. 검증 (`vix-vol-lab.js` — earnings-lab 재사용)
- earn-ohlc(날짜 t 포함) US주식 · `E.volFeats`(10, realized vol base) · 타깃 `E.tgVol`(주)·`E.tgSpike`·`E.tgGap`.
- base = volFeats(10) vs **aug = volFeats + vixFeats(4)**. 종목내 60/40(`E.TRAIN_FRAC`) + 종목외 LOSO(earnings-lab 서브샘플 근사).
- **프리필터**: vixFeats 단변량·증분 Δ. **관문(earnings-lab 사전등록)**: 증분 **종목내 AND 종목외 +1%p↑**(vol/spike/gap 중 유의). 미달=기각.
- 방향판별(상위3분위): vol/spike/gap는 비방향(크기) 예측이라 방향 무관 확인.

## 5. 격리 / 산출
- forge-core **미변경**(통과 시에만 VIX 라이브 수집+모델·validatedAxes). 랩·데이터 map/backtest/. 산출=판정.
- 회귀: forge-core 미변경 → 246/246. vix-feats 단위테스트.

## 6. 예상 / 리스크
- **시장전체·1시계열**: VIX 기간구조는 모든 종목에 같은 값(그 날짜) → 종목별 증분은 시장 vol 레짐 오버레이 효과만. 종목별 realized vol이 이미 시장 레짐을 상당부분 반영 → 공선·증분≈0 공산 큼(선행 예상). 단 implied(미래 기대)≠realized(과거)라 실낱 여지.
- look-ahead: VIX 종가는 EOD 가용(종목 종가와 동시점) → 같은 캔들 날짜의 VIX 사용 안전. 미래 VIX 금지.
- VIX3M은 2007~이라 그 이전 시점은 vixFeats 0(또는 제외).
