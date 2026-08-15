// 온보딩 5단계. 셸 밖에서 돈다 — 완료 전까지 워치리스트/리포트/지갑은 그리지 않는다.
// 1·2단계는 번들 시계(onboarding-sample.js)로 진짜 엔진을 돌린다. 네트워크를 타면
// 첫 화면이 콜드 수신(실측 942ms)을 기다리게 되고, 그게 앱의 첫인상이 된다.
//
// 1: 예시 차트 → 2: 30지표 빗 → 3: 지갑 지급(첫 네트워크) → 4: 첫 종목 고르기 →
// 5: 위험 고지 + 약관 동의. 5단계 완료 버튼이 seedTo 로 워치리스트를 심고
// setOnboarded 로 동의를 남긴 뒤 opts.onDone() 을 부른다 — 그 전까지는 앱 셸을 그리지 않는다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSOnboarding = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STEPS = 5;
  var TF = "1day";
  var PAD = 10;
  // 동의 기록에 남는 값. 약관 본문을 고치면 이 값도 올린다 — 안 그러면 개정 후에
  // 누가 무엇에 동의했는지 말할 수 없다.
  var TERMS_VERSION = "terms-2026-08";
  // 온보딩 차트는 가격 패널 한 장이다 — 리포트의 4단 적층(커버 520px)이 필요 없다.
  // 지표 30종은 2단계의 빗이 대신 말한다.
  var CHART_H = 250;
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

  // 완료 시 워치리스트를 심는 부분만 떼어낸 순수 함수 — DOM 없이 검사할 수 있어야
  // "고른 것과 정확히 같은 목록"이 관문이 된다. store 를 인자로 받는 이유는 테스트가
  // 가짜 store 로 부를 수 있어야 하기 때문이다.
  // picked 는 심볼이 아니라 {sym, name} 목록이다 — 이름을 버리고 심으면 store.js 가
  // name = 심볼로 폴백해 행이 심볼을 두 번 찍고 회사명 검색이 죽는다(ticker-picker.js nameOf).
  function seedTo(store, picked) {
    picked.forEach(function (p) { store.addTicker(p.sym, p.name); });
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

    // ── 이 화면의 지배 규칙: draw() 는 매 이동마다 DOM 을 통째로 부수고 다시 만드는데,
    // state 는 그걸 넘어 살아남는다. 그래서 여기서 다루는 모든 것은 둘 중 하나여야 한다:
    //   (a) 반복되면 안 되는 것 → 래치(아래 셋)로 한 번만 실행한다.
    //   (b) 그 밖의 모든 것 → 매 그리기마다 state 로부터 다시 칠한다.
    // 이 둘을 섞으면 "state 는 참인데 화면은 초기값"인 화면이 나온다. 실제로 네 번 나왔다:
    // 3단계 지급 결과가 재진입 시 빈 칸이 됐고, 4단계 프리셋이 되살아났고, 5단계 동의
    // 체크박스가 꺼진 채로 완료 버튼만 열려 있었고(눈에 안 보이는 동의 — 법적 효력이 있는 자리),
    // 4단계 상한이 재진입마다 "지금" 선택 개수로 다시 계산돼 방금 뺀 자리를 다시 못 넣는
    // 비대칭으로 되살아났다(리뷰 지적, maxFor/state.maxPick 참고).
    // 래치는 셋뿐이며, 하나라도 늘리려면 (b) 로 해결되지 않는지 먼저 볼 것:
    //   grantStarted — 부수효과(네트워크 발신)를 한 번만. 그리기는 매번(paintGrant).
    //   pickInited   — 첫 그리기가 끝났다는 표시. 이후엔 프리셋 대신 state.picked 로 칠한다.
    //   finished     — 종결 동작(심기·동의·onDone)이 커밋됐다. 완료 버튼 더블탭 가드.
    // 래치와 결이 같은 네 번째 함정: "처음 진입했을 때 참이었던 값"도 매번 다시 재면 안 된다.
    // maxPick(4단계 상한)은 최초 진입 시 defaultPreset() 길이로 딱 한 번 고정해 state 에 둔다
    // (아래 maxFor 참고) — 재진입마다 state.picked.length 로 다시 재면, 하나 빼고 뒤로/앞으로만
    // 갔다 와도 상한이 줄어 방금 뺀 자리에 같은 걸 다시 못 넣는다.
    // fwd.disabled 만 믿을 수 없다 — 클릭 이벤트 자체는 disabled 여부와 무관하게 발생할 수
    // 있으므로(연속 두 탭이 disabled 반영 전에 둘 다 들어오는 경우) 핸들러 안에서 막는다.
    // (opts.onDone 은 중복 방어가 없다 — app.js 가 boot() 에 그대로 연결한다.)
    var state = { picked: [], agreed: false, pickInited: false, granted: null, grantFailed: false,
                  grantStarted: false, finished: false, maxPick: null, sample: o.sample || null };
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
        width: cssW, height: CHART_H, pad: PAD, tailBars: tail,
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

    // 첫 그리기의 프리셋. 이미 워치리스트가 있는 사람(지금까지 쓰던 테스터)이 온보딩을
    // 처음 만나는 순간 SEED 3종을 프리셋으로 주면, 완료와 함께 자기가 고르지 않은 3종이
    // 자기 목록에 얹힌다 — 이 단계가 없애려던 바로 그 상태가 되돌아온다. 그래서 목록이
    // 비어 있지 않으면 그 목록이 프리셋이다. 목록이 있다고 온보딩을 건너뛰지는 않는다 —
    // 동의 기록은 법적 효력이 있는 자리라 한 번은 받아야 한다.
    // {sym,name} 으로 돌려준다 — 심볼만 주면 CURATED 밖 종목(예: PLTR 하나뿐인 워치리스트)이
    // 피커에서 이름 없이 그려진다(ticker-picker.js 의 resolved 시딩이 이 이름을 쓴다).
    function defaultPreset() {
      var wl = MSStore.getWatchlist();
      var src = (wl && wl.length) ? wl : MSStore.SEED;
      return src.map(function (x) { return { sym: x.sym, name: x.name }; });
    }

    // 상한 3은 "처음 시작하는" 사람 기준(obSub4: "Three slots to start")이다. 기존
    // 워치리스트를 프리셋으로 받은 사람이 3종보다 많이 갖고 있으면(온보딩을 다시 보는
    // 경우 등) 3에 못 미치게 강제로 깎지 않는다 — 지우는 것만 되고 그 안에서 다시 넣는
    // 것은 막히는 비대칭을 만들기 때문이다(뺀 건 항상 되는데, 상한에 걸려 있으면 같은
    // 자리에 다른 걸 못 넣는다 — "이제 자리가 없다" 안내만 남고 되돌릴 길이 없다).
    // 프리셋이 3 이하면 평소처럼 3.
    function maxFor(presetItems) {
      return Math.max(3, presetItems.length);
    }

    // 프리셋은 처음 그릴 때만 쓴다. 뒤로/앞으로를 오가며 다시 그릴 때는 state.picked
    // (빈 배열이어도)로 칠한다 — 안 그러면 사용자가 프리셋을 전부 해제해도 재진입마다
    // 되살아난다(3단계 grantBox 와 같은 리뷰 지적).
    function step4() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", Str ? Str.t.obH4 : ""));
      w.appendChild(el("p", "ob-sub", Str ? Str.t.obSub4 : ""));
      var presetItems = state.pickInited ? state.picked : defaultPreset();
      // 상한은 "처음 진입했을 때" 워치리스트 크기로 딱 한 번 고정한다(state.maxPick) — 재진입마다
      // presetItems(=state.picked, 지금 고른 개수)로 다시 재면 하나 뺀 뒤 뒤로/앞으로만 갔다 와도
      // 상한이 줄어 방금 뺀 자리에 다시 못 넣는다(리뷰 지적: 3b1c817 이 없애려던 바로 그 비대칭).
      if (state.maxPick == null) state.maxPick = maxFor(defaultPreset());
      var picker = MSTickerPicker.create({
        multi: true, max: state.maxPick, preset: presetItems,
        // 심볼이 아니라 {sym,name} 을 담는다 — 이름을 여기서 흘리면 seedTo 가 이름 없이 심는다.
        onChange: function (sel, items) {
          state.picked = items;
          state.pickInited = true;
          var fwd = rootEl.querySelector(".ob-next");
          if (fwd) fwd.disabled = !canAdvance(4, state);
        }
      });
      state.picked = picker.selectedItems();
      state.pickInited = true;
      w.appendChild(picker.el);
      return w;
    }

    function step5() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", Str ? Str.t.obH5 : ""));
      w.appendChild(el("p", "ob-risk", Str ? Str.t.obRisk : ""));
      var lab = document.createElement("label");
      lab.className = "ob-agree";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      // 재진입 시 state 에서 다시 칠한다(위 §래치 규칙 (b)). 이 한 줄이 없으면 체크 후
      // 4단계로 갔다 오면 새 체크박스는 꺼진 채인데 state.agreed 는 살아 있어 완료 버튼만
      // 열려 있다 — 화면상 동의하지 않은 상태로 동의 기록이 남는다.
      cb.checked = !!state.agreed;
      cb.addEventListener("change", function () {
        state.agreed = cb.checked;
        var fwd = rootEl.querySelector(".ob-next");
        if (fwd) fwd.disabled = !canAdvance(5, state);
      });
      lab.appendChild(cb);
      lab.appendChild(el("span", "ob-agree-txt", Str ? Str.t.obAgree : ""));
      w.appendChild(lab);
      w.appendChild(el("p", "ob-sub", Str ? Str.t.obFree : ""));
      return w;
    }

    function draw() {
      rootEl.innerHTML = "";
      var scr = frag("ob");
      scr.appendChild(progress(step));
      if (step === 1) scr.appendChild(step1());
      else if (step === 2) scr.appendChild(step2());
      else if (step === 3) scr.appendChild(step3());
      else if (step === 4) scr.appendChild(step4());
      else if (step === 5) scr.appendChild(step5());

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
      fwd.textContent = (step === STEPS) ? (Str ? Str.t.obFinish : "") : (Str ? Str.t.obNext : "");
      fwd.disabled = !canAdvance(step, state);
      fwd.addEventListener("click", function () {
        if (step === STEPS) {
          if (state.finished || !canAdvance(STEPS, state)) return;
          state.finished = true;
          fwd.disabled = true;
          // seedTo/setOnboarded/onDone 중 하나라도 던지면 래치가 켜진 채 멈춘다 — 그러면 버튼은
          // 영원히 비활성이고 onDone 도 못 불려 앱이 5단계에 갇힌다. 오늘은 store.js write() 가
          // localStorage 예외를 전부 삼켜 이 경로가 실제로 던질 일이 없지만, 그건 이 가드가 아니라
          // 다른 파일의 방어력에 기대는 것이다 — 여기 스스로 복구할 수 있어야 한다.
          var ok = false;
          try {
            seedTo(MSStore, state.picked);
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

  return { STEPS: STEPS, canAdvance: canAdvance, next: next, seedTo: seedTo, render: render };
});
