# 추세선·fib 위계 통일 Implementation Plan

> 작도 전용(forge-draw.js) · 엔진 불변. 시각 튜닝 성격이라 **컨트롤러 인라인 구현 + 헤드리스 시각검증**으로 수행(캔버스 작도는 TDD/서브에이전트 전사에 부적합). 최종 품질검토는 서브에이전트.

**Goal:** trend·fib 작도를 S/R·Gann과 같은 강조/디밍 시각 규약으로 통일 + fib 교차-degree 합류 강조 신설.

**Global Constraints:** forge-core.js 미변경(엔진 bias 불변·244/244 유지) · 좌측 컬러 라인 금지 · reveal 게이팅 유지 · 라벨 클러터 방지(강조/합류만) · 캐시버스터 갱신.

---

### Task 1: fib — `_drawFibLayers` 교차 합류 + 스타일 정렬

**File:** `forge-draw.js` (`_drawFibLayers` ≈1871-1949)

- 함수 초입: 전 degree(`fib.degrees`)의 핵심 되돌림(0.382/0.5/0.618) 가격 수집 → 근접(tol≈범위*0.006) 클러스터 → **2개+ degree 겹침 = 합류 가격 집합**(`_confl`).
- 단기 `levelLine`: `L.price`가 `_confl`에 근접하면 `confluent` 승격 → `CW.bold`+alpha0.95+✦+라벨.
- 중/장 섹션: `STY` bespoke 색/굵기 → 공통 규약(중기 `CW.hair`·중간 alpha / 장기 `CW.hair`·낮은 alpha, 골드 계열 유지). 합류면 최강조.
- reveal(retr≥1·ext≥2·zone≥3)·좌표매퍼·`_skFrac` 유지.

**검증:** `node --check forge-draw.js` · `node --test forge-core.test.js`=244/244 · 헤드리스: 단기 강조·중/장 디밍·교차 합류 ✦ 렌더·라벨 클러터 없음.

**Commit:** `feat(forge): fib 교차-degree 합류 강조 + 중/장 스타일 공통 규약 정렬`

---

### Task 2: trend — `_drawTrendLayers` 지배창 강조 + 디밍 정렬

**File:** `forge-draw.js` (`_drawTrendLayers` ≈1728-1809)

- `winLine`에 `emph` 인자 추가: 강조창(`ta.dominant` 키, null이면 R² 최고)=`CW.bold`+라벨, 나머지=`CW.hair`+낮은 alpha(라벨은 `_labelMode==='all'`만).
- weak(R²<0.15) 디밍 alpha를 공통 규약(`max(0.12,0.15+sig*0.4)` 또는 낮은 고정)으로 정렬.
- 채널·피봇 S/R선: fine-dash·낮은 alpha 규약값으로 정렬. 방향색(초록/빨강/중립) 유지.

**검증:** `node --check` · 244/244 · 헤드리스: 지배창 강조·나머지 디밍·채널/피봇 디밍 정렬.

**Commit:** `feat(forge): trend 지배창 강조 + 디밍/채널/피봇 공통 규약 정렬`

---

### Task 3: 최종검토 + 캐시버스터 + 배포

- 서브에이전트 품질검토(forge-draw.js diff, 엔진 미변경·규약 정합·캔버스 위생·accent line 없음).
- `forge.html` `?v=` draw 캐시버스터 갱신(20260716c).
- 4지표(S/R·structure·trend·fib) 시각 일관성 합동 헤드리스 스크린샷.
- 커밋+push+cafe24 배포(forge.html·forge-draw.js). 스코어카드·백로그 1줄.
