// map/backtest/retro/regime.js — 국면 태깅(순수, 결정론)
"use strict";

function _sma(p, t, n) { let s = 0; for (let i = t - n + 1; i <= t; i++) s += p[i]; return s / n; }
function _rv(p, t, n) { let s = 0; for (let i = t - n + 1; i <= t; i++) { const r = Math.log(p[i] / p[i - 1]); s += r * r; } return Math.sqrt(s / n); }

// 시점 t의 국면 태그: 추세 1 + 변동성 1. t<200이면 warmup.
function regimeTags(price, t) {
  if (t < 200 || t >= price.length) return ["warmup"];
  const tags = [];
  const ma50 = _sma(price, t, 50), ma200 = _sma(price, t, 200), px = price[t];
  if (px > ma50 && ma50 > ma200) tags.push("trend-up");
  else if (px < ma50 && ma50 < ma200) tags.push("trend-down");
  else tags.push("trend-flat");
  const v20 = _rv(price, t, 20), v120 = _rv(price, t, 120);
  tags.push(v20 > v120 * 1.15 ? "vol-high" : v20 < v120 * 0.85 ? "vol-low" : "vol-mid");
  return tags;
}

const REGIMES = ["all", "trend-up", "trend-down", "trend-flat", "vol-high", "vol-mid", "vol-low"];

module.exports = { regimeTags, REGIMES };
