# OHLC 증분 전송 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스쿱포지 클라이언트가 종목 캔들을 매번 전량(AAPL 394KB) 내려받는 대신, 세션 캐시 + `?since=` 델타(~242B) + gzip으로 받도록 전환한다.

**Architecture:** 서버(`forge-api.php`)의 OHLC 프록시는 이미 누적 캐시 파일에 증분 저장한다. 여기에 **응답 필터** `?since=`와 `full` 플래그를 더해 델타만 내보낼 수 있게 하고, 클라(`forge-app.js`)의 유일한 관문 함수 `fetchOHLC`에 세션 캐시를 넣어 7개 호출 지점이 한 번에 혜택을 받게 한다. 캔들 머지 규칙은 순수 함수로 `forge-core.js`에 두어 단위테스트로 고정한다.

**Tech Stack:** 순수 PHP 8.4(빌드 도구 없음) · 바닐라 JS(classic script, 전역 스코프 공유) · `node --test`(forge-core 전용 하네스) · cafe24 SFTP 배포

## Global Constraints

- **`since`는 응답 필터일 뿐이다. 캐시 파일에는 항상 전량을 저장한다.** 잘라서 저장하면 20년치 누적본이 델타 요청 한 번에 소실된다.
- **`since` 비교는 `>=`** — `>`로 하면 진행 중인 오늘 봉의 종가 갱신을 영원히 못 받는다. 따라서 머지는 "같은 t는 교체, 새 t는 추가".
- **`fetchOHLC` 반환 shape 불변** — 호출자 7곳이 `r.ok`·`r.candles`·`r.name`·`r.tf`를 읽는다. 캐시 히트든 델타 머지든 **항상 누적 전량이 담긴 `candles`**를 반환한다. 델타는 함수 내부에서만 다룬다.
- **`full` 판정은 `r.full !== false`로 replace** — 필드가 없는 구버전 서버 응답(`undefined`)도 안전하게 전량 교체로 떨어진다. 서버·클라 배포 순서에 무관하게 동작해야 한다.
- **배포 불가침**: `forge_ohlc_cache_*.json` · `forge_data.json` · `forge_images.json` · `forge_jobs.json` · `forge_td_key.txt` — 절대 업로드 금지(서버 생성·사용자 데이터).
- `forge-core.js`는 DOM-free UMD 유지. `require`/`window` 외 전역 접근 금지.
- 로컬 PHP 실행 환경 없음 → PHP 변경 검증은 **cafe24 라이브 curl**.
- 라이브 검증에서 쓰기 함수(`loadTicker`·`_addTickerDoc`) 호출 금지 — 사용자 실데이터가 손상된다. 읽기 경로만 사용.
- 색상 하드코딩 금지(이 계획엔 UI 변경 없음, 해당사항 없음).
- 커밋 메시지는 한국어, 말미에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `forge-core.js` | 수정 (`:2725` return + 함수 추가) | `mergeCandles(prev, delta)` 순수 머지 규칙 — 서버·클라 공통 규칙의 단일 출처 |
| `forge-core.test.js` | 수정 (파일 끝 추가) | 머지 규칙 단위테스트 |
| `forge-api.php` | 수정 (`:1` 상단, `:58~176` ohlc 블록) | gzip 출력 버퍼 · `since` 응답 필터 · `full` 플래그 |
| `forge-app.js` | 수정 (`:1635~1639`, `:1854~1859`, `:1993`) | `fetchOHLC` 세션 캐시 관문 · `force` 옵션 · `_dashCache` 제거 |
| `docs/BACKLOG.md` | 수정 | 완료 기록 |

Task 1이 Task 4의 의존이고, Task 2·3은 서로 독립이며 Task 4와도 배포 순서 무관(위 Global Constraints의 `full !== false` 규칙 덕분)이다.

---

### Task 1: `ForgeCore.mergeCandles` — 머지 규칙 단일 출처

**Files:**
- Modify: `forge-core.js:2715-2725` (마지막 함수 뒤 · return 문에 이름 추가)
- Test: `forge-core.test.js` (파일 끝에 추가)

**Interfaces:**
- Consumes: 없음 (순수 함수, 의존 없음)
- Produces: `ForgeCore.mergeCandles(prev, delta)` → `Array<{t,o,h,l,c,v}>`
  - `prev`: 기존 누적 캔들 배열 (t 오름차순 가정하지 않음)
  - `delta`: 새로 받은 캔들 배열
  - 반환: **새 배열**. t 문자열 오름차순 정렬. 같은 `t`는 `delta` 쪽으로 교체. `t`가 없거나 문자열화 불가한 항목은 버림. `prev`/`delta` 원본은 변형하지 않음.
  - Task 4의 `fetchOHLC`가 사용한다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`forge-core.test.js` 파일 끝에 추가:

```js
test("mergeCandles: 델타가 비면 prev를 그대로(복사본) 돌려준다", () => {
  const prev = [{ t: "2026-08-01", o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }];
  const out = ForgeCore.mergeCandles(prev, []);
  assert.deepStrictEqual(out, prev);
  assert.notStrictEqual(out, prev, "새 배열이어야 한다(원본 공유 금지)");
});

test("mergeCandles: 같은 t는 델타로 교체(진행 중 봉 갱신)", () => {
  const prev = [
    { t: "2026-08-01", o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
    { t: "2026-08-04", o: 2, h: 3, l: 1.5, c: 2.5, v: 20 },
  ];
  const delta = [{ t: "2026-08-04", o: 2, h: 9, l: 1.5, c: 8.8, v: 99 }];
  const out = ForgeCore.mergeCandles(prev, delta);
  assert.strictEqual(out.length, 2, "교체이지 추가가 아니다");
  assert.strictEqual(out[1].c, 8.8);
  assert.strictEqual(out[1].v, 99);
  assert.strictEqual(prev[1].c, 2.5, "원본 prev는 불변");
});

test("mergeCandles: 새 t는 추가되고 t 오름차순으로 정렬된다", () => {
  const prev = [{ t: "2026-08-04", o: 2, h: 3, l: 1.5, c: 2.5, v: 20 }];
  const delta = [
    { t: "2026-08-06", o: 3, h: 4, l: 2.5, c: 3.5, v: 30 },
    { t: "2026-08-05", o: 2.5, h: 3.5, l: 2, c: 3, v: 25 },
  ];
  const out = ForgeCore.mergeCandles(prev, delta);
  assert.deepStrictEqual(out.map(c => c.t), ["2026-08-04", "2026-08-05", "2026-08-06"]);
});

test("mergeCandles: prev가 비면 델타가 그대로(정렬되어) 나온다", () => {
  const delta = [
    { t: "2026-08-05", o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
    { t: "2026-08-04", o: 1, h: 2, l: 0.5, c: 1.4, v: 11 },
  ];
  const out = ForgeCore.mergeCandles([], delta);
  assert.deepStrictEqual(out.map(c => c.t), ["2026-08-04", "2026-08-05"]);
});

test("mergeCandles: t 없는 항목은 버리고, 인자가 배열이 아니면 빈 배열로 취급", () => {
  const prev = [{ t: "2026-08-01", c: 1 }, { o: 1, c: 2 }];
  const out = ForgeCore.mergeCandles(prev, null);
  assert.deepStrictEqual(out.map(c => c.t), ["2026-08-01"]);
  assert.deepStrictEqual(ForgeCore.mergeCandles(null, null), []);
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test forge-core.test.js 2>&1 | tail -20`
Expected: FAIL — `TypeError: ForgeCore.mergeCandles is not a function` (5건 실패, 기존 246건은 통과)

- [ ] **Step 3: 최소 구현을 작성한다**

`forge-core.js`의 `forecastTrendPersist` 함수 끝(`:2723` `}` 다음, `return {` 앞)에 삽입:

```js
  // OHLC 누적 머지 — 서버(forge-api.php ?since=)와 클라(fetchOHLC)가 공유하는 단일 규칙.
  // 같은 t는 delta로 교체(진행 중 봉의 종가 갱신), 새 t는 추가, t 오름차순 정렬.
  // 서버 필터가 `>=`라 마지막 봉이 항상 되돌아오므로 '교체'가 정상 경로다.
  function mergeCandles(prev, delta) {
    const map = new Map();
    const put = arr => { if (!Array.isArray(arr)) return;
      for (const c of arr) { if (!c || c.t == null || c.t === "") continue; map.set(String(c.t), c); } };
    put(prev); put(delta);   // delta가 뒤 → 같은 키를 덮어씀
    return Array.from(map.keys()).sort().map(k => map.get(k));
  }
```

같은 파일 `:2725`의 `return { version, indicatorCount, ...` 목록에서 `makeDemoSeries` 바로 앞에 `mergeCandles, `를 추가한다.

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test forge-core.test.js 2>&1 | tail -8`
Expected: PASS — `pass 251 / fail 0` (기존 246 + 신규 5)

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge-core.test.js
git commit -m "$(cat <<'EOF'
feat(forge-core): mergeCandles — OHLC 누적 머지 규칙 단일 출처

서버 ?since= 필터가 >= 라 마지막 봉이 항상 되돌아온다. 같은 t는 교체,
새 t는 추가, t 오름차순 정렬. 클라 fetchOHLC가 델타 머지에 사용한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 서버 `?since=` 응답 필터 + `full` 플래그

**Files:**
- Modify: `forge-api.php:58-176` (ohlc 블록)

**Interfaces:**
- Consumes: 없음
- Produces: HTTP 계약
  - `GET forge-api.php?ohlc=1&symbol=X&tf=1day` → `{ok:true, symbol, tf, source, name, full:true, candles:[전량]}`
  - `GET ...&since=YYYY-MM-DD` → `{..., full:false, candles:[t >= since 인 봉만]}`
  - `since` 형식 불량 / 서버 캐시 없음 / 첫 수집 → `full:true` + 전량
  - 새 봉 없음 → `{full:false, candles:[]}` (오류 아님)
  - Task 4의 `fetchOHLC`가 소비한다.

- [ ] **Step 1: `since` 파싱과 필터 헬퍼를 추가한다**

`forge-api.php:62`(심볼 검증 줄) 바로 다음에 삽입:

```php
    // 증분 전송: 클라가 가진 마지막 봉 날짜. 이 봉부터(>=) 돌려준다 —
    // 진행 중인 봉의 종가 갱신을 받으려면 '>' 가 아니라 '>=' 여야 한다.
    // 주의: 응답 필터일 뿐이며 캐시 파일에는 항상 전량을 저장한다.
    $since = isset($_GET["since"]) ? trim($_GET["since"]) : "";
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) $since = "";
    $emit = function($cands, $sym, $tf, $source, $name) use ($since) {
      $full = true;
      if ($since !== "") {
        $out = [];
        foreach ($cands as $c) { if (isset($c["t"]) && strcmp((string)$c["t"], $since) >= 0) $out[] = $c; }
        $cands = $out; $full = false;
      }
      echo json_encode(["ok"=>true,"symbol"=>$sym,"tf"=>$tf,"source"=>$source,"name"=>$name,
                        "full"=>$full,"candles"=>array_values($cands)], JSON_UNESCAPED_UNICODE);
    };
```

- [ ] **Step 2: TTL 히트 경로를 `since` 인지로 바꾼다**

`forge-api.php:67`의 아래 줄을

```php
    if (is_readable($cf) && (time() - filemtime($cf)) < $ttl) { readfile($cf); exit; }
```

다음으로 교체:

```php
    if (is_readable($cf) && (time() - filemtime($cf)) < $ttl) {
      if ($since === "") { readfile($cf); exit; }   // 전량 요청 = 파일 직행(가장 빠른 경로)
      $hit = json_decode(@file_get_contents($cf), true);
      if (is_array($hit) && isset($hit["candles"]) && is_array($hit["candles"])) {
        $emit($hit["candles"], $sym, $tf, isset($hit["source"]) ? $hit["source"] : "cache",
              isset($hit["name"]) ? $hit["name"] : "");
        exit;
      }
    }
```

- [ ] **Step 3: 나머지 두 출구도 `$emit` 경유로 바꾼다**

`forge-api.php:171`의 cache-stale 폴백을

```php
    if ($candles === null && $incremental) { touch($cf); echo json_encode([...]); exit; }
```

다음으로 교체:

```php
    if ($candles === null && $incremental) { touch($cf); $emit($prev, $sym, $tf, "cache-stale", ""); exit; }
```

그리고 `:173-175`의 최종 출구를

```php
    $payload = json_encode(["ok"=>true,"symbol"=>$sym,"tf"=>$tf,"source"=>$source,"name"=>$name,"candles"=>$candles], JSON_UNESCAPED_UNICODE);
    @file_put_contents($cf, $payload);
    echo $payload; exit;
```

다음으로 교체한다. **캐시에 쓰는 `$payload`는 `since`와 무관하게 항상 전량**임에 주의:

```php
    // 캐시 파일에는 항상 전량을 저장한다(since는 응답 필터일 뿐 — 자르면 누적본이 소실된다)
    $payload = json_encode(["ok"=>true,"symbol"=>$sym,"tf"=>$tf,"source"=>$source,"name"=>$name,
                            "full"=>true,"candles"=>$candles], JSON_UNESCAPED_UNICODE);
    @file_put_contents($cf, $payload);
    $emit($candles, $sym, $tf, $source, $name); exit;
```

- [ ] **Step 4: 배포하고 라이브 curl로 계약을 검증한다**

로컬 PHP가 없으므로 배포가 곧 테스트 환경이다.

```bash
cd /home/jschoi0223/projects/vdiportal/map
lftp -u 'parksvc,wjdtjd2@' sftp://parksvc.mycafe24.com -e "cd www/map; put forge-api.php; bye"
```

검증 스크립트 (전부 통과해야 한다):

```bash
API="https://parksvc.mycafe24.com/map/forge-api.php?ohlc=1&symbol=AAPL&tf=1day"
# ① 전량 → 기준 봉 수 확보 + full:true
FULL_N=$(curl -s "$API" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['candles']), d.get('full'))")
echo "① 전량: $FULL_N"          # 기대: '5013 True' 형태

# ② 델타 → full:false, 봉 수가 확 줄어듦
curl -s "$API&since=2026-08-01" | python3 -c "import json,sys; d=json.load(sys.stdin); c=d['candles']; print('② 델타:', len(c), d.get('full'), c[0]['t'] if c else '-')"
# 기대: full=False, 봉 수 한 자리, 첫 봉 t가 2026-08-01 이상

# ③ 미래 날짜 → 빈 배열 + full:false (오류 아님)
curl -s "$API&since=2099-01-01" | python3 -c "import json,sys; d=json.load(sys.stdin); print('③ 미래:', d['ok'], len(d['candles']), d.get('full'))"
# 기대: True 0 False

# ④ 쓰레기 since → 전량 + full:true
curl -s "$API&since=zzz" | python3 -c "import json,sys; d=json.load(sys.stdin); print('④ 불량:', len(d['candles']), d.get('full'))"
# 기대: ①과 같은 봉 수, True

# ⑤ ★최우선 회귀★ 델타 요청 뒤 전량 재요청 → 봉 수가 ①과 동일(캐시 안 잘림)
curl -s "$API" | python3 -c "import json,sys; d=json.load(sys.stdin); print('⑤ 캐시 무손상:', len(d['candles']))"
# 기대: ①의 봉 수와 정확히 일치
```

⑤가 어긋나면 즉시 중단하고 원인을 찾는다 — 누적 캐시 손상은 되돌릴 수 없다.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-api.php
git commit -m "$(cat <<'EOF'
feat(forge-api): OHLC ?since= 증분 응답 + full 플래그

클라가 가진 마지막 봉 날짜 이후(>=)만 반환. 캐시 파일에는 항상 전량 저장
(since는 응답 필터일 뿐 — 자르면 누적본 소실). full:false=델타, true=전량.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 서버 gzip 출력

**Files:**
- Modify: `forge-api.php:1-10` (헤더 블록 직후)

**Interfaces:**
- Consumes: 없음
- Produces: 모든 응답에 `Content-Encoding: gzip` (클라가 `Accept-Encoding: gzip`을 보낼 때). 애플리케이션 계약 변경 없음 — `fetch`가 자동 해제한다.

- [ ] **Step 1: 조건부 gzip 버퍼를 켠다**

`forge-api.php:9`(`if ($method === "OPTIONS") ...`) 바로 다음에 삽입:

```php
// 응답 gzip — OHLC 누적본이 커서(AAPL 5013봉 ≈ 394KB) 압축 이득이 크다(실측 26.1%).
// zlib.output_compression이 켜져 있으면 이중압축이 되므로 그때는 건너뛴다. 실패해도 무압축으로 정상 동작.
if (!headers_sent() && !ini_get("zlib.output_compression") && function_exists("ob_gzhandler")
    && strpos((string)($_SERVER["HTTP_ACCEPT_ENCODING"] ?? ""), "gzip") !== false) {
  @ob_start("ob_gzhandler");
}
```

- [ ] **Step 2: 배포하고 압축이 실제로 걸렸는지 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
lftp -u 'parksvc,wjdtjd2@' sftp://parksvc.mycafe24.com -e "cd www/map; put forge-api.php; bye"

API="https://parksvc.mycafe24.com/map/forge-api.php?ohlc=1&symbol=AAPL&tf=1day"
curl -sI -H 'Accept-Encoding: gzip' "$API" | grep -i "content-encoding"
# 기대: Content-Encoding: gzip

curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w "압축 전송량: %{size_download}B\n" "$API"
# 기대: 약 100~110KB (압축 전 403,859B)

curl -s "$API" | python3 -c "import json,sys; print('JSON 정상 파싱:', len(json.load(sys.stdin)['candles']), '봉')"
# 기대: 봉 수 정상 — curl이 gzip 없이 요청하므로 무압축 경로도 함께 확인됨
```

- [ ] **Step 3: 쓰기 경로 회귀를 확인한다**

gzip 출력 버퍼가 flock/원자 rename 경로를 건드리지 않는지 본다. **사용자 문서를 건드리지 않는 읽기 op만** 사용한다:

```bash
# GET 문서 조회가 여전히 정상 JSON인지(또는 비로그인 null인지)
curl -s "https://parksvc.mycafe24.com/map/forge-api.php" | head -c 200; echo
# 기대: JSON 또는 null — HTML 오류 페이지나 깨진 바이트가 아니어야 한다

# 쓰기 키 유효성 체크 엔드포인트(부작용 없음)
curl -s "https://parksvc.mycafe24.com/map/forge-api.php?check=1"; echo
# 기대: JSON 응답(깨짐 없음)
```

- [ ] **Step 4: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-api.php
git commit -m "$(cat <<'EOF'
perf(forge-api): 응답 gzip — OHLC 전송량 394KB → 약 105KB(26.1%)

zlib.output_compression 켜져 있으면 이중압축 회피로 건너뜀. 실패해도 무압축 정상 동작.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 클라 `fetchOHLC` 세션 캐시 관문

**Files:**
- Modify: `forge-app.js:1854-1859` (`fetchOHLC` 전체 교체)

**Interfaces:**
- Consumes: `ForgeCore.mergeCandles(prev, delta)` (Task 1), `?since=`·`full` 계약 (Task 2)
- Produces: `fetchOHLC(symbol, tf, opts)` → `Promise<{ok, symbol, tf, source, name, candles, cached?, stale?}>`
  - `opts.force === true`면 신선도를 무시하고 네트워크를 탄다(단 `since`는 그대로 보낸다)
  - **반환 `candles`는 언제나 누적 전량** — 기존 호출자 7곳이 그대로 동작해야 한다
  - Task 5가 `force`를 사용한다

- [ ] **Step 1: 캐시 상태와 관문 함수를 구현한다**

`forge-app.js:1854-1859`의 기존 `fetchOHLC` 전체를 다음으로 교체:

```js
  /* OHLC 세션 캐시 — 호출 지점 7곳(loadDoc 재fetch·loadTicker·chartSetTF·대시보드·
     rankMomentum·벤치마크·노드 불러오기)이 모두 이 관문을 지나므로 여기 한 곳이면 충분하다.
     캐시가 있으면 ?since=<마지막봉 t>로 델타만 받아 머지 → AAPL 394KB가 ~242B로 준다.
     반환 shape은 불변(항상 누적 전량 candles) — 델타는 이 함수 밖으로 새지 않는다. */
  const _ohlcCache = new Map();          // "SYM|tf" → {candles, at, name, source, symbol, tf}
  const _OHLC_FRESH = { "1day": 5 * 60e3, "1week": 30 * 60e3, "1month": 30 * 60e3 };
  const _OHLC_CAP = 12;                  // LRU — 5000봉 배열이 수 MB라 무한정 보관 불가
  function _ohlcHit(key) {               // 조회 시 뒤로 재삽입 = 삽입순 Map을 LRU로 사용
    const v = _ohlcCache.get(key); if (!v) return null;
    _ohlcCache.delete(key); _ohlcCache.set(key, v); return v;
  }
  function _ohlcPut(key, v) {
    _ohlcCache.delete(key); _ohlcCache.set(key, v);
    while (_ohlcCache.size > _OHLC_CAP) _ohlcCache.delete(_ohlcCache.keys().next().value);
  }
  function _ohlcOut(v, extra) {          // 캐시 엔트리 → 호출자용 응답(현행 shape 유지)
    return Object.assign({ ok: true, symbol: v.symbol, tf: v.tf, source: v.source,
                           name: v.name, full: true, candles: v.candles }, extra || {});
  }
  async function fetchOHLC(symbol, tf, opts) {
    tf = tf || "1day"; opts = opts || {};
    const key = String(symbol || "").trim().toUpperCase() + "|" + tf;
    const hit = _ohlcHit(key);
    const fresh = _OHLC_FRESH[tf] || _OHLC_FRESH["1day"];
    if (hit && !opts.force && (Date.now() - hit.at) < fresh) return _ohlcOut(hit, { cached: true });
    // 캐시가 있으면 마지막 봉부터(>=) 델타만 요청 — 진행 중 봉의 종가 갱신을 받기 위함
    const last = (hit && hit.candles.length) ? hit.candles[hit.candles.length - 1].t : "";
    let url = FORGE_API + "?ohlc=1&symbol=" + encodeURIComponent(symbol) + "&tf=" + encodeURIComponent(tf);
    if (last) url += "&since=" + encodeURIComponent(String(last).slice(0, 10));
    let r;
    try { r = await fetch(url, { cache: "no-store" }); }
    catch (e) { if (hit) return _ohlcOut(hit, { stale: true }); throw e; }
    SERVER_OK = true;
    if (!r.ok) {
      if (hit) return _ohlcOut(hit, { stale: true });   // 갱신 실패해도 이전 캔들로 버틴다
      let j = null; try { j = await r.json(); } catch (_) {}
      return j || { ok: false };
    }
    const j = await r.json();
    if (!j || !j.ok || !Array.isArray(j.candles)) return hit ? _ohlcOut(hit, { stale: true }) : (j || { ok: false });
    // full !== false 로 판정 → 필드가 없는 구버전 서버 응답도 안전하게 '전량 교체'로 떨어진다
    const candles = (j.full === false && hit) ? ForgeCore.mergeCandles(hit.candles, j.candles) : j.candles;
    const v = { candles, at: Date.now(), symbol: j.symbol || symbol, tf: j.tf || tf,
                source: j.source || (hit && hit.source) || "", name: j.name || (hit && hit.name) || "" };
    _ohlcPut(key, v);
    return _ohlcOut(v);
  }
```

- [ ] **Step 2: 문법과 기존 테스트 회귀를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --check forge-app.js && echo "SYNTAX OK"
node --test forge-core.test.js 2>&1 | tail -5
```
Expected: `SYNTAX OK` · `pass 251 / fail 0`

- [ ] **Step 3: 머지 경로를 헤드리스 없이 직접 검증한다**

`fetchOHLC`는 DOM/`fetch`에 묶여 있어 node로 직접 못 부른다. 대신 **이 함수가 쓰는 머지 규칙이 실제 서버 응답과 맞물리는지**를 확인한다:

```bash
cd /home/jschoi0223/projects/vdiportal/map
API="https://parksvc.mycafe24.com/map/forge-api.php?ohlc=1&symbol=AAPL&tf=1day"
curl -s "$API" -o /tmp/full.json
LAST=$(python3 -c "import json; print(json.load(open('/tmp/full.json'))['candles'][-1]['t'][:10])")
curl -s "$API&since=$LAST" -o /tmp/delta.json
node -e '
const FC = require("./forge-core.js");
const full = require("/tmp/full.json").candles;
const delta = require("/tmp/delta.json").candles;
// 클라가 가진 것 = 전량에서 마지막 봉을 뺀 상태라고 가정
const prev = full.slice(0, -1);
const merged = FC.mergeCandles(prev, delta);
const same = JSON.stringify(merged) === JSON.stringify(full);
console.log("델타 봉수:", delta.length, "| 머지 결과가 전량과 동일:", same);
if (!same) { console.log("prev", prev.length, "merged", merged.length, "full", full.length); process.exit(1); }
'
```
Expected: `델타 봉수: 1 | 머지 결과가 전량과 동일: true`

이 검증이 통과하면 "델타를 머지하면 전량과 같아진다"는 계약이 실데이터로 확인된 것이다.

- [ ] **Step 4: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-app.js
git commit -m "$(cat <<'EOF'
perf(forge): fetchOHLC 세션 캐시 + ?since= 델타 머지

호출 지점 7곳이 모두 지나는 단일 관문에 캐시를 둠. 신선하면 네트워크 0,
아니면 마지막 봉부터 델타만(394KB → ~242B). 반환은 언제나 누적 전량이라
호출자 shape 불변. LRU 12캡. full !== false 판정으로 구버전 서버와도 안전.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `불러오기` force 연결 + `_dashCache` 흡수

**Files:**
- Modify: `forge-app.js:1993` (`loadTicker` 내 `fetchOHLC` 호출)
- Modify: `forge-app.js:1635-1639` (`_computeTf` — `_dashCache` 제거)
- Modify: `forge-app.js` (`_dashCache` 선언부 — Step 2에서 위치 확인)

**Interfaces:**
- Consumes: `fetchOHLC(symbol, tf, opts)`의 `opts.force` (Task 4)
- Produces: 없음 (내부 정리)

- [ ] **Step 1: `불러오기` 버튼이 신선도를 무시하게 한다**

`forge-app.js:1993`의

```js
      const r = await fetchOHLC(sym, tf);
```

을 다음으로 교체(`loadTicker` 안이다 — 주변에 `if (lb) { lb.disabled = true; ... "불러오는 중…" }`가 있는 쪽):

```js
      const r = await fetchOHLC(sym, tf, { force: true });   // 사용자가 명시적으로 누른 새로고침 = 신선도 무시(단 델타는 유지)
```

- [ ] **Step 2: `_dashCache`를 제거한다**

세션 캐시가 같은 일을 더 잘 하므로 중복이다. 먼저 선언 위치를 찾는다:

```bash
cd /home/jschoi0223/projects/vdiportal/map && grep -n "_dashCache" forge-app.js
```

`forge-app.js:1637-1639`의

```js
      let r;
      if (_dashCache.sym === symbol && _dashCache.cand[tf]) r = _dashCache.cand[tf];   // 재분석 시 재fetch 방지(캔들 캐시)
      else { r = await fetchOHLC(symbol, tf); if (r && r.ok) { if (_dashCache.sym !== symbol) _dashCache = { sym: symbol, cand: {} }; _dashCache.cand[tf] = r; } }
```

을 다음으로 교체:

```js
      const r = await fetchOHLC(symbol, tf);   // 재fetch 방지는 fetchOHLC 세션 캐시가 담당(_dashCache 흡수)
```

그리고 grep으로 찾은 `_dashCache` **선언 줄과 나머지 참조를 모두 삭제**한다. 남은 참조가 있으면 `node --check`가 아니라 런타임에서 터지므로 grep 결과가 0건이 될 때까지 지운다.

- [ ] **Step 3: 문법·잔존 참조·테스트를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
grep -n "_dashCache" forge-app.js || echo "_dashCache 잔존 참조 없음 ✓"
node --check forge-app.js && echo "SYNTAX OK"
node --test forge-core.test.js 2>&1 | tail -5
```
Expected: `_dashCache 잔존 참조 없음 ✓` · `SYNTAX OK` · `pass 251 / fail 0`

- [ ] **Step 4: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-app.js
git commit -m "$(cat <<'EOF'
refactor(forge): 불러오기=force · 대시보드 전용 _dashCache 흡수

불러오기 버튼은 사용자가 누른 새로고침이라 신선도 무시(델타는 유지).
_dashCache는 fetchOHLC 세션 캐시와 중복이라 제거.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 통합 검증 · 배포 · 기록

**Files:**
- Modify: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 배포된 라이브 + 완료 기록

- [ ] **Step 1: 클라를 배포한다**

`forge-api.php`는 Task 2·3에서 이미 올라가 있다. 남은 정적 파일만 올린다.

```bash
cd /home/jschoi0223/projects/vdiportal/map
lftp -u 'parksvc,wjdtjd2@' sftp://parksvc.mycafe24.com -e "cd www/map; put forge-core.js; put forge-app.js; bye"
```

**`forge_ohlc_cache_*.json`·`forge_data.json`·`forge_images.json`·`forge_jobs.json`·`forge_td_key.txt`는 절대 올리지 않는다.**

- [ ] **Step 2: 배포본이 실제로 반영됐는지 확인한다**

```bash
curl -s https://parksvc.mycafe24.com/map/forge-core.js | grep -c "function mergeCandles"
curl -s https://parksvc.mycafe24.com/map/forge-app.js | grep -c "_ohlcCache"
```
Expected: 둘 다 `1` 이상

- [ ] **Step 3: 누적 캐시 무손상 최종 회귀**

전체 작업을 통틀어 가장 중요한 확인이다. 여러 종목에 대해 봉 수가 작업 전과 같은지 본다.

```bash
for s in AAPL BTC-USD 005930; do
  curl -s "https://parksvc.mycafe24.com/map/forge-api.php?ohlc=1&symbol=$s&tf=1day" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); c=d['candles']; print(f'$s: {len(c)}봉 {c[0][\"t\"]}~{c[-1][\"t\"]} full={d.get(\"full\")}')"
done
```
Expected: 작업 착수 시점 실측(AAPL 5013봉 2006-08-29~, BTC-USD 3265봉 2017-08-28~, 005930 413봉 2024-11-22~) **이상**의 봉 수. 줄었으면 캐시가 잘린 것이므로 즉시 조사한다.

- [ ] **Step 4: 브라우저에서 체감 확인**

사용자에게 확인을 요청한다(자동화하지 않는다 — `loadTicker`는 쓰기 경로라 헤드리스로 부르면 안 된다):

> 워치리스트에서 종목 A → B → 다시 A로 전환해 보세요. 두 번째 A 전환이 네트워크 요청 없이 즉시 떠야 합니다. DevTools Network 탭에서 `forge-api.php?ohlc=` 요청이 안 생기면 정상입니다. `불러오기` 버튼은 여전히 매번 서버를 타되 응답이 수백 바이트여야 합니다.

- [ ] **Step 5: 백로그에 기록하고 커밋**

`docs/BACKLOG.md`의 완료 항목 형식을 먼저 확인한 뒤(`head -40 docs/BACKLOG.md`) 같은 형식으로 한 줄 추가한다. 내용:

> OHLC 증분 전송 — 클라↔서버 구간 델타화(`?since=` + 세션 캐시 + gzip). AAPL 394KB/요청 → 캐시 히트 0B / 델타 ~242B / 첫 로드 105KB(gzip). 설계 `docs/superpowers/specs/2026-08-05-ohlc-incremental-transfer-design.md`.

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
docs(forge): 백로그에 OHLC 증분 전송 완료 기록

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | 구현 태스크 |
|---|---|
| §3.1 `?since=` 필터 · 캐시엔 전량 저장 | Task 2 Step 1·3 |
| §3.1 `full` 플래그 (없는 요청도 `full:true`) | Task 2 Step 1 (`$emit`) |
| §3.1 `>=` 비교 | Task 2 Step 1 (`strcmp >= 0`) |
| §3.1 `since` 형식 검증 | Task 2 Step 1 (`preg_match`) |
| §3.1 TTL 히트 경로 분기 | Task 2 Step 2 |
| §3.1 새 봉 없으면 `candles:[]` + `full:false` | Task 2 Step 4 검증 ③ |
| §3.2 세션 캐시 · 신선도 5분/30분 | Task 4 Step 1 (`_OHLC_FRESH`) |
| §3.2 반환 shape 불변 | Task 4 Step 1 (`_ohlcOut`), Global Constraints |
| §3.2 `force` 옵션 | Task 4 Step 1 · Task 5 Step 1 |
| §3.2 LRU 12캡 | Task 4 Step 1 (`_OHLC_CAP`) |
| §3.2 `_dashCache` 흡수 | Task 5 Step 2 |
| §3.2 델타 빈 배열이어도 `at` 갱신 | Task 4 Step 1 (성공 경로가 항상 `_ohlcPut`) |
| §3.3 gzip · 이중압축 회피 | Task 3 Step 1 |
| §4 fetch 실패 시 캐시 폴백 | Task 4 Step 1 (`stale:true` 3경로) |
| §4 `since` 불량 → 전량 + `full:true` | Task 2 Step 1 · Step 4 검증 ④ |
| §5 검증 1~8 | Task 2 Step 4(①~⑤) · Task 3 Step 2·3(⑤⑦) · Task 1 Step 4·Task 4 Step 2(⑧) |
| §7 배포 · 불가침 | Task 6 Step 1 |

누락 없음. 스펙 §6(범위 밖)은 의도적으로 태스크가 없다.

**2. 플레이스홀더 스캔**

"TBD"·"적절히 처리"·"테스트 작성" 류 없음. 모든 코드 스텝이 실제 코드 블록을 포함한다. Task 5 Step 2만 `_dashCache` 선언 위치를 grep으로 찾게 했는데, 이는 **정확한 줄 번호를 계획 작성 시점에 확정할 수 없어서**가 아니라 삭제 대상이 여러 줄에 흩어져 있을 수 있어서다 — grep 명령과 완료 판정 기준(0건)을 명시했으므로 실행 가능하다.

**3. 타입 일관성**

- `mergeCandles(prev, delta)` — Task 1 정의, Task 4 Step 1·Task 4 Step 3에서 동일 이름·인자 순서로 사용 ✓
- `fetchOHLC(symbol, tf, opts)` · `opts.force` — Task 4 정의, Task 5 Step 1에서 동일 ✓
- `full` 필드 — Task 2가 생산(PHP `"full"=>$full`), Task 4가 `j.full === false`로 소비 ✓
- `_ohlcHit`/`_ohlcPut`/`_ohlcOut` — Task 4 내부에서만 정의·사용, 외부 노출 없음 ✓
- 캐시 엔트리 필드 `{candles, at, symbol, tf, source, name}` — `_ohlcPut` 생성부와 `_ohlcOut` 소비부 일치 ✓
