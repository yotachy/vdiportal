import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const I = require("../www/indicators.js");
const FC = require("../../forge-core.js");
const MSGraph = require("../www/graph.js");

// 결정론적 합성 시세. 사인 합성이라 Math.random 없이 매번 같은 값이 나온다.
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

// 이 파일의 핵심 계약: 인자 형태를 틀리면 예외가 아니라 bias 0 이 조용히 나온다.
// 그래서 "호출이 안 깨진다"가 아니라 "실제로 방향을 읽어낸다"를 검사한다.
test("표에 있는 지표는 전부 방향을 읽어낸다 — null 이 없다", () => {
  const d = fixture();
  const dead = Object.keys(I.SHAPES).filter(t => I.biasOf(FC, t, d, {}) === null);
  assert.deepEqual(dead, [], "방향을 못 읽은 지표: " + dead.join(", "));
});

test("캔들·거래량이 필요한 지표는 price 만으로는 0 이 된다 — 표가 있어야 하는 이유", () => {
  const d = fixture();
  const priceOnly = { price: d.price, candle: [], volume: null };
  // data 형태를 쓰는 것 중 대표 셋. 잘못된 입력에선 방향이 사라진다(예외가 아니라 0).
  ["psar", "williams", "aroon"].forEach(t => {
    const good = I.biasOf(FC, t, d, {});
    const bad = FC["analyze" + { psar: "PSAR", williams: "Williams", aroon: "Aroon" }[t]](priceOnly.price, {});
    assert.notStrictEqual(good, 0, t + " 는 정상 입력에서 방향이 있어야 한다");
    assert.strictEqual(bad.bias, 0, t + " 는 price 만 주면 0 이 된다");
  });
});

test("방향을 물을 수 없는 둘은 표에 없다", () => {
  I.NO_BIAS.forEach(t => assert.ok(!I.SHAPES[t], t + " 는 SHAPES 에 있으면 안 된다"));
  assert.strictEqual(typeof FC.analyzeTrend, "function");
  assert.strictEqual(FC.analyzeTrend(fixture().price, { shortLen: 32 }).bias, undefined,
    "analyzeTrend 가 bias 를 돌려주기 시작하면 표에 넣어야 한다");
  assert.strictEqual(FC.analyzePhasefold, undefined, "analyzePhasefold 가 생기면 표에 넣어야 한다");
});

test("32지표 그래프의 지표는 두 예외만 빼고 전부 표가 덮는다", () => {
  const g = MSGraph.full32Graph(FC);
  const types = MSGraph.indicatorTypes(g);
  const uncovered = types.filter(t => !I.SHAPES[t] && I.NO_BIAS.indexOf(t) < 0);
  assert.deepEqual(uncovered, [], "표도 예외 목록도 모르는 지표: " + uncovered.join(", "));
});

test("opposing — 중립 판정에는 반대가 없다", () => {
  const g = MSGraph.full32Graph(FC);
  assert.deepEqual(I.opposing(FC, g, fixture(), "neutral"), []);
  assert.deepEqual(I.opposing(FC, g, fixture(), null), []);
});

test("opposing — 상승 판정이면 하락 지표만, |bias| 큰 순으로", () => {
  const g = MSGraph.full32Graph(FC);
  const rows = I.opposing(FC, g, fixture(), "bull");
  assert.ok(rows.length > 0, "합성 시세에서 반대 지표가 하나도 없을 수는 없다");
  rows.forEach(r => assert.ok(r.bias < 0, r.type + " 가 상승인데 반대 목록에 있다"));
  for (let i = 1; i < rows.length; i++) {
    assert.ok(Math.abs(rows[i - 1].bias) >= Math.abs(rows[i].bias), "정렬이 깨졌다");
  }
});

test("opposing — 하락 판정이면 상승 지표만, 방향을 뒤집으면 목록도 뒤집힌다", () => {
  const g = MSGraph.full32Graph(FC), d = fixture();
  const bull = I.opposing(FC, g, d, "bull").map(r => r.type);
  const bear = I.opposing(FC, g, d, "bear").map(r => r.type);
  I.opposing(FC, g, d, "bear").forEach(r => assert.ok(r.bias > 0));
  bull.forEach(t => assert.ok(bear.indexOf(t) < 0, t + " 가 양쪽 목록에 다 있다"));
});

test("opposing — 데드존 안(|bias| ≤ EPS)은 반대로 세지 않는다", () => {
  const g = { nodes: [{ blockType: "rsi", params: {} }] };
  // bias 를 직접 심은 가짜 엔진으로 경계만 시험한다 — 실제 지표값에 의존하지 않는다.
  const tiny = { analyzeRSI: () => ({ bias: -I.EPS }) };
  const over = { analyzeRSI: () => ({ bias: -(I.EPS + 0.001) }) };
  assert.deepEqual(I.opposing(tiny, g, fixture(), "bull"), []);
  assert.strictEqual(I.opposing(over, g, fixture(), "bull").length, 1);
});

test("biasOf — 모르는 지표·없는 함수는 null(0 이 아니다)", () => {
  const d = fixture();
  assert.strictEqual(I.biasOf(FC, "nope", d, {}), null);
  assert.strictEqual(I.biasOf({}, "rsi", d, {}), null);
  assert.strictEqual(I.biasOf(FC, "toString", d, {}), null, "프로토타입 체인이 새면 안 된다");
});

test("biasOf — 분석 함수가 던져도 null 로 받는다", () => {
  const boom = { analyzeRSI: () => { throw new Error("boom"); } };
  assert.strictEqual(I.biasOf(boom, "rsi", fixture(), {}), null);
});

const R = require("../www/readings.js");
const ctxOf = d => ({ price: d.price, candle: d.candle });

test("readings() 의 bias 는 biases() 와 정확히 같다 — 방향 경로가 두 벌이 되지 않는다", () => {
  const d = fixture(), g = MSGraph.full32Graph(FC);
  const a = I.biases(FC, g, d).map(r => r.type + ":" + r.bias);
  const b = I.readings(FC, g, d, ctxOf(d)).map(r => r.type + ":" + r.bias);
  assert.deepEqual(b, a);
});

test("readings() 는 모든 항목에 비지 않은 문장을 붙인다", () => {
  const d = fixture(), g = MSGraph.full32Graph(FC);
  const rows = I.readings(FC, g, d, ctxOf(d));
  assert.ok(rows.length >= 28, "Full 그래프에서 30종 가까이 나와야 한다: " + rows.length);
  rows.forEach(r => assert.ok(r.text && r.text.trim().length > 0, r.type + " 에 문장이 없다"));
});

test("Basic 그래프에선 5종만 나온다", () => {
  const d = fixture(), g = MSGraph.basicGraph(FC);
  const types = I.readings(FC, g, d, ctxOf(d)).map(r => r.type).sort();
  assert.deepEqual(types, ["bollinger", "ma", "macd", "rsi", "volume"]);
});

test("noDirRows() 는 bias null 인 2행 — 0(중립)과 구분한다", () => {
  const d = fixture();
  const rows = I.noDirRows(FC, d, ctxOf(d));
  assert.deepEqual(rows.map(r => r.type), ["trend", "phasefold"]);
  rows.forEach(r => {
    assert.strictEqual(r.bias, null, r.type + " 의 bias 는 null 이어야 한다");
    assert.ok(r.text && r.text.trim().length > 0);
  });
});

test("opposing() 은 종전과 같은 목록을 내고 문장이 붙는다", () => {
  const d = fixture(), g = MSGraph.full32Graph(FC);
  ["bull", "bear"].forEach(regime => {
    const rows = I.opposing(FC, g, d, regime);
    const want = regime === "bull" ? -1 : 1;
    rows.forEach(r => {
      assert.ok(Math.abs(r.bias) > I.EPS, r.type + " 가 데드존 안에 있다");
      assert.strictEqual(r.bias > 0 ? 1 : -1, want, r.type + " 의 방향이 틀렸다");
      assert.ok(r.text && r.text.trim().length > 0, r.type + " 에 문장이 없다");
    });
    // |bias| 내림차순
    for (let i = 1; i < rows.length; i++)
      assert.ok(Math.abs(rows[i - 1].bias) >= Math.abs(rows[i].bias), "정렬이 깨졌다");
  });
  assert.deepEqual(I.opposing(FC, g, d, "flat"), [], "중립엔 반대가 정의되지 않는다");
});

// rows 재사용이 이 태스크의 핵심이다(Task 6 이 readings() 결과를 넘겨 재계산을 없앤다) —
// 그런데 커밋된 스위트엔 5번째 인자로 opposing() 을 부르는 테스트가 하나도 없었다
// (리뷰 라운드 1, Important). 아래 세 테스트가 그 경로를 덮는다.

test("opposing(..., rows) 는 rows 없이 부른 것과 완전히 같다 — text 포함(재사용 경로의 동등성)", () => {
  const d = fixture(), g = MSGraph.full32Graph(FC);
  ["bull", "bear"].forEach(regime => {
    const rows = I.readings(FC, g, d, ctxOf(d));
    const withRows = I.opposing(FC, g, d, regime, rows);
    const withoutRows = I.opposing(FC, g, d, regime);
    // 두 경로는 type·bias·text 전부 구별 불가능해야 한다. opposing() 이 rows 없이 스스로
    // 계산할 때 ctx 로 data 를 넘기기 전(리뷰 라운드 2, Critical)에는 null 을 넘겨서
    // aroon·ao 같은 ctx 게이트 판독이 이 경로에서만 "읽지 못했다"고 거짓말했다 —
    // 그래서 이 assert 가 한 번 narrowing 됐었다. data 가 {price, candle} 을 이미 갖고
    // 있으므로 ctx 로 그대로 넘기면 두 경로가 진짜로 같아진다.
    assert.deepEqual(withRows, withoutRows, regime + " 에서 rows 유무 결과가 다르다(text 포함)");
  });
});

test("opposing() 의 rows 인자 — 빈 배열은 그대로 빈 결과, null 은 생략과 같다", () => {
  const d = fixture(), g = MSGraph.full32Graph(FC);
  // rows=[] 는 "명시적으로 반대 후보가 없다"는 뜻이지 "안 줬다"가 아니다 — src = rows || readings(...)
  // 가 빈 배열([]는 truthy)에서 재계산으로 빠지지 않는다는 것을 못박는다. 나중에 누가
  // `rows ? … : …` 나 `rows && rows.length` 로 리팩터링하면 이 테스트가 깨진다.
  assert.deepEqual(I.opposing(FC, g, d, "bull", []), [], "rows=[] 가 재계산으로 폴백하면 안 된다");
  const withoutArg = I.opposing(FC, g, d, "bull");
  const withNull = I.opposing(FC, g, d, "bull", null);
  assert.deepEqual(withNull, withoutArg, "rows=null 은 생략과 같아야 한다(재계산으로 폴백)");
});

// FC 의 analyzeX 함수를 SHAPES 값에서 이름을 뽑아 카운팅 shim 으로 감싼다 —
// 지표가 늘어도(SHAPES 갱신) 이 래퍼는 하드코딩 없이 그대로 맞는다.
function wrapCounting(fc) {
  const counts = {};
  const wrapped = Object.assign({}, fc);
  const fnNames = Array.from(new Set(Object.values(I.SHAPES).map(s => s[0])));
  fnNames.forEach(name => {
    counts[name] = 0;
    const orig = fc[name];
    wrapped[name] = function () { counts[name]++; return orig.apply(fc, arguments); };
  });
  return { wrapped, counts };
}

test("readings() + opposing(rows) — 지표당 analyzeX 정확히 1회(rows 재사용 계약)", () => {
  const d = fixture(), g = MSGraph.full32Graph(FC);
  // 기대 횟수는 구현이 보고하는 숫자가 아니라 그래프의 노드 목록에서 직접 뽑는다.
  const graphTypes = MSGraph.indicatorTypes(g).filter(t => I.SHAPES[t]);
  assert.ok(graphTypes.length >= 28, "그래프에 지표가 30종 가까이 있어야 대조가 의미 있다");
  const { wrapped, counts } = wrapCounting(FC);
  const rows = I.readings(wrapped, g, d, ctxOf(d));
  I.opposing(wrapped, g, d, "bull", rows);
  graphTypes.forEach(bt => {
    const fnName = I.SHAPES[bt][0];
    assert.strictEqual(counts[fnName], 1, bt + "(" + fnName + ") 가 정확히 1회 불려야 한다 — 실제 " + counts[fnName] + "회");
  });
});

test("readings() + opposing() (rows 없이) — 지표당 analyzeX 2회, rows 가 없앤 재계산의 크기", () => {
  const d = fixture(), g = MSGraph.full32Graph(FC);
  const graphTypes = MSGraph.indicatorTypes(g).filter(t => I.SHAPES[t]);
  const { wrapped, counts } = wrapCounting(FC);
  I.readings(wrapped, g, d, ctxOf(d));
  I.opposing(wrapped, g, d, "bull");
  graphTypes.forEach(bt => {
    const fnName = I.SHAPES[bt][0];
    assert.strictEqual(counts[fnName], 2, bt + "(" + fnName + ") 는 rows 없이 2회 불려야 한다 — 실제 " + counts[fnName] + "회");
  });
});
