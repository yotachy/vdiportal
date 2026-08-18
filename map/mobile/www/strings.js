// UI 문자열 단일 출처. 시안이 영어로 확정했다(핸드오프 README: English-first · copy is decided).
// 지표명은 인터페이스 언어와 무관하게 영어다 — 설정 "Keep indicator names in English" 기본 ON.
// 보간·복수형·로케일 전환은 없다. v1 은 영어 하나뿐이라 그 기계장치가 값을 못 한다(Phase 0 §8).
// 언어가 붙을 때 이 파일이 추출 지점이 된다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSStr", factory());
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

    // 셸 — 하단 탭바 3개(시안 14a). 특정 화면 전용이 아니라 앱 전체 뼈대지만, 셸만의
    // 새 접두(예: sh*)를 만드는 대신 브리프가 준 이름(wlTab*)을 그대로 쓴다 — 워치리스트가
    // 첫 진입 화면이라 탭바를 처음 그리는 자리이기도 하다.
    wlTabList: "목록", wlTabAnalysis: "분석", wlTabScoop: "스쿱",

    // 워치리스트 — 시안 14a. 브랜드 워드마크(wlBrandA/B)는 고유명사라 번역하지 않는다(허용
    // 목록에 등록, 태스크 8). 시장 코드는 US/KR 은 옮기고(미국/국내) ETF 는 관용 표기를 남긴다.
    wlBrandA: "Money", wlBrandB: "Scoop",         // 워드마크 — 15px/700, 뒷조각(Scoop)만 골드
    wlSearch: "티커 또는 회사명 검색",
    wlChipAll: "전체", wlChipUS: "미국", wlChipKR: "국내", wlChipETF: "ETF",
    wlToday: "오늘",
    // 어제 결과 카드(시안 14a) — 목록보다 위. 퍼센트는 20건 이상부터만(핸드오프 원칙 5).
    wlResHead: "어제 본 예측 ", wlResHeadTail: "건",
    wlResHit: "범위 적중", wlResMiss: " 벗어남",
    wlResSmallA: "건은 아직 성적이 아닙니다. ", wlResSmallB: "건이 넘으면 내 적중률을 함께 보여드립니다.",
    wlResRateA: "내 적중률 ", wlResRateB: "% · ", wlResRateC: "건 기준",
    wlResMore: "내 예측 기록 전체 보기",

    // 어제 결과 상세(시안 17b 맞힘 / 14b 빗나감). 두 갈래가 **규칙이 정반대**라 문구도
    // 섞지 않는다 — 맞힌 날만 광고를 권하고, 빗나간 날은 전문분석을 제안한다.
    rsNone: "이 종목의 지난 예측 기록이 없습니다.",
    rsWhenA: "기준일 ", rsWhenB: " · 판정 ",
    rsHit: "맞았습니다", rsMiss: "빗나갔습니다",
    rsSaidA: "", rsSaidB: " 라고 했고 실제는 ", rsSaidC: " 였습니다",
    rsInside: "예측 범위 안쪽입니다",
    rsOutside: " 만큼 벗어났습니다",
    rsBasicWouldHit: "기본분석이었다면 적중이었습니다",
    rsNarrowNote: " 라고만 했을 범위입니다. 좁게 말할수록 표적이 작아집니다 — 심화분석이 나빠서가 아니라 범위를 좁게 잡았기 때문입니다.",
    rsAdToday: "오늘도 심화로 보기",
    rsAgainToday: "오늘 판정 보기",
    rsTryExpert: "가중치를 조절해 다시 보기",
    rsTodayVerdict: "오늘 판정 보기",
    rsDisclaimer: "가격 · 거래량 · 시간만 읽습니다. 예측은 약속이 아닙니다.",

    // 지난 판정 되돌아보기(시안 21a) — 리포트 안, 오늘 판정 **위**.
    rpLastHead: "지난 판정 · 기준일 ",
    rpLastPm: " ± ",
    rpLastActual: "실제 ", rpLastHit: " · 범위 적중", rpLastSep: " · ", rpLastMiss: " 벗어남",
    rpLastPending: "아직 결과가 나오지 않았습니다",
    rpLastMore: "결과 자세히 보기",
    rpLastFree: "다시 열어도 스쿱이 들지 않습니다.",

    // 스캔 결과(시안 15c). 경계 규칙이 이 화면의 전부다 — 무엇이 달라졌는지까지가 스캔의 일,
    // 왜 달라졌는지는 분석의 일이다.
    srTitle: "스캔 결과", srFree: "방금 · 무료",
    srNone: "방향이 달라진 종목이 없습니다.",
    srFlipped: "개가 뒤집혔습니다",
    srSubA: "어제와 방향이 달라진 종목입니다. 나머지 ", srSubB: "개는 그대로입니다.",
    srArrow: " ↔ ",
    srBoundary: "스캔은 기본 5개만 다시 셉니다. 무료이고 스쿱이 들지 않습니다 — 무엇이 달라졌는지 알려주는 것까지가 스캔의 일이고, 왜 달라졌는지는 분석의 일입니다.",
    srOpenA: "", srOpenB: "부터 보기",

    // 내 예측 기록(시안 20b) — 오답을 먼저 보여주는 화면. 퍼센트는 20건부터만.
    rcTitle: "내 예측 기록",
    rcEmpty: "아직 판정된 예측이 없습니다.\n심화분석을 보면 다음 날 결과가 여기 쌓입니다.",
    rcCounted: "건 확인됨",
    rcAll: "전체", rcMissA: "빗나간 ", rcMissB: "건", rcDeep: "심화 이상만",
    rcNoneInFilter: "이 조건에 해당하는 기록이 없습니다.",
    rcTooFewA: "건으로는 적중률을 말할 수 없습니다. 우연이 실력처럼 보이는 구간입니다 — ",
    rcTooFewB: "건 더 쌓이면 계산해 드립니다.",
    rcRateA: "내 적중률 ", rcRateB: "% · ", rcRateC: "건 기준",

    // 지갑 › 더 보기 — 개편한 화면으로 가는 길. 이게 없으면 상태가 쌓이기 전에는 도달 불가다.
    walMore: "더 보기", walOpen: "열기",
    walReplayOb: "처음 안내 다시 보기",                              // "오늘" 섹션 헤더 — 결과 카드(어제 본 예측)는 P3, 이 섹션이 최상단
    wlNoMatch: "일치하는 종목이 없습니다.",        // 검색·칩 결과가 비었을 때
    wlEmpty: "아직 등록된 종목이 없습니다.\n종목을 추가해 보세요.",
    wlAdd: "＋ 종목 추가",
    wlScan: "스캔",
    wlScanning: "스캔 중 ",                        // + "done/total" 이 뒤에 붙는다
    // 읽음 상태 3종(시안 14a). "오래됨"은 P1a Task 6 에서 붙었다 — 예측 기록(21a 판정 고리)이
    // 생기기 전엔 시간 문턱을 지어내는 셈이라 미뤄뒀는데, 이제 rec.asOf(스캔이 근거한 마지막
    // 확정 봉)를 오늘 달력일과 비교하는 근거가 생겼다(watchlist-model.js readState 참고).
    wlUnread: "새 판정",
    wlRead: "읽음",
    wlOld: "오래됨",
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
    // 전문분석 편집기(시안 10a). 이 화면은 적중률을 약속하지 않는다 — 전문분석 적중률은
    // 사용자마다 가중치가 달라 하나로 환원되지 않고, 재지 않았다(P2 §2 R3).
    xpTitle: "전문분석",
    xpPreset: "기준 성향", xpPresetHint: "가중치가 이미 채워져 있습니다. 그대로 두고 실행해도 됩니다.",
    xpWeights: "지표별 가중치",
    xpSelA: "선택 ", xpSelB: " / ", xpSelC: " · 가중치 ", xpRangeDash: "–",
    xpAlways: "항상 포함",
    xpReset: "기본값 되돌리기", xpRun: "이 설정으로 분석",
    xpShort: "스쿱이 모자랍니다.",
    // 전문분석 조절판(시안 18c). 여기에도 적중률은 없다 — 계산되는 값만 온다(P2 §2 R3·§5.4).
    rpMyWeights: "내 가중치",
    rpTunedA: "조정 ", rpTunedB: " / ",
    rpDeepWidth: "심화 ± ", rpToMine: " → 내 설정 ± ",
    rpEditWeights: "가중치 다시 조절",
    // 막히는 상태 7종(시안 12c). 공통 규칙 셋이 문구에도 그대로 있다 — 막다른 골목 없음 ·
    // 불리한 사실 먼저 · 확인 못 한 건 확인했다고 하지 않음.
    blMin: "분 ", blSec: "초",
    blShortBadge: "잔량 부족 · 시트 안에서 전환", blShortHead: "개가 모자랍니다",
    blShortBodyA: "심화분석에 ", blShortBodyB: "개 필요 · 지금 ",
    blWatchAd: "광고 1편 보기", blLater: "나중에",
    blCooldownBadge: "쿨다운 · 서버 시간 기준", blCooldownHead: " 뒤에 또 볼 수 있어요",
    blCooldownBody: "광고는 2분에 한 번까지입니다.", blBasicFirst: "기본분석 먼저 보기",
    blDailyBadge: "일 상한 · 하루 8회", blDailyHead: "오늘 광고는 여기까지",
    blDailyBody: "내일 오전 9시에 8회가 다시 열립니다. 출석은 아직 남아 있습니다.",
    blCheckin: "출석 받기",
    blCapBadge: "상한 도달 · 광고 전에 고지", blCapHead: "지갑이 거의 찼습니다",
    blCapBodyA: "지금 ", blCapBodyB: "개 · 최대 ", blCapBodyC: "개. 지금 광고를 보면 ",
    blCapBodyD: "개는 버려집니다.", blSpendFirst: "먼저 분석에 쓰기",
    blNoVerdictBadge: "판정 없음 · 차감하지 않음", blNoVerdictHead: "방향을 말할 수 없습니다",
    blNoVerdictBodyA: "개가 ", blNoVerdictBodyB: " 대 ",
    blNoVerdictBodyC: "로 갈렸습니다. 억지로 한쪽을 고르지 않겠습니다 — 스쿱은 쓰지 않았습니다.",
    blWhySplit: "갈린 이유 보기",
    blFailBadge: "계산 실패 · 환불 확인됨", blFailHead: "계산을 마치지 못했습니다",
    blFailBodyA: "스쿱 ", blFailBodyB: "개를 돌려드렸습니다 · 지금 ", blRetry: "다시 시도",
    blFailUnknownBadge: "계산 실패 · 환불 확인 불가", blFailUnknownHead: "환불을 확인하지 못했습니다",
    blFailUnknownBody: "돌려드렸다고 말하지 않겠습니다 — 응답을 못 받았을 뿐입니다. 잔량을 확인해 주세요. 다시 시도해도 중복 차감되지 않습니다.",
    blOpenWallet: "지갑 확인",
    // 해제 직후 전환 장면(시안 8b). 3초 리워드 쇼 — 19a(실시간 중계)와 규칙이 반대라
    // 문구도 섞이지 않게 rv* 로 따로 둔다.
    rvCaption: "지표를 모두 읽는 중",
    rvOpened: "개가\n열렸습니다",
    rvOf: " / ", rvSep: " · ", rvAgree: "개 동의",
    rvSkip: "탭하면 바로 결과로",

    // 분석 진행 중계(시안 19a). 8b 와 문구를 공유하지 않는다 — 8b 는 "열렸습니다"(끝난 일),
    // 19a 는 "읽는 중"(하고 있는 일)이다. 같은 낱말로 뭉치면 두 화면이 같은 것으로 읽힌다.
    anCandleDone: "캔들은 이미 그려졌습니다 · 1단계 완료",
    anReading: "지표를 하나씩 읽는 중",
    anOf: " / ",
    anTallyHead: "지금까지 ",
    anSkip: "탭하면 바로 결과로",
    rdEmpty: "이 조건에 해당하는 지표가 없습니다.",
    // 시안 18b 의 "지표 32개 판독문" 링크 행. 개수는 리터럴이 아니라 엔진에서 나온다.
    rdLinkA: "지표 ", rdLinkB: "개 판독문",
    // rpPickSym("왼쪽에서 티커를 골라주세요")은 2단(폴드) 레이아웃의 빈 오른쪽 칸 문구였다.
    // 태스크 4가 2단을 후퇴시키며 죽었다 — 정확히는 app.js 가 body.ms-dual 을 세우던
    // 경로(dual 렌더 분기)를 걷어낸 것이지, MSLayout(layout.js)이나 관련 CSS 자체를
    // 지운 게 아니다. 그 둘은 그대로 남아 있다(chartHeight 는 지금도 쓰이고, 2단 전용
    // 부분은 P5 재설계 때 다시 쓰인다). 이 문구만 소비자가 없어 죽었다(strings.test.mjs
    // 미사용 키 가드).
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
    // 기본분석 판정 카드의 부제(시안 18a) — "도구 5개 중 4개가 상승을 가리킴". 퍼센트를 쓰지
    // 않는다(설계서 §3.2) — 도구 5개면 값이 0·20·40·60·80·100 뿐이라 확률로 오독된다.
    // 조사 "을"은 상승/하락/보합 세 어간 모두 받침이 있어(승·락·합) 그대로 맞는다 — 어간별
    // 분기를 두지 않는다.
    rpToolsA: "도구 ", rpToolsB: "개 중 ", rpToolsC: "개가 ", rpToolsD: "을 가리킴",
    rpToolsNone: "뚜렷한 방향을 가리키는 도구가 없습니다",
    // 예측 범위는 HORIZON 머리의 캡션이 됐다("288 – 346 · 80% cone") — "Range " 접두와
    // 범위 없음 폴백은 소비자가 사라져 지웠다. 값이 없으면 캡션 자체를 안 낸다.
    rpCone: " · 80% 콘",                        // 시안 2a. 설계 목표치이며 실측 커버리지는 77.7%
    rpAgreeShort: " 동의",                    // Fix 6: 주기 행 요약용("일치" 짧은 형태)
    // 확신%·적중/오답·베이스라인 문구(구 rpHitLead*·rpHitScope*·rpHitBase*)는 P1a Task 3 에서
    // 지웠다 — 기본 판정 카드(verdict)는 이제 basic 전용(퍼센트 없음)이고, 그 내용은 P1b 의
    // forecast·hitrate 블록(설계서 §3.5)이 새로 짓는다. 옛 문구는 git 이력(이 커밋 이전
    // strings.js)에 그대로 남아 있다 — 참조용으로만 지운다, 재구현은 P1b 소관.
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
    // rpTierCustom 도 같은 압축 규칙(tsCustom/walOptimiser/xpTitle="전문분석"의 어간). 개수가 30인
    // 이유는 가중치 레일이 gann·pattern 을 뺀 30종이기 때문이다(인벤토리 §0 충돌 1) — 판정이 읽는
    // 32 와 다른 숫자이고, 그 차이가 이 화면의 정체다.
    rpTierCustom: "전문", rpTierCountCustom: "지표 30개 · 내 가중치",
    // 성향 칩(헤더, 설계서 §3.2) — "추세 추종 기준" 처럼 선택된 프리셋 이름 + 접미사로 조립한다.
    // 탭하면 성향 변경 시트(12b)가 열려야 하지만 그건 P2 다 — 지금은 표시만.
    rpStyleSuffix: " 기준",

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
    // 해제 카드(시안 18a) — "27" 은 리터럴이 아니라 32 − 기본 5 에서 나온다. 지표가 늘면
    // 이 문구도 따라 움직여야 하고, 안 그러면 화면이 세지 않은 수를 말하게 된다.
    rpLockedA: "이 화면에 ", rpLockedB: "개 지표와\n차트 절반이 빠져 있습니다",
    // 해제 블록 두 버튼(P1a Task 3, 설계서 §3.2 항목5) — 광고가 위(자발적 시청이 목표라
    // 1순위), 스쿱이 아래. 직전 라운드에 이 CTA 자체가 통째로 사라진 사고가 있었다 — 유료
    // 티어로 가는 유일한 진입점이라 반드시 존재해야 한다.
    rpUnlockAd: "광고 1편으로 열기", rpUnlockAdBadge: "30초",
    rpUnlockScoopA: "스쿱 ", rpUnlockScoopB: "개로 열기",
    // [리뷰 C1, 2026-08-18] 심화·전문 둘 다 아직 못 그리는 블록이 있어(report.js PENDING)
    // 어느 화폐로도 살 수 없을 때, 광고·스쿱 버튼 자리를 대신 채우는 문구. "P1b" 같은 내부
    // 페이즈 용어를 쓰지 않는다 — tier-sheet.js 의 tsSoon 과 같은 어조.
    rpUnlockSoon: "심화·전문 분석은 아직 준비 중입니다. 지금은 열 수 있는 것이 없습니다.",
    // 읽은 도구 접힌 한 줄(설계서 §3.2 항목6) — 32개를 나열하지 않는다.
    rpReadToolsA: "읽은 도구 ", rpReadToolsB: "개",
    // 지표 빗(comb) 밖 자물쇠 한 줄(설계서 §3.2 항목2) — 막대 옆이 아니라 빗 아래 한 줄로.
    // [리뷰 C1] "광고 1편으로 전부 열림"은 **약속**이다 — 실제로 열리지 않을 때(둘 다
    // tierBuyable=false)까지 이 약속을 달면 살 수 없는 것을 판다. 그래서 두 조각으로
    // 가른다: 개수(rpCombNote)는 항상, 약속(rpCombNoteAd)은 buildComb()이 buyable 일 때만
    // 붙인다.
    rpCombNote: "개 잠김",
    rpCombNoteAd: " · 광고 1편으로 전부 열림",
    // 기본분석은 범위만 답한다(시안 18a). 이 문장이 이 티어의 판매 논리 그 자체다 —
    // 쓸모없게 만들면 첫인상이 나빠지고, 충분하게 만들면 살 이유가 없다(인벤토리 §3).
    rpBasicRangeNote: "범위만 말합니다. 어디에 가까울지는 이 단계에서 알 수 없습니다.",
    rpAgreeTf: "/", rpAgreeTfTail: " 주기 일치",
    rpNoHistory: "이력이 부족합니다",

    // 3단 대조(시안 7a, 설계서 §3.3) — 이 개편의 판매 논거. 컨트롤러 판정 D1(리뷰 2026-08-19)
    // 로 "이 종목의 폭이 절반"에서 "엔진 전체 모집단 지표"로 성격이 바뀌었다(실측 근거는
    // tier-compare.js 헤더 주석). 숫자 조각은 전부 tier-compare.js 가 window.MSBacktest 에서
    // 계산해 채운다 — 여기 있는 값은 자릿수 없는 문구 조각뿐이다(리터럴 금지, 관문
    // tier-compare.test.mjs). [리뷰 M1] 축 상수(55~70)도 여기 리터럴로 안 두고 screens/
    // report.js 가 MSTierCompare.AXIS_MIN/MAX 를 런타임에 끼워 넣는다.
    tcHead: "3단 대조",
    // R3(적중률 리터럴 금지)가 "적중"+퍼센트숫자가 **같은 리터럴**에 있으면 잡는다 — 두
    // 조각으로 쪼개 각 리터럴엔 둘 중 하나만 남긴다(R3 는 조각 단위로 본다, 문장 전체가 아니라).
    tcAxisNoteA: "적중률 막대는 ", tcAxisNoteMid: "~", tcAxisNoteB: "% 구간만 확대해 보여줍니다.",
    // [리뷰 I1] 적중률에 범위 주석 필수(상위 설계서 §9.3 규칙4) — 이 수치가 이 종목이 아니라
    // 엔진 전체 측정값이라는 사실. n·시리즈 수도 MSBacktest 에서 온다(리터럴 아님).
    tcScopeA: "이 수치는 이 종목이 아니라 엔진 전체(", tcScopeB: "종목 · ",
    tcScopeC: "건)를 측정한 값입니다 — 이 종목의 성적이 아닙니다.",
    tcMeasuring: "측정 중",                // 실측이 없는 자리 — 지어내지 않는다
    // 적중률 값을 보일 땐 반드시 기준선과 짝을 이룬다(설계서 §9.3 규칙9) — 두 조각을
    // 이어붙이면 "적중 58.2% · 기준선 61.0%"가 된다.
    tcRateLabel: "적중 ", tcBaselineLabel: " · 기준선 ",
    // 모집단 행 — 커버리지·오차(ECE) 라벨. "커버리지 73.8% · 오차 1.05%p" 형태로 조립한다.
    tcCovLabel: "커버리지 ", tcEceLabel: " · 오차 ", tcEceUnit: "%p",
    // 전문 카드 경고 — "적중률"이 들어가지만 퍼센트 숫자가 없는 문장이라 R3(리터럴 금지)에
    // 걸리지 않는다. 실측이 아니라 방향성 경고이므로 리터럴이어도 된다.
    tcCustomWarn: "가중치에 따라 방향 적중률이 기본분석보다 낮아질 수 있습니다.",
    // 심화 카드의 "불리한 사실" — 시안 원문은 "적중률은 2%p 만 오릅니다"라는 샘플 문구였지만
    // 실측은 다르다. tier-compare.js 의 deltaNote() 가 이 조각들 사이에 실측값을 끼워 넣는다:
    // "방향 적중률은 {기본}% → {심화}%로, {부호}{차이}%p 오릅니다/낮아집니다. 심화가 파는 건
    // 방향이 아니라 범위입니다 — 콘 커버리지 {기본}% → {심화}%, 오차는 {배수}배 더 정직해집니다."
    // [리뷰 I3] 방향 동사를 하드코딩하지 않는다 — tcDeltaUp/tcDeltaDown 을 부호로 가른다.
    tcDeltaA: "방향 적중률은 ", tcDeltaB: "% → ", tcDeltaC: "%로, ",
    tcDeltaUp: "%p 오릅니다. ", tcDeltaDown: "%p 낮아집니다. ",
    tcDeltaTail: "심화가 파는 건 방향이 아니라 범위입니다 — 콘 커버리지 ",
    tcDeltaE: "% → ", tcDeltaF: "%, 오차는 ", tcDeltaG: "배 더 정직해집니다.",

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
    tsDone: "받음", tsPopular: "가장 많이 씀",
    // 그리는 함수가 아직 없는 블록이 있는 티어는 팔지 않는다(리뷰 판정, 2026-08-18) —
    // tier-sheet.js 가 그 티어 행을 잠그며 쓴다. "P1b" 같은 내부 페이즈 용어를 쓰지 않는다.
    tsSoon: "곧 지원 예정",
    // [리뷰 C1] 심화·전문이 둘 다 잠겨(picked===null) Run 도 못 누르는 상태는 백드롭 닫기
    // 말고 할 게 없었다(blocked.js 의 "막다른 골목 금지" 규칙 위반) — 워치리스트로 돌려
    // 보내는 버튼 문구.
    tsBackToList: "워치리스트로 돌아가기",
    tsScoopUnit: "스쿱",                          // 심화분석 행의 값 아래 단위 라벨("3" + 이 값)
    tsSpendLead: "쓰면 ",                         // 비용 한 줄 왼쪽 — "쓰면 " + "12 → 9"
    tsRun: " 실행",                               // 버튼 — tsFull(위 주석) + 이 값
    tsShort: "스쿱이 부족합니다. 내일 출석하면 +1개를 더 받을 수 있습니다.",
    tsRunning: "실행 중…",
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
    obGranting: "지갑을 준비하는 중…",
    obGranted: "개 스쿱으로 시작합니다",
    obGrantOffline: "지갑에 연결하지 못했습니다. 계속 진행할 수 있습니다 — 기본분석은 항상 무료입니다.",
    obRetry: "다시 시도",
    // obCostFull 은 walDeep·rpTierFull·tsFull 과 같은 단계다(위 walDeep 주석). 스캔 행은 없다 —
    // 2026-08-17 결정으로 스캔이 무료가 되어 "가격"이 아니다.
    obCostFull: "심화분석",
    obH5: "시작하기 전에",
    obRisk: "MoneyScoop은 가격·거래량·시간만 읽습니다. 기업 뉴스나 실적, 다른 사람에게 들은 어떤 것도 알지 못합니다. 여기 있는 어떤 것도 투자 조언이 아니며, 예측은 약속이 아닙니다.",
    obAgree: "내용을 이해했으며 약관에 동의합니다.",

    // ── 시안 정본 7단계(DESIGN-INVENTORY §2, t17) ──────────────────────────────────
    // 1 콜드오픈 · 2 투자성향 · 3 위험고지 · 4~6 3모드 체험 · 7 완료·가격표·지급.
    // 순서가 핵심이다: 값(폭·확신)을 먼저 겪은 뒤에야 가격을 공개한다. 가격표를 먼저 보면
    // "3스쿱"이 그냥 숫자다.
    obGuessUp: "오를 것", obGuessDown: "내릴 것",
    obGuessAsk: "먼저 직접 찍어보세요. 바로 실제 결과를 보여드립니다.",
    obGuessRight: "맞히셨습니다.", obGuessWrong: "빗나갔습니다.",
    obGuessActualA: "실제로는 ", obGuessActualUp: "올랐습니다", obGuessActualDown: "내렸습니다",

    // 찍기 전 힌트 — 도구 3종(MA·볼린저·거래량, screens/onboarding.js TOOLS) 옆에 한 줄씩.
    // 감이 아니라 근거를 보고 찍게 하는 것이 목적이다.
    obToolMaHint: "값이 이 선 위면 최근 흐름이 위쪽입니다.",
    obToolBbHint: "밴드 위·아래를 벗어나면 그 방향으로 힘이 세다는 뜻입니다.",
    obToolVolHint: "거래량이 몰리면 그 방향에 힘이 실렸다는 뜻입니다.",

    // 찍은 뒤 — 엔진이 실제로 계산한 판독문(하드코딩 문구가 아니다, MSIndicators.readings 가
    // 이 순간에 돈다). 판정 한 줄 + 근거/반대/뚜렷하지 않음 세 갈래.
    obReadVerdictA: "이 구간에서 엔진의 판정은 ",
    obReadForHead: "근거",
    obReadFlatHead: "뚜렷하지 않은 판독",
    obReadUnavailable: "지금은 엔진을 돌릴 수 없어 판독을 보여드릴 수 없습니다.",
    // 두 갈래 — 맞혔든 틀렸든 이 앱이 하는 일을 보여준다. 32는 코드에서 ForgeCore.indicatorCount 로 채운다.
    obTailRightA: "감이 좋으시네요. 이걸 ", obTailRightB: "개 도구로 매일 해드립니다.",
    obTailWrongA: "그래서 도구를 ", obTailWrongB: "개 읽습니다 — 하나로는 이렇게 놓칩니다.",

    obH2b: "어떻게 보는 편이신가요?",
    obSub2b: "같은 차트라도 무엇을 중요하게 보느냐에 따라 판정이 달라집니다. 나중에 바꿀 수 있습니다.",
    obStyleNote: "고른 성향이 전문분석의 가중치 기본값이 됩니다. 나중에 지표별로 직접 조절할 수 있습니다.",
    // 성향 설명 4종 — 시안 11c 원문. 용어가 아니라 태도를 묻는다.
    obStyleTrend: "가던 방향으로 더 간다고 봅니다",
    obStyleMomentum: "최근 며칠의 힘을 가장 크게 봅니다",
    obStyleReversion: "많이 벌어지면 제자리로 온다고 봅니다",
    obStyleVolatility: "흔들림의 크기를 먼저 봅니다",

    // 4~6단계: 3모드 체험. 시안 16a~16c.
    obTutIntroH: "세 가지를 다 무료로 써보세요",
    obTutIntroSub: "종목 하나로 세 번 연달아 봅니다.",
    obTutStep1: "기본분석 — 도구 5개 · 방향과 범위",
    obTutStep2: "심화분석 — 도구 32개 · 범위가 정직해집니다",
    obTutStep3: "전문분석 — 가중치를 직접 조절",
    obTutPick: "어떤 종목으로 해볼까요?",
    obTutOf: " / ",
    obTutLoading: "실제 데이터로 계산하는 중…",
    // 실 데이터를 못 받으면 예시 시계로 돌린다 — 그 사실을 숨기지 않는다. 숨기면 화면의
    // 숫자가 어느 종목 것인지 아무도 말할 수 없게 된다.
    obTutFallback: "네트워크에 연결하지 못해 예시 데이터로 보여드립니다.",

    obTut1H: "기본분석 — 방향과 범위",
    obTut1Sub: "도구 5개로 내일을 봅니다.",
    obTutTomorrow: "내일 예상",
    obTutWidth: "폭 ",

    // ⚠ 시안 16b 는 "답이 절반으로 좁아졌습니다"를 두 막대로 보여준다. **우리 엔진에서는
    // 거짓이다** — 실측하면 심화의 범위가 오히려 넓어진다(모든 지평에서). 티어 백테스트와도
    // 일치한다: 콘 커버가 73.8% → 77.1% 로 오른 것은 범위가 넓어졌다는 뜻이다.
    // 그래서 파는 것을 사실대로 바꿔 적는다 — 심화가 주는 것은 좁은 답이 아니라 **정직한 범위**다.
    obTut2H: "범위가 정직해집니다",
    obTut2Sub: "같은 종목, 같은 날. 도구만 5개 → 32개.",
    obTut2Label: "“80% 범위”가 실제로 덮은 비율",
    obTut2Basic: "기본분석", obTut2Full: "심화분석", obTut2Target: "라벨 80%",
    obTut2Note: "좁은 답이 좋은 답은 아닙니다. 5개로 좁게 부르면 그만큼 자주 빗나갑니다 — 심화분석은 범위를 실제 불확실성에 맞춥니다.",
    obTut2Wider: "이번 종목에서는 폭이 오히려 넓어졌습니다. 감추지 않고 그대로 보여드립니다.",

    obTut3H: "추세를 더 믿어 볼까요?",
    obTut3Sub: "슬라이더를 끌어보세요. 위 숫자가 바로 바뀝니다.",
    obTut3Now: "지금 답",
    obTut3Default: "기본값 1.0",
    obTut3Note: "실제 전문분석에는 이런 슬라이더가 30개 있습니다. 지금은 하나만 열어뒀습니다.",

    obDoneH: "세 가지를 다 써보셨습니다",
    obDoneSub: "같은 종목이 이렇게 달라졌습니다.",
    obDoneNow: "이제부터",
    obDoneFree: "기본분석은 계속 무료입니다",
    obDoneEarn: "스쿱은 매일 출석하거나 광고로 얻습니다",
    obDoneStart: "받고 시작하기",

    // 19b 「한 문장으로」 — 생성 문구가 아니라 방향·과열·저항 세 값을 잇는 규칙 조합 소재다
    // (report-model.js sentence()). 조합 자체는 코드가 하므로 여기엔 완결된 절만 둔다 —
    // 절을 어순 바꿔 붙이면 문법이 깨지는 구조는 피한다(공백으로 이어 붙여도 자연스럽게).
    rpSentBull: "상승 흐름입니다.", rpSentBear: "하락 흐름입니다.", rpSentFlat: "뚜렷한 방향이 없습니다.",
    rpSentOverheat: "다만 다소 과열된 구간입니다.",
    rpSentResistance: "저항선이 가까워 속도가 둔화될 수 있습니다.",
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
