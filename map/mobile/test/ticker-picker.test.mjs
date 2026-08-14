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

test("큐레이션 목록에 시드 3종이 들어 있다 — 미리 선택될 것들이다", () => {
  const syms = P.CURATED.map(x => x.sym);
  ["AAPL", "NVDA", "MSFT"].forEach(s => assert.ok(syms.indexOf(s) >= 0, s + " 가 없다"));
  assert.ok(P.CURATED.length >= 8, "고를 게 너무 적다: " + P.CURATED.length);
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
  assert.strictEqual(P.nameOf("aapl"), "Apple", "정규화 후 조회하지 않는다");
  assert.strictEqual(P.nameOf("TSLA"), "Tesla");
  assert.strictEqual(P.nameOf("PLTR"), "", "모르는 심볼에 이름을 지어냈다");
  // 기대값을 리터럴로 두 번 적지 않는다 — CURATED 12종 전부가 자기 이름을 돌려줘야 한다.
  P.CURATED.forEach(x => assert.strictEqual(P.nameOf(x.sym), x.name, x.sym));
});

test("create() — onChange 는 심볼 목록과 {sym,name} 목록을 함께 준다", () => {
  const seen = [];
  const p = P.create({ multi: true, max: null, preset: [],
                       onChange: (s, items) => seen.push(items), strings: MSStr });
  const grid = findByClass(p.el, "tp-grid");
  grid.dispatch("click", { target: cellFor(grid, "NVDA") });
  assert.deepEqual(seen[seen.length - 1], [{ sym: "NVDA", name: "NVIDIA" }],
    "onChange 가 이름을 안 준다 — 부르는 쪽이 이름 없이 심게 된다");
  assert.deepEqual(p.selectedItems(), [{ sym: "NVDA", name: "NVIDIA" }]);
});

test("create() — 프리셋도 이름을 달고 나온다", () => {
  const p = P.create({ multi: true, max: null, preset: ["aapl", "PLTR"], strings: MSStr });
  assert.deepEqual(p.selectedItems(),
    [{ sym: "AAPL", name: "Apple" }, { sym: "PLTR", name: "" }],
    "프리셋이 이름 없이 나온다 — CURATED 밖 심볼은 빈 이름이 맞다(store 가 심볼로 폴백)");
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
