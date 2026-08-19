// 시트는 공용이다 — 단계 선택 · 종목 추가 · 성향 변경 · 광고 권유가 같은 것을 쓴다.
// 화면마다 제각각 만들면 라운드·최대높이·닫힘 경로가 조용히 갈린다(자물쇠가 그랬다).
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const SRC = readFileSync(new URL("../www/sheet.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../www/style-sheet.css", import.meta.url), "utf8");

test("상단 라운드 28 · 최대 82vh · 하단 안전영역 (시안 공통 컴포넌트)", () => {
  assert.match(CSS, /\.ms-sheet\b[^}]*border-radius:\s*28px\s+28px\s+0\s+0/s);
  assert.match(CSS, /\.ms-sheet\b[^}]*max-height:\s*82vh/s);
  assert.match(CSS, /\.ms-sheet\b[^}]*env\(safe-area-inset-bottom\)/s);
});

// 거리 기반 정규식(backdrop...400자 이내에 addEventListener("click"))은 안 쓴다 — 이
// 저장소는 "정규식이 상상한 모양만 잡는" 거짓 실패를 이미 여섯 건 겪었다. 여기선 두 개의
// 독립 단언으로 쓴다: ① CSS 에 클래스가 있는가 ② 소스에 그 리스너 호출이 있는가.
test("백드롭이 있고, 백드롭 탭으로 닫힌다", () => {
  assert.match(CSS, /\.ms-sheet-backdrop\b/);
  assert.match(SRC, /backdrop\.addEventListener\("click"/);
});

test("뒤로가기로 닫힌다 — 시트가 열린 채로 화면이 바뀌지 않게", () => {
  assert.match(SRC, /closeTop/, "뒤로가기가 부를 진입점이 없다");
});

test("좌측 세로 accent 라인 금지", () => {
  assert.ok(!/border-left:\s*[2-9]/.test(CSS));
});

// ── 스택 동작(실제 실행) ─────────────────────────────────────────────────────────────
// 리뷰가 지적한 대로 "/closeTop/·/stack/ 존재 확인"은 같은 이름의 변수·함수만 있으면
// 통과한다 — 실제로 LIFO 로 닫히는지, 마지막 한 장에서만 body 클래스가 풀리는지는 아무것도
// 안 잰다. 여기서부터는 가짜 DOM 을 깔고 sheet.js 를 실제로 실행해 동작으로 확인한다.
// (ticker-picker.test.mjs 가 이미 쓰는 패턴 — sheet.js 는 module.exports 분기를 타는
// UMD 라 순수 require 로 실행 가능하다.)
function FakeNode(tag) {
  this.tagName = String(tag || "").toUpperCase();
  this.className = "";
  this.children = [];
  this.parentNode = null;
  this.textContent = "";
}
FakeNode.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
FakeNode.prototype.removeChild = function (c) {
  var i = this.children.indexOf(c);
  if (i >= 0) this.children.splice(i, 1);
  c.parentNode = null;
  return c;
};
FakeNode.prototype.addEventListener = function () {};   // sheet.js 는 백드롭 자기 자신에만 건다(위 정적 시험이 확인)

function makeDoc() {
  const body = new FakeNode("body");
  body.classList = {
    _set: new Set(),
    add(c) { this._set.add(c); },
    remove(c) { this._set.delete(c); },
    contains(c) { return this._set.has(c); }
  };
  return { createElement: tag => new FakeNode(tag), body };
}

function load() {
  const doc = makeDoc();
  global.document = doc;
  global.MSUi = require("../www/ui.js");
  delete require.cache[require.resolve("../www/sheet.js")];   // 테스트마다 stack 을 새로 비운다
  const MSSheet = require("../www/sheet.js");
  return { MSSheet, doc };
}

test("여러 장이 쌓여도 위에서부터 닫힌다(LIFO) — 광고 권유가 단계 선택 시트 위에 열린다(시안 진입점 1)", () => {
  const { MSSheet, doc } = load();
  const closedOrder = [];
  const a = MSSheet.open({ title: "a", onClose: () => closedOrder.push("a") });
  const b = MSSheet.open({ title: "b", onClose: () => closedOrder.push("b") });
  assert.strictEqual(doc.body.children.length, 2, "두 장이 DOM 에 쌓이지 않았다");
  assert.ok(MSSheet.closeTop(), "위에 쌓인 시트가 안 닫혔다");
  assert.deepStrictEqual(closedOrder, ["b"], "먼저 닫혀야 할 것은 나중에 연 b 다(LIFO)");
  assert.strictEqual(doc.body.children.length, 1, "b 의 백드롭이 DOM 에서 안 지워졌다");
  assert.ok(MSSheet.closeTop());
  assert.deepStrictEqual(closedOrder, ["b", "a"]);
  assert.strictEqual(doc.body.children.length, 0);
});

test("body 스크롤 잠금 클래스는 마지막 한 장이 닫힐 때만 풀린다", () => {
  const { MSSheet, doc } = load();
  MSSheet.open({ title: "a" });
  assert.ok(doc.body.classList.contains("ms-sheet-open"), "첫 시트가 열렸는데 잠금 클래스가 없다");
  MSSheet.open({ title: "b" });
  assert.ok(doc.body.classList.contains("ms-sheet-open"));
  MSSheet.closeTop();   // b 만 닫힘 — a 가 아직 열려 있다
  assert.ok(doc.body.classList.contains("ms-sheet-open"), "시트가 하나 남았는데 잠금이 풀렸다");
  MSSheet.closeTop();   // a 도 닫힘 — 이제 0장
  assert.ok(!doc.body.classList.contains("ms-sheet-open"), "마지막 시트가 닫혔는데 잠금이 안 풀렸다");
});

test("빈 스택에서 closeTop() 은 false — 뒤로가기가 시트 없을 때 router 로 안전하게 넘어간다", () => {
  const { MSSheet } = load();
  assert.strictEqual(MSSheet.closeTop(), false);
  assert.strictEqual(MSSheet.isOpen(), false);
});

test("중간 항목을 직접 close() 해도 스택에서 정확히 빠진다(꼭대기가 아니어도)", () => {
  const { MSSheet } = load();
  const a = MSSheet.open({ title: "a" });
  const b = MSSheet.open({ title: "b" });
  const c = MSSheet.open({ title: "c" });
  a.close();   // 맨 아래(꼭대기 아님)를 직접 닫는다
  assert.strictEqual(MSSheet.isOpen(), true, "b·c 가 남아 있어야 하는데 스택이 비었다");
  assert.ok(MSSheet.closeTop());   // c
  assert.ok(MSSheet.closeTop());   // b
  assert.strictEqual(MSSheet.isOpen(), false, "a 를 직접 닫은 뒤 b·c 를 닫아도 스택이 안 빈다면 a 가 안 빠진 것");
});

test("같은 항목을 두 번 닫아도 무해하고, onClose 는 정확히 한 번만 불린다", () => {
  const { MSSheet } = load();
  let calls = 0;
  const a = MSSheet.open({ title: "a", onClose: () => { calls++; } });
  assert.strictEqual(a.close(), undefined);   // 반환값은 이번 라운드에서 안 고친다(원장에 이월)
  assert.strictEqual(calls, 1);
  a.close();   // 이미 닫힌 항목 재호출 — 던지지 않아야 하고 onClose 가 또 불리면 안 된다
  assert.strictEqual(calls, 1, "이미 닫힌 시트의 onClose 가 다시 불렸다");
  assert.strictEqual(MSSheet.closeTop(), false, "이미 빈 스택인데 closeTop 이 true 를 돌려줬다");
});
