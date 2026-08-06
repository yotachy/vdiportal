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

  /* ── 모듈 상태 (여기 한 곳에만 둔다) ──────────────────────────────
     DRAWS      현재 문서의 그림들(저장 대상)
     _selId     선택된 그림 id
     _armed     무장한 도구 type (연속 그리기 — 완성해도 유지)
     _magnet    마그넷 on/off
     _drag      진행 중 상호작용 {kind:"new"|"handle"|"move", ...}
     _newDraw   생성 중인 그림(=_drag.kind "new" 일 때만)
     _hoverId   커서가 올라간 그림 id(예광용 — 바뀔 때만 재드로)
     _undo      되돌리기 스냅샷 스택(메모리 전용·문서에 안 실림) */
  let DRAWS = [], _selId = null, _armed = null, _magnet = false;
  let _drag = null, _newDraw = null, _hoverId = null, _undo = [];

  const UNDO_MAX = 30;
  /* 스냅샷 방식 — 그림 수십 개 × 30단계라도 수십 KB 수준이고 메모리에만 산다.
     연산 로그 방식보다 되돌림 정확도가 높고(모든 변경 종류를 한 경로로 처리) 코드가 짧다. */
  function _undoPush() {
    _undo.push(JSON.parse(JSON.stringify(DRAWS)));
    if (_undo.length > UNDO_MAX) _undo.shift();
  }
  function _undoPop() { return _undo.length ? _undo.pop() : null; }
  function _undoReset() { _undo = []; }

  const SW_COLORS = ["#e8b463", "#46c28e", "#e06a6a", "#5b8def", "#8a92b2"];
  const SW_W = ["thin", "base", "bold"];
  /* forge-draw.js 의 CW 를 그대로 쓴다 — 드로잉만 다른 굵기를 쓰면 지표 작도 옆에서 혼자 튄다.
     classic script 전역 공유라 typeof 로 방어(단독 require 시엔 없음). */
  function _cw() { return (typeof CW === "object" && CW) || { hair: 0.85, thin: 1, base: 1.25, bold: 1.6, halo: 1.2 }; }
  function drawStyle(d) {
    const w = _cw();
    const key = SW_W.indexOf(d && d.w) >= 0 ? d.w : "base";
    return { color: (d && d.color) || COL[d && d.type] || COL.trend, w: w[key] };
  }

  /* M1: 티커/문서 전환 시 진행 중이던 그리기(특히 채널 stage2)가 새 문서로 그대로 넘어오면
     _drag/_newDraw 가 이전 DRAWS 를 가리킨 채 남아 다음 클릭이 "그리기 중" 가드에 걸려
     삼켜진다 — 상호작용 상태 전체를 문서 전환 시점에 리셋한다. */
  function drawsLoad(arr) {
    _cancelNew();
    _selId = null; _armed = null; _drag = null; _newDraw = null;
    DRAWS = Array.isArray(arr) ? arr.slice() : [];
  }
  function drawsAll() { return DRAWS; }

  /* 히트 반경 — 6px 핸들은 마우스로 사실상 못 맞힌다(실측: 7px 벗어나면 아무것도 안 잡힘).
     그래서 항상 본체가 먼저 잡혀 "이동만 된다"는 증상이 났다. 시각 5px / 판정 11px 로 키운다. */
  const HR = 11, HR_VIS = 5, DEL_R = 9, BODY_R = 5;
  const COL = { trend:"#e8b463", channel:"#5b8def", range:"#46c28e", period:"#8a92b2", hline:"#e8b463", vline:"#8a92b2" };

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

  /* M3: forge-draw.js 가 매 프레임 갱신하는 전역 FC_CHART_BG(--chart-bg) 를 그대로 쓴다.
     daylight 같은 라이트 테마는 차트 배경이 밝은색이라 하드코딩 검정을 쓰면 라벨/핸들이
     또렷한 검은 박스로 붕 뜬다 — 두 파일이 classic script 로 전역을 공유하므로 typeof 로 방어. */
  function FC_BEAR_SAFE() { return (typeof FC_BEAR === "string" && FC_BEAR) || "#e06a6a"; }
  function _chartBg() { return (typeof FC_CHART_BG === "string" && FC_CHART_BG) || "#0b0f14"; }
  function _labelBg() {
    const m = _chartBg().match(/#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/);
    if (!m) return "rgba(11,15,20,.86)";
    return "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16) + ",.86)";
  }

  function _label(c, text, x, y, col) {
    c.save(); c.font = "700 11px Pretendard,'Malgun Gothic',sans-serif"; c.textAlign = "left";
    const w = c.measureText(text).width;
    c.fillStyle = _labelBg();
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

  /* 마우스로 지울 수단 — 선택된 그림의 우상단 바깥에 ✕ 배지. 키보드(Del)만으로는
     지울 수 없다는 제보 반영. 판정은 핸들보다 먼저(작고 겹치기 쉬우므로). */
  function _delBadge(G, d) {
    const A = _pt(G, d.a), B = _pt(G, d.b);
    if (![A.x, A.y, B.x, B.y].every(isFinite)) return null;
    let y0 = Math.min(A.y, B.y);
    if (d.type === "channel") y0 = Math.min(y0, G.pToY(d.a.p + (d.off || 0)), G.pToY(d.b.p + (d.off || 0)));
    const x = Math.max(A.x, B.x) + DEL_R + 4;
    const y = Math.max(G.g.padTop + DEL_R + 2, y0 - DEL_R - 4);
    return { x: Math.min(x, G.g.plotRight - DEL_R - 2), y, r: DEL_R };
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
    if (sel) {   // 선택 시 끝점 핸들 + 삭제 배지
      for (const P of [A, B]) {
        c.beginPath(); c.arc(P.x, P.y, HR_VIS, 0, 7);
        c.fillStyle = col; c.fill();
        c.strokeStyle = _chartBg(); c.lineWidth = 2; c.stroke();
      }
      const db = _delBadge(G, d);
      if (db) {
        c.beginPath(); c.arc(db.x, db.y, db.r, 0, 7);
        c.fillStyle = _labelBg(); c.fill();
        c.strokeStyle = FC_BEAR_SAFE(); c.lineWidth = 1.4; c.stroke();
        c.beginPath();
        c.moveTo(db.x - 3.2, db.y - 3.2); c.lineTo(db.x + 3.2, db.y + 3.2);
        c.moveTo(db.x + 3.2, db.y - 3.2); c.lineTo(db.x - 3.2, db.y + 3.2);
        c.strokeStyle = FC_BEAR_SAFE(); c.lineWidth = 1.8; c.lineCap = "round"; c.stroke();
      }
    }
  }

  /* 호버 커서가 십자선을 덮어쓰지 않도록 forge-app 이 물어보는 조회창구(도구 무장·그리기 진행 중) */
  /* 호버 커서 — 무엇을 잡을 수 있는지 마우스로 알려준다. 핸들/✕ 위에선 포인터,
     본체 위에선 move. forge-app 의 호버 핸들러가 이 값을 우선 사용한다. */
  function drawsCursor(cx, cy) {
    if (_armed || (_drag && _drag.kind === "new")) return "crosshair";
    const h = drawsHitTest(cx, cy);
    if (!h) return null;
    return h.kind === "del" ? "pointer" : h.kind === "handle" ? "pointer" : "move";
  }
  function drawsArmed() { return !!_armed || !!(_drag && _drag.kind === "new"); }
  function _uid() { return "d_" + Math.random().toString(36).slice(2, 8); }
  function _persist() { const d = (typeof activeDoc === "function") ? activeDoc() : null; if (d) d.draws = DRAWS.slice(); if (typeof markDirty === "function") markDirty(); }

  function toggleDrawPop() {
    // .chart-pop 은 CSS 가 display/opacity/transform 을 클래스(.on)로만 다룬다(형제 팝업 _toggleRailPreset 과 동일 패턴).
    // 인라인 style.display 를 건드리면 opacity:0 인 채로 display:block 이 되어 영구히 안 보이게 된다.
    const p = document.getElementById("drawPop"); if (!p) return;
    const on = p.classList.toggle("on");
    p.setAttribute("aria-hidden", on ? "false" : "true");
  }
  function drawsArm(type) {
    _cancelNew();   // I2: 다른 도구로 바꾸기 전에 그리다 만 도형(예: 채널 stage2)부터 정리
    _armed = (_armed === type) ? null : type;
    document.querySelectorAll(".dp-btn").forEach(b => b.classList.toggle("on", b.getAttribute("data-draw") === _armed));
    const cv = document.getElementById("fcMainChart"); if (cv) cv.style.cursor = _armed ? "crosshair" : "grab";
  }
  function drawsMagnet(on) { _magnet = !!on; }
  function drawsClear() { _cancelNew(); DRAWS = []; _selId = null; _persist(); drawsRender(); }

  /* 화면 좌표 → 앵커(날짜, 가격). 마그넷이 켜져 있으면 Task 5 에서 흡착을 적용한다.
     M8: xToFi 가 어떤 이유로든 NaN/Infinity 를 내면 fiToT(times,NaN) 이 undefined 를 돌려주고,
     그 undefined 는 JSON.stringify 에서 통째로 사라져 저장할 때마다 고아 앵커가 남는다 —
     비유한(non-finite) fi 는 항상 첫 봉(0)으로 클램프해 실재 날짜를 보장한다. */
  function _anchorAt(G, cx, cy) {
    let fi = G.xToFi(cx);
    if (!isFinite(fi)) fi = 0;
    return { t: fiToT(G.times, fi), p: _snapPrice(G, fi, cy) };
  }
  /* 마그넷 — 커서가 가리키는 봉의 시·고·저·종 중 화면상 8px 이내로 가장 가까운 값에 흡착.
     고점·저점을 정확히 집는 것이 목적. 캔들이 없으면(종가 전용) 종가만 후보. */
  function _snapPrice(G, fi, cy) {
    const raw = G.yToP(cy);
    if (!_magnet) return raw;
    const oh = (typeof priceOHLC === "function") ? priceOHLC() : null;
    const i = Math.round(fi);
    let cands = null;
    if (oh && oh[i]) cands = [oh[i].o, oh[i].h, oh[i].l, oh[i].c];
    else { const ps = (typeof priceSeries === "function") ? priceSeries() : null; if (ps && isFinite(ps[i])) cands = [ps[i]]; }
    if (!cands) return raw;
    let best = null, bestD = 8.0001;
    for (const v of cands) { if (!isFinite(v)) continue; const d = Math.abs(G.pToY(v) - cy); if (d < bestD) { bestD = d; best = v; } }
    return best == null ? raw : best;
  }

  /* T5: 채널 3번째 클릭(폭 지정) — stage2 의 move 미리보기와 pointerDown 커밋이 같은 계산을
     중복해서 갖고 있었고, 둘 다 G.yToP(cy) 를 직접 써서 마그넷(_snapPrice)을 우회했다.
     평행선을 스윙 고점/저점에 딱 붙이는 게 마그넷의 대표 용례라 여기만 빠지면 안 된다. */
  function _setChanOff(G, cx, cy) {
    const A = _pt(G, _newDraw.a), B = _pt(G, _newDraw.b);
    const fi = G.xToFi(cx), p = _snapPrice(G, fi, cy);
    _newDraw.off = chanOff({ fi: A.fi, p: _newDraw.a.p }, { fi: B.fi, p: _newDraw.b.p }, { fi, p });
  }

  /* 그리기 완료 공통 뒷정리 — 도구 해제(drawsArm 은 토글이라 두 번 부르면 안 되므로 직접 해제) +
     영속화 + 재작도. pointerUp 정상 커밋 경로와 pointerDown 채널 2번째 클릭 커밋 경로가 공유한다. */
  function _finishNew() {
    _newDraw = null; _drag = null;
    _armed = null;
    document.querySelectorAll(".dp-btn").forEach(b => b.classList.remove("on"));
    const cv = document.getElementById("fcMainChart"); if (cv) cv.style.cursor = "grab";
    _persist(); drawsRender();
  }

  /* I2: 그리다 만(특히 채널 stage2 — 폭 지정을 기다리는) 도형을 취소하는 공통 처리.
     Delete·Esc·drawsArm(도구 재선택)·drawsClear·drawsLoad(문서 전환) 모두 여기부터 거쳐야
     한다 — 그러지 않으면 DRAWS 에 반쪽짜리 채널이 고아로 남고, 그 상태에서 _drag 가 안
     풀린 채라 다음 pointerMove 가 계속 그 고아를 끌고 다음 pointerDown 은 "그리기 중"
     가드에 걸려 아무 반응 없이 삼켜진다(패닝조차 안 됨). */
  function _cancelNew() {
    if (!(_drag && _drag.kind === "new" && _newDraw)) return false;
    const idx = DRAWS.indexOf(_newDraw);
    if (idx !== -1) DRAWS.splice(idx, 1);
    _finishNew();
    return true;
  }

  /* 히트테스트 — 선택된 그림의 끝점 핸들(6px)이 본체(5px)보다 항상 우선.
     F4 수정: 예전엔 핸들 검사가 z-order 루프 안에 있어 선택된 그림이 topmost 가
     아니면 위에 덮인 다른 도형의 본체가 먼저 걸렸다(핸들을 영영 못 잡음).
     그래서 1차로 선택된 그림의 핸들만 z-order 무관하게 전수 검사하고,
     거기서 못 잡았을 때만 2차로 본체를 위에서부터(뒤에서부터) 훑는다. */
  function drawsHitTest(cx, cy) {
    const G = drawsGeo(); if (!G || !G.times.length) return null;
    if (_selId) {
      const d = _byId(_selId);
      if (d) {
        const db = _delBadge(G, d);   // 삭제 배지가 핸들보다 우선(작고 끝점 근처라 밀리면 못 누른다)
        if (db && Math.hypot(cx - db.x, cy - db.y) <= db.r + 2) return { kind: "del", id: d.id, which: null };
        const A = _pt(G, d.a), B = _pt(G, d.b);
        if (isFinite(A.x) && isFinite(A.y) && Math.hypot(cx - A.x, cy - A.y) <= HR) return { kind: "handle", id: d.id, which: "a" };
        if (isFinite(B.x) && isFinite(B.y) && Math.hypot(cx - B.x, cy - B.y) <= HR) return { kind: "handle", id: d.id, which: "b" };
      }
    }
    for (let i = DRAWS.length - 1; i >= 0; i--) {
      const d = DRAWS[i], A = _pt(G, d.a), B = _pt(G, d.b);
      if (!isFinite(A.x) || !isFinite(B.x)) continue;
      let hit = false;
      if (d.type === "trend") hit = segDist(cx, cy, A.x, A.y, B.x, B.y) <= BODY_R;
      else if (d.type === "channel") {
        const A2y = G.pToY(d.a.p + (d.off || 0)), B2y = G.pToY(d.b.p + (d.off || 0));
        hit = segDist(cx, cy, A.x, A.y, B.x, B.y) <= BODY_R || segDist(cx, cy, A.x, A2y, B.x, B2y) <= BODY_R;
      } else {   // range·period = 박스 테두리
        const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), y0 = Math.min(A.y, B.y), y1 = Math.max(A.y, B.y);
        hit = segDist(cx, cy, x0, y0, x1, y0) <= BODY_R || segDist(cx, cy, x0, y1, x1, y1) <= BODY_R ||
              segDist(cx, cy, x0, y0, x0, y1) <= BODY_R || segDist(cx, cy, x1, y0, x1, y1) <= BODY_R;
      }
      if (hit) return { kind: "body", id: d.id, which: null };
    }
    return null;
  }
  function _byId(id) { return DRAWS.find(x => x.id === id) || null; }

  function drawsPointerDown(e, cx, cy) {
    const G = drawsGeo(); if (!G || !G.times.length) return false;
    if (_drag && _drag.kind === "new" && _newDraw) {
      // 채널 폭 지정 대기 중(stage 2) — 새 그리기를 또 시작하지 않고 이 클릭으로 폭을 확정한다.
      // 여기서 guard 없이 _armed 분기로 흘려보내면 반쪽짜리 채널이 DRAWS 에 계속 쌓인다(고아 도형).
      if (_drag.stage === 2) {
        if (_newDraw.type === "channel") {
          // 직전 move 없이 연속 클릭만으로도 폭이 잡히도록, 이 클릭 좌표로 직접 계산한다(미리보기 값에 기대지 않음).
          _setChanOff(G, cx, cy);
          _finishNew();
        } else {
          // 트레이딩뷰식 두 번째 클릭 = 끝점 확정. 같은 자리를 또 누르면 0길이라 취소한다.
          const b = _anchorAt(G, cx, cy), A = _pt(G, _newDraw.a), B = _pt(G, { t: b.t, p: b.p });
          if (isFinite(A.x) && isFinite(B.x) && Math.hypot(B.x - A.x, B.y - A.y) < 6) _cancelNew();
          else { _newDraw.b = b; _finishNew(); }
        }
      }
      return true;
    }
    if (_armed) {
      const a = _anchorAt(G, cx, cy);
      _newDraw = { id: _uid(), type: _armed, a, b: { t: a.t, p: a.p } };
      if (_armed === "channel") _newDraw.off = 0;
      DRAWS.push(_newDraw);
      _selId = _newDraw.id;
      _drag = { kind: "new", stage: 1 };
      drawsRender();
      return true;
    }
    const h = drawsHitTest(cx, cy);
    if (h && h.kind === "del") {   // ✕ 배지 클릭 = 마우스로 삭제
      DRAWS = DRAWS.filter(x => x.id !== h.id); _selId = null; _persist(); drawsRender();
      return true;
    }
    if (h) {
      _selId = h.id;
      const d = _byId(h.id);
      _drag = h.kind === "handle"
        ? { kind: "handle", which: h.which }
        : { kind: "move", fi0: G.xToFi(cx), p0: G.yToP(cy), a0: { ...d.a }, b0: { ...d.b }, off0: d.off };   // F3: 채널 폭도 같이 스냅샷
      drawsRender();
      return true;
    }
    if (_selId) { _selId = null; drawsRender(); }   // 빈 곳 클릭 = 선택 해제(팬은 그대로 진행)
    return false;
  }

  function drawsPointerMove(e, cx, cy) {
    if (!_drag) return;
    const G = drawsGeo(); if (!G) return;
    if (_drag.kind === "new") {
      if (_drag.stage === 1) _newDraw.b = _anchorAt(G, cx, cy);
      // stage 2 = 첫 클릭 뒤 두 번째 클릭 대기 중. 채널이면 폭(3번째 점), 그 외는 끝점이
      // 커서를 따라오는 고무줄 미리보기 — 버튼을 떼고 움직여도 선이 따라와야 클릭 방식이 성립한다.
      else if (_drag.stage === 2) { if (_newDraw.type === "channel") _setChanOff(G, cx, cy); else _newDraw.b = _anchorAt(G, cx, cy); }
      drawsRender();
    } else if (_drag.kind === "handle") {
      const d = _byId(_selId); if (!d) return;
      d[_drag.which] = _anchorAt(G, cx, cy);
      drawsRender();
    } else if (_drag.kind === "move") {
      const d = _byId(_selId); if (!d) return;
      // I1: 비율 이동(dP = p/p0)은 로그축에서만 강체 이동이다. 기본값인 선형축에서 비율을
      // 이동에 쓰면 100/110 박스를 105→115 로 끌 때 dP=1.0952 가 되어 앵커가 109.5/120.5 로
      // 밀리며 높이(10→11)까지 늘어난다 — 선형은 log 를 거치지 않는 항등함수라 덧셈(Δ)이,
      // 로그는 log 공간에서의 덧셈(=원래 공간에서의 비율)이 진짜 강체 이동이다.
      const isLog = !!(G.g && G.g.log);
      const _lg = v => isLog ? Math.log(Math.max(1e-9, v)) : v;
      const _iv = v => isLog ? Math.exp(v) : v;
      const dFi = G.xToFi(cx) - _drag.fi0;
      const dS = _lg(G.yToP(cy)) - _lg(_drag.p0);
      for (const k of ["a", "b"]) {
        const src = _drag[k + "0"];
        d[k] = { t: fiToT(G.times, tToFi(G.times, src.t) + dFi), p: _iv(_lg(src.p) + dS) };
      }
      // F3(갱신): 채널 폭(off)은 절대 가격차. 로그축에서만 base price 이동 비율만큼 같이
      // 스케일해야 채널이 눌리거나 벌어지지 않는다 — 선형축에서는 그대로 유지(덧셈 이동엔 불변).
      if (d.type === "channel" && _drag.off0 !== undefined) d.off = isLog ? _drag.off0 * Math.exp(dS) : _drag.off0;
      drawsRender();
    }
  }

  function drawsPointerUp() {
    if (!_drag) return;
    if (_drag.kind === "new") {
      if (_newDraw.type === "channel" && _drag.stage === 1) { _drag.stage = 2; return; }   // 채널은 한 번 더 클릭해 폭 지정
      // 리사이즈·티커 전환이 마우스업과 경합하면 _mainGeo 가 잠깐 비어 drawsGeo()가 null 일 수 있다
      // (drawsPointerMove 와 동일 가드). 여기서 그냥 return 하면 _drag/_newDraw 가 영영 안 풀려
      // 팬(endDrag)까지 같이 멈추므로, 취소판정만 건너뛰고 상태 정리(_finishNew)는 항상 실행한다.
      const G = drawsGeo();
      if (G) {
        const A = _pt(G, _newDraw.a), B = _pt(G, _newDraw.b);
        // F1: 예전엔 조건이 맞으면 무조건 배열 끝을 pop 했다 — 드래그 도중 Delete 로 이미
        // _newDraw 가 지워졌다면(아래 drawsKey) 배열 끝엔 무관한 기존 저장 그림이 있고,
        // 그게 대신 삭제되는 데이터 유실이 났다. 배열 끝이 정말 _newDraw 본인일 때만 pop.
        // 예전엔 여기서 '점만 찍었다'며 폐기하고 도구까지 풀었다 — 그래서 트레이딩뷰처럼
        // 클릭으로 그리려던 사용자에겐 아무 반응도 없었다(무장까지 조용히 해제). 이제는
        // 폐기하지 않고 stage 2 로 넘겨 두 번째 클릭을 기다린다(드래그 방식도 그대로 동작).
        if (Math.hypot(B.x - A.x, B.y - A.y) < 6 && DRAWS[DRAWS.length - 1] === _newDraw) { _drag.stage = 2; return; }
      }
      _finishNew();
    } else { _drag = null; _persist(); drawsRender(); }
  }

  /* 전역 keydown 앞단에서 먼저 호출된다. true 를 반환하면 기존 단축키로 흘리지 않는다.
     F2: sel/selEdge 는 forge-ui.js(전략보드) 전역이라 이 파일만 봐선 존재 여부를 모른다 —
     보드가 뭔가 선택 중이면 Delete 는 보드 몫으로 양보한다(typeof 로 방어적 참조).
     단, Esc 는 양보하지 않는다(Task 4 재검토 F2 후속 수정) — Delete 는 파괴적이라
     잘못 삭제하느니 아무 것도 안 하는 쪽이 안전하지만, Esc 는 그 반대다. 보드에 stale/
     잊힌 선택이 남아있으면 그림 선택을 영영 키보드로 못 지우게 되는 함정이 생기므로,
     Esc 는 항상 무장 해제/그림 선택 해제를 먼저 수행한다(없으면 false 로 보드에 넘김). */
  function drawsKey(e) {
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return false;
    const boardHasSel = (typeof sel !== "undefined" && sel && sel.length) ||
                         (typeof selEdge !== "undefined" && selEdge);
    if (e.key === "Escape") {
      // I2: 채널이 stage2(폭 지정 대기)에서 멈춰 있으면 _armed 분기보다 먼저 여기서 끝내야 한다.
      // stage2 에선 _newDraw 가 아직 DRAWS 에 반쪽짜리로 남아 있는데 _armed 도 여전히 세팅돼
      // 있어 그냥 drawsArm(null) 만 부르면 고아 채널이 그대로 남고 _drag 도 안 풀린다.
      if (_cancelNew()) return true;
      if (_armed) { drawsArm(null); _armed = null; return true; }
      if (_selId) { _selId = null; drawsRender(); return true; }
      return false;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      // F1: 그리기 중(마우스 버튼이 아직 안 떨어진 상태)에 Delete 를 누르면 "완성된 그림 삭제"가
      // 아니라 "지금 그리던 것 취소"로 다뤄야 한다 — _selId 필터로 처리하면 진행 중인 _newDraw 만
      // 지워지고 drawsPointerUp 의 취소판정이 뒤이어 배열 끝(=이제 무관한 이전 그림)을 또 pop 해
      // 엉뚱한 저장 그림까지 사라진다. 여기서 확실히 끝내(_finishNew) 그 경합 자체를 없앤다.
      if (_cancelNew()) return true;
      if (boardHasSel) return false;
      if (_selId) {
        DRAWS = DRAWS.filter(d => d.id !== _selId); _selId = null; _persist(); drawsRender(); return true;
      }
    }
    return false;
  }

  return { tToFi, fiToT, segDist, chanOff, drawsArmed, drawsCursor, drawsLoad, drawsAll, drawsGeo, drawsRender,
           drawsArm, drawsMagnet, drawsClear, drawsPointerDown, drawsPointerMove, drawsPointerUp, toggleDrawPop,
           drawsHitTest, drawsKey, _undoPush, _undoPop, _undoReset, drawStyle, SW_COLORS, SW_W };
});

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", function () {
  const pop = document.getElementById("drawPop");
  if (pop) pop.addEventListener("click", e => {
    const b = e.target.closest("[data-draw]"); if (b) { drawsArm(b.getAttribute("data-draw")); return; }
  });
  const mg = document.getElementById("drawMagnet");
  if (mg) mg.addEventListener("change", () => drawsMagnet(mg.checked));

  /* I3: forge-app.js 가 스크립트 평가 시점에 자기 Esc 핸들러(전체화면 해제)를 window 에
     bubble 단계로 이미 등록해 놓기 때문에, forge-ui.js 의 boardInit() 이 나중에 등록하는
     bubble 리스너 안에서 drawsKey 를 불러봐야 등록 순서상 항상 늦는다(같은 target·단계면
     리스너는 등록 순서로 실행) — 그리기 도구의 Esc(선택 해제·그리기 취소)가 항상 먼저
     소비되도록 캡처 단계에 등록한다. 캡처는 등록 순서와 무관하게 모든 버블 리스너보다 먼저 돈다. */
  window.addEventListener("keydown", function (e) {
    if (drawsKey(e)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
});
