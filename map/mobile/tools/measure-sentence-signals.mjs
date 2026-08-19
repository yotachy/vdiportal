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
// pivot·fib·cci·williams 는 Basic(5지표) 그래프엔 없다(www/graph.js BASIC). 그래서 저항 절은
// 구조적으로 **유료(Full 32지표) 전용 문구**다 — 이 측정도 그 전제를 그대로 반영해 32지표
// 세트에서만 나오는 값(pivot·fib)을 후보에 넣는다. analyzeX 자체는 그래프 없이 직접 부른다
// (report.js 의 analyzeFull() 이 ma·rsi·bb·macd·va 를 그렇게 부르는 것과 같은 방식 — run()
// 내부 evalBlocks 는 시계열만 남기고 완전한 지표 객체를 안 돌려준다).
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

// 후보 정의 전체 — 브리프(task-2-brief.md Step 1)의 표를 실제 필드명으로 고쳐 확장했다.
// 채택되지 않은 후보도 지우지 않는다 — "왜 이걸 안 썼나"를 다음에 다시 재지 않도록.
export const CANDIDATES = {
  overheat_rsi70: an => an.rsi.zone === "overbought",
  overheat_bbUpper: an => an.bb.state === "upper" || an.bb.state === "breakout_up",
  overheat_rsi_and_bb: an => (an.rsi.zone === "overbought") && (an.bb.state === "upper" || an.bb.state === "breakout_up"),
  overheat_rsi_or_bb: an => (an.rsi.zone === "overbought") || (an.bb.state === "upper" || an.bb.state === "breakout_up"),
  overheat_cci100: an => an.cci.last > 100,
  overheat_williamsM20: an => an.williams.last > -20,
  overheat_any4: an => (an.rsi.zone === "overbought") || (an.bb.state === "upper" || an.bb.state === "breakout_up") ||
                       (an.cci.last > 100) || (an.williams.last > -20),

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
                        pivotResistDist(an.pivot, an.lastPrice) <= 0.01 || fibResistDist(an.fib, an.lastPrice) <= 0.01
};

// ── 판정(Step 3) ────────────────────────────────────────────────────────────────────────
// 실측(본 파일 최초 실행, 2813창 — 아래 report() 출력과 tools 실행 로그가 근거):
//   overheat_rsi70        7.4%  — 5% 문턱에 너무 붙어 있다(여유 2.4pp), 표본이 갈리면 바로 밑돈다
//   overheat_bbUpper      26.5% / overheat_cci100 24.0% / overheat_williamsM20 28.0% — 다 안전권
//   overheat_rsi_and_bb   6.6%  — AND 는 문턱에 너무 붙는다
//   overheat_rsi_or_bb    27.3% — 안전권 + "RSI 과매수 또는 볼린저 상단" 두 고전 지표의 OR,
//                                 사용자에게 설명 가능한 가장 단순한 합성. **채택**
//   resist_ma_native      20.7% — 안전권, 그리고 **엔진이 이미 하는 판정을 그대로 재사용**한다
//                                 (추가 문턱을 우리가 새로 발명하지 않는다 — 가장 단순).
//                                 같은 an.ma.sr 이 차트에 지지/저항 마커로 이미 그려진다
//                                 (chart-legend.js MA 판독문·MSLayers.ma) — 화면에 보이는 것과
//                                 문장이 같은 판정을 말한다.
//   resist_piv2pct        72.5%(80% 문턱에 바짝 붙음) / resist_any2pct 80.2%(**문턱 초과, 기각**)
//   resist_fib1/2pct·resist_ma1pct·resist_piv1pct — 다 안전권이지만 임의 문턱(1%/2%)을
//                                 우리가 새로 정해야 해서 ma_native 보다 해석이 한 단계 더 든다
//   → **채택: resist_ma_native** (20.7%)
// 두 신호 동시발생(overheat_rsi_or_bb ∧ resist_ma_native): 1.6%(46/2813) — 거의 안 겹친다.
// 절을 둘로 나눈 의미가 있다(하나가 다른 하나를 그냥 따라오지 않는다).
export function isOverheat(an) { return CANDIDATES.overheat_rsi_or_bb(an); }
export function isResistance(an) { return CANDIDATES.resist_ma_native(an); }

export function measure() {
  const raw = JSON.parse(readFileSync(new URL("../../backtest/earn-ohlc.json", import.meta.url)));
  const windows = buildWindows(raw);
  const symbols = new Set(windows.map(w => w.sym)).size;
  const counts = {}; Object.keys(CANDIDATES).forEach(k => { counts[k] = 0; });
  let coChosen = 0;
  windows.forEach(w => {
    const an = analyzeWindow(w);
    Object.keys(CANDIDATES).forEach(k => { if (CANDIDATES[k](an)) counts[k]++; });
    if (isOverheat(an) && isResistance(an)) coChosen++;
  });
  const total = windows.length;
  const candidates = {};
  Object.keys(counts).forEach(k => { candidates[k] = { count: counts[k], rate: total ? counts[k] / total : 0 }; });
  return {
    total, symbols,
    candidates,
    overheat: candidates.overheat_rsi_or_bb,
    resistance: candidates.resist_ma_native,
    cooccurrence: { count: coChosen, rate: total ? coChosen / total : 0 }
  };
}

function pct(r) { return (r * 100).toFixed(1) + "%"; }
function row(...cells) { return cells.map(c => String(c).padEnd(38)).join(" "); }

function report(results) {
  console.log("표본 풀: backtest/earn-ohlc.json —", results.symbols, "종목 ·", results.total, "창(N=" + N + ", STEP=" + STEP + ")\n");
  console.log(row("후보", "발생/전체", "비율"));
  Object.keys(CANDIDATES).forEach(k => {
    const c = results.candidates[k];
    console.log(row(k, c.count + "/" + results.total, pct(c.rate)));
  });
  console.log("\n채택 — 과열: overheat_rsi_or_bb", pct(results.overheat.rate),
    "· 저항: resist_ma_native", pct(results.resistance.rate));
  console.log("동시 발생(채택 두 신호):", results.cooccurrence.count + "/" + results.total, pct(results.cooccurrence.rate));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) report(measure());
