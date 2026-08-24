/* 머니스쿱 앱 — 홈(오늘의 종목 스쿱) v1.
   원본: 프로토 dash L1370~1629. P1 범위: 히어로 3카드(관심종목=실데이터 · 시그널/채점=상태 자리) ·
   주간 분석/연속 방문 · 내 관심 종목 그리드(실시세) · 분석 현황 매트릭스(실기록) ·
   페르소나 카드 자리(게스트 티저 — P6) · 지연 고지·면책. 시그널/채점 실데이터는 P4/P3. */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;
  const TIER_C = { basic: "#8b93a7", deep: "#7b6cff", custom: "var(--cu)" };
  const TIER_N = { basic: "기본", deep: "심화", custom: "커스텀" };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmtPrice(v) {
    if (v == null || !isFinite(v)) return "—";
    return v >= 1000 ? Math.round(v).toLocaleString("en-US") : (Math.round(v * 100) / 100).toFixed(2);
  }
  function fmtChg(c) { return (c >= 0 ? "▲" : "▼") + Math.abs(c).toFixed(2) + "%"; }

  function mount(host, ctx) {
    let quotes = {};   // sym → {price, chg, up}
    const s0 = MS.store.get();

    function render() {
      const s = MS.store.get();
      const picks = s.picks;
      if (!picks.length) { renderEmpty(); return; }
      const now = new Date();
      const meta = (now.getMonth() + 1) + "." + now.getDate() + " " +
        String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + " 기준";

      // 히어로1 — 실등락 집계
      const qs = picks.map(function (p) { return quotes[p]; }).filter(Boolean);
      const upN = qs.filter(function (q) { return q.up; }).length;
      const dnN = qs.length - upN;
      const avg = qs.length ? qs.reduce(function (a, q) { return a + q.chg; }, 0) / qs.length : null;
      let top = null;
      qs.forEach(function (q, i) { if (!top || Math.abs(q.chg) > Math.abs(top.chg)) top = { sym: picks[i], chg: q.chg }; });
      const upW = qs.length ? Math.round(upN / qs.length * 100) : 50;

      // 채점 예정 = 심화·커스텀 기록 수(basic 제외 — 지침서 §6)
      const waitN = Object.keys(s.analyzed).filter(function (k) { return s.analyzed[k] !== "basic"; }).length;
      const todayAna = Object.keys(s.analyzedAt).filter(function (k) {
        return MS.state.dayKey(s.analyzedAt[k]) === MS.state.dayKey(Date.now());
      }).length;
      const streak = (s.dayCounters && s.dayCounters.streak) || 0;

      host.innerHTML =
        '<div style="padding-bottom:20px">' +
        '<div style="padding:16px 16px 0;animation:msRevealUp 0.55s cubic-bezier(0.2,0.8,0.25,1) both">' +
        '<div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:19px;font-weight:700;letter-spacing:-0.03em;white-space:nowrap">' + str("home.todayTitle") + "</span>" +
        '<span class="mono" style="font-size:12px;color:var(--m1);white-space:nowrap">' + meta + "</span></div></div>" +

        // 히어로 3카드
        '<div style="display:flex;gap:8px;padding:12px 16px 0;animation:msRevealUp 0.55s cubic-bezier(0.2,0.8,0.25,1) 0.08s both">' +
        '<div style="flex:1;min-width:0;border-radius:14px;background:var(--sf1);padding:12px;position:relative;overflow:hidden">' +
        '<div style="position:absolute;inset:0;background:radial-gradient(130% 90% at 0% 0%,rgba(46,217,160,0.12),transparent 58%)"></div>' +
        '<div style="position:relative">' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--m1)"><span style="position:relative;width:6px;height:6px;flex:none"><span style="position:absolute;inset:0;border-radius:50%;background:var(--up)"></span><span style="position:absolute;inset:0;border-radius:50%;background:var(--up);animation:msPing 2.4s ease-out infinite"></span></span>오늘의 관심종목</div>' +
        '<div class="mono" style="margin-top:8px;font-size:22px;font-weight:700;color:' + (avg == null ? "var(--m1)" : avg >= 0 ? "var(--up)" : "var(--dn)") + ';line-height:1">' + (avg == null ? "—" : (avg >= 0 ? "+" : "") + avg.toFixed(2) + "%") + "</div>" +
        '<div style="margin-top:8px;display:flex;align-items:center;gap:4px"><span class="mono" style="font-size:11.5px;color:var(--up);flex:none">' + upN + '▲</span><div style="flex:1;display:flex;gap:2px;height:5px;border-radius:3px;overflow:hidden;background:var(--sf3)"><span style="width:' + upW + '%;background:var(--up)"></span><span style="width:' + (100 - upW) + '%;background:var(--dn)"></span></div><span class="mono" style="font-size:11.5px;color:var(--dn);flex:none">' + dnN + "▼</span></div>" +
        '<div class="mono" style="margin-top:8px;font-size:11.5px;color:' + (top ? (top.chg >= 0 ? "var(--up)" : "var(--dn)") : "var(--m2)") + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (top ? esc(top.sym) + " " + fmtChg(top.chg) : "시세 불러오는 중") + "</div>" +
        "</div></div>" +
        heroStub("오늘의 시그널", "var(--ac)", "rgba(123,108,255,0.1)", '<span class="mono" style="font-size:22px;font-weight:700;color:var(--ac);line-height:1">0</span><span style="font-size:12.5px;color:var(--t2)">건</span>', "감지 준비 중", "다음 단계에서 열려요", "sig") +
        '<div data-act="score" style="flex:1;min-width:0;border:1px solid rgba(255,176,32,0.4);border-radius:12px;background:var(--sf1);padding:12px;position:relative;overflow:hidden;cursor:pointer">' +
        '<div style="position:absolute;inset:0;background:radial-gradient(130% 90% at 100% 0%,rgba(255,176,32,0.13),transparent 60%)"></div>' +
        '<div style="position:relative">' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--t2)"><span style="position:relative;width:6px;height:6px;flex:none"><span style="position:absolute;inset:0;border-radius:50%;background:var(--am)"></span><span style="position:absolute;inset:0;border-radius:50%;background:var(--am);animation:msPing 2.4s ease-out infinite"></span></span>오늘의 채점</div>' +
        '<div style="margin-top:8px;display:flex;align-items:baseline;gap:4px"><span class="mono" style="font-size:22px;font-weight:700;color:var(--am);line-height:1">0</span><span style="font-size:12.5px;color:var(--t2)">건</span><span class="mono" style="margin-left:auto;font-size:12px;color:var(--ac);white-space:nowrap;flex:none">예정 ' + waitN + "</span></div>" +
        '<div class="mono" style="margin-top:8px;font-size:13px;color:var(--am);letter-spacing:0.02em">' + (waitN ? "다음 마감 후" : "—") + "</div>" +
        '<div style="margin-top:4px;font-size:11.5px;color:var(--m1);white-space:nowrap">채점은 심화부터 ›</div>' +
        "</div></div>" +
        "</div>" +

        // 주간 분석 · 연속 방문
        '<div style="margin:8px 16px 0;border-radius:14px;background:var(--sf1);display:flex;animation:msRevealUp 0.55s cubic-bezier(0.2,0.8,0.25,1) 0.16s both">' +
        '<div data-act="chart" style="flex:1;min-width:0;padding:12px 12px 8px;cursor:pointer">' +
        '<div style="font-size:11.5px;color:var(--m1);white-space:nowrap">이번 주 분석</div>' +
        '<div style="margin-top:4px;display:flex;align-items:flex-end;gap:2.4px;height:20px">' +
        [0, 0, 0, 0, 0, 0].map(function () { return '<span style="flex:1;height:12%;background:var(--sf3);border-radius:2px 2px 0 0"></span>'; }).join("") +
        '<span style="flex:1;height:' + Math.min(100, 12 + todayAna * 30) + '%;background:var(--ac);border-radius:2px 2px 0 0"></span></div>' +
        '<div style="margin-top:4px;font-size:11px;color:var(--m2);white-space:nowrap">오늘 ' + todayAna + "건 분석</div></div>" +
        '<div style="width:1px;background:var(--ln0);margin:8px 0"></div>' +
        '<div style="flex:0.9;min-width:0;padding:12px 12px 8px">' +
        '<div style="font-size:11.5px;color:var(--m1);white-space:nowrap">연속 방문</div>' +
        '<div style="margin-top:8px;display:flex;align-items:baseline;gap:4px"><span class="mono" style="font-size:16px;font-weight:700;color:var(--up);line-height:1">' + streak + '</span><span style="font-size:11.5px;color:var(--t2)">일째</span></div>' +
        '<div style="margin-top:8px;display:flex;gap:4px">' +
        [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<span style="width:6px;height:6px;border-radius:50%;background:' + (i < streak ? "var(--up)" : "var(--sf3)") + ';flex:none"></span>'; }).join("") + "</div>" +
        '<div style="margin-top:4px;font-size:10.5px;color:var(--m2);white-space:nowrap">7일 채우면 ◈+5</div></div></div>' +

        // 내 관심 종목
        '<div style="margin:16px 16px 0;display:flex;align-items:baseline;gap:8px">' +
        '<span style="font-size:15px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap;flex:none">내 관심 종목</span>' +
        '<span class="mono" style="font-size:13px;color:var(--ac)">' + picks.length + "/" + MS.config.POLICY.limits.stocksMax + "</span>" +
        '<button data-act="add" style="margin-left:auto;font-size:13px;color:var(--ac);border:1px solid rgba(123,108,255,0.45);border-radius:99px;padding:4px 12px;cursor:pointer;white-space:nowrap;flex:none;background:none;font-family:inherit">＋ 추가</button></div>' +
        '<div style="margin:8px 16px 0;display:grid;grid-template-columns:1fr 1fr;gap:4px">' +
        picks.map(function (p) {
          const q = quotes[p];
          const slots = ["일", "주", "월"].map(function (tf) {
            const t = s.analyzed[p + "|" + tf];
            return '<span style="font-size:10.5px;font-weight:600;color:' + (t ? TIER_C[t] : "var(--m3)") + ';white-space:nowrap">' + tf + (t ? " ✓" : "") + "</span>";
          }).join("");
          return '<div data-go="' + esc(p) + '" style="display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 4px 4px 12px;border-radius:10px;background:var(--sf1);cursor:pointer">' +
            '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p) + "</div>" +
            '<div style="margin-top:2px;display:flex;gap:4px">' + slots + "</div></div>" +
            '<div style="flex:none;text-align:right;min-width:0">' +
            '<div class="mono" style="font-size:12.5px;font-weight:600;white-space:nowrap">' + (q ? fmtPrice(q.price) : "—") + "</div>" +
            '<div class="mono" style="margin-top:1px;font-size:11.5px;font-weight:700;color:' + (q ? (q.up ? "var(--up)" : "var(--dn)") : "var(--m2)") + ';white-space:nowrap">' + (q ? fmtChg(q.chg) : "") + "</div></div>" +
            '<span data-del="' + esc(p) + '" style="width:30px;height:40px;display:flex;align-items:center;justify-content:center;color:var(--m2);cursor:pointer;flex:none"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="display:block"><path d="M6 6l12 12M18 6L6 18"></path></svg></span></div>';
        }).join("") + "</div>" +
        '<div style="margin:8px 16px 0;display:flex;gap:12px;font-size:11.5px;color:var(--m2)"><span>✓ = 분석완료 <span style="color:#8b93a7">●기본</span> <span style="color:#7b6cff">●심화</span> <span style="color:var(--cu)">●커스텀</span></span></div>' +

        // 분석 현황 매트릭스
        '<div style="margin:16px 16px 0;border-radius:14px;background:var(--sf1);padding:12px">' +
        '<div style="display:flex;align-items:baseline;gap:8px">' +
        '<span style="font-size:15px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap;flex:none">분석 현황</span>' +
        '<span style="font-size:11.5px;color:var(--m1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">채워진 칸 = 오늘 볼 수 있는 결과</span></div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:8px"><span style="width:78px;flex:none"></span>' +
        ["일봉", "주봉", "월봉"].map(function (t) { return '<span style="flex:1;text-align:center;font-size:11.5px;color:var(--m2)">' + t + "</span>"; }).join("") + "</div>" +
        picks.map(function (p) {
          return '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">' +
            '<span style="width:78px;flex:none;font-size:13px;font-weight:600">' + esc(p) + "</span>" +
            ["일", "주", "월"].map(function (tf) {
              const key = p + "|" + tf;
              const t = s.analyzed[key];
              const at = s.analyzedAt[key];
              const ttl = MS.config.POLICY.analysis.ttlMs;
              const expired = at && !t;
              let style, txt;
              if (t) {
                const age = (Date.now() - at) / ttl;
                style = "border:1px solid " + TIER_C[t] + ";background:transparent;color:" + TIER_C[t] +
                  (age < 0.33 ? ";box-shadow:0 0 8px -2px " + TIER_C[t] : "") +
                  (age > 0.7 ? ";animation:msCellOld 1.6s ease-in-out infinite" : "");
                txt = TIER_N[t];
              } else if (expired) {
                style = "border:1px dashed rgba(255,176,32,0.5);color:var(--am);background:transparent";
                txt = "만료";
              } else {
                style = "border:1px dashed var(--ln1);color:var(--m3);background:transparent";
                txt = "—";
              }
              return '<span data-cell="' + esc(p) + "|" + tf + '" style="flex:1;height:27px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:600;cursor:pointer;' + style + '">' + txt + "</span>";
            }).join("") + "</div>";
        }).join("") +
        '<div style="margin-top:8px;font-size:11.5px;color:var(--m2)"><span style="color:#8b93a7">●</span> 기본 · <span style="color:#7b6cff">●</span> 심화 · <span style="color:var(--cu)">●</span> 커스텀 — 24시간이 지나면 자동 폐기</div></div>' +

        // 페르소나 카드 자리(P6 실구현 — 게스트 티저)
        '<div style="margin:16px 16px 0;border:1px solid rgba(210,165,22,0.3);border-radius:14px;background:var(--sf1);padding:16px">' +
        '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:15px;font-weight:700;color:var(--cu)">투자 페르소나</span><span style="margin-left:auto;font-size:11.5px;color:var(--m2)">잠김</span></div>' +
        '<div style="margin-top:6px;font-size:12.5px;color:var(--m1);line-height:1.6">가벼운 질문에 답할수록 커스텀 분석이 내 성향에 맞춰져요. 곧 열립니다.</div></div>' +

        // 푸터
        '<div style="margin:20px 16px 0;font-size:11px;color:var(--m2);line-height:1.7">시세는 지연될 수 있어요 · 예측은 참고용이며 투자 판단과 책임은 본인에게 있습니다.</div>' +
        "</div>";

      bind();
    }

    function heroStub(title, dotC, tintBg, numHtml, line1, line2, act) {
      return '<div data-act="' + act + '" style="flex:1;min-width:0;border-radius:14px;background:var(--sf1);padding:12px;position:relative;overflow:hidden;cursor:pointer">' +
        '<div style="position:absolute;inset:0;background:radial-gradient(130% 90% at 50% 0%,' + tintBg + ',transparent 60%)"></div>' +
        '<div style="position:relative">' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--m1)"><span style="position:relative;width:6px;height:6px;flex:none"><span style="position:absolute;inset:0;border-radius:50%;background:' + dotC + '"></span></span>' + title + "</div>" +
        '<div style="margin-top:8px;display:flex;align-items:baseline;gap:4px">' + numHtml + "</div>" +
        '<div style="margin-top:8px;font-size:11.5px;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + line1 + "</div>" +
        '<div style="margin-top:4px;font-size:11.5px;color:var(--m1);white-space:nowrap">' + line2 + " ›</div></div></div>";
    }

    function renderEmpty() {
      host.innerHTML =
        '<div style="padding:14px 16px 90px">' +
        '<div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:19px;font-weight:700;letter-spacing:-0.03em">' + str("home.todayTitle") + "</span></div>" +
        '<div style="margin-top:14px;border:1px dashed var(--ln2);border-radius:12px;padding:24px 16px;text-align:center">' +
        '<div style="font-size:13.5px;font-weight:600">' + str("home.emptyTitle") + "</div>" +
        '<div style="margin-top:6px;font-size:12.5px;color:var(--m1);line-height:1.7">' + str("home.emptyDesc") + "</div>" +
        '<button class="ms-cta-primary" data-act="pick" style="margin-top:16px;max-width:240px;margin-left:auto;margin-right:auto"><span class="t">' + str("home.emptyCta") + "</span></button></div></div>";
      const b = host.querySelector('[data-act="pick"]');
      if (b) b.addEventListener("click", function () { MS.router.go("pick"); });
    }

    function bind() {
      host.querySelectorAll("[data-go]").forEach(function (el) {
        el.addEventListener("click", function (e) {
          if (e.target.closest("[data-del]")) return;
          MS.store.set({ ticker: el.getAttribute("data-go") });
          MS.router.go("chart");
        });
      });
      host.querySelectorAll("[data-del]").forEach(function (el) {
        el.addEventListener("click", function () {
          const s = MS.store.get();
          const dc = s.dayCounters;
          if (dc.stockOps >= MS.config.POLICY.limits.stockOpsPerDay) {
            MS.ui.hap("warn"); MS.ui.flash("오늘은 종목 변경을 다 썼어요 — 내일 다시", ""); return;
          }
          const sym = el.getAttribute("data-del");
          const next = s.picks.filter(function (p) { return p !== sym; });
          const dc2 = {}; Object.keys(dc).forEach(function (k) { dc2[k] = dc[k]; });
          dc2.stockOps++;
          MS.store.set({ picks: next, ticker: next[0] || null, dayCounters: dc2 });
          MS.store.persistSoon();
          MS.ui.flash(sym + " 을 뺐어요", "");
          render();
        });
      });
      host.querySelectorAll("[data-cell]").forEach(function (el) {
        el.addEventListener("click", function () {
          const kv = el.getAttribute("data-cell").split("|");
          MS.store.set({ ticker: kv[0], tf: kv[1] });
          MS.router.go("chart");
        });
      });
      ["sig", "score", "add"].forEach(function (a) {
        const el = host.querySelector('[data-act="' + a + '"]');
        if (el) el.addEventListener("click", function () { MS.ui.flash(str("toast.comingSoon"), ""); });
      });
      const ch = host.querySelector('[data-act="chart"]');
      if (ch) ch.addEventListener("click", function () { MS.router.go("chart"); });
    }

    render();
    // 실시세 로드 → 재렌더
    if (s0.picks.length) {
      Promise.all(s0.picks.map(function (p) {
        return MS.data.ohlc.fetch(p, "일").then(function (r) {
          if (r.ok) quotes[p] = MS.data.quote(r.candles);
        }).catch(function () {});
      })).then(function () {
        if (MS.store.get().screen === "home") render();
      });
    }
  }

  MS.router.register("home", {
    mount: mount,
    refresh: function () { const h = document.querySelector("#msMain .ms-screen, #msMain .ob-wrap"); if (h) mount(h, {}); }
  });
})();
