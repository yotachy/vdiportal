// backtest/cone-cal2.js — 콘(예측 밴드) 캘리브레이션: 폭 축소 배율 sweep.
// scale=1로 한 번만 walk-forward하며 콘(path/hi) 캡처 → 여러 축소배율을 해석적으로 계산
// (sd 선형: hi_s=path·exp(s·sd0)). 각 배율의 커버리지 + raw 상승확률 ECE 산출.
// 목표: 커버리지 86%→~68%(1σ)로 좁히되, 재적합 후 ECE가 나빠지지 않을 배율 탐색.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");
const WARMUP = 200, LOOKBACK = 600, H = 60, STRIDE = 10;

function ncdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
// 예측 상승확률(scale s) — 앱 aggUpProb 복제: 각 지평 normCdf(log(path/a)/(s·sd0[k])), 1/√(k+1) 가중
function upProbAt(rec, s) {
  const { pathK, sdK, a } = rec; let sum = 0, w = 0;
  for (let k = 0; k < pathK.length; k++) {
    const sd = s * sdK[k]; if (!(sd > 0) || !(pathK[k] > 0) || !(a > 0)) continue;
    const wt = 1 / Math.sqrt(k + 1); sum += Math.round(ncdf(Math.log(pathK[k] / a) / sd) * 100) * wt; w += wt;
  }
  return w ? sum / w : 50;
}
function coverageAt(recs, s) { let n = 0, c = 0; for (const r of recs) { if (!(r.pH > 0) || !(r.sH > 0) || !(r.act > 0)) continue; n++; if (Math.abs(Math.log(r.act / r.pH)) <= s * r.sH) c++; } return n ? c / n : null; }
// raw ECE(캘리브레이션 전) — 10% 빈, 예측 상승확률 vs 실제 상승(act>a)
function eceAt(recs, s) {
  const bins = {};
  for (const r of recs) { const up = Math.round(upProbAt(r, s)); const k = Math.min(9, Math.floor(up / 10)); (bins[k] = bins[k] || []).push(r.act > r.a ? 1 : 0); }
  let tot = 0; for (const k in bins) tot += bins[k].length; let ece = 0;
  for (const k in bins) { const arr = bins[k], n = arr.length; const pred = (+k * 10 + 5) / 100; const act = arr.reduce((x, y) => x + y, 0) / n; ece += (n / tot) * Math.abs(pred - act); }
  return ece;
}

// Platt(logit 로지스틱) 재적합 — raw 상승확률(scale s) → 캘리브. train에서 A,B 학습.
function fitPlatt(recs, s) {
  let A = 0.5, B = 0; const LR = 0.3, EP = 500;
  const X = recs.map(r => { const q = Math.min(0.999, Math.max(0.001, upProbAt(r, s) / 100)); return { l: Math.log(q / (1 - q)), y: r.act > r.a ? 1 : 0 }; });
  for (let ep = 0; ep < EP; ep++) { let gA = 0, gB = 0; for (const d of X) { const p = 1 / (1 + Math.exp(-(A * d.l + B))); const e = p - d.y; gA += e * d.l; gB += e; } A -= LR * gA / X.length; B -= LR * gB / X.length; }
  return { A, B };
}
function eceCal(recs, s, A, B) {
  const bins = {};
  for (const r of recs) { const q = Math.min(0.999, Math.max(0.001, upProbAt(r, s) / 100)); const cal = 1 / (1 + Math.exp(-(A * Math.log(q / (1 - q)) + B))); const k = Math.min(9, Math.floor(cal * 10)); (bins[k] = bins[k] || []).push(r.act > r.a ? 1 : 0); }
  let tot = 0; for (const k in bins) tot += bins[k].length; let ece = 0;
  for (const k in bins) { const arr = bins[k], n = arr.length; const pred = (+k * 10 + 5) / 100; const act = arr.reduce((x, y) => x + y, 0) / n; ece += (n / tot) * Math.abs(pred - act); }
  return ece;
}

function capture() {
  const cacheF = path.join(__dirname, "cone-cal-recs.json");
  if (process.env.CONE_CACHE && fs.existsSync(cacheF)) { const r = JSON.parse(fs.readFileSync(cacheF, "utf8")); console.error("캐시 로드: " + r.length); return r; }
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const recs = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), N = price.length;
    const g = B.standardGraph();
    for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
      const pr = r.prediction; if (!pr || !pr.path || !pr.hi || pr.path.length < H) continue;
      const a = (pr.anchor != null && isFinite(pr.anchor)) ? pr.anchor : pr.path[0];
      const pathK = pr.path.slice(0, H), sdK = [];
      for (let k = 0; k < H; k++) { const p0 = pathK[k], hk = pr.hi[k]; sdK.push((p0 > 0 && hk > 0) ? Math.log(hk / p0) : 0); }
      recs.push({ a, pH: pathK[H - 1], sH: sdK[H - 1], act: price[t + H], pathK, sdK });
    }
    console.error("  " + fx.symbol + " → 누적 " + recs.length);
  }
  try { fs.writeFileSync(path.join(__dirname, "cone-cal-recs.json"), JSON.stringify(recs)); console.error("캐시 저장"); } catch (e) {}
  return recs;
}

function main() {
  console.error("캡처 중(scale=1 walk-forward)…");
  const recs = capture();
  const tr = recs.filter((_, i) => i % 2 === 0), te = recs.filter((_, i) => i % 2 === 1);   // 짝=train, 홀=test(OOS 근사)
  console.log("\n=== 콘 축소배율 sweep — 총 " + recs.length + " 시점 (지평 " + H + ") ===");
  console.log("배율   커버리지   raw ECE   재적합후 OOS ECE   (A,B)");
  for (const s of [1.0, 0.9, 0.82, 0.75, 0.68, 0.62, 0.55, 0.5]) {
    const cov = coverageAt(recs, s), rece = eceAt(recs, s);
    const { A, B } = fitPlatt(tr, s), oece = eceCal(te, s, A, B);
    console.log(s.toFixed(2) + "   " + (cov * 100).toFixed(1) + "%   " + (rece * 100).toFixed(2) + "%p   " + (oece * 100).toFixed(2) + "%p" + "   (" + A.toFixed(4) + "," + B.toFixed(4) + ")" + (Math.abs(cov - 0.68) < 0.03 ? "  ← ~68%" : ""));
  }
  // 전체데이터 재적합 계수(배포용, calib-oos WLS 방식) — 채택 배율에서
  const logit = p => Math.log(Math.min(0.999, Math.max(0.001, p)) / (1 - Math.min(0.999, Math.max(0.001, p))));
  function wlsPlatt(rs, s) {
    const bins = {}; for (const r of rs) { const p = upProbAt(r, s) / 100; const b = Math.min(9, Math.floor(p * 10)); (bins[b] = bins[b] || []).push({ p, y: r.act > r.a ? 1 : 0 }); }
    let sx = 0, sy = 0, sxx = 0, sxy = 0, sw = 0;
    for (const k in bins) { const gg = bins[k]; const mp = gg.reduce((a, r) => a + r.p, 0) / gg.length, ma = gg.reduce((a, r) => a + r.y, 0) / gg.length; const x = logit(mp), y = logit(ma), w = gg.length; sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y; }
    const A = (sw * sxy - sx * sy) / (sw * sxx - sx * sx), Bc = (sy - A * sx) / sw; return { A, Bc };
  }
  function eceWLS(rs, s, A, Bc) { const sig = x => 1 / (1 + Math.exp(-x)); const bins = {}; for (const r of rs) { const cal = sig(A * logit(upProbAt(r, s) / 100) + Bc); const b = Math.min(9, Math.floor(cal * 10)); (bins[b] = bins[b] || []).push({ p: cal, y: r.act > r.a ? 1 : 0 }); } let e = 0, n = 0; for (const k in bins) { const g = bins[k]; const mp = g.reduce((a, r) => a + r.p, 0) / g.length, ma = g.reduce((a, r) => a + r.y, 0) / g.length; e += g.length * Math.abs(mp - ma); n += g.length; } return n ? e / n : 0; }
  console.log("\n=== 배포용 WLS Platt 재적합(calib-oos 방식) ===");
  for (const s of [0.82, 0.75]) {
    const full = wlsPlatt(recs, s);
    const trw = wlsPlatt(tr, s), teEce = eceWLS(te, s, trw.A, trw.Bc), trBaseEce = eceAt(te, s);
    console.log(`배율 ${s}: 전체적합 A=${full.A.toFixed(4)} B=${full.Bc.toFixed(4)} | OOS(WLS) ECE ${(trBaseEce*100).toFixed(2)}→${(teEce*100).toFixed(2)}%p | 커버리지 ${(coverageAt(recs,s)*100).toFixed(1)}%`);
  }
}
main();
