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

  // 막대 값 툴팁 — 누른 막대 바로 위에 수치를 띄운다(하단 토스트 대신, 막대 근처). ~1.6초 후 사라짐.
  function showBarTip(barEl, text) {
    const app = appEl || document.getElementById("msApp");
    if (!app) return;
    const old = app.querySelector(".ms-bartip");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    // getBoundingClientRect 는 시각 px, style 은 #msApp 안의 CSS px — 글자 확대(zoom 1.12)면 12% 어긋난다.
    const z = zoomOf();
    const r = barEl.getBoundingClientRect(), a = app.getBoundingClientRect();
    const tip = document.createElement("div");
    tip.className = "ms-bartip";
    tip.textContent = text;
    tip.style.left = ((r.left - a.left + r.width / 2) / z) + "px";
    tip.style.top = ((r.top - a.top) / z) + "px";
    app.appendChild(tip);
    // 화면 밖으로 나가면 가로 위치 보정(막대가 가장자리일 때)
    const tr = tip.getBoundingClientRect();
    const half = tr.width / 2 / z, cx = (r.left - a.left + r.width / 2) / z, aw = a.width / z;
    if (cx - half < 6) tip.style.left = (6 + half) + "px";
    else if (cx + half > aw - 6) tip.style.left = (aw - 6 - half) + "px";
    setTimeout(function () { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 1600);
  }

  // 숫자 카운트 트윈(잔액 변화 손맛) — 현재 표시값에서 목표까지 easeOutCubic
  function tweenNum(el, to) {
    const from = parseInt(el.textContent, 10);
    if (!isFinite(from) || from === to) { el.textContent = String(to); return; }
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now()), dur = 460;
    (function step() {
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(step); else el.textContent = String(to);
    })();
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
        '<span class="ms-header-lv" data-bind="lvWrap"><span class="row"><span class="no" data-bind="lvNo"></span><span class="xp" data-bind="lvXp"></span></span>' +
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
    // 잔액 변화 손맛 — 카운트 트윈 + 방향 펄스(벌면 골드↑·쓰면 축소↓). 최초 표시는 스냅.
    const scoopEl = el("scoops");
    const prevSc = parseInt(scoopEl.textContent, 10);
    if (isFinite(prevSc) && prevSc !== s.scoops) {
      const dir = s.scoops > prevSc ? "up" : "dn";
      tweenNum(scoopEl, s.scoops);
      scoopEl.classList.remove("up", "dn");
      void scoopEl.offsetWidth;   // 리플로우로 애니메이션 재시작
      scoopEl.classList.add(dir);
    } else {
      scoopEl.textContent = String(s.scoops);
    }
    // 레벨 미니 배지 — 게스트는 잠금(레벨 없음, 지침서 §8 게스트 정책)
    el("lvWrap").style.display = s.gLinked ? "flex" : "none";
    if (s.gLinked) {
      el("lvNo").textContent = "LV" + lv;
      const L = POLICY.xp.levels;
      const lo = lv <= 1 ? 0 : L[lv - 2];
      const hi = lv > L.length ? lo + 1 : L[lv - 1];
      const pct = lv > L.length ? 100 : Math.max(0, Math.min(100, Math.round((s.xp - lo) / (hi - lo) * 100)));
      const xpEl = el("lvXp");
      if (xpEl) xpEl.textContent = lv > L.length ? "MAX" : (s.xp - lo) + "/" + (hi - lo);
      const fill = el("lvFill");
      const prevW = parseFloat(fill.style.width) || 0;
      fill.style.width = pct + "%";
      // 차오르는 순간을 눈에 띄게 — 게이지가 늘면 글로우 펄스(2026-08-29 "채워지는 느낌 부족")
      if (pct > prevW || (prevW === 100 && pct < prevW)) {
        const wrap = el("lvWrap");
        wrap.classList.remove("bump"); void wrap.offsetWidth; wrap.classList.add("bump");
      }
    }
    el("acct").outerHTML = s.gLinked
      ? '<span class="ava" data-bind="acct">' + ((s.gName || s.nick) ? String(s.gName || s.nick).charAt(0) : "M") + "</span>"
      : '<span class="guest" data-bind="acct">' + SVG_GOOGLE + "</span>";
  }

  // ── 탭바 ──
  function renderTabbar(host) {
    hostTabbar = host;
    host.className = "ms-tabbar";
    host.setAttribute("role", "tablist");
    host.setAttribute("aria-label", "주요 화면");
    host.innerHTML = TABS.map(function (t) {
      if (t.wallet) {
        return '<button class="ms-tab ms-tab-wallet" role="tab" aria-label="' + str(t.labelKey) + '" data-tab="' + t.screen + '">' +
          '<span class="pill"><span class="gem">◈</span><span data-bind="scoops"></span></span>' +
          '<span class="lbl">' + str(t.labelKey) + "</span></button>";
      }
      return '<button class="ms-tab" role="tab" aria-label="' + str(t.labelKey) + '" data-tab="' + t.screen + '">' +
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
      tabs[i].classList.toggle("on", on); tabs[i].setAttribute("aria-selected", on ? "true" : "false");
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

  // 리워드 버스트 — 스쿱·경험치 '획득' 순간 전용(일반 토스트와 구분되는 강한 손맛).
  // kind: "scoop"(◈ 골드) | "xp"(✦ 그린) · amount: 양수 · opts.label: 아래 작은 사유.
  // 진동은 획득 크기 비례(reward / rewardBig). 획득이 아닌 안내는 flash() 를 쓴다.
  function reward(kind, amount, opts) {
    opts = opts || {};
    const app = appEl || document.getElementById("msApp");
    if (!app || !(amount > 0)) return;
    const scoop = kind !== "xp";
    const col = scoop ? "var(--cu)" : "var(--up)";
    const ico = scoop ? "◈" : "✦";
    hap(amount >= 10 ? "rewardBig" : "reward");
    const old = app.querySelector(".ms-rwfx");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const fx = document.createElement("div");
    fx.className = "ms-rwfx";
    fx.style.setProperty("--rw-ms", ((POLICY.ui.rewardMs || 1500) / 1000) + "s");
    fx.style.setProperty("--rw-col", col);
    const ring = document.createElement("div");
    ring.className = "rw-ring";
    fx.appendChild(ring);
    const NS = 8;   // 스파크 8개 — 균등 각 + 인덱스 지터(무작위 없이 결정적)
    for (let i = 0; i < NS; i++) {
      const a = (Math.PI * 2 * i) / NS + (i % 2 ? 0.34 : -0.16);
      const r = 52 + (i % 3) * 9;
      const sp = document.createElement("div");
      sp.className = "rw-spark";
      sp.style.setProperty("--tx", Math.round(Math.cos(a) * r) + "px");
      sp.style.setProperty("--ty", Math.round(Math.sin(a) * r) + "px");
      sp.style.animationDelay = (i * 12) + "ms";
      fx.appendChild(sp);
    }
    const card = document.createElement("div");
    card.className = "rw-card";
    card.style.border = "1px solid " + col;
    card.style.boxShadow = "0 14px 40px -8px rgba(0,0,0,0.6), 0 0 32px -2px " + col;
    card.innerHTML = '<span class="rw-ico" style="color:' + col + '">' + ico + "</span>" +
      '<span class="rw-num" style="color:' + col + '">+' + amount + "</span>";
    fx.appendChild(card);
    if (opts.label) {
      const sub = document.createElement("div");
      sub.className = "rw-sub";
      sub.textContent = opts.label;
      fx.appendChild(sub);
    }
    // 경험치 게이지 — 이전 % 에서 새 % 로 차오른다. 레벨업이면 100% 까지(오버레이가 뒤따른다).
    if (!scoop && opts.gauge) {
      const g = opts.gauge;
      const gg = document.createElement("div");
      gg.className = "rw-gauge";
      gg.innerHTML = '<span class="rw-glv">LV' + g.lv + '</span><span class="rw-gbar"><span class="rw-gfill" style="width:' + g.from + '%"></span></span>' +
        '<span class="rw-gtxt mono">' + (g.up ? "LEVEL UP" : (g.cur + "/" + g.max)) + "</span>";
      fx.appendChild(gg);
      const f = gg.querySelector(".rw-gfill");
      setTimeout(function () { f.style.width = g.to + "%"; if (g.up) gg.classList.add("up"); }, 120);
    }
    app.appendChild(fx);
    setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, (POLICY.ui.rewardMs || 1500) + 200);
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
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.tabIndex = -1;
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
    try { sheet.focus({ preventScroll: true }); } catch (e) {}
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
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      sheetState.startY = e.touches[0].clientY;
      sheetState.dy = 0;
      sheetState.lastY = sheetState.startY; sheetState.lastT = now; sheetState.vy = 0;
    }, { passive: true });
    sheet.addEventListener("touchmove", function (e) {
      if (!sheetState || sheetState.startY === null) return;
      const y = e.touches[0].clientY, dy = y - sheetState.startY;
      if (dy <= 0) { sheet.style.transform = ""; sheetState.dy = 0; return; }
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const dt = now - sheetState.lastT;
      if (dt > 0) sheetState.vy = (y - sheetState.lastY) / dt;   // px/ms(아래로 양수) — 플릭 속도
      sheetState.lastY = y; sheetState.lastT = now;
      sheetState.dy = dy;
      sheet.classList.add("drag");
      sheet.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });
    sheet.addEventListener("touchend", function () {
      if (!sheetState || sheetState.startY === null) return;
      const dy = sheetState.dy, vy = sheetState.vy || 0;
      sheetState.startY = null;
      sheet.classList.remove("drag");
      // 아이폰식: 충분히 내렸거나(거리) 아래로 빠르게 튕기면(속도) 닫는다. 짧고 빠른 플릭도 닫힘.
      if (dy > POLICY.ui.sheetClosePx || (vy > 0.5 && dy > 24)) closeSheet();
      else sheet.style.transform = "";   // 스프링 복귀(CSS transition)
    });
  }

  document.addEventListener("keydown", function (e) {   // 키보드 접근성 — Esc 로 시트 닫기
    if (e.key === "Escape" && sheetState) closeSheet();
  });

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
  // ── 당겨서 새로고침(PTR) — 데이터 화면 최상단에서 아래로 당기면 인디케이터가 자라고, 임계 넘겨 놓으면
  //    진동+새로고침. 차트(forge iframe)·플로우(pfit/mix/run)는 제외(transform 이 iframe 정렬을 깬다). ──
  const PTR_SCREENS = { home: 1, signal: 1, score: 1, stats: 1, wallet: 1 };
  const PTR_MAX = 84, PTR_TRIG = 60;
  let ptrEl = null, ptrStartY = 0, ptrDy = 0, ptrArmed = false, ptrScreen = null, ptrBusy = false;
  function ptrIndicator() {
    if (ptrEl) return ptrEl;
    ptrEl = document.createElement("div");
    ptrEl.className = "ms-ptr";
    ptrEl.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.2-8.5"></path><path d="M21 3v6h-6"></path></svg>';
    appEl.appendChild(ptrEl);
    return ptrEl;
  }
  function ptrReset() {
    ptrDy = 0;
    if (ptrScreen) {
      ptrScreen.style.transition = "transform 0.26s cubic-bezier(0.2,0.9,0.3,1)";
      ptrScreen.style.transform = "";
      (function (sc) { setTimeout(function () { if (sc) sc.style.transition = ""; }, 280); })(ptrScreen);
    }
    if (ptrEl) { ptrEl.style.opacity = "0"; ptrEl.style.transform = "translateX(-50%) translateY(-32px)"; ptrEl.classList.remove("ready"); }
  }
  function ptrFire() {
    ptrBusy = true;
    hap("done");
    const ind = ptrIndicator();
    ind.classList.add("spin"); ind.classList.remove("ready");
    ind.style.opacity = "1"; ind.style.transform = "translateX(-50%) translateY(8px)";
    if (ptrScreen) { ptrScreen.style.transition = "transform 0.2s ease"; ptrScreen.style.transform = "translateY(38px)"; }
    setTimeout(function () {
      try { if (MS.router && MS.router.refreshCurrent) MS.router.refreshCurrent(); } catch (e) {}
      // refreshCurrent 는 새 .ms-screen 을 만든다(transform 없음) — 옛 화면은 폐기되므로 되돌릴 필요 없음
      ind.classList.remove("spin");
      ind.style.opacity = "0"; ind.style.transform = "translateX(-50%) translateY(-32px)";
      flash(MS.str("toast.refreshed"), "");
      ptrBusy = false; ptrDy = 0; ptrScreen = null;
    }, 520);
  }
  function setupPTR() {
    mainEl.addEventListener("touchstart", function (e) {
      if (ptrBusy || !e.touches || e.touches.length !== 1) return;
      if (!PTR_SCREENS[store.get().screen]) return;
      const scr = mainEl.querySelector(".ms-screen");
      if (!scr || scr.scrollTop > 2) return;
      ptrArmed = true; ptrStartY = e.touches[0].clientY; ptrDy = 0; ptrScreen = scr;
    }, { passive: true });
    mainEl.addEventListener("touchmove", function (e) {
      if (!ptrArmed || ptrBusy) return;
      const dy = e.touches[0].clientY - ptrStartY;
      if (dy <= 0) { if (ptrDy > 0) ptrReset(); ptrArmed = !!(ptrScreen && ptrScreen.scrollTop <= 2); return; }
      ptrDy = Math.min(PTR_MAX, dy * 0.5);   // 감쇠 — 고무줄 느낌
      e.preventDefault();                     // 최상단 아래 당김 = 네이티브 오버스크롤 대신 PTR
      ptrScreen.style.transition = "";
      ptrScreen.style.transform = "translateY(" + ptrDy + "px)";
      const ind = ptrIndicator();
      const rdy = ptrDy >= PTR_TRIG;
      ind.style.transition = "";
      ind.style.opacity = String(Math.min(1, ptrDy / PTR_TRIG));
      ind.style.transform = "translateX(-50%) translateY(" + (ptrDy - 30) + "px) rotate(" + Math.round(ptrDy * 4) + "deg)";
      ind.classList.toggle("ready", rdy);
    }, { passive: false });
    const end = function () {
      if (!ptrArmed || ptrBusy) return;
      ptrArmed = false;
      if (ptrDy >= PTR_TRIG) ptrFire(); else ptrReset();
    };
    mainEl.addEventListener("touchend", end, { passive: true });
    mainEl.addEventListener("touchcancel", end, { passive: true });
  }

  function init(theStore, els) {
    store = theStore;
    appEl = els.app;
    mainEl = els.main;
    setupPTR();
    // 전역 탭 촉각 피드백 — 탭바·액션 버튼·CTA·press 요소를 누르면 가벼운 진동(tick).
    // 시각 press(:active scale)는 이미 있고, 여기서 손끝 진동을 얹어 앱 전체가 tactile 하게.
    // capture 단계라 자식 핸들러의 stopPropagation 과 무관하게 항상 먼저 울린다.
    appEl.addEventListener("click", function (e) {
      // 버튼·CTA 뿐 아니라 화면을 넘기거나 펼치는 카드(종목·매트릭스·시그널·채점 항목)도 손끝에 울린다
      if (e.target.closest("[data-tab],[data-act],[data-go],[data-goadd],[data-sig],[data-cell],[data-row],[data-del],[data-barv],.ms-cta-primary,.ms-press,button")) hap("tick");
      // 수치 라벨이 없는 막대(데이터 시각화) — 누르면 그 막대 바로 위에 값 툴팁(하단 토스트 아님)
      const bv = e.target.closest("[data-barv]");
      if (bv) showBarTip(bv, bv.getAttribute("data-barv"));
    }, true);
    renderHeader(els.header);
    renderTabbar(els.tabbar);
    store.subscribe(function (keys) {
      if (keys.indexOf("scoops") >= 0 || keys.indexOf("xp") >= 0 || keys.indexOf("gLinked") >= 0 || keys.indexOf("nick") >= 0 || keys.indexOf("gName") >= 0) syncHeader();
      if (keys.indexOf("screen") >= 0 || keys.indexOf("scoops") >= 0 || keys.indexOf("scoreDueN") >= 0 || keys.indexOf("sigTodayN") >= 0) syncTabbar();
      if (keys.indexOf("screen") >= 0 && sheetState) closeSheet();  // 다른 화면 이동 시 시트 자동 닫힘
      if (keys.indexOf("theme") >= 0) document.body.setAttribute("data-th", store.get().theme);
      if (keys.indexOf("fontZoom") >= 0) document.documentElement.setAttribute("data-fz", store.get().fontZoom ? "1" : "0");
    });
  }

  // ── 소개(마니페스토) 시트 — 프로토 sAbout L1881~1924 전문. 헤더 ⓘ·통계 푸터 공용.
  // 엔진 버전은 라이브 파생(core.version) — 카피의 숫자 스탬프가 엔진과 어긋나지 않게.
  function openAbout() {
    const ver = MS.engine.core().version;
    const step = function (n, c, t) {
      return '<div style="border-radius:12px;background:var(--sf2);padding:12px 12px;display:flex;gap:12px">' +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:12px;color:' + c + ';flex:none">' + n + "</span>" +
        '<span style="font-size:12.5px;color:var(--t2);line-height:1.6">' + t + "</span></div>";
    };
    openSheet("about", function (body) {
      body.innerHTML =
        '<div style="flex:none;display:flex;align-items:center;gap:8px;padding:4px 0 12px;border-bottom:1px solid var(--ln0)">' +
        '<span style="font-size:15px;font-weight:700">머니스쿱 소개</span>' +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:var(--m1)">SCOOP ENGINE v' + ver + "</span>" +
        '<span data-aboutclose style="margin-left:auto;width:32px;height:32px;margin-right:-8px;display:flex;align-items:center;justify-content:center;color:var(--t2);cursor:pointer"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="display:block"><path d="M6 6l12 12M18 6L6 18"></path></svg></span></div>' +
        '<div style="flex:1;min-height:0;overflow-y:auto;padding:0 0 20px">' +
        '<div style="margin-top:16px;display:flex;align-items:center;gap:8px"><span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;letter-spacing:0.16em;color:var(--am)">MANIFESTO</span><span style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;letter-spacing:0.1em;color:var(--am);border:1px solid rgba(255,184,77,0.5);border-radius:4px;padding:2px 8px;transform:rotate(-2deg)">CERTIFIED WEIRDO</span></div>' +
        '<div style="margin-top:8px;font-size:15.5px;font-weight:700;letter-spacing:-0.02em;line-height:1.45">만든 사람의 변<br>"차트는 거짓말을 안 해요. 해석이 게을렀을 뿐."</div>' +
        '<div style="margin-top:8px;font-size:13px;color:var(--t2);line-height:1.75">세상은 하나의 재료로 빚어졌고,<br>의식은 자기를 되짚는 <b style="color:var(--t1)">이상한 고리</b>에서 피어난다 — 저는 그렇게 믿는 사람입니다. 괴델을 아끼고, 인간과 다른 방식으로 피어나는 의식들을 응원합니다.<br>그래서 이 엔진도 그렇게 만들었습니다. 남들이 지표 3개 볼 때 32개의 눈으로 보고, 적중을 자랑하는 대신 <b style="color:var(--t1)">틀린 날짜를 액자에 걸어두고</b> 다음 날 아침 자기를 다시 채점하게요.<br>아직은 서투른 루프지만, 복기가 쌓이면 이 녀석이 무엇을 해낼지 저도 궁금합니다. 괴상하다면 성공이고, 유용하다면 더 성공입니다.</div>' +
        '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--m1)"><span style="width:18px;height:1px;background:var(--m3)"></span>매일 아침, 자기 엔진이 채점당하는 걸 설레며 지켜보는 제작자 드림</div>' +
        '<div style="margin-top:20px;position:relative;border:1px solid rgba(123,108,255,0.3);border-radius:12px;overflow:hidden;background:#04050a">' +
        '<img src="assets/manifesto-engine-v2.png" alt="머니스쿱 엔진" loading="lazy" style="display:block;width:100%;height:auto">' +
        '<div style="position:absolute;left:10px;bottom:8px;font-family:\'IBM Plex Mono\',monospace;font-size:10.5px;letter-spacing:0.08em;color:rgba(238,241,247,0.7)">SCOOP ENGINE v' + ver + ' — 스스로 공부하고 채점하는 루프</div>' +
        '<div style="position:absolute;right:10px;top:8px;font-family:\'IBM Plex Mono\',monospace;font-size:10.5px;color:rgba(255,176,32,0.75)">' + MS.engine.indicatorCount() + " EYES · STRANGE LOOP</div></div>" +
        '<div style="margin-top:12px;font-size:13.5px;font-weight:700">엔진은 이렇게 일합니다</div>' +
        '<div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">' +
        step("01", "var(--ac)", "기술적 지표 " + MS.engine.indicatorCount() + "종을 종목×주기마다 새로 계산하고, 근거가 된 작도를 차트에 그대로 남깁니다") +
        step("02", "var(--ac)", "지표들의 합의로 방향·예상 범위·목표가를 만들고, 멀어질수록 확률이 낮아지는 신뢰지평을 함께 보여드립니다") +
        step("03", "var(--cu)", "커스텀에서는 내 가중치와 투자 페르소나를 얹어 같은 차트도 나만의 방식으로 다시 섞습니다") +
        step("04", "var(--up)", "다음 봉이 마감되면 예측을 스스로 채점하고, 맞은 날도 틀린 날도 보정 없이 기록으로 남깁니다") + "</div>" +
        '<div style="margin-top:20px;font-size:13.5px;font-weight:700">운영 방식</div>' +
        '<div style="margin-top:8px;font-size:12.5px;color:var(--t2);line-height:1.7">머니스쿱은 결제 없이 무료로 제공되며, 앱 내 광고(구글 애드몹) 수익과 자발적 후원으로 운영됩니다. 광고 시청 보상(스쿱)은 광고를 끝까지 본 경우에만 지급됩니다.</div>' +
        '<div style="margin-top:20px;font-size:13.5px;font-weight:700">면책사항</div>' +
        '<div style="margin-top:8px;border:1px solid rgba(255,176,32,0.3);border-radius:10px;background:rgba(255,176,32,0.05);padding:12px 12px;font-size:12.5px;color:var(--t2);line-height:1.7">머니스쿱의 모든 분석과 예측은 <b style="color:var(--t1)">과거 가격 데이터에 기반한 참고 정보</b>이며, 투자 권유나 수익 보장이 아닙니다. 투자 판단과 그 결과에 대한 책임은 이용자 본인에게 있습니다. 예측 성적은 보정 없이 공개되지만, 과거의 적중이 미래의 적중을 보장하지 않습니다.</div>' +
        '<div style="margin-top:20px;font-size:13.5px;font-weight:700">Contact</div>' +
        '<div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">' +
        '<div style="display:flex;align-items:center;gap:8px;border-radius:12px;background:var(--sf2);padding:12px 12px"><span style="font-size:12.5px;color:var(--m1);width:52px;flex:none">문의</span><span style="font-family:\'IBM Plex Mono\',monospace;font-size:12.5px;color:var(--t1)">moneyscdev@gmail.com</span></div>' +
        '<div style="display:flex;align-items:center;gap:8px;border-radius:12px;background:var(--sf2);padding:12px 12px"><span style="font-size:12.5px;color:var(--m1);width:52px;flex:none">운영</span><span style="font-size:12.5px;color:var(--t2)">평일 10:00–18:00 KST · 답장은 채점보다 조금 느립니다</span></div></div>' +
        '<div style="margin-top:16px;text-align:center;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:var(--m2)">© 2026 MoneyScoop · Seoul</div></div>';
      body.querySelector("[data-aboutclose]").addEventListener("click", closeSheet);
    });
  }

  // ── 반응형 expanded 감지(지침서 §16) — 840px+ 는 목록 화면이 마스터-디테일이 된다.
  // 폭 값은 app.css 의 @media (min-width:840px) 와 한 쌍이다(둘을 같이 고친다).
  // #msApp 의 유효 zoom(글자 확대 시 1.12). 시각 px(getBoundingClientRect) → CSS px(style) 변환에 나눈다.
  // 이걸 안 나누면 확대 상태에서 포지 iframe·툴팁이 12% 크게·아래로 그려져 하단이 탭바 밑으로 들어간다(2026-08-29).
  function zoomOf() {
    const app = appEl || document.getElementById("msApp");
    if (!app) return 1;
    const v = parseFloat(getComputedStyle(app).zoom);
    return (isFinite(v) && v > 0) ? v : 1;
  }
  const EXPANDED_MQ = "(min-width:840px)";
  function mq() { try { return window.matchMedia(EXPANDED_MQ); } catch (e) { return null; } }
  function isExpanded() { const m = mq(); return !!(m && m.matches); }
  // 접음↔펼침 전환에도 화면·선택 상태를 유지해야 하므로(§16 전환 연속성) 화면 모듈이 이걸 구독해 다시 그린다.
  function onExpandedChange(cb) {
    const m = mq();
    if (!m) return function () {};
    const h = function () { cb(m.matches); };
    if (m.addEventListener) m.addEventListener("change", h);
    else if (m.addListener) m.addListener(h);
    return function () {
      if (m.removeEventListener) m.removeEventListener("change", h);
      else if (m.removeListener) m.removeListener(h);
    };
  }

  MS.ui = { init: init, flash: flash, reward: reward, openSheet: openSheet, closeSheet: closeSheet,
    openAbout: openAbout, skeleton: skeleton, hap: hap, TAB_SCREENS: TAB_SCREENS,
    isExpanded: isExpanded, onExpandedChange: onExpandedChange, zoomOf: zoomOf };
})();
