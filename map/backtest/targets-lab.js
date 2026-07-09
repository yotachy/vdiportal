// backtest/targets-lab.js — 타깃 다양화: 방향(불가) 대신 '예측 가능한 타깃'들의 정확도 측정.
// 사용자에게 보여줄 정직·높은 예측률 발굴. 엔진불필요·로지스틱·시간분할(OOS)·베이스라인 대조.
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, STRIDE = 2, WARM = 220, TRAIN_FRAC = 0.6;
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }

function feats(price, hi, lo, t) {
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const atr = atrp(hi, lo, price, t, 14);
  // vol-of-vol: 최근 vol들의 변동
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;   // 최근 봉 range
  return [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60)];
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
function evalTarget(name, rows, key, baseFn) {
  const TR = rows.filter(r => r._tr).map(r => ({ x: r.x, y: r[key] })), TE = rows.filter(r => !r._tr);
  if (TR.length < 100 || TE.length < 50) return;
  const D = TR[0].x.length, pred = train(TR, D);
  let hit = 0, bhit = 0, pos = 0; for (const r of TE) { const p = pred(r.x); const call = p >= 0.5 ? 1 : 0; if (call === r[key]) hit++; if (baseFn(r) === r[key]) bhit++; if (r[key] === 1) pos++; }
  const P = x => (x * 100).toFixed(1) + "%";
  const acc = hit / TE.length, bacc = bhit / TE.length, base = Math.max(pos / TE.length, 1 - pos / TE.length);
  const mk = acc >= 0.65 && acc > bacc + 0.01 ? "  ★높음&초과" : acc > bacc + 0.01 ? "  +초과" : "";
  console.log("  " + name.padEnd(26) + " 정확도 " + P(acc) + " · 다수결기준 " + P(base) + " · 지속성기준 " + P(bacc) + mk);
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
      const curVol = rvol(price, t, H), fwdVol = rvol(price, t + H, H);
      // 롱런 중앙값 대용: 최근 250봉 vol 평균
      let lrv = 0, cnt = 0; for (let k = t - 240; k <= t; k += 20) { const vv = rvol(price, k, 20); if (vv) { lrv += vv; cnt++; } } lrv /= cnt;
      const move = Math.abs(price[t + H] / price[t] - 1), expMove = curVol * Math.sqrt(H);
      local.push({ x,
        volExpand: fwdVol > curVol ? 1 : 0,            // 변동성 확대
        volHi: fwdVol > lrv ? 1 : 0,                    // 고변동 국면
        bigMove: move > 1.3 * expMove ? 1 : 0,          // 큰 움직임(예상초과)
        calm: move < 0.7 * expMove ? 1 : 0,             // 잔잔(예상미만)
        _curHi: curVol > lrv ? 1 : 0,
      });
    }
    const cut = Math.floor(local.length * TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; rows.push(r); });
  }
  console.log("=== 타깃 다양화: 예측 가능한 타깃들의 정확도 (일봉 " + files.length + "종 · 지평 " + H + " · OOS) ===");
  console.log("총 " + rows.length + "시점 · 다수결기준=항상다수클래스 · 지속성기준=현상태유지\n");
  evalTarget("변동성 확대/축소", rows, "volExpand", r => r.x[0] > 0 ? 1 : 0);
  evalTarget("고변동/저변동 국면", rows, "volHi", r => r._curHi);
  evalTarget("큰 움직임 임박", rows, "bigMove", () => 0);
  evalTarget("잔잔한 구간", rows, "calm", () => 0);
  console.log("\n→ ★(정확도 65%+ & 기준 초과)면 사용자에게 보여줄 '뛰어난 예측률' 후보.");
}
main();
