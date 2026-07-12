// backtest/rel-domain-lab.js — 상대강도 축 도메인 확장 검증
//   kr     : 한국주식 10종 vs KOSPI (fixtures-kr/, Naver 장기 14.5년)
//   sector : 미국주식 30종 vs 소속 섹터 ETF (fixtures/ + fixtures-bench/)
// 관문(사전 등록, v1.10 규율): OOS서 자명규칙 확장 5종(다수결·±지속성·±모멘텀) 최강치 +1.5pp↑ · 전/후반 양수 · LOSO 유지.
// 정렬: 날짜 교집합(양쪽 t 보유 — rel-lab의 끝정렬 근사보다 정확).
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");
const M = require("./metrics.js");

const HS = [10, 20, 40], STRIDE = 5, START = 300;

// GICS 현행(2023-03 개편 반영: V·MA·PYPL→금융). WBA는 픽스처 없음(자동 스킵).
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
const KR = ["005930", "000660", "005380", "012330", "035420", "035720", "051910", "055550", "068270", "105560"];

function loadFix(dir, sym) {
  const fp = path.join(__dirname, dir, sym + "-1day.json");
  if (!fs.existsSync(fp)) return null;
  const fx = JSON.parse(fs.readFileSync(fp, "utf8"));
  return fx.candle.map(c => ({ t: String(c.t || "").slice(0, 10), c: +c.c })).filter(c => isFinite(c.c) && c.c > 0);
}

function alignByDate(symCds, benchCds) {   // 날짜 교집합 정렬(양쪽 t 보유 — KR 경로) → {P, S}
  const bm = new Map(benchCds.map(c => [c.t, c.c]));
  const P = [], S = [];
  for (const c of symCds) { const b = bm.get(c.t); if (c.t && b != null) { P.push(c.c); S.push(b); } }
  return { P, S };
}

function alignByEnd(symCds, benchCds) {   // 끝정렬 근사(표준 fixtures/ 미국주식엔 t 없음 — rel-lab 선례·동일 NYSE 캘린더)
  const L = Math.min(symCds.length, benchCds.length);
  return { P: symCds.slice(-L).map(c => c.c), S: benchCds.slice(-L).map(c => c.c) };
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

function buildRows(pairs) {   // pairs: [{sym, P, S}]
  const rows = [];
  for (const { sym, P, S } of pairs) {
    const L = Math.min(P.length, S.length);
    if (L < START + Math.max(...HS) + 5) { console.error("  표본 부족 스킵:", sym, L + "봉"); continue; }
    const R = P.map((v, i) => v / S[i]);
    for (let t = START; t <= L - Math.max(...HS) - 1; t += STRIDE) {
      const xo = F.structFeats(P, t), xr = F.structFeats(R, t);
      if (!xo || !xr) continue;
      const y = {}, prevRel = {};
      for (const H of HS) {
        y[H] = (P[t + H] / P[t] > S[t + H] / S[t]) ? 1 : 0;
        prevRel[H] = (P[t] / P[t - H] > S[t] / S[t - H]) ? 1 : 0;
      }
      rows.push({ sym, x: xo.concat(xr, [betaProxy(P, S, t)]), y, prevRel, relMom250: R[t] / R[t - 250] - 1 });
    }
  }
  return rows;
}

const pct = x => x == null ? "–" : (x * 100).toFixed(1) + "%";
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

function evalH(rows, H, label) {
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const tr = [], te = [];
  for (const s of Object.keys(bySym)) { const a = bySym[s], k = F.splitIdx(a.length); tr.push(...a.slice(0, k)); te.push(...a.slice(k)); }
  const m = F.logitFit(tr.map(r => r.x), tr.map(r => r.y[H]));
  const yTe = te.map(r => r.y[H]), pTe = te.map(r => m.predict(r.x));
  const base = yTe.reduce((s, v) => s + v, 0) / yTe.length;
  const majTrain = tr.map(r => r.y[H]).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
  const rules = {
    maj: r => majTrain, pers: r => r.prevRel[H], antiPers: r => 1 - r.prevRel[H],
    mom: r => r.relMom250 > 0 ? 1 : 0, antiMom: r => r.relMom250 > 0 ? 0 : 1,
  };
  const accOf = (recs, ys, fn) => recs.filter((r, i) => fn(r) === ys[i]).length / recs.length;
  const baseAccs = Object.fromEntries(Object.entries(rules).map(([k, fn]) => [k, accOf(te, yTe, fn)]));
  const best = Object.entries(baseAccs).sort((a, b) => b[1] - a[1])[0];
  const aFull = F.acc(pTe, yTe);
  const mid = Math.floor(te.length / 2);
  const bestHalf = (lo, hi) => Math.max(...Object.values(rules).map(fn => accOf(te.slice(lo, hi), yTe.slice(lo, hi), fn)));
  const h1 = F.acc(pTe.slice(0, mid), yTe.slice(0, mid)) - bestHalf(0, mid);
  const h2 = F.acc(pTe.slice(mid), yTe.slice(mid)) - bestHalf(mid, te.length);
  const brier = M.brierDecomp(pTe.map((p, i) => ({ p, y: yTe[i] })));
  console.log(`  [${label} H=${H}] n=${te.length} base ${pct(base)} · 모델 ${pct(aFull)} vs 최강규칙 ${best[0]} ${pct(best[1])} → lift ${pp(aFull - best[1])} · 전/후반 ${pp(h1)}/${pp(h2)} · BSS ${brier.bss.toFixed(3)}`
    + `\n      (규칙: ${Object.entries(baseAccs).map(([k, v]) => k + " " + pct(v)).join(" · ")})`);
  return { H, aFull, best: best[1], lift: aFull - best[1], h1, h2 };
}

function evalLOSO(rows, H) {
  const syms = [...new Set(rows.map(r => r.sym))];
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  let hit = 0, n = 0;
  const ruleHits = { maj: 0, pers: 0, antiPers: 0, mom: 0, antiMom: 0 };
  for (const held of syms) {
    const tr = [], te = [];
    for (const s of syms) { const a = bySym[s], k = F.splitIdx(a.length); if (s === held) te.push(...a.slice(k)); else tr.push(...a.slice(0, k)); }
    if (!te.length || !tr.length) continue;
    const m = F.logitFit(tr.map(r => r.x), tr.map(r => r.y[H]));
    const majTrain = tr.map(r => r.y[H]).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
    for (const r of te) {
      n++; if ((m.predict(r.x) >= 0.5 ? 1 : 0) === r.y[H]) hit++;
      if (majTrain === r.y[H]) ruleHits.maj++;
      if (r.prevRel[H] === r.y[H]) ruleHits.pers++; else ruleHits.antiPers++;
      if ((r.relMom250 > 0 ? 1 : 0) === r.y[H]) ruleHits.mom++; else ruleHits.antiMom++;
    }
  }
  const bestRule = Math.max(...Object.values(ruleHits)) / n;
  console.log(`  [LOSO H=${H}] 모델 ${pct(hit / n)} vs 최강규칙 ${pct(bestRule)} → ${pp(hit / n - bestRule)} (n=${n})`);
}

function main() {
  const mode = process.argv[2];
  let pairs = [], title = "";
  if (mode === "kr") {
    title = "한국주식 vs KOSPI";
    const bench = loadFix("fixtures-kr", "KOSPI");
    if (!bench) { console.error("KOSPI 픽스처 없음 — fetch-kr-bench 먼저"); process.exit(1); }
    for (const code of KR) { const s = loadFix("fixtures-kr", code); if (s) { const { P, S } = alignByDate(s, bench); pairs.push({ sym: code, P, S }); } }
  } else if (mode === "sector") {
    title = "미국주식 vs 소속 섹터 ETF";
    for (const etf of Object.keys(SECTOR)) {
      const bench = loadFix("fixtures-bench", etf);
      if (!bench) { console.error("ETF 픽스처 없음:", etf); continue; }
      for (const sym of SECTOR[etf]) { const s = loadFix("fixtures", sym); if (s) { const { P, S } = alignByEnd(s, bench); pairs.push({ sym, P, S }); } }
    }
  } else { console.error("사용: node backtest/rel-domain-lab.js kr|sector"); process.exit(1); }
  const rows = buildRows(pairs);
  console.log(`\n== 상대강도 도메인 확장: ${title} — 종목 ${new Set(rows.map(r => r.sym)).size} · 표본 ${rows.length} ==`);
  const res = HS.map(H => evalH(rows, H, mode.toUpperCase()));
  for (const H of HS) evalLOSO(rows, H);
  console.log("관문: 최강 자명규칙 +1.5pp↑ & 전/후반 양수 & LOSO 유지");
  res.forEach(r => console.log(`  H=${r.H}: lift ${pp(r.lift)} · 전/후반 ${pp(r.h1)}/${pp(r.h2)}`));
}
main();
