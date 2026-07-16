// backtest/pead-feats.js — PEAD(실적후 드리프트) 피처 (순수·look-ahead: t>=eIdx+2에서만 reaction 참조)
"use strict";
function _clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
// closes/dates(오름차순)·earnings(날짜배열) → 각 캔들 인덱스별 [reaction, pos, reaction*decay, |reaction|] (창 밖 0)
function peadArray(closes, dates, earnings, opts) {
  const N = closes.length, WIN = (opts && opts.win) || 45;
  const out = Array.from({ length: N }, () => [0, 0, 0, 0]);
  if (!earnings) return out;
  for (const ed of earnings) {
    let lo = 0, hi = N - 1, eIdx = -1;   // dates[i] >= ed 최근(이진)
    while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] >= ed) { eIdx = m; hi = m - 1; } else lo = m + 1; }
    if (eIdx < 1 || eIdx >= N - 1) continue;
    const reaction = closes[eIdx + 1] / closes[eIdx - 1] - 1;
    if (!isFinite(reaction)) continue;
    const r = _clamp(reaction, -0.5, 0.5), mag = Math.min(Math.abs(reaction), 0.5);
    for (let t = eIdx + 2; t <= Math.min(N - 1, eIdx + WIN); t++) {
      const bars = t - eIdx, decay = 1 - bars / WIN;
      out[t] = [r, bars / WIN, _clamp(r * decay, -0.5, 0.5), mag];
    }
  }
  return out;
}
module.exports = { peadArray };
