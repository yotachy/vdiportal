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
    if (now > was) {
      MS.store.set({ lvUpAt: Date.now() });   // 홈 카드 NEW 리본·내 스쿱 연혁
      MS.store.persistSoon();
      const before = s.scoops;
      const fill = levelUpFill(now);          // 풀충전은 바로 청구하고, 연출이 '보상' 장면에서 결과를 받아 보여준다
      setTimeout(function () { levelUpOverlay(was, now, { before: before, fill: fill }); }, 900);
    }
  }

  // 레벨 게이지 수치 — 헤더·연출·지갑 화면이 같은 계산을 쓴다
  const LV_NAMES = ["스쿱 견습생", "스쿱 서기", "스쿱 분석가", "스쿱 장인", "스쿱 오라클"];
  function levelName(lv) { return LV_NAMES[Math.max(0, Math.min(LV_NAMES.length - 1, lv - 1))]; }

  function gaugeOf(xp) { return MS.config.levelGauge(xp); }   // 계산은 config 한 곳(헤더·홈·연출 공용)

  // 레벨업 풀충전(2026-08-29 정책) — 서버가 상한까지 채우고 레벨당 1회를 보장한다
  // 결과 {granted, balance, cap} 를 돌려준다(레벨업 연출의 '보상' 장면이 카운트업에 쓴다). 실패·오프라인 = null.
  async function levelUpFill(level) {
    if (!P().scoop.levelupFill || isFixture) return null;
    try {
      const r = await MS.data.api("wallet_levelup", { level: level });
      if (r && r.ok) {
        MS.store.set({ scoops: r.balance, walletCap: r.cap || MS.store.get().walletCap });
        MS.store.persistSoon();
        return r;
      }
    } catch (e) { /* 오프라인 — 다음 부팅 wallet_state 가 잔액을 맞춘다(서버가 이미 채웠을 수 있다) */ }
    return null;
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
    const i = Math.max(0, Math.min(4, lv - 1));
    const c = LV_COLORS[i];
    const W = size || 58, H = Math.round(W * 60 / 64);
    const eyes = '<circle cx="28" cy="27" r="1.9" fill="#0a0c12"/><circle cx="37" cy="27" r="1.9" fill="#0a0c12"/>';
    let body;
    if (i === 0) {          // Lv1 원석 — 거친 덩어리, 움직이지 않는다
      body = '<polygon points="22,16 38,13 46,24 43,42 27,46 17,34" fill="' + c[0] + '"/>' +
        '<polygon points="22,16 38,13 34,25 24,24" fill="' + c[1] + '" opacity="0.55"/>' +
        '<polygon points="27,46 43,42 41,52 25,52" fill="' + c[1] + '"/>' + eyes;
    } else if (i === 1) {   // Lv2 결정 — 깎인 면이 생기고 둥실거린다
      body = '<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2.5;0 0" dur="3.4s" repeatCount="indefinite"/>' +
        '<polygon points="32,8 46,20 42,40 22,40 18,20" fill="' + c[0] + '"/>' +
        '<polygon points="32,8 46,20 32,25 18,20" fill="' + c[1] + '" opacity="0.7"/>' +
        '<polygon points="22,40 42,40 44,52 20,52" fill="' + c[1] + '"/>' + eyes + "</g>";
    } else if (i === 2) {   // Lv3 다면체 — 궤도 링이 돈다
      body = '<ellipse cx="32" cy="31" rx="27" ry="7" fill="none" stroke="' + c[1] + '" stroke-width="1.6" opacity="0.8">' +
        '<animateTransform attributeName="transform" type="rotate" values="-14 32 31;14 32 31;-14 32 31" dur="5s" repeatCount="indefinite"/></ellipse>' +
        '<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="3s" repeatCount="indefinite"/>' +
        '<polygon points="32,7 47,18 44,40 20,40 17,18" fill="' + c[0] + '"/>' +
        '<polygon points="32,7 47,18 32,24" fill="' + c[1] + '" opacity="0.7"/><polygon points="32,7 17,18 32,24" fill="#ffffff" opacity="0.18"/>' +
        '<polygon points="20,40 44,40 45,52 19,52" fill="' + c[1] + '"/>' + eyes + "</g>";
    } else if (i === 3) {   // Lv4 왕관 — 위성 둘이 공전한다
      body = '<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="3s" repeatCount="indefinite"/>' +
        '<path d="M20 12l4-7 4 5 4-6 4 6 4-5 4 7z" fill="' + c[1] + '"/>' +
        '<polygon points="32,10 48,20 44,41 20,41 16,20" fill="' + c[0] + '"/>' +
        '<polygon points="32,10 48,20 32,26" fill="' + c[1] + '" opacity="0.7"/><polygon points="32,10 16,20 32,26" fill="#ffffff" opacity="0.2"/>' +
        '<polygon points="20,41 44,41 46,53 18,53" fill="' + c[1] + '"/>' + eyes + "</g>" +
        '<circle cx="58" cy="30" r="2.6" fill="' + c[0] + '"><animateTransform attributeName="transform" type="rotate" from="0 32 30" to="360 32 30" dur="4.2s" repeatCount="indefinite"/></circle>' +
        '<circle cx="6" cy="30" r="1.8" fill="' + c[1] + '"><animateTransform attributeName="transform" type="rotate" from="0 32 30" to="360 32 30" dur="4.2s" repeatCount="indefinite"/></circle>';
    } else {                // Lv5 오라 — 빛줄기가 숨쉬고 오라가 돈다
      body = '<circle cx="32" cy="30" r="28" fill="none" stroke="' + c[0] + '" stroke-width="1.4" stroke-dasharray="3 5" opacity="0.75">' +
        '<animateTransform attributeName="transform" type="rotate" from="0 32 30" to="360 32 30" dur="14s" repeatCount="indefinite"/></circle>' +
        '<g stroke="' + c[0] + '" stroke-width="1.4" stroke-linecap="round" opacity="0.6"><animate attributeName="opacity" values="0.25;0.85;0.25" dur="2.2s" repeatCount="indefinite"/>' +
        '<path d="M32 1v5M32 54v5M3 30h5M56 30h5M11 9l3 3M50 9l-3 3M11 51l3-3M50 51l-3-3"/></g>' +
        '<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2.5;0 0" dur="2.8s" repeatCount="indefinite"/>' +
        '<path d="M20 12l4-7 4 5 4-6 4 6 4-5 4 7z" fill="' + c[1] + '"/>' +
        '<polygon points="32,10 48,20 44,41 20,41 16,20" fill="' + c[0] + '"/>' +
        '<polygon points="32,10 48,20 32,26" fill="' + c[1] + '" opacity="0.7"/><polygon points="32,10 16,20 32,26" fill="#ffffff" opacity="0.25"/>' +
        '<polygon points="20,41 44,41 46,53 18,53" fill="' + c[1] + '"/>' + eyes + "</g>";
    }
    return '<svg viewBox="0 0 64 60" width="' + W + '" height="' + H + '" style="display:block;overflow:visible" aria-hidden="true">' + body + "</svg>";
  }

  // 숫자 카운트업(보상 장면) — rAF, easeOut
  function countUp(el, from, to, ms) {
    const t0 = performance.now();
    function tick(t) {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // 레벨업 연출 — 선물 개봉(탭) → 진화(구 캐릭터 파편 → 새 캐릭터) → 보상 공개(스쿱 카운트업 · 상한 확장) → 닫기.
  // opts.before = 레벨업 직전 잔액, opts.fill = levelUpFill 프라미스({granted,balance,cap} | null)
  function levelUpOverlay(from, to, opts) {
    const app = document.getElementById("msApp");
    if (!app) return;
    opts = opts || {};
    const c = LV_COLORS[Math.max(0, Math.min(4, to - 1))];
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;background:rgba(4,5,9,0.78);backdrop-filter:blur(6px);animation:msLvDim 0.4s ease both";
    const card = document.createElement("div");
    card.style.cssText = "position:relative;width:300px;border-radius:18px;background:linear-gradient(165deg,var(--sf2),var(--sf1));border:1px solid rgba(46,217,160,0.4);box-shadow:0 30px 80px -20px rgba(0,0,0,0.8);padding:22px 20px 18px;text-align:center;overflow:hidden;animation:msLvCard 0.6s cubic-bezier(0.2,0.9,0.3,1.2) both;transition:border-color 0.6s,box-shadow 0.6s;cursor:pointer";
    el.appendChild(card);
    let phase = "gift";

    // 1) 선물 — 탭해야 열린다('받는다'는 행위)
    card.innerHTML =
      '<div class="mono" style="font-size:11px;letter-spacing:0.22em;color:var(--up)">LEVEL UP</div>' +
      '<div style="position:relative;height:120px;display:flex;align-items:center;justify-content:center;margin-top:8px">' +
      '<div style="position:absolute;width:110px;height:110px;border-radius:50%;background:radial-gradient(closest-side,var(--up),transparent 70%);opacity:0.35;animation:msAuraPulse 1.6s ease-in-out infinite"></div>' +
      '<svg viewBox="0 0 64 64" width="84" height="84" style="position:relative;animation:msGiftBob 1.4s ease-in-out infinite" aria-hidden="true">' +
      '<rect x="8" y="26" width="48" height="32" rx="5" fill="' + c[1] + '"/><rect x="6" y="18" width="52" height="12" rx="4" fill="' + c[0] + '"/>' +
      '<rect x="28" y="18" width="8" height="40" fill="var(--cu)" opacity="0.9"/><rect x="6" y="18" width="52" height="12" rx="4" fill="none"/>' +
      '<path d="M32 18c-6-10-16-8-14-2 2 4 9 4 14 2zm0 0c6-10 16-8 14-2-2 4-9 4-14 2z" fill="var(--cu)"/></svg></div>' +
      '<div style="margin-top:6px;font-size:16px;font-weight:800;letter-spacing:-0.02em">레벨 ' + to + " 선물이 도착했어요</div>" +
      '<div style="margin-top:6px;font-size:12px;color:var(--m1)">탭해서 열기</div>';

    // 2) 진화 — 구 캐릭터가 빛나며 깨지고 그 자리에서 새 캐릭터가 자란다
    function evolve() {
      phase = "evolve";
      MS.ui.hap("levelup");
      card.style.borderColor = c[1]; card.style.boxShadow = "0 30px 80px -20px rgba(0,0,0,0.8), 0 0 60px -18px " + c[1];
      let shards = "";
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2, d = 62 + (k % 3) * 14;
        shards += '<span style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:1.5px;background:' + (k % 2 ? c[0] : c[1]) + ';--dx:' + Math.round(Math.cos(a) * d) + "px;--dy:" + Math.round(Math.sin(a) * d) + 'px;animation:msShard 0.8s cubic-bezier(0.2,0.7,0.3,1) both"></span>';
      }
      card.innerHTML =
        '<div class="mono" style="font-size:11px;letter-spacing:0.22em;color:var(--up)">LEVEL UP</div>' +
        '<div style="position:relative;height:150px;display:flex;align-items:center;justify-content:center">' +
        '<div style="position:absolute;left:50%;top:50%;width:150px;height:150px;transform:translate(-50%,-50%);border:1px solid ' + c[0] + ';border-radius:50%;animation:msLvBurst 1s ease-out both"></div>' + shards +
        '<div style="position:absolute;animation:msLvShatter 0.6s ease-in both">' + charSvg(from, 88) + "</div>" +
        '<div style="position:relative;animation:msLvNew 0.9s cubic-bezier(0.2,0.9,0.3,1.3) 0.45s both">' + charSvg(to, 96) + "</div></div>" +
        '<div style="display:flex;align-items:center;justify-content:center;gap:8px;animation:msRevealUp 0.5s ease 0.9s both">' +
        '<span style="font-size:12px;color:var(--m2)">Lv.' + from + " " + levelName(from) + "</span>" +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="' + c[1] + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>' +
        '<span style="font-size:14px;font-weight:800;color:' + c[0] + '">Lv.' + to + " " + levelName(to) + "</span></div>" +
        '<div data-rw style="margin-top:14px;display:flex;flex-direction:column;gap:8px"></div>';
      setTimeout(rewards, 1500);
    }

    // 3) 보상 — 스쿱 풀충전 카운트업 · 지갑 상한 확장 · 닫기
    function rewards() {
      phase = "reward";
      const box = card.querySelector("[data-rw]");
      const capB = MS.config.scoopCap(from), capA0 = MS.config.scoopCap(to);
      const timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 2500); });
      Promise.race([Promise.resolve(opts.fill || null), timeout]).then(function (r) {
        const capA = (r && r.cap) || capA0;
        const before = typeof opts.before === "number" ? opts.before : MS.store.get().scoops;
        const after = r ? r.balance : null;
        const row = function (delay, inner) {
          return '<div style="display:flex;align-items:center;gap:10px;border-radius:12px;background:var(--sf2);padding:10px 12px;text-align:left;animation:msRevealUp 0.5s ease ' + delay + 's both">' + inner + "</div>";
        };
        box.innerHTML =
          row(0,
            '<span style="font-size:18px;color:var(--ac);flex:none">◈</span><div style="min-width:0;flex:1"><div style="font-size:12.5px;font-weight:700">스쿱 풀충전</div>' +
            (after !== null && after > before
              ? '<div style="font-size:11px;color:var(--m1)">지갑을 상한까지 채웠어요</div></div><span class="mono" style="font-size:16px;font-weight:700;color:var(--ac);white-space:nowrap"><span data-cnt>' + before + "</span></span>"
              : after !== null
                ? '<div style="font-size:11px;color:var(--m1)">지갑이 이미 가득 — 상한만 늘어요</div></div><span class="mono" style="font-size:16px;font-weight:700;color:var(--m2)">' + before + "</span>"
                : '<div style="font-size:11px;color:var(--m1)">다음 접속 때 잔액이 맞춰져요</div></div>')) +
          row(0.35,
            '<span style="font-size:16px;color:var(--cu);flex:none">▮</span><div style="min-width:0;flex:1"><div style="font-size:12.5px;font-weight:700">지갑 상한 확장</div>' +
            '<div style="margin-top:5px;height:5px;border-radius:3px;background:var(--sf3);overflow:hidden"><span data-capbar style="display:block;height:100%;width:' + Math.round(capB / capA * 100) + '%;background:linear-gradient(90deg,var(--ac),var(--cu));transition:width 0.8s cubic-bezier(0.2,0.8,0.25,1)"></span></div></div>' +
            '<span class="mono" style="font-size:13px;color:var(--cu);white-space:nowrap">' + capB + ' <span style="color:var(--m2)">→</span> ' + capA + "</span>") +
          '<div data-close style="margin-top:6px;min-height:44px;border-radius:10px;background:var(--up);color:#06231a;font-size:13.5px;font-weight:700;display:flex;align-items:center;justify-content:center;animation:msRevealUp 0.5s ease 0.75s both">좋아요</div>';
        MS.ui.hap("rewardBig");
        const cnt = box.querySelector("[data-cnt]");
        if (cnt) setTimeout(function () { countUp(cnt, before, after, 900); }, 250);
        const bar = box.querySelector("[data-capbar]");
        if (bar) setTimeout(function () { bar.style.width = "100%"; }, 650);
      });
    }

    card.addEventListener("click", function (e) {
      if (phase === "gift") { evolve(); return; }
      if (phase === "reward" && e.target.closest("[data-close]")) close();
    });
    el.addEventListener("click", function (e) { if (e.target === el && phase === "reward") close(); });
    function close() { if (el.parentNode) el.parentNode.removeChild(el); }
    app.appendChild(el);
  }

  // 다음 정시 표기 — "14:00 (23분)". 서버 nextSlotAt(ISO) 기준, 없으면 로컬 시계로 다음 정시.
  // 내 스쿱 화면과 부족 시트가 같은 문구를 쓴다.
  function nextSlotTxt(iso) {
    let t = iso ? Date.parse(iso) : NaN;
    if (!isFinite(t)) { const d = new Date(); t = (Math.floor(d.getTime() / 3600000) + 1) * 3600000; }
    const d2 = new Date(t), hh = String(d2.getHours()).padStart(2, "0");
    const min = Math.max(0, Math.ceil((t - Date.now()) / 60000));
    return hh + ":00 (" + (min >= 1 ? min + "분" : "곧") + ")";
  }

  MS.wallet = { state: walletState, spend: spend, refund: refund, checkin: checkin, nextSlotTxt: nextSlotTxt };
  MS.xp = { add: addXp, visit: visitXp, charSvg: charSvg, levelUpOverlay: levelUpOverlay, gaugeOf: gaugeOf, levelName: levelName };
})();
