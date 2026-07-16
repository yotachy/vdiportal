#!/usr/bin/env python3
# collect-shortint.py — FINRA 공매도잔고 유니버스 전 이력 → shortint-series.json. look-ahead: pub=settle+14일.
import urllib.request, json, os, io, csv, sys, calendar
from datetime import date, timedelta
UA = "scoopforge-research moneyscdev@gmail.com"
URL = "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest"
HERE = os.path.dirname(os.path.abspath(__file__))
UNI = set(u["sym"] for u in json.load(open(os.path.join(HERE, "shortint-universe.json"))))
OUT = os.path.join(HERE, "shortint-series.json")

def sdates():
    out = []; y, m = 2019, 1
    while (y, m) <= (2026, 7):
        out.append("%04d-%02d-15" % (y, m))
        out.append("%04d-%02d-%02d" % (y, m, calendar.monthrange(y, m)[1]))
        m += 1
        if m > 12: m = 1; y += 1
    return out

def query(sd, offset):
    body = json.dumps({"limit": 5000, "offset": offset, "compareFilters": [{"fieldName": "settlementDate", "fieldValue": sd, "compareType": "equal"}]}).encode()
    req = urllib.request.Request(URL, data=body, headers={"User-Agent": UA, "Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")

def pub(sd):  # settle+14 calendar days (공시 지연 보수)
    y, m, d = map(int, sd.split("-"))
    return (date(y, m, d) + timedelta(days=14)).isoformat()

ev = {s: [] for s in UNI}
for sd in sdates():
    try:
        rows = []
        for off in (0, 5000):
            txt = query(sd, off); r = list(csv.DictReader(io.StringIO(txt))); rows += r
            if len(r) < 5000: break
        if not rows: continue
        p = pub(sd)
        for row in rows:
            s = (row.get("symbolCode") or "").strip().upper()
            if s not in UNI: continue
            try:
                cur = float(row.get("currentShortPositionQuantity") or 0); prev = float(row.get("previousShortPositionQuantity") or 0)
                dtc = float(row.get("daysToCoverQuantity") or 0); adv = float(row.get("averageDailyVolumeQuantity") or 0)
                chg = float(row.get("changePercent") or 0)
            except: continue
            ev[s].append({"settle": sd, "pub": p, "cur": cur, "prev": prev, "dtc": dtc, "chg": chg, "adv": adv})
        sys.stderr.write("%s: %d cum\n" % (sd, sum(len(v) for v in ev.values())))
    except Exception as e:
        sys.stderr.write("%s ERR %s\n" % (sd, e)); continue

for s in ev: ev[s].sort(key=lambda x: x["pub"])
json.dump(ev, open(OUT, "w"))
cov = {s: len(v) for s, v in ev.items() if v}
print("coverage:", len(cov), "/", len(UNI), "· total obs:", sum(len(v) for v in ev.values()))
print("sample:", dict(list(cov.items())[:8]))
