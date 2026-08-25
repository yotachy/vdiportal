# 안드로이드 빌드 — 처음부터 APK 까지

2026-08-15 이 저장소에서 **처음으로** APK 가 나온 절차를 그대로 적는다. 이 문서가 없으면 다음 사람이
같은 하루를 다시 쓴다.

결과: `android/app/build/outputs/apk/debug/app-debug.apk` · 4.2MB ·
`com.moneyscoop.mobile` v1.0 · minSdk 24 · targetSdk 36 · 권한은 `INTERNET` 하나.

## sudo 는 필요 없다

처음엔 `sudo apt install openjdk-21-jdk` 로 갔다가 막혔다 — 이 저장소의 작업 셸에는 비밀번호를 받을
터미널이 없다. **JDK 도 Android SDK 도 결국 압축파일이라 홈 디렉터리에 풀면 그만이다.** 시스템에
설치하지 않으므로 권한을 물을 일이 없고, 다른 프로젝트의 자바 버전과도 충돌하지 않는다.

## 1. JDK 21

Android Gradle Plugin 8.x 가 JDK 17+ 를 요구한다. 21 LTS 를 쓴다.

```bash
mkdir -p ~/tools && cd ~/tools
curl -L -o jdk.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
tar xzf jdk.tar.gz && rm jdk.tar.gz
~/tools/jdk-21*/bin/java -version   # Temurin-21.0.12+8 확인
```

## 2. Android SDK — 명령줄 도구만

Android Studio(약 3GB)는 필요 없다. 헤드리스에서는 GUI 가 오히려 방해다.

```bash
cd ~/tools
curl -L -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
mkdir -p android-sdk/cmdline-tools && cd android-sdk/cmdline-tools
unzip -q ~/tools/cmdtools.zip && mv cmdline-tools latest
```

**`latest` 로 이름을 바꾸는 것이 핵심이다.** 압축을 풀면 `cmdline-tools/cmdline-tools/` 가 되는데,
`sdkmanager` 는 자기 위치가 `cmdline-tools/<버전>/bin` 이길 기대하므로 그대로 두면
"Could not determine SDK root" 로 죽는다.

## 3. 라이선스 + 패키지

```bash
export JAVA_HOME=$(echo ~/tools/jdk-21*)
export ANDROID_HOME=~/tools/android-sdk
export ANDROID_SDK_ROOT=~/tools/android-sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

yes | sdkmanager --licenses > /dev/null
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

`variables.gradle` 이 `compileSdkVersion = 36` 이라 platform-36 이 필요하다. **build-tools 35 는
Gradle 이 빌드 중에 알아서 더 받는다**(어떤 의존성이 그 버전을 고정해 요구한다) — 미리 받을 필요 없고,
라이선스에 이미 동의했으므로 멈추지 않는다.

## 4. 빌드

```bash
cd map/mobile
npm install               # 네이티브 플러그인이 생긴 뒤로 선행 필수 (아래 참고)
npm run cap:sync          # 엔진 동기화 + www → android assets 복사 + 플러그인 Gradle 배선 갱신

cd android
echo "sdk.dir=$ANDROID_HOME" > local.properties   # gitignore 대상(머신별 경로)
./gradlew assembleDebug --no-daemon
```

`gradlew` 가 Gradle 8.14.3 을 자동으로 받는다(약 200MB, 최초 1회).

**`npm install` 이 선행이다.** `package-lock.json` 은 저장소 루트 `.gitignore` 에 걸려 커밋되지
않으므로 새로 받은 작업본에는 `node_modules/` 가 아예 없다. Capacitor 플러그인의 안드로이드
소스는 **`node_modules/@capacitor-community/admob/android` 를 Gradle 서브프로젝트로 직접 참조**
하므로(아래 `capacitor.settings.gradle`), 설치를 건너뛰면 빌드가 "프로젝트를 찾을 수 없다"로 죽는다.
저장소에 든 것은 참조뿐이고 실물은 npm 이 가져온다.

**`npm run cap:sync` 를 건너뛰지 말 것.** `www/` 를 고쳐도 `android/app/src/main/assets/public/` 은
자동으로 안 바뀐다 — 웹 코드를 고친 뒤 sync 없이 빌드하면 **옛 화면이 담긴 APK** 가 나오고, 그걸
"고쳤는데 왜 그대로지"로 한참 헤매게 된다. 플러그인이 생긴 뒤로는 하는 일이 하나 더 있다:
`cap sync` 가 `android/capacitor.settings.gradle`(서브프로젝트 include)과
`android/app/capacitor.build.gradle`(implementation 의존)을 **다시 써낸다.** 둘 다 "DO NOT EDIT"
생성물이지만 커밋 대상이다 — 플러그인을 넣고 빼는 일은 이 두 파일의 diff 로 드러난다.

## 4-1. 네이티브 의존성 — AdMob (2026-08-16 추가)

이 저장소의 **첫 네이티브 의존성**이다. 그 전까지 안드로이드 쪽은 Capacitor 껍데기뿐이었다.

- **버전은 두 곳에서 못 박는다.** npm 은 `package.json` 에 `--save-exact`(캐럿 없음),
  네이티브는 `android/variables.gradle` 의 `playServicesAdsVersion` · `userMessagingPlatformVersion`.
  **후자를 빼먹으면 반쪽이다** — 플러그인 기본값이 `25.4.+` 라는 동적 버전이라, 같은 소스가 날짜에
  따라 다른 APK 가 되고 구글이 나쁜 릴리스를 올린 날 우리 변경이 하나도 없는데 빌드가 깨진다.
  올릴 때는 사람이 그 줄을 고치고 빌드를 다시 통과시킨다.
- **코틀린이 처음 들어왔다.** 플러그인이 `kotlin-android` + `kotlin-gradle-plugin:2.2.20` 을 쓴다.
  첫 빌드는 코틀린 툴체인을 받고 코틀린 데몬을 새로 띄우느라 오래 걸린다 — **5분 20초**(캐시가
  더워진 뒤 재빌드는 훨씬 짧다). 오래 걸리는 것은 고장이 아니다. 플러그인 컴파일 중
  `SMART_BANNER is deprecated` 경고가 뜨는데 플러그인 자체 코드라 우리가 할 일은 없다.
- **APK 가 4.4MB → 12.0MB 로 커진다.** 광고 SDK 부피다. 리소스 축소·R8 은 릴리스 빌드 과제다.
- **매니페스트의 앱 ID 는 구글 공개 테스트 ID** (`ca-app-pub-3940256099942544~3347511713`).
  실 ID 를 저장소에 넣으면 남이 우리 계정으로 광고를 띄운다 — 배포 시점에 교체한다.
  이 meta-data 가 없으면 앱은 빌드는 되고 **실행 즉시 죽는다**(광고 SDK 가 시작 시 확인한다).

## 확인

```bash
export PATH="$ANDROID_HOME/build-tools/36.0.0:$PATH"
aapt2 dump badging android/app/build/outputs/apk/debug/app-debug.apk | head -4
unzip -l android/app/build/outputs/apk/debug/app-debug.apk | grep -c "assets/public/"   # 38
```

번들 자산 개수가 `www/` 파일 수와 맞는지 본다. 안 맞으면 sync 가 안 돌았거나 `webDir` 이 틀린 것이다.

## 실기기에 넣기

```bash
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb devices                                          # USB 디버깅 켠 폰이 보여야 한다
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

WSL 에서는 USB 가 바로 안 보인다. `usbipd-win` 으로 넘기거나, APK 를 윈도우 쪽으로 복사해
`adb.exe` 로 설치하는 편이 빠르다.

## 실기기에서 처음 달라지는 것 — 지갑이 실서버에 붙는다

Capacitor 는 `androidScheme: "https"` 로 `https://localhost/` 에서 서빙한다. `app.js` 의 가드는
**개발 스킴(`http:` · `file:`)에서만** 운영 지갑 설치를 막으므로, APK 에서는 처음으로 지갑이
`https://parksvc.mycafe24.com/map/wallet-api.php` 에 실제로 붙는다.

즉 **APK 로 앱을 여는 순간 진짜 계정이 생기고 진짜 개설 지급이 실행된다.** 브라우저 확인과 다르다.
테스트를 반복할 때 `W_IP_DAILY` 상한(현재 개발용 20, 출시 전 3 으로 되돌릴 것)을 소진한다는 뜻이기도 하다.

## 릴리스 빌드는 아직

`assembleRelease` 는 서명 키(keystore)가 있어야 한다. 스토어 등록·`versionCode` 정책·난독화와 함께
다룰 일이라 여기서는 다루지 않는다. 8d(AdMob)도 릴리스 서명이 필요한 시점이 온다.

---

# 2026-08-25 — 새 앱 셸 `map/app-shell/` (P10)

위 절차의 `map/mobile` 은 **봉쇄된 옛 트랙**(`_archive/`)이다. 새 앱(`map/app/`)의 셸은 `map/app-shell/` 이고
같은 툴체인(~/tools 의 JDK 21 · Android SDK 36)을 그대로 쓴다. 달라진 점만 적는다.

## 구조 — www 는 생성물, 엔진은 서버

```
map/app-shell/
  package.json          # @capacitor/core·cli·android 8.5.0 · @capacitor/app 8.1.1 · @capacitor-community/admob 8.1.0 (전부 exact)
  capacitor.config.json # appId com.moneyscoop.app · webDir www · androidScheme https
  build-www.mjs         # ../app → www/ 복사기(테스트·md 제외) + index.html 치환. 번들·트랜스파일 없음
  build-www.test.mjs    # 치환·제외 규칙 관문(run.sh app-shell 스위트)
  www/                  # 생성물(gitignore)
  android/              # cap add android 생성물 — 커밋 대상(생성물 표시 파일 포함), build·local.properties 제외
```

- **엔진 사본은 없다.** `build-www` 가 `<script src="../forge-core.js">` 를 **서버 절대 URL**
  (`https://parksvc.mycafe24.com/map/forge-core.js`)로 바꾼다 — PC·웹앱·APK 가 같은 서버 스냅샷을 본다
  (CLAUDE.md §②·열린 엔진). 부팅에 네트워크가 필요하지만 시세도 서버라 새 제약은 아니다.
- `window.MS_SERVER_BASE` 를 엔진보다 먼저 주입 → `app-data.serverBase()` 가 API·시세 경로를 절대 URL 로 만든다.
  웹 배포(`www/map/app/`)는 이 값이 없어 종전대로 `..` 상대 경로다.
- 하드웨어 뒤로가기는 `app-main.bindHardwareBack`(시트 닫기 → 홈 → 종료). 광고는 `app-ads.js`
  (`Capacitor.Plugins.AdMob` — 번들러 없이 네이티브 등록 플러그인을 직접 잡는다).

## 빌드

```bash
export JAVA_HOME=$(echo ~/tools/jdk-21*) ANDROID_HOME=~/tools/android-sdk ANDROID_SDK_ROOT=~/tools/android-sdk
export PATH="$JAVA_HOME/bin:$PATH"
cd map/app-shell
npm install                        # node_modules 는 커밋 안 됨 — 새 작업본은 필수
npm run cap:sync                   # build-www + cap sync (www 갱신·플러그인 Gradle 배선)
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
cd android && ./gradlew assembleDebug --no-daemon
# → android/app/build/outputs/apk/debug/app-debug.apk
```

`variables.gradle` 에 `playServicesAdsVersion='25.4.0'`·`userMessagingPlatformVersion='4.0.0'` 을 못 박았다
(플러그인 기본 `25.4.+` 동적 버전 금지). 매니페스트 AdMob 앱 ID 는 구글 공개 테스트 ID — 실 ID 는 배포 시점에 교체.

## 광고를 켜는 순서(서버 킬 스위치)

1. 코드(`app-api.php`·`wallet-lib.php`·`wallet-ssv.php`)가 서버에 있고 살아 있는지 확인.
2. AdMob 콘솔: 보상형 유닛 생성 → SSV 콜백 URL `https://parksvc.mycafe24.com/map/wallet-ssv.php` 등록.
3. **마지막에** `<data>/ad_units.json` 업로드 — `{"quick":{"unitId":"...","reward":3},"full":{"unitId":"...","reward":3}}`.
   이 파일이 없으면 `ad_config` 가 `ads-disabled` → 앱은 "지금은 광고를 준비 중이에요". 문제가 생기면 이 파일부터 내린다.
4. 앱의 `customData` = 서버가 준 계정 id 그대로(가공 금지) — SSV 가 모양이 다르면 콜백을 조용히 버린다.

## 릴리스 트랙(아직 안 한 것)

- **서명 키**: `keytool -genkeypair -v -keystore moneyscoop-release.jks -alias moneyscoop -keyalg RSA -keysize 2048 -validity 10000`
  → 저장소 밖(`~/tools/keys/`)에 보관, `android/keystore.properties`(gitignore)로 참조, `app/build.gradle` 에 `signingConfigs.release`.
- `versionCode` 는 릴리스마다 +1(정수 단조), `versionName` 은 `POLICY.app.version` 과 맞춘다.
- R8/리소스 축소는 `assembleRelease` 에서 `minifyEnabled true` + 광고 SDK proguard 규칙(플러그인 동봉) 확인 후.
- **FCM 푸시는 Firebase 프로젝트(google-services.json)가 있어야 시작할 수 있다** — `@capacitor-firebase/messaging 8.x` +
  `com.google.gms.google-services` 플러그인. 시그널 서버 스캔 승격과 한 세트라 그때 같이 연다.
- 실기기: `adb install -r app-debug.apk`(WSL 은 usbipd 또는 윈도우 adb.exe). APK 는 **진짜 지갑 계정**을 만든다(W_IP_DAILY 상한 소진 주의).
