"use strict";
const FC = require("../forge-core.js");
function structTierBias(t) {
  return t.event === "BOS_up" ? 0.6 : t.event === "BOS_down" ? -0.6 : t.event === "CHoCH_up" ? 0.5 : t.event === "CHoCH_down" ? -0.5 : t.trend === "up" ? 0.3 : t.trend === "down" ? -0.3 : 0;
}
function multiScaleStructBias(price, opts) {
  const r = FC.collectStructure(price, opts || {}), ts = (r && r.tiers) || [];
  if (!ts.length) return 0;
  let sw = 0, sb = 0;
  for (const t of ts) { const w = t.significance || 0; sw += w; sb += w * structTierBias(t); }
  return sw ? Math.max(-1, Math.min(1, sb / sw)) : 0;
}
module.exports = { structTierBias, multiScaleStructBias };
