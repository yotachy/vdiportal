  /* ════════════════════════════════════════════════════════════════
     BOARD ENGINE  — lightweight port of Scoop Board (map/map.html)
     Omitted: thumbnails, server-save, undo/redo, groups, icons,
              multi-canvas, copy/paste, auto-layout, A* routing.
     Kept: pan/zoom, node render (block+free kinds), edge render
           (ortho path), port-drag connect, selection, minimal HUDs.
     Forge semantics: boardState / boardToGraph / fireBoardChange.
     ════════════════════════════════════════════════════════════════ */

  /* ── uid ─────────────────────────────────────────────────────── */
  let _uidc = 0;
  function uid(p) {
    return (p || "id") + "_" + (++_uidc) + "_" + Math.random().toString(36).slice(2, 5);
  }
  function strCmp(a, b) { return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }

  /* ── DOM refs (set by boardInit) ─────────────────────────────── */
  let bStage = null, bWorld = null;

  /* ── Core state ──────────────────────────────────────────────── */
  let boardState = { nodes: [], edges: [] };
  let view = { tx: 30, ty: 20, scale: 1 };
  let sel = [];           // selected node id[]
  let selEdge = null;     // selected edge id | null
  let drag = null;
  let spaceDown = false;
  let justDragged = false;

  /* ── Hero 줌/팬 상태 ─────────────────────────────────────────── */
  let _heroZoom = { s: 1, tx: 0, ty: 0 };
  let _heroZoomDragging = false;
  let _logChart = false;
  let _chartWin = { start: 0, count: 0 };   // count 0 = 미초기화(전체 시계열 길이로 기본화)
  let _needFit = true;   // 첫 표시/새 데이터 시 캔들+예측밴드 전체가 보이도록 자동 프레이밍(fitPrediction)
  let _chartNav = false;   // 사용자가 시간축을 수동 조작(드래그/휠) 중 — true면 세로 오토스케일이 예측밴드 제외(캔들 상세 유지)
  let _yScale = { mode: "auto", lo: null, hi: null };
  function resetYScale() { _yScale = { mode: "auto", lo: null, hi: null }; }
  function resetChartWin() {
    const s = (typeof priceSeries === "function") ? priceSeries() : null;
    const N = (s && s.length) || 0;
    _chartWin.count = Math.min(180, N);
    _chartWin.start = Math.max(0, N - _chartWin.count);
    _chartNav = false;   // (레거시) 세로 오토스케일은 이제 항상 캔들 기준이라 _chartNav는 스케일에 영향 없음
  }
  function tvLog(x, on) { return on ? Math.log(Math.max(1e-9, x)) : x; }
  function resetHeroView() { _heroZoom = { s: 1, tx: 0, ty: 0 }; }
  function clampPan() {
    const cv = document.getElementById("fcMainChart"); if (!cv) return;
    const W = cv.clientWidth || 1, H = cv.clientHeight || 1, s = _heroZoom.s;
    if (s <= 1.0001) { _heroZoom.tx = 0; _heroZoom.ty = 0; _heroZoom.s = 1; return; }
    const minVis = 0.25;
    const maxTx = W * (1 - minVis), minTx = W * minVis - W * s;
    const maxTy = H * (1 - minVis), minTy = H * minVis - H * s;
    _heroZoom.tx = Math.max(minTx, Math.min(maxTx, _heroZoom.tx));
    _heroZoom.ty = Math.max(minTy, Math.min(maxTy, _heroZoom.ty));
  }
  function _syncZoomBtn() { /* 오버레이 ⊕ 제거됨 — A 버튼이 전체 자동배열 담당 */ }
  function renderHeroZoom() {
    // 시뮬레이션 중(팬·축·줌 드래그)엔 최종 예측이 아니라 현재 모프 프레임(_playPred)을 그림 — 최종 3라인 겹쳐 보이는 스포일러 방지
    const pred = (typeof _playing !== "undefined" && _playing && typeof _playPred !== "undefined" && _playPred) ? _playPred : (_fcLastResult && _fcLastResult.prediction);
    const px = (_fcLastData && _fcLastData.price) || (currentData && currentData().price) || [];
    fcDrawMainChart(px, pred);
    drawEvidence();
    _syncZoomBtn();
    if (typeof updateAxisBtns === "function") updateAxisBtns();   // A/L 버튼 상태 동기화(y드래그→manual 시 A 꺼짐)
  }
  // 예측 구간이 화면에 잘 담기도록 가로(최근이력+콘)·세로(콘 전체 lo~hi)를 자동 배치
  function fitPrediction() {
    if (typeof fitHeroHeight === "function") fitHeroHeight(false);   // 세로 여백 채우게 높이 먼저(리드로우는 아래서)
    const cv = document.getElementById("fcMainChart"), g = cv && cv._mainGeo; if (!g) return;
    const price = (_fcLastData && _fcLastData.price) || (currentData && currentData().price) || [];
    const N = price.length, pl = (g.path && g.path.length) || 0;
    if (!N || !pl || !g.lo || !g.hi) return;
    const histShow = Math.min(N, Math.max(24, Math.round(pl * 1.4)));   // 가로: 최근 이력 + 콘(폭 ~45%)
    _chartWin.count = histShow; _chartWin.start = Math.max(0, N - histShow);   // 최신에 끝나게 → 콘 표시
    // 세로: 예측 밴드(콘 lo~hi)가 주(主) + 현재가 + '최근' 캔들만. 먼 과거 저/고점(대급등 이력 등)은 제외 → 예측치가 위아래로 꽉 차게(일·주·월 무관)
    let lo = Infinity, hi = -Infinity;
    for (const v of g.lo) if (isFinite(v) && v < lo) lo = v;
    for (const v of g.hi) if (isFinite(v) && v > hi) hi = v;
    if (isFinite(g.anchor)) { lo = Math.min(lo, g.anchor); hi = Math.max(hi, g.anchor); }
    const _vN = Math.max(16, Math.round(pl * 0.6));                      // 세로 스케일엔 최근 예측길이×0.6 캔들만
    for (let i = Math.max(_chartWin.start, N - _vN); i < N; i++) { const v = price[i]; if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    // 프레이밍 캡: 장기·고변동서 예측 밴드가 수배(예: 상단 9×)로 벌어져 캔들·예측이 한쪽에 몰리는 것 방지.
    // 앵커 기준 상/하 2.8배 이내로 프레이밍 → 예측치가 화면을 위아래로 꽉 채움(극단 tip은 잘림·끝점 마커는 가장자리 클램프).
    if (isFinite(g.anchor) && g.anchor > 0) { lo = Math.max(lo, g.anchor / 2.8); hi = Math.min(hi, g.anchor * 2.8); }
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return;
    const pad = (hi - lo) * 0.06 || 1;
    _yScale = { mode: "manual", lo: lo - pad, hi: hi + pad };
    if (typeof resetHeroView === "function") resetHeroView();
    renderHeroZoom();   // 재그리면 콘이 화면 안 → updateFitBtn이 버튼 숨김
  }
  // 예측 콘이 세로로 화면을 벗어났을(클리핑) 때만 현재가 근처에 버튼 표시
  function updateFitBtn() {
    const btn = document.getElementById("fcFitBtn"); if (!btn) return;
    btn.style.display = "none"; return;   // 확대 버튼 보류(추후 개선) — 항상 숨김
    const cv = document.getElementById("fcMainChart"), g = cv && cv._mainGeo;
    if (!g || !g.pathLen || !g.atLatest) { btn.style.display = "none"; return; }   // 콘 없거나 최신 아님 → 숨김
    const M = 6;   // 허용 마진(px) — 이보다 많이 벗어나면 버튼 재등장
    const clipped = g.bandTop < g.padTop - M || g.bandBot > g.ch - g.padBot + M;
    if (!clipped) { btn.style.display = "none"; return; }   // 잘 담김 → 숨김
    btn.style.display = "inline-flex";
    const bw = btn.offsetWidth || 120;
    const top = Math.max(g.padTop + 14, Math.min(g.ch - g.padBot - 14, g.anchorY));   // 현재가 Y(플롯 안 유지)
    btn.style.top = top + "px";
    btn.style.left = Math.max(g.padX + 4, g.plotRight - bw - 8) + "px";   // 현재가 pill 왼쪽
  }

  /* ── Server layer globals ──────────────────────────────────────── */
  const FORGE_API = "forge-api.php";
  const VISION_ENABLED = true;    // 비전 시계열(샘플 데모 데이터 소스). 이미지 분석 UI는 추후 고도화 — 실 티커 포지에선 저장된 vision 무시(loadDoc)
  console.log("[forge] Scoop Forge vb0.1");
  let SERVER_OK = true, DOCS = [], META = { library: [], activeId: null }, activeId = null;
  // 인증 상태(v1 auth) — 서버 forge-auth.php?me=1. enabled=false(OAuth 미설정)면 종전 동작(전역 문서, canSave=true).
  let AUTH = { checked: false, enabled: false, on: false, email: null };
  async function fetchAuth() {
    try { const r = await fetch("forge-auth.php?me=1", { cache: "no-store" }); const j = await r.json();
      AUTH = { checked: true, enabled: !!j.enabled, on: !!j.ok, email: j.email || null }; }
    catch (e) { AUTH = { checked: true, enabled: false, on: false, email: null }; }
  }
  function canSave() { return !AUTH.enabled || AUTH.on; }   // 스위치 꺼짐=종전 · 켜짐=로그인만 저장
  let _nudged = false;
  function guestNudge() { if (_nudged) return; _nudged = true; if (typeof bToast === "function") bToast("체험 모드 — 로그인하면 포지가 저장됩니다"); }
  let _firstIdle = false;   // 첫 진입: 티커 자동 선택/분석 없음(워치리스트 하이라이트도 없음). 사용자가 종목 클릭 시 해제.
  async function apiGet(qs) {
    try { const r = await fetch(FORGE_API + (qs || ""), { cache: "no-store" });
      if (!r.ok) throw 0; SERVER_OK = true; return await r.json(); }
    catch (e) { SERVER_OK = false; setSaveState("offline"); return undefined; }
  }
  async function apiPost(body) {
    try { const r = await fetch(FORGE_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw 0; SERVER_OK = true; return await r.json(); }
    catch (e) { SERVER_OK = false; setSaveState("offline"); return undefined; }
  }
  function setSaveState(s) {
    const el = document.getElementById("saveBadge"); if (!el) return;
    if (AUTH.enabled && !AUTH.on) { el.textContent = "● 체험 모드 · 저장 안 됨"; el.className = "save-badge guest"; return; }   // 게스트 상시 배지
    el.textContent = s === "saving" ? "● 저장 중…" : s === "offline" ? "● 오프라인" : "";   // 저장됨 문구 제거(정상 시 비움)
    el.className = "save-badge " + (s === "saved" ? "" : s);
  }

  const W_NODE = 200;   // default node width (block kind)
  const EWIDTHS = { 1: 1.6, 2: 2.4, 3: 3.8 };
  /* 고정 배치 모드: 블록을 일정한 격자에 자동 정렬(드래그/연결 없음). 관련 기능 코드는 남겨두고 게이트만. */
  const FIXED_LAYOUT = true;
  /* 패널 모드: 캔버스(팬/줌/절대배치/마퀴)를 끄고 스크롤 패널 + CSS 그리드로. 캔버스 기능 코드는 남겨두고 게이트만. */
  const PANEL_MODE = FIXED_LAYOUT;
  function layoutBlocks() {
    if (!FIXED_LAYOUT || PANEL_MODE) return;   // 패널 모드는 CSS 그리드가 배치
    const order = BLOCK_DEFS.filter(d => d.kind === "block" && d.type !== "ticker").map(d => d.type);
    const rank = t => { const i = order.indexOf(t); return i < 0 ? 99 : i; };
    const blocks = boardState.nodes.filter(n => n.blockType && n.blockType !== "ticker");
    blocks.sort((a, b) => rank(a.blockType) - rank(b.blockType));
    const COLS = 2, X0 = 50, Y0 = 38, GX = W_NODE + 46, GY = 132;
    blocks.forEach((n, i) => { n.x = X0 + (i % COLS) * GX; n.y = Y0 + Math.floor(i / COLS) * GY; });
    const memos = boardState.nodes.filter(n => n.kind !== "block" && n.blockType !== "ticker");
    const base = Y0 + Math.ceil(blocks.length / COLS) * GY + 12;
    memos.forEach((n, i) => { n.x = X0 + (i % COLS) * GX; n.y = base + Math.floor(i / COLS) * GY; });
  }
  /* 측정 높이 기반 정밀 배치(masonry 2단) — 썸네일로 카드 높이가 달라도 겹치지 않게. measure() 후 호출. */
  function flowLayout() {
    if (!FIXED_LAYOUT || PANEL_MODE) return;   // 패널 모드는 CSS 그리드가 배치
    const order = BLOCK_DEFS.filter(d => d.kind === "block" && d.type !== "ticker").map(d => d.type);
    const rank = t => { const i = order.indexOf(t); return i < 0 ? 99 : i; };
    const blocks = boardState.nodes.filter(n => n.blockType && n.blockType !== "ticker").sort((a, b) => rank(a.blockType) - rank(b.blockType));
    const memos = boardState.nodes.filter(n => n.kind !== "block" && n.blockType !== "ticker");
    const items = blocks.concat(memos);
    const COLS = 2, X0 = 50, Y0 = 38, GX = W_NODE + 46, GAP = 16, colY = [Y0, Y0];
    items.forEach(n => {
      const col = colY[0] <= colY[1] ? 0 : 1;   // 더 짧은 열에 쌓기(masonry)
      n.x = X0 + col * GX; n.y = colY[col];
      colY[col] += (n._h || 120) + GAP;
      const el = bq(n.id); if (el) { el.style.left = n.x + "px"; el.style.top = n.y + "px"; }
    });
  }

  /* ── Block definitions ───────────────────────────────────────── */
  const BLOCK_DEFS = [
    { type: "ticker",    label: "티커",        kind: "block", params: { symbol: "", price: null } },
    { type: "price",     label: "가격",        kind: "block" },
    { type: "ma",        label: "이동평균",    kind: "block", params: { len: 10 } },
    { type: "phasefold", label: "파동 스캔",    kind: "block", params: { pmin: 16, pmax: 128 } },
    { type: "combine",   label: "가중결합",    kind: "block" },
    { type: "trend",     label: "추세선",      kind: "block", params: { len: 40 } },
    { type: "rsi",       label: "RSI",         kind: "block", params: { period: 14 } },
    { type: "bollinger", label: "볼린저밴드",  kind: "block", params: { len: 20, k: 2 } },
    { type: "macd",      label: "MACD",        kind: "block", params: { fast: 12, slow: 26, signal: 9 } },
    { type: "adx",       label: "ADX 추세강도", kind: "block", params: { period: 14 } },
    { type: "volumeprofile", label: "볼륨 프로파일", kind: "block", params: { len: 120, bins: 24 } },
    { type: "ichimoku",  label: "일목균형표",  kind: "block", params: { tenkan: 9, kijun: 26, senkouB: 52, shift: 26 } },
    { type: "structure", label: "시장구조",    kind: "block", params: { swing: 3 } },
    { type: "atr",       label: "ATR 변동성",  kind: "block", params: { period: 14, mult: 2 } },
    { type: "smc",       label: "스마트머니(FVG·OB)", kind: "block", params: {} },
    { type: "cycle",     label: "사이클 분석",  kind: "block", params: { pmin: 10, pmax: 120 } },
    { type: "vwap",      label: "VWAP",        kind: "block", params: { len: 20 } },
    { type: "supertrend", label: "슈퍼트렌드",  kind: "block", params: { period: 10, mult: 3 } },
    { type: "stochastic", label: "스토캐스틱",  kind: "block", params: { kLen: 14, kSmooth: 3, dLen: 3 } },
    { type: "fib",       label: "피보나치",    kind: "block", params: { len: 120 } },
    { type: "elliott",   label: "엘리어트",    kind: "block", params: { swing: 3 } },
    { type: "volume",    label: "거래량",      kind: "block" },
    { type: "pivot",     label: "피벗 포인트",  kind: "block", params: {} },
    { type: "psar",      label: "Parabolic SAR", kind: "block", params: { step: 0.02, max: 0.2 } },
    { type: "keltner",   label: "Keltner 채널", kind: "block", params: { len: 20, atrLen: 10, mult: 2 } },
    { type: "donchian",  label: "Donchian 채널", kind: "block", params: { len: 20 } },
    { type: "cci",       label: "CCI",         kind: "block", params: { period: 20 } },
    { type: "roc",       label: "ROC/모멘텀",   kind: "block", params: { period: 12 } },
    { type: "williams",  label: "Williams %R", kind: "block", params: { period: 14 } },
    { type: "ao",        label: "Awesome Osc.", kind: "block", params: { fast: 5, slow: 34 } },
    { type: "aroon",     label: "Aroon",       kind: "block", params: { period: 25 } },
    { type: "mfi",       label: "MFI",         kind: "block", params: { period: 14 } },
    { type: "cmf",       label: "CMF",         kind: "block", params: { period: 20 } },
    { type: "predict",   label: "예측·시그널", kind: "block" },
    { type: "free",      label: "메모",        kind: "free" }
  ];

  /* 지표 우선순위(등급) — 기술적 분석에서 중요도·사용빈도 순. 지표 레일 정렬 + 등급 배지에 사용 */
  const IND_TIERS = [
    { lv: 1, name: "핵심 지표",  types: ["ma", "macd", "rsi", "bollinger", "volume"] },
    { lv: 2, name: "주요 지표",  types: ["trend", "adx", "stochastic", "fib", "ichimoku", "pivot", "psar"] },
    { lv: 3, name: "보조·전문",  types: ["vwap", "supertrend", "atr", "volumeprofile", "structure", "keltner", "donchian", "cci", "williams", "aroon", "mfi"] },
    { lv: 4, name: "고급·심화",  types: ["elliott", "smc", "cycle", "phasefold", "roc", "ao", "cmf"] },
  ];
  const NEW_INDICATORS = new Set(["pivot", "psar", "keltner", "donchian", "cci", "williams", "roc", "ao", "aroon", "mfi", "cmf"]);   // 신규 추가 지표 — 레일에 'new' 표기

  /* helpers */
  const bN = id => boardState.nodes.find(n => n.id === id);
  const bE = id => boardState.edges.find(e => e.id === id);
  const DIR = { right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1] };
  const esc = s => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /* ── autoLayout helpers ──────────────────────────────────────── */
  function parentsOf(id) {
    return boardState.edges.filter(e => e.to === id).map(e => e.from);
  }
  function autoLayout(dir) {
    if (!boardState.nodes.length) return;
    measure();
    const layer = {}, vis = {};
    const lay = id => {
      if (layer[id] != null) return layer[id];
      if (vis[id]) return 0;
      vis[id] = 1;
      const ps = parentsOf(id);
      let m = 0;
      if (ps.length) m = Math.max(...ps.map(p => lay(p) + 1));
      layer[id] = m; vis[id] = 0; return m;
    };
    boardState.nodes.forEach(n => lay(n.id));
    const byL = {};
    boardState.nodes.forEach(n => { (byL[layer[n.id]] = byL[layer[n.id]] || []).push(n); });
    const layers = Object.keys(byL).map(Number).sort((a, b) => a - b);
    const PAD = 40;
    /* 형태 기준 매핑: '세로'(v)=레이어를 가로로 펼치고 형제는 세로로 쌓아 길쭉(tall),
       '가로'(h)=레이어를 세로로 쌓고 형제는 가로로 펼쳐 넓적(wide). */
    if (dir === "v") {
      layers.forEach(L => { const col = byL[L].slice().sort((a, b) => a.y - b.y); let cy = PAD; const x = PAD + L * 330; col.forEach(n => { n.x = x; n.y = cy; cy += (n._h || 90) + 38; }); });
      boardState.edges.forEach(e => { e.fromSide = "right"; e.toSide = "left"; });
    } else {
      let cy = PAD; layers.forEach(L => { const row = byL[L].slice().sort((a, b) => a.x - b.x); let cx = PAD, mh = 0; row.forEach(n => { n.x = cx; n.y = cy; cx += (n._w || W_NODE) + 50; mh = Math.max(mh, n._h || 90); }); cy += mh + 56; });
      boardState.edges.forEach(e => { e.fromSide = "bottom"; e.toSide = "top"; });
    }
    renderBoard(); fitView(); markDirty();
    bToast(dir === "h" ? "가로 정렬" : "세로 정렬");
  }
  /* 은하 배치: '포지'(predict)를 중심에 두고 지표 노드들이 둘러싸 떠다니는 형태.
     동시 분석 모델의 시각화 — 주변 지표가 중심 포지로 종합된다. */
  function galaxyLayout() {
    if (!boardState.nodes.length) return;
    measure();
    const center = boardState.nodes.find(n => n.blockType === "predict")
      || boardState.nodes.find(n => n.blockType === "combine")
      || boardState.nodes.find(n => n.kind === "block");
    if (!center) return;
    const cx = 760, cy = 460;
    center.x = cx - (center._w || W_NODE) / 2; center.y = cy - (center._h || 90) / 2;
    const combine = boardState.nodes.find(n => n.blockType === "combine" && n !== center);
    const ring = boardState.nodes.filter(n => n.kind === "block" && n !== center && n !== combine);
    const R = Math.max(320, ring.length * 64 + 150);
    ring.forEach((n, i) => {
      const ang = -Math.PI / 2 + (i / Math.max(1, ring.length)) * Math.PI * 2;
      n.x = cx + Math.cos(ang) * R - (n._w || W_NODE) / 2;
      n.y = cy + Math.sin(ang) * R * 0.74 - (n._h || 90) / 2;   // 살짝 납작한 은하 타원
    });
    if (combine) { combine.x = cx - (combine._w || W_NODE) / 2; combine.y = cy - (combine._h || 90) - 150; }
    boardState.edges.forEach(e => { e.fromSide = "auto"; e.toSide = "auto"; });
    document.body.classList.add("galaxy");
    renderBoard(); fitView(); markDirty();
    bToast("은하 배치 · 포지 중심 · 지표가 둘러싸 부유");
  }
  function toggleGalaxy() {
    if (document.body.classList.contains("galaxy")) { document.body.classList.remove("galaxy"); bToast("은하 배치 해제"); }
    else galaxyLayout();
  }

  /* ── Change notification ─────────────────────────────────────── */
  let _boardChangeCb = null;
  function onBoardChange(cb) { _boardChangeCb = cb; }
  function fireBoardChange() { if (_boardChangeCb) _boardChangeCb(); }

  /* ── boardToGraph ────────────────────────────────────────────── */
  /* 연결선 UI를 없앤 뒤에도 엔진 위상을 보존: 지표 → combine(있으면) → predict 를 계산 직전 합성. */
  function synthEdges(nodes) {
    const blocks = nodes.filter(n => n.kind === "block");
    const predict = blocks.find(n => n.blockType === "predict");
    const combine = blocks.find(n => n.blockType === "combine");
    const hub = combine || predict;
    const edges = [];
    if (!hub) return edges;
    // combine 입력에서 제외할 비지표(원본/티커/거래량/허브 자신)
    const SKIP = new Set(["price", "ticker", "volume", "combine", "predict"]);
    blocks.forEach(n => {
      if (n === hub) return;
      if (SKIP.has(n.blockType)) return;
      edges.push({ from: n.id, to: hub.id });
    });
    if (combine && predict && combine !== predict) edges.push({ from: combine.id, to: predict.id });
    return edges;
  }
  function boardToGraph() {
    const nodes = boardState.nodes.map(n => ({
      id: n.id,
      kind: n.kind || "free",
      blockType: n.blockType || null,
      params: n.params || {},
      conviction: n.conviction || 0,
      weight: (n.weight != null ? n.weight : 50)
    }));
    return { nodes, edges: synthEdges(boardState.nodes) };
  }

  /* ── worldPt ─────────────────────────────────────────────────── */
  function worldPt(cx, cy) {
    const r = bStage.getBoundingClientRect();
    return {
      x: (cx - r.left - view.tx) / view.scale,
      y: (cy - r.top  - view.ty) / view.scale
    };
  }

  /* ── Edge geometry ───────────────────────────────────────────── */
  function anchor(n, side) {
    const w = n._w || W_NODE, h = n._h || 70;
    switch (side) {
      case "left":   return { x: n.x,       y: n.y + h / 2 };
      case "top":    return { x: n.x + w/2,  y: n.y         };
      case "bottom": return { x: n.x + w/2,  y: n.y + h     };
      default:       return { x: n.x + w,    y: n.y + h / 2 };
    }
  }
  function nearestSide(n, pt) {
    const w = n._w || W_NODE, h = n._h || 70;
    const dx = (pt.x - (n.x + w/2)) / w, dy = (pt.y - (n.y + h/2)) / h;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top");
  }
  function centerOf(n) { return { x: n.x + (n._w || W_NODE)/2, y: n.y + (n._h || 70)/2 }; }
  function sidesOf(e) {
    const a = bN(e.from), b = bN(e.to);
    if (!a || !b) return { fs: "right", ts: "left" };
    let fs = e.fromSide, ts = e.toSide;
    const fA = (!fs || fs === "auto"), tA = (!ts || ts === "auto");
    if (fA && tA) { fs = nearestSide(a, centerOf(b)); ts = nearestSide(b, centerOf(a)); }
    else if (fA) { fs = nearestSide(a, anchor(b, ts)); }
    else if (tA) { ts = nearestSide(b, anchor(a, fs)); }
    return { fs, ts };
  }
  function cleanPts(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], b = out[out.length - 1];
      if (Math.abs(p[0]-b[0]) < 0.5 && Math.abs(p[1]-b[1]) < 0.5) continue;
      if (out.length >= 2) {
        const a = out[out.length - 2];
        const hR = Math.abs(a[1]-b[1]) < 0.5 && Math.abs(b[1]-p[1]) < 0.5;
        const vR = Math.abs(a[0]-b[0]) < 0.5 && Math.abs(b[0]-p[0]) < 0.5;
        if (hR || vR) { out[out.length - 1] = p; continue; }
      }
      out.push(p);
    }
    return out;
  }
  function orthoPath(A, B, fs, ts) {
    const hz = s => s === "left" || s === "right";
    const fH = hz(fs), tH = hz(ts), d1 = DIR[fs], d2 = DIR[ts];
    const dist = Math.hypot(B.x-A.x, B.y-A.y), S = Math.max(11, Math.min(26, dist * 0.42));
    const A1 = [A.x + d1[0]*S, A.y + d1[1]*S], B1 = [B.x + d2[0]*S, B.y + d2[1]*S];
    let mids;
    if (fH && tH)        { const mx = (A1[0]+B1[0])/2; mids = [[mx, A1[1]], [mx, B1[1]]]; }
    else if (!fH && !tH) { const my = (A1[1]+B1[1])/2; mids = [[A1[0], my], [B1[0], my]]; }
    else if (fH && !tH)  { mids = [[B1[0], A1[1]]]; }
    else                  { mids = [[A1[0], B1[1]]]; }
    return cleanPts([[A.x, A.y], A1, ...mids, B1, [B.x, B.y]]);
  }
  function polyPath(pts) {
    if (pts.length < 2) return "";
    if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i-1], b = pts[i], c = pts[i+1];
      const l1 = Math.hypot(b[0]-a[0], b[1]-a[1]) || 1, l2 = Math.hypot(c[0]-b[0], c[1]-b[1]) || 1;
      const r = Math.min(8, l1/2, l2/2);
      const p1 = [b[0]-(b[0]-a[0])/l1*r, b[1]-(b[1]-a[1])/l1*r];
      const p2 = [b[0]+(c[0]-b[0])/l2*r, b[1]+(c[1]-b[1])/l2*r];
      d += ` L${p1[0]},${p1[1]} Q${b[0]},${b[1]} ${p2[0]},${p2[1]}`;
    }
    return d + ` L${pts[pts.length-1][0]},${pts[pts.length-1][1]}`;
  }
  function edgeGeo(e) {
    const a = bN(e.from), b = bN(e.to);
    if (!a || !b) return null;
    const s = sidesOf(e), A = anchor(a, s.fs), B = anchor(b, s.ts);
    let d;
    if (e.route === "curve") {
      const dd = Math.hypot(B.x-A.x, B.y-A.y), k = Math.min(120, Math.max(38, dd*0.4));
      const d1 = DIR[s.fs], d2 = DIR[s.ts];
      d = `M${A.x},${A.y} C${A.x+d1[0]*k},${A.y+d1[1]*k} ${B.x+d2[0]*k},${B.y+d2[1]*k} ${B.x},${B.y}`;
    } else {
      d = polyPath(cleanPts(orthoPath(A, B, s.fs, s.ts)));
    }
    return { A, B, fs: s.fs, ts: s.ts, d };
  }
  function nodeAt(pt) {
    let r = null;
    boardState.nodes.forEach(n => {
      const w = n._w || W_NODE, h = n._h || 70;
      if (pt.x >= n.x && pt.x <= n.x + w && pt.y >= n.y && pt.y <= n.y + h) r = n;
    });
    return r;
  }

  /* ── Image core ─────────────────────────────────────────────── */
  const IMAGES = {};
  /* SAMPLE-IMAGES START */
  Object.assign(IMAGES, {"smp_main":"data:image/jpeg;base64,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","smp_ma":"data:image/jpeg;base64,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","smp_wave":"data:image/jpeg;base64,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","smp_rsi":"data:image/jpeg;base64,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","smp_fib":"data:image/jpeg;base64,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","smp_trend":"data:image/jpeg;base64,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","smp_elliott":"data:image/jpeg;base64,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","smp_predict":"data:image/jpeg;base64,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"});
  /* SAMPLE-IMAGES END */
  const LIBRARY = [];
  function imgSrc(id){ return IMAGES[id] || ""; }
  function putImg(id, src) { IMAGES[id] = src; if (!canSave()) { guestNudge(); return; } if (SERVER_OK) apiPost({ op: "putimg", id, src }); }   // 체험: 메모리만(서버 저장 없음)

  /* ── 주제 배너 ───────────────────────────────────────────────── */
  let themeState = { imgId: null, title: "" };

  /* 대표(주제) 이미지 = 가격 노드 이미지 우선, 없으면 문서 주제 이미지 */
  function heroImgId() {
    const price = boardState.nodes.find(n => n.blockType === "price" && n.thumb && n.thumb.imgId);
    return price ? price.thumb.imgId : (themeState.imgId || null);
  }
  function renderHero() {
    const el = document.getElementById("fcHeroImg"); if (!el) return;
    const id = heroImgId();
    el.innerHTML = (id
      ? `<img src="${imgSrc(id)}" alt="">`
      : `<span class="fc-hero-ph">가격 노드에 차트 이미지를 추가하세요<br>(노드 선택 후 클릭 · 드래그 · Ctrl+V)</span>`)
      + `<canvas id="fcCone" class="fc-cone-ov"></canvas>`
      + `<div class="fc-cone-vline" id="fcConeVline"></div><div class="fc-cone-tip" id="fcConeTip"></div>`;
  }
  function renderTheme() { renderHero(); if (hasRealSeries() && lastResult) renderChart(lastResult, currentData()); }

  function setThemeImg(imgId) { themeState.imgId = imgId; renderTheme(); markDirty(); }
  function downscaleImage(src, cb){
    const img = new Image();
    img.onload = () => { let w=img.width,h=img.height; const md=1000, sc=Math.min(1,md/Math.max(w,h));
      w=Math.max(1,Math.round(w*sc)); h=Math.max(1,Math.round(h*sc));
      const c=document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      let q=0.82,out=c.toDataURL("image/jpeg",q);
      while(out.length>120000&&q>0.4){ q-=0.1; out=c.toDataURL("image/jpeg",q); } cb(out); };
    img.onerror = () => { if(src.length<120000) cb(src); else bToast("이미지를 불러올 수 없어요"); };
    img.src = src;
  }
  function setThumb(id, t){ const n=bN(id); if(n){ n.thumb=t; renderBoard(); fireBoardChange(); } }

  /* ── renderLib ────────────────────────────────────────────────── */
  function renderLib() {
    // 이미지 분석 기능 보류(추후 활용 예정) → 대표 이미지(라이브러리) 섹션 숨김
    const el = document.getElementById("libSec"); if (!el) return;
    el.innerHTML = ""; el.style.display = "none";
  }
  /* 라이브러리(팔레트)에서 이미지 제거 — 노드/대표이미지는 그대로 유지(graceful) */
  function delLibImg(id) {
    const i = LIBRARY.findIndex(it => it.id === id); if (i < 0) return;
    let used = 0;
    boardState.nodes.forEach(n => { if (n.thumb && n.thumb.imgId === id) used++; });
    if (themeState.imgId === id) used++;
    const msg = used
      ? `이 이미지를 라이브러리에서 삭제할까요?\n사용 중인 노드/대표이미지 ${used}곳은 그대로 유지됩니다.`
      : "이 이미지를 라이브러리에서 삭제할까요?";
    if (!confirm(msg)) return;
    LIBRARY.splice(i, 1);
    saveMeta();
    renderLib();
    bToast("라이브러리에서 삭제됨");
  }

  /* ── Server save layer ───────────────────────────────────────── */
  function activeDoc() { return DOCS.find(d => d.id === activeId) || null; }
  function serializeActive() {
    const dc = activeDoc(); if (!dc) return null;
    dc.nodes = boardState.nodes.map(n => { const o = {}; for (const k in n) { if (k[0] !== "_") o[k] = n[k]; } return o; });
    dc.edges = boardState.edges.map(e => { const o = {}; for (const k in e) { if (k[0] !== "_") o[k] = e[k]; } return o; });
    dc.themeImgId = themeState.imgId; dc.title = themeState.title || dc.title;
    /* 실제 분석 시계열만 저장. 비전 비활성 동안엔 null로 정리(누수된 샘플 시계열 자동 제거). */
    dc.vision = visionLive()
      ? { series: _visionData.price, bias: dc.vision && dc.vision.bias || null, note: _visionNote, waves: _visionWaves,
          coords: _visionCoords, timeframe: _visionTF, futBars: _visionFut, jobId: (dc.vision && dc.vision.jobId) || null }
      : null;
    dc.view = { tx: view.tx, ty: view.ty, scale: view.scale };
    dc.logChart = _logChart;
    dc.updated = new Date().toISOString();
    // 서버엔 문서 레벨 임시(_) 필드를 저장하지 않는다(_mom·_momRank·_verdict·_px·_chg·_tfReg·_earnDate 등).
    // 저장 시 순위·판정 등 임시 분석상태가 새어 나가 새로고침 후 되살아나던 문제(상대강도 배지 잔존) 차단. 메모리의 dc는 그대로 유지.
    const out = {}; for (const k in dc) { if (k[0] !== "_") out[k] = dc[k]; }
    return out;
  }
  async function writeBackActive() {
    if (!canSave()) { guestNudge(); return; }   // 체험 모드: 서버 저장 없음(서버도 401로 이중 방어)
    const dc = serializeActive(); if (!dc) return;
    if (!SERVER_OK) return;
    setSaveState("saving");
    const r = await apiPost({ op: "upsert", document: dc });
    setSaveState(r && r.ok ? "saved" : "offline");
  }
  let _saveT = null;
  function markDirty() { if (!canSave()) { guestNudge(); return; } if (!SERVER_OK) return; clearTimeout(_saveT); _saveT = setTimeout(writeBackActive, 800); }
  async function saveMeta() { if (!canSave()) return; if (!SERVER_OK) return; _ensureGroups(); await apiPost({ op: "meta", meta: { library: LIBRARY, activeId, groups: META.groups, docGroups: META.docGroups } }); }
  function setDocLoading(on) {
    ["boardPane", "chartPane"].forEach(pid => {
      const pane = document.getElementById(pid); if (!pane) return;
      let ov = pane.querySelector(":scope > .pane-loading");
      if (on) {
        if (!ov) { ov = document.createElement("div"); ov.className = "pane-loading"; ov.innerHTML = '<div class="pl-spin"></div><span class="pl-txt">불러오는 중…</span>'; pane.appendChild(ov); }
        else pane.appendChild(ov);   // 렌더로 밀려도 최상단 유지
        ov.style.display = "flex"; void ov.offsetWidth; ov.classList.add("on");
      } else if (ov) { ov.classList.remove("on"); setTimeout(() => { if (ov && !ov.classList.contains("on")) ov.style.display = "none"; }, 220); }
    });
  }
  async function loadDoc(id) {
    clearTimeout(_saveT);
    const dc = DOCS.find(d => d.id === id); if (!dc) return;
    setDocLoading(true);
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 45)));   // 로딩 UI 페인트+최소 노출
    _stopPoll(); _setReqStat("", "");  // 기존 폴 즉시 정리
    activeId = id; META.activeId = id;
    boardState.nodes = dc.nodes || []; boardState.edges = [];   // 연결선 폐기(A안): 분석은 지표 조합(synthEdges 자동)이라 엣지 무의미 — 잔존 엣지 미로드
    if (typeof _ensureAllInd === "function") _ensureAllInd();   // 1차(종합)=전체 지표 항상 포함
    themeState.imgId = dc.themeImgId || null; themeState.title = dc.title || "";
    _logChart = !!dc.logChart; updateAxisBtns();
    const vz = dc.vision;
    if (vz && Array.isArray(vz.series) && vz.series.length >= 2) {
      _visionData = { price: vz.series, n: vz.series.length };
      _visionBias = vz.bias ? ForgeCore.visionBiasFrom(vz.bias) : 0;
      _visionNote = vz.note || ""; _visionWaves = vz.waves || []; _visionCoords = vz.coords || null;
      _visionTF = vz.timeframe || null; _visionFut = vz.futBars || 0;
    } else {
      _visionData = null; _visionBias = 0; _visionNote = ""; _visionWaves = []; _visionCoords = null; _visionTF = null; _visionFut = 0;
    }
    // 실 데이터(불러온 티커) 포지에선 저장된 이미지분석(vision)을 초기화 — 로드 시 stale 이미지가 떴다 사라지는 플래시 제거(이미지 분석 추후 고도화)
    if (boardState.nodes.some(n => n.blockType === "ticker" && n.params && (n.params.fetched || isFinite(n.params.price)))) {
      _visionData = null; _visionBias = 0; _visionNote = ""; _visionWaves = []; _visionCoords = null; _visionTF = null; _visionFut = 0; _heroView = "chart";
      const _hi = document.getElementById("fcHeroImg"); if (_hi) _hi.style.display = "none";   // 즉시 이미지 숨김(첫 렌더 전 플래시 방지)
    }
    if (dc.view) { view.tx = dc.view.tx; view.ty = dc.view.ty; view.scale = dc.view.scale; }
    sel = []; selEdge = null;
    _needFit = true;   // 종목/문서 전환 → 자동 프레이밍
    renderBoard(); renderTheme(); if (window.renderSidebar) renderSidebar();
    // fetched 티커 자동 재fetch(비차단) — 캔들은 문서에 없으므로 메모리 복원
    // fetched 플래그 또는 레거시(구버전이 저장한 params.price 보유) 티커를 자동 재fetch. 샘플(price=null)은 제외.
    const _tks = boardState.nodes.filter(n => n.blockType === "ticker" && n.params && n.params.symbol && (n.params.fetched || isFinite(n.params.price)));
    // 캔들 시계열이 아직 메모리에 없으면(서버 저장분엔 캔들 제외) 재fetch를 기다려야 한다.
    // 이때 runForge를 즉시 부르면 priceSeries()=null이라 '데이터 부족(최소 20봉)'이 잘못 뜬다 → 재fetch 완료 후 첫 분석으로 미룸.
    const _awaitFetch = _tks.length && !(typeof priceSeries === "function" && priceSeries());
    if (!_bootIdle) {
      _firstIdle = false;
      _engineDirty = true; _autoFresh = true;   // 선택 시 자동(경량) 예측 — '웹분석'은 심층(멀티TF·실적) 갱신
      if (!_awaitFetch) runForge();              // 시계열 이미 보유(샘플·붙여넣기·즉시복원) → 즉시 경량 분석
      if (window._dashDefer) window._dashDefer();
      if (typeof updateEngineBtn === "function") updateEngineBtn();
    }
    if (_bootIdle || !_tks.length) setDocLoading(false);   // 초기 진입(idle) 또는 티커 없음 → 자동 재fetch 생략, 로딩 즉시 종료
    else {
      const _ldSafe = setTimeout(() => setDocLoading(false), 6000);   // 안전장치(fetch 지연/실패 대비)
      let _anyLoaded = false;
      Promise.all(_tks.map(async n => {
        try {
          const rr = await fetchOHLC(n.params.symbol, (n.params.tf) || "1day");
          if (rr && rr.ok && Array.isArray(rr.candles) && rr.candles.length >= 2) {
            n._ohlc = rr.candles.map(d => ({ o: +(+d.o).toFixed(4), h: +(+d.h).toFixed(4), l: +(+d.l).toFixed(4), c: +(+d.c).toFixed(4) }));
            n._series = n._ohlc.map(d => d.c);
            n._times = rr.candles.map(d => d.t);                // 실제 날짜(시간축)
            n.params.price = n._series[n._series.length - 1];   // 스케일 앵커 갱신 → currentData 계수 1(캔들·선 정합)
            n.params.name = rr.name || n.params.name || "";     // 종목명 복원
            n.params.fetched = true;                            // 레거시 노드 마이그레이션
            if (typeof autoLogForTicker === "function") autoLogForTicker(n);   // 광범위 → 로그축 자동
            delete n.series; delete n.ohlc;                     // 구버전 비언더스코어 필드 제거(직렬화 잔존 방지)
            if (typeof resetChartWin === "function") resetChartWin();
            if (typeof resetYScale === "function") resetYScale();
            _anyLoaded = true;
            runForge();
          }
        } catch (e) { /* 오프라인/실패 무시 — 차트 없이 그레이스풀 */ }
      })).finally(() => {
        clearTimeout(_ldSafe); setDocLoading(false);   // 실 데이터 반영 후 로딩 종료
        // 재fetch로 아무 시계열도 못 얻었고 초기 runForge도 미뤘다면 → 지금 한 번 실행해 '데이터 부족/오프라인'을 정직히 표시
        if (_awaitFetch && !_anyLoaded && !_bootIdle && typeof runForge === "function") runForge();
      });
    }
    // 새 문서의 진행 중 잡 복원 (비전 분석 활성 시에만) — 실 티커 포지는 이미지분석 초기화이므로 잡 복원도 생략
    const _realTicker = boardState.nodes.some(n => n.blockType === "ticker" && n.params && (n.params.fetched || isFinite(n.params.price)));
    if (VISION_ENABLED && SERVER_OK && activeId && !_realTicker) {
      const jr = await apiGet("?jobs&docId=" + encodeURIComponent(activeId));
      const jobs = (jr && jr.jobs) || [];
      const live = jobs.filter(j => j.status === "pending" || j.status === "working").sort((a, b) => strCmp(b.created, a.created))[0];
      if (live) { _setReqStat(live.status === "working" ? "분석 중…" : "분석 대기 중…", live.status); _startPoll(live.id); }
      else {   // 폴링 중 아니어도 최신 완료 분석(잡 id 다르면)이 있으면 반영
        const done = jobs.filter(j => j.status === "done" && j.result && Array.isArray(j.result.series))
          .sort((a, b) => strCmp(b.finished || b.created, a.finished || a.created))[0];
        const dv = dc.vision;
        if (done && done.id !== (dv && dv.jobId)) applyVision(done.result, done.id);
      }
    }
  }
  async function loadImages() { const m = await apiGet("?images=1"); if (m && typeof m === "object") Object.assign(IMAGES, m); }
  let _bootIdle = false;
  async function boot() {
    _bootIdle = true;   // 초기 진입: 자동 분석/재fetch 억제(종목 선택 전 idle 화면 — 로딩 없음)
    await fetchAuth();   // 인증 상태 선확인 — 게스트면 서버 GET이 null → 아래 샘플 시드 = 체험 모드
    if (typeof updateAuthUI === "function") updateAuthUI();
    const doc = await apiGet("");
    await loadImages();
    if (doc && doc.documents && doc.documents.length) {
      DOCS = doc.documents; META = doc.meta || { library: [], activeId: null };
      LIBRARY.length = 0; (META.library || []).forEach(it => LIBRARY.push(it));
      await loadDoc(META.activeId && DOCS.some(d => d.id === META.activeId) ? META.activeId : DOCS[0].id);
    } else {
      // 첫 부팅/빈 데이터 → BTC/USD 샘플 포지 시드
      buildSampleForge();
      autoLayout("v");
      const dc = { id: uid("doc"), title: "BTC/USD 분석 (샘플)", themeImgId: themeState.imgId || null,
        nodes: boardState.nodes, edges: boardState.edges,
        vision: _visionData ? { series: _visionData.price, bias: ForgeCore.sampleGraph().vision.bias, note: _visionNote, waves: _visionWaves } : null,
        view: { tx: view.tx, ty: view.ty, scale: view.scale }, updated: new Date().toISOString() };
      DOCS = [dc]; activeId = dc.id; META = { library: [], activeId: dc.id };
      if (window.renderSidebar) renderSidebar(); if (!_bootIdle) runForge();
      if (SERVER_OK) writeBackActive();
    }
    _bootIdle = false;   // 부팅 완료 → 이후 종목 전환·불러오기는 정상 분석
    // 첫 진입은 티커 미선택 idle — 워치리스트에서 종목을 클릭해야 로드(자동 선택/분석·하이라이트 없음)
    _firstIdle = true;
    if (window.renderSidebar) renderSidebar();   // 하이라이트 없이 재렌더
    if (typeof _showIdle === "function") _showIdle();
    // poll restore는 loadDoc이 처리 (boot else 분기는 신규 문서 → 잡 없음)
    setSaveState(SERVER_OK ? "saved" : "offline");
  }

  /* ── 사이드바 + 문서 CRUD (Task 3) ─────────────────────────────── */
  let _toolsOpen = !(typeof window !== "undefined" && window.innerWidth <= 860);   // 모바일 기본 접힘
  function toggleTools() { _toolsOpen = !_toolsOpen; renderSidebar(); }
  function _selType() { if (sel.length !== 1) return null; const n = boardState.nodes.find(x => x.id === sel[0]); return n ? n.blockType : null; }
  function _hasBlock(type) { return boardState.nodes.some(n => n.blockType === type); }
  function _indTypes() { return BLOCK_DEFS.filter(d => d.kind === "block" && EV_COLORS[d.type]).map(d => d.type); }   // 토글 가능한 지표 타입
  function _allIndAdded() { const t = _indTypes(); return t.length > 0 && t.every(x => _hasBlock(x)); }
  function toggleAllBlocks() {
    const types = _indTypes();
    if (_allIndAdded()) {   // 전체 해제: 지표 노드 모두 제거
      const ids = boardState.nodes.filter(n => types.includes(n.blockType)).map(n => n.id);
      if (ids.length) delNodes(ids);
      bToast("지표 전체 해제");
    } else {   // 전체 적용: 없는 지표 모두 추가
      let added = 0;
      types.forEach(t => { if (!_hasBlock(t)) { const d = BLOCK_DEFS.find(b => b.type === t) || {}; boardState.nodes.push({ id: uid("n"), x: 0, y: 0, title: d.label || t, kind: "block", blockType: t, params: d.params ? { ...d.params } : {} }); added++; } });
      if (added) { layoutBlocks(); renderBoard(); fireBoardChange(); }
      bToast("지표 전체 적용 (+" + added + ")");
    }
    if (window.renderSidebar) renderSidebar();
  }
  // 포지(문서)의 등록 티커 → 자산유형 분류 + 플랫 아이콘(포지 목록 앞)
  function _docTicker(d) { const t = ((d && d.nodes) || []).find(n => n.blockType === "ticker"); return (t && t.params && t.params.symbol) || ""; }
  function _assetType(sym) {
    sym = (sym || "").toUpperCase().trim(); if (!sym) return "";
    if (/-USDT?$|-USD$/.test(sym) || /^(BTC|ETH|SOL|XRP|DOGE|ADA|BNB|USDT|LTC|DOT|AVAX|TRX|LINK)\b/.test(sym)) return "cr";
    if (/\.T$|\.JP$/.test(sym)) return "jp";
    if (/\.SS$|\.SZ$|\.HK$|\.CN$/.test(sym)) return "cn";
    if (/^\d{6}$/.test(sym)) return "kr";
    return "us";
  }
  const _RGN_LBL = { us: "US", kr: "KR", jp: "JP", cn: "CN", cr: "CR" };
  function _assetHtml(d, cls) { const t = _assetType(_docTicker(d)); return t ? `<span class="rgn rgn-${t}">${_RGN_LBL[t] || ""}</span>` : ""; }
  function _initDocDrag() {
    const el = document.getElementById("forgeSide"); if (!el || el._dragInit) return; el._dragInit = true;
    let dragId = null;
    const clearHi = () => el.querySelectorAll(".doc-row.drop-before,.doc-row.drop-after,.wg-over").forEach(r => r.classList.remove("drop-before", "drop-after", "wg-over"));
    el.addEventListener("dragstart", e => { const row = e.target.closest && e.target.closest(".doc-row"); if (!row) return; dragId = row.dataset.doc; try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); } catch (_) {} row.classList.add("dragging"); });
    el.addEventListener("dragend", e => { const row = e.target.closest && e.target.closest(".doc-row"); if (row) row.classList.remove("dragging"); clearHi(); dragId = null; });
    el.addEventListener("dragover", e => {
      if (!dragId) return;
      const row = e.target.closest && e.target.closest(".doc-row");
      const zone = e.target.closest && e.target.closest("[data-wgdrop]");
      if (!row && !zone) return;
      e.preventDefault(); clearHi();
      if (row && row.dataset.doc !== dragId) { const rc = row.getBoundingClientRect(), after = (e.clientY - rc.top) > rc.height / 2; row.classList.add(after ? "drop-after" : "drop-before"); }
      else if (zone) zone.classList.add("wg-over");
    });
    el.addEventListener("drop", e => {
      if (!dragId) { clearHi(); return; }
      e.preventDefault(); _ensureGroups();
      const row = e.target.closest && e.target.closest(".doc-row");
      const zone = e.target.closest && e.target.closest("[data-wgdrop]");
      const curG = _grpOf(dragId);
      if (row && row.dataset.doc !== dragId) {   // 다른 종목 위 = 재정렬 + 대상의 그룹 상속
        const tG = _grpOf(row.dataset.doc);
        if ((tG || null) !== (curG || null)) { if (tG) META.docGroups[dragId] = tG; else delete META.docGroups[dragId]; if (SERVER_OK) saveMeta(); }
        const rc = row.getBoundingClientRect(), after = (e.clientY - rc.top) > rc.height / 2;
        reorderDocs(dragId, row.dataset.doc, after);
      } else if (zone) {   // 그룹 헤더/영역 = 그 그룹(또는 미분류)으로 이동
        const gid = zone.dataset.wgdrop || null;
        if ((gid || null) !== (curG || null)) _moveDocToGroup(dragId, gid);
        else { clearHi(); renderSidebar(); }
      } else clearHi();
    });
  }
  function reorderDocs(dragId, targetId, after) {
    if (dragId === targetId) return;
    const from = DOCS.findIndex(d => d.id === dragId); if (from < 0) return;
    const [moved] = DOCS.splice(from, 1);
    let to = DOCS.findIndex(d => d.id === targetId);
    if (to < 0) { DOCS.splice(from, 0, moved); return; }
    if (after) to += 1;
    DOCS.splice(to, 0, moved);
    if (SERVER_OK) apiPost({ op: "reorder", order: DOCS.map(d => d.id) });
    renderSidebar();
    if (typeof bToast === "function") bToast("순서 변경됨");
  }
  // 통합 지표 레일(가운데·차트 사이) — 체크=표시+2차 포함. 1차(종합)는 항상 전체.
  function _ensureAllInd() {
    const types = _indTypes(); let added = 0;
    types.forEach(t => { if (!_hasBlock(t)) { const d = BLOCK_DEFS.find(b => b.type === t) || {}; boardState.nodes.push({ id: uid("n"), x: 0, y: 0, title: d.label || t, kind: "block", blockType: t, params: d.params ? { ...d.params } : {} }); added++; } });
    if (added && typeof layoutBlocks === "function") layoutBlocks();
    return added;
  }
  function _allVisible() { const t = _indTypes(); return t.length > 0 && t.every(x => _evVisible.has(x)); }
  function _railAll() { const t = _indTypes(); if (_allVisible()) { t.forEach(x => { if (x !== "trend") _evVisible.delete(x); }); } else { t.forEach(x => _evVisible.add(x)); } _focusInd = null; drawEvidence(); renderIndRail(); }
