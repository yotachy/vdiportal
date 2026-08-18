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
      // 같은 화면을 연달아 부르면 쌓지 않고 교체한다 — 종목을 갈아타며 리포트를 열 때
      // 스택에 같은 화면이 열 개 쌓이면 뒤로가기가 같은 화면을 반복하게 된다.
      if (st.length && st[st.length - 1].id === id) st[st.length - 1] = e;
      else st.push(e);
      draw();
    }

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
