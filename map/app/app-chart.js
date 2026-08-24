/* 머니스쿱 앱 — 모바일 차트(프레젠테이션 층 — 엔진 출력만 소비, 계산 정본은 엔진).
   기하 상수는 시안 프로토 chart()(L2149~2187) 승계: 411×411 · 패딩 8/46/14/26 ·
   과거 58% · 캔들 최대 56봉 · 예측선 55% 실선/점선 분할.
   품질 하한(2026-08-24 사용자 확정): 작도는 PC 웹버전과 동일 의미 — 오버레이 15종은
   엔진 analyze* 원자료(Report.drawings)로 그리고, 오실레이터형은 배지(PC hero 배지 규약).
   레이어 순서(프로토 L357~392): 격자 → 심화 작도 → 콘 → 볼린저/MA → 캔들 → 예측선 1/2/3차.
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

  // candles: 실 OHLC 전체(마지막 NMAX 표시), pred: 엔진 prediction(null=분석 전), opts:{frac}
  function build(candles, pred, opts) {
    opts = opts || {};
    const all = candles || [];
    const startIdx = Math.max(0, all.length - NMAX);
    const view = all.slice(startIdx);
    const n = view.length;
    const pastW = PW * PAST;
    const hasPred = !!(pred && pred.path && pred.path.length);
    const futW = hasPred ? (pred.futW || pred.path.length) : 0;

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
    const toXF = function (k) { return xa + (xe - xa) * (futW ? Math.min(1, k / futW) : 0); };
    const lastGi = all.length - 1;
    // 전역 인덱스 → x (미래 인덱스는 예측 축으로 연속 매핑)
    const mapX = function (gi) {
      if (gi <= lastGi) return toX(Math.max(0, gi - startIdx));
      return toXF(gi - lastGi);
    };

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

    let cone = null, cin = null, p1a = null, p1b = null, p2 = null, p3 = null, targetY = null;
    if (hasPred) {
      const hiPts = [[xa, ya]], loPts = [];
      for (let k = 1; k <= futW; k++) hiPts.push([toXF(k), toY(pred.hi[k - 1])]);
      for (let k = futW; k >= 1; k--) loPts.push([toXF(k), toY(pred.lo[k - 1])]);
      cone = line(hiPts) + loPts.map(function (q) { return "L" + F(q[0]) + " " + F(q[1]); }).join("") + "Z";
      const ciH = [[xa, ya]], ciL = [];
      for (let k = 1; k <= futW; k++) ciH.push([toXF(k), toY((pred.path[k - 1] + pred.hi[k - 1]) / 2)]);
      for (let k = futW; k >= 1; k--) ciL.push([toXF(k), toY((pred.path[k - 1] + pred.lo[k - 1]) / 2)]);
      cin = line(ciH) + ciL.map(function (q) { return "L" + F(q[0]) + " " + F(q[1]); }).join("") + "Z";
      const P1 = [[xa, ya]];
      for (let k = 1; k <= futW; k++) P1.push([toXF(k), toY(pred.path[k - 1])]);
      const sp = Math.max(1, Math.round((P1.length - 1) * SPLIT));
      p1a = line(P1.slice(0, sp + 1));
      p1b = line(P1.slice(sp));
      targetY = F(toY(pred.path[futW - 1]));
      if (pred.counter && pred.counter.length) {
        const P2 = [[xa, ya]];
        for (let k = 1; k <= pred.counter.length; k++) P2.push([toXF(k), toY(pred.counter[k - 1])]);
        p2 = line(P2);
      }
      if (pred.custom && pred.custom.length) {
        const P3 = [[xa, ya]];
        for (let k = 1; k <= pred.custom.length; k++) P3.push([toXF(k), toY(pred.custom[k - 1])]);
        p3 = line(P3);
      }
    }

    // MA(20)·볼린저(20,±2σ) — 엔진 기본값과 동일 산식(표시 구간 내 자체 계산)
    const maPts = [], buPts = [], bdPts = [];
    for (let i = 0; i < dN; i++) {
      const s0 = Math.max(0, i - 19);
      const seg = closes.slice(s0, i + 1);
      const mn = seg.reduce(function (a, b) { return a + b; }, 0) / seg.length;
      const sd = Math.sqrt(seg.reduce(function (a, b) { return a + (b - mn) * (b - mn); }, 0) / seg.length) || anchor * 0.004;
      maPts.push([toX(i), toY(mn)]);
      buPts.push([toX(i), toY(mn + sd * 2)]);
      bdPts.push([toX(i), toY(mn - sd * 2)]);
    }

    return { view: "0 0 " + W + " " + H, n: n, dN: dN, startIdx: startIdx, lastGi: lastGi, futW: futW,
      xa: xa, xe: xe, ya: ya, toY: toY, toX: toX, toXF: toXF, mapX: mapX, priceLo: lo, priceHi: hi,
      wick: wick, up: up, down: down,
      cone: cone, cin: cin, p1a: p1a, p1b: p1b, p2: p2, p3: p3, targetY: targetY,
      ma: dN ? line(maPts) : null, bu: dN ? line(buPts) : null, bd: dN ? line(bdPts) : null };
  }

  // 전역 인덱스 배열 → 표시 구간 폴리라인(비유한 값은 선 끊김)
  function polyArr(m, arr, endGi) {
    if (!Array.isArray(arr)) return "";
    const from = m.startIdx, to = Math.min(endGi != null ? endGi : m.lastGi, m.startIdx + m.dN - 1);
    let s = "", pen = false;
    for (let gi = from; gi <= to; gi++) {
      const v = arr[gi];
      if (v == null || !isFinite(v)) { pen = false; continue; }
      s += (pen ? "L" : "M") + F(m.mapX(gi)) + " " + F(m.toY(v));
      pen = true;
    }
    return s;
  }
  function hline(m, price, x0) {
    return "M" + F(x0 != null ? x0 : PL) + " " + F(m.toY(price)) + "H" + F(m.xe);
  }

  // ── 심화 작도 오버레이(엔진 원자료·PC 의미 동일). off = {지표id:1} 숨김 ──
  function overlays(m, report, off) {
    if (!report || !report.drawings) return "";
    const D = report.drawings;
    off = off || {};
    let s = "";
    const on = function (id) { return D[id] && !off[id]; };

    // 일목 구름(전방 26 시프트·spanA/B 면) — 시안 DRW cloud #22d3ee
    if (on("ichimoku")) {
      const d = D.ichimoku, sh = d.shift || 26;
      const topP = [], botP = [];
      const endGi = m.lastGi + Math.min(sh, m.futW || sh);
      for (let gi = m.startIdx; gi <= endGi; gi++) {
        const a = d.spanA[gi - sh], b = d.spanB[gi - sh];
        if (a == null || b == null || !isFinite(a) || !isFinite(b)) continue;
        topP.push([m.mapX(gi), m.toY(a)]);
        botP.push([m.mapX(gi), m.toY(b)]);
      }
      if (topP.length > 1) {
        s += '<path class="dw-ichimoku" d="' + line(topP) + botP.reverse().map(function (q) { return "L" + F(q[0]) + " " + F(q[1]); }).join("") + 'Z" fill="var(--cy)" opacity="0.09"/>' +
          '<path d="' + line(topP) + '" fill="none" stroke="var(--cy)" stroke-width="0.9" opacity="0.5"/>';
      }
    }
    // 추세 회귀채널(중심±kσ·지지/저항 피벗선 — 1.72배 연장은 프로토 규약)
    if (on("trend")) {
      const d = D.trend, ch = d.channel;
      const gi0 = m.startIdx, gi1 = m.lastGi + Math.round((m.futW || 0) * 0.4);
      const ln2 = function (slope, b, dy, cls) {
        const y0 = slope * gi0 + b + dy, y1 = slope * gi1 + b + dy;
        return '<path class="' + cls + '" d="M' + F(m.mapX(gi0)) + " " + F(m.toY(y0)) + "L" + F(m.mapX(gi1)) + " " + F(m.toY(y1)) + '" fill="none" stroke="var(--bl)" stroke-width="1" opacity="0.65"/>';
      };
      if (ch) s += ln2(ch.slopeRaw, ch.bRaw, ch.sigma * ch.k, "dw-trend") + ln2(ch.slopeRaw, ch.bRaw, -ch.sigma * ch.k, "dw-trend");
    }
    // 켈트너·돈치안(퍼바 밴드 — 정적 금지, PC 규약)
    if (on("keltner")) {
      s += '<path class="dw-keltner" d="' + polyArr(m, D.keltner.upper) + '" fill="none" stroke="var(--lv)" stroke-width="0.9" stroke-dasharray="3 3" opacity="0.6"/>' +
        '<path d="' + polyArr(m, D.keltner.lower) + '" fill="none" stroke="var(--lv)" stroke-width="0.9" stroke-dasharray="3 3" opacity="0.6"/>';
    }
    if (on("donchian")) {
      s += '<path class="dw-donchian" d="' + polyArr(m, D.donchian.upper) + '" fill="none" stroke="var(--am)" stroke-width="0.9" opacity="0.5"/>' +
        '<path d="' + polyArr(m, D.donchian.lower) + '" fill="none" stroke="var(--am)" stroke-width="0.9" opacity="0.5"/>';
    }
    // VWAP(선+밴드)
    if (on("vwap")) {
      s += '<path class="dw-vwap" d="' + polyArr(m, D.vwap.vwap) + '" fill="none" stroke="var(--pk)" stroke-width="1.1" opacity="0.75"/>' +
        '<path d="' + polyArr(m, D.vwap.upper) + '" fill="none" stroke="var(--pk)" stroke-width="0.7" opacity="0.3"/>' +
        '<path d="' + polyArr(m, D.vwap.lower) + '" fill="none" stroke="var(--pk)" stroke-width="0.7" opacity="0.3"/>';
    }
    // 슈퍼트렌드(추세 방향별 색 분절)
    if (on("supertrend")) {
      const d = D.supertrend;
      let seg = [], curDir = 0;
      const flush = function () {
        if (seg.length > 1) s += '<path class="dw-supertrend" d="' + line(seg) + '" fill="none" stroke="' + (curDir >= 0 ? "var(--up)" : "var(--dn)") + '" stroke-width="1.3" opacity="0.8"/>';
        seg = [];
      };
      for (let gi = m.startIdx; gi <= m.lastGi; gi++) {
        const v = d.line[gi], t = d.trend[gi];
        if (v == null || !isFinite(v)) { flush(); continue; }
        if (seg.length && t !== curDir) { flush(); }
        curDir = t;
        seg.push([m.mapX(gi), m.toY(v)]);
      }
      flush();
    }
    // PSAR 점
    if (on("psar")) {
      let dots = "";
      for (let gi = m.startIdx; gi <= m.lastGi; gi++) {
        const v = D.psar.series[gi];
        if (v == null || !isFinite(v)) continue;
        dots += '<circle cx="' + F(m.mapX(gi)) + '" cy="' + F(m.toY(v)) + '" r="1.2"/>';
      }
      s += '<g class="dw-psar" fill="var(--lv)" opacity="0.8">' + dots + "</g>";
    }
    // 피보나치 되돌림(주요 레벨 수평 점선 + 우측 라벨)
    if (on("fib")) {
      const major = { 0: 1, 0.382: 1, 0.5: 1, 0.618: 1, 1: 1 };
      (D.fib.levels || []).forEach(function (L2) {
        if (!(L2.ratio in major)) return;
        if (L2.price < m.priceLo || L2.price > m.priceHi) return;
        s += '<path class="dw-fib" d="' + hline(m, L2.price) + '" stroke="var(--ac)" stroke-width="0.8" stroke-dasharray="4 4" opacity="' + (L2.golden ? 0.75 : 0.45) + '"/>' +
          '<text x="' + F(m.xe + 2) + '" y="' + F(m.toY(L2.price) + 3) + '" font-size="8" fill="var(--ac)" opacity="0.8">' + L2.ratio + "</text>";
      });
    }
    // 피벗 S/R(정적 레벨 — PC 규약상 피벗만 정적)
    if (on("pivot")) {
      const d = D.pivot;
      const lv = function (p2, cls, dash) {
        if (p2 == null || !isFinite(p2) || p2 < m.priceLo || p2 > m.priceHi) return "";
        return '<path class="' + cls + '" d="' + hline(m, p2) + '" stroke="var(--am)" stroke-width="0.9"' + (dash ? ' stroke-dasharray="5 4"' : "") + ' opacity="0.6"/>';
      };
      s += lv(d.P, "dw-pivot", false);
      (d.R || []).forEach(function (v) { s += lv(v, "dw-pivot", true); });
      (d.S || []).forEach(function (v) { s += lv(v, "dw-pivot", true); });
    }
    // Gann 부채꼴(앵커 기점 각도선)
    if (on("gann")) {
      const d = D.gann;
      if (d.anchor && isFinite(d.anchor.price)) {
        let g = "";
        (d.angles || []).forEach(function (a) {
          const gi1 = m.lastGi + Math.round((m.futW || 0) * 0.5);
          const y1 = d.anchor.price + a.slope * (gi1 - d.anchor.idx);
          g += "M" + F(m.mapX(Math.max(m.startIdx, d.anchor.idx))) + " " +
            F(m.toY(d.anchor.price + a.slope * (Math.max(m.startIdx, d.anchor.idx) - d.anchor.idx))) +
            "L" + F(m.mapX(gi1)) + " " + F(m.toY(Math.max(m.priceLo, Math.min(m.priceHi, y1))));
        });
        s += '<path class="dw-gann" d="' + g + '" fill="none" stroke="var(--lv)" stroke-width="0.7" stroke-dasharray="2 3" opacity="0.5"/>';
      }
    }
    // 시장구조(스윙 지그재그 + H/L)
    if (on("structure")) {
      const sw = (D.structure.swings || []).filter(function (p2) { return p2.idx >= m.startIdx; });
      if (sw.length > 1) {
        s += '<path class="dw-structure" d="' + line(sw.map(function (p2) { return [m.mapX(p2.idx), m.toY(p2.price)]; })) + '" fill="none" stroke="var(--pk)" stroke-width="1" opacity="0.55"/>';
        sw.slice(-4).forEach(function (p2) {
          s += '<text x="' + F(m.mapX(p2.idx)) + '" y="' + F(m.toY(p2.price) + (p2.type === "H" ? -4 : 9)) + '" font-size="8" text-anchor="middle" fill="var(--pk)" opacity="0.8">' + p2.type + "</text>";
        });
      }
    }
    // SMC 존(FVG·오더블록 — 우측으로 연장되는 영역)
    if (on("smc")) {
      const zone = function (z, cls) {
        if (z.idx < m.startIdx - 40) return "";
        const x0 = m.mapX(Math.max(m.startIdx, z.idx));
        const yT = m.toY(Math.min(m.priceHi, z.hi)), yB = m.toY(Math.max(m.priceLo, z.lo));
        const col = z.type === "bull" ? "var(--up)" : "var(--dn)";
        return '<rect class="' + cls + '" x="' + F(x0) + '" y="' + F(yT) + '" width="' + F(m.xe - x0) + '" height="' + F(Math.max(1, yB - yT)) + '" fill="' + col + '" opacity="0.08" stroke="' + col + '" stroke-width="0.5" stroke-opacity="0.3"/>';
      };
      (D.smc.fvgs || []).slice(-3).forEach(function (z) { s += zone(z, "dw-smc"); });
      (D.smc.obs || []).slice(-2).forEach(function (z) { s += zone(z, "dw-smc"); });
    }
    // 볼륨 프로파일(우측 수평 히스토그램)
    if (on("volumeprofile")) {
      const d = D.volumeprofile;
      let bars = "";
      (d.bins || []).forEach(function (b) {
        if (!d.maxVol || b.mid < m.priceLo || b.mid > m.priceHi) return;
        const w2 = Math.max(1, b.vol / d.maxVol * 52);
        bars += '<rect x="' + F(m.xe - w2) + '" y="' + F(m.toY(b.hi)) + '" width="' + F(w2) + '" height="' + F(Math.max(1, m.toY(b.lo) - m.toY(b.hi) - 0.6)) + '"/>';
      });
      s += '<g class="dw-volumeprofile" fill="var(--cy)" opacity="0.16">' + bars + "</g>";
    }
    // 엘리어트(파동 지그재그 + 라벨)
    if (on("elliott")) {
      const wv = (D.elliott.waves || []).filter(function (p2) { return p2.idx >= m.startIdx; });
      if (wv.length > 1) {
        s += '<path class="dw-elliott" d="' + line(wv.map(function (p2) { return [m.mapX(p2.idx), m.toY(p2.price)]; })) + '" fill="none" stroke="var(--lv)" stroke-width="1" stroke-dasharray="1 0" opacity="0.6"/>';
        wv.forEach(function (p2) {
          s += '<circle cx="' + F(m.mapX(p2.idx)) + '" cy="' + F(m.toY(p2.price)) + '" r="1.6" fill="var(--lv)"/>' +
            '<text x="' + F(m.mapX(p2.idx) + 3) + '" y="' + F(m.toY(p2.price) - 3) + '" font-size="8.5" fill="var(--lv)">' + (p2.label || "") + "</text>";
        });
      }
    }
    // MA 3선(20 실선 · 60/120 얇게 — 정배열 판단과 짝)
    if (on("ma")) {
      if (D.ma.mid) s += '<path class="dw-ma" d="' + polyArr(m, D.ma.mid) + '" fill="none" stroke="var(--bl)" stroke-width="0.8" opacity="0.45"/>';
      if (D.ma.long) s += '<path d="' + polyArr(m, D.ma.long) + '" fill="none" stroke="var(--bl)" stroke-width="0.8" opacity="0.3"/>';
    }
    return s;
  }

  // 오실레이터형 배지(PC hero 배지 규약) — 차트 하단 오버레이 칩
  const OSC = ["rsi", "macd", "stochastic", "cci", "williams", "roc", "ao", "atr", "aroon",
    "cycle", "phasefold", "mfi", "cmf", "volume", "pattern"];
  function badgeHtml(report, off) {
    if (!report || !report.indicators) return "";
    off = off || {};
    const chips = report.indicators.filter(function (ind) {
      return OSC.indexOf(ind.id) >= 0 && !off[ind.id];
    }).map(function (ind) {
      const c = ind.bias > 0.05 ? "var(--up)" : ind.bias < -0.05 ? "var(--dn)" : "var(--m1)";
      const a = ind.bias > 0.05 ? "▲" : ind.bias < -0.05 ? "▼" : "–";
      return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:9.5px;color:var(--t2);background:rgba(var(--ovr),0.82);border:1px solid var(--ln0);border-radius:99px;padding:2px 7px;white-space:nowrap"><span style="color:' + c + '">' + a + "</span>" + ind.name + "</span>";
    });
    if (!chips.length) return "";
    return '<div style="position:absolute;left:8px;right:46px;bottom:4px;display:flex;flex-wrap:wrap;gap:3px;pointer-events:none">' + chips.join("") + "</div>";
  }

  // 표준 레이어 조립. layers: { report, off, cone, coneBasic, pred, p2, p3, ma, boll, deep }
  function svg(m, layers) {
    layers = layers || {};
    let s = '<svg viewBox="' + m.view + '" width="100%" height="396" preserveAspectRatio="xMidYMid meet" style="display:block">';
    for (let g = 1; g <= 4; g++) {
      const y = 14 + (411 - 40) * g / 5;
      s += '<path d="M8 ' + F(y) + "H" + F(411 - 46) + '" stroke="var(--gr)" stroke-width="1"/>';
    }
    if (layers.deep && layers.report) s += overlays(m, layers.report, layers.off);
    if (m.cone && layers.cone) {
      const cf = layers.coneBasic ? "var(--m3)" : "var(--ac)";
      s += '<path class="ch-cone" d="' + m.cone + '" fill="' + cf + '" opacity="0.10" style="animation:msConePulse 2.6s ease-in-out infinite"/>';
      s += '<path class="ch-cin" d="' + m.cin + '" fill="' + cf + '" opacity="0.10"/>';
    }
    if (m.bu && layers.boll && !(layers.off && layers.off.bollinger)) {
      s += '<path class="ch-bu" d="' + m.bu + '" fill="none" stroke="var(--bl2)" stroke-width="1.1" opacity="0.75"/>';
      s += '<path class="ch-bd" d="' + m.bd + '" fill="none" stroke="var(--bl2)" stroke-width="1.1" opacity="0.75"/>';
    }
    if (m.ma && layers.ma && !(layers.off && layers.off.ma)) {
      s += '<path class="ch-ma" d="' + m.ma + '" fill="none" stroke="var(--bl)" stroke-width="1.4" opacity="0.9"/>';
    }
    s += '<path d="' + m.wick + '" stroke="var(--m3)" stroke-width="1"/>';
    s += '<path d="' + m.up + '" fill="var(--up)"/>';
    s += '<path d="' + m.down + '" fill="var(--dn)"/>';
    if (m.p2 && layers.p2) {   // 2차 반대 시나리오(청록·다른 위상 점멸 — 시안 범례)
      s += '<path class="ch-p2" d="' + m.p2 + '" fill="none" stroke="var(--cy)" stroke-width="1.5" stroke-dasharray="5 4" style="animation:msPredPulse 2.8s ease-in-out 0.6s infinite"/>';
    }
    if (m.p3 && layers.p3) {   // 3차 가중치·페르소나(골드 — 커스텀만)
      s += '<path class="ch-p3" d="' + m.p3 + '" fill="none" stroke="var(--cu)" stroke-width="1.7" stroke-dasharray="7 3" style="animation:msPredPulse 2.4s ease-in-out 1.1s infinite"/>';
    }
    if (m.p1a && layers.pred) {
      s += '<path d="' + m.p1a + '" fill="none" stroke="var(--ac)" stroke-width="6" stroke-linecap="round" opacity="0.14"/>';
      s += '<path class="ch-p1a" d="' + m.p1a + '" fill="none" stroke="var(--ac)" stroke-width="1.9" style="animation:msPredPulse 2.2s ease-in-out infinite"/>';
      s += '<path class="ch-p1b" d="' + m.p1b + '" fill="none" stroke="var(--ac)" stroke-width="1.9" stroke-dasharray="1.5 4.5"/>';
    }
    s += "</svg>";
    return s;
  }

  // 실행 연출용 단일 그룹 레이어(prog%6 순환 — 프로토 runDraw L2436)
  function runLayer(m, report, cyc) {
    const map = ["ma", "bollinger", "ichimoku", "trend", "pivot", "fib"];
    const id = map[cyc % 6];
    if (id === "ma") return m.ma ? '<path d="' + m.ma + '" fill="none" stroke="var(--bl)" stroke-width="1.6"/>' : "";
    if (id === "bollinger") return m.bu ? '<path d="' + m.bu + '" fill="none" stroke="var(--bl2)" stroke-width="1.3"/><path d="' + m.bd + '" fill="none" stroke="var(--bl2)" stroke-width="1.3"/>' : "";
    if (!report || !report.drawings || !report.drawings[id]) return "";
    const only = {};
    Object.keys(report.drawings).forEach(function (k) { if (k !== id) only[k] = 1; });
    return overlays(m, report, only);
  }

  return { build: build, svg: svg, overlays: overlays, badgeHtml: badgeHtml, runLayer: runLayer,
    OSC: OSC, W: W, H: H, NMAX: NMAX };
});
