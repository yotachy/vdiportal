// map/backtest/retro/lib.js — 방향·정확도·국면필터 공유 헬퍼(순수)
"use strict";

function realDir(rec, hKey = "a20") { return Math.sign(rec[hKey] - rec.base); }
function predDir(score) { return score >= 0 ? 1 : -1; }
function inRegime(rec, g) { return g === "all" || (rec.regime && rec.regime.includes(g)); }

function accBase(recs, hKey = "a20") {
  let hit = 0, n = 0;
  for (const r of recs) { const rd = realDir(r, hKey); if (rd === 0) continue; n++; if (predDir(r.score) === rd) hit++; }
  return n ? hit / n : null;
}

// 국면 g 안에서 indId를 drop한 수정 전략의 정확도. g 밖 또는 ab 없으면 base score 사용.
function accMod(recs, g, indId, hKey = "a20") {
  let hit = 0, n = 0;
  for (const r of recs) {
    const rd = realDir(r, hKey); if (rd === 0) continue; n++;
    const useAb = inRegime(r, g) && r.ab && r.ab[indId];
    const sc = useAb ? r.ab[indId].score : r.score;
    if (predDir(sc) === rd) hit++;
  }
  return n ? hit / n : null;
}

function indicatorIds(recs) {
  const s = new Set();
  for (const r of recs) if (r.ab) for (const k of Object.keys(r.ab)) s.add(k);
  return [...s];
}

module.exports = { realDir, predDir, inRegime, accBase, accMod, indicatorIds };
