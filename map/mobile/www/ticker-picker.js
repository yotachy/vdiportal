// 종목 고르기. 온보딩 4단계(다중)와 워치리스트 ＋Add(단일)가 같은 화면을 쓴다 —
// 온보딩 안에 묻어두면 둘이 갈리고, 예쁜 온보딩 옆에 브라우저 prompt 대화상자가 남는다(watchlist.js
// 의 옛 startAddTicker 가 그것이었다 — Task 6 에서 이 컴포넌트로 교체됐다). 이 컴포넌트는 그
// 화면들이 무엇으로 추가를 시작했는지 몰라야 한다 — 잇는 일은 이 화면들 쪽 배선의 몫).
//
// 검색 전용 엔드포인트는 없다. forge-api.php 는 심볼을 못 찾을 때만 Yahoo 후보를 주므로
// (api.js 의 err.suggest — watchlist.js 의 옛 오타 제안과 같은 경로, 지금은 이 컴포넌트 안으로
// 들어왔다) 큐레이션 그리드 + 직접 입력 + 오타 제안으로 간다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSTickerPicker", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 시안 12a 그대로 — 국내 2종을 맨 앞에 둔다(한국 사용자가 먼저 보는 자리). 예전 목록(미국
  // 기술주 12종)은 "한국 우선" 이라는 시안의 의도와 반대 방향이었다 — 코디네이터 판정(2026-08-16)
  // 으로 이 여덟 개로 교체했다. 이 목록은 온보딩 4단계도 함께 쓴다(같은 컴포넌트) — 그 화면의
  // 칩도 이 여덟 개로 바뀌는 것은 부작용이 아니라 의도된 결과다.
  var CURATED = [
    { sym: "005930", name: "삼성전자" }, { sym: "000660", name: "SK하이닉스" },
    { sym: "NVDA", name: "엔비디아" },    { sym: "AAPL", name: "애플" },
    { sym: "TSLA", name: "테슬라" },      { sym: "035720", name: "카카오" },
    { sym: "005380", name: "현대차" },    { sym: "QQQ", name: "QQQ" }
  ];

  function norm(s) { return String(s == null ? "" : s).trim().toUpperCase(); }

  // 심볼 → 회사명. 고른 것을 심을 때 이름이 함께 가야 한다 — 빈 이름으로 심으면 store.js 가
  // name = 심볼로 폴백하고(store.js addTicker), 그 순간 두 가지가 조용히 죽는다:
  // 행이 심볼을 두 번 찍고(wl-title·wl-meta), 회사명 검색이 그 종목만 안 먹는다
  // (watchlist-model.filter 가 it.name 을 본다). 이 컴포넌트가 이름을 아는 유일한 지점이라
  // 여기서 함께 내보낸다 — 부르는 쪽이 CURATED 를 다시 뒤지게 두면 두 벌이 되어 갈린다.
  function nameOf(sym) {
    var s = norm(sym), i;
    for (i = 0; i < CURATED.length; i++) { if (CURATED[i].sym === s) return CURATED[i].name; }
    return "";
  }

  // 상한에 걸려 있어도 '빼는 것'은 언제나 된다 — 안 그러면 상한까지 고른 뒤
  // 마음을 바꿀 방법이 없다.
  function toggle(sel, sym, max) {
    var s = norm(sym);
    if (!s) return sel.slice();
    var i = sel.indexOf(s);
    if (i >= 0) { var out = sel.slice(); out.splice(i, 1); return out; }
    if (max != null && sel.length >= max) return sel.slice();
    return sel.concat([s]);
  }

  function create(opts) {
    var o = opts || {};
    var Str = o.strings || (typeof MSStr !== "undefined" ? MSStr : null);
    var api = o.api || (typeof MSApi !== "undefined" ? MSApi : null);
    var multi = !!o.multi;
    var max = (o.max == null) ? null : o.max;
    // preset 항목은 심볼 문자열이거나(옛 호출부), {sym,name} 객체(온보딩 4단계 — CURATED 밖
    // 프리셋에 이름을 함께 실어 보낸다)다. 둘 다 받는다 — norm() 에 객체를 그대로 넣으면
    // "[object Object]" 가 심볼이 된다.
    var presetList = o.preset || [];
    var sel = presetList.map(function (p) { return norm(typeof p === "string" ? p : p.sym); });
    // 해제 불가 심볼. 호출부가 명시적으로 넘긴 것만 잠근다 — 신규 사용자의 SEED 3종은
    // 잠기면 안 된다(설계서 4단계: 미리 선택돼 있되 지울 수 있어야 한다).
    var locked = (o.locked || []).map(norm).filter(function (s) { return !!s; });

    var el = MSUi.el("div", "tp");
    var grid = MSUi.el("div", "tp-grid");
    var msg = MSUi.el("p", "tp-msg");
    // 시안 12a 의 제목·"많이 보는 종목" 라벨·자물쇠 설명문·확인 버튼은 단일 모드(워치리스트
    // ＋Add) 전용 chrome 이다. 온보딩 4단계(multi)는 이미 자기 제목(obH4/obSub4)을 갖고
    // 있어 여기서 또 그리면 두 벌이 된다 — 그 화면은 그대로 grid+검색+안내만 받는다.
    var chrome = !multi;

    // 직접 입력으로 서버가 확인해 준 이름. CURATED 밖 심볼의 이름은 여기밖에 없다 —
    // loadTicker 응답을 여기서 안 붙잡으면 그 종목은 영영 이름 없이 심긴다.
    var resolved = {};
    // 프리셋이 {sym,name} 객체로 이름을 함께 실어 왔으면 그 이름을 미리 붙잡아 둔다 —
    // 이 이름이 없으면 CURATED 밖 프리셋 심볼(예: 워치리스트가 PLTR 하나뿐인 사용자)은
    // 그려질 때 이름 없이 심볼만 나온다. CURATED 심볼은 건드리지 않는다 — 정식 표시명이
    // 이미 있고, 온보딩 완료 시(seedTo) 그 표준 이름을 심어야 한다(워치리스트에 저장된
    // 다른 표기로 덮이면 안 된다).
    presetList.forEach(function (p) {
      if (!p || typeof p !== "object" || !p.name) return;
      var s = norm(p.sym);
      if (s && !nameOf(s)) resolved[s] = p.name;
    });
    function nameFor(s) { return resolved[s] || nameOf(s); }
    // CURATED 밖 심볼을 한 번 본 뒤엔(프리셋으로 왔든, 직접 입력해 서버가 확인해 줬든) 화면에서
    // 지우지 않는다 — paint() 가 sel 만 보고 그 심볼의 셀을 그리면, 꺼서 sel 을 벗어나는 순간
    // 셀 자체가 사라진다(오프-큐레이티드는 정의상 sel 안에 있을 때만 그려졌으므로). 되돌리려면
    // loadTicker 왕복이 다시 필요했고, 오프라인·요청제한이면 되돌릴 방법이 아예 없었다(리뷰 지적).
    // seeOff 는 "본 적 있다"만 기록한다 — 지금 선택 여부(is-on)는 paint() 가 매번 sel 로 따로 본다.
    var offSeen = [];
    function seeOff(s) { if (s && !nameOf(s) && offSeen.indexOf(s) < 0) offSeen.push(s); }
    sel.forEach(seeOff);   // 프리셋으로 들어온 CURATED 밖 심볼을 최초 진입 시점에 붙잡아 둔다
    function items() {
      return sel.map(function (s) { return { sym: s, name: nameFor(s) }; });
    }
    // 심볼 목록과 {sym,name} 목록을 함께 넘긴다 — 심볼만 넘기던 시절엔 부르는 쪽 두 곳이
    // 모두 addTicker(sym, "") 로 이름을 버렸다.
    function fire() { if (o.onChange) o.onChange(sel.slice(), items()); }

    // 시안 12a 는 칩 한 줄에 이름 하나만 쓴다(심볼을 따로 안 찍는다) — 잠긴 칩은 이름 앞에
    // 공용 자물쇠(MSUi.lockIcon, ui-marks.test.mjs 가 직접 그리기를 막는다)를 붙인다.
    function chip(sym, label) {
      var isLk = isLocked(sym);
      var b = MSUi.el("button", "tp-chip" + (sel.indexOf(sym) >= 0 ? " is-on" : "") + (isLk ? " is-locked" : ""));
      b.type = "button";
      b.setAttribute("data-sym", sym);
      if (isLk) {
        var ic = MSUi.el("span", "tp-chip-lock");
        ic.innerHTML = MSUi.lockIcon();
        b.appendChild(ic);
      }
      b.appendChild(MSUi.el("span", "tp-chip-label", label));
      return b;
    }

    function paint() {
      grid.innerHTML = "";
      CURATED.forEach(function (x) { grid.appendChild(chip(x.sym, x.name)); });
      // CURATED 밖에서 본 적 있는 심볼도 전부 칩으로 그린다(offSeen — 지금 선택 여부와 무관하게) —
      // sel 만 보고 그리면 selected()는 참인데 격자엔 아무 칩도 없어 "고른 게 하나도 없어 보이는"
      // 화면이 되고(온보딩 4단계 프리셋이 워치리스트 전체가 CURATED 밖일 때 실측), sel 만 보고
      // "선택된 것만" 그리면 끄는 순간 칩이 통째로 사라져 다시 켤 방법이 없어진다(리뷰 지적 —
      // 되돌리려면 loadTicker 재왕복이 필요했고 오프라인이면 그마저 안 됐다). curated 8종
      // 순서는 그대로 두고 뒤에 이어붙인다(offSeen 순서 = 프리셋/추가로 처음 본 순서).
      offSeen.forEach(function (s) { grid.appendChild(chip(s, nameFor(s) || s)); });
    }

    // toggle() 이 상한에서 항목을 무시하면 next.length === sel.length 인데 원래 없던
    // 항목이다 — 그 경우에만 '가득 찼다'는 안내를 띄운다. 이미 있던 항목을 빼는 경우도
    // next.length !== sel.length(줄어듦)이라 이 조건에 안 걸려 정상적으로 반영된다.
    // (주의: hadIt && !multi 로 단일 모드 교체를 상한 로직과 섞지 않는다 — 단일 모드는
    // 애초에 toggle 을 거치지 않고 항상 [sym] 으로 교체한다.)
    // 잠긴 심볼 = 이미 사용자의 워치리스트에 있는 것. 온보딩 4단계가 기존 목록을 프리셋으로
    // 받으면서 그 화면이 "내 목록 편집"처럼 보이게 됐는데, seedTo 는 추가만 하므로 여기서
    // 꺼도 실제로는 안 빠졌다 — 화면이 거짓말을 했다. 온보딩에서 목록이 지워지는 경로를
    // 만드는 대신(실수로 자기 목록을 날릴 수 있다) 해제 자체를 막고 이유를 말한다.
    function isLocked(s) { return locked.indexOf(s) >= 0; }

    // 잠긴 심볼(이미 담은 종목·이미 고른 것)은 어느 모드에서도 선택할 수 없다 — 예전엔
    // multi 모드에서만 막았는데, 단일 모드(워치리스트 ＋Add, 시안 12a)도 이미 담은 칩을
    // 자물쇠로만 보여주고 누르면 이유를 말해야 하는 건 같다.
    function applySelection(sym) {
      if (isLocked(sym)) {
        msg.textContent = Str ? Str.t.tpKept : "";
        return false;
      }
      var hadIt = sel.indexOf(sym) >= 0;
      var next = multi ? toggle(sel, sym, max) : [sym];
      if (multi && !hadIt && next.length === sel.length) {
        msg.textContent = Str ? Str.t.tpFull : "";
        return false;
      }
      sel = next;
      msg.textContent = "";
      return true;
    }

    var confirmBtn = null;   // 단일 모드 전용(chrome 블록에서 만든다) — 초기값 null 로 settle() 이 안전하다

    // 시안 12a — 단일 모드는 칩을 눌러도 곧바로 담기지 않는다. "확인" 버튼을 눌러야 onChange 가
    // 불린다(티어 시트의 Run 버튼과 같은 확인-후-실행 패턴, 코디네이터 판정 2026-08-16). 멀티
    // 모드(온보딩)는 예전 그대로 토글마다 즉시 onChange 가 불린다 — 그 화면은 이미 자기
    // "계속" 버튼을 갖고 있어 두 번째 확인 단계를 얹으면 그냥 단계 하나가 늘어날 뿐이다.
    function settle() {
      paint();
      if (multi) { fire(); return; }
      if (confirmBtn) confirmBtn.disabled = sel.length === 0;
    }

    grid.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== grid && !t.getAttribute("data-sym")) t = t.parentNode;
      if (!t || t === grid) return;
      var sym = t.getAttribute("data-sym");
      if (!applySelection(sym)) return;
      settle();
    });

    var row = MSUi.el("div", "tp-free");
    var input = MSUi.el("input", "tp-input");
    input.type = "text";
    input.setAttribute("placeholder", Str ? Str.t.tpPlaceholder : "");
    var addBtn = MSUi.el("button", "btn tp-add", Str ? Str.t.tpAdd : "");
    addBtn.type = "button";
    row.appendChild(input);
    row.appendChild(addBtn);

    function tryAdd() {
      var sym = norm(input.value);
      if (!sym) return;
      // 이미 골라둔 심볼을 다시 치면 fetch 부터 걷어낸다 — applySelection(sym) 까지 가면
      // multi 모드에서 toggle() 이 있는 걸 빼버려서, 다시 담으려던 사용자가 그 종목이
      // 꺼지는 걸 본다(방향이 반대인 결함이지 오프바이원이 아니다). 단일 모드는 원래
      // 매번 [sym] 으로 교체라 같은 심볼 재입력도 정상 동작이어야 해서 이 가드 밖이다.
      if (multi && sel.indexOf(sym) >= 0) {
        input.value = "";
        msg.textContent = Str ? Str.t.tpAlreadyPicked : "";
        return;
      }
      if (!api) { msg.textContent = Str ? Str.t.tpUnavailable : ""; return; }
      msg.textContent = Str ? Str.t.tpChecking : "";
      api.loadTicker(sym, "1day").then(function (data) {
        input.value = "";
        // 서버가 준 이름을 붙잡아 둔다(api.js normalizeCandles 의 name) — 옛 대화상자 경로가
        // 이름을 함께 심을 때 쓰던 값이다. 여기서 안 붙잡으면 이 심볼은 영영 이름이 없다.
        if (data && data.name) resolved[sym] = data.name;
        seeOff(sym);   // 새로 확인된 CURATED 밖 심볼도 앞으로는 셀로 남는다(꺼도 안 사라진다)
        if (!applySelection(sym)) return;
        settle();
      })["catch"](function (err) {
        // 오타 구제 — 서버가 notfound 일 때만 후보를 준다(api.js, watchlist.js 와 같은 경로)
        if (err && err.notfound && err.suggest && err.suggest.length) {
          msg.textContent = (Str ? Str.t.tpDidYouMean : "") +
            err.suggest.map(function (x) { return x.s; }).join(", ");
        } else {
          msg.textContent = Str ? Str.t.tpNotFound : "";
        }
      });
    }
    addBtn.addEventListener("click", tryAdd);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") tryAdd(); });

    paint();

    // ── 시안 12a chrome(단일 모드 전용) ──────────────────────────────────────────
    if (chrome) el.appendChild(MSUi.el("p", "tp-title", Str ? Str.t.tpTitle : ""));
    if (chrome) el.appendChild(MSUi.el("p", "tp-curated-label", Str ? Str.t.tpCuratedLabel : ""));
    el.appendChild(grid);
    el.appendChild(row);
    el.appendChild(msg);
    if (chrome) {
      // "이미 담은 종목 N개" — 실제로 격자에 그려진(=화면에 보이는) 잠긴 칩만 센다. locked 로
      // 넘어온 심볼 중 CURATED 밖이면서 offSeen 에도 없는 것은 애초에 칩으로 안 그려지므로,
      // 총 locked.length 를 그대로 쓰면 화면에 안 보이는 것까지 세는 거짓말이 된다.
      var curSet = {};
      CURATED.forEach(function (x) { curSet[x.sym] = 1; });
      offSeen.forEach(function (s) { curSet[s] = 1; });
      var lockedVisible = locked.filter(function (s) { return curSet[s]; });
      if (lockedVisible.length) {
        var note = String(Str ? Str.t.tpLockNote : "").replace("{n}", lockedVisible.length);
        el.appendChild(MSUi.el("p", "tp-lock-note", note));
      }
      confirmBtn = MSUi.el("button", "btn btn-primary tp-confirm", Str ? Str.t.tpConfirm : "");
      confirmBtn.type = "button";
      confirmBtn.disabled = sel.length === 0;
      // 확인 버튼이 담기를 실제로 확정한다(시안 12a — 칩 클릭은 선택만, 이 버튼이 onChange 를
      // 부른다). 잠금·상한처럼 disabled 여도 이벤트 리스너 자체는 살아 있을 수 있어 방어적으로
      // 한 번 더 막는다.
      confirmBtn.addEventListener("click", function () { if (!confirmBtn.disabled) fire(); });
      el.appendChild(confirmBtn);
    }

    return { el: el, selected: function () { return sel.slice(); }, selectedItems: items };
  }

  return { CURATED: CURATED, toggle: toggle, create: create, nameOf: nameOf };
});
