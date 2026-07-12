// backtest/stack-lab.js — Track 3: 검증 6축 출력 스태킹으로 절대 방향 재도전 + Brier 해상도.
// 목표 2단: (a) 정확도 vs 항상상승(+1.5pp 관문 — 전례상 낮은 확률, 정직 보고)
//          (b) 해상도: ECE ≤2.5% 유지하며 resolution↑ (확률 정보성 — 정확도 없이도 채택 가치)
// R:R(이익도달 vs 낙폭 확률)은 기존 방향 실험(07-09) 이후 생긴 피처 — 방향 투입 최초.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const BT = require("./backtest.js");
const M = require("./metrics.js");
const F = require("./feat-lib.js");

const CACHE = path.join(__dirname, "stack-records.json");
const WARMUP = 280, STRIDE = 10, LOOKBACK = 600, H = 60, H2 = 20;

function collect() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const graph = BT.standardGraph();
  const out = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const candle = fx.candle, price = candle.map(c => c.c), N = price.length;
    if (N < WARMUP + H + 10) continue;
    const t0 = Date.now();
    for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      const past = { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) };
      let r; try { r = FC.run(graph, past, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
      const v = r.verdict, ctx = (v && v.context) || {};
      if (!r.prediction || !r.prediction.path) continue;
      out.push({
        sym: fx.symbol, t,
        score: v.score || 0, up: M.upProbFromPrediction(r.prediction),
        vol: ctx.volForecast ? ctx.volForecast.raw : null,
        dd: ctx.ddRisk ? ctx.ddRisk.prob : null,
        upt: ctx.upTarget ? ctx.upTarget.prob : null,
        spk: ctx.spikeRisk ? ctx.spikeRisk.prob : null,
        gap: ctx.gapRisk ? ctx.gapRisk.prob : null,
        tpP: ctx.trendPersist ? ctx.trendPersist.persist : null,
        tpDir: ctx.trendPersist ? (ctx.trendPersist.state === "up" ? 1 : -1) : 0,
        state: ctx.state || "", strength: ctx.strength || 0,
        base: price[t], a20: price[t + H2], a60: price[t + H],
      });
    }
    console.error("  " + fx.symbol + " → 누적 " + out.length + " (" + ((Date.now() - t0) / 1000).toFixed(0) + "s)");
  }
  fs.writeFileSync(CACHE, JSON.stringify(out));
  return out;
}

function feats(r) {
  return [r.score, r.up == null ? 50 : r.up,
    r.vol == null ? 50 : r.vol, r.dd == null ? 34 : r.dd, r.upt == null ? 40 : r.upt,
    r.spk == null ? 44 : r.spk, r.gap == null ? 49 : r.gap, r.gap == null ? 1 : 0,
    r.tpP == null ? 50 : r.tpP, r.tpDir, r.strength,
    r.state === "up" ? 1 : 0, r.state === "down" ? 1 : 0];
}
function featsNoRR(r) { const x = feats(r); return x.slice(0, 3).concat(x.slice(5)); }   // dd·upt 제외

const pct = x => x == null ? "–" : (x * 100).toFixed(1) + "%";
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

function evalDir(recs, aKey, label) {
  const rows = recs.filter(r => r[aKey] > 0 && r.base > 0 && r[aKey] !== r.base && r.up != null);
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const tr = [], te = [];
  for (const s of Object.keys(bySym)) { const a = bySym[s], k = F.splitIdx(a.length); tr.push(...a.slice(0, k)); te.push(...a.slice(k)); }
  const yOf = r => r[aKey] > r.base ? 1 : 0;
  const full = F.logitFit(tr.map(feats), tr.map(yOf));
  const noRR = F.logitFit(tr.map(featsNoRR), tr.map(yOf));
  const yTe = te.map(yOf);
  const pFull = te.map(r => full.predict(feats(r))), pNoRR = te.map(r => noRR.predict(featsNoRR(r)));
  const alwaysUp = yTe.reduce((s, v) => s + v, 0) / yTe.length;
  const engineAcc = te.filter(r => (r.score >= 0 ? 1 : 0) === yOf(r)).length / te.length;
  const aFull = F.acc(pFull, yTe), aNoRR = F.acc(pNoRR, yTe);
  const mid = Math.floor(te.length / 2);
  const lift1 = F.acc(pFull.slice(0, mid), yTe.slice(0, mid)) - yTe.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
  const lift2 = F.acc(pFull.slice(mid), yTe.slice(mid)) - yTe.slice(mid).reduce((s, v) => s + v, 0) / (te.length - mid);
  console.log(`\n[${label}] test n=${te.length} · 항상상승 ${pct(alwaysUp)} · 현행엔진 ${pct(engineAcc)}`);
  console.log(`  스태킹 ${pct(aFull)} (vs 항상상승 ${pp(aFull - alwaysUp)} · 전/후반 ${pp(lift1)}/${pp(lift2)}) · R:R 제외 ${pct(aNoRR)} (R:R 기여 ${pp(aFull - aNoRR)})`);
  // ── Brier 해상도: 현행 캘리브레이션 up vs 스태킹 확률(동일 테스트셋) ──
  const bBase = M.brierDecomp(te.map(r => ({ p: r.up / 100, y: yOf(r) })));
  const bStack = M.brierDecomp(pFull.map((p, i) => ({ p, y: yTe[i] })));
  const eceBase = M.calibration(te.map(r => ({ up: r.up, actual: yOf(r), base: 0.5 })), 10).ece;       // actual>base 규약 재사용
  const eceStack = M.calibration(pFull.map((p, i) => ({ up: p * 100, actual: yTe[i], base: 0.5 })), 10).ece;
  console.log(`  Brier   현행 up: BS ${bBase.brier.toFixed(4)} REL ${bBase.reliability.toFixed(4)} RES ${bBase.resolution.toFixed(4)} BSS ${bBase.bss.toFixed(3)} ECE ${(eceBase * 100).toFixed(1)}%`);
  console.log(`  Brier 스태킹   : BS ${bStack.brier.toFixed(4)} REL ${bStack.reliability.toFixed(4)} RES ${bStack.resolution.toFixed(4)} BSS ${bStack.bss.toFixed(3)} ECE ${(eceStack * 100).toFixed(1)}%`);
  console.log(`  → 해상도 ${bStack.resolution > bBase.resolution ? "증가" : "감소"} ×${(bStack.resolution / (bBase.resolution || 1e-9)).toFixed(2)} · ECE ${(eceStack * 100).toFixed(1)}% (관문 ≤2.5%)`);
  return { aFull, alwaysUp };
}

function evalLOSO(recs, aKey) {
  const rows = recs.filter(r => r[aKey] > 0 && r.base > 0 && r[aKey] !== r.base && r.up != null);
  const syms = [...new Set(rows.map(r => r.sym))];
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  let hit = 0, n = 0, upHit = 0;
  for (const held of syms) {
    const tr = [], te = [];
    for (const s of syms) { const a = bySym[s], k = F.splitIdx(a.length); if (s === held) te.push(...a.slice(k)); else tr.push(...a.slice(0, k)); }
    if (!te.length || !tr.length) continue;
    const yOf = r => r[aKey] > r.base ? 1 : 0;
    const m = F.logitFit(tr.map(feats), tr.map(yOf));
    for (const r of te) { n++; if ((m.predict(feats(r)) >= 0.5 ? 1 : 0) === yOf(r)) hit++; if (yOf(r) === 1) upHit++; }
  }
  console.log(`  [LOSO ${aKey}] 스태킹 ${pct(hit / n)} vs 항상상승 ${pct(upHit / n)} → ${pp(hit / n - upHit / n)} (n=${n})`);
}

function main() {
  let recs;
  if (fs.existsSync(CACHE) && !process.argv.includes("--recollect")) {
    recs = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    console.log("캐시 사용: " + recs.length + " 레코드 (재수집: --recollect)");
  } else { console.log("엔진 1패스 수집 시작(~15–25분)…"); recs = collect(); }
  evalDir(recs, "a60", "H=60 (헤드라인 비교)");
  evalDir(recs, "a20", "H=20 (축 검증 지평)");
  evalLOSO(recs, "a60"); evalLOSO(recs, "a20");
}
main();
