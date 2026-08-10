import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSChart = require("../www/chart.js");

const COL = { bull: "#4fb98a", bear: "#d96a6a", gold: "#e8b463", cone: "rgba(232,180,99,.09)" };

// dir: 생략=교대(상승/하락 섞임), "up"=전부 상승, "down"=전부 하락.
// 교대 픽스처만 쓰면 "두 색이 어딘가 나오긴 한다" 단언이 매핑 반전을 통과시킨다.
function candles(n, flat, dir) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = flat ? 100 : 100 + i;
    const delta = dir === "up" ? 1 : dir === "down" ? -1 : (i % 2 ? 1 : -1);
    out.push({ o: base, h: base + 2, l: base - 1, c: base + delta, v: 1000 });
  }
  return out;
}
function prediction(n) {
  const path = [], lo = [], hi = [];
  for (let i = 0; i < n; i++) { path.push(200 + i); lo.push(195 + i); hi.push(205 + i); }
  return { path, lo, hi, futW: n, anchor: 200, target: 200 + n };
}

// 캔버스는 반환값이 아니라 실제 페인트를 단언해야 한다(스와치가 반환값엔 반영됐지만
// 페인트엔 안 됐던 forge-tools 사고). 호출을 그대로 기록하는 심을 쓴다.
function recCtx() {
  const calls = [];
  const st = { fillStyle: null, strokeStyle: null, lineWidth: null };
  const rec = name => (...args) => calls.push({ op: name, args, fill: st.fillStyle, stroke: st.strokeStyle, lw: st.lineWidth });
  const ctx = {
    save: rec("save"), restore: rec("restore"), beginPath: rec("beginPath"), closePath: rec("closePath"),
    moveTo: rec("moveTo"), lineTo: rec("lineTo"), fill: rec("fill"), stroke: rec("stroke"), fillRect: rec("fillRect")
  };
  for (const k of ["fillStyle", "strokeStyle", "lineWidth"]) {
    Object.defineProperty(ctx, k, { get: () => st[k], set: v => { st[k] = v; } });
  }
  ctx.calls = calls;
  return ctx;
}

test("bars 는 tailBars 만큼만, 오래된 것부터 잘라낸다", () => {
  const g = MSChart.chartGeometry({ candle: candles(300), prediction: prediction(60), width: 372, height: 240, tailBars: 120 });
  assert.equal(g.bars.length, 120);
  assert.equal(g.tail, 120);
  assert.equal(g.fut, 60);
});

test("가격 최고/최저가 패딩 경계에 매핑된다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: null, width: 300, height: 200, pad: 10, tailBars: 50 });
  const yTop = Math.min(...g.bars.map(b => b.yH));
  const yBot = Math.max(...g.bars.map(b => b.yL));
  assert.ok(Math.abs(yTop - 10) < 0.001, "최고가 y=" + yTop);
  assert.ok(Math.abs(yBot - 190) < 0.001, "최저가 y=" + yBot);
});

test("콘의 hi/lo 가 스케일에 포함된다 — 예측이 화면 밖으로 나가지 않는다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: prediction(60), width: 300, height: 200, pad: 10, tailBars: 50 });
  const ys = g.cone.hi.concat(g.cone.lo).map(p => p.y);
  assert.ok(Math.min(...ys) >= 10 - 0.001 && Math.max(...ys) <= 190 + 0.001);
});

test("예측 경로는 마지막 봉 오른쪽에서 시작한다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: prediction(60), width: 300, height: 200, tailBars: 50 });
  assert.ok(g.path[0].x > g.bars[g.bars.length - 1].x);
  assert.equal(g.path.length, 60);
});

test("완전 평탄한 시리즈에서 NaN 이 나오지 않는다", () => {
  const g = MSChart.chartGeometry({ candle: candles(30, true).map(c => ({ o: 100, h: 100, l: 100, c: 100 })), prediction: null, width: 300, height: 200 });
  assert.ok(g.bars.every(b => Number.isFinite(b.yO) && Number.isFinite(b.yC) && Number.isFinite(b.yH) && Number.isFinite(b.yL)));
});

test("예측이 없어도 동작한다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: null, width: 300, height: 200 });
  assert.equal(g.fut, 0);
  assert.equal(g.path.length, 0);
  assert.equal(g.cone.hi.length, 0);
});

test("drawChart 가 콘을 cone 색으로 실제로 채운다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: prediction(60), width: 300, height: 200 });
  const ctx = recCtx();
  MSChart.drawChart(ctx, g, COL);
  assert.ok(ctx.calls.some(c => c.op === "fill" && c.fill === COL.cone), "콘 fill 이 cone 색으로 실행되지 않았다");
});

// geo.bars 와 fillRect 호출은 같은 순서로 나온다 — 봉마다 짝지어 색을 고정한다.
// "두 색이 어딘가 나온다"로는 bull/bear 를 통째로 뒤바꿔도 통과한다(색 스와치가
// 반환값엔 맞고 페인트엔 안 맞던 forge-tools 사고가 바로 이 형태였다).
function assertBarColors(candle) {
  const g = MSChart.chartGeometry({ candle, prediction: null, width: 300, height: 200 });
  const ctx = recCtx();
  MSChart.drawChart(ctx, g, COL);
  const rects = ctx.calls.filter(c => c.op === "fillRect");
  assert.equal(rects.length, g.bars.length, "몸통 개수 불일치");
  g.bars.forEach((b, i) => {
    assert.equal(rects[i].fill, b.up ? COL.bull : COL.bear, "봉 " + i + " up=" + b.up);
  });
  return g;
}

test("drawChart 가 봉마다 up→bull / down→bear 로 칠한다 (순서 대응)", () => {
  const g = assertBarColors(candles(50));
  assert.ok(g.bars.some(b => b.up) && g.bars.some(b => !b.up), "픽스처에 상승·하락이 모두 있어야 한다");
});

test("전부 상승인 봉은 전부 bull 로만 칠해진다", () => {
  const g = assertBarColors(candles(30, false, "up"));
  assert.ok(g.bars.every(b => b.up), "픽스처가 전부 상승이어야 한다");
});

test("전부 하락인 봉은 전부 bear 로만 칠해진다", () => {
  const g = assertBarColors(candles(30, false, "down"));
  assert.ok(g.bars.every(b => !b.up), "픽스처가 전부 하락이어야 한다");
});

// 심지(고가~저가) 스트로크도 같은 매핑을 따라야 한다 — 몸통만 고정하면 심지가 뒤집혀도 통과한다.
test("심지 스트로크 색도 봉 방향을 따른다", () => {
  const g = MSChart.chartGeometry({ candle: candles(20), prediction: null, width: 300, height: 200 });
  const ctx = recCtx();
  MSChart.drawChart(ctx, g, COL);
  const wicks = ctx.calls.filter(c => c.op === "stroke" && c.stroke !== COL.gold);
  assert.equal(wicks.length, g.bars.length, "심지 개수 불일치");
  g.bars.forEach((b, i) => {
    assert.equal(wicks[i].stroke, b.up ? COL.bull : COL.bear, "심지 " + i + " up=" + b.up);
  });
});

test("drawChart 가 예측 경로를 gold 로 스트로크한다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: prediction(60), width: 300, height: 200 });
  const ctx = recCtx();
  MSChart.drawChart(ctx, g, COL);
  assert.ok(ctx.calls.some(c => c.op === "stroke" && c.stroke === COL.gold), "예측 경로 gold 스트로크 없음");
});

test("몸통 높이는 최소 1px — 도지가 사라지지 않는다", () => {
  const doji = Array.from({ length: 30 }, () => ({ o: 100, h: 101, l: 99, c: 100 }));
  const g = MSChart.chartGeometry({ candle: doji, prediction: null, width: 300, height: 200 });
  const ctx = recCtx();
  MSChart.drawChart(ctx, g, COL);
  assert.ok(ctx.calls.filter(c => c.op === "fillRect").every(r => r.args[3] >= 1));
});
