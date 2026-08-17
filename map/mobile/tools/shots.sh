#!/usr/bin/env bash
# 화면 상태별 스크린샷 — "설치하면 무엇이 보이는가"를 실제로 본다.
#
# headless-shot.sh 는 온보딩을 **건너뛰고** 리포트 한 장만 찍었다. 그래서 개편한 화면들
# (7단계 온보딩·결과 카드·기록·스캔 결과)이 사용자 눈에 실제로 닿는지 아무도 확인하지
# 못했고, "설치해도 그대로"라는 보고를 받고서야 알았다.
#
# 이 앱의 화면 대부분은 **상태 의존적**이다 — 예측 기록이 있어야 결과 카드가 뜨고, 스캔을
# 두 번 해야 뒤집힘이 보인다. 그래서 상태를 씨앗으로 심고 각각을 찍는다.
#
# 사용: bash mobile/tools/shots.sh [출력디렉터리]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WWW="$ROOT/www"
OUT="${1:-${TMPDIR:-/tmp}/ms-shots}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; rm -f "$WWW"/__s_*.html; rm -rf "$WWW/map"; kill %1 2>/dev/null || true' EXIT
mkdir -p "$OUT"

CHROME="$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome"
[ -x "$CHROME" ] || { echo "playwright chromium 이 없다: $CHROME"; exit 1; }

mkdir -p "$WORK/libs" && cd "$WORK/libs"
for p in libnspr4 libnss3 libasound2t64; do apt-get download "$p" >/dev/null 2>&1 || true; done
for d in *.deb; do dpkg-deb -x "$d" ./root; done
LIBS="$WORK/libs/root/usr/lib/x86_64-linux-gnu"
LD_LIBRARY_PATH="$LIBS" "$CHROME" --version >/dev/null || { echo "chromium 이 안 뜬다"; exit 1; }

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

# 합성 OHLC — 프로덕션 티커 API 자리. 마지막 봉 날짜를 오늘로 두어 판정이 실제로 돈다.
python3 - "$WWW" <<'PY'
import json, math, os, sys, datetime
os.chdir(sys.argv[1]); os.makedirs("map", exist_ok=True)
day = datetime.date(2026, 8, 17)
c = []
for i in range(360):
    v = 200 + i * 0.12 + math.sin(i / 11.0) * 6 + math.sin(i / 37.0) * 14
    t = day - datetime.timedelta(days=(359 - i))
    c.append({"t": t.isoformat(), "o": round(v - 1, 2), "h": round(v + 1.8, 2),
              "l": round(v - 1.6, 2), "c": round(v, 2), "v": 1000000 + (i % 23) * 40000})
open("map/forge-api.php", "w").write(json.dumps({"ok": True, "tf": "1day", "symbol": "AAPL", "candles": c}))
PY

# 상태별 프로브 페이지. seed 는 localStorage 에 심을 것, go 는 부팅 후 이동할 화면.
python3 - "$WWW" <<'PY'
import json, os, sys
os.chdir(sys.argv[1])
base = open("index.html", encoding="utf-8").read()
TAG = '<script src="app.js"></script>'

WL = [{"sym": "AAPL", "name": "애플"}, {"sym": "NVDA", "name": "엔비디아"}, {"sym": "TSLA", "name": "테슬라"}]
# 판정된 예측 넷 — 결과 카드·기록 화면이 살아나는 최소 상태.
PREDS = [
  {"sym":"AAPL","name":"애플","tier":"full","asOf":"2026-08-14","base":233.0,"mid":234.2,
   "lo":233.1,"hi":235.3,"basicLo":232.0,"basicHi":236.0,"judgedOn":"2026-08-15",
   "hit":True,"miss":0,"actual":233.9,"basicHit":True,"narrowedAndMissed":False,"seen":False},
  {"sym":"NVDA","name":"엔비디아","tier":"full","asOf":"2026-08-14","base":117.0,"mid":117.4,
   "lo":116.9,"hi":118.0,"basicLo":115.0,"basicHi":119.5,"judgedOn":"2026-08-15",
   "hit":True,"miss":0,"actual":117.4,"basicHit":True,"narrowedAndMissed":False,"seen":False},
  {"sym":"TSLA","name":"테슬라","tier":"full","asOf":"2026-08-14","base":244.0,"mid":245.2,
   "lo":244.0,"hi":246.4,"basicLo":242.0,"basicHi":250.0,"judgedOn":"2026-08-15",
   "hit":False,"miss":0.4,"actual":246.8,"basicHit":True,"narrowedAndMissed":True,"seen":False},
  {"sym":"AAPL","name":"애플","tier":"custom","asOf":"2026-08-15","base":234.0,"mid":235.0,
   "lo":234.2,"hi":235.8,"basicLo":232.0,"basicHi":238.0,"judgedOn":"2026-08-16",
   "hit":False,"miss":1.8,"actual":237.6,"basicHit":True,"narrowedAndMissed":True,"seen":True}
]
# 스캔 기록 — 뒤집힌 둘.
SCANS = {
  "TSLA": {"price": 246.8, "chg": 1.9, "dir": "bull", "prevDir": "bear", "flipped": True, "spark": [], "conf": 0.6},
  "NVDA": {"price": 117.4, "chg": -0.7, "dir": "neutral", "prevDir": "bull", "flipped": True, "spark": [], "conf": 0.5},
  "AAPL": {"price": 234.1, "chg": 0.1, "dir": "bull", "prevDir": "bull", "flipped": False, "spark": [], "conf": 0.63}
}

def page(name, seed, go=None, delay=500):
    js = "<script>try{localStorage.clear();"
    for k, v in seed.items():
        js += 'localStorage.setItem(%s,%s);' % (json.dumps(k), json.dumps(json.dumps(v, ensure_ascii=False)))
    js += "}catch(e){}</script>\n" + TAG
    if go:
        js += '\n<script>setTimeout(function(){try{MSApp.go(%s);}catch(e){}},%d);</script>' % (go, delay)
    open("__s_%s.html" % name, "w", encoding="utf-8").write(base.replace(TAG, js))

ON = {"ms_onboarded": True, "ms_consent": {"termsVersion": "2026-08-17", "at": "2026-08-16T00:00:00Z"},
      "ms_watchlist": WL}

page("onboarding", {})                                        # 첫 설치 — 아무것도 없다
page("watchlist", dict(ON, ms_preds=PREDS, ms_scan=SCANS))
page("record", dict(ON, ms_preds=PREDS), go='"record"')
page("result", dict(ON, ms_preds=PREDS), go='"result",{sym:"TSLA",asOf:"2026-08-14"}')
page("scanresult", dict(ON, ms_preds=PREDS, ms_scan=SCANS), go='"scanresult"')
page("report", dict(ON, ms_preds=PREDS), go='"report",{sym:"AAPL"}', delay=800)
page("wallet", ON, go='"wallet"')
PY

python3 "$WORK/https.py" "$WWW" "$WORK/cert.pem" "$WORK/key.pem" >/dev/null 2>&1 &
sleep 2

shoot() {   # shoot <이름> <높이>
  timeout 150 env LD_LIBRARY_PATH="$LIBS" "$CHROME" --headless=new --disable-gpu --no-sandbox \
    --ignore-certificate-errors \
    --host-resolver-rules="MAP parksvc.mycafe24.com:443 127.0.0.1:8932, MAP * 127.0.0.1:1, EXCLUDE 127.0.0.1" \
    --window-size=390,"${2:-900}" --screenshot="$OUT/$1.png" --virtual-time-budget=20000 \
    "https://parksvc.mycafe24.com/__s_$1.html" >/dev/null 2>&1 || echo "  (실패: $1)"
}

for s in onboarding watchlist record result scanresult report wallet; do
  shoot "$s" 1000
  echo "  찍음: $s"
done
echo "→ $OUT"
