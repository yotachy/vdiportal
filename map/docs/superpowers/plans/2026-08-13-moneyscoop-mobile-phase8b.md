# Phase 8b — 서버 지갑 원장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지갑의 진실을 `localStorage` 에서 서버 SQLite 원장으로 옮기고, 개발용 스텁을 삭제한다.

**Architecture:** 신규 `wallet-api.php`(얇은 디스패처) + `wallet-lib.php`(원장 로직)가 웹루트 밖 `/parksvc/data/wallet.db` 를 쓴다. 클라이언트는 `wallet-http.js` 어댑터로 기존 `MSWallet` 계약에 꽂는다. `forge-api.php` 는 건드리지 않는다.

**Tech Stack:** PHP 8.4 · PDO SQLite 3.26.0 · 바닐라 JS(ES5) · `node --test` + 순수 PHP 테스트 러너. 프레임워크·컴포저 없음.

설계서: `map/docs/superpowers/specs/2026-08-13-moneyscoop-mobile-phase8b-design.md`

## Global Constraints

- **선행 준비물**: 로컬에 `php-cli` + `php-sqlite3`. 없으면 Task 1~5 의 테스트를 쓸 수 없다. `php -m | grep -i sqlite` 로 확인하고, 없으면 **BLOCKED 로 보고할 것** — 돈 로직을 코드 리뷰로만 검증하지 않는다.
- **`map/forge-api.php` · `map/forge-core.js` · `map/forge-tools.js` 를 건드리지 않는다.** `map/mobile/www/vendor/` 도 마찬가지(생성물).
- **테스트 관문**: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh`. 현재 **676건**(forge-core 259 · forge-tools 81 · landing 28 · moneyscoop-mobile 308). 앞의 셋은 **불변**이어야 한다.
- ES5 in `map/mobile/www/**`: `var`/`function` 만. 화살표함수·템플릿리터럴·optional chaining·`const`/`let` 금지. `map/mobile/test/**` 는 ESM 이라 최신 문법 허용.
- PHP 는 `<?php` 로 열고 닫는 `?>` 를 쓰지 않는다(후행 출력 방지). 들여쓰기 2 spaces, 큰따옴표.
- UI 문자열은 `map/mobile/www/strings.js`. 한국어는 코드 주석에만, WHY 만 적는다.
- **원장 파일은 웹루트 밖.** PHP 가 거기 못 쓰면 **거기서 멈춘다** — 웹루트 안으로 폴백하지 않는다.
- **금액 상수는 서버가 정본이다.** 클라이언트 `MSWallet.COSTS` 는 미리보기 표시용이고, 실제 차감은 서버 값으로만 일어난다.
- 서버 시간은 전부 **UTC**(`gmdate`). 기기 시계로 얻는 것이 없어야 한다.

---

## 목표 상수 (설계서 §7 · 8a 스텁에서 승계)

```
SEED 5 · CAP 20 · CHECKIN +1 · CHEST +5 (7일마다) · IP당 하루 신규계정 3
COSTS: full 3 · custom 5 · slot 1 · scan 2
권리: full·custom 만 종목별 24시간. scan·slot 은 단순 차감
```

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `map/wallet-lib.php` | DB·마이그레이션·토큰·원장 트랜잭션. HTTP 를 모른다 | **신규** |
| `map/wallet-api.php` | 요청 파싱·토큰 검증·op 분기·JSON 응답. 로직 없음 | **신규** |
| `map/tests/wallet.test.php` | 원장 단위 테스트(임시 DB) | **신규** |
| `map/tests/run.sh` | `wallet` 스위트 추가 | 수정 |
| `map/mobile/www/wallet-http.js` | `MSWallet` 용 HTTP 백엔드 어댑터 | **신규** |
| `map/mobile/test/wallet-http.test.mjs` | 어댑터 테스트(가짜 fetch) | **신규** |
| `map/mobile/www/wallet.js` | `spend(runType, idem, ref)` 로 확장 | 수정 |
| `map/mobile/www/app.js:116-118` | 스텁 대신 HTTP 백엔드 설치 | 수정 |
| `map/mobile/www/index.html` | 스크립트 태그 교체 | 수정 |
| `map/mobile/www/screens/report.js:308` | `spend("full", idem, sym)` | 수정 |
| `map/mobile/www/wallet-local-stub.js` | **삭제** | 삭제 |
| `map/mobile/test/wallet-local-stub.test.mjs` | **삭제** | 삭제 |
| `map/mobile/docs/BACKLOG-mobile.md` | 완료 기록 | 수정 |

`wallet-lib.php` 가 HTTP 를 모르는 것이 핵심이다 — 그래야 `wallet.test.php` 가 웹서버 없이 원장을 직접 돌릴 수 있다.

---

## Task 1: PHP 테스트 러너 + 스키마 + 마이그레이션

**Files:**
- Create: `map/wallet-lib.php`
- Create: `map/tests/wallet.test.php`
- Modify: `map/tests/run.sh`

**Interfaces:**
- Produces:
  - `W_SEED`(5) · `W_CAP`(20) · `W_CHECKIN`(1) · `W_CHEST`(5) · `W_CHEST_EVERY`(7) · `W_IP_DAILY`(3) 상수
  - `w_costs() -> array` — `["full"=>3,"custom"=>5,"slot"=>1,"scan"=>2]`
  - `w_now() -> string` (ISO8601 UTC) · `w_today() -> string` (`YYYY-MM-DD` UTC)
  - `w_db(string $dir) -> PDO` — 디렉토리를 만들고 열고 마이그레이션까지 마친 핸들
  - `w_schema_version(PDO $db) -> int`

- [ ] **Step 1: 준비물 확인. 없으면 멈춘다**

Run: `php -v && php -m | grep -iE "^(pdo_sqlite|sqlite3)$"`
Expected: PHP 버전 + `pdo_sqlite` 출력. 둘 중 하나라도 없으면 **BLOCKED** 로 보고하고 진행하지 말 것.

- [ ] **Step 2: 실패하는 테스트를 먼저 쓴다**

`map/tests/wallet.test.php` 를 만든다. **출력 형식이 `run.sh` 의 파서와 맞아야 한다** — node 와 같은 `ℹ pass N` / `ℹ fail N` 을 낸다.

```php
<?php
// 지갑 원장 단위 테스트. 프레임워크 없이 돌린다 — 이 저장소엔 컴포저가 없다.
// 출력은 node --test 와 같은 'ℹ pass N' / 'ℹ fail N' 형식이다. run.sh 가 그 형식만 읽는다.
require_once __DIR__ . "/../wallet-lib.php";

$PASS = 0; $FAIL = 0; $MSGS = [];
function t($name, $fn) {
  global $PASS, $FAIL, $MSGS;
  try { $fn(); $PASS++; }
  catch (Throwable $e) { $FAIL++; $MSGS[] = "not ok - " . $name . ": " . $e->getMessage(); }
}
function ok($cond, $msg) { if (!$cond) throw new Exception($msg); }
function eq($a, $b, $msg) {
  if ($a !== $b) throw new Exception($msg . " — got " . var_export($a, true) . ", want " . var_export($b, true));
}

// 테스트마다 새 임시 디렉토리. 상태가 새면 순서 의존이 생긴다.
function tmpdir() {
  $d = sys_get_temp_dir() . "/wtest-" . bin2hex(random_bytes(6));
  mkdir($d, 0700, true);
  return $d;
}
function rmrf($d) {
  foreach (glob($d . "/*") as $f) { is_dir($f) ? rmrf($f) : @unlink($f); }
  @rmdir($d);
}

t("스키마가 생성되고 버전이 기록된다", function () {
  $d = tmpdir();
  $db = w_db($d);
  ok(is_file($d . "/wallet.db"), "wallet.db 가 안 생겼다");
  ok(w_schema_version($db) >= 1, "schema_version 이 0 이다");
  $names = [];
  foreach ($db->query("select name from sqlite_master where type='table'") as $r) { $names[] = $r["name"]; }
  foreach (["accounts", "ledger", "runs", "schema_version"] as $want) {
    ok(in_array($want, $names, true), "테이블 없음: " . $want);
  }
  ok(!in_array("ad_grants", $names, true), "ad_grants 는 8d 것이다 — 만들지 않는다");
  $db = null; rmrf($d);
});

t("두 번 열어도 마이그레이션이 다시 돌지 않는다", function () {
  $d = tmpdir();
  $db1 = w_db($d); $v1 = w_schema_version($db1); $db1 = null;
  $db2 = w_db($d); $v2 = w_schema_version($db2);
  eq($v2, $v1, "재실행에서 버전이 움직였다");
  $db2 = null; rmrf($d);
});

t("ledger.idem 은 UNIQUE 다 — DB 층에서 막아야 한다", function () {
  $d = tmpdir(); $db = w_db($d);
  $ins = "insert into ledger (account_id, delta, reason, ref, idem, created_at) values ('a', -3, 'spend', 'AAPL', 'k1', '2026-01-01T00:00:00+00:00')";
  $db->exec($ins);
  $threw = false;
  try { $db->exec($ins); } catch (Throwable $e) { $threw = true; }
  ok($threw, "같은 idem 두 번이 들어갔다 — 이중 과금이 가능해진다");
  $db = null; rmrf($d);
});

t("쓸 수 없는 디렉토리면 예외를 던진다 — 조용히 폴백하지 않는다", function () {
  $threw = false;
  try { w_db("/proc/nonexistent-wallet-dir"); } catch (Throwable $e) { $threw = true; }
  ok($threw, "못 쓰는 경로에서 조용히 성공했다");
});

t("시각은 UTC 다", function () {
  eq(strlen(w_today()), 10, "w_today 형식이 YYYY-MM-DD 가 아니다");
  eq(w_today(), gmdate("Y-m-d"), "w_today 가 UTC 가 아니다");
  ok(strpos(w_now(), gmdate("Y-m-d")) === 0, "w_now 가 UTC 날짜로 시작하지 않는다");
});

t("금액 상수가 시안 값과 같다", function () {
  $c = w_costs();
  eq($c["full"], 3, "full");
  eq($c["custom"], 5, "custom");
  eq($c["slot"], 1, "slot");
  eq($c["scan"], 2, "scan");
  eq(W_SEED, 5, "SEED"); eq(W_CAP, 20, "CAP");
  eq(W_CHECKIN, 1, "CHECKIN"); eq(W_CHEST, 5, "CHEST"); eq(W_CHEST_EVERY, 7, "CHEST_EVERY");
});

foreach ($MSGS as $m) { echo $m, "\n"; }
echo "ℹ pass ", $PASS, "\n";
echo "ℹ fail ", $FAIL, "\n";
exit($FAIL ? 1 : 0);
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && php tests/wallet.test.php`
Expected: FAIL — `Failed opening required '../wallet-lib.php'`

- [ ] **Step 4: `map/wallet-lib.php` 를 만든다**

```php
<?php
// 머니스쿱 지갑 원장. HTTP 를 모른다 — 그래야 웹서버 없이 tests/wallet.test.php 로 돌릴 수 있다.
// 진실은 ledger 이고 accounts.balance 는 캐시다(SPEC-economy §1).
//
// ⚠ cafe24 의 SQLite 는 3.26.0(2018)이다. UPSERT(3.24+)는 되지만 RETURNING(3.35+)과
// STRICT 테이블(3.37+)은 못 쓴다 — 삽입 후 값을 돌려받는 패턴을 쓰지 말 것.

define("W_SEED", 5);
define("W_CAP", 20);
define("W_CHECKIN", 1);
define("W_CHEST", 5);
define("W_CHEST_EVERY", 7);
define("W_IP_DAILY", 3);          // IP 해시당 하루 신규 계정 지급 상한(재설치 남용 완화)
define("W_RUN_TTL_SEC", 86400);   // Full 권리 24시간

// 서버가 정본이다. 클라이언트의 MSWallet.COSTS 는 미리보기 표시용일 뿐이다.
function w_costs() { return array("full" => 3, "custom" => 5, "slot" => 1, "scan" => 2); }
// 종목별 권리를 갖는 등급. scan·slot 은 단순 차감이라 여기 없다.
function w_entitled_types() { return array("full", "custom"); }

function w_now() { return gmdate("c"); }
function w_today() { return gmdate("Y-m-d"); }
function w_day_add($ymd, $n) { return gmdate("Y-m-d", strtotime($ymd . " UTC") + $n * 86400); }

function w_db($dir) {
  if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
    throw new Exception("지갑 데이터 디렉토리를 만들 수 없다: " . $dir);
  }
  if (!is_writable($dir)) {
    // 여기서 멈춘다. 웹루트 안으로 폴백하면 원장이 URL 로 다운로드된다 —
    // 2026-08-13 에 forge_td_key.txt 가 그렇게 공개돼 있었다.
    throw new Exception("지갑 데이터 디렉토리에 쓸 수 없다: " . $dir);
  }
  $db = new PDO("sqlite:" . $dir . "/wallet.db");
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
  $db->exec("pragma busy_timeout = 5000");   // 동시 요청이 즉시 실패하지 않게
  $db->exec("pragma journal_mode = WAL");
  $db->exec("pragma foreign_keys = on");
  @chmod($dir . "/wallet.db", 0600);
  w_migrate($db);
  return $db;
}

function w_schema_version($db) {
  try {
    $r = $db->query("select v from schema_version limit 1")->fetch();
    return $r ? (int)$r["v"] : 0;
  } catch (Throwable $e) { return 0; }
}

// 8c(구글 계정 병합)와 8d(ad_grants)가 둘 다 스키마를 건드린다.
// 러너가 없으면 그때 손으로 ALTER TABLE 을 치게 된다.
function w_migrate($db) {
  $v = w_schema_version($db);
  if ($v < 1) {
    $db->exec("create table if not exists accounts (
      id TEXT PRIMARY KEY, device_id TEXT UNIQUE NOT NULL, google_sub TEXT,
      balance INTEGER NOT NULL DEFAULT 0, streak_days INTEGER NOT NULL DEFAULT 0,
      last_checkin TEXT, seed_ip_hash TEXT, created_at TEXT NOT NULL)");
    $db->exec("create table if not exists ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL,
      delta INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT,
      idem TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL)");
    $db->exec("create table if not exists runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL,
      symbol TEXT NOT NULL, tier TEXT NOT NULL, engine_version TEXT,
      created_at TEXT NOT NULL, expiry TEXT NOT NULL)");
    $db->exec("create index if not exists ix_ledger_acct on ledger (account_id)");
    $db->exec("create index if not exists ix_runs_lookup on runs (account_id, symbol, tier, expiry)");
    $db->exec("create index if not exists ix_accounts_ip on accounts (seed_ip_hash, created_at)");
    $db->exec("create table if not exists schema_version (v INTEGER NOT NULL)");
    $db->exec("delete from schema_version");
    $db->exec("insert into schema_version (v) values (1)");
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && php tests/wallet.test.php`
Expected: `ℹ pass 6` / `ℹ fail 0`, 종료코드 0

- [ ] **Step 6: `run.sh` 에 wallet 스위트를 붙인다**

`map/tests/run.sh` 의 landing 블록 **뒤**에 넣는다:

```bash
if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "wallet" ]; then
  if command -v php >/dev/null 2>&1; then
    run_suite "wallet" "$ROOT" php tests/wallet.test.php
  else
    # 조용히 통과시키지 않는다 — 돈 로직을 검사하지 않았다는 사실이 보여야 한다.
    printf '── %-22s 건너뜀 (php 없음 — 돈 로직 미검사)\n' "wallet"
    SKIPPED+=("wallet")
  fi
fi
```

`SKIPPED=()` 를 `FAILED=()` 옆에 선언하고, 요약 블록을 고쳐 건너뛴 스위트를 반드시 찍는다:

```bash
echo
if [ ${#SKIPPED[@]} -ne 0 ]; then
  echo "건너뜀: ${SKIPPED[*]} — 이 스위트는 검사되지 않았다"
fi
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "전체 통과 — ${TOTAL}건"
  exit 0
fi
```

`SCOPE` 안내 주석(파일 상단)에 `./tests/run.sh wallet` 을 추가한다.

- [ ] **Step 7: 전량 관문 + 커밋**

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh`
Expected: 676 → 682건. forge-core 259 · forge-tools 81 · landing 28 불변.

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/tests/wallet.test.php map/tests/run.sh
git commit -m "$(cat <<'EOF'
8b: 지갑 원장 스키마 + PHP 테스트 러너

돈 코드라 배포 전에 부술 수 있어야 한다. wallet-lib.php 는 HTTP 를 모르게
짜서 웹서버 없이 tests/wallet.test.php 로 직접 돌린다. 테스트 출력은 node
--test 와 같은 'ℹ pass N' 형식이라 run.sh 파서에 그대로 붙는다.

못 쓰는 디렉토리에서 예외를 던지는 것을 테스트로 박았다 — 웹루트 안으로
조용히 폴백하면 원장이 URL 로 다운로드된다. 오늘 forge_td_key.txt 가
그 상태였다.

ad_grants 는 만들지 않는다(8d). 대신 schema_version + 마이그레이션 러너를
지금 넣는다 — 8c·8d 가 둘 다 스키마를 건드린다.

php 가 없는 환경에서는 run.sh 가 '건너뜀 (돈 로직 미검사)' 로 표시하고
요약줄에도 남긴다. 조용히 초록으로 보이면 안 된다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 계정 · 시드 지급 · 잔량 재조정

**Files:**
- Modify: `map/wallet-lib.php`
- Modify: `map/tests/wallet.test.php`

**Interfaces:**
- Consumes: Task 1 의 `w_db` · `w_now` · `w_today` · 상수
- Produces:
  - `w_account_id(string $deviceId) -> string` — `substr(sha1($deviceId), 0, 16)`
  - `w_get_account(PDO $db, string $deviceId) -> array|null`
  - `w_create_account(PDO $db, string $deviceId, ?string $ipHash) -> array` — 시드 지급 포함
  - `w_true_balance(PDO $db, string $acctId) -> int` — `SUM(ledger.delta)`
  - `w_state(PDO $db, array $acct) -> array` — `["balance","cap","streakDays","canCheckin"]`, 캐시 어긋나면 원장 기준으로 교정
  - `w_seed_count_today(PDO $db, ?string $ipHash) -> int`

- [ ] **Step 1: 테스트를 먼저 쓴다**

`wallet.test.php` 의 출력 블록 **앞**에 추가한다.

```php
t("새 기기는 계정이 생기고 5개를 받는다 — 원장에도 남는다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  eq($a["balance"], 5, "시드 잔량");
  eq(w_true_balance($db, $a["id"]), 5, "원장 합계");
  $r = $db->query("select reason, delta from ledger where account_id='" . $a["id"] . "'")->fetch();
  eq($r["reason"], "seed", "원장 사유");
  eq((int)$r["delta"], 5, "원장 델타");
  $db = null; rmrf($d);
});

t("같은 device_id 로 두 번 만들면 두 번째는 실패한다 — 시드 재지급 금지", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-1", null);
  $threw = false;
  try { w_create_account($db, "dev-1", null); } catch (Throwable $e) { $threw = true; }
  ok($threw, "같은 기기에 두 번 지급됐다");
  eq(w_true_balance($db, w_account_id("dev-1")), 5, "잔량이 늘었다");
  $db = null; rmrf($d);
});

t("account_id 는 device_id 에서 결정적으로 나온다", function () {
  eq(w_account_id("dev-1"), w_account_id("dev-1"), "같은 입력에 다른 id");
  ok(w_account_id("dev-1") !== w_account_id("dev-2"), "다른 입력에 같은 id");
  eq(strlen(w_account_id("dev-1")), 16, "id 길이");
});

t("balance 캐시가 손상되면 get 이 원장 기준으로 고친다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  $db->exec("update accounts set balance = 999 where id = '" . $a["id"] . "'");
  $a2 = w_get_account($db, "dev-1");
  $st = w_state($db, $a2);
  eq($st["balance"], 5, "원장 기준으로 안 고쳤다");
  $row = $db->query("select balance from accounts where id='" . $a["id"] . "'")->fetch();
  eq((int)$row["balance"], 5, "캐시가 디스크에서도 안 고쳐졌다");
  $db = null; rmrf($d);
});

t("state 는 클라이언트 계약대로 네 칸을 준다", function () {
  $d = tmpdir(); $db = w_db($d);
  $a = w_create_account($db, "dev-1", null);
  $st = w_state($db, $a);
  foreach (["balance", "cap", "streakDays", "canCheckin"] as $k) {
    ok(array_key_exists($k, $st), "state 에 " . $k . " 가 없다");
  }
  eq($st["cap"], W_CAP, "cap");
  eq($st["canCheckin"], true, "새 계정은 출석 가능해야 한다");
  $db = null; rmrf($d);
});

t("IP 해시당 하루 신규 계정이 세어진다", function () {
  $d = tmpdir(); $db = w_db($d);
  w_create_account($db, "dev-1", "iphash");
  w_create_account($db, "dev-2", "iphash");
  eq(w_seed_count_today($db, "iphash"), 2, "카운트");
  eq(w_seed_count_today($db, "other"), 0, "다른 IP 는 안 세야 한다");
  $db = null; rmrf($d);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && php tests/wallet.test.php`
Expected: FAIL — `Call to undefined function w_create_account()`

- [ ] **Step 3: 구현한다**

`wallet-lib.php` 끝에 추가:

```php
function w_account_id($deviceId) { return substr(sha1($deviceId), 0, 16); }

function w_get_account($db, $deviceId) {
  $st = $db->prepare("select * from accounts where device_id = ?");
  $st->execute(array($deviceId));
  $r = $st->fetch();
  return $r ? $r : null;
}

function w_seed_count_today($db, $ipHash) {
  if ($ipHash === null || $ipHash === "") return 0;
  $st = $db->prepare("select count(*) c from accounts where seed_ip_hash = ? and created_at >= ?");
  $st->execute(array($ipHash, w_today()));
  $r = $st->fetch();
  return (int)$r["c"];
}

// 계정 생성과 시드 지급은 한 트랜잭션이다. 갈라지면 잔량 없는 계정이 남는다.
// device_id UNIQUE 가 재지급을 DB 층에서 막는다 — 애플리케이션 검사에 기대지 않는다.
function w_create_account($db, $deviceId, $ipHash) {
  $id = w_account_id($deviceId);
  $now = w_now();
  $db->beginTransaction();
  try {
    $st = $db->prepare("insert into accounts (id, device_id, balance, streak_days, last_checkin, seed_ip_hash, created_at)
                        values (?, ?, 0, 0, NULL, ?, ?)");
    $st->execute(array($id, $deviceId, $ipHash, $now));
    $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                        values (?, ?, 'seed', NULL, ?, ?)");
    $st->execute(array($id, W_SEED, "seed:" . $id, $now));
    $db->prepare("update accounts set balance = ? where id = ?")->execute(array(W_SEED, $id));
    $db->commit();
  } catch (Throwable $e) {
    $db->rollBack();
    throw $e;
  }
  return w_get_account($db, $deviceId);
}

function w_true_balance($db, $acctId) {
  $st = $db->prepare("select coalesce(sum(delta), 0) s from ledger where account_id = ?");
  $st->execute(array($acctId));
  $r = $st->fetch();
  return (int)$r["s"];
}

// 캐시(accounts.balance)와 진실(SUM(ledger.delta))이 어긋나면 원장을 믿고 캐시를 고친다.
// 캐시가 진실이 되면 "내 스쿱 어디 갔나"에 답할 수 없다.
function w_state($db, $acct) {
  $true = w_true_balance($db, $acct["id"]);
  if ((int)$acct["balance"] !== $true) {
    $db->prepare("update accounts set balance = ? where id = ?")->execute(array($true, $acct["id"]));
  }
  return array(
    "balance"    => $true,
    "cap"        => W_CAP,
    "streakDays" => (int)$acct["streak_days"],
    "canCheckin" => ($acct["last_checkin"] !== w_today())
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && php tests/wallet.test.php`
Expected: `ℹ pass 12` / `ℹ fail 0`

- [ ] **Step 5: 전량 관문 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/tests/wallet.test.php
git commit -m "$(cat <<'EOF'
8b: 계정 · 시드 지급 · 잔량 재조정

device_id UNIQUE 가 시드 재지급을 DB 층에서 막는다. 계정 생성과 지급은 한
트랜잭션이라 갈라지면 잔량 없는 계정이 남는 일이 없다.

w_state 는 캐시(accounts.balance)와 진실(SUM(ledger.delta))을 대조해 어긋나면
원장 기준으로 고친다. 캐시가 진실이 되면 "내 스쿱 어디 갔나"에 답할 수 없다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `spend` — 멱등 · 트랜잭션 · 24시간 권리

**Files:**
- Modify: `map/wallet-lib.php`
- Modify: `map/tests/wallet.test.php`

**Interfaces:**
- Consumes: Task 2 전부
- Produces:
  - `w_spend(PDO $db, string $acctId, string $runType, string $idem, ?string $ref, ?string $engineVersion) -> array`
    반환: `["ok"=>bool, "charged"=>bool, "reason"=>?string]`. `reason` ∈ `insufficient|unknown-runtype|bad-idem`
  - `w_active_run(PDO $db, string $acctId, string $symbol, string $tier) -> array|null`

- [ ] **Step 1: 테스트를 먼저 쓴다**

```php
function mkacct($db, $dev) { return w_create_account($db, $dev, null); }

t("spend 가 차감하고 원장·권리를 남긴다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_spend($db, $a["id"], "full", "k1", "AAPL", "1.11.0");
  eq($r["ok"], true, "ok");
  eq($r["charged"], true, "charged");
  eq(w_true_balance($db, $a["id"]), 2, "5 - 3");
  ok(w_active_run($db, $a["id"], "AAPL", "full") !== null, "권리가 안 생겼다");
  $db = null; rmrf($d);
});

t("같은 idem 두 번이면 한 번만 수금하고 같은 결과를 재생한다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r1 = w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  $r2 = w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  eq($r2["ok"], true, "두 번째 ok");
  eq($r2["charged"], $r1["charged"], "재생 결과가 다르다");
  eq(w_true_balance($db, $a["id"]), 2, "두 번 수금됐다");
  $n = $db->query("select count(*) c from ledger where idem='k1'")->fetch();
  eq((int)$n["c"], 1, "원장 행이 둘이다");
  $db = null; rmrf($d);
});

t("24h 안 같은 종목은 charged:false 이고 delta 0 행이 남는다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  $r = w_spend($db, $a["id"], "full", "k2", "AAPL", null);
  eq($r["ok"], true, "ok");
  eq($r["charged"], false, "재과금됐다");
  eq(w_true_balance($db, $a["id"]), 2, "잔량이 또 줄었다");
  $row = $db->query("select delta, reason from ledger where idem='k2'")->fetch();
  ok($row !== false, "무료 경로에 원장 행이 없다 — 멱등키가 기록되지 않는다");
  eq((int)$row["delta"], 0, "delta");
  eq($row["reason"], "spend-cached", "reason");
  $db = null; rmrf($d);
});

t("권리가 만료되면 다시 과금한다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  // 5 로는 3 을 두 번 못 낸다 — 만료 재과금을 보려면 잔량을 먼저 채운다.
  // 원장에 직접 넣는다: 이 검사의 대상은 spend 이지 지급 경로가 아니다.
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,5,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], w_now()));
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);      // 10 → 7
  $db->exec("update runs set expiry = '2000-01-01T00:00:00+00:00'");
  $r = w_spend($db, $a["id"], "full", "k2", "AAPL", null);  // 만료 → 재과금 7 → 4
  eq($r["ok"], true, "ok");
  eq($r["charged"], true, "만료 후에도 무료였다");
  eq(w_true_balance($db, $a["id"]), 4, "재과금 후 잔량");
  $db = null; rmrf($d);
});

t("종목이 다르면 별개 권리다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  $r = w_spend($db, $a["id"], "full", "k2", "NVDA", null);
  eq($r["charged"], true, "다른 종목이 무료였다");
  $db = null; rmrf($d);
});

t("잔량이 모자라면 롤백하고 원장에 아무 것도 안 남는다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);   // 5 → 2
  $r = w_spend($db, $a["id"], "full", "k2", "NVDA", null);   // 2 < 3
  eq($r["ok"], false, "ok");
  eq($r["reason"], "insufficient", "reason");
  eq(w_true_balance($db, $a["id"]), 2, "잔량이 움직였다");
  $n = $db->query("select count(*) c from ledger where idem='k2'")->fetch();
  eq((int)$n["c"], 0, "실패한 spend 가 원장에 남았다");
  $n = $db->query("select count(*) c from runs where symbol='NVDA'")->fetch();
  eq((int)$n["c"], 0, "실패했는데 권리가 생겼다");
  $db = null; rmrf($d);
});

t("scan·slot 은 권리를 만들지 않는다 — 단순 차감", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_spend($db, $a["id"], "scan", "k1", null, null);
  eq($r["charged"], true, "charged");
  eq(w_true_balance($db, $a["id"]), 3, "5 - 2");
  $n = $db->query("select count(*) c from runs")->fetch();
  eq((int)$n["c"], 0, "scan 이 권리를 만들었다");
  $r2 = w_spend($db, $a["id"], "scan", "k2", null, null);
  eq($r2["charged"], true, "두 번째 스캔이 무료였다 — scan 은 권리가 없다");
  $db = null; rmrf($d);
});

t("모르는 runType 과 빈 idem 은 거절한다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  eq(w_spend($db, $a["id"], "nope", "k1", null, null)["reason"], "unknown-runtype", "runtype");
  eq(w_spend($db, $a["id"], "full", "", "AAPL", null)["reason"], "bad-idem", "idem");
  eq(w_true_balance($db, $a["id"]), 5, "거절인데 잔량이 움직였다");
  $db = null; rmrf($d);
});

t("잔량은 음수가 되지 않는다 — 연속 spend", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  for ($i = 0; $i < 5; $i++) { w_spend($db, $a["id"], "scan", "k" . $i, null, null); }
  ok(w_true_balance($db, $a["id"]) >= 0, "잔량이 음수다");
  $db = null; rmrf($d);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && php tests/wallet.test.php`
Expected: FAIL — `Call to undefined function w_spend()`

- [ ] **Step 3: 구현한다**

```php
function w_active_run($db, $acctId, $symbol, $tier) {
  $st = $db->prepare("select * from runs where account_id = ? and symbol = ? and tier = ? and expiry > ?
                      order by expiry desc limit 1");
  $st->execute(array($acctId, $symbol, $tier, w_now()));
  $r = $st->fetch();
  return $r ? $r : null;
}

function w_ledger_by_idem($db, $idem) {
  $st = $db->prepare("select * from ledger where idem = ?");
  $st->execute(array($idem));
  $r = $st->fetch();
  return $r ? $r : null;
}

// 차감과 권리 부여는 한 트랜잭션이다. BEGIN IMMEDIATE 로 쓰기 락을 먼저 잡아야
// 동시 요청 둘이 같은 잔량을 읽고 각자 차감하는 일이 없다.
//
// charged:false 인 경우에도 delta 0 행을 남긴다 — 안 남기면 무료 경로만 멱등키가 없어서
// 같은 요청이 두 번 오면 두 번째가 유료 경로로 빠진다.
function w_spend($db, $acctId, $runType, $idem, $ref, $engineVersion) {
  $costs = w_costs();
  if (!isset($costs[$runType])) return array("ok" => false, "charged" => false, "reason" => "unknown-runtype");
  if (!is_string($idem) || $idem === "") return array("ok" => false, "charged" => false, "reason" => "bad-idem");

  $cost = $costs[$runType];
  $entitled = in_array($runType, w_entitled_types(), true) && is_string($ref) && $ref !== "";

  $db->exec("begin immediate");
  try {
    // 재시도 재생 — 이미 처리한 idem 이면 그때 결과를 그대로 돌려준다
    $prev = w_ledger_by_idem($db, $idem);
    if ($prev) {
      $db->exec("commit");
      return array("ok" => true, "charged" => ((int)$prev["delta"] !== 0), "reason" => null);
    }

    $now = w_now();
    if ($entitled && w_active_run($db, $acctId, $ref, $runType) !== null) {
      $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                          values (?, 0, 'spend-cached', ?, ?, ?)");
      $st->execute(array($acctId, $ref, $idem, $now));
      $db->exec("commit");
      return array("ok" => true, "charged" => false, "reason" => null);
    }

    $bal = w_true_balance($db, $acctId);
    if ($bal < $cost) {
      $db->exec("rollback");
      return array("ok" => false, "charged" => false, "reason" => "insufficient");
    }

    $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                        values (?, ?, 'spend', ?, ?, ?)");
    $st->execute(array($acctId, -$cost, $ref, $idem, $now));
    if ($entitled) {
      $st = $db->prepare("insert into runs (account_id, symbol, tier, engine_version, created_at, expiry)
                          values (?, ?, ?, ?, ?, ?)");
      $st->execute(array($acctId, $ref, $runType, $engineVersion, $now,
                         gmdate("c", time() + W_RUN_TTL_SEC)));
    }
    $db->prepare("update accounts set balance = ? where id = ?")->execute(array($bal - $cost, $acctId));
    $db->exec("commit");
    return array("ok" => true, "charged" => true, "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    throw $e;
  }
}
```

- [ ] **Step 4: 테스트를 고치고 통과시킨다**

Step 1 의 `"권리가 만료되면 다시 과금한다"` 를 실제 동작에 맞게 고친 뒤 실행한다.

Run: `cd /home/jschoi0223/projects/vdiportal/map && php tests/wallet.test.php`
Expected: `ℹ fail 0`

- [ ] **Step 5: 동시성을 실제로 확인한다**

프로세스 둘을 동시에 띄워 같은 계정에 `spend` 를 밀어넣고 잔량이 음수로 가지 않는지 본다. 스크립트는 `$CLAUDE_JOB_DIR/tmp` 에 두고 커밋하지 않는다.

```bash
cd /home/jschoi0223/projects/vdiportal/map
D=$(mktemp -d)
php -r '
require "wallet-lib.php";
$db = w_db($argv[1]); w_create_account($db, "dev-1", null);
$db->exec("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (\"" . w_account_id("dev-1") . "\", 15, \"seed\", NULL, \"topup\", \"" . w_now() . "\")");
' -- "$D"
for i in $(seq 1 10); do
  php -r 'require "wallet-lib.php"; $db=w_db($argv[1]); echo json_encode(w_spend($db, w_account_id("dev-1"), "scan", "c".$argv[2], null, null)), "\n";' -- "$D" "$i" &
done
wait
php -r 'require "wallet-lib.php"; $db=w_db($argv[1]); $b=w_true_balance($db, w_account_id("dev-1")); echo "final=$b\n"; exit($b < 0 ? 1 : 0);' -- "$D"
rm -rf "$D"
```

Expected: `final=` 이 0 이상. 음수면 `BEGIN IMMEDIATE` 가 안 걸린 것이므로 **멈추고 보고**할 것.

- [ ] **Step 6: 전량 관문 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/tests/wallet.test.php
git commit -m "$(cat <<'EOF'
8b: spend — 멱등 · 트랜잭션 · 24시간 권리

BEGIN IMMEDIATE 로 쓰기 락을 먼저 잡는다. 동시 요청 둘이 같은 잔량을 읽고
각자 차감하면 잔량이 음수가 된다 — 프로세스 10개를 동시에 밀어 확인했다.

charged:false 인 경우에도 delta 0 원장 행을 남긴다. 안 남기면 무료 경로만
멱등키가 없어서 같은 요청이 두 번 오면 두 번째가 유료로 빠진다.

권리는 full·custom 만 갖는다. scan·slot 은 단순 차감이라 두 번 스캔하면
두 번 낸다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `refund` · `checkin` — 스트릭 · 상한 · `capped`

**Files:**
- Modify: `map/wallet-lib.php`
- Modify: `map/tests/wallet.test.php`

**Interfaces:**
- Consumes: Task 3 전부
- Produces:
  - `w_refund(PDO $db, string $acctId, string $idem) -> array` — `["ok"=>bool,"reason"=>?string]`, `reason` ∈ `not-found|already-refunded|nothing-to-refund`
  - `w_checkin(PDO $db, array $acct, ?string $todayOverride) -> array` — `["ok"=>bool,"granted"=>int,"capped"=>bool,"reason"=>?string]`, `reason` ∈ `already`

  `$todayOverride` 는 **테스트 전용**이다(연속 출석을 하루씩 흉내낸다). 프로덕션 호출은 `null` 을 넘겨 서버 UTC 를 쓴다.

- [ ] **Step 1: 테스트를 먼저 쓴다**

```php
t("refund 가 되돌리고 두 번 불러도 한 번만 돌려준다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  eq(w_true_balance($db, $a["id"]), 2, "차감 전제");
  eq(w_refund($db, $a["id"], "k1")["ok"], true, "첫 환급");
  eq(w_true_balance($db, $a["id"]), 5, "환급 후 잔량");
  $r2 = w_refund($db, $a["id"], "k1");
  eq($r2["ok"], false, "두 번째가 성공했다");
  eq($r2["reason"], "already-refunded", "reason");
  eq(w_true_balance($db, $a["id"]), 5, "두 번 환급됐다");
  $db = null; rmrf($d);
});

t("환급은 지갑 상한을 넘겨도 깎지 않는다 — 가져간 것을 돌려주는 것이다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,?,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], W_CAP - W_SEED, w_now()));   // 상한까지 채운다
  eq(w_true_balance($db, $a["id"]), W_CAP, "상한 전제");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  eq(w_refund($db, $a["id"], "k1")["ok"], true, "환급");
  eq(w_true_balance($db, $a["id"]), W_CAP, "환급이 상한으로 깎였다 — 훔친 셈이다");
  $db = null; rmrf($d);
});

t("없는 idem 과 delta 0 행은 환급 대상이 아니다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  eq(w_refund($db, $a["id"], "nope")["reason"], "not-found", "없는 키");
  w_spend($db, $a["id"], "full", "k1", "AAPL", null);
  w_spend($db, $a["id"], "full", "k2", "AAPL", null);   // charged:false, delta 0
  eq(w_refund($db, $a["id"], "k2")["reason"], "nothing-to-refund", "delta 0 을 환급했다");
  $db = null; rmrf($d);
});

t("출석은 하루 한 번이고 스트릭이 오른다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $r = w_checkin($db, $a, null);
  eq($r["ok"], true, "첫 출석");
  eq($r["granted"], 1, "지급");
  eq(w_true_balance($db, $a["id"]), 6, "잔량");
  $a2 = w_get_account($db, "dev-1");
  eq((int)$a2["streak_days"], 1, "스트릭");
  eq(w_state($db, $a2)["canCheckin"], false, "같은 날 또 가능하다고 나온다");
  $r2 = w_checkin($db, $a2, null);
  eq($r2["ok"], false, "같은 날 두 번 됐다");
  eq($r2["reason"], "already", "reason");
  eq(w_true_balance($db, $a["id"]), 6, "두 번 지급됐다");
  $db = null; rmrf($d);
});

t("7일 연속이면 상자 +5 가 함께 나온다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $day = "2026-03-01";
  $last = null;
  for ($i = 0; $i < 7; $i++) {
    $acct = w_get_account($db, "dev-1");
    $last = w_checkin($db, $acct, w_day_add($day, $i));
  }
  eq($last["granted"], W_CHECKIN + W_CHEST, "7일차 지급이 상자를 안 포함한다");
  eq((int)w_get_account($db, "dev-1")["streak_days"], 7, "스트릭");
  $db = null; rmrf($d);
});

t("하루 끊기면 스트릭이 1로 돌아간다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  w_checkin($db, w_get_account($db, "dev-1"), "2026-03-01");
  w_checkin($db, w_get_account($db, "dev-1"), "2026-03-02");
  eq((int)w_get_account($db, "dev-1")["streak_days"], 2, "이틀차");
  w_checkin($db, w_get_account($db, "dev-1"), "2026-03-04");   // 03-03 을 건너뜀
  eq((int)w_get_account($db, "dev-1")["streak_days"], 1, "끊겼는데 이어졌다");
  $db = null; rmrf($d);
});

t("상한 초과분은 버려지고 capped 가 뜬다", function () {
  $d = tmpdir(); $db = w_db($d); $a = mkacct($db, "dev-1");
  $db->prepare("insert into ledger (account_id,delta,reason,ref,idem,created_at) values (?,?,'seed',NULL,'topup',?)")
     ->execute(array($a["id"], W_CAP - W_SEED, w_now()));
  $r = w_checkin($db, w_get_account($db, "dev-1"), null);
  eq($r["ok"], true, "ok");
  eq($r["granted"], 0, "상한인데 지급됐다");
  eq($r["capped"], true, "capped 가 안 떴다 — 화면 안내가 조용히 사라진다");
  eq(w_true_balance($db, $a["id"]), W_CAP, "상한을 넘었다");
  $db = null; rmrf($d);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && php tests/wallet.test.php`
Expected: FAIL — `Call to undefined function w_refund()`

- [ ] **Step 3: 구현한다**

```php
// 환급 자체가 멱등이다 — 보상 행의 키를 "<원래 idem>:refund" 로 둔다.
// 상한으로 깎지 않는다: 가져간 것을 돌려주는 것이라 깎으면 훔치는 셈이 된다.
function w_refund($db, $acctId, $idem) {
  $db->exec("begin immediate");
  try {
    $orig = w_ledger_by_idem($db, $idem);
    if (!$orig || $orig["account_id"] !== $acctId) {
      $db->exec("rollback");
      return array("ok" => false, "reason" => "not-found");
    }
    if ((int)$orig["delta"] === 0) {
      $db->exec("rollback");
      return array("ok" => false, "reason" => "nothing-to-refund");
    }
    $rk = $idem . ":refund";
    if (w_ledger_by_idem($db, $rk)) {
      $db->exec("rollback");
      return array("ok" => false, "reason" => "already-refunded");
    }
    $back = -((int)$orig["delta"]);
    $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                        values (?, ?, 'refund', ?, ?, ?)");
    $st->execute(array($acctId, $back, $idem, $rk, w_now()));
    // 권리도 되돌린다 — 환급했는데 권리가 남으면 공짜로 계속 본다
    $db->prepare("delete from runs where account_id = ? and symbol = ? and created_at >= ?")
       ->execute(array($acctId, $orig["ref"], $orig["created_at"]));
    $db->prepare("update accounts set balance = ? where id = ?")
       ->execute(array(w_true_balance($db, $acctId), $acctId));
    $db->exec("commit");
    return array("ok" => true, "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    throw $e;
  }
}

// 서버 UTC 기준이다. $today 는 테스트에서만 넘긴다 — 프로덕션은 null 을 넘겨 서버 시간을 쓴다.
// 기기 시계를 바꿔서 얻는 것이 없어야 한다(SPEC-economy §3).
function w_checkin($db, $acct, $today) {
  $day = ($today === null) ? w_today() : $today;
  $acctId = $acct["id"];
  $db->exec("begin immediate");
  try {
    $cur = $db->prepare("select * from accounts where id = ?");
    $cur->execute(array($acctId));
    $a = $cur->fetch();
    if ($a["last_checkin"] === $day) {
      $db->exec("rollback");
      return array("ok" => false, "granted" => 0, "capped" => false, "reason" => "already");
    }
    $streak = ($a["last_checkin"] !== null && $a["last_checkin"] === w_day_add($day, -1))
      ? ((int)$a["streak_days"] + 1) : 1;
    $want = W_CHECKIN + (($streak % W_CHEST_EVERY === 0) ? W_CHEST : 0);

    $bal = w_true_balance($db, $acctId);
    $room = W_CAP - $bal;
    if ($room < 0) $room = 0;
    $give = ($want > $room) ? $room : $want;
    $capped = ($give < $want);

    if ($give > 0) {
      $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                          values (?, ?, ?, NULL, ?, ?)");
      $st->execute(array($acctId, $give, ($want > W_CHECKIN ? "chest" : "checkin"),
                         "checkin:" . $acctId . ":" . $day, w_now()));
    }
    $db->prepare("update accounts set balance = ?, streak_days = ?, last_checkin = ? where id = ?")
       ->execute(array($bal + $give, $streak, $day, $acctId));
    $db->exec("commit");
    return array("ok" => true, "granted" => $give, "capped" => $capped, "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    throw $e;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && php tests/wallet.test.php`
Expected: `ℹ fail 0`

- [ ] **Step 5: 전량 관문 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/tests/wallet.test.php
git commit -m "$(cat <<'EOF'
8b: refund · checkin — 스트릭 · 상한 · capped

환급 자체를 멱등으로 만든다(보상 행 키 = "<원래 idem>:refund"). 상한으로
깎지 않는다 — 가져간 것을 돌려주는 것이라 깎으면 훔치는 셈이다. 환급 시
권리도 함께 지운다: 안 지우면 환급받고 계속 공짜로 본다.

출석 판정은 서버 UTC 다. 테스트만 날짜를 주입해 7일 연속·중간 결손을
흉내낸다. 상한 초과분은 버려지고 capped:true 를 돌려준다 — 8a 의 wallet.js
주석이 "빠지면 안내가 조용히 사라진다"고 못박은 필드다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `wallet-api.php` — 디스패처 · 토큰 · IP 상한

**Files:**
- Create: `map/wallet-api.php`
- Modify: `map/wallet-lib.php` (토큰 함수)
- Modify: `map/tests/wallet.test.php` (토큰 테스트)

**Interfaces:**
- Consumes: Task 4 전부
- Produces:
  - `w_secret(string $dir) -> string` — 없으면 `random_bytes(32)` 생성 후 `chmod 600`
  - `w_token_make(string $dir, string $deviceId) -> string`
  - `w_token_read(string $dir, string $token) -> string|null` — device_id 또는 null(fail-closed)
  - `map/wallet-api.php` — POST JSON `{op, ...}`, 헤더 `Authorization: Bearer <token>`

- [ ] **Step 1: 토큰 테스트를 먼저 쓴다**

```php
t("토큰은 왕복하고 변조·만료는 거부된다", function () {
  $d = tmpdir();
  $tok = w_token_make($d, "dev-1");
  eq(w_token_read($d, $tok), "dev-1", "왕복");
  eq(w_token_read($d, $tok . "x"), null, "변조된 토큰이 통과했다");
  eq(w_token_read($d, "garbage"), null, "쓰레기 토큰이 통과했다");
  $parts = explode("|", $tok);
  $expired = $parts[0] . "|" . (time() - 10) . "|" . $parts[2];
  eq(w_token_read($d, $expired), null, "만료 토큰이 통과했다");
  rmrf($d);
});

t("비밀키는 자동 생성되고 파일 권한이 좁다", function () {
  $d = tmpdir();
  $s1 = w_secret($d);
  ok(strlen($s1) >= 32, "비밀키가 짧다");
  eq(w_secret($d), $s1, "호출마다 달라진다 — 토큰이 매번 무효가 된다");
  eq(substr(sprintf("%o", fileperms($d . "/wallet_secret.txt")), -3), "600", "권한");
  rmrf($d);
});

t("다른 비밀키로 만든 토큰은 거부된다", function () {
  $d1 = tmpdir(); $d2 = tmpdir();
  $tok = w_token_make($d1, "dev-1");
  eq(w_token_read($d2, $tok), null, "남의 키로 만든 토큰이 통과했다");
  rmrf($d1); rmrf($d2);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && php tests/wallet.test.php`
Expected: FAIL — `Call to undefined function w_token_make()`

- [ ] **Step 3: 토큰 함수를 `wallet-lib.php` 에 추가한다**

`forge-auth-lib.php` 와 같은 패턴이되 쿠키가 아니라 베어러 토큰이다.

```php
function _wb64e($s) { return rtrim(strtr(base64_encode($s), "+/", "-_"), "="); }
function _wb64d($s) { return base64_decode(strtr($s, "-_", "+/")); }

function w_secret($dir) {
  $f = $dir . "/wallet_secret.txt";
  if (!is_file($f)) {
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    @file_put_contents($f, bin2hex(random_bytes(32)), LOCK_EX);
    @chmod($f, 0600);
  }
  return trim((string)@file_get_contents($f));
}

function w_token_make($dir, $deviceId) {
  $exp = time() + 365 * 86400;
  $sig = _wb64e(hash_hmac("sha256", $deviceId . "|" . $exp, w_secret($dir), true));
  return _wb64e($deviceId) . "|" . $exp . "|" . $sig;
}

// fail-closed — 변조·만료·형식 이상은 전부 null 이다.
// hash_equals 로 상수시간 비교한다(타이밍으로 서명을 맞춰가는 것을 막는다).
function w_token_read($dir, $token) {
  if (!is_string($token) || $token === "") return null;
  $p = explode("|", $token);
  if (count($p) !== 3) return null;
  $deviceId = _wb64d($p[0]);
  $exp = (int)$p[1];
  if ($deviceId === "" || $exp < time()) return null;
  $want = _wb64e(hash_hmac("sha256", $deviceId . "|" . $exp, w_secret($dir), true));
  if (!hash_equals($want, $p[2])) return null;
  return $deviceId;
}
```

- [ ] **Step 4: `map/wallet-api.php` 를 만든다**

```php
<?php
// 머니스쿱 지갑 API. 얇게 유지한다 — 원장 로직은 전부 wallet-lib.php 에 있고
// 이 파일은 파싱·인증·분기·응답만 한다. 그래야 웹서버 없이 원장을 테스트할 수 있다.
//
// forge-api.php 와 분리한 이유: 그쪽은 587줄에 PC 제품 전부를 지고 있어
// 배포 사고가 나면 지갑과 PC 가 함께 죽는다.
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

// 웹루트 밖. __DIR__ 이 /parksvc/www/map 이므로 두 단계 위가 /parksvc 다.
// 하드코딩하지 않는 이유는 로컬 점검에서도 같은 코드가 돌아야 하기 때문이다.
$W_DIR = dirname(dirname(__DIR__)) . "/data";

require_once __DIR__ . "/wallet-lib.php";

function w_out($arr, $code = 200) {
  http_response_code($code);
  echo json_encode($arr, JSON_UNESCAPED_SLASHES);
  exit;
}
function w_ip_hash() {
  $ip = isset($_SERVER["REMOTE_ADDR"]) ? $_SERVER["REMOTE_ADDR"] : "";
  if ($ip === "") return null;
  // 원본 IP 는 저장하지 않는다 — 상한 계산에 필요한 것은 동일성뿐이다.
  return substr(hash("sha256", "msw|" . $ip), 0, 32);
}
function w_bearer() {
  $h = "";
  if (isset($_SERVER["HTTP_AUTHORIZATION"])) $h = $_SERVER["HTTP_AUTHORIZATION"];
  elseif (function_exists("apache_request_headers")) {
    $hs = apache_request_headers();
    foreach ($hs as $k => $v) { if (strcasecmp($k, "Authorization") === 0) { $h = $v; break; } }
  }
  if (stripos($h, "Bearer ") !== 0) return "";
  return trim(substr($h, 7));
}

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }
if ($_SERVER["REQUEST_METHOD"] !== "POST") w_out(array("ok" => false, "reason" => "method"), 405);

$raw = file_get_contents("php://input");
$d = json_decode($raw, true);
if (!is_array($d) || !isset($d["op"])) w_out(array("ok" => false, "reason" => "bad-request"), 400);
$op = (string)$d["op"];

// ping 은 사용자 데이터를 일절 노출하지 않는다 — 그래야 열어둬도 안전하다.
if ($op === "ping") {
  try {
    $db = w_db($W_DIR);
    w_out(array("ok" => true, "schema" => w_schema_version($db),
                "php" => PHP_VERSION, "sqlite" => $db->query("select sqlite_version()")->fetchColumn()));
  } catch (Throwable $e) {
    w_out(array("ok" => false, "reason" => "storage"), 500);
  }
}

try { $db = w_db($W_DIR); }
catch (Throwable $e) { w_out(array("ok" => false, "reason" => "storage"), 500); }

if ($op === "hello") {
  $dev = isset($d["deviceId"]) ? (string)$d["deviceId"] : "";
  if (strlen($dev) < 8 || strlen($dev) > 128) w_out(array("ok" => false, "reason" => "bad-device"), 400);
  $acct = w_get_account($db, $dev);
  if (!$acct) {
    $iph = w_ip_hash();
    // 재설치 남용 완화 — 완전히는 못 막는다. 진짜 해결은 8c(구글 로그인)다.
    if (w_seed_count_today($db, $iph) >= W_IP_DAILY) w_out(array("ok" => false, "reason" => "rate-limited"), 429);
    try { $acct = w_create_account($db, $dev, $iph); }
    catch (Throwable $e) { $acct = w_get_account($db, $dev); }   // 동시 hello 경합
    if (!$acct) w_out(array("ok" => false, "reason" => "server-error"), 500);
  }
  w_out(array("ok" => true, "token" => w_token_make($W_DIR, $dev), "state" => w_state($db, $acct)));
}

$dev = w_token_read($W_DIR, w_bearer());
if ($dev === null) w_out(array("ok" => false, "reason" => "unauthorized"), 401);
$acct = w_get_account($db, $dev);
if (!$acct) w_out(array("ok" => false, "reason" => "unauthorized"), 401);

if ($op === "get") {
  w_out(array("ok" => true, "state" => w_state($db, $acct)));
} elseif ($op === "spend") {
  $r = w_spend($db, $acct["id"],
               isset($d["runType"]) ? (string)$d["runType"] : "",
               isset($d["idem"]) ? (string)$d["idem"] : "",
               isset($d["ref"]) ? (string)$d["ref"] : null,
               isset($d["engineVersion"]) ? (string)$d["engineVersion"] : null);
  w_out(array("ok" => $r["ok"], "charged" => $r["charged"], "reason" => $r["reason"],
              "state" => w_state($db, w_get_account($db, $dev))));
} elseif ($op === "refund") {
  $r = w_refund($db, $acct["id"], isset($d["idem"]) ? (string)$d["idem"] : "");
  w_out(array("ok" => $r["ok"], "reason" => $r["reason"],
              "state" => w_state($db, w_get_account($db, $dev))));
} elseif ($op === "checkin") {
  $r = w_checkin($db, $acct, null);
  w_out(array("ok" => $r["ok"], "granted" => $r["granted"], "capped" => $r["capped"], "reason" => $r["reason"],
              "state" => w_state($db, w_get_account($db, $dev))));
}
w_out(array("ok" => false, "reason" => "unknown-op"), 400);
```

- [ ] **Step 5: 로컬 내장 서버로 end-to-end 를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
php -S 127.0.0.1:8811 >/dev/null 2>&1 &
sleep 1
curl -s -X POST localhost:8811/wallet-api.php -d '{"op":"ping"}'; echo
TOK=$(curl -s -X POST localhost:8811/wallet-api.php -d '{"op":"hello","deviceId":"devtest-0001"}' | php -r 'echo json_decode(file_get_contents("php://stdin"),true)["token"];')
curl -s -X POST localhost:8811/wallet-api.php -H "Authorization: Bearer $TOK" -d '{"op":"get"}'; echo
curl -s -X POST localhost:8811/wallet-api.php -H "Authorization: Bearer $TOK" -d '{"op":"spend","runType":"full","idem":"e2e-1","ref":"AAPL"}'; echo
curl -s -X POST localhost:8811/wallet-api.php -d '{"op":"get"}'; echo    # 토큰 없음 → 401
kill %1
```

Expected: `ping` 이 schema 1 · `hello` 가 balance 5 · `spend` 가 charged true·balance 2 · 토큰 없는 `get` 이 `unauthorized`.

⚠️ `php -S` 는 `dirname(dirname(__DIR__))` 이 이 저장소의 `vdiportal/` 이 되므로 `vdiportal/data/` 에 DB 를 만든다. **확인 후 `rm -rf /home/jschoi0223/projects/vdiportal/data` 로 지우고**, 그 경로가 `.gitignore` 에 있는지 확인할 것(없으면 추가).

- [ ] **Step 6: 전량 관문 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-api.php map/wallet-lib.php map/tests/wallet.test.php .gitignore
git commit -m "$(cat <<'EOF'
8b: wallet-api.php — 디스패처 · HMAC 베어러 토큰 · IP 상한

device_id 만으로는 추측한 사람이 남의 지갑을 쓴다. forge-auth-lib.php 의
HMAC 패턴을 쿠키 대신 베어러 토큰으로 옮겼다 — hash_equals 상수시간 비교,
변조·만료·형식이상은 전부 fail-closed.

원장 경로는 __DIR__ 에서 계산한다(/parksvc/www/map → /parksvc/data).
하드코딩하지 않아야 로컬 점검에서도 같은 코드가 돈다.

ping 은 스키마·런타임 버전만 낸다 — 사용자 데이터를 노출하지 않으므로
인증 없이 열어둬도 안전하다.

IP 해시당 하루 신규계정 상한으로 재설치 남용을 완화만 한다. 원본 IP 는
저장하지 않는다. 완전히는 못 막고 진짜 해결은 8c 다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 클라이언트 — HTTP 백엔드 · `spend(ref)` · 스텁 삭제

**Files:**
- Create: `map/mobile/www/wallet-http.js`
- Create: `map/mobile/test/wallet-http.test.mjs`
- Modify: `map/mobile/www/wallet.js` · `app.js:116-118` · `index.html` · `screens/report.js:308`
- Delete: `map/mobile/www/wallet-local-stub.js` · `map/mobile/test/wallet-local-stub.test.mjs`

**Interfaces:**
- Consumes: Task 5 의 API 계약
- Produces: `MSWalletHttp.create(opts) -> {get, spend, refund, checkin}` — `opts = {url, fetch?, store?}`

- [ ] **Step 1: 테스트를 먼저 쓴다**

`map/mobile/test/wallet-http.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSWalletHttp = require("../www/wallet-http.js");

function fakeStore() {
  const m = {};
  return { read0: (k, f) => (k in m ? m[k] : f), write0: (k, v) => { m[k] = v; }, _m: m };
}
// 호출을 기록하고 대본대로 답하는 가짜 fetch
function fakeFetch(script) {
  const calls = [];
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, op: body.op, body, auth: (init.headers || {}).Authorization || null });
    const r = script.shift();
    if (!r) throw new Error("대본 소진: " + body.op);
    if (r.throw) throw new Error("network");
    return { ok: r.status < 400, status: r.status, json: async () => r.json };
  };
  fn.calls = calls;
  return fn;
}
const ST = { balance: 5, cap: 20, streakDays: 0, canCheckin: true };

test("첫 호출에서 hello 로 토큰을 받아 저장한다", async () => {
  const store = fakeStore();
  const f = fakeFetch([{ status: 200, json: { ok: true, token: "T1", state: ST } },
                       { status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, true);
  assert.deepEqual(r.state, ST);
  assert.strictEqual(f.calls[0].op, "hello");
  assert.strictEqual(f.calls[1].op, "get");
  assert.strictEqual(f.calls[1].auth, "Bearer T1");
});

test("device_id 는 한 번 만들어 보관한다", async () => {
  const store = fakeStore();
  const f = fakeFetch([{ status: 200, json: { ok: true, token: "T1", state: ST } },
                       { status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  await b.get();
  const dev = f.calls[0].body.deviceId;
  assert.ok(typeof dev === "string" && dev.length >= 8, "deviceId 가 짧다");
  assert.strictEqual(store.read0("ms_device_id", null), dev, "저장 안 됨");
});

test("401 이면 hello 로 한 번만 재발급하고 재시도한다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", "dev-abcdefgh");
  store.write0("ms_wallet_token", "OLD");
  const f = fakeFetch([{ status: 401, json: { ok: false, reason: "unauthorized" } },
                       { status: 200, json: { ok: true, token: "NEW", state: ST } },
                       { status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, true);
  assert.deepEqual(f.calls.map(c => c.op), ["get", "hello", "get"]);
  assert.strictEqual(f.calls[2].auth, "Bearer NEW");
});

test("재발급 후에도 401 이면 포기한다 — 무한 루프 금지", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", "dev-abcdefgh");
  store.write0("ms_wallet_token", "OLD");
  const f = fakeFetch([{ status: 401, json: { ok: false, reason: "unauthorized" } },
                       { status: 200, json: { ok: true, token: "NEW", state: ST } },
                       { status: 401, json: { ok: false, reason: "unauthorized" } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(f.calls.length, 3, "재시도가 더 돌았다");
});

test("네트워크 실패는 ok:false 로 떨어지고 잔량을 지어내지 않는다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", "dev-abcdefgh");
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ throw: true }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, null, "오프라인에서 state 를 지어냈다");
});

test("spend 가 ref 와 idem 을 실어 보낸다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", "dev-abcdefgh");
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: true, charged: true, reason: null, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.spend("full", "idem-1", "AAPL");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(f.calls[0].body.runType, "full");
  assert.strictEqual(f.calls[0].body.idem, "idem-1");
  assert.strictEqual(f.calls[0].body.ref, "AAPL");
});

test("checkin 이 granted·capped 를 그대로 전달한다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", "dev-abcdefgh");
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: true, granted: 0, capped: true, reason: null, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.checkin();
  assert.strictEqual(r.granted, 0);
  assert.strictEqual(r.capped, true, "capped 가 유실되면 화면 안내가 사라진다");
});
```

`map/mobile/test/wallet.test.mjs` 를 **새로 만든다**(현재 없다) — `MSWallet` 계약 자체를 지키는 자리다:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSWallet = require("../www/wallet.js");

function stub(onSpend) {
  return {
    get: async () => ({ ok: true, state: null }),
    spend: async (t, i, ref) => { if (onSpend) onSpend(t, i, ref); return { ok: true, state: null }; },
    refund: async () => ({ ok: true, state: null }),
    checkin: async () => ({ ok: true, state: null })
  };
}

test("spend 가 ref 를 백엔드로 넘긴다", async () => {
  const seen = [];
  MSWallet.install(stub((t, i, ref) => seen.push([t, i, ref])));
  await MSWallet.spend("full", "k1", "AAPL");
  assert.deepEqual(seen[0], ["full", "k1", "AAPL"]);
});

test("ref 를 안 주면 null 로 넘긴다 — undefined 가 JSON 에서 사라지면 안 된다", async () => {
  const seen = [];
  MSWallet.install(stub((t, i, ref) => seen.push(ref)));
  await MSWallet.spend("scan", "k1");
  assert.strictEqual(seen[0], null);
});

// 8a 가 진입부에서 막아둔 계약 — 빈 idem 이면 원장이 "키 없음"끼리 같은 항목으로 보고
// 두 번째부터 멱등 재생으로 답한다. 그러면 그 뒤 모든 Full 이 공짜가 된다.
test("빈 idem 은 백엔드에 닿기 전에 거절된다", async () => {
  let called = false;
  MSWallet.install(stub(() => { called = true; }));
  const r = await MSWallet.spend("full", "", "AAPL");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "bad-idem");
  assert.strictEqual(called, false, "빈 idem 이 백엔드까지 갔다");
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/wallet-http.test.mjs`
Expected: FAIL — `Cannot find module '../www/wallet-http.js'`

- [ ] **Step 3: `wallet-http.js` 를 만든다**

```js
// MSWallet 용 HTTP 백엔드. 서버가 준 state 를 그대로 전달할 뿐 아무 것도 계산하지 않는다 —
// 클라이언트가 잔량을 들면 SPEC-economy §1 이 경고한 그 상태로 되돌아간다.
// 오프라인에서도 잔량을 지어내지 않는다: state 는 null 이고 화면이 "사용할 수 없음"을 그린다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSWalletHttp = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var K_DEV = "ms_device_id", K_TOK = "ms_wallet_token";

  function uuid() {
    try { if (typeof crypto !== "undefined" && crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12)
                + Math.random().toString(36).slice(2, 8);
  }
  function fail(reason) { return { ok: false, reason: reason, state: null }; }

  function create(opts) {
    var o = opts || {};
    var url = o.url || "wallet-api.php";
    var f = o.fetch || (typeof fetch !== "undefined" ? fetch : null);
    var store = o.store || (typeof MSStore !== "undefined" ? MSStore : null);

    function get0(k, d) { return store ? store.read0(k, d) : d; }
    function set0(k, v) { if (store) store.write0(k, v); }

    function deviceId() {
      var d = get0(K_DEV, null);
      if (typeof d !== "string" || d.length < 8) { d = uuid(); set0(K_DEV, d); }
      return d;
    }

    function post(body, token) {
      if (!f) return Promise.resolve(null);
      var headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      return f(url, { method: "POST", headers: headers, body: JSON.stringify(body) })
        .then(function (res) {
          return res.json().then(function (j) { return { status: res.status, json: j }; },
                                 function () { return { status: res.status, json: null }; });
        })
        ["catch"](function () { return null; });
    }

    function hello() {
      return post({ op: "hello", deviceId: deviceId() }, null).then(function (r) {
        if (!r || !r.json || !r.json.ok || !r.json.token) return null;
        set0(K_TOK, r.json.token);
        return r.json.token;
      });
    }

    // 401 은 딱 한 번만 재발급하고 재시도한다. 두 번째도 401 이면 포기한다 —
    // 안 그러면 서버가 계속 거절할 때 무한 루프가 된다.
    function call(body) {
      var tok = get0(K_TOK, null);
      var first = tok ? post(body, tok) : Promise.resolve({ status: 401, json: null });
      return first.then(function (r) {
        if (r && r.status !== 401) return r;
        return hello().then(function (nt) {
          if (!nt) return r;
          return post(body, nt);
        });
      });
    }

    function shape(r, extra) {
      if (!r) return fail("network");
      var j = r.json;
      if (!j) return fail(r.status === 401 ? "unauthorized" : "server-error");
      var out = { ok: !!j.ok, state: j.state || null, reason: j.reason || null };
      for (var i = 0; i < (extra || []).length; i++) {
        var k = extra[i];
        if (Object.prototype.hasOwnProperty.call(j, k)) out[k] = j[k];
      }
      return out;
    }

    return {
      get: function () { return call({ op: "get" }).then(function (r) { return shape(r); }); },
      spend: function (runType, idem, ref) {
        return call({ op: "spend", runType: runType, idem: idem, ref: ref || null })
          .then(function (r) { return shape(r, ["charged"]); });
      },
      refund: function (idem) {
        return call({ op: "refund", idem: idem }).then(function (r) { return shape(r); });
      },
      checkin: function () {
        return call({ op: "checkin" }).then(function (r) { return shape(r, ["granted", "capped"]); });
      }
    };
  }

  return { create: create };
});
```

- [ ] **Step 4: `MSWallet.spend` 를 3인자로 넓힌다**

`map/mobile/www/wallet.js` 의 `spend` 를 고친다:

```js
  function spend(runType, idem, ref) {
    if (typeof idem !== "string" || idem === "") return Promise.resolve({ ok: false, reason: "bad-idem", state: null });
    if (!backend) return noBackend();
    if (costOf(runType) == null) return Promise.resolve({ ok: false, reason: "unknown-runtype", state: null });
    return callBackend(function () { return backend.spend(runType, idem, ref || null); });
  }
```

`COSTS` 위 주석에 한 줄을 더한다: **금액은 서버가 정본이고 이 표는 시트의 미리보기 표시용이다.**

- [ ] **Step 5: 설치 지점과 호출부를 고친다**

`map/mobile/www/app.js:113-118` 을 교체한다:

```js
    // 서버 지갑. 잔량의 진실은 서버에 있고 클라이언트는 그린다(SPEC-economy §1).
    if (typeof MSWalletHttp !== "undefined" && !MSWallet.isInstalled()) {
      MSWallet.install(MSWalletHttp.create({ url: "wallet-api.php" }));
    }
```

`map/mobile/www/index.html` — `wallet-local-stub.js` 태그를 `wallet-http.js` 로 교체한다. **`wallet.js` 보다 뒤, `app.js` 보다 앞**이어야 한다.

`map/mobile/www/screens/report.js:308` — `MSWallet.spend("full", idem)` → `MSWallet.spend("full", idem, sym)`.

`screens/watchlist.js:329` 의 `spend("scan", idem)` 은 그대로 둔다 — 스캔은 종목 권리가 아니다.

- [ ] **Step 6: 스텁을 삭제한다**

```bash
cd /home/jschoi0223/projects/vdiportal
git rm map/mobile/www/wallet-local-stub.js map/mobile/test/wallet-local-stub.test.mjs
```

`index.html` · `app.js` 에 `MSWalletLocalStub` 참조가 남아 있지 않은지 확인한다:

Run: `grep -rn "MSWalletLocalStub\|wallet-local-stub" map/mobile/ | grep -v vendor`
Expected: 출력 없음

- [ ] **Step 7: 테스트 통과 확인 + 전량 관문**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/*.test.mjs`
Expected: 전부 통과. 스텁 테스트가 사라진 만큼 줄고 새 테스트만큼 는다.

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh`
Expected: forge-core 259 · forge-tools 81 · landing 28 불변.

- [ ] **Step 8: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/wallet-http.js map/mobile/test/wallet-http.test.mjs \
        map/mobile/www/wallet.js map/mobile/www/app.js map/mobile/www/index.html \
        map/mobile/www/screens/report.js map/mobile/test/wallet.test.mjs
git commit -m "$(cat <<'EOF'
8b: 클라이언트를 서버 지갑에 꽂고 스텁을 삭제한다

wallet-local-stub.js 는 교체가 아니라 삭제다 — 규칙이 두 벌이면 갈린다.
지금 로컬에 쌓인 잔량은 개발용이라 이관하지 않고 모두 서버에서 5개로 시작한다.

wallet-http.js 는 아무 것도 계산하지 않는다. 오프라인에서도 잔량을 지어내지
않고 state:null 로 떨어진다 — 클라이언트가 잔량을 들면 SPEC §1 이 경고한
그 상태로 되돌아간다.

401 은 딱 한 번 재발급하고 재시도한다. 두 번째도 401 이면 포기한다 —
안 그러면 서버가 계속 거절할 때 무한 루프가 된다.

spend 가 3인자가 됐다(ref=종목). 24시간 권리 판정이 서버에서 일어나므로
클라이언트는 "이건 공짜"를 결정하지 않고 항상 spend 를 보낸다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 배포 · 백로그

**Files:**
- Modify: `map/mobile/docs/BACKLOG-mobile.md`

**Interfaces:** 없음

- [ ] **Step 1: `/parksvc/data/` 를 만들고 쓰기를 확인한다**

```bash
lftp -c "
set sftp:auto-confirm yes; set net:timeout 20;
open -u parksvc,'wjdtjd2@' sftp://parksvc.mycafe24.com;
mkdir -p /parksvc/data;
chmod 700 /parksvc/data;
ls -d /parksvc/data;
"
```

- [ ] **Step 2: 두 PHP 파일을 올린다 — `put` 만, 미러링 금지**

```bash
cd /home/jschoi0223/projects/vdiportal/map
lftp -c "
set sftp:auto-confirm yes; set net:timeout 20;
open -u parksvc,'wjdtjd2@' sftp://parksvc.mycafe24.com;
cd www/map;
put wallet-lib.php;
put wallet-api.php;
"
```

⚠️ **`forge_data.json` · `map_data.json` · `forge_ohlc_cache_*` · `wallet.db` 는 절대 건드리지 않는다.** 사용자 데이터다.

- [ ] **Step 3: 서버에서 확인한다**

```bash
curl -s -X POST https://parksvc.mycafe24.com/map/wallet-api.php -d '{"op":"ping"}'; echo
curl -s -o /dev/null -w "wallet.db 직접접근 %{http_code}\n" https://parksvc.mycafe24.com/map/wallet.db
```

Expected: `ping` 이 `{"ok":true,"schema":1,...}`. `reason:"storage"` 가 나오면 **`/parksvc/data/` 에 PHP 가 못 쓰는 것이므로 멈추고 보고할 것** — 웹루트 안으로 옮기지 말 것.
`wallet.db` 직접 접근은 404(웹루트에 없음)여야 한다.

- [ ] **Step 4: 클라이언트 정적 파일을 올린다**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile/www
lftp -c "
set sftp:auto-confirm yes; set net:timeout 20;
open -u parksvc,'wjdtjd2@' sftp://parksvc.mycafe24.com;
cd www/map;
"
```

⚠️ **모바일 정적 파일은 cafe24 에 올리지 않는다**(`map/CLAUDE.md`: *"mobile/ 은 cafe24 에 업로드하지 않는다"*). 모바일은 스토어 릴리스 트랙이다. **이 스텝은 실행하지 않고 지운다** — 위 블록은 실수 방지용 표식이다.

- [ ] **Step 5: 백로그를 갱신한다**

`✅ 완료` 에 항목을 추가한다. 구현 중 겪은 것을 쓴다 — 계획대로 안 된 것이 있으면 그것이 가장 중요하다.

```markdown
- **Phase 8b — 서버 지갑 원장**(2026-08-13): 잔량의 진실이 서버로 갔다. `wallet-local-stub.js` 삭제.
  - 선행 프로브로 cafe24 확인: PHP 8.4 · PDO sqlite · **SQLite 3.26.0**. `RETURNING`(3.35+)·`STRICT`(3.37+)를
    못 쓰므로 삽입 후 값을 돌려받는 패턴 대신 트랜잭션 안에서 `insert` → `select` 로 간다
  - **원장은 웹루트 밖 `/parksvc/data/wallet.db`.** 같은 점검에서 `www/map/` 의 데이터 파일이 전부 URL 로
    200 인 것을 발견했다 — `forge_td_key.txt`(**TwelveData API 키**) 포함. `.htaccess` 로 차단했고
    **노출됐던 키 교체는 사용자 몫으로 남아 있다**
  - `forge-api.php` 무수정 — 587줄에 PC 제품 전부를 지고 있어 배포 사고 반경을 지갑으로 제한했다
  - **`charged:false` 에도 `delta 0` 원장 행을 남긴다** — 안 남기면 무료 경로만 멱등키가 없어 같은
    요청이 두 번 오면 두 번째가 유료로 빠진다
  - **환급은 상한으로 깎지 않는다**(가져간 것을 돌려주는 것) + 권리도 함께 지운다(안 지우면 환급받고 계속 공짜)
  - PHP 테스트 러너를 새로 만들었다 — 프레임워크 없이 `ℹ pass N` 형식을 내서 `run.sh` 파서에 그대로 붙는다.
    **php 가 없는 환경에서는 "건너뜀 (돈 로직 미검사)" 로 표시하고 요약줄에도 남긴다**
  - 테스트 676 → NNN
  - 실기기 확인 **미실시**

**남은 한계(정직하게)**
  - **재설치하면 5개를 다시 받는다.** `device_id` 가 클라이언트 생성인 한 못 막는다. IP 해시당 하루 상한으로
    완화만 했고 진짜 해결은 8c(구글 로그인)다
  - **SPEC §5 "비답변에 과금 금지"는 아직 없다.** `refund` op 는 있지만 *언제 부를 것인가*("판정 없음"의
    판별 기준)를 정하지 않았다
```

`🔥 다음` 에서 8b 를 지우고 8c 를 올린다. `📋 예정` 의 8b 항목도 지운다.

`NNN` 은 실제 `./tests/run.sh` 출력으로 채운다.

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/docs/BACKLOG-mobile.md
git commit -m "$(cat <<'EOF'
docs(mobile): Phase 8b 완료 기록 + 다음 순번

잔량의 진실이 서버로 갔다. 남은 한계 둘을 정직하게 적었다 — 재설치 재지급은
IP 상한으로 완화만 됐고(진짜 해결은 8c), SPEC §5 "비답변에 과금 금지"는
refund op 만 있고 판별 기준이 없다.

같이 드러난 API 키 노출과 그 차단도 기록했다. 키 교체는 사용자 몫으로 남는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 완료 조건

- `cd map && ./tests/run.sh` 전량 통과, **`wallet` 스위트가 "건너뜀"이 아니라 실제로 돌았을 것**
- `git diff main -- map/forge-api.php map/forge-core.js map/forge-tools.js` 가 비어 있다
- 서버 `wallet-api.php?op=ping` 이 `{"ok":true,"schema":1}`
- `https://parksvc.mycafe24.com/map/wallet.db` 가 404
- `grep -rn "MSWalletLocalStub" map/mobile/ | grep -v vendor` 가 비어 있다
- 백로그에 8b 완료와 남은 한계 둘이 적혀 있다
