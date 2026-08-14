#!/usr/bin/env bash
# 지갑 디스패처(wallet-api.php) 하네스. 실제 파일을 php 내장 서버에 얹고 curl 로 두드린다.
#
# 왜 필요한가: 이 브랜치가 761건짜리 관문을 통과하는 동안 wallet-api.php 는 저장소 어디에서도
# 로드·실행·읽히지 않았다. 원장 스위트(tests/wallet.test.php)는 wallet-lib.php 만 보고, 모바일
# 스위트는 가짜 fetch 를 상대하며, 동시성 하네스는 hello 를 hello-sim.php 로 다시 구현한다.
# 그래서 인증 401 검사 삭제 · checkin 의 today 를 요청에서 받기 · 계정 id 를 본문에서 받기 ·
# W_DEVICE_MIN 을 1 로 · w_field_str 의 타입 가드 삭제 · $W_DIR 을 웹루트 안으로 · display_errors
# 켜기 · IP 해시에서 비밀키 빼기 · CORS 에서 Authorization 빼기 — 아홉 가지 개조가 전부 초록으로
# 배포될 수 있었다(최종 리뷰 실측). 아래 각 검사는 그 중 하나씩을 빨갛게 만든다.
#
# 빠르다(1~2초, 서버 1회 기동) — 그래서 concurrency 와 달리 tests/run.sh 의 'all' 에 들어간다.
# 사람이 기억해야만 도는 관문은 관문이 아니다(그게 이 하네스가 존재하는 이유다).
#
# ⚠ php -S 는 요청을 직렬 처리한다. 여기 검사는 전부 기능 검사이므로 상관없다 —
# 경합은 tests/wallet-concurrency.sh 가 실제 OS 프로세스로 따로 본다.
#
# 사용법: ./tests/run.sh dispatcher  (또는 이 스크립트를 직접 실행)
# 출력은 node --test 와 같은 'ℹ pass N' / 'ℹ fail N' 형식이다 — run.sh 가 그 형식만 읽는다.
set -uo pipefail
cd "$(dirname "$0")/.."
MAP_ROOT="$PWD"
PASS=0; FAIL=0

if ! command -v php >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  echo "not ok - php 또는 curl 이 없다 — 디스패처를 검사하지 못했다"
  echo "ℹ pass 0"; echo "ℹ fail 1"; exit 1
fi

# 리포에도 ~/projects/data 에도 손대지 않는다. 배치는 프로덕션과 같은 모양이다:
#   $WORK/www/map/wallet-api.php   (웹루트 = $WORK/www/map)
#   $WORK/data/wallet.db           ($W_DIR = dirname(dirname(__DIR__))."/data" — 웹루트 밖)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/wallet-dispatcher.XXXXXX")
DOCROOT="$WORK/www/map"
DATA="$WORK/data"
DB="$DATA/wallet.db"
BODIES="$WORK/all-bodies.txt"
SRV_LOG="$WORK/server.log"
SRV_PID=""
cleanup() {
  [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null
  chmod -R u+rwX "$WORK" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$DOCROOT"
cp "$MAP_ROOT/wallet-api.php" "$MAP_ROOT/wallet-lib.php" "$DOCROOT/"
: > "$BODIES"

# 서버 자체는 display_errors 를 켜 둔다 — wallet-api.php 첫 줄의 ini_set 이 유일한 방어막이
# 되게 하려는 것이다. 그 줄을 지우면 PHP 진단이 응답 본문으로 새고, 아래 "경로 유출 없음"
# 검사가 그걸 본다(호스트 설정을 믿지 않는다는 그 파일의 전제와 같은 방향).
PORT=0
for try in 1 2 3 4 5; do
  P=$(( 8790 + RANDOM % 900 ))
  php -S "127.0.0.1:$P" -t "$DOCROOT" -d display_errors=1 -d error_reporting=-1 >"$SRV_LOG" 2>&1 &
  SRV_PID=$!
  for i in $(seq 1 40); do
    sleep 0.05
    # 순서가 중요하다. curl 성공을 먼저 보면, 우리 php 가 바인딩에 실패했을 때 그 포트를
    # 이미 점유한 **남의 리스너**가 준 응답을 "내 서버가 떴다"로 오인한다. 그러면 71건짜리
    # 돈 관련 관문이 통째로 엉뚱한 서버(남의 wallet.db)를 검사하고, 실패는 무작위 포트
    # 충돌에 따라 나타났다 사라져 "플레이크"로 읽힌다. 2026-08-15 실제로 그렇게 됐다 —
    # /tmp 에 방치된 하네스의 php -S 가 이 범위 포트를 물고 있었다.
    kill -0 "$SRV_PID" 2>/dev/null || break
    grep -q "Address already in use" "$SRV_LOG" 2>/dev/null && break
    if curl -s -o /dev/null "http://127.0.0.1:$P/wallet-api.php" 2>/dev/null; then PORT=$P; break; fi
  done
  [ "$PORT" != "0" ] && break
  kill "$SRV_PID" 2>/dev/null; SRV_PID=""
done
if [ "$PORT" = "0" ]; then
  echo "not ok - php 내장 서버를 띄우지 못했다"; cat "$SRV_LOG"
  echo "ℹ pass 0"; echo "ℹ fail 1"; exit 1
fi
BASE="http://127.0.0.1:$PORT"

# ── 헬퍼 ────────────────────────────────────────────────────────────────────
ok_()  { PASS=$((PASS + 1)); }
bad_() { FAIL=$((FAIL + 1)); echo "not ok - $1"; }
chk()  { if [ "$2" = "$3" ]; then ok_; else bad_ "$1 — got '$2', want '$3'"; fi; }
chk_has() { case "$2" in *"$3"*) ok_ ;; *) bad_ "$1 — '$2' 안에 '$3' 가 없다" ;; esac; }
chk_no()  { case "$2" in *"$3"*) bad_ "$1 — '$2' 에 '$3' 가 들어 있다" ;; *) ok_ ;; esac; }

# post <json> [token] → CODE, BODY 를 채운다. 모든 응답 본문은 경로 유출 검사용으로 모은다.
post() {
  local body="$1" tok="${2:-}"
  if [ -n "$tok" ]; then
    CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' -X POST -H "Content-Type: application/json" \
                -H "Authorization: Bearer $tok" --data "$body" "$BASE/wallet-api.php")
  else
    CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' -X POST -H "Content-Type: application/json" \
                --data "$body" "$BASE/wallet-api.php")
  fi
  BODY=$(cat "$WORK/out")
  printf '%s\n' "$BODY" >> "$BODIES"
}

# jget <json> <key> — 최상위 스칼라. state 안은 jget2 로.
jget() {
  printf '%s' "$1" | php -r '
    $j = json_decode(stream_get_contents(STDIN), true);
    if (!is_array($j) || !array_key_exists($argv[1], $j)) { echo "<none>"; exit; }
    $v = $j[$argv[1]];
    echo is_bool($v) ? ($v ? "true" : "false") : (is_null($v) ? "null" : (is_scalar($v) ? $v : json_encode($v)));
  ' "$2"
}
jget2() {
  printf '%s' "$1" | php -r '
    $j = json_decode(stream_get_contents(STDIN), true);
    if (!is_array($j) || !isset($j[$argv[1]]) || !is_array($j[$argv[1]])
        || !array_key_exists($argv[2], $j[$argv[1]])) { echo "<none>"; exit; }
    $v = $j[$argv[1]][$argv[2]];
    echo is_bool($v) ? ($v ? "true" : "false") : (is_null($v) ? "null" : (is_scalar($v) ? $v : json_encode($v)));
  ' "$2" "$3"
}
dbq() { php -r '
    $db = new PDO("sqlite:" . $argv[1]);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $r = $db->query($argv[2])->fetch(PDO::FETCH_NUM);
    echo ($r === false || $r[0] === null) ? "<none>" : $r[0];
  ' "$DB" "$1" 2>/dev/null; }
dbexec() { php -r '
    $db = new PDO("sqlite:" . $argv[1]);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec($argv[2]);
  ' "$DB" "$1"; }

# ⚠ 검사를 추가하려는 사람에게: W_IP_DAILY 값이 얼마든(개발용으로 3→20 처럼 바뀔 수 있다),
# 이 하네스는 같은 IP(127.0.0.1)에서 여러 hello 를 만든다 — 손대지 않으면 상한을 넘는 순간의
# hello 가 429 rate-limited 로 떨어져 전혀 무관한 이유로 스위트가 빨개진다(그 원인을 찾는 데
# 한 시간이 든다). 그래서 hello 앞에서 "오늘 만든 계정" 카운트를 비운다: w_seed_count_today 가
# created_at >= 오늘 로 세므로 기존 행의 created_at 만 과거로 민다. seed_ip_hash 는 건드리지
# 않는다 — 아래 HMAC 검사가 그 값을 쓴다. 이 리셋 덕분에 이 파일의 어떤 검사도 W_IP_DAILY 의
# 실제 값에 의존하지 않는다(hello 는 매번 리셋 직후 딱 1건씩만 온다). 상한 로직 자체가
# 지켜지는지는 tests/wallet-concurrency.sh(진짜 동시 프로세스)가 따로 본다.
ip_cap_reset() { dbexec "update accounts set created_at = '2000-01-01T00:00:00+00:00'"; }

DEV_A="dev-a-0123456789abcdef0123456789abcdef0123456789"
DEV_B="dev-b-0123456789abcdef0123456789abcdef0123456789"
DEV_C="dev-c-0123456789abcdef0123456789abcdef0123456789"
ACCT_A=$(php -r 'echo substr(sha1($argv[1]), 0, 16);' "$DEV_A")
ACCT_B=$(php -r 'echo substr(sha1($argv[1]), 0, 16);' "$DEV_B")
ACCT_C=$(php -r 'echo substr(sha1($argv[1]), 0, 16);' "$DEV_C")
TODAY=$(php -r 'echo gmdate("Y-m-d");')

# ── ping — 인증 없이 열려 있으므로 스키마 버전 외에는 아무 것도 말하지 않는다 ──────────
post '{"op":"ping"}'
chk "ping 이 200 이다" "$CODE" "200"
SCHEMA=$(jget "$BODY" schema)   # 값은 마이그레이션마다 오른다 — "마이그레이션이 돌았는가"만 본다
case "$SCHEMA" in ''|*[!0-9]*) bad_ "ping 이 스키마 버전을 안 준다 — got '$SCHEMA'" ;; *)
  [ "$SCHEMA" -ge 1 ] && ok_ || bad_ "스키마 버전이 0 이다 — 마이그레이션이 안 돌았다" ;; esac
chk "ping 이 PHP 패치 버전을 흘리지 않는다" "$(jget "$BODY" php)" "<none>"
chk "ping 이 SQLite 패치 버전을 흘리지 않는다" "$(jget "$BODY" sqlite)" "<none>"

# ── hello · deviceId 하한(W_DEVICE_MIN=32) ────────────────────────────────
post "{\"op\":\"hello\",\"deviceId\":\"$DEV_A\"}"
chk "hello 가 200 이다" "$CODE" "200"
chk "새 계정은 시드 5 를 받는다" "$(jget2 "$BODY" state balance)" "5"
TOK_A=$(jget "$BODY" token)
[ "$TOK_A" != "<none>" ] && [ -n "$TOK_A" ] && ok_ || bad_ "hello 가 토큰을 안 줬다"

post "{\"op\":\"hello\",\"deviceId\":\"$(php -r 'echo str_repeat("z", 31);')\"}"
chk "31자 deviceId 는 400 이다 (하한을 1 로 낮추면 빨개진다)" "$CODE" "400"
chk "31자 deviceId 사유" "$(jget "$BODY" reason)" "bad-device"

ip_cap_reset
post "{\"op\":\"hello\",\"deviceId\":\"$(php -r 'echo str_repeat("z", 32);')\"}"
chk "32자 deviceId 는 통과한다 — 하한이 정확히 32 다" "$CODE" "200"

# ── 인증 — 토큰이 유일한 신원이다. 기기 id 를 본문에 실어 남의 계정을 읽지 못한다 ───────
post '{"op":"get"}'
chk "토큰 없는 get 은 401 이다" "$CODE" "401"
chk "토큰 없는 get 사유" "$(jget "$BODY" reason)" "unauthorized"
chk_no "토큰 없는 401 이 잔량을 흘리지 않는다" "$BODY" "balance"

post '{"op":"get"}' "garbage.token.here"
chk "위조 토큰은 401 이다" "$CODE" "401"

post "{\"op\":\"get\",\"deviceId\":\"$DEV_A\"}"
chk "본문 deviceId 만으로는 못 읽는다 — 401" "$CODE" "401"
chk_no "본문 deviceId 401 이 잔량을 흘리지 않는다" "$BODY" "balance"

post '{"op":"get"}' "$TOK_A"
chk "유효 토큰 get 은 200 이다" "$CODE" "200"
chk "유효 토큰 get 잔량" "$(jget2 "$BODY" state balance)" "5"

# 토큰은 유효한데 계정 행이 없는 경우 — 토큰 수명이 365일이라 원장 복구·초기화보다 오래 산다
# (이 저장소는 2026-07-17 에 서버 데이터가 통째로 날아간 일을 실제로 겪었다). 평소에는 토큰
# 판독 401 과 계정 조회 401 이 서로 중복이지만 여기서는 갈린다: 계정 조회 쪽을 지우면
# "잔량 0 짜리 유령 계정"이 200 ok 로 나간다(재리뷰 실측).
ip_cap_reset
post "{\"op\":\"hello\",\"deviceId\":\"$DEV_C\"}"
TOK_C=$(jget "$BODY" token)
chk "C 계정이 만들어졌다" "$CODE" "200"
dbexec "delete from accounts where id='$ACCT_C'"
post '{"op":"get"}' "$TOK_C"
chk "계정 행이 사라진 유효 토큰은 401 이다" "$CODE" "401"
chk "그 401 의 사유" "$(jget "$BODY" reason)" "unauthorized"
chk_no "유령 계정의 잔량을 그리지 않는다" "$BODY" "balance"

# ── 계정 귀속 — 과금 대상은 토큰이 정한다. 본문의 acctId·deviceId 는 무시된다 ──────────
ip_cap_reset
post "{\"op\":\"hello\",\"deviceId\":\"$DEV_B\"}"
TOK_B=$(jget "$BODY" token)
chk "B 계정 시드" "$(jget2 "$BODY" state balance)" "5"

post "{\"op\":\"spend\",\"runType\":\"full\",\"idem\":\"iA1\",\"ref\":\"AAPL\",\"acctId\":\"$ACCT_B\",\"accountId\":\"$ACCT_B\",\"account_id\":\"$ACCT_B\",\"deviceId\":\"$DEV_B\"}" "$TOK_A"
chk "A 토큰 spend 가 200 이다" "$CODE" "200"
chk "A 토큰 spend 가 과금됐다" "$(jget "$BODY" charged)" "true"
chk "차감은 토큰 주인(A)에게서 났다" "$(jget2 "$BODY" state balance)" "2"
post '{"op":"get"}' "$TOK_B"
chk "본문에 실린 acctId(B)의 잔량은 그대로다" "$(jget2 "$BODY" state balance)" "5"

# ── checkin — 날짜는 서버가 정한다. 본문의 today 는 계약상 존재하지 않는다 ─────────────
post '{"op":"checkin"}' "$TOK_A"
chk "출석 200" "$CODE" "200"
chk "출석 지급 1" "$(jget "$BODY" granted)" "1"
post '{"op":"checkin","today":"2035-01-01"}' "$TOK_A"
chk "본문 today 로 하루를 다시 못 받는다" "$(jget "$BODY" reason)" "already"
chk "본문 today 재출석이 지급되지 않았다" "$(jget "$BODY" granted)" "0"
chk "last_checkin 이 본문 날짜로 움직이지 않았다" "$(dbq "select last_checkin from accounts where id='$ACCT_A'")" "$TODAY"
chk "출석 뒤 잔량은 3 이다(2+1)" "$(jget2 "$BODY" state balance)" "3"

# ── 문자열 필드 가드 — 타입·길이. 통과하면 원장에 그대로 박힌다 ─────────────────────
LEDG_B_BEFORE=$(dbq "select count(*) from ledger where account_id='$ACCT_B'")
post '{"op":"spend","runType":"scan","idem":["x"],"ref":null}' "$TOK_B"
chk "배열 idem 은 400 이다" "$CODE" "400"
chk "배열 idem 사유" "$(jget "$BODY" reason)" "bad-request"
chk "배열 idem 이 원장 행을 만들지 않았다" "$(dbq "select count(*) from ledger where account_id='$ACCT_B'")" "$LEDG_B_BEFORE"
post '{"op":"get"}' "$TOK_B"
chk "배열 idem 뒤 B 잔량이 그대로다" "$(jget2 "$BODY" state balance)" "5"

post "{\"op\":\"spend\",\"runType\":\"scan\",\"idem\":\"$(php -r 'echo str_repeat("q", 200);')\"}" "$TOK_B"
chk "200자 idem 은 400 이다(상한 128)" "$CODE" "400"
post '{"op":"spend","runType":"scan","idem":""}' "$TOK_B"
chk "빈 idem 은 400 이다 — 접두를 붙이면 빈 값이 멀쩡한 키가 된다" "$CODE" "400"
post '{"op":"refund","idem":""}' "$TOK_B"
chk "빈 idem refund 도 400 이다" "$CODE" "400"

# ── idem 이름공간 — 클라이언트 입력이 서버 자신의 키에 닿으면 안 된다 ──────────────────
# 클라이언트는 device_id 로 계정 id 를 오프라인 계산할 수 있으므로 checkin 키를 정확히 안다.
post "{\"op\":\"spend\",\"runType\":\"scan\",\"idem\":\"checkin:$ACCT_B:$TODAY\"}" "$TOK_B"
chk "서버 키 모양의 idem 도 그냥 받는다(접두되므로 안전)" "$CODE" "200"
chk "그 spend 는 정상 과금됐다" "$(jget "$BODY" charged)" "true"
post '{"op":"checkin"}' "$TOK_B"
chk "그 뒤에도 출석은 500 이 아니라 200 이다" "$CODE" "200"
chk "출석이 정상 지급됐다" "$(jget "$BODY" granted)" "1"
chk "호출자 idem 은 c: 이름공간에 저장된다" \
    "$(dbq "select count(*) from ledger where account_id='$ACCT_B' and idem='c:checkin:$ACCT_B:$TODAY'")" "1"
chk "서버 키는 접두 없이 그대로 있다" \
    "$(dbq "select count(*) from ledger where account_id='$ACCT_B' and idem='checkin:$ACCT_B:$TODAY'")" "1"

# 접두는 spend·refund 양쪽에 똑같이 붙어야 한다 — 한쪽만 붙이면 모든 환급이 not-found 다.
post '{"op":"spend","runType":"scan","idem":"rf1"}' "$TOK_B"
chk "환급용 spend 과금" "$(jget "$BODY" charged)" "true"
post '{"op":"refund","idem":"rf1"}' "$TOK_B"
chk "환급이 원본을 찾는다(접두 대칭)" "$(jget "$BODY" ok)" "true"

# ── 원장 위치 — 웹루트 밖이어야 한다 ────────────────────────────────────────
[ -f "$DB" ] && ok_ || bad_ "원장이 웹루트 밖($DB)에 없다 — \$W_DIR 이 옮겨졌다"
LEAKED=$(find "$WORK/www" \( -name "*.db" -o -name "wallet_secret.txt" -o -name "*.db-wal" \) | head -3)
chk "웹루트 안에 원장·비밀키 파일이 없다" "$LEAKED" ""
DL=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/data/wallet.db")
chk "원장이 URL 로 다운로드되지 않는다" "$DL" "404"

# ── CORS — Capacitor 앱은 진짜 cross-origin 이라 preflight 를 탄다 ────────────────
OPT=$(curl -s -i -X OPTIONS -H "Origin: https://localhost" \
           -H "Access-Control-Request-Method: POST" \
           -H "Access-Control-Request-Headers: authorization,content-type" "$BASE/wallet-api.php")
case "$OPT" in *"204"*) ok_ ;; *) bad_ "OPTIONS 가 204 가 아니다" ;; esac
ACAH=$(printf '%s' "$OPT" | grep -i "^access-control-allow-headers:" | tr -d '\r')
chk_has "preflight 가 Authorization 을 허용한다" "$(printf '%s' "$ACAH" | tr 'A-Z' 'a-z')" "authorization"
chk_has "preflight 가 Content-Type 을 허용한다" "$(printf '%s' "$ACAH" | tr 'A-Z' 'a-z')" "content-type"

# ── 메서드·알 수 없는 op ─────────────────────────────────────────────────
MC=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/wallet-api.php")
chk "GET 은 405 다" "$MC" "405"
post '{"op":"nope"}' "$TOK_A"
chk "모르는 op 는 400 이다" "$CODE" "400"
chk "모르는 op 사유" "$(jget "$BODY" reason)" "unknown-op"

# ── IP 해시는 비밀키가 들어간 HMAC 이다 ────────────────────────────────────
# 기대값을 구현이 아니라 바깥(비밀키 파일 + 알려진 REMOTE_ADDR)에서 계산한다.
STORED=$(dbq "select seed_ip_hash from accounts where id='$ACCT_A'")
WANT_HMAC=$(php -r 'echo substr(hash_hmac("sha256", "127.0.0.1", trim(file_get_contents($argv[1]))), 0, 32);' "$DATA/wallet_secret.txt")
PLAIN=$(php -r 'echo substr(hash("sha256", "127.0.0.1"), 0, 32);')
chk "seed_ip_hash 가 비밀키 HMAC 이다" "$STORED" "$WANT_HMAC"
[ "$STORED" != "$PLAIN" ] && ok_ || bad_ "seed_ip_hash 가 키 없는 sha256 이다 — 무차별 대입 표 하나로 IP 가 복원된다"

# ── 저장소 오류 응답이 서버 경로를 흘리지 않는다 ──────────────────────────────
if [ "$(id -u)" != "0" ]; then
  chmod 0500 "$DATA"
  post '{"op":"ping"}'
  chk "쓰기 불가 원장 디렉토리에서 500 이다" "$CODE" "500"
  chk "그 500 의 사유는 storage 다" "$(jget "$BODY" reason)" "storage"
  chk_no "500 본문에 서버 경로가 없다" "$BODY" "$WORK"
  chmod 0700 "$DATA"
else
  ok_; ok_; ok_   # root 는 is_writable 이 무의미하다
fi

# ── 어떤 응답에도 PHP 진단·경로가 섞이지 않는다 ────────────────────────────────
# (서버는 display_errors=1 로 떠 있다 — wallet-api.php 첫 줄의 ini_set 이 유일한 방어막이다)
ALL=$(cat "$BODIES")
for marker in "$WORK" "$MAP_ROOT" "on line" "Warning:" "Fatal error" "Stack trace" "wallet-lib.php"; do
  chk_no "응답 본문에 '$marker' 가 없다" "$ALL" "$marker"
done
# display_errors 자체는 위 검사만으로는 못 지킨다 — 정상 입력으로는 PHP 진단이 안 나기 때문이다
# (probe 로 확인했다). 그래서 그 한 줄은 소스 모양으로 못박는다: 첫 출력보다 먼저 와야 한다.
INI_LINE=$(grep -n 'ini_set("display_errors", *"0")' "$DOCROOT/wallet-api.php" | head -1 | cut -d: -f1)
HDR_LINE=$(grep -n '^header(' "$DOCROOT/wallet-api.php" | head -1 | cut -d: -f1)
if [ -n "$INI_LINE" ] && [ -n "$HDR_LINE" ] && [ "$INI_LINE" -lt "$HDR_LINE" ]; then ok_
else bad_ "wallet-api.php 가 첫 출력 전에 display_errors 를 끄지 않는다 — 호스트 설정이 켜져 있으면 경고와 서버 경로가 JSON 본문에 섞인다"; fi

# 서버가 조용히 죽지 않았는지 — 죽었다면 위 검사들이 의미 없다.
kill -0 "$SRV_PID" 2>/dev/null && ok_ || bad_ "php 내장 서버가 검사 도중 죽었다: $(tail -3 "$SRV_LOG")"

echo "ℹ pass $PASS"
echo "ℹ fail $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
