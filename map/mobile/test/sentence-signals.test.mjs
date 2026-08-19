import { test } from "node:test";
import assert from "node:assert";

// 심화 리포트 「한 문장으로」(report-model.js sentence())의 과열·저항 절 문턱을 잠근다.
// tools/measure-sentence-signals.mjs 의 measure() 를 그대로 재사용한다(P4 Task 1
// test/onboarding-sample.test.mjs 의 measure() 재사용 선례와 같은 원칙 — 생성/측정 로직과
// 시험이 각자 계산하면 두 곳이 갈린다). 문턱이 바뀌어 절이 늘 붙거나 아예 안 붙게 되면
// 여기서 걸린다 — 그때 문장 블록은 정보를 잃는다(늘 같은 문장 = 정보 0).
//
// 5%/80%/20% 는 이 시험이 스스로 세운 판단 기준(태스크 브리프 Step 3·4)이지 tools/
// measure-sentence-signals.mjs 안의 어떤 상수를 다시 계산해 비교하는 게 아니다 — measure()
// 는 backtest/earn-ohlc.json 실 데이터를 다시 읽어 독립적으로 계산한다.

test("표본 풀은 30종목에서 최소 200창을 훑는다", async () => {
  const { measure } = await import("../tools/measure-sentence-signals.mjs");
  const r = measure();
  assert.ok(r.total >= 200, "측정 창이 " + r.total + "개뿐이다 — 최소 200 필요(측정이 표본 부족으로 신뢰할 수 없다)");
  assert.strictEqual(r.symbols, 30,
    "표본 풀 종목 수가 " + r.symbols + "이다(기대 30) — backtest/earn-ohlc.json 이 바뀌었는지 확인할 것");
});

test("과열 절(RSI 과매수 또는 볼린저 상단)이 극단 비율이 아니다 — 정보가 있다", async () => {
  const { measure } = await import("../tools/measure-sentence-signals.mjs");
  const r = measure();
  const rate = r.overheat.rate;
  const toFloor = ((rate - 0.05) * 100).toFixed(1), toCeil = ((0.80 - rate) * 100).toFixed(1);
  assert.ok(rate > 0.05 && rate < 0.80,
    "과열 절 발생률이 극단이다 — " + (rate * 100).toFixed(1) + "% (" + r.overheat.count + "/" + r.total +
    ", 하한 5%까지 " + toFloor + "pp · 상한 80%까지 " + toCeil + "pp)");
});

test("저항 절(MA 근접, 엔진 sr 판정 재사용)이 극단 비율이 아니다 — 정보가 있다", async () => {
  const { measure } = await import("../tools/measure-sentence-signals.mjs");
  const r = measure();
  const rate = r.resistance.rate;
  const toFloor = ((rate - 0.05) * 100).toFixed(1), toCeil = ((0.80 - rate) * 100).toFixed(1);
  assert.ok(rate > 0.05 && rate < 0.80,
    "저항 절 발생률이 극단이다 — " + (rate * 100).toFixed(1) + "% (" + r.resistance.count + "/" + r.total +
    ", 하한 5%까지 " + toFloor + "pp · 상한 80%까지 " + toCeil + "pp)");
});

test("과열·저항 절은 같은 것을 말하지 않는다 — 동시 발생률이 낮다", async () => {
  const { measure } = await import("../tools/measure-sentence-signals.mjs");
  const r = measure();
  const rate = r.cooccurrence.rate;
  const margin = ((0.20 - rate) * 100).toFixed(1);
  assert.ok(rate < 0.20,
    "과열·저항 동시 발생률이 " + (rate * 100).toFixed(1) + "% 로 너무 높다(" + r.cooccurrence.count + "/" + r.total +
    ", 문턱 20%까지 " + margin + "pp) — 두 절이 항상 같이 붙으면 나눈 의미가 흐려진다");
});
