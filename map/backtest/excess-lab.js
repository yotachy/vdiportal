// backtest/excess-lab.js — Track 2: 초과 방향(자기 트레일링 드리프트 대비 H봉 초과수익 부호)
// "지금이 이 종목의 평소 대비 좋은 진입 시점인가" — 홀드 대비 타이밍 가치. base ~50% 설계.
// 대조 타깃 vs0(드리프트 오염 확인)·vs중앙값 병렬 채점. 관문은 공통(+1.5pp·전후반·LOSO).
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");
const M = require("./metrics.js");

const HS = [10, 20, 40], STRIDE = 5, START = 300;

function loadDaily() {
  const dir = path.join(__dirname, "fixtures");
  return fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    .filter(fx => fx.candle.length >= 600);
}

function drift252(p, t) { let s = 0; for (let i = t - 251; i <= t; i++) s += Math.log(p[i] / p[i - 1]); return s / 252; }
function medH(p, t, H) {   // 과거 H봉 로그수익 분포 중앙값(252봉 창·H 간격 샘플)
  const a = []; for (let i = t; i - H >= t - 252; i -= H) a.push(Math.log(p[i] / p[i - H]));
  a.sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}

function buildRows(fixtures) {
  const rows = [];
  for (const fx of fixtures) {
    const p = fx.candle.map(c => c.c), N = p.length;
    for (let t = START; t <= N - Math.max(...HS) - 1; t += STRIDE) {
      const x = F.structFeats(p, t); if (!x) continue;
      const d = drift252(p, t);
      const y = {}, y0 = {}, yMed = {}, prev = {};
      for (const H of HS) {
        const fwd = Math.log(p[t + H] / p[t]);
        y[H] = fwd > d * H ? 1 : 0;
        y0[H] = fwd > 0 ? 1 : 0;
        yMed[H] = fwd > medH(p, t, H) ? 1 : 0;
        prev[H] = Math.log(p[t] / p[t - H]) > d * H ? 1 : 0;
      }
      rows.push({ sym: fx.symbol, x, y, y0, yMed, prev });
    }
  }
  return rows;
}

const pct = x => x == null ? "–" : (x * 100).toFixed(1) + "%";
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

function evalTarget(rows, H, key, label) {
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const tr = [], te = [];
  for (const s of Object.keys(bySym)) { const a = bySym[s], k = F.splitIdx(a.length); tr.push(...a.slice(0, k)); te.push(...a.slice(k)); }
  const m = F.logitFit(tr.map(r => r.x), tr.map(r => r[key][H]));
  const yTe = te.map(r => r[key][H]), pTe = te.map(r => m.predict(r.x));
  const base = yTe.reduce((s, v) => s + v, 0) / yTe.length;
  const majTrain = tr.map(r => r[key][H]).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
  const majAcc = yTe.filter(v => v === majTrain).length / yTe.length;
  const persAcc = te.filter(r => r.prev[H] === r[key][H]).length / te.length;
  const worst = Math.max(majAcc, persAcc, 0.5);
  const a = F.acc(pTe, yTe);
  const mid = Math.floor(te.length / 2);
  const h1 = F.acc(pTe.slice(0, mid), yTe.slice(0, mid)) - Math.max(yTe.slice(0, mid).filter(v => v === majTrain).length / mid, te.slice(0, mid).filter(r => r.prev[H] === r[key][H]).length / mid);
  const h2 = F.acc(pTe.slice(mid), yTe.slice(mid)) - Math.max(yTe.slice(mid).filter(v => v === majTrain).length / (te.length - mid), te.slice(mid).filter(r => r.prev[H] === r[key][H]).length / (te.length - mid));
  const brier = M.brierDecomp(pTe.map((p, i) => ({ p, y: yTe[i] })));
  console.log(`  [${label} H=${H}] base ${pct(base)} · 모델 ${pct(a)} | 다수결 ${pct(majAcc)} 지속성 ${pct(persAcc)} → lift ${pp(a - worst)} · 전/후반 ${pp(h1)}/${pp(h2)} · BSS ${brier.bss.toFixed(3)}`);
  return { a, worst };
}

function evalLOSO(rows, H, key) {
  const syms = [...new Set(rows.map(r => r.sym))];
  let hit = 0, n = 0, mHit = 0, mN = 0;
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  for (const held of syms) {
    const tr = [], te = [];
    for (const s of syms) { const a = bySym[s], k = F.splitIdx(a.length); if (s === held) te.push(...a.slice(k)); else tr.push(...a.slice(0, k)); }
    if (!te.length || !tr.length) continue;
    const m = F.logitFit(tr.map(r => r.x), tr.map(r => r[key][H]));
    const majTrain = tr.map(r => r[key][H]).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
    for (const r of te) { n++; if ((m.predict(r.x) >= 0.5 ? 1 : 0) === r[key][H]) hit++; mN++; if (r[key][H] === majTrain) mHit++; }
  }
  console.log(`  [LOSO H=${H}] 모델 ${pct(hit / n)} vs 다수결 ${pct(mHit / mN)} → ${pp(hit / n - mHit / mN)} (n=${n})`);
}

function main() {
  const fixtures = loadDaily();
  const rows = buildRows(fixtures);
  console.log(`초과 방향 랩 — 픽스처 ${fixtures.length} · 표본 ${rows.length}`);
  console.log("\n== 주 타깃: vs 자기 드리프트(252봉) ==");
  for (const H of HS) evalTarget(rows, H, "y", "EXCESS");
  for (const H of HS) evalLOSO(rows, H, "y");
  console.log("\n== 대조: vs 0 (드리프트 오염 확인 — base가 50%서 벗어날 것) ==");
  for (const H of HS) evalTarget(rows, H, "y0", "VS0");
  console.log("\n== 대조: vs 과거 H봉 중앙값 ==");
  for (const H of HS) evalTarget(rows, H, "yMed", "VSMED");
}
main();
