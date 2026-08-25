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

# 앱: app-*.js · app.css (엔진 ../forge-core.js 는 서버 상대참조라 forge.html 쪽에서 관리)
stamp_html("app/index.html", [r'app[\w-]*\.js', r'app\.css'])
# 포지: forge-*.js · forge.css
stamp_html("forge.html", [r'forge[\w-]*\.js', r'forge\.css'])

# app-forge-frame.js 의 iframe forge.html?embed=app&...&v=STAMP — 같은 스탬프로(사용자가 새 forge 자산을 받게)
fp = os.path.join(HERE, "app/app-forge-frame.js")
s = open(fp).read()
s2 = re.sub(r'(forge\.html\?embed=app[^"]*?&v=)[^"&]+', r'\g<1>' + stamp, s)
if s2 != s: open(fp, "w").write(s2); print("app-forge-frame.js iframe v →", stamp)
else: print("app-forge-frame.js iframe v: no change (패턴 확인)")
