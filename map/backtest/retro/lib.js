// map/backtest/retro/lib.js — 방향(up 기반)·정확도·국면필터 공유 헬퍼(순수)
"use strict";

function realDir(rec, hKey = "a20") { return Math.sign(rec[hKey] - rec.base); }
function predDir(up) { return (up == null ? 50 : up) >= 50 ? 1 : -1; }
function inRegime(rec, g) { return g === "all" || (rec.regime && rec.regime.includes(g)); }

function accBase(recs, hKey = "a20") {
  let hit = 0, n = 0;
  for (const r of recs) { const rd = realDir(r, hKey); if (rd === 0) continue; n++; if (predDir(r.up) === rd) hit++; }
  return n ? hit / n : null;
}

// 국면 g 안에서 key 지표를 map(ab=drop / addAb=add)으로 치환한 수정 전략의 정확도.
// g 밖 또는 해당 항목 부재 시 base up.
function accMod(recs, g, key, hKey = "a20", map = "ab") {
  let hit = 0, n = 0;
  for (const r of recs) {
    const rd = realDir(r, hKey); if (rd === 0) continue; n++;
    const alt = inRegime(r, g) && r[map] && r[map][key];
    const up = alt ? r[map][key].up : r.up;
    if (predDir(up) === rd) hit++;
  }
  return n ? hit / n : null;
}

function indicatorIds(recs, map = "ab") {
  const s = new Set();
  for (const r of recs) if (r[map]) for (const k of Object.keys(r[map])) s.add(k);
  return [...s];
}

module.exports = { realDir, predDir, inRegime, accBase, accMod, indicatorIds };
