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

## v2 범위 (2026-07-14)

- 방향 판정 = `up`(예측 확률·드리프트 포함), score 아님.
- drop(제거) + add(누락 지표 투입) 둘 다 측정 → membership 종결.
- add 대상 = 표준 그래프에 없는 11종(add-defs.js). 예측을 한 번도 안 움직인 지표는 "미측정"으로 분리.
- 유보(별도 스펙): downweight·overconfident 진단·combination(재가중=v3, 이 캐시 부트스트랩)·R3 UI·승격 게이트 강화(자명규칙+BSS).
