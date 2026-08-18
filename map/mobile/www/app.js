// 부팅만 한다. 화면 분기는 router.js, DOM 조립은 shell.js.
// readings·expert 는 화면 레지스트리에 없다 — MSExpert 는 open(opts)/close() 만 있고
// render 가 없고(screens/expert.js), MSReadingsList.render(root,{rows,noDir}) 는
// report.js 가 계산한 행을 받아야만 그려져 독립 라우트로 진입할 수 없다(screens/report.js
// 가 이미 두 화면 다 직접 호출로 연다 — MSApp.go 를 거치지 않는다). 지금 등록하면
// 라우팅되는 순간 죽는 코드를 심는 것이다. 리포트를 재설계할 때(P1) 라우트로 승격한다.
(function () {
  "use strict";

  var SCREENS = [
    { id: "watchlist", tab: "list",     render: function (el) { MSWatchlist.render(el); } },
    { id: "report",    tab: "analysis", render: function (el, p) { MSReport.render(el, { sym: p.sym || MSStore.getLastSym() }); } },
    { id: "wallet",    tab: "scoop",    render: function (el) { MSWalletScreen.render(el); } },
    { id: "record",    tab: "scoop",    render: function (el) { MSRecord.render(el); } },
    { id: "result",    tab: "list",     render: function (el, p) { MSResult.render(el, { sym: p.sym, asOf: p.asOf }); } },
    { id: "scanresult",tab: "list",     render: function (el) { MSScanResult.render(el); } }
  ];

  var router = null, booted = false;

  // 기존 화면들이 MSApp.go("report", {sym}) 로 부른다 — 그 계약을 유지한다.
  // 라우트 이름이 곧 화면 id 라 변환이 필요 없다.
  window.MSApp = {
    go: function (route, params) {
      if (route === "report" && params && params.sym) MSStore.setLastSym(String(params.sym).toUpperCase());
      router.go(route, params || {});
    },
    // router.current() 는 {id, params, tab}(라우터 소관 어휘)를 준다. 화면들은 옛 셸부터
    // MSApp.current().route 를 읽어 왔다(예: report.js isCurrent() — 결과 반영이 아직
    // 이 화면에 유효한지 판정, watchlist.js — 선택 하이라이트). id→route 로만 옮기고 값은
    // 그대로 넘긴다 — 여기서 어긋나면 report.js 의 결과 반영이 항상 "화면이 바뀌었다"로
    // 오판해 조용히 죽는다(router.js 단위 테스트로는 안 잡히는 소비자 쪽 계약).
    current: function () {
      var cur = router.current();
      return cur ? { route: cur.id, params: cur.params, tab: cur.tab } : null;
    },
    back: function () { return router.back(); }
  };

  document.addEventListener("DOMContentLoaded", function () {
    var rootEl = document.getElementById("app");
    if (typeof ForgeCore === "undefined") {
      rootEl.innerHTML = "<p class='empty'>" + MSStr.t.bootVendorMissing + "</p>";
      return;
    }

    // 개발 스킴(http:·file:)에서는 운영 지갑을 설치하지 않는다 — www/ 를 로컬에서 한 번
    // 열어본 것만으로 운영 서버에 진짜 계정이 생겼던 사고가 있었다. 거부 목록으로 판정하는
    // 이유는 iOS 의 capacitor:// 같은 새 스킴을 허용 목록이 조용히 꺼뜨리기 때문이다.
    var devHost = (location.protocol === "http:" || location.protocol === "file:");
    if (!devHost && typeof MSWalletHttp !== "undefined" && !MSWallet.isInstalled()) {
      MSWallet.install(MSWalletHttp.create({ url: "https://parksvc.mycafe24.com/map/wallet-api.php" }));
    }

    if (!MSStore.onboarded()) {
      MSOnboarding.render(rootEl, { onDone: function () { boot(rootEl); } });
      return;
    }
    boot(rootEl);
  });

  function boot(rootEl) {
    // 온보딩의 onDone 은 원래 한 번만 불려야 하는데, 그 래치는 온보딩 쪽 책임이다 — 여기가
    // 스스로 막지 않으면 남의 가드에 목숨을 맡기는 셈이다(옛 app.js 의 modeBound 와 같은
    // 이유). shell.js 의 mount() 는 재마운트를 스스로 막지 않아서(매번 탭바-wrap 을 새로
    // 만들고 backbutton 리스너를 새로 건다) 두 번 부르면 탭바가 겹쳐 그려지고 백버튼이
    // 두 번 처리된다.
    if (booted) return;
    booted = true;
    router = MSShell.mount(rootEl, SCREENS);
    router.go("watchlist");
  }
})();
