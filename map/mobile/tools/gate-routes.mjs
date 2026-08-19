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
        // 10번째 역할(num) 회귀 잠금 — .ob-col .obq-value 는 font-size 만 --fs-body 로
        // 덮이고(칼럼 폭에 맞춰 줄바꿈, style-onboarding.css:137) font-weight·letter-spacing
        // 은 기저 .obq-value 규칙(--fw-num/--ls-num)을 그대로 물려받는다. --fw-num/--ls-num
        // 이 :root 에 정의 없이 참조만 되던 사고(리뷰 I1)가 재발하면 여기서 상속값(400/거의 0)
        // 으로 조용히 무너진다 — node 시험(style-tokens.test.mjs)은 정의 유무만 보고 실제
        // 캐스케이드가 먹는지는 못 보므로 이 브라우저 관문이 더 강하다.
        "function numTokenOk(el){" +
          "var cs=getComputedStyle(el);" +
          "var rootCS=getComputedStyle(document.documentElement);" +
          "var wantFW=parseInt(rootCS.getPropertyValue('--fw-figure'),10);" +
          "var wantLSem=parseFloat(rootCS.getPropertyValue('--ls-figure'));" +
          "var fw=parseInt(cs.fontWeight,10)||0;" +
          "if(fw<wantFW) return false;" +
          "var wantLSpx=wantLSem*parseFloat(cs.fontSize);" +
          "var ls=parseFloat(cs.letterSpacing)||0;" +
          "return Math.abs(ls-wantLSpx)<=0.5;" +
        "}" +
        "var colVal=document.querySelector('.ob-col .obq-value');" +
        "if(!colVal||!numTokenOk(colVal)) return false;" +
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
        // 리뷰 C1 — 2→3 다리(설계서가 지정한 세 다리 중 유일하게 비어 있던 자리). 2단계
        // 본문 끝에서 3단계(성향)를 벌어들이는 줄이 실제로 그려졌는지 잰다.
        "var bridge2=document.querySelector('.ob-note');" +
        "if(!bridge2||bridge2.textContent!==MSStr.t.obStyleBridgeNote) return false;" +
        // ── 3단계(Task 5) — 성향을 고르면 같은 구간의 판정·근거가 실제로 갱신된다 ──────
        // fwd 는 1단계 시점에 잡은 참조라 다시 쓰지 않는다 — draw() 가 매번 rootEl.innerHTML
        // 을 비우고 새 버튼을 만들므로 안전하게 다시 querySelector 한다.
        "var fwd2=document.querySelector('.ob-next');" +
        "if(!fwd2) return false;" +
        "fwd2.click();" +                                          // 2 -> 3
        // 리뷰 C1 — obPastDone("여기까지는 과거였습니다")은 이제 3단계를 **닫는** 줄이다.
        // 화면 맨 위(옛 자리)는 obStyleOpen 이 연다 — 아직 과거 구간 한복판에서 "과거
        // 였습니다"가 울리던 사고를 여기서 잠근다.
        "var over3=document.querySelector('.ob-over');" +
        "if(!over3||over3.textContent!==MSStr.t.obStyleOpen) return false;" +
        // 리뷰 B(1/5) — 판정이 달라질 수도 있다는 유인이 실제 렌더된 부제에 있어야 한다.
        "var sub3=document.querySelector('.ob-sub');" +
        "if(!sub3||sub3.textContent.indexOf('달라질 수도 있습니다')<0) return false;" +
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
        // 리뷰 C(1/5) — is-diff 가 is-same 보다 약하게 강조되면 안 된다. 실제 계산된 스타일을
        // 잰다(source 레벨 검사는 node 시험이 이미 한다 — 여기는 CSS 캐스케이드가 실제로
        // 먹히는지를 실 브라우저에서 재는 것).
        "var sameStyle=getComputedStyle(note3);" +
        "var sameColor=sameStyle.color, sameWeight=parseInt(sameStyle.fontWeight,10)||400;" +
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
        // 리뷰 C(1/5) — is-diff(momentum)가 is-same(trend)보다 최소한 같은 만큼, 실제로는
        // 더 밝고 굵어야 한다.
        "var diffStyle=getComputedStyle(noteMom);" +
        "var diffColor=diffStyle.color, diffWeight=parseInt(diffStyle.fontWeight,10)||400;" +
        "if(diffColor===sameColor) return false;" +                // 색이 그대로면 강조가 안 바뀐 것
        "if(diffWeight<sameWeight) return false;" +                 // 최소한 더 가늘어지지는 않는다
        "if(diffWeight<600) return false;" +                        // --fw-semibold(600) 이상이어야 한다
        // 리뷰 A(1/5) — momentum(neutral)은 voiced 전부가 무판정으로 간다. 개별 지표는
        // 뚜렷한 방향(Stochastic)을 말하는데 왜 무판정인지 설명이 붙어 있어야 하고, 그
        // 행에는 이름·판독 문장·기여도 숫자가 실제로 살아 있어야 한다(관문이 실제 브라우저
        // 에서 "momentum 화면이 텅 비지 않는다"를 확인한다).
        "var flatSec=document.querySelector('.ob32-sec-flat');" +
        "if(!flatSec) return false;" +
        "var explain=null;" +
        "var stepKids=Array.prototype.slice.call(flatSec.parentNode.children);" +
        "for(var ek=0;ek<stepKids.length;ek++){ if(stepKids[ek].className==='ob-note'){ explain=stepKids[ek]; break; } }" +
        "if(!explain||explain.textContent!==MSStr.t.ob3FlatNeutralNote) return false;" +
        "var flatRows=flatSec.querySelectorAll('.ob32-row');" +
        "if(!flatRows.length) return false;" +
        "var stochRow=null;" +
        "for(var fr=0;fr<flatRows.length;fr++){ if(flatRows[fr].querySelector('.ob32-name').textContent===MSStr.ind('stochastic')){ stochRow=flatRows[fr]; break; } }" +
        "if(!stochRow) return false;" +                             // Stochastic 은 이 표본에서 −0.62(뚜렷한 방향)다
        "if(!stochRow.querySelector('.ob32-text')||!stochRow.querySelector('.ob32-text').textContent) return false;" +
        "if(!stochRow.querySelector('.ob32-bias')||!/^[+-]\\d/.test(stochRow.querySelector('.ob32-bias').textContent)) return false;" +
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
        // 리뷰 C1 — obPastDone 이 3단계 본문의 실제 끝에 그려졌는지(옛 자리인 화면 맨
        // 위가 아니라). 고유 클래스(.ob-past-done)로 잡는다 — momentum 을 거쳐 갔던
        // 경로라 ob3FlatNeutralNote(같은 .ob-note) 도 DOM 에 남아 있을 수 있다.
        "var closing3=document.querySelector('.ob-past-done');" +
        "if(!closing3||closing3.textContent!==MSStr.t.obPastDone) return false;" +
        // ── 4단계(Task 6) — 동의. "지금부터 미래" 전환 + 하지 않는 것 셋 + 체크 게이트 ──────
        "var fwd3=document.querySelector('.ob-next');" +
        "if(!fwd3) return false;" +
        "fwd3.click();" +                                          // 3 -> 4
        "var over4=document.querySelector('.ob-over');" +
        "if(!over4||!over4.textContent||over4.textContent===MSStr.t.obPastDone) return false;" + // 3단계 문구를 안 반복한다
        "if(over4.textContent!==MSStr.t.obFutureOver) return false;" +
        "var h4=document.querySelector('.ob-h');" +
        "if(!h4||!h4.textContent) return false;" +
        // Q4 — 4단계엔 뒤로가기가 없다(node 시험이 이미 재지만, 실 브라우저에서도 확인한다).
        "if(document.querySelector('.ob-back')) return false;" +
        "var items4=document.querySelectorAll('.ob-consent-item');" +
        "if(items4.length!==3) return false;" +                     // 하지 않는 것 셋
        "for(var ci4=0;ci4<items4.length;ci4++){ if(!items4[ci4].textContent) return false; }" +
        "var fwd4=document.querySelector('.ob-next');" +
        "if(!fwd4||fwd4.disabled!==true) return false;" +           // 체크 전엔 막혀 있다
        "var agree=document.querySelector('.ob-agree');" +
        "if(!agree) return false;" +
        "agree.click();" +                                          // 동의 체크
        "if(document.querySelector('.ob-next').disabled!==false) return false;" + // 체크하면 열린다
        // ── 5단계(Task 6) — 종목 선택 · 분석 시작. 선택과 실행이 분리돼 있는지 ────────────
        "var fwd5=document.querySelector('.ob-next');" +
        "fwd5.click();" +                                          // 4 -> 5
        "if(document.querySelector('.ob-back')) return false;" +   // Q4 — 5단계도 뒤로가기 없음
        "var chip=document.querySelector('.tp-chip');" +
        "if(!chip) return false;" +
        "chip.click();" +                                           // 종목을 고른다 — 선택만
        "if(document.querySelector('.ob-next').disabled!==true) return false;" + // 고르기만으론 안 열린다(옛 버그의 반증)
        "var startBtn=document.querySelector('.ob-pick-start');" +
        "if(!startBtn||startBtn.disabled!==false) return false;" +
        "startBtn.click();" +                                       // [분석 시작] — 실행은 여기서만 시작된다
        "if(document.querySelector('.ob-next').disabled!==true) return false;" + // 클릭 직후(비동기 확인 전)엔 아직 안 열려 있다
        "return true;" +
      "})()" },
  // 6단계(Task 7, 실제 분석) — 위 "onboarding" 라우트는 5단계에서 [분석 시작] 직후(비동기
  // 확인 전) 멈춘다. 이 라우트는 그 너머로 걸어간다.
  //
  // **정정(Task 8 실측, 두 번째)** — 처음엔 route.scripts 를 여러 시각에 예약해 걸음을
  // 나눴고("virtual-time-budget 이 결정적이다"), 그 다음엔 폴링으로 바꿨다("재생이 끝날
  // 때까지 100ms 마다 확인"). 둘 다 근본 해결이 아니었다: MSAnalyzeView.play() 의 재생은
  // requestAnimationFrame 으로 페이싱되는데, 헤드리스 크로미움에서 이 rAF 가 실 벽시계
  // 속도로만 도는 것을 실측했다(같은 폴링 조건에서 완료까지 걸리는 실제 시간이 실행마다
  // 수백 ms~20 초 이상으로 들쭉날쭉했다 — 이 기계의 프레임 페이싱 자체가 결정적이지 않다).
  // 그래서 **재생을 기다리지 않는다.** progress-analyze.js 는 이미 "건너뛰기" 경로를
  // 갖고 있다 — `.an-scrim` 클릭이 `st.drain()`(남은 지표를 그 자리에서 동기로 마저 읽음)
  // + `finish()`(onDone 동기 호출)를 그대로 태운다(위 scrim.addEventListener 참고, UX 상
  // "탭하면 즉시 끝난다"는 그 기능을 관문이 그대로 빌려 쓰는 것). 5→6 클릭 직후 scrim 이
  // DOM 에 이미 붙어 있으므로(play() 가 동기로 appendChild 한다) 곧바로 클릭하면 재생
  // 전체가 **한 tick 안에 동기로** 끝난다 — rAF 도 virtual-time 도 관여하지 않는다.
  { name: "onboarding-analysis", seed: {}, go: null,
    scripts: [
      { at: 300, code:
        "document.querySelector('.ob-guess-btn').click();" +
        "document.querySelector('.ob-next').click();" +               // 1 -> 2
        "document.querySelector('.ob-next').click();" +               // 2 -> 3
        "document.querySelector('.ob-next').click();" +               // 3 -> 4
        "document.querySelector('.ob-agree').click();" +
        "document.querySelector('.ob-next').click();" +               // 4 -> 5
        "document.querySelector('.tp-chip').click();" +               // 종목 하나 고른다(첫 칩)
        "document.querySelector('.ob-pick-start').click();" +         // [분석 시작] — fetch 가 여기서 돈다
        // [분석 시작] 이후(비동기 fetch)만 폴링으로 기다린다(이건 진짜 네트워크 왕복이라
        // 실제로 비동기다). 열리면 5 -> 6 클릭 직후 바로 스냅샷을 찍고(단언 6 — 즉시 끝나는
        // 연출이 아니라는 증거), 곧바로 `.an-scrim` 을 클릭해 재생을 동기로 드레인한다.
        "var t1=0;" +
        "var iv1=setInterval(function(){" +
          "t1++;" +
          "var n=document.querySelector('.ob-next');" +
          "if(n&&!n.disabled){" +
            "clearInterval(iv1); n.click();" +                        // 5 -> 6, 재생이 이 클릭으로 켜진다
            "var n1=document.querySelector('.ob-next');" +
            "window.__ob6DisabledRightAfterClick = n1 ? n1.disabled : null;" +
            "var scrim=document.querySelector('.an-scrim');" +
            "if(scrim) scrim.click();" +                               // 드레인 — 남은 지표를 동기로 마저 읽고 즉시 끝낸다
            "window.__ob6Ready=true;" +
          "} else if(t1>150){ clearInterval(iv1); console.error('GATE_TIMEOUT_STEP5'); }" +
        "},100);" } ],
    delay: 3000,
    assert: "typeof MSOnboarding !== 'undefined' && !!document.querySelector('.ob-step') && " +
      "(function(){" +
        "if(window.__ob6DisabledRightAfterClick !== true) return false;" +   // 클릭 직후엔 아직 안 열려 있었다(즉시 끝나는 연출이 아니다)
        "if(!window.__ob6Ready) return false;" +                             // 5 -> 6 전환까지는 실제로 도달했다
        "if(document.querySelector('.ob-back')) return false;" +             // Q4 — 6단계도 뒤로가기 없음
        "if(document.querySelector('.an-scrim')) return false;" +           // 재생 오버레이가 끝나 스스로 닫혔다
        "var next=document.querySelector('.ob-next');" +
        "if(!next || next.disabled !== false) return false;" +               // 재생이 끝나 이제 열려 있다(단언 6)
        // 단언 1 — 오늘 종가가 세 지평보다 DOM 순서상 먼저다.
        "var step=document.querySelector('.ob-step');" +
        "var kids=Array.prototype.slice.call(step.children);" +
        "var todayIdx=-1, hzIdx=-1;" +
        "for(var i=0;i<kids.length;i++){" +
          "if(kids[i].className.indexOf('ob6-today')>=0 && todayIdx<0) todayIdx=i;" +
          "if(kids[i].className.indexOf('ob6-hz')>=0 && hzIdx<0) hzIdx=i;" +
        "}" +
        "if(todayIdx<0||hzIdx<0||todayIdx>=hzIdx) return false;" +
        "var today=kids[todayIdx];" +
        "var tv=today.querySelector('.obq-value'), ta=today.querySelector('.obq-asof');" +
        "if(!tv||!/\\d/.test(tv.textContent)) return false;" +               // 오늘 종가에 숫자가 있다
        "if(!ta||!ta.textContent.trim()) return false;" +                    // 기준 시각이 값과 같은 자리에 있다
        // 10번째 역할(num) 회귀 잠금 — .ob6-today .obq-value 는 font-size 만 --fs-display 로
        // 덮이고(style-onboarding.css:220) font-weight·letter-spacing 은 기저 .obq-value
        // 규칙(--fw-num/--ls-num)을 물려받는다. 정의 없이 참조만 되던 사고(리뷰 I1)가
        // 재발하면 상속값(400/거의 0)으로 조용히 무너진다.
        "function numTokenOk(el){" +
          "var cs=getComputedStyle(el);" +
          "var rootCS=getComputedStyle(document.documentElement);" +
          "var wantFW=parseInt(rootCS.getPropertyValue('--fw-figure'),10);" +
          "var wantLSem=parseFloat(rootCS.getPropertyValue('--ls-figure'));" +
          "var fw=parseInt(cs.fontWeight,10)||0;" +
          "if(fw<wantFW) return false;" +
          "var wantLSpx=wantLSem*parseFloat(cs.fontSize);" +
          "var ls=parseFloat(cs.letterSpacing)||0;" +
          "return Math.abs(ls-wantLSpx)<=0.5;" +
        "}" +
        "if(!numTokenOk(tv)) return false;" +
        // 단언 2·3 — 세 지평(내일·1주·1개월) 각각 중심값 ± 오차 + 해석.
        "var stats=document.querySelectorAll('.ob6-hz .obq-stat');" +
        "if(stats.length!==3) return false;" +
        "var labels=[MSStr.t.rpHzTomorrow, MSStr.t.rpHzWeek, MSStr.t.rpHzMonth];" +
        "for(var si=0;si<3;si++){" +
          "var s=stats[si];" +
          "var lab=s.querySelector('.obq-label');" +
          "if(!lab||lab.textContent!==labels[si]) return false;" +
          "var val=s.querySelector('.obq-value');" +
          "if(!val||!/\\d/.test(val.textContent)) return false;" +
          "if(!numTokenOk(val)) return false;" +           // .ob6-hz .obq-value — 같은 num 회귀 잠금(위 today 주석 참고)
          "var unit=s.querySelector('.obq-unit');" +
          "if(!unit||unit.textContent.indexOf('±')<0) return false;" +   // ± 오차 표기
          "var meaning=s.querySelector('.obq-meaning');" +
          "if(!meaning||!meaning.textContent.trim()) return false;" +        // 값만 던지지 않는다(Q5)
        "}" +
        // 단언 4 — 근거가 2단계와 같은 형식(동의·반대·무판정·자백 네 통, 합이 32).
        "var counts=Array.prototype.slice.call(document.querySelectorAll('.ob32-sec-count'))" +
          ".map(function(e){ return Number(e.textContent); });" +
        "if(counts.length!==4) return false;" +
        "var sum=0; for(var ci=0;ci<counts.length;ci++) sum+=counts[ci];" +
        "if(sum!==32) return false;" +
        "if(!document.querySelector('.ob32-sec-dissent')) return false;" +
        "return true;" +
      "})()" },
  // 7단계(Task 8, 완료·가격표·지급) — 위 onboarding-analysis 라우트를 한 걸음 더 걷는다.
  // **재생을 기다리지 않는다**(위 onboarding-analysis 헤더 주석의 실측 근거를 그대로 문다).
  // [분석 시작] 이후(진짜 비동기 fetch)만 폴링으로 기다리고, 5→6 클릭 직후 `.an-scrim` 을
  // 곧바로 클릭해 재생을 동기로 드레인한다 — rAF 페이싱을 기다릴 필요 자체가 없어진다.
  { name: "onboarding-final", seed: {}, go: null,
    scripts: [
      { at: 300, code:
        "document.querySelector('.ob-guess-btn').click();" +
        "document.querySelector('.ob-next').click();" +               // 1 -> 2
        "document.querySelector('.ob-next').click();" +               // 2 -> 3
        "document.querySelector('.ob-next').click();" +               // 3 -> 4
        "document.querySelector('.ob-agree').click();" +
        "document.querySelector('.ob-next').click();" +               // 4 -> 5
        "document.querySelector('.tp-chip').click();" +               // 종목 하나 고른다(첫 칩)
        "document.querySelector('.ob-pick-start').click();" +         // [분석 시작] — fetch 시작
        "var t1=0;" +
        "var iv1=setInterval(function(){" +
          "t1++;" +
          "var n=document.querySelector('.ob-next');" +
          "if(n&&!n.disabled){" +                                     // 5 -> 6 이 열렸다(fetch 완료)
            "clearInterval(iv1); n.click();" +                        // 재생이 이 클릭으로 켜진다
            "var scrim=document.querySelector('.an-scrim');" +
            "if(scrim) scrim.click();" +                               // 드레인 — 재생을 동기로 즉시 끝낸다
            "var n2=document.querySelector('.ob-next');" +
            "if(n2&&!n2.disabled) n2.click();" +                       // 6 -> 7
            "else console.error('GATE_NOT_READY_STEP6');" +
          "} else if(t1>150){ clearInterval(iv1); console.error('GATE_TIMEOUT_STEP5'); }" +
        "},100);" }
    ],
    delay: 3000,
    assert: "typeof MSOnboarding !== 'undefined' && !!document.querySelector('.ob-step') && " +
      "(function(){" +
        "if(document.querySelector('.ob-back')) return false;" +   // Q4 — 7단계도 뒤로가기 없음
        "var step=document.querySelector('.ob-step');" +
        "var kids=Array.prototype.slice.call(step.children);" +
        "var recap=document.querySelector('.ob-recap');" +
        "var pricing=document.querySelector('.ob-pricing');" +
        "var grant=document.querySelector('.ob-grant');" +
        "if(!recap||!pricing||!grant) return false;" +
        "var ri=kids.indexOf(recap), pi=kids.indexOf(pricing), gi=kids.indexOf(grant);" +
        // 단언 1·2 — recap(방금 받은 것) → 가격표 → 지급, 이 순서로 DOM 에 있다.
        "if(ri<0||pi<0||gi<0||!(ri<pi&&pi<gi)) return false;" +
        // 단언 1 — recap 세 항목이 도구 32 · 지평 3 · 근거(숫자)를 실제 값으로 담는다.
        "var rows=Array.prototype.slice.call(document.querySelectorAll('.ob-recap-row'));" +
        "if(rows.length!==3) return false;" +
        "var nums=rows.map(function(r){ return r.querySelector('.ob-recap-num').textContent; });" +
        "if(nums[0]!=='32') return false;" +
        "if(nums[1]!=='3') return false;" +
        "if(!/^\\d+$/.test(nums[2])) return false;" +
        // 10번째 역할(num) 회귀 잠금 — .ob-recap-num 은 --fs-num/--fw-num/--ls-num 을 직접
        // 쓴다(style-onboarding.css:233). 이 세 토큰이 :root 정의 없이 참조만 되던 사고
        // (리뷰 I1)에서 실측된 무너진 값은 16px/400/본문 상속(-0.16px)이었다 — node 시험
        // 123건은 그 상태에서 전부 초록이었다(정의 유무만 보고 실제 렌더는 안 봐서). 여기서
        // 본문(--fs-body)보다 크고 볼드인지, 굵기·자간이 별칭 대상(--fw-figure/--ls-figure)
        // 그대로 먹는지를 실 브라우저 계산값으로 잰다. 조건부 if 로 감싸지 않는다 — 요소가
        // 없거나 값이 안 먹으면 그 자체로 실패다.
        "var recapNum=document.querySelector('.ob-recap-num');" +
        "if(!recapNum) return false;" +
        "var rnCS=getComputedStyle(recapNum);" +
        "var rootCS2=getComputedStyle(document.documentElement);" +
        "var bodyFsPx=parseFloat(rootCS2.getPropertyValue('--fs-body'));" +
        "if(!(parseFloat(rnCS.fontSize)>bodyFsPx)) return false;" +           // 본문 크기보다 크다
        "var wantFW2=parseInt(rootCS2.getPropertyValue('--fw-figure'),10);" +
        "if((parseInt(rnCS.fontWeight,10)||0)<wantFW2) return false;" +      // 볼드(--fw-num 별칭)
        "var wantLSpx2=parseFloat(rootCS2.getPropertyValue('--ls-figure'))*parseFloat(rnCS.fontSize);" +
        "if(Math.abs((parseFloat(rnCS.letterSpacing)||0)-wantLSpx2)>0.5) return false;" + // --ls-num 별칭

        "for(var ri2=0;ri2<rows.length;ri2++){" +
          "var det=rows[ri2].querySelector('.ob-recap-detail');" +
          "if(!det||!det.textContent.trim()) return false;" +   // 값만 던지지 않는다(Q5 와 같은 원칙)
        "}" +
        // 단언 3 — 온보딩 체험이 상시 무료로 안 읽힌다: '온보딩 한정 무료' 고지가
        // '기본은 계속 무료' 안내보다 먼저 온다(불리한 사실 먼저).
        "var warns=Array.prototype.slice.call(pricing.querySelectorAll('.ob-warn'));" +
        "var notAlways=null;" +
        "for(var wi=0;wi<warns.length;wi++){ if(warns[wi].textContent===MSStr.t.obDoneOnboardFree){ notAlways=warns[wi]; break; } }" +
        "if(!notAlways) return false;" +
        "var notes=Array.prototype.slice.call(pricing.querySelectorAll('.ob-cost-note'));" +
        "var freeNote=null;" +
        "for(var ni=0;ni<notes.length;ni++){ if(notes[ni].textContent===MSStr.t.obDoneFree){ freeNote=notes[ni]; break; } }" +
        "if(!freeNote) return false;" +
        "var pkids=Array.prototype.slice.call(pricing.children);" +
        "if(pkids.indexOf(notAlways)>=pkids.indexOf(freeNote)) return false;" +
        // 가격표 — MSWallet.COSTS(심화 3·전문 5, 고정 클라이언트 상수)를 그대로 반영한다.
        "var costRows=document.querySelectorAll('.ob-costs .ob-cost-row');" +
        "if(costRows.length!==2) return false;" +
        // 단언 4(양성 경로) — 로컬 mock 지갑이 실제로 응답해 서버 확정 값이 지급으로 뜬다.
        // 확정 전 상태(obGranting)는 test/onboarding.test.mjs 의 지연 지갑 시험이 이미 잰다 —
        // 여기는 실제 네트워크 왕복이 끝난 뒤의 결과를 실 브라우저로 확인한다.
        "if(grant.textContent.indexOf(MSStr.t.obGranted)<0) return false;" +
        "if(!/^\\d+/.test(grant.textContent)) return false;" +
        "return true;" +
      "})()" },
  // 리뷰 I2(Task 8 라운드 1/5) — 위 두 라우트(onboarding-analysis·onboarding-final)는 재생을
  // `.an-scrim` 드레인으로 **건너뛴다**(결정성을 위해, 위 onboarding-analysis 헤더 주석 참고).
  // 그런데 그 드레인이 5→6 클릭과 **같은 동기 tick** 안에서 일어나면 `play()`가 예약한 첫
  // `requestAnimationFrame` 이 단 한 번도 실행되지 않은 채로 재생이 끝난다 — `frame()` 자체가
  // 안 불린다는 뜻이다(리뷰어가 `frame()` 첫 줄에 console.error 를 심어 실측: 관문은 10/10
  // 인데 그 로그가 한 번도 안 찍혔다). Task 7 이 고친 `root is not defined` 버그가 정확히
  // 그 `frame()` 안에 살아 있었다 — 아무도 그 경로를 실행하지 않았기 때문에 몇 달간 아무도
  // 몰랐다.
  //
  // **실측(Task 8 라운드 1/5) — 이 헤드리스 환경은 프로세스당 실 rAF 를 최대 2번만,
  // 그것도 페이지 로드 직후의 아주 짧은 창(setTimeout 지연 0ms 근처)에서만 준다.** 독립
  // 진단 페이지로 직접 쟀다: `requestAnimationFrame` 을 지연 0ms 로 요청하면 2틱(가상
  // 시각 15~41ms 부근), 100ms 지연이면 0틱, 400ms 지연이면 1틱, 2000ms 지연이면 0틱 —
  // `--virtual-time-budget` 을 아무리 늘려도(8000→30000) 더 나오지 않는다(합성 화면
  // 컴포지터가 없는 `--headless=new --disable-gpu` 특성으로 보인다). 그래서 온보딩
  // 5→6단계처럼 여러 클릭·비동기 fetch 를 거친 **뒤**에 재생을 켜면, 그 시점엔 이미 그 창이
  // 지나 있어 실측상 0틱이 나온다(직접 재확인: 위 흐름으로 `.an-count` 를 2초 폴링해도
  // 단 한 번도 0 초과 값을 못 봤다). 즉 온보딩 UI 흐름 안에서 자연 발생 재생을 기다리는
  // 접근은 **환경의 하드 한계로 원리적으로 불가능**하다 — 더 기다려도, 더 폴링해도 없다.
  //
  // 그래서 이 라우트는 온보딩 흐름을 타지 않는다 — `MSAnalyzeView.play()`(progress-analyze.js,
  // index.html 에서 app.js 보다 먼저 전역으로 실린다)를 **합성 stepper**(readingStepper 와
  // 같은 계약: total·done·index·rows·step()·drain())로 **페이지 로드 직후 지연 0ms** 에
  // 직접 호출한다 — 실측상 rAF 가 살아있는 유일한 창이다. step() 을 의도적으로 무겁게
  // 만들어(호출마다 ~1.2ms busy-wait) FRAME_BUDGET_MS(8ms) 안에 전부 못 끝나게 하고
  // (총 30개, 프레임당 ~6개), `.an-count` 를 짧게 폴링해 **0 < index < total** 인 값을
  // 관찰한다 — 이 값은 우리 코드가 아니라 오직 `step()`(=`frame()` 내부)만 바꿀 수 있으므로
  // 이게 보이면 **실 rAF 로 frame() 이 실제 호출됐다**는 직접 증거다. 관찰 후에는(더 기다리지
  // 않고) 드레인해 완료까지 확인한다.
  { name: "progress-analyze-raf-live", seed: {}, go: null,
    scripts: [
      { at: 0, code:
        "window.__rafSamples=[];" +
        "window.__rafObserved=false;" +
        "try{" +
          "var TOTAL=30, idx=0, rows=[];" +
          "var stepper={" +
            "total:TOTAL," +
            "get done(){ return idx>=TOTAL; }," +
            "get index(){ return idx; }," +
            "rows:rows," +
            "step:function(){" +
              "if(idx>=TOTAL) return null;" +
              "var t0=performance.now();" +
              "while(performance.now()-t0<1.2){}" +               // frame() 이 한 번에 다 못 끝내게(합성 부하)
              "var r={type:'synthetic'+idx, bias:0.1, text:'합성 판독 '+idx};" +
              "rows.push(r); idx++; return r;" +
            "}," +
            "drain:function(){ while(idx<TOTAL) this.step(); return rows; }" +
          "};" +
          "MSAnalyzeView.play({ stepper:stepper, basic:5, onDone:function(rows2){" +
            "window.__rafPlayDone=true; window.__rafPlayRows=rows2.length;" +
          "}});" +
        "}catch(e){ console.error('SYNTH_PLAY_THROW', String(e)); }" +
        "var t=0;" +
        "var iv=setInterval(function(){" +
          "t++;" +
          "var cnt=document.querySelector('.an-count');" +
          "var m=cnt&&/^(\\d+) \\//.exec(cnt.textContent);" +
          "var v=m?Number(m[1]):0;" +
          "if(v>0){ window.__rafObserved=true; window.__rafSamples.push(v); }" +
          "if(v>0||t>40){" +                                       // 실제 진행을 봤거나(정상), 400ms 넘겨도 못 봤으면(환경 한계) 멈춘다
            "clearInterval(iv);" +
            "var scrim=document.querySelector('.an-scrim');" +
            "if(scrim) scrim.click();" +                           // 관찰 후 드레인 — 완료까지 확인
          "}" +
        "},10);" }
    ],
    delay: 1500,
    assert: "typeof MSAnalyzeView !== 'undefined' && " +
      "(function(){" +
        // 핵심 증거 — 0 < 관찰값 < 30. 이 범위를 벗어나면 실 rAF 로 frame() 이 돈 게 아니다
        // (0 이면 한 번도 안 돎, ==30 이면 우리 폴링이 늦어 이미 드레인된 뒤를 본 것일 수
        // 있어 증거력이 없다 — 그래서 반드시 '진행 중' 스냅샷이어야 한다).
        "if(!window.__rafObserved) return false;" +
        "var s=window.__rafSamples;" +
        "if(!s.length) return false;" +
        "if(!(s[0]>0&&s[0]<30)) return false;" +
        // 드레인 후 완료까지 실제로 도달했다(오버레이가 스스로 닫히고 onDone 이 불렸다).
        "if(!window.__rafPlayDone) return false;" +
        "if(window.__rafPlayRows!==30) return false;" +
        "if(document.querySelector('.an-scrim')) return false;" +
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
        // [리뷰 C1, 2026-08-18 → 2026-08-19 P1b Task 6 이 되살림] PENDING 이 이제 비어
        // tierBuyable('full')·tierBuyable('custom') 이 둘 다 true 다 — buildCta() 가 다시
        // 광고·스쿱 버튼을 그린다. 예고했던 옛 순서 단언(광고가 스쿱보다 DOM 순서상 먼저)을
        // 되살린다 — report-basic.test.mjs 의 같은 이름의 노드 시험과 같은 사실을 브라우저로
        // 한 번 더 잰다.
        "if(!ad||!scoop) return false;" +
        "var kids=Array.prototype.slice.call(unlock.children);" +
        "if(kids.indexOf(ad)>kids.indexOf(scoop)) return false;" +   // 광고가 스쿱보다 먼저(DOM 순서)
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
  // 사각지대다).
  //
  // [2026-08-19, P1b Task 6 이 되살림] report-blocks.js 의 PENDING(sentence·forecast·
  // hitrate·compare) 이 이제 비어 tierBuyable('full')·tierBuyable('custom') 이 둘 다 true 다
  // — buildCta() 가 다시 광고·스쿱 버튼을 그린다. 이름은 "-locked-tiers" 그대로 남겼다(이
  // 라우트가 이어 온 계보를 git 이력·문서 교차참조에서 찾기 쉽게) — 지금 재는 것은 "잠긴
  // 시트"가 아니라 그 **반대**(살 수 있게 된 시트가 정직하게 그 상태를 보여주는가)다.
  // `.rp-cta-scoop` 를 클릭해 시트를 열고, 두 티어 다 `.is-locked` 가 아니고 자물쇠 아이콘이
  // 없고 가격이 있고 Run 버튼이 활성인지를 잰다 — C1 커밋(2026-08-18)이 지우기 전 옛 단언과
  // 같은 필드를 보되 극성만 뒤집었다(잠김→구매가능). 그 옛 단언은 report-basic.test.mjs 의
  // 노드 시험이 이미 되살렸다(광고가 스쿱보다 DOM 순서상 먼저·버튼 존재) — 여기서는 그
  // 클릭이 실제 시트를 여는지까지 브라우저로 한 번 더 잰다.
  { name: "report-locked-tiers", seed: { ...ON, ms_preds: PREDS }, go: '"report",{sym:"AAPL"}', delay: 2600,
    scripts: [
      { at: 300, code:
        "var iv=setInterval(function(){" +
          "var cta=document.querySelector('.rp-cta-scoop');" +
          "if(cta){clearInterval(iv); cta.click();}" +
        "}, 100);"
      }
    ],
    assert: "MSApp.current().route === 'report' && !!document.querySelector('[data-screen=\"report\"]') && " +
      "(function(){" +
        "var full=document.querySelector('.sheet-tier.tier-full');" +
        "var custom=document.querySelector('.sheet-tier.tier-custom');" +
        "if(!full||!custom) return false;" +                                              // 시트가 실제로 열렸다
        "if(full.classList.contains('is-locked')||custom.classList.contains('is-locked')) return false;" +
        "if(full.querySelector('.sheet-tier-locked')||custom.querySelector('.sheet-tier-locked')) return false;" +
        "if(!full.querySelector('.sheet-tier-price')||!custom.querySelector('.sheet-tier-price')) return false;" +
        "var run=document.querySelector('.sheet-run');" +
        "if(!run||run.disabled) return false;" +                                          // 구매 가능 상태에선 Run 이 살아 있다
        "var note=document.querySelector('.rp-comb-note');" +
        "if(!note||note.textContent.indexOf(MSStr.t.rpCombNoteAd)<0) return false;" +      // "광고 1편으로 전부 열림" 약속이 이제 있다
        "return true;" +
      "})()" },
  // P1b Task 1(PROGRESS.md:109 "위험도 상승")이 연 자리 — report.js 의 구매 흐름(spend →
  // 19a 진행 중계 → 8b 해제 전환 3초 고정 → draw())을 태우는 라우트가 하나도 없었다.
  // progress-analyze-raf-live 는 MSAnalyzeView.play() 를 **합성 stepper 로 직접** 부른다 —
  // runTier() 가 실제로 넘기는, readingStepper(analyzeX 실호출)로 만든 stepper와는 다른
  // 호출이다. progress-reveal.js 는 revealThenDraw() 가 **유일한 호출자**인데 그 경로는
  // Task 1~5 동안 PENDING 이 잠가서 브라우저로는 어디서도 안 태워졌다.
  //
  // [2026-08-19, P1b Task 6] PENDING 이 비어 이 시퀀스를 이제 실제로 태운다 — 구매(spend)→
  // 로드(3주기)→분석(19a)→해제(8b)→draw() 전체다. `.an-scrim`/`.rv-scrim` 을 폴링으로 찾아
  // 클릭해 두 재생을 **탭하면 즉시 완료**(양쪽 공통 규칙, progress-analyze.js·progress-
  // reveal.js 주석)로 드레인한다 — onboarding-analysis 라우트가 이미 쓰는 것과 같은 기법
  // (위 참고): 헤드리스 크로미움에서 rAF 가 실 벽시계 속도로만 돈다는 게 실측돼 있어(그
  // 라우트의 실증 코멘트), 고정 delay 하나로 재생이 끝나길 도박하면 이 라우트가 실행마다
  // 다르게 걸린다 — 3회 반복 요구(브리프)가 그 flakiness 를 바로 드러낼 자리다. 드레인은
  // 연출을 건너뛰는 게 아니라 **실사용자에게도 있는 탭 종료 버튼**을 그대로 쓰는 것이라
  // 19a·8b 의 실제 코드 경로(finish()·close()·onDone 체인)를 그대로 지나간다.
  //
  // delay=8000 의 근거: go(400) + CTA 폴링·클릭(최대 수백ms) + 시트 렌더(잔량 조회 왕복,
  // localhost 라 수십ms) + Run 클릭 + spend POST(mock, 즉시) + 3주기 OHLC 로드(mock, 즉시)
  // + 19a/8b 드레인(폴링 100ms 간격, 보통 한두 tick) + draw()(차트 캔버스 작도, 동기)를 다
  // 합쳐도 2~3초면 끝나는 게 보통이지만, 이 라우트가 **처음** 이 시퀀스를 태우는 자리라
  // 실측 여유를 넉넉히 둔다(기존 report-purchase 자리에 미리 담아 둔 6000 보다 2000 더).
  { name: "report-purchase", seed: { ...ON, ms_preds: PREDS }, go: '"report",{sym:"AAPL"}', delay: 8000,
    scripts: [
      { at: 300, code:
        "var ctaClicked=false, runClicked=false, drained=false;" +
        "var iv=setInterval(function(){" +
          "if(!ctaClicked){" +
            "var cta=document.querySelector('.rp-cta-scoop');" +
            "if(cta){ctaClicked=true; cta.click();}" +
            "return;" +
          "}" +
          "if(!runClicked){" +
            "var run=document.querySelector('.sheet-run');" +
            "if(run&&!run.disabled){runClicked=true; run.click();}" +
            "return;" +
          "}" +
          "if(!drained){" +
            "var a=document.querySelector('.an-scrim');" +
            "if(a)a.click();" +                          // 19a 드레인 — 남은 지표를 동기로 마저 읽는다
            "var r=document.querySelector('.rv-scrim');" +
            "if(r){r.click(); drained=true; clearInterval(iv);}" +   // 8b 는 19a onDone 뒤 같은 tick 에 이미 DOM 에 있다
          "}" +
        "}, 100);"
      }
    ],
    assert: "MSApp.current().route === 'report' && !!document.querySelector('[data-screen=\"report\"]') && " +
      "(function(){" +
        "var tierBadge=document.querySelector('.rp-tier.is-full');" +
        "if(!tierBadge) return false;" +                                    // 구매가 실제로 반영돼 심화로 전환됐다
        "var ids=['sentence','forecast','chart','dissent','horizons','hitrate','readings','compare'];" +
        "for(var i=0;i<ids.length;i++){" +
          "if(!document.querySelector('[data-block=\"'+ids[i]+'\"]')) return false;" +   // 8블록이 실제로 다 그려졌다
        "}" +
        "if(document.querySelector('.rp-cta-ad')||document.querySelector('.rp-cta-scoop')) return false;" +  // 이미 산 뒤엔 해제 CTA 가 없다
        "if(document.querySelector('.an-scrim')||document.querySelector('.rv-scrim')) return false;" +       // 재생 오버레이가 안 남아 있다
        "if(typeof MSAnalyzeView==='undefined'||typeof MSReveal==='undefined') return false;" +
        "return true;" +
      "})()" },
  // [리뷰 I2, 2026-08-19] report-purchase 는 full(3스쿱)만 태웠다 — 가장 비싼 상품인
  // custom(전문분석, 5스쿱)의 구매 체인(runCustom() → MSExpert.open → .xp-run → 편집기가
  // 넘긴 weights 로 runTier("custom", weights) → spend{runType:"custom"})은 라우트 13개
  // 어디에도 없었다. 노드 시험(report-full.test.mjs)이 보는 custom 은 "이미 산 것" 지름길
  // 렌더뿐이라 구매 체인 자체는 한 번도 실행된 적이 없었다 — "못 그리는 것을 팔지 않는다"
  // 의 형제 규율("실행해 본 적 없는 것을 팔지 않는다")을 이 라우트로 채운다.
  //
  // 클릭 체인이 report-purchase 보다 한 단계 더 길다: ①`.rp-cta-scoop`(해제 CTA) ②
  // `.sheet-tier.tier-custom`(시트에서 전문분석 행을 골라 picked="custom") ③`.sheet-run`
  // (picked===custom 이므로 runCustom() 을 태운다 — MSTierSheet 를 닫고 MSExpert 를 연다)
  // ④`.xp-run`(편집기 — 기본 프리셋 가중치가 이미 채워져 있어 아무것도 안 만져도 클릭
  // 가능해야 한다, 설계 §3.7). ④ 이후는 report-purchase 와 같은 19a/8b 드레인이다.
  //
  // delay=9000 의 근거: report-purchase(8000, 3-클릭 체인)에 시트 내부 선택 한 단계(②)와
  // 편집기 오픈·렌더(그 자체는 동기지만 MSWallet.get() 왕복 한 번이 더 낀다, runCustom() 이
  // 여는 편집기가 자기 자신의 발란스 조회를 다시 한다) 여유를 더했다 — 폴링 100ms 간격이라
  // 실제로는 훨씬 빨리 끝나는 게 보통이지만, **이 라우트가 처음** custom 구매 체인을 태우는
  // 자리라 report-purchase 때와 같은 이유로 넉넉히 잡는다.
  //
  // 운영 서버 미접속 확인은 report-purchase 와 동일(gate-browser.mjs 의 --host-resolver-
  // rules 가 parksvc.mycafe24.com 을 로컬 mock 으로 강제 리다이렉트) — 새로 만든 것 없음.
  //
  // 심볼은 AAPL 이 아니라 MSFT — 실측(첫 시도, AAPL): 전문분석의 기본 프리셋(trend) 가중치는
  // 32개 균등가중과 다른 조합이라, AAPL(드리프트 0.12, full 균등가중에서도 겨우 bull 로
  // 걸치는 약한 신호)에서는 regime 이 neutral 로 떨어져 dissent/hitrate 처럼 방향 있어야만
  // 그려지는 블록이 정당하게(버그 아님, buildAgainst()·hitRate() 의 실제 게이트) 빠졌다 —
  // 9블록 단언이 "실제로 못 그려서"가 아니라 "이 표본에서 방향이 없어서" 실패해 무엇을
  // 재는지 흐려졌다. MSFT(드리프트 0.3, report-comb-bull 라우트가 이미 bull 로 결정적임을
  // 픽셀로 실증)로 바꾸면 강한 추세라 어떤 가중치 조합에서도 방향이 안정적으로 유지된다.
  { name: "report-purchase-custom", seed: { ...ON, ms_preds: PREDS }, go: '"report",{sym:"MSFT"}', delay: 9000,
    scripts: [
      { at: 300, code:
        "var ctaClicked=false, customPicked=false, sheetRunClicked=false, xpRunClicked=false, drained=false;" +
        "var iv=setInterval(function(){" +
          "if(!ctaClicked){" +
            "var cta=document.querySelector('.rp-cta-scoop');" +
            "if(cta){ctaClicked=true; cta.click();}" +
            "return;" +
          "}" +
          "if(!customPicked){" +
            "var row=document.querySelector('.sheet-tier.tier-custom');" +
            "if(row&&!row.disabled){customPicked=true; row.click();}" +
            "return;" +
          "}" +
          "if(!sheetRunClicked){" +
            "var run=document.querySelector('.sheet-run');" +
            "if(run&&!run.disabled){sheetRunClicked=true; run.click();}" +
            "return;" +
          "}" +
          "if(!xpRunClicked){" +
            "var xr=document.querySelector('.xp-run');" +
            "if(xr&&!xr.disabled){xpRunClicked=true; xr.click();}" +
            "return;" +
          "}" +
          "if(!drained){" +
            "var a=document.querySelector('.an-scrim');" +
            "if(a)a.click();" +
            "var r=document.querySelector('.rv-scrim');" +
            "if(r){r.click(); drained=true; clearInterval(iv);}" +
          "}" +
        "}, 100);"
      }
    ],
    assert: "MSApp.current().route === 'report' && !!document.querySelector('[data-screen=\"report\"]') && " +
      "(function(){" +
        "var tierBadge=document.querySelector('.rp-tier.is-custom');" +
        "if(!tierBadge) return false;" +                                    // 구매가 실제로 반영돼 전문으로 전환됐다
        "var ids=['weights','sentence','forecast','chart','dissent','horizons','hitrate','readings','compare'];" +
        "for(var i=0;i<ids.length;i++){" +
          "if(!document.querySelector('[data-block=\"'+ids[i]+'\"]')) return false;" +   // 9블록(조절판 포함)이 실제로 다 그려졌다
        "}" +
        "if(document.querySelector('.rp-cta-ad')||document.querySelector('.rp-cta-scoop')) return false;" +
        "if(document.querySelector('.an-scrim')||document.querySelector('.rv-scrim')) return false;" +
        "if(document.querySelector('.xp-scrim')) return false;" +           // 편집기도 닫혀 있어야 한다
        "if(typeof MSExpert==='undefined') return false;" +                 // 편집기 모듈이 실제로 전역 등록됐다
        "return true;" +
      "})()" },
  { name: "record", seed: { ...ON, ms_preds: PREDS }, go: '"record"',
    assert: "MSApp.current().route === 'record' && !!document.querySelector('[data-screen=\"record\"]')" },
  { name: "result", seed: { ...ON, ms_preds: PREDS }, go: '"result",{sym:"TSLA",asOf:"2026-08-14"}',
    assert: "MSApp.current().route === 'result' && !!document.querySelector('[data-screen=\"result\"]')" }
];
