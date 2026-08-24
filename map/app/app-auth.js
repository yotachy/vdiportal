/* 머니스쿱 앱 — 계정(구글 연결)·동기화(P8). 서버 흐름은 지갑 인증 재사용:
   auth_start(논스 발급) → 브라우저로 wallet-auth.php(구글 OAuth) → auth_poll(병합 w_merge
   + 게스트 상태 즉시 sync_put — 닉네임 생성 포함). 스쿱 병합·닉네임·상태 병합 규칙은 전부
   서버가 정본(app-sync-lib) — 클라는 결과를 받아 로컬을 덮는다.
   게스트는 서버 동기화 없음(로그아웃 문구 그대로: "기록은 이 기기에만 남습니다").
   dev: ?fixture=1 이면 실 OAuth 대신 즉시 링크 스텁(프로토 gLogin 1.1s 데모와 같은 정신 —
   로컬 PHP 는 curl 확장이 없어 토큰 교환 불가. P9 제거 목록 아님·fixture 가드 안에만 존재). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const isFixture = /[?&]fixture=1/.test(window.location.search);
  let polling = null;
  let syncTimer = null;
  let busy = false;

  // 서버로 보내는 동기화 스냅샷 — 지갑(스쿱·출석)과 분석 캐시는 각 정본이 있어 싣지 않는다
  function syncState() {
    const s = MS.store.get();
    return { xp: s.xp, personaIdx: s.personaIdx, personaAns: s.personaAns,
      sigRead: s.sigRead, picks: s.picks, theme: s.theme, fontZoom: s.fontZoom,
      notiOff: s.notiOff, xpSeen: s.xpSeen };
  }

  // 서버 병합 결과(정본)를 로컬에 적용
  function applyState(st, nick) {
    const patch = {};
    if (!st) { if (nick) MS.store.set({ nick: nick }); return; }
    ["xp", "personaIdx", "personaAns", "sigRead", "picks"].forEach(function (k) {
      if (st[k] !== undefined) patch[k] = st[k];
    });
    if (nick) patch.nick = nick;
    MS.store.set(patch);
  }

  function movedCount() {   // 프로토 gLogin 문구의 N — 분석 + 페르소나 답
    const s = MS.store.get();
    return Object.keys(s.analyzed || {}).length + (s.personaAns || []).length;
  }

  function finishLink(nick, state, walletBal) {
    const patch = { gLinked: 1, gBusy: 0 };
    if (typeof walletBal === "number") patch.scoops = walletBal;
    MS.store.set(patch);
    applyState(state, nick);
    MS.ui.hap("done");
    const mv = movedCount();
    const who = nick ? nick + " 님, " : "";
    MS.ui.flash(mv > 0 ? (who + "연결됐어요. 게스트 기록 " + mv + "건을 계정으로 옮겼어요")
      : (who + "구글 계정과 연결됐어요. 기록이 백업됩니다"), "");
    if (MS.wallet && !isFixture) MS.wallet.state();   // 병합 후 잔액·환급 재동기화(스텁은 서버 무관)
  }

  function stopPoll() { if (polling) { clearInterval(polling); polling = null; } }

  function start() {
    const s = MS.store.get();
    if (s.gLinked || busy) return;
    busy = true;
    MS.store.set({ gBusy: 1 });
    MS.ui.hap("tick");
    MS.ui.flash("구글 계정에 연결하는 중…", "");
    if (isFixture) {   // dev 스텁 — 실 서버 없이 여정 검증
      setTimeout(function () { busy = false; finishLink("테스트순례자", null, null); }, 1100);
      return;
    }
    MS.data.api("auth_start", {}).then(function (r) {
      if (!r || !r.ok) {
        busy = false;
        MS.store.set({ gBusy: 0 });
        MS.ui.flash(r && r.error === "auth-disabled" ? "로그인은 준비 중이에요 — 곧 열려요" : "연결을 시작하지 못했어요", "");
        return;
      }
      window.open(r.authUrl, "_blank");
      let tries = 0;
      stopPoll();
      polling = setInterval(function () {
        tries++;
        if (tries > 120) { stopPoll(); busy = false; MS.store.set({ gBusy: 0 }); return; }
        MS.data.api("auth_poll", { nonce: r.nonce, state: syncState() }).then(function (p) {
          if (p && p.ok && p.pending) return;
          stopPoll();
          busy = false;
          if (p && p.ok && p.linked) {
            finishLink(p.nick, p.state, p.wallet ? p.wallet.balance : null);
          } else {
            MS.store.set({ gBusy: 0 });
            MS.ui.flash(p && p.error === "device-claimed"
              ? "이 기기는 이미 다른 구글 계정과 연결돼 있어요" : "로그인이 완료되지 않았어요 — 다시 시도해 주세요", "");
          }
        }).catch(function () {});
      }, 2500);
    }).catch(function () {
      busy = false;
      MS.store.set({ gBusy: 0 });
      MS.ui.flash("연결을 시작하지 못했어요", "");
    });
  }

  function logout() {
    stopPoll();
    MS.store.set({ gLinked: 0, nick: null, gBusy: 0 });
    MS.ui.flash("로그아웃했어요. 기록은 이 기기에만 남습니다", "");
  }

  function withdraw() {
    const done = function () {
      try { MS.state.browserIO().clear(); } catch (e) {}
      window.location.reload();
    };
    if (isFixture) { done(); return; }
    return MS.data.api("withdraw", {}).then(function (r) {
      if (r && r.ok) { done(); return true; }
      MS.ui.flash("탈퇴 처리에 실패했어요 — 잠시 후 다시 시도해 주세요", "");
      return false;
    }).catch(function () { MS.ui.flash("탈퇴 처리에 실패했어요 — 잠시 후 다시 시도해 주세요", ""); return false; });
  }

  // 변경 디바운스 푸시(연결된 기기만) — 서버가 병합 정본이라 결과로 로컬을 되덮는다
  function syncSoon() {
    if (!MS.store.get().gLinked || isFixture) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      MS.data.api("sync_push", { state: syncState() }).then(function (r) {
        if (r && r.ok) applyState(r.state, r.nick);
      }).catch(function () {});
    }, 3000);
  }

  const SYNC_KEYS = ["xp", "personaAns", "personaIdx", "sigRead", "picks", "theme", "fontZoom", "notiOff"];
  function init() {
    MS.store.subscribe(function (keys) {
      if (!keys) return;
      for (let i = 0; i < SYNC_KEYS.length; i++) {
        if (keys.indexOf(SYNC_KEYS[i]) >= 0) { syncSoon(); return; }
      }
    });
    // 부팅 시 연결 기기는 pull 로 다른 기기 진행분을 받는다(push 는 변경 훅이 처리)
    if (MS.store.get().gLinked && !isFixture) {
      MS.data.api("sync_pull", {}).then(function (r) {
        if (r && r.ok && r.state) applyState(r.state, r.nick);
      }).catch(function () {});
    }
  }

  MS.auth = { start: start, logout: logout, withdraw: withdraw, syncSoon: syncSoon, init: init, stub: isFixture };
})();
