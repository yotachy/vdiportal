import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSUi = require("../www/ui.js");
const WATCHLIST = readFileSync(new URL("../www/screens/watchlist.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../www/style.css", import.meta.url), "utf8");
const WWW_ROOT = fileURLToPath(new URL("../www/", import.meta.url));

test("헤더 마크가 비어 있지 않다 — 22px 컨테이너만 있고 내용이 없었다", () => {
  assert.match(WATCHLIST, /MSUi\.scoopMark\s*\(/, "헤더가 스쿱 마크를 그리지 않는다");
});

test("스쿱 마크는 채움 비율을 받는다 — 지갑 잔량 게이지가 같은 함수를 쓴다", () => {
  assert.match(MSUi.scoopMark(42), /<svg/, "SVG 를 돌려주지 않는다");
  assert.notEqual(MSUi.scoopMark(0), MSUi.scoopMark(100), "채움 비율이 결과를 바꾸지 않는다");
});

function fillY(svg) {
  var m = svg.match(/<rect x="0" y="([^"]+)"/);
  assert.ok(m, "rect y 를 못 찾았다");
  return m[1];
}
function clipId(svg) {
  var m = svg.match(/<clipPath id="([^"]+)"/);
  assert.ok(m, "clipPath id 를 못 찾았다");
  return m[1];
}

test("같은 채움 비율은 같은 채움 높이를 준다 — 렌더마다 흔들리지 않는다", () => {
  // id 는 호출마다 고유해야 하므로(아래 테스트) 마크업 전체가 아니라 실제로 채움을
  // 결정하는 rect y 좌표만 비교한다.
  assert.equal(fillY(MSUi.scoopMark(42)), fillY(MSUi.scoopMark(42)));
});

test("같은 채움 비율이라도 clipPath id 는 매번 다르다 — 한 페이지에 마크 두 개가 있으면 충돌한다", () => {
  // 태스크 6 지갑 게이지 + 헤더 마크처럼 같은 페이지에 두 번 그려질 때, id 가 반올림한
  // 퍼센트에서만 나오면 41.6 과 42.4 가 둘 다 msFill42 가 되어 clip-path 참조가 모호해지고
  // 한쪽이 다른 쪽 채움을 그린다. 카운터 기반 id 로 이 충돌을 막는다.
  assert.notEqual(clipId(MSUi.scoopMark(42)), clipId(MSUi.scoopMark(42)));
});

test("숫자가 아닌 채움 비율은 NaN 을 그리지 않는다 — 기본값(42)으로 떨어진다", () => {
  var svg = MSUi.scoopMark("abc");
  assert.doesNotMatch(svg, /NaN/, "NaN 이 마크업에 새어나왔다");
  assert.equal(fillY(svg), fillY(MSUi.scoopMark(42)));
});

// ── 자물쇠 단일 출처 — 모양을 나열하지 않는다 ────────────────────────────────────────
// 첫 버전은 `rect[rx="1.6"]` 하나만 찾았다 — 그 모양을 직접 그린 hand-drawn lock 은
// rx="2" 하나로 통과했다(리뷰가 7/7 초록에서 실행으로 잡음, screens/report.js:277의
// lockSvg()). "내가 상상한 모양"을 나열하는 관문은 관문이 아니다 — ad-reward 가드·SSV
// 서명 검사가 같은 함정에 두 번 빠졌던 것과 같은 실패 모양이다(코디네이터 지적,
// 2026-08-16). 그래서 파일 목록도 모양도 하드코딩하지 않는다:
//   ① www/** 전체를 내용으로 스캔해 "잠금을 다루는 파일"을 스스로 찾는다
//      (영문 lock·한글 잠금/잠긴, 대소문자 무관 — 대상 목록을 손으로 적지 않는다)
//   ② 그중 "이름에 lock 이 들어간 함수/변수가 자기 손으로 <svg 를 그리는가"를 본다 —
//      rx 값·viewBox·rect 대 path 같은 모양은 안 본다(그 모양을 세면 또 이 함정에 빠진다)
//   ③ 진짜 무관한 파일(clock·blockType·order block 의 부분 문자열, 데이터만 담는 파일,
//      "잠금"을 UI 아이콘이 아닌 다른 뜻으로 쓰는 파일)만 아래 EXCLUDED 에 이유를 적고 뺀다
//      (ALLOWED_LATIN 과 같은 원칙 — 근거 없이 빼는 것은 안 된다)

// www/** 재귀 스캔. vendor/ 는 커밋 대상이 아닌 생성물(npm run sync 가 만드는 스쿱포지
// 엔진 사본)이라 존재 여부가 환경마다 다르다 — 소스가 아니므로 애초에 후보에서 뺀다.
function listJsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "vendor") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listJsFiles(full));
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}
const ALL_WWW_JS = listJsFiles(WWW_ROOT).filter(p => p !== join(WWW_ROOT, "ui.js"));

function mentionsLock(src) { return /lock/i.test(src) || /잠금|잠긴/.test(src); }

// "이름에 lock 이 들어간 함수/변수가 <svg 를 직접 반환/대입하는가"만 본다 — 어떤 모양인지는
// 안 본다. function NAME(...) {...} 와 NAME = function(...) {...} 둘 다, 중괄호 짝을
// 맞춰 본문을 잘라낸 뒤 그 안에서 <svg 를 찾는다. var LOCK = "<svg ...>" 처럼 함수가 아니라
// 문자열 리터럴에 바로 박아 둔 경우도 함께 잡는다.
function lockNamedSvgOffenders(src) {
  const offenders = [];
  const fnRe = /function\s+([A-Za-z0-9_$]*)\s*\(|([A-Za-z0-9_$]+)\s*=\s*function\s*\(/g;
  let m;
  while ((m = fnRe.exec(src))) {
    const name = m[1] || m[2] || "";
    if (!/lock/i.test(name)) continue;
    const braceStart = src.indexOf("{", m.index);
    if (braceStart < 0) continue;
    let depth = 0, end = -1;
    for (let i = braceStart; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end >= 0 && /<svg/i.test(src.slice(braceStart, end + 1))) offenders.push(name);
  }
  const varRe = /var\s+([A-Za-z0-9_$]*)\s*=\s*(["'])((?:(?!\2)[^\\]|\\.)*)\2/g;
  while ((m = varRe.exec(src))) {
    if (/lock/i.test(m[1]) && /<svg/i.test(m[3])) offenders.push(m[1]);
  }
  return offenders;
}

// ③의 이유 있는 예외 목록. 각 항목은 "왜 잠금을 언급하는데 아이콘이 필요 없는가"를 적는다.
const EXCLUDED_LOCK_FILES = {
  "bench.js": "'clock'/'defaultClock' 의 부분 문자열일 뿐 — 벤치마크 타이머, 잠금과 무관",
  "graph.js": "'blockType' 의 부분 문자열일 뿐",
  "indicators.js": "'blockType' 의 부분 문자열일 뿐",
  "readings.js": "'order block(s)'·'blockType' 의 부분 문자열일 뿐(트레이딩 용어)",
  "chart-draw.js": "'잠금'이 여기선 차트 티어가 정의 가능해지는 시점을 가리키는 비유 — UI 잠금 아이콘과 무관",
  "wallet-http.js": "'잠긴다'가 여기선 인증 토큰이 영구 거부되는 상태를 가리킬 뿐 — UI 잠금 아이콘과 무관",
  "strings.js": "문구 데이터만 담는다(rpLocked·tpLockNote 등) — 아무 것도 그리지 않으므로 아이콘을 참조할 이유가 없다",
  "screens/watchlist.js": "locked 배열을 만들어 ticker-picker.js 에 넘길 뿐 — 아이콘은 그 안에서만 그려진다",
  "screens/onboarding.js": "lockedSyms 를 계산해 ticker-picker.js 에 넘길 뿐 — 아이콘은 그 안에서만 그려진다"
};

test("자물쇠는 한 곳에서 나온다 — 화면마다 다시 그리지 않는다(파일 목록·모양을 나열하지 않는다)", () => {
  assert.match(MSUi.lockIcon(), /<svg[^>]*viewBox="0 0 14 14"/, "14×14 규격이 아니다");

  const files = ALL_WWW_JS.map(full => ({
    rel: full.slice(WWW_ROOT.length).split("\\").join("/"),   // 윈도우 경로 구분자 방어
    src: readFileSync(full, "utf8")
  }));
  const lockMentioning = files.filter(f => mentionsLock(f.src));
  // 실제 소비자 셋을 최소한으로 못박는다 — 위 스캔이 이들조차 못 찾으면(경로·확장자
  // 필터가 잘못됐다면) 이 관문 자체가 아무것도 안 보고 있는 것이다.
  const relSet = new Set(lockMentioning.map(f => f.rel));
  ["ticker-picker.js", "tier-sheet.js", "screens/report.js"].forEach(rel =>
    assert.ok(relSet.has(rel), "스캔이 " + rel + " 을 못 찾았다 — 파일 탐색 자체가 깨졌다"));

  const scanned = lockMentioning.filter(f => !(f.rel in EXCLUDED_LOCK_FILES));
  const noRef = [], selfDrawn = [];
  scanned.forEach(f => {
    if (!/MSUi\.lockIcon\s*\(/.test(f.src)) noRef.push(f.rel);
    const off = lockNamedSvgOffenders(f.src);
    if (off.length) selfDrawn.push(f.rel + " (" + off.join(", ") + ")");
  });
  assert.deepEqual(noRef, [], "잠금을 다루는데 MSUi.lockIcon() 을 안 쓰는 파일: " + noRef.join(", ") +
    " — 관계 없다면 EXCLUDED_LOCK_FILES 에 이유를 적어 뺄 것");
  assert.deepEqual(selfDrawn, [], "자물쇠를 직접 그린 파일(이름에 lock 이 들어간 함수/변수가 <svg 를 반환): " +
    selfDrawn.join("; ") + " — MSUi.lockIcon() 을 쓸 것");
});

// 스펙 §3.1 — 세 티어가 각자의 색을 갖는다. 하나로 뭉치면 "무엇을 샀는지"가 화면에서 안 보인다.
test("티어 3색이 서로 다르고 단계 선택 시트가 셋을 다 쓴다", () => {
  const root = (CSS.match(/:root\s*\{[\s\S]*?\}/) || [""])[0];
  const val = n => (root.match(new RegExp("--" + n + "\\s*:\\s*([^;]+)")) || [])[1];
  const [s, g, p] = ["steel", "gold", "platinum"].map(val);
  assert.ok(s && g && p, "티어 토큰이 빠졌다");
  assert.equal(new Set([s.trim(), g.trim(), p.trim()]).size, 3, "티어 색이 겹친다");
  for (const t of ["--steel", "--platinum"])
    assert.ok(CSS.indexOf("var(" + t + ")") >= 0, t + " 를 아무도 쓰지 않는다");
});
