// 단계 선택 바텀시트(시안 7a 가 "A bottom sheet" 로 명시).
// 차감 미리보기(5 → 2)는 표시 전용이다 — 실제 차감은 백엔드가 한다.
(function () {
  "use strict";

  function close() {
    var s = document.querySelector(".sheet-scrim");
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  function tierRow(key, name, desc, cost, opts) {
    var o = opts || {};
    var r = MSUi.el("button", "sheet-tier" + (o.on ? " on" : "") + (o.off ? " is-off" : ""));
    var left = MSUi.el("div", "sheet-tier-id");
    var nameRow = MSUi.el("div", "sheet-tier-name");
    nameRow.appendChild(MSUi.el("span", null, name));
    if (o.popular) nameRow.appendChild(MSUi.el("span", "sheet-pop", MSStr.t.tsPopular));
    left.appendChild(nameRow);
    left.appendChild(MSUi.el("div", "sheet-tier-desc", desc));
    r.appendChild(left);
    r.appendChild(MSUi.el("span", "sheet-preview", o.preview));
    if (!o.off && o.onPick) r.addEventListener("click", o.onPick);
    return r;
  }

  // opts = { tier, balance, onRun(tier) }
  function open(opts) {
    var o = opts || {}, picked = "full";
    var bal = (typeof o.balance === "number") ? o.balance : null;
    close();

    var scrim = MSUi.el("div", "sheet-scrim");
    scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });
    var sheet = MSUi.el("div", "sheet");

    function preview(cost) {
      // 표시 전용. 백엔드가 진짜 잔량을 돌려준다(SPEC §1).
      if (bal == null) return "";
      return bal + " → " + Math.max(0, bal - cost);
    }
    function paint() {
      sheet.innerHTML = "";
      sheet.appendChild(MSUi.el("div", "rp-sec-title", MSStr.t.tsTitle + (o.sym || "")));
      sheet.appendChild(tierRow("basic", MSStr.t.tsBasic, MSStr.t.tsBasicDesc, 0,
        { off: true, preview: MSStr.t.tsDone }));
      sheet.appendChild(tierRow("full", MSStr.t.tsFull, MSStr.t.tsFullDesc, MSWallet.COSTS.full,
        { on: picked === "full", popular: true, preview: preview(MSWallet.COSTS.full),
          onPick: function () { picked = "full"; paint(); } }));
      sheet.appendChild(tierRow("custom", MSStr.t.tsCustom, MSStr.t.tsCustomDesc, MSWallet.COSTS.custom,
        { off: true, preview: MSStr.t.tsSoon }));

      var cost = MSWallet.COSTS[picked];
      var run = MSUi.el("button", "btn btn-primary sheet-run", MSStr.t.tsRun + MSStr.t.tsFull + " · " + cost + MSStr.t.tsCost);
      var short = (bal != null && bal < cost);
      run.disabled = short;
      if (short) sheet.appendChild(MSUi.el("p", "sheet-short", MSStr.t.tsShort));
      run.addEventListener("click", function () {
        run.disabled = true; run.textContent = MSStr.t.tsRunning;
        if (o.onRun) o.onRun(picked);
      });
      sheet.appendChild(run);
    }
    paint();

    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
  }

  window.MSTierSheet = { open: open, close: close };
})();
