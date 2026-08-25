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
        if (!_evidenceShow) toggleEvidence();   // 결과 열람 = 근거 표시(앱은 웹분석 전/후 구분 없음)
        renderChart(lastResult, currentData());
        if (Array.isArray(m.evidenceOff) && m.evidenceOff.length) onEvidence({ off: m.evidenceOff });
        if (typeof fitPrediction === "function") { try { fitPrediction(); } catch (e) {} }
      }
    } catch (e) { emit("error", { msg: String(e && e.message || e) }); }
  }

  const WIDE_BARS = 120;
  let _draft = false;   // 시연 중 전폭에 놓을 캔들 수(폰 폭 기준 봉당 ~3px — 작도가 읽히는 밀도)
  // ── 지표별 카메라(작도 목적에 맞춰 시야 이동) — 큰 그림 지표는 멀리(줌아웃), 근접 지표는 가까이(줌인) ──
  // wide=장기·구조 전체 조망 / mid=중기 / near=최근 근접. 실제 작도가 "멀리서 보고 가까이서 본다"는 느낌.
  var _CAM = {
    trend:"wide", ma:"wide", ichimoku:"wide", fib:"wide", elliott:"wide", structure:"wide",
    cycle:"wide", gann:"wide", smc:"wide", volumeprofile:"wide", phasefold:"wide",
    adx:"mid", macd:"mid", supertrend:"mid", vwap:"mid", aroon:"mid", roc:"mid", ao:"mid",
    donchian:"mid", keltner:"mid",
    bollinger:"near", rsi:"near", stochastic:"near", cci:"near", williams:"near", mfi:"near",
    cmf:"near", psar:"near", pivot:"near", pattern:"near", volume:"near", atr:"near"
  };
  function _camWin(kind, N) {
    var c = kind === "wide" ? Math.min(N, 220) : kind === "mid" ? Math.min(N, 90) : Math.min(N, 44);
    c = Math.max(20, c);
    return { count: c, start: Math.max(0, N - c) };
  }
  // _chartWin 을 목표 창으로 부드럽게 이동(짧은 트윈 — 카메라가 미끄러지듯). 스텝마다 캔들+근거 재그림.
  function _camTween(target, steps, done) {
    var s0 = _chartWin.start, c0 = _chartWin.count, i = 0;
    steps = Math.max(1, steps);
    function step() {
      if (!_playing) { if (done) done(); return; }
      i++;
      var t = i / steps, e = 1 - Math.pow(1 - t, 3);   // easeOutCubic
      _chartWin.count = Math.round(c0 + (target.count - c0) * e);
      _chartWin.start = Math.round(s0 + (target.start - s0) * e);
      try { renderHeroZoom(); } catch (err) {}
      if (i < steps) { _camT = setTimeout(step, 55); } else { if (done) done(); }
    }
    step();
  }

  // ── 임베드 자체 시연(가벼움) — PC 의 무거운 morph RAF + 100+ setTimeout 틱(HUD/로그 DOM) 대신,
  //    지표를 하나씩 넉넉한 간격으로 그린다. 매 스텝 사이 스레드가 쉬어 느린 폰에서도 화면이 갱신되고
  //    순차 작도가 실제로 보인다(2026-08-25: PC morph 는 폰 스레드를 20초 독점해 끝에 한 번에 나타남). ──
  var _embT = null, _embI = 0, _embNodes = [], _camT = null;
  function onPlay() {
    if (!hasRealSeries()) { emit("error", { msg: "no-series" }); return; }
    if (_playing || _embT) return;
    // 전폭 캔들(콘 숨김) + 근거 표시 준비
    _drawWide = true; _playSeq = true; _playTotalMs = _lastTier === "basic" ? 7000 : 13000;
    _evidenceShow = true; document.body.classList.remove("evhide");
    if (typeof _deepSessionDocs !== "undefined") _deepSessionDocs.add(activeId);
    if (typeof window !== "undefined") window._fcPreview = false;
    var N = (currentData().price || []).length;
    var w0 = _camWin("wide", N); _chartWin.count = w0.count; _chartWin.start = w0.start;   // 시작=전체 조망
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
    _embI = 0;
    var _now = function () { return typeof performance !== "undefined" ? performance.now() : Date.now(); };
    function revealNext() {
      _embT = null;
      if (!_playing) return;
      if (_embI >= _embNodes.length) { _embFinish(); return; }
      var n = _embNodes[_embI];
      var N2 = (currentData().price || []).length;
      var target = _camWin(_CAM[n.blockType] || "mid", N2);
      // 한 지표당 시간 배분(서두르지 않게): 카메라 글라이드 → 손그림 스트로크 → 잠깐 머무름
      var per = Math.max(520, Math.min(1300, Math.round(_playTotalMs / Math.max(1, _embNodes.length))));
      var camMs = Math.min(360, Math.round(per * 0.32)), drawMs = Math.round(per * 0.52), holdMs = Math.max(120, per - camMs - drawMs);
      var camSteps = Math.max(6, Math.round(camMs / 40));
      // ① 카메라를 이 지표의 스케일 시야로 부드럽게 이동(누적 작도는 시야 따라 함께 움직임)
      _camTween(target, camSteps, function () {
        if (!_playing) return;
        var txt = "";
        try { if (lastResult && lastResult.nodeText) txt = lastResult.nodeText[n.id] || ""; } catch (e) {}
        emit("step", { idx: _embI, total: _embNodes.length, type: n.blockType,
          label: (typeof BTLABEL !== "undefined" && BTLABEL[n.blockType]) || n.blockType,
          sIdx: 0, sTotal: 1, text: txt, last: true, cam: _CAM[n.blockType] || "mid" });
        _scanU = Math.min(0.999, (_embI + 1) / _embNodes.length);
        // ② 손그림 스트로크: _seqStart=지금 → drawEvidence 의 _skFrac(=경과/드로시간)이 0→1 로 자라며
        //    이 지표가 '그어지는' 느낌(선은 긋고, 82% 지나면 라벨·점·레벨이 얹힘 — 지표별 고유 작도 그대로).
        _seqDur[n.id] = drawMs;
        _seqStart[n.id] = _now();
        var t0 = _now();
        (function stroke() {
          if (!_playing) return;
          try { drawEvidence(); } catch (e) {}
          if (_now() - t0 < drawMs) { _embT = setTimeout(stroke, 42); return; }   // ~24fps 손그림(가볍다: drawEvidence ≈ 4ms)
          try { drawEvidence(); } catch (e) {}   // 완성 프레임
          _embI++;
          _embT = setTimeout(revealNext, holdMs);   // ③ 잠깐 머무른 뒤 다음 지표
        })();
      });
    }
    _embT = setTimeout(revealNext, 400);
    return;
  }
  function _embFinish() {
    _embT = null; if (_camT) { clearTimeout(_camT); _camT = null; } _embNodes = [];
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
      el.textContent = "DIAG v=20260825i evPx=" + ev + " disp=" + cs.display + " op=" + cs.opacity + " show=" + (typeof _evidenceShow!=="undefined"?_evidenceShow:"?") + " evhide=" + document.body.classList.contains("evhide");
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
