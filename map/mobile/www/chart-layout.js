// 4단 적층 차트의 좌표계. 각 패널이 자기 pToY 를 갖고 fiToX 를 공유한다 —
// 이 M 이 PC 에서 포팅한 _drawXLayers(c, data, M) 의 인자와 같은 모양이라 수정 없이 꽂힌다.
// fi 는 꼬리 구간 인덱스가 아니라 원본 candle 배열의 절대 인덱스다(지표 시계열과 정렬해야 하므로).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSChartLayout = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RATIOS = { price: 0.52, volume: 0.12, rsi: 0.18, macd: 0.18 };
  var GAP = 8;                      // 패널 사이 여백(px)
  var AXIS_W = 44;                  // 우측 가격축 폭

  // plotW 는 chart-zoom 도 써야 한다. 두 곳에서 따로 계산하면 갈라지므로 여기가 단일 출처다.
  function plotWidth(W, pad) { return W - (pad == null ? 10 : pad) * 2 - AXIS_W; }

  function chartLayout(o) {
    var candle = o.candle || [], pred = o.prediction || null;
    var W = o.width, H = o.height, pad = (o.pad == null ? 10 : o.pad);
    var order = (o.panels && o.panels.length) ? o.panels.slice() : ["price", "volume", "rsi", "macd"];

    var n = candle.length;
    var tail = Math.min(o.tailBars || 120, n);
    var fiMin = Math.max(0, n - tail), nowFi = n - 1;
    var fut = (pred && pred.path) ? pred.path.length : 0;

    var plotW = plotWidth(W, pad);
    var slots = Math.max(1, tail + fut);
    var dx = plotW / slots;
    function fiToX(fi) { return pad + (fi - fiMin + 0.5) * dx; }
    var xNow = fiToX(nowFi), xRight = pad + plotW;

    // 높이 배분 — 요청된 패널의 비율만 정규화한다
    var sum = order.reduce(function (s, k) { return s + (RATIOS[k] || 0); }, 0) || 1;
    var avail = H - pad * 2 - GAP * Math.max(0, order.length - 1);

    function mapper(rect, lo, hi) {
      if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
      if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
      return function (v) { return rect.y + rect.h * (1 - (v - lo) / (hi - lo)); };
    }

    var tailBars = candle.slice(fiMin);
    var pLo = Infinity, pHi = -Infinity;
    tailBars.forEach(function (b) { if (b.l < pLo) pLo = b.l; if (b.h > pHi) pHi = b.h; });
    if (pred) {
      (pred.lo || []).forEach(function (v) { if (v < pLo) pLo = v; });
      (pred.hi || []).forEach(function (v) { if (v > pHi) pHi = v; });
    }
    var vMax = 0;
    tailBars.forEach(function (b) { var v = (b.v != null && isFinite(b.v)) ? b.v : 0; if (v > vMax) vMax = v; });

    var scales = { price: [pLo, pHi], volume: [0, vMax], rsi: [0, 100], macd: null };
    var lastPrice = n ? candle[n - 1].c : 0;

    var panels = {}, y = pad;
    order.forEach(function (k, i) {
      var h = avail * ((RATIOS[k] || 0) / sum);
      var rect = { x: pad, y: y, w: plotW, h: h };
      var sc = scales[k];
      // 서브패널(volume·rsi·macd)의 pToY 는 Phase 1 에서 쓰이지 않는다 — fcDrawX 렌더러가
      // (cw, ch) 를 받아 자체 기하를 계산하기 때문이다. 그래도 채워 두는 이유는 두 가지:
      // M 계약을 패널마다 동일하게 유지하는 것과, 크로스헤어를 서브패널까지 확장할 때 필요한 것.
      var pToY = sc ? mapper(rect, sc[0], sc[1]) : mapper(rect, -1, 1);
      panels[k] = {
        rect: rect,
        M: { fiToX: fiToX, pToY: pToY, nowFi: nowFi, fiMin: fiMin, reveal: Infinity,
             xRight: xRight, xNow: xNow, futBars: fut, focused: false,
             badgeY: rect.y + 14, lastPrice: lastPrice }
      };
      y += h + GAP;
    });

    return { fiToX: fiToX, nowFi: nowFi, fiMin: fiMin, tail: tail, fut: fut,
             bw: Math.max(1, dx * 0.62), order: order, panels: panels,
             plot: { x: pad, w: plotW }, axisW: AXIS_W, priceRange: [pLo, pHi] };
  }

  return { RATIOS: RATIOS, GAP: GAP, AXIS_W: AXIS_W, plotWidth: plotWidth, chartLayout: chartLayout };
});
