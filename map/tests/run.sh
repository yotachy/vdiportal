#!/usr/bin/env bash
# map/ 통합 테스트 관문 — 스쿱포지(PC)와 머니스쿱(모바일)이 forge-core.js 를 공유하므로
# 어느 한쪽만 돌리면 공유 엔진 변경이 반대편을 깨뜨린 것을 놓친다. 항상 이 스크립트로 돌린다.
#
#   ./tests/run.sh            전부
#   ./tests/run.sh engine     forge-core + forge-tools 만 (엔진만 고쳤을 때 빠른 확인)
#   ./tests/run.sh mobile     모바일만
#
# 종료코드: 하나라도 실패하면 1.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
SCOPE="${1:-all}"
FAILED=()
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

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "engine" ]; then
  run_suite "forge-core"  "$ROOT" node --test forge-core.test.js
  run_suite "forge-tools" "$ROOT" node --test forge-tools.test.js
fi

if [ "$SCOPE" = "all" ]; then
  run_suite "landing"     "$ROOT" node --test landing.test.js
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

echo
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "전체 통과 — ${TOTAL}건"
  exit 0
fi
echo "실패 스위트: ${FAILED[*]} (통과 ${TOTAL}건)"
exit 1
