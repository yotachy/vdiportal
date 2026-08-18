// 관문이 열어볼 화면 목록. 화면이 늘면 여기에 한 줄 는다.
// seed: localStorage 에 심을 상태 / go: 부팅 후 이동 / assert: 페이지 안에서 돌 단언(문자열)
//
// 상태를 심는 이유: 이 앱의 화면 대부분이 상태 의존적이라, 상태 없이 열면 "아무것도 안 바뀐
// 앱"만 보게 된다(2026-08-17 사고). 관문은 그 상태를 스스로 만든다.
//
// assert 는 반드시 document.body 가 아니라 #app(실제 렌더 루트)을 읽는다 — gate-browser.mjs
// 가 세션마다 <body> 안에 프로브 <script> 를 주입하는데, textContent 는 <script> 태그
// 내부의 "텍스트"(= JS 소스 문자열 리터럴)까지 전부 딸려온다. 그래서 body 전체를 읽으면
// assert 문자열 자기 자신(그 안의 한국어 리터럴)이 검색 대상에 섞여 들어가 자기참조로
// 항상 걸린다(실측: report 단언이 "불러오지 못했습니다"를 자기 소스에서 찾아 늘 실패).
const WL = [{ sym: "AAPL", name: "애플" }, { sym: "NVDA", name: "엔비디아" }, { sym: "TSLA", name: "테슬라" }];
const ON = {
  ms_onboarded: true,
  ms_consent: { termsVersion: "2026-08-17", at: "2026-08-16T00:00:00Z" },
  ms_watchlist: WL
};
const PREDS = [
  { sym: "AAPL", name: "애플", tier: "full", asOf: "2026-08-14", base: 233.0, mid: 234.2,
    lo: 233.1, hi: 235.3, basicLo: 232.0, basicHi: 236.0, judgedOn: "2026-08-15",
    hit: true, miss: 0, actual: 233.9, basicHit: true, narrowedAndMissed: false, seen: false },
  { sym: "TSLA", name: "테슬라", tier: "full", asOf: "2026-08-14", base: 244.0, mid: 245.2,
    lo: 244.0, hi: 246.4, basicLo: 242.0, basicHi: 250.0, judgedOn: "2026-08-15",
    hit: false, miss: 0.4, actual: 246.8, basicHit: true, narrowedAndMissed: true, seen: false }
];

export const ROUTES = [
  { name: "onboarding", seed: {}, go: null,
    assert: "document.querySelectorAll('button, [role=button]').length > 0" },
  { name: "watchlist", seed: { ...ON, ms_preds: PREDS }, go: null,
    assert: "document.querySelectorAll('[data-sym]').length === 3" },
  { name: "report", seed: { ...ON, ms_preds: PREDS }, go: '"report",{sym:"AAPL"}', delay: 1200,
    assert: "!/불러오지 못했습니다/.test(document.getElementById('app').textContent)" },
  { name: "wallet", seed: ON, go: '"wallet"',
    assert: "document.getElementById('app').textContent.indexOf('스쿱') >= 0" },
  { name: "record", seed: { ...ON, ms_preds: PREDS }, go: '"record"',
    assert: "document.getElementById('app').textContent.length > 50" },
  { name: "result", seed: { ...ON, ms_preds: PREDS }, go: '"result",{sym:"TSLA",asOf:"2026-08-14"}',
    assert: "document.getElementById('app').textContent.length > 50" }
];
