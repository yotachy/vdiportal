// P2 §6 — 판독문 전체(시안 20a).
//
// 핵심 계약 셋: ① 새 엔진 호출이 없다 ② 무판정 지표가 목록에서 사라지지 않는다
// ③ 필터 넷의 합이 전체와 같다. 셋 다 "빠진 것을 알아채기 어려운" 종류라 기계가 본다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const T = require("../www/ind-tiers.js");
const I = require("../www/indicators.js");
const S = require("../www/strings.js");

const SRC = readFileSync(new URL("../www/screens/readings-list.js", import.meta.url), "utf8");
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");
const INDEX = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");

test("index.html — 판독문 화면과 등급표가 리포트보다 먼저 로드된다", () => {
  const t = INDEX.indexOf("ind-tiers.js"), r = INDEX.indexOf("screens/readings-list.js"),
        rep = INDEX.indexOf("screens/report.js");
  assert.ok(t > 0 && r > 0, "스크립트가 로드되지 않는다");
  assert.ok(t < r, "등급표가 화면보다 뒤에 온다");
  assert.ok(r < rep, "판독문 화면이 리포트보다 뒤에 온다 — 리포트가 이 화면을 연다");
});

// 이 화면은 계산하지 않는다. analyzeX 를 다시 부르면 같은 종목의 두 화면이 다른 숫자를 낼 수 있다.
test("판독문 화면은 엔진을 부르지 않는다 — 리포트가 준 행을 그대로 그린다", () => {
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m, p) => p);
  ["MSIndicators.readings", "MSIndicators.biases", "ForgeCore", "analyze"].forEach(bad =>
    assert.ok(body.indexOf(bad) < 0, "판독문 화면이 " + bad + " 를 부른다 — 두 화면이 다른 숫자를 낸다"));
  assert.match(REPORT, /rows: rows, noDir: noDir/, "리포트가 계산한 행을 안 넘긴다");
});

// dirOf / countBy 는 순수 함수다 — DOM 없이 계약을 잰다.
// (window.MSReadingsList 로 붙으므로 전역을 흉내 내어 로드한다.)
function loadScreen() {
  const g = { MSIndicators: I, MSStr: S, MSIndTiers: T, MSUi: {}, window: {} };
  g.window = g;
  const fn = new Function("window", "MSIndicators", "MSStr", "MSIndTiers", "MSUi", SRC + "\nreturn window.MSReadingsList;");
  return fn(g, I, S, T, {});
}
const R = loadScreen();

test("무판정 판정 — bias 가 null 이면 '중립'이 아니라 무판정이다", () => {
  assert.strictEqual(R.dirOf({ bias: null }), "none", "방향을 물을 수 없는 지표를 중립으로 셌다");
  assert.strictEqual(R.dirOf({ bias: 0 }), "none");
  assert.strictEqual(R.dirOf({ bias: I.EPS }), "none", "데드존 경계가 방향으로 샜다");
  assert.strictEqual(R.dirOf({ bias: 0.9 }), "up");
  assert.strictEqual(R.dirOf({ bias: -0.9 }), "down");
});

test("필터 넷의 합이 전체와 같다 — 어느 필터에도 안 걸리는 지표가 없다", () => {
  const rows = [{ bias: 0.5 }, { bias: -0.5 }, { bias: 0 }, { bias: null }, { bias: 0.01 }];
  const c = R.countBy(rows);
  assert.strictEqual(c.up + c.down + c.none, c.all,
    "합이 전체와 다르다: " + JSON.stringify(c) + " — 어떤 지표가 목록에서 사라진다");
  assert.strictEqual(c.all, rows.length);
});

test("필터는 넷이다 — 시안 20a 의 전체/상승/하락/무판정", () => {
  assert.deepEqual(R.FILTERS, ["all", "up", "down", "none"]);
});

// 등급 섹션이 모든 지표를 덮는지 — 어느 등급에도 없는 지표는 화면에서 통째로 사라진다.
test("등급 섹션이 엔진의 모든 지표를 덮는다 — 어디에도 안 속하면 화면에서 사라진다", () => {
  const orphan = T.all().filter(t => T.lvOf(t) == null);
  assert.deepEqual(orphan, [], "등급 없는 지표: " + orphan.join(", "));
  const known = Object.keys(I.SHAPES).concat(I.NO_BIAS);
  const uncovered = known.filter(t => T.lvOf(t) == null);
  assert.deepEqual(uncovered, [],
    "판독은 되는데 등급표에 없는 지표(목록에서 사라진다): " + uncovered.join(", "));
});

test("기본 티어에는 판독문 링크가 없다 — 블록 3개 화면이다", () => {
  assert.match(REPORT, /if \(tier === "basic"\) return null;\s*\/\/ 기본은 판독문을 팔지 않는다/,
    "기본에서 판독문 링크를 막지 않는다");
});

test("링크의 지표 수는 실제로 읽은 행 수다 — 리터럴 32 가 아니다", () => {
  assert.match(REPORT, /MSStr\.t\.rdLinkA \+ all\.length \+ MSStr\.t\.rdLinkB/,
    "링크 개수를 유도하지 않는다");
  assert.ok(!/32개 판독문/.test(String(S.t.rdLinkA) + String(S.t.rdLinkB)),
    "문구에 32 가 리터럴로 박혀 있다");
});
