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

test("같은 채움 비율은 같은 결과를 준다 — 렌더마다 흔들리지 않는다", () => {
  assert.equal(MSUi.scoopMark(42), MSUi.scoopMark(42));
});
