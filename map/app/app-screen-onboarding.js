/* 머니스쿱 앱 — 첫 실행 여정: boot(인트로)·landing·pick·obres·ob2~ob7.
   마크업 원본: 프로토 L1872~1879(boot) · L108~149(landing) · L151~172(pick) ·
   L174~329(obres·ob2~7) · L1864~1870(마니페스토 바). 동선 로직: dissection/03 §7-1.
   obres 결과 카드의 판정·목표·범위는 전부 엔진 실출력(MS.reports) — 더미 수치 이식 금지. */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmtPrice(v) {
    if (v == null || !isFinite(v)) return "—";
    return v >= 1000 ? Math.round(v).toLocaleString("en-US") : (Math.round(v * 100) / 100).toFixed(2);
  }

  const LOGO_WAVE =
    '<svg viewBox="0 0 24 24" width="76" height="76" style="display:block;filter:drop-shadow(0 14px 34px rgba(123,108,255,0.45))" aria-hidden="true">' +
    '<rect x="0" y="0" width="24" height="24" rx="7" fill="var(--logo-plate)"></rect>' +
    '<rect x="4.5" y="13.5" width="4" height="6" rx="1.4" fill="var(--logo-a)"></rect>' +
    '<rect x="10" y="9.5" width="4" height="10" rx="1.4" fill="var(--logo-b)"></rect>' +
    '<rect x="15.5" y="4.5" width="4" height="15" rx="1.4" fill="var(--logo-c)"></rect>' +
    '<path d="M2.5 13.5C6 13.5 7 8.5 12 9.5s6.5 6.5 9 5" fill="none" stroke="#eef1f7" stroke-width="0.9" opacity="0.85"></path></svg>';

  function maniBar() {
    return '<button class="ms-mani" data-act="mani"><span class="mk">MANIFESTO</span>' +
      '<span class="tx">만든 사람의 변 · 엔진 소개</span><span class="ar">→</span></button>';
  }
  function bindMani(host) {
    const b = host.querySelector('[data-act="mani"]');
    if (b) b.addEventListener("click", function () { MS.ui.flash(str("toast.comingSoon"), ""); });
  }

  // ── boot: 인트로 영상(1회) — Skip 우상단, 종료 시 landing ──
  MS.router.register("boot", {
    mount: function (host) {
      host.style.background = "#000";
      host.innerHTML =
        '<video autoplay muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" src="assets/intro.mp4"></video>' +
        '<button data-act="skip" style="position:absolute;right:14px;top:14px;z-index:2;font-size:12.5px;color:rgba(255,255,255,0.85);' +
        'background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.25);border-radius:99px;padding:8px 16px;cursor:pointer;font-family:inherit">Skip</button>';
      const vid = host.querySelector("video");
      const done = function () { if (MS.store.get().screen === "boot") MS.router.go("landing"); };
      vid.addEventListener("ended", done);
      vid.addEventListener("error", done);   // 영상 실패 시에도 여정은 계속(폴백)
      host.querySelector('[data-act="skip"]').addEventListener("click", done);
    }
  });

  // ── landing ──
  MS.router.register("landing", {
    mount: function (host) {
      host.classList.remove("ms-screen");
      host.className = "ob-wrap";
      host.innerHTML =
        '<div style="position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;padding-bottom:76px;display:flex;flex-direction:column">' +
        '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;padding:24px 24px 0;min-height:480px">' +
        '<div style="position:absolute;left:-80px;right:-80px;top:6%;height:420px;background:radial-gradient(52% 46% at 50% 42%,rgba(123,108,255,0.2),rgba(210,165,22,0.05) 58%,transparent 76%);pointer-events:none"></div>' +
        '<div style="position:relative;width:150px;height:150px;display:flex;align-items:center;justify-content:center;animation:msRevealUp 0.7s cubic-bezier(0.2,0.8,0.25,1) 0.05s both">' +
        '<svg viewBox="0 0 150 150" width="150" height="150" style="position:absolute;inset:0" aria-hidden="true">' +
        '<circle cx="75" cy="75" r="70" fill="none" stroke="rgba(123,108,255,0.28)" stroke-width="1" stroke-dasharray="3 6"><animateTransform attributeName="transform" type="rotate" from="0 75 75" to="360 75 75" dur="34s" repeatCount="indefinite"></animateTransform></circle>' +
        '<circle cx="75" cy="75" r="58" fill="none" stroke="rgba(210,165,22,0.22)" stroke-width="0.8" stroke-dasharray="1.5 7"><animateTransform attributeName="transform" type="rotate" from="360 75 75" to="0 75 75" dur="26s" repeatCount="indefinite"></animateTransform></circle>' +
        "</svg>" + LOGO_WAVE + "</div>" +
        '<div style="position:relative;margin-top:24px;font-size:34px;font-weight:700;letter-spacing:-0.04em;animation:msRevealUp 0.7s cubic-bezier(0.2,0.8,0.25,1) 0.15s both">머니스쿱</div>' +
        '<div style="position:relative;margin-top:10px;text-align:center;animation:msRevealUp 0.7s cubic-bezier(0.2,0.8,0.25,1) 0.25s both">' +
        '<div style="font-size:14px;color:var(--m1);line-height:1.5">매일 대신 지켜보고, 아침마다 스스로 채점하는</div>' +
        '<div style="margin-top:3px;font-size:19px;font-weight:700;letter-spacing:-0.02em;background:linear-gradient(90deg,#c3c9d6,#9d93ff 48%,#d2a516);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:inline-block">스쿱 엔진</div></div>' +
        '<div style="position:relative;margin-top:20px;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px;animation:msRevealUp 0.7s cubic-bezier(0.2,0.8,0.25,1) 0.33s both">' +
        landingCard('<span style="position:relative;width:8px;height:8px;flex:none"><span style="position:absolute;inset:0;border-radius:50%;background:var(--am)"></span><span style="position:absolute;inset:0;border-radius:50%;background:var(--am);animation:msPing 1.8s ease-out infinite"></span></span>', "시그널 알림", "관심 종목의 이상 움직임을<br>실시간으로 감지") +
        landingCard('<svg viewBox="0 0 24 24" width="15" height="15" style="display:block;flex:none" aria-hidden="true"><rect x="3" y="13" width="4" height="8" rx="1.2" fill="var(--logo-a)"></rect><rect x="10" y="9" width="4" height="12" rx="1.2" fill="var(--logo-b)"></rect><rect x="17" y="4" width="4" height="17" rx="1.2" fill="var(--logo-c)"></rect></svg>', "3단계 분석", "지표 32종, 가중치와<br>페르소나까지 커스텀") +
        landingCard('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--up)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 6.5"></path></svg>', "아침 자동 채점", "모든 예측을 다음 날<br>결과와 대조해 기록") +
        landingCard('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--cy)" stroke-width="2" stroke-linecap="round" style="display:block;flex:none" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path></svg>', "열린 통계", "엔진 성적과 사용 통계를<br>숨김없이 공개") +
        "</div>" +
        '<div style="position:relative;margin-top:14px;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--m1);animation:msRevealUp 0.7s cubic-bezier(0.2,0.8,0.25,1) 0.4s both"><span style="font-family:\'IBM Plex Mono\',monospace;font-size:13px;font-weight:600;color:var(--cu)">₩0</span>전부 무료 · 광고로 운영 · 결제 없음</div>' +
        "</div>" +
        '<div style="flex:none;padding:0 16px;animation:msRevealUp 0.7s cubic-bezier(0.2,0.8,0.25,1) 0.42s both">' +
        '<button class="ms-cta-primary big" data-act="start"><span class="t">시작하기</span></button>' +
        '<div style="margin:12px 0 8px;text-align:center;font-size:13px;color:var(--m1)">회원가입 없이 · 가입 선물 <b style="color:var(--ac);font-family:\'IBM Plex Mono\',monospace">◈ 15</b></div>' +
        "</div></div>" + maniBar();
      host.querySelector('[data-act="start"]').addEventListener("click", function () { MS.router.go("pick"); });
      bindMani(host);
    }
  });
  function landingCard(icon, title, desc) {
    return '<div style="border-radius:12px;background:var(--sf1);padding:12px 13px">' +
      '<div style="display:flex;align-items:center;gap:7px">' + icon +
      '<span style="font-size:13.5px;font-weight:700;white-space:nowrap">' + title + "</span></div>" +
      '<div style="margin-top:5px;font-size:11.5px;color:var(--m1);line-height:1.55">' + desc + "</div></div>";
  }

  // ── pick: 종목 1개 필수 선택 → 무료 기본 분석 실주행 ──
  MS.router.register("pick", {
    mount: function (host) {
      host.className = "ob-wrap";
      let sel = null;
      function render() {
        host.innerHTML =
          '<div class="ob-scroll" style="padding-bottom:24px">' +
          '<div style="padding:20px 16px 0">' +
          '<div style="font-size:22px;font-weight:700;letter-spacing:-0.03em;line-height:1.3">어떤 종목이 궁금하세요?</div>' +
          '<div style="margin-top:8px;font-size:13.5px;color:var(--t2);line-height:1.6">하나만 골라 보세요. 매일 대신 지켜보고 아침마다 채점해 드립니다.</div></div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px;padding:16px 16px 0">' +
          MS.data.MASTER.map(function (t) {
            const on = sel === t.sym;
            return '<button class="pick-chip' + (on ? " on" : "") + '" data-sym="' + esc(t.sym) + '">' +
              esc(t.sym) + " " + esc(t.name) + (on ? " ✓" : "") + "</button>";
          }).join("") + "</div>" +
          '<div style="margin:12px 16px 0;border:1px solid rgba(123,108,255,0.3);border-radius:12px;background:rgba(123,108,255,0.06);padding:12px 16px;display:flex;align-items:center;gap:12px">' +
          '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:22px;font-weight:600;color:var(--ac)">◈ 15</span>' +
          '<div style="font-size:13px;color:var(--t2);line-height:1.5"><b style="color:var(--t1)">가입 선물</b> : 심화 7번 · 커스텀 5번 · 기본 무제한</div></div>' +
          '<div style="margin:16px 16px 0">' +
          '<button class="ms-cta-primary big" data-act="go"' + (sel ? "" : " disabled") + ">" +
          '<span class="t">' + (sel ? "이 종목으로 시작" : "종목을 골라 주세요") + "</span>" +
          '<span class="s">무료 · 도구 5개 기본 분석부터</span></button></div>' +
          '<div style="margin:12px 16px 0;text-align:center;font-size:12px;color:var(--m2)">1 / 7 · 잠깐이면 됩니다</div>' +
          "</div>" + maniBar();
        host.querySelectorAll("[data-sym]").forEach(function (b) {
          b.addEventListener("click", function () { sel = b.getAttribute("data-sym"); render(); });
        });
        host.querySelector('[data-act="go"]').addEventListener("click", function () {
          if (!sel) return;
          MS.store.set({ picks: [sel], ticker: sel, tf: "일" });
          MS.store.persistSoon();
          MS.runStart({ symbol: sel, tfKo: "일", tier: "basic", obFlow: 1 });
        });
        bindMani(host);
      }
      render();
    }
  });

  // ── obres: 1/7 첫 분석 결과(엔진 실출력) ──
  MS.router.register("obres", {
    mount: function (host) {
      host.className = "ob-wrap";
      const s = MS.store.get();
      const rep = MS.reports && MS.reports[(s.ticker || "") + "|일"];
      const v = rep ? rep.verdict : null;
      const dirTxt = v ? (v.dir === "up" ? "▲ 상승" : v.dir === "down" ? "▼ 하락" : "— 중립") : "—";
      const dirC = v ? (v.dir === "up" ? "var(--up)" : v.dir === "down" ? "var(--dn)" : "var(--t2)") : "var(--t2)";
      host.innerHTML =
        '<div class="ob-scroll">' +
        '<div class="ob-head"><span class="ob-badge">1 / 7 · 첫 분석 완료</span>' +
        '<div class="ob-title">방금 보신 게<br>무료 기본 분석입니다</div></div>' +
        '<div class="ob-card" style="border:1px solid var(--ln2);padding:16px">' +
        '<div style="display:flex;align-items:baseline;gap:8px">' +
        '<span style="font-size:14px;font-weight:700">' + esc(s.ticker) + "</span>" +
        '<span style="font-size:12.5px;color:var(--m1)">일봉 · 도구 5개</span>' +
        '<span style="margin-left:auto;font-size:11.5px;color:var(--m1);white-space:nowrap">홈에 저장됨</span></div>' +
        '<div style="margin-top:12px;display:flex;align-items:baseline;gap:12px">' +
        '<span style="font-size:24px;font-weight:700;color:' + dirC + ';letter-spacing:-0.02em;animation:msVerdictPop 0.6s cubic-bezier(0.2,0.8,0.3,1.2) 0.3s both;display:inline-block">' + dirTxt + "</span>" +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:14px;color:var(--t2)">' + (v ? v.prob + "%" : "") + "</span></div>" +
        '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;color:var(--t2)">' +
        "<span>목표 <b style=\"color:var(--t1)\">" + (v ? fmtPrice(v.target) : "—") + "</b></span>" +
        "<span>범위 <b style=\"color:var(--t1)\">" + (v ? fmtPrice(v.rangeLo) + " ~ " + fmtPrice(v.rangeHi) : "—") + "</b></span></div>" +
        '<div style="margin-top:12px;border-top:1px dashed var(--ln1);padding-top:12px;font-size:12.5px;color:var(--m1);line-height:1.6">기본 분석은 채점하지 않아요 — 채점·기록은 심화·커스텀부터 · 이제 이 앱이 매일 하는 일을 볼 차례</div>' +
        "</div></div>" +
        '<div class="ob-ctazone">' +
        '<button class="ms-cta-primary" data-act="next"><span class="t">다음 — 이 앱이 하는 일</span></button>' +
        '<button class="ob-skip" data-act="skip">건너뛰고 바로 시작</button></div>' + maniBar();
      host.querySelector('[data-act="next"]').addEventListener("click", function () { MS.router.go("ob2"); });
      host.querySelector('[data-act="skip"]').addEventListener("click", obSkip);
      bindMani(host);
    }
  });

  function obSkip() {
    const s = MS.store.get();
    MS.store.set({ obFlow: 0 });
    if (s.picks.length) { MS.router.go("home"); MS.ui.flash("소개는 헤더 ⓘ에서 다시 볼 수 있어요", ""); }
    else MS.router.go("pick");
  }

  // ── ob2~ob7: 기능 소개(정적 예시 카드 — 프로토 원문) ──
  function obScreen(no, next, badgeCls, badgeTxt, title, desc, cardHtml, lastCta) {
    return {
      mount: function (host) {
        host.className = "ob-wrap";
        host.innerHTML =
          '<div class="ob-scroll"><div class="ob-head">' +
          '<span class="ob-badge ' + badgeCls + '">' + badgeTxt + "</span>" +
          '<div class="ob-title">' + title + "</div>" +
          '<div class="ob-desc">' + desc + "</div></div>" +
          cardHtml + "</div>" +
          '<div class="ob-ctazone">' +
          '<button class="ms-cta-primary' + (lastCta ? " big" : "") + '" data-act="next"><span class="t">' + (lastCta || "다음") + "</span></button>" +
          (lastCta ? '<div style="margin-top:10px;font-size:12.5px;color:transparent;pointer-events:none">.</div>'
                   : '<button class="ob-skip" data-act="skip">건너뛰고 바로 시작</button>') +
          "</div>" + maniBar();
        host.querySelector('[data-act="next"]').addEventListener("click", function () {
          if (next === "home") {
            MS.store.set({ obFlow: 0, dashKick: (MS.store.get().dashKick || 0) + 1 });
            MS.store.persistSoon();
            MS.router.go("home");
            MS.ui.flash("준비 끝. 내일 아침 채점에서 만나요", "");
          } else MS.router.go(next);
        });
        const sk = host.querySelector('[data-act="skip"]');
        if (sk) sk.addEventListener("click", obSkip);
        bindMani(host);
      }
    };
  }
  function row(dot, name, right, rightStyle, last) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px' + (last ? "" : ";border-bottom:1px solid var(--ln0)") + '">' +
      dot + '<span style="font-size:13px;font-weight:600;white-space:nowrap">' + name + "</span>" +
      '<span style="margin-left:auto;' + rightStyle + ';white-space:nowrap;flex:none">' + right + "</span></div>";
  }
  const dot = function (c) { return '<span style="width:7px;height:7px;border-radius:50%;background:' + c + ';flex:none"></span>'; };

  MS.router.register("ob2", obScreen(2, "ob3", "", "2 / 7 · 시그널",
    "이상한 움직임은<br>먼저 알려드립니다",
    '관심 종목의 거래량 급증, 변동성 확대, 밴드 이탈 같은 <b style="color:var(--t1)">눈에 띄는 움직임</b>을 감지해 시그널로 띄웁니다. 왜 떴는지 근거까지 함께. 페르소나가 자랄수록 <b style="color:var(--cu)">내 성향 신호부터</b> 올라옵니다.',
    '<div class="ob-card" style="padding:8px">' +
    row(dot("var(--am)"), "NVDA 거래량 평균의 2.4배", "오늘 14:32", "font-size:11px;color:var(--m2)") +
    row(dot("var(--dn)"), "AMZN 볼린저 하단 이탈", "오늘 11:05", "font-size:11px;color:var(--m2)") +
    row(dot("var(--ac)"), "BTC/USD 변동성 급확대", "오늘 13:05", "font-size:11px;color:var(--m2)", true) +
    "</div>"));

  MS.router.register("ob3", obScreen(3, "ob4", "", "3 / 7 · 분석",
    "5개로 시작해서,<br>32개로 깊게 봅니다",
    "기본은 언제나 무료. 더 깊게 보고 싶을 때만 스쿱을 씁니다.",
    '<div class="ob-card" style="background:transparent;display:flex;flex-direction:column;gap:8px">' +
    '<div style="border-radius:12px;background:var(--sf1);padding:12px 16px;display:flex;align-items:center;gap:12px"><span style="font-size:12.5px;font-weight:700;color:#1a1e27;background:linear-gradient(135deg,#e8edf5,#b7c0d1);border-radius:6px;padding:2px 10px;flex:none">기본</span><span style="font-size:13px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">핵심 지표 5개 · 방향과 범위</span><span style="margin-left:auto;font-size:12px;color:var(--up);white-space:nowrap;flex:none">무료</span></div>' +
    '<div style="border-radius:12px;background:var(--sf1);border:1px solid rgba(123,108,255,0.35);padding:12px 16px;display:flex;align-items:center;gap:12px"><span style="font-size:12.5px;font-weight:700;color:#0a0c12;background:linear-gradient(135deg,#b3a9ff,#7b6cff);border-radius:6px;padding:2px 10px;flex:none">심화</span><span style="font-size:13px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">지표 32개 · 관점 프리셋 · 2차 예측</span><span style="margin-left:auto;font-family:\'IBM Plex Mono\',monospace;font-size:12px;color:var(--ac);white-space:nowrap;flex:none">◈ 2</span></div>' +
    '<div style="border-radius:12px;background:var(--sf1);border:1px solid rgba(210,165,22,0.4);padding:12px 16px;display:flex;align-items:center;gap:12px"><span style="font-size:12.5px;font-weight:700;color:#1a1204;background:linear-gradient(135deg,#ecca5e,#c1901a);border-radius:6px;padding:2px 10px;flex:none">커스텀</span><span style="font-size:13px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">가중치 직접 조절 · 3차 예측까지</span><span style="margin-left:auto;font-family:\'IBM Plex Mono\',monospace;font-size:12px;color:var(--cu);white-space:nowrap;flex:none">◈ 3</span></div>' +
    "</div>"));

  MS.router.register("ob4", obScreen(4, "ob5", "", "4 / 7 · 채점",
    "예측은 다음 날 아침<br>스스로 채점됩니다",
    '맞은 날도 틀린 날도 <b style="color:var(--t1)">기록으로 남고</b>, 적중하면 스쿱도 돌려드립니다.',
    '<div class="ob-card" style="padding:8px">' +
    row('<span style="font-size:13px;font-weight:700;white-space:nowrap">NVDA</span>', '<span style="font-size:11.5px;color:var(--m1)">일봉 · 심화</span>', "적중 +1.4%", "font-size:12.5px;font-weight:600;color:var(--up)") +
    row('<span style="font-size:13px;font-weight:700;white-space:nowrap">MSFT</span>', '<span style="font-size:11.5px;color:var(--m1)">일봉 · 커스텀</span>', "빗나감 −0.8%", "font-size:12.5px;font-weight:600;color:var(--dn)") +
    row('<span style="font-size:13px;font-weight:700;white-space:nowrap">AAPL</span>', '<span style="font-size:11.5px;color:var(--m1)">주봉 · 심화</span>', "D-5 대기", "font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--am)", true) +
    "</div>"));

  MS.router.register("ob5", obScreen(5, "ob6", "gold", "5 / 7 · 페르소나",
    "답할수록<br>나에게 맞춰집니다",
    '가벼운 질문에 하나씩 답하면 <b style="color:var(--cu)">투자 페르소나</b>가 쌓이고, 지표 가중치와 함께 커스텀 예측이 점점 내 성향대로 정교해집니다.',
    '<div class="ob-card" style="padding:16px">' +
    '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12.5px;font-weight:600;white-space:nowrap">페르소나 정밀도</span><span style="margin-left:auto;font-size:12px;font-weight:600;color:var(--cu);flex:none;white-space:nowrap">「윤곽 잡는 중」 · 12답</span></div>' +
    '<div style="margin-top:8px;height:5px;border-radius:3px;background:var(--sf3);overflow:hidden"><span style="display:block;height:100%;width:60%;background:linear-gradient(90deg,#7b6cff,#d2a516);border-radius:3px"></span></div>' +
    '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:4px">' +
    '<span style="font-size:11.5px;color:var(--cu);border:1px solid rgba(210,165,22,0.4);border-radius:99px;padding:4px 8px;white-space:nowrap">역발상 매수형</span>' +
    '<span style="font-size:11.5px;color:var(--cu);border:1px solid rgba(210,165,22,0.4);border-radius:99px;padding:4px 8px;white-space:nowrap">스윙 호흡</span>' +
    '<span style="font-size:11.5px;color:var(--cu);border:1px solid rgba(210,165,22,0.4);border-radius:99px;padding:4px 8px;white-space:nowrap">추세 우선</span>' +
    '<span style="font-size:11.5px;color:var(--m2);border:1px dashed var(--ln2);border-radius:99px;padding:4px 8px;white-space:nowrap">+ 답할수록 추가</span>' +
    "</div></div>"));

  MS.router.register("ob6", obScreen(6, "ob7", "", "6 / 7 · 통계",
    "엔진의 성적은<br>숨기지 않습니다",
    '분석 엔진 사용량, 관점 분포, 예측이 잘 맞은 사용자까지 — <b style="color:var(--t1)">스쿱엔진의 활동을 통계로 공개</b>합니다.',
    '<div class="ob-card" style="padding:16px;display:flex;align-items:center;gap:16px">' +
    '<div style="display:flex;align-items:flex-end;gap:4px;height:44px;flex:1">' +
    [38, 52, 44, 70, 58].map(function (h, i) {
      return '<span style="flex:1;height:' + h + "%;background:rgba(123,108,255,0." + (4 + i) + ');border-radius:2px 2px 0 0"></span>';
    }).join("") +
    '<span style="flex:1;height:86%;background:#7b6cff;border-radius:2px 2px 0 0;animation:msPredPulse 1.8s ease-in-out infinite"></span></div>' +
    '<div style="flex:none;text-align:right"><div style="font-family:\'IBM Plex Mono\',monospace;font-size:19px;font-weight:600;color:var(--ac)">62.4%</div><div style="margin-top:2px;font-size:11.5px;color:var(--m1)">이번 주 엔진 적중</div></div>' +
    "</div>"));

  MS.router.register("ob7", obScreen(7, "home", "green", "7 / 7 · 무료",
    "전부 무료입니다.<br>결제는 없습니다",
    '머니스쿱은 <b style="color:var(--t1)">광고 시청과 후원으로만</b> 운영됩니다. 스쿱은 출석, 광고, 일일 미션으로 채우면 충분합니다.',
    '<div class="ob-card" style="padding:16px">' +
    '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--ln0);font-size:12.5px;color:var(--t2)">' +
    '<span><b style="color:var(--ac)">◈ 스쿱</b> = 분석 연료 · 출석·광고로 충전</span>' +
    '<span><b style="color:var(--up)">레벨</b> = 쓸수록 커지는 혜택</span>' +
    '<span><b style="color:var(--cu)">페르소나</b> = 나만의 정확도</span></div>' +
    '<div style="display:flex;align-items:center;justify-content:center;gap:8px"><span style="font-family:\'IBM Plex Mono\',monospace;font-size:28px;font-weight:600;color:var(--ac)">◈ 15</span><span style="font-size:13px;color:var(--t2)">가입 선물</span></div>' +
    '<div style="margin-top:12px;display:flex;justify-content:center;flex-wrap:wrap;gap:8px">' +
    ["출석 +1", "광고 1편 +3", "7일 연속 +5", "적중 환급 +1"].map(function (t) {
      return '<span style="font-size:12px;color:var(--t2);border:1px solid var(--ln1);border-radius:99px;padding:4px 12px;white-space:nowrap">' + t + "</span>";
    }).join("") + "</div></div>",
    "머니스쿱 시작하기"));
})();
