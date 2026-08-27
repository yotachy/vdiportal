# 시그널 스캐너 (푸시 Phase 1)

앱이 꺼져 있어도 관심종목을 대신 훑어, **엔진이 강하게 동의하는** 시그널만 골라 서버에 발송을 요청한다.
감지·판정은 앱과 **같은 원본**(`../app/app-signals.js` · `../app/app-engine.js` · `../forge-core.js`)을 require 한다 — 사본 없음.

## 실행

    cp scanner.config.sample.json scanner.config.json   # 편집: serverBase·scannerKey
    node scanner.mjs --dry-run                          # 발송 없이 선별 결과만
    node scanner.mjs                                    # 실행(하루 1회)

`scanner.config.json` 은 gitignore — 커밋 금지.
서버 쪽 키는 `<data>/app_scan_key.txt`(웹루트 밖·불가침). 없으면 스캐너 ops 는 전부 403(fail-closed).

## cron (07:00 KST)

    0 22 * * * cd /path/to/map && /usr/bin/node scan/scanner.mjs >> /var/log/ms-scan.log 2>&1   # UTC 22:00 = KST 07:00

호스트는 코드와 무관하다(어디서 불려도 같은 결과). cafe24 에는 cron 이 없다 — 개발기 또는 작은 상시 호스트.

## 비용 (2026-08-27 실측, 프로덕션 실데이터)

| 항목 | NVDA(5,030봉) | TSLA(4,066봉) |
|---|---|---|
| OHLC fetch | 188ms | 53ms |
| 판정(basic·전량) | **82ms** | 39ms |

종목당 0.3초 미만이라 관심종목 전량을 훑어도 부담이 없다. 감지 0건인 종목은 엔진을 아예 부르지 않는다.

## Phase 1 에서 실제로 일어나는 일

`app_fcm.json`(서버 자격증명)이 없으므로 **실발송은 일어나지 않는다** — 발송로그에 `queued` 로만 쌓인다(킬스위치).
같은 날 두 번 돌려도 `unique(device, day)` 가 재발송을 막는다(멱등).
