// 지갑 화면 + 스쿱 필. 잔량·스트릭은 전부 백엔드가 준 state 를 그대로 그린다 —
// 클라이언트가 계산하지 않는다(SPEC-economy.md §1).
(function () {
  "use strict";

  function fmt(n) { return (typeof n === "number" && isFinite(n)) ? String(n) : ""; }

  // 필은 비동기로 채워진다 — get() 이 오기 전엔 빈칸이다. 지금은 로컬이라 즉시지만 8b 에선 네트워크다.
  function pill(onTap) {
    var el = MSUi.el("button", "ms-pill is-empty");
    el.setAttribute("aria-label", MSStr.t.walTitle);
    el.appendChild(MSUi.el("span", "ms-pill-ico", "◆"));
    var num = MSUi.el("span", "ms-pill-n", "");
    el.appendChild(num);
    if (onTap) el.addEventListener("click", onTap);
    MSWallet.get().then(function (r) {
      if (!r.ok || !r.state) return;
      num.textContent = fmt(r.state.balance);
      el.classList.remove("is-empty");
    });
    return el;
  }

  function row(label, amt, opts) {
    var o = opts || {};
    var r = MSUi.el("div", "wal-row" + (o.off ? " is-off" : ""));
    r.appendChild(MSUi.el("span", "wal-row-name", label));
    if (o.note) r.appendChild(MSUi.el("span", "wal-row-note", o.note));
    r.appendChild(MSUi.el("span", "wal-row-amt", amt));
    if (o.onTap && !o.off) r.addEventListener("click", o.onTap);
    return r;
  }

  function render(root) {
    function draw(state, msg) {
      root.innerHTML = "";
      var scr = MSUi.el("div", "scr");

      var head = MSUi.el("div", "wal-head");
      var back = MSUi.el("button", "rp-back");
      back.setAttribute("aria-label", MSStr.t.walBack);
      back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';
      back.addEventListener("click", function () { MSApp.go("watchlist"); });
      head.appendChild(back);
      head.appendChild(MSUi.el("span", "overline", MSStr.t.walTitle));
      if (state) head.appendChild(MSUi.el("span", "wal-cap", MSStr.t.walCap + state.cap));
      scr.appendChild(head);

      scr.appendChild(MSUi.el("div", "wal-balance", state ? fmt(state.balance) : ""));
      if (msg) scr.appendChild(MSUi.el("div", "wal-msg", msg));

      var earn = MSUi.el("div", "wal-sec");
      earn.appendChild(MSUi.el("div", "rp-sec-title", MSStr.t.walEarn));
      earn.appendChild(row(MSStr.t.walQuick, "+1", { off: true, note: MSStr.t.walSoon }));
      earn.appendChild(row(MSStr.t.walFull, "+3", { off: true, note: MSStr.t.walSoon }));
      var can = !!(state && state.canCheckin);
      earn.appendChild(row(MSStr.t.walCheckin, "+1", {
        off: !can, note: can ? "" : MSStr.t.walCheckedIn,
        onTap: function () {
          MSWallet.checkin().then(function (r) {
            draw(r.state, r.ok ? (MSStr.t.walDay + r.state.streakDays + (r.capped ? MSStr.t.walCapped : "")) : "");
          });
        }
      }));
      var away = state ? (7 - (state.streakDays % 7)) : 0;
      earn.appendChild(row(MSStr.t.walChest, "+5", { off: true, note: state ? (away + MSStr.t.walChestAway) : "" }));
      scr.appendChild(earn);

      var spend = MSUi.el("div", "wal-sec");
      spend.appendChild(MSUi.el("div", "rp-sec-title", MSStr.t.walSpend));
      spend.appendChild(row(MSStr.t.walSlot, String(MSWallet.COSTS.slot), {}));
      spend.appendChild(row(MSStr.t.walDeep, String(MSWallet.COSTS.full), {}));
      spend.appendChild(row(MSStr.t.walOptimiser, String(MSWallet.COSTS.custom), {}));
      scr.appendChild(spend);

      root.appendChild(scr);
    }

    draw(null, "");
    MSWallet.get().then(function (r) { draw(r.state, ""); });
  }

  window.MSWalletScreen = { render: render, pill: pill };
})();
