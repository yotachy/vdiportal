#!/usr/bin/env bash
# map/ 통합 테스트 관문 — 스쿱포지(PC)와 머니스쿱(모바일)이 forge-core.js 를 공유하므로
# 어느 한쪽만 돌리면 공유 엔진 변경이 반대편을 깨뜨린 것을 놓친다. 항상 이 스크립트로 돌린다.
#
#   ./tests/run.sh              전부
#   ./tests/run.sh engine       forge-core + forge-tools 만 (엔진만 고쳤을 때 빠른 확인)
#   ./tests/run.sh mobile       모바일만
#   ./tests/run.sh app          머니스쿱 앱(map/app/)만 — 정책·상태·문자열 + 문법 하한
#   ./tests/run.sh wallet       지갑 원장(PHP)만
#   ./tests/run.sh dispatcher   지갑 HTTP 디스패처(wallet-api.php) — php -S + curl. 'all'에 낀다
#                                (1~2초). 이 파일은 여기 말고는 저장소 어디에서도 실행되지 않는다.
#   ./tests/run.sh concurrency  지갑 동시성 회귀(비밀키 생성·IP 상한·mkdir) — 'all'엔 안 낌,
#                                느려서(수 초~수십 초) 배리어 동기화 OS 프로세스 12-way 를 씀.
#                                wallet-lib.php · wallet-api.php 를 고친 뒤엔 배포 전 필수.
#   ./tests/run.sh browser      브라우저 관문(실제 크로미움으로 화면 6개를 연다) — 'all'엔 안 낌,
#                                크로미움 없는 환경에선 통째로 건너뛰고, 최초 1회는 apt-get
#                                download 로 공유 라이브러리를 받아 느리다. P0 이후 모든
#                                태스크의 완료 조건(wallet concurrency 와 같은 취급).
#
# 종료코드: 하나라도 실패하면 1.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
SCOPE="${1:-all}"
FAILED=()
SKIPPED=()
TOTAL=0

# node --test 출력에서 'ℹ pass N' / 'ℹ fail N' 을 뽑아 집계한다.
# ⚠ 색 코드를 반드시 먼저 걷어낸다 — node 가 요약줄을 '\e[34mℹ pass 259\e[39m' 으로 내보내면
# 아래 grep 의 '^ℹ' 앵커가 안 맞아 **전부 통과인 스위트가 '실패 (pass 0)' 로 보고된다**.
# 초록을 빨강으로 읽는 방향이라 조용히 넘어가진 않지만, 관문이 거짓말하는 것은 마찬가지다.
run_suite() {
  local label="$1" dir="$2"; shift 2
  printf '── %-22s ' "$label"
  local out pass fail
  out=$(cd "$dir" && "$@" 2>&1)
  out=$(printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g')
  pass=$(printf '%s\n' "$out" | grep -oP '^ℹ pass \K\d+' | tail -1)
  fail=$(printf '%s\n' "$out" | grep -oP '^ℹ fail \K\d+' | tail -1)
  pass=${pass:-0}; fail=${fail:-0}
  TOTAL=$((TOTAL + pass))
  if [ "$fail" -ne 0 ] || [ "$pass" -eq 0 ]; then
    printf '실패 (pass %s / fail %s)\n' "$pass" "$fail"
    printf '%s\n' "$out" | grep -E '^(not ok|  Error|\s+Error|✖)' | head -20
    FAILED+=("$label")
  else
    printf '%s건 통과\n' "$pass"
  fi
}

# 'all' 에는 절대 안 낀다 — 느리고(배리어당 12 PHP 프로세스 × 16 회) 사람이 명시적으로
# 부를 때만 뜻이 있다. 'ℹ pass N'/'ℹ fail N' 형식이 아니라 run_suite 의 집계 대상이 아니고,
# 자체 종료코드로 바로 끝낸다.
if [ "$SCOPE" = "concurrency" ]; then
  bash tests/wallet-concurrency.sh
  exit $?
fi

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "engine" ]; then
  run_suite "forge-core"  "$ROOT" node --test forge-core.test.js
  run_suite "forge-tools" "$ROOT" node --test forge-tools.test.js
fi

if [ "$SCOPE" = "all" ]; then
  run_suite "landing"     "$ROOT" node --test landing.test.js
fi

# 머니스쿱 앱(map/app/) — 정책·상태·문자열 로직 + ES2017 문법 하한. UMD 라 node 로 돈다.
if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "app" ]; then
  run_suite "app"         "$ROOT/app" bash -c 'node --test ./*.test.js'   # 글롭 — 새 테스트 파일이 자동 편입되게(나열 방식은 누락 사고를 만든다)
fi

# 앱 채점 원장(PHP) — 서버 판정 로직. 'all'에 낀다(빠름).
if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "app" ]; then
  if command -v php >/dev/null 2>&1; then
    run_suite "app-ledger" "$ROOT" php tests/app-ledger.test.php
    run_suite "app-wallet-bridge" "$ROOT" php tests/app-wallet-bridge.test.php
  else
    printf '── %-22s 건너뜀 (php 없음 — 채점 판정 미검사)\n' "app-ledger"
    SKIPPED+=("app-ledger")
  fi
fi

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "wallet" ]; then
  if command -v php >/dev/null 2>&1; then
    run_suite "wallet" "$ROOT" php tests/wallet.test.php
  else
    # 조용히 통과시키지 않는다 — 돈 로직을 검사하지 않았다는 사실이 보여야 한다.
    printf '── %-22s 건너뜀 (php 없음 — 돈 로직 미검사)\n' "wallet"
    SKIPPED+=("wallet")
  fi
fi

# 디스패처(wallet-api.php)는 원장 스위트가 보지 않는다 — 인증·입력검증·op 분기는 전부 그 파일에
# 있고, 그 파일은 이 하네스 말고는 저장소 어디에서도 로드되지 않는다. 빠르니 'all' 에 넣는다 —
# 사람이 기억해야만 도는 관문은 관문이 아니다(concurrency 는 느려서 예외로 남는다).
if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "dispatcher" ] || [ "$SCOPE" = "wallet" ]; then
  if command -v php >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
    run_suite "wallet-dispatcher" "$ROOT" bash tests/wallet-dispatcher.sh
  else
    printf '── %-22s 건너뜀 (php/curl 없음 — 디스패처 미검사)\n' "wallet-dispatcher"
    SKIPPED+=("wallet-dispatcher")
  fi
fi

# 모바일은 엔진 원본(../../forge-core.js)을 직접 require 하므로 vendor 동기화 없이도 돌아간다.
# 엔진을 고쳤다면 이 스위트가 그 사실을 여기서 알려준다.
if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "mobile" ] || [ "$SCOPE" = "engine" ]; then
  if [ -d "$ROOT/mobile/node_modules" ] || [ -f "$ROOT/mobile/package.json" ]; then
    run_suite "moneyscoop-mobile" "$ROOT/mobile" node --test test/*.test.mjs
  else
    printf '── %-22s 건너뜀 (mobile/ 없음)\n' "moneyscoop-mobile"
  fi
fi

# 브라우저 관문(gate-browser.mjs) — 노드 테스트가 원리적으로 못 보는 것을 실제 크로미움으로
# 본다(브랜치 mobile-rebuild-p0 문서 참고). 'all'에는 안 낀다 — 크로미움 없는 환경에서 전량이
# 통째로 죽으면 안 되고, 매 실행 최초 1회는 apt-get download 로 공유 라이브러리를 받아 느리다.
# run_suite 를 쓰지 않는다 — 그건 node --test 의 'ℹ pass N'/'ℹ fail N' 형식을 파싱하는데
# gate-browser.mjs 는 자기 라우트별 ✓/✗ 를 찍지 그 형식이 아니라, 그대로 물리면 항상
# "pass 0"으로 오판돼 성공도 실패로 보고된다. 대신 종료코드로만 판정한다.
if [ "$SCOPE" = "browser" ]; then
  if [ -x "$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome" ]; then
    printf '── %-22s\n' "browser-gate"
    if (cd "$ROOT/mobile" && node tools/gate-browser.mjs); then
      TOTAL=$((TOTAL + 1))
    else
      FAILED+=("browser-gate")
    fi
  else
    printf '── %-22s 건너뜀 (크로미움 없음)\n' "browser-gate"
    SKIPPED+=("browser-gate")
  fi
fi

echo
if [ ${#SKIPPED[@]} -ne 0 ]; then
  echo "건너뜀: ${SKIPPED[*]} — 이 스위트는 검사되지 않았다"
fi
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "전체 통과 — ${TOTAL}건"
  exit 0
fi
echo "실패 스위트: ${FAILED[*]} (통과 ${TOTAL}건)"
exit 1
