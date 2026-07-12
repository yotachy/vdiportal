// backtest/collect-intraday.js — 1h 인트라데이 수집(TwelveData 직접·로컬 forge_td_key.txt·end_date 페이징)
// 미국주식 30종 × 3페이지(≈8.6년, 페이지당 5000봉) → fixtures-intraday/{SYM}-1h.json (compact 배열, gitignore·재수집 가능)
// 레이트리밋 8req/min → 8.5s 슬립. 실측(2026-07-12): 1h 1페이지=2.9년, end_date 페이징 정상.
"use strict";
const fs = require("fs"), path = require("path");

const US = ["AAPL","MSFT","NVDA","INTC","BABA","PYPL","DIS","T","IBM","CSCO","VZ","PFE","KO","GE",
  "JPM","BAC","WMT","HD","PG","JNJ","UNH","XOM","CVX","V","MA","ORCL","CRM","AMD","QCOM","CAT"];
const PAGES = 3, IV = "1h";
const KEY = fs.readFileSync(path.join(__dirname, "..", "forge_td_key.txt"), "utf8").trim();
const _sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(sym, endDate) {
  const u = "https://api.twelvedata.com/time_series?symbol=" + encodeURIComponent(sym) + "&interval=" + IV
    + "&outputsize=5000" + (endDate ? "&end_date=" + encodeURIComponent(endDate) : "") + "&format=JSON&apikey=" + KEY;
  const r = await fetch(u); const j = await r.json();
  if (!j || !Array.isArray(j.values)) { console.warn("  페이지 실패:", sym, endDate || "(최신)", (j && j.message || "").slice(0, 80)); return null; }
  return j.values;   // 내림차순 [{datetime,open,high,low,close,volume}]
}

(async () => {
  const dir = path.join(__dirname, "fixtures-intraday");
  fs.mkdirSync(dir, { recursive: true });
  for (const sym of US) {
    const fp = path.join(dir, sym.replace(/[\/\\]/g, "-") + "-1h.json");
    if (fs.existsSync(fp) && process.env.BT_FORCE !== "1") { console.log("스킵(기존):", sym); continue; }
    const seen = new Map();   // datetime → bar (페이지 경계 중복 제거)
    let endDate = null;
    for (let p = 0; p < PAGES; p++) {
      const vals = await fetchPage(sym, endDate);
      await _sleep(8500);
      if (!vals || !vals.length) break;
      for (const v of vals) {
        const c = +v.close;
        if (isFinite(c) && c > 0) seen.set(v.datetime, [v.datetime, +(+v.open).toFixed(4), +(+v.high).toFixed(4), +(+v.low).toFixed(4), +c.toFixed(4), (v.volume != null && isFinite(+v.volume)) ? +v.volume : 0]);
      }
      endDate = vals[vals.length - 1].datetime;   // 다음 페이지 = 이 페이지 최고(最古) 이전
    }
    const bars = [...seen.values()].sort((a, b) => a[0] < b[0] ? -1 : 1);
    if (bars.length < 3000) { console.warn("건너뜀(부족):", sym, bars.length + "봉"); continue; }
    fs.writeFileSync(fp, JSON.stringify({ symbol: sym, interval: IV, from: bars[0][0], to: bars[bars.length - 1][0], bars }));
    console.log("저장:", sym, bars.length, "봉", bars[0][0].slice(0, 10), "~", bars[bars.length - 1][0].slice(0, 10));
  }
  console.log("완료");
})();
