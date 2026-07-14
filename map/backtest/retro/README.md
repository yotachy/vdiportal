# 회고 존 (Retro Zone)

백테스트 안의 격리된 회고분석 영역. 엔진의 미스를 오류 귀속으로 분석해 **지표 재조합 후보**를 발굴하고, 정직한 관문으로 걸러 `retro-catalog.json`으로 산출한다. **forge-core.js는 무수정** — 지표 기여는 그래프에서 노드를 빼고 재실행한 score 변화(ablation)로 측정한다.

설계: `docs/superpowers/specs/2026-07-14-retro-zone-design.md`

## 실행

```bash
# 1) 오류 원장 수집(엔진 ablation 1패스 — 수십 분, 캐시됨)
node backtest/retro/miss-ledger.js            # retro-records.json 생성
#    전 지표 ablation: RETRO_ALL_INDS=1 node backtest/retro/miss-ledger.js
# 2) 파이프라인 → 대장
node backtest/retro/build-catalog.js          # retro-catalog.json + 요약
# 3) 단위 테스트
node --test backtest/retro/*.test.js
```

## 정직 규율

- 진단은 **train**에서만, 게이트 채점은 **test**에서만(스누핑 차단). 대장의 개선 수치는 전부 OOS.
- **"개선 없음"이 기대 기본값**("가격 재조합=새 정보 0" 벽). null도 대장에 기록 — 그것도 정보.
- 배포 제외. `retro-records.json`·`retro-catalog.json`은 서버·배포에 올리지 않는다.

## v1 유보 범위

- **drop(지표 제외)만** 정확 지원. downweight(감가)·add(누락 지표 투입)는 v2.
- 진단 kind는 `betray`(제외 시 개선)만. `overconfident`·`missing`은 v2.
- ablation 대상 기본 = 핵심 Lv1+Lv2 지표(`CORE`). 전 지표는 `RETRO_ALL_INDS=1`.
- 채택분의 forge-core 실제 반영(국면조건부 드리프트 조정)은 대장에 채택이 나온 뒤 별도 커밋.
- R3 사용자 선택 심화 UI는 2차 스펙(대장 스키마가 데이터 계약).
