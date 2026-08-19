# CLAUDE.md — map/ : 스쿱포지 & 스쿱보드 (MoneyScoop)

`map/`는 MoneyScoop 브랜드의 독립 분석 도구 **두 종**을 담는다. 순수 HTML·CSS·바닐라 JS, 빌드 도구 없음. **KB손해보험 VDI 포탈과 무관**(리브랜드된 별도 제품). 개요·실행법은 [`README.md`](README.md) 참조.

| 도구 | 파일 | 비고 |
|---|---|---|
| **스쿱포지 (Scoop Forge)** ★ | `forge.html` + `forge-core.js`(+`forge-api.php`) | 노드 전략보드 + 라이브 차트 통합 분석 도구. **분석 엔진의 관리·개선·검증이 이뤄지는 곳**(사용자 서비스가 아니다 — 아래 §⓪) |
| **머니스쿱 모바일 (MoneyScoop)** 🛑 **개발 중단(2026-08-19)** | **`mobile/`** 폴더 일습(`www/`·`test/`·`android/`·`sync-engine.mjs`) | 스쿱포지 **엔진을 공유하는** 하이브리드 앱(Capacitor). **사용자 서비스의 중심**(아래 §⓪) — UI·배포는 PC와 별개, 엔진·분석 결과·정보 수준은 PC와 같아야 한다. 백로그 [`mobile/docs/BACKLOG-mobile.md`](mobile/docs/BACKLOG-mobile.md) · 개편 원장 [`mobile/docs/rebuild/PROGRESS.md`](mobile/docs/rebuild/PROGRESS.md) · 실측 [`mobile/docs/phase0-measurements.md`](mobile/docs/phase0-measurements.md) |
| **스쿱보드 (Scoop Board)** | `map.html`(+`api.php`) | 자유 캔버스 노드 다이어그램 빌더 |
| **PotFlow** | **`potflow/`** 폴더 일습(`potflow.html`·`potflow-helper.py`·config·bat·썸네일) | 로컬 동영상 노드 재생 관리(PotPlayer). map.html 파생·로컬 헬퍼(Python) 전용. **상위 개발프로젝트와 완전 독립 트랙**(아래 주의). **2026-07-19 `map/potflow/`로 폴더 격리** — forge·map과 파일/배포 경로 불간섭(배포=`www/map/potflow/`). 헬퍼가 자기 위치(`ROOT`) 기준이라 이동에 경로 수정 불필요. 상세는 [`POTFLOW.md`](POTFLOW.md) |

> ⚠️ **PotFlow는 상위 개발프로젝트(스쿱포지·머니스쿱·vdiportal)와 무관한 별개 트랙이다.** 같은 저장소 `map/` 아래 있는 건 파일 위치일 뿐 — 목적·사용자·배포 대상이 전부 다른 개인용 로컬 도구. PotFlow 작업에 스쿱포지 백로그(`docs/BACKLOG.md`)·검증 관문·엔진 규율을 끌어오지 말 것. 상위 프로젝트 우선순위(랜딩·인증·결제)와 섞어 보고하지 말 것. 반대로 forge·map 작업 중 `potflow/`를 건드리지 말 것. 커밋 스코프는 `potflow`로 분리 유지. **potflow 백로그·이력은 별도 문서 [`potflow/BACKLOG.md`](potflow/BACKLOG.md)** — 두 백로그를 섞지 말 것. (2026-07-25 사용자 확인)

> 스쿱포지의 상세 구현 이력·규약은 방대하여 **프로젝트 메모리 `scoopforge-deploy.md`가 단일 출처**. 아래는 현행 요약.

---

# 🔗 공통 규율 — 제품 역할 · 엔진 공유 · 테스트 관문 · 브랜치

스쿱포지(PC)와 머니스쿱 모바일은 **`forge-core.js`·`forge-tools.js` 를 공유한다.** 배포는 갈라지지만 엔진은 하나다. 아래 규율은 두 제품 모두에 적용된다. (2026-08-10 확립 · ⓪은 2026-08-18 사용자 지시)

## ⓪ 제품 역할 — 사용자 서비스는 모바일, PC는 엔진의 자리

**사용자 서비스는 모바일 앱(웹 기반 하이브리드)을 중심으로 운영한다.** PC 버전(스쿱포지)은 사용자 서비스가 아니라 **분석 엔진의 관리·개선·버전 업그레이드**를 하는 곳이다 — 모바일이 쓸 분석 기법을 여기서 만들고, 재고, 검증 관문을 통과시킨다.

그래서 다음이 따라온다:

1. **분석 기법은 PC 에서만 만든다.** 새 지표·새 축·작도 개선은 `forge-core.js`·`forge-tools.js` 원본에서 시작해 백테스트·스코어카드 관문을 통과한 뒤 모바일로 간다. **모바일에 모바일 전용 분석 로직을 두지 않는다** — 두는 순간 "무엇이 검증된 것인가"에 답할 수 없게 된다.
2. **모바일은 PC 와 동일하게 분석되어야 한다.** 같은 엔진·같은 입력이면 같은 판정이 나와야 하고, 어긋나면 그건 이식 버그다(모바일 관문이 지표 수 불일치·미지의 blockType 을 잡는 이유).
3. **사용자에게도 동일한 수준의 정보를 준다.** 판정·확률·근거·정직 표기(기준선 병기·귀속 문구)는 모바일에서도 PC 와 같은 수준으로 제공한다. 모바일이라서 요약하거나 반올림하지 않는다.
4. **단, 정보의 양은 보상 차등에 따라 달라진다.** 모바일은 스쿱(소비 재화)이 있어 **정의된 개발 요건(단계)** 대로 노출량이 갈린다 — 지금은 기본 5지표·일봉 / 심화 32지표·일주월 / 전문 32지표+가중치. **달라지는 것은 양(무엇을 몇 개 보여주는가)이지 질이 아니다** — 같은 엔진, 같은 계산 규약, 같은 정직 표기 위에서 노출 범위만 단계로 갈린다. 잠긴 단계에서는 **무엇이 빠졌는지를 이름으로 적는다**(숨기지 않는다).
5. **PC 의 화면은 사용자 서비스 기준이 아니다.** PC 는 엔진을 다루는 작업대라 32종을 항상 열어 두고 과금도 없다 — 그 상태를 "모바일도 이래야 한다"의 근거로 삼지 말 것. 반대로 모바일의 단계 제한을 PC 에 가져오지도 말 것.

두 제품의 현재 차이(이용 방식·분석 절차·방법론)는 **`forge-scorecard.html` 의 웹↔모바일 비교표**가 단일 출처다. 모바일 개편 페이즈가 끝날 때마다 그 표(`PRODUCTS`·`PRODUCTS_ASOF`)를 갱신한다 — 규율은 [`mobile/docs/rebuild/PROGRESS.md`](mobile/docs/rebuild/PROGRESS.md) 불변 규율 6번.

## ① 테스트는 항상 `./tests/run.sh`

```bash
./tests/run.sh            # 전부 1545건 (forge-core 259 · forge-tools 81 · landing 28 · wallet 136 · wallet-dispatcher 296 · moneyscoop-mobile 745)
./tests/run.sh engine     # 엔진 + 모바일 1085건 — 엔진만 고쳤을 때
./tests/run.sh mobile     # 모바일 745건
```

**어느 한쪽만 돌리지 말 것.** 모바일 테스트는 `../../forge-core.js` 원본을 직접 `require` 하므로, 엔진 변경이 모바일을 깨뜨렸는지를 이 관문이 알려준다. `node --test forge-core.test.js` 만 돌리던 습관이 이 구멍을 만든다. 실패 시 종료코드 1.

- **화면을 건드렸으면 `cd mobile && node tools/gate-browser.mjs` 도 돌린다.** 모듈 테스트는
  모듈마다 독립 객체를 받으므로 브라우저 전역 충돌을 원리적으로 못 본다 — 1505건이 초록인
  채로 리포트가 100% 죽어 있던 사고(2026-08-18)가 그 구멍이었다. `all` 에 넣지 않은 이유는
  크로미움이 없는 환경에서 전량 관문이 통째로 죽지 않게 하기 위해서다.

## ② 엔진 변경 프로토콜

1. **원본에서만 수정한다** — `map/forge-core.js` · `map/forge-tools.js`. 모바일의 `mobile/www/vendor/` 는 **커밋하지 않는 생성물**이며 `sync-engine.mjs` 가 만든다(gitignore). 두 벌이 존재할 수 없는 구조다 — 절대 vendor 를 직접 고치지 말 것.
2. **`./tests/run.sh engine` 통과** — 양쪽이 같이 초록이어야 한다.
3. **모바일 쪽은 `cd mobile && npm run sync`** 로 vendor 갱신 후 빌드. `npm run cap:sync` 는 sync 를 앞에 물고 있다.
4. 지표를 추가·제거하면 `forge-core.indicatorCount` 와 `mobile/www/graph.js` 의 `MISSING` 목록이 함께 움직인다 — 모바일 테스트가 개수 불일치와 **엔진이 모르는 blockType**(오타 시 raw price 가 combine 에 주입된다)을 잡는다.

## ③ 브랜치 · 배포

- **다중 태스크 작업(SDD 계획서로 실행하는 것)은 브랜치 → `merge:` 커밋.** 단발 수정은 `main` 직접. 이 저장소의 기존 관행을 규칙으로 명시한 것.
- **배포는 공통일 수 없다.** PC(포지·보드·랜딩)는 `커밋+배포 한 세트` — cafe24 SFTP `www/map/`. **모바일은 스토어 릴리스라 이 규칙이 적용되지 않는다** → `커밋+푸시 한 세트, 배포는 별도 릴리스 트랙`.
- **`mobile/` 은 cafe24 에 업로드하지 않는다.** 서버로 가는 건 PC 정적 파일 8종 + `forge-api.php`(하단 §스쿱포지 파일 참조) — 그리고 아래 §④ 의 지갑 서버 파일 3종.

## ④ 지갑(Wallet) 배포 세트 — Scoop 원장·AdMob SSV (Phase 8 계열)

모바일 UI(`mobile/www/`)는 cafe24 에 안 올라가지만, 그 UI가 말을 거는 **지갑 서버 파일 3종은 `map/` 루트에 있고 cafe24 에 올라간다.** 이 문서 어디에도 그 세트가 안 적혀 있던 탓에, 이 라운드에서 새 파일(`wallet-ssv.php`)이 추가됐는데도 배포 절차가 없었다 — 부분 배포는 조용히 죽지 않고 시끄럽게 죽는다: `wallet-ssv.php` 만 빠지면 AdMob 콘솔에 등록한 SSV URL 이 404 로 막혀 아무도 보상을 못 받고, `wallet-lib.php` 가 옛 버전이면 새 API 가 `Call to undefined function w_ad_grant()` 로 500 을 내고 Google 은 그 콜백을 계속 재시도한다.

- **동반 배포 필수**(같이 올리고 같이 검증한다): `wallet-ssv.php`(AdMob SSV 콜백 수신, Phase 8d 신규) · `wallet-lib.php`(원장 — 계정·spend·checkin·광고 지급 로직) · `wallet-api.php`(HTTP 디스패처). `wallet-auth.php`(구글 로그인)는 이번 라운드엔 안 바뀌었지만 세트 밖으로 빼지 말 것 — 다음에 손대면 이 셋에 합류한다.
- **배포 불가침**(서버 생성·사용자 데이터 — 절대 덮어쓰지 않는다): `<data>/wallet.db`(SQLite 원장) · `wallet_secret.txt`(HMAC 비밀키) · `ssv_keys_cache.json` · `ssv_keys_attempt`(AdMob 검증 키 캐시) · `ad_units.json`(광고 유닛 설정). forge 쪽 불가침 목록(`forge_*`)과 같은 원칙 — 정적 파일 8종 + wallet 3종 외엔 절대 손대지 않는다.
- `map/mobile/**` 는 위 ③에 이미 적힌 대로 cafe24 에 절대 안 올라간다 — 지갑 서버 파일 3종만 별개로 올라간다는 뜻이지, mobile 전체가 서버 배포 대상이 됐다는 뜻이 아니다.
- **지갑 배포 전엔 반드시 `./tests/run.sh concurrency` 를 먼저 돌린다** — IP 상한·비밀키 생성·계정 mkdir 동시성 회귀라 `all`에 안 낀다(느려서), 그래서 사람이 기억해서 불러야 하는 유일한 관문이다. wallet-lib.php·wallet-api.php·wallet-ssv.php 를 고친 뒤 이 스위트를 건너뛰고 배포하지 말 것.
- **`ad_units.json` 부재 = 광고 기능 전체 꺼짐(fail-open 이 아니라 fail-closed)** — 이게 이 세트의 킬 스위치다. 코드(위 3종)를 먼저 올려 서버가 살아있는지 확인한 뒤, 마지막에 `ad_units.json` 을 올린다(또는 문제가 생기면 그 파일부터 내린다). 코드와 설정을 동시에 올리면 500 을 낸 원인이 코드인지 설정인지 구분이 안 된다.

## ④-2 화면을 짓거나 고치는 태스크는 **시안을 근거로 삼는다**

**2026-08-19 판정 — P1a·P1b 가 이 규율 없이 진행돼 실패한 결과다.** 두 페이즈는
정보 설계서(`docs/superpowers/specs/2026-08-18-moneyscoop-p1-design.md`)만 보고 리포트 화면을
지었다. 그 문서는 **블록·순서·정직 표기만 규정하고 시각 규격은 한 줄도 없다**(px·여백·타이포·
폰트·크기 언급 0건, 실측). 게다가 태스크 브리프가 매번 *"기존 `build*` 패턴을 그대로 따르라"* 고
지시해 **옛 디자인을 구조적으로 보존**했다. 사용자가 시안을 제공했는데도 결과물은 개편 전 화면의
연장이 됐다 — 프로젝트 이름이 "앱 개편"인데.

- **시안 원본은 `mobile/docs/design_handoff/`** 다(화면별 HTML · 동선 · 여정 · 프로토타입).
  보조 문서: `mobile/docs/DESIGN-BRIEF.md`(시안 제작용 기능 분해도) · `DESIGN-INVENTORY.md` ·
  `design-audit.md`. **화면을 만드는 태스크의 브리프는 이 경로를 반드시 인용한다.**
- **정보 설계서만 보고 화면을 짓지 않는다.** 정보 설계서는 "무엇을 말할 것인가"를 정하고,
  시안은 "어떻게 보일 것인가"를 정한다. 둘 다 있어야 화면이 선다.
- **"기존 패턴을 따르라"는 지시는 시각 재작업 태스크에 쓰지 않는다.** 그 문장은 일관성을
  지키는 대신 **개편 자체를 무효화**한다. 새 화면은 시안을 따르고, 어긋나는 기존 관례는
  그 태스크가 바꾼다.
- **리뷰도 시각을 본다.** 지금까지 리뷰 지시문의 시각 항목은 전부 *금지 사항*(좌측 컬러 라인
  금지·헥스 리터럴 금지·터치 44px)뿐이고 **긍정적 디자인 목표가 없었다.** 화면 태스크의 리뷰는
  **시안과 나란히 놓고** 여백·타이포 위계·정보 밀도가 시안 의도와 맞는지 판정한다.
- 온보딩(P4)은 이 절차를 밟았다 — 시안 대조 감사 → 전용 재설계 설계서 → 화면 통째 재작성.
  그래서 온보딩만 시안 느낌이 난다. **그 순서가 정본이다.**

## ⑤ `mobile/www/**` 문법 하한 — ES5 아님, 확정 ES2017

**"ES5 만" 규칙은 폐기됐다(2026-08-18 컨트롤러 판정, P1a Task 1).** 스쿱 시리즈 정적 사이트(구형 브라우저 대응)에서 상속된 규칙이었을 뿐, 이 앱의 런타임에서 유도된 게 아니었다 — `draw-panels.js`·`draw-layers.js`·`draw-preds.js` 가 이미 이 규칙을 161줄 어긴 채 배포돼 있었고 아무도 몰랐다.

실제 하한은 `mobile/android/variables.gradle` 의 `minSdkVersion 24`(Android 7.0 Nougat)다. 이 지점부터 Android System WebView 는 OS 와 분리돼 Play 스토어로 자동 업데이트되는 Chromium 기반 컴포넌트다(`mobile/docs/phase0-measurements.md` 가 이미 "Chrome 과 WebView 는 같은 Chromium/V8" 전제로 실기기 Chrome 150 을 측정에 썼다). `@capacitor-community/admob`(Google Play 서비스 하드 의존)이 이미 Play 스토어 보유를 전제하므로 그 자동 업데이트 경로도 전제된다. **확정 안전선은 ES2017**(async/await 포함, Chrome 55·2016-12) — 이 셋(minSdk·Capacitor 자체 요구·admob 의 GMS 의존)이 판정을 지탱하는 1차 근거다. **정황(1차 근거를 뒤집진 않지만 그 자체로는 이중검증이 아님)**: async/await 는 `scan.js` 1개 파일에 실제 문법으로 이미 배포돼 있다(`wallet.js` 에는 `await` 문자열이 나오지만 61번 줄 주석일 뿐 실제 문법은 아니다 — 확인 없이 "14개 파일이 쓴다"고 적었던 것은 오류였다, 2026-08-19 리뷰 정정). const/let/화살표(ES2015)는 실제로는 `draw-panels.js`·`draw-layers.js`·`draw-preds.js` 3개 파일에서만 코드로 쓰인다 — 원 브리프가 위반으로 지목한 바로 그 세 파일이며, 나머지 파일의 grep 일치는 한국어 주석의 백틱 코드 표기(예: `` `IND_TIERS` 다``)나 문자열 리터럴이었다. 관문은 `mobile/test/syntax-floor.test.mjs` — ES2017 보다 확실히 나중이면서 지금 안 쓰는 문법만(옵셔널 체이닝·null 병합·논리 대입·private 필드·`Object.hasOwn`·`groupBy`·배열 비파괴 복사 메서드) 금지한다.

## ⑥ `mobile/` 의존성 정책 — "새 npm 의존성 금지"는 공식 Capacitor 플러그인을 막지 않는다

이 저장소 전반의 "빌드 도구·외부 라이브러리 금지"(위 스쿱포지·스쿱보드 규율과 같은 문장)를 모바일의 `package.json` 에도 그대로 적용하면 **네이티브 앱을 못 만든다** — Capacitor 자체가 npm 패키지고(`@capacitor/core`·`@capacitor/android`·`@capacitor/cli`), 하드웨어 기능(광고·백버튼 등)은 각각 별도 공식 플러그인 npm 패키지로 온다. 이 규율이 실제로 막으려는 것은 **프런트엔드 빌드 파이프라인**(webpack/babel/번들러)과 **`www/**` 안에서 로직을 대신 짜주는 프런트엔드 라이브러리**(jQuery·React 류)다 — `www/**` 는 여전히 순수 HTML·CSS·바닐라 JS(classic `<script src>`, 빌드 없음)이고 이 원칙은 안 바뀐다.

- **판정(선례 2건)**: `@capacitor-community/admob` 8.1.0(2026-08-16, 광고 보상) → `@capacitor/app` 8.1.1(2026-08-18, P1a Task 7 — 하드웨어 뒤로가기 배선). **공식 Capacitor 네임스페이스(`@capacitor/*`) 또는 Capacitor 공식 커뮤니티 플러그인(`@capacitor-community/*`)은 이 금지의 대상이 아니다** — 네이티브 OS 기능에 접근하는 것이 존재 이유고, 대체 경로가 없다(하드웨어 백버튼을 순수 JS/DOM 이벤트만으로 잡을 방법은 없다 — `mobile/www/shell.js` 의 배선 주석이 이유를 실측으로 남겼다).
- **여전히 금지**: 위 두 네임스페이스 밖의 npm 패키지(유틸리티 라이브러리·폴리필·상태관리 등), 빌드 도구·번들러, `www/**` 안에서 실행되는 프런트엔드 프레임워크.
- **버전은 정확히 고정한다**(`--save-exact`, 캐럿 없음) — admob·app 둘 다 `package.json` 에 정확한 버전 문자열(`"8.1.0"`·`"8.1.1"`)로 박혀 있다. `@capacitor/core`(`^8.5.0`)와 메이저가 어긋나면 네이티브 빌드가 깨지므로 peer 요구사항(`>=8.0.0` 류)을 확인하고 고른다.
- 새 플러그인을 더할 때: `npm install`(package.json 갱신) → `npx cap sync android`(네이티브 Gradle 배선 — `android/app/capacitor.build.gradle`·`android/capacitor.settings.gradle` 재생성, 둘 다 "DO NOT EDIT" 생성물이지만 커밋 대상) → `./gradlew assembleDebug` 로 실제 빌드 확인까지가 한 세트. 절차 상세는 `mobile/docs/ANDROID-BUILD.md`.

---

# 🔥 스쿱포지 (Scoop Forge) — 플래그십

**`forge.html`(UI+캔버스 작도) + `forge-core.js`(DOM-free UMD 분석엔진)**. 노드로 기술적 분석 전략을 조립→실행하면 예측 경로·합성 시그널·국면을 산출하고, 예측 콘·살아있는 그래프 맥동을 그린다. 좌=노드 전략보드, 우=라이브 차트.

## 파일

- `forge.html` — 마크업 + `<link>`/`<script src>` 참조만(현 241줄). **UI는 소스순서 4분할**: `forge-state.js`(상태·`BLOCK_DEFS`·`IND_TIERS`·서버·`boot`·CRUD) → `forge-ui.js`(레일·보드·`renderParams`·HUD·`boardInit`·`seedDefaultStrategy`) → `forge-draw.js`(`FC_*`·`_syncChartColors`·`fcDraw*`·`EV_COLORS`/`INDICATOR_INFO`·엘리어트/피보 레이어) → `forge-tools.js`(차트 드로잉 — 추세선·평행채널·수평선·수직선·등락폭/기간 재기·마그넷, 앵커=(날짜,가격). **UMD·단위테스트** `node --test forge-tools.test.js`) → `forge-app.js`(`renderChart`·`analysisSteps`·`nodeExpert`·`THEMES`/`applyTheme`·`playAnalysis`·`runForge`·부팅 IIFE). 스타일은 `forge.css`. **여러 classic script가 전역 스코프 공유** — 로드 순서(core→state→ui→draw→tools→app) 고정, `defer`/`async` 금지, 중복 최상위 선언 금지. `forge-core.js` — 분석 엔진(**UMD**: 브라우저 `window.ForgeCore` + node `module.exports`. `node --test forge-core.test.js`, 현재 259케이스). `forge-api.php` — 서버 저장 + 티커 OHLC 프록시. `forge-guide.html` — 엔진 작동원리 설명서.
- **동반 배포 필수**(상대 `<script src>`/`<link>` 동위치): `forge.html` + `forge.css` + `forge-core.js` + `forge-state.js` + `forge-ui.js` + `forge-draw.js` + `forge-tools.js` + `forge-app.js`. 하나라도 빠지면 동작 불가. `forge-core.test.js`·`forge-tools.test.js`·`forge-tools.sweep.js`는 배포 제외.
- **배포 불가침**(서버 생성·사용자 데이터): `forge_data.json`·`forge_images.json`·`forge_jobs.json`·`forge_td_key.txt`·`forge_ohlc_cache_*.json`. 배포는 위 8개 정적 파일 + `forge-api.php`만.
- **단독 문서 페이지**(의존 없음 · 개별 배포 가능): `forge-guide.html`(작동원리) · `forge-scorecard.html`(검증 성적) · **`app-spec.html`(앱 화면 요건정의)** · **`design-kit.html`(시안 작업 재료 — 연결도·컴포넌트·표기·카피·더미)**. 뒤 둘은 2026-08-19 신설이며 서로 상호 링크된 짝이라 **같이 올린다**. 위 8종 세트와 달리 동반 업로드 제약은 없다. 배포 `www/map/`, URL `.../map/app-spec.html` · `.../map/design-kit.html`.

## 4패널 구성 (지칭 규칙 — 하단 §"4패널" 상세)

1패널=**종목**(워치리스트 `.forge-side`) / 2패널=**티커**(중앙 보드 `.board-pane`·`.wboard` — 타임프레임 매트릭스·예측시점별·오실레이터 서브패널·지표신호 판정) / 3패널=**지표조합**(지표 레일 `.ind-rail`) / 4패널=**차트**(`.chart-pane` — 예측선 1/2/3차).

## 지표 시스템 (32종)

- `BLOCK_DEFS`에 지표 정의 → 노드로 캔버스 배치. **`IND_TIERS` 4등급(합 32종 — `forge-core.indicatorCount`와 동기 필수)**: Lv1 핵심 5(ma·macd·rsi·bollinger·volume) / Lv2 주요 8(trend·adx·stochastic·fib·ichimoku·pivot·psar·gann) / Lv3 보조·전문 11(vwap·supertrend·atr·volumeprofile·structure·keltner·donchian·cci·williams·aroon·mfi) / Lv4 고급·심화 8(elliott·smc·cycle·phasefold·roc·ao·cmf·pattern). 최근 추가 12종(`NEW_INDICATORS`)은 레일에 `new` 배지.
- **지표당 통합 패턴**: `forge-core.js`에 `analyzeX`(순수·방향 `bias∈[−1,1]`) + 필요시 `xSeries`(combine용 −1..1) + `xSteps`(시연 서술) → `evalBlocks` 케이스 → `run()` **단일 드리프트항**(`bias × trendProfileForTF(tf).trendScale × cap`, `_drifts` 배열 합산·±0.28 캡) → `forge.html` 작도 + `analysisSteps` + `nodeExpert`. **forge.html 16지점 등록**(BLOCK_DEFS·IND_TIERS·GAUGE_TYPES·`_an`프레임캐시래퍼·`_nodeBias`·EV_COLORS/LABEL·TUNE_TYPES·seedDefaultStrategy·hero작도 dispatch·playAnalysis indNodes 등).
- **규약**: 드리프트 이중계상 금지·cap 보수적(≤.08)·반드시 `trendProfileForTF` 경유. 오버레이(pivot·psar·keltner·donchian)=combine `zeros`(방향은 드리프트), 오실레이터=실 `xSeries`. 파라미터 있는 지표는 `_an` 래퍼 캐시키에 `JSON.stringify(opts)` 포함(안 하면 stale). **mfi·cmf 드리프트는 그래프 volume 노드(`_vn`/`values[_vn.id]`) 실거래량 스레딩 필수**(raw data엔 volume 없음).
- **작도**: 채널/밴드 오버레이(keltner·donchian)는 **per-bar 움직이는 밴드**로(pivot만 정적 S/R). 신규 오실레이터는 기본 hero 배지(`_drawXLayers` = 스토캐스틱 선례), **핵심 3종(cci·williams·mfi)만 2번 패널에 RSI 동형 서브패널 그래프**(`fcDrawCci/Williams/Mfi`·`_SUBPANEL`).

## 편집창 (`renderParams` → `#paramPanel`)

파라미터 numRow + **도구 안내**(`INDICATOR_INFO` 32종 목적·정의·해석법) + **추천값 세팅**(BLOCK_DEFS 기본값 리셋) · **저장**(markDirty 영속, 재분석은 웹분석 별도) 버튼. 지표 노드에만 표시(구조/데이터 블록 제외).

## 실행 / 저장

**웹분석**(`runEngine` 즉시계산) / **시뮬레이션**(`playAnalysis` 작도 애니메이션·reveal 게이트). 티커 노드로 실 OHLC fetch(`forge-api.php` 프록시 — TwelveData → Yahoo Finance(폴백) / Naver(국내)). **Stooq는 2026-08-06 봇 차단(JS 프루프-오브-워크)으로 사용 불가 확인 → Yahoo로 교체**(무키·UA 필수). 서버(`forge-api.php`)·로컬·JSON 내보내기로 영속. 자동저장은 `markDirty`(디바운스).

---

# 🧩 스쿱보드 (Scoop Board)

**다이어그램 빌더 (IT기획파트)** — 자유 캔버스 노드 다이어그램 빌더(GitMind 스타일). 단일 HTML 파일(`map.html`), 빌드 도구 없음, 바닐라 JS. **2026-07-09 공식 리브랜드**: 구 "스쿱보드 · Scoop Board by MoneyScoop"에서 Scoop/MoneyScoop 브랜드를 전면 제거하고 사내 도구명 "다이어그램 빌더"로 확정. 소스에 Scoop/MoneyScoop/스쿱 문자열·외부 URL 없음(내보내기본 포함).

- **정체성**: 머니스쿱(MoneyScoop)의 부가 유료 서비스로 독립. **KB손해보험과 무관**(과거 VDI 접속흐름 도구에서 리브랜드). [[scoopsignal-deploy]]·ScoopSignal과 같은 MoneyScoop 브랜드 패밀리.
- **브랜드**: 워드마크 `다이어그램 `+**`빌더`**(골드 em) + 하단 소제목 `IT기획파트`, 헤더 노드-다이어그램 글리프 마크. 홈 링크 → `map.html`(현재 페이지). `<title>`=`다이어그램 빌더` 고정(서버·로컬 모드 무관 불변 — 모드별 타이틀/워드마크 전환 없음). **외부 URL·구 브랜드어 금지.**
- **테마**: ScoopSignal과 공통 팔레트 — 부드러운 골드 `--gold:#e8b463`, 네이비 잉크 `--bg:#0b0f14`, 보조 `--eth:#8a92b2`, bull/bear `#46c28e`/`#e06a6a`.
- **기본 다이어그램**: 당분간 기존 노드(VDI 접속흐름) 유지 — 추후 중립 예시로 교체 예정.

## 파일

- `map.html` — 전부 들어있는 단일 산출물. HTML+CSS+JS+내장 이미지(빌트인 썸네일 base64) 한 파일.
- `api.php` — 서버 저장 API. 캔버스 CRUD(replace/upsert/delete/reorder/meta) + 이미지 분리저장(putimg/images) 처리.
- `map_data.json` — 서버 관리 데이터(canvases/meta). **배포 시 절대 덮어쓰지 말 것** — 사용자 최신 데이터.
- `map_images.json` — 사용자 업로드 이미지 저장소(imgId → dataURL). **배포 불가침**(빌트인 이미지는 `map.html` 내장이므로 제외).
- 외부 의존성: Pretendard 폰트(CDN `cdn.jsdelivr.net`) 한 개뿐. 그 외 라이브러리 없음.
- 열기: 파일을 브라우저로 직접 열면 동작(메모리 모드). 서버 기능은 `api.php` 호스팅 필요.

## 작업 원칙 (이 프로젝트 관례)

- 바닐라 JS, 빌드 툴 없음, 단일 HTML 파일 유지. 프레임워크/번들러 도입하지 말 것.
- UI 텍스트는 한국어. 골드(`--gold`) 액센트 토큰 사용.
- **색 테마(`THEMES`, forge.html)**: 다크 5종(navy·midnight·teal·purple·orange)+라이트 2종(paper=밝은UI+다크차트·daylight=완전밝은). **정책: 각 테마가 완전 토큰 세트 지정**(bg/panel/surface/raised·line/edge·ink/eth/muted/faint·gold/gold-dim·hover/scrim/grid/chart-bg) — `applyTheme`가 이전 인라인 var를 지우지 않으므로 **모든 테마가 같은 키 전부 지정 필수**(누락 시 테마 전환 간 leak). bull/bear·EV_COLORS·FC_BULL/BEAR는 테마 무관 상수. 차트 캔버스는 `--chart-bg` 배경 + `_syncChartColors()`(chart-bg 밝기로 격자 명암·골드는 --gold 추종). 하드코딩 색은 `--hover`(호버)·`--scrim`(딤)·`--grid`로 토큰화. 좌측 accent line 금지.
- 상태는 메모리 보관. 영속화는 서버(`api.php`) 또는 JSON 내보내기/불러오기 (이유는 아래 "제약" 참고).
- 동작하는 프로토타입 우선. 과한 추상화 지양.

## 데이터 모델 (`<script>` 상단)

```js
state = {
  nodes:  [{ id, x, y, title, desc, thumb:{imgId,label}|null,
             type:"full"|"mini"|"icon",  // full=기본 카드, mini=작은 카드, icon=아이콘 전용
             iconId:string|null,         // ICONS 상수의 키. type==='icon'일 때 사용
             bg:string|null }],          // 노드 배경색(NODE_COLORS). null=기본(테마색)
  //        thumb.imgId = IMAGES 맵의 키. 빌트인 id('vdi_login' 등) 또는 사용자 업로드 id.
  edges:  [{ id, from, fromSide, to, toSide,   // *Side = "left"|"right"|"top"|"bottom"|"auto"
             style:"solid"|"dashed",     // 실선 / 점선
             arrow:bool,                 // true=화살표 머리 표시
             width:1|2|3,                // 선 굵기 3단계(EWIDTHS, 미지정=2)
             route:"curve"|"ortho",      // **미지정/ortho=직각(기본)**, "curve"만 곡선(베지어)
             label:string|null }],       // 연결선 라벨(중앙 pill). null=없음
  //        fromSide/toSide="auto" → sidesOf(e)가 두 노드 위치 기준 최단 연결면 동적 계산
  groups: [{ id, nodes:[nodeId...], title }],
}
view = { tx, ty, scale }      // 캔버스 팬/줌
sel  = [nodeId...]            // 선택된 노드들
selEdge = edgeId | null       // 선택된 연결선(1개)
IMAGES  = { [id]: dataURL }   // 빌트인(HTML 내장) + 사용자 업로드(api.php ?images=1 로드)
TOOLBAR = { snap:bool, edgeStyle:"solid"|"dashed", edgeArrow:bool, selectMode:bool }
          // 전역 작성 도구 상태. saveMeta()로 서버 meta.toolbar에 영속, exportJSON에 포함.
          // selectMode = 영역 선택(드래그=마퀴). 영속됨.
NODE_COLORS = [null,...6色]   // 노드 배경색 팔레트(첫 항목 null=기본)
EWIDTHS = { 1:1.6, 2:2.4, 3:3.8 }  // 엣지 굵기 단계→stroke-width(px)
undoStack/redoStack, histBase  // 되돌리기/다시실행 스택. snapState()=_접두 필드 제외 JSON 스냅샷
storeMode = "server"|"local"   // 저장 대상. 'local'=localStorage(diagboard_doc/_imgs/_mode; 구 scoopboard_* 키는 부팅 시 1회 이관). 브랜딩/타이틀은 모드 무관 동일. 전환 시 docStamp 비교로 최신본 유지
ICONS   = { [id]: string }   // 아이콘 id → 인라인 SVG 내부 마크업(path/shape 문자열). 현재 20종
```

- 좌표는 모두 **월드 좌표**. 화면 좌표 변환은 `worldPt(clientX,clientY)`.
- `nodes`/`groups`는 `render()`에서 DOM 재생성, 텍스트 편집은 `focusout`에서 state에 반영(재렌더 없음).
- 노드 높이 `n._h`는 `measure()`가 DOM에서 읽어 캐싱(엣지/그룹 좌표 계산에 사용).
- **`thumb.imgId`** 참조 방식: 렌더 시 `imgSrc(id)`로 `IMAGES` 맵에서 dataURL 조회. 이전 내보내기 포맷(`thumb.src` 인라인)은 import 시 imgId 없이 렌더 → 썸네일 공백(graceful degradation).

## 핵심 함수 맵

| 영역 | 함수 |
|---|---|
| 렌더 | `render()` → `measure()` → `paint()` → `applySel()` → `applyView()` |
| 그리기 | `paint()` = 엣지(`ew` 보이는선 + `eh` 히트영역) + `layoutGroups()` + `drawEhud()` + `drawNhud()` |
| 엣지 기하 | `edgeGeo(e)`(curve=베지어 / ortho=`routeOrtho`(카드회피 A\*)→실패 시 `orthoPath` 폴백→`cleanPts`+`polyPath`), `routeOrtho`/`segHitsRects`(장애물 회피), `anchor`, `nearestSide`, `centerOf`, `sidesOf`(auto 최단면), `DIR` |
| 엣지 스타일 | `paint()`에서 `e.style==='dashed'`→`stroke-dasharray`, `e.arrow`→`<marker>`, `e.width`→`EWIDTHS`. 엣지 HUD(`drawEhud`)에서 삭제/방향/실선점선/화살표/굵기/**라우팅(곡선·직각)**/**라벨** 토글 |
| 엣지 라벨 | `drawLabels()`(`#elabels`에 `.elabel` pill, paint마다), world `focusout`/`[data-elabeladd]`로 `e.label` 저장·생성, 빈 값→제거 |
| 노드 배경색 | `drawNhud()` — 단일 선택 노드 위 `.nclr` 색상 팝오버(`NODE_COLORS` 스와치). `world` click `[data-bg]` → `n.bg` 설정 후 `render()` |
| 노드 판정 | `nodeAt(pt)` — 좌표로 노드 탐색(연결 드롭/하이라이트에 사용, elementFromPoint 안 씀) |
| 노드 타입 | `nodeHTML(n)` — `n.type`('full'/'mini'/'icon') 분기 렌더. `addChildMini/addSiblingMini` = mini 단축 생성, `addMiniCenter` = 캔버스 중앙에 mini 추가 |
| 포인터 | `stage.pointerdown` 디스패치 → `startPan/startMarquee/startLink/startEndpoint/nodePointerDown` → `onMove/onUp` |
| 스냅 | `onMove`에서 `TOOLBAR.snap` 활성 시 다른 노드에 x/y 정렬 스냅 + `#snapV`/`#snapH` 가이드선 표시 |
| 노드 편집 | `world` 위임: `click`(del/rmthumb/그룹·엣지 버튼), `focusout`(title/desc/그룹 라벨) |
| 추가/연결 | `makeNode(x,y,title,type,iconId)`, `addEdge(from,fromSide,to,toSide)`, `addSibling/addChild/addParent` |
| 툴레일 | `renderToolbar()` — 팔레트 버튼 상태(영역선택·자석 on, `.stage.selmode` 커서). `toggleSnap` / `toggleSelectMode`(→`TOOLBAR.selectMode` 영속) → `saveMeta()`. (선/화살표 토글은 팔레트에서 제거 — 엣지 HUD에서 처리) |
| HUD 툴바 | `drawEhud()`(`.ebar`)·`drawNhud()`(`.nbar`) — 라벨형 미니 툴바(아이콘 `ICO.*` + 한글 라벨). 엣지: 삭제/방향/실선점선/화살표/굵기. 노드: 상위/하위/삭제 + 색상 스와치 |
| 4점 자석 | `portSnap(n,pt)`(가장 가까운 포트, 중앙부 `auto`), `snapAt(pt,excl)`(DOM무관 계산), `hi()`(흡착+포트 하이라이트 `.linkhover`/`.snaptarget`), `clearLinkHi()` |
| 캔버스 배경 | `applyCanvasBg(bg)`·`setCanvasBg(bg)`·`renderBgPop()`·`toggleBgPop()`, `CANVAS_BGS`. loadCanvas/writeBackActive에서 `canvas.bg` 동기화 |
| 정렬·배포 | `alignSel(mode)` — 선택 2개↑ 좌/우/cx·상/하/cy 정렬, dh/dv 등간격(gap 기준). `drawNhud`가 다중선택 시 `.abar`(8버튼) 렌더. `ALI`(채움 아이콘) |
| 내보내기 | `buildSVG()`(상태→벡터 SVG: 노드 rect+텍스트 wrap·아이콘·썸네일 `<image xlink:href>`, 엣지 path+라벨, 그룹), `exportSVG()`/`exportPNG()`(SVG→Image→canvas→toBlob, 라이브러리 없음·타인트 없음), `exportJSON()`. 헤더 `내보내기 ▾` → `.menupop`(`toggleExportPop`/`closeMenus`) |
| 아이콘 | `ICONS`(20종 SVG path 상수), `iconSvg(id)` — path→SVG 문자열, `renderPalette()` — 팔레트 그리드, `addIconCenter(iconId)` — 아이콘 노드 추가 |
| 정렬/뷰 | `autoLayout('h'|'v')`(레이어 배치), `fitView()`, `zoomBy(f)` |
| 되돌리기 | `recordHistory()`(markDirty 안에서 호출, 변경 없으면 dedup), `undo()`/`redo()`, `resetHistory()`(loadCanvas마다), `snapState()`/`applySnap()`. 키 `Ctrl+Z`/`Ctrl+Shift+Z`·`Ctrl+Y`, 헤더 `↶`/`↷` 버튼(`updateUndoBtns`) |
| 입출력 | `exportJSON()`(toolbar 포함), 불러오기(`impFile` change — toolbar 복원), `resetAll()` |
| 서버 저장 | `boot()`(서버·로컬 최신 수렴), `loadCanvas(id)`, `writeBackActive()`, `markDirty()`, `saveMeta()`(toolbar 포함), `persistDoc()`(활성 스토어 통째 기록) |
| 저장 모드 | `setStoreMode(m)`(서버↔로컬, 최신본 유지), `applyStoreMode()`(body.local·탭제목·세그), `adoptDoc(doc)`, `docStamp(cs)`, `localLoad/localSaveDoc/localSaveImgs/localLoadImgs`, `lsGet/lsSet`(try/catch), `metaObj()` |
| 캔버스 관리 | `switchCanvas(id)`, `newCanvas()`, `renameCanvas(id,title)`, `deleteCanvas(id)`, `renderSidebar()` |
| 이미지 | `imgSrc(id)`, `putImg(id,dataURL)`, `downscaleImage(src,cb)`, `loadImages()` |
| 기타 | `zoom(id)`(라이트박스), `toast(msg)`, `toggleSide()`(사이드바 접기) |

## 서버 저장 / 캔버스 관리

### 서버 문서 구조 (`map_data.json`)

```js
doc = {
  canvases: [{ id, title, nodes, edges, groups, view, bg, updated }],  // bg=캔버스 배경색(CANVAS_BGS, null=기본)
  meta: { library: [...], activeId: "..." },
  _rev: 0   // 충돌 감지용 리비전
}
```

### op API (`api.php` POST `{op, ...}`)

| op | 동작 |
|---|---|
| `replace` | 전체 문서 교체(내보내기/불러오기용) |
| `upsert` | 단일 캔버스 삽입·갱신(`{canvas}` 페이로드) |
| `delete` | 캔버스 삭제(`{id}`) |
| `reorder` | 캔버스 순서 변경(`{order:[id...]}`) |
| `meta` | library/activeId만 갱신(`{meta}`) |
| `putimg` | 사용자 이미지 1건 저장(`{id, src}` — 각 <128KB) |

GET (파라미터 없음) — `map_data.json` 반환(없으면 `null`). GET `?images=1` — `map_images.json` 반환(사용자 이미지 전체). GET `?check=1` — 쓰기 키 유효성.

### 자동저장

편집(노드·엣지·뷰 변경) 시 `markDirty()` 호출 → 디바운스 후 `writeBackActive()` → `upsert` POST. 저장 상태는 UI에 `● 저장됨`(로컬 모드 `● 로컬 저장됨`) / `● 저장 중…` / `● 오프라인` 으로 표시.

### 서버 / 로컬 저장 모드 (`storeMode`)

헤더 `서버 | 로컬` 세그(`#storeSeg`)로 전환. `storeMode` 전역(선택은 `scoopboard_mode`에 영속). **로컬 모드는 저장 대상이 localStorage**(`scoopboard_doc`=canvases+meta, `scoopboard_imgs`=사용자 이미지)로 바뀌며 **서버에 아무것도 쓰지 않음**. `markDirty`/`saveMeta`/`putImg`/`persistDoc`·캔버스 관리·`resetAll`·import가 모두 `storeMode` 분기.
- **최신본 유지(핵심)**: `setStoreMode(m)`가 `writeBackActive()` 후 메모리 `docStamp` vs 대상 스토어 `docStamp`(`canvas.updated` 최댓값, ISO 문자열 비교) 비교 → 메모리가 같거나 최신이면 **메모리를 대상에 채택**, 대상이 더 최신일 때만 확인 후 `adoptDoc`. 이후 `persistDoc()`로 유지된 내용을 활성 스토어에 수렴.
- **부팅 수렴**: `boot()`가 서버·로컬 두 스토어를 모두 읽어 **`docStamp`가 더 최신인 쪽을 채택**하고, 선택본이 활성 스토어와 다르면 활성 스토어에 기록 → 새로고침·재방문에도 최신본 유지.
- **브랜딩은 모드 무관 고정(2026-07-09 리브랜드로 변경)**: 과거 로컬 모드에서 워드마크 숨김+타이틀 `보드`로 바꾸던 동작은 제거됨. `applyStoreMode()`는 이제 저장 세그·배지만 갱신하고 타이틀/워드마크는 서버·로컬 동일하게 `다이어그램 빌더` 고정.

### 인증

`map_key.txt`가 존재하면 POST 요청 `X-Write-Key` 헤더를 검증(불일치 403). fail-open — 파일 없으면 쓰기 개방. 추후 로그인 UI 예정.

### Graceful Degradation

`api.php`에 접근 불가(`file://` 직접 열기, 서버 오류 등) → `SERVER_OK = false` → 메모리 모드로 폴백. 모든 편집·다중 캔버스 기능은 동작하나 새로고침 시 초기화. UI 좌상단에 `● 오프라인` 배지 표시. JSON 내보내기로 수동 백업 가능.

### 이미지 분리저장 레이어

- **빌트인 이미지** (`vdi_login`, `vdi_dash`, `myportal`, `myaccess`): `map.html` 내에 base64 dataURL로 내장. `IMAGES` 맵에 직접 등록.
- **사용자 이미지**: 드롭/업로드 시 `downscaleImage(src,cb)` → 최대 1000px·JPEG(품질 0.82부터 <120KB 될 때까지 하향) → `putImg(id, dataURL)` → `POST {op:'putimg', id, src}` 로 `map_images.json`에 개별 저장. 로드 시 `loadImages()` → `GET ?images=1` → `IMAGES` 맵에 병합.
- `node.thumb = {imgId, label}` — 실제 dataURL은 저장되지 않음. 렌더 시 `imgSrc(imgId)` 로 `IMAGES`에서 조회.
- **cafe24 POST 128KB 상한 회피**: 이미지를 개별 `putimg` op로 분리하면 각 POST 본문이 <128KB 유지됨. 캔버스·메타 JSON에는 `imgId` 참조만 포함되어 자동저장 POST도 128KB 미만 유지.

## 인터랙션 (현재 구현됨)

- 배경 드래그 = 화면 이동(팬). `Space+드래그` / 휠클릭도 팬.
- 휠 = 커서 기준 줌(0.3~2.4x).
- **Ctrl(⌘)+드래그 = 영역 다중선택**(마퀴). 이때 팬 안 됨. **도구 팔레트 `영역 선택`(`TOOLBAR.selectMode`, 영속)**을 켜면 일반 배경 드래그도 마퀴(= Ctrl+드래그와 동일).
- 카드 전체 드래그로 이동(임계 4px — 그 미만 클릭은 선택). 다중선택 상태면 함께 이동.
- **노드 클릭이 텍스트 편집보다 우선**: 단일 클릭=선택/이동(캡션 mousedown `preventDefault`로 캐럿 차단), **더블클릭=편집 진입**(`caretRangeFromPoint`로 클릭 위치에 캐럿).
- **자석 스냅**: `TOOLBAR.snap` 활성 시 노드 드래그 중 다른 노드와 x/y 정렬이 맞으면 스냅 + 노란 가이드선(`#snapV`/`#snapH`) 표시.
- 카드 클릭 = 선택(골드 링). Shift+클릭 = 토글. 빈 곳 클릭 = 해제.
- **단일 선택 시 카드 위 라벨형 노드 툴바**(`drawNhud`→`.nbar`): `상위`(addParent)·`하위`(addChild)·`삭제` 버튼 + 배경색 스와치(`n.bg`). 노드엔 상시 코너 버튼 없음(삭제는 툴바/`Del`).
- 노드 4면 포트(hover 시 표시)를 **실제로 드래그**(임계 6px — 단순 포트 클릭은 무시) → **4점 자석**: 대상 노드 위에선 가장 가까운 포트로 흡착(포트 하이라이트), 노드 중앙부에 놓으면 `auto`(최단 연결면). 빈 곳이면 새 노드 생성+연결.
- 연결선 클릭 = 선택 → **라벨형 미니 HUD 툴바**(`.ebar`): `삭제`·`방향`·`실선/점선`·`화살표`·`굵기(1·2·3)`·**`곡선/직각`**(라우팅 토글)·**`라벨`**(추가·편집). 양 끝 핸들 **드래그**(임계 6px)로 4점 자석 재부착.
- **직각 라우팅(기본·카드 회피)**: `e.route` 미지정·`ortho`면 직각. **`routeOrtho(A,B,fs,ts)`가 모든 노드 사각형(마진 `M=14`)을 장애물로 두고 A\*(Hanan 격자 + 꺾임 패널티 `BEND`)로 우회 경로 탐색** → 선이 카드 위/뒤로 침범하지 않음(`segHitsRects`가 사각형 내부 통과 차단, 경계선은 허용). 포트에서 `S=18` 띄운 진출·진입점에서 시작. 실패하거나 노드 60개 초과면 `null`→ 단순 `orthoPath`(포트 stub+중앙 점프/ㄱㄴ자) 폴백. 결과는 `cleanPts`+`polyPath`(모서리 라운딩). **노드 드래그 중(`drag` truthy)엔 성능 위해 단순 경로**, 드롭 시 재라우팅. HUD에서 개별 `curve`(곡선·베지어) 전환. `edgeGeo`가 `e.route!=='curve'`로 분기(`buildSVG` 내보내기도 동일 경로 사용).
- **연결선 라벨**(`e.label`): `drawLabels()`가 라벨 있는 모든 엣지의 중앙에 `.elabel` pill 렌더(편집은 contenteditable, 빈 값이면 제거). `라벨` 버튼이 빈 라벨 생성 후 포커스.
- **캔버스 배경색**: 헤더 `배경` 버튼 → 스와치 팝오버(`#bgPop`, `CANVAS_BGS`), 캔버스별 `canvas.bg`로 영속(`applyCanvasBg`).
- **다중 선택(2개↑) 정렬·배포**: 선택 묶음 위 `.abar` 툴바(좌/가운데/우·상/가운데/하 정렬 + 가로/세로 등간격). `alignSel(mode)`.
- **내보내기**: 헤더 `내보내기 ▾` → PNG 이미지 / SVG 벡터 / JSON. 상태를 벡터 SVG로 재드로잉(`buildSVG`) 후 PNG는 브라우저 래스터화(라이브러리 없음). 썸네일은 dataURL로 임베드 → canvas 타인트 없음.
- **되돌리기/다시실행**: `Ctrl+Z` / `Ctrl+Shift+Z`(또는 `Ctrl+Y`), 헤더 `↶`/`↷` 버튼. 캔버스별 스택(전환 시 초기화).
- 단축키(노드 선택 후): `Tab` = 하위 mini 노드 추가, `Enter` = 형제 mini 노드 추가, `−` 하위, `+` 상위, `G` 그룹(2개 이상), `Del` 삭제(선택 엣지 우선), `Esc` 해제.
- 썸네일: 왼쪽 라이브러리에서 카드로 드래그(또는 OS 이미지 파일 드롭). 카드 썸네일 클릭 = 원본 라이트박스.
- **플로팅 도구 팔레트**(캔버스 좌상단, `.stage` 내부 `position:absolute`): **도구** 섹션(영역 선택·자석 정렬·기본 노드·중간 노드 — **선/화살표는 제거**, 연결선 클릭 HUD에서 적용)과 **아이콘** 섹션을 헤더(`.tr-gh`)로 구분. `body.view`(보기 모드)에선 숨김.
- **아이콘 팔레트**(도구 팔레트 하단 섹션): 20종 아이콘 **3열 그리드(스크롤 없음, 전체 노출)** → 클릭/드래그 시 icon 타입 노드를 캔버스 중앙에 추가. 한글 툴팁은 `ICON_LABELS` 맵.
- 편집/보기 토글, 사이드바 접기, 가로/세로 자동정렬.

## 작성 도구 (툴 레일·노드 타입·아이콘)

### 도구 팔레트 (캔버스 좌상단 플로팅)

`.stage` 내부에 `position:absolute`로 떠 있는 카드(`.toolrail`). **도구**·**아이콘** 두 섹션(`.tr-group`)을 헤더(`.tr-gh`)로 구분한다. 도구 버튼(`.trbtn`)은 글리프(`.tr-ico`) + **이름 라벨**(`.tr-name`) 행 형태 — 기능을 직관적으로 드러낸다. 상태는 `TOOLBAR` 전역 객체에 보관.

| 버튼(라벨) | 동작 | 상태 필드 |
|---|---|---|
| 영역 선택 | 배경 드래그를 마퀴 선택으로(Ctrl+드래그와 동일) | `TOOLBAR.selectMode` (bool, 영속) |
| 자석 정렬 | 노드 드래그 시 정렬 스냅 + 가이드선 | `TOOLBAR.snap` |
| 선: 실선/점선 | 새로 그릴 엣지의 기본 스타일 전환(라벨·글리프가 현재 상태 반영) | `TOOLBAR.edgeStyle` |
| 화살표 머리 | 새로 그릴 엣지에 화살표 머리 표시 여부 | `TOOLBAR.edgeArrow` |
| 기본 노드 / 중간 노드 | full / mini 노드를 캔버스 중앙에 추가 | — |
| 아이콘(섹션) | `ICONS` 20종 3열 그리드 → 클릭 시 icon 노드 추가 | — |

`TOOLBAR`는 `saveMeta()`로 서버 `meta.toolbar`에 영속되며, `exportJSON()`으로 내보낸 JSON에도 포함된다. 불러오기 시 `d.toolbar`가 있으면 `Object.assign(TOOLBAR, d.toolbar)` 후 `renderToolbar()`로 UI 갱신.

### 노드 타입

| type | 외형 | 용도 |
|---|---|---|
| `"full"` | 기본 카드 (썸네일+제목+설명) | 주요 단계 노드 |
| `"mini"` | 작은 카드 (제목만) | 보조/중간 단계 |
| `"icon"` | 아이콘(상단) + 라벨 | 시스템/역할 표시 |

- `Tab` 단축키 → `addChildMini` (선택 노드의 하위 mini 노드 추가 + 연결)
- `Enter` 단축키 → `addSiblingMini` (선택 노드와 같은 레벨의 형제 mini 노드 추가 + 연결)
- `addMiniCenter()` — 도구 팔레트 버튼으로 캔버스 중앙에 mini 노드 추가

### 아이콘 세트 (`ICONS`)

`ICONS` 상수에 20종의 아이콘이 `id: "<svg 내부 마크업>"`(path/shape 문자열) 형태로 정의됨. `iconSvg(id)` 함수가 `viewBox 0 0 24 24 · stroke=currentColor` 래퍼로 감싸 SVG 문자열 생성. `renderPalette()`로 팔레트 그리드 렌더. `addIconCenter(iconId)`로 `type:"icon"` 노드를 캔버스 중앙에 삽입. 외부 아이콘 라이브러리 금지(직접 path 작성).

## 썸네일 / 이미지

- 빌트인 4종(`vdi_login`, `vdi_dash`, `myportal`, `myaccess`)은 `map.html` 내에 base64 dataURL로 내장. `IMAGES` 맵에 직접 등록되며 서버 저장 대상 아님.
- `defaultState()`가 이 id들로 기본 노드의 `thumb.imgId`를 설정.
- 사용자 이미지 추가: 사이드바 `＋ 이미지 추가` 또는 노드에 OS 이미지 파일 드롭 → `downscaleImage` → `putImg` → 서버(`map_images.json`) 저장.
- `doc.meta.library`(서버)에는 사용자 이미지의 `{id, label}` 목록만 보관. 실제 dataURL은 `map_images.json`에서 별도 로드.
- 원본 png에서 재생성했던 절차(참고): PIL로 width 1200·JPEG q82 리사이즈 → base64 → 내장. 지금은 이미 내장돼 있어 재생성 불필요.
- **레거시 포맷 주의**: 구버전 JSON 내보내기에서 `thumb.src`(인라인 dataURL)를 포함한 경우, import 시 `imgId`가 없어 썸네일이 공백으로 표시(graceful degradation — 나머지 데이터는 정상).

## 기본 다이어그램 (defaultState)

진입 3분리가 합류 후 직선 흐름, 끝에서 분기:
`씬클라이언트 / 물리PC / (재택→마이엑세스)` → **사용자VDI포탈 로그인** → 2차 보안 인증 → 내 가상PC 접속 → 업무수행(마이포탈) → 가상화 사용자 포탈 → 부서장 결재 → 완료.

## 제약 / 주의

- **localStorage는 로컬 저장 모드 한정 opt-in**: 과거 전면 금지였으나(claude.ai 미리보기 샌드박스 throw), **`storeMode==='local'`일 때만** `lsGet/lsSet`(전부 try/catch — throw 시 메모리 폴백)로 사용. 키: `scoopboard_mode`(선택) · `scoopboard_doc`(canvases+meta) · `scoopboard_imgs`(사용자 이미지). 서버 모드에선 종전대로 `api.php`만 사용. 미리보기/`file://`에선 자동 폴백. sessionStorage는 계속 미사용.
- **POST 본문 <128KB 유지**: cafe24 openresty는 POST 본문 >128KiB(131072B)를 404로 거부. 이미지는 `putimg` op로 개별 분리 저장(각 <128KB). 캔버스·메타 JSON에 이미지 dataURL을 포함하지 말 것 — `imgId` 참조만 허용.
- 엣지 SVG는 `left/top:-10000, 20000×20000, overflow:visible`로 깔고 `#edgeG`를 `translate(10000,10000)`. 히트영역(`.eh`)만 `pointer-events:stroke`, 컨테이너는 `none`. 이 구조 유지해야 선 클릭과 노드/팬이 안 충돌함.
- 줌 선명도: `.world`에 `will-change:transform`을 **넣지 말 것**(레이어 캐싱되면 줌 시 흐려짐). 현재 빠져 있음.
- 좌표 기반 `nodeAt()`로 연결 드롭 처리(겹친 선/핸들에 안 가로채임). `elementFromPoint`로 되돌리지 말 것 — 1:n 연결 깨짐.

## 다음 작업 후보 (로드맵)

- ~~서버 저장 / 캔버스 관리 / 이미지 분리저장~~ ✅ 완료
- ~~연결선 화살표 머리(방향 표시) + 실선/점선 스타일 토글~~ ✅ 완료
- ~~노드 타입 mini/icon + 단축키(Tab/Enter) + 좌측 툴 레일 + 자석 스냅 + 아이콘 팔레트~~ ✅ 완료
- ~~플로팅 도구 팔레트(도구/아이콘 분리·라벨) + 노드 배경색 + 엣지 굵기 3단계 + 끝점 재연결 auto 최단면 + 영역 선택 도구~~ ✅ 완료
- ~~되돌리기/다시실행(Ctrl+Z) + 연결 임계(포트 클릭 오작동 방지) + 노드 클릭 우선·더블클릭 편집 + 노드 ＋ 추가 버튼~~ ✅ 완료
- ~~**스쿱보드 리브랜드**(MoneyScoop 테마·워드마크·홈링크) + 라벨형 HUD 툴바(노드/엣지) + 4점 자석 + 캔버스 배경색 + 팔레트 정리(선/화살표 제거)~~ ✅ 완료
- ~~연결선 라벨 + 직각(꺾은선) 라우팅~~ ✅ 완료
- ~~PNG/SVG 내보내기 + 정렬·등간격 배포~~ ✅ 완료 — **브레인스토밍 합의 기능 전부 구현 완료**
- ~~카드 회피 직각 라우팅(A\* 장애물 회피) + 서버/로컬 저장 모드 토글(최신본 유지) + 로컬 모드 워드마크 숨김(폐쇄망 회의용)~~ ✅ 완료
1. 직각(꺾은선/orthogonal) 연결선 스타일 토글.
2. 연결선 라벨(예: "승인"/"반려") 추가·편집.
3. 노드 리사이즈(너비/높이 핸들 드래그).
4. `autoLayout`에 그룹 단위 정렬 반영, 레이어 내 교차(겹침) 최소화.
5. 캔버스 순서 변경 UI(드래그 reorder — `reorder` op는 API에 구현됨, UI 미구현).
6. 카드 드래그로 그룹 멤버십 변경 / 그룹 박스 통째 이동.
7. PNG/SVG 내보내기(발표용).

## 작업 팁

- 구조 변경은 `render()` 호출, 좌표만 바뀌면 `paint()`만 호출(가볍게).
- 새 노드/엣지 추가 시 `id`는 `uid('n'|'e'|'g')`로. 엣지엔 `fromSide/toSide` 항상 지정(기본 right/left).
- 불러오기 시 구버전 호환 위해 `state.edges`에 `fromSide/toSide` 기본값 보정 로직 있음(유지).

# 🚫 공통 · 디자인 금지: 항목 좌측 컬러 라인(accent bar/rail)

**종목·지표·카드 등 어떤 항목에도 좌측 세로 컬러 라인(accent bar/rail, box-shadow:inset Npx 0 0 color, ::before 세로 마커)을 절대 넣지 말 것.** 클로드 기본 디자인 클리셰이며 사용자가 명시적으로 금지함. 활성/선택/포커스 표시는 **배경색·텍스트색·체크박스·아웃라인**으로만 한다. (2026-07-05 사용자 지시)


# 🧭 스쿱포지(forge) 4패널 지칭 규칙 (상세)

forge.html의 가로 4구성을 **1/2/3/4 패널**로 지칭한다(사용자 합의, 2026-07-05):
- **1패널 = 종목** (워치리스트, 좌측 사이드바 `.forge-side` — 그룹핑·신호등 도트)
- **2패널 = 티커** (중앙 보드 `.board-pane`/`.wboard` — 타임프레임 매트릭스·예측시점별·오실레이터·지표신호)
- **3패널 = 지표조합** (지표 레일 `.ind-rail` — 체크=표시·바=가중치)
- **4패널 = 차트** (`.chart-pane` — 예측선 1/2/3차·전체화면)
- 패널 사이 조절 거터: 2·3 사이 `#forgeGutter`(가로), 차트 내 `#fcVGutter`(세로).
