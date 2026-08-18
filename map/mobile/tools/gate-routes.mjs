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
//
// assert 는 (리뷰 C2) **①MSApp.current().route 가 기대한 라우트인가 + ②그 화면에만 있는
// 표식이 있는가** 의 AND 다. 이전엔 wallet 이 '스쿱'(브랜딩 — 다른 화면에도 있다)을,
// record·result 는 textContent.length > 50(워치리스트도 넘는다)을 썼다 — go() 가 실패해
// 워치리스트에 머물러도 통과하는 구멍이었다. **리뷰 I5로 이행 완료**: 두 번째 조건은
// 이제 화면 고유 클래스 접두가 아니라 `[data-screen="<id>"]`(shell.js 의 render() 가 매
// 전환마다 #app 에 붙인다)다 — P1 이 화면 내부를 재작성해 그 클래스들이 사라져도 관문
// 선택자가 안 깨진다. 온보딩만 예외(아래 참고, 셸 이전이라 data-screen 자체가 안 붙는다).
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
  // onboarding 은 MSApp.current().route 가 못 쓴다 — state.showing 이 "watchlist" 기본값에서
  // 안 바뀐 채로 온보딩이 그려진다(온보딩은 app.js 부팅 게이트를 아예 우회한다). 대신 온보딩
  // 모듈 자신(MSOnboarding)이 로드됐는가 + 1단계 전용 표식(.ob-step)으로 정체성을 확인한다.
  { name: "onboarding", seed: {}, go: null,
    assert: "typeof MSOnboarding !== 'undefined' && !!document.querySelector('.ob-step') && " +
      "document.querySelectorAll('button, [role=button]').length > 0" },
  // Task 4(하단 탭바) 이후: 탭 3개가 실제로 그려졌는지를 여기서 확인한다 — 관문이 초록인데
  // 탭바가 없던(화면이 비어 있던) 것과 같은 부류의 사고를 이 경로에서 반복하지 않기 위해서다.
  { name: "watchlist", seed: { ...ON, ms_preds: PREDS }, go: null,
    assert: "MSApp.current().route === 'watchlist' && !!document.querySelector('[data-screen=\"watchlist\"]') && " +
      "document.querySelectorAll('[data-sym]').length === 3 && document.querySelectorAll('.ms-tab').length === 3" },
  { name: "report", seed: { ...ON, ms_preds: PREDS }, go: '"report",{sym:"AAPL"}', delay: 1200,
    assert: "MSApp.current().route === 'report' && !!document.querySelector('[data-screen=\"report\"]') && " +
      "!/불러오지 못했습니다/.test(document.getElementById('app').textContent)" },
  { name: "wallet", seed: ON, go: '"wallet"',
    assert: "MSApp.current().route === 'wallet' && !!document.querySelector('[data-screen=\"wallet\"]')" },
  // 2026-08-18 리뷰(Critical): 기본만 여는 관문이 "심화·전문이 8/9개 중 3~4개만 그린다"는
  // 사고를 놓쳤다 — report-blocks.test.mjs(정적 분석)가 그 구조적 원인은 잡지만, 실제 브라우저
  // DOM 이 맞는 상태를 보여주는지는 노드 테스트가 못 본다(이 관문이 존재하는 이유 자체가 그
  // 사각지대다). 지금은 report-blocks.js 의 PENDING(sentence·forecast·hitrate·compare)이
  // full·custom 을 둘 다 못 팔게 잠가서(tier-sheet.js locked) 분석 화면 자체를 열 수 없다 —
  // 그래서 여기서 재는 것은 "그 잠금이 빈 화면이 아니라 자물쇠+문구로 정직하게 보이는가"다.
  // click 은 go() 가 report 를 그린 뒤(1300ms) `.rp-cta` 를 눌러 시트를 연다 — MSWallet.get()
  // 왕복이 비동기라 assert 안에서 클릭하면 assert 의 동기 평가가 먼저 끝나 열리기 전 DOM 을
  // 본다(그래서 route.click 을 따로 뒀다, gate-browser.mjs 참고). PENDING 이 비면(P1b 완료)
  // 이 라우트는 락 화면 대신 실제 분석 화면을 재도록 다시 써야 한다 — report-blocks.test.mjs
  // 의 "PENDING 이 비어있지 않은 티어가 실제로 있다" 단언이 그 시점을 알려준다.
  { name: "report-locked-tiers", seed: { ...ON, ms_preds: PREDS }, go: '"report",{sym:"AAPL"}',
    click: ".rp-cta", clickDelay: 1800, delay: 3200,
    assert: "MSApp.current().route === 'report' && !!document.querySelector('[data-screen=\"report\"]') && " +
      "(function(){" +
        "var full=document.querySelector('.sheet-tier.tier-full');" +
        "var custom=document.querySelector('.sheet-tier.tier-custom');" +
        "if(!full||!custom) return false;" +                                        // 시트 자체가 안 열렸다
        "if(!full.classList.contains('is-locked')||!custom.classList.contains('is-locked')) return false;" +
        "if(!full.querySelector('.sheet-tier-locked svg')||!custom.querySelector('.sheet-tier-locked svg')) return false;" +
        "if(full.querySelector('.sheet-tier-price')||custom.querySelector('.sheet-tier-price')) return false;" + // 잠긴 행에 값이 남으면 반쪽 잠금이다
        "var run=document.querySelector('.sheet-run');" +
        "if(!run||!run.disabled) return false;" +                                   // 잠긴 티어를 실행할 수 있으면 안 된다
        "return true;" +
      "})()" },
  { name: "record", seed: { ...ON, ms_preds: PREDS }, go: '"record"',
    assert: "MSApp.current().route === 'record' && !!document.querySelector('[data-screen=\"record\"]')" },
  { name: "result", seed: { ...ON, ms_preds: PREDS }, go: '"result",{sym:"TSLA",asOf:"2026-08-14"}',
    assert: "MSApp.current().route === 'result' && !!document.querySelector('[data-screen=\"result\"]')" }
];
