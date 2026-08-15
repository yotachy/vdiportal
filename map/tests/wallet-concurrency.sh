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

# 인자: libDir dataDir dev gsub barrier
# 계정 생성은 배리어 "전"에 끝낸다 — 여기서 겨루는 것은 병합이지 계정 생성이 아니다
# (그건 Check 1·3 이 본다). ipHash 를 null 로 넘겨 IP 상한도 이 검사에 끼어들지 않게 한다.
cat > "$WORK/merge-race.php" <<'PHPEOF'
<?php
$libDir = $argv[1]; $dataDir = $argv[2]; $dev = $argv[3]; $gsub = $argv[4]; $barrier = $argv[5];
require $libDir . "/wallet-lib.php";
$db = w_db($dataDir);
while (!file_exists($barrier)) { usleep(200); }
try {
  $m = w_merge($db, $dev, $gsub);
  echo ($m["ok"] ? "ok" : ("no " . $m["reason"])) . " " . $dev . "\n";
} catch (Throwable $e) {
  echo "throw " . get_class($e) . ": " . $e->getMessage() . "\n";
}
PHPEOF

# 인자: libDir dataDir dev gsub mode tag barrier
# mode ∈ merge | grant | checkin | spend — 병합과 '버는 경로'를 같은 순간에 부딪친다.
# 계정 준비는 전부 배리어 "전"에 끝낸다(여기서 겨루는 것은 가드지 계정 생성이 아니다).
cat > "$WORK/frozen-race.php" <<'PHPEOF'
<?php
$libDir = $argv[1]; $dataDir = $argv[2]; $dev = $argv[3]; $gsub = $argv[4];
$mode = $argv[5]; $tag = $argv[6]; $barrier = $argv[7];
require $libDir . "/wallet-lib.php";
$db = w_db($dataDir);
$a = w_get_account($db, $dev);
while (!file_exists($barrier)) { usleep(200); }
try {
  if ($mode === "merge") {
    $m = w_merge($db, $dev, $gsub);
    echo ($m["ok"] ? "ok" : "no ") . $mode . "\n";
  } else if ($mode === "grant") {
    $r = w_ad_grant($db, $a["id"], "quick", "tx-" . $tag, 1);
    echo "ok grant " . $r["granted"] . " " . ($r["reason"] === null ? "-" : $r["reason"]) . "\n";
  } else if ($mode === "checkin") {
    $r = w_checkin($db, $a, null);
    echo "ok checkin " . $r["granted"] . " " . ($r["reason"] === null ? "-" : $r["reason"]) . "\n";
  } else {
    $r = w_spend($db, $a["id"], "full", "idem-" . $tag, "AAPL", null);
    echo "ok spend " . ($r["ok"] ? "1" : "0") . " " . ($r["reason"] === null ? "-" : $r["reason"]) . "\n";
  }
} catch (Throwable $e) {
  echo "throw " . get_class($e) . ": " . $e->getMessage() . "\n";
}
PHPEOF

# 인자: libDir dataDir dev txId barrier
cat > "$WORK/ad-race.php" <<'PHPEOF'
<?php
$libDir = $argv[1]; $dataDir = $argv[2]; $dev = $argv[3]; $txId = $argv[4]; $barrier = $argv[5];
require $libDir . "/wallet-lib.php";
$db = w_db($dataDir);
$a = w_get_account($db, $dev);
while (!file_exists($barrier)) { usleep(200); }
try {
  $r = w_ad_grant($db, $a["id"], "quick", $txId, 1);
  echo ($r["ok"] ? "ok " : "no ") . $r["granted"] . " " . ($r["reason"] === null ? "-" : $r["reason"]) . "\n";
} catch (Throwable $e) {
  echo "throw " . get_class($e) . ": " . $e->getMessage() . "\n";
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

# ── Check 1: 진짜로 빈 디렉토리, (cap+9)-way hello, 10 회 ─────────────────────────────
# 레이서 수를 고정 12로 두면 cap 을 12 이상으로 올리는 순간 경합 자체가 사라진다 —
# 12개 전부가 그냥 통과해 버려 "상한이 동시성 아래서 지켜지는가"를 더 이상 검사하지 않으면서도
# 초록을 낸다(이 저장소가 실제로 겪은 함정). 이 검사가 증명해야 하는 성질은 "cap 이 3이다"가
# 아니라 "cap 이 몇이든 동시 요청 아래서 정확히 그만큼만 통과한다"이므로, 레이서 수·기대 429
# 개수를 전부 런타임에 읽은 $CAP 에서 유도한다 — +9 는 cap 값과 무관하게 늘 여유 있는 경합을
# 만들기 위한 임의의 여유폭이다(정확히 얼마여야 하는 이유는 없다, 그냥 "cap 보다 확실히 많이").
check1() {
  local racers=$((CAP + 9))
  local want429=$((racers - CAP))
  echo "── Check 1: 빈 디렉토리 ${racers}-way hello × 10회 (기대: accounts==$CAP, 429==$want429, distinct_ip_hash==1, 500==0)"
  local rep ok=1
  for rep in $(seq 1 10); do
    local d="$WORK/c1"
    # 부모($d)만 만든다 — "$d/data" 자체는 절대 미리 만들지 않는다. 미리 만들면 각
    # 프로세스의 w_db() 가 !is_dir() 를 항상 false 로 보게 되어 mkdir 경합 자체가
    # 통째로 사라진다(자체 실측 — 처음엔 이 실수로 mkdir 뮤테이션이 10/10 안 걸렸다).
    rm -rf "$d"; mkdir -p "$d"
    local args=()
    local i
    for i in $(seq -w 1 "$racers"); do
      args+=("$WORK $d/data c1-run${rep}-dev-$i 203.0.113.5")
    done
    run_barrier "$WORK/hello-sim.php" "$d" "${args[@]}"
    local c200 c429 c500 accounts distinct
    c200=$(grep -c '^200' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    c429=$(grep -c '^429' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    c500=$(grep -c '^500' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    accounts=$(db_query "$d/data" "select count(*) from accounts")
    distinct=$(db_query "$d/data" "select count(distinct seed_ip_hash) from accounts")
    if [ "$accounts" != "$CAP" ] || [ "$distinct" != "1" ] || [ "$c500" != "0" ] || [ "$c429" != "$want429" ]; then
      echo "   rep $rep: FAIL — 200=$c200 429=$c429(want $want429) 500=$c500 accounts=$accounts(want $CAP) distinct_ip_hash=$distinct(want 1)"
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

# ── Check 3: 상한 경계, (cap-1)/cap 채운 뒤 동일 deviceId 12-way, 3 회 ─────────────────
# 사전 채움 개수를 고정 2로 두면 그 값은 오직 cap==3(2 = cap-1) 일 때만 "경계"가 된다 —
# cap 을 20으로 올리면 2/20 은 경계 근처도 아니라서(비교 대상이 accounts==$CAP 인데 실제로는
# 2+1=3 밖에 안 쌓인다) 이 검사가 무조건 FAIL 하거나(운 나쁘면) 엉뚱한 이유로 죽는다. cap-1 을
# 채워야 이 12-way 레이스의 첫 성공 계정이 정확히 cap 번째가 되는 "경계"가 유지된다.
check3() {
  local prefill=$((CAP - 1))
  echo "── Check 3: 상한 경계 (${prefill}/$CAP 채움) 동일 deviceId 12-way × 3회 (기대: 전부 200, accounts==$CAP)"
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
      $n = (int)$argv[4];
      for ($i = 1; $i <= $n; $i++) {
        w_create_account($db, "c3-prefill-" . $i . "-" . $argv[3], $iph);
      }
    ' "$WORK" "$d/data" "$rep" "$prefill"
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

# ── Check 4: 같은 구글 계정으로 8-way 동시 첫 병합, 3 회 ────────────────────────────
# 이 검사가 실제로 지키는 것은 두 가지다.
#
#  ① w_merge 의 BEGIN IMMEDIATE 직렬화. 여덟 기기가 같은 구글 계정으로 동시에 첫 병합을
#     시도해도 계정은 하나여야 한다. begin immediate 를 지연 begin 으로 바꾸면 여덟 중
#     일곱이 "database is locked" 로 튕겨 총원장이 40 이 된다(실측 — 3/3 FAIL).
#  ② "버린다, 합치지 않는다"가 동시성 아래서도 성립하는가. 8계정이 시드 5씩 받아 40으로
#     출발하니, 첫 병합 하나만 잔량을 이어받고 나머지 일곱이 버리면 정확히 5가 남는다.
#     "높은 쪽" 래칫이 되살아나면 이 수가 커진다.
#
# ⚠ 이 검사는 ix_accounts_gsub 의 UNIQUE 를 지키지 "못한다" — 처음엔 그게 목적이라고 적었으나
# 실측이 뒤집었다: UNIQUE 를 떼고 8-way 를 돌려도 계정은 3/3 모두 1개였다. BEGIN IMMEDIATE 가
# 쓰기를 직렬화해서, 둘째 병합은 인덱스에 닿기 전에 이미 "그 구글 계정이 있다"를 보기 때문이다.
# 인덱스의 유일성 자체는 tests/wallet.test.php 의 "같은 google_sub 을 가진 계정은 둘일 수 없다"
# 가 직접 못박는다 — 둘 중 그쪽을 믿을 것.
check4() {
  local racers=8
  echo "── Check 4: 같은 구글 8-way 동시 첫 병합 × 3회 (기대: gsub 계정==1, 총원장==5, throw==0, no==0, 캐시어긋남==0)"
  local rep ok=1
  for rep in $(seq 1 3); do
    local d="$WORK/c4"
    rm -rf "$d"; mkdir -p "$d/data"
    php -r '
      require $argv[1] . "/wallet-lib.php";
      $db = w_db($argv[2]);
      for ($i = 1; $i <= (int)$argv[3]; $i++) { w_create_account($db, "c4-dev-" . $i, null); }
    ' "$WORK" "$d/data" "$racers"
    local args=()
    local i
    for i in $(seq 1 "$racers"); do
      args+=("$WORK $d/data c4-dev-$i same-gsub")
    done
    run_barrier "$WORK/merge-race.php" "$d" "${args[@]}"
    local accts total oks nos throws bad
    accts=$(db_query "$d/data" "select count(*) from accounts where google_sub = 'same-gsub'")
    total=$(db_query "$d/data" "select coalesce(sum(delta), 0) from ledger")
    oks=$(grep -c '^ok' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    nos=$(grep -c '^no' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    throws=$(grep -c '^throw' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    # 캐시(accounts.balance)와 진실(SUM(ledger.delta))이 갈린 계정 수 — 어느 병합이 이기든 0이어야 한다
    bad=$(php -r '
      require $argv[1] . "/wallet-lib.php";
      $db = w_db($argv[2]); $n = 0;
      foreach ($db->query("select id, balance from accounts") as $a) {
        if ((int)$a["balance"] !== w_true_balance($db, $a["id"])) $n++;
      }
      echo $n;
    ' "$WORK" "$d/data")
    if [ "$accts" != "1" ] || [ "$total" != "5" ] || [ "$throws" != "0" ] || [ "$nos" != "0" ] || [ "$bad" != "0" ]; then
      echo "   rep $rep: FAIL — gsub_accounts=$accts(want 1) 총원장=$total(want 5) ok=$oks no=$nos(want 0) throw=$throws(want 0) 캐시어긋남=$bad(want 0)"
      grep -h '^no\|^throw' "$d"/out_*.txt | sort | uniq -c | head -5
      ok=0
    else
      echo "   rep $rep: ok — gsub_accounts=$accts 총원장=$total ok=$oks no=$nos throw=$throws 캐시어긋남=$bad"
    fi
  done
  [ "$ok" = "1" ]
}

# ── Check 5: 병합 vs 버는 경로(광고·출석·소비) 8-way 동시, 3 회 ─────────────────────
# Task 1 이 남긴 구멍이다. 그때까지 이 파일은 병합끼리만 겨루게 해서, w_is_merged_away 가드를
# BEGIN IMMEDIATE "밖"으로 옮기는 개조가 관문 전체를 초록으로 통과했다(리뷰어가 2프로세스로
# 재현). 가드가 락 밖이면 셋 다 락을 잡기 "전"에 "아직 안 병합됐다"를 읽고 대기하다가, 병합이
# 커밋된 "뒤"에 자기 차례로 쓴다 — 얼어붙어야 할 지갑에 광고·출석이 적립되고(잔량 부활),
# w_spend 는 잔량을 안 보는 캐시 분기라 거절돼야 할 소비가 ok:true 를 받는다.
#
# 그래서 판정은 반환값이 아니라 원장 순서로 한다: merge_discard 행 "뒤에" 그 계정의 원장 행이
# 하나라도 있으면 실패다. 지급이든 delta 0 캐시 행이든 전부 이 하나에 걸린다.
# 같은 가드가 w_checkin·w_spend·w_ad_grant 세 곳을 지키므로 이 검사 하나가 셋을 보호한다.
check5() {
  echo "── Check 5: 병합 vs 광고·출석·소비 8-way × 3회 (기대: merge_discard 뒤 원장 행 0, 잔량 0, throw 0)"
  local rep ok=1
  for rep in $(seq 1 3); do
    local d="$WORK/c5"
    rm -rf "$d"; mkdir -p "$d/data"
    # 준비: ① 같은 구글에 이미 붙은 계정을 만들어 둔다(그래야 dev 의 병합이 '버림' 갈래를 탄다)
    #      ② dev 계정에 full/AAPL 권리를 미리 사 둔다(w_spend 의 캐시 분기를 실제로 태운다)
    php -r '
      require $argv[1] . "/wallet-lib.php";
      $db = w_db($argv[2]);
      w_create_account($db, "c5-owner", null);
      w_merge($db, "c5-owner", "c5-gsub");
      w_create_account($db, "c5-dev", null);
      $a = w_get_account($db, "c5-dev");
      w_spend($db, $a["id"], "full", "c5-arm", "AAPL", null);
    ' "$WORK" "$d/data"
    local args=()
    args+=("$WORK $d/data c5-dev c5-gsub merge m0")
    local i
    for i in 1 2 3; do args+=("$WORK $d/data c5-dev c5-gsub grant g$i"); done
    for i in 1 2; do args+=("$WORK $d/data c5-dev c5-gsub checkin k$i"); done
    for i in 1 2; do args+=("$WORK $d/data c5-dev c5-gsub spend s$i"); done
    run_barrier "$WORK/frozen-race.php" "$d" "${args[@]}"
    local after bal merged throws cache
    # merge_discard 뒤에 남은 행 수(병합이 안 됐으면 -1 로 표시해 실패로 만든다)
    after=$(php -r '
      require $argv[1] . "/wallet-lib.php";
      $db = w_db($argv[2]);
      $a = w_get_account($db, "c5-dev");
      $st = $db->prepare("select max(id) m from ledger where account_id = ? and reason = \"merge_discard\"");
      $st->execute(array($a["id"]));
      $r = $st->fetch();
      if ($r["m"] === null) { echo "-1"; exit; }
      $st = $db->prepare("select count(*) c from ledger where account_id = ? and id > ?");
      $st->execute(array($a["id"], (int)$r["m"]));
      $x = $st->fetch();
      echo (int)$x["c"];
    ' "$WORK" "$d/data")
    bal=$(php -r '
      require $argv[1] . "/wallet-lib.php";
      $db = w_db($argv[2]); $a = w_get_account($db, "c5-dev");
      echo w_true_balance($db, $a["id"]);
    ' "$WORK" "$d/data")
    cache=$(db_query "$d/data" "select balance from accounts where device_id = 'c5-dev'")
    throws=$(grep -c '^throw' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')
    if [ "$after" != "0" ] || [ "$bal" != "0" ] || [ "$cache" != "0" ] || [ "$throws" != "0" ]; then
      echo "   rep $rep: FAIL — merge_discard 뒤 원장행=$after(want 0) 잔량=$bal(want 0) 캐시=$cache(want 0) throw=$throws(want 0)"
      grep -h '^throw' "$d"/out_*.txt | sort | uniq -c | head -3
      ok=0
    else
      echo "   rep $rep: ok — merge_discard 뒤 원장행=$after 잔량=$bal 캐시=$cache throw=$throws"
    fi
  done
  [ "$ok" = "1" ]
}

# ── Check 6: 같은 transaction_id 8-way 동시 지급 + 일 상한 경합, 3 회 ────────────────
# ① 구글은 콜백을 재시도한다 — 재시도가 겹치면 같은 transaction_id 가 동시에 온다. 앱 층
#    "이미 있나" 조회만으로는 여덟이 모두 "없다"를 보고 각자 적립한다(PK 가 DB 층에서 막는다).
# ② 일 상한도 쓰기 락 안에서 세는지 본다 — 밖에서 세면 동시 콜백이 상한을 나란히 통과한다.
check6() {
  local cap
  cap=$(php -r 'require $argv[1]; echo W_AD_DAILY;' "$WORK/wallet-lib.php")
  echo "── Check 6: 같은 tx 8-way + 서로 다른 tx $((cap + 4))-way × 3회 (기대: 잔량 6, 상한 정확히 $cap)"
  local rep ok=1
  for rep in $(seq 1 3); do
    local d="$WORK/c6"
    rm -rf "$d"; mkdir -p "$d/data"
    php -r '
      require $argv[1] . "/wallet-lib.php";
      $db = w_db($argv[2]);
      w_create_account($db, "c6-dev", null);
      w_create_account($db, "c6-dev2", null);
    ' "$WORK" "$d/data"
    local args=()
    local i
    for i in $(seq 1 8); do args+=("$WORK $d/data c6-dev same-tx"); done
    run_barrier "$WORK/ad-race.php" "$d" "${args[@]}"
    local bal rows throws
    bal=$(php -r '
      require $argv[1] . "/wallet-lib.php";
      $db = w_db($argv[2]); $a = w_get_account($db, "c6-dev");
      echo w_true_balance($db, $a["id"]);
    ' "$WORK" "$d/data")
    rows=$(db_query "$d/data" "select count(*) from ad_grants where transaction_id = 'same-tx'")
    throws=$(grep -c '^throw' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')

    # 서로 다른 transaction_id 를 상한보다 많이 동시에 — 정확히 상한만큼만 적립돼야 한다
    local args2=()
    for i in $(seq 1 $((cap + 4))); do args2+=("$WORK $d/data c6-dev2 tx-$i"); done
    run_barrier "$WORK/ad-race.php" "$d" "${args2[@]}"
    local granted bal2
    granted=$(db_query "$d/data" "select coalesce(sum(granted), 0) from ad_grants
                                  where account_id = (select id from accounts where device_id = 'c6-dev2')")
    bal2=$(php -r '
      require $argv[1] . "/wallet-lib.php";
      $db = w_db($argv[2]); $a = w_get_account($db, "c6-dev2");
      echo w_true_balance($db, $a["id"]);
    ' "$WORK" "$d/data")
    throws=$((throws + $(grep -c '^throw' "$d"/out_*.txt | awk -F: '{s+=$2} END{print s+0}')))

    if [ "$bal" != "6" ] || [ "$rows" != "1" ] || [ "$throws" != "0" ] \
       || [ "$granted" != "$cap" ] || [ "$bal2" != "$((5 + cap))" ]; then
      echo "   rep $rep: FAIL — 같은tx 잔량=$bal(want 6) 행=$rows(want 1) throw=$throws(want 0) / 상한 지급합=$granted(want $cap) 잔량=$bal2(want $((5 + cap)))"
      grep -h '^throw\|^no' "$d"/out_*.txt | sort | uniq -c | head -3
      ok=0
    else
      echo "   rep $rep: ok — 같은tx 잔량=$bal 행=$rows / 상한 지급합=$granted 잔량=$bal2 throw=$throws"
    fi
  done
  [ "$ok" = "1" ]
}

check1 || FAIL=1
check2 || FAIL=1
check3 || FAIL=1
check4 || FAIL=1
check5 || FAIL=1
check6 || FAIL=1

echo
if [ "$FAIL" = "0" ]; then
  echo "전체 통과 — 지갑 동시성 회귀 6종"
  exit 0
else
  echo "실패 — 위 로그의 FAIL 행 참고"
  exit 1
fi
