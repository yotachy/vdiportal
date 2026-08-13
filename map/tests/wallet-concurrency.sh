#!/usr/bin/env bash
# 지갑 원장 동시성 회귀 하네스. wallet-lib.php · wallet-api.php 를 고친 뒤에는 배포 전에
# 반드시 이걸 돌릴 것 — 여기서 잡는 세 경합(비밀키 생성 · IP 상한 체크-후-쓰기 · w_db()
# mkdir 충돌)은 전부 tests/wallet.test.php(단일 프로세스)로는 안 잡힌다. 실제로 세 리뷰
# 라운드에 걸쳐 그렇게 새어나왔다 — 매번 단일 프로세스 스위트는 초록이었다.
#
# ⚠ php 내장 서버(`php -S`)는 요청을 직렬 처리한다(실측 확인, 라운드 1) — 그래서 이 세
# 경합 중 어느 것도 재현하지 못한다. 이 스크립트를 "php -S 기반으로 간소화"하지 말 것 —
# 그 순간 세 검사 전부가 항상-통과로 조용히 무력화된다. 실제 OS 프로세스를 배리어 파일로
# 동기화해야만 진짜 동시 진입을 만든다.
#
# 사용법: ./tests/run.sh concurrency   (또는 이 스크립트를 직접 실행)
# 종료코드: 검사 하나라도 실패하면 1.
#
# 느리다(수 초~수십 초, 배리어당 12 PHP 프로세스 기동) — 그래서 tests/run.sh 의 'all'
# 스코프에는 안 들어간다. 사람이 안 돌리는 관문은 관문이 아니다 — 대신 wallet-lib.php ·
# wallet-api.php 를 건드릴 때마다 손으로 돌리는 게 계약이다.
set -uo pipefail
cd "$(dirname "$0")/.."
MAP_ROOT="$PWD"
FAIL=0

# 리포에도, ~/projects/data 에도 손대지 않는다 — 완전히 격리된 임시 디렉토리에서만 논다.
WORK=$(mktemp -d "${TMPDIR:-/tmp}/wallet-concurrency.XXXXXX")
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

cp "$MAP_ROOT/wallet-lib.php" "$WORK/wallet-lib.php"

CAP=$(php -r 'require $argv[1]; echo W_IP_DAILY;' "$WORK/wallet-lib.php")

# ── wallet-api.php 의 hello() 를 실제 코드와 같은 순서·같은 예외처리로 재현한다 ──────────
# (IP -> w_ip_hash(비밀키 필요) -> w_get_account -> 없으면 w_create_account ->
#  WalletRateLimitException 이면 재조회 후 진짜 없을 때만 429). 최초 w_db() 는 실제
# wallet-api.php 처럼 try/catch 로 감싼다(storage 500) — 안 감싸면 w_db() 의 무관한 기존
# mkdir 경합이 이 스크립트를 그냥 죽인다. wallet-api.php 를 직접 require 하지 않는 이유는
# 그 파일이 최상위에서 $_SERVER 를 보고 곧장 디스패치·exit 하는 구조라 이 시뮬레이션처럼
# 특정 시점만 골라 배리어로 동기화할 수 없기 때문이다 — 그래서 그 로직만 여기 그대로 옮겨
# 놓고 실제 파일이 갈라지면(리뷰가 보게 될 diff 로) 사람이 알아챌 수 있게 한다.
# 인자: libDir(wallet-lib.php 위치) dataDir(w_db 데이터 디렉토리) dev ip barrier
cat > "$WORK/hello-sim.php" <<'PHPEOF'
<?php
$libDir = $argv[1]; $dataDir = $argv[2]; $dev = $argv[3]; $ip = $argv[4]; $barrier = $argv[5];
require $libDir . "/wallet-lib.php";

function w_ip_hash_sim($dataDir, $ip) {
  return substr(hash_hmac("sha256", $ip, w_secret($dataDir)), 0, 32);
}

while (!file_exists($barrier)) { usleep(200); }

try {
  $db = w_db($dataDir);
} catch (Throwable $e) {
  echo "500-storage $dev\n"; exit;
}

$acct = w_get_account($db, $dev);
if (!$acct) {
  $iph = w_ip_hash_sim($dataDir, $ip);
  try {
    $acct = w_create_account($db, $dev, $iph);
  } catch (WalletRateLimitException $e) {
    $acct = w_get_account($db, $dev);
    if (!$acct) { echo "429 $dev\n"; exit; }
  } catch (Throwable $e) {
    $acct = w_get_account($db, $dev);   // 동시 hello 경합(UNIQUE 충돌)
  }
  if (!$acct) { echo "500 $dev\n"; exit; }
}
echo "200 $dev\n";
PHPEOF

# 인자: libDir dataDir barrier
cat > "$WORK/secret-race.php" <<'PHPEOF'
<?php
$libDir = $argv[1]; $dataDir = $argv[2]; $barrier = $argv[3];
require $libDir . "/wallet-lib.php";
while (!file_exists($barrier)) { usleep(200); }
try {
  $s = w_secret($dataDir);
  echo md5($s) . "\n";
} catch (Throwable $e) {
  echo "THROW " . get_class($e) . ": " . $e->getMessage() . "\n";
}
PHPEOF

# 배리어 동기화 N-way 실행. $1 = php 스크립트, $2 = 결과·배리어를 둘 출력 디렉토리,
# 나머지는 각 프로세스에 그대로 전달할 인자 문자열(공백 구분, 배리어 경로는 자동으로
# 맨 뒤에 붙는다). 결과는 $2/out_NN.txt.
run_barrier() {
  local script="$1"; shift
  local outdir="$1"; shift
  local barrier="$outdir/barrier"
  rm -f "$outdir"/out_*.txt "$barrier"
  local pids=()
  local i=1
  for args in "$@"; do
    php "$script" $args "$barrier" > "$outdir/out_$(printf '%02d' "$i").txt" 2>&1 &
    pids+=("$!")
    i=$((i + 1))
  done
  sleep 0.5
  touch "$barrier"
  local p
  for p in "${pids[@]}"; do wait "$p" 2>/dev/null; done
}

db_query() {
  # $1 = 데이터 디렉토리, $2 = SQL
  php -r 'require $argv[1] . "/wallet-lib.php"; $db = w_db($argv[2]); echo $db->query($argv[3])->fetchColumn();' \
    "$WORK" "$1" "$2"
}

# ── Check 1: 진짜로 빈 디렉토리, 12-way hello, 10 회 ──────────────────────────────────
check1() {
  echo "── Check 1: 빈 디렉토리 12-way hello × 10회 (기대: accounts==$CAP, distinct_ip_hash==1, 500==0)"
  local rep ok=1
  for rep in $(seq 1 10); do
    local d="$WORK/c1"
    # 부모($d)만 만든다 — "$d/data" 자체는 절대 미리 만들지 않는다. 미리 만들면 각
    # 프로세스의 w_db() 가 !is_dir() 를 항상 false 로 보게 되어 mkdir 경합 자체가
    # 통째로 사라진다(자체 실측 — 처음엔 이 실수로 mkdir 뮤테이션이 10/10 안 걸렸다).
    rm -rf "$d"; mkdir -p "$d"
    local args=()
    local i
    for i in $(seq -w 1 12); do
      args+=("$WORK $d/data c1-run${rep}-dev-$i 203.0.113.5")
    done
    run_barrier "$WORK/hello-sim.php" "$d" "${args[@]}"
    local c200 c429 c500 accounts distinct
    c200=$(grep -c '^200' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    c429=$(grep -c '^429' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    c500=$(grep -c '^500' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    accounts=$(db_query "$d/data" "select count(*) from accounts")
    distinct=$(db_query "$d/data" "select count(distinct seed_ip_hash) from accounts")
    if [ "$accounts" != "$CAP" ] || [ "$distinct" != "1" ] || [ "$c500" != "0" ]; then
      echo "   rep $rep: FAIL — 200=$c200 429=$c429 500=$c500 accounts=$accounts(want $CAP) distinct_ip_hash=$distinct(want 1)"
      ok=0
    else
      echo "   rep $rep: ok — 200=$c200 429=$c429 500=$c500 accounts=$accounts distinct_ip_hash=$distinct"
    fi
  done
  [ "$ok" = "1" ]
}

# ── Check 2: 비밀키 생성 경합, 12-way, 3 회 ───────────────────────────────────────────
check2() {
  echo "── Check 2: w_secret() 경합 12-way × 3회 (기대: 서로 다른 비밀키 1개, throw 0)"
  local rep ok=1
  for rep in $(seq 1 3); do
    local d="$WORK/c2"
    rm -rf "$d"; mkdir -p "$d/data"
    local args=()
    local i
    for i in $(seq -w 1 12); do args+=("$WORK $d/data"); done
    run_barrier "$WORK/secret-race.php" "$d" "${args[@]}"
    local distinct throws
    distinct=$(grep -hv '^THROW' "$d"/out_*.txt | sort -u | wc -l | tr -d ' ')
    throws=$(grep -c '^THROW' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    if [ "$distinct" != "1" ] || [ "$throws" != "0" ]; then
      echo "   rep $rep: FAIL — distinct secret values=$distinct(want 1) throws=$throws(want 0)"
      ok=0
    else
      echo "   rep $rep: ok — distinct secret values=$distinct throws=$throws"
    fi
  done
  [ "$ok" = "1" ]
}

# ── Check 3: 상한 경계, 2/3 채운 뒤 동일 deviceId 12-way, 3 회 ─────────────────────────
check3() {
  echo "── Check 3: 상한 경계 동일 deviceId 12-way × 3회 (기대: 전부 200, accounts==$CAP)"
  local rep ok=1
  for rep in $(seq 1 3); do
    local d="$WORK/c3"
    rm -rf "$d"; mkdir -p "$d/data"
    # 사전 채움도 hello-sim.php 와 "같은" IP 해시(HMAC(ip, 비밀키))로 넣어야 한다 — 리터럴
    # "c3-ip" 를 그대로 seed_ip_hash 에 넣으면 실제 경합 프로세스가 계산하는 해시값과
    # 절대 안 맞아서 상한 카운트가 항상 0으로 보이고, 이 검사가 재현하려는 상한 경계 자체가
    # 생기지 않는다(자체 실측 — 이 실수 때문에 hello 429 재조회 뮤테이션이 안 걸렸다).
    php -r '
      require $argv[1] . "/wallet-lib.php";
      $db = w_db($argv[2]);
      $iph = substr(hash_hmac("sha256", "c3-ip", w_secret($argv[2])), 0, 32);
      w_create_account($db, "c3-prefill-1-" . $argv[3], $iph);
      w_create_account($db, "c3-prefill-2-" . $argv[3], $iph);
    ' "$WORK" "$d/data" "$rep"
    local args=()
    local i
    for i in $(seq -w 1 12); do
      args+=("$WORK $d/data c3-dupdev-$rep c3-ip")
    done
    run_barrier "$WORK/hello-sim.php" "$d" "${args[@]}"
    local c200 c429 accounts
    c200=$(grep -c '^200' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    c429=$(grep -c '^429' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    accounts=$(db_query "$d/data" "select count(*) from accounts")
    if [ "$c200" != "12" ] || [ "$accounts" != "$CAP" ]; then
      echo "   rep $rep: FAIL — 200=$c200(want 12) 429=$c429(want 0) accounts=$accounts(want $CAP)"
      ok=0
    else
      echo "   rep $rep: ok — 200=$c200 429=$c429 accounts=$accounts"
    fi
  done
  [ "$ok" = "1" ]
}

check1 || FAIL=1
check2 || FAIL=1
check3 || FAIL=1

echo
if [ "$FAIL" = "0" ]; then
  echo "전체 통과 — 지갑 동시성 회귀 3종"
  exit 0
else
  echo "실패 — 위 로그의 FAIL 행 참고"
  exit 1
fi
