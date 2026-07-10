// backtest/regime-hold-lab2.js — v1 정직성 결함 교정(캐시 재사용, 엔진 재실행 없음).
//   (a) 국면 지속: up/down '전환예측' 리프트가 엔진 기존 strength 필드만으로 나오는가?(ablation)
//       → 전환예측이 새 축이려면 full특성이 strength-only를 유의하게 넘어야.
//   (b) 최적 보유: v1 적응형은 6개 특성 중 test 성과 최대를 골라(test peeking) 편향. 교정:
//       분기특성·군별H를 TRAIN에서만 선택 → TEST 1회 평가. 'test 실제최적 고정H(=60)'도 베이스라인 추가.
"use strict";
const fs = require("fs"), path = require("path");
const CACHE = path.join(__dirname, "regime-hold-records.json");
const data = JSON.parse(fs.readFileSync(CACHE, "utf8"));
const HORIZONS = data.horizons, RHOR = data.rhor, STRIDE = data.stride, TRAIN_FRAC = 0.6;
const FEATKEYS = ["rsiN", "rsiSlope", "pctB", "dd", "ru", "distMA20", "distMA50", "distMA200", "slMA20", "slMA50", "slMA200", "vol20", "volR", "ret5", "ret10", "ret20"];
const P = x => (x == null ? "–" : (x * 100).toFixed(1) + "%");
const Pe = x => (x == null ? "–" : (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%");
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };

function trainLogit(TR, D) {
  const mn = new Array(D).fill(0), sd = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mn[j] += r.x[j];
  for (let j = 0; j < D; j++) mn[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) sd[j] += (r.x[j] - mn[j]) ** 2;
  for (let j = 0; j < D; j++) sd[j] = Math.sqrt(sd[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mn[j]) / sd[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 3e-3, EP = 400;
  for (let ep = 0; ep < EP; ep++) {
    const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length;
  }
  return x => { const zx = z(x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; return 1 / (1 + Math.exp(-s)); };
}

// ===== (a) ablation: strength-only vs full for up/down persistence =====
function ablation() {
  console.log("════════════ (a) 국면전환 예측 — ablation (strength만 vs 전체특성) ════════════");
  console.log("질문: up/down 전환예측 리프트가 엔진 기존 strength 필드 하나로 재현되면 = 새 정보 아님.\n");
  for (const H of RHOR) {
    const step = H / STRIDE;
    const TR = [], TE = [];
    for (const sym in data.bySym) {
      const pts = data.bySym[sym], cut = Math.floor(pts.length * TRAIN_FRAC);
      for (let i = 0; i + step < pts.length; i++) {
        const cur = pts[i], fut = pts[i + step];
        (i < cut ? TR : TE).push({ state: cur.state, persist: fut.state === cur.state ? 1 : 0, feat: cur.feat, strength: cur.strength });
      }
    }
    console.log("[H=" + H + "봉]");
    for (const s of ["up", "down"]) {
      const trS = TR.filter(r => r.state === s), teS = TE.filter(r => r.state === s);
      if (trS.length < 80 || teS.length < 40) { console.log("  " + s + ": 표본부족"); continue; }
      const p1 = teS.filter(r => r.persist).length / teS.length, maj = Math.max(p1, 1 - p1);
      // strength-only
      const mS = trainLogit(trS.map(r => ({ x: [r.strength], y: r.persist })), 1);
      let hS = 0; for (const r of teS) if ((mS([r.strength]) >= 0.5 ? 1 : 0) === r.persist) hS++;
      const accS = hS / teS.length;
      // full
      const D = FEATKEYS.length + 1, mk = r => ({ x: [...FEATKEYS.map(k => r.feat[k]), r.strength], y: r.persist });
      const mF = trainLogit(trS.map(mk), D);
      let hF = 0; for (const r of teS) if ((mF([...FEATKEYS.map(k => r.feat[k]), r.strength]) >= 0.5 ? 1 : 0) === r.persist) hF++;
      const accF = hF / teS.length;
      console.log("  " + s.padEnd(4) + " (test n=" + teS.length + ") 다수결 " + P(maj) +
        " | strength만 " + P(accS) + " (" + (accS - maj >= 0 ? "+" : "") + ((accS - maj) * 100).toFixed(1) + "%p)" +
        " | 전체특성 " + P(accF) + " (" + (accF - maj >= 0 ? "+" : "") + ((accF - maj) * 100).toFixed(1) + "%p)" +
        "  전체−strength " + (accF - accS >= 0 ? "+" : "") + ((accF - accS) * 100).toFixed(1) + "%p");
    }
  }
  console.log("→ '전체−strength'가 미미하면 전환예측은 엔진 기존 strength의 재포장(새 축 아님).\n");
}

// ===== (b) honest adaptive: select on TRAIN, evaluate on TEST once =====
function holding() {
  console.log("════════════ (b) 최적 보유기간 — 정직 교정(train선택→test평가) ════════════");
  const TR = [], TE = [];
  for (const sym in data.bySym) {
    const pts = data.bySym[sym], cut = Math.floor(pts.length * TRAIN_FRAC);
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (!p.opp) continue; (i < cut ? TR : TE).push({ sub: p.opp.sub, feat: p.feat, rets: p.rets }); }
  }
  const subs = { all: () => true, support: r => r.sub === "support", recovery: r => r.sub === "recovery" };
  const raOf = arr => { const rr = arr; const sd = std(rr); return sd ? mean(rr) / sd : 0; };
  const bestHTrain = arr => { let bh = HORIZONS[0], bv = -1e9; for (const h of HORIZONS) { const ra = raOf(arr.map(r => r.rets[h])); if (ra > bv) { bv = ra; bh = h; } } return bh; };
  for (const sname in subs) {
    const trS = TR.filter(subs[sname]), teS = TE.filter(subs[sname]);
    if (teS.length < 20) { console.log("\n[" + sname + "] 표본부족 test=" + teS.length); continue; }
    console.log("\n[" + sname + "] train " + trS.length + " · test " + teS.length);
    const teRA = {}, teMu = {}; for (const h of HORIZONS) { teRA[h] = raOf(teS.map(r => r.rets[h])); teMu[h] = mean(teS.map(r => r.rets[h])); }
    // 베이스라인들
    const bFixTrain = bestHTrain(trS);           // train 최적 고정H
    const bFixTest = HORIZONS.slice().sort((a, b) => teRA[b] - teRA[a])[0]; // test 실제 최적(사후·참고)
    console.log("  고정H test 위험조정: " + HORIZONS.map(h => h + "봉 " + teRA[h].toFixed(3)).join(" · "));
    console.log("  BL① 고정최적H(train=" + bFixTrain + "봉) → test " + teRA[bFixTrain].toFixed(3) + " · " + Pe(teMu[bFixTrain]));
    console.log("  BL② 기본홀드20 → test " + teRA[20].toFixed(3) + " · " + Pe(teMu[20]));
    console.log("  참고 test실제최적 고정H=" + bFixTest + "봉 " + teRA[bFixTest].toFixed(3) + " (사후 상한)");
    // 적응형: TRAIN에서 (분기특성) 선택 — 각 특성 median 이분 후 군별 train최적H로 train 위험조정 최대인 특성 채택. TEST 1회 평가.
    if (trS.length >= 60) {
      let pick = null;
      for (const fk of ["dd", "rsiSlope", "pctB", "vol20", "distMA200", "ret20", "ru", "slMA200"]) {
        const vals = trS.map(r => r.feat[fk]).slice().sort((a, b) => a - b), med = vals[Math.floor(vals.length / 2)];
        const lo = trS.filter(r => r.feat[fk] <= med), hi = trS.filter(r => r.feat[fk] > med);
        if (lo.length < 20 || hi.length < 20) continue;
        const hLo = bestHTrain(lo), hHi = bestHTrain(hi);
        const trainRA = raOf(trS.map(r => r.rets[r.feat[fk] <= med ? hLo : hHi]));   // TRAIN 성과로 선택
        if (!pick || trainRA > pick.trainRA) pick = { fk, med, hLo, hHi, trainRA };
      }
      if (pick) {
        const adaptR = teS.map(r => r.rets[r.feat[pick.fk] <= pick.med ? pick.hLo : pick.hHi]);
        const ra = raOf(adaptR), mu = mean(adaptR);
        const vsFix = ra - teRA[bFixTrain], vsBest = ra - teRA[bFixTest];
        console.log("  적응형(train선택: " + pick.fk + " ≤med→" + pick.hLo + "봉/초과→" + pick.hHi + "봉) → test " + ra.toFixed(3) + " · " + Pe(mu));
        console.log("    vs BL①고정최적 " + (vsFix >= 0 ? "+" : "") + vsFix.toFixed(3) + " | vs test실제최적고정 " + (vsBest >= 0 ? "+" : "") + vsBest.toFixed(3) +
          (vsBest >= 0.02 ? " ✅고정최선도 초과" : " 🔴고정최선 못넘음"));
      }
    }
  }
  console.log("\n→ 위험조정이 지평 따라 단조증가(dip 후 상방 드리프트)면 '최적보유=최장(60)'이 본질. 적응형이 test실제최적고정도 넘어야 '사전예측' 진짜.");
}

ablation();
holding();
