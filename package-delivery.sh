#!/usr/bin/env bash
# ============================================================
# 수행사 전달용 압축 패키지 생성 (소스 + 산출물 + 가이드)
#
#  - 전달본은 "포함 목록(allowlist)" 방식으로만 담는다.
#  - 내부 작업용 파일(CLAUDE.md, .git, .claude, .gitignore, 본 스크립트,
#    CI 원본 이미지)은 전달본에 포함하지 않는다.
#
#  사용법:
#    ./package-delivery.sh                                  # 전체 전달본
#    ./package-delivery.sh notice.html notice-detail.html   # 범위 지정 전달본(지정 항목만)
#    ./package-delivery.sh apply.html common.css deliverables/portal-spec.html
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
STAMP="$(date +%Y%m%d_%H%M)"

# 전체 전달 기본 구성 (소스 + 공통 + 가이드 + 산출물)
FULL=(
  README.md STYLE_GUIDE.md BOOTSTRAP_GUIDE.md
  common.css common.js kb-logo.png robots.txt .htaccess
  login.html portal.html apply.html change.html
  approval.html approval-detail.html
  incident.html incident-new.html
  notice.html notice-detail.html notice-new.html
  faq.html qna.html
  deliverables
)

# 전달 금지(인자로 들어와도 방어적으로 제외)
is_excluded() {
  case "$1" in
    CLAUDE.md|.git|.git/*|.claude|.claude/*|.gitignore|dist|dist/*|package-delivery.sh|\
    06_ci_color.png|"KB손해보험_ci_wordmark-hor.png"|*.zip|.DS_Store) return 0 ;;
    *) return 1 ;;
  esac
}

if [ "$#" -gt 0 ]; then
  OUT="dist/vdiportal_부분전달_${STAMP}.zip"
  REQUESTED=("$@")
else
  OUT="dist/vdiportal_전체_${STAMP}.zip"
  REQUESTED=("${FULL[@]}")
fi

FILES=()
for f in "${REQUESTED[@]}"; do
  if is_excluded "$f"; then echo "[제외] $f (전달 대상 아님)"; continue; fi
  if [ ! -e "$f" ]; then echo "[경고] $f — 파일 없음, 건너뜀"; continue; fi
  FILES+=("$f")
done

if [ "${#FILES[@]}" -eq 0 ]; then echo "전달할 파일이 없습니다."; exit 1; fi

rm -f "$OUT"
# 폴더 구조(상대 경로)를 그대로 보존해 압축
python3 - "$OUT" "${FILES[@]}" <<'PY'
import sys, os, zipfile
out, items = sys.argv[1], sys.argv[2:]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for it in items:
        if os.path.isdir(it):
            for root, _, files in os.walk(it):
                for f in files:
                    p = os.path.join(root, f)
                    z.write(p, p)            # arcname = 상대 경로 유지
        else:
            z.write(it, it)
PY

echo ""
echo "✅ 생성: $OUT"
echo "----- 포함 항목 -----"
python3 -m zipfile -l "$OUT"
