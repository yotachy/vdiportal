import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CSS = readFileSync(new URL("../www/style.css", import.meta.url), "utf8");
const WWW = fileURLToPath(new URL("../www/", import.meta.url));

// 폰트는 없어도 화면이 그려진다 — 시스템 폰트로 조용히 폴백하므로 사람 눈으로는 안 잡힌다.
// 실제로 이 저장소는 style.css 가 Pretendard 를 선언한 채 폰트 파일 없이 굴러갔다.
// 그래서 "선언한 것이 실제로 있는가"를 기계가 본다.
test("@font-face 가 가리키는 파일이 실제로 존재한다", () => {
  const m = CSS.match(/@font-face\s*\{[^}]*src\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/);
  assert.ok(m, "@font-face 가 없다 — 선언이 사라지면 앱은 시스템 폰트로 조용히 돌아간다");
  const p = WWW + m[1].replace(/^\.?\//, "");
  assert.ok(existsSync(p), "선언된 폰트 파일이 없다: " + m[1]);
  assert.ok(statSync(p).size > 500000, "폰트 파일이 너무 작다 — 받다 만 파일일 수 있다");
});

test("가변 폰트라 무게 4종을 한 파일이 덮는다 — 가짜 볼드로 그려지지 않는다", () => {
  const face = CSS.match(/@font-face\s*\{[^}]*\}/);
  assert.ok(face, "@font-face 블록이 없다");
  assert.match(face[0], /font-weight\s*:\s*100\s+900/,
    "가변 축을 선언하지 않으면 브라우저가 400 하나만 쓰고 800 을 합성한다(가짜 볼드)");
  assert.match(face[0], /font-display\s*:\s*block/,
    "번들 폰트는 즉시 있으므로 swap 이 필요 없다 — swap 이면 첫 프레임이 시스템 폰트로 번쩍인다");
});

test("body 가 번들 서체를 쓰고, 화면 CSS 가 서체를 다시 선언하지 않는다", () => {
  assert.match(CSS, /body\s*\{[^}]*font-family\s*:\s*Pretendard/,
    "body 가 Pretendard 를 안 쓴다");
  // ui-monospace 계열이 남아 있으면 그 줄만 다른 서체로 뜬다(시안의 숫자 서체 결정 §2.2).
  assert.doesNotMatch(CSS, /font-family\s*:\s*ui-monospace/,
    "숫자는 별도 서체가 아니라 tabular-nums 로 자릿수를 맞춘다");
});
