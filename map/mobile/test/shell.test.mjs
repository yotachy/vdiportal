// 탭바는 시안 14a 의 실측값을 그대로 쓴다. 값이 흔들리면 "개편했는데 그대로"가 된다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { allCss, cssFiles } from "./_css.mjs";

const SRC = readFileSync(new URL("../www/shell.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../www/style-shell.css", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");

test("탭은 셋이고 순서가 시안과 같다 — 목록 · 분석 · 스쿱", () => {
  const ids = [...SRC.matchAll(/tab:\s*"(list|analysis|scoop)"/g)].map(m => m[1]);
  assert.deepStrictEqual(ids.slice(0, 3), ["list", "analysis", "scoop"]);
});

// 배경은 리터럴 #11151d 가 아니라 --sheet 토큰으로 쓴다 — style-tokens.test.mjs 가 :root
// 밖 헥스 리터럴을 전면 금지하고 있어서다(map/mobile 저장소 관례, 브리프 작성 시점엔
// 이 관문과의 충돌이 검토되지 않았다). 값은 그대로다 — style-base.css 의 --sheet 가
// 이미 #11151d 라는 것을 아래서 직접 대조한다.
test("탭 높이 46 · 컨테이너 라운드 999 · 배경은 --sheet 토큰(#11151d, 시안 14a 실측)", () => {
  assert.match(allCss(), /--sheet\s*:\s*#11151d/, "--sheet 토큰이 시안 실측값(#11151d)이 아니다");
  assert.match(CSS, /\.ms-tabbar\b[^}]*background:\s*var\(--sheet\)/s, "탭바 배경이 --sheet 토큰이 아니다");
  assert.match(CSS, /\.ms-tab\b[^}]*height:\s*46px/s, "탭 높이가 46 이 아니다");
  assert.match(CSS, /\.ms-tabbar\b[^}]*border-radius:\s*999px/s);
});

test("터치 대상 44px 하한을 지킨다", () => {
  const m = CSS.match(/\.ms-tab\b[^}]*height:\s*(\d+)px/s);
  assert.ok(m && Number(m[1]) >= 44, "탭 높이가 44 미만이다");
});

test("좌측 세로 accent 라인 금지 — 활성은 배경으로만 말한다", () => {
  assert.ok(!/border-left:\s*[2-9]/.test(CSS), "좌측 컬러 라인이 들어왔다");
  assert.match(CSS, /\.ms-tab\.is-on\b[^}]*background:/s, "활성 탭을 배경으로 표시하지 않는다");
});

test("스쿱 탭 배지는 받을 것이 있을 때만 켜진다", () => {
  assert.match(SRC, /badge/, "배지 로직이 없다");
  assert.ok(!/\.ms-tab-badge[^}]*display:\s*block/.test(CSS.replace(/\.is-on[^}]*}/g, "")),
    "배지가 상시 노출이다 — 켜는 조건이 있어야 한다");
});

test("index.html 은 라우터·셸을 app.js 보다 먼저 싣는다", () => {
  const s = [...HTML.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(s.indexOf("router.js") < s.indexOf("shell.js"), "셸이 라우터보다 먼저 온다");
  assert.ok(s.indexOf("shell.js") < s.indexOf("app.js"), "app.js 가 셸보다 먼저 온다");
});

test("style-shell.css 가 캐스케이드에 들어 있다", () => {
  assert.ok(cssFiles().includes("style-shell.css"), "index.html 이 style-shell.css 를 링크하지 않는다");
  assert.match(allCss(), /\.ms-tabbar/);
});

test("app.js 는 화면 분기를 갖지 않는다 — 부팅만 한다", () => {
  const app = readFileSync(new URL("../www/app.js", import.meta.url), "utf8");
  assert.ok(!/state\.showing/.test(app), "app.js 에 옛 화면 분기가 남아 있다");
  assert.match(app, /MSShell\.mount/, "app.js 가 셸을 띄우지 않는다");
});

// ── 콜드탭 회귀 방지(Task 3 리뷰가 실측으로 잡은 설계 공백) ─────────────────────────
// 방문한 적 없는 탭으로 switchTab() 만 하면 그 탭 스택이 비어 있어 아무것도 안 그려진다
// (router.js draw() 가 top() null 이면 onRender 를 안 부른다). onTab() 이 그 경우 go(home)
// 으로 우회하는지를 소스에서 확인한다 — 실행 시험은 shell.js 가 UMD 로 router/MSUi/MSStr
// 전역을 요구해 순수 node require 로는 못 돌린다(boot-smoke.test.mjs 가 그 경로를 이미 덮는다).
test("빈 탭 스택으로 전환할 땐 switchTab 대신 홈으로 간다(콜드탭 방지)", () => {
  assert.match(SRC, /stackOf\(def\.tab\)\.length\s*===\s*0/,
    "onTab() 이 대상 탭의 스택 비어있음을 확인하지 않는다 — 콜드탭이면 화면이 안 바뀐다");
});
