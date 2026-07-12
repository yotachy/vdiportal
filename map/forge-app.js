  /* ── 시각화 인라인 SVG 헬퍼(순수·테마 토큰색) ── */
  function _donutSVG(segs, opts) {
    opts = opts || {}; const size = opts.size || 46, th = opts.thickness || 7, r = (size - th) / 2, cx = size / 2, C = 2 * Math.PI * r;
    const tot = segs.reduce((s, x) => s + Math.max(0, x.v), 0) || 1; let off = 0, arcs = "";
    segs.forEach(s => { const len = Math.max(0, s.v) / tot * C;
      arcs += `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${th}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cx})"/>`; off += len; });
    const ct = opts.centerText ? `<text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="${opts.centerSize || 11}" font-weight="800" fill="${opts.centerColor || 'currentColor'}">${opts.centerText}</text>` : "";
    return `<svg class="viz-donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${th}"/>${arcs}${ct}</svg>`;
  }
  function _gaugeSVG(val, min, max, opts) {
    opts = opts || {}; const w = opts.w || 66, h = opts.h || 38, r = opts.r || 26, cx = w / 2, cy = h - 5, th = opts.thickness || 6;
    const ang = f => Math.PI * (1 - Math.max(0, Math.min(1, f))), pt = f => [cx + r * Math.cos(ang(f)), cy - r * Math.sin(ang(f))];
    const arc = (f0, f1, col, wd) => { const a = pt(f0), b = pt(f1), lg = (f1 - f0) > 0.5 ? 1 : 0; return `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)} A${r} ${r} 0 ${lg} 1 ${b[0].toFixed(1)} ${b[1].toFixed(1)}" fill="none" stroke="${col}" stroke-width="${wd || th}" stroke-linecap="round"/>`; };
    const norm = v => (Math.max(min, Math.min(max, v)) - min) / ((max - min) || 1);
    let zoneArcs = ""; (opts.zones || []).forEach(z => { zoneArcs += arc(norm(z.from), norm(z.to), z.color, th); });
    const track = (opts.zones && opts.zones.length) ? "" : arc(0, 1, "var(--line)", th);
    const vf = norm(val), valArc = (opts.zones && opts.zones.length) ? "" : arc(0, vf, opts.color || "var(--gold)", th);
    const n = pt(vf); const needle = `<line x1="${cx}" y1="${cy}" x2="${n[0].toFixed(1)}" y2="${n[1].toFixed(1)}" stroke="${opts.color || 'currentColor'}" stroke-width="2" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="2.5" fill="${opts.color || 'currentColor'}"/>`;
    return `<svg class="viz-gauge" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${track}${zoneArcs}${valArc}${needle}</svg>`;
  }
  function _ringSVG(pct, color, size) {
    size = size || 30; const th = 4, r = (size - th) / 2, cx = size / 2, C = 2 * Math.PI * r, len = Math.max(0, Math.min(100, pct)) / 100 * C;
    return `<svg class="viz-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${th}"/><circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="${th}" stroke-linecap="round" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"/><text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="700" fill="currentColor">${Math.round(pct)}</text></svg>`;
  }
  // 계기판 대체 가로 바(재사용) — 진행바(퍼센트) / 발산바(−100~+100 중앙기준)
  function _hbarPct(pct, col) { return `<span class="hbar"><i class="hbar-f" style="width:${Math.max(0, Math.min(100, pct))}%;background:${col}"></i></span>`; }
  function _hbarDiv(val, col) { const v = Math.max(-100, Math.min(100, val)), h = Math.abs(v) / 100 * 50, l = v >= 0 ? 50 : 50 - h; return `<span class="hbar hbar-d"><i class="hbar-mid"></i><i class="hbar-df" style="left:${l.toFixed(1)}%;width:${h.toFixed(1)}%;background:${col}"></i></span>`; }
  // 0~100 오실레이터 바(RSI·MFI 등) — 과매도(하단 녹색)·과열(상단 적색) 존 + 현재값 마커. 반원 게이지 대체
  function _hbarRsi(val, lo, hi) { const v = Math.max(0, Math.min(100, val)); return `<span class="hbar hbar-osc"><i class="osc-lo" style="width:${lo}%"></i><i class="osc-hi" style="left:${hi}%;width:${100 - hi}%"></i><i class="osc-mk" style="left:${v.toFixed(1)}%"></i></span>`; }
  function _sparkSVG(vals, opts) {
    opts = opts || {}; const w = opts.w || 120, h = opts.h || 24, pad = 2; if (!vals || vals.length < 2) return "";
    const mn = Math.min.apply(0, vals), mx = Math.max.apply(0, vals), sp = (mx - mn) || 1;
    const x = i => pad + i / (vals.length - 1) * (w - 2 * pad), y = v => h - pad - (v - mn) / sp * (h - 2 * pad);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "), col = opts.color || "var(--gold)";
    const area = opts.fill ? `<polygon points="${pad},${h} ${pts} ${(w - pad)},${h}" fill="${col}" opacity="0.12"/>` : "";
    const zero = (mn < 0 && mx > 0) ? `<line x1="${pad}" y1="${y(0).toFixed(1)}" x2="${w - pad}" y2="${y(0).toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 2"/>` : "";
    return `<svg class="viz-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${zero}${area}<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  /* 미니 예측 차트 — 지금(0%)부터 전체 경로 + 예측 밴드(lo~hi 콘). anchor=현재가, path/lo/hi=예측가 배열 */
  function _projSVG(anchor, path, lo, hi, opts) {
    opts = opts || {}; const w = opts.w || 150, h = opts.h || 42, pad = 3;
    if (!path || !path.length || !anchor) return "";
    const pct = v => (v - anchor) / anchor * 100;
    const ys = [0].concat(path.map(pct));
    const loA = (lo && lo.length === path.length) ? [0].concat(lo.map(v => isFinite(v) ? pct(v) : 0)) : null;
    const hiA = (hi && hi.length === path.length) ? [0].concat(hi.map(v => isFinite(v) ? pct(v) : 0)) : null;
    let mn = Math.min.apply(0, ys), mx = Math.max.apply(0, ys);
    if (loA && hiA) { mn = Math.min(mn, Math.min.apply(0, loA)); mx = Math.max(mx, Math.max.apply(0, hiA)); }
    const sp = (mx - mn) || 1, n = ys.length;
    const x = i => pad + i / (n - 1) * (w - 2 * pad), y = v => h - pad - (v - mn) / sp * (h - 2 * pad);
    const up = ys[n - 1] >= 0, col = up ? "var(--bull)" : "var(--bear)";
    let band = "";
    if (loA && hiA) {
      const top = hiA.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      const bot = loA.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse().join(" ");
      band = `<polygon points="${top} ${bot}" fill="${col}" opacity="0.13"/>`;
    }
    const line = ys.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const zero = (mn < 0 && mx > 0) ? `<line x1="${pad}" y1="${y(0).toFixed(1)}" x2="${w - pad}" y2="${y(0).toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 2"/>` : "";
    const nowDot = `<circle cx="${x(0).toFixed(1)}" cy="${y(0).toFixed(1)}" r="2.2" fill="var(--eth)"/>`;
    const endDot = `<circle cx="${x(n - 1).toFixed(1)}" cy="${y(ys[n - 1]).toFixed(1)}" r="2.6" fill="${col}"/>`;
    return `<svg class="viz-proj" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${zero}${band}<polyline points="${line}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round"/>${nowDot}${endDot}</svg>`;
  }
  /* 오프스크린 서브패널 캔버스 지연 렌더 — 보일 때(또는 시뮬 중) 그림. Observer 미지원/실패 시 즉시(폴백) */
  let _lazyIO = null; const _lazyPending = new Map();   // canvasEl → drawThunk
  function _lazyDraw(cvId, thunk) {
    if (_playing || typeof IntersectionObserver !== "function") { thunk(); return; }   // 시뮬 중·미지원: 즉시
    const cv = document.getElementById(cvId);
    if (!cv) { thunk(); return; }
    const rect = cv.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { thunk(); return; }   // 레이아웃 전(0크기): 즉시
    const vis = rect.bottom > 0 && rect.top < (window.innerHeight || 9999);
    if (vis) { thunk(); return; }                    // 보이면 즉시
    _lazyPending.set(cv, thunk);                      // 안 보이면 진입 시 최초 1회
    if (!_lazyIO) _lazyIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { const t = _lazyPending.get(e.target); if (t) { t(); _lazyPending.delete(e.target); } _lazyIO.unobserve(e.target); } });
    }, { rootMargin: "150px" });
    _lazyIO.observe(cv);
  }
  function renderChart(result, data) {
    if (!result || !data) return;
    resetHeroView();
    if (typeof renderTfSeg === "function") renderTfSeg();   // 일/주/월 세그먼트 노출·현재 주기 동기화
    _fcLastResult = result; _fcLastData = data;
    if (!_playing) _evidenceSet = new Set(evIndicatorNodes().map(n => n.id));   // 평상시: 모든 지표 근거 표시

    const candles  = data.candle  || [];
    /* candle close for fold */
    const closeArr  = candles.length ? candles.map(cd => cd.c) : (data.price || []);
    /* 위상 폴딩 대상: 가격(close) + 추세제거·정규화(PDM이 실제 접는 신호) — chart.html 레거시 주황/파랑(data.orange/blue) 제거 */
    const dnArr     = (closeArr.length >= 4 && ForgeCore.detrendNorm) ? ForgeCore.detrendNorm(closeArr) : [];

    /* phasefold meta: first block with best period */
    const metaVals = Object.values(result.meta || {});
    const fmeta    = metaVals.find(m => m && m.best != null) || null;
    const bestP    = fmeta ? fmeta.best : 64;
    const pdmCurve = fmeta ? fmeta.curve : [];

    const pred = result.prediction || { path: [], lo: [], hi: [], futW: 0 };

    /* update meta chip */
    const fcMetaEl = document.getElementById("fcMeta");
    if (fcMetaEl) {
      const thetaTxt = fmeta && Number.isFinite(fmeta.theta) ? fmeta.theta.toFixed(3) : "—";
      const cyc = fmeta && fmeta.kbest ? " · " + fmeta.kbest + "주기/창" : "";
      const meth = fmeta && fmeta.method ? " · " + fmeta.method + (Number.isFinite(fmeta.strength) ? "(피크 " + fmeta.strength.toFixed(1) + "x)" : "") : "";
      // 헤더엔 핵심만(주기 ≈N봉), 상세(주기/창·θ·방법)는 툴팁으로 — 헤더 밀집/잘림 방지
      fcMetaEl.textContent = fmeta ? ("주기 ≈" + Math.round(bestP) + "봉") : "";
      fcMetaEl.title = fmeta ? ("파동 스캔 지배주기 P*≈" + bestP.toFixed(1) + cyc + " · θ=" + thetaTxt + meth) : "파동 스캔 지표 없음";
    }

    /* draw all panels — overlay=원본 이미지+예측 오버레이, chart=연속 선차트, image=분석 대기 */
    const mode = heroMode();
    updateViewToggle();
    fcHeroMode(mode === "chart" ? "chart" : "image");
    if (mode !== "chart") renderHero();
    fcRenderForecast(result.prediction || { path: [], lo: [], hi: [] });
    fcDrawPdm(pdmCurve, bestP);
    if (!fmeta) {
      ["fcFoldA", "fcFoldB"].forEach(id => {
        const cv = document.getElementById(id);
        if (!cv) return;
        const ch = 100, c = fcFit(cv, ch);
        const cw = cv.clientWidth || 180;
        c.clearRect(0, 0, cw, ch);
        c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace";
        c.textAlign = "center";
        c.fillText("파동 스캔 지표를 추가하세요", cw / 2, ch / 2);
        c.textAlign = "left";
      });
    } else {
      fcDrawFold(document.getElementById("fcFoldA"), closeArr, "가격(close)", FC_GOLD, bestP, 0);
      fcDrawFold(document.getElementById("fcFoldB"), dnArr,    "추세제거·정규화", FC_ORA, bestP, 0);
    }
    renderNodeAnalysis(result);
    renderHorizons(result);
    renderNarrative(result);
    togglePhasefoldPanels();
    toggleRsiPanel();
    { const _rn = boardState.nodes.find(n => n.blockType === "rsi"); if (_rn) _lazyDraw("fcRsi", () => fcDrawRsi(ForgeCore.analyzeRSI((data && data.price) || [], { period: (_rn.params && _rn.params.period) || 14 }))); }
    toggleVolPanel();
    const _vn = boardState.nodes.find(n => n.kind === "block" && n.blockType === "volume");
    if (_vn) { const vser = (Array.isArray(_vn.series) && _vn.series.length >= 2) ? _vn.series : ForgeCore.synthVolume((data && data.price) || []); _lazyDraw("fcVol", () => fcDrawVol(ForgeCore.analyzeVolume((data && data.price) || [], vser))); }
    toggleMacdPanel();
    { const _mn = boardState.nodes.find(n => n.blockType === "macd"); if (_mn) _lazyDraw("fcMacd", () => fcDrawMacd(ForgeCore.analyzeMACD((data && data.price) || [], { fast: (_mn.params && _mn.params.fast) || 12, slow: (_mn.params && _mn.params.slow) || 26, signal: (_mn.params && _mn.params.signal) || 9 }))); }
    toggleAdxPanel();
    { const _an = boardState.nodes.find(n => n.blockType === "adx"); if (_an) _lazyDraw("fcAdx", () => fcDrawAdx(ForgeCore.analyzeADX((data && data.price) || [], { period: (_an.params && _an.params.period) || 14 }))); }
    toggleCciPanel();
    { const _cn = boardState.nodes.find(n => n.blockType === "cci"); if (_cn) _lazyDraw("fcCci", () => fcDrawCci(ForgeCore.analyzeCCI((data && data.price) || [], { period: (_cn.params && _cn.params.period) || 20 }))); }
    toggleWilliamsPanel();
    { const _wn = boardState.nodes.find(n => n.blockType === "williams"); if (_wn) _lazyDraw("fcWilliams", () => fcDrawWilliams(ForgeCore.analyzeWilliams(data || { price: [] }, { period: (_wn.params && _wn.params.period) || 14 }))); }
    toggleMfiPanel();
    { const _fn = boardState.nodes.find(n => n.blockType === "mfi"); if (_fn) { const mvol = (_vn && Array.isArray(_vn.series) && _vn.series.length >= 2) ? _vn.series : ForgeCore.synthVolume((data && data.price) || []); _lazyDraw("fcMfi", () => fcDrawMfi(ForgeCore.analyzeMFI({ candle: (data && data.candle) || [], price: (data && data.price) || [], volume: mvol }, { period: (_fn.params && _fn.params.period) || 14 }))); } }
  }
  /* ── 예측 시점별 표(3·6·12·24 등) ── */
  function _hzFmt(v) { return (Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()); }
  function _normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
  /* 현재가 대비 상승확률(%) — 로그정규: m=log(예측/현재), sd=log(상단/예측) */
  function _upProb(pred, hi, anchor) {
    if (!(pred > 0 && hi > 0 && anchor > 0)) return 50;
    const m = Math.log(pred / anchor), sd = Math.log(hi / pred);
    return Math.round(_normCdf(m / (sd || 1e-6)) * 100);
  }
  function _hzList(unit, fb) {
    let hs = unit === "개월" ? [3, 6, 12, 24]
      : unit === "주" ? [13, 26, 39, 52]
      : unit === "일" ? [10, 20, 40, 60]
      : [Math.ceil(fb / 4), Math.ceil(fb / 2), Math.ceil(fb * 3 / 4), fb];
    return hs.filter(h => h >= 1 && h <= fb).filter((h, i, a) => a.indexOf(h) === i);
  }
  function renderHorizons(result, fillU) {
    const host = document.getElementById("fcHorizons"); if (!host) return;
    const metaEl = document.getElementById("fcHzMeta");
    const p = result && result.prediction;
    const path = p && p.path;
    if (!path || !path.length) {
      if (metaEl) metaEl.textContent = "";
      host.innerHTML = `<div class="na-empty">분석 후 시점별 예측가가 표시됩니다</div>`; return;
    }
    const anchor = (p.anchor != null && isFinite(p.anchor)) ? p.anchor : path[0];
    const u = (fillU == null || !isFinite(fillU)) ? 1 : Math.max(0, Math.min(1, fillU));   // 게이지 충전 비율(시연)
    const unit = tfUnit();
    const fb = path.length;
    if (metaEl) metaEl.textContent = "현재가 " + _hzFmt(anchor);
    const hs = _hzList(unit, fb);
    const head = `<div class="hz-item hz-hd"><span>시점</span><span>예측 변화</span><span>예상 범위 <i class="hz-nowk"></i>현재 <i class="hz-predk"></i>예측</span><span>달성확률</span></div>`;
    const rows = hs.map(h => {
      const vF = path[h - 1], loF = (p.lo && p.lo[h - 1]), hiF = (p.hi && p.hi[h - 1]);
      const v = anchor + (vF - anchor) * u;                                   // 예측가: 현재가→최종 단조 상승(왔다갔다 없음)
      const lo = isFinite(loF) ? anchor + (loF - anchor) * u : loF;
      const hi = isFinite(hiF) ? anchor + (hiF - anchor) * u : hiF;
      const chg = anchor ? (v - anchor) / anchor * 100 : 0;
      const col = chg > 0.5 ? "var(--bull)" : chg < -0.5 ? "var(--bear)" : "var(--eth)";
      const upF = _upProb(vF, hiF, anchor);
      const _dir = chg > 0.3 ? 1 : chg < -0.3 ? -1 : 0;                       // 이 시점 예측 변화 방향
      const dirProb = _dir >= 0 ? upF : (100 - upF);                          // '그 변화가 일어날' 확률(달성확률)
      const up = Math.round(dirProb * u);
      // 예상 범위 바: [lo, hi]에 현재가·예측가 위치 표시(불확실성을 눈으로)
      let bar = "";
      if (isFinite(lo) && isFinite(hi) && hi > lo) {
        const rlo = Math.min(lo, anchor), rhi = Math.max(hi, anchor), span = (rhi - rlo) || 1;
        const pN = Math.max(0, Math.min(100, (anchor - rlo) / span * 100));
        const pV = Math.max(0, Math.min(100, (v - rlo) / span * 100));
        const fL = Math.min(pN, pV), fW = Math.abs(pV - pN);
        bar = `<div class="hzr" title="예상 범위 ${_hzFmt(lo)} ~ ${_hzFmt(hi)} · 현재 ${_hzFmt(anchor)} → 예측 ${_hzFmt(v)}">`
          + `<span class="hzr-lo">${_hzFmt(lo)}</span><span class="hzr-hi">${_hzFmt(hi)}</span>`
          + `<div class="hzr-track"><i class="hzr-fill" style="left:${fL}%;width:${fW}%;background:${col}"></i>`
          + `<i class="hzr-now" style="left:${pN}%"></i><i class="hzr-dot" style="left:${pV}%;background:${col}"></i></div></div>`;
      } else bar = `<div class="hzr"><div class="hzr-track"></div></div>`;
      return `<div class="hz-item">
        <span class="hz-when">+${h}<em>${unit}</em></span>
        <span class="hz-pred"><b class="hz-chg" style="color:${col}">${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%</b><span class="hz-px">${_hzFmt(v)}</span></span>
        ${bar}
        <span class="hz-prob"><b style="color:${col}">${up}<em>%</em></b><i class="hzp"><b style="width:${up}%;background:${col}"></b></i></span>
      </div>`;
    }).join("");
    const projPath = path.map(v => anchor + (v - anchor) * u);
    const projLo = (p.lo || []).map(v => isFinite(v) ? anchor + (v - anchor) * u : v);
    const projHi = (p.hi || []).map(v => isFinite(v) ? anchor + (v - anchor) * u : v);
    const proj = projPath.length >= 2 ? `<div class="hz-spark">${_projSVG(anchor, projPath, projLo, projHi, { w: 150, h: 42 })}<span>예측 경로 · 지금 → +${hs[hs.length - 1]}${unit}<br>음영 = 예상 범위(밴드)</span></div>` : "";
    host.innerHTML = proj + `<div class="hz-grid">${head}${rows}</div>`;
  }
  /* 시점 가중 종합 상승확률(%) — 가까운 시점일수록 신뢰↑. 헤더 국면/시그널 문구에 통합 표기 */
  function aggUpProb(pred) {
    const path = pred && pred.path; if (!path || !path.length) return null;
    const anchor = (pred.anchor != null && isFinite(pred.anchor)) ? pred.anchor : path[0];
    let s = 0, w = 0;
    for (let k = 0; k < path.length; k++) { const h = k + 1, wt = 1 / Math.sqrt(h); s += _upProb(path[k], pred.hi && pred.hi[k], anchor) * wt; w += wt; }
    if (!w) return null;
    const raw = Math.round(s / w);   // 캘리브레이션(v1.4): 과신 교정 → 표기 확률이 실제와 일치(OOS ECE 8.6→0.7%p)
    return (typeof ForgeCore !== "undefined" && ForgeCore.calibrateUpProb) ? ForgeCore.calibrateUpProb(raw) : raw;
  }
  /* ── 분석 해설(단계별 근거 + 예측 이유) ── */
  function _saveHudPos(key, el) { if (!el || !el.style.left) return; try { localStorage.setItem(key, JSON.stringify({ left: el.style.left, top: el.style.top })); } catch (_) {} }
  function _restoreHudPos(key, el) { if (!el) return; try { const p = JSON.parse(localStorage.getItem(key) || "null"); if (p && p.left) { el.style.left = p.left; el.style.top = p.top; el.style.right = "auto"; el.style.bottom = "auto"; } } catch (_) {} }
  function renderNarrative(result) {
    const host = document.getElementById("fcNarr"); if (!host) return;
    const blocks = boardState.nodes.filter(n => n.kind === "block");
    const metaEl = document.getElementById("fcNarrMeta");
    if (!blocks.length || !result) { if (metaEl) metaEl.textContent = ""; host.innerHTML = `<div class="na-empty">분석 후 단계별 해설이 표시됩니다</div>`; return; }
    const v = result.verdict || {};
    const priceNode = blocks.find(n => n.blockType === "price");
    const pv = priceNode && result.values && result.values[priceNode.id];
    const priceLast = (pv && pv.length) ? pv[pv.length - 1] : null;
    const order = ["ma", "trend", "rsi", "bollinger", "macd", "adx", "volumeprofile", "ichimoku", "structure", "atr", "smc", "cycle", "vwap", "supertrend", "stochastic", "pivot", "psar", "keltner", "donchian", "cci", "williams", "roc", "ao", "aroon", "mfi", "cmf", "fib", "elliott", "phasefold", "volume"];
    const inds = blocks.filter(n => order.includes(n.blockType)).sort((a, b) => order.indexOf(a.blockType) - order.indexOf(b.blockType));
    if (metaEl) metaEl.textContent = (inds.length + 1) + "단계";
    const steps = [];
    let i = 1;
    if (_visionNote) steps.push(`<div class="nr-step"><span class="nr-num">${i++}</span><b>차트 판독</b><span class="nr-read">${esc(_visionNote)}</span></div>`);
    const px = (pv && pv.length) ? pv : [];
    inds.forEach(n => {
      const facts = nodeExpert(n, result, px, priceLast);
      const _b = (px.length >= 2) ? _nodeBias(n, px) : 0;   // 실제 지표 방향(신호보드와 일관) — conviction 미설정 시 전부 중립 버그 수정
      const lean = _b > 0.05 ? '<span class="nr-up">▲ 상승</span>' : _b < -0.05 ? '<span class="nr-dn">▼ 하락</span>' : '<span class="nr-fl">중립</span>';
      const memo = (n.note && n.note.trim()) || (n.desc && n.desc.trim()) || "";
      const memoHtml = memo ? `<div class="nr-memo">&ldquo;${esc(memo)}&rdquo;</div>` : "";
      const factsHtml = `<ul class="nr-facts">${facts.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
      steps.push(`<div class="nr-step"><span class="nr-num">${i++}</span><div class="nr-main"><div class="nr-head"><b>${esc(BTLABEL[n.blockType] || n.blockType)}</b> ${lean}</div>${factsHtml}${memoHtml}</div></div>`);
    });
    const reg = regimeKo(v.regime);
    const score = Math.round(v.score || 0);
    const lean = score > 12 ? "상승 우세" : score < -12 ? "하락 우세" : "방향성 혼조(중립)";
    const seas = result.prediction && result.prediction.seasonal;
    const seasTxt = seas ? ` 또한 파동스캔의 <b>지배주기 ${seas.period}봉 시즌 형상</b>을 예측에 반영했습니다(진폭 ${Math.round(seas.rel * 100)}% · 정합 신뢰도 비례).` : "";
    const concl =
      `종합하면 국면은 <b>${reg}</b>(시그널 ${score}), 지표 가중 결과 <b>${lean}</b>로 판단됩니다. ` +
      (isFinite(v.target) ? `목표가 <b>${fmtNum(v.target)}</b>` : "") +
      (isFinite(v.invalidation) ? ` · 무효화 <b>${fmtNum(v.invalidation)}</b>` : "") +
      `. 예측 콘은 현재가에서 지표 종합 방향으로 연장한 경로이며, 확신·중요도를 조정하면 추세 강도가 바뀝니다.` + seasTxt;
    host.innerHTML = steps.join("") + `<div class="nr-concl">${concl}</div>`;
  }

  /* ── 노드별 분석 패널 ──────────────────────────────────────────── */
  const BTLABEL = { ticker: "티커", price: "가격", ma: "이동평균", phasefold: "파동스캔", combine: "가중결합", trend: "추세선", rsi: "RSI", bollinger: "볼린저밴드", macd: "MACD", adx: "ADX", volumeprofile: "볼륨프로파일", ichimoku: "일목균형표", structure: "시장구조", atr: "ATR", smc: "스마트머니", cycle: "사이클", vwap: "VWAP", supertrend: "슈퍼트렌드", stochastic: "스토캐스틱", fib: "피보나치", elliott: "엘리어트", volume: "거래량", predict: "예측" };
  function regimeKo(r) { return r === "bull" ? "상승" : r === "bear" ? "하락" : "중립"; }
  function nodeReadText(n, result, priceLast) {
    const v = result && result.values && result.values[n.id];
    const last = (v && v.length) ? v[v.length - 1] : null;
    const m = result && result.meta && result.meta[n.id];
    switch (n.blockType) {
      case "price": return last != null ? "현재가 " + fmtNum(last) : "—";
      case "ma": {
        if (last == null) return "—";
        const rel = priceLast != null ? (priceLast >= last ? " · 가격 상회 ↑" : " · 가격 하회 ↓") : "";
        return "MA " + fmtNum(last) + rel;
      }
      case "rsi": {
        if (last == null) return "—";
        const rsi = Math.round(last * 50 + 50);
        return "RSI " + rsi + " · " + (rsi >= 70 ? "과매수" : rsi <= 30 ? "과매도" : "중립");
      }
      case "trend":
        return last == null ? "—" : "기울기 " + (last > 0.12 ? "상승 ↑" : last < -0.12 ? "하락 ↓" : "횡보 →");
      case "fib": {
        if (last == null) return "—";
        const pct = Math.round((last + 1) / 2 * 100);
        return "범위 " + pct + "% " + (pct >= 66 ? "(상단권)" : pct <= 33 ? "(하단권)" : "(중단권)");
      }
      case "phasefold": return (m && m.best != null) ? "지배주기 P*≈" + Math.round(m.best) + (m.kbest ? " (" + m.kbest + "주기/창)" : "") + (isFinite(m.theta) ? " · 정합 θ" + m.theta.toFixed(2) : "") + (m.method ? " · " + m.method : "") : "스캔 대기";
      case "elliott": {
        if (!(m && m.current)) return "—";
        const minorTxt = "소(" + m.current.label + " " + (m.current.dir > 0 ? "▲" : m.current.dir < 0 ? "▼" : "–") + ")";
        const pst = m.primary && m.primary.structure;
        const pAbbr = pst === "impulse_up" ? "임펄스↑" : pst === "impulse_down" ? "임펄스↓" : pst === "corrective" ? "ABC" : null;
        return pAbbr ? "대(" + pAbbr + ") · " + minorTxt : minorTxt;
      }
      case "combine": return last != null ? "결합값 " + (last > 0 ? "+" : "") + (Math.round(last * 1000) / 1000) : "—";
      case "predict": return (result && result.verdict) ? "국면 " + regimeKo(result.verdict.regime) + " · 시그널 " + Math.round(result.verdict.score) : "—";
      case "volume": return "참고 입력(계산 없음)";
      default: return n.note ? n.note : "—";
    }
  }
  // 노드별 분석 단계 배열 [{text, layer}]. MA는 다단계, 그 외는 기존 한 줄 폴백.
  function analysisSteps(n, result, priceLast, price) {
    if (n.blockType === "ma" && Array.isArray(price) && price.length >= 2) {
      const len = (n.params && n.params.len) || 20, ema = !!(n.params && n.params.ema);
      const ma = _an("MA", price, { len, ema });
      const texts = ForgeCore.maSteps(ma, len), layers = [1, 1, 2, 3, 4];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "fib" && Array.isArray(price) && price.length >= 2) {
      const fib = _an("Fib", price, { len: (n.params && n.params.len) || 120, swing: ((n.params && n.params.swing) != null ? n.params.swing : 5) / 100 });
      const texts = ForgeCore.fibSteps(fib), layers = [1, 1, 2, 3, 4];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "elliott" && Array.isArray(price) && price.length >= 2) {
      const ea = _an("Elliott", price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
      const texts = ForgeCore.elliottSteps(ea), layers = [1, 1, 2, 3, 4];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "rsi" && Array.isArray(price) && price.length >= 2) {
      const rsi = _an("RSI", price, { period: (n.params && n.params.period) || 14 });
      const texts = ForgeCore.rsiSteps(rsi), layers = [1, 1, 1, 2, 2];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "bollinger" && Array.isArray(price) && price.length >= 2) {
      const len = (n.params && n.params.len) || 20, k = (n.params && n.params.k) || 2;
      const bb = _an("Bollinger", price, { len, k });
      const texts = ForgeCore.bollingerSteps(bb, len, k), layers = [1, 1, 2, 1, 2];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "macd" && Array.isArray(price) && price.length >= 2) {
      const f = (n.params && n.params.fast) || 12, s = (n.params && n.params.slow) || 26, g = (n.params && n.params.signal) || 9;
      const mac = _an("MACD", price, { fast: f, slow: s, signal: g });
      const texts = ForgeCore.macdSteps(mac, f, s, g), layers = [1, 1, 1, 2, 2];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "adx" && Array.isArray(price) && price.length >= 2) {
      const period = (n.params && n.params.period) || 14;
      const ax = _an("ADX", price, { period });
      const texts = ForgeCore.adxSteps(ax, period), layers = [1, 1, 1, 2, 2];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "volumeprofile" && Array.isArray(price) && price.length >= 2) {
      const _vn2 = boardState.nodes.find(x => x.blockType === "volume");
      const vp = _anVP(price, { len: (n.params && n.params.len) || 120, bins: (n.params && n.params.bins) || 24 });
      const texts = ForgeCore.volumeProfileSteps(vp), layers = [1, 1, 1, 2, 2];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "ichimoku" && Array.isArray(price) && price.length >= 2) {
      const ic = _an("Ichimoku", price, { tenkan: (n.params && n.params.tenkan) || 9, kijun: (n.params && n.params.kijun) || 26, senkouB: (n.params && n.params.senkouB) || 52, shift: (n.params && n.params.shift) || 26 });
      const texts = ForgeCore.ichimokuSteps(ic), layers = [1, 2, 1, 1, 2];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "structure" && Array.isArray(price) && price.length >= 2) {
      const st = _an("Structure", price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
      const texts = ForgeCore.structureSteps(st), layers = [1, 1, 2, 1, 2];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "atr" && Array.isArray(price) && price.length >= 2) {
      const at = ForgeCore.analyzeATR(price, { period: (n.params && n.params.period) || 14, mult: (n.params && n.params.mult) || 2 });
      const texts = ForgeCore.atrSteps(at, (n.params && n.params.period) || 14), layers = [1, 1, 1, 1, 2];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "smc") {
      const smc = _anSMC(price);
      const texts = ForgeCore.smcSteps(smc), layers = [1, 1, 1, 2, 2];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "cycle" && Array.isArray(price) && price.length >= 2) {
      const cy = _an("Cycle", price, { pmin: (n.params && n.params.pmin) || 10, pmax: (n.params && n.params.pmax) || 0 });
      const texts = ForgeCore.cycleSteps(cy), layers = [1, 1, 2, 2, 2];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    if (n.blockType === "volume" && Array.isArray(price) && price.length >= 2) {
      const va = _anVolume(price);
      return ForgeCore.volumeSteps(va).map((text, i) => ({ text, layer: [1, 1, 2, 2, 2][i] }));
    }
    if (n.blockType === "vwap" && Array.isArray(price) && price.length >= 2) {
      const vw = _anGet(price, "VWAPev|" + ((n.params && n.params.len) || 20), () => ForgeCore.analyzeVWAP(price, _anVolSeries(price), { len: (n.params && n.params.len) || 20 }));
      return ForgeCore.vwapSteps(vw).map((text, i) => ({ text, layer: [1, 1, 1, 2, 2][i] }));
    }
    if (n.blockType === "supertrend" && Array.isArray(price) && price.length >= 2) {
      const stt = _an("Supertrend", price, { period: (n.params && n.params.period) || 10, mult: (n.params && n.params.mult) || 3 });
      return ForgeCore.supertrendSteps(stt).map((text, i) => ({ text, layer: [1, 1, 1, 2, 2][i] }));
    }
    if (n.blockType === "stochastic" && Array.isArray(price) && price.length >= 2) {
      const stc = _an("Stochastic", price, { kLen: (n.params && n.params.kLen) || 14, kSmooth: (n.params && n.params.kSmooth) || 3, dLen: (n.params && n.params.dLen) || 3 });
      return ForgeCore.stochSteps(stc).map((text, i) => ({ text, layer: [1, 1, 2, 2, 2][i] }));
    }
    if (n.blockType === "pivot" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.pivotSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2, 2][i] }));
    }
    if (n.blockType === "psar" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.psarSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2, 2][i] }));
    }
    if (n.blockType === "keltner" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.keltnerSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 1, 2][i] }));
    }
    if (n.blockType === "donchian" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.donchianSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2, 2][i] }));
    }
    if (n.blockType === "cci" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.cciSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2, 2][i] }));
    }
    if (n.blockType === "williams" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.williamsSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2][i] }));
    }
    if (n.blockType === "roc" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.rocSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2][i] }));
    }
    if (n.blockType === "ao" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.aoSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2][i] }));
    }
    if (n.blockType === "aroon" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.aroonSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2][i] }));
    }
    if (n.blockType === "mfi" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.mfiSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2, 2][i] }));
    }
    if (n.blockType === "cmf" && Array.isArray(price) && price.length >= 2) {
      const texts = ForgeCore.cmfSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2, 2][i] }));
    }
    return [{ text: nodeReadText(n, result, priceLast), layer: 0 }];
  }
  /* 노드별 '전문 분석' — 각 기술지표가 도메인 지식으로 여러 사실을 산출(우측 패널 나열용) */
  function nodeExpert(n, result, px, priceLast) {
    const v = result && result.values && result.values[n.id];
    const m = result && result.meta && result.meta[n.id];
    const f = [];
    const P = Array.isArray(px) ? px : [];
    switch (n.blockType) {
      case "ma": {
        if (!v || !v.length) return ["데이터 없음"];
        const last = v[v.length - 1];
        const dist = (priceLast != null && last) ? (priceLast - last) / last * 100 : null;
        const slope = v.length >= 6 ? (last - v[v.length - 6]) / (Math.abs(v[v.length - 6]) || 1) * 100 : 0;
        let cross = "";
        if (P.length === v.length) for (let i = Math.max(1, v.length - 6); i < v.length; i++) { const a = P[i - 1] - v[i - 1], b = P[i] - v[i]; if (a < 0 && b >= 0) cross = "최근 골든크로스 — 가격이 MA 상향 돌파"; else if (a > 0 && b <= 0) cross = "최근 데드크로스 — 가격이 MA 하향 이탈"; }
        // 화살표(bias)와 모순 없게: 위치는 사실만(상회/하회) + 추세로 방향을 명시. '저항/지지 우위'(방향 단정) 표현 제거
        const _trd = slope > 0.5 ? "상승추세" : slope < -0.5 ? "하락추세" : "횡보";
        f.push("MA " + fmtNum(last) + " · " + _trd + (dist != null ? (" · 가격 " + (dist >= 0 ? "+" : "") + dist.toFixed(1) + "% " + (dist >= 0 ? "상회" : "하회(단기 조정)")) : ""));
        f.push("MA 기울기 " + (slope > 0.5 ? "상승 ↑" : slope < -0.5 ? "하락 ↓" : "평탄 →") + " (" + (slope >= 0 ? "+" : "") + slope.toFixed(1) + "%/5봉)");
        if (cross) f.push(cross);
        return f;
      }
      case "trend": {
        const len = Math.min(P.length, (n.params && n.params.len) || 40), seg = P.slice(P.length - len);
        if (seg.length < 3) return ["데이터 부족"];
        const lr = _linreg(seg); let ssr = 0, sst = 0, mean = seg.reduce((s, x) => s + x, 0) / seg.length;
        for (let i = 0; i < seg.length; i++) { const pr = lr.a * i + lr.b; ssr += (seg[i] - pr) ** 2; sst += (seg[i] - mean) ** 2; }
        const r2 = sst > 0 ? 1 - ssr / sst : 0, slPct = mean ? lr.a / Math.abs(mean) * 100 : 0;
        f.push("회귀 추세 " + (lr.a > 0 ? "우상향 ↑" : lr.a < 0 ? "우하향 ↓" : "수평 →") + " (" + (slPct >= 0 ? "+" : "") + slPct.toFixed(2) + "%/봉, " + len + "봉)");
        f.push("적합도 R²=" + r2.toFixed(2) + " · " + (r2 > 0.8 ? "추세 견고(직선적)" : r2 > 0.5 ? "추세 보통" : "불규칙(추세 약함)"));
        return f;
      }
      case "rsi": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const r = _an("RSI", P, { period: (n.params && n.params.period) || 14 });
        f.push("RSI " + Math.round(r.last) + " \xb7 " + (r.zone === "overbought" ? "과매수(과열·되돌림 주의)" : r.zone === "oversold" ? "과매도(반등 가능)" : "중립 구간"));
        const c50 = (r.cross50 === "above" || r.cross50 === "cross_up") ? "50선 위" : "50선 아래";
        f.push(c50 + " \xb7 추세 " + (r.trend > 0.1 ? "상승(모멘텀 강화)" : r.trend < -0.1 ? "하락(모멘텀 둔화)" : "횡보"));
        f.push(r.divergence.type === "bearish" ? "베어리시 다이버전스 — 고점↑·RSI↓ (상승 모멘텀 약화·반락 주의)"
          : r.divergence.type === "bullish" ? "불리시 다이버전스 — 저점↓·RSI↑ (하락 모멘텀 약화·반등 가능)"
          : "다이버전스 없음 (가격-RSI 동행)");
        return f;
      }
      case "bollinger": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const len = (n.params && n.params.len) || 20, k = (n.params && n.params.k) || 2;
        return ForgeCore.bollingerSteps(_an("Bollinger", P, { len, k }), len, k).slice(1, 4);
      }
      case "macd": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const fa = (n.params && n.params.fast) || 12, sl = (n.params && n.params.slow) || 26, si = (n.params && n.params.signal) || 9;
        return ForgeCore.macdSteps(_an("MACD", P, { fast: fa, slow: sl, signal: si }), fa, sl, si).slice(1, 4);
      }
      case "adx": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const pd = (n.params && n.params.period) || 14;
        return ForgeCore.adxSteps(_an("ADX", P, { period: pd }), pd).slice(1, 4);
      }
      case "volumeprofile": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const _vn2 = boardState.nodes.find(x => x.blockType === "volume");
        return ForgeCore.volumeProfileSteps(_anVP(P, { len: (n.params && n.params.len) || 120, bins: (n.params && n.params.bins) || 24 })).slice(1, 4);
      }
      case "ichimoku": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        return ForgeCore.ichimokuSteps(_an("Ichimoku", P, { tenkan: (n.params && n.params.tenkan) || 9, kijun: (n.params && n.params.kijun) || 26, senkouB: (n.params && n.params.senkouB) || 52, shift: (n.params && n.params.shift) || 26 })).slice(1, 4);
      }
      case "structure": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        return ForgeCore.structureSteps(_an("Structure", P, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 })).slice(1, 4);
      }
      case "atr": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        return ForgeCore.atrSteps(ForgeCore.analyzeATR(P, { period: (n.params && n.params.period) || 14, mult: (n.params && n.params.mult) || 2 }), (n.params && n.params.period) || 14).slice(1, 4);
      }
      case "smc": {
        return ForgeCore.smcSteps(_anSMC(P)).slice(1, 4);
      }
      case "cycle": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        return ForgeCore.cycleSteps(_an("Cycle", P, { pmin: (n.params && n.params.pmin) || 10, pmax: (n.params && n.params.pmax) || 0 })).slice(1, 4);
      }
      case "vwap": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        return ForgeCore.vwapSteps(_anGet(P, "VWAPev|" + ((n.params && n.params.len) || 20), () => ForgeCore.analyzeVWAP(P, _anVolSeries(P), { len: (n.params && n.params.len) || 20 }))).slice(1, 4);
      }
      case "supertrend": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        return ForgeCore.supertrendSteps(_an("Supertrend", P, { period: (n.params && n.params.period) || 10, mult: (n.params && n.params.mult) || 3 })).slice(1, 4);
      }
      case "stochastic": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        return ForgeCore.stochSteps(_an("Stochastic", P, { kLen: (n.params && n.params.kLen) || 14, kSmooth: (n.params && n.params.kSmooth) || 3, dLen: (n.params && n.params.dLen) || 3 })).slice(1, 4);
      }
      case "pivot": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const piv = _anPivot(P);
        if (!piv.P) return ["데이터 없음"];
        const posTxt = piv.last > piv.P ? "피벗 위(강세)" : piv.last < piv.P ? "피벗 아래(약세)" : "피벗 근접(중립)";
        f.push("피벗 P " + fmtNum(piv.P) + " · 종가 " + fmtNum(piv.last) + " — " + posTxt);
        f.push("저항 R1 " + fmtNum(piv.R[0]) + " · R2 " + fmtNum(piv.R[1]) + " · R3 " + fmtNum(piv.R[2]));
        f.push("지지 S1 " + fmtNum(piv.S[0]) + " · S2 " + fmtNum(piv.S[1]) + " · S3 " + fmtNum(piv.S[2]));
        return f;
      }
      case "psar": {
        if (!Array.isArray(P) || P.length < 3) return ["데이터 없음"];
        const ps = _anPsar(P, { step: (n.params && n.params.step) || 0.02, max: (n.params && n.params.max) || 0.2 });
        if (!ps.series || !ps.series.length) return ["데이터 없음"];
        const dirTxt = ps.dir === 1 ? "상승(SAR 하단 추적)" : "하락(SAR 상단 추적)";
        f.push("추세 " + dirTxt + (ps.flip ? " · 최근 전환" : ""));
        f.push("SAR " + fmtNum(ps.sar) + " · 종가 " + fmtNum(ps.last));
        f.push("bias " + ps.bias.toFixed(2) + (ps.flip ? " (전환 직후 완화)" : ""));
        return f;
      }
      case "keltner": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const kt = _anKeltner(P, { len: (n.params && n.params.len) || 20, atrLen: (n.params && n.params.atrLen) || 10, mult: (n.params && n.params.mult) || 2 });
        if (!kt.upper) return ["데이터 없음"];
        const posTxt = kt.pctB > 1 ? "상단 돌파" : kt.pctB < 0 ? "하단 이탈" : kt.pctB > 0.8 ? "상단 근접" : kt.pctB < 0.2 ? "하단 근접" : "채널 중앙";
        f.push("중심 " + fmtNum(kt.mid) + " · 상단 " + fmtNum(kt.upper) + " · 하단 " + fmtNum(kt.lower));
        f.push("%B " + kt.pctB.toFixed(2) + " — " + posTxt + (kt.squeeze ? " · 변동성 수축(스퀴즈)" : ""));
        f.push("bias " + kt.bias.toFixed(2));
        return f;
      }
      case "donchian": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const dc = _anDonchian(P, { len: (n.params && n.params.len) || 20 });
        if (!dc.upper) return ["데이터 없음"];
        const posTxt = dc.pos > 0.98 ? "상단 돌파" : dc.pos < 0.02 ? "하단 이탈" : dc.pos > 0.8 ? "상단 근접" : dc.pos < 0.2 ? "하단 근접" : "채널 중앙";
        f.push("상단 " + fmtNum(dc.upper) + " · 중앙 " + fmtNum(dc.mid) + " · 하단 " + fmtNum(dc.lower));
        f.push("채널위치 " + dc.pos.toFixed(2) + " — " + posTxt);
        f.push("bias " + dc.bias.toFixed(2));
        return f;
      }
      case "cci": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const a = _an("CCI", P, { period: (n.params && n.params.period) || 20 });
        const zt = a.last > 100 ? "과열" : a.last < -100 ? "과매도" : "중립";
        const rt = a.regime > 0 ? "강세국면" : a.regime < 0 ? "약세국면" : "중립국면";
        f.push("CCI " + Math.round(a.last) + " — " + zt);
        f.push("국면 " + rt + " (최근 평균 기준)");
        f.push("bias " + a.bias.toFixed(2));
        return f;
      }
      case "williams": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const a = _anWilliams(P, { period: (n.params && n.params.period) || 14 });
        const zt = a.last > -20 ? "과매수" : a.last < -80 ? "과매도" : "중립";
        f.push("Williams %R " + Math.round(a.last) + " — " + zt);
        f.push("bias " + a.bias.toFixed(2));
        return f;
      }
      case "roc": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const a = _an("ROC", P, { period: (n.params && n.params.period) || 12 });
        f.push("ROC " + a.last.toFixed(1) + "% — " + (a.last > 0 ? "상승 모멘텀" : a.last < 0 ? "하락 모멘텀" : "중립"));
        f.push("bias " + a.bias.toFixed(2));
        return f;
      }
      case "ao": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const a = _anAo(P, { fast: (n.params && n.params.fast) || 5, slow: (n.params && n.params.slow) || 34 });
        f.push("AO " + a.last.toFixed(2) + " — " + (a.cross > 0 ? "0선 상향돌파" : a.cross < 0 ? "0선 하향돌파" : a.last > 0 ? "양(+)" : a.last < 0 ? "음(−)" : "중립"));
        f.push("bias " + a.bias.toFixed(2));
        return f;
      }
      case "aroon": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const a = _anAroon(P, { period: (n.params && n.params.period) || 25 });
        const zt = a.osc > 30 ? "상승 추세" : a.osc < -30 ? "하락 추세" : "중립";
        f.push("Aroon Up " + Math.round(a.up) + " / Down " + Math.round(a.down) + " — " + zt);
        f.push("bias " + a.bias.toFixed(2));
        return f;
      }
      case "mfi": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const a = _anMfi(P, { period: (n.params && n.params.period) || 14 });
        const zt = a.last > 80 ? "과열" : a.last < 20 ? "과매도" : a.last > 50 ? "자금 유입" : "자금 이탈";
        const _vn = boardState.nodes.find(x => x.blockType === "volume");
        const hasVol = !!(_vn && Array.isArray(_vn.series) && _vn.series.length === P.length);
        f.push("MFI " + Math.round(a.last) + " — " + zt);
        f.push("bias " + a.bias.toFixed(2));
        f.push(hasVol ? "거래량 노드 반영" : "실거래량 없음 — 합성 거래량 기반 참고용");
        return f;
      }
      case "cmf": {
        if (!Array.isArray(P) || P.length < 2) return ["데이터 없음"];
        const a = _anCmf(P, { period: (n.params && n.params.period) || 20 });
        const zt = a.last > 0 ? "매집(자금 유입)" : a.last < 0 ? "분산(자금 이탈)" : "중립";
        const _vn = boardState.nodes.find(x => x.blockType === "volume");
        const hasVol = !!(_vn && Array.isArray(_vn.series) && _vn.series.length === P.length);
        f.push("CMF " + a.last.toFixed(2) + " — " + zt);
        f.push("bias " + a.bias.toFixed(2));
        f.push(hasVol ? "거래량 노드 반영" : "실거래량 없음 — 합성 거래량 기반 참고용");
        return f;
      }
      case "fib": {
        const len = Math.min(P.length, (n.params && n.params.len) || 120), seg = P.slice(P.length - len);
        if (!seg.length) return ["데이터 없음"];
        const hi = Math.max(...seg), lo = Math.min(...seg), pos = (priceLast - lo) / ((hi - lo) || 1);
        const lv = [0, .236, .382, .5, .618, .786, 1]; let near = lv[0], nd = 9; for (const r of lv) { const d = Math.abs(pos - r); if (d < nd) { nd = d; near = r; } }
        f.push("스윙 " + fmtNum(lo) + "~" + fmtNum(hi) + " · 현재 " + Math.round(pos * 100) + "% 지점");
        f.push("최근접 되돌림 " + near.toFixed(3) + " · " + (pos >= 0.66 ? "상단권(추가상승 vs 저항)" : pos <= 0.33 ? "하단권(지지 시험)" : "중단권"));
        return f;
      }
      case "elliott": {
        const piv = _zigzag(P, 0.13), c = piv.length;
        if (c < 2) return ["뚜렷한 파동 없음"];
        const lab = _EWLAB[Math.min(c - 1, 7)] || "-", up = piv[c - 1].p > piv[c - 2].p;
        f.push("스윙 " + c + "개 · 현재 파동 " + lab + " 추정");
        f.push("직전 파동 " + (up ? "상승 ▲" : "하락 ▼") + " (" + _curSym() + fmtNum(piv[c - 2].p) + "→" + _curSym() + fmtNum(piv[c - 1].p) + ")");
        // 5파 다각 검증: 하드 규칙 + 피보 되돌림/연장 비율 + 종합 정합도
        if (c >= 6) {
          const p = piv.slice(-6).map(x => x.p), d = Math.sign(p[1] - p[0]) || 1;
          const L = (a, b) => Math.abs(p[b] - p[a]);
          const W1 = L(0, 1), W2 = L(1, 2), W3 = L(2, 3), W4 = L(3, 4), W5 = L(4, 5);
          const r1 = d > 0 ? p[2] > p[0] : p[2] < p[0];           // 파동2: 100% 초과 되돌림 금지
          const r2 = !(W3 < W1 && W3 < W5);                       // 파동3: 최단 금지
          const r3 = d > 0 ? p[4] > p[1] : p[4] < p[1];           // 파동4: 파동1 영역 미겹침
          const pass = [r1, r2, r3].filter(Boolean).length;
          f.push("규칙 — 파동2 되돌림 " + (r1 ? "✓" : "✗") + " · 파동3 비최단 " + (r2 ? "✓" : "✗") + " · 파동4 비겹침 " + (r3 ? "✓" : "✗") + " (" + pass + "/3)");
          const RET = [0.236, 0.382, 0.5, 0.618, 0.786], EXT = [1.0, 1.272, 1.618, 2.0, 2.618];
          const near = (r, lvs) => { let b = lvs[0], bd = 9; for (const x of lvs) { const dd = Math.abs(r - x) / x; if (dd < bd) { bd = dd; b = x; } } return { lv: b, ok: bd <= 0.12 }; };
          const a2 = W1 ? W2 / W1 : 0, a3 = W1 ? W3 / W1 : 0, a4 = W3 ? W4 / W3 : 0, a5 = W1 ? W5 / W1 : 0;
          const n2 = near(a2, RET), n3 = near(a3, EXT), n4 = near(a4, RET), n5 = near(a5, [0.618, 1.0, 1.618]);
          f.push("피보 파동2: W1의 " + Math.round(a2 * 100) + "% ≈ " + n2.lv + (n2.ok ? " ✓" : " (이탈)") + " · " + (a2 >= 0.382 && a2 <= 0.786 ? "전형적 되돌림" : "이례적"));
          f.push("피보 파동3: W1의 ×" + a3.toFixed(2) + " ≈ " + n3.lv + (n3.ok ? " ✓" : " (이탈)") + " · " + (a3 >= 1.5 ? "강한 연장" : a3 >= 1 ? "보통" : "약한 3파"));
          f.push("피보 파동4: W3의 " + Math.round(a4 * 100) + "% ≈ " + n4.lv + (n4.ok ? " ✓" : " (이탈)") + " · " + (a4 <= 0.5 ? "얕은 조정(정상)" : "깊은 조정"));
          f.push("피보 파동5: W1의 ×" + a5.toFixed(2) + " ≈ " + n5.lv + (n5.ok ? " ✓" : " (이탈)"));
          const fibHits = [n2, n3, n4, n5].filter(x => x.ok).length;
          f.push("→ " + (pass === 3 && fibHits >= 2 ? "유효한 5파 임펄스(" + (d > 0 ? "상승" : "하락") + ")" : pass >= 2 ? "임펄스 가능성(경계)" : "규칙 위반 — 수정(ABC)/대안 카운트") + " · 규칙 " + pass + "/3 · 피보 정합 " + fibHits + "/4");
        } else {
          f.push("5파+피보 검증엔 스윙 6개+ 필요(현재 " + c + ")");
        }
        return f;
      }
      case "phasefold": {
        if (!m || m.best == null) return ["스캔 대기"];
        f.push("지배주기 " + Math.round(m.best) + "봉" + (m.kbest ? " (" + m.kbest + "주기/창)" : ""));
        f.push("검출 " + (m.method || "PDM") + (isFinite(m.strength) ? " · FFT 피크 " + m.strength.toFixed(1) + "x" : "") + (isFinite(m.theta) ? " · 정합 θ" + m.theta.toFixed(2) + (m.theta < 0.6 ? "(뚜렷)" : m.theta < 0.85 ? "(보통)" : "(약함)") : ""));
        if (P.length && m.best > 2) { const ph = ((P.length - 1) % m.best) / m.best; f.push("현재 위상 " + Math.round(ph * 100) + "% · " + (ph < 0.5 ? "주기 상승 구간" : "주기 하강 구간")); }
        return f;
      }
      case "volume": {
        const va = _anVolume(P);
        if (!va.series.length) return ["거래량 데이터 없음"];
        const f = [];
        f.push("최근/평균 " + va.ratio.toFixed(2) + "x \xb7 " + (va.state === "spike" ? "급증" : va.state === "contract" ? "위축" : "평이"));
        f.push("거래량 추세 " + (va.trend > 0.1 ? "증가 ↑" : va.trend < -0.1 ? "감소 ↓" : "횡보 →"));
        const rel = va.relationship === "confirm" ? "상승에 거래량 동반 — 추세 건강(확인)" : va.relationship === "weakening" ? "상승하나 거래량 감소 — 추진력 약화(주의)" : va.relationship === "selling" ? "하락에 거래량 증가 — 매도 압력(약세 확인)" : "하락+거래량 위축 — 투매 진정(바닥 가능)";
        f.push("가격-거래량: " + rel);
        f.push(va.divergence.type ? ((va.divergence.type === "bullish" ? "강세" : "약세") + " 거래량 다이버전스") : ("OBV " + (va.obvTrend > 0.1 ? "상승" : va.obvTrend < -0.1 ? "하락" : "횡보")));
        return f;
      }
      default: return [nodeReadText(n, result, priceLast)];
    }
  }
  /* 지표 노드의 '실제 산출값' 방향(-1..1): 엔진 values/meta에서 도출 */
  function _engSig(n, result, priceLast) {
    const v = result && result.values && result.values[n.id];
    const m = result && result.meta && result.meta[n.id];
    const last = (v && v.length) ? v[v.length - 1] : null;
    const cl = x => Math.max(-1, Math.min(1, x));
    switch (n.blockType) {
      case "rsi": return last != null ? cl(last) : 0;                                  // 정규화 RSI(+과열/모멘텀↑)
      case "trend": return last != null ? cl(Math.tanh(last / ((priceLast || 1) * 0.02))) : 0;  // 회귀 기울기
      case "ma": return (last != null && priceLast) ? cl((priceLast - last) / last * 5) : 0;     // 가격>MA=상승
      case "fib": return last != null ? cl(last) : 0;                                  // 범위 내 위치(상단=+)
      case "elliott": return (m && m.current) ? cl(m.current.dir || 0) : 0;            // 현재 파동 방향
      case "volume": {                                                                // 거래량 추세(참여 증가=+, 위축=-)
        const vol = (v && v.length) ? v : null; if (!vol || vol.length < 8) return 0;
        const N = vol.length, recent = (vol[N - 1] + vol[N - 2] + vol[N - 3]) / 3, base = vol.slice(-12).reduce((a, b) => a + b, 0) / 12;
        return cl((recent - base) / (base || 1) * 0.6);
      }
      default: return 0;
    }
  }
  function _rrf(c, x, y, w, h, r) { if (w <= 0) return; r = Math.min(r, h / 2, w / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill(); }
  /* 지표 방향·강도 막대(발산형): 상승=우측 초록 / 하락=좌측 빨강, 길이=강도, 두께=중요도. 강도순 정렬.
     reveal(선택)=시연 시 위에서부터 몇 개까지 채울지(나머지는 흐릿). 기본=전체 */
  let _radarData = [];   // 최근 정렬 데이터(시연 reveal 순서 공유)
  function renderNodeAnalysis(result, reveal) {
    const cv = document.getElementById("fcRadar"); if (!cv) return;
    const metaEl = document.getElementById("fcNodesMeta");
    const blocks = boardState.nodes.filter(n => n.kind === "block" && !["price", "predict", "combine", "ticker"].includes(n.blockType));
    const host = cv.parentElement; const W = host.clientWidth || 360;
    const _needH = Math.max(200, 8 + Math.max(1, blocks.length) * 14 + 8);   // 모든 지표가 잘리지 않게 캔버스 높이 확보(지표당 14px)
    cv.style.height = _needH + "px";
    const Hh = _needH;
    const c = fcFit(cv, Hh); c.clearRect(0, 0, W, Hh);
    if (metaEl) metaEl.textContent = blocks.length ? blocks.length + "개 지표" : "";
    if (!blocks.length || !result) {
      c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center";
      c.fillText("지표 블록을 추가하면 방향·강도가 표시됩니다", W / 2, Hh / 2); c.textAlign = "left"; return;
    }
    const priceNode = boardState.nodes.find(n => n.blockType === "price");
    const pv = priceNode && result.values && result.values[priceNode.id];
    const P = (pv && pv.length >= 2) ? pv : ((typeof currentData === "function" && currentData().price) || []);
    const GREEN = "#46c28e", RED = "#e06a6a", GRAY = "#8a92b2";
    // 신호 보드와 동일한 _nodeBias 사용(일관성) — 전 지표 실측 방향·강도
    let data = blocks.map(n => ({ n, label: BTLABEL[n.blockType] || n.blockType || "노드", sig: (P.length >= 2 ? _nodeBias(n, P) : 0), wt: (n.weight != null ? n.weight : 50) }));
    data.sort((a, b) => Math.abs(b.sig) - Math.abs(a.sig));   // 강한 신호 위로
    _radarData = data;
    const _revIds = (_playing && _playReveal.ids) ? _playReveal.ids : null;   // 시연: 계산 완료된 지표만 점등
    const N = data.length, top = 8, rowH = Math.max(11, Math.min(19, Math.floor((Hh - top - 8) / N)));
    const labelW = 76, midX = labelW + (W - labelW - 40) / 2, maxBar = (W - labelW - 40) / 2 - 4;
    // 중앙(중립) 세로 기준선
    c.strokeStyle = "rgba(138,146,178,.22)"; c.lineWidth = 1; c.beginPath(); c.moveTo(midX, top - 2); c.lineTo(midX, top + N * rowH + 1); c.stroke();
    c.textBaseline = "middle";
    data.forEach((d, i) => {
      const y = top + i * rowH + rowH / 2, lit = !_revIds || _revIds.has(d.n.id), aA = lit ? 1 : 0.14;
      const up = d.sig >= 0, mag = Math.min(1, Math.abs(d.sig));
      const col = mag < 0.08 ? GRAY : (up ? GREEN : RED);
      const len = mag * maxBar, bh = Math.min(rowH - 3, 4 + (d.wt / 100) * 6);
      c.globalAlpha = aA * 0.92; c.fillStyle = col;
      _rrf(c, up ? midX : midX - len, y - bh / 2, Math.max(1.5, len), bh, 2);
      c.globalAlpha = aA;
      c.font = "600 10.5px Pretendard,'Malgun Gothic',system-ui,sans-serif"; c.textAlign = "right";
      c.fillStyle = "rgba(224,229,239,.9)"; c.fillText(esc(d.label), labelW - 6, y);
      c.font = "700 10px ui-monospace,monospace"; c.fillStyle = col; c.textAlign = up ? "left" : "right";
      if (lit) c.fillText((d.sig >= 0 ? "+" : "") + Math.round(d.sig * 100), up ? (midX + len + 4) : (midX - len - 4), y);
      c.globalAlpha = 1;
    });
    c.textBaseline = "alphabetic"; c.textAlign = "left";
    // 하단 범례
    c.font = "9.5px Pretendard,'Malgun Gothic',system-ui,sans-serif";
    c.fillStyle = GREEN; c.fillText("▶ 상승", 6, Hh - 4);
    c.fillStyle = RED; c.fillText("◀ 하락", 58, Hh - 4);
    c.fillStyle = "#6b7391"; c.fillText("· 길이=강도 · 두께=중요도", 108, Hh - 4);
  }
  function togglePhasefoldPanels() {
    const has = boardState.nodes.some(n => n.blockType === "phasefold");
    const pdm = document.getElementById("fcPdmPanel"), fold = document.getElementById("fcFoldPanel");
    if (pdm) pdm.style.display = has ? "" : "none";
    if (fold) fold.style.display = has ? "" : "none";
  }
  function toggleRsiPanel() {
    const has = boardState.nodes.some(n => n.blockType === "rsi");
    const p = document.getElementById("fcRsiPanel"); if (p) p.style.display = has ? "" : "none";
  }
  function toggleVolPanel() {
    const p = document.getElementById("fcVolPanel"); if (!p) return;
    const has = boardState.nodes.some(n => n.kind === "block" && n.blockType === "volume");
    p.style.display = has ? "" : "none";
  }
  function toggleMacdPanel() { const p = document.getElementById("fcMacdPanel"); if (p) p.style.display = boardState.nodes.some(n => n.blockType === "macd") ? "" : "none"; }
  function toggleAdxPanel() { const p = document.getElementById("fcAdxPanel"); if (p) p.style.display = boardState.nodes.some(n => n.blockType === "adx") ? "" : "none"; }
  function toggleCciPanel() { const p = document.getElementById("fcCciPanel"); if (p) p.style.display = boardState.nodes.some(n => n.blockType === "cci") ? "" : "none"; }
  function toggleWilliamsPanel() { const p = document.getElementById("fcWilliamsPanel"); if (p) p.style.display = boardState.nodes.some(n => n.blockType === "williams") ? "" : "none"; }
  function toggleMfiPanel() { const p = document.getElementById("fcMfiPanel"); if (p) p.style.display = boardState.nodes.some(n => n.blockType === "mfi") ? "" : "none"; }

  /* resize: re-render with stored last result/data */
  function redrawCharts() {
    if (!_fcLastResult || !_fcLastData) return;
    if (fcRAF) cancelAnimationFrame(fcRAF);
    fcRAF = requestAnimationFrame(() => {
      if (_playing) {   // 시뮬레이션 중 재드로(스크롤·줌·리사이즈): 최종 결과가 아닌 현재 리빌/모프 프레임으로 다시 그림
        try { drawEvidence(); if (typeof _redrawOscForPlay === "function") _redrawOscForPlay(_playE); fcRenderForecast(_playPred || _fcLastResult.prediction || { path: [], lo: [], hi: [] }); } catch (e) {}
        return;
      }
      renderChart(_fcLastResult, _fcLastData);
    });
  }
  window.addEventListener("resize", redrawCharts);
  // 차트 컨테이너 실제 크기 변화(높이 자동맞춤·레이아웃·창)마다 재드로우 → 그리기 높이(ch)가 항상 캔버스와 일치(x축이 하단 유지)
  (function initHeroResizeObs() {
    if (!window.ResizeObserver) return;
    let _rt2;
    const ro = new ResizeObserver(() => { clearTimeout(_rt2); _rt2 = setTimeout(() => { if (typeof redrawCharts === "function") redrawCharts(); }, 45); });
    const attach = () => { const hero = document.querySelector(".fc-hero"); if (hero) { ro.observe(hero); return true; } return false; };
    if (!attach()) { let n = 0; const iv = setInterval(() => { if (attach() || ++n > 40) clearInterval(iv); }, 100); }
  })();

  /* ── 거터: 캔버스 / 결과 영역 좌우 크기 조절 ───────────────────── */
  /* ── 차트 확대 모달(휠 줌 + 드래그) ── */
  (function initZoom() {
    const modal = document.getElementById("fcZoom"), stage = document.getElementById("fcZoomStage"), cv = document.getElementById("fcZoomCv"), info = document.getElementById("fcZoomInfo");
    if (!modal || !stage || !cv) return;
    let vw = { s: 1, tx: 0, ty: 0 }, zKind = null, zMain = null;
    const apply = () => { cv.style.transform = `translate(${vw.tx}px,${vw.ty}px) scale(${vw.s})`; };
    function composite() {
      const heroImg = document.getElementById("fcHeroImg"), img = heroImg && heroImg.querySelector("img");
      const c = cv.getContext("2d");
      zKind = null; zMain = null;
      if (img && img.naturalWidth && getComputedStyle(heroImg).display !== "none") {
        const W = img.naturalWidth, Hh = img.naturalHeight;
        cv.width = W; cv.height = Hh; cv.style.width = W + "px"; cv.style.height = Hh + "px";
        c.clearRect(0, 0, W, Hh); c.drawImage(img, 0, 0, W, Hh);
        if (heroMode() === "overlay" && _visionCoords && lastResult) {
          _drawCone(c, 0, 0, W, Hh, Hh, lastResult.prediction, _visionCoords, currentData().price, Math.max(1.2, W / 520));
          zKind = "cone";
        } else zKind = "image";
        return true;
      }
      const main = document.getElementById("fcMainChart");
      if (main && main.width) {
        cv.width = main.width; cv.height = main.height; cv.style.width = main.width + "px"; cv.style.height = main.height + "px";
        c.clearRect(0, 0, main.width, main.height); c.drawImage(main, 0, 0);
        ["fcEvidence", "fcEvidenceHi", "fcFx"].forEach(id => { const ov = document.getElementById(id); if (ov && ov.width && ov.height) { try { c.drawImage(ov, 0, 0, main.width, main.height); } catch (e) {} } });   // 분석 작도(근거·라벨·콘·FX) 포함
        zKind = "chart"; zMain = main; return true;
      }
      return false;
    }
    function fit() {
      const sw = stage.clientWidth, sh = stage.clientHeight, s = Math.min(sw / cv.width, sh / cv.height) * 0.96;
      vw = { s, tx: (sw - cv.width * s) / 2, ty: (sh - cv.height * s) / 2 }; apply();
      if (info) info.textContent = "줌 " + Math.round(s * 100) + "% · 휠=줌, 드래그=이동, 더블클릭=맞춤";
    }
    function open() { if (!composite()) { bToast("표시할 차트가 없습니다"); return; } modal.classList.add("on"); modal.setAttribute("aria-hidden", "false"); if (modal.requestFullscreen) { try { modal.requestFullscreen().catch(function () {}); } catch (e) {} } requestAnimationFrame(() => { composite(); fit(); }); }
    function close() { modal.classList.remove("on"); modal.setAttribute("aria-hidden", "true"); if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} } }
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && modal.classList.contains("on")) close(); else if (document.fullscreenElement && modal.classList.contains("on")) requestAnimationFrame(fit); });
    stage.addEventListener("wheel", e => {
      e.preventDefault();
      const r = stage.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.max(0.2, Math.min(8, vw.s * f));
      vw.tx = mx - (mx - vw.tx) * (ns / vw.s); vw.ty = my - (my - vw.ty) * (ns / vw.s); vw.s = ns; apply();
      if (info) info.textContent = "줌 " + Math.round(vw.s * 100) + "% · 휠=줌, 드래그=이동, 더블클릭=맞춤";
    }, { passive: false });
    let drag = null;
    stage.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, tx: vw.tx, ty: vw.ty, type: e.pointerType, moved: false }; stage.classList.add("drag"); try { stage.setPointerCapture(e.pointerId); } catch (_) {} });
    stage.addEventListener("pointermove", e => { if (!drag) return; if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) { drag.moved = true; zHide(); } vw.tx = drag.tx + (e.clientX - drag.x); vw.ty = drag.ty + (e.clientY - drag.y); apply(); });
    const end = e => { if (drag) { const tap = !drag.moved && drag.type === "touch"; stage.classList.remove("drag"); try { stage.releasePointerCapture(e.pointerId); } catch (_) {} drag = null; if (tap) zShow(e.clientX, e.clientY); } };
    stage.addEventListener("pointerup", end); stage.addEventListener("pointercancel", end);
    stage.addEventListener("dblclick", fit);
    /* 확대 모달 호버/탭 툴팁(transform 역변환 · 데스크톱=호버, 터치=탭) */
    const zHide = () => { const t = document.getElementById("fcZoomTip"), v = document.getElementById("fcZoomVline"); if (t) t.style.display = "none"; if (v) v.style.display = "none"; };
    const zShow = (clientX, clientY) => {
      const tip = document.getElementById("fcZoomTip"), vline = document.getElementById("fcZoomVline");
      if (!tip) return;
      const sr = stage.getBoundingClientRect();
      const cx = (clientX - sr.left - vw.tx) / (vw.s || 1);   // 캔버스 내부 px
      let d = null;
      if (zKind === "cone") {
        const g = cv._coneGeo;
        if (g && g.path && g.path.length && cx >= g.nowX - 2 && cx <= g.rightX + 2) {
          const frac = (cx - g.nowX) / ((g.rightX - g.nowX) || 1);
          let k = Math.round(frac * (g.path.length - 1)); k = Math.max(0, Math.min(g.path.length - 1, k));
          const snap = g.nowX + (g.path.length > 1 ? k / (g.path.length - 1) : 0) * (g.rightX - g.nowX);
          d = { label: "+" + (k + 1) + g.unit, price: g.path[k], lo: g.lo && g.lo[k], hi: g.hi && g.hi[k], chg: (g.anchorP ? (g.path[k] - g.anchorP) / g.anchorP * 100 : null), snap, top: g.oy, h: g.dh };
        }
      } else if (zKind === "chart" && zMain && zMain._mainGeo) {
        const g = zMain._mainGeo, dpr = zMain.clientWidth ? zMain.width / zMain.clientWidth : 1, xc = cx / dpr;
        if (xc >= g.padX && xc <= g.padX + g.plotW) {
          if (xc <= g.seamX && g.histLen > 1) {
            let i = Math.round((xc - g.padX) / (g.histW || 1) * (g.histLen - 1)); i = Math.max(0, Math.min(g.histLen - 1, i));
            const ago = g.histLen - 1 - i, snap = g.padX + (i / (g.histLen - 1)) * g.histW;
            d = { label: _axisFullDate(g.start + i, g.winN) || (ago === 0 ? "현재" : "과거 " + ago + g.unit + " 전"), price: g.hist[i], chg: null, snap: snap * dpr, top: g.padTop * dpr, h: (g.ch - g.padTop - g.padBot) * dpr };
          } else if (g.pathLen > 0) {
            let k = Math.round((xc - g.seamX) / ((g.plotW - g.histW) || 1) * g.pathLen - 1); k = Math.max(0, Math.min(g.pathLen - 1, k));
            const snap = g.seamX + ((k + 1) / Math.max(1, g.pathLen)) * (g.plotW - g.histW);
            d = { label: "+" + (k + 1) + g.unit, price: g.path[k], lo: g.lo[k], hi: g.hi[k], chg: (g.anchor ? (g.path[k] - g.anchor) / g.anchor * 100 : 0), snap: snap * dpr, top: g.padTop * dpr, h: (g.ch - g.padTop - g.padBot) * dpr };
          }
        }
      }
      if (!d) { zHide(); return; }
      if (vline) { vline.style.display = "block"; vline.style.left = (vw.tx + d.snap * vw.s) + "px"; vline.style.top = (vw.ty + d.top * vw.s) + "px"; vline.style.height = (d.h * vw.s) + "px"; }
      let inner = `<span class="ct-t">${d.label}</span><span class="ct-v">${_hzFmt(d.price)}</span>`;
      if (d.chg != null) { const col = d.chg > 0.3 ? "var(--bull)" : d.chg < -0.3 ? "var(--bear)" : "var(--eth)"; inner += `<span class="ct-chg" style="color:${col}">${d.chg >= 0 ? "+" : ""}${d.chg.toFixed(1)}%</span>`; }
      if (isFinite(d.lo) && isFinite(d.hi)) inner += `<span class="ct-band">${_hzFmt(d.lo)} ~ ${_hzFmt(d.hi)}</span>`;
      tip.innerHTML = inner; tip.style.display = "block";
      const tw = tip.offsetWidth, th = tip.offsetHeight, rx = clientX - sr.left, ry = clientY - sr.top;
      let lx = rx + 14; if (lx + tw > sr.width - 4) lx = rx - tw - 14; if (lx < 4) lx = 4;
      let ly = ry - th - 10; if (ly < 4) ly = ry + 16;
      tip.style.left = lx + "px"; tip.style.top = ly + "px";
    };
    stage.addEventListener("mouseleave", zHide);
    stage.addEventListener("mousemove", e => { if (drag) { zHide(); return; } zShow(e.clientX, e.clientY); });
    const rb = document.getElementById("fcZoomReset"); if (rb) rb.addEventListener("click", fit);
    const cb = document.getElementById("fcZoomClose"); if (cb) cb.addEventListener("click", close);
    window.addEventListener("keydown", e => { if (e.key === "Escape" && modal.classList.contains("on")) close(); });
    function toggleChartFS() {
      // 네이티브 전체화면(요소 격리→레일·모달 안 보임) 대신 CSS 의사 전체화면 — 지표레일·리스크·최적화 모두 유지
      const on = document.body.classList.toggle("chart-fs");
      const exp = document.getElementById("fcExpand"); if (exp) { exp.textContent = on ? "✕" : "⛶"; exp.title = on ? "전체화면 닫기 (Esc)" : "전체화면"; }
      if (on) { _fsSyncHeadH(); _fcBindScroll(); } else { _fcUnbindScroll(); }
      setTimeout(() => { if (document.body.classList.contains("chart-fs")) { _fsSyncHeadH(); _fcUpdateScrollBtn(); } }, 120);
      setTimeout(_fsRefit, 70); setTimeout(_fsRefit, 260);
    }
    // 전체화면 고정 헤더 높이 측정 → 판정바 top 오프셋(--fs-phead-h)·차트 상단 여백(--fs-head-h=툴바+판정바)
    function _fsSyncHeadH() {
      if (!document.body.classList.contains("chart-fs")) return;
      const ph = document.querySelector(".chart-pane .fc-phead");
      const vb = document.querySelector(".chart-pane .fc-verdict-bar");
      const phH = ph ? Math.round(ph.getBoundingClientRect().height) : 46;
      const vbH = (vb && getComputedStyle(vb).display !== "none") ? Math.round(vb.getBoundingClientRect().height) : 0;
      const rs = document.documentElement.style;
      rs.setProperty("--fs-phead-h", phH + "px");
      rs.setProperty("--fs-head-h", (phH + vbH) + "px");
    }
    // 차트가 휠을 가로채므로 '지표 신호로 이동' 버튼으로 스크롤(차트↔신호 토글). 실제 스크롤 컨테이너는 .fc-wrap
    const _fcScrollEl = () => document.querySelector(".chart-pane .fc-wrap");
    let _fcScrollBound = null;
    const _fcAtBottom = el => el.scrollTop > 80 && el.scrollTop > (el.scrollHeight - el.clientHeight - 40);
    function _fcUpdateScrollBtn() { const el = _fcScrollEl(), lbl = document.getElementById("fcScrollLbl"); if (!el || !lbl) return; lbl.textContent = _fcAtBottom(el) ? "▲ 차트로" : "▼ 지표 신호"; }
    function _fcBindScroll() { const el = _fcScrollEl(); if (!el || _fcScrollBound) return; _fcScrollBound = () => _fcUpdateScrollBtn(); el.addEventListener("scroll", _fcScrollBound, { passive: true }); _fcUpdateScrollBtn(); }
    function _fcUnbindScroll() { const el = _fcScrollEl(); if (el && _fcScrollBound) el.removeEventListener("scroll", _fcScrollBound); _fcScrollBound = null; }
    window._fcScrollToggle = function () {
      const el = _fcScrollEl(); if (!el) return;
      const sig = document.getElementById("sigProw");
      if (_fcAtBottom(el) || !sig) { el.scrollTo({ top: 0, behavior: "smooth" }); return; }   // 이미 아래 → 차트로(위로)
      const off = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--fs-phead-h")) || 46;
      const target = el.scrollTop + (sig.getBoundingClientRect().top - el.getBoundingClientRect().top) - off - 18;   // 현재 위치 기준(offsetParent 무관)
      el.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    };
    window.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("chart-fs")) toggleChartFS(); });
    function _fsRefit() { try { _fsSyncHeadH(); if (typeof fitPrediction === "function") fitPrediction(); else if (typeof redrawCharts === "function") redrawCharts(); } catch (e) { if (typeof redrawCharts === "function") redrawCharts(); } }
    document.addEventListener("fullscreenchange", () => { setTimeout(_fsRefit, 110); });   // 전체화면 진입/해제 → 예측 재프레이밍(세로 y스케일 + 하단 x축)
    const exp = document.getElementById("fcExpand"); if (exp) exp.addEventListener("click", toggleChartFS);
    const heroImg = document.getElementById("fcHeroImg"); if (heroImg) heroImg.addEventListener("click", open);
  })();

  /* 마우스+터치 공용 호버 바인딩(터치=드래그 스크럽, touch-action:none로 스크롤 차단) */
  function bindTouchHover(el, show, hide) {
    const mob = () => window.innerWidth <= 860;
    el.style.touchAction = mob() ? "pan-y" : "none";   // 모바일: 세로 스크롤 허용(크로스헤어 스크럽은 비활성)
    el.addEventListener("touchstart", e => { if (mob()) return; const t = e.touches && e.touches[0]; if (t) show(t.clientX, t.clientY); }, { passive: true });
    el.addEventListener("touchmove", e => { if (mob()) return; const t = e.touches && e.touches[0]; if (t) { show(t.clientX, t.clientY); if (e.cancelable) e.preventDefault(); } }, { passive: false });
    el.addEventListener("touchend", hide);
    el.addEventListener("touchcancel", hide);
  }
  /* ── 콘 호버 툴팁: 마우스 위치의 시점 예측가/변화/범위 ── */
  (function initConeHover() {
    const host = document.getElementById("fcHeroImg"); if (!host) return;
    const hide = () => { const t = document.getElementById("fcConeTip"), v = document.getElementById("fcConeVline"); if (t) t.style.display = "none"; if (v) v.style.display = "none"; };
    const show = (clientX, clientY) => {
      const cone = document.getElementById("fcCone"), g = cone && cone._coneGeo;
      const tip = document.getElementById("fcConeTip"), vline = document.getElementById("fcConeVline");
      if (!g || !g.path || !g.path.length || !tip) { hide(); return; }
      const rect = host.getBoundingClientRect();
      const cw = cone.clientWidth || rect.width, sx = cw ? rect.width / cw : 1;
      const x = (clientX - rect.left) / (sx || 1);
      if (x < g.nowX - 2 || x > g.rightX + 2) { hide(); return; }
      const frac = (x - g.nowX) / ((g.rightX - g.nowX) || 1);
      let k = Math.round(frac * (g.path.length - 1)); k = Math.max(0, Math.min(g.path.length - 1, k));
      const price = g.path[k], lo = g.lo && g.lo[k], hi = g.hi && g.hi[k], anchor = g.anchorP;
      const chg = anchor ? (price - anchor) / anchor * 100 : 0;
      const col = chg > 0.3 ? "var(--bull)" : chg < -0.3 ? "var(--bear)" : "var(--eth)";
      const mx = g.nowX + (g.path.length > 1 ? k / (g.path.length - 1) : 0) * (g.rightX - g.nowX);
      if (vline) { vline.style.display = "block"; vline.style.left = (mx * sx) + "px"; vline.style.top = (g.oy * sx) + "px"; vline.style.height = (g.dh * sx) + "px"; }
      const band = (isFinite(lo) && isFinite(hi)) ? `<span class="ct-band">${_hzFmt(lo)} ~ ${_hzFmt(hi)}</span>` : "";
      tip.innerHTML = `<span class="ct-t">+${k + 1}${g.unit}</span><span class="ct-v">${_hzFmt(price)}</span><span class="ct-chg" style="color:${col}">${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%</span>${band}`;
      tip.style.display = "block";
      const tw = tip.offsetWidth, th = tip.offsetHeight, rx = clientX - rect.left, ry = clientY - rect.top;
      let lx = rx + 14; if (lx + tw > rect.width - 4) lx = rx - tw - 14; if (lx < 4) lx = 4;
      let ly = ry - th - 10; if (ly < 4) ly = ry + 16;
      tip.style.left = lx + "px"; tip.style.top = ly + "px";
    };
    host.addEventListener("mouseleave", hide);
    host.addEventListener("mousemove", e => show(e.clientX, e.clientY));
    bindTouchHover(host, show, hide);
  })();

  /* ── 연속 차트(메인) 호버 툴팁: 과거가/예측가 동시 지원 ── */
  (function initMainHover() {
    const cv = document.getElementById("fcMainChart"); if (!cv) return;
    const hero = cv.parentElement;
    const hide = () => { ["fcMainTip", "fcMainVline", "fcMainHline", "fcMainYlab"].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = "none"; }); };
    const show = (clientX, clientY) => {
      if (_heroZoomDragging) { hide(); return; }
      const g = cv._mainGeo, tip = document.getElementById("fcMainTip"), vline = document.getElementById("fcMainVline");
      if (!g || !tip) { hide(); return; }
      const rect = cv.getBoundingClientRect();
      const cwid = cv.clientWidth || rect.width, sx = cwid ? rect.width / cwid : 1;
      const rawX = (clientX - rect.left) / (sx || 1);
      const x = _heroZoom.s > 1.0001 ? (rawX - _heroZoom.tx) / _heroZoom.s : rawX;
      if (x < g.padX || x > g.padX + g.plotW) { hide(); return; }
      let isFut = false, k = 0, i = 0, price, lo, hi, label = "", chg = null, snapX;
      if (x <= g.seamX && g.histLen > 1) {
        i = Math.round((x - g.padX) / (g.histW || 1) * (g.histLen - 1)); i = Math.max(0, Math.min(g.histLen - 1, i));
        price = g.hist[i]; const ago = g.histLen - 1 - i; label = _axisFullDate(g.start + i, g.winN) || (ago === 0 ? "현재" : "과거 " + ago + g.unit + " 전");
        snapX = g.padX + (i / (g.histLen - 1)) * g.histW;
      } else if (g.pathLen > 0) {
        isFut = true; k = Math.round((x - g.seamX) / ((g.plotW - g.histW) || 1) * g.pathLen - 1); k = Math.max(0, Math.min(g.pathLen - 1, k));
        price = g.path[k]; lo = g.lo[k]; hi = g.hi[k]; label = "+" + (k + 1) + g.unit;
        chg = g.anchor ? (price - g.anchor) / g.anchor * 100 : 0;
        snapX = g.seamX + ((k + 1) / Math.max(1, g.pathLen)) * (g.plotW - g.histW);
      } else { hide(); return; }
      const hr = hero.getBoundingClientRect(), offX = rect.left - hr.left, offY = rect.top - hr.top;
      const vSnap = (snapX * _heroZoom.s + _heroZoom.tx) * sx;
      const vTop = (g.padTop * _heroZoom.s + _heroZoom.ty) * sx;
      const vH = (g.ch - g.padTop - g.padBot) * _heroZoom.s * sx;
      if (vline) { vline.style.display = "block"; vline.style.left = (offX + vSnap) + "px"; vline.style.top = (offY + vTop) + "px"; vline.style.height = vH + "px"; }
      // 가로 십자선 + 세로축 가격(마우스 Y 위치의 가격)
      const hline = document.getElementById("fcMainHline"), ylab = document.getElementById("fcMainYlab");
      const syR = (cv.clientHeight && rect.height) ? rect.height / cv.clientHeight : 1;
      let yLog = _heroZoom.s > 1.0001 ? ((clientY - rect.top) / (syR || 1) - _heroZoom.ty) / _heroZoom.s : (clientY - rect.top) / (syR || 1);
      yLog = Math.max(g.padTop, Math.min(g.ch - g.padBot, yLog));
      const _plotH = g.ch - g.padTop - g.padBot, _frac = 1 - (yLog - g.padTop) / (_plotH || 1);
      const _loL = tvLog(g.loV, g.log), _hiL = tvLog(g.hiV, g.log), _vL = _loL + _frac * (_hiL - _loL);
      const yPrice = g.log ? Math.exp(_vL) : _vL;
      const hY = (yLog * _heroZoom.s + _heroZoom.ty) * syR;
      const hL = (g.padX * _heroZoom.s + _heroZoom.tx) * sx, hR = ((g.padX + g.plotW) * _heroZoom.s + _heroZoom.tx) * sx;
      if (hline) { hline.style.display = "block"; hline.style.left = (offX + hL) + "px"; hline.style.top = (offY + hY) + "px"; hline.style.width = Math.max(0, hR - hL) + "px"; }
      if (ylab) { ylab.style.display = "block"; ylab.textContent = _hzFmt(yPrice); ylab.style.left = (offX + hR + 3) + "px"; ylab.style.top = (offY + hY) + "px"; }
      let inner = `<span class="ct-t">${label}</span><span class="ct-v">${_hzFmt(price)}</span>`;
      if (chg != null) { const col = chg > 0.3 ? "var(--bull)" : chg < -0.3 ? "var(--bear)" : "var(--eth)"; inner += `<span class="ct-chg" style="color:${col}">${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%</span>`; }
      if (isFinite(lo) && isFinite(hi)) inner += `<span class="ct-band">${_hzFmt(lo)} ~ ${_hzFmt(hi)}</span>`;
      tip.innerHTML = inner; tip.style.display = "block";
      const tw = tip.offsetWidth, th = tip.offsetHeight, rx = clientX - hr.left, ry = clientY - hr.top;
      let lx = rx + 14; if (lx + tw > hr.width - 4) lx = rx - tw - 14; if (lx < 4) lx = 4;
      let ly = ry - th - 10; if (ly < 4) ly = ry + 16;
      tip.style.left = lx + "px"; tip.style.top = ly + "px";
    };
    cv.addEventListener("mouseleave", hide);
    cv.addEventListener("mousemove", e => show(e.clientX, e.clientY));
    bindTouchHover(cv, show, hide);
  })();

  /* ── Hero 휠줌 + 드래그팬 + 더블클릭 리셋 ──────────────────── */
  (function heroZoomInit() {
    const cv = document.getElementById("fcMainChart"); if (!cv) return;
    cv.addEventListener("wheel", e => {
      e.preventDefault();
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo; if (!g) return;
      const N = g.winN || 0; if (N < 2) return;
      const r = cv.getBoundingClientRect(), cx = e.clientX - r.left;
      // 커서 아래 윈도 봉 인덱스(절대)
      const rel = Math.max(0, Math.min(1, (cx - g.padX) / (g.histW || 1)));
      const bi = g.start + Math.round(rel * (g.count - 1));
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;          // 휠업=줌인(봉 수 감소)
      let nc = Math.round(_chartWin.count * factor);
      nc = Math.max(20, Math.min(N, nc));
      let ns = Math.round(bi - rel * (nc - 1));
      ns = Math.max(0, Math.min(N - nc, ns));
      _chartWin.count = nc; _chartWin.start = ns; _chartNav = true; renderHeroZoom();
    }, { passive: false });
    let hDrag = null;
    // 모바일 두 손가락 핀치 = 가로 확대/축소(보이는 봉 수 조절, 중앙 봉 고정) — 휠 줌과 동일 메커니즘
    let _pinch = null;
    cv.addEventListener("touchstart", e => {
      if (window.innerWidth <= 860 && _chartLock) return;   // 모바일 잠금 시 핀치 비활성(스크롤)
      if (e.touches.length === 2) {
        const g = cv._mainGeo; if (!g) return;
        const a = e.touches[0], b = e.touches[1], dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const r = cv.getBoundingClientRect(), cx = (a.clientX + b.clientX) / 2 - r.left;
        const rel = Math.max(0, Math.min(1, (cx - g.padX) / (g.histW || 1)));
        _pinch = { dist0: Math.max(1, dist), count0: _chartWin.count, rel, bi: g.start + Math.round(rel * (g.count - 1)) };
        hDrag = null; _heroZoomDragging = true; _chartNav = true;
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });
    cv.addEventListener("touchmove", e => {
      if (!_pinch || e.touches.length !== 2) return;
      const g = cv._mainGeo; if (!g) return; const N = g.winN || 0; if (N < 2) return;
      const a = e.touches[0], b = e.touches[1], dist = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
      const ratio = _pinch.dist0 / dist;                      // 벌리면 dist↑ → ratio<1 → 봉수 감소 = 줌인
      const nc = Math.max(20, Math.min(N, Math.round(_pinch.count0 * ratio)));
      const ns = Math.max(0, Math.min(N - nc, Math.round(_pinch.bi - _pinch.rel * (nc - 1))));
      _chartWin.count = nc; _chartWin.start = ns; _chartNav = true; renderHeroZoom();
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const _pinchEnd = e => { if (!e.touches || e.touches.length < 2) { _pinch = null; setTimeout(() => { _heroZoomDragging = false; }, 60); } };
    cv.addEventListener("touchend", _pinchEnd); cv.addEventListener("touchcancel", _pinchEnd);
    cv.addEventListener("pointerdown", e => {
      if (_pinch) return;   // 핀치 중엔 단일 포인터 팬 무시
      if (e.pointerType === "touch" && window.innerWidth <= 860 && _chartLock) return;   // 모바일 잠금 시 팬/축드래그 비활성(스크롤)
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo; if (!g) return;
      const r = cv.getBoundingClientRect(), cx = e.clientX - r.left;
      // 범례 클릭 안정화: 범례 항목 위에서 눌렀으면 팬/축드래그 시작 안 함 → click이 그대로 발화(오작동 방지)
      { const _llx = ((e.clientX - r.left) - _heroZoom.tx) / _heroZoom.s, _lly = ((e.clientY - r.top) - _heroZoom.ty) / _heroZoom.s;
        for (const hgt of _legendHits) { if (_llx >= hgt.x && _llx <= hgt.x + hgt.w && _lly >= hgt.y && _lly <= hgt.y + hgt.h) { hDrag = null; return; } } }
      if (cx > g.plotRight) {   // 우측 y축 스트립 → 가격축 수동 스케일(커서 가격 고정 앵커)
        const cy = e.clientY - r.top, plotH0 = Math.max(1, g.ch - g.padTop - g.padBot);
        const lg0 = x => g.log ? Math.log(Math.max(1e-9, x)) : x, inv0 = x => g.log ? Math.exp(x) : x;
        const _lo0 = lg0(g.loV), _hi0 = lg0(g.hiV), fracTop = Math.min(1, Math.max(0, (cy - g.padTop) / plotH0));
        const pa = inv0(_lo0 + (1 - fracTop) * (_hi0 - _lo0));   // 커서 아래 가격(스케일 중 고정)
        hDrag = { mode: "yscale", y: e.clientY, lo: g.loV, hi: g.hiV, log: g.log, pa, moved: false };
      } else if ((e.clientY - r.top) > g.ch - g.padBot) {   // 하단 시간축 스트립 → 가로 배율(기간 폭) 조정(커서 봉 고정)
        const rel = Math.max(0, Math.min(1, (cx - g.padX) / (g.histW || 1)));
        const bi = g.start + Math.round(rel * (g.count - 1));
        hDrag = { mode: "xscale", x: e.clientX, count0: g.count, rel, bi, moved: false };
      } else {                  // 플롯 영역 → 2D 패닝(가로=시간 · 세로=가격)
        hDrag = { mode: "time", x: e.clientX, y: e.clientY, start: _chartWin.start, moved: false,
                  barW: (g.histW || 1) / Math.max(1, g.count),
                  loV: g.loV, hiV: g.hiV, plotH: Math.max(1, g.ch - g.padTop - g.padBot), log: g.log };
      }
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cv.addEventListener("pointermove", e => {
      if (!hDrag) {   // 호버 커서 힌트: y축 스트립=세로 스케일(↕) · 하단 시간축=가로 배율(↔) · 플롯=이동(grab)
        const g = cv._mainGeo;
        if (g) { const r = cv.getBoundingClientRect(), cxh = e.clientX - r.left, cyh = e.clientY - r.top; cv.style.cursor = (cxh > g.plotRight) ? "ns-resize" : (cyh > g.ch - g.padBot) ? "ew-resize" : "grab"; }
        return;
      }
      if (hDrag.mode === "xscale") {   // 하단 시간축 드래그 = 가로 배율(오른쪽=확대·왼쪽=축소, 커서 봉 고정)
        const dx = e.clientX - hDrag.x;
        if (Math.abs(dx) > 4) { hDrag.moved = true; _heroZoomDragging = true; _chartNav = true; }
        if (!hDrag.moved) return;
        const g2 = cv._mainGeo; if (!g2) return; const N = g2.winN || 0; if (N < 2) return;
        const k = Math.exp(-dx / 220);
        const nc = Math.max(20, Math.min(N, Math.round(hDrag.count0 * k)));
        const ns = Math.max(0, Math.min(N - nc, Math.round(hDrag.bi - hDrag.rel * (nc - 1))));
        _chartWin.count = nc; _chartWin.start = ns; renderHeroZoom();
        return;
      }
      if (hDrag.mode === "yscale") {
        const dy = e.clientY - hDrag.y;
        if (Math.abs(dy) > 4) { hDrag.moved = true; _heroZoomDragging = true; }
        if (!hDrag.moved) return;
        // 커서 가격(pa)을 고정하고 확대/축소 — 로그/선형 공용. 아래로=확대·위로=축소.
        const lg = x => hDrag.log ? Math.log(Math.max(1e-9, x)) : x, inv = x => hDrag.log ? Math.exp(x) : x;
        const sA = lg(hDrag.pa), sLo0 = lg(hDrag.lo), sHi0 = lg(hDrag.hi), k = Math.exp(dy / 240);   // 완만하게(급격한 줌아웃 방지)
        const nLo = sA - (sA - sLo0) * k, nHi = sA + (sHi0 - sA) * k;
        if (nHi - nLo < 1e-9) { renderHeroZoom(); return; }
        _yScale = { mode: "manual", lo: inv(nLo), hi: inv(nHi) };
        renderHeroZoom();
        return;
      }
      const dx = e.clientX - hDrag.x, dy = e.clientY - hDrag.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) { hDrag.moved = true; _heroZoomDragging = true; _chartNav = true; }
      if (!hDrag.moved) return;
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo; if (!g) return;
      const N = g.winN || 0, dBars = Math.round(-dx / (hDrag.barW || 1));
      _chartWin.start = Math.max(0, Math.min(N - _chartWin.count, hDrag.start + dBars));
      /* 세로 패닝: 드래그 방향으로 가격축 평행이동(로그/선형 공용). 아래로 끌면 콘텐츠가 아래로. */
      if (isFinite(hDrag.loV) && isFinite(hDrag.hiV) && hDrag.hiV > hDrag.loV) {
        const _lg = x => hDrag.log ? Math.log(Math.max(1e-9, x)) : x;
        const _inv = x => hDrag.log ? Math.exp(x) : x;
        const sLo = _lg(hDrag.loV), sHi = _lg(hDrag.hiV);
        const shift = (dy / hDrag.plotH) * (sHi - sLo);
        _yScale = { mode: "manual", lo: _inv(sLo + shift), hi: _inv(sHi + shift) };
      }
      renderHeroZoom();
    });
    const endDrag = () => { hDrag = null; _heroZoomDragging = false; };
    cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
    let _legendClickT = null;
    cv.addEventListener("dblclick", e => {
      const r = cv.getBoundingClientRect();
      // 범례 항목 더블클릭 = 단독 보기(대기중 단일클릭 토글 취소)
      { const lx = ((e.clientX - r.left) - _heroZoom.tx) / _heroZoom.s, ly = ((e.clientY - r.top) - _heroZoom.ty) / _heroZoom.s;
        for (const hgt of _legendHits) {
          if (lx >= hgt.x && lx <= hgt.x + hgt.w && ly >= hgt.y && ly <= hgt.y + hgt.h) {
            if (hgt.key && hgt.key !== "__toggle__") { clearTimeout(_legendClickT); _focusInd = (_focusInd === hgt.key) ? null : hgt.key; if (_focusInd) { _evVisible.add(_focusInd); _flashPanelFor(_focusInd); } drawEvidence(); }
            return;
          }
        } }
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo;
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      if (g && cx > g.plotRight) { resetYScale(); }             // y축 더블클릭 → 자동 스케일
      else if (g && cy > g.ch - g.padBot) { resetChartWin(); }  // 시간축 더블클릭 → 기간 창 리셋
      else { resetChartWin(); resetYScale(); }                  // 플롯 더블클릭 → 윈도+세로 스케일 전체 리셋
      renderHeroZoom();
    });
    cv.addEventListener("click", e => {
      if (_heroZoomDragging) return;
      const r = cv.getBoundingClientRect();
      const lx = ((e.clientX - r.left) - _heroZoom.tx) / _heroZoom.s;
      const ly = ((e.clientY - r.top) - _heroZoom.ty) / _heroZoom.s;
      for (const hgt of _legendHits) {
        if (lx >= hgt.x && lx <= hgt.x + hgt.w && ly >= hgt.y && ly <= hgt.y + hgt.h) {
          if (typeof hgt.key === "undefined") return;
          if (hgt.key === "__toggle__") { _legendCollapsed = !_legendCollapsed; _evHover = null; drawEvidence(); return; }   // 범례 접기/펼치기
          if (hgt.key === null) { clearTimeout(_legendClickT); _evVisible = new Set(Object.keys(EV_COLORS)); _focusInd = null; drawEvidence(); return; }   // 전체 표시(포커스 해제)
          // 지표: 단일클릭=표시 토글(체크박스). 더블클릭이면 취소되고 단독보기. 230ms 지연으로 구분.
          const _lk = hgt.key; clearTimeout(_legendClickT);
          _legendClickT = setTimeout(() => { _focusInd = null; if (_evVisible.has(_lk)) _evVisible.delete(_lk); else { _evVisible.add(_lk); _flashPanelFor(_lk); } drawEvidence(); }, 230);
          return;
        }
      }
    });
    cv.addEventListener("mousemove", e => {   // 범례 위에 올리면 해당 지표 단독 강조(프리뷰)
      if (_heroZoomDragging) return;
      const r = cv.getBoundingClientRect();
      const lx = ((e.clientX - r.left) - _heroZoom.tx) / _heroZoom.s, ly = ((e.clientY - r.top) - _heroZoom.ty) / _heroZoom.s;
      let hov = null;
      for (const hgt of _legendHits) { if (lx >= hgt.x && lx <= hgt.x + hgt.w && ly >= hgt.y && ly <= hgt.y + hgt.h) { hov = hgt.key; break; } }
      if (hov === "__toggle__") hov = null;   // 토글 버튼은 포커스 대상 아님(전체 숨김 방지)
      if (hov !== _evHover) { _evHover = hov; drawEvidence(); }
    });
    cv.addEventListener("mouseleave", () => { if (_evHover !== null) { _evHover = null; drawEvidence(); } });
  })();
  (function() {
    const a = document.getElementById("autoBtn");   // A=매번 세로축을 보이는 캔들에 재맞춤(누를 때마다 강제 재적용)
    if (a) a.addEventListener("click", () => {
      resetYScale(); _chartNav = false; _heroZoomDragging = false; resetHeroView();
      renderHeroZoom();
      a.classList.add("flash"); setTimeout(() => a.classList.remove("flash"), 200);
    });
    const l = document.getElementById("logBtn"); if (l) l.addEventListener("click", () => { toggleLogChart(); });
  })();
  /* ── 시연 오버레이 제어: 상단 HUD(접기·드래그이동·숨김) + 하단 로그(접기) ── */
  let _playHudUserCollapsed = false;   // 사용자가 명시적으로 접어둔 경우 true → 시뮬레이션 자동 펼침 제외
  (function initPlayOverlayCtl() {
    const hud = document.getElementById("playHud");
    if (hud) {
      const min = document.getElementById("playHudMin"), cls = document.getElementById("playHudClose");
      if (min) min.addEventListener("click", () => { hud.classList.toggle("collapsed"); const c = hud.classList.contains("collapsed"); min.textContent = c ? "+" : "–"; _playHudUserCollapsed = c; });
      hud.classList.add("on", "collapsed"); if (min) min.textContent = "+";   // 기본: 표시 + 접힘(헤더만) — 시뮬레이션 시 진행로그 자동 펼침
      if (typeof _restoreHudPos === "function") _restoreHudPos("scoopforge_hud_play", hud);
    }
    // 자주 쓰는 프리셋 = 기본 닫힘(숨김). 지표 레일 '프리셋' 버튼으로 열기(_toggleRailPreset가 렌더)
    {
      const bar = document.getElementById("playHudCtl"), pane = document.getElementById("chartPane");
      let d = null;
      if (bar && pane) {
        bar.addEventListener("pointerdown", e => {
          if (e.target.closest(".ph-btn")) return;   // 버튼 클릭은 드래그로 취급 안 함
          const hr = hud.getBoundingClientRect();
          d = { dx: e.clientX - hr.left, dy: e.clientY - hr.top };
          try { bar.setPointerCapture(e.pointerId); } catch (_) {}
          e.preventDefault();
        });
        bar.addEventListener("pointermove", e => {
          if (!d) return;
          const x = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - d.dx));
          const y = Math.max(0, Math.min(window.innerHeight - 28, e.clientY - d.dy));
          hud.style.left = x + "px"; hud.style.top = y + "px"; hud.style.right = "auto";
        });
        const up = e => { if (!d) return; d = null; try { bar.releasePointerCapture(e.pointerId); } catch (_) {} _saveHudPos("scoopforge_hud_play", hud); };
        bar.addEventListener("pointerup", up); bar.addEventListener("pointercancel", up);
      }
    }
    const lmin = document.getElementById("analyzeLogMin"), log = document.getElementById("analyzeLog");
    if (lmin && log) lmin.addEventListener("click", () => { log.classList.toggle("collapsed"); lmin.textContent = log.classList.contains("collapsed") ? "+" : "–"; });
    const lctl = document.getElementById("analyzeLogCtl");
    if (lctl && log) {
      let ld = null;
      lctl.addEventListener("pointerdown", e => { if (e.target.closest(".ph-btn")) return; const hr = log.getBoundingClientRect(); ld = { dx: e.clientX - hr.left, dy: e.clientY - hr.top }; try { lctl.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
      lctl.addEventListener("pointermove", e => { if (!ld) return; const x = Math.max(4, Math.min(window.innerWidth - 80, e.clientX - ld.dx)); const y = Math.max(4, Math.min(window.innerHeight - 40, e.clientY - ld.dy)); log.style.left = x + "px"; log.style.top = y + "px"; log.style.right = "auto"; log.style.bottom = "auto"; });
      const lup = e => { if (!ld) return; ld = null; try { lctl.releasePointerCapture(e.pointerId); } catch (_) {} _saveHudPos("scoopforge_hud_log", log); };
      lctl.addEventListener("pointerup", lup); lctl.addEventListener("pointercancel", lup);
    }
  })();

  (function initGutter() {
    const split = document.querySelector(".forge-split");
    const gutter = document.getElementById("forgeGutter");
    const chart = document.getElementById("chartPane");
    if (!split || !gutter || !chart) return;
    const DEFW = 560, MINB = 320, MINC = 340;
    const board = document.getElementById("boardPane");
    let saved = null; try { saved = localStorage.getItem("scoopforge_board_w"); } catch (_) {}
    // 매트릭스가 겹치지 않게 최소 폭 확보 — 과거에 저장된 좁은 값(<620px)은 무시하고 기본(넓게) 사용
    if (saved && parseInt(saved, 10) >= 380 && parseInt(saved, 10) <= 760 && board) board.style.flexBasis = saved;
    let dragging = false;
    function persist() { try { if (board) localStorage.setItem("scoopforge_board_w", board.style.flexBasis || (DEFW + "px")); } catch (_) {} }
    gutter.addEventListener("pointerdown", e => { dragging = true; gutter.classList.add("dragging"); try { gutter.setPointerCapture(e.pointerId); } catch (_) {} document.body.style.userSelect = "none"; e.preventDefault(); });
    gutter.addEventListener("pointermove", e => {
      if (!dragging || !board) return;
      const r = split.getBoundingClientRect();
      const maxB = r.width - MINC - 7;
      const w = Math.max(MINB, Math.min(maxB, e.clientX - r.left));
      board.style.flexBasis = w + "px"; redrawCharts();
    });
    function end(e) { if (!dragging) return; dragging = false; gutter.classList.remove("dragging"); try { gutter.releasePointerCapture(e.pointerId); } catch (_) {} document.body.style.userSelect = ""; persist(); redrawCharts(); }
    gutter.addEventListener("pointerup", end);
    gutter.addEventListener("pointercancel", end);
    gutter.addEventListener("dblclick", () => { if (board) board.style.flexBasis = DEFW + "px"; persist(); redrawCharts(); });
  })();

  /* ── 차트 높이 조절(세로 거터): 가격차트를 키우고 아래 패널을 내림 ── */
  let _heroManual = false;   // 사용자가 거터로 직접 조절했는지(true면 자동맞춤 중단)
  function fitHeroHeight(redraw) {   // 차트가 세로 여백을 채우도록 --hero-h 자동 산정(x축이 하단에 오게)
    if (redraw === undefined) redraw = true;
    if (_heroManual) return;
    if (document.body.classList.contains("chart-fs")) return;   // 전체화면은 flex로 채움 — --hero-h 건드리지 않음(해제 시 메인 레이아웃 유지)
    const wrap = document.querySelector(".fc-wrap"), hero = document.querySelector(".fc-hero");
    const panel = hero && hero.closest(".fc-panel-hero");
    if (!wrap || !hero || !panel || getComputedStyle(hero).flexDirection === "column") return;   // 모바일(세로스택)은 제외
    let others = 0;
    [].forEach.call(wrap.children, c => { if (c !== panel) others += Math.ceil(c.getBoundingClientRect().height); });
    const nonHero = Math.ceil(panel.getBoundingClientRect().height - hero.getBoundingClientRect().height);   // 헤더+판정+패딩
    const avail = wrap.clientHeight - others - nonHero - 10;
    const floor = Math.round(wrap.clientHeight * 0.56);   // 차트 최소 지분 — 기본 높이 확대(아래 지표신호·패널은 스크롤 허용)
    const h = Math.max(320, floor, Math.min(1600, Math.round(avail)));
    const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hero-h")) || 0;
    if (Math.abs(cur - h) < 3) return;   // 변화 없으면 무시(리드로우 루프 방지)
    document.documentElement.style.setProperty("--hero-h", h + "px");
    if (redraw && typeof redrawCharts === "function") redrawCharts();
  }
  window.fitHeroHeight = fitHeroHeight;
  (function initVGutter() {
    const g = document.getElementById("fcVGutter"), hero = document.querySelector(".fc-hero");
    if (!g || !hero) return;
    const DEF = 440, MIN = 200, MAX = 1600;
    let drag = null;
    const curH = () => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hero-h")); return isFinite(v) ? v : (hero.getBoundingClientRect().height || DEF); };
    g.addEventListener("pointerdown", e => { drag = { y: e.clientY, h: curH() }; _heroManual = true; g.classList.add("dragging"); try { g.setPointerCapture(e.pointerId); } catch (_) {} document.body.style.userSelect = "none"; e.preventDefault(); });
    g.addEventListener("pointermove", e => {
      if (!drag) return;
      const h = Math.max(MIN, Math.min(MAX, drag.h + (e.clientY - drag.y)));
      document.documentElement.style.setProperty("--hero-h", h + "px");
      redrawCharts();
    });
    const end = e => { if (!drag) return; drag = null; g.classList.remove("dragging"); try { g.releasePointerCapture(e.pointerId); } catch (_) {} document.body.style.userSelect = ""; redrawCharts(); };
    g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end);
    g.addEventListener("dblclick", () => { _heroManual = false; fitHeroHeight(); });   // 더블클릭 = 자동맞춤 복귀
    // 초기 + 리사이즈 시 자동 맞춤
    let _rt; window.addEventListener("resize", () => { clearTimeout(_rt); _rt = setTimeout(fitHeroHeight, 120); });
    setTimeout(fitHeroHeight, 260); setTimeout(fitHeroHeight, 900);
  })();

  /* ── 결과 패널 개별 높이 조절(.fc-rgutter — 위 패널 리사이즈) ── */
  (function initPanelGutters() {
    const wrap = document.querySelector(".fc-wrap"); if (!wrap) return;
    let drag = null;
    wrap.addEventListener("pointerdown", e => {
      const g = e.target.closest(".fc-rgutter"); if (!g) return;
      const panel = g.previousElementSibling; if (!panel || !panel.classList.contains("fc-panel")) return;
      drag = { y: e.clientY, h: panel.getBoundingClientRect().height, panel, g };
      panel.classList.add("fc-sized"); panel.style.height = drag.h + "px";
      g.classList.add("dragging"); try { g.setPointerCapture(e.pointerId); } catch (_) {} document.body.style.userSelect = "none"; e.preventDefault();
    });
    wrap.addEventListener("pointermove", e => {
      if (!drag) return;
      const h = Math.max(80, Math.min(820, drag.h + (e.clientY - drag.y)));
      drag.panel.style.height = h + "px";
    });
    const end = e => { if (!drag) return; drag.g.classList.remove("dragging"); try { drag.g.releasePointerCapture(e.pointerId); } catch (_) {} drag = null; document.body.style.userSelect = ""; };
    wrap.addEventListener("pointerup", end); wrap.addEventListener("pointercancel", end);
    wrap.addEventListener("dblclick", e => {
      const g = e.target.closest(".fc-rgutter"); if (!g) return;
      const panel = g.previousElementSibling; if (panel && panel.classList.contains("fc-panel")) { panel.classList.remove("fc-sized"); panel.style.height = ""; }
    });
  })();

  // 백테스트 검증 성적(정직 공개용 — backtest/backtest-report.json 스냅샷 요약. 재측정 시 갱신)
  const BACKTEST_SUMMARY = {
    universe: "86개 시계열(54종목 × 일·주·월 · 크립토·상품·한국 포함) · 약 31,500 시점 · walk-forward(미래 미참조)",
    direction: { hit: 0.581, baseline: 0.608 },
    rel: { hit: 0.54, note: "시장(SPY) 대비 아웃퍼폼 — base ~48%인 공정한 방향 질문. 자명규칙(±모멘텀·±지속성) 최강치 대비 +2.2~2.4pp·전/후반 양수·종목외 유지(미국주식 30종·11년, rel-lab)" },
    coneCoverage: 0.78, coneTarget: 0.80, ece: 0.019,
    strength: "지지반등 신호(횡보장 바닥+RSI반등+200MA 비하락+낙폭5%) = 검증된 유일한 edge: 승률 54.3%·평균 +1.7%/회(20봉)~+3.6%(40봉)로 랜덤 크게 초과(2064건, 54종). 하락추세·얕은눌림 배제. '방향 예측'이 아니라 박스권 매수 타이밍.",
    disclaimer: "과거 데이터 시뮬레이션 결과로 미래 수익·정확성을 보장하지 않음 · 투자 권유·자문 아님(투자자문업 미등록) · 원금 손실 위험 있음 · 모든 판단과 책임은 이용자 본인 · 참고용",
  };
  function openBacktestCard() {
    let m = document.getElementById("btModal");
    if (!m) { m = document.createElement("div"); m.id = "btModal"; m.className = "bt-modal"; m.addEventListener("pointerdown", e => { m._downBg = (e.target === m); }); m.addEventListener("click", e => { if (e.target === m && m._downBg) closeBacktestCard(); }); document.body.appendChild(m); }
    const S = BACKTEST_SUMMARY, P = x => (x * 100).toFixed(1) + "%";
    m.innerHTML = '<div class="bt-card">' +
      '<div class="bt-head"><b>이 엔진의 검증 성적</b><button class="bt-x" onclick="closeBacktestCard()" aria-label="닫기">✕</button></div>' +
      '<div class="bt-sub">' + S.universe + '</div>' +
      '<div class="bt-rows">' +
      '<div class="bt-row"><span class="bt-k">방향 예측</span><span class="bt-v">' + P(S.direction.hit) + ' <span class="bt-mut">(항상상승 ' + P(S.direction.baseline) + ')</span></span><span class="bt-tag dn">시장 평균 미달</span></div>' +
      '<div class="bt-row"><span class="bt-k">시장 대비 방향</span><span class="bt-v" title="' + S.rel.note + '">' + P(S.rel.hit) + ' <span class="bt-mut">(base ~48% · 자명규칙 +2.2~2.4pp)</span></span><span class="bt-tag up">검증됨 · v1.10</span></div>' +
      '<div class="bt-row"><span class="bt-k">확률 신뢰</span><span class="bt-v">표기=실제 <span class="bt-mut">· ECE ' + (S.ece * 100).toFixed(1) + '%p (Platt 교정·OOS)</span></span><span class="bt-tag up">검증됨</span></div>' +
      '<div class="bt-row"><span class="bt-k">예측 밴드</span><span class="bt-v">커버 ' + P(S.coneCoverage) + ' <span class="bt-mut">(약 ' + P(S.coneTarget) + ' 신뢰구간 · v1.7.1 보정)</span></span><span class="bt-tag up">보정됨</span></div>' +
      '</div>' +
      '<div class="bt-strength"><b>진짜 강점 — 횡보/박스권 평균회귀</b><div class="bt-mut">' + S.strength + '</div><div class="bt-mut">국면 신뢰: 횡보 &gt; 추세장(방향 예측 신뢰 낮음, 추세 순응 권장)</div></div>' +
      '<div class="bt-disc">※ ' + S.disclaimer + '</div>' +
      '<a class="bt-more" href="forge-scorecard.html" target="_blank" rel="noopener">전체 검증 성적 · 방법론 보기 →</a>' +
      '</div>';
    m.classList.add("open");
  }
  function closeBacktestCard() { const m = document.getElementById("btModal"); if (m) m.classList.remove("open"); }

  /* ── renderVerdict: inline signal in chart panel header ────────── */
  function renderVerdict(verdict, fillU) {
    const el = document.getElementById("verdictInline");
    if (!el || !verdict) return;
    const REGIME_LABEL = { bull: "상승", bear: "하락", neutral: "중립" };
    const REGIME_COL = { bull: "var(--bull)", bear: "var(--bear)", neutral: "var(--eth)" };
    const regime = verdict.regime || "neutral";
    const col = REGIME_COL[regime] || "var(--eth)", label = REGIME_LABEL[regime] || "중립";
    // 시연: 국면·확률·시그널·목표가가 중립/현재가에서 최종으로 단조 충전(u)
    const u = (fillU == null || !isFinite(fillU)) ? 1 : Math.max(0, Math.min(1, fillU));
    const _anchor = (lastResult && lastResult.prediction && isFinite(lastResult.prediction.anchor)) ? lastResult.prediction.anchor : null;
    const _scoreN = (typeof verdict.score === "number" && isFinite(verdict.score)) ? verdict.score * u : null;
    const score = (_scoreN != null) ? _scoreN.toFixed(1) : "—";
    const _targetN = (isFinite(verdict.target) && _anchor != null) ? _anchor + (verdict.target - _anchor) * u : verdict.target;
    const fmt = v => (typeof v === "number" && isFinite(v)) ? v.toFixed(2) : "—";
    const _upF = (typeof aggUpProb === "function") ? aggUpProb(lastResult && lastResult.prediction) : null;
    const _up = (_upF != null) ? Math.round(_upF * u) : null;
    if (u >= 1 && _up != null) { const _ad = activeDoc(); if (_ad) { _ad._verdict = { regime, up: _up };
      try { const _px = (lastResult && lastResult.prediction && lastResult.prediction.anchor), _ps = ((_fcLastData && _fcLastData.price) || []); if (isFinite(_px)) _ad._px = _px; if (_ps.length >= 2 && _ps[_ps.length - 2]) _ad._chg = (_ps[_ps.length - 1] - _ps[_ps.length - 2]) / _ps[_ps.length - 2] * 100; } catch (e) {}
      if (typeof renderSidebar === "function") renderSidebar(); } }   // 종목 목록 미니판정·현재가·변화율 갱신
    el.innerHTML =
      `국면 <b style="color:${col}">${label}</b>` +
      (_up != null ? ` · <b style="color:var(--bull)">▲${_up}%</b> <b style="color:var(--bear)">▼${100 - _up}%</b>` : "") +
      ` · 시그널 <b style="color:${col}">${score}</b>`;
    el.title = "국면 " + label + " · 상승확률 " + (_up != null ? _up + "% / 하락 " + (100 - _up) + "%" : "—") + " · 시그널 " + score + " · 목표 " + fmt(_targetN);
    // 강조 바 + 핵심 의견 한 줄
    const bar = document.getElementById("fcVerdictBar");
    if (bar) {
      bar.style.display = "flex";
      const op = verdictOpinion(verdict, _up);
      const arrow = regime === "bull" ? "▲" : regime === "bear" ? "▼" : "▸";
      const _tk = boardState.nodes.find(n => n.blockType === "ticker" && n.params && (n.params.symbol || "").trim());
      const _sym = _tk ? _tk.params.symbol.trim() : "";
      const tkLabel = _sym ? esc(_tk.params.name ? _tk.params.name + " · " + _sym.toUpperCase() : _sym.toUpperCase()) : "";
      // 지표 방향 분포(도미넌스 스타일 누적 바) — 상승/중립/하락 지표 수
      let _bd = "";
      try {
        const _P = ((_fcLastData && _fcLastData.price) || (typeof currentData === "function" && currentData().price) || []);
        const _inds = (typeof evIndicatorNodes === "function") ? evIndicatorNodes() : [];
        if (_P.length >= 2 && _inds.length) {
          let bl = 0, ne = 0, be = 0;
          _inds.forEach(nn => { const b = _nodeBias(nn, _P); if (b > 0.05) bl++; else if (b < -0.05) be++; else ne++; });
          // (스택바 fcv-break 제거 — 아래 '지표 방향' 도넛과 중복이라 시각화 일원화)
          const dirCol = regime === "bull" ? "var(--bull)" : regime === "bear" ? "var(--bear)" : "var(--eth)";
          const cf = verdict.confluence;
          // 게이지/도넛 → 가독성 높은 가로 바(진행·누적·발산). 값이 바로 읽힘.
          const cfBar = (cf && cf.total) ? `<div class="fbar-row" title="컨플루언스 = 지표 합의도. 같은 방향 지표 수 ÷ 전체(${cf.agree}/${cf.total}=${cf.score}%). 높을수록 방향 신뢰가 큽니다."><span class="fbar-lab">컨플루언스</span><span class="fbar-track"><i class="fbar-fill" style="width:${cf.score}%;background:${dirCol}"></i></span><span class="fbar-val"><b>${cf.agree}/${cf.total}</b> ${cf.score}%</span></div>` : "";
          const _tot = Math.max(1, bl + ne + be);
          const dirBar = `<div class="fbar-row" title="지표 방향 분포 — 상승/중립/하락 지표 수(${bl}·${ne}·${be} / 총 ${bl + ne + be})"><span class="fbar-lab">지표 방향</span><span class="fbar-track fbar-stack"><i style="width:${(bl / _tot * 100).toFixed(1)}%;background:var(--bull)"></i><i style="width:${(ne / _tot * 100).toFixed(1)}%;background:#e8b463"></i><i style="width:${(be / _tot * 100).toFixed(1)}%;background:var(--bear)"></i></span><span class="fbar-val"><b style="color:var(--bull)">▲${bl}</b> <b style="color:var(--gold)">${ne}</b> <b style="color:var(--bear)">▼${be}</b></span></div>`;
          let sigBar = "";
          if (_scoreN != null) { const sv = Math.max(-100, Math.min(100, _scoreN)), half = Math.abs(sv) / 100 * 50, lft = sv >= 0 ? 50 : 50 - half; sigBar = `<div class="fbar-row" title="시그널 = 종합 신호 강도(−100 ~ +100). 지표·모멘텀·평균회귀 가중 합성. 양수=상승 우위, 절댓값 클수록 강함."><span class="fbar-lab">시그널</span><span class="fbar-track fbar-div"><i class="fbar-mid"></i><i class="fbar-dfill" style="left:${lft.toFixed(1)}%;width:${half.toFixed(1)}%;background:${dirCol}"></i></span><span class="fbar-val"><b style="color:${dirCol}">${sv > 0 ? "+" : ""}${score}</b></span></div>`; }
          _bd += `<div class="fcv-bars">${cfBar}${dirBar}${sigBar}</div>`;
        }
      } catch (e) {}
      const _pxArr = (_fcLastData && _fcLastData.price) || (typeof currentData === "function" && currentData().price) || [];
      const _curPx = _pxArr.length ? _pxArr[_pxArr.length - 1] : null;
      const _prevPx = _pxArr.length > 1 ? _pxArr[_pxArr.length - 2] : null;
      const _pxChg = (_curPx != null && _prevPx != null && _prevPx !== 0) ? (_curPx / _prevPx - 1) * 100 : null;
      const pxHtml = (_curPx != null && isFinite(_curPx)) ? `<span class="fcv-px" title="현재가"><b>${fmtNum(_curPx)}</b>${_pxChg != null ? `<span class="fcv-pxchg ${_pxChg >= 0 ? "up" : "dn"}">${_pxChg >= 0 ? "▲" : "▼"}${Math.abs(_pxChg).toFixed(2)}%</span>` : ""}</span>` : "";
      // 국면 배지(현재가 옆): 추세/횡보 + 신뢰도(백테스트 근거). 표시용 verdict.context.
      let ctxHtml = "";
      const _ctx = verdict.context;
      if (_ctx && _ctx.state) {
        const _st = _ctx.state, _rel = _ctx.reliability;
        const stTxt = _st === "range" ? "횡보장" : (_rel === "low" ? "강한 " : "완만한 ") + (_st === "up" ? "상승추세" : "하락추세");
        const relTxt = _rel === "high" ? "신뢰 높음" : _rel === "mid" ? "신뢰 중간" : "신뢰 낮음";
        const tip = _st === "range"
          ? "횡보 구간 — 백테스트상 엔진의 방향 신호가 유효했던 국면입니다. 신호 신뢰도 높음."
          : "강한 추세 구간 — 방향 신호는 참고만 하고 추세에 순응하세요(백테스트상 추세장에선 방향 예측이 단순 추세추종을 못 이겼습니다).";
        ctxHtml = `<span class="fcv-ctx rel-${_rel}" title="${tip} · 클릭 = 엔진 검증 성적" onclick="openBacktestCard()"><span class="ctx-dot"></span>${stTxt} · ${relTxt}<span class="ctx-info">ⓘ</span></span>`;
      }
      // range-bound 기회 pill — 백테스트로 검증된 유일한 edge: 횡보장 지지반등(롱)만
      let oppHtml = "";
      const _opp = _ctx && _ctx.opportunity;
      if (_opp && _opp.kind === "buy") {
        let oppTip, oppLbl;
        if (_opp.sub === "recovery") {
          oppTip = `하락 국면에서 RSI가 위로 꺾임(+${_opp.rsiUp}) — 하락 후 평균회귀 반등. 백테스트 검증(v1.3, 39종): 랜덤(항상롱) 대비 20봉 +1.4%p·40봉 +2.5%p·손실종목 3/36. 20봉 이상 보유 관점.`;
          oppLbl = "하락 후 반등 기회";
        } else {
          oppTip = `박스권 하단(%B ${_opp.pctB}) + RSI 반등(+${_opp.rsiUp}) + 200MA 비하락 + 낙폭 ${_opp.dd != null ? _opp.dd + "%" : "5%↑"} — 진짜 눌림 반등 셋업. 백테스트 검증(54종): 승률 54.3%·평균 +1.7%/회(20봉 보유)로 랜덤 크게 초과(2064건). 20봉 이상 보유 관점.`;
          oppLbl = "지지 반등 기회";
        }
        oppHtml = `<span class="fcv-opp opp-buy" title="${oppTip}"><span class="opp-ico">◎</span>${oppLbl}<span class="opp-vf">검증됨</span></span>`;
      }
      // 변동성 예보 멀티지평 곡선(v1.9.1) — 가격 방향 아님, '얼마나 움직일지'. 2주/1달/2달 OOS 70/69/64% 검증.
      const _vf = _ctx && _ctx.volForecast;
      const _vfcv = _vf && _vf.curve;
      const vfHtml = _vf ? (function () {
        const rows = (_vfcv || []).map(c => `· ${c.lb}(${c.h}봉): ${c.expand ? "확대" : "축소"} ${c.prob}% (OOS ${c.acc}%)`).join("&#10;");
        const ea = _vf.earnAug ? "&#10;📅 실적 인지 증강(종목외 +2.6%p·외부데이터)" : "";
        const tip = "다음 구간 변동성이 확대(더 크게 움직임)/축소(잔잔해짐)될지 — 지평별 곡선.&#10;⚠️가격 방향 아님(오를지 내릴지 X, 얼마나 움직일지 O). 대표=1달." + ea + "&#10;" + rows + "&#10;" + (_vf.expand ? "→ 큰 움직임 대비·손절 넓게" : "→ 박스권 매매·타이트하게");
        return `<span class="fcv-vol ${_vf.expand ? "vol-exp" : "vol-con"}" title="${tip}">${_vf.expand ? "⌇ 확대" : "≈ 축소"} <b>${_vf.prob}%</b><span class="vol-vf"${_vf.earnAug ? " style=\"background:var(--gold-dim);color:var(--gold)\"" : ""}>${_vf.earnAug ? "📅실적" : "2주·1달·2달"}</span></span>`;
      })() : "";
      // 낙폭리스크 예보(v1.6) — 향후 ~1개월 5%↑ 하락 확률(하방 특화, 가격 방향 예측 아님). OOS 68% 검증.
      const _dd = _ctx && _ctx.ddRisk;
      // 확률 손익(v1.7) — 같은 문턱 ±X%(1M 5%·2M 7%·3M 9%)에서 이익목표 도달 vs 낙폭 확률(둘 다 검증). 방향 예측 아님.
      const _ut = _ctx && _ctx.upTarget;   // upTarget 객체 — 바깥 _up(방향확률)과 이름 충돌 방지(TDZ 버그 수정)
      const _ddcv = _dd && _dd.curve, _upcv = _ut && _ut.curve;
      const ddHtml = (_ddcv && _upcv) ? (function () {
        const u0 = _upcv[0].prob, d0 = _ddcv[0].prob, fav = u0 - d0;   // 1개월 승산(도달−낙폭)
        const cls = fav >= 8 ? "rr-up" : fav <= -8 ? "rr-dn" : "rr-fl";
        const rows = _upcv.map((c, i) => `· ${c.mo}개월(±${c.tg}%): 도달 ${c.prob}% vs 낙폭 ${_ddcv[i].prob}% (평시 ${c.base}/${_ddcv[i].base}%)`).join("&#10;");
        const tip = "확률 손익 — 같은 문턱 ±X%에서 '이익목표 도달 확률'과 '낙폭 확률'(둘 다 백테스트 OOS 63~69%, 지속성·다수결 초과).&#10;⚠️가격 방향 예측 아님 — 위/아래로 그만큼 '닿을' 확률. 도달>낙폭이면 상방 우세(참고).&#10;" + rows;
        return `<span class="fcv-vol ${cls}" title="${tip}">▲도달 <b>${u0}%</b> · ▽낙폭 <b>${d0}%</b><span class="vol-vf">1·2·3M</span></span>`;
      })() : "";
      // 단일봉 급변 멀티지평 곡선(v1.9.1) — 지평별 문턱↑ 대각선(2주2σ/1달2.5σ/2달3σ). 방향 아님(갭·쇼크 경보). OOS 64~66%.
      const _spk = _ctx && _ctx.spikeRisk;
      const _spkcv = _spk && _spk.curve;
      const spkHtml = _spk ? (function () {
        const rows = (_spkcv || []).map(c => `· ${c.lb}(${c.h}봉) ${c.sigma}σ↑: ${c.prob}% (평시 ${c.base}% · OOS ${c.acc}%)`).join("&#10;");
        const ea = _spk.earnAug ? "&#10;📅 실적 인지 증강(종목외 +3.4%p·외부데이터)" : "";
        const tip = "하루 만에 큰 폭(현재 변동성의 Kσ 이상, 급등·급락 무관)이 나올 확률 — 지평이 길수록 문턱↑(대각선 곡선).&#10;⚠️가격 방향 예측 아님 — '큰 하루가 올까'. 대표=1달(2.5σ)." + ea + "&#10;" + rows + "&#10;" + (_spk.elevated ? "→ 평시보다 높음 · 갭·실적·이벤트 대비" : "→ 평시 수준");
        return `<span class="fcv-vol ${_spk.elevated ? "dd-hi" : "dd-lo"}" title="${tip}">⚡ <b>${_spk.prob}%</b><span class="vol-vf"${_spk.earnAug ? " style=\"background:var(--gold-dim);color:var(--gold)\"" : ""}>${_spk.earnAug ? "📅실적" : "평시 " + _spk.base + "%"}</span></span>`;
      })() : "";
      // 오버나잇 갭 멀티지평 곡선(v1.9.4) — 지평↑ 문턱↑ 대각선(1달2.2σ/1.5달2.7σ/2달3.2σ). 주식 한정, 비주식 null. 급변(일중)과 다른 슬라이스. OOS 62~63%.
      const _gap = _ctx && _ctx.gapRisk;
      const _gapcv = _gap && _gap.curve;
      const gpHtml = _gap ? (function () {
        const rows = (_gapcv || []).map(c => `· ${c.lb}(${c.h}봉) ${c.sigma}σ↑: ${c.prob}% (평시 ${c.base}% · OOS ${c.acc}%)`).join("&#10;");
        const eaug = _gap.earnAug;   // 실적 인지 증강(v1.9.6)
        const earnLine = eaug ? "&#10;📅 실적 인지 증강" + (_gap.earnBars != null ? "(다음 실적 ≈D-" + _gap.earnBars + ")" : "") + " — 실적일 근접이 갭을 유발(종목외 +6.3%p·외부데이터)." : "";
        const tip = "하루 만에 큰 오버나잇 갭(시가가 전일 종가 대비 크게 벌어짐, 갭업·갭다운 무관)이 나올 확률 — 지평이 길수록 문턱↑(대각선 곡선). 대표=1달(2.2σ).&#10;⚠️가격 방향 예측 아님 — '큰 갭이 뜰까'. 급변 경보(일중·종가)와 다른 데이터 슬라이스(시가 vs 전일종가)." + earnLine + "&#10;" + rows + "&#10;주식 한정 — 24h 시장(FX·크립토) 미표시. " + (_gap.elevated ? "→ 평시보다 높음 · 갭 대비" : "→ 평시 수준");
        return `<span class="fcv-vol ${_gap.elevated ? "dd-hi" : "dd-lo"}" title="${tip}">▮ <b>${_gap.prob}%</b>${eaug ? "<span class=\"vol-vf\" style=\"background:var(--gold-dim);color:var(--gold)\">📅D-" + (_gap.earnBars != null ? _gap.earnBars : "?") + "</span>" : "<span class=\"vol-vf\">평시 " + _gap.base + "%</span>"}</span>`;
      })() : "";
      // 추세 지속/소진 멀티지평 곡선(v1.9.5) — 2주/1달/2달 뒤에도 추세 유지할지. 비방향. 종목외 OOS 79/76/73%(상승)·76/75/73%(하락).
      const _tp = _ctx && _ctx.trendPersist;
      const _tpcv = _tp && _tp.curve;
      const tpHtml = _tp ? (function () {
        const rows = (_tpcv || []).map(c => `· ${c.lb}(${c.h}봉): 지속 ${c.persist}% / 소진 ${c.exhaust}% (종목외 ${c.acc}%)`).join("&#10;");
        const tip = "현재 " + (_tp.state === "up" ? "상승" : "하락") + "추세가 그 시점 뒤에도 이어질(지속) vs 힘 빠져 횡보 전환할(소진) 확률 — 지평별 곡선. 대표=1달.&#10;⚠️가격 방향 예측 아님 — '지속될지 소진될지'(비방향). 종목외 walk-forward(다수결·strength 크게 초과).&#10;" + rows + "&#10;소진 예상이면 추격 자제·평균회귀 대비.";
        return `<span class="fcv-vol ${_tp.persist >= 60 ? "rr-up" : _tp.persist <= 40 ? "dd-lo" : "rr-fl"}" title="${tip}">${_tp.state === "up" ? "▲" : "▼"} ${_tp.persist >= 55 ? "지속" : _tp.persist <= 45 ? "소진" : "중립"} <b>${_tp.persist}%</b><span class="vol-vf">2주·1달·2달</span></span>`;
      })() : "";
      // 시장 상대강도(v1.10) — SPY 대비 아웃퍼폼 확률(첫 상대 방향 축). 미국주식·일봉 한정.
      const _rl = _ctx && _ctx.relStrength;
      const relHtml = _rl ? (function () {
        const rows = (_rl.curve || []).map(c => `· ${c.lb}(${c.h}봉): 아웃퍼폼 ${c.prob}% (OOS ${c.acc}%·base ${c.base}%)`).join("&#10;");
        const tip = "이 종목이 시장(SPY)보다 나을 확률 — 절대 상승/하락이 아니라 '시장 대비'(base ~48%인 공정한 방향 질문). 대표=1달.&#10;검증: 자명규칙(±모멘텀·±지속성·다수결) 최강치 대비 +2.2~2.4pp·전/후반 양수·종목외 유지(rel-lab).&#10;" + rows + "&#10;활용: 홀드 vs 교체(인덱스 대비) 판단 참고. ⚠️절대 방향 예측 아님 — 시장이 빠지면 같이 빠질 수 있음.";
        return `<span class="fcv-vol ${_rl.prob >= 55 ? "rr-up" : _rl.prob <= 45 ? "dd-lo" : "rr-fl"}" title="${tip}">${_rl.prob >= 50 ? "◆" : "◇"} ${_rl.prob >= 55 ? "아웃퍼폼" : _rl.prob <= 45 ? "언더퍼폼" : "시장 중립"} <b>${_rl.prob}%</b><span class="vol-vf">vs SPY</span></span>`;
      })() : "";
      // 리스크 가이드(v1.6) — 검증된 콘(예측범위, 실현변동성과 0.79 상관)·낙폭리스크에 표준 리스크공식 적용.
      // 예측(변동폭·낙폭)은 백테스트 검증, 손절폭·비중 공식은 업계 표준(백테스트 edge 아님) — 정직 구분.
      const _pR = lastResult && lastResult.prediction;
      let rgHtml = "";
      if (_pR && isFinite(_pR.anchor) && _pR.lo && _pR.hi && _pR.lo.length) {
        const _k = _pR.lo.length - 1, _a = _pR.anchor;
        const _dnB = Math.max(0, (_a - _pR.lo[_k]) / _a), _upB = Math.max(0, (_pR.hi[_k] - _a) / _a);
        const _band = (_dnB + _upB) / 2;                                  // 예상 변동폭 ±%
        const _elev = _dd && _dd.elevated;
        const _stop = Math.max(0.005, _dnB * (_elev ? 1.2 : 1.0));        // 권장 손절폭 = 하방 콘(낙폭경보 시 1.2×)
        const _size = Math.min(1, 0.02 / _stop);                          // 계좌 2% 고정리스크 기준 비중
        rgHtml = `<span class="fcv-risk" title="검증된 예측범위(콘)·낙폭리스크에 표준 리스크 공식을 적용한 참고 가이드.&#10;⚠️예측(변동폭·낙폭)은 백테스트 검증, 손절폭·비중 공식은 업계 표준(백테스트 edge 아님).&#10;· 예상 변동폭: 향후 ${_pR.futW || ""}봉 콘 ±${(_band * 100).toFixed(1)}%&#10;· 권장 손절폭: ${(_stop * 100).toFixed(1)}% (하방 콘${_elev ? " · 낙폭경보로 확대" : ""})&#10;· 권장 비중: 계좌 2% 리스크 기준 ${Math.round(_size * 100)}%">🛡 손절 ${(_stop * 100).toFixed(1)}% · 비중 ${Math.round(_size * 100)}%</span>`;
      }
      const _L = t => `<span class="fcv-k">${t}</span>`;
      // 검증된 예측 6축 (멀티지평 곡선) — 균일 그리드 셀. 라벨 간결화, 세부 배지는 CSS로 정리(툴팁 유지).
      const _axCells =
        (vfHtml ? `<span class="fcv-cell">${_L("변동성")}${vfHtml}</span>` : "") +
        (ddHtml ? `<span class="fcv-cell">${_L("확률 손익")}${ddHtml}</span>` : "") +
        (spkHtml ? `<span class="fcv-cell">${_L("급변")}${spkHtml}</span>` : "") +
        (gpHtml ? `<span class="fcv-cell">${_L("갭 · 주식")}${gpHtml}</span>` : "") +
        (tpHtml ? `<span class="fcv-cell">${_L("추세 지속")}${tpHtml}</span>` : "") +
        (relHtml ? `<span class="fcv-cell">${_L("시장 대비")}${relHtml}</span>` : "") +
        (rgHtml ? `<span class="fcv-cell">${_L("리스크 · 참고")}${rgHtml}</span>` : "");
      // 상승확률 게이지(계기판 중심) — ▼하락 | 트랙 | ▲상승
      const gaugeHtml = (_up != null) ? `<div class="fcv-gauge" title="예측 콘 기준 종합 상승확률 · v1.4 캘리브레이션(표기=실제)"><span class="fcv-gside dn">▼${100 - _up}%</span><span class="fcv-gtrack"><i class="fcv-gdn" style="width:${100 - _up}%"></i><i class="fcv-gup" style="width:${_up}%"></i><i class="fcv-gmid"></i></span><span class="fcv-gside up">▲${_up}%</span></div>` : "";
      bar.innerHTML =
        // ── 1) 계기판(헤드라인): 종목·국면 · 현재가·방향·목표 · 확률 게이지 · 핵심 의견 ──
        `<div class="fcv-sec fcv-head">` +
          `<div class="fcv-hrow1">` +
            (tkLabel ? `<span class="fcv-tkr">${tkLabel}</span>` : "") +
            ((ctxHtml || oppHtml) ? `<span class="fcv-cellrow">${ctxHtml}${oppHtml}</span>` : "") +
          `</div>` +
          `<div class="fcv-hrow2">` +
            (pxHtml || "") +
            `<span class="fcv-hdir" title="지표·모멘텀·평균회귀를 종합한 방향 판정(상승/중립/하락)" style="color:${col}">${arrow} ${label}</span>` +
            (isFinite(_targetN) ? `<span class="fcv-htgt">${_L("목표가")}<b title="예측 도달가">${fmtNum(_targetN)}</b></span>` : "") +
          `</div>` +
          gaugeHtml +
          `<div class="fcv-op" title="국면·확률·강도 종합 한 줄 요약" style="color:${col}">${op}</div>` +
        `</div>` +
        // ── 2) 검증된 예측 곡선(6축 균일 그리드) ──
        (_axCells ? `<div class="fcv-sec fcv-forecast"><span class="fcv-eyebrow" title="백테스트 out-of-sample으로 검증된 예측 축(멀티지평 곡선). 가격 방향(효율시장 벽)이 아닌 변동성·리스크·추세 구조를 예측.">검증된 예측 곡선</span><div class="fcv-grid">${_axCells}</div></div>` : "") +
        // ── 3) 지표 합의(컨플루언스·방향·시그널) ──
        (_bd ? `<div class="fcv-sec fcv-consensus"><span class="fcv-eyebrow">지표 합의</span>${_bd}</div>` : "");
    }
    if (u >= 1 && bar) { bar.classList.remove("flash"); void bar.offsetWidth; bar.classList.add("flash"); }   // 최종 결과 등장 강조
    // 타임프레임 매트릭스(주·월 추가 fetch 3회)는 무거워 종목 선택 시 자동 실행 안 함 → '웹분석' 버튼(_wantDeep)에서만 갱신(부하 역할 분산)
    if (typeof scheduleDash === "function" && u >= 1 && _wantDeep) { _wantDeep = false; scheduleDash(); }
  }
  let _wantDeep = false;   // 심층 분석(멀티TF 매트릭스·실적) 요청 플래그 — 웹분석 버튼에서만 set
  /* 핵심 의견 한 줄(간결) — 국면·상승확률·시그널 강도 종합 */
  function verdictOpinion(v, up) {
    const s = Math.abs(v.score || 0), strong = s >= 60, u = (up == null) ? 50 : up;
    if (v.regime === "bull") return u >= 60 ? (strong ? "상승 우세 — 추세 지속 유력" : "상승 우위 — 눌림목 매수 관점") : "완만한 상승 — 되돌림 후 방향 확인";
    if (v.regime === "bear") return u <= 40 ? (strong ? "하락 우세 — 반등은 제한적" : "하락 우위 — 반등 시 비중 축소") : "약세 — 지지선 이탈 여부 주시";
    return "방향성 혼재 — 돌파 확인 전 관망";
  }
  /* ── 타임프레임 매트릭스(일·주·월 비교) ── */
  let _dashCache = { sym: null, cand: {} }, _dashTmr = null;
  // 종목 선택 시엔 매트릭스(주·월 추가 fetch)를 자동 실행하지 않음 → 안내 플레이스홀더로 초기화(웹분석에서 채움)
  function _dashDefer() {
    const host = document.getElementById("fcDashBody"); if (!host) return;
    host.innerHTML = `<div class="dash-guide"><svg class="dg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7" rx="1"/><rect x="12" y="7" width="3" height="11" rx="1"/><rect x="17" y="4" width="3" height="14" rx="1"/></svg><div class="dg-title">타임프레임 매트릭스</div><div class="dg-desc"><b>웹분석</b>을 누르면 일·주·월봉을 한눈에 비교합니다 —<br>국면·확률·시그널·목표가·RSI·지지/저항까지.</div></div>`;
    const meta = document.getElementById("fcDashMeta"); if (meta) meta.textContent = "–";
  }
  window._dashDefer = _dashDefer;
  const _TFCOL = { "일봉": "#e8b463", "주봉": "#5b8def", "월봉": "#3fb6c0" };
  async function _computeTf(symbol, tf) {
    try {
      let r;
      if (_dashCache.sym === symbol && _dashCache.cand[tf]) r = _dashCache.cand[tf];   // 재분석 시 재fetch 방지(캔들 캐시)
      else { r = await fetchOHLC(symbol, tf); if (r && r.ok) { if (_dashCache.sym !== symbol) _dashCache = { sym: symbol, cand: {} }; _dashCache.cand[tf] = r; } }
      if (!r || !r.ok || !Array.isArray(r.candles) || r.candles.length < 24) return null;
      const series = r.candles.map(d => +d.c).filter(isFinite); if (series.length < 24) return null;
      const data = { price: series, candle: r.candles.map(d => ({ o: +d.o, h: +d.h, l: +d.l, c: +d.c })), orange: [], blue: [], n: series.length };
      const tfk = tfKo(tf);
      const res = ForgeCore.run(boardToGraph(), data, { futW: horizonForTF(tfk), timeframe: tfk, driftWeights: _driftW });
      const tp = ForgeCore.trendProfileForTF(tfk);
      const ta = ForgeCore.analyzeTrend(series, { shortLen: Math.max(8, Math.round(40 * (tp.shortScale || 1))), weights: tp.weights });
      const rsi = ForgeCore.analyzeRSI(series, { period: 14 });
      const ea = ForgeCore.analyzeElliott(series, { swing: 0.03 });
      const vser = r.candles.map(d => +d.v);
      const volSrc = (vser.length === series.length && vser.some(x => isFinite(x) && x > 0)) ? vser.map(x => isFinite(x) ? x : 0) : ForgeCore.synthVolume(series);
      const vol = ForgeCore.analyzeVolume(series, volSrc);
      const v = res.verdict || {}, pr = res.prediction || {}, up = aggUpProb(pr);
      const pend = (pr.path && pr.path.length) ? pr.path[pr.path.length - 1] : null;
      const chg = (pend != null && pr.anchor) ? (pend - pr.anchor) / pr.anchor * 100 : null;
      const ni = series.length - 1;
      const sup = (ta.pivots && ta.pivots.support) ? ta.pivots.support.slope * ni + ta.pivots.support.b : null;
      const rez = (ta.pivots && ta.pivots.resistance) ? ta.pivots.resistance.slope * ni + ta.pivots.resistance.b : null;
      return { regime: v.regime || "neutral", score: isFinite(v.score) ? v.score : 0, up: up == null ? 50 : up,
        trend: (Math.exp(ta.blend.slopeLog) - 1) * 100, rsi: isFinite(rsi.last) ? rsi.last : 50, chg, target: v.target,
        el: ea, vol: vol, sup: isFinite(sup) ? sup : null, rez: isFinite(rez) ? rez : null };
    } catch (e) { return null; }
  }
  function _dbest(vals, dir) { let bi = -1, bv = dir > 0 ? -1e9 : 1e9; vals.forEach((v, i) => { if (v == null || !isFinite(v)) return; if (dir > 0 ? v > bv : v < bv) { bv = v; bi = i; } }); return bi; }
  function _elTxt(ea) { if (!ea) return ["–", "var(--eth)"]; const cl = ea.current.label, isL = /[A-Z]/.test(cl);
    const t = ea.structure === "impulse_up" ? "상승 임펄스" : ea.structure === "impulse_down" ? "하락 임펄스" : ea.structure === "corrective" ? "조정(" + cl + ")" : isL ? "되돌림(" + cl + ")" : (ea.waves.length >= 2 ? "발달중(" + cl + "파)" : "불확실");
    const col = ea.structure === "impulse_up" ? "var(--bull)" : ea.structure === "impulse_down" ? "var(--bear)" : ea.structure === "corrective" ? "#e8b463" : "var(--eth)";
    return [t, col]; }
  function _volTxt(v) { if (!v) return ["–", "var(--eth)"]; const st = v.state === "spike" ? "급증" : v.state === "contract" ? "위축" : "평이";
    const rel = v.relationship === "confirm" ? "확인" : v.relationship === "weakening" ? "약화" : v.relationship === "selling" ? "매도압력" : "투매진정";
    return [st + " · " + rel, (v.relationship === "confirm" || v.relationship === "capitulation") ? "var(--bull)" : "var(--bear)"]; }
  // 셀: 세그먼트 바(좌) + 값(우 정렬) / 텍스트(좌 정렬). best=행 최고 강조
  function _segBar(pct, col) { const p = Math.max(0, Math.min(100, pct || 0)); return `<span class="dbar"><span class="dbar-f" style="width:${p}%;background:${col}"></span></span>`; }
  function _barC(pct, col, val, best, fnum, suf) { const dn = (fnum != null) ? ` data-fnum="${fnum}" data-suf="${suf || ""}"` : ""; return `<td class="${best ? "dash-best" : ""}"><div class="dash-cell" data-pct="${Math.round(pct || 0)}" data-col="${col}"${dn}>${_segBar(pct, col)}<b class="dval">${val}</b>${best ? `<span class="dstar" title="이 지표에서 가장 강세인 타임프레임">★</span>` : ""}</div></td>`; }
  function _txtC(html, best) { return `<td class="${best ? "dash-best" : ""}"><div class="dash-cell txt"><span class="dval-l">${html}</span>${best ? `<span class="dstar" title="이 지표에서 가장 강세인 타임프레임">★</span>` : ""}</div></td>`; }
  async function renderDashboard() {
    const host = document.getElementById("fcDashBody"); if (!host) return;
    const meta = document.getElementById("fcDashMeta");
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && n.params && (n.params.symbol || "").trim());
    if (!tk) { host.innerHTML = `<div class="dash-guide"><svg class="dg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7" rx="1"/><rect x="12" y="7" width="3" height="11" rx="1"/><rect x="17" y="4" width="3" height="14" rx="1"/></svg><div class="dg-title">타임프레임 매트릭스</div><div class="dg-desc">종목을 <b>불러오기</b> 하면 일·주·월봉을 한눈에 비교합니다 —<br>국면·확률·시그널·목표가·RSI·지지/저항까지.</div></div>`; if (meta) meta.textContent = "–"; return; }
    if (!SERVER_OK) { host.innerHTML = `<div class="dash-guide"><svg class="dg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7" rx="1"/><rect x="12" y="7" width="3" height="11" rx="1"/><rect x="17" y="4" width="3" height="14" rx="1"/></svg><div class="dg-title">타임프레임 매트릭스</div><div class="dg-desc">서버에 연결되면 일·주·월봉 비교가 표시됩니다.<br><span style="opacity:.7">로컬 파일 모드에선 미지원</span></div></div>`; return; }
    const sym = tk.params.symbol.trim();
    if (_dashCache.sym !== sym) host.innerHTML = `<div class="na-empty">${esc(sym)} 일·주·월 분석 중…</div>`;   // 캐시 있으면 깜빡임 없이 갱신
    const [d, w, m] = await Promise.all([_computeTf(sym, "1day"), _computeTf(sym, "1week"), _computeTf(sym, "1month")]);
    const cols = [["일봉", d], ["주봉", w], ["월봉", m]].filter(x => x[1]);
    const _tfName = ((typeof activeTF === "function" ? activeTF() : null) || "일봉");   // activeTF()가 이미 "일봉/주봉/월봉" 반환(미설정 시 일봉)
    const _actIdx = cols.findIndex(c => c[0] === _tfName);
    if (!cols.length) { host.innerHTML = `<div class="na-empty">데이터를 불러올 수 없어요: ${esc(sym)}</div>`; return; }
    if (meta) meta.textContent = esc(sym);
    { const _ad = (typeof activeDoc === "function") ? activeDoc() : null; if (_ad) { _ad._tfReg = { d: (d && d.regime) || null, w: (w && w.regime) || null, m: (m && m.regime) || null }; if (typeof renderSidebar === "function") renderSidebar(); } }   // 워치리스트 신호등 도트용
    const REG = { bull: ["▲ 상승", "var(--bull)"], bear: ["▼ 하락", "var(--bear)"], neutral: ["– 중립", "var(--eth)"] };
    const th = `<tr><th>지표</th>${cols.map(c => `<th style="color:${_TFCOL[c[0]] || "var(--eth)"}"><span class="thdot" style="background:${_TFCOL[c[0]] || "var(--eth)"}"></span>${c[0]}</th>`).join("")}</tr>`;
    // 국면·상승확률·하락확률·시그널·예측·목표는 위 카드에 표시 → 테이블은 보조(추세·구조·레벨)만
    const rows = [];
    { const bi = _dbest(cols.map(c => c[1].trend), 1); rows.push(`<tr><td>추세 %/봉</td>${cols.map((c, i) => { const t = c[1].trend; return _txtC(`<span style="color:${t >= 0 ? "var(--bull)" : "var(--bear)"}">${t >= 0 ? "+" : ""}${t.toFixed(2)}</span>`, i === bi); }).join("")}</tr>`); }
    rows.push(`<tr><td>RSI</td>${cols.map(c => { const rv = c[1].rsi, col = rv >= 70 ? "var(--bear)" : rv <= 30 ? "var(--bull)" : "var(--eth)"; return _barC(rv, col, Math.round(rv), false, Math.round(rv), ""); }).join("")}</tr>`);
    rows.push(`<tr><td>지지 / 저항</td>${cols.map(c => _txtC(`<span class="dash-sub"><span style="color:var(--bull)">${c[1].sup != null ? fmtNum(c[1].sup) : "–"}</span> <span style="opacity:.35">/</span> <span style="color:var(--bear)">${c[1].rez != null ? fmtNum(c[1].rez) : "–"}</span></span>`, false)).join("")}</tr>`);
    rows.push(`<tr><td>엘리어트</td>${cols.map(c => { const e = _elTxt(c[1].el); return _txtC(`<span style="color:${e[1]}">${e[0]}</span>`, false); }).join("")}</tr>`);
    rows.push(`<tr><td>거래량</td>${cols.map(c => { const vv = _volTxt(c[1].vol); return _txtC(`<span style="color:${vv[1]}">${vv[0]}</span>`, false); }).join("")}</tr>`);
    const REGC = { bull: ["▲", "var(--bull)"], bear: ["▼", "var(--bear)"], neutral: ["▸", "var(--eth)"] };
    const cards = cols.map(c => {
      const nm = c[0], v = c[1], rg = REGC[v.regime] || REGC.neutral, tcol = _TFCOL[nm] || "var(--eth)";
      const chgHtml = (v.chg != null && isFinite(v.chg)) ? `<b style="color:${v.chg >= 0 ? "var(--bull)" : "var(--bear)"}">${v.chg >= 0 ? "+" : ""}${v.chg.toFixed(1)}%</b>` : "–";
      const tgtHtml = isFinite(v.target) ? `<b>${fmtNum(v.target)}</b>` : "–";
      return `<div class="tf-card${nm === _tfName ? " act" : ""}">
        <div class="tf-card-h" style="color:${tcol}"><span class="thdot" style="background:${tcol}"></span>${nm} <b style="color:${rg[1]}">${rg[0]}</b></div>
        <div class="tf-card-prob" data-up="${v.up}"><span class="tcp-up">▲<b>${v.up}</b>%</span><span class="tcp-bar"><i class="tcp-f" style="width:${v.up}%"></i></span><span class="tcp-dn">▼<b>${100 - v.up}</b>%</span></div>
        <div class="tf-card-viz" data-up="${v.up}" data-score="${v.score}" data-col="${rg[1]}"><span class="tfb"><span class="tfb-k">시그널</span>${_hbarDiv(v.score, rg[1])}<b class="tfb-v" style="color:${rg[1]}">${Math.round(v.score)}</b></span></div>
        <div class="tf-card-ft">예측 ${chgHtml} · 목표 ${tgtHtml}</div>
      </div>`;
    }).join("");
    host.innerHTML = `<div class="tf-cards">${cards}</div><div class="tf-tbl-cap">타임프레임별 상세</div>` + `<table class="dash-table${_actIdx >= 0 ? " tfcol-" + (_actIdx + 2) : ""}">${th}${rows.join("")}</table>`;
    _dashFill(_playing ? _playReveal.u : null);
  }
  function scheduleDash() { clearTimeout(_dashTmr); _dashTmr = setTimeout(() => { renderDashboard().catch(() => {}); }, 350); }   // 분석/티커 변경 시 자동 갱신(디바운스)

  /* ── exportStrategy: download strategy as JSON blob ──────────── */
  function exportStrategy() {
    // collect image ids referenced by nodes and theme
    const usedIds = new Set();
    boardState.nodes.forEach(n => { if (n.thumb && n.thumb.imgId) usedIds.add(n.thumb.imgId); });
    if (themeState.imgId) usedIds.add(themeState.imgId);
    const images = {};
    usedIds.forEach(id => { if (IMAGES[id]) images[id] = IMAGES[id]; });

    const payload = {
      version: ForgeCore.version,
      theme: { ...themeState },
      nodes: boardState.nodes.map(n => {
        const out = { id: n.id, kind: n.kind, title: n.title, x: n.x, y: n.y };
        if (n.blockType) out.blockType = n.blockType;
        if (n.params && Object.keys(n.params).length) out.params = { ...n.params };
        if (n.conviction) out.conviction = n.conviction;
        if (n.weight != null && n.weight !== 50) out.weight = n.weight;
        if (n.note) out.note = n.note;
        if (n.thumb) out.thumb = { ...n.thumb };
        return out;
      }),
      edges: boardState.edges.map(e => ({
        id: e.id, from: e.from, to: e.to,
        fromSide: e.fromSide, toSide: e.toSide
      })),
      library: LIBRARY.filter(it => usedIds.has(it.id)),
      images
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "scoopforge-strategy.json";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    bToast("포지 내보내기 완료");
  }

  /* ── Forge data + runForge ───────────────────────────────────── */
  let data = ForgeCore.makeDemoSeries({ n: 480, seed: 1, period: 64 });
  let _visionData = null, _visionBias = 0, _visionNote = "", _visionWaves = [], _visionCoords = null, _visionTF = null, _visionFut = 0;
  // 타임프레임 정규화(티커 1day/1week/1month·비전 한글 모두 → 한글 canonical)
  function tfKo(tf) { if (!tf) return null; if (/month|월/.test(tf)) return "월봉"; if (/week|주/.test(tf)) return "주봉"; if (/day|일/.test(tf)) return "일봉"; if (/hour|분|시/.test(tf)) return tf; return tf; }
  // 현재 활성 타임프레임: 비전 결과 우선, 없으면 티커 노드 params.tf
  function activeTF() { if (_visionTF) return tfKo(_visionTF); const t = boardState.nodes.find(n => n.blockType === "ticker" && n.params && n.params.tf); return t ? tfKo(t.params.tf) : null; }
  // TF별 기본 예측범위(작도 horizon): 일봉 40일 · 주봉 50주 · 월봉 12개월 · 기타 24
  function horizonForTF(tf) { const s = tf || ""; if (/월|month|개월|년|연/.test(s)) return 12; if (/주|week/.test(s)) return 52; if (/일|day/.test(s)) return 60; return 24; }   // 지평: 월 12(1년)·주 52(1년)·일 60(~3개월, 종전 40에서 확대해 비대칭 완화·일봉 신뢰한계 내)
  function tfUnit() { const t = activeTF(); return t ? _tfUnit(t) : "봉"; }
  function visionFutW() { return (_visionFut >= 4 && _visionFut <= 60) ? _visionFut : horizonForTF(activeTF()); }
  /* 실제 분석 시계열만 연속 '분석 차트'를 구동. 비전 워커 비활성 동안엔 항상 null
     → 가격 노드 이미지 + 예측 콘(이미지 모드). 워커 도입(VISION_ENABLED) 시 부활. */
  function visionLive() { return (VISION_ENABLED && _visionData) ? _visionData : null; }
  function visionBiasLive() { return visionLive() ? _visionBias : 0; }
  /* 실데이터(가격 노드에 붙여넣은 시계열) 우선 → 연속 차트(과거+예측). 없으면 비전, 둘 다 없으면 데모. */
  function priceSeries() {
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && Array.isArray(n._series) && n._series.length >= 20 && n._series.every(x => isFinite(x)));
    if (tk) return tk._series;
    // 실제로 불러온(fetched) 티커인데 유효 시계열(20봉+)이 없으면 데모/가격노드로 폴백하지 않음 → 가짜 사인 분석 방지(데모 샘플은 fetched=false라 정상 동작)
    if (boardState.nodes.some(n => n.blockType === "ticker" && n.params && n.params.fetched)) return null;
    const p = boardState.nodes.find(n => n.blockType === "price");
    const s = p && p.series;
    const ps = (Array.isArray(s) && s.length >= 20 && s.every(x => isFinite(x))) ? s : null;
    const vs = (visionLive() && Array.isArray(_visionData.price) && _visionData.price.length >= 2) ? _visionData.price : null;
    // 원본 이미지를 띄우는 뷰(auto/image)에서는 이미지에서 추출한 비전 시계열을 써야
    // 작도·예측이 캔들에 정합한다(붙여넣은 시계열이 이미지와 다른 데이터여도 어긋나지 않음).
    if (vs && heroImgId() && _heroView !== "chart") return vs;
    return ps || vs;
  }
  function priceOHLC() {
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && Array.isArray(n._ohlc) && n._ohlc.length >= 2);
    return tk ? tk._ohlc : null;
  }
  function priceTimes() {   // 티커 실데이터의 날짜 배열(시간축 눈금용). 없으면 null(붙여넣기 → 상대 봉 표기)
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && Array.isArray(n._times) && n._times.length >= 2);
    return tk ? tk._times : null;
  }
  /* 축 날짜 포맷(트레이딩뷰식): 월봉=YY.MM · 일/주봉=MM/DD(연 바뀌면 'YY 접두) */
  function _fmtAxisDate(dstr, tf, prevY) {
    const m = String(dstr).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return { text: String(dstr).slice(0, 7), year: prevY };
    const y = m[1], mo = m[2], da = m[3];
    if (/월|month/.test(tf || "")) return { text: y.slice(2) + "." + mo, year: y };
    return { text: (prevY !== y ? "'" + y.slice(2) + " " : "") + mo + "/" + da, year: y };
  }
  function _axisFullDate(absIdx, winN) {   // 호버 툴팁용 전체 날짜(YYYY.MM.DD) — 없으면 null
    const t = priceTimes(); if (!t || t.length !== winN || !t[absIdx]) return null;
    const m = String(t[absIdx]).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[1] + "." + m[2] + "." + m[3]) : null;
  }
  /* ── 예측영역 앰비언트 FX(오버레이) — 종점 브레딩 링 + 중앙선 흐름 shimmer. 차트 위 가벼운 rAF(전체 재드로 아님) ── */
  let _fxRaf = null, _fxLast = 0;
  function drawFx(now) {
    const cv = document.getElementById("fcFx"); if (!cv) return;
    const hero = cv.parentElement, W = hero ? hero.clientWidth : 0, H = hero ? hero.clientHeight : 0;
    if (!W || !H) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), ww = Math.round(W * dpr), hh = Math.round(H * dpr);
    if (cv.width !== ww || cv.height !== hh) { cv.width = ww; cv.height = hh; }
    cv.style.width = W + "px"; cv.style.height = H + "px";
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    if (heroMode() !== "chart") return;
    const main = document.getElementById("fcMainChart"), g = main && main._mainGeo; if (!g || !g.path || !g.path.length) return;
    const t = now || 0;
    const _lo = tvLog(g.loV, g.log), _hi = tvLog(g.hiV, g.log);
    const toY = v => g.padTop + (1 - (tvLog(v, g.log) - _lo) / ((_hi - _lo) || 1)) * (g.ch - g.padTop - g.padBot);
    const toXf = k => g.seamX + ((k + 1) / Math.max(1, g.path.length)) * (g.plotW - g.histW);
    const pEnd = g.path[g.path.length - 1], pd = pEnd > g.anchor * 1.004 ? 1 : pEnd < g.anchor * 0.996 ? -1 : 0;
    const col = pd > 0 ? "70,194,142" : pd < 0 ? "224,106,106" : "232,180,99";
    const ex = toXf(g.path.length - 1), ey = toY(pEnd);
    if (!isFinite(ex) || !isFinite(ey)) return;
    c.save(); c.translate(_heroZoom.tx, _heroZoom.ty); c.scale(_heroZoom.s, _heroZoom.s);
    const xy = k => [toXf(k), toY(g.path[k])];
    if (prefersReducedMotion()) {
      c.strokeStyle = "rgba(" + col + ",.6)"; c.lineWidth = 2; c.beginPath(); c.arc(ex, ey, 9, 0, 7); c.stroke();
      c.save(); c.shadowColor = "rgba(" + col + ",.9)"; c.shadowBlur = 12; c.fillStyle = "rgba(" + col + ",1)"; c.beginPath(); c.arc(ex, ey, 3.6, 0, 7); c.fill(); c.restore();
    } else {
      const beat = 0.5 + 0.5 * Math.sin(t / 520);   // 코어 맥동
      // 예측 중앙선 전체에 은은한 진행 글로우(지금→미래) + 밝은 러너
      c.save(); c.strokeStyle = "rgba(" + col + ",.28)"; c.lineWidth = 3.2; c.shadowColor = "rgba(" + col + ",.6)"; c.shadowBlur = 8;
      c.beginPath(); for (let k = 0; k < g.path.length; k++) { const p = xy(k); k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.stroke(); c.restore();
      // 종점 브레딩 링 3겹(예측 목표 강조 — 크게·밝게)
      for (let rr = 0; rr < 3; rr++) { const ph = ((t / 1300) + rr / 3) % 1, rad = 5 + ph * 22, a = (1 - ph) * 0.8; c.strokeStyle = "rgba(" + col + "," + a.toFixed(3) + ")"; c.lineWidth = 2.2; c.beginPath(); c.arc(ex, ey, rad, 0, 7); c.stroke(); }
      c.save(); c.shadowColor = "rgba(" + col + ",1)"; c.shadowBlur = 12 + beat * 8; c.fillStyle = "rgba(" + col + ",1)"; c.beginPath(); c.arc(ex, ey, 3.4 + beat * 1.2, 0, 7); c.fill(); c.restore();
      // 중앙선 따라 흐르는 밝은 러너 + 짧은 꼬리(지금→미래 루프)
      const fp = (t / 1500) % 1, fk = fp * (g.path.length - 1), k0 = Math.max(0, Math.floor(fk)), k1 = Math.min(g.path.length - 1, k0 + 1), fr = fk - k0;
      const sx = toXf(k0) + (toXf(k1) - toXf(k0)) * fr, sy = toY(g.path[k0]) + (toY(g.path[k1]) - toY(g.path[k0])) * fr;
      if (isFinite(sx) && isFinite(sy)) {
        const tk = Math.max(0, k0 - 6), tp = xy(tk), grad = c.createLinearGradient(tp[0], tp[1], sx, sy);
        grad.addColorStop(0, "rgba(" + col + ",0)"); grad.addColorStop(1, "rgba(" + col + ",.85)");
        c.save(); c.strokeStyle = grad; c.lineWidth = 3; c.shadowColor = "rgba(" + col + ",.9)"; c.shadowBlur = 10;
        c.beginPath(); for (let k = tk; k <= k0; k++) { const p = xy(k); k === tk ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]); } c.lineTo(sx, sy); c.stroke();
        c.shadowBlur = 16; c.fillStyle = "rgba(255,255,255,.98)"; c.beginPath(); c.arc(sx, sy, 3, 0, 7); c.fill(); c.restore();
      }
    }
    c.restore();
  }
  function _fxLoop(now) {
    _fxRaf = requestAnimationFrame(_fxLoop);
    if (document.hidden || (typeof heroMode === "function" && heroMode() !== "chart")) return;   // 유휴/비차트: 그리기 skip(빈 콜백)
    if (now && (now - _fxLast) < 33) return;   // ~30fps 캡(비용 반감·시각차 미미)
    _fxLast = now || 0;
    drawFx(now);
  }
  function startFx() {
    stopFx();
    if (typeof prefersReducedMotion === "function" && prefersReducedMotion()) { drawFx(0); return; }   // 정적 1회, 루프 없음
    _fxLast = 0; _fxRaf = requestAnimationFrame(_fxLoop);
  }
  function stopFx() { if (_fxRaf) { cancelAnimationFrame(_fxRaf); _fxRaf = null; } }
  async function fetchOHLC(symbol, tf) {
    const r = await fetch(FORGE_API + "?ohlc=1&symbol=" + encodeURIComponent(symbol) + "&tf=" + encodeURIComponent(tf || "1day"), { cache: "no-store" });
    SERVER_OK = true;
    if (!r.ok) { let j = null; try { j = await r.json(); } catch (_) {} return j || { ok: false }; }
    return await r.json();
  }
  // ── 상대강도(모멘텀) 순위 — 워치리스트를 12개월 모멘텀으로 순위·정렬(수동 버튼) ──
  // 검증(momentum-robust, 28종·18년): 12개월 횡단면 모멘텀 = 학술 팩터. 비용후 롱숏 +0.59%·롱온리초과 +0.70%/월(온건). 참고용.
  let _momActive = false, _momBusy = false, _momProg = { done: 0, total: 0 };
  async function rankMomentum() {
    if (_momBusy) return;
    const docs = (typeof DOCS !== "undefined" ? DOCS : []).filter(d => _docTicker(d));
    if (!docs.length) { if (typeof bToast === "function") bToast("워치리스트에 종목이 없습니다"); return; }
    _momBusy = true; _momProg = { done: 0, total: docs.length }; renderSidebar();
    for (const d of docs) {
      const sym = _docTicker(d);
      let series = null;
      if (d.id === activeId && typeof priceSeries === "function") { const s = priceSeries(); if (s && s.length >= 60) series = s; }   // 활성 종목은 로드된 시리즈 재사용
      if (!series) { try { const r = await fetchOHLC(sym, "1day"); if (r && r.ok && Array.isArray(r.candles)) series = r.candles.map(c => +c.c).filter(isFinite); } catch (e) {} }
      if (series && series.length >= 120) { const lb = Math.min(250, series.length - 1); d._mom = series[series.length - 1] / series[series.length - 1 - lb] - 1; d._momLb = lb; }
      else { d._mom = null; d._momLb = 0; }
      _momProg.done++; renderSidebar();
    }
    const ranked = DOCS.filter(d => isFinite(d._mom)).sort((a, b) => b._mom - a._mom);
    ranked.forEach((d, i) => { d._momRank = i + 1; });
    DOCS.forEach(d => { if (!isFinite(d._mom)) d._momRank = null; });
    _momActive = ranked.length > 0; _momBusy = false; renderSidebar();
    if (typeof bToast === "function") bToast(ranked.length ? "상대강도 순위 완료 · 12개월 모멘텀(검증 팩터·온건, 참고용)" : "순위 계산 가능한 종목이 없습니다(데이터 부족)");
  }
  function clearMomRank() { _momActive = false; if (typeof DOCS !== "undefined") DOCS.forEach(d => { d._mom = null; d._momRank = null; }); renderSidebar(); }
  function toggleMomRank() { if (_momBusy) return; if (_momActive) clearMomRank(); else rankMomentum(); }   // 메인 버튼 토글: 켜져 있으면 해제(표기 제거)

  function applyTickerOHLC(n, r) {
    const cs = r.candles.map(d => ({          // 전체(캡 없음) — 인메모리라 128KB 무관
      o: +(+d.o).toFixed(4), h: +(+d.h).toFixed(4), l: +(+d.l).toFixed(4), c: +(+d.c).toFixed(4)
    }));
    n._series = cs.map(d => d.c);             // 인메모리(직렬화 제외)
    n._ohlc = cs;
    n._times = r.candles.map(d => d.t);       // 실제 날짜(시간축 눈금용, 인메모리)
    delete n.series; delete n.ohlc;           // 구버전 비언더스코어 필드 제거(직렬화 잔존 방지)
    n.params = n.params || {};
    n.params.tf = r.tf || "1day";
    n.params.name = r.name || n.params.name || "";   // 종목명(신뢰 확인용, 국내주식 등)
    n.params.price = cs[cs.length - 1].c;     // 현재가=마지막 종가 → currentData 스케일 계수 1
    n.params.fetched = true;                  // 로드 시 자동 재fetch 대상
    _heroView = "chart";
    /* 티커 실데이터 = 활성 가격원 → 이전 웹분석(비전) 오버라이드 해제.
       (안 그러면 activeTF/visionFutW가 stale _visionTF/_visionFut을 계속 써서
        일/주/월을 눌러도 단위·예측지평이 웹분석 추정값(예: 개월/24)에 갇힘) */
    _visionData = null; _visionBias = 0; _visionNote = ""; _visionWaves = [];
    _visionCoords = null; _visionTF = null; _visionFut = 0;
    if (typeof resetChartWin === "function") resetChartWin();   // 새 데이터 → 기본 윈도(Task 3)
    _needFit = true;   // 새 OHLC(불러오기·주기전환) → 자동 프레이밍
    if (typeof resetYScale === "function") resetYScale();
    markDirty(); runForge();
  }
  // ── 티커 패널(캔버스 상단) ──
  function ensureTickerNode() {
    let t = boardState.nodes.find(n => n.blockType === "ticker");
    if (!t) t = makeNode(20, 20, "티커", "block", "ticker", { symbol: "", tf: "1day", price: null });
    return t;
  }
  function renderTickerPanel() {
    const symEl = document.getElementById("tkSym"); if (!symEl) return;
    const t = boardState.nodes.find(n => n.blockType === "ticker");
    const sym = (t && t.params && t.params.symbol) || "";
    if (document.activeElement !== symEl) symEl.value = sym;
    const cur = (t && t.params && t.params.tf) || "1day";
    const seg = document.getElementById("tkSeg");
    if (seg) seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.tf === cur));
    const stat = document.getElementById("tkStat");
    if (stat) {
      const loaded = t && Array.isArray(t._series) && t._series.length >= 2;
      const state = loaded ? "ok" : sym ? "need" : "empty";
      stat.className = "tk-stat tk-dot " + state;
      stat.textContent = loaded ? (t._series.length + "봉") : "";
      stat.title = loaded ? (t._series.length + "봉 · " + (_TFKO[cur] || cur) + " 로드됨") : sym ? "불러오기 필요 — [불러오기] 클릭" : "종목 심볼을 입력하세요";
    }
  }
  function autoLogForTicker(tk) {   // 광범위(월봉 등 max/min>5) → 로그 기본(세로 가독·제어 자연스럽게)
    const cs = (tk && tk._series) || []; if (cs.length < 2) return;
    let mn = Infinity, mx = -Infinity; for (const v of cs) { if (v < mn) mn = v; if (v > mx) mx = v; }
    if (!(mn > 0)) return;
    const wide = mx / mn > 4;   // 광범위(월봉·대급등 등) → 로그, 좁으면 선형(양방향 적응)
    if (wide !== _logChart) { _logChart = wide; if (typeof updateAxisBtns === "function") updateAxisBtns(); }
  }
  async function loadTicker() {
    const t = ensureTickerNode(); let sym = (t.params.symbol || "").trim().toUpperCase();
    if (typeof _normSym === "function") sym = _normSym(sym);   // 대문자 + 크립토 슬래시 정규화(BTC/USD)
    if (sym) t.params.symbol = sym;
    const _si = document.getElementById("tkSym"); if (_si && sym && _si.value !== sym) _si.value = sym;
    if (!sym) { bToast("종목 심볼을 입력하세요 (예: BTC-USD)"); return; }
    if (!SERVER_OK) { bToast("오프라인 — 서버 연결이 필요해요"); return; }
    const tf = t.params.tf || "1day";
    bToast(sym + " 불러오는 중…");
    try {
      const r = await fetchOHLC(sym, tf);
      if (r && r.ok && Array.isArray(r.candles) && r.candles.length >= 2) {
        applyTickerOHLC(t, r); autoLogForTicker(t); runForge(); renderTickerPanel();   // 종목 선택=경량(단일TF 코어 분석·차트). 멀티TF 매트릭스·실적 증강은 '웹분석'에서(부하 분산)
        _dashDefer();   // 매트릭스는 웹분석에서 채움(선택 시 이전 종목 데이터 잔존 방지)
        if (typeof updateEngineBtn === "function") { _engineDirty = true; _autoFresh = true; updateEngineBtn(); }   // 자동(경량) 예측 완료 · 웹분석 버튼에 '심층' 유도(펄스)
        if (r.candles.length >= 20) bToast(sym + " " + (t._ohlc ? t._ohlc.length : r.candles.length) + "봉 · " + (_TFKO[tf] || tf));   // <20봉은 runForge의 _showInsufficient가 안내
      } else bToast("데이터를 찾을 수 없어요: " + sym);
    } catch (e) { bToast("불러오기 실패 — 잠시 후 다시"); }
  }
  // 차트 헤더 일/주/월 세그먼트 — 티커 실데이터일 때만 노출, 현재 주기 하이라이트
  function renderTfSeg() {
    const seg = document.getElementById("fcTfSeg"); if (!seg) return;
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && n.params && (n.params.symbol || "").trim());
    seg.style.display = tk ? "inline-flex" : "none";
    if (!tk) return;
    const cur = tk.params.tf || "1day";
    seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.tf === cur));
  }
  // 봉 주기 직접 전환: 해당 주기로 재fetch → applyTickerOHLC가 창·가격축 리셋+재계산(자동 배열)
  const _TFKO = { "1day": "일봉", "1week": "주봉", "1month": "월봉" };
  async function chartSetTF(tf) {
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && n.params && (n.params.symbol || "").trim());
    if (!tk) { bToast("상단 티커 패널에 종목을 입력하면 일·주·월 전환이 됩니다"); return; }
    const sym = tk.params.symbol.trim();
    if ((tk.params.tf || "1day") === tf && Array.isArray(tk._series) && tk._series.length >= 20) { bToast(_TFKO[tf] + " 표시 중"); renderTickerPanel(); return; }
    if (!SERVER_OK) { bToast("오프라인 — 서버 연결이 필요해요"); return; }
    tk.params.tf = tf; renderTfSeg(); renderTickerPanel();
    bToast(_TFKO[tf] + " 불러오는 중…");
    try {
      const r = await fetchOHLC(sym, tf);
      if (r && r.ok && Array.isArray(r.candles) && r.candles.length >= 2) {
        applyTickerOHLC(tk, r); autoLogForTicker(tk); runForge(); renderTickerPanel();   // 월봉 등 광범위 → 로그 기본
        _dashDefer(); if (typeof updateEngineBtn === "function") { _engineDirty = true; _autoFresh = true; updateEngineBtn(); }   // 자동(경량) 예측 완료 · 매트릭스·심층은 웹분석에서
        if (r.candles.length >= 20) bToast(sym + " " + (tk._ohlc ? tk._ohlc.length : r.candles.length) + "봉 · " + _TFKO[tf]);
      } else bToast("데이터를 찾을 수 없어요: " + sym);
    } catch (e) { bToast("불러오기 실패 — 잠시 후 다시"); }
  }
  function buildData(series) {
    const oh = priceOHLC();
    const candle = (oh && oh.length === series.length)
      ? oh.map(d => ({ o: d.o, h: d.h, l: d.l, c: d.c }))
      : series.map(c => ({ o: c, h: c, l: c, c }));
    return { price: series.slice(), candle, orange: [], blue: [], n: series.length };
  }
  function hasRealSeries() { return !!priceSeries(); }
  /* 티커 노드에 입력한 현재가 → 시계열을 그 값에 맞게 스케일(현재가를 쉽게 지정) */
  function tickerPrice() {
    const t = boardState.nodes.find(n => n.blockType === "ticker" && n.params && isFinite(n.params.price) && n.params.price > 0);
    return t ? t.params.price : null;
  }
  function currentData() {
    let s = priceSeries();
    if (!s) {
      // 불러온(fetched) 티커인데 시계열 부족(상장 초기 등) → 데모 사인 폴백 금지. 빈 데이터 객체(null 아님) → runForge가 '데이터 부족' 표시 + 모든 currentData().price 접근 안전(레이스 크래시 방지).
      if (boardState.nodes.some(n => n.blockType === "ticker" && n.params && n.params.fetched)) return { price: [], candle: [] };
      return data;
    }
    const tp = tickerPrice();
    if (tp && s.length) { const last = s[s.length - 1]; if (last > 0 && Math.abs(last - tp) / tp > 0.001) s = s.map(v => v * tp / last); }
    return buildData(s);
  }
  /* ── 웹분석(runEngine): 브라우저 엔진 수동 실행(버튼) ─────────────────────────────────
     포지결과는 '웹분석' 버튼을 눌러야 계산된다. 노드/가중치 변경은 '변경됨'으로 표시만.
     ('엔진분석' 버튼=claudeEngine은 클로드 수동분석 예정 기능 스텁) */
  let _engineDirty = false, _lastAnalyzedAt = null, _autoFresh = false;   // _autoFresh=현재 표시본이 '선택 시 자동(경량) 예측'(실제 계산·심층 대기)인지
  function _fmtAgo(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return "방금";
    const m = Math.round(s / 60); if (m < 60) return m + "분 전";
    const h = Math.round(m / 60); return h + "시간 전";
  }
  function updateEngineBtn() {
    const b = document.getElementById("analyzeBtn");
    if (b) b.classList.toggle("needs-run", _engineDirty);
    const st = document.getElementById("engStat"); if (!st) return;
    if (_engineDirty && !_autoFresh) {   // 노드/설정을 실제로 바꿔 코어 결과가 낡음 → 재분석 필요
      st.className = "eng-stat stale";
      st.textContent = "● 변경됨 · 재분석 필요";
      st.title = "노드/설정이 바뀌었습니다 — ▷ 웹분석을 눌러 결과를 갱신하세요";
    } else if (_autoFresh && _lastAnalyzedAt) {   // 선택 시 자동 계산된 실제 예측(심층은 대기) — 보여주기식 아님을 정직 표기
      const d = new Date(_lastAnalyzedAt), hh = ("0" + d.getHours()).slice(-2), mm = ("0" + d.getMinutes()).slice(-2);
      st.className = "eng-stat ok";
      st.textContent = "✓ 자동 예측 " + hh + ":" + mm + " · 웹분석=심층";
      st.title = "종목 선택 시 실데이터로 자동 계산된 경량 예측입니다(보여주기식 아님). '웹분석'을 누르면 멀티TF 매트릭스·실적까지 심층 갱신합니다.";
    } else if (_lastAnalyzedAt) {
      const d = new Date(_lastAnalyzedAt), YY = d.getFullYear(), MM = ("0" + (d.getMonth() + 1)).slice(-2), DD = ("0" + d.getDate()).slice(-2), hh = ("0" + d.getHours()).slice(-2), mm = ("0" + d.getMinutes()).slice(-2);
      st.className = "eng-stat ok";
      st.textContent = "✓ 웹분석 " + YY + "." + MM + "." + DD + " " + hh + ":" + mm;
      st.title = "현재 결과는 " + YY + "." + MM + "." + DD + " " + hh + ":" + mm + " 웹분석(심층)본입니다 (" + _fmtAgo(_lastAnalyzedAt) + ")";
    } else {
      st.className = "eng-stat"; st.textContent = "";
    }
  }
  function markEngineDirty() { _engineDirty = true; _autoFresh = false; updateEngineBtn(); }   // 실제 변경 → 자동예측 표기 해제(재분석 필요로)
  function _ensureAnalyzeGauge() {
    const pane = document.getElementById("chartPane") || document.body;
    let ov = document.getElementById("analyzeGauge");
    if (!ov) { ov = document.createElement("div"); ov.id = "analyzeGauge"; ov.className = "analyze-gauge";
      ov.innerHTML = '<div class="ag-card"><div class="ag-title">웹분석</div><div class="ag-stage" id="agStage">지표 계산 중…</div><div class="ag-bar"><span class="ag-fill" id="agFill"></span></div><div class="ag-pct" id="agPct">0%</div></div>'; }
    pane.appendChild(ov);   // 항상 최상단
    return ov;
  }
  let _agBusy = false;
  async function runEngine() {
    if (_playing) stopPlay();
    if (_firstIdle || !hasRealSeries()) { if (typeof bToast === "function") bToast("왼쪽 워치리스트에서 종목을 먼저 선택하세요"); return; }   // 첫 진입 idle·데이터 미로드 시 안내(데이터 부족 화면 대신)
    if (_agBusy) return; _agBusy = true;
    const ov = _ensureAnalyzeGauge(); ov.classList.add("on");
    const fill = document.getElementById("agFill"), pct = document.getElementById("agPct"), stg = document.getElementById("agStage");
    const stages = ["지표 계산 중…", "예측 시나리오 산출 중…", "종합 판정 중…"];
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));   // 오버레이 페인트
    // 심층 분석(웹분석 버튼 전용): 실적일 로드(주식 갭 증강) + 멀티TF 매트릭스 — 종목 선택보다 무거운 작업을 여기로 분산
    try { const _tk = boardState.nodes.find(n => n.blockType === "ticker" && n.params && (n.params.symbol || "").trim() && (Array.isArray(n._ohlc) || n.params.fetched)); if (_tk && !_tk._earnDate && typeof _loadEarnDate === "function") await _loadEarnDate(_tk); } catch (e) {}
    try { if (typeof _loadSpy === "function") await _loadSpy(); } catch (e) {}   // 상대강도(v1.10): SPY 기준 시계열(세션 1회 캐시)
    _wantDeep = true;   // 이 runForge의 renderVerdict가 매트릭스(scheduleDash)를 예약하도록
    runForge(); _engineDirty = false; _autoFresh = false; updateEngineBtn();   // 실제 계산(오버레이 뒤) — 실적 증강 + 매트릭스 포함(심층 완료)
    await new Promise(res => {
      const t0 = performance.now(), dur = 950;
      (function step(now) {
        const u = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - u, 2.2), p = Math.round(e * 100);
        if (fill) fill.style.width = p + "%"; if (pct) pct.textContent = p + "%";
        if (stg) stg.textContent = stages[Math.min(stages.length - 1, Math.floor(e * stages.length))];
        if (u < 1) { requestAnimationFrame(step); return; } res();
      })(t0);
    });
    ov.classList.remove("on"); _agBusy = false;
    bToast("웹분석 완료 · 포지결과 갱신");
    try { logPrediction(); } catch (e) {}   // 라이브 트랙레코드: 실 티커 예측 자동 기록(서버 원장)
  }

  // ── 라이브 트랙레코드 ──────────────────────────────────────────
  // 실 티커 웹분석 시 예측 스냅샷을 서버 원장(forge-api.php op=logpred)에 기록(중복 제거).
  // 만기 도래분은 서버가 OHLC 캐시로 자동 채점 → 배지·스코어카드에 실측 적중 노출.
  const _loggedPreds = new Set();
  let _predAgg = null;
  function logPrediction() {
    if (typeof SERVER_OK === "undefined" || !SERVER_OK || typeof apiPost !== "function") return;
    const r = _fcLastResult; if (!r || !r.verdict) return;
    const ctx = r.verdict.context || {};
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && n.params && (n.params.symbol || "").trim() && (Array.isArray(n._ohlc) || n.params.fetched));
    if (!tk) return;   // 실 데이터 티커만(데모/합성 제외)
    const sym = (tk.params.symbol || "").trim().toUpperCase();
    const tf = (tk.params.tf && ["1day", "1week", "1month"].includes(tk.params.tf)) ? tk.params.tf : "1day";
    const times = Array.isArray(tk._times) ? tk._times : null;
    const asOf = (times && times.length) ? String(times[times.length - 1]).slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return;
    const price = (_fcLastData && _fcLastData.price) || [];
    const asOfPrice = price.length ? price[price.length - 1] : (r.prediction && r.prediction.anchor);
    if (!(asOfPrice > 0)) return;
    const dedup = sym + "|" + tf + "|" + asOf;
    if (_loggedPreds.has(dedup)) return; _loggedPreds.add(dedup);
    const up = (typeof aggUpProb === "function") ? Math.round(aggUpProb(r.prediction) * 100) : 50;
    const vf = ctx.volForecast, dd = ctx.ddRisk, ut = ctx.upTarget, spk = ctx.spikeRisk, gap = ctx.gapRisk, tp = ctx.trendPersist;
    const ddP = dd ? ((dd.curve && dd.curve[0]) ? dd.curve[0].prob : dd.prob) : 0;
    const upP = ut ? ((ut.curve && ut.curve[0]) ? ut.curve[0].prob : ut.prob) : 0;
    apiPost({ op: "logpred", sym, tf, asOf, asOfPrice: +asOfPrice,
      futW: (r.prediction && r.prediction.futW) || 60,
      dir: (r.verdict.score || 0) > 0 ? 1 : ((r.verdict.score || 0) < 0 ? -1 : 0),
      up, volExp: (vf && vf.expand) ? 1 : 0, ddP, upP,
      spkP: spk ? spk.prob : 0,                                  // 급변 예측 확률(대표 2.5σ·20봉)
      gapP: gap ? gap.prob : 0, gapStock: gap ? 1 : 0,           // 갭 예측 확률(대표 2.2σ·20봉)·주식여부(게이트 통과=1)
      tpState: tp ? tp.state : "", tpPersist: tp ? tp.persist : 50,   // 추세 지속: 국면·지속확률(대표 1달)
      relP: ctx.relStrength ? ctx.relStrength.prob : 0, relStock: ctx.relStrength ? 1 : 0,   // 상대강도(v1.10): SPY 아웃퍼폼 확률(대표 1달)·게이트 통과 여부
    }).then(() => { fetchPredLedger(); }).catch(() => {});
  }
  async function fetchPredLedger() {
    if (typeof SERVER_OK === "undefined" || !SERVER_OK || typeof apiGet !== "function") return;
    try { const a = await apiGet("?predledger=1"); if (a && a.ok) { _predAgg = a; updateLiveBadge(); } } catch (e) {}
  }
  function updateLiveBadge() {
    const el = document.getElementById("liveTrack"); if (!el) return;
    const a = _predAgg;
    if (!a || !a.resolved) { el.style.display = "none"; return; }
    let lead = "";
    if (a.dd && a.dd.n >= 3 && a.dd.actRate != null) lead = "낙폭 예측 " + Math.round(a.dd.predAvg * 100) + "%→실제 " + Math.round(a.dd.actRate * 100) + "%";
    else if (a.dir && a.dir.n >= 3 && a.dir.rate != null) lead = "방향 " + Math.round(a.dir.rate * 100) + "%";
    el.textContent = "라이브 " + a.resolved + "건" + (lead ? " · " + lead : "");
    el.style.display = "inline-flex";
  }
  // 엔진분석 = 클로드 수동분석(예정 기능). 현재는 안내만.
  function authSoon() { if (typeof bToast === "function") bToast("로그인·회원가입은 준비 중입니다"); }
  const THEMES = {
    navy:     { name: "네이비", group: "dark", c: "#0b0f14", g: "#e8b463", vars: { "--bg": "#0b0f14", "--panel": "#121822", "--surface": "#141a22", "--raised": "#1b232d", "--raised2": "#27313e", "--line": "#1e2633", "--edge": "#566472", "--ink": "#e7ecf5", "--eth": "#8a92b2", "--muted": "#8b98a6", "--faint": "#6a7688", "--gold": "#e8b463", "--gold-dim": "#5e4d2c", "--bull": "#46c28e", "--bear": "#e06a6a", "--hover": "rgba(255,255,255,.05)", "--scrim": "rgba(11,15,20,.72)", "--grid": "#1b2334", "--chart-bg": "#0b0f14" } },
    midnight: { name: "미드나잇 (기본)", group: "dark", c: "#07080b", g: "#e8b463", vars: { "--bg": "#07080b", "--panel": "#0d0f13", "--surface": "#101318", "--raised": "#171a20", "--raised2": "#222631", "--line": "#181b23", "--edge": "#4a5560", "--ink": "#e7ecf5", "--eth": "#8a92b2", "--muted": "#8b98a6", "--faint": "#68748a", "--gold": "#e8b463", "--gold-dim": "#5e4d2c", "--bull": "#46c28e", "--bear": "#e06a6a", "--hover": "rgba(255,255,255,.05)", "--scrim": "rgba(7,8,11,.75)", "--grid": "#161b26", "--chart-bg": "#07080b" } },
    teal:     { name: "딥틸 (청록)", group: "dark", c: "#0b1517", g: "#5ec8b6", vars: { "--bg": "#0b1517", "--panel": "#101f21", "--surface": "#13262a", "--raised": "#182d31", "--raised2": "#233d42", "--line": "#172a2c", "--edge": "#3d5a5c", "--ink": "#e6f0ee", "--eth": "#8aa5a2", "--muted": "#8ba6a3", "--faint": "#6a827f", "--gold": "#5ec8b6", "--gold-dim": "#2e5a52", "--bull": "#46c28e", "--bear": "#e06a6a", "--hover": "rgba(255,255,255,.05)", "--scrim": "rgba(11,21,23,.72)", "--grid": "#173033", "--chart-bg": "#0b1517" } },
    purple:   { name: "로열 퍼플", group: "dark", c: "#100b18", g: "#b58cf0", vars: { "--bg": "#100b18", "--panel": "#181121", "--surface": "#1c1526", "--raised": "#241a30", "--raised2": "#33264a", "--line": "#241a32", "--edge": "#4d3d66", "--ink": "#ece7f5", "--eth": "#9a8ab2", "--muted": "#9b8ba6", "--faint": "#7d6c98", "--gold": "#b58cf0", "--gold-dim": "#4a3a66", "--bull": "#46c28e", "--bear": "#e06a6a", "--hover": "rgba(255,255,255,.05)", "--scrim": "rgba(16,11,24,.72)", "--grid": "#241a34", "--chart-bg": "#100b18" } },
    orange:   { name: "앰버 오렌지", group: "dark", c: "#14100b", g: "#e8955c", vars: { "--bg": "#14100b", "--panel": "#1d160e", "--surface": "#221a11", "--raised": "#291e13", "--raised2": "#3a2c1b", "--line": "#271d13", "--edge": "#5a4a30", "--ink": "#f5ece0", "--eth": "#b29a8a", "--muted": "#a6938b", "--faint": "#847668", "--gold": "#e8955c", "--gold-dim": "#5e412c", "--bull": "#46c28e", "--bear": "#e06a6a", "--hover": "rgba(255,255,255,.05)", "--scrim": "rgba(20,16,11,.72)", "--grid": "#2b2015", "--chart-bg": "#14100b" } },
    paper:    { name: "페이퍼", group: "light", c: "#f4f2ec", g: "#b0842f", vars: { "--bg": "#f4f2ec", "--panel": "#ffffff", "--surface": "#faf9f5", "--raised": "#eeece4", "--raised2": "#e4e1d7", "--line": "#e2e0d8", "--edge": "#c9c6bb", "--ink": "#1c2128", "--eth": "#4c5563", "--muted": "#5f6773", "--faint": "#6d747e", "--gold": "#2b3440", "--gold-dim": "#c7ccd4", "--bull": "#0f8a4a", "--bear": "#cf3a34", "--hover": "rgba(0,0,0,.045)", "--scrim": "rgba(30,34,42,.5)", "--grid": "#d7dde6", "--chart-bg": "#0b0f14" } },
    daylight: { name: "데이라이트", group: "light", c: "#f7f9fb", g: "#b0842f", vars: { "--bg": "#eef1f5", "--panel": "#ffffff", "--surface": "#f7f9fb", "--raised": "#eef1f5", "--raised2": "#e3e7ee", "--line": "#dde2ea", "--edge": "#c2c9d4", "--ink": "#1a1f27", "--eth": "#4c5563", "--muted": "#5f6773", "--faint": "#6d747e", "--gold": "#2b3440", "--gold-dim": "#c7ccd4", "--bull": "#0f8a4a", "--bear": "#cf3a34", "--hover": "rgba(0,0,0,.045)", "--scrim": "rgba(26,31,39,.5)", "--grid": "#dfe4ec", "--chart-bg": "#f7f9fb" } },
  };
  let _theme = (function () { try { return localStorage.getItem("scoopforge_theme") || "midnight"; } catch (e) { return "midnight"; } })();
  function applyTheme(key) {
    const t = THEMES[key] || THEMES.midnight; _theme = THEMES[key] ? key : "midnight";
    const r = document.documentElement.style; Object.entries(t.vars).forEach(([k, v]) => r.setProperty(k, v));
    document.documentElement.classList.toggle("light", t.group === "light");   // 라이트 전용 CSS 보정(하드코딩 색·골드버튼 대비)
    try { localStorage.setItem("scoopforge_theme", _theme); } catch (e) {}
    renderThemePop();
    _syncChartColors();   // 차트 캔버스 색(격자/골드)을 새 테마에 동기화
    if (typeof renderHeroZoom === "function") try { renderHeroZoom(); } catch (e) {}
    try { if (typeof renderChart === "function" && typeof hasRealSeries === "function" && hasRealSeries() && lastResult) renderChart(lastResult, currentData()); } catch (e) {}   // 차트 재드로(격자/골드 반영)
  }
  function renderThemePop() {
    const pop = document.getElementById("themePop"); if (!pop) return;
    const groups = { dark: "다크", light: "라이트" };
    pop.innerHTML = Object.entries(groups).map(([gk, gname]) => {
      const items = Object.entries(THEMES).filter(([, t]) => (t.group || "dark") === gk);
      if (!items.length) return "";
      return `<div class="th-h">${gname}</div>` + items.map(([k, t]) => `<button class="theme-opt${k === _theme ? " on" : ""}" onclick="applyTheme('${k}');toggleThemePop(true)"><span class="th-sw" style="background:${t.c};box-shadow:inset 0 0 0 2px ${t.g}"></span>${t.name}</button>`).join("");
    }).join("");
  }
  function toggleThemePop(close) {
    const pop = document.getElementById("themePop"); if (!pop) return;
    if (close) { pop.classList.remove("open"); return; }
    if (!pop.classList.contains("open")) renderThemePop();
    pop.classList.toggle("open");
  }
  document.addEventListener("click", e => { const w = e.target.closest(".theme-wrap"); if (!w) { const p = document.getElementById("themePop"); if (p) p.classList.remove("open"); } });
  function claudeEngine() { bToast("엔진분석(클로드 수동분석)은 준비 중입니다 — 예정 기능"); }
  /* 붙여넣은 텍스트 → 종가 배열. 한 줄=한 봉. 줄에 4개 이상 수면 OHLC(V)로 보고 종가(4번째) 사용. */
  function parseSeries(txt) {
    const out = [];
    String(txt).split(/[\n\r]+/).forEach(ln => {
      const nums = ln.split(/[\s,;\t]+/).map(Number).filter(v => isFinite(v));
      if (nums.length) out.push(nums.length >= 4 ? nums[3] : nums[nums.length - 1]);
    });
    return out;
  }
  /* 결정적 예시 종가 시계열(데이터 없이 연속 차트 기능 확인용) */
  function sampleCloseSeries() {
    const out = []; let p = 230;
    for (let i = 0; i < 170; i++) { p += Math.sin(i / 8) * 7 + Math.sin(i / 3) * 2.2 + (i > 95 ? 1.7 : 0.4); out.push(Math.round(p * 100) / 100); }
    return out;
  }
  let lastResult = null;
  let _t = null;
  let _playT = null, _playRaf = null, _playing = false, _analyzeNode = null, _zoomEl = null, _playTimers = [];
  // 시연 진행 상태 — 차트 외 시각화(레이더·신호보드·예측·국면)를 실제 분석 진행에 맞춰 동적 반영
  // ids=현재까지 '계산 완료'된 지표 노드 집합(null=전체 표시) · u=종합(예측/국면) 형성 진행도 0→1
  let _playReveal = { ids: null, u: 1 };
  let _playPred = null, _playE = 0;   // 시뮬레이션 현재 모프 프레임(예측)·진행도 — 조작 중 재드로우가 최종 아닌 현재 프레임을 그리게
  /* 스케치 스캔 공개: 근거 오버레이를 왼→오른쪽으로 점진 공개(clip-path). 캔들/차트는 안 건드림. */
  let _scanning = false, _scanU = 0;
  function _applyScanClip(u) {
    const r = Math.max(0, Math.min(100, (1 - u) * 100));
    const cp = (u >= 1) ? "" : "inset(0 " + r.toFixed(2) + "% 0 0)";
    ["fcEvidence", "fcEvidenceHi"].forEach(id => { const el = document.getElementById(id); if (el) el.style.clipPath = cp; });
  }
  /* 재생 중 예측구간 줌인(끝나면 줌아웃) — 차트/오버레이 공용 */
  function predZoomIn() {
    const mode = (typeof heroMode === "function") ? heroMode() : "chart";
    let el, nowX = null, rightX = null, bandTop = null, bandBot = null, W = 0, H = 0;
    if (mode === "chart") {
      el = document.getElementById("fcMainChart");
      const g = el && el._mainGeo; W = el ? el.clientWidth : 0; H = el ? el.clientHeight : 0;
      if (g) { nowX = g.seamX; rightX = g.padX + g.plotW; bandTop = g.bandTop; bandBot = g.bandBot; }
    } else {
      el = document.getElementById("fcHeroImg");
      const cone = document.getElementById("fcCone"), g = cone && cone._coneGeo; W = cone ? cone.clientWidth : 0; H = cone ? cone.clientHeight : 0;
      if (g) { nowX = g.nowX; rightX = g.rightX; bandTop = g.bandTop; bandBot = g.bandBot; }
    }
    if (!el) return;
    _zoomEl = el;
    const ev = document.getElementById("fcEvidence");
    if (!W || nowX == null || rightX <= nowX) { const t = "scale(1.6)"; el.style.transformOrigin = "72% 50%"; el.style.transform = t; if (ev) { ev.style.transformOrigin = "72% 50%"; ev.style.transform = t; } return; }
    const regionW = rightX - nowX, m = (nowX + rightX) / 2;
    let s = 0.94 * W / regionW; s = Math.max(1.4, Math.min(2.6, s));   // 예측범위가 뷰 폭의 ~94%를 채우게
    const ox = (W / 2 - m * s) / (1 - s);   // 예측범위 중점 → 화면 가로 정중앙
    const bandC = (bandTop != null && bandBot != null) ? (bandTop + bandBot) / 2 : (H / 2);
    const oy = (H / 2 - bandC * s) / (1 - s);   // 예측 밴드 중심 → 화면 세로 정중앙
    const org = ox + "px " + oy + "px", tr = "scale(" + s + ")";
    el.style.transformOrigin = org; el.style.transform = tr;
    if (ev) { ev.style.transformOrigin = org; ev.style.transform = tr; }   // 근거 레이어도 동일 변환(정합)
  }
  function predZoomOut() {
    if (!_zoomEl) return;
    const el = _zoomEl; _zoomEl = null;
    el.style.transform = "scale(1)";
    const ev = document.getElementById("fcEvidence"); if (ev) ev.style.transform = "scale(1)";
  }

  function paintScanBadges() {
    if (!lastResult || !bWorld) return;
    boardState.nodes.forEach(n => {
      if (n.blockType !== "phasefold" && n.blockType !== "elliott") return;
      const el = bq(n.id); if (!el) return;
      const body = el.querySelector(".b-n-body"); if (!body) return;
      let s = el.querySelector(".b-n-scan");
      if (!s) { s = document.createElement("div"); s.className = "b-n-scan"; body.appendChild(s); }
      const m = lastResult.meta && lastResult.meta[n.id];
      if (n.blockType === "phasefold") {
        s.textContent = m && m.best != null
          ? "P*≈" + Math.round(m.best) + (m.kbest ? " ·" + m.kbest + "주기" : "") + (Number.isFinite(m.theta) ? " θ" + m.theta.toFixed(2) : "")
          : "스캔 대기";
      } else {
        if (m && m.current) {
          const minorTxt = "소(" + m.current.label + " " + (m.current.dir > 0 ? "▲" : m.current.dir < 0 ? "▼" : "–") + ")";
          const pst = m.primary && m.primary.structure;
          const pAbbr = pst === "impulse_up" ? "임펄스↑" : pst === "impulse_down" ? "임펄스↓" : pst === "corrective" ? "ABC" : null;
          s.textContent = pAbbr ? "대(" + pAbbr + ") · " + minorTxt : minorTxt;
        } else {
          s.textContent = "스캔 대기";
        }
      }
    });
  }

  /* ── 포지 분석 재생 ─────────────────────────────────────────── */
  function clearAnalyzeViz() {
    if (bWorld) bWorld.querySelectorAll(".b-node.analyzing,.b-node.analyzed")
      .forEach(el => el.classList.remove("analyzing", "analyzed"));
    _analyzeNode = null;
    const eg = document.getElementById("bEdges"); if (eg) eg.classList.remove("flow");
    const hud = document.getElementById("playHud");   // 시연 중단 — 창은 계속 표시(숨기지 않음)
  }
  function stopPlay() {
    if (_playT) clearTimeout(_playT);
    if (_playRaf) cancelAnimationFrame(_playRaf);
    _playTimers.forEach(clearTimeout); _playTimers = [];
    _playT = null; _playRaf = null; _playing = false; updatePlayBtn();
    _evReveal = {}; _playReveal = { ids: null, u: 1 };   // 중단 → 차트 외 시각화 전체 확정 표시
    _scanning = false; _scanU = 1;   // 작도 중단 → 전체 표시
    _dashFill(null);
    clearAnalyzeViz();
    try { if (lastResult) { renderNodeAnalysis(lastResult); renderSignalBoard(); renderHorizons(lastResult); if (lastResult.verdict) renderVerdict(lastResult.verdict); } } catch (e) {}
    const pr = document.getElementById("analyzeProg"); if (pr) pr.textContent = "";
  }
  function lerpPred(a, b, u) {
    const n = Math.min((a.path || []).length, (b.path || []).length);
    const path = [], lo = [], hi = [];
    for (let k = 0; k < n; k++) {
      path.push(a.path[k] + (b.path[k] - a.path[k]) * u);
      lo.push(a.lo[k] + (b.lo[k] - a.lo[k]) * u);
      hi.push(a.hi[k] + (b.hi[k] - a.hi[k]) * u);
    }
    const out = { path, lo, hi, anchor: (b.anchor != null ? b.anchor : a.anchor) };
    // 3차(반대 시나리오) 라인도 anchor에서 최종으로 함께 펼침 — 마지막에 선이 툭 튀어나오지 않게
    if (Array.isArray(b.counter) && b.counter.length) {
      const A = out.anchor, ac = (Array.isArray(a.counter) && a.counter.length === b.counter.length) ? a.counter : b.counter.map(() => A);
      out.counter = b.counter.map((v, k) => ac[k] + (v - ac[k]) * u);
    }
    return out;
  }
  const _ease = t => (t < 0.5) ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // easeInOutQuad
  const _REG = { bull: { c: "var(--bull)", t: "상승" }, bear: { c: "var(--bear)", t: "하락" }, neutral: { c: "var(--eth)", t: "중립" } };
  const _sigOf = s => (s.signal && s.signal.length) ? s.signal[s.signal.length - 1] : 0;
  /* 동시 분석: 모든 지표가 각자의 가중치·근거로 동시에 의견을 내고, 마지막에 버무려 '포지'가 형성된다.
     (순차 파이프라인이 아니라 '의회/은하' 모델 — 중심의 포지가 주변 지표를 종합) */
  // 시연: 오실레이터(RSI·거래량·MACD·ADX)를 진행도 r(0→1)에 맞춰 좌→우로 '계산되며 그려지는' 효과
  function _redrawOscForPlay(r) {
    const price = (currentData().price) || []; if (price.length < 2) return;
    let n;
    try {
      if ((n = boardState.nodes.find(x => x.blockType === "rsi"))) fcDrawRsi(_an("RSI", price, { period: (n.params && n.params.period) || 14 }), r);
      if ((n = boardState.nodes.find(x => x.blockType === "volume"))) fcDrawVol(_anVolume(price), r);
      if ((n = boardState.nodes.find(x => x.blockType === "cci"))) fcDrawCci(_an("CCI", price, { period: (n.params && n.params.period) || 20 }), r);
      if ((n = boardState.nodes.find(x => x.blockType === "williams"))) fcDrawWilliams(_anWilliams(price, { period: (n.params && n.params.period) || 14 }), r);
      if ((n = boardState.nodes.find(x => x.blockType === "mfi"))) fcDrawMfi(_anMfi(price, { period: (n.params && n.params.period) || 14 }), r);
    } catch (e) {}
  }
  // 타임프레임 매트릭스: 각 게이지 셀의 값·막대를 진행 u(0→1)에 맞춰 0→최종으로 채움(순차 공개 아님). u=null=최종
  function _dashFill(u) {
    const f = (u == null) ? 1 : Math.max(0, Math.min(1, u));
    document.querySelectorAll("#fcDashBody .dash-cell[data-pct]").forEach(cell => {
      const pct = +cell.getAttribute("data-pct");
      const fbar = cell.querySelector(".dbar-f"); if (fbar) fbar.style.width = (pct * f) + "%";
      if (cell.hasAttribute("data-fnum")) { const fn = +cell.getAttribute("data-fnum"), suf = cell.getAttribute("data-suf") || ""; const dv = cell.querySelector(".dval"); if (dv) dv.textContent = Math.round(fn * f) + suf; }
    });
    // 일/주/월 카드 상승/하락 확률 바·시그널 바도 시연 진행도에 맞춰 0→최종으로 채움
    document.querySelectorAll("#fcDashBody .tf-card-prob[data-up]").forEach(pr => {
      const up = Math.round(+pr.getAttribute("data-up") * f);
      pr.innerHTML = '<span class="tcp-up">▲<b>' + up + '</b>%</span><span class="tcp-bar"><i class="tcp-f" style="width:' + up + '%"></i></span><span class="tcp-dn">▼<b>' + (100 - up) + '</b>%</span>';
    });
    document.querySelectorAll("#fcDashBody .tf-card-viz[data-up]").forEach(viz => {
      const score = +viz.getAttribute("data-score"), col = viz.getAttribute("data-col");
      viz.innerHTML = '<span class="tfb"><span class="tfb-k">시그널</span>' + _hbarDiv(score * f, col) + '<b class="tfb-v" style="color:' + col + '">' + Math.round(score * f) + '</b></span>';
    });
  }
  function updatePlayBtn() {
    const b = document.getElementById("playBtn"); if (!b) return;
    if (_playing) { b.innerHTML = '■<span class="hlbl"> 중지</span>'; b.classList.add("playing"); b.title = "시뮬레이션 중지"; }
    else { b.innerHTML = '▶<span class="hlbl"> 시뮬레이션</span>'; b.classList.remove("playing"); b.title = "시뮬레이션 — 웹분석의 산출 과정을 지표별 작도 애니메이션으로 재생(웹분석의 하위 기능)"; }
    const bf = document.getElementById("fcFsPlay");   // 전체화면 플로팅 독 버튼도 동기화
    if (bf) { bf.innerHTML = b.innerHTML; bf.classList.toggle("playing", _playing); bf.title = b.title; }
  }
  function playAnalysis() {
    if (_playing) { stopPlay(); return; }      // 토글: 재생 중 누르면 중단
    if (_firstIdle || !hasRealSeries()) { if (typeof bToast === "function") bToast("왼쪽 워치리스트에서 종목을 먼저 선택하세요"); return; }
    deselectAll();                              // 편집기 닫고 차트가 보이게(예측 모핑 가시화)
    runForge(); _engineDirty = false; updateEngineBtn();   // 시연도 재계산 → 변경됨 해제
    if (typeof scheduleDash === "function") scheduleDash();   // 매트릭스 데이터 준비(있으면) — 데모 중 순차 공개
    { const _h = document.getElementById("playHud"); if (_h) { _h.classList.add("on"); if (!_playHudUserCollapsed) { _h.classList.remove("collapsed"); const _mb = document.getElementById("playHudMin"); if (_mb) _mb.textContent = "–"; } } }   // 시뮬레이션 = 진행로그 자동 펼침(사용자가 접어둔 경우 제외, 모션축소 모드 포함)
    let steps;
    try { steps = ForgeCore.runSteps(boardToGraph(), currentData(), { futW: visionFutW(), visionBias: visionBiasLive(), timeframe: activeTF(), driftWeights: _driftW, ..._earnOpts(), ..._relOpts() }); }
    catch (e) { console.warn("steps", e); return; }
    if (!steps.length) return;
    const fin = steps[steps.length - 1];                       // 최종(전체 결합) 결과
    const finPred = fin.prediction, finSig = _sigOf(fin);
    const indNodes = boardState.nodes.filter(n => n.kind === "block" && ["ma", "trend", "fib", "elliott", "rsi", "phasefold", "volume", "bollinger", "macd", "adx", "volumeprofile", "ichimoku", "structure", "atr", "smc", "cycle", "vwap", "supertrend", "stochastic", "pivot", "psar", "keltner", "donchian", "cci", "williams", "roc", "ao", "aroon", "mfi", "cmf"].includes(n.blockType) && (!_evVisible || !_evVisible.size || _evVisible.has(n.blockType)));   // 시연=선택(표시)된 지표만 작도·진행
    const center = boardState.nodes.find(n => n.blockType === "predict") || boardState.nodes.find(n => n.blockType === "combine");
    if (prefersReducedMotion()) {
      _evidenceSet = new Set(indNodes.map(n => n.id));
      renderChart(lastResult, currentData());
      if (fin.verdict) renderVerdict(fin.verdict);
      if (window.renderOverlay) renderOverlay(lastResult, boardToGraph());
      bToast("포지 분석 완료 · " + indNodes.length + "개 지표 결합"); return;
    }
    _playing = true; updatePlayBtn();
    clearAnalyzeViz();
    // 손그림 작도: 모든 도구를 동시에, 진행도(_scanU 0→1)에 맞춰 선이 그어지듯 작도(스캔 아님)
    _evidenceSet = new Set(indNodes.map(n => n.id));
    _evReveal = {}; indNodes.forEach(n => { _evReveal[n.id] = Infinity; });
    _scanning = true; _scanU = 0; drawEvidence();
    // 차트 외 시각화 초기화: 레이더·신호보드 전부 흐리게(아직 계산 전), 예측·국면은 0에서 형성
    _playReveal = { ids: new Set(), u: 0 };
    renderNodeAnalysis(lastResult); renderSignalBoard();
    _redrawOscForPlay(0);   // 오실레이터 비우고 시작 → 데모 진행에 맞춰 좌→우로 그려짐
    { const _lb0 = document.getElementById("analyzeLogBody"); if (_lb0) _lb0.innerHTML = ""; }
    const hud = document.getElementById("playHud"); if (hud) { hud.classList.add("on"); if (!_playHudUserCollapsed) { hud.classList.remove("collapsed"); const _mb = document.getElementById("playHudMin"); if (_mb) _mb.textContent = "–"; } _restoreHudPos("scoopforge_hud_play", hud); }   // 시뮬레이션 = 진행로그 자동 펼침(사용자가 접어둔 경우 제외)
    const progEl = document.getElementById("analyzeProg");
    const _pnode = boardState.nodes.find(n => n.blockType === "price");
    const _pv = _pnode && lastResult.values && lastResult.values[_pnode.id];
    const priceLast0 = (_pv && _pv.length) ? _pv[_pv.length - 1] : null;
    // 하위단계 순차 점등 HUD. steps=[{text,layer}], upto=현재 점등 인덱스
    function _hudNodeSteps(n, idx, steps, upto) {
      if (!hud) return;
      const conv = n.conviction || 0;
      const lc = conv > 5 ? "var(--bull)" : conv < -5 ? "var(--bear)" : "var(--eth)";
      const memo = (n.note && n.note.trim()) || (n.desc && n.desc.trim()) || "";
      const segs = indNodes.map((_, k) => `<span class="ph-seg ${k < idx ? "done" : k === idx ? "cur" : ""}"></span>`).join("");
      const stepHtml = steps.map((st, i) => `<span class="ph-step ${i < upto ? "lit" : i === upto ? "lit cur" : ""}">${esc(st.text)}</span>`).join("");
      const body = document.getElementById("playHudBody"); if (!body) return;
      body.innerHTML =
        `<span class="ph-dot" style="color:${lc}"></span>
         <div class="ph-node"><span class="ph-title">${esc(BTLABEL[n.blockType] || n.blockType)}${n.title ? " · " + esc(n.title) : ""}</span>
           <div class="ph-steps">${stepHtml}</div>
           ${memo ? `<span class="ph-memo">&ldquo;${esc(memo)}&rdquo;</span>` : ""}</div>
         <div class="ph-prog"><span class="ph-knt">${idx + 1}/${indNodes.length}</span><span class="ph-bar">${segs}</span></div>`;
    }
    function _logAppend(n, text, important) {
      const body = document.getElementById("analyzeLogBody"); if (!body) return;
      const row = document.createElement("div"); row.className = "lg" + (important ? " lg-key" : "");
      row.innerHTML = "<b>[" + esc(BTLABEL[n.blockType] || n.blockType) + "]</b> " + esc(text);
      body.appendChild(row); body.scrollTop = body.scrollHeight;
    }
    // 노드별 다단계 시연 — 각 노드의 분석단계를 틱으로 펼쳐 순차 점등(시연 길어짐 OK)
    const _allPrice = (currentData().price) || [];
    const stepsByNode = indNodes.map(n => { try { return analysisSteps(n, lastResult, priceLast0, _allPrice); } catch (e) { return [{ text: (BTLABEL[n.blockType] || n.blockType) + " 분석", layer: 1 }]; } });
    const ticks = [];
    indNodes.forEach((n, idx) => { stepsByNode[idx].forEach((st, sIdx) => ticks.push({ n, idx, steps: stepsByNode[idx], sIdx, st })); });
    // 하위단계 간격 — 지표가 많을수록 짧게(총 시연 ~16초 목표, 지표당 최소 리듬 유지)
    const STEP_SUB = Math.max(150, Math.min(620, Math.round(16000 / Math.max(1, ticks.length))));
    ticks.forEach((tk, tIdx) => {
      _playTimers.push(setTimeout(() => {
        if (!_playing) return;
        if (tk.sIdx === 0) {
          if (tk.idx > 0) { const pe = bq(indNodes[tk.idx - 1].id); if (pe) { pe.classList.remove("analyzing"); pe.classList.add("analyzed"); } }
          const el = bq(tk.n.id); if (el) { el.classList.remove("analyzed"); el.classList.add("analyzing"); }
          _evidenceSet.add(tk.n.id);
          _analyzeNode = tk.n.id;            // 현재 동작 노드 추적(드로펄스 활성 효과용)
          // 차트 외 시각화 동기: 이 지표가 계산되면 레이더 막대·신호보드 행이 점등
          if (_playReveal.ids) { _playReveal.ids.add(tk.n.id); renderNodeAnalysis(lastResult); renderSignalBoard(); }
        }
        _hudNodeSteps(tk.n, tk.idx, tk.steps, tk.sIdx);
        _logAppend(tk.n, tk.st.text, tk.sIdx === tk.steps.length - 1);   // 각 지표의 마지막 단계 = 의견/결론 → 강조
        // 근거는 이미 전체 작도됨 — 스캔(clip)이 점진 공개하므로 매 틱 재작도 안 함(내레이션만)
        if (progEl) progEl.textContent = "분석 중 " + (tk.idx + 1) + "/" + indNodes.length + " · " + (BTLABEL[tk.n.blockType] || "노드") + " (" + (tk.sIdx + 1) + "/" + tk.steps.length + ")";
      }, tIdx * STEP_SUB));
    });
    // 예측 부채꼴이 평평(anchor)에서 최종 예측으로 '펼쳐지며' 포지가 형성 — 내레이션 길이에 맞춰 천천히
    const A = finPred.anchor;
    const flat = { path: finPred.path.map(() => A), lo: finPred.path.map(() => A), hi: finPred.path.map(() => A), anchor: A };
    const total = Math.max(2600, ticks.length * STEP_SUB + 800), t0 = performance.now();
    let _lastCU = 0, _lastDraw = 0;
    function morph(now) {
      if (!_playing) return;
      const u = Math.min(1, (now - t0) / total), e = _ease(u);
      _scanU = e;
      // 무거운 캔버스 작도(19지표 근거+오실레이터+콘)는 ~28fps로 스로틀 → 응답없음 방지(RAF는 계속 돌되 그리기만 제한)
      if (now - _lastDraw > 35 || u >= 1) {
        _lastDraw = now;
        drawEvidence();               // 손그림 진행도 반영 — 모든 도구가 동시에 그어짐
        _redrawOscForPlay(e);         // RSI·거래량 계산되며 그려짐(메인 차트와 동기)
        _playPred = lerpPred(flat, finPred, e); _playE = e;   // 현재 프레임 보관(조작 재드로우용)
        fcRenderForecast(_playPred);
      }
      _playReveal.u = e;
      if (now - _lastCU > 70) {   // DOM 게이지 갱신 ~14fps로 스로틀(충분히 부드럽고 가벼움)
        _lastCU = now;
        renderHorizons(lastResult, e);
        if (fin.verdict) renderVerdict(fin.verdict, e);
        _dashFill(e);   // 타임프레임 매트릭스 게이지·값도 e에 맞춰 0→최종으로 채움
      }
      if (u < 1) { _playRaf = requestAnimationFrame(morph); return; }
      finishPlay();
    }
    function finishPlay() {
      _scanning = false; _scanU = 1;                          // 작도 완료 → 전체 표시
      _evidenceSet = new Set(indNodes.map(n => n.id));        // 모든 근거 확정 표시
      _evReveal = {};
      indNodes.forEach(n => { const el = bq(n.id); if (el) { el.classList.remove("analyzing"); el.classList.add("analyzed"); } });
      if (center) { const el = bq(center.id); if (el) { el.classList.remove("analyzed"); el.classList.add("analyzing"); _analyzeNode = center.id; } }  // 중심 포지 점등
      _playing = false; _playRaf = null; updatePlayBtn();
      _playTimers.forEach(clearTimeout); _playTimers = [];
      _playReveal = { ids: null, u: 1 };                      // 시연 종료 → 전체 확정 표시
      _dashFill(null);
      renderChart(lastResult, currentData());
      if (fin.verdict) renderVerdict(fin.verdict);
      renderNodeAnalysis(lastResult); renderSignalBoard(); renderHorizons(lastResult);
      if (window.renderOverlay) renderOverlay(lastResult, boardToGraph());
      const eg2 = document.getElementById("bEdges"); if (eg2) eg2.classList.remove("flow");
      const hud2 = document.getElementById("playHud");
      const hud2b = document.getElementById("playHudBody");
      if (hud2 && hud2b) {   // 종합 결론 HUD(천천히 사라짐 — 읽을 시간)
        const reg = _REG[(fin.verdict && fin.verdict.regime) || "neutral"] || _REG.neutral;
        const tgt = fin.verdict && isFinite(fin.verdict.target) ? fmtNum(fin.verdict.target) : "—";
        hud2b.innerHTML =
          `<span class="ph-dot" style="color:${reg.c}"></span>
           <div class="ph-node"><span class="ph-title">종합 — 포지결과</span>
             <span class="ph-type">${indNodes.length}개 지표 결합 · 국면 <b style="color:${reg.c}">${reg.t}</b> · 목표가 ${tgt}</span></div>
           <div class="ph-sig"><span class="ph-type">시그널</span><b>${Math.round(finSig)}</b></div>`;
      }
      // 시연 진행 창은 자동으로 숨기지 않음 — 사용자가 ✕로 닫거나 다음 동작까지 유지
      const pr = document.getElementById("analyzeProg"); if (pr) pr.textContent = "";
      bToast("포지 완료 · " + indNodes.length + "개 지표 결합 → 시그널 " + Math.round(finSig));
    }
    _playRaf = requestAnimationFrame(morph);
  }

  /* 지표별 bias 기여 가중치(0~3×, 기본 1) — 튜닝 패널에서 조절, localStorage 영속 */
  let _driftW = (function () { try { return JSON.parse(localStorage.getItem("scoopforge_driftw") || "{}") || {}; } catch (e) { return {}; } })();
  function saveDriftW() { try { localStorage.setItem("scoopforge_driftw", JSON.stringify(_driftW)); } catch (e) {} }
  function _clearComets() { _comets = {}; if (_cometRAF) { cancelAnimationFrame(_cometRAF); _cometRAF = null; } const cm = document.getElementById("fcComet"); if (cm) { const cx = cm.getContext("2d"); cx && cx.clearRect(0, 0, cm.width, cm.height); } }
  function _showInsufficient() {
    _clearComets();   // 티커 데이터 부족(상장 초기 등) → 데모 사인 대신 명확한 안내(가짜 분석 방지)
    lastResult = null; _fcLastResult = null; _fcLastData = null;
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && n.params && (n.params.symbol || "").trim());
    const sym = tk ? tk.params.symbol.trim() : "";
    const cv = document.getElementById("fcMainChart");
    if (cv) {
      const c = cv.getContext("2d"), W = cv.clientWidth || 600, H = cv.clientHeight || 300, dpr = Math.min(devicePixelRatio || 1, 3);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      cv.style.width = W + "px"; cv.style.height = H + "px";
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      c.textAlign = "center"; c.fillStyle = "#c7cdda"; c.font = "800 15px Pretendard,'Malgun Gothic',sans-serif";
      c.fillText((sym ? sym + " · " : "") + "데이터 부족", W / 2, H / 2 - 8);
      c.fillStyle = "#7c8598"; c.font = "12.5px Pretendard,'Malgun Gothic',sans-serif";
      c.fillText("상장 초기 등으로 분석에 필요한 데이터가 부족합니다 (최소 20봉)", W / 2, H / 2 + 15);
      c.textAlign = "left";
    }
    if (fcRAF) { cancelAnimationFrame(fcRAF); fcRAF = null; }   // 대기 중 애니메이션 재그리기 중단
    ["fcEvidence", "fcEvidenceHi", "fcCone"].forEach(id => { const e = document.getElementById(id); if (e) { const ec = e.getContext("2d"); ec.setTransform(1, 0, 0, 1, 0, 0); ec.clearRect(0, 0, e.width, e.height); } });
    const vb = document.getElementById("fcVerdictBar"); if (vb) { vb.innerHTML = (sym ? '<span class="fcv-tkr">' + sym + '</span>' : '') + '<span class="fcv-op" style="color:var(--eth);animation:none">데이터 부족 — 분석에 최소 20봉 필요</span>'; vb.style.display = "flex"; }
    const _ad = activeDoc(); if (_ad) { delete _ad._verdict; if (typeof renderSidebar === "function") renderSidebar(); }   // 워치리스트 미니판정 배지 숨김(가짜 판정 방지)
    if (typeof bToast === "function") bToast((sym ? sym + ": " : "") + "데이터 부족 — 상장 초기 등으로 분석 불가(최소 20봉 필요)");
  }
  // 첫 진입 idle — 티커 자동 선택/분석 없이 "종목을 선택하세요" 안내(선택 전 부하 0). 워치리스트에서 종목 클릭 시 로드.
  function _showIdle() {
    _clearComets();
    lastResult = null; _fcLastResult = null; _fcLastData = null;
    _heroView = "chart"; if (typeof fcHeroMode === "function") fcHeroMode("chart");   // 이미지 드롭존 대신 차트 캔버스에 안내 표시
    const cv = document.getElementById("fcMainChart");
    if (cv) {
      const c = cv.getContext("2d"), W = cv.clientWidth || 600, H = cv.clientHeight || 300, dpr = Math.min(devicePixelRatio || 1, 3);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      cv.style.width = W + "px"; cv.style.height = H + "px";
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      c.textAlign = "center"; c.fillStyle = "#c7cdda"; c.font = "800 15px Pretendard,'Malgun Gothic',sans-serif";
      c.fillText("종목을 선택하세요", W / 2, H / 2 - 8);
      c.fillStyle = "#7c8598"; c.font = "12.5px Pretendard,'Malgun Gothic',sans-serif";
      c.fillText("왼쪽 워치리스트에서 종목을 고르면 차트·자동 예측이 표시됩니다 · 웹분석은 멀티TF·실적까지 심층", W / 2, H / 2 + 15);
      c.textAlign = "left";
    }
    if (fcRAF) { cancelAnimationFrame(fcRAF); fcRAF = null; }
    ["fcEvidence", "fcEvidenceHi", "fcCone"].forEach(id => { const e = document.getElementById(id); if (e) { const ec = e.getContext("2d"); ec.setTransform(1, 0, 0, 1, 0, 0); ec.clearRect(0, 0, e.width, e.height); } });
    const vb = document.getElementById("fcVerdictBar"); if (vb) { vb.innerHTML = '<span class="fcv-op" style="color:var(--eth);animation:none">종목을 선택하면 분석이 표시됩니다</span>'; vb.style.display = "flex"; }
    if (typeof _dashDefer === "function") _dashDefer();
  }
  window._showIdle = _showIdle;
  // 실적 인지 갭(v1.9.6) — 활성 티커의 다가오는 실적일까지 거래일(근사)을 계산해 run opts로 전달. 미국주식만.
  async function _loadEarnDate(node) {
    try {
      const sym = ((node.params && node.params.symbol) || "").trim().toUpperCase();
      if (!sym || typeof SERVER_OK === "undefined" || !SERVER_OK || typeof apiGet !== "function") return;
      if (/^\d{6}/.test(sym) || /-USD$/.test(sym) || /\//.test(sym) || /^(EUR|GBP|AUD|USD|XAU)/.test(sym)) return;   // KR·크립토·FX·상품 제외(주식만)
      const a = await apiGet("?earndate=1&symbol=" + encodeURIComponent(sym));
      if (a && a.ok && a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date)) node._earnDate = a.date;
    } catch (e) {}
  }
  function _bizDays(d1, d2) {   // d1<d2 사이 평일 수(거래일 근사)
    const a = new Date(d1 + "T00:00:00Z"), b = new Date(d2 + "T00:00:00Z");
    if (!(b > a)) return null;
    let n = 0, cur = new Date(a);
    while (cur < b && n < 400) { cur.setUTCDate(cur.getUTCDate() + 1); const wd = cur.getUTCDay(); if (wd >= 1 && wd <= 5) n++; }
    return n;
  }
  function _earnOpts() {
    try {
      if (typeof activeTF === "function" && !/1day|일|day/.test(activeTF() || "")) return {};   // 일봉 분석만(실적 모델 도메인·earnBars 단위=거래일)
      const tk = boardState.nodes.find(n => n.blockType === "ticker" && n._earnDate && Array.isArray(n._times) && n._times.length);
      if (!tk) return {};
      const eb = _bizDays(String(tk._times[tk._times.length - 1]).slice(0, 10), tk._earnDate);
      return (eb != null && eb >= 0) ? { earnBars: eb } : {};
    } catch (e) { return {}; }
  }
  // 시장 상대강도(v1.10) — SPY 종가를 티커 거래일에 날짜 정렬해 run opts로 스레딩. 미국주식·일봉 한정(검증 도메인).
  let _spyCandles = null, _spyLoading = false;   // SPY 종가 캐시(세션 1회, 서버 프록시 6h 캐시)
  function _isUSStockSym(sym) { return !!sym && !(/^\d{6}/.test(sym) || /-USD$/.test(sym) || /\//.test(sym) || /^(EUR|GBP|AUD|USD|XAU)/.test(sym)); }
  async function _loadSpy() {
    if (_spyCandles || _spyLoading) return;
    _spyLoading = true;
    try {
      if (typeof SERVER_OK === "undefined" || !SERVER_OK || typeof apiGet !== "function") return;
      const a = await apiGet("?ohlc=1&symbol=SPY&tf=1day");
      if (a && a.ok && Array.isArray(a.candles) && a.candles.length > 300)
        _spyCandles = a.candles.map(c => ({ t: String(c.t || c.datetime || "").slice(0, 10), c: +c.c })).filter(c => isFinite(c.c) && c.c > 0);
    } catch (e) {} finally { _spyLoading = false; }
  }
  function _relOpts() {
    try {
      if (!_spyCandles) return {};
      if (typeof activeTF === "function" && !/1day|일|day/.test(activeTF() || "")) return {};   // 일봉 한정(rel 모델 도메인)
      const tk = boardState.nodes.find(n => n.blockType === "ticker" && Array.isArray(n._times) && n._times.length && Array.isArray(n._series) && n._series.length === n._times.length);
      if (!tk || !_isUSStockSym(((tk.params && tk.params.symbol) || "").trim().toUpperCase())) return {};
      const map = new Map(_spyCandles.map(c => [c.t, c.c]));
      const spy = new Array(tk._times.length); let last = null;
      for (let i = 0; i < tk._times.length; i++) { const v = map.get(String(tk._times[i]).slice(0, 10)); if (v != null) last = v; spy[i] = last; }   // 휴일 미스매치는 직전값 carry
      let s0 = 0; while (s0 < spy.length && spy[s0] == null) s0++;   // SPY 이력 이전 구간은 첫 값으로 backfill(엔진은 끝쪽 281봉만 사용)
      if (spy.length - s0 < 281) return {};
      for (let i = 0; i < s0; i++) spy[i] = spy[s0];
      return { spyClose: spy };
    } catch (e) { return {}; }
  }
  function runForge() {
    if (_playing) stopPlay();
    try {
      const g = boardToGraph();
      const d = currentData();
      if (!d || !Array.isArray(d.price) || d.price.length < 20) { _showInsufficient(); return; }   // 데이터 부족 → 데모 사인 대신 안내
      lastResult = ForgeCore.run(g, d, { futW: visionFutW(), visionBias: visionBiasLive(), timeframe: activeTF(), driftWeights: _driftW, ..._earnOpts(), ..._relOpts() });
      _lastAnalyzedAt = Date.now();          // 이 결과의 분석 시각(자동·수동 모든 실행 공통)
      renderChart(lastResult, d);
      if (_needFit) { _needFit = false; try { if (typeof fitPrediction === "function") fitPrediction(); } catch (e) {} }   // 첫 표시=캔들 꽉참+예측밴드 위아래 전체 프레이밍
      paintScanBadges();
      if (window.renderOverlay) renderOverlay(lastResult, g);
      if (lastResult && lastResult.verdict) renderVerdict(lastResult.verdict);
      updateEngineBtn();                      // "✓ 분석 HH:MM" 칩 갱신
      updateTuneBtn();                        // 가중치 튜닝 버튼 활성 표시(기본값이 아니면 골드)
      if (typeof renderSignalBoard === "function") renderSignalBoard();   // 지표 신호 요약 갱신
      if (typeof fitHeroHeight === "function") fitHeroHeight(true);   // 최종 레이아웃(지표신호 포함)에 맞춰 차트 세로 채움
    } catch (e) {
      console.warn("run", e);
      if (typeof bToast === "function") bToast(/cycle/.test(String(e && e.message)) ? "그래프 오류: 순환 연결" : "그래프 오류: 계산 실패");
    }
  }

  function applyVision(result, jobId) {
    if (result && Array.isArray(result.series) && result.series.length >= 2) {
      const px = result.series.map(Number).filter(v => isFinite(v));
      _visionData = px.length >= 2 ? { price: px, n: px.length } : null;
    } else {
      _visionData = null;
    }
    _visionBias = (_visionData && result && result.bias) ? ForgeCore.visionBiasFrom(result.bias) : 0;
    _visionNote = (result && typeof result.note === "string") ? result.note : "";
    _visionWaves = (result && Array.isArray(result.waves)) ? result.waves : [];
    _visionCoords = (_visionData && result && result.coords && typeof result.coords === "object") ? result.coords : null;
    _visionTF = (_visionData && result && typeof result.timeframe === "string") ? result.timeframe : null;
    _visionFut = (_visionData && result && isFinite(result.futBars)) ? result.futBars : 0;
    const dc = activeDoc();
    if (dc) {
      dc.vision = _visionData
        ? { series: _visionData.price, bias: result.bias || null, note: _visionNote, waves: _visionWaves, coords: _visionCoords, timeframe: _visionTF, futBars: _visionFut, jobId: jobId || null }
        : null;
      markDirty();
    }
    renderHero(); markEngineDirty();   // 이미지·데이터만 갱신, 포지결과는 '웹분석' 버튼으로
    bToast(_visionData ? ("웹분석 반영 — '웹분석'을 눌러 계산" + (_visionNote ? " · " + _visionNote : "")) : "분석 데이터 없음");
  }

  /* ── 분석 요청 버튼 + 작업큐 폴링 ───────────────────────────────── */
  let _pollT = null, _pollN = 0;
  function _setReqStat(txt, cls) {
    const el = document.getElementById("reqStat");
    if (el) { el.textContent = txt || ""; el.className = "req-stat" + (cls ? " " + cls : ""); el.title = txt ? "클릭해 닫기/취소" : ""; el.style.cursor = txt ? "pointer" : ""; }
    const b = document.getElementById("reqBtn"); if (b) b.disabled = !!cls && cls !== "err";
  }
  function cancelReq() { _stopPoll(); _setReqStat("", ""); }   // 상태 클릭 → 대기 취소
  async function requestAnalysis() {
    if (!VISION_ENABLED) { bToast("비전 분석은 준비 중입니다 (곧 제공)"); return; }
    if (!SERVER_OK) { bToast("서버 연결이 필요합니다(분석 요청)"); return; }
    const aimg = heroImgId();                // 분석 대상 = 가격 노드 이미지
    if (!aimg) { bToast("가격 노드에 차트 이미지를 먼저 추가하세요"); return; }
    if (_pollT) { bToast("이미 분석 요청 중입니다"); return; }
    _pollT = 1;                              // sentinel: 가드 즉시 닫음(await 중 더블클릭 방지)
    _setReqStat("분석 대기 중…", "pending");  // 버튼 비활성
    runForge();
    const r = await apiPost({ op: "enqueue", docId: activeId, imgId: aimg, board: boardToGraph() });
    if (!r || !r.ok || !r.job) { _stopPoll(); _setReqStat("", ""); bToast("분석 요청 실패"); return; }
    _startPoll(r.job.id);
  }
  function _startPoll(jobId) {
    _pollN = 0;
    clearTimeout(_pollT);
    const tick = async () => {
      _pollN++;
      if (_pollN > 16) { _stopPoll(); _setReqStat("판독 워커 대기 — 자동 처리 미설정(클릭해 닫기)", "err"); return; }
      const r = await apiGet("?jobs&docId=" + encodeURIComponent(activeId));
      const job = r && r.jobs && r.jobs.find(j => j.id === jobId);
      if (!job) { _pollT = setTimeout(tick, 2500); return; }
      if (job.status === "pending") { _setReqStat("분석 대기 중…", "pending"); _pollT = setTimeout(tick, 2500); return; }
      if (job.status === "working") { _setReqStat("분석 중…", "working"); _pollT = setTimeout(tick, 2500); return; }
      if (job.status === "done") { _stopPoll(); _setReqStat("", ""); applyVision(job.result || {}, job.id); return; }
      if (job.status === "error") { _stopPoll(); _setReqStat("분석 실패: " + (job.error || "알 수 없음"), "err"); return; }
      _pollT = setTimeout(tick, 2500);
    };
    _pollT = setTimeout(tick, 2500);
  }
  function _stopPoll() { clearTimeout(_pollT); _pollT = null; const b = document.getElementById("reqBtn"); if (b) b.disabled = false; }

  /* ════════════════════════════════════════════════════════════════
     SIGNATURE OVERLAY — 합의 필드 + 예측 콘 + 살아있는 그래프 맥동
     Two pointer-events:none canvases:
       #boardOverlay (over .board-pane) — pulses flowing along the very
         edges drawn on the board (left→right toward the predict block)
         + subtle node-border glow.
       #fcOverlay (over #fcMain) — consensus/interference band (signal
         coherence → gold glow) + prediction cone (gradient extrusion).
     A pulse reaching the predict node "jumps" to the chart and flashes
     the consensus band once.
     Coordinate reuse:
       board: worldX*view.scale + view.tx (bStage is inset:0).
       edges: same sidesOf/anchor/orthoPath/cleanPts as paintEdges().
       chart: fcMap() reproduces fcDrawMain()'s toX/toY/predStartX with
         cw=fcMain.clientWidth, ch=fcMain.clientHeight (==cw*0.54).
     Respects prefers-reduced-motion (single static frame, no rAF) and
     pauses on document.hidden.
     ════════════════════════════════════════════════════════════════ */

  let boardOverlay = null, bovCtx = null, _bovW = 0, _bovH = 0;
  let fcOverlay = null, fcovCtx = null, _fcovW = 0, _fcovH = 0;
  let _ovResult = null, _ovGraph = null;
  let _flash = 0;                 // consensus-band flash level (0..1), decays
  const _edgePhase = {};          // per-edge lead-dot phase (arrival detection)
  let _consensusPhase = null;     // 예측 노드 활성 시 합의 플래시 위상(연결선 점 대체)
  const _rmq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const prefersReducedMotion = () => _rmq.matches;

  /* ── small helpers ───────────────────────────────────────────── */
  const _clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const _ah = a => Math.round(_clamp01(a) * 255).toString(16).padStart(2, "0");
  function _lerpHex(h1, h2, t) {
    const c1 = parseInt(h1.slice(1), 16), c2 = parseInt(h2.slice(1), 16);
    const r = Math.round(((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * t);
    const g = Math.round(((c1 >> 8) & 255) + (((c2 >> 8) & 255) - ((c1 >> 8) & 255)) * t);
    const b = Math.round((c1 & 255) + ((c2 & 255) - (c1 & 255)) * t);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function _rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function _glowDot(ctx, x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col + _ah(a));
    g.addColorStop(0.45, col + _ah(a * 0.6));
    g.addColorStop(1, col + "00");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  function _pointAt(pts, frac) {
    frac = _clamp01(frac);
    const seg = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      seg.push(d); tot += d;
    }
    if (tot <= 0) return { x: pts[0][0], y: pts[0][1] };
    let target = frac * tot, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      if (acc + seg[i - 1] >= target) {
        const u = seg[i - 1] ? (target - acc) / seg[i - 1] : 0;
        return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u,
                 y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u };
      }
      acc += seg[i - 1];
    }
    const L = pts[pts.length - 1]; return { x: L[0], y: L[1] };
  }

  /* ── edge polyline in WORLD coords (mirrors edgeGeo's geometry) ─ */
  function edgeWorldPolyline(e) {
    const a = bN(e.from), b = bN(e.to);
    if (!a || !b) return null;
    const s = sidesOf(e), A = anchor(a, s.fs), B = anchor(b, s.ts);
    if (e.route === "curve") {
      const dd = Math.hypot(B.x - A.x, B.y - A.y), k = Math.min(120, Math.max(38, dd * 0.4));
      const d1 = DIR[s.fs], d2 = DIR[s.ts];
      const P0 = A, P1 = { x: A.x + d1[0] * k, y: A.y + d1[1] * k },
            P2 = { x: B.x + d2[0] * k, y: B.y + d2[1] * k }, P3 = B, N = 24, out = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        out.push([
          u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x,
          u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y
        ]);
      }
      return out;
    }
    return cleanPts(orthoPath(A, B, s.fs, s.ts));
  }
  // NOTE: relies on cleanPts/orthoPath returning [x,y] pair arrays (NOT {x,y} objects) — keep in sync if those helpers are refactored.
  const _toScreen = p => [p[0] * view.scale + view.tx, p[1] * view.scale + view.ty];

  /* ── chart coordinate map (faithful port of fcDrawMain math) ──── */
  function fcMap(candles, pred, signal, cw, ch) {
    const n = candles.length;
    let pmin = Infinity, pmax = -Infinity;
    candles.forEach(cd => { if (cd.l < pmin) pmin = cd.l; if (cd.h > pmax) pmax = cd.h; });
    (pred.hi || []).forEach(v => { if (v > pmax) pmax = v; });
    (pred.lo || []).forEach(v => { if (v < pmin) pmin = v; });
    const pspan = (pmax - pmin) || 1, padTop = 6, padBot = 4;
    const SIG_FRAC = signal.length ? 0.18 : 0;
    const candleBase = ch * (1 - SIG_FRAC);
    const toY = v => padTop + (pmax - v) / pspan * (candleBase - padTop - padBot);
    const futW = pred.futW || 0, totalBars = n + futW, barW = cw / Math.max(1, totalBars);
    const toX = i => (i + 0.5) * barW;
    return { n, futW, toX, toY, predStartX: n * barW, candleBase, barW, cw, ch };
  }

  /* ── overlay canvas lifecycle ─────────────────────────────────── */
  function ensureOverlays() {
    /* Attach boardOverlay to bStage (not boardPane) so its coordinate system
       aligns with _toScreen (view.tx/ty are relative to the stage area). */
    const stage = bStage || document.getElementById("bStage");
    if (stage && !boardOverlay) {
      boardOverlay = document.createElement("canvas");
      boardOverlay.id = "boardOverlay";
      boardOverlay.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:6";
      stage.appendChild(boardOverlay);
    }
    /* #fcMain 제거됨(R2) — fcOverlay 생성 블록을 안전하게 스킵. R5에서 히어로 이미지 위로 부활 예정. */
    const main = document.getElementById("fcMain");
    if (main && !fcOverlay) {
      const body = main.parentNode;          // .fc-pbody of the main panel
      body.style.position = "relative";
      fcOverlay = document.createElement("canvas");
      fcOverlay.id = "fcOverlay";
      fcOverlay.style.cssText = "position:absolute;pointer-events:none;z-index:2";
      body.appendChild(fcOverlay);
    }
  }
  function _sizeCanvas(cv, w, h) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    const c = cv.getContext("2d");
    // Guard: only reset pixel buffer when CSS size or DPR actually changed.
    // Setting cv.width/cv.height clears the canvas AND resets 2D context state,
    // causing a blank-frame flicker every renderOverlay call (debounced ~180ms).
    if (cv._lastW !== pw || cv._lastH !== ph || cv._lastDpr !== dpr) {
      cv.style.width = w + "px"; cv.style.height = h + "px";
      cv.width = pw; cv.height = ph;
      cv._lastW = pw; cv._lastH = ph; cv._lastDpr = dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return c;
  }
  function layoutOverlays() {
    ensureOverlays();
    /* Use bStage dimensions — boardOverlay is now inside bStage */
    const stage = bStage || document.getElementById("bStage");
    if (boardOverlay && stage) {
      _bovW = stage.clientWidth; _bovH = stage.clientHeight;
      bovCtx = _sizeCanvas(boardOverlay, _bovW, _bovH);
    }
    const main = document.getElementById("fcMain");
    if (fcOverlay && main) {
      fcOverlay.style.left = main.offsetLeft + "px";
      fcOverlay.style.top  = main.offsetTop + "px";
      _fcovW = main.clientWidth; _fcovH = main.clientHeight;
      fcovCtx = _sizeCanvas(fcOverlay, _fcovW, _fcovH);
    }
  }

  /* ── consensus coherence from recent signal dispersion ────────── */
  function _coherence(result) {
    const sig = result.signal || [];
    const recent = sig.slice(-24);
    if (recent.length < 4) return { coh: 0.5, mag: 0 };
    const m = recent.reduce((s, v) => s + v, 0) / recent.length;
    let v = 0; recent.forEach(x => v += (x - m) * (x - m));
    const sd = Math.sqrt(v / recent.length);
    return {
      coh: _clamp01(1 - sd / 45),                       // low dispersion → high coherence
      mag: _clamp01(Math.abs(m) / 60)                   // conviction magnitude
    };
  }

  /* ── drawConsensus: interference / consensus band (clears chart) ─ */
  function drawConsensus(result) {
    const ctx = fcovCtx; if (!ctx) return;
    ctx.clearRect(0, 0, _fcovW, _fcovH);
    const candles = data.candle || []; if (!candles.length) return;
    const pred = result.prediction || { path: [], lo: [], hi: [], futW: 0 };
    const sig = result.signal || [];
    const M = fcMap(candles, pred, sig, _fcovW, _fcovH);
    const { coh } = _coherence(result);
    const reg = (result.verdict && result.verdict.regime) || "neutral";
    /* divergent → cool grey, convergent → gold; regime tints the gold end */
    const goldEnd = reg === "bull" ? "#ecc06a" : reg === "bear" ? "#e2a85e" : "#e8b463";
    const col = _lerpHex("#6b7686", goldEnd, coh);
    const cx = M.predStartX, top = 2, bot = M.candleBase, halfW = Math.max(20, M.barW * 6);
    const aBand = 0.05 + 0.28 * coh + 0.45 * _flash;

    /* luminous consensus column at the "now" seam (where signals arrive) */
    const g = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
    g.addColorStop(0, col + "00");
    g.addColorStop(0.5, col + _ah(aBand));
    g.addColorStop(1, col + "00");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(cx - halfW, top, halfW * 2, bot - top);
    ctx.globalCompositeOperation = "source-over";

    /* seam line, glow scales with coherence + flash */
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6 + 1.2 * _flash;
    ctx.shadowColor = col;
    ctx.shadowBlur = 5 + 16 * coh + 24 * _flash;
    ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, bot); ctx.stroke();
    ctx.shadowBlur = 0;

    /* consensus % pill (top of prediction zone) */
    const pct = Math.round(coh * 100), txt = "합의 " + pct + "%";
    ctx.font = "bold 10px ui-monospace,monospace";
    const tw = ctx.measureText(txt).width, px = cx + 7, py = 4, pw = tw + 12, ph = 16;
    ctx.fillStyle = "rgba(11,15,20,.72)";
    _rr(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.fillStyle = col;
    ctx.fillText(txt, px + 6, py + 11.5);
  }

  /* ── drawCone: prediction cone (gradient extrusion, over band) ── */
  function drawCone(result) {
    const ctx = fcovCtx; if (!ctx) return;
    const candles = data.candle || [];
    const pred = result.prediction;
    if (!candles.length || !pred || !pred.path.length) return;
    const sig = result.signal || [];
    const M = fcMap(candles, pred, sig, _fcovW, _fcovH);
    const reg = (result.verdict && result.verdict.regime) || "neutral";
    const dirCol = reg === "bull" ? "var(--bull)" : reg === "bear" ? "var(--bear)" : "#e8b463";
    const np = pred.path.length;

    /* filled cone lo–hi, gold fading left→right (seam에서 시작) */
    const aV = (pred.anchor != null) ? pred.anchor : candles[candles.length - 1].c;
    const aY = M.toY(aV);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(M.predStartX, aY);
    for (let k = 0; k < np; k++) ctx.lineTo(M.toX(M.n + k), M.toY(pred.hi[k]));
    for (let k = np - 1; k >= 0; k--) ctx.lineTo(M.toX(M.n + k), M.toY(pred.lo[k]));
    ctx.lineTo(M.predStartX, aY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(M.predStartX, 0, M.toX(M.n + np - 1), 0);
    grad.addColorStop(0, "#e8b463" + _ah(0.34 + 0.25 * _flash));
    grad.addColorStop(1, "#e8b463" + _ah(0.03));
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = grad; ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    /* glowing centerline path (regime-coloured, seam에서 시작) */
    ctx.strokeStyle = dirCol;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = dirCol;
    ctx.shadowBlur = 7 + 12 * _flash;
    ctx.beginPath();
    ctx.moveTo(M.predStartX, aY);
    for (let k = 0; k < np; k++) ctx.lineTo(M.toX(M.n + k), M.toY(pred.path[k]));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    /* leading glow at the cone tip */
    _glowDot(ctx, M.toX(M.n + np - 1), M.toY(pred.path[np - 1]), 9 + 6 * _flash, dirCol, 0.9);

    /* 반대 시나리오: 예측 실패 시 데이터 기반 대안 경로(pred.counter — 거울상 반사 아님) */
    if (reg !== "neutral" && Array.isArray(pred.counter) && pred.counter.length === np) {
      const upP = ((typeof aggUpProb === "function" ? aggUpProb(pred) : 50) || 50);
      const cProb = Math.round(reg === "bull" ? (100 - upP) : upP);
      const _cUp = pred.counter[np - 1] >= (pred.anchor != null ? pred.anchor : pred.path[0]);
      const cCol = _cUp ? "70,194,142" : "224,106,106";
      const cA = Math.max(0.16, Math.min(0.62, cProb / 100 * 0.85));
      const yT = 8, yB = _fcovH - 8, cYc = k => Math.max(yT, Math.min(yB, M.toY(pred.counter[k])));
      ctx.save(); ctx.strokeStyle = "rgba(" + cCol + "," + cA + ")"; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(M.predStartX, aY);
      for (let k = 0; k < np; k++) ctx.lineTo(M.toX(M.n + k), cYc(k));
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(" + cCol + "," + Math.min(0.8, cA + 0.34) + ")"; ctx.font = "9px Pretendard,'Malgun Gothic',sans-serif"; ctx.textAlign = "right";
      const cey = cYc(np - 1);
      ctx.fillText((_cUp ? "▲" : "▼") + " 반대 " + cProb + "%", M.toX(M.n + np - 1) - 3, Math.max(yT + 8, Math.min(yB, cey + (_cUp ? -5 : 11)))); ctx.textAlign = "left"; ctx.restore();
    }
  }

  /* ── drawTrendFib: price regression line + fib retracement levels ── */
  function drawTrendFib(result, graph) {
    const ctx = fcovCtx; if (!ctx) return;
    const candles = data.candle || []; if (!candles.length) return;
    const pred = result.prediction || { path: [], lo: [], hi: [], futW: 0 };
    const sig = result.signal || [];
    const M = fcMap(candles, pred, sig, _fcovW, _fcovH);
    const n = M.n; if (!n) return;

    const nodes = (graph && graph.nodes) ? graph.nodes : [];
    const trendNode = nodes.find(nd => nd.blockType === "trend");
    const fibNode   = nodes.find(nd => nd.blockType === "fib");
    if (!trendNode && !fibNode) return;

    const closes = candles.map(cd => cd.c);

    /* ── trend: linear-regression line across full historical region ── */
    if (trendNode) {
      /* ordinary least squares: y = slope * i + intercept */
      let sx = 0, sy = 0, sxy = 0, sx2 = 0;
      for (let i = 0; i < n; i++) {
        sx += i; sy += closes[i]; sxy += i * closes[i]; sx2 += i * i;
      }
      const denom = n * sx2 - sx * sx;
      if (denom !== 0) {
        const slope = (n * sxy - sx * sy) / denom;
        const intercept = (sy - slope * sx) / n;
        ctx.save();
        ctx.strokeStyle = FC_ETH;           /* eth (#8a92b2) dashed, per design token */
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.82;
        ctx.beginPath();
        ctx.moveTo(M.toX(0), M.toY(intercept));
        ctx.lineTo(M.toX(n - 1), M.toY(intercept + slope * (n - 1)));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    /* ── fib: Fibonacci retracement from recent len-bar candle high/low ── */
    if (fibNode) {
      const len = Math.max(2, Number((fibNode.params && fibNode.params.len) || 120));
      const start = Math.max(0, n - len);
      let hi = -Infinity, lo = Infinity;
      for (let i = start; i < n; i++) {
        if (candles[i].h > hi) hi = candles[i].h;
        if (candles[i].l < lo) lo = candles[i].l;
      }
      const range = hi - lo;
      if (range > 0) {
        /* 6 standard retracement ratios: 0 = range low, 1 = range high */
        const FIB_LEVELS = [
          { r: 0,     lbl: "0" },
          { r: 0.236, lbl: "0.236" },
          { r: 0.382, lbl: "0.382" },
          { r: 0.5,   lbl: "0.5" },
          { r: 0.618, lbl: "0.618" },
          { r: 1,     lbl: "1" }
        ];
        const x0 = M.toX(0), x1 = M.predStartX;
        ctx.save();
        ctx.font = "10px ui-monospace,monospace";
        FIB_LEVELS.forEach(({ r, lbl }) => {
          const price = lo + r * range;
          const y = M.toY(price);
          /* dashed gold translucent line */
          ctx.globalAlpha = 0.48;
          ctx.strokeStyle = FC_GOLD;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(x0, y); ctx.lineTo(x1, y);
          ctx.stroke();
          ctx.setLineDash([]);
          /* label at right edge of historical region */
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = FC_GOLD;
          ctx.fillText(lbl, x1 - 40, y - 2);
        });
        ctx.restore();
      }
    }
  }

  /* ── drawPulse: living-graph signals flowing along board edges ── */
  function drawPulse(t, isStatic) {
    const ctx = bovCtx; if (!ctx || !_ovResult) return;
    ctx.clearRect(0, 0, _bovW, _bovH);
    if (!_playing) return;            // 재생(시연) 중에만 — 평상시 보드 깜빡임 제거
    const _actId = _analyzeNode;      // 현재 동작 중인 노드 + 그 연결선에만 효과
    const sig = _ovResult.signal || [];
    let mag = 0;
    if (sig.length) {
      const r = sig.slice(-12);
      mag = _clamp01(r.reduce((s, v) => s + Math.abs(v), 0) / r.length / 70);
    }
    const speed = 0.26 + 0.55 * mag;           // cycles/sec, faster when signal strong
    const ND = 3;
    const dotR = (7 + 6 * mag) * Math.max(0.6, Math.min(1.6, view.scale));

    /* node-border glow (block nodes) */
    boardState.nodes.forEach(n => {
      if (n.kind !== "block") return;
      if (n.id !== _actId) return;            // 활성 노드만 글로우
      const x = n.x * view.scale + view.tx, y = n.y * view.scale + view.ty;
      const w = (n._w || W_NODE) * view.scale, h = (n._h || 70) * view.scale;
      const isPredict = n.blockType === "predict";
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + (n.x + n.y) * 0.01);
      const wf = 0.6 + 0.8 * ((n.weight != null ? n.weight : 50) / 100);
      const a = _clamp01((0.10 + 0.16 * pulse + (isPredict ? _flash * 0.55 : 0)) * wf);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a;
      ctx.strokeStyle = "#e8b463";
      ctx.lineWidth = 1.8;
      ctx.shadowColor = "#e8b463";
      ctx.shadowBlur = (8 + 12 * pulse + (isPredict ? _flash * 26 : 0)) * wf;
      _rr(ctx, x, y, w, h, 12 * view.scale);
      ctx.stroke();
      ctx.restore();
    });

    /* 연결선 시각화 제거: 흐르는 점/에너지 와이어 미표시.
       분석이 예측 노드에 도달하면 합의 밴드 플래시만 위상 기반으로 유지. */
    const _actNode = _actId ? bN(_actId) : null;
    if (!isStatic && _actNode && _actNode.blockType === "predict") {
      const lead = (t * speed) % 1;
      if (_consensusPhase != null && lead < _consensusPhase) _flash = 1;
      _consensusPhase = lead;
    } else {
      _consensusPhase = null;
    }
  }

  /* ── animation loop ───────────────────────────────────────────── */
  let _raf = null, _t0 = 0, _lastNow = 0;
  function startPulse() {
    stopPulse();
    if (prefersReducedMotion()) { drawStaticFrame(); return; }
    _t0 = performance.now(); _lastNow = _t0;
    const loop = now => {
      const dt = Math.min(0.05, (now - _lastNow) / 1000); _lastNow = now;
      _flash = Math.max(0, _flash - dt * 2.2);
      if (_ovResult) { /* drawConsensus/drawCone — R2 비활성(R5에서 이미지 위로 부활) */ drawTrendFib(_ovResult, _ovGraph); drawPulse((now - _t0) / 1000); }
      _raf = requestAnimationFrame(loop);
    };
    _raf = requestAnimationFrame(loop);
  }
  function stopPulse() { if (_raf) { cancelAnimationFrame(_raf); _raf = null; } }
  function drawStaticFrame() {
    _flash = 0;
    if (_ovResult) { /* drawConsensus/drawCone — R2 비활성(R5에서 이미지 위로 부활) */ drawTrendFib(_ovResult, _ovGraph); drawPulse(0, true); }
  }

  /* ── renderOverlay: entry hook called by runForge ─────────────── */
  function renderOverlay(result, graph) {
    _ovResult = result; _ovGraph = graph;
    // Prune stale _edgePhase entries so deleted edges don't accumulate forever.
    // Only runs here (debounced ~180ms), NOT inside the rAF loop, so in-flight
    // phase for surviving edges is preserved and no visible phase jump occurs.
    const _currentEdgeIds = new Set(boardState.edges.map(e => e.id));
    Object.keys(_edgePhase).forEach(k => { if (!_currentEdgeIds.has(k)) delete _edgePhase[k]; });
    layoutOverlays();
    if (prefersReducedMotion()) { stopPulse(); drawStaticFrame(); }
    else startPulse();
  }

  /* reduced-motion / visibility / resize guards */
  _rmq.addEventListener("change", () => { if (_ovResult) renderOverlay(_ovResult, _ovGraph); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopPulse(); if (typeof stopFx === "function") stopFx(); }
    else { if (_ovResult && !prefersReducedMotion()) startPulse(); if (typeof startFx === "function") startFx(); }
  });
  let _ovRz = null;
  window.addEventListener("resize", () => {
    clearTimeout(_ovRz);
    _ovRz = setTimeout(() => { if (_ovResult) renderOverlay(_ovResult, _ovGraph); if (typeof syncMobileHead === "function") syncMobileHead(); }, 90);
  });

  /* ── Boot ────────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    boardInit();
    try { const _ev = document.getElementById("engVer"); if (_ev && typeof ForgeCore !== "undefined" && ForgeCore.version) _ev.textContent = "엔진 v" + ForgeCore.version; } catch (e) {}   // 엔진 버전 배지(단일 출처: ForgeCore.version)
    setTimeout(() => { try { fetchPredLedger(); } catch (e) {} }, 2500);   // 라이브 트랙레코드 배지(서버 확정 후 조회)
    { const _pp = document.getElementById("paramPanel"); if (_pp && _pp.parentElement !== document.body) document.body.appendChild(_pp); }   // 편집기 서랍을 body 직속으로(전체화면서 숨는 boardPane 밖 → 어디서나 오버레이)
    // 서랍 외부 클릭 시 닫기(서랍·지표레일 내부는 유지 → 다른 지표 ✎로 전환 가능)
    document.addEventListener("pointerdown", e => {
      const _pp = document.getElementById("paramPanel");
      if (!_pp || !_pp.classList.contains("open")) return;
      if (e.target.closest && (e.target.closest("#paramPanel") || e.target.closest(".ind-rail"))) return;
      if (typeof deselectAll === "function") deselectAll();   // 그 외 영역 클릭 → 선택 해제 → 서랍 슬라이드 아웃
    }, true);
    if (typeof startFx === "function") startFx();   // 예측영역 앰비언트 FX 루프
    renderTheme();

    /* 파라미터 패널 입력 이벤트 위임 (boardInit 후 #paramPanel 존재 보장) */
    const panel = document.getElementById("paramPanel");
    if (panel) {
      // 이미지 영역 높이 조절 구분선(편집기 재렌더돼도 위임으로 동작)
      let _neDrag = null;
      const _neImgH = () => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ne-img-h")); return isFinite(v) ? v : 400; };
      panel.addEventListener("pointerdown", e => {
        const g = e.target.closest(".ne-gutter"); if (!g) return;
        _neDrag = { y: e.clientY, h: _neImgH(), g }; g.classList.add("dragging");
        try { g.setPointerCapture(e.pointerId); } catch (_) {} document.body.style.userSelect = "none"; e.preventDefault();
      });
      panel.addEventListener("pointermove", e => {
        if (!_neDrag) return;
        const h = Math.max(140, Math.min(760, _neDrag.h + (e.clientY - _neDrag.y)));
        document.documentElement.style.setProperty("--ne-img-h", h + "px");
        if (typeof refreshEditorCone === "function") refreshEditorCone();
      });
      const _neEnd = e => { if (!_neDrag) return; _neDrag.g.classList.remove("dragging"); try { _neDrag.g.releasePointerCapture(e.pointerId); } catch (_) {} _neDrag = null; document.body.style.userSelect = ""; if (typeof refreshEditorCone === "function") refreshEditorCone(); };
      panel.addEventListener("pointerup", _neEnd); panel.addEventListener("pointercancel", _neEnd);
      panel.addEventListener("dblclick", e => { if (e.target.closest(".ne-gutter")) { document.documentElement.style.setProperty("--ne-img-h", "400px"); if (typeof refreshEditorCone === "function") refreshEditorCone(); } });
      panel.addEventListener("input", ev => {
        if (sel.length !== 1) return; const n = bN(sel[0]); if (!n) return;
        const t = ev.target;
        if (t.dataset.tkr) {
          n.params = n.params || {};
          if (t.dataset.tkr === "symbol") n.params.symbol = t.value;
          else if (t.dataset.tkr === "tf") n.params.tf = t.value;
          else { const v = Number(t.value); n.params.price = (t.value !== "" && isFinite(v)) ? v : null; }
          const el = bWorld && bWorld.querySelector(`.b-node[data-id="${n.id}"] .b-tkr`);
          if (el) { const sy = el.querySelector(".b-tkr-sym"), px = el.querySelector(".b-tkr-px"); if (sy) sy.textContent = n.params.symbol || "종목?"; if (px) px.textContent = isFinite(n.params.price) ? _curSym() + fmtNum(n.params.price) : "현재가 미입력"; }
        } else if (t.dataset.pkey) {
          n.params = n.params || {};
          const _pk = t.dataset.pkey, _raw = Number(t.value) || 0, _dec = (_pk === "k" || _pk === "mult");   // σ배수·손절배수는 소수 허용
          n.params[_pk] = _dec ? _raw : Math.round(_raw);
        } else if (t.id === "ppNote") {
          n.note = t.value;
        } else if (t.id === "neTitle") {
          n.title = t.value;
          const tEl = bWorld && bWorld.querySelector(`.b-node[data-id="${n.id}"] .b-n-title`);
          if (tEl && tEl.textContent !== t.value) tEl.textContent = t.value;
        } else if (t.dataset.calp) {
          ensureCal(n);
          const raw = String(t.value).trim(), v = raw === "" ? null : Number(raw);
          n.cal[t.dataset.calp] = (v == null || !isFinite(v)) ? null : v;
          refreshEditorCone();            // 편집기 미리보기 즉시 갱신
        } else if (t.id === "neSeries") {
          let arr = parseSeries(t.value);
          if (arr.length > 2000) arr = arr.slice(-2000);   // 저장 크기·속도 한도(최근 2000봉)
          if (arr.length >= 20) n.series = arr; else delete n.series;
          const stat = document.getElementById("neSeriesStat");
          if (stat) stat.textContent = arr.length >= 20 ? (arr.length + "개 적용됨 — 연속 차트(과거+예측) ON")
            : arr.length ? (arr.length + "개 — 20개 이상 필요") : "데이터 없음 — 데모로 표시 중";
        }
        fireBoardChange();
      });

      /* 불러오기 버튼 클릭 위임 */
      panel.addEventListener("click", async ev => {
        const b = ev.target.closest("[data-tkr-load]"); if (!b) return;
        if (sel.length !== 1) return; const n = bN(sel[0]); if (!n || n.blockType !== "ticker") return;
        const sym = (n.params && n.params.symbol || "").trim(); const tf = (n.params && n.params.tf) || "1day";
        if (!sym) { bToast("티커 심볼을 입력하세요"); return; }
        if (!SERVER_OK) { bToast("오프라인 — 서버 연결이 필요해요"); return; }
        b.disabled = true; const _t = b.textContent; b.textContent = "불러오는 중…";
        try {
          const r = await fetchOHLC(sym, tf);
          if (r && r.ok && Array.isArray(r.candles) && r.candles.length >= 2) {
            applyTickerOHLC(n, r);
            bToast(sym + " " + (n._ohlc ? n._ohlc.length : r.candles.length) + "봉 (" + (r.source === "stooq" ? "Stooq" : "Twelve Data") + ")");
          } else bToast("심볼을 찾을 수 없어요: " + sym);
        } catch (e) { bToast("불러오기 실패 — 잠시 후 다시"); }
        b.disabled = false; b.textContent = _t;
      });

      /* 노드 이미지: 클릭(파일선택) / 제거 / 드래그&드롭 */
      function neNode() { return sel.length === 1 ? bN(sel[0]) : null; }
      function neApplyFile(f, node) {
        const r = new FileReader();
        r.onload = () => downscaleImage(r.result, out => {
          const id = uid("img"); putImg(id, out);
          const label = f.name.replace(/\.[^.]+$/, "");
          LIBRARY.push({ id, label }); saveMeta(); renderLib();
          setThumb(node.id, { imgId: id, label }); bToast("이미지 적용됨");
        });
        r.readAsDataURL(f);
      }
      panel.addEventListener("click", ev => {
        const node = neNode(); if (!node) return;
        if (ev.target.closest("#neImgDel")) { setThumb(node.id, null); return; }
        if (ev.target.closest("#neDelNode")) { delNodes([node.id]); return; }
        if (ev.target.closest("#neRecommend")) {           // 파라미터 → 내장 추천 기본값으로 리셋
          const def = (BLOCK_DEFS.find(b => b.type === node.blockType) || {}).params || {};
          node.params = JSON.parse(JSON.stringify(def));
          renderParams(); fireBoardChange(); bToast("추천 기본값으로 설정"); return;
        }
        if (ev.target.closest("#neSave")) {                // 명시적 저장(영속) — 재분석은 웹분석 버튼
          markDirty(); bToast("저장됨"); return;
        }
        if (ev.target.closest("#neSeriesEx")) {            // 예시 데이터 원클릭 → 적용 + 차트
          node.series = sampleCloseSeries(); markDirty(); runForge(); deselectAll();
          bToast("예시 데이터 적용 — 실데이터 차트"); return;
        }
        if (ev.target.closest("#neSeriesApply")) {         // 붙여넣은 데이터 적용 + 차트
          const ta = document.getElementById("neSeries");
          let arr = ta ? parseSeries(ta.value) : [];
          if (arr.length > 2000) arr = arr.slice(-2000);
          if (arr.length >= 20) { node.series = arr; markDirty(); runForge(); deselectAll(); bToast(arr.length + "개 적용 — 연속 차트"); }
          else { delete node.series; bToast("종가 20개 이상 필요 (현재 " + arr.length + "개)"); }
          return;
        }
        const hasImg = node.thumb && node.thumb.imgId;
        if (ev.target.closest("#neImgPick") || (ev.target.closest("#neImg") && !hasImg)) {
          const fi = document.getElementById("neImgFile"); if (fi) fi.click();
        }
      });
      panel.addEventListener("dragover", ev => {
        if (!ev.target.closest("#neImg")) return;
        ev.preventDefault(); ev.dataTransfer.dropEffect = "copy";
        const z = document.getElementById("neImg"); if (z) z.classList.add("drop");
      });
      panel.addEventListener("dragleave", ev => {
        const z = document.getElementById("neImg");
        if (z && !z.contains(ev.relatedTarget)) z.classList.remove("drop");
      });
      panel.addEventListener("drop", ev => {
        const z = ev.target.closest("#neImg"); if (!z) return;
        ev.preventDefault(); z.classList.remove("drop");
        const node = neNode(); if (!node) return;
        const imgId = ev.dataTransfer.getData("text/forge-img");
        if (imgId) {
          const it = LIBRARY.find(l => l.id === imgId);
          setThumb(node.id, { imgId, label: it ? it.label : "" }); bToast("이미지 적용됨"); return;
        }
        const files = ev.dataTransfer.files;
        if (files && files.length) {
          const f = Array.from(files).find(fl => fl.type.startsWith("image/"));
          if (f) neApplyFile(f, node);
        }
      });
      const neFi = document.getElementById("neImgFile");
      if (neFi) neFi.addEventListener("change", e => {
        const f = e.target.files[0]; const node = neNode();
        if (f && node) neApplyFile(f, node);
        e.target.value = "";
      });
    }

    /* ── 라이브러리 이벤트 ── */
    document.getElementById("libFile").addEventListener("change", e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => downscaleImage(r.result, out => {
        const id = uid("img");
        putImg(id, out);
        LIBRARY.push({ id, label: f.name.replace(/\.[^.]+$/, "") });
        saveMeta();
        renderLib();
        bToast("썸네일 추가됨");
      });
      r.readAsDataURL(f); e.target.value = "";
    });

    /* lib thumbnail dragstart — delegation on #forgeSide (libSec 재생성에도 안전) */
    document.getElementById("forgeSide").addEventListener("dragstart", e => {
      const it = e.target.closest(".lib-it[data-img]");
      if (!it) return;
      e.dataTransfer.setData("text/forge-img", it.dataset.img);
      e.dataTransfer.effectAllowed = "copy";
    });

    /* board stage drag-over + drop — no existing handler; adding fresh */
    bStage.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    bStage.addEventListener("drop", e => {
      e.preventDefault();
      const pt = worldPt(e.clientX, e.clientY);
      const n = nodeAt(pt);

      /* (a) library thumbnail drag → node */
      const imgId = e.dataTransfer.getData("text/forge-img");
      if (imgId) {
        if (!n) { bToast("노드 위에 드롭하세요"); return; }
        const it = LIBRARY.find(l => l.id === imgId);
        setThumb(n.id, { imgId, label: it ? it.label : "" });
        bToast("썸네일 적용됨");
        return;
      }

      /* (b) OS image file drop → node */
      const files = e.dataTransfer.files;
      if (files && files.length) {
        const f = Array.from(files).find(fl => fl.type.startsWith("image/"));
        if (!f) return;
        if (!n) { bToast("노드 위에 파일을 드롭하세요"); return; }
        const r = new FileReader();
        r.onload = () => downscaleImage(r.result, out => {
          const id = uid("img");
          putImg(id, out);
          const label = f.name.replace(/\.[^.]+$/, "");
          LIBRARY.push({ id, label });
          saveMeta();
          setThumb(n.id, { imgId: id, label });
          markDirty();
          renderLib();
          bToast("썸네일 적용됨");
        });
        r.readAsDataURL(f);
      }
    });

    /* ── Ctrl+V 이미지 붙여넣기 라우팅 ── */
    document.addEventListener("paste", ev => {
      const items = ev.clipboardData && ev.clipboardData.items;
      if (!items) return;
      let imgItem = null;
      for (const it of items) { if (it.type && it.type.indexOf("image") === 0) { imgItem = it; break; } }
      if (!imgItem) return;               // 이미지 없으면 일반(텍스트) 붙여넣기 그대로 둠
      ev.preventDefault();
      const file = imgItem.getAsFile(); if (!file) return;
      const r = new FileReader();
      r.onload = () => downscaleImage(r.result, out => {
        const id = uid("img"); putImg(id, out); LIBRARY.push({ id, label: "붙여넣기" }); saveMeta(); renderLib();
        if (sel.length === 1 && bN(sel[0])) { setThumb(sel[0], { imgId: id, label: "붙여넣기" }); markDirty(); bToast("노드 이미지 적용"); }
        else { setThemeImg(id); bToast("주제 이미지 적용"); }
      });
      r.readAsDataURL(file);
    });

    renderLib();

    /* ── 사이드바 이벤트 위임 ── */
    document.getElementById("forgeSide").addEventListener("click", e => {
      if (e.target.id === "libAddBtn") { document.getElementById("libFile").click(); return; }
      const libDel = e.target.closest("[data-libdel]");
      if (libDel) { delLibImg(libDel.dataset.libdel); return; }
      if (e.target.id === "sampleDocBtn") { newSampleDoc(); return; }
      if (e.target.id === "newDocBtn") { newDoc(); return; }
      const renBtn = e.target.closest("[data-docren]");
      if (renBtn) {
        const id = renBtn.dataset.docren;
        const d = DOCS.find(x => x.id === id); if (!d) return;
        const title = prompt("문서 이름", d.title || "");
        if (title !== null && title.trim()) renameDoc(id, title.trim());
        return;
      }
      const delBtn = e.target.closest("[data-docdel]");
      if (delBtn) { deleteDoc(delBtn.dataset.docdel); return; }
      const row = e.target.closest(".doc-row[data-doc]");
      if (row) { switchDoc(row.dataset.doc); }
    });

    onBoardChange(() => { if (_playing) stopPlay(); markEngineDirty(); markDirty(); });   // 엔진은 수동(버튼) — 변경됨 표시만
    /* 실행 버튼 제거됨 — runForge는 편집 시 자동 호출(markDirty/onBoardChange) */
    boot();
    if (typeof syncMobileHead === "function") { syncMobileHead(); setTimeout(syncMobileHead, 400); }   // 모바일 고정 헤더 구성(부팅 후 재보정)
    if (typeof applyTheme === "function") applyTheme(_theme);   // 저장된 테마 적용
  });
