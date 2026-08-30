/* 스쿱포지 — 앱 임베드 메시지 API(?embed=app). 머니스쿱 앱이 iframe 으로 이 페이지를 열고
   postMessage 로 조종한다(설계 docs/superpowers/specs/2026-08-25-app-forge-embed.md).
   PC(일반 모드)에서는 EMBED=false 라 즉시 반환 — 아무것도 바꾸지 않는다.
   원칙: 여기서는 새 작도·새 판정을 만들지 않는다. forge 의 기존 함수(loadTicker·runForge·
   playAnalysis·chartSetTF·toggleEvidence·fitPrediction·applyTheme)를 그대로 호출할 뿐이다. */
(function () {
  "use strict";
  if (typeof EMBED === "undefined" || !EMBED) return;

  function emit(type, data) {
    try { window.parent.postMessage(Object.assign({ src: "forge-embed", type: type }, data || {}), "*"); } catch (e) {}
  }
  window._embedEmit = emit;

  // runForge 가 부르는 결과 요약 — 화면은 앱이 그리므로 판정·예측 요약만(배열은 콘 60점 이내)
  window._embedResultPayload = function (res) {
    if (!res) return { ok: false };
    const tk = boardState.nodes.find(n => n.blockType === "ticker" && n.params);
    const p = res.prediction || {};
    return { ok: true, sym: tk ? tk.params.symbol : null, tf: tk ? (tk.params.tf || "1day") : null,
      verdict: res.verdict || null,
      prediction: { anchor: p.anchor, futW: p.futW, path: p.path, lo: p.lo, hi: p.hi },
      indicators: boardState.nodes.filter(n => n.kind === "block" && EV_COLORS[n.blockType]).map(n => n.blockType) };
  };

  let _lastTier = "basic";
  const TF_MAP = { "일": "1day", "주": "1week", "월": "1month", "1day": "1day", "1week": "1week", "1month": "1month" };

  // tier → 보드 지표 구성. basic = IND_TIERS[0](핵심 5) 만 남김 · 그 외 = 전체(32). 가중치 = _driftW(타입별 배율).
  function applyTier(tier, weights) {
    const indTypes = Object.keys(EV_COLORS);
    if (tier === "basic") {
      const keep = new Set(IND_TIERS[0].types);
      const ids = boardState.nodes.filter(n => n.kind === "block" && EV_COLORS[n.blockType] && !keep.has(n.blockType)).map(n => n.id);
      if (ids.length) delNodes(ids);
      const missing = IND_TIERS[0].types.filter(t => !boardState.nodes.some(n => n.blockType === t));
      if (missing.length) { toggleAllBlocks(); const drop = boardState.nodes.filter(n => n.kind === "block" && EV_COLORS[n.blockType] && !keep.has(n.blockType)).map(n => n.id); if (drop.length) delNodes(drop); }
    } else {
      if (typeof _allIndAdded === "function" && !_allIndAdded()) toggleAllBlocks();
    }
    // 표시 지표 = 보드에 놓인 지표 전부. 이래야 시연이 티어의 모든 지표(기본 5·심화 32)를 차례로 그린다
    // (기본 _evVisible 은 일부만 켜져 있어 ma·거래량이 시연에서 빠졌다).
    _evVisible = new Set(boardState.nodes.filter(n => n.kind === "block" && EV_COLORS[n.blockType]).map(n => n.blockType));
    _driftW = {};
    if (weights && typeof weights === "object") {
      Object.keys(weights).forEach(k => { const v = +weights[k]; if (indTypes.indexOf(k) >= 0 && isFinite(v) && v > 0 && v !== 1) _driftW[k] = v; });
    }
    if (typeof updateTuneBtn === "function") { try { updateTuneBtn(); } catch (e) {} }
  }

  async function onLoad(m) {
    try {
      const t = ensureTickerNode();
      t.params.symbol = String(m.symbol || "").trim().toUpperCase();
      t.params.tf = TF_MAP[m.tf] || "1day";
      applyTier(m.tier || "basic", m.weights);
      _lastTier = m.tier || "basic";
      _draft = !!m.draft;   // 실행(draft) 로드: 결과 콘을 미리 안 보인다 — 로드부터 전폭 캔들, 확정 콘은 시연 끝(onPlayEnd)
      // 예측선 노출 = 앱 단계 규약(기본: 1차 종합 / 심화·커스텀: +반대 시나리오). PC 의 '2차 선택지표(체크 조합 재계산)'는 앱 개념에 없어 끈다.
      // 커스텀 가중치는 _driftW 로 1차 자체에 반영된다(별도 선 아님).
      _predVis.p1 = true; _predVis.p2 = false; _predVis.p3 = (m.tier || "basic") !== "basic";
      _predVis.band = true; _predVis.fan = true; _predVis.rail = true;
      _chartLock = false; if (typeof applyChartLock === "function") applyChartLock();
      if (m.evidence === false && _evidenceShow) toggleEvidence();
      if (m.evidence !== false && !_evidenceShow) toggleEvidence();
      await loadTicker();   // fetch → applyTickerOHLC → runForge(→ result emit) → renderChart
      if (!hasRealSeries()) { emit("error", { msg: "no-series" }); return; }
      if (m.confirmed && typeof _deepSessionDocs !== "undefined") { _deepSessionDocs.add(activeId); }
      else if (!m.confirmed && typeof _deepSessionDocs !== "undefined" && _deepSessionDocs.has(activeId)) { _deepSessionDocs.delete(activeId); }
      if (_draft) {   // 결과 숨김: 전폭 캔들만(콘·근거 없음). 시연이 지표를 긋고, 끝에 콘을 연다.
        _drawWide = true; _playSeq = false;
        const N = (currentData().price || []).length;
        _chartWin.count = Math.min(N, WIDE_BARS); _chartWin.start = Math.max(0, N - _chartWin.count);
        _yScale = { mode: "auto", lo: null, hi: null };
        renderHeroZoom();
      } else {
        // 결과 열람 = 콘·예측선 표시. 시연(draft/play)이 켠 '전폭 캔들만' 플래그는 여기서 반드시 끈다 —
        // 같은 iframe 을 재사용하므로 안 끄면 forge-draw 가 pred=null 로 그려 예측 영역이 통째로 사라진다
        // (2026-08-30 실측: 결과 화면 _drawWide=true, 작도만 보이고 콘 없음).
        _drawWide = false; _playSeq = false; _scanning = false; _scanU = 1;
        if (!_evidenceShow) toggleEvidence();   // 결과 열람 = 근거 표시(앱은 웹분석 전/후 구분 없음)
        renderChart(lastResult, currentData());
        if (Array.isArray(m.evidenceOff) && m.evidenceOff.length) onEvidence({ off: m.evidenceOff });
        if (typeof fitPrediction === "function") { try { fitPrediction(); } catch (e) {} }
        // 시연이 넓은 창에서 켠 로그축을 결과 창 기준으로 다시 판정(180봉 결과 창에 20년 로그축이 남지 않게)
        try { _autoLogForWindow(_chartWin.start, _chartWin.count); renderHeroZoom(); } catch (e) {}
      }
    } catch (e) { emit("error", { msg: String(e && e.message || e) }); }
  }

  const WIDE_BARS = 120;
  let _draft = false;   // 시연 중 전폭에 놓을 캔들 수(폰 폭 기준 봉당 ~3px — 작도가 읽히는 밀도)
  // ── 지표별 카메라: 그 지표가 '실제로 그리는 도형의 좌표'(엔진 결과)로 이동한다 ──
  // 오버레이(추세·피보·일목·구조 등)만 도형 위치로 카메라를 옮기고, 가격차트에 그림이 없는
  // 오실레이터(RSI·MACD 등, 서브패널이라 임베드선 숨김)는 화면을 고정한다(의미 없는 줌 반복 제거).
  var _OSC = { rsi:1, macd:1, stochastic:1, cci:1, williams:1, mfi:1, cmf:1, roc:1, ao:1, adx:1, atr:1, volume:1, aroon:1, cycle:1, phasefold:1 };
  function _pp(n, k, d) { return (n.params && isFinite(n.params[k])) ? n.params[k] : d; }
  // 창 [start,start+count) 실제 고·저(Y 프레이밍 보완)
  function _winPriceRange(start, count) {
    var oh = (typeof priceOHLC === "function") ? priceOHLC() : null;
    var lo = Infinity, hi = -Infinity, s = Math.max(0, start), e0 = start + count;
    if (oh) { var e = Math.min(oh.length, e0); for (var i = s; i < e; i++) { var d = oh[i]; if (!d) continue; if (d.l < lo) lo = d.l; if (d.h > hi) hi = d.h; } }
    else { var px = (currentData().price || []); var e2 = Math.min(px.length, e0); for (var j = s; j < e2; j++) { var v = px[j]; if (v < lo) lo = v; if (v > hi) hi = v; } }
    return (isFinite(lo) && isFinite(hi) && hi > lo) ? { lo: lo, hi: hi } : null;
  }
  // 지표가 그리는 도형의 봉·가격 좌표(엔진 결과에서). 오실레이터=null(카메라 고정).
  function _regionForNode(n, N, win) {
    var t = n.blockType; if (_OSC[t]) return null;
    var C = window.ForgeCore, price = (currentData().price || []); if (!C || price.length < 5) return null;
    var pts = [];
    try {
      if (t === "fib") { var r = C.analyzeFib(price, { len: _pp(n,"len",120), win: (win === Infinity ? 1e9 : win) || undefined }); if (r && r.swing) { pts.push({ i: r.swing.fromIdx, p: r.swing.fromPrice }, { i: r.swing.toIdx, p: r.swing.toPrice }); (r.levels||[]).forEach(function(l){ pts.push({ p: l.price }); }); } }
      else if (t === "trend") { var r = C.analyzeTrend(price, { win: (win === Infinity ? 1e9 : win) || undefined }); var w = r.windows[r.dominant] || r.windows.long || r.windows.mid || r.windows.short; if (w) { var v = function(i){ return Math.exp(w.bLog + w.slopeLog*(i-w.startIdx)); }; pts.push({ i: w.startIdx, p: v(w.startIdx) }, { i: N-1, p: v(N-1) }); } }
      else if (t === "elliott") { var r = C.analyzeElliott(price, { swing: _pp(n,"swing",3) }); (r.waves||[]).forEach(function(wv){ pts.push({ i: wv.idx, p: wv.price }); }); pts.push({ i: N-1 }); }
      else if (t === "structure" || t === "smc") { var r = C.analyzeStructure(price, { swing: _pp(n,"swing",3) }); (r.swings||[]).forEach(function(sw){ pts.push({ i: sw.idx, p: sw.price }); }); if (!pts.length) { pts.push({ i: Math.max(0,N-200) }, { i: N-1 }); } }
      else if (t === "ma") { pts.push({ i: Math.max(0, N-130) }, { i: N-1 }); }
      else if (t === "ichimoku") { pts.push({ i: Math.max(0, N-(_pp(n,"kijun",26)+_pp(n,"senkouB",52)+_pp(n,"shift",26))) }, { i: N-1 }); }
      else if (t === "gann") { pts.push({ i: Math.max(0, N-120) }, { i: N-1 }); }
      else if (t === "volumeprofile") { pts.push({ i: Math.max(0, N-_pp(n,"len",120)) }, { i: N-1 }); }
      else if (t === "bollinger" || t === "keltner" || t === "donchian") { pts.push({ i: Math.max(0, N-_pp(n,"len",20)*3) }, { i: N-1 }); }
      else if (t === "supertrend" || t === "psar" || t === "vwap" || t === "pivot" || t === "pattern") { pts.push({ i: Math.max(0, N-70) }, { i: N-1 }); }
      else return null;
    } catch (e) { return null; }
    if (!pts.length) return null;
    var bl=1e9, bh=-1e9, pl=1e9, ph=-1e9;
    pts.forEach(function(q){ if (q.i!=null){ if(q.i<bl)bl=q.i; if(q.i>bh)bh=q.i; } if (q.p!=null && isFinite(q.p)){ if(q.p<pl)pl=q.p; if(q.p>ph)ph=q.p; } });
    if (bh < 0) return null;
    if (typeof win === "number" && isFinite(win)) bl = Math.max(bl, Math.max(0, N - win));   // 스케일 단계: 창 밖은 카메라에 안 담는다
    return { bl: Math.max(0,bl), bh: Math.max(bh, N-1), pl: (isFinite(pl)&&isFinite(ph)&&ph>pl)?pl:null, ph:(isFinite(pl)&&isFinite(ph)&&ph>pl)?ph:null };
  }
  // 영역 → 카메라 목표창(X+Y). 최소 문맥 48봉 확보, 도형 가격대를 캔들 범위와 합집합.
  function _frameFromRegion(reg, N) {
    var minBars = 48;
    var featBars = reg.bh - reg.bl + 1;
    // 상한 340 의 이유는 "급등주는 최근 캔들이 위로 눌려 안 읽힌다" — 그건 선형축의 문제다.
    // 로그축이면 20년 차트에서도 최근 구간이 읽히므로 상한을 푼다(2026-08-28).
    var cap = (typeof _logChart !== "undefined" && _logChart) ? N : 340;
    var count = Math.max(minBars, Math.min(N, cap, Math.round(featBars * 1.2)));
    var start = Math.max(0, Math.min(N - count, reg.bh - count + 1));
    var pr = _winPriceRange(start, count) || { lo: reg.pl, hi: reg.ph };
    var lo = pr.lo, hi = pr.hi;
    if (reg.pl != null) { lo = Math.min(lo, reg.pl); hi = Math.max(hi, reg.ph); }   // 도형(피보 확장 등)이 화면 안에 들어오게 합집합
    var ylo = null, yhi = null;
    if (isFinite(lo) && isFinite(hi) && hi > lo) {
      // 패딩을 선형으로만 주면 광범위 창에서 **음수 가격**이 나온다(NVDA 12년: lo 0.5 · hi 240 →
      // pad 24 → ylo −23.5). 로그축에서 음수는 매핑이 깨져 캔들이 상단에 눌린다 — 340봉 상한이
      // 그동안 이걸 가려왔고, 상한을 풀자 드러났다(2026-08-28 실측 _yScale.lo = −3.57).
      if (lo > 0 && hi / lo > 4) { var f = Math.pow(hi / lo, 0.04); ylo = lo / f; yhi = hi * f; }
      else { var pad = 0.10 * (hi - lo); ylo = lo - pad; yhi = hi + pad; }
      if (!(ylo > 0) && lo > 0) ylo = lo * 0.9;   // 가격은 음수가 될 수 없다
    }
    return { count: count, start: start, ylo: ylo, yhi: yhi };
  }

  // 로그축 판정을 '전체 시계열'이 아니라 '지금 보여줄 창'으로 — 규칙(max/min>4)은 기존 그대로.
  // 340봉 상한 해제가 _logChart 를 읽으므로 프레임 계산 '전에' 불러야 한다.
  function _autoLogForWindow(start, count) {
    var cs = (currentData().price || []).slice(start, start + count);
    if (cs.length < 2) return;
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < cs.length; i++) { var v = cs[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (!(mn > 0)) return;
    var wide = mx / mn > 4;
    if (wide !== _logChart) { _logChart = wide; if (typeof updateAxisBtns === "function") updateAxisBtns(); }
  }

  function _camTween(target, steps, done) {
    var s0 = _chartWin.start, c0 = _chartWin.count;
    // Y 시작값: 현재 manual 이면 그 값, 아니면 현재 창의 자동 범위에서 출발
    var y0 = (_yScale && _yScale.mode === "manual" && isFinite(_yScale.lo) && isFinite(_yScale.hi))
      ? { lo: _yScale.lo, hi: _yScale.hi }
      : (_winPriceRange(s0, c0) || null);
    var yT = (isFinite(target.ylo) && isFinite(target.yhi)) ? { lo: target.ylo, hi: target.yhi } : null;
    var i = 0; steps = Math.max(1, steps);
    function step() {
      if (!_playing) { if (done) done(); return; }
      i++;
      var t = i / steps, e = 1 - Math.pow(1 - t, 3);   // easeOutCubic
      _chartWin.count = Math.round(c0 + (target.count - c0) * e);
      _chartWin.start = Math.round(s0 + (target.start - s0) * e);
      if (y0 && yT) {   // X·Y 동시 이동 — 지표 작도 범위가 세로로도 꽉 들어오게
        _yScale = { mode: "manual", lo: y0.lo + (yT.lo - y0.lo) * e, hi: y0.hi + (yT.hi - y0.hi) * e };
      }
      try { renderHeroZoom(); } catch (err) {}
      if (i < steps) { _camT = setTimeout(step, 55); } else { if (done) done(); }
    }
    step();
  }

  // ── 임베드 자체 시연(가벼움) — PC 의 무거운 morph RAF + 100+ setTimeout 틱(HUD/로그 DOM) 대신,
  //    지표를 하나씩 넉넉한 간격으로 그린다. 매 스텝 사이 스레드가 쉬어 느린 폰에서도 화면이 갱신되고
  //    순차 작도가 실제로 보인다(2026-08-25: PC morph 는 폰 스레드를 20초 독점해 끝에 한 번에 나타남). ──
  var _embT = null, _embI = 0, _embNodes = [], _camT = null;
  var _embStage = null;   // 다중스케일 시연 단계(추세선·피보나치만) — null = 단계 없음
  function onPlay() {
    if (!hasRealSeries()) { emit("error", { msg: "no-series" }); return; }
    if (_playing || _embT) return;
    // 전폭 캔들(콘 숨김) + 근거 표시 준비
    _drawWide = true; _playSeq = true; _playTotalMs = _lastTier === "basic" ? 7000 : 13000;
    _evidenceShow = true; document.body.classList.remove("evhide");
    if (typeof _deepSessionDocs !== "undefined") _deepSessionDocs.add(activeId);
    if (typeof window !== "undefined") window._fcPreview = false;
    var N = (currentData().price || []).length;
    var w0c = Math.min(N, 340); _chartWin.count = w0c; _chartWin.start = Math.max(0, N - w0c);   // 시작=넓은 조망(캔들 보이는 선)
    _yScale = { mode: "auto", lo: null, hi: null };
    // 표시할 지표(보드에 놓인·표시집합) — 순서대로 하나씩 공개
    _embNodes = (typeof evIndicatorNodes === "function" ? evIndicatorNodes() : boardState.nodes.filter(function (n) { return n.kind === "block" && EV_COLORS[n.blockType]; }))
      .filter(function (n) { return !_evVisible || !_evVisible.size || _evVisible.has(n.blockType); });
    _evidenceSet = new Set(_embNodes.map(function (n) { return n.id; }));
    _evReveal = {}; _embNodes.forEach(function (n) { _evReveal[n.id] = Infinity; });
    _seqStart = {}; _seqDur = {};
    _scanning = true; _scanU = 0.001; _playing = true;
    if (typeof updatePlayBtn === "function") { try { updatePlayBtn(); } catch (e) {} }
    drawEvidence();   // 시작: 캔들만(아직 공개된 지표 없음)
    _embI = 0; _embStage = null;
    try { setScaleStage(null); } catch (e) {}
    var _now = function () { return typeof performance !== "undefined" ? performance.now() : Date.now(); };
    // 이 지표의 목표 프레임이 지금 화면과 '의미 있게' 다른가 — 미세한 80→72→84 흔들림(그냥 확대·축소 반복)을
    // 이동으로 치지 않는다. 시작점이 화면폭의 12% 넘게 밀리거나, 배율이 0.72배 밖으로 벌어질 때만 카메라를 움직인다.
    function _frameDiffers(t, N) {
      if (!t) return false;
      var dStart = Math.abs((t.start || 0) - (_chartWin.start || 0)) / Math.max(1, N);
      var r = (t.count || 1) / Math.max(1, _chartWin.count || 1);
      return dStart > 0.12 || r < 0.72 || r > 1.38;
    }
    function revealNext() {
      _embT = null;
      if (!_playing) return;
      if (_embI >= _embNodes.length) { _embFinish(); return; }
      var n = _embNodes[_embI];
      var N2 = (currentData().price || []).length;
      // 다중스케일 대상(추세선·피보나치)만 단계를 갖는다. 나머지는 종전대로 1단계.
      var MULTI = { trend: 1, fib: 1 };
      var wins = (MULTI[n.blockType] && window.ForgeCore && ForgeCore.scaleSet) ? ForgeCore.scaleSet(N2) : null;
      if (wins && wins.length < 2) wins = null;   // 1단이면 종전 동작과 같다(단계 표기 불필요)
      var stages = wins ? wins.length : 1;
      if (_embStage == null) _embStage = 0;
      if (wins) {
        var _wb = (wins[_embStage] === Infinity) ? N2 : wins[_embStage];
        _autoLogForWindow(Math.max(0, N2 - _wb), _wb);   // 축 먼저 — 340 상한 해제가 여기 걸린다
        try { setScaleStage({ i: _embStage, wins: wins, all: (_embStage === stages - 1) }); } catch (e) {}
      } else {
        try { setScaleStage(null); } catch (e) {}
      }
      var reg = _regionForNode(n, N2, wins ? wins[_embStage] : undefined);
      var target = reg ? _frameFromRegion(reg, N2) : null;   // null=오실레이터=가격차트에 오버레이 없음
      var move = _frameDiffers(target, N2);                  // 카메라를 실제로 옮길 때만 true(가까우면 고정)
      // 카메라 이동은 드물게·깊게. 옮길 때는 넉넉한 글라이드, 고정일 때는 손그림에 집중.
      // 3단 지표는 3단계를 차지한다 — 분모를 총 단계수로 두면 각 단계가 정상 속도를 유지하고
      // 전체 시연만 그만큼 길어진다(단계를 쥐어짜 빨라지는 것보다 낫다).
      var _totalStages = 0;
      for (var _si = 0; _si < _embNodes.length; _si++) {
        var _bt = _embNodes[_si].blockType;
        var _w = (MULTI[_bt] && window.ForgeCore && ForgeCore.scaleSet) ? ForgeCore.scaleSet(N2).length : 1;
        _totalStages += (_w < 2 ? 1 : _w);
      }
      var per = Math.max(560, Math.min(1300, Math.round(_playTotalMs / Math.max(1, _totalStages))));
      var camMs = move ? Math.min(760, Math.max(360, Math.round(per * 0.62))) : 0;
      var drawMs = Math.round(per * (move ? 0.62 : 0.9)), holdMs = Math.max(120, Math.round(per * 0.24));
      var osc = !target;
      var runDraw = function () {   // ② 내레이션 emit + 손그림 스트로크(지표 고유 작도가 0→1 로 그어짐) → 머무름 → 다음
        if (!_playing) return;
        var txt = "";
        try { if (lastResult && lastResult.nodeText) txt = lastResult.nodeText[n.id] || ""; } catch (e) {}
        emit("step", { idx: _embI, total: _embNodes.length, type: n.blockType,
          label: (typeof BTLABEL !== "undefined" && BTLABEL[n.blockType]) || n.blockType,
          sIdx: 0, sTotal: 1, text: txt, last: true, cam: (target ? target.count : 0), osc: osc, moved: move });
        _scanU = Math.min(0.999, (_embI + 1) / _embNodes.length);
        if (osc) {   // 오실레이터: 가격차트에 오버레이 없음 → 화면 고정, 짧게 지나감(정적 꼬리 방지)
          _seqStart[n.id] = _now() - 999; _seqDur[n.id] = 1;
          try { drawEvidence(); } catch (e) {}
          if (wins && _embStage < stages - 1) { _embStage++; } else { _embStage = null; _embI++; }
          _embT = setTimeout(revealNext, 280); return;
        }
        // 손그림: _skFrac(경과/드로시간) 0→1 로 자라며 선을 긋고, 82% 지나면 라벨·점·레벨이 얹힌다.
        _seqDur[n.id] = drawMs; _seqStart[n.id] = _now();
        var t0 = _now();
        (function stroke() {
          if (!_playing) return;
          try { drawEvidence(); } catch (e) {}
          if (_now() - t0 < drawMs) { _embT = setTimeout(stroke, 42); return; }   // ~24fps 손그림(drawEvidence ≈ 4ms)
          try { drawEvidence(); } catch (e) {}   // 완성 프레임
          if (wins && _embStage < stages - 1) { _embStage++; } else { _embStage = null; _embI++; }
          _embT = setTimeout(revealNext, holdMs);
        })();
      };
      // ① 카메라: 실제로 다른 구간을 볼 때만 넉넉히 글라이드, 아니면 지금 화면에서 바로 작도(미세 줌 흔들림 제거)
      if (move) _camTween(target, Math.max(9, Math.round(camMs / 34)), runDraw);
      else runDraw();
    }
    _embT = setTimeout(revealNext, 400);
    return;
  }
  function _embFinish() {
    _embT = null; if (_camT) { clearTimeout(_camT); _camT = null; } _embNodes = [];
    _embStage = null; try { setScaleStage(null); } catch (e) {}
    _scanning = false; _scanU = 1; _playSeq = false; _seqStart = {};
    _evidenceSet = new Set((typeof evIndicatorNodes === "function" ? evIndicatorNodes() : []).map(function (n) { return n.id; }));
    _playing = false;
    if (typeof updatePlayBtn === "function") { try { updatePlayBtn(); } catch (e) {} }
    emit("done", {});   // onPlayEnd(래핑된 emit) 가 _drawWide 해제 + 확정 콘 + fitPrediction 처리
  }
  function _embStop() {
    if (_embT) { clearTimeout(_embT); _embT = null; }
    if (_camT) { clearTimeout(_camT); _camT = null; }
    if (!_playing && !_drawWide) return;
    _embNodes = []; _scanning = false; _scanU = 1; _playSeq = false; _seqStart = {}; _playing = false;
    _embStage = null; try { setScaleStage(null); } catch (e) {}
    if (typeof updatePlayBtn === "function") { try { updatePlayBtn(); } catch (e) {} }
    emit("stopped", {});
  }

  async function onTF(m) {
    const tf = TF_MAP[m.tf]; if (!tf) return;
    try { await chartSetTF(tf); } catch (e) { emit("error", { msg: String(e && e.message || e) }); }
  }

  function onEvidence(m) {
    if (Array.isArray(m.off)) {   // 지표별 표시/숨김(앱 작도 토글 시트) — 전체 집합에서 off 를 뺀다
      const all = Object.keys(EV_COLORS); const off = new Set(m.off);
      _evVisible = new Set(all.filter(t => !off.has(t)));
      if (!_evidenceShow) toggleEvidence();
      drawEvidence();
      return;
    }
    if (typeof m.on === "boolean" && m.on !== _evidenceShow) toggleEvidence();
  }

  // ── 원격 자가진단(앱 캐시 우회): forge.html?embed=app&demo=1&deep=1&diag=1 을 직접 열면
  //    부모 앱 없이 프레임이 스스로 NVDA 분석·작도하고, ?diag=1 이면 상태를 화면 글자로 띄운다. ──
  if (/[?&]diag=1/.test(location.search)) {
    setInterval(function () {
      var el = document.getElementById("msDiag");
      if (!el) { el = document.createElement("div"); el.id = "msDiag";
        el.style.cssText = "position:fixed;left:4px;top:4px;z-index:99999;background:rgba(0,0,0,.85);color:#0f0;font:11px/1.4 monospace;padding:4px 6px;white-space:pre;pointer-events:none;max-width:96%";
        document.body.appendChild(el); }
      var ev = -1; try { var cv = document.getElementById("fcEvidence"); var c = cv.getContext("2d"); var d = c.getImageData(0,0,cv.width,cv.height).data; ev = 0; for (var i=3;i<d.length;i+=8) if (d[i]>60) ev++; } catch (e) {}
      var cs = getComputedStyle(document.getElementById("fcEvidence"));
      el.textContent = "DIAG v=20260825p evPx=" + ev + " disp=" + cs.display + " op=" + cs.opacity + " show=" + (typeof _evidenceShow!=="undefined"?_evidenceShow:"?") + " evhide=" + document.body.classList.contains("evhide");
    }, 700);
  }
  if (/[?&]demo=1/.test(location.search)) {
    var _dt = /custom/.test(location.search) ? "custom" : (/deep/.test(location.search) ? "deep" : "basic");
    var _dw = function () {
      if (typeof onLoad !== "function") { setTimeout(_dw, 200); return; }
      onLoad({ symbol: "NVDA", tf: "1day", tier: _dt, draft: true, evidence: false }).then(function () { setTimeout(function () { onPlay(); }, 1500); });
    };
    setTimeout(_dw, 700);
  }

  window.addEventListener("message", function (ev) {
    const m = ev.data; if (!m || m.src !== "moneyscoop-app") return;
    switch (m.type) {
      case "load": onLoad(m); break;
      case "play": onPlay(); break;
      case "stop": _embStop(); break;
      case "tf": onTF(m); break;
      case "evidence": onEvidence(m); break;
      case "fit": try { fitPrediction(); } catch (e) {} break;
      case "theme": if (typeof applyTheme === "function" && THEMES[m.key]) applyTheme(m.key); break;
      case "lock": _chartLock = !!m.on; if (typeof applyChartLock === "function") applyChartLock(); break;
      default: break;
    }
  });
})();
