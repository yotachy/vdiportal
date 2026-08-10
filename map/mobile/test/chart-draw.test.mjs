import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const D  = require("../www/chart-draw.js");
const CL = require("../www/chart-layout.js");
const L  = require("../www/draw-layers.js");

const COL = { bull: "#4fb98a", bear: "#d96a6a", gold: "#e8b463", cone: "rgba(232,180,99,.09)",
              ink4: "#7c8598", ink5: "#78819a", hairline: "rgba(238,241,247,.06)" };

function recCtx() {
  const calls = [], st = { fillStyle: null, strokeStyle: null, lineWidth: null, font: null, textAlign: null, globalAlpha: 1 };
  const rec = n => (...a) => calls.push({ op: n, args: a, fill: st.fillStyle, stroke: st.strokeStyle, font: st.font });
  const c = {};
  for (const n of ["save","restore","beginPath","closePath","moveTo","lineTo","fill","stroke","fillRect","arc","setLineDash","fillText","rect","clip","translate","roundRect"]) c[n] = rec(n);
  c.measureText = t => ({ width: String(t).length * 6 });
  for (const k of Object.keys(st)) Object.defineProperty(c, k, { get: () => st[k], set: v => { st[k] = v; } });
  c.calls = calls;
  return c;
}
function candles(n) {
  const out = [];
  for (let i = 0; i < n; i++) { const b = 100 + i; out.push({ o: b, h: b + 2, l: b - 1, c: b + (i % 2 ? 1 : -1), v: 1000 + i, t: "2026-01-01" }); }
  return out;
}
const pred = { path: [130, 131, 132], lo: [128, 129, 130], hi: [132, 133, 134], futW: 3 };
const LAY = () => CL.chartLayout({ candle: candles(150), prediction: pred, width: 372, height: 520, pad: 10, tailBars: 120 });

// 예측선은 이제 봉별 세그먼트로 쪼개져 그려진다(신뢰 감쇠). 그래서 "스트로크 몇 번"이 아니라
// "어떤 예측선 색이 등장했나" 로 티어 계약을 고정한다 — 세그먼트 수는 밴드 모양에 딸린 값이다.
function predRgbs(c) {
  const set = new Set();
  for (const x of c.calls) {
    if (x.op !== "stroke" || typeof x.stroke !== "string") continue;
    const m = /^rgba\((\d+,\d+,\d+),/.exec(x.stroke);
    if (m) set.add(m[1]);
  }
  return set;
}
const RGB = { gold: "232,180,99", pred3: "224,106,106", pred2: "184,146,245" };

test("상승봉은 bull, 하락봉은 bear 로 실제로 칠해진다 — 봉마다 대응을 고정", () => {
  const c = recCtx(), lay = LAY(), cd = candles(150);
  D.drawCandles(c, lay, cd, COL);
  const rects = c.calls.filter(x => x.op === "fillRect");
  assert.equal(rects.length, lay.tail, "몸통 수가 꼬리 봉 수와 다르다");
  const tail = cd.slice(lay.fiMin);
  tail.forEach((b, i) => {
    assert.equal(rects[i].fill, (b.c >= b.o) ? COL.bull : COL.bear, "봉 " + i + " up=" + (b.c >= b.o));
  });
});

test("심지 색도 방향별로 매핑된다 — bull/bear 일관성 필수", () => {
  const c = recCtx(), lay = LAY(), cd = candles(150);
  D.drawCandles(c, lay, cd, COL);
  const strokes = c.calls.filter(x => x.op === "stroke");
  assert.ok(strokes.length > 0, "심지 스트로크가 없다");
  const tail = cd.slice(lay.fiMin);
  tail.forEach((b, i) => {
    assert.equal(strokes[i].stroke, (b.c >= b.o) ? COL.bull : COL.bear, "심지 " + i + " up=" + (b.c >= b.o));
  });
});

test("몸통 높이는 최소 1px — 도지가 사라지지 않는다", () => {
  const doji = Array.from({ length: 130 }, () => ({ o: 100, h: 101, l: 99, c: 100, v: 1, t: "2026-01-01" }));
  const c = recCtx();
  D.drawCandles(c, CL.chartLayout({ candle: doji, prediction: null, width: 372, height: 520, pad: 10, tailBars: 120 }), doji, COL);
  assert.ok(c.calls.filter(x => x.op === "fillRect").every(r => r.args[3] >= 1));
});

test("콘을 cone 색으로 채우고 경로를 gold 로 긋는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), pred, COL);
  assert.ok(c.calls.some(x => x.op === "fill" && x.fill === COL.cone), "콘 채움이 없다");
  assert.ok(predRgbs(c).has(RGB.gold), "예측 경로 gold 스트로크가 없다");
});

test("예측이 없으면 콘도 경로도 그리지 않는다", () => {
  const c = recCtx();
  D.drawCone(c, CL.chartLayout({ candle: candles(150), prediction: null, width: 372, height: 520 }), null, COL);
  assert.equal(c.calls.filter(x => x.op === "fill" || x.op === "stroke").length, 0);
});

test("축 글자는 10.5px 이상이다 — 이보다 작으면 폰에서 안 읽힌다", () => {
  const c = recCtx();
  D.drawAxes(c, LAY(), candles(150), COL);
  const texts = c.calls.filter(x => x.op === "fillText");
  assert.ok(texts.length >= 4, "가격 눈금이 " + texts.length + "개뿐");
  for (const t of texts) {
    const m = /(\d+(?:\.\d+)?)px/.exec(t.font || "");
    assert.ok(m, "font 에 px 크기가 없다: " + t.font);
    assert.ok(parseFloat(m[1]) >= 10.5, "축 글자 " + m[1] + "px < 10.5px");
  }
});

test("현재가 태그를 gold 로 그린다", () => {
  const c = recCtx();
  D.drawAxes(c, LAY(), candles(150), COL);
  assert.ok(c.calls.some(x => (x.op === "fillRect" || x.op === "roundRect") && x.fill === COL.gold), "현재가 태그가 없다");
});

test("예측 시작선을 점선으로 긋는다", () => {
  const c = recCtx();
  D.drawAxes(c, LAY(), candles(150), COL);
  assert.ok(c.calls.some(x => x.op === "setLineDash" && Array.isArray(x.args[0]) && x.args[0].length), "예측 시작 점선이 없다");
});

test("fiAtX 는 x 를 절대 봉 인덱스로 되돌린다", () => {
  const lay = LAY();
  assert.equal(D.fiAtX(lay, lay.fiToX(lay.nowFi)), lay.nowFi);
  assert.equal(D.fiAtX(lay, lay.fiToX(lay.fiMin)), lay.fiMin);
  assert.equal(D.fiAtX(lay, -1e6), lay.fiMin, "왼쪽 밖은 fiMin 으로 클램프");
  assert.equal(D.fiAtX(lay, 1e6), lay.nowFi, "오른쪽 밖은 nowFi 로 클램프");
});

// ── 예측선 티어 게이팅(모바일 수익화) ──
// levels·tex 를 실었다 — 이게 없으면 wiggle 이 매끈한 폴백으로 빠져 꿈틀 경로가 테스트에서 실행되지 않는다.
const predWithCounter = { path: [130, 131, 132], lo: [128, 129, 130], hi: [132, 133, 134],
                           futW: 3, counter: [125, 124, 123], anchor: 129,
                           levels: [128, 130, 132, 134], tex: [0.01, -0.02, 0.015, 0] };

test("linesFor 는 티어별 배열을 돌려주고, 모르는 티어는 basic 으로 대체한다", () => {
  assert.deepEqual(D.linesFor("basic"), ["p1"]);
  assert.deepEqual(D.linesFor("full"), ["p1", "p3"]);
  assert.deepEqual(D.linesFor("custom"), ["p1", "p2", "p3"]);
  assert.deepEqual(D.linesFor("nope"), ["p1"], "미지정 티어는 basic 폴백");
  assert.deepEqual(D.linesFor(undefined), ["p1"]);
  assert.deepEqual(D.PRED_TIERS.basic, ["p1"]);
});

test("tier:basic 은 1차만 긋는다 — counter 는 색조차 등장하지 않는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, Object.assign({}, COL, { pred3: "#e06a6a" }), "basic");
  const rgbs = predRgbs(c);
  assert.deepEqual([...rgbs], [RGB.gold], "1차 외 예측선 색이 섞였다: " + [...rgbs]);
});

test("tier:full 은 1차·3차를 긋고, 3차는 점선이다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, Object.assign({}, COL, { pred3: "#e06a6a" }), "full");
  const rgbs = predRgbs(c);
  assert.ok(rgbs.has(RGB.gold), "1차(gold) 가 없다");
  assert.ok(rgbs.has(RGB.pred3), "3차(pred3) 가 없다");
  assert.equal(rgbs.size, 2, "예측선 색이 2종이 아니다: " + [...rgbs]);
  assert.ok(c.calls.some(x => x.op === "setLineDash" && x.args[0] && x.args[0].length), "3차가 점선이 아니다");
});

test("tier:custom 이지만 pred.second 가 없으면 p1·p3 만 그리고 에러 없이 끝난다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  const col = Object.assign({}, COL, { pred3: "#e06a6a", pred2: "#b892f5" });
  assert.doesNotThrow(() => D.drawCone(c, LAY(), predWithCounter, col, "custom"));
  const rgbs = predRgbs(c);
  assert.equal(rgbs.size, 2, "second 없이 p2 를 그렸다: " + [...rgbs]);
  assert.ok(!rgbs.has(RGB.pred2), "pred2 색이 등장하면 안 된다(데이터 없음)");
});

test("콘 채움은 티어와 무관하게 항상 그려진다", () => {
  ["basic", "full", "custom", undefined].forEach(tier => {
    const c = recCtx(); L.resetLabels(372, 520);
    D.drawCone(c, LAY(), predWithCounter, COL, tier);
    assert.ok(c.calls.some(x => x.op === "fill" && x.fill === COL.cone), "tier=" + tier + " 콘 채움 누락");
  });
});

test("tier 인자를 생략하면 기존 호출처럼 basic 으로 동작한다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, COL);
  assert.deepEqual([...predRgbs(c)], [RGB.gold]);
});

// ── Phase 2 통합 계약 ──
const trace = (p) => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), p, COL, "basic", { sym: "AAPL", tf: "1day" });
  return c.calls.filter(x => x.op === "lineTo").map(x => x.args.join(",")).join("|");
};

test("levels·tex 가 오면 꿈틀이 실제로 적용된다 — 매끈한 폴백과 좌표가 갈라진다", () => {
  const smooth = trace(Object.assign({}, predWithCounter, { levels: null, tex: null }));
  assert.notEqual(trace(predWithCounter), smooth, "levels·tex 가 있는데 매끈한 선과 좌표가 같다");
});

// Phase 3 이전엔 이 자리에서 끝점 차수 라벨의 공유 레지스트리 예약·충돌 회피(_fitBoxY)를
// drawCone 을 통해 검증했다. label:null 로 바뀌며 그 경로가 죽어(endDeco 의 o.label 분기가
// wigLine 에서 더는 호출되지 않음) 두 테스트를 아래 한 벌로 교체한다 — 회피 알고리즘 자체는
// draw-layers.test.mjs 의 "fitBoxY 는 빈 자리면..." 테스트가 여전히 직접 커버한다.
test("basic 예측선은 끝점 진앙만 남기고 라벨을 레지스트리에 예약하지 않는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, COL, "basic", { sym: "AAPL", tf: "1day" });
  assert.ok(c.calls.some(x => x.op === "arc"), "끝점 진앙이 없다");
  assert.ok(!c.calls.some(x => x.op === "fillText"), "차수 라벨이 남았다");
  assert.equal(L.predBoxes().length, 0, "더는 그리지 않는 라벨이 레지스트리에 예약되어 있다");
});

test("같은 종목·주기면 같은 그림 — 두 번 그려도 좌표가 동일하다", () => {
  assert.equal(trace(predWithCounter), trace(predWithCounter));
  const noTex = Object.assign({}, predWithCounter, { tex: null });   // 엔진이 tex 를 못 낼 때의 PRNG 결 경로
  assert.equal(trace(noTex), trace(noTex));
});

test("밴드(lo/hi)가 없으면 꿈틀 없이 단순 폴리라인으로 폴백한다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  const noBand = { path: [130, 131, 132], futW: 3 };
  assert.doesNotThrow(() => D.drawCone(c, CL.chartLayout({ candle: candles(150), prediction: noBand, width: 372, height: 520, pad: 10, tailBars: 120 }), noBand, COL, "basic"));
  assert.ok(c.calls.some(x => x.op === "stroke" && x.stroke === COL.gold), "폴백 스트로크가 없다");
});

test("크로스헤어는 모든 패널을 관통하고 값 라벨을 그린다", () => {
  const c = recCtx(), lay = LAY();
  D.drawCrosshair(c, lay, lay.nowFi - 5, candles(150), COL);
  assert.ok(c.calls.filter(x => x.op === "stroke").length >= 1, "세로선이 없다");
  assert.ok(c.calls.some(x => x.op === "fillText"), "값 라벨이 없다");
});

test("끝점 차수 배지와 예측가는 더 이상 차트에 안 그려진다 — 레전드로 갔다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, COL, "basic", { sym: "AAPL", tf: "1day" });
  const texts = c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0]));
  assert.ok(!texts.some(t => /^1st|^1차/.test(t)), "차수 배지가 남았다: " + texts.join("|"));
  assert.equal(texts.length, 0, "끝점 텍스트가 남았다: " + texts.join("|"));
});

test("진앙 마커는 여전히 그린다 — 끝점 '위치'는 정보다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, COL, "basic", { sym: "AAPL", tf: "1day" });
  assert.ok(c.calls.filter(x => x.op === "arc").length >= 2, "진앙이 사라졌다");
});
