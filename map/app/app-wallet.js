/* 머니스쿱 앱 — 경제 모듈: 지갑 클라이언트(서버 트랜잭션·멱등키) + XP·레벨·레벨업 오버레이·캐릭터.
   서버 정본: app-api 지갑 브리지(wallet-lib — 시드 15·상한 15·deep 2/custom 3·출석 일 1회+
   연속 7일 +5·적중 환급 스위프). 클라 scoops 는 서버 잔액의 캐시 — 모든 이동은 서버 먼저,
   네트워크 불가(로컬 dev·오프라인) 시에만 로컬 폴백(연출·흐름은 동일).
   XP(지침서 §8): 게스트는 적립 불가 — '구글 로그인하면 쌓여요' 팝만. 실적립·레벨업은 P8 로그인부터
   자동 활성(코드는 지금 완성 — gLinked 게이트). 캐릭터 저폴리 5종은 아트 교체 지점(§15). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const P = function () { return MS.config.POLICY; };

  // ── 지갑 클라이언트 ──
  let serverOk = null;   // null=미확인, true/false

  const isFixture = !!(MS.data && MS.data.devMode);
  function newIdem(tier) {
    return "sp_" + MS.data.deviceId().slice(0, 8) + "_" + Date.now().toString(36) + "_" + tier;
  }

  async function walletState() {
    try {
      const r = await MS.data.api("wallet_state", {});
      if (r && r.ok) {
        serverOk = true;
        const patch = { scoops: r.balance, walletCap: r.cap, canCheckin: !!r.canCheckin, streakDays: r.streakDays || 0,
          nextSlotAt: r.nextSlotAt || null };   // 다음 정시(ISO) — 출석 카운트다운
        // 서버가 연결 상태의 정본(P8) — 다른 기기에서 탈퇴했거나 병합됐으면 여기서 따라간다
        if (typeof r.linked === "number" && !(MS.auth && MS.auth.stub)) {   // 스텁 링크(dev)는 서버가 모른다
          patch.gLinked = r.linked ? 1 : 0;
          if (r.linked && r.nick) patch.nick = r.nick;
          if (r.linked && r.gname) patch.gName = r.gname;
          if (!r.linked) { patch.nick = null; patch.gName = null; }
        }
        MS.store.set(patch);
        MS.store.persistSoon();
        if (r.hitRefunds > 0) {
          MS.ui.reward("scoop", r.hitRefunds, { label: "적중 환급" });
        }
        return r;
      }
    } catch (e) { serverOk = false; }
    return null;
  }

  // 차감 — 서버 먼저(멱등키), 실패 분기: insufficient → null 반환(부족), 네트워크 → 로컬 폴백
  async function spend(tier, ref) {
    const cost = tier === "deep" ? P().scoop.costDeep : P().scoop.costCustom;
    const idem = newIdem(tier);
    try {
      const r = await MS.data.api("wallet_spend", { tier: tier, idem: idem, ref: ref, engine: (window.ForgeCore && ForgeCore.version) || "" });
      if (r && r.ok) {
        serverOk = true;
        MS.store.set({ scoops: r.balance });
        MS.store.persistSoon();
        return { ok: true, idem: idem, cost: cost, server: true };
      }
      if (r && r.reason === "insufficient") return { ok: false, reason: "insufficient" };
      // 서버 거절(형식 등) — 로컬 폴백하지 않는다(원장 정합)
      return { ok: false, reason: (r && r.reason) || "server" };
    } catch (e) {
      // 네트워크 불가 — 로컬 폴백(dev·오프라인). 서버 복구 시 wallet_state 가 잔액을 재동기화한다.
      serverOk = false;
      const s = MS.store.get();
      if (s.scoops < cost) return { ok: false, reason: "insufficient" };
      MS.store.set({ scoops: s.scoops - cost });
      MS.store.persistSoon();
      return { ok: true, idem: idem, cost: cost, server: false };
    }
  }

  async function refund(spendInfo) {
    if (!spendInfo) return;
    if (spendInfo.server) {
      try {
        const r = await MS.data.api("wallet_refund", { idem: spendInfo.idem });
        if (r && typeof r.balance === "number") { MS.store.set({ scoops: r.balance }); MS.store.persistSoon(); return; }
      } catch (e) { /* 폴백 아래 */ }
    }
    MS.store.set(function (p2) { return { scoops: p2.scoops + spendInfo.cost }; });
    MS.store.persistSoon();
  }

  async function checkin() {
    try {
      const r = await MS.data.api("wallet_checkin", {});
      if (r && r.ok) {
        MS.store.set({ scoops: r.balance, canCheckin: false, streakDays: r.streakDays || 0, nextSlotAt: r.nextSlotAt || MS.store.get().nextSlotAt });
        MS.store.persistSoon();
        const chest = r.granted > P().scoop.checkin.amount;
        MS.ui.reward("scoop", r.granted, { label: chest ? ("연속 " + P().scoop.streak.days + "일 보너스!") : "출석 보상" });
        return r;
      }
      if (r && r.reason === "already") { MS.ui.flash("이번 시간 출석은 받았어요 — 다음 정시에 다시", ""); MS.store.set({ canCheckin: false }); }
      else if (r && r.granted === 0 && r.capped) { MS.ui.flash("지갑이 가득 차서 적립을 못 했어요 — 쓰고 다시 받아요", ""); }
      return null;
    } catch (e) {
      MS.ui.flash("네트워크가 불안정해요 — 잠시 뒤 다시", "");
      return null;
    }
  }

  // ── XP · 레벨 (게스트 게이트 — 지침서 §8) ──
  function addXp(n, label) {
    const s = MS.store.get();
    if (!s.gLinked) {   // 게스트 — 적립 없음. 콘텐츠를 가리는 중앙 팝 대신 하단 토스트로 로그인만 유도
      MS.ui.flash("로그인하면 경험치가 쌓여요", "");   // '+N'(실제 안 받음) 표기 제거 — 오해 소지
      return;
    }
    const was = MS.config.levelOf(s.xp);
    const g0 = gaugeOf(s.xp);
    MS.store.set({ xp: s.xp + n, xpToday: (s.xpToday || 0) + n });
    MS.store.persistSoon();
    const now = MS.config.levelOf(s.xp + n);
    const g1 = gaugeOf(s.xp + n);
    // 게이지가 차는 장면을 같이 보여준다(2026-08-29 사용자: "채워지는 느낌이 부족") — 레벨업이면 100%까지
    MS.ui.reward("xp", n, { label: label || "", gauge: { from: g0.pct, to: now > was ? 100 : g1.pct, lv: was, cur: g1.cur, max: g1.max, up: now > was } });
    if (now > was) setTimeout(function () { levelUpOverlay(was, now); levelUpFill(now); }, 900);
  }

  // 레벨 게이지 수치 — 헤더·연출·지갑 화면이 같은 계산을 쓴다
  function gaugeOf(xp) {
    const L = P().xp.levels, lv = MS.config.levelOf(xp);
    const lo = lv <= 1 ? 0 : L[lv - 2];
    const hi = lv > L.length ? lo + 1 : L[lv - 1];
    const pct = lv > L.length ? 100 : Math.max(0, Math.min(100, Math.round((xp - lo) / (hi - lo) * 100)));
    return { lv: lv, cur: xp - lo, max: hi - lo, pct: pct, maxed: lv > L.length };
  }

  // 레벨업 풀충전(2026-08-29 정책) — 서버가 상한까지 채우고 레벨당 1회를 보장한다
  async function levelUpFill(level) {
    if (!P().scoop.levelupFill || isFixture) return;
    try {
      const r = await MS.data.api("wallet_levelup", { level: level });
      if (r && r.ok) {
        MS.store.set({ scoops: r.balance, walletCap: r.cap || MS.store.get().walletCap });
        MS.store.persistSoon();
        if (r.granted > 0) setTimeout(function () { MS.ui.reward("scoop", r.granted, { label: "레벨업 풀충전" }); }, 1400);
      }
    } catch (e) { /* 오프라인 — 다음 부팅 wallet_state 가 잔액을 맞춘다(서버가 이미 채웠을 수 있다) */ }
  }

  // 일일 훅(dayVisit) — 오늘 첫 방문 +5 · 메뉴 첫 방문 +3(탭당 1회)
  function visitXp(screen) {
    const s = MS.store.get();
    const today = MS.state.dayKey(Date.now());
    const dv = (s.dayVisit && s.dayVisit.d === today) ? s.dayVisit : { d: today };
    const dv2 = {};
    Object.keys(dv).forEach(function (k) { dv2[k] = dv[k]; });
    let changed = false;
    if (!dv2.login) {
      dv2.login = 1; changed = true;
      setTimeout(function () { addXp(P().xp.firstVisit, "오늘 첫 방문"); }, 450);
    }
    const MENUS = { signal: 1, score: 1, stats: 1, chart: 1, wallet: 1 };
    if (MENUS[screen] && !dv2["m_" + screen]) {
      dv2["m_" + screen] = 1; changed = true;
      setTimeout(function () { addXp(P().xp.menuFirst, "메뉴 둘러보기"); }, 450);
    }
    if (changed) { MS.store.set({ dayVisit: dv2 }); MS.store.persistSoon(); }
  }

  // ── 저폴리 캐릭터 5종(아트 교체 지점 — §15) — 레벨 색: 실버→그린→틸→바이올렛→골드 ──
  const LV_COLORS = [["#c3c9d6", "#8b93a7"], ["#7fe0bb", "#2ea679"], ["#7fd8e8", "#1d99b0"], ["#b9a9ff", "#7b6cff"], ["#f0d27a", "#c1901a"]];
  function charSvg(lv, size) {
    const c = LV_COLORS[Math.max(0, Math.min(4, lv - 1))];
    const deco = lv >= 2 ? '<circle cx="32" cy="10" r="3.4" fill="' + c[1] + '"/>' : "";
    const deco2 = lv >= 3 ? '<path d="M14 20l-5-4M50 20l5-4" stroke="' + c[1] + '" stroke-width="2.4" stroke-linecap="round"/>' : "";
    const deco3 = lv >= 4 ? '<path d="M20 8l4-5 4 4 4-4 4 5" fill="none" stroke="' + c[1] + '" stroke-width="2" stroke-linejoin="round"/>' : "";
    const aura = lv >= 5 ? '<circle cx="32" cy="30" r="27" fill="none" stroke="' + c[0] + '" stroke-width="1.4" stroke-dasharray="3 5" opacity="0.7"><animateTransform attributeName="transform" type="rotate" from="0 32 30" to="360 32 30" dur="9s" repeatCount="indefinite"/></circle>' : "";
    return '<svg viewBox="0 0 64 60" width="' + (size || 58) + '" height="' + (size || 54) + '" style="display:block" aria-hidden="true">' +
      aura + deco3 +
      '<polygon points="32,12 44,22 40,38 24,38 20,22" fill="' + c[0] + '"/>' +
      '<polygon points="32,12 44,22 32,26" fill="' + c[1] + '" opacity="0.75"/>' +
      '<polygon points="24,38 40,38 42,52 22,52" fill="' + c[1] + '"/>' +
      '<circle cx="28" cy="24" r="1.8" fill="#0a0c12"/><circle cx="37" cy="24" r="1.8" fill="#0a0c12"/>' +
      deco + deco2 + "</svg>";
  }

  function levelUpOverlay(from, to) {
    const app = document.getElementById("msApp");
    if (!app) return;
    MS.ui.hap("done");
    const names = ["스쿱 견습생", "스쿱 서기", "스쿱 분석가", "스쿱 장인", "스쿱 오라클"];
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;background:rgba(4,5,9,0.78);backdrop-filter:blur(6px);animation:msLvDim 0.4s ease both;cursor:pointer";
    el.innerHTML =
      '<div style="position:relative;width:300px;border-radius:18px;background:linear-gradient(165deg,var(--sf2),var(--sf1));border:1px solid rgba(46,217,160,0.4);box-shadow:0 30px 80px -20px rgba(0,0,0,0.8);padding:26px 22px 20px;text-align:center;animation:msLvCard 0.6s cubic-bezier(0.2,0.9,0.25,1.2) 0.1s both;overflow:hidden">' +
      '<div style="position:absolute;left:50%;top:86px;width:190px;height:190px;transform:translate(-50%,-50%);border:1px solid rgba(46,217,160,0.5);border-radius:50%;animation:msLvBurst 1.1s ease-out 0.45s both;pointer-events:none"></div>' +
      '<div class="mono" style="font-size:11px;letter-spacing:0.22em;color:var(--up)">LEVEL UP</div>' +
      '<div style="margin-top:14px;display:flex;align-items:center;justify-content:center;gap:16px">' +
      '<div style="animation:msLvOld 0.8s ease 0.5s both"><div style="filter:grayscale(0.4)">' + charSvg(from) + '</div><div style="margin-top:4px;font-size:10.5px;color:var(--m2)">Lv.' + from + "</div></div>" +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--up)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>' +
      '<div style="animation:msLvNew 0.9s cubic-bezier(0.2,0.9,0.3,1.3) 0.75s both">' + charSvg(to) + '<div style="margin-top:4px;font-size:11px;font-weight:700;color:var(--up)">Lv.' + to + "</div></div></div>" +
      '<div style="margin-top:12px;font-size:18px;font-weight:800;letter-spacing:-0.02em">' + names[Math.min(4, to - 1)] + "</div>" +
      '<div style="margin-top:7px;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--cu);border:1px solid rgba(210,165,22,0.4);border-radius:99px;padding:5px 12px"><span class="mono">◈ 스쿱 풀충전 · 상한 +' + P().scoop.capPerLevel + '</span>지갑 상한 +' + P().scoop.capPerLevel + "</div>" +
      '<div style="margin-top:16px;min-height:44px;border-radius:10px;background:var(--up);color:#06231a;font-size:13.5px;font-weight:700;display:flex;align-items:center;justify-content:center">좋아요, 계속하기</div>' +
      '<div style="margin-top:8px;font-size:10.5px;color:var(--m2)">화면을 탭해도 닫혀요</div></div>';
    el.addEventListener("click", function () { if (el.parentNode) el.parentNode.removeChild(el); });
    app.appendChild(el);
  }

  MS.wallet = { state: walletState, spend: spend, refund: refund, checkin: checkin };
  MS.xp = { add: addXp, visit: visitXp, charSvg: charSvg, levelUpOverlay: levelUpOverlay, gaugeOf: gaugeOf };
})();
