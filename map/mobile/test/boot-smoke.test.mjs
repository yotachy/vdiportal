// 부팅 연기 시험 — index.html 이 선언한 **순서 그대로** 모든 스크립트를 먹여 보고,
// 던지지 않고 전역이 다 서는지 본다.
//
// 왜 필요한가: 지금까지의 관문은 모듈을 하나씩 require 한다. 그래서 오탈자·의존 누락·
// 로드 순서 실수가 1400건 초록을 그대로 통과한 뒤 **앱을 켜야만** 드러난다. 클래식
// 스크립트라 순서가 의미를 갖고(전역 네임스페이스), 새 파일을 소비자보다 뒤에 넣으면
// 그 소비자는 조용히 undefined 를 참조한다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const WWW = fileURLToPath(new URL("../www/", import.meta.url));
const INDEX = readFileSync(WWW + "index.html", "utf8");
const SRCS = [...INDEX.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

// 전역 선언 유도 — globals.js(2026-08-18) 이전엔 등록이 전부 `root.X =`/`window.X =`
// 직접 대입이라 그 모양 하나로 다 잡혔다. 이제 대부분은 `MSGlobals.define("X", ...)` 를
// 거치므로 그 모양도 같이 봐야 한다 — 안 그러면 이 관문이 방금 바뀐 파일들에 대해 조용히
// 눈을 감는다(실제로 이 라운드에 그렇게 됐다: 아래 두 시험 다 유도 집합이 텅 비어도
// 통과하는 모양이었다).
function declaredNames(code) {
  const out = new Set();
  [...code.matchAll(/(?:root|window)\.(MS[A-Za-z]+)\s*=/g)].forEach(m => out.add(m[1]));
  [...code.matchAll(/MSGlobals\.define\(\s*["'](MS[A-Za-z]+)["']/g)].forEach(m => out.add(m[1]));
  return out;
}

test("index.html 이 선언한 스크립트가 전부 실재한다", () => {
  const missing = SRCS.filter(s => !existsSync(WWW + s));
  assert.deepEqual(missing, [], "선언됐지만 없는 파일: " + missing.join(", ") +
    " (vendor/ 는 sync-engine 생성물이다 — `npm run sync` 를 먼저 돌릴 것)");
});

// 최소한의 브라우저 흉내. DOM 을 진짜로 만들지 않는다 — 이 시험이 재는 것은 **로드 시점**에
// 던지지 않고 전역이 서는가이지, 화면이 그려지는가가 아니다.
function fakeWindow() {
  const el = () => ({
    style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    children: [], appendChild(c) { this.children.push(c); return c; }, setAttribute() {},
    addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, getContext() { return null; }, innerHTML: "", textContent: ""
  });
  const doc = {
    createElement: el, body: el(), documentElement: el(),
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, getElementById() { return null; }
  };
  const win = {
    document: doc, navigator: { userAgent: "node" }, location: { href: "https://localhost/" },
    matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    crypto: { getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = i; return a; } },
    fetch() { return Promise.resolve({ ok: false, json: () => Promise.resolve(null) }); },
    alert() {}, console
  };
  win.window = win; win.self = win; win.globalThis = win;
  return win;
}

test("모든 스크립트가 index.html 순서대로 던지지 않고 로드된다", () => {
  const win = fakeWindow();
  const ctx = vm.createContext(win);
  SRCS.forEach(src => {
    const code = readFileSync(WWW + src, "utf8");
    try {
      new vm.Script(code, { filename: src }).runInContext(ctx);
    } catch (e) {
      assert.fail(src + " 로드 중 예외: " + (e && e.message));
    }
  });

  // 화면·모듈이 전역에 실제로 섰는지. 이름을 여기 나열하지 않고 **소스에서 유도**한다 —
  // 나열하면 새 모듈이 생겨도 이 목록이 안 늘어 관문이 조용히 늙는다.
  const declared = new Set();
  SRCS.forEach(src => {
    const code = readFileSync(WWW + src, "utf8");
    declaredNames(code).forEach(n => declared.add(n));
  });
  assert.ok(declared.size >= 15, "전역 선언을 못 찾았다(유도 정규식이 낡았을 수 있다): " + declared.size);
  const notSet = [...declared].filter(n => typeof win[n] === "undefined");
  assert.deepEqual(notSet, [], "선언했는데 전역에 안 선 모듈: " + notSet.join(", "));
});

// 파일을 만들고 <script> 태그를 잊는 것은 쉽고, 그 실패는 앱을 켜야만 보인다 —
// 모듈은 멀쩡히 존재하고 테스트도 require 로 잘 돌기 때문이다(실제로 이 라운드에만
// 새 파일이 다섯 개 늘었다). www/**.js 가 전부 index.html 에 실려 있는지 본다.
test("www 의 모든 스크립트가 index.html 에 실려 있다 — 태그를 잊으면 앱에서만 드러난다", () => {
  const files = [];
  (function walk(dir, prefix) {
    readdirSync(dir).forEach(name => {
      if (name === "vendor" || name === "fonts") return;   // 생성물·자산
      const full = dir + name;
      if (statSync(full).isDirectory()) walk(full + "/", prefix + name + "/");
      else if (name.endsWith(".js")) files.push(prefix + name);
    });
  })(WWW, "");
  // 앱이 안 싣는 것이 정상인 파일 — 사유를 적는다(근거 없이 빼면 이 관문이 무의미해진다).
  const NOT_APP = {
    "bench.js": "실행시간 측정 도구 — 테스트(test/bench.test.mjs)에서만 쓰고 앱은 안 싣는다"
  };
  const notLoaded = files.filter(f => SRCS.indexOf(f) < 0 && !NOT_APP[f]);
  assert.deepEqual(notLoaded, [],
    "index.html 에 없는 스크립트: " + notLoaded.join(", ") +
    " — 만들어 놓고 태그를 안 붙였다면 앱에서 그 모듈은 undefined 다");
});

// ── 로드 순서: 넓은 관문은 두지 않되, UMD 팩토리 인자만은 잰다 ────────────────────
// 넓은 관문("참조하는 파일이 정의하는 파일보다 뒤에 온다"를 소스 텍스트로 재기)은 시도했다가
// 뺐다 — 네 건이 걸렸는데 전부 오탐이었다. MSUi·MSApp·MSWalletScreen·MSAds 는 전부 **함수
// 안**에서 참조되고, 그 함수는 모든 스크립트가 로드된 뒤에야 불린다. 스코프 분석 없이 만든
// 관문은 정상 코드를 빨갛게 만든다.
//
// 그런데 **UMD 팩토리 인자는 다르다.** `else root.MSGraph = factory(root.MSIndTiers)` 는
// 로드되는 그 순간 값을 캡처한다 — 뒤늦게 정의돼도 영원히 undefined 다. 그리고 그 undefined 는
// 던지지 않아서 위 부팅 시험도 못 잡는다. 실제로 graph.js 가 ind-tiers.js 보다 먼저 실려
// tunableTypes() 가 빈 배열을 돌려주고 있었다 — 가중치를 어떻게 만져도 Lv1 5종만 남은
// 그래프로 분석됐고, 5스쿱 낸 사용자에게 그 사실은 어디에도 안 보였다.
// 이 형태는 스코프 분석이 필요 없다. 한 줄에 전부 적혀 있다.
test("UMD 팩토리가 받는 전역은 자기보다 먼저 실린다 — 로드 시점 캡처는 뒤늦게 못 채운다", () => {
  const html = readFileSync(WWW + "index.html", "utf8");
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const pos = {};
  order.forEach((s, i) => { pos[s] = i; });

  // 전역 이름 → 그것을 정의하는 파일
  const definedIn = {};
  order.forEach(src => {
    let code;
    try { code = readFileSync(WWW + src, "utf8"); } catch { return; }
    declaredNames(code).forEach(n => {
      if (!(n in definedIn)) definedIn[n] = src;
    });
  });

  const bad = [];
  order.forEach(src => {
    let code;
    try { code = readFileSync(WWW + src, "utf8"); } catch { return; }
    // `root.X = factory(root.A, root.B)` 든 `MSGlobals.define("X", factory(root.A, root.B))` 든,
    // 괄호 안에서 캡처되는 전역만 본다 — "factory(" 앞이 "=" 인지 "define(...," 인지는 안 가린다.
    [...code.matchAll(/factory\(([^)]*)\)/g)].forEach(call => {
      [...call[1].matchAll(/root\.(MS[A-Za-z]+)/g)].forEach(dep => {
        const name = dep[1], from = definedIn[name];
        if (!from) { bad.push(src + " 가 factory 인자로 받는 " + name + " 를 정의하는 파일이 없다"); return; }
        if (pos[from] > pos[src]) {
          bad.push(src + "(" + pos[src] + ") 가 " + name + " 를 로드 시점에 캡처하는데 " +
                   from + "(" + pos[from] + ") 가 뒤에 실린다 — 영원히 undefined 다");
        }
      });
    });
  });
  assert.deepEqual(bad, [], bad.join("\n"));
});
