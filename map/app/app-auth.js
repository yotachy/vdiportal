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
  const isFixture = !!(MS.data && MS.data.devMode);   // 로컬 호스트 + ?fixture=1 에서만(app-data 게이트)
  let polling = null;
  let syncTimer = null;
  let busy = false;

  // 서버로 보내는 동기화 스냅샷 — 지갑(스쿱·출석)과 분석 캐시는 각 정본이 있어 싣지 않는다
  function syncState() {
    const s = MS.store.get();
    return { xp: s.xp, personaIdx: s.personaIdx, personaAns: s.personaAns,
      // 파생 성향(통계 집계용) — 서버에 DIM_GROUP 복제 대신 클라가 계산해 실어 보낸다(드리프트 0)
      personaGroups: (MS.persona ? MS.persona.groupWeights(s.personaAns || []) : null),
      weights: s.weights || null,   // 커스텀 슬라이더(통계 '가중치 인기' 집계용)
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

  // 앱에 보이는 이름 = 구글 계정 이름(사용자 지시 2026-08-29). 닉네임은 리더보드 공개용으로만 남긴다.
  function displayName() { const s = MS.store.get(); return s.gName || s.nick || null; }
  function finishLink(nick, state, walletBal, gname) {
    const patch = { gLinked: 1, gBusy: 0 };
    if (gname) patch.gName = gname;
    if (typeof walletBal === "number") patch.scoops = walletBal;
    MS.store.set(patch);
    applyState(state, nick);
    MS.ui.hap("done");
    const mv = movedCount();
    const who = (gname || nick) ? (gname || nick) + " 님, " : "";
    MS.ui.flash(mv > 0 ? (who + "연결됐어요. 게스트 기록 " + mv + "건을 계정으로 옮겼어요")
      : (who + "구글 계정과 연결됐어요. 기록이 백업됩니다"), "");
    if (MS.wallet && !isFixture) MS.wallet.state();   // 병합 후 잔액·환급 재동기화(스텁은 서버 무관)
  }

  function stopPoll() { if (polling) { clearInterval(polling); polling = null; } }

  // ── 대기 중인 논스를 영속화한다(2026-08-28 버그 수정) ──────────────────────────
  // 왜: 논스가 setInterval 클로저에만 있어서, 구글 탭에 가 있는 동안 앱 페이지가 새로고침되거나
  // (모바일에선 흔히) 폐기되면 폴링이 통째로 사라졌다. 서버엔 로그인이 완료돼 있는데 앱은
  // 영영 못 집는다 — 사용자에겐 "You are signed in. Return to the app" 만 보이고 끝난다.
  // 논스 TTL 은 서버가 600초(W_NONCE_TTL_SEC)다 — 같은 창을 클라도 쓴다.
  const PENDING_KEY = "ms_auth_pending", PENDING_TTL_MS = 600000;
  // 로그인 진단 로그(최근 30건, localStorage) — 간헐 실패를 코드 추측이 아니라 사실로 받기 위해.
  // 콘솔에서 MS.auth.trace() 로 읽는다. 시크릿·토큰은 절대 넣지 않는다(논스 앞 6자만).
  const TRACE_KEY = "ms_auth_log";
  function trace(ev, extra) {
    try {
      const arr = JSON.parse(localStorage.getItem(TRACE_KEY) || "[]");
      arr.push({ t: new Date().toISOString().slice(11, 19), ev: ev, x: extra || null });
      while (arr.length > 30) arr.shift();
      localStorage.setItem(TRACE_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  function readTrace() { try { return JSON.parse(localStorage.getItem(TRACE_KEY) || "[]"); } catch (e) { return []; } }
  function savePending(nonce) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ n: nonce, t: Date.now() })); } catch (e) {}
  }
  function clearPending() { try { localStorage.removeItem(PENDING_KEY); } catch (e) {} }
  function readPending() {
    let v = null;
    try { v = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch (e) { v = null; }
    if (!v || !v.n || !v.t || (Date.now() - v.t) > PENDING_TTL_MS) { clearPending(); return null; }
    return v.n;
  }

  // 폴 1회. 끝났으면 true 를 반환해 루프를 멈춘다.
  let lastPollErr = null;
  function pollOnce(nonce) {
    return MS.data.api("auth_poll", { nonce: nonce, state: syncState() }).then(function (p) {
      if (p && p.ok && p.pending) return false;
      trace("poll", { n: String(nonce).slice(0, 6), ok: !!(p && p.ok), linked: !!(p && p.linked), err: (p && (p.error || p.reason)) || null });
      // 종료로 볼 수 있는 답만 종료한다. 서버 오류·네트워크 실패는 **일시적일 수 있으므로 계속 문는다**
      // — 서버는 이 경우 논스를 태우지 않고 물러난다(재시도가 정답). 예산이 다하면 그때 알린다.
      if (!p || (p.ok !== true && p.error !== "unauthorized" && p.error !== "device-claimed")) {
        lastPollErr = (p && (p.reason || p.error)) || "network";
        return false;
      }
      stopPoll(); clearPending(); busy = false;
      if (p && p.ok && p.linked) {
        finishLink(p.nick, p.state, p.wallet ? p.wallet.balance : null, p.gname || null);
      } else if (p && p.error === "unauthorized") {
        // 논스가 이미 소각됨 = 대개 다른 탭이 먼저 병합했다는 뜻이다. 조용히 접고 서버 상태를 따른다.
        MS.store.set({ gBusy: 0 });
        if (MS.wallet) MS.wallet.state();   // linked·nick 은 wallet_state 가 정본으로 되돌려준다
      } else {
        MS.store.set({ gBusy: 0 });
        MS.ui.flash(p && p.error === "device-claimed"
          ? "이 기기는 이미 다른 구글 계정과 연결돼 있어요"
          : "로그인이 완료되지 않았어요 — 다시 시도해 주세요" + (p && p.reason ? " (" + p.reason + ")" : ""), "");
      }
      return true;
    }).catch(function () { return false; });
  }

  function beginPoll(nonce) {
    lastPollErr = null;
    savePending(nonce);
    busy = true;
    MS.store.set({ gBusy: 1 });
    let tries = 0;
    stopPoll();
    polling = setInterval(function () {
      tries++;
      if (tries > 120) {
        stopPoll(); clearPending(); busy = false; MS.store.set({ gBusy: 0 });
        MS.ui.flash("로그인이 완료되지 않았어요 — 다시 시도해 주세요" + (lastPollErr ? " (" + lastPollErr + ")" : ""), "");
        return;
      }
      pollOnce(nonce);
    }, 2500);
    pollOnce(nonce);   // 즉시 1회 — 돌아왔을 때 2.5초를 더 기다리지 않는다
  }

  function start() {
    const s = MS.store.get();
    if (s.gLinked) return;
    // 이전 시도의 폴링이 살아 있으면 버튼이 조용히 무시됐다(2026-08-28 사용자 제보: 아무 반응 없음).
    // 사용자가 다시 눌렀다는 건 '처음부터 다시'라는 뜻이다 — 묵히지 말고 접고 새로 시작한다.
    if (busy) { stopPoll(); clearPending(); busy = false; MS.store.set({ gBusy: 0 }); }
    // 팝업은 **클릭 그 순간에** 열어야 한다. auth_start 응답을 기다렸다가 열면 모바일 브라우저가
    // 사용자 제스처와 무관한 창으로 보고 조용히 막는다(계정 선택 창이 아예 안 뜨던 원인).
    // 빈 창을 먼저 잡아 두고 주소만 나중에 넣는다. 막혔으면 같은 탭으로 이동한다 —
    // 논스를 영속화해 뒀으므로 돌아왔을 때 폴링이 이어진다.
    let win = null;
    if (!isFixture) { try { win = window.open("about:blank", "_blank"); } catch (e) { win = null; } }
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
        if (win && !win.closed) { try { win.close(); } catch (e) {} }
        MS.store.set({ gBusy: 0 });
        MS.ui.flash(r && r.error === "auth-disabled" ? "로그인은 준비 중이에요 — 곧 열려요" : "연결을 시작하지 못했어요", "");
        return;
      }
      savePending(r.nonce);          // 창을 옮기는 순간 페이지가 죽어도 돌아와서 이어받는다
      trace("start", { n: String(r.nonce).slice(0, 6), completed: !!r.completed, popup: !!(win && !win.closed) });
      if (r.completed) {              // 서버에 이미 인증 끝난 논스가 있다 — 구글을 다시 거치지 않는다
        if (win && !win.closed) { try { win.close(); } catch (e) {} }
        beginPoll(r.nonce);
        return;
      }
      if (win && !win.closed) {
        try { win.location.href = r.authUrl; } catch (e) { win = null; }
      }
      if (!win || win.closed) {
        // 팝업이 막혔다 — 같은 탭으로 간다. 돌아오면 부팅 시 대기 논스로 폴링이 재개된다.
        beginPoll(r.nonce);
        window.location.href = r.authUrl;
        return;
      }
      beginPoll(r.nonce);
    }).catch(function () {
      busy = false;
      if (win && !win.closed) { try { win.close(); } catch (e) {} }
      MS.store.set({ gBusy: 0 });
      MS.ui.flash("연결을 시작하지 못했어요", "");
    });
  }

  // 로그아웃은 한 번 묻는다(2026-08-29 사용자 지시). 같은 구글 계정을 쓰는 다른 기기도 함께
  // 풀리는 현 모델(BACKLOG 계정 모델 과제)이라 그 사실도 여기서 정직하게 적는다.
  function btn(act, label, primary) {
    return '<button data-act="' + act + '" style="flex:1;min-height:46px;border-radius:10px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;' +
      (primary ? 'border:0;background:var(--dn);color:#fff' : 'border:1px solid var(--ln2);background:var(--sf1);color:var(--t1)') + '">' + label + "</button>";
  }
  function logoutConfirm() {
    const s = MS.store.get();
    if (!s.gLinked) return;
    MS.ui.openSheet("logout", function (body) {
      body.innerHTML =
        '<div style="font-size:16px;font-weight:700">로그아웃할까요?</div>' +
        '<div style="margin-top:8px;font-size:12.5px;color:var(--t2);line-height:1.7">' +
        (displayName() ? '<b style="color:var(--t1)">' + String(displayName()).replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</b> 계정 연결을 끊어요. ' : "") +
        '기록은 서버에 남고, 다시 로그인하면 그대로 돌아와요.<br>' +
        '<span style="color:var(--m1)">같은 구글 계정을 쓰는 다른 기기도 함께 로그아웃돼요.</span></div>' +
        '<div style="margin-top:16px;display:flex;gap:8px">' + btn("cancel", "취소", false) + btn("logout", "로그아웃", true) + "</div>";
      body.querySelector('[data-act="cancel"]').addEventListener("click", function () { MS.ui.closeSheet(); });
      body.querySelector('[data-act="logout"]').addEventListener("click", function () { MS.ui.closeSheet(); logout(); });
    });
  }
  // 헤더 계정 버튼 — 연결 상태면 메뉴(내 계정 · 로그아웃), 게스트면 로그인 시작
  function accountMenu() {
    const s = MS.store.get();
    if (!s.gLinked) { start(); return; }
    const esc = function (v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
    const item = function (act, title, sub, danger) {
      return '<button data-act="' + act + '" style="width:100%;text-align:left;min-height:54px;border:1px solid var(--ln0);border-radius:12px;background:var(--sf1);padding:10px 14px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:12px">' +
        '<span style="min-width:0;flex:1"><span style="display:block;font-size:14px;font-weight:700;color:' + (danger ? "var(--dn)" : "var(--t1)") + '">' + title + "</span>" +
        (sub ? '<span style="display:block;margin-top:2px;font-size:11.5px;color:var(--m1)">' + sub + "</span>" : "") + "</span>" +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--m2)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg></button>';
    };
    MS.ui.openSheet("account", function (body) {
      body.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<span style="width:36px;height:36px;border-radius:50%;background:var(--ac);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800">' + esc(displayName() ? String(displayName()).charAt(0) : "M") + "</span>" +
        '<span><span style="display:block;font-size:15px;font-weight:700">' + esc(displayName() || "내 계정") + '</span><span style="display:block;font-size:11.5px;color:var(--m1)">구글 계정 연결됨' + (s.nick && s.gName ? ' · 리더보드 이름 ' + esc(s.nick) : "") + '</span></span></div>' +
        '<div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">' +
        item("wallet", "내 계정 · 내 스쿱", "레벨 · 스쿱 · 출석 · 설정", false) +
        item("logout", "로그아웃", "확인 후 진행돼요", true) + "</div>";
      body.querySelector('[data-act="wallet"]').addEventListener("click", function () { MS.ui.closeSheet(); MS.router.go("wallet"); });
      body.querySelector('[data-act="logout"]').addEventListener("click", function () { MS.ui.closeSheet(); setTimeout(logoutConfirm, 260); });
    });
  }

  function logout() {
    stopPoll(); clearPending();
    MS.store.set({ gLinked: 0, nick: null, gName: null, gBusy: 0 });
    MS.ui.flash("로그아웃했어요. 기록은 이 기기에만 남습니다", "");
    // 서버에도 알린다 — 안 그러면 부팅 때 wallet_state 가 linked:1 을 돌려줘 되살아난다.
    // 응답을 기다려 상태를 다시 맞춘다(실패하면 다음 부팅에서 서버 정본이 이긴다 — 정직하게).
    if (isFixture) return;
    MS.data.api("auth_logout", {}).then(function () {
      if (MS.wallet) MS.wallet.state();
    }).catch(function () {
      MS.ui.flash("서버에 로그아웃을 알리지 못했어요 — 연결되면 다시 시도해 주세요", "");
    });
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
    // 로그인 도중 페이지가 다시 뜬 경우 — 저장해 둔 논스로 폴링을 이어받는다.
    // (이게 없으면 구글이 "You are signed in" 을 띄운 뒤 앱은 영영 링크되지 않는다.)
    if (!isFixture && !MS.store.get().gLinked) {
      const pend = readPending();
      if (pend) beginPoll(pend);
    }
    // 모바일은 백그라운드 탭의 타이머를 강하게 조인다(분 단위) — 돌아온 순간 한 번 즉시 확인한다.
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState !== "visible") return;
        const n = readPending();
        if (!n || MS.store.get().gLinked) return;
        if (!polling) beginPoll(n); else pollOnce(n);
      });
    }
    // 부팅 시 연결 기기는 pull 로 다른 기기 진행분을 받는다(push 는 변경 훅이 처리)
    if (MS.store.get().gLinked && !isFixture) {
      MS.data.api("sync_pull", {}).then(function (r) {
        if (r && r.ok && r.state) applyState(r.state, r.nick);
      }).catch(function () {});
    }
  }

  MS.auth = { start: start, logout: logout, logoutConfirm: logoutConfirm, accountMenu: accountMenu, displayName: displayName,
    withdraw: withdraw, syncSoon: syncSoon, init: init, stub: isFixture, trace: readTrace };
})();
