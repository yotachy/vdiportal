# cafe24 api.php 프록시 (FRED + beaconcha CORS 우회) 설계 문서

- 작성일: 2026-06-22
- 대상: 신규 `signal/api.php`(cafe24 PHP) + `signal/scoopsignal.html` 로더 2개 수정
- 성격: 데이터 가용성 개선. 브라우저 CORS·키 차단으로 비던 매크로(유동성 축)·검증자 큐를 서버 프록시로 실데이터화. 점수 산식·UI·다른 로더 불변.

## 1. 배경 / 목적

진단 결과 비는 데이터의 주원인은 **브라우저 CORS 차단**: FRED(순유동성·실질금리·10Y → 예시값+`예시` 배지)와 beaconcha.in(검증자 큐·스테이킹 APR → "연결 필요"). 브라우저에서 직접 호출이 막힌 것이지 데이터가 없는 게 아니다. **cafe24 PHP 프록시 한 개**(서버 사이드 fetch → CORS 헤더 부착 반환, FRED 키 서버 은닉)로 둘 다 살린다. cafe24 PHP 가동·쓰기 가능 확인됨([[cafe24-php-backend]]), etf.php 선례 있음.

## 2. 목표 (사용자 확정)

- **FRED + beaconcha** 두 소스만 프록시(Frankfurter는 보통 CORS 열려 있어 직접 유지).
- **FRED 무료 키**를 발급받아 제공 → api.php 서버 파일에만 주입(클라이언트 미노출).
- 연결 시: 유동성 축 실데이터화(`예시` 배지 제거), 검증자 큐·스테이킹 APR 활성.

## 3. 비목표 (YAGNI)

- Frankfurter·기타 소스 프록시. Cloudflare Worker. 인증/회원. 다른 cafe24 파일·데이터 수정(api.php만 추가). 점수 산식·UI 변경.

## 4. api.php 설계 (cafe24 서버 프록시)

- 위치: `www/portal/signal/api.php`(scoopsignal.html과 동일 디렉토리 → 프론트→api.php 동일 출처).
- 인터페이스: `GET api.php?u=<urlencoded 업스트림 절대 URL>`.
- **호스트 화이트리스트**: `api.stlouisfed.org`, `beaconcha.in` 둘만. 그 외 호스트 → HTTP 403 + 에러 JSON. 경로 접두 제한: stlouisfed는 `/fred/`, beaconcha는 `/api/`로 시작해야 함(오픈 프록시 악용 차단).
- **FRED 키 주입**: 업스트림 호스트가 `api.stlouisfed.org`면 서버가 쿼리에 `api_key=$FRED_KEY` 부착(클라이언트 URL엔 키 없음). `$FRED_KEY=''`(빈 슬롯)면 부착 생략 → FRED 응답이 키 오류 → 프론트 폴백(예시값).
- **파일 캐시**: `cache/`(또는 `api_cache_<md5(u)>.json`), TTL = stlouisfed 3600s / beaconcha 600s. 캐시 유효 시 즉시 반환. 쓰기 실패해도 동작(캐시는 최적화).
- 응답: 업스트림 본문 그대로 + `Access-Control-Allow-Origin: *`, `Content-Type: application/json; charset=utf-8`. 업스트림 실패(타임아웃·비200)면 적절한 에러 JSON(`{"error":...}`) + 상태코드 → 프론트 try/catch 폴백.
- cURL: `CURLOPT_TIMEOUT 15`, `RETURNTRANSFER`, 리다이렉트 비허용 또는 안전 제한. User-Agent 지정(beaconcha 일부 차단 회피).
- **WAF 주의**: api.php는 실행 PHP라 `<?php` 정상(메모리 [[cafe24-waf-blocks-php-tags]]는 정적 파일 한정). 출력 JSON에 `<?` 리터럴 미포함.

## 5. 키 보안 (중요)

- **git 커밋본**: `$FRED_KEY=''` 빈 슬롯(secret 미커밋).
- **cafe24 업로드본에만** 실제 키 주입(배포 시 sed로 치환해 업로드, 레포엔 빈 슬롯 유지). etf.php의 `$SOSO_KEY` 철학과 동일.

## 6. 프론트 변경 (scoopsignal.html)

- config 추가: `const API_PROXY='./api.php';` 그리고 헬퍼 `const proxied=u=>API_PROXY+'?u='+encodeURIComponent(u);`.
- **`loadFred()`**: 게이트를 `if(!FRED_API_KEY||!FRED_PROXY)` → `if(!API_PROXY)`로. FRED URL을 **키 없이** 절대 URL로 구성(`https://api.stlouisfed.org/fred/series/observations?series_id=...&file_type=json&sort_order=desc&limit=...`) → `jget(proxied(url))`. 각 `try/catch`의 FALLBACK(예시값·`fb:true`) 유지. 성공 시 `fb:false`(배지 없음).
- **`loadBeacon()`**: beaconcha 두 URL(`/api/v1/validators/queue`, `/api/v1/ethstore/latest`)을 `jget(proxied(url))`로. 실패 시 기존 폴백(queue=null/warn, staking 예시).
- `FRED_API_KEY`/`FRED_PROXY` 상수: 미사용화(제거 또는 빈 값 유지). `FALLBACK` 유지(그레이스풀). `loadDollar`·기타 로더·`recompute`·UI 불변.
- 상태등(`setStatus('fred'/'beacon',...)`) 로직 유지 — 성공 시 ok로 갱신되도록(현 loadFred는 setStatus 호출 없음 → recompute에서 `setStatus('fred', S.netLiq&&!S.netLiq.fb ? 'ok':'warn')`로 판정하는 기존 흐름 유지).

## 7. 그레이스풀 / 검증 환경

- 로컬(file://·localhost): `./api.php` 없음 → 로더 fetch 실패 → 기존 폴백(예시/연결필요). 정상 — 라이브 cafe24에서만 실동작.
- 헤드리스는 api.php 부재라 FRED/beacon 폴백만 확인 가능. 실검증은 **cafe24 배포 후 `curl`**.

## 8. 검증

- **단위(라이브)**: `curl '.../signal/api.php?u=https%3A%2F%2Fapi.stlouisfed.org%2Ffred%2Fseries%2Fobservations%3Fseries_id%3DDGS10%26file_type%3Djson%26sort_order%3Ddesc%26limit%3D5'` → FRED JSON(observations) 반환(키 주입 동작). 화이트리스트 외 호스트(`?u=https://example.com`) → 403.
- **beaconcha**: `curl '.../api.php?u=https%3A%2F%2Fbeaconcha.in%2Fapi%2Fv1%2Fvalidators%2Fqueue'` → 큐 JSON.
- **프론트(라이브)**: FRED `예시` 배지 사라짐(순유동성·실질금리·10Y 실데이터), 데이터 상태등 FRED ok, 검증자 큐 활성. 유동성 축 점수가 실데이터 기반.
- 키 미주입 상태(배포 직후, 키 넣기 전): FRED는 예시 유지(폴백), beaconcha는 활성(키 불필요) — 단계적 동작 확인.
- 로컬 헤드리스: JS 에러 0, 폴백 정상(회귀 0). 점수·UI 회귀 0.

## 9. 엣지 / 주의

- 캐시 디렉토리 쓰기 권한(cafe24 PHP 쓰기 가능 — 메모리). 캐시 파일명에 `u` 원문 미사용(md5만) → 경로 주입 방지.
- 화이트리스트는 호스트+경로 접두 동시 검사(URL 파싱 후). `parse_url` 실패·비http(s) → 403.
- FRED 무료 쿼터(분당 120) — 캐시로 충분히 하회. 오픈 프록시 아님(화이트리스트).
- 프론트 `proxied()`는 동일 호스트 상대경로(`./api.php`)라 배포 위치 무관.
- jsiy 서버 데이터 불가침([[jsiy-never-touch-server-data]]) — api.php만 업로드, 다른 파일 미수정.
