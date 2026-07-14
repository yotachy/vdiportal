// map/backtest/retro/gate.js — 후보 → 게이트 판정(순수, 캐시 채점, OOS만)
"use strict";
const { accBase, accMod, inRegime, realDir } = require("./lib.js");

function gateCandidate(candidate, test, opts = {}) {
  const { minN = 100, minDelta = 0.01, hKey = "a20" } = opts;
  const g = candidate.regime, z = candidate.change.indId;
  const valid = test.filter(r => realDir(r, hKey) !== 0);
  const gTest = valid.filter(r => inRegime(r, g));
  if (gTest.length < minN) return { verdict: "insufficient-sample", evidence: { n: gTest.length } };

  const curAcc = accBase(valid, hKey);
  const modAcc = accMod(valid, g, z, hKey);
  const oosDelta = modAcc - curAcc;

  const sorted = valid.slice().sort((a, b) => (a.t - b.t) || (a.sym < b.sym ? -1 : 1));
  const mid = Math.floor(sorted.length / 2);
  const h1 = accMod(sorted.slice(0, mid), g, z, hKey) - accBase(sorted.slice(0, mid), hKey);
  const h2 = accMod(sorted.slice(mid), g, z, hKey) - accBase(sorted.slice(mid), hKey);

  const syms = [...new Set(valid.map(r => r.sym))];
  let pos = 0, tot = 0;
  for (const s of syms) {
    const sr = valid.filter(r => r.sym === s);
    if (!sr.some(r => inRegime(r, g))) continue;
    tot++; if ((accMod(sr, g, z, hKey) - accBase(sr, hKey)) >= 0) pos++;
  }
  const symbolConsistency = tot ? pos / tot : 0;

  const alwaysUp = gTest.filter(r => realDir(r, hKey) > 0).length / gTest.length;
  const modAccG = accMod(gTest, g, z, hKey);

  const pass = oosDelta >= minDelta && h1 >= 0 && h2 >= 0 && symbolConsistency >= 0.5 && modAccG >= alwaysUp;
  return {
    verdict: pass ? "adopt" : "no-improvement",
    evidence: { oosDelta, halves: [h1, h2], symbolConsistency, modAcc, curAcc, modAccG, alwaysUp, n: gTest.length },
  };
}

module.exports = { gateCandidate };
