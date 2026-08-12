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
    current: function () { return { route: state.showing, params: { sym: state.selectedSym } }; }
  };

  document.addEventListener("DOMContentLoaded", function () {
    rootEl = document.getElementById("app");
    if (typeof ForgeCore === "undefined") {
      rootEl.innerHTML = "<p class='empty'>" + MSStr.t.bootVendorMissing + "</p>";
      return;
    }

    // 개발용 백엔드. 8b 는 이 줄과 index.html 의 스크립트 태그를 서버 백엔드로 바꾼다.
    // ⚠️ 8b 는 여기도 손봐야 한다 — 설계서 §3 은 "백엔드가 자기 자신을 설치"라고 적었지만
    // 실제 설치 지점은 이 셸이다. index.html 의 스크립트 태그 한 줄 교체로 끝나지 않는다.
    if (typeof MSWalletLocalStub !== "undefined" && !MSWallet.isInstalled()) {
      MSWallet.install(MSWalletLocalStub.create({ costOf: MSWallet.costOf }));
    }

    // 시드를 먼저 심어야 inWatchlist 판정이 첫 부팅에서도 맞는다(워치리스트 화면도 다시 부르지만 무해).
    MSStore.seedIfEmpty();
    var last = MSStore.getLastSym();
    if (inWatchlist(last)) state.selectedSym = last;
    // showing 은 여기서 직접 건드리지 않는다 — 절반만 맞는 얘기다. 단일 부팅에서는
    // renderReportPane 이 아예 안 불리므로 showing="watchlist" 그대로 목록으로 시작한다
    // (목록 대신 리포트로 떨어지면 당황스럽다). 2단 부팅에서는 아래 renderShell 이
    // renderReportPane 을 부르고, 거기서 selectedSym 이 있으면 showing="report" 로
    // 따라온다 — 그래야 곧바로 접었을 때(단일 전환) 방금 보던 리포트가 유지된다.

    var mq = window.matchMedia(MSLayout.MODE_QUERY);
    dual = mq.matches;
    function onMode(e) { dual = e.matches; renderShell(); }
    if (mq.addEventListener) mq.addEventListener("change", onMode);
    else mq.addListener(onMode);   // 구형 WebView 폴백

    if (!shellResizeBound) { window.addEventListener("resize", onShellResize); shellResizeBound = true; }

    renderShell();
  });
})();
