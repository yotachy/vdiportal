import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L  = require("../www/draw-layers.js");
const CL = require("../www/chart-layout.js");
const FC = require("../../forge-core.js");

// 캔버스는 반환값이 아니라 실제 페인트를 단언해야 한다(이 저장소의 스와치 사고 교훈).
function recCtx() {
  const calls = [], st = { fillStyle: null, strokeStyle: null, lineWidth: null, globalAlpha: 1, font: null, textAlign: null, letterSpacing: null };
  const rec = n => (...a) => calls.push({ op: n, args: a, fill: st.fillStyle, stroke: st.strokeStyle, alpha: st.globalAlpha });
  const c = {};
  for (const n of ["save","restore","beginPath","closePath","moveTo","lineTo","fill","stroke","fillRect","strokeRect","arc","setLineDash","fillText","clip","rect","translate","roundRect","quadraticCurveTo","bezierCurveTo"]) c[n] = rec(n);
  c.measureText = t => ({ width: String(t).length * 6 });
  c.createLinearGradient = () => ({ addColorStop() {} });
  for (const k of Object.keys(st)) Object.defineProperty(c, k, { get: () => st[k], set: v => { st[k] = v; } });
  c.calls = calls;
  return c;
}

const d = FC.makeDemoSeries(400);
const price = d.price;
const vol = d.candle.map((_, i) => 1e6 + Math.abs(Math.sin(i * 0.3)) * 5e5);
const candle = d.candle.map((b, i) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: vol[i] }));
const layout = () => CL.chartLayout({ candle, prediction: { path: [], lo: [], hi: [] }, width: 372, height: 520, pad: 10, tailBars: 120 });

test("MA 레이어가 실제로 선을 긋는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  L.ma(c, FC.analyzeMA(price, { len: 20, ema: false }), layout().panels.price.M);
  assert.ok(c.calls.filter(x => x.op === "stroke").length >= 3, "MA 다중선이 3개 미만");
  assert.ok(c.calls.length > 200, "페인트 콜이 " + c.calls.length + " 개뿐 — 기준선 508");
});

test("볼린저가 밴드를 채우고 상하단을 점선으로 긋는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  L.bollinger(c, FC.analyzeBollinger(price, { len: 20, k: 2 }), layout().panels.price.M);
  assert.ok(c.calls.some(x => x.op === "fill"), "밴드 채움이 없다");
  assert.ok(c.calls.some(x => x.op === "setLineDash" && Array.isArray(x.args[0]) && x.args[0].length), "상하단 점선이 없다");
  assert.ok(c.calls.length > 200, "페인트 콜이 " + c.calls.length + " 개뿐 — 기준선 621");
});

test("배지 3종은 텍스트를 그린다", () => {
  const M = layout();
  for (const [name, data, m] of [
    ["rsiBadge", FC.analyzeRSI(price, { len: 14 }), M.panels.price.M],
    ["macdBadge", FC.analyzeMACD(price, { fast: 12, slow: 26, signal: 9 }), M.panels.price.M],
    ["volumeBadge", FC.analyzeVolume(vol, price), M.panels.price.M]
  ]) {
    const c = recCtx(); L.resetLabels(372, 520);
    L[name](c, data, m);
    assert.ok(c.calls.some(x => x.op === "fillText"), name + " 가 텍스트를 안 그렸다");
  }
});

test("resetLabels 를 부르지 않아도 던지지 않는다", () => {
  const c = recCtx();
  assert.doesNotThrow(() => L.ma(c, FC.analyzeMA(price, { len: 20 }), layout().panels.price.M));
});

test("빈 데이터에도 던지지 않는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  assert.doesNotThrow(() => L.bollinger(c, { mid: [], upper: [], lower: [] }, layout().panels.price.M));
});
