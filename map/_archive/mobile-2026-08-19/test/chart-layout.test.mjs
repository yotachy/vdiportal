import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const CL = require("../www/chart-layout.js");

function candles(n, flat) {
  const out = [];
  for (let i = 0; i < n; i++) { const b = flat ? 100 : 100 + i; out.push({ o: b, h: b + 2, l: b - 1, c: b + (i % 2 ? 1 : -1), v: 1000 + i }); }
  return out;
}
function prediction(n) {
  const path = [], lo = [], hi = [];
  for (let i = 0; i < n; i++) { path.push(200 + i); lo.push(195 + i); hi.push(205 + i); }
  return { path, lo, hi, futW: n };
}
const base = () => ({ candle: candles(300), prediction: prediction(24), width: 372, height: 520, pad: 10, tailBars: 120 });

test("패널 높이 합이 전체 높이에서 패딩·하단 날짜축 여백을 뺀 값과 같다", () => {
  const L = CL.chartLayout(base());
  const hs = L.order.map(k => L.panels[k].rect.h);
  const gaps = (L.order.length - 1) * CL.GAP;
  assert.ok(Math.abs(hs.reduce((a, b) => a + b, 0) + gaps - (520 - 20 - CL.AXIS_LABEL_H)) < 0.01);
});

test("패널은 위에서 아래로 겹치지 않게 쌓인다", () => {
  const L = CL.chartLayout(base());
  let prevBottom = -1;
  for (const k of L.order) {
    const r = L.panels[k].rect;
    assert.ok(r.y >= prevBottom, k + " 패널이 위 패널과 겹친다");
    prevBottom = r.y + r.h;
  }
});

test("fi 는 원본 배열의 절대 인덱스다 — nowFi 는 마지막 봉", () => {
  const L = CL.chartLayout(base());
  assert.equal(L.nowFi, 299);
  assert.equal(L.fiMin, 180, "300봉 중 꼬리 120 => 180 부터");
});

test("가격 패널 pToY 는 최고/최저를 rect 경계에 매핑한다", () => {
  const L = CL.chartLayout(base());
  const p = L.panels.price, M = p.M;
  const tail = candles(300).slice(180);
  const lo = Math.min(...tail.map(b => b.l), ...prediction(24).lo);
  const hi = Math.max(...tail.map(b => b.h), ...prediction(24).hi);
  assert.ok(Math.abs(M.pToY(hi) - p.rect.y) < 0.01);
  assert.ok(Math.abs(M.pToY(lo) - (p.rect.y + p.rect.h)) < 0.01);
});

test("RSI 패널은 0-100 고정 스케일이다", () => {
  const L = CL.chartLayout(base());
  const r = L.panels.rsi;
  assert.ok(Math.abs(r.M.pToY(100) - r.rect.y) < 0.01);
  assert.ok(Math.abs(r.M.pToY(0) - (r.rect.y + r.rect.h)) < 0.01);
});

test("M 은 포팅 함수가 요구하는 11키를 모두 갖는다", () => {
  const L = CL.chartLayout(base());
  const need = ["fiToX", "pToY", "nowFi", "fiMin", "reveal", "xRight", "xNow", "futBars", "focused", "badgeY", "lastPrice"];
  for (const k of Object.keys(L.panels)) {
    for (const key of need) assert.ok(key in L.panels[k].M, k + " 패널 M 에 " + key + " 없음");
  }
});

test("reveal 은 Infinity — Phase 1 에 리빌 애니메이션이 없다", () => {
  const L = CL.chartLayout(base());
  assert.equal(L.panels.price.M.reveal, Infinity);
});

test("예측이 있으면 xNow 가 마지막 실봉 x, xRight 가 플롯 오른쪽 끝", () => {
  const L = CL.chartLayout(base());
  const M = L.panels.price.M;
  assert.ok(M.xNow < M.xRight, "예측 구간이 오른쪽에 없다");
  assert.ok(Math.abs(M.xNow - L.fiToX(L.nowFi)) < 0.01);
});

test("평탄 시리즈에서 NaN 이 나오지 않는다", () => {
  const L = CL.chartLayout(Object.assign(base(), { candle: candles(60, true).map(() => ({ o: 100, h: 100, l: 100, c: 100, v: 0 })), prediction: null }));
  assert.ok(Number.isFinite(L.panels.price.M.pToY(100)));
  assert.ok(Number.isFinite(L.panels.volume.M.pToY(0)));
});

test("패널을 빼면 남은 패널이 높이를 나눠 갖는다", () => {
  const L = CL.chartLayout(Object.assign(base(), { panels: ["price", "volume"] }));
  assert.deepEqual(L.order, ["price", "volume"]);
  assert.equal(L.panels.rsi, undefined);
  const hs = L.order.map(k => L.panels[k].rect.h);
  assert.ok(Math.abs(hs.reduce((a, b) => a + b, 0) + CL.GAP - (520 - 20 - CL.AXIS_LABEL_H)) < 0.01);
});

test("lastPrice 는 마지막 종가다 — 거래량 레이어가 쓴다", () => {
  const L = CL.chartLayout(base());
  const c = candles(300);
  assert.equal(L.panels.volume.M.lastPrice, c[299].c);
});

// Fix 4: spec §8이 요구한 "레이아웃의 미래 비중 25% 이상"을 검증하는 테스트가 없어서,
// report.js의 TAIL_BARS를 120으로 되돌려도(헤드라인 변경 하나를 조용히 무효화해도) 관문이 그대로 초록이었다.
test("tailBars:60·예측 24봉이면 미래 구간이 플롯 폭의 25% 이상을 차지한다 — spec §8", () => {
  const L = CL.chartLayout(Object.assign(base(), { tailBars: 60 }));
  const share = L.fut / (L.tail + L.fut);
  assert.ok(share >= 0.25, "미래 비중 " + (share * 100).toFixed(1) + "% — 25% 미만");
});

// Phase 4: TAIL_BARS 상수는 사라지고 tail(줌 레벨) 변수가 됐다(report.js, paintChart 스코프).
// 초기값의 단일 출처는 이제 MSZoom.DEFAULT_TAIL(chart-zoom.js) — 그 값과 report.js 가 실제로
// 참조하는지를 함께 검증해야 "리터럴 되돌림" 회귀를 계속 잡을 수 있다.
test("report.js 의 tail 초기값은 MSZoom.DEFAULT_TAIL(60)이다 — 되돌리면 여기서 잡힌다", () => {
  const MSZoom = require("../www/chart-zoom.js");
  assert.equal(MSZoom.DEFAULT_TAIL, 60, "MSZoom.DEFAULT_TAIL 이 60이 아니다(되돌려졌을 가능성) — 미래 비중 25% 요건이 깨진다");
  const src = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");
  assert.ok(/var\s+tail\s*=\s*MSZoom\.DEFAULT_TAIL/.test(src),
    "report.js 가 tail 초기값을 MSZoom.DEFAULT_TAIL 에서 가져오지 않는다");
});

test("plotWidth 는 chartLayout 이 실제로 쓰는 폭과 같다 — 두 곳에서 따로 계산하면 갈라진다", () => {
  for (const W of [320, 373, 673, 884, 1000]) {
    for (const pad of [0, 6, 10, 16]) {
      const lay = CL.chartLayout({ candle: candles(150), prediction: null, width: W, height: 520, pad: pad, tailBars: 60 });
      assert.equal(CL.plotWidth(W, pad), lay.plot.w, "W=" + W + " pad=" + pad);
    }
  }
});

test("plotWidth 는 pad 를 생략하면 10 을 쓴다 — chartLayout 의 기본값과 같아야 한다", () => {
  assert.equal(CL.plotWidth(373), CL.plotWidth(373, 10));
  const lay = CL.chartLayout({ candle: candles(150), prediction: null, width: 373, height: 520, tailBars: 60 });
  assert.equal(CL.plotWidth(373), lay.plot.w);
});

test("plotWidth 는 화면폭별 실측값과 일치한다 — 구현이 아니라 값을 고정한다", () => {
  // 설계서 §4 실측표. plotW = W - 2*pad - AXIS_W(44)
  const want = { 320: 256, 373: 309, 673: 609, 884: 820, 1000: 936 };
  for (const W of Object.keys(want)) {
    assert.equal(CL.plotWidth(+W, 10), want[W], "W=" + W);
  }
});

test("우측 가격축 자리가 실제로 남는다 — plotWidth 가 AXIS_W 를 빼먹으면 축이 캔버스 밖에 그려진다", () => {
  for (const W of [320, 373, 673, 884]) {
    for (const pad of [0, 10, 16]) {
      const lay = CL.chartLayout({ candle: candles(150), prediction: prediction(24), width: W, height: 520, pad: pad, tailBars: 60 });
      assert.equal(lay.plot.x + lay.plot.w + CL.AXIS_W, W - pad,
                   "W=" + W + " pad=" + pad + " — 축 거터가 안 맞는다");
    }
  }
});
