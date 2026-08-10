# 머니스쿱 모바일 백로그 (살아있는 문서)

> 스쿱포지 백로그(`map/docs/BACKLOG.md`)와 **섞지 않는다.** 목적·사용자·배포 대상이 다르다.
> 설계: `map/docs/superpowers/specs/2026-08-10-moneyscoop-mobile-design.md`

## ✅ 완료

- **Phase 1 — 수직 슬라이스(워치리스트 → Basic 리포트 → 차트)** (2026-08-10, `b5b5ece..7ecc843`)
  실측 노트 `docs/phase1-notes.md`
  - 신규 모듈 `store`·`scan`·`chart-layout`·`chart-draw`·`draw-layers`·`draw-panels`·`ui`·`app`·`screens/watchlist`·`screens/report`,
    `basicGraph`·`loadTicker` 확장. Phase 0 `chart.js`·`spike.js` 폐기
  - PC 작도 포팅: 가격 패널 오버레이(24개 심볼·229줄) + 서브패널(8개 심볼·99줄, DOM 캔버스 획득을
    `(c, cw, ch, data, reveal)` 순수 시그니처로 교체하는 헤드 수술 동반). 페인트 콜 수 검증: MA 508·볼린저 621·RSI 990·MACD 1449(fillRect 480)·거래량 554
  - Basic 티어 성능: 데스크톱 5031봉 약 20.2ms, Full 32지표 대비 약 128배 저렴 — **성능 우려 없음**
  - 일치도 배지를 퍼센트에서 `agree/total`로 (Basic 4지표라 값이 0/25/50/75/100뿐이라 퍼센트가 확률처럼 오독됨)
  - 예측선 3종 티어 게이팅 메커니즘(`PRED_TIERS: basic:["p1"] · full:["p1","p3"] · custom:["p1","p2","p3"]`) —
    Phase 1은 `basic` 고정, 2차/3차는 범례에 잠김 표시. Scoops 가격 정책은 미확정
  - 테스트 40 → 85(`map/mobile`), 통합 관문 `map/tests/run.sh` 445건 통과. `forge-core.js`·`forge-tools.js`·`forge-draw.js` 무수정 유지
  - **리뷰 대응**: `screens/report.js` resize 리스너 누수 수정 — 재시도/재방문마다 새 리스너가 쌓이던 것을,
    모듈 스코프 해제 함수로 `paintChart()` 진입 시 이전 리스너를 결정적으로 정리하도록 변경(런타임 중 최대 1개 보장)
  - 실기기 검증은 폰 Chrome(Tailscale) 한정 — **WebView/APK 미검증**

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

- **Phase 2 — PC 예측선 작도 포팅**(2026-08-10): 꿈틀(S/R 반응 + AR 결)·구간 신뢰도 페이드·신뢰 지평 이후 점묘·
  끝점 진앙/차수 라벨/예측가. `draw-preds.js`(`MSPreds`) 신규.
  - **라벨 레지스트리는 공유해야 한다**: `_evLabel`·박스 목록을 복사하면 두 벌이 되어 끝점 라벨이 지표 배지를
    못 보고 겹친다 → `MSLayers` 가 `evLabel`/`fitBoxY`/`reservePredBox` 를 노출하고 `MSPreds` 가 그것을 쓴다.
  - **`report.js` 합성 순서 버그**: `resetLabels` 가 `drawCone` **뒤에** 있어, 끝점 라벨 예약이 등록 직후 지워지는
    구조였다. 맨 앞으로 옮겨 고쳤다.
  - **설계서 정정 3건**: `_fitBoxY` 는 미포팅 상태였다 / `confAt` 은 `(lo,hi,k)` 여야 한다(신뢰도는 밴드 폭 함수) /
    매끈한 폴백 조건은 `tex` 없음이 아니라 `tex`·`levels` 둘 다 없음이다(꿈틀의 주항은 S/R 반응).

## 🔥 다음

- (미정 — 아래 📋 예정에서 우선순위 선정)

## 📋 예정

- **PC 시각 요소 포팅 — 범례 클릭 토글(B군)** — 표시 지표 집합(`_evVisible`) → 2차 예측(`_get2ndPred`).
  새 상태 + 토글마다 엔진 2회차 실행 + 캐시가 필요하고, 2차 선은 custom 티어 전용인데 custom 화면 자체가 v4다.
  **custom 티어 화면과 함께 착수한다.**
- **핀치줌 · 로그축** — 제스처를 다시 건드리므로 Phase 1 이 구조적으로 해결한 스크롤 충돌(350ms 홀드 계약)을
  재설계해야 한다. 독립 Phase 로 다룬다.
- **`_predDir`(`draw-layers.js`) PC 전용 전역 의존 — focus 모드 켜기 전 해결 필수** — `lastResult`/`currentData()`를
  읽다 실패하면 try/catch로 `+1`을 반환한다. 지금은 `chart-layout.js`의 `M.focused`가 항상 `false`라 무해하지만,
  이후 focus 모드를 켜서 `M.focused=true`가 되는 순간 에러 없이 조용히 틀린 값을 반환해 반대추세 투영 마커의
  감쇠가 잘못 적용된다. **focus 모드 활성화 전에 반드시 고칠 것.**
- **`pred.second`(2차 예측) 생산자 없음** — 값이 없으면 티어 사다리(`custom` 등급)가 해당 선을 건너뛰는
  상태로만 남아있다. 2차 예측 로직을 붙이는 작업 필요.
- **잠긴 범례 스와치 색 명시화** — `buildChartLegend`가 잠긴 항목엔 `line.style.borderColor`를 설정하지 않고
  CSS 캐스케이드(`.rp-legend-line`/`.rp-legend-dashed`)에 맡기고 있다. 명시값으로 교체 검토.
- **폴드 펼침/접힘 액티비티 유지 + Capacitor Gradle 빌드/APK** — 여전히 미검증(아래 "Capacitor 툴체인 검증"과 동일 항목).
  Phase 1 실기기 확인은 폰 Chrome(Tailscale) 이었고 WebView 안에서는 하지 않았다.
- **봉 수 ↔ 정확도 실측** — 주기별 최적 히스토리 길이(Phase 0/1에서 이월, 아직 미착수). 백테스트로 답할 질문.
- **차트 핀치줌·로그축** — 축·크로스헤어는 Phase 1에서 포팅됐으나 핀치줌·로그축은 아직 없다.
- **`?since=` 증분 시세 미사용** — `api.js`의 `ohlcUrl`이 `since` 파라미터를 받지만 `loadTicker`가 아직
  넘기지 않아 항상 전량 조회한다(콜드 수신 942ms, Phase 0 실측).
- **폴드 2단 레이아웃(600–904dp)** — 사용자 주력 기기의 펼침 화면 레이아웃 미착수.
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
