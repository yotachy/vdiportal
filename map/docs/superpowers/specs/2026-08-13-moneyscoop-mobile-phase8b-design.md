# 머니스쿱 모바일 Phase 8b — 서버 지갑 원장

> 대상: `map/mobile/` + cafe24 서버 · 설계일 2026-08-13
> 선행: Phase 8a(`2026-08-12-moneyscoop-mobile-phase8a-design.md`) · `mobile/docs/design_handoff/SPEC-economy.md`
> 백로그 `mobile/docs/BACKLOG-mobile.md` 의 **🔥 다음 2번**.

## 무엇을 만드는가

지갑의 진실을 클라이언트에서 서버로 옮긴다. 지금 잔량은 `wallet-local-stub.js` 가 `localStorage` 에 들고 있어서
루팅된 기기에서 편집 가능하고, 출석 판정이 기기 시계를 믿고, 앱을 지웠다 깔면 5개를 다시 받는다.
`SPEC-economy.md` 가 *"되돌리기 어려운 둘"* 로 지목한 것 중 첫째가 원장의 위치다.

## 선행 확인 (2026-08-13 실측)

임시 프로브(`probe-a7f3c2.php`, 확인 후 삭제)로 cafe24 를 점검했다.

| | |
|---|---|
| PHP | 8.4.21p1 · apache2handler |
| PDO 드라이버 | **sqlite** · mysql · dblib · pgsql |
| SQLite | **3.26.0** |
| 실사용 왕복 | 생성 · 스키마 · 트랜잭션 · **unique 충돌** · 읽기 · 삭제 전부 통과 |
| 디렉토리 쓰기 · `flock` | 가능 · 가능 |

"확장이 있다"와 "이 호스팅에서 실제로 쓸 수 있다"는 다르므로 왕복을 다 돌렸다. 특히 **unique 충돌이 실제로
잡히는 것**을 확인했다 — 멱등키가 원장의 핵심이라 이게 안 되면 설계가 바뀐다.

**SQLite 3.26.0 은 2018년 판이다.** `UPSERT`(3.24+)는 쓸 수 있지만 **`RETURNING`(3.35+)과 `STRICT` 테이블
(3.37+)은 못 쓴다.** 삽입 후 잔량을 돌려받는 패턴을 쓸 수 없고, 트랜잭션 안에서 `insert` → `select` 로 간다.

### 같이 드러난 것 — 데이터 파일 공개 노출

서버 레이아웃을 보다가 `www/map/` 의 데이터 파일이 전부 URL 로 200 이라는 것을 확인했다:
`forge_td_key.txt`(**TwelveData API 키**) · `forge_data.json` · `map_data.json` · `forge_ohlc_cache_*` · `forge_predlog.json`.
2026-08-13 에 `www/map/.htaccess` 로 `\.(json|txt|db|sqlite|sqlite3)$` 를 차단했고, 차단 후에도
`api.php` 와 `forge-api.php?ohlc=1` 이 정상 동작함을 확인했다(응답의 `source:"twelvedata+inc"` 가 PHP 가
키를 읽었다는 증거). **노출됐던 키 자체의 교체는 사용자 몫으로 남아 있다.**

이 사건이 8b 의 저장 위치를 정했다 — 아래 §2.

## 정하고 들어가는 것

| 결정 | 값 | 근거 |
|---|---|---|
| API 위치 | **신규 `wallet-api.php` + `wallet-lib.php`** | `forge-api.php` 는 587줄에 PC 제품 전부를 지고 있다. 배포 사고 반경을 지갑으로 제한한다. SPEC §1 은 `forge-api.php` 라고 적었지만 그 줄을 고친다 |
| 원장 위치 | **`/parksvc/data/wallet.db` — 웹루트 밖** | 위 노출 사건. `.htaccess` 는 두 번째 방어선일 뿐 |
| Full 권리 | **종목별 24시간** | 일봉 분석이라 봉 하나가 새로 생기면 실제로 다른 분석이다. 과금 근거가 서고 "오늘 산 것을 오늘 안에 다시 본다"가 직관적이다 |
| 신원 | `device_id` + **HMAC 베어러 토큰** | `device_id` 만으로는 추측한 사람이 남의 지갑을 쓴다 |
| 스코프 | `accounts` · `ledger` · `runs` + `schema_version` | `ad_grants` 는 8d |
| 스텁 | **삭제**(교체 아님) | 규칙이 두 벌이면 갈린다 |

## 1. 파일

```
www/map/wallet-api.php     얇은 디스패처 — 입력 검증 · op 분기 · JSON 응답. 로직 없음
www/map/wallet-lib.php     DB 연결 · 마이그레이션 · 토큰 · 원장 트랜잭션
/parksvc/data/wallet.db    원장 (웹루트 밖)
/parksvc/data/wallet_secret.txt   HMAC 비밀키 (자동생성 · chmod 600)

map/tests/wallet.test.php  PHP 단위 테스트 (임시 DB)
map/mobile/www/wallet-http.js      MSWallet 용 HTTP 백엔드 어댑터
map/mobile/test/wallet-http.test.mjs
```

**`forge-api.php` 는 한 줄도 건드리지 않는다.**

## 2. 저장 위치와 실패 정책

서버 홈 `/parksvc/` 에는 `www` 만 있다 — 그 옆에 `data/` 를 만들 수 있고 웹에서 닿지 않는다.

**PHP 가 `/parksvc/data/` 에 쓸 수 있는지는 아직 미검증이다.** 프로브가 확인한 것은 `www/map/` 쓰기뿐이다.
구현 첫 단계에서 확인하고, **쓸 수 없으면 거기서 멈춘다 — 웹루트 안으로 조용히 폴백하지 않는다.**
조용한 폴백은 방금 고친 노출 사고를 그대로 재현하는 길이다. 폴백이 필요하다고 판단되면 사람이 결정한다.

## 3. 스키마

```sql
accounts(
  id           TEXT PRIMARY KEY,      -- sha1(device_id) 앞 16자
  device_id    TEXT UNIQUE NOT NULL,
  google_sub   TEXT,                  -- 8c 에서 채운다
  balance      INTEGER NOT NULL,      -- 캐시. 진실은 SUM(ledger.delta)
  streak_days  INTEGER NOT NULL,
  last_checkin TEXT,                  -- 'YYYY-MM-DD' (UTC)
  seed_ip_hash TEXT,                  -- 신규 지급 IP 상한용. 원본 IP 는 저장하지 않는다
  created_at   TEXT NOT NULL
)
ledger(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  delta      INTEGER NOT NULL,        -- 0 도 기록한다 (§5 참조)
  reason     TEXT NOT NULL,           -- seed|checkin|chest|spend|spend-cached|refund
  ref        TEXT,                    -- 종목 등
  idem       TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
)
runs(
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id     TEXT NOT NULL,
  symbol         TEXT NOT NULL,
  tier           TEXT NOT NULL,
  engine_version TEXT,
  created_at     TEXT NOT NULL,
  expiry         TEXT NOT NULL        -- ISO8601 UTC
)
schema_version(v INTEGER NOT NULL)
```

인덱스: `ledger(account_id)` · `runs(account_id, symbol, tier, expiry)`.

**`ad_grants` 는 만들지 않는다** — 8d 것이다. 대신 `schema_version` + 마이그레이션 러너(~15줄)를 지금 넣는다.
8c(구글 계정 병합)와 8d 가 둘 다 스키마를 건드리므로, 없으면 그때 손으로 `ALTER TABLE` 을 치게 된다.

## 4. 돈 불변식

1. **`ledger.idem UNIQUE` 가 이중 과금을 DB 층에서 막는다.** 애플리케이션 검사에 의존하지 않는다 —
   모바일망은 재시도하고, 두 요청이 겹치면 검사와 삽입 사이가 벌어진다.
2. **`accounts.balance` 는 캐시, 진실은 `SUM(ledger.delta)`.** `get` 이 둘을 대조해 어긋나면 원장 기준으로
   고치고 그 사실을 남긴다. 캐시가 진실이 되면 "내 스쿱 어디 갔나"에 답할 수 없다.
3. **차감과 권리 부여는 한 트랜잭션.** `BEGIN IMMEDIATE` → 잔량 확인 → `ledger` 삽입 → `runs` 삽입 → `COMMIT`.
   SQLite 는 파일 락이라 `BEGIN IMMEDIATE` 로 쓰기 락을 먼저 잡아야 동시 요청에서 경합이 나지 않는다.
   `busy_timeout` 을 5초로 둔다.
4. **잔량은 음수가 될 수 없다.** 트랜잭션 안에서 확인하고, 모자라면 롤백 후 `insufficient`.

## 5. op 계약

8a 의 `MSWallet` 이 이미 정한 모양을 서버가 맞춘다. 응답은 전부
`{ok, state, reason?}` 이고 `state = {balance, cap, streakDays, canCheckin}` 이다.

| op | 입력 | 응답 |
|---|---|---|
| `hello` | `deviceId` | `{ok, token, state}` — 없으면 계정 생성 + 5개 지급 |
| `get` | — | `{ok, state}` |
| `spend` | `runType, idem, ref?` | `{ok, state, charged, reason?}` |
| `refund` | `idem` | `{ok, state, reason?}` |
| `checkin` | — | `{ok, state, granted, capped, reason?}` |
| `ping` | — | `{ok, schema, php, sqlite}` — 배포 확인용. 계정도 잔량도 건드리지 않는다 |

`hello` 와 `ping` 외의 모든 op 는 `Authorization: Bearer <token>` 을 요구한다. `ping` 은 스키마 버전과
런타임 버전만 돌려주고 **사용자 데이터를 일절 노출하지 않는다** — 그래야 열어둬도 안전하다.

**`spend` 의 권리 판정은 서버가 한다.** 클라이언트는 "이건 공짜"를 결정하지 않고 항상 `spend` 를 보낸다:

```
full + ref=AAPL → 유효한 runs 행 있음? 예   → charged:false, 차감 0
                                       아니오 → 3 차감 + runs(expiry = now+24h)
scan(2) · slot(1) → 종목 권리가 아니라 단순 차감
```

**`charged:false` 인 경우에도 `ledger` 에 `delta 0` 행을 남긴다**(`reason:"spend-cached"`).
그래야 `idem` 이 항상 기록되고 재시도 재생이 한 가지 규칙으로 돈다. 안 남기면 무료 경로만
멱등키가 없어서, 같은 요청이 두 번 오면 두 번째가 유료 경로로 빠질 수 있다.

**`refund` 는 그 자체로 멱등이다** — 보상 행의 키를 `<원래 idem>:refund` 로 둔다. 원래 행이 없거나 이미
환급됐으면 `reason` 을 돌려준다. **환급은 지갑 상한을 넘겨도 깎지 않는다** — 가져간 것을 돌려주는 것이라
상한으로 깎으면 훔치는 셈이 된다.

## 6. 신원

`forge-auth-lib.php` 의 HMAC 패턴을 쿠키 대신 베어러 토큰으로 쓴다.

```
token = b64url(device_id) | exp | b64url(HMAC-SHA256(device_id|exp, secret))
```

검증은 `hash_equals` 로 상수시간 비교하고 **fail-closed**(변조·만료 = 거부). 비밀키는 없으면 자동생성
(`random_bytes(32)`) 후 `chmod 600`, **웹루트 밖**에 둔다.

**정직하게 남기는 한계**: 재설치하면 새 `device_id` 가 생겨 5개를 또 받는다. `device_id` 가 클라이언트
생성인 한 완전히 막을 수 없다. 8b 는 **IP 해시당 하루 신규 계정 지급 상한**(기본 3)으로 완화만 한다.
원본 IP 는 저장하지 않고 해시만 남긴다. 진짜 해결은 8c(구글 로그인)다.

## 7. 서버 시간과 상한

전부 **서버 UTC 기준**이다. 기기 시계를 바꿔서 얻는 것이 없어야 한다(SPEC §3).

| 값 | |
|---|---|
| 최초 지급 | 5 |
| 지갑 상한 | 20 |
| 출석 | +1 (UTC 날짜가 바뀌면 1회) |
| 7일 스트릭 상자 | +5 |

스트릭은 어제 출석했으면 +1, 하루라도 끊기면 1로 돌아간다. 상한 초과분은 **버려지고** `checkin` 이
`capped:true` 를 돌려준다 — 8a 의 `wallet.js` 주석이 *"빠지면 그 안내가 조용히 사라진다"* 고 못박은 필드다.

## 8. 클라이언트

- **신규 `www/wallet-http.js`** — `MSWallet.install()` 에 넣을 HTTP 백엔드. `fetch` 로 `wallet-api.php` 를
  호출하고, 토큰을 `MSStore` 에 보관하며, 401 을 받으면 `hello` 로 한 번 재발급을 시도한다.
- **`www/wallet-local-stub.js` 삭제** + 그 테스트 파일 삭제. 지금 로컬에 쌓인 잔량은 개발용이라 이관하지 않고
  모두 서버에서 5개로 시작한다.
- `MSWallet.spend(runType, idem)` → **`spend(runType, idem, ref)`** 로 한 칸 확장. `ref` 는 종목이며
  `ledger.ref` 에 그대로 들어간다. 호출부(`screens/report.js` 의 Full 구매, `screens/watchlist.js` 의 스캔)를 함께 고친다.
- **서버가 안 닿으면 잔량을 캐시하지 않는다.** 지갑 화면은 "사용할 수 없음", 지출 버튼은 비활성.
  클라이언트가 잔량을 들고 있으면 SPEC §1 이 경고한 그 상태로 되돌아간다.
- `screens/report.js` 의 모듈 스코프 `purchases` 는 남긴다 — 화면 안 재렌더용 캐시이고, 진실은 서버의
  `runs` 다. 앱을 다시 켜도 산 것이 살아남는 것은 서버가 해결한다.

## 9. 검증

**PHP 를 로컬에서 돌릴 수 있어야 한다** — `sudo apt install -y php-cli php-sqlite3`. 없으면 돈 로직이
코드 리뷰로만 검증된다. 이번 브랜치에서 "테스트는 초록인데 화면이 틀린" 결함이 12건 나왔고 그건 돈이 아니었다.

`map/tests/wallet.test.php` — 임시 DB 에 대해:

| 검사 | 왜 |
|---|---|
| 같은 `idem` 두 번 → 한 번만 수금, 두 번째는 같은 결과 재생 | 이중 과금 |
| 동시 `spend` 2건 → 잔량이 음수로 안 간다 | 트랜잭션 |
| 잔량 부족 → 롤백, `insufficient`, `ledger` 에 아무 것도 안 남음 | |
| 24h 안 재요청 → `charged:false`, 차감 0, `spend-cached` 행 | 권리 |
| 24h 지난 뒤 → 다시 과금 | |
| 상한 초과 출석 → 초과분 버려지고 `capped:true` | |
| 스트릭 7일차 → +1+5, 하루 끊기면 1로 | |
| `refund` 두 번 → 한 번만, 상한 무시 | |
| 위조 토큰 · 만료 토큰 → 거부 | fail-closed |
| `balance` 캐시 손상 → `get` 이 원장 기준으로 고침 | |

`map/tests/run.sh` 에 `wallet` 스위트를 추가한다. php 가 없는 환경에서는 **`건너뜀 (php 없음)` 으로
표시하고 종료코드는 통과**로 둔다 — 모바일 스위트가 `mobile/node_modules` 없을 때와 같은 모양이다.
다만 그건 관문이 돈 로직을 **검사하지 않았다**는 뜻이므로, 요약줄에 건너뛴 스위트를 명시하고
**배포 전에는 php 가 있는 환경에서 통과시킨 것을 확인한다.** 조용히 초록으로 보이는 것이 이 저장소에서
반복해서 문제였다.

클라이언트는 `wallet-http.test.mjs` 에서 가짜 `fetch` 로 검사한다 — 401 재발급 한 번만 시도하는가,
토큰을 실어 보내는가, 네트워크 실패가 `{ok:false}` 로 떨어지는가.

## 10. 배포

정적 파일과 달리 **순서가 있다**:

1. `/parksvc/data/` 생성(SFTP `mkdir`) → PHP 쓰기 가능 여부 확인. **불가하면 중단.**
2. `wallet-lib.php` · `wallet-api.php` 업로드 → `?op=ping` 으로 스키마 생성·마이그레이션 확인
3. 클라이언트(`wallet-http.js` 등) 배포
4. `wallet.db` 는 **배포 불가침** — 이후 어떤 배포도 덮어쓰지 않는다

`wallet.db` · `wallet_secret.txt` 는 `.gitignore` 대상이 아니다(웹루트 밖 서버 파일이라 저장소에 없다).
저장소에는 스키마와 코드만 있다.

## 11. 범위 밖

- **8c 구글 로그인·계정 병합** — `accounts.google_sub` 자리만 비워 둔다.
- **8d AdMob SSV** — `ad_grants` 테이블도 만들지 않는다.
- **SPEC §5 "비답변에 과금 금지"** — `refund` op 는 만들지만 *언제 부를 것인가*("판정 없음"의 판별 기준)는
  정하지 않는다. `verdict.regime` 중립 + `confluence.agree` 임계를 어디에 둘지가 별도 과제다.
- **노출된 TwelveData 키 교체** — 사용자 계정 작업.
