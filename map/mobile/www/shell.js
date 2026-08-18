// DOM 조립 — 하단 탭바 + 화면 컨테이너. 네비게이션 판단은 router.js 가 한다(여기는 그리기만).
// 아이콘 path 는 시안 14a 실물에서 옮긴 것이다(목록=선 3개 / 분석=막대 4개 / 스쿱=마크).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSShell", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // label 은 문자열 키가 아니라 함수다 — strings.test.mjs 의 미사용 키 가드가 `MSStr.t.키`
  // 형태의 점 접근만 정적으로 잡는다(별칭 T.키 까지는 알아도 동적 대괄호 접근은 못 본다).
  // MSStr.t[def.label] 로 뽑으면 wlTabList 등이 "참조되지 않음"으로 오판된다.
  var TAB_DEFS = [
    { tab: "list", home: "watchlist", label: function () { return MSStr.t.wlTabList; },
      icon: '<path d="M2.5 4.2h12M2.5 8.5h12M2.5 12.8h7.5"/>' },
    { tab: "analysis", home: "report", label: function () { return MSStr.t.wlTabAnalysis; },
      icon: '<path d="M2.2 13.4V8.6M6.4 13.4V3.4M10.6 13.4V10.4M14.8 13.4V6"/>' },
    { tab: "scoop", home: "wallet", label: function () { return MSStr.t.wlTabScoop; }, mark: true }
  ];

  var router = null, screenEl = null, barEl = null, badge = false;

  function tabIcon(def) {
    if (def.mark) return MSUi.scoopMark(42);
    return '<svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" ' +
           'stroke-width="1.7" stroke-linecap="round" aria-hidden="true">' + def.icon + '</svg>';
  }

  function drawBar() {
    if (!barEl) return;
    barEl.innerHTML = "";
    var cur = router.tab();
    TAB_DEFS.forEach(function (def) {
      var b = MSUi.el("button", "ms-tab" + (def.tab === cur ? " is-on" : ""));
      b.type = "button";
      b.setAttribute("data-tab", def.tab);
      b.innerHTML = tabIcon(def) + '<span>' + def.label() + '</span>';
      // 배지는 받을 것이 있을 때만 요소를 만든다 — 숨김 처리로 두면 "왜 안 보이나"가
      // CSS 문제인지 상태 문제인지 구분이 안 된다.
      if (def.tab === "scoop" && badge) b.appendChild(MSUi.el("span", "ms-tab-badge"));
      b.addEventListener("click", function () { onTab(def); });
      barEl.appendChild(b);
    });
  }

  function onTab(def) {
    // 방문한 적 없는 탭으로 switchTab() 만 하면 그 탭 스택이 비어 있어 router.draw() 가
    // top() null 을 만나 onRender 를 아예 안 부른다 — 탭 표시(is-on)만 바뀌고 화면은 이전
    // 탭 내용 그대로 남는 콜드탭 버그다(Task 3 리뷰가 실측으로 잡음). 스택이 비었거나
    // 이미 그 탭이면(같은 탭 재탭 = "처음으로", 널리 학습된 동작) 그 탭의 홈으로 간다.
    // 홈 화면 지식은 TAB_DEFS(여기)에만 있다 — router.js 는 DOM 도 UI 도 모르는 상태기계로
    // 남아야 하므로 라우터에 홈을 묻지 않는다.
    var empty = router.stackOf(def.tab).length === 0;
    if (empty || router.tab() === def.tab) router.go(def.home);
    else router.switchTab(def.tab);
  }

  function render(entry) {
    screenEl.innerHTML = "";
    // 1단 스크롤러는 body 다(style-base.css) — screenEl(#app) 자신은 스크롤 컨테이너가
    // 아니라 screenEl.scrollTop 을 리셋해도 아무 효과가 없다. 화면 전환마다 맨 위로 되돌리는
    // 것은 window 쪽 일이다(구 app.js 의 renderShell() 도 같은 이유로 window.scrollTo 를 썼다).
    if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
    // 리뷰 I5 사전조건: 화면 정체성을 관문이 클래스 접두(.rp-chart 등)가 아니라 이 표식으로
    // 조일 수 있게 한다(gate-routes.mjs:17 이 P1 전에 하라고 스스로 남긴 메모). #app(=screenEl)
    // 자신에 붙이는 이유는 화면 모듈이 안쪽을 통째로(root.innerHTML="") 새로 그리므로 내부
    // 요소가 아니라 컨테이너만이 렌더 도중에도 안정적으로 표식을 들 수 있어서다. P1 이 화면을
    // 재작성해도 이 한 줄만 안 지우면 관문 선택자가 안 깨진다.
    screenEl.setAttribute("data-screen", entry.id);
    // 리뷰 Minor: drawBar() 는 화면 render() 뒤가 아니라 try/finally 로 보장한다 — 화면
    // render() 가 던지면(신규 화면의 초기 버그 등) 이전엔 이 줄에 닿지도 못해 탭바가 통째로
    // 안 그려졌다. P0 산출물(탭바)이 화면 코드 하나의 완결에 인질로 잡히면 안 된다 — 화면이
    // 죽어도 사용자가 다른 탭으로 도망칠 길은 남아 있어야 한다.
    try { entry.screen.render(screenEl, entry.params); }
    finally { drawBar(); }
  }

  function mount(rootEl, screens) {
    router = MSRouter.create({ onRender: render });
    screens.forEach(function (s) { router.register(s); });

    // screenEl 은 rootEl(#app) 자신이다 — 새 래퍼 div 를 끼우지 않는다. 끼우면 화면들이
    // 만드는 .scr 가 더는 "#app > .scr" 가 아니게 되어 style-base.css 의 상단 세이프에어리어
    // 인셋이 조용히 무효화된다(env(safe-area-inset-*) 는 실기기가 아니면 0 이라 헤드리스도
    // node 관문도 이 회귀를 못 잡는다). 96px 여백은 .ms-screen 클래스(style-shell.css)로 준다.
    rootEl.innerHTML = "";
    rootEl.classList.add("ms-screen");
    screenEl = rootEl;

    // 탭바는 #app 의 형제로 둔다 — 화면 모듈 대부분이 render() 첫 줄에서 root.innerHTML=""
    // 로 자기 내용을 지운다(wallet.js 등). 탭바가 #app 안에 있으면 화면이 바뀔 때마다
    // 함께 지워졌다가 다시 그려져야 하는데, 그 여지를 아예 없앤다.
    var wrap = MSUi.el("div", "ms-tabbar-wrap");
    barEl = MSUi.el("div", "ms-tabbar");
    wrap.appendChild(barEl);
    rootEl.parentNode.appendChild(wrap);

    // 안드로이드 하드웨어 백. 라우터가 false 를 주면(더 이상 처리할 스택이 없다) 앱에 넘긴다(종료).
    // navigator 는 UMD 팩토리 인자가 아니라 브라우저 전역이다(이 저장소의 다른 UMD 모듈과
    // 같은 관례 — factory() 는 인자 없이 불린다, index.html 참고) — 자기 스코프의 `root`
    // 파라미터를 참조하면 어디서도 정의되지 않은 이름이라 backbutton 이 눌리는 순간 던진다.
    //
    // ⚠️ P0 리뷰 실측(C1): 아래 리스너는 지금 실기기에서 절대 안 불린다. "backbutton" 은
    // Cordova 가 쏘는 document 이벤트인데 이 앱은 Capacitor 8 이고, package.json 에
    // `@capacitor/app` 이 없다 — 그 플러그인이 없으면 Capacitor 의 native-bridge 는
    // backbutton 을 흉내조차 안 낸다(cordova.js 도 0바이트 자리표시자). MainActivity/Bridge
    // 쪽에도 onBackPressed 오버라이드가 없다. 그래서 지금은 **어느 화면에서든 하드웨어
    // 백 = 즉시 앱 종료**이고, 아래 코드(시트 우선 처리·router.back())는 그 사실과 무관하게
    // 한 번도 실행되지 않는 도달 불가능한 경로다.
    // 지우지 않는 이유: 로직 자체(시트 우선 → 라우터 → 종료)는 옳고 P1 이 그대로 쓴다.
    // 진행 현황(2026-08-18 갱신, P1a Task 6 시점) — ②는 끝났다: tier-sheet.js(Task 5)에
    // 이어 screens/watchlist.js 의 ＋Add 시트(Task 6)도 MSSheet 로 이관해, 지금 MSSheet.open
    // 의 프로덕션 호출자는 둘이다("백이 시트부터 닫는다"를 보여줄 시트가 이제 앱에 있다).
    // 남은 건 ①`@capacitor/app` 추가와 ③APK 재빌드·실기기 재검증 — 이 둘을 한 세트로
    // 묶어야 한다. 시트 이관은 끝났지만 플러그인이 여전히 없으므로 위 P0 실측(C1)은 그대로
    // 유효하다: 지금도 실기기 하드웨어 백 = 즉시 앱 종료이고, 아래 리스너는 여전히 한 번도
    // 실행되지 않는 도달 불가능한 경로다. 플러그인 없이 이 이관만으로는 아무것도 안 바뀐다
    // (P0 자체가 "플러그인만 넣고 이관을 빼먹은" 실패의 재시작이었다 — 이번엔 그 반대로
    // 이관만 끝내고 플러그인이 없는 상태이니, 다음 라운드가 플러그인 없이 "이제 백이 된다"고
    // 말하면 그게 새 버전의 같은 실패다).
    document.addEventListener("backbutton", function () {
      // 시트가 열려 있으면 화면을 바꾸지 않는다 — 시트만 닫는다(Task 5).
      if (MSSheet.closeTop()) return;
      if (!router.back() && typeof navigator !== "undefined" && navigator.app) navigator.app.exitApp();
    });
    return router;
  }

  // 의도적으로 미배선(현재 호출자 0건) — 스쿱 탭에 받을 것(미확인 결과·광고 보상 등)이
  // 생겼을 때 배지를 켜는 자리다. P1~P3 가 그 알림원을 만들면서(예: 다음날 판정 여정)
  // 실제로 호출하기 시작한다.
  function setBadge(on) { badge = !!on; drawBar(); }

  return { mount: mount, setBadge: setBadge, router: function () { return router; } };
});
