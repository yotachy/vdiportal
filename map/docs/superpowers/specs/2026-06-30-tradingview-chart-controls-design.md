# 트레이딩뷰식 차트 조작 (가격축 수동 스케일 · A/L 축 버튼 · 예측 이음새 줌) — 설계

- 작성일: 2026-06-30
- 대상: 스쿱포지(Scoop Forge) — `forge.html` (코어 `forge-core.js` 무변경)
- 선행: 차트 데이터-윈도 내비게이션(`_chartWin` 휠 시간줌·드래그 스크롤·보이는구간 오토스케일·log 토글) 배포됨.
- 상태: 설계 승인됨 (구현 계획 대기)
- 범위: 사용자 요청 3건 중 **(1) 트레이딩뷰식 조작 + A/L 축 버튼**, **(2) 예측 이음새 줌**. **(3) 엘리어트 전체차트 큰 파동은 별도 sub-project**(forge-core 분석).

## 1. 배경 / 문제

데이터-윈도 차트가 들어갔으나 조작이 TradingView와 달라 불편:
1. **y축이 매 네비게이션마다 자동 재적합**돼 "튀는" 느낌. 끄거나 수동 조절할 수단이 없음.
2. **A(오토스케일)·L(로그) 명시 버튼이 세로축 아래에 없음**(로그는 헤더에만, 오토는 토글 자체 없음).
3. **예측 이음새 줌 불가**: `histW = plotW × (hist수/(hist수+예측수))`라 시간축을 줌인하면 history 봉 수↓·예측 봉 수(futW) 고정 → **예측 영역이 비대해져** 실제↔예측 경계를 자세히 못 봄.

## 2. 목표

TradingView식 조작을 이식: **가격축(y) 수동 스케일 + 오토 토글**, **세로축 아래 A/L 버튼**, **예측 이음새가 안정적으로 보이는 레이아웃**. 코어/예측 로직 무변경(표현 계층만).

## 3. 가격축 스케일 (`_yScale`)

- 전역 `_yScale = { mode: "auto" | "manual", lo: null, hi: null }` (세션 메모리, 영속 안 함).
- **auto**(기본): `fcDrawMainChart`가 보이는 캔들 고저(+atLatest면 예측 밴드) 기준 y범위 계산(현재 동작).
- **manual**: 고정 `[lo, hi]` 사용 — **윈도(`_chartWin`)가 바뀌어도 재계산 안 함** → y가 안 튐. 가격 디테일 고정 관찰.
- 새 데이터(`applyTickerOHLC`·loadDoc 재fetch)·⊕ 전체 리셋 시 `resetYScale()`로 auto 복귀.

### 3.1 fcDrawMainChart y범위 분기
- 현재 auto 계산(보이는 캔들 h/l + atLatest 예측밴드 + pad)을 유지하되, 마지막에:
  - `_yScale.mode==="manual" && 유효 lo/hi` → `loV=_yScale.lo; hiV=_yScale.hi` (auto 계산 무시).
  - 아니면 auto 결과 사용.
- `_mainGeo`에 `plotRight = padX + plotW`(=y축 스트립 경계), `loV`/`hiV`(현재 표시 범위) 포함 → 드래그가 현재 범위를 seed로 사용.

## 4. 가격축 수동 드래그 + 더블클릭 자동복귀

- 포인터다운 영역 분기(`#fcMainChart`): `cx > g.plotRight`(우측 `axisW=46`px y축 스트립) → **가격축 수동 스케일 드래그**. 그 외 → 기존 시간 스크롤.
- **수동 스케일 드래그**: 드래그 시작 시 현재 `[g.loV, g.hiV]` seed. 이동 `dy = clientY-startY` → 배율 `f = exp(dy/150)`(아래로=확대·위로=축소). 중심 `c=(lo+hi)/2`, 반폭 `h=(hi-lo)/2 × f` → `_yScale = {mode:"manual", lo:c-h, hi:c+h}`; `renderHeroZoom()`. (양수 가격이면 음수 방지 가드.)
- **y축 더블클릭** → `resetYScale()`(auto) + 재렌더.
- 시간 스크롤 드래그(플롯 영역)는 현재 그대로. 휠 시간 줌은 커서가 y축 스트립이어도 시간 줌 유지(또는 무시) — 단순화: 휠은 항상 시간 줌.

## 5. A / L 버튼 (세로축 아래)

- 차트 **우하단(세로축 끝)**에 작은 버튼 2개(절대 위치, hero 위 오버레이): **`A`**(오토스케일)·**`L`**(로그/선형). 다크 토큰·`.on` 하이라이트(현재 상태).
  - `A` 클릭 → `_yScale.mode="auto"` + 재렌더. auto일 때 `.on`.
  - `L` 클릭 → 기존 `toggleLogChart()`(로그/선형). log일 때 `.on`.
- **헤더 `📊 LOG` 버튼 제거** → L로 통합. `updateLogBtn()`/`toggleLogChart()`가 새 L 버튼을 갱신.
- 배치: y축 라벨 영역 하단(`right` ≈ axisW 폭 안, `bottom` 작은 여백). 두 버튼 가로/세로 작게.

## 6. 예측 이음새 줌 수정

- `fcDrawMainChart`의 `histW = plotW × (hist.length/total)` → **`histW = plotW × Math.max(0.78, hist.length/total)`**. history가 항상 **≥78%** 차지 → 예측 영역 ≤22%로 캡. 시간축 줌인해도 실제↔예측 **이음새가 안정 위치**에 남아 자세히 볼 수 있음.
- 수동 y 스케일(§4)과 결합: 예측 콘이 넓어 auto에서 실제가가 납작해도, y축 드래그로 실제 가격 범위에 고정해 이음새를 디테일하게 관찰.
- `seamX`/`toXf`/`toXh`는 갱신된 `histW` 기준 그대로(파생).

## 7. 영향 / 호환 / 비목표

- 코어 무변경(83/0). log 토글·`_chartWin` 내비·근거 작도·크로스헤어 호버는 그 위에서 동작.
- `_yScale.mode==="auto"`·헤더 버튼 제거 외 시각 회귀 0(auto가 현재 동작과 동일, 단 histW 캡으로 예측 영역만 좁아짐 — 의도된 개선).
- 비목표(YAGNI): x축 드래그 시간줌·관성 스크롤·터치 핀치·드로잉 도구·가격축 단위 핸들. **엘리어트 전체차트는 별도 spec**.
- 단일 HTML·바닐라 JS·무빌드·다크 토큰·한국어·noindex 유지.

## 8. 검증

- forge.html 인라인 파싱·코어 83/0. 헤드리스/라이브: (a) y축 드래그로 가격축 확대/축소·`A`로 자동 복귀, (b) auto OFF면 좌우 네비에 y 안 튐, (c) `A`/`L` 버튼이 세로축 아래·헤더 LOG 제거·상태 하이라이트, (d) 줌인 시 예측 영역 ≤22%·이음새 디테일 관찰 가능, (e) ⊕/새 데이터로 auto 복귀, (f) log 토글·호버 정상.
