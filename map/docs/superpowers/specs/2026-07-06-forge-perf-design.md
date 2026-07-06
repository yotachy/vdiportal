# forge 성능 개선 (Phase 2: 체감 레버) — 설계

- 날짜: 2026-07-06
- 대상: `map/forge-app.js`(FX 루프·렌더). `forge-core.js`·데이터·서버 미변경.
- 목적: 체감 "무거움"의 실제 원인(상시 rAF FX 루프)을 잡고 초기 렌더를 지연해 유휴·부팅 부하를 낮춘다.

## 배경 (측정)

- 콜드 분석 ~40ms(node) · 반복은 `_anGet` 캐시로 무료 → **계산은 지속 병목 아님**(워커 제외).
- **`drawFx`(차트 앰비언트 FX, forge-app.js ~1472)가 상시 rAF 무한 루프**: 차트가 보이는 내내 매 프레임 예측 종점 브레딩 링·shimmer를 `shadowBlur`로 재드로. `stopFx` 없음, `visibilitychange` 미연결(탭 숨겨도 계속), 프레임 캡 없음(60/120/144Hz 전부), 감속모션에도 루프 지속. → 유휴 CPU/GPU·발열·배터리의 실제 주범.
- 대비: `startPulse`(이미지 오버레이용, ~2573)는 이미 `visibilitychange`·감속모션 정지로 잘 관리됨. drawFx만 누락.
- 서브패널(RSI/MACD/…)은 `renderChart`에서 매번 전부 그림 — 화면 밖도 즉시.

## 결정 사항 (브레인스토밍 합의)

- **A. 앰비언트 FX 루프 제어**(최우선) + **B. 지연 초기 렌더**(보조·보수적).
- 웹 워커 제외(캐시가 반복 무료화). minify 제외(빌드툴 원칙). 로직·시각 디자인 불변.

## A. 앰비언트 FX 루프 제어 (`drawFx`)

1. **`stopFx()` 추가** — `if (_fxRaf) { cancelAnimationFrame(_fxRaf); _fxRaf = null; }`.
2. **탭 가시성 연동** — 기존 `visibilitychange` 핸들러(2606)에 확장: `document.hidden`이면 `stopFx()`, 복귀 시 `heroMode()==="chart"`일 때만 `startFx()`.
3. **차트 모드/가시성 게이트** — `startFx`는 차트 모드에서만 시작. 비차트 전환·hero 오프스크린이면 `stopFx`. hero 가시성은 `IntersectionObserver`(가능 시)로 판단, 실패/미지원 시 항상 활성(안전 폴백).
4. **프레임 캡 ~30fps** — `drawFx(now)` 진입에서 `now - _fxLast < 33`이면 그리기 건너뛰고 rAF만 재요청(`_fxLast` 갱신 없음). 33ms 캡으로 비용 대략 반감, 시각차 미미.
5. **감속모션 종결** — `prefersReducedMotion()`이면 정적 프레임 1회 그리고 **루프 중단**(`stopFx`). 현재는 정적 그리며 계속 루프 → 중단으로 유휴 0.

- FX 오버레이의 시각 결과(브레딩 링·shimmer)는 활성 시 **현행과 동일**(스로틀은 프레임 간격만).

## B. 지연 초기 렌더 (오프스크린 서브패널)

- 서브패널 캔버스(`fcDrawRsi/Macd/Adx/Vol/Cci/Williams/Mfi`)는 화면에 들어올 때 그리도록 `IntersectionObserver` 게이트. 이미 보이는 것·차트·상단 표는 즉시.
- **보수적 안전 폴백**: Observer 미지원/실패·요소 미발견 시 **즉시 그림**(현행 동작). 스크롤로 보이면 그때 최초 1회 그린 뒤 이후엔 정상 갱신.
- 목적은 부팅/재렌더 시 화면 밖 캔버스 작업 지연 — 회귀 위험 최소화가 우선(효과<A).

## 검증

- **동작 스냅샷 SIG 불변**: Phase 1 baseline 하베스터 재사용(target·pathLen·nodes·elliott·7테마·staticEls·err) — 분리 후 값과 동일 유지.
- **FX 스로틀/정지 확인**(간접): 헤드리스에서 `_fxRaf` 존재/정지 토글, `stopFx` 호출 경로 동작, 감속모션 시 루프 중단, 탭 숨김(`document.hidden` 모의) 시 정지.
- **시각 동일**: FX 활성 시 예측 종점 링·shimmer 렌더 유지(스크린샷). 서브패널 스크롤 진입 시 정상 렌더.
- 코어 무변경 → `node --test` 199/199.

## 제약 / 비목표

- 단일 산출물군·번들러 없음(분리 구조 유지). 좌측 accent line 금지.
- 비목표: 웹 워커, minify, 시뮬레이션(morph) 재작성(짧은 수명이라 보류; 필요 시 후속), CSS 최적화.
- 배포 세트 7파일 동반(forge-app.js만 변경) · 데이터 파일 불가침.
