// 셸 — 화면이 둘뿐이라 라우트 대신 '선택 종목' 하나로 충분하다.
// 접었다 펴도 보던 종목이 따라오는 것이 여기서 공짜로 나온다: 같은 selectedSym 을
// 레이아웃만 달리 그린다(설계 §5). 라우트를 유지한 채 2단을 얹으면
// "왼쪽 칸은 무슨 라우트인가" 같은 답 없는 질문이 생긴다.
(function () {
  "use strict";

  var state = { selectedSym: null, showing: "watchlist" };
  var rootEl = null, dual = false;
  var listPane = null, reportPane = null;
  var shellEl = null;             // 2단일 때 grid 컨테이너 — resize 시 gridTemplateColumns 만 갱신
  var shellResizeBound = false;   // 리스너를 한 번만 등록(모드 전환마다 다시 붙이지 않는다)
  var modeBound = false;          // matchMedia 도 같은 이유 — boot() 가 두 번 불려도 한 번만 붙는다

  function inWatchlist(sym) {
    if (!sym) return false;
    var wl = MSStore.getWatchlist(), i;
    for (i = 0; i < wl.length; i++) { if (wl[i].sym === sym) return true; }
    return false;
  }

  // 왼쪽 칸을 다시 그리지 않고 하이라이트만 옮긴다 — 재렌더하면 스크롤이 맨 위로 튀고
  // 진행 중인 스캔 UI 가 죽는다(MSWatchlist.render 가 scanning=false 로 시작한다).
  function markSelected() {
    if (!listPane) return;
    var rows = listPane.querySelectorAll("[data-sym]"), i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute("data-sym") === state.selectedSym) rows[i].classList.add("is-sel");
      else rows[i].classList.remove("is-sel");
    }
  }

  function renderReportPane() {
    reportPane.innerHTML = "";
    if (state.showing === "wallet") { MSWalletScreen.render(reportPane); markSelected(); return; }
    if (state.showing === "result" && state.resultOf) {
      reportPane.scrollTop = 0;
      MSResult.render(reportPane, { sym: state.resultOf.sym, asOf: state.resultOf.asOf });
      markSelected(); return;
    }
    reportPane.scrollTop = 0;
    if (state.selectedSym) {
      // 2단에서 오른쪽 칸이 리포트를 그린 순간부터 '리포트를 보고 있는 상태'다 —
      // 이걸 안 세우면 아무것도 탭하지 않고 접었을 때 목록으로 떨어진다.
      state.showing = "report";
      MSReport.render(reportPane, { sym: state.selectedSym });
    } else {
      reportPane.appendChild(MSUi.el("p", "empty", MSStr.t.rpPickSym));
    }
    markSelected();
  }

  function renderShell() {
    rootEl.innerHTML = "";
    listPane = null; reportPane = null; shellEl = null;
    if (dual) document.body.classList.add("ms-dual");
    else document.body.classList.remove("ms-dual");

    if (dual) {
      var shell = MSUi.el("div", "shell");
      shell.style.gridTemplateColumns = MSLayout.listWidth(window.innerWidth) + "px 1fr";
      listPane = MSUi.el("div", "pane pane-list");
      reportPane = MSUi.el("div", "pane pane-report");
      shell.appendChild(listPane);
      shell.appendChild(reportPane);
      rootEl.appendChild(shell);
      shellEl = shell;
      MSWatchlist.render(listPane);
      renderReportPane();
      return;
    }

    if (state.showing === "wallet") MSWalletScreen.render(rootEl);
    else if (state.showing === "result" && state.resultOf)
      MSResult.render(rootEl, { sym: state.resultOf.sym, asOf: state.resultOf.asOf });
    else if (state.showing === "report" && state.selectedSym) MSReport.render(rootEl, { sym: state.selectedSym });
    else MSWatchlist.render(rootEl);
    window.scrollTo(0, 0);
  }

  // MODE_QUERY 는 폭·높이 둘 다 걸려 있어 같은 모드 안에서의 회전(749×654 ↔ 654×749)은
  // change 이벤트를 안 낸다. 셸엔 그래서 자체 resize 리스너가 필요하다 — 차트는 report.js 가
  // 자기 resize 로 따라가는데 셸만 renderShell() 때 굳은 폭 그대로 남는 비대칭을 막는다.
  // 재렌더는 하지 않는다 — 재렌더하면 §5.2 가 막던 스크롤 튐·스캔 UI 파괴가 되돌아온다.
  // 그리드 폭 한 줄만 갱신한다. 리스너는 부팅 시 한 번만 등록(모드 전환마다 쌓이지 않는다).
  function onShellResize() {
    if (!dual || !shellEl) return;
    shellEl.style.gridTemplateColumns = MSLayout.listWidth(window.innerWidth) + "px 1fr";
  }

  function go(route, params) {
    var sym = (params && params.sym) ? String(params.sym).trim().toUpperCase() : null;
    if (route === "wallet") {
      state.showing = "wallet";
      if (dual) { renderReportPane(); return; }
      renderShell(); return;
    }
    // 어제 결과 상세(시안 17b·14b). 고리의 두 번째 칸이다 — 결과를 닫아주지 않으면
    // 사용자가 내일 앱을 열 이유가 없다.
    if (route === "result" && sym) {
      state.resultOf = { sym: sym, asOf: params && params.asOf };
      state.showing = "result";
      if (dual) { renderReportPane(); return; }
      renderShell(); return;
    }
    if (route === "report" && sym) {
      state.selectedSym = sym;
      state.showing = "report";
      MSStore.setLastSym(sym);
      if (dual) { renderReportPane(); return; }   // 오른쪽만 교체 — 목록 칸은 손대지 않는다
    } else {
      state.showing = "watchlist";
    }
    renderShell();
  }

  window.MSApp = {
    go: go,
    current: function () {
      if (state.showing === "result" && state.resultOf)
        return { route: "result", params: { sym: state.resultOf.sym, asOf: state.resultOf.asOf } };
      return { route: state.showing, params: { sym: state.selectedSym } };
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    rootEl = document.getElementById("app");
    if (typeof ForgeCore === "undefined") {
      rootEl.innerHTML = "<p class='empty'>" + MSStr.t.bootVendorMissing + "</p>";
      return;
    }

    // 서버 지갑. 잔량의 진실은 서버에 있고 클라이언트는 그린다(SPEC-economy §1).
    // 절대 URL 이어야 한다 — capacitor.config.json 의 androidScheme:"https" 때문에 앱은
    // https://localhost/ 에서 서빙되고, 상대경로 "wallet-api.php" 는 번들에 없는 파일을
    // 가리켜 전부 404 로 죽는다(api.js 의 API_BASE 와 같은 이유로 절대 URL — forge-api.php
    // 는 CORS 를 이미 열어 뒀지만 wallet-api.php 는 Authorization 헤더까지 얹는 요청이라
    // 별도로 Access-Control-Allow-Headers 에 Authorization 을 더해야 한다, wallet-api.php 참고).
    //
    // 개발 스킴에서는 설치하지 않는다. 이 줄은 어느 페이지 로드에서든 무조건 돌았고, www/ 에서
    // python3 -m http.server 를 띄워 화면을 한 번 열어본 것만으로 운영 서버에 진짜 계정이
    // 만들어졌다(온보딩 3단계가 지갑을 부르므로 첫 로드가 곧 계정 생성이다).
    // 판정을 **개발 스킴 거부 목록**으로 쓴다 — "https 일 때만 설치"라는 허용 목록이 아니다.
    // 안드로이드는 capacitor.config.json 의 androidScheme:"https" 로 https://localhost/ 에서
    // 서빙되지만 iOS 타깃을 더하면 capacitor:// 가 된다. 허용 목록은 그날 지갑을 조용히 꺼뜨리고
    // (증상은 "지급이 안 된다"뿐이라 원인까지 가기 멀다), 거부 목록은 새 스킴을 그냥 통과시킨다.
    // 걸려도 죽지 않는다 — 백엔드 없는 MSWallet.get() 은 {ok:false, reason:"no-backend"} 를
    // 돌려주고(wallet.js), 온보딩 3단계는 그것을 오프라인 안내 + 재시도로 이미 그린다.
    var devHost = (location.protocol === "http:" || location.protocol === "file:");
    if (!devHost && typeof MSWalletHttp !== "undefined" && !MSWallet.isInstalled()) {
      MSWallet.install(MSWalletHttp.create({ url: "https://parksvc.mycafe24.com/map/wallet-api.php" }));
    }

    // 온보딩이 4단계에서 워치리스트를 심는다. 여기서 시드를 심으면 사용자가 고르지 않은
    // 종목이 생기고 4단계가 무의미해진다.
    if (!MSStore.onboarded()) {
      MSOnboarding.render(rootEl, { onDone: function () { boot(); } });
      return;
    }
    boot();
  });

  // 온보딩을 통과한 뒤의 부팅. 게이트 뒤로 통째로 밀려 있어야 온보딩 위에 셸이 겹쳐 그려지지 않는다.
  function boot() {
    var last = MSStore.getLastSym();
    if (inWatchlist(last)) state.selectedSym = last;
    // showing 은 여기서 직접 건드리지 않는다 — 절반만 맞는 얘기다. 단일 부팅에서는
    // renderReportPane 이 아예 안 불리므로 showing="watchlist" 그대로 목록으로 시작한다
    // (목록 대신 리포트로 떨어지면 당황스럽다). 2단 부팅에서는 아래 renderShell 이
    // renderReportPane 을 부르고, 거기서 selectedSym 이 있으면 showing="report" 로
    // 따라온다 — 그래야 곧바로 접었을 때(단일 전환) 방금 보던 리포트가 유지된다.

    var mq = window.matchMedia(MSLayout.MODE_QUERY);
    dual = mq.matches;              // 폭 판정 자체는 매 부팅마다 다시 읽는다
    function onMode(e) { dual = e.matches; renderShell(); }
    // 리스너는 한 번만. 지금 boot() 를 두 번 부르는 경로는 온보딩의 finished 래치가 막고
    // 있을 뿐인데, 그 래치는 다른 이유로 존재한다 — 여기가 스스로 막지 않으면 남의 가드에
    // 목숨을 맡기는 셈이다(바로 아래 shellResizeBound 와 같은 값싼 보험).
    if (!modeBound) {
      if (mq.addEventListener) mq.addEventListener("change", onMode);
      else mq.addListener(onMode);   // 구형 WebView 폴백
      modeBound = true;
    }

    if (!shellResizeBound) { window.addEventListener("resize", onShellResize); shellResizeBound = true; }

    renderShell();
  }
})();
