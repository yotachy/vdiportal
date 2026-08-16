import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSUi = require("../www/ui.js");
const WATCHLIST = readFileSync(new URL("../www/screens/watchlist.js", import.meta.url), "utf8");

test("헤더 마크가 비어 있지 않다 — 22px 컨테이너만 있고 내용이 없었다", () => {
  assert.match(WATCHLIST, /MSUi\.scoopMark\s*\(/, "헤더가 스쿱 마크를 그리지 않는다");
});

test("스쿱 마크는 채움 비율을 받는다 — 지갑 잔량 게이지가 같은 함수를 쓴다", () => {
  assert.match(MSUi.scoopMark(42), /<svg/, "SVG 를 돌려주지 않는다");
  assert.notEqual(MSUi.scoopMark(0), MSUi.scoopMark(100), "채움 비율이 결과를 바꾸지 않는다");
});

function fillY(svg) {
  var m = svg.match(/<rect x="0" y="([^"]+)"/);
  assert.ok(m, "rect y 를 못 찾았다");
  return m[1];
}
function clipId(svg) {
  var m = svg.match(/<clipPath id="([^"]+)"/);
  assert.ok(m, "clipPath id 를 못 찾았다");
  return m[1];
}

test("같은 채움 비율은 같은 채움 높이를 준다 — 렌더마다 흔들리지 않는다", () => {
  // id 는 호출마다 고유해야 하므로(아래 테스트) 마크업 전체가 아니라 실제로 채움을
  // 결정하는 rect y 좌표만 비교한다.
  assert.equal(fillY(MSUi.scoopMark(42)), fillY(MSUi.scoopMark(42)));
});

test("같은 채움 비율이라도 clipPath id 는 매번 다르다 — 한 페이지에 마크 두 개가 있으면 충돌한다", () => {
  // 태스크 6 지갑 게이지 + 헤더 마크처럼 같은 페이지에 두 번 그려질 때, id 가 반올림한
  // 퍼센트에서만 나오면 41.6 과 42.4 가 둘 다 msFill42 가 되어 clip-path 참조가 모호해지고
  // 한쪽이 다른 쪽 채움을 그린다. 카운터 기반 id 로 이 충돌을 막는다.
  assert.notEqual(clipId(MSUi.scoopMark(42)), clipId(MSUi.scoopMark(42)));
});

test("숫자가 아닌 채움 비율은 NaN 을 그리지 않는다 — 기본값(42)으로 떨어진다", () => {
  var svg = MSUi.scoopMark("abc");
  assert.doesNotMatch(svg, /NaN/, "NaN 이 마크업에 새어나왔다");
  assert.equal(fillY(svg), fillY(MSUi.scoopMark(42)));
});
