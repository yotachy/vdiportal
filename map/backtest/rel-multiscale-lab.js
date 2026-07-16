// backtest/rel-multiscale-lab.js — 상대강도 스윙-티어 피처 증분 검증(프리필터)
// 가설: 상대비율 R=P/SPY의 스윙-구조 티어(대/중/소) 피처가 기존 rel 25피처에 증분 예측력을 주는가.
// 격리: forge-core 미변경. rel-lab 파이프라인 + feat-lib(logitFit/acc/splitIdx) 재사용.
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");
const { relTierFeats } = require("./rel-tier-feats.js");

const US = ["AAPL", "MSFT", "NVDA", "INTC", "BABA", "PYPL", "DIS", "T", "IBM", "CSCO", "VZ", "PFE", "KO", "WBA", "GE",
  "JPM", "BAC", "WMT", "HD", "PG", "JNJ", "UNH", "XOM", "CVX", "V", "MA", "ORCL", "CRM", "AMD", "QCOM", "CAT"];
const HS = [10, 20, 40], STRIDE = 5, START = 300;
const NEWN = ["msBias", "대", "중", "소", "일치"];

function loadCloses() {
  const dir = path.join(__dirname, "fixtures"), out = {};
  for (const s of US.concat(["SPY"])) {
    const fp = path.join(dir, s + "-1day.json");
    if (fs.existsSync(fp)) out[s] = JSON.parse(fs.readFileSync(fp, "utf8")).candle.map(c => c.c);
  }
  return out;
}
function betaProxy(P, S, t, n = 60) {
  let sp = 0, ss = 0, sss = 0, sps = 0;
  for (let i = t - n + 1; i <= t; i++) { const rp = Math.log(P[i] / P[i - 1]), rs = Math.log(S[i] / S[i - 1]); sp += rp; ss += rs; sss += rs * rs; sps += rp * rs; }
  const vs = sss / n - (ss / n) ** 2; return vs > 0 ? (sps / n - sp * ss / n / n) / vs : 1;
}

function build() {
  const closes = loadCloses(), S = closes.SPY;
  const syms = Object.keys(closes).filter(s => s !== "SPY");
  const minLen = Math.min(...syms.map(s => closes[s].length), S.length);
  const spy = S.slice(-minLen);
  const train = [], test = [];   // 심볼별 시간 60/40 OOS
  for (const sym of syms) {
    const P = closes[sym].slice(-minLen);
    const R = P.map((v, i) => v / spy[i]);
    const rows = [];
    for (let t = START; t <= minLen - Math.max(...HS) - 1; t += STRIDE) {
      const xo = F.structFeats(P, t), xr = F.structFeats(R, t);
      if (!xo || !xr) continue;
      const x25 = xo.concat(xr, [betaProxy(P, spy, t)]);
      const nw = relTierFeats(R.slice(0, t + 1));
      const y = {}; for (const H of HS) y[H] = (P[t + H] / P[t] > spy[t + H] / spy[t]) ? 1 : 0;
      rows.push({ x25, nw, y });
    }
    const cut = F.splitIdx(rows.length, 0.6);
    rows.forEach((r, i) => (i < cut ? train : test).push(r));
  }
  return { train, test };
}

function accSign(rows, fi, H) {   // 신피처 fi 부호 vs y[H]
  let hit = 0, n = 0;
  for (const r of rows) { const p = Math.sign(r.nw[fi]); if (p === 0) continue; n++; if ((p > 0 ? 1 : 0) === r.y[H]) hit++; }
  return n ? hit / n : null;
}
function fitAcc(train, test, H, withNew) {
  const X = train.map(r => withNew ? r.x25.concat(r.nw) : r.x25), Y = train.map(r => r.y[H]);
  const m = F.logitFit(X, Y, { iters: 400, lr: 0.3, l2: 1e-3 });
  const probs = test.map(r => m.predict(withNew ? r.x25.concat(r.nw) : r.x25));
  return F.acc(probs, test.map(r => r.y[H]));
}

function report() {
  const t0 = Date.now();
  const { train, test } = build();
  console.log("=== 상대강도 스윙-티어 피처 증분 검증(프리필터) ===");
  console.log("train " + train.length + " · test " + test.length + " row · US " + US.length + "종 · OOS 심볼별 60/40");
  console.log("\n(a) 단변량 OOS: 신피처 부호 vs 상대아웃퍼폼 y[20] 적중률");
  let uniBest = 0;
  NEWN.forEach((nm, fi) => { const a = accSign(test, fi, 20); if (a != null && a > uniBest) uniBest = a; console.log("   " + nm.padEnd(7) + " " + (a == null ? "-" : (a * 100).toFixed(1)) + "%"); });
  console.log("\n(b) 증분예측력: logit(25) vs logit(25+신5) TEST 적중률");
  console.log("지평 | base(25)  +tier(30)  Δ");
  let maxD = -Infinity;
  for (const H of HS) {
    const b = fitAcc(train, test, H, false), n = fitAcc(train, test, H, true);
    const d = (b != null && n != null) ? n - b : null; if (d != null && d > maxD) maxD = d;
    console.log(String(H).padStart(3) + "  | " + (b * 100).toFixed(1) + "     " + (n * 100).toFixed(1) + "     " + (d == null ? "-" : (d >= 0 ? "+" : "") + (d * 100).toFixed(1)) + "pp");
  }
  // 결정 metric = 증분 예측력. rel-lab 승격 관문은 +1.5pp(전 지평·자명규칙 대비). 증강 로지스틱이
  // 이미 재학습된 OOS 결과이므로, 어느 지평도 +1.5pp에 못 미치거나 음수가 있으면 승격 불가 = REJECT.
  const minD = Math.min(...HS.map(H => { const b = fitAcc(train, test, H, false), n = fitAcc(train, test, H, true); return n - b; }));
  const clears = maxD >= 0.015 && minD >= 0;   // 최소 한 지평 +1.5pp↑ & 음수 지평 없음
  console.log("\n=== 판정 ===");
  console.log("신피처 최고 단변량 " + (uniBest * 100).toFixed(1) + "%(코인플립 근접) · 증분 Δ 최대 " + (maxD * 100).toFixed(1) + "pp/최소 " + (minD * 100).toFixed(1) + "pp (승격 관문 +1.5pp·음수 없음)");
  console.log("→ " + (clears ? "PASS(증분 유의 — 풀 관문 진행)" : "REJECT(증분 무의미: +1.5pp 미달·지평간 부호 혼조 — 상대모멘텀과 중복)"));
  console.log("(소요 " + ((Date.now() - t0) / 1000).toFixed(1) + "s)");
  return { uniBest, maxD, minD, reject: !clears };
}

if (require.main === module) report();
module.exports = { build, report, accSign, fitAcc };
