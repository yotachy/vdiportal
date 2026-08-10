import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L  = require("../www/draw-layers.js");
const CL = require("../www/chart-layout.js");
const FC = require("../../forge-core.js");
const Str = require("../www/strings.js");
const LG  = require("../www/chart-legend.js");

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

// ── 라벨 레지스트리 공유 계약(Phase 2) — 두 벌이 되면 끝점 라벨이 지표 배지를 못 보고 겹친다 ──
test("fitBoxY 는 빈 자리면 그대로, 충돌하면 밀고, 못 놓으면 null", () => {
  assert.equal(L.fitBoxY(0, 50, 100, 14, [], 0, 500), 50, "충돌이 없으면 원하는 y 그대로");
  const pushed = L.fitBoxY(0, 50, 100, 14, [{ x: 0, y: 45, w: 100, h: 14 }], 0, 500);
  assert.ok(pushed != null && pushed !== 50, "충돌했는데 안 밀렸다");
  assert.equal(L.fitBoxY(0, 10, 100, 14, [{ x: 0, y: 0, w: 100, h: 40 }], 0, 30), null, "공간이 없으면 null(겹쳐 찍지 않는다)");
});

test("reservePredBox 는 근거 라벨 레지스트리에도 등록된다 — 분리되면 겹쳐 그린다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  L.reservePredBox({ x: 200, y: 20, w: 160, h: 18 });
  assert.equal(L.predBoxes().length, 1, "예측 배지 박스 미등록");
  assert.equal(L.evBoxes().length, 1, "근거 라벨이 예측 배지를 못 본다 — 레지스트리가 두 벌이다");
  L.evLabel(c, "목표 12,345", 360, 34, "#e8b463", "right", true);
  const boxes = L.evBoxes();
  assert.equal(boxes.length, 2, "근거 라벨이 등록되지 않았다");
  const a = boxes[0], b = boxes[1];
  assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y),
            "예측 배지와 근거 라벨이 겹쳤다");
});

test("resetLabels 는 세 레지스트리를 모두 비운다", () => {
  L.resetLabels(372, 520);
  L.reservePredBox({ x: 0, y: 0, w: 10, h: 10 });
  L.resetLabels(372, 520);
  assert.equal(L.predBoxes().length, 0);
  assert.equal(L.evBoxes().length, 0);
  assert.equal(L.axisBoxes().length, 0);
});

test("M.badges=false 면 구석 배지를 안 그린다 — 값은 레전드로 갔다", () => {
  const M = Object.assign({}, layout().panels.price.M, { badges: false });
  const c = recCtx(); L.resetLabels(372, 520);
  L.bollinger(c, FC.analyzeBollinger(price, { len: 20, k: 2 }), M);
  L.ma(c, FC.analyzeMA(price, { len: 20 }), M);
  const texts = c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0]));
  assert.ok(!texts.some(t => /^BB /.test(t)), "볼린저 배지가 남았다: " + texts.join("|"));
  assert.ok(!texts.some(t => /aligned up|aligned down|mixed/.test(t)), "MA 정렬 배지가 남았다: " + texts.join("|"));
});

test("M.badges=false 라도 선과 크로스 마커는 그대로 그린다 — 위치가 의미인 것은 남는다", () => {
  const M = Object.assign({}, layout().panels.price.M, { badges: false });
  const c = recCtx(); L.resetLabels(372, 520);
  L.ma(c, FC.analyzeMA(price, { len: 20 }), M);
  assert.ok(c.calls.filter(x => x.op === "stroke").length >= 3, "MA 선이 사라졌다");
  assert.ok(c.calls.some(x => x.op === "arc"), "크로스 마커가 사라졌다");
});

test("M.badges 미지정이면 종전대로 배지를 그린다 — 기존 호출을 깨지 않는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  L.bollinger(c, FC.analyzeBollinger(price, { len: 20, k: 2 }), layout().panels.price.M);
  assert.ok(c.calls.some(x => x.op === "fillText"), "배지가 안 그려졌다");
});

test("M.badges 미지정이면 종전대로 MA 정렬 배지도 그린다 — Bollinger 만이 아니라 MA 도 하위호환", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  L.ma(c, FC.analyzeMA(price, { len: 20 }), layout().panels.price.M);
  const texts = c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0]));
  assert.ok(texts.some(t => /aligned up|aligned down|mixed/.test(t)), "MA 정렬 배지가 안 그려졌다: " + texts.join("|"));
});

// ── Fix round 1: RSI·거래량 다이버전스 선은 위치가 정보라 남아야 한다. reveal>=1 블록은 배지가 아니다 ──
test("M.badges=false 라도 RSI 다이버전스 선과 라벨은 그린다", () => {
  const M = Object.assign({}, layout().panels.price.M, { badges: false });
  const c = recCtx(); L.resetLabels(372, 520);
  const rsi = { divergence: { type: "bullish", pricePts: [{ idx: 350, price: candle[350].c }, { idx: 370, price: candle[370].c }] }, zone: "neutral", last: 50 };
  L.rsiBadge(c, rsi, M);
  assert.ok(c.calls.some(x => x.op === "stroke"), "다이버전스 선이 사라졌다");
  const texts = c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0]));
  assert.ok(texts.some(t => /divergence/i.test(t)), "다이버전스 라벨이 사라졌다: " + texts.join("|"));
});

test("M.badges=false 라도 거래량 다이버전스 선과 급증 틱은 그린다", () => {
  const M = Object.assign({}, layout().panels.price.M, { badges: false });
  const c = recCtx(); L.resetLabels(372, 520);
  const va = { divergence: { type: "bearish", pricePts: [{ idx: 350, price: candle[350].c }, { idx: 370, price: candle[370].c }] }, state: "spike", relationship: "confirm" };
  L.volumeBadge(c, va, M);
  // 다이버전스 선(bearish=#e06a6a)과 급증 틱(gold=#e8b463)은 서로 다른 stroke 색이라 — 하나만
  // 남아도 "some stroke" 는 공허하게 통과한다. 틱이 사라져도 안 잡히는 함정을 피하려 색으로 각각 확인한다.
  assert.ok(c.calls.some(x => x.op === "stroke" && x.stroke === "#e06a6a"), "다이버전스 선이 사라졌다");
  assert.ok(c.calls.some(x => x.op === "stroke" && x.stroke === "#e8b463"), "급증 틱이 사라졌다");
  const texts = c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0]));
  assert.ok(texts.some(t => /divergence/i.test(t)), "거래량 다이버전스 라벨이 사라졌다: " + texts.join("|"));
});

test("M.badges=false 면 RSI·거래량 배지는 안 그린다", () => {
  const M = Object.assign({}, layout().panels.price.M, { badges: false });
  const c = recCtx(); L.resetLabels(372, 520);
  L.rsiBadge(c, { divergence: {}, zone: "overbought", last: 71 }, M);
  L.volumeBadge(c, { divergence: {}, state: "contract", relationship: "weakening" }, M);
  const texts = c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0]));
  assert.ok(!texts.some(t => /overbought|oversold|neutral/.test(t)), "RSI 배지가 남았다: " + texts.join("|"));
  assert.ok(!texts.some(t => /\bspike\b|contracting|\bnormal\b/.test(t)), "거래량 배지가 남았다: " + texts.join("|"));
});

// ── Fix round 1: chart-legend.js(레전드, 정본)와 draw-layers.js(캔버스 배지)가 같은 개념에
// 다른 표기를 쓰던 드리프트(MA 정렬·RSI 구간·거래량 상태·볼린저 상태·크로스 golden/dead)를
// 값 수준에서 고정한다. 두 모듈이 strings.js 의 같은 맵/키를 읽는지까지 확인해야
// "우연히 같다"가 아니라 "구조적으로 같다"를 증명한다. ──
test("Fix round 1 — MA·거래량·볼린저·RSI 배지가 레전드와 같은 표기(값)를 쓴다", () => {
  const ma = FC.analyzeMA(price, { len: 20 });
  const rsi = FC.analyzeRSI(price, { period: 14 });
  const bb = FC.analyzeBollinger(price, { len: 20, k: 2 });
  const macd = FC.analyzeMACD(price, { fast: 12, slow: 26, signal: 9 });
  const va = FC.analyzeVolume(price, vol, {});
  const rows = {};
  LG.rows({ ma, rsi, bb, macd, va }, null, null).forEach(r => { rows[r.key] = r.value; });

  const M = layout().panels.price.M;
  function paint(fn, data) {
    const c = recCtx(); L.resetLabels(372, 520);
    fn(c, data, M);
    return c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0])).join(" | ");
  }

  const maTxt = paint(L.ma, ma);
  assert.ok(maTxt.indexOf(Str.MA_ALIGN[ma.align.order]) >= 0,
    "MA 배지가 공유 표기(" + Str.MA_ALIGN[ma.align.order] + ")를 안 쓴다: " + maTxt);
  assert.ok(rows.ma.indexOf(Str.MA_ALIGN[ma.align.order]) === 0,
    "레전드 자체가 공유 표기를 안 쓴다(테스트 전제 붕괴): " + rows.ma);

  const volTxt = paint(L.volumeBadge, va);
  assert.ok(volTxt.indexOf(Str.VOL_STATE[va.state]) >= 0, "거래량 상태 배지 표기 불일치: " + volTxt);
  assert.ok(volTxt.indexOf(Str.VOL_REL[va.relationship]) >= 0, "거래량 관계 배지 표기 불일치: " + volTxt);
  assert.ok(rows.vol.indexOf(Str.VOL_STATE[va.state]) >= 0, "레전드 거래량 상태가 공유 표기를 안 쓴다: " + rows.vol);

  const bbTxt = paint(L.bollinger, bb);
  assert.ok(bbTxt.indexOf(Str.BB_STATE[bb.state]) >= 0, "볼린저 상태 배지 표기 불일치: " + bbTxt);
  assert.ok(rows.bb.indexOf(Str.BB_STATE[bb.state]) >= 0, "레전드 볼린저 상태가 공유 표기를 안 쓴다: " + rows.bb);

  const rsiTxt = paint(L.rsiBadge, rsi);
  assert.ok(rsiTxt.indexOf(Str.RSI_ZONE[rsi.zone]) >= 0, "RSI 구간 배지 표기 불일치: " + rsiTxt);
  // 레전드는 봉값(rv, fi 기준)으로 구간을 재계산하므로 rsi.zone(전체 판정)과 다를 수 있다 —
  // 정확한 키 일치 대신 RSI_ZONE 세 값 중 하나를 쓰는지로 "공유 표기를 실제로 읽는가"만 확인한다.
  const zoneWords = [Str.RSI_ZONE.overbought, Str.RSI_ZONE.oversold, Str.RSI_ZONE.neutral];
  assert.ok(zoneWords.some(w => rows.rsi.indexOf(w) >= 0), "레전드 RSI 구간이 공유 표기를 안 쓴다: " + rows.rsi);

  // MA·MACD 골든/데드 크로스도 같은 값 비교 — 실측 크로스 유무와 무관하게 표기만 검증하려고 강제한다.
  const maCross = Object.assign({}, ma, { cross: { type: "golden", barsAgo: 12 } });
  const maCrossTxt = paint(L.ma, maCross);
  assert.ok(maCrossTxt.indexOf(Str.t.legGolden + "12" + Str.t.legBars) >= 0,
    "MA 골든크로스 배지가 레전드 표기와 다르다: " + maCrossTxt);
  assert.ok(!/Golden|Dead/.test(maCrossTxt), "MA 크로스 배지에 대문자 표기가 남았다: " + maCrossTxt);

  const macdCross = Object.assign({}, macd, { cross: { type: "bull", barsAgo: 5 } });
  const macdCrossTxt = paint(L.macdBadge, macdCross);
  assert.ok(macdCrossTxt.indexOf(Str.t.legGolden + "5" + Str.t.legBars) >= 0,
    "MACD 골든크로스 배지가 레전드 표기와 다르다: " + macdCrossTxt);
  assert.ok(!/Golden|Dead/.test(macdCrossTxt), "MACD 크로스 배지에 대문자 표기가 남았다: " + macdCrossTxt);
});
