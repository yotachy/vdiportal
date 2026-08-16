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
    bootVendorMissing: "필수 파일을 불러오지 못했습니다.<br>동기화한 뒤 다시 열어주세요.",

    // 워치리스트 — 시안 14a. 브랜드 워드마크(wlBrandA/B)는 고유명사라 번역하지 않는다(허용
    // 목록에 등록, 태스크 8). 시장 코드는 US/KR 은 옮기고(미국/국내) ETF 는 관용 표기를 남긴다.
    wlBrandA: "Money", wlBrandB: "Scoop",         // 워드마크 — 15px/700, 뒷조각(Scoop)만 골드
    wlSearch: "티커 또는 회사명 검색",
    wlChipAll: "전체", wlChipUS: "미국", wlChipKR: "국내", wlChipETF: "ETF",
    wlToday: "오늘",                              // "오늘" 섹션 헤더 — 결과 카드(어제 본 예측)는 P3, 이 섹션이 최상단
    wlNoMatch: "일치하는 종목이 없습니다.",        // 검색·칩 결과가 비었을 때
    wlEmpty: "아직 등록된 종목이 없습니다.\n종목을 추가해 보세요.",
    wlAdd: "＋ 종목 추가",
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
    rpBack: "뒤로",
    // 판독문 전체(시안 20a). 부제는 "무엇을 기준으로 읽은 판독인가" — 종목·주기·성향.
    // 안 적으면 같은 문장이 다른 설정에서 나온 것처럼 읽힌다.
    rdTitle: "판독문 전체",
    rdScopeSep: " · ", rdScopeTf: "일봉", rdScopeBasis: " 기준",
    rdF_all: "전체", rdF_up: "상승", rdF_down: "하락", rdF_none: "무판정",
    rdLv: "Lv", rdLvSep: " ", rdArrow: "\u203A",
    rdEmpty: "이 조건에 해당하는 지표가 없습니다.",
    // 시안 18b 의 "지표 32개 판독문" 링크 행. 개수는 리터럴이 아니라 엔진에서 나온다.
    rdLinkA: "지표 ", rdLinkB: "개 판독문",
    rpPickSym: "왼쪽에서 티커를 골라주세요.",
    rpLoadFail: "리포트를 불러오지 못했습니다",
    rpRetry: "다시 시도",
    rpUnknownErr: "불러오지 못했습니다 — 알 수 없는 오류.",
    rpAnalyzeErr: "분석 실패: ",
    // api.js:28 이 봉 부족일 때 이 값을 그대로 접두로 써서 에러 메시지를 만든다(같은 상수를
    // 공유해 매칭이 안 갈리게 한다) — 값을 바꾸면 api.js 도 함께 바뀐다.
    rpBarsShort: "봉이 부족합니다",
    rpUp: "상승", rpDown: "하락", rpFlat: "보합",
    rpBullish: "상승 우세", rpBearish: "하락 우세",   // 판정 헤드라인 — 시안 2a·6a·18a 표기 그대로.
                                                  // rpUp/rpDown 은 주기 행·지표 판독용이라 어간만("상승"/"하락") 쓴다.
    // 예측 범위는 HORIZON 머리의 캡션이 됐다("288 – 346 · 80% cone") — "Range " 접두와
    // 범위 없음 폴백은 소비자가 사라져 지웠다. 값이 없으면 캡션 자체를 안 낸다.
    rpCone: " · 80% 콘",                        // 시안 2a. 설계 목표치이며 실측 커버리지는 77.7%
    rpAgree: "개 동의 (전체 ",
    rpAgreeTail: "개 중)",
    rpAgreeShort: " 동의",                    // Fix 6: rpAgreeTail 과 같은 어휘(동의)의 짧은 형태 — 주기 행 요약용
    rpAgreeNone: "방향을 제시한 지표가 없어 동의 여부를 매길 수 없습니다",
    // 적중률은 **범위와 함께** 적는다 — 웹(forge-app)도 "(n건 · 백테스트 acc%)" 로 표기한다.
    // 예전 문구는 "이 판정 같은 콜 열 번 중 넷"이라고 말했는데, 그 수치는 백테스트 하네스의
    // 19지표 그래프로 잰 것이라 Basic(5)도 Full(32)도, 이 종목도 아니다. 거짓 귀속이었다.
    rpHitLeadBull: "상승 판정 실측: ",
    rpHitLeadBear: "하락 판정 실측: ",
    rpHitRight: "% 적중 · ", rpHitWrong: "% 오답",
    rpHitScopeA: "전체 ", rpHitScopeB: "건의 예측을 ", rpHitScopeC: "개 종목에서 실측한 값입니다 — 이 종목도, 이 지표 구성도 아닙니다.",
    rpHitScopeShort: "엔진 전체 실측값입니다 — 이 종목도, 이 지표 구성도 아닙니다.",
    // 베이스라인 병기(P2 §2 R2). 적중률만 보이면 사용자는 그것을 "동전보다 낫다"로 읽는다 —
    // 이 자산·이 기간의 기준선은 50% 가 아니라 "항상 오른다" 61.0% 이고, 우리 방향 판정은
    // 그 아래다. 같은 측정에서 나온 값만 옆에 놓는다(다른 하네스 숫자를 적으면 거짓 비교).
    rpHitBaseA: "같은 기간 “항상 오른다”는 ", rpHitBaseB: "% 였습니다.",
    rpHitSize: " 틀릴 ", rpHitSizeTail: "%에 대비해 비중을 조절하세요.",
    rpHzTomorrow: "내일", rpHzWeek: "1주", rpHzMonth: "1개월",
    // 8a 직전 상태 대조(사용자 결정 2026-08-17). 심화가 판 것은 "더 맞힌다"가 아니라
    // "폭이 정직해진다"인데, 직전 기본분석 값 옆에 놓지 않으면 그 정직해짐이 안 보인다.
    // 값이 없거나 기준일이 다르면 이 행 자체가 안 그려진다 — 여기 "—" 문구를 만들지 말 것.
    rpPrevBasic: "직전 기본분석", rpRangeDash: " – ", rpWidthA: "폭 ",
    // 19b 문안 재사용(사용자 결정 D3) — 골격은 18b 그대로 두고 평이한 서술만 가져온다.
    // 기간별 방향이 갈릴 때만 나온다. "3개 중 2개 일치"를 숫자로만 적으면 무엇이 어긋났는지
    // 안 보이고, 사용자는 헤드라인 방향을 모든 기간의 답으로 읽는다.
    rpHzMixedA: "짧게 보면 ", rpHzMixedUp: "오르고", rpHzMixedDown: "내리고",
    rpHzMixedB: ", 한 달은 반대입니다 — 짧게 볼 때만 유효한 판정입니다.",

    // 리포트 — 티어 배지 (Fix 6: 영문 리터럴이라 한글 스캔이 못 보고 있었다)
    rpTierBasic: "기본",
    rpTierCount: "지표 5개",
    // rpTierFull 은 압축 배지다(18b 배지 "심화"와 동일) — 전체 라벨(tsFull/walDeep/obCostFull=
    // "심화분석")과 바이트가 같을 필요는 없다, 정규화 테스트("한 단계는 한 이름으로 불린다")가
    // 요구하는 건 어간 일치뿐이다(태스크 8).
    rpTierFull: "심화", rpTierCountFull: "지표 32개 · 일·주·월",

    // 리포트 — 섹션 오버라인 (시안 2a: COMPOSITE·DAILY / HORIZON / SIGNALS / TIMEFRAMES)
    rpComposite: "종합 · 일봉",
    rpHorizon: "예측 구간",
    rpOf: "/",           // 시안 1a: "5 of 12 shown" → "5/32 표시"
    // Basic 의 결핍 — 시안 6a 가 안 되는 것을 이름으로 박아둔다. 지표 27개를 칩으로 까는 것보다
    // "무엇을 못 하는지"가 훨씬 정확한 설명이고, Full 을 살 이유도 이 네 줄이 만든다.  // 시안 6a 그대로 — 결핍 박스의 머리
    // 시안 6a 의 AGAINST THIS CALL — Full 이 주는 것 중 하나. 32종 중 판정과 반대인 지표들.
    rpAgainst: "반대 의견",
    rpAgainstNone: "반대하는 지표가 없습니다.",                    // 시안 6a: "REASONING · 32 NODES" — .overline 이 대문자로 만든다                  // 머리 오른쪽 캡션 앞부분 — "32개 지표"                // 판독은 일봉 기준(헤드라인 판정과 같은 주기)         // "일봉 · 30개 지표가 방향 제시"
    rpNoDirDash: "—",                            // 방향을 못 묻는 둘의 기여도 칸
    rpSep: " · ",                                // 오버라인 안 구분자 — report.js 가 리터럴로 들고 있던 것
    // 판독문 거절문 3종(readings.js). **이유가 서로 다르므로 하나로 뭉치면 화면이 거짓 이유를 말한다** —
    // 봉이 300개인데 "봉이 모자라다"고 하던 것이 실제 결함이었다(swing:3 로 죽은 Market structure).
    rdNotEnoughBars: "읽기에 봉이 부족합니다",
    rdNoVolume: "이 종목은 거래량 데이터가 없습니다",
    rdNoSwings: "읽을 만큼 큰 스윙이 없습니다",
    rpMissingNote: "기본분석은 5개 지표가 하는 말만 알려줍니다. 그게 실제로 맞았는지는 알려주지 않습니다.",
    // 시안 2a 의 "17 up · 6 flat · 9 down".
    rpUp2: " 상승 · ", rpFlat2: " 횡보 · ", rpDown2: " 하락",

    // 리포트 — 주기
    rpTf: "주기",
    rpDaily: "일봉", rpWeekly: "주봉", rpMonthly: "월봉",
    rpLocked: "잠김", rpLockedSuffix: " · 잠김",
    rpUpgrade: "심화분석 보기",
    // 해제 카드(시안 18a) — "27" 은 리터럴이 아니라 32 − 기본 5 에서 나온다. 지표가 늘면
    // 이 문구도 따라 움직여야 하고, 안 그러면 화면이 세지 않은 수를 말하게 된다.
    rpLockedA: "이 화면에 ", rpLockedB: "개 지표와\n차트 절반이 빠져 있습니다",
    // 기본분석은 범위만 답한다(시안 18a). 이 문장이 이 티어의 판매 논리 그 자체다 —
    // 쓸모없게 만들면 첫인상이 나빠지고, 충분하게 만들면 살 이유가 없다(인벤토리 §3).
    rpBasicRangeNote: "범위만 말합니다. 어디에 가까울지는 이 단계에서 알 수 없습니다.",
    rpAgreeTf: "/", rpAgreeTfTail: " 주기 일치",
    rpNoHistory: "이력이 부족합니다",

    // 서브패널 빈 데이터 안내 (Fix 7: draw-panels.js 도 MSStr 단일 출처를 쓴다)
    pnlRsiEmpty: "RSI 데이터 없음",
    pnlMacdEmpty: "MACD 데이터 없음",
    pnlVolumeEmpty: "거래량 데이터 없음",

    // 예측선 범례
    lgP1: "1차 · 통합 예측",
    lgP2: "2차 · 선택 지표",
    lgP3: "3차 · 반대 시나리오",

    // 차트 레전드 (Phase 3 신규)
    legPred: "1차 예측",
    legTarget: "목표가",
    legGolden: "골든크로스 ", legDead: "데드크로스 ", legBars: "봉 전", legNoCross: "교차 없음",
    legSqueeze: " · 스퀴즈",
    // 캔버스 투영 배지(draw-layers.js _drawMALayers/_drawBollingerLayers) — 접미사 " ≈ 값"은
    // 코드에서 붙는다(_hzFmt). MA·Bollinger 는 지표 축약형이라 그대로 둔다(제품 규칙 — 지표명은
    // 언어와 무관하게 영어).
    legMaProj: "MA 투영", legBbMidProj: "Bollinger 중심선 투영",

    // 차트 안 잔존 라벨(크로스 표기는 legGolden/legDead/legBars 를 그대로 쓴다 — 레전드와
    // 차트가 각자 표기를 갖고 있던 것이 드리프트 원인이었다. Fix round 1)
    // 상승/하락 어간은 rpUp/rpDown·readings.js(cross·cloud·flip 3곳)와 같은 단어다(태스크 8
    // 코디네이터 지시 — "판정어를 정하면 다섯 곳을 한 번에 맞춘다"). readings.js 는 판독문
    // 전체가 아직 영문이라(별도 과제) 이번엔 손대지 않았다 — 다음에 옮길 때 이 어간을 따른다.
    cxBullDiv: "상승 다이버전스", cxBearDiv: "하락 다이버전스",
    cxBullVolDiv: "상승 거래량 다이버전스", cxBearVolDiv: "하락 거래량 다이버전스",

    // 지갑 (Phase 8a → 시안 10b 재스킨) — 문구·행 구성은 시안 10b.
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
    // 오늘 이미 받은 상태 전용 헤드라인·부제(시안 10b, 리뷰 지시 2026-08-16) — 원문(디자인
    // 원본 "MoneyScoop 동선.dc.html" #10b)이 그리는 건 이 상태 하나뿐이다. 아직 안 받은 상태
    // (walCheckin+walOnceADay/walOnceADayCap)는 시안이 안 그렸을 뿐 지운 게 아니다 — 그대로 둔다.
    // walCheckedIn("claimed today")은 이 두 문구로 대체돼 지웠다.
    walCheckedInTitle: "오늘 출석 완료",
    // {n}=현재 연속일수. "7일 되면 +5"는 7일 상자를 가리키는 상수 — 상자 자체의 행(walChest)과
    // 별개로 이 자리에도 같은 리마인드가 필요하다(시안이 두 곳 모두에 적었다).
    walStreakNote: "{n}일 연속 · 7일 되면 +5",
    walChest: "7일 연속 상자", walChestAway: "일 남음",
    walScan: "워치리스트 스캔",
    // walDeep·rpTierFull·tsFull·obCostFull 은 한 단계를 가리킨다 — 넷을 한 번에 옮기는 결정을
    // 태스크 8 로 미뤄뒀던 것을 여기서 처리한다(strings.test.mjs "한 단계는 한 이름으로 불린다").
    walDeep: "심화분석",
    walOptimiser: "전문분석", walFree: "무료", walBasic: "기본분석",
    walDay: "일째", walClaimedSep: " · ",
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

    // 단계 선택 시트 (시안 6b, 2026-08-16 재스킨 — Phase 8a 최초 작성)
    tsTitle: "얼마나 정밀하게?",
    // 부제 접미사 — o.name(또는 sym) 뒤에 그대로 이어붙인다("애플" + 이 값).
    tsResultsKept: " · 결과는 계속 보관됩니다",
    tsBasic: "기본분석",
    // walDeep·rpTierFull·obCostFull 과 한 단계를 가리킨다(태스크 8, 위 walDeep 주석 참고).
    // tsFull + tsRun("실행") = "심화분석 실행" — 시안 6b 원문 그대로 맞아떨어진다.
    tsFull: "심화분석", tsCustom: "전문분석",
    tsBasicDesc: "도구 5 · 방향과 범위",
    // 두 줄(시안 6b 원문에 줄바꿈이 있다) — .sheet-tier-desc 가 white-space:pre-line 이다.
    tsFullDesc: "도구 32 · 일·주·월\n중심값 · 오차 · 확률 · 적중 이력",
    tsCustomDesc: "도구 32 · 지표별 가중치 직접 지정",
    tsDone: "받음", tsPopular: "가장 많이 씀", tsSoon: "곧 지원 예정",
    tsScoopUnit: "스쿱",                          // 심화분석 행의 값 아래 단위 라벨("3" + 이 값)
    tsSpendLead: "쓰면 ",                         // 비용 한 줄 왼쪽 — "쓰면 " + "12 → 9"
    tsRun: " 실행",                               // 버튼 — tsFull(위 주석) + 이 값
    tsShort: "스쿱이 부족합니다. 내일 출석하면 +1개를 더 받을 수 있습니다.",
    tsRunning: "실행 중…", tsFailed: "분석에 실패했습니다 — 스쿱은 환불됐습니다.",
    tsFailedNoRefund: "분석에 실패했습니다. 환불 여부를 확인하지 못했습니다 — 잔량을 확인해 주세요.",
    tsSpendFailed: "지갑에 연결할 수 없습니다. 차감되지 않았습니다 — 다시 시도해 주세요.",
    // network·server-error·busy — 응답을 못 받았을 뿐 서버는 처리했을 수 있다(I-H). "차감되지
    // 않았다"고 말하면 거짓일 수 있어 tsSpendFailed 와 문구를 가른다. 재시도는 안전하다 —
    // 클라이언트가 같은 idem 을 재사용해 서버 멱등이 잡는다.
    tsSpendFailedUnknown: "지갑 상태를 확인하지 못했습니다. 차감됐더라도 다시 시도해도 안전합니다 — 다시 시도해 주세요.",

    // 지갑을 읽을 수 없을 때(오프라인 등) — 잔량을 0 으로 그리면 거짓 정보다(SPEC §1).
    // walUnavailable 은 wallet.js 전용(태스크 6 범위) — tsUnavailable 은 다른 화면(단계 선택
    // 시트) 소관이라 이름을 맞출 의무가 없다(walDeep 류의 소비자 공유 키가 아니다).
    walUnavailable: "지갑을 확인할 수 없습니다 — 연결을 확인해 주세요.",
    tsUnavailable: "지갑을 확인할 수 없습니다 — 연결을 확인한 뒤 다시 시도해 주세요.",

    // 종목 고르기 (ticker-picker.js, 시안 12a) — 온보딩 4단계와 워치리스트 ＋Add 가 공유하는
    // 컴포넌트. tpTitle·tpCuratedLabel·tpLockNote·tpConfirm 은 단일 모드(＋Add) 전용 chrome.
    tpTitle: "어떤 종목을 볼까요?",
    tpCuratedLabel: "많이 보는 종목",
    // {n} = 실제로 화면에 잠금으로 보이는 칩 수. "지우면 슬롯이 돌아옵니다"(시안 원문 후반)는
    // 뺐다 — 슬롯 상한·과금이 실제로 구현돼 있지 않아, 그 문장을 그대로 옮기면 없는 제도를
    // 있다고 말하는 셈이다(코디네이터 판정 2026-08-16, 종목 슬롯 안내 줄을 통째로 뺀 것과
    // 같은 이유).
    tpLockNote: "자물쇠는 이미 담은 종목 {n}개입니다.",
    tpConfirm: "종목을 고르세요",
    tpPlaceholder: "종목명 또는 티커",
    tpAdd: "추가",
    tpChecking: "확인하는 중…",
    tpNotFound: "해당 종목을 찾을 수 없습니다.",
    tpDidYouMean: "혹시 이 종목인가요: ",
    tpFull: "지금은 더 고를 수 없습니다.",
    tpUnavailable: "지금은 검색을 쓸 수 없습니다.",
    tpAlreadyPicked: "이미 고른 종목입니다.",
    tpKept: "이미 워치리스트에 있어 그대로 유지됩니다.",

    // 온보딩 (screens/onboarding.js) — 지금 구현된 5단계 흐름은 DESIGN-INVENTORY 의 7단계 정본과
    // 화면 구성이 다른 별도 변형이라, 그 문서의 문구를 그대로 옮겨 붙이지 않고 원문 영어 문장의
    // 뜻을 그대로 번역했다(태스크 8 브리프의 "덮지 않는 것은 의미대로 번역" 원칙).
    obBack: "뒤로", obNext: "다음",
    obSampleNote: "예시 데이터",
    obH1: "이 차트는 다음에 어디로 갈까요?",
    obSub1: "아래 모든 판독은 이 차트에서 나온 것입니다 — 손으로 쓴 것은 하나도 없습니다.",
    obH2: "판독 서른 개, 결론은 하나.",
    obSub2: "막대 하나가 지표 하나입니다. 이것들이 모여 하나의 판정이 됩니다.",
    obCombCap: "개 지표가 방향을 제시했습니다",
    obH3: "무료인 이유",
    obSub3: "심화분석에는 스쿱이 듭니다. 출석하면 스쿱을 얻고, 나중에는 짧은 광고를 봐서도 얻을 수 있습니다.",
    obGranting: "지갑을 준비하는 중…",
    obGranted: "개 스쿱으로 시작합니다",
    obGrantOffline: "지갑에 연결하지 못했습니다. 계속 진행할 수 있습니다 — 기본분석은 항상 무료입니다.",
    obRetry: "다시 시도",
    // obCostFull 은 walDeep·rpTierFull·tsFull 과 같은 단계다(위 walDeep 주석). obCostScan 은
    // walScan 과 같은 문구를 그대로 재사용한다(두 화면이 갈리지 않게). 슬롯 행은 없다 —
    // wallet.js:404 와 같은 이유(spend("slot") 없음·addTicker 무료)로 온보딩에서도 뺐다.
    obCostFull: "심화분석", obCostScan: "워치리스트 스캔",
    obH4: "처음 볼 종목을 골라보세요",
    obSub4: "시작은 슬롯 3개입니다. 언제든 바꿀 수 있습니다.",
    obH5: "시작하기 전에",
    obRisk: "MoneyScoop은 가격·거래량·시간만 읽습니다. 기업 뉴스나 실적, 다른 사람에게 들은 어떤 것도 알지 못합니다. 여기 있는 어떤 것도 투자 조언이 아니며, 예측은 약속이 아닙니다.",
    obAgree: "내용을 이해했으며 약관에 동의합니다.",
    obFree: "첫 심화분석은 무료입니다.",
    obFinish: "시작하기"
  };

  // 상태 어휘 공유 맵 — chart-legend.js(레전드, 정본)와 draw-layers.js(캔버스 배지),
  // readings.js(판독문)가 같은 개념을 각자 하드코딩하면 대소문자·언어가 갈린다(Fix round 1
  // 이 그 사고였다). 세 모듈 다 여기서 읽어 구조적으로 드리프트를 막는다.
  // 태스크 8: 값을 한국어로 옮겼다 — 정배열/역배열·급증/위축 등은 국내 차트 앱이 실제로 쓰는
  // 관용 용어다(과매수/과매도·지지/저항도 마찬가지). "상단 이탈"은 §20a 판독문 예시("볼린저
  // 상단 이탈")와 그대로 맞춘다.
  var MA_ALIGN = { bull: "정배열", bear: "역배열", mixed: "혼조" };
  var VOL_STATE = { spike: "급증", contract: "위축", normal: "보통" };
  var VOL_REL = { confirm: "추세 동반", weakening: "약화",
                  selling: "매도 압력", capitulation: "투매" };
  var BB_STATE = { breakout_up: "상단 이탈", breakout_dn: "하단 이탈",
                   upper: "상단", lower: "하단", neutral: "중단" };
  var RSI_ZONE = { overbought: "과매수", oversold: "과매도", neutral: "중립" };
  // Fix 2: support/resistance 는 MA 배지(draw-layers.js)와 레전드(chart-legend.js) 둘 다
  // 각자 리터럴로 하드코딩하고 있었다 — 다른 어휘 맵들과 같은 이유로 공유한다.
  var SR = { support: "지지", resistance: "저항" };

  function ind(bt) { var k = bt || ""; return IND[k] || k; }

  return { t: t, IND: IND, ind: ind,
           MA_ALIGN: MA_ALIGN, VOL_STATE: VOL_STATE, VOL_REL: VOL_REL, BB_STATE: BB_STATE,
           RSI_ZONE: RSI_ZONE, SR: SR };
});
