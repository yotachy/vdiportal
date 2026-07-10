# yfinance로 US주식 30종 날짜포함 일봉 OHLC + 과거 실적일 수집 → earn-ohlc.json (자기완결)
import yfinance as yf, json, warnings, time, sys
warnings.filterwarnings('ignore')
syms = open('/tmp/us-syms.txt').read().split()
out = {}
for i, s in enumerate(syms):
    ok = False
    for r in range(3):
        try:
            df = yf.download(s, start='2005-01-01', end='2026-07-08', auto_adjust=True, progress=False)
            if df is None or len(df) < 500:
                sys.stderr.write(f"{s} OHLC 부족\n"); time.sleep(2); continue
            cds = []
            for idx, row in df.iterrows():
                cds.append({"t": idx.strftime('%Y-%m-%d'),
                            "o": float(row['Open'].iloc[0] if hasattr(row['Open'],'iloc') else row['Open']),
                            "h": float(row['High'].iloc[0] if hasattr(row['High'],'iloc') else row['High']),
                            "l": float(row['Low'].iloc[0] if hasattr(row['Low'],'iloc') else row['Low']),
                            "c": float(row['Close'].iloc[0] if hasattr(row['Close'],'iloc') else row['Close']),
                            "v": float(row['Volume'].iloc[0] if hasattr(row['Volume'],'iloc') else row['Volume'])})
            ed = yf.Ticker(s).get_earnings_dates(limit=100)
            edates = sorted(set([d.strftime('%Y-%m-%d') for d in ed.index])) if ed is not None and len(ed) else []
            out[s] = {"candles": cds, "earnings": edates}
            sys.stderr.write(f"{s} → OHLC {len(cds)}봉 ({cds[0]['t']}~{cds[-1]['t']}) · 실적 {len(edates)}건\n")
            ok = True; break
        except Exception as e:
            sys.stderr.write(f"{s} 오류 {str(e)[:80]}\n"); time.sleep(3)
    if not ok: out[s] = None
    time.sleep(1)
json.dump(out, open('earn-ohlc.json','w'))
tot = sum(1 for v in out.values() if v)
sys.stderr.write(f"\n완료: {tot}/{len(syms)}종 → earn-ohlc.json\n")
