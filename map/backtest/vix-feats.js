// backtest/vix-feats.js — VIX 기간구조 시장 vol 레짐 피처 (순수·look-ahead 안전: 같은 날짜 VIX)
"use strict";
const NF = 4;
function buildVixArrays(series) {
  const dates = Object.keys(series).sort();
  return { dates, vix: dates.map(d => series[d].vix), vix3m: dates.map(d => series[d].vix3m) };
}
// dates(오름차순)에서 d 이하 최근 인덱스(이진탐색) | -1
function vixIndexForDate(dates, d) {
  let lo = 0, hi = dates.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function vixFeats(dates, vix, vix3m, i) {
  if (i == null || i < 0 || !isFinite(vix[i])) return new Array(NF).fill(0);
  const v = vix[i], v3 = vix3m[i];
  const lvl = v / 20 - 1;
  const term = (v3 != null && v3 > 0) ? v / v3 - 1 : 0;   // 백워데이션(스트레스)>0 · 콘탱고<0
  const chg5 = (i >= 5 && isFinite(vix[i - 5]) && vix[i - 5] > 0) ? (v - vix[i - 5]) / vix[i - 5] : 0;
  let pct = 0.5;
  const lo = Math.max(0, i - 252); let c = 0, n = 0;
  for (let k = lo; k <= i; k++) { if (isFinite(vix[k])) { n++; if (vix[k] <= v) c++; } }
  if (n) pct = c / n;
  return [lvl, term, chg5, pct - 0.5];
}
module.exports = { buildVixArrays, vixIndexForDate, vixFeats, NF };
