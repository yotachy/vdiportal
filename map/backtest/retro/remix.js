// remix.js — 진단 → 재조합 후보(drop/add, 순수)
"use strict";

function candidatesFrom(diagnoses) {
  const seen = new Set(), out = [];
  for (const d of diagnoses) {
    const op = d.kind === "missing" ? "add" : "drop";
    const id = "retro-" + d.regime + "-" + op + "-" + d.indicator;
    if (seen.has(id)) continue;
    seen.add(id);
    const gainPP = (d.stat.trainGain * 100).toFixed(1);
    const rationale = op === "add"
      ? "국면 '" + d.regime + "'에서 지표 '" + d.indicator + "' 추가 시 방향 개선(train +" + gainPP + "pp). 이 국면에서 투입 검토."
      : "국면 '" + d.regime + "'에서 지표 '" + d.indicator + "'가 방향을 반대로 밀어(train +" + gainPP + "pp). 이 국면에서 제외 검토.";
    out.push({
      id,
      regime: d.regime,
      change: { op, indId: d.indicator },
      rationale,
      sourceDiag: d,
    });
  }
  return out;
}

module.exports = { candidatesFrom };
