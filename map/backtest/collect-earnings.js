// 실적일 수집 — TwelveData earnings 엔드포인트로 US주식 30종의 과거 실적발표일 캐시.
// 결과: earnings-dates.json { sym: ["YYYY-MM-DD", ...] } (오름차순). 레이트리밋 throttle.
"use strict";
const fs = require("fs");
const KEY = fs.readFileSync("../forge_td_key.txt", "utf8").trim();
const syms = fs.readFileSync("/tmp/us-syms.txt", "utf8").trim().split("\n");
const out = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (const sym of syms) {
    let ok = false;
    for (let retry = 0; retry < 3 && !ok; retry++) {
      try {
        const r = await fetch(`https://api.twelvedata.com/earnings?symbol=${encodeURIComponent(sym)}&apikey=${KEY}&outputsize=300`);
        const j = await r.json();
        if (j.status === "error") { console.error(sym + " 에러: " + j.message + (retry<2?" · 재시도":"")); await sleep(9000); continue; }
        const e = j.earnings || (Array.isArray(j) ? j : null);
        if (Array.isArray(e)) { const dates = e.map(x => x.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort(); out[sym] = dates; console.error(sym + " → " + dates.length + "건 (" + (dates[0]||"") + "~" + (dates[dates.length-1]||"") + ")"); ok = true; }
        else { console.error(sym + " 형식이상"); ok = true; }
      } catch (err) { console.error(sym + " fetch실패: " + err.message); }
      await sleep(9000);   // throttle(8/min 제한)
    }
    if (!ok) out[sym] = [];
  }
  fs.writeFileSync("earnings-dates.json", JSON.stringify(out));
  const tot = Object.values(out).reduce((a, b) => a + b.length, 0);
  console.error("\n완료: " + Object.keys(out).length + "종 · 총 " + tot + "건 → earnings-dates.json");
})();
