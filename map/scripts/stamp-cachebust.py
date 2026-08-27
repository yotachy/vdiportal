#!/usr/bin/env python3
# 캐시버스터 스탬프 — cafe24 가 css/js 를 max-age 604800(7일) 로 캐시하므로, 버전 쿼리가 없으면
# 배포해도 사용자가 옛 파일을 쓴다. 이 스크립트가 app/index.html·forge.html 의 로컬 자산 참조에
# ?v=<STAMP> 를 붙이거나 갱신한다. 배포 직전 실행: python3 scripts/stamp-cachebust.py <STAMP>
# STAMP 예: 20260825b. app-forge-frame.js 의 iframe forge.html?...&v= 도 같이 갱신한다.
import re, sys, os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
stamp = sys.argv[1] if len(sys.argv) > 1 else None
if not stamp:
    print("usage: stamp-cachebust.py <STAMP>  (예: 20260825b)"); sys.exit(1)

def stamp_html(path, patterns):
    p = os.path.join(HERE, path)
    s = open(p).read(); orig = s; n = 0
    for pat in patterns:
        # src="name.js" 또는 src="name.js?v=old" → src="name.js?v=STAMP"
        rx = re.compile(r'((?:src|href)=")(' + pat + r')(\?v=[^"]*)?(")')
        def repl(m):
            nonlocal n; n += 1
            return m.group(1) + m.group(2) + "?v=" + stamp + m.group(4)
        s = rx.sub(repl, s)
    if s != orig: open(p, "w").write(s)
    print(path, "→", n, "refs stamped")

# 앱: app-*.js · app.css · ../forge-core.js (앱의 채점 analyze 가 직접 로드하는 엔진 — 반드시 버스트).
# 엔진을 상대참조하지만 캐시버스터가 없으면 앱은 옛 엔진을 7일 물고 있게 된다(cycle 성능 사고 계열).
stamp_html("app/index.html", [r'app[\w-]*\.js', r'app\.css', r'\.\./forge-core\.js'])
# 포지: forge-*.js · forge.css
stamp_html("forge.html", [r'forge[\w-]*\.js', r'forge\.css'])

# app-forge-frame.js 의 iframe forge.html?embed=app&...&v=STAMP — 같은 스탬프로(사용자가 새 forge 자산을 받게)
fp = os.path.join(HERE, "app/app-forge-frame.js")
s = open(fp).read()
# ⚠ URL 이 JS 문자열 연결로 끊긴다("...&th=" + th + "&v=20260826k") — 따옴표를 건너뛰지 못하는
# 패턴은 조용히 0건 매치로 끝나고, 앱 iframe 만 옛 버전에 고정된다(2026-08-28 실제로 그랬다).
# 그래서 그 파일 안의 버전 리터럴(YYYYMMDD+영문자)을 직접 찍는다.
s2 = re.sub(r'(&v=)(\d{8}[a-z]+)', r'\g<1>' + stamp, s)
if s2 != s: open(fp, "w").write(s2); print("app-forge-frame.js iframe v →", stamp)
else: print("app-forge-frame.js iframe v: no change (패턴 확인)")
