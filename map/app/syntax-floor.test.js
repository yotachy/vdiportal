// 앱 문법 하한 관문 — ES2017 확정(map/CLAUDE.md §⑤).
// ES2017 보다 확실히 나중이면서 지금 안 쓰는 문법만 금지한다.
// 주석·문자열 안의 표기(한국어 백틱 코드 표기 등) 오탐을 피하려고 코드 라인만 검사한다 —
// 라인 단위 근사: 주석 제거 후 문자열 리터럴을 비운 뒤 패턴 매칭.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const APP_DIR = __dirname;
const SOURCES = fs.readdirSync(APP_DIR).filter(function (f) {
  return /\.js$/.test(f) && !/\.test\.js$/.test(f);
});

// 문자열·주석을 비운 근사 코드 뷰(라인 구조 유지)
function stripLiterals(src) {
  let out = "";
  let i = 0, mode = null; // null | ' | " | ` | // | /*
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (mode === null) {
      if (c === "'" || c === '"' || c === "`") { mode = c; out += " "; }
      else if (c === "/" && n === "/") { mode = "//"; out += "  "; i++; }
      else if (c === "/" && n === "*") { mode = "/*"; out += "  "; i++; }
      else out += c;
    } else if (mode === "//") {
      if (c === "\n") { mode = null; out += "\n"; } else out += " ";
    } else if (mode === "/*") {
      if (c === "*" && n === "/") { mode = null; out += "  "; i++; }
      else out += (c === "\n" ? "\n" : " ");
    } else {
      if (c === "\\") { out += "  "; i++; }
      else if (c === mode) { mode = null; out += " "; }
      else out += (c === "\n" ? "\n" : " ");
    }
    i++;
  }
  return out;
}

const BANNED = [
  { re: /\?\./, name: "옵셔널 체이닝 ?. (ES2020)" },
  { re: /\?\?/, name: "null 병합 ?? (ES2020)" },
  { re: /\|\|=|&&=|\?\?=/, name: "논리 대입 (ES2021)" },
  { re: /#[A-Za-z_]/, name: "private 필드 (ES2022)" },
  { re: /\bObject\.hasOwn\b/, name: "Object.hasOwn (ES2022)" },
  { re: /\.(toSorted|toReversed|toSpliced|with)\s*\(/, name: "비파괴 배열 메서드 (ES2023)" },
  { re: /\bstructuredClone\b/, name: "structuredClone (런타임 하한 불확실)" },
  { re: /\b(Object|Map)\.groupBy\b/, name: "groupBy (ES2024)" }
];

SOURCES.forEach(function (f) {
  test("문법 하한: " + f, function () {
    const code = stripLiterals(fs.readFileSync(path.join(APP_DIR, f), "utf8"));
    const lines = code.split("\n");
    BANNED.forEach(function (b) {
      lines.forEach(function (line, idx) {
        assert.ok(!b.re.test(line), f + ":" + (idx + 1) + " — " + b.name);
      });
    });
  });
});

test("검사 대상이 비어 있지 않다", function () {
  assert.ok(SOURCES.length >= 6, "app/*.js 소스가 예상보다 적음: " + SOURCES.join(","));
});
