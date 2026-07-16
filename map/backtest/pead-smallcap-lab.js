// backtest/pead-smallcap-lab.js — 소형주 PEAD → 상대방향(vs IJR) 증분 검증. base=rel25 vs aug=rel25+pead4.
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");
const { peadArray } = require("./pead-feats.js");
const FDIR = path.join(__dirname, "fixtures-shortint");
const EARN = JSON.parse(fs.readFileSync(path.join(__dirname, "smallcap-earnings.json"), "utf8"));
const IJRFIX = JSON.parse(fs.readFileSync(path.join(FDIR, "IJR.json"), "utf8"));
const ijrMap = {}; (IJRFIX.candle || []).forEach(c => ijrMap[c.t] = c.c);
const SKIP = new Set(["IJR", "SPY"]);
const SYMS = fs.readdirSync(FDIR).filter(f => f.endsWith(".json") && !f.startsWith("_"))
  .map(f => f.replace(".json", "")).filter(s => !SKIP.has(s));
const HS = [10, 20, 40], STRIDE = 5, START = 300;

function betaProxy(P, S, t, n = 60) {
  let sp = 0, ss = 0, sss = 0, sps = 0;
  for (let i = t - n + 1; i <= t; i++) { const rp = Math.log(P[i] / P[i - 1]), rs = Math.log(S[i] / S[i - 1]); sp += rp; ss += rs; sss += rs * rs; sps += rp * rs; }
  const vs = sss / n - (ss / n) ** 2; return vs > 0 ? (sps / n - sp * ss / n / n) / vs : 1;
}
function build() {
  const train = [], test = []; let peadTouched = 0, used = 0;
  for (const sym of SYMS) {
    let fx; try { fx = JSON.parse(fs.readFileSync(path.join(FDIR, sym + ".json"), "utf8")); } catch (e) { continue; }
    const cds = fx.candle; if (!cds || !cds.length) continue;
    const closes = cds.map(c => c.c), dates = cds.map(c => c.t), earnings = EARN[sym] || [];
    const pead = peadArray(closes, dates, earnings, { win: 45 });
    const P = [], IJ = [], PE = [];
    for (let i = 0; i < cds.length; i++) { const iv = ijrMap[dates[i]]; if (iv && closes[i] > 0) { P.push(closes[i]); IJ.push(iv); PE.push(pead[i]); } }
    if (P.length < START + Math.max(...HS) + 5) continue;
    used++;
    const R = P.map((v, i) => v / IJ[i]);
    const rows = [];
    for (let t = START; t <= P.length - Math.max(...HS) - 1; t += STRIDE) {
      const xo = F.structFeats(P, t), xr = F.structFeats(R, t); if (!xo || !xr) continue;
      const x25 = xo.concat(xr, [betaProxy(P, IJ, t)]), pe = PE[t];
      const inWin = pe.some(v => v !== 0); if (inWin) peadTouched++;
      const y = {}; for (const H of HS) y[H] = (P[t + H] / P[t] > IJ[t + H] / IJ[t]) ? 1 : 0;
      rows.push({ x25, pe, y, sym, inWin });
    }
    const cut = F.splitIdx(rows.length, 0.6); rows.forEach((r, i) => (i < cut ? train : test).push(r));
  }
  return { train, test, peadTouched, used };
}
function fitAccH(TR, TE, H, wi) { const X = TR.map(r => wi ? r.x25.concat(r.pe) : r.x25), Y = TR.map(r => r.y[H]); const m = F.logitFit(X, Y, { iters: 400, lr: 0.3, l2: 1e-3 }); return F.acc(TE.map(r => m.predict(wi ? r.x25.concat(r.pe) : r.x25)), TE.map(r => r.y[H])); }
const P = x => x == null ? "-" : (x * 100).toFixed(1) + "%";

const { train, test, peadTouched, used } = build();
console.log("=== 소형주 PEAD → 상대방향(vs IJR) 증분 검증 (" + used + "종) ===");
console.log("train " + train.length + " · test " + test.length + " · PEAD-창 시점 " + peadTouched + "(전체의 " + (100 * peadTouched / (train.length + test.length)).toFixed(0) + "%)");
const win = test.filter(r => r.inWin);
let rh = 0, rn = 0; for (const r of win) { const p = Math.sign(r.pe[0]); if (!p) continue; rn++; if ((p > 0 ? 1 : 0) === r.y[20]) rh++; }
console.log("\n(a) PEAD 원신호(창 내 " + win.length + "시점): 실적일반응 부호 vs h20 상대아웃퍼폼 적중 " + P(rn ? rh / rn : null));
console.log("\n(b) 증분: rel25 vs 25+PEAD4 (TEST 적중률)");
console.log("지평 | base    +pead    Δ(전체)  Δ(창내)");
let maxD = -Infinity, minD = Infinity;
for (const H of HS) {
  const b = fitAccH(train, test, H, false), n = fitAccH(train, test, H, true), d = n - b;
  const bw = fitAccH(train, win, H, false), nw = fitAccH(train, win, H, true), dw = nw - bw;
  maxD = Math.max(maxD, d); minD = Math.min(minD, d);
  console.log(String(H).padStart(3) + "  | " + P(b) + "  " + P(n) + "  " + (d >= 0 ? "+" : "") + (d * 100).toFixed(1) + "pp   " + (dw >= 0 ? "+" : "") + (dw * 100).toFixed(1) + "pp");
}
const syms = [...new Set(test.map(r => r.sym))];
const per = syms.map(s => { const te = test.filter(r => r.sym === s); if (te.length < 20) return null; return fitAccH(train, te, 20, true) - fitAccH(train, te, 20, false); }).filter(x => x != null);
const posSym = per.filter(x => x > 0).length;
const half = Math.floor(test.length / 2), A = test.slice(0, half), B = test.slice(half);
const dA = fitAccH(train, A, 20, true) - fitAccH(train, A, 20, false), dB = fitAccH(train, B, 20, true) - fitAccH(train, B, 20, false);
console.log("\n=== 관문(+1.5pp·LOSO·전후반) ===");
console.log("① 증분(전체) 최대 " + (maxD * 100).toFixed(1) + " / 최소 " + (minD * 100).toFixed(1) + "pp");
console.log("④ LOSO h20 Δ>0: " + posSym + "/" + per.length + "종 · ⑤ 전/후반 " + (dA * 100).toFixed(1) + "/" + (dB * 100).toFixed(1) + "pp");
const pass = maxD >= 0.015 && minD >= -0.005 && posSym >= per.length * 0.6 && dA > 0 && dB > 0;
console.log("\n=== 판정: " + (pass ? "PASS(소형주 PEAD 증분 유의)" : "REJECT(소형주도 증분 불충분 — 모멘텀 흡수)") + " ===");
console.log("⚠ 서바이버십: 현존 종목만(상장폐지 소형주 누락) → 통과여도 상방편향 감안");
