# 머니스쿱 앱 — 실 출시 활성화 러너북

**전 코드 배선은 끝났고, 남은 것은 외부 자원(구글·AdMob·Firebase·서명 키)뿐이다.** 이 문서는 그 넷을
켜는 정확한 순서·파일 포맷·검증법의 단일 체크리스트다. 상세 빌드 절차는 [`../ANDROID-BUILD.md`](../ANDROID-BUILD.md),
서버 규율은 `map/CLAUDE.md` §④(지갑 배포 세트)를 인용한다 — 여기선 중복하지 않고 가리킨다.

최종 검증: **2026-08-26 (라이브 게이트 실측 + 배선 감사)**

---

## 0. 한눈 상태 (2026-08-26 라이브 실측)

| # | 기능 | 서버 배선 | 클라 배선 | 셸(app-shell) | 남은 것 = 외부 자원 | 라이브 상태 |
|---|---|---|---|---|---|---|
| ① | 구글 로그인(OAuth) | ✅ wallet-auth+w_merge | ✅ auth_start→window.open→poll | 불필요(웹 브라우저) | `forge_google_oauth.json` + 콘솔 웹 클라이언트 | `auth-disabled` (정상 대기) |
| ② | 보상 광고(AdMob) | ✅ ad_config/ad_state+SSV | ✅ Capacitor AdMob 플러그인 | ✅ admob 8.1.0 | `ad_units.json` + 콘솔 유닛 + SSV URL 등록 | `ads-disabled` (정상 대기) **+ ⚠ SSV 404** |
| ③ | 푸시 알림(FCM) | ❌ 없음 | ❌ 없음 | ❌ 플러그인 없음 | Firebase 프로젝트 전체(빌드 필요) | **미구축** |
| ④ | 릴리스 서명 | — | — | ⚠ release 빌드타입만(서명·R8 없음) | keystore + keystore.properties | debug APK만 |

**결론**: ①은 오늘 켤 수 있다(웹). ②는 켜기 전 **wallet-ssv.php 배포 선행 필수**(아래 §2 경보). ③은 구축 과제(단발 아님). ④는 스토어 제출 직전.

**엔진↔서버 동조 불변**: 셸은 `app/` 를 `www/` 로 복사하고 index.html 의 엔진 태그를 **서버 절대 URL**(`https://parksvc.mycafe24.com/map/forge-core.js`)로 재작성한다(`app-shell/build-www.mjs`). 즉 APK 안엔 엔진 사본이 없다 — **cafe24 에 현행 엔진·API 가 올라가 있어야 앱이 산다**(2026-08-24 `core.aggUpProb` 사고 계열). 앱을 빌드하기 전 `www/map/` 스냅샷이 현행인지 먼저 확인한다.

---

## 1. ① 구글 로그인 — 오늘 켤 수 있다 (웹, turnkey)

배선 완결: `auth_start`(app-api) → `window.open(authUrl)`(app-auth.js) → `wallet-auth.php` 가 구글로 302 →
콜백에서 id_token→sub → `auth_poll` 이 `w_merge`(게스트→계정 병합)까지. 게이트는 `w_oauth_conf()` 하나 —
`forge_google_oauth.json` 이 없으면 전체가 조용히 꺼진다(무중단 스위치).

**켜는 순서**

1. **Google Cloud Console → API 및 서비스 → OAuth 동의 화면**: 외부, 앱 이름/지원 이메일, 스코프 `openid`·`email`(민감 아님 — 검증 불요). 테스트 모드는 100명 상한이라 정식 출시 전 '게시'.
2. **사용자 인증 정보 → OAuth 2.0 클라이언트 ID → 웹 애플리케이션**:
   - **승인된 리디렉션 URI**(정확히): `https://parksvc.mycafe24.com/map/wallet-auth.php`
     (wallet-auth.php 가 자기 URL 을 redirect_uri 로 쓴다 — 쿼리 제거한 `$SELF`. 한 글자도 어긋나면 구글이 `redirect_uri_mismatch`.)
3. **`forge_google_oauth.json` 생성**(포맷 정확): `{"client_id":"XXX.apps.googleusercontent.com","client_secret":"YYY"}`
   — client_id/secret 둘 다 비어있지 않아야 게이트가 열린다.
4. **업로드 위치**: `www/map/forge_google_oauth.json`(웹루트 — wallet-lib.php 옆, `__DIR__`). **커밋 금지**(시크릿).
5. **검증**: `curl -s -X POST https://parksvc.mycafe24.com/map/app-api.php -d '{"op":"auth_start","device":"smoketest01"}'`
   → `auth-disabled` 가 사라지고 `{"ok":true,"nonce":...,"authUrl":".../wallet-auth.php?nonce=..."}` 나오면 활성.

---

## 2. ② 보상 광고(AdMob)

배선 완결: `app-ads.js`(네이티브 Capacitor AdMob) ↔ `ad_config`/`ad_state`(app-api) ↔ `wallet-ssv.php`(구글 SSV 실지급 콜백).
게이트는 `<data>/ad_units.json`(킬 스위치 — 없으면 `ads-disabled`). 상세 순서는 [`../ANDROID-BUILD.md` §광고를 켜는 순서](../ANDROID-BUILD.md).

### ⚠ 경보 — wallet-ssv.php 가 라이브에 없다 (2026-08-26 실측 404)

`wallet-ssv.php` 는 2026-08-15 커밋됐지만 **cafe24 에 배포된 적이 없다**(라이브 GET = 404). AdMob 을 이 상태로 켜면
콘솔에 등록한 SSV 콜백이 404 로 막혀 **아무도 스쿱 보상을 못 받는다**(CLAUDE.md §④ 가 경고한 정확한 실패). 지금은
광고가 꺼져 있어(ads-disabled) 무해하지만, **AdMob 활성화의 0번 선행조건이다.**

**해소(지갑 배포 세트 — CLAUDE.md §④)**: `./tests/run.sh concurrency` 통과 → `wallet-ssv.php`·`wallet-lib.php`·`wallet-api.php`
동반 업로드 → `curl .../wallet-ssv.php` 가 더는 404 가 아님을 확인. **불가침**: `<data>/wallet.db`·`wallet_secret.txt`·`ssv_keys_cache.json` 덮어쓰기 금지.

### 켜는 순서 (SSV 배포 후)

1. 코드 3종(app-api·wallet-lib·**wallet-ssv**)이 서버에 살아 있는지 확인(위 경보 해소).
2. AdMob 콘솔: 앱 등록(`com.moneyscoop.app`) + 보상형 유닛 2개(quick·full) → SSV 콜백 URL `https://parksvc.mycafe24.com/map/wallet-ssv.php` 등록.
3. **마지막에** `<data>/ad_units.json` 업로드: `{"quick":{"unitId":"...","reward":3},"full":{"unitId":"...","reward":3}}`
   — reward 는 양의 정수여야 하고, quick·full 둘 다 unitId 비어있으면 안 된다(하나라도 어긋나면 파일 전체 무효 = ads-disabled).
4. **검증**: `ad_config` 가 `ads-disabled` 대신 유닛을 반환. 실 지급은 APK 에서 광고 시청 → 구글 SSV → `w_ad_grant` 로.

---

## 3. ③ 푸시 알림(FCM) — 미구축 (단발 아닌 구축 과제)

지금 저장소에 Firebase/FCM 흔적이 전혀 없다(app-shell 플러그인 목록에도 없음). 켜는 게 아니라 **짓는** 일이다.
[`../ANDROID-BUILD.md` §릴리스 트랙](../ANDROID-BUILD.md)이 방향을 남겼다 — 요약:

- Firebase 프로젝트 생성 → `google-services.json`(app-shell/android/app/).
- 플러그인 `@capacitor-firebase/messaging 8.x` + Gradle `com.google.gms.google-services`(§⑥ 의존성 정책: 공식 네임스페이스라 허용, 정확 버전 고정).
- 클라: 토큰 등록 → 서버 저장(새 op) / 서버: 발송 엔드포인트.
- **시그널 서버 스캔 승격과 한 세트** — 앱이 지금 로컬에서 감지하는 시그널(app-signals)을 서버가 돌려 푸시로 밀 때 의미가 생긴다. 그 전엔 보낼 내용이 없다.

→ 별도 브레인스토밍/설계서 대상. 이 러너북의 '켜기' 범위 밖.

---

## 4. ④ 릴리스 서명 — 스토어 제출 직전

현재 `app-shell/android/app/build.gradle` 은 release 빌드타입만 있고 `signingConfig`·`minifyEnabled true` 가 없다(= 미서명).
상세는 [`../ANDROID-BUILD.md` §릴리스 트랙](../ANDROID-BUILD.md). 요약:

- 서명 키: `keytool -genkeypair -v -keystore moneyscoop-release.jks -alias moneyscoop -keyalg RSA -keysize 2048 -validity 10000` → `~/tools/keys/`(저장소 밖).
- `android/keystore.properties`(gitignore) 로 참조 → `build.gradle` `signingConfigs.release`.
- `versionCode` 릴리스마다 +1(현재 1), `versionName` = `POLICY.app.version` 과 일치.
- R8: `minifyEnabled true` + 광고 SDK proguard 규칙 확인 후.

---

## 5. 활성화 후 회귀 검증 (공통)

- OAuth/AdMob 파일을 올렸으면 `./tests/run.sh` 전량(엔진·원장 회귀) + wallet 을 만졌으면 `./tests/run.sh concurrency`.
- 라이브 부팅: `https://parksvc.mycafe24.com/map/app/` — 로그인 버튼 → 실제 구글 동의 화면 뜨는지.
- 앱을 다시 빌드하면 **엔진 동조**(§0) 먼저: `www/map/` 현행 → `node app-shell/build-www.mjs` → `assembleRelease`.
