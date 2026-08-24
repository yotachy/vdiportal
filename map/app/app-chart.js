/* 머니스쿱 앱 — 모바일 차트(프레젠테이션 층 — 엔진 출력만 소비, 계산 정본은 엔진).
   기하 상수는 시안 프로토 chart()(L2149~2187) 승계: 411×411 · 패딩 8/46/14/26 ·
   과거 58% · 캔들 최대 56봉 · 예측선 55% 실선/점선 분할.
   품질 하한(2026-08-24 사용자 확정): 작도는 PC 웹버전과 동일 의미 — 오버레이는 엔진 analyze*
   원자료(Report.drawings), 오실레이터는 실시리즈 서브패널. 위계: 신호 강한 지표는 진하게,
   약한 지표는 흐리게(다중스케일 작도 규율). 캔들·작도는 절대 프레임 밖으로 나가지 않는다
   (카메라는 CSS transform 이 아니라 viewBox 크롭 — 지침서 §4 준수).
   순수 함수(DOM 없음·node 테스트) + 화면 모듈이 svg() 문자열을 삽입한다. */
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
      closes: closes,
      wick: wick, up: up, down: down,
      cone: cone, cin: cin, p1a: p1a, p1b: p1b, p2: p2, p3: p3, targetY: targetY,
      ma: dN ? line(maPts) : null, bu: dN ? line(buPts) : null, bd: dN ? line(bdPts) : null };
  }

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

  // ── 심화 작도 오버레이 — 위계: emph[id] = 0..1 배율(신호 강한 지표 진하게) ──
  function overlays(m, report, off, emph) {
    if (!report || !report.drawings) return "";
    const D = report.drawings;
    off = off || {};
    emph = emph || {};
    let s = "";
    const fac = function (id) { return emph[id] != null ? emph[id] : 1; };
    const add = function (id, content) {
      if (!content) return;
      s += '<g class="dw-' + id + '" opacity="' + F(fac(id)) + '">' + content + "</g>";
    };
    const on = function (id) { return D[id] && !D[id].kind && !off[id] && fac(id) > 0.02; };

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
        add("ichimoku",
          '<path d="' + line(topP) + botP.reverse().map(function (q) { return "L" + F(q[0]) + " " + F(q[1]); }).join("") + 'Z" fill="var(--cy)" opacity="0.09"/>' +
          '<path d="' + line(topP) + '" fill="none" stroke="var(--cy)" stroke-width="0.9" opacity="0.5"/>');
      }
    }
    if (on("trend")) {
      const d = D.trend, ch = d.channel;
      if (ch) {
        const gi0 = m.startIdx, gi1 = m.lastGi + Math.round((m.futW || 0) * 0.4);
        const clampY = function (v) { return Math.max(m.priceLo, Math.min(m.priceHi, v)); };
        const ln2 = function (dy) {
          return '<path d="M' + F(m.mapX(gi0)) + " " + F(m.toY(clampY(ch.slopeRaw * gi0 + ch.bRaw + dy))) +
            "L" + F(m.mapX(gi1)) + " " + F(m.toY(clampY(ch.slopeRaw * gi1 + ch.bRaw + dy))) +
            '" fill="none" stroke="var(--bl)" stroke-width="1" opacity="0.65"/>';
        };
        add("trend", ln2(ch.sigma * ch.k) + ln2(-ch.sigma * ch.k));
      }
    }
    if (on("cycle") && D.cycle.fit) {   // 사이클 적합 곡선(가격 공간 — 엔진 fit)
      add("cycle", '<path d="' + polyArr(m, D.cycle.fit) + '" fill="none" stroke="var(--lv)" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>');
    }
    if (on("keltner")) {
      add("keltner", '<path d="' + polyArr(m, D.keltner.upper) + '" fill="none" stroke="var(--lv)" stroke-width="0.9" stroke-dasharray="3 3" opacity="0.6"/>' +
        '<path d="' + polyArr(m, D.keltner.lower) + '" fill="none" stroke="var(--lv)" stroke-width="0.9" stroke-dasharray="3 3" opacity="0.6"/>');
    }
    if (on("donchian")) {
      add("donchian", '<path d="' + polyArr(m, D.donchian.upper) + '" fill="none" stroke="var(--am)" stroke-width="0.9" opacity="0.5"/>' +
        '<path d="' + polyArr(m, D.donchian.lower) + '" fill="none" stroke="var(--am)" stroke-width="0.9" opacity="0.5"/>');
    }
    if (on("vwap")) {
      add("vwap", '<path d="' + polyArr(m, D.vwap.vwap) + '" fill="none" stroke="var(--pk)" stroke-width="1.1" opacity="0.75"/>' +
        '<path d="' + polyArr(m, D.vwap.upper) + '" fill="none" stroke="var(--pk)" stroke-width="0.7" opacity="0.3"/>' +
        '<path d="' + polyArr(m, D.vwap.lower) + '" fill="none" stroke="var(--pk)" stroke-width="0.7" opacity="0.3"/>');
    }
    if (on("supertrend")) {
      const d = D.supertrend;
      let out = "", seg = [], curDir = 0;
      const flush = function () {
        if (seg.length > 1) out += '<path d="' + line(seg) + '" fill="none" stroke="' + (curDir >= 0 ? "var(--up)" : "var(--dn)") + '" stroke-width="1.3" opacity="0.8"/>';
        seg = [];
      };
      for (let gi = m.startIdx; gi <= m.lastGi; gi++) {
        const v = d.line[gi], t = d.trend[gi];
        if (v == null || !isFinite(v) || v < m.priceLo || v > m.priceHi) { flush(); continue; }
        if (seg.length && t !== curDir) flush();
        curDir = t;
        seg.push([m.mapX(gi), m.toY(v)]);
      }
      flush();
      add("supertrend", out);
    }
    if (on("psar")) {
      let dots = "";
      for (let gi = m.startIdx; gi <= m.lastGi; gi++) {
        const v = D.psar.series[gi];
        if (v == null || !isFinite(v) || v < m.priceLo || v > m.priceHi) continue;
        dots += '<circle cx="' + F(m.mapX(gi)) + '" cy="' + F(m.toY(v)) + '" r="1.2"/>';
      }
      add("psar", '<g fill="var(--lv)" opacity="0.8">' + dots + "</g>");
    }
    if (on("fib")) {
      const major = { 0: 1, 0.382: 1, 0.5: 1, 0.618: 1, 1: 1 };
      let out = "";
      (D.fib.levels || []).forEach(function (L2) {
        if (!(L2.ratio in major)) return;
        if (L2.price < m.priceLo || L2.price > m.priceHi) return;
        out += '<path d="' + hline(m, L2.price) + '" stroke="var(--ac)" stroke-width="0.8" stroke-dasharray="4 4" opacity="' + (L2.golden ? 0.75 : 0.45) + '"/>' +
          '<text x="' + F(m.xe + 2) + '" y="' + F(m.toY(L2.price) + 3) + '" font-size="8" fill="var(--ac)" opacity="0.8">' + L2.ratio + "</text>";
      });
      add("fib", out);
    }
    if (on("pivot")) {
      const d = D.pivot;
      let out = "";
      const lv = function (p2, dash) {
        if (p2 == null || !isFinite(p2) || p2 < m.priceLo || p2 > m.priceHi) return;
        out += '<path d="' + hline(m, p2) + '" stroke="var(--am)" stroke-width="0.9"' + (dash ? ' stroke-dasharray="5 4"' : "") + ' opacity="0.6"/>';
      };
      lv(d.P, false);
      (d.R || []).forEach(function (v) { lv(v, true); });
      (d.S || []).forEach(function (v) { lv(v, true); });
      add("pivot", out);
    }
    if (on("gann")) {
      // 1×1 강조 + 인접 2선만(전면 부채꼴은 시야를 어지럽힘 — 위계)
      const d = D.gann;
      if (d.anchor && isFinite(d.anchor.price)) {
        const keep = { "1x1": 1, "1x2": 1, "2x1": 1 };
        let out = "";
        (d.angles || []).forEach(function (a) {
          if (!(a.name in keep)) return;
          const giS = Math.max(m.startIdx, d.anchor.idx);
          const gi1 = m.lastGi + Math.round((m.futW || 0) * 0.5);
          const yS = d.anchor.price + a.slope * (giS - d.anchor.idx);
          const y1 = d.anchor.price + a.slope * (gi1 - d.anchor.idx);
          if ((yS < m.priceLo && y1 < m.priceLo) || (yS > m.priceHi && y1 > m.priceHi)) return;
          out += '<path d="M' + F(m.mapX(giS)) + " " + F(m.toY(Math.max(m.priceLo, Math.min(m.priceHi, yS)))) +
            "L" + F(m.mapX(gi1)) + " " + F(m.toY(Math.max(m.priceLo, Math.min(m.priceHi, y1)))) +
            '" stroke="var(--lv)" stroke-width="' + (a.name === "1x1" ? 1 : 0.6) + '" stroke-dasharray="2 3" opacity="' + (a.name === "1x1" ? 0.6 : 0.35) + '"/>';
        });
        add("gann", out);
      }
    }
    if (on("structure")) {
      const sw = (D.structure.swings || []).filter(function (p2) { return p2.idx >= m.startIdx; });
      if (sw.length > 1) {
        let out = '<path d="' + line(sw.map(function (p2) { return [m.mapX(p2.idx), m.toY(p2.price)]; })) + '" fill="none" stroke="var(--pk)" stroke-width="1" opacity="0.55"/>';
        sw.slice(-4).forEach(function (p2) {
          out += '<text x="' + F(m.mapX(p2.idx)) + '" y="' + F(m.toY(p2.price) + (p2.type === "H" ? -4 : 9)) + '" font-size="8" text-anchor="middle" fill="var(--pk)" opacity="0.8">' + p2.type + "</text>";
        });
        add("structure", out);
      }
    }
    if (on("smc")) {
      let out = "";
      const zone = function (z) {
        if (z.idx < m.startIdx - 40) return;
        const x0 = m.mapX(Math.max(m.startIdx, z.idx));
        const yT = m.toY(Math.min(m.priceHi, z.hi)), yB = m.toY(Math.max(m.priceLo, z.lo));
        const col = z.type === "bull" ? "var(--up)" : "var(--dn)";
        out += '<rect x="' + F(x0) + '" y="' + F(yT) + '" width="' + F(m.xe - x0) + '" height="' + F(Math.max(1, yB - yT)) + '" fill="' + col + '" opacity="0.08" stroke="' + col + '" stroke-width="0.5" stroke-opacity="0.3"/>';
      };
      (D.smc.fvgs || []).slice(-3).forEach(zone);
      (D.smc.obs || []).slice(-2).forEach(zone);
      add("smc", out);
    }
    if (on("volumeprofile")) {
      const d = D.volumeprofile;
      let bars = "";
      (d.bins || []).forEach(function (b) {
        if (!d.maxVol || b.mid < m.priceLo || b.mid > m.priceHi) return;
        const w2 = Math.max(1, b.vol / d.maxVol * 52);
        bars += '<rect x="' + F(m.xe - w2) + '" y="' + F(m.toY(b.hi)) + '" width="' + F(w2) + '" height="' + F(Math.max(1, m.toY(b.lo) - m.toY(b.hi) - 0.6)) + '"/>';
      });
      add("volumeprofile", '<g fill="var(--cy)" opacity="0.16">' + bars + "</g>");
    }
    if (on("elliott")) {
      const wv = (D.elliott.waves || []).filter(function (p2) { return p2.idx >= m.startIdx; });
      if (wv.length > 1) {
        let out = '<path d="' + line(wv.map(function (p2) { return [m.mapX(p2.idx), m.toY(p2.price)]; })) + '" fill="none" stroke="var(--lv)" stroke-width="1" opacity="0.6"/>';
        wv.forEach(function (p2) {
          out += '<circle cx="' + F(m.mapX(p2.idx)) + '" cy="' + F(m.toY(p2.price)) + '" r="1.6" fill="var(--lv)"/>' +
            '<text x="' + F(m.mapX(p2.idx) + 3) + '" y="' + F(m.toY(p2.price) - 3) + '" font-size="8.5" fill="var(--lv)">' + (p2.label || "") + "</text>";
        });
        add("elliott", out);
      }
    }
    if (on("ma")) {
      let out = "";
      if (D.ma.mid) out += '<path d="' + polyArr(m, D.ma.mid) + '" fill="none" stroke="var(--bl)" stroke-width="0.8" opacity="0.45"/>';
      if (D.ma.long) out += '<path d="' + polyArr(m, D.ma.long) + '" fill="none" stroke="var(--bl)" stroke-width="0.8" opacity="0.3"/>';
      add("ma", out);
    }
    return s;
  }

  // ── 오실레이터 서브패널(하단 밴드 — 지표의 실제 분석 곡선) ──
  function subpanel(m, dr, name, color) {
    if (!dr || !Array.isArray(dr.series)) return "";
    const bandH = 92, y0 = H - PB - bandH, x0 = PL, x1 = m.xa;
    const from = m.startIdx, to = Math.min(m.lastGi, m.startIdx + m.dN - 1);
    let lo2 = Infinity, hi2 = -Infinity;
    for (let gi = from; gi <= to; gi++) {
      const v = dr.series[gi];
      if (v != null && isFinite(v)) { if (v < lo2) lo2 = v; if (v > hi2) hi2 = v; }
    }
    if (dr.lo != null) lo2 = Math.min(lo2, dr.lo);
    if (dr.hi != null) hi2 = Math.max(hi2, dr.hi);
    if (dr.mid != null) { lo2 = Math.min(lo2, dr.mid); hi2 = Math.max(hi2, dr.mid); }
    if (!isFinite(lo2) || !isFinite(hi2) || hi2 <= lo2) return "";
    const pad = (hi2 - lo2) * 0.12;
    lo2 -= pad; hi2 += pad;
    const sy = function (v) { return y0 + 8 + (hi2 - v) / (hi2 - lo2) * (bandH - 16); };
    const sx = function (gi) { return x0 + (gi - from) / Math.max(1, to - from) * (x1 - x0); };

    let s = '<rect x="' + F(x0) + '" y="' + F(y0) + '" width="' + F(m.xe - x0) + '" height="' + F(bandH) + '" rx="6" fill="var(--sf1)" opacity="0.94" stroke="var(--ln1)" stroke-width="0.7"/>';
    const ref = function (v, dash, op) {
      if (v == null || !isFinite(v)) return;
      s += '<path d="M' + F(x0 + 4) + " " + F(sy(v)) + "H" + F(x1) + '" stroke="var(--m3)" stroke-width="0.6"' + (dash ? ' stroke-dasharray="3 3"' : "") + ' opacity="' + (op || 0.5) + '"/>';
    };
    ref(dr.mid, false, 0.6);
    ref(dr.lo, true); ref(dr.hi, true);
    if (dr.bars) {
      const midY = sy(dr.mid != null ? dr.mid : lo2);
      let bars = "";
      for (let gi = from; gi <= to; gi++) {
        const v = dr.series[gi];
        if (v == null || !isFinite(v)) continue;
        const yv = sy(v);
        const upBar = dr.vol ? true : v >= (dr.mid || 0);
        bars += '<rect x="' + F(sx(gi) - 1.4) + '" y="' + F(Math.min(yv, midY)) + '" width="2.8" height="' + F(Math.max(0.8, Math.abs(midY - yv))) + '" fill="' + (upBar ? "var(--up)" : "var(--dn)") + '" opacity="0.7"/>';
      }
      s += bars;
    } else {
      let p = "", pen = false;
      for (let gi = from; gi <= to; gi++) {
        const v = dr.series[gi];
        if (v == null || !isFinite(v)) { pen = false; continue; }
        p += (pen ? "L" : "M") + F(sx(gi)) + " " + F(sy(v));
        pen = true;
      }
      s += '<path d="' + p + '" fill="none" stroke="' + (color || "var(--ac)") + '" stroke-width="1.4"/>';
      const p2 = dr.series2 ? (function () {
        let q = "", pen2 = false;
        for (let gi = from; gi <= to; gi++) {
          const v = dr.series2[gi];
          if (v == null || !isFinite(v)) { pen2 = false; continue; }
          q += (pen2 ? "L" : "M") + F(sx(gi)) + " " + F(sy(v));
          pen2 = true;
        }
        return q;
      })() : null;
      if (p2) s += '<path d="' + p2 + '" fill="none" stroke="var(--am)" stroke-width="1" opacity="0.8"/>';
      if (dr.series3) {
        let q = "", pen3 = false;
        for (let gi = from; gi <= to; gi++) {
          const v = dr.series3[gi];
          if (v == null || !isFinite(v)) { pen3 = false; continue; }
          q += (pen3 ? "L" : "M") + F(sx(gi)) + " " + F(sy(v));
          pen3 = true;
        }
        s += '<path d="' + q + '" fill="none" stroke="var(--dn)" stroke-width="1" opacity="0.7"/>';
      }
    }
    s += '<text x="' + F(x0 + 8) + '" y="' + F(y0 + 15) + '" font-size="9.5" fill="var(--t2)" font-weight="600">' + name + "</text>";
    return '<g class="ch-sub">' + s + "</g>";
  }

  // 신호 강도 위계 → 지표별 불투명도 배율(상위는 선명, 하위는 물러남)
  function emphasisMap(report) {
    const out = {};
    if (!report || !report.indicators) return out;
    const sorted = report.indicators.slice().sort(function (a, b) { return b.strength - a.strength; });
    sorted.forEach(function (ind, i) {
      out[ind.id] = i < 6 ? 1 : i < 14 ? 0.55 : 0.28;
    });
    return out;
  }

  // 카메라(viewBox 크롭 — 프레임 밖 이탈 없음): mode 0 전체 / 1 최근 60% / 2 최근 30%
  function cameraView(m, mode) {
    if (!mode) return m.view;
    const frac = mode === 1 ? 0.4 : 0.7;     // 잘라내는 왼쪽 비율
    const iFrom = Math.floor(m.dN * frac);
    let lo2 = Infinity, hi2 = -Infinity;
    for (let i = iFrom; i < m.dN; i++) {
      const v = m.closes[i];
      if (v < lo2) lo2 = v;
      if (v > hi2) hi2 = v;
    }
    if (!isFinite(lo2) || hi2 <= lo2) return m.view;
    const pad = (hi2 - lo2) * 0.25 + (m.priceHi - m.priceLo) * 0.02;
    const yTop = Math.max(0, m.toY(hi2 + pad));
    const yBot = Math.min(H, m.toY(lo2 - pad));
    const x0 = Math.max(0, m.toX(iFrom) - 6);
    const w2 = W - x0;
    let h2 = Math.max(120, yBot - yTop);
    // 가로세로 균형(너무 납작하면 위아래 확장)
    if (h2 < w2 * 0.5) h2 = w2 * 0.5;
    let y0 = yTop - (h2 - (yBot - yTop)) / 2;
    y0 = Math.max(0, Math.min(H - h2, y0));
    return F(x0) + " " + F(y0) + " " + F(w2) + " " + F(h2);
  }

  // 실행 연출: 현재 계산 중 지표의 '실제 작도'만 — 오버레이형은 해당 레이어, 오실레이터형은 서브패널
  function focusLayer(m, report, id, color) {
    if (!report || !report.drawings) return null;
    const D = report.drawings;
    const dr = D[id];
    if (!dr) return null;
    if (dr.kind === "osc") {
      const meta = (report.indicators || []).filter(function (x) { return x.id === id; })[0];
      return subpanel(m, dr, meta ? meta.name : id, color);
    }
    if (id === "bollinger") {
      return m.bu ? '<path d="' + m.bu + '" fill="none" stroke="var(--bl2)" stroke-width="1.4"/><path d="' + m.bd + '" fill="none" stroke="var(--bl2)" stroke-width="1.4"/>' : null;
    }
    const only = {};
    Object.keys(D).forEach(function (k) { if (k !== id) only[k] = 1; });
    const s = overlays(m, report, only, {});
    if (id === "ma" && m.ma) return '<path d="' + m.ma + '" fill="none" stroke="var(--bl)" stroke-width="1.6"/>' + s;
    return s || null;
  }

  const OSC = ["rsi", "macd", "stochastic", "cci", "williams", "roc", "ao", "atr", "aroon",
    "cycle", "phasefold", "mfi", "cmf", "volume", "pattern"];
  // 오실레이터 배지 칩(차트 아래 흐름 배치용 — 차트 위 오버레이 금지)
  function badgeHtml(report, off) {
    if (!report || !report.indicators) return "";
    off = off || {};
    const chips = report.indicators.filter(function (ind) {
      return OSC.indexOf(ind.id) >= 0 && !off[ind.id] && !(report.drawings && report.drawings[ind.id] && report.drawings[ind.id].fit);
    }).map(function (ind) {
      const c = ind.bias > 0.05 ? "var(--up)" : ind.bias < -0.05 ? "var(--dn)" : "var(--m1)";
      const a = ind.bias > 0.05 ? "▲" : ind.bias < -0.05 ? "▼" : "–";
      return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:9.5px;color:var(--t2);background:var(--sf1);border:1px solid var(--ln0);border-radius:99px;padding:2.5px 8px;white-space:nowrap"><span style="color:' + c + '">' + a + "</span>" + ind.name + "</span>";
    });
    if (!chips.length) return "";
    return '<div style="display:flex;flex-wrap:wrap;gap:3px;padding:6px 8px 0">' + chips.join("") + "</div>";
  }

  // 표준 레이어 조립. layers: { report, off, cone, coneBasic, pred, p2, p3, ma, boll, deep, viewBox, sub }
  function svg(m, layers) {
    layers = layers || {};
    const vb = layers.viewBox || m.view;
    let s = '<svg viewBox="' + vb + '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block">';
    for (let g = 1; g <= 4; g++) {
      const y = 14 + (411 - 40) * g / 5;
      s += '<path d="M8 ' + F(y) + "H" + F(411 - 46) + '" stroke="var(--gr)" stroke-width="1"/>';
    }
    if (layers.deep && layers.report) {
      s += overlays(m, layers.report, layers.off, layers.emph || emphasisMap(layers.report));
    }
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
    if (layers.sub) s += layers.sub;   // 서브패널(실행 연출·오실레이터)
    if (m.p2 && layers.p2) {
      s += '<path class="ch-p2" d="' + m.p2 + '" fill="none" stroke="var(--cy)" stroke-width="1.5" stroke-dasharray="5 4" style="animation:msPredPulse 2.8s ease-in-out 0.6s infinite"/>';
    }
    if (m.p3 && layers.p3) {
      s += '<path class="ch-p3" d="' + m.p3 + '" fill="none" stroke="var(--cu)" stroke-width="1.7" stroke-dasharray="7 3" style="animation:msPredPulse 2.4s ease-in-out 1.1s infinite"/>';
    }
    if (m.p1a && layers.pred) {
      s += '<path d="' + m.p1a + '" fill="none" stroke="var(--ac)" stroke-width="6" stroke-linecap="round" opacity="0.14"/>';
      s += '<path class="ch-p1a" d="' + m.p1a + '" fill="none" stroke="var(--ac)" stroke-width="1.9" style="animation:msPredPulse 2.2s ease-in-out infinite"/>';
      s += '<path class="ch-p1b" d="' + m.p1b + '" fill="none" stroke="var(--ac)" stroke-width="1.9" stroke-dasharray="1.5 4.5"/>';
    }
    if (layers.focus) s += '<g style="animation:msDrawCycle 1.4s ease both">' + layers.focus + "</g>";
    s += "</svg>";
    return s;
  }

  return { build: build, svg: svg, overlays: overlays, subpanel: subpanel, badgeHtml: badgeHtml,
    focusLayer: focusLayer, cameraView: cameraView, emphasisMap: emphasisMap,
    OSC: OSC, W: W, H: H, NMAX: NMAX };
});
