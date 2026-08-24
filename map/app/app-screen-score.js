/* 머니스쿱 앱 — 채점 화면(이 앱의 양심이자 재방문 엔진 — 지침서 §6).
   원본: 프로토 yest L995~1226 + 로직 dissection/03 §4. 데이터는 전부 서버 원장(app-api.php)
   실값 — 적재는 심화·커스텀만·그날 마지막 1건(서버 규칙), 판정은 서버 지연 채점.
   요약 4장 스와이프 · 필터 세그 · 종목 검색 · 기간(7/30/90 실필터) · 20+10 페이지 ·
   펼침=스냅샷+결과+복기 힌트(당시 반대 의견 실스냅샷)+다시 분석(단계 시트 경유 — 바로 실행 금지) ·
   적중 환급 배너(지갑 연동 P5 전까지 '대기' 표기) · 성적은 보정 없이 그대로 + 면책. */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;
  const TIER_C = { deep: "#7b6cff", custom: "var(--cu)" };
  const GRP_PRESET = { t: "추세 중심", m: "모멘텀 중심", q: "스마트머니", v: "돌파 · 변동성", s: "스윙" };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmtPrice(v) {
    if (v == null || !isFinite(v)) return "—";
    return v >= 1000 ? Math.round(v).toLocaleString("en-US") : (Math.round(v * 100) / 100).toFixed(2);
  }
  function fmtWhen(iso) {
    const d = new Date(iso);
    return (d.getMonth() + 1) + "." + d.getDate() + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function chgPct(row) {
    if (row.settle_close == null || !row.anchor) return null;
    return (row.settle_close / row.anchor - 1) * 100;
  }

  function mount(host) {
    let data = null, err = null;
    let filter = null, search = null, range = 90, shown = 20, carousel = 0;
    let open = {}, hintOpen = {};

    async function load() {
      err = null;
      render();
      try {
        const r = await MS.data.api("list", { limit: 200 });
        if (MS.store.get().screen !== "score") return;
        if (!r.ok) { err = "채점 기록을 불러오지 못했어요"; render(); return; }
        data = r;
        MS.store.set({ scoreDueN: r.cnt.due });
        render();
      } catch (e) { err = "채점 기록을 불러오지 못했어요"; render(); }
    }

    function filtered() {
      if (!data) return [];
      const now = Date.now();
      let rows = data.rows.filter(function (r) {
        return now - new Date(r.reg_at).getTime() < range * 86400000;
      });
      if (search) rows = rows.filter(function (r) { return r.sym === search; });
      if (filter === "due") rows = rows.filter(function (r) { return r.today && r.status !== "wait"; });
      else if (filter) rows = rows.filter(function (r) { return r.status === filter; });
      // 오늘 채점건 최상단(프로토 규칙)
      rows.sort(function (a, b) {
        const ta = a.today && a.status !== "wait" ? 1 : 0, tb = b.today && b.status !== "wait" ? 1 : 0;
        if (ta !== tb) return tb - ta;
        return a.reg_at < b.reg_at ? 1 : -1;
      });
      return rows;
    }

    function ddayTxt(r) { return r.tf === "일" ? "D-1" : r.tf === "주" ? "D-5" : "D-22"; }

    function carouselHtml() {
      const c = data.cnt;
      const done = c.hit + c.miss;
      const pages = [];
      // ① 오늘 현황
      pages.push(
        '<div style="display:flex;gap:8px">' +
        [["오늘 채점", c.due, "var(--am)"], ["적중", c.hit, "var(--up)"], ["빗나감", c.miss, "var(--dn)"], ["진행 중", c.wait, "var(--ac)"]].map(function (x) {
          return '<div style="flex:1;text-align:center"><div class="mono" style="font-size:20px;font-weight:700;color:' + x[2] + '">' + x[1] + '</div><div style="margin-top:2px;font-size:10.5px;color:var(--m1)">' + x[0] + "</div></div>";
        }).join("") + "</div>" +
        (c.all ? '<div style="margin-top:10px;display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--sf3)">' +
          '<span style="width:' + (c.hit / c.all * 100) + '%;background:var(--up)"></span>' +
          '<span style="width:' + (c.miss / c.all * 100) + '%;background:var(--dn)"></span>' +
          '<span style="width:' + (c.wait / c.all * 100) + '%;background:var(--ac);opacity:0.5"></span></div>' : ""));
      // ② 누적 성적(기준선 병기 — 정직 표기)
      const rate = data.hitRate;
      pages.push(
        '<div style="display:flex;align-items:center;gap:16px">' +
        '<div style="position:relative;width:74px;height:74px;flex:none">' +
        '<svg viewBox="0 0 74 74" width="74" height="74"><circle cx="37" cy="37" r="31" fill="none" stroke="var(--sf3)" stroke-width="7"/>' +
        (rate != null ? '<circle cx="37" cy="37" r="31" fill="none" stroke="var(--up)" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (rate / 100 * 194.8) + ' 194.8" transform="rotate(-90 37 37)"/>' : "") + "</svg>" +
        '<span class="mono" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700">' + (rate != null ? rate + "%" : "—") + "</span></div>" +
        '<div style="min-width:0"><div style="font-size:13px;font-weight:700">누적 방향 적중률</div>' +
        '<div style="margin-top:4px;font-size:11.5px;color:var(--t2)">채점 완료 ' + done + "건 기준</div>" +
        '<div style="margin-top:4px;font-size:11px;color:var(--ac)">시장 평균 60.96% 병기 · 보정 없는 원본 기록</div></div></div>');
      // ③ 주기별
      pages.push(
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        ["일", "주", "월"].map(function (tf) {
          const b = data.byTf[tf];
          const n = b ? b.n : 0;
          const pr = n ? Math.round(b.hit / n * 100) : null;
          return '<div style="display:flex;align-items:center;gap:10px"><span style="width:34px;font-size:12px;color:var(--t2)">' + tf + "봉</span>" +
            '<div style="flex:1;position:relative;height:7px;border-radius:4px;background:var(--sf3)">' +
            (pr != null ? '<span style="position:absolute;left:0;top:0;bottom:0;width:' + pr + '%;background:var(--up);border-radius:4px"></span>' : "") +
            '<span style="position:absolute;left:60.96%;top:-2px;bottom:-2px;width:1.5px;background:var(--ac)"></span></div>' +
            '<span class="mono" style="width:70px;text-align:right;font-size:11.5px;color:var(--t2)">' + (pr != null ? n + "건 · " + pr + "%" : "기록 없음") + "</span></div>";
        }).join("") +
        '<div style="font-size:10.5px;color:var(--ac);text-align:right">| = 시장 평균 60.96%</div></div>');
      // ④ 최근 14일
      const days = Object.keys(data.day14 || {}).sort();
      pages.push(
        days.length ?
          '<div style="display:flex;align-items:flex-end;gap:3px;height:52px">' +
          days.map(function (d) {
            const v = data.day14[d];
            const tot = v.hit + v.miss;
            const h = Math.min(100, tot * 22);
            return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:1px" title="' + d + '">' +
              (v.hit ? '<span style="height:' + (h * v.hit / tot) + '%;background:var(--up);border-radius:2px 2px 0 0"></span>' : "") +
              (v.miss ? '<span style="height:' + (h * v.miss / tot) + '%;background:var(--dn)"></span>' : "") + "</div>";
          }).join("") + "</div>" +
          '<div style="margin-top:6px;font-size:10.5px;color:var(--m2)">최근 14일 · <span style="color:var(--up)">■ 적중</span> <span style="color:var(--dn)">■ 빗나감</span></div>'
          : '<div style="padding:12px 0;font-size:12.5px;color:var(--m1);text-align:center">최근 14일 채점 기록이 아직 없어요</div>');
      const titles = ["오늘 채점 현황", "누적 성적", "주기별 적중률", "최근 14일"];
      return '<div data-car style="margin:12px 16px 0;border-radius:14px;background:var(--sf1);padding:12px 14px;touch-action:pan-y">' +
        '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12.5px;font-weight:700">' + titles[carousel] + "</span>" +
        '<span style="margin-left:auto;display:flex;gap:4px">' +
        titles.map(function (_, i) { return '<span style="width:5px;height:5px;border-radius:50%;background:' + (i === carousel ? "var(--ac)" : "var(--sf3)") + '"></span>'; }).join("") + "</span></div>" +
        '<div style="margin-top:10px">' + pages[carousel] + "</div></div>";
    }

    function render() {
      const s = MS.store.get();
      const wd = new Date().getDay();
      const rows = data ? filtered() : [];
      const c = data ? data.cnt : null;

      host.innerHTML =
        '<div style="padding:0 0 90px">' +
        '<div style="padding:16px 16px 0">' +
        '<div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:19px;font-weight:700;letter-spacing:-0.03em">채점</span>' +
        '<span style="font-size:12px;color:var(--m1)">예측은 다음 봉 마감에 스스로 채점됩니다</span></div>' +
        ((wd === 0 || wd === 6) ? '<div style="margin-top:8px;border:1px solid rgba(255,176,32,0.3);border-radius:9px;background:rgba(255,176,32,0.05);padding:8px 12px;font-size:12px;color:var(--t2)">주말엔 증시 휴장 — 주식은 월요일 아침 채점 · 암호화폐는 매일</div>' : "") +
        '<div style="margin-top:6px;font-size:11.5px;color:var(--m2)">종목×주기당 그날 마지막 분석 1건만 · 기본 분석은 기록하지 않아요</div></div>' +
        (err ? '<div style="margin:16px;border:1px dashed var(--ln2);border-radius:12px;padding:20px;text-align:center;font-size:13px;color:var(--dn)">' + err + "</div>" : "") +
        (!data && !err ? '<div style="margin:16px;text-align:center;font-size:12.5px;color:var(--m1)">채점 기록 불러오는 중…</div>' : "") +
        (data ? carouselHtml() : "") +
        (data ?
          '<div style="display:flex;gap:4px;padding:12px 16px 0;overflow-x:auto">' +
          [[null, "전체", c.all], ["due", "오늘 만기", c.due], ["hit", "적중", c.hit], ["miss", "빗나감", c.miss], ["wait", "진행 중", c.wait]].map(function (f) {
            const on = filter === f[0];
            return '<button data-filter="' + (f[0] || "") + '" style="flex:none;font-size:12px;font-weight:' + (on ? 700 : 500) + ";color:" + (on ? "var(--t1)" : "var(--m1)") + ";border-bottom:2px solid " + (on ? "var(--ac)" : "transparent") + ';border-top:0;border-left:0;border-right:0;background:none;padding:6px 8px;cursor:pointer;font-family:inherit;white-space:nowrap">' + f[1] + ' <span class="mono">' + f[2] + "</span></button>";
          }).join("") + "</div>" +
          '<div style="display:flex;gap:6px;padding:10px 16px 0;align-items:center">' +
          '<div style="display:flex;gap:4px">' +
          [7, 30, 90].map(function (d) {
            const on = range === d;
            return '<button data-range="' + d + '" style="font-size:11.5px;color:' + (on ? "var(--t1)" : "var(--m1)") + ";background:" + (on ? "var(--sf2)" : "transparent") + ";border:1px solid " + (on ? "var(--ln2)" : "var(--ln0)") + ';border-radius:99px;padding:4px 10px;cursor:pointer;font-family:inherit">' + d + "일</button>";
          }).join("") + "</div>" +
          (search ? '<button data-clear style="margin-left:auto;font-size:11.5px;color:var(--ac);background:rgba(123,108,255,0.1);border:1px solid rgba(123,108,255,0.35);border-radius:99px;padding:4px 10px;cursor:pointer;font-family:inherit">' + esc(search) + " ✕</button>"
            : '<select data-search style="margin-left:auto;font-size:11.5px;color:var(--m1);background:var(--sf1);border:1px solid var(--ln1);border-radius:99px;padding:4px 8px;font-family:inherit"><option value="">종목 전체</option>' +
              (function () {
                const seen = {};
                return data.rows.filter(function (r) { if (seen[r.sym]) return false; seen[r.sym] = 1; return true; })
                  .map(function (r) { return '<option value="' + esc(r.sym) + '">' + esc(r.sym) + "</option>"; }).join("");
              })() + "</select>") +
          "</div>"
          : "") +
        (data && !rows.length ?
          '<div style="margin:16px;border:1px dashed var(--ln2);border-radius:12px;padding:24px 16px;text-align:center">' +
          '<div style="font-size:13.5px;font-weight:600">' + ((filter || search) ? "조건에 맞는 기록이 없어요" : "아직 채점할 예측이 없어요") + "</div>" +
          '<div style="margin-top:6px;font-size:12.5px;color:var(--m1)">' + ((filter || search) ? "필터·검색을 바꿔 보세요" : "심화·커스텀 분석이 다음 마감에 여기서 채점됩니다") + "</div></div>" : "") +
        (data ? rows.slice(0, shown).map(rowHtml).join("") : "") +
        (data && rows.length > shown ? '<button data-more style="display:block;margin:12px auto;font-size:12.5px;color:var(--ac);border:1px solid rgba(123,108,255,0.35);border-radius:99px;padding:8px 20px;background:none;cursor:pointer;font-family:inherit">더 보기</button>' : "") +
        (data && rows.length ? '<div style="margin:14px 16px 0;font-size:11px;color:var(--m2);text-align:center">화면에는 최근 90일까지 보여요 · 원본 기록은 안전하게 보관됩니다</div>' : "") +
        '<div style="margin:16px;font-size:11px;color:var(--m2);line-height:1.7">예측 성적은 보정 없이 그대로예요 · 예측은 참고용이며 투자 판단과 책임은 본인에게 있습니다.</div>' +
        "</div>";
      bind();
    }

    function rowHtml(r) {
      const k = r.id;
      const isOpen = !!open[k];
      const scored = r.status !== "wait";
      const today = r.today && scored;
      const ch = chgPct(r);
      const resTxt = r.status === "hit" ? "적중 " + (ch >= 0 ? "+" : "") + ch.toFixed(1) + "%" :
        r.status === "miss" ? "빗나감 " + (ch >= 0 ? "+" : "") + ch.toFixed(1) + "%" : ddayTxt(r) + " 대기";
      const resC = r.status === "hit" ? "var(--up)" : r.status === "miss" ? "var(--dn)" : "var(--am)";
      const bd = isOpen ? "var(--ln2)" : today ? "rgba(123,108,255,0.6)" : "var(--ln0)";
      const bg = today && !isOpen ? "linear-gradient(135deg,rgba(123,108,255,0.16),rgba(123,108,255,0.04) 55%,var(--sf1))" : "var(--sf1)";
      let out =
        '<div data-row="' + k + '" style="margin:8px 16px 0;border:1px solid ' + bd + ";border-radius:12px;background:" + bg +
        (today && !isOpen ? ";box-shadow:0 0 0 1px rgba(123,108,255,0.3),0 6px 22px -6px rgba(123,108,255,0.45)" : "") + ';cursor:pointer;overflow:hidden">' +
        '<div style="display:flex;align-items:center;gap:8px;padding:12px 12px">' +
        '<span style="font-size:13.5px;font-weight:700">' + esc(r.sym) + "</span>" +
        (today ? '<span style="font-size:10px;color:#fff;background:#7b6cff;border-radius:99px;padding:2px 7px;animation:msPredPulse 1.6s ease-in-out infinite">오늘 채점</span>' : "") +
        '<span class="mono" style="font-size:11px;color:var(--m1)">' + fmtWhen(r.reg_at) + "</span>" +
        '<span style="font-size:10.5px;color:var(--t2);border:1px solid var(--ln1);border-radius:4px;padding:1px 6px">' + r.tf + "봉</span>" +
        '<span style="width:7px;height:7px;border-radius:50%;background:' + (TIER_C[r.tier] || "#8b93a7") + ';flex:none"></span>' +
        '<span class="mono" style="margin-left:auto;font-size:12.5px;font-weight:600;color:' + resC + ';white-space:nowrap">' + resTxt + "</span>" +
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--m2)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform:' + (isOpen ? "rotate(180deg)" : "none") + ';transition:transform 0.2s;flex:none"><path d="M5 9l7 7 7-7"></path></svg></div>';
      if (isOpen) {
        const dirTxt = r.dir === "up" ? "▲ 상승" : r.dir === "down" ? "▼ 하락" : "— 중립";
        out += '<div style="border-top:1px solid var(--ln0);padding:12px;background:var(--sf2)">' +
          '<div style="font-size:12.5px;color:var(--t2);line-height:1.7"><b style="color:var(--t1)">당시 예측</b> — ' +
          dirTxt + " " + (r.prob != null ? r.prob + "%" : "") +
          (r.target ? " · 목표 " + fmtPrice(r.target) : "") +
          (r.invalid ? " · 무효선 " + fmtPrice(r.invalid) : "") +
          (r.preset ? " · " + esc(r.preset) : "") +
          (r.agree != null ? " · 합의 " + r.agree + "/" + r.total : "") + "</div>" +
          (scored ?
            '<div style="margin-top:8px;font-size:12.5px;color:var(--t2)"><b style="color:var(--t1)">실제 결과</b> — ' +
            esc(r.settle_t || "") + " 마감 " + fmtPrice(r.settle_close) +
            ' <span class="mono" style="color:' + resC + '">(' + (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%)</span></div>"
            : '<div style="margin-top:8px;font-size:12.5px;color:var(--m1)">다음 ' + r.tf + "봉 마감을 기다리는 중 — 미리 보기는 없어요</div>") +
          (r.status === "hit" && r.refund_due == 1 ?
            '<div style="margin-top:8px;border:1px solid rgba(46,217,160,0.3);border-radius:8px;background:rgba(46,217,160,0.06);padding:6px 10px;font-size:12px;color:var(--up)">적중 환급 ◈+1 ' + (r.refund_paid == 1 ? "지급됨" : "대기 — 지갑 연동 후 지급돼요") + "</div>" : "") +
          (r.status === "miss" && r.opp && r.opp.length ?
            '<div style="margin-top:10px;border:1px solid rgba(255,92,122,0.3);border-radius:9px;padding:8px 10px">' +
            '<button data-hint="' + k + '" style="display:flex;align-items:center;gap:6px;width:100%;background:none;border:0;cursor:pointer;font-family:inherit;text-align:left;padding:0">' +
            '<span style="font-size:12px;font-weight:700;color:var(--dn)">복기 — 당시 반대를 본 지표 ' + r.opp.length + "개</span>" +
            '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="var(--dn)" stroke-width="2.2" style="margin-left:auto;transform:' + (hintOpen[k] ? "rotate(180deg)" : "none") + '"><path d="M5 9l7 7 7-7"></path></svg></button>' +
            (hintOpen[k] ? r.opp.map(function (o) {
              return '<div style="margin-top:6px;font-size:12px;color:var(--t2);line-height:1.5"><b style="color:var(--t1)">' + esc(o.n) + "</b> — " + esc(o.d) + "</div>";
            }).join("") +
            '<button data-rego="' + k + '" style="margin-top:10px;width:100%;min-height:42px;border-radius:9px;border:1px solid rgba(123,108,255,0.45);background:rgba(123,108,255,0.1);color:var(--ac);font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit">' + esc(reGoPreset(r)) + " 관점으로 다시 분석 (단계 선택)</button>" : "") +
            "</div>" : "") +
          '<button data-again="' + k + '" style="margin-top:10px;width:100%;min-height:44px;border-radius:9px;border:1px solid var(--ln2);background:var(--sf1);color:var(--t1);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">다시 분석하기</button>' +
          "</div>";
      }
      out += "</div>";
      return out;
    }

    function reGoPreset(r) {
      const cnt = {};
      (r.opp || []).forEach(function (o) { if (o.g) cnt[o.g] = (cnt[o.g] || 0) + 1; });
      let best = null;
      Object.keys(cnt).forEach(function (g) { if (!best || cnt[g] > cnt[best]) best = g; });
      return (best && GRP_PRESET[best]) || "전체 종합";
    }

    function goReanalyze(r, preset) {
      if (MS.guardRun && MS.guardRun()) return;
      MS.store.set({ ticker: r.sym, tf: r.tf, preset: preset || null, runFromCtx: "score" });
      if (preset) MS.ui.flash(preset + " 을 미리 골라뒀어요 · 단계만 고르면 시작합니다", "");
      MS.router.go("chart");
      MS.flow.openTier();
    }

    function bind() {
      host.querySelectorAll("[data-filter]").forEach(function (b) {
        b.addEventListener("click", function () { filter = b.getAttribute("data-filter") || null; shown = 20; render(); });
      });
      host.querySelectorAll("[data-range]").forEach(function (b) {
        b.addEventListener("click", function () { range = parseInt(b.getAttribute("data-range"), 10); shown = 20; render(); });
      });
      const sel = host.querySelector("[data-search]");
      if (sel) sel.addEventListener("change", function () { search = sel.value || null; shown = 20; render(); });
      const clr = host.querySelector("[data-clear]");
      if (clr) clr.addEventListener("click", function () { search = null; render(); });
      const more = host.querySelector("[data-more]");
      if (more) more.addEventListener("click", function () { shown += 10; render(); });
      host.addEventListener("scroll", function () {
        if (host.scrollHeight - host.scrollTop - host.clientHeight < 90 && data && filtered().length > shown) {
          shown += 10; render();
        }
      }, { passive: true });
      host.querySelectorAll("[data-row]").forEach(function (el) {
        el.addEventListener("click", function (e) {
          if (e.target.closest("[data-hint],[data-rego],[data-again]")) return;
          const k = el.getAttribute("data-row");
          open[k] = !open[k];
          if (open[k]) {
            const row = data.rows.filter(function (x) { return String(x.id) === k; })[0];
            const st2 = MS.store.get();
            const xk = "score:" + k;
            if (row && row.today && row.status !== "wait" && !st2.xpSeen[xk]) {
              const xs = {};
              Object.keys(st2.xpSeen).forEach(function (kk) { xs[kk] = st2.xpSeen[kk]; });
              xs[xk] = 1;
              MS.store.set({ xpSeen: xs });
              MS.store.persistSoon();
              MS.xp.add(MS.config.POLICY.xp.scoreView, "채점 확인");
            }
          }
          render();
        });
      });
      host.querySelectorAll("[data-hint]").forEach(function (b) {
        b.addEventListener("click", function () {
          const k = b.getAttribute("data-hint");
          hintOpen[k] = !hintOpen[k];
          render();
        });
      });
      host.querySelectorAll("[data-rego]").forEach(function (b) {
        b.addEventListener("click", function () {
          const r = data.rows.filter(function (x) { return String(x.id) === b.getAttribute("data-rego"); })[0];
          if (r) goReanalyze(r, reGoPreset(r));
        });
      });
      host.querySelectorAll("[data-again]").forEach(function (b) {
        b.addEventListener("click", function () {
          const r = data.rows.filter(function (x) { return String(x.id) === b.getAttribute("data-again"); })[0];
          if (r) goReanalyze(r, null);
        });
      });
      // 요약 캐러셀 스와이프(40px 임계)
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
    load();
  }

  MS.router.register("score", { mount: mount });
})();
