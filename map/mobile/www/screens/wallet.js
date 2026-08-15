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
    el.appendChild(MSUi.el("span", "ms-pill-n", ""));
    if (onTap) el.addEventListener("click", onTap);
    refreshPills();
    return el;
  }

  // 차감이 일어난 화면에 필이 같이 떠 있으면(워치리스트의 스캔이 그렇다) 옛 잔량이 그대로 남는다.
  // 필을 각자 갱신하게 두면 잔량의 권위가 필 개수만큼 생긴다 — 문서에 떠 있는 필 전부를 한 번에
  // 칠한다. 2단에서 목록·리포트 두 칸에 필이 있어도 값이 갈리지 않는 이유다.
  // 문서를 훑는 일은 반드시 응답이 온 **뒤에** 한다. pill() 은 아직 append 되지 않은 요소를 들고
  // 이 함수를 부르는데, 호출 시점에 미리 세어보고 0이면 나가버리면 그 필은 영영 안 채워진다.
  // 응답이 오는 시점엔 호출부의 동기 append 가 이미 끝나 있어 그냥 찾으면 된다.
  function refreshPills() {
    MSWallet.get().then(function (r) {
      if (!r.ok || !r.state) return;
      var txt = fmt(r.state.balance);
      var live = document.querySelectorAll(".ms-pill");
      for (var i = 0; i < live.length; i++) {
        var n = live[i].querySelector(".ms-pill-n");
        if (!n) continue;
        n.textContent = txt;
        live[i].classList.remove("is-empty");
      }
    });
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

  // 로그인 완료를 기다리는 동안 브라우저를 열어두고 폴링한다. 딥링크(moneyscoop://)를 쓰면
  // AndroidManifest 인텐트 필터가 필요해 이 페이즈가 안드로이드 빌드에 묶인다 — 그 빌드는
  // 아직 안 돌았다.
  var POLL_MS = 2000, POLL_LIMIT = 300;   // 2초 × 300 = 10분(서버 논스 만료와 같다)

  // 광고 시청 뒤 잔량 폴링(Phase 8d). 로그인 폴링(위)과 달리 짧다 — SSV 콜백은 몇 초 안에 온다.
  // 낙관적으로 +1 을 그리지 않는다: SSV 가 안 오면 그린 값을 도로 내려야 하고, 그건 "준 걸
  // 뺏겼다"로 읽힌다(8b 원칙 — 클라이언트는 잔량을 계산하지 않는다. 이 태스크의 핵심).
  var AD_POLL_MS = 2000, AD_POLL_LIMIT = 5;   // 2초 × 5 = 10초

  // 세대 카운터 — render() 가 다시 불릴 때마다(재진입 네비게이션) 하나 늘린다. 이전 render() 의
  // startSignIn/poll 클로저는 자기 시작 시점의 세대를 들고 있다가, 매 콜백에서 지금 세대와
  // 비교해 다르면 곧바로 멈춘다. app.js 는 지갑 화면을 나갈 때 이 클로저에게 알릴 방법이
  // 없다(pane.innerHTML="" 로 DOM 만 지운다) — 세대가 유일한 신호다. 없으면 옛 폴링 루프가
  // detached 노드를 향해 10분까지 계속 authPoll() 을 부르고, 새 render() 는 그와 무관하게
  // 두 번째 로그인 플로우를 새로 시작해 둘이 같은 authMsg 자리를 두고 경합한다.
  var GEN = 0;

  function render(root) {
    GEN += 1;
    var myGen = GEN;
    // 한 render() 안에서 로그인 시도는 한 번에 하나뿐이다 — 응답 오기 전에 또 누르면
    // authStart 가 두 번 나가고, 각자 다른 nonce 로 브라우저를 두 번 열고, 각자의 poll() 이
    // 같은 authMsg 를 두고 경합한다(리뷰 실측).
    var signingIn = false;
    // auth-disabled·device-claimed 판정은 둘 다 render() 생애주기 동안 기억한다 — 매 draw()
    // 마다 signedIn() 만 보고 로그인 행을 새로 조립하면, 판정 이전에 짜인 그 조립 로직이 죽은
    // 버튼을 매번 되살린다. auth-disabled 에서 먼저 실측됐고(체크인·로그아웃처럼 draw() 를
    // 다시 부르는 아무 동작 후에나 재발해 그 라운드의 실행 테스트가 놓쳤다), device-claimed 는
    // 같은 결함을 그대로 물려받은 채 다음 리뷰까지 남아 있었다(2026-08-15) — 행만 지우고
    // 플래그를 안 세워서, 체크인 한 번이면 죽은 "Sign in" 버튼이 되살아났다.
    var authDisabled = false;
    var deviceClaimed = false;
    // draw() 가 마지막으로 그린 state — auth-disabled 판정처럼 draw() 밖(startSignIn)에서
    // 화면을 다시 그려야 할 때, 그 사이 값을 몰라 잔량을 지어내거나 지우지 않기 위해서다.
    var lastState = null;

    // 광고(Phase 8d) — render() 생애주기 동안 기억한다. adCfg/adSt 는 draw() 밖(비동기 응답)에서
    // 채워지므로 lastState 와 같은 이유로 여기 둔다. adBusy 는 signingIn 과 같은 역할(연타 방지) —
    // 광고는 한 render() 안에서 한 번에 하나만 돈다. adMsgEl 은 draw() 가 마지막으로 그린 상태
    // 메시지 자리를 가리킨다 — afterAd() 가 화면 전체를 다시 그리지 않고 이 자리만 갱신한다
    // (로그인 폴링의 authMsg 와 같은 요령).
    var adCfg = null, adSt = null, adBusy = false, showAdSettings = false, adMsgEl = null;

    // 표시용 쿨다운 힌트(서버는 이 값을 강제하지 않는다 — wallet-lib.php w_ad_next_at 주석).
    // nextAt 이 지났거나 파싱이 안 되면 0(쿨다운 없음)으로 본다.
    function cooldownMinutes(iso) {
      var t = Date.parse(iso);
      if (!isFinite(t)) return 0;
      var ms = t - Date.now();
      return ms > 0 ? Math.ceil(ms / 60000) : 0;
    }

    // 광고를 다 본 뒤의 잔량 폴링. authPoll 과 같은 규율 — 세대 가드(myGen !== GEN)로 재렌더
    // 시 고아 루프를 죽이고, adBusy 로 진행 중 연타를 막는다. 절대 여기서 잔량을 계산해 그리지
    // 않는다 — 서버가 준 state.balance 가 before 보다 커진 것을 **확인한 뒤에만** draw() 한다.
    function afterAd(before, n) {
      if (myGen !== GEN) return;
      if (n >= AD_POLL_LIMIT) {
        adBusy = false;
        if (adMsgEl) adMsgEl.textContent = MSStr.t.adPending;
        return;
      }
      MSWallet.get().then(function (r) {
        if (myGen !== GEN) return;
        if (r.ok && r.state && r.state.balance > before) {
          adBusy = false;
          refreshPills();   // 2단이면 옆 칸 헤더의 필이 옛 잔량을 들고 있다
          // remaining/nextAt 도 이 시청으로 바뀌었을 수 있다(쿨다운 시작) — 다시 읽어 함께 그린다.
          MSWallet.adState().then(function (s) {
            if (myGen !== GEN) return;
            if (s) adSt = s;
            draw(r.state, "");
          });
          return;
        }
        setTimeout(function () { afterAd(before, n + 1); }, AD_POLL_MS);
      });
    }

    // customData 를 여기서 만들거나 손대지 않는다 — MSAds.show(unit) 는 unit 키("quick"/"full")
    // 만 받고, 서버가 준 customData 는 MSAds.init() 이 기억해 뒀다가 그대로 SSV 요청에 싣는다
    // (계약 ①). 가공하는 순간 그 계정의 광고 보상이 전부 조용히 사라진다(wallet-ssv.php 정규식).
    function watchAd(unit) {
      if (adBusy || !adMsgEl) return;
      adBusy = true;
      adMsgEl.textContent = "";
      var before = lastState ? lastState.balance : 0;
      MSAds.show(unit).then(function (r) {
        if (myGen !== GEN) return;
        if (!r || !r.shown) {
          // consent-required·no-ssv·unavailable·failed — 이유를 그대로 노출하지 않되(내부
          // 사유라 무의미하다), 조용히 아무 일도 안 하는 버튼으로 남기지는 않는다(계약 ④).
          adBusy = false;
          if (adMsgEl) adMsgEl.textContent = MSStr.t.adFailed;
          return;
        }
        if (adMsgEl) adMsgEl.textContent = MSStr.t.adWaiting;
        afterAd(before, 0);
      });
    }

    // startSignIn/poll 은 draw() 를 부를 수 있어야 해서(로그인 완료 시 화면을 새로 그린다)
    // draw() 와 같은 render() 클로저 안에 둔다.
    function startSignIn(row, msg) {
      if (signingIn) return;
      signingIn = true;
      msg.textContent = MSStr.t.wSignInWaiting;
      MSWallet.authStart().then(function (r) {
        if (myGen !== GEN) return;   // 이 화면은 이미 떠났다 — 고아 콜백이 손댈 DOM 이 없다
        if (!r.ok) {
          signingIn = false;
          if (r.reason === "auth-disabled") {
            // 서버에 자격증명이 없다 — 오늘은 전 사용자의 기본 경험이다(forge_google_oauth.json
            // 미배포). 죽은 버튼 대신 안정된 안내로 통째로 다시 그린다 — authDisabled 를 세워
            // 두지 않으면 다음 draw()(체크인·로그아웃)가 이 버튼을 다시 그려 넣는다.
            authDisabled = true;
            draw(lastState, "");
            return;
          }
          msg.textContent = MSStr.t.wSignInFailed;
          return;
        }
        if (typeof window !== "undefined" && window.open) window.open(r.authUrl, "_blank");
        poll(r.nonce, 0, msg);
      });
    }

    function poll(nonce, n, msg) {
      if (myGen !== GEN) return;   // 재렌더로 고아가 된 루프 — 더 이상 부르지 않는다
      if (n >= POLL_LIMIT) { signingIn = false; msg.textContent = MSStr.t.wSignInFailed; return; }
      MSWallet.authPoll(nonce).then(function (r) {
        if (myGen !== GEN) return;
        if (r.ok && r.pending) { setTimeout(function () { poll(nonce, n + 1, msg); }, POLL_MS); return; }
        signingIn = false;
        if (!r.ok) {
          if (r.reason === "device-claimed") {
            // device-claimed 도 재시도해도 답이 안 바뀌는 종결 상태다 — auth-disabled 와 완전히
            // 같은 방식으로 다룬다: 판정을 기억하고 로그인 섹션 전체를 안정된 안내로 통째로
            // 다시 그린다. 행만 지우고 msg.textContent 만 채우면(이전 버전) 체크인처럼 draw() 를
            // 다시 부르는 아무 동작 뒤에 버튼이 되살아나고, wSignInHint/wWatchlistLocal 은 그
            // 죽은 버튼 없이도 처음부터 허공에 매달린다(2026-08-15 리뷰 실측).
            deviceClaimed = true;
            draw(lastState, "");
            return;
          }
          msg.textContent = MSStr.t.wSignInFailed;
          return;
        }
        // 버린 잔량이 있으면 반드시 말한다 — 안 말하면 "5개가 어디 갔냐"로 돌아온다.
        // r.state 는 서버가 이미 준 최신 잔량이라 여기서 다시 get() 을 부르지 않는다.
        draw(r.state, r.discarded > 0 ? MSStr.t.wMergeDiscarded.replace("{n}", String(r.discarded)) : "");
      });
    }

    function draw(state, msg) {
      lastState = state;
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
      // 광고 두 줄(Phase 8d). adCfg 가 ok 일 때만 그린다 — ad_units.json 이 없는 서버(ads-disabled)
      // 에선 줄 자체가 없다("Soon" 자리표시자를 남기지 않는다. 죽은 버튼보다 없는 편이 낫다).
      // adCfg/adSt 로딩 중엔 아직 아무 말도 하지 않는다 — 다음 draw() 가 채운다.
      adMsgEl = null;
      if (adCfg && adCfg.ok && adSt) {
        if (adSt.remaining === 0 && adSt.nextAt == null) {
          // remaining:0 + nextAt:null = 이 기기의 지갑이 구글 계정으로 넘어가 얼어붙었다 —
          // "오늘 8개를 다 썼다"가 아니다. 그 문구를 쓰면 병합된 사용자에게 "내일 다시 오라"고
          // 말하는 셈이라 거짓이다(계약 ②). wMerged 는 checkin() merged 사유와 같은 문구다.
          earn.appendChild(MSUi.el("div", "w-sub", MSStr.t.wMerged));
        } else if (adSt.remaining === 0) {
          // 일 상한을 다 썼다 — 줄을 숨기지 않고 문구로 바꾼다. 사라지면 앱이 고장난 줄 안다.
          earn.appendChild(MSUi.el("div", "w-sub", MSStr.t.adDailyDone));
        } else if (cooldownMinutes(adSt.nextAt) > 0) {
          // 낱개 시청 사이 쿨다운(표시용 힌트일 뿐 — 서버가 강제하지 않는다).
          earn.appendChild(MSUi.el("div", "w-sub", MSStr.t.adCooldown.replace("{m}", String(cooldownMinutes(adSt.nextAt)))));
        } else {
          earn.appendChild(earnRow(MSStr.t.adQuick, "", { note: MSStr.t.walQuickSub, onTap: function () { watchAd("quick"); } }));
          earn.appendChild(earnRow(MSStr.t.adFull, "", { note: MSStr.t.walFullSub, onTap: function () { watchAd("full"); } }));
          adMsgEl = MSUi.el("div", "w-sub");
          earn.appendChild(adMsgEl);
        }
      }
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
            // 잔량을 못 읽었을 땐(오프라인 등) "cap reached" 처럼 아무것도 안 되는 이유를 지어내지
            // 않는다 — "연결이 안 된다"고 사실대로 말한다(I-I). 단 merged 는 연결 문제가 아니다 —
            // 지갑이 구글 계정으로 넘어갔을 뿐이다. 둘을 같은 문구로 묶으면 "로그아웃했더니
            // 스쿱이 사라졌다"로 읽힌다(리뷰 실측: walUnavailable 을 쓰면 잔량이 0으로 보이는
            // 동시에 "연결을 확인하라"고 해서, 실제로는 옮겨졌을 뿐인 잔량을 잃어버린 것처럼 읽힌다).
            var note = r.ok ? (r.capped ? MSStr.t.walCapped : "")
              : (r.reason === "merged" ? MSStr.t.wMerged : MSStr.t.walUnavailable);
            draw(r.state, note);
            refreshPills();   // 2단이면 옆 칸 헤더의 필이 옛 잔량을 들고 있다
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

      // 구글 로그인 행(Phase 8c) — signedIn() 에 따라 로그인/로그아웃 하나만 뜬다.
      var authSec = MSUi.el("div", "wal-sec");
      if (authDisabled) {
        // 죽은 버튼 대신 안정된 안내 하나 — wSignInHint("재설치해도 스쿱을 지킨다")는 지금
        // 탭할 것이 없는데 남으면 허공에 뜬 약속이 된다(리뷰 실측: 힌트만 매달려 있었다).
        authSec.appendChild(MSUi.el("div", "w-sub", MSStr.t.wSignInUnavailable));
      } else if (deviceClaimed) {
        // auth-disabled 와 같은 이유로 행·힌트를 전부 걷어내고 안내 하나만 남긴다.
        authSec.appendChild(MSUi.el("div", "w-sub", MSStr.t.wDeviceClaimed));
      } else {
        var authRow = MSUi.el("button", "w-auth");
        authRow.type = "button";
        var authMsg = MSUi.el("div", "w-sub");
        if (MSWallet.signedIn()) {
          authRow.textContent = MSStr.t.wSignOut;
          authRow.addEventListener("click", function () {
            MSWallet.signOut();
            // state 를 재사용하지 않는다 — 로그아웃 직후엔 이 기기의 잔량이 무엇인지 다시
            // 물어야 한다(render() 맨 아래의 최초 로드와 같은 두 줄). 재사용하면 로그아웃
            // 후에도 옛 계정 잔량이 화면에 남고, canCheckin 도 옛 값 그대로라 눌러도 항상
            // 실패하는 출석 행이 남는다(리뷰 실측: get() 호출 0회, 잔량 12 고정, is-off=false).
            // 이 재조회가 K_TOK 갱신 부작용도 겸한다 — wallet-http.js 를 안 고쳐도 되는 이유는
            // 태스크 6 보고서 참고.
            draw(null, "");
            MSWallet.get().then(function (r) { draw(r.state, (!r.ok || !r.state) ? MSStr.t.walUnavailable : ""); });
          });
        } else {
          authRow.textContent = MSStr.t.wSignIn;
          authRow.addEventListener("click", function () { startSignIn(authRow, authMsg); });
        }
        authSec.appendChild(authRow);
        // 워치리스트가 로그인해도 안 따라온다는 것을 숨기지 않는다(설계서 "동기화 범위" 결정).
        authSec.appendChild(MSUi.el("div", "w-sub", MSStr.t.wSignInHint));
        authSec.appendChild(MSUi.el("div", "w-sub", MSStr.t.wWatchlistLocal));
        authSec.appendChild(authMsg);
      }
      scr.appendChild(authSec);

      // UMP 재열람 행(Phase 8d) — 설정 화면이 없어 지갑 화면에 둔다(SPEC §6). MSAds.consentNeeded()
      // 나 폼 존재 여부가 아니라 **privacyOptionsRequired() 로만** 켠다 — 그 필드가 정확히
      // "재열람 줄이 필요한 지역인가"를 말한다(EEA·영국·캐나다). consentNeeded 는 최초 동의
      // 흐름용이라 이미 동의를 마친 사용자에겐 계속 false 라 재열람 경로가 사라진다. 대상이
      // 아니면(한국 포함) 행 자체를 안 만든다 — 눌러도 아무 일 없는 행을 남기지 않는다(8c 의
      // auth-disabled 와 같은 판단).
      if (showAdSettings) {
        var settingsRow = MSUi.el("button", "w-auth", MSStr.t.adSettings);
        settingsRow.type = "button";
        settingsRow.addEventListener("click", function () { MSAds.showPrivacyOptions(); });
        scr.appendChild(settingsRow);
      }

      // 리워드 화폐 고지 — 스토어 심사가 보는 문구라 상시 표기한다(SPEC §6). 광고가 꺼져 있어도
      // (ads-disabled) 스쿱 자체는 체크인으로도 쌓이므로 이 고지는 조건 없이 항상 그린다.
      scr.appendChild(MSUi.el("div", "wal-legal", MSStr.t.walNoCashValue));

      root.appendChild(scr);
    }

    // 첫 draw(null, "") 는 "아직 로딩 중"이다 — 응답이 온 뒤에도 잔량이 없으면(!r.ok) 그건
    // "확인 불가"다. 게이지가 빈 잔량을 그려 "0개 보유"처럼 읽히지 않도록 메시지로 사실을 말한다
    // (I-I — wallet-http.js 는 오프라인에서 state:null 을 낼 뿐 0을 지어내지 않는데, 화면이
    // 그걸 다시 0처럼 그리면 클라이언트가 잔량을 지어낸 것과 같은 결과가 난다).
    draw(null, "");
    MSWallet.get().then(function (r) { draw(r.state, (!r.ok || !r.state) ? MSStr.t.walUnavailable : ""); });

    // 광고 설정(Phase 8d). adConfig 가 ok 일 때만 MSAds.init() 을 부르고, init() 이 만든 동의
    // 약속(consentReady)이 끝난 **뒤에** adState 와 privacyOptionsRequired() 를 잇따라 묻는다 —
    // privacyOptionsRequired() 를 init() 과 경합하는 별도 체인으로 두면, init() 이 아직 안
    // 끝난 순간(consentReady==null)에 먼저 풀려 항상 false 로 굳어버리고 이후 init() 이 진짜
    // 동의 상태를 알아내도 다시 묻지 않는 버그가 된다(실제로 이 태스크에서 한 번 그렇게 짰다가
    // 고쳤다) — 그래서 반드시 init() 뒤에 이어 붙인다.
    // 동의(UMP)가 첫 광고 요청보다 먼저 끝나는 것(계약 ①)은 ads.js 자체가 지킨다(watchAd() 의
    // MSAds.show() 가 consentReady 를 반드시 기다린다) — 여기서 init() 을 부르는 시점은
    // "언제 그 약속을 만드느냐"일 뿐이다.
    MSWallet.adConfig().then(function (r) {
      if (myGen !== GEN) return null;
      adCfg = r;
      if (!r.ok) { draw(lastState, ""); return null; }
      var initP = (typeof MSAds !== "undefined" && MSAds && MSAds.init) ? MSAds.init(r) : Promise.resolve(null);
      return initP.then(function () { return MSWallet.adState(); });
    }).then(function (r) {
      if (myGen !== GEN) return null;
      if (r) adSt = r;
      draw(lastState, "");
      return (typeof MSAds !== "undefined" && MSAds && MSAds.privacyOptionsRequired)
        ? MSAds.privacyOptionsRequired() : null;
    }).then(function (v) {
      if (myGen !== GEN || v == null) return;
      showAdSettings = !!v;
      draw(lastState, "");
    });
  }

  window.MSWalletScreen = { render: render, pill: pill, refreshPills: refreshPills };
})();
