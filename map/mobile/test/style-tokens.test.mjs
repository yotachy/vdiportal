import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
const CSS = readFileSync(new URL("../www/style.css", import.meta.url), "utf8");
const ROOT = (CSS.match(/:root\s*\{[\s\S]*?\}/) || [""])[0];
const BODY = CSS.slice(CSS.indexOf("}", CSS.indexOf(":root")) + 1);   // :root 이후 전부

test("타이포 8역할이 토큰으로 정의돼 있다", () => {
  for (const k of ["headline", "title", "section", "figure", "body", "sub", "caption", "overline"])
    assert.match(ROOT, new RegExp("--fs-" + k + "\\s*:"), "--fs-" + k + " 없음");
});

test("화면 CSS 의 font-size 는 토큰만 쓴다 — 4px 폭에 8단계가 뒤섞이던 것을 막는다", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\*[\s\S]*?\*\//g, "");
    const m = code.match(/font-size\s*:\s*([^;}]+)/);
    if (m && !/var\(--fs-/.test(m[1])) bad.push((i + 1) + ": " + m[0].trim());
  });
  assert.deepEqual(bad, [], "토큰 아닌 font-size " + bad.length + "건:\n" + bad.join("\n"));
});

test("색은 토큰만 — :root 밖에 헥스 리터럴이 없다", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/, "");
    (code.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(h => bad.push((i + 1) + ": " + h));
  });
  assert.deepEqual(bad, [], "하드코딩 헥스 " + bad.length + "건:\n" + bad.join("\n"));
});

test("항목 좌측 세로 컬러 라인이 없다 — 프로젝트 전역 금지", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\*[\s\S]*?\*\//g, "");
    if (/border-left\s*:\s*[2-9]/.test(code)) bad.push((i + 1) + ": " + code.trim());
    if (/box-shadow\s*:\s*inset\s+[1-9][0-9.]*px\s+0\s+0/.test(code)) bad.push((i + 1) + ": " + code.trim());
  });
  assert.deepEqual(bad, [], "좌측 accent bar " + bad.length + "건:\n" + bad.join("\n"));
});

test("--neutral 은 텍스트 색으로 쓰이지 않는다 — 대비 2.4:1", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\*[\s\S]*?\*\//g, "");
    if (/(^|[^-])\bcolor\s*:\s*var\(--neutral\)/.test(code)) bad.push((i + 1) + ": " + code.trim());
  });
  assert.deepEqual(bad, [], "--neutral 을 텍스트에 쓴 곳:\n" + bad.join("\n"));
});

test("--action 과 --pred2 는 별개 토큰이다 — 값이 같아도 소비자가 다르다", () => {
  assert.match(ROOT, /--action\s*:/, "--action 이 없다");
  assert.match(ROOT, /--pred2\s*:/, "--pred2 가 없다");
  // chart-draw.js 만 --pred2 를 읽는다. UI 가 --pred2 를 쓰면 둘이 다시 묶인다.
  const ui = readFileSync(new URL("../www/ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(BODY, /var\(--pred2\)/, "UI CSS 가 --pred2 를 쓴다 — --action 을 쓸 것");
  assert.match(ui, /--pred2/, "ui.js 의 readToken 이 차트용 --pred2 를 계속 읽어야 한다");
});
