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
  // 하락/부진
  ["INTC", "1day"], ["BABA", "1day"], ["PYPL", "1day"], ["DIS", "1day"], ["T", "1day"],
  // 횡보/범위 확대 — 환율(가장 확실한 range)
  ["EUR/USD", "1day"], ["GBP/USD", "1day"], ["USD/JPY", "1day"], ["AUD/USD", "1day"], ["EUR/USD", "1week"],
  // 횡보/박스권 성향 주식(성숙·부진)
  ["IBM", "1day"], ["CSCO", "1day"], ["VZ", "1day"], ["PFE", "1day"], ["KO", "1day"], ["WBA", "1day"], ["GE", "1day"],
  // 시장 기준(벤치마크) — 상대 방향 랩(rel-lab)용
  ["SPY", "1day"],
  // 미국 대형주 확대(횡단면 모멘텀 유니버스 강화 · 동일 거래일)
  ["JPM", "1day"], ["BAC", "1day"], ["WMT", "1day"], ["HD", "1day"], ["PG", "1day"], ["JNJ", "1day"], ["UNH", "1day"], ["XOM", "1day"],
  ["CVX", "1day"], ["V", "1day"], ["MA", "1day"], ["ORCL", "1day"], ["CRM", "1day"], ["AMD", "1day"], ["QCOM", "1day"], ["CAT", "1day"],
  // 모수 확대(2026-07-09) — US 쏠림 완화: 크립토·상품·한국 다양화
  ["SOL/USD", "1day"], ["XRP/USD", "1day"], ["ADA/USD", "1day"], ["DOGE/USD", "1day"], ["LTC/USD", "1day"], ["BCH/USD", "1day"],
  ["XAU/USD", "1day"], ["XAG/USD", "1day"], ["WTI/USD", "1day"], ["BRENT/USD", "1day"],
  ["035420", "1day"], ["005380", "1day"], ["051910", "1day"], ["068270", "1day"], ["035720", "1day"], ["105560", "1day"], ["012330", "1day"], ["055550", "1day"],
  // 주/월봉 확대 — 일/주/월 비교 표본 강화(기존 US 대형주 + 다양자산)
  ["JPM", "1week"], ["JPM", "1month"], ["V", "1week"], ["V", "1month"], ["WMT", "1week"], ["WMT", "1month"], ["JNJ", "1week"], ["JNJ", "1month"],
  ["XOM", "1week"], ["XOM", "1month"], ["AMD", "1week"], ["AMD", "1month"], ["KO", "1week"], ["KO", "1month"], ["PG", "1week"], ["PG", "1month"],
  ["ETH/USD", "1week"], ["ETH/USD", "1month"], ["EUR/USD", "1month"], ["USD/KRW", "1month"], ["000660", "1week"], ["000660", "1month"],
  // 주요 종목 주봉·월봉 — 일/주/월 비교용
  ["NVDA", "1week"], ["AAPL", "1week"], ["MSFT", "1week"], ["BTC/USD", "1week"], ["005930", "1week"], ["INTC", "1week"], ["BABA", "1week"], ["DIS", "1week"],
  ["NVDA", "1month"], ["AAPL", "1month"], ["MSFT", "1month"], ["BTC/USD", "1month"], ["005930", "1month"], ["INTC", "1month"], ["BABA", "1month"], ["DIS", "1month"],
];
const _sleep = ms => new Promise(r => setTimeout(r, ms));

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
  const cs = j.candles.filter(d => isFinite(+d.c) && +d.c > 0);
  const from = cs.length ? (cs[0].t || cs[0].datetime || "") : "", to = cs.length ? (cs[cs.length - 1].t || cs[cs.length - 1].datetime || "") : "";
  return { symbol, tf, from, to, candle };
}

(async () => {
  const dir = path.join(__dirname, "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  const force = process.env.BT_FORCE === "1";
  for (const [sym, tf] of UNIVERSE) {
    const name = sym.replace(/[\/\\]/g, "-") + "-" + tf + ".json";
    const fp = path.join(dir, name);
    if (!force && fs.existsSync(fp)) { console.log("스킵(기존):", name); continue; }
    try {
      const fx = await fetchOne(sym, tf);
      if (!fx || fx.candle.length < 260) { console.warn("건너뜀(데이터 부족/실패):", sym, tf, fx ? fx.candle.length + "봉" : ""); await _sleep(8500); continue; }
      fs.writeFileSync(fp, JSON.stringify(fx));
      console.log("저장:", name, fx.candle.length, "봉");
    } catch (e) { console.warn("실패:", sym, tf, e.message); }
    await _sleep(8500);   // 레이트리밋 회피(무료티어 ~8req/min)
  }
  console.log("완료 — 이제 `BT_STAMP=<ISO> node backtest/backtest.js` 실행");
})();
