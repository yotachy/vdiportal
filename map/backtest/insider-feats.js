// backtest/insider-feats.js — 내부자(Form 4) 신호 피처 (순수, look-ahead 안전: filed<=cutoff만)
// events: [{filed:"YYYY-MM-DD", code:"P"|"S", shares, value, roleRank, ownerCik}] (한 종목·filed 오름차순)
"use strict";
const WIN_DAYS = 130;   // 트레일링 창(≈90 거래일)
const NF = 6;

function _d(s) { return Date.parse(s + "T00:00:00Z"); }   // ms
function _days(a, b) { return (a - b) / 86400000; }

// 내부자 규칙성(Cohen-Malloy 근사): 소유자별 거래 간격 변동계수 낮으면 routine(예측가능·저신호)
function _oppWeights(events) {
  const byOwner = {};
  for (const e of events) { (byOwner[e.ownerCik || "?"] = byOwner[e.ownerCik || "?"] || []).push(_d(e.filed)); }
  const w = {};
  for (const k in byOwner) {
    const ts = byOwner[k].sort((a, b) => a - b);
    if (ts.length < 3) { w[k] = 1; continue; }   // 드물게 거래 = opportunistic로 간주
    const gaps = []; for (let i = 1; i < ts.length; i++) gaps.push(_days(ts[i], ts[i - 1]));
    const m = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - m) ** 2, 0) / gaps.length);
    const cv = m ? sd / m : 1;
    w[k] = cv >= 0.6 ? 1 : 0.3;   // 불규칙(cv큼)=opportunistic 1 · 규칙적=routine 0.3
  }
  return w;
}

// cutoff(날짜문자열)까지 가용한 이벤트로 피처 벡터(길이 NF). 이벤트 없으면 0벡터.
function insiderFeats(events, cutoff) {
  if (!events || !events.length) return new Array(NF).fill(0);
  const cd = _d(cutoff), avail = [];
  for (const e of events) { const f = _d(e.filed); if (f <= cd) avail.push(e); else break; }   // filed 오름차순
  if (!avail.length) return new Array(NF).fill(0);
  const oppW = _oppWeights(avail);
  const winLo = cd - WIN_DAYS * 86400000;
  let buyVal = 0, sellVal = 0, buyN = 0, sellN = 0, roleNet = 0, oppNet = 0;
  const buyers = new Set(); let lastBuy = null;
  for (const e of avail) {
    const f = _d(e.filed); if (f < winLo) continue;
    const v = e.value || 0, sgn = e.code === "P" ? 1 : -1;
    if (e.code === "P") { buyVal += v; buyN++; buyers.add(e.ownerCik); if (lastBuy == null || f > lastBuy) lastBuy = f; }
    else { sellVal += v; sellN++; }
    roleNet += sgn * v * (e.roleRank || 1);
    oppNet += sgn * v * (oppW[e.ownerCik || "?"] || 1);
  }
  const tot = buyVal + sellVal + 1, totN = buyN + sellN + 1;
  const netBuyFrac = (buyVal - sellVal) / tot;
  const buyCountRatio = buyN / totN;
  const numBuyers = Math.log(1 + buyers.size);
  const sinceLastBuyDecay = lastBuy == null ? 0 : Math.exp(-_days(cd, lastBuy) / 60);
  const roleNetFrac = roleNet / (Math.abs(roleNet) + tot);
  const oppNetFrac = oppNet / (Math.abs(oppNet) + tot);
  return [netBuyFrac, buyCountRatio, numBuyers, sinceLastBuyDecay, roleNetFrac, oppNetFrac];
}

module.exports = { insiderFeats, NF, WIN_DAYS };
