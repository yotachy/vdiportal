/* 머니스쿱 앱 — 모바일 차트 v1(프레젠테이션 층 — 엔진 출력만 소비, 계산 정본은 엔진).
   기하 상수는 시안 프로토 chart()(L2149~2187) 승계: 411×411 · 패딩 8/46/14/26 ·
   과거 58% · 캔들 최대 56봉 · 예측선 55% 실선/점선 분할.
   프로토와 다른 점(정본 우선): 콘·1차 예측선은 삼각/이징 데모가 아니라 엔진 lo/hi/path
   실곡선을 그대로 그린다. MA(20)·볼린저(20, ±2σ)도 엔진 지표 파라미터와 동일.
   순수 함수(build/svg — DOM 없음·node 테스트) + 화면 모듈이 svg() 문자열을 삽입한다. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.MS = root.MS || {}; root.MS.chart = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const W = 411, H = 411, PL = 8, PR = 46, PT = 14, PB = 26;
  const PW = W - PL - PR, PH = H - PT - PB, NMAX = 56, PAST = 0.58, SPLIT = 0.55;

  function F(v) { return (+v).toFixed(1); }
  function line(pts) {
    let s = "";
    for (let i = 0; i < pts.length; i++) s += (i ? "L" : "M") + F(pts[i][0]) + " " + F(pts[i][1]);
    return s;
  }

  // candles: [{o,h,l,c}] 실 OHLC(전체 — 마지막 NMAX 만 표시), pred: 엔진 prediction(null=분석 전)
  // opts: { frac } 실행 연출용 캔들 일부 표시
  function build(candles, pred, opts) {
    opts = opts || {};
    const all = candles || [];
    const view = all.slice(Math.max(0, all.length - NMAX));
    const n = view.length;
    const pastW = PW * PAST;
    const hasPred = !!(pred && pred.path && pred.path.length);
    const futW = hasPred ? (pred.futW || pred.path.length) : 0;

    // 스케일: 표시 캔들 + (있으면) 콘 전체를 담는다(프로토 lo/hi 확장 + 마진 4.5%)
    let lo = Infinity, hi = -Infinity;
    view.forEach(function (d) { if (+d.l < lo) lo = +d.l; if (+d.h > hi) hi = +d.h; });
    if (hasPred) {
      pred.lo.forEach(function (v) { if (v < lo) lo = v; });
      pred.hi.forEach(function (v) { if (v > hi) hi = v; });
    }
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) { lo = 0; hi = 1; }
    const mg = (hi - lo) * 0.045;
    lo -= mg; hi += mg;

    const toY = function (v) { return PT + (hi - v) / (hi - lo) * PH; };
    const toX = function (i) { return PL + pastW * (n > 1 ? i / (n - 1) : 0); };
    const xa = PL + pastW, xe = PL + PW;
    const toXF = function (k) { return xa + (xe - xa) * (futW ? k / futW : 0); };   // 미래 k(1..futW)

    // 캔들(심지·양봉·음봉) — 프로토 공식 그대로
    const bw = Math.max(2.4, pastW / Math.max(1, n) * 0.58);
    const dN = Math.max(0, Math.round(n * (opts.frac != null ? opts.frac : 1)));
    let up = "", down = "", wick = "";
    for (let i = 0; i < dN; i++) {
      const d = view[i], x = toX(i);
      wick += "M" + F(x) + " " + F(toY(+d.h)) + "L" + F(x) + " " + F(toY(+d.l));
      const y1 = toY(Math.max(+d.o, +d.c));
      let y2 = toY(Math.min(+d.o, +d.c));
      if (y2 - y1 < 1.1) y2 = y1 + 1.1;
      const s = "M" + F(x - bw / 2) + " " + F(y1) + "h" + F(bw) + "V" + F(y2) + "h" + F(-bw) + "Z";
      if (+d.c >= +d.o) up += s; else down += s;
    }

    const closes = view.map(function (d) { return +d.c; });
    const anchor = hasPred && isFinite(pred.anchor) ? pred.anchor : (closes.length ? closes[closes.length - 1] : 0);
    const ya = toY(anchor);

    // 콘(엔진 lo/hi 실곡선 폴리곤) + 내부 코어(중심선 기준 절반 폭)
    let cone = null, cin = null, p1a = null, p1b = null, targetY = null;
    if (hasPred) {
      const hiPts = [[xa, ya]], loPts = [];
      for (let k = 1; k <= futW; k++) hiPts.push([toXF(k), toY(pred.hi[k - 1])]);
      for (let k = futW; k >= 1; k--) loPts.push([toXF(k), toY(pred.lo[k - 1])]);
      cone = line(hiPts) + loPts.map(function (q) { return "L" + F(q[0]) + " " + F(q[1]); }).join("") + "Z";
      const ciH = [[xa, ya]], ciL = [];
      for (let k = 1; k <= futW; k++) ciH.push([toXF(k), toY((pred.path[k - 1] + pred.hi[k - 1]) / 2)]);
      for (let k = futW; k >= 1; k--) ciL.push([toXF(k), toY((pred.path[k - 1] + pred.lo[k - 1]) / 2)]);
      cin = line(ciH) + ciL.map(function (q) { return "L" + F(q[0]) + " " + F(q[1]); }).join("") + "Z";
      // 1차 예측선 — 엔진 path, 55% 지점에서 실선(p1a)/성긴 점선(p1b) 분할
      const P = [[xa, ya]];
      for (let k = 1; k <= futW; k++) P.push([toXF(k), toY(pred.path[k - 1])]);
      const sp = Math.max(1, Math.round((P.length - 1) * SPLIT));
      p1a = line(P.slice(0, sp + 1));
      p1b = line(P.slice(sp));
      targetY = F(toY(pred.path[futW - 1]));
    }

    // MA(20) — 엔진 지표 파라미터와 동일(가용 구간은 누적 평균으로 시작)
    const maPts = [];
    for (let i = 0; i < dN; i++) {
      const s0 = Math.max(0, i - 19);
      let s = 0;
      for (let j = s0; j <= i; j++) s += closes[j];
      maPts.push([toX(i), toY(s / (i - s0 + 1))]);
    }
    // 볼린저(20, ±2σ)
    const buPts = [], bdPts = [];
    for (let i = 0; i < dN; i++) {
      const s0 = Math.max(0, i - 19);
      const seg = closes.slice(s0, i + 1);
      const mn = seg.reduce(function (a, b) { return a + b; }, 0) / seg.length;
      const sd = Math.sqrt(seg.reduce(function (a, b) { return a + (b - mn) * (b - mn); }, 0) / seg.length) || anchor * 0.004;
      buPts.push([toX(i), toY(mn + sd * 2)]);
      bdPts.push([toX(i), toY(mn - sd * 2)]);
    }

    return { view: "0 0 " + W + " " + H, n: n, dN: dN,
      xa: xa, xe: xe, ya: ya, toY: toY, toX: toX, toXF: toXF,
      wick: wick, up: up, down: down,
      cone: cone, cin: cin, p1a: p1a, p1b: p1b, targetY: targetY,
      ma: dN ? line(maPts) : null, bu: dN ? line(buPts) : null, bd: dN ? line(bdPts) : null };
  }

  // 표준 레이어 조립(아래→위: 격자 → 콘 → 볼린저/MA → 캔들 → 예측선) — 색은 전부 토큰
  // layers: { cone, pred, ma, boll, coneBasic(회색 콘 — basic 티어) }
  function svg(m, layers) {
    layers = layers || {};
    let s = '<svg viewBox="' + m.view + '" width="100%" height="396" preserveAspectRatio="xMidYMid meet" style="display:block">';
    for (let g = 1; g <= 4; g++) {
      const y = 14 + (411 - 40) * g / 5;
      s += '<path d="M8 ' + F(y) + "H" + F(411 - 46) + '" stroke="var(--gr)" stroke-width="1"/>';
    }
    if (m.cone && layers.cone) {
      const cf = layers.coneBasic ? "var(--m3)" : "var(--ac)";
      s += '<path class="ch-cone" d="' + m.cone + '" fill="' + cf + '" opacity="0.10" style="animation:msConePulse 2.6s ease-in-out infinite"/>';
      s += '<path class="ch-cin" d="' + m.cin + '" fill="' + cf + '" opacity="0.10"/>';
    }
    if (m.bu && layers.boll) {
      s += '<path class="ch-bu" d="' + m.bu + '" fill="none" stroke="var(--bl2)" stroke-width="1.1" opacity="0.75"/>';
      s += '<path class="ch-bd" d="' + m.bd + '" fill="none" stroke="var(--bl2)" stroke-width="1.1" opacity="0.75"/>';
    }
    if (m.ma && layers.ma) {
      s += '<path class="ch-ma" d="' + m.ma + '" fill="none" stroke="var(--bl)" stroke-width="1.4" opacity="0.9"/>';
    }
    s += '<path d="' + m.wick + '" stroke="var(--m3)" stroke-width="1"/>';
    s += '<path d="' + m.up + '" fill="var(--up)"/>';
    s += '<path d="' + m.down + '" fill="var(--dn)"/>';
    if (m.p1a && layers.pred) {
      s += '<path d="' + m.p1a + '" fill="none" stroke="var(--ac)" stroke-width="6" stroke-linecap="round" opacity="0.14"/>';
      s += '<path class="ch-p1a" d="' + m.p1a + '" fill="none" stroke="var(--ac)" stroke-width="1.9" style="animation:msPredPulse 2.2s ease-in-out infinite"/>';
      s += '<path class="ch-p1b" d="' + m.p1b + '" fill="none" stroke="var(--ac)" stroke-width="1.9" stroke-dasharray="1.5 4.5"/>';
    }
    s += "</svg>";
    return s;
  }

  return { build: build, svg: svg, W: W, H: H, NMAX: NMAX };
});
