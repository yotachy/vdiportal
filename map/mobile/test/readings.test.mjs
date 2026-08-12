import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../www/readings.js");
const I = require("../www/indicators.js");
const FC = require("../../forge-core.js");

function fixture(n = 300, drift = 0.0012) {
  const price = [], candle = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + drift + Math.sin(i * 0.7) * 0.012 + Math.cos(i * 0.23) * 0.006);
    price.push(p);
    candle.push({ o, h: Math.max(o, p) * 1.006, l: Math.min(o, p) * 0.994, c: p, v: 1e6 * (1 + 0.3 * Math.sin(i * 0.4)) });
  }
  return { price, candle, volume: candle.map(c => c.v) };
}

// analyzeX 를 SHAPES 대로 부른다. indicators.js 의 callOne 은 비공개라 여기서 다시 쓴다 —
// 테스트가 구현을 통해 값을 얻으면 항등식이 된다.
function callOne(bt, d, opts) {
  const spec = I.SHAPES[bt], fn = FC[spec[0]];
  if (spec[1] === "price") return fn(d.price, opts || {});
  if (spec[1] === "priceVol") return fn(d.price, d.volume, opts || {});
  if (spec[1] === "candle") return fn(d.candle, opts || {});
  return fn(d, opts || {});
}
const ctxOf = d => ({ price: d.price, candle: d.candle });

// fixture(300) 에서 실제로 나오는 문장. 계획 단계에서 스크래치 구현을 돌려 출력을 읽고
// 확정한 값이다 — 포매터에서 유도하면 항등식이 되므로 리터럴로 박는다.
// 값이 바뀌면 그것은 회귀이거나 의도한 변경이고, 둘 다 사람이 봐야 한다.
const EXPECT_LV2 = {
  adx: "16 and easing, trend still weak, +DI ahead for 2 bars",
  stochastic: "%K 77 / %D 44, neutral, bullish cross 2 bars ago",
  fib: "Up swing, price at the swing high as support, 3 swing degrees measured",
  ichimoku: "Above the cloud, cloud bullish, tenkan crossed down 5 bars ago",
  pivot: "Between R1 144.07 and R2 145.75, levels from the previous bar",
  psar: "Dots below price at 137.26, 5.3% away",
  gann: "Below the 1×1 line at 151.18 by 4.3%, anchored at 121.94"
};

test("SAY 의 키는 SHAPES 의 키와 정확히 같다", () => {
  assert.deepEqual(Object.keys(R.SAY).sort(), Object.keys(I.SHAPES).sort());
});

test("NO_DIR 은 NO_BIAS 와 같다 — 방향을 못 묻는 둘", () => {
  assert.deepEqual(Object.keys(R.NO_DIR).sort(), I.NO_BIAS.slice().sort());
});

test("SAY 30 + NO_DIR 2 = 엔진의 indicatorCount 32", () => {
  assert.strictEqual(Object.keys(R.SAY).length + Object.keys(R.NO_DIR).length,
                     FC.indicatorCount, "머리의 '32 NODES' 가 거짓이 된다");
});

test("30종 전부 비지 않은 문장을 낸다", () => {
  const d = fixture(), ctx = ctxOf(d);
  const empty = Object.keys(R.SAY).filter(bt => {
    const s = R.say(bt, callOne(bt, d), ctx);
    return typeof s !== "string" || s.trim().length === 0;
  });
  assert.deepEqual(empty, [], "문장이 빈 지표: " + empty.join(", "));
});

// 이 저장소가 두 번 당한 자리 — *Steps() 누출, 그리고 반환 필드 안의 한국어
// (pattern.label · cycle.phaseLabel · fib.degrees[].name).
test("화면에 나가는 문장에 한글이 없다 — 전수", () => {
  const KO = /[가-힣]/;
  const d = fixture(), ctx = ctxOf(d);
  const bad = [];
  Object.keys(R.SAY).forEach(bt => {
    const s = R.say(bt, callOne(bt, d), ctx);
    if (KO.test(s)) bad.push(bt + ": " + s);
  });
  bad.push(...["trend", "phasefold"]
    .map(bt => [bt, R.say(bt, bt === "trend" ? FC.analyzeTrend(d.price, {}) : null, ctx)])
    .filter(([, s]) => KO.test(s))
    .map(([bt, s]) => bt + ": " + s));
  assert.deepEqual(bad, [], "한글이 새는 판독문: " + bad.join(" | "));
});

// 신규 상장주는 월봉 이력이 짧다. 빈 문장이 아니라 이유를 적어야 한다.
[20, 5].forEach(n => {
  test("짧은 시계열(" + n + "봉)에서도 throw 없이 문장이 나온다", () => {
    const d = fixture(n), ctx = ctxOf(d);
    Object.keys(R.SAY).forEach(bt => {
      let s;
      assert.doesNotThrow(() => { s = R.say(bt, callOne(bt, d), ctx); }, bt + " 가 throw 했다");
      assert.ok(typeof s === "string" && s.trim().length > 0, bt + " 가 빈 문장을 냈다");
    });
    // 방향 없는 둘도 같은 계약을 진다 — SAY 만 돌리면 이 경로가 안 덮인다
    assert.ok(R.say("trend", FC.analyzeTrend(d.price, {}), ctx).trim().length > 0);
    assert.ok(R.say("phasefold", null, ctx).trim().length > 0);
  });
});

test("표에 없는 blockType 은 빈 문자열", () => {
  assert.strictEqual(R.say("nosuch", {}, ctxOf(fixture())), "");
});

test("Lv2 7종이 시안 6a 어투의 문장을 낸다", () => {
  const d = fixture(), ctx = ctxOf(d);
  const got = {};
  Object.keys(EXPECT_LV2).forEach(bt => { got[bt] = R.say(bt, callOne(bt, d), ctx); });
  assert.deepEqual(got, EXPECT_LV2);
});

const EXPECT_LV3 = {
  vwap: "Price 2.2% above VWAP 141.89",
  supertrend: "Trend line below price at 140.94, 2.8% from a flip, flipped bullish 1 bar ago",
  atr: "0.9% of price per bar, volatility normal — this sizes the cone, not the direction",
  volumeprofile: "Above the value area 129.25–143.87, heaviest trade at 132.90",
  structure: "Higher highs and higher lows, no break of structure yet (swing 137.97–144.96)",
  keltner: "In the upper half of the channel 134.63–147.49",
  donchian: "73% up the 137.14–147.88 range, midline flat",
  cci: "88, inside the ±100 band, no regime bias",
  williams: "-10, overbought in its lookback range",
  aroon: "Up 36 / down 88, oscillator -52 — the low is the more recent extreme",
  mfi: "45, neutral, no regime bias on money flow"
};

test("Lv3 11종이 문장을 낸다", () => {
  const d = fixture(), ctx = ctxOf(d);
  const got = {};
  Object.keys(EXPECT_LV3).forEach(bt => { got[bt] = R.say(bt, callOne(bt, d), ctx); });
  assert.deepEqual(got, EXPECT_LV3);
});

// ATR 은 bias 가 항상 0 이다 — 변동성은 방향이 아니다. 문장이 그것을 말해야
// "왜 기여도가 0이냐"가 결함으로 오독되지 않는다.
test("ATR 판독문은 방향이 아니라는 것을 말한다", () => {
  const d = fixture();
  const s = R.say("atr", callOne("atr", d), ctxOf(d));
  assert.match(s, /not the direction/);
});

const EXPECT_LV4 = {
  elliott: "Wave count unclear, currently in wave B, no projection (67% of wave rules met)",
  smc: "2 open gaps left behind",
  cycle: "27-bar cycle, rising toward the next peak, turn in about 6 bars",
  roc: "+4.2% over the lookback, momentum positive",
  ao: "-0.6, below the zero line",
  cmf: "+0.01, no clear accumulation",
  pattern: "Head and shoulders, 73% fit, not yet confirmed"
};

test("Lv4 7종이 문장을 낸다", () => {
  const d = fixture(), ctx = ctxOf(d);
  const got = {};
  Object.keys(EXPECT_LV4).forEach(bt => { got[bt] = R.say(bt, callOne(bt, d), ctx); });
  assert.deepEqual(got, EXPECT_LV4);
});

// 반환 필드 안의 한국어를 실제로 우회했는지 — 전수 한글 테스트가 이미 잡지만,
// 이 둘은 "왜 그 필드를 안 쓰는지"가 코드에서 안 보이므로 이름으로 못박는다.
test("pattern·cycle 은 한국어 필드를 쓰지 않는다", () => {
  const d = fixture();
  const pat = callOne("pattern", d), cyc = callOne("cycle", d);
  assert.ok(/[가-힣]/.test(pat.label), "엔진이 pattern.label 을 한국어로 주는 전제가 깨졌다");
  assert.ok(/[가-힣]/.test(cyc.phaseLabel), "엔진이 cycle.phaseLabel 을 한국어로 주는 전제가 깨졌다");
  assert.ok(!R.say("pattern", pat, ctxOf(d)).includes(pat.label));
  assert.ok(!R.say("cycle", cyc, ctxOf(d)).includes(cyc.phaseLabel));
});

// "비지 않은 문자열"만 보는 [20,5]-봉 테스트는 NONE 도 통과시킨다 — 그래서 ao·roc 가
// 자리채움 배열을 진짜 판독처럼 내보내도 아무도 못 잡았다(리뷰 라운드 1, Critical 2건).
// 이 테스트는 5봉에서 정확히 어느 지표가 NONE 이고 어느 지표가 실제 판독인지를
// 이름 배열로 못박는다 — 감사(map/mobile/test 밖 스크래치 스크립트로 1·2·5·12·20·30봉
// 전수 실측) 로 확정한 값이다. 가드가 느슨해지거나(허위 REAL 로 넘어감) 지표가 늘어도
// (분류 누락) 이 테스트가 정확한 diff 로 잡는다.
const NONE_AT_5 = ["adx", "ao", "atr", "bollinger", "cycle", "gann", "ichimoku", "macd",
  "roc", "smc", "stochastic", "structure", "supertrend", "volumeprofile", "vwap"];
const REAL_AT_5 = ["aroon", "cci", "cmf", "donchian", "elliott", "fib", "keltner", "ma",
  "mfi", "pattern", "pivot", "psar", "rsi", "volume", "williams"];

test("5봉에서 NONE·실제 판독을 내는 지표 집합이 고정돼 있다", () => {
  const d = fixture(5), ctx = ctxOf(d);
  const none = [], real = [];
  Object.keys(R.SAY).forEach(bt => {
    const s = R.say(bt, callOne(bt, d), ctx);
    (s === R.NONE ? none : real).push(bt);
  });
  assert.deepEqual(none.sort(), NONE_AT_5);
  assert.deepEqual(real.sort(), REAL_AT_5);
});
