// 공용 하단 시트. 단계 선택(6b) · 종목 추가(12a) · 성향 변경(12b) · 광고 권유가 같은 것을 쓴다.
//
// 스택인 이유: 시안의 광고 진입점 1번은 "막힌 순간, 시트 안에서 바로" 전환한다 — 즉 시트
// 위에 시트가 열린다. 한 장만 가정하면 그 동선에서 아래 시트가 사라지고, 광고를 본 뒤
// "원래 하려던 분석"으로 돌아갈 자리가 없어진다.
//
// tier-sheet.js·screens/watchlist.js(openAddSheet)는 이미 .sheet-scrim/.sheet 를 직접
// 그려 쓰고 있다 — 그 두 소비자를 깨지 않기 위해 이 컴포넌트는 새 이름(.ms-sheet*)으로
// 간다(P1 에서 그 화면들이 이 컴포넌트로 옮겨온다).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSSheet", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var stack = [];

  function open(opts) {
    var o = opts || {};
    var backdrop = MSUi.el("div", "ms-sheet-backdrop");
    var sheet = MSUi.el("div", "ms-sheet");
    var head = MSUi.el("div", "ms-sheet-head");
    if (o.title) head.appendChild(MSUi.el("h2", "ms-sheet-title", o.title));
    sheet.appendChild(head);
    var body = MSUi.el("div", "ms-sheet-body");
    if (o.body) body.appendChild(o.body);
    sheet.appendChild(body);

    var entry = { backdrop: backdrop, sheet: sheet, onClose: o.onClose };
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) close(entry); });
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);
    document.body.classList.add("ms-sheet-open");
    stack.push(entry);
    return { close: function () { close(entry); }, body: body };
  }

  function close(entry) {
    var i = stack.indexOf(entry);
    if (i < 0) return false;
    stack.splice(i, 1);
    if (entry.backdrop.parentNode) entry.backdrop.parentNode.removeChild(entry.backdrop);
    if (!stack.length) document.body.classList.remove("ms-sheet-open");
    if (entry.onClose) entry.onClose();
    return true;
  }

  // 뒤로가기가 부른다 — 시트가 열려 있으면 화면을 바꾸지 않고 시트만 닫는다.
  function closeTop() {
    if (!stack.length) return false;
    return close(stack[stack.length - 1]);
  }

  function isOpen() { return stack.length > 0; }

  return { open: open, closeTop: closeTop, isOpen: isOpen };
});
