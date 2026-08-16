import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const R = require("../www/readings.js");
const I = require("../www/indicators.js");
const Str = require("../www/strings.js");
const MSGraph = require("../www/graph.js");
const FC = require("../../forge-core.js");
const __dirname = dirname(fileURLToPath(import.meta.url));

// vol=false 는 **거래량 없는 종목**이다. api.js 는 피드가 거래량을 빼면 봉의 v 를 undefined 로 둔다.
function fixture(n = 300, drift = 0.0012, vol = true) {
  const price = [], candle = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + drift + Math.sin(i * 0.7) * 0.012 + Math.cos(i * 0.23) * 0.006);
    price.push(p);
    const c = { o, h: Math.max(o, p) * 1.006, l: Math.min(o, p) * 0.994, c: p };
    if (vol) c.v = 1e6 * (1 + 0.3 * Math.sin(i * 0.4));
    candle.push(c);
  }
  return { price, candle, volume: vol ? candle.map(c => c.v) : undefined };
}

// ── 화면이 실제로 도는 경로 ──────────────────────────────────────────────
// EXPECT 표가 opts={} 로 엔진을 부르면 **화면과 다른 것을 고정한다**. 실제로는
// MSIndicators.readings() 가 Full 그래프 노드의 params 를 analyzeX 에도, say() 에도 넘긴다.
// 그 차이 때문에 `swing:3` 결함(structure 침묵·elliott 퇴화)이 656건을 통과했다.
// 아래 두 함수가 표를 **생산 경로 위에** 올려 놓는다.
const GRAPH = MSGraph.full32Graph(FC);
function paramsOf(bt) {
  const n = (GRAPH.nodes || []).find(x => x.blockType === bt);
  return (n && n.params) || {};
}
// indicators.js 의 callOne 은 비공개라 여기서 다시 쓴다 — 구현을 통해 값을 얻으면 항등식이 된다.
function callOne(bt, d, opts) {
  const spec = I.SHAPES[bt], fn = FC[spec[0]];
  if (spec[1] === "price") return fn(d.price, opts || {});
  if (spec[1] === "priceVol") return fn(d.price, d.volume || null, opts || {});
  if (spec[1] === "candle") return fn(d.candle, opts || {});
  return fn(d, opts || {});
}
// 그래프 노드의 params 로 부르고, 같은 params 를 say() 에도 넘긴다(= readings() 가 하는 일).
function sayProd(bt, d, ctx) {
  const p = paramsOf(bt);
  let r;
  try { r = callOne(bt, d, p); } catch (e) { r = null; }
  return R.say(bt, r, ctx, p);
}
const ctxOf = d => I.ctxFrom(d);

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

// 거절문은 화면에 그대로 나가는 문자열이다. R.NONE 끼리 비교하는 테스트만 있으면
// 이 문구가 strings.js 밖에서 다시 하드코딩되며 조용히 갈라져도 초록이 된다 — 리터럴로
// 못박는다(값 자체는 태스크 8 에서 한국어로 번역됐다 — §20a 의 "읽을 만큼 큰 스윙이
// 없습니다" 문구와 rdNoSwings 가 여기서 정확히 일치해야 한다).
test("거절문 3종의 문구가 고정돼 있다", () => {
  assert.strictEqual(R.NONE, "읽기에 봉이 부족합니다");
  assert.strictEqual(R.NO_VOL, "이 종목은 거래량 데이터가 없습니다");
  assert.strictEqual(R.NO_SWINGS, "읽을 만큼 큰 스윙이 없습니다");
  // strings.js 단일 출처를 실제로 경유하는지 — 리터럴 복제가 다시 생기면 여기서 갈린다
  assert.strictEqual(R.NONE, Str.t.rdNotEnoughBars);
  assert.strictEqual(R.NO_VOL, Str.t.rdNoVolume);
  assert.strictEqual(R.NO_SWINGS, Str.t.rdNoSwings);
  assert.deepEqual(R.REFUSALS.slice().sort(), [R.NONE, R.NO_SWINGS, R.NO_VOL].sort());
  assert.ok(R.isRefusal(R.NO_VOL) && !R.isRefusal("Aligned up"));
});

// REASONING 의 "N with a direction" 과 AGAINST 의 목록·분모가 이 술어 하나를 공유한다.
// 두 섹션이 각자 "읽었나"를 판정하면 갈린다 — 이 저장소가 어휘 맵에서 이미 당한 자리다.
test("voiced() — 거절한 행만 걷어내고 순서는 그대로다", () => {
  const rows = [{ type: "ma", text: "Aligned up" }, { type: "mfi", text: R.NO_VOL },
                { type: "cci", text: "88, inside the ±100 band" },
                { type: "structure", text: R.NO_SWINGS }, { type: "adx", text: R.NONE }];
  assert.deepEqual(R.voiced(rows).map(r => r.type), ["ma", "cci"]);
  assert.deepEqual(R.voiced([]), []);
  assert.deepEqual(R.voiced(null), []);
  // 전부 거절이면 빈 배열이다 — opposing 이 이것을 "안 줬다"로 오해하면 안 된다(재계산 폴백)
  assert.deepEqual(R.voiced([{ type: "mfi", text: R.NO_VOL }]), []);
});

test("30종 전부 비지 않은 문장을 낸다", () => {
  const d = fixture(), ctx = ctxOf(d);
  const empty = Object.keys(R.SAY).filter(bt => {
    const s = sayProd(bt, d, ctx);
    return typeof s !== "string" || s.trim().length === 0;
  });
  assert.deepEqual(empty, [], "문장이 빈 지표: " + empty.join(", "));
});

// 이 저장소가 두 번 당한 자리 — *Steps() 누출, 그리고 반환 필드 안의 한국어(pattern.label·
// cycle.phaseLabel). 그 위험은 위 "pattern·cycle 은 한국어 필드를 쓰지 않는다"가 표식
// 치환으로 구조적으로 잡는다. 이 테스트는 태스크 8 로 방향이 뒤집혔다 — 예전엔 "한글이
// 새면 안 된다"(판독문이 전부 영문이던 시절), 지금은 "한글이 없으면 안 된다"(번역 완결성).
// strings.test.mjs 의 소스 리터럴 스캔과 반대쪽(실제 fixture 로 낸 런타임 출력)에서 같은
// 것을 본다 — 소스 스캔이 못 보는 조합(예: 값에 따라 갈리는 분기)까지 여기서 덮는다.
test("화면에 나가는 문장은 전수 한글이다 — 거절문 포함", () => {
  const KO = /[가-힣]/;
  const d = fixture(), ctx = ctxOf(d);
  const bad = [];
  Object.keys(R.SAY).forEach(bt => {
    const s = sayProd(bt, d, ctx);
    if (!KO.test(s)) bad.push(bt + ": " + s);
  });
  ["trend", "phasefold"].forEach(bt => {
    const s = R.say(bt, bt === "trend" ? FC.analyzeTrend(d.price, {}) : null, ctx, {});
    if (!KO.test(s)) bad.push(bt + ": " + s);
  });
  assert.deepEqual(bad, [], "영어로 남은 판독문: " + bad.join(" | "));
});

// 신규 상장주는 월봉 이력이 짧다. 빈 문장이 아니라 이유를 적어야 한다.
[20, 5].forEach(n => {
  test("짧은 시계열(" + n + "봉)에서도 throw 없이 문장이 나온다", () => {
    const d = fixture(n), ctx = ctxOf(d);
    Object.keys(R.SAY).forEach(bt => {
      let s;
      assert.doesNotThrow(() => { s = sayProd(bt, d, ctx); }, bt + " 가 throw 했다");
      assert.ok(typeof s === "string" && s.trim().length > 0, bt + " 가 빈 문장을 냈다");
    });
    // 방향 없는 둘도 같은 계약을 진다 — SAY 만 돌리면 이 경로가 안 덮인다
    assert.ok(R.say("trend", FC.analyzeTrend(d.price, {}), ctx, {}).trim().length > 0);
    assert.ok(R.say("phasefold", null, ctx, {}).trim().length > 0);
  });
});

test("표에 없는 blockType 은 빈 문자열", () => {
  assert.strictEqual(R.say("nosuch", {}, ctxOf(fixture()), {}), "");
});

// ── 문장 고정 표(생산 경로) ─────────────────────────────────────────────
// fixture(300) 을 **Full 그래프의 노드 params 로** 돌려 나오는 문장. 스크래치 스크립트로 출력을
// 읽어 한 줄씩 사실인지 확인한 뒤 리터럴로 박았다 — 포매터에서 유도하면 항등식이 된다.
// 값이 바뀌면 그것은 회귀이거나 의도한 변경이고, 둘 다 사람이 봐야 한다.

// Lv1 5종. 종전엔 "비지 않은 문자열"만 덮여 있어 golden↔dead·above↔below·rising↔falling 을
// 뒤집어도 656건이 전부 초록이었다(리뷰 라운드 3, Important). 값은 태스크 8 에서 한국어로
// 번역됐다 — 문장 모양(콤마 위치·값 순서)은 그대로, 어휘만 옮겼다.
const EXPECT_LV1 = {
  ma: "정배열, 교차 없음",
  macd: "히스토그램 +0.1, 확대, 골든크로스 이번 봉",
  rsi: "62, 중립, 50선 위",
  bollinger: "중단, %B 0.78, 중심선 상승",
  volume: "보통 거래량, 평균 대비 1.03배, 추세 동반, 상승 다이버전스"
};

const EXPECT_LV2 = {
  adx: "16, 완화 중, 추세 약함, +DI가 2봉째 우위",
  stochastic: "%K 77 / %D 44, 중립, 상승 교차 2봉 전",
  fib: "상승 스윙, 스윙 고점 부근 지지, 되돌림 척도 3종 측정",
  ichimoku: "구름 위, 구름대 상승, 전환선이 아래로 교차 5봉 전",
  pivot: "저항1(144.07)와 저항2(145.75) 사이, 전 봉 기준 레벨",
  psar: "점이 가격 아래, 137.26, 5.3% 이격",
  gann: "1×1선(151.18) 아래, 4.3% 이격, 기준점 121.94"
};

const EXPECT_LV3 = {
  vwap: "가격이 VWAP(141.89) 위 2.2%",
  supertrend: "추세선이 가격 아래, 140.94, 전환까지 2.8%, 상승 전환 1봉 전",
  atr: "봉당 가격 대비 0.9%, 변동성 보통 — 콘의 폭을 정할 뿐 방향은 아님",
  volumeprofile: "매물대 위, 129.25–143.87, 최다 거래가 132.90",
  // 그래프가 넘기는 swing:3(=300%) 은 문턱을 넘는 스윙을 하나도 만들지 않는다. 봉은 300개이므로
  // "봉이 모자라다"가 아니라 "그만한 스윙이 없다"가 사실이다(백로그의 이월 항목).
  structure: "읽을 만큼 큰 스윙이 없습니다",
  keltner: "채널 상단 절반, 134.63–147.49",
  donchian: "137.14–147.88 구간의 73% 지점, 중심선 평평",
  cci: "88, ±100 밴드 안, 국면 편향 없음",
  williams: "-10, 조회 구간 내 과매수",
  aroon: "상승 36 / 하락 88, 오실레이터 -52 — 더 최근 극값은 저점",
  mfi: "45, 중립, 자금흐름 국면 편향 없음"
};

const EXPECT_LV4 = {
  // swing:3 으로 스윙이 2개뿐이라 카운트가 1파에서 멈춘다. 유효도 0% 는 그 사실의 정직한 표기다
  // (예전 표는 opts={} 로 불러 "wave B · 67%" 를 고정하고 있었다 — 화면엔 그 문장이 나온 적이 없다).
  elliott: "파동 불명확, 현재 파동 1, 예상 목표 없음 (파동 유효도 0%)",
  smc: "미충족 갭 2개 남음",
  cycle: "27봉 주기, 다음 고점을 향해 상승 중, 약 6봉 후 전환",
  roc: "조회 구간 대비 +4.2%, 모멘텀 양(+)",
  ao: "-0.6, 0선 아래",
  cmf: "+0.01, 뚜렷한 매집 없음",
  pattern: "헤드앤숄더, 적합도 73%, 아직 미확인"
};

// 방향을 못 묻는 둘도 문장은 화면에 나간다 — 지금까지 리터럴 고정이 전혀 없었다.
const EXPECT_NODIR = {
  trend: "상승 채널, 300봉 구간, 가격은 상단 절반",
  phasefold: "엔진이 노드를 합성할 때만 쓰인다 — 단독 판독 없음"
};

[["Lv1 5종", EXPECT_LV1], ["Lv2 7종", EXPECT_LV2], ["Lv3 11종", EXPECT_LV3], ["Lv4 7종", EXPECT_LV4]]
  .forEach(([name, table]) => {
    test(name + "이 생산 경로(그래프 params)에서 내는 문장", () => {
      const d = fixture(), ctx = ctxOf(d);
      const got = {};
      Object.keys(table).forEach(bt => { got[bt] = sayProd(bt, d, ctx); });
      assert.deepEqual(got, table);
    });
  });

test("방향 없는 둘의 문장도 리터럴로 고정한다", () => {
  const d = fixture(), ctx = ctxOf(d);
  assert.strictEqual(R.say("trend", FC.analyzeTrend(d.price, {}), ctx, {}), EXPECT_NODIR.trend);
  assert.strictEqual(R.say("phasefold", null, ctx, {}), EXPECT_NODIR.phasefold);
});

// ATR 은 bias 가 항상 0 이다 — 변동성은 방향이 아니다. 문장이 그것을 말해야
// "왜 기여도가 0이냐"가 결함으로 오독되지 않는다.
test("ATR 판독문은 방향이 아니라는 것을 말한다", () => {
  const d = fixture();
  assert.match(sayProd("atr", d, ctxOf(d)), /방향은 아님/);
});

// ── 거래량 없는 종목 ────────────────────────────────────────────────────
// 엔진은 거래량이 없으면 조용히 대체한다 — analyzeVolume/MFI/CMF 는 synthVolume(가격에서 만든
// 가짜 거래량), VWAP/VolumeProfile 은 모든 봉 가중 1. 그 값으로 문장을 쓰면 앱이 **없는 데이터를
// 본 것처럼** 말한다(리뷰 라운드 3, Critical). 다섯 줄 전부 거절문이어야 한다.
const VOL_READINGS = ["volume", "vwap", "volumeprofile", "mfi", "cmf"];

test("거래량 없는 종목 — 거래량 5종은 숫자 대신 거절문을 낸다", () => {
  const d = fixture(300, 0.0012, false), ctx = ctxOf(d);
  assert.strictEqual(ctx.hasVolume, false, "픽스처에 거래량이 남아 있으면 이 테스트는 아무것도 안 본다");
  const got = {};
  VOL_READINGS.forEach(bt => { got[bt] = sayProd(bt, d, ctx); });
  assert.deepEqual(got, {
    volume: R.NO_VOL, vwap: R.NO_VOL, volumeprofile: R.NO_VOL, mfi: R.NO_VOL, cmf: R.NO_VOL
  });
});

test("거래량 없는 종목 — 조작된 수치가 문장에 단 하나도 안 남는다", () => {
  const d = fixture(300, 0.0012, false), ctx = ctxOf(d);
  VOL_READINGS.forEach(bt => {
    const s = sayProd(bt, d, ctx);
    assert.doesNotMatch(s, /value area|VWAP|x average|money flow|accumulation|distribution/,
      bt + " 가 대체 입력으로 만든 사실을 말한다: " + s);
    assert.doesNotMatch(s, /\d/, bt + " 가 거래량 없이 숫자를 냈다: " + s);
  });
});

test("거래량 없는 종목 — 거래량과 무관한 25종은 그대로 말한다", () => {
  const d = fixture(300, 0.0012, false), ctx = ctxOf(d);
  const withVol = fixture(), wCtx = ctxOf(withVol);
  Object.keys(R.SAY).forEach(bt => {
    if (VOL_READINGS.indexOf(bt) >= 0) return;
    assert.strictEqual(sayProd(bt, d, ctx), sayProd(bt, withVol, wCtx),
      bt + " 가 거래량 유무로 달라진다 — 거래량을 안 보는 지표다");
  });
});

// ── 가드 문턱 ───────────────────────────────────────────────────────────
// 종전 테스트는 5·20·300봉만 봤다. 열 개 지표의 NONE→실판독 전환이 6~19봉 사이에 있어
// roc(13)·ao(7) 의 문턱을 **어느 값으로 바꿔도** 656건이 초록이었다(리뷰 라운드 3, Important).
// 아래 표는 구현 상수가 아니라 2~60봉 전수 실측으로 뽑은 **전환점**이다(각 지표는 단조:
// 한 번 말하기 시작하면 그 위로 계속 말한다 — 측정 시 확인).
const FIRST_REAL = {
  ma: 2, rsi: 2, volume: 2, fib: 2, pivot: 2, keltner: 2, donchian: 2, cci: 2,
  williams: 2, aroon: 2, mfi: 2, elliott: 2, cmf: 2,
  psar: 3, ao: 7, volumeprofile: 10, supertrend: 12, roc: 13, macd: 14, atr: 16,
  stochastic: 20, ichimoku: 20, vwap: 20, bollinger: 21, gann: 24, smc: 24,
  adx: 30, cycle: 30, pattern: 30,
  // structure 는 그래프의 swing:3 때문에 **어느 길이에서도** 말하지 못한다(이월된 결함).
  // null 은 "전환점 없음"이고, 값이 생기면 그 결함이 고쳐졌다는 뜻이므로 사람이 봐야 한다.
  structure: null
};

test("가드 문턱 — 지표마다 말하기 시작하는 봉 수가 고정돼 있다", () => {
  assert.deepEqual(Object.keys(FIRST_REAL).sort(), Object.keys(R.SAY).sort(),
    "지표가 늘거나 줄면 전환점 표도 같이 움직여야 한다");
  Object.keys(FIRST_REAL).forEach(bt => {
    const k = FIRST_REAL[bt];
    if (k == null) {
      for (const n of [2, 12, 30, 120, 300]) {
        const d = fixture(n);
        assert.ok(R.isRefusal(sayProd(bt, d, ctxOf(d))), bt + " 가 " + n + "봉에서 말하기 시작했다");
      }
      return;
    }
    const at = fixture(k);
    assert.ok(!R.isRefusal(sayProd(bt, at, ctxOf(at))),
      bt + " 는 " + k + "봉에서 실제 판독을 내야 한다");
    // k=2 는 측정 하한(1봉은 시계열이 아니다) — 그 아래를 물을 자리가 없다.
    if (k <= 2) return;
    const below = fixture(k - 1);
    assert.ok(R.isRefusal(sayProd(bt, below, ctxOf(below))),
      bt + " 는 " + (k - 1) + "봉에서 거절해야 한다 — 가드가 느슨해졌다");
  });
});

// 위 표는 문턱을 **못박기만** 한다(느슨해지면 잡힌다). 아래는 그 문턱이 옳은지를 엔진 내부를
// 몰라도 검사한다: 판독을 내겠다고 한 봉 수에서 **문장이 데이터에 따라 실제로 변해야 한다**.
// 자리채움 배열을 통과시킨 가드(aroon·ao·roc — 세 번 재발)는 전부 여기서 상수 문장으로 드러난다.
// 예외는 하나뿐이고 이름으로 못박는다 — pattern 의 "패턴 없음"은 30봉에서 **찾아본 뒤** 하는 말이라
// 여러 계열에서 같은 문장이 나오는 것이 정상이다.
const CONSTANT_AT_THRESHOLD = { pattern: "구간 내 완성된 차트 패턴 없음" };

test("문턱에서 낸 판독은 데이터에 따라 변한다 — 자리채움을 판독으로 내보내지 않는다", () => {
  function seeded(n, seed) {
    let s = seed, p = 100;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const price = [], candle = [];
    for (let i = 0; i < n; i++) {
      const o = p; p *= 1 + (rnd() - 0.45) * 0.05; price.push(p);
      candle.push({ o, h: Math.max(o, p) * 1.01, l: Math.min(o, p) * 0.99, c: p, v: 1e6 * (1 + rnd()) });
    }
    return { price, candle, volume: candle.map(c => c.v) };
  }
  Object.keys(FIRST_REAL).forEach(bt => {
    const k = FIRST_REAL[bt];
    if (k == null) return;
    const seen = new Set();
    for (let seed = 1; seed <= 8; seed++) {
      const d = seeded(k, seed);
      seen.add(sayProd(bt, d, ctxOf(d)));
    }
    if (Object.prototype.hasOwnProperty.call(CONSTANT_AT_THRESHOLD, bt)) {
      assert.deepEqual([...seen], [CONSTANT_AT_THRESHOLD[bt]],
        bt + " 의 상수 문장이 바뀌었다 — 허용 목록을 다시 봐야 한다");
      return;
    }
    assert.ok(seen.size > 1,
      bt + " 가 " + k + "봉에서 8개 계열 전부에 같은 문장을 냈다 — 데이터가 아니라 자리채움을 읽고 있다: "
      + [...seen][0]);
  });
});

// ── 개별 결함 회귀 ──────────────────────────────────────────────────────

// analyzeSMC 는 미충족 FVG 를 slice(-5) 로 잘라서 준다. 그 수를 그대로 적으면 포화값이
// 실제 개수처럼 읽힌다(220봉 무작위 300계열 중 40계열이 상한에 걸렸다).
test("smc — 엔진 상한에 걸린 개수는 '개 이상' 으로 적는다", () => {
  const fvgs = n => Array.from({ length: n }, () => ({ type: "bull", lo: 90, hi: 95 }));
  assert.strictEqual(R.say("smc", { ok: true, fvgs: fvgs(4), obs: [], last: 100 }, {}, {}),
    "미충족 갭 4개 남음");
  assert.strictEqual(R.say("smc", { ok: true, fvgs: fvgs(5), obs: [], last: 100 }, {}, {}),
    "미충족 갭 5개 이상 남음");
  assert.strictEqual(R.say("smc", { ok: true, fvgs: [], obs: fvgs(4), last: 100 }, {}, {}),
    "미완화 오더블록 4개 이상 남음");
});

// 엔진의 rma() 는 앞 period 봉을 계산하지 않고 0 으로 둔다. 0 >= 0 이 참이라 상승 분기의
// 선행 카운트가 미계산 구간을 통과해 220봉짜리에서 "219 bars" 가 나왔다(실계산은 206봉).
test("adx — +DI 선행 카운트가 워밍업 구간을 통과하지 않는다", () => {
  const price = []; let p = 100;
  for (let i = 0; i < 220; i++) { p *= 1.004; price.push(p); }
  const a = FC.analyzeADX(price, { period: 14 });
  assert.strictEqual(a.plusDI.findIndex(v => v > 0), 14, "엔진의 워밍업 길이 전제가 깨졌다");
  const s = R.say("adx", a, { price }, { period: 14 });
  assert.match(s, /\+DI가 206봉째 우위$/, s);
  // 노드가 다른 period 를 들고 있으면 문턱도 따라 움직여야 한다(say 가 params 를 받는다)
  const a30 = FC.analyzeADX(price, { period: 30 });
  assert.match(R.say("adx", a30, { price }, { period: 30 }), /\+DI가 190봉째 우위$/);
});

test("adx — 5봉 전이 미계산 구간이면 rising/easing 을 말하지 않는다", () => {
  const price = []; let p = 100;
  for (let i = 0; i < 31; i++) { p *= 1 + Math.sin(i) * 0.01; price.push(p); }
  const a = FC.analyzeADX(price, { period: 14 });
  const s = R.say("adx", a, { price }, { period: 14 });
  assert.doesNotMatch(s, /상승 중|완화 중/, "adx[li-5] 가 0(미계산)인데 방향을 말했다: " + s);
  assert.match(s, /추세/);
});

// r.channel 은 장기창 전용 적합인데 r.dominant 는 따로 정해진다. 두 값을 섞으면
// "Falling channel over 40 bars" 가 오른 40봉을 가리킨다(무작위 220봉 300계열에서 부호 불일치 58건).
test("trend — 방향·봉 수·기준선이 전부 같은 창에서 나온다", () => {
  function rnd(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
  let domNotLong = 0, signSplit = 0;
  for (let t = 0; t < 60; t++) {
    const r = rnd(t + 1), price = []; let p = 100;
    for (let i = 0; i < 220; i++) { p *= 1 + (r() - 0.48) * 0.03; price.push(p); }
    const tr = FC.analyzeTrend(price, {});
    const w = tr.windows[tr.dominant] || tr.windows.long;
    if (tr.dominant !== "long") domNotLong++;
    if (w && tr.channel && Math.sign(w.slopeRaw) !== Math.sign(tr.channel.slopeRaw)) signSplit++;
    const s = R.say("trend", tr, { price }, {});
    const want = w.slopeRaw > 0 ? "상승" : w.slopeRaw < 0 ? "하락" : "횡보";
    assert.ok(s.indexOf(want) === 0, "방향이 지배창 기울기와 다르다: " + s);
    assert.ok(s.indexOf(w.m + "봉 구간,") > 0, "봉 수가 지배창과 다르다: " + s);
    const line = w.bRaw + w.slopeRaw * (w.m - 1);
    const half = price[price.length - 1] >= line ? "상단" : "하단";
    assert.ok(s.indexOf(half + " 절반") > 0, "기준선이 그 창의 적합선이 아니다: " + s);
  }
  assert.ok(domNotLong > 0 && signSplit > 0,
    "두 창이 갈리는 계열이 표본에 없으면 이 테스트는 아무것도 안 본다");
});

// cycle: scanPeriod 는 자료가 모자라면 strength 0 · method "insufficient" 를 내면서
// opts.pmin 을 period 로 되돌려 준다 — !r.period 가드는 절대 발동하지 않는다.
test("cycle — 엔진이 pmin 을 되돌려 준 가짜 주기를 판독하지 않는다", () => {
  const d = fixture(26);   // P>=24 라 analyzeCycle 은 통과, 그러나 2.5주기가 안 나온다
  const raw = FC.analyzeCycle(d.price, paramsOf("cycle"));
  assert.ok(raw.period > 2 && raw.strength === 0, "엔진의 실패 신호 전제가 깨졌다");
  assert.strictEqual(sayProd("cycle", d, ctxOf(d)), R.NONE);
});

// pattern: detectPatterns 의 하드 플로어는 P<30 — 그 아래는 탐지를 시작조차 안 한다.
// "감지된 패턴 없음"은 **본 뒤에** 할 수 있는 말이다.
test("pattern — 엔진이 안 본 구간을 '패턴 없음'이라고 말하지 않는다", () => {
  const d = fixture(29);
  assert.strictEqual(FC.analyzePattern(d, paramsOf("pattern")).pattern, "none");
  assert.strictEqual(sayProd("pattern", d, ctxOf(d)), R.NONE);
  const d30 = fixture(30);
  assert.notStrictEqual(sayProd("pattern", d30, ctxOf(d30)), R.NONE);
});

// cmf: _cmfRaw 는 캔들이 없어도 길이 P 짜리 전부 0 배열을 준다 — has(series) 로는 못 잡는다.
test("cmf — 캔들이 없으면 0 배열을 판독으로 내보내지 않는다", () => {
  const d = fixture();
  const noCandle = { price: d.price, candle: [], volume: d.volume };
  const raw = FC.analyzeCMF(noCandle, {});
  assert.ok(raw.series.length === d.price.length && raw.series.every(v => v === 0),
    "엔진이 캔들 없이 0 배열을 준다는 전제가 깨졌다");
  assert.strictEqual(R.say("cmf", raw, I.ctxFrom(noCandle), {}), R.NONE);
});

// elliott: rules.score 는 (검사 규칙 중 통과 비율) × (파동 완성도)다. "N% of wave rules met" 는
// 카운트가 미완일 때 실제보다 **낮게** 말한다(규칙 2/2 통과인데 60%).
test("elliott — score 를 '충족한 규칙 비율'이라고 부르지 않는다", () => {
  const r = { waves: [{ label: "3" }], structure: "impulse_up", current: { label: "3" },
              next: null, rules: { r1: true, r2: true, r3: false, score: (2 / 2) * (3 / 5) } };
  const s = R.say("elliott", r, {}, {});
  assert.match(s, /파동 유효도 60%/);
  assert.doesNotMatch(s, /규칙/, "규칙 2/2 통과를 '규칙 충족' 식으로 말하면 거짓이다 — 유효도와는 다른 수다");
});

// 반환 필드 안의 한국어를 실제로 우회했는지 — 전수 한글 테스트가 이미 잡지만,
// 이 둘은 "왜 그 필드를 안 쓰는지"가 코드에서 안 보이므로 이름으로 못박는다.
test("pattern·cycle 은 한국어 필드를 쓰지 않는다", () => {
  const d = fixture(), ctx = ctxOf(d);
  const pat = callOne("pattern", d, paramsOf("pattern")), cyc = callOne("cycle", d, paramsOf("cycle"));
  assert.ok(/[가-힣]/.test(pat.label), "엔진이 pattern.label 을 한국어로 주는 전제가 깨졌다");
  assert.ok(/[가-힣]/.test(cyc.phaseLabel), "엔진이 cycle.phaseLabel 을 한국어로 주는 전제가 깨졌다");
  // 태스크 8 이후 우리 쪽 표기(PATTERN_NAME)도 한국어라 pat.label 과 우연히 같은 문자열
  // ("헤드앤숄더")이 될 수 있다 — "문장에 그 값이 포함되는가"만으로는 더 이상 "그 필드를
  // 실제로 읽었는가"를 구분 못한다(같은 문자열이 둘 다에서 나오면 어느 쪽이 출처인지 이
  // 비교만으로는 안 갈린다). 필드 값을 표식으로 바꿔치기해 구조적으로 본다 — 표식이 안
  // 보이면 그 필드를 안 읽은 것이다(우연이 아니라 근거로 확인한다).
  const patMarked = Object.assign({}, pat, { label: "MARKER_PATTERN_LABEL" });
  const cycMarked = Object.assign({}, cyc, { phaseLabel: "MARKER_PHASE_LABEL" });
  assert.ok(!R.say("pattern", patMarked, ctx, paramsOf("pattern")).includes("MARKER_PATTERN_LABEL"));
  assert.ok(!R.say("cycle", cycMarked, ctx, paramsOf("cycle")).includes("MARKER_PHASE_LABEL"));
});

// REGIME 맵에 없는 값이 오면 종전엔 문자열 "undefined" 가 화면에 나갔다.
test("cci·mfi — 모르는 regime 은 절을 통째로 뺀다('undefined' 금지)", () => {
  const cci = R.say("cci", { series: [1], last: 12, regime: 7 }, {}, {});
  const mfi = R.say("mfi", { series: [1], last: 44, regime: 7 }, { hasVolume: true }, {});
  [cci, mfi].forEach(s => assert.doesNotMatch(s, /undefined/, s));
  assert.strictEqual(cci, "12, ±100 밴드 안");
  assert.strictEqual(mfi, "44, 중립");
});

// REASONING 행 정렬 규칙 — |bias| 내림차순, 방향 없는 둘은 항상 최하단.
// report.js 에 DOM 테스트 하네스가 없어 정렬 함수만 따로 검사한다.
test("reasoningRows(): |bias| 내림차순, 방향 없는 둘은 최하단", () => {
  const d = fixture(), ctx = ctxOf(d);
  const indRows = I.readings(FC, GRAPH, d, ctx), noDir = I.noDirRows(FC, d, ctx);
  const rows = R.reasoningRows(indRows, noDir);
  // 입력과 대조한다 — rows 를 같은 술어로 다시 쪼개 세면 항등식이 된다(종전 assert 가 그랬다).
  assert.strictEqual(rows.length, indRows.length + noDir.length);
  assert.deepEqual(rows.slice(-2).map(r => r.type), ["trend", "phasefold"]);
  const dir = rows.slice(0, indRows.length);
  dir.forEach(r => assert.ok(r.bias != null, r.type + " 가 정렬 구간에 bias 없이 들어왔다"));
  for (let i = 1; i < dir.length; i++)
    assert.ok(Math.abs(dir[i - 1].bias) >= Math.abs(dir[i].bias), "정렬이 깨졌다");
});

// indicators.js·readings.js 의 브라우저 UMD 분기는 의존 전역을 **스크립트 실행 시점에** 캡처한다
// (factory(root.MSReadings) · factory(root.MSStr)). node 의 require() 는 태그 순서와 무관하게
// 동기 해석되므로 이 버그는 위 어떤 테스트도 못 잡는다 — index.html 의 <script> 순서 자체가 계약이다.
//   readings.js 가 indicators.js 뒤면 → 모든 판독문이 **공백**이 된다(리뷰 라운드 1, Critical).
//   strings.js 가 readings.js 뒤면 → 어휘 맵이 전부 비어 문장이 **조용히 틀려진다**
//   (실측: ma 가 "Aligned up" 대신 "Mixed, no crossover in range" 가 된다). 공백보다 나쁘다.
test("index.html — strings.js → readings.js → indicators.js 순서", () => {
  const html = readFileSync(join(__dirname, "../www/index.html"), "utf8");
  const at = f => html.indexOf('<script src="' + f + '">');
  ["strings.js", "readings.js", "indicators.js"].forEach(f =>
    assert.ok(at(f) >= 0, "index.html 에 " + f + " 스크립트 태그가 없다"));
  assert.ok(at("strings.js") < at("readings.js"),
    "readings.js captures root.MSStr at load time; loading it first makes every reading silently wrong");
  assert.ok(at("readings.js") < at("indicators.js"),
    "indicators.js captures root.MSReadings at load time; loading it first makes every reading blank in the browser");
});

// ⚠ 아래는 **소스 문자열 검사**다. report.js 에 DOM 하네스가 없어(이번 파동에서 의도적으로 제외)
// 동작이 아니라 **호출 모양**만 본다. 초록이라고 화면이 옳다는 뜻이 아니다 —
// 이 파일이 못 보는 것: 섹션이 실제로 붙는지, 순서, 조건 분기.
// 종전 두 테스트는 제목이 동작을 보증하는 것처럼 말했지만(`90회 재계산 회귀 방지`),
// `if (0 && …)` 로 계산을 죽여도 초록이었다 — 그 거짓 안심을 걷어내고 하나만 남긴다.
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");

test("report.js 소스 모양 — 지표 계산은 한 지점, opposing 은 그 rows 를 넘겨받는다", () => {
  const calls = REPORT.match(/MSIndicators\.(readings|biases)\(/g) || [];
  assert.strictEqual(calls.length, 1, "MSIndicators 계산 호출: " + calls.join(", "));
  // 5번째 인자를 null 로 되돌리면 opposing 이 스스로 다시 계산한다(= 지표당 analyzeX 2회).
  // 넘기는 것은 indRows 를 MSReadings.voiced 로 거른 배열이다(아래 테스트가 그 모양을 본다).
  assert.match(REPORT, /MSIndicators\.opposing\([^)]*,\s*(indRows|voiced)\s*\)/,
    "opposing() 이 이미 계산한 rows 를 넘겨받지 않는다");
  // 판독 ctx 는 ctxFrom 한 곳에서 온다 — 화면이 hasVolume 을 따로 재면 문장과 판정이 갈린다
  assert.match(REPORT, /MSIndicators\.ctxFrom\(indInput\)/);
});

test("report.js 소스 모양 — '읽었나' 술어는 두 섹션이 MSReadings.voiced 하나를 쓴다", () => {
  const uses = REPORT.match(/MSReadings\.voiced\(/g) || [];
  assert.strictEqual(uses.length, 2, "REASONING 머리와 AGAINST 가 각각 한 번씩 써야 한다");
  // AGAINST 는 목록과 분모를 **같은** 걸러낸 배열에서 뽑는다 — 한쪽만 걸러내면 분자 > 분모가 난다
  assert.match(REPORT, /var voiced = MSReadings\.voiced\(indRows\);/);
  assert.match(REPORT, /MSIndicators\.opposing\([^)]*,\s*voiced\s*\)/);
  assert.match(REPORT, /var measured = voiced\.length;/);
  // isRefusal 을 화면이 직접 부르면 술어가 두 벌이 된다(voiced 안에만 있어야 한다)
  assert.doesNotMatch(REPORT, /MSReadings\.isRefusal\(/);
});
