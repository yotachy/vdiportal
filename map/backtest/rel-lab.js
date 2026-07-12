// backtest/rel-lab.js — Track 1: 상대 방향(시장(SPY) 대비 H봉 아웃퍼폼 확률)
// 재정의 근거: 절대 방향은 드리프트 오염(base 55~68%)으로 스킬 측정 불가. 상대 방향은 base ~50%.
// 관문(사전 등록): OOS서 다수결·지속성·모멘텀단독 전부 +1.5pp↑ · 전/후반 양수 · LOSO 유지.
// 주의: 끝 정렬(slice(-minLen)) = 동일 거래일 근사(momentum-xs 선례, 미국주식+SPY 공통 캘린더).
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");
const M = require("./metrics.js");

const US = ["AAPL","MSFT","NVDA","INTC","BABA","PYPL","DIS","T","IBM","CSCO","VZ","PFE","KO","WBA","GE",
  "JPM","BAC","WMT","HD","PG","JNJ","UNH","XOM","CVX","V","MA","ORCL","CRM","AMD","QCOM","CAT"];
const HS = [10, 20, 40], STRIDE = 5, START = 300;

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
  for (let i = t - n + 1; i <= t; i++) {
    const rp = Math.log(P[i] / P[i - 1]), rs = Math.log(S[i] / S[i - 1]);
    sp += rp; ss += rs; sss += rs * rs; sps += rp * rs;
  }
  const vs = sss / n - (ss / n) ** 2;
  return vs > 0 ? (sps / n - sp * ss / n / n) / vs : 1;   // 회귀 베타
}

// rows: {sym, t, x[25], y{}, prevRel, relMom250, mktUp}
function buildRows(closes) {
  const S = closes.SPY;
  const syms = Object.keys(closes).filter(s => s !== "SPY");
  const minLen = Math.min(...syms.map(s => closes[s].length), S.length);
  const spy = S.slice(-minLen);
  const rows = [];
  for (const sym of syms) {
    const P = closes[sym].slice(-minLen);
    const R = P.map((v, i) => v / spy[i]);   // 상대 시계열
    for (let t = START; t <= minLen - Math.max(...HS) - 1; t += STRIDE) {
      const xo = F.structFeats(P, t), xr = F.structFeats(R, t);
      if (!xo || !xr) continue;
      const x = xo.concat(xr, [betaProxy(P, spy, t)]);
      const y = {}; for (const H of HS) y[H] = (P[t + H] / P[t] > spy[t + H] / spy[t]) ? 1 : 0;
      const prevRel = {}; for (const H of HS) prevRel[H] = (P[t] / P[t - H] > spy[t] / spy[t - H]) ? 1 : 0;
      rows.push({ sym, t, x, y, prevRel, relMom250: R[t] / R[t - 250] - 1, mktUp: spy[t] / spy[t - 60] > 1 ? 1 : 0 });
    }
  }
  return { rows, minLen, nSym: syms.length };
}

const pct = x => x == null ? "–" : (x * 100).toFixed(1) + "%";
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

function evalH(rows, H, label) {
  // 종목별 시간분할 60/40 — train은 전 종목의 전반부, test는 전 종목의 후반부(시간 순서 보존)
  const bySym = {};
  for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const tr = [], te = [];
  for (const s of Object.keys(bySym)) {
    const a = bySym[s], k = F.splitIdx(a.length);
    tr.push(...a.slice(0, k)); te.push(...a.slice(k));
  }
  const fit = (rs, cols) => F.logitFit(rs.map(r => cols ? cols(r) : r.x), rs.map(r => r.y[H]));
  const full = fit(tr), momOnly = fit(tr, r => [r.relMom250]);
  const yTe = te.map(r => r.y[H]);
  const pFull = te.map(r => full.predict(r.x)), pMom = te.map(r => momOnly.predict([r.relMom250]));
  const base = yTe.reduce((s, v) => s + v, 0) / yTe.length;
  const majTrain = tr.map(r => r.y[H]).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
  const majAcc = yTe.filter(v => v === majTrain).length / yTe.length;
  const persAcc = te.filter(r => r.prevRel[H] === r.y[H]).length / te.length;
  const momSignAcc = te.filter(r => (r.relMom250 > 0 ? 1 : 0) === r.y[H]).length / te.length;
  const aFull = F.acc(pFull, yTe), aMom = F.acc(pMom, yTe);
  const worst = Math.max(majAcc, persAcc, momSignAcc);
  // 전/후반 안정성(테스트 구간 반분)
  const mid = Math.floor(te.length / 2);
  const h1 = F.acc(pFull.slice(0, mid), yTe.slice(0, mid)), h2 = F.acc(pFull.slice(mid), yTe.slice(mid));
  const b1 = Math.max(yTe.slice(0, mid).filter(v => v === majTrain).length / mid,
    te.slice(0, mid).filter(r => r.prevRel[H] === r.y[H]).length / mid,
    te.slice(0, mid).filter(r => (r.relMom250 > 0 ? 1 : 0) === r.y[H]).length / mid);
  const b2 = Math.max(yTe.slice(mid).filter(v => v === majTrain).length / (te.length - mid),
    te.slice(mid).filter(r => r.prevRel[H] === r.y[H]).length / (te.length - mid),
    te.slice(mid).filter(r => (r.relMom250 > 0 ? 1 : 0) === r.y[H]).length / (te.length - mid));
  const brier = M.brierDecomp(pFull.map((p, i) => ({ p, y: yTe[i] })));
  // 시장 국면별 base(고베타 편향 체크)
  const upTe = te.filter(r => r.mktUp), dnTe = te.filter(r => !r.mktUp);
  console.log(`\n[${label} H=${H}] test n=${te.length} base(아웃퍼폼율)=${pct(base)}`);
  console.log(`  풀모델 ${pct(aFull)} · 모멘텀단독모델 ${pct(aMom)} | 다수결 ${pct(majAcc)} · 지속성 ${pct(persAcc)} · 모멘텀부호 ${pct(momSignAcc)}`);
  console.log(`  vs 최강베이스라인 ${pp(aFull - worst)} · 모멘텀단독 대비 증분 ${pp(aFull - Math.max(aMom, momSignAcc))}`);
  console.log(`  전/후반: ${pp(h1 - b1)} / ${pp(h2 - b2)} · BSS ${brier.bss.toFixed(3)} · resolution ${brier.resolution.toFixed(4)} · reliability ${brier.reliability.toFixed(4)}`);
  console.log(`  시장상승기 base ${pct(upTe.length ? upTe.reduce((s, r) => s + r.y[H], 0) / upTe.length : null)} (n=${upTe.length}) · 하락기 base ${pct(dnTe.length ? dnTe.reduce((s, r) => s + r.y[H], 0) / dnTe.length : null)} (n=${dnTe.length})`);
  return { H, aFull, worst, momIncr: aFull - Math.max(aMom, momSignAcc) };
}

function evalLOSO(rows, H) {
  const syms = [...new Set(rows.map(r => r.sym))];
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  let hit = 0, n = 0, blHit = 0;
  for (const held of syms) {
    const tr = [], te = [];
    for (const s of syms) {
      const a = bySym[s], k = F.splitIdx(a.length);
      if (s === held) te.push(...a.slice(k)); else tr.push(...a.slice(0, k));   // 종목·기간 이중 분리
    }
    if (!te.length || !tr.length) continue;
    const m = F.logitFit(tr.map(r => r.x), tr.map(r => r.y[H]));
    for (const r of te) { n++; if ((m.predict(r.x) >= 0.5 ? 1 : 0) === r.y[H]) hit++; if ((r.relMom250 > 0 ? 1 : 0) === r.y[H]) blHit++; }
  }
  console.log(`  [LOSO H=${H}] 풀모델 ${pct(hit / n)} vs 모멘텀부호 ${pct(blHit / n)} → ${pp(hit / n - blHit / n)} (n=${n})`);
}

function smoke() {
  // 합성: S 완만상승, A=S×exp(+w), B=S×exp(−w) — 상대추세가 지속되므로 rel 피처로 분리 가능해야 함
  const n = 900, S = [100], w = [0];
  for (let i = 1; i < n; i++) { S.push(S[i - 1] * (1 + 0.0004 + Math.sin(i * 0.5) * 0.008)); w.push(w[i - 1] + 0.0006 + Math.sin(i * 0.05) * 0.0004); }
  const closes = { SPY: S, AAA: S.map((v, i) => v * Math.exp(w[i])), BBB: S.map((v, i) => v * Math.exp(-w[i])) };
  const { rows } = buildRows(closes);
  const r = evalH(rows, 20, "SMOKE");
  if (!(r.aFull > 0.65)) { console.error("SMOKE FAIL: 분리 가능한 합성서 65% 미달"); process.exit(1); }
  console.log("SMOKE OK");
}

function main() {
  if (process.argv.includes("--smoke")) return smoke();
  const closes = loadCloses();
  if (!closes.SPY) { console.error("SPY 픽스처 없음 — fetch-fixtures 먼저"); process.exit(1); }
  const { rows, minLen, nSym } = buildRows(closes);
  console.log(`상대 방향 랩 — 종목 ${nSym} · 정렬 ${minLen}봉 · 표본 ${rows.length} (끝정렬 근사·stride ${STRIDE})`);
  const res = HS.map(H => evalH(rows, H, "REL"));
  for (const H of HS) evalLOSO(rows, H);
  console.log("\n관문: 최강베이스라인 +1.5pp↑ & 전/후반 양수 & LOSO 유지 & (신규축 주장 시) 모멘텀단독 +1pp↑");
  res.forEach(r => console.log(`  H=${r.H}: lift ${pp(r.aFull - r.worst)} · 모멘텀 증분 ${pp(r.momIncr)}`));
}
main();
