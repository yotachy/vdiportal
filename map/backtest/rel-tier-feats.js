"use strict";
const FC = require("../forge-core.js");
function tierBias(t) { return t.event === "BOS_up" ? 0.6 : t.event === "BOS_down" ? -0.6 : t.event === "CHoCH_up" ? 0.5 : t.event === "CHoCH_down" ? -0.5 : t.trend === "up" ? 0.3 : t.trend === "down" ? -0.3 : 0; }
function relTierFeats(series) {
  const r = FC.collectStructure(series, {}), ts = (r && r.tiers) || [];
  if (!ts.length) return [0, 0, 0, 0, 0];
  const byDeg = { 0: 0, 1: 0, 2: 0 };
  let sw = 0, sb = 0, agree = 0;
  for (const t of ts) { const w = t.significance || 0, b = tierBias(t); sw += w; sb += w * b; byDeg[t.degree] = b; agree += Math.sign(b); }
  const ms = sw ? Math.max(-1, Math.min(1, sb / sw)) : 0;
  return [ms, byDeg[0], byDeg[1], byDeg[2], Math.max(-1, Math.min(1, agree / ts.length))];
}
module.exports = { relTierFeats, tierBias };
