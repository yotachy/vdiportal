#!/usr/bin/env python3
# collect-insider.py — EDGAR DERA Form 345 분기 데이터셋 → insider-events.json
# 오픈마켓 매수 P / 매도 S만(재량 거래). look-ahead 안전 = FILING_DATE(공시일) 기준. rel-lab 31 US 유니버스.
import urllib.request, zipfile, io, json, os, time, sys

_TF = os.environ.get("TICKERS_FILE")
if _TF:
    import json as _j
    TICKERS = set(_j.load(open(_TF)))
    OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.environ.get("OUT_NAME", "insider-events-smallcap.json"))
else:
    TICKERS = set("AAPL MSFT NVDA INTC BABA PYPL DIS T IBM CSCO VZ PFE KO WBA GE JPM BAC WMT HD PG JNJ UNH XOM CVX V MA ORCL CRM AMD QCOM CAT".split())
    OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "insider-events.json")
UA = "scoopforge-research moneyscdev@gmail.com"
BASE = "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/"
SMOKE = os.environ.get("SMOKE") == "1"

MON = {"JAN": "01", "FEB": "02", "MAR": "03", "APR": "04", "MAY": "05", "JUN": "06",
       "JUL": "07", "AUG": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"}
def pdate(s):  # "05-FEB-2024" -> "2024-02-05"
    p = (s or "").split("-")
    return p[2] + "-" + MON.get(p[1].upper(), "01") + "-" + p[0].zfill(2) if len(p) == 3 else None

def roleRank(title):
    t = (title or "").upper()
    if "CEO" in t or "CHIEF EXECUTIVE" in t or "PRESIDENT" in t or "CFO" in t or "CHIEF FINANCIAL" in t:
        return 3
    if "OFFICER" in t or "CHIEF" in t or "VP" in t or "VICE PRES" in t:
        return 2
    return 1

def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            return urllib.request.urlopen(req, timeout=90).read()
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2)

def readtsv(z, name):
    with z.open(name) as f:
        return f.read().decode("utf-8", "replace").splitlines()

def cidx(header, names):
    h = header.split("\t")
    return {n: h.index(n) for n in names if n in h}

events = {t: [] for t in TICKERS}

def quarters():
    if SMOKE:
        yield 2024, 1
        yield 2024, 2
        return
    for y in range(2006, 2027):
        for q in range(1, 5):
            yield y, q

for y, q in quarters():
    url = "%s%dq%d_form345.zip" % (BASE, y, q)
    try:
        raw = fetch(url)
        z = zipfile.ZipFile(io.BytesIO(raw))
    except Exception:
        continue  # 미출시 분기(미래) 등
    time.sleep(0.12)  # rate limit
    try:
        sub = readtsv(z, "SUBMISSION.tsv")
        si = cidx(sub[0], ["ACCESSION_NUMBER", "FILING_DATE", "DOCUMENT_TYPE", "ISSUERTRADINGSYMBOL"])
        acc2 = {}
        for ln in sub[1:]:
            c = ln.split("\t")
            if len(c) <= max(si.values()):
                continue
            if c[si["DOCUMENT_TYPE"]] != "4":
                continue
            sym = c[si["ISSUERTRADINGSYMBOL"]].strip().upper()
            if sym not in TICKERS:
                continue
            acc2[c[si["ACCESSION_NUMBER"]]] = (sym, pdate(c[si["FILING_DATE"]]))
        if not acc2:
            sys.stderr.write("%dq%d: 0\n" % (y, q))
            continue
        own = readtsv(z, "REPORTINGOWNER.tsv")
        oi = cidx(own[0], ["ACCESSION_NUMBER", "RPTOWNERCIK", "RPTOWNER_TITLE"])
        role = {}
        for ln in own[1:]:
            c = ln.split("\t")
            if len(c) <= max(oi.values()):
                continue
            a = c[oi["ACCESSION_NUMBER"]]
            if a in acc2 and a not in role:
                role[a] = (c[oi["RPTOWNERCIK"]], roleRank(c[oi["RPTOWNER_TITLE"]]))
        trs = readtsv(z, "NONDERIV_TRANS.tsv")
        ti = cidx(trs[0], ["ACCESSION_NUMBER", "TRANS_CODE", "TRANS_SHARES", "TRANS_PRICEPERSHARE"])
        for ln in trs[1:]:
            c = ln.split("\t")
            if len(c) <= max(ti.values()):
                continue
            a = c[ti["ACCESSION_NUMBER"]]
            if a not in acc2:
                continue
            code = c[ti["TRANS_CODE"]].strip()
            if code not in ("P", "S"):
                continue
            try:
                sh = float(c[ti["TRANS_SHARES"]] or 0)
                px = float(c[ti["TRANS_PRICEPERSHARE"]] or 0)
            except Exception:
                continue
            sym, filed = acc2[a]
            if not filed:
                continue
            oc, rr = role.get(a, ("", 1))
            events[sym].append({"filed": filed, "code": code, "shares": sh, "value": sh * px, "roleRank": rr, "ownerCik": oc})
        sys.stderr.write("%dq%d: %d cum\n" % (y, q, sum(len(v) for v in events.values())))
    except Exception as e:
        sys.stderr.write("%dq%d ERR %s\n" % (y, q, e))
        continue

for s in events:
    events[s].sort(key=lambda e: e["filed"])
json.dump(events, open(OUT, "w"))
cov = {s: len(v) for s, v in events.items() if v}
print("coverage:", len(cov), "/", len(TICKERS), "tickers")
print("total events:", sum(len(v) for v in events.values()))
print("per-ticker sample:", dict(list({s: len(events[s]) for s in sorted(TICKERS)}.items())[:10]))
