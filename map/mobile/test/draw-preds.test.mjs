import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../www/draw-preds.js");

// 밴드가 벌어지는 예측(신뢰도가 실제로 감쇠하는 형태)
function band(n) {
  const lo = [], hi = [], vals = [];
  for (let k = 0; k < n; k++) { vals.push(100 + k * 0.4); lo.push(100 - (k + 1) * 0.9); hi.push(100 + (k + 1) * 1.1); }
  return { vals, lo, hi };
}
const LEVELS = [98, 101, 104, 107];
const TEX = Array.from({ length: 25 }, (_, i) => Math.sin(i * 0.7) * 0.01);

test("seed 는 심볼+주기에 결정론적이고, 다르면 갈라진다", () => {
  assert.equal(P.seed("AAPL", "1day"), P.seed("AAPL", "1day"));
  assert.notEqual(P.seed("AAPL", "1day"), P.seed("MSFT", "1day"));
  assert.notEqual(P.seed("AAPL", "1day"), P.seed("AAPL", "1week"));
  assert.ok(Number.isInteger(P.seed("AAPL", "1day")) && P.seed("AAPL", "1day") >= 0);
});

test("confAt 은 0..1 유한값이고 밴드가 벌어질수록 단조 감소한다", () => {
  const { lo, hi } = band(24);
  let prev = Infinity;
  for (let k = 0; k < 24; k++) {
    const v = P.confAt(lo, hi, k);
    assert.ok(isFinite(v) && v >= 0 && v <= 1, "k=" + k + " conf=" + v);
    assert.ok(v <= prev + 1e-12, "k=" + k + " 에서 신뢰도가 되레 올라갔다");
    prev = v;
  }
});

test("confSeq 는 길이를 보존하고 kEnd 를 0..n 안에 둔다", () => {
  const { lo, hi } = band(24);
  const cs = P.confSeq(lo, hi);
  assert.equal(cs.conf.length, 24);
  assert.ok(cs.kEnd > 0 && cs.kEnd <= 24, "kEnd=" + cs.kEnd);
  assert.ok(cs.conf.every(isFinite));
});

test("confSeq 는 밴드가 안 벌어지면 감쇠 없이 전부 1 · kEnd=n", () => {
  const lo = [99, 99, 99], hi = [101, 101, 101];
  const cs = P.confSeq(lo, hi);
  assert.deepEqual(cs.conf, [1, 1, 1]);
  assert.equal(cs.kEnd, 3);
});

test("wiggle 은 같은 시드·입력이면 같은 수열을 준다 — 프레임마다 흔들리면 지직거린다", () => {
  const { vals, lo, hi } = band(24);
  const a = P.wiggle(24, vals, lo, hi, LEVELS, TEX, 12345);
  const b = P.wiggle(24, vals, lo, hi, LEVELS, TEX, 12345);
  assert.deepEqual(a, b);
});

test("wiggle 은 시드가 다르면 다른 수열을 준다", () => {
  const { vals, lo, hi } = band(24);
  const a = P.wiggle(24, vals, lo, hi, LEVELS, null, 1);
  const b = P.wiggle(24, vals, lo, hi, LEVELS, null, 999);
  assert.notDeepEqual(a, b);
});

test("wiggle 은 길이를 보존하고 NaN 을 내지 않으며 밴드 안에 머문다", () => {
  const { vals, lo, hi } = band(24);
  const w = P.wiggle(24, vals, lo, hi, LEVELS, TEX, 7);
  assert.equal(w.length, 24);
  w.forEach((v, k) => {
    assert.ok(isFinite(v), "k=" + k + " 가 NaN");
    assert.ok(v >= lo[k] - 1e-9 && v <= hi[k] + 1e-9, "k=" + k + " 가 밴드 밖: " + v);
  });
});

test("wiggle 은 center 가 밴드 밖이어도 밴드 안으로 하드 클램프한다", () => {
  // 기존 band() 픽스처는 진폭이 1/4 밴드폭이라 클램프가 절대 안 물린다 —
  // center 를 밴드 위로 크게 띄워 클램프가 실제로 작동하는 입력을 만든다.
  const n = 4, vals = [110, 110, 110, 110];
  const lo = [100, 100, 100, 100], hi = [101, 102, 103, 104];
  const w = P.wiggle(n, vals, lo, hi, [100.5, 103], null, 3);
  w.forEach((v, k) => assert.ok(v >= lo[k] && v <= hi[k], "k=" + k + " 가 밴드 밖: " + v));
});

test("tex·levels 가 둘 다 없으면 원본 vals 를 그대로 돌려준다 — 결을 지어내지 않는다", () => {
  const { vals, lo, hi } = band(24);
  assert.deepEqual(P.wiggle(24, vals, lo, hi, null, null, 7), vals);
  assert.deepEqual(P.wiggle(24, vals, lo, hi, [], undefined, 7), vals);
});

test("tex 만 없어도 levels 가 있으면 계산한다 — 꿈틀의 주항은 S/R 반응이다", () => {
  const { vals, lo, hi } = band(24);
  const w = P.wiggle(24, vals, lo, hi, LEVELS, null, 7);
  assert.ok(w.some((v, k) => Math.abs(v - vals[k]) > 1e-9), "levels 가 있는데 매끈하다");
});

test("wigSeq 는 레벨 위에서 반응이 최대, 레벨 사이에서 최소다", () => {
  // 100→110 등간격 램프 · 레벨 [100,110] → k=0 은 레벨 위(|pull|=1), k=5 는 정확히 중간(pull≈0).
  // tex 를 0으로 채워 AR 항을 완전히 지운다 — 안 그러면 PRNG 결이 우연히 대소를 만들어
  // S/R 위상항을 통째로 지워도 통과한다(실측).
  const n = 11, vals = Array.from({ length: n }, (_, k) => 100 + k);
  const lo = vals.map(v => v - 2), hi = vals.map(v => v + 2);
  const seq = P.wigSeq(n, vals, lo, hi, [100, 110], new Array(n).fill(0), 42);
  assert.equal(seq.length, n);
  assert.ok(seq.every(v => isFinite(v) && Math.abs(v) <= 1 + 1e-9), "[-1,1] 정규화가 깨졌다");
  assert.ok(Math.abs(seq[0]) > 0.99, "레벨 위에서 반응이 최대가 아니다: " + seq[0]);
  assert.ok(Math.abs(seq[5]) < 0.01, "레벨 사이에서 반응이 0 이 아니다: " + seq[5]);
});

// ── 페이드 스트로크 ──
function recCtx() {
  const calls = [], st = { fillStyle: null, strokeStyle: null, lineWidth: null, globalAlpha: 1, font: null, textAlign: null, letterSpacing: null, lineJoin: null, lineCap: null };
  const rec = n => (...a) => calls.push({ op: n, args: a, fill: st.fillStyle, stroke: st.strokeStyle, lw: st.lineWidth, font: st.font });
  const c = {};
  for (const n of ["save","restore","beginPath","closePath","moveTo","lineTo","fill","stroke","fillRect","arc","setLineDash","fillText","rect","clip","translate","roundRect"]) c[n] = rec(n);
  c.measureText = t => ({ width: String(t).length * 6 });
  for (const k of Object.keys(st)) Object.defineProperty(c, k, { get: () => st[k], set: v => { st[k] = v; } });
  c.calls = calls;
  return c;
}
const strokeOpts = (over) => Object.assign({
  n: 6, x0: 0, y0: 50,
  xAt: k => 10 * (k + 1), yAt: k => 50 - k,
  conf: [1, 0.9, 0.8, 0.4, 0.3, 0.2], kEnd: 3,
  rgb: "232,180,99", dash: null, lw: 2
}, over || {});

test("신뢰 구간은 봉마다 실선 세그먼트, 지평 이후는 점묘다", () => {
  const c = recCtx();
  P.strokeLine(c, strokeOpts());
  assert.equal(c.calls.filter(x => x.op === "stroke").length, 3, "실선 세그먼트가 kEnd 와 다르다");
  assert.equal(c.calls.filter(x => x.op === "arc").length, 3, "지평 이후 점묘 수가 n-kEnd 와 다르다");
});

test("알파와 굵기가 신뢰도를 따라 줄어든다 — 감쇠가 보여야 한다", () => {
  const c = recCtx();
  P.strokeLine(c, strokeOpts());
  const seg = c.calls.filter(x => x.op === "stroke");
  const alphaOf = s => parseFloat(/rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(s)[1]);
  assert.ok(alphaOf(seg[0].stroke) > alphaOf(seg[2].stroke), "먼 구간이 더 진하다");
  assert.ok(seg[0].lw > seg[2].lw, "먼 구간이 더 굵다");
});

test("n=0 이면 아무것도 그리지 않는다", () => {
  const c = recCtx();
  P.strokeLine(c, strokeOpts({ n: 0, kEnd: 0, conf: [] }));
  assert.equal(c.calls.filter(x => x.op === "stroke" || x.op === "arc").length, 0);
});

test("좌표가 유한하지 않은 봉은 건너뛴다", () => {
  const c = recCtx();
  P.strokeLine(c, strokeOpts({ yAt: k => (k === 1 ? NaN : 50 - k) }));
  assert.equal(c.calls.filter(x => x.op === "stroke").length, 2, "NaN 봉을 그렸다");
});

test("dash 를 주면 점선으로, 안 주면 실선으로 긋는다", () => {
  const dashed = recCtx(); P.strokeLine(dashed, strokeOpts({ dash: [6, 4] }));
  assert.ok(dashed.calls.some(x => x.op === "setLineDash" && x.args[0] && x.args[0].length === 2));
  const solid = recCtx(); P.strokeLine(solid, strokeOpts());
  const set = solid.calls.filter(x => x.op === "setLineDash" && x.args[0] && x.args[0].length);
  assert.equal(set.length, 0, "dash 없이 점선을 그렸다");
});

// ── 끝점 장식 ──
const L = require("../www/draw-layers.js");
const BOX = { padX: 10, plotW: 300, padTop: 10, padBot: 0, ch: 280 };
const deco = (over) => Object.assign({
  path: Array.from({ length: 24 }, (_, k) => 100 + k * 0.4),
  seamX: 120, coneR: 300, toY: v => 280 - (v - 95) * 4,
  box: BOX, tf: "1day", col: "#e8b463", label: "1차·62%", labelDy: -12, showPx: true
}, over || {});

test("epicenter 는 동심 코어를 arc 로 실제로 그린다", () => {
  const c = recCtx();
  P.epicenter(c, 100, 50, "#e8b463", 1);
  const arcs = c.calls.filter(x => x.op === "arc");
  assert.equal(arcs.length, 2, "코어+화이트닷 2개가 아니다");
  assert.ok(arcs[0].args[2] > arcs[1].args[2],
            "글로우 코어가 안쪽 흰 점보다 커야 한다: " + arcs[0].args[2] + " vs " + arcs[1].args[2]);
});

test("epicenter 는 좌표가 유한하지 않으면 아무것도 안 그린다", () => {
  const c = recCtx();
  P.epicenter(c, NaN, 50, "#e8b463", 1);
  assert.equal(c.calls.length, 0);
});

test("endDeco 는 진앙과 라벨을 모두 페인트한다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  P.endDeco(c, deco());
  assert.ok(c.calls.some(x => x.op === "arc"), "진앙이 없다");
  const texts = c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0]));
  assert.ok(texts.some(t => t.indexOf("1차") === 0), "차수 라벨이 없다: " + texts.join("|"));
  assert.equal(texts.length, 2, "차수 라벨 + 끝점 예측가 두 개여야 한다");
});

test("endDeco 가 그린 라벨은 공유 레지스트리에 예약된다 — 지표 배지가 이를 피해야 한다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  P.endDeco(c, deco());
  assert.ok(L.predBoxes().length >= 1, "예측 라벨 박스가 예약되지 않았다");
  assert.equal(L.evBoxes().length, L.predBoxes().length, "근거 라벨 레지스트리에 반영되지 않았다");
});

test("endDeco 는 resetLabels 없이 불러도 던지지 않는다", () => {
  const c = recCtx();
  assert.doesNotThrow(() => P.endDeco(c, deco()));
});

test("endDeco 는 빈 경로면 조용히 끝난다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  P.endDeco(c, deco({ path: [] }));
  assert.equal(c.calls.length, 0);
});

test("endDeco 는 끝점 y 를 가격 패널 안으로 클램프한다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  // path 를 3봉으로 줄여 마일스톤 점을 없앤다(_hzList 가 h<=pl 만 남기므로 [] 가 된다) —
  // 그래야 남는 arc 가 진앙뿐이라 클램프를 단독으로 단언할 수 있다.
  P.endDeco(c, deco({ path: [100, 101, 102], toY: () => -9999, showPx: false, label: null }));
  const arcs = c.calls.filter(x => x.op === "arc");
  assert.equal(arcs.length, 2, "클램프 후에도 진앙(코어+화이트닷)은 그려야 한다");
  arcs.forEach(a => assert.ok(a.args[1] >= BOX.padTop && a.args[1] <= BOX.ch, "진앙 y=" + a.args[1] + " 가 패널 밖"));
});

test("pcal 은 예측 방향 자체의 실현확률 — 확신이 약할수록 50 아래로 내려간다", () => {
  // calibrateUpProb 는 [0,100]→[25,86] 으로 압축한다. 그래서 '깊은 하락'은 낮은 값이 아니라
  // 높은 값이 된다(방향이 하락이고 그 하락이 실현될 확률이 높으므로).
  // 50 미만 = 반대가 우세 = 예측 방향의 근거가 약하다는 뜻이다.
  const strongUp = P.pcal([100, 110], [104, 118], 100, 1);   // 70
  const strongDn = P.pcal([100, 90],  [104, 98],  100, 1);   // 52
  const weakDn   = P.pcal([100, 99.5],[104, 108], 100, 1);   // 42 — 밴드 상단이 지배, 반대 우세
  [strongUp, strongDn, weakDn].forEach(v =>
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, "pcal 이 0..100 정수가 아니다: " + v));
  assert.ok(strongDn > weakDn, "확신이 깊은 하락이 얕은 하락보다 낮게 나왔다: " + strongDn + " vs " + weakDn);
  assert.ok(weakDn < 50, "반대 우세(50 미만) 경로가 만들어지지 않는다: " + weakDn);
  assert.ok(strongUp > 50, "상승 예측이 50 이하다: " + strongUp);
});

test("_tfUnit 은 월/주/일 순으로 판별한다 — 순서가 뒤집히면 마일스톤 봉이 달라진다", () => {
  const arcsFor = (tf) => {
    const c = recCtx(); L.resetLabels(372, 520);
    P.endDeco(c, deco({ tf: tf, label: null, showPx: false }));
    return c.calls.filter(x => x.op === "arc").length;   // 진앙 2 + 마일스톤 n
  };
  assert.equal(arcsFor("1month"), 5, "월봉 마일스톤 수가 다르다");
  assert.equal(arcsFor("1day"),   4, "일봉 마일스톤 수가 다르다");
  assert.equal(arcsFor("1week"), 3, "주봉 마일스톤 수가 다르다");
});

test("끝점 라벨은 이미 예약된 박스를 피해 밀린다 — 회피가 죽으면 겹쳐 그린다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  P.endDeco(c, deco());                              // 1차 — 라벨 + 예측가 예약
  const first = L.predBoxes().slice();
  assert.ok(first.length >= 1, "첫 호출이 아무것도 예약하지 않았다");
  P.endDeco(c, deco());                              // 같은 기하로 한 번 더 — 반드시 다른 자리로
  const second = L.predBoxes().slice(first.length);
  assert.ok(second.length >= 1, "두 번째 호출이 아무것도 예약하지 않았다");
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  first.forEach(a => second.forEach(b =>
    assert.ok(!hit(a, b), "두 번째 라벨이 첫 번째와 겹쳤다: " + JSON.stringify(a) + " vs " + JSON.stringify(b))));
});
