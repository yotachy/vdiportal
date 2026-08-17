import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 최소 DOM 스텁 ────────────────────────────────────────────────────────
// 이 프로젝트엔 jsdom 이 없다(package.json 확인). create() 는 요소 생성 + 이벤트 배선만
// 하는 순수 배선 코드라, watchlist.js 처럼 "배선은 테스트 없음"으로 넘어갈 수도 있었다.
// 하지만 toggle()/CURATED 만 보고는 max 상한이 실제 클릭 경로에서 지켜지는지, selected()가
// 프리셋이 아니라 살아있는 선택을 돌려주는지를 못 잡는다 — 그래서 DOM 표면을 최소로 흉내낸다.
function FakeNode(tag) {
  this.tagName = String(tag || "").toUpperCase();
  this.className = "";
  this.children = [];
  this.parentNode = null;
  this._attrs = {};
  this._listeners = {};
  this._text = "";
  this.style = {};
  this.value = "";
  this.type = "";
}
FakeNode.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
FakeNode.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
FakeNode.prototype.getAttribute = function (k) {
  return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
};
FakeNode.prototype.addEventListener = function (type, fn) {
  (this._listeners[type] = this._listeners[type] || []).push(fn);
};
FakeNode.prototype.dispatch = function (type, evt) {
  (this._listeners[type] || []).slice().forEach(fn => fn(evt || {}));
};
Object.defineProperty(FakeNode.prototype, "textContent", {
  get() { return this._text; },
  set(v) { this._text = String(v); this.children = []; }
});
Object.defineProperty(FakeNode.prototype, "innerHTML", {
  get() { return ""; },
  set() { this.children = []; }
});
global.document = { createElement: tag => new FakeNode(tag) };
// ui.js 는 document.createElement 만 쓰는 순수 헬퍼라 진짜 모듈을 그대로 전역에 얹는다 —
// ticker-picker.js 가 MSUi.el 로 요소를 만드는 경로까지 실제로 지나가게 하기 위해서다.
global.MSUi = require("../www/ui.js");

const P = require("../www/ticker-picker.js");
const MSStr = require("../www/strings.js");

function findByClass(node, cls) {
  for (const c of node.children) {
    if (String(c.className || "").split(" ").indexOf(cls) >= 0) return c;
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return undefined;
}
function cellFor(grid, sym) {
  return grid.children.filter(c => c.getAttribute("data-sym") === sym)[0];
}
function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

// 시안 12a 그대로(코디네이터 판정 2026-08-16) — 한국 상장 2종을 맨 앞에 두고, 미국 시드
// 3종(store.js SEED) 중 MSFT 는 이 여덟에 없다. 그래도 SEED ⊆ CURATED 는 더 이상 불변식이
// 아니다 — offSeen 메커니즘(paint())이 CURATED 밖 프리셋도 셀로 그리므로, MSFT 를 든 사용자가
// 온보딩 4단계에 들어와도 셀 자체는 사라지지 않는다(그 계약은 별도 테스트가 지킨다).
test("큐레이션 목록은 시안 12a 의 8종이다 — 국내 2종이 맨 앞", () => {
  const syms = P.CURATED.map(x => x.sym);
  assert.deepEqual(syms, ["005930", "000660", "NVDA", "AAPL", "TSLA", "035720", "005380", "QQQ"],
    "8종 순서가 시안과 다르다");
  assert.strictEqual(new Set(syms).size, syms.length, "중복 심볼");
  P.CURATED.forEach(x => assert.ok(x.name && x.name.length > 1, x.sym + " 에 이름이 없다"));
});

test("toggle 은 넣고 빼고, 상한에서 멈춘다", () => {
  assert.deepEqual(P.toggle([], "AAPL", 3), ["AAPL"]);
  assert.deepEqual(P.toggle(["AAPL"], "AAPL", 3), []);
  assert.deepEqual(P.toggle(["A", "B", "C"], "D", 3), ["A", "B", "C"], "상한을 넘겨 담았다");
  // 상한에 걸려도 이미 있는 것은 빼져야 한다 — 안 그러면 3개 고른 뒤 아무것도 못 바꾼다
  assert.deepEqual(P.toggle(["A", "B", "C"], "B", 3), ["A", "C"]);
  assert.deepEqual(P.toggle(["A", "B", "C"], "D", null), ["A", "B", "C", "D"], "상한 없음");
});

test("심볼은 대문자로 정규화된다", () => {
  assert.deepEqual(P.toggle([], "aapl", null), ["AAPL"]);
  assert.deepEqual(P.toggle(["AAPL"], " aapl ", null), []);
});

test("create() — 프리셋으로 그리드가 미리 켜져서 그려진다", () => {
  const p = P.create({ multi: true, max: null, preset: ["AAPL"], strings: MSStr });
  const grid = findByClass(p.el, "tp-grid");
  const cell = cellFor(grid, "AAPL");
  assert.ok(cell, "AAPL 셀이 없다");
  assert.ok(cell.className.split(" ").indexOf("is-on") >= 0, "프리셋이 켜진 채로 그려지지 않았다");
  assert.deepEqual(p.selected(), ["AAPL"]);
});

test("create() — 클릭이 선택을 토글하고 onChange 를 살아있는 선택으로 부른다", () => {
  const seen = [];
  const p = P.create({ multi: true, max: null, preset: [], onChange: s => seen.push(s), strings: MSStr });
  const grid = () => findByClass(p.el, "tp-grid");

  grid().dispatch("click", { target: cellFor(grid(), "NVDA") });
  assert.deepEqual(p.selected(), ["NVDA"]);
  assert.deepEqual(seen[seen.length - 1], ["NVDA"]);
  assert.ok(cellFor(grid(), "NVDA").className.indexOf("is-on") >= 0);

  grid().dispatch("click", { target: cellFor(grid(), "NVDA") });
  assert.deepEqual(p.selected(), []);
  assert.deepEqual(seen[seen.length - 1], []);
});

test("create() — multi:false 는 클릭할 때마다 하나만 남긴다", () => {
  const p = P.create({ multi: false, max: null, preset: [], strings: MSStr });
  const grid = () => findByClass(p.el, "tp-grid");
  grid().dispatch("click", { target: cellFor(grid(), "AAPL") });
  assert.deepEqual(p.selected(), ["AAPL"]);
  grid().dispatch("click", { target: cellFor(grid(), "NVDA") });
  assert.deepEqual(p.selected(), ["NVDA"], "단일 모드인데 누적됐다");
});

// 상한 도달 후 새 항목은 무시돼야 한다(위 toggle 유닛 테스트와 같은 계약) — 여기서는
// 실제 클릭 배선을 거쳐서, 그리고 selected()가 프리셋이 아니라 그 순간의 실제 선택을
// 돌려주는지까지 함께 확인한다. selected()가 프리셋을 그대로 돌려주는 버그라면 이 두
// 단언 중 어느 하나는 반드시 걸린다.
test("create() — max 도달 후 클릭은 무시되고, selected()는 실시간 선택을 돌려준다", () => {
  const p = P.create({ multi: true, max: 1, preset: ["AAPL"], strings: MSStr });
  const grid = () => findByClass(p.el, "tp-grid");

  grid().dispatch("click", { target: cellFor(grid(), "NVDA") });
  assert.deepEqual(p.selected(), ["AAPL"], "상한을 넘겨 담았다");

  // 상한에 걸려 있어도 이미 있는 것은 빼진다 — 뺀 뒤엔 selected()가 빈 배열이어야 한다.
  // preset을 그대로 돌려주는 구현이라면 여기서 ["AAPL"]이 나와 실패한다.
  grid().dispatch("click", { target: cellFor(grid(), "AAPL") });
  assert.deepEqual(p.selected(), [], "뺀 뒤에도 selected()가 프리셋을 돌려주고 있다");
});

// ── 이름을 함께 내보내는가 ────────────────────────────────────────────────────
// 심볼만 내보내던 시절, 부르는 쪽 두 곳(온보딩 seedTo · 워치리스트 ＋Add)이 모두
// addTicker(sym, "") 로 이름을 버렸다. store.js 가 name = 심볼로 폴백하면서 행이 심볼을
// 두 번 찍고(wl-sym·wl-name), 회사명 검색이 그 뒤로 추가한 종목에서만 조용히 멈췄다.
test("nameOf — CURATED 의 회사명을 돌려주고, 모르는 심볼은 빈 문자열이다", () => {
  assert.strictEqual(P.nameOf("aapl"), "애플", "정규화 후 조회하지 않는다");
  assert.strictEqual(P.nameOf("TSLA"), "테슬라");
  assert.strictEqual(P.nameOf("PLTR"), "", "모르는 심볼에 이름을 지어냈다");
  // 기대값을 리터럴로 두 번 적지 않는다 — CURATED 8종 전부가 자기 이름을 돌려줘야 한다.
  P.CURATED.forEach(x => assert.strictEqual(P.nameOf(x.sym), x.name, x.sym));
});

test("create() — onChange 는 심볼 목록과 {sym,name} 목록을 함께 준다", () => {
  const seen = [];
  const p = P.create({ multi: true, max: null, preset: [],
                       onChange: (s, items) => seen.push(items), strings: MSStr });
  const grid = findByClass(p.el, "tp-grid");
  grid.dispatch("click", { target: cellFor(grid, "NVDA") });
  assert.deepEqual(seen[seen.length - 1], [{ sym: "NVDA", name: "엔비디아" }],
    "onChange 가 이름을 안 준다 — 부르는 쪽이 이름 없이 심게 된다");
  assert.deepEqual(p.selectedItems(), [{ sym: "NVDA", name: "엔비디아" }]);
});

test("create() — 프리셋도 이름을 달고 나온다", () => {
  const p = P.create({ multi: true, max: null, preset: ["aapl", "PLTR"], strings: MSStr });
  assert.deepEqual(p.selectedItems(),
    [{ sym: "AAPL", name: "애플" }, { sym: "PLTR", name: "" }],
    "프리셋이 이름 없이 나온다 — CURATED 밖 심볼은 빈 이름이 맞다(store 가 심볼로 폴백)");
});

// 리뷰 지적(Important 2): paint() 가 CURATED 밖 항목을 sel 에 있을 때만 그리면, 끄는 순간
// 셀 자체가 격자에서 사라진다 — 되돌리려면 직접 입력으로 다시 loadTicker 왕복을 타야 하는데
// 오프라인·요청제한이면 그 길도 막힌다. api 를 아예 안 준다 — 네트워크 경로 자체가 없는
// 상태에서 그리드 클릭만으로 껐다 켤 수 있어야 한다.
test("create() — 오프-큐레이티드 프리셋은 꺼도 셀이 남아 네트워크 없이 다시 켤 수 있다", () => {
  const p = P.create({ multi: true, max: null, preset: ["PLTR", "SOFI"], strings: MSStr });
  const grid = () => findByClass(p.el, "tp-grid");

  assert.ok(cellFor(grid(), "PLTR"), "PLTR 셀이 처음부터 없다");
  grid().dispatch("click", { target: cellFor(grid(), "PLTR") });   // 끈다
  assert.deepEqual(p.selected(), ["SOFI"]);

  const cellAfterOff = cellFor(grid(), "PLTR");
  assert.ok(cellAfterOff, "꺼진 뒤 PLTR 셀이 격자에서 사라졌다 — 네트워크 없이 되돌릴 방법이 없다");
  assert.ok(cellAfterOff.className.split(" ").indexOf("is-on") < 0, "꺼졌는데 is-on 이 남았다");

  grid().dispatch("click", { target: cellAfterOff });   // 같은 셀을 다시 클릭 — fetch 없이 켠다
  assert.deepEqual(p.selected(), ["SOFI", "PLTR"], "네트워크 없이 다시 켜지지 않았다");
  assert.ok(cellFor(grid(), "PLTR").className.split(" ").indexOf("is-on") >= 0);
});

test("create() — 직접 입력: 서버가 준 이름을 붙잡아 selectedItems 에 싣는다", async () => {
  const seen = [];
  // 옛 prompt() 경로가 addTicker(sym, data.name || sym) 로 쓰던 바로 그 값이다.
  const fakeApi = { loadTicker: () => Promise.resolve({ name: "Palantir Technologies" }) };
  const p = P.create({ multi: true, max: null, preset: [],
                       onChange: (s, items) => seen.push(items), api: fakeApi, strings: MSStr });
  const input = findByClass(p.el, "tp-input");
  input.value = "pltr";
  findByClass(p.el, "tp-add").dispatch("click");
  await flush();

  assert.deepEqual(p.selectedItems(), [{ sym: "PLTR", name: "Palantir Technologies" }],
    "직접 입력 종목의 이름이 버려졌다 — 이 심볼의 이름을 아는 지점은 여기뿐이다");
  assert.deepEqual(seen[seen.length - 1], [{ sym: "PLTR", name: "Palantir Technologies" }]);
});

test("create() — 직접 입력: 찾으면 추가되고 입력창이 비워진다", async () => {
  const seen = [];
  const fakeApi = { loadTicker: sym => Promise.resolve({ name: sym }) };
  const p = P.create({ multi: true, max: null, preset: [], onChange: s => seen.push(s), api: fakeApi, strings: MSStr });
  const input = findByClass(p.el, "tp-input");
  const addBtn = findByClass(p.el, "tp-add");

  input.value = "tsla";
  addBtn.dispatch("click");
  await flush();

  assert.deepEqual(p.selected(), ["TSLA"], "직접 입력이 대문자로 정규화돼 추가되지 않았다");
  assert.deepEqual(seen[seen.length - 1], ["TSLA"]);
  assert.strictEqual(input.value, "", "성공 후 입력창이 비지 않았다");
});

test("create() — Enter 키로도 직접 입력이 동작한다(단일 모드는 교체)", async () => {
  const fakeApi = { loadTicker: () => Promise.resolve({}) };
  const p = P.create({ multi: false, max: null, preset: ["AAPL"], api: fakeApi, strings: MSStr });
  const input = findByClass(p.el, "tp-input");

  input.value = "qqq";
  input.dispatch("keydown", { key: "Enter" });
  await flush();

  assert.deepEqual(p.selected(), ["QQQ"]);
});

// ── Fix A: 이미 선택된 심볼을 직접 입력으로 다시 치면 꺼지는 게 아니라 안내만 뜬다 ──────────
// applySelection(sym) 이 toggle() 을 타면 이미 있는 걸 빼버린다 — 다시 담으려던 사용자가
// 그 종목이 꺼지는 걸 본다. 멤버십 체크가 fetch **전에** 있어야 한다 — loadTicker 콜 카운트로
// 그것까지 함께 확인한다(체크가 fetch 뒤에 있으면 통과할 수 있는 뮤테이션을 잡기 위해).
test("create() — 멀티 모드: 이미 고른 심볼을 직접 입력하면 fetch 없이 안내만 뜨고 꺼지지 않는다", async () => {
  const calls = [];
  const fakeApi = { loadTicker: sym => { calls.push(sym); return Promise.resolve({ name: sym }); } };
  const p = P.create({ multi: true, max: null, preset: ["AAPL"], api: fakeApi, strings: MSStr });
  const input = findByClass(p.el, "tp-input");
  const addBtn = findByClass(p.el, "tp-add");

  input.value = "aapl";
  addBtn.dispatch("click");
  await flush();

  assert.deepEqual(calls, [], "이미 고른 심볼인데 loadTicker 를 불렀다 — 멤버십 체크가 fetch 뒤에 있다");
  assert.deepEqual(p.selected(), ["AAPL"], "다시 입력했더니 꺼졌다 — toggle() 을 탄 결함");
  const msg = findByClass(p.el, "tp-msg");
  assert.strictEqual(msg.textContent, MSStr.t.tpAlreadyPicked);
});

// 같은 심볼을 대소문자/공백만 다르게 입력해도 정규화 후 멤버십을 봐야 한다.
test("create() — 멀티 모드: 대소문자·공백만 다른 재입력도 이미 고른 것으로 본다", async () => {
  const calls = [];
  const fakeApi = { loadTicker: sym => { calls.push(sym); return Promise.resolve({ name: sym }); } };
  const p = P.create({ multi: true, max: null, preset: ["NVDA"], api: fakeApi, strings: MSStr });
  const input = findByClass(p.el, "tp-input");
  findByClass(p.el, "tp-add");

  input.value = " nvda ";
  findByClass(p.el, "tp-add").dispatch("click");
  await flush();

  assert.deepEqual(calls, []);
  assert.deepEqual(p.selected(), ["NVDA"]);
});

// 단일 모드(워치리스트 ＋Add)는 이 가드 밖이다 — 같은 심볼 재입력이 정상 동작(교체)이어야
// 한다. 가드를 multi 로 한정하지 않으면 ＋Add 시트에서 같은 종목을 다시 치는 것 자체가
// 막혀버린다(과제 지시: "single-select case ... 재입력해도 동작해야 한다").
test("create() — 단일 모드: 같은 심볼 재입력도 fetch 를 타고 정상 동작한다", async () => {
  const calls = [];
  const fakeApi = { loadTicker: sym => { calls.push(sym); return Promise.resolve({ name: "Apple Inc." }); } };
  const p = P.create({ multi: false, max: null, preset: ["AAPL"], api: fakeApi, strings: MSStr });
  const input = findByClass(p.el, "tp-input");
  const addBtn = findByClass(p.el, "tp-add");

  input.value = "aapl";
  addBtn.dispatch("click");
  await flush();

  assert.deepEqual(calls, ["AAPL"], "단일 모드는 재입력에서도 fetch 를 타야 한다");
  assert.deepEqual(p.selected(), ["AAPL"]);
  assert.deepEqual(p.selectedItems(), [{ sym: "AAPL", name: "Apple Inc." }]);
});

// ── Fix B: CURATED 밖 선택 항목도 셀로 그려진다 ─────────────────────────────────────────
test("create() — 프리셋이 CURATED 밖 심볼뿐이면 그 심볼이 셀로 켜져서 그려진다", () => {
  const p = P.create({ multi: true, max: null, preset: [{ sym: "PLTR", name: "Palantir" }], strings: MSStr });
  const grid = findByClass(p.el, "tp-grid");
  const cell = cellFor(grid, "PLTR");
  assert.ok(cell, "PLTR 셀이 안 그려졌다 — selected()는 참인데 격자엔 아무것도 없다");
  assert.ok(cell.className.split(" ").indexOf("is-on") >= 0, "PLTR 셀이 켜진 채로 그려지지 않았다");
  assert.strictEqual(findByClass(cell, "tp-chip-label").textContent, "Palantir",
    "프리셋이 준 이름이 안 실렸다");
  assert.deepEqual(p.selected(), ["PLTR"]);
});

// CURATED 8종 순서는 그대로, 밖 종목은 뒤에 붙는다 — 순서를 흔들면 시안 12a 레이아웃이 튄다.
test("create() — CURATED 8종 순서는 그대로고, 밖 항목은 뒤에 이어붙는다", () => {
  const p = P.create({ multi: true, max: null,
                       preset: [{ sym: "PLTR", name: "Palantir" }, "AAPL"], strings: MSStr });
  const grid = findByClass(p.el, "tp-grid");
  const syms = grid.children.map(c => c.getAttribute("data-sym"));
  assert.deepEqual(syms.slice(0, P.CURATED.length), P.CURATED.map(x => x.sym),
    "CURATED 8종 순서가 바뀌었다");
  assert.deepEqual(syms.slice(P.CURATED.length), ["PLTR"], "밖 항목이 8종 뒤에 붙지 않았다");
});

// CURATED 밖 심볼을 이름 없이(문자열 프리셋) 주면 심볼로라도 그려져야 한다 — 빈 칸보다 낫다.
test("create() — 이름 없는 CURATED 밖 프리셋도 심볼로 셀이 그려진다", () => {
  const p = P.create({ multi: true, max: null, preset: ["ZZZZ"], strings: MSStr });
  const grid = findByClass(p.el, "tp-grid");
  const cell = cellFor(grid, "ZZZZ");
  assert.ok(cell, "이름 없는 프리셋도 셀이 있어야 한다");
  assert.strictEqual(findByClass(cell, "tp-chip-label").textContent, "ZZZZ", "이름이 없으면 심볼로 폴백해야 한다");
});

test("create() — 직접 입력으로 CURATED 밖 심볼을 추가해도 셀이 켜진다", async () => {
  const fakeApi = { loadTicker: () => Promise.resolve({ name: "Palantir Technologies" }) };
  const p = P.create({ multi: true, max: null, preset: [], api: fakeApi, strings: MSStr });
  const input = findByClass(p.el, "tp-input");
  input.value = "pltr";
  findByClass(p.el, "tp-add").dispatch("click");
  await flush();

  const grid = findByClass(p.el, "tp-grid");
  const cell = cellFor(grid, "PLTR");
  assert.ok(cell, "직접 입력으로 추가한 CURATED 밖 종목이 셀로 안 그려졌다");
  assert.ok(cell.className.split(" ").indexOf("is-on") >= 0);
  assert.strictEqual(findByClass(cell, "tp-chip-label").textContent, "Palantir Technologies");
});

// CURATED 심볼은 프리셋에 이름을 다르게 줘도 표준 이름을 지킨다 — 정식 표시명이 이미 있다.
test("create() — CURATED 심볼은 프리셋이 다른 이름을 줘도 CURATED 이름을 쓴다", () => {
  const p = P.create({ multi: true, max: null,
                       preset: [{ sym: "TSLA", name: "Tesla, Inc." }], strings: MSStr });
  assert.deepEqual(p.selectedItems(), [{ sym: "TSLA", name: "테슬라" }],
    "CURATED 표준 이름이 프리셋 이름으로 덮였다");
});

test("create() — 직접 입력: 상한에 걸리면 추가되지 않고 안내가 뜬다", async () => {
  const fakeApi = { loadTicker: () => Promise.resolve({}) };
  const p = P.create({ multi: true, max: 1, preset: ["AAPL"], api: fakeApi, strings: MSStr });
  const input = findByClass(p.el, "tp-input");
  const addBtn = findByClass(p.el, "tp-add");

  input.value = "nvda";
  addBtn.dispatch("click");
  await flush();

  assert.deepEqual(p.selected(), ["AAPL"], "상한을 넘겨 직접 입력으로 추가했다");
  const msg = findByClass(p.el, "tp-msg");
  assert.strictEqual(msg.textContent, MSStr.t.tpFull);
});

test("create() — 직접 입력: 오타면 후보를 안내한다(api.js 의 err.suggest 경로)", async () => {
  const err = new Error("notfound");
  err.notfound = true;
  err.suggest = [{ s: "AAPL" }, { s: "AMZN" }];
  const fakeApi = { loadTicker: () => Promise.reject(err) };
  const p = P.create({ multi: true, max: null, preset: [], api: fakeApi, strings: MSStr });
  const input = findByClass(p.el, "tp-input");
  const addBtn = findByClass(p.el, "tp-add");

  input.value = "aaply";
  addBtn.dispatch("click");
  await flush();

  assert.deepEqual(p.selected(), [], "실패했는데 선택에 들어갔다");
  const msg = findByClass(p.el, "tp-msg");
  assert.ok(msg.textContent.indexOf("AAPL") >= 0 && msg.textContent.indexOf("AMZN") >= 0,
    "오타 후보가 안내에 없다: " + msg.textContent);
});

test("create() — 직접 입력: 못 찾으면 not-found 안내가 뜬다", async () => {
  const fakeApi = { loadTicker: () => Promise.reject(new Error("boom")) };
  const p = P.create({ multi: true, max: null, preset: [], api: fakeApi, strings: MSStr });
  const input = findByClass(p.el, "tp-input");
  const addBtn = findByClass(p.el, "tp-add");

  input.value = "zzzz";
  addBtn.dispatch("click");
  await flush();

  const msg = findByClass(p.el, "tp-msg");
  assert.strictEqual(msg.textContent, MSStr.t.tpNotFound);
});

test("create() — api 가 없으면(옵션 미전달·전역도 없음) 즉시 안내하고 아무것도 추가하지 않는다", () => {
  const p = P.create({ multi: true, max: null, preset: [], strings: MSStr });
  const input = findByClass(p.el, "tp-input");
  const addBtn = findByClass(p.el, "tp-add");

  input.value = "aapl";
  addBtn.dispatch("click");

  assert.deepEqual(p.selected(), []);
  const msg = findByClass(p.el, "tp-msg");
  assert.strictEqual(msg.textContent, MSStr.t.tpUnavailable);
});

// indicators.js/readings.js 와 같은 함정: 브라우저 UMD 분기는 root.MSUi 같은 전역을
// **팩토리 실행 시점**에 캡처하는 모듈이면 스크립트 태그 순서가 곧 계약이 된다. ticker-picker.js
// 자신은 create() 안에서만 MSApi/MSUi 를 참조해 로드 순서 자체엔 안전하지만, api.js 뒤·app.js
// 앞이라는 배치는 이 컴포넌트가 무엇을 옆에 두고 쓰이는지를 밝히는 문서 역할도 한다 —
// 여기서 순서를 고정해 둔다.
test("index.html — api.js → ticker-picker.js → app.js 순서", () => {
  const html = readFileSync(join(__dirname, "../www/index.html"), "utf8");
  const at = f => html.indexOf('<script src="' + f + '">');
  ["api.js", "ticker-picker.js", "app.js"].forEach(f =>
    assert.ok(at(f) >= 0, "index.html 에 " + f + " 스크립트 태그가 없다"));
  assert.ok(at("api.js") < at("ticker-picker.js"),
    "ticker-picker.js 는 api.js 뒤에 온다는 배선 전제로 쓰인다");
  assert.ok(at("ticker-picker.js") < at("app.js"),
    "app.js 부팅 시 MSTickerPicker 를 참조한다 — 먼저 로드되지 않으면 undefined 다");
});

// 잠금 — 이미 워치리스트에 있는 종목. seedTo 는 추가만 하므로 4단계에서 꺼도 실제로는
// 안 빠졌다(화면이 뺐다고 말하는데 목록엔 남음). 해제를 막고 이유를 말하는 쪽으로 정리했다.
test("create() — 잠긴 심볼은 해제되지 않고, 이유를 말한다", () => {
  const seen = [];
  const p = P.create({ multi: true, max: null, preset: ["AAPL", "NVDA"],
                       locked: ["AAPL"], onChange: s => seen.push(s), strings: MSStr });
  const grid = () => findByClass(p.el, "tp-grid");
  assert.ok(cellFor(grid(), "AAPL").className.indexOf("is-locked") >= 0, "잠금 표시가 없다");
  assert.ok(cellFor(grid(), "NVDA").className.indexOf("is-locked") < 0, "안 잠긴 셀이 잠겼다");

  grid().dispatch("click", { target: cellFor(grid(), "AAPL") });
  assert.deepEqual(p.selected(), ["AAPL", "NVDA"], "잠긴 심볼이 해제됐다");
  assert.strictEqual(seen.length, 0, "변화가 없는데 onChange 가 불렸다");
  assert.strictEqual(findByClass(p.el, "tp-msg").textContent, MSStr.t.tpKept,
                     "왜 안 빠지는지 말하지 않았다");

  // 잠금은 그 심볼에만 걸린다 — 나머지는 평소대로 토글돼야 한다
  grid().dispatch("click", { target: cellFor(grid(), "NVDA") });
  assert.deepEqual(p.selected(), ["AAPL"], "안 잠긴 심볼이 안 빠졌다");
});

test("create() — locked 를 안 주면 아무것도 잠기지 않는다", () => {
  // 신규 사용자의 SEED 3종이 이 경로다. 설계서 4단계는 "미리 선택되되 바꿀 수 있는" 자리다.
  const p = P.create({ multi: true, max: null, preset: ["AAPL", "NVDA", "MSFT"], strings: MSStr });
  const grid = () => findByClass(p.el, "tp-grid");
  ["AAPL", "NVDA", "MSFT"].forEach(s => {
    assert.ok(cellFor(grid(), s).className.indexOf("is-locked") < 0, s + " 가 잠겼다");
    grid().dispatch("click", { target: cellFor(grid(), s) });
  });
  assert.deepEqual(p.selected(), [], "프리셋을 전부 지울 수 없다");
});
