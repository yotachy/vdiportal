// remix.js — 진단 → 재조합 후보(순수, 저자유도: drop만)
"use strict";

function candidatesFrom(diagnoses) {
  const seen = new Set(), out = [];
  for (const d of diagnoses) {
    const id = "retro-" + d.regime + "-drop-" + d.indicator;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      regime: d.regime,
      change: { op: "drop", indId: d.indicator },
      rationale: "국면 '" + d.regime + "'에서 지표 '" + d.indicator + "'가 방향을 반대로 밀어(train 개선 +" +
        (d.stat.trainGain * 100).toFixed(1) + "pp). 이 국면에서 제외 검토.",
      sourceDiag: d,
    });
  }
  return out;
}

module.exports = { candidatesFrom };
