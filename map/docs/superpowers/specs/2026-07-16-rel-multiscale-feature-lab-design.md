# 상대강도 스윙-티어 피처 증분 검증 랩 설계

- 날짜: 2026-07-16 · 상태: 승인됨(구현 대기) · 성격: **연구/검증 랩**
- 배경: [[scoopforge-rel-axis]](rel 검증축·54~57%) · [[scoopforge-engine-multiscale-rejected]](structure 다중스케일 엔진 기각) · [[scoopforge-multiscale-drawing]]
- 인프라: `map/backtest/rel-lab.js`(파이프라인) · `feat-lib.js`(`structFeats`·`logitFit`·`acc`·`splitIdx`) · `fixtures/*-1day.json`(US 31종+SPY)

## 1. 목표 / 발견
rel 모델은 **이미 다중스케일**: `structFeats`가 `mom(20/60/120/250)`·`v20/v120`·MA200 등 다중 lookback을, 자기가격+상대비율(R=P/SPY) 양쪽에 적용(25피처, rel-model.json). 따라서 이번 초기화 이니셔티브 관점의 새 요소는 하나: **상대비율 R의 스윙-구조 티어(collectStructure 대/중/소)를 피처로 추가하면 상대방향 OOS 예측이 순증가하는가.**

- **프리필터가 관문**: 신피처가 약하고 기존과 공선(증분≈0)이면 **재학습 없이 기각**('같은 가격 재포장=새정보 0' 전례: 인터마켓·왜도·8-K).
- **격리**: forge-core **미변경**(승격 시에만 `_relFeats` 증강+재학습). 랩은 `map/backtest/`.

## 2. 신피처 (상대비율 R에 대해, 랩 로컬)
`FC.collectStructure(R_up_to_t)` → **[msBias(R), 대티어bias, 중티어bias, 소티어bias, 티어일치도]** (5).
- tierBias = analyzeStructure 매핑(BOS±0.6·CHoCH±0.5·trend±0.3). msBias = 유의도 가중합성([[scoopforge-engine-multiscale-rejected]]의 `multiScaleStructBias` 재사용). 일치도 = 티어 부호 합의(−1..1).
- 티어 부족 시 0.

## 3. 프리필터 (저렴·결정적 — run() 없음)
rel-lab `buildRows` 재사용(P·R·x25·y[H]=상대아웃퍼폼·prevRel=지속성·relMom). 각 row에 신피처 부착. OOS 분할=심볼별 시간 60/40(`splitIdx`).
- **(a) 단변량 OOS**: 각 신피처 `sign(f)` vs `y[20]` 적중률(50% 초과?).
- **(b) 증분예측력**: `logitFit(x25)` vs `logitFit(x25+신5)` — **TEST(OOS) 적중률 차** Δ(지평 10/20/40).
- **(c) 공선성**: 각 신피처를 x25로 선형회귀한 잔차 R²(낮으면 기존이 이미 설명=중복).
- **기각 조건**: 신피처 단변량 ~50% **그리고** 증분 Δ ≈ 0(±0.5pp 이내) → **REJECT**(재학습 불필요).

## 4. 통과 시만 — 풀 관문 (rel-lab 사전등록)
증강 로지스틱 재학습 → OOS 상대방향이 **다수결·지속성·모멘텀단독 전부 +1.5pp↑ · 전/후반 양수 · LOSO 유지**. 전부 충족해야 승격.

## 5. 산출물 / 결정
- `map/backtest/rel-multiscale-lab.js`(+신피처 헬퍼) · 콘솔 리포트 → **판정**. forge-core는 승격 시에만.
- **기각 시**: 스코어카드 탐구표 r:no + 백로그 기록. **통과 시**: 별도 승격(`_relFeats` 증강·`_REL_HZ`/`_RELS_HZ` 재학습·validatedAxes·baseline 재측정).
- 회귀: forge-core 미변경 → 245/245 그대로. 신피처 헬퍼는 단위테스트.

## 6. 비목표 / 예상
- forge-core 변경·재학습(통과 후). rel 외 축. 확률 캘리브레이션.
- **예상**: 상대비율 스윙구조는 상대모멘텀(이미 다중 lookback)과 겹쳐 **증분≈0 기각** 공산 큼. 단 상대 BOS/CHoCH(상대추세 전환)가 모멘텀 밖 실체일 미미한 가능성 → 엄격 검증. 통과든 기각이든 숫자 기록.
