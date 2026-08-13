// 온보딩 5단계. 셸 밖에서 돈다 — 완료 전까지 워치리스트/리포트/지갑은 그리지 않는다.
// 1·2단계는 번들 시계(onboarding-sample.js)로 진짜 엔진을 돌린다. 네트워크를 타면
// 첫 화면이 콜드 수신(실측 942ms)을 기다리게 되고, 그게 앱의 첫인상이 된다.
//
// Task 3 범위는 게이트 + 1·2단계다. 3·4·5 단계 본문은 Task 4·5 가 채운다 —
// 그때까지 draw() 는 그 단계에서 진행 막대와 버튼만 그린다(미완성 상태).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSOnboarding = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STEPS = 5;
  var TF = "1day";
  var PAD = 10;
  // 온보딩 차트는 가격 패널 한 장이다 — 리포트의 4단 적층(커버 520px)이 필요 없다.
  // 지표 30종은 2단계의 빗이 대신 말한다.
  var CHART_H = 250;
  // 하단 날짜축은 마지막 패널 **아래** 14px 에 찍힌다(chart-draw.js drawAxes) — 레이아웃 높이를
  // 캔버스 높이로 그대로 주면 그 글자가 캔버스 밖으로 나가 잘린다. 그만큼을 미리 뗀다.
  var AXIS_LABEL_H = 18;
  // MSPreds.seed 가 꿈틀의 난수 씨앗으로 쓴다. 종목명이 아니라 "이 시계"의 이름이다 —
  // 실제 종목을 넣으면 그 종목의 예측처럼 읽힌다.
  var SAMPLE_SEED = "SAMPLE";

  function canAdvance(step, state) {
    var s = state || {};
    if (step === 4) return !!(s.picked && s.picked.length >= 1);
    if (step === 5) return !!s.agreed;
    return true;   // 3단계는 지급이 실패해도 막지 않는다 — Basic 리포트는 무료다
  }
  function next(step, state) {
    if (step >= STEPS) return step;
    return canAdvance(step, state) ? step + 1 : step;
  }

  function frag(cls) { var e = document.createElement("div"); e.className = cls; return e; }
  function el(tag, cls, text) { return MSUi.el(tag, cls, text); }

  function progress(step) {
    var w = frag("ob-prog");
    for (var i = 1; i <= STEPS; i++) w.appendChild(frag("ob-seg" + (i === step ? " is-on" : "")));
    return w;
  }

  function render(rootEl, opts) {
    var o = opts || {};
    var Str = (typeof MSStr !== "undefined") ? MSStr : null;
    var state = { picked: [], agreed: false, granted: null, grantFailed: false,
                  grantStarted: false, sample: o.sample || null };
    var step = 1;
    var an = null;   // 엔진 결과 캐시 — 1↔2 단계를 오갈 때마다 32지표를 다시 돌리지 않는다

    // 번들 시계는 <script src> 로 이미 들어와 있다 — 기다릴 것이 없다.
    // 주입(opts.sample)을 먼저 보는 이유는 테스트가 전역 없이 돌 수 있어야 하기 때문이다.
    function sample() {
      if (state.sample) return state.sample;
      return (typeof MSOnboardingSample !== "undefined") ? MSOnboardingSample : null;
    }

    // 판정 한 번, 두 화면이 같은 결과를 본다. report.js analyzeFull 의 거래량 취급을
    // 그대로 따른다 — 엔진의 거래량 드리프트는 data.volume 이 아니라 그래프의 volume 노드를
    // 읽으므로 setVolume 을 반드시 거쳐야 한다(graph.js 주석 참고).
    function analysis() {
      if (an) return an;
      var s = sample();
      if (!s || typeof ForgeCore === "undefined" || typeof MSGraph === "undefined" ||
          typeof MSReportModel === "undefined") return null;
      var vol = s.candle.map(function (c) { return c.v; });
      var okVol = vol.length >= 2 && vol.every(function (v) { return typeof v === "number" && isFinite(v); });
      var graph = MSGraph.full32Graph(ForgeCore);
      MSGraph.setVolume(graph, okVol ? vol : null);
      var input = { price: s.price, candle: s.candle };
      if (okVol) input.volume = vol;
      an = { graph: graph, input: input, candle: s.candle,
             out: ForgeCore.run(graph, input, { timeframe: MSReportModel.tfKo(TF) }) };
      return an;
    }

    function step1() {
      var w = frag("ob-step");
      w.appendChild(el("p", "ob-over", Str ? Str.t.obSampleNote : ""));
      w.appendChild(el("h1", "ob-h", Str ? Str.t.obH1 : ""));
      var wrap = frag("ob-canvas-wrap");
      var cv = document.createElement("canvas");
      cv.className = "ob-canvas";
      wrap.appendChild(cv);
      w.appendChild(wrap);
      w.appendChild(el("p", "ob-sub", Str ? Str.t.obSub1 : ""));
      return w;
    }

    function step2() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", Str ? Str.t.obH2 : ""));
      w.appendChild(frag("ob-comb"));
      w.appendChild(el("p", "ob-cap", ""));       // 개수는 세어봐야 안다 — paintComb 가 채운다
      w.appendChild(el("p", "ob-sub", Str ? Str.t.obSub2 : ""));
      return w;
    }

    // ── 작도. screens/report.js 의 paintChart 가 정본이고 여기는 그 호출 순서를 그대로 따른다 —
    // 온보딩용 작도를 새로 쓰면 두 벌이 되어 갈린다. 덜어낸 것: 크로스헤어(350ms 홀드)·핀치 줌·
    // 리사이즈 리스너(정적 한 장이다)·티어 게이팅(1차만)·레전드(1단계는 헤드라인 하나로 말한다).
    // 남긴 것: DPR 트랜스폼(안 하면 폰에서 흐리다) → chartLayout → 축 → 캔들 → 콘.
    function paintChart(scr) {
      var s = sample();
      var cv = scr.querySelector(".ob-canvas");
      if (!s || !cv || typeof MSChartLayout === "undefined" || typeof MSChartDraw === "undefined" ||
          typeof MSZoom === "undefined") return;
      var a = analysis();
      if (!a) return;
      var ctx = cv.getContext ? cv.getContext("2d") : null;
      if (!ctx) return;

      var wrap = cv.parentNode;
      var cssW = (wrap && wrap.clientWidth) || cv.clientWidth || 320;
      var col = MSUi.colTokens();
      MSUi.fitCanvas(cv, ctx, cssW, CHART_H);   // DPR — 리포트 차트와 한 벌(ui.js)

      var pred = a.out.prediction;
      var fut = (pred && pred.path) ? pred.path.length : 0;
      var tail = MSZoom.clamp(MSChartLayout.plotWidth(cssW, PAD), fut, MSZoom.DEFAULT_TAIL);
      var lay = MSChartLayout.chartLayout({
        candle: s.candle, prediction: pred,
        width: cssW, height: CHART_H - AXIS_LABEL_H, pad: PAD, tailBars: tail,
        panels: ["price"]                 // 서브패널 3단은 온보딩에 할 말이 없다
      });

      ctx.clearRect(0, 0, cssW, CHART_H);
      // 매 프레임 맨 앞 — 이 뒤에 등록되는 라벨만 서로를 본다(report.js frame 과 같은 이유).
      if (typeof MSLayers !== "undefined") MSLayers.resetLabels(cssW, CHART_H);
      MSChartDraw.drawAxes(ctx, lay, s.candle, col);
      // 캔들이 먼저, 예측이 나중 — 끝점 배지가 seam 왼쪽까지 나온다(report.js 와 같은 z-order).
      MSChartDraw.drawCandles(ctx, lay, s.candle, col);
      // 온보딩엔 티어가 없다. "basic" 은 1차 예측선만 여는 값이다(chart-draw.js PRED_TIERS).
      MSChartDraw.drawCone(ctx, lay, pred, col, "basic", { sym: SAMPLE_SEED, tf: TF });
    }

    function paintComb(scr) {
      var comb = scr.querySelector(".ob-comb");
      var cap = scr.querySelector(".ob-cap");
      if (!comb || typeof MSIndicators === "undefined") return;
      var a = analysis();
      if (!a) return;
      // 시안은 32라고 적었지만 방향을 물을 수 있는 것은 30종이다 — trend·phasefold 는 bias 가 없다.
      // REASONING 의 "30 with a direction" 과 같은 규율.
      // readings 가 아니라 biases 다. 같은 노드 루프·같은 유한 bias 필터로 같은 30행을 주는데,
      // readings 는 화면에 안 쓸 판독 문장 30개를 매 렌더 만들고 버린다(실측 15.6ms vs 9.2ms).
      // 문장을 안 만들면 ctx 계약(hasVolume)도 따라오지 않는다 — Task 4·5 가 물려받을 표면이 하나 준다.
      var rows = MSIndicators.biases(ForgeCore, a.graph, a.input);
      rows.forEach(function (r) {
        var bar = document.createElement("span");
        var dir = r.bias > 0.02 ? " up" : r.bias < -0.02 ? " dn" : "";
        bar.className = "ob-bar" + dir;
        bar.style.height = Math.max(4, Math.round(Math.abs(r.bias) * 26)) + "px";
        comb.appendChild(bar);
      });
      if (cap) cap.textContent = rows.length + (Str ? Str.t.obCombCap : "");
    }

    // 3단계에 도달했을 때 처음 hello 가 나간다. 1~2단계에서 이탈하면 계정이 안 생겨
    // IP당 신규계정 상한도 안 쓴다. 화면이 "N개를 드렸습니다"라고 말할 때 그 N 은 서버가
    // 실제로 준 값이다 — 클라이언트가 그려놓고 나중에 맞추지 않는다(state.granted 에 그대로 담는다).
    // isInstalled 를 따로 안 보는 이유: 지갑 조회 자체가 backend 미설치를 "no-backend" 실패로
    // 얌전히 돌려준다(wallet.js noBackend) — 화면 입장에선 오프라인과 같은 경로라 분기가 하나 준다.
    //
    // "쏘는 것"과 "그리는 것"을 분리한다. state.grantStarted 는 네트워크 호출을 한 번으로
    // 막는 가드일 뿐, 화면까지 한 번만 그려도 된다는 뜻이 아니다 — 뒤로 갔다 다시 3단계로
    // 오면 step3() 가 매번 새 빈 .ob-grant div 를 만들기 때문에, 기억해 둔 state 로 다시
    // 칠하지 않으면 성공/실패 결과가 있었다는 사실 자체가 화면에서 사라진다(리뷰 지적).
    function grantBox() { return rootEl.querySelector(".ob-grant"); }

    function paintGrant() {
      var box = grantBox();
      if (!box) return;
      if (state.granted !== null) {
        box.textContent = String(state.granted) + (Str ? Str.t.obGranted : "");
      } else if (state.grantFailed) {
        box.textContent = Str ? Str.t.obGrantOffline : "";
        box.appendChild(retryBtn());
      } else {
        box.textContent = Str ? Str.t.obGranting : "";
      }
    }
    function retryBtn() {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn btn-ghost ob-retry";
      b.textContent = Str ? Str.t.obRetry : "";
      b.addEventListener("click", function () { fetchGrant(); });
      return b;
    }
    // 실제 호출. 자동 발신(draw() 끝)과 재시도 버튼 둘 다 이걸 부른다 — 자동은 한 번,
    // 재시도는 사용자가 누를 때마다.
    function fetchGrant() {
      state.grantFailed = false;
      paintGrant();   // "Setting up…" — box 는 항상 grantBox() 로 다시 찾는다(rootEl 기준)
      if (typeof MSWallet === "undefined") {
        state.granted = null;
        state.grantFailed = true;
        paintGrant();
        return;
      }
      MSWallet.get().then(function (r) {
        if (r && r.ok && r.state) {
          state.granted = r.state.balance;
          state.grantFailed = false;
        } else {
          state.granted = null;
          state.grantFailed = true;
        }
        paintGrant();
      });
    }

    function step3() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", Str ? Str.t.obH3 : ""));
      w.appendChild(el("p", "ob-sub", Str ? Str.t.obSub3 : ""));
      w.appendChild(el("div", "ob-grant", ""));
      // 가격표는 지갑 화면과 같은 출처(MSWallet.COSTS)에서 읽는다 — 여기서 다시 적으면
      // 두 화면이 갈린다(지갑 화면이 정본, screens/wallet.js).
      var C = (typeof MSWallet !== "undefined") ? MSWallet.COSTS : {};
      var tbl = frag("ob-costs");
      [["full", Str ? Str.t.obCostFull : ""], ["scan", Str ? Str.t.obCostScan : ""],
       ["slot", Str ? Str.t.obCostSlot : ""]].forEach(function (p) {
        var row = frag("ob-cost-row");
        row.appendChild(el("span", "ob-cost-name", p[1]));
        row.appendChild(el("span", "ob-cost-num", String(C[p[0]])));
        tbl.appendChild(row);
      });
      w.appendChild(tbl);
      return w;
    }

    function draw() {
      rootEl.innerHTML = "";
      var scr = frag("ob");
      scr.appendChild(progress(step));
      if (step === 1) scr.appendChild(step1());
      else if (step === 2) scr.appendChild(step2());
      else if (step === 3) scr.appendChild(step3());

      var nav = frag("ob-nav");
      if (step > 1) {
        var back = document.createElement("button");
        back.type = "button"; back.className = "btn btn-ghost ob-back";
        back.textContent = Str ? Str.t.obBack : "";
        back.addEventListener("click", function () { step = step - 1; draw(); });
        nav.appendChild(back);
      }
      var fwd = document.createElement("button");
      fwd.type = "button"; fwd.className = "btn btn-primary ob-next";
      fwd.textContent = Str ? Str.t.obNext : "";
      fwd.disabled = !canAdvance(step, state);
      fwd.addEventListener("click", function () {
        var n = next(step, state);
        if (n !== step) { step = n; draw(); }
      });
      nav.appendChild(fwd);
      scr.appendChild(nav);
      rootEl.appendChild(scr);

      // 캔버스가 DOM 에 붙은 뒤여야 폭을 잴 수 있다 — 그래서 여기다.
      if (step === 1) paintChart(scr);
      if (step === 2) paintComb(scr);
      // 발신은 한 번뿐이다(재시도는 버튼으로만) — 그리기는 매번이다. 뒤로/앞으로 오가며
      // 3단계를 다시 그릴 때 이미 결과가 있으면(성공/실패) 그 값으로 다시 칠한다 — 안 그러면
      // 새로 만들어진 빈 .ob-grant 가 아무 말도 없이 비어 보인다(리뷰 지적).
      if (step === 3) {
        if (!state.grantStarted) { state.grantStarted = true; fetchGrant(); }
        else paintGrant();
      }
    }

    draw();
  }

  return { STEPS: STEPS, canAdvance: canAdvance, next: next, render: render };
});
