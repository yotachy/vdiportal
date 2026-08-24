/* 머니스쿱 앱 — 라우터·부팅.
   라우터 규칙(프로토 go() L2214 승계): heavy 화면 전환 시 스켈레톤 180ms ·
   화면 이동 시 시트 자동 닫힘(app-ui 구독) · 시그널 이탈 시 펼침 초기화 훅 ·
   visitXp 훅 자리(P5 에서 실적립). 화면 모듈은 MS.router.register 로 등록한다. */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const HEAVY = ["home", "signal", "score", "stats", "chart"];   // 프로토 dash·sig·yest·peers·chart 대응

  const screens = {};
  let store = null, mainEl = null, current = null, currentName = null;

  function register(name, screen) { screens[name] = screen; }

  function go(name) {
    if (!screens[name]) {
      MS.ui.flash(MS.str("toast.comingSoon"), "");
      return;
    }
    const prev = currentName;
    if (prev === name) {
      if (current && current.refresh) { current.refresh(); }
      return;
    }
    // 훅: 시그널 이탈 시 펼침 초기화(P4 에서 화면이 소비)
    if (prev === "signal" && store) store.set({ sgOpen: {} });
    if (current && current.unmount) current.unmount();
    currentName = name;
    store.set({ screen: name });
    if (HEAVY.indexOf(name) >= 0 && prev !== null) MS.ui.skeleton(true);
    const host = document.createElement("div");
    host.className = "ms-screen";
    mainEl.innerHTML = "";
    mainEl.appendChild(host);
    current = screens[name];
    current.mount(host, { store: store, go: go });
    // visitXp 훅 자리 — P5 에서 서버 판정 적립으로 배선
  }

  // 헤더 액션 디스패치(app-ui 가 호출)
  function onChrome(act) {
    if (act === "brand") {
      const s = store.get();
      if (s.screen === "home") {
        if (current && current.refresh) current.refresh();
        MS.ui.flash(MS.str("toast.refreshed"), "");
      } else go("home");
    } else if (act === "stocks") {
      MS.flow.openStocks();   // 전역 종목 진입점(실행·조절 화면에선 내부에서 무시)
    } else if (act === "about" || act === "scoop" || act === "acct") {
      MS.ui.flash(MS.str("toast.comingSoon"), "");   // about=P2후반·scoop/acct=P5/P8
    }
  }

  function boot() {
    const appEl = document.getElementById("msApp");
    mainEl = document.getElementById("msMain");
    const io = MS.state.browserIO();
    const restored = MS.state.restore(io.read(), Date.now());
    store = MS.state.create(restored || MS.state.initialState(), io);
    MS.store = store;

    document.body.setAttribute("data-th", store.get().theme);
    document.documentElement.setAttribute("data-fz", store.get().fontZoom ? "1" : "0");

    MS.ui.init(store, {
      app: appEl,
      main: mainEl,
      header: document.getElementById("msHeader"),
      tabbar: document.getElementById("msTabbar")
    });
    store.subscribe(function () { store.persistSoon(); });

    // 복원 성공(관심 종목 보유) → 홈 직행, 첫 실행 → boot(인트로) — 프로토 L2202 규칙
    go(restored ? "home" : "boot");
  }

  MS.router = { register: register, go: go, onChrome: onChrome, boot: boot };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
