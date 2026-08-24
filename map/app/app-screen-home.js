/* 머니스쿱 앱 — 홈 화면(P0: 골격 검증용 최소 구성 — P1 이 시안 전체 구성으로 교체).
   헤더행 + 빈 상태 카드. 카피는 strings 경유, 색은 토큰. */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;

  function mount(host, ctx) {
    host.innerHTML =
      '<div style="padding:14px 16px 90px">' +
      '<div style="display:flex;align-items:baseline;gap:8px;animation:msRevealUp 0.4s ease both">' +
      '<span style="font-size:19px;font-weight:700;letter-spacing:-0.03em">' + str("home.todayTitle") + "</span>" +
      "</div>" +
      '<div style="margin-top:14px;border-radius:14px;background:var(--sf1);border:1px solid var(--ln0);' +
      'padding:28px 20px;text-align:center;animation:msRevealUp 0.4s ease 0.06s both">' +
      '<div style="font-size:14.5px;font-weight:700">' + str("home.emptyTitle") + "</div>" +
      '<div style="margin-top:8px;font-size:12.5px;color:var(--t2);line-height:1.7">' + str("home.emptyDesc") + "</div>" +
      '<button class="ms-press" data-act="pick" style="margin-top:16px;min-height:44px;padding:0 22px;border-radius:12px;' +
      'border:0;background:linear-gradient(135deg,#7b6cff,#4a3ce0);color:#fff;font-family:inherit;' +
      'font-size:13.5px;font-weight:700;letter-spacing:inherit;cursor:pointer">' + str("home.emptyCta") + "</button>" +
      "</div></div>";
    host.addEventListener("click", function (e) {
      const btn = e.target.closest('[data-act="pick"]');
      if (btn) MS.ui.flash(str("toast.comingSoon"), "");   // P1: 종목 선택(pick)으로 교체
    });
  }

  MS.router.register("home", { mount: mount });
})();
