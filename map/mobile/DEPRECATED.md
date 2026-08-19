# ⛔ 이 폴더의 구현은 폐기됐다 (2026-08-19)

**`map/mobile/` 의 앱 구현은 개발이 중단됐고, 새 디자인 시안 작업의 참조 대상이 아니다.**
커밋 `0c5bd0e`(개발 중단) 이후 이 폴더의 코드는 유지되지 않는다.

## 봉쇄 대상 — 읽지도 복사하지도 않는다

| 경로 | 무엇 | 상태 |
|---|---|---|
| `www/` | 앱 화면 구현(HTML·CSS·JS) | ⛔ 폐기 |
| `android/` | Capacitor 네이티브 프로젝트 | ⛔ 폐기 |
| `test/` | 모듈 테스트 745건 | ⛔ 폐기(엔진 관문과 무관해짐) |
| `tools/` | 관문 스크립트 | ⛔ 폐기 |
| `sync-engine.mjs` · `package.json` | vendor 동기화·의존성 | ⛔ 폐기 |

## 예외 — 계속 읽는다

| 경로 | 무엇 |
|---|---|
| `docs/design_handoff/` | **시안 원본**(화면별 HTML·동선·여정·프로토타입) |
| `docs/DESIGN-BRIEF*.md` · `DESIGN-INVENTORY.md` · `design-audit.md` | 시안 제작용 분해도·감사 |
| `docs/phase0-measurements.md` · `ANDROID-BUILD.md` | 실측 기록·빌드 절차(사실 자산) |
| `docs/rebuild/PROGRESS.md` · `BACKLOG-mobile.md` | 중단 시점 기록(이력) |

## 왜 봉쇄하는가

**P1a·P1b가 실패한 원인이 정확히 이것이다.** 태스크 브리프가 매번 *"기존 `build*` 패턴을 그대로 따르라"* 고
지시했고, 그 결과 **개편 대상이던 옛 디자인이 구조적으로 보존**됐다. 프로젝트 이름이 "앱 개편"인데
결과물은 개편 전 화면의 연장이 됐다.

새 시안이 나왔을 때 같은 일이 반복되지 않게 하려면, **참조할 수 있는 옛 구현이 있다는 사실 자체가 위험**이다.
"조금만 참고하자"가 곧 오염이다.

## 새 구현은 어디를 보는가

| 문서 | 무엇 |
|---|---|
| [`map/app-spec.html`](../app-spec.html) | **화면별 요건정의**(18화면 · 스토리라인 · 상태 카탈로그 · 규격) |
| [`map/design-kit.html`](../design-kit.html) | **시안 작업 재료**(연결도 · 컴포넌트 · 표기 · 카피 · 더미 · 밀도 · 접근성) |
| `map/docs/2026-08-19-forge-information-architecture.md` | PC 정보구조 전수조사 |
| `map/docs/2026-08-19-chart-sharing-feasibility.md` | 작도 공유 타당성 |
| `map/forge*.js` · `forge.html` · `forge.css` | **엔진과 화면의 단일 원본** — 앱은 이것을 그대로 실행한다 |

그리고 새 방향의 핵심 전제: **별도 모바일 개발을 하지 않는다.** 앱은 `forge.html` 과 스크립트 6종을
그대로 실행하고 세로 배치만 같은 파일 안에서 만든다(`app-spec.html` 전제 1·2).
그러므로 **이 폴더의 `www/` 를 참고할 이유가 구조적으로 없다** — 그 코드는 "별도로 만든다"는
폐기된 전제 위에 서 있다.
