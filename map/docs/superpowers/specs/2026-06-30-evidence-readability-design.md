# 근거 작도 가독성 (Evidence Readability) — 설계

- 작성일: 2026-06-30
- 대상: 스쿱포지(Scoop Forge) — `forge.html` (코어 `forge-core.js` 무변경)
- 선행: 도구 심화 로드맵 6지표 완료(추세선·MA·피보·엘리어트·RSI·거래량) — 각 지표가 hero 차트에 근거를 작도함.
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 배경 / 문제

분석 결과 hero(우측 분석 차트)에 6개 지표의 근거 작도(추세선·MA·피보 레벨·엘리어트 파동라벨·RSI/거래량 다이버전스·요약 배지)가 **한 차트에 동시에 겹쳐** 그려진다. 특히 우상단 요약 배지들이 같은 y(≈14/28)에 몰려 겹치고, 인라인 라벨이 작아(10px) **무엇이 그려졌는지 식별이 어렵다**. 현재 hero에는 줌/팬이 없고(호버 툴팁만), 캔버스 DPR은 `fcFit`에서 2로 캡되어 라벨이 흐릿하게 느껴진다.

목표: (1) **차트 줌/팬**으로 붐비는 구간을 확대해 보고, (2) **지표 포커스**(클릭)로 한 지표만 디테일하게 보고, (3) **해상도·라벨**을 키워 가독성을 끌어올린다. 전부 표현 계층(`forge.html`)만 손대고 코어/예측 로직은 불변.

## 2. 현황 구조 (참조)

- `#fcMainChart`(가격 라인+예측 콘) ← `fcDrawMainChart(series, pred)`가 `fcFitKeep`로 그리고 기하를 `cv._mainGeo`에 stash.
- `#fcEvidence`(오버레이) ← `_drawEvidence()`가 `main._mainGeo` 기하로 각 지표 `_drawXLayers` 호출 + `_evLegend(c, x, y, legend)`로 범례 칩 + `_evLabel(c, text, x, y, color, align)`로 라벨.
- `fcFit(cv, h)`/`fcFitKeep(cv, h)` — DPR 캡 `Math.min(devicePixelRatio||1, 2)`, `setTransform(dpr,0,0,dpr,0,0)` 후 CSS px 공간 드로잉.
- 호버 툴팁: `#fcMainChart` 위 pointermove → `_mainGeo`로 가격/시점 표시(`#fcMainTip`/`#fcMainVline`).
- 라이트박스 `zoom(id)`는 별개(전체화면 뷰어, 자체 pan/zoom). **이번 작업과 무관·불변.**

## 3. 아키텍처

표현 계층에 3개의 독립 단위를 추가/수정한다. 모두 hero 두 캔버스(`#fcMainChart`, `#fcEvidence`)에만 영향.

```
_heroView{s,tx,ty} ──→ fcDrawMainChart (가격선·콘)  ┐ 동일 변환 적용 → 정합 스케일·팬
                  └──→ _drawEvidence    (근거 작도)  ┘
_focusInd(blockType|null) ──→ _drawEvidence (해당 지표만 진하게, 라벨 확대)
해상도/라벨 ──→ hero 전용 DPR 캡 3 + _evLabel 폰트 확대 + 요약배지 고정 슬롯 스택
```

## 4. hero 인플레이스 줌/팬 (`_heroView`)

### 4.1 상태
- 전역 `_heroView = { s: 1, tx: 0, ty: 0 }` — s = 배율(1~6), tx/ty = CSS px 평행이동(로직좌표 변환 전 단계).
- 같은 분석 데이터 동안 유지(재생/재렌더에도 동일 뷰). **포지 전환·새 분석 등 데이터 변경 시 `resetHeroView()`로 초기화**(`{1,0,0}`).

### 4.2 변환 적용 (핵심 — 두 캔버스 동일)
- 순서가 중요하다. `fcDrawMainChart`와 `_drawEvidence` **둘 다** 다음 순서로 한다:
  1. `fcFit`/`fcFitKeep` 호출 (= `setTransform(dpr,0,0,dpr,0,0)`).
  2. **`clearRect(0,0,cw,ch)`로 전체 캔버스를 먼저 지운다** (변환 전 = 팬/줌과 무관하게 항상 전체가 지워짐).
  3. `c.save();` 후 `c.translate(_heroView.tx, _heroView.ty); c.scale(_heroView.s, _heroView.s);` 적용.
  4. 이후 모든 드로잉은 기존 좌표 그대로(로직 CSS px) 수행.
  5. 함수 끝에서 `c.restore();`.
- → 가격선·콘·근거선·라벨이 **함께** 스케일·팬되어 정합 유지(래스터 확대가 아니라 재렌더라 선명), clearRect는 항상 전체를 지워 잔상 없음. 라벨 폰트도 줌에 비례 확대(가독 목적과 합치).
- `_heroView`가 항등(s=1,tx=0,ty=0)이면 `translate(0,0);scale(1,1)`이라 시각적으로 기존과 동일.

### 4.3 인터랙션
- **휠 = 커서 기준 줌**: hero 위 `wheel`에서 `e.preventDefault()`, `factor = e.deltaY<0 ? 1.15 : 1/1.15`, `ns = clamp(1, 6, s*factor)`. 커서 아래 지점이 고정되도록 `tx = cx - (cx - tx) * (ns/s)`, `ty = cy - (cy - ty) * (ns/s)` (cx,cy = 캔버스 로컬 CSS px 커서). `s=ns` 후 `clampPan()` → `renderHeroZoom()`(메인+evidence 재드로). s가 1로 돌아오면 tx/ty도 0으로 스냅.
- **드래그 = 팬**: hero `pointerdown`→`pointermove`. 이동 누적 `|dx|+|dy| > 6`px부터 팬 시작(그 미만 클릭은 포커스/툴팁 우선). `tx += dx; ty += dy; clampPan(); renderHeroZoom()`. `pointerup`/`cancel`로 종료.
- **clampPan()**: 확대된 컨텐츠가 뷰에서 완전히 벗어나지 않게 tx/ty를 제한(최소 노출 폭/높이 = 캔버스의 ~25% 유지). s=1이면 tx=ty=0.
- **리셋**: hero 더블클릭 또는 차트 우상단 `⊕` 리셋 버튼 → `resetHeroView()` + 재드로. s=1일 때 버튼은 흐리게/비활성 표시 가능.
- **핸들러 부착 캔버스**: hero 최상단 `#fcEvidence`(오버레이). 단, `#fcEvidence`가 `pointer-events:none`이면 `pointer-events:auto`로 바꾸되 호버 툴팁이 깨지지 않도록 4.4 처리.

### 4.4 호버 툴팁 정합
- 기존 호버 툴팁은 `_mainGeo`(변환 전 좌표)로 가격/시점을 찾는다. 줌/팬 적용 후 포인터의 캔버스좌표를 **역변환** `worldX = (px - tx)/s`, `worldY = (py - ty)/s`로 환산해 `_mainGeo` 조회 → 줌 중에도 정확. 드래그(팬) 중에는 툴팁 숨김.

### 4.5 렌더 진입점
- `renderHeroZoom()` = 현재 데이터로 `fcDrawMainChart` + `drawEvidence` 재호출(둘 다 `_heroView` 반영). 휠/팬/리셋이 이걸 호출. 재생 중 evidence 재드로(`drawEvidence`)도 `_heroView`를 그대로 반영하므로 줌 유지.

## 5. 지표 포커스 (`_focusInd`)

### 5.1 상태
- 전역 `_focusInd = blockType | null`(예: `"trend"`, `"rsi"`, `null`=전체).

### 5.2 진입/해제
- **범례 칩 클릭**: `_evLegend`가 칩을 그릴 때 각 칩의 히트영역 `{x,y,w,h,key}`를 `_legendHits[]`에 저장. hero 클릭(드래그 아님·임계 미만)에서 `_legendHits`와 충돌 판정 → 해당 `key`로 `_focusInd` 설정(같은 칩 재클릭 시 해제). 범례 맨 앞에 `전체` 칩 추가 → 클릭 시 `_focusInd=null`.
- **노드 선택 연동**: 좌측 보드에서 **지표 블록 단일 선택**(sel 길이 1, blockType이 6지표 중 하나) 시 `_focusInd`를 그 blockType으로 설정. 선택 해제(빈 곳 클릭) 시 `_focusInd=null`. (보드 선택 로직에 1줄 훅: 선택 변화 후 `syncFocusFromSel()` 호출 → 변경 시 `drawEvidence`.)
- **Esc**: `_focusInd` 있으면 해제(기존 Esc 처리에 분기 추가).

### 5.3 작도 영향 (`_drawEvidence`)
- `_focusInd === null`: 기존대로 전체 작도(단, §6 요약배지 슬롯·라벨 폰트 개선 적용).
- `_focusInd === X`: **X 지표 작도만** 진하게 그리고 나머지 지표 작도는 **생략**(또는 매우 흐리게 — 단순화 위해 생략 권장). X의 라벨은 한 단계 더 확대(가독). 범례는 `전체`+X만 강조.
- 포커스는 줌과 독립 — 포커스로 겹침 제거 후 줌으로 확대 가능.

## 6. 해상도 · 라벨 가독성

### 6.1 해상도(hero 한정)
- hero 두 캔버스만 DPR 캡 3으로 상향. `fcFit`/`fcFitKeep`는 공용이라 전역 변경하지 않고, **hero용 옵션**을 추가: `fcFit(cv, h, capOverride)` / `fcFitKeep(cv, h, capOverride)`에 선택 인자 `cap`(기본 2)을 받아 `Math.min(devicePixelRatio||1, cap)`. 메인차트·evidence 호출만 `cap=3` 전달(다른 서브패널은 인자 없이 2 유지). evidence 자체 fit(현재 `_drawEvidence` 내부에서 캔버스 크기 맞추는 부분)도 cap=3.

### 6.2 라벨 폰트
- `_evLabel` 기본 폰트 10px→**12px**(약간 진하게: `font-weight 600` 상당 — 캔버스는 `c.font="600 12px ..."`). pill 패딩도 폰트에 맞춰 소폭 확대. 색·경계클램프(기존 `_evW`/`_evH`) 로직 유지.

### 6.3 요약 배지 고정 슬롯 스택
- 현재 각 지표 요약 배지(우상단 "RSI 62 · 과열" / "임펄스 5파 유효" / "거래량 급증·상승확인" 등)가 같은 y에 겹친다. **우상단에 지표 고정 순서대로 한 줄씩 세로 스택**: 순서 `["ma","trend","fib","elliott","rsi","volume"]`, 슬롯 높이 ≈ 18px(폰트12 기준), 시작 y = `g.padTop + 2`, 활성 지표만 자기 슬롯 행에 그림(빈 슬롯은 건너뛰어 위로 당김). 인라인(작도 선 위) 라벨은 기존 위치 유지 — 줌/포커스로 식별. (동적 충돌 솔버 대신 결정적 슬롯 배치.)

## 7. 영향 / 호환 / 비목표

- **코어(`forge-core.js`) 무변경** — 전부 표현 계층. node 테스트 영향 없음(83/83 유지).
- 기존 라이트박스 `zoom()`·서브패널(RSI 오실레이터·거래량 막대·주기)·보드 캔버스·자동저장 불변.
- `_heroView` 항등·`_focusInd=null`·요약배지 슬롯은 **분석 미실행/지표 없음 시 기존과 시각 동일**.
- y축 가격 라벨도 변환과 함께 이동(고정 처리는 비목표 — 추후). 줌 상태 영속 저장 없음(세션 내 유지, 데이터 변경 시 리셋).
- 비목표(YAGNI): 지표별 줌 독립·미니맵·라벨 동적 충돌 솔버·라이트박스 통합·모바일 핀치줌(휠/드래그만; 추후 핀치 추가 가능).

## 8. 검증

- forge.html 인라인 스크립트 파싱(`new Function`)·`node --test forge-core.test.js` 83/83 회귀 없음.
- 수동/헤드리스: (a) 휠 줌 시 가격선·근거선·라벨이 **함께** 확대·정합(어긋남 없음), (b) 드래그 팬 후 리셋 복귀, (c) 범례 칩/노드 선택 → 해당 지표만 표시, Esc/전체로 해제, (d) 요약 배지 세로 스택 비겹침, (e) DPR3에서 라벨 선명, (f) 줌 중 호버 툴팁 좌표 정확, (g) 재생 중 줌 유지.
- 단일 HTML·바닐라 JS·무빌드·다크 토큰·한국어·noindex 유지.
