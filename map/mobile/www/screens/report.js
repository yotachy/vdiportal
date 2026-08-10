// Basic 리포트 화면. 판정(방향·확신·정직한 범위·빠진 것의 크기) + 4단 적층 차트 +
// Counted(5지표 판독값)/Not counted(27개 칩) + 주기 행(일간만 값, 주간·월간 잠김) + 비활성 CTA.
// 차트 합성은 라벨초기화→축→콘(꿈틀·끝점 장식)→캔들→오버레이/배지→서브패널 순(z-order 그대로),
// 크로스헤어는 350ms 홀드 게이트.
(function () {
  "use strict";

  var TF = "1day";
  var CHART_H = 520, PAD = 10, TAIL_BARS = 120;
  var HOLD_MS = 350, MOVE_THRESH = 8;
  var TIER = "basic";   // Phase 1 은 Basic 고정 — 이후 단계에서 사용자 티어로 교체(차트·범례 모두 이 값만 바뀌면 됨)

  var LINE_LEGEND = [
    { key: "p1", label: "1차 종합 예측" },
    { key: "p2", label: "2차 선택 지표 예측" },
    { key: "p3", label: "3차 반대 시나리오" }
  ];

  var cache = new Map();          // sym -> data(candle/price/asOf/name/source), 모듈 스코프(세션 한정)
  var NOT_COUNTED_LABELS = null;  // 지연 계산 — basicGraph/full32Graph 구성에만 의존, 종목 데이터 무관
  var activeResizeCleanup = null; // 현재 붙어있는 resize 리스너 해제 함수(모듈 스코프, 화면당 리스너 최대 1개 보장)

  // MSGraph.MISSING(13종)엔 sampleGraph 유래 한글 타이틀이 없다 — 이 13개만 심는다.
  // 나머지 14종("full32 에만 있는 나머지")은 sampleGraph 노드의 title 을 그대로 쓴다(chipLabel).
  var TITLE_KO = {
    pivot: "피벗", psar: "PSAR", gann: "GANN", keltner: "켈트너 채널", donchian: "돈치안 채널",
    cci: "CCI", williams: "윌리엄스 %R", aroon: "아룬", mfi: "MFI", roc: "ROC",
    ao: "AO", cmf: "CMF", pattern: "차트 패턴"
  };

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

  function isBarsShort(err) { return !!(err && typeof err.message === "string" && err.message.indexOf("봉 부족") === 0); }
  function loadOne(sym) { return MSApi.loadTicker(sym, TF); }

  function paramOf(graph, blockType, defaults) {
    var n = null, i;
    for (i = 0; i < graph.nodes.length; i++) { if (graph.nodes[i].blockType === blockType) { n = graph.nodes[i]; break; } }
    var p = (n && n.params) || {}, out = {}, k;
    for (k in defaults) { if (Object.prototype.hasOwnProperty.call(defaults, k)) out[k] = (p[k] != null ? p[k] : defaults[k]); }
    return out;
  }

  function chipLabel(full, bt) {
    if (TITLE_KO[bt]) return TITLE_KO[bt];
    var i;
    for (i = 0; i < full.nodes.length; i++) { if (full.nodes[i].blockType === bt) return full.nodes[i].title || bt; }
    return bt;
  }

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
  function paintChart(cv, wrap, an, data, sym) {
    var ctx = cv.getContext("2d");
    var col = colTokens();
    var cssW = wrap.clientWidth || 320;
    var lay = null;

    function relayout() {
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(CHART_H * dpr);
      cv.style.height = CHART_H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // DPR 트랜스폼 — 리사이즈 시점에만 설정
      lay = MSChartLayout.chartLayout({
        candle: data.candle, prediction: an.out.prediction,
        width: cssW, height: CHART_H, pad: PAD, tailBars: TAIL_BARS
      });
    }
    relayout();

    var dataOf = { volume: an.va, rsi: an.rsi, macd: an.macd };

    function frame(hoverFi) {
      ctx.clearRect(0, 0, cssW, CHART_H);
      MSLayers.resetLabels(cssW, CHART_H);              // 매 프레임 맨 앞 — 이 뒤에 등록되는 라벨만 서로를 본다.
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

    // 회전 대응. 리스너는 화면당(모듈 전체 기준) 최대 1개만 살아있어야 한다 —
    // draw()가 재실행되거나(재시도/재방문) 다른 종목으로 넘어갈 때마다 이전 리스너를 먼저 떼어낸다.
    // window resize는 next resize event가 와야 감지되므로, 그때까지 기다리지 않고 여기서 즉시 정리한다.
    if (activeResizeCleanup) { activeResizeCleanup(); activeResizeCleanup = null; }
    function onResize() {
      var w2 = wrap.clientWidth || cssW;
      if (w2 === cssW) return;
      cssW = w2;
      relayout();
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
        errInfo = { message: (err && err.message) || "알 수 없는 오류로 불러오지 못했습니다.", retry: !isBarsShort(err) };
        draw();
      });
    }
    function finishData() {
      try {
        an = analyzeFull(data);
        state = "ready";
      } catch (e) {
        state = "error";
        errInfo = { message: "분석 중 오류가 발생했습니다: " + ((e && e.message) || e), retry: true };
      }
      draw();
    }
    function retry() { if (data) finishData(); else startLoad(); }

    function buildHead() {
      var head = MSUi.el("div", "rp-head");
      var back = MSUi.el("button", "rp-back");
      back.setAttribute("aria-label", "뒤로");
      back.innerHTML = backSvg();
      back.addEventListener("click", function () { MSApp.go("watchlist"); });
      head.appendChild(back);

      var idWrap = MSUi.el("div", "rp-head-id");
      idWrap.appendChild(MSUi.el("div", "rp-head-sym", sym));
      idWrap.appendChild(MSUi.el("div", "rp-head-name", (wlItem && wlItem.name) || ""));
      head.appendChild(idWrap);

      if (idx >= 0) head.appendChild(MSUi.el("div", "rp-head-pos", (idx + 1) + " / " + wl.length));
      return head;
    }

    function buildTierRow() {
      var row = MSUi.el("div", "rp-tier-row");
      row.appendChild(MSUi.el("span", "rp-tier", "BASIC"));
      row.appendChild(MSUi.el("span", "rp-tier-desc", "5 indicators"));
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
      wrap.appendChild(MSUi.el("div", "rp-err-title", "리포트를 불러오지 못했습니다"));
      wrap.appendChild(MSUi.el("div", null, info.message));
      if (info.retry) {
        var b = MSUi.el("button", "btn btn-ghost", "다시 시도");
        b.style.marginTop = "14px";
        b.addEventListener("click", retry);
        wrap.appendChild(b);
      }
      return wrap;
    }

    function buildVerdict() {
      var v = an.out.verdict;
      var wrap = MSUi.el("div", "rp-verdict-wrap");
      var dirWord = v.regime === "bull" ? "상승" : v.regime === "bear" ? "하락" : "중립";
      var dirCls = v.regime === "bull" ? "bull" : v.regime === "bear" ? "bear" : "neutral";
      wrap.appendChild(MSUi.el("div", "rp-verdict " + dirCls, dirWord));

      var total = v.confluence.total, agree = v.confluence.agree;
      var confText = total ? ("지표 " + total + "개 중 " + agree + "개가 이 방향에 동의") : "방향을 내는 지표가 없어 일치도를 낼 수 없습니다";
      wrap.appendChild(MSUi.el("div", "rp-conf", confText));

      var pr = an.out.prediction, last = pr.lo.length - 1;
      var rangeText = (last >= 0)
        ? ("정직한 범위 · " + pr.futW + "봉 후 " + MSUi.fmtPrice(pr.lo[last]) + " ~ " + MSUi.fmtPrice(pr.hi[last]))
        : "정직한 범위 산출 불가";
      wrap.appendChild(MSUi.el("div", "rp-range", rangeText));

      wrap.appendChild(MSUi.el("div", "rp-missing",
        "이 판정에 반영되지 않은 지표 " + notCountedLabels().length + "개 — 아래 Not counted 참고"));
      return wrap;
    }

    function buildChartSection() {
      var wrap = MSUi.el("div", "rp-chart");
      var cv = document.createElement("canvas");
      wrap.appendChild(cv);
      chartRefs = { wrap: wrap, cv: cv };
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
        row.appendChild(document.createTextNode(item.label + (locked ? " · 잠김" : "")));
        wrap.appendChild(row);
      });
      return wrap;
    }

    function buildCounted() {
      var sec = MSUi.el("div", "rp-sec");
      var title = MSUi.el("div", "rp-sec-title");
      title.appendChild(document.createTextNode("Counted "));
      title.appendChild(MSUi.el("span", "rp-sec-count", "5"));
      sec.appendChild(title);

      var maLine = ForgeCore.maSteps(an.ma, an.maP.len)[1];
      var rsiLine = ForgeCore.rsiSteps(an.rsi)[0];
      var bbLine = ForgeCore.bollingerSteps(an.bb, an.bbP.len, an.bbP.k)[1];
      var macdLine = ForgeCore.macdSteps(an.macd, an.mcP.fast, an.mcP.slow, an.mcP.signal)[1];
      var volLine = ForgeCore.volumeSteps(an.va)[0];

      [["이동평균(MA)", maLine], ["MACD", macdLine], ["RSI", rsiLine], ["볼린저", bbLine], ["거래량", volLine]]
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
      title.appendChild(document.createTextNode("Not counted "));
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
        lock.innerHTML = lockSvg() + "잠김";
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
      sec.appendChild(MSUi.el("div", "rp-sec-title", "주기"));
      var dailyVal = "";
      if (state === "ready") {
        var v = an.out.verdict;
        var dirWord = v.regime === "bull" ? "상승" : v.regime === "bear" ? "하락" : "중립";
        dailyVal = v.confluence.total ? (dirWord + " · " + v.confluence.agree + "/" + v.confluence.total + " 동의") : dirWord;
      } else if (state === "error") {
        dailyVal = "—";
      }
      sec.appendChild(tfRow("일간", dailyVal, false, state === "loading"));
      sec.appendChild(tfRow("주간", "", true, false));
      sec.appendChild(tfRow("월간", "", true, false));
      return sec;
    }

    function buildCta() {
      var b = MSUi.el("button", "rp-cta", "곧 제공");
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
        scr.appendChild(skeletonBlock(CHART_H)); // 차트
        scr.appendChild(skeletonBlock(180));   // Counted
      } else {
        scr.appendChild(buildVerdict());
        scr.appendChild(buildChartSection());
        scr.appendChild(buildChartLegend());
        scr.appendChild(buildCounted());
      }

      scr.appendChild(buildNotCountedSection());   // 종목 데이터 무관 — 항상 렌더
      scr.appendChild(buildTfSection());
      scr.appendChild(buildCta());

      root.appendChild(scr);   // 여기서부터 라이브 DOM — clientWidth 측정 가능

      if (state === "ready" && chartRefs) paintChart(chartRefs.cv, chartRefs.wrap, an, data, sym);
    }

    startLoad();
  }

  window.MSReport = { render: render };
})();
