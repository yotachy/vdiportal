import yfinance as yf, json, warnings, time, sys
warnings.filterwarnings('ignore')
syms = open('/tmp/us-syms.txt').read().split()
out = {}
for s in syms:
    try:
        df = yf.Ticker(s).get_earnings_dates(limit=100)
        rows = []
        for idx, r in df.iterrows():
            sp = r.get('Surprise(%)')
            try: spv = float(sp)
            except: spv = None
            if spv is not None and spv == spv:   # not NaN
                rows.append({"date": idx.strftime('%Y-%m-%d'), "sp": round(spv,2)})
        rows.sort(key=lambda x: x["date"])
        out[s] = rows
        sys.stderr.write(f"{s} → {len(rows)} 서프라이즈\n")
    except Exception as e:
        sys.stderr.write(f"{s} 오류 {str(e)[:60]}\n"); out[s] = []
    time.sleep(0.5)
json.dump(out, open('earn-surprise.json','w'))
sys.stderr.write(f"완료: {sum(len(v) for v in out.values())}건\n")
