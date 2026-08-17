// backtest/preset-k-holdout.js — 프리셋 배율 k 의 표본 밖 확인 (모바일 P2 T9)
//
// preset-k.js 는 픽스처 87개 위에서 k 를 고르고 **같은 87개로** 평가했다. 그렇게 고른 최선값은
// 정의상 그 표본에서 가장 좋아 보인다 — 개선폭이 0.2~0.3%p 인 프리셋들이 신호인지 잡음인지
// 그 숫자만으로는 말할 수 없다. 이 저장소가 인터마켓·인트라데이·다중스케일을 기각할 때 쓴
// 규율이 그것이다: 고른 곳과 재는 곳이 같으면 아무것도 증명되지 않는다.
//
// 그래서 종목을 둘로 갈라(짝수 번째 / 홀수 번째) 양쪽에서 **같은 방향의 개선**이 나오는지만
// 본다. 한쪽에서만 좋아지면 그 k 는 표본을 외운 것이다.
//
// 재는 것은 k=1.0 대비 ECE 변화 하나뿐이다. 여러 지표를 놓고 좋은 쪽을 고르면 그 자체가
// 또 하나의 과적합이라, 앞 단계가 고를 때 쓴 지표(ECE)를 그대로 쓴다.
"use strict";
const fs = require("fs");
const path = require("path");
const FC = require("../forge-core.js");
const BT = require("./backtest.js");
const Tiers = require("../mobile/www/ind-tiers.js");
const { graphFor } = require("./preset-k.js");

const CORE = Tiers.TIERS[0].types;

// 앞 스윕이 프리셋마다 고른 값. 여기 손으로 적지 않고 보고서에서 읽는다 —
// 스윕을 다시 돌리면 이 확인도 자동으로 새 값을 따라간다.
const REPORT = path.join(__dirname, "preset-k-report.json");
if (!fs.existsSync(REPORT)) { console.error("preset-k-report.json 없음 — 먼저 `node backtest/preset-k.js`"); process.exit(1); }
const SWEEP = JSON.parse(fs.readFileSync(REPORT, "utf8"));

function weightsFor(p, sel, k) {
  const w = {};
  sel.forEach(t => { w[t] = (p.types.indexOf(t) >= 0) ? k : 1.0; });
  return w;
}

function eceOf(fixtures, p, sel, k) {
  const w = weightsFor(p, sel, k);
  const rep = BT.runBacktest(fixtures, { graph: graphFor(sel, w), runOpts: { driftWeights: w }, progress: false });
  return rep.overall.calibrationECE;
}

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  const all = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  // 갈라내는 규칙은 파일명 정렬 후 짝/홀 — 무작위가 아니라 재현 가능해야 한다(Math.random 금지).
  const A = all.filter((_, i) => i % 2 === 0);
  const B = all.filter((_, i) => i % 2 === 1);
  console.error("반쪽 A " + A.length + "종 · 반쪽 B " + B.length + "종 — 엔진 " + FC.version);

  const out = { generatedAt: process.env.BT_STAMP || null, engineVersion: FC.version,
                halves: { A: A.length, B: B.length }, presets: {} };

  for (const p of Tiers.PRESETS) {
    const kBest = SWEEP.bestPerPreset[p.key];
    const sel = Tiers.selectionOf(p.key, CORE);
    const r = { kBest: kBest, halves: {} };
    for (const [name, fx] of [["A", A], ["B", B]]) {
      const base = eceOf(fx, p, sel, 1.0);
      const best = kBest === 1 ? base : eceOf(fx, p, sel, kBest);
      r.halves[name] = { eceAt1: base, eceAtBest: best, deltaPP: Math.round((best - base) * 10000) / 100 };
      console.error("  " + p.name + " [" + name + "] k=1.0 " + (base * 100).toFixed(2) +
                    "%p → k=" + kBest + " " + (best * 100).toFixed(2) + "%p (" +
                    (r.halves[name].deltaPP >= 0 ? "+" : "") + r.halves[name].deltaPP + "%p)");
    }
    // 양쪽에서 같은 방향으로 좋아졌는가(음수 = 개선). 한쪽만이면 표본을 외운 것이다.
    //
    // kBest === 1 은 세 번째 경우다. 앞 스윕이 "배율을 올릴 이유가 없다"고 고른 것이라
    // 자기 자신과 비교해 ±0 이 나온다 — 이것을 "한쪽만 개선"과 같은 칸에 넣으면 화면이
    // 거짓말을 한다. 처음에 그렇게 적었다가 결과를 읽고 바로잡았다. 배율 없음의 근거는
    // 이 확인이 아니라 앞 스윕의 단조 악화다.
    r.verdict = (kBest === 1) ? "no-scaling"
              : (r.halves.A.deltaPP < 0 && r.halves.B.deltaPP < 0) ? "signal" : "sample-fit";
    r.consistent = (r.verdict === "signal");
    out.presets[p.key] = Object.assign({ name: p.name }, r);
  }

  fs.writeFileSync(path.join(__dirname, "preset-k-holdout.json"), JSON.stringify(out, null, 2));
  console.log("\n=== 표본 밖 확인 (엔진 " + FC.version + ") ===");
  for (const key of Object.keys(out.presets)) {
    const P = out.presets[key];
    console.log("  " + P.name + " k=" + P.kBest + " : A " + P.halves.A.deltaPP + "%p · B " +
      P.halves.B.deltaPP + "%p → " +
      (P.verdict === "no-scaling" ? "배율 없음이 최선 (스윕이 k=1.0 을 골랐다)"
       : P.verdict === "signal" ? "양쪽 개선 (신호)" : "한쪽만 (표본 외움 — 채택 불가)"));
  }
  console.log("→ preset-k-holdout.json 기록됨\n");
}

if (require.main === module) main();
