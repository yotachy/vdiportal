// 캔들 · 예측 콘 · 축 · 크로스헤어. 좌표는 전부 chart-layout 의 Layout 에서 온다.
// 핀치줌·팬·로그축·전체화면은 Phase 1 범위 밖이다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./draw-preds.js"));
  else root.MSChartDraw = factory(root.MSPreds);
})(typeof self !== "undefined" ? self : this, function (MSPreds) {
  "use strict";

  var AXIS_FONT = "600 11px Pretendard, ui-monospace, monospace";   // 11px — 하한 10.5px 를 넘긴다

  // ── 티어별 차트 구성 (P2 §3 · 인벤토리 §3 3단 비교표) ────────────────────────────────
  // P1 까지 티어로 갈리는 것은 예측선 개수뿐이었다 — 캔들·볼린저·MA·서브패널 3종이 티어와
  // 무관하게 항상 그려졌다. 즉 **기본분석이 심화의 차트를 공짜로 보여주고 있었다.**
  // 레이어 정책을 여기 한 곳에 모은다: 호출부가 "무엇을 그릴지"를 스스로 판단하면 티어가
  // 늘 때마다 호출부를 뒤져야 하고, 빠뜨려도 화면은 멀쩡해 보인다(오히려 더 좋아 보인다).
  //
  // 예측선은 각각 "정의 가능해지는" 티어에서 열린다(임의 잠금이 아님):
  //  - 1차(종합 예측)는 항상 정의됨 → basic 부터. 단 basic 은 범위가 없어 점선으로 긋는다.
  //  - 2차(선택 지표 재예측)는 "어떤 지표를 셀지" 사용자가 골라야 정의됨 → 그게 바로 custom.
  //  - 3차(반대 시나리오)는 full 의 포지셔닝이 값을 지불하는 정직성 장치 → full 부터.
  //
  // ⚠ basic 의 종가 선은 "덜 그린 캔들"이 아니다(drawCandles 를 회색으로 만들지 말 것).
  // 인벤토리 §3: "기본을 일부러 초라하게 만들지 않는다 — 선 하나로도 방향과 범위는 정확히
  // 답한다. 다만 그 이상은 말하지 않는다."
  var FULL_PANELS = ["price", "volume", "rsi", "macd"];
  var FULL_OVERLAYS = ["bollinger", "ma", "rsiBadge", "volumeBadge"];
  var CHART_TIERS = {
    basic:  { price: "line",   cone: false, lines: ["p1"],                panels: ["price"], overlays: [] },
    full:   { price: "candle", cone: true,  lines: ["p1", "p3"],          panels: FULL_PANELS, overlays: FULL_OVERLAYS },
    // 전문은 심화의 모든 레이어를 유지한 채 2차선을 더한다 — 한 겹이라도 빼면 5스쿱 낸 사람이
    // 손해다(인벤토리 §3). 그래서 같은 배열을 참조한다: 심화가 늘면 전문도 자동으로 는다.
    custom: { price: "candle", cone: true,  lines: ["p1", "p2", "p3"],    panels: FULL_PANELS, overlays: FULL_OVERLAYS }
  };

  function specOf(tier) {
    return CHART_TIERS[tier] || CHART_TIERS.basic;
  }
  function linesFor(tier) {
    return specOf(tier).lines;
  }
  // 오버레이 이름 전체 — 호출부의 이름→함수 표가 이 목록을 정확히 덮는지 관문이 대조한다.
  // (열거를 두 곳에 두면 한쪽만 늘어난 채로 조용히 안 그려진다.)
  function allOverlays() {
    var seen = [];
    Object.keys(CHART_TIERS).forEach(function (k) {
      CHART_TIERS[k].overlays.forEach(function (n) { if (seen.indexOf(n) < 0) seen.push(n); });
    });
    return seen;
  }

  // 기본 티어의 가격 표현 — 종가 하나로 잇는 선. 캔들과 같은 좌표계를 쓰되 몸통·꼬리가 없다.
  function drawCloseLine(c, lay, candle, col) {
    var p = lay.panels.price; if (!p) return;
    var M = p.M, i, first = true;
    c.save();
    c.beginPath();
    c.lineWidth = 1.8;
    c.strokeStyle = col.ink3 || col.axis || "#9aa3b6";
    for (i = lay.fiMin; i <= lay.nowFi; i++) {
      var b = candle[i]; if (!b) continue;
      var x = lay.fiToX(i), y = M.pToY(b.c);
      if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y);
    }
    c.stroke();
    c.restore();
  }

  function drawCandles(c, lay, candle, col) {
    var p = lay.panels.price; if (!p) return;
    var M = p.M, bw = lay.bw;
    c.save();
    for (var fi = lay.fiMin; fi <= lay.nowFi; fi++) {
      var b = candle[fi]; if (!b) continue;
      var up = b.c >= b.o, color = up ? col.bull : col.bear;
      var x = M.fiToX(fi);
      c.strokeStyle = color; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, M.pToY(b.h)); c.lineTo(x, M.pToY(b.l)); c.stroke();
      c.fillStyle = color;
      var yO = M.pToY(b.o), yC = M.pToY(b.c);
      c.fillRect(x - bw / 2, Math.min(yO, yC), bw, Math.max(1, Math.abs(yC - yO)));
    }
    c.restore();
  }

  // xs 는 pred.path 기준(콘/1차)으로 만든 x 좌표 배열이지만, 세 선 모두 "지금 봉 + 1" 부터
  // 같은 간격으로 이어지므로 길이만 다르면 그 선의 길이에 맞게 그 자리에서 새로 뽑는다.
  function xsFor(M, lay, n) {
    var xs = [], i;
    for (i = 0; i < n; i++) xs.push(M.fiToX(lay.nowFi + 1 + i));
    return xs;
  }
  function strokeLine(c, M, lay, arr, style, width, dash) {
    if (!arr || !arr.length) return;
    var xs = xsFor(M, lay, arr.length), i;
    c.beginPath();
    for (i = 0; i < arr.length; i++) { var y = M.pToY(arr[i]); i ? c.lineTo(xs[i], y) : c.moveTo(xs[i], y); }
    c.setLineDash(dash || []);
    c.strokeStyle = style; c.lineWidth = width; c.stroke();
    c.setLineDash([]);
  }

  // _strokePredLine 은 봉별 알파를 만들어야 하므로 hex 가 아니라 "r,g,b" 를 받는다.
  function rgbOf(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (isFinite(r) && isFinite(g) && isFinite(b)) ? (r + "," + g + "," + b) : "232,180,99";
  }
  // 예측 시작 경계 — drawAxes 의 예측 시작 점선과 같은 자리여야 한다.
  function seamOf(lay) {
    var d = lay.fiToX(lay.nowFi) - lay.fiToX(lay.nowFi - 1);
    return lay.fiToX(lay.nowFi) + (isFinite(d) ? d : 0) / 2;
  }
  // 끝점 장식의 세로 클램프는 가격 패널 안이어야 한다 —
  // PC 는 차트 전체가 가격 패널이라 ch 를 그대로 썼지만 모바일은 4단 적층이다.
  function boxOf(lay) {
    var r = lay.panels.price.rect;
    return { padX: lay.plot.x, plotW: lay.plot.w, padTop: r.y, padBot: 0, ch: r.y + r.h };
  }

  function drawCone(c, lay, pred, col, tier, opts) {
    if (!pred || !pred.path || !pred.path.length) return;
    var p = lay.panels.price; if (!p) return;
    var M = p.M, n = pred.path.length, i;
    var xs = xsFor(M, lay, n);
    var o = opts || {};
    var sd = MSPreds.seed(o.sym, o.tf);
    var lo = pred.lo || [], hi = pred.hi || [];
    var anchor = (pred.anchor != null) ? pred.anchor : pred.path[0];
    var seamX = seamOf(lay), box = boxOf(lay);
    var spec = specOf(tier);
    c.save();
    // 기본 티어는 밴드를 안 칠한다 — 시안 18a 가 "범위만 말합니다"를 숫자로 적고 차트에는
    // 범위를 안 그린다(3단 비교표: 예측선 "점선 한 줄, 범위 없음"). 엔진은 lo/hi 를 계속
    // 주므로(꿈틀·신뢰 감쇠가 그 값을 쓴다) 데이터가 아니라 **표현**만 뺀다.
    if (spec.cone && hi.length && lo.length) {
      c.beginPath();
      for (i = 0; i < n; i++) { var yh = M.pToY(hi[i]); i ? c.lineTo(xs[i], yh) : c.moveTo(xs[i], yh); }
      for (i = n - 1; i >= 0; i--) c.lineTo(xs[i], M.pToY(lo[i]));
      c.closePath(); c.fillStyle = col.cone; c.fill();
    }

    // 꿈틀 + 신뢰 페이드 + 끝점 장식. 밴드가 없으면 신뢰도를 정의할 수 없으므로 Phase 1 폴백.
    function wigLine(vals, hex, dash, lw, lineSeed, tag, labelDy) {
      if (!vals || !vals.length) return;
      var m = Math.min(vals.length, lo.length, hi.length);
      if (!m) { strokeLine(c, M, lay, vals, hex, lw, dash); return; }
      var mlo = lo.slice(0, m), mhi = hi.slice(0, m), mv = vals.slice(0, m);
      var wv = MSPreds.wiggle(m, mv, mlo, mhi, pred.levels, pred.tex, lineSeed);
      var cs = MSPreds.confSeq(mlo, mhi);
      var lx = xsFor(M, lay, m);
      MSPreds.strokeLine(c, {
        n: m, x0: seamX, y0: M.pToY(anchor),
        xAt: function (k) { return lx[k]; },
        yAt: function (k) { return M.pToY(wv[k]); },
        conf: cs.conf, kEnd: cs.kEnd, rgb: rgbOf(hex), dash: dash, lw: lw
      });
      var pc = MSPreds.pcal(mv, mhi, anchor, m - 1);
      MSPreds.endDeco(c, {
        path: mv, seamX: seamX, coneR: lx[m - 1], toY: M.pToY, box: box, tf: o.tf,
        col: (pc < 50 ? "#8a92b2" : hex),
        // 차수 배지·끝점 예측가는 Phase 3 에서 레전드로 갔다. 진앙 마커만 남긴다 —
        // 끝점의 '위치'는 정보지만 배지는 어디 있든 뜻이 같아서 차트에 있을 이유가 없다.
        label: null, labelDy: labelDy, showPx: false
      });
    }

    var lines = linesFor(tier);
    for (i = 0; i < lines.length; i++) {
      // 기본의 1차선은 점선·가는 선이다(3단 비교표 "점선 한 줄"). 밴드가 없으니 실선 굵은
      // 선으로 두면 심화보다 더 단정적으로 보인다 — 덜 아는 티어가 더 확신해 보이면 안 된다.
      if (lines[i] === "p1") wigLine(pred.path, col.gold, spec.cone ? null : [5, 4], spec.cone ? 2.2 : 1.8, sd, "1차", -12);
      // pred.second 는 ForgeCore.run() 의 예측 객체에 아직 생산자가 없다(B군 — custom 티어와 함께 착수, BACKLOG-mobile.md 참고).
      // wigLine 이 !vals 로 조용히 반환하므로 지금은 영구 no-op — 지우지 않고 남겨둔다.
      else if (lines[i] === "p2") wigLine(pred.second, col.pred2, [4, 3], 1.8, (sd ^ 0x85ebca6b) >>> 0, "2차", 12);
      else if (lines[i] === "p3") wigLine(pred.counter, col.pred3 || col.bear, [6, 4], 1.8, (sd ^ 0x9e3779b9) >>> 0, "3차",
                                          (pred.counter && pred.counter[pred.counter.length - 1] >= anchor) ? -12 : 14);
    }
    c.restore();
  }

  function drawAxes(c, lay, candle, col, opts) {
    var p = lay.panels.price; if (!p) return;
    var ticks = (opts && opts.ticks) || 4;
    var lo = lay.priceRange[0], hi = lay.priceRange[1];
    var xr = lay.plot.x + lay.plot.w;
    c.save();
    c.font = AXIS_FONT; c.textAlign = "left";

    for (var i = 0; i <= ticks; i++) {                       // 우측 가격축
      var v = lo + (hi - lo) * (i / ticks), y = p.M.pToY(v);
      c.strokeStyle = col.hairline; c.lineWidth = 1;
      c.beginPath(); c.moveTo(lay.plot.x, y); c.lineTo(xr, y); c.stroke();
      c.fillStyle = col.ink5;
      c.fillText((Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()), xr + 6, y + 3.5);
    }

    var last = candle[lay.nowFi];                            // 골드 현재가 태그
    if (last) {
      var ly = p.M.pToY(last.c), tag = (Math.abs(last.c) < 10 ? last.c.toFixed(2) : Math.round(last.c).toLocaleString());
      c.fillStyle = col.gold; c.fillRect(xr + 2, ly - 8, lay.axisW - 4, 16);
      c.fillStyle = "#1a1408"; c.fillText(tag, xr + 6, ly + 3.5);
    }

    if (lay.fut > 0) {                                       // 예측 시작 점선
      var xs = lay.fiToX(lay.nowFi) + (lay.fiToX(lay.nowFi) - lay.fiToX(lay.nowFi - 1)) / 2;
      c.strokeStyle = col.ink4; c.lineWidth = 1; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(xs, lay.panels[lay.order[0]].rect.y);
      var lastP = lay.panels[lay.order[lay.order.length - 1]].rect;
      c.lineTo(xs, lastP.y + lastP.h); c.stroke(); c.setLineDash([]);
    }

    var bottom = lay.panels[lay.order[lay.order.length - 1]].rect;   // 하단 날짜축
    c.fillStyle = col.ink5;
    var lt = candle[lay.nowFi] && candle[lay.nowFi].t;
    if (lt) c.fillText(String(lt).slice(5).replace("-", "."), lay.plot.x, bottom.y + bottom.h + 14);
    c.restore();
  }

  function fiAtX(lay, x) {
    var d = lay.fiToX(lay.fiMin + 1) - lay.fiToX(lay.fiMin);
    var fi = Math.round(lay.fiMin + (x - lay.fiToX(lay.fiMin)) / (d || 1));
    return Math.max(lay.fiMin, Math.min(lay.nowFi, fi));
  }

  function drawCrosshair(c, lay, fi, candle, col) {
    var b = candle[fi]; if (!b) return;
    var x = lay.fiToX(fi);
    var top = lay.panels[lay.order[0]].rect;
    var bot = lay.panels[lay.order[lay.order.length - 1]].rect;
    c.save();
    c.strokeStyle = col.ink4; c.lineWidth = 1; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(x, top.y); c.lineTo(x, bot.y + bot.h); c.stroke(); c.setLineDash([]);
    var p = lay.panels.price;
    if (p) {
      var y = p.M.pToY(b.c);
      c.strokeStyle = col.ink4; c.beginPath(); c.moveTo(lay.plot.x, y); c.lineTo(lay.plot.x + lay.plot.w, y); c.stroke();
      c.font = AXIS_FONT; c.textAlign = "left";
      var t = (b.t ? String(b.t).slice(5) + "  " : "") + (Math.abs(b.c) < 10 ? b.c.toFixed(2) : Math.round(b.c).toLocaleString());
      c.fillStyle = col.gold; c.fillText(t, lay.plot.x + 4, top.y + 12);
    }
    c.restore();
  }

  return { drawCandles: drawCandles, drawCloseLine: drawCloseLine, drawCone: drawCone, drawAxes: drawAxes,
           drawCrosshair: drawCrosshair, fiAtX: fiAtX, AXIS_FONT: AXIS_FONT,
           CHART_TIERS: CHART_TIERS, specOf: specOf, linesFor: linesFor, allOverlays: allOverlays };
});
