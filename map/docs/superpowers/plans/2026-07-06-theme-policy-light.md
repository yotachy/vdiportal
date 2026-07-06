# 색 테마 정책 통일 + 밝은 테마 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테마 전환 시 전체 토큰이 일괄로 바뀌도록 통일하고, 중복 다크 테마(charcoal·cement)를 삭제하며, 밝은 테마 2종(paper·daylight)을 추가한다.

**Architecture:** `THEMES`(forge.html) 각 항목이 **완전한 CSS 토큰 세트**를 지정하도록 확장. UI 크롬의 하드코딩 색(hover/overlay/grid ~70곳)을 신규 토큰(`--hover --scrim --grid --chart-bg`)으로 치환. 차트 캔버스 `FC_*`는 `_themeColors()` 헬퍼로 테마 인지화(daylight용).

**Tech Stack:** 순수 HTML/CSS + 바닐라 JS (단일 `forge.html`). 빌드툴 없음. 검증 = 헤드리스 크로미움 스크린샷/DOM 체크(CSS 단위테스트 없음).

## Global Constraints

- 단일 HTML·바닐라 JS 유지. `forge-core.js`·`*.json` 데이터 파일 미변경.
- 좌측 컬러 accent line 금지(테마 스와치·상태는 배경·텍스트·체크로만).
- 다크 5종은 **무회귀**: 신규 토큰 기본값 = 현행 하드코딩 값과 동일하게 잡아 픽셀 변화 0.
- 테마 관련 상수 유지(테마 무관): `--bull:#46c28e` `--bear:#e06a6a` · `EV_COLORS`(30 지표) · `FC_BULL/FC_BEAR`(가격 방향) · `--r-sm/md/lg`.
- 헤드리스 검증 도구: `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome` + `<scratchpad>/chrlibs` LD_LIBRARY_PATH(기존 세션 세팅). 각 태스크 스크린샷 확인.

---

## 파일 구조

- `map/forge.html` 만 수정. 영역:
  - `:root{…}` (~L12) — 토큰 정의(신규 토큰 추가).
  - CSS 규칙 전반 — 하드코딩 색 치환.
  - `const FC_GOLD/FC_GRID …` + 캔버스 draw 함수 — 차트 토큰화(Task 5).
  - `const THEMES = {…}` (~L7961) + `applyTheme`/`renderThemePop` (~L7971) — 테마 세트·팝업.

---

### Task 1: 신규 토큰 4종을 `:root`에 추가(다크 기본값)

**Files:** Modify `map/forge.html` (`:root` 블록 ~L12–30)

**Interfaces:**
- Produces: CSS 변수 `--hover` `--scrim` `--grid` `--chart-bg` (다크 기본값). 이후 태스크가 하드코딩 대신 사용.

- [ ] **Step 1: `:root`에 토큰 추가.** `:root{…}` 블록의 `--gold-dim:#5e4d2c;` 뒤에 아래를 추가(세미콜론 구분 유지):

```
--hover:rgba(255,255,255,.05);--scrim:rgba(11,15,20,.72);--grid:#1b2334;--chart-bg:#0b0f14
```

- [ ] **Step 2: 파싱·무회귀 확인(헤드리스).** forge.html 로드 → JS 에러 0 + `getComputedStyle(document.documentElement).getPropertyValue('--hover')`가 `rgba(255, 255, 255, 0.05)` 반환. (스크린샷은 현행과 동일해야 함 — 아직 아무 데도 안 씀)

```bash
SP=<scratchpad>; BIN=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome
LP=$SP/chrlibs:$(find $SP/chrlibs -type d -name x86_64-linux-gnu|tr '\n' ':')
# probe: title = getPropertyValue('--hover') + JS err
```
Expected: `--hover` = rgba(255,255,255,.05), err=none.

- [ ] **Step 3: Commit** — `git commit -am "feat(forge): 테마 신규 토큰 4종(--hover/--scrim/--grid/--chart-bg) :root 추가(다크 기본값)"`

---

### Task 2: DOM 하드코딩 색을 토큰으로 치환(다크 무회귀)

**Files:** Modify `map/forge.html` (CSS 규칙 전반)

**Interfaces:**
- Consumes: Task 1의 `--hover --scrim --grid`.
- Produces: UI 크롬이 하드코딩 대신 토큰 사용 → 라이트 테마에서 자동 적응.

- [ ] **Step 1: 호버 하드코딩 치환.** `rgba(255,255,255,.05)`(및 `.03`/`.04`/`.055`/`.06`/`.07` 변형)을 `var(--hover)`로 치환. **주의**: CSS `background`/`background-color` 값만. 그라디언트 내부·차트 관련은 개별 판단. 강도 편차가 큰 소수(예: `.03` 아주 옅음)는 그대로 두거나 `--hover`로 통일(옅은 편차는 라이트에서 무해). sed 후 수동 검수:

```bash
# 대상 파악: grep -n "rgba(255,255,255" forge.html  (약 40)
# background 계열만 var(--hover)로. 아이콘/보더 강조 등 비배경은 유지.
```

- [ ] **Step 2: 오버레이/딤 치환.** 모달 배경·팝업 스크림 `rgba(11,15,20,.6~.95)`를 `var(--scrim)`로(반투명 패널 표면이면 `--panel` 유지가 맞는 경우 구분). 약 26곳 중 **모달/드롭다운 배경 오버레이**만 `--scrim`.

- [ ] **Step 3: 그리드선 치환.** 서브패널·격자 `#2b3647`·`#2a3346`·`#1b2334`를 `var(--grid)`로(CSS + 캔버스는 Task 5).

- [ ] **Step 4: 다크 무회귀 검증(헤드리스).** navy 테마(기본)로 seed+run 스크린샷 → 치환 전과 **시각 동일**(토큰 기본값=현행). JS 에러 0. 핵심 화면(레일·패널·모달·서브패널) 확인.

- [ ] **Step 5: Commit** — `git commit -am "refactor(forge): UI 하드코딩 색(hover/scrim/grid ~70곳) → 토큰화(다크 무회귀)"`

---

### Task 3: 다크 5종 완전 토큰 세트로 확장 + charcoal/cement 삭제 + 팝업 그룹

**Files:** Modify `map/forge.html` (`const THEMES` ~L7961, `renderThemePop` ~L7978, `applyTheme` ~L7971)

**Interfaces:**
- Consumes: 신규 토큰(Task 1).
- Produces: 각 테마가 완전 세트 지정 → 전환 시 텍스트·테두리·gold-dim 포함 일괄 변경. `renderThemePop`가 `group`별 서브헤더 렌더.

- [ ] **Step 1: `THEMES` 객체 교체(완전 세트).** 아래로 교체(charcoal·cement 제거, 5 다크 각 완전 토큰, `group:"dark"`):

```js
  const THEMES = {
    navy:     { name: "네이비 (기본)", group: "dark", c: "#0b0f14", g: "#e8b463", vars: { "--bg":"#0b0f14","--panel":"#121822","--surface":"#141a22","--raised":"#1b232d","--raised2":"#27313e","--line":"#222b39","--edge":"#566472","--ink":"#e7ecf5","--eth":"#8a92b2","--muted":"#8b98a6","--faint":"#5c6875","--gold":"#e8b463","--gold-dim":"#5e4d2c","--hover":"rgba(255,255,255,.05)","--scrim":"rgba(11,15,20,.72)","--grid":"#1b2334","--chart-bg":"#0b0f14" } },
    midnight: { name: "미드나잇", group: "dark", c: "#07080b", g: "#e8b463", vars: { "--bg":"#07080b","--panel":"#0d0f13","--surface":"#101318","--raised":"#171a20","--raised2":"#222631","--line":"#1c2029","--edge":"#4a5560","--ink":"#e7ecf5","--eth":"#8a92b2","--muted":"#8b98a6","--faint":"#5c6875","--gold":"#e8b463","--gold-dim":"#5e4d2c","--hover":"rgba(255,255,255,.05)","--scrim":"rgba(7,8,11,.75)","--grid":"#161b26","--chart-bg":"#07080b" } },
    teal:     { name: "딥틸 (청록)", group: "dark", c: "#0b1517", g: "#5ec8b6", vars: { "--bg":"#0b1517","--panel":"#101f21","--surface":"#13262a","--raised":"#182d31","--raised2":"#233d42","--line":"#1a2e30","--edge":"#3d5a5c","--ink":"#e6f0ee","--eth":"#8aa5a2","--muted":"#8ba6a3","--faint":"#5c7573","--gold":"#5ec8b6","--gold-dim":"#2e5a52","--hover":"rgba(255,255,255,.05)","--scrim":"rgba(11,21,23,.72)","--grid":"#173033","--chart-bg":"#0b1517" } },
    purple:   { name: "로열 퍼플", group: "dark", c: "#100b18", g: "#b58cf0", vars: { "--bg":"#100b18","--panel":"#181121","--surface":"#1c1526","--raised":"#241a30","--raised2":"#33264a","--line":"#281d38","--edge":"#4d3d66","--ink":"#ece7f5","--eth":"#9a8ab2","--muted":"#9b8ba6","--faint":"#6c5c85","--gold":"#b58cf0","--gold-dim":"#4a3a66","--hover":"rgba(255,255,255,.05)","--scrim":"rgba(16,11,24,.72)","--grid":"#241a34","--chart-bg":"#100b18" } },
    orange:   { name: "앰버 오렌지", group: "dark", c: "#14100b", g: "#e8955c", vars: { "--bg":"#14100b","--panel":"#1d160e","--surface":"#221a11","--raised":"#291e13","--raised2":"#3a2c1b","--line":"#2b2015","--edge":"#5a4a30","--ink":"#f5ece0","--eth":"#b29a8a","--muted":"#a6938b","--faint":"#75685c","--gold":"#e8955c","--gold-dim":"#5e412c","--hover":"rgba(255,255,255,.05)","--scrim":"rgba(20,16,11,.72)","--grid":"#2b2015","--chart-bg":"#14100b" } },
  };
```

- [ ] **Step 2: `renderThemePop` 그룹 서브헤더.** 그룹별 렌더로 교체:

```js
  function renderThemePop() {
    const pop = document.getElementById("themePop"); if (!pop) return;
    const groups = { dark: "다크", light: "라이트" };
    let html = '';
    Object.entries(groups).forEach(([gk, gname]) => {
      const items = Object.entries(THEMES).filter(([, t]) => (t.group || "dark") === gk);
      if (!items.length) return;
      html += `<div class="th-h">${gname}</div>` + items.map(([k, t]) => `<button class="theme-opt${k === _theme ? " on" : ""}" onclick="applyTheme('${k}');toggleThemePop(true)"><span class="th-sw" style="background:${t.c};box-shadow:inset 0 0 0 2px ${t.g}"></span>${t.name}</button>`).join("");
    });
    pop.innerHTML = html;
  }
```

- [ ] **Step 3: 저장된 삭제 테마 폴백.** `_theme` 초기화가 charcoal/cement면 navy로. `applyTheme`의 `THEMES[key] || THEMES.navy` 폴백은 이미 존재 → 삭제 테마 선택 시 navy. 초기 로드도 안전(폴백). 확인만.

- [ ] **Step 4: 검증(헤드리스).** ①팝업에 "다크" 서브헤더 + 5종만(charcoal/cement 없음). ②각 테마 applyTheme 후 `--ink`·`--line`·`--gold-dim`이 테마별로 바뀜(navy vs teal 비교). ③navy 무회귀. ④teal/purple 전환 시 텍스트·테두리까지 액센트 톤 반영(스크린샷). ⑤localStorage에 "charcoal" 넣고 로드 → navy 폴백, 에러 0.

- [ ] **Step 5: Commit** — `git commit -am "feat(forge): 다크 5종 완전 토큰 세트화 + 그레이2종(charcoal/cement) 삭제 + 팝업 그룹 서브헤더"`

---

### Task 4: 페이퍼(밝은 UI + 다크 차트) 테마 추가

**Files:** Modify `map/forge.html` (`THEMES`에 `paper` 추가)

**Interfaces:**
- Consumes: 완전 토큰 계약(Task 3), `--chart-bg`(차트 배경).
- Produces: `paper` 테마 — UI 밝음, 차트 캔버스 다크(`--chart-bg` 다크).

- [ ] **Step 1: `paper` 추가.** `THEMES`의 orange 뒤(닫는 `};` 앞)에 추가:

```js
    paper:    { name: "페이퍼", group: "light", c: "#f4f2ec", g: "#b0842f", vars: { "--bg":"#f4f2ec","--panel":"#ffffff","--surface":"#faf9f5","--raised":"#eeece4","--raised2":"#e4e1d7","--line":"#e2e0d8","--edge":"#c9c6bb","--ink":"#1c2128","--eth":"#5a6472","--muted":"#6b7280","--faint":"#9aa0a8","--gold":"#b0842f","--gold-dim":"#d8c9a0","--hover":"rgba(0,0,0,.045)","--scrim":"rgba(30,34,42,.5)","--grid":"#d7dde6","--chart-bg":"#0b0f14" } },
```

- [ ] **Step 2: 차트 배경이 `--chart-bg`를 쓰는지 연결.** 차트 hero 컨테이너 배경(현재 `--bg`/다크 하드코딩)을 `--chart-bg`로. `#fcHero`/`.chart-pane`/`#fcMain` 래퍼 CSS의 배경을 `var(--chart-bg)`로 치환(캔버스 자체 배경 fill은 Task 5). 서브패널(오실레이터)은 UI 영역이므로 `--panel`(밝음) 유지 — 단 캔버스 내부 배경 fill이 다크 하드코딩이면 Task 5에서 처리.

- [ ] **Step 3: 검증(헤드리스).** paper 적용 → ①패널·텍스트·레일 밝음(ink 어두운색, bg 밝음) ②가격 차트 캔버스 영역은 다크 배경 유지 ③텍스트 대비 판독 가능(레일 라벨·판정 텍스트) ④JS 에러 0. 스크린샷 확인(밝은 UI + 다크 차트).

- [ ] **Step 4: Commit** — `git commit -am "feat(forge): 페이퍼(밝은 UI + 다크 차트) 라이트 테마 추가"`

---

### Task 5: 차트 캔버스 색 토큰화(`_themeColors()`) — daylight 준비

**Files:** Modify `map/forge.html` (`FC_*` 상수 + 캔버스 draw 함수 배경/격자/골드)

**Interfaces:**
- Consumes: `--gold --grid --chart-bg --ink --line`.
- Produces: `_themeColors()` — 렌더 시 CSS 변수를 읽어 캐시. 캔버스가 테마 색 사용 → daylight에서 차트 밝게.

- [ ] **Step 1: `_themeColors()` 헬퍼 추가.** `const FC_GOLD …` 근처에 추가:

```js
  function _themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = k => cs.getPropertyValue(k).trim();
    return { gold: g("--gold") || "#e8b463", grid: g("--grid") || "#1b2334", chartBg: g("--chart-bg") || "#0b0f14", ink: g("--ink") || "#e7ecf5", line: g("--line") || "#222b39", faint: g("--faint") || "#5c6875" };
  }
```

- [ ] **Step 2: 캔버스 배경 fill·격자·골드를 토큰 경유로.** 차트/서브패널 draw 함수에서 배경을 채우는 `c.fillStyle = "#0b0f14"`/`FC_GOLD`/`FC_GRID`/그리드 hex를 `_themeColors()`의 값으로 치환. 렌더 함수 진입부에서 `const TC = _themeColors();` 한 번 읽고 재사용. `FC_BULL/FC_BEAR`(가격 상승/하락)는 유지. 대상: `fcDrawMainChart`·`fcDrawRsi/Macd/Adx/Vol/Cci/Williams/Mfi`·`fcDrawPdm`·`fcDrawFold`·콘/예측선 배경·격자.

- [ ] **Step 3: 테마 변경 시 차트 재드로.** `applyTheme`에 차트 갱신 추가(현재 renderHeroZoom만): `if (typeof renderChart==="function" && lastResult) try{ renderChart(lastResult, currentData()); }catch(e){}` 및 `if (typeof redrawCharts==="function") try{ redrawCharts(); }catch(e){}`.

- [ ] **Step 4: 다크 무회귀 검증(헤드리스).** navy에서 차트·서브패널이 토큰화 전과 시각 동일(토큰 기본값=현행 hex). 에러 0.

- [ ] **Step 5: Commit** — `git commit -am "refactor(forge): 차트 캔버스 색 _themeColors() 토큰화(배경·격자·골드) — 다크 무회귀"`

---

### Task 6: 데이라이트(완전 밝은, 차트 포함) 테마 추가

**Files:** Modify `map/forge.html` (`THEMES`에 `daylight` 추가)

**Interfaces:**
- Consumes: 완전 토큰 계약 + `_themeColors()`(Task 5).
- Produces: `daylight` — 차트까지 밝음(`--chart-bg` 밝음, `--grid` 밝은 격자).

- [ ] **Step 1: `daylight` 추가.** `paper` 뒤에:

```js
    daylight: { name: "데이라이트", group: "light", c: "#f6f7f9", g: "#b0842f", vars: { "--bg":"#eef1f5","--panel":"#ffffff","--surface":"#f7f9fb","--raised":"#eef1f5","--raised2":"#e3e7ee","--line":"#dde2ea","--edge":"#c2c9d4","--ink":"#1a1f27","--eth":"#586274","--muted":"#67717f","--faint":"#98a1ad","--gold":"#b0842f","--gold-dim":"#d9cba2","--hover":"rgba(0,0,0,.045)","--scrim":"rgba(26,31,39,.5)","--grid":"#dfe4ec","--chart-bg":"#f7f9fb" } },
```

- [ ] **Step 2: 검증(헤드리스).** daylight 적용 → ①차트 캔버스 배경 밝음·격자 밝은 회색·예측선/골드 대비 OK ②UI 전체 밝음 ③가격 상승/하락(bull/bear) 여전히 녹/적 구분 ④텍스트 판독 ⑤에러 0. 스크린샷.

- [ ] **Step 3: 전체 테마 순회 검증(헤드리스).** 7종(navy·midnight·teal·purple·orange·paper·daylight) 각 applyTheme 후 스크린샷·에러 0. 다크 5종 무회귀·라이트 2종 판독.

- [ ] **Step 4: Commit + 배포** — `git commit -am "feat(forge): 데이라이트(완전 밝은·차트 포함) 라이트 테마 추가"` 후 cafe24 `put forge.html`.

---

## 자체 검증(계획 작성자)

- 스펙 커버리지: 통일 토큰 계약(T1·T2·T3) / 다크 정리(T3) / 페이퍼(T4) / 차트 토큰화(T5) / 데이라이트(T6) — 전부 태스크 존재. ✅
- 하드코딩 정리(hover40·scrim26·grid): T2(DOM)·T5(캔버스)로 분리. ✅
- 무회귀 보장: 신규 토큰 기본값 = 현행 hex(rgba(255,255,255,.05)·#1b2334·#0b0f14), 다크 5종 vars가 현행값 유지. ✅
- 상수 유지: bull/bear·EV_COLORS·FC_BULL/BEAR 미변경 명시. ✅
- 토큰명 일관: `--hover --scrim --grid --chart-bg`, `_themeColors()` 키(gold/grid/chartBg/ink/line/faint) 태스크 간 일치. ✅
- 비목표(prefers-color-scheme 자동·커스텀 편집·EV 재튜닝) 범위 밖 명시. ✅
