// 온보딩 7단계 — 시안 정본(DESIGN-INVENTORY §2, t17). 앱 셸 밖에서 돈다:
// 완료 전까지 워치리스트/리포트/지갑은 그리지 않는다.
//
//   1 콜드 오픈(11a)      — 설명 대신 직접 찍게 한다. 봉 몇 개를 가리고 물은 뒤 실제를 연다.
//   2 투자성향(11c)       — 용어가 아니라 태도를 묻는다. 전문분석 가중치 기본값이 된다.
//   3 위험 고지           — 체크박스 필수. **분석 결과를 보여주기 전**이다.
//   4 기본분석 체험(16a)  — 종목 하나 고르고 실제로 돌린다. 체험 1/3.
//   5 심화분석 체험(16b)  — 무엇이 달라지는지 두 막대로. 체험 2/3.
//   6 전문분석 체험(16c)  — 슬라이더 하나만 열어 직접 만지게 한다. 체험 3/3.
//   7 완료·가격표·지급(17a) — 세 값을 한 표에 모으고 **가격은 이제야** 공개한다.
//
// **순서가 핵심이다.** 가격표를 먼저 보여주면 "3스쿱"이 그냥 숫자다. 234.2 ± 1.1 을 먼저 본
// 사람에게만 3이 싼지 비싼지 판단할 근거가 생긴다(인벤토리 §2 원문).
//
// ⚠ 시안 16b 는 "답이 절반으로 좁아졌습니다"를 두 막대로 보여준다. **우리 엔진에서는 거짓이다** —
// 실측하면 심화의 범위가 오히려 넓어진다(모든 지평). 티어 백테스트도 같은 말을 한다: 콘 커버
// 73.8% → 77.1%. 그래서 그 화면은 참인 차이를 판다 — 좁은 답이 아니라 **정직한 범위**다.
// 숫자는 전부 번들된 실측(MSBacktest.tiers)에서 오고, 없으면 그 블록을 안 그린다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSOnboarding = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STEPS = 7;
  var TERMS_VERSION = "2026-08-17";
  var TF = "1day";
  var CHART_H = 240, PAD = 10;
  var GUESS_CUT = 12;      // 1단계에서 가려 두는 봉 수 — 눈으로 방향이 읽힐 만큼만
  // 시안 16a: **정확히 3개**(고르는 데 시간 쓰면 튜토리얼이 안 시작된다). 이름은 여기 적지
  // 않는다 — ticker-picker 의 CURATED 가 이름의 정본이고, 두 벌이 갈리면 온보딩이 심은 종목이
  // 워치리스트에서 다른 이름으로 보인다.
  function tutSyms() {
    return (typeof MSStore !== "undefined" && MSStore.TUTORIAL_SYMS) ? MSStore.TUTORIAL_SYMS : [];
  }
  function tutPicks() {
    return tutSyms().map(function (sym) {
      var name = (typeof MSTickerPicker !== "undefined" && MSTickerPicker.nameOf)
        ? MSTickerPicker.nameOf(sym) : "";
      return { sym: sym, name: name || sym };
    });
  }

  // 문자열은 MSStr.t.X 로 **직접** 읽는다. 모듈 로드 시점에 별칭(var Str = MSStr)으로 잡아두면
  // 이 파일이 strings.js 보다 먼저 실리는 환경에서 영원히 null 이 된다 — 던지지 않고 문구만
  // 사라지는 실패라 눈으로만 보인다(graph.js UMD 인자에서 겪은 것과 같은 부류).
  // t("키") 처럼 이름을 문자열로 넘기는 방식도 안 쓴다: 화면 소스에 문자열 리터럴이 남아
  // 영어 잔존 관문에 걸리고, 정적 분석이 "이 키를 쓰는 곳"을 못 본다(리포트 배지 표에서 겪었다).

  // 진행할 수 있는가. 화면 밖에서 시험할 수 있게 순수 함수로 둔다.
  function canAdvance(step, state) {
    if (step === 1) return !!state.guessed;
    if (step === 2) return !!state.style;
    if (step === 3) return !!state.agreed;
    if (step === 4) return !!state.r1;      // 기본분석 결과가 실제로 나왔을 때만
    return true;
  }

  function next(step, state) {
    if (!canAdvance(step, state)) return step;
    return step >= STEPS ? step : step + 1;
  }

  // 튜토리얼로 고른 종목 하나를 심는다. 기존 워치리스트는 건드리지 않는다(추가만).
  function seedTo(store, picked) {
    (picked || []).forEach(function (p) { if (p && p.sym) store.addTicker(p.sym, p.name); });
    return store.getWatchlist();
  }

  // 라벨(0.80) 대비 실제 커버가 얼마나 가까운가 — 작을수록 정직하다.
  function coverGap(cov) { return (typeof cov === "number") ? Math.abs(cov - 0.80) : null; }

  function frag(cls) { var e = document.createElement("div"); e.className = cls; return e; }
  function el(tag, cls, text) { return MSUi.el(tag, cls, text); }
  function pct(x) { return (x == null) ? "—" : (x * 100).toFixed(1) + "%"; }
  function num(x, d) { return (x == null) ? "—" : Number(x).toFixed(d == null ? 2 : d); }

  function progress(step) {
    var w = frag("ob-prog");
    for (var i = 1; i <= STEPS; i++) w.appendChild(frag("ob-seg" + (i === step ? " is-on" : (i < step ? " is-done" : ""))));
    return w;
  }

  function render(rootEl, opts) {
    var o = opts || {};
    var step = 1;
    var state = {
      guessed: null, guessRight: null,
      // 저장된 성향이 있으면 그것을 기본 선택으로 — 온보딩을 다시 열었을 때 예전 선택이
      // 되살아난다. MSStore 가 없는 환경(경량 하네스)에서도 던지지 않는다.
      style: (typeof MSStore !== "undefined" && MSStore.getStyle && MSStore.getStyle()) || "trend",
      agreed: false,
      tut: null,            // { sym, name, data, fallback }
      r1: null, r2: null, r3: null,
      trendW: 1.0,
      granted: null, grantStarted: false, grantFailed: false,
      picked: [], finished: false
    };

    // ── 표본·분석 ────────────────────────────────────────────────────────────────
    // 주입(opts.sample)을 먼저 본다 — 시험이 자기 시계를 넣을 수 있어야 "번들이 없을 때"와
    // "있을 때"를 둘 다 잴 수 있다.
    function sample() {
      if (o.sample) return o.sample;
      return (typeof MSOnboardingSample !== "undefined") ? MSOnboardingSample : null;
    }

    // 1단계용 — 마지막 GUESS_CUT 봉을 가린 사본. 가려진 구간이 곧 정답이다.
    function sliced() {
      var s = sample();
      if (!s) return null;
      var n = Math.max(30, s.candle.length - GUESS_CUT);
      return { price: s.price.slice(0, n), candle: s.candle.slice(0, n) };
    }

    function guessAnswer() {
      var s = sample();
      if (!s) return null;
      var n = Math.max(30, s.candle.length - GUESS_CUT);
      var before = s.price[n - 1], after = s.price[s.price.length - 1];
      if (typeof before !== "number" || typeof after !== "number") return null;
      return { up: after >= before, before: before, after: after };
    }

    // 엔진을 실제로 돌린다. tier 는 그래프를 고르고, weights 는 전문분석에서만 온다.
    // report.js analyzeFull 의 거래량 취급을 그대로 따른다 — 드리프트는 data.volume 이 아니라
    // 그래프의 volume 노드를 읽으므로 setVolume 을 반드시 거친다.
    function runTier(data, tier, weights) {
      if (!data || typeof ForgeCore === "undefined" || typeof MSGraph === "undefined") return null;
      var vol = data.candle.map(function (c) { return c && c.v; });
      var okVol = vol.length >= 2 && vol.every(function (v) { return typeof v === "number" && isFinite(v); });
      var graph = (tier === "basic") ? MSGraph.basicGraph(ForgeCore)
                : (tier === "custom") ? MSGraph.customGraph(ForgeCore, weights)
                : MSGraph.full32Graph(ForgeCore);
      MSGraph.setVolume(graph, okVol ? vol : null);
      var input = { price: data.price, candle: data.candle };
      if (okVol) input.volume = vol;
      var opt = { timeframe: (typeof MSReportModel !== "undefined") ? MSReportModel.tfKo(TF) : TF };
      if (tier === "custom" && weights) opt.driftWeights = weights;
      try { return { graph: graph, input: input, out: ForgeCore.run(graph, input, opt) }; }
      catch (e) { return null; }
    }

    // 내일(첫 지평)의 값과 폭. 세 단계가 같은 자리를 비교해야 표가 성립한다.
    function tomorrow(r) {
      var p = r && r.out && r.out.prediction;
      if (!p || !p.path || !p.path.length) return null;
      var lo = p.lo && p.lo[0], hi = p.hi && p.hi[0];
      return { mid: p.path[0], lo: lo, hi: hi,
               width: (typeof lo === "number" && typeof hi === "number") ? (hi - lo) : null };
    }

    // ── 데이터 적재 ──────────────────────────────────────────────────────────────
    // 고른 종목의 실제 데이터로 돌린다. 못 받으면 번들 시계로 물러서되 **그 사실을 말한다** —
    // 감추면 화면의 숫자가 어느 종목 것인지 아무도 말할 수 없게 된다.
    function loadTut(pick, done) {
      state.tut = { sym: pick.sym, name: pick.name, data: null, fallback: false, loading: true };
      function settle(data, fallback) {
        state.tut.data = data; state.tut.fallback = fallback; state.tut.loading = false;
        state.r1 = runTier(data, "basic");
        state.r2 = runTier(data, "full");
        state.r3 = null;
        done();
      }
      var s = sample();
      if (typeof MSApi === "undefined" || !MSApi.loadTicker) { settle(s, true); return; }
      MSApi.loadTicker(pick.sym, TF).then(function (d) {
        if (d && d.candle && d.candle.length > 60) settle(d, false);
        else settle(s, true);
      })["catch"](function () { settle(s, true); });
    }

    // ── 1단계: 콜드 오픈 ─────────────────────────────────────────────────────────
    function step1() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", MSStr.t.obH1));
      w.appendChild(el("p", "ob-sub", MSStr.t.obGuessAsk));
      var wrap = frag("ob-canvas-wrap");
      var cv = document.createElement("canvas");
      cv.className = "ob-canvas";
      wrap.appendChild(cv);
      w.appendChild(wrap);

      if (!state.guessed) {
        var row = frag("ob-guess");
        [["up", MSStr.t.obGuessUp], ["down", MSStr.t.obGuessDown]].forEach(function (g) {
          var b = document.createElement("button");
          b.type = "button"; b.className = "btn btn-outline ob-guess-btn";
          b.textContent = g[1];
          b.addEventListener("click", function () {
            var a = guessAnswer();
            state.guessed = g[0];
            state.guessRight = a ? ((g[0] === "up") === a.up) : null;
            draw();
          });
          row.appendChild(b);
        });
        w.appendChild(row);
      } else {
        var a2 = guessAnswer();
        var head = (state.guessRight ? MSStr.t.obGuessRight : MSStr.t.obGuessWrong);
        var tail = MSStr.t.obGuessActualA +
          (a2 && a2.up ? MSStr.t.obGuessActualUp : MSStr.t.obGuessActualDown);
        w.appendChild(el("p", "ob-reveal" + (state.guessRight ? " is-right" : ""), head + " " + tail));
        w.appendChild(el("p", "ob-sub", MSStr.t.obGuessWhy));
      }
      w.appendChild(el("p", "ob-over", MSStr.t.obSampleNote));
      return w;
    }

    // 캔들만 그린다(예측선 없음) — 1단계는 "직접 찍어보라"는 화면이고, 엔진의 답을 먼저
    // 보여주면 찍을 이유가 사라진다. 찍은 뒤에는 가렸던 봉을 열어 실제를 보여준다.
    function paintGuess(scr) {
      var cv = scr.querySelector(".ob-canvas");
      var d = state.guessed ? sample() : sliced();
      if (!cv || !d || typeof MSChartLayout === "undefined" || typeof MSChartDraw === "undefined") return;
      var ctx = cv.getContext ? cv.getContext("2d") : null;
      if (!ctx) return;
      var wrap = cv.parentNode;
      var cssW = (wrap && wrap.clientWidth) || cv.clientWidth || 320;
      var col = MSUi.colTokens();
      MSUi.fitCanvas(cv, ctx, cssW, CHART_H);
      var lay = MSChartLayout.chartLayout({
        candle: d.candle, prediction: null, width: cssW, height: CHART_H,
        pad: PAD, tailBars: 60, panels: ["price"]
      });
      ctx.clearRect(0, 0, cssW, CHART_H);
      if (typeof MSLayers !== "undefined") MSLayers.resetLabels(cssW, CHART_H);
      MSChartDraw.drawAxes(ctx, lay, d.candle, col);
      MSChartDraw.drawCandles(ctx, lay, d.candle, col);
    }

    // ── 2단계: 투자성향 ──────────────────────────────────────────────────────────
    function styleDesc(key) {
      return key === "trend" ? MSStr.t.obStyleTrend
           : key === "momentum" ? MSStr.t.obStyleMomentum
           : key === "reversion" ? MSStr.t.obStyleReversion
           : key === "volatility" ? MSStr.t.obStyleVolatility : "";
    }

    function step2() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", MSStr.t.obH2b));
      w.appendChild(el("p", "ob-sub", MSStr.t.obSub2b));
      var list = frag("ob-styles");
      // 목록은 MSIndTiers.PRESETS 가 정본이다 — 여기 이름을 다시 적으면 두 벌이 갈린다.
      MSIndTiers.PRESETS.forEach(function (p) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ob-style" + (state.style === p.key ? " is-on" : "");
        b.appendChild(el("span", "ob-style-name", p.name));
        b.appendChild(el("span", "ob-style-desc", styleDesc(p.key)));
        b.addEventListener("click", function () { state.style = p.key; draw(); });
        list.appendChild(b);
      });
      w.appendChild(list);
      w.appendChild(el("p", "ob-note", MSStr.t.obStyleNote));
      return w;
    }

    // ── 3단계: 위험 고지 ─────────────────────────────────────────────────────────
    function step3() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", MSStr.t.obH5));
      w.appendChild(el("p", "ob-risk", MSStr.t.obRisk));
      var lab = document.createElement("label");
      lab.className = "ob-agree";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "ob-agree-cb";
      // 재진입 시 state 에서 다시 칠한다 — 없으면 화면은 꺼져 있는데 동의 기록은 살아 있다.
      cb.checked = !!state.agreed;
      cb.addEventListener("change", function () {
        state.agreed = cb.checked;
        var fwd = rootEl.querySelector(".ob-next");
        if (fwd) fwd.disabled = !canAdvance(3, state);
      });
      lab.appendChild(cb);
      lab.appendChild(el("span", "ob-agree-txt", MSStr.t.obAgree));
      w.appendChild(lab);
      return w;
    }

    // ── 4단계: 기본분석 체험 ─────────────────────────────────────────────────────
    function tutHead(n) {
      var d = frag("ob-tut-head");
      d.appendChild(el("span", "ob-tut-n", n + MSStr.t.obTutOf + "3"));
      return d;
    }

    function bandRow(label, band) {
      var r = frag("ob-band");
      r.appendChild(el("span", "ob-band-k", label));
      r.appendChild(el("span", "ob-band-v", num(band && band.mid)));
      r.appendChild(el("span", "ob-band-w", MSStr.t.obTutWidth + num(band && band.width)));
      return r;
    }

    function step4() {
      var w = frag("ob-step");
      if (!state.tut) {
        w.appendChild(el("h1", "ob-h", MSStr.t.obTutIntroH));
        w.appendChild(el("p", "ob-sub", MSStr.t.obTutIntroSub));
        var steps = frag("ob-tut-list");
        [MSStr.t.obTutStep1, MSStr.t.obTutStep2, MSStr.t.obTutStep3]
          .forEach(function (line, i) {
            var row = frag("ob-tut-row");
            row.appendChild(el("span", "ob-tut-num", String(i + 1)));
            row.appendChild(el("span", "ob-tut-txt", line));
            steps.appendChild(row);
          });
        w.appendChild(steps);
        w.appendChild(el("p", "ob-pick-h", MSStr.t.obTutPick));
        var cards = frag("ob-picks");
        tutPicks().forEach(function (p) {
          var b = document.createElement("button");
          b.type = "button"; b.className = "ob-pick";
          b.appendChild(el("span", "ob-pick-name", p.name));
          b.appendChild(el("span", "ob-pick-sym", p.sym));
          b.addEventListener("click", function () {
            state.picked = [{ sym: p.sym, name: p.name }];
            loadTut(p, draw);
            draw();
          });
          cards.appendChild(b);
        });
        w.appendChild(cards);
        return w;
      }

      w.appendChild(tutHead(1));
      w.appendChild(el("h1", "ob-h", MSStr.t.obTut1H));
      if (state.tut.loading) { w.appendChild(el("p", "ob-sub", MSStr.t.obTutLoading)); return w; }
      if (state.tut.fallback) w.appendChild(el("p", "ob-warn", MSStr.t.obTutFallback));
      w.appendChild(el("p", "ob-sub", MSStr.t.obTut1Sub));
      var t1 = tomorrow(state.r1);
      w.appendChild(bandRow(MSStr.t.obTutTomorrow, t1));
      return w;
    }

    // ── 5단계: 심화분석 체험 ─────────────────────────────────────────────────────
    // 시안의 "절반으로 좁아짐"은 우리 엔진에서 거짓이라, 실제로 파는 것을 판다:
    // "80% 범위"라고 말할 때 실제로 몇 %를 덮었는가. 두 막대는 그 값이다(라벨 80 이 기준선).
    function step5() {
      var w = frag("ob-step");
      w.appendChild(tutHead(2));
      w.appendChild(el("h1", "ob-h", MSStr.t.obTut2H));
      w.appendChild(el("p", "ob-sub", MSStr.t.obTut2Sub));

      var B = (typeof MSBacktest !== "undefined" && MSBacktest.tiers) ? MSBacktest.tiers : null;
      if (B && B.basic && B.deep) {
        w.appendChild(el("p", "ob-over", MSStr.t.obTut2Label));
        var box = frag("ob-cov");
        [[MSStr.t.obTut2Basic, B.basic.coneCoverage, ""],
         [MSStr.t.obTut2Full, B.deep.coneCoverage, " is-on"]].forEach(function (row) {
          var r = frag("ob-cov-row" + row[2]);
          r.appendChild(el("span", "ob-cov-k", row[0]));
          var track = frag("ob-cov-track");
          var fill = frag("ob-cov-fill");
          // 막대는 라벨 80% 를 가득 참으로 둔다 — 두 막대의 길이 차이가 곧 "얼마나 모자란가"다.
          fill.style.width = Math.max(0, Math.min(100, (row[1] / 0.80) * 100)) + "%";
          track.appendChild(fill);
          r.appendChild(track);
          r.appendChild(el("span", "ob-cov-v", pct(row[1])));
          box.appendChild(r);
        });
        w.appendChild(box);
        w.appendChild(el("p", "ob-cov-target", MSStr.t.obTut2Target));
      }
      w.appendChild(el("p", "ob-note", MSStr.t.obTut2Note));

      // 이번 종목에서 실제로 폭이 어떻게 됐는지 그대로 보여준다. 넓어졌으면 넓어졌다고 적는다.
      var t1 = tomorrow(state.r1), t2 = tomorrow(state.r2);
      var cmp = frag("ob-cmp");
      cmp.appendChild(bandRow(MSStr.t.obTut2Basic, t1));
      cmp.appendChild(bandRow(MSStr.t.obTut2Full, t2));
      w.appendChild(cmp);
      if (t1 && t2 && t1.width != null && t2.width != null && t2.width > t1.width)
        w.appendChild(el("p", "ob-note", MSStr.t.obTut2Wider));
      return w;
    }

    // ── 6단계: 전문분석 체험 ─────────────────────────────────────────────────────
    function recomputeCustom() {
      var base = MSIndTiers.weightsOf(state.style, MSGraph.BASIC);
      var wts = {};
      Object.keys(base).forEach(function (k) { wts[k] = base[k]; });
      wts.trend = state.trendW;                       // 슬라이더가 여는 딱 하나
      state.r3 = runTier(state.tut && state.tut.data, "custom", wts);
    }

    function step6() {
      var w = frag("ob-step");
      w.appendChild(tutHead(3));
      w.appendChild(el("h1", "ob-h", MSStr.t.obTut3H));
      w.appendChild(el("p", "ob-sub", MSStr.t.obTut3Sub));
      if (!state.r3) recomputeCustom();
      var t3 = tomorrow(state.r3);
      var now = frag("ob-now");
      now.appendChild(el("span", "ob-now-k", MSStr.t.obTut3Now));
      now.appendChild(el("span", "ob-now-v", num(t3 && t3.mid)));
      now.appendChild(el("span", "ob-now-w", MSStr.t.obTutWidth + num(t3 && t3.width)));
      w.appendChild(now);

      var card = frag("ob-slider");
      card.appendChild(el("span", "ob-slider-name", MSStr.ind("trend")));
      card.appendChild(el("span", "ob-slider-val", num(state.trendW, 1) + "×"));
      var input = document.createElement("input");
      input.type = "range"; input.min = "0.1"; input.max = "3.0"; input.step = "0.1";
      input.value = String(state.trendW);
      input.className = "ob-range";
      input.addEventListener("input", function () {
        state.trendW = Number(input.value);
        var v = w.querySelector(".ob-slider-val");
        if (v) v.textContent = num(state.trendW, 1) + "×";
        recomputeCustom();
        var tw = tomorrow(state.r3);
        var mv = w.querySelector(".ob-now-v"), wv = w.querySelector(".ob-now-w");
        if (mv) mv.textContent = num(tw && tw.mid);
        if (wv) wv.textContent = MSStr.t.obTutWidth + num(tw && tw.width);
      });
      card.appendChild(input);
      var ticks = frag("ob-ticks");
      ["0.1", MSStr.t.obTut3Default, "3.0"].forEach(function (lab) { ticks.appendChild(el("span", "ob-tick", lab)); });
      card.appendChild(ticks);
      w.appendChild(card);
      w.appendChild(el("p", "ob-note", MSStr.t.obTut3Note));
      return w;
    }

    // ── 7단계: 완료 · 가격표 · 지급 ──────────────────────────────────────────────
    function grantBox() { return rootEl.querySelector(".ob-grant"); }

    function paintGrant() {
      var box = grantBox();
      if (!box) return;
      box.innerHTML = "";
      if (state.granted != null) {
        // 한 덩어리로 쓴다 — 숫자와 문구를 따로 담으면 "무엇이 서버 값인지"를 읽는 쪽에서
        // 다시 조립해야 하고, 그 조립이 화면과 시험에서 갈린다.
        box.textContent = String(state.granted) + MSStr.t.obGranted;
      } else if (state.grantFailed) {
        // 실패해도 진행은 막지 않는다 — 기본분석은 무료라 앱은 계속 쓸 수 있다. 대신 복구
        // 수단(재시도)을 그 자리에 둔다. 막다른 골목을 만들지 않는 규칙(blocked.js ②)과 같다.
        box.textContent = MSStr.t.obGrantOffline;
        var b = document.createElement("button");
        b.type = "button"; b.className = "btn btn-outline btn-sm ob-retry";
        b.textContent = MSStr.t.obRetry;
        b.addEventListener("click", function () { state.grantStarted = true; fetchGrant(); });
        box.appendChild(b);
      } else box.textContent = MSStr.t.obGranting;
    }

    // 지급은 7단계에서 처음 나간다(시안 정본: 값을 겪은 뒤에 지급·가격 공개). 1~6단계에서
    // 이탈하면 계정이 안 생겨 IP당 신규계정 상한도 안 쓴다. 화면이 "N개"라고 말할 때 그 N 은
    // **서버가 실제로 준 값**이다 — 클라이언트가 그려놓고 나중에 맞추지 않는다.
    function fetchGrant() {
      state.grantFailed = false;
      paintGrant();
      if (typeof MSWallet === "undefined") { state.grantFailed = true; paintGrant(); return; }
      MSWallet.get().then(function (r) {
        if (r && r.ok && r.state && typeof r.state.balance === "number") state.granted = r.state.balance;
        else state.grantFailed = true;
        paintGrant();
      })["catch"](function () { state.grantFailed = true; paintGrant(); });
    }

    function step7() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", MSStr.t.obDoneH));
      w.appendChild(el("p", "ob-sub", MSStr.t.obDoneSub));

      var table = frag("ob-final");
      table.appendChild(bandRow(MSStr.t.obTut2Basic, tomorrow(state.r1)));
      table.appendChild(bandRow(MSStr.t.obTut2Full, tomorrow(state.r2)));
      table.appendChild(bandRow(MSStr.t.xpTitle, tomorrow(state.r3)));
      w.appendChild(table);

      w.appendChild(frag("ob-grant"));

      // 가격표는 지갑 화면과 같은 출처(MSWallet.COSTS)에서 읽는다 — 여기서 다시 적으면
      // 두 화면이 다른 값을 말하게 된다(P2 에서 스캔 가격이 실제로 그렇게 갈렸다).
      var C = (typeof MSWallet !== "undefined") ? MSWallet.COSTS : {};
      w.appendChild(el("p", "ob-over", MSStr.t.obDoneNow));
      w.appendChild(el("p", "ob-cost-note", MSStr.t.obDoneFree));
      var costs = frag("ob-costs");
      [[MSStr.t.obCostFull, C.full], [MSStr.t.xpTitle, C.custom]].forEach(function (row) {
        var r = frag("ob-cost-row");
        r.appendChild(el("span", "ob-cost-k", row[0]));
        // 0 은 "0 스쿱"이 아니라 "무료"다. 숫자 0 을 값으로 걸면 가격이 있는데 아주 싼 것처럼
        // 읽히고, 지갑 화면은 이미 무료로 그리므로 두 화면이 같은 값을 다르게 말하게 된다.
        r.appendChild(el("span", "ob-cost-num", (row[1] === 0) ? MSStr.t.walFree
                                              : (row[1] != null ? String(row[1]) : "?")));
        costs.appendChild(r);
      });
      w.appendChild(costs);
      w.appendChild(el("p", "ob-cost-note", MSStr.t.obDoneEarn));
      return w;
    }

    // ── 셸 ──────────────────────────────────────────────────────────────────────
    function draw() {
      rootEl.innerHTML = "";
      var scr = frag("ob");
      scr.appendChild(progress(step));
      var body = step === 1 ? step1() : step === 2 ? step2() : step === 3 ? step3()
               : step === 4 ? step4() : step === 5 ? step5() : step === 6 ? step6() : step7();
      scr.appendChild(body);

      var nav = frag("ob-nav");
      if (step > 1) {
        var back = document.createElement("button");
        back.type = "button"; back.className = "btn btn-ghost ob-back";
        back.textContent = MSStr.t.obBack;
        back.addEventListener("click", function () { step = step - 1; draw(); });
        nav.appendChild(back);
      }
      var fwd = document.createElement("button");
      fwd.type = "button"; fwd.className = "btn btn-primary ob-next";
      fwd.textContent = (step === STEPS) ? MSStr.t.obDoneStart : MSStr.t.obNext;
      fwd.disabled = !canAdvance(step, state);
      fwd.addEventListener("click", function () {
        if (step === STEPS) {
          if (state.finished || !canAdvance(STEPS, state)) return;
          state.finished = true;
          fwd.disabled = true;
          // 하나라도 던지면 래치가 켜진 채 멈춰 버튼이 영원히 비활성이 된다 — 스스로 되돌린다.
          var ok = false;
          try {
            seedTo(MSStore, state.picked);
            if (MSStore.setStyle) MSStore.setStyle(state.style);
            MSStore.setOnboarded(TERMS_VERSION);
            if (o.onDone) o.onDone();
            ok = true;
          } finally {
            if (!ok) { state.finished = false; fwd.disabled = false; }
          }
          return;
        }
        var n = next(step, state);
        if (n !== step) { step = n; draw(); }
      });
      nav.appendChild(fwd);
      scr.appendChild(nav);
      rootEl.appendChild(scr);

      if (step === 1) paintGuess(scr);          // 캔버스가 DOM 에 붙은 뒤여야 폭을 잴 수 있다
      if (step === 7) {
        if (!state.grantStarted) { state.grantStarted = true; fetchGrant(); }
        else paintGrant();
      }
    }

    draw();
  }

  return { STEPS: STEPS, tutSyms: tutSyms, tutPicks: tutPicks, canAdvance: canAdvance, next: next,
           seedTo: seedTo, coverGap: coverGap, render: render };
});
