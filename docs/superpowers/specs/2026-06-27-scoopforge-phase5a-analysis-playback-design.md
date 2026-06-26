# 스쿱포지 Phase 5-A (R5a) — "포지 분석" 재생 설계

- 날짜: 2026-06-27
- 선행: Phase 4-C(R4 전문 블록) 배포.
- 상태: 컨셉 합의 완료 → 구현 설계. **R5a(재생 연출). R5b(Claude 비전 작업큐)는 다음.**

## 0. 상위 맥락

R5 = R5a(재생 연출) + R5b(비전 실속). 순서 **R5a 먼저**. 비전 흐름(다음 사이클): **버튼→forge-api.php 작업큐→Claude(세션 온디맨드 + 예약 루틴)가 대표 이미지+전략 읽어 분석→결과 POST→페이지 폴링 반영(추출 데이터/파동/바이어스/경로 보정)**. R5a는 **현재 인터프리터 분석**을 연출(비전 붙으면 같은 재생이 진짜 데이터로).

## 1. 목표

▷ **"포지 분석"** 버튼 → 노드를 DAG 순서로 하나씩 누적하며 분석이 펼쳐지는 재생: 현재 노드 하이라이트 + 미래 존 예측이 단계별로 모핑·수렴 + 중요도/확신에 따라 예측이 당겨지는 **백트래킹(누적 가중 시각화)**. 마지막에 최종 예측으로 정착.

확정: **백트래킹 = 누적 가중의 시각화**(별도 재실행 루프 아님).

## 2. 코어 — `runSteps` (`forge-core.js`, node 테스트)

- `runSteps(graph, data, opts)` → 단계 배열. 각 단계 = **DAG 블록 순서로 1..k 블록 + 모든 자유 노드**를 포함한 부분 그래프로 `run()` 한 결과:
  - `[{ nodeId, signal, prediction, verdict }]` (nodeId = 그 단계에 합류한 k번째 블록 id).
  - 부분 그래프 `sub = { nodes: (blocks[0..k] ∪ free nodes), edges: 그들 사이 엣지 }`.
  - 자유 노드(메모) conviction은 전 단계 적용(맥락), 블록은 누적 → 예측이 노드 추가에 따라 수렴.
  - 마지막 단계 prediction/signal === 전체 `run(graph,data,opts)` 결과(불변식).
- 결정적·DOM-free. 블록 0개면 단계 1개(빈/price fallback)로 graceful.
- node 테스트: price→phasefold→combine→predict(블록 4) → `steps.length === 4`, 각 step `prediction.path.length === futW`·`signal.length === data.n`, 마지막 step `prediction.path` === `run(full).prediction.path`(deepStrictEqual). 기존 18 유지 → 총 19+.

## 3. 클라이언트 재생 (`forge.html`)

- 헤더에 **▷ 포지 분석** 버튼(기존 ▷ 실행 옆). 
- `playAnalysis()`:
  1. `runForge()`로 최신 보장 → `steps = ForgeCore.runSteps(boardToGraph(), data, {futW:120})`.
  2. 재생 잠금(`_playing=true`, 편집/중복 재생 가드). 진행 표시(상단 "분석 중: {노드 제목} (k/N)").
  3. 단계별(타임드, 예 ~450ms): 
     - 현재 노드 강조 — 노드 엘리먼트에 `.analyzing` 클래스(골드 글로우 펄스), 이전 노드 해제.
     - 미래 존 예측 **모핑** — 이전 step→현재 step의 `prediction.path/lo/hi`를 보간(rAF, ~350ms)해 `fcDrawFuture`로 그림(수렴 연출). verdict 배지도 갱신.
     - 큰 시프트(예측 평균 변화 큼) 시 "재검토" 플래시(미래 존/노드).
  4. 마지막 step → 최종 예측 정착 + `renderChart`로 정상 렌더 복귀 + 토스트 "포지 분석 완료".
  - reduced-motion: 애니메이션 생략, 즉시 최종(`renderChart`)만.
  - 중단: 재생 중 다른 버튼/편집 시 안전 종료(타이머 정리, `_playing=false`).

## 4. 데이터/계약

- `ForgeCore.runSteps(graph,data,opts)` 추가(반환 위 §2). `run`/`prediction` 형태 재사용. 서버/문서 모델 불변. 데이터는 현재 데모(R5b 비전 전).

## 5. 검증

- 코어 node TDD(단계 수·각 형태·마지막=전체).
- 재생: 헤드리스 가상시간으로 중간 프레임 캡처(노드 `.analyzing` 강조 + 미래 존 모핑) + 완료 후 최종 렌더. 콘솔 에러 0.
- 라이브 배포(forge.html + forge-core.js). 기존 map 파일·forge 데이터 불가침.

## 6. 비범위

- R5b: 대표 이미지를 실제로 읽는 비전, 이미지 위 정밀 보조선, 작업큐/폴링. 노드별 보조선을 **이미지 위에** 정밀 정렬하는 것도 R5b(현재는 미래 존 예측 모핑 + 노드 강조 중심). 실데이터 없음.

## 7. 리스크/주의

- `runSteps`가 매 단계 `run()` 호출 → O(노드수×run). 노드 수십개 수준이라 허용. 재생 시 1회 계산 후 애니메이션(매 프레임 재계산 금지).
- 부분 그래프에 predict 미포함 단계 → run의 sigSrc fallback(combine/price)로 정상 동작 확인.
- 보간 모핑: 이전/현재 path 길이 동일(futW 고정)이라 인덱스별 보간 가능.
- 재생 중 편집/리렌더가 노드 `.analyzing` 클래스를 날릴 수 있음 → 재생 중 renderBoard 억제 또는 매 단계 클래스 재부여.
- reduced-motion·visibility·중단 가드. 단일 페이지·바닐라·noindex·FORGE_API 상대. map 불가침.

## 8. 확정된 결정

1. 재생 = `runSteps`(부분 그래프 누적) 시퀀스의 타임드 애니메이션.
2. 백트래킹 = 누적 가중 시각화(예측이 가중 큰 노드 합류 시 당겨짐), 별도 루프 아님.
3. 노드 강조 + 미래 존 예측 모핑 중심. 이미지 위 정밀 보조선·비전은 R5b.
