#!/usr/bin/env bash
# 헤드리스 시각 확인 — sudo 없이. 2026-08-17 에 실제로 통해서 P2 화면 버그 셋을 잡았다.
#
# 왜 이 파일이 있나: "libnspr4 없어서 안 된다"로 끝내면 다음 사람이 다시 안 해본다.
# 우회가 있고, 아래가 그 전체 절차다. 1457건이 초록인 채로 화면이 깨져 있던 것들
# (자간 상속으로 글자 겹침 · 기본 티어에 지표 판독 노출 · 영어 예외 문구 · draw() ReferenceError
# 가 "로드 실패"로 위장)이 전부 스크린샷에서만 보였다.
#
# 사용: bash mobile/tools/headless-shot.sh [출력디렉터리]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"        # mobile/
WWW="$ROOT/www"
OUT="${1:-${TMPDIR:-/tmp}/ms-shots}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; rm -f "$WWW/__probe.html" "$WWW/__fetchprobe.html"; rm -rf "$WWW/map"; kill %1 %2 2>/dev/null || true' EXIT
mkdir -p "$OUT"

CHROME="$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome"
[ -x "$CHROME" ] || { echo "playwright chromium 이 없다: $CHROME"; exit 1; }

# ── ① 없는 공유 라이브러리를 sudo 없이 로컬로 받는다 ──────────────────────────────────
# apt-get download 는 권한이 필요 없다(설치가 아니라 내려받기). dpkg-deb -x 로 펼쳐
# LD_LIBRARY_PATH 로만 먹인다 — 시스템은 건드리지 않는다.
mkdir -p "$WORK/libs" && cd "$WORK/libs"
for p in libnspr4 libnss3 libasound2t64; do apt-get download "$p" >/dev/null 2>&1 || true; done
for d in *.deb; do dpkg-deb -x "$d" ./root; done
LIBS="$WORK/libs/root/usr/lib/x86_64-linux-gnu"
LD_LIBRARY_PATH="$LIBS" "$CHROME" --version >/dev/null || { echo "chromium 이 여전히 안 뜬다"; exit 1; }

# ── ② 로컬 HTTPS 서버 ────────────────────────────────────────────────────────────────
# 왜 HTTPS 인가: api.js·wallet-http.js 의 API_BASE 가 **절대 URL**(https://parksvc...)이다.
# 그래서 로컬로 서빙해도 요청은 프로덕션으로 나간다(기록된 함정: headless-live-tests-readonly).
# DNS 를 127.0.0.1 로 매핑해 **읽기조차 밖으로 안 나가게** 하는데, 그러려면 로컬이 https 여야 한다.
openssl req -x509 -newkey rsa:2048 -keyout "$WORK/key.pem" -out "$WORK/cert.pem" \
  -days 2 -nodes -subj "/CN=parksvc.mycafe24.com" >/dev/null 2>&1
cat > "$WORK/https.py" <<'PY'
import http.server, ssl, os, sys
os.chdir(sys.argv[1])
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(sys.argv[2], sys.argv[3])
d = http.server.HTTPServer(("127.0.0.1", 8932), http.server.SimpleHTTPRequestHandler)
d.socket = ctx.wrap_socket(d.socket, server_side=True)
d.serve_forever()
PY

# ── ③ 합성 OHLC — 프로덕션 티커 API 자리에 놓는다 ────────────────────────────────────
python3 - "$WWW" <<'PY'
import json, math, os, sys
os.chdir(sys.argv[1]); os.makedirs("map", exist_ok=True)
c = []
for i in range(360):
    v = 200 + i * 0.12 + math.sin(i / 11.0) * 6 + math.sin(i / 37.0) * 14
    c.append({"t": "2025-%02d-%02d" % (1 + (i // 28) % 12, 1 + i % 28),
              "o": round(v - 1, 2), "h": round(v + 1.8, 2), "l": round(v - 1.6, 2),
              "c": round(v, 2), "v": 1000000 + (i % 23) * 40000})
open("map/forge-api.php", "w").write(json.dumps({"ok": True, "tf": "1day", "symbol": "AAPL", "candles": c}))
PY

# ── ④ 온보딩을 건너뛰고 리포트로 바로 가는 프로브 페이지 ──────────────────────────────
# 헤드리스 CLI 는 클릭을 못 한다. localStorage 씨앗 + MSApp.go 로 화면을 지정한다.
python3 - "$WWW" <<'PY'
import json, os, sys
os.chdir(sys.argv[1])
s = open("index.html", encoding="utf-8").read()
wl = [{"sym": "AAPL", "name": "애플"}, {"sym": "NVDA", "name": "엔비디아"}, {"sym": "TSLA", "name": "테슬라"}]
tag = '<script src="app.js"></script>'
seed = ('<script>try{localStorage.setItem("ms_onboarded",JSON.stringify(true));'
        'localStorage.setItem("ms_consent",JSON.stringify(true));'
        'localStorage.setItem("ms_watchlist",' + json.dumps(json.dumps(wl, ensure_ascii=False)) + ');}catch(e){}</script>\n'
        + tag + '\n<script>setTimeout(function(){try{MSApp.go("report",{sym:"AAPL"});}catch(e){}},400);</script>')
open("__probe.html", "w", encoding="utf-8").write(s.replace(tag, seed))
PY

python3 "$WORK/https.py" "$WWW" "$WORK/cert.pem" "$WORK/key.pem" >/dev/null 2>&1 &
sleep 2

# ── ⑤ 촬영 ──────────────────────────────────────────────────────────────────────────
# MAP * 127.0.0.1:1 — 그 밖의 모든 외부 호스트는 블랙홀(지갑 API 포함). 프로덕션 원장에
# 아무것도 안 간다. EXCLUDE 127.0.0.1 이 없으면 로컬도 함께 막힌다.
shoot() {   # shoot <파일명> <높이>
  timeout 150 env LD_LIBRARY_PATH="$LIBS" "$CHROME" --headless=new --disable-gpu --no-sandbox \
    --ignore-certificate-errors \
    --host-resolver-rules="MAP parksvc.mycafe24.com:443 127.0.0.1:8932, MAP * 127.0.0.1:1, EXCLUDE 127.0.0.1" \
    --window-size=390,"$2" --screenshot="$OUT/$1" --virtual-time-budget=20000 \
    "https://parksvc.mycafe24.com/__probe.html" 2>/dev/null | tail -1
}
shoot "report-basic.png" 1200
echo "→ $OUT"
