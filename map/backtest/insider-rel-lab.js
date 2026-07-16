// backtest/insider-rel-lab.js — 내부자(Form 4) 신호 → 상대방향(rel) 증강 검증
// base=rel 25피처 vs aug=25+내부자6. 상대 아웃퍼폼(vs SPY) OOS 60/40 + LOSO + 전후반 + 자명규칙. 관문 +1.5pp.
// look-ahead: filed<=candle date(선형보간)-BUFFER만. forge-core 미변경.
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");
const { insiderFeats, NF } = require("./insider-feats.js");
const INS = JSON.parse(fs.readFileSync(path.join(__dirname, "insider-events.json"), "utf8"));

const US = ["AAPL", "MSFT", "NVDA", "INTC", "BABA", "PYPL", "DIS", "T", "IBM", "CSCO", "VZ", "PFE", "KO", "WBA", "GE",
  "JPM", "BAC", "WMT", "HD", "PG", "JNJ", "UNH", "XOM", "CVX", "V", "MA", "ORCL", "CRM", "AMD", "QCOM", "CAT"]
  .filter(s => fs.existsSync(path.join(__dirname, "fixtures", s + "-1day.json")));
const HS = [10, 20, 40], STRIDE = 5, START = 300, BUFFER = 5 * 86400000;

function meta(sym) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", sym + "-1day.json"), "utf8"));
  return { price: d.candle.map(c => c.c), from: Date.parse(d.from + "T00:00:00Z"), to: Date.parse(d.to + "T00:00:00Z"), n: d.candle.length };
}
function betaProxy(P, S, t, n = 60) {
  let sp = 0, ss = 0, sss = 0, sps = 0;
  for (let i = t - n + 1; i <= t; i++) { const rp = Math.log(P[i] / P[i - 1]), rs = Math.log(S[i] / S[i - 1]); sp += rp; ss += rs; sss += rs * rs; sps += rp * rs; }
  const vs = sss / n - (ss / n) ** 2; return vs > 0 ? (sps / n - sp * ss / n / n) / vs : 1;
}

function build() {
  const M = {}; for (const s of US.concat(["SPY"])) M[s] = meta(s);
  const minLen = Math.min(...US.map(s => M[s].n), M.SPY.n);
  const spy = M.SPY.price.slice(-minLen);
  const train = [], test = [];
  let insTouched = 0;
  for (const sym of US) {
    const m = M[sym], off = m.n - minLen, P = m.price.slice(-minLen);
    const R = P.map((v, i) => v / spy[i]);
    const ev = INS[sym] || [];
    const dateAt = i => m.from + (m.to - m.from) * (off + i) / (m.n - 1);
    const rows = [];
    for (let t = START; t <= minLen - Math.max(...HS) - 1; t += STRIDE) {
      const xo = F.structFeats(P, t), xr = F.structFeats(R, t); if (!xo || !xr) continue;
      const x25 = xo.concat(xr, [betaProxy(P, spy, t)]);
      const cutoff = new Date(dateAt(t) - BUFFER).toISOString().slice(0, 10);
      const ins = insiderFeats(ev, cutoff);
      if (ins.some(v => v !== 0)) insTouched++;
      const y = {}; for (const H of HS) y[H] = (P[t + H] / P[t] > spy[t + H] / spy[t]) ? 1 : 0;
      rows.push({ x25, ins, y, sym });
    }
    const cut = F.splitIdx(rows.length, 0.6); rows.forEach((r, i) => (i < cut ? train : test).push(r));
  }
  return { train, test, insTouched };
}

function accOn(M, TE, pick) { let h = 0; for (const r of TE) { const x = pick(r); let s = M.b; for (let j = 0; j < M.w.length; j++) s += M.w[j] * (x[j] - M.mean[j]) / M.std[j]; if ((s >= 0 ? 1 : 0) === r.y[20]) h++; } return h / TE.length; }
// feat-lib logitFit → {W,B,MEAN,STD,predict}; 여기선 predict로 지평별 acc
function fitAcc(train, test, H, withIns) {
  const X = train.map(r => withIns ? r.x25.concat(r.ins) : r.x25), Y = train.map(r => r.y[H]);
  const m = F.logitFit(X, Y, { iters: 400, lr: 0.3, l2: 1e-3 });
  const probs = test.map(r => m.predict(withIns ? r.x25.concat(r.ins) : r.x25));
  return F.acc(probs, test.map(r => r.y[H]));
}
function uni(rows, fi, H) { let hit = 0, n = 0; for (const r of rows) { const p = Math.sign(r.ins[fi]); if (p === 0) continue; n++; if ((p > 0 ? 1 : 0) === r.y[H]) hit++; } return n ? hit / n : null; }

const P = x => x == null ? "-" : (x * 100).toFixed(1) + "%";
const t0 = Date.now();
const { train, test, insTouched } = build();
console.log("=== 내부자(Form4) → 상대방향(rel) 증강 검증 ===");
console.log("train " + train.length + " · test " + test.length + " row · US " + US.length + "종 · 내부자피처 비영 " + insTouched + "행");
console.log("\n(a) 단변량 OOS(신호부호 vs 상대아웃퍼폼 y20):");
const NM = ["netBuy", "buyRatio", "numBuyers", "sinceBuy", "roleNet", "oppNet"];
NM.forEach((nm, fi) => console.log("   " + nm.padEnd(10) + P(uni(test, fi, 20))));
console.log("\n(b) 증분: rel25 vs rel25+내부자6 (TEST 적중률)");
console.log("지평 | base    +ins     Δ");
let maxD = -Infinity, minD = Infinity;
for (const H of HS) { const b = fitAcc(train, test, H, false), n = fitAcc(train, test, H, true), d = n - b; maxD = Math.max(maxD, d); minD = Math.min(minD, d); console.log(String(H).padStart(3) + "  | " + P(b) + "  " + P(n) + "  " + (d >= 0 ? "+" : "") + (d * 100).toFixed(1) + "pp"); }
// LOSO(h20)
const syms = [...new Set(test.map(r => r.sym))];
const per = syms.map(s => { const trX = train, teX = test.filter(r => r.sym === s); if (teX.length < 20) return null; const b = fitAcc(trX, teX, 20, false), n = fitAcc(trX, teX, 20, true); return n - b; }).filter(x => x != null);
const posSym = per.filter(x => x > 0).length;
// 전후반(h20)
const half = Math.floor(test.length / 2), A = test.slice(0, half), B = test.slice(half);
const dA = fitAcc(train, A, 20, true) - fitAcc(train, A, 20, false), dB = fitAcc(train, B, 20, true) - fitAcc(train, B, 20, false);
console.log("\n=== 관문(rel 사전등록: +1.5pp·LOSO·전후반) ===");
console.log("① 증분 지평최대 " + (maxD * 100).toFixed(1) + "pp / 최소 " + (minD * 100).toFixed(1) + "pp (관문 +1.5pp)");
console.log("④ LOSO h20 Δ>0: " + posSym + "/" + per.length + "종");
console.log("⑤ 전/후반 h20 Δ: " + (dA * 100).toFixed(1) + " / " + (dB * 100).toFixed(1) + "pp");
const pass = maxD >= 0.015 && minD >= 0 && posSym >= per.length * 0.6 && dA > 0 && dB > 0;
console.log("\n=== 판정: " + (pass ? "PASS(내부자 증분 유의 — 승격 검토)" : "REJECT(내부자 증분 불충분 — 대형주 매도편중·신호 약함)") + " ===");
console.log("(소요 " + ((Date.now() - t0) / 1000).toFixed(1) + "s)");
