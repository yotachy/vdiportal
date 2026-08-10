# Phase 1 완료 노트 — 수직 슬라이스(워치리스트 → Basic 리포트 → 차트)

- 범위: `b5b5ece..7ecc843` (+ 리뷰 대응 1건, 리스너 누수 수정 — 아래 참조)
- 실기기 검증: 폰 Chrome(Tailscale 경유), **WebView/APK 아님**

## 만든 것

### 신규 모듈

- `store` — 워치리스트·스캔 캐시 localStorage 래퍼
- `scan` — 순차 스캔 큐(지수 백오프·부분 결과 즉시 콜백)
- `chart-layout` — 4단 적층 좌표계(가격+거래량+RSI+MACD), `M` 11키
- `chart-draw` — 캔들·콘·축·크로스헤어, 예측선 3종 티어 게이팅. Phase 0 `chart.js`/`spike.js` 폐기
- `draw-layers` — PC 가격 패널 오버레이 포팅(MA·볼린저 + 배지 3종)
- `draw-panels` — PC 서브패널 포팅(RSI·MACD·거래량)
- `ui` — 공통 DOM 헬퍼
- `app` — 라우터(watchlist ↔ report)
- `screens/watchlist` — 워치리스트 화면
- `screens/report` — Basic 리포트 화면(판정 + 4단 차트 + Counted/Not counted + 주기 행 + CTA)

### 기존 모듈 확장

- `basicGraph` — Basic 티어 5지표 그래프 생성 추가
- `loadTicker` — 조회 + 오타 제안 추가

### 절대 건드리지 않은 것

`map/forge-core.js` · `map/forge-tools.js` · `map/forge-draw.js` — Phase 1 기간 동안 한 번도 수정되지 않았다(`git diff --stat` 빈 결과로 확인).

## 테스트

- `map/mobile`: 40 → 85 (`npm test`, `node --test test/*.test.mjs`)
- 통합 관문 `map/tests/run.sh`(forge-core + forge-tools + landing + mobile 합산): **445건 통과**

## PC 작도 포팅 실측

- 가격 패널 오버레이: 24개 심볼·229줄 (`draw-layers.js`)
- 서브패널: 8개 심볼·99줄 (`draw-panels.js`) — DOM 캔버스 획득 방식을 `(c, cw, ch, data, reveal)` 순수 함수 시그니처로 교체하는 "헤드 수술"을 거쳤다(문서화된 변경)
- 검증된 페인트 콜 수(레코딩 컨텍스트로 카운트):
  - MA 508
  - 볼린저 621
  - RSI 990
  - MACD 1449 (그중 fillRect 480)
  - 거래량 554

## 성능

- Basic 티어(5지표): 데스크톱에서 5031봉 기준 약 20.2ms
- Full 32지표 대비 약 128배 저렴
- **Phase 1엔 성능 우려 없음**

## 일치도 배지 — 퍼센트 대신 agree/total

Basic 티어는 방향을 내는 지표가 4개뿐이라 값이 0/25/50/75/100 중 하나만 가능하다. 이 상태로 퍼센트를 보여주면 확률처럼 읽히는데, 실측 방향 적중률(58.1%)과 나란히 두면 오독을 유발한다. 그래서 배지는 `agree/total`(예: "지표 4개 중 3개가 이 방향에 동의")로 표기한다.

## 예측선 티어 사다리 (메커니즘만 존재)

`chart-draw.js`의 `PRED_TIERS`:

```js
{ basic: ["p1"], full: ["p1", "p3"], custom: ["p1", "p2", "p3"] }
```

Phase 1은 `TIER = "basic"`을 고정 전달하므로 1차 종합 예측선(`p1`)만 그려지고, 2차/3차는 범례에 "· 잠김"으로 표시된 채 남는다(`buildChartLegend`, `linesFor(TIER)`로 잠금 여부 판정). 정확한 Scoops 가격 정책은 의도적으로 미확정 상태다.

## 알려진 갭 (다음 단계로 이월) — PC 대비 낮은 체감 품질의 원인

실제 폰 화면을 사용자가 PC 버전과 비교해 "품질이 낮다"고 판단했다. 이유는 아래 갭들이다.

1. **PC 전용 시각 요소 미포팅**: 종단점 진앙 마커(동심원 리플), 구간별 신뢰도 렌더링, 3계층 데이터 텍스처(계절성·AR·GARCH 밴드), 범례 클릭 토글. 전부 이식되지 않았다.
2. **`_predDir`(`draw-layers.js`) 는 PC 전용 전역(`lastResult`/`currentData()`)을 읽는다.** try/catch가 있어 실패 시 `+1`을 반환한다. 지금은 `chart-layout.js`의 `M.focused`가 항상 `false`라 이 경로에 도달하지 않아 무해하다. **주의: 이후 단계에서 focus 모드를 켜서 `M.focused`를 `true`로 만드는 순간, 이 함수는 에러 없이 조용히 틀린 값(+1 고정)을 반환해 반대추세 투영 마커의 감쇠를 잘못 적용한다.** focus 모드를 켜기 전에 반드시 해결할 것.
3. **`pred.second`(2차 예측)는 아직 생산자가 없다.** 값이 없으면 티어 사다리가 해당 선을 건너뛴다(에러는 아님).
4. **잠긴 범례 스와치 색은 명시값이 아니라 CSS 우선순위에 의존한다** — `buildChartLegend`가 `locked`일 때 `line.style.borderColor`를 아예 설정하지 않고 클래스(`.rp-legend-line`/`.rp-legend-dashed`/`.rp-legend-locked`)의 CSS 캐스케이드에 맡긴다.
5. **폴드 펼침·접힘 시 액티비티 유지 여부 미검증** — Capacitor Gradle 빌드도 아직 안 됨. APK가 한 번도 만들어지지 않았다.
6. **Phase 1 화면 실기기 검증은 폰 Chrome(Tailscale) 에서 했다. WebView 안에서는 확인하지 않았다.**

## 리뷰 대응 — resize 리스너 누수 수정

`screens/report.js`의 `paintChart()`가 `MSReport.render()`를 호출할 때마다(재시도·재방문 포함) `window.addEventListener("resize", onResize)`를 새로 붙이고 있었다. 기존 `onResize`는 `cv.isConnected === false`일 때만 스스로를 떼어냈는데, 이는 *다음 resize 이벤트가 실제로 발생해야만* 정리되는 구조라 회전을 한 번도 하지 않는 기기에서는 방문마다 리스너가 하나씩 쌓였다(각 리스너가 그 방문의 캔버스·레이아웃·캔들 배열을 클로저로 붙잡은 채).

모듈 스코프 변수(`activeResizeCleanup`)에 "현재 붙어있는 리스너 해제 함수"를 보관하고, `paintChart()`가 새 리스너를 붙이기 **직전에** 무조건 먼저 호출하도록 바꿨다 — resize 이벤트를 기다리지 않고 그 자리에서 결정적으로 정리한다. 결과적으로 런타임 전체에서 리스너는 항상 최대 1개만 존재한다. 작도 동작은 변경하지 않았다(`onResize`의 리사이즈 판정·`relayout`/`frame` 호출 로직은 그대로).

이 수정은 DOM 없이 정직하게 단위테스트할 수 없어서 테스트를 추가하지 않았다: `paintChart()`는 실제 `<canvas>`의 2D 컨텍스트, `wrap.clientWidth`, 그리고 `MSApi`/`MSStore`/`MSGraph`/`ForgeCore`/`MSChartLayout`/`MSChartDraw`/`MSLayers`/`MSPanels` 전역에 깊이 묶여 있다. 이 의존성 전부를 흉내 내는 테스트는 실제 동작이 아니라 흉내(mock) 자체를 검증하게 되므로 작성하지 않았다. 순수 함수 계층(`draw-panels.js`/`draw-layers.js`/`chart-draw.js`)은 이미 테스트돼 있으나 이번 수정은 그 계층이 아니라 화면 컨트롤러의 리스너 수명주기에 있다.
