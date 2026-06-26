# 스쿱포지 (Scoop Forge) Phase 2 — 설계 문서

- 날짜: 2026-06-26
- 선행: [Phase 1.5](2026-06-26-scoopforge-phase15-design.md) 완성·배포(파라미터 편집기·확신 바이어스·주제 배너·썸네일 라이브러리)
- 상태: 컨셉 합의 완료 → 구현 설계

## 1. 목표

두 갈래:
- **A. 중요도 가중치(weight)** — 각 노드가 "얼마나 중요한가"를 사용자가 지정. 계산(합성 기여도)과 시각(크기·글로우·펄스·배지)에 동시 반영. 기존 `conviction`(방향)과 **별도 2축**.
- **B. 신규 기술 블록** — 추세선·RSI·피보나치(현재 가격 데이터로 실제 계산) + 거래량(참고 블록, 이미지+서술+확신/중요도로 기여).

기존 `map/map.html`·`map/chart.html` 불가침. 바닐라 JS, 다크 골드 테마, 단일 페이지(+`forge-core.js`). 메모리+JSON 내보내기(서버 저장 범위 밖).

## 2. A — 중요도 가중치 weight

### 2.1 데이터 모델
- 노드에 `weight:number`(0~100, 기본 **50**). conviction(−100~+100, 방향)과 독립.
- `boardToGraph()`가 `weight`를 포함(인터프리터가 읽음). 미지정 시 50으로 정규화.

### 2.2 계산 (forge-core.js, node 테스트)
- **확신 바이어스 가중**: 기존 `aggregateConviction(graph)`를 **가중 평균**으로 — `bias = Σ(conviction_i · w_i) / Σ(w_i)` (w_i = 노드 weight, w 합 0이면 0). 중요한 노드의 확신이 우세. conviction 전부 0이면 기존과 동일(바이어스 0).
- **합성 기여도 스케일**: `combine` 집계 시 각 입력의 유효가중 = `(수동 weights[srcId] ?? 1) · (sourceNode.weight/50)`. 중요한 소스 블록이 합성 시그널을 더 지배. 모든 노드 weight=50이면 기존 동작과 동일(스케일 1).
- **하위호환**: weight 미지정→50, 모든 weight 동일+conviction 0이면 Phase 1.5와 결과 동일.

### 2.3 시각 (forge.html)
- **노드 크기**: weight→스케일 0.8x(0)~1.0x(50)~1.4x(100). `nodeHTML`이 카드에 `transform:scale()` 또는 폭/패딩 스케일 적용. measure()가 실제 크기 반영(엣지/오버레이 좌표 정합 유지).
- **글로우/링**: 중요할수록 골드 후광·테두리 발광 강도 ↑(기존 노드 글로우를 weight에 연동).
- **엣지 펄스**: 오버레이 펄스 밝기/속도가 출발 노드 weight에 비례(기존 `_edgePhase`/펄스 강도에 weight 계수).
- **중요도 배지**: 노드에 작은 weight 표시(숫자 또는 점 크기). 과하지 않게.

## 3. B — 신규 기술 블록

### 3.1 계산 블록 (forge-core.js, evalBlocks 확장, node 테스트)
입력: 상류 시계열 또는 `data.price`. 출력: `values[id]` 시계열(합성에 combine로 연결 시 반영).
- **추세선 `trend`**: window 구간 선형회귀 기울기를 정규화한 시계열(−1~1 근방). param `len`(기본 40). 차트 오버레이: 회귀선.
- **RSI `rsi`**: Wilder RSI(period)를 `(rsi−50)/50`로 중심화한 시계열. param `period`(기본 14).
- **피보나치 `fib`**: window 구간 고/저로 되돌림 레벨(0/0.236/0.382/0.5/0.618/1) 산출, 각 시점 가격의 구간 내 위치를 −1~1로 매핑한 시계열. param `len`(기본 120). 차트 오버레이: fib 수평선.
- 셋 다 결정적·DOM-free. node 테스트: 알려진 입력에 대해 형태/방향 검증(예: 단조 상승 가격→trend 기울기 양수, RSI>50; fib 위치 단조).

### 3.2 참고 블록 (계산 없음)
- **거래량 `volume`**: evalBlocks에서 계산 시리즈 미생성(합성 신호 미참여). conviction×weight로만 기여(§2.2). 노드에 붙여넣은 거래량 이미지/서술 표시(Phase 1.5 thumb/note 재사용). 실데이터 불필요.

### 3.3 팔레트/모델
- `BLOCK_DEFS`에 trend/rsi/fib/volume 추가(한국어 라벨: 추세선/RSI/피보나치/거래량, 기본 params 포함).
- 파라미터 편집기(Phase 1.5 `renderParams`)가 신규 블록의 수치 param(len/period) 행을 렌더.

### 3.4 차트 오버레이(가능 범위)
- 추세선(회귀선)·피보나치(수평 레벨선)를 `#fcMain` 가격 차트 위에 그림(기존 chart 좌표 매핑 `fcMap`/`toX/toY` 재사용). RSI는 시그널 합성에만 반영(별도 패널 없음 — YAGNI). 오버레이가 부담되면 trend/fib 라인은 차트 작업 태스크에서 처리.

## 4. 영속/내보내기
- `weight`를 boardToGraph·exportStrategy에 포함(기존 conviction/note/thumb 옆). 신규 블록 타입은 nodes에 그대로 직렬화.

## 5. 비범위
- 거래량 실데이터/합성 데이터 생성(참고 블록으로 대체). import 복원 UI(여전히 export-only). 조건/분기 블록. 실데이터 연동(유료 훅, 추후).

## 6. 리스크/주의
- **크기 스케일 ↔ 좌표 정합**: 노드 크기를 weight로 바꾸면 `measure()`가 실제 DOM 크기를 읽어 엣지/포트/오버레이 좌표가 따라가야 함. `transform:scale`은 레이아웃 크기를 안 바꿔 measure가 못 읽으므로, **실제 폭/높이(패딩·폰트) 스케일** 방식 권장(또는 scale 사용 시 measure가 getBoundingClientRect 보정).
- **combine 이중 가중**: 수동 per-edge weight(Phase 1.5)와 노드 importance weight를 곱으로 합성 — 의미 명확히(유효가중=수동×중요도/50). 문서화.
- **node 테스트 하위호환**: 기존 9개 테스트 유지. weight=50 균일 시 기존 결과 불변 보장.
- **네임스페이스**: 신규 전역은 기존 규칙(board `b*`/chart `fc*`/overlay `_*`/`lib*`/`theme*`) 충돌 금지. weight 관련은 노드 필드/기존 함수 확장으로.
- noindex 유지.

## 7. 테스트
- forge-core: 가중 conviction·combine 가중 스케일·trend/rsi/fib 시계열 — node 테스트(결정적). weight 균일+conviction0 → 기존 불변 회귀 가드.
- forge.html: 파라미터 패널 weight 슬라이더 write-through, 노드 크기/글로우 스케일, 신규 블록 추가·연결, 차트 오버레이 — 헤드리스 시각/기능 검증(컨트롤러).

## 8. 확정된 결정
1. weight = 중요도(0~100,기본50) + conviction = 방향, **2축 분리**.
2. weight가 **합성 기여도 스케일**(combine 유효가중 = 수동×중요도/50) + 확신 바이어스 가중 평균.
3. 시각: **노드 크기 + 글로우/후광 + 엣지 펄스 강도/속도 + 중요도 배지** 전부.
4. 신규 블록: 추세선·RSI·피보나치(계산) + 거래량(참고). 거래량은 합성 데이터 만들지 않음.
