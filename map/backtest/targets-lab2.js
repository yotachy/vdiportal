// backtest/targets-lab2.js — 타깃 다양화 2차: 리스크 지향 타깃 발굴.
// volForecast(변동성 예측가능)를 넘어 실제 리스크도구로 쓸 타깃을 발굴: 낙폭리스크·이익목표도달·돌파 등.
// 규율: 반드시 다수결(majority) + 지속성(persistence) 이중 베이스라인 초과해야 진짜(신기루 차단).
// 피처: 검증된 10피처(9 + vol-regime 백분위 pct).
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6;
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function feats(price, hi, lo, t) {
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const atr = atrp(hi, lo, price, t, 14);
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  const hist = []; for (let k = t - 252; k <= t; k += 3) { if (k - 20 >= 0) { const vv = rvol(price, k, 20); if (vv) hist.push(vv); } }
  let pct = 0.5; if (hist.length > 5) { let c = 0; for (const v of hist) if (v <= v20) c++; pct = c / hist.length; }
  return [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60), pct];
}
function train(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 2e-3, EP = 300;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return x => { const zx = z(x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; return 1 / (1 + Math.exp(-s)); };
}
// key=타깃, baseFn=지속성(현상태유지) 예측. 다수결기준은 자동.
function evalTarget(name, rows, key, baseFn) {
  const TR = rows.filter(r => r._tr).map(r => ({ x: r.x, y: r[key] })), TE = rows.filter(r => !r._tr);
  if (TR.length < 100 || TE.length < 50) return;
  const D = TR[0].x.length, pred = train(TR, D);
  let hit = 0, bhit = 0, pos = 0; for (const r of TE) { const p = pred(r.x); const call = p >= 0.5 ? 1 : 0; if (call === r[key]) hit++; if (baseFn(r) === r[key]) bhit++; if (r[key] === 1) pos++; }
  const P = x => (x * 100).toFixed(1) + "%";
  const acc = hit / TE.length, bacc = bhit / TE.length, base = Math.max(pos / TE.length, 1 - pos / TE.length);
  const beat = acc > base + 0.01 && acc > bacc + 0.01;   // 둘 다 초과해야 진짜
  const mk = beat ? (acc >= 0.65 ? "  ★진짜&높음" : "  ✓진짜(두기준초과)") : "  (신기루—기준미달)";
  console.log("  " + name.padEnd(26) + " 정확도 " + P(acc) + " · 다수결 " + P(base) + " · 지속성 " + P(bacc) + " · 양성률 " + P(pos / TE.length) + mk);
}
function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const rows = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
    if (N < WARM + H + 40) continue;
    const local = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) {
      const x = feats(price, hi, lo, t); if (!x || x.some(v => !isFinite(v))) continue;
      const curVol = rvol(price, t, H), expMove = curVol * Math.sqrt(H);
      // 미래 H봉 경로: 최저/최고(종가 기준) → 낙폭·상승도달·최대이탈
      let lo1 = Infinity, hi1 = -Infinity;
      for (let i = t + 1; i <= t + H; i++) { const rr = price[i] / price[t] - 1; if (rr < lo1) lo1 = rr; if (rr > hi1) hi1 = rr; }
      const maxDD = lo1, maxUp = hi1, maxExc = Math.max(Math.abs(lo1), Math.abs(hi1));
      // 현재 상태(지속성 베이스라인용): 최근 H봉 낙폭·상승
      let ploLo = Infinity, phiHi = -Infinity;
      for (let i = t - H + 1; i <= t; i++) { const rr = price[i] / price[t - H] - 1; if (rr < ploLo) ploLo = rr; if (rr > phiHi) phiHi = rr; }
      local.push({ x,
        dd5:  maxDD <= -0.05 ? 1 : 0,                 // 향후 5%↑ 낙폭(고점 아닌 현재가 대비)
        dd10: maxDD <= -0.10 ? 1 : 0,                 // 향후 10%↑ 낙폭
        up5:  maxUp >= 0.05 ? 1 : 0,                  // 향후 +5% 이익목표 도달
        breakout: maxExc > 1.5 * expMove ? 1 : 0,     // 예상 초과 이탈(돌파)
        contained: maxExc < 1.0 * expMove ? 1 : 0,    // 예상 이내(잔잔·박스권 유지)
        _pDD5: ploLo <= -0.05 ? 1 : 0,                // 지속성: 최근 5%↑ 낙폭 있었나
        _pDD10: ploLo <= -0.10 ? 1 : 0,
        _pUp5: phiHi >= 0.05 ? 1 : 0,
      });
    }
    const cut = Math.floor(local.length * TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; rows.push(r); });
  }
  console.log("=== 타깃 다양화 2차: 리스크 타깃 (일봉 " + files.length + "종 · 지평 " + H + " · OOS · 10피처) ===");
  console.log("총 " + rows.length + "시점 · 진짜=다수결&지속성 둘 다 초과\n");
  evalTarget("낙폭리스크 ≥5%", rows, "dd5", r => r._pDD5);
  evalTarget("낙폭리스크 ≥10%", rows, "dd10", r => r._pDD10);
  evalTarget("이익목표 +5% 도달", rows, "up5", r => r._pUp5);
  evalTarget("돌파(예상초과 이탈)", rows, "breakout", () => 0);
  evalTarget("박스권 유지(예상이내)", rows, "contained", () => 0);
  console.log("\n→ ✓/★면 실제 리스크도구 후보(손절폭·포지션사이징·목표도달확률). (신기루)면 기각.");
}
main();
