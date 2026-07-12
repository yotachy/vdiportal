// backtest/train-rel-sector.js — 섹터 상대강도(소속 섹터 ETF 대비) 배포 계수 산출(v1.11.0)
// rel-domain-lab sector 관문 통과(자명규칙 +3.0~3.9pp·LOSO +3.1~4.0pp) 후 전체 표본 최종학습(train-rel.js 미러).
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");

const SECTOR = {
  XLK: ["AAPL", "MSFT", "NVDA", "INTC", "ORCL", "CRM", "AMD", "QCOM", "IBM", "CSCO"],
  XLF: ["JPM", "BAC", "V", "MA", "PYPL"],
  XLV: ["JNJ", "UNH", "PFE"],
  XLP: ["KO", "PG", "WMT"],
  XLY: ["HD", "BABA"],
  XLE: ["XOM", "CVX"],
  XLI: ["CAT", "GE"],
  XLC: ["T", "VZ", "DIS"],
};
const HS = [10, 20, 40], STRIDE = 5, START = 300;

function loadCloses(dir, sym) {
  const fp = path.join(__dirname, dir, sym + "-1day.json");
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf8")).candle.map(c => +c.c).filter(c => isFinite(c) && c > 0);
}
function betaProxy(P, S, t, n = 60) {
  let sp = 0, ss = 0, sss = 0, sps = 0;
  for (let i = t - n + 1; i <= t; i++) {
    const rp = Math.log(P[i] / P[i - 1]), rs = Math.log(S[i] / S[i - 1]);
    sp += rp; ss += rs; sss += rs * rs; sps += rp * rs;
  }
  const vs = sss / n - (ss / n) ** 2;
  return vs > 0 ? (sps / n - sp * ss / n / n) / vs : 1;
}

function main() {
  const X = [], Y = { 10: [], 20: [], 40: [] };
  let nSym = 0;
  for (const etf of Object.keys(SECTOR)) {
    const bench = loadCloses("fixtures-bench", etf);
    if (!bench) { console.error("ETF 없음:", etf); continue; }
    for (const sym of SECTOR[etf]) {
      const raw = loadCloses("fixtures", sym); if (!raw) continue;
      const L = Math.min(raw.length, bench.length);
      const P = raw.slice(-L), S = bench.slice(-L);   // 끝정렬(rel-domain-lab 동일)
      if (L < START + 45) continue;
      nSym++;
      const R = P.map((v, i) => v / S[i]);
      for (let t = START; t <= L - Math.max(...HS) - 1; t += STRIDE) {
        const xo = F.structFeats(P, t), xr = F.structFeats(R, t);
        if (!xo || !xr) continue;
        X.push(xo.concat(xr, [betaProxy(P, S, t)]));
        for (const H of HS) Y[H].push((P[t + H] / P[t] > S[t + H] / S[t]) ? 1 : 0);
      }
    }
  }
  console.error(`전체 학습 표본 ${X.length} (종목 ${nSym})`);
  const r4 = a => a.map(v => +v.toFixed(5));
  const out = { note: "rel-domain-lab sector 검증 후 전체표본 최종학습. MEAN/STD 공유, W/BB 지평별.", n: X.length, hs: {} };
  let MEAN = null, STD = null;
  for (const H of HS) {
    const m = F.logitFit(X, Y[H]);
    if (!MEAN) { MEAN = r4(m.MEAN); STD = r4(m.STD); }
    out.hs[H] = { W: r4(m.W), BB: +m.B.toFixed(5), base: +(Y[H].reduce((s, v) => s + v, 0) / Y[H].length * 100).toFixed(1) };
    console.error(`H=${H} 학습완료`);
  }
  out.MEAN = MEAN; out.STD = STD;
  fs.writeFileSync(path.join(__dirname, "rel-sector-model.json"), JSON.stringify(out, null, 1));
  console.log("rel-sector-model.json 기록");
}
main();
