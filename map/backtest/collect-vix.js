// backtest/collect-vix.js — FRED VIX(30d)·VIX3M(3mo) → vix-series.json {date:{vix,vix3m}}
"use strict";
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "vix-series.json");
async function fredCsv(id) {
  const r = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + id, { signal: AbortSignal.timeout(40000) });
  const txt = await r.text(), out = {};
  for (const ln of txt.split("\n").slice(1)) {
    const [d, v] = ln.split(",");
    if (!d || v == null) continue;
    const n = parseFloat(v);
    if (isFinite(n)) out[d.trim()] = n;
  }
  return out;
}
(async () => {
  const vix = await fredCsv("VIXCLS"), vix3m = await fredCsv("VXVCLS");
  const merged = {};
  for (const d in vix) merged[d] = { vix: vix[d], vix3m: (vix3m[d] != null ? vix3m[d] : null) };
  fs.writeFileSync(OUT, JSON.stringify(merged));
  const dates = Object.keys(merged).sort();
  const with3m = dates.filter(d => merged[d].vix3m != null).length;
  console.log("VIX rows:", dates.length, "· range", dates[0], "→", dates[dates.length - 1], "· with VIX3M:", with3m);
})();
