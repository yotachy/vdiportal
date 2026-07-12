// backtest/train-rel.js — 상대강도(SPY 대비 아웃퍼폼) 배포 계수 산출(v1.10.0)
// rel-lab.js OOS 검증 통과(자명규칙 대비 +2.2~2.4pp·LOSO 유지) 후 전체 표본으로 최종 학습(선례: train-volforecast 등).
// 피처 25 = 자기 structFeats 12 + 상대(P/SPY) structFeats 12 + 베타(60봉) — feat-lib과 정의 동일(라이브 패리티는 forge-core _relFeats 유닛테스트로 보증).
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");

const US = ["AAPL","MSFT","NVDA","INTC","BABA","PYPL","DIS","T","IBM","CSCO","VZ","PFE","KO","WBA","GE",
  "JPM","BAC","WMT","HD","PG","JNJ","UNH","XOM","CVX","V","MA","ORCL","CRM","AMD","QCOM","CAT"];
const HS = [10, 20, 40], STRIDE = 5, START = 300;

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
  const dir = path.join(__dirname, "fixtures");
  const closes = {};
  for (const s of US.concat(["SPY"])) {
    const fp = path.join(dir, s + "-1day.json");
    if (fs.existsSync(fp)) closes[s] = JSON.parse(fs.readFileSync(fp)).candle.map(c => c.c);
  }
  const S = closes.SPY, syms = Object.keys(closes).filter(s => s !== "SPY");
  const minLen = Math.min(...syms.map(s => closes[s].length), S.length);
  const spy = S.slice(-minLen);
  const X = [], Y = { 10: [], 20: [], 40: [] };
  for (const sym of syms) {
    const P = closes[sym].slice(-minLen);
    const R = P.map((v, i) => v / spy[i]);
    for (let t = START; t <= minLen - Math.max(...HS) - 1; t += STRIDE) {
      const xo = F.structFeats(P, t), xr = F.structFeats(R, t);
      if (!xo || !xr) continue;
      X.push(xo.concat(xr, [betaProxy(P, spy, t)]));
      for (const H of HS) Y[H].push((P[t + H] / P[t] > spy[t + H] / spy[t]) ? 1 : 0);
    }
  }
  console.error(`전체 학습 표본 ${X.length} (종목 ${syms.length} · ${minLen}봉)`);
  const r4 = a => a.map(v => +v.toFixed(5));
  const out = { note: "rel-lab OOS 검증 후 전체표본 최종학습. MEAN/STD 공유(피처 동일), W/BB 지평별.", n: X.length, hs: {} };
  let MEAN = null, STD = null;
  for (const H of HS) {
    const m = F.logitFit(X, Y[H]);
    if (!MEAN) { MEAN = r4(m.MEAN); STD = r4(m.STD); }
    const base = Y[H].reduce((s, v) => s + v, 0) / Y[H].length;
    out.hs[H] = { W: r4(m.W), BB: +m.B.toFixed(5), base: +(base * 100).toFixed(1) };
    console.error(`H=${H} 학습완료 (in-sample base ${(base * 100).toFixed(1)}%)`);
  }
  out.MEAN = MEAN; out.STD = STD;
  fs.writeFileSync(path.join(__dirname, "rel-model.json"), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
}
main();
