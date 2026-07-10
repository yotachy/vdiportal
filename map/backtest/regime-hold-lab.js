// backtest/regime-hold-lab.js — 새 예측축 후보 정직 검증 (공유파일 수정 없음, 새 랩 전용)
//
//   (a) 국면 지속: 현재 국면(range/up/down)이 H봉 뒤에도 유지되는가? 전환(switch)을 사전예측 가능한가?
//       → 이중 베이스라인 ①다수결(전체 최빈 결과) ②지속성(항상 '유지' 예측) 둘 다 ≥+1%p 초과해야 진짜.
//   (b) 최적 보유기간: context.opportunity(지지반등/하락후반등) 발생 시 보유 10/20/40/60봉 중
//       위험조정수익(평균/변동성) 최대는? 그 최적H가 신호 특성으로 사전예측 가능한가?
//       → 베이스라인 ①고정최적H(train 최적을 test 전체 적용) ②기본홀드20. 적응형이 둘 다 ≥+1%p 초과해야 진짜.
//
//   OOS: 종목별 앞 60% train / 뒤 40% test. lookahead 없음(엔진 입력은 과거창만).
//   주의(정직): stride10·horizon≤60 → 전방창 최대 6배 중첩 → 표본 상관으로 유의성 과대평가 가능. 판정은 보수적으로.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");

const WARMUP = 200, LOOKBACK = 500, STRIDE = 10, MAXH = 60;
const HORIZONS = [10, 20, 40, 60];          // 보유/전방수익 지평
const RHOR = [10, 20, 40];                  // 국면 지속 지평(=STRIDE 배수: 1,2,4 스텝)
const CACHE = path.join(__dirname, "regime-hold-records.json");
const TRAIN_FRAC = 0.6;

// ---- 지표 헬퍼(랩 로컬, 엔진과 독립) ----
function sma(a, e, n) { if (e < n - 1) return null; let s = 0; for (let i = e - n + 1; i <= e; i++) s += a[i]; return s / n; }
function stdev(a, e, n, m) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += (a[i] - m) ** 2; return Math.sqrt(s / n); }
function rsiAt(a, n, e) { if (e < n) return null; let g = 0, l = 0; for (let i = e - n + 1; i <= e; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); }
function logvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }

function featAt(price, t) {   // t시점 특성(과거만 사용)
  const c = price[t];
  const ma20 = sma(price, t, 20), ma50 = sma(price, t, 50), ma200 = sma(price, t, 200);
  const ma200p = sma(price, t - 20, 200), ma50p = sma(price, t - 10, 50), ma20p = sma(price, t - 10, 20);
  if (!ma20 || !ma50 || !ma200 || !ma200p || !ma50p || !ma20p) return null;
  const sd20 = stdev(price, t, 20, ma20); if (!sd20) return null;
  const rsi = rsiAt(price, 14, t), rsi3 = rsiAt(price, 14, t - 3); if (rsi == null || rsi3 == null) return null;
  const pctB = (c - (ma20 - 2 * sd20)) / (4 * sd20) - 0.5;
  const rsiSlope = (rsi - rsi3) / 20;
  const hi60 = Math.max.apply(null, price.slice(t - 60, t + 1)), lo60 = Math.min.apply(null, price.slice(t - 60, t + 1));
  const dd = hi60 > 0 ? c / hi60 - 1 : 0, ru = lo60 > 0 ? c / lo60 - 1 : 0;
  const vol20 = logvol(price, t, 20), vol60 = logvol(price, t, 60);
  const feat = {
    rsi, rsiN: (rsi - 50) / 50, rsiSlope, pctB, dd, ru,
    distMA20: c / ma20 - 1, distMA50: c / ma50 - 1, distMA200: c / ma200 - 1,
    slMA20: ma20 / ma20p - 1, slMA50: ma50 / ma50p - 1, slMA200: ma200 / ma200p - 1,
    vol20, volR: vol60 ? vol20 / vol60 - 1 : 0,
    ret5: c / price[t - 5] - 1, ret10: c / price[t - 10] - 1, ret20: c / price[t - 20] - 1,
  };
  for (const k in feat) if (!isFinite(feat[k])) return null;
  return feat;
}

// ---- 캡처: 엔진 1패스 → 종목별 stride점에 state/opp/특성/전방수익 기록 ----
function capture() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const bySym = {};
  const g = B.standardGraph();
  let done = 0;
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), N = price.length;
    const pts = [];
    for (let t = WARMUP; t <= N - MAXH - 1; t += STRIDE) {
      const feat = featAt(price, t); if (!feat) continue;
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: MAXH, timeframe: "1day" }); } catch (e) { continue; }
      const ctx = r.verdict && r.verdict.context; if (!ctx) continue;
      const rets = {}; for (const h of HORIZONS) rets[h] = price[t + h] / price[t] - 1;
      const opp = ctx.opportunity ? { sub: ctx.opportunity.sub } : null;
      pts.push({ t, state: ctx.state, strength: ctx.strength || 0, opp, feat, rets });
    }
    bySym[fx.symbol || f] = pts;
    done++;
    console.error("  " + (fx.symbol || f) + " → " + pts.length + " (" + done + "/" + files.length + ")");
  }
  const out = { stride: STRIDE, horizons: HORIZONS, rhor: RHOR, bySym };
  fs.writeFileSync(CACHE, JSON.stringify(out));
  return out;
}

function load() {
  if (fs.existsSync(CACHE)) { console.error("캐시 사용: " + CACHE); return JSON.parse(fs.readFileSync(CACHE, "utf8")); }
  console.error("캡처 시작(엔진 패스, 수 분 소요)…");
  return capture();
}

// ---- 로지스틱 회귀(z-정규화 + GD, L2) ----
function trainLogit(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j];
  for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2;
  for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 3e-3, EP = 400;
  for (let ep = 0; ep < EP; ep++) {
    const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length;
  }
  return { pred: x => { const zx = z(x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; return 1 / (1 + Math.exp(-s)); }, w };
}

const P = x => (x == null ? "–" : (x * 100).toFixed(1) + "%");
const Pe = x => (x == null ? "–" : (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%");
function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function std(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); }

// 종목별 60/40 시간분할 → train/test 인덱스 집합
function splitPts(pts) {
  const cut = Math.floor(pts.length * TRAIN_FRAC);
  return { train: pts.slice(0, cut).map((p, i) => ({ p, i })), test: pts.slice(cut).map((p, i) => ({ p, i: cut + i })) };
}

const FEATKEYS = ["rsiN", "rsiSlope", "pctB", "dd", "ru", "distMA20", "distMA50", "distMA200", "slMA20", "slMA50", "slMA200", "vol20", "volR", "ret5", "ret10", "ret20"];
function fvec(p, extra) { const v = FEATKEYS.map(k => p.feat[k]); if (extra) v.push(...extra(p)); return v; }

// ============ (a) 국면 지속 ============
function regimePersistence(data) {
  console.log("\n════════════ (a) 국면 지속 검증 ════════════");
  console.log("전방 state는 엔진의 동일 분류기(stride점)로 판정. '유지'=state[t+H]===state[t].");
  const STATES = ["range", "up", "down"];
  for (const H of RHOR) {
    const step = H / STRIDE;
    // train/test 표본 수집: 각 점 + step 뒤 점이 같은 종목 내 존재해야
    const TR = [], TE = [];
    for (const sym in data.bySym) {
      const pts = data.bySym[sym], cut = Math.floor(pts.length * TRAIN_FRAC);
      for (let i = 0; i + step < pts.length; i++) {
        const cur = pts[i], fut = pts[i + step];
        const rec = { state: cur.state, persist: fut.state === cur.state ? 1 : 0, futState: fut.state, feat: cur.feat, strength: cur.strength };
        (i < cut ? TR : TE).push(rec);
      }
    }
    // 베이스라인
    // 다수결(전체 최빈 state) — train에서 결정, test에서 적중
    const cnt = {}; for (const r of TR) cnt[r.futState] = (cnt[r.futState] || 0) + 1;
    const majState = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    const majAcc = TE.filter(r => r.futState === majState).length / TE.length;
    // 지속성(현상태 유지 예측) = P(state[t+H]===state[t]) on test
    const persAcc = TE.filter(r => r.persist).length / TE.length;
    console.log("\n[H=" + H + "봉] test표본 " + TE.length);
    console.log("  베이스라인 다수결(항상 '" + majState + "') 적중 : " + P(majAcc));
    console.log("  베이스라인 지속성(항상 현상태 유지) 적중: " + P(persAcc) + "  → 다수결 대비 " + (persAcc - majAcc >= 0 ? "+" : "") + ((persAcc - majAcc) * 100).toFixed(1) + "%p" + (persAcc - majAcc >= 0.01 ? " ✅현재국면 정보有" : " 🔴정보無"));
    // 국면별 유지확률(test)
    for (const s of STATES) {
      const sub = TE.filter(r => r.state === s); if (!sub.length) continue;
      const pr = sub.filter(r => r.persist).length / sub.length;
      const to = {}; for (const r of sub) if (r.futState !== s) to[r.futState] = (to[r.futState] || 0) + 1;
      const toStr = Object.keys(to).sort((a, b) => to[b] - to[a]).map(k => k + " " + P(to[k] / sub.length)).join(", ");
      console.log("    현재 " + s.padEnd(5) + " (n=" + String(sub.length).padStart(4) + ") 유지 " + P(pr) + "  전환→ " + (toStr || "–"));
    }
    // 전환 사전예측 모델: 현재 state별로 persist(1)/switch(0)를 특성으로 예측, OOS.
    // 다수결 베이스라인(그 state의 최빈결과) 대비 적중 향상되면 '전환 예측 가능'.
    for (const s of STATES) {
      const trS = TR.filter(r => r.state === s), teS = TE.filter(r => r.state === s);
      if (trS.length < 80 || teS.length < 40) continue;
      const D = FEATKEYS.length + 1;
      const mk = r => ({ x: [...FEATKEYS.map(k => r.feat[k]), r.strength], y: r.persist });
      const m = trainLogit(trS.map(mk), D);
      // 모델: p>0.5면 유지 예측
      let hit = 0; for (const r of teS) { const p = m.pred([...FEATKEYS.map(k => r.feat[k]), r.strength]); if ((p >= 0.5 ? 1 : 0) === r.persist) hit++; }
      const modelAcc = hit / teS.length;
      const p1 = teS.filter(r => r.persist).length / teS.length;
      const majSub = Math.max(p1, 1 - p1);   // 그 state 내 다수결(유지 or 전환 최빈)
      const lift = modelAcc - majSub;
      console.log("    └ 전환예측[" + s + "] 모델 " + P(modelAcc) + " vs 국면내다수결 " + P(majSub) + "  → " + (lift >= 0 ? "+" : "") + (lift * 100).toFixed(1) + "%p" + (lift >= 0.01 ? " ✅" : " 🔴"));
    }
  }
}

// ============ (b) 최적 보유기간 ============
function holdingPeriod(data) {
  console.log("\n════════════ (b) 최적 보유기간 검증 ════════════");
  // opportunity 발생 신호 수집(train/test 분할)
  const TR = [], TE = [];
  for (const sym in data.bySym) {
    const pts = data.bySym[sym], cut = Math.floor(pts.length * TRAIN_FRAC);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; if (!p.opp) continue;
      const rec = { sub: p.opp.sub, feat: p.feat, rets: p.rets };
      (i < cut ? TR : TE).push(rec);
    }
  }
  console.log("opportunity 신호: train " + TR.length + " · test " + TE.length + " (support=지지반등, recovery=하락후반등)");
  const bySub = { all: r => true, support: r => r.sub === "support", recovery: r => r.sub === "recovery" };
  for (const sname in bySub) {
    const trS = TR.filter(bySub[sname]), teS = TE.filter(bySub[sname]);
    if (teS.length < 20) { console.log("\n[" + sname + "] test<20 표본부족 — 생략(n=" + teS.length + ")"); continue; }
    console.log("\n[" + sname + "] train " + trS.length + " · test " + teS.length);
    console.log("  지평   test평균   변동성   위험조정   승률");
    const stat = {};
    for (const h of HORIZONS) {
      const rr = teS.map(r => r.rets[h]);
      const mu = mean(rr), sd = std(rr), ra = sd ? mu / sd : 0, wr = rr.filter(v => v > 0).length / rr.length;
      stat[h] = { mu, sd, ra, wr };
      console.log("   " + String(h).padStart(4) + "봉   " + Pe(mu).padStart(8) + "  " + P(sd).padStart(7) + "  " + ra.toFixed(3).padStart(8) + "   " + P(wr));
    }
    // 베이스라인 ①: train에서 위험조정 최대 H → test 적용
    const trStat = {}; for (const h of HORIZONS) { const rr = trS.map(r => r.rets[h]); const mu = mean(rr), sd = std(rr); trStat[h] = sd ? mu / sd : 0; }
    const bestFixed = HORIZONS.slice().sort((a, b) => trStat[b] - trStat[a])[0];
    // 베이스라인 ②: 기본홀드 20
    console.log("  베이스라인 고정최적H(train기준) = " + bestFixed + "봉 → test 위험조정 " + stat[bestFixed].ra.toFixed(3) + " · 평균 " + Pe(stat[bestFixed].mu));
    console.log("  베이스라인 기본홀드20 → test 위험조정 " + stat[20].ra.toFixed(3) + " · 평균 " + Pe(stat[20].mu));

    // 적응형: 신호특성 → 최적H 사전예측 가능?
    // train에서 각 특성 중앙값으로 이분 → 하위군/상위군의 (train)최적H가 다르면 그 규칙을 test에 적용, 고정최적 대비 향상되는지.
    if (trS.length >= 60) {
      let bestGain = null;
      for (const fk of ["dd", "rsiSlope", "pctB", "vol20", "distMA200", "ret20"]) {
        const vals = trS.map(r => r.feat[fk]).sort((a, b) => a - b);
        const med = vals[Math.floor(vals.length / 2)];
        const grp = (arr, lo) => arr.filter(r => lo ? r.feat[fk] <= med : r.feat[fk] > med);
        // train 각 군 최적H
        const bestOf = arr => { let bh = HORIZONS[0], bv = -1e9; for (const h of HORIZONS) { const rr = arr.map(r => r.rets[h]); const sd = std(rr), ra = sd ? mean(rr) / sd : 0; if (ra > bv) { bv = ra; bh = h; } } return bh; };
        const hLo = bestOf(grp(trS, true)), hHi = bestOf(grp(trS, false));
        // test 적응형 수익(신호별 소속군의 H)
        const adaptR = teS.map(r => r.rets[r.feat[fk] <= med ? hLo : hHi]);
        const mu = mean(adaptR), sd = std(adaptR), ra = sd ? mu / sd : 0;
        const gain = ra - stat[bestFixed].ra;
        if (bestGain == null || gain > bestGain.gain) bestGain = { fk, hLo, hHi, mu, ra, gain };
      }
      if (bestGain) {
        const g = bestGain;
        console.log("  적응형 최선: " + g.fk + " 분기(≤중앙값→" + g.hLo + "봉 / 초과→" + g.hHi + "봉) → test 위험조정 " + g.ra.toFixed(3) + " · 평균 " + Pe(g.mu));
        console.log("    → 고정최적H 대비 " + (g.gain >= 0 ? "+" : "") + g.gain.toFixed(3) + (g.gain >= 0.05 ? " ✅사전예측 가능성" : " 🔴향상 미미(사전예측 불가)"));
      }
    }
  }
}

function main() {
  const data = load();
  let total = 0; for (const s in data.bySym) total += data.bySym[s].length;
  console.log("\n총 시점 " + total + " · 종목 " + Object.keys(data.bySym).length + " · stride " + data.stride);
  regimePersistence(data);
  holdingPeriod(data);
  console.log("\n판정 규율: (a)전환예측 모델이 다수결 ≥+1%p, (b)적응형이 고정최적H 향상 명확 — 아니면 기각.");
}
main();
