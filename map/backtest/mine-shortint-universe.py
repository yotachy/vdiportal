#!/usr/bin/env python3
# mine-shortint-universe.py — FINRA 공매도잔고에서 고공매도(daysToCover 상위) 종목 → shortint-universe.json
import urllib.request, json, os, io, csv, sys, calendar
from collections import defaultdict
UA = "scoopforge-research moneyscdev@gmail.com"
URL = "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shortint-universe.json")
EXCL = set("IJR SPY IWM VXX SQQQ TQQQ SOXL SOXS UVXY".split())  # ETF/벤치/레버리지 제외

def settlement_dates(y0, m0, y1, m1):
    out = []
    y, m = y0, m0
    while (y, m) <= (y1, m1):
        out.append("%04d-%02d-15" % (y, m))
        out.append("%04d-%02d-%02d" % (y, m, calendar.monthrange(y, m)[1]))
        m += 1
        if m > 12: m = 1; y += 1
    return out

def query(sdate, offset=0):
    body = json.dumps({"limit": 5000, "offset": offset, "compareFilters": [{"fieldName": "settlementDate", "fieldValue": sdate, "compareType": "equal"}]}).encode()
    req = urllib.request.Request(URL, data=body, headers={"User-Agent": UA, "Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")

# 최근 8개 settlement로 마이닝(2024~2025)
dates = settlement_dates(2024, 6, 2025, 6)[-8:]
dtc = defaultdict(list); vol = defaultdict(list)
for sd in dates:
    try:
        rows = []
        for off in (0, 5000):
            txt = query(sd, off)
            r = list(csv.DictReader(io.StringIO(txt)))
            rows += r
            if len(r) < 5000: break
        if not rows: sys.stderr.write(sd + ": 0\n"); continue
        for row in rows:
            s = (row.get("symbolCode") or "").strip().upper()
            if not s or s in EXCL or "." in s or len(s) > 5 or not s[0].isalpha(): continue
            if len(s) == 5 and s[-1] in ("F", "Y"): continue  # 외국 OTC(foreign ordinary/ADR) 제외
            try:
                d = float(row.get("daysToCoverQuantity") or 0); v = float(row.get("averageDailyVolumeQuantity") or 0)
            except: continue
            if d > 0 and v > 1000000:  # 유동성 1M+  # 유동성 게이트(초저유동 junk 제외)
                dtc[s].append(d); vol[s].append(v)
        sys.stderr.write("%s: %d syms cum\n" % (sd, len(dtc)))
    except Exception as e:
        sys.stderr.write("%s ERR %s\n" % (sd, e)); continue

def med(a): a = sorted(a); n = len(a); return a[n//2] if n else 0
ranked = sorted(((s, med(dtc[s]), med(vol[s]), len(dtc[s])) for s in dtc if len(dtc[s]) >= 4), key=lambda x: -x[1])
top = ranked[:60]
json.dump([{"sym": s, "medDTC": round(d, 2), "medVol": round(v)} for s, d, v, n in top], open(OUT, "w"), indent=0)
print("고공매도 top 60 (median days-to-cover):")
for s, d, v, n in top[:40]: print("  %-6s DTC=%.1f  vol=%.1fM" % (s, d, v/1e6))
