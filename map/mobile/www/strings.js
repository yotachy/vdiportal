// UI 문자열 단일 출처. 시안이 영어로 확정했다(핸드오프 README: English-first · copy is decided).
// 지표명은 인터페이스 언어와 무관하게 영어다 — 설정 "Keep indicator names in English" 기본 ON.
// 보간·복수형·로케일 전환은 없다. v1 은 영어 하나뿐이라 그 기계장치가 값을 못 한다(Phase 0 §8).
// 언어가 붙을 때 이 파일이 추출 지점이 된다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSStr = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 지표 표시명 32종. 목업에 문자 그대로 나오는 것(Moving average·MACD·RSI·Bollinger·Volume·
  // Ichimoku·ADX / DMI·SuperTrend·Volume profile·Elliott)은 그 표기를 그대로 쓴다.
  var IND = {
    ma: "Moving average", macd: "MACD", rsi: "RSI", bollinger: "Bollinger", volume: "Volume",
    trend: "Trend", adx: "ADX / DMI", stochastic: "Stochastic", fib: "Fibonacci",
    ichimoku: "Ichimoku", pivot: "Pivot", psar: "Parabolic SAR", gann: "Gann",
    vwap: "VWAP", supertrend: "SuperTrend", atr: "ATR", volumeprofile: "Volume profile",
    structure: "Market structure", keltner: "Keltner", donchian: "Donchian",
    cci: "CCI", williams: "Williams %R", aroon: "Aroon", mfi: "MFI",
    elliott: "Elliott", smc: "SMC", cycle: "Cycle", phasefold: "Phase fold",
    roc: "ROC", ao: "Awesome oscillator", cmf: "CMF", pattern: "Chart pattern"
  };

  var t = {
    // 워치리스트
    wlTitle: "Watchlist",
    wlEmpty: "No tickers yet.\nAdd one to get started.",
    wlAdd: "＋ Add ticker",
    wlAddPrompt: "Enter a ticker symbol (e.g. AAPL)",
    wlAddBtn: "Add",
    wlCancel: "Cancel",
    wlScan: "Scan",
    wlScanning: "Scanning ",
    wlScanFail: "Scan failed",
    wlRemoveConfirm: " — remove from watchlist?",
    wlNotFound: " not found.",
    wlDidYouMean: " not found. Did you mean:",

    // 리포트 — 판정
    rpBack: "Back",
    rpLoadFail: "Could not load this report",
    rpRetry: "Try again",
    rpUnknownErr: "Could not load — unknown error.",
    rpAnalyzeErr: "Analysis failed: ",
    rpBarsShort: "not enough bars",
    rpUp: "Up", rpDown: "Down", rpFlat: "Flat",
    rpRange: "Likely somewhere in ",          // 시안: "Likely somewhere in"
    rpRangeNone: "No honest range available",
    rpRough: " — this is a rough read",        // 시안 그대로
    rpAgree: " of ",
    rpAgreeTail: " agree with this direction",
    rpAgreeNone: "No indicator gives a direction, so agreement cannot be scored",
    rpBarsAfter: " bars out",

    // 리포트 — 섹션
    rpCounted: "What was read",                // 시안 그대로
    rpNotCounted: "Not checked at this level", // 시안 그대로
    rpNotCountedLead: "Indicators not used in this verdict: ",
    rpNotCountedTail: " — see below",
    rpMissingPoint: "Showing what is missing",

    // 리포트 — 주기
    rpTf: "Timeframe",
    rpDaily: "Daily", rpWeekly: "Weekly", rpMonthly: "Monthly",
    rpLocked: "Locked", rpLockedSuffix: " · locked", rpSoon: "Coming soon",

    // 예측선 범례
    lgP1: "1st · blended forecast",
    lgP2: "2nd · selected indicators",
    lgP3: "3rd · counter scenario",

    // 차트 레전드 (Phase 3 신규)
    legPred: "1st forecast",
    legTarget: "Target",
    legGolden: "golden ", legDead: "dead ", legBars: " bars", legNoCross: "no cross",

    // 차트 안 잔존 라벨(크로스 표기는 legGolden/legDead/legBars 를 그대로 쓴다 — 레전드와
    // 차트가 각자 표기를 갖고 있던 것이 드리프트 원인이었다. Fix round 1)
    cxBullDiv: "Bullish divergence", cxBearDiv: "Bearish divergence",
    cxBullVolDiv: "Bullish volume divergence", cxBearVolDiv: "Bearish volume divergence"
  };

  // 상태 어휘 공유 맵 — chart-legend.js(레전드, 정본)와 draw-layers.js(캔버스 배지)가 같은 개념을
  // 각자 하드코딩하면서 대소문자가 갈렸다(Fix round 1). 두 모듈 다 여기서 읽어 구조적으로 드리프트를 막는다.
  var MA_ALIGN = { bull: "aligned up", bear: "aligned down", mixed: "mixed" };
  var VOL_STATE = { spike: "spike", contract: "contracting", normal: "normal" };
  var VOL_REL = { confirm: "confirming", weakening: "weakening",
                  selling: "selling pressure", capitulation: "capitulation" };
  var BB_STATE = { breakout_up: "upper breakout", breakout_dn: "lower breakdown",
                   upper: "upper band", lower: "lower band", neutral: "mid band" };

  function ind(bt) { var k = bt || ""; return IND[k] || k; }

  return { t: t, IND: IND, ind: ind,
           MA_ALIGN: MA_ALIGN, VOL_STATE: VOL_STATE, VOL_REL: VOL_REL, BB_STATE: BB_STATE };
});
