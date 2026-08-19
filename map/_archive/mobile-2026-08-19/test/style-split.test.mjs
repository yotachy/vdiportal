// style.css 를 여덟 장으로 갈랐다(P2 T13). CSS 분할의 위험은 문법 오류가 아니라 **순서**다 —
// 캐스케이드는 나중 규칙이 앞 규칙을 덮는 것이라, <link> 차례가 한 칸만 어긋나도 화면이
// 조용히 달라지고 어떤 테스트도 던지지 않는다. 그래서 순서를 각 파일이 자기 머리에
// `분할본 N/M` 으로 선언하게 하고, 여기서 index.html 과 대조한다.
//
// 여기서 재는 성질 셋:
//   ① 여덟 장이 자기 자리를 알고 있다(N/M 이 빠짐없이 1..M)
//   ② index.html 이 그 순서대로 건다
//   ③ www 의 모든 .css 가 실려 있다 — 만들고 <link> 를 잊으면 앱에서만 드러난다
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cssFiles } from "./_css.mjs";

const WWW = new URL("../www/", import.meta.url);

function declaredOrder(file) {
  const head = readFileSync(new URL(file, WWW), "utf8").slice(0, 600);
  const m = head.match(/분할본\s*(\d+)\s*\/\s*(\d+)/);
  assert.ok(m, file + " 머리에 `분할본 N/M` 선언이 없다 — 순서를 아무도 모르는 장이 된다");
  return { n: Number(m[1]), of: Number(m[2]) };
}

test("분할본이 자기 자리를 선언하고, 그 자리가 1..M 을 빠짐없이 덮는다", () => {
  const files = cssFiles();
  assert.ok(files.length >= 2, "분할이 안 된 것으로 보인다: " + files.join(", "));
  const decls = files.map(declaredOrder);
  const of = decls[0].of;
  decls.forEach((d, i) => assert.equal(d.of, of,
    files[i] + " 가 전체 장수를 " + d.of + " 로 안다 — 다른 장은 " + of + " 다"));
  assert.equal(of, files.length,
    "선언한 전체 장수(" + of + ")와 실제로 걸린 장수(" + files.length + ")가 다르다");
  const seen = decls.map(d => d.n).sort((a, b) => a - b);
  assert.deepEqual(seen, seen.map((_, i) => i + 1),
    "번호가 1.." + of + " 를 빠짐없이 덮지 않는다: " + seen.join(","));
});

test("index.html 의 <link> 차례가 선언한 순서와 같다 — 캐스케이드가 곧 이 순서다", () => {
  const files = cssFiles();
  const actual = files.map(f => declaredOrder(f).n);
  const sorted = actual.slice().sort((a, b) => a - b);
  assert.deepEqual(actual, sorted,
    "링크 순서가 선언 순서와 어긋난다: " +
    files.map((f, i) => f + "(" + actual[i] + ")").join(" → ") +
    " — 뒤 장이 앞 장을 덮던 관계가 끊긴다");
});

test("www 의 모든 .css 가 index.html 에 실려 있다", () => {
  const dir = fileURLToPath(WWW);
  const onDisk = readdirSync(dir).filter(n => n.endsWith(".css"));
  const linked = new Set(cssFiles());
  const orphan = onDisk.filter(n => !linked.has(n));
  assert.deepEqual(orphan, [],
    "만들어 놓고 <link> 를 안 붙인 CSS: " + orphan.join(", ") +
    " — 그 규칙들은 앱에서 통째로 없는 것과 같다");
});
