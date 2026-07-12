# 스쿱포지 인증 + 사용자별 데이터 분리 — 설계

날짜: 2026-07-13 · 상태: 승인됨(사용자). 유료화 티어1의 기술 파트 1(인증). 결제는 별도 스펙.

## 결정 사항 (브레인스토밍 합의)

- **인증 수단: Google OAuth 단일**(비밀번호 없음). 추후 제공자 추가 가능한 구조로만.
- **비로그인 = 체험 모드**: 샘플 포지 + 임시 작업(브라우저 로컬, 서버 저장 없음). 모든 분석 기능 동작(**게이팅 없음** — 열린 엔진/유·무료 최후 결정 지침). 저장·워치리스트·알림은 로그인 유도.
- **기존 데이터 귀속**: admin 이메일(moneyscdev@gmail.com)이 첫 로그인하는 순간 레거시 `forge_data.json`/`forge_images.json`을 그 계정 파일로 **복사**(1회성·원본 보존 — 서버 데이터 불가침).
- **세션 방식: HMAC 서명 쿠키(무상태)** — `forge-auth.php`와 `forge-api.php`가 세션 저장소 공유 없이 동일 쿠키 검증(PHP 파일 세션의 GC/공유 이슈 회피). Firebase 등 외부 SDK 배제(무라이브러리 관례).

## 구성 요소

### 1. `forge-auth.php` (신규)

| 엔드포인트 | 동작 |
|---|---|
| `?login=1` | `state` 난수(HMAC 서명, 10분 만료) 쿠키 설정 → Google authorization code URL로 리다이렉트 |
| `?code=`(콜백) | `state` 검증 → 코드를 토큰으로 교환(서버 시크릿) → userinfo에서 email 확인 → `fauth` 쿠키 설정 → `forge.html` 리다이렉트 |
| `?me=1` | 쿠키 유효 시 `{ok, email, name}` / 아니면 `{ok:false}` |
| `?logout=1` | 쿠키 삭제 → forge.html 리다이렉트 |

- `fauth` 쿠키 = `base64url(email)|exp(unix)|HMAC-SHA256(email|exp, secret)` · HttpOnly·Secure·SameSite=Lax·30일.
- 서버 파일(전부 gitignore·배포 불가침): `forge_google_oauth.json`(`{client_id, client_secret}` — **사용자가 GCP 콘솔에서 생성 후 업로드**, 리다이렉트 URI `https://parksvc.mycafe24.com/map/forge-auth.php`), `forge_auth_secret.txt`(최초 접근 시 자동 생성 32바이트), `forge_admin.txt`(admin 이메일 1줄).
- OAuth 설정 파일 없으면 `?login=1`이 `{ok:false, error:"oauth_unset"}` — 배포는 먼저, 활성화는 키 업로드 시.

### 2. `forge-api.php` 확장 (사용자별 데이터)

- 공용 헬퍼 `fauth_email()`: 쿠키 파싱·HMAC·만료 검증 → email | null. (auth와 동일 로직 — `forge-auth-lib.php` 공유 include, 두 파일 모두 require)
- uid = `substr(sha1(strtolower(email)), 0, 16)`.
- 문서 경로 분기: 로그인 → `forge_data_{uid}.json` / `forge_images_{uid}.json`. 비로그인 → **GET `null`·`?images=1` `{}`** 반환, **POST(문서·이미지 계열 op) 401**.
- **레거시 이관(1회)**: 요청 사용자의 email == admin && `forge_data_{uid}.json` 미존재 && 레거시 `forge_data.json` 존재 → copy(원본 유지). images 동일.
- **전역 유지**: `forge_predlog.json`(라이브 트랙레코드 = 전체 사용자 공유 실측 — 의도), OHLC·실적 캐시, `forge_jobs.json`(비전 큐). `?ohlc`/`?earndate`/`?predledger`는 비로그인도 허용(읽기 전용 공용). **`logpred`는 로그인 사용자만**(체험 모드가 공유 원장 오염 방지).
- 락·원자적 쓰기·GC 규약은 기존 파일별 패턴 그대로(파일명만 uid 접미).

### 3. 클라이언트 (forge-app/ui/html)

- 부팅: `forge-auth.php?me=1` 조회(1회) → `AUTH = {on, email}` 전역.
  - **로그인**: 기존 서버 모드 흐름 그대로(boot→loadDoc). 헤더 = 이메일 앞부분 뱃지 + 로그아웃.
  - **비로그인(체험)**: `SERVER_OK`여도 문서 저장 계열 비활성 — 샘플 포지 시드(기존 빈 부팅 시드 재사용), 저장 배지 **"체험 모드 · 저장 안 됨"**, `markDirty`/`writeBackActive`/`saveMeta`/`putImg` no-op + 최초 1회 "로그인하면 저장됩니다" 토스트, `logPrediction` 스킵, 워치리스트·알림은 샘플 문서 한정 동작.
- 헤더 Google 버튼: `authSoon()` → `location.href="forge-auth.php?login=1"`. 로그인 상태면 버튼 자리를 `email · 로그아웃`으로 교체.
- 콜백 복귀 시 `?login=ok` 쿼리로 토스트("로그인됨 — 내 포지로 전환") 후 쿼리 제거(history.replaceState).

## 오류·엣지

- 쿠키 만료/변조 → `?me=1` false → 체험 모드로 자동 강등(파괴 없음), 다음 저장 시도 시 로그인 유도.
- OAuth 교환 실패/state 불일치 → `forge.html?login=fail` 리다이렉트 + 토스트.
- 인증 검증은 **fail-closed**(기존 map_key fail-open과 다름 — 사용자 데이터 보호).
- cafe24 POST 128KB 상한·flock 원자쓰기 규약 유지.

## 검증

- PHP: 브레이스 균형 대조 + 라이브 스모크(`?me=1` 비로그인 `{ok:false}` · 문서 GET null · POST 401 · `?ohlc` 정상).
- 클라: 헤드리스 — me mock으로 체험 모드 부팅(샘플 시드·저장 배지·no-op), 로그인 mock으로 서버 모드 경로.
- 실계정 E2E: 사용자 GCP 클라이언트 등록·업로드 후(admin 첫 로그인 = 이관 확인).

## 범위 제외 (후속)

- 결제·구독(별도 스펙), 이메일/카카오 제공자, 관리자 콘솔, 사용자별 비전 큐 분리, map.html 등 타 도구 인증.
