/* 머니스쿱 앱 — 시그널 화면(알림에서 분석으로 잇는 선순환 — 지침서 §7).
   원본: 프로토 sig L1228~1368 + 로직 dissection/03 §5. 데이터는 감지 라이브러리
   (app-signals — 엔진 실계산·결정적 키)가 관심 종목 실봉에서 뽑는다.
   펼침 = 근거 콘텐츠(감지 실측·해석) → 분석 CTA. 과거 통계(표본 N건)는 실측 축적 전이라
   표시하지 않는다(지어내지 않음). 읽음 = state.sigRead(영속 — 서버 동기화는 P8),
   배지 = 오늘 미읽음 수(Q7 확정 — 읽음 반응형). 이탈 시 펼침 초기화는 라우터 훅(sgOpen).
   현재 감지 단위는 일봉(감지 시각 대신 봉 날짜 표기) — 인트라데이·푸시는 서버 스캔 승격(P5+). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;
  const GC = { t: "var(--bl)", m: "var(--up)", v: "var(--cy)", q: "var(--am)", s: "var(--pk)" };
  const GN = { t: "추세", m: "모멘텀", v: "변동성", q: "거래량", s: "구조" };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  function dayLabel(barT) {
    const today = MS.state.dayKey(Date.now());
    const yest = MS.state.dayKey(Date.now() - 86400000);
    if (barT === today) return "오늘";
    if (barT === yest) return "어제";
    const p = barT.split("-");
    return parseInt(p[1], 10) + "." + parseInt(p[2], 10);
  }

  // 워치리스트 스캔(캐시 공유) — 홈·시그널 화면 공용
  MS.scanSignals = async function () {
    const s = MS.store.get();
    const bySym = {};
    await Promise.all(s.picks.map(function (p) {
      return MS.data.ohlc.fetch(p, "일").then(function (r) {
        if (r.ok) bySym[p] = r.candles;
      }).catch(function () {});
    }));
    const all = MS.signals.scan(s.picks, bySym);
    const today = MS.state.dayKey(Date.now());
    const unreadToday = all.filter(function (x) { return x.barT === today && !s.sigRead[x.key]; }).length;
    MS.store.set({ sigTodayN: unreadToday, sigList: all });
    return all;
  };

  function personaTopGroup() {
    const s = MS.store.get();
    const ans = (s.personaAns || []).slice(0, s.personaIdx || 0);
    if (!ans.length) return null;
    const aff = MS.persona.groupAffinity(ans);
    if (!aff.n) return null;
    let best = null;
    ["t", "m", "v", "q", "s"].forEach(function (k) { if (!best || aff.g[k] > aff.g[best]) best = k; });
    return aff.g[best] > 0 ? best : null;
  }

  function mount(host) {
    let list = MS.store.get().sigList || null;
    let search = null, shown = 20, carousel = 0;

    function markRead(key) {
      const s = MS.store.get();
      if (s.sigRead[key]) return;
      const rd = {};
      Object.keys(s.sigRead).forEach(function (k) { rd[k] = s.sigRead[k]; });
      rd[key] = 1;
      const today = MS.state.dayKey(Date.now());
      const unread = (list || []).filter(function (x) { return x.barT === today && !rd[x.key]; }).length;
      MS.store.set({ sigRead: rd, sigTodayN: unread });
      MS.store.persistSoon();
      const isToday = (list || []).some(function (x) { return x.key === key && x.barT === today; });
      if (isToday) MS.xp.add(MS.config.POLICY.xp.signalView, "시그널 확인");
    }

    function carouselHtml() {
      const today = MS.state.dayKey(Date.now());
      const todayN = list.filter(function (x) { return x.barT === today; }).length;
      const pages = [];
      // ① 감지 흐름(봉 날짜별)
      const byDay = {};
      list.forEach(function (x) { byDay[x.barT] = (byDay[x.barT] || 0) + 1; });
      const days = Object.keys(byDay).sort();
      pages.push(days.length ?
        '<div style="display:flex;align-items:flex-end;gap:6px;height:46px">' +
        days.map(function (d) {
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end">' +
            '<span style="width:100%;height:' + Math.min(100, byDay[d] * 20) + '%;background:rgba(123,108,255,0.55);border-radius:2px 2px 0 0"></span>' +
            '<span style="font-size:9px;color:var(--m2)">' + dayLabel(d) + "</span></div>";
        }).join("") + "</div>"
        : '<div style="font-size:12.5px;color:var(--m1);text-align:center;padding:10px 0">최근 3일 감지가 없어요</div>');
      // ② 유형 분포
      const byGrp = {};
      list.forEach(function (x) { byGrp[x.group] = (byGrp[x.group] || 0) + 1; });
      pages.push(Object.keys(byGrp).length ?
        '<div style="display:flex;flex-direction:column;gap:6px">' +
        Object.keys(byGrp).map(function (g) {
          const w = Math.round(byGrp[g] / list.length * 100);
          return '<div style="display:flex;align-items:center;gap:8px"><span style="width:52px;font-size:11.5px;color:var(--t2)">' + GN[g] + "</span>" +
            '<div style="flex:1;height:6px;border-radius:3px;background:var(--sf3)"><span style="display:block;height:100%;width:' + w + "%;background:" + GC[g] + ';border-radius:3px"></span></div>' +
            '<span class="mono" style="width:22px;text-align:right;font-size:11px;color:var(--m1)">' + byGrp[g] + "</span></div>";
        }).join("") + "</div>"
        : '<div style="font-size:12.5px;color:var(--m1);text-align:center;padding:10px 0">감지 유형이 아직 없어요</div>');
      // ③ 종목별
      const bySym = {};
      list.forEach(function (x) { bySym[x.sym] = (bySym[x.sym] || 0) + 1; });
      pages.push(Object.keys(bySym).length ?
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
        Object.keys(bySym).sort(function (a, b) { return bySym[b] - bySym[a]; }).map(function (sym) {
          return '<span style="font-size:11.5px;color:var(--t1);background:var(--sf2);border:1px solid var(--ln1);border-radius:99px;padding:4px 10px">' + esc(sym) + ' <b class="mono" style="color:var(--ac)">' + bySym[sym] + "</b></span>";
        }).join("") + "</div>"
        : '<div style="font-size:12.5px;color:var(--m1);text-align:center;padding:10px 0">종목별 감지가 아직 없어요</div>');
      // ④ 페르소나 연동(P6 전 안내)
      pages.push('<div style="font-size:12.5px;color:var(--t2);line-height:1.7"><b style="color:var(--cu)">페르소나</b>가 쌓이면 내 성향과 맞닿은 신호가 <b style="color:var(--cu)">골드로 먼저</b> 올라와요. 홈의 페르소나 카드에서 질문에 답해 보세요.</div>');
      const titles = ["감지 흐름", "오늘 " + todayN + "건 요약", "종목별 시그널", "시그널 × 페르소나"];
      return '<div data-car style="margin:12px 16px 0;border-radius:14px;background:var(--sf1);padding:12px 14px;touch-action:pan-y">' +
        '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12.5px;font-weight:700">' + titles[carousel] + "</span>" +
        '<span style="margin-left:auto;display:flex;gap:4px">' +
        titles.map(function (_, i) { return '<span style="width:5px;height:5px;border-radius:50%;background:' + (i === carousel ? "var(--ac)" : "var(--sf3)") + '"></span>'; }).join("") + "</span></div>" +
        '<div style="margin-top:10px">' + pages[carousel] + "</div></div>";
    }

    function render() {
      const s = MS.store.get();
      const today = MS.state.dayKey(Date.now());
      const pg = personaTopGroup();
      let rows = (list || []).filter(function (x) { return !search || x.sym === search; });
      if (pg) {   // 내 성향과 맞닿은 신호를 먼저(지침서 §7 — 골드 우선)
        rows = rows.slice().sort(function (a2, b2) {
          const ga = a2.group === pg ? 1 : 0, gb = b2.group === pg ? 1 : 0;
          if (ga !== gb) return gb - ga;
          return a2.barT < b2.barT ? 1 : a2.barT > b2.barT ? -1 : 0;
        });
      }
      const todayN = (list || []).filter(function (x) { return x.barT === today; }).length;

      host.innerHTML =
        '<div style="padding:0 0 90px">' +
        '<div style="padding:16px 16px 0">' +
        '<div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:19px;font-weight:700;letter-spacing:-0.03em">시그널</span>' +
        '<span style="font-size:12px;color:var(--m1)">오늘 ' + todayN + "건 · 3일 보관 " + Math.min(shown, rows.length) + "/" + rows.length + "</span></div>" +
        '<div style="margin-top:6px;font-size:11.5px;color:var(--m2)">관심 종목의 눈에 띄는 움직임을 실봉에서 감지해요 · 항목을 펼치면 왜 떴는지 근거가 보여요</div></div>' +
        (!list ? '<div style="margin:16px;text-align:center;font-size:12.5px;color:var(--m1)">관심 종목 실봉을 훑는 중…</div>' : "") +
        (list ? carouselHtml() : "") +
        (list ?
          '<div style="display:flex;gap:6px;padding:12px 16px 0;align-items:center">' +
          (search ? '<button data-clear style="font-size:11.5px;color:var(--ac);background:rgba(123,108,255,0.1);border:1px solid rgba(123,108,255,0.35);border-radius:99px;padding:5px 12px;cursor:pointer;font-family:inherit">' + esc(search) + " ✕</button>"
            : '<select data-search style="font-size:11.5px;color:var(--m1);background:var(--sf1);border:1px solid var(--ln1);border-radius:99px;padding:5px 10px;font-family:inherit"><option value="">종목 전체</option>' +
              (function () {
                const seen = {};
                return list.filter(function (x) { if (seen[x.sym]) return false; seen[x.sym] = 1; return true; })
                  .map(function (x) { return '<option value="' + esc(x.sym) + '">' + esc(x.sym) + "</option>"; }).join("");
              })() + "</select>") + "</div>" : "") +
        (list && !rows.length ?
          '<div style="margin:16px;border:1px dashed var(--ln2);border-radius:12px;padding:24px 16px;text-align:center">' +
          '<div style="font-size:13.5px;font-weight:600">최근 3일 감지된 신호가 없어요</div>' +
          '<div style="margin-top:6px;font-size:12.5px;color:var(--m1)">조용한 것도 정보예요 — 눈에 띄는 움직임이 생기면 여기에 올라옵니다</div></div>' : "") +
        (list ? rows.slice(0, shown).map(rowHtml).join("") : "") +
        (list && rows.length > shown ? '<button data-more style="display:block;margin:12px auto;font-size:12.5px;color:var(--ac);border:1px solid rgba(123,108,255,0.35);border-radius:99px;padding:8px 20px;background:none;cursor:pointer;font-family:inherit">더 보기</button>' : "") +
        '<div style="margin:14px 16px 0;font-size:11px;color:var(--m2);text-align:center">푸시 알림은 준비 중이에요 · 감지는 봉 확정 기준이라 표시가 늦을 수 있어요</div>' +
        "</div>";
      bind();
    }

    function rowHtml(x) {
      const s = MS.store.get();
      const isOpen = !!(s.sgOpen && s.sgOpen[x.key]);
      const unread = x.barT === MS.state.dayKey(Date.now()) && !s.sigRead[x.key];
      const psy = personaTopGroup() === x.group;   // 내 성향 연동 — 골드 강조
      return '<div data-sig="' + esc(x.key) + '" style="margin:8px 16px 0;border:1px solid ' + (psy ? "rgba(210,165,22,0.5)" : isOpen ? "var(--ln2)" : "var(--ln0)") + ";border-radius:12px;background:" + (psy && !isOpen ? "linear-gradient(135deg,rgba(210,165,22,0.08),var(--sf1) 60%)" : isOpen ? "var(--sf2)" : "var(--sf1)") + ';cursor:pointer;overflow:hidden">' +
        '<div style="display:flex;align-items:center;gap:8px;padding:12px">' +
        '<span style="position:relative;width:7px;height:7px;flex:none"><span style="position:absolute;inset:0;border-radius:50%;background:' + GC[x.group] + '"></span>' +
        (unread ? '<span style="position:absolute;inset:0;border-radius:50%;background:' + GC[x.group] + ';animation:msPing 1.8s ease-out infinite"></span>' : "") + "</span>" +
        '<span style="font-size:13px;font-weight:700;flex:none">' + esc(x.sym) + "</span>" +
        '<span style="font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(x.title) + "</span>" +
        '<span style="margin-left:auto;font-size:11px;color:var(--m2);white-space:nowrap;flex:none">' + dayLabel(x.barT) + "</span>" +
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="var(--m2)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform:' + (isOpen ? "rotate(180deg)" : "none") + ';transition:transform 0.2s;flex:none"><path d="M5 9l7 7 7-7"></path></svg></div>' +
        (!isOpen ? '<div style="padding:0 12px 12px;margin-top:-4px;font-size:12px;color:var(--m1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(x.d) + "</div>" : "") +
        (isOpen ?
          '<div style="border-top:1px solid var(--ln0);padding:12px;background:var(--sf2)">' +
          '<div style="font-size:12.5px;color:var(--t2);line-height:1.7"><b style="color:var(--t1)">감지</b> — ' + esc(x.why) + "</div>" +
          '<div style="margin-top:6px;font-size:12.5px;color:var(--t2);line-height:1.7"><b style="color:var(--t1)">해석</b> — ' + esc(x.mean) + "</div>" +
          '<div style="margin-top:4px;font-size:11px;color:var(--m2)">' + GN[x.group] + " 계열 · " + esc(x.barT) + " 봉 기준</div>" +
          (personaTopGroup() === x.group ? '<div style="margin-top:6px;font-size:11.5px;color:var(--cu)">내 페르소나(' + GN[x.group] + ' 관심)와 맞닿은 신호라 먼저 올렸어요</div>' : "") +
          '<button data-go="' + esc(x.sym) + '" style="margin-top:12px;width:100%;min-height:46px;border-radius:9px;border:0;background:linear-gradient(135deg,#7b6cff,#4a3ce0);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">이 종목 분석하기 →</button></div>'
          : "") +
        "</div>";
    }

    function bind() {
      const sel = host.querySelector("[data-search]");
      if (sel) sel.addEventListener("change", function () { search = sel.value || null; shown = 20; render(); });
      const clr = host.querySelector("[data-clear]");
      if (clr) clr.addEventListener("click", function () { search = null; render(); });
      const more = host.querySelector("[data-more]");
      if (more) more.addEventListener("click", function () { shown += 10; render(); });
      host.addEventListener("scroll", function () {
        const pg = personaTopGroup();
      let rows = (list || []).filter(function (x) { return !search || x.sym === search; });
      if (pg) {   // 내 성향과 맞닿은 신호를 먼저(지침서 §7 — 골드 우선)
        rows = rows.slice().sort(function (a2, b2) {
          const ga = a2.group === pg ? 1 : 0, gb = b2.group === pg ? 1 : 0;
          if (ga !== gb) return gb - ga;
          return a2.barT < b2.barT ? 1 : a2.barT > b2.barT ? -1 : 0;
        });
      }
        if (host.scrollHeight - host.scrollTop - host.clientHeight < 90 && rows.length > shown) {
          shown += 10; render();
        }
      }, { passive: true });
      host.querySelectorAll("[data-sig]").forEach(function (el) {
        el.addEventListener("click", function (e) {
          if (e.target.closest("[data-go]")) return;
          const k = el.getAttribute("data-sig");
          const s = MS.store.get();
          const og = {};
          Object.keys(s.sgOpen || {}).forEach(function (kk) { og[kk] = s.sgOpen[kk]; });
          og[k] = !og[k];
          MS.store.set({ sgOpen: og });
          if (og[k]) markRead(k);   // 펼침과 동시에 읽음(03 §5-2)
          render();
        });
      });
      host.querySelectorAll("[data-go]").forEach(function (b) {
        b.addEventListener("click", function () {
          MS.store.set({ ticker: b.getAttribute("data-go"), tf: "일" });
          MS.router.go("chart");
        });
      });
      const car = host.querySelector("[data-car]");
      if (car) {
        let x0 = null;
        car.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
        car.addEventListener("touchend", function (e) {
          if (x0 == null) return;
          const dx = e.changedTouches[0].clientX - x0;
          if (Math.abs(dx) > 40) { carousel = (carousel + (dx < 0 ? 1 : 3)) % 4; render(); }
          x0 = null;
        });
        car.addEventListener("click", function () { carousel = (carousel + 1) % 4; render(); });
      }
    }

    render();
    MS.scanSignals().then(function (all) {
      list = all;
      if (MS.store.get().screen === "signal") render();
    });
  }

  MS.router.register("signal", { mount: mount });
})();
