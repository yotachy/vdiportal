// backtest/insider-smallcap-lab.js — 내부자 매수 → 중소형주 상대방향(vs IJR) 증분 검증
// 유니버스=insider-universe(매수상위)·벤치=IWM. 날짜기반 정렬(정확). forge-core 미변경.
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");
const { insiderFeats, NF } = require("./insider-feats.js");

const FDIR = path.join(__dirname, "fixtures-smallcap");
const INS = JSON.parse(fs.readFileSync(path.join(__dirname, "insider-events-smallcap.json"), "utf8"));
const HS = [10, 20, 40], STRIDE = 5, START = 300;

function loadFix(sym) {
  const p = path.join(FDIR, sym + ".json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")).candle;   // [{t,o,h,l,c}]
}
function betaProxy(P, S, t, n = 60) {
  let sp = 0, ss = 0, sss = 0, sps = 0;
  for (let i = t - n + 1; i <= t; i++) { const rp = Math.log(P[i] / P[i - 1]), rs = Math.log(S[i] / S[i - 1]); sp += rp; ss += rs; sss += rs * rs; sps += rp * rs; }
  const vs = sss / n - (ss / n) ** 2; return vs > 0 ? (sps / n - sp * ss / n / n) / vs : 1;
}

const iwm = loadFix("IJR");
if (!iwm) { console.error("IJR fixture 없음"); process.exit(1); }
const iwmMap = {}; for (const c of iwm) iwmMap[c.t] = c.c;

const kept = JSON.parse(fs.readFileSync(path.join(FDIR, "_kept.json"), "utf8")).filter(s => s !== "IJR" && s !== "SPY");
const train = [], test = []; let used = 0, insTouched = 0;
for (const sym of kept) {
  const cd = loadFix(sym); if (!cd) continue;
  // 공통 날짜(IWM ∩ sym)
  const dates = [], P = [], IW = [];
  for (const c of cd) { const iv = iwmMap[c.t]; if (iv && c.c > 0) { dates.push(c.t); P.push(c.c); IW.push(iv); } }
  if (P.length < START + Math.max(...HS) + 5) continue;
  used++;
  const R = P.map((v, i) => v / IW[i]);
  const ev = INS[sym] || [];
  const rows = [];
  for (let t = START; t <= P.length - Math.max(...HS) - 1; t += STRIDE) {
    const xo = F.structFeats(P, t), xr = F.structFeats(R, t); if (!xo || !xr) continue;
    const x25 = xo.concat(xr, [betaProxy(P, IW, t)]);
    const ins = insiderFeats(ev, dates[t]);   // filed <= 그 캔들 실제 날짜
    if (ins.some(v => v !== 0)) insTouched++;
    const y = {}; for (const H of HS) y[H] = (P[t + H] / P[t] > IW[t + H] / IW[t]) ? 1 : 0;
    rows.push({ x25, ins, y, sym });
  }
  const cut = F.splitIdx(rows.length, 0.6); rows.forEach((r, i) => (i < cut ? train : test).push(r));
}

function fitAcc(tr, te, H, wi) {
  const X = tr.map(r => wi ? r.x25.concat(r.ins) : r.x25), Y = tr.map(r => r.y[H]);
  const m = F.logitFit(X, Y, { iters: 400, lr: 0.3, l2: 1e-3 });
  return F.acc(te.map(r => m.predict(wi ? r.x25.concat(r.ins) : r.x25)), te.map(r => r.y[H]));
}
function uni(rows, fi, H) { let h = 0, n = 0; for (const r of rows) { const p = Math.sign(r.ins[fi]); if (!p) continue; n++; if ((p > 0 ? 1 : 0) === r.y[H]) h++; } return n ? h / n : null; }
const P = x => x == null ? "-" : (x * 100).toFixed(1) + "%";

console.log("=== 내부자 매수 → 중소형주 상대방향(vs IJR) 증분 검증 ===");
console.log("종목 " + used + " · train " + train.length + " · test " + test.length + " row · 내부자피처 비영 " + insTouched + "행");
console.log("\n(a) 단변량 OOS(신호부호 vs IJR대비 아웃퍼폼 y20):");
["netBuy", "buyRatio", "numBuyers", "sinceBuy", "roleNet", "oppNet"].forEach((nm, fi) => console.log("   " + nm.padEnd(10) + P(uni(test, fi, 20))));
console.log("\n(b) 증분: rel25 vs 25+내부자6 (TEST 적중률)");
console.log("지평 | base    +ins     Δ");
let maxD = -Infinity, minD = Infinity;
for (const H of HS) { const b = fitAcc(train, test, H, false), n = fitAcc(train, test, H, true), d = n - b; maxD = Math.max(maxD, d); minD = Math.min(minD, d); console.log(String(H).padStart(3) + "  | " + P(b) + "  " + P(n) + "  " + (d >= 0 ? "+" : "") + (d * 100).toFixed(1) + "pp"); }
const syms = [...new Set(test.map(r => r.sym))];
const per = syms.map(s => { const te = test.filter(r => r.sym === s); if (te.length < 20) return null; return fitAcc(train, te, 20, true) - fitAcc(train, te, 20, false); }).filter(x => x != null);
const posSym = per.filter(x => x > 0).length;
const half = Math.floor(test.length / 2), A = test.slice(0, half), B = test.slice(half);
const dA = fitAcc(train, A, 20, true) - fitAcc(train, A, 20, false), dB = fitAcc(train, B, 20, true) - fitAcc(train, B, 20, false);
console.log("\n=== 관문(+1.5pp·LOSO·전후반) ===");
console.log("① 증분 최대 " + (maxD * 100).toFixed(1) + " / 최소 " + (minD * 100).toFixed(1) + "pp");
console.log("④ LOSO h20 Δ>0: " + posSym + "/" + per.length + "종");
console.log("⑤ 전/후반 h20: " + (dA * 100).toFixed(1) + " / " + (dB * 100).toFixed(1) + "pp");
const pass = maxD >= 0.015 && minD >= -0.005 && posSym >= per.length * 0.6 && dA > 0 && dB > 0;
console.log("\n=== 판정: " + (pass ? "PASS(내부자 증분 유의 — 승격 검토·단 서바이버십 감안)" : "REJECT(중소형주도 증분 불충분)") + " ===");
console.log("⚠ 서바이버십: 생존 종목만(상장폐지 소형주 누락) → 통과여도 상방편향 감안");
