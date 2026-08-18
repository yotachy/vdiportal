// 온보딩 7단계 — 3막 재설계 진행 중(설계서 map/docs/superpowers/specs/
// 2026-08-18-moneyscoop-onboarding-redesign.md). **화면 수는 유지한다**(그 설계서 O4) — 이후
// 태스크들이 slot 을 하나씩(step2..step7) 통째로 다시 쓴다. 아직 손 안 댄 slot 은 이전
// 설계(DESIGN-INVENTORY §2, t17)의 내용을 그대로 들고 있다 — 각 태스크는 **자기 slot 만**
// 고치고 다른 slot 의 내용을 옮기거나 미리 당겨 쓰지 않는다(브리프가 파일 목록으로 그
// 경계를 긋는다). 완료 전까지 워치리스트/리포트/지갑은 그리지 않는다.
//
//   1 콜드 오픈(11a)                — 예시 구간 · 찍기 · 당신/앱/실제 3열. [재설계 완료]
//   2 같은 구간, 32개 전부          — 5개가 아니라 32개 전부의 동의·반대·무판정·자백(못
//                                    읽음), 5도구 판정과 나란히. [재설계 완료]
//   3 성향                          — 고르면 같은 구간의 판정·근거가 실제로 갱신된다.
//                                    [재설계 완료 — 이 커밋. 옛 위험고지(약관 체크박스)는
//                                    이 슬롯에서 나갔다 — 다음 태스크가 새 4단계(동의)에서
//                                    다시 짓는다, 자리 이름을 재사용하지 않는다]
//   4 기본분석 체험(16a)            — 종목 하나 고르고 실제로 돌린다. 체험 1/3. [옛 내용 그대로]
//   5 심화분석 체험(16b)            — 무엇이 달라지는지 두 막대로. 체험 2/3. [옛 내용 그대로]
//   6 전문분석 체험(16c)            — 슬라이더 하나만 열어 직접 만지게 한다. 체험 3/3. [옛 내용 그대로]
//   7 완료·가격표·지급(17a)         — 세 값을 한 표에 모으고 **가격은 이제야** 공개한다. [옛 내용 그대로]
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
  else MSGlobals.define("MSOnboarding", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STEPS = 7;
  var TERMS_VERSION = "2026-08-17";
  var TF = "1day";
  // CHART_H 는 예전엔 가격 패널 한 장(240)이었다 — 2026-08-18 재설계로 거래량 서브패널이
  // 붙어 그만큼 키운다(chart-layout.js RATIOS 가 price:volume 비율을 자동 분배한다).
  var CHART_H = 300, PAD = 10;
  var GUESS_CUT = 12;      // 1단계에서 가려 두는 봉 수 — 눈으로 방향이 읽힐 만큼만
  // 1단계가 작도하는 도구 정확히 3종 — **힌트 줄 수·작도 오버레이·판독 근거가 전부 이 배열
  // 하나에서 파생된다**(중복 상수 금지). MA·볼린저는 가격 패널 오버레이, 거래량은 서브패널이다.
  var TOOLS = ["ma", "bollinger", "volume"];
  // 근거/반대 분류 문턱 — MSIndicators.EPS(0.02, "반대 의견"용)보다 넉넉하다. 실제 종목으로
  // 시험해 보니 bias 0.04 짜리 MA 가 "혼조, 교차 없음"이라는 텍스트를 달고도 부호만으로
  // "근거"에 꼽혔다 — 문구와 분류가 어긋나 보였다. 절대값이 이 문턱 아래면 텍스트 그대로
  // (혼조·중립 등) "판독" 칸으로 보내고, 방향이 뚜렷할 때만 근거/반대로 가른다.
  // 2026-08-19 재선별(전형적 이동폭) 표본으로 재점검: ma 0.677·bollinger 0.299 는 근거,
  // volume −0.125("보통 거래량 · 0.94배 · 약화")는 이 문턱을 살짝 넘겨 반대로 갈린다 —
  // 텍스트도 실제로 "약화"라 말해 분류와 문구가 맞는다(0.12 유지, 조정 불필요).
  var TOOL_EPS = 0.12;
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
    // 2단계(32도구 재설계)는 보여주는 화면이라 별도 입력을 요구하지 않는다.
    // 3단계(성향)는 4종 중 1개가 **항상** 선택돼 있어야 한다는 불변을 이 자리에서 지킨다
    // (기본값이 이미 채워지므로 실사용에서 막히는 일은 없다 — 이 검사는 "선택 없이 진행할
    // 수 있는 상태"가 애초에 만들어지지 않게 하는 것이 목적이다).
    if (step === 3) return !!state.style;
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
  // 1단계 x축 기준 표기용 — 캔들의 "YYYY-MM-DD" 를 "YYYY.MM"(연월)·"YYYY.MM.DD"(기준일)로.
  // 데이터에서 계산한다(리터럴로 적으면 재선별 표본에서 곧장 낡는다).
  function ym(t) { return (t || "").slice(0, 7).replace("-", "."); }
  function dotDate(t) { return (t || "").replace(/-/g, "."); }

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

    // ── 1단계 전용: "찍기 전에 보이는 것"만으로 엔진을 돌린다 ─────────────────────────
    // sliced() 의 228봉(= GUESS_CUT 만큼 가린 구간)으로 계산한다 — 뒤 12봉을 섞으면 "찍기
    // 전에 이미 정답을 알고 판정한" 것이 된다. 엔진은 render() 가 불릴 때 **실제로** 돈다
    // (미리 계산해 굽지 않는다) — 그래야 "지금 계산한 것"이라는 증명이 성립한다. 그래프·
    // 입력 조립은 runTier("basic") 과 똑같아야 한다(두 벌이면 화면과 판정이 갈린다) — 그래서
    // runTier 를 그대로 불러 쓰고, 작도·판독에 필요한 MA·볼린저·거래량 분석만 얹는다.
    var _visCache = null, _visCacheSample = null;
    function visibleAnalysis() {
      var s = sample();
      if (!s) return null;
      if (_visCache && _visCacheSample === s) return _visCache;
      var d = sliced();
      if (!d || typeof ForgeCore === "undefined") return null;
      var base = runTier(d, "basic");
      if (!base) return null;
      var an = { graph: base.graph, input: base.input, out: base.out };
      an.ma = ForgeCore.analyzeMA(d.price, { len: 20, ema: false });
      an.bb = ForgeCore.analyzeBollinger(d.price, { len: 20, k: 2 });
      an.va = ForgeCore.analyzeVolume(d.price, base.input.volume || null, {});
      an.readings = (typeof MSIndicators !== "undefined")
        ? MSIndicators.readings(ForgeCore, base.graph, base.input, MSIndicators.ctxFrom(base.input))
        : [];
      _visCache = an; _visCacheSample = s;
      return an;
    }

    // TOOLS 순서 그대로 판독 행을 뽑는다 — 그려진 도구와 근거 목록이 항상 같은 순서·같은 개수다.
    function toolReadingRows() {
      var an = visibleAnalysis();
      if (!an || !an.readings) return [];
      var out = [];
      TOOLS.forEach(function (type) {
        var i, row = null;
        for (i = 0; i < an.readings.length; i++) if (an.readings[i].type === type) { row = an.readings[i]; break; }
        if (row) out.push(row);
      });
      return out;
    }

    function verdictWord(regime) {
      return regime === "bull" ? MSStr.t.rpBullish : regime === "bear" ? MSStr.t.rpBearish : MSStr.t.rpFlat;
    }

    // regime → 방향 부호. readingBlock(근거/반대 분류)과 3열 대조(앱 열의 맞음/틀림)가
    // 같은 방향 규칙을 써야 한다 — 두 곳에 따로 적으면 규칙이 갈릴 수 있다.
    function regimeDir(regime) { return regime === "bull" ? 1 : regime === "bear" ? -1 : 0; }

    // 앱의 판정(regime)이 실제 결과(actualUp)와 맞았는지 — "right"/"wrong"/"flat"(무판정)
    // 세 갈래. 문구(appMeaning)와 강조색(CSS .is-right/.is-wrong) 이 같은 규칙을 쓴다.
    function appOutcome(regime, actualUp) {
      var dir = regimeDir(regime);
      if (dir === 0) return "flat";
      return ((dir > 0) === actualUp) ? "right" : "wrong";
    }

    // 앱 열의 판정과 실제 결과를 대조한 해석문. 맞은 표본만 골라 보여주면 광고지다 — 세
    // 갈래(맞음/틀림/무판정) 모두 실제로 렌더된다.
    function appMeaning(outcome) {
      return outcome === "flat" ? MSStr.t.obAppFlatMeaning
           : outcome === "right" ? MSStr.t.obAppRightMeaning : MSStr.t.obAppWrongMeaning;
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
    // 힌트(도구 이름 + 한 줄 설명)는 TOOLS 배열 하나에서 파생된다 — 여기서 이름을 다시
    // 늘어놓으면 작도·힌트 개수가 갈릴 수 있다.
    function toolHint(type) {
      return type === "ma" ? MSStr.t.obToolMaHint
           : type === "bollinger" ? MSStr.t.obToolBbHint
           : type === "volume" ? MSStr.t.obToolVolHint : "";
    }

    function toolHints() {
      var wrap = frag("ob-tools");
      TOOLS.forEach(function (type) {
        var row = frag("ob-tool");
        row.appendChild(el("span", "ob-tool-name", MSStr.ind(type)));
        row.appendChild(el("span", "ob-tool-hint", toolHint(type)));
        wrap.appendChild(row);
      });
      return wrap;
    }

    // 엔진 판독 — 찍기 전에 실제로 보인 228봉(visibleAnalysis)만 근거로 삼는다. **판정 방향과
    // 같은 근거 / 반대 근거 / 뚜렷하지 않은 판독** 셋으로 가른다(TOOL_EPS). 이건 report.js 의
    // REASONING·AGAINST 와 같은 근거지 — 온보딩이 새 작도·새 판독 경로를 만든 게 아니다.
    function readingBlock() {
      var wrap = frag("ob-read");
      var an = visibleAnalysis();
      var rows = toolReadingRows();
      if (!an || !an.out || !rows.length) {
        wrap.appendChild(el("p", "ob-read-empty", MSStr.t.obReadUnavailable));
        return wrap;
      }
      var regime = an.out.verdict.regime;
      wrap.appendChild(el("p", "ob-read-verdict", MSStr.t.obReadVerdictA + verdictWord(regime)));
      var want = regimeDir(regime);
      var forRows = [], againstRows = [], flatRows = [];
      rows.forEach(function (r) {
        if (want === 0 || Math.abs(r.bias) <= TOOL_EPS) { flatRows.push(r); return; }
        if ((r.bias > 0 ? 1 : -1) === want) forRows.push(r); else againstRows.push(r);
      });
      function section(cls, headText, list) {
        if (!list.length) return;
        var sec = frag(cls);
        sec.appendChild(el("p", "ob-read-label", headText));
        list.forEach(function (r) {
          var row = frag("ob-read-row");
          row.appendChild(el("span", "ob-read-name", MSStr.ind(r.type)));
          row.appendChild(el("span", "ob-read-text", r.text));
          sec.appendChild(row);
        });
        wrap.appendChild(sec);
      }
      section("ob-read-for", MSStr.t.obReadForHead, forRows);
      section("ob-read-against", MSStr.t.rpAgainst, againstRows);
      section("ob-read-flat", MSStr.t.obReadFlatHead, flatRows);
      return wrap;
    }

    // x축 기준 — "일봉인지 주봉인지, 어느 구간인지" 원 판정에 대한 답. 화면에 실제로 그려진
    // 데이터(찍기 전=sliced, 찍은 뒤=sample 전체)와 같은 출처를 읽는다 — paintGuess 와 다른
    // 구간을 말하면 라벨과 그림이 어긋난다.
    function periodLabel() {
      var d = state.guessed ? sample() : sliced();
      if (!d || !d.candle || !d.candle.length) return frag("ob-period");
      var first = d.candle[0].t, last = d.candle[d.candle.length - 1].t;
      return el("p", "ob-period",
        MSStr.t.rpDaily + MSStr.t.obPeriodSep + ym(first) + MSStr.t.obPeriodDash + ym(last));
    }

    // 3열 대조 — 당신 / 앱 / 실제. 세 열 모두 MSObQuality.metric() 으로 만든다(값+기준 시점을
    // 한 그룹으로 묶는 Q1) — asOf 없이는 만들 수 없으므로 이 화면이 그 규칙을 어길 수 없다.
    // 앱 열만 stat() 으로 한 겹 더 감싼다 — 판정과 실제가 같았는지 해석(Q5)이 곧 "맞았는지
    // 틀렸는지"이고, 이게 이 화면의 핵심 대조다. 확신 퍼센트는 넣지 않는다(값은 단어뿐이다,
    // 5도구는 값 여섯 개라 퍼센트로 쓰면 확률로 오독된다).
    function columnsBlock() {
      var wrap = frag("ob-cols");
      var an = visibleAnalysis();
      var a = guessAnswer();
      if (!an || !an.out || !a) return wrap;   // 엔진 불가·정답 계산 불가 — readingBlock 과 같은 원칙
      var d = sliced(), full = sample();
      var cutoffAsOf = dotDate(d && d.candle.length ? d.candle[d.candle.length - 1].t : "");
      var revealAsOf = dotDate(full && full.candle.length ? full.candle[full.candle.length - 1].t : "");
      var regime = an.out.verdict.regime;
      var youWord = state.guessed === "up" ? MSStr.t.obGuessUp : MSStr.t.obGuessDown;
      var appWord = verdictWord(regime);
      var actualWord = a.up ? MSStr.t.obGuessActualUp : MSStr.t.obGuessActualDown;

      var outcome = appOutcome(regime, a.up);
      var youMetric = MSObQuality.metric({ value: youWord, asOf: cutoffAsOf, label: MSStr.t.obColYou });
      var appMetric = MSObQuality.metric({ value: appWord, asOf: cutoffAsOf, label: MSStr.t.obColApp });
      var appStat = MSObQuality.stat({ metric: appMetric, meaning: appMeaning(outcome) });
      var actualMetric = MSObQuality.metric({ value: actualWord, asOf: revealAsOf, label: MSStr.t.obColActual });

      // 클래스 문자열을 하나로 이어붙이지 않는다 — "ob-col " 처럼 공백을 낀 리터럴은
      // screens/ 영어잔존 게이트(el()·className= 리터럴만 예외로 보는 shape 규칙)를 못
      // 벗어나 "col" 같은 단어가 잔존 영어로 잡힌다. 완결된 케밥 토큰끼리만 리터럴로 두고
      // 런타임에 공백으로 잇는다.
      function col(cls, node) { var c = frag("ob-col"); c.className = c.className + " " + cls; c.appendChild(node); return c; }
      wrap.appendChild(col("ob-col-you", youMetric));
      // is-right/is-wrong/is-flat — 색만 바꾼다(배경·글자색, 좌측 세로 라인 금지 규칙).
      wrap.appendChild(col("ob-col-app" + " is-" + outcome, appStat));
      wrap.appendChild(col("ob-col-actual", actualMetric));
      return wrap;
    }

    // "앱은 도구 5개만 보고 이렇게 말했습니다" — 2단계(심화분석 32개)를 벌어들이는 줄. 5는
    // MSGraph.BASIC.length 에서 읽는다(기본분석 지표 목록이 늘면 문구도 같이 는다).
    function appSawNote() {
      var n = (typeof MSGraph !== "undefined" && MSGraph.BASIC && MSGraph.BASIC.length) ? MSGraph.BASIC.length : 5;
      return el("p", "ob-app-note", MSStr.t.obAppSawA + n + MSStr.t.obAppSawB);
    }

    function step1() {
      var w = frag("ob-step");
      // "예시 데이터"임을 헤드라인보다 먼저 읽게 한다(2026-08-19 리뷰 — 화면 맨 아래 작은
      // 캡션이던 예전 위치는 골드 "맞히셨습니다!" 옆에서 존재감이 없었다). CSS 도 이 자리를
      // 전제로 오버라인 스타일이다.
      w.appendChild(el("p", "ob-over", MSStr.t.obSampleNote));
      w.appendChild(el("h1", "ob-h", MSStr.t.obH1));
      w.appendChild(el("p", "ob-sub", MSStr.t.obGuessAsk));
      // 주기·기간(x축 기준) — "일봉인지 주봉인지, 어느 구간인지 모른다"던 원 판정에 대한 답.
      // 차트 바로 위, 캔버스보다 먼저 읽힌다.
      w.appendChild(periodLabel());
      var wrap = frag("ob-canvas-wrap");
      var cv = document.createElement("canvas");
      cv.className = "ob-canvas";
      wrap.appendChild(cv);
      w.appendChild(wrap);

      if (!state.guessed) {
        w.appendChild(toolHints());
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
        // 당신 / 앱 / 실제 3열 대조 — 세 열이 나란히 놓여야 "이 앱이 나보다 나은가"를 사용자가
        // 스스로 판정한다. 이어서 "앱은 도구 5개만 봤다"를 못박아 다음 단계(32개)를 벌어들인다.
        w.appendChild(columnsBlock());
        w.appendChild(appSawNote());
        w.appendChild(readingBlock());
        // 틀려도 지지 않는다 — 맞혔으면 "감이 좋다, 그걸 32개 도구로 매일 한다"는 쪽으로,
        // 틀렸으면 "그래서 도구를 32개 읽는다, 하나로는 이렇게 놓친다"는 쪽으로. 두 갈래
        // 모두 렌더된다(한쪽만 그리고 넘어가지 않는다). 32는 ForgeCore.indicatorCount 를
        // 읽는다 — 지표가 늘면 문구도 같이 는다.
        var n = (typeof ForgeCore !== "undefined" && typeof ForgeCore.indicatorCount === "number")
          ? ForgeCore.indicatorCount : 32;
        var tailText = state.guessRight
          ? (MSStr.t.obTailRightA + n + MSStr.t.obTailRightB)
          : (MSStr.t.obTailWrongA + n + MSStr.t.obTailWrongB);
        w.appendChild(el("p", "ob-tail", tailText));
      }
      return w;
    }

    // 캔들 + MA·볼린저(가격 패널 오버레이) + 거래량(서브패널). 예측선은 안 그린다 — 1단계는
    // "직접 찍어보라"는 화면이고, 엔진의 답을 먼저 보여주면 찍을 이유가 사라진다. 찍은 뒤에는
    // 가렸던 봉을 열어 실제를 보여줄 뿐, 오버레이는 계속 visibleAnalysis(228봉)로 그린다 —
    // 그래서 곡선이 정확히 가려졌던 경계에서 멈춘다: "여기까지 보고 판정했다"가 그대로 드러난다.
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
        pad: PAD, tailBars: 60, panels: ["price", "volume"]
      });
      ctx.clearRect(0, 0, cssW, CHART_H);
      if (typeof MSLayers !== "undefined") MSLayers.resetLabels(cssW, CHART_H);
      MSChartDraw.drawAxes(ctx, lay, d.candle, col);
      MSChartDraw.drawCandles(ctx, lay, d.candle, col);
      var an = visibleAnalysis();
      if (an && typeof MSLayers !== "undefined") {
        var Mp = Object.assign({}, lay.panels.price.M, { badges: false });
        MSLayers.ma(ctx, an.ma, Mp);
        MSLayers.bollinger(ctx, an.bb, Mp);
      }
      if (an && typeof MSPanels !== "undefined" && lay.panels.volume) {
        var vr = lay.panels.volume.rect;
        ctx.save(); ctx.translate(vr.x, vr.y);
        MSPanels.volume(ctx, vr.w, vr.h, an.va, Infinity);
        ctx.restore();
      }
    }

    // ── 2단계: 같은 구간, 32개 전부(설계서 §4.2, O2 의 증거) ───────────────────────
    // 1단계가 "5개만 봤다"고 못박은 것에 대한 답이다. **같은 절단선(sliced, 228봉)**을
    // 32개 도구 전부로 다시 본다 — 다른 구간을 쓰면 5도구 판정과 32도구 판정이 서로 다른
    // 정보로 계산한 것이 되어 "나란히 비교"가 성립하지 않는다.
    var FULL32_AGREE_SHOW = 5;    // 대표로 먼저 보이는 동의 줄 수(펼치기 전)
    var FULL32_FLAT_SHOW = 4;     // 대표로 먼저 보이는 무판정 줄 수(펼치기 전)
    var FULL32_REFUSED_SHOW = 4;  // 대표로 먼저 보이는 자백(못 읽음) 줄 수(펼치기 전)
    // 반대는 여기 없다 — **반대는 개수와 무관하게 항상 전부 보인다**(컨트롤러 판정: 대표
    // 몇 줄 + 펼치기는 동의·무판정·자백에만 적용된다. 불리한 근거를 접어 숨기지 않는다는 것이
    // O2 의 실체다).

    var _full32Cache = null, _full32CacheSample = null;
    function visibleFull32() {
      var s = sample();
      if (!s) return null;
      if (_full32Cache && _full32CacheSample === s) return _full32Cache;
      var d = sliced();
      if (!d || typeof ForgeCore === "undefined" || typeof MSIndicators === "undefined") return null;
      var full = runTier(d, "full");
      if (!full) return null;
      var ctx = MSIndicators.ctxFrom(full.input);
      var rows = MSIndicators.readings(ForgeCore, full.graph, full.input, ctx);
      var noDir = MSIndicators.noDirRows(ForgeCore, full.input, ctx);
      var regime = full.out.verdict.regime;
      var cls = classifyFull32(full.graph, regime, rows, noDir);
      var an = { graph: full.graph, input: full.input, out: full.out, regime: regime,
                 agree: cls.agree, dissent: cls.dissent, flat: cls.flat, refused: cls.refused,
                 total: rows.length + noDir.length };
      _full32Cache = an; _full32CacheSample = s;
      return an;
    }

    // 동의/반대/무판정/자백(못 읽음) 네 통으로 가른다. **엔진 함수를 직접 부른다** —
    // 문턱을 여기서 재구현하면 report.js 와 규칙이 갈릴 수 있다(2026-08-19 리뷰 Important:
    // 실제로 갈렸었다 — 거래량 없는 종목에서 mfi·cmf 가 스스로 "이 종목은 거래량 데이터가
    // 없습니다"라고 자백하는데 옛 코드는 그걸 "동의"로 세고 있었다). 그래서:
    //   1. MSReadings.voiced(rows) 로 **자백한 행**(NO_VOL·NO_SWINGS·NONE)을 먼저 걷어낸다
    //      — report.js buildAgainst() 가 opposing() 을 부르기 **전에** 하는 바로 그 단계.
    //   2. voiced 위에서 MSIndicators.opposing(FC, graph, null, regime, voiced) 을 그대로
    //      불러 반대를 얻는다(report.js 와 같은 호출 — data 자리는 rows 를 줬으니 null).
    //   3. voiced 에서 반대가 아닌 것 중 문턱(EPS)을 넘긴 건 동의, 못 넘긴 건 무판정.
    //   4. 자백한 행은 별도 통("자백")으로 노출한다 — 숫자만 조용히 32에서 빠지면 그 자체가
    //      불투명하다. 32 = 동의+반대+무판정+자백 이어야 한다.
    // 판정 자체가 중립이면(want===0) 반대·동의 둘 다 정의되지 않는다 — voiced 전체가 무판정.
    function classifyFull32(graph, regime, rows, noDir) {
      rows = rows || [];
      var want = regimeDir(regime);
      var voicedRows = (typeof MSReadings !== "undefined") ? MSReadings.voiced(rows) : rows;
      var refused = (typeof MSReadings !== "undefined")
        ? rows.filter(function (r) { return MSReadings.isRefusal(r.text); })
        : [];
      var dissent = (want !== 0 && typeof MSIndicators !== "undefined")
        ? MSIndicators.opposing(ForgeCore, graph, null, regime, voicedRows) : [];
      var dissentSet = {};
      dissent.forEach(function (r) { dissentSet[r.type] = true; });
      var eps = (typeof MSIndicators !== "undefined" && typeof MSIndicators.EPS === "number") ? MSIndicators.EPS : 0.02;
      var agree = [], flat = [];
      voicedRows.forEach(function (r) {
        if (dissentSet[r.type]) return;                          // 이미 반대로 뽑혔다
        if (want === 0 || Math.abs(r.bias) <= eps) { flat.push(r); return; }
        agree.push(r);   // voiced(자백 아님) + 반대 아님 + 문턱 넘음 = 판정과 같은 방향
      });
      flat = flat.concat(noDir || []);
      function byAbsBias(a, b) { return Math.abs(b.bias || 0) - Math.abs(a.bias || 0); }
      agree.sort(byAbsBias);
      return { agree: agree, dissent: dissent, flat: flat, refused: refused };
    }

    // 도구 한 줄 — 이름(영어) · 무엇을 봤는지(엔진이 지금 계산한 문장, 실측 수치가 이미
    // 문장 안에 있다) · 방향 기여도(부호 있는 수치). trend·phasefold 는 bias 가 없다
    // (readings.js 가 문서화한 구조적 예외 — report.js 도 같은 예외를 갖는다) — 숫자 없이
    // 문장만 보여준다. **자백(못 읽음) 행도 수치를 안 보인다** — bias 필드는 합성 거래량
    // 등으로 계산된 값이 남아 있을 수 있지만, 그 값 자체가 "사실이 아니다"(readings.js
    // 머리말 규율 4) — 텍스트가 이미 왜 못 읽었는지를 말하므로 숫자를 보태면 오히려
    // "그래도 뭔가 쟀다"는 인상을 준다.
    function full32Row(r, showBias) {
      var row = frag("ob32-row");
      row.appendChild(el("span", "ob32-name", MSStr.ind(r.type)));
      row.appendChild(el("span", "ob32-text", r.text));
      if (showBias !== false && typeof r.bias === "number")
        row.appendChild(el("span", "ob32-bias", (r.bias > 0 ? "+" : "") + r.bias.toFixed(2)));
      return row;
    }

    // collapsible=false 면 개수와 무관하게 전부 그린다(반대 전용 — 위 주석 참고).
    // 클래스 문자열을 하나로 이어붙이지 않는다 — "ob32-sec ob32-sec-" 처럼 공백을 낀
    // 리터럴은 screens/ 영어잔존 게이트(el()·className= 리터럴만 예외로 보는 shape 규칙)를
    // 못 벗어난다(columnsBlock 의 col() 과 같은 이유·같은 처방).
    function full32Section(kind, label, list, collapsible, showN, showBias) {
      var sec = frag("ob32-sec");
      sec.className = sec.className + " ob32-sec-" + kind;
      var head = frag("ob32-sec-head");
      head.appendChild(el("span", "ob32-sec-label", label));
      head.appendChild(el("span", "ob32-sec-count", String(list.length)));
      sec.appendChild(head);
      if (!list.length) return sec;
      var open = !collapsible || !!(state.ob32Open && state.ob32Open[kind]);
      var shown = (collapsible && !open) ? list.slice(0, showN) : list;
      var rows = frag("ob32-rows");
      shown.forEach(function (r) { rows.appendChild(full32Row(r, showBias)); });
      sec.appendChild(rows);
      if (collapsible && list.length > showN) {
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "ob32-expand";
        btn.textContent = open ? MSStr.t.ob32Collapse : (list.length - showN) + MSStr.t.ob32ExpandSuffix;
        btn.addEventListener("click", function () {
          state.ob32Open = state.ob32Open || {};
          state.ob32Open[kind] = !open;
          draw();
        });
        sec.appendChild(btn);
      }
      return sec;
    }

    function full32CmpRow(label, value) {
      var r = frag("ob32-cmp-row");
      r.appendChild(el("span", "ob32-cmp-k", label));
      r.appendChild(el("span", "ob32-cmp-v", value));
      return r;
    }

    function step2() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", MSStr.t.obH2));
      w.appendChild(el("p", "ob-sub", MSStr.t.obSub2));
      // 같은 절단선(1단계가 찍기 전 본 228봉)임을 다시 밝힌다 — state.guessed 와 무관하게
      // 항상 sliced() 를 읽는다(1단계의 periodLabel() 은 찍은 뒤 전체 구간으로 바뀌지만,
      // 이 화면은 "그때 봤던 것과 같은 정보"를 재는 화면이라 계속 절단선 쪽을 본다).
      var d = sliced();
      if (d && d.candle && d.candle.length) {
        w.appendChild(el("p", "ob-period",
          MSStr.t.rpDaily + MSStr.t.obPeriodSep + ym(d.candle[0].t) + MSStr.t.obPeriodDash + ym(d.candle[d.candle.length - 1].t)));
      }

      var basic = visibleAnalysis();
      var an = visibleFull32();
      if (an) state.full32 = an;   // 3단계(성향)가 비교 기준으로 쓴다

      if (!an || !basic) {
        w.appendChild(el("p", "ob-read-empty", MSStr.t.obReadUnavailable));
        return w;
      }

      var n5 = (typeof MSGraph !== "undefined" && MSGraph.BASIC && MSGraph.BASIC.length) ? MSGraph.BASIC.length : 5;
      var n32 = (typeof ForgeCore !== "undefined" && typeof ForgeCore.indicatorCount === "number") ? ForgeCore.indicatorCount : 32;
      var regime5 = basic.out.verdict.regime, regime32 = an.regime;
      var cmp = frag("ob32-cmp");
      cmp.appendChild(full32CmpRow(n5 + MSStr.t.obVerdictLabelSuffix, verdictWord(regime5)));
      cmp.appendChild(full32CmpRow(n32 + MSStr.t.obVerdictLabelSuffix, verdictWord(regime32)));
      w.appendChild(cmp);

      // 같을 때도 이 화면은 성립한다("더 많은 도구가 같은 결론을 지지했다") — 다를 때만
      // 재고 넘어가지 않는다. 같은 표본에서 5도구·32도구가 실제로 같을 수 있다(실측 확인됨).
      var same = regime5 === regime32;
      var note = same ? MSStr.t.ob32SameNote
        : (n5 + MSStr.t.ob32DiffA + verdictWord(regime5) + MSStr.t.ob32DiffB +
           n32 + MSStr.t.ob32DiffC + verdictWord(regime32) + MSStr.t.ob32DiffD);
      w.appendChild(el("p", "ob32-verdict-note" + (same ? " is-same" : " is-diff"), note));

      w.appendChild(full32Section("agree", MSStr.t.ob32AgreeHead, an.agree, true, FULL32_AGREE_SHOW));
      w.appendChild(full32Section("dissent", MSStr.t.rpAgainst, an.dissent, false));
      w.appendChild(full32Section("flat", MSStr.t.ob32FlatHead, an.flat, true, FULL32_FLAT_SHOW));
      // 자백(못 읽음) — 숫자를 안 보인다(showBias=false, full32Row 주석 참고). 이 표본이
      // 실거래량을 가진 한 대개 0~1건이지만, 거래량 없는 종목에서는 5~6건까지 늘어난다
      // (mfi·cmf·volume·vwap·volumeprofile) — 그래서 접어도 되되 **숨기지는 않는다**.
      w.appendChild(full32Section("refused", MSStr.t.ob32RefusedHead, an.refused, true, FULL32_REFUSED_SHOW, false));

      return w;
    }

    // ── 3단계: 성향(설계서 §4.3, Task 5) ────────────────────────────────────────
    // "여기까지는 과거였습니다" — 1·2단계는 고정된 방식(5도구·32도구)으로 같은 구간을 본
    // 과거형 증거였다. 이제부터는 사용자가 고른 방식으로 **같은 구간을 다시** 본다 —
    // 다른 구간을 쓰면 앞 두 단계와 비교할 근거가 성립하지 않는다(sliced() 를 그대로 쓴다).
    //
    // Task 1 실측(확정 표본 PG, 2023-06-02~2024-05-15, sliced 228봉): 4종 성향 중
    // momentum 만 regime 이 갈린다(bull→neutral, 경계 ±12에서 score 11 — 경계까지 1점).
    // 나머지 3종(trend·reversion·volatility)은 32도구와 같은 결론(bull)이다 — 그래서
    // "같음"이 이 화면의 **주 경로**다(사용자 넷 중 셋이 보는 것). ob3SameNote 는 그 사실을
    // 당당하게 말한다(바뀐 척하지 않는다). 대신 선택 지표 수·근거 구성(동의·반대·무판정·
    // 자백)은 4종 모두 다르므로(node 실측: trend 9=7/0/2/0 · momentum 6=0/0/6/0 ·
    // reversion 9=5/1/2/1 · volatility 9=6/0/2/1), 판정 문구가 같아도 "고르면 갱신된다"는
    // 항상 성립한다.
    //
    // 근거 계산은 2단계(classifyFull32)와 **같은 경로**를 탄다 — MSReadings.voiced() 로
    // 자백 행을 먼저 걷어내고 MSIndicators.opposing() 을 그대로 불러 반대를 얻는다(임계값을
    // 여기서 재구현하지 않는다). noDirRows(trend·phasefold)는 그 성향이 실제로 선택한
    // 지표 집합에 있을 때만 더한다 — 안 그러면 선택하지 않은 성향에도 trend/phasefold 가
    // 새어 들어가 합이 선택 지표 수를 넘는다.
    function presetByKey(key) {
      var list = (typeof MSIndTiers !== "undefined" && MSIndTiers.PRESETS) || [];
      for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
      return null;
    }

    var _styleCache = null, _styleCacheKey = null, _styleCacheSample = null;
    function visibleStyle(styleKey) {
      var s = sample();
      if (!s || typeof MSIndTiers === "undefined") return null;
      if (_styleCache && _styleCacheSample === s && _styleCacheKey === styleKey) return _styleCache;
      var d = sliced();
      if (!d || typeof ForgeCore === "undefined" || typeof MSIndicators === "undefined"
        || typeof MSGraph === "undefined") return null;
      var wts = MSIndTiers.weightsOf(styleKey, MSGraph.BASIC);
      var r = runTier(d, "custom", wts);
      if (!r) return null;
      var ctx = MSIndicators.ctxFrom(r.input);
      var rows = MSIndicators.readings(ForgeCore, r.graph, r.input, ctx);
      var selTypes = MSIndTiers.selectionOf(styleKey, MSGraph.BASIC);
      var noDir = MSIndicators.noDirRows(ForgeCore, r.input, ctx)
        .filter(function (nd) { return selTypes.indexOf(nd.type) >= 0; });
      var regime = r.out.verdict.regime;
      var cls = classifyFull32(r.graph, regime, rows, noDir);
      var an = { regime: regime, n: selTypes.length,
                 agree: cls.agree, dissent: cls.dissent, flat: cls.flat, refused: cls.refused };
      _styleCache = an; _styleCacheKey = styleKey; _styleCacheSample = s;
      return an;
    }

    function step3() {
      var w = frag("ob-step");
      w.appendChild(el("p", "ob-over", MSStr.t.obPastDone));
      w.appendChild(el("h1", "ob-h", MSStr.t.obH3));
      w.appendChild(el("p", "ob-sub", MSStr.t.obSub3));

      var full = visibleFull32();      // 비교 기준 — 2단계에서 이미 32개 전부로 본 판정
      if (full) state.full32 = full;

      var presets = (typeof MSIndTiers !== "undefined" && MSIndTiers.PRESETS) ? MSIndTiers.PRESETS : [];
      var grid = frag("ob-styles");
      presets.forEach(function (p) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ob-style" + (state.style === p.key ? " is-on" : "");
        b.appendChild(el("span", "ob-style-name", p.name));
        var n = (typeof MSGraph !== "undefined" && typeof MSIndTiers !== "undefined")
          ? MSIndTiers.selectionOf(p.key, MSGraph.BASIC).length : 0;
        b.appendChild(el("span", "ob-style-desc", n + MSStr.t.obStyleIndicatorSuffix));
        b.addEventListener("click", function () {
          if (state.style === p.key) return;   // 같은 카드를 다시 눌러도 다시 그리지 않는다
          state.style = p.key;
          draw();
        });
        grid.appendChild(b);
      });
      w.appendChild(grid);

      var p = presetByKey(state.style);
      var st = visibleStyle(state.style);
      if (!full || !st || !p) {
        w.appendChild(el("p", "ob-read-empty", MSStr.t.obReadUnavailable));
        return w;
      }

      var n32 = (typeof ForgeCore !== "undefined" && typeof ForgeCore.indicatorCount === "number")
        ? ForgeCore.indicatorCount : 32;
      var cmp = frag("ob32-cmp");
      cmp.appendChild(full32CmpRow(n32 + MSStr.t.obVerdictLabelSuffix, verdictWord(full.regime)));
      cmp.appendChild(full32CmpRow(p.name + MSStr.t.obStyleVerdictSuffix, verdictWord(st.regime)));
      w.appendChild(cmp);

      // 같을 때도 이 화면은 성립한다(주 경로) — 대신 근거 구성은 아래 섹션에서 계속 갱신된다.
      var same = st.regime === full.regime;
      var note = same ? MSStr.t.ob3SameNote
        : (MSStr.t.ob3DiffA + verdictWord(full.regime) + MSStr.t.ob3DiffB +
           p.name + MSStr.t.ob3DiffC + verdictWord(st.regime) + MSStr.t.ob3DiffD);
      w.appendChild(el("p", "ob32-verdict-note" + (same ? " is-same" : " is-diff"), note));

      // 성향의 선택 지표 수(≤9)는 작아서 접을 이유가 없다 — 전부 그린다(collapsible=false,
      // full32Section 을 2단계와 그대로 재사용한다 — 근거 행의 형태를 새로 만들지 않는다).
      w.appendChild(full32Section("agree", MSStr.t.ob32AgreeHead, st.agree, false));
      w.appendChild(full32Section("dissent", MSStr.t.rpAgainst, st.dissent, false));
      w.appendChild(full32Section("flat", MSStr.t.ob32FlatHead, st.flat, false));
      w.appendChild(full32Section("refused", MSStr.t.ob32RefusedHead, st.refused, false, null, false));

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
