// backtest/metrics.js — 순수 채점 함수(네트워크·엔진 의존 없음)
"use strict";

// ── 앱(forge-app.js)에서 그대로 복제: 화면 상승확률과 캘리브레이션 일치 ──
function _normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
function _upProb(pred, hi, anchor) { if (!(pred > 0 && hi > 0 && anchor > 0)) return 50; const m = Math.log(pred / anchor), sd = Math.log(hi / pred); return Math.round(_normCdf(m / (sd || 1e-6)) * 100); }
function upProbFromPrediction(pred) {
  const path = pred && pred.path; if (!path || !path.length) return null;
  const anchor = (pred.anchor != null && isFinite(pred.anchor)) ? pred.anchor : path[0];
  let s = 0, w = 0;
  for (let k = 0; k < path.length; k++) { const h = k + 1, wt = 1 / Math.sqrt(h); s += _upProb(path[k], pred.hi && pred.hi[k], anchor) * wt; w += wt; }
  if (!w) return null;
  const raw = Math.round(s / w);
  try { const FC = require("../forge-core.js"); if (FC.calibrateUpProb) return FC.calibrateUpProb(raw); } catch (e) {}   // 캘리브레이션(v1.4) — 배포 엔진과 동일 맵
  return raw;
}

function directionHitRate(records) {
  let hit = 0, n = 0, bH = 0, bN = 0, eH = 0, eN = 0;
  for (const r of records) {
    if (!r.dir) continue;
    const real = Math.sign(r.actual - r.base);
    if (real === 0) continue;
    n++; const ok = (r.dir > 0 ? 1 : -1) === real; if (ok) hit++;
    if (r.dir > 0) { bN++; if (ok) bH++; } else { eN++; if (ok) eH++; }
  }
  return { rate: n ? hit / n : null, n, bullRate: bN ? bH / bN : null, bullN: bN, bearRate: eN ? eH / eN : null, bearN: eN };
}

function calibration(records, binW = 10) {
  const bins = {};
  for (const r of records) { if (r.up == null) continue; const k = Math.min(Math.floor(100 / binW) - 1, Math.floor(r.up / binW)); (bins[k] = bins[k] || []).push(r); }
  const tot = Object.values(bins).reduce((s, a) => s + a.length, 0);
  const curve = []; let ece = 0;
  Object.keys(bins).map(Number).sort((a, b) => a - b).forEach(k => {
    const rs = bins[k], n = rs.length;
    const pred = rs.reduce((s, r) => s + r.up, 0) / n / 100;
    const act = rs.filter(r => r.actual > r.base).length / n;
    curve.push({ binLo: k * binW, binHi: (k + 1) * binW, predicted: pred, actual: act, n });
    ece += (n / tot) * Math.abs(pred - act);
  });
  return { ece, curve };
}

function coneCoverage(records) {
  let cov = 0, n = 0;
  for (const r of records) { if (!isFinite(r.loH) || !isFinite(r.hiH)) continue; n++; if (r.actual >= r.loH && r.actual <= r.hiH) cov++; }
  return { coverage: n ? cov / n : null, n };
}

function priceMAE(records) {
  let s = 0, n = 0;
  for (const r of records) { if (!isFinite(r.tgt) || !(r.actual > 0)) continue; n++; s += Math.abs(r.tgt / r.actual - 1); }
  return { mae: n ? s / n : null, n };
}

// 비중첩 롱온리(기본): up>=threshold 롱 / up<=100-threshold 숏(ls모드만) / 그 외 플랫. t+H 전엔 신규진입 없음.
function simulatePnL(records, opts = {}) {
  const { threshold = 55, mode = "long", startEquity = 10000 } = opts;
  const sorted = records.slice().sort((a, b) => a.t - b.t);
  let eq = startEquity, peak = startEquity, mdd = 0, wins = 0, losses = 0, sumWin = 0, sumLoss = 0, trades = 0, nextFree = -Infinity;
  for (const r of sorted) {
    if (r.t < nextFree) continue;
    let pos = 0;
    if (r.up >= threshold) pos = 1; else if (r.up <= 100 - threshold) pos = (mode === "ls" ? -1 : 0);
    if (!pos) continue;
    const ret = pos * (r.actual / r.base - 1);
    eq *= (1 + ret); trades++; nextFree = r.t + r.H;
    if (ret > 0) { wins++; sumWin += ret; } else { losses++; sumLoss += ret; }
    if (eq > peak) peak = eq; const dd = eq / peak - 1; if (dd < mdd) mdd = dd;
  }
  return { startEquity, finalEquity: eq, totalReturn: eq / startEquity - 1, winRate: trades ? wins / trades : null, avgWin: wins ? sumWin / wins : null, avgLoss: losses ? sumLoss / losses : null, maxDrawdown: mdd, trades, wins, losses, sumWin, sumLoss };
}

// 등가중 포트폴리오 집계(종목별 P&L을 정직하게 합산 — 계좌 순차복리 금지)
function aggregatePnL(perFixture) {
  const rows = perFixture.filter(f => f.pnl && f.pnl.trades > 0);
  if (!rows.length) return null;
  const rets = rows.map(f => f.pnl.totalReturn).sort((a, b) => a - b);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const median = a => a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
  const bh = rows.map(f => f.buyHoldReturn).filter(x => x != null);
  const wins = rows.reduce((s, f) => s + f.pnl.wins, 0), losses = rows.reduce((s, f) => s + f.pnl.losses, 0);
  const sumWin = rows.reduce((s, f) => s + f.pnl.sumWin, 0), sumLoss = rows.reduce((s, f) => s + f.pnl.sumLoss, 0);
  const trades = wins + losses;
  return {
    startEquity: 10000, nFixtures: rows.length,
    avgReturn: mean(rets), medianReturn: median(rets),
    avgFinalEquity: 10000 * (1 + mean(rets)),
    avgBuyHold: bh.length ? mean(bh) : null,
    beatBuyHold: rows.filter(f => f.buyHoldReturn != null && f.pnl.totalReturn > f.buyHoldReturn).length,
    winRate: trades ? wins / trades : null, avgWin: wins ? sumWin / wins : null, avgLoss: losses ? sumLoss / losses : null,
    trades, avgMDD: mean(rows.map(f => f.pnl.maxDrawdown)), worstMDD: Math.min(...rows.map(f => f.pnl.maxDrawdown)),
  };
}

function baselines(records, firstPrice, lastPrice) {
  let up = 0, n = 0;
  for (const r of records) { const real = Math.sign(r.actual - r.base); if (real === 0) continue; n++; if (real > 0) up++; }
  return { alwaysUpHitRate: n ? up / n : null, coinFlip: 0.5, buyHoldReturn: (firstPrice > 0 && lastPrice > 0) ? lastPrice / firstPrice - 1 : null };
}

// Brier score + Murphy 분해(uncertainty/reliability/resolution) + BSS(베이스레이트 대비 스킬).
// resolution↑ = 확률이 상황을 실제로 구별(정보성). BSS 0 = 베이스레이트 상수 예측과 동급.
function brierDecomp(pairs, binW = 0.1) {
  const N = pairs.length; if (!N) return null;
  let bs = 0, ybar = 0;
  for (const { p, y } of pairs) { bs += (p - y) ** 2; ybar += y; }
  bs /= N; ybar /= N;
  const bins = new Map();
  for (const pr of pairs) { const k = Math.min(Math.ceil(1 / binW) - 1, Math.floor(pr.p / binW)); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(pr); }
  let rel = 0, res = 0;
  for (const arr of bins.values()) {
    const n = arr.length;
    const pb = arr.reduce((s, r) => s + r.p, 0) / n, yb = arr.reduce((s, r) => s + r.y, 0) / n;
    rel += n / N * (pb - yb) ** 2; res += n / N * (yb - ybar) ** 2;
  }
  const unc = ybar * (1 - ybar);
  return { brier: bs, reliability: rel, resolution: res, uncertainty: unc, bss: unc ? 1 - bs / unc : null, n: N, baseRate: ybar };
}
function brier(records) {
  const pairs = [];
  for (const r of records) {
    if (r.up == null || !(r.actual > 0) || !(r.base > 0) || r.actual === r.base) continue;
    pairs.push({ p: r.up / 100, y: r.actual > r.base ? 1 : 0 });
  }
  return brierDecomp(pairs);
}

module.exports = { upProbFromPrediction, directionHitRate, calibration, coneCoverage, priceMAE, simulatePnL, aggregatePnL, baselines, brierDecomp, brier };
