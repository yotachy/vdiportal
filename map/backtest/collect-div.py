import yfinance as yf, json, warnings, time, sys
warnings.filterwarnings('ignore')
syms = open('/tmp/us-syms.txt').read().split()
out = {}
for s in syms:
    try:
        d = yf.Ticker(s).dividends
        dates = sorted([idx.strftime('%Y-%m-%d') for idx in d.index]) if d is not None and len(d) else []
        out[s] = dates
        sys.stderr.write(f"{s} {len(dates)}\n")
    except Exception as e:
        out[s] = []; sys.stderr.write(f"{s} err\n")
    time.sleep(0.4)
json.dump(out, open('earn-div.json','w'))
sys.stderr.write("done\n")
