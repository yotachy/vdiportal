/* 머니스쿱 앱 — 공통 크롬(헤더·탭바·토스트·바텀시트·스켈레톤·햅틱).
   마크업 원본: 프로토타입 헤더 L75~104 · 탭바 L1643~1668 · 토스트 L1712~1714 ·
   시트 딤 L1716~1718 · 스켈레톤 L1849~1861 (dissection/02 §3). 색은 전부 토큰.
   상태 구독으로 자동 갱신 — 화면 모듈은 크롬을 직접 만지지 않는다. */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;
  const POLICY = MS.config.POLICY;

  let store = null;
  let hostHeader = null, hostTabbar = null, appEl = null, mainEl = null;
  let sheetState = null;   // { name, el, dim, startY, dy, scrollEl }
  let skelT = null;

  // ── 햅틱 (지침서 §11 고정 맵 — config 경유) ──
  function hap(kind) {
    try {
      const p = POLICY.ui.haptics[kind];
      if (p && navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* 미지원 무시 */ }
  }

  // ── SVG 조각 (프로토 원문 — 하드코딩 색만 토큰화) ──
  const SVG_LOGO =
    '<svg viewBox="0 0 24 24" width="26" height="26" style="display:block;flex:none" aria-hidden="true">' +
    '<rect x="0" y="0" width="24" height="24" rx="7" fill="var(--logo-plate)"></rect>' +
    '<rect x="4.5" y="13.5" width="4" height="6" rx="1.4" fill="var(--logo-a)"></rect>' +
    '<rect x="10" y="9.5" width="4" height="10" rx="1.4" fill="var(--logo-b)"></rect>' +
    '<rect x="15.5" y="4.5" width="4" height="15" rx="1.4" fill="var(--logo-c)"></rect></svg>';
  const SVG_INFO =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:block" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9.2"></circle><path d="M12 10.6V16"></path>' +
    '<circle cx="12" cy="7.6" r="0.4" fill="currentColor"></circle></svg>';
  const SVG_SEARCH =
    '<svg viewBox="0 0 24 24" width="14" height="14" style="display:block;flex:none;color:var(--ac)" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="6.2" fill="none" stroke="currentColor" stroke-width="2"></circle>' +
    '<path d="M15.6 15.6 20 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>';
  const SVG_GOOGLE =
    '<svg viewBox="0 0 48 48" width="14" height="14" style="display:block" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path></svg>';
  const TAB_ICONS = {
    home: '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 10.2V18h11v-7.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    signal: '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true"><path d="M13 2 5 13.5h5.5L10.5 22 19 10.5h-5.5L13 2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    analyze: '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true"><path d="M4 17l4.2-5.2 3 3L19 7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="19" cy="7.5" r="1.4" fill="currentColor"></circle></svg>',
    score: '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    stats: '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true"><circle cx="9" cy="9" r="3.1" fill="none" stroke="currentColor" stroke-width="1.7"></circle><path d="M3.6 19c0.7-3 2.8-4.6 5.4-4.6s4.7 1.6 5.4 4.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path><circle cx="16.8" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M15.9 13.7c2.6 0 4.1 1.5 4.6 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>'
  };

  // 탭 정의 — 라우터 화면명과 짝. 시그널·채점 배지는 상태 파생(P4·P3 에서 실데이터 연결)
  const TABS = [
    { key: "home", screen: "home", labelKey: "tabs.home" },
    { key: "signal", screen: "signal", labelKey: "tabs.signal", badge: "sigBadge" },
    { key: "analyze", screen: "chart", labelKey: "tabs.analyze" },
    { key: "score", screen: "score", labelKey: "tabs.score", badge: "scoreBadge" },
    { key: "stats", screen: "stats", labelKey: "tabs.stats" },
    { key: "wallet", screen: "wallet", labelKey: "tabs.wallet", wallet: true }
  ];
  // 탭바가 보이는 화면(프로토 showTabs L2534)
  const TAB_SCREENS = ["home", "chart", "score", "signal", "stats", "pfit", "mix", "wallet", "run"];

  // ── 헤더 ──
  function renderHeader(host) {
    hostHeader = host;
    host.className = "ms-header";
    host.innerHTML =
      '<span class="ms-header-brand ms-press" data-act="brand">' + SVG_LOGO +
        '<span class="ms-header-title">' + str("app.title") + "</span></span>" +
      '<button class="ms-header-info" data-act="about" aria-label="' + str("header.ariaInfo") + '">' + SVG_INFO + "</button>" +
      '<button class="ms-header-stocks ms-press" data-act="stocks" aria-label="' + str("header.ariaStocks") + '">' +
        SVG_SEARCH + '<span class="lbl">' + str("header.stocks") + "</span></button>" +
      '<button class="ms-header-scoop" data-act="scoop">' +
        '<span class="gem">◈</span><span class="mono" data-bind="scoops"></span>' +
        '<span class="ms-header-lv" data-bind="lvWrap"><span class="no" data-bind="lvNo"></span>' +
        '<span class="bar"><span class="fill" data-bind="lvFill" style="width:0%"></span></span></span></button>' +
      '<button class="ms-header-acct" data-act="acct" aria-label="' + str("header.ariaAccount") + '">' +
        '<span data-bind="acct"></span></button>';
    host.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      if (MS.router && MS.router.onChrome) MS.router.onChrome(act);
    });
    syncHeader();
  }

  function syncHeader() {
    if (!hostHeader || !store) return;
    const s = store.get();
    const lv = MS.config.levelOf(s.xp);
    const el = function (b) { return hostHeader.querySelector('[data-bind="' + b + '"]'); };
    el("scoops").textContent = s.scoops;
    // 레벨 미니 배지 — 게스트는 잠금(레벨 없음, 지침서 §8 게스트 정책)
    el("lvWrap").style.display = s.gLinked ? "flex" : "none";
    if (s.gLinked) {
      el("lvNo").textContent = "LV" + lv;
      const L = POLICY.xp.levels;
      const lo = lv <= 1 ? 0 : L[lv - 2];
      const hi = lv > L.length ? lo + 1 : L[lv - 1];
      const pct = lv > L.length ? 100 : Math.max(0, Math.min(100, Math.round((s.xp - lo) / (hi - lo) * 100)));
      el("lvFill").style.width = pct + "%";
    }
    el("acct").outerHTML = s.gLinked
      ? '<span class="ava" data-bind="acct">' + (s.acctInitial || "M") + "</span>"
      : '<span class="guest" data-bind="acct">' + SVG_GOOGLE + "</span>";
  }

  // ── 탭바 ──
  function renderTabbar(host) {
    hostTabbar = host;
    host.className = "ms-tabbar";
    host.innerHTML = TABS.map(function (t) {
      if (t.wallet) {
        return '<button class="ms-tab ms-tab-wallet" data-tab="' + t.screen + '">' +
          '<span class="pill"><span class="gem">◈</span><span data-bind="scoops"></span></span>' +
          '<span class="lbl">' + str(t.labelKey) + "</span></button>";
      }
      return '<button class="ms-tab" data-tab="' + t.screen + '">' +
        '<span class="pill">' + TAB_ICONS[t.key] +
        (t.badge ? '<span class="badge" data-bind="' + t.badge + '" style="display:none"></span>' : "") +
        "</span><span class=\"lbl\">" + str(t.labelKey) + "</span></button>";
    }).join("");
    host.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-tab]");
      if (!btn) return;
      if (MS.router) MS.router.go(btn.getAttribute("data-tab"));
    });
    syncTabbar();
  }

  function syncTabbar() {
    if (!hostTabbar || !store) return;
    const s = store.get();
    if (hostHeader) hostHeader.style.display = s.screen === "boot" ? "none" : "flex";   // boot 만 크롬 숨김(프로토 chromeVis)
    hostTabbar.style.display = TAB_SCREENS.indexOf(s.screen) >= 0 ? "flex" : "none";
    const tabs = hostTabbar.querySelectorAll("[data-tab]");
    for (let i = 0; i < tabs.length; i++) {
      const on = tabs[i].getAttribute("data-tab") === s.screen && !tabs[i].classList.contains("ms-tab-wallet");
      tabs[i].classList.toggle("on", on);
    }
    const sc = hostTabbar.querySelector('[data-bind="scoops"]');
    if (sc) sc.textContent = s.scoops;
    const sb = hostTabbar.querySelector('[data-bind="scoreBadge"]');
    if (sb) {
      const n = s.scoreDueN || 0;
      sb.style.display = n > 0 ? "block" : "none";
      sb.textContent = n;
    }
    const gb = hostTabbar.querySelector('[data-bind="sigBadge"]');
    if (gb) {
      const n2 = s.sigTodayN || 0;
      gb.style.display = n2 > 0 ? "block" : "none";
      gb.textContent = n2;
    }
  }

  // ── 토스트(스낵바) — 프로토 flash 승계: 감액 3.2s 적색·흔들림, 적립 보라 ──
  function flash(text, delta) {
    if (!appEl) return;
    const old = appEl.querySelector(".ms-snack");
    if (old) old.parentNode.removeChild(old);
    const neg = typeof delta === "string" && delta.charAt(0) === "−";
    const earn = !neg && !!delta;
    const el = document.createElement("div");
    el.className = "ms-snack" + (neg ? " neg" : earn ? " earn" : "");
    const tabOn = TAB_SCREENS.indexOf(store ? store.get().screen : "") >= 0;
    el.style.bottom = tabOn ? "99px" : "20px";
    const dur = neg ? POLICY.ui.toastNegMs : POLICY.ui.toastMs;
    el.style.animationDuration = (dur + 600) / 1000 + "s";
    el.innerHTML = '<span class="dot"></span><span class="txt"></span>';
    el.querySelector(".txt").textContent = text + (delta ? "  " + delta : "");
    appEl.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, dur + 700);
  }

  // ── 바텀시트 — 탭바를 가리지 않음(딤 bottom 88px), 본문 전체 드래그 닫기 90px + 스크롤 가드 ──
  function openSheet(name, build) {
    closeSheet();
    if (!appEl) return null;
    const tabOn = TAB_SCREENS.indexOf(store ? store.get().screen : "") >= 0;
    const bottom = tabOn ? "88px" : "0px";
    const dim = document.createElement("div");
    dim.className = "ms-sheet-dim";
    dim.style.bottom = bottom;
    dim.addEventListener("click", closeSheet);
    const sheet = document.createElement("div");
    sheet.className = "ms-sheet";
    sheet.style.bottom = bottom;
    sheet.innerHTML = '<div class="ms-sheet-handle"><span></span></div>';
    const body = document.createElement("div");
    body.className = "ms-sheet-body";
    sheet.appendChild(body);
    if (build) build(body, sheet);
    appEl.appendChild(dim);
    appEl.appendChild(sheet);
    sheetState = { name: name, el: sheet, dim: dim, startY: null, dy: 0 };
    bindSheetDrag(sheet);
    if (store) store.set({ sheet: name });
    return body;
  }

  function bindSheetDrag(sheet) {
    sheet.addEventListener("touchstart", function (e) {
      if (!sheetState) return;
      // 스크롤 가드: 내부 스크롤 컨테이너가 위에 있지 않으면 드래그 무시(프로토 L2681)
      let n = e.target;
      let scrollEl = null;
      while (n && n !== sheet) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) { scrollEl = n; break; }
        n = n.parentNode;
      }
      if (scrollEl && scrollEl.scrollTop > 1) return;
      sheetState.startY = e.touches[0].clientY;
      sheetState.dy = 0;
    }, { passive: true });
    sheet.addEventListener("touchmove", function (e) {
      if (!sheetState || sheetState.startY === null) return;
      const dy = e.touches[0].clientY - sheetState.startY;
      if (dy <= 0) return;
      sheetState.dy = dy;
      sheet.classList.add("drag");
      sheet.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });
    sheet.addEventListener("touchend", function () {
      if (!sheetState || sheetState.startY === null) return;
      const dy = sheetState.dy;
      sheetState.startY = null;
      sheet.classList.remove("drag");
      if (dy > POLICY.ui.sheetClosePx) closeSheet();
      else sheet.style.transform = "";   // 스프링 복귀(CSS transition)
    });
  }

  function closeSheet() {
    if (!sheetState) return;
    if (sheetState.el.parentNode) sheetState.el.parentNode.removeChild(sheetState.el);
    if (sheetState.dim.parentNode) sheetState.dim.parentNode.removeChild(sheetState.dim);
    sheetState = null;
    if (store && store.get().sheet) store.set({ sheet: null });
  }

  // ── 스켈레톤(heavy 화면 전환 180ms — 라우터가 호출) ──
  function skeleton(on) {
    if (!mainEl) return;
    let el = mainEl.querySelector(".ms-skel");
    if (on) {
      if (el) return;
      el = document.createElement("div");
      el.className = "ms-skel";
      el.innerHTML =
        '<div class="b" style="width:38%;height:20px"></div>' +
        '<div class="b" style="margin-top:8px;width:62%;height:12px"></div>' +
        '<div class="row"><div class="b" style="height:92px;border-radius:14px"></div>' +
        '<div class="b" style="height:92px;border-radius:14px;animation-delay:0.08s"></div></div>' +
        '<div class="b" style="margin-top:8px;height:118px;border-radius:14px;animation-delay:0.14s"></div>' +
        '<div class="b" style="margin-top:8px;height:54px;border-radius:12px;animation-delay:0.2s"></div>' +
        '<div class="b" style="margin-top:8px;height:54px;border-radius:12px;animation-delay:0.26s"></div>' +
        '<div class="b" style="margin-top:8px;height:54px;border-radius:12px;animation-delay:0.32s"></div>';
      mainEl.appendChild(el);
      if (skelT) clearTimeout(skelT);
      skelT = setTimeout(function () { skeleton(false); }, POLICY.ui.skeletonMs);
    } else if (el) {
      el.parentNode.removeChild(el);
    }
  }

  // ── 초기화 ──
  function init(theStore, els) {
    store = theStore;
    appEl = els.app;
    mainEl = els.main;
    renderHeader(els.header);
    renderTabbar(els.tabbar);
    store.subscribe(function (keys) {
      if (keys.indexOf("scoops") >= 0 || keys.indexOf("xp") >= 0 || keys.indexOf("gLinked") >= 0) syncHeader();
      if (keys.indexOf("screen") >= 0 || keys.indexOf("scoops") >= 0 || keys.indexOf("scoreDueN") >= 0 || keys.indexOf("sigTodayN") >= 0) syncTabbar();
      if (keys.indexOf("screen") >= 0 && sheetState) closeSheet();  // 다른 화면 이동 시 시트 자동 닫힘
      if (keys.indexOf("theme") >= 0) document.body.setAttribute("data-th", store.get().theme);
      if (keys.indexOf("fontZoom") >= 0) document.documentElement.setAttribute("data-fz", store.get().fontZoom ? "1" : "0");
    });
  }

  MS.ui = { init: init, flash: flash, openSheet: openSheet, closeSheet: closeSheet,
    skeleton: skeleton, hap: hap, TAB_SCREENS: TAB_SCREENS };
})();
