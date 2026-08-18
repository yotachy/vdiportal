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

// 리뷰 M1(Task 8 라운드 1/5, 온보딩 재설계 §완료 마감) — 위 시험은 .ms-tab 하나만 쟀다.
// .ob-retry(온보딩 7단계 유일한 탈출 버튼)가 34px 로 방치돼 있던 것도 이 규칙을 재는
// 관문이 그 클래스를 아예 몰랐기 때문이다. 여기서 범위를 프로젝트 전역 버튼으로 넓힌다.
//
// 목록은 손으로 짐작하지 않는다 — www/*.js·www/screens/*.js 전수에서 실제 <button>
// 생성부(`MSUi.el("button", "…")` · `document.createElement("button")` + className)를
// grep 해 뽑았다(2026-08-19 실측, Task 8 라운드 1/5). 그중 **CSS 에 min-height/height 를
// px 로 명시한** 것만 이 시험이 잴 수 있다 — padding·line-height 로만 높이가 정해지는
// 버튼은 실제 브라우저 getComputedStyle 없이는 못 잰다(이 시험의 한계, 범위 밖으로 남긴다).
//
// 정규식 함정 주의 — `\.ms-pill\b` 는 `.ms-pill-ico`(하이픈 뒤도 단어경계로 잡힘)까지
// 잘못 물어 그 안의 `svg{height:14px}`를 `.ms-pill` 자신의 높이로 오판했다(실측 중 발견).
// 그래서 셀렉터 뒤에 반드시 공백류 또는 `{` 만 오도록 `[\s{]` 로 좁혀 이 함정을 피한다.
// 위 CSS 는 style-shell.css 한 장뿐이다 — 이 시험은 프로젝트 전역 버튼을 재므로
// allCss()(전체 캐스케이드)를 따로 쓴다.
const ALL_CSS = allCss();
function heightOf(cls) {
  const re = new RegExp("\\." + cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s{][^{]*\\{[^}]*\\}", "s");
  const m = ALL_CSS.match(re);
  if (!m) return null;
  const h = m[0].match(/(?:min-height|height)\s*:\s*(\d+(?:\.\d+)?)px/);
  return h ? Number(h[1]) : null;
}

test("터치 대상 44px 하한 — 실 <button> 생성부에서 뽑은 전역 목록으로 넓힌다", () => {
  // 명시적 px 높이가 있고 44 이상인 것으로 확인된 버튼들(회귀 잠금 — 하나라도 44 밑으로
  // 내려가면 여기서 잡힌다). 값 자체(48 등)를 요구하지 않는다 — "44 이상"만 잠근다.
  //
  // 리뷰 M1(2/5) — `.wl-res-more`(watchlist.js "더 보기") · `.rp-last-more`(report.js
  // "더 보기")는 이 시험을 전역으로 넓히며(1/5) 36px 로 걸려 `test.todo()` 로 잠시
  // 남겨뒀었다. 컨트롤러 판정: "test.todo() 로 남기면 그건 스위트에 상주하는 예외다" —
  // 44px 로 올리고 이 목록에 합류시켜 실제 어서션으로 닫는다. 예외 목록이 아니라 회귀
  // 잠금 목록에 편입된 것이다.
  const compliant = ["btn", "rp-back", "rp-cta", "ob-retry", "ob-guess-btn",
    "sr-back", "rc-back", "rs-back", "ob32-expand", "ms-tab",
    "wl-res-more", "rp-last-more"];
  compliant.forEach((c) => {
    const h = heightOf(c);
    assert.ok(h !== null, "." + c + " 에서 명시적 min-height/height px 를 못 찾았다(시험이 낡았을 수 있다)");
    assert.ok(h >= 44, "." + c + " 가 44px 미만이다: " + h + "px");
  });
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
