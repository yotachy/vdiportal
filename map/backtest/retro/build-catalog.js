// map/backtest/retro/build-catalog.js — 회고 파이프라인 러너 → retro-catalog.json
"use strict";
const fs = require("fs"), path = require("path");
const F = require("../feat-lib.js");
const { CACHE, collectAll } = require("./miss-ledger.js");
const { attribute } = require("./attribution.js");
const { candidatesFrom } = require("./remix.js");
const { gateCandidate } = require("./gate.js");

const OUT = path.join(__dirname, "retro-catalog.json");

function splitBySymbol(recs) {
  const bySym = {}; for (const r of recs) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const train = [], test = [];
  for (const s of Object.keys(bySym)) {
    const a = bySym[s].slice().sort((x, y) => x.t - y.t);
    const k = F.splitIdx(a.length);           // 60% 시점 분할(시간순)
    train.push(...a.slice(0, k)); test.push(...a.slice(k));
  }
  return { train, test };
}

function main() {
  let recs;
  if (fs.existsSync(CACHE)) recs = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  else { console.error("retro-records.json 없음 — 수집 실행…"); recs = collectAll(); }
  console.error("레코드 " + recs.length + " · 종목 " + new Set(recs.map(r => r.sym)).size);

  const { train, test } = splitBySymbol(recs);
  const diagnoses = attribute(train);
  const candidates = candidatesFrom(diagnoses);
  console.error("진단 " + diagnoses.length + " → 후보 " + candidates.length);

  const catalog = candidates.map(c => {
    const g = gateCandidate(c, test);
    return { id: c.id, diagnosis: c.sourceDiag, remix: { change: c.change, rationale: c.rationale }, verdict: g.verdict, evidence: g.evidence, promoted: false };
  });
  fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2));

  const by = k => catalog.filter(e => e.verdict === k).length;
  console.error("\n=== 회고 대장 요약 ===");
  console.error("후보 " + catalog.length + " · 채택 " + by("adopt") + " · 개선없음 " + by("no-improvement") + " · 표본부족 " + by("insufficient-sample"));
  const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";
  for (const e of catalog.filter(e => e.verdict === "adopt").sort((a, b) => b.evidence.oosDelta - a.evidence.oosDelta)) {
    console.error("  [채택] " + e.id + "  OOS " + pp(e.evidence.oosDelta) + " · 종목일관 " + (e.evidence.symbolConsistency * 100).toFixed(0) + "% · n=" + e.evidence.n);
  }
  if (by("adopt") === 0) console.error("  (채택 0 — '가격 재조합=새 정보 0' 벽. 예상된 정직 결과. 대장에 null도 기록됨)");
  console.error("→ retro-catalog.json 기록됨");
}

if (require.main === module) main();
module.exports = { splitBySymbol };
