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

    // 워치리스트 — 시안 14a. 브랜드 워드마크(wlBrandA/B)와 시장 코드(wlChipUS/KR/ETF)는
    // 고유명사·관용 코드라 번역하지 않는다(PENDING_EN 에 계속 남는 게 맞다).
    wlBrandA: "Money", wlBrandB: "Scoop",         // 워드마크 — 15px/700, 뒷조각(Scoop)만 골드
    wlSearch: "티커 또는 회사명 검색",
    wlChipAll: "전체", wlChipUS: "US", wlChipKR: "KR", wlChipETF: "ETF",
    wlToday: "오늘",                              // "오늘" 섹션 헤더 — 결과 카드(어제 본 예측)는 P3, 이 섹션이 최상단
    wlNoMatch: "일치하는 종목이 없습니다.",        // 검색·칩 결과가 비었을 때
    wlEmpty: "아직 등록된 종목이 없습니다.\n종목을 추가해 보세요.",
    wlAdd: "＋ 종목 추가",
    addTitle: "Add a ticker",                    // ＋Add 시트 머리 — 온보딩 4단계와 같은 피커를 연다(이번 범위 밖)
    wlScan: "스캔",
    wlScanning: "스캔 중 ",                        // + "done/total" 이 뒤에 붙는다
    // 읽음 상태 2종(시안 14a) — 안 읽음(새 판정)/읽음. "오래됨"은 이번에 안 넣는다: 시안이
    // 시간이 아니라 확정 캔들 수(21a "봉이 하나 더 생겼습니다")로 재는데, 그 화면과 예측
    // 기록이 아직 없어 임의의 시간 문턱을 지어내는 것보다 낫다 — 두 상태가 정직하다.
    wlUnread: "새 판정",
    wlRead: "읽음",
    wlScanFail: "스캔 실패",
    wlScanNone: "스캔할 수 있는 종목이 없습니다 — 스쿱이 환불되었습니다.",
    wlScanNoneNoRefund: "스캔할 수 있는 종목이 없습니다. 스쿱 환불 여부를 확인하지 못했습니다 — 잔액을 확인해 주세요.",
    wlRemoveConfirm: " — 워치리스트에서 삭제할까요?",

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
    rpTierFull: "DEEP", rpTierCountFull: "32 indicators · daily, weekly, monthly",

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

    // 지갑 (Phase 8a → 시안 10b 재스킨) — 문구·행 구성은 시안 10b.
    // walDeep 은 예외적으로 아직 영어다 — tsFull·rpTierFull·obCostFull 과 한 이름을 공유해야
    // 하는데(strings.test.mjs "한 단계는 한 이름으로 불린다") 그 셋은 각각 다른 태스크(7·8) 소관이라
    // 지금 혼자 옮기면 이름이 갈린다. 넷을 한 번에 옮기는 결정은 태스크 8 로 넘겼다
    // (코디네이터 판정, 2026-08-16) — MAX_PENDING_EN 이 그 정리를 강제한다.
    walTitle: "스쿱", walEarn: "버는 곳", walSpend: "쓰는 곳",
    // walCap 은 이제 헤더가 아니라 잔량 카드 안에서 "최대 20"으로 쓰인다(시안 10b) —
    // walInWallet("in wallet")이 있던 자리를 대체해 그 키는 지웠다.
    walCap: "최대 ",
    // 시안 10b 잔량 카드의 네 번째 요소 — 지금 잔량으로 몇 번을 살 수 있는지 환산해 보여준다.
    // {a}/{b} 는 wallet.js 가 Math.floor(balance/COSTS.full|custom) 로 채운다. walDeep 과 달리
    // 이 문구는 지갑 화면에서만 쓰는 새 설명문이라 그 셋과 이름을 맞출 의무가 없다.
    walEquiv: "심화분석 {a}번 또는 전문분석 {b}번",
    // walQuick/walFull("Quick ad"/"Full ad", 이름만)은 Phase 8d 에서 adQuick/adFull(이름+금액
    // 통합 문구)로 대체돼 지웠다 — 부제(소요시간·스킵 정책)만 여기 남아 광고 행의 note 로 산다.
    walQuickSub: "15초 · 건너뛸 수 없음",
    walFullSub: "30초 · 5초 후 건너뛰기 가능",
    walCheckin: "출석체크", walOnceADay: "탭 한 번, 하루 한 번", walOnceADayCap: "탭 한 번, 하루 한 번 받기",
    walChest: "7일 연속 상자", walChestAway: "일 남음",
    walSlot: "종목 슬롯 추가", walScan: "워치리스트 스캔",
    walDeep: "Deep analysis",   // 태스크 8 로 이관(위 주석) — 지금은 이 한 줄만 영어다
    walOptimiser: "전문분석", walFree: "무료", walBasic: "기본분석",
    walDay: "일째", walClaimedSep: " · ", walCheckedIn: "오늘 받음",
    walCapped: "상한 도달 — 남은 만큼은 버려졌습니다",
    walBack: "뒤로",

    // 지갑 화면 — 계정 · 설정 섹션 머리(시안 10b)
    walAccount: "계정 · 설정",
    // 지갑 화면 — 구글 로그인 행 (Phase 8c)
    wSignIn: "Google로 로그인",
    wSignOut: "로그아웃",
    wSignInWaiting: "브라우저를 기다리는 중…",
    wSignInFailed: "로그인이 끝나지 않았습니다. 다시 시도해 주세요.",
    // device-claimed: 이 기기가 이미 다른 구글 계정에 묶여 있다 — 재시도해도 답이 바뀌지
    // 않는 종결 상태다. "다시 시도"라고 말하면 거짓 희망을 준다(wSignInFailed 와 다른 문구).
    wDeviceClaimed: "이 기기는 이미 다른 Google 계정에 연결돼 있습니다. 앱을 재설치하면 새 기기 ID로 다시 로그인할 수 있습니다.",
    // 검토(2026-08-15 리뷰 요청): 이 문구는 이미 정직하다 — "이 기기엔 {n}개 있었다"고 과거형으로
    // 적고 "계정 잔량이 이제부터 유효하다"로 넘길 뿐, {n}이 옮겨졌다거나 더해졌다고 말하지 않는다.
    // (wMerged 와 달리 여기서는 화면에 새 잔량이 함께 보이는 상태라 "그 잔량이 유효하다"는 말 자체가
    // 참이다.) 그래서 바꾸지 않았다.
    wMergeDiscarded: "이 기기에는 스쿱 {n}개가 있었습니다. 이제부터는 계정 잔량이 유효합니다.",
    wWatchlistLocal: "관심종목 목록은 이 기기에만 저장됩니다.",
    // merged: 이 기기의 익명 지갑은 구글 계정으로 넘어갔다 — 연결 문제가 아니다.
    // walUnavailable("확인이 안 된다")과 섞으면 "로그아웃했더니 스쿱이 사라졌다"로 읽힌다.
    // w_merge 는 이 기기의 잔량을 **버린다**(원장엔 남기지만 구글 계정으로 옮기지 않는다) —
    // 구글 계정 쪽 잔량은 그 계정 자신의 기존 총량이지 이 기기가 버린 수량과 무관하다.
    // "그대로 옮겨갔다"는 식으로 액수를 암시하지 않는다 — 어느 계정으로 넘어갔는지만 말한다
    // (wallet-screens.test.mjs 가 "계정으로 넘어갔" 표현으로 확인한다. 번역 전에는 영문
    // "merged into"를 확인했다).
    wMerged: "이 기기의 지갑은 Google 계정으로 넘어갔습니다 — 그 계정의 잔량을 보려면 다시 로그인하세요.",
    // auth-disabled: 서버에 자격증명이 없다 — 오늘은 전 사용자의 기본 경험이다. 버튼을
    // 지운 자리에 안정적으로 남기는 문구(재조립될 때마다 되살아나지 않는다).
    wSignInUnavailable: "지금은 로그인을 사용할 수 없습니다.",

    // 지갑 화면 — 계정 안내 3종(시안 10b, 코디네이터 지시 2026-08-16). 구글 로그인은 8c 에서
    // 이미 구현됐고 서버 설정 파일 업로드만 남았다 — 켜지는 순간 고정 문구("로그인이 아직 준비
    // 안 됐다")가 거짓이 된다. wallet.js 는 authStart() 가 실제로 성공한 적이 있는지(ok:true)로만
    // "로그인이 된다"는 걸 안다 — 모르면(아직 시도 전) 가장 신중한 walAcctNoLogin 으로 떨어진다.
    walAcctNoLogin: "로그인이 아직 준비되지 않아, 앱을 지우면 스쿱도 사라집니다.",
    walAcctAnon: "이 기기에만 저장됩니다. 로그인하면 계정에 남습니다.",
    walAcctSignedIn: "계정에 저장됩니다.",

    // 지갑 — 광고(Phase 8d, AdMob 리워드). "+{n}" 은 표시값이지 클라이언트가 계산해 더하는
    // 값이 아니다 — 실제 지급은 서버의 SSV 콜백만 한다(SPEC-economy §1 그대로). {n} 은
    // wallet.js 가 adConfig() 가 준 adCfg[unit].reward 로 채운다(wMergeDiscarded 와 같은
    // 치환 관례) — 문자열 리터럴로 박아두면 ad_units.json/AdMob 콘솔 reward_amount 와 별개의
    // 세 번째 진실원이 생겨, 값이 어긋나도 화면은 계속 옛 숫자를 약속한다(리뷰 I3). 제목은
    // 시안 10b 문구("짧은 광고"·"하나 더 받기")에 금액만 붙인다 — 기존 구조(제목+금액이 한
    // 텍스트 노드)는 그대로 둔다. 8d 를 다시 만들지 않는다.
    adQuick: "짧은 광고 +{n}",
    adFull: "하나 더 받기 +{n}",
    adDailyDone: "오늘 광고는 여기까지입니다.",
    adCooldown: "다음 광고까지 {m}분",
    adWaiting: "스쿱을 적립하는 중…",
    // 폴링(2초 × 5 = 10초) 안에 SSV 콜백이 안 왔을 때. 잔량은 올리지도 내리지도 않는다 —
    // 낙관적으로 올린 적이 없으니 뺏을 것도 없다(이 태스크의 핵심 규율).
    adPending: "아직 도착하지 않았습니다. 곧 반영됩니다.",
    // 광고 자체가 안 떴을 때(동의 차단·유닛 없음·플러그인 없음 등 show() 의 모든 reason).
    // 내부 사유를 그대로 노출하지 않는다 — 버튼이 조용히 아무 일도 안 하는 대신 사실대로 말한다.
    adFailed: "지금은 광고를 보여줄 수 없습니다.",
    // UMP 재열람 행 — MSAds.privacyOptionsRequired() 가 참인 지역(EEA·영국·캐나다)에만 뜬다.
    adSettings: "광고 설정",
    adLowBalance: "스쿱이 부족합니다. 광고를 보고 계속하세요.",
    // 리워드 화폐 고지 — 스토어 심사가 본다. 지갑 화면 하단에 상시 표기(SPEC §6, 시안 10b verbatim).
    walNoCashValue: "스쿱은 현금 가치가 없고 양도·환불되지 않습니다. 예측은 약속이 아닙니다.",
    walEngine: "분석 엔진 v",

    // 단계 선택 시트 (Phase 8a)
    tsTitle: "Analyse ", tsBasic: "Basic", tsFull: "Deep", tsCustom: "Pro",
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
    // walUnavailable 은 wallet.js 전용(태스크 6 범위) — tsUnavailable 은 다른 화면(단계 선택
    // 시트) 소관이라 이름을 맞출 의무가 없다(walDeep 류의 소비자 공유 키가 아니다).
    walUnavailable: "지갑을 확인할 수 없습니다 — 연결을 확인해 주세요.",
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
