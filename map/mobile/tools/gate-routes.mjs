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

// 오늘의 로컬 달력일(store.js localDate() 와 동일한 계산) — "오래됨" 상태를 실제로 만들려면
// today 와 확실히 다른 asOf 하나, today 자체인 asOf 하나가 필요하다. 둘 다 리터럴로 박으면
// 실행 시각에 따라 read/old 판정이 갈려 관문이 날짜 넘김에 죽는다(node 쪽에서 계산해 브라우저
// 실행 시각과 같은 날짜가 되게 한다 — 자정을 걸치는 극히 드문 경우 외엔 항상 맞는다).
function localDateStr(d) {
  var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return y + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
}
const TODAY = localDateStr(new Date());

// 읽음 상태 3종(시안 14a, P1a Task 6) — Task 6 리뷰가 지적한 공백: 이 3종을 만드는 ms_scan
// 이 watchlist 관문 시드에 없어 브라우저가 .wl-dot 을 실제로 그린 적이 한 번도 없었다(node
// 시험만 통과, watchlist-model.test.mjs 는 readState() 를 순수함수로만 잰다). WL(위 3종) 각각에
// 다른 상태를 하나씩 물린다 — AAPL=안읽음(스캔은 있지만 본 적 없다) · NVDA=읽음(마지막으로
// 본 스캔과 scannedAt 이 같고 asOf 가 오늘) · TSLA=오래됨(마찬가지로 읽었지만 asOf 가 옛날 —
// 그 사이 새 봉이 하나 더 생겼을 것). scannedAt 값 자체는 리터럴이어도 된다 — readState() 는
// viewedKey 와 문자열이 같은지만 보지 실제 시각을 안 잰다.
const SCAN = {
  AAPL: { price: 233.9, chg: 0.4, asOf: "2026-08-14", scannedAt: "2026-08-18T09:00:00.000Z" },
  NVDA: { price: 118.2, chg: -0.6, asOf: TODAY, scannedAt: "2026-08-18T09:05:00.000Z" },
  TSLA: { price: 246.8, chg: 1.1, asOf: "2020-01-01", scannedAt: "2026-08-18T09:10:00.000Z" }
};
const VIEWED = {
  // AAPL 은 의도적으로 없음 — "본 적 없다"가 곧 안읽음이다(readState: viewedKey !== rec.scannedAt).
  NVDA: SCAN.NVDA.scannedAt,
  TSLA: SCAN.TSLA.scannedAt
};

export const ROUTES = [
  // onboarding 은 MSApp.current().route 가 못 쓴다 — state.showing 이 "watchlist" 기본값에서
  // 안 바뀐 채로 온보딩이 그려진다(온보딩은 app.js 부팅 게이트를 아예 우회한다). 대신 온보딩
  // 모듈 자신(MSOnboarding)이 로드됐는가 + 1단계 전용 표식(.ob-step)으로 정체성을 확인한다.
  { name: "onboarding", seed: {}, go: null,
    assert: "typeof MSOnboarding !== 'undefined' && !!document.querySelector('.ob-step') && " +
      "document.querySelectorAll('button, [role=button]').length > 0" },
  // Task 4(하단 탭바) 이후: 탭 3개가 실제로 그려졌는지를 여기서 확인한다 — 관문이 초록인데
  // 탭바가 없던(화면이 비어 있던) 것과 같은 부류의 사고를 이 경로에서 반복하지 않기 위해서다.
  // P1a Task 6(워치리스트, 시안 14a) — 스쿱 필 아이콘이 실제로 마크(scoopMark, svg)로
  // 바뀌었는지를 여기서도 잰다. node 시험(watchlist.test.mjs)은 innerHTML 문자열을 보지만,
  // 여긴 실제 브라우저가 그 svg 를 실제 엘리먼트로 파싱해 넣는지까지 본다 — 문자열만 맞고
  // 브라우저에서 안 그려지는 경우(태그 오타 등)는 node 시험이 못 잡는다.
  { name: "watchlist", seed: { ...ON, ms_preds: PREDS, ms_scan: SCAN, ms_wl_viewed: VIEWED }, go: null,
    // .wl-dot 3종 단언은 조건부 if 로 안 감싼다(그 형태로 이 저장소가 이미 네 번 데였다) — 위
    // seed 가 항상 세 상태를 다 심으므로 이 AND 절은 매 실행 무조건 평가된다.
    assert: "MSApp.current().route === 'watchlist' && !!document.querySelector('[data-screen=\"watchlist\"]') && " +
      "document.querySelectorAll('[data-sym]').length === 3 && document.querySelectorAll('.ms-tab').length === 3 && " +
      "!!document.querySelector('.ms-pill-ico svg') && document.getElementById('app').textContent.indexOf('◆') < 0 && " +
      "document.querySelectorAll('.wl-dot.unread').length === 1 && document.querySelectorAll('.wl-dot.read').length === 1 && " +
      "document.querySelectorAll('.wl-dot.old').length === 1" },
  // P1a Task 3(기본분석 리포트) — node 시험(report-basic.test.mjs)은 가짜 DOM 조립을 잰다.
  // 여기서는 **실제 브라우저**가 같은 결과를 내는지를 재차 확인한다 — 이 프로젝트가 반복
  // 겪은 "관문은 초록인데 화면은 다른 말을 한다" 사고의 구멍은 언제나 가짜 DOM 과 실제
  // 레이아웃(CSS 캐스케이드·실제 getComputedStyle)이 갈라지는 지점에서 생겼다.
  { name: "report", seed: { ...ON, ms_preds: PREDS }, go: '"report",{sym:"AAPL"}', delay: 1200,
    assert: "MSApp.current().route === 'report' && !!document.querySelector('[data-screen=\"report\"]') && " +
      "!/불러오지 못했습니다/.test(document.getElementById('app').textContent) && " +
      "(function(){" +
        "var bar=document.querySelector('.rp-comb-bar');" +
        "if(!bar||bar.children.length!==32) return false;" +               // 지표 빗 32칸
        "if(bar.querySelectorAll('.is-steel').length!==5) return false;" +
        "if(bar.querySelectorAll('.is-locked').length!==27) return false;" +
        // 색 규칙(리뷰 2026-08-18) — 위치=방향, 색=반대. 동의 칸은 정확히 --steel 픽셀값
        // (136,146,166)이어야 하고, 어떤 칸도 동의+반대 역할을 동시에 가지면 안 된다.
        // 이 라우트의 AAPL 은 gate-browser.mjs 의 고정 mock(드리프트 0.12)이라 매번
        // neutral 로 떨어진다(node 로 실측) — 그래서 agree/dissent 존재는 여기서 강제하지
        // 않는다(강제하면 이 라우트 자체가 항상 실패한다). 양방향 실측·픽셀 검증은
        // 아래 report-comb-bull 라우트(드리프트 0.3, bull 로 결정적)가 한다.
        "var steelCells=Array.prototype.slice.call(bar.children).filter(function(c){return c.className.indexOf('is-steel')>=0;});" +
        "var roleOk=true;" +
        "steelCells.forEach(function(cell){" +
          "Array.prototype.slice.call(cell.children).forEach(function(span){" +
            "var on=span.className.indexOf('is-on')>=0;" +
            "var agree=span.className.indexOf('rp-comb-agree')>=0;" +
            "var dissent=span.className.indexOf('rp-comb-dissent')>=0;" +
            "var nodir=span.className.indexOf('rp-comb-nodir')>=0;" +   // 판정이 중립이면 동의·반대 둘 다 성립하지 않는다
            "var roles=(agree?1:0)+(dissent?1:0)+(nodir?1:0);" +
            "if(on&&roles!==1) roleOk=false;" +                          // on 인데 역할이 0개거나 2개 이상이면 버그
            "if(agree){var bg=getComputedStyle(span).backgroundColor.replace(/\\s/g,'');if(bg!=='rgb(136,146,166)') roleOk=false;}" +
          "});" +
        "});" +
        "if(!roleOk) return false;" +
        "var sub=document.querySelector('.rp-verdict-sub');" +
        "if(!sub||/%/.test(sub.textContent)) return false;" +              // 판정 부제에 퍼센트 없음
        "var unlock=document.querySelector('.rp-unlock');" +
        "if(!unlock) return false;" +                                     // 해제 CTA 존재(직전 사고 재발 방지)
        "var ad=unlock.querySelector('.rp-cta-ad'), scoop=unlock.querySelector('.rp-cta-scoop');" +
        "if(!ad||!scoop) return false;" +
        "var kids=Array.prototype.slice.call(unlock.children);" +
        "if(kids.indexOf(ad) > kids.indexOf(scoop)) return false;" +       // 광고가 스쿱보다 먼저(DOM 순서)
        "var rt=document.querySelector('.rp-readtools');" +
        "if(!rt||rt.children.length!==0) return false;" +                  // 읽은 도구 = 접힌 한 줄
        // P1a Task 4 D1(리뷰 2026-08-19) — 3단 대조가 이제 모집단 지표라 종목·드리프트와
        // 무관하게 **항상** 뜬다(종목별 예측 폭 프리뷰·G1 생략 가드는 걷어냈다) — 그래서
        // 인위적인 전용 라우트 대신 이 기본 report 라우트에서 그대로 확인한다.
        "var tc=document.querySelectorAll('.rp-tc-card');" +
        "if(tc.length!==3) return false;" +
        "if(tc[0].className.indexOf('is-basic')<0||tc[1].className.indexOf('is-full')<0||tc[2].className.indexOf('is-custom')<0) return false;" +
        "var axis=document.querySelector('.rp-tc-axis');" +                // [리뷰 M1] 축 숫자는 리터럴이 아니라 MSTierCompare 에서 온다
        "if(!axis||axis.textContent.indexOf(String(MSTierCompare.AXIS_MIN))<0||axis.textContent.indexOf(String(MSTierCompare.AXIS_MAX))<0) return false;" +
        "var scope=document.querySelector('.rp-tc-scope');" +              // [리뷰 I1] 범위 주석 필수
        "if(!scope||scope.textContent.indexOf('엔진 전체')<0) return false;" +
        "var custom=tc[2];" +
        "if(custom.querySelectorAll('.rp-tc-measuring').length!==2) return false;" + // 적중률·커버리지 둘 다 측정 중
        "if(tc[0].querySelectorAll('.rp-tc-measuring').length!==0||tc[1].querySelectorAll('.rp-tc-measuring').length!==0) return false;" +
        "var basicVal=tc[0].querySelector('.rp-tc-rateval'), fullVal=tc[1].querySelector('.rp-tc-rateval');" +
        "if(!basicVal||!fullVal||basicVal.textContent.indexOf('기준선')<0||fullVal.textContent.indexOf('기준선')<0) return false;" + // 기준선 짝(규칙9)
        "var basicCov=tc[0].querySelector('.rp-tc-covval'), fullCov=tc[1].querySelector('.rp-tc-covval');" +
        "if(!basicCov||!fullCov||basicCov.textContent.indexOf('커버리지')<0||fullCov.textContent.indexOf('오차')<0) return false;" +
        "var fullNote=tc[1].querySelector('.rp-tc-note'), customNote=tc[2].querySelector('.rp-tc-note');" +
        "if(!fullNote||fullNote.textContent.indexOf('%p')<0||fullNote.textContent.indexOf('콘 커버리지')<0) return false;" +
        "if(!customNote||customNote.textContent.indexOf('낮아질')<0) return false;" +
        // [리뷰 C1] 기본분석은 확률을 말하지 않는다 — "내일은 어디쯤" 행에 %가 없어야 한다.
        "var probs=document.querySelectorAll('.rp-hz-prob');" +
        "for(var pi=0;pi<probs.length;pi++){ if(probs[pi].textContent!=='') return false; }" +
        "return true;" +
      "})()" },
  // 재리뷰(2026-08-18) Important — 위 report 라우트의 AAPL 은 이 파일의 candles() 기본
  // 드리프트(0.12)를 먹는데, 그 드리프트로는 ForgeCore.run 이 verdict.regime="neutral" 을
  // 결정적으로 낸다(node 로 basicGraph 를 직접 돌려 확인 — 아래 DRIFT_BY_SYMBOL 주석 참고).
  // 그래서 위 라우트는 지표 빗의 동의(rp-comb-agree)·반대(rp-comb-dissent) 색 규칙을 **한
  // 번도 실행하지 않았다** — `if(agree){...}` 가 죽은 가지였다. MSFT 심볼에 드리프트 0.3
  // 을 물려 bull 을 결정적으로 만들고(같은 방식으로 실측: tone [bull,bull,bear,bull,bull]
  // — 동의 4·반대 1, spec-18a.png 실측 배치와 그대로 맞는다), 동의·반대가 **둘 다 실제로
  // 존재하는지**부터 확인한 뒤(0개면 실패 — 죽은 가지를 다시 만들지 않는다) 각각의
  // computed backgroundColor 를 픽셀로 잰다: 동의는 --steel(136,146,166), 반대는 그 칸
  // 자신의 방향색(--bull 79,185,138 또는 --bear 217,106,106).
  { name: "report-comb-bull", seed: { ...ON, ms_preds: PREDS }, go: '"report",{sym:"MSFT"}', delay: 1200,
    assert: "MSApp.current().route === 'report' && !!document.querySelector('[data-screen=\"report\"]') && " +
      "!/불러오지 못했습니다/.test(document.getElementById('app').textContent) && " +
      "(function(){" +
        "var bar=document.querySelector('.rp-comb-bar');" +
        "if(!bar||bar.children.length!==32) return false;" +
        "var steelCells=Array.prototype.slice.call(bar.children).filter(function(c){return c.className.indexOf('is-steel')>=0;});" +
        "if(steelCells.length!==5) return false;" +
        "var agreeSpans=[], dissentSpans=[];" +
        "steelCells.forEach(function(cell){" +
          "Array.prototype.slice.call(cell.children).forEach(function(span){" +
            "if(span.className.indexOf('is-on')<0) return;" +
            "if(span.className.indexOf('rp-comb-agree')>=0) agreeSpans.push(span);" +
            "else if(span.className.indexOf('rp-comb-dissent')>=0) dissentSpans.push(span);" +
          "});" +
        "});" +
        // 죽은 가지 방지(재리뷰 지시 4) — 동의·반대가 둘 다 없으면 아래 단언이 전부
        // vacuous true 로 통과해 이번에 고친 바로 그 문제(실행된 적 없는 픽셀 단언)를
        // 반복한다.
        "if(agreeSpans.length===0||dissentSpans.length===0) return false;" +
        "var agreeOk=agreeSpans.every(function(s){return getComputedStyle(s).backgroundColor.replace(/\\s/g,'')==='rgb(136,146,166)';});" +
        "if(!agreeOk) return false;" +
        "var dissentOk=dissentSpans.every(function(s){" +
          "var bg=getComputedStyle(s).backgroundColor.replace(/\\s/g,'');" +
          "return bg==='rgb(79,185,138)'||bg==='rgb(217,106,106)';" +
        "});" +
        "if(!dissentOk) return false;" +
        "return true;" +
      "})()" },
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
    // P1a Task 3 가 해제 블록을 버튼 하나에서 둘(광고·스쿱)로 늘렸다(설계서 §3.2 항목5) —
    // `.rp-cta` 는 이제 둘 다에 걸리므로 시트를 여는 쪽(스쿱)을 명시해서 클릭한다. 광고
    // 버튼은 MSAds/adConfig 왕복이라 이 잠금 시트 검증과 무관하다.
    click: ".rp-cta-scoop", clickDelay: 1800, delay: 3200,
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
