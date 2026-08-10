// PC 스쿱포지 forge-draw.js 에서 포팅 — 가격 패널 오버레이·배지.
// 작도는 엔진과 달리 단일 원본이 아니다(표현이지 분석이 아니며 폼팩터가 다르다).
// 숫자는 여전히 forge-core.js 단일 원본이다.
// 원본 심볼: FC_BULL FC_BEAR FC_DIM CW CDASH _skFrac _polyLen _skStroke _skReady
//           _evLabelBoxes _labelMode _KEYLBL _evW _evLabel _drawProjLine _predDir
//           _projMarkScale _projMark _projFwd
//           _drawMALayers _drawRsiLayers _drawVolumeLayers _drawBollingerLayers _drawMacdLayers
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./strings.js"));
  else root.MSLayers = factory(root.MSStr);
})(typeof self !== "undefined" ? self : this, function (Str) {
  "use strict";

  // ── 심: PC 가 전역/다른 파일에서 받던 것들 ──
  var FC_GOLD = "#e8b463";                    // 핸드오프 gold
  var _ov = null, _evLegend = null;           // PC 오버레이 상태 — 모바일 미사용
  // _axisLabelBoxes 는 resetLabels 에서만 비워지고 push 되는 곳이 없다 — PC 는 눈금 라벨·현재가 필을
  // 여기 채우지만, 모바일 축 라벨(drawAxes)은 플롯 우측 거터(xr+6, 플롯 오른쪽 밖)에만 찍혀서
  // 예측 끝점 배지(≤ plot.x+plot.w-12 로 클램프)와 좌표상 절대 겹치지 않는다 — 의도적으로 빈 채로 둔다.
  var _axisLabelBoxes = [], _predLabelBoxes = [];
  function _hzFmt(v) { return (Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()); }  // forge-app.js:161

  /* ===== 여기부터 forge-draw.js 원문 복사 (7-9, 35-36, 1278-1286, 1295-1311, 1300-1311, 1310-1311, 1836, 1838-1867, 1923-1947, 2002-2011, 2117-2175, 2361-2381, 2383-2413, 2545-2571, 2573-2580) ===== */
  /* 예외: 이 블록 안의 한글 UI 문자열 리터럴만 영문(Str/MSStr)로 교체했다 — 포팅 규약은 동작 divergence 방지가
     목적이고 카피는 동작이 아니다(Phase 5). 조건·계산·좌표는 한 글자도 안 건드렸다. */
  const FC_BULL = "#46c28e";   /* bull candle */
  const FC_BEAR = "#e06a6a";   /* bear candle */
  const FC_DIM  = "#5A6478";   /* axis labels (중간 슬레이트 — 명/암 배경 모두 판독) */

  const CW = { hair: 0.85, thin: 1, base: 1.25, bold: 1.6, halo: 1.2 };
  const CDASH = { fine: [1, 3.5], std: [2, 4], long: [4.5, 4.5] };   // 정밀 점선(가늘고 여백 넉넉 · 라운드캡과 함께 고급감)

  let _skFrac = null;
  function _polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) { const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1]; L += Math.hypot(dx, dy); } return L; }
  function _skStroke(c, len) {   // len=경로 길이. 진행 중이면 dash로 앞부분만 그림(펜이 긋는 느낌)
    if (_skFrac == null || _skFrac >= 1 || !(len > 0)) { c.stroke(); return; }
    const pd = c.getLineDash(), po = c.lineDashOffset;
    c.setLineDash([len, len + 4]); c.lineDashOffset = len * (1 - Math.max(0, _skFrac));
    c.stroke(); c.setLineDash(pd); c.lineDashOffset = po;
  }
  function _skReady() { return _skFrac == null || _skFrac >= 0.82; }   // 라벨·마커·점은 선이 거의 다 그려진 뒤 등장

  let _evLabelBoxes = [];        // 라벨 겹침 회피용 박스 레지스트리(_drawEvidence마다 리셋)

  let _labelMode = "key";        // 기본 "key"=중요 라벨만(차트 정돈) / "all"=전체(토글)
  const _KEYLBL = /목표|반대|지지|저항|골든포켓|장기|중기|단기/;   // 중요 라벨 판별(목표·S/R·반대·주요 추세선)

  let _evW = 0, _evH = 0;   // 현재 작도 캔버스 논리 크기(라벨 클램프용)

  function _evLabel(c, text, x, y, color, align, force) {
    if (_labelMode === "key" && !force && !_KEYLBL.test(text)) return;   // 중요 라벨만 모드: 목표·반대·지지/저항 외 생략(force=강조 앵커 등 항상 표시)
    c.font = "600 11px Pretendard, ui-monospace, monospace";
    try { c.letterSpacing = "-0.2px"; } catch (_) {}
    const w = c.measureText(text).width, h = 14, M = 3, pad = 5;
    let bx = (align === "right") ? x - w - pad : x;          // 박스 좌상 x
    bx = Math.max(M, Math.min(bx, (_evW || 1e4) - w - 2 * pad - M));
    let by = y - h;                                          // 박스 좌상 y(텍스트 baseline 위)
    by = Math.max(M, Math.min(by, (_evH || 1e4) - h - M));
    const bw = w + 2 * pad, bh = h + 2;
    // 겹침 회피: 충돌하면 아래/위로 밀어 빈 슬롯 탐색(라벨이 사라지지 않고 계단식으로 정렬). 정말 못 놓으면 생략.
    const _ov = yy => _evLabelBoxes.some(r => bx < r.x + r.w && bx + bw > r.x && yy < r.y + r.h && yy + bh > r.y);
    if (_ov(by)) {
      let ok = false;
      for (let stp = 1; stp <= 18 && !ok; stp++) {
        for (const dr of [1, -1]) {
          const ny = by + dr * stp * (bh + 1);
          if (ny >= M && ny <= (_evH || 1e4) - bh - M && !_ov(ny)) { by = ny; ok = true; break; }
        }
      }
      if (!ok) return;
    }
    _evLabelBoxes.push({ x: bx, y: by, w: bw, h: bh });
    c.fillStyle = "rgba(11,15,20,.74)";
    if (c.roundRect) { c.beginPath(); c.roundRect(bx, by, w + 2 * pad, h + 2, 4); c.fill(); }
    else c.fillRect(bx, by, w + 2 * pad, h + 2);
    c.fillStyle = color; c.textAlign = "left";
    c.fillText(text, bx + pad, by + h - 1);
    try { c.letterSpacing = "0px"; } catch (_) {}   // 공유 컨텍스트 오염 방지(다른 텍스트에 안 번지게)
  }

  /* 라벨 박스 배치 — 충돌하면 위/아래 계단으로 밀어 빈 슬롯을 찾는다. 못 놓으면 null(겹쳐 찍지 않고 생략).
     _evLabel 의 내부 회피와 같은 규칙을 예측 배지에서도 쓰기 위해 공용 헬퍼로 분리. */
  function _fitBoxY(bx, by, bw, bh, boxes, minY, maxY) {
    const ov = yy => boxes.some(r => bx < r.x + r.w && bx + bw > r.x && yy < r.y + r.h && yy + bh > r.y);
    if (!ov(by)) return by;
    for (let stp = 1; stp <= 14; stp++)
      for (const dr of [-1, 1]) {
        const ny = by + dr * stp * (bh + 2);
        if (ny >= minY && ny <= maxY - bh && !ov(ny)) return ny;
      }
    return null;
  }

  function _drawProjLine(c, pts, col) {
    if (!pts || pts.length < 2) return;
    c.save(); c.lineJoin = "round"; c.lineCap = "round"; c.setLineDash([]);
    c.strokeStyle = "rgba(11,15,20,.9)"; c.lineWidth = 4.4;
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    c.shadowColor = col; c.shadowBlur = 9; c.globalAlpha = 1;
    c.strokeStyle = col; c.lineWidth = 2.7; c.setLineDash([7, 4]);
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    c.restore();
  }
  function _predDir() {   // 메인 예상 방향(+1 상승 / -1 하락)
    try { const p = lastResult && lastResult.prediction && lastResult.prediction.path; const px = (currentData().price || []); if (p && p.length && px.length) return p[p.length - 1] >= px[px.length - 1] ? 1 : -1; } catch (e) {}
    return 1;
  }
  function _projMarkScale(endV, base) { return ((endV >= base ? 1 : -1) === _predDir()) ? 1 : (1 / 3); }   // 반대지표 끝점=메인예상 대비 1/3
  function _projMark(c, x, y, col, scale) {
    if (!isFinite(x) || !isFinite(y)) return;
    const sc = scale || 1, op = sc < 1;
    c.save();
    c.shadowColor = col; c.shadowBlur = 11 * sc; c.fillStyle = col; c.globalAlpha = op ? 0.6 : 1;
    c.beginPath(); c.arc(x, y, 4.8 * sc, 0, 7); c.fill();
    c.shadowBlur = 0; c.strokeStyle = "rgba(11,15,20,.92)"; c.lineWidth = 1.6; c.stroke();
    c.globalAlpha = op ? 0.5 : .92; c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, 1.7 * sc, 0, 7); c.fill();
    c.restore();
  }

  function _projFwd(c, series, nowFi, seam, xr, fb, pToY, col, label) {
    if (!series || !isFinite(seam) || !isFinite(xr) || !fb) return;
    const w = Math.min(24, Math.max(6, Math.round(fb / 2)));
    const base = series[nowFi], prev = series[Math.max(0, nowFi - w)];
    if (!isFinite(base) || !isFinite(prev)) return;
    const slPer = (base - prev) / w, pts = [[seam, pToY(base)]]; let endV = base;
    for (let k = 1; k <= fb; k++) { endV = base + slPer * k * Math.exp(-k / (fb * 1.5)); pts.push([seam + (xr - seam) * k / fb, pToY(endV)]); }
    _drawProjLine(c, pts, col); _projMark(c, pts[pts.length - 1][0], pts[pts.length - 1][1], col, _projMarkScale(endV, base));
    _evLabel(c, label + " ≈ " + _hzFmt(endV), xr, pToY(endV), col, "right");
  }

  function _drawMALayers(c, ma, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity } = M;
    const COL = { short: "#7fb0ff", mid: "#5b8def", long: "#3b62c0" };
    const WID = { short: 1.15, mid: 1.4, long: 1.7 };
    function strokeSeries(series, key, srOn) {
      const pts = [];
      for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) {
        const v = series[fi]; if (!isFinite(v)) continue;
        const x = fiToX(fi), y = pToY(v); if (isFinite(x) && isFinite(y)) pts.push([x, y]);
      }
      if (pts.length < 2) return;
      c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
      _skStroke(c, _polyLen(pts));   // 진행형 스트로크(손그림)
    }
    function drawMA(s, key) {
      if (!s) return;
      const srOn = ma.sr.ma === key;
      if (key === "long") { c.setLineDash([]); c.strokeStyle = "rgba(11,15,20,.8)"; c.lineWidth = WID[key] + CW.halo; strokeSeries(s.series, key); }
      c.strokeStyle = COL[key]; c.lineWidth = srOn ? WID[key] + 1 : WID[key]; c.setLineDash(srOn ? CDASH.std : []);
      strokeSeries(s.series, key); c.setLineDash([]);
    }
    if (reveal >= 1) { drawMA(ma.mas.long, "long"); drawMA(ma.mas.mid, "mid"); drawMA(ma.mas.short, "short"); }
    // 크로스 마커
    if (reveal >= 2 && ma.cross.type && ma.cross.barsAgo != null && ma.mas.short) {
      const fi = Math.max(fiMin, nowFi - ma.cross.barsAgo), v = ma.mas.short.series[fi];
      if (isFinite(v)) {
        const x = fiToX(fi), y = pToY(v);
        if (isFinite(x) && isFinite(y)) {
          const gold = ma.cross.type === "golden";
          c.fillStyle = gold ? "#46c28e" : "#e06a6a";
          c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
          _evLabel(c, (gold ? Str.t.legGolden : Str.t.legDead) + ma.cross.barsAgo + Str.t.legBars, x, y - 7, gold ? "#46c28e" : "#e06a6a", "left");
        }
      }
    }
    // 배열 라벨
    if (reveal >= 3 && ma.mas.short && M.badges !== false) {
      const x = fiToX(nowFi), y = pToY(ma.mas.short.last);
      if (isFinite(x) && isFinite(y)) {
        const o = ma.align.order;
        _evLabel(c, (o === "bull" ? Str.MA_ALIGN.bull + " ▲" : o === "bear" ? Str.MA_ALIGN.bear + " ▼" : Str.MA_ALIGN.mixed + " –") + (ma.sr.ma ? " · " + (ma.sr.side === "support" ? "support" : "resistance") : ""), x + 4, y - 6, o === "bull" ? "#46c28e" : o === "bear" ? "#e06a6a" : "#8a92b2", "left");
      }
    }
    // 미래 투영(포커스 시): 장기 MA를 최근 봉당 기울기로 감쇠 연장 → "이 지표가 이렇게 이어져 예측에 기여"하는 독립 해석 시각화
    if (M.focused && M.xNow != null && M.futBars && ma.mas.long && ma.mas.long.series) {
      const ls = ma.mas.long.series, w = Math.min(24, Math.max(6, Math.round((ma.mas.long.period || 60) / 3)));
      const base = ls[nowFi], prev = ls[Math.max(0, nowFi - w)];
      if (isFinite(base) && isFinite(prev) && w > 0) {
        const slPer = (base - prev) / w, seam = M.xNow, xr = M.xRight, fb = M.futBars;
        const _maCol = slPer > 0 ? FC_BULL : slPer < 0 ? FC_BEAR : "#8a92b2";   // MA 투영 방향색(상승=초록·하락=빨강)
        const pp = [[seam, pToY(base)]]; let endV = base;
        for (let k = 1; k <= fb; k++) { endV = base + slPer * k * Math.exp(-k / (fb * 1.5)); pp.push([seam + (xr - seam) * k / fb, pToY(endV)]); }
        _drawProjLine(c, pp, _maCol); _projMark(c, pp[pp.length - 1][0], pp[pp.length - 1][1], _maCol, _projMarkScale(endV, base));
        _evLabel(c, "MA projection ≈ " + _hzFmt(endV), xr, pToY(endV), _maCol, "right");
      }
    }
    c.restore();
  }

  function _drawRsiLayers(c, rsi, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    const _by = (M.badgeY != null) ? M.badgeY : 28;
    if (reveal >= 1 && rsi.divergence.type && rsi.divergence.pricePts) {
      const a = rsi.divergence.pricePts[0], b = rsi.divergence.pricePts[1];
      const xa = fiToX(Math.max(fiMin, a.idx)), ya = pToY(a.price), xb = fiToX(Math.max(fiMin, b.idx)), yb = pToY(b.price);
      if ([xa, ya, xb, yb].every(isFinite)) {
        const col = rsi.divergence.type === "bullish" ? "#46c28e" : "#e06a6a";
        c.strokeStyle = col; c.lineWidth = 1.8; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke(); c.setLineDash([]);
        _evLabel(c, rsi.divergence.type === "bullish" ? Str.t.cxBullDiv : Str.t.cxBearDiv, xb, yb, col, "left");
      }
    }
    if (reveal >= 2 && M.badges !== false) {
      const zt = Str.RSI_ZONE[rsi.zone] || "neutral";
      const col = rsi.zone === "overbought" ? "#e06a6a" : rsi.zone === "oversold" ? "#46c28e" : "#8a92b2";
      const xb = (xRight != null ? xRight : fiToX(nowFi));
      _evLabel(c, "RSI " + Math.round(rsi.last) + " \xb7 " + zt, xb, _by, col, "right");
    }
    c.restore();
  }

  function _drawVolumeLayers(c, va, M) {
    if (!va) return;
    const { fiToX, pToY, fiMin, reveal, xRight } = M;
    const _by = (M.badgeY != null) ? M.badgeY : 28;
    c.save();
    // 레이어1: 가격-OBV 다이버전스 선
    if (reveal >= 1 && va.divergence.type && va.divergence.pricePts) {
      const col = va.divergence.type === "bullish" ? "#46c28e" : "#e06a6a";
      const a = va.divergence.pricePts[0], b = va.divergence.pricePts[1];
      const xa = fiToX(Math.max(fiMin, a.idx)), ya = pToY(a.price);
      const xb = fiToX(Math.max(fiMin, b.idx)), yb = pToY(b.price);
      if ([xa, ya, xb, yb].every(isFinite)) {
        c.strokeStyle = col; c.lineWidth = 2; c.setLineDash([5, 4]);
        c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke(); c.setLineDash([]);
        _evLabel(c, va.divergence.type === "bullish" ? Str.t.cxBullVolDiv : Str.t.cxBearVolDiv, (xa + xb) / 2, Math.min(ya, yb) - 8, col, "center");
      }
    }
    // 레이어2: 급증 마커 + 상태/관계 배지
    if (reveal >= 2) {
      const relTxt = Str.VOL_REL[va.relationship] || "weakening";
      const relCol = (va.relationship === "confirm" || va.relationship === "capitulation") ? "#46c28e" : "#e06a6a";
      const stTxt = Str.VOL_STATE[va.state] || "normal";
      // 급증 시 마지막 봉(현재) 가격 위에 짧은 골드 수직 틱
      if (va.state === "spike" && isFinite(M.lastPrice)) {
        const x = fiToX(Math.max(fiMin, M.nowFi)), y = pToY(M.lastPrice);
        if (isFinite(x) && isFinite(y)) { c.strokeStyle = FC_GOLD; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x, y - 14); c.lineTo(x, y - 4); c.stroke(); }
      }
      if (M.badges !== false) _evLabel(c, stTxt + " \xb7 " + relTxt, xRight - 6, _by, relCol, "right");
    }
    c.restore();
  }

  function _drawBollingerLayers(c, bb, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    const COL = "#8fb4f0";
    if (!bb.mid || bb.mid.length < 2) { c.restore(); return; }
    const collect = series => { const pts = []; for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) { const v = series[fi]; if (!isFinite(v)) continue; const x = fiToX(fi), y = pToY(v); if (isFinite(x) && isFinite(y)) pts.push([x, y]); } return pts; };
    const stroke = (series, dash, wid) => { const pts = collect(series); if (pts.length < 2) return; c.setLineDash(dash || []); c.lineWidth = wid; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); _skStroke(c, _polyLen(pts)); c.setLineDash([]); };
    if (reveal >= 1) {
      const up = collect(bb.upper), lo = collect(bb.lower);
      if (up.length > 1 && lo.length > 1 && _skReady()) {   // 밴드 채움
        c.globalAlpha = .06; c.fillStyle = COL; c.beginPath();
        up.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
        for (let i = lo.length - 1; i >= 0; i--) c.lineTo(lo[i][0], lo[i][1]);
        c.closePath(); c.fill(); c.globalAlpha = 1;
      }
      c.strokeStyle = "rgba(143,180,240,.5)"; stroke(bb.upper, [3, 3], 1); stroke(bb.lower, [3, 3], 1);
      c.strokeStyle = COL; stroke(bb.mid, [], 1.4);
    }
    if (reveal >= 2 && _skReady() && M.badges !== false) {
      const x = (xRight != null ? xRight : fiToX(nowFi)), y = pToY(bb.last.mid);
      const st = bb.state, sTxt = Str.BB_STATE[st] || "mid band";
      const col = bb.bias > 0.15 ? "#46c28e" : bb.bias < -0.15 ? "#e06a6a" : COL;
      if (isFinite(x) && isFinite(y)) _evLabel(c, "BB " + sTxt + (bb.squeeze ? " · squeeze" : "") + " · %B" + bb.last.pctB.toFixed(2), x - 6, y, col, "right");
    }
    if (M.focused && M.xNow != null && M.futBars) _projFwd(c, bb.mid, nowFi, M.xNow, (xRight != null ? xRight : fiToX(nowFi)), M.futBars, pToY, COL, "Bollinger midline projection");
    c.restore();
  }

  function _drawMacdLayers(c, m, M) {
    if (!_skReady()) return;
    const { xRight, nowFi, fiToX, badgeY } = M;
    const x = (xRight != null ? xRight : fiToX(nowFi)), y = (badgeY != null ? badgeY : 14);
    const cross = m.cross && m.cross.type ? (m.cross.type === "bull" ? Str.t.legGolden : Str.t.legDead) + m.cross.barsAgo + Str.t.legBars : Str.t.legNoCross;
    const col = m.bias > 0.15 ? "#46c28e" : m.bias < -0.15 ? "#e06a6a" : "#e0a86a";
    if (isFinite(x) && isFinite(y)) _evLabel(c, "MACD " + (m.last.hist >= 0 ? "+" : "") + m.last.hist.toFixed(1) + " · " + cross, x, y, col, "right");
  }
  /* ===== 원문 복사 끝 ===== */

  // 매 프레임 라벨 레지스트리 초기화 — 안 부르면 이전 프레임 박스가 남아 라벨이 밀린다
  function resetLabels(w, h) {
    _evLabelBoxes = []; _axisLabelBoxes = []; _predLabelBoxes = [];
    _evW = w; _evH = h; _labelMode = "all";
  }

  // MSPreds 가 쓸 최소 접근자. 배열은 resetLabels 가 매 프레임 새로 만들므로
  // 참조를 캐싱하지 말고 호출 시점에 꺼낸다(그래서 값이 아니라 getter 함수로 낸다).
  return { resetLabels: resetLabels,
           evLabel: _evLabel, fitBoxY: _fitBoxY,
           evBoxes: function () { return _evLabelBoxes; },
           axisBoxes: function () { return _axisLabelBoxes; },
           predBoxes: function () { return _predLabelBoxes; },
           reservePredBox: function (b) { _predLabelBoxes.push(b); _evLabelBoxes.push(b); },
           ma: _drawMALayers, bollinger: _drawBollingerLayers,
           rsiBadge: _drawRsiLayers, macdBadge: _drawMacdLayers, volumeBadge: _drawVolumeLayers };
});
