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
    // 부팅
    bootVendorMissing: "Could not load vendor/forge-core.js.<br>Run npm run sync and reopen.",

    // 워치리스트
    wlBrandA: "Money", wlBrandB: "Scoop",         // 시안 1a 워드마크 — 15px/700, 뒷조각(Scoop)만 골드
    wlSearch: "Search ticker or company",        // 시안 1a 검색 플레이스홀더
    wlChipAll: "All", wlChipUS: "US", wlChipKR: "KR", wlChipETF: "ETF",
    wlNoMatch: "No tickers match.",              // 검색·칩 결과가 비었을 때
    wlEmpty: "No tickers yet.\nAdd one to get started.",
    wlAdd: "＋ Add ticker",
    addTitle: "Add a ticker",                    // ＋Add 시트 머리 — 온보딩 4단계와 같은 피커를 연다
    wlScan: "Scan",
    wlScanIco: "↻",                              // 평상시 스캔 버튼 — 헤더에 필이 들어와 아이콘만 남았다
    wlScanning: "Scanning ",
    wlScanFail: "Scan failed",
    wlScanNone: "Nothing could be scanned — your Scoops were returned.",
    wlScanNoneNoRefund: "Nothing could be scanned. We could not confirm your Scoops were returned — please check your balance.",
    wlRemoveConfirm: " — remove from watchlist?",

    // 리포트 — 판정
    rpBack: "Back",
    rpPickSym: "Pick a ticker on the left.",
    rpLoadFail: "Could not load this report",
    rpRetry: "Try again",
    rpUnknownErr: "Could not load — unknown error.",
    rpAnalyzeErr: "Analysis failed: ",
    rpBarsShort: "not enough bars",
    rpUp: "Up", rpDown: "Down", rpFlat: "Flat",
    rpBullish: "Bullish", rpBearish: "Bearish",   // 판정 헤드라인 — 시안 2a·6a 표기.
                                                  // rpUp/rpDown("Up"/"Down")은 주기 행·지표 판독용이라 그대로 둔다.
    // 예측 범위는 HORIZON 머리의 캡션이 됐다("288 – 346 · 80% cone") — "Range " 접두와
    // 범위 없음 폴백은 소비자가 사라져 지웠다. 값이 없으면 캡션 자체를 안 낸다.
    rpCone: " · 80% cone",                        // 시안 2a. 설계 목표치이며 실측 커버리지는 77.7%
    rpAgree: " of ",
    rpAgreeTail: " agree with this direction",
    rpAgreeShort: " agree",                    // Fix 6: rpAgreeTail 과 같은 어휘(agree)의 짧은 형태 — 주기 행 요약용
    rpAgreeNone: "No indicator gives a direction, so agreement cannot be scored",
    // 적중률은 **범위와 함께** 적는다 — 웹(forge-app)도 "(n건 · 백테스트 acc%)" 로 표기한다.
    // 예전 문구는 "이 판정 같은 콜 열 번 중 넷"이라고 말했는데, 그 수치는 백테스트 하네스의
    // 19지표 그래프로 잰 것이라 Basic(5)도 Full(32)도, 이 종목도 아니다. 거짓 귀속이었다.
    rpHitLeadBull: "Bullish calls, measured: ",
    rpHitLeadBear: "Bearish calls, measured: ",
    rpHitRight: "% right · ", rpHitWrong: "% wrong",
    rpHitScopeA: "Across ", rpHitScopeB: " forecasts on ", rpHitScopeC: " series — not this ticker, not this indicator set.",
    rpHitScopeShort: "Engine-wide measurement — not this ticker or this indicator set.",
    rpHitSize: " Size for the ", rpHitSizeTail: "% that miss.",
    rpHzTomorrow: "Tomorrow", rpHzWeek: "In 1 week", rpHzMonth: "In 1 month",

    // 리포트 — 티어 배지 (Fix 6: 영문 리터럴이라 한글 스캔이 못 보고 있었다)
    rpTierBasic: "BASIC",
    rpTierCount: "5 indicators",
    rpTierFull: "FULL", rpTierCountFull: "32 indicators · daily, weekly, monthly",

    // 리포트 — 섹션 오버라인 (시안 2a: COMPOSITE·DAILY / HORIZON / SIGNALS / TIMEFRAMES)
    rpComposite: "Composite · Daily",
    rpHorizon: "Horizon",
    rpSignals: "Signals",
    rpOf: " of ", rpShown: " shown",           // 시안 1a: "5 of 12 shown"
    // Basic 의 결핍 — 시안 6a 가 안 되는 것을 이름으로 박아둔다. 지표 27개를 칩으로 까는 것보다
    // "무엇을 못 하는지"가 훨씬 정확한 설명이고, Full 을 살 이유도 이 네 줄이 만든다.
    rpNotCounted: "Not checked at this level",  // 시안 6a 그대로 — 결핍 박스의 머리
    // 시안 6a 의 AGAINST THIS CALL — Full 이 주는 것 중 하나. 32종 중 판정과 반대인 지표들.
    rpAgainst: "Against this call",
    rpAgainstNone: "No indicator argues the other way.",
    rpReasoning: "Reasoning",                    // 시안 6a: "REASONING · 32 NODES" — .overline 이 대문자로 만든다
    rpReasoningNodes: " nodes",                  // 머리 오른쪽 캡션 앞부분 — "32 nodes"
    rpReasoningScope: "daily · ",                // 판독은 일봉 기준(헤드라인 판정과 같은 주기)
    rpReasoningDir: " with a direction",         // "daily · 30 with a direction"
    rpNoDirDash: "—",                            // 방향을 못 묻는 둘의 기여도 칸
    rpSep: " · ",                                // 오버라인 안 구분자 — report.js 가 리터럴로 들고 있던 것
    // 판독문 거절문 3종(readings.js). **이유가 서로 다르므로 하나로 뭉치면 화면이 거짓 이유를 말한다** —
    // 봉이 300개인데 "봉이 모자라다"고 하던 것이 실제 결함이었다(swing:3 로 죽은 Market structure).
    rdNotEnoughBars: "Not enough bars to read",
    rdNoVolume: "No volume data for this ticker",
    rdNoSwings: "No swings large enough to read structure",
    rpMissingHitRate: "Historical hit rate of this setup",
    rpMissingDisagree: "Indicators that disagree",
    rpMissingTfAgree: "Weekly and monthly agreement",
    rpMissingWhy: "Why each reading came out that way",
    rpMissingDash: "—",
    rpMissingNote: "A Basic read tells you what five indicators say. It does not tell you whether that has ever worked.",
    // 시안 2a 의 "17 up · 6 flat · 9 down". rpUp/rpDown 은 대문자 단어라 여기 쓸 수 없다.
    rpUp2: " up · ", rpFlat2: " flat · ", rpDown2: " down",

    // 리포트 — 주기
    rpTf: "Timeframe",
    rpDaily: "Daily", rpWeekly: "Weekly", rpMonthly: "Monthly",
    rpLocked: "Locked", rpLockedSuffix: " · locked",
    rpUpgrade: "Go deeper",
    rpAgreeTf: " of ", rpAgreeTfTail: " timeframes agree",
    rpNoHistory: "Not enough history",

    // 서브패널 빈 데이터 안내 (Fix 7: draw-panels.js 도 MSStr 단일 출처를 쓴다)
    pnlRsiEmpty: "No RSI data",
    pnlMacdEmpty: "No MACD data",
    pnlVolumeEmpty: "No volume data",

    // 예측선 범례
    lgP1: "1st · blended forecast",
    lgP2: "2nd · selected indicators",
    lgP3: "3rd · counter scenario",

    // 차트 레전드 (Phase 3 신규)
    legPred: "1st forecast",
    legTarget: "Target",
    legGolden: "golden ", legDead: "dead ", legBars: " bars", legNoCross: "no cross",
    legSqueeze: " · squeeze",

    // 차트 안 잔존 라벨(크로스 표기는 legGolden/legDead/legBars 를 그대로 쓴다 — 레전드와
    // 차트가 각자 표기를 갖고 있던 것이 드리프트 원인이었다. Fix round 1)
    cxBullDiv: "Bullish divergence", cxBearDiv: "Bearish divergence",
    cxBullVolDiv: "Bullish volume divergence", cxBearVolDiv: "Bearish volume divergence",

    // 지갑 (Phase 8a) — 문구·행 구성은 시안 2c
    walTitle: "Scoops", walCap: "Cap ", walEarn: "Earn", walSpend: "Spend",
    walInWallet: "in wallet",
    walQuick: "Quick ad", walQuickSub: "15 seconds · no skip",
    walFull: "Full ad", walFullSub: "30 seconds · skip after 5s",
    walCheckin: "Daily check-in", walOnceADay: "one tap, once a day", walOnceADayCap: "One tap, once a day",
    walChest: "Week 7 chest", walChestAway: " days away",
    walSlot: "Add a ticker slot", walScan: "Watchlist signal scan",
    walDeep: "Deep analysis", walOptimiser: "Parameter optimiser", walFree: "Free",
    walSoon: "Soon",
    walDay: "Day ", walClaimedSep: " · ", walCheckedIn: "claimed today",
    walCapped: "Cap reached — the rest was discarded",
    walBack: "Back",

    // 지갑 화면 — 구글 로그인 행 (Phase 8c)
    wSignIn: "Sign in with Google",
    wSignInHint: "Keeps your Scoops if you reinstall or change phones.",
    wSignOut: "Sign out",
    wSignInWaiting: "Waiting for the browser…",
    wSignInFailed: "Sign-in did not finish. Try again.",
    // device-claimed: 이 기기가 이미 다른 구글 계정에 묶여 있다 — 재시도해도 답이 바뀌지
    // 않는 종결 상태다. "다시 시도"라고 말하면 거짓 희망을 준다(wSignInFailed 와 다른 문구).
    wDeviceClaimed: "This device is already linked to a different Google account. Reinstalling the app gives it a new device id you can sign in with.",
    wMergeDiscarded: "This device had {n} Scoops. Your account balance is the one that counts.",
    wWatchlistLocal: "Your ticker list stays on this device.",
    // merged: 이 기기의 익명 지갑은 구글 계정으로 넘어갔다 — 연결 문제가 아니다.
    // walUnavailable("확인이 안 된다")과 섞으면 "로그아웃했더니 스쿱이 사라졌다"로 읽힌다.
    wMerged: "This device's Scoops now live on your Google account — sign in again to see them.",
    // auth-disabled: 서버에 자격증명이 없다 — 오늘은 전 사용자의 기본 경험이다. 버튼을
    // 지운 자리에 안정적으로 남기는 문구(재조립될 때마다 되살아나지 않는다).
    wSignInUnavailable: "Sign-in is not available right now.",

    // 단계 선택 시트 (Phase 8a)
    tsTitle: "Analyse ", tsBasic: "Basic", tsFull: "Full", tsCustom: "Custom",
    tsBasicDesc: "5 indicators · daily only", tsFullDesc: "All 32 indicators · daily, weekly, monthly",
    tsCustomDesc: "All 32 + your weights",
    tsDone: "Free · done", tsPopular: "POPULAR", tsSoon: "Coming soon",
    tsFullPreview: "32 · D·W·M",                 // 단계 행 우측은 '무엇을 읽나'를 말한다(잔량 아님)
    tsCostsLead: "Costs ",                       // 선택한 단계 아래 비용 한 줄 — "Costs 3 Scoops"
    tsRun: "Run ", tsCost: " Scoops", tsShort: "Not enough Scoops. Come back tomorrow for +1.",
    tsRunning: "Running…", tsFailed: "Analysis failed — your Scoops were returned.",
    tsFailedNoRefund: "Analysis failed. We could not confirm your Scoops were returned — please check your balance.",
    tsSpendFailed: "Could not reach your wallet. Nothing was charged — please try again.",
    // network·server-error·busy — 응답을 못 받았을 뿐 서버는 처리했을 수 있다(I-H). "Nothing was
    // charged" 라고 말하면 거짓일 수 있어 tsSpendFailed 와 문구를 가른다. 재시도는 안전하다 —
    // 클라이언트가 같은 idem 을 재사용해 서버 멱등이 잡는다.
    tsSpendFailedUnknown: "Could not confirm your wallet. If you were charged, retrying is safe — please try again.",

    // 지갑을 읽을 수 없을 때(오프라인 등) — 잔량을 0 으로 그리면 거짓 정보다(SPEC §1).
    walUnavailable: "Wallet unavailable — check your connection.",
    tsUnavailable: "Wallet unavailable. Check your connection and try again.",

    // 종목 고르기 (ticker-picker.js) — 온보딩 4단계와 워치리스트 ＋Add 가 공유하는 컴포넌트
    tpPlaceholder: "Symbol (e.g. TSLA)",
    tpAdd: "Add",
    tpChecking: "Checking…",
    tpNotFound: "We could not find that symbol.",
    tpDidYouMean: "Did you mean: ",
    tpFull: "That is all the slots for now.",
    tpUnavailable: "Search is unavailable right now.",
    tpAlreadyPicked: "You already picked that one.",
    tpKept: "This one is already in your watchlist and stays there.",

    // 온보딩 (screens/onboarding.js)
    obBack: "Back", obNext: "Continue",
    obSampleNote: "Example series",
    obH1: "Where does this chart go next?",
    obSub1: "Every reading below comes from this chart — nothing is hand-written.",
    obH2: "Thirty readings, one verdict.",
    obSub2: "Each bar is one indicator. They collapse into a single call.",
    obCombCap: " readings with a direction",
    obH3: "Why it is free",
    obSub3: "Deep analysis costs Scoops. You earn them by checking in — and later by watching a short ad.",
    obGranting: "Setting up your wallet…",
    obGranted: " Scoops to start",
    obGrantOffline: "We could not reach the wallet. You can continue — Basic reports are always free.",
    obRetry: "Try again",
    obCostFull: "Deep analysis", obCostScan: "Watchlist scan", obCostSlot: "Extra ticker slot",
    obH4: "Pick your first tickers",
    obSub4: "Three slots to start. You can change them any time.",
    obH5: "Before you start",
    obRisk: "MoneyScoop reads price, volume and time. It does not know company news, earnings or anything a person told you. Nothing here is investment advice, and a forecast is not a promise.",
    obAgree: "I understand and accept the terms.",
    obFree: "Your first deep analysis is free.",
    obFinish: "Start"
  };

  // 상태 어휘 공유 맵 — chart-legend.js(레전드, 정본)와 draw-layers.js(캔버스 배지)가 같은 개념을
  // 각자 하드코딩하면서 대소문자가 갈렸다(Fix round 1). 두 모듈 다 여기서 읽어 구조적으로 드리프트를 막는다.
  var MA_ALIGN = { bull: "aligned up", bear: "aligned down", mixed: "mixed" };
  var VOL_STATE = { spike: "spike", contract: "contracting", normal: "normal" };
  var VOL_REL = { confirm: "confirming", weakening: "weakening",
                  selling: "selling pressure", capitulation: "capitulation" };
  var BB_STATE = { breakout_up: "upper breakout", breakout_dn: "lower breakdown",
                   upper: "upper band", lower: "lower band", neutral: "mid band" };
  var RSI_ZONE = { overbought: "overbought", oversold: "oversold", neutral: "neutral" };
  // Fix 2: support/resistance 는 MA 배지(draw-layers.js)와 레전드(chart-legend.js) 둘 다
  // 각자 리터럴로 하드코딩하고 있었다 — 다른 어휘 맵들과 같은 이유로 공유한다.
  var SR = { support: "support", resistance: "resistance" };

  function ind(bt) { var k = bt || ""; return IND[k] || k; }

  return { t: t, IND: IND, ind: ind,
           MA_ALIGN: MA_ALIGN, VOL_STATE: VOL_STATE, VOL_REL: VOL_REL, BB_STATE: BB_STATE,
           RSI_ZONE: RSI_ZONE, SR: SR };
});
