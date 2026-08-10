// Task 10 이 교체한다.
(function () {
  "use strict";
  window.MSReport = { render: function (root, params) {
    var p = document.createElement("p"); p.className = "empty";
    p.textContent = (params && params.sym ? params.sym + " " : "") + "리포트는 Task 10 에서 구현합니다.";
    var b = document.createElement("button"); b.className = "btn btn-ghost"; b.textContent = "워치리스트로";
    b.addEventListener("click", function () { MSApp.go("watchlist"); });
    root.appendChild(p); root.appendChild(b);
  } };
})();
