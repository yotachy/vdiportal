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
  // ── 임베드 자체 시연(가벼움) — PC 의 무거운 morph RAF + 100+ setTimeout 틱(HUD/로그 DOM) 대신,
  //    지표를 하나씩 넉넉한 간격으로 그린다. 매 스텝 사이 스레드가 쉬어 느린 폰에서도 화면이 갱신되고
  //    순차 작도가 실제로 보인다(2026-08-25: PC morph 는 폰 스레드를 20초 독점해 끝에 한 번에 나타남). ──
  var _embT = null, _embI = 0, _embNodes = [];
  function onPlay() {
    if (!hasRealSeries()) { emit("error", { msg: "no-series" }); return; }
    if (_playing || _embT) return;
    // 전폭 캔들(콘 숨김) + 근거 표시 준비
    _drawWide = true; _playSeq = true; _playTotalMs = _lastTier === "basic" ? 7000 : 13000;
    _evidenceShow = true; document.body.classList.remove("evhide");
    if (typeof _deepSessionDocs !== "undefined") _deepSessionDocs.add(activeId);
    if (typeof window !== "undefined") window._fcPreview = false;
    var N = (currentData().price || []).length;
    _chartWin.count = Math.min(N, WIDE_BARS); _chartWin.start = Math.max(0, N - _chartWin.count);
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
    var per = Math.max(280, Math.round(_playTotalMs / Math.max(1, _embNodes.length)));
    function revealNext() {
      _embT = null;
      if (!_playing) return;
      if (_embI >= _embNodes.length) { _embFinish(); return; }
      var n = _embNodes[_embI];
      // _seqStart 를 과거로 → drawEvidence 의 _skFrac=(now-start)/dur 가 즉시 1 = 이 지표가 공개 순간 완전히 그려진다(pop-in).
      // 한 스텝당 한 번만 그려도 되므로 스레드가 스텝 사이에 쉰다(느린 폰에서 화면 갱신·순차 표시 보장).
      _seqDur[n.id] = per * 0.85;
      _seqStart[n.id] = (typeof performance !== "undefined" ? performance.now() : Date.now()) - _seqDur[n.id] - 1;
      _scanU = Math.min(0.999, (_embI + 1) / _embNodes.length);
      var txt = "";
      try { if (lastResult && lastResult.nodeText) txt = lastResult.nodeText[n.id] || ""; } catch (e) {}
      emit("step", { idx: _embI, total: _embNodes.length, type: n.blockType,
        label: (typeof BTLABEL !== "undefined" && BTLABEL[n.blockType]) || n.blockType,
        sIdx: 0, sTotal: 1, text: txt, last: true });
      drawEvidence();   // 지금까지 공개된 지표 + 이번 지표(스케치 진행도 _skFrac)
      _embI++;
      _embT = setTimeout(revealNext, per);
    }
    _embT = setTimeout(revealNext, 350);
    return;
  }
  function _embFinish() {
    _embT = null; _embNodes = [];
    _scanning = false; _scanU = 1; _playSeq = false; _seqStart = {};
    _evidenceSet = new Set((typeof evIndicatorNodes === "function" ? evIndicatorNodes() : []).map(function (n) { return n.id; }));
    _playing = false;
    if (typeof updatePlayBtn === "function") { try { updatePlayBtn(); } catch (e) {} }
    emit("done", {});   // onPlayEnd(래핑된 emit) 가 _drawWide 해제 + 확정 콘 + fitPrediction 처리
  }
  function _embStop() {
    if (_embT) { clearTimeout(_embT); _embT = null; }
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
      el.textContent = "DIAG v=20260825g evPx=" + ev + " disp=" + cs.display + " op=" + cs.opacity + " show=" + (typeof _evidenceShow!=="undefined"?_evidenceShow:"?") + " evhide=" + document.body.classList.contains("evhide");
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
