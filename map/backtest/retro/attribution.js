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
    // drop(betray)·add(missing) 후보를 한 랭킹에서 겨룬다("어떤 membership 변경이든 최상위 개선"). 의도된 공유 슬롯.
    // 게이트가 실제 필터이며, 종결 진술의 정량 근거(build-catalog distByRegime)는 kind별 최댓값을 따로 보고하므로 이 공유 랭킹에 영향받지 않는다.
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
