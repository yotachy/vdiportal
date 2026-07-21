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
  assert.ok(!/[+\-]?\d+(\.\d+)?%/.test(strip), "스트립에 등락률 숫자가 있음");
  assert.ok(!/\d{2,3}\.\d{2}/.test(strip), "스트립에 가격 숫자가 있음");
  assert.ok(!/\d{1,3}(,\d{3})+/.test(strip), "스트립에 콤마 구분 정수 가격이 있음");
});

test("마퀴가 reduced-motion을 존중한다", () => {
  assert.match(read(), /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("테마 토글은 aria-pressed를 쓴다", () => {
  assert.match(read(), /id="themeToggle"[^>]*aria-pressed/);
});

// 시안 카피 회귀 방지 — 스코어카드와 충돌하는 문자열은 페이지 어디에도 등장 금지 (다른 태스크도 재사용)
// 숫자로만 된 항목은 다른(정당한) 숫자열의 부분 문자열로 오탐할 수 있다
// (예: "217"은 "1217"·"21,700"에도 포함됨) — 그런 항목만 정규식으로 경계를 고정한다.
// 단어형 항목(신용카드 등)은 우연히 부분일치할 문맥이 없어 그대로 문자열로 둔다.
const BANNED = [
  /(?<![.\d])62%(?!p)/, // "62% 정확도" 가짜 수치 — 162%·0.62% 등과 우연히 겹치지 않게 숫자·소수점 경계 고정
  /(?<!\d)217건(?!\d)/, // "217건 추적 중" 가짜 수치 — 21,700·1217 등과 겹치지 않게 단위(건)까지 포함해 고정
  /(?<!\d)19,000(?!\d)/, // "19,000" 가짜 수치 — 119,000 등 더 큰 숫자의 일부로 오탐하지 않게 숫자 경계 고정
  "신용카드",
  "하루 5개",
  "상승 확률",
];

test("금지 카피가 어디에도 없다", () => {
  const html = read();
  for (const s of BANNED) {
    if (s instanceof RegExp) {
      assert.ok(!s.test(html), `금지 문자열 발견: ${s}`);
    } else {
      assert.ok(!html.includes(s), `금지 문자열 발견: ${s}`);
    }
  }
});

test("히어로가 정직한 역제 서사를 편다", () => {
  const html = read();
  assert.ok(html.includes("방향을 맞힌다고"), "역제 헤드라인 없음");
  assert.ok(html.includes("얼마나 움직일지"), "대안 주장 없음");
});

test("히어로 KPI가 스코어카드 실측치다", () => {
  const html = read();
  const hero = html.slice(html.indexOf('class="hero"'), html.indexOf("</section>", html.indexOf('class="hero"')));
  // 단위(%·%p)는 <span class="kpi-unit"> 태그로 감싸져 있어, 태그 경계를 제거한 뒤 부분 문자열로 검사한다
  const heroText = hero.replace(/<[^>]+>/g, "");
  for (const v of ["69.0%", "67~69%", "1.9%p"]) {
    assert.ok(heroText.includes(v), `KPI 누락: ${v}`);
  }
  assert.ok(heroText.includes("93k시점"), "검증 규모 표기 없음");
});

test("제품 모형이 예시임을 명시한다", () => {
  const html = read();
  const i = html.indexOf('class="mock"');
  assert.ok(i >= 0, "모형 섹션 없음");
  const sec = html.slice(i, html.indexOf("</section>", i));
  assert.ok(sec.includes("예시 화면"), "예시 라벨 없음 — 실제 시세로 오인될 수 있음");
});

test("모형이 검증된 축만 보여준다", () => {
  const html = read();
  const i = html.indexOf('class="mock"');
  const sec = html.slice(i, html.indexOf("</section>", i));
  for (const k of ["변동성", "낙폭", "R:R"]) {
    assert.ok(sec.includes(k), `모형에 ${k} 없음`);
  }
  assert.ok(!sec.includes("적중률"), "모형이 방향 적중률을 주장함");
});

module.exports = { FILE, read, TOKENS, blockOf, styleCss };
