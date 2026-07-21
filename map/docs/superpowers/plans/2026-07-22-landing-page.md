# 랜딩 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `map/index.html` — "방향은 못 맞힌다, 변동폭은 맞힌다"는 정직한 역제 서사의 제품 랜딩 페이지를 만든다.

**Architecture:** 빌드 도구 없는 단일 자립 HTML. CSS는 `<style>` 인라인, JS는 테마 토글 한 줌뿐. 검증은 `landing.test.js`(node --test, 의존성 0)가 파일 텍스트를 파싱해 수치·링크·토큰·금지 카피를 단언하고, 마지막에 헤드리스 크로미움 스크린샷으로 육안 확인한다.

**Tech Stack:** HTML5 · CSS3 (커스텀 프로퍼티) · 바닐라 JS · Pretendard CDN · `node --test` (내장)

## Global Constraints

이 절의 요구사항은 **모든 태스크에 암묵적으로 포함**된다.

- 빌드 도구·프레임워크·번들러 금지. 순수 정적 HTML/CSS/바닐라 JS.
- 외부 의존성은 Pretendard CDN 단 하나. 다른 라이브러리·아이콘 세트·폰트 금지.
- 색상 하드코딩 금지 — `:root` / `[data-theme=dark]` 커스텀 프로퍼티만 사용.
- **항목 좌측 컬러 라인(accent bar/rail) 절대 금지** — `box-shadow: inset Npx 0 0`, `::before` 세로 마커 형태 모두. 활성/강조는 배경색·텍스트색·아웃라인으로만.
- 들여쓰기 2 spaces. UI 텍스트 전부 한국어. `letter-spacing: -.01em` 기본, 제목 `-.02em ~ -.03em`.
- `<head>`에 `<meta name="robots" content="noindex, nofollow">` 필수.
- SVG는 인라인, 기본 속성 `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"`.
- 브랜드명은 리터럴로 흩뿌리지 말고 **`BRAND` 상수 1곳**에서 주입한다.
- 페이지에 등장하는 모든 수치는 `forge-scorecard.html` 실측치여야 한다. 다음 문자열은 **어디에도 등장 금지**: `62%`, `217`, `19,000`, `신용카드`, `하루 5개`, `상승 확률`, `방향 적중률 62`.
- 링크는 실재하는 파일만. 블로그·문의·이용약관·개인정보처리방침 링크 금지.

**확정 수치 (스코어카드 실측):**

| 항목 | 값 |
|---|---|
| 변동성 예보 | 69.0% (단순 기준 대비 +17.5%p) |
| 낙폭 위험곡선 | 67~69% |
| 이익목표 도달 | 63~65% |
| 급변 경보 | 65% |
| 갭 경보(주식) | 63% |
| 확률 캘리브레이션 OOS ECE | 1.9%p |
| 지지반등 진입 신호 승률 | 53~56% |
| 방향 적중(미달) | 58.1% vs 기준선 60.8% |
| 검증 규모 | 20년(2006~2026) · 54종 · 93k시점 |

---

## File Structure

| 파일 | 책임 |
|---|---|
| `map/index.html` (신규) | 랜딩 페이지 전부 — 마크업 + `<style>` + 테마 스크립트 |
| `map/landing.test.js` (신규) | `node --test`용 콘텐츠 계약 검증 (수치·링크·토큰·금지 카피) |
| `map/docs/BACKLOG.md` (수정) | 완료 기록 |

`index.html` 하나에 모든 섹션이 들어간다. forge처럼 4분할하지 않는 이유: 정적 마케팅 페이지는 상호 의존이 없고, 단일 파일이 배포 단위와 일치하며(`put index.html` 한 줄), 프로젝트에 `forge-pricing.html`이라는 동형 선례가 있다.

---

## Task 1: 골격 · 토큰 · 테마 시스템

**Files:**
- Create: `map/index.html`
- Create: `map/landing.test.js`

**Interfaces:**
- Produces: `map/index.html` — `<html data-theme>` 루트, `:root`/`[data-theme=dark]` 토큰 세트, `BRAND` 상수, `<main>` 빈 컨테이너. 이후 모든 태스크가 `<main>` 안에 `<section>`을 덧붙인다.
- Produces: `map/landing.test.js` — `read()` 헬퍼(`index.html` 텍스트 반환)와 `TOKENS` 상수. 이후 태스크가 이 파일에 `test()` 블록을 추가한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`map/landing.test.js` 생성:

```js
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
];

function blockOf(css, selector) {
  const i = css.indexOf(selector + "{");
  assert.ok(i >= 0, `셀렉터 없음: ${selector}`);
  return css.slice(i, css.indexOf("}", i));
}

test("검색 비공개 메타가 있다", () => {
  assert.match(read(), /<meta name="robots" content="noindex, nofollow">/);
});

test("양 테마가 같은 토큰 키를 전부 지정한다", () => {
  const css = read().replace(/\s+/g, "");
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
});

test("브랜드명이 상수 1곳에서 주입된다", () => {
  const html = read();
  assert.match(html, /const BRAND\s*=/, "BRAND 상수 없음");
});

module.exports = { FILE, read, TOKENS, blockOf };
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: FAIL — `ENOENT: no such file or directory, open '.../index.html'`

- [ ] **Step 3: 최소 구현**

`map/index.html` 생성:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>기술적 분석 엔진</title>
<script>
  // FOUC 방지 — 첫 페인트 전에 data-theme 확정
  (function () {
    var t = null;
    try { t = localStorage.getItem("site_theme"); } catch (e) {}
    if (t !== "light" && t !== "dark") {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", t);
  })();
</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
  :root{
    --bg:#f4f2ec; --bg-hi:#faf6ec; --surface:#fbfaf6; --surface-2:#efece3;
    --tint:#efe9dd; --footer-bg:#ece4d3; --border:#e4dfd3; --border-2:#d8d1c1;
    --text:#2a2620; --muted:#5a5449; --muted-2:#7a7364; --muted-3:#9a9284;
    --accent:#1f6feb; --accent-strong:#1a5cc4; --on-accent:#fff;
    --r-sm:6px; --r-md:10px; --r-lg:16px; --maxw:1120px;
  }
  [data-theme=dark]{
    --bg:#0f0d0a; --bg-hi:#151109; --surface:#16130e; --surface-2:#1c1913;
    --tint:#100e0a; --footer-bg:#0c0a07; --border:#26221b; --border-2:#332e24;
    --text:#f4f2ec; --muted:#b8b0a0; --muted-2:#a49c8c; --muted-3:#8f8878;
    --accent:#3b82f6; --accent-strong:#60a5fa; --on-accent:#fff;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{background:var(--bg)}
  body{
    font-family:"Pretendard Variable",Pretendard,-apple-system,system-ui,"Segoe UI",sans-serif;
    background:var(--bg);color:var(--text);line-height:1.6;letter-spacing:-.01em;
    -webkit-font-smoothing:antialiased;
    transition:background .3s ease,color .3s ease;
  }
  a{color:inherit;text-decoration:none}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}
</style>
</head>
<body>

<main></main>

<script>
  var BRAND = "나루";
  document.title = BRAND + " — 기술적 분석 엔진";
  Array.prototype.forEach.call(document.querySelectorAll("[data-brand]"), function (el) {
    el.textContent = BRAND;
  });
</script>
</body>
</html>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: PASS — 4 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add index.html landing.test.js
git commit -m "feat(landing): 골격·토큰·테마 시스템

라이트/다크 토큰 완전 세트(양 테마 동일 키), FOUC 방지 head 인라인
테마 판정, BRAND 상수 격리. landing.test.js 계약 검증 4건.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 헤더 + 지원 시장 스트립

**Files:**
- Modify: `map/index.html` (`<main>` 앞에 `<header>`, `<main>` 안 첫 `<section>`)
- Modify: `map/landing.test.js` (테스트 추가)

**Interfaces:**
- Consumes: Task 1의 토큰, `[data-brand]` 주입 규약, `.wrap` 컨테이너
- Produces: `<header class="site-header">` (sticky) · `<section class="markets">` · 테마 토글 `#themeToggle` (`aria-pressed` 유지)

- [ ] **Step 1: 실패하는 테스트 작성**

`map/landing.test.js` 끝의 `module.exports` **앞에** 추가:

```js
test("로그인 버튼은 노출하지 않는다 (인증 비활성)", () => {
  assert.ok(!/>\s*로그인\s*</.test(read()), "로그인 버튼이 노출됨");
});

test("시장 스트립에 가짜 시세 숫자가 없다", () => {
  const html = read();
  const strip = html.slice(html.indexOf('class="markets"'), html.indexOf("</section>", html.indexOf('class="markets"')));
  assert.ok(!/[+\-]\d+\.\d+%/.test(strip), "스트립에 등락률 숫자가 있음");
  assert.ok(!/\d{2,3}\.\d{2}/.test(strip), "스트립에 가격 숫자가 있음");
});

test("마퀴가 reduced-motion을 존중한다", () => {
  assert.match(read(), /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("테마 토글은 aria-pressed를 쓴다", () => {
  assert.match(read(), /id="themeToggle"[^>]*aria-pressed/);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: FAIL — "셀렉터 없음" 또는 `class="markets"` 미발견으로 인한 slice 오류 / `aria-pressed` 미매치

- [ ] **Step 3: 최소 구현**

`</style>` 앞에 CSS 추가:

```css
  .site-header{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
  .hd{display:flex;align-items:center;gap:28px;height:64px}
  .hd-brand{font-size:18px;font-weight:800;letter-spacing:-.03em}
  .hd-nav{display:flex;gap:22px;font-size:14px;color:var(--muted);margin-left:8px}
  .hd-nav a:hover{color:var(--text)}
  .hd-right{margin-left:auto;display:flex;align-items:center;gap:10px}
  .icon-btn{width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--border);background:var(--surface);color:var(--muted);border-radius:var(--r-md);cursor:pointer}
  .icon-btn:hover{color:var(--text);border-color:var(--border-2)}
  .btn{display:inline-flex;align-items:center;gap:7px;font:700 14px/1 inherit;padding:11px 18px;border-radius:var(--r-md);border:1px solid transparent;cursor:pointer;letter-spacing:-.01em}
  .btn-primary{background:var(--accent);color:var(--on-accent)}
  .btn-primary:hover{background:var(--accent-strong)}
  .btn-ghost{background:var(--surface);color:var(--text);border-color:var(--border-2)}
  .btn-ghost:hover{background:var(--surface-2)}
  [data-theme=dark] .icon-btn .sun,[data-theme=light] .icon-btn .moon{display:none}

  .markets{border-bottom:1px solid var(--border);background:var(--tint);overflow:hidden}
  .mq{display:flex;gap:0;width:max-content;animation:mqScroll 42s linear infinite}
  .mq-item{display:flex;align-items:center;gap:8px;padding:11px 22px;font-size:12.5px;color:var(--muted-2);white-space:nowrap}
  .mq-item b{color:var(--muted);font-weight:700}
  .mq-item::after{content:"";width:3px;height:3px;border-radius:50%;background:var(--border-2)}
  @keyframes mqScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
  @media (prefers-reduced-motion: reduce){.mq{animation:none}}
```

`<main></main>`을 다음으로 교체:

```html
<header class="site-header">
  <div class="wrap hd">
    <a class="hd-brand" href="#top"><span data-brand>나루</span></a>
    <nav class="hd-nav">
      <a href="#how">작동 방식</a>
      <a href="forge-scorecard.html">검증 성적</a>
      <a href="forge-pricing.html">요금제</a>
    </nav>
    <div class="hd-right">
      <button class="icon-btn" id="themeToggle" type="button" aria-pressed="false" aria-label="다크 모드 전환">
        <svg class="sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      </button>
      <a class="btn btn-primary" href="forge.html">분석 시작</a>
    </div>
  </div>
</header>

<main id="top">

<section class="markets" aria-label="지원 시장">
  <div class="mq">
    <span class="mq-item"><b>코스피</b>삼성전자</span>
    <span class="mq-item"><b>코스닥</b>에코프로비엠</span>
    <span class="mq-item"><b>나스닥</b>NVDA</span>
    <span class="mq-item"><b>나스닥</b>TSLA</span>
    <span class="mq-item"><b>NYSE</b>BRK.B</span>
    <span class="mq-item"><b>암호화폐</b>BTC · ETH</span>
    <span class="mq-item"><b>ETF</b>SPY · QQQ</span>
    <span class="mq-item"><b>선물 · FX</b>USD/KRW</span>
    <span class="mq-item"><b>코스피</b>삼성전자</span>
    <span class="mq-item"><b>코스닥</b>에코프로비엠</span>
    <span class="mq-item"><b>나스닥</b>NVDA</span>
    <span class="mq-item"><b>나스닥</b>TSLA</span>
    <span class="mq-item"><b>NYSE</b>BRK.B</span>
    <span class="mq-item"><b>암호화폐</b>BTC · ETH</span>
    <span class="mq-item"><b>ETF</b>SPY · QQQ</span>
    <span class="mq-item"><b>선물 · FX</b>USD/KRW</span>
  </div>
</section>

</main>
```

하단 `<script>`의 `BRAND` 주입 뒤에 토글 로직 추가:

```js
  var tgl = document.getElementById("themeToggle");
  function syncToggle() {
    tgl.setAttribute("aria-pressed", document.documentElement.getAttribute("data-theme") === "dark" ? "true" : "false");
  }
  syncToggle();
  tgl.addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("site_theme", next); } catch (e) {}
    syncToggle();
  });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: PASS — 8 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add index.html landing.test.js
git commit -m "feat(landing): 헤더 + 지원 시장 스트립

sticky 헤더(테마 토글·분석 시작), 로그인은 인증 비활성이라 미노출.
시안의 더미 시세 마퀴를 가격 숫자 없는 시장·종목 스트립으로 교체 —
정직을 내세운 페이지 상단의 가짜 시세는 자충수. reduced-motion 존중.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 히어로 + KPI

**Files:**
- Modify: `map/index.html`
- Modify: `map/landing.test.js`

**Interfaces:**
- Consumes: `.wrap`, `.btn`/`.btn-primary`/`.btn-ghost`
- Produces: `<section class="hero">` — `.hero-h1`, `.hero-lede`, `.hero-cta`, `.kpis` (`.kpi` × 3), `.hero-scale`

- [ ] **Step 1: 실패하는 테스트 작성**

`module.exports` 앞에 추가:

```js
const BANNED = ["62%", "217", "19,000", "신용카드", "하루 5개", "상승 확률"];

test("금지 카피가 어디에도 없다", () => {
  const html = read();
  for (const s of BANNED) {
    assert.ok(!html.includes(s), `금지 문자열 발견: ${s}`);
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
  for (const v of ["69.0%", "67~69%", "1.9%p"]) {
    assert.ok(hero.includes(v), `KPI 누락: ${v}`);
  }
  assert.ok(hero.includes("93k시점"), "검증 규모 표기 없음");
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: FAIL — "역제 헤드라인 없음"

- [ ] **Step 3: 최소 구현**

`</style>` 앞에 CSS 추가:

```css
  .hero{padding:88px 0 76px;background:linear-gradient(180deg,var(--bg-hi),var(--bg))}
  .hero-h1{font-size:52px;font-weight:800;letter-spacing:-.035em;line-height:1.16;max-width:720px}
  .hero-lede{margin-top:22px;font-size:17px;color:var(--muted);max-width:600px;line-height:1.75}
  .hero-lede em{font-style:normal;color:var(--text);font-weight:700}
  .hero-cta{display:flex;gap:11px;margin-top:34px;flex-wrap:wrap}
  .hero-cta .btn{padding:14px 24px;font-size:15px}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:56px;max-width:660px}
  .kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:22px 20px}
  .kpi-v{font-size:34px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--accent)}
  .kpi-k{margin-top:5px;font-size:13px;color:var(--muted);font-weight:600}
  .kpi-n{margin-top:3px;font-size:11.5px;color:var(--muted-3)}
  .hero-scale{margin-top:20px;font-size:12.5px;color:var(--muted-3)}
```

`</section>` (markets) 뒤, `</main>` 앞에 삽입:

```html
<section class="hero">
  <div class="wrap">
    <h1 class="hero-h1">우리는 방향을 맞힌다고<br>말하지 않습니다.</h1>
    <p class="hero-lede">
      상승·하락 예측은 시장 기준선을 넘지 못합니다 — 저희도, 다른 어느 기술적 분석도.
      대신 <em>얼마나 움직일지</em>는 맞힙니다. 변동폭·낙폭·급변 확률은 검증을 통과했습니다.
    </p>
    <div class="hero-cta">
      <a class="btn btn-primary" href="forge.html">무료로 분석 시작 →</a>
      <a class="btn btn-ghost" href="forge-scorecard.html">검증 성적 보기</a>
    </div>
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-v">69.0<span class="sr-unit">%</span></div>
        <div class="kpi-k">변동성 예보</div>
        <div class="kpi-n">단순 기준 대비 +17.5%p</div>
      </div>
      <div class="kpi">
        <div class="kpi-v">67~69<span class="sr-unit">%</span></div>
        <div class="kpi-k">낙폭 위험</div>
        <div class="kpi-n">1 · 2 · 3개월 지평</div>
      </div>
      <div class="kpi">
        <div class="kpi-v">1.9<span class="sr-unit">%p</span></div>
        <div class="kpi-k">확률 오차</div>
        <div class="kpi-n">표기 60% = 실제 60%</div>
      </div>
    </div>
    <p class="hero-scale">20년(2006~2026) · 54종 · 93k시점 walk-forward 검증 — 각 시점에서 과거 데이터만 사용</p>
  </div>
</section>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: PASS — 11 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add index.html landing.test.js
git commit -m "feat(landing): 히어로 — 정직한 역제 + 검증 KPI 3장

시안의 '방향 적중률 62%'는 스코어카드 실측(58.1%·기준선 60.8% 미달)과
충돌해 폐기. 검증 통과 축(변동성 69.0%·낙폭 67~69%·ECE 1.9%p)으로 교체.
금지 카피 회귀 방지 테스트 포함.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 제품 모형 (예시 화면)

**Files:**
- Modify: `map/index.html`
- Modify: `map/landing.test.js`

**Interfaces:**
- Consumes: `.wrap`, 토큰
- Produces: `<section class="mock">` — `.mock-card`, `.mock-badge`("예시 화면"), `.mrow`

- [ ] **Step 1: 실패하는 테스트 작성**

`module.exports` 앞에 추가:

```js
test("제품 모형이 예시임을 명시한다", () => {
  const html = read();
  const i = html.indexOf('class="mock"');
  assert.ok(i >= 0, "모형 섹션 없음");
  const sec = html.slice(i, html.indexOf("</section>", i));
  assert.ok(sec.includes("예시 화면"), "예시 라벨 없음 — 실제 시세로 오인될 수 있음");
});

test("모형이 검증된 축만 보여준다", () => {
  const html = read();
  const i = html.indexOf('class="mock"');
  const sec = html.slice(i, html.indexOf("</section>", i));
  for (const k of ["변동성", "낙폭", "R:R"]) {
    assert.ok(sec.includes(k), `모형에 ${k} 없음`);
  }
  assert.ok(!sec.includes("적중률"), "모형이 방향 적중률을 주장함");
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: FAIL — "모형 섹션 없음"

- [ ] **Step 3: 최소 구현**

`</style>` 앞에 CSS 추가:

```css
  .mock{padding:0 0 84px;background:var(--bg)}
  .mock-frame{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:26px 26px 22px;max-width:760px;margin:0 auto}
  .mock-badge{position:absolute;top:-11px;left:22px;background:var(--surface-2);border:1px solid var(--border-2);color:var(--muted-2);font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px}
  .mock-head{display:flex;align-items:baseline;gap:10px;padding-bottom:16px;border-bottom:1px solid var(--border)}
  .mock-sym{font-size:19px;font-weight:800;letter-spacing:-.02em}
  .mock-tf{font-size:12px;color:var(--muted-3)}
  .mrow{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-bottom:1px solid var(--border)}
  .mrow:last-child{border-bottom:0}
  .mrow-k{font-size:13.5px;color:var(--muted)}
  .mrow-v{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
  .mrow-v small{font-weight:500;color:var(--muted-3);font-size:12px;margin-left:6px}
  .mpill{display:inline-block;background:var(--tint);border:1px solid var(--border-2);border-radius:999px;padding:3px 11px;font-size:12.5px;font-weight:700}
```

히어로 `</section>` 뒤에 삽입:

```html
<section class="mock">
  <div class="wrap">
    <div class="mock-frame">
      <span class="mock-badge">예시 화면 — 실제 시세가 아닙니다</span>
      <div class="mock-head">
        <span class="mock-sym">엔비디아 · NVDA</span>
        <span class="mock-tf">일봉 · 최근 600봉 기준</span>
      </div>
      <div class="mrow">
        <span class="mrow-k">국면</span>
        <span class="mrow-v"><span class="mpill">변동성 확장 · 추세 지속</span></span>
      </div>
      <div class="mrow">
        <span class="mrow-k">변동성 예보 (1개월)</span>
        <span class="mrow-v">확대<small>축소 대비 우세</small></span>
      </div>
      <div class="mrow">
        <span class="mrow-k">낙폭 위험 (1개월 −5%)</span>
        <span class="mrow-v">31%<small>도달 확률</small></span>
      </div>
      <div class="mrow">
        <span class="mrow-k">이익목표 도달 (1개월 +5%)</span>
        <span class="mrow-v">44%<small>도달 확률</small></span>
      </div>
      <div class="mrow">
        <span class="mrow-k">확률 R:R</span>
        <span class="mrow-v">1.4<small>도달 ÷ 낙폭</small></span>
      </div>
      <div class="mrow">
        <span class="mrow-k">급변 경보 (20봉 내 2.5σ)</span>
        <span class="mrow-v">있음<small>실적·이벤트 대비</small></span>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: PASS — 13 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add index.html landing.test.js
git commit -m "feat(landing): 제품 모형 — '예시 화면' 명시 + 검증 축만 표시

시안 카드의 '상승 확률 68%'를 국면·변동성 예보·낙폭/도달 확률·R:R로 교체.
실제 시세 오인 방지 배지 부착.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 맞히는 것 / 못 맞히는 것

**Files:**
- Modify: `map/index.html`
- Modify: `map/landing.test.js`

**Interfaces:**
- Consumes: `.wrap`, 토큰
- Produces: `<section class="verdict" id="verified">` — `.vgrid`, `.vcol.can` / `.vcol.cant`, `.vitem`

- [ ] **Step 1: 실패하는 테스트 작성**

`module.exports` 앞에 추가:

```js
test("검증 통과 7축을 실측치와 함께 나열한다", () => {
  const html = read();
  const i = html.indexOf('class="verdict"');
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
    assert.ok(sec.includes(k), `항목 누락: ${k}`);
    assert.ok(sec.includes(v), `수치 누락: ${v} (${k})`);
  }
});

test("못 하는 것을 숨기지 않는다", () => {
  const html = read();
  const i = html.indexOf('class="verdict"');
  const sec = html.slice(i, html.indexOf("</section>", i));
  assert.ok(sec.includes("58.1%"), "방향 실측치 없음");
  assert.ok(sec.includes("60.8%"), "기준선 없음");
  for (const k of ["인터마켓", "내부자", "공매도", "PEAD"]) {
    assert.ok(sec.includes(k), `기각 항목 누락: ${k}`);
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: FAIL — "검증 섹션 없음"

- [ ] **Step 3: 최소 구현**

`</style>` 앞에 CSS 추가:

```css
  .sec{padding:84px 0}
  .sec-alt{background:var(--surface)}
  .sec-eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
  .sec-h2{margin-top:11px;font-size:36px;font-weight:800;letter-spacing:-.03em;line-height:1.25;max-width:680px}
  .sec-lede{margin-top:14px;font-size:15.5px;color:var(--muted);max-width:640px;line-height:1.75}
  .vgrid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:44px}
  .vcol{border:1px solid var(--border);border-radius:var(--r-lg);padding:24px 22px;background:var(--bg)}
  .vcol-h{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:800;padding-bottom:14px;border-bottom:1px solid var(--border)}
  .vcol.cant .vcol-h{color:var(--muted-2)}
  .vitem{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:12px 0;border-bottom:1px solid var(--border)}
  .vitem:last-child{border-bottom:0;padding-bottom:0}
  .vitem-k{font-size:13.5px;color:var(--text)}
  .vitem-k small{display:block;color:var(--muted-3);font-size:11.5px;margin-top:2px}
  .vitem-v{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--accent)}
  .vcol.cant .vitem-k{color:var(--muted)}
  .vcol.cant .vitem-v{color:var(--muted-3)}
  .vnote{margin-top:26px;font-size:13px;color:var(--muted-2);line-height:1.8}
```

모형 `</section>` 뒤에 삽입:

```html
<section class="sec sec-alt verdict" id="verified">
  <div class="wrap">
    <div class="sec-eyebrow">What it can · can't</div>
    <h2 class="sec-h2">맞히는 것과<br>못 맞히는 것을 나눠 적습니다.</h2>
    <p class="sec-lede">
      기술적 분석 도구 대부분이 "맞힌다"고만 말합니다.
      저희는 walk-forward 백테스트로 통과한 것과 떨어진 것을 같은 표에 둡니다.
    </p>

    <div class="vgrid">
      <div class="vcol can">
        <div class="vcol-h">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
          검증을 통과한 것
        </div>
        <div class="vitem"><span class="vitem-k">변동성 예보<small>2주 · 1달 · 2달 확대/축소</small></span><span class="vitem-v">69.0%</span></div>
        <div class="vitem"><span class="vitem-k">낙폭 위험곡선<small>1 · 2 · 3개월</small></span><span class="vitem-v">67~69%</span></div>
        <div class="vitem"><span class="vitem-k">이익목표 도달<small>같은 문턱 상방 확률</small></span><span class="vitem-v">63~65%</span></div>
        <div class="vitem"><span class="vitem-k">급변 경보<small>20봉 내 2σ · 2.5σ · 3σ</small></span><span class="vitem-v">65%</span></div>
        <div class="vitem"><span class="vitem-k">갭 경보<small>주식 · 2.2 / 2.7 / 3.2σ</small></span><span class="vitem-v">63%</span></div>
        <div class="vitem"><span class="vitem-k">확률 캘리브레이션<small>OOS ECE — 표기 60% = 실제 60%</small></span><span class="vitem-v">1.9%p</span></div>
        <div class="vitem"><span class="vitem-k">지지반등 진입 신호<small>횡보장 · 하락추세 배제</small></span><span class="vitem-v">53~56%</span></div>
      </div>

      <div class="vcol cant">
        <div class="vcol-h">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          통과하지 못한 것
        </div>
        <div class="vitem"><span class="vitem-k">방향 예측 (상승 / 하락)<small>"항상 상승" 기준선 60.8% 미달</small></span><span class="vitem-v">58.1%</span></div>
        <div class="vitem"><span class="vitem-k">인터마켓 상관<small>가격 재조합 — 새 정보 0</small></span><span class="vitem-v">기각</span></div>
        <div class="vitem"><span class="vitem-k">내부자 거래 (Form 4)<small>대형 · 중소형 두 유니버스</small></span><span class="vitem-v">기각</span></div>
        <div class="vitem"><span class="vitem-k">공매도 잔고<small>가격 · 모멘텀에 이미 흡수</small></span><span class="vitem-v">기각</span></div>
        <div class="vitem"><span class="vitem-k">PEAD (실적후 드리프트)<small>차익거래로 소멸</small></span><span class="vitem-v">기각</span></div>
      </div>
    </div>

    <p class="vnote">
      방향은 왜 안 맞느냐 — 효율적 시장이기 때문입니다. 다만 <b>변동성은 군집(clustering)</b>합니다.
      큰 변동 뒤엔 큰 변동이, 수축 뒤엔 수축이 옵니다. 그래서 방향은 못 맞혀도 변동폭·낙폭 규모는 예측 가능합니다.
      엔진이 지표 경로와 변동성 리스크 경로를 <b>독립된 두 갈래</b>로 둔 근거입니다.
    </p>
  </div>
</section>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: PASS — 15 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add index.html landing.test.js
git commit -m "feat(landing): 맞히는 것/못 맞히는 것 대비표

검증 통과 7축(수치+표본)과 기각 5항목(방향·인터마켓·내부자·공매도·PEAD)을
같은 표에 배치. 변동성 군집으로 '방향은 못 맞혀도 폭은 맞힌다'를 설명.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 작동 방식 + 검증 방법론

**Files:**
- Modify: `map/index.html`
- Modify: `map/landing.test.js`

**Interfaces:**
- Consumes: `.sec`, `.sec-h2`, `.wrap`
- Produces: `<section class="sec how" id="how">` · `<section class="sec method">`

- [ ] **Step 1: 실패하는 테스트 작성**

`module.exports` 앞에 추가:

```js
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
  const i = html.indexOf('class="sec method"');
  assert.ok(i >= 0, "방법론 섹션 없음");
  const sec = html.slice(i, html.indexOf("</section>", i));
  assert.ok(sec.includes("walk-forward"), "walk-forward 언급 없음");
  assert.ok(sec.includes("기각"), "기각 이력 언급 없음");
  assert.ok(sec.includes("forge-scorecard.html"), "스코어카드 링크 없음");
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: FAIL — "작동 방식 섹션 없음"

- [ ] **Step 3: 최소 구현**

`</style>` 앞에 CSS 추가:

```css
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:44px}
  .step-n{font-size:12px;font-weight:800;color:var(--accent);letter-spacing:.1em}
  .step-t{margin-top:10px;font-size:17px;font-weight:800;letter-spacing:-.02em}
  .step-d{margin-top:9px;font-size:13.5px;color:var(--muted);line-height:1.75}
  .mcards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:44px}
  .mcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:24px 22px}
  .mcard-t{font-size:15px;font-weight:800;letter-spacing:-.02em}
  .mcard-d{margin-top:9px;font-size:13.5px;color:var(--muted);line-height:1.75}
  .lnk{display:inline-flex;align-items:center;gap:6px;margin-top:30px;font-size:14px;font-weight:700;color:var(--accent)}
  .lnk:hover{color:var(--accent-strong)}
```

검증 `</section>` 뒤에 삽입:

```html
<section class="sec how" id="how">
  <div class="wrap">
    <div class="sec-eyebrow">How it works</div>
    <h2 class="sec-h2">3단계면 충분합니다.</h2>
    <div class="steps">
      <div>
        <div class="step-n">01</div>
        <div class="step-t">종목 검색</div>
        <p class="step-d">국내외 주식·암호화폐·ETF 어느 것이든 티커나 이름으로 검색하면 즉시 분석이 시작됩니다.</p>
      </div>
      <div>
        <div class="step-n">02</div>
        <div class="step-t">국면 · 변동성 · 리스크 확인</div>
        <p class="step-d">국면 배지와 변동성 예보, 낙폭·도달 확률과 손익비, 타임프레임 매트릭스, 노드별 해석을 한 화면에서 봅니다.</p>
      </div>
      <div>
        <div class="step-n">03</div>
        <div class="step-t">결과로 검증</div>
        <p class="step-d">예측은 자동 기록되고 실제 결과와 대조됩니다. 검증 성적을 보며 엔진의 신뢰도를 직접 판단하세요.</p>
      </div>
    </div>
  </div>
</section>

<section class="sec sec-alt method">
  <div class="wrap">
    <div class="sec-eyebrow">Methodology</div>
    <h2 class="sec-h2">성적표를 먼저 보여드립니다.</h2>
    <p class="sec-lede">통한 것도, 안 통한 것도 전부 남깁니다. 안 통한 실험도 "여긴 길이 아니다"를 알려주는 자산입니다.</p>
    <div class="mcards">
      <div class="mcard">
        <div class="mcard-t">미래를 참조하지 않습니다</div>
        <p class="mcard-d">walk-forward 방식으로, 각 시점에서 그 이전 데이터만 써서 예측하고 실제 결과와 대조합니다. 미래 데이터가 새어 들어가면 성적은 부풀려집니다.</p>
      </div>
      <div class="mcard">
        <div class="mcard-t">기준선과 나란히 적습니다</div>
        <p class="mcard-d">"항상 상승" 같은 자명한 규칙을 함께 계산해 병기합니다. 기준선을 넘지 못한 항목은 넘지 못했다고 씁니다.</p>
      </div>
      <div class="mcard">
        <div class="mcard-t">기각 이력을 공개합니다</div>
        <p class="mcard-d">검증 관문을 통과하지 못해 버린 축들 — 인터마켓·내부자 거래·공매도 잔고·PEAD·VIX 기간구조 — 을 이유와 함께 기록합니다.</p>
      </div>
    </div>
    <a class="lnk" href="forge-scorecard.html">전체 검증 리포트 보기 →</a>
  </div>
</section>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: PASS — 17 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add index.html landing.test.js
git commit -m "feat(landing): 작동 방식 3단계 + 검증 방법론

02단계 카피를 '상승 확률 확인'에서 '국면·변동성·리스크 확인'으로 교체.
방법론은 walk-forward·기준선 병기·기각 공개 3축.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 요금 + 최종 CTA + 푸터

**Files:**
- Modify: `map/index.html`
- Modify: `map/landing.test.js`

**Interfaces:**
- Consumes: `.sec`, `.btn`, `.wrap`
- Produces: `<section class="sec cta">` · `<footer class="site-footer">`

- [ ] **Step 1: 실패하는 테스트 작성**

`module.exports` 앞에 추가:

```js
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: FAIL — "베타 표기 없음"

- [ ] **Step 3: 최소 구현**

`</style>` 앞에 CSS 추가:

```css
  .cta{text-align:center;background:linear-gradient(180deg,var(--bg),var(--bg-hi))}
  .cta .sec-h2{margin:11px auto 0}
  .cta .sec-lede{margin:14px auto 0}
  .cta-btns{display:flex;gap:11px;justify-content:center;margin-top:32px;flex-wrap:wrap}
  .cta-btns .btn{padding:14px 24px;font-size:15px}
  .cta-note{margin-top:20px;font-size:13px;color:var(--muted-2)}

  .site-footer{background:var(--footer-bg);border-top:1px solid var(--border);padding:52px 0 40px}
  .ft-top{display:flex;gap:56px;flex-wrap:wrap}
  .ft-brand{font-size:17px;font-weight:800;letter-spacing:-.03em}
  .ft-desc{margin-top:11px;font-size:13px;color:var(--muted-2);max-width:330px;line-height:1.75}
  .ft-nav{display:flex;gap:52px;margin-left:auto;flex-wrap:wrap}
  .ft-h{font-size:12px;font-weight:800;color:var(--muted-3);letter-spacing:.06em}
  .ft-nav ul{list-style:none;margin-top:12px;display:grid;gap:9px}
  .ft-nav a{font-size:13.5px;color:var(--muted)}
  .ft-nav a:hover{color:var(--text)}
  .ft-disc{margin-top:44px;padding-top:22px;border-top:1px solid var(--border-2);font-size:12px;color:var(--muted-3);line-height:1.85}
  .ft-disc b{color:var(--muted-2)}
  .ft-copy{margin-top:16px;font-size:12px;color:var(--muted-3)}
```

방법론 `</section>` 뒤에 삽입 (그리고 `</main>` 뒤에 푸터):

```html
<section class="sec cta">
  <div class="wrap">
    <div class="sec-eyebrow">Get started</div>
    <h2 class="sec-h2">지금, 데이터로 판단을 시작하세요.</h2>
    <p class="sec-lede">현재 전체 베타 기간으로 모든 기능을 무료로 쓸 수 있습니다.</p>
    <div class="cta-btns">
      <a class="btn btn-primary" href="forge.html">무료로 시작하기 →</a>
      <a class="btn btn-ghost" href="forge-scorecard.html">검증 성적 보기</a>
    </div>
    <p class="cta-note">가입 절차 없이 바로 분석할 수 있습니다.</p>
  </div>
</section>

</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="ft-top">
      <div>
        <div class="ft-brand" data-brand>나루</div>
        <p class="ft-desc">머니스쿱 리서치팀이 만든 기술적 분석 엔진. 검증을 통과한 것만 수치로 보여줍니다.</p>
      </div>
      <div class="ft-nav">
        <div>
          <div class="ft-h">제품</div>
          <ul>
            <li><a href="forge.html">분석 시작</a></li>
            <li><a href="forge-guide.html">작동 원리</a></li>
            <li><a href="forge-scorecard.html">검증 성적</a></li>
            <li><a href="forge-pricing.html">요금제</a></li>
          </ul>
        </div>
      </div>
    </div>
    <p class="ft-disc">
      <b>투자 유의 안내</b> — <span data-brand>나루</span>는 기술적 분석 정보를 제공하는 참고용 도구입니다.
      모든 분석·확률·신호·목표가는 과거 데이터 기반 산출물로 미래 수익을 보장하지 않으며,
      투자 판단과 그 결과의 책임은 이용자 본인에게 있습니다.
    </p>
    <p class="ft-copy">© 2026 머니스쿱</p>
  </div>
</footer>
```

기존 `</main>` 한 줄은 제거한다 (위 블록이 자체 `</main>`을 포함).

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: PASS — 21 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
git add index.html landing.test.js
git commit -m "feat(landing): 최종 CTA + 푸터 (베타 무료 · 투자 유의 고지)

가격 숫자·카드 언급 없이 '전체 베타 무료'만. 푸터는 실재 페이지 4개만
링크(블로그·문의·약관 제외). 죽은 링크 0 검증 테스트 포함.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 반응형 · 접근성 · 헤드리스 육안 검증

**Files:**
- Modify: `map/index.html`
- Modify: `map/landing.test.js`

**Interfaces:**
- Consumes: 전 섹션의 클래스
- Produces: `@media (max-width:860px)` 블록, `.sr-unit` 스크린리더 규약

- [ ] **Step 1: 실패하는 테스트 작성**

`module.exports` 앞에 추가:

```js
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: FAIL — 860px 미디어쿼리 미매치

- [ ] **Step 3: 최소 구현**

`</style>` 앞에 추가:

```css
  .sr-unit{font-size:.6em;font-weight:700;margin-left:1px}

  @media (max-width:860px){
    .hd-nav{display:none}
    .hero{padding:56px 0 48px}
    .hero-h1{font-size:34px}
    .hero-lede{font-size:15.5px}
    .kpis{grid-template-columns:1fr;gap:11px;margin-top:36px}
    .kpi{display:flex;align-items:baseline;gap:12px;padding:16px 18px}
    .kpi-k{margin-top:0}
    .kpi-n{margin-left:auto;margin-top:0;text-align:right}
    .sec{padding:56px 0}
    .sec-h2{font-size:27px}
    .vgrid,.steps,.mcards{grid-template-columns:1fr}
    .mock-frame{padding:22px 18px 18px}
    .ft-top{gap:32px}
    .ft-nav{margin-left:0}
  }
  @media (max-width:400px){
    .hero-h1{font-size:29px}
    .hero-cta .btn,.cta-btns .btn{width:100%;justify-content:center}
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: PASS — 25 tests

- [ ] **Step 5: 헤드리스 스크린샷 4장으로 육안 확인**

`[[headless-verify-wsl]]` 절차. 라이브러리는 이미 추출돼 있으면 재사용, 없으면 메모리의 deb 세트를 로컬 추출한다.

```bash
cd /home/jschoi0223/projects/vdiportal/map
python3 -m http.server 8123 >/dev/null 2>&1 &
SRV=$!
SHOT=$(find ~/.cache/ms-playwright -name chrome-headless-shell -type f | head -1)
OUT=/tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/b8ce23ba-fa1c-485a-bcbf-3517b2f7bdc1/scratchpad
for spec in "light:1440,2600" "dark:1440,2600" "light-m:390,2600" "dark-m:390,2600"; do
  name=${spec%%:*}; size=${spec##*:}
  LD_LIBRARY_PATH=/tmp/chrlibs "$SHOT" --headless --no-sandbox --disable-gpu \
    --virtual-time-budget=3000 --window-size=$size \
    --screenshot=$OUT/landing-$name.png "http://localhost:8123/index.html"
done
kill $SRV
```

다크 캡처는 URL만으로는 라이트로 뜨므로, 캡처 전 `localStorage`를 세팅할 수 없다면 임시 복사본에서 head 스크립트의 폴백을 `"dark"` 고정으로 바꿔 캡처한다:

```bash
sed 's/? "dark" : "light"/? "dark" : "dark"/' index.html > /tmp/landing-dark.html
cp /tmp/landing-dark.html ./_dark-tmp.html   # 서버 루트에 두고 캡처 후 반드시 삭제
```

캡처한 PNG 4장을 `Read`로 직접 열어 확인한다. **확인 항목:**
- 라이트/다크 양쪽에서 본문·보조 텍스트가 배경에 묻히지 않는가
- 히어로 헤드라인 2줄 줄바꿈이 어색하지 않은가
- KPI 3장이 데스크톱 3열 / 모바일 1열로 정상 전환되는가
- ✓/✕ 2열이 모바일에서 1열로 접히는가
- 마퀴가 가로 스크롤바를 만들지 않는가
- 섹션 간 배경 교차(`sec-alt`)가 자연스러운가

문제가 있으면 CSS를 고치고 재캡처한다. `_dark-tmp.html`은 **반드시 삭제**한다.

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
rm -f _dark-tmp.html
git add index.html landing.test.js
git commit -m "feat(landing): 반응형 + 접근성 + 헤드리스 육안 검증

860px/400px 브레이크포인트, KPI·대비표·단계 카드 1열 전환.
좌측 accent bar 금지·외부 의존성 1개·인라인 SVG 전용 회귀 테스트 추가.
라이트/다크 × 데스크톱/모바일 4장 스크린샷 확인.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: 배포 + 백로그 기록

**Files:**
- Modify: `map/docs/BACKLOG.md`

**Interfaces:**
- Consumes: 완성된 `map/index.html`

- [ ] **Step 1: 전체 테스트 통과 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test landing.test.js`
Expected: PASS — 25 tests, 0 fail

엔진 테스트 회귀도 확인 (이 작업은 엔진을 건드리지 않으므로 전건 통과해야 한다):

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test forge-core.test.js 2>&1 | tail -5`
Expected: `# fail 0`

- [ ] **Step 2: 백로그 기록**

`map/docs/BACKLOG.md`의 `## 🔥 진행 중 / 대기` 절 아래에 한 줄 추가:

```markdown
- ~~**[랜딩] 제품 랜딩 페이지**~~ ✅ 완료(2026-07-22): `map/index.html` — 시안(`Naru Landing.dc.html`) 레이아웃 채용, **서사는 교체**. 시안 히어로의 "방향 적중률 62%"가 스코어카드 실측(58.1%·기준선 60.8% **미달**)과 정면 충돌 → "우리는 방향을 맞힌다고 말하지 않습니다 / 대신 얼마나 움직일지는 맞힙니다"로 재구성. KPI=변동성 69.0%·낙폭 67~69%·ECE 1.9%p. 가격·플랜 제한·"신용카드 불필요" 전량 삭제(베타 무료만). 라이트/다크 양 테마 완전 토큰. 브랜드명 미정 → `BRAND` 상수 1곳 격리. 인증 비활성이라 로그인 미노출·CTA는 forge.html 직행. `landing.test.js` 25건(수치 정합·죽은 링크 0·금지 카피·토큰 패리티). spec `2026-07-22-landing-page-design.md`.
```

- [ ] **Step 3: 커밋 · 푸시**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/docs/BACKLOG.md
git commit -m "docs(landing): 백로그 — 랜딩 페이지 완료 기록

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

- [ ] **Step 4: cafe24 배포**

`index.html` 한 파일만 올린다. **`forge_data.json`·`forge_images.json`·`forge_jobs.json`·`forge_td_key.txt`·`forge_ohlc_cache_*.json`·`map_data.json`·`map_images.json`은 절대 건드리지 않는다** (서버 생성 사용자 데이터).

```bash
cd /home/jschoi0223/projects/vdiportal/map
sshpass -p 'wjdtjd2@' sftp -oBatchMode=no -oStrictHostKeyChecking=no parksvc@parksvc.mycafe24.com <<'EOF'
cd www/map
put index.html
bye
EOF
```

- [ ] **Step 5: 배포 확인**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://parksvc.mycafe24.com/map/
curl -s https://parksvc.mycafe24.com/map/ | grep -c "방향을 맞힌다고"
```

Expected: `200` / `1`

죽은 링크도 실제로 확인한다:

```bash
for p in forge.html forge-guide.html forge-scorecard.html forge-pricing.html; do
  printf "%s " "$p"
  curl -s -o /dev/null -w "%{http_code}\n" "https://parksvc.mycafe24.com/map/$p"
done
```

Expected: 전부 `200`

---

## 자체 점검 결과

**스펙 커버리지:** §2 결정사항 → Task 1(파일·브랜드·테마)·Task 3(서사)·Task 7(카피 사실성)·Task 1(noindex). §4 토큰 → Task 1. §5.1~5.9 각 섹션 → Task 2·3·4·5·6·7. §6 링크 → Task 7 테스트. §7 반응형 → Task 8. §8 접근성 → Task 2(aria-pressed·reduced-motion)·Task 8(sr-unit·대비). §9 YAGNI → 계획에 해당 태스크 없음(의도적). §10 검증 → Task 8 Step 5·Task 9.

**타입/이름 일관성:** `.wrap`·`.btn`/`.btn-primary`/`.btn-ghost`·`.sec`/`.sec-alt`/`.sec-h2`/`.sec-eyebrow`/`.sec-lede`는 Task 2~3에서 정의 후 Task 5~7이 재사용한다. `read()`/`BANNED`/`TOKENS`는 Task 1에서 정의돼 이후 태스크가 쓴다. `data-brand` 주입 규약은 Task 1 정의 → Task 2·7에서 사용.

**알려진 판단:** `color-mix(in srgb, ...)`를 헤더 배경에 쓴다 — 2026 기준 전 상용 브라우저 지원. 미지원 환경에서는 배경이 투명해지므로, 캡처 시 헤더가 비쳐 보이면 `--surface` 불투명 폴백을 선행 선언한다.
