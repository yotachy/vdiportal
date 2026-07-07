// backtest/fetch-fixtures.js — 실데이터 OHLC 픽스처 1회 수집(node18 내장 fetch)
// loadTicker/fetchOHLC(forge-app.js)와 동일 규약: forge-api.php?ohlc=1&symbol=X&tf=Y → {ok, candles:[{o,h,l,c}]}
"use strict";
const fs = require("fs"), path = require("path");

const API = process.env.BT_API || "https://parksvc.mycafe24.com/map/forge-api.php";
const UNIVERSE = [
  // 강세(secular up) — 기존
  ["NVDA", "1day"], ["AAPL", "1day"], ["MSFT", "1day"],
  ["BTC/USD", "1day"], ["ETH/USD", "1day"],
  ["USD/KRW", "1week"], ["USD/KRW", "1day"],
  ["005930", "1day"], ["000660", "1day"],
  // 하락/부진 — 국면 다양성 위해 추가
  ["INTC", "1day"], ["BABA", "1day"], ["PYPL", "1day"], ["DIS", "1day"], ["T", "1day"], ["NIO", "1day"],
  // 횡보/범위 — 환율·경기민감
  ["EUR/USD", "1day"], ["F", "1day"], ["GE", "1day"],
];

async function fetchOne(symbol, tf) {
  const url = API + "?ohlc=1&symbol=" + encodeURIComponent(symbol) + "&tf=" + encodeURIComponent(tf || "1day");
  const res = await fetch(url, { cache: "no-store" });
  let j = null; try { j = await res.json(); } catch (_) {}
  if (!j || !j.ok || !Array.isArray(j.candles)) return null;
  const candle = j.candles.map(d => {
    const c = { o: +(+d.o).toFixed(4), h: +(+d.h).toFixed(4), l: +(+d.l).toFixed(4), c: +(+d.c).toFixed(4) };
    if (d.v != null && isFinite(+d.v)) c.v = +d.v;
    return c;
  }).filter(d => isFinite(d.c) && d.c > 0);
  return { symbol, tf, candle };
}

(async () => {
  const dir = path.join(__dirname, "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  for (const [sym, tf] of UNIVERSE) {
    try {
      const fx = await fetchOne(sym, tf);
      if (!fx || fx.candle.length < 260) { console.warn("건너뜀(데이터 부족/실패):", sym, tf, fx ? fx.candle.length + "봉" : ""); continue; }
      const name = sym.replace(/[\/\\]/g, "-") + "-" + tf + ".json";
      fs.writeFileSync(path.join(dir, name), JSON.stringify(fx));
      console.log("저장:", name, fx.candle.length, "봉");
    } catch (e) { console.warn("실패:", sym, tf, e.message); }
  }
  console.log("완료 — 이제 `BT_STAMP=<ISO> node backtest/backtest.js` 실행");
})();
