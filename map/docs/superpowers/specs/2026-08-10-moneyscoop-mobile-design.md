# 머니스쿱 모바일 앱 — 착수 설계 (안드로이드 우선 · 하이브리드)

- 날짜: 2026-08-10
- 대상: `map/mobile/`(신규) · `map/forge-api.php`(CORS만) · `map/forge-core.js`·`forge-tools.js`(무수정 공유)
- 입력물: `MoneyScoop 모바일 앱 개발.zip` → `design_handoff_moneyscoop_mobile/` (README 359줄 · SPEC-economy · BUILD-plan · 목업 보드 50장)
- 상태: 설계 승인됨 (2026-08-10)

## 1. 배경과 정체성

스쿱포지(PC 웹)의 분석 엔진을 그대로 쓰는 **별도 모바일 제품**을 만든다. 브랜드는 머니스쿱, 영어권 우선, 수익모델은 구독이 아니라 **AdMob 리워드 광고 + Scoops 재화**다. PC 서비스는 그대로 살아 있고 변경하지 않는다.

**반응형 개편이 아니다.** PC는 166KB 스타일시트의 고정 4패널 데스크톱 레이아웃이라, 그것을 모바일에 맞추는 비용이 새로 쓰는 비용보다 크다. 재사용하는 것은 **UI가 아니라 엔진**이며, 그것이 하이브리드를 택한 유일한 이유다.

핸드오프 번들이 디자인·경제·빌드 순서까지 높은 완성도로 결정해 두었다. 이 문서는 그 위에 **번들이 결정하지 않은 것**을 채우고, 우리 저장소의 현실(빌드툴 없음·cafe24 공유호스팅·플랫 JSON)에 맞춰 조정한 착수 설계다.

### 사용자 조건 (계획을 바꾼 두 가지)

| 조건 | 계획에 미친 영향 |
|---|---|
| 모바일 개발 경험 없음 | Phase 0의 목표를 "HTML로 엔진 검증"에서 **"첫날부터 폰에 설치되는 APK"**로 올린다. 툴체인 검증과 엔진 검증을 한 번에 끝내면, 이후는 이미 도는 앱에 화면을 얹는 작업만 남는다 |
| 실기기가 갤럭시 Z폴드7 하나 | ① 플래그십이라 성능 측정치가 낙관적 → 데스크톱 Chrome **CPU 6배 스로틀**을 중급기 대리치로 병행 기록 ② 폴더블이라 600–904dp 2단 레이아웃이 "나중 일"이 아니라 주력 화면 |

보유: 안드로이드 실기기 · Play 개발자 계정 · AdMob 계정 · Android Studio(Windows). WSL에 Node 24 확인, JDK 없음(Android Studio 동봉분 사용).

## 2. 재사용 경계

| 파일 | 크기 | 처리 |
|---|---|---|
| `forge-core.js` | 207KB · DOM-free UMD · 251 테스트 | **무수정 공유.** 이 프로젝트의 존재 이유 |
| `forge-tools.js` | 70KB · UMD 드로잉 | 공유하되 v1 범위 밖. 터치 바인딩 여부는 Phase 0에서 확인 |
| `forge-draw.js` | 256KB | **포팅하지 않는다.** 캔들·콘·축만 새로 작성 |
| `forge-ui/app/state.js`, `forge.css` | 660KB | 데스크톱 4패널. 쓰지 않는다 |
| `forge-api.php` | 36KB | 데이터 프록시로 계속 사용. v1은 CORS 헤더만 추가 |

`forge-draw.js`를 버리는 판단의 근거: 대부분이 데스크톱 레이아웃(4패널 좌표계·거터·서브패널)과 엉켜 있어, 뜯어내는 비용이 캔들+콘+축을 새로 쓰는 비용보다 크다. 지표 오버레이 작도가 필요해지는 v4 시점에 **개별 함수 단위로** 다시 판단한다.

## 3. 파일 배치 — 같은 저장소, 폴더 격리

```
map/
  forge-core.js        ← 단일 원본. PC·앱이 이 파일 하나를 공유
  forge-tools.js
  forge.html, forge-app.js, forge.css …   ← PC. 손대지 않음
  mobile/                       ← 신규
    www/                        ← Capacitor webDir (앱에 번들되는 것)
      index.html
      vendor/forge-core.js      ← 생성물. gitignore. sync 스크립트가 복사
      vendor/forge-tools.js
      api.js  chart.js  screens/*.js  style.css
      fonts/Pretendard-*.woff2  ← CDN 금지(WebView), 번들
    capacitor.config.json
    package.json                ← "sync" 스크립트가 cap sync 앞에 자동 실행
    sync-engine.mjs             ← ../forge-core.js → www/vendor/ 복사 + SHA 기록
    android/                    ← 커밋(서명·매니페스트 보존). node_modules 만 제외
    docs/BACKLOG-mobile.md      ← 별도 백로그
```

**"독립 운영 + 엔진 공용"을 물리적으로 만족시키는 배치.** 별도 저장소로 떼면 엔진이 두 벌 존재하고, 동기화가 수동 의례라 시간이 지나면 반드시 어긋난다. 같은 워킹트리에 두되 potflow 선례대로 **폴더·백로그·커밋 스코프**를 분리해 독립성을 확보한다.

규율:

- **엔진 수정은 항상 `map/forge-core.js` 원본에서.** `www/vendor/`는 커밋하지 않는 산출물이라 두 벌이 존재할 수 없다
- 커밋 스코프 `mobile(...)`. 포지 백로그(`docs/BACKLOG.md`)와 섞지 않는다
- 엔진을 건드리면 `node --test forge-core.test.js`(251) · `forge-tools.test.js`(81)가 그대로 통과해야 한다. 포크 금지 — 고칠 게 있으면 원본을 고쳐 양쪽이 같이 받는다
- 나중에 분리가 필요하면 `git subtree split`으로 언제든 가능하다(반대 방향은 어렵다)

## 4. 단계 구획

### v1 — 수직 슬라이스 (광고·지갑·계정 없음)

**Phase 0 — 폰에서 도는 APK (1~2일)**

1. `map/mobile/` 스캐폴드 → `npm i @capacitor/core @capacitor/cli` → `cap init` → `cap add android`. `androidScheme: 'https'`
2. ~~`forge-api.php`에 CORS 헤더 + OPTIONS 프리플라이트 추가~~ — **불필요. 이미 열려 있다**(2026-08-10 확인). `forge-api.php:4-9`가 `Access-Control-Allow-Origin: *` + OPTIONS 204 를 내고, 라이브 서버에서 `Origin: https://localhost`로 실측 확인했다. 핸드오프가 경고한 세 가지 중 하나는 이미 해결된 상태
3. `www/index.html`은 버튼 하나: `AAPL 분석` → OHLC fetch → `ForgeCore.run()` → 결과 + `performance.now()` → canvas에 캔들 + 예측 콘
4. `npx cap run android` → 폴드7 설치. `chrome://inspect`로 WebView 디버깅
5. 측정: 콜드 분석 / 재분석 / 메모리를 ① 폴드7 커버화면 ② 폴드7 펼친화면 ③ 데스크톱 Chrome 6x CPU 스로틀

**판정 기준**: 6x 스로틀에서 Full(32지표 × 3타임프레임)이 **2초를 넘으면 Web Worker + 지표별 진행률 확정**. 이 결정을 여기서 내리지 않으면 두 달 뒤 화면 전체를 다시 짠다.

**부수 확인**: `forge-tools.js`의 터치 바인딩 가능 여부 · cafe24 PHP의 SQLite(PDO) 확장 유무.

**Phase 1 — 수직 슬라이스**

워치리스트 → Basic 리포트 → 차트. **차트를 두 번째로** 당긴다 — 가장 어렵고, 나머지는 리스트와 타이포다.

차트가 반드시 만족할 것:
- 페이지 스크롤을 삼키지 않을 것 (PC에서 이미 겪었다 — `#chartLockBtn`)
- 축 글자 실효 10.5px 이상, 본문·캡션 모두 `#0a0d12` 대비 4.5:1 이상
- 핀치 줌 · 한 손가락 팬 · 롱프레스 크로스헤어 · 더블탭 리셋
- 폴드 접힘↔펼침 전환에 WebView가 리로드되지 않을 것 (`android:configChanges`)

**Phase 2 — Play 내부테스트**

광고 없이 내부테스트 트랙에 올려 매일 실사용. 여기까지가 v1이다.

### v2 — 서버 지갑 원장 + 구글 로그인
### v3 — AdMob + SSV + Full 티어 → 프로덕션 출시
### v4 — Custom 티어 · 증거/신뢰 화면군

## 5. 백엔드

**v1은 백엔드를 전혀 손대지 않는다.** 기존 `forge-api.php`를 그대로 쓴다 — CORS 까지 이미 열려 있어 PHP 에 한 줄도 추가하지 않는다.

**v2 지갑 원장**: cafe24 PHP + **SQLite(PDO, WAL)**. 지금 저장소 PHP는 플랫 JSON만 쓰는데(`forge_data.json` 등), 원장은 동시 증분이 필요해 플랫 JSON으로 불가능하다. SQLite 확장이 없으면 MySQL로 간다. 스키마·멱등성·SSV 검증은 `SPEC-economy.md`를 그대로 따른다.

핸드오프의 세 경고를 그대로 승계한다:

1. ~~**CORS**~~ — **이미 해결됨**(위 Phase 0 §2). 서버가 `Access-Control-Allow-Origin: *`를 내고 OPTIONS 를 204로 받는다. 앱 오리진(`https://localhost`)으로 라이브 실측 확인
2. **cafe24 128KB POST 상한** — openresty가 131072바이트 초과 POST를 **404로** 거부한다. 분석 페이로드·프리셋·히스토리를 올릴 때 청크 또는 참조 저장
3. **클라이언트 잔고 금지** — v1에 지갑을 아예 만들지 않는 것으로 회피한다. 잔고는 v2에서 처음부터 서버 권위로

### 리스크 — TwelveData 분당 8회 (핸드오프에 없음)

무료 티어 한도가 분당 8회다. 1인 테스트인 v1엔 무관하지만 실사용자가 붙기 전에 해결해야 한다. 서버 OHLC 캐시가 인기 티커는 흡수하나 신규 티커는 그대로 막힌다. **v3 전에 Yahoo 1차 승격을 검토**한다(2026-08-06에 이미 폴백으로 도입, 무키·UA 필수).

## 6. 계정 · 결제 경계

앱과 PC는 **구글 계정은 공유하되 지갑·구독은 분리**한다. PC는 구독, 앱은 Scoops. 섞으면 스토어 외부결제 정책과 회계가 동시에 꼬인다.

## 7. 시장 · 법무

**영어권 우선, 한국은 나중.** v1 심사 시 Play 배포 국가에서 한국을 제외해 국내 유사투자자문업 신고 이슈를 출시 경로에서 분리한다(국내 사업자가 해외에 내는 것이 면제라는 뜻은 아니므로 v3 전 별도 확인 필요 — 포지 백로그 4번과 연동).

v3 전 처리 항목:
- Play 배포 국가 설정 · 금융 앱 정책 대응 · 면책 문구
- 스토어 정책 필수 문구: *"Scoops have no cash value and cannot be transferred or refunded."*
- UMP 동의(EEA/UK/CA) — 온보딩 5단계 + 설정에서 재호출 가능
- ⚠️ **확인 필요**: Play 개발자 계정이 2023년 11월 이후 개설된 개인 계정이면 프로덕션 출시 전 **12명 × 14일 비공개 테스트** 요건이 붙는다. 내부테스트엔 안 붙지만 v3 일정의 큰 변수

## 8. v1에서 하지 않는 것 (YAGNI)

iOS · Custom 티어 · 증거/신뢰 화면군 · 드로잉 도구 · 광고 · 지갑 · 계정 · 다국어 체계(영어 하드코딩, 문자열만 한 파일에 모음) · 2단/3단 태블릿 레이아웃(폴드 펼침은 1단을 늘려 대응, 정식 2단은 v2 이후).

## 9. 디자인 규약 (핸드오프 승계)

토큰·타이포·간격은 `README.md`의 값을 **문자 그대로** 쓴다. 특히:

- 텍스트 최저 대비 `#78819a`(≈4.6:1). 차트 축 라벨에서 두 번 무너졌던 지점 — 회귀 금지
- `font-variant-numeric: tabular-nums`를 모든 화면 루트에
- 3톤 체계는 장식이 아니라 의미다 — steel=Basic · gold=엔진이 말한 것 · platinum=사용자가 설정한 것
- 최소 터치 타깃 44px
- **좌측 세로 컬러 라인(accent bar) 금지** — 이 저장소 전역 규칙

## 10. 열린 항목

| 항목 | 처리 시점 |
|---|---|
| 워치리스트 목업 `#1a` 재작도(turn-2 타입 시스템) | Phase 1 |
| 티어별 실측 정확도(현재 타임프레임 수치에서 파생) | v3 |
| `map/forge-scorecard.html`(113KB) 읽고 검증 카피 확정 | v4 |
| 엔진 릴리스 타임라인을 실제 커밋 이력으로 채우기 | v4 |
| 종목별 실수치·미스로그 플레이스홀더 교체 | v3 |
