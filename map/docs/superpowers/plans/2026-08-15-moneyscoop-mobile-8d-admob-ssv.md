# 8d AdMob 리워드 광고 + SSV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경제의 버는 쪽을 연다 — 리워드 광고를 보면 스쿱이 늘고, 그 지급은 오직 구글이 서명한 SSV 콜백으로만 일어난다.

**Architecture:** 앱은 광고를 띄우기만 하고 "봤다"고 말하지 않는다. 구글이 우리 서버의 `wallet-ssv.php` 를 서명된 GET 으로 부르면 서버가 서명·중복·상한을 확인해 원장에 적립하고, 앱은 기존 `get` 을 짧게 폴링해 잔량이 오르는 것을 본다. 서버 4단계(가드·서명·적립·설정) 뒤에 네이티브 1단계, 화면 1단계 순으로 간다 — 앞의 넷은 네이티브 없이 전부 검증된다.

**Tech Stack:** PHP 8.4 + SQLite(PDO) + openssl(ECDSA), 바닐라 JS(ES5) UMD, `@capacitor-community/admob@8.1.0`, `node --test`, bash 하네스.

설계서: `map/docs/superpowers/specs/2026-08-15-moneyscoop-mobile-8d-admob-ssv.md`

## Global Constraints

- **프로덕션 SQLite 는 3.26.0** — `RETURNING` · `STRICT` · `ALTER TABLE ... DROP COLUMN` 금지. 로컬은 3.45.1 이라 로컬만 통과하는 문법을 쓰기 쉽다.
- **돈을 만지는 트랜잭션은 `BEGIN IMMEDIATE` + `busy_timeout`**, 멱등은 `ledger.idem UNIQUE`, 잔량의 진실은 `SUM(ledger.delta)`(`accounts.balance` 는 복구 가능한 캐시). **둘이 갈리면 안 된다.**
- **ES5 only in `map/mobile/www/**`** — `var`/`function` 만. 화살표함수·템플릿리터럴·`const`/`let`·optional chaining·전개 금지. `map/mobile/test/**` 는 ESM.
- **사용자에게 보이는 문자열은 전부 `map/mobile/www/strings.js`.** 한국어는 코드 주석에만, WHY 만.
- 2 spaces, 큰따옴표. **좌측 세로 컬러 라인 금지** — 선택/활성은 배경·텍스트색·아웃라인으로만.
- **PHP 단위 테스트 파일은 `map/tests/wallet.test.php`** 다(`.mjs` 아님 — `t()`/`ok()`/`eq()` 헬퍼). 디스패처는 `map/tests/wallet-dispatcher.sh`, 동시성은 `map/tests/wallet-concurrency.sh`.
- **관문**: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh` — 현재 **1045건**(forge-core 259 · forge-tools 81 · landing 28 · wallet 89 · wallet-dispatcher 122 · moneyscoop-mobile 466). `./tests/run.sh dispatcher` · `concurrency` 도 함께. **forge-core · forge-tools · landing 셋은 무변동**(엔진·PC 미변경).
- **`map/forge-*.js` · `map/forge-*.php` · `map/mobile/www/vendor/` 수정 금지.**
- **구글에 접속하지 않는다.** 공개키는 고정 픽스처, 서명은 테스트 키쌍으로 만든다. `accounts.google.com` · `oauth2.googleapis.com` · `gstatic.com` · `parksvc.mycafe24.com` 어디에도 요청하지 않는다.
- **테스트 광고 유닛 ID 로 개발한다.** 실 ID 를 저장소에 넣지 않는다 — 넣으면 남이 우리 계정으로 광고를 띄운다.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `map/wallet-lib.php` | 스키마 v4 · `w_ssv_verify` · `w_ad_grant` · `w_spend` 병합 가드 | 수정 |
| `map/wallet-ssv.php` | 구글이 부르는 공개 SSV 콜백(서명 GET) | **신규** |
| `map/wallet-api.php` | `adConfig` · `adState` op | 수정 |
| `map/mobile/www/ads.js` | `MSAds` — 플러그인 파사드(광고 로드·표시·상태) | **신규** |
| `map/mobile/www/wallet-http.js` · `wallet.js` | `adConfig`/`adState` 클라이언트 | 수정 |
| `map/mobile/www/screens/wallet.js` | 광고 두 줄 · 광고 설정 행 · 고지 | 수정 |
| `map/mobile/www/screens/report.js` | 잔량 부족 시 그 자리에서 광고 권유 | 수정 |
| `map/mobile/www/strings.js` · `style.css` · `index.html` | 문구 · 스타일 · 스크립트 태그 | 수정 |
| `map/mobile/android/app/src/main/AndroidManifest.xml` | AdMob 앱 ID(테스트) | 수정 |
| `map/mobile/package.json` | 플러그인 고정 버전 | 수정 |
| `map/mobile/docs/ANDROID-BUILD.md` | 플러그인 추가 후 빌드 절차 | 수정 |
| `map/tests/wallet.test.php` · `wallet-dispatcher.sh` · `wallet-concurrency.sh` | 검증 | 수정 |

**`wallet-ssv.php` 를 `wallet-api.php` 와 분리하는 이유:** 하나는 구글이 부르는 무인증 공개 GET 이고 다른 하나는 앱이 베어러로 부르는 JSON API 다. 인증 방식도 응답 형식(빈 200 vs JSON)도 다르다 — 한 파일에 넣으면 CORS 헤더와 베어러 검사가 뒤섞인다. `wallet-auth.php` 를 분리한 것과 같은 판단이다.

**`ads.js` 를 파사드로 두는 이유:** 플러그인 API 를 화면이 직접 부르면 브라우저에서 화면을 테스트할 수 없다(플러그인이 없다). 파사드가 있으면 화면 테스트는 가짜 `MSAds` 를 꽂는다.

---

## Task 1: `w_spend` 병합 가드 + 스키마 v4

**Files:**
- Modify: `map/wallet-lib.php`
- Test: `map/tests/wallet.test.php`

**Interfaces:**
- Produces: `ad_grants` 테이블(스키마 v4) · `w_spend` 가 `w_is_merged_away` 를 존중

**왜 먼저인가:** 8c 최종 리뷰가 이 페이즈의 **선행 조건**으로 지목했다. `w_checkin`·`w_refund` 는 `w_is_merged_away` 를 보는데 `w_spend` 만 안 본다. 지금은 병합된 계정 잔량이 0이라 우연히 안전하지만, 광고 지급은 **`w_checkin` 을 거치지 않고 적립하는 첫 경로**라 그 순간 죽은 지갑이 되살아난다.

- [ ] **Step 1: 테스트를 먼저 쓴다**

`map/tests/wallet.test.php` 끝에 붙인다. 파일 상단의 `t()`/`ok()`/`eq()` 헬퍼와 DB 를 만드는 방식을 먼저 읽고 그 관례를 그대로 쓸 것.

```php
t("병합된 계정은 쓸 수도 없다 — checkin·refund 와 같은 규율", function ($db, $DIR) {
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  w_create_account($db, "dev-B", "ip2");
  $b = w_get_account($db, "dev-B");
  w_merge($db, "dev-B", "gsub-1");            // dev-B 는 잔량을 버리고 얼어붙는다

  // 얼어붙은 계정에 원장으로 직접 5를 넣어 본다 — 광고 지급이 하려는 바로 그 일이다.
  w_ledger_insert($db, $b["id"], 5, "test_credit", null, "t:credit");
  $db->prepare("update accounts set balance = 5 where id = ?")->execute(array($b["id"]));

  $r = w_spend($db, $b["id"], "scan", "t:spend", null, null);
  eq($r["ok"], false, "병합된 계정이 스쿱을 썼다");
  eq($r["reason"], "merged", "사유가 merged 가 아니다");
  eq($r["charged"], false, "차감이 일어났다");   // charged 는 불리언이다(숫자가 아니다)
  eq(w_true_balance($db, $b["id"]), 5, "원장이 움직였다");
});

t("정상 계정의 spend 는 그대로 된다 — 가드가 전부를 막으면 안 된다", function ($db, $DIR) {
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  $r = w_spend($db, $a["id"], "scan", "t:ok", null, null);
  eq($r["ok"], true, "정상 계정이 막혔다");
  eq(w_true_balance($db, $a["id"]), 3, "5 - scan 2 = 3 이어야 한다");
});

t("스키마 v4 — ad_grants 와 그 인덱스가 생긴다", function ($db, $DIR) {
  $names = array();
  foreach ($db->query("select name from sqlite_master where type in ('table','index')") as $x) $names[] = $x["name"];
  ok(in_array("ad_grants", $names), "ad_grants 테이블이 없다");
  ok(in_array("ix_ad_acct", $names), "ix_ad_acct 인덱스가 없다");
  $v = $db->query("select v from schema_version")->fetch();
  eq((int)$v["v"], 4, "스키마 버전이 4 가 아니다");
});

t("transaction_id 가 PK 라 중복 삽입이 DB 층에서 막힌다", function ($db, $DIR) {
  $db->exec("insert into ad_grants (transaction_id, account_id, unit, amount, granted, created_at)
             values ('tx-1', 'a1', 'quick', 1, 1, '2026-08-15T00:00:00+00:00')");
  $threw = false;
  try {
    $db->exec("insert into ad_grants (transaction_id, account_id, unit, amount, granted, created_at)
               values ('tx-1', 'a1', 'quick', 1, 1, '2026-08-15T00:00:01+00:00')");
  } catch (Throwable $e) { $threw = true; }
  ok($threw, "같은 transaction_id 가 두 번 들어갔다 — 앱 층 검사만으로는 경합에서 둘 다 통과한다");
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh wallet`
Expected: FAIL — `w_spend` 가 `merged` 를 안 내고, `ad_grants` 가 없다

- [ ] **Step 3: `w_spend` 에 가드를 넣는다**

`w_checkin` 이 하는 것과 **똑같은 자리에** 넣는다 — `begin immediate` **안**이다. 락 밖에서 보면 병합과 소비가 동시에 들어올 때 그 사이로 샌다.

```php
    // 지갑을 구글 계정에 넘긴 기기 계정은 쓸 수도 없다. checkin·refund 와 같은 규율이며,
    // 8d 부터는 우연이 아니라 필수다 — 광고 지급이 checkin 을 거치지 않고 적립하는 첫 경로라
    // 이 가드가 없으면 잔량 0 으로 얼어붙은 지갑이 광고 한 번에 되살아난다.
    // 쓰기 락 "안"에서 본다 — 병합과 소비가 동시에 들어오면 락 밖 검사는 그 사이로 샌다.
    if (w_is_merged_away($db, $acctId)) {
      $db->exec("rollback");
      return array("ok" => false, "charged" => false, "reason" => "merged");
    }
```

반환 모양은 그 파일의 기존 실패 경로와 같다 — `array("ok" => false, "charged" => false, "reason" => …)`.
**`charged` 는 불리언이다**(설계 시점 확인). 숫자로 착각해 `0` 을 넣으면 호출부가 `!==` 로 보는 곳에서 어긋난다.

- [ ] **Step 4: 스키마 v4 마이그레이션**

`w_migrate` 의 v3 블록 **뒤에** 같은 모양으로(트랜잭션 안, 재실행 가능):

```php
  if (w_schema_version($db) < 4) {
    $db->exec("begin immediate");
    try {
      // transaction_id 를 PK 로 둔다 — 구글은 콜백을 재시도하므로 중복이 정상이고,
      // 앱 층 검사만으로는 동시 재시도에서 둘 다 통과한다(8c 에서 같은 교훈을 얻었다).
      // amount 는 구글이 말한 값, granted 는 지갑 상한을 적용해 실제로 넣은 값 —
      // 둘이 다를 수 있고, 다른 이유를 나중에 설명할 수 있어야 한다.
      $db->exec("create table if not exists ad_grants (
        transaction_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, unit TEXT NOT NULL,
        amount INTEGER NOT NULL, granted INTEGER NOT NULL, created_at TEXT NOT NULL)");
      $db->exec("create index if not exists ix_ad_acct on ad_grants (account_id, created_at)");
      $db->exec("delete from schema_version");
      $db->exec("insert into schema_version (v) values (4)");
      $db->exec("commit");
    } catch (Throwable $e) {
      try { $db->exec("rollback"); } catch (Throwable $e2) {}
      throw $e;
    }
  }
```

- [ ] **Step 5: 통과 확인 + 전량 관문 + 커밋**

Run: `./tests/run.sh wallet` → PASS · `./tests/run.sh` · `dispatcher` · `concurrency`
Expected: forge-core 259 · forge-tools 81 · landing 28 무변동

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/tests/wallet.test.php
git commit -m "$(cat <<'EOF'
wallet: w_spend 병합 가드 + 스키마 v4(ad_grants)

8c 최종 리뷰가 8d 의 선행 조건으로 지목한 항목이다. checkin·refund 는
w_is_merged_away 를 보는데 w_spend 만 안 봤다. 지금까지는 병합된 계정 잔량이
0 이라 우연히 안전했는데, 광고 지급이 checkin 을 거치지 않고 적립하는 첫
경로라 그 순간 죽은 지갑이 광고 한 번에 되살아난다.

가드는 begin immediate 안에 둔다 — 락 밖에서 보면 병합과 소비가 동시에
들어올 때 그 사이로 샌다.

ad_grants 는 transaction_id 를 PK 로 둔다. 구글은 콜백을 재시도하므로 중복이
정상이고, 앱 층 검사만으로는 동시 재시도에서 둘 다 통과한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: SSV 서명 검증

**Files:**
- Modify: `map/wallet-lib.php`
- Test: `map/tests/wallet.test.php`

**Interfaces:**
- Produces:
  - `w_ssv_keys($dir, $force)` — 공개키 맵 `{key_id: pem}`. `$force` 면 캐시를 무시하고 다시 받는다
  - `w_ssv_verify($dir, $query, $params)` — `true`/`false`. `$query` 는 원본 쿼리 문자열

**이 태스크가 이 페이즈의 급소다.** SSV 콜백은 인증이 없는 것이 정상인 공개 엔드포인트다(구글이 부른다). 검증이 없거나 틀리면 **누구나 URL 에 `reward_amount` 를 붙여 잔량을 원하는 만큼 넣을 수 있다.**

- [ ] **Step 1: 테스트를 먼저 쓴다**

구글에 접속하지 않는다. 테스트 키쌍을 만들어 우리가 서명하고, 그 공개키를 픽스처로 꽂는다.

```php
// 테스트용 ECDSA(prime256v1) 키쌍을 만들고, 구글이 하는 것과 같은 방식으로 서명한다.
// 서명 대상은 쿼리 문자열에서 "&signature=" 앞까지다.
function _ssv_fixture($dir, $keyId) {
  $k = openssl_pkey_new(array("private_key_type" => OPENSSL_KEYTYPE_EC, "curve_name" => "prime256v1"));
  $pub = openssl_pkey_get_details($k)["key"];
  file_put_contents($dir . "/ssv_keys_cache.json",
    json_encode(array("keys" => array(array("keyId" => $keyId, "pem" => $pub)))));
  return $k;
}
function _ssv_sign($priv, $query) {
  openssl_sign($query, $sig, $priv, OPENSSL_ALGO_SHA256);
  return rtrim(strtr(base64_encode($sig), "+/", "-_"), "=");
}

t("올바르게 서명된 콜백은 검증을 통과한다", function ($db, $DIR) {
  $k = _ssv_fixture($DIR, "77");
  $q = "ad_network=5450213213286189855&ad_unit=123&custom_data=acct-1&reward_amount=1"
     . "&reward_item=Scoops&timestamp=" . (time() * 1000) . "&transaction_id=tx-1&user_id=acct-1";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  parse_str($full, $p);
  ok(w_ssv_verify($DIR, $full, $p), "정상 서명이 거절됐다 — 기능이 통째로 멈춘다");
});

t("서명이 틀리면 거절한다 — 이 문이 열리면 잔량이 무한이 된다", function ($db, $DIR) {
  $k = _ssv_fixture($DIR, "77");
  $q = "custom_data=acct-1&reward_amount=1&timestamp=" . (time() * 1000) . "&transaction_id=tx-2";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  // 서명은 그대로 두고 금액만 올린다 — 공격자가 실제로 할 일이다.
  $tampered = str_replace("reward_amount=1", "reward_amount=999", $full);
  parse_str($tampered, $p);
  ok(!w_ssv_verify($DIR, $tampered, $p), "금액을 바꿨는데 통과했다 — 공개 수도꼭지다");
});

t("서명 없는 콜백은 거절한다", function ($db, $DIR) {
  _ssv_fixture($DIR, "77");
  $q = "custom_data=acct-1&reward_amount=5&transaction_id=tx-3&key_id=77";
  parse_str($q, $p);
  ok(!w_ssv_verify($DIR, $q, $p), "서명 없이 통과했다");
});

t("모르는 key_id 는 거절한다", function ($db, $DIR) {
  $k = _ssv_fixture($DIR, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-4";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=99";
  parse_str($full, $p);
  ok(!w_ssv_verify($DIR, $full, $p), "등록되지 않은 키로 서명한 것이 통과했다");
});

// 서명 범위가 틀리면 두 방향으로 망가진다: 좁으면 전부 거절(기능 정지),
// 넓으면 signature 자신을 서명 대상에 넣게 되어 논리가 무너진다.
t("서명 대상은 signature 앞까지다 — 뒤 파라미터를 넣으면 깨진다", function ($db, $DIR) {
  $k = _ssv_fixture($DIR, "77");
  $q = "custom_data=acct-1&reward_amount=1&transaction_id=tx-5";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  parse_str($full, $p);
  ok(w_ssv_verify($DIR, $full, $p), "정상 케이스");
  // 뒤에 파라미터가 더 붙어도(구글이 늘릴 수 있다) 서명 대상은 그대로여야 한다
  $more = $full . "&foo=bar";
  parse_str($more, $p2);
  ok(w_ssv_verify($DIR, $more, $p2), "signature 뒤에 파라미터가 붙자 검증이 깨졌다");
});
```

- [ ] **Step 2: 실패 확인**

Run: `./tests/run.sh wallet` → FAIL (`w_ssv_verify` 없음)

- [ ] **Step 3: 구현한다**

```php
define("W_SSV_KEYS_URL", "https://www.gstatic.com/admob/reward/verifier-keys.json");
define("W_SSV_SKEW_SEC", 3600);   // 재생 공격 완화 — 1시간 밖 타임스탬프는 거절

// 공개키는 파일로 캐시한다. $force 면 다시 받는다 — 구글이 키를 교체하기 때문이다.
// 캐시 파일이 곧 테스트의 주입 지점이다(테스트는 네트워크를 타지 않는다).
function w_ssv_keys($dir, $force) {
  $f = $dir . "/ssv_keys_cache.json";
  if (!$force && is_file($f)) {
    $j = json_decode((string)file_get_contents($f), true);
    if (is_array($j) && !empty($j["keys"])) return $j;
  }
  $ch = curl_init(W_SSV_KEYS_URL);
  curl_setopt_array($ch, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10));
  $body = (string)curl_exec($ch);
  curl_close($ch);
  $j = json_decode($body, true);
  if (!is_array($j) || empty($j["keys"])) return null;
  file_put_contents($f, $body);
  return $j;
}

// 서명 대상은 쿼리 문자열에서 "&signature=" 앞까지다. 그 뒤(signature·key_id, 그리고
// 구글이 나중에 더 붙일 수 있는 것들)는 제외한다.
function w_ssv_signed_part($query) {
  $i = strpos($query, "&signature=");
  return ($i === false) ? null : substr($query, 0, $i);
}

function w_ssv_verify($dir, $query, $params) {
  $signed = w_ssv_signed_part($query);
  if ($signed === null) return false;
  if (empty($params["signature"]) || empty($params["key_id"])) return false;

  $sig = base64_decode(strtr((string)$params["signature"], "-_", "+/"));
  if ($sig === false || $sig === "") return false;

  // 실패하면 키를 새로 받아 한 번만 재시도한다. 무한 재시도로 만들면 서명 위조 시도가
  // 그대로 구글 키 서버에 대한 요청 증폭이 된다.
  for ($attempt = 0; $attempt < 2; $attempt++) {
    $j = w_ssv_keys($dir, $attempt === 1);
    if (!is_array($j)) return false;
    foreach ($j["keys"] as $k) {
      if ((string)$k["keyId"] !== (string)$params["key_id"]) continue;
      $pk = openssl_pkey_get_public($k["pem"]);
      if (!$pk) continue;
      if (openssl_verify($signed, $sig, $pk, OPENSSL_ALGO_SHA256) === 1) return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `./tests/run.sh wallet` → PASS · `./tests/run.sh`

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/tests/wallet.test.php
git commit -m "$(cat <<'EOF'
wallet: SSV 서명 검증

SSV 콜백은 인증이 없는 것이 정상인 공개 엔드포인트다 — 구글이 부른다.
그래서 서명만이 유일한 방어선이고, 검증이 없거나 범위가 틀리면 누구나 URL 에
reward_amount 를 붙여 잔량을 원하는 만큼 넣을 수 있다.

서명 대상은 쿼리 문자열의 &signature= 앞까지다. 뒤에 파라미터가 더 붙어도
(구글이 늘릴 수 있다) 대상은 그대로여야 한다 — 테스트가 그것도 본다.

키 캐시는 검증 실패 시 한 번만 다시 받는다. 무한 재시도로 만들면 서명 위조
시도가 그대로 구글 키 서버에 대한 요청 증폭이 된다.

테스트는 구글에 접속하지 않는다. 테스트 키쌍으로 서명하고 그 공개키를 캐시
파일에 꽂는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `w_ad_grant` + `wallet-ssv.php`

**Files:**
- Modify: `map/wallet-lib.php` · `map/tests/wallet-concurrency.sh`
- Create: `map/wallet-ssv.php`
- Test: `map/tests/wallet.test.php` · `map/tests/wallet-dispatcher.sh`

**Interfaces:**
- Consumes: `w_ssv_verify` (Task 2) · `ad_grants` (Task 1) · `w_is_merged_away`
- Produces: `w_ad_grant($db, $acctId, $unit, $txId, $amount) -> array("ok","granted","reason")`

- [ ] **Step 1: 테스트를 먼저 쓴다**

```php
t("정상 지급 — 원장과 캐시가 함께 오른다", function ($db, $DIR) {
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  $r = w_ad_grant($db, $a["id"], "quick", "tx-1", 1);
  eq($r["ok"], true); eq($r["granted"], 1);
  eq(w_true_balance($db, $a["id"]), 6, "5 + 1 = 6 이어야 한다");
  $after = w_get_account($db, "dev-A");
  eq((int)$after["balance"], 6, "원장 합과 캐시가 갈렸다");
});

t("같은 transaction_id 두 번 — 한 번만 적립하고 둘 다 ok", function ($db, $DIR) {
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  w_ad_grant($db, $a["id"], "quick", "tx-1", 1);
  $r2 = w_ad_grant($db, $a["id"], "quick", "tx-1", 1);
  eq($r2["ok"], true, "재시도에 실패를 주면 구글이 영원히 재시도한다");
  eq(w_true_balance($db, $a["id"]), 6, "두 번 적립됐다");
  $n = $db->query("select count(*) c from ledger where reason = 'ad'")->fetch();
  eq((int)$n["c"], 1, "원장 줄이 두 개 생겼다");
});

t("일 8회를 넘으면 적립하지 않는다", function ($db, $DIR) {
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  // 잔량 상한과 섞이지 않게 상한을 넉넉히 비워둔다
  w_spend($db, $a["id"], "scan", "t:1", null, null);
  for ($i = 1; $i <= 8; $i++) w_ad_grant($db, $a["id"], "quick", "tx-" . $i, 1);
  $r = w_ad_grant($db, $a["id"], "quick", "tx-9", 1);
  eq($r["ok"], true, "상한 초과도 ok 다 — 구글에 실패를 주면 재시도한다");
  eq($r["granted"], 0, "9회째가 적립됐다");
  eq($r["reason"], "daily-cap");
});

// w_checkin 의 "capped 여도 출석일은 소비한다"와 같은 판단이다.
t("지갑 상한에 걸리면 잘라서 넣되 일 상한은 소모한다", function ($db, $DIR) {
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  // 잔량을 19 로 만든다(상한 20)
  w_ledger_insert($db, $a["id"], 14, "test_credit", null, "t:c");
  $db->prepare("update accounts set balance = 19 where id = ?")->execute(array($a["id"]));
  $r = w_ad_grant($db, $a["id"], "full", "tx-1", 3);
  eq($r["granted"], 1, "상한까지만 넣어야 한다");
  eq($r["capped"], true);
  eq(w_true_balance($db, $a["id"]), 20);
  $g = $db->query("select amount, granted from ad_grants where transaction_id = 'tx-1'")->fetch();
  eq((int)$g["amount"], 3, "구글이 말한 값이 기록되지 않았다");
  eq((int)$g["granted"], 1, "실제로 넣은 값이 기록되지 않았다");
  // 소모 안 하면 상한에 걸린 사용자가 광고를 무한히 본다
  $n = $db->query("select count(*) c from ad_grants")->fetch();
  eq((int)$n["c"], 1, "일 상한 계산에 안 잡히면 무한 시청이 가능해진다");
});

t("병합된 계정에는 적립하지 않는다", function ($db, $DIR) {
  w_create_account($db, "dev-A", "ip");
  w_merge($db, "dev-A", "gsub-1");
  w_create_account($db, "dev-B", "ip2");
  $b = w_get_account($db, "dev-B");
  w_merge($db, "dev-B", "gsub-1");
  $r = w_ad_grant($db, $b["id"], "quick", "tx-1", 1);
  eq($r["granted"], 0, "죽은 지갑이 광고로 되살아났다");
  eq($r["reason"], "merged");
  eq(w_true_balance($db, $b["id"]), 0);
});

t("1시간 밖 타임스탬프는 거절한다 — 서명이 유효해도 오래된 콜백은 재생 공격이다", function ($db, $DIR) {
  $k = _ssv_fixture($DIR, "77");
  w_create_account($db, "dev-A", "ip");
  $a = w_get_account($db, "dev-A");
  $old = (time() - 7200) * 1000;   // 2시간 전
  $q = "custom_data=" . $a["id"] . "&reward_amount=1&transaction_id=tx-old"
     . "&timestamp=" . $old . "&ad_unit=quick";
  $full = $q . "&signature=" . _ssv_sign($k, $q) . "&key_id=77";
  // wallet-ssv.php 의 판정과 같은 식을 여기서도 본다 — 엔드포인트 검사는 디스패처가 따로 한다.
  parse_str($full, $p);
  ok(w_ssv_verify($DIR, $full, $p), "서명 자체는 유효해야 이 검사가 의미를 갖는다");
  ok(abs(time() - intdiv((int)$p["timestamp"], 1000)) > W_SSV_SKEW_SEC, "2시간 전이 허용 범위 안이다");
});

t("모르는 계정은 조용히 넘어간다", function ($db, $DIR) {
  $r = w_ad_grant($db, "no-such-account", "quick", "tx-1", 1);
  eq($r["ok"], true, "구글에 실패를 주면 재시도한다");
  eq($r["granted"], 0);
});
```

`map/tests/wallet-dispatcher.sh` 에 SSV 엔드포인트 검사를 더한다(파일의 기존 헬퍼를 그대로 쓸 것):

```bash
# 서명 없는 콜백 — 이 문이 열려 있으면 잔량이 무한이 된다
CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' \
  "$BASE/wallet-ssv.php?custom_data=$ACCT_A&reward_amount=999&transaction_id=forged-1")
BODY=$(cat "$WORK/out"); printf '%s\n' "$BODY" >> "$BODIES"
chk "서명 없는 SSV 는 200 이다(구글 재시도 방지)" "$CODE" "200"
BAL=$(dbq "select balance from accounts where id = '$ACCT_A'")
chk "서명 없는 SSV 가 잔량을 올리지 않았다" "$BAL" "5"
chk "SSV 응답 본문이 비어 있다" "$BODY" ""

# 공개 엔드포인트다 — 경로도 계정 존재 여부도 흘리면 안 된다
CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' "$BASE/wallet-ssv.php?custom_data=nobody&transaction_id=x")
chk "모르는 계정도 200 이고 본문이 없다" "$CODE" "200"
chk_no "본문에 경로가 없다" "$(cat "$WORK/out")" "$DOCROOT"
```

`map/tests/wallet-concurrency.sh` 에 동시 지급 경합을 더한다 — 파일의 기존 배리어 방식을 그대로 쓸 것:

```bash
# 같은 transaction_id 로 8개 프로세스가 동시에 지급을 시도한다.
# 앱 층 검사만으로는 둘 이상이 "없다"를 보고 각자 적립한다 — PK 가 DB 층에서 막는지 실측한다.
run_barrier 8 "w_create_account(\$db, 'dev-ad', 'ip'); @w_ad_grant(\$db, w_get_account(\$db,'dev-ad')['id'], 'quick', 'same-tx', 1);"
BAL=$(php -r "require '$LIB'; \$db = w_db('$WDIR');
              echo w_true_balance(\$db, w_get_account(\$db,'dev-ad')['id']);")
if [ "$BAL" != "6" ]; then
  echo "not ok - 동시 지급 후 잔량이 $BAL 이다 (5+1=6 이어야 한다)"; FAIL=$((FAIL+1))
else PASS=$((PASS+1)); fi
```

- [ ] **Step 2: 실패 확인**

Run: `./tests/run.sh wallet` → FAIL (`w_ad_grant` 없음) · `./tests/run.sh dispatcher` → FAIL (404)

- [ ] **Step 3: `w_ad_grant` 를 쓴다**

```php
define("W_AD_DAILY", 8);          // 계정당 하루 시청 상한
define("W_AD_COOLDOWN_SEC", 120); // 재시청 쿨다운

// 상한은 전부 서버 시각·계정 단위다. 기기 단위로 재면 8c 이후 기기를 늘려 상한을 곱할 수 있다.
function w_ad_count_today($db, $acctId) {
  $st = $db->prepare("select count(*) c from ad_grants where account_id = ? and created_at >= ?");
  $st->execute(array($acctId, w_today() . "T00:00:00+00:00"));
  $r = $st->fetch();
  return (int)$r["c"];
}

function w_ad_grant($db, $acctId, $unit, $txId, $amount) {
  $fail = function ($reason) { return array("ok" => true, "granted" => 0, "capped" => false, "reason" => $reason); };
  if (!is_string($txId) || $txId === "") return $fail("bad-request");

  try { $db->exec("begin immediate"); }
  catch (Throwable $e) { return array("ok" => false, "granted" => 0, "capped" => false, "reason" => "busy"); }

  try {
    $st = $db->prepare("select * from accounts where id = ?");
    $st->execute(array($acctId));
    $a = $st->fetch();
    // 모르는 계정도 ok 로 답한다 — 구글에 실패를 주면 영원히 재시도하고,
    // 응답으로 존재 여부를 구별해 주면 공개 엔드포인트가 계정 열거 도구가 된다.
    if (!$a) { $db->exec("commit"); return $fail("no-account"); }

    // 이미 처리한 콜백인가. 구글은 재시도하므로 중복이 정상이다.
    $st = $db->prepare("select granted from ad_grants where transaction_id = ?");
    $st->execute(array($txId));
    $prev = $st->fetch();
    if ($prev) { $db->exec("commit"); return array("ok" => true, "granted" => (int)$prev["granted"], "capped" => false, "reason" => "duplicate"); }

    // 병합돼 얼어붙은 지갑은 광고로도 되살아나지 않는다(w_spend·w_checkin 과 같은 규율).
    if (w_is_merged_away($db, $acctId)) { $db->exec("commit"); return $fail("merged"); }

    if (w_ad_count_today($db, $acctId) >= W_AD_DAILY) { $db->exec("commit"); return $fail("daily-cap"); }

    $bal = w_true_balance($db, $acctId);
    $room = W_CAP - $bal;
    if ($room < 0) $room = 0;
    $want = (int)$amount;
    if ($want < 0) $want = 0;
    $give = ($want > $room) ? $room : $want;

    if ($give > 0) {
      w_ledger_insert($db, $acctId, $give, "ad", $unit, "ad:" . $txId);
      $db->prepare("update accounts set balance = ? where id = ?")->execute(array($bal + $give, $acctId));
    }
    // 지갑 상한에 걸려 0 을 넣었어도 기록한다 — 안 그러면 상한에 걸린 사용자가 광고를
    // 무한히 본다(w_checkin 의 "capped 여도 출석일은 소비한다"와 같은 판단).
    $st = $db->prepare("insert into ad_grants (transaction_id, account_id, unit, amount, granted, created_at)
                        values (?, ?, ?, ?, ?, ?)");
    $st->execute(array($txId, $acctId, $unit, $want, $give, w_now()));

    $db->exec("commit");
    return array("ok" => true, "granted" => $give, "capped" => ($give < $want), "reason" => null);
  } catch (Throwable $e) {
    try { $db->exec("rollback"); } catch (Throwable $e2) {}
    // PK 충돌(동시 같은 transaction_id)의 패자 — 이긴 쪽이 이미 적립했다.
    $st = $db->prepare("select granted from ad_grants where transaction_id = ?");
    $st->execute(array($txId));
    $prev = $st->fetch();
    if ($prev) return array("ok" => true, "granted" => (int)$prev["granted"], "capped" => false, "reason" => "duplicate");
    return array("ok" => false, "granted" => 0, "capped" => false, "reason" => "error");
  }
}
```

- [ ] **Step 4: `wallet-ssv.php` 를 쓴다**

```php
<?php
// AdMob SSV 콜백. 구글이 부르는 공개 GET 이다 — 인증이 없는 것이 정상이고,
// 그래서 서명만이 유일한 방어선이다. 검증이 없으면 누구나 이 URL 에 reward_amount 를
// 붙여 잔량을 원하는 만큼 넣을 수 있다.
//
// 응답은 항상 빈 200 이다. 실패를 주면 구글이 영원히 재시도하고, 본문에 무언가 적으면
// 공개·무인증 엔드포인트가 정보 유출 창구가 된다(경로·잔량·계정 존재 여부 전부).
ini_set("display_errors", "0");
require __DIR__ . "/wallet-lib.php";

$W_DIR = dirname(dirname(__DIR__)) . "/data";

function ssv_done() { http_response_code(200); header("Content-Type: text/plain"); echo ""; exit; }

$query = isset($_SERVER["QUERY_STRING"]) ? (string)$_SERVER["QUERY_STRING"] : "";
$p = $_GET;

if (!w_ssv_verify($W_DIR, $query, $p)) ssv_done();

// 타임스탬프는 밀리초다. 1시간 밖이면 거절 — 서명이 유효해도 오래된 콜백은 재생 공격이다.
$ts = isset($p["timestamp"]) ? (int)$p["timestamp"] : 0;
if (abs(time() - intdiv($ts, 1000)) > W_SSV_SKEW_SEC) ssv_done();

$acctId = isset($p["custom_data"]) ? (string)$p["custom_data"] : "";
$txId   = isset($p["transaction_id"]) ? (string)$p["transaction_id"] : "";
$unit   = isset($p["ad_unit"]) ? (string)$p["ad_unit"] : "";
$amount = isset($p["reward_amount"]) ? (int)$p["reward_amount"] : 0;
if ($acctId === "" || $txId === "") ssv_done();

try { $db = w_db($W_DIR); w_ad_grant($db, $acctId, $unit, $txId, $amount); }
catch (Throwable $e) { /* 조용히 삼킨다 — 본문에 아무것도 흘리지 않는다 */ }
ssv_done();
```

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `./tests/run.sh wallet` · `dispatcher` · `concurrency` · `./tests/run.sh` → 전부 통과

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/wallet-ssv.php map/tests/wallet.test.php \
        map/tests/wallet-dispatcher.sh map/tests/wallet-concurrency.sh
git commit -m "$(cat <<'EOF'
wallet: 광고 지급 + SSV 콜백 엔드포인트

응답은 항상 빈 200 이다. 실패를 주면 구글이 영원히 재시도하고, 본문에 무언가
적으면 공개·무인증 엔드포인트가 정보 유출 창구가 된다 — 모르는 계정도 200 으로
답하는 이유가 그것이다(구별해 주면 계정 열거 도구가 된다).

지갑 상한에 걸려 0 을 넣었어도 ad_grants 에 기록한다. 안 하면 상한에 걸린
사용자가 광고를 무한히 본다 — w_checkin 의 "capped 여도 출석일은 소비한다"와
같은 판단이다.

동시 같은 transaction_id 는 PK 가 DB 층에서 막고, 패자는 이긴 쪽이 적립한
값을 돌려준다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `adConfig` · `adState` op + 무중단 스위치

**Files:**
- Modify: `map/wallet-lib.php` · `map/wallet-api.php` · `map/mobile/www/wallet-http.js` · `wallet.js`
- Test: `map/tests/wallet-dispatcher.sh` · `map/mobile/test/wallet-http.test.mjs`

**Interfaces:**
- Produces:
  - op `adConfig` → `{ok:true, quick:{unitId,reward}, full:{unitId,reward}}` · `{ok:false, reason:"ads-disabled"}`
  - op `adState` → `{ok:true, remaining, nextAt}`
  - `MSWallet.adConfig()` · `MSWallet.adState()`

- [ ] **Step 1: 테스트를 먼저 쓴다**

디스패처에:

```bash
post '{"op":"adConfig"}' "$TOK_A"
chk "설정 없으면 adConfig 는 ads-disabled 다" "$(jget "$BODY" reason)" "ads-disabled"
chk "그래도 200 이다 — 광고 없음은 오류가 아니다" "$CODE" "200"

CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' -X POST -H "Content-Type: application/json" \
            --data '{"op":"adConfig"}' "$BASE/wallet-api.php")
chk "토큰 없는 adConfig 는 401 이다" "$CODE" "401"

# 설정 파일을 꽂으면 유닛 ID 가 나온다
cat > "$DOCROOT/../../data/ad_units.json" <<'JSON'
{"quick":{"unitId":"ca-app-pub-3940256099942544/5354046379","reward":1},
 "full":{"unitId":"ca-app-pub-3940256099942544/5224354917","reward":3}}
JSON
post '{"op":"adConfig"}' "$TOK_A"
chk "설정이 있으면 ok 다" "$(jget "$BODY" ok)" "true"
chk_has "quick 유닛 ID 가 나온다" "$BODY" "5354046379"

post '{"op":"adState"}' "$TOK_A"
chk "adState 가 남은 횟수를 준다" "$(jget "$BODY" remaining)" "8"
rm -f "$DOCROOT/../../data/ad_units.json"
```

- [ ] **Step 2: 실패 확인**

Run: `./tests/run.sh dispatcher` → FAIL (`bad-op`)

- [ ] **Step 3: 서버에 넣는다**

`wallet-lib.php`:

```php
// 실 광고 유닛 ID 는 저장소에 없다 — 넣으면 남이 우리 계정으로 광고를 띄운다.
// 파일이 없으면 광고 기능 전체가 조용히 꺼진다(8c 의 forge_google_oauth.json 과 같은
// 무중단 스위치). 개발은 구글 공개 테스트 유닛 ID 로 한다.
function w_ad_units($dir) {
  $f = $dir . "/ad_units.json";
  if (!is_file($f)) return null;
  $j = json_decode((string)file_get_contents($f), true);
  if (!is_array($j) || empty($j["quick"]["unitId"]) || empty($j["full"]["unitId"])) return null;
  return $j;
}

// 다음 시청 가능 시각(쿨다운). 마지막 지급 시각 + 2분.
function w_ad_next_at($db, $acctId) {
  $st = $db->prepare("select created_at from ad_grants where account_id = ? order by created_at desc limit 1");
  $st->execute(array($acctId));
  $r = $st->fetch();
  if (!$r) return null;
  return gmdate("c", strtotime($r["created_at"]) + W_AD_COOLDOWN_SEC);
}
```

`wallet-api.php` 의 인증 블록 뒤에:

```php
} elseif ($op === "adConfig") {
  $u = w_ad_units($W_DIR);
  if (!$u) w_out(array("ok" => false, "reason" => "ads-disabled"));
  w_out(array("ok" => true, "quick" => $u["quick"], "full" => $u["full"]));
} elseif ($op === "adState") {
  $left = W_AD_DAILY - w_ad_count_today($db, $acct["id"]);
  if ($left < 0) $left = 0;
  w_out(array("ok" => true, "remaining" => $left, "nextAt" => w_ad_next_at($db, $acct["id"])));
}
```

- [ ] **Step 4: 클라이언트 파사드**

`wallet-http.js` 에 `call` 을 쓰는 두 함수를 더하고(계정/기기 토큰 선택은 `call` 이 이미 한다), `wallet.js` 파사드는 **반드시 `callBackend` 를 거친다** — 8c 리뷰가 지적한 불변식이다(백엔드가 동기적으로 던져도 호출부는 늘 Promise 를 받아야 한다).

```js
    function adConfig() {
      return call({ op: "adConfig" }).then(function (r) {
        if (!r || !r.json) return { ok: false, reason: "network" };
        return r.json.ok ? { ok: true, quick: r.json.quick, full: r.json.full }
                         : { ok: false, reason: r.json.reason || "ads-disabled" };
      });
    }
    function adState() {
      return call({ op: "adState" }).then(function (r) {
        if (!r || !r.json || !r.json.ok) return { ok: false, remaining: 0, nextAt: null };
        return { ok: true, remaining: r.json.remaining, nextAt: r.json.nextAt };
      });
    }
```

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `./tests/run.sh dispatcher` · `./tests/run.sh` → 통과

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/wallet-lib.php map/wallet-api.php map/mobile/www/wallet-http.js \
        map/mobile/www/wallet.js map/tests/wallet-dispatcher.sh map/mobile/test/wallet-http.test.mjs
git commit -m "$(cat <<'EOF'
wallet: adConfig/adState + 광고 무중단 스위치

실 광고 유닛 ID 는 저장소에 없다 — 넣으면 남이 우리 계정으로 광고를 띄운다.
파일이 없으면 adConfig 가 ads-disabled 를 200 으로 돌려주고 화면이 광고 줄을
숨긴다(8c 의 forge_google_oauth.json 과 같은 방식).

파사드는 callBackend 를 거친다 — 8c 리뷰가 지적한 불변식이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 네이티브 — 플러그인 · 매니페스트 · 빌드

**Files:**
- Modify: `map/mobile/package.json` · `map/mobile/android/app/src/main/AndroidManifest.xml` · `map/mobile/docs/ANDROID-BUILD.md`
- Create: `map/mobile/www/ads.js`
- Test: `map/mobile/test/ads.test.mjs`

**Interfaces:**
- Produces: `MSAds.available()` · `MSAds.init(cfg)` · `MSAds.show(unit) -> Promise<{shown, reason}>` · `MSAds.consentNeeded()` · `MSAds.showConsent()`

**이 태스크가 유일하게 빌드를 깨뜨릴 수 있다.** 이 저장소의 첫 네이티브 의존성이다.

- [ ] **Step 1: 플러그인을 고정 버전으로 넣는다**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile
npm install --save-exact @capacitor-community/admob@8.1.0
```

**캐럿 없이 정확한 버전으로** 박는다(`--save-exact`) — 자동 올림이 빌드를 흔드는 것이 이 자리에서 가장 비싼 사고다.

- [ ] **Step 2: 매니페스트에 테스트 앱 ID**

`android/app/src/main/AndroidManifest.xml` 의 `<application>` 안에:

```xml
        <!-- 구글 공개 테스트 앱 ID. 실 ID 는 배포 시 교체한다 —
             저장소에 실 ID 를 넣으면 남이 우리 계정으로 광고를 띄운다. -->
        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="ca-app-pub-3940256099942544~3347511713"/>
```

- [ ] **Step 3: 빌드가 되는지 먼저 확인한다**

코드를 더 쓰기 전에 빌드부터 통과시킨다 — 여기서 깨지면 나머지가 무의미하다.

```bash
export JAVA_HOME=$(echo ~/tools/jdk-21*) ANDROID_HOME=~/tools/android-sdk ANDROID_SDK_ROOT=~/tools/android-sdk
export PATH="$JAVA_HOME/bin:$PATH"
cd /home/jschoi0223/projects/vdiportal/map/mobile && npm run cap:sync
cd android && ./gradlew assembleDebug --no-daemon
```

Expected: `app-debug.apk` 가 나온다. **실패하면 즉시 보고할 것** — minSdk 충돌이나 Gradle 플러그인 버전 문제일 수 있고, 계획서가 예상하지 못한 지점이다.

- [ ] **Step 4: `ads.js` 파사드**

플러그인을 화면이 직접 부르면 브라우저에서 화면을 테스트할 수 없다. 파사드가 그 경계다.

```js
// 광고 파사드. 화면은 플러그인을 직접 부르지 않는다 — 부르면 브라우저에서 화면을
// 테스트할 수 없고(플러그인이 없다), 나중에 플러그인을 바꿀 때 화면까지 흔들린다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSAds = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var plugin = null, cfg = null;

  // Capacitor 플러그인은 네이티브에서만 존재한다. 브라우저·테스트에서는 없다.
  function detect() {
    if (plugin) return plugin;
    var C = (typeof window !== "undefined") ? window.Capacitor : null;
    if (C && C.Plugins && C.Plugins.AdMob) plugin = C.Plugins.AdMob;
    return plugin;
  }
  function available() { return !!detect() && !!cfg; }
  function install(p) { plugin = p; }          // 테스트 주입 지점
  function init(c) { cfg = c; var p = detect(); return p ? p.initialize({}) : Promise.resolve(); }

  // 광고를 끝까지 봤는지는 여기서 판정하지 않는다 — 그건 서버가 SSV 로 안다.
  // 이 함수는 "띄웠고 사용자가 닫았다"까지만 말한다.
  function show(unit) {
    var p = detect();
    if (!p || !cfg || !cfg[unit]) return Promise.resolve({ shown: false, reason: "unavailable" });
    return p.prepareRewardVideoAd({ adId: cfg[unit].unitId })
      .then(function () { return p.showRewardVideoAd(); })
      .then(function () { return { shown: true, reason: "" }; })
      ["catch"](function () { return { shown: false, reason: "failed" }; });
  }

  // UMP — EEA·영국·캐나다는 개인화 광고 동의 없이는 이 기능 자체를 출시할 수 없다.
  // 대상 지역이 아니면 requestConsentInfo 가 "필요 없음"을 돌려주고 아무것도 안 뜬다.
  // 광고를 처음 요청하기 "전에" 불러야 한다 — 뒤에 부르면 이미 동의 없이 광고를 띄운 것이 된다.
  function consentNeeded() {
    var p = detect();
    if (!p) return Promise.resolve(false);
    return p.requestConsentInfo()
      .then(function (info) { return !!info && info.isConsentFormAvailable === true; })
      ["catch"](function () { return false; });   // 실패는 "필요 없음"으로 — 광고를 막지 않는다
  }
  function showConsent() {
    var p = detect();
    if (!p) return Promise.resolve(false);
    return p.showConsentForm().then(function () { return true; })["catch"](function () { return false; });
  }

  return { available: available, install: install, init: init, show: show,
           consentNeeded: consentNeeded, showConsent: showConsent };
});
```

메서드 이름은 설계 시점에 8.1.0 패키지의 타입 정의에서 확인했다 — 리워드는 `prepareRewardVideoAd` ·
`showRewardVideoAd`, 동의는 `requestConsentInfo` · `showConsentForm` · `resetConsentInfo` 다.
설치 후 `node_modules/@capacitor-community/admob/dist/esm/` 에서 한 번 더 대조하고, 다르면 그 이름을
쓰고 보고에 적는다(버전이 바뀌었다는 뜻이므로 그 자체가 보고 대상이다).

`index.html` 에 `<script src="ads.js"></script>` 를 `wallet-http.js` 뒤, `app.js` 앞에 넣고, 스크립트 순서 테스트에 더한다.

- [ ] **Step 5: 광고 요청 전에 UMP 를 먼저 부른다**

`init(cfg)` 안에서 `initialize` 뒤·첫 광고 요청 전에 `requestConsentInfo` 를 부른다. **순서가 규정이다** —
광고를 띄운 뒤에 동의를 물으면 이미 동의 없이 띄운 것이 되고, 그것이 EEA·영국·캐나다에서 이 기능을
출시할 수 없게 만드는 사유다. 대상 지역이 아니면(한국 포함) 아무것도 뜨지 않는다.

테스트(`map/mobile/test/ads.test.mjs`)는 가짜 플러그인을 `install()` 로 꽂아 호출 순서를 본다:

```js
test("동의 확인이 첫 광고 요청보다 먼저다", async () => {
  const seen = [];
  MSAds.install({
    initialize: () => { seen.push("init"); return Promise.resolve(); },
    requestConsentInfo: () => { seen.push("consent"); return Promise.resolve({ isConsentFormAvailable: false }); },
    prepareRewardVideoAd: () => { seen.push("prepare"); return Promise.resolve(); },
    showRewardVideoAd: () => Promise.resolve()
  });
  await MSAds.init({ quick: { unitId: "q", reward: 1 } });
  await MSAds.show("quick");
  // 광고를 띄운 뒤 동의를 물으면 이미 동의 없이 띄운 것이다 — 정책 위반이다.
  assert.ok(seen.indexOf("consent") < seen.indexOf("prepare"), "동의 확인이 광고 요청보다 늦다: " + seen.join(","));
});

test("동의 폼이 실패해도 광고를 막지 않는다", async () => {
  MSAds.install({
    initialize: () => Promise.resolve(),
    requestConsentInfo: () => Promise.reject(new Error("no network")),
    prepareRewardVideoAd: () => Promise.resolve(),
    showRewardVideoAd: () => Promise.resolve()
  });
  await MSAds.init({ quick: { unitId: "q", reward: 1 } });
  const r = await MSAds.show("quick");
  assert.strictEqual(r.shown, true, "동의 조회 실패가 광고를 막았다 — 대상 지역이 아닌 사용자까지 막힌다");
});
```

- [ ] **Step 6: `ANDROID-BUILD.md` 갱신 + 커밋**

플러그인이 추가되면 `npm install` 이 선행이라는 것과, `cap:sync` 가 Gradle 의존성까지 갱신한다는 것을 적는다.

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/package.json map/mobile/package-lock.json map/mobile/www/ads.js \
        map/mobile/www/index.html map/mobile/test/ads.test.mjs \
        map/mobile/android/app/src/main/AndroidManifest.xml map/mobile/docs/ANDROID-BUILD.md
git commit -m "$(cat <<'EOF'
mobile: AdMob 플러그인 + 광고 파사드

이 저장소의 첫 네이티브 의존성이라 캐럿 없이 정확한 버전으로 박는다 —
자동 올림이 빌드를 흔드는 것이 이 자리에서 가장 비싼 사고다.

매니페스트에는 구글 공개 테스트 앱 ID 를 넣는다. 실 ID 를 저장소에 넣으면
남이 우리 계정으로 광고를 띄운다.

화면은 플러그인을 직접 부르지 않는다 — 부르면 브라우저에서 화면을 테스트할
수 없고(플러그인이 없다) 플러그인을 바꿀 때 화면까지 흔들린다. 파사드가
그 경계이며 "광고를 끝까지 봤는가"는 판정하지 않는다. 그건 서버가 SSV 로 안다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 화면 — 광고 두 줄 · 잔량 부족 권유 · 고지

**Files:**
- Modify: `map/mobile/www/screens/wallet.js` · `screens/report.js` · `strings.js` · `style.css` · `map/mobile/docs/BACKLOG-mobile.md`
- Test: `map/mobile/test/wallet-screens.test.mjs`

**Interfaces:**
- Consumes: `MSWallet.adConfig()` · `adState()` · `get()` · `MSAds.available()` · `show(unit)`

- [ ] **Step 1: 테스트를 먼저 쓴다**

이 파일의 `withWalletDom` 하네스와 `MSWallet` 주입 방식을 먼저 읽고 그대로 쓸 것. `MSAds` 도 같은 방식으로 가짜를 꽂는다.

```js
test("ads-disabled 면 광고 줄이 아예 없다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: false, reason: "ads-disabled" });
    MSWalletScreen.render(root);
    await flush();
    assert.ok(!findText(root, S.t.adQuick), "눌러도 아무 일 없는 광고 줄이 남아 있다");
  });
});

test("일 상한을 다 쓰면 줄을 숨기지 않고 문구를 바꾼다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 0, nextAt: null });
    MSWalletScreen.render(root);
    await flush();
    // 사라지면 사용자는 앱이 고장난 줄 안다(온보딩 auth-disabled 와 같은 판단)
    assert.ok(findText(root, S.t.adDailyDone), "상한 안내가 없다");
  });
});

test("광고를 본 뒤 잔량이 오를 때까지 기다린다 — 줄어드는 순간을 만들지 않는다", async () => {
  await withWalletDom(async (root, W, A) => {
    const seen = [];
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    W.get = () => { seen.push("get"); return Promise.resolve({ ok: true, state: { balance: 6 } }); };
    A.show = () => Promise.resolve({ shown: true, reason: "" });
    MSWalletScreen.render(root);
    await flush();
    findText(root, S.t.adQuick).click();
    await flush();
    assert.ok(seen.length >= 1, "광고 후 서버에 다시 묻지 않았다");
    // 낙관적으로 +1 을 그려놓고 나중에 내리면 "준 걸 뺏겼다"가 된다
    assert.ok(!findText(root, S.t.walBalance.replace("{n}", "7")), "서버가 주지도 않은 값을 그렸다");
  });
});

test("SSV 가 안 오면 조용히 실패하지 않고 말한다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    W.get = () => Promise.resolve({ ok: true, state: { balance: 5 } });   // 안 오른다
    A.show = () => Promise.resolve({ shown: true, reason: "" });
    MSWalletScreen.render(root);
    await flush();
    findText(root, S.t.adQuick).click();
    await flushPolling();
    assert.ok(findText(root, S.t.adPending), "잔량이 안 올랐는데 아무 말도 안 한다");
  });
});

test("현금 가치 없음 고지가 지갑 화면에 있다", () => {
  withWalletDom((root, W, A) => {
    MSWalletScreen.render(root);
    // 리워드 화폐에 요구되는 문구다 — 스토어 심사가 본다(SPEC §6)
    assert.ok(findText(root, S.t.walNoCashValue), "고지가 없다");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/wallet-screens.test.mjs` → FAIL

- [ ] **Step 3: 화면에 넣는다**

`strings.js`:

```js
    adQuick: "Watch a short ad  +1",
    adFull: "Watch a full ad  +3",
    adDailyDone: "That is all the ads for today.",
    adCooldown: "Next ad in {m}",
    adWaiting: "Crediting your Scoops…",
    adPending: "It did not arrive yet. It will show up shortly.",
    adSettings: "Ad settings",
    adLowBalance: "Not enough Scoops. Watch an ad to keep going.",
    walNoCashValue: "Scoops have no cash value and cannot be transferred or refunded.",
```

`screens/wallet.js` — 광고 두 줄은 `adConfig` 가 `ok` 일 때만 그린다. `remaining === 0` 이면 두 줄 대신 `adDailyDone`. 쿨다운 중이면 `adCooldown`.

광고 종료 후 폴링은 **Task 6 의 핵심**이다. 8c 의 `authPoll` 과 같은 규율로 쓴다 — 세대 가드(`GEN`)로 재렌더 시 고아 루프를 죽이고, 진행 중 플래그로 연타를 막는다:

```js
  var AD_POLL_MS = 2000, AD_POLL_LIMIT = 5;   // 2초 × 5 = 10초

  // 낙관적으로 +1 을 그리지 않는다. SSV 가 안 오면 도로 내려야 하고 그건 "준 걸 뺏겼다"로
  // 읽힌다(8b: 클라이언트는 잔량을 계산하지 않는다). 잔량이 줄어드는 순간을 만들지 않는다.
  function afterAd(before, n, msg, myGen) {
    if (myGen !== GEN) return;
    if (n >= AD_POLL_LIMIT) { msg.textContent = MSStr.t.adPending; return; }
    MSWallet.get().then(function (r) {
      if (myGen !== GEN) return;
      if (r.ok && r.state && r.state.balance > before) { draw(r.state, ""); return; }
      setTimeout(function () { afterAd(before, n + 1, msg, myGen); }, AD_POLL_MS);
    });
  }
```

`screens/report.js` — Full 을 누르려는데 잔량이 부족하면 `adLowBalance` 와 함께 광고 버튼을 그 자리에 띄운다. **광고 후 잔량이 차면 원래 하려던 분석으로 이어진다** — 지갑 화면으로 튕기지 않는다.

**UMP 재열람 행** — 설계서가 `SPEC §6` 을 근거로 요구한 항목이다(설정 화면이 없어 지갑 화면에 둔다).
`MSAds.consentNeeded()` 가 참일 때만 '광고 설정' 행을 그리고, 누르면 `MSAds.showConsent()`.
대상 지역이 아니면(한국 포함) **행 자체를 숨긴다** — 눌러도 아무 일 없는 행을 남기지 않는다
(8c 의 `auth-disabled` 와 같은 판단).

```js
test("동의가 필요 없는 지역에선 광고 설정 행이 없다", async () => {
  await withWalletDom(async (root, W, A) => {
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    A.consentNeeded = () => Promise.resolve(false);
    MSWalletScreen.render(root);
    await flush();
    assert.ok(!findText(root, S.t.adSettings), "누를 것이 없는 행이 남아 있다");
  });
});

test("동의가 필요한 지역에선 광고 설정 행이 뜨고 폼을 연다", async () => {
  await withWalletDom(async (root, W, A) => {
    let opened = 0;
    W.adConfig = () => Promise.resolve({ ok: true, quick: { unitId: "q", reward: 1 }, full: { unitId: "f", reward: 3 } });
    W.adState = () => Promise.resolve({ ok: true, remaining: 8, nextAt: null });
    A.consentNeeded = () => Promise.resolve(true);
    A.showConsent = () => { opened++; return Promise.resolve(true); };
    MSWalletScreen.render(root);
    await flush();
    const row = findText(root, S.t.adSettings);
    assert.ok(row, "동의 재열람 경로가 없다 — EEA·영국·캐나다 정책 위반이다");
    row.click();
    await flush();
    assert.strictEqual(opened, 1);
  });
});
```

`walNoCashValue` 는 지갑 화면 하단에 **상시** 표기한다.

- [ ] **Step 4: 백로그 갱신 + 전량 관문 + 커밋**

`BACKLOG-mobile.md` 의 ✅ 완료에 8d 를 적고(무엇을 왜 그렇게 했는지 — 특히 낙관적 반영을 안 쓴 이유), 🔥 다음에서 8d 를 지운다. 📋 예정에 남는 것: 슬롯 과금 · 비답변 무과금 · Custom 티어(엔진 선행) · 실 AdMob 계정 연결 · 릴리스 서명.

Run: `./tests/run.sh` · `dispatcher` · `concurrency` → 전량 통과

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/screens/wallet.js map/mobile/www/screens/report.js \
        map/mobile/www/strings.js map/mobile/www/style.css \
        map/mobile/test/wallet-screens.test.mjs map/mobile/docs/BACKLOG-mobile.md
git commit -m "$(cat <<'EOF'
mobile: 광고 줄 + 잔량 부족 권유 + 현금가치 고지

낙관적으로 +1 을 그리지 않는다. SSV 가 안 오면 도로 내려야 하고 그건 "준 걸
뺏겼다"로 읽힌다 — 잔량이 줄어드는 순간을 아예 만들지 않고 "적립하는 중…" 으로
기다린다. 8b 의 "클라이언트는 잔량을 계산하지 않는다"와도 이쪽이 일관된다.

일 상한을 다 써도 줄을 숨기지 않고 문구를 바꾼다. 사라지면 사용자는 앱이
고장난 줄 안다(온보딩 auth-disabled 에서 같은 판단을 했다).

폴링은 8c 의 authPoll 과 같은 규율이다 — 세대 가드로 재렌더 시 고아 루프를
죽이고 진행 중 플래그로 연타를 막는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 완료 조건

- `./tests/run.sh` 통과, **forge-core 259 · forge-tools 81 · landing 28 무변동**
- `./tests/run.sh concurrency` — 같은 `transaction_id` 동시 8중에서 잔량이 정확히 +1
- `./tests/run.sh dispatcher` — 서명 없는 SSV 가 잔량을 못 올리고, 본문이 비어 있다
- 모든 계정에서 `SUM(ledger.delta) == accounts.balance`
- `ad_units.json` 없이 전 과정이 돌고, 그 상태에서 광고 줄이 안 보인다
- `git diff main -- map/forge-core.js map/forge-tools.js map/forge-api.php map/forge-auth.php` 가 비어 있다
- `assembleDebug` 로 APK 가 나오고 번들 자산에 `ads.js` 가 들어 있다
- 저장소 어디에도 실 AdMob 유닛 ID·앱 ID 가 없다(테스트 ID 만)
