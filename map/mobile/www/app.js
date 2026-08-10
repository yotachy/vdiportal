// 라우팅 — 화면 둘뿐이라 히스토리 API 대신 상태 하나로 충분하다.
(function () {
  "use strict";
  var state = { route: "watchlist", params: {} };
  var rootEl = null;

  function render() {
    rootEl.innerHTML = "";
    if (state.route === "report" && window.MSReport) MSReport.render(rootEl, state.params);
    else MSWatchlist.render(rootEl);
    window.scrollTo(0, 0);
  }
  function go(route, params) { state.route = route; state.params = params || {}; render(); }

  window.MSApp = { go: go, current: function () { return { route: state.route, params: state.params }; } };

  document.addEventListener("DOMContentLoaded", function () {
    rootEl = document.getElementById("app");
    if (typeof ForgeCore === "undefined") {
      rootEl.innerHTML = "<p class='empty'>vendor/forge-core.js 를 불러오지 못했습니다.<br>npm run sync 후 다시 여세요.</p>";
      return;
    }
    render();
  });
})();
