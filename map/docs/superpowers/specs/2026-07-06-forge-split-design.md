# forge.html 파일 분리 (Phase 1: 관리성) — 설계

- 날짜: 2026-07-06
- 대상: `map/forge.html` (9,155줄: CSS 1,188 + 인라인 JS 7,729). `forge-core.js`·데이터·서버 미변경.
- 목적: 거대 단일 `forge.html`을 **동작 불변**으로 co-located 파일로 분리해 유지보수성을 높인다. 성능(워커/지연)은 **Phase 2 별도 사이클**.

## 배경

`forge.html`은 `<style>` 1블록(9–1196) + 인라인 `<script>` 1블록(1423–9153, 7,729줄)로 된 단일 파일. 크기 때문에 로드 파싱(domInteractive ~234ms)·편집·리뷰가 무겁다. 엔진은 이미 `forge-core.js`(UMD·DOM-free·`node --test` 199)로 분리돼 있다 — 그 패턴을 UI에도 확장한다.

## 결정 사항 (브레인스토밍 합의)

- **소스 순서 유지 컷**: 함수를 재배치하지 않고, 현재 소스 순서를 100% 보존해 안전 seam(최상위 선언 경계)에서만 자른다.
- **4 JS 파일 + CSS**: `forge.css` + `forge-state.js` + `forge-ui.js` + `forge-draw.js` + `forge-app.js`. 엔진 `forge-core.js`는 현행 유지.
- 번들러·프레임워크 없음 — plain `<link>`·`<script src>`.

## 안전성 원리 (동작 불변)

- 여러 classic `<script>`는 **하나의 전역 스코프를 공유**한다(ES 모듈 격리 아님). 최상위 `function`/`var`는 전역 객체 프로퍼티, 최상위 `let`/`const`/`class`는 **공유 전역 렉시컬 환경**에 등록되어 뒤 스크립트에서 그대로 보인다.
- 따라서 **소스 순서 보존 + 최상위 경계(brace depth 0)에서만 절단**하면 실행 순서가 현재와 동일 → 동작 변화 위험 사실상 0.
- 교차 참조는 런타임 호출(부팅 이후)이라 안전. 유일 위험은 "로드 시점 즉시 실행되는 최상위 문이 뒤 파일 정의를 참조"하는 경우 → 현 코드의 즉시 실행은 **맨 끝 이벤트 등록뿐**이므로 해당 없음(헤드리스로 확증).

### 절단 규칙 (불가침)

1. 함수/표현식 중간 절단 금지 — 각 파일은 그 자체로 문법상 완결(균형 잡힌 중괄호)이어야 한다.
2. 중복 최상위 선언 금지(한 `const`/`function`은 한 파일에만).
3. 부팅 IIFE/이벤트 등록(`DOMContentLoaded`·`load`)은 **맨 마지막 파일(app)** 유지.
4. 로드 순서: `forge-core.js` → `state` → `ui` → `draw` → `app`.

## 파일 레이아웃 · 컷 경계

인라인 `<script>` 내용(1424–9152)을 아래 4개 anchor로 4분할. anchor는 모두 최상위 `function` 선언 직전(depth 0).

| 파일 | 구간(현재 라인) | 시작 anchor | 주요 내용 |
|---|---|---|---|
| `forge.css` | `<style>` 9–1196 | — | 전체 스타일 |
| `forge-state.js` | 1424 – 2120 | (스크립트 시작) | uid·DOM refs·상태·`BLOCK_DEFS`·`IND_TIERS`·autoLayout·boardToGraph·엣지기하·이미지·`renderHero`·서버저장·`boot`·사이드바 CRUD |
| `forge-ui.js` | 2121 – 3506 | `function renderIndRail()` | 지표레일·프리셋·노드/보드 렌더·`renderParams`·측정/페인트·HUD·자석·`boardInit`·`seedDefaultStrategy` |
| `forge-draw.js` | 3507 – 6271 | `/* palette constants */` `const FC_ACC` | `FC_*`·`_syncChartColors`·`fcDrawMain`·서브패널·`EV_COLORS`/`INDICATOR_INFO`/`EV_LABEL`·엘리어트/피보 레이어·예측 작도 |
| `forge-app.js` | 6272 – 9152 | `function renderChart()` | `renderChart`(합성)·분석 서술(`analysisSteps`·`nodeExpert`)·`THEMES`/`applyTheme`·`playAnalysis`·`runForge`·부팅 IIFE(`DOMContentLoaded`) |
| `forge.html` | 마크업 + 참조 | — | `<link>`·`<script src>`만(인라인 CSS/JS 제거) |

> 실제 컷 라인은 구현 시 각 anchor 직전의 depth-0 라인으로 확정하고, **파일별 문법 검사(`node --check` 또는 `new Function`)** 로 완결성을 검증한다. 라인 번호는 편집으로 이동할 수 있으므로 anchor(함수명/주석)를 기준으로 삼는다.

## 로드 순서 (forge.html)

```html
<link rel="stylesheet" href="forge.css?v=YYYYMMDD">
...
<script src="forge-core.js?v=YYYYMMDD"></script>
<script src="forge-state.js?v=YYYYMMDD"></script>
<script src="forge-ui.js?v=YYYYMMDD"></script>
<script src="forge-draw.js?v=YYYYMMDD"></script>
<script src="forge-app.js?v=YYYYMMDD"></script>
```

- 각 파일 `?v=` 캐시버스터(엔진 캐시버스터 관례 확장).
- **defer/async 금지** — 전역 스코프 공유·순서 의존이므로 기본(파싱 순서) 실행 유지.

## 검증 (기능 안전 담보)

- **점진 컷**: 파일 하나 추출 시마다 커밋 + 헤드리스 검증. 4파일을 한 번에 하지 않는다.
- **파일 완결성**: 각 추출 파일 `node --check`(또는 `new Function`)로 문법 통과.
- **동작 스냅샷 동일성**: 분리 전 baseline과 분리 후를, 동일 시나리오(seed→autoLayout→runForge→playAnalysis→테마 전환)에서 헤드리스로 비교 — 예측 `target`·`confluence`·파동 라벨·`err` 로그가 **동일**해야 한다.
- 스모크 항목: JS 에러 0 / 지표레일·노드보드 렌더 / 웹분석 예측 산출 / 시뮬레이션 재생 / 테마 7종 전환 / 엘리어트·차트 작도.
- 엔진 무변경 → `node --test forge-core.test.js` 199/199 유지.
- git 브랜치 + 파일별 커밋 → 회귀 시 즉시 롤백.

## 배포 영향

- **배포 세트 확대**(동반 필수): `forge.html` + `forge-core.js` + `forge.css` + `forge-state.js` + `forge-ui.js` + `forge-draw.js` + `forge-app.js`. (배포 스크립트/메모리·CLAUDE.md 갱신)
- 서버 생성 데이터 파일 불가침(현행 유지).

## 제약 / 비목표

- 단일 HTML→다중 파일이나 **번들러 없음**(원칙 유지). 로직 재작성·함수 재배치·디자인 변경 없음(순수 분리).
- 비목표: 성능 최적화(워커·지연·스로틀 = Phase 2), CSS 분해 세분화, minify.
- 좌측 accent line 등 디자인 규칙·데이터 정합 그대로.
