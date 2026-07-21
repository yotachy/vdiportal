"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "index.html");
const read = () => fs.readFileSync(FILE, "utf8");

// 양 테마가 반드시 함께 지정해야 하는 토큰 키 (누락 시 전환 간 leak)
const TOKENS = [
  "--bg", "--bg-hi", "--surface", "--surface-2", "--tint", "--footer-bg",
  "--border", "--border-2", "--text", "--muted", "--muted-2", "--muted-3",
  "--accent", "--accent-strong", "--on-accent",
  "--caveat", "--caveat-bg", "--caveat-border",
];

function styleCss(html) {
  const start = html.indexOf("<style>");
  const end = html.indexOf("</style>");
  assert.ok(start >= 0 && end > start, "<style> 블록 없음");
  return html.slice(start + "<style>".length, end);
}

// selector가 <style> 최상위에 정확히 한 번만 등장한다고 가정한 단순 매칭(진짜 CSS 파서 아님).
// 이후 :root/[data-theme=dark]를 @media나 @supports 안에 중첩시키는 작업이 생기면 이 helper부터 다시 볼 것.
function blockOf(css, selector) {
  const i = css.indexOf(selector + "{");
  assert.ok(i >= 0, `셀렉터 없음: ${selector}`);
  return css.slice(i, css.indexOf("}", i));
}

test("검색 비공개 메타가 있다", () => {
  assert.match(read(), /<meta name="robots" content="noindex, nofollow">/);
});

test("양 테마가 같은 토큰 키를 전부 지정한다", () => {
  const css = styleCss(read()).replace(/\s+/g, "");
  const light = blockOf(css, ":root");
  const dark = blockOf(css, "[data-theme=dark]");
  for (const t of TOKENS) {
    assert.ok(light.includes(t + ":"), `라이트에 ${t} 누락`);
    assert.ok(dark.includes(t + ":"), `다크에 ${t} 누락`);
  }
});

test("테마 판정이 첫 페인트 전에 끝난다 (head 인라인)", () => {
  const html = read();
  const head = html.slice(0, html.indexOf("</head>"));
  assert.ok(head.includes("site_theme"), "head에 테마 초기화 스크립트 없음");
  assert.ok(head.includes("prefers-color-scheme"), "OS 선호 테마 폴백 없음");
  // 문자열이 등장하는 것만으로는(주석 등) 부족 — 실제로 documentElement에 data-theme를 세팅해야 통과
  assert.match(
    head,
    /document\.documentElement\.setAttribute\(\s*["']data-theme["']/,
    "head 스크립트가 documentElement에 data-theme를 설정하지 않음"
  );
});

test("브랜드명이 상수 1곳에서 주입된다", () => {
  const html = read();
  assert.match(html, /const BRAND\s*=/, "BRAND 상수 없음");
  // 상수 선언만으로는 부족 — title과 [data-brand] 요소 양쪽에 실제로 소비돼야 통과
  assert.match(html, /document\.title\s*=\s*BRAND\b/, "BRAND가 document.title에 쓰이지 않음");
  assert.match(
    html,
    /querySelectorAll\(\s*["']\[data-brand\]["']\s*\)/,
    "BRAND가 [data-brand] 요소 조회에 쓰이지 않음"
  );
  assert.match(html, /\.textContent\s*=\s*BRAND\b/, "BRAND가 textContent로 채워지지 않음");
});

test("로그인 버튼은 노출하지 않는다 (인증 비활성)", () => {
  assert.ok(!/>\s*로그인\s*</.test(read()), "로그인 버튼이 노출됨");
});

test("시장 스트립에 가짜 시세 숫자가 없다", () => {
  const html = read();
  const strip = html.slice(html.indexOf('class="markets"'), html.indexOf("</section>", html.indexOf('class="markets"')));
  assert.ok(!/[+\-]?\d+(\.\d+)?%/.test(strip), "스트립에 등락률 숫자가 있음");
  assert.ok(!/\d{2,3}\.\d{2}/.test(strip), "스트립에 가격 숫자가 있음");
  assert.ok(!/\d{1,3}(,\d{3})+/.test(strip), "스트립에 콤마 구분 정수 가격이 있음");
});

test("마퀴가 reduced-motion을 존중한다", () => {
  assert.match(read(), /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("테마 토글은 aria-pressed를 쓴다", () => {
  assert.match(read(), /id="themeToggle"[^>]*aria-pressed/);
});

// 시안 카피 회귀 방지 — 스코어카드와 충돌하는 문자열은 페이지 어디에도 등장 금지 (다른 태스크도 재사용)
// 숫자로만 된 항목은 다른(정당한) 숫자열의 부분 문자열로 오탐할 수 있다
// (예: "217"은 "1217"·"21,700"에도 포함됨) — 그런 항목만 정규식으로 경계를 고정한다.
// 단어형 항목(신용카드 등)은 우연히 부분일치할 문맥이 없어 그대로 문자열로 둔다.
const BANNED = [
  /(?<![.\d])62%(?!p)/, // "62% 정확도" 가짜 수치 — 162%·0.62% 등과 우연히 겹치지 않게 숫자·소수점 경계 고정
  /(?<!\d)217건(?!\d)/, // "217건 추적 중" 가짜 수치 — 21,700·1217 등과 겹치지 않게 단위(건)까지 포함해 고정
  /(?<!\d)19,000(?!\d)/, // "19,000" 가짜 수치 — 119,000 등 더 큰 숫자의 일부로 오탐하지 않게 숫자 경계 고정
  "신용카드",
  "하루 5개",
  "상승 확률",
];

test("금지 카피가 어디에도 없다", () => {
  const html = read();
  for (const s of BANNED) {
    if (s instanceof RegExp) {
      assert.ok(!s.test(html), `금지 문자열 발견: ${s}`);
    } else {
      assert.ok(!html.includes(s), `금지 문자열 발견: ${s}`);
    }
  }
});

test("히어로가 정직한 역제 서사를 편다", () => {
  const html = read();
  assert.ok(html.includes("방향을 맞힌다고"), "역제 헤드라인 없음");
  assert.ok(html.includes("얼마나 움직일지"), "대안 주장 없음");
});

test("히어로 KPI가 스코어카드 실측치다", () => {
  const html = read();
  const hero = html.slice(html.indexOf('class="hero"'), html.indexOf("</section>", html.indexOf('class="hero"')));
  // 단위(%·%p)는 <span class="kpi-unit"> 태그로 감싸져 있어, 태그 경계를 제거한 뒤 부분 문자열로 검사한다
  const heroText = hero.replace(/<[^>]+>/g, "");
  for (const v of ["69.0%", "67~69%", "1.9%p"]) {
    assert.ok(heroText.includes(v), `KPI 누락: ${v}`);
  }
  assert.ok(heroText.includes("93k시점"), "검증 규모 표기 없음");
});

test("제품 모형이 예시임을 명시한다", () => {
  const html = read();
  const i = html.indexOf('class="mock"');
  assert.ok(i >= 0, "모형 섹션 없음");
  const sec = html.slice(i, html.indexOf("</section>", i));
  assert.ok(sec.includes("예시 화면"), "예시 라벨 없음 — 실제 시세로 오인될 수 있음");
});

// 방향성 주장을 문구 하나가 아니라 "개념" 단위로 차단한다.
// 히어로는 방향을 "맞히지 않는다"고 정직하게 역설하는 문장을 이미 담고 있으므로(예: "상승·하락 예측은
// 시장 기준선을 넘지 못합니다"), 이 가드는 mock 섹션(예시 카드)에만 스코프해 히어로의 정당한 disclaim
// 문구를 오탐하지 않는다 — mock 섹션은 예시 수치를 나열할 뿐 방향을 disclaim하는 문맥이 없어 무조건 차단해도 안전.
const DIRECTIONAL_CLAIM_PATTERNS = [
  /상승\s*확률/,
  /하락\s*확률/,
  /방향\s*확률/,
  /방향\s*정확도/,
  /적중률/,
  /방향\s*예측/,
];

test("모형이 검증된 축만 보여준다", () => {
  const html = read();
  const i = html.indexOf('class="mock"');
  const sec = html.slice(i, html.indexOf("</section>", i));
  for (const k of ["변동성", "낙폭", "R:R"]) {
    assert.ok(sec.includes(k), `모형에 ${k} 없음`);
  }
  for (const p of DIRECTIONAL_CLAIM_PATTERNS) {
    assert.ok(!p.test(sec), `모형이 방향성 주장을 담음: ${p}`);
  }
});

// 라벨과 수치가 "같은 .vitem 안에" 있는지를 확인하는 헬퍼.
// sec.includes(label) && sec.includes(value)를 각각 독립적으로 검사하면, 수치가 실수로
// 다른 항목의 자리로 옮겨가도(같은 섹션 안이면) 두 assert가 모두 통과해버린다 — 짝을 검증해야 한다.
// 구조: <div class="vitem"><span class="vitem-k">라벨<small>...</small></span><span class="vitem-v">수치</span></div>
// span은 </span>로 닫히므로, 라벨 마커 뒤 첫 </div>가 정확히 그 .vitem의 끝이다.
function vitemBlock(sec, label) {
  const marker = `vitem-k">${label}`;
  const i = sec.indexOf(marker);
  assert.ok(i >= 0, `항목 없음: ${label}`);
  const end = sec.indexOf("</div>", i);
  assert.ok(end >= 0, `.vitem 닫는 태그 없음: ${label}`);
  return sec.slice(i, end);
}

test("검증 통과 7축을 실측치와 함께 나열한다 (라벨-수치 짝)", () => {
  const html = read();
  // 섹션은 공유 .sec/.sec-alt 프리미티브와 함께 class="sec sec-alt verdict"로 다중 클래스를
  // 가지므로 class="verdict" 부분일치로는 못 찾는다 — 고유 id로 앵커링한다.
  const i = html.indexOf('id="verified"');
  assert.ok(i >= 0, "검증 섹션 없음");
  const sec = html.slice(i, html.indexOf("</section>", i));
  const pairs = [
    ["변동성 예보", "69.0%"],
    ["낙폭 위험", "67~69%"],
    ["이익목표 도달", "63~65%"],
    ["급변 경보", "65%"],
    ["갭 경보", "63%"],
    ["확률 캘리브레이션", "1.9%p"],
    ["지지반등", "53~56%"],
  ];
  for (const [k, v] of pairs) {
    const block = vitemBlock(sec, k);
    assert.ok(block.includes(v), `짝 불일치: ${k} 옆에 ${v}가 없음(다른 항목과 수치가 뒤바뀌었을 수 있음)`);
  }
});

test("못 하는 것을 숨기지 않는다 (라벨-수치 짝)", () => {
  const html = read();
  const i = html.indexOf('id="verified"');
  const sec = html.slice(i, html.indexOf("</section>", i));
  const dirBlock = vitemBlock(sec, "방향 예측");
  assert.ok(dirBlock.includes("58.1%"), "방향 실측치 없음");
  assert.ok(dirBlock.includes("60.8%"), "기준선 없음");
  for (const k of ["인터마켓", "내부자", "공매도", "PEAD"]) {
    assert.ok(sec.includes(k), `기각 항목 누락: ${k}`);
  }
});

test("작동 방식 3단계가 있고 방향 예측을 약속하지 않는다", () => {
  const html = read();
  const i = html.indexOf('id="how"');
  assert.ok(i >= 0, "작동 방식 섹션 없음");
  const sec = html.slice(i, html.indexOf("</section>", i));
  for (const n of ["01", "02", "03"]) {
    assert.ok(sec.includes(n), `단계 ${n} 없음`);
  }
  assert.ok(!/상승\s*확률/.test(sec), "작동 방식이 상승 확률을 약속함");
});

test("검증 방법론이 walk-forward와 기각 공개를 밝힌다", () => {
  const html = read();
  // 브리프 원안은 class="sec method"였으나, 앞 섹션(verdict)이 이미 sec-alt라
  // 배경 교대를 유지하려면 method 섹션이 sec-alt를 받아야 한다(sec sec-alt method) —
  // 실제 마크업에 맞춰 고유 클래스 문자열로 재앵커링.
  const i = html.indexOf('class="sec sec-alt method"');
  assert.ok(i >= 0, "방법론 섹션 없음");
  const sec = html.slice(i, html.indexOf("</section>", i));
  assert.ok(sec.includes("walk-forward"), "walk-forward 언급 없음");
  assert.ok(sec.includes("기각"), "기각 이력 언급 없음");
  assert.ok(sec.includes("forge-scorecard.html"), "스코어카드 링크 없음");
});

test("요금은 베타 무료만 말한다", () => {
  const html = read();
  assert.ok(html.includes("베타"), "베타 표기 없음");
  assert.ok(!/₩\s*[\d,]+/.test(html), "가격 숫자가 있음");
  assert.ok(!/\/\s*월/.test(html), "월 구독 표기가 있음");
});

test("모든 내부 링크가 실재하는 파일을 가리킨다", () => {
  const html = read();
  const hrefs = [...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]);
  const local = hrefs.filter((h) => !/^(https?:|mailto:)/.test(h));
  assert.ok(local.length > 0, "내부 링크가 하나도 없음");
  for (const h of local) {
    const p = path.join(__dirname, h.split("#")[0]);
    assert.ok(fs.existsSync(p), `죽은 링크: ${h}`);
  }
});

test("없는 페이지로 유도하지 않는다", () => {
  const html = read();
  for (const s of ["블로그", "이용약관", "개인정보처리방침"]) {
    assert.ok(!html.includes(s), `없는 페이지 링크: ${s}`);
  }
});

test("투자 유의 안내를 고지한다", () => {
  const html = read();
  assert.ok(html.includes("투자 유의"), "투자 유의 안내 없음");
  assert.ok(html.includes("참고용"), "참고용 도구 명시 없음");
  assert.ok(html.includes("책임은 이용자 본인"), "책임 귀속 문구 없음");
});

// WCAG 2.x 상대 휘도/대비 — 외부 의존성 없이 인라인 구현 (color-contrast 류 패키지 금지).
// 참고: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(hexA, hexB) {
  const [l1, l2] = [relLuminance(hexA), relLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

// 토큰 블록에서 "--key:#hex" 쌍을 뽑아 {키:hex} 맵으로 — :root/[data-theme=dark] 양쪽에 재사용.
function parseTokenColors(block) {
  const map = {};
  const re = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g;
  let m;
  while ((m = re.exec(block))) map[m[1]] = m[2];
  return map;
}

// 특정 셀렉터 규칙에서 실제로 쓰는 color 토큰 이름을 뽑는다 — 값을 하드코딩하지 않고
// 스타일시트가 지금 어떤 토큰을 참조하는지 그대로 따라가야, 이후 다시 --muted-3로 되돌리는
// 회귀(법적 고지가 도로 안 보이게 되는 실수)를 이 테스트가 실제로 잡아낼 수 있다.
function colorTokenOf(css, selector) {
  const block = blockOf(css, selector);
  const m = block.match(/color\s*:\s*var\((--[\w-]+)\)/);
  assert.ok(m, `${selector}에 color:var(--token) 선언 없음`);
  return m[1];
}

test("법적 고지(.ft-disc)가 양 테마 모두 WCAG AA(4.5:1)를 만족한다", () => {
  const css = styleCss(read());
  const fgVar = colorTokenOf(css, ".ft-disc");
  const bgVar = "--footer-bg"; // .site-footer 배경 — .ft-disc가 실제로 얹히는 표면

  for (const [theme, selector] of [["light", ":root"], ["dark", "[data-theme=dark]"]]) {
    const tokens = parseTokenColors(blockOf(css, selector));
    const fg = tokens[fgVar];
    const bg = tokens[bgVar];
    assert.ok(fg, `${theme} 테마에 ${fgVar} 색상값 파싱 실패`);
    assert.ok(bg, `${theme} 테마에 ${bgVar} 색상값 파싱 실패`);
    const ratio = contrastRatio(fg, bg);
    assert.ok(
      ratio >= 4.5,
      `${theme} 테마: .ft-disc(${fgVar}=${fg}) vs ${bgVar}=${bg} 대비 ${ratio.toFixed(2)}:1 — AA(4.5:1) 미달`
    );
  }
});

test("모바일 대응 브레이크포인트가 있다", () => {
  assert.match(read(), /@media\s*\(max-width:\s*860px\)/);
});

test("좌측 컬러 accent bar를 쓰지 않는다", () => {
  const html = read();
  assert.ok(!/box-shadow:\s*inset\s+\d+px\s+0\s+0/.test(html), "inset 좌측 라인 발견");
  assert.ok(!/border-left:\s*\d*\.?\d+px\s+solid\s+var\(--accent/.test(html), "좌측 accent 보더 발견");
});

test("이미지 없이 인라인 SVG만 쓴다", () => {
  assert.ok(!/<img\b/.test(read()), "외부 이미지 참조 발견");
});

test("외부 의존성은 Pretendard 하나뿐", () => {
  const html = read();
  const ext = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.strictEqual(ext.length, 1, `외부 의존성 ${ext.length}개: ${ext.join(", ")}`);
  assert.match(ext[0], /pretendard/);
});

module.exports = { FILE, read, TOKENS, blockOf, styleCss, contrastRatio, parseTokenColors, colorTokenOf };
