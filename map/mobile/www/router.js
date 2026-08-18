// 네비게이션 상태기계. DOM 을 모른다 — 그래야 노드에서 값으로 잴 수 있고, 2단·3단 레이아웃이
// 들어와도 여기는 안 바뀐다(설계 §5). DOM 조립은 shell.js.
//
// 탭마다 독립 스택을 두는 이유: 시안의 탭 3개는 서로 다른 볼일이다. 지갑에 들렀다 목록으로
// 돌아왔을 때 보던 리포트가 사라지면, 사용자는 자기가 어디 있었는지를 매번 다시 만들어야 한다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSRouter", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TABS = ["list", "analysis", "scoop"];
  var HOME = "list";

  function create(opts) {
    var o = opts || {};
    var screens = {};
    var stacks = { list: [], analysis: [], scoop: [] };
    var tab = HOME;

    function register(s) {
      if (!s || !s.id) throw new Error("화면 등록에 id 가 없다");
      if (TABS.indexOf(s.tab) < 0) throw new Error("모르는 탭: " + s.tab);
      if (screens[s.id]) throw new Error("화면 id 중복: " + s.id);
      screens[s.id] = s;
      return s;
    }

    function entryOf(id, params) {
      var s = screens[id];
      if (!s) throw new Error("등록되지 않은 화면: " + id);
      return { id: id, params: params || {}, tab: s.tab, screen: s };
    }

    function top() {
      var st = stacks[tab];
      return st.length ? st[st.length - 1] : null;
    }

    function draw() {
      var e = top();
      if (e && o.onRender) o.onRender(e);
    }

    function go(id, params) {
      var e = entryOf(id, params);
      tab = e.tab;
      var st = stacks[tab];
      // 대상 화면이 이 탭 스택 안에 이미 있으면(맨 위 포함) 그 위를 전부 잘라내고 되감는다.
      // 없으면 새로 쌓는다. "같은 화면 연달아 go = 교체"이던 옛 특수취급은 이 규칙의
      // 부분집합이다(맨 위에서 찾히는 경우와 같다). 되감기가 없으면 — 리뷰 I1 실측 —
      // 화면 안 뒤로가기 버튼 5곳이 전부 MSApp.go("watchlist") 로 부를 때
      // watchlist > result > watchlist 처럼 스택이 계속 쌓이고, 하드웨어/시스템 뒤로가기가
      // 방금 닫은 화면을 되살린다.
      var idx = -1;
      for (var i = st.length - 1; i >= 0; i--) {
        if (st[i].id === id) { idx = i; break; }
      }
      if (idx >= 0) st.length = idx;
      st.push(e);
      draw();
    }

    // 의도적으로 미배선(현재 소비자 0건) — go() 는 이제 되감기(리뷰 I1)까지 하므로 대부분의
    // "화면을 바꾸되 스택엔 안 쌓기" 요구는 go() 로 충분하다. replace() 는 정말 "이 자리를
    // 지우고 다른 걸 놓는다"(예: 딥링크로 들어온 첫 진입을 히스토리에서 지우는 것)가 필요할
    // 때를 위해 남겨 둔다 — 그런 요구가 P1 화면 재작성에서 나오면 그때 배선한다.
    function replace(id, params) {
      var e = entryOf(id, params);
      tab = e.tab;
      var st = stacks[tab];
      if (st.length) st[st.length - 1] = e; else st.push(e);
      draw();
    }

    function switchTab(t) {
      if (TABS.indexOf(t) < 0) throw new Error("모르는 탭: " + t);
      tab = t;
      draw();
    }

    // 반환값은 "우리가 처리했는가"다. false 면 호출자(안드로이드 백 버튼)가 앱을 닫는다.
    function back() {
      var st = stacks[tab];
      if (st.length > 1) { st.pop(); draw(); return true; }
      if (tab !== HOME) { tab = HOME; draw(); return true; }
      return false;
    }

    function current() {
      var e = top();
      return e ? { id: e.id, params: e.params, tab: e.tab } : null;
    }

    function stackOf(t) {
      return (stacks[t] || []).map(function (e) { return { id: e.id, params: e.params }; });
    }

    return { register: register, go: go, replace: replace, switchTab: switchTab,
             back: back, current: current, stackOf: stackOf, tab: function () { return tab; } };
  }

  return { create: create, TABS: TABS, HOME: HOME };
});
