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

  var LINE_LEGEND = [
    { key: "p1", label: MSStr.t.lgP1 },
    { key: "p2", label: MSStr.t.lgP2 },
    { key: "p3", label: MSStr.t.lgP3 }
  ];

  var cache = new Map();          // sym -> data(candle/price/asOf/name/source), 모듈 스코프(세션 한정)
  var NOT_COUNTED_LABELS = null;  // 지연 계산 — basicGraph/full32Graph 구성에만 의존, 종목 데이터 무관
  var activeResizeCleanup = null; // 현재 붙어있는 resize 리스너 해제 함수(모듈 스코프, 화면당 리스너 최대 1개 보장)

  // 종목별 Full 구매 레코드. 이 세션(앱 실행) 동안만 산다 — 앱을 다시 켜면 소멸하고,
  // 8b 의 서버 runs 테이블이 그 자리를 대체한다(BACKLOG-mobile.md Phase 8a).
  // render() 지역에 두면 구매가 화면 수명만큼만 살아 재진입 때 다시 과금된다.
  var purchases = {};             // sym -> { idem, promise, data, an, runs }

  // 그 중 idem 만은 실행보다 오래 살아야 한다. spend 를 보낸 뒤 응답이 유실되면 사용자는
  // 강제 종료로 빠져나오고, 다시 켠 앱의 purchases 는 비어 있어 새 idem 을 뽑는다 — 서버에는
  // 무관한 키라 멱등이 못 잡는다. full 은 서버 권리(24h runs) 덕에 재시도가 spend-cached 로
  // 흡수되지만 그건 spend 가 실제로 커밋된 경우뿐이고, 커밋 직전에 끊긴 경우는 그냥 두 번
  // 나간다. 종목별로 저장한다(스캔은 워치리스트 전체 단위라 watchlist.js 쪽은 키가 하나다).
  var K_PEND_FULL = "ms_pending_full_idem";   // { sym: idem }
  function pendingFullIdem(sym) {
    var m = MSStore.read0(K_PEND_FULL, null);
    var v = (m && typeof m === "object" && !(m instanceof Array)) ? m[sym] : null;
    return (typeof v === "string" && v) ? v : null;
  }
  function setPendingFullIdem(sym, idem) {
    var m = MSStore.read0(K_PEND_FULL, null);
    if (!m || typeof m !== "object" || (m instanceof Array)) m = {};
    if (idem) m[sym] = idem; else delete m[sym];
    MSStore.write0(K_PEND_FULL, m);
  }
  // render 세대 토큰 — 진행 중 구매의 결과가 그 사이 바뀐 화면을 덮어쓰지 않게 한다.
  var gen = 0;

  // 색 토큰은 MSUi.colTokens() 로 올라갔다 — 온보딩 차트가 두 번째 소비자가 되면서
  // 폴백 색이 두 벌이 되는 것을 막았다(ui.js).
  function colTokens() { return MSUi.colTokens(); }

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
  function analyzeFull(data, useFull, tf) {
    var graph = useFull ? MSGraph.full32Graph(ForgeCore) : MSGraph.basicGraph(ForgeCore);
    var vol = data.candle.map(function (c) { return c.v; });
    var okVol = vol.length >= 2 && vol.every(function (v) { return typeof v === "number" && isFinite(v); });
    MSGraph.setVolume(graph, okVol ? vol : null);
    var d = { price: data.price, candle: data.candle };
    if (okVol) d.volume = vol;
    var out = ForgeCore.run(graph, d, { timeframe: MSReportModel.tfKo(tf || TF) });

    var maP = paramOf(graph, "ma", { len: 20, ema: false });
    var rsiP = paramOf(graph, "rsi", { period: 14 });
    var bbP = paramOf(graph, "bollinger", { len: 20, k: 2 });
    var mcP = paramOf(graph, "macd", { fast: 12, slow: 26, signal: 9 });

    var ma = ForgeCore.analyzeMA(data.price, { len: maP.len, ema: !!maP.ema });
    var rsi = ForgeCore.analyzeRSI(data.price, { period: rsiP.period });
    var bb = ForgeCore.analyzeBollinger(data.price, { len: bbP.len, k: bbP.k });
    var macd = ForgeCore.analyzeMACD(data.price, { fast: mcP.fast, slow: mcP.slow, signal: mcP.signal });
    var va = ForgeCore.analyzeVolume(data.price, okVol ? vol : null, {});

    // graph·vol 을 함께 돌려준다 — AGAINST THIS CALL 이 판정과 **같은 그래프·같은 입력**을 봐야
    // 한다. 여기서 다시 만들면 파라미터가 갈려 화면 두 곳이 다른 말을 하게 된다.
    return { out: out, graph: graph, vol: okVol ? vol : null,
             ma: ma, rsi: rsi, bb: bb, macd: macd, va: va, maP: maP, rsiP: rsiP, bbP: bbP, mcP: mcP };
  }

  // ── 차트 합성 + 크로스헤어. wrap 은 이미 라이브 DOM 에 붙어 있어야 한다(clientWidth 측정 위해) ──
  function paintChart(cv, wrap, legend, an, data, sym, tier) {
    var ctx = cv.getContext("2d");
    var col = colTokens();
    var cssW = wrap.clientWidth || 320;
    var lay = null;
    var chartHpx = chartH();          // relayout 마다 다시 읽는다 — 회전·폴드 전환을 따라간다
    var tail = MSZoom.DEFAULT_TAIL;   // 화면 유지 중에만 산다. 종목을 바꾸면 paintChart 가 다시 불려 기본값으로 돌아간다.

    function relayout() {
      chartHpx = chartH();
      MSUi.fitCanvas(cv, ctx, cssW, chartHpx);   // DPR 트랜스폼 — 온보딩 차트와 한 벌(ui.js)
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
      if (!legend) return;   // SIGNALS 섹션이 없는 화면(에러·로딩)에서도 프레임은 돈다
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
      MSChartDraw.drawCone(ctx, lay, an.out.prediction, col, tier, { sym: sym, tf: TF });
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

  // ── Full 구매(판정 단계). SPEC §1: 차감과 실행은 한 트랜잭션 ──
  // 낙관적 차감을 하지 않는다 — 일봉이 실패하면 환급한다. 주·월은 없어도 차감을 유지하고
  // 그 행에 사유를 적는다(설계서 §5.5).
  //
  // 모듈 스코프인 이유: 구매 사실이 화면 수명보다 오래 산다. 뒤로 갔다 돌아오면 새 render() 가
  // 새 클로저를 만드는데, purchases 가 없으면 ①산 Full 이 Basic 으로 되돌아가 CTA 가 다시 뜨고
  // ②진행 중이던 구매를 못 알아봐 새 idem 으로 두 번째 차감이 난다(idem 이 다르니 서버 멱등도 못 잡는다).
  //
  // 체인은 "판정"(여기 — spend→로드→분석→필요 시 환급, 실패해도 안전하게 끝까지 돈다)과
  // "결과 반영"(호출부의 alert/draw, 던질 수 있다) 두 단계로 나뉜다. 판정 구간의 catch 는 판정
  // 구간의 예외만 잡아 "환급 여부를 모른다"(tsFailedNoRefund)로만 답한다 — 성공 판정 뒤 draw() 가
  // 던지는 예외까지 이 catch 가 삼키면 정상 결제·정상 분석인데 "환급됐다"(tsFailed)고 거짓말하게 된다.
  function purchaseFull(sym) {
    var rec = purchases[sym];
    if (rec && rec.an) {   // 이미 산 것 — 다시 차감하지 않고 그 결과를 그대로 돌려준다
      return Promise.resolve({ kind: "success", data: rec.data, an: rec.an, runs: rec.runs });
    }
    if (rec && rec.promise) return rec.promise;   // 진행 중 — 같은 promise 에 다시 붙는다(idem 자연 재사용)

    // maybe-charged 로 끝난 이전 시도의 idem 이 남아 있으면 그대로 재사용한다(I-H) — 응답을
    // 못 받았을 뿐 서버가 이미 처리했을 수 있어서다. 새 idem 을 새로 뽑으면 원장(전역 UNIQUE)에서
    // 완전히 다른 키가 되어 멱등이 못 잡고 이중 차감된다. rec.idem 이 없으면(첫 시도이거나
    // definitely-not-charged 로 지워진 뒤) 새로 뽑는다.
    // 저장소에 남은 값(지난 실행에서 응답을 못 받은 시도)까지 이어받는다 — 메모리 레코드가
    // 없다고 새 키를 뽑으면 강제 종료 뒤 재구매가 그대로 두 번째 차감이 된다.
    var idem = (rec && rec.idem) ? rec.idem : (pendingFullIdem(sym) || MSWallet.newIdem());
    rec = { idem: idem, promise: null, data: null, an: null, runs: null };
    purchases[sym] = rec;   // spend 를 부르기 전에 등록한다 — 그 사이 들어온 두 번째 호출이 붙을 자리다
    setPendingFullIdem(sym, idem);   // 보내기 전에 적는다 — 응답이 유실된 창을 덮는 건 이 순서뿐이다

    rec.promise = MSWallet.spend("full", idem, sym).then(function (sp) {
      if (!sp.ok) return { kind: "spend-fail", reason: sp.reason };
      var tfs = ["1day", "1week", "1month"];
      return Promise.all(tfs.map(function (tf) {
        return MSApi.loadTicker(sym, tf)
          .then(function (d) { return { tf: tf, data: d }; })
          .catch(function (e) { return { tf: tf, error: (e && e.message) || "unavailable" }; });
      })).then(function (loaded) {
        var day = loaded[0];
        if (day.error) {
          return MSWallet.refund(idem).then(function (rf) { return { kind: "refunded", ok: !!(rf && rf.ok) }; });
        }
        var dayAn = null;
        var runs = loaded.map(function (L) {
          if (L.error) return { tf: L.tf, error: MSStr.t.rpNoHistory };
          try {
            var a = analyzeFull(L.data, true, L.tf);
            if (L.tf === "1day") dayAn = a;          // 일봉 분석을 두 번 돌리지 않는다
            return { tf: L.tf, out: a.out };
          } catch (e) { return { tf: L.tf, error: MSStr.t.rpNoHistory }; }
        });
        if (!dayAn) {
          return MSWallet.refund(idem).then(function (rf) { return { kind: "refunded", ok: !!(rf && rf.ok) }; });
        }
        return { kind: "success", data: day.data, an: dayAn, runs: runs };
      });
    })["catch"](function () {
      // 판정 구간(spend·로드·분석·환급 호출 자체)의 예외 — 환급이 됐는지조차 모르므로 단정하지 않는다.
      // MSWallet.spend 는 HTTP 백엔드에서 절대 reject 하지 않으므로(callBackend 가 항상 흡수)
      // 지금은 도달할 일이 없는 방어용 코드다 — 그래도 여기 떨어지면 charged 여부를 정말 모르므로
      // maybeCharged 취급과 같게(idem 보존) 답한다.
      return { kind: "unknown" };
    }).then(function (r) {
      rec.promise = null;
      if (r.kind === "success") {
        rec.data = r.data; rec.an = r.an; rec.runs = r.runs;
        setPendingFullIdem(sym, null);   // 확정 성공 — 이 키는 끝났다
      } else if (r.kind === "unknown" || (r.kind === "spend-fail" && MSWallet.maybeCharged(r.reason))) {
        // 정말로 차감됐는지 모른다 — idem 을 지우지 않는다(rec 를 purchases[sym] 에 그대로 두고
        // 저장소에도 남긴다). 다음 purchaseFull(sym) 이 — 이번 실행이든 다음 실행이든 —
        // 이 idem 을 재사용해 서버 멱등이 잡게 한다.
      } else if (purchases[sym] === rec) {
        delete purchases[sym];           // 확실히 실패·환급됐다 — 다시 살 수 있어야 한다
        setPendingFullIdem(sym, null);
      }
      return r;
    });
    return rec.promise;
  }

  function render(root, params) {
    var myGen = ++gen;   // 이 화면의 세대 — 결과 반영이 자기 화면인지 확인하는 토큰
    var sym = String((params && params.sym) || "").trim().toUpperCase();
    var wl = MSStore.getWatchlist();
    var idx = -1, i;
    for (i = 0; i < wl.length; i++) { if (wl[i].sym === sym) { idx = i; break; } }
    var wlItem = idx >= 0 ? wl[idx] : null;

    // 이 세션에서 이미 산 Full 이 있으면 그 레코드가 화면의 출발점이다 — 재과금 없이 그대로 복원한다.
    var bought = (purchases[sym] && purchases[sym].an) ? purchases[sym] : null;
    var state = "loading", errInfo = null, data = null, an = null, chartRefs = null;
    var tier = bought ? "full" : "basic";   // Full 을 사면 "full" 로 올라간다(재진입 시엔 복원)
    var tfRuns = bought ? bought.runs : null;   // [{tf, out, error}] — Full 이 채운다
    // 재진입·이중 과금 가드는 purchases 레코드가 한다(모듈 스코프) — 여기 지역 플래그를 또 두지 않는다.

    // 잔량 부족 광고 권유(Phase 8d). adBusy 는 연타 방지 — CTA 를 눌러 잔량이 부족한 것을
    // 이미 확인한 render() 안에서 광고는 한 번에 하나만 돈다(wallet.js 의 adBusy 와 같은 역할).
    var adBusy = false;

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
      // Full 분석이 Basic 분석보다 우선한다 — 한 곳에서만 판정한다. 이 가드가 없으면 늦게 끝난
      // 기본 로드(또는 에러 화면의 retry)가 방금 산 32지표 결과를 5지표로 덮어 배지만 FULL 인
      // 화면이 된다. 구매 도중 재렌더돼 로드와 구매가 함께 도는 경로에서 실제로 겹친다.
      if (tier === "full" && an) { state = "ready"; draw(); return; }
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

      // 시안 2a 의 헤더는 한 줄이다 — 심볼 + 위치 + 필. 회사명은 아래 가격 블록의 오버라인으로 간다.
      head.appendChild(MSUi.el("div", "rp-head-sym", sym));
      if (idx >= 0) head.appendChild(MSUi.el("div", "rp-head-pos", (idx + 1) + " / " + wl.length));
      head.appendChild(MSWalletScreen.pill(function () { MSApp.go("wallet"); }));
      return head;
    }

    // 시안 2a 가 화면에서 제일 크게 두는 것 — 현재가. 주식 앱 리포트에 가격이 없던 것이 가장 큰 결손이었다.
    function buildPrice() {
      var wrap = MSUi.el("div", "rp-px-wrap");
      var name = (wlItem && wlItem.name) || "";
      if (name) wrap.appendChild(MSUi.el("div", "overline", name.toUpperCase()));

      var p = data.price, n = p.length;
      var last = p[n - 1], prev = p[n - 2];
      var row = MSUi.el("div", "rp-px-row");
      row.appendChild(MSUi.el("span", "rp-px", MSUi.fmtPrice(last)));
      if (prev != null && isFinite(prev) && prev !== 0) {
        var d = last - prev, pct = (d / prev) * 100;
        var cls = pct > 0 ? " up" : pct < 0 ? " dn" : "";
        row.appendChild(MSUi.el("span", "rp-px-chg" + cls,
          (d > 0 ? "+" : "") + MSUi.fmtPrice(d) + "  " + MSUi.fmtChg(pct)));
      }
      wrap.appendChild(row);
      return wrap;
    }

    function buildTierRow() {
      var row = MSUi.el("div", "rp-tier-row");
      var isFull = (tier === "full");
      row.appendChild(MSUi.el("span", "rp-tier" + (isFull ? " is-full" : ""), isFull ? MSStr.t.rpTierFull : MSStr.t.rpTierBasic));
      row.appendChild(MSUi.el("span", "rp-tier-desc", isFull ? MSStr.t.rpTierCountFull : MSStr.t.rpTierCount));
      var evi = MSUi.el("span", "rp-evi");
      var on = isFull ? 2 : 1;   // 시안 6a: Basic 1/3 · Full 2/3 · Custom 3/3
      for (var k = 0; k < 3; k++) evi.appendChild(MSUi.el("span", "rp-evi-seg" + (k < on ? " on" : "")));
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
    function buildVerdict(indRows) {
      var v = an.out.verdict, pr = an.out.prediction;
      var wrap = MSUi.el("div", "rp-verdict-wrap");
      var dirCls = v.regime === "bull" ? "bull" : v.regime === "bear" ? "bear" : "neutral";

      wrap.appendChild(MSUi.el("div", "overline", MSStr.t.rpComposite));

      var conf = MSReportModel.confidence(ForgeCore, pr, v.regime);
      var head = MSUi.el("div", "rp-verdict " + dirCls);
      head.appendChild(MSUi.el("span", null, verdictWord(v.regime)));
      if (conf != null) head.appendChild(MSUi.el("span", "rp-conf-pct", conf + "%"));
      // 시안 2a 의 "17 up · 6 flat · 9 down" + 3구간 바. 방향 개수는 레전드 행의 tone 에서 센다 —
      // 판정에 실제로 쓰인 지표들이라 다른 출처를 새로 만들지 않는다.
      // 집계는 그 티어가 실제로 읽은 지표를 센다. Full 인데 5지표만 세면 바로 아래 "4 of 32" 와
      // 숫자가 어긋나 같은 화면이 두 말을 한다. 방향 경로는 반대 근거와 동일(MSIndicators).
      var tally;
      if (tier === "full" && indRows) {
        tally = { up: 0, flat: 0, down: 0 };
        indRows.forEach(function (r) {
          if (r.bias > MSIndicators.EPS) tally.up++;
          else if (r.bias < -MSIndicators.EPS) tally.down++;
          else tally.flat++;
        });
      } else {
        tally = MSLegend.tally(MSLegend.rows(an, pr, null));
      }
      var tallyWrap = MSUi.el("div", "rp-tally");
      tallyWrap.appendChild(MSUi.el("div", "rp-tally-txt",
        tally.up + MSStr.t.rpUp2 + tally.flat + MSStr.t.rpFlat2 + tally.down + MSStr.t.rpDown2));
      var bar = MSUi.el("div", "rp-tally-bar");
      [["up", tally.up], ["flat", tally.flat], ["down", tally.down]].forEach(function (seg) {
        if (!seg[1]) return;
        var s = MSUi.el("div", "rp-tally-seg is-" + seg[0]);
        s.style.flex = String(seg[1]);
        bar.appendChild(s);
      });
      tallyWrap.appendChild(bar);
      head.appendChild(tallyWrap);
      wrap.appendChild(head);

      var hit = (conf != null) ? MSReportModel.hitRate(window.MSBacktest, v.regime) : null;
      if (hit) {
        // 방향을 먼저 밝힌다 — 불 61.5/38.5 · 베어 42.6/57.4 로 갈리므로 어느 쪽 수치인지가
        // 숫자 자체만큼 중요하다.
        var lead = (v.regime === "bull") ? MSStr.t.rpHitLeadBull : MSStr.t.rpHitLeadBear;
        wrap.appendChild(MSUi.el("div", "rp-hit",
          lead + hit.right + MSStr.t.rpHitRight + hit.wrong + MSStr.t.rpHitWrong));
        // 범위를 반드시 함께 적는다. 이 수치는 백테스트 하네스의 그래프로 잰 것이라 이 종목도,
        // 이 티어의 지표 구성도 아니다 — "이 판정 같은 콜"이라고 말하면 거짓 귀속이 된다.
        var scope = (hit.n != null && hit.series != null)
          ? (MSStr.t.rpHitScopeA + hit.n.toLocaleString() + MSStr.t.rpHitScopeB + hit.series + MSStr.t.rpHitScopeC)
          : MSStr.t.rpHitScopeShort;
        wrap.appendChild(MSUi.el("div", "rp-hit-note",
          scope + MSStr.t.rpHitSize + hit.wrong + MSStr.t.rpHitSizeTail));
      }

      var total = v.confluence.total, agree = v.confluence.agree;
      var confText = total ? (agree + MSStr.t.rpAgree + total + MSStr.t.rpAgreeTail) : MSStr.t.rpAgreeNone;
      wrap.appendChild(MSUi.el("div", "rp-conf", confText));
      // 예측 범위는 HORIZON 머리로 옮겼다 — 시안 2a 가 "80% cone" 을 지평 표의 캡션으로 둔다.
      // 안 센 지표 27개 나열도 뺐다: 시안은 SIGNALS 머리의 "5 of 32" 한 줄로 같은 말을 한다.
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
      var head = MSUi.el("div", "rp-sec-head");
      head.appendChild(MSUi.el("span", "overline", MSStr.t.rpHorizon));
      var pr = an.out.prediction, lastI = pr.lo.length - 1;
      if (lastI >= 0) {
        head.appendChild(MSUi.el("span", "rp-sec-note",
          MSUi.fmtPrice(pr.lo[lastI]) + " – " + MSUi.fmtPrice(pr.hi[lastI]) + MSStr.t.rpCone));
      }
      sec.appendChild(head);
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
      var cv = document.createElement("canvas");
      wrap.appendChild(cv);
      chartRefs = { wrap: wrap, cv: cv, legend: null };   // Basic 만 buildSignals() 가 채운다. Full 은 null(REASONING 이 대체)
      return wrap;
    }

    // 시안 2a·1a 의 SIGNALS — 지표 판독을 이름/값 정렬 행으로. 예전엔 이 내용이 차트 바로 위에
    // 여섯 줄짜리 다색 덩어리로 얹혀 차트를 짓눌렀다(시안엔 그런 요소가 없다).
    // 크로스헤어를 끌면 여기 값이 따라 움직인다 — paintChart 가 이 요소를 계속 갱신한다.
    function buildSignals() {
      // Full 은 REASONING 32행이 이 자리를 받는다 — 5종 판독이 그 안에 이미 들어가므로
      // 두 섹션이면 같은 말을 두 번 한다. Basic 은 종전대로 7행 + 크로스헤어 연동.
      if (tier === "full") return null;
      var sec = MSUi.el("div", "rp-sec");
      var head = MSUi.el("div", "rp-sec-head");
      head.appendChild(MSUi.el("span", "overline", MSStr.t.rpSignals));
      // 시안 1a 의 "5 of 12 shown" 자리. 안 센 지표를 27개 칩으로 깔던 벽을 이 한 줄이 대신한다.
      head.appendChild(MSUi.el("span", "rp-sec-note", "5" + MSStr.t.rpOf + "32" + MSStr.t.rpShown));
      sec.appendChild(head);
      var legend = MSUi.el("div", "rp-ind-legend");
      sec.appendChild(legend);
      if (chartRefs) chartRefs.legend = legend;
      return sec;
    }

    // 예측선 3종 범례 — 잠긴 선도 숨기지 않고 보여준다("빠진 것을 보여주는 것"이 핵심,
    // Not counted 칩과 같은 취지). 활성 선만 실제 색, 잠긴 선은 --ink-5 로 죽인다.
    function legendColorVar(key) {
      return key === "p1" ? "--gold" : key === "p2" ? "--pred2" : "--bear";
    }
    function buildChartLegend() {
      var allowed = MSChartDraw.linesFor(tier);
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

    // buildCounted() 를 지웠다 — ForgeCore.*Steps() 는 PC 스쿱포지용이라 한국어 문자열을 뱉는데
    // 영어 앱에 그대로 새고 있었다("혼조 (정렬도 0%)"). 같은 5종을 MSLegend 가 영어로 이미 낸다.

    // 시안 6a 의 REASONING · 32 NODES — Full 이 3스쿱으로 주는 것의 본체.
    // 32종을 다 돌렸다는 말 대신 각 지표가 무엇을 보고 그 방향을 냈는지 문장으로 적는다.
    // 판독은 **일봉 기준**이다(헤드라인 판정과 같은 주기). 주·월 정합은 TIMEFRAME 행이 말한다.
    function buildReasoning(indRows, noDir) {
      if (tier !== "full" || !indRows) return null;
      var rows = MSReadings.reasoningRows(indRows, noDir);
      if (!rows.length) return null;
      var sec = MSUi.el("div", "rp-reason");
      var head = MSUi.el("div", "rp-sec-head");
      head.appendChild(MSUi.el("span", "overline",
        MSStr.t.rpReasoning + MSStr.t.rpSep + rows.length + MSStr.t.rpReasoningNodes));
      // 방향을 물을 수 있었던 수를 따로 적는다 — 32 라고만 쓰면 trend·phasefold 를
      // 센 것처럼 말하게 된다.
      // 거절한 행(거래량 없음·스윙 없음·봉 부족)은 빼고 센다. bias 숫자는 엔진이 대체 입력으로
      // 만들어 낸 값이라 여전히 붙지만, 그 행은 **아무것도 읽지 못했다고 스스로 말하고 있다** —
      // "N with a direction" 에 넣으면 읽지 않은 것에 방향을 귀속시키게 된다.
      // 술어는 MSReadings.voiced 하나다 — AGAINST 도 같은 것을 쓴다(각자 판정하면 갈린다).
      head.appendChild(MSUi.el("span", "rp-sec-note",
        MSStr.t.rpReasoningScope + MSReadings.voiced(indRows).length + MSStr.t.rpReasoningDir));
      sec.appendChild(head);
      rows.forEach(function (r) {
        var row = MSUi.el("div", "rp-reason-row");
        row.appendChild(MSUi.el("span", "rp-reason-name", MSStr.ind(r.type)));
        row.appendChild(MSUi.el("span", "rp-reason-text", r.text));
        var cls = (r.bias == null) ? "" : r.bias > MSIndicators.EPS ? " up"
                : r.bias < -MSIndicators.EPS ? " dn" : "";
        var val = (r.bias == null) ? MSStr.t.rpNoDirDash
                : (r.bias > 0 ? "+" : "") + r.bias.toFixed(2);
        row.appendChild(MSUi.el("span", "rp-reason-bias" + cls, val));
        sec.appendChild(row);
      });
      return sec;
    }

    // 시안 6a 의 Basic 결핍 박스. 27개 지표를 칩으로 깔던 자리에 원래 이게 들어간다 —
    // "어떤 지표를 안 봤나"보다 "무엇을 못 하나"가 정확한 설명이고, Full 을 살 이유도 여기서 나온다.
    // Full 은 넷 다 되므로 박스 자체를 내린다.
    function buildMissing() {
      if (tier === "full") return null;
      var sec = MSUi.el("div", "rp-missing-box");
      sec.appendChild(MSUi.el("div", "overline", MSStr.t.rpNotCounted));
      [MSStr.t.rpMissingHitRate, MSStr.t.rpMissingDisagree,
       MSStr.t.rpMissingTfAgree, MSStr.t.rpMissingWhy].forEach(function (label) {
        var row = MSUi.el("div", "rp-missing-row");
        row.appendChild(MSUi.el("span", "rp-missing-name", label));
        row.appendChild(MSUi.el("span", "rp-missing-dash", MSStr.t.rpMissingDash));
        sec.appendChild(row);
      });
      return sec;
    }
    // 시안 6a 의 AGAINST THIS CALL — Full 이 3스쿱으로 주는 것 중 하나.
    // 32종을 다 돌려놓고 "다 동의한다"고만 하면 근거가 아니라 응원이다. 반대편을 이름으로 보여준다.
    // 방향은 웹과 같은 경로로 얻는다(지표마다 ForgeCore.analyzeX) — 백테스트도 새 데이터도 없다.
    function buildAgainst(indRows) {
      if (tier !== "full" || !an || !an.graph || !indRows) return null;
      var regime = an.out.verdict.regime;
      if (regime !== "bull" && regime !== "bear") return null;   // 중립엔 반대가 정의되지 않는다
      // 스스로 "못 읽었다"고 말한 행은 반대할 자격이 없다 — 거래량 없는 종목에서 MFI 가
      // "No volume data for this ticker" 라고 적어 놓고 반대 목록에 이름을 올리면, 이 브랜치가
      // 없애려던 거짓말이 자리만 옮긴 것이다. **목록과 분모 둘 다** 같은 술어로 걷어낸다
      // (한쪽만 줄이면 분자 > 분모가 난다). REASONING 머리와 같은 MSReadings.voiced 다.
      var voiced = MSReadings.voiced(indRows);
      var rows = MSIndicators.opposing(ForgeCore, an.graph, null, regime, voiced);
      // 분모는 32가 아니라 **방향을 실제로 말한 수**다(trend·phasefold 제외 + 거절 행 제외).
      var measured = voiced.length;
      var sec = MSUi.el("div", "rp-against");
      var head = MSUi.el("div", "rp-sec-head");
      head.appendChild(MSUi.el("span", "overline", MSStr.t.rpAgainst));
      head.appendChild(MSUi.el("span", "rp-sec-note", rows.length + MSStr.t.rpOf + measured));
      sec.appendChild(head);
      if (!rows.length) {
        sec.appendChild(MSUi.el("p", "rp-against-none", MSStr.t.rpAgainstNone));
        return sec;
      }
      rows.forEach(function (r) {
        var row = MSUi.el("div", "rp-against-row");
        row.appendChild(MSUi.el("span", "rp-against-name", MSStr.ind(r.type)));
        row.appendChild(MSUi.el("span", "rp-against-text", r.text));
        // 기여도는 부호까지 보여준다 — 반대 목록이라 부호가 판정 반대편이라는 사실 자체가 정보다.
        row.appendChild(MSUi.el("span", "rp-against-bias", (r.bias > 0 ? "+" : "") + r.bias.toFixed(2)));
        sec.appendChild(row);
      });
      return sec;
    }

    function buildMissingNote() {
      if (tier === "full") return null;
      return MSUi.el("p", "rp-missing-note", MSStr.t.rpMissingNote);
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
      sec.appendChild(MSUi.el("div", "overline", MSStr.t.rpTf));
      var names = { "1day": MSStr.t.rpDaily, "1week": MSStr.t.rpWeekly, "1month": MSStr.t.rpMonthly };
      if (!tfRuns) {   // Basic — 일봉만 값, 주·월은 잠김
        var dailyVal = "";
        if (state === "ready") {
          var v = an.out.verdict;
          dailyVal = v.confluence.total ? (dirWord(v.regime) + MSStr.t.rpSep + v.confluence.agree + "/" + v.confluence.total + MSStr.t.rpAgreeShort) : dirWord(v.regime);
        } else if (state === "error") dailyVal = "—";
        sec.appendChild(tfRow(MSStr.t.rpDaily, dailyVal, false, state === "loading"));
        sec.appendChild(tfRow(MSStr.t.rpWeekly, "", true, false));
        sec.appendChild(tfRow(MSStr.t.rpMonthly, "", true, false));
        return sec;
      }
      MSReportModel.tfRows(ForgeCore, tfRuns).forEach(function (r) {
        var val = r.reason ? r.reason
          : (dirWord(r.regime) + (r.prob == null ? "" : MSStr.t.rpSep + Math.round(r.prob) + "%") +
             (r.target == null ? "" : MSStr.t.rpSep + MSUi.fmtPrice(r.target)));
        sec.appendChild(tfRow(names[r.tf] || r.tf, val, false, false));
      });
      var ag = MSReportModel.agreeCount(tfRuns);
      sec.appendChild(MSUi.el("div", "rp-range", ag.agree + MSStr.t.rpAgreeTf + ag.total + MSStr.t.rpAgreeTfTail));
      return sec;
    }

    // 결과 반영이 아직 이 화면에 유효한가. root 는 단일 모드에서 rootEl, 2단에서 reportPane 이라
    // 지갑·워치리스트와 공유하는 엘리먼트다 — 확인 없이 draw() 하면 지금 보고 있는 지갑이 리포트로
    // 갈아치워지고 MSApp 의 showing 과도 어긋난다. 세대(같은 리포트의 재렌더)와 현재 라우트를 둘 다 본다.
    function isCurrent() {
      if (myGen !== gen) return false;
      var cur = MSApp.current();
      return !!(cur && cur.route === "report" && cur.params && cur.params.sym === sym);
    }

    // 결과 반영 단계 — 판정(purchaseFull)이 안전하게 끝난 뒤다. 여기서 던지는 예외(draw() 등)는
    // 판정 구간의 catch 가 이미 지나가 못 잡는다. 성공 렌더 오류가 "환급됨" 문구로 잘못 이어지지 않는 이유다.
    function runFull() {
      purchaseFull(sym).then(function (r) {
        // 잔량이 움직였을 수 있다. 화면이 바뀌었어도 필은 문서에 그대로 떠 있으므로 세대 가드 밖이다.
        MSWalletScreen.refreshPills();
        // 화면이 이미 다른 것을 보고 있으면 아무것도 건드리지 않는다 —
        // 결과는 purchases[sym] 에 남아 있어 이 종목으로 돌아오면 그대로 보인다.
        if (!isCurrent()) return;
        if (r.kind === "success") {
          data = r.data; an = r.an; tfRuns = r.runs; tier = "full";
          state = "ready";   // 기본 로드가 아직 안 끝났거나 실패한 상태에서 샀을 수 있다
          MSTierSheet.close();
          draw();
        } else if (r.kind === "refunded") {
          MSTierSheet.close();
          alert(r.ok ? MSStr.t.tsFailed : MSStr.t.tsFailedNoRefund);
        } else if (r.kind === "spend-fail") {
          MSTierSheet.close();
          // "Nothing was charged" 는 definitely-not-charged 사유에서만 참이다. maybe-charged
          // (network·server-error·busy)는 실제로 서버가 처리했을 수 있으니 그렇게 단정하지 않는다
          // — purchases[sym] 에 idem 이 남아 다음 시도가 재사용한다(위 .then 참고).
          alert(r.reason === "insufficient" ? MSStr.t.tsShort
                : MSWallet.maybeCharged(r.reason) ? MSStr.t.tsSpendFailedUnknown
                : MSStr.t.tsSpendFailed);
        } else {
          MSTierSheet.close();
          alert(MSStr.t.tsFailedNoRefund);
        }
      });
    }

    // 광고를 본 뒤의 잔량 폴링(Phase 8d) — wallet.js 의 afterAd 와 같은 규율이다: 세대 가드
    // (isCurrent, 이 화면이 이미 이 render() 세대·이 종목이 아니면 멈춘다)로 재렌더·종목전환
    // 시 고아 루프를 죽이고, adBusy 로 진행 중 연타를 막는다. 잔량은 서버가 준 값이 before 보다
    // 커진 것을 **확인한 뒤에만** 다음 단계로 넘어간다 — 낙관적으로 올려 그리지 않는다(8b 원칙).
    function afterCtaAd(before, n, msg) {
      if (!isCurrent()) return;
      if (n >= 5) { adBusy = false; msg.textContent = MSStr.t.adPending; return; }
      MSWallet.get().then(function (r) {
        if (!isCurrent()) return;
        if (r.ok && r.state && r.state.balance > before) {
          adBusy = false;
          MSWalletScreen.refreshPills();
          // 잔량이 찼다 — 지갑 화면으로 튕기지 않고 원래 하려던 분석(Full 구매) 흐름으로
          // 그대로 이어간다. Run 버튼은 여기서 대신 눌러주지 않는다 — 사용자가 원래 밟으려던
          // "단계 선택 → Run" 순서를 그대로 준다(광고가 자동으로 구매까지 이어버리면 원치
          // 않는 결제로 읽힐 수 있다).
          MSWallet.get().then(function (r2) {
            if (!isCurrent()) return;
            MSTierSheet.open({ sym: sym, tier: tier, balance: r2.state ? r2.state.balance : null, onRun: runFull });
          });
          return;
        }
        setTimeout(function () { afterCtaAd(before, n + 1, msg); }, 2000);
      });
    }

    // customData 는 여기서 만들거나 손대지 않는다 — MSAds.show(unit) 는 "quick"/"full" 키만
    // 받는다(wallet.js 의 watchAd 와 같은 계약 ①).
    function watchCtaAd(unit, msg, before) {
      if (adBusy) return;
      adBusy = true;
      msg.textContent = "";
      MSAds.show(unit).then(function (r) {
        if (!isCurrent()) return;
        if (!r || !r.shown) {
          adBusy = false;
          msg.textContent = MSStr.t.adFailed;
          return;
        }
        msg.textContent = MSStr.t.adWaiting;
        afterCtaAd(before, 0, msg);
      });
    }

    // Full 을 누르려는데 잔량이 부족할 때 — CTA 버튼 자리를 그대로 광고 권유로 바꾼다.
    // 단계 선택 시트를 열지 않는다: 아직 살 수 없다는 것을 이미 알고 있어 시트가 보여줄
    // 새 정보가 없고, 시트를 열었다 잔량 부족 문구만 보여주는 우회를 하지 않는다.
    function showLowBalanceAd(wrap, bal) {
      wrap.innerHTML = "";
      wrap.appendChild(MSUi.el("p", "rp-missing-note", MSStr.t.adLowBalance));
      var msg = MSUi.el("p", "rp-missing-note");
      MSWallet.adConfig().then(function (r) {
        if (!isCurrent()) return;
        if (!r.ok) {
          // ads-disabled — 광고로 채울 길이 없다. 옛 tsShort 문구로 사실대로 되돌아간다.
          msg.textContent = MSStr.t.tsShort;
          wrap.appendChild(msg);
          return;
        }
        if (typeof MSAds !== "undefined" && MSAds && MSAds.init) MSAds.init(r);
        [["quick", MSStr.t.adQuick], ["full", MSStr.t.adFull]].forEach(function (pair) {
          var b = MSUi.el("button", "rp-cta", pair[1]);
          b.addEventListener("click", function () { watchCtaAd(pair[0], msg, bal); });
          wrap.appendChild(b);
        });
        wrap.appendChild(msg);
      });
    }

    function buildCta() {
      if (tier !== "basic") return MSUi.el("div");
      var wrap = MSUi.el("div");
      var b = MSUi.el("button", "rp-cta", MSStr.t.rpUpgrade);
      b.addEventListener("click", function () {
        MSWallet.get().then(function (r) {
          if (!isCurrent()) return;
          var bal = r.state ? r.state.balance : null;
          // bal == null 은 "잔량을 모른다"(오프라인 등)다 — 광고 권유로 바꾸지 않는다. 뭘
          // 권유할 근거(정말 부족한지)가 없다. 시트를 그대로 열어 tsUnavailable 이 말하게 둔다.
          if (bal != null && bal < MSWallet.COSTS.full) { showLowBalanceAd(wrap, bal); return; }
          MSTierSheet.open({ sym: sym, tier: tier, balance: bal, onRun: runFull });
        });
      });
      wrap.appendChild(b);
      return wrap;
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
        scr.appendChild(skeletonBlock(84));    // 가격
        scr.appendChild(skeletonBlock(96));    // 판정
        scr.appendChild(skeletonBlock(chartH())); // 차트
        scr.appendChild(skeletonBlock(180));   // 신호
      } else {
        // 지표 방향·판독문을 여기서 **한 번** 계산해 세 곳(판정 tally · REASONING · AGAINST)에
        // 나눠 준다. 예전엔 셋이 각자 MSIndicators 를 불러 Full 에서 analyzeX 가 90회 돌았다.
        var indRows = null, noDir = null;
        if (tier === "full" && an && an.graph) {
          var indInput = { price: data.price, candle: data.candle, volume: an.vol };
          // an.vol 은 analyzeFull 의 okVol 판정 결과다(거래량이 한 봉이라도 비면 null). 판독문의
          // hasVolume 은 그 하나에서만 나온다 — 여기서 다시 재면 화면과 문장이 갈린다.
          var indCtx = MSIndicators.ctxFrom(indInput);
          indRows = MSIndicators.readings(ForgeCore, an.graph, indInput, indCtx);
          noDir = MSIndicators.noDirRows(ForgeCore, indInput, indCtx);
        }
        // 시안 2a 의 순서: 가격 → 판정 → 차트 → 지평 → 신호 → 주기.
        // 큰 것에서 작은 것으로 내려가고, 섹션마다 오버라인이 머리를 잡는다.
        scr.appendChild(buildPrice());
        scr.appendChild(buildVerdict(indRows));
        scr.appendChild(buildChartSection());
        scr.appendChild(buildChartLegend());
        var hz = buildHorizons();
        if (hz) scr.appendChild(hz);
        var sig = buildSignals();
        if (sig) scr.appendChild(sig);
        var reason = buildReasoning(indRows, noDir);
        if (reason) scr.appendChild(reason);
        var miss = buildMissing();
        if (miss) scr.appendChild(miss);
        var ag = buildAgainst(indRows);
        if (ag) scr.appendChild(ag);
      }

      scr.appendChild(buildTfSection());
      var note = (state === "ready") ? buildMissingNote() : null;
      if (note) scr.appendChild(note);
      scr.appendChild(buildCta());

      root.appendChild(scr);   // 여기서부터 라이브 DOM — clientWidth 측정 가능

      if (state === "ready" && chartRefs) paintChart(chartRefs.cv, chartRefs.wrap, chartRefs.legend, an, data, sym, tier);
    }

    // 산 것은 그대로 다시 보인다. startLoad() 를 태우면 finishData() 의 Basic 재분석이 Full 분석(an)을
    // 덮어써 배지는 FULL 인데 내용은 5지표인 화면이 된다 — 그래서 로드·재분석 없이 레코드로 바로 그린다.
    if (bought) { data = bought.data; an = bought.an; state = "ready"; draw(); }
    else if (purchases[sym] && purchases[sym].promise) {
      // 구매가 아직 도는 중에 이 화면이 재렌더됐다(같은 종목 재탭·폴드 전환). 앞 렌더의 반영은
      // 세대 가드에 막혀 버려지므로, 이 렌더가 그 promise 에 다시 붙어야 결과가 화면에 온다.
      // purchaseFull() 이 레코드를 보고 붙으므로 spend 는 다시 일어나지 않는다.
      startLoad();
      runFull();
    } else startLoad();
  }

  window.MSReport = { render: render };
})();
