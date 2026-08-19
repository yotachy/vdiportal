# 시안 아트보드(MoneyScoop 동선.dc.html)를 낱장 HTML 로 뽑는다 — 앱 화면과 나란히 두고 대조하기 위한 것.
# 사용: python3 mobile/tools/spec-shot.py <출력디렉터리> 14a 18a 10b ...  → 이후 chrome --screenshot 으로 렌더.
import re, sys, os, html
SRC = "/home/jschoi0223/projects/vdiportal/map/mobile/docs/design_handoff/MoneyScoop 동선.dc.html"
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
doc = open(SRC, encoding="utf-8").read()

# 마크 clipPath 정의 — 아트보드가 참조하므로 함께 실어야 원이 안 뭉갠다
m = re.search(r'(<svg width="0" height="0".*?</svg>)', doc, re.S)
defs = m.group(1) if m else ""

def extract(anchor):
    i = doc.find('<div id="%s"' % anchor)
    if i < 0: return None
    depth, j = 0, i
    for tm in re.finditer(r'<(/?)div\b[^>]*?(/?)>', doc[i:]):
        if tm.group(2) == "/": continue
        depth += -1 if tm.group(1) else 1
        if depth == 0:
            j = i + tm.end(); break
    return doc[i:j]

ids = sys.argv[2:]
for a in ids:
    frag = extract(a)
    if not frag:
        print("없음:", a); continue
    page = ("""<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">
<style>body{margin:0;padding:16px;background:#07090d;font-family:'Plus Jakarta Sans',sans-serif;width:max-content}</style>
</head><body>""" + defs + frag + "</body></html>")
    open(os.path.join(OUT, a + ".html"), "w", encoding="utf-8").write(page)
    print("추출:", a, len(frag), "바이트")
