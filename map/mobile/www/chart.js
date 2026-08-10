// Phase 0 차트 — 엔진 출력이 그림이 되는지 확인하는 최소 렌더러.
// 축·크로스헤어·핀치줌·로그축은 Phase 1 몫이며 여기 없다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSChart = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function chartGeometry(o) {
    var candle = o.candle || [];
    var pred = o.prediction || null;
    var W = o.width, H = o.height, pad = (o.pad == null ? 8 : o.pad);
    var tail = Math.min(o.tailBars || 120, candle.length);
    var src = candle.slice(candle.length - tail);
    var fut = (pred && pred.path) ? pred.path.length : 0;

    var min = Infinity, max = -Infinity;
    src.forEach(function (b) { if (b.l < min) min = b.l; if (b.h > max) max = b.h; });
    if (pred) {
      (pred.lo || []).forEach(function (v) { if (v < min) min = v; });
      (pred.hi || []).forEach(function (v) { if (v > max) max = v; });
    }
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (max - min < 1e-9) { min -= 0.5; max += 0.5; }   // 평탄 시리즈 0 나눗셈 방지

    var span = max - min;
    var plotW = W - pad * 2, plotH = H - pad * 2;
    var slots = Math.max(1, tail + fut);
    var dx = plotW / slots;
    function xAt(i) { return pad + dx * (i + 0.5); }
    function yAt(p) { return pad + plotH * (1 - (p - min) / span); }

    var bars = src.map(function (b, i) {
      return { x: xAt(i), yO: yAt(b.o), yH: yAt(b.h), yL: yAt(b.l), yC: yAt(b.c), up: b.c >= b.o };
    });
    var cone = { hi: [], lo: [] }, path = [];
    if (pred) {
      for (var k = 0; k < fut; k++) {
        var x = xAt(tail + k);
        path.push({ x: x, y: yAt(pred.path[k]) });
        if (pred.hi && pred.hi[k] != null) cone.hi.push({ x: x, y: yAt(pred.hi[k]) });
        if (pred.lo && pred.lo[k] != null) cone.lo.push({ x: x, y: yAt(pred.lo[k]) });
      }
    }
    return { bars: bars, cone: cone, path: path, bw: Math.max(1, dx * 0.62),
             min: min, max: max, tail: tail, fut: fut, dx: dx };
  }

  function drawChart(ctx, geo, col) {
    ctx.save();

    if (geo.cone.hi.length && geo.cone.lo.length) {
      ctx.beginPath();
      geo.cone.hi.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      for (var i = geo.cone.lo.length - 1; i >= 0; i--) ctx.lineTo(geo.cone.lo[i].x, geo.cone.lo[i].y);
      ctx.closePath();
      ctx.fillStyle = col.cone;
      ctx.fill();
    }

    geo.bars.forEach(function (b) {
      var c = b.up ? col.bull : col.bear;
      ctx.strokeStyle = c;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(b.x, b.yH); ctx.lineTo(b.x, b.yL); ctx.stroke();
      ctx.fillStyle = c;
      // 도지(시가=종가)도 보이도록 최소 1px
      ctx.fillRect(b.x - geo.bw / 2, Math.min(b.yO, b.yC), geo.bw, Math.max(1, Math.abs(b.yC - b.yO)));
    });

    if (geo.path.length) {
      ctx.beginPath();
      geo.path.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.strokeStyle = col.gold;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }

    ctx.restore();
  }

  return { chartGeometry: chartGeometry, drawChart: drawChart };
});
