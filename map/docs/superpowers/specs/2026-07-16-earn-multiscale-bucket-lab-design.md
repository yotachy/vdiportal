# 실적 촉촉-버킷 증분 검증 랩 설계

- 날짜: 2026-07-16 · 상태: 승인됨 · 성격: 연구/검증 랩
- 배경: [[scoopforge-earnings-axis]](실적=첫 외부데이터 축·+6.3pp) · [[scoopforge-engine-multiscale-rejected]](structure·rel 다중스케일 기각) · [[scoopforge-multiscale-drawing]]
- 인프라: `map/backtest/earnings-lab.js`(volFeats 10·earnFeats 5·fit·acc·LOSO·타깃 갭/급변/변동성) · `earn-ohlc.json`(실 실적일+OHLC US주식)

## 1. 목표 / 발견
실적 축은 **가격 시계열이 아니라 이벤트 데이터**(실적 발표일)라 작도 이니셔티브의 "가격 스윙 다중스케일"(collectStructure/Anchors) 개념이 **구조적 적용 불가**. 게다가 현 `_earnFeats`는 이미 다중-버킷: `D≤10·D≤20` 임계 + `연속 램프` + `D≤5직후·경과`. 따라서 "실적 다중스케일화"로 새로운 건 하나: **더 촘촘/확장 근접 버킷(D≤3·D≤5·D≤40)이 현 5피처 인코딩을 넘어 증분 예측력을 주는가.**

- **같은 실적일 데이터 재인코딩** → 확립된 원칙("개선은 새 데이터 슬라이스에서만·같은 데이터 재포장≈0")상 증분≈0 예상.
- **격리**: forge-core 미변경(승격 시에만 `_earnFeats` 확장·재학습).

## 2. 신피처 (랩 로컬)
`earnFeatsMS(toNext, since, t)` = 현 earnFeats 5 + `[tn≤3, tn≤5, tn≤40]` = **8피처**. 실적 근접을 3·5·10·20·40봉 다중 스케일로 인코딩.

## 3. 검증 (earnings-lab 재사용)
- **earnings-lab.js 최소 리팩터**: 자동실행부를 `if (require.main === module)`로 감싸고 헬퍼 export(`volFeats·earnFeats·earnIndices·toNextArr·sinceArr·fit·acc·tgGap/Spike/Vol·data·구축 상수`). **로직·standalone 출력 완전 불변**.
- `earn-multiscale-lab.js`: 각 타깃(갭·급변·변동성)에 **base = vol10+earn5**(현 검증모델) vs **aug = vol10+earn8_MS** OOS 비교.
  - 종목내 60/40(TRAIN_FRAC 0.6) + 종목외 LOSO(earnings-lab 서브샘플 근사) 증분 Δ.
  - 방향판별(상위3분위 상승률 ≈50%) 유지 확인.

## 4. 관문 (earnings-lab 사전등록 그대로)
촘촘버킷이 현 5피처 대비 **종목내 AND 종목외 각 +1%p↑** (갭·급변·변동성 중 유의미). 미달=기각.

## 5. 산출물 / 결정
- `map/backtest/earn-multiscale-lab.js` · 콘솔 리포트 → 판정. forge-core는 승격 시에만.
- **기각 시**: 스코어카드 탐구표 r:no + 백로그 + 메모리. **통과 시**: 승격 별도(`_earnFeats` 확장·재학습·baseline 재측정).
- 회귀: forge-core 미변경 → 245/245. earnings-lab standalone 실행 동일성(리팩터 무영향) 확인.

## 6. 비목표 / 예상
- forge-core 변경(통과 후). 실적 서프라이즈·가이던스(별도 축·범위 밖). 확률 캘리브레이션.
- **예상**: 현 램프(`vis/20`)가 근접 그래디언트를 이미 연속 포착 → 촘촘 버킷 중복·증분≈0 기각 공산 큼. 단 D≤3(실적 직전) 비선형 급증을 램프가 못 잡으면 미미한 가능성 → 엄격 검증. 숫자 기록.
