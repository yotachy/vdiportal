import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P  = require("../www/draw-panels.js");
const FC = require("../../forge-core.js");

function recCtx() {
  const calls = [], st = { fillStyle: null, strokeStyle: null, lineWidth: null, globalAlpha: 1, font: null, textAlign: null };
  const rec = n => (...a) => calls.push({ op: n, args: a, fill: st.fillStyle, stroke: st.strokeStyle });
  const c = {};
  for (const n of ["save","restore","beginPath","closePath","moveTo","lineTo","fill","stroke","fillRect","clearRect","setLineDash","fillText","arc","rect","clip","translate","roundRect","quadraticCurveTo"]) c[n] = rec(n);
  c.measureText = t => ({ width: String(t).length * 6 });
  c.createLinearGradient = () => ({ addColorStop() {} });
  for (const k of Object.keys(st)) Object.defineProperty(c, k, { get: () => st[k], set: v => { st[k] = v; } });
  c.calls = calls;
  return c;
}

const d = FC.makeDemoSeries(400), price = d.price;
const vol = d.candle.map((_, i) => 1e6 + Math.abs(Math.sin(i * 0.3)) * 5e5);

test("RSI 패널이 라인과 70/30 가이드를 그린다", () => {
  const c = recCtx();
  P.rsi(c, 372, 90, FC.analyzeRSI(price, { len: 14 }), Infinity);
  assert.ok(c.calls.length > 300, "콜 " + c.calls.length + " — 기준선 990");
  assert.ok(c.calls.filter(x => x.op === "stroke").length >= 3, "가이드선 3개(30/50/70)가 없다");
  assert.ok(c.calls.some(x => x.op === "fillText"), "눈금 숫자가 없다");
});

test("MACD 패널이 히스토그램 막대를 그린다", () => {
  const c = recCtx();
  P.macd(c, 372, 90, FC.analyzeMACD(price, { fast: 12, slow: 26, signal: 9 }), Infinity);
  const bars = c.calls.filter(x => x.op === "fillRect").length;
  assert.ok(bars > 100, "히스토그램 막대가 " + bars + "개뿐 — 기준선 480");
});

test("거래량 패널이 막대를 그린다", () => {
  const c = recCtx();
  P.volume(c, 372, 60, FC.analyzeVolume(vol, price), Infinity);
  assert.ok(c.calls.filter(x => x.op === "fillRect").length > 20, "거래량 막대가 없다");
  assert.ok(c.calls.length > 200, "콜 " + c.calls.length + " — 기준선 554");
});

test("데이터가 비면 안내 문구만 그리고 던지지 않는다", () => {
  for (const [name, empty] of [["rsi", { series: [] }], ["macd", { macd: [], sig: [], hist: [] }], ["volume", { series: [] }]]) {
    const c = recCtx();
    assert.doesNotThrow(() => P[name](c, 372, 90, empty, Infinity), name + " 가 빈 데이터에 던졌다");
    assert.ok(c.calls.some(x => x.op === "fillText"), name + " 가 안내 문구를 안 그렸다");
  }
});

test("DOM 없이 동작한다 — document 를 참조하지 않는다", () => {
  assert.equal(typeof globalThis.document, "undefined", "이 테스트는 DOM 없는 환경을 전제한다");
  const c = recCtx();
  assert.doesNotThrow(() => P.rsi(c, 372, 90, FC.analyzeRSI(price, { len: 14 }), Infinity));
});
