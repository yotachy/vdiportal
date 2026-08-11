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

- **Phase 3 — 고정 레전드 행 + 시안 카피 정합**(2026-08-11): 지표 값을 차트 안 구석 배지에서 빼서
  차트 위 고정 레전드 행 7개로 옮기고, 리포트·워치리스트 화면 카피를 영문 시안에 맞췄다.
  - 신규 모듈 `strings.js`(UI 문자열 단일 출처, 시안 영문 + 지표명 32종) · `chart-legend.js`(`MSLegend.rows` 순수 함수 + 고정 DOM 레전드,
    크로스헤어 드래그 시 RSI·%B·MACD 숫자만 갱신)
  - 차트 안 구석 배지·끝점 라벨 제거 — 위치가 의미를 담는 요소(선·크로스 마커·다이버전스·진앙)만 차트에 남김
  - 예측 구간 `TAIL_BARS` 60으로 확대(16% → 28%), 화면 카피 전반 한글 → 영문
  - **리뷰 대응 1**: 계획서는 `rsiBadge`/`volumeBadge` 호출 자체를 없애라고 지시했는데, 그대로 따르면 배지뿐 아니라
    포지션을 담고 있는 **RSI·거래량 다이버전스 선**까지 함께 죽었다. 배지만 게이트하고 호출은 유지하도록 수정.
  - **리뷰 대응 2**: `chart-legend.js`와 `draw-layers.js`가 같은 상태 어휘(정배열/역배열, 과열/침체 등)를 각자
    따로 들고 있어 대소문자 표기가 갈렸다 → 공유 `MSStr` 맵(`MA_ALIGN`/`VOL_STATE`/`VOL_REL`/`BB_STATE`/`RSI_ZONE`)으로
    옮겨 양쪽이 같은 표를 읽게 통일
  - 테스트 138 → 145(`map/mobile`), 통합 관문 `map/tests/run.sh` 505건 통과. `forge-draw.js`·`forge-app.js`·`forge-core.js` 무수정 유지
  - 실기기(폰 Chrome, 레전드·배지 제거·크로스헤어·예측 구간·영문화) 육안 확인은 **미실시** — 아래 예정 항목 참조

- **Phase 4 — 두 손가락 핀치 줌**(2026-08-11): 차트 위에서 두 손가락으로 벌리면/오므리면 봉이 굵어지고/가늘어진다.
  - 창은 오른쪽 끝 고정이라 상태는 `tail`(보이는 봉 수) 하나면 충분 — PC식 `_chartWin{start,count}`는 불필요했다
  - 한계는 봉폭(2~12px) 기준, 기본은 봉 수(60, 화면 폭 무관 고정). 기본까지 봉폭 기준으로 잡으면 펼침에서 197봉이
    되어 예측 구간 비중이 28% → 11%로 줄어 Phase 3이 원상복구된다
  - `user-scalable=no`(뷰포트 전체 줌 차단) 대신 **캔버스에만** `touch-action: pan-y` — 페이지 줌 접근성과
    Phase 1의 350ms 홀드 계약을 둘 다 보존
  - 폴드 전개/접힘 시 `relayout()`이 재클램프한다 — 한계가 `plotW`에 의존하기 때문(커버는 20봉까지, 펼침의
    최소값은 44봉)
  - **테스트 결함 3건, 전부 같은 모양**(계획서가 미리 지정한 결함을 구현 중 포착): 단일원본 리팩터 후
    `plotWidth === lay.plot.w` 항등식 검증이 되어버린 어서션, 자기 자신의 경계값을 `MSZoom.DX_MIN/DX_MAX`에서
    읽어오던 봉폭 불변식 테스트, Phase 4가 무효화한 Phase 3의 소스 정규식 테스트. 셋 다 "기대값을 구현체에서
    유도"하는 동일 패턴이었다
  - 테스트 145 → 162(`map/mobile`), 통합 관문 `map/tests/run.sh` 522건 통과. `forge-draw.js`·`forge-app.js`·
    `forge-core.js` 무수정 유지
  - 실기기 육안 확인은 **미실시** — 아래 "미검증 — 사용자 육안 확인 필요" 참조

## 🔥 다음

- (미정 — 아래 📋 예정에서 우선순위 선정)

## 미검증 — 사용자 육안 확인 필요

Phase 4(핀치 줌) 실기기 확인은 브라우저·실기기가 없는 에이전트 환경이라 수행하지 못했다. 사람이

```
cd map/mobile/www && python3 -m http.server 8000 --bind 0.0.0.0
폰 Chrome → http://<tailscale-ip>:8000
```

로 직접 아래 8항목을 확인할 것:

1. 차트 위에서 두 손가락으로 벌리면 봉이 굵어지고 적어진다(줌인). 오므리면 반대.
2. 페이지가 통째로 확대되지 않는다 — 차트만 바뀐다.
3. 차트 밖(판정 카드·칩 영역)에서 핀치하면 페이지 줌은 정상 동작한다.
4. 차트 위 한 손가락 세로 드래그로 페이지가 여전히 스크롤된다(홀드 전).
5. 길게 눌러 크로스헤어를 켠 상태에서 두 번째 손가락을 얹으면 크로스헤어가 꺼지고 줌으로 넘어간다.
6. 최대로 오므려도 캔들이 얼룩이 되지 않는다. 최대로 벌려도 지나치게 뚱뚱하지 않다.
7. 폰을 펼쳤다 접었을 때 캔들 굵기가 이상해지지 않는다(재클램프).
8. 줌 상태에서 레전드 값이 여전히 정상이고, 예측 구간도 함께 커진다.

## 📋 예정

- **`rpMissingPoint`("Showing what is missing") 미배선 — 삭제됨** — Phase 3에서 시안 카피를 그대로
  옮겨 `strings.js`에 넣었으나 어느 화면에도 붙일 자리를 못 찾았다. 최종 리뷰에서 죽은 키로 지적돼
  삭제(2026-08-11). 문구 자체는 여기 기록만 남기고, 실제로 쓸 자리가 생기면 그때 다시 넣는다.
- **Phase 3 실기기 육안 확인 미실시** — 브라우저·실기기가 없는 에이전트 환경이라 아래 체크리스트를 수행하지
  못했다. 사람이 `cd map/mobile/www && python3 -m http.server 8000 --bind 0.0.0.0` 후 폰 Chrome(Tailscale)으로
  직접 확인할 것: ①레전드 7개 값 전부 노출 ②차트 안 구석 배지 없음(선·크로스 마커·다이버전스·진앙만) ③크로스헤어
  드래그 시 RSI·%B·MACD 숫자만 바뀌고 상태 문구는 고정 ④예측 구간이 16%→28%로 넓어짐 ⑤화면에 한글 없음.
- **시안 구조 차이 — `Not checked at this level`** — 목업은 능력 4줄
  (Historical hit rate of this setup · Indicators that disagree · Weekly and monthly agreement ·
  Why each reading came out that way)인데 현 구현은 지표 칩 27개를 깐다. 카피가 아니라 구조 차이라
  Phase 3 범위 밖으로 두었다. 어느 쪽이 맞는지 판단 필요.
- **시안 카피 전면 대조** — Phase 3 은 리포트·워치리스트만 맞췄다. 목업 50장 전체 대조는 미실시.
- **로케일·언어 시트** — `keepIndicatorNamesEnglish` 설정 UI·비영어 로케일 안내 시트는 v1 밖(Phase 0 §8).
  지금은 영어 하드코딩만 있고 전환 수단이 없다.
- **PC 시각 요소 포팅 — 범례 클릭 토글(B군)** — 표시 지표 집합(`_evVisible`) → 2차 예측(`_get2ndPred`).
  새 상태 + 토글마다 엔진 2회차 실행 + 캐시가 필요하고, 2차 선은 custom 티어 전용인데 custom 화면 자체가 v4다.
  **custom 티어 화면과 함께 착수한다.**
- **시간축 팬** — 넣으려면 `nowFi` 분리가 함께 와야 한다. 모바일 코드 15곳이 "마지막으로 보이는 봉"과 "최신 봉"을
  같은 값으로 쓰고 있어, 팬을 넣는 순간 두 의미가 갈라지고 현재가 태그가 과거 봉에 조용히 붙는 식으로 틀리게
  그려진다. PC는 `forge-draw.js:983`의 `atLatest`로 처리한다(창이 최신 봉을 포함하지 않으면 예측을 안 그림).
  실사용으로 필요성 판단 후 착수
- **로그축** — 미착수
- **`relayout()` 핀치 프레임마다 백킹스토어 재할당** — `cssW`가 안 바뀌어도 핀치 rAF마다 `cv.width`/`cv.height`·
  DPR 트랜스폼을 매번 재설정한다. 곧바로 리페인트가 따라오므로 무해하지만, 이 기능의 핫패스에서 불필요한
  작업이다. resize 경로와 relayout 경로를 분리하면 해소된다
- **핀치 홀드 정정이 이벤트 발화 순서에 의존** — 두 번째 손가락이 홀드(크로스헤어)를 취소하는 경로는 동일
  콘택트에 대해 Pointer Events가 Touch Events보다 먼저 발화한다는 순서에 기대고 있다. 실제 런타임인
  Chromium/Android WebView에서는 사실상 항상 성립하지만 사양으로 보장되진 않는다
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
- **마일스톤 점 x-매핑이 예측선과 따로 논다** — `draw-preds.js`의 `endDeco`는 PC 원문 `tX(k) = seamX + ((k+1)/pl)*(coneR-seamX)`를
  그대로 쓰는데, PC에선 이게 예측선 자신의 `toXf`와 동일 함수였다. 모바일 예측선 x는 `xsFor`(`fiToX(nowFi+1+k)`)에서
  오므로 두 매핑이 갈린다. 실측 편차 k=0에서 1.02px, 끝점에서 0.00px — 점 반지름보다 작아 육안 무해하지만,
  PC엔 하나뿐인 매핑이 모바일엔 둘이다. `endDeco`에 `seamX`/`coneR` 대신 `xAt`을 넘기면 해소된다.
- **`_fitBoxY`의 즉시반환 경로가 `[minY,maxY]`를 클램프하지 않는다** — `if (!ov(by)) return by;`가 계단 탐색 분기에만
  있는 범위 검사를 건너뛴다. `labelDy=-12`이고 끝점이 패널 상단이면 `_want`가 `padTop` 위 ~8px, `labelDy=14`이고
  하단이면 볼륨 패널로 ~5px 침범할 수 있다. PC도 같은 잠재 결함을 갖고 있으나 PC는 단일 패널이고 모바일은
  4단 적층이라 영향이 다르다. 실기기에서 패널 침범이 보이면 그때 고친다.
- **`frame()` 합성 순서를 지키는 테스트가 없다** — `screens/report.js`엔 테스트 파일이 없어 `resetLabels` 최선두·
  캔들→예측 순서가 주석으로만 지켜진다. DOM 하네스가 생기면 회귀 테스트를 붙일 것.
- v2 — 서버 지갑 원장 + 구글 로그인
- v3 — AdMob + SSV + Full 티어 → 프로덕션 출시
- v4 — Custom 티어 · 증거/신뢰 화면군

## 이월된 마이너 (Phase 0 리뷰)

- `api.js` `MIN_BARS[tf] || MIN_BARS["1day"]` — `||` 폴백. 미인식 주기가 가장 엄격한 하한으로 떨어지므로 안전 방향. 유지.
- `graph.js` `indicatorTypes()` 는 이름을 엔진과 대조하지 않는다 — `evalBlocks` 오라클 테스트로 보완됨(오타 시 price 통과를 잡음).
