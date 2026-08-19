// 심화 리포트 「한 문장으로」(report-model.js sentence())가 읽는 an.overheat·an.resistance —
// 이 파일 밖 어디에서도 그 두 필드를 채우지 않는다(P1b Task 2 조사 A1). 문턱을 추측으로
// 정하면 늘 붙어서 정보가 없거나 거의 안 붙어서 문장 블록이 헛것이 된다. 그래서 짓기 전에
// 먼저 잰다 — P4 Task 1(성향 민감도, tools/measure-preset-sensitivity.mjs)의 같은 이유.
//
// API 시그니처는 추측하지 않고 소스에서 확인했다(태스크 브리프의 경고 — 이 저장소에서
// 시그니처 추측이 이미 여러 번 틀렸다):
//   - rsi.zone ∈ {"overbought","oversold","neutral"}         forge-core.js:392 analyzeRSI
//   - bb.state ∈ {"breakout_up","breakout_dn","upper","lower","neutral"}
//                                                              forge-core.js:1531 analyzeBollinger
//   - ma.sr = {ma, side, distPct}, side ∈ {"support","resistance"} — **엔진이 이미 nd<=srPct
//     (기본 0.015=1.5%)일 때만 채운다.** 그 밖엔 sr 전체가 null 로 유지된다(forge-core.js:118-126
//     analyzeMA). report.js 의 analyzeFull() 은 srPct 를 안 넘기므로 이 1.5% 상한이 그대로 적용된다
//     — resist_ma2pct 같은 "2%" 후보는 이 엔진 상한 때문에 사실상 1.5%와 같아진다(실측 각주 참고).
//   - pivot.R = [R1,R2,R3](저항 후보 레벨), pivot.last = 현재가            forge-core.js:440 analyzePivot
//   - fib.zone.nearest = {ratio, price, side}, side ∈ {"support","resistance"}
//                                                              forge-core.js:1175 _fibDegree
//   - cci.last(오실레이터 원값, +100 과열)                     forge-core.js:646 analyzeCCI
//   - williams.last(오실레이터 원값, −20 과열)                 forge-core.js:685 analyzeWilliams
//   호출 형태(price 배열만 받는지 {price,candle} 을 받는지)는 www/indicators.js 의 SHAPES 표를
//   그대로 따른다 — 그 표가 "31종 전수 실측으로 확정"(주석)된 단일 출처다.
//
// pivot·fib·cci·williams 는 Basic(5지표) 그래프엔 없다(www/graph.js BASIC). analyzeX 자체는
// 그래프 없이 직접 부른다(report.js 의 analyzeFull() 이 ma·rsi·bb·macd·va 를 그렇게 부르는 것과
// 같은 방식 — run() 내부 evalBlocks 는 시계열만 남기고 완전한 지표 객체를 안 돌려준다). ⚠ 채택된
// 두 정의(overheat·resistance)는 실제로는 rsi·bb·ma 뿐이라 basic 5지표에도 있는 필드다 — "32지표
// 전용 문구"는 아니다(2026-08-19 리뷰 정정). 화면 노출을 티어로 게이팅할지는 Task 3 결정.
//
// 표본 풀: backtest/earn-ohlc.json(30종목 실 OHLCV, mobile/tools/make-onboarding-sample.mjs 가
// 쓰는 것과 같은 파일 — 로드 경로·windowOk() 판별은 그 파일을 그대로 따른다). 슬라이딩
// N=240·STEP=45 도 그 생성기와 같은 값(240봉 창이 이 앱이 실제로 다루는 규모, 45는 커버리지와
// 실행시간의 절충 — 같은 이유를 여기서 다시 판단할 필요가 없다). earnings 근접 필터는 여기선
// 안 쓴다 — 그건 "실적 서프라이즈로 예측 정확도가 오염되지 않게"가 목적인 필터고, 여긴 예측이
// 아니라 순수 지표 판독 발생률을 재는 것이라 대상이 아니다.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const FC = require("../../forge-core.js");

export const N = 240;
export const STEP = 45;

function windowOk(win) {
  return win.every(c => isFinite(c.o) && isFinite(c.h) && isFinite(c.l) && isFinite(c.c) &&
    isFinite(c.v) && c.v > 0 && c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c));
}

// 표본 풀을 슬라이딩해 분석 대상 창을 전부 뽑는다(부수효과 없음). make-onboarding-sample.mjs 의
// buildCandidates() 와 같은 자리 — 생성 스크립트와 시험이 같은 함수를 공유해야 필터가 갈리지
// 않는다는 그 파일의 원칙을 여기서도 따른다.
export function buildWindows(raw) {
  const windows = [];
  for (const sym of Object.keys(raw).sort()) {
    const candles = raw[sym] && raw[sym].candles;
    if (!Array.isArray(candles) || candles.length < N) continue;
    for (let start = 0; start + N <= candles.length; start += STEP) {
      const win = candles.slice(start, start + N);
      if (!windowOk(win)) continue;
      windows.push({ sym, start, candle: win, price: win.map(c => c.c) });
    }
  }
  return windows;
}

// 창 하나를 analyzeX 로 읽어 후보 판정에 쓸 an 레코드를 만든다. 파라미터(len/period/k)는
// report.js analyzeFull() 의 기본값과 맞춘다 — 화면이 실제로 쓰는 것과 다른 파라미터로 재면
// 측정이 화면을 대표하지 않는다.
export function analyzeWindow(win) {
  const price = win.price, candle = win.candle, data = { price, candle };
  return {
    lastPrice: price[price.length - 1],
    ma: FC.analyzeMA(price, { len: 20, ema: false }),
    rsi: FC.analyzeRSI(price, { period: 14 }),
    bb: FC.analyzeBollinger(price, { len: 20, k: 2 }),
    pivot: FC.analyzePivot(data, {}),
    fib: FC.analyzeFib(price, {}),
    cci: FC.analyzeCCI(price, {}),
    williams: FC.analyzeWilliams(data, {})
  };
}

// 피벗 R(저항 후보) 중 현재가 위에 있는 것만 저항이다(가격이 그 레벨에 아직 못 미쳤다는 뜻).
// 가장 가까운 것과의 거리(비율)를 돌려준다 — 없으면 Infinity(저항 후보 자체가 없다).
function pivotResistDist(pivot, lastPrice) {
  if (!pivot || !Array.isArray(pivot.R) || !lastPrice) return Infinity;
  let nd = Infinity;
  for (const r of pivot.R) { if (r >= lastPrice) { const d = (r - lastPrice) / lastPrice; if (d < nd) nd = d; } }
  return nd;
}
// fib.zone.nearest 는 이미 side 를 판정해 돌려준다(엔진, forge-core.js _fibDegree) — 여기선
// 거리(비율)만 다시 계산한다(엔진이 zone.nearest 에 거리를 안 담아 준다).
function fibResistDist(fib, lastPrice) {
  const near = fib && fib.zone && fib.zone.nearest;
  if (!near || near.side !== "resistance" || !lastPrice) return Infinity;
  return Math.abs(lastPrice - near.price) / lastPrice;
}

// ── 채택된 정의(단일 출처) ─────────────────────────────────────────────────────────────
// 2026-08-19 컨트롤러 리뷰 라운드 1 이후 개정. 원 라운드는 overheat_rsi_or_bb(RSI 과매수 |
// 볼린저 upper | 볼린저 breakout_up)를 27.3%로 채택했지만, 리뷰어가 항별 기여를 분해해
// breakout_up(%B>1, 상단밴드 위 마감=밴드워킹)이 사실은 **추세 지속** 신호라 "다만 다소
// 과열된 구간입니다"라고 붙이면 base 문장("상승 흐름입니다")과 스스로 모순된다는 것,
// 그리고 옛 OR 27.3% 중 breakout_up 을 뺀 RSI 의 한계 기여가 겨우 0.8pp(23/2813)뿐이었다는
// 것을 지적했다 — "한 항이 거의 전부를 만들면 나머지는 장식"(브리프 경고)에 정확히 해당.
//
// 그래서 breakout_up 을 뺐다. **재측정**: breakout_up 을 뺀 뒤 "upper 단독"(20.6%) 대비
// RSI 의 한계 기여(RSI 과매수 ∧ upper 아님)를 다시 재니 80/2813 = **2.8pp** 다(옛 0.8pp 와
// 다른 수 — breakout_up 이 RSI 와 크게 겹쳤던 구간이 빠지면서 RSI 고유 기여가 드러난다).
// 컨트롤러가 세운 문턱(2pp)을 넘으므로 판정을 되물었다: 2.8pp 는 upper 단독(20.6%) 대비
// 상대 기여 12.1%(80/660)로 무시할 크기가 아니고, RSI·볼린저 상단은 브리프 Step 1 이 애초에
// 제시한 두 후보 그대로다(그새 breakout_up 만 잘못 끼어 있었다) — **RSI 를 남긴다.**
//   overheat_upperOnly(bb 단독)   20.6% (580/2813)
//   + RSI 한계 기여               2.8pp (80/2813)
//   = isOverheat(OR, breakout_up 제외)   23.5% (660/2813)
// resistance 는 라운드 1 그대로: ma.sr 은 엔진이 이미 계산하고 차트에도 그리는 값이라 우리가
// 새 문턱을 발명하지 않는 게 가장 단순하다(20.7%, 581/2813).
//
// 반드시 이 두 함수를 통해서만 판정한다 — CANDIDATES 표의 항목이 아니라 **이 함수 자체가**
// 단일 출처다(2026-08-19 리뷰 Important C: 시험이 measure() 의 결과값을 읽을 때도 이 함수를
// 거쳐야 한다 — candidates 딕셔너리의 키를 별도로 참조하면 이 함수만 바뀌었을 때 시험이
// 못 잡는다). Task 3 은 이 두 함수의 조건식을 그대로 report-model.js 쪽으로 옮긴다.
export function isOverheat(an) {
  return an.bb.state === "upper" || an.rsi.zone === "overbought";
}
export function isResistance(an) {
  return !!(an.ma.sr && an.ma.sr.side === "resistance");
}

// 후보 정의 전체(참고용 비교표) — 브리프(task-2-brief.md Step 1)의 표를 실제 필드명으로 고쳐
// 확장했다. 채택되지 않은 후보도 지우지 않는다 — "왜 이걸 안 썼나"를 다음에 다시 재지 않도록.
// chosen_overheat·chosen_resistance 는 새 함수를 만들지 않고 isOverheat/isResistance 를 그대로
// 참조한다 — 표와 판정이 같은 함수를 보게 해서 표만 낡는 일을 막는다.
export const CANDIDATES = {
  overheat_rsi70: an => an.rsi.zone === "overbought",
  overheat_bbUpperOnly: an => an.bb.state === "upper",                 // breakout_up 제외한 단독항
  overheat_bbBreakoutUp: an => an.bb.state === "breakout_up",          // 참고용 — 추세지속 신호라 기각
  overheat_bbUpperOrBreakout: an => an.bb.state === "upper" || an.bb.state === "breakout_up",  // 참고용
  overheat_rsi_and_bbUpperOnly: an => (an.rsi.zone === "overbought") && (an.bb.state === "upper"),
  overheat_rsi_or_bbUpperOrBreakout_v1: an =>                          // 라운드 1 채택안(기각)
    (an.rsi.zone === "overbought") || (an.bb.state === "upper") || (an.bb.state === "breakout_up"),
  overheat_cci100: an => an.cci.last > 100,
  overheat_williamsM20: an => an.williams.last > -20,
  overheat_any4: an => (an.rsi.zone === "overbought") || (an.bb.state === "upper" || an.bb.state === "breakout_up") ||
                       (an.cci.last > 100) || (an.williams.last > -20),
  chosen_overheat: isOverheat,

  // ma.sr 은 엔진이 이미 1.5% 안에서만 채운다 — "2%" 조건은 그 상한 때문에 native 와 동치다.
  resist_ma_native: an => !!(an.ma.sr && an.ma.sr.side === "resistance"),
  resist_ma1pct: an => !!(an.ma.sr && an.ma.sr.side === "resistance" && an.ma.sr.distPct <= 0.01),
  resist_piv2pct: an => pivotResistDist(an.pivot, an.lastPrice) <= 0.02,
  resist_piv1pct: an => pivotResistDist(an.pivot, an.lastPrice) <= 0.01,
  resist_fib2pct: an => fibResistDist(an.fib, an.lastPrice) <= 0.02,
  resist_fib1pct: an => fibResistDist(an.fib, an.lastPrice) <= 0.01,
  resist_any2pct: an => (an.ma.sr && an.ma.sr.side === "resistance") ||
                        pivotResistDist(an.pivot, an.lastPrice) <= 0.02 || fibResistDist(an.fib, an.lastPrice) <= 0.02,
  resist_any1pct: an => (an.ma.sr && an.ma.sr.side === "resistance" && an.ma.sr.distPct <= 0.01) ||
                        pivotResistDist(an.pivot, an.lastPrice) <= 0.01 || fibResistDist(an.fib, an.lastPrice) <= 0.01,
  chosen_resistance: isResistance
};

export function measure() {
  const raw = JSON.parse(readFileSync(new URL("../../backtest/earn-ohlc.json", import.meta.url)));
  const windows = buildWindows(raw);
  const symbols = new Set(windows.map(w => w.sym)).size;
  const counts = {}; Object.keys(CANDIDATES).forEach(k => { counts[k] = 0; });
  // overheat/resistance/cooccurrence 는 CANDIDATES 딕셔너리를 거치지 않고 isOverheat/
  // isResistance 를 **직접** 호출해 집계한다(리뷰 Important C) — CANDIDATES.chosen_overheat 도
  // 결국 같은 함수 참조라 수치는 같지만, 이 필드들의 생산 경로 자체가 그 함수를 거치게 해서
  // isOverheat 만 바뀌어도(예: 다른 CANDIDATES 키로 갈아 끼우는 실수 없이) 이 결과가 즉시 따라온다.
  let overheatCount = 0, resistanceCount = 0, coChosen = 0;
  // breakout_up(%B>1, 상단밴드 위 마감=밴드워킹)은 추세 지속 신호이지 과열이 아니다(리뷰 Important
  // A) — isOverheat 가 그 상태 "단독"(rsi 도 upper 도 아닌)으로는 절대 안 켜져야 한다. 같은 루프
  // 안에서 함께 잰다(창을 다시 빌드하지 않는다 — B 가 지적한 재계산 비용을 새로 만들지 않는다).
  let breakoutOnlyChecked = 0, breakoutOnlyViolations = 0;
  windows.forEach(w => {
    const an = analyzeWindow(w);
    Object.keys(CANDIDATES).forEach(k => { if (CANDIDATES[k](an)) counts[k]++; });
    const oh = isOverheat(an), rs = isResistance(an);
    if (oh) overheatCount++;
    if (rs) resistanceCount++;
    if (oh && rs) coChosen++;
    if (an.bb.state === "breakout_up" && an.rsi.zone !== "overbought") {
      breakoutOnlyChecked++;
      if (oh) breakoutOnlyViolations++;
    }
  });
  const total = windows.length;
  const candidates = {};
  Object.keys(counts).forEach(k => { candidates[k] = { count: counts[k], rate: total ? counts[k] / total : 0 }; });
  return {
    total, symbols,
    candidates,
    overheat: { count: overheatCount, rate: total ? overheatCount / total : 0 },
    resistance: { count: resistanceCount, rate: total ? resistanceCount / total : 0 },
    cooccurrence: { count: coChosen, rate: total ? coChosen / total : 0 },
    breakoutGuard: { checked: breakoutOnlyChecked, violations: breakoutOnlyViolations }
  };
}

function pct(r) { return (r * 100).toFixed(1) + "%"; }
function row(...cells) { return cells.map(c => String(c).padEnd(42)).join(" "); }

function report(results) {
  console.log("표본 풀: backtest/earn-ohlc.json —", results.symbols, "종목 ·", results.total, "창(N=" + N + ", STEP=" + STEP + ")\n");
  console.log(row("후보", "발생/전체", "비율"));
  Object.keys(CANDIDATES).forEach(k => {
    const c = results.candidates[k];
    console.log(row(k, c.count + "/" + results.total, pct(c.rate)));
  });
  console.log("\n채택(isOverheat/isResistance) — 과열:", pct(results.overheat.rate),
    "· 저항:", pct(results.resistance.rate));
  console.log("동시 발생(채택 두 신호):", results.cooccurrence.count + "/" + results.total, pct(results.cooccurrence.rate));
  console.log("breakout_up 단독 창 중 과열 오판정:", results.breakoutGuard.violations + "/" + results.breakoutGuard.checked);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) report(measure());
