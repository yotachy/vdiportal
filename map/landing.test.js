"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "index.html");
const read = () => fs.readFileSync(FILE, "utf8");

// 양 테마가 반드시 함께 지정해야 하는 토큰 키 (누락 시 전환 간 leak)
const TOKENS = [
  "--bg", "--bg-hi", "--surface", "--surface-2", "--tint", "--footer-bg",
  "--border", "--border-2", "--text", "--muted", "--muted-2", "--muted-3",
  "--accent", "--accent-strong", "--on-accent",
];

function styleCss(html) {
  const start = html.indexOf("<style>");
  const end = html.indexOf("</style>");
  assert.ok(start >= 0 && end > start, "<style> 블록 없음");
  return html.slice(start + "<style>".length, end);
}

// selector가 <style> 최상위에 정확히 한 번만 등장한다고 가정한 단순 매칭(진짜 CSS 파서 아님).
// 이후 :root/[data-theme=dark]를 @media나 @supports 안에 중첩시키는 작업이 생기면 이 helper부터 다시 볼 것.
function blockOf(css, selector) {
  const i = css.indexOf(selector + "{");
  assert.ok(i >= 0, `셀렉터 없음: ${selector}`);
  return css.slice(i, css.indexOf("}", i));
}

test("검색 비공개 메타가 있다", () => {
  assert.match(read(), /<meta name="robots" content="noindex, nofollow">/);
});

test("양 테마가 같은 토큰 키를 전부 지정한다", () => {
  const css = styleCss(read()).replace(/\s+/g, "");
  const light = blockOf(css, ":root");
  const dark = blockOf(css, "[data-theme=dark]");
  for (const t of TOKENS) {
    assert.ok(light.includes(t + ":"), `라이트에 ${t} 누락`);
    assert.ok(dark.includes(t + ":"), `다크에 ${t} 누락`);
  }
});

test("테마 판정이 첫 페인트 전에 끝난다 (head 인라인)", () => {
  const html = read();
  const head = html.slice(0, html.indexOf("</head>"));
  assert.ok(head.includes("site_theme"), "head에 테마 초기화 스크립트 없음");
  assert.ok(head.includes("prefers-color-scheme"), "OS 선호 테마 폴백 없음");
  // 문자열이 등장하는 것만으로는(주석 등) 부족 — 실제로 documentElement에 data-theme를 세팅해야 통과
  assert.match(
    head,
    /document\.documentElement\.setAttribute\(\s*["']data-theme["']/,
    "head 스크립트가 documentElement에 data-theme를 설정하지 않음"
  );
});

test("브랜드명이 상수 1곳에서 주입된다", () => {
  const html = read();
  assert.match(html, /const BRAND\s*=/, "BRAND 상수 없음");
  // 상수 선언만으로는 부족 — title과 [data-brand] 요소 양쪽에 실제로 소비돼야 통과
  assert.match(html, /document\.title\s*=\s*BRAND\b/, "BRAND가 document.title에 쓰이지 않음");
  assert.match(
    html,
    /querySelectorAll\(\s*["']\[data-brand\]["']\s*\)/,
    "BRAND가 [data-brand] 요소 조회에 쓰이지 않음"
  );
  assert.match(html, /\.textContent\s*=\s*BRAND\b/, "BRAND가 textContent로 채워지지 않음");
});

test("로그인 버튼은 노출하지 않는다 (인증 비활성)", () => {
  assert.ok(!/>\s*로그인\s*</.test(read()), "로그인 버튼이 노출됨");
});

test("시장 스트립에 가짜 시세 숫자가 없다", () => {
  const html = read();
  const strip = html.slice(html.indexOf('class="markets"'), html.indexOf("</section>", html.indexOf('class="markets"')));
  assert.ok(!/[+\-]\d+\.\d+%/.test(strip), "스트립에 등락률 숫자가 있음");
  assert.ok(!/\d{2,3}\.\d{2}/.test(strip), "스트립에 가격 숫자가 있음");
});

test("마퀴가 reduced-motion을 존중한다", () => {
  assert.match(read(), /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("테마 토글은 aria-pressed를 쓴다", () => {
  assert.match(read(), /id="themeToggle"[^>]*aria-pressed/);
});

module.exports = { FILE, read, TOKENS, blockOf, styleCss };
