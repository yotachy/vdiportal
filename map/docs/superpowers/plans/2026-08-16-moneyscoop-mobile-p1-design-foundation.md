# 머니스쿱 모바일 P1 — 디자인 기반 + 기존 화면 재스킨 · 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 전체를 시안의 디자인 언어로 갈아입히고 한국어 앱으로 전환한다 — 기능은 늘리지 않는다.

**Architecture:** 새 프레임워크·빌드 도구를 들이지 않는다. 현 구조(classic script + 전역 네임스페이스 + `strings.js` 단일 출처)가 이 디자인을 담을 수 있다. 폰트를 번들하고, 토큰·타이포를 정리한 뒤, 화면을 하나씩 다시 그린다. 한국어 전환은 **줄어들기만 하는 잔여 목록(allowlist)** 으로 화면별로 진행하고 마지막 태스크에서 목록이 빈다.

**Tech Stack:** 바닐라 ES5(`www/**`) · ESM 노드 테스트(`test/**`) · Capacitor(Android) · Pretendard Variable(OFL)

**Spec:** `map/docs/superpowers/specs/2026-08-16-moneyscoop-mobile-p1-design-foundation.md`

**참조(단일 출처):** 화면별 구성·문구 원문은 `map/mobile/docs/DESIGN-INVENTORY.md` §1. 시안 원본은 `map/mobile/docs/design_handoff/`.

## Global Constraints

- **`www/**` 는 ES5.** `var`/`function` 만. `let`·`const`·화살표·`class`·optional chaining·템플릿 리터럴 금지. `test/**` 는 ESM.
- **빌드 도구·외부 라이브러리 금지.** classic `<script src>` 로드 순서가 의미를 갖는다 — `www/index.html` 의 순서를 바꾸지 말 것. 새 파일을 넣으면 소비자보다 **앞**에 넣는다.
- **사용자 가시 문자열은 `www/strings.js` 가 단일 출처.** 화면 소스에 리터럴 금지. 보간은 기존 관례대로 `{n}` 치환(`wMergeDiscarded`·`adQuick` 선례) — 새 보간 기계를 만들지 않는다.
- **지표명은 인터페이스 언어와 무관하게 영어.** `IND` 맵은 번역하지 않는다.
- **색은 `var(--토큰)` 만.** `:root` 밖에 헥스 리터럴 금지(현재 0건 — 이 상태를 유지한다).
- **항목 좌측 세로 컬러 라인 절대 금지.** `border-left`·`box-shadow:inset Npx 0 0` 로 항목을 표시하지 않는다. 선택·활성은 배경색·텍스트색·체크·아웃라인으로만. (프로젝트 전역 규칙)
- **`--neutral`(`#4a5368`)을 텍스트 색으로 쓰지 않는다.** 대비 2.4:1. 점·채움 전용.
- **엘리베이션 그림자 없음.** `box-shadow` 는 선택 링과 지갑 점 inset 에만.
- **차트 내부를 건드리지 않는다.** `draw-layers.js`·`draw-panels.js`·`draw-preds.js`·`chart-draw.js`·`chart-legend.js`·`chart-layout.js`·`chart-zoom.js` 는 P1 범위 밖(P2).
- **엔진(`forge-core.js`·`forge-tools.js`)을 건드리지 않는다.** `www/vendor/` 는 커밋하지 않는 생성물이다.
- **관문:** `cd map && ./tests/run.sh` 전부 통과. 모바일만 빠르게 볼 때는 `./tests/run.sh mobile`. 태스크마다 관문을 돌리고, 실패한 채로 커밋하지 않는다.
- **반응형 4-tier·영어 UI·전문분석 기능은 P1 범위 밖.**

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `www/fonts/PretendardVariable.woff2` | 번들 폰트 (신규) | 1 |
| `www/style.css` | 토큰 · 타이포 8역할 · `@font-face` · 화면 스타일 | 1·2·5·6·7·8 |
| `www/strings.js` | UI 문자열 단일 출처 (한국어) | 3·5·6·7·8 |
| `www/screens/watchlist.js` | 워치리스트 마크업 | 5 |
| `www/screens/wallet.js` | 지갑 마크업 | 6 |
| `www/ticker-picker.js` | 종목 추가 시트 | 7 |
| `www/tier-sheet.js` | 단계 선택 시트 | 7 |
| `www/screens/report.js` | 리포트 — **타이포·문자열만**, 구조 불변 | 8 |
| `www/ui.js` | 공용 조각(자물쇠 아이콘·마크) | 4·7 |
| `android/app/src/main/res/**` | 아이콘 21장 · 적응형 배경색 | 4 |
| `test/style-tokens.test.mjs` | 토큰·타이포·금지 규칙 관문 (신규) | 2 |
| `test/font-bundle.test.mjs` | 폰트 누락 감시 (신규) | 1 |
| `test/strings.test.mjs` | 한국어 전환 관문(반전) · 잔여 목록 | 3·5·6·7·8 |

---

## Task 1: Pretendard 번들 + 폰트 누락 감시

**왜 먼저인가:** 이 앱은 `font-family:Pretendard` 를 선언하면서 폰트를 담고 있지 않았다. 없어도 화면이 멀쩡히 그려져서(시스템 폰트로 조용히 폴백) 아무도 몰랐다. 뒤 태스크가 자간·크기를 시안에 맞추는데, 그 밑의 서체가 기기마다 다르면 맞출 대상이 없다.

**Files:**
- Create: `map/mobile/www/fonts/PretendardVariable.woff2`
- Create: `map/mobile/test/font-bundle.test.mjs`
- Modify: `map/mobile/www/style.css` (`:root` 위에 `@font-face`, `body` 의 `font-family`)

**Interfaces:**
- Produces: `@font-face { font-family:Pretendard; }` — 이후 모든 태스크가 `body` 상속으로 쓴다. 화면 CSS 에서 `font-family` 를 다시 선언하지 않는다.

- [ ] **Step 1: 폰트를 받아 저장소에 넣는다**

```bash
cd map/mobile
mkdir -p www/fonts
curl -fL -o www/fonts/PretendardVariable.woff2 \
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2"
ls -l www/fonts/PretendardVariable.woff2     # 2,057,688 bytes 여야 한다
```

크기가 다르면 멈추고 보고할 것 — 다른 파일을 받았다는 뜻이다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

Create `map/mobile/test/font-bundle.test.mjs`:

```js
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
```

- [ ] **Step 3: 테스트가 실패하는지 본다**

Run: `cd map/mobile && node --test test/font-bundle.test.mjs`
Expected: FAIL — `@font-face 가 없다`

- [ ] **Step 4: `style.css` 를 고친다**

`:root {` 바로 **위**에 넣는다:

```css
/* 번들 폰트 — CDN 을 쓰지 않는다. Capacitor 앱은 https://localhost/ 에서 서빙되고
   네트워크를 보장할 수 없다. 가변 폰트 1개가 400·500·700·800 을 전부 덮으므로,
   무게가 빠져 브라우저가 가짜 볼드를 합성하는 사고가 없다. */
@font-face {
  font-family:Pretendard;
  src:url("fonts/PretendardVariable.woff2") format("woff2-variations");
  font-weight:100 900;
  font-display:block;
}
```

`body` 의 `font-family` 는 그대로 두되(`Pretendard, system-ui, -apple-system, sans-serif`) 폴백은 유지한다 — 폰트가 어떤 이유로 못 실릴 때 글자가 사라지면 안 된다.

`.wl-price`·`.wl-chg` 의 `font-family:ui-monospace,Menlo,monospace;` 를 **삭제**한다. `body` 에 이미 `font-variant-numeric:tabular-nums` 가 있어 자릿수는 유지된다.

- [ ] **Step 5: 테스트가 통과하는지 본다**

Run: `cd map/mobile && node --test test/font-bundle.test.mjs`
Expected: PASS (3건)

- [ ] **Step 6: sync 가 폰트를 안드로이드 자산으로 옮기는지 확인한다**

```bash
cd map/mobile && npm run cap:sync
ls -l android/app/src/main/assets/public/fonts/PretendardVariable.woff2
```

없으면 `capacitor.config.json` 의 `webDir` 이 `www` 인지 확인할 것. 여기서 빠지면 브라우저에서는 멀쩡하고 APK 에서만 시스템 폰트로 나온다.

- [ ] **Step 7: 관문 + 커밋**

```bash
cd map && ./tests/run.sh mobile
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/fonts map/mobile/www/style.css map/mobile/test/font-bundle.test.mjs
git commit -m "feat(mobile): Pretendard 번들 — 선언만 있고 파일이 없던 폰트를 실제로 담는다"
```

---

## Task 2: 디자인 토큰 — 타입 스케일 · `--action` · 금지 규칙 관문

**Files:**
- Create: `map/mobile/test/style-tokens.test.mjs`
- Modify: `map/mobile/www/style.css`

**Interfaces:**
- Produces: 타이포 8역할 CSS 변수 `--fs-headline`·`--fs-title`·`--fs-section`·`--fs-figure`·`--fs-body`·`--fs-sub`·`--fs-caption`·`--fs-overline` 와 짝이 되는 `--ls-*`(letter-spacing)·`--fw-*`(weight). 태스크 5~8 이 화면 CSS 에서 이 변수만 쓴다.
- Produces: `--action` (UI 행동색).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `map/mobile/test/style-tokens.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
const CSS = readFileSync(new URL("../www/style.css", import.meta.url), "utf8");
const ROOT = (CSS.match(/:root\s*\{[\s\S]*?\}/) || [""])[0];
const BODY = CSS.slice(CSS.indexOf("}", CSS.indexOf(":root")) + 1);   // :root 이후 전부

test("타이포 8역할이 토큰으로 정의돼 있다", () => {
  for (const k of ["headline", "title", "section", "figure", "body", "sub", "caption", "overline"])
    assert.match(ROOT, new RegExp("--fs-" + k + "\\s*:"), "--fs-" + k + " 없음");
});

test("화면 CSS 의 font-size 는 토큰만 쓴다 — 4px 폭에 8단계가 뒤섞이던 것을 막는다", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\*[\s\S]*?\*\//g, "");
    const m = code.match(/font-size\s*:\s*([^;}]+)/);
    if (m && !/var\(--fs-/.test(m[1])) bad.push((i + 1) + ": " + m[0].trim());
  });
  assert.deepEqual(bad, [], "토큰 아닌 font-size " + bad.length + "건:\n" + bad.join("\n"));
});

test("색은 토큰만 — :root 밖에 헥스 리터럴이 없다", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/, "");
    (code.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(h => bad.push((i + 1) + ": " + h));
  });
  assert.deepEqual(bad, [], "하드코딩 헥스 " + bad.length + "건:\n" + bad.join("\n"));
});

test("항목 좌측 세로 컬러 라인이 없다 — 프로젝트 전역 금지", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\*[\s\S]*?\*\//g, "");
    if (/border-left\s*:\s*[2-9]/.test(code)) bad.push((i + 1) + ": " + code.trim());
    if (/box-shadow\s*:\s*inset\s+[1-9][0-9.]*px\s+0\s+0/.test(code)) bad.push((i + 1) + ": " + code.trim());
  });
  assert.deepEqual(bad, [], "좌측 accent bar " + bad.length + "건:\n" + bad.join("\n"));
});

test("--neutral 은 텍스트 색으로 쓰이지 않는다 — 대비 2.4:1", () => {
  const bad = [];
  BODY.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\*[\s\S]*?\*\//g, "");
    if (/(^|[^-])\bcolor\s*:\s*var\(--neutral\)/.test(code)) bad.push((i + 1) + ": " + code.trim());
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
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `cd map/mobile && node --test test/style-tokens.test.mjs`
Expected: FAIL — `--fs-headline 없음`, 그리고 `토큰 아닌 font-size` 다수

- [ ] **Step 3: `:root` 에 타이포·행동색 토큰을 넣는다**

`--pred2:#b892f5;` 줄을 아래로 바꾼다:

```css
  /* --pred2 는 차트 전용이다(chart-draw.js 의 2차 예측선). UI 행동색과 값이 같지만 토큰을
     나눠 둔다 — 하나로 두면 버튼 색을 조정할 때 차트 예측선이 말없이 따라 움직인다. */
  --pred2:#b892f5;
  --action:#b892f5;

  /* 타이포 8역할. 기존 .rp-* 는 4px 폭 안에 8단계(11·11.5·12·12.5·13·13.5·14·15)가
     뒤섞여 위계가 무너져 있었다. 새 크기를 임의로 추가하지 말 것 — 관문이 막는다. */
  --fs-headline:44px;  --fw-headline:800; --ls-headline:-0.05em;
  --fs-title:22px;     --fw-title:800;    --ls-title:-0.04em;
  --fs-section:17px;   --fw-section:800;  --ls-section:-0.03em;
  --fs-figure:29px;    --fw-figure:700;   --ls-figure:-0.045em;
  --fs-body:13.5px;    --fw-body:500;     --ls-body:-0.01em;
  --fs-sub:12px;       --fw-sub:400;      --ls-sub:-0.01em;
  --fs-caption:11.5px; --fw-caption:400;  --ls-caption:-0.01em;
  --fs-overline:11px;  --fw-overline:700; --ls-overline:0.05em;
```

- [ ] **Step 4: 기존 `font-size` 를 토큰으로 옮긴다**

`:root` 이후 모든 `font-size:Npx` 를 아래 표대로 바꾼다. **크기를 눈대중으로 고르지 말고 이 표를 쓴다.**

| 기존 | 바꿀 토큰 |
|---|---|
| 52px · 44px | `var(--fs-headline)` |
| 29px · 22px | `var(--fs-figure)` (수치) / `var(--fs-title)` (제목) — 해당 규칙이 제목이면 title |
| 16px · 15px | `var(--fs-section)` |
| 14px · 13.5px · 13px | `var(--fs-body)` |
| 12.5px · 12px | `var(--fs-sub)` |
| 11.5px · 11px | `var(--fs-caption)` |
| 10.5px · 10px · 9.5px | `var(--fs-caption)` |
| 오버라인 클래스(`.overline`) | `var(--fs-overline)` |

`22px` 이 제목인지 수치인지는 **선택자 이름으로 판단한다** — `-title`·`-head` 가 들어가면 title, `-bal`·`-price`·`-num`·`-val` 이면 figure. 애매하면 title.

10.5·10·9.5px 를 caption(11.5px)으로 올리면 그 줄이 커진다. **이것이 의도다** — 시안의 최소 크기가 11.5px 이고, 그보다 작은 글자는 위계가 아니라 사고였다.

- [ ] **Step 5: 테스트가 통과하는지 본다**

Run: `cd map/mobile && node --test test/style-tokens.test.mjs`
Expected: PASS (6건)

- [ ] **Step 6: 관문 + 커밋**

```bash
cd map && ./tests/run.sh mobile
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/style.css map/mobile/test/style-tokens.test.mjs
git commit -m "feat(mobile): 타이포 8역할 토큰화 + --action 분리 + 금지 규칙 관문"
```

---

## Task 3: 한국어 전환 인프라 — 관문 반전 · 잔여 목록 · 티어명 통일

**왜 인프라가 먼저인가:** 지금 `strings.test.mjs` 는 *"UI 문자열에 한글이 남아 있지 않다 — 시안은 영어다"* 를 강제한다. 이 관문이 살아 있는 한 어떤 태스크도 한국어를 넣을 수 없다. 방향을 뒤집되, 한 번에 204개를 번역하면 리뷰가 불가능하므로 **줄어들기만 하는 잔여 목록**으로 화면별 진행을 허용한다.

**Files:**
- Modify: `map/mobile/test/strings.test.mjs`
- Modify: `map/mobile/www/strings.js`

**Interfaces:**
- Produces: `test/strings.test.mjs` 의 `PENDING_EN` 배열 — 아직 영어인 키 목록. 태스크 5~8 이 각자 담당분을 **지우기만** 한다. 추가는 실패로 취급한다.

- [ ] **Step 1: 관문을 반전하고 잔여 목록을 만든다**

`test/strings.test.mjs` 의 `"UI 문자열에 한글이 남아 있지 않다 — 시안은 영어다"` 테스트를 통째로 아래로 교체한다:

```js
// P1 에서 방향이 뒤집혔다 — 앱은 한국어가 된다(시안 2026-08-16 번들, README "UI 는 한글 단독").
// 204개를 한 커밋에 번역하면 리뷰가 불가능하므로, 아직 영어인 키를 여기 적어두고 화면별로 지운다.
// 이 목록은 **줄어들기만 한다.** 새 키를 여기 넣는 것은 번역을 미루는 것이라 실패로 본다.
const PENDING_EN = [];   // Step 2 에서 실제 키 목록으로 채운다

test("UI 문자열은 한국어다 — 잔여 목록에 적힌 것만 예외", () => {
  const en = Object.keys(S.t).filter(k => !/[가-힣]/.test(String(S.t[k])));
  const unlisted = en.filter(k => PENDING_EN.indexOf(k) < 0);
  assert.deepEqual(unlisted, [],
    "번역 안 됐는데 잔여 목록에도 없는 키 " + unlisted.length + "건: " + unlisted.join(", "));
  const stale = PENDING_EN.filter(k => en.indexOf(k) < 0);
  assert.deepEqual(stale, [],
    "이미 번역됐는데 잔여 목록에 남은 키(목록을 지울 것) " + stale.length + "건: " + stale.join(", "));
});

test("지표명은 계속 영어다 — 인터페이스 언어와 무관하다는 명시 규칙", () => {
  const bad = Object.keys(S.IND).filter(k => /[가-힣]/.test(String(S.IND[k])));
  assert.deepEqual(bad, [], "한글이 섞인 지표명: " + bad.join(", "));
});
```

> **잔여 목록의 양방향 검사가 핵심이다.** 한쪽만 있으면 "번역했는데 목록에서 안 지운" 경우를 못 잡고, 목록이 영원히 남아 다음 사람이 무엇이 남았는지 알 수 없게 된다.

또한 `"화면 소스에 UI 한글 문자열이 남아 있지 않다"` 테스트는 **이름과 의도를 바꾼다** — 이제 화면 소스에 한글이 있으면 그것은 `strings.js` 를 우회한 리터럴이다:

```js
test("화면 소스에 문자열 리터럴이 박혀 있지 않다 — 한글이든 영문 문장이든", () => {
```

본문의 `.filter(s => /[가-힣]/.test(s))` 는 그대로 둔다(한글 리터럴 검출). 영문 리터럴까지 잡으려 하면 CSS 클래스명·키 이름이 걸려 잡음이 된다 — 한글만 본다.

- [ ] **Step 2: 목록을 실제 키로 채우고 테스트가 통과하는지 본다**

```bash
cd map/mobile
node -e 'const S=require("./www/strings.js");console.log(JSON.stringify(Object.keys(S.t).filter(k=>!/[가-힣]/.test(String(S.t[k])))))'
```

출력(204개 전부일 것)을 `PENDING_EN` 에 넣는다. 그다음:

Run: `node --test test/strings.test.mjs`
Expected: PASS — 아직 아무것도 번역 안 했지만 전부 목록에 있으므로 통과한다

- [ ] **Step 3: 티어명 불일치를 잡는 테스트를 쓴다**

같은 파일에 추가:

```js
// 같은 단계를 시트·리포트에서는 "Full", 지갑·온보딩에서는 "Deep analysis" 로 부르고 있었다.
// 이 테스트가 없었기 때문에 두 이름이 갈렸고, 3단계 체계에서 "Full" 위에 전문분석이 오면
// 말 자체가 성립하지 않는다.
test("한 단계는 한 이름으로 불린다", () => {
  const deep = [S.t.tsFull, S.t.rpTierFull, S.t.walDeep, S.t.obCostFull].map(s => String(s).toLowerCase());
  const uniq = Array.from(new Set(deep.map(s => s.replace(/\s*(분석|analysis)\s*$/, "").trim())));
  assert.equal(uniq.length, 1, "심화분석이 여러 이름으로 불린다: " + JSON.stringify(deep));
});
```

- [ ] **Step 4: 테스트가 실패하는지 본다**

Run: `node --test test/strings.test.mjs`
Expected: FAIL — `심화분석이 여러 이름으로 불린다: ["full","full","deep","deep"]`

- [ ] **Step 5: 티어명을 통일한다**

`strings.js` 에서:

```js
    rpTierFull: "DEEP", rpTierCountFull: "32 indicators · daily, weekly, monthly",
    ...
    tsTitle: "Analyse ", tsBasic: "Basic", tsFull: "Deep", tsCustom: "Pro",
    tsFullDesc: "All 32 indicators · daily, weekly, monthly",
    tsCustomDesc: "All 32 + your weights",
    tsFullPreview: "32 · D·W·M",
```

`tsCustom` 은 `"Custom"` → `"Pro"` 로 함께 바꾼다(시안의 전문분석). `tsSoon`("Coming soon")은 **P1 에서 유지한다** — 전문분석은 아직 잠겨 있고, 잠금 표시는 태스크 7 이 담당한다.

- [ ] **Step 6: 테스트가 통과하는지 본다**

Run: `node --test test/strings.test.mjs`
Expected: PASS

- [ ] **Step 7: 관문 + 커밋**

```bash
cd map && ./tests/run.sh mobile
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/test/strings.test.mjs map/mobile/www/strings.js
git commit -m "test(mobile): 한국어 전환 관문 반전 + 잔여 목록 · 티어명 Full/Deep 갈림 수정"
```

---

## Task 4: 아이콘 · 스플래시 · 헤더 마크

**Files:**
- Modify: `map/mobile/android/app/src/main/res/mipmap-*/ic_launcher.png` (5)
- Modify: `map/mobile/android/app/src/main/res/mipmap-*/ic_launcher_foreground.png` (5)
- Modify: `map/mobile/android/app/src/main/res/drawable*/splash.png` (11)
- Modify: `map/mobile/android/app/src/main/res/values/ic_launcher_background.xml`
- Modify: `map/mobile/www/ui.js` (마크 SVG)
- Modify: `map/mobile/www/screens/watchlist.js` (`.wl-brand-mark` 채우기)

**Interfaces:**
- Produces: `MSUi.scoopMark(fillPct)` → 스쿱 마크 인라인 SVG 문자열. 태스크 6(지갑 지급 연출)이 같은 함수를 쓴다.

- [ ] **Step 1: 에셋을 복사한다**

```bash
cd map/mobile
cp -r docs/design_handoff/assets/icon/. android/app/src/main/res/
cp -r docs/design_handoff/assets/splash/. android/app/src/main/res/
git status --short android/app/src/main/res | head -30    # 21개 파일이 M 으로 보여야 한다
```

- [ ] **Step 2: 적응형 아이콘 배경색을 고친다**

`android/app/src/main/res/values/ic_launcher_background.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- 다크 단독 앱인데 아이콘 배경만 흰색이라 런처에서 혼자 번쩍였다. 시안 결정(#0a0d12 = --bg). -->
    <color name="ic_launcher_background">#0a0d12</color>
</resources>
```

파일이 없으면 만든다. 있으면 `#FFFFFF` 를 위 값으로 바꾼다.

- [ ] **Step 3: 마크 벡터를 찾는다**

```bash
cd map/mobile
grep -n "msFill\|clipPath" docs/design_handoff/support.js | head -20
```

시안의 스쿱 마크는 원형 채움(`clip-path`) 구조다. `support.js` 에서 마크의 원·채움 기하를 확인하고, 못 찾으면 목업 HTML 에서 `grep -n 'wl-brand-mark\|msFill' "docs/design_handoff/MoneyScoop 동선.dc.html"` 로 인라인 SVG 를 찾는다.

- [ ] **Step 4: 실패하는 테스트를 쓴다**

**새 파일**을 만든다 — 기존 `layout.test.mjs` 는 `layout.js` 만 import 하므로 `MSUi` 도 `readFileSync` 도 없다. 남의 파일에 import 를 덧붙이는 대신 P1 의 공용 조각 관문을 따로 둔다(태스크 7 도 여기 쓴다).

Create `map/mobile/test/ui-marks.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSUi = require("../www/ui.js");
const WATCHLIST = readFileSync(new URL("../www/screens/watchlist.js", import.meta.url), "utf8");

test("헤더 마크가 비어 있지 않다 — 22px 컨테이너만 있고 내용이 없었다", () => {
  assert.match(WATCHLIST, /MSUi\.scoopMark\s*\(/, "헤더가 스쿱 마크를 그리지 않는다");
});

test("스쿱 마크는 채움 비율을 받는다 — 지갑 잔량 게이지가 같은 함수를 쓴다", () => {
  assert.match(MSUi.scoopMark(42), /<svg/, "SVG 를 돌려주지 않는다");
  assert.notEqual(MSUi.scoopMark(0), MSUi.scoopMark(100), "채움 비율이 결과를 바꾸지 않는다");
});

test("같은 채움 비율은 같은 결과를 준다 — 렌더마다 흔들리지 않는다", () => {
  assert.equal(MSUi.scoopMark(42), MSUi.scoopMark(42));
});
```

> `ui.js` 는 `document` 를 로드 시점에 만지지 않으므로 노드에서 `require` 된다(확인됨). `scoopMark`·`lockIcon` 은 순수 문자열 함수로 유지할 것 — DOM 을 쓰기 시작하면 이 관문이 죽는다.

- [ ] **Step 5: 테스트가 실패하는지 본다**

Run: `cd map/mobile && node --test test/layout.test.mjs`
Expected: FAIL — `MSUi.scoopMark is not a function`

- [ ] **Step 6: `ui.js` 에 마크를 넣는다**

`readToken` 옆(팩토리 안, `return` 앞)에 추가하고 `return` 객체에 `scoopMark: scoopMark` 를 더한다:

```js
  // 스쿱 마크 — 원 안이 아래에서 위로 차오르는 형태. 채움 비율(0~100)로 잔량·지급 연출을
  // 같은 그림 하나로 표현한다. 48px 런처 아이콘만 일부러 꽉 찬 원을 쓴다(부분 채움이 그
  // 크기에서 얼룩으로 보인다) — 앱 내 마크와 다른 유일한 지점이라 되돌리지 말 것.
  function scoopMark(fillPct) {
    var p = Math.max(0, Math.min(100, fillPct == null ? 42 : fillPct));
    var y = 22 - (p / 100) * 20;   // 24 뷰박스 기준, 원 안쪽 높이 20
    var id = "msFill" + Math.round(p);
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">' +
      '<clipPath id="' + id + '"><rect x="0" y="' + y.toFixed(1) + '" width="24" height="24"/></clipPath>' +
      '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>' +
      '<circle cx="12" cy="12" r="9" fill="currentColor" clip-path="url(#' + id + ')"/></svg>';
  }
```

`screens/watchlist.js` 의 헤더에서 `.wl-brand-mark` 를 만드는 자리에 넣는다:

```js
      var mark = MSUi.el("span", "wl-brand-mark");
      mark.innerHTML = MSUi.scoopMark(42);
```

- [ ] **Step 7: 테스트가 통과하는지 본다**

Run: `cd map/mobile && node --test test/layout.test.mjs`
Expected: PASS

- [ ] **Step 8: 관문 + 커밋**

```bash
cd map && ./tests/run.sh mobile
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/android/app/src/main/res map/mobile/www/ui.js map/mobile/www/screens/watchlist.js
git commit -m "feat(mobile): 아이콘·스플래시 21장 교체 + 적응형 배경 #0a0d12 + 빈 헤더 마크 채움"
```

---

## Task 5: 워치리스트 재스킨 (시안 14a)

**Files:**
- Modify: `map/mobile/www/screens/watchlist.js`
- Modify: `map/mobile/www/style.css` (`.wl-*`)
- Modify: `map/mobile/www/strings.js` (`wl*` 한국어)
- Modify: `map/mobile/test/strings.test.mjs` (`PENDING_EN` 에서 `wl*` 제거)

**Interfaces:**
- Consumes: `MSUi.scoopMark(fillPct)` (태스크 4), `--fs-*`/`--action` 토큰 (태스크 2), `PENDING_EN` (태스크 3).

**구성·문구의 단일 출처:** `map/mobile/docs/DESIGN-INVENTORY.md` §1 의 `### 14a` 항목. 문구는 거기 적힌 원문을 **그대로** 쓴다.

**이번에 담지 않는 것 (경계):**
- 상단의 **"어제 본 예측 3건" 결과 카드는 P3** 다. 자리를 비워두지 말고 **"오늘" 섹션이 최상단**인 화면을 그린다 — 빈 껍데기는 로딩 실패로 읽힌다.
- 확신 배지를 목록에 넣지 않는다(판정이 새면 리포트를 열 이유가 사라진다).

- [ ] **Step 1: 기존 상태 처리를 보존하는 테스트를 먼저 쓴다**

마크업을 다시 쓰는 작업이라 **여기가 가장 잘 깨진다.** `map/mobile/test/strings.test.mjs` 에 추가한다 — 이 파일이 이미 `S`(strings) 를 import 하고 있고, 검사 대상이 문자열의 생존이다.

```js
// 재스킨은 마크업을 통째로 다시 쓴다. 시안이 그리지 않은 상태(빈 목록·검색 결과 없음·
// 스캔 중·스캔 실패)가 그 과정에 조용히 사라지는 것을 막는다 — 시안에 없다는 것은
// "지워도 된다"가 아니라 "그려지지 않았다"는 뜻이다.
test("시안에 없는 워치리스트 상태 문구가 재스킨 후에도 살아 있다", () => {
  const gone = ["wlEmpty", "wlEmptyHint", "wlNoMatch", "wlScanning", "wlScanFail"]
    .filter(k => !(S.t[k] && String(S.t[k]).length));
  assert.deepEqual(gone, [], "사라진 상태 문구: " + gone.join(", "));
});
```

**먼저 실제 키 이름을 확인한다** — 위 다섯 개는 예시이고 저장소의 실제 이름과 다를 수 있다:

```bash
cd map/mobile && grep -n "wl[A-Z][A-Za-z]*:" www/strings.js
```

빈 목록·검색 결과 없음·스캔 중·스캔 실패에 해당하는 **실제 키**로 배열을 채운다. 없는 키를 적으면 이 테스트가 즉시 실패하므로 지어낼 수 없다.

- [ ] **Step 2: 테스트를 돌려 현재 상태를 확인한다**

Run: `cd map/mobile && node --test test/strings.test.mjs`
Expected: PASS — 아직 재스킨 전이므로 통과한다. 이 테스트는 재스킨 **후**에 깨지는지를 보는 안전망이다

- [ ] **Step 3: `wl*` 문자열을 한국어로 바꾼다**

`DESIGN-INVENTORY.md` §1 `### 14a` 의 "문구" 줄이 원문이다. 예:

```js
    wlToday: "오늘",
    wlScan: "스캔",
    wlAdd: "＋ 종목 추가",
```

인벤토리에 없는 상태 문구(빈 목록·스캔 실패 등)는 시안에 안 그려져 있으므로 **기존 영어 문장을 그대로 번역**한다. 새 의미를 만들지 않는다.

- [ ] **Step 4: 마크업과 스타일을 시안대로 다시 그린다**

`DESIGN-INVENTORY.md` §1 `### 14a` 의 "구성" 순서를 따른다:
헤더(워드마크 + 스쿱 필) → "오늘" 섹션 헤더 + 스캔 버튼 → 종목 행 → `＋ 종목 추가` → 하단 탭.

읽음 상태 3종은 클래스로 구분한다 — 안 읽음 `.wl-dot.unread`(`var(--action)` 채움) / 읽음 `.wl-dot.read`(빈 링) / 오래됨 `.wl-dot.stale`(`var(--ink-5)`).

`font-size` 는 태스크 2 의 토큰만 쓴다. 행 높이 64px, 화면 좌우 여백 20px, 탭 영역 최소 44px.

- [ ] **Step 5: `PENDING_EN` 에서 `wl*` 키를 지운다**

`test/strings.test.mjs` 의 `PENDING_EN` 배열에서 이번에 번역한 키를 **삭제**한다. 남겨두면 `stale` 검사가 실패한다.

- [ ] **Step 6: 관문**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS 전부

- [ ] **Step 7: 눈으로 확인한다**

`headless-verify-wsl` 절차로 워치리스트를 390px·411px 폭에서 찍어 `docs/design_handoff` 의 14a 와 나란히 본다.

- [ ] **Step 8: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/screens/watchlist.js map/mobile/www/style.css map/mobile/www/strings.js \
        map/mobile/test/strings.test.mjs map/mobile/test/watchlist-model.test.mjs
git commit -m "feat(mobile): 워치리스트 재스킨(시안 14a) + 한국어 — 결과 카드 자리는 P3"
```

---

## Task 6: 지갑 재스킨 (시안 10b)

**Files:**
- Modify: `map/mobile/www/screens/wallet.js`
- Modify: `map/mobile/www/style.css` (`.wal-*`, `.w-*`)
- Modify: `map/mobile/www/strings.js` (`wal*`·`ad*`·`w*` 한국어)
- Modify: `map/mobile/test/strings.test.mjs` (`PENDING_EN` 축소)

**Interfaces:**
- Consumes: `MSUi.scoopMark(fillPct)` (태스크 4) — 잔량 게이지에 쓴다.

**구성·문구의 단일 출처:** `DESIGN-INVENTORY.md` §1 `### 10b`.

**반드시 지킬 것:**
- **"하나 더 받기"가 출석과 같은 시각적 덩어리**다. 별도 카드로 떼지 말 것 — 세 진입점 중 성공률이 가장 높은 배치라는 것이 시안의 판단이다.
- 광고 행은 **8d 구현이 이미 있다.** 다시 만들지 말고 스타일만 바꾼다. `+{n}` 은 `adConfig()` 의 `reward` 에서 온다(리터럴 금지 — 이미 그렇게 되어 있다).
- **언어 세그는 P5.** 이번에 자리를 만들지 않는다.
- 엔진 버전 줄(`walEngine`)은 고지문 아래에 유지한다.
- 8b·8c·8d 가 쌓은 실패 문구(`walUnavailable`·`wMerged`·`walCapped`·`adPending`·`adCooldown`·`adDailyDone`·`adLowBalance`·`adFailed`)를 하나도 잃지 않는다.

- [ ] **Step 1: 상태 보존 테스트를 먼저 쓴다 — 두 파일로 나뉜다**

문자열 생존은 `strings.test.mjs`(이미 `S` 를 import 한다)에, 소스 계약은 `wallet-screens.test.mjs`(이미 `WALLET_SCR` 로 소스를 읽어둔다)에 넣는다. 남의 파일에 없는 import 를 덧붙이지 않는다.

`test/strings.test.mjs` 에 추가:

```js
// 8b·8c·8d 세 라운드가 쌓아온 실패·경계 문구다. 재스킨이 마크업을 다시 쓰면서
// 이 분기들이 함께 쓸려나가는 것이 이 태스크의 가장 큰 위험이다.
test("지갑의 상태 문구가 재스킨 후에도 전부 살아 있다", () => {
  const gone = ["walUnavailable", "wMerged", "walCapped", "adPending", "adCooldown",
                "adDailyDone", "adLowBalance", "adFailed", "walNoCashValue", "walEngine"]
    .filter(k => !(S.t[k] && String(S.t[k]).length));
  assert.deepEqual(gone, [], "사라진 지갑 상태 문구: " + gone.join(", "));
});
```

`test/wallet-screens.test.mjs` 에 추가(`WALLET_SCR` 은 이 파일 상단에 이미 있다):

```js
test("광고 보상 수치는 여전히 설정에서 온다 — 리터럴로 되돌아가지 않았다", () => {
  assert.match(WALLET_SCR, /adCfg\.quick\.reward/, "quick 보상이 설정에서 오지 않는다");
  assert.match(WALLET_SCR, /adCfg\.full\.reward/, "full 보상이 설정에서 오지 않는다");
  assert.doesNotMatch(WALLET_SCR, /["'`]\+[13]["'`]/,
    "보상이 리터럴로 박혔다 — 콘솔·ad_units.json·문자열 세 곳이 한 숫자의 진실원이 된다");
});
```

- [ ] **Step 2: 테스트를 돌린다**

Run: `cd map/mobile && node --test test/wallet-screens.test.mjs`
Expected: PASS — 재스킨 후에도 통과해야 한다

- [ ] **Step 3: 로그인 문구를 서버 상태로 분기한다**

시안 10b 는 *"로그인이 아직 준비되지 않아, 앱을 지우면 스쿱도 사라집니다"* 를 고정 문구로 쓴다. 그러나 구글 로그인은 8c 에서 구현됐고 설정 파일 업로드만 남았다 — 켜지는 순간 이 문장이 거짓이 된다.

`strings.js` 에 세 문구를 둔다:

```js
    walAcctNoLogin: "로그인이 아직 준비되지 않아, 앱을 지우면 스쿱도 사라집니다.",
    walAcctAnon: "이 기기에만 저장됩니다. 로그인하면 계정에 남습니다.",
    walAcctSignedIn: "계정에 저장됩니다.",
```

`screens/wallet.js` 는 로그인 기능의 가용 여부와 로그인 상태를 보고 고른다. 판단 근거는 **이미 있는 것을 쓴다** — 로그인 가용 여부를 알려주는 응답 필드를 `wallet-http.js`/`api.js` 에서 확인하고(`grep -n "auth\|signin\|google" www/wallet-http.js`), 알 수 없으면 `walAcctNoLogin` 으로 떨어진다. **모를 때 "계정에 저장됩니다"라고 말하지 않는다.**

- [ ] **Step 4: 문자열을 한국어로 바꾸고 마크업을 다시 그린다**

`DESIGN-INVENTORY.md` §1 `### 10b` 의 구성 순서:
"스쿱" 제목 → 잔량 카드(수치 + "최대 20" + 진행바 + "심화분석 3번 또는 전문분석 1번") → **"버는 곳"**(출석 + "하나 더 받기" 한 덩어리 / 짧은 광고 / 7일 연속 상자) → **"쓰는 곳"** → **"계정 · 설정"**.

잔량 게이지는 `MSUi.scoopMark(잔량/상한*100)` 을 쓴다.

- [ ] **Step 5: `PENDING_EN` 축소 + 관문**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS 전부

- [ ] **Step 6: 눈으로 확인 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/screens/wallet.js map/mobile/www/style.css map/mobile/www/strings.js \
        map/mobile/test/strings.test.mjs map/mobile/test/wallet-screens.test.mjs
git commit -m "feat(mobile): 지갑 재스킨(시안 10b) + 한국어 — 로그인 문구를 서버 상태로 분기"
```

---

## Task 7: 시트 2종 — 종목 추가(12a) · 단계 선택(6b)

**Files:**
- Modify: `map/mobile/www/ticker-picker.js`
- Modify: `map/mobile/www/tier-sheet.js`
- Modify: `map/mobile/www/style.css` (`.sheet-*`, `.tp-*`, `.ts-*`)
- Modify: `map/mobile/www/strings.js` (`tp*`·`ts*` 한국어)
- Modify: `map/mobile/test/strings.test.mjs`

**Interfaces:**
- Produces: `MSUi.lockIcon()` → 14×14 자물쇠 SVG. **잠긴 지표·종목·티어가 전부 같은 아이콘을 쓴다**(시안 지정).

**구성·문구의 단일 출처:** `DESIGN-INVENTORY.md` §1 `### 12a` · `### 6b`.

**반드시 지킬 것:**
- **칩 그리드가 검색창보다 위**다. 초심자는 티커를 모른다. 순서를 뒤집지 말 것.
- 이미 담은 종목은 목록에서 **지우지 않고 자물쇠로 표시**한다(사라지면 "왜 없지"가 된다).
- 단계 선택 시트의 **전문분석 행은 잠금 표시**로 둔다. P2 가 연다.

- [ ] **Step 1: 자물쇠 아이콘과 티어 3색 테스트를 쓴다**

태스크 4 가 만든 `map/mobile/test/ui-marks.test.mjs` 에 추가한다(`MSUi`·`readFileSync` 가 이미 있다). 파일 상단에 두 줄을 더한다:

```js
const PICKER = readFileSync(new URL("../www/ticker-picker.js", import.meta.url), "utf8");
const TIER = readFileSync(new URL("../www/tier-sheet.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../www/style.css", import.meta.url), "utf8");
```

```js
// 시안은 잠긴 지표·종목·티어에 같은 자물쇠 하나를 쓰라고 지정한다. 화면마다 다른 자물쇠를
// 그리면 "잠김"이 세 가지 다른 뜻처럼 보인다.
test("자물쇠는 한 곳에서 나온다 — 화면마다 다시 그리지 않는다", () => {
  assert.match(MSUi.lockIcon(), /<svg[^>]*viewBox="0 0 14 14"/, "14×14 규격이 아니다");
  const drawnLocally = [["ticker-picker.js", PICKER], ["tier-sheet.js", TIER]]
    .filter(p => /rect[^>]*rx="1\.6"/.test(p[1]))
    .map(p => p[0]);
  assert.deepEqual(drawnLocally, [], "자물쇠를 직접 그린 파일: " + drawnLocally.join(", ") +
    " — MSUi.lockIcon() 을 쓸 것");
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
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `cd map/mobile && node --test test/layout.test.mjs`
Expected: FAIL — `MSUi.lockIcon is not a function`

- [ ] **Step 3: `ui.js` 에 자물쇠를 넣는다**

`scoopMark` 옆에 추가하고 `return` 객체에 `lockIcon: lockIcon` 을 더한다:

```js
  // 잠김 표시 — 잠긴 지표(P2)·이미 담은 종목·잠긴 티어가 전부 이 하나를 쓴다.
  function lockIcon() {
    return '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" ' +
      'stroke="currentColor" stroke-width="1.4" aria-hidden="true">' +
      '<rect x="2.5" y="6" width="9" height="6.5" rx="1.6"/>' +
      '<path d="M4.75 6V4.4a2.25 2.25 0 0 1 4.5 0V6"/></svg>';
  }
```

- [ ] **Step 4: 테스트가 통과하는지 본다**

Run: `cd map/mobile && node --test test/layout.test.mjs`
Expected: PASS

- [ ] **Step 5: 시트 2종을 시안대로 다시 그린다**

**종목 추가(12a)**: 배경 딤 → 하단 시트(상단 라운드 28) → 제목 "어떤 종목을 볼까요?" → 슬롯 안내 → **칩 그리드**("많이 보는 종목") → 검색창 → 자물쇠 설명문 → 버튼.

**단계 선택(6b)**: 제목 "얼마나 정밀하게?" → 티어 3행. 전문분석 행에 `MSUi.lockIcon()` + `tsSoon`.

- [ ] **Step 6: `PENDING_EN` 축소 + 관문 + 커밋**

```bash
cd map && ./tests/run.sh mobile
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/ticker-picker.js map/mobile/www/tier-sheet.js map/mobile/www/ui.js \
        map/mobile/www/style.css map/mobile/www/strings.js \
        map/mobile/test/strings.test.mjs map/mobile/test/layout.test.mjs
git commit -m "feat(mobile): 시트 2종 재스킨(12a·6b) + 자물쇠 단일 출처 — 전문분석은 잠금"
```

---

## Task 8: 리포트 타이포 · 남은 문자열 한국어 — 구조 불변

**왜 필요한가:** 리포트는 이 앱의 본 화면이다. P1 이 나머지만 새 옷을 입히고 본 화면을 옛 스타일로 두면 "메인 화면만 빼고 개편"이 된다. **정보 구조는 P2 가 바꾸므로 여기서는 손대지 않는다** — 크기·굵기·자간·색 토큰·문자열만 옮긴다.

**Files:**
- Modify: `map/mobile/www/screens/report.js` (문자열 참조만 — 마크업 구조 불변)
- Modify: `map/mobile/www/style.css` (`.rp-*`)
- Modify: `map/mobile/www/strings.js` (남은 키 전부)
- Modify: `map/mobile/test/strings.test.mjs` (`PENDING_EN` 을 빈 배열로)

**반드시 지킬 것:**
- **판정 강도를 바꾸지 않는다.** `rpBullish`="Bullish" 를 한국어로 옮길 때 "상승"과 "상승 우세"는 강도가 다르다. `cxBullDiv`·`cxBearDiv`·`cxBullVolDiv`·`cxBearVolDiv`·`readings.js` 가 같은 단어를 쓰므로, 판정어를 정하면 **다섯 곳을 한 번에** 맞춘다.
- 적중률 고지(`rpHitScopeShort`)를 지우지 않는다 — 그 수치는 19지표 하네스 값이라 이 티어의 것이 아니다.

- [ ] **Step 1: 구조 불변을 기계가 아니라 diff 로 강제한다**

"블록 순서가 안 바뀌었나"를 소스 정규식으로 재는 테스트는 쓰지 않는다 — 마크업을 안 건드리는 것이 이 태스크의 규칙이므로, **`git diff` 자체가 관문**이다. 커밋 전에 확인한다:

```bash
cd /home/jschoi0223/projects/vdiportal
git diff --stat map/mobile/www/screens/report.js
git diff map/mobile/www/screens/report.js | grep "^[-+]" | grep -v "MSStr\.t\." | grep -v "^[-+][-+]"
```

두 번째 명령의 출력이 **비어 있어야 한다.** 문자열 참조 외의 줄이 바뀌었다면 구조를 건드린 것이니 되돌린다. 비어 있지 않은데 정당한 이유가 있다면(예: 클래스명 오타 수정) 커밋 메시지에 적는다.

리뷰어가 같은 것을 볼 수 있도록, 이 명령과 그 출력을 태스크 보고서에 적는다.

- [ ] **Step 2: 남은 문자열을 전부 한국어로 바꾼다**

`PENDING_EN` 에 남은 키가 대상이다. 목록을 찍어 확인한다:

```bash
cd map/mobile
node -e 'const S=require("./www/strings.js");console.log(Object.keys(S.t).filter(k=>!/[가-힣]/.test(String(S.t[k]))).join("\n"))'
```

`DESIGN-INVENTORY.md` §1 의 `### 18a`·`### 20a` 에 원문이 있는 것은 그대로 쓰고, 없는 것(엔진 실패 사유·판독문 거절문 등)은 기존 영어 문장을 **의미 그대로** 번역한다.

- [ ] **Step 3: `.rp-*` 의 font-size 를 토큰으로 옮긴다**

태스크 2 의 매핑 표를 그대로 적용한다. **선택자·마크업은 건드리지 않는다.**

- [ ] **Step 4: `PENDING_EN` 을 빈 배열로 만든다**

```js
const PENDING_EN = [];
```

- [ ] **Step 5: 관문**

Run: `cd map && ./tests/run.sh`
Expected: 전부 통과. forge-core 259 · forge-tools 81 · landing 28 은 **변하지 않아야 한다**(엔진 무변경).

- [ ] **Step 6: APK 로 실기기 확인**

```bash
cd map/mobile && npm install && npm run cap:sync
cd android && ./gradlew assembleDebug --no-daemon
```

헤드리스는 실기기와 다르다 — 상태바 인셋 문제가 브라우저에서 안 보이고 첫 설치에서 드러난 전례가 있다(2026-08-15). **한글이 Pretendard 로 렌더되는지**(시스템 폰트와 자획이 다르다), 자간이 시안과 어긋나지 않는지를 눈으로 본다.

- [ ] **Step 7: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/screens/report.js map/mobile/www/style.css map/mobile/www/strings.js \
        map/mobile/test/strings.test.mjs map/mobile/test/report-model.test.mjs
git commit -m "feat(mobile): 리포트 타이포·문자열 한국어 — 구조는 P2 로 (잔여 목록 비움)"
```

---

## 완료 조건

1. `cd map && ./tests/run.sh` 전부 통과. 엔진 스위트(forge-core 259 · forge-tools 81 · landing 28) 불변.
2. `PENDING_EN` 이 빈 배열이고, `strings.js` 의 `t` 값에 영어 문장이 없다(지표명 `IND` 제외).
3. APK 를 실기기에 설치해 **한글이 Pretendard 로** 렌더되고, 워치리스트·지갑·시트 2종이 시안과 같은 구성으로 보인다.
4. 8b·8c·8d 가 쌓은 실패·경계 문구가 하나도 사라지지 않았다.
