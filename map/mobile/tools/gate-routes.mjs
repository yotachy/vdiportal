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
  // 콜드오픈 1단계(2026-08-18 재설계 — 실제 시세 구간 + 지표 힌트 + 엔진 판독) 단언 강화.
  // 예전엔 "버튼이 하나라도 있다"만 봤다 — 힌트가 하나도 안 그려졌거나 캔들만 있고 지표
  // 오버레이가 빠져도 통과했을 것이다. 이 클릭은 진짜 브라우저에서 실제 엔진(ForgeCore)이
  // 도는지, 판독·맞힘틀림 갈래가 실제로 그려지는지까지 한 번에 잰다(node 하네스는 가짜 DOM
  // 이라 CSS 캐스케이드·실제 canvas 컨텍스트까지는 못 본다 — 다른 라우트들과 같은 이유).
  { name: "onboarding", seed: {}, go: null,
    assert: "typeof MSOnboarding !== 'undefined' && !!document.querySelector('.ob-step') && " +
      "(function(){" +
        "var tools=document.querySelectorAll('.ob-tool');" +
        "if(tools.length!==3) return false;" +                 // 힌트 3개 — MA·볼린저·거래량
        "for(var i=0;i<tools.length;i++){" +
          "var nm=tools[i].querySelector('.ob-tool-name'), hn=tools[i].querySelector('.ob-tool-hint');" +
          "if(!nm||!nm.textContent||!hn||!hn.textContent) return false;" +
        "}" +
        "if(!document.querySelector('.ob-canvas')) return false;" +
        "var over=document.querySelector('.ob-over');" +
        "if(!over||over.textContent!==MSStr.t.obSampleNote) return false;" +  // "예시 데이터" 표기
        // x축 기준(Task 3) — "일봉인지 주봉인지, 어느 구간인지 모른다"던 원 판정에 대한 답.
        // 찍기 전에도 있어야 한다(캔들만 보고 판단하지 않게).
        "var per=document.querySelector('.ob-period');" +
        "if(!per||per.textContent.indexOf(MSStr.t.rpDaily)<0) return false;" +
        "if(!/\\d{4}\\.\\d{2}/.test(per.textContent)) return false;" +   // 연월이 실제로 박혀 있다
        "var btns=document.querySelectorAll('.ob-guess-btn');" +
        "if(btns.length!==2) return false;" +
        "btns[0].click();" +                                    // 실제로 찍는다 — 엔진이 이 순간 돈다
        "var verdict=document.querySelector('.ob-read-verdict');" +
        "if(!verdict||!verdict.textContent) return false;" +    // 엔진 판독이 실제로 그려졌다
        "var tail=document.querySelector('.ob-tail');" +
        "if(!tail||!tail.textContent) return false;" +          // 맞힘/틀림 갈래 문구
        "var over2=document.querySelector('.ob-over');" +
        "if(!over2||over2.textContent!==MSStr.t.obSampleNote) return false;" + // 찍은 뒤에도 표기 유지
        // 3열 대조(Task 3) — 당신/앱/실제. 셋 다 값이 차 있어야 하고, 앱 열엔 확신 퍼센트가
        // 없어야 한다(5도구는 값 여섯 개뿐이라 확률로 오독된다).
        "var cols=document.querySelectorAll('.ob-col');" +
        "if(cols.length!==3) return false;" +
        "for(var ci=0;ci<cols.length;ci++){ if(!cols[ci].textContent||!cols[ci].textContent.trim()) return false; }" +
        "var appCol=document.querySelector('.ob-col-app');" +
        "if(!appCol||/%/.test(appCol.textContent)) return false;" +
        // "앱은 도구 5개만 보고 이렇게 말했습니다" — 2단계를 벌어들이는 줄.
        "var note=document.querySelector('.ob-app-note');" +
        "if(!note||note.textContent.indexOf('5')<0) return false;" +
        // ── 2단계(Task 4) — 같은 구간, 32개 전부 ──────────────────────────────────
        "var fwd=document.querySelector('.ob-next');" +
        "if(!fwd) return false;" +
        "fwd.click();" +                                          // 1 -> 2
        "var cmpRows=document.querySelectorAll('.ob32-cmp-row');" +
        "if(cmpRows.length!==2) return false;" +                   // 5도구·32도구 판정이 나란히
        "var counts=Array.prototype.slice.call(document.querySelectorAll('.ob32-sec-count'))" +
          ".map(function(e){ return Number(e.textContent); });" +
        "if(counts.length!==4) return false;" +                    // 동의·반대·무판정·자백 네 통
        "var sum=0; for(var si=0;si<counts.length;si++) sum+=counts[si];" +
        "if(sum!==32) return false;" +                             // 네 통의 합이 32
        "var dissentSec=document.querySelector('.ob32-sec-dissent');" +
        "if(!dissentSec) return false;" +
        "if(dissentSec.querySelector('.ob32-expand')) return false;" + // 반대는 접히지 않는다
        "var dCount=Number(dissentSec.querySelector('.ob32-sec-count').textContent);" +
        "if(dissentSec.querySelectorAll('.ob32-row').length!==dCount) return false;" + // 전부 그려진다
        "if(!document.querySelector('.ob32-sec-refused')) return false;" + // 자백 통이 이름을 달고 노출된다(리뷰 Important)
        "var vnote=document.querySelector('.ob32-verdict-note');" +
        "if(!vnote||!vnote.textContent) return false;" +           // 같음/다름 어느 쪽이든 문구가 있다
        // 리뷰 Minor — 조건부 if 로 감싸 조용히 건너뛰지 않는다. 이 표본(고정 seed)은
        // 동의가 항상 있다는 것을 먼저 단정하고, 그 뒤 무조건 행 모양을 검사한다.
        "var agreeRows=document.querySelectorAll('.ob32-sec-agree .ob32-row');" +
        "if(!agreeRows.length) return false;" +                    // 동의가 있어야 하는 표본인데 없다
        "var r0=agreeRows[0];" +
        "if(!r0.querySelector('.ob32-name')||!r0.querySelector('.ob32-text')) return false;" +
        // ── 3단계(Task 5) — 성향을 고르면 같은 구간의 판정·근거가 실제로 갱신된다 ──────
        // fwd 는 1단계 시점에 잡은 참조라 다시 쓰지 않는다 — draw() 가 매번 rootEl.innerHTML
        // 을 비우고 새 버튼을 만들므로 안전하게 다시 querySelector 한다.
        "var fwd2=document.querySelector('.ob-next');" +
        "if(!fwd2) return false;" +
        "fwd2.click();" +                                          // 2 -> 3
        "var over3=document.querySelector('.ob-over');" +
        "if(!over3||over3.textContent!==MSStr.t.obPastDone) return false;" + // "여기까지는 과거였습니다"
        "var styleBtns=document.querySelectorAll('.ob-style');" +
        "if(styleBtns.length!==4) return false;" +                 // 성향 4종
        "var onBefore=Array.prototype.slice.call(styleBtns).filter(function(b){return b.className.indexOf('is-on')>=0;});" +
        "if(onBefore.length!==1) return false;" +                  // 언제나 정확히 1개 선택(단언 1)
        // 판정·근거 서명 — 네 통 개수(순서 고정) + 성향 기준 판정어. 문자열 전체 비교가
        // 아니라 "무엇이 달라졌는가"를 구체적으로 잰다(브리프 경고).
        "function sig3(){" +
          "var counts=Array.prototype.slice.call(document.querySelectorAll('.ob32-sec-count')).map(function(e){return e.textContent;});" +
          "var rows=document.querySelectorAll('.ob32-cmp-row');" +
          "var v=rows[1]?rows[1].querySelector('.ob32-cmp-v').textContent:'';" +
          "return counts.join(',')+'|'+v;" +
        "}" +
        "if(document.querySelectorAll('.ob32-cmp-row').length!==2) return false;" +
        "var note3=document.querySelector('.ob32-verdict-note');" +
        "if(!note3||!note3.textContent) return false;" +
        // 기본 선택(trend)은 실측상 32도구와 같은 결론(bull)이다 — 이 화면의 주 경로가
        // 초라하지 않은지: is-same 이고 정직 문구가 실제로 있다(단언 4).
        "if(note3.className.indexOf('is-same')<0) return false;" +
        "if(note3.textContent!==MSStr.t.ob3SameNote) return false;" +
        "var sigTrend=sig3();" +
        // momentum 카드를 이름으로 찾아 클릭 — 이 표본에서 momentum 만 regime 이 bull→neutral
        // 로 실제로 갈린다(Task 1 실측). PRESETS 순서에 기대지 않는다.
        "var Tiers=MSIndTiers;" +
        "var momentum=null;" +
        "for(var pi=0;pi<Tiers.PRESETS.length;pi++){ if(Tiers.PRESETS[pi].key==='momentum'){ momentum=Tiers.PRESETS[pi]; break; } }" +
        "if(!momentum) return false;" +
        "var momBtn=null;" +
        "for(var bi=0;bi<styleBtns.length;bi++){" +
          "var nm=styleBtns[bi].querySelector('.ob-style-name');" +
          "if(nm&&nm.textContent===momentum.name){ momBtn=styleBtns[bi]; break; }" +
        "}" +
        "if(!momBtn) return false;" +
        "momBtn.click();" +                                        // 고른다 — 갱신 1회차(단언 2·3)
        // draw() 가 클릭마다 rootEl.innerHTML 을 비우고 새 버튼을 만든다 — momBtn 은 이제
        // detached 다(클릭 자체는 살아있는 리스너라 여전히 통했지만, className 조회는 새로
        // 그려진 노드를 다시 querySelector 해야 한다). 이후로도 클릭할 때마다 이렇게 다시 잰다.
        "var stylesAfterMom=document.querySelectorAll('.ob-style');" +
        "var onAfterMom=Array.prototype.slice.call(stylesAfterMom).filter(function(b){return b.className.indexOf('is-on')>=0;});" +
        "if(onAfterMom.length!==1) return false;" +
        "if(onAfterMom[0].querySelector('.ob-style-name').textContent!==momentum.name) return false;" + // 선택 표시가 실제로 옮겨간다
        "var sigMom=sig3();" +
        "if(sigMom===sigTrend) return false;" +                     // 판정+근거가 그대로면 죽은 컨트롤
        "var noteMom=document.querySelector('.ob32-verdict-note');" +
        "if(!noteMom||noteMom.className.indexOf('is-diff')<0) return false;" + // 판정 자체가 바뀐다
        "if(noteMom.textContent.indexOf(MSStr.t.rpBullish)<0||noteMom.textContent.indexOf(MSStr.t.rpFlat)<0) return false;" +
        // trend 로 되돌린다 — 갱신 2회차(단언 3), 처음과 같은 서명으로 돌아와야 한다. 방금
        // 다시 잰 stylesAfterMom(현재 DOM)에서 찾는다 — 위 staleness 주의와 같은 이유.
        "var trend=null;" +
        "for(var pj=0;pj<Tiers.PRESETS.length;pj++){ if(Tiers.PRESETS[pj].key==='trend'){ trend=Tiers.PRESETS[pj]; break; } }" +
        "if(!trend) return false;" +
        "var trendBtn=null;" +
        "for(var bj=0;bj<stylesAfterMom.length;bj++){" +
          "var nm2=stylesAfterMom[bj].querySelector('.ob-style-name');" +
          "if(nm2&&nm2.textContent===trend.name){ trendBtn=stylesAfterMom[bj]; break; }" +
        "}" +
        "if(!trendBtn) return false;" +
        "trendBtn.click();" +
        "var sigBack=sig3();" +
        "if(sigBack!==sigTrend) return false;" +                    // 되돌리니 처음과 같다(계산이 안정적)
        "var stylesAfterBack=document.querySelectorAll('.ob-style');" +
        "var onAfterBack=Array.prototype.slice.call(stylesAfterBack).filter(function(b){return b.className.indexOf('is-on')>=0;});" +
        "if(onAfterBack.length!==1||onAfterBack[0].querySelector('.ob-style-name').textContent!==trend.name) return false;" +
        "var noteBack=document.querySelector('.ob32-verdict-note');" +
        "if(!noteBack||noteBack.className.indexOf('is-same')<0) return false;" +
        "return true;" +
      "})()" },
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
        "if(!unlock) return false;" +                                     // 해제 블록 자체는 항상 있다(직전 사고 재발 방지)
        "var ad=unlock.querySelector('.rp-cta-ad'), scoop=unlock.querySelector('.rp-cta-scoop');" +
        // [리뷰 C1, 2026-08-18] 오늘은 report-blocks.js 의 PENDING(sentence·forecast·hitrate·
        // compare) 때문에 tierBuyable('full')·tierBuyable('custom') 이 둘 다 false 다 —
        // buildCta() 가 그 상태에서 광고·스쿱 버튼을 아예 안 그린다(살 수 없는 것을 파는
        // 거짓 문구를 없앤 것이 이번 수정이다). 그래서 오늘의 정답은 "둘 다 없다"이고,
        // 이 단언은 실제로 오늘 실행돼 통과한다 — 이전엔 여기서 존재+순서를 무조건
        // 요구해 거짓 문구를 관문이 고정하고 있었다.
        "if(ad||scoop) return false;" +
        // P1b 가 PENDING 을 비워 buyable 이 true 로 바뀌면 위 줄이 실패로 돌아선다 — 그때
        // 아래 순서 단언(광고가 스쿱보다 먼저, 옛 코드)을 이 자리에 되살릴 것:
        //   if (!ad || !scoop) return false;
        //   var kids = Array.prototype.slice.call(unlock.children);
        //   if (kids.indexOf(ad) > kids.indexOf(scoop)) return false;   // 광고가 스쿱보다 먼저(DOM 순서)
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
  // full·custom 을 둘 다 못 팔게 잠가서(tier-sheet.js locked) 분석 화면 자체를 열 수 없다.
  //
  // 최종 리뷰 수정(C1, 2026-08-18) — 이 라우트는 원래 `.rp-cta-scoop` 를 **클릭해** 잠긴
  // 시트를 열고 그 안의 자물쇠·문구를 쟀다. 그런데 buildCta() 가 buyable 여부와 무관하게
  // 항상 광고·스쿱 버튼을 그리고 있었던 것 자체가 이번에 잡힌 결함이다(살 수 없는 것을
  // 판다) — 그 버튼을 클릭해 여는 시트를 검증하는 라우트가 결함을 정상 동작인 양 고정하고
  // 있었던 셈이다. buildCta() 는 이제 tierBuyable('full')·tierBuyable('custom') 이 둘 다
  // false 면 광고·스쿱 버튼을 아예 안 그리므로(report.js buildCta·strings.js rpUnlockSoon),
  // `.rp-cta-scoop` 자체가 더는 존재하지 않는다 — 클릭할 게 없다. 그래서 이 라우트가 재는
  // 것은 "잠긴 시트가 정직한가"가 아니라 "잠긴 CTA 가 정직한가"(광고=주의력·스쿱 어느
  // 화폐로도 살 수 없는 것을 안 판다)로 바뀐다. 시트 내부(picked===null, 다음 행동 버튼)는
  // tier-sheet.test.mjs 가 노드에서 잰다 — 이 상태는 지금 이 CTA 게이팅과 항상 같이 움직여
  // (buildCta 와 buildComb 모두 같은 tierBuyable 을 본다) 실제 UI 로는 열리지 않는다.
  // PENDING 이 비면(P1b 완료) CTA 가 다시 버튼을 그리므로, 이 라우트도 그때 click+시트
  // 검증 형태로 되돌려야 한다 — report-blocks.test.mjs 의 "PENDING 이 비어있지 않은 티어가
  // 실제로 있다" 단언이 그 시점을 알려준다. 옛 시트 검증 단언(참고용, 되돌릴 때 쓸 것):
  //   var full=document.querySelector('.sheet-tier.tier-full');
  //   var custom=document.querySelector('.sheet-tier.tier-custom');
  //   if(!full||!custom) return false;
  //   if(!full.classList.contains('is-locked')||!custom.classList.contains('is-locked')) return false;
  //   if(!full.querySelector('.sheet-tier-locked svg')||!custom.querySelector('.sheet-tier-locked svg')) return false;
  //   if(full.querySelector('.sheet-tier-price')||custom.querySelector('.sheet-tier-price')) return false;
  //   var run=document.querySelector('.sheet-run');
  //   if(!run||!run.disabled) return false;
  { name: "report-locked-tiers", seed: { ...ON, ms_preds: PREDS }, go: '"report",{sym:"AAPL"}', delay: 1400,
    assert: "MSApp.current().route === 'report' && !!document.querySelector('[data-screen=\"report\"]') && " +
      "(function(){" +
        "var unlock=document.querySelector('.rp-unlock');" +
        "if(!unlock) return false;" +
        "if(unlock.querySelector('.rp-cta-ad')||unlock.querySelector('.rp-cta-scoop')) return false;" +  // 어느 화폐로도 안 판다
        "if(unlock.textContent.indexOf(MSStr.t.rpUnlockSoon)<0) return false;" +   // 정직한 문구로 대체됐다
        "var note=document.querySelector('.rp-comb-note');" +
        "if(!note) return false;" +
        "if(note.textContent.indexOf(MSStr.t.rpCombNoteAd)>=0) return false;" +    // "광고 1편으로 전부 열림" 약속을 안 단다
        "return true;" +
      "})()" },
  { name: "record", seed: { ...ON, ms_preds: PREDS }, go: '"record"',
    assert: "MSApp.current().route === 'record' && !!document.querySelector('[data-screen=\"record\"]')" },
  { name: "result", seed: { ...ON, ms_preds: PREDS }, go: '"result",{sym:"TSLA",asOf:"2026-08-14"}',
    assert: "MSApp.current().route === 'result' && !!document.querySelector('[data-screen=\"result\"]')" }
];
