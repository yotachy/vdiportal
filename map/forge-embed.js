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
        renderChart(lastResult, currentData());
        if (Array.isArray(m.evidenceOff) && m.evidenceOff.length) onEvidence({ off: m.evidenceOff });
        if (typeof fitPrediction === "function") { try { fitPrediction(); } catch (e) {} }
      }
    } catch (e) { emit("error", { msg: String(e && e.message || e) }); }
  }

  const WIDE_BARS = 120;
  let _draft = false;   // 시연 중 전폭에 놓을 캔들 수(폰 폭 기준 봉당 ~3px — 작도가 읽히는 밀도)
  function onPlay() {
    if (!hasRealSeries()) { emit("error", { msg: "no-series" }); return; }
    if (_playing) return;
    // 작도 단계 = 콘 없이 캔들 전폭(사용자 판정 2026-08-25: 절반만 보이는 작도는 신뢰가 안 간다) →
    // 시연이 끝나면(done) fitPrediction 이 콘 배치로 전환한다
    _drawWide = true;
    // 순차 작도 + 총 길이(기본 5지표는 짧게) — 서사(step)와 그림이 같은 박자로 간다. 근거는 시연이 켠다(load 는 evidence:false 로 올 수 있음)
    _playSeq = true; _playTotalMs = _lastTier === "basic" ? 8000 : 16000;
    _evidenceShow = true;
    // preview(웹분석 전) 상태면 drawEvidence 가 작도를 통째로 건너뛴다 → 시연 동안 근거가 안 보인다.
    // 이 종목을 '웹분석 후'로 승격해 preview 해제(콘은 _drawWide 가 계속 숨긴다).
    if (typeof _deepSessionDocs !== "undefined") _deepSessionDocs.add(activeId);
    if (typeof window !== "undefined") window._fcPreview = false;
    const N = (currentData().price || []).length;
    _chartWin.count = Math.min(N, WIDE_BARS); _chartWin.start = Math.max(0, N - _chartWin.count);
    _yScale = { mode: "auto", lo: null, hi: null };
    playAnalysis();
    // reduced-motion 이면 playAnalysis 가 즉시 확정 렌더로 끝난다 — 완료 신호를 여기서 보낸다
    if (typeof prefersReducedMotion === "function" && prefersReducedMotion()) emit("done", { instant: true });
  }
  // 시연 종료(완료·중단) → 전폭 모드 해제 + 콘 프레이밍
  function onPlayEnd() {
    _playSeq = false;
    if (!_drawWide && !_draft) return;
    _drawWide = false; _draft = false;
    // 시연 종료 → 확정 콘 공개(웹분석 후 상태) + 예측 프레이밍
    try { if (typeof _deepSessionDocs !== "undefined") _deepSessionDocs.add(activeId); renderChart(lastResult, currentData()); } catch (e) {}
    try { fitPrediction(); } catch (e) { try { renderHeroZoom(); } catch (e2) {} }
  }
  const _emitRaw = emit;
  emit = function (type, data) { if (type === "done" || type === "stopped") { try { onPlayEnd(); } catch (e) {} } _emitRaw(type, data); };
  window._embedEmit = emit;

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

  window.addEventListener("message", function (ev) {
    const m = ev.data; if (!m || m.src !== "moneyscoop-app") return;
    switch (m.type) {
      case "load": onLoad(m); break;
      case "play": onPlay(); break;
      case "stop": if (_playing) stopPlay(); break;
      case "tf": onTF(m); break;
      case "evidence": onEvidence(m); break;
      case "fit": try { fitPrediction(); } catch (e) {} break;
      case "theme": if (typeof applyTheme === "function" && THEMES[m.key]) applyTheme(m.key); break;
      case "lock": _chartLock = !!m.on; if (typeof applyChartLock === "function") applyChartLock(); break;
      default: break;
    }
  });
})();
