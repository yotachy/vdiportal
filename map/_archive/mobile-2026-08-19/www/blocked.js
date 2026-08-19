// 막히는 상태 7종(시안 12c). 사용자가 하려던 일을 못 하게 되는 모든 순간이 여기로 온다.
//
// 이 파일이 존재하는 이유는 카드 일곱 장이 아니라 **공통 규칙 셋**이다(인벤토리 §4 원문):
//  ① 막다른 골목 금지 — 일곱 장 전부에 "지금 할 수 있는 다른 행동"이 버튼으로 붙는다.
//  ② 불리한 사실은 행동 **전에** 먼저 말한다("지금 광고를 보면 2개는 버려집니다").
//     광고 후 고지는 고지가 아니다.
//  ③ 못 준 값은 안 받는다(판정 없음 = 미차감, 실패 = 환급). **단 확인 못 했으면 확인했다고
//     하지 않는다** — 그래서 실패가 두 장이다.
// 규칙을 카드마다 손으로 지키면 여덟 번째 카드에서 깨진다. 선언으로 두고 관문이 대조한다.
//
// 서버 진실은 이미 다 있다(wallet-lib.php): 쿨다운 w_ad_next_at(120초·표시 힌트) ·
// 일 상한 W_AD_DAILY=8 + reason:"daily-cap" · 지갑 상한 W_CAP=20 + capped ·
// 환급 확정 3종 vs 대기 큐(ms_pending_refunds). **화면이 그 구분을 못 따라가고 있었을 뿐이다.**
(function () {
  "use strict";

  // 카드 선언. text 는 데이터로 채워지므로 함수다.
  // actions: [{ label, kind }] — kind 는 호출부가 붙일 동작 이름이다(여기서 동작을 정하지 않는다).
  var CARDS = {
    // ① 잔량 부족 — 시트 안에서 광고로 전환한다(지갑으로 보내지 않는다).
    short: {
      badge: function () { return MSStr.t.blShortBadge; },
      head: function (d) { return (d.need - d.have) + MSStr.t.blShortHead; },
      body: function (d) { return MSStr.t.blShortBodyA + d.need + MSStr.t.blShortBodyB + d.have; },
      actions: [{ kind: "watch-ad", label: function () { return MSStr.t.blWatchAd; } },
                { kind: "later", label: function () { return MSStr.t.blLater; } }]
    },
    // ② 쿨다운 — 서버 시간 기준. 기다리는 동안 할 수 있는 일을 준다.
    cooldown: {
      badge: function () { return MSStr.t.blCooldownBadge; },
      head: function (d) { return fmtLeft(d.secondsLeft) + MSStr.t.blCooldownHead; },
      body: function () { return MSStr.t.blCooldownBody; },
      progress: function (d) { return 1 - Math.max(0, Math.min(1, d.secondsLeft / d.windowSeconds)); },
      actions: [{ kind: "basic-first", label: function () { return MSStr.t.blBasicFirst; } }]
    },
    // ③ 일 상한 — 광고는 끝났지만 출석은 남아 있다.
    dailyCap: {
      badge: function () { return MSStr.t.blDailyBadge; },
      head: function () { return MSStr.t.blDailyHead; },
      body: function () { return MSStr.t.blDailyBody; },
      actions: [{ kind: "checkin", label: function () { return MSStr.t.blCheckin; } }]
    },
    // ④ 지갑 상한 — 규칙 ②의 본보기. 버려질 개수를 **광고 전에** 말한다.
    walletCap: {
      badge: function () { return MSStr.t.blCapBadge; },
      head: function () { return MSStr.t.blCapHead; },
      body: function (d) {
        return MSStr.t.blCapBodyA + d.balance + MSStr.t.blCapBodyB + d.cap +
               MSStr.t.blCapBodyC + Math.max(0, d.balance + d.grant - d.cap) + MSStr.t.blCapBodyD;
      },
      progress: function (d) { return Math.max(0, Math.min(1, d.balance / d.cap)); },
      warnBeforeAction: true,
      actions: [{ kind: "spend-first", label: function () { return MSStr.t.blSpendFirst; } }]
    },
    // ⑤ 판정 없음 — 규칙 ③. 억지로 한쪽을 고르지 않고, 안 받았다고 말한다.
    noVerdict: {
      badge: function () { return MSStr.t.blNoVerdictBadge; },
      head: function () { return MSStr.t.blNoVerdictHead; },
      body: function (d) {
        return d.total + MSStr.t.blNoVerdictBodyA + d.up + MSStr.t.blNoVerdictBodyB + d.down +
               MSStr.t.blNoVerdictBodyC;
      },
      actions: [{ kind: "why-split", label: function () { return MSStr.t.blWhySplit; } }]
    },
    // ⑥ 계산 실패 · 환급 **확인됨**
    failedRefunded: {
      badge: function () { return MSStr.t.blFailBadge; },
      head: function () { return MSStr.t.blFailHead; },
      body: function (d) { return MSStr.t.blFailBodyA + d.refunded + MSStr.t.blFailBodyB + d.balance; },
      actions: [{ kind: "retry", label: function () { return MSStr.t.blRetry; } }]
    },
    // ⑦ 계산 실패 · 환급 **확인 불가** — ⑥과 다른 카드인 것이 이 목록의 요점이다.
    // [리뷰 I2, 2026-08-19] badge/head/body 가 d.badge/d.head/d.body 를 받으면 그것을 우선한다
    // — report.js 가 unauthorized·merged 처럼 "계산 실패·환급 불확실"이 아닌 사유(서버가
    // 정상 응답했고, 그저 spend 자체를 시작 못 한 경우)를 같은 카드(같은 버튼 둘)로 보내되
    // 문구만 사실에 맞게 갈아 끼우기 위해서다. 오버라이드가 없으면(기존 호출부 전부) 원래
    // 문구 그대로다 — 하위 호환.
    failedUnknown: {
      badge: function (d) { return (d && d.badge) || MSStr.t.blFailUnknownBadge; },
      head: function (d) { return (d && d.head) || MSStr.t.blFailUnknownHead; },
      body: function (d) { return (d && d.body) || MSStr.t.blFailUnknownBody; },
      actions: [{ kind: "open-wallet", label: function () { return MSStr.t.blOpenWallet; } },
                { kind: "retry", label: function () { return MSStr.t.blRetry; } }]
    }
  };

  var KINDS = ["short", "cooldown", "dailyCap", "walletCap", "noVerdict", "failedRefunded", "failedUnknown"];

  function fmtLeft(sec) {
    var s = Math.max(0, Math.round(sec));
    var m = Math.floor(s / 60);
    return m > 0 ? (m + MSStr.t.blMin + (s % 60) + MSStr.t.blSec) : (s + MSStr.t.blSec);
  }

  function close() {
    var s = document.querySelector(".bl-scrim");
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  // opts = { kind, data, onAction(kind) }
  function render(kind, data, onAction) {
    var spec = CARDS[kind];
    if (!spec) return null;
    var d = data || {};
    var card = MSUi.el("div", "bl-card");
    card.setAttribute("data-blocked", kind);
    card.appendChild(MSUi.el("div", "bl-badge", spec.badge(d)));
    card.appendChild(MSUi.el("h2", "bl-head", spec.head(d)));
    card.appendChild(MSUi.el("p", "bl-body", spec.body(d)));
    if (spec.progress) {
      var track = MSUi.el("div", "bl-track");
      var fill = MSUi.el("div", "bl-fill");
      fill.style.width = Math.round(spec.progress(d) * 100) + "%";
      track.appendChild(fill);
      card.appendChild(track);
    }
    var acts = MSUi.el("div", "bl-actions");
    spec.actions.forEach(function (a, i) {
      var b = MSUi.el("button", "bl-btn" + (i === 0 ? " bl-primary" : ""), a.label(d));
      b.setAttribute("data-action", a.kind);
      b.addEventListener("click", function () { if (onAction) onAction(a.kind); });
      acts.appendChild(b);
    });
    card.appendChild(acts);
    return card;
  }

  function open(opts) {
    var o = opts || {};
    close();
    var card = render(o.kind, o.data, function (k) {
      if (k === "later") { close(); return; }
      close();
      if (o.onAction) o.onAction(k);
    });
    if (!card) return;
    var scrim = MSUi.el("div", "bl-scrim");
    scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });
    var sheet = MSUi.el("div", "bl-sheet");
    sheet.appendChild(card);
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
  }

  window.MSBlocked = { CARDS: CARDS, KINDS: KINDS, render: render, open: open, close: close, fmtLeft: fmtLeft };
})();
