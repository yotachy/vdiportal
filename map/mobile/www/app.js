// 셸 — 화면이 둘뿐이라 라우트 대신 '선택 종목' 하나로 충분하다.
// 접었다 펴도 보던 종목이 따라오는 것이 여기서 공짜로 나온다: 같은 selectedSym 을
// 레이아웃만 달리 그린다(설계 §5). 라우트를 유지한 채 2단을 얹으면
// "왼쪽 칸은 무슨 라우트인가" 같은 답 없는 질문이 생긴다.
(function () {
  "use strict";

  var state = { selectedSym: null, showing: "watchlist" };
  var rootEl = null, dual = false;
  var listPane = null, reportPane = null;

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
    reportPane.scrollTop = 0;
    if (state.selectedSym) MSReport.render(reportPane, { sym: state.selectedSym });
    else reportPane.appendChild(MSUi.el("p", "empty", MSStr.t.rpPickSym));
    markSelected();
  }

  function renderShell() {
    rootEl.innerHTML = "";
    listPane = null; reportPane = null;
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
      MSWatchlist.render(listPane);
      renderReportPane();
      return;
    }

    if (state.showing === "report" && state.selectedSym) MSReport.render(rootEl, { sym: state.selectedSym });
    else MSWatchlist.render(rootEl);
    window.scrollTo(0, 0);
  }

  function go(route, params) {
    var sym = (params && params.sym) ? String(params.sym).trim().toUpperCase() : null;
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

    // 시드를 먼저 심어야 inWatchlist 판정이 첫 부팅에서도 맞는다(워치리스트 화면도 다시 부르지만 무해).
    MSStore.seedIfEmpty();
    var last = MSStore.getLastSym();
    if (inWatchlist(last)) state.selectedSym = last;
    // showing 은 건드리지 않는다 — 단일 모드 부팅에서 목록 대신 리포트로 떨어지면 당황스럽다.
    // 2단이면 selectedSym 만으로 오른쪽 칸이 채워진다.

    var mq = window.matchMedia(MSLayout.MODE_QUERY);
    dual = mq.matches;
    function onMode(e) { dual = e.matches; renderShell(); }
    if (mq.addEventListener) mq.addEventListener("change", onMode);
    else mq.addListener(onMode);   // 구형 WebView 폴백

    renderShell();
  });
})();
