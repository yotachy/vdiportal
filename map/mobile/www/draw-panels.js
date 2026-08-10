// PC 스쿱포지 forge-draw.js 에서 포팅 — 오실레이터·거래량 서브패널.
// 원본은 자기 캔버스를 DOM getElementById 로 직접 잡으므로 머리 3줄을 인자로 바꿨다.
// 원본 심볼: FC_ACC FC_DIM _oscA fcFit _osReveal fcDrawRsi fcDrawMacd fcDrawVol
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./strings.js"));
  else root.MSPanels = factory(root.MSStr);
})(typeof self !== "undefined" ? self : this, function (Str) {
  "use strict";

  var T = (Str && Str.t) || {};   // Fix 7: 이 파일도 다른 draw-* 모듈처럼 MSStr 단일 출처를 쓴다

  // ── 심 ──
  var _oscRGB = "232,180,99";            // 핸드오프 gold #e8b463 의 rgb — 정확히 일치한다
  var FC_OSC  = "#e8b463";
  function _hbarRsi() { return ""; }     // 원본은 meta HTML 게이지용. 모바일은 Counted 섹션이 대신한다

  /* ===== 여기부터 forge-draw.js 원문 복사(머리 수술 적용) — 2, 9, 16, 430-464, 538-553, 576-610 ===== */
  const FC_ACC  = "#34e6dc";   /* teal accent (chart.html --acc) */
  const FC_DIM  = "#5A6478";   /* axis labels (중간 슬레이트 — 명/암 배경 모두 판독) */
  function _oscA(a)  { return "rgba(" + _oscRGB + "," + a + ")"; }    /* 서브패널 액센트(alpha) */
  // fcFit(원본: 자기 캔버스를 DOM 에서 잡아 DPR 로 재설정)은 포팅 대상 8심볼 중 하나이지만,
  // 머리 수술로 세 함수 모두 (c,cw,ch,...) 를 직접 받게 되어 호출부가 사라졌다.
  // 유일한 구현은 DOM 전용 캔버스 크기 API 뿐이라 그대로 옮기면 DOM 미참조 하드 게이트를 깨므로 이식하지 않는다.
  // 캔버스 크기 조정은 report 화면(DPR 트랜스폼 설정)과 chart-layout.js(rect 계산)의 책임이다.

  function _osReveal(c, cw, ch, reveal) {
    if (reveal == null || reveal >= 1) return;
    const rx = cw * Math.max(0, Math.min(1, reveal));
    c.clearRect(rx, 0, cw - rx + 3, ch + 3);
    c.save(); c.fillStyle = FC_ACC; c.shadowColor = FC_ACC; c.shadowBlur = 9; c.fillRect(rx - 1.4, 2, 2.4, ch - 4); c.restore();
  }
  function fcDrawRsi(c, cw, ch, rsi, reveal) {
    c.clearRect(0, 0, cw, ch);
    const s = (rsi && rsi.series) || [];
    if (s.length < 2) { c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center"; c.fillText(T.pnlRsiEmpty, cw / 2, ch / 2); c.textAlign = "left"; return; }
    const padL = 6, padR = 28, padV = 8, plotW = cw - padL - padR, plotH = ch - 2 * padV;
    const yOf = v => padV + (1 - v / 100) * plotH, xOf = i => padL + (i / (s.length - 1)) * plotW;
    c.fillStyle = "rgba(224,106,106,.06)"; c.fillRect(padL, yOf(100), plotW, yOf(70) - yOf(100));
    c.fillStyle = "rgba(70,194,142,.06)"; c.fillRect(padL, yOf(30), plotW, yOf(0) - yOf(30));
    c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.setLineDash([3, 3]);
    [30, 50, 70].forEach(lv => { const y = yOf(lv); c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + plotW, y); c.stroke(); c.fillStyle = "#8a92b2"; c.font = "10px ui-monospace,monospace"; c.fillText(lv, padL + plotW + 3, y + 3); });
    c.setLineDash([]);
    // 라인 아래 그라디언트 채움(가독성 · 이미지3 차용)
    const rgrad = c.createLinearGradient(0, padV, 0, padV + plotH);
    rgrad.addColorStop(0, _oscA(.30)); rgrad.addColorStop(.6, _oscA(.08)); rgrad.addColorStop(1, _oscA(0));
    c.fillStyle = rgrad; c.beginPath();
    s.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.lineTo(xOf(s.length - 1), padV + plotH); c.lineTo(xOf(0), padV + plotH); c.closePath(); c.fill();
    c.strokeStyle = FC_OSC; c.lineWidth = 1.05; c.lineJoin = "round"; c.lineCap = "round"; c.shadowColor = _oscA(.4); c.shadowBlur = 3.5; c.beginPath();
    s.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.shadowBlur = 0;
    const lx = xOf(s.length - 1), ly = yOf(rsi.last);
    c.fillStyle = FC_OSC; c.beginPath(); c.arc(lx, ly, 2.4, 0, 7); c.fill();
    if (rsi.divergence && rsi.divergence.pricePts) {
      const col = rsi.divergence.type === "bullish" ? "#46c28e" : "#e06a6a";
      rsi.divergence.pricePts.forEach(p => { const i = p.idx; if (i < 0 || i >= s.length) return; const x = xOf(i), y = yOf(s[i]); c.fillStyle = col; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); });
    }
    _osReveal(c, cw, ch, reveal);
  }
  function fcDrawMacd(c, cw, ch, m, reveal) {
    c.clearRect(0, 0, cw, ch);
    const macd = (m && m.macd) || [], sig = (m && m.sig) || [], hist = (m && m.hist) || [];
    if (macd.length < 2) { c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center"; c.fillText(T.pnlMacdEmpty, cw / 2, ch / 2); c.textAlign = "left"; return; }
    const padL = 6, padR = 30, padV = 10, plotW = cw - padL - padR, plotH = ch - 2 * padV;
    let mx = 1e-9; for (let i = 0; i < macd.length; i++) mx = Math.max(mx, Math.abs(macd[i]), Math.abs(sig[i]), Math.abs(hist[i])); mx *= 1.1;
    const yOf = v => padV + (1 - (v + mx) / (2 * mx)) * plotH, xOf = i => padL + (i / (macd.length - 1)) * plotW;
    c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.beginPath(); c.moveTo(padL, yOf(0)); c.lineTo(padL + plotW, yOf(0)); c.stroke();
    const bw = Math.max(1, plotW / macd.length * 0.7);
    for (let i = 0; i < hist.length; i++) { const x = xOf(i), y0 = yOf(0), y = yOf(hist[i]); c.fillStyle = hist[i] >= 0 ? "rgba(70,194,142,.55)" : "rgba(224,106,106,.55)"; c.fillRect(x - bw / 2, Math.min(y0, y), bw, Math.abs(y - y0) || 1); }
    const drawLine = (arr, col, wid) => { c.strokeStyle = col; c.lineWidth = wid; c.lineJoin = "round"; c.beginPath(); arr.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); };
    drawLine(macd, "#e0a86a", 1.7); drawLine(sig, "#8fb4f0", 1.4);
    _osReveal(c, cw, ch, reveal);
  }
  function fcDrawVol(c, cw, ch, va, reveal) {
    c.clearRect(0, 0, cw, ch);
    const s = (va && va.series) || [];
    if (s.length < 2) { c.fillStyle = "#8a92b2"; c.font = "12px Pretendard,'Malgun Gothic',sans-serif"; c.fillText(T.pnlVolumeEmpty, 10, ch / 2); return; }
    const pad = 6, w = cw - pad * 2, h = ch - pad * 2 - 14;
    const n = s.length, obv = va.obv || [];
    // 막대 다운샘플: 너무 많으면(성능·가독성) ~76개 버킷 평균으로 축약 → 눈에 유의미한 정도만
    const MAXB = 76, step = Math.max(1, Math.ceil(n / MAXB)), nb = Math.ceil(n / step);
    const bvals = [], bup = []; let bmax = 1;
    for (let b = 0; b < nb; b++) {
      const i0 = b * step, i1 = Math.min(n, i0 + step);
      let sv = 0; for (let i = i0; i < i1; i++) sv += s[i];
      const avg = sv / Math.max(1, i1 - i0); bvals.push(avg); if (avg > bmax) bmax = avg;
      const li = i1 - 1; bup.push(li > 0 && obv[li] >= obv[Math.max(0, i0 - 1)]);
    }
    const bw = Math.max(1.5, w / nb - 1.6);
    for (let b = 0; b < nb; b++) {
      const bh = (bvals[b] / bmax) * h, x = pad + (b / nb) * w, y = pad + h - bh;
      const spike = va.state === "spike" && b >= nb - 2;
      c.fillStyle = spike ? _oscA(.42) : bup[b] ? "rgba(70,194,142,.13)" : "rgba(224,106,106,.13)";   // 막대는 아주 흐리게(배경 보조)
      c.fillRect(x, y, bw, bh);
    }
    // OBV 라인(보조 스케일)
    if (obv.length === n) {
      let omin = Math.min.apply(null, obv), omax = Math.max.apply(null, obv); const orng = (omax - omin) || 1;
      const _oc = va.obvTrend > 0.05 ? "#46c28e" : va.obvTrend < -0.05 ? "#e06a6a" : "#c7cede";   // OBV 추이선 = 주인공(가늘고 정밀하게)
      c.save(); c.strokeStyle = _oc; c.lineWidth = 1.2; c.lineJoin = "round"; c.lineCap = "round"; c.shadowColor = _oc; c.shadowBlur = 4.5; c.beginPath();
      for (let i = 0; i < n; i++) { const x = pad + (i / n) * w, y = pad + h - ((obv[i] - omin) / orng) * h; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke(); c.restore();
    }
    _osReveal(c, cw, ch, reveal);
  }
  /* ===== 원문 복사 끝 ===== */

  return { rsi: fcDrawRsi, macd: fcDrawMacd, volume: fcDrawVol };
});
