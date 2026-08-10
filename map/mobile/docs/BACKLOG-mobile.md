# 머니스쿱 모바일 백로그 (살아있는 문서)

> 스쿱포지 백로그(`map/docs/BACKLOG.md`)와 **섞지 않는다.** 목적·사용자·배포 대상이 다르다.
> 설계: `map/docs/superpowers/specs/2026-08-10-moneyscoop-mobile-design.md`

## ✅ 완료

- **Phase 0 — 엔진이 폰에서 도는가 · 얼마나 걸리는가** (2026-08-10, `8a728ac..44285fc`)
  계획 `map/docs/superpowers/plans/2026-08-10-moneyscoop-mobile-phase0.md` · 실측 `docs/phase0-measurements.md`
  - `map/mobile/` 스캐폴드 + 엔진 단일원본 동기화(`sync-engine.mjs` → gitignored `www/vendor/`)
  - UMD 4모듈 `api`·`graph`·`chart`·`bench` + 40 테스트 · 계측 화면 `spike.js`
  - Capacitor 8.5.0 안드로이드 플랫폼(`androidScheme: https`, 번들 에셋만, 권한은 INTERNET 하나)
  - **판정: Web Worker 조건부 불필요** — 폴드7 커버화면 3주기 콜드 776.5ms / 반복 1074.4ms (임계 2000ms).
    조건은 일봉 히스토리 절감(아래 1번).
  - **최종 리뷰가 잡은 Critical**: 엔진이 `candle[i].v` 를 읽지 않고 sampleGraph 볼륨 노드에 합성 BTC 480봉이 baked 되어,
    거래량 지표 5종이 가짜 거래량 위에서 돌고 있었다 → `MSGraph.setVolume()` 으로 배선(엔진 무수정), 실기기 확인 완료.
  - **계획서 오류 정정**: `makeDemoSeries(n)` 이 n 을 무시하고 480봉 고정 → "봉 수 무관 ~50ms" 는 측정 아티팩트였다.

## 🔥 다음

- **Phase 1 — 수직 슬라이스(워치리스트 → Basic 리포트 → 차트)**
  1. ★ **봉 수 ↔ 정확도 실측** — 주기별 최적 히스토리 길이. Worker 회피의 전제. 백테스트로 답할 수 있는 질문.
  2. 목업 `#1a`(워치리스트 · turn-2 타입 시스템으로 재작도 필요) · `#6a`/`#2a`(Basic 리포트) 를 실화면으로
  3. 차트: 축·크로스헤어·핀치줌·로그축. `chart.js` 위에 얹는다. 페이지 스크롤 삼킴 방지(PC `#chartLockBtn` 선례)
  4. `?since=` 증분 시세 (콜드 수신 942ms)
  5. 폴드 2단 레이아웃(600–904dp) — 사용자 주력 기기

## 📋 예정

- **Capacitor 툴체인 검증** — `cap add android` 까지 완료, Gradle 빌드·APK 설치·WebView 실행은 미검증.
  GUI 있는 자리에서 Android Studio 로 `map/mobile/android` 열고 폴드7에 Run. 폴드 펼침 시 액티비티 유지도 이때 확인.
- **`android:allowBackup="true"` 끄기** — 템플릿 기본값. v2 인증·지갑 상태 들어오기 전에.
- **`package-lock.json` 카브아웃** — 저장소 루트가 전역 제외. `map/mobile` 은 첫 실 npm 의존성 트리이고
  해석 버전이 생성 `android/` 템플릿 내용을 좌우 → `!map/mobile/package-lock.json` 권고.
- **드로잉 도구 터치** — `forge-tools.js` 는 Pointer Events 전용이라 재바인딩 불필요. 붙일 때 캔버스 `touch-action: none` 필요.
- **cafe24 PHP SQLite(PDO) 확장 확인** — v2 지갑 계획 시점. 서버에 임시 프로브 업로드/삭제라 별도 승인 필요.
- v2 — 서버 지갑 원장 + 구글 로그인
- v3 — AdMob + SSV + Full 티어 → 프로덕션 출시
- v4 — Custom 티어 · 증거/신뢰 화면군

## 이월된 마이너 (Phase 0 리뷰)

- `api.js` `MIN_BARS[tf] || MIN_BARS["1day"]` — `||` 폴백. 미인식 주기가 가장 엄격한 하한으로 떨어지므로 안전 방향. 유지.
- `graph.js` `indicatorTypes()` 는 이름을 엔진과 대조하지 않는다 — `evalBlocks` 오라클 테스트로 보완됨(오타 시 price 통과를 잡음).
