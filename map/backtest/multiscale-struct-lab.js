// backtest/multiscale-struct-lab.js — 다중스케일 구조 bias 검증 랩
// 가설: 구조 방향을 대/중/소 스케일로 합성하면 단일-최근스윙보다 OOS 방향 적중↑
// 격리: forge-core 기본 동작 불변(run의 _msStruct 기본 off). walk-forward 미래 미참조.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const { multiScaleStructBias } = require("./multiscale-struct.js");

const WARMUP = 200, LOOKBACK = 600, HORIZONS = [3, 5, 10, 20, 40, 60], MAXH = 60, STRIDE = 10;

function slopeLog(price, end, n) {
  if (end < n) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { const x = i, y = Math.log(price[end - n + 1 + i] || 1e-9); sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const d = n * sxx - sx * sx; return d ? (n * sxy - sx * sy) / d : 0;
}

function capture(opts) {
  opts = opts || {};
  const engine = opts.engine !== false;        // false=A단계만(run 생략·고속)
  const stride = opts.stride || STRIDE;
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const recs = [];
  let sanityFail = 0, sanityChecked = 0;
  for (const f of files) {
    const sym = f.replace("-1day.json", "");
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const candle = fx.candle, price = candle.map(c => c.c), N = price.length;
    const g = FC.sampleGraph();
    for (let t = WARMUP; t <= N - MAXH - 1; t += stride) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      const w = { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) };
      let single, ms, engBase = null, engMs = null;
      try {
        single = FC.analyzeStructure(w.price, { swing: 0.03 }).bias;
        ms = multiScaleStructBias(w.price, {});
        if (engine) {
          const rb = FC.run(g, w, { timeframe: "1day" });
          const rm = FC.run(g, w, { timeframe: "1day", _msStruct: true });
          engBase = rb.verdict.score; engMs = rm.verdict.score;
          // sanity: 무플래그 == 플래그 off (첫 종목 소표본만)
          if (sanityChecked < 30) { sanityChecked++; const rbOff = FC.run(g, w, { timeframe: "1day", _msStruct: false }); if (rbOff.verdict.score !== engBase) sanityFail++; }
        }
      } catch (e) { continue; }
      const act = {}; for (const h of HORIZONS) act[h] = Math.sign(price[t + h] - price[t]);
      recs.push({ sym, t, single, ms, engBase, engMs, sl200: slopeLog(price, t, 200), ret20: t >= 20 ? price[t] / price[t - 20] - 1 : 0, act });
    }
  }
  return { recs, sanityFail, sanityChecked };
}

// A단계만: single vs ms 신호 방향 적중률(run 없이 고속)
function reportA(recs) {
  console.log("=== A단계(신호 프리필터): single vs 다중스케일 ms ===");
  console.log("표본 " + recs.length + " 시점 · " + new Set(recs.map(r => r.sym)).size + " 종목");
  console.log("지평 | single  ms      Δ");
  let posD = 0, totD = 0;
  for (const h of HORIZONS) {
    const s = hitRate(recs, r => r.single, h).acc, m = hitRate(recs, r => r.ms, h).acc;
    const d = (s != null && m != null) ? m - s : null;
    if (d != null) { totD++; if (d > 0) posD++; }
    const pct = x => x == null ? "  -  " : (x * 100).toFixed(1);
    console.log(String(h).padStart(3) + "  | " + pct(s) + "  " + pct(m) + "  " + (d == null ? "-" : (d >= 0 ? "+" : "") + (d * 100).toFixed(1)));
  }
  const pass = posD > totD / 2;
  console.log("\nA단계 판정: ms가 single 초과 " + posD + "/" + totD + " 지평 → " + (pass ? "PASS(B단계 진행 가치 있음)" : "REJECT(신호부터 순증분 없음 — B 불필요)"));
  return pass;
}

// 방향 적중률: 예측부호 vs 실제부호. 중립(예측0 or 실제0)은 제외. {hit, n}
function hitRate(recs, predFn, h) {
  let hit = 0, n = 0;
  for (const r of recs) {
    const p = Math.sign(predFn(r)), a = r.act[h];
    if (p === 0 || a === 0) continue;
    n++; if (p === a) hit++;
  }
  return { acc: n ? hit / n : null, n };
}

function evalReport(recs, sanity) {
  const P = {
    single: r => r.single, ms: r => r.ms,
    engBase: r => r.engBase, engMs: r => r.engMs,
    mom: r => r.ret20, trend: r => r.sl200,
  };
  console.log("=== 다중스케일 구조 bias 검증 랩 ===");
  console.log("표본: " + recs.length + " 시점 · " + new Set(recs.map(r => r.sym)).size + " 종목 · walk-forward");
  console.log("sanity(_msStruct off == 무플래그): " + (sanity.sanityFail === 0 ? "OK(" + sanity.sanityChecked + "건 일치)" : "FAIL " + sanity.sanityFail + "/" + sanity.sanityChecked));
  console.log("");
  console.log("지평 | single ms   | engBase engMs Δ    | mom   trend(자명규칙)");
  const rows = [];
  for (const h of HORIZONS) {
    const s = hitRate(recs, P.single, h).acc, m = hitRate(recs, P.ms, h).acc;
    const eb = hitRate(recs, P.engBase, h).acc, em = hitRate(recs, P.engMs, h).acc;
    const mo = hitRate(recs, P.mom, h).acc, tr = hitRate(recs, P.trend, h).acc;
    const d = (em != null && eb != null) ? em - eb : null;
    rows.push({ h, s, m, eb, em, d, mo, tr });
    const pct = x => x == null ? "  -  " : (x * 100).toFixed(1);
    console.log(
      String(h).padStart(3) + "  | " + pct(s) + " " + pct(m) + " | " +
      pct(eb) + "  " + pct(em) + " " + (d == null ? " - " : (d >= 0 ? "+" : "") + (d * 100).toFixed(1)) + " | " +
      pct(mo) + " " + pct(tr)
    );
  }
  // ── 게이트 ──
  console.log("\n=== 관문 ===");
  // ① 엔진 순증분: engMs > engBase 지평 다수
  const posD = rows.filter(r => r.d != null && r.d > 0).length, totD = rows.filter(r => r.d != null).length;
  const g1 = posD > totD / 2;
  console.log("① 엔진 OOS 순증분(engMs>engBase): " + posD + "/" + totD + " 지평 → " + (g1 ? "PASS" : "FAIL"));
  // ② 자명규칙 최강치 초과(대표 h=20)
  const r20 = rows.find(r => r.h === 20);
  const selfBest = Math.max(r20.mo || 0, r20.tr || 0);
  const g2 = r20.em != null && r20.em > selfBest;
  console.log("② 자명규칙 최강 초과(h20 engMs " + (r20.em * 100).toFixed(1) + " vs self " + (selfBest * 100).toFixed(1) + "): " + (g2 ? "PASS" : "FAIL"));
  // ④ LOSO: 종목별 engMs-engBase(h20) 분포
  const syms = [...new Set(recs.map(r => r.sym))];
  const per = syms.map(sm => {
    const sub = recs.filter(r => r.sym === sm);
    const eb = hitRate(sub, P.engBase, 20).acc, em = hitRate(sub, P.engMs, 20).acc;
    return (em != null && eb != null) ? em - eb : null;
  }).filter(x => x != null);
  const posSym = per.filter(x => x > 0).length, worst = per.length ? Math.min(...per) : null;
  const g4 = posSym >= per.length * 0.5;
  console.log("④ LOSO(종목별 h20 Δ>0): " + posSym + "/" + per.length + " 종목 · 최악 " + (worst == null ? "-" : (worst * 100).toFixed(1)) + " → " + (g4 ? "PASS" : "FAIL"));
  // ⑤ 전/후반(h20)
  const half = Math.floor(recs.length / 2);
  const A = recs.slice(0, half), Bh = recs.slice(half);
  const dA = (hitRate(A, P.engMs, 20).acc || 0) - (hitRate(A, P.engBase, 20).acc || 0);
  const dB = (hitRate(Bh, P.engMs, 20).acc || 0) - (hitRate(Bh, P.engBase, 20).acc || 0);
  const g5 = dA > 0 && dB > 0;
  console.log("⑤ 전/후반 순증분(h20): 전 " + (dA * 100).toFixed(1) + " / 후 " + (dB * 100).toFixed(1) + " → " + (g5 ? "PASS" : "FAIL"));
  const verdict = (g1 && g2 && g4 && g5) ? "PASS(승격 후보)" : "REJECT(단일 유지)";
  console.log("\n=== 종합 판정: " + verdict + " ===");
  console.log("(관문 ③ BSS는 방향-신호라 생략, 승격 검토 시 확률 캘리브레이션에서 별도 측정)");
  return { rows, verdict, g1, g2, g4, g5, sanity };
}

if (require.main === module) {
  const t0 = Date.now();
  const aOnly = process.argv.includes("--a");
  const stride = process.argv.includes("--stride40") ? 40 : STRIDE;
  if (aOnly) {
    const { recs } = capture({ engine: false, stride });
    reportA(recs);
  } else {
    const { recs, sanityFail, sanityChecked } = capture({ stride });
    reportA(recs);
    console.log("");
    evalReport(recs, { sanityFail, sanityChecked });
  }
  console.log("\n(소요 " + ((Date.now() - t0) / 1000).toFixed(1) + "s)");
}

module.exports = { capture, evalReport, hitRate, slopeLog };
