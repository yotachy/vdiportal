// map/backtest/retro/build-catalog.js — 회고 파이프라인 러너(drop+add) → retro-catalog.json
"use strict";
const fs = require("fs"), path = require("path");
const F = require("../feat-lib.js");
const L = require("./lib.js");
const { REGIMES } = require("./regime.js");
const { CACHE, collectAll } = require("./miss-ledger.js");
const { attribute } = require("./attribution.js");
const { candidatesFrom } = require("./remix.js");
const { gateCandidate } = require("./gate.js");

const OUT = path.join(__dirname, "retro-catalog.json");
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "pp";

function splitBySymbol(recs) {
  const bySym = {}; for (const r of recs) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const train = [], test = [];
  for (const s of Object.keys(bySym)) {
    const a = bySym[s].slice().sort((x, y) => x.t - y.t);
    const k = F.splitIdx(a.length);
    train.push(...a.slice(0, k)); test.push(...a.slice(k));
  }
  return { train, test };
}

// 한 번도 예측 up을 움직이지 않은 add 지표(no-op) — "개선 없음"이 아니라 "미측정"으로 분리.
function notMeasuredAdds(recs) {
  const types = L.indicatorIds(recs, "addAb");
  const moved = new Set();
  for (const r of recs) for (const bt of types) if (r.addAb && r.addAb[bt] && r.addAb[bt].up !== r.up) moved.add(bt);
  return types.filter(bt => !moved.has(bt));
}

// 국면×(drop/add) 최대 개선 분포(train) — 종결 진술의 정량 근거.
function distByRegime(train, map, minN) {
  const base = L.accBase(train), keys = L.indicatorIds(train, map), rows = [];
  for (const g of REGIMES) {
    const gN = train.filter(r => L.realDir(r) !== 0 && L.inRegime(r, g)).length;
    if (gN < minN) continue;
    let best = -1, bestK = "";
    for (const k of keys) { const gain = L.accMod(train, g, k, "a20", map) - base; if (gain > best) { best = gain; bestK = k; } }
    rows.push({ g, gN, best, bestK });
  }
  return rows;
}

function main() {
  let recs;
  if (fs.existsSync(CACHE)) recs = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  else { console.error("retro-records.json 없음 — 수집 실행…"); recs = collectAll(); }
  console.error("레코드 " + recs.length + " · 종목 " + new Set(recs.map(r => r.sym)).size);

  const { train, test } = splitBySymbol(recs);
  const catalog = candidatesFrom(attribute(train)).map(c => {
    const gr = gateCandidate(c, test);
    return { id: c.id, diagnosis: c.sourceDiag, remix: { change: c.change, rationale: c.rationale }, verdict: gr.verdict, evidence: gr.evidence, promoted: false };
  });
  fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2));

  const by = k => catalog.filter(e => e.verdict === k).length;
  const notMeasured = notMeasuredAdds(recs);
  console.error("\n=== 회고 대장 요약 (up 기반) ===");
  console.error("train base 방향정확도: " + (L.accBase(train) * 100).toFixed(2) + "%");
  console.error("후보 " + catalog.length + " · 채택 " + by("adopt") + " · 개선없음 " + by("no-improvement") + " · 표본부족 " + by("insufficient-sample"));
  if (notMeasured.length) console.error("add 미측정(예측 무변동): " + notMeasured.join(", "));
  console.error("\n[drop 분포] 국면별 최대 제거이득:");
  for (const r of distByRegime(train, "ab", 200)) console.error("  " + r.g.padEnd(11) + " n=" + String(r.gN).padStart(5) + "  " + r.bestK.padEnd(10) + pp(r.best));
  console.error("[add 분포] 국면별 최대 추가이득:");
  for (const r of distByRegime(train, "addAb", 200)) console.error("  " + r.g.padEnd(11) + " n=" + String(r.gN).padStart(5) + "  " + r.bestK.padEnd(10) + pp(r.best));
  for (const e of catalog.filter(e => e.verdict === "adopt").sort((a, b) => b.evidence.oosDelta - a.evidence.oosDelta)) {
    console.error("  [채택] " + e.id + "  OOS " + pp(e.evidence.oosDelta) + " · 종목일관 " + (e.evidence.symbolConsistency * 100).toFixed(0) + "% · n=" + e.evidence.n);
  }
  if (by("adopt") === 0) console.error("\n→ membership 레버(add+drop) 방향 개선 0 — up 기반 실측, 재조합 가설 종결.");
  console.error("→ retro-catalog.json 기록됨");
}

if (require.main === module) main();
module.exports = { splitBySymbol, notMeasuredAdds };
