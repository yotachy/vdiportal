// backtest/feat-lib.js — 랩 공유: 구조 피처 + 결정론 로지스틱(엔진·네트워크 의존 없음)
"use strict";

function sma(p, t, n) { let s = 0; for (let i = t - n + 1; i <= t; i++) s += p[i]; return s / n; }
function vol(p, t, n) { let s = 0; for (let i = t - n + 1; i <= t; i++) { const r = Math.log(p[i] / p[i - 1]); s += r * r; } return Math.sqrt(s / n); }
function rsi(p, t, n = 14) { let g = 0, l = 0; for (let i = t - n + 1; i <= t; i++) { const d = p[i] - p[i - 1]; if (d > 0) g += d; else l -= d; } return (g + l) ? 100 * g / (g + l) : 50; }

const FEAT_NAMES = ["mom20", "mom60", "mom120", "mom250", "distMA200", "slopeMA200", "pctB20", "rsiC", "rsiSlope", "ddHi60", "volRatio", "volPct"];

// 시점 t의 가격 구조 12피처. t<280(mom250+RSI슬랙) 또는 비유한 시 null.
function structFeats(p, t) {
  if (t < 280 || t >= p.length) return null;
  const mom = n => p[t] / p[t - n] - 1;
  const ma200 = sma(p, t, 200), ma200p = sma(p, t - 20, 200), m20 = sma(p, t, 20);
  let sd = 0; for (let i = t - 19; i <= t; i++) sd += (p[i] - m20) ** 2; sd = Math.sqrt(sd / 20);
  const pctB = sd ? (p[t] - (m20 - 2 * sd)) / (4 * sd) : 0.5;
  let hi60 = -Infinity; for (let i = t - 59; i <= t; i++) if (p[i] > hi60) hi60 = p[i];
  const v20 = vol(p, t, 20), v120 = vol(p, t, 120);
  let below = 0; const back = Math.min(252, t - 21);
  for (let i = t - back; i <= t; i += 4) if (vol(p, i, 20) <= v20) below++;   // 4봉 서브샘플(속도) — 백분위 근사
  const x = [mom(20), mom(60), mom(120), mom(250), p[t] / ma200 - 1, ma200 / ma200p - 1,
    pctB, rsi(p, t) / 100 - 0.5, (rsi(p, t) - rsi(p, t - 5)) / 100, p[t] / hi60 - 1,
    v120 ? v20 / v120 - 1 : 0, below / (Math.floor(back / 4) + 1) - 0.5];
  return x.every(isFinite) ? x : null;
}

// 결정론 로지스틱(zero-init 배치 GD + L2). 표준화 내장, predict는 원 스케일 입력.
function logitFit(X, y, opts = {}) {
  const { iters = 400, lr = 0.3, l2 = 1e-3 } = opts;
  const n = X.length, d = X[0].length;
  const MEAN = new Array(d).fill(0), STD = new Array(d).fill(0);
  for (let j = 0; j < d; j++) {
    let s = 0; for (const x of X) s += x[j]; MEAN[j] = s / n;
    let v = 0; for (const x of X) v += (x[j] - MEAN[j]) ** 2; STD[j] = Math.sqrt(v / n) || 1;
  }
  const Z = X.map(x => x.map((v, j) => (v - MEAN[j]) / STD[j]));
  const W = new Array(d).fill(0); let B = 0;
  for (let it = 0; it < iters; it++) {
    const gW = new Array(d).fill(0); let gB = 0;
    for (let i = 0; i < n; i++) {
      let s = B; for (let j = 0; j < d; j++) s += W[j] * Z[i][j];
      const e = 1 / (1 + Math.exp(-s)) - y[i];
      for (let j = 0; j < d; j++) gW[j] += e * Z[i][j];
      gB += e;
    }
    for (let j = 0; j < d; j++) W[j] -= lr * (gW[j] / n + l2 * W[j]);
    B -= lr * gB / n;
  }
  const predict = x => { let s = B; for (let j = 0; j < d; j++) s += W[j] * ((x[j] - MEAN[j]) / STD[j]); return 1 / (1 + Math.exp(-s)); };
  return { W, B, MEAN, STD, predict };
}

function acc(probs, ys, thr = 0.5) { let h = 0; for (let i = 0; i < probs.length; i++) if ((probs[i] >= thr ? 1 : 0) === ys[i]) h++; return probs.length ? h / probs.length : null; }
function splitIdx(n, frac = 0.6) { return Math.floor(n * frac); }

module.exports = { sma, vol, rsi, structFeats, FEAT_NAMES, logitFit, acc, splitIdx };
