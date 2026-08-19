// 2026-08-18 감사에서 드러난 사고를 이름 등록 시점에 죽인다:
// draw-preds.js(작도)와 predictions.js(기록)가 둘 다 전역 MSPreds 를 등록했고,
// chart-draw.js 가 로드 시점에 캡처한 전역이 기록 모듈이라 리포트가 100% 죽었다.
// 모듈 테스트는 require 로 각각 독립 객체를 받아 이 사고를 원리적으로 못 본다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WWW = fileURLToPath(new URL("../www/", import.meta.url));

function jsFiles() {
  const out = [];
  for (const f of readdirSync(WWW)) {
    if (f.endsWith(".js")) out.push(f);
  }
  for (const f of readdirSync(path.join(WWW, "screens"))) {
    if (f.endsWith(".js")) out.push("screens/" + f);
  }
  return out.filter(f => !f.startsWith("vendor/"));
}

// 브라우저 분기에서 전역에 붙는 이름을 모은다. 세 형태를 다 잡는다: define() ·
// UMD 옛 직접대입(`root.X =`) · screens/*.js 끝의 옛 직접대입(`window.X =`, 아직
// define 으로 안 옮긴 11개 파일 — 아래 "직접 대입 금지" 테스트가 이걸 봐주는 이유
// 참고). 이 세 형태 중 둘이 같은 이름을 쓰면(예: define 된 이름을 window. 쪽이
// 우연히 재사용) 여기서 걸려야 한다 — 그게 이 태스크가 막으려던 사고의 본질이다.
function registrations() {
  const map = new Map();
  for (const f of jsFiles()) {
    const src = readFileSync(path.join(WWW, f), "utf8");
    for (const m of src.matchAll(/MSGlobals\.define\(\s*"([A-Za-z0-9_]+)"/g)) {
      if (!map.has(m[1])) map.set(m[1], []);
      map.get(m[1]).push(f);
    }
    for (const m of src.matchAll(/\b(?:root|window)\.(MS[A-Za-z0-9_]+)\s*=/g)) {
      if (!map.has(m[1])) map.set(m[1], []);
      map.get(m[1]).push(f);
    }
  }
  return map;
}

test("전역 이름은 파일 하나에서만 등록된다", () => {
  const dup = [];
  for (const [name, files] of registrations()) {
    if (files.length > 1) dup.push(name + " ← " + files.join(", "));
  }
  assert.deepStrictEqual(dup, [], "전역 이름 충돌: " + dup.join(" / "));
});

test("MSPreds 라는 이름은 폐기됐다 — 작도는 MSPredDraw, 기록은 MSPredLog", () => {
  for (const f of jsFiles()) {
    const src = readFileSync(path.join(WWW, f), "utf8");
    assert.ok(!/\bMSPreds\b/.test(src), f + " 에 폐기된 이름 MSPreds 가 남아 있다");
  }
});

// `root.` 형태(UMD 모듈)만 강제한다 — `window.` 형태(screens/*.js 끝의
// `window.MSXxx = {...}`, 예: watchlist·report·record·expert 등 11개 파일)는
// 아직 일부러 면제한다. 그 형태를 요구하는 Node 테스트 하네스(wallet-screens.
// test.mjs·readings-list.test.mjs)가 `global.window = global;` 로 세운 sandbox 에
// `MSGlobals` 를 안 넣어서, 강제하면 그 하네스가 깨진다(실제로 한 번 그렇게
// 됐다가 원복했다 — 2026-08-18 리뷰). `window.` 형태는 이름 충돌 자체는
// registrations() 가 이미 잡으므로(위) 방치가 아니다 — 여기서 빠진 건 "형태
// 강제"뿐이고, 실제 위험(충돌해도 아무도 모른다)은 이미 막혀 있다. `window.`
// 형태는 P1 에서 그 화면들을 재작성할 때 자연히 define() 으로 옮겨가며 이
// 테스트 범위에 편입된다 — 그때 이 주석과 예외를 지운다.
test("전역 등록은 MSGlobals.define 을 거친다 — 직접 대입 금지(root. 형태만)", () => {
  const direct = [];
  for (const f of jsFiles()) {
    if (f === "globals.js") continue;
    const src = readFileSync(path.join(WWW, f), "utf8");
    if (/\broot\.MS[A-Za-z0-9_]+\s*=/.test(src)) direct.push(f);
  }
  assert.deepStrictEqual(direct, [], "define 을 안 거치는 전역 대입: " + direct.join(", "));
});

test("중복 등록은 즉시 던진다", async () => {
  const src = readFileSync(path.join(WWW, "globals.js"), "utf8");
  const root = {};
  new Function("self", src).call(root, root);
  root.MSGlobals.define("MSThing", { a: 1 });
  assert.throws(() => root.MSGlobals.define("MSThing", { a: 2 }), /충돌/);
});

test("index.html 은 globals.js 를 첫 스크립트로 싣는다", () => {
  const html = readFileSync(path.join(WWW, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.strictEqual(scripts[0], "globals.js", "globals.js 가 첫 스크립트가 아니다 — 뒤 모듈이 define 을 못 찾는다");
});
