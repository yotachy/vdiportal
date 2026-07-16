# PEAD(실적후 드리프트) → 상대방향 증강 검증 설계

- 날짜: 2026-07-17 · 상태: 승인됨 · 성격: 연구/검증 랩 (실적 축 심화)
- 배경: [[scoopforge-earnings-axis]](실적=유일 승자·비공선 이벤트) · [[scoopforge-insider-slice]](포지셔닝 종결·deployed base 교훈)
- 인프라: `earn-ohlc.json`(날짜+실적일 보유 US 30종) · `feat-lib.js`(structFeats·logitFit·acc·splitIdx) · SPY(fixtures-shortint/SPY.json 날짜)

## 1. 가설
실적일 **반응**(발표일 전후 가격이 드러낸 서프라이즈) 방향으로 수주간 드리프트가 이어진다(PEAD, 문서화된 방향 이상현상). **이벤트-조건부**(실적후 창에서만)·비공선. **rel25(배포 relative 모델·모멘텀 포함) 위 순증분** 검증 — PEAD가 일반 모멘텀에 흡수됐는지가 관건(실적일 반응 특정이 차별점).

## 2. 신호 피처 (`pead-feats.js` — 순수·look-ahead 안전)
- 각 실적일 → 캔들 eIdx(날짜≥실적일 최근). **반응 = close[eIdx+1]/close[eIdx−1]−1**(2일·BMO/AMC 무관). 시점 t가 실적후 창 `eIdx+2 ≤ t ≤ eIdx+45`면:
  - `[reaction(부호·크기 clamp±0.5), barsSince/45(창내 위치), reaction×감쇠(1−bars/45), |reaction|(크기)]`. 창 밖 = 0.
  - reaction은 t≥eIdx+2에서만 참조(eIdx+1 이미 과거) → **look-ahead 안전**. 실적일은 사전공지.

## 3. 타깃 / base
- 상대 아웃퍼폼(vs SPY) h=10/20/40(드리프트 1~3달·20/40 핵심). **base = rel25**(structFeats P + structFeats R=P/SPY + beta) vs **aug = rel25 + PEAD4.**

## 4. 검증 (`pead-rel-lab.js`)
- earn-ohlc 30종 · SPY 날짜맵 정렬(insider-smallcap-lab 패턴). PEAD는 종목 full 시계열서 계산 후 정렬. 종목내 60/40 + LOSO + 전후반. 프리필터(단변량·증분). 관문 +1.5pp.
- **PEAD-창 부분집합 리포트**: 실적후 창 시점만 따로 적중률도(창 밖은 신호 0이라 희석되므로).

## 5. 격리 / 산출
- forge-core 미변경 → 246/246. pead-feats 단위테스트. 산출=판정. **통과 시** 실적 축의 방향 확장(첫 방향 승자 후보). **기각 시** 스코어카드·백로그·메모리(대형주 PEAD 약함→소형주 여지).

## 6. 예상 / 리스크
- **대형주=효율적**: PEAD는 소/중형주서 강함(차익거래 덜). 대형주 30종은 약할 공산 — 힌트시 소형주 확장(실적일 수집 필요).
- **모멘텀 흡수**: PEAD=post-earnings momentum. rel25 mom(20/60/120/250)이 이미 포착했을 수 있음. 단 실적일 반응 특정·이벤트조건부라 차별 여지. 증분이 판정.
- 가이던스·IV crush는 데이터 벽(무료이력 없음/유료)으로 이번 스코프 제외.
