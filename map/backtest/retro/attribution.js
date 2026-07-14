// map/backtest/retro/attribution.js — train 레코드 → 진단(drop betray + add missing)(순수)
"use strict";
const { REGIMES } = require("./regime.js");
const { accBase, accMod, inRegime, indicatorIds, realDir } = require("./lib.js");

function attribute(train, opts = {}) {
  const { minN = 200, topPerRegime = 3, minGain = 0.005, hKey = "a20" } = opts;
  const baseAcc = accBase(train, hKey);
  const dropInds = indicatorIds(train, "ab");
  const addInds = indicatorIds(train, "addAb");
  const out = [];
  for (const g of REGIMES) {
    const gN = train.filter(r => realDir(r, hKey) !== 0 && inRegime(r, g)).length;
    if (gN < minN) continue;
    const scored = [];
    for (const z of dropInds) scored.push({ kind: "betray", key: z, gain: accMod(train, g, z, hKey, "ab") - baseAcc });
    for (const bt of addInds) scored.push({ kind: "missing", key: bt, gain: accMod(train, g, bt, hKey, "addAb") - baseAcc });
    scored.sort((a, b) => b.gain - a.gain);
    for (const c of scored.slice(0, topPerRegime)) {
      if (c.gain <= minGain) continue;
      out.push({ regime: g, indicator: c.key, kind: c.kind, stat: { trainGain: c.gain, n: gN } });
    }
  }
  return out;
}

module.exports = { attribute };
