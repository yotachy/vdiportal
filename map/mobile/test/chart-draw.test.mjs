import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const D  = require("../www/chart-draw.js");
const CL = require("../www/chart-layout.js");

const COL = { bull: "#4fb98a", bear: "#d96a6a", gold: "#e8b463", cone: "rgba(232,180,99,.09)",
              ink4: "#7c8598", ink5: "#78819a", hairline: "rgba(238,241,247,.06)" };

function recCtx() {
  const calls = [], st = { fillStyle: null, strokeStyle: null, lineWidth: null, font: null, textAlign: null, globalAlpha: 1 };
  const rec = n => (...a) => calls.push({ op: n, args: a, fill: st.fillStyle, stroke: st.strokeStyle, font: st.font });
  const c = {};
  for (const n of ["save","restore","beginPath","closePath","moveTo","lineTo","fill","stroke","fillRect","setLineDash","fillText","rect","clip","translate","roundRect"]) c[n] = rec(n);
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
const L = () => CL.chartLayout({ candle: candles(150), prediction: pred, width: 372, height: 520, pad: 10, tailBars: 120 });

test("상승봉은 bull, 하락봉은 bear 로 실제로 칠해진다 — 봉마다 대응을 고정", () => {
  const c = recCtx(), lay = L(), cd = candles(150);
  D.drawCandles(c, lay, cd, COL);
  const rects = c.calls.filter(x => x.op === "fillRect");
  assert.equal(rects.length, lay.tail, "몸통 수가 꼬리 봉 수와 다르다");
  const tail = cd.slice(lay.fiMin);
  tail.forEach((b, i) => {
    assert.equal(rects[i].fill, (b.c >= b.o) ? COL.bull : COL.bear, "봉 " + i + " up=" + (b.c >= b.o));
  });
});

test("심지 색도 방향별로 매핑된다 — bull/bear 일관성 필수", () => {
  const c = recCtx(), lay = L(), cd = candles(150);
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
  const c = recCtx();
  D.drawCone(c, L(), pred, COL);
  assert.ok(c.calls.some(x => x.op === "fill" && x.fill === COL.cone), "콘 채움이 없다");
  assert.ok(c.calls.some(x => x.op === "stroke" && x.stroke === COL.gold), "예측 경로 gold 스트로크가 없다");
});

test("예측이 없으면 콘도 경로도 그리지 않는다", () => {
  const c = recCtx();
  D.drawCone(c, CL.chartLayout({ candle: candles(150), prediction: null, width: 372, height: 520 }), null, COL);
  assert.equal(c.calls.filter(x => x.op === "fill" || x.op === "stroke").length, 0);
});

test("축 글자는 10.5px 이상이다 — 이보다 작으면 폰에서 안 읽힌다", () => {
  const c = recCtx();
  D.drawAxes(c, L(), candles(150), COL);
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
  D.drawAxes(c, L(), candles(150), COL);
  assert.ok(c.calls.some(x => (x.op === "fillRect" || x.op === "roundRect") && x.fill === COL.gold), "현재가 태그가 없다");
});

test("예측 시작선을 점선으로 긋는다", () => {
  const c = recCtx();
  D.drawAxes(c, L(), candles(150), COL);
  assert.ok(c.calls.some(x => x.op === "setLineDash" && Array.isArray(x.args[0]) && x.args[0].length), "예측 시작 점선이 없다");
});

test("fiAtX 는 x 를 절대 봉 인덱스로 되돌린다", () => {
  const lay = L();
  assert.equal(D.fiAtX(lay, lay.fiToX(lay.nowFi)), lay.nowFi);
  assert.equal(D.fiAtX(lay, lay.fiToX(lay.fiMin)), lay.fiMin);
  assert.equal(D.fiAtX(lay, -1e6), lay.fiMin, "왼쪽 밖은 fiMin 으로 클램프");
  assert.equal(D.fiAtX(lay, 1e6), lay.nowFi, "오른쪽 밖은 nowFi 로 클램프");
});

// ── 예측선 티어 게이팅(모바일 수익화) ──
const predWithCounter = { path: [130, 131, 132], lo: [128, 129, 130], hi: [132, 133, 134],
                           futW: 3, counter: [125, 124, 123] };

test("linesFor 는 티어별 배열을 돌려주고, 모르는 티어는 basic 으로 대체한다", () => {
  assert.deepEqual(D.linesFor("basic"), ["p1"]);
  assert.deepEqual(D.linesFor("full"), ["p1", "p3"]);
  assert.deepEqual(D.linesFor("custom"), ["p1", "p2", "p3"]);
  assert.deepEqual(D.linesFor("nope"), ["p1"], "미지정 티어는 basic 폴백");
  assert.deepEqual(D.linesFor(undefined), ["p1"]);
  assert.deepEqual(D.PRED_TIERS.basic, ["p1"]);
});

test("tier:basic 은 1차만 긋는다 — counter 는 색조차 등장하지 않는다", () => {
  const c = recCtx();
  const col = Object.assign({}, COL, { pred3: "#e06a6a" });
  D.drawCone(c, L(), predWithCounter, col, "basic");
  const strokes = c.calls.filter(x => x.op === "stroke");
  assert.equal(strokes.length, 1, "1차 외 다른 예측선 스트로크가 섞였다");
  assert.equal(strokes[0].stroke, col.gold);
  assert.ok(!c.calls.some(x => x.op === "stroke" && x.stroke === col.pred3), "3차(counter) 색이 등장하면 안 된다");
});

test("tier:full 은 1차·3차를 긋고, 3차는 점선이다", () => {
  const c = recCtx();
  const col = Object.assign({}, COL, { pred3: "#e06a6a" });
  D.drawCone(c, L(), predWithCounter, col, "full");
  const strokes = c.calls.filter(x => x.op === "stroke");
  assert.equal(strokes.length, 2, "1차+3차 두 번만 스트로크");
  assert.ok(strokes.some(x => x.stroke === col.gold), "1차(gold) 가 없다");
  assert.ok(strokes.some(x => x.stroke === col.pred3), "3차(pred3) 가 없다");
  const dashCalls = c.calls.filter(x => x.op === "setLineDash" && x.args[0].length);
  assert.ok(dashCalls.length >= 1, "3차가 점선으로 그려지지 않았다");
});

test("tier:custom 이지만 pred.second 가 없으면 p1·p3 만 그리고 에러 없이 끝난다", () => {
  const c = recCtx();
  assert.doesNotThrow(() => D.drawCone(c, L(), predWithCounter, COL, "custom"));
  const strokes = c.calls.filter(x => x.op === "stroke");
  assert.equal(strokes.length, 2, "second 없이 p2 를 그리면 안 된다");
  assert.ok(!strokes.some(x => x.stroke === COL.pred2), "pred2 색이 등장하면 안 된다(데이터 없음)");
});

test("콘 채움은 티어와 무관하게 항상 그려진다", () => {
  ["basic", "full", "custom", undefined].forEach(tier => {
    const c = recCtx();
    D.drawCone(c, L(), predWithCounter, COL, tier);
    assert.ok(c.calls.some(x => x.op === "fill" && x.fill === COL.cone), "tier=" + tier + " 콘 채움 누락");
  });
});

test("tier 인자를 생략하면 기존 호출처럼 basic 으로 동작한다", () => {
  const c = recCtx();
  D.drawCone(c, L(), predWithCounter, COL);
  const strokes = c.calls.filter(x => x.op === "stroke");
  assert.equal(strokes.length, 1);
  assert.equal(strokes[0].stroke, COL.gold);
});

test("크로스헤어는 모든 패널을 관통하고 값 라벨을 그린다", () => {
  const c = recCtx(), lay = L();
  D.drawCrosshair(c, lay, lay.nowFi - 5, candles(150), COL);
  assert.ok(c.calls.filter(x => x.op === "stroke").length >= 1, "세로선이 없다");
  assert.ok(c.calls.some(x => x.op === "fillText"), "값 라벨이 없다");
});
