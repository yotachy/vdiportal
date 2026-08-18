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
  // P0(태스크 4) 현황: 첫 인자(dual)는 지금 항상 false 다 — 아무도 body.ms-dual 을 세우지
  // 않는다(셸이 단일 열만 그린다). P5 에서 2단이 되살아나면 다시 true 가 될 수 있다.
  function chartH(tier) { return MSLayout.chartHeight(document.body.classList.contains("ms-dual"), window.innerHeight, tier); }

  // 오버레이 이름 → 그리기 함수. **이 표가 유일한 호출 경로다** — 여기 없는 이름은 안 그려지고,
  // 여기 있는데 어느 티어에도 없는 이름은 죽은 항목이다. 관문(chart-tiers.test.mjs)이
  // CHART_TIERS 의 이름 집합과 이 표의 키를 대조한다. 예전엔 frame() 이 이 넷을 무조건
  // 불렀고, 그래서 기본분석이 심화의 오버레이를 공짜로 보여주고 있었다.
  var OVERLAY_DRAW = {
    bollinger:   function (ctx, an, Mp) { MSLayers.bollinger(ctx, an.bb, Mp); },
    ma:          function (ctx, an, Mp) { MSLayers.ma(ctx, an.ma, Mp); },
    rsiBadge:    function (ctx, an, Mp) { MSLayers.rsiBadge(ctx, an.rsi, Mp); },
    volumeBadge: function (ctx, an, Mp) { MSLayers.volumeBadge(ctx, an.va, Mp); }
    // macdBadge 는 없다 — _drawMacdLayers 는 배지뿐이라 남길 것이 없다(Phase 1 판단).
  };
  // TAIL_BARS 는 이제 줌 레벨이다. 기본은 화면폭 무관 60봉(예측 비중 28% 유지, Phase 3 결론) — MSZoom.DEFAULT_TAIL.
  var HOLD_MS = 350, MOVE_THRESH = 8;

  // 잔량 부족 광고 권유 뒤의 폴링(Phase 8d) — screens/wallet.js 의 AD_POLL_MS/AD_POLL_LIMIT 와
  // 같은 값·같은 이름을 그대로 옮겼다. SSV 왕복 예산(왜 2초·왜 5회)의 근거는 그쪽에 있다 —
  // 여기서 다시 적지 않는다. 값을 조정할 땐 두 파일을 함께 바꿀 것(리뷰 Important 지적:
  // 이름 없는 매그넘버로 각자 들고 있으면 한쪽만 재조정되고 조용히 어긋난다).
  var AD_POLL_MS = 2000, AD_POLL_LIMIT = 5;   // 2초 × 5 = 10초

  // 티어는 셋이다(basic · full · custom). 이 파일이 오래 티어를 **둘로** 알고 `tier === "full"`
  // 이항 분기를 여섯 곳에 흩어놨던 것이 리뷰가 잡은 결함 다섯의 공통 뿌리다 — custom 이 전부
  // basic 가지로 떨어져, 5스쿱 낸 전문분석이 3스쿱 심화보다 **적은** 블록을 "기본" 배지와
  // 함께 냈다. 문자열 비교라 예외가 안 나고, 관문 666건이 전부 초록인 채로 통과했다.
  // 그래서 티어를 직접 비교하지 말고 **무엇을 묻는지**로 갈라 쓴다.
  function isPaid(t) { return t === "full" || t === "custom"; }   // 지표 전량을 읽은 분석인가

  // 선언(report-blocks.js)엔 있는데 아직 그리는 함수가 없는 블록 id → 어느 페이즈가 짓는가.
  // **못 그리는 것을 팔지 않는다**(리뷰 판정, 2026-08-18) — 이 표가 비어 있지 않은 티어는
  // tier-sheet.js 가 구매를 막는다(아래 pendingOf/tierBuyable, MSTierSheet.open 의 locked).
  // 모듈 스코프에 두는 이유는 draw() 의 BUILD 표(스킵용)와 시트를 여는 두 자리(buildCta·
  // afterCtaAd) 셋이 **같은 한 벌**을 봐야 하기 때문이다 — 복제하면 한 곳만 고쳐 갈라진다.
  // 관문(report-blocks.test.mjs)이 forTier() 가 선언한 모든 id 가 draw() 의 BUILD 나 여기
  // 둘 중 하나엔 반드시 있는지를 강제한다.
  // 값은 true 하나뿐이다(페이즈 이름을 문자열로 안 넣는다) — strings.test.mjs 의
  // "screens/ 에 남은 영어가 없다" 관문이 화면 리터럴을 훑는데, "P1a Task 3"/"P1b" 같은
  // 코드도 라틴 단어로 잡힌다(사용자가 볼 문구가 아닌데도 그 관문은 구분을 못 한다).
  // 그래서 페이즈는 각 줄 주석에 적고, 표 자체는 "이 id 가 아직 없다"는 사실만 담는다.
  var PENDING = {
    comb:     true,   // 기본분석 지표 빗(스틸5+연한골드27) — P1a Task 3(다음 태스크)
    sentence: true,   // 19b 「한 문장으로」 — P1b(심화 리포트 재작성, 19b·18b)
    forecast: true,   // "내일 예상 + 확신" — P1b. 지금은 verdict 카드에 확신·적중률이
                       // 섞여 있어(buildVerdict) 억지로 잇지 않았다(리뷰 지시 §4)
    hitrate:  true,   // 적중률 단독 블록 — P1b. 위와 같은 이유로 verdict 카드에서 분리해야
                       // 하는데, 지금 억지로 자르면 forecast 와 내용이 겹치거나 반씩
                       // 잘려 나간다
    compare:  true    // 심화 안의 "직전 상태(기본분석 대비)" 대조 — P1b. 내용 자체는 이미
                       // 있다(buildHorizons() 안의 prevBasic() 블록, 시안이 회색 막대로
                       // horizons 카드에 얹으라고 한 그대로) — 그래서 compare:buildHorizons
                       // 로 잇지 않는다. 그러면 horizons 와 compare 가 같은 카드를 두 번
                       // 그린다(중복). 독립 카드로 뽑아낼지는 P1b 가 정할 화면 구조 문제다
  };
  // 그 티어의 선언 중 아직 못 그리는 id 목록. tier 인자를 받는 이유는 PENDING 이 id→페이즈
  // 표라 티어 무관이고, "이 티어에 지금 파는데 못 그리는 게 있나"는 그 티어 선언과 대조해야
  // 답할 수 있어서다.
  function pendingOf(tier) {
    return MSReportBlocks.forTier(tier).map(function (b) { return b.id; })
      .filter(function (id) { return Object.prototype.hasOwnProperty.call(PENDING, id); });
  }
  // basic 은 제외한다 — basic 은 팔지 않는다(무료 기본값), "구매 가능한가"를 묻는 질문 자체가
  // 성립하지 않는다. full·custom 만 이 질문의 대상이다.
  function tierBuyable(tier) { return tier === "basic" || pendingOf(tier).length === 0; }
  // 배지·설명·증거 세그먼트. 표로 두는 이유는 티어가 넷째로 늘 때 분기가 아니라 행이 늘게
  // 하려는 것이다(시안 6a: Basic 1/3 · Full 2/3 · Custom 3/3).
  // 키 이름을 문자열로 두지 않고 값을 그대로 담는다 — 문자열 관문 둘이 그래야 볼 수 있다.
  // "rpTierCustom" 같은 리터럴은 ①화면 소스의 영어 잔존으로 걸리고 ②MSStr.t.X 참조가 아니라
  // 죽은 키 판정을 받는다. 두 관문 다 옳다: 동적 조회는 정적 분석을 눈멀게 한다.
  var TIER_BADGE = {
    basic:  { cls: "",           name: MSStr.t.rpTierBasic,  desc: MSStr.t.rpTierCount,       evi: 1 },
    full:   { cls: " is-full",   name: MSStr.t.rpTierFull,   desc: MSStr.t.rpTierCountFull,   evi: 2 },
    custom: { cls: " is-custom", name: MSStr.t.rpTierCustom, desc: MSStr.t.rpTierCountCustom, evi: 3 }
  };

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
  var purchases = {};             // "sym|runType" -> { idem, promise, data, an, runs }

  // 8a 직전 상태 대조의 재료 — 심화로 올라가기 **전에** 기본분석이 낸 값을 남긴다.
  // 모듈 스코프인 이유는 purchases 와 같다: 화면 수명보다 오래 살아야 한다(뒤로 갔다 와도
  // 대조가 유지되어야 하고, 새 render() 는 새 클로저를 만든다).
  //
  // 규칙 둘(사용자 결정 2026-08-17):
  //  G1. 직전 값이 없으면 대조 행을 **통째로 생략**한다 — "—"나 추정치로 채우지 않는다.
  //      기본을 건너뛰고 심화로 직행하거나 캐시가 없으면 대조할 값이 없다. 대조는 있으면
  //      강력한 근거지 없으면 안 되는 골격이 아니다.
  //  G2. **같은 종목·같은 기준일(asOf)** 의 것만 쓴다. 어제 값과 오늘 값을 나란히 놓으면
  //      하루 차이가 티어 차이로 읽힌다.
  var basicSnap = {};             // sym -> { asOf, lo, hi, width }

  // 기준일 = 마지막 봉의 날짜. 종목·주기가 같아도 이 값이 다르면 다른 계산이다.
  function asOfOf(d) {
    var c = d && d.candle;
    if (!c || !c.length) return null;
    var last = c[c.length - 1];
    return (last && last.t != null) ? String(last.t) : null;
  }

  // 그 중 idem 만은 실행보다 오래 살아야 한다. spend 를 보낸 뒤 응답이 유실되면 사용자는
  // 강제 종료로 빠져나오고, 다시 켠 앱의 purchases 는 비어 있어 새 idem 을 뽑는다 — 서버에는
  // 무관한 키라 멱등이 못 잡는다. full 은 서버 권리(24h runs) 덕에 재시도가 spend-cached 로
  // 흡수되지만 그건 spend 가 실제로 커밋된 경우뿐이고, 커밋 직전에 끊긴 경우는 그냥 두 번
  // 나간다. 종목별로 저장한다(스캔은 워치리스트 전체 단위라 watchlist.js 쪽은 키가 하나다).
  // 키는 (종목, 등급) 쌍이다. 등급을 안 넣으면 심화 재시도용 idem 을 전문 구매가 물려받는데,
  // 서버는 같은 idem 에 다른 runType 이 오면 재시도가 아니라 **값싼 등급 값을 내고 비싼 등급을
  // 받아가려는 시도**로 보고 bad-idem 을 낸다(wallet-lib.php w_spend 의 재생 조건). 전문분석이
  // 생기면서 처음으로 한 종목에 두 등급이 공존하게 됐다.
  var K_PEND_FULL = "ms_pending_full_idem";   // { "sym|runType": idem }
  function pendKey(sym, runType) { return sym + "|" + runType; }
  function pendingFullIdem(sym, runType) {
    var m = MSStore.read0(K_PEND_FULL, null);
    var v = (m && typeof m === "object" && !(m instanceof Array)) ? m[pendKey(sym, runType)] : null;
    return (typeof v === "string" && v) ? v : null;
  }
  function setPendingFullIdem(sym, runType, idem) {
    var m = MSStore.read0(K_PEND_FULL, null);
    if (!m || typeof m !== "object" || (m instanceof Array)) m = {};
    if (idem) m[pendKey(sym, runType)] = idem; else delete m[pendKey(sym, runType)];
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
  // weights 가 있으면 전문분석 그래프다 — 지표 30종 중 선택한 것만 남고 배율이 실린다.
  // 배율은 **두 경로로 함께** 간다: node.weight(combine) 와 opts.driftWeights(방향 드리프트).
  // 한쪽만 넘기면 반대 개수만 바뀌고 예측선은 그대로인 화면이 된다(graph.js 주석 참고).
  function analyzeFull(data, useFull, tf, weights) {
    var graph = weights ? MSGraph.customGraph(ForgeCore, weights)
              : useFull ? MSGraph.full32Graph(ForgeCore) : MSGraph.basicGraph(ForgeCore);
    var vol = data.candle.map(function (c) { return c.v; });
    var okVol = vol.length >= 2 && vol.every(function (v) { return typeof v === "number" && isFinite(v); });
    MSGraph.setVolume(graph, okVol ? vol : null);
    var d = { price: data.price, candle: data.candle };
    if (okVol) d.volume = vol;
    var runOpts = { timeframe: MSReportModel.tfKo(tf || TF) };
    if (weights) runOpts.driftWeights = MSGraph.driftWeightsOf(graph, weights);
    var out = ForgeCore.run(graph, d, runOpts);

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
    var spec = MSChartDraw.specOf(tier);
    var chartHpx = chartH(tier);      // relayout 마다 다시 읽는다 — 회전·폴드 전환을 따라간다
    var tail = MSZoom.DEFAULT_TAIL;   // 화면 유지 중에만 산다. 종목을 바꾸면 paintChart 가 다시 불려 기본값으로 돌아간다.

    function relayout() {
      chartHpx = chartH(tier);
      MSUi.fitCanvas(cv, ctx, cssW, chartHpx);   // DPR 트랜스폼 — 온보딩 차트와 한 벌(ui.js)
      // 한계가 plotW 에 딸려 있다 — 폴드를 펴면 커버에서 쓰던 봉 수가 새 하한 밖일 수 있다.
      // (커버 20봉 → 펼침 하한 44봉). 폴드는 두 화면을 상시로 오가므로 예외가 아니라 일상 경로다.
      var fut = (an.out.prediction && an.out.prediction.path) ? an.out.prediction.path.length : 0;
      tail = MSZoom.clamp(MSChartLayout.plotWidth(cssW, PAD), fut, tail);
      lay = MSChartLayout.chartLayout({
        candle: data.candle, prediction: an.out.prediction,
        width: cssW, height: chartHpx, pad: PAD, tailBars: tail,
        panels: spec.panels                      // 기본은 가격 하나 — 서브패널 3종이 아예 안 생긴다
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
      // 가격 표현은 티어가 정한다. 기본의 종가 선은 '덜 그린 캔들'이 아니라 다른 표현이다.
      if (spec.price === "candle") MSChartDraw.drawCandles(ctx, lay, data.candle, col);
      else MSChartDraw.drawCloseLine(ctx, lay, data.candle, col);
      MSChartDraw.drawCone(ctx, lay, an.out.prediction, col, tier, { sym: sym, tf: TF });
      var Mp = Object.assign({}, lay.panels.price.M, { badges: false });
      spec.overlays.forEach(function (name) {
        var fn = OVERLAY_DRAW[name];
        if (fn) fn(ctx, an, Mp);
      });
      spec.panels.forEach(function (k) {
        if (k === "price") return;               // 가격 패널은 위에서 이미 그렸다
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
      var w2 = wrap.clientWidth || cssW, h2 = chartH(tier);
      if (w2 === cssW && h2 === chartHpx) return;
      cssW = w2;
      relayout();   // 재클램프는 relayout() 안에서 이미 일어난다 — 폴드 회전(커버 20봉 → 펼침 하한 44봉)에도 별도 처리 불필요
      frame(null);
    }
    window.addEventListener("resize", onResize);
    activeResizeCleanup = function () { window.removeEventListener("resize", onResize); };
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
  // runType ∈ "full" | "custom". weights 는 custom 일 때만 의미가 있다.
  function purchaseRun(sym, runType, weights) {
    var pk = pendKey(sym, runType);
    var rec = purchases[pk];
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
    var idem = (rec && rec.idem) ? rec.idem : (pendingFullIdem(sym, runType) || MSWallet.newIdem());
    rec = { idem: idem, promise: null, data: null, an: null, runs: null };
    purchases[pk] = rec;   // spend 를 부르기 전에 등록한다 — 그 사이 들어온 두 번째 호출이 붙을 자리다
    setPendingFullIdem(sym, runType, idem);   // 보내기 전에 적는다 — 응답이 유실된 창을 덮는 건 이 순서뿐이다

    rec.promise = MSWallet.spend(runType, idem, sym).then(function (sp) {
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
            var a = analyzeFull(L.data, true, L.tf, weights);
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
        rec.data = r.data; rec.an = r.an; rec.runs = r.runs; rec.weights = weights || null;
        setPendingFullIdem(sym, runType, null);   // 확정 성공 — 이 키는 끝났다
      } else if (r.kind === "unknown" || (r.kind === "spend-fail" && MSWallet.maybeCharged(r.reason))) {
        // 정말로 차감됐는지 모른다 — idem 을 지우지 않는다(rec 를 purchases[sym] 에 그대로 두고
        // 저장소에도 남긴다). 다음 purchaseFull(sym) 이 — 이번 실행이든 다음 실행이든 —
        // 이 idem 을 재사용해 서버 멱등이 잡게 한다.
      } else if (purchases[pk] === rec) {
        delete purchases[pk];            // 확실히 실패·환급됐다 — 다시 살 수 있어야 한다
        setPendingFullIdem(sym, runType, null);
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

    // 이 세션에서 이미 산 것이 있으면 그 레코드가 화면의 출발점이다 — 재과금 없이 복원한다.
    // 전문이 심화보다 우선한다: 둘 다 샀는데 심화로 복원하면 5스쿱 낸 결과를 잃는다.
    var boughtCustom = (purchases[pendKey(sym, "custom")] && purchases[pendKey(sym, "custom")].an)
      ? purchases[pendKey(sym, "custom")] : null;
    var boughtFull = (purchases[pendKey(sym, "full")] && purchases[pendKey(sym, "full")].an)
      ? purchases[pendKey(sym, "full")] : null;
    var bought = boughtCustom || boughtFull;
    var state = "loading", errInfo = null, data = null, an = null, chartRefs = null;
    var tier = boughtCustom ? "custom" : boughtFull ? "full" : "basic";
    var myWeights = boughtCustom ? boughtCustom.weights : null;
    var tfRuns = bought ? bought.runs : null;   // [{tf, out, error}] — Full 이 채운다
    // 재진입·이중 과금 가드는 purchases 레코드가 한다(모듈 스코프) — 여기 지역 플래그를 또 두지 않는다.

    // 잔량 부족 광고 권유(Phase 8d). adBusy 는 연타 방지 — CTA 를 눌러 잔량이 부족한 것을
    // 이미 확인한 render() 안에서 광고는 한 번에 하나만 돈다(wallet.js 의 adBusy 와 같은 역할).
    var adBusy = false;
    var scrRef = null;   // 현재 그려져 있는 스크롤 컨테이너(draw 가 채운다)
    // 19a(분석 진행 중계)가 읽어 둔 지표 행. 있으면 draw() 는 다시 읽지 않는다 — 중계가
    // 보여준 값과 리포트가 쓰는 값이 **같은 계산**이어야 한다. 다시 읽으면 두 벌이 되고,
    // analyzeX 가 30여 회 더 도는 비용은 사용자가 기다리는 시간이다.
    var narratedRows = null;

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
        // 예외 메시지를 그대로 화면에 걸지 않는다. 우리 것은 "봉이 모자란다" 하나뿐이고
        // 나머지는 전부 내부 진단이거나 브라우저 문구다 — 실제로 네트워크가 끊겼을 때
        // "Failed to fetch" 가 한국어 앱에 영어로 떴다(헤드리스 스크린샷에서 발견).
        // 문자열 관문은 이걸 볼 수 없다: 우리 소스의 리터럴이 아니라 런타임이 만든 값이다.
        // 진단은 콘솔로 남기고 화면엔 번역된 문구를 낸다.
        var barsShort = isBarsShort(err);
        if (!barsShort && err && err.message && typeof console !== "undefined" && console.warn)
          console.warn("[report] load failed:", err.message);
        errInfo = { message: barsShort ? err.message : MSStr.t.rpUnknownErr, retry: !barsShort };
        draw();
      });
    }
    function finishData() {
      // Full 분석이 Basic 분석보다 우선한다 — 한 곳에서만 판정한다. 이 가드가 없으면 늦게 끝난
      // 기본 로드(또는 에러 화면의 retry)가 방금 산 32지표 결과를 5지표로 덮어 배지만 FULL 인
      // 화면이 된다. 구매 도중 재렌더돼 로드와 구매가 함께 도는 경로에서 실제로 겹친다.
      settlePending();   // 새 봉이 왔다면 어제 말한 것을 지금 판정한다
      if (isPaid(tier) && an) { state = "ready"; draw(); return; }
      try {
        an = analyzeFull(data);
        // 기본 티어의 '내일' 범위를 남긴다 — 심화를 사면 이 값이 대조 행이 된다.
        // 여기서만 적는다: 심화 분석 결과로 덮어쓰면 대조가 자기 자신과의 비교가 된다.
        if (tier === "basic") snapBasic();
        state = "ready";
      } catch (e) {
        state = "error";
        // 분석 예외도 같다 — 엔진 내부 문구가 영어로 새 나가지 않게 한다.
        if (e && typeof console !== "undefined" && console.warn) console.warn("[report] analyze failed:", e);
        errInfo = { message: MSStr.t.rpAnalyzeErr, retry: true };
      }
      draw();
    }
    function retry() { if (data) finishData(); else startLoad(); }

    function snapBasic() {
      var pr = an && an.out && an.out.prediction;
      if (!pr || !pr.lo || !pr.hi || !pr.lo.length) return;
      var asOf = asOfOf(data);
      if (!asOf) return;                       // 기준일을 모르면 G2 를 지킬 수 없다 — 안 적는다
      basicSnap[sym] = { asOf: asOf, lo: pr.lo[0], hi: pr.hi[0], width: pr.hi[0] - pr.lo[0] };
    }

    // 지난 판정 되돌아보기(시안 21a). 이 종목에서 값을 치른 적이 있고 그것이 **오늘보다
    // 앞선 기준일**이면, 그때 뭐라고 했는지와 그래서 어떻게 됐는지를 오늘 값 위에 놓는다.
    //
    // 21a 원문은 "그때 그대로이며 다시 계산하지 않았습니다"라고 지난 화면을 통째로 보존하지만,
    // 우리는 다시 열 때 오늘 데이터로 새로 그린다(서버 entitlement 덕에 재과금은 없다).
    // 그래서 보존하는 대신 **두 시점을 명시적으로 갈라 보여준다** — 지난 값을 흐리게 두고
    // 기준일을 함께 적는다. 안 그러면 어제 값과 오늘 값이 같은 화면에서 구분 없이 읽힌다.
    function buildLast() {
      if (typeof MSPredLog === "undefined" || !MSStore.getPreds) return null;
      var today = asOfOf(data);
      var best = null;
      MSStore.getPreds().forEach(function (r) {
        if (!r || r.sym !== sym) return;
        if (today && r.asOf >= today) return;          // 오늘 것은 "지난" 판정이 아니다
        if (!best || r.asOf > best.asOf) best = r;
      });
      if (!best) return null;

      var w = MSUi.el("div", "rp-last");
      w.appendChild(MSUi.el("div", "overline", MSStr.t.rpLastHead + best.asOf));
      var row = MSUi.el("div", "rp-last-row");
      row.appendChild(MSUi.el("span", "rp-last-v",
        MSUi.fmtPrice(best.mid) + MSStr.t.rpLastPm + MSUi.fmtPrice((best.hi - best.lo) / 2)));
      // 판정됐으면 결과를, 아직이면 아직이라고. 없는 결과를 있다고 하지 않는다.
      if (best.judgedOn) {
        row.appendChild(MSUi.el("span", "rp-last-r" + (best.hit ? " is-hit" : " is-miss"),
          MSStr.t.rpLastActual + MSUi.fmtPrice(best.actual) +
          (best.hit ? MSStr.t.rpLastHit : (MSStr.t.rpLastSep + MSUi.fmtPrice(best.miss) + MSStr.t.rpLastMiss))));
      } else {
        row.appendChild(MSUi.el("span", "rp-last-r", MSStr.t.rpLastPending));
      }
      w.appendChild(row);
      if (best.judgedOn) {
        var more = MSUi.el("button", "rp-last-more", MSStr.t.rpLastMore);
        more.addEventListener("click", function () {
          MSStore.markPredSeen(best.sym, best.asOf);
          MSApp.go("result", { sym: best.sym, asOf: best.asOf });
        });
        w.appendChild(more);
      }
      // 재열람은 무료다(서버 entitlement). 안 적으면 다시 열기가 과금될까 봐 안 열어본다.
      w.appendChild(MSUi.el("p", "rp-last-free", MSStr.t.rpLastFree));
      return w;
    }

    // 오늘 무엇을 말했는지 적어둔다(핸드오프 README §B "5번이 1번을 만든다"). 값을 치른
    // 분석에서만 적는다 — 기본분석은 무료로 아무 때나 열리므로, 그것까지 적으면 기록이
    // "사용자가 산 판정"이 아니라 "화면을 연 횟수"가 된다.
    //
    // 판정에 쓸 값을 **그때 그대로** 남긴다. 내일 다시 계산하면 오늘 데이터로 어제 말을
    // 고치게 된다. 같은 시점 기본분석의 범위(basicSnap)도 함께 남긴다 — 빗나간 날
    // "기본분석이었다면 적중이었습니다"(시안 14b)를 말하려면 그때의 기본 범위가 필요하고,
    // 없으면 그 문장을 아예 안 쓴다.
    function recordPrediction() {
      if (typeof MSPredLog === "undefined" || !MSStore.addPred) return;
      var pr = an && an.out && an.out.prediction;
      var asOf = asOfOf(data);
      if (!pr || !pr.lo || !pr.lo.length || !asOf) return;
      var snap = basicSnap[sym];
      var sameDay = snap && snap.asOf === asOf;
      var closes = (data && data.candle) || [];
      var last = closes.length ? closes[closes.length - 1] : null;
      var r = MSPredLog.make({
        sym: sym, name: wlItem && wlItem.name, tier: tier,
        at: new Date().toISOString(), asOf: asOf,
        base: last && last.c, mid: pr.path && pr.path[0], lo: pr.lo[0], hi: pr.hi[0],
        basicLo: sameDay ? snap.lo : null, basicHi: sameDay ? snap.hi : null,
        engineVersion: (typeof ForgeCore !== "undefined") ? ForgeCore.version : null
      });
      if (r) MSStore.addPred(r);
    }

    // 이 종목의 데이터를 방금 받았다 — 대기 중인 어제 예측이 있으면 지금 판정한다.
    // 판정은 새 봉이 있어야만 성립하고(predictions.js), 한 번 적으면 다시 재지 않는다.
    function settlePending() {
      if (typeof MSPredLog === "undefined" || !MSStore.getPreds || !data || !data.candle) return;
      MSPredLog.pending(MSStore.getPreds()).forEach(function (r) {
        if (r.sym !== sym) return;
        var j = MSPredLog.judge(r, data.candle);
        if (j) MSStore.settlePred(r.sym, r.asOf, j);
      });
    }

    // G1·G2 를 함께 판정한다. 쓸 수 없으면 null — 호출부가 행을 통째로 생략한다.
    function prevBasic() {
      if (tier === "basic") return null;       // 대조는 심화 이상에서만 의미가 있다
      var snap = basicSnap[sym];
      if (!snap) return null;                                    // G1
      if (!isFinite(snap.lo) || !isFinite(snap.hi)) return null;  // G1
      if (snap.asOf !== asOfOf(data)) return null;                // G2
      return snap;
    }

    function buildHead() {
      var head = MSUi.el("div", "rp-head");
      var back = MSUi.el("button", "rp-back");
      back.setAttribute("aria-label", MSStr.t.rpBack);
      back.innerHTML = MSUi.backIcon();
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
      var b = TIER_BADGE[tier] || TIER_BADGE.basic;
      row.appendChild(MSUi.el("span", "rp-tier" + b.cls, b.name));
      row.appendChild(MSUi.el("span", "rp-tier-desc", b.desc));
      var evi = MSUi.el("span", "rp-evi");
      var on = b.evi;
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
      // 타이포는 **글자 요소**가 갖는다(.rp-verdict-word). 예전엔 flex 컨테이너(.rp-verdict)가
      // 헤드라인 자간(−0.05em)을 들고 있었는데, em 자간은 자식에게 **절대 px 로 상속**된다 —
      // 44px 기준 −2.2px 가 11.5px 짜리 집계 문구에 그대로 실려 글자가 서로 겹쳤다(헤드리스
      // 스크린샷에서 발견). 컨테이너에 타이포를 얹으면 그 안의 모든 작은 글자가 인질이 된다.
      head.appendChild(MSUi.el("span", "rp-verdict-word", verdictWord(v.regime)));
      if (conf != null) head.appendChild(MSUi.el("span", "rp-conf-pct", conf + "%"));
      // 시안 2a 의 "17 up · 6 flat · 9 down" + 3구간 바. 방향 개수는 레전드 행의 tone 에서 센다 —
      // 판정에 실제로 쓰인 지표들이라 다른 출처를 새로 만들지 않는다.
      // 집계는 그 티어가 실제로 읽은 지표를 센다. Full 인데 5지표만 세면 바로 아래 "4 of 32" 와
      // 숫자가 어긋나 같은 화면이 두 말을 한다. 방향 경로는 반대 근거와 동일(MSIndicators).
      var tally;
      if (isPaid(tier) && indRows) {
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
      // 베이스라인이 없으면 적중 행을 통째로 감춘다(P2 §2 R2). 비교 대상 없는 적중률은
      // "동전보다 낫다"로 읽히므로, 숫자만 남기는 것보다 안 보이는 편이 정직하다.
      // 옛 생성물(baselineAlwaysUp 이 없던 backtest-summary.js)로도 화면이 성립해야 한다.
      if (hit && hit.baseline == null) hit = null;
      if (hit) {
        // 방향을 먼저 밝힌다 — 불 61.5/38.5 · 베어 42.6/57.4 로 갈리므로 어느 쪽 수치인지가
        // 숫자 자체만큼 중요하다.
        var lead = (v.regime === "bull") ? MSStr.t.rpHitLeadBull : MSStr.t.rpHitLeadBear;
        wrap.appendChild(MSUi.el("div", "rp-hit",
          lead + hit.right + MSStr.t.rpHitRight + hit.wrong + MSStr.t.rpHitWrong));
        // 베이스라인은 적중률 **바로 아래**다 — 범위 고지보다 위. 두 숫자가 떨어져 있으면
        // 사용자가 위 숫자만 읽고 스크롤한다.
        wrap.appendChild(MSUi.el("div", "rp-hit-base",
          MSStr.t.rpHitBaseA + hit.baseline + MSStr.t.rpHitBaseB));
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
      // 8a 직전 상태 대조 — 심화가 판 것을 화면에서 보이게 하는 유일한 장치다. 티어 실측이
      // 말하는 것은 "방향을 더 맞힌다"가 아니라 "폭이 정직해진다"인데, 대조 없이 심화 값만
      // 단독으로 놓으면 사용자는 그 정직해짐을 볼 방법이 없다. 폭이 4.0 에서 ±1.1 로 좁아진
      // 것을 **직전 값 옆에서** 봐야 "무엇을 샀는지"가 성립한다.
      // 없으면 그냥 없다(G1) — 회색 자리에 "—" 나 추정치를 채우지 않는다.
      var prev = prevBasic();
      if (prev) {
        var cmp = MSUi.el("div", "rp-hz-prev");
        cmp.appendChild(MSUi.el("span", "rp-hz-prev-k", MSStr.t.rpPrevBasic));
        cmp.appendChild(MSUi.el("span", "rp-hz-prev-v",
          MSUi.fmtPrice(prev.lo) + MSStr.t.rpRangeDash + MSUi.fmtPrice(prev.hi)));
        cmp.appendChild(MSUi.el("span", "rp-hz-prev-w",
          MSStr.t.rpWidthA + prev.width.toFixed(1)));
        sec.appendChild(cmp);
      }
      // 기본분석은 **내일만** 답한다(시안 18a). 1주·1개월은 심화가 파는 것 중 하나다 —
      // 세 줄을 다 보여주면 3단 비교표의 "기간별"이 무료가 된다.
      if (tier === "basic") rows = rows.slice(0, 1);
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
      // 이 문장이 기본분석의 판매 논리 그 자체다 — 범위는 정확히 답하되 그 이상은 말하지
      // 않는다. 빼면 "왜 확률이 없지"가 되고, 심화가 무엇을 파는지도 흐려진다.
      if (tier === "basic") sec.appendChild(MSUi.el("div", "rp-hz-note", MSStr.t.rpBasicRangeNote));
      else {
        // 19b 문안(D3) — 기간이 서로 다른 말을 할 때만. 숫자만 적으면 사용자는 헤드라인
        // 방향을 모든 기간의 답으로 읽는다. 방향이 같거나 한쪽이 무방향이면 이 줄은 없다
        // (없는 대립을 문장으로 만들지 않는다).
        var d1 = rows[0], mN = rows[rows.length - 1];
        if (d1 && mN && d1 !== mN && d1.dir !== "flat" && mN.dir !== "flat" && d1.dir !== mN.dir) {
          sec.appendChild(MSUi.el("div", "rp-hz-note",
            MSStr.t.rpHzMixedA + (d1.dir === "up" ? MSStr.t.rpHzMixedUp : MSStr.t.rpHzMixedDown) +
            MSStr.t.rpHzMixedB));
        }
      }
      return sec;
    }

    function buildChartSection() {
      var wrap = MSUi.el("div", "rp-chart");
      var cv = document.createElement("canvas");
      wrap.appendChild(cv);
      // 크로스헤어 값 표시는 **차트존의 일부**다 — 예전엔 SIGNALS 섹션이 이 자리를 들고 있어서
      // 그 섹션을 빼는 순간 값 표시가 함께 사라졌다. 차트에 딸린 것을 차트가 갖는다.
      //
      // 단 **기본 티어에는 없다.** 시안 18a 는 블록 3개(판정·차트·범위)이고 지표 판독은
      // 심화가 파는 것이다. T7 에서 레전드를 차트 안으로 옮기면서 기본에도 딸려 들어가,
      // 5지표 판독 7행이 무료 화면에 그대로 떴다(헤드리스 스크린샷에서 발견) — 3단 비교표의
      // "차트 위 표식: 없음"과 정면으로 어긋난다.
      // 티어 사양은 여기서 다시 읽는다 — paintChart 의 지역 변수 spec 은 이 함수 밖이다.
      // (처음엔 그걸 그대로 참조했다가 ReferenceError 로 draw() 가 통째로 죽었고, 화면엔
      // "불러오지 못했습니다"만 떴다. 로드 실패로 위장되는 종류의 고장이라 테스트로는
      // 안 보였다 — 헤드리스 스크린샷이 잡았다.)
      var cspec = MSChartDraw.specOf(tier);
      var legend = null;
      if (cspec.legend) { legend = MSUi.el("div", "rp-lg"); wrap.appendChild(legend); }
      chartRefs = { wrap: wrap, cv: cv, legend: legend };
      return wrap;
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

    // 시안 6a 의 AGAINST THIS CALL — Full 이 3스쿱으로 주는 것 중 하나.
    // 32종을 다 돌려놓고 "다 동의한다"고만 하면 근거가 아니라 응원이다. 반대편을 이름으로 보여준다.
    // 방향은 웹과 같은 경로로 얻는다(지표마다 ForgeCore.analyzeX) — 백테스트도 새 데이터도 없다.
    function buildAgainst(indRows) {
      if (!isPaid(tier) || !an || !an.graph || !indRows) return null;
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
      if (isPaid(tier)) return null;
      return MSUi.el("p", "rp-missing-note", MSStr.t.rpMissingNote);
    }

    function tfRow(name, val, locked, skeleton) {
      var row = MSUi.el("div", "rp-tf-row" + (locked ? " rp-locked" : ""));
      row.appendChild(MSUi.el("span", "rp-tf-name", name));
      if (locked) {
        // 공용 자물쇠(MSUi.lockIcon) — 지표·종목·티어와 같은 하나(ui-marks.test.mjs 가
        // 이 파일도 스캔한다, 태스크 7 리뷰로 편입). 예전엔 여기서 24×24/rx=2 짜리를
        // 따로 그렸다 — "잠김"이 화면마다 다른 모양이면 세 가지 다른 뜻처럼 보인다.
        var lock = MSUi.el("span", "rp-lock");
        var lockIc = MSUi.el("span", "rp-lock-ic");
        lockIc.innerHTML = MSUi.lockIcon();
        lock.appendChild(lockIc);
        lock.appendChild(MSUi.el("span", null, MSStr.t.rpLocked));
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
    // runType ∈ "full" | "custom". 전문은 편집기가 준 가중치를 함께 넘긴다.
    function runTier(runType, weights) {
      purchaseRun(sym, runType, weights).then(function (r) {
        // 잔량이 움직였을 수 있다. 화면이 바뀌었어도 필은 문서에 그대로 떠 있으므로 세대 가드 밖이다.
        MSWalletScreen.refreshPills();
        // 화면이 이미 다른 것을 보고 있으면 아무것도 건드리지 않는다 —
        // 결과는 purchases[sym] 에 남아 있어 이 종목으로 돌아오면 그대로 보인다.
        if (!isCurrent()) return;
        if (r.kind === "success") {
          data = r.data; an = r.an; tfRuns = r.runs; tier = runType;
          if (runType === "custom") myWeights = weights;
          state = "ready";   // 기본 로드가 아직 안 끝났거나 실패한 상태에서 샀을 수 있다
          recordPrediction();   // 내일 확인할 결과가 하나 생긴다 — 이것이 앱의 고리다
          MSTierSheet.close();

          // 두 장면이 잇달아 나온다. 순서가 곧 사실의 순서다:
          //   19a — 지금 **하고 있는** 일(지표를 하나씩 읽는 중). 실제 analyzeX 호출에 묶이고
          //         최소 재생 시간이 없다. 캐시가 뜨거우면 한두 프레임에 끝난다.
          //   8b  — 이미 **끝난** 일(무엇이 열렸는지). 3초를 채운다.
          // 규칙이 반대라 모듈이 둘이고(인벤토리 §0 충돌 8), 순서를 바꾸면 "열렸습니다"가
          // 아직 읽지도 않은 지표를 두고 나오게 된다.
          var indInput = { price: data.price, candle: data.candle, volume: an.vol };
          var stepper = (an && an.graph)
            ? MSIndicators.readingStepper(ForgeCore, an.graph, indInput, MSIndicators.ctxFrom(indInput))
            : null;

          function revealThenDraw() {
            var conf = an.out.verdict.confluence;
            MSReveal.play({
              total: ForgeCore.indicatorCount, basic: MSGraph.BASIC.length,
              agree: conf ? conf.agree : null,
              onDone: function () { if (isCurrent()) draw(); }
            });
          }

          if (stepper && stepper.total) {
            MSAnalyzeView.play({
              stepper: stepper, basic: MSGraph.BASIC.length,
              onDone: function (rows) {
                if (!isCurrent()) return;
                narratedRows = rows;   // 리포트가 이 계산을 그대로 쓴다(두 번 읽지 않는다)
                revealThenDraw();
              }
            });
          } else revealThenDraw();
          return;
        } else if (r.kind === "refunded") {
          MSTierSheet.close();
          // 시안 12c 의 카드 ⑥·⑦. 환급을 **확인했을 때만** 돌려줬다고 말한다 — 확인 못 한
          // 것을 확인했다고 말하지 않는 것이 카드가 두 장인 유일한 이유다.
          if (r.ok) {
            MSWallet.get().then(function (w) {
              MSBlocked.open({ kind: "failedRefunded",
                data: { refunded: MSWallet.COSTS[runType], balance: w.state ? w.state.balance : null },
                onAction: function (k) { if (k === "retry") runTier(runType, weights); } });
            });
          } else {
            MSBlocked.open({ kind: "failedUnknown", data: {},
              onAction: function (k) {
                if (k === "open-wallet") MSApp.go("wallet");
                else if (k === "retry") runTier(runType, weights);
              } });
          }
        } else if (r.kind === "spend-fail") {
          MSTierSheet.close();
          // "Nothing was charged" 는 definitely-not-charged 사유에서만 참이다. maybe-charged
          // (network·server-error·busy)는 실제로 서버가 처리했을 수 있으니 그렇게 단정하지 않는다
          // — purchases[pk] 에 idem 이 남아 다음 시도가 재사용한다(위 .then 참고).
          if (r.reason === "insufficient") {
            MSWallet.get().then(function (w) {
              var have = (w.state ? w.state.balance : 0) || 0;
              MSBlocked.open({ kind: "short",
                data: { need: MSWallet.COSTS[runType], have: have },
                // 여기서 runTier 를 다시 부르면 같은 카드가 다시 뜬다 — 잔량은 그대로이므로
                // 영원히 못 빠져나오는 고리가 되고, "광고 1편 보기"가 광고를 한 번도 안 띄운다.
                // blocked.js 규칙 ②(카드는 진짜 대안 행동을 준다)를 어기는 자리였다.
                onAction: function (k) { if (k === "watch-ad") shortCardAd(have); } });
            });
          } else if (MSWallet.maybeCharged(r.reason)) {
            MSBlocked.open({ kind: "failedUnknown", data: {},
              onAction: function (k) {
                if (k === "open-wallet") MSApp.go("wallet");
                else if (k === "retry") runTier(runType, weights);
              } });
          } else alert(MSStr.t.tsSpendFailed);
        } else {
          MSTierSheet.close();
          MSBlocked.open({ kind: "failedUnknown", data: {},
            onAction: function (k) {
              if (k === "open-wallet") MSApp.go("wallet");
              else if (k === "retry") runTier(runType, weights);
            } });
        }
      });
    }

    // 광고를 본 뒤의 잔량 폴링(Phase 8d) — wallet.js 의 afterAd 와 같은 규율이다: 세대 가드
    // (isCurrent, 이 화면이 이미 이 render() 세대·이 종목이 아니면 멈춘다)로 재렌더·종목전환
    // 시 고아 루프를 죽이고, adBusy 로 진행 중 연타를 막는다. 잔량은 서버가 준 값이 before 보다
    // 커진 것을 **확인한 뒤에만** 다음 단계로 넘어간다 — 낙관적으로 올려 그리지 않는다(8b 원칙).
    function afterCtaAd(before, n, msg) {
      if (!isCurrent()) return;
      if (n >= AD_POLL_LIMIT) { adBusy = false; msg.textContent = MSStr.t.adPending; return; }
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
            MSTierSheet.open({ sym: sym, tier: tier, name: wlItem && wlItem.name,
              balance: r2.state ? r2.state.balance : null, cap: r2.state ? r2.state.cap : null,
              // onRun: runFull 이면 시트가 넘겨준 picked 를 버린다 — 광고로 충전한 뒤 전문분석을
              // 골라도 심화가 돌고 3스쿱이 나갔다. 아래 buildCta 와 **같은 분기**를 쓴다.
              onRun: runPicked, locked: { full: !tierBuyable("full"), custom: !tierBuyable("custom") } });
          });
          return;
        }
        setTimeout(function () { afterCtaAd(before, n + 1, msg); }, AD_POLL_MS);
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

    // 잔량 부족 카드("광고 1편 보기")가 닫힌 자리에 광고 권유를 띄운다. showLowBalanceAd 와
    // **같은 기계**를 쓴다 — 광고 유닛 선택·adConfig 부재 시 정직한 폴백(tsShort)·시청 후
    // 폴링까지 한 벌뿐이어야 두 경로가 다른 말을 하지 않는다. 광고를 본 뒤에는 단계 선택
    // 시트로 돌아간다(afterCtaAd) — Run 을 대신 눌러주지 않는 규칙은 CTA 경로와 같다.
    function shortCardAd(bal) {
      var wrap = MSUi.el("div", "rp-unlock");
      var host = scrRef || root;
      host.appendChild(wrap);
      showLowBalanceAd(wrap, bal);
      if (wrap.scrollIntoView) wrap.scrollIntoView({ block: "center" });
    }

    // 시안 18c 의 조절판 블록 — 심화의 8블록 **위에** 얹는다(한 겹도 빼지 않는다).
    // 여기 "예상 적중률 64%" 를 두지 않는다: 전문분석 적중률은 사용자마다 가중치가 달라
    // 하나로 환원되지 않고 재지 않았다(P2 §2 R3). 그 자리에는 계산되는 값만 온다 —
    // 조절한 개수와, 심화 대비 예측 폭의 변화.
    function buildWeights() {
      if (tier !== "custom" || !myWeights) return null;
      var sec = MSUi.el("div", "rp-weights");
      var head = MSUi.el("div", "rp-sec-head");
      head.appendChild(MSUi.el("span", "overline", MSStr.t.rpMyWeights));
      var tuned = 0, k;
      for (k in myWeights) {
        if (!Object.prototype.hasOwnProperty.call(myWeights, k)) continue;
        if (Math.abs(myWeights[k] - 1) > 1e-9) tuned++;
      }
      head.appendChild(MSUi.el("span", "rp-sec-note",
        MSStr.t.rpTunedA + tuned + MSStr.t.rpTunedB + MSIndTiers.tunable().length));
      sec.appendChild(head);
      // 심화 대비 폭 변화 — 있을 때만. 심화를 안 거쳤으면 비교 대상이 없고, 없는 비교를
      // 지어내지 않는다(8a 대조의 G1 과 같은 태도).
      var fullRec = purchases[pendKey(sym, "full")];
      var mine = an && an.out && an.out.prediction;
      if (fullRec && fullRec.an && fullRec.an.out && fullRec.an.out.prediction && mine) {
        var fp = fullRec.an.out.prediction;
        if (fp.lo && fp.hi && fp.lo.length && mine.lo && mine.hi && mine.lo.length) {
          var wFull = (fp.hi[0] - fp.lo[0]) / 2, wMine = (mine.hi[0] - mine.lo[0]) / 2;
          sec.appendChild(MSUi.el("div", "rp-weights-cmp",
            MSStr.t.rpDeepWidth + wFull.toFixed(1) + MSStr.t.rpToMine + wMine.toFixed(1)));
        }
      }
      var edit = MSUi.el("button", "rp-weights-edit", MSStr.t.rpEditWeights);
      edit.addEventListener("click", function () { runCustom(); });
      sec.appendChild(edit);
      return sec;
    }

    // 시안 18b 의 "지표 32개 판독문" 행. 개수는 리터럴이 아니라 실제로 읽은 행 수다 —
    // 32 를 박아두면 그래프 구성이 바뀌어도 화면은 계속 32 라고 말한다.
    // 판독문 화면은 **여기서 계산한 행을 그대로 받는다.** 다시 계산하면 같은 종목의 두 화면이
    // 다른 숫자를 낼 수 있다(P2 §6).
    function buildReadingsLink(rows, noDir) {
      if (tier === "basic") return null;          // 기본은 판독문을 팔지 않는다(블록 3개)
      var all = (rows || []).concat(noDir || []);
      if (!all.length) return null;
      var b = MSUi.el("button", "rp-rdlink");
      b.appendChild(MSUi.el("span", null, MSStr.t.rdLinkA + all.length + MSStr.t.rdLinkB));
      b.appendChild(MSUi.el("span", "rp-rdlink-arw", MSStr.t.rdArrow));
      b.addEventListener("click", function () {
        MSReadingsList.render(root, {
          sym: sym, name: wlItem && wlItem.name, rows: rows, noDir: noDir, tier: tier,
          onBack: function () { draw(); }
        });
      });
      return b;
    }

    function buildCta() {
      if (tier !== "basic") return MSUi.el("div");
      var wrap = MSUi.el("div", "rp-unlock");
      // "27개" 는 리터럴이 아니다 — 전체 지표에서 기본 티어가 읽는 수를 뺀다. 지표가 늘면
      // 이 문구가 따라 움직인다(관문이 ForgeCore.indicatorCount 와의 정합을 본다).
      var hidden = ForgeCore.indicatorCount - MSGraph.BASIC.length;
      wrap.appendChild(MSUi.el("p", "rp-unlock-line",
        MSStr.t.rpLockedA + hidden + MSStr.t.rpLockedB));
      var b = MSUi.el("button", "rp-cta", MSStr.t.rpUpgrade);
      b.addEventListener("click", function () {
        MSWallet.get().then(function (r) {
          if (!isCurrent()) return;
          var bal = r.state ? r.state.balance : null;
          // bal == null 은 "잔량을 모른다"(오프라인 등)다 — 광고 권유로 바꾸지 않는다. 뭘
          // 권유할 근거(정말 부족한지)가 없다. 시트를 그대로 열어 tsUnavailable 이 말하게 둔다.
          if (bal != null && bal < MSWallet.COSTS.full) { showLowBalanceAd(wrap, bal); return; }
          MSTierSheet.open({ sym: sym, tier: tier, name: wlItem && wlItem.name,
            balance: bal, cap: r.state ? r.state.cap : null,
            onRun: runPicked, locked: { full: !tierBuyable("full"), custom: !tierBuyable("custom") } });
        });
      });
      wrap.appendChild(b);
      return wrap;
    }

    function draw() {
      root.innerHTML = "";
      chartRefs = null;
      var scr = MSUi.el("div", "scr rp-scr");
      scrRef = scr;   // 카드가 닫힌 뒤 광고 권유를 붙일 자리(shortCardAd) — draw 마다 갱신된다
      scr.appendChild(buildHead());
      scr.appendChild(buildTierRow());

      if (state === "error") {
        scr.appendChild(errorBlock(errInfo));
      } else if (state === "loading") {
        scr.appendChild(skeletonBlock(84));    // 가격
        scr.appendChild(skeletonBlock(96));    // 판정
        scr.appendChild(skeletonBlock(chartH(tier))); // 차트 — 티어 높이를 따라간다(안 그러면 로딩이 실물보다 크다)
        scr.appendChild(skeletonBlock(180));   // 신호
      } else {
        // 지표 방향·판독문을 여기서 **한 번** 계산해 세 곳(판정 tally · REASONING · AGAINST)에
        // 나눠 준다. 예전엔 셋이 각자 MSIndicators 를 불러 Full 에서 analyzeX 가 90회 돌았다.
        var indRows = null, noDir = null;
        if (isPaid(tier) && an && an.graph) {
          var indInput = { price: data.price, candle: data.candle, volume: an.vol };
          // an.vol 은 analyzeFull 의 okVol 판정 결과다(거래량이 한 봉이라도 비면 null). 판독문의
          // hasVolume 은 그 하나에서만 나온다 — 여기서 다시 재면 화면과 문장이 갈린다.
          var indCtx = MSIndicators.ctxFrom(indInput);
          indRows = narratedRows || MSIndicators.readings(ForgeCore, an.graph, indInput, indCtx);
          noDir = MSIndicators.noDirRows(ForgeCore, indInput, indCtx);
        }
        // 블록의 **순서와 구성은 report-blocks.js 의 선언**이 정한다(P2 §4). 여기 표는
        // 이름 → 만드는 함수일 뿐이다. 세 티어를 세 벌의 draw() 로 쓰면 공통 블록을 고칠 때
        // 세 곳을 고쳐야 하고, 한 곳을 빠뜨려도 그 티어를 열기 전엔 아무도 모른다.
        // null 을 돌려주는 블록은 그 자리에서 사라진다(예전 `if (hz)` 들과 같은 동작).
        var BUILD = {
          price:     function () { return buildPrice(); },
          last:      function () { return buildLast(); },
          verdict:   function () { return buildVerdict(indRows); },
          chart:     function () { return buildChartSection(); },
          legend:    function () { return buildChartLegend(); },
          horizons:  function () { return buildHorizons(); },
          against:   function () { return buildAgainst(indRows); },
          // dissent 는 against 의 개명이다 — 시안 19b "이건 알고 계세요(반대)"와 against 의
          // 제목("반대 의견")·isPaid 게이팅·내용이 정확히 같다(리뷰 지시로 확인). 같은 함수를
          // 두 id 로 잇는다 — 함수를 복제하면 나중에 한쪽만 고쳐 갈라진다.
          dissent:   function () { return buildAgainst(indRows); },
          tf:        function () { return buildTfSection(); },
          note:      function () { return buildMissingNote(); },
          cta:       function () { return buildCta(); },
          readings:  function () { return buildReadingsLink(indRows, noDir); },
          // 18a 의 의도된 빈 공간 — "여기까지가 무료"를 스크롤 부재로 전달한다. 버그가 아니다.
          spacer:    function () { return MSUi.el("div", "rp-spacer"); },
          unlock:    function () { return buildCta(); },
          weights:   function () { return buildWeights(); }
        };
        // report-blocks.js 가 orderOf(문자열 배열)에서 forTier({id,kind} 배열)로 개명됐다
        // (P1a Task 2) — 화면 조립은 그대로, id 만 꺼내 쓴다. PENDING(모듈 스코프, 위)에 있는
        // id 는 조용히 건너뛴다(if (!fn) return) — 화면 구조 자체는 Task 3(기본)·P1b(심화)·
        // P1c(전문) 소관이라 이번엔 안 넓혔다.
        MSReportBlocks.forTier(tier).forEach(function (b) {
          var fn = BUILD[b.id];
          if (!fn) return;
          var node = fn();
          if (node) scr.appendChild(node);
        });
        // 해제 CTA(buildCta)는 선언 밖에서 부른다 — 시안 18a 의 "판정·빗·차트 정보 블록
        // 3개"는 CTA·빈 공간을 안 센다(report-blocks.js 의 주석·리뷰 지시). 그렇다고 CTA 를
        // 아예 안 부르면 기본분석에서 심화·전문으로 올라갈 유일한 입구(단계 선택 시트)가
        // 통째로 사라진다 — 리뷰가 잡은 "관문은 초록, 화면은 죽음"과 같은 모양의 사고를
        // 여기서 반복할 뻔했다(브라우저 관문 report-locked-tiers 가 CTA_MISSING 으로 잡음).
        // buildCta() 자신이 이미 tier!=='basic' 이면 빈 div 를 돌려주므로(내부 가드) 항상
        // 불러도 안전하다.
        scr.appendChild(buildCta());
      }

      if (state !== "ready") {
        // 로딩·에러 화면은 티어 구성을 안 탄다 — 주기 표와 CTA 만 남는다(종전과 동일).
        scr.appendChild(buildTfSection());
        scr.appendChild(buildCta());
      }

      root.appendChild(scr);   // 여기서부터 라이브 DOM — clientWidth 측정 가능

      if (state === "ready" && chartRefs) paintChart(chartRefs.cv, chartRefs.wrap, chartRefs.legend, an, data, sym, tier);
    }
    function runFull() { runTier("full", null); }
    // 시트가 고른 단계를 실행한다. 시트를 여는 곳이 둘(CTA · 광고 시청 후)이라 분기를 한
    // 벌로 둔다 — 한쪽만 고치면 같은 시트가 화면에 따라 다른 것을 산다.
    function runPicked(picked) { if (picked === "custom") runCustom(); else runFull(); }
    // 전문분석은 시트에서 바로 실행하지 않는다 — "얼마나 정밀하게"(시트)와 "어떤 지표를
    // 얼마나"(편집기)는 다른 질문이고, 시안이 그 둘을 다른 화면으로 그렸다.
    function runCustom() {
      MSTierSheet.close();
      MSWallet.get().then(function (r) {
        if (!isCurrent()) return;
        MSExpert.open({
          sym: sym, name: wlItem && wlItem.name,
          balance: r.state ? r.state.balance : null, cost: MSWallet.COSTS.custom,
          initial: myWeights,
          onRun: function (weights) { runTier("custom", weights); }
        });
      });
    }

    // 산 것은 그대로 다시 보인다. startLoad() 를 태우면 finishData() 의 Basic 재분석이 Full 분석(an)을
    // 덮어써 배지는 FULL 인데 내용은 5지표인 화면이 된다 — 그래서 로드·재분석 없이 레코드로 바로 그린다.
    if (bought) { data = bought.data; an = bought.an; state = "ready"; draw(); }
    else if (purchases[pendKey(sym, "custom")] && purchases[pendKey(sym, "custom")].promise) {
      startLoad();
      runTier("custom", myWeights);
    }
    else if (purchases[pendKey(sym, "full")] && purchases[pendKey(sym, "full")].promise) {
      // 구매가 아직 도는 중에 이 화면이 재렌더됐다(같은 종목 재탭·폴드 전환). 앞 렌더의 반영은
      // 세대 가드에 막혀 버려지므로, 이 렌더가 그 promise 에 다시 붙어야 결과가 화면에 온다.
      // purchaseFull() 이 레코드를 보고 붙으므로 spend 는 다시 일어나지 않는다.
      startLoad();
      runFull();
    } else startLoad();
  }

  window.MSReport = { render: render };
})();
