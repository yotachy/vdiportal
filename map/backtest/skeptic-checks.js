// backtest/skeptic-checks.js — Track 1·2 회의 검증(자명 규칙 베이스라인 사후 추가 — 정직성 강화 방향만)
// ① excess: 안티드리프트 규칙(d>0→미달 베팅) — 모델이 이 자명 규칙을 넘는가?
// ② rel: 안티지속성(직전 H봉 상대이동 반전 베팅)·안티모멘텀 포함 확장 베이스라인으로 재판정(전/후반 포함)
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");

const dir = path.join(__dirname, "fixtures");
const pct = x => (x * 100).toFixed(1) + "%";
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

// ── ① excess 안티드리프트 ──
function excessCheck() {
  const fxs = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f)))).filter(fx => fx.candle.length >= 600);
  const drift252 = (p, t) => { let s = 0; for (let i = t - 251; i <= t; i++) s += Math.log(p[i] / p[i - 1]); return s / 252; };
  console.log("== ① excess: 안티드리프트 자명 규칙(테스트 구간=후반 40%) ==");
  for (const H of [10, 20, 40]) {
    let hit = 0, n = 0;
    for (const fx of fxs) {
      const p = fx.candle.map(c => c.c), N = p.length;
      const ts = []; for (let t = 300; t <= N - 41; t += 5) ts.push(t);
      for (const t of ts.slice(F.splitIdx(ts.length))) {
        const d = drift252(p, t);
        const y = Math.log(p[t + H] / p[t]) > d * H ? 1 : 0;
        n++; if ((d > 0 ? 0 : 1) === y) hit++;
      }
    }
    console.log(`  H=${H}: 안티드리프트 ${pct(hit / n)} (n=${n}) — excess-lab 모델과 대조`);
  }
}

// ── ② rel 확장 베이스라인(안티지속성·안티모멘텀 포함) + 전/후반 ──
function relCheck() {
  const US = ["AAPL","MSFT","NVDA","INTC","BABA","PYPL","DIS","T","IBM","CSCO","VZ","PFE","KO","WBA","GE",
    "JPM","BAC","WMT","HD","PG","JNJ","UNH","XOM","CVX","V","MA","ORCL","CRM","AMD","QCOM","CAT"];
  const closes = {};
  for (const s of US.concat(["SPY"])) {
    const fp = path.join(dir, s + "-1day.json");
    if (fs.existsSync(fp)) closes[s] = JSON.parse(fs.readFileSync(fp)).candle.map(c => c.c);
  }
  const S = closes.SPY, syms = Object.keys(closes).filter(s => s !== "SPY");
  const minLen = Math.min(...syms.map(s => closes[s].length), S.length);
  const spy = S.slice(-minLen);
  const betaProxy = (P, s, t, n = 60) => {
    let sp = 0, ss = 0, sss = 0, sps = 0;
    for (let i = t - n + 1; i <= t; i++) { const rp = Math.log(P[i] / P[i - 1]), rs = Math.log(s[i] / s[i - 1]); sp += rp; ss += rs; sss += rs * rs; sps += rp * rs; }
    const vs = sss / n - (ss / n) ** 2; return vs > 0 ? (sps / n - sp * ss / n / n) / vs : 1;
  };
  const rows = [];
  for (const sym of syms) {
    const P = closes[sym].slice(-minLen);
    const R = P.map((v, i) => v / spy[i]);
    for (let t = 300; t <= minLen - 41; t += 5) {
      const xo = F.structFeats(P, t), xr = F.structFeats(R, t);
      if (!xo || !xr) continue;
      const y = {}, prevRel = {};
      for (const H of [10, 20, 40]) {
        y[H] = (P[t + H] / P[t] > spy[t + H] / spy[t]) ? 1 : 0;
        prevRel[H] = (P[t] / P[t - H] > spy[t] / spy[t - H]) ? 1 : 0;
      }
      rows.push({ sym, x: xo.concat(xr, [betaProxy(P, spy, t)]), y, prevRel, relMom250: R[t] / R[t - 250] - 1 });
    }
  }
  console.log("\n== ② rel: 확장 베이스라인(±지속성·±모멘텀·다수결) 재판정 ==");
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  for (const H of [10, 20, 40]) {
    const tr = [], te = [];
    for (const s of Object.keys(bySym)) { const a = bySym[s], k = F.splitIdx(a.length); tr.push(...a.slice(0, k)); te.push(...a.slice(k)); }
    const m = F.logitFit(tr.map(r => r.x), tr.map(r => r.y[H]));
    const yTe = te.map(r => r.y[H]), pTe = te.map(r => m.predict(r.x));
    const majTrain = tr.map(r => r.y[H]).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
    // 확장 베이스라인 집합: 각 레코드에 대한 규칙 예측들
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
    console.log(`  H=${H}: 모델 ${pct(aFull)} vs 최강규칙 ${best[0]} ${pct(best[1])} → lift ${pp(aFull - best[1])} · 전/후반 ${pp(h1)}/${pp(h2)}`
      + `  (규칙들: ${Object.entries(baseAccs).map(([k, v]) => k + " " + pct(v)).join(" · ")})`);
  }
}

excessCheck();
relCheck();
