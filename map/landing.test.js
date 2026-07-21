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

function blockOf(css, selector) {
  const i = css.indexOf(selector + "{");
  assert.ok(i >= 0, `셀렉터 없음: ${selector}`);
  return css.slice(i, css.indexOf("}", i));
}

test("검색 비공개 메타가 있다", () => {
  assert.match(read(), /<meta name="robots" content="noindex, nofollow">/);
});

test("양 테마가 같은 토큰 키를 전부 지정한다", () => {
  const css = read().replace(/\s+/g, "");
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
});

test("브랜드명이 상수 1곳에서 주입된다", () => {
  const html = read();
  assert.match(html, /const BRAND\s*=/, "BRAND 상수 없음");
});

module.exports = { FILE, read, TOKENS, blockOf };
