# 8c 구글 로그인 + 익명 계정 병합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재설치해도 지갑이 사라지지 않게 한다 — 구글 로그인으로 익명 계정을 계정에 연결하고, 두 번째 기기부터는 익명 잔량을 버려 래칫을 막는다.

**Architecture:** 서버가 OAuth 왕복을 전부 하고(기존 `forge-auth.php` 흐름 재사용) 결과를 **논스**에 적는다. 앱은 브라우저를 열어놓고 `authPoll` 로 결과를 가져온다 — 딥링크가 없으므로 `AndroidManifest` 를 건드리지 않고, 개발 브라우저와 Capacitor 웹뷰에서 동일하게 돈다. 베어러 토큰에 주체 접두(`d:` 기기 / `a:` 계정)를 붙여 기기 B 가 구글 계정을 가리킬 수 있게 한다.

**Tech Stack:** PHP 8.4 + SQLite(PDO), 바닐라 JS(ES5) UMD, `node --test`, bash 하네스.

설계서: `map/docs/superpowers/specs/2026-08-15-moneyscoop-mobile-8c-google-auth-design.md`

## Global Constraints

- **프로덕션 SQLite 는 3.26.0** — `RETURNING` · `STRICT` · `ALTER TABLE ... DROP COLUMN` 사용 금지. 로컬은 3.45.1 이라 로컬에서만 통과하는 문법을 쓰기 쉽다.
- **돈을 만지는 트랜잭션은 `BEGIN IMMEDIATE` + `busy_timeout`**, 멱등은 `ledger.idem UNIQUE`, 잔량의 진실은 `SUM(ledger.delta)`(`accounts.balance` 는 복구 가능한 캐시).
- **ES5 only in `map/mobile/www/**`** — `var`/`function` 만. 화살표함수·템플릿리터럴·`const`/`let`·optional chaining·전개 금지. `map/mobile/test/**` 는 ESM.
- **사용자에게 보이는 문자열은 전부 `map/mobile/www/strings.js`.** 한국어는 코드 주석에만, WHY 만.
- 2 spaces, 큰따옴표. **좌측 세로 컬러 라인 금지** — 선택/활성은 배경·텍스트색·아웃라인으로만.
- **관문**: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh` — 현재 **952건**(forge-core 259 · forge-tools 81 · landing 28 · wallet 67 · wallet-dispatcher 71 · moneyscoop-mobile 446). `./tests/run.sh concurrency` · `dispatcher` 도 함께 돌린다. **forge-core · forge-tools · landing 셋은 무변동**이어야 한다(엔진·PC 미변경).
- **`forge_google_oauth.json` 없이 전 과정을 구현·테스트·병합한다.** 파일이 없으면 `authStart` 가 `auth-disabled` 를 돌려주고 지갑 화면이 로그인 행을 숨긴다 — PC 의 `fauth_enabled()` 와 같은 무중단 스위치.
- **`map/forge-core.js` · `map/forge-tools.js` · `map/forge-api.php` · `map/forge-auth.php` · `map/forge-auth-lib.php` 수정 금지.** PC 인증은 쿠키 기반이라 모바일과 계약이 다르다 — 재사용하는 것은 *흐름*이지 코드가 아니다.
- **프로덕션에 쓰기 금지.** 로컬 확인 시 `map/mobile/www/wallet-http.js` 가 `https://parksvc.mycafe24.com/map/wallet-api.php` 를 가리킨다. 브라우저를 연다면 그 호스트를 **탐색 전에** 가로챈다.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `map/wallet-lib.php` | 스키마 v3 · 토큰 주체 접두 · 논스 수명주기 · `w_merge` | 수정 |
| `map/wallet-auth.php` | 브라우저용 OAuth 엔드포인트(논스에 결과 기록) | **신규** |
| `map/wallet-api.php` | `authStart` · `authPoll` op · 계정 토큰 해석 | 수정 |
| `map/mobile/www/wallet-http.js` | `authStart`/`authPoll`/`signOut` + 토큰 두 벌 보관 | 수정 |
| `map/mobile/www/wallet.js` | 파사드 통과 | 수정 |
| `map/mobile/www/screens/wallet.js` | 로그인/로그아웃 행 | 수정 |
| `map/mobile/www/strings.js` | 문구 | 수정 |
| `map/tests/wallet-concurrency.sh` | 동시 병합 경합 | 수정 |
| `map/tests/wallet-dispatcher.sh` | 새 op · 논스 도용 · 하위 호환 토큰 | 수정 |
| `map/tests/wallet.test.mjs` | `w_merge` 단위(PHP CLI 경유) | 수정 |

**`wallet-auth.php` 를 `wallet-api.php` 와 분리하는 이유:** 하나는 브라우저가 직접 여는 리다이렉트 엔드포인트(HTML 응답·`Location` 헤더)이고 다른 하나는 앱이 부르는 JSON API 다. 응답 형식도 인증 방식도 다르다 — 한 파일에 넣으면 CORS 헤더와 리다이렉트가 뒤섞인다.

---

## Task 1: 스키마 v3 + 토큰 주체 접두

**Files:**
- Modify: `map/wallet-lib.php`
- Test: `map/tests/wallet.test.mjs`

**Interfaces:**
- Produces:
  - `w_token_make($dir, $subject)` — `$subject` 는 `"d:<deviceId>"` 또는 `"a:<accountId>"`
  - `w_token_read($dir, $token) -> array("type" => "device"|"acct", "id" => string) | null`
  - `auth_nonce` 테이블 · `ix_accounts_gsub` 유니크 인덱스 (스키마 v3)

- [ ] **Step 1: 테스트를 먼저 쓴다**

`map/tests/wallet.test.mjs` 끝에 추가. 이 파일은 PHP 를 CLI 로 불러 결과를 JSON 으로 받는 기존 방식을 쓴다 — 파일 상단의 헬퍼(`php(...)` 류)를 먼저 읽고 그 이름을 그대로 쓸 것.

```js
test("토큰 주체 — 기기와 계정을 구별하고, 접두 없는 옛 토큰은 기기로 읽는다", () => {
  const r = php(`
    $t1 = w_token_make($DIR, "d:dev-aaa");
    $t2 = w_token_make($DIR, "a:acct-bbb");
    // 접두 없는 옛 토큰을 그대로 만든다 — 배포 순간 살아 있는 토큰이 깨지면 안 된다.
    $exp = time() + 3600;
    $sig = _wb64e(hash_hmac("sha256", "dev-legacy|" . $exp, w_secret($DIR), true));
    $old = _wb64e("dev-legacy") . "|" . $exp . "|" . $sig;
    echo json_encode(array(
      "t1" => w_token_read($DIR, $t1), "t2" => w_token_read($DIR, $t2),
      "old" => w_token_read($DIR, $old),
      "tampered" => w_token_read($DIR, substr($t1, 0, -1) . "X")
    ));
  `);
  assert.deepEqual(r.t1, { type: "device", id: "dev-aaa" });
  assert.deepEqual(r.t2, { type: "acct", id: "acct-bbb" });
  assert.deepEqual(r.old, { type: "device", id: "dev-legacy" },
    "접두 없는 옛 토큰이 안 읽힌다 — 배포 순간 로그인된 사용자가 전부 튕긴다");
  assert.strictEqual(r.tampered, null, "변조된 토큰이 통과했다");
});

test("스키마 v3 — auth_nonce 와 google_sub 유니크 인덱스가 생긴다", () => {
  const r = php(`
    $rows = array();
    foreach ($db->query("select name from sqlite_master where type in ('table','index')") as $x) $rows[] = $x["name"];
    $v = $db->query("select v from schema_version")->fetch();
    echo json_encode(array("names" => $rows, "v" => (int)$v["v"]));
  `);
  assert.ok(r.names.includes("auth_nonce"), "auth_nonce 테이블이 없다");
  assert.ok(r.names.includes("ix_accounts_gsub"), "google_sub 유니크 인덱스가 없다");
  assert.strictEqual(r.v, 3);
});

// SQLite 의 유니크 인덱스는 NULL 을 서로 다른 값으로 본다. 이게 성립하지 않으면
// 미연결 계정이 둘째부터 생성 실패한다 — 온보딩이 통째로 죽는다.
test("google_sub 유니크 인덱스가 미연결 계정 여럿을 막지 않는다", () => {
  const r = php(`
    w_create_account($db, "dev-1", "iphash");
    w_create_account($db, "dev-2", "iphash");
    $n = $db->query("select count(*) c from accounts")->fetch();
    echo json_encode(array("n" => (int)$n["c"]));
  `);
  assert.strictEqual(r.n, 2, "google_sub 이 NULL 인 계정을 둘 이상 못 만든다");
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh wallet`
Expected: FAIL — `w_token_read` 가 문자열을 돌려주므로 `deepEqual` 이 어긋나고, `auth_nonce` 가 없다

- [ ] **Step 3: 토큰에 주체 접두를 넣는다**

`w_token_make`/`w_token_read` 를 바꾼다. **서명 대상 문자열은 접두를 포함한 주체 전체**다 — 접두만 서명 밖에 두면 `d:` 를 `a:` 로 바꿔 남의 계정을 가리킬 수 있다.

```php
// 주체는 "d:<deviceId>" 또는 "a:<accountId>". 접두를 서명 대상에 포함한다 —
// 밖에 두면 d: 를 a: 로 바꿔치기해 임의 계정을 가리킬 수 있다.
function w_token_make($dir, $subject) {
  $exp = time() + 365 * 86400;
  $sig = _wb64e(hash_hmac("sha256", $subject . "|" . $exp, w_secret($dir), true));
  return _wb64e($subject) . "|" . $exp . "|" . $sig;
}

// fail-closed — 변조·만료·형식 이상은 전부 null 이다.
// 접두가 없는 토큰은 8c 이전에 발급된 기기 토큰이다. 배포 순간 살아 있는 토큰을
// 깨뜨리지 않으려고 기기로 읽는다(만료 1년이라 한동안 남아 있다).
function w_token_read($dir, $token) {
  if (!is_string($token) || $token === "") return null;
  $p = explode("|", $token);
  if (count($p) !== 3) return null;
  $subject = _wb64d($p[0]);
  $exp = (int)$p[1];
  if ($subject === "" || $exp < time()) return null;
  $want = _wb64e(hash_hmac("sha256", $subject . "|" . $exp, w_secret($dir), true));
  if (!hash_equals($want, $p[2])) return null;
  if (strpos($subject, "d:") === 0) return array("type" => "device", "id" => substr($subject, 2));
  if (strpos($subject, "a:") === 0) return array("type" => "acct", "id" => substr($subject, 2));
  return array("type" => "device", "id" => $subject);   // 8c 이전 토큰
}
```

- [ ] **Step 4: 스키마 v3 마이그레이션을 더한다**

`w_migrate` 의 v2 블록 **뒤에** v3 블록을 같은 모양으로 붙인다(트랜잭션 안, 재실행 가능):

```php
  if (w_schema_version($db) < 3) {
    // v2 와 같은 규율: begin immediate 로 동시 부팅을 직렬화하고, 버전 기록을
    // 같은 트랜잭션에 넣어 스키마와 버전이 갈리는 창을 없앤다.
    $db->exec("begin immediate");
    try {
      $db->exec("create table if not exists auth_nonce (
        nonce TEXT PRIMARY KEY, device_id TEXT NOT NULL, google_sub TEXT,
        created_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)");
      // NULL 을 서로 다른 값으로 보는 SQLite 의 성질에 기댄다 — 미연결 계정은 여럿이어도
      // 걸리지 않고, 같은 google_sub 두 개만 막힌다. 동시 병합의 최종 방어선이다.
      $db->exec("create unique index if not exists ix_accounts_gsub on accounts (google_sub)");
      $db->exec("delete from schema_version");
      $db->exec("insert into schema_version (v) values (3)");
      $db->exec("commit");
    } catch (Throwable $e) {
      try { $db->exec("rollback"); } catch (Throwable $e2) {}
      throw $e;
    }
  }
```

- [ ] **Step 5: 호출부를 고친다**

`w_token_read` 의 반환이 바뀌었으므로 `wallet-api.php` 의 두 곳이 깨진다. 이 태스크에서는 **기기 토큰만 인식하도록 최소 수정**한다(계정 토큰 해석은 Task 3):

```php
$sub = w_token_read($W_DIR, w_bearer());
if ($sub === null || $sub["type"] !== "device") w_out(array("ok" => false, "reason" => "unauthorized"), 401);
$dev = $sub["id"];
```

`hello` 응답의 토큰 발급도 접두를 붙인다: `w_token_make($W_DIR, "d:" . $dev)`.

- [ ] **Step 6: 통과 확인 + 전량 관문**

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh wallet` → PASS
Run: `./tests/run.sh` · `./tests/run.sh dispatcher` · `./tests/run.sh concurrency`
Expected: 전부 통과. forge-core 259 · forge-tools 81 · landing 28 **무변동**

- [ ] **Step 7: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/wallet-api.php map/tests/wallet.test.mjs
git commit -m "$(cat <<'EOF'
wallet: 토큰에 주체 접두 + 스키마 v3

기기 B 가 구글 계정을 가리키려면 토큰이 기기가 아닌 계정을 지목할 수 있어야
한다. 접두는 반드시 서명 대상 안에 넣는다 — 밖에 두면 d: 를 a: 로 바꿔
임의 계정을 가리킬 수 있다.

접두 없는 토큰은 기기로 읽는다. 만료가 1년이라 배포 시점에 살아 있는 토큰이
많고, 그게 깨지면 로그인된 사용자가 전부 튕긴다.

google_sub 유니크 인덱스는 NULL 다중 허용에 기댄다 — 미연결 계정은 여럿이어도
걸리지 않고 같은 구글 계정 둘만 막힌다. 동시 병합의 최종 방어선이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 논스 수명주기 + `authStart` / `authPoll`(미완 경로)

**Files:**
- Modify: `map/wallet-lib.php` · `map/wallet-api.php` · `map/tests/wallet-dispatcher.sh`
- Test: `map/tests/wallet.test.mjs`

**Interfaces:**
- Consumes: `w_token_read` 의 `array("type","id")` 반환 (Task 1)
- Produces:
  - `w_nonce_make($db, $deviceId) -> string`
  - `w_nonce_read($db, $nonce) -> array|null` (행 그대로, 만료·사용됨이면 null)
  - `w_nonce_complete($db, $nonce, $googleSub) -> bool`
  - op `authStart` → `{ok:true, nonce, authUrl}` / `{ok:false, reason:"auth-disabled"}`
  - op `authPoll` → `{ok:true, pending:true}` (미완) — 완료 경로는 Task 3

- [ ] **Step 1: 테스트를 먼저 쓴다**

`map/tests/wallet.test.mjs` 에 추가:

```js
test("논스 — 단회용이고 10분 만료이며 기기에 묶인다", () => {
  const r = php(`
    $n = w_nonce_make($db, "dev-aaa");
    $a = w_nonce_read($db, $n);
    // 남의 논스를 주워도 못 쓴다는 것은 device_id 로 확인한다(호출부가 대조).
    $mismatch = ($a["device_id"] === "dev-aaa");
    w_nonce_complete($db, $n, "gsub-1");
    $b = w_nonce_read($db, $n);
    $again = w_nonce_complete($db, $n, "gsub-2");
    // 만료: created_at 을 11분 전으로 밀어 넣는다
    $n2 = w_nonce_make($db, "dev-bbb");
    $old = gmdate("c", time() - 11 * 60);
    $db->prepare("update auth_nonce set created_at = ? where nonce = ?")->execute(array($old, $n2));
    echo json_encode(array("bound" => $mismatch, "afterComplete" => $b, "again" => $again,
                           "expired" => w_nonce_read($db, $n2), "len" => strlen($n)));
  `);
  assert.strictEqual(r.bound, true, "논스가 기기에 안 묶였다");
  assert.ok(r.len >= 32, "논스가 너무 짧다: " + r.len);
  assert.notStrictEqual(r.afterComplete, null, "완료된 논스를 폴링에서 읽을 수 없다");
  assert.strictEqual(r.afterComplete.google_sub, "gsub-1");
  assert.strictEqual(r.again, false, "완료된 논스를 두 번 완료할 수 있다 — 병합이 두 번 돈다");
  assert.strictEqual(r.expired, null, "만료된 논스가 살아 있다");
});
```

`map/tests/wallet-dispatcher.sh` 에 추가(파일의 기존 `chk`/`post` 헬퍼를 그대로 쓴다):

```bash
# authStart — OAuth 설정 파일이 없으면 무중단 스위치가 켜진다
post '{"op":"authStart"}' "$TOK"
chk "설정 없으면 authStart 가 auth-disabled 다" "$(echo "$BODY" | jq -r .reason)" "auth-disabled"
chk "그래도 200 이다 — 로그인은 부가 기능이지 오류가 아니다" "$CODE" "200"

# 토큰 없이는 못 부른다
CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' -X POST -H "Content-Type: application/json" \
            --data '{"op":"authStart"}' "$BASE/wallet-api.php")
chk "토큰 없는 authStart 는 401 이다" "$CODE" "401"

# 남의 논스로 폴링 — 논스만 알면 남의 계정을 탈취하는 구멍이다
post '{"op":"authPoll","nonce":"someone-elses-nonce"}' "$TOK"
chk "모르는 논스는 401 이다" "$CODE" "401"
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh wallet` → FAIL (`w_nonce_make` 없음)
Run: `./tests/run.sh dispatcher` → FAIL (`authStart` 가 `bad-op`)

- [ ] **Step 3: 논스 헬퍼를 쓴다**

`map/wallet-lib.php` 에 추가. 상수는 파일 상단 `define` 블록에 함께 둔다:

```php
define("W_NONCE_TTL_SEC", 600);   // 10분. 사용자가 브라우저에서 로그인을 마칠 시간
```

```php
// 논스는 브라우저(구글 왕복)와 앱(폴링)을 잇는 유일한 끈이다. 추측 가능하면
// 남의 로그인 결과를 가로챌 수 있으므로 난수 32바이트를 쓴다.
function w_nonce_make($db, $deviceId) {
  $n = bin2hex(random_bytes(16));
  $st = $db->prepare("insert into auth_nonce (nonce, device_id, google_sub, created_at, used)
                      values (?, ?, null, ?, 0)");
  $st->execute(array($n, $deviceId, w_now()));
  return $n;
}

// 만료·사용됨은 없는 것과 같다(fail-closed). 호출부는 반환된 device_id 를
// 자기 토큰의 기기와 반드시 대조해야 한다 — 그게 "남의 논스" 방어다.
function w_nonce_read($db, $nonce) {
  if (!is_string($nonce) || $nonce === "") return null;
  $st = $db->prepare("select * from auth_nonce where nonce = ?");
  $st->execute(array($nonce));
  $r = $st->fetch();
  if (!$r) return null;
  if ((int)$r["used"] === 1) return null;
  if (strtotime($r["created_at"]) + W_NONCE_TTL_SEC < time()) return null;
  return $r;
}

// 브라우저 콜백이 부른다. 이미 채워진 논스는 다시 채우지 않는다 —
// where google_sub is null 이 그 방어이며, 경합에서도 한 번만 성립한다.
function w_nonce_complete($db, $nonce, $googleSub) {
  $st = $db->prepare("update auth_nonce set google_sub = ? where nonce = ? and google_sub is null");
  $st->execute(array($googleSub, $nonce));
  return $st->rowCount() === 1;
}

// 병합까지 끝난 논스는 태운다. 단회용의 실체가 이 줄이다.
function w_nonce_burn($db, $nonce) {
  $st = $db->prepare("update auth_nonce set used = 1 where nonce = ?");
  $st->execute(array($nonce));
}
```

`w_nonce_read` 는 `used=1` 을 null 로 보므로, 테스트의 `afterComplete` 는 `google_sub` 이 채워지고 아직 안 태워진 상태를 읽는다.

- [ ] **Step 4: OAuth 설정 판별을 더한다**

`map/wallet-lib.php` 에 추가. **PC 의 `forge_google_oauth.json` 을 그대로 읽는다** — 자격증명이 두 벌이 되면 갈린다:

```php
// PC(forge-auth-lib.php)와 같은 파일을 읽는다. 자격증명이 두 벌이 되면 갈린다.
// 파일이 없으면 로그인 기능 전체가 조용히 꺼진다(무중단 스위치).
function w_oauth_conf() {
  $f = __DIR__ . "/forge_google_oauth.json";
  if (!is_file($f)) return null;
  $j = json_decode((string)file_get_contents($f), true);
  return (is_array($j) && !empty($j["client_id"]) && !empty($j["client_secret"])) ? $j : null;
}
```

- [ ] **Step 5: `authStart` / `authPoll`(미완) op 를 더한다**

`map/wallet-api.php` 의 인증 블록 **뒤**, `get` 분기 근처에 넣는다:

```php
} elseif ($op === "authStart") {
  if (!w_oauth_conf()) w_out(array("ok" => false, "reason" => "auth-disabled"));
  $n = w_nonce_make($db, $dev);
  $base = "https://" . $_SERVER["HTTP_HOST"] . dirname($_SERVER["SCRIPT_NAME"]);
  w_out(array("ok" => true, "nonce" => $n, "authUrl" => $base . "/wallet-auth.php?nonce=" . urlencode($n)));
} elseif ($op === "authPoll") {
  $nonce = w_field_str($d, "nonce", "", W_STR_MAX);
  if ($nonce === false || $nonce === "") w_out(array("ok" => false, "reason" => "bad-request"), 400);
  $row = w_nonce_read($db, $nonce);
  // 모르는·만료된·태워진 논스와 "남의 논스"를 같은 401 로 답한다 — 어느 쪽인지
  // 알려주면 논스의 존재 여부를 캐낼 수 있다.
  if (!$row || $row["device_id"] !== $dev) w_out(array("ok" => false, "reason" => "unauthorized"), 401);
  if ($row["google_sub"] === null) w_out(array("ok" => true, "pending" => true));
  w_out(array("ok" => false, "reason" => "not-implemented"), 500);   // Task 3 이 채운다
}
```

- [ ] **Step 6: 통과 확인 + 커밋**

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh wallet` · `./tests/run.sh dispatcher` → PASS
Run: `./tests/run.sh` → 전량 통과

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/wallet-api.php map/tests/wallet.test.mjs map/tests/wallet-dispatcher.sh
git commit -m "$(cat <<'EOF'
wallet: 논스 수명주기 + authStart/authPoll(미완 경로)

브라우저(구글 왕복)와 앱(폴링)을 잇는 유일한 끈이라 추측 가능하면 남의 로그인
결과를 가로챈다 — 난수 16바이트, 10분 만료, 단회용, 기기에 묶임.

모르는 논스와 남의 논스를 같은 401 로 답한다. 구별해 주면 논스의 존재 여부를
캐낼 수 있다.

OAuth 자격증명은 PC 와 같은 forge_google_oauth.json 을 읽는다. 두 벌이 되면
갈린다. 파일이 없으면 authStart 가 auth-disabled 를 돌려주고 200 을 낸다 —
로그인은 부가 기능이지 오류가 아니다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 병합 `w_merge` + `authPoll` 완료 경로

**Files:**
- Modify: `map/wallet-lib.php` · `map/wallet-api.php` · `map/tests/wallet-concurrency.sh`
- Test: `map/tests/wallet.test.mjs`

**Interfaces:**
- Consumes: `w_nonce_read`/`w_nonce_burn` (Task 2) · `w_token_make($dir, "a:" . $acctId)` (Task 1)
- Produces: `w_merge($db, $deviceId, $googleSub) -> array("ok"=>bool, "acct"=>array, "moved"=>bool, "discarded"=>int)`

- [ ] **Step 1: 테스트를 먼저 쓴다**

```js
test("첫 병합 — 익명 계정이 곧 구글 계정이 된다(잔량 그대로)", () => {
  const r = php(`
    w_create_account($db, "dev-A", "ip");
    $a = w_get_account($db, "dev-A");
    $m = w_merge($db, "dev-A", "gsub-1");
    $after = w_get_account($db, "dev-A");
    echo json_encode(array("before" => (int)$a["balance"], "moved" => $m["moved"],
                           "after" => (int)$after["balance"], "gsub" => $after["google_sub"],
                           "id_same" => ($m["acct"]["id"] === $a["id"]),
                           "true" => w_true_balance($db, $after["id"])));
  `);
  assert.strictEqual(r.before, 5);
  assert.strictEqual(r.moved, false, "첫 병합은 옮기는 게 아니라 그 계정이 구글 계정이 되는 것이다");
  assert.strictEqual(r.after, 5, "첫 병합에서 잔량이 변했다");
  assert.strictEqual(r.gsub, "gsub-1");
  assert.strictEqual(r.id_same, true, "첫 병합인데 새 계정이 생겼다");
  assert.strictEqual(r.true, 5, "원장 합과 캐시가 갈렸다");
});

// 래칫 방지의 핵심. 이 검사가 없으면 "높은 쪽" 로직이 조용히 되살아난다.
test("두 번째 기기 — 익명 잔량은 버려지고 구글 잔량은 오르지 않는다", () => {
  const r = php(`
    w_create_account($db, "dev-A", "ip");
    w_merge($db, "dev-A", "gsub-1");
    $g = w_get_account($db, "dev-A");
    // 구글 계정 잔량을 3으로 낮춘다 — "높은 쪽"이면 5로 올라갈 상황을 만든다
    w_spend($db, $g["id"], "scan", "t:setup", null, null);
    $gBefore = w_true_balance($db, $g["id"]);

    w_create_account($db, "dev-B", "ip2");
    $b = w_get_account($db, "dev-B");
    $m = w_merge($db, "dev-B", "gsub-1");
    echo json_encode(array(
      "gBefore" => $gBefore, "gAfter" => w_true_balance($db, $g["id"]),
      "moved" => $m["moved"], "discarded" => $m["discarded"],
      "devBAfter" => w_true_balance($db, $b["id"]),
      "target" => ($m["acct"]["id"] === $g["id"])
    ));
  `);
  assert.strictEqual(r.gBefore, 3);
  assert.strictEqual(r.gAfter, 3, "두 번째 기기 병합으로 구글 잔량이 올랐다 — 래칫이 살아 있다");
  assert.strictEqual(r.moved, true);
  assert.strictEqual(r.discarded, 5, "버린 수량이 기록되지 않았다");
  assert.strictEqual(r.devBAfter, 0, "익명 잔량이 안 버려졌다 — 원장 합이 진실이 아니게 된다");
  assert.strictEqual(r.target, true, "기존 구글 계정이 아니라 다른 계정을 가리킨다");
});

test("스트릭은 두 번째 기기에서도 긴 쪽을 취한다", () => {
  const r = php(`
    w_create_account($db, "dev-A", "ip");
    w_merge($db, "dev-A", "gsub-1");
    $g = w_get_account($db, "dev-A");
    $db->prepare("update accounts set streak_days = 2 where id = ?")->execute(array($g["id"]));
    w_create_account($db, "dev-B", "ip2");
    $b = w_get_account($db, "dev-B");
    $db->prepare("update accounts set streak_days = 9 where id = ?")->execute(array($b["id"]));
    $m = w_merge($db, "dev-B", "gsub-1");
    echo json_encode(array("streak" => (int)$m["acct"]["streak_days"]));
  `);
  assert.strictEqual(r.streak, 9, "긴 스트릭이 안 넘어왔다");
});

test("병합은 멱등이다 — 같은 기기·같은 구글로 두 번 불러도 원장이 두 벌 안 생긴다", () => {
  const r = php(`
    w_create_account($db, "dev-A", "ip");
    w_merge($db, "dev-A", "gsub-1");
    w_create_account($db, "dev-B", "ip2");
    w_merge($db, "dev-B", "gsub-1");
    $n1 = (int)$db->query("select count(*) c from ledger")->fetch()["c"];
    w_merge($db, "dev-B", "gsub-1");
    $n2 = (int)$db->query("select count(*) c from ledger")->fetch()["c"];
    $g = w_get_account($db, "dev-A");
    echo json_encode(array("n1" => $n1, "n2" => $n2, "gBal" => w_true_balance($db, $g["id"])));
  `);
  assert.strictEqual(r.n2, r.n1, "두 번째 병합이 원장 줄을 더 만들었다");
  assert.strictEqual(r.gBal, 5, "재병합으로 잔량이 움직였다");
});
```

`map/tests/wallet-concurrency.sh` 에 새 시나리오를 더한다 — 파일의 기존 배리어 동기화 방식(모든 프로세스가 같은 파일을 기다렸다 동시에 출발)을 그대로 쓴다:

```bash
# 두 기기가 같은 구글 계정으로 동시에 첫 병합을 시도한다. 앱 층 검사만으로는
# 둘 다 "없다"를 보고 각자 google_sub 을 박아 계정이 둘 생긴다 —
# ix_accounts_gsub 유니크 인덱스가 DB 층에서 막는지 실측한다.
N=8
for i in $(seq 1 $N); do
  (
    while [ ! -f "$BARRIER" ]; do :; done
    php -r "require '$LIB'; \$db = w_db('$WDIR');
            w_create_account(\$db, 'dev-$i', 'ip-$i');
            \$m = @w_merge(\$db, 'dev-$i', 'same-gsub');
            echo (\$m && \$m['ok']) ? 'ok' : 'no';" >> "$WORK/merge-out" 2>/dev/null
  ) &
done
touch "$BARRIER"; wait

ACCTS=$(php -r "require '$LIB'; \$db = w_db('$WDIR');
                echo (int)\$db->query(\"select count(*) c from accounts where google_sub = 'same-gsub'\")->fetch()['c'];")
if [ "$ACCTS" != "1" ]; then
  echo "not ok - 같은 구글 계정으로 행이 $ACCTS 개 생겼다 (1이어야 한다)"; FAIL=$((FAIL+1))
else PASS=$((PASS+1)); fi

# 어느 병합이 이기든 원장 합과 캐시는 갈리면 안 된다
BAD=$(php -r "require '$LIB'; \$db = w_db('$WDIR'); \$n = 0;
              foreach (\$db->query('select id, balance from accounts') as \$a) {
                if ((int)\$a['balance'] !== w_true_balance(\$db, \$a['id'])) \$n++;
              } echo \$n;")
if [ "$BAD" != "0" ]; then
  echo \"not ok - 원장 합과 캐시가 갈린 계정 $BAD 개\"; FAIL=$((FAIL+1))
else PASS=$((PASS+1)); fi
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh wallet`
Expected: FAIL — `w_merge` 없음

- [ ] **Step 3: `w_merge` 를 쓴다**

```php
// 두 갈래뿐이다.
//  (a) 이 구글 계정으로 된 행이 없다 → 지금 기기 계정에 google_sub 을 박는다.
//      옮기는 게 아니라 그 계정이 곧 구글 계정이 된다. 잔량·스트릭·원장이 그대로 남는다.
//  (b) 있다 → 익명 잔량은 버린다. SPEC §4 의 "항상 높은 쪽"은 채택하지 않았다 —
//      기기를 바꿔가며 익명 5개를 받고 로그인하면 잔량이 계속 오르는 래칫이 된다.
//      버린 수량은 원장에 남긴다("5개가 어디 갔냐"에 답할 근거).
function w_merge($db, $deviceId, $googleSub) {
  $db->exec("begin immediate");
  try {
    $dev = w_get_account($db, $deviceId);
    if (!$dev) { $db->exec("rollback"); return array("ok" => false, "acct" => null, "moved" => false, "discarded" => 0); }

    $st = $db->prepare("select * from accounts where google_sub = ?");
    $st->execute(array($googleSub));
    $g = $st->fetch();

    $key = "merge:" . $googleSub . ":" . $dev["id"];

    if (!$g) {
      $db->prepare("update accounts set google_sub = ? where id = ?")->execute(array($googleSub, $dev["id"]));
      w_ledger_insert($db, $dev["id"], 0, "merge_claim", $googleSub, $key . ":claim");
      $db->exec("commit");
      return array("ok" => true, "acct" => w_get_account($db, $deviceId), "moved" => false, "discarded" => 0);
    }

    if ($g["id"] === $dev["id"]) {   // 이미 이 계정이 그 구글 계정이다 — 할 일 없음
      $db->exec("commit");
      return array("ok" => true, "acct" => $g, "moved" => false, "discarded" => 0);
    }

    $bal = w_true_balance($db, $dev["id"]);
    if ($bal > 0) {
      // 음수로 적어 잔량을 0으로 내린다. 캐시만 0으로 바꾸면 SUM(delta) 와 갈린다.
      w_ledger_insert($db, $dev["id"], -$bal, "merge_discard", $googleSub, $key . ":discard");
      $db->prepare("update accounts set balance = 0 where id = ?")->execute(array($dev["id"]));
    }
    // 구글 계정 쪽엔 delta 0 기록만 — 버린 수량과 출처 기기를 ref 에 담는다.
    w_ledger_insert($db, $g["id"], 0, "merge_from", $dev["id"] . ":" . $bal, $key . ":from");

    if ((int)$dev["streak_days"] > (int)$g["streak_days"]) {
      $db->prepare("update accounts set streak_days = ?, last_checkin = ? where id = ?")
         ->execute(array((int)$dev["streak_days"], $dev["last_checkin"], $g["id"]));
    }
    $db->exec("commit");
    $st = $db->prepare("select * from accounts where id = ?");
    $st->execute(array($g["id"]));
    return array("ok" => true, "acct" => $st->fetch(), "moved" => true, "discarded" => $bal);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    // 유니크 인덱스 충돌(동시 첫 병합의 패자) — 이긴 쪽이 만든 계정으로 다시 간다.
    $st = $db->prepare("select * from accounts where google_sub = ?");
    $st->execute(array($googleSub));
    $g = $st->fetch();
    if ($g) return w_merge($db, $deviceId, $googleSub);
    return array("ok" => false, "acct" => null, "moved" => false, "discarded" => 0);
  }
}
```

**`w_ledger_insert` 는 이 태스크가 새로 만드는 헬퍼다.** 지금 원장 삽입은 세 곳에 인라인으로 흩어져 있는데(`w_create_account`·`w_spend`·`w_checkin`), 병합은 한 트랜잭션에서 최대 세 줄을 쓰므로 헬퍼가 필요하다. **기존 세 곳은 건드리지 않는다** — 리팩터링은 이 페이즈의 일이 아니고, 돈 경로를 이유 없이 흔들지 않는다.

```php
// 병합이 한 트랜잭션에서 최대 세 줄을 쓴다. 기존 세 곳(w_create_account·w_spend·w_checkin)의
// 인라인 삽입은 그대로 둔다 — 돈 경로를 이유 없이 흔들지 않는다.
function w_ledger_insert($db, $acctId, $delta, $reason, $ref, $idem) {
  $st = $db->prepare("insert into ledger (account_id, delta, reason, ref, idem, created_at)
                      values (?, ?, ?, ?, ?, ?)");
  $st->execute(array($acctId, $delta, $reason, $ref, $idem, w_now()));
}
```

멱등키가 `idem UNIQUE` 에 걸려 예외가 나면 이미 병합된 것이므로, 위 `catch` 의 재조회 경로가 그것도 함께 처리한다.

- [ ] **Step 4: `authPoll` 완료 경로를 채운다**

Task 2 에서 `not-implemented` 로 둔 줄을 바꾼다:

```php
  $m = w_merge($db, $dev, $row["google_sub"]);
  if (!$m["ok"]) w_out(array("ok" => false, "reason" => "server-error"), 500);
  w_nonce_burn($db, $nonce);
  w_out(array("ok" => true, "pending" => false,
              "token" => w_token_make($W_DIR, "a:" . $m["acct"]["id"]),
              "discarded" => $m["discarded"], "state" => w_state($db, $m["acct"])));
```

계정 토큰을 인식하도록 인증 블록도 확장한다:

```php
$sub = w_token_read($W_DIR, w_bearer());
if ($sub === null) w_out(array("ok" => false, "reason" => "unauthorized"), 401);
if ($sub["type"] === "acct") {
  $st = $db->prepare("select * from accounts where id = ?");
  $st->execute(array($sub["id"]));
  $acct = $st->fetch();
  $dev = $acct ? $acct["device_id"] : null;
} else {
  $dev = $sub["id"];
  $acct = w_get_account($db, $dev);
}
if (!$acct) w_out(array("ok" => false, "reason" => "unauthorized"), 401);
```

**`authStart`·`authPoll` 은 기기 토큰만 받는다** — 계정 토큰으로 부르면 논스가 어느 기기 것인지 모호해진다. 두 op 앞에 `if ($sub["type"] !== "device") w_out(array("ok" => false, "reason" => "unauthorized"), 401);` 를 둔다.

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `./tests/run.sh wallet` · `./tests/run.sh dispatcher` · `./tests/run.sh concurrency` → PASS
Run: `./tests/run.sh` → 전량 통과

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/wallet-api.php map/tests/wallet.test.mjs map/tests/wallet-concurrency.sh
git commit -m "$(cat <<'EOF'
wallet: 익명 계정 병합 — 첫 병합만 잔량 이전

SPEC §4 의 "항상 높은 쪽"은 채택하지 않았다. 기기를 바꿔가며 익명 5개를 받고
로그인하면 잔량이 계속 오르는 래칫이 된다 — SPEC 자신이 "가장 유력한 남용
경로"라고 지목한 재설치 구멍이 병합 규칙으로 되살아난다.

버린 잔량은 익명 계정에 음수로 적는다. 캐시만 0으로 바꾸면 SUM(delta) 와
갈린다 — 잔량의 진실은 원장이다.

동시 첫 병합의 패자는 유니크 인덱스에서 튕긴 뒤 이긴 쪽 계정으로 다시 간다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `wallet-auth.php` — 브라우저 OAuth 엔드포인트

**Files:**
- Create: `map/wallet-auth.php`
- Test: `map/tests/wallet-dispatcher.sh`

**Interfaces:**
- Consumes: `w_oauth_conf` · `w_nonce_read` · `w_nonce_complete` (Task 2)
- Produces: `GET ?nonce=…` → 구글로 302 · `GET ?code=…&state=…` → 논스 기록 + 안내 HTML

- [ ] **Step 1: 테스트를 먼저 쓴다**

`map/tests/wallet-dispatcher.sh` 에 추가. **구글에는 요청하지 않는다** — 설정 파일이 없는 상태의 동작만 본다:

```bash
CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' "$BASE/wallet-auth.php?nonce=whatever")
BODY=$(cat "$WORK/out")
chk "설정 없으면 wallet-auth 는 503 이다" "$CODE" "503"
chk_no "본문에 경로가 안 샌다" "$BODY" "$DOCROOT"

CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' "$BASE/wallet-auth.php")
chk "논스 없이 열면 400 이다" "$CODE" "400"
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh dispatcher`
Expected: FAIL — `wallet-auth.php` 가 없어 404

- [ ] **Step 3: `wallet-auth.php` 를 쓴다**

```php
<?php
// 모바일 로그인의 브라우저 구간. 앱은 이 파일을 직접 부르지 않는다 —
// 브라우저를 여기로 열어두고 wallet-api.php 의 authPoll 로 결과를 가져간다.
//
// PC 의 forge-auth.php 와 흐름은 같고 결과를 두는 곳만 다르다: 쿠키가 아니라 논스다.
// Capacitor 앱은 https://localhost/ 에서 도므로 parksvc 쿠키가 교차 사이트가 된다.
ini_set("display_errors", "0");
require __DIR__ . "/wallet-lib.php";

$W_DIR = dirname(dirname(__DIR__)) . "/data";

function a_html($msg) {
  header("Content-Type: text/html; charset=utf-8");
  echo "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\">"
     . "<title>MoneyScoop</title><style>body{font:16px/1.6 system-ui;margin:0;display:flex;min-height:100vh;"
     . "align-items:center;justify-content:center;background:#0b0f14;color:#e8ecf4;padding:24px;text-align:center}</style>"
     . "<div>" . htmlspecialchars($msg, ENT_QUOTES, "UTF-8") . "</div>";
  exit;
}
function a_fail($code, $msg) { http_response_code($code); a_html($msg); }

$conf = w_oauth_conf();
if (!$conf) a_fail(503, "Sign-in is not available right now.");

$SELF = "https://" . $_SERVER["HTTP_HOST"] . strtok($_SERVER["REQUEST_URI"], "?");
$db = w_db($W_DIR);

// ① 앱이 연 첫 진입 — 논스를 state 에 실어 구글로 보낸다. 별도 state 쿠키가 필요 없다:
//    논스 자체가 단회용·10분 만료·기기 바인딩이라 CSRF 토큰의 역할을 겸한다.
if (isset($_GET["nonce"])) {
  $row = w_nonce_read($db, (string)$_GET["nonce"]);
  if (!$row) a_fail(400, "This sign-in link has expired. Please try again from the app.");
  $q = http_build_query(array(
    "client_id" => $conf["client_id"], "redirect_uri" => $SELF, "response_type" => "code",
    "scope" => "openid email", "state" => $row["nonce"], "prompt" => "select_account"));
  header("Location: https://accounts.google.com/o/oauth2/v2/auth?" . $q);
  exit;
}

// ② 구글 콜백
if (isset($_GET["code"], $_GET["state"])) {
  $row = w_nonce_read($db, (string)$_GET["state"]);
  if (!$row) a_fail(400, "This sign-in link has expired. Please try again from the app.");

  $ch = curl_init("https://oauth2.googleapis.com/token");
  curl_setopt_array($ch, array(
    CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query(array(
      "code" => $_GET["code"], "client_id" => $conf["client_id"],
      "client_secret" => $conf["client_secret"], "redirect_uri" => $SELF,
      "grant_type" => "authorization_code"))));
  $tok = json_decode((string)curl_exec($ch), true);
  curl_close($ch);

  // id_token 페이로드를 그대로 읽는다 — 구글 토큰 엔드포인트에서 TLS 로 직접 받았으므로
  // 서명 재검증이 필요 없다(forge-auth.php 와 같은 판단).
  $sub = null;
  if (is_array($tok) && !empty($tok["id_token"])) {
    $seg = explode(".", $tok["id_token"]);
    if (count($seg) === 3) {
      $p = json_decode((string)base64_decode(strtr($seg[1], "-_", "+/")), true);
      if (is_array($p) && !empty($p["sub"])) $sub = (string)$p["sub"];
    }
  }
  if (!$sub) a_fail(400, "Sign-in failed. Please try again from the app.");

  w_nonce_complete($db, $row["nonce"], $sub);
  a_html("You are signed in. Return to the MoneyScoop app.");
}

a_fail(400, "Nothing to do here.");
```

**`sub` 를 쓰고 이메일은 저장하지 않는다** — 계정 식별에 필요한 것은 `sub`(구글의 안정적 사용자 id)뿐이고, 이메일은 사용자가 바꿀 수 있어 키로 부적합하다. 설계서 §7 의 "이메일 외 프로필 안 받는다"와 같은 방향이다.

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh dispatcher` → PASS
Run: `./tests/run.sh` → 전량 통과

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-auth.php map/tests/wallet-dispatcher.sh
git commit -m "$(cat <<'EOF'
wallet: 모바일 로그인의 브라우저 구간

PC 의 forge-auth.php 와 흐름은 같고 결과를 두는 곳만 다르다 — 쿠키가 아니라
논스다. Capacitor 앱은 https://localhost/ 에서 돌아 parksvc 쿠키가 교차
사이트가 되기 때문이다.

state 쿠키를 따로 두지 않는다. 논스 자체가 단회용·10분 만료·기기 바인딩이라
CSRF 토큰 역할을 겸한다.

계정 키는 이메일이 아니라 구글 sub 이다 — 이메일은 사용자가 바꿀 수 있어
키로 부적합하다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 클라이언트 — 토큰 두 벌 보관 + 로그인/폴링

**Files:**
- Modify: `map/mobile/www/wallet-http.js` · `map/mobile/www/wallet.js`
- Test: `map/mobile/test/wallet-http.test.mjs`

**Interfaces:**
- Consumes: op `authStart` → `{ok, nonce, authUrl}` / op `authPoll` → `{ok, pending}` 또는 `{ok, token, discarded, state}` (Task 2·3)
- Produces:
  - `MSWallet.authStart() -> Promise<{ok, authUrl, nonce, reason}>`
  - `MSWallet.authPoll(nonce) -> Promise<{ok, pending, discarded, state, reason}>`
  - `MSWallet.signOut() -> void` (동기 — 서버 op 없음)
  - `MSWallet.signedIn() -> boolean`

- [ ] **Step 1: 테스트를 먼저 쓴다**

`map/mobile/test/wallet-http.test.mjs` 에 추가. 파일 상단의 가짜 `fetch`/`store` 만드는 헬퍼를 먼저 읽고 그대로 쓸 것:

```js
test("로그인 후에는 계정 토큰을 쓰고, 기기 토큰은 버리지 않는다", async () => {
  const seen = [];
  const w = MSWalletHttp.create({
    url: "https://x/api", store: memStore({ ms_wallet_token: "DEVTOK" }),
    fetch: fakeFetch((body, headers) => {
      seen.push({ op: JSON.parse(body).op, auth: headers.Authorization });
      const op = JSON.parse(body).op;
      if (op === "authPoll") return { ok: true, pending: false, token: "ACCTTOK", discarded: 5, state: { balance: 3 } };
      return { ok: true, state: { balance: 3 } };
    })
  });
  const p = await w.authPoll("nonce-1");
  assert.strictEqual(p.discarded, 5);
  await w.get();
  assert.strictEqual(seen[0].auth, "Bearer DEVTOK", "폴링은 기기 토큰으로 해야 한다");
  assert.strictEqual(seen[1].auth, "Bearer ACCTTOK", "로그인 후에도 기기 토큰을 쓰고 있다");
  assert.strictEqual(w.signedIn(), true);

  w.signOut();
  await w.get();
  assert.strictEqual(seen[2].auth, "Bearer DEVTOK", "로그아웃 후 기기 토큰으로 안 돌아갔다");
  assert.strictEqual(w.signedIn(), false);
});

test("authStart 가 auth-disabled 면 로그인 UI 를 숨길 근거를 준다", async () => {
  const w = MSWalletHttp.create({
    url: "https://x/api", store: memStore({ ms_wallet_token: "DEVTOK" }),
    fetch: fakeFetch(() => ({ ok: false, reason: "auth-disabled" }))
  });
  const r = await w.authStart();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "auth-disabled");
});

// 계정 토큰이 만료·폐기되면 401 이 온다. 그때 기기 토큰으로 조용히 내려앉아야
// 앱이 잠기지 않는다 — 로그인은 부가 기능이지 관문이 아니다.
test("계정 토큰이 401 이면 기기 토큰으로 내려앉는다", async () => {
  const seen = [];
  const w = MSWalletHttp.create({
    url: "https://x/api", store: memStore({ ms_wallet_token: "DEVTOK", ms_account_token: "STALE" }),
    fetch: fakeFetch((body, headers, n) => {
      seen.push(headers.Authorization);
      if (headers.Authorization === "Bearer STALE") return { status: 401, json: { ok: false, reason: "unauthorized" } };
      return { ok: true, state: { balance: 7 } };
    })
  });
  const r = await w.get();
  assert.strictEqual(r.ok, true, "계정 토큰이 죽자 앱도 같이 죽었다");
  assert.strictEqual(r.state.balance, 7);
  assert.strictEqual(w.signedIn(), false, "죽은 계정 토큰이 남아 있다");
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/wallet-http.test.mjs`
Expected: FAIL — `w.authStart is not a function`

- [ ] **Step 3: `wallet-http.js` 에 넣는다**

토큰 키를 하나 더 쓴다. 기기 토큰(`ms_tok`)은 **지우지 않는다** — 로그아웃이 그리로 돌아가는 경로다.

파일 상단 `var K_DEV = "ms_device_id", K_TOK = "ms_wallet_token", K_REFQ = "ms_pending_refunds";` 에 키를 하나 더한다:

```js
  var K_ATOK = "ms_account_token";   // 계정 토큰. 있으면 이걸 쓰고, 없으면 기기 토큰(K_TOK).
```

```js
    function acctTok() { return get0(K_ATOK, null); }
    function signedIn() { return !!acctTok(); }
    // 기기 토큰(K_TOK)은 지우지 않는다 — 로그아웃이 그리로 돌아가는 경로다.
    function signOut() { set0(K_ATOK, null); }
```

**`call(body)` 를 고친다.** 이 함수는 이미 401 을 만나면 `hello()` 로 재인증하는 경로를 갖고 있다. 계정 토큰은 그 앞단에 얹는다 — 계정 토큰이 401 이면 그것만 버리고 기존 경로로 내려보낸다:

```js
    function call(body) {
      // 계정 토큰이 있으면 먼저 그것으로 시도한다. 죽었으면(401) 조용히 버리고
      // 기기 토큰 경로로 내려앉는다 — 로그인은 부가 기능이라, 그것 때문에 앱 전체가
      // 잠기면 안 된다. hello() 재인증은 아래 기존 경로가 그대로 처리한다.
      var at = acctTok();
      if (at) {
        return post(body, at).then(function (r) {
          if (r && r.status !== 401) return r;
          signOut();
          return callWithDevice(body);
        });
      }
      return callWithDevice(body);
    }
```

기존 `call` 의 본문을 그대로 `callWithDevice(body)` 로 이름만 바꿔 옮긴다 — **내용은 한 줄도 고치지 않는다**(그 안의 401→`hello()` 재인증 주석이 오프라인과 실제 401 을 구별하는 근거를 담고 있다).

`authStart`/`authPoll` 은 **항상 기기 토큰으로** 보낸다(서버가 그것만 받는다). `call` 을 거치지 않고 `post` 를 직접 쓰되, 기기 토큰이 없으면 `hello()` 로 먼저 받는다:

```js
    // 기기 토큰이 없으면 hello() 로 먼저 받는다(call 의 앞부분과 같은 이유).
    function withDeviceTok(fn) {
      var t = get0(K_TOK, null);
      if (t) return fn(t);
      return hello().then(function (nt) { return nt ? fn(nt) : null; });
    }

    function authStart() {
      return withDeviceTok(function (t) { return post({ op: "authStart" }, t); }).then(function (r) {
        if (!r) return { ok: false, authUrl: "", nonce: "", reason: "network" };
        return r.ok ? { ok: true, authUrl: r.json.authUrl, nonce: r.json.nonce, reason: "" }
                    : { ok: false, authUrl: "", nonce: "", reason: (r.json && r.json.reason) || "network" };
      });
    }
    function authPoll(nonce) {
      return withDeviceTok(function (t) { return post({ op: "authPoll", nonce: nonce }, t); }).then(function (r) {
        if (!r || !r.ok) return { ok: false, pending: false, reason: (r && r.json && r.json.reason) || "network" };
        if (r.json.pending) return { ok: true, pending: true, reason: "" };
        // 서버가 계정 토큰을 줬다 — 이 순간부터 이 기기는 구글 계정을 본다.
        set0(K_ATOK, r.json.token);
        return { ok: true, pending: false, discarded: r.json.discarded || 0, state: r.json.state, reason: "" };
      });
    }
```

`wallet.js` 파사드에 통과 함수를 더하고 반환 객체에 넣는다:

```js
  function authStart() { return backend ? backend.authStart() : Promise.resolve({ ok: false, reason: "no-backend" }); }
  function authPoll(n) { return backend ? backend.authPoll(n) : Promise.resolve({ ok: false, reason: "no-backend" }); }
  function signOut() { if (backend && backend.signOut) backend.signOut(); }
  function signedIn() { return !!(backend && backend.signedIn && backend.signedIn()); }
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/wallet-http.test.mjs` → PASS
Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh` → 전량 통과

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/wallet-http.js map/mobile/www/wallet.js map/mobile/test/wallet-http.test.mjs
git commit -m "$(cat <<'EOF'
wallet: 클라이언트가 계정 토큰과 기기 토큰을 함께 보관한다

기기 토큰을 지우지 않는다 — 로그아웃이 그리로 돌아가는 경로다.

계정 토큰이 401 이면 조용히 기기 토큰으로 내려앉고 한 번 다시 시도한다.
로그인은 부가 기능이라 그것 때문에 앱 전체가 잠기면 안 된다.

authStart/authPoll 은 항상 기기 토큰으로 보낸다 — 계정 토큰으로 부르면
논스가 어느 기기 것인지 모호해진다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 지갑 화면 로그인 행

**Files:**
- Modify: `map/mobile/www/screens/wallet.js` · `map/mobile/www/strings.js` · `map/mobile/www/style.css`
- Test: `map/mobile/test/wallet-screens.test.mjs`

**Interfaces:**
- Consumes: `MSWallet.authStart()` · `authPoll(nonce)` · `signOut()` · `signedIn()` (Task 5)

- [ ] **Step 1: 테스트를 먼저 쓴다**

```js
test("지갑 화면 — 로그인 전엔 로그인 행, 후엔 로그아웃 행", () => {
  withWalletDom((root, W) => {
    W.signedIn = () => false;
    MSWalletScreen.render(root);
    assert.ok(findText(root, S.t.wSignIn), "로그인 행이 없다");

    W.signedIn = () => true;
    MSWalletScreen.render(root);
    assert.ok(findText(root, S.t.wSignOut), "로그아웃 행이 없다");
    assert.ok(!findText(root, S.t.wSignIn), "로그인·로그아웃 행이 동시에 떴다");
  });
});

// 무중단 스위치. 서버에 자격증명이 없으면 눌러도 아무 일 없는 죽은 버튼이 된다.
test("authStart 가 auth-disabled 면 로그인 행이 사라진다", async () => {
  await withWalletDom(async (root, W) => {
    W.signedIn = () => false;
    W.authStart = () => Promise.resolve({ ok: false, reason: "auth-disabled" });
    MSWalletScreen.render(root);
    findText(root, S.t.wSignIn).click();
    await flush();
    assert.ok(!findText(root, S.t.wSignIn), "죽은 로그인 버튼이 남아 있다");
  });
});

test("두 번째 기기 병합이면 버려진 수량을 사용자에게 말한다", async () => {
  await withWalletDom(async (root, W) => {
    W.signedIn = () => false;
    W.authStart = () => Promise.resolve({ ok: true, authUrl: "https://x/a", nonce: "n1" });
    W.authPoll = () => Promise.resolve({ ok: true, pending: false, discarded: 5, state: { balance: 3 } });
    MSWalletScreen.render(root);
    findText(root, S.t.wSignIn).click();
    await flush();
    // "조용히 사라진 5개"가 없어야 한다 — 문의로 돌아온다.
    assert.ok(findText(root, S.t.wMergeDiscarded.replace("{n}", "5")),
      "버려진 잔량을 사용자에게 말하지 않았다");
  });
});
```

`withWalletDom`·`findText`·`flush` 는 이 파일에 **없을 수 있다** — 없으면 `map/mobile/test/onboarding.test.mjs` 의 `withDom` 을 본떠 이 파일에 만든다. 만들 때 `MSWallet` 을 통째로 가짜로 주입할 수 있어야 한다(위 테스트가 `W.authStart` 를 갈아끼운다).

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/wallet-screens.test.mjs`
Expected: FAIL — `S.t.wSignIn` 이 undefined

- [ ] **Step 3: 화면에 넣는다**

`strings.js`:

```js
    wSignIn: "Sign in with Google",
    wSignInHint: "Keeps your Scoops if you reinstall or change phones.",
    wSignOut: "Sign out",
    wSignInWaiting: "Waiting for the browser…",
    wSignInFailed: "Sign-in did not finish. Try again.",
    wMergeDiscarded: "This device had {n} Scoops. Your account balance is the one that counts.",
    wWatchlistLocal: "Your ticker list stays on this device.",
```

`screens/wallet.js` — 잔량 카드 아래에 행 하나. 폴링은 2초 간격, 10분 뒤 포기한다:

```js
  // 브라우저를 열어두고 결과를 폴링한다. 딥링크(moneyscoop://)를 쓰면 AndroidManifest
  // 인텐트 필터가 필요해 이 페이즈가 안드로이드 빌드에 묶인다 — 그 빌드는 아직 안 돌았다.
  var POLL_MS = 2000, POLL_LIMIT = 300;   // 2초 × 300 = 10분(서버 논스 만료와 같다)

  function startSignIn(row, msg) {
    msg.textContent = MSStr.t.wSignInWaiting;
    MSWallet.authStart().then(function (r) {
      if (!r.ok) {
        // auth-disabled = 서버에 자격증명이 없다. 눌러도 아무 일 없는 버튼을 남기지 않는다.
        if (r.reason === "auth-disabled") { row.parentNode.removeChild(row); return; }
        msg.textContent = MSStr.t.wSignInFailed; return;
      }
      window.open(r.authUrl, "_blank");
      poll(r.nonce, 0, msg);
    });
  }

  function poll(nonce, n, msg) {
    if (n >= POLL_LIMIT) { msg.textContent = MSStr.t.wSignInFailed; return; }
    MSWallet.authPoll(nonce).then(function (r) {
      if (r.ok && r.pending) { setTimeout(function () { poll(nonce, n + 1, msg); }, POLL_MS); return; }
      if (!r.ok) { msg.textContent = MSStr.t.wSignInFailed; return; }
      // 버린 잔량이 있으면 반드시 말한다 — 안 말하면 "5개가 어디 갔냐"로 돌아온다.
      if (r.discarded > 0) msg.textContent = MSStr.t.wMergeDiscarded.replace("{n}", String(r.discarded));
      else msg.textContent = "";
      draw();
    });
  }
```

`draw()` 안에서 행을 만든다 — `signedIn()` 에 따라 로그인/로그아웃 하나만:

```js
    var authRow = MSUi.el("button", "w-row w-auth");
    authRow.type = "button";
    if (MSWallet.signedIn()) {
      authRow.textContent = MSStr.t.wSignOut;
      authRow.addEventListener("click", function () { MSWallet.signOut(); draw(); });
    } else {
      authRow.textContent = MSStr.t.wSignIn;
      authRow.addEventListener("click", function () { startSignIn(authRow, authMsg); });
    }
```

로그인 행 아래에 `wSignInHint`, 그 아래에 `wWatchlistLocal` 을 각각 `.w-sub` 로 둔다 — 워치리스트가 안 따라온다는 것을 **숨기지 않는다**(설계서 "동기화 범위" 결정).

`style.css` — `.w-auth` 는 기존 `.w-row` 를 따르고, 좌측 세로 라인은 넣지 않는다:

```css
.w-auth{width:100%;text-align:left;background:var(--surface);border:1px solid var(--border);
  border-radius:5px;padding:12px 14px;color:var(--ink);font-size:14px}
.w-auth:active{background:var(--hover)}
```

- [ ] **Step 4: 통과 확인 + 전량 관문 + 커밋**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/*.test.mjs` → PASS
Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh` · `./tests/run.sh dispatcher` · `./tests/run.sh concurrency`
Expected: 전량 통과. forge-core 259 · forge-tools 81 · landing 28 무변동

`map/mobile/docs/BACKLOG-mobile.md` 를 갱신한다 — ✅ 완료에 8c 를 적고(래칫을 왜 SPEC 원문과 다르게 막았는지 포함), 🔥 다음에서 8c 를 지우고 안드로이드 빌드 → 8d 로 갱신한다. 📋 예정에 남는 것: 워치리스트 동기화, 애플 로그인, 계정 삭제.

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/screens/wallet.js map/mobile/www/strings.js map/mobile/www/style.css \
        map/mobile/test/wallet-screens.test.mjs map/mobile/docs/BACKLOG-mobile.md
git commit -m "$(cat <<'EOF'
wallet: 지갑 화면 로그인 행

버린 잔량이 있으면 반드시 말한다 — 안 말하면 "5개가 어디 갔냐"로 돌아온다.

워치리스트가 기기별로 남는다는 것도 같은 화면에 적는다. 잔량은 따라오는데
종목 목록은 안 따라오면 사용자 눈엔 반만 옮겨진 상태로 보인다.

서버에 자격증명이 없으면 로그인 행 자체를 지운다 — 눌러도 아무 일 없는
버튼을 남기지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 완료 조건

- `./tests/run.sh` 통과, **forge-core 259 · forge-tools 81 · landing 28 무변동**
- `./tests/run.sh concurrency` — 같은 구글 계정 동시 병합에서 계정 행이 **정확히 1개**
- `./tests/run.sh dispatcher` — 새 op 4검사 + `wallet-auth.php` 2검사 통과
- `git diff main -- map/forge-core.js map/forge-tools.js map/forge-api.php map/forge-auth.php map/forge-auth-lib.php` 가 비어 있다
- 모든 계정에서 `SUM(ledger.delta) == accounts.balance`
- `forge_google_oauth.json` 없이 전 과정이 돌고, 그 상태에서 지갑 화면에 로그인 행이 안 뜬다
