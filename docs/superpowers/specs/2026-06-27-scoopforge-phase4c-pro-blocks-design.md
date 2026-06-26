# 스쿱포지 Phase 4-C (R4) — 전문 분석 블록(파동 스캔 + 엘리어트) 설계

- 날짜: 2026-06-27
- 선행: Phase 4-B(R2 대표이미지=우측차트) 배포.
- 상태: 컨셉 합의 완료 → 구현 설계. **R4(전문 블록). R5(포지 분석 재생·비전)는 이후.**

## 1. 목표

블록 팔레트의 분석 도구를 "전문 분석 수준"으로 확장:
- **파동 스캔 승격**: 기존 `phasefold`(chart.html PDM 주기스캔)를 팔레트/UI에서 **"파동 스캔"**으로 리브랜드 + 스캔 결과(최적 주기·신뢰도) 배지 표시. (내부 blockType 불변.)
- **엘리어트 파동 블록**: 스윙 기반 5-3 휴리스틱으로 임펄스/조정 파동 라벨링 + 방향 바이어스 출력.

확정: **폴딩→파동 스캔 승격** · **스윙 기반 5-3 휴리스틱** · **contribution 시계열 + meta + 자동재계산**.

## 2. 코어 — 엘리어트 블록 (`forge-core.js`, node 테스트)

- 신규 `blockType:"elliott"`. `evalBlocks`에 분기 추가. 헬퍼: `detectSwings(arr, sens)`, `elliottAnalyze(arr, sens)`.
- **스윙 탐지(ZigZag식)**: 입력 시계열에서 직전 피벗 대비 `sens`(기본: 시리즈 범위의 일정 비율, 예 3%) 이상 역전하는 지점을 피벗(고/저 교대)으로 수집.
- **라벨링(휴리스틱)**: 최근 피벗 열을 임펄스 5파(1–5)·조정 3파(A–B–C) 순으로 추정 라벨. 최신 레그의 방향(상승/하락)·위치 파악.
- **출력**:
  - `values[id]` = contribution 시계열(−1~1): 각 시점이 속한 레그가 상승 임펄스(1·3·5)면 양(+0.7급), 조정/하락(2·4·A·C)이면 음. combine 연결 시 합성 시그널에 반영.
  - `meta[id]` = `{ waves:[{idx, price, label}], current:{label, dir} }` (R5에서 이미지 위 파동 라벨·노드 배지용).
- 결정적·DOM-free. 빈/짧은 시리즈 graceful(빈 contribution·빈 waves).
- node 테스트: 합성 5파 상승(예: 1↑2↓3↑4↓5↑) → `values` 마지막 > 0, `meta.waves.length ≥ 5`(또는 ≥ 일정), 모든 값 [−1,1]. 짧은 시리즈 → 빈 결과 무에러. 기존 15 테스트 유지.

## 3. UI — 파동 스캔 리브랜드 + 엘리어트 팔레트 + 배지 (`forge.html`)

- **BLOCK_DEFS**: `phasefold` 항목 `label:"위상폴딩"` → `"파동 스캔"`(type 불변). 신규 `{type:"elliott", label:"엘리어트", kind:"block", params:{swing:3}}`.
- **renderParams**: phasefold 행 라벨 "주기 최소/최대" → "스캔 범위 최소/최대"(키 pmin/pmax 불변). elliott 행: `swing`("스윙 민감도(%)", 기본 3).
- **스캔 결과 배지**: `runForge` 후, phasefold/elliott 노드 카드에 결과 표기 — phasefold: `P*≈{best} θ{theta}`, elliott: `{current.label} {dir}`. `lastResult.meta[nodeId]`에서 읽어 노드 DOM에 작은 라벨(`.b-n-scan`) 부착. 함수 `paintScanBadges()`(runForge 끝에서 호출). 노드 재렌더(renderBoard) 시 사라지므로 paint 시점 주의(runForge 후 1회).
- (R5 비활성 차트 오버레이/이미지 표기는 건드리지 않음 — meta만 준비.)

## 4. 검증

- forge-core: 엘리어트 node TDD(합성 5파) + 기존 15 유지 → 총 16.
- forge.html: 헤드리스 — 팔레트에 "파동 스캔"·"엘리어트", 엘리어트 추가→combine 연결 시 시그널 변화, 파동 스캔/엘리어트 노드에 결과 배지, 콘솔 에러 0.
- 라이브 배포(forge.html + forge-core.js). 기존 map 파일·forge 데이터 불가침.

## 5. 비범위

- 이미지 위 파동 라벨 표기, 이미지 기반(비전) 분석, "포지 분석" 재생 = R5. 지금은 데이터(데모) 기반. meta는 R5 표시용 준비만.

## 6. 리스크/주의

- 엘리어트 휴리스틱은 근사 — 정밀 규칙(되돌림 비율 등) 미적용(R5 비전·후속에서 정교화). 결정적이고 형태/방향만 검증.
- 스윙 `sens` 너무 작으면 피벗 과다, 크면 부족 — 기본 3%(범위 대비), 빈 결과 graceful.
- 배지(`paintScanBadges`)는 runForge 후 DOM에 부착 — renderBoard가 노드를 재생성하므로, runForge가 renderBoard 뒤에 오는 순서 또는 paint를 runForge 끝에서 호출해 유지. (renderChart는 노드 DOM 안 건드림.)
- `phasefold` 내부 blockType·키 변경 금지(라벨만). 기존 phasefold 노드/저장 호환.
- forge-core.js DOM-free 유지. 단일 페이지·바닐라·noindex·FORGE_API 상대. map 불가침.

## 7. 확정된 결정

1. 파동 스캔 = phasefold 승격(라벨+배지), 내부 불변.
2. 엘리어트 = 스윙 기반 5-3 휴리스틱(contribution+meta), node TDD.
3. 출력 contribution+meta, 자동스캔=기존 재계산+배지. 이미지 표기는 R5.
