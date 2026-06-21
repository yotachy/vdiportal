# 대시보드 슬림 재구성 + 히어로 드릴다운 설계 문서

- 작성일: 2026-06-22
- 대상 파일: `signal/scoopsignal.html` (단일 정적 HTML 유지)
- 성격: 대시보드 레이아웃·인터랙션 재구성 + 신규 데이터(도미넌스). 점수 산식·뷰 라우터 골격 불변.

## 1. 배경 / 문제

대시보드에 박스(카드)가 너무 많고, 히어로 3종(시그널·레이더·사이클)이 PC·모바일 모두 너무 크다. 또 티커의 `BTC/USD`는 ETH 대시보드에서 어색하다. 정리 방향:

- 티커를 ETH 중심으로(`BTC/USD` 제거, ETH 도미넌스 추가).
- 히어로 3종을 작게, 각각 **클릭 시 전용 상세 뷰로 드릴다운**.
- 항상 보이던 **축별 상세 4카드**는 레이더 상세에서만 보이게.
- 항상 보이는 박스 수를 줄여 디자인 정돈.

## 2. 목표

- **티커**: `ETH/USD · ETH/BTC · ETH 도미넌스(ETH/TOTAL)` 슬림 스트립. 도미넌스는 CoinGecko 글로벌 API, 실패 시 해당 칸만 비활성(그레이스풀).
- **대시보드 히어로(작게)**: 시그널 게이지 메인(축소) + `ETH 레이더`·`ETH 사이클` 컴팩트 클릭 타일 2개. 4카드는 제거→레이더 상세로 이동.
- **드릴다운 상세 뷰 3개**(`signal`·`radar`·`clock`): 사이드바엔 노출 안 함, 히어로 클릭으로만 진입, 상단 `‹ 대시보드` 백링크.
- **박스 감소**: 항상 보이는 박스 ~7 → 3~4개.
- 점수 산식·데이터 로더(추가 외)·뷰 라우터 골격 불변.

## 3. 비목표 (YAGNI)

- 새 점수 로직/가중치 변경. 결제/게이팅. 상세 뷰의 사이드바 노출.
- 시그널 상세에 게이지 중복 렌더(게이지는 대시보드에만).

## 4. 컴포넌트 설계

### 4.1 티커 (슬림 + 도미넌스)

- 현재 3칸(ETH/USD·BTC/USD·ETH/BTC) → `ETH/USD · ETH/BTC · ETH 도미넌스`.
- `loadCoinGecko()` 신규: `https://api.coingecko.com/api/v3/global` → `data.market_cap_percentage.eth`(%) 저장. 24h 변화는 미제공이므로 도미넌스 칸은 값+간단 라벨만(등락 화살표 생략 또는 전일 대비 미표시).
- `S.dom = {eth: <pct>}` 저장. 실패 시 `S.dom=null` → 해당 칸 "연결 필요"/대시(—) 표시.
- 티커 시각: 기존 `.ticker`(3칸 그리드) 유지하되 패딩·보더를 가볍게(박스감 ↓). data-f 키: `ethUsd/ethChg`, `ethBtc/ethBtcChg`(유지), 새 `domVal`(도미넌스, 등락칸 없음).
- `loadBinance`에서 BTC 티커 호출은 유지(가격 데이터·사이클엔 불필요하나 현재 코드가 btc 받음 → btcUsd 표시만 제거, 변수는 정리). recompute/score 영향 없음.

### 4.2 대시보드 히어로 (작게 + 클릭)

- **시그널 패널**(`.pane`, 축소): 게이지(`.gauge-wrap` 약 230→180px) + 판정(짧게). `role="button"`/`tabindex="0"`, 클릭·Enter → `showView('signal')`. 호버 시 커서 pointer + 살짝 강조.
- **컴팩트 타일 2개**(`.hero-tile`, 가로 2열):
  - `ETH 레이더` 타일: 4축 점수 미니 요약(유동성/모멘텀/펀더멘털/밸류 4개 작은 막대 또는 숫자) + `›`. 클릭 → `showView('radar')`.
  - `ETH 사이클` 타일: 현재 사분면 라벨(상승/축적/분배/하락) + `›`. 클릭 → `showView('clock')`.
- **축별 상세 4카드 제거**: 대시보드에서 빼고 레이더 상세 뷰로 이동(아래 4.3).
- 튜닝(`details.tune`)·산식(`details.method`) 아코디언은 대시보드에 유지.

### 4.3 드릴다운 상세 뷰 3개

각각 `<section class="view" data-view="{key}">`. 사이드바 `.snav-item` 없음(라우터 직접 호출). 상단에 `‹ 대시보드` 백링크(`<button class="backlink" onclick="showView('dashboard')">`).

- **`signal` — 시그널 상세**: 종합 산식(`크립토시그널 = 0.30·유동성 + …`) + 현재 가중치(normW) + 4축 점수와 기여도(각 축 점수×가중치) + 판정 구간(0–27…72–100) 설명. 게이지 미렌더(대시보드에 있음). 표/리스트로 표현.
- **`radar` — 레이더 상세**: 큰 레이더 SVG(`#radarG` 이전) + **축별 상세 4카드**(기존 `#cMom/#cLiq/#cFun/#cVal` 마크업 이동, 원자료·분위막대 그대로).
- **`clock` — 사이클 상세**: 큰 사분면 시계 SVG(`#quadG` 이전) + 사분면 범례(상승/축적/분배/하락) + 한 줄 해석.

### 4.4 렌더링 구조 (SVG는 숨김 렌더 안전)

- 게이지(`buildGauge`/`renderGauge`): 대시보드 시그널 패널에 유지.
- 레이더(`renderRadar` → `#radarG`)·사분면(`renderQuad` → `#quadG`): 상세 뷰로 SVG 위치 이전. SVG는 캔버스와 달리 `display:none` 상태에서도 렌더 가능 → `recompute()`에서 항상 그려도 됨(뷰 활성화 불필요).
- 4카드(`scoreFun` 등 `setF`로 채움): 레이더 상세 뷰 내부에 위치. `recompute()`가 채움(현재 로직 유지, 위치만 이동).
- 대시보드 타일 요약: `recompute()` 끝에서 4축 점수 미니바(레이더 타일)·현재 사분면 라벨(사이클 타일) 갱신하는 헬퍼 `updateHeroTiles()` 추가.
- `signal` 상세의 산식·기여도: `recompute()`에서 `updateSignalDetail()` 헬퍼로 갱신.

### 4.5 뷰 라우터/네비

- `showView(key)`·`activeView`·`VIEW_DRAW` 골격 유지. `signal`·`radar`·`clock`은 **캔버스 없음**(SVG/DOM) → `VIEW_DRAW`에 미등록(드로 불필요). showView는 `.view` 토글만으로 표시.
- 상세 뷰는 사이드바 `.snav-item`이 없으므로, showView 시 `.snav-item.on`이 아무 것도 안 켜질 수 있음 — 허용(대시보드 백링크로 복귀). 단 `applyTierBadges`·`CHART_TIER`엔 영향 없음(상세 뷰는 등급 대상 아님).
- 모바일 가로 네비(pill)에는 상세 뷰 항목 없음(히어로 클릭 진입 동일).

## 5. 데이터/로직 흐름

- 신규: `loadCoinGecko()` → `S.dom`. `refresh()`의 `Promise.allSettled([...])`에 추가. 상태등에 `coingecko` 1개 추가(또는 기존 상태 묶음에 표시).
- 점수 산식(`scoreMom/Liq/Fun/Val`)·`recompute()` 계산부 불변. `recompute()` 렌더 타깃만 재배치 + 타일/상세 헬퍼 호출 추가.
- 그레이스풀: 도미넌스 실패해도 나머지 정상.

## 6. 엣지/주의

- 디자인 토큰만, `html{zoom:1.35}` 유지, 한국어 UI, 좌측 컬러바 금지(타일/패널 신호는 면/틴트). 들여쓰기 2 spaces.
- 게이지·레이더·사분면 SVG id(`#gFill/#scoreNum/#radarG/#quadG/#gNeedle/#gTicks/#gTrack`)는 보존(이동만). 4카드 id(`#cMom/#cLiq/#cFun/#cVal`)·data-f 키 보존.
- 상세 뷰 진입 시 캔버스 0크기 이슈 없음(SVG·DOM만). 단 레이더 상세에 캔버스 없으니 resize 핸들러 영향 없음.
- 클릭 영역 접근성: 시그널 패널·타일에 `role="button"`/`tabindex="0"`/`aria-label`, Enter·Space 키 처리.
- CoinGecko rate limit(분당 제한) — 60초 주기 호출은 안전 범위. 실패 시 조용히 디그레이드.

## 7. 검증

- 티커: ETH/USD·ETH/BTC·도미넌스 3칸, BTC/USD 없음. 도미넌스 값 표시(실패 시 — / 연결 필요).
- 대시보드: 시그널 게이지(작아짐) + 레이더·사이클 컴팩트 타일 2. 축별 4카드 미표시. 박스 수 감소.
- 클릭: 시그널 패널→`signal` 상세(산식·기여), 레이더 타일→`radar` 상세(큰 레이더+4카드), 사이클 타일→`clock` 상세(사분면). 각 상세 `‹ 대시보드` 백링크 복귀.
- 회귀: 헤드리스 JS 에러 0, 게이지/레이더/사분면/4카드 값 정상, 60초 갱신 유지, 기존 패턴 뷰(계절성~변동성) 정상.
- 모바일: 히어로 작게, 타일 가로 유지/적절 축소, 상세 뷰 백링크 동작.
- 헤드리스 스크린샷으로 대시보드 슬림화·상세 3뷰 육안 확인.
