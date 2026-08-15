import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
const CSS = readFileSync(new URL("../www/style.css", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");

// 이 부류는 헤드리스가 못 본다 — env(safe-area-*) 는 실기기에서만 0 이 아니다.
// 2026-08-15 첫 APK 에서 헤더가 상태바 아이콘에 가려진 채 나왔다. 하단 인셋은 있었고
// 상단만 없었다. 아래는 "상단 가장자리를 소유한 셋"이 각각 인셋을 갖는지를 못박는다.

test("viewport-fit=cover 다 — 이게 없으면 env(safe-area-*) 가 전부 0 이 된다", () => {
  assert.match(HTML, /viewport-fit\s*=\s*cover/,
    "viewport-fit 이 빠지면 인셋 CSS 가 조용히 무효가 된다(값이 0 이라 아무도 못 느낀다)");
});

test("상단 가장자리를 소유한 셋이 전부 상태바 인셋을 쓴다", () => {
  assert.match(CSS, /--safe-top\s*:\s*env\(\s*safe-area-inset-top/, "--safe-top 토큰이 없다");
  // 1단: 화면이 곧 최상단. #app 직계만 — .pane 안의 .scr 은 셸이 이미 처리한다.
  assert.match(CSS, /#app\s*>\s*\.scr\s*\{[^}]*padding-top\s*:\s*var\(--safe-top\)/,
    "1단 화면에 상단 인셋이 없다 — 헤더가 상태바에 가려진다");
  // 2단: 셸이 최상단.
  assert.match(CSS, /body\.ms-dual\s+\.shell\s*\{[^}]*padding-top\s*:\s*var\(--safe-top\)/,
    "2단 셸에 상단 인셋이 없다");
  // 온보딩: 셸 밖에서 직접 최상단.
  assert.match(CSS, /\.ob\s*\{[^}]*padding\s*:\s*calc\(\s*14px\s*\+\s*var\(--safe-top\)\)/,
    "온보딩에 상단 인셋이 없다 — 첫 화면부터 가려진다");
});

test("sticky 툴바가 스크롤 후에도 상태바 밑으로 안 들어간다", () => {
  // 1단 스크롤러는 body 라 sticky top:0 은 뷰포트 최상단 = 상태바 아래다.
  assert.match(CSS, /\.wl-toolbar\s*\{\s*top\s*:\s*var\(--safe-top\)/,
    "1단 툴바가 top:0 이면 스크롤하는 순간 다시 상태바에 가려진다");
  // 2단 스크롤러는 .pane 이고 그 위쪽 끝은 이미 셸 패딩 아래 — 여기서 또 주면 빈 띠가 생긴다.
  assert.match(CSS, /body\.ms-dual\s+\.wl-toolbar\s*\{\s*top\s*:\s*0/,
    "2단에서 인셋을 두 번 주면 상태바 높이만큼 빈 띠가 생긴다");
});

test("100dvh 를 쓰는 곳은 border-box 라 패딩이 뷰포트를 넘기지 않는다", () => {
  // body 에 padding-top 을 주는 단순한 방법을 못 쓴 이유가 이것이다.
  assert.match(CSS, /\*\s*\{[^}]*box-sizing\s*:\s*border-box/, "border-box 전역 규칙이 사라졌다");
  assert.doesNotMatch(CSS, /body\s*\{[^}]*padding-top\s*:\s*env\(\s*safe-area-inset-top/,
    "body 에 상단 인셋을 주면 .shell/.ob 의 100dvh 가 그만큼 뷰포트를 넘친다");
});
