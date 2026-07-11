// collect-8k.js — SEC EDGAR에서 종목별 8-K 공시일+item코드 수집(비실적 이벤트 축 검증용).
// 무료·키불필요(User-Agent 필수). earn-ohlc.json 30종과 동일 유니버스. 결과 8k-events.json(gitignore·재수집 가능).
// 실행: node backtest/collect-8k.js  (SEC 레이트리밋 준수 딜레이 내장)
"use strict";
const fs = require("fs"), path = require("path");
const UA = "ScoopForge research moneyscdev@gmail.com";
const SYMS = "AAPL AMD BABA BAC CAT CRM CSCO CVX DIS GE HD IBM INTC JNJ JPM KO MA MSFT NVDA ORCL PFE PG PYPL QCOM T UNH V VZ WMT XOM".split(" ");
const OUT = path.join(__dirname, "8k-events.json");
// company_tickers 오작동 보정: XOM이 신설지주(CIK 2115436·1건)로 매핑됨 → 실제 Exxon Mobil Corp.
// BABA는 외국기업(6-K 제출)이라 8-K 없음 — 수집서 자연 제외(0건).
const CIK_OVERRIDE = { XOM: 34088 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url) {
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
      if (res.status === 200) return await res.json();
      if (res.status === 404) return null;
      await sleep(800 * (a + 1));
    } catch (e) { await sleep(800 * (a + 1)); }
  }
  return null;
}

function pad10(cik) { return String(cik).padStart(10, "0"); }

// 하나의 filings 블록(recent 또는 파일)에서 8-K만 뽑기
function extract8K(block, out) {
  if (!block || !block.form) return;
  const { form, filingDate, items } = block;
  for (let i = 0; i < form.length; i++) {
    if (form[i] === "8-K") out.push({ d: filingDate[i], items: items[i] || "" });
  }
}

async function main() {
  // ticker→CIK
  const tickJson = await getJSON("https://www.sec.gov/files/company_tickers.json");
  if (!tickJson) { console.error("company_tickers 실패"); process.exit(1); }
  const cikMap = {};
  for (const r of Object.values(tickJson)) if (!(r.ticker in cikMap)) cikMap[r.ticker] = r.cik_str;

  const result = {};
  for (const sym of SYMS) {
    const cik = CIK_OVERRIDE[sym] || cikMap[sym];
    if (!cik) { console.log(sym, "CIK 없음 — 건너뜀"); continue; }
    const events = [];
    const main = await getJSON(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`);
    await sleep(180);
    if (!main) { console.log(sym, "submissions 실패"); continue; }
    extract8K(main.filings && main.filings.recent, events);
    // 과거 파일(2005 이전 커버 위해 전부 병합)
    const files = (main.filings && main.filings.files) || [];
    for (const f of files) {
      const blk = await getJSON(`https://data.sec.gov/submissions/${f.name}`);
      await sleep(180);
      if (blk) extract8K(blk, events);   // 과거파일은 그 자체가 recent와 동형(form/filingDate/items 배열)
    }
    // 중복제거·정렬
    const seen = new Set(), uniq = [];
    for (const e of events) { const k = e.d + "|" + e.items; if (!seen.has(k)) { seen.add(k); uniq.push(e); } }
    uniq.sort((a, b) => a.d < b.d ? -1 : 1);
    result[sym] = uniq;
    const earn = uniq.filter(e => e.items.includes("2.02")).length;
    console.log(sym, "8-K", uniq.length, "| 비실적", uniq.length - earn, "| 범위", uniq[0] && uniq[0].d, "~", uniq[uniq.length - 1] && uniq[uniq.length - 1].d);
  }
  fs.writeFileSync(OUT, JSON.stringify(result));
  console.log("\n저장:", OUT, "(" + Object.keys(result).length + "종)");
}
main();
