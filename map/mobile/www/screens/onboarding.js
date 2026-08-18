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
//   4 동의(위험 고지)               — 1·2·3막이 과거였음을 받아 "이제부터는 미래"로 여는
//                                    전환. 체크 없이 진행 불가. [재설계 완료 — Task 6]
//   5 종목 선택 · 분석 시작          — 고르는 것과 시작하는 것을 분리한다. 칩을 골라도
//                                    분석은 안 돈다 — [분석 시작]을 눌러야 실제로 돈다.
//                                    [재설계 완료 — Task 6]
//   6 전문분석 체험(16c)            — 슬라이더 하나만 열어 직접 만지게 한다. 체험 3/3. [옛 내용 그대로]
//   7 완료·가격표·지급(17a)         — 세 값을 한 표에 모으고 **가격은 이제야** 공개한다. [옛 내용 그대로]
//
// **순서가 핵심이다.** 가격표를 먼저 보여주면 "3스쿱"이 그냥 숫자다. 234.2 ± 1.1 을 먼저 본
// 사람에게만 3이 싼지 비싼지 판단할 근거가 생긴다(인벤토리 §2 원문).
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
    // 4단계(동의)는 체크박스 1개가 전부다 — 값·근거가 없는 단순 동의 게이트라 r1 같은
    // 계산 결과와는 무관하다.
    if (step === 4) return !!state.agreed;
    // 5단계(종목 선택·분석 시작) — **state.r1 같은 부수 효과를 절대 보지 않는다.** 옛
    // 버그의 정체가 그거였다: "결과가 생겼다"를 진행 조건으로 삼으니 결과를 만드는
    // 유일한 방법(칩을 고르면 바로 분석이 도는 것)이 곧 진행 조건이 됐다. 여기서는
    // state.sym 하나만 본다 — 그리고 이 값은 오직 [분석 시작] 버튼의 클릭 핸들러
    // (loadPick→commit)에서만 쓰인다. 칩을 고르는 것(state.pick)만으로는 채워지지
    // 않는다 — 선택과 실행이 서로 다른 변수다.
    if (step === 5) return !!state.sym;
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

  function frag(cls) { var e = document.createElement("div"); e.className = cls; return e; }
  function el(tag, cls, text) { return MSUi.el(tag, cls, text); }
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
      agreed: false,         // 4단계 동의 체크
      pick: null,            // 5단계 — 고른 후보(아직 확정 아님). { sym, name }
      pickChecking: false, pickError: null,   // "notfound" | "thin" | null
      sym: null, symName: null,               // 5단계가 확정한 종목 — canAdvance(5) 의 유일한 근거
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

    // ── 데이터 적재(5단계 [분석 시작]) ────────────────────────────────────────────
    // 고른 종목을 **실제로** 확인하고 돈다 — 이 호출이 그 화면의 "실행"이다. 옛 설계는
    // "못 찾음"도 "봉 부족"도 조용히 번들 표본으로 바꿔치기했다(그 다음 화면이 데모였을
    // 때는 정직했다). 이제는 3막이라 사용자가 고른 **그 종목**을 진짜로 보여준다는 약속이
    // 걸려 있다 — 다른 종목의 데이터를 몰래 신겨 놓으면 그 약속이 거짓말이 된다. 그래서
    // "못 찾음"·"봉 부족"은 진짜 실패로 다루고(막다른 골목 없이 다른 종목을 고를 수 있게
    // 한다), API 층 자체가 아예 없는 환경(빌드/미리보기)에서만 예전처럼 번들로 물러선다 —
    // 그건 종목의 문제가 아니라 환경의 문제이기 때문이다.
    // 리뷰 C2 — 옛 로컬 문턱(MIN_BARS=60)을 지웠다. api.js 의 normalizeCandles() 가 1day 에
    // 이미 220을 강제한다(scanAlerts 와 같은 기준) — 그래서 Promise 가 성공으로 떨어지면
    // 그 시점에 이미 충분한 봉이라는 뜻이고, `> 60` 검사는 항상 참인 죽은 코드였다(리뷰어
    // 실측: 80봉짜리 종목조차 normalizeCandles 단계에서 이미 던진다, notfound 플래그 없이).
    // "봉 부족"은 이제 그 실패(캐치 쪽 MSApi.isBarsShort)로만 판별한다 — 두 곳에 서로 다른
    // 숫자(60 vs 220)를 두지 않는다.
    function loadPick(pick, done) {
      // 그 사이 사용자가 다른 종목을 새로 골랐으면 이 응답은 이미 낡았다 — 버린다
      // (verifyPick 이 checking 을 시작할 때의 pick 을 그대로 캡처해 넘기므로, 여기서
      // state.pick 과 대조하면 늦게 도착한 옛 요청을 걸러낼 수 있다).
      function stale() { return !state.pick || state.pick.sym !== pick.sym; }
      function commit(data, fallback) {
        if (stale()) return;
        state.tut = { sym: pick.sym, name: pick.name, data: data, fallback: !!fallback, loading: false };
        state.r1 = runTier(data, "basic");
        state.r2 = runTier(data, "full");
        state.r3 = null;
        state.sym = pick.sym; state.symName = pick.name; state.picked = [pick];
        state.pickChecking = false; state.pickError = null;
        done();
      }
      function fail(reason) {
        if (stale()) return;
        state.pickChecking = false; state.pickError = reason;
        done();
      }
      var s = sample();
      if (typeof MSApi === "undefined" || !MSApi.loadTicker) { commit(s, true); return; }   // API 층 자체가 없다 — 환경 문제
      MSApi.loadTicker(pick.sym, TF).then(function (d) {
        if (d && d.candle && d.candle.length) commit(d, false);
        else fail("thin");   // 응답은 왔는데 봉이 비어 있다(방어적 — normalizeCandles 를 통과했다면 보통 없다)
      })["catch"](function (err) {
        // report.js 와 같은 판별 함수(MSApi.isBarsShort, api.js 소유) — 문자열을 다시
        // 매칭하지 않는다. 리뷰 C2 전에는 이 갈래가 아예 없어서 봉 부족(220 미만, notfound
        // 플래그 없는 일반 Error)이 else 로 새어 조용히 번들 표본으로 치환됐다.
        if (typeof MSApi !== "undefined" && MSApi.isBarsShort && MSApi.isBarsShort(err)) fail("thin");
        else if (err && err.notfound) fail("notfound");        // 종목을 못 찾았다
        else commit(s, true);   // 그 외 네트워크 문제 — 종목이 아니라 접속 문제라 번들로 물러선다
      });
    }

    // 확정 산물을 되돌린다 — commit() 이 채우는 것과 정확히 같은 필드를 비운다(리뷰 C1).
    // 선택이 바뀌면(다른 종목을 고르거나 고른 것을 지우면) 이전 [분석 시작] 결과는 더는
    // 유효하지 않다 — 안 지우면 확정 뒤 다른 칩으로 바꿔도 "다음"이 계속 열린 채로 남고,
    // 화면엔 새 종목이 선택돼 있는데 다음 단계로 넘어가는 건 옛 종목의 분석 결과가 된다.
    function invalidateConfirmed() {
      state.sym = null; state.symName = null; state.tut = null;
      state.r1 = null; state.r2 = null; state.r3 = null; state.picked = [];
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
      // 리뷰 A(1/5) — 판정이 중립(want===0)이면 classifyFull32 가 voiced 행을 전부 무판정으로
      // 보낸다(2단계·report.js 와 같은 로직, 손대지 않는다). 이 화면은 momentum(neutral)을
      // 처음으로 사용자에게 그리는 자리라 "Stochastic −0.62 인데 왜 무판정이지"가 처음
      // 나온다 — 분류를 바꾸지 않고 그 앞에 이유를 한 줄 적는다. 판정이 실제로 중립일
      // 때만 보인다(무판정이 늘 이 뜻은 아니다 — 방향이 있는 판정에서의 무판정은 "이
      // 지표 자체가 약하다"는 뜻이라 이 설명이 안 맞는다).
      if (regimeDir(st.regime) === 0) w.appendChild(el("p", "ob-note", MSStr.t.ob3FlatNeutralNote));
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

    // 1·2·3막이 전부 과거(sliced 228봉)를 다뤘다 — obPastDone("여기까지는 과거였습니다")이
    // 3단계 화면 위에서 그 사실을 못박는다. 4단계는 그 문장을 받아 "이제부터는 미래"라고
    // 답한다 — 동의가 법률 절차가 아니라 이야기의 매듭이 되려면 이 순서가 먼저다.
    function step4() {
      var w = frag("ob-step");
      w.appendChild(el("p", "ob-over", MSStr.t.obFutureOver));
      w.appendChild(el("h1", "ob-h", MSStr.t.obH4));
      w.appendChild(el("p", "ob-sub", MSStr.t.obSub4));
      w.appendChild(el("p", "ob-risk", MSStr.t.obConsentIntro));

      var list = frag("ob-consent-list");
      [MSStr.t.obConsentNotAdvice, MSStr.t.obConsentNoProfit, MSStr.t.obConsentLossOwn]
        .forEach(function (t) { list.appendChild(el("p", "ob-consent-item", t)); });
      w.appendChild(list);

      // 행 전체가 토글이다(.ob-style 과 같은 클릭 규약) — 체크박스 자신의 change 이벤트에
      // 기대지 않는다. 그러면 텍스트를 눌러도 켜지고, 이 화면의 시험이 다른 화면들과 같은
      // 방식(행을 클릭한다)으로 체크 여부를 잴 수 있다.
      var agree = frag("ob-agree" + (state.agreed ? " is-on" : ""));
      var chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "ob-consent-chk";
      chk.checked = !!state.agreed;
      agree.appendChild(chk);
      agree.appendChild(el("span", "ob-agree-txt", MSStr.t.obConsentCheckTxt));
      agree.addEventListener("click", function () {
        state.agreed = !state.agreed;
        draw();
      });
      w.appendChild(agree);
      return w;
    }

    // ── 5단계: 종목 선택 · 분석 시작(설계서 §4.5) ─────────────────────────────────
    // 선택(칩을 고른다)과 실행([분석 시작]을 누른다)을 분리한다. 칩을 고르는 것은
    // state.pick 만 바꾼다 — 엔진은 돌지 않고 state.r1/state.sym 은 그대로 null 이다.
    // [분석 시작]을 눌러야 loadPick() 이 실제로 불려 종목을 확인하고 돈다. canAdvance(5)
    // 는 state.sym 만 본다(위 canAdvance 주석 참고) — 이 함수 어디에도 state.r1 을
    // 진행 조건으로 쓰는 자리가 없다.
    function step5() {
      var w = frag("ob-step");
      w.appendChild(el("h1", "ob-h", MSStr.t.obPickH));
      w.appendChild(el("p", "ob-sub", MSStr.t.obPickSub));

      var picker = MSTickerPicker.create({
        multi: true, max: 1,
        preset: state.pick ? [state.pick] : [],
        onChange: function (selSyms, items) {
          var next = items.length ? items[0] : null;
          // 리뷰 C1 — 확정된 종목과 다른 선택이면(또는 선택을 지우면) 이전 확정을
          // 무효화한다. pickError 만 지우던 옛 코드는 state.sym/tut/r1/r2 가 그대로
          // 남아 canAdvance(5)(=!!state.sym)가 계속 열려 있었다 — 화면엔 새 종목이
          // 선택돼 있는데 다음으로 넘어가면 옛 종목의 분석 결과가 나가는 버그였다.
          if (state.sym && (!next || next.sym !== state.sym)) invalidateConfirmed();
          state.pick = next;
          state.pickError = null;
          draw();
        }
      });
      w.appendChild(picker.el);

      if (state.pick && !state.sym) {
        w.appendChild(el("p", "ob-note", MSStr.t.obPickSelectedA + state.pick.name));
      }

      var startBtn = document.createElement("button");
      startBtn.type = "button"; startBtn.className = "btn btn-primary ob-pick-start";
      startBtn.textContent = MSStr.t.obPickStart;
      startBtn.disabled = !state.pick || state.pickChecking;
      startBtn.addEventListener("click", function () {
        if (!state.pick || state.pickChecking) return;
        state.pickChecking = true; state.pickError = null;
        draw();                        // "확인하는 중" 을 즉시 보여준다 — 클릭이 곧 진행을 여는 것은 아니다
        loadPick(state.pick, draw);    // 실제 확인·분석은 여기서 비동기로 돈다
      });
      w.appendChild(startBtn);

      if (state.pickChecking) {
        w.appendChild(el("p", "ob-note", MSStr.t.obPickChecking));
      } else if (state.pickError) {
        // 막다른 골목 금지 — 못 찾음·봉 부족 둘 다 "다른 종목 선택" 이라는 실제 다음
        // 행동을 준다. 텍스트만 던지고 끝나지 않는다.
        w.appendChild(el("p", "ob-warn",
          state.pickError === "notfound" ? MSStr.t.obPickNotFound : MSStr.t.obPickThin));
        var retry = document.createElement("button");
        retry.type = "button"; retry.className = "btn btn-outline btn-sm ob-retry";
        retry.textContent = MSStr.t.obPickRetry;
        retry.addEventListener("click", function () {
          state.pick = null; state.pickError = null;
          draw();
        });
        w.appendChild(retry);
      } else if (state.sym) {
        // 어느 종목을 확정했는지 이름을 담는다(리뷰 C1) — 문구가 종목명을 안 담으면
        // "선택 표시(칩)"와 "실제로 확정된 종목"이 어긋나도 사용자가 눈치챌 수 없다.
        w.appendChild(el("p", "ob-note", state.symName + MSStr.t.obPickReadySuffix));
      }

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
      // Q4(설계서 §5) — 뒤로가기는 2·3단계에만 있다. 1단계는 시작점이라 되돌릴 앞이 없고,
      // 4단계부터는 전진만이다(4단계=동의는 되돌리면 "동의를 물렸다"는 애매한 상태가 되고,
      // 5단계 이후는 이미 종목을 확정해 돈 분석을 되돌리는 의미가 없다). Task 6 이전엔
      // `step > 1` 이라 4단계를 등록하는 순간 이 규칙이 깨졌다 — 여기서 좁힌다.
      if (step === 2 || step === 3) {
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

  return { STEPS: STEPS, canAdvance: canAdvance, next: next, seedTo: seedTo, render: render };
});
