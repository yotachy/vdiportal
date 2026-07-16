#!/usr/bin/env python3
# mine-insider-universe.py — DERA Form345에서 내부자 매수(P) 상위 US 티커 선정 → insider-universe.json
import urllib.request, zipfile, io, json, os, time, sys, csv
from collections import Counter, defaultdict
UA = "scoopforge-research moneyscdev@gmail.com"
BASE = "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "insider-universe.json")
MEGA = set("AAPL MSFT NVDA INTC BABA PYPL DIS T IBM CSCO VZ PFE KO WBA GE JPM BAC WMT HD PG JNJ UNH XOM CVX V MA ORCL CRM AMD QCOM CAT SPY IWM".split())

def fetch(url, tries=3):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90).read()
        except Exception:
            if i == tries-1: raise
            time.sleep(2)

buyCnt = Counter(); buyDol = defaultdict(float)
for y in range(2006, 2027):
    for q in range(1, 5):
        try:
            z = zipfile.ZipFile(io.BytesIO(fetch("%s%dq%d_form345.zip" % (BASE, y, q))))
        except Exception:
            continue
        time.sleep(0.12)
        try:
            acc = {}
            for row in csv.DictReader(io.StringIO(z.read("SUBMISSION.tsv").decode("utf-8","replace")), delimiter="\t"):
                if row.get("DOCUMENT_TYPE") == "4":
                    t = (row.get("ISSUERTRADINGSYMBOL") or "").strip().upper()
                    if t and t != "N/A" and "." not in t and t not in MEGA and 1 <= len(t) <= 5 and t[0].isalpha():
                        acc[row["ACCESSION_NUMBER"]] = t
            for row in csv.DictReader(io.StringIO(z.read("NONDERIV_TRANS.tsv").decode("utf-8","replace")), delimiter="\t"):
                if row.get("TRANS_CODE") == "P" and row["ACCESSION_NUMBER"] in acc:
                    t = acc[row["ACCESSION_NUMBER"]]; buyCnt[t] += 1
                    try: buyDol[t] += float(row.get("TRANS_SHARES") or 0) * float(row.get("TRANS_PRICEPERSHARE") or 0)
                    except: pass
            sys.stderr.write("%dq%d: %d tickers cum\n" % (y, q, len(buyCnt)))
        except Exception as e:
            sys.stderr.write("%dq%d ERR %s\n" % (y, q, e)); continue

top = buyCnt.most_common(60)
uni = [{"sym": t, "buyCount": c, "buyDollars": round(buyDol[t])} for t, c in top]
json.dump(uni, open(OUT, "w"), indent=0)
print("top 60 insider-buy tickers (non-mega):")
for u in uni[:40]: print("  %-6s buys=%d  $%.0fM" % (u["sym"], u["buyCount"], u["buyDollars"]/1e6))
