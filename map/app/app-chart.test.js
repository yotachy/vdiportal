// app-chart — 차트 v1 기하 테스트(순수 함수 층). 기하 상수는 프로토 chart()(L2149~2187) 승계:
// 411×411 · 패딩 8/46/14/26 · 과거 구간 58% · 캔들 최대 56 · 예측선 55% 분할.
const { test } = require("node:test");
const assert = require("node:assert");
const chart = require("./app-chart.js");

function mkCandles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = 100 + i * 0.5 + 3 * Math.sin(i / 4);
    out.push({ o: c - 0.4, h: c + 1, l: c - 1, c: c, v: 1000 });
  }
  return out;
}
function mkPred(anchor, futW) {
  const path = [], lo = [], hi = [];
  for (let k = 1; k <= futW; k++) {
    path.push(anchor * (1 + 0.001 * k));
    lo.push(anchor * (1 - 0.002 * k));
    hi.push(anchor * (1 + 0.004 * k));
  }
  return { path: path, lo: lo, hi: hi, anchor: anchor, futW: futW };
}

test("build: 캔들 56봉 상한·바디 수 합=표시 봉수", () => {
  const m = chart.build(mkCandles(80), null, {});
  assert.equal(m.n, 56);
  const bodies = (m.up.match(/M/g) || []).length + (m.down.match(/M/g) || []).length;
  assert.equal(bodies, 56);
  assert.equal((m.wick.match(/M/g) || []).length, 56);
  assert.equal(m.view, "0 0 411 411");
});

test("build: 예측 없으면 콘·예측선 없음(분석 전 — 지침서 §5)", () => {
  const m = chart.build(mkCandles(60), null, {});
  assert.equal(m.cone, null);
  assert.equal(m.p1a, null);
});

test("스케일: 마지막 캔들 x=과거 구간 끝(8+pw×0.58 근사), 미래는 그 오른쪽", () => {
  const candles = mkCandles(60);
  const m = chart.build(candles, mkPred(candles[59].c, 30), {});
  const pastEnd = 8 + (411 - 8 - 46) * 0.58;
  assert.ok(Math.abs(m.xa - pastEnd) < 1e-6);
  assert.ok(m.xe > m.xa);
  assert.ok(Math.abs(m.xe - (411 - 46)) < 1e-6);
});

test("콘: M으로 시작·닫힌 경로(Z), 예측선 55% 분할(실선+점선 이어짐)", () => {
  const candles = mkCandles(60);
  const m = chart.build(candles, mkPred(candles[59].c, 20), {});
  assert.ok(/^M/.test(m.cone) && /Z$/.test(m.cone));
  assert.ok(/^M/.test(m.p1a) && /^M/.test(m.p1b));
  // p1a 끝점 = p1b 시작점(이어짐)
  const lastA = m.p1a.split("L").pop();
  const firstB = m.p1b.replace(/^M/, "").split("L")[0];
  assert.equal(lastA, firstB);
});

test("y 스케일 역전: 높은 가격일수록 작은 y", () => {
  const candles = mkCandles(60);
  const m = chart.build(candles, null, {});
  assert.ok(m.toY(200) < m.toY(100));
});

test("frac: 캔들 일부만(실행 연출용)", () => {
  const m = chart.build(mkCandles(60), null, { frac: 0.5 });
  const bodies = (m.up.match(/M/g) || []).length + (m.down.match(/M/g) || []).length;
  assert.equal(bodies, 28);   // round(56×0.5)
});

test("MA·볼린저 오버레이: 표시 봉수만큼의 폴리라인", () => {
  const m = chart.build(mkCandles(60), null, {});
  assert.ok(/^M/.test(m.ma));
  assert.equal((m.ma.match(/[ML]/g) || []).length, 56);
  assert.ok(/^M/.test(m.bu) && /^M/.test(m.bd));
});

test("svg: 레이어 조립 문자열 — 예측 있으면 콘·1차선 포함", () => {
  const candles = mkCandles(60);
  const m = chart.build(candles, mkPred(candles[59].c, 20), {});
  const s = chart.svg(m, { cone: true, pred: true, ma: true, boll: true });
  assert.ok(s.indexOf("<svg") === 0);
  assert.ok(s.indexOf("var(--up)") >= 0);
  assert.ok(s.indexOf('class="ch-cone"') >= 0);
  assert.ok(s.indexOf('class="ch-p1a"') >= 0);
  const s2 = chart.svg(chart.build(candles, null, {}), {});
  assert.ok(s2.indexOf("ch-cone") < 0);
});
