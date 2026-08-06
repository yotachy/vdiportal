/* 스쿱포지 차트 드로잉 도구 — 추세선·평행채널·등락폭/기간 재기 + 마그넷.
   앵커는 (날짜, 가격). 봉 번호로 저장하면 일→주 전환 때 어긋난다.
   UMD: 브라우저에선 전역에 함수 노출(다른 classic script가 바로 호출),
        node 에선 module.exports(순수 헬퍼 단위테스트용). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else for (const k in api) root[k] = api[k];
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* 날짜 → 봉 위치. 정확 일치는 그 인덱스, 사이는 보간, 밖이면 외삽(음수/초과).
     주기를 바꿔도(일→주) 같은 화면 위치에 오게 하는 핵심. */
  function tToFi(times, t) {
    if (!Array.isArray(times) || times.length < 1 || !t) return NaN;
    const n = times.length;
    if (t <= times[0]) {
      if (t === times[0]) return 0;
      if (n < 2) return NaN;
      const span = _days(times[0], times[1]) || 1;            // 첫 간격으로 역외삽
      return -_days(t, times[0]) / span;
    }
    if (t >= times[n - 1]) {
      if (t === times[n - 1]) return n - 1;
      if (n < 2) return NaN;
      const span = _days(times[n - 2], times[n - 1]) || 1;    // 마지막 간격으로 외삽
      return (n - 1) + _days(times[n - 1], t) / span;
    }
    let lo = 0, hi = n - 1;                                   // 이진탐색으로 감싸는 두 봉
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
    if (times[lo] === t) return lo;
    const d0 = _days(times[lo], times[hi]) || 1;
    return lo + _days(times[lo], t) / d0;
  }
  function _days(a, b) { return (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000; }

  /* 봉 위치 → 날짜(반올림). 범위 밖은 양 끝으로 클램프 — 저장은 항상 실재 날짜로. */
  function fiToT(times, fi) {
    if (!Array.isArray(times) || !times.length) return "";
    const i = Math.max(0, Math.min(times.length - 1, Math.round(fi)));
    return times[i];
  }

  /* 점과 선분의 최단 거리(픽셀). 히트테스트용. */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / L2;
    t = Math.max(0, Math.min(1, t));                          // 끝점 너머는 끝점까지
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /* 기준선(a,b) 위 같은 fi 에서의 가격과 pt.p 의 차 = 평행채널 폭.
     점 3개를 독립 저장하면 평행이 깨지므로 이 오프셋 하나만 저장한다. */
  function chanOff(a, b, pt) {
    const span = (b.fi - a.fi) || 1;
    const onLine = a.p + (b.p - a.p) * ((pt.fi - a.fi) / span);
    return pt.p - onLine;
  }

  let DRAWS = [];
  function drawsLoad(arr) { DRAWS = Array.isArray(arr) ? arr.slice() : []; }
  function drawsAll() { return DRAWS; }

  const COL = { trend:"#e8b463", channel:"#5b8def", range:"#46c28e", period:"#8a92b2" };

  /* 현재 차트 좌표계. _mainGeo(fcDrawMainChart 가 매 프레임 갱신)를 그대로 써야
     지표 작도와 정합한다. 로그축이면 toY/yToP 가 log 공간을 경유한다. */
  function drawsGeo() {
    const cv = document.getElementById("fcMainChart"), g = cv && cv._mainGeo;
    if (!g) return null;
    const times = (typeof priceTimes === "function" ? priceTimes() : null) || [];
    const lg = v => g.log ? Math.log(Math.max(1e-9, v)) : v;
    const inv = v => g.log ? Math.exp(v) : v;
    const _lo = lg(g.loV), _hi = lg(g.hiV), plotH = g.ch - g.padTop - g.padBot;
    return {
      g, times,
      fiToX: fi => g.padX + ((fi - g.start) / Math.max(1, g.count - 1)) * g.histW,
      pToY:  p  => g.padTop + (1 - (lg(p) - _lo) / ((_hi - _lo) || 1)) * plotH,
      xToFi: x  => g.start + ((x - g.padX) / (g.histW || 1)) * Math.max(1, g.count - 1),
      yToP:  y  => inv(_lo + (1 - (y - g.padTop) / (plotH || 1)) * (_hi - _lo)),
    };
  }

  /* 앵커(날짜,가격) → 화면 좌표. 날짜가 시계열에 없으면 보간/외삽된 fi 를 쓴다. */
  function _pt(G, anc) {
    const fi = tToFi(G.times, anc.t);
    return { fi, x: G.fiToX(fi), y: G.pToY(anc.p) };
  }

  function _label(c, text, x, y, col) {
    c.save(); c.font = "700 11px Pretendard,'Malgun Gothic',sans-serif"; c.textAlign = "left";
    const w = c.measureText(text).width;
    c.fillStyle = "rgba(11,15,20,.86)";
    if (c.roundRect) { c.beginPath(); c.roundRect(x, y - 11, w + 12, 16, 4); c.fill(); }
    c.fillStyle = col; c.fillText(text, x + 6, y);
    c.restore();
  }

  function drawsRender() {
    const cv = document.getElementById("fcDraws"); if (!cv) return;
    const host = cv.parentElement, W = host ? host.clientWidth : 0, H = host ? host.clientHeight : 0;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3), ww = Math.round(W * dpr), hh = Math.round(H * dpr);
    if (cv.width !== ww || cv.height !== hh) { cv.width = ww; cv.height = hh; }
    cv.style.width = W + "px"; cv.style.height = H + "px";
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const G = drawsGeo(); if (!G || !G.times.length) return;
    c.save(); c.beginPath(); c.rect(G.g.padX - 2, G.g.padTop, G.g.plotRight - G.g.padX + 4, G.g.ch - G.g.padTop - G.g.padBot); c.clip();
    for (const d of DRAWS) _renderOne(c, G, d, d.id === _selId);
    c.restore();
  }

  function _renderOne(c, G, d, sel) {
    const A = _pt(G, d.a), B = _pt(G, d.b), col = COL[d.type] || COL.trend;
    if (![A.x, A.y, B.x, B.y].every(isFinite)) return;
    c.lineWidth = sel ? 2.2 : 1.6; c.strokeStyle = col; c.setLineDash([]);
    if (d.type === "trend") {
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
      const bars = Math.max(1, Math.abs(B.fi - A.fi));
      const pct = ((d.b.p / d.a.p - 1) * 100) / bars;
      _label(c, (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%/봉", B.x + 6, B.y, col);
    } else if (d.type === "channel") {
      const off = d.off || 0, A2 = { x: A.x, y: G.pToY(d.a.p + off) }, B2 = { x: B.x, y: G.pToY(d.b.p + off) };
      c.globalAlpha = .10; c.fillStyle = col;
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(B2.x, B2.y); c.lineTo(A2.x, A2.y); c.closePath(); c.fill();
      c.globalAlpha = 1;
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
      c.beginPath(); c.moveTo(A2.x, A2.y); c.lineTo(B2.x, B2.y); c.stroke();
    } else {   // range · period — 박스 렌더 공유, 라벨만 다름
      const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), y0 = Math.min(A.y, B.y), y1 = Math.max(A.y, B.y);
      c.globalAlpha = .10; c.fillStyle = col; c.fillRect(x0, y0, x1 - x0, y1 - y0); c.globalAlpha = 1;
      c.setLineDash([4, 3]); c.strokeRect(x0, y0, x1 - x0, y1 - y0); c.setLineDash([]);
      const txt = d.type === "range"
        ? (d.b.p - d.a.p >= 0 ? "+" : "") + (d.b.p - d.a.p).toFixed(2) + " · " + ((d.b.p / d.a.p - 1) * 100).toFixed(2) + "%"
        : Math.round(Math.abs(B.fi - A.fi)) + "봉 · " + Math.abs(Math.round((Date.parse(d.b.t) - Date.parse(d.a.t)) / 86400000)) + "일";
      _label(c, txt, x0 + 4, y0 - 4, col);
    }
    if (sel) {   // 선택 시 끝점 핸들
      c.fillStyle = col;
      for (const P of [A, B]) { c.beginPath(); c.arc(P.x, P.y, 4, 0, 7); c.fill(); c.strokeStyle = "#0b0f14"; c.lineWidth = 1.5; c.stroke(); }
    }
  }

  let _selId = null;

  return { tToFi, fiToT, segDist, chanOff, drawsLoad, drawsAll, drawsGeo, drawsRender };
});
