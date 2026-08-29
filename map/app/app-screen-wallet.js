/* 머니스쿱 앱 — 내 스쿱 화면(일반 화면 — 지침서 §2).
   원본: 프로토 wallet L1924~2056. ① 3개념 표 ② 분석가 레벨(게스트=잠금 티저 · 캐릭터 ·
   오늘의 미션) ③ 스쿱 지갑(잔고/상한 셀 · 출석=서버 일 1회+연속 7일 · 광고=P10 AdMob 스텁)
   ④ 계정(구글 로그인 P8)·설정(테마 · 글자 크기 · 알림 · 버전 · 초기화 · 탈퇴).
   잔고·출석은 서버 정본(MS.wallet), XP·레벨은 로그인 후 활성(게스트 잠금 — 지침서 §8). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const P = function () { return MS.config.POLICY; };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  function mount(host) {
    const nextSlotTxt = MS.wallet.nextSlotTxt;
    function render() {
      const s = MS.store.get();
      const pol = P();
      const cap = s.walletCap || pol.scoop.capBase;
      const lv = MS.config.levelOf(s.xp);
      const streak = s.streakDays || 0;
      const today = MS.state.dayKey(Date.now());
      const dv = (s.dayVisit && s.dayVisit.d === today) ? s.dayVisit : {};
      const missions = [
        { n: "오늘 첫 방문", xp: pol.xp.firstVisit, done: !!dv.login },
        { n: "메뉴 둘러보기", xp: pol.xp.menuFirst, done: !!(dv.m_signal && dv.m_score && dv.m_stats), sub: "시그널·채점·통계 각 +" + pol.xp.menuFirst },
        { n: "심화 분석 1회", xp: pol.xp.analysisFirst, done: !!dv.ax_deep },
        { n: "커스텀 분석 1회", xp: pol.xp.analysisFirst, done: !!dv.ax_custom },
        { n: "페르소나 " + pol.limits.persona.perDay + "답", xp: pol.xp.personaAnswer * pol.limits.persona.perDay, done: MS.state.personaToday(s) >= pol.limits.persona.perDay },
        { n: "작도 토글 " + pol.xp.drawToggle.perDay + "회", xp: pol.xp.drawToggle.xp * pol.xp.drawToggle.perDay, done: (s.dayCounters && s.dayCounters.drawXp >= pol.xp.drawToggle.perDay) }
      ];

      host.innerHTML =
        '<div style="padding:0 0 90px">' +
        '<div style="padding:16px 16px 0"><div style="font-size:19px;font-weight:700;letter-spacing:-0.03em">내 스쿱</div></div>' +

        // 3개념 표(지침서 §8 상시 노출)
        '<div style="margin:12px 16px 0;border-radius:14px;background:var(--sf1);padding:12px 14px;display:flex;flex-direction:column;gap:7px;font-size:12.5px;color:var(--t2)">' +
        '<span><b style="color:var(--ac)">◈ 스쿱</b> = 분석 연료 · 출석·광고로 충전</span>' +
        '<span><b style="color:var(--up)">레벨</b> = 쓸수록 커지는 혜택</span>' +
        '<span><b style="color:var(--cu)">페르소나</b> = 나만의 정확도</span></div>' +

        // 분석가 레벨
        (s.gLinked ?
          '<div style="margin:12px 16px 0;border-radius:14px;background:var(--sf1);padding:16px">' +
          '<div style="display:flex;align-items:center;gap:14px">' +
          '<div style="animation:msFloatY 3s ease-in-out infinite">' + MS.xp.charSvg(lv, 64) + "</div>" +
          '<div style="min-width:0;flex:1"><div style="font-size:15px;font-weight:700">Lv.' + lv + " " + MS.xp.levelName(lv) + "</div>" +
          '<div style="margin-top:4px;font-size:11.5px;color:var(--m1)">오늘 경험치 +' + (s.xpToday || 0) + "</div>" +
          '<div style="margin-top:8px;height:5px;border-radius:3px;background:var(--sf3);overflow:hidden"><span style="display:block;height:100%;width:' + lvPct(s.xp) + '%;background:linear-gradient(90deg,var(--up),var(--ac))"></span></div></div></div>' +
          '<div style="margin-top:12px;border-top:1px solid var(--ln0);padding-top:10px">' +
          '<div style="font-size:12.5px;font-weight:700">오늘의 미션</div>' +
          missions.map(function (m) {
            return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;font-size:12.5px;color:' + (m.done ? "var(--m2)" : "var(--t2)") + '">' +
              '<span style="width:16px;height:16px;border-radius:5px;border:1.5px solid ' + (m.done ? "var(--up)" : "var(--ln2)") + ";color:var(--up);display:flex;align-items:center;justify-content:center;font-size:10px;flex:none" + (m.done ? ";background:rgba(46,217,160,0.15)" : "") + '">' + (m.done ? "✓" : "") + "</span>" +
              '<span style="min-width:0">' + esc(m.n) + (m.sub ? ' <span style="color:var(--m2);font-size:11px">(' + esc(m.sub) + ")</span>" : "") + (m.locked ? ' <span style="color:var(--m2);font-size:11px">' + m.locked + "</span>" : "") + "</span>" +
              '<span class="mono" style="margin-left:auto;font-size:11.5px;color:var(--up)">+' + m.xp + "</span></div>";
          }).join("") + "</div></div>"
          :
          '<div data-act="login" style="margin:12px 16px 0;border:1px dashed var(--ln2);border-radius:14px;background:var(--sf1);padding:16px;display:flex;align-items:center;gap:14px;cursor:pointer">' +
          '<div style="filter:grayscale(0.8);opacity:0.6">' + MS.xp.charSvg(1, 56) + "</div>" +
          '<div style="min-width:0;flex:1"><div style="font-size:14px;font-weight:700;color:var(--t3)">분석가 레벨 — 잠김</div>' +
          '<div style="margin-top:4px;font-size:12px;color:var(--m1);line-height:1.6">구글로 로그인하면 경험치가 쌓이고<br>레벨업마다 지갑 상한이 +' + pol.scoop.capPerLevel + " 커져요</div></div>" +
          '<span style="flex:none;font-size:12.5px;color:var(--ac);border:1px solid rgba(123,108,255,0.45);border-radius:99px;padding:7px 14px">로그인</span></div>') +

        // 스쿱 지갑
        '<div style="margin:12px 16px 0;border-radius:14px;background:var(--sf1);padding:16px">' +
        '<div style="display:flex;align-items:baseline;gap:8px">' +
        '<span class="mono" style="font-size:32px;font-weight:700;color:var(--ac)">◈ ' + s.scoops + "</span>" +
        '<span class="mono" style="font-size:13px;color:var(--m1)">/ ' + cap + "</span>" +
        '<span style="margin-left:auto;font-size:11.5px;color:' + (s.scoops >= cap ? "var(--am)" : "var(--m2)") + '">' + (s.scoops >= cap ? "가득 참 — 쓰기 전엔 적립 안 돼요" : "심화 " + Math.floor(s.scoops / pol.scoop.costDeep) + "번 · 커스텀 " + Math.floor(s.scoops / pol.scoop.costCustom) + "번") + "</span></div>" +
        '<div style="margin-top:10px;display:flex;gap:3px">' +
        (function () {
          let cells = "";
          for (let i = 0; i < cap; i++) cells += '<span style="flex:1;height:8px;border-radius:2px;background:' + (i < s.scoops ? "var(--ac)" : "var(--sf3)") + '"></span>';
          return cells;
        })() + "</div>" +
        // 출석
        '<div data-act="checkin" style="margin-top:14px;border:1px solid ' + (s.canCheckin ? "rgba(46,217,160,0.45)" : "var(--ln1)") + ';border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer' + (s.canCheckin ? ";animation:msAttGlow 1.8s ease-in-out infinite" : "") + '">' +
        '<div style="min-width:0;flex:1"><div style="font-size:13.5px;font-weight:700;color:' + (s.canCheckin ? "var(--up)" : "var(--t2)") + '">' + (s.canCheckin ? "정시 보상 도착 — 받기" : ("다음 보상 " + nextSlotTxt(s.nextSlotAt))) + "</div>" +
        '<div style="margin-top:3px;font-size:11.5px;color:var(--m1)">매시간 정시에 ◈+' + pol.scoop.checkin.amount + ' · 연속 ' + streak + "일째 · " + pol.scoop.streak.days + "일 채우면 ◈+" + pol.scoop.streak.bonus + "</div>" +
        '<div style="margin-top:6px;display:flex;gap:4px">' +
        (function () {
          let dots = "";
          for (let i = 0; i < pol.scoop.streak.days; i++) dots += '<span style="width:6px;height:6px;border-radius:50%;background:' + (i < (streak % pol.scoop.streak.days || (streak && streak % pol.scoop.streak.days === 0 ? pol.scoop.streak.days : 0)) ? "var(--up)" : "var(--sf3)") + '"></span>';
          return dots;
        })() + "</div></div>" +
        '<span class="mono" style="flex:none;font-size:15px;font-weight:700;color:' + (s.canCheckin ? "var(--up)" : "var(--m2)") + '">+' + pol.scoop.checkin.amount + "</span></div>" +
        // 광고(P10 AdMob)
        '<button data-act="ad" style="margin-top:8px;width:100%;min-height:50px;border-radius:12px;border:1px solid rgba(123,108,255,0.35);background:rgba(123,108,255,0.07);display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-family:inherit">' +
        '<span style="font-size:14px;font-weight:600;color:var(--ac)">광고 1편 보기</span><span class="mono" style="font-size:12.5px;color:var(--ac)">◈+' + pol.scoop.ad.scoop + '</span><span class="mono" style="font-size:12.5px;color:var(--up)">+' + pol.scoop.ad.xp + "XP</span></button>" +
        '<div style="margin-top:6px;font-size:10.5px;color:var(--m2);text-align:center">' + (MS.ads && MS.ads.native ? "끝까지 봐야 적립됩니다 · 오늘 남은 광고 " + (s.adRemaining == null ? "—" : s.adRemaining) + "편" : "광고 보상은 앱(스토어) 버전에서 열려요 · 끝까지 봐야 적립됩니다") + "</div>" +
        "</div>" +

        // 계정 · 설정
        '<div style="margin:12px 16px 0;border-radius:14px;background:var(--sf1);overflow:hidden">' +
        row("acct", "구글 계정", s.gLinked ? ("연결됨" + ((s.gName || s.nick) ? " · " + esc(s.gName || s.nick) : "") + (s.gName && s.nick ? " (리더보드 " + esc(s.nick) + ")" : "")) : "게스트 — 로그인하면 기록이 계정에 안전하게 보관돼요", s.gLinked ? "로그아웃" : "로그인") +
        rowToggle("noti", "알림", !s.notiOff) +
        row("theme", "테마", s.theme === "dark" ? "다크" : "라이트", "전환") +
        rowSeg("fz", "글자 크기", s.fontZoom) +
        '<div style="display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid var(--ln0);font-size:13px;color:var(--t2)"><span>앱 버전</span><span class="mono" style="margin-left:auto;color:var(--m2)">' + esc(MS.config.POLICY.app.version) + ' · 엔진 ' + esc((window.ForgeCore && ForgeCore.version) || "") + "</span></div>" +
        row("reset", "데이터 초기화", "이 기기의 기록을 지우고 처음부터", "초기화") +
        row("withdraw", "회원 탈퇴", s.gLinked ? "서버 기록 삭제 · 구글 연결 해제" : "계정과 서버 기록 삭제(로그인 후 이용)", s.gLinked ? "탈퇴" : "") +
        "</div>" +
        '<div style="margin:14px 16px 0;font-size:11px;color:var(--m2);line-height:1.7">스쿱·기록은 서버에 안전하게 보관돼요 · 예측은 참고용이며 투자 판단과 책임은 본인에게 있습니다.</div>' +
        "</div>";
      bind();
    }

    function lvPct(xp) {
      const L = P().xp.levels;
      const lv = MS.config.levelOf(xp);
      const lo = lv <= 1 ? 0 : L[lv - 2];
      const hi = lv > L.length ? lo + 1 : L[lv - 1];
      return Math.max(0, Math.min(100, Math.round((xp - lo) / (hi - lo) * 100)));
    }
    function row(act, title, sub, btn) {
      return '<div data-act="' + act + '" style="display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid var(--ln0);cursor:pointer">' +
        '<div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:600">' + title + "</div>" +
        (sub ? '<div style="margin-top:2px;font-size:11.5px;color:var(--m1)">' + sub + "</div>" : "") + "</div>" +
        (btn ? '<span style="flex:none;font-size:12px;color:var(--ac);border:1px solid rgba(123,108,255,0.35);border-radius:99px;padding:5px 12px">' + btn + "</span>" : "") + "</div>";
    }
    function rowToggle(act, title, on) {
      return '<div data-act="' + act + '" style="display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid var(--ln0);cursor:pointer">' +
        '<span style="font-size:13px;font-weight:600">' + title + "</span>" +
        '<span style="margin-left:auto;width:40px;height:22px;border-radius:11px;background:' + (on ? "var(--up)" : "var(--sf3)") + ';position:relative;transition:background 0.2s"><span style="position:absolute;top:2px;' + (on ? "right:2px" : "left:2px") + ';width:18px;height:18px;border-radius:50%;background:#fff"></span></span></div>';
    }
    function rowSeg(act, title, fz) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid var(--ln0)">' +
        '<span style="font-size:13px;font-weight:600">' + title + "</span>" +
        '<span style="margin-left:auto;display:flex;gap:4px;background:var(--sf2);border-radius:9px;padding:3px">' +
        '<button data-act="fz0" style="min-width:44px;padding:6px 10px;border-radius:7px;border:0;cursor:pointer;font-family:inherit;font-size:12px;color:' + (!fz ? "var(--t1)" : "var(--m1)") + ";background:" + (!fz ? "var(--sf3)" : "transparent") + '">가</button>' +
        '<button data-act="fz1" style="min-width:44px;padding:6px 10px;border-radius:7px;border:0;cursor:pointer;font-family:inherit;font-size:14px;color:' + (fz ? "var(--t1)" : "var(--m1)") + ";background:" + (fz ? "var(--sf3)" : "transparent") + '">가</button></span></div>';
    }

    function bind() {
      const on = function (act, fn) {
        host.querySelectorAll('[data-act="' + act + '"]').forEach(function (el) { el.addEventListener("click", fn); });
      };
      on("checkin", function () {
        if (!MS.store.get().canCheckin) { MS.ui.flash("다음 보상은 " + nextSlotTxt(MS.store.get().nextSlotAt) + " 정시에 열려요", ""); return; }
        MS.wallet.checkin().then(render);
      });
      on("ad", function () { MS.ads.watch().then(function (r) { if (r && r.rewarded) render(); }); });
      on("login", function () { MS.auth.start(); });
      on("acct", function () { if (MS.store.get().gLinked) MS.auth.logoutConfirm(); else MS.auth.start(); });   // 로그아웃은 한 번 묻는다
      on("noti", function () {
        const s = MS.store.get();
        MS.store.set({ notiOff: s.notiOff ? 0 : 1 });
        MS.ui.flash(s.notiOff ? "알림을 켰어요" : "알림을 껐어요", "");
        render();
      });
      on("theme", function () {
        const nt = MS.store.get().theme === "dark" ? "light" : "dark";
        MS.store.set({ theme: nt });
        MS.store.persistSoon();
        MS.ui.flash(nt === "dark" ? "다크 테마로 바꿨어요" : "라이트 테마로 바꿨어요", "");
        render();
      });
      on("fz0", function () { MS.store.set({ fontZoom: 0 }); MS.store.persistSoon(); render(); });
      on("fz1", function () { MS.store.set({ fontZoom: 1 }); MS.store.persistSoon(); MS.ui.flash("글자를 12% 키웠어요", ""); render(); });
      on("reset", function () {
        try { localStorage.removeItem(MS.state.STORE_KEY); } catch (e) {}
        MS.ui.flash("초기화했어요 — 처음부터 시작합니다", "");
        setTimeout(function () { location.reload(); }, 600);
      });
      on("withdraw", function () {
        if (!MS.store.get().gLinked) { MS.ui.flash("탈퇴는 구글 로그인 이후 계정 메뉴에서 진행돼요", ""); return; }
        // 확인 절차(프로토 withdrawTap 문구) — 실제 삭제는 서버 withdraw 후 로컬 초기화
        if (!window.confirm("모든 서버 기록(경험치·페르소나·닉네임)이 삭제되고 구글 연결이 해제돼요. 계속할까요?")) return;
        MS.auth.withdraw();
      });
    }

    render();
    MS.wallet.state().then(function () {
      if (MS.store.get().screen === "wallet") render();
    });
    const unsub = MS.store.subscribe(function (keys) {
      if (MS.store.get().screen !== "wallet") { unsub(); return; }
      if (keys && ["gLinked", "nick", "xp", "canCheckin", "scoops", "nextSlotAt", "streakDays"].some(function (k) { return keys.indexOf(k) >= 0; })) render();   // 정시 경계·출석·레벨업 풀충전이 화면에 바로 반영
    });
  }

  // 정시 경계를 넘으면 서버 상태를 다시 물어 버튼이 저절로 열린다(화면에 있는 동안만, 20초 주기)
  let tickT = null;
  const mountWithTick = function (host) {
    mount(host);
    if (tickT) clearInterval(tickT);
    let lastSlot = Math.floor(Date.now() / 3600000);
    tickT = setInterval(function () {
      if (MS.store.get().screen !== "wallet") return;
      const slot = Math.floor(Date.now() / 3600000);
      if (slot !== lastSlot) { lastSlot = slot; if (MS.wallet) MS.wallet.state(); }   // 구독이 render 를 다시 부른다
      const el = host.querySelector("[data-act=checkin]");
      if (el && !MS.store.get().canCheckin) {   // 카운트다운 분 단위 갱신(전체 재렌더 없이)
        const t = el.querySelector("div > div");
        if (t) t.textContent = "다음 보상 " + nextSlotTxt(MS.store.get().nextSlotAt);
      }
    }, 20000);
  };
  MS.router.register("wallet", { mount: mountWithTick, unmount: function () { if (tickT) { clearInterval(tickT); tickT = null; } } });
})();
