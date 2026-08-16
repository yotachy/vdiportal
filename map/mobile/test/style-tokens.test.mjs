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

// 한 줄에 여러 선언이 올 수 있다(스타일 파일 37줄이 이미 그렇다) — .match() 는 첫 매치만
// 돌려주므로 g 플래그로 전부 잡는다. 또한 font-size 단독 선언뿐 아니라 font 축약형
// ("font: bold 13px/1.4 sans-serif" 처럼 크기를 실어 나르는 경우, style.css:93 의
// "font:inherit" 처럼 크기를 안 싣는 경우와 구분해야 한다)도 크기를 실으면 같은 관문을 통과해야 한다.
const FONT_SHORTHAND_KEYWORDS = ["inherit", "initial", "unset", "caption", "icon", "menu",
  "message-box", "small-caption", "status-bar"]; // 크기를 싣지 않는 합법적 font 축약값
test("화면 CSS 의 font-size 는 토큰만 쓴다 — 4px 폭에 8단계가 뒤섞이던 것을 막는다", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    // font-size 단독 선언 — 한 줄에 여러 개 있어도 전부(g).
    let m;
    const fsRe = /font-size\s*:\s*([^;}]+)/g;
    while ((m = fsRe.exec(line)))
      if (!/var\(--fs-/.test(m[1])) bad.push((i + 1) + ": " + m[0].trim());
    // font 축약형 — "font-size"/"font-family"/"font-weight"/"font-style"/"font-variant"/
    // "font-stretch" 처럼 하이픈 붙은 다른 font-* 속성은 걸러내야 한다(음의 뒤보기 없이 \b
    // 로 시작을 특정해도 "font-size:" 자체가 "font:" 로 오매치되지 않도록 콜론 앞에 하이픈이
    // 없는 경우만 잡는다).
    const fRe = /\bfont\s*:\s*([^;}]+)/g;
    while ((m = fRe.exec(line))) {
      const val = m[1].trim().toLowerCase();
      if (FONT_SHORTHAND_KEYWORDS.indexOf(val) >= 0) continue;
      if (!/var\(--fs-/.test(val)) bad.push((i + 1) + ": " + m[0].trim() + "  (font 축약형에 실린 크기가 토큰이 아니다)");
    }
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

// 이 관문이 실제로 막으려는 것은 "border-left 를 2px 이상 쓰는 문장"이 아니라 **"항목 왼쪽
// 가장자리에 색이 칠해진 좁은 세로띠가 생기는 것"** — 즉 속성 이름이 아니라 눈에 보이는 도형이다.
// 첫 버전은 모양을 하나 상상해서(border-left 숏핸드, box-shadow 오프셋에 "px" 고정) 그 모양만
// 잡았고, 리뷰가 6가지 다른 방법으로 똑같은 도형을 그려 전부 통과시켰다(롱핸드 분리·논리 속성
// border-inline-start·단위 없는/다른 단위 오프셋·트레일링 "0px"·::before 풀하이트 마커).
// 그래서 세 갈래로 "도형"을 잡는다: (a) 왼쪽 보더 — 규칙을 줄이 아니라 **블록** 단위로 읽어
// border 캐스케이드를 흉내낸다("border:3px" 로 4면을 다 세우고 border-top/right/bottom:0 으로
// 나머지 3면만 지우면, 남는 건 "border-left:3px" 와 그림으로 동일한데 그 속성명은 어디에도
// 없다 — 리뷰가 실제로 이 형태로 관문을 통과시켰다) (b) inset box-shadow 의 가로만 있고
// 세로·블러가 0인 형태(단위 무관) (c) ::before/::after 를 블록째로 읽어 "왼쪽 고정 + 세로
// 꽉참 + 폭이 좁음 + 배경색 있음" 네 조건을 모두 만족하는 규칙.

// (a)(c) 공통: "좁다"의 경계선. 폭 1px(헤어라인)은 정상 카드 경계라 허용, 2px 이상부터 accent
// bar 로 본다 — 프로젝트 기존 관례(카드 보더 1px)와 일치시킨 수치. 임의의 숫자이므로 여기 하나에
// 모아 arguable 하게 둔다.
const ACCENT_BAR_MIN_PX = 2;
// (c) 전용: ::before 가 "좁은 띠"로 보이려면 폭이 이 값 이하여야 한다 — 이보다 넓으면 accent bar
// 가 아니라 다른 용도(패널 사이드 레일 등)일 가능성이 커서 오탐이 된다. 브랜드 골드 마커가
// 실제로 그려지던 폭(3~4px) 대비 여유를 둔 값.
const ACCENT_BAR_MAX_PX = 8;

// "2px 이상"을 단위 무관하게 판정한다. px 는 원래 관례대로 숫자 비교, 그 외 단위(em·rem·%·pt…)는
// 프로젝트에 hairline 관례가 없으므로 0보다 크면 바로 위반으로 본다(과탐 위험보다 누락 위험이
// 크다 — 리뷰가 실제로 em 단위로 규칙을 우회한 사례를 남겼다). var()·thin/medium/thick 같이
// 수치를 알 수 없는 값은 "판단 불가"이므로 안전하게 위반으로 본다 — 통과시키는 쪽이 이 관문의
// 존재 이유를 없앤다.
function isAccentWidth(raw) {
  const v = String(raw).trim();
  const m = v.match(/^(-?[\d.]+)(px|em|rem|pt|vw|vh|%|ex|ch|cm|mm|in|pc)?$/i);
  if (!m) return true; // var(--x)·thin/medium/thick 등 수치화 불가 — 판단 보류 없이 위반 취급
  const num = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  if (unit === "px") return num >= ACCENT_BAR_MIN_PX;
  return num > 0;
}

// 한 선언의 값이 "0"(단위 있든 없든)인지 — box-shadow 오프셋 판정에 쓴다.
function isZero(tok) { return Math.abs(parseFloat(tok)) === 0 || /^0[a-z%]*$/i.test(String(tok).trim()); }

// 규칙 하나를 { selector, body, index } 로 쪼갠다 — (a)(c) 둘 다 "그 규칙 안에서 어떤 선언들이
// 함께 있는가"를 봐야 해서 줄 단위로는 안 된다.
function ruleBlocks(css) {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ selector: m[1], body: m[2], index: m.index });
  return out;
}

// 선언 목록을 순서 보존한 채 파싱한다 — border 캐스케이드는 "나중 선언이 이긴다"라서 순서가
// 의미를 가진다(map 으로 접으면 순서 정보가 사라진다).
function parseDecls(body) {
  return body.split(";").map(seg => {
    const idx = seg.indexOf(":");
    if (idx < 0) return null;
    return { prop: seg.slice(0, idx).trim().toLowerCase(), value: seg.slice(idx + 1).trim() };
  }).filter(Boolean);
}

// border 계열 값에서 "폭" 토큰만 뽑는다 — width/style/color 는 순서 무관이 스펙이라 위치로
// 고르면 안 되고, 숫자+단위(또는 "0")·thin/medium/thick 패턴을 찾는다.
function extractBorderWidth(value) {
  const toks = value.trim().split(/\s+/);
  for (const t of toks) {
    if (/^-?[\d.]+[a-z%]*$/i.test(t)) return t;
    if (/^(thin|medium|thick)$/i.test(t)) return t;
  }
  return null;
}

// 규칙 하나 안에서 4면의 유효 보더 폭을 캐스케이드 순서대로 계산한다.
// "border:3px" 로 4면을 세우고 뒤이어 border-top/right/bottom:0 으로 3면만 지우면, 왼쪽만
// 남는 그림이 나온다 — 어떤 단일 선언도 "border-left"라고 말하지 않았는데도 그렇다.
function effectiveLeftBorderWidth(decls) {
  const sides = { top: null, right: null, bottom: null, left: null };
  const SIDE_PROP = { "border-top": "top", "border-right": "right", "border-bottom": "bottom", "border-left": "left",
    "border-inline-start": "left", "border-inline-end": "right" }; // 논리속성은 LTR 기준(이 프로젝트는 한국어 LTR UI)
  const WIDTH_PROP = { "border-top-width": "top", "border-right-width": "right", "border-bottom-width": "bottom",
    "border-left-width": "left", "border-inline-start-width": "left", "border-inline-end-width": "right" };
  decls.forEach(({ prop, value }) => {
    if (prop === "border") {
      const w = extractBorderWidth(value) || "medium"; // 숏핸드는 안 적은 성분도 초기값으로 리셋한다
      sides.top = sides.right = sides.bottom = sides.left = w;
    } else if (prop in SIDE_PROP) {
      const w = extractBorderWidth(value) || "medium";
      sides[SIDE_PROP[prop]] = w;
    } else if (prop in WIDTH_PROP) {
      sides[WIDTH_PROP[prop]] = value.trim();
    } else if (prop === "border-width") {
      const v = value.trim().split(/\s+/);
      const [t, r, b, l] = v.length === 1 ? [v[0], v[0], v[0], v[0]]
        : v.length === 2 ? [v[0], v[1], v[0], v[1]]
        : v.length === 3 ? [v[0], v[1], v[2], v[1]]
        : [v[0], v[1], v[2], v[3]];
      sides.top = t; sides.right = r; sides.bottom = b; sides.left = l;
    }
  });
  return sides;
}

test("항목 좌측 세로 컬러 라인이 없다 — 프로젝트 전역 금지", () => {
  const bad = [];

  // (a) 왼쪽 보더 — 숏핸드/롱핸드/논리속성은 물론, "border:3px" + 나머지 3면 리셋처럼 어떤
  // 단일 선언도 "left"를 말하지 않는 조합도 캐스케이드 시뮬레이션으로 잡는다. 4면이 전부
  // 같은 폭(리셋 없이 균일한 두꺼운 테두리)이면 accent bar 모양이 아니므로 제외한다.
  ruleBlocks(BODY).filter(b => !/::(?:before|after)/.test(b.selector)).forEach(b => {
    const sides = effectiveLeftBorderWidth(parseDecls(b.body));
    if (sides.left == null) return; // 이 규칙이 좌측 보더를 아예 안 건드렸다
    const uniform = sides.left === sides.top && sides.left === sides.right && sides.left === sides.bottom;
    if (!uniform && isAccentWidth(sides.left)) {
      const line = BODY.slice(0, b.index).split("\n").length;
      bad.push(line + ": " + b.selector.trim() + " { " + b.body.trim() + " }  (좌측 보더 " + sides.left + ")");
    }
  });

  // (b) inset box-shadow — "가로만 있고 세로·블러는 0". 단위 무관, 트레일링 "0px"/"0" 모두 0 취급.
  {
    const shRe = /box-shadow\s*:\s*inset\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let m;
    while ((m = shRe.exec(BODY))) {
      const [, h, v, blur] = m;
      if (!isZero(h) && isZero(v) && isZero(blur)) {
        const line = BODY.slice(0, m.index).split("\n").length;
        bad.push(line + ": " + m[0].trim() + "  (inset box-shadow 좌측 accent)");
      }
    }
  }

  // (c) ::before/::after 를 블록째로 읽어 "왼쪽 고정 + 세로 꽉참 + 폭 좁음 + 배경 있음" 4조건을
  // 전부 만족하는 규칙만 잡는다. 줄 단위로는 이 네 선언이 서로 다른 줄에 흩어져 있어 못 잡는다.
  {
    const pseudoRe = /([^{}]+::(?:before|after))\s*\{([^}]*)\}/g;
    let m;
    while ((m = pseudoRe.exec(BODY))) {
      const [, selector, body] = m;
      const decl = {};
      body.split(";").forEach(d => {
        const c = d.split(":");
        if (c.length >= 2) decl[c[0].trim()] = c.slice(1).join(":").trim();
      });
      const leftPinned = "left" in decl && isZero(decl.left);
      const fullHeight = ("top" in decl && isZero(decl.top) && "bottom" in decl && isZero(decl.bottom))
        || /^100%|^calc\(100%/.test(decl.height || "");
      const widthTok = decl.width;
      const narrow = widthTok != null && (() => {
        const wm = String(widthTok).match(/^(-?[\d.]+)(px|em|rem|pt|vw|vh|%|ex|ch|cm|mm|in|pc)?$/i);
        if (!wm) return false; // 폭을 수치로 못 읽으면 "좁다"를 주장할 근거가 없다 — (a)/(b)와 달리 여긴 미검출 쪽으로 둔다
        const num = parseFloat(wm[1]);
        const unit = (wm[2] || "px").toLowerCase();
        return unit === "px" ? (num >= ACCENT_BAR_MIN_PX && num <= ACCENT_BAR_MAX_PX) : num > 0;
      })();
      const hasBg = ("background" in decl && !/^(none|transparent)$/i.test(decl.background))
        || ("background-color" in decl && !/^(none|transparent)$/i.test(decl["background-color"]));
      if (leftPinned && fullHeight && narrow && hasBg) {
        const line = BODY.slice(0, m.index).split("\n").length;
        bad.push(line + ": " + selector.trim() + " { ... }  (::before/after 좌측 풀하이트 마커)");
      }
    }
  }

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
