// backtest/shortint-feats.js — 공매도잔고 신호 피처 (순수·look-ahead: pub<=cutoff만)
// events: [{settle, pub:"YYYY-MM-DD", cur, prev, dtc, chg, adv}] (pub 오름차순)
"use strict";
const NF = 4;
function _clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
// cutoff(캔들 날짜)까지 공시된(pub<=cutoff) 최근 잔고 + 자기이력 백분위
function shortIntFeats(events, cutoff) {
  if (!events || !events.length) return new Array(NF).fill(0);
  let last = -1;
  for (let i = 0; i < events.length; i++) { if (events[i].pub <= cutoff) last = i; else break; }
  if (last < 0) return new Array(NF).fill(0);
  const e = events[last];
  const dtcLevel = _clamp((e.dtc || 0) / 20, 0, 2);                 // 공매도잔고/일평균거래량(일수)·정규화
  const chgPct = _clamp((e.chg || 0) / 100, -1.5, 1.5);            // 직전 대비 SI 변화율
  const siGrowth = (e.prev > 0) ? _clamp(e.cur / e.prev - 1, -1, 1) : 0;  // 잔고 증감
  // 자기이력 dtc 백분위(가용분만·pub<=cutoff)
  let c = 0, n = 0; for (let i = 0; i <= last; i++) { if (isFinite(events[i].dtc)) { n++; if (events[i].dtc <= e.dtc) c++; } }
  const pctile = n ? c / n - 0.5 : 0;
  return [dtcLevel, chgPct, siGrowth, pctile];
}
module.exports = { shortIntFeats, NF };
