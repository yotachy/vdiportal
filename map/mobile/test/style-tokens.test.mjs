import { test } from "node:test";
import { allCss } from "./_css.mjs";
import assert from "node:assert";
import { readFileSync } from "node:fs";
const RAW = allCss();
// 주석을 **먼저** 비운다(개행은 보존 — 줄 번호가 원본과 어긋나면 안 된다).
// 안 그러면 주석 안의 중괄호 한 짝이 아래 :root 블록 탐색을 그 자리에서 끝내버린다.
// 실제로 이 라운드에 그 일이 났다: 척도 토큰을 설명하는 주석에 `--fw-{역할}` 이라고 적었더니
// ROOT 가 거기서 잘려 뒤쪽 토큰들이 ROOT 밖으로 밀려났고, 동시에 BODY 가 :root 의 뒷부분을
// 삼켰다. 두 관문 다 **우연히** 초록이었다 — 잘린 뒤쪽에 헥스도, 역할 토큰도 없었을 뿐이다.
// 경계 계산은 주석을 비운 문자열 하나(CSS)에서만 한다.
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""));
const ROOT = (CSS.match(/:root\s*\{[\s\S]*?\}/) || [""])[0];
// 스캔 경계: 첫 ":root{...}" 블록이 끝나는 지점부터 파일 끝까지만 본다.
// 그 위(현재는 Task 1 의 @font-face 블록)는 관문 대상이 아니다 — 의도적이지만,
// 여기서 위로 규칙을 하나 더 추가하는 다음 사람은 이 사실을 모르고 지나치기 쉽다.
// 주석이 이미 비어 있으므로(위 CSS) "이전 값 13px 이었다" 같은 설명 주석이 아래 관문에
// 오탐을 내지 않는다. 줄 단위로 지우면 여러 줄 주석의 중간 줄이 안 지워져 새는데, 위에서
// 통째로 비워 그 구멍도 함께 막혔다.
const BODY_AT = CSS.indexOf(":root") + ROOT.length;
const BODY = CSS.slice(BODY_AT);
// BODY 는 개행을 보존하므로 BODY 인덱스에서 원본 줄 번호를 되찾을 수 있다 — 규칙 블록 단위로
// 보는 관문(아래 3축 결속)이 "몇 줄"을 못 말하면 고치는 사람이 파일을 훑어야 한다.
function lineOf(bodyIdx) { return CSS.slice(0, BODY_AT + bodyIdx).split("\n").length; }

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

// ── 타이포 3축 ────────────────────────────────────────────────────────────────────────────
// P1 은 크기 축만 세웠다. 무게·자간은 토큰을 정의해 놓고 강제하지 않아 리터럴 43건·12건이
// 남았고, 리뷰(Important 6)가 남긴 진짜 지적은 그 55건 자체가 아니라 **막는 관문이 없어
// 새 규칙이 계속 하드코딩으로 들어온다**는 것이었다. P2 는 화면을 여섯 개 넘게 새로 그리므로
// 관문 없이 시작하면 그 헐거움이 화면 수만큼 복제된다.
//
// 값 형태는 "정확히 var(--토큰)" 만 받는다. calc()/clamp() 로 감싸는 것을 허용하면
// `calc(var(--fw-bold) + 100)` 같은 형태로 토큰을 통과시키면서 역할 밖 값을 만들 수 있다
// (P1 판정 X 가 park 한 잔여 탈출구 — 크기 축에서 지적된 그 형태다. 여기서는 처음부터 막는다).
const AXES = [
  { prop: "font-weight", pre: "--fw-" },
  { prop: "letter-spacing", pre: "--ls-" },
];
// font 축약형이 무게를 실을 수 있다 — "font:700 13px/1.4 x". 크기 관문과 같은 이유로 함께 본다.
// 크기를 안 싣는 합법 키워드(font:inherit 등)는 위 FONT_SHORTHAND_KEYWORDS 가 이미 안다.
const WEIGHT_WORD = /(?:^|\s)(?:[1-9]00|bold|bolder|lighter)(?:\s|$|\/)/;

test("화면 CSS 의 font-weight·letter-spacing 도 토큰만 쓴다 — 크기만 강제하면 축이 셋 중 하나다", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    AXES.forEach(({ prop, pre }) => {
      // 한 줄에 여러 선언이 올 수 있다(이 파일이 이미 그렇다) — g 로 전부 본다.
      // 프로퍼티 앞에 하이픈이 없어야 한다: "-webkit-letter-spacing" 류의 접두 변형을 안 잡는다.
      const re = new RegExp("(?:^|[^-\\w])" + prop + "\\s*:\\s*([^;}]+)", "g");
      let m;
      while ((m = re.exec(line))) {
        const v = m[1].trim();
        if (!new RegExp("^var\\(\\s*" + pre + "[a-z]+\\s*\\)$").test(v))
          bad.push(prop + " " + (i + 1) + ": " + v);
      }
    });
    let m;
    const fRe = /(?:^|[^-\w])font\s*:\s*([^;}]+)/g;
    while ((m = fRe.exec(line))) {
      const val = m[1].trim().toLowerCase();
      if (FONT_SHORTHAND_KEYWORDS.indexOf(val) >= 0) continue;
      if (WEIGHT_WORD.test(val) && !/var\(--fw-/.test(val))
        bad.push("font 축약형 " + (i + 1) + ": " + val + "  (축약형에 실린 무게가 토큰이 아니다)");
    }
  });
  assert.deepEqual(bad, [],
    "토큰 아닌 무게/자간 " + bad.length + "건:\n" + bad.join("\n"));
});

// 8역할 중 **정체성을 갖는 다섯**(판정 헤드라인·화면 제목·섹션 제목·큰 수치·오버라인)은
// 크기만 빌려 쓸 수 없다 — 그 크기를 쓰면 무게·자간도 그 역할의 것을 쓴다.
// 나머지 셋(body·sub·caption)은 **일하는 크기**다: 같은 12px 라벨을 400 으로도 600 으로도
// 그리는 것이 정상이라 결속하지 않는다(결속하면 실재하는 위계를 지운다).
//
// 이 관문이 P1 리뷰가 이름을 대서 지적한 결함 하나를 정확히 겨눈다 — .wl-brand 가
// --fs-section(역할 800/−0.03em)을 쓰면서 700/−.01em 을 따로 적고 있었다.
const IDENTITY_ROLES = ["headline", "title", "section", "figure", "overline"];
// 역할 이름 전체(정체성 5 + 일하는 크기 3 + display). 이 목록에 없는 --fw-*/--ls-* 접미사가
// 곧 "척도 토큰"이다 — 열거가 아니라 차집합으로 구한다.
const ROLE_NAMES = IDENTITY_ROLES.concat(["body", "sub", "caption", "display"]);

// 타이포는 **글자 요소**가 갖는다 — 레이아웃 상자가 아니라.
//
// em 자간은 자식에게 **절대 px 로 상속**된다. 44px 헤드라인이 −0.05em(=−2.2px)을 들고 있으면
// 그 안의 11.5px 캡션도 −2.2px 를 물려받아(글자 크기의 −19%) 글자가 서로 겹친다.
// 실제로 그랬다: .rp-verdict 가 display:flex 컨테이너이면서 헤드라인 타이포를 들고 있어
// 집계 문구("3 상승 · 0 횡보 · 2 하락")가 뭉개졌다 — 1457건이 초록인 채로, 헤드리스
// 스크린샷에서야 보였다. 관문이 못 보던 종류이므로 여기 규칙으로 세운다.
//
// 규칙: display:flex/grid 인 규칙은 **정체성 역할의 자간**을 갖지 않는다.
//
// 왜 정체성 역할만인가 — 해악은 자간 자체가 아니라 **크기 격차**에서 온다. 44px 헤드라인의
// −0.05em 은 −2.2px 이고, 그게 11.5px 자식에게 실리면 −19% 다. 반면 배지(.rp-tier, 캡션
// 크기 + .04em)처럼 상자와 자식의 크기가 같으면 상속돼도 달라지는 게 없다 — 그런 것까지
// 막으면 가운데 정렬 하나 하려고 span 을 덧대게 되고, 그건 규칙이 아니라 세금이다.
// 정체성 역할(헤드라인·display·제목·섹션·큰 수치)이 곧 "큰 글자"의 목록이라 그 다섯만 본다.
const LAYOUT_DISPLAY = /display\s*:\s*(?:inline-)?(?:flex|grid)\b/;
const BIG_LS = /--ls-(headline|display|title|figure|section)\b/;
test("레이아웃 상자(flex·grid)는 큰 글자의 자간을 들고 있지 않다 — em 자간이 자식에게 px 로 상속된다", () => {
  const bad = [];
  ruleBlocks(BODY).forEach(b => {
    if (!LAYOUT_DISPLAY.test(b.body)) return;
    const ls = parseDecls(b.body).filter(d => d.prop === "letter-spacing").pop();
    if (!ls || !BIG_LS.test(ls.value)) return;
    bad.push(lineOf(b.index) + " " + b.selector.trim() + ": " + ls.value);
  });
  assert.deepEqual(bad, [],
    "flex/grid 상자가 자간을 들고 있다 " + bad.length + "건:\n" + bad.join("\n") +
    "\n→ 그 안의 작은 글자가 큰 자간을 px 로 물려받아 겹친다. 자간은 글자 요소로 옮길 것.");
});

// 척도 토큰은 소비자가 있어야 한다. 역할 triple 은 선언된 디자인 어휘라 지금 안 쓰여도 남지만,
// 척도는 "리터럴을 옮길 곳"으로 만든 것이라 소비자가 0 이면 그냥 죽은 값이다 —
// P1 Ruling B 가 --fs-figure 에 대해 한 지적과 같다: 아무도 안 쓰는 토큰은 있으나 마나가 아니라
// 다음 사람이 "이 값은 안 쓰나 보다"로 읽는다. 실제로 이 라운드에서 5개(--fw-light·--fw-medium·
// --ls-tight·--ls-snug·--ls-widest)가 소비자 0 으로 태어났다가 이 관문에 걸려 지워졌다.
test("무게·자간 척도 토큰은 소비자가 있다 — 죽은 값을 어휘로 남기지 않는다", () => {
  const dead = [];
  const re = /--((?:fw|ls)-[a-z]+)\s*:/g;
  let m;
  while ((m = re.exec(ROOT))) {
    const name = m[1], suffix = name.replace(/^(fw|ls)-/, "");
    if (ROLE_NAMES.indexOf(suffix) >= 0) continue;
    if (BODY.indexOf("var(--" + name + ")") < 0) dead.push("--" + name);
  }
  assert.deepEqual(dead, [],
    "소비자 0 인 척도 토큰 " + dead.length + "개: " + dead.join(", ") +
    " — 지우거나, 남길 이유를 주석으로 적고 실제로 쓸 것");
});

test("정체성 역할은 3축을 함께 쓴다 — 크기만 빌리고 무게·자간을 따로 적지 않는다", () => {
  const bad = [];
  ruleBlocks(BODY).forEach(b => {
    const decls = parseDecls(b.body);
    const fs = decls.filter(d => d.prop === "font-size").pop();
    if (!fs) return;
    const role = (fs.value.match(/var\(\s*--fs-([a-z]+)\s*\)/) || [])[1];
    if (!role || IDENTITY_ROLES.indexOf(role) < 0) return;
    [["font-weight", "--fw-"], ["letter-spacing", "--ls-"]].forEach(([prop, pre]) => {
      const d = decls.filter(x => x.prop === prop).pop();
      if (!d) return;   // 안 적은 것은 상속이다 — 역할을 어기지 않는다
      if (d.value.trim() !== "var(" + pre + role + ")")
        bad.push(lineOf(b.index) + " " + b.selector.trim() + ": --fs-" + role +
                 " 인데 " + prop + " 가 " + d.value.trim() + " (기대: var(" + pre + role + "))");
    });
  });
  assert.deepEqual(bad, [],
    "역할에서 벗어난 축 " + bad.length + "건:\n" + bad.join("\n") +
    "\n(역할 값을 바꾸고 싶으면 :root 의 그 역할을 바꿀 것 — 규칙마다 따로 적으면 위계가 다시 흩어진다)");
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
