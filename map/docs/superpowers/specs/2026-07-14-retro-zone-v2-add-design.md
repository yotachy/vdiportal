# 회고 존 v2 — 누락 지표 add + up 기반 membership 종결 — 설계

날짜: 2026-07-14 · 상태: 승인됨(사용자) · 전제: v1(오류귀속 drop 파이프라인) 배포 완료 [[scoopforge-retro-zone]]

## 배경 / 목적

v1 실측(9,369 레코드): **어떤 단일 핵심지표를 제거(drop)해도 방향정확도 변화 [−0.14, +0.13]pp** — 단일 지표 제거 레버는 방향 개선에 실증적으로 죽었다("가격 재조합=0" 벽을 per-indicator ablation 수준에서 실측). 구조적 원인은 ~19항 캡 드리프트 블렌드의 희석.

v2 목표(옵션 1 — **재조합 가설 종결**): drop과 대칭인 **누락 지표 add**를 측정해, drop+add를 합쳐 **"지표 membership(넣고빼기)으로는 방향 예측을 개선할 수 없다"를 definitively 종결**한다. 정직한 사전 확률은 add도 ~0(희석 논리 동일 + 누락 11종 모두 가격/거래량 파생이라 기존 19종에 흡수됐을 개연). **결과가 ~0이면 그것이 성과** — 모호한 null이 아니라 실측으로 닫은 결론(스코어카드 기록). combination(재가중) 레버는 v3로 분리하되, 이 캐시가 v3를 부트스트랩한다.

## 핵심 결정 (브레인스토밍 합의)

1. **측정 기반 = `up`(예측 확률), score 아님.** 방향 판정을 `sign(verdict.score)` → **`up≥50 ? 상승 : 하락`**(예측 경로/드리프트 기반)으로 전환. 이유: (a) `up`은 엔진이 실제로 내놓는 캘리브레이션된 산출물 = **가장 객관적·유료 서비스 예측 기준 그 자체**(내부 score 프록시보다 방어 가능). (b) 오버레이(pivot·psar·keltner·donchian)는 combine에 zeros·**드리프트로만** 기여 → `sign(score)`로는 영원히 Δ0라 membership 종결이 불완전. `up`은 combine+드리프트 둘 다 잡음. **일관성을 위해 drop도 up 기반으로 재측정** → drop+add를 같은 자로.
2. **프로브로 확정된 두 사실**:
   - `params:{}`는 불신 — williams가 period 없이 neutral로 죽음. → 누락 11종 **올바른 기본 파라미터 맵 필요**(BLOCK_DEFS에서 추출).
   - add-노드 구성 가능(node 생성 + `s_comb` 배선). 실데이터 위생 검사로 no-op 판별.

## 공통 원칙 (v1 계승 — 사전 등록)

- 진단은 **train**만, 게이트 채점은 **test**만(스누핑 차단). 대장 개선 수치는 전부 OOS.
- **"개선 없음"이 기대 기본값** — null도 대장에 기록.
- 하네스 규약: `map/backtest/retro/` 결정론(순수 모듈 Date.now/random 금지·러너 Date.now는 stderr만)·lookahead 금지·배포 제외.
- forge-core.js **무수정** — add도 그래프 조작(노드 추가 + 재실행)으로만.
- 저자유도: 진단 1건 → 재조합 변경 1개. v1의 drop + v2의 add까지. downweight는 유보.

## 아키텍처 — v1 8모듈 in-place 진화 + 신규 1

### A. 측정 기반 전환 (up)

- `lib.js`: `predDir`가 **`up`을 읽는다**(`predDirUp(up)= up>=50?1:-1`). `accBase(recs)`는 `rec.up`, `accMod(recs, g, key, {map})`는 `rec[map][key].up`(drop=`ab`, add=`addAb`). realDir(=`sign(a20-base)`)는 불변.
- v1 modules(lib/attribution/gate/build-catalog/miss-ledger)를 **in-place 수정**(v2가 v1을 대체·진화, git 히스토리가 v1 보존). 테스트도 up 기반으로 갱신.

### B. 레코드 스키마 v2 (신규 collect — v1은 ablated score만 저장했음)

```js
{ sym, t, base, a20, a60,
  up,                              // base 예측 up (upProbFromPrediction)
  regime: string[],
  ab:    { [presentId]: { up } },  // drop-one: 해당 지표 제거 후 예측 up
  addAb: { [absentBT]:  { up } } } // add-one:  해당 지표 추가 후 예측 up
```

- 수집량: base + 10 drop(CORE present) + 11 add(absent) = **22 엔진런/시점 × 9,369 ≈ 20.6만 런 ≈ 3시간**(1회 백그라운드). `miss-ledger.js`가 drop·add ablation을 한 패스로 수집 → `retro-records.json` 재생성(gitignore).

### C. 신규 `add-defs.js` — 누락 지표 기본 파라미터 + add-노드 구성

- `ABSENT_DEFAULTS`(BLOCK_DEFS forge-state.js:210-220에서 추출, 검증됨):
  ```
  pivot:{} · psar:{step:0.02,max:0.2} · keltner:{len:20,atrLen:10,mult:2} · donchian:{len:20}
  cci:{period:20} · roc:{period:12} · williams:{period:14} · ao:{fast:5,slow:34}
  aroon:{period:25} · mfi:{period:14} · cmf:{period:20}
  ```
- `graph-ablate.js`에 `addIndicatorNode(graph, blockType)` 추가: `{id:"add_<bt>", kind:"block", blockType, params:ABSENT_DEFAULTS[bt], conviction:0, weight:50}` 노드 생성 + `blockType==="combine"` 노드로 향하는 엣지 1개 배선(기존 지표→s_comb 패턴 미러). 원본 불변.
- **위생 검사(필수)**: 실데이터 서브셋에서 각 add-노드가 base 대비 `up`을 실제로 움직이는지 확인. **한 번도 안 움직이는 지표는 대장에 `not-measured`로 명시**(no-op을 "개선 없음"으로 오판 금지). 특히 **mfi·cmf는 volume 스레딩 필요**([[scoopforge-retro-zone]]) — 표준 그래프의 `s_vol` 노드가 있으니 add 시 그 거래량이 스레딩되는지 위생 검사로 확인.

### D. 파이프라인 진화

- **attribution.js**: drop 후보(ab, kind `betray`) + **add 후보(addAb, kind `missing`)** 양쪽 진단. 국면 g마다 present 지표 drop-gain + absent 지표 add-gain(=`accMod(train,g,bt,{map:"addAb"}) - accBase(train)`) 상위를 진단으로.
- **remix.js**: 후보 op `drop`(present indId) / `add`(absent blockType). id `retro-<regime>-add-<bt>`. rationale는 kind별 분기(betray="반대로 밀어" / missing="추가 시 개선").
- **gate.js**: `candidate.change.op`로 분기 → `accMod(..., {map: op==="add"?"addAb":"ab"})`로 채점. **T7 마이너(op 미검사) 동시 해결.** 판정·evidence 필드 v1과 동일(전부 OOS).
- **build-catalog.js**: drop+add 병합 대장 `{id, diagnosis, remix, verdict, evidence, promoted:false}[]` + **종결 요약**: drop 분포(국면별 max)·add 분포(국면별 max)·채택/개선없음/표본부족/미측정 카운트. 전부 임계 미달이면 종결 진술 출력:
  > "membership 레버(add+drop) 방향 개선 0 — up 기반 실측, 재조합 가설 종결."

### E. 산출물 / 기대

통합 대장(up 기반) + 종결 진술. 기대 = drop·add 모두 ~0 → 깔끔한 membership 종결. 뜻밖에 게이트 통과 시 → 승격 전 게이트 강화(자명규칙+BSS, [[scoopforge-retro-zone]] 미구현분) 필요 항목으로 플래그.

## 비목표 (YAGNI)

- **combination(국면조건부 재가중·게이팅) = v3.** 단 up 기반 `ab`/`addAb` 캐시가 지표별 leave-one-out/add-one 민감도 데이터 → v3를 거의 무런으로 부트스트랩(재사용 명시).
- downweight(감가) 재조합 · overconfident 진단 · R3 사용자 선택 UI = 별도 스펙.
- forge-core 실제 승격 = 채택 후보 실측 후 별도 커밋(v1과 동일, 게이트 강화 선행 필수).

## 리스크 / 완화

- **add도 ~0일 위험(최대·예상)**: 설계된 결과. drop+add 둘 다 null이면 "membership 종결"이라는 확정 결론이 산출물. 채택 0이어도 인프라·종결 진술이 자산.
- **add-노드 no-op 오판**: 위생 검사로 `up` 미변동 지표를 `not-measured`로 분리(특히 mfi/cmf volume 스레딩·오버레이 params).
- **재수집 비용(~3h)**: 1회 백그라운드. up 기반 전환으로 v1 score 캐시는 폐기(v1 drop 숫자는 score 기반이라 up 기반과 직접 비교 불가 — 재측정이 정당).
- **up 기반 base 정확도가 score와 다를 수 있음**: 정상(up이 더 객관적 기준). 새 base 정확도를 종결 진술에 명시.

## 분해 / 순서

| 순서 | 스펙 | 상태 |
|---|---|---|
| **v2(본 문서)** | up 기반 전환 + add-defs + drop·add 통합 파이프라인 + 종결 대장 | 설계 승인 → 구현 계획 |
| v3(후보) | combination(재가중·게이팅) — 이 캐시 부트스트랩 | membership 종결 후 결정 |
| 별도 | R3 사용자 선택 심화 UI · 승격 게이트 강화(자명규칙+BSS) | — |

관련: [[scoopforge-retro-zone]] · [[scoopforge-rel-axis]](상대방향=방향 우회) · [[scoopforge-backtest]] · [[scoopforge-intraday-rejected]](가격재조합=0) · [[scoopforge-open-engine-principle]] · [[scoopforge-scorecard-changelog]]
