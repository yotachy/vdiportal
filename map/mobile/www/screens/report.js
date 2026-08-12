// Basic 리포트 화면. 판정(방향·확신·정직한 범위·빠진 것의 크기) + 4단 적층 차트 +
// Counted(5지표 판독값)/Not counted(27개 칩) + 주기 행(일간만 값, 주간·월간 잠김) + 비활성 CTA.
// 차트 합성은 라벨초기화→축→콘(꿈틀·끝점 장식)→캔들→오버레이/배지→서브패널 순(z-order 그대로),
// 크로스헤어는 350ms 홀드 게이트.
(function () {
  "use strict";

  var TF = "1day";
  var PAD = 10;
  // 차트 높이는 모드에 딸린다 — 커버 520(Phase 1~4 검증값)은 그대로, 펼침은 세로 654 라 414 로 줄인다.
  // 520 을 그대로 두면 654 화면에서 차트만으로 80% 를 먹는다.
  function chartH() { return MSLayout.chartHeight(document.body.classList.contains("ms-dual"), window.innerHeight); }
  // TAIL_BARS 는 이제 줌 레벨이다. 기본은 화면폭 무관 60봉(예측 비중 28% 유지, Phase 3 결론) — MSZoom.DEFAULT_TAIL.
  var HOLD_MS = 350, MOVE_THRESH = 8;
  var TIER = "basic";   // Phase 1 은 Basic 고정 — 이후 단계에서 사용자 티어로 교체(차트·범례 모두 이 값만 바뀌면 됨)

  var LINE_LEGEND = [
    { key: "p1", label: MSStr.t.lgP1 },
    { key: "p2", label: MSStr.t.lgP2 },
    { key: "p3", label: MSStr.t.lgP3 }
  ];

  var cache = new Map();          // sym -> data(candle/price/asOf/name/source), 모듈 스코프(세션 한정)
  var NOT_COUNTED_LABELS = null;  // 지연 계산 — basicGraph/full32Graph 구성에만 의존, 종목 데이터 무관
  var activeResizeCleanup = null; // 현재 붙어있는 resize 리스너 해제 함수(모듈 스코프, 화면당 리스너 최대 1개 보장)

  // ── 색 토큰(캔버스는 var() 를 못 읽으므로 style.css 를 단일 원본으로 런타임에 읽어온다) ──
  function readToken(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      v = (v || "").trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  function hexToRgba(hex, a) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return "rgba(232,180,99," + a + ")";
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function colTokens() {
    var gold = readToken("--gold", "#e8b463");
    return {
      bull: readToken("--bull", "#4fb98a"),
      bear: readToken("--bear", "#d96a6a"),
      gold: gold,
      cone: hexToRgba(gold, 0.09),                       // 콘 채움 9% 골드(design §4.3)
      hairline: readToken("--hairline", "rgba(238,241,247,.06)"),
      ink4: readToken("--ink-4", "#7c8598"),
      ink5: readToken("--ink-5", "#78819a"),
      pred2: readToken("--pred2", "#b892f5")
    };
  }

  // api.js 가 봉 부족을 알릴 때 rpBarsShort 로 시작하는 영문 메시지를 던진다(api.js:28) — 그 접두를
  // MSStr 단일 출처에서 그대로 재사용해 여기·표시 문구가 따로 놀지 않게 한다.
  function isBarsShort(err) { return !!(err && typeof err.message === "string" && err.message.indexOf(MSStr.t.rpBarsShort) === 0); }
  function loadOne(sym) { return MSApi.loadTicker(sym, TF); }
  function dirWord(regime) { return regime === "bull" ? MSStr.t.rpUp : regime === "bear" ? MSStr.t.rpDown : MSStr.t.rpFlat; }

  function paramOf(graph, blockType, defaults) {
    var n = null, i;
    for (i = 0; i < graph.nodes.length; i++) { if (graph.nodes[i].blockType === blockType) { n = graph.nodes[i]; break; } }
    var p = (n && n.params) || {}, out = {}, k;
    for (k in defaults) { if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = (p[k] != null ? p[k] : defaults[k]); }
    return out;
  }

  // 지표 표시명은 MSStr 단일 출처. forge-core 의 한글 title 로 폴백하면 칩 일부가 한글로 샌다.
  function chipLabel(full, bt) { return MSStr.ind(bt); }

  function computeNotCounted() {
    var full = MSGraph.full32Graph(ForgeCore);
    var basicSet = {};
    MSGraph.BASIC.forEach(function (t) { basicSet[t] = true; });
    return MSGraph.indicatorTypes(full)
      .filter(function (t) { return !basicSet[t]; })
      .map(function (t) { return chipLabel(full, t); });
  }
  function notCountedLabels() {
    if (!NOT_COUNTED_LABELS) NOT_COUNTED_LABELS = computeNotCounted();
    return NOT_COUNTED_LABELS;
  }

  // Basic 5지표 판정(verdict/prediction) + 작도용 원시 지표 결과.
  // run() 내부 evalBlocks 는 노드값을 단순 시계열로만 남기므로(완전한 지표 객체가 아님),
  // 작도에 쓸 형태는 그래프와 동일한 파라미터로 analyzeX 를 직접 다시 호출해 얻는다.
  function analyzeFull(data) {
    var graph = MSGraph.basicGraph(ForgeCore);
    var vol = data.candle.map(function (c) { return c.v; });
    var okVol = vol.length >= 2 && vol.every(function (v) { return typeof v === "number" && isFinite(v); });
    MSGraph.setVolume(graph, okVol ? vol : null);
    var d = { price: data.price, candle: data.candle };
    if (okVol) d.volume = vol;
    var out = ForgeCore.run(graph, d, { timeframe: TF });

    var maP = paramOf(graph, "ma", { len: 20, ema: false });
    var rsiP = paramOf(graph, "rsi", { period: 14 });
    var bbP = paramOf(graph, "bollinger", { len: 20, k: 2 });
    var mcP = paramOf(graph, "macd", { fast: 12, slow: 26, signal: 9 });

    var ma = ForgeCore.analyzeMA(data.price, { len: maP.len, ema: !!maP.ema });
    var rsi = ForgeCore.analyzeRSI(data.price, { period: rsiP.period });
    var bb = ForgeCore.analyzeBollinger(data.price, { len: bbP.len, k: bbP.k });
    var macd = ForgeCore.analyzeMACD(data.price, { fast: mcP.fast, slow: mcP.slow, signal: mcP.signal });
    var va = ForgeCore.analyzeVolume(data.price, okVol ? vol : null, {});

    return { out: out, ma: ma, rsi: rsi, bb: bb, macd: macd, va: va, maP: maP, rsiP: rsiP, bbP: bbP, mcP: mcP };
  }

  // ── 차트 합성 + 크로스헤어. wrap 은 이미 라이브 DOM 에 붙어 있어야 한다(clientWidth 측정 위해) ──
  function paintChart(cv, wrap, legend, an, data, sym) {
    var ctx = cv.getContext("2d");
    var col = colTokens();
    var cssW = wrap.clientWidth || 320;
    var lay = null;
    var chartHpx = chartH();          // relayout 마다 다시 읽는다 — 회전·폴드 전환을 따라간다
    var tail = MSZoom.DEFAULT_TAIL;   // 화면 유지 중에만 산다. 종목을 바꾸면 paintChart 가 다시 불려 기본값으로 돌아간다.

    function relayout() {
      var dpr = window.devicePixelRatio || 1;
      chartHpx = chartH();
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(chartHpx * dpr);
      cv.style.height = chartHpx + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // DPR 트랜스폼 — 리사이즈 시점에만 설정
      // 한계가 plotW 에 딸려 있다 — 폴드를 펴면 커버에서 쓰던 봉 수가 새 하한 밖일 수 있다.
      // (커버 20봉 → 펼침 하한 44봉). 폴드는 두 화면을 상시로 오가므로 예외가 아니라 일상 경로다.
      var fut = (an.out.prediction && an.out.prediction.path) ? an.out.prediction.path.length : 0;
      tail = MSZoom.clamp(MSChartLayout.plotWidth(cssW, PAD), fut, tail);
      lay = MSChartLayout.chartLayout({
        candle: data.candle, prediction: an.out.prediction,
        width: cssW, height: chartHpx, pad: PAD, tailBars: tail
      });
    }
    relayout();

    var dataOf = { volume: an.va, rsi: an.rsi, macd: an.macd };

    // 레전드는 캔버스가 아니라 DOM 이다 — 폰에서 더 선명하고, 겹침 회피 계산이 통째로 필요 없다.
    function paintLegend(fi) {
      var rows = MSLegend.rows(an, an.out.prediction, fi);
      legend.textContent = "";
      rows.forEach(function (r) {
        var chip = MSUi.el("div", "rp-lg-chip rp-lg-" + r.tone);
        chip.appendChild(MSUi.el("span", "rp-lg-k", r.label));
        chip.appendChild(MSUi.el("span", "rp-lg-v", r.value));
        legend.appendChild(chip);
      });
    }

    function frame(hoverFi) {
      ctx.clearRect(0, 0, cssW, chartHpx);
      MSLayers.resetLabels(cssW, chartHpx);             // 매 프레임 맨 앞 — 이 뒤에 등록되는 라벨만 서로를 본다.
                                                        // drawCone 뒤로 밀면 끝점 라벨 예약이 즉시 지워져 배지와 겹친다.
      MSChartDraw.drawAxes(ctx, lay, data.candle, col);
      // 캔들이 먼저, 예측이 나중. 끝점 배지가 seam 왼쪽까지 나오므로 순서를 뒤집으면
      // 캔들이 배지를 덮는다(PC 도 캔들 → 예측 순서다. forge-draw.js:~1081, 1115-1200).
      MSChartDraw.drawCandles(ctx, lay, data.candle, col);
      MSChartDraw.drawCone(ctx, lay, an.out.prediction, col, TIER, { sym: sym, tf: TF });
      var Mp = Object.assign({}, lay.panels.price.M, { badges: false });
      MSLayers.bollinger(ctx, an.bb, Mp);
      MSLayers.ma(ctx, an.ma, Mp);
      MSLayers.rsiBadge(ctx, an.rsi, Mp);
      MSLayers.volumeBadge(ctx, an.va, Mp);
      // macdBadge 는 부르지 않는다 — _drawMacdLayers 는 배지뿐이라 남길 것이 없다.
      ["volume", "rsi", "macd"].forEach(function (k) {
        var r = lay.panels[k].rect;
        ctx.save(); ctx.translate(r.x, r.y);
        MSPanels[k](ctx, r.w, r.h, dataOf[k], Infinity);
        ctx.restore();
      });
      if (hoverFi != null) MSChartDraw.drawCrosshair(ctx, lay, hoverFi, data.candle, col);
      paintLegend(hoverFi);   // 크로스헤어를 끌면 그 봉 값으로, 놓으면 frame(null) 이 최신 봉으로 되돌린다
    }
    frame(null);

    // ── 크로스헤어: 350ms 홀드로 진입. 홀드 전엔 preventDefault 를 부르지 않는다 —
    // 그 전에 8px 넘게 움직이면 타이머를 취소하고 스크롤로 넘긴다(스크롤 충돌 구조적 차단). ──
    var holdTimer = null, holding = false, startPt = null, raf = null;
    function fiFromEvent(e) {
      var rect = cv.getBoundingClientRect();
      return MSChartDraw.fiAtX(lay, e.clientX - rect.left);
    }
    function scheduleFrame(fi) {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = null; frame(fi); });
    }
    function endHold(e) {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (holding) {
        holding = false;
        try { cv.releasePointerCapture(e.pointerId); } catch (e2) { /* 이미 해제됨 */ }
        frame(null);
      }
      startPt = null;
    }
    cv.addEventListener("pointerdown", function (e) {
      startPt = { x: e.clientX, y: e.clientY };
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        holdTimer = null; holding = true;
        try { cv.setPointerCapture(e.pointerId); } catch (e2) { /* 캡처 실패 시에도 계속 진행 */ }
        scheduleFrame(fiFromEvent(e));
      }, HOLD_MS);
    });
    cv.addEventListener("pointermove", function (e) {
      if (!holding) {
        if (startPt && holdTimer) {
          var dx = e.clientX - startPt.x, dy = e.clientY - startPt.y;
          if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESH) { clearTimeout(holdTimer); holdTimer = null; startPt = null; }
        }
        return;   // 스크롤로 통과 — preventDefault 호출 없음
      }
      e.preventDefault();
      scheduleFrame(fiFromEvent(e));
    });
    cv.addEventListener("pointerup", endHold);
    cv.addEventListener("pointercancel", endHold);

    // ── 두 손가락 핀치 = 줌. 한 손가락은 지금 그대로(페이지 스크롤 + 350ms 홀드 크로스헤어) ──
    // 창이 오른쪽 끝 고정이라 핀치 중심 아래 봉을 붙잡는 계산(PC 의 rel·bi)이 필요 없다.
    var pinch = null, zoomRaf = null;
    function zoomFrame() {
      if (zoomRaf) return;
      zoomRaf = requestAnimationFrame(function () { zoomRaf = null; relayout(); frame(null); });
    }
    function touchDist(e) {
      var a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    cv.addEventListener("touchstart", function (e) {
      if (!e.touches || e.touches.length !== 2) return;
      // 두 번째 손가락이 닿는 순간 홀드를 취소한다 — 안 그러면 핀치 도중 크로스헤어가 켜진다.
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      startPt = null;
      if (holding) { holding = false; frame(null); }
      pinch = { d0: Math.max(1, touchDist(e)), t0: tail };
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    cv.addEventListener("touchmove", function (e) {
      if (!pinch || !e.touches || e.touches.length !== 2) return;
      var fut = (an.out.prediction && an.out.prediction.path) ? an.out.prediction.path.length : 0;
      var next = MSZoom.clamp(MSChartLayout.plotWidth(cssW, PAD), fut,
                              MSZoom.fromPinch(pinch.t0, pinch.d0, Math.max(1, touchDist(e))));
      if (next !== tail) { tail = next; zoomFrame(); }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    function endPinch(e) { if (!e.touches || e.touches.length < 2) pinch = null; }
    cv.addEventListener("touchend", endPinch);
    cv.addEventListener("touchcancel", endPinch);

    // 회전 대응. 리스너는 화면당(모듈 전체 기준) 최대 1개만 살아있어야 한다 —
    // draw()가 재실행되거나(재시도/재방문) 다른 종목으로 넘어갈 때마다 이전 리스너를 먼저 떼어낸다.
    // window resize는 next resize event가 와야 감지되므로, 그때까지 기다리지 않고 여기서 즉시 정리한다.
    if (activeResizeCleanup) { activeResizeCleanup(); activeResizeCleanup = null; }
    function onResize() {
      var w2 = wrap.clientWidth || cssW, h2 = chartH();
      if (w2 === cssW && h2 === chartHpx) return;
      cssW = w2;
      relayout();   // 재클램프는 relayout() 안에서 이미 일어난다 — 폴드 회전(커버 20봉 → 펼침 하한 44봉)에도 별도 처리 불필요
      frame(null);
    }
    window.addEventListener("resize", onResize);
    activeResizeCleanup = function () { window.removeEventListener("resize", onResize); };
  }

  function backSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';
  }
  function lockSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="vertical-align:-1.5px;margin-right:4px"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  }

  function render(root, params) {
    var sym = String((params && params.sym) || "").trim().toUpperCase();
    var wl = MSStore.getWatchlist();
    var idx = -1, i;
    for (i = 0; i < wl.length; i++) { if (wl[i].sym === sym) { idx = i; break; } }
    var wlItem = idx >= 0 ? wl[idx] : null;

    var state = "loading", errInfo = null, data = null, an = null, chartRefs = null;

    // paintChart() 진입부의 정리와는 별도로 여기서도 한 번 정리한다 — 종목을 바꿔 render()가
    // 다시 불렸는데 새 렌더가 loading/error 로 끝나면(캐시 미스 로딩 중 이탈, 분석 실패 등)
    // paintChart() 자체가 안 불려 그 정리가 도달하지 못한다. 그 사이 분리된 캔버스의 onResize 가
    // 죽은 DOM·캔들 배열을 계속 붙잡는다(리스너는 최대 1개라 누수는 아니고 보유 문제). 두 정리는
    // 서로 대체가 아니라 보완: 여기는 "화면 전환", paintChart() 안쪽은 "같은 화면 안 재시도"를 커버한다.
    if (activeResizeCleanup) { activeResizeCleanup(); activeResizeCleanup = null; }

    function startLoad() {
      state = "loading"; errInfo = null;
      draw();
      if (cache.has(sym)) { data = cache.get(sym); finishData(); return; }
      loadOne(sym).then(function (d) {
        cache.set(sym, d);
        data = d;
        finishData();
      }).catch(function (err) {
        state = "error";
        errInfo = { message: (err && err.message) || MSStr.t.rpUnknownErr, retry: !isBarsShort(err) };
        draw();
      });
    }
    function finishData() {
      try {
        an = analyzeFull(data);
        state = "ready";
      } catch (e) {
        state = "error";
        errInfo = { message: MSStr.t.rpAnalyzeErr + ((e && e.message) || e), retry: true };
      }
      draw();
    }
    function retry() { if (data) finishData(); else startLoad(); }

    function buildHead() {
      var head = MSUi.el("div", "rp-head");
      var back = MSUi.el("button", "rp-back");
      back.setAttribute("aria-label", MSStr.t.rpBack);
      back.innerHTML = backSvg();
      back.addEventListener("click", function () { MSApp.go("watchlist"); });
      head.appendChild(back);

      var idWrap = MSUi.el("div", "rp-head-id");
      idWrap.appendChild(MSUi.el("div", "rp-head-sym", sym));
      idWrap.appendChild(MSUi.el("div", "rp-head-name", (wlItem && wlItem.name) || ""));
      head.appendChild(idWrap);

      if (idx >= 0) head.appendChild(MSUi.el("div", "rp-head-pos", (idx + 1) + " / " + wl.length));
      head.appendChild(MSWalletScreen.pill(function () { MSApp.go("wallet"); }));
      return head;
    }

    function buildTierRow() {
      var row = MSUi.el("div", "rp-tier-row");
      row.appendChild(MSUi.el("span", "rp-tier", MSStr.t.rpTierBasic));
      row.appendChild(MSUi.el("span", "rp-tier-desc", MSStr.t.rpTierCount));
      var evi = MSUi.el("span", "rp-evi");
      for (var k = 0; k < 3; k++) evi.appendChild(MSUi.el("span", "rp-evi-seg" + (k === 0 ? " on" : "")));
      row.appendChild(evi);
      return row;
    }

    function skeletonBlock(h) {
      var d = MSUi.el("div", "rp-sk");
      d.style.height = h + "px";
      d.style.marginBottom = "24px";
      return d;
    }

    function errorBlock(info) {
      var wrap = MSUi.el("div", "rp-err");
      wrap.appendChild(MSUi.el("div", "rp-err-title", MSStr.t.rpLoadFail));
      wrap.appendChild(MSUi.el("div", null, info.message));
      if (info.retry) {
        var b = MSUi.el("button", "btn btn-ghost", MSStr.t.rpRetry);
        b.style.marginTop = "14px";
        b.addEventListener("click", retry);
        wrap.appendChild(b);
      }
      return wrap;
    }

    // 시안 6a·2a 순서: 판정(방향+확신%) → 적중/오답 → 일치도 → 범위 → 안 센 것.
    // 중립이면 확신과 적중/오답을 함께 감춘다 — 부른 방향이 없으면 둘 다 가리킬 대상이 없다.
    function verdictWord(regime) {
      return regime === "bull" ? MSStr.t.rpBullish : regime === "bear" ? MSStr.t.rpBearish : MSStr.t.rpFlat;
    }
    function buildVerdict() {
      var v = an.out.verdict, pr = an.out.prediction;
      var wrap = MSUi.el("div", "rp-verdict-wrap");
      var dirCls = v.regime === "bull" ? "bull" : v.regime === "bear" ? "bear" : "neutral";

      var conf = MSReportModel.confidence(ForgeCore, pr, v.regime);
      var head = MSUi.el("div", "rp-verdict " + dirCls);
      head.appendChild(MSUi.el("span", null, verdictWord(v.regime)));
      if (conf != null) head.appendChild(MSUi.el("span", "rp-conf-pct", conf + "%"));
      wrap.appendChild(head);

      var hit = (conf != null) ? MSReportModel.hitRate(window.MSBacktest, v.regime) : null;
      if (hit) {
        wrap.appendChild(MSUi.el("div", "rp-hit", hit.right + MSStr.t.rpHitRight + hit.wrong + MSStr.t.rpHitWrong));
        // 오답률(hit.wrong)이 방향별로 갈리므로(불 61.5/38.5 · 베어 42.6/57.4) 문장 속 숫자도
        // 그 방향의 실측을 반영해야 한다 — "Four calls in ten" 처럼 고정 문구를 쓰면 베어 판정에서
        // 거짓말이 된다(오답률 57.4%인데 41.9%라고 말하게 됨, 최종수정웨이브 §③).
        wrap.appendChild(MSUi.el("div", "rp-hit-note",
          Math.round(hit.wrong / 10) + MSStr.t.rpHitNoteA + conf + MSStr.t.rpHitNoteB));
      }

      var total = v.confluence.total, agree = v.confluence.agree;
      var confText = total ? (agree + MSStr.t.rpAgree + total + MSStr.t.rpAgreeTail) : MSStr.t.rpAgreeNone;
      wrap.appendChild(MSUi.el("div", "rp-conf", confText));

      var last = pr.lo.length - 1;
      var rangeText = (last >= 0)
        ? (MSStr.t.rpRangeLabel + MSUi.fmtPrice(pr.lo[last]) + " – " + MSUi.fmtPrice(pr.hi[last]) + MSStr.t.rpCone)
        : MSStr.t.rpRangeNone;
      wrap.appendChild(MSUi.el("div", "rp-range", rangeText));

      wrap.appendChild(MSUi.el("div", "rp-missing",
        MSStr.t.rpNotCountedLead + notCountedLabels().length + MSStr.t.rpNotCountedTail));
      return wrap;
    }

    // 시안 2a 의 지평 표 — 차트 앞에 온다(숫자 먼저, 그림 나중).
    function hzLabel(key) {
      return key === "d1" ? MSStr.t.rpHzTomorrow : key === "w1" ? MSStr.t.rpHzWeek : MSStr.t.rpHzMonth;
    }
    function buildHorizons() {
      var rows = MSReportModel.horizonRows(ForgeCore, an.out.prediction, an.out.verdict.regime);
      if (!rows.length) return null;
      var sec = MSUi.el("div", "rp-hz");
      rows.forEach(function (r) {
        var row = MSUi.el("div", "rp-hz-row");
        row.appendChild(MSUi.el("span", "rp-hz-when", hzLabel(r.key)));
        row.appendChild(MSUi.el("span", "rp-hz-px", MSUi.fmtPrice(r.price)));
        // 색은 r.dir 로만 정한다 — report-model.js 의 FLAT_EPS 데드존과 확률 뒤집기가 같은
        // 임계를 쓰도록 여기서 리터럴 ±0.05 를 다시 판정하지 않는다(최종수정웨이브 §⑥).
        var cls = r.dir === "up" ? " up" : r.dir === "down" ? " dn" : "";
        row.appendChild(MSUi.el("span", "rp-hz-chg" + cls, MSUi.fmtChg(r.chgPct)));
        row.appendChild(MSUi.el("span", "rp-hz-prob", r.prob == null ? "" : r.prob + "%"));
        sec.appendChild(row);
      });
      return sec;
    }

    function buildChartSection() {
      var wrap = MSUi.el("div", "rp-chart");
      // 지표 값 레전드 — 캔버스 앞(차트 위 고정 행). 클래스명은 rp-legend 가 아니라 rp-ind-legend:
      // buildChartLegend() 의 예측선 색상 범례(p1/p2/p3)가 이미 .rp-legend 를 쓰고 있어
      // 같은 이름을 쓰면 그쪽 스타일(gap 16px·margin-bottom 24px)과 이 레전드의 스타일이 섞인다.
      var legend = MSUi.el("div", "rp-ind-legend");
      wrap.appendChild(legend);
      var cv = document.createElement("canvas");
      wrap.appendChild(cv);
      chartRefs = { wrap: wrap, cv: cv, legend: legend };
      return wrap;
    }

    // 예측선 3종 범례 — 잠긴 선도 숨기지 않고 보여준다("빠진 것을 보여주는 것"이 핵심,
    // Not counted 칩과 같은 취지). 활성 선만 실제 색, 잠긴 선은 --ink-5 로 죽인다.
    function legendColorVar(key) {
      return key === "p1" ? "--gold" : key === "p2" ? "--pred2" : "--bear";
    }
    function buildChartLegend() {
      var allowed = MSChartDraw.linesFor(TIER);
      var wrap = MSUi.el("div", "rp-legend");
      LINE_LEGEND.forEach(function (item) {
        var locked = allowed.indexOf(item.key) < 0;
        var row = MSUi.el("span", "rp-legend-item" + (locked ? " rp-legend-locked" : ""));
        var line = MSUi.el("span", "rp-legend-line" + (item.key === "p1" ? "" : " rp-legend-dashed"));
        if (!locked) line.style.borderColor = "var(" + legendColorVar(item.key) + ")";
        row.appendChild(line);
        row.appendChild(document.createTextNode(item.label + (locked ? MSStr.t.rpLockedSuffix : "")));
        wrap.appendChild(row);
      });
      return wrap;
    }

    function buildCounted() {
      var sec = MSUi.el("div", "rp-sec");
      var title = MSUi.el("div", "rp-sec-title");
      title.appendChild(document.createTextNode(MSStr.t.rpCounted + " "));
      title.appendChild(MSUi.el("span", "rp-sec-count", "5"));
      sec.appendChild(title);

      var maLine = ForgeCore.maSteps(an.ma, an.maP.len)[1];
      var rsiLine = ForgeCore.rsiSteps(an.rsi)[0];
      var bbLine = ForgeCore.bollingerSteps(an.bb, an.bbP.len, an.bbP.k)[1];
      var macdLine = ForgeCore.macdSteps(an.macd, an.mcP.fast, an.mcP.slow, an.mcP.signal)[1];
      var volLine = ForgeCore.volumeSteps(an.va)[0];

      // 지표 표시명은 MSStr.ind() 단일 출처 — chipLabel 과 동일 규칙(하드코딩 라벨 금지).
      [[MSStr.ind("ma"), maLine], [MSStr.ind("macd"), macdLine], [MSStr.ind("rsi"), rsiLine], [MSStr.ind("bollinger"), bbLine], [MSStr.ind("volume"), volLine]]
        .forEach(function (pair) {
          var row = MSUi.el("div", "rp-count-row");
          row.appendChild(MSUi.el("span", "rp-count-name", pair[0]));
          row.appendChild(MSUi.el("span", "rp-count-read", pair[1]));
          sec.appendChild(row);
        });
      return sec;
    }

    function buildNotCountedSection() {
      var labels = notCountedLabels();
      var sec = MSUi.el("div", "rp-sec");
      var title = MSUi.el("div", "rp-sec-title");
      title.appendChild(document.createTextNode(MSStr.t.rpNotCounted + " "));
      title.appendChild(MSUi.el("span", "rp-sec-count", String(labels.length)));
      sec.appendChild(title);
      var chips = MSUi.el("div", "rp-chips");
      labels.forEach(function (label) { chips.appendChild(MSUi.el("span", "rp-chip", label)); });
      sec.appendChild(chips);
      return sec;
    }

    function tfRow(name, val, locked, skeleton) {
      var row = MSUi.el("div", "rp-tf-row" + (locked ? " rp-locked" : ""));
      row.appendChild(MSUi.el("span", "rp-tf-name", name));
      if (locked) {
        var lock = MSUi.el("span", "rp-lock");
        lock.innerHTML = lockSvg() + MSStr.t.rpLocked;
        row.appendChild(lock);
      } else if (skeleton) {
        var sk = MSUi.el("span", "rp-sk");
        sk.style.cssText = "display:inline-block;width:88px;height:12px;";
        row.appendChild(sk);
      } else {
        row.appendChild(MSUi.el("span", "rp-tf-val", val));
      }
      return row;
    }

    function buildTfSection() {
      var sec = MSUi.el("div", "rp-sec");
      sec.appendChild(MSUi.el("div", "rp-sec-title", MSStr.t.rpTf));
      var dailyVal = "";
      if (state === "ready") {
        var v = an.out.verdict;
        dailyVal = v.confluence.total ? (dirWord(v.regime) + " · " + v.confluence.agree + "/" + v.confluence.total + MSStr.t.rpAgreeShort) : dirWord(v.regime);
      } else if (state === "error") {
        dailyVal = "—";
      }
      sec.appendChild(tfRow(MSStr.t.rpDaily, dailyVal, false, state === "loading"));
      sec.appendChild(tfRow(MSStr.t.rpWeekly, "", true, false));
      sec.appendChild(tfRow(MSStr.t.rpMonthly, "", true, false));
      return sec;
    }

    function buildCta() {
      var b = MSUi.el("button", "rp-cta", MSStr.t.rpSoon);
      b.disabled = true;
      return b;
    }

    function draw() {
      root.innerHTML = "";
      chartRefs = null;
      var scr = MSUi.el("div", "scr");
      scr.appendChild(buildHead());
      scr.appendChild(buildTierRow());

      if (state === "error") {
        scr.appendChild(errorBlock(errInfo));
      } else if (state === "loading") {
        scr.appendChild(skeletonBlock(96));    // 판정
        scr.appendChild(skeletonBlock(chartH())); // 차트
        scr.appendChild(skeletonBlock(180));   // Counted
      } else {
        scr.appendChild(buildVerdict());
        var hz = buildHorizons();
        if (hz) scr.appendChild(hz);
        scr.appendChild(buildChartSection());
        scr.appendChild(buildChartLegend());
        scr.appendChild(buildCounted());
      }

      scr.appendChild(buildNotCountedSection());   // 종목 데이터 무관 — 항상 렌더
      scr.appendChild(buildTfSection());
      scr.appendChild(buildCta());

      root.appendChild(scr);   // 여기서부터 라이브 DOM — clientWidth 측정 가능

      if (state === "ready" && chartRefs) paintChart(chartRefs.cv, chartRefs.wrap, chartRefs.legend, an, data, sym);
    }

    startLoad();
  }

  window.MSReport = { render: render };
})();
