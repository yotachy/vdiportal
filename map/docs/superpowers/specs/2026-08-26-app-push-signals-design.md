# 서버 시그널 스캔 + 푸시 알림 — 설계서

**날짜**: 2026-08-26
**트랙**: 머니스쿱 앱(`map/app/`) — FCM 푸시(P10 이후 외부 자원 대기 4기능 중 유일한 "구축" 과제)
**정본 참조**: `map/CLAUDE.md` §⓪·§②·§⑤·§⑥, `docs/design-v2/BUILD-PLAN.md`, `docs/design-v2/LAUNCH.md`
**상태**: 승인됨(2026-08-26) → **Phase 1 구현 완료(2026-08-27)** — 플랜 [`../plans/2026-08-27-app-push-phase1.md`](../plans/2026-08-27-app-push-phase1.md), 진행 로그 [`../../design-v2/PROGRESS.md`](../../design-v2/PROGRESS.md) 2026-08-27 절. Phase 2(Firebase)는 [`../../design-v2/LAUNCH.md`](../../design-v2/LAUNCH.md) §3.

> **구현 중 확정된 것**(설계서가 열어둔 지점): 판정 = `app-engine.analyze({tier:"basic", tfKo:"일", 전량 이력})` — `app-engine.js` 가 이미 node-require 가능하므로 §4.2 의 "UMD 추출 또는 분리"는 **불필요**했고, 스캐너는 앱과 같은 함수를 그대로 부른다. `TH.conv` 는 `POLICY.signal.conv` 로 승격(단일 출처).

---

## 1. 목적 · 한 줄

**사용자가 앱을 보고 있지 않아도, 관심종목에 "엔진이 강하게 동의하는" 시그널이 뜨면 하루 한 번 아침에 알려준다.**

지금 시그널(`app-signals.js` 13종)은 **앱이 켜져 있을 때 폰 안에서만** 감지된다. 앱이 꺼져 있으면 아무도 시장을 보지 않는다. 이 기능은 **서버(외부 스캐너)가 대신 관심종목을 스캔**하고, 그중 중요한 것만 **푸시로 전달**한다.

## 2. 확정된 제품 결정 (사용자, 2026-08-26)

| 결정 | 값 | 근거 |
|---|---|---|
| 알림 형태 | **일일 다이제스트**(하루 1회, 종목별 여러 건을 한 번에) | 시그널은 일봉 — 하루 한 번 갱신. 스팸 없음 |
| 중요 기준 | **엔진 확신도 결합** — 시그널 방향 + 전체 분석이 강하게 일치할 때만 | 온브랜드(엔진 실계산). 스캐너가 이미 엔진을 돌림 |
| 발송 시각 | **오전 7~8시 KST** | 미국장 마감=새벽 5~6시 KST(자는 시간). 7시엔 일봉 확정 완료 → 출근대에 전달 |
| 대상 | **디바이스 등록부**(로그인 무관 — 앱 설치 인스턴스 단위) | 게스트/계정 동기화에 의존하지 않는 자족 데이터 모델 |

## 3. 기각한 대안 (투명성)

- **PHP로 감지 재구현** — 엔진 단일원본(§②) 위반. 감지는 forge-core 실계산에 의존.
- **cafe24 cron** — 존재하지 않음. 기존 forge 비동기 작업도 외부 워커 폴링(enqueue/claim/result). → **외부 node 스캐너**가 정석.
- **서버가 감지 시그널을 저장·앱에 내려주기** — 불필요. 감지는 일봉 위 **결정적 함수**라 앱이 봉을 받으면 서버와 동일한 시그널을 재현한다. 서버의 고유 가치는 **푸시(닫힌 앱 도달)** 하나뿐. → 서버는 감지 시그널을 저장하지 않는다(등록부·발송로그만).

## 4. 아키텍처

```
[외부 node 스캐너]  ── 하루 1회 07:00 KST ──
   1. GET scan_registry (스캐너 키 인증) → [{deviceId, fcmToken, picks, settings}]
   2. picks 합집합 → 종목별: forge-api.php?ohlc=1 (서버 캐시) → 봉
   3. app-signals.detect(sym, candles)  ← 실제 엔진(사본 없음)
   4. 종목별 1회: forge-core run() → verdict{regime, prob}  (확신도)
   5. rankSignal(sig, verdict) 게이트 통과분만, 디바이스별 하루 N건 캡
   6. POST push_send (스캐너 키) → 서버가 FCM HTTP v1 발송 + 발송로그 기록
                                        │
[cafe24 서버]  app-push-lib.php ────────┘
   - app_push.db(<data>, 웹루트 밖·불가침): 등록부 + 발송로그
   - push_register(앱) · scan_registry/push_send(스캐너) ops (app-api.php 디스패치)
   - FCM 자격증명 app_fcm.json (부재 = 푸시 전체 꺼짐 — 킬스위치)

[앱 클라이언트]  app-push.js
   - push_register: {deviceId, fcmToken?, picks, settings} (실행/종목변경/토큰갱신)
   - 설정 토글(내 스쿱): 푸시 on/off
   - rankSignal 공유 → 인앱 "밤사이 중요 시그널" 하이라이트(Phase 1)
   - 푸시 탭 → 시그널 피드/해당 종목 딥링크(Phase 2)
```

### 4.1 확신도 게이트 — `rankSignal(sig, verdict)` (공유 순수함수)

`app-signals.js`에 추가. **앱(인앱 하이라이트)과 스캐너(푸시 선별)가 같은 함수를 쓴다** — 판정 정합 보장.

- 입력: `sig`(detect 산출 — `dir ∈ {−1,0,+1}`), `verdict`(엔진 — `regime ∈ {bull,bear,neutral}`, `prob` = `core.aggUpProb` **∈ [0,100] 정수**(캘리브레이션 완료 — "60%면 실제 60%")).
- `strength = |prob − 50| / 50` ∈ [0,1] (0=반반 50, 1=확신 0/100).
- 판정:
  - `dir = +1`: 정렬 = `regime==="bull"`(또는 prob>50). 중요 = 정렬 ∧ `strength ≥ TH.conv`.
  - `dir = −1`: 정렬 = `regime==="bear"`(prob<50). 중요 = 정렬 ∧ `strength ≥ TH.conv`.
  - `dir = 0`(vol_surge·atr_expand): 방향 없음 → 중요 = `strength ≥ TH.conv`(어느 쪽으로든 강한 방향관 + 거래/변동성 동조).
- 반환: `{ important: bool, score: strength }`. `score`로 디바이스별 정렬·상위 N 캡.
- `TH.conv` 기본값 **0.30**(= prob ≥65 또는 ≤35), 디바이스 하루 캡 **N=3**. 둘 다 `POLICY.signal`(리모트 컨피그 대상, §15 협의 고정점) — 하드코딩 금지.
- **엔진 판정·확률을 바꾸지 않는다**(§② 불변). 게이트는 엔진 출력을 *읽어* 분류만 한다.

### 4.2 스캐너 `scan/scanner.mjs` (신규 node · 호스트 독립)

- 한 번 실행 = 한 번 전체 스캔 패스. **07:00 KST 한 번**에 스캔·판정·발송을 다 한다(미국장 마감 후 일봉 확정 완료 → 별도 지연 큐 불필요).
- 순수 로직(레지스트리 파싱·종목 합집합·게이트·다이제스트 구성)은 **테스트 가능한 순수 함수로 분리**(`scan/scan-core.mjs`), `scanner.mjs`는 fetch·post·config 배선만.
- 설정: `scan/scanner.config.json`(gitignore — `serverBase`, `scannerKey`). 커밋 금지.
- 엔진은 `../forge-core.js`·`../app/app-signals.js` **원본 require**(사본 금지 — §②·§⑤). `app-signals.js`는 UMD라 node require 가능.
- 종목당 `run()` 1회만(그 종목의 모든 시그널이 같은 verdict 공유). 엔진 cycle O(n²)은 해결됨 → 스캔 비용 낮음.
- **판정 정합(§⓪ "모바일은 PC와 동일하게 분석")**: 스캐너가 verdict{regime,prob}를 얻는 경로(그래프 구성 · `core.run` · `aggUpProb` · regime 도출)는 앱(`app-engine.js`)과 **같아야** 한다 — 스캐너가 자체 그래프/판정을 따로 짜면 두 번째 분석 구현이 되어 드리프트한다. 이식이 필요한 최소 로직(기본 그래프 시드 + regime 도출)은 **UMD 공유 모듈로 추출**하거나, app-engine 의 해당 부분을 node-require 가능하게 분리한다(구현 플랜에서 확정). 정합 회귀 테스트: 한 종목에 대해 앱 경로 verdict == 스캐너 경로 verdict.
- **cron 호스트는 코드와 무관**(미결 — 개발기 테스트 → 출시 시 작은 상시 호스트). 스캐너는 어디서 불려도 동일.

### 4.3 서버 `app-push-lib.php` + `app-api.php` ops

데이터: `<data>/app_push.db`(SQLite — 웹루트 밖, wallet.db·app_ledger.db와 같은 관례). **배포 불가침**.

| op | 호출자 | 동작 |
|---|---|---|
| `push_register` | 앱 | `{deviceId, fcmToken?, picks[], settings{on}}` → 등록부 upsert(디바이스 1행). fcmToken 없으면(웹·미허용) 토큰 null 로 등록(picks/settings만) |
| `scan_registry` | 스캐너 | 스캐너 키(`X-Scan-Key`) 인증 → `settings.on=true`인 등록부 전체 반환 |
| `push_send` | 스캐너 | 스캐너 키 인증 → `{sends:[{deviceId, title, body, data}]}` 수신 → 디바이스별 fcmToken 조회 → FCM 발송 → 발송로그 기록(dedup 키 `deviceId|yyyy-mm-dd`로 하루 1회 강제) |

- 스캐너 키: `<data>/app_scan_key.txt`(서버 생성·불가침, wallet_secret.txt 관례). 부재 시 스캐너 ops fail-closed(403).
- FCM 발송: `app_fcm.json`(서비스 계정 JSON) 있을 때만. **부재 = 푸시 전체 꺼짐**(ad_units.json·forge_google_oauth.json과 같은 킬스위치). HTTP v1 API — 서비스 계정으로 OAuth2 액세스 토큰 발급(JWT 서명→토큰 교환, curl) 후 `messages:send`. legacy 서버키 아님(2024 폐지).
- 발송로그가 **하루 1회 캡**을 강제한다(스캐너가 두 번 돌아도 같은 날 재발송 안 됨 — 멱등).

### 4.4 클라이언트 `app-push.js` (신규) + 훅

- **Phase 1(Firebase 무관)**: `rankSignal` 공유 → 시그널 화면·홈에서 "밤사이 중요" 하이라이트/우선정렬. 설정 토글(`settings.on`, 기존 `state.notiOff`와 통합) → `push_register`로 picks·settings 송신(토큰 없이도).
- **Phase 2(Firebase)**: `@capacitor/push-notifications`(또는 `@capacitor-firebase/messaging`)로 토큰 포착·권한 요청 → `push_register`에 fcmToken 실어 보냄. 푸시 탭 → 딥링크(시그널 피드 / 해당 종목 차트). 웹에서는 no-op(네이티브 셸만).

## 5. 단계 (Firebase 유무로 자름)

### Phase 1 — 지금 전부 구축·테스트 가능 (Firebase 불필요)
사용자 가치 = **앱 안 "밤사이 중요 시그널" 하이라이트**(엔진이 강하게 동의하는 시그널을 눈에 띄게). 인프라 = 스캐너·등록부·서버 ops·게이트를 완성해 테스트까지.
- `rankSignal` 공유 순수함수(app-signals.js) + node 테스트.
- 인앱 하이라이트(시그널 화면·홈) — Phase 1 산출물.
- `scan/scan-core.mjs`(순수 로직) + `scanner.mjs`(배선) + node 테스트.
- `app-push-lib.php` + `push_register`/`scan_registry`/`push_send`(발송은 `app_fcm.json` 부재 시 로그만·`ok:queued`) + PHP 테스트(등록 upsert·스캐너 키·하루 캡 멱등).
- `push_send`의 FCM 발송부는 **자격증명 부재로 자연히 꺼져 있음** — 배선은 완성, 실발송만 Phase 2 자격증명에서 켜짐.
- 관문: `./tests/run.sh`에 push 스위트(scan-core·rankSignal·app-push-lib) 추가.

### Phase 2 — Firebase 필요 (외부 게이트)
- Firebase 프로젝트 → `google-services.json`(app-shell/android/app/) + `app_fcm.json`(서버, 서비스 계정).
- app-shell에 푸시 플러그인 추가(§⑥ 공식 네임스페이스 — 정확 버전 고정, `npx cap sync`, assembleDebug 확인).
- `app-push.js` 토큰 포착 → `push_register` + 딥링크.
- APK 재빌드. `app_fcm.json` 업로드로 실발송 활성(마지막 — 킬스위치).

## 6. 파일 구조

| 파일 | 신규/수정 | 책임 |
|---|---|---|
| `app/app-signals.js` | 수정 | `rankSignal(sig,verdict)` 공유 게이트 추가(UMD export) |
| `app/app-push.js` | 신규 | 등록·설정·인앱 하이라이트·(P2)토큰·딥링크 |
| `app/app-screen-signal.js` | 수정 | "밤사이 중요" 하이라이트/정렬 |
| `app/app-config.js` | 수정 | `POLICY.signal.conv`·`pushCap`·`pushHourKST` |
| `scan/scan-core.mjs` | 신규 | 순수 로직(레지스트리→종목 합집합→게이트→다이제스트) |
| `scan/scanner.mjs` | 신규 | 배선(fetch·post·config) |
| `scan/scan-core.test.mjs` | 신규 | 순수 로직 테스트 |
| `app-push-lib.php` | 신규 | 등록부·발송로그·FCM 발송(HTTP v1)·스캐너 키 |
| `app-api.php` | 수정 | push_register/scan_registry/push_send 디스패치 |
| `app-push-lib.test.*` | 신규 | 등록 upsert·키 인증·하루 캡 멱등 |
| `docs/design-v2/LAUNCH.md` | 수정 | FCM 섹션 갱신(구축 완료·활성 절차) |
| `docs/ANDROID-BUILD.md` | 수정 | 푸시 플러그인 sync 절차(P2) |

## 7. 보안 · 규율 (협상 불가)

- **엔진 단일원본(§②)**: 스캐너는 실 `app-signals.js`·`forge-core.js`를 require. PHP 재구현 0. `rankSignal`은 엔진 출력을 읽기만(판정·확률 불변).
- **데이터파일 불가침**: `app_push.db`·`app_scan_key.txt`·`app_fcm.json`·`google-services.json` 배포 시 덮어쓰기 금지(생성물·자격증명).
- **킬스위치**: `app_fcm.json` 부재 = 푸시 전체 꺼짐(fail-closed).
- **인증**: 스캐너 ops는 `app_scan_key.txt`(부재 시 403). 앱 ops(`push_register`)는 기존 device 식별.
- **문법 하한 ES2017**(§⑤) · **의존성**(§⑥ 공식 Capacitor 네임스페이스만, 정확 버전 고정).
- **정직 표기**: 푸시 문구는 실측 근거(시그널 why + 엔진 확신)만. 지어내지 않음.
- **배포**: 서버 세트(app-api.php + app-push-lib.php)는 §④ 관례로 동반. 스캐너는 cafe24 배포 대상 아님(외부 호스트). 앱은 §앱 트랙 배포.

## 8. 열린 미결 (구현 중 확정 · 협의 불필요)

- 스캐너 cron **호스트**(개발기 → 출시 상시 호스트) — 코드 무관, 운영 결정.
- 푸시 문구 톤(다이제스트 카피) — 구현 시 정직 표기 범위 내.
- `TH.conv`·`N`·발송시각 정밀값 — 기본값으로 출발, 리모트 컨피그로 조정(§15).
- Phase 2 플러그인 선택(`@capacitor/push-notifications` vs `@capacitor-firebase/messaging`) — Phase 2 착수 시 peer/버전 확인 후 확정(§⑥ 절차).
