// backtest/collect-earnings-edgar.js — 소형주 실적일 수집(EDGAR 8-K item 2.02, 전체이력)
// fixtures-shortint 심볼 → CIK → 8-K 2.02(Results of Operations) filingDate → smallcap-earnings.json
"use strict";
const fs = require("fs"), path = require("path");
const FDIR = path.join(__dirname, "fixtures-shortint");
const OUT = path.join(__dirname, "smallcap-earnings.json");
const UA = { "User-Agent": "scoopforge-research moneyscdev@gmail.com" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SKIP = new Set(["IJR", "SPY"]);

async function getJSON(url) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(500 * (a + 1));
  }
  return null;
}
// 8-K 중 item 2.02(실적) 포함 필터 → filingDate 배열
function earnDates(recent) {
  const { form = [], items = [], filingDate = [] } = recent || {};
  const out = [];
  for (let i = 0; i < form.length; i++)
    if (form[i] === "8-K" && (items[i] || "").includes("2.02")) out.push(filingDate[i]);
  return out;
}

(async () => {
  const syms = fs.readdirSync(FDIR).filter(f => f.endsWith(".json") && !f.startsWith("_"))
    .map(f => f.replace(".json", "")).filter(s => !SKIP.has(s));
  console.log("심볼 " + syms.length + "종. CIK 맵 로드…");
  const ct = await getJSON("https://www.sec.gov/files/company_tickers.json");
  if (!ct) { console.error("company_tickers.json 실패"); process.exit(1); }
  const cikMap = {};
  for (const k in ct) cikMap[String(ct[k].ticker).toUpperCase()] = String(ct[k].cik_str).padStart(10, "0");
  await sleep(150);

  const result = {}, zero = [];
  for (const sym of syms) {
    const cik = cikMap[sym.toUpperCase()];
    if (!cik) { result[sym] = []; zero.push(sym + "(no-CIK)"); continue; }
    const sub = await getJSON("https://data.sec.gov/submissions/CIK" + cik + ".json");
    await sleep(150);
    let dates = [];
    if (sub) {
      dates = earnDates(sub.filings && sub.filings.recent);
      const files = (sub.filings && sub.filings.files) || [];
      for (const f of files) {
        const shard = await getJSON("https://data.sec.gov/submissions/" + f.name);
        await sleep(150);
        if (shard) dates = dates.concat(earnDates(shard));  // 구 shard는 recent와 동일 구조(배열 필드)
      }
    }
    dates = [...new Set(dates)].sort();
    result[sym] = dates;
    if (!dates.length) zero.push(sym);
    console.log(sym.padEnd(6) + " " + String(dates.length).padStart(3) + "건" + (dates.length ? "  " + dates[0] + "~" + dates[dates.length - 1] : ""));
  }
  fs.writeFileSync(OUT, JSON.stringify(result));
  const vals = Object.values(result);
  console.log("\n=== 저장: smallcap-earnings.json ===");
  console.log("종목 " + vals.length + " · 실적일총 " + vals.reduce((a, b) => a + b.length, 0) + " · 비영종목 " + vals.filter(a => a.length).length);
  console.log("0건(외국계/무CIK): " + zero.join(", "));
})();
