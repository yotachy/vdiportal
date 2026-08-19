// P2 §3 — 차트 레이어 티어 게이팅.
//
// 왜 관문이 필요한가: 이 요구는 **"안 그린다"** 라서 눈으로 확인이 안 된다. 기본 티어에
// 심화 레이어가 새도 화면은 멀쩡하고, 오히려 더 좋아 보인다. P1 까지 실제로 그랬다 —
// 티어로 갈리는 것은 예측선 개수뿐이었고 캔들·볼린저·MA·서브패널 3종은 항상 그려졌다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const D = require("../www/chart-draw.js");
const CL = require("../www/chart-layout.js");
const LY = require("../www/layout.js");

const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");

test("specOf — 세 티어가 실제로 다른 것을 그린다(인벤토리 §3 3단 비교표)", () => {
  const b = D.specOf("basic"), f = D.specOf("full"), c = D.specOf("custom");

  assert.strictEqual(b.price, "line", "기본은 종가 선 하나다");
  assert.strictEqual(f.price, "candle");
  assert.strictEqual(c.price, "candle");

  assert.strictEqual(b.cone, false, "기본에 80% 콘이 있으면 '범위만 말합니다'가 거짓이 된다");
  assert.strictEqual(f.cone, true);

  assert.deepEqual(b.panels, ["price"], "기본에 서브패널이 있다");
  assert.deepEqual(f.panels, ["price", "volume", "rsi", "macd"]);

  assert.deepEqual(b.overlays, [], "기본에 오버레이(볼린저·MA·배지)가 있다 — 심화를 공짜로 준다");
  assert.ok(f.overlays.length > 0, "심화에 오버레이가 없다");

  assert.deepEqual(b.lines, ["p1"]);
  assert.deepEqual(f.lines, ["p1", "p3"]);
  assert.deepEqual(c.lines, ["p1", "p2", "p3"]);
});

// "전문은 심화의 모든 블록을 유지한 채 조절판을 더한다" — 한 겹이라도 빠지면 5스쿱 낸
// 사람이 손해다(인벤토리 §3). 차트에서도 같다: custom 은 full 의 상위집합이어야 한다.
test("custom ⊇ full — 전문이 심화보다 덜 그리는 것은 하나도 없다", () => {
  const f = D.specOf("full"), c = D.specOf("custom");
  f.panels.forEach(p => assert.ok(c.panels.indexOf(p) >= 0, "전문에 없는 심화 패널: " + p));
  f.overlays.forEach(o => assert.ok(c.overlays.indexOf(o) >= 0, "전문에 없는 심화 오버레이: " + o));
  f.lines.forEach(l => assert.ok(c.lines.indexOf(l) >= 0, "전문에 없는 심화 예측선: " + l));
  assert.strictEqual(c.cone, f.cone, "전문이 콘을 잃었다");
  assert.strictEqual(c.price, f.price, "전문이 가격 표현을 잃었다");
});

test("모르는 티어는 basic 으로 떨어진다 — 오타가 유료 화면을 열지 않는다", () => {
  ["nope", "", null, undefined].forEach(t => {
    assert.deepEqual(D.specOf(t), D.specOf("basic"), "tier=" + JSON.stringify(t));
  });
});

// 호출부의 이름→함수 표가 CHART_TIERS 의 이름 집합을 정확히 덮는지 대조한다.
// 열거를 두 곳에 두면 한쪽만 늘어난 채로 조용히 안 그려진다 — 그리고 그 실패는
// "레이어 하나가 없다"라서 아무도 못 본다.
test("report.js 의 오버레이 표가 CHART_TIERS 의 이름을 정확히 덮는다", () => {
  const block = REPORT.match(/var OVERLAY_DRAW = \{([\s\S]*?)\n  \};/);
  assert.ok(block, "OVERLAY_DRAW 표가 없다 — 오버레이를 표 밖에서 부르고 있다");
  const keys = [...block[1].matchAll(/^\s{4}([a-zA-Z]+)\s*:/gm)].map(m => m[1]);
  const declared = D.allOverlays().slice().sort();
  assert.deepEqual(keys.slice().sort(), declared,
    "표의 키와 CHART_TIERS 의 오버레이 이름이 다르다.\n표: " + keys.join(",") + "\n선언: " + declared.join(","));
});

// 오버레이를 표 밖에서 직접 부르면 티어 게이팅을 우회한다 — 정확히 P1 의 상태였다.
test("오버레이는 표를 통해서만 그려진다 — MSLayers 직접 호출이 없다", () => {
  const body = REPORT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m, p) => p);
  const table = body.match(/var OVERLAY_DRAW = \{[\s\S]*?\n  \};/)[0];
  const outside = body.replace(table, "");
  const stray = [...outside.matchAll(/MSLayers\.(\w+)\(/g)].map(m => m[1])
    .filter(n => n !== "resetLabels");   // resetLabels 는 프레임 초기화지 레이어가 아니다
  assert.deepEqual(stray, [],
    "표 밖에서 MSLayers 를 직접 부른다: " + stray.join(", ") + " — 티어 게이팅을 우회한다");
});

test("서브패널도 표가 아니라 spec.panels 로 돈다", () => {
  const body = REPORT.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(body, /\["volume",\s*"rsi",\s*"macd"\]\.forEach/,
    "서브패널을 하드코딩 배열로 돈다 — 티어를 안 본다");
  assert.match(body, /spec\.panels\.forEach/, "서브패널이 spec.panels 를 안 돈다");
});

// 차트 높이. 기본 150 은 인색함이 아니라 설계다 — 블록 3개 화면이 스크롤 없이 끝나야
// "여기까지가 무료"가 스크롤 부재로 전달된다(시안 18a 의 의도된 빈 공간).
test("기본 티어 차트 높이는 유료보다 낮고, 화면 폭에 따라 달라지지 않는다", () => {
  const basicSingle = LY.chartHeight(false, 844, "basic");
  const basicDual = LY.chartHeight(true, 900, "basic");
  assert.strictEqual(basicSingle, basicDual, "2단이라고 기본 차트를 더 키운다 — 넓다고 더 파는 게 아니다");
  assert.ok(basicSingle < LY.chartHeight(false, 844, "full"), "기본이 심화보다 낮지 않다");
  assert.ok(basicSingle < LY.chartHeight(true, 900, "full"));
});

test("티어를 안 주면 기존 동작(유료 높이) 그대로 — 호출부 누락이 화면을 줄이지 않는다", () => {
  assert.strictEqual(LY.chartHeight(false, 844), LY.chartHeight(false, 844, "full"));
});

// 레이아웃이 spec.panels 를 실제로 받는지 — 기본에서 서브패널 rect 가 아예 없어야 한다.
// (있으면 나중에 누가 lay.panels.rsi 를 참조해도 조용히 그려진다.)
function candles(n) {
  const out = [];
  for (let i = 0; i < n; i++) { const b = 100 + i; out.push({ o: b, h: b + 2, l: b - 1, c: b, v: 1000 + i, t: "2026-01-01" }); }
  return out;
}
test("기본 레이아웃에는 서브패널 자리가 생기지 않는다", () => {
  const lay = CL.chartLayout({
    candle: candles(150), prediction: { path: [130], lo: [128], hi: [132] },
    width: 372, height: LY.chartHeight(false, 844, "basic"), pad: 10, tailBars: 120,
    panels: D.specOf("basic").panels
  });
  assert.ok(lay.panels.price, "가격 패널이 없다");
  ["volume", "rsi", "macd"].forEach(k =>
    assert.ok(!lay.panels[k], "기본인데 " + k + " 패널 자리가 생겼다"));
});
