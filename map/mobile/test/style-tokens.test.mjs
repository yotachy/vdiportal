import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
const CSS = readFileSync(new URL("../www/style.css", import.meta.url), "utf8");
const ROOT = (CSS.match(/:root\s*\{[\s\S]*?\}/) || [""])[0];
// 스캔 경계: 첫 ":root{...}" 블록이 끝나는 지점부터 파일 끝까지만 본다.
// 그 위(현재는 Task 1 의 @font-face 블록)는 관문 대상이 아니다 — 의도적이지만,
// 여기서 위로 규칙을 하나 더 추가하는 다음 사람은 이 사실을 모르고 지나치기 쉽다.
// BODY 는 여기서 블록 주석(/* ... */)을 미리 통째로 지운다 — 줄 단위로 지우면 여러 줄에
// 걸친 주석의 중간 줄이 안 지워져, "이전 값 13px 이었다" 같은 설명 주석이 아래 관문에
// 오탐을 낸다. 주석 내용만 지우고 개행은 보존해 줄 번호가 원본과 어긋나지 않게 한다.
const BODY = CSS
  .slice(CSS.indexOf("}", CSS.indexOf(":root")) + 1)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""));

test("타이포 8역할이 토큰으로 정의돼 있다", () => {
  for (const k of ["headline", "title", "section", "figure", "body", "sub", "caption", "overline"])
    assert.match(ROOT, new RegExp("--fs-" + k + "\\s*:"), "--fs-" + k + " 없음");
});

test("화면 CSS 의 font-size 는 토큰만 쓴다 — 4px 폭에 8단계가 뒤섞이던 것을 막는다", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    const m = line.match(/font-size\s*:\s*([^;}]+)/);
    if (m && !/var\(--fs-/.test(m[1])) bad.push((i + 1) + ": " + m[0].trim());
  });
  assert.deepEqual(bad, [], "토큰 아닌 font-size " + bad.length + "건:\n" + bad.join("\n"));
});

test("색은 토큰만 — :root 밖에 헥스 리터럴이 없다", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    (code.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(h => bad.push((i + 1) + ": " + h));
  });
  assert.deepEqual(bad, [], "하드코딩 헥스 " + bad.length + "건:\n" + bad.join("\n"));
});

test("항목 좌측 세로 컬러 라인이 없다 — 프로젝트 전역 금지", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    // 폭 1px 헤어라인 보더는 정상 사용(예: 카드 경계)이라 허용한다. 2px 이상은 폭 무관(한 자리·두 자리 이상)
    // 전부 잡아야 한다 — [2-9] 만으로는 "10px" 같은 두 자리 폭이 앞자리 1 때문에 그물을 빠져나간다.
    if (/border-left\s*:\s*(?:[2-9]|[1-9][0-9])/.test(line)) bad.push((i + 1) + ": " + line.trim());
    if (/box-shadow\s*:\s*inset\s+[1-9][0-9.]*px\s+0\s+0/.test(line)) bad.push((i + 1) + ": " + line.trim());
  });
  assert.deepEqual(bad, [], "좌측 accent bar " + bad.length + "건:\n" + bad.join("\n"));
});

test("--neutral 은 텍스트 색으로 쓰이지 않는다 — 대비 2.4:1", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    if (/(^|[^-])\bcolor\s*:\s*var\(--neutral\)/.test(line)) bad.push((i + 1) + ": " + line.trim());
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
