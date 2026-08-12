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

  // Earn 행(시안 2c): 2줄(제목 + 부제) · 금액 · 우측 액세서리(광고=Watch 버튼, 출석=스트릭 도트).
  // 금액 색은 시안이 쓰는 규칙 그대로 — **지금 받을 수 있으면 골드, 아니면 muted**(2c 의 보물상자가 muted).
  function earnRow(label, amt, opts) {
    var o = opts || {};
    var r = MSUi.el("div", "wal-row" + (o.off ? " is-off" : ""));
    var main = MSUi.el("div", "wal-row-main");
    main.appendChild(MSUi.el("div", "wal-row-name", label));
    if (o.note) main.appendChild(MSUi.el("div", "wal-row-note", o.note));
    r.appendChild(main);
    r.appendChild(MSUi.el("span", "wal-row-amt" + (o.off ? " is-dim" : ""), amt));
    if (o.action) {
      var b = MSUi.el("button", "wal-act" + (o.primary ? " is-primary" : ""), o.action);
      if (o.off) b.disabled = true;
      else if (o.onTap) b.addEventListener("click", o.onTap);
      r.appendChild(b);
    } else if (o.dots) {
      r.appendChild(o.dots);
    }
    // "one tap" — 시안의 출석 행은 버튼이 아니라 행 전체가 탭 타깃이다.
    if (o.onTap && !o.action && !o.off) {
      r.classList.add("is-tappable");
      r.addEventListener("click", o.onTap);
    }
    return r;
  }

  // 7일 스트릭 도트(시안 2c). 이번 주에 채운 날만 골드다 — 주 경계는 서버가 준 streakDays 로만 판단한다.
  function streakDots(state) {
    var wrap = MSUi.el("div", "wal-dots");
    var done = state ? (state.streakDays % 7) : 0;
    if (state && state.streakDays > 0 && done === 0) done = 7;   // 정확히 7일째면 한 주를 다 채운 것이다
    for (var i = 0; i < 7; i++) wrap.appendChild(MSUi.el("span", "wal-sdot" + (i < done ? " is-on" : "")));
    return wrap;
  }

  // Spend 행(시안 2c): 부제 없는 한 줄 가격표. Earn 보다 촘촘하고 골드를 쓰지 않는다.
  function spendRow(label, cost) {
    var r = MSUi.el("div", "wal-prow");
    r.appendChild(MSUi.el("span", "wal-prow-name", label));
    r.appendChild(MSUi.el("span", "wal-prow-cost", cost));
    return r;
  }

  // 잔량 대비 한도 게이지(시안 2c). 폭은 flex 비율로 준다 — 백분율을 계산해 문자열로 만들면
  // 클라이언트가 잔량을 가공하는 셈이 되고, flex 비율은 두 값을 그대로 넘기는 것이라 그렇지 않다.
  function gauge(state) {
    var g = MSUi.el("div", "wal-gauge");
    var have = state ? state.balance : 0;
    var rest = state ? Math.max(0, state.cap - state.balance) : 1;
    var on = MSUi.el("div", "wal-gauge-on");
    var off = MSUi.el("div", "wal-gauge-off");
    on.style.flex = String(have);
    off.style.flex = String(rest);
    g.appendChild(on);
    g.appendChild(off);
    return g;
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
      head.appendChild(MSUi.el("span", "wal-title", MSStr.t.walTitle));
      if (state) head.appendChild(MSUi.el("span", "wal-cap", MSStr.t.walCap + state.cap));
      scr.appendChild(head);

      // 시안 2c 의 잔량 블록: 금색 링 도트 + 큰 숫자 + "in wallet". 재화라 골드다.
      var bal = MSUi.el("div", "wal-bal");
      bal.appendChild(MSUi.el("span", "wal-dot"));
      bal.appendChild(MSUi.el("span", "wal-balance", state ? fmt(state.balance) : ""));
      if (state) bal.appendChild(MSUi.el("span", "wal-bal-unit", MSStr.t.walInWallet));
      scr.appendChild(bal);
      scr.appendChild(gauge(state));
      if (msg) scr.appendChild(MSUi.el("div", "wal-msg", msg));

      var earn = MSUi.el("div", "wal-sec");
      earn.appendChild(MSUi.el("div", "overline", MSStr.t.walEarn));
      // 광고는 8d(AdMob SSV) 전까지 못 준다 — 시안의 Watch 버튼 자리를 지키되 라벨로 사실을 말한다.
      earn.appendChild(earnRow(MSStr.t.walQuick, "+1", { off: true, note: MSStr.t.walQuickSub, action: MSStr.t.walSoon }));
      earn.appendChild(earnRow(MSStr.t.walFull, "+3", { off: true, note: MSStr.t.walFullSub, action: MSStr.t.walSoon, primary: true }));
      var can = !!(state && state.canCheckin);
      // state 가 없으면 잔량을 못 읽은 것이다 — '오늘 받았다'가 아니라 '확인 불가'다.
      // 행은 비활성으로 두되 아무 말도 하지 않는다(거짓 안내를 만들지 않는다).
      earn.appendChild(earnRow(MSStr.t.walCheckin, "+1", {
        off: !can,
        // 시안은 "Day 4 · one tap, once a day". 한 번도 안 받았으면 "Day 0" 이 아니라 앞머리를 뗀다.
        note: !state ? "" : (state.streakDays > 0
          ? (MSStr.t.walDay + state.streakDays + MSStr.t.walClaimedSep + (can ? MSStr.t.walOnceADay : MSStr.t.walCheckedIn))
          : MSStr.t.walOnceADayCap),
        dots: state ? streakDots(state) : null,
        onTap: function () {
          MSWallet.checkin().then(function (r) {
            draw(r.state, (r.ok && r.capped) ? MSStr.t.walCapped : "");
          });
        }
      }));
      var away = state ? (7 - (state.streakDays % 7)) : 0;
      earn.appendChild(earnRow(MSStr.t.walChest, "+5", { off: true, note: state ? (away + MSStr.t.walChestAway) : "" }));
      scr.appendChild(earn);

      // 시안 2c 의 Spend 목록 4행 그대로. scan 은 시안이 2스쿱이라 적었지만 현재 코드는 무료라
      // 코드가 하는 대로 적는다 — 가격표가 실제 차감과 어긋나는 쪽이 더 나쁘다(가격 결정은 별건).
      var spend = MSUi.el("div", "wal-sec");
      spend.appendChild(MSUi.el("div", "overline", MSStr.t.walSpend));
      spend.appendChild(spendRow(MSStr.t.walSlot, String(MSWallet.COSTS.slot)));
      spend.appendChild(spendRow(MSStr.t.walScan, MSWallet.COSTS.scan ? String(MSWallet.COSTS.scan) : MSStr.t.walFree));
      spend.appendChild(spendRow(MSStr.t.walDeep, String(MSWallet.COSTS.full)));
      spend.appendChild(spendRow(MSStr.t.walOptimiser, String(MSWallet.COSTS.custom)));
      scr.appendChild(spend);

      root.appendChild(scr);
    }

    draw(null, "");
    MSWallet.get().then(function (r) { draw(r.state, ""); });
  }

  window.MSWalletScreen = { render: render, pill: pill };
})();
