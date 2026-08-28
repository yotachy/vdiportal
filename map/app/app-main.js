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
    if (MS.xp) MS.xp.visit(name);   // 오늘 첫 방문 +5 · 메뉴 첫 방문 +3(게스트는 유도 팝만)
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
    } else if (act === "acct") {
      // 프로토 acctTap: 연결됨 → 내 스쿱, 게스트 → 구글 로그인 시작
      if (store.get().gLinked) go("wallet"); else if (MS.auth) MS.auth.start();
    } else if (act === "scoop") {
      go("wallet");
    } else if (act === "about") {
      MS.ui.openAbout();   // 마니페스토·면책·문의 시트(P7)
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
    // 잔액의 정본은 서버다 — **복원 여부와 무관하게** 물어본다(2026-08-28 버그 수정).
    // restored 로 막아두니 '데이터 초기화'·재설치 직후 로컬 기본값(15)이 그대로 화면에 남고,
    // 서버는 실제 잔액(예: 13)을 들고 있어 분석을 누르면 insufficient → "부족 · 광고 보기"가 떴다.
    // 새 기기라면 서버가 계정을 만들며 시드 15 를 돌려준다 — 그게 옳은 15 다.
    if (MS.wallet) MS.wallet.state();   // 서버 잔액 동기화 + 적중 환급 스위프
    if (MS.auth) MS.auth.init();                     // 연결 기기: 변경 푸시 훅 + 부팅 pull(P8)
    bindHardwareBack();                              // 앱 셸 하드웨어 뒤로가기(P10)
  }

  // 하드웨어 뒤로가기(Capacitor @capacitor/app — 순수 DOM 으로는 잡을 수 없다, CLAUDE.md §⑥):
  // 시트 열림 → 시트 닫기 · 실행/조절/보조 화면 → 홈 · 홈 → 앱 종료(OS 기본)
  function bindHardwareBack() {
    const cap = window.Capacitor;
    const App = cap && cap.Plugins && cap.Plugins.App;
    if (!App || typeof App.addListener !== "function") return;
    App.addListener("backButton", function () {
      const s = store.get();
      if (s.sheet) { MS.ui.closeSheet(); return; }
      if (currentName && currentName !== "home" && currentName !== "boot") { go("home"); return; }
      if (typeof App.exitApp === "function") App.exitApp();
    });
  }

  // 현재 화면 새로고침 — refresh 가 있으면 가벼운 재렌더, 없으면 재마운트(재fetch). 당겨서 새로고침·PTR 용.
  function refreshCurrent() {
    if (!currentName || !screens[currentName]) return;
    if (current && current.refresh) { current.refresh(); return; }
    if (current && current.unmount) current.unmount();
    const host = document.createElement("div");
    host.className = "ms-screen";
    mainEl.innerHTML = "";
    mainEl.appendChild(host);
    current = screens[currentName];
    current.mount(host, { store: store, go: go });
  }

  MS.router = { register: register, go: go, onChrome: onChrome, boot: boot, refreshCurrent: refreshCurrent };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
