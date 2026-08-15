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
cp "$MAP_ROOT/wallet-api.php" "$MAP_ROOT/wallet-lib.php" "$MAP_ROOT/wallet-auth.php" \
   "$MAP_ROOT/wallet-ssv.php" "$DOCROOT/"
: > "$BODIES"

# 서버 자체는 display_errors 를 켜 둔다 — wallet-api.php 첫 줄의 ini_set 이 유일한 방어막이
# 되게 하려는 것이다. 그 줄을 지우면 PHP 진단이 응답 본문으로 새고, 아래 "경로 유출 없음"
# 검사가 그걸 본다(호스트 설정을 믿지 않는다는 그 파일의 전제와 같은 방향).
PORT=0
for try in 1 2 3 4 5; do
  P=$(( 8790 + RANDOM % 900 ))
  # ⚠ 이 관문은 절대 구글에 접속하지 않는다. wallet-lib.php 의 SSV 키 서버 URL 을 닿을 수
  # 없는 주소로 못박아 둔다 — 부모의 define() 은 이 서브프로세스로 넘어가지 않으므로
  # 환경변수여야 한다. 8d 의 SSV 라우트가 붙는 순간, 이 줄이 없으면 관문이 진짜
  # gstatic.com 으로 요청을 내기 시작한다(요청당 최대 10초 정지 + 구글 가동에 대한 은밀한 의존).
  W_SSV_KEYS_URL="http://127.0.0.1:9/ssv-keys-must-not-be-fetched" \
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

# ── authStart / authPoll(미완 경로) ────────────────────────────────────────
# authStart — OAuth 설정 파일이 없으면 무중단 스위치가 켜진다(이 하네스의 DOCROOT 에는
# forge_google_oauth.json 을 복사하지 않는다).
post '{"op":"authStart"}' "$TOK_A"
chk "설정 없으면 authStart 가 auth-disabled 다" "$(jget "$BODY" reason)" "auth-disabled"
chk "그래도 200 이다 — 로그인은 부가 기능이지 오류가 아니다" "$CODE" "200"

# 토큰 없이는 못 부른다
CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' -X POST -H "Content-Type: application/json" \
            --data '{"op":"authStart"}' "$BASE/wallet-api.php")
chk "토큰 없는 authStart 는 401 이다" "$CODE" "401"

# 모르는 논스로 폴링 — 논스만 알면 남의 계정을 탈취하는 구멍이다
post '{"op":"authPoll","nonce":"someone-elses-nonce"}' "$TOK_A"
chk "모르는 논스는 401 이다" "$CODE" "401"
chk "모르는 논스 401 의 사유" "$(jget "$BODY" reason)" "unauthorized"

# authStart 가 auth-disabled 라 실제 논스를 API 로 못 만든다 — DB 에 직접 심어
# "존재하지만 남의 기기" 케이스를 재현한다. 이게 없으면 authPoll 의 device_id 비교를
# 지워도(항상 unauthorized 를 내는 "모르는 논스" 검사만으로는) 안 걸린다 — row 가
# null 이라 어차피 401 이기 때문이다. 여기서는 row 가 있어야 device_id 비교 자체를 시험한다.
NOW_ISO=$(php -r 'echo gmdate("c");')
NONCE_B="dispatcher-nonce-for-b-$RANDOM"
dbexec "insert into auth_nonce (nonce, device_id, google_sub, created_at, used) values ('$NONCE_B', '$DEV_B', null, '$NOW_ISO', 0)"
post "{\"op\":\"authPoll\",\"nonce\":\"$NONCE_B\"}" "$TOK_A"
chk "남의 기기 논스로 폴링하면 401 이다 — device_id 대조가 살아 있어야 한다" "$CODE" "401"
chk "남의 기기 논스 401 의 사유도 같다 — 존재 여부를 알려주면 안 된다" "$(jget "$BODY" reason)" "unauthorized"

# 자기 기기의 미완 논스는 pending:true 다
NONCE_A="dispatcher-nonce-for-a-$RANDOM"
dbexec "insert into auth_nonce (nonce, device_id, google_sub, created_at, used) values ('$NONCE_A', '$DEV_A', null, '$NOW_ISO', 0)"
post "{\"op\":\"authPoll\",\"nonce\":\"$NONCE_A\"}" "$TOK_A"
chk "자기 기기 논스 폴링은 200 이다" "$CODE" "200"
chk "미완 논스는 pending:true 다" "$(jget "$BODY" pending)" "true"

# ── authPoll 완료 경로 — 병합 + 계정 토큰 발급 ────────────────────────────
# authStart 가 auth-disabled 라 브라우저 왕복을 못 만든다. 구글이 채운 논스를 DB 에
# 직접 심어 "완료된 논스로 폴링" 상태를 재현한다.
BAL_A_BEFORE=$(post '{"op":"get"}' "$TOK_A"; jget2 "$BODY" state balance)
NONCE_A2="dispatcher-nonce-done-a-$RANDOM"
dbexec "insert into auth_nonce (nonce, device_id, google_sub, created_at, used) values ('$NONCE_A2', '$DEV_A', 'gsub-dispatch-1', '$NOW_ISO', 0)"
post "{\"op\":\"authPoll\",\"nonce\":\"$NONCE_A2\"}" "$TOK_A"
chk "완료된 논스 폴링은 200 이다" "$CODE" "200"
chk "완료된 논스는 pending:false 다" "$(jget "$BODY" pending)" "false"
chk "첫 병합은 버린 것이 없다" "$(jget "$BODY" discarded)" "0"
chk "첫 병합에서 잔량이 그대로다" "$(jget2 "$BODY" state balance)" "$BAL_A_BEFORE"
chk "계정에 google_sub 이 박혔다" "$(dbq "select google_sub from accounts where id='$ACCT_A'")" "gsub-dispatch-1"
ACCT_TOK=$(jget "$BODY" token)
[ "$ACCT_TOK" != "<none>" ] && [ -n "$ACCT_TOK" ] && ok_ || bad_ "authPoll 이 계정 토큰을 안 줬다"
# 발급된 것이 계정 토큰(a:)인지 — 기기 토큰을 그대로 돌려주면 로그인이 기기에 계속 묶인다.
chk "발급된 토큰의 주체는 a:<계정id> 다" \
    "$(php -r 'require $argv[1]; $s = w_token_read($argv[2], $argv[3]); echo $s ? $s["type"] . ":" . $s["id"] : "<bad>";' \
        "$DOCROOT/wallet-lib.php" "$DATA" "$ACCT_TOK")" "acct:$ACCT_A"

# 논스는 단회용이다 — 안 태우면 같은 논스로 병합을 계속 다시 돌릴 수 있다.
post "{\"op\":\"authPoll\",\"nonce\":\"$NONCE_A2\"}" "$TOK_A"
chk "쓴 논스로 다시 폴링하면 401 이다" "$CODE" "401"

# 계정 토큰이 공용 인증 게이트를 통과한다(이 태스크가 문을 넓힌 지점)
post '{"op":"get"}' "$ACCT_TOK"
chk "계정 토큰으로 get 이 200 이다" "$CODE" "200"
chk "계정 토큰 get 잔량이 같은 계정을 본다" "$(jget2 "$BODY" state balance)" "$BAL_A_BEFORE"

# …그러나 authStart·authPoll 은 여전히 기기 토큰 전용이다. 게이트가 넓어진 순간
# 이 두 op 가 조용히 계정 토큰을 받기 시작한다(그러면 논스가 남의 기기 이름으로 발급된다).
# 가드를 지우면 authStart 는 200 auth-disabled, authPoll 은 200 pending 이 되어 아래가 빨개진다.
post '{"op":"authStart"}' "$ACCT_TOK"
chk "계정 토큰 authStart 는 401 이다 — 논스는 기기의 것이다" "$CODE" "401"
chk "계정 토큰 authStart 401 의 사유" "$(jget "$BODY" reason)" "unauthorized"
NONCE_A3="dispatcher-nonce-guard-a-$RANDOM"
dbexec "insert into auth_nonce (nonce, device_id, google_sub, created_at, used) values ('$NONCE_A3', '$DEV_A', null, '$NOW_ISO', 0)"
post "{\"op\":\"authPoll\",\"nonce\":\"$NONCE_A3\"}" "$ACCT_TOK"
chk "계정 토큰 authPoll 은 401 이다" "$CODE" "401"
chk "계정 토큰 authPoll 401 의 사유" "$(jget "$BODY" reason)" "unauthorized"

# 두 번째 기기(B)가 같은 구글로 들어온다 — 익명 잔량은 버려지고 A 의 잔량은 그대로다.
BAL_B_BEFORE=$(post '{"op":"get"}' "$TOK_B"; jget2 "$BODY" state balance)
NONCE_B2="dispatcher-nonce-done-b-$RANDOM"
dbexec "insert into auth_nonce (nonce, device_id, google_sub, created_at, used) values ('$NONCE_B2', '$DEV_B', 'gsub-dispatch-1', '$NOW_ISO', 0)"
post "{\"op\":\"authPoll\",\"nonce\":\"$NONCE_B2\"}" "$TOK_B"
chk "두 번째 기기 폴링도 200 이다" "$CODE" "200"
chk "두 번째 기기의 익명 잔량은 버려진다" "$(jget "$BODY" discarded)" "$BAL_B_BEFORE"
chk "두 번째 기기가 받은 상태는 구글 계정의 잔량이다 — 합치지 않는다" "$(jget2 "$BODY" state balance)" "$BAL_A_BEFORE"
chk "B 계정의 원장 합이 0 이다 — 캐시만 내리지 않았다" \
    "$(dbq "select coalesce(sum(delta),0) from ledger where account_id='$ACCT_B'")" "0"
chk "구글 계정으로 된 행은 하나뿐이다" "$(dbq "select count(*) from accounts where google_sub='gsub-dispatch-1'")" "1"

# 넘긴 기기 계정은 더 못 번다 — 기기 토큰이 365일 살아 있으므로, 안 막으면 구글 지갑과
# 나란히 도는 익명 지갑이 매일 1개씩 쌓인다(기기를 늘릴수록 수입원이 늘어난다).
# 어제 출석한 것으로 되돌려 "오늘 출석 가능" 상태를 만든 뒤에도 거절되어야 한다.
YESTERDAY=$(php -r 'echo gmdate("Y-m-d", time() - 86400);')
dbexec "update accounts set last_checkin = '$YESTERDAY' where id='$ACCT_B'"
post '{"op":"get"}' "$TOK_B"
chk "넘긴 기기 계정은 출석 버튼을 그리지 않는다" "$(jget2 "$BODY" state canCheckin)" "false"
post '{"op":"checkin"}' "$TOK_B"
chk "넘긴 기기 계정의 출석은 200 이되 지급이 없다" "$CODE" "200"
chk "넘긴 기기 계정의 출석 사유" "$(jget "$BODY" reason)" "merged"
chk "넘긴 기기 계정에 스쿱이 지급되지 않았다" "$(jget "$BODY" granted)" "0"
chk "넘긴 기기 계정의 원장 합은 여전히 0 이다" \
    "$(dbq "select coalesce(sum(delta),0) from ledger where account_id='$ACCT_B'")" "0"
chk "구글 계정 잔량도 그대로다" "$(dbq "select coalesce(sum(delta),0) from ledger where account_id='$ACCT_A'")" "$BAL_A_BEFORE"

# 이미 구글 A 에 묶인 기기에서 다른 구글로 로그인 — 계정을 빼앗기지 않는다.
NONCE_A4="dispatcher-nonce-other-a-$RANDOM"
dbexec "insert into auth_nonce (nonce, device_id, google_sub, created_at, used) values ('$NONCE_A4', '$DEV_A', 'gsub-dispatch-2', '$NOW_ISO', 0)"
post "{\"op\":\"authPoll\",\"nonce\":\"$NONCE_A4\"}" "$TOK_A"
chk "다른 구글로는 기기 계정을 못 가져간다 — 409" "$CODE" "409"
chk "그 409 의 사유" "$(jget "$BODY" reason)" "device-claimed"
chk "google_sub 이 덮이지 않았다" "$(dbq "select google_sub from accounts where id='$ACCT_A'")" "gsub-dispatch-1"

# ── wallet-auth.php — 로그인의 브라우저 구간(리다이렉트 + 콜백) ──────────────────────
# 구글에는 요청하지 않는다. 302 는 브라우저더러 구글로 가라는 헤더일 뿐 서버가 구글을
# 부르지 않고, 토큰 교환(진짜 구글 요청)은 state 검증을 통과해야만 실행되므로 아래
# "모르는 state" 검사들도 그 앞에서 400 으로 끊긴다 — 실제 네트워크 호출은 없다.
auth_get() {
  # $1=쿼리스트링(없으면 빈 문자열). CODE/BODY 를 채우고 본문을 경로유출 검사망($BODIES)에 넣는다.
  local qs="$1"
  CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' "$BASE/wallet-auth.php${qs:+?$qs}")
  BODY=$(cat "$WORK/out")
  printf '%s\n' "$BODY" >> "$BODIES"
}

# 설정 파일이 없는 상태(이 하네스의 DOCROOT 에는 아직 forge_google_oauth.json 이 없다 —
# 지금 프로덕션과 같은 상태)의 동작만 먼저 본다.
auth_get "nonce=whatever"
chk "설정 없으면 wallet-auth 는 503 이다" "$CODE" "503"
chk_no "설정 없음 503 본문에 경로가 안 샌다" "$BODY" "$DOCROOT"

auth_get ""
chk "논스도 code&state 도 없이 열면 400 이다(설정 여부와 무관 — 요청 모양부터 본다)" "$CODE" "400"
chk_no "논스 없음 400 본문에 경로가 안 샌다" "$BODY" "$DOCROOT"

auth_get "code=x&state=y"
chk "설정 없으면 콜백(code&state)도 503 이다" "$CODE" "503"

# ── 설정이 있는 상태 — 가짜 client_id/secret 을 심는다. ①(nonce) 경로는 구글에
# 아무 것도 안 보내고 Location 헤더만 만들므로 안전하다. ②(콜백) 경로는 state 검증을
# 통과해야 curl 이 실행되므로, 아래에서는 항상 모르는 state 를 줘서 그 앞에서 끊는다.
cat > "$DOCROOT/forge_google_oauth.json" <<'EOF'
{"client_id":"dispatcher-fake-client-id","client_secret":"dispatcher-fake-secret"}
EOF

auth_get "nonce=no-such-nonce"
chk "설정이 있어도 모르는 논스는 400 이다 — w_nonce_read 가 state 를 맹신하지 않고 먼저 걸러야 한다" "$CODE" "400"
chk_no "모르는 논스 400 본문에 경로가 안 샌다" "$BODY" "$DOCROOT"

NOW_ISO3=$(php -r 'echo gmdate("c");')
AUTH_NONCE="dispatcher-authpage-nonce-$RANDOM"
dbexec "insert into auth_nonce (nonce, device_id, google_sub, created_at, used) values ('$AUTH_NONCE', '$DEV_A', null, '$NOW_ISO3', 0)"
HDRS=$(curl -s -D - -o "$WORK/out" "$BASE/wallet-auth.php?nonce=$AUTH_NONCE")
LOC=$(printf '%s' "$HDRS" | grep -i '^location:' | tr -d '\r')
case "$LOC" in
  *"https://accounts.google.com/o/oauth2/v2/auth?"*"state=$AUTH_NONCE"*) ok_ ;;
  *) bad_ "유효한 논스가 구글 로그인 화면으로 리다이렉트되지 않는다 — got '$LOC'" ;;
esac

auth_get "code=fake-code&state=no-such-nonce"
chk "콜백도 모르는 state 는 400 이다 — 토큰 교환(진짜 구글 요청) 전에 걸러야 한다" "$CODE" "400"
chk_no "모르는 state 400 본문에 경로가 안 샌다" "$BODY" "$DOCROOT"

# 이미 완료된(google_sub 있음) 논스로 콜백을 다시 연다 — 태우기는 authPoll 이 병합
# 뒤에만 하므로 w_nonce_read 는 이 행을 여전히 "산" 것으로 돌려준다. 여기서 다시
# 걸러 두지 않으면(가드가 curl_init 전에 있어야) 같은 state 를 반복 재생(뒤로가기·
# URL 재사용)할 때마다 진짜 토큰 교환 요청을 또 만든다 — 인증 없는 공개 파일의
# 남용 표면. 응답이 400 으로 즉시 끝나는 것 자체가 curl_init 에 닿지 않았다는
# 증거다(닿았다면 구글이 실재하는 호스트라 12초 타임아웃 안에서 다른 모양의
# 실패거나 훨씬 느리게 끝난다).
NOW_ISO4=$(php -r 'echo gmdate("c");')
DONE_NONCE="dispatcher-authpage-done-$RANDOM"
dbexec "insert into auth_nonce (nonce, device_id, google_sub, created_at, used) values ('$DONE_NONCE', '$DEV_A', 'gsub-already-done', '$NOW_ISO4', 0)"
auth_get "code=fake-code&state=$DONE_NONCE"
chk "이미 완료된 논스로 콜백을 다시 열면 400 이다 — 토큰 교환을 또 만들지 않는다" "$CODE" "400"
chk_no "완료된 논스 재생 400 본문에 경로가 안 샌다" "$BODY" "$DOCROOT"
chk "완료된 논스를 재생해도 기록된 sub 은 그대로다 — 재생이 값을 바꾸지 않는다" \
    "$(dbq "select google_sub from auth_nonce where nonce='$DONE_NONCE'")" "gsub-already-done"

rm -f "$DOCROOT/forge_google_oauth.json"

# ini_set(display_errors,0) 이 첫 출력보다 먼저 와야 한다 — wallet-api.php 와 같은 이유.
AUTH_INI_LINE=$(grep -n 'ini_set("display_errors", *"0")' "$DOCROOT/wallet-auth.php" | head -1 | cut -d: -f1)
AUTH_HDR_LINE=$(grep -n '^\s*header(' "$DOCROOT/wallet-auth.php" | head -1 | cut -d: -f1)
if [ -n "$AUTH_INI_LINE" ] && [ -n "$AUTH_HDR_LINE" ] && [ "$AUTH_INI_LINE" -lt "$AUTH_HDR_LINE" ]; then ok_
else bad_ "wallet-auth.php 가 첫 출력 전에 display_errors 를 끄지 않는다"; fi

# ── wallet-api.php — adConfig / adState (8d 광고 무중단 스위치) ────────────────────
# ad_units.json 이 없는 상태 — 지금 프로덕션과 같다. 유닛 ID 는 저장소에 없다(넣으면 남이
# 우리 계정으로 광고를 띄운다). 광고 없음은 오류가 아니다 — 200 으로 화면이 광고 줄을 숨긴다.
AD_UNITS="$DATA/ad_units.json"
post '{"op":"adConfig"}' "$TOK_A"
chk "설정 없으면 adConfig 는 ads-disabled 다" "$(jget "$BODY" reason)" "ads-disabled"
chk "그래도 200 이다 — 광고 없음은 오류가 아니다" "$CODE" "200"

CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' -X POST -H "Content-Type: application/json" \
            --data '{"op":"adConfig"}' "$BASE/wallet-api.php")
chk "토큰 없는 adConfig 는 401 이다" "$CODE" "401"
CODE=$(curl -s -o "$WORK/out" -w '%{http_code}' -X POST -H "Content-Type: application/json" \
            --data '{"op":"adState"}' "$BASE/wallet-api.php")
chk "토큰 없는 adState 도 401 이다" "$CODE" "401"

post '{"op":"adConfig"}' "garbage.token.here"
chk "위조 토큰의 adConfig 는 401 이다" "$CODE" "401"
post '{"op":"adState"}' "garbage.token.here"
chk "위조 토큰의 adState 도 401 이다" "$CODE" "401"

# 서명은 유효하지만 exp 가 지난 토큰 — "garbage" 류와 달리 서명 검증 자체를 통과한 뒤
# exp<time() 분기를 실제로 태운다(wallet.test.php 의 같은 이름 검사와 같은 이유).
TOK_EXP=$(php -r '
  require $argv[1];
  $d = $argv[2];
  $exp = time() - 10;
  $subject = "d:" . $argv[3];
  $sig = _wb64e(hash_hmac("sha256", $subject . "|" . $exp, w_secret($d), true));
  echo _wb64e($subject) . "|" . $exp . "|" . $sig;
' "$DOCROOT/wallet-lib.php" "$DATA" "$DEV_A")
post '{"op":"adConfig"}' "$TOK_EXP"
chk "만료된(서명은 유효한) 토큰의 adConfig 는 401 이다" "$CODE" "401"
post '{"op":"adState"}' "$TOK_EXP"
chk "만료된(서명은 유효한) 토큰의 adState 도 401 이다" "$CODE" "401"

# 설정이 없어도 adState 는 동작한다 — "남은 횟수"는 유닛 설정과 무관하다.
AD_DAILY=$(php -r 'require $argv[1]; echo W_AD_DAILY;' "$DOCROOT/wallet-lib.php")
post '{"op":"adState"}' "$TOK_A"
chk "설정 없어도 adState 는 200 이다" "$CODE" "200"
chk "아직 광고를 안 본 계정의 남은 횟수는 상한과 같다" "$(jget "$BODY" remaining)" "$AD_DAILY"
chk "아직 광고를 안 본 계정의 nextAt 은 null 이다" "$(jget "$BODY" nextAt)" "null"

# ── adState — 병합돼 얼어붙은 계정 ──────────────────────────────────────────
# ACCT_B 는 위 authPoll 절에서 이미 구글 계정(A)에 병합돼 버려졌다(merge_discard). w_ad_grant
# 는 이미 그런 계정의 SSV 콜백을 거절하고 ad_grants 에 기록도 남기지 않으므로, "오늘 지급된
# 횟수"만 세는 셈법은 병합 직후엔 여전히 상한 전체를 "남았다"고 보고한다 — 화면이 그걸 믿고
# 광고 버튼을 켜 두면 사용자는 광고를 끝까지 보고도 매번 보상을 못 받는다. 그래서 이 계정은
# remaining:0·nextAt:null 을 못박는다(w_ad_state 의 설계 결정).
post '{"op":"adState"}' "$TOK_B"
chk "병합돼 버려진 계정의 adState 는 200 이다 — 존재 자체를 숨기지 않는다" "$CODE" "200"
chk "병합돼 버려진 계정은 남은 횟수를 0 으로 본다 — 8을 보이면 광고를 봐도 보상이 안 온다" \
    "$(jget "$BODY" remaining)" "0"
chk "병합돼 버려진 계정의 nextAt 도 null 이다 — 다시 열릴 시점이 없다" "$(jget "$BODY" nextAt)" "null"

# ── adState — 일 상한 경계(하나 남았을 때 · 정확히 닿았을 때 · 넘겼을 때) ─────────────
# 실제 SSV 서명 왕복 없이 ad_grants 를 직접 채운다 — 이 검사가 보는 것은 w_ad_count_today
# 의 today 경계 계산이지 서명 검증이 아니다(그건 아래 SSV 절이 따로 두드린다).
ip_cap_reset
DEV_E="dev-adstate-e-0123456789abcdef0123456789abcdef"
post "{\"op\":\"hello\",\"deviceId\":\"$DEV_E\"}"
TOK_E=$(jget "$BODY" token)
ACCT_E=$(php -r 'echo substr(sha1($argv[1]), 0, 16);' "$DEV_E")
chk "adState 상한 경계용 새 계정이 만들어졌다" "$(jget2 "$BODY" state balance)" "5"

NOW_ISO_AD=$(php -r 'echo gmdate("c");')
i=0
while [ "$i" -lt "$((AD_DAILY - 1))" ]; do
  i=$((i + 1))
  dbexec "insert into ad_grants (transaction_id, account_id, unit, amount, granted, created_at)
          values ('adstate-fill-$i', '$ACCT_E', 'quick', 1, 1, '$NOW_ISO_AD')"
done
post '{"op":"adState"}' "$TOK_E"
chk "상한보다 하나 남았을 때 remaining 이 1 이다" "$(jget "$BODY" remaining)" "1"

dbexec "insert into ad_grants (transaction_id, account_id, unit, amount, granted, created_at)
        values ('adstate-fill-cap', '$ACCT_E', 'quick', 1, 1, '$NOW_ISO_AD')"
post '{"op":"adState"}' "$TOK_E"
chk "상한에 정확히 닿으면 remaining 이 0 이다" "$(jget "$BODY" remaining)" "0"

dbexec "insert into ad_grants (transaction_id, account_id, unit, amount, granted, created_at)
        values ('adstate-fill-over', '$ACCT_E', 'quick', 1, 1, '$NOW_ISO_AD')"
post '{"op":"adState"}' "$TOK_E"
chk "상한을 넘겨도 remaining 이 음수가 아니라 0 이다" "$(jget "$BODY" remaining)" "0"

# ── adConfig — 설정 파일이 있을 때(정상 · 각종 고장 모양) ───────────────────────
: > "$AD_UNITS"
post '{"op":"adConfig"}' "$TOK_A"
chk "빈 파일도 ads-disabled 다" "$(jget "$BODY" reason)" "ads-disabled"

printf '{"quick":' > "$AD_UNITS"
post '{"op":"adConfig"}' "$TOK_A"
chk "깨진 JSON 도 ads-disabled 다" "$(jget "$BODY" reason)" "ads-disabled"

cat > "$AD_UNITS" <<'JSON'
{"quick":{"unitId":"ca-app-pub-3940256099942544/5354046379","reward":1}}
JSON
post '{"op":"adConfig"}' "$TOK_A"
chk "full 유닛이 없으면 ads-disabled 다" "$(jget "$BODY" reason)" "ads-disabled"

cat > "$AD_UNITS" <<'JSON'
{"quick":{"unitId":12345,"reward":1},
 "full":{"unitId":"ca-app-pub-3940256099942544/5224354917","reward":3}}
JSON
post '{"op":"adConfig"}' "$TOK_A"
chk "유닛 ID 가 문자열이 아니면 ads-disabled 다" "$(jget "$BODY" reason)" "ads-disabled"

cat > "$AD_UNITS" <<'JSON'
{"quick":{"unitId":"","reward":1},
 "full":{"unitId":"ca-app-pub-3940256099942544/5224354917","reward":3}}
JSON
post '{"op":"adConfig"}' "$TOK_A"
chk "유닛 ID 가 빈 문자열이면 ads-disabled 다" "$(jget "$BODY" reason)" "ads-disabled"

cat > "$AD_UNITS" <<'JSON'
{"quick":{"unitId":"ca-app-pub-3940256099942544/5354046379","reward":1},
 "full":{"unitId":"ca-app-pub-3940256099942544/5224354917","reward":3}}
JSON
post '{"op":"adConfig"}' "$TOK_A"
chk "정상 설정은 ok 다" "$(jget "$BODY" ok)" "true"
chk_has "quick 유닛 ID 가 나온다" "$BODY" "5354046379"
chk_has "full 유닛 ID 가 나온다" "$BODY" "5224354917"

# custom_data 계약 — wallet-ssv.php 는 계정 id 모양(^[0-9a-f]{16}$)이 아닌 custom_data 를
# 조용히 버린다(로그도 재시도도 없다). adConfig 가 다른 모양(서명 블롭·복합키·acct:nonce·
# 대문자 hex·32자 id 등)을 내보내면 그 계정의 광고 보상이 전부 말없이 사라진다 — 그래서
# 이 값은 반드시 계정 id 그대로, 가공 없이 나가야 한다.
CD_A=$(jget "$BODY" customData)
chk "adConfig 의 customData 가 이 토큰의 계정 id 와 정확히 같다" "$CD_A" "$ACCT_A"
case "$CD_A" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ok_ ;;
  *) bad_ "customData($CD_A) 가 w_account_id 모양(소문자 16진 16자)이 아니다 — wallet-ssv.php 가 조용히 버린다" ;;
esac
[ "$CD_A" != "$ACCT_B" ] && ok_ || bad_ "adConfig 의 customData 가 다른 계정(B)의 id 를 새어 보냈다"

# 다른 계정 토큰으로 부르면 그 계정 자신의 id 가 나온다 — 남의 것을 보내지 않는다.
post '{"op":"adConfig"}' "$TOK_B"
chk "B 토큰의 adConfig customData 는 B 자신의 계정 id 다" "$(jget "$BODY" customData)" "$ACCT_B"

rm -f "$AD_UNITS"
post '{"op":"adConfig"}' "$TOK_A"
chk "설정을 지우면 다시 ads-disabled 다 — 무중단 스위치가 양방향이다" "$(jget "$BODY" reason)" "ads-disabled"

# ── wallet-ssv.php — AdMob 리워드 콜백(공개·무인증 GET) ────────────────────────
# 구글이 부르는 공개 엔드포인트다. 인증이 없는 것이 정상이고 서명만이 유일한 방어선이라,
# 여기 검사들은 전부 "이 문으로 잔량을 만들 수 있는가"를 실제 HTTP 로 두드린다.
# 절대 구글에 접속하지 않는다 — 위 php -S 줄이 W_SSV_KEYS_URL 을 닿을 수 없는 주소로
# 못박아 뒀고(지우지 말 것), 키는 아래에서 우리가 만든 테스트 키쌍을 캐시 파일에 꽂는다.
SSV_KEY="$WORK/ssv-priv.pem"
SSV_CACHE="$DATA/ssv_keys_cache.json"
php -r '
  $k = openssl_pkey_new(array("private_key_type" => OPENSSL_KEYTYPE_EC, "curve_name" => "prime256v1"));
  openssl_pkey_export($k, $pem);
  file_put_contents($argv[1], $pem);
  $d = openssl_pkey_get_details($k);
  file_put_contents($argv[2], json_encode(array("keys" => array(array("keyId" => "77", "pem" => $d["key"])))));
' "$SSV_KEY" "$SSV_CACHE"

# ssv_sign <서명대상> [key_id] → 전체 쿼리스트링(서명·key_id 를 뒤에 붙인다)
ssv_sign() { php -r '
    openssl_sign($argv[2], $sig, file_get_contents($argv[1]), OPENSSL_ALGO_SHA256);
    echo $argv[2] . "&signature=" . rtrim(strtr(base64_encode($sig), "+/", "-_"), "=") . "&key_id=" . $argv[3];
  ' "$SSV_KEY" "$1" "${2:-77}"; }
# ⚠ 쿼리스트링을 그대로 보낸다 — 서명은 바이트에 걸려 있어서 재조립하면 안 된다.
# -g(globoff) 는 curl 이 reward_amount[]=1 의 대괄호를 범위 글로브로 읽지 않게 한다.
ssv_get() {
  CODE=$(curl -sg -o "$WORK/out" -w '%{http_code}' "$BASE/wallet-ssv.php?$1")
  BODY=$(cat "$WORK/out")
  printf '%s\n' "$BODY" >> "$BODIES"
}
ssv_bal() { dbq "select coalesce(sum(delta),0) from ledger where account_id='$1'"; }
TS=$(php -r 'echo time() * 1000;')

# 서명 없는 콜백 — 이 문이 열려 있으면 잔량이 무한이 된다
BAL_BEFORE=$(ssv_bal "$ACCT_A")
ssv_get "custom_data=$ACCT_A&reward_amount=999&transaction_id=forged-1"
chk "서명 없는 SSV 는 200 이다(구글 재시도 방지)" "$CODE" "200"
chk "서명 없는 SSV 가 잔량을 올리지 않았다" "$(ssv_bal "$ACCT_A")" "$BAL_BEFORE"
chk "SSV 응답 본문이 비어 있다" "$BODY" ""

# 공개 엔드포인트다 — 경로도 계정 존재 여부도 흘리면 안 된다
ssv_get "custom_data=nobody&transaction_id=x"
chk "모르는 계정도 200 이다" "$CODE" "200"
chk "모르는 계정의 본문도 비어 있다 — 존재 여부가 구별되면 계정 열거 도구가 된다" "$BODY" ""
chk_no "본문에 경로가 없다" "$BODY" "$DOCROOT"

# 정상 콜백 — 이게 통하지 않으면 기능이 통째로 죽는다
Q=$(ssv_sign "ad_network=5450213213286189855&ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&reward_item=Scoops&timestamp=$TS&transaction_id=ssv-ok-1&user_id=$ACCT_A")
ssv_get "$Q"
chk "정상 서명 콜백은 200 이다" "$CODE" "200"
chk "정상 콜백 본문도 비어 있다" "$BODY" ""
chk "정상 콜백이 1개를 적립했다" "$(ssv_bal "$ACCT_A")" "$((BAL_BEFORE + 1))"
chk "ad_grants 에 실제로 넣은 값이 남았다" "$(dbq "select granted from ad_grants where transaction_id='ssv-ok-1'")" "1"
chk "원장 이유가 ad 다" "$(dbq "select count(*) from ledger where idem='ad:ssv-ok-1' and reason='ad'")" "1"
chk "캐시와 원장이 같다" "$(dbq "select balance from accounts where id='$ACCT_A'")" "$(ssv_bal "$ACCT_A")"

# 재생 — 구글은 재시도한다. 같은 transaction_id 는 두 번 적립되면 안 된다.
BAL_NOW=$(ssv_bal "$ACCT_A")
ssv_get "$Q"
chk "재생도 200 이다" "$CODE" "200"
chk "재생이 두 번 적립하지 않았다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
chk "ad_grants 행도 하나뿐이다" "$(dbq "select count(*) from ad_grants where transaction_id='ssv-ok-1'")" "1"

# ── 서명 범위 밖의 값 — w_ssv_verify 는 "그 필드가 서명돼 있었다"를 보증하지 않는다 ──────
# 서명 범위에 없는 필드를 $_GET 에서 읽으면, 공격자가 custom_data(=지급 대상 계정)와
# reward_amount(=금액)를 서명 없이 자기 마음대로 붙일 수 있다. 리뷰어가 실제로 verify=true 를
# 받아낸 경로다 — 서명 범위를 따로 파싱해 필수 필드가 그 "안"에 있는지 봐야 막힌다.
BAL_NOW=$(ssv_bal "$ACCT_A")
Q=$(ssv_sign "ad_unit=quick&reward_amount=1&timestamp=$TS&transaction_id=ssv-nocd-1")
ssv_get "$Q&custom_data=$ACCT_A"
chk "custom_data 가 서명 밖에만 있으면 200 이다" "$CODE" "200"
chk "custom_data 가 서명 밖에만 있으면 적립하지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
chk "그 콜백은 기록도 남기지 않는다" "$(dbq "select count(*) from ad_grants where transaction_id='ssv-nocd-1'")" "0"

Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&timestamp=$TS&transaction_id=ssv-noamt-1")
ssv_get "$Q&reward_amount=999"
chk "reward_amount 가 서명 밖에만 있으면 200 이다" "$CODE" "200"
chk "reward_amount 가 서명 밖에만 있으면 적립하지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"

# 정품 콜백 뒤에 같은 키를 덧붙여 값을 덮는 수법(parse_str 은 마지막이 이긴다)
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$TS&transaction_id=ssv-dup-1")
ssv_get "$Q&reward_amount=999"
chk "덧붙여 덮어쓴 콜백은 200 이다" "$CODE" "200"
chk "덧붙여 덮어쓴 콜백이 적립하지 않았다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"

# 서명 범위 안에 있어도 배열이면 값이 아니다. preg_match·strlen·ctype_digit 에 배열이 닿으면
# TypeError 로 500 이 나는데, 500 은 구글이 재시도하는 실패라 위조 폭주가 그대로 재시도
# 폭주가 된다 — 필수 필드는 "있는가"만이 아니라 "문자열인가"까지 봐야 한다.
#
# ⚠ 배열을 **스칼라와 나란히** 두면(custom_data=A&custom_data[]=x) 페어 6·키 5 가 되어 아래
# 중복 개수 게이트가 먼저 거절한다 — is_string 가드에는 닿지도 못한다. 즉 그 모양으로 쓰면
# 이 검사는 자기 주석이 말하는 것을 더 이상 검사하지 않는다(리뷰 실측: is_string 을 지워도
# 이 셋이 전부 초록이었다). 그래서 **스칼라 없는 단독 배열**로 만든다 — 페어 5·키 5 라
# 개수 게이트를 통과해 실제로 is_string 앞에 선다.
# (ad_unit 은 라벨일 뿐이라 배열이면 빈 값으로 떨어뜨리고 지급은 계속한다 — 여기 넣지 않는다.)
for FLD in custom_data transaction_id reward_amount timestamp; do
  CD="custom_data=$ACCT_A"; AMT="reward_amount=1"; TSF="timestamp=$TS"; TX="transaction_id=ssv-arrsolo-$FLD"
  case "$FLD" in
    custom_data)    CD="custom_data[]=x" ;;
    reward_amount)  AMT="reward_amount[]=x" ;;
    timestamp)      TSF="timestamp[]=x" ;;
    transaction_id) TX="transaction_id[]=x" ;;
  esac
  Q=$(ssv_sign "ad_unit=quick&$CD&$AMT&$TSF&$TX")
  ssv_get "$Q"
  chk "단독 배열 $FLD 는 200 이다(500 이면 재시도 폭주다)" "$CODE" "200"
  chk "단독 배열 $FLD 일 때 본문이 비어 있다" "$BODY" ""
  chk "단독 배열 $FLD 는 적립하지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
done
# 스칼라와 배열을 나란히 둔 모양도 물론 막혀야 한다 — 다만 그건 개수 게이트가 잡는다
# (페어 6·키 5). 위 단독 배열과 여기가 서로 다른 문을 지킨다는 사실 자체를 남겨 둔다.
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$TS&transaction_id=ssv-arrdup&custom_data[]=x")
ssv_get "$Q"
chk "스칼라 옆의 배열은 개수 게이트가 잡는다 — 200 이고 적립 없음" "$CODE" "200"
chk "스칼라 옆의 배열이 적립하지 않았다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"

# 서명 범위 "안"의 중복 키. parse_str 은 마지막 값을 취하고, w_ssv_params_faithful 은 똑같이
# 접힌 두 파싱본을 비교하므로 중복은 양쪽 모두에게 보이지 않는다 — 서명된 문장 안에서 값이
# 조용히 바뀐다(리뷰 실측: reward_amount=1&…&reward_amount=9 가 9 를 지급했다).
# AdMob 이 값을 퍼센트 인코딩하는지는 구글에 물어볼 수 없으므로(접속 금지), 답과 무관하게 닫는다.
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$TS&transaction_id=ssv-dupsigned&reward_amount=9")
ssv_get "$Q"
chk "서명 안에 중복 키가 있으면 200 이다" "$CODE" "200"
chk "서명 안 중복 키는 적립하지 않는다 — 서명된 문장 안에서 값이 밀반입된다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
chk "서명 안 중복 키의 기록도 없다" "$(dbq "select count(*) from ad_grants where transaction_id='ssv-dupsigned'")" "0"
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_B&reward_amount=1&timestamp=$TS&transaction_id=ssv-dupcd&custom_data=$ACCT_A")
ssv_get "$Q"
chk "서명 안에서 custom_data 를 바꿔치기해도 적립하지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"

# ⚠ 바이트가 같은 중복만 막으면 절반이다. parse_str 은 여러 "철자"를 같은 키로 접는다 —
# %5F→_ · .→_ · +→_(공백을 거쳐) · %72→r. 바이트 비교는 그 접힘을 보지 못하므로, 공격자가
# 철자만 바꾸면 금액 부풀리기도 지급 대상 바꿔치기도 그대로 살아난다(리뷰 실측: 전부 9 지급).
# 이 검사들이 "우리 게이트가 parse_str 과 같은 눈을 갖고 있는가"를 묻는다.
i=0
for SPELL in "reward%5Famount=9" "reward.amount=9" "reward+amount=9" "%72eward_amount=9"; do
  i=$((i + 1))
  Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$TS&transaction_id=ssv-spell-$i&$SPELL")
  ssv_get "$Q"
  chk "철자만 바꾼 중복($SPELL)은 200 이다" "$CODE" "200"
  chk "철자만 바꾼 중복($SPELL)으로 금액이 부풀지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
  chk "철자만 바꾼 중복($SPELL)의 기록도 없다" "$(dbq "select count(*) from ad_grants where transaction_id='ssv-spell-$i'")" "0"
done
i=0
for SPELL in "custom%5Fdata=$ACCT_A" "custom.data=$ACCT_A" "custom+data=$ACCT_A"; do
  i=$((i + 1))
  Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_B&reward_amount=1&timestamp=$TS&transaction_id=ssv-spellcd-$i&$SPELL")
  ssv_get "$Q"
  chk "철자만 바꿔 지급 대상을 갈아치워도($SPELL) 적립되지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
done

# 반대 방향 — 정상 콜백을 잘못 막으면 기능이 조용히 죽는다(구글은 200 을 받고 재시도하지 않는다).
# parse_str 이 무시하는 빈 페어와, 값 없는 키는 중복이 아니다.
#
# ⚠ 지급되는 검사는 **케이스마다 새 계정**을 쓴다. 한 계정에 쌓으면 일 상한(8)이 다가오면서
# "지급됐는가"가 게이트 때문인지 상한 때문인지 갈리지 않게 된다 — 이 파일에서 이미 두 번
# 당한 함정이다(쓰레기 금액 9종, 상한을 다 쓴 계정으로 잰 503). 시드 5 를 먼저 확인해
# 계정이 실제로 만들어졌음을 못박고, 지급 후 6 을 본다.
ssv_new_acct() {   # $1 = 이름표 → 계정 id
  local dev="dev-$1-0123456789abcdef0123456789abcdef"
  ip_cap_reset
  post "{\"op\":\"hello\",\"deviceId\":\"$dev\"}"
  php -r 'echo substr(sha1($argv[1]), 0, 16);' "$dev"
}
for CASE in "empty1:&&reward_amount=1&timestamp=$TS" \
            "empty2:&&reward_amount=1&&timestamp=$TS" \
            "valueless:&extra&reward_amount=1&timestamp=$TS"; do
  NAME="${CASE%%:*}"; TAIL="${CASE#*:}"
  A=$(ssv_new_acct "$NAME")
  chk "$NAME 용 새 계정이 시드 5 를 받았다" "$(ssv_bal "$A")" "5"
  Q=$(ssv_sign "ad_unit=quick&custom_data=$A$TAIL&transaction_id=ssv-$NAME")
  ssv_get "$Q"
  chk "$NAME 모양은 정상 지급된다 — 과잉 차단은 보상을 조용히 없앤다" "$(ssv_bal "$A")" "6"
  chk "$NAME 지급이 실제로 기록됐다" "$(dbq "select granted from ad_grants where transaction_id='ssv-$NAME'")" "1"
done

# custom_data 는 계정 id 다 — 모양이 정확히 정해져 있다(sha1 앞 16자, 소문자 16진).
# ⚠ 이 검사들이 "모양 가드가 살아 있다"를 증명하지는 못한다. 계정 id 는 정의상 전부 hex16 이라
# 모양이 틀린 값은 가드가 없어도 어차피 "그런 계정 없음"으로 떨어진다 — 행동으로 관찰할 수
# 없는 가드다. 그래서 여기서는 "어떤 모양이든 적립되지 않는다"만 보고, 가드의 존재 자체는
# 아래 소스 모양 검사로 못박는다(w_db 의 mkdir 가드와 같은 취급).
for CD in "ZZZZZZZZZZZZZZZZ" "ABCDEF0123456789" "0123456789abcde" "0123456789abcdef0" "../../etc/passwd"; do
  Q=$(ssv_sign "ad_unit=quick&custom_data=$CD&reward_amount=1&timestamp=$TS&transaction_id=ssv-cd-$(printf '%s' "$CD" | cksum | cut -d' ' -f1)")
  ssv_get "$Q"
  chk "계정 id 모양이 아닌 custom_data($CD)는 200 이다" "$CODE" "200"
  chk "계정 id 모양이 아닌 custom_data($CD)로 적립되지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
done

# 재인코딩(%2D) — parse_str 결과는 똑같지만 바이트가 다르다. 원본 쿼리스트링 대신
# http_build_query($_GET) 로 재조립하면 이 콜백이 통과한다(서명은 바이트에 걸려 있다).
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$TS&transaction_id=ssv-enc-1")
ssv_get "$(printf '%s' "$Q" | sed 's/transaction_id=ssv-enc-1/transaction_id=ssv%2Denc%2D1/')"
chk "재인코딩된 콜백은 200 이다" "$CODE" "200"
chk "재인코딩된 콜백은 적립하지 않는다 — 재조립하면 이 문이 열린다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
chk "재인코딩된 콜백의 기록도 없다" "$(dbq "select count(*) from ad_grants where transaction_id='ssv-enc-1'")" "0"

# ── 타임스탬프 — 서명이 유효해도 창 밖이면 재생 공격이다 ─────────────────────────
OLD_TS=$(php -r 'echo (time() - 7200) * 1000;')
FUT_TS=$(php -r 'echo (time() + 7200) * 1000;')
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$OLD_TS&transaction_id=ssv-old-1")
ssv_get "$Q"
chk "2시간 전 콜백은 200 이다" "$CODE" "200"
chk "2시간 전 콜백은 적립하지 않는다 — 서명은 영원히 유효하다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$FUT_TS&transaction_id=ssv-fut-1")
ssv_get "$Q"
chk "2시간 뒤 콜백도 적립하지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&transaction_id=ssv-nots-1")
ssv_get "$Q"
chk "timestamp 자체가 없으면 적립하지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"

# ── 금액이 쓰레기여도 죽지 않고 조용히 거절한다 ──────────────────────────────────
i=0
for AMT in "-5" "abc" "99999999999999999999" "1.5" ""; do
  i=$((i + 1))
  Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=$AMT&timestamp=$TS&transaction_id=ssv-amt-$i")
  ssv_get "$Q"
  chk "쓰레기 금액($AMT) 응답은 200 이다" "$CODE" "200"
  chk "쓰레기 금액($AMT) 응답 본문이 비어 있다" "$BODY" ""
  chk "쓰레기 금액($AMT)이 잔량을 흔들지 않았다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"
done
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount[]=1&timestamp=$TS&transaction_id=ssv-amt-arr")
ssv_get "$Q"
chk "배열 금액도 200 이다 — 캐스트 경고가 본문으로 새면 안 된다" "$CODE" "200"
chk "배열 금액 응답 본문이 비어 있다" "$BODY" ""
chk "배열 금액이 잔량을 흔들지 않았다" "$(ssv_bal "$ACCT_A")" "$BAL_NOW"

# ── 병합돼 얼어붙은 지갑은 광고로도 되살아나지 않는다 ────────────────────────────
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_B&reward_amount=1&timestamp=$TS&transaction_id=ssv-merged-1")
ssv_get "$Q"
chk "병합된 계정 콜백도 200 이다 — 존재 여부를 구별해 주지 않는다" "$CODE" "200"
chk "병합된 계정의 원장 합은 그대로 0 이다" "$(ssv_bal "$ACCT_B")" "0"
chk "병합된 계정 앞으로 시청 기록도 안 남는다" "$(dbq "select count(*) from ad_grants where transaction_id='ssv-merged-1'")" "0"

# ── 일 상한 — 엔드포인트가 실제로 상한에 연결돼 있는가 ───────────────────────────
DEV_D="dev-d-0123456789abcdef0123456789abcdef0123456789"
ACCT_D=$(php -r 'echo substr(sha1($argv[1]), 0, 16);' "$DEV_D")
ip_cap_reset
post "{\"op\":\"hello\",\"deviceId\":\"$DEV_D\"}"
chk "D 계정이 만들어졌다" "$(jget2 "$BODY" state balance)" "5"
CAP_N=$(php -r 'require $argv[1]; echo W_AD_DAILY;' "$DOCROOT/wallet-lib.php")
i=0
while [ "$i" -lt "$CAP_N" ]; do
  i=$((i + 1))
  Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_D&reward_amount=1&timestamp=$TS&transaction_id=ssv-cap-$i")
  ssv_get "$Q"
done
chk "일 상한만큼은 적립된다" "$(ssv_bal "$ACCT_D")" "$((5 + CAP_N))"
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_D&reward_amount=1&timestamp=$TS&transaction_id=ssv-cap-over")
ssv_get "$Q"
chk "상한 초과 콜백도 200 이다" "$CODE" "200"
chk "상한을 넘겨 적립되지 않았다" "$(ssv_bal "$ACCT_D")" "$((5 + CAP_N))"
chk "상한을 넘긴 콜백은 시청 기록도 남지 않는다 — 남기면 상한 계산이 스스로 부풀어 오른다" \
    "$(dbq "select count(*) from ad_grants where transaction_id='ssv-cap-over'")" "0"

# ── 재시도 가능한 두 이유만 503 이다. 그리고 503 은 절대 지급하지 않는다 ──────────
# 키 회전 지연과 엉터리 key_id 는 이 층에서 구별할 수 없다. 구글은 자기 콜백만 재시도하므로
# 공격자가 아무 key_id 나 뿌려도 얻는 것은 503 뿐이다 — 대신 진짜 콜백이 키 교체 창에서
# 영구히 버려지지 않는다(광고를 본 사용자가 조용히 보상을 잃는 쪽이 훨씬 나쁘다).
# ⚠ 대상은 일 상한에 걸리지 않은 계정(A)이어야 한다. 상한을 다 쓴 계정(D)으로 재면
# "503 이 지급하지 않았다"가 503 때문인지 상한 때문인지 갈리지 않는다 — 실제로 D 로 쟀을 때
# "503 경로에서 몰래 지급한다"는 개조가 이 검사를 통과했다(뮤테이션 실측).
BAL_A=$(ssv_bal "$ACCT_A")
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$TS&transaction_id=ssv-unknownkey" "9999")
ssv_get "$Q"
chk "모르는 key_id 는 503 이다(재시도 가능)" "$CODE" "503"
chk "그 503 의 본문도 비어 있다" "$BODY" ""
chk "503 은 지급하지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_A"
chk "503 은 시청 기록도 남기지 않는다 — 큐잉·선지급 금지" "$(dbq "select count(*) from ad_grants where transaction_id='ssv-unknownkey'")" "0"
chk "503 은 원장에도 손대지 않는다" "$(dbq "select count(*) from ledger where idem='ad:ssv-unknownkey'")" "0"

mv "$SSV_CACHE" "$SSV_CACHE.bak"
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$TS&transaction_id=ssv-nokeys")
ssv_get "$Q"
chk "키를 못 얻으면 503 이다 — 진짜 콜백을 위조로 버리지 않는다" "$CODE" "503"
chk "그 503 의 본문도 비어 있다" "$BODY" ""
chk "키를 못 얻은 503 도 지급하지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_A"
chk "키를 못 얻은 503 도 시청 기록을 남기지 않는다" "$(dbq "select count(*) from ad_grants where transaction_id='ssv-nokeys'")" "0"
mv "$SSV_CACHE.bak" "$SSV_CACHE"

# 서명이 틀린 것은 재시도해도 소용없다 — 200 으로 끝낸다(구글은 자기 콜백만 재시도한다).
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$TS&transaction_id=ssv-badsig")
ssv_get "$(printf '%s' "$Q" | sed 's/reward_amount=1/reward_amount=7/')"
chk "서명이 틀린 콜백은 200 이다 — 재시도시켜도 결과가 같다" "$CODE" "200"
chk "서명이 틀린 콜백은 적립하지 않는다" "$(ssv_bal "$ACCT_A")" "$BAL_A"

# 메서드 — 구글은 GET 으로 부른다. POST 로 와도 쿼리스트링 서명 규율은 같아야 한다.
PC=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/wallet-ssv.php?custom_data=$ACCT_A&reward_amount=9&transaction_id=ssv-post")
chk "서명 없는 POST 도 200 이다" "$PC" "200"
chk "서명 없는 POST 가 적립하지 않았다" "$(ssv_bal "$ACCT_A")" "$BAL_A"

# ── 지급이 "지금 못 한 것"이면 503 이다 — 이것이 재시도 분류의 나머지 절반이다 ──────────
# "503 은 지급하지 않는다"는 잘 덮여 있지만 그 반대 방향("지급 못 했으면 503 이어야 한다")은
# 검사가 없었다(리뷰 지적). 실패 시나리오: SQLite 경합으로 w_ad_grant 가 ok:false/busy 를
# 내는데 엔드포인트가 200 으로 답하면 → 구글은 재시도하지 않는다 → 광고를 본 사용자가
# 조용히 보상을 잃는다. 락 경합을 기다리는 대신(그쪽은 busy_timeout 만큼 느리다) 원장 표를
# 잠깐 치워 같은 부류(ok:false)를 즉시 만든다.
BAL_A2=$(ssv_bal "$ACCT_A")
dbexec "alter table ledger rename to ledger_hidden"
Q=$(ssv_sign "ad_unit=quick&custom_data=$ACCT_A&reward_amount=1&timestamp=$TS&transaction_id=ssv-busy")
ssv_get "$Q"
dbexec "alter table ledger_hidden rename to ledger"
chk "지급하지 못한 콜백은 503 이다 — 200 이면 구글이 재시도하지 않아 보상이 사라진다" "$CODE" "503"
chk "그 503 의 본문도 비어 있다" "$BODY" ""
chk "그 503 도 아무 것도 적립하지 않았다" "$(ssv_bal "$ACCT_A")" "$BAL_A2"
chk "그 503 은 시청 기록도 남기지 않았다" "$(dbq "select count(*) from ad_grants where transaction_id='ssv-busy'")" "0"
# 원장이 돌아온 뒤 같은 콜백이 다시 오면 이제는 지급돼야 한다(멱등키가 PK 라 재시도가 안전하다)
ssv_get "$Q"
chk "원장이 돌아온 뒤의 재시도는 200 이다" "$CODE" "200"
chk "재시도가 보상을 실제로 지급했다 — 503 은 '나중에 다시 오라'였다" "$(ssv_bal "$ACCT_A")" "$((BAL_A2 + 1))"

# custom_data 모양 가드는 행동으로 관찰할 수 없다(계정 id 는 전부 hex16 이라 모양이 틀리면
# 가드가 없어도 "계정 없음"으로 떨어진다). 그래서 소스 모양으로 못박는다 — 이 한 줄이 공개
# 엔드포인트가 받아들이는 계정 id 의 집합을 '정확히' 고정한다.
if grep -qE 'preg_match\([^)]*\^\[0-9a-f\]\{16\}\$' "$DOCROOT/wallet-ssv.php"; then ok_
else bad_ "wallet-ssv.php 가 custom_data 를 계정 id 모양(^[0-9a-f]{16}$)으로 못박지 않는다"; fi

# ── 이 관문이 스스로 눈멀지 않았는가 ────────────────────────────────────────────
# 위 검사 대부분이 ACCT_A 한 계정을 쓴다. "적립되지 않았다"류 검사는 계정이 일 상한이나
# 지갑 상한에 닿는 순간부터 **가드가 없어도 통과한다** — 검사는 초록인데 아무것도 안 지키는
# 상태가 된다. 이 파일에서 이미 두 번 겪었다(쓰레기 금액 9종을 한 계정에 몰아 9번째가 상한에
# 걸린 일 · 상한을 다 쓴 계정으로 잰 503 검사가 "몰래 지급" 뮤테이션을 통과시킨 일).
# 그래서 여유를 검사 자체로 못박는다 — 검사를 더 붙이다 여유가 마르면 여기서 먼저 빨개진다.
A_GRANTS=$(dbq "select count(*) from ad_grants where account_id='$ACCT_A'")
A_BAL=$(ssv_bal "$ACCT_A")
W_CAP_N=$(php -r 'require $argv[1]; echo W_CAP;' "$DOCROOT/wallet-lib.php")
if [ "$((CAP_N - A_GRANTS))" -ge 3 ]; then ok_
else bad_ "ACCT_A 의 일 상한 여유가 $((CAP_N - A_GRANTS))회뿐이다($A_GRANTS/$CAP_N) — 이 계정을 쓰는 '적립 안 됨' 검사들이 상한 때문에 통과하기 시작한다. 지급되는 검사는 새 계정(ssv_new_acct)으로 옮길 것"; fi
if [ "$((W_CAP_N - A_BAL))" -ge 3 ]; then ok_
else bad_ "ACCT_A 의 지갑 여유가 $((W_CAP_N - A_BAL))개뿐이다($A_BAL/$W_CAP_N) — 지갑 상한이 '적립 안 됨' 검사를 대신 통과시킨다"; fi

# 키 캐시·시도 표식은 웹루트 밖에 있어야 한다(원장과 같은 규율)
SSV_LEAK=$(find "$WORK/www" -name "ssv_keys_*" | head -3)
chk "웹루트 안에 SSV 키 캐시가 없다" "$SSV_LEAK" ""

# 위 공격 전부에서 PHP 진단이 한 줄도 나면 안 된다. 본문 검사만으로는 못 잡는다 —
# 엔드포인트가 display_errors 를 꺼 두므로 진단은 본문이 아니라 서버 로그로 간다.
# 이 검사가 없으면 "필수 필드가 서명 범위 안에 있는가" 같은 가드를 지워도(값은 null 이 되어
# 우연히 거절로 떨어진다) 아무 검사도 빨개지지 않는다 — 조용한 undefined 접근이 남는다.
DIAG=$(grep -ciE 'PHP (Warning|Notice|Deprecated|Fatal)|Undefined (array key|variable)|TypeError' "$SRV_LOG")
chk "SSV 요청이 PHP 진단을 한 줄도 만들지 않는다" "$DIAG" "0"

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
