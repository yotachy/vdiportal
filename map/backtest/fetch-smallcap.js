// backtest/fetch-smallcap.js — 중소형주 OHLC(날짜 t 포함) 수집 → fixtures-smallcap/{sym}.json
// insider-universe.json(마이닝 결과) + IWM·SPY 벤치. forge-api 프록시. 실패/결측 스킵.
"use strict";
const fs = require("fs"), path = require("path");
const API = process.env.BT_API || "https://parksvc.mycafe24.com/map/forge-api.php";
const DIR = path.join(__dirname, "fixtures-smallcap");
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

const uni = JSON.parse(fs.readFileSync(path.join(__dirname, "insider-universe.json"), "utf8"));
const syms = uni.map(u => u.sym).concat(["IJR", "SPY"]);   // IWM notfound → IJR(S&P SmallCap600) 벤치

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchOne(sym) {
  const fp = path.join(DIR, sym + ".json");
  if (fs.existsSync(fp)) { try { const ex = JSON.parse(fs.readFileSync(fp, "utf8")); if (ex.candle && ex.candle.length >= 1000) return { sym, n: ex.candle.length, ok: true, cached: true }; } catch (e) {} }
  for (let tr = 0; tr < 3; tr++) {
    try {
      const r = await fetch(API + "?ohlc=1&symbol=" + encodeURIComponent(sym) + "&tf=1day", { signal: AbortSignal.timeout(45000) });
      const d = await r.json();
      if (d && d.ok && Array.isArray(d.candles) && d.candles.length >= 1000) {
        const candle = d.candles.map(c => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c }));
        fs.writeFileSync(fp, JSON.stringify({ symbol: sym, from: candle[0].t, to: candle[candle.length - 1].t, candle }));
        return { sym, n: candle.length, ok: true };
      }
      if (d && d.error === "notfound") return { sym, n: 0, ok: false, err: "notfound" };   // 재시도 무의미
    } catch (e) {}
    await sleep(8000);   // rate-limit 백오프
  }
  return { sym, n: 0, ok: false, err: "retries-exhausted" };
}

(async () => {
  const kept = [], missed = [];
  for (const s of syms) {
    const r = await fetchOne(s);
    if (r.ok) { kept.push(s); process.stdout.write("OK  " + s + " (" + r.n + ")\n"); }
    else { missed.push(s); process.stdout.write("--  " + s + " (" + r.n + ")" + (r.err ? " " + r.err : "") + "\n"); }
    await sleep(8000);   // TwelveData 8/min
  }
  console.log("\n채택 " + kept.length + " / " + syms.length + " · 결측 " + missed.length);
  console.log("missed:", missed.join(" "));
  fs.writeFileSync(path.join(DIR, "_kept.json"), JSON.stringify(kept));
})();
