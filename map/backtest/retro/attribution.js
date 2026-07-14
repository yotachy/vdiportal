// map/backtest/retro/attribution.js — train 레코드 → 진단 카드(순수)
"use strict";
const { REGIMES } = require("./regime.js");
const { accBase, accMod, inRegime, indicatorIds, realDir } = require("./lib.js");

function attribute(train, opts = {}) {
  const { minN = 200, topPerRegime = 3, minGain = 0.005, hKey = "a20" } = opts;
  const inds = indicatorIds(train);
  const baseAcc = accBase(train, hKey);
  const out = [];
  for (const g of REGIMES) {
    const gN = train.filter(r => realDir(r, hKey) !== 0 && inRegime(r, g)).length;
    if (gN < minN) continue;
    const cand = inds.map(z => ({ indicator: z, trainGain: accMod(train, g, z, hKey) - baseAcc, n: gN }));
    cand.sort((a, b) => b.trainGain - a.trainGain);
    for (const c of cand.slice(0, topPerRegime)) {
      if (c.trainGain <= minGain) continue;
      out.push({ regime: g, indicator: c.indicator, kind: "betray", stat: { trainGain: c.trainGain, n: c.n } });
    }
  }
  return out;
}

module.exports = { attribute };
