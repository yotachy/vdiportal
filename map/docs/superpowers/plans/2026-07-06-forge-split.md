# forge.html 파일 분리 구현 계획 (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거대 단일 `forge.html`을 동작 불변으로 `forge.css` + 4개 `forge-*.js`로 소스순서 보존 분리한다.

**Architecture:** 인라인 `<script>`(1424–9152)를 최상위 함수 경계(depth 0)에서 4분할해 co-located classic script로 추출. 여러 classic script는 전역 스코프를 공유하므로 순서만 보존하면 동작 불변. **아래→위 순서로 추출**(꼬리 제거는 앞 라인번호를 밀지 않음)해 anchor 라인 안정.

**Tech Stack:** 순수 HTML/CSS/바닐라 JS, 번들러 없음. 검증 = `node --check`(문법) + 헤드리스 크로미움 동작 스냅샷 비교.

## Global Constraints

- 로직 재작성·함수 재배치 금지 — **순수 이동만**(바이트 동일 컷). 소스 순서 100% 보존.
- 절단은 최상위 경계(brace depth 0)에서만. 함수/표현식 중간 금지. 중복 최상위 선언 금지.
- 로드 순서 고정: `forge-core.js` → `forge-state.js` → `forge-ui.js` → `forge-draw.js` → `forge-app.js`. 부팅 IIFE는 app(마지막).
- `<script>`에 `defer`/`async` 금지(순서 의존).
- `forge-core.js`·데이터·서버 파일 미변경. `node --test forge-core.test.js` 199/199 유지.
- 각 추출 후 헤드리스 스냅샷이 baseline과 **동일**해야 커밋(회귀 즉시 롤백).
- 헤드리스: `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome` + `<scratchpad>/chrlibs` LD_LIBRARY_PATH(기존 세션 세팅). forge-core.js를 scratchpad에 복사해 상대 로드.

## 파일 구조 (최종)

```
forge.html        마크업 + <link forge.css> + 5×<script src>(core/state/ui/draw/app)
forge.css         <style> 전체(현 9–1196)
forge-core.js     엔진(현행 유지)
forge-state.js    현 1424–2120  (uid·상태·BLOCK_DEFS·IND_TIERS·서버·boot·CRUD·renderHero)
forge-ui.js       현 2121–3506  (renderIndRail·프리셋·노드/보드·renderParams·HUD·boardInit·seedDefaultStrategy)
forge-draw.js     현 3507–6271  (FC_*·_syncChartColors·fcDraw*·EV_COLORS/INFO/LABEL·엘리어트/피보 레이어)
forge-app.js      현 6272–9152  (renderChart·분석서술·THEMES/applyTheme·playAnalysis·runForge·부팅IIFE)
```

> 아래→위 추출이라 각 anchor 원본 라인번호는 자기 차례까지 안 밀림. cut은 anchor 함수 **직전** depth-0 라인.

---

### Task 1: Baseline 동작 스냅샷 하베스트

**Files:** Create `<scratchpad>/snap.js`(헤드리스 주입 스니펫 생성용), 산출 `<scratchpad>/baseline.txt`

**Interfaces:**
- Produces: `SIG` 문자열 — 이후 모든 추출 태스크가 이 값과 문자열 동일성 비교.

- [ ] **Step 1: 스냅샷 하베스트 함수 정의.** forge.html에 아래 주입 스니펫으로 시그니처를 뽑는다(`</body>` 앞 주입):

```javascript
window.__e=[]; addEventListener("error",e=>window.__e.push(""+e.message));
addEventListener("load",()=>setTimeout(()=>{try{
  boardState.nodes=[];boardState.edges=[];boardState.groups=[];
  seedDefaultStrategy(); autoLayout("v"); runForge();
  var r=lastResult||{}, pr=r.prediction||{};
  var themes=["navy","midnight","teal","purple","orange","paper","daylight"];
  var tks=themes.map(k=>{applyTheme(k);var cs=getComputedStyle(document.documentElement);return k+":"+cs.getPropertyValue("--ink").trim()+"/"+cs.getPropertyValue("--chart-bg").trim();}).join("|");
  applyTheme("midnight");
  var en=boardState.nodes.find(n=>n.blockType==="elliott");
  var ea=en?_an("Elliott",(currentData().price||[]),{swing:(en.params.swing||3)/100}):{waves:[]};
  playAnalysis();
  setTimeout(()=>{
    document.title="SIG target="+Math.round(r.target||0)
      +" dir="+((r.verdict&&r.verdict.dir)||0)
      +" pathLen="+((pr.path&&pr.path.length)||0)
      +" nodes="+boardState.nodes.length
      +" ell="+(ea.waves.map(w=>w.label).join("-")||"-")+"/"+ea.structure
      +" themes="+tks
      +" domEls="+document.querySelectorAll("*").length
      +" err="+(window.__e.join("|")||"none");
  },1500);
},2200));
```

- [ ] **Step 2: baseline 추출.** 현재(분리 전) forge.html에 주입해 헤드리스 실행 → `<title>` SIG 문자열을 `<scratchpad>/baseline.txt`에 저장.

Run: 헤드리스 `--dump-dom | grep -o '<title>[^<]*</title>'`
Expected: `SIG target=... dir=... pathLen=... nodes=34 ell=.../... themes=navy:...|... domEls=... err=none`

- [ ] **Step 3: 하베스트 스크립트 파일화.** 재사용 위해 주입+실행+SIG출력을 `<scratchpad>/snap.sh <html경로>`로 저장(각 태스크가 호출). baseline.txt와 비교하는 `diff` 한 줄 포함.

- [ ] **Step 4: 커밋(문서/도구만).** baseline은 scratchpad(git 무관)라 커밋 없음. 진행 로그만 남기고 다음 태스크로.

---

### Task 2: CSS 추출 → forge.css

**Files:** Create `map/forge.css`; Modify `map/forge.html`(`<style>` 9–1196 제거, `<link>` 추가)

**Interfaces:**
- Consumes: baseline SIG(Task 1).

- [ ] **Step 1: `<style>` 본문을 forge.css로 복사.** forge.html 10–1195(`<style>`와 `</style>` 사이 전체)를 그대로 `map/forge.css`에 기록.

- [ ] **Step 2: forge.html에서 `<style>…</style>` 블록 제거하고 `<link>`로 교체.** `<head>` 내 원 위치에:

```html
<link rel="stylesheet" href="forge.css?v=20260706a">
```

- [ ] **Step 3: 헤드리스 스냅샷 비교.** `snap.sh` 실행 → SIG가 baseline과 **동일**(특히 `domEls`·`themes` 토큰·`err=none`). 스타일만 분리라 SIG 불변.

Run: `bash <scratchpad>/snap.sh <scratchpad>/forge_test.html`
Expected: `MATCH`(baseline와 동일)

- [ ] **Step 4: 시각 확인.** midnight + paper 스크린샷 1장씩 — 레이아웃 깨짐 없음(스타일 정상 로드).

- [ ] **Step 5: Commit** — `git add forge.css forge.html && git commit -m "refactor(forge): CSS를 forge.css로 분리(<link> 로드)"`

---

### Task 3: app 추출 → forge-app.js (현 6272–9152)

**Files:** Create `map/forge-app.js`; Modify `map/forge.html`

**Interfaces:**
- Consumes: 전역 함수/상수(state·ui·draw에 남아있음) — 런타임 호출이라 로드 후 접근 가능.
- Produces: `renderChart`·`THEMES`·`applyTheme`·`playAnalysis`·`runForge`·부팅 IIFE를 app 파일로.

- [ ] **Step 1: 컷 경계 확인.** 인라인 script에서 `function renderChart(result, data)` 선언 줄(현 6272)이 depth-0인지 확인(직전 함수가 닫힌 최상위). 이 줄부터 인라인 `</script>` 직전(현 9152)까지가 app 구간.

- [ ] **Step 2: app 구간을 forge-app.js로 이동.** 6272–9152를 잘라 `map/forge-app.js`에 기록(내용 그대로, `<script>` 태그 없이). forge.html 인라인 script에서 해당 줄 삭제.

- [ ] **Step 3: `<script src>` 추가.** 인라인 `</script>` **직후**에:

```html
<script src="forge-app.js?v=20260706a"></script>
```

- [ ] **Step 4: 문법 검사.** 추출 파일과 잔여 forge.html 인라인 모두 완결:

```bash
node --check map/forge-app.js
# 잔여 인라인 검사: 인라인 <script> 본문을 추출해 node --check (또는 new Function)
```
Expected: 둘 다 문법 통과(불통 시 컷이 depth-0 아님 → 경계 재조정).

- [ ] **Step 5: 헤드리스 스냅샷 비교.** `snap.sh` → SIG == baseline. 특히 `err=none`·`target`·`themes`·`ell`·`pathLen` 동일(app에 runForge/playAnalysis/applyTheme가 있으므로 이들이 정상 동작해야 함).

Expected: `MATCH`

- [ ] **Step 6: Commit** — `git commit -am "refactor(forge): 앱 오케스트레이션(renderChart·play·run·theme·boot)을 forge-app.js로 분리"`

---

### Task 4: draw 추출 → forge-draw.js (현 3507–6271)

**Files:** Create `map/forge-draw.js`; Modify `map/forge.html`

**Interfaces:**
- Produces: `FC_*`·`_syncChartColors`·`fcDrawMain`·서브패널·`EV_COLORS`/`INDICATOR_INFO`/`EV_LABEL`·엘리어트/피보 레이어.

- [ ] **Step 1: 컷 경계 확인.** `/* palette constants */` 주석 + `const FC_ACC`(현 3507)이 depth-0 시작. 직전(현 3506, seedDefaultStrategy 닫힘)이 경계.

- [ ] **Step 2: draw 구간(3507–6271)을 forge-draw.js로 이동.** forge.html 인라인에서 삭제.

- [ ] **Step 3: `<script src>` 추가.** 인라인 `</script>` **직후**(→ forge-app.js 앞에 위치):

```html
<script src="forge-draw.js?v=20260706a"></script>
```

- [ ] **Step 4: 문법 검사.** `node --check map/forge-draw.js` + 잔여 인라인 검사 → 통과.

- [ ] **Step 5: 헤드리스 스냅샷 비교.** `snap.sh` → SIG == baseline. 특히 `ell`(엘리어트 작도)·차트·`themes`의 `--chart-bg` 동작(draw에 `_syncChartColors` 있음).

Expected: `MATCH`

- [ ] **Step 6: Commit** — `git commit -am "refactor(forge): 차트·작도(fcDraw*·FC_*·레이어)를 forge-draw.js로 분리"`

---

### Task 5: ui 추출 → forge-ui.js (현 2121–3506)

**Files:** Create `map/forge-ui.js`; Modify `map/forge.html`

**Interfaces:**
- Produces: `renderIndRail`·`renderPresets`·노드/보드 렌더·`renderParams`·HUD·`boardInit`·`seedDefaultStrategy`.

- [ ] **Step 1: 컷 경계 확인.** `function renderIndRail()`(현 2121)이 depth-0 시작. 직전(현 2120)이 경계.

- [ ] **Step 2: ui 구간(2121–3506)을 forge-ui.js로 이동.** 인라인에서 삭제.

- [ ] **Step 3: `<script src>` 추가.** 인라인 `</script>` **직후**(→ draw 앞):

```html
<script src="forge-ui.js?v=20260706a"></script>
```

- [ ] **Step 4: 문법 검사.** `node --check map/forge-ui.js` + 잔여 인라인 → 통과.

- [ ] **Step 5: 헤드리스 스냅샷 비교.** `snap.sh` → SIG == baseline. 특히 `nodes`·`domEls`(레일/보드 렌더)·`ell`(seedDefaultStrategy).

Expected: `MATCH`

- [ ] **Step 6: Commit** — `git commit -am "refactor(forge): 렌더/편집 UI(레일·보드·params·HUD·seed)를 forge-ui.js로 분리"`

---

### Task 6: state 추출 → forge-state.js + 인라인 제거 + 마무리·배포

**Files:** Create `map/forge-state.js`; Modify `map/forge.html`, `map/CLAUDE.md`

**Interfaces:**
- Produces: uid·상태·`BLOCK_DEFS`·`IND_TIERS`·서버저장·`boot`·CRUD·`renderHero`. 인라인 script 완전 제거.

- [ ] **Step 1: 잔여 인라인(현 1424–2120) 전체를 forge-state.js로 이동.** forge.html에서 인라인 `<script>…</script>`(1423 여는 태그, 이제 본문=state, 닫는 태그) 통째 제거.

- [ ] **Step 2: `<script src>` 추가.** `forge-core.js` `<script src>` **직후**에:

```html
<script src="forge-state.js?v=20260706a"></script>
```
결과 순서: core → state → ui → draw → app.

- [ ] **Step 3: 문법 검사.** `node --check`로 5개 파일(state/ui/draw/app/core) 전부 통과. forge.html엔 인라인 JS 0.

- [ ] **Step 4: 헤드리스 스냅샷 비교(최종).** `snap.sh` → SIG == baseline **완전 일치**. `err=none`.

Expected: `MATCH` (target/dir/pathLen/nodes/ell/themes/domEls 모두 baseline과 동일)

- [ ] **Step 5: 시각 회귀 확인.** midnight·paper·daylight 3장 스크린샷 — 분리 전과 동일 화면.

- [ ] **Step 6: 코어 테스트.** `node --test forge-core.test.js` → 199/199(엔진 무변경).

- [ ] **Step 7: CLAUDE.md 배포 세트 갱신.** map/CLAUDE.md forge 배포 항목을 `forge.html + forge-core.js + forge.css + forge-state.js + forge-ui.js + forge-draw.js + forge-app.js` 동반 배포로 수정.

- [ ] **Step 8: Commit + 배포.** `git commit` 후 cafe24 `www/map`에 7개 파일 전부 `put`. curl로 각 파일 200 + forge.html이 5개 `<script src>` 참조하는지 확인.

---

## 자체 검증(계획 작성자)

- **스펙 커버리지:** 4파일+CSS 분리(T2–T6) / 소스순서·depth-0 컷(각 T Step1) / 로드순서(T6 Step2) / 점진 검증(각 T 스냅샷) / 배포 세트(T6 Step7-8) — 전부 태스크 존재. ✅
- **동작 불변 담보:** baseline SIG(T1) vs 각 추출 후 SIG 문자열 동일성 — 순수 이동이라 일치해야 함. 불일치=회귀 즉시 포착. ✅
- **아래→위 추출로 라인 안정:** app(6272)→draw(3507)→ui(2121)→state(1424). 각 anchor 원본 라인 유지. ✅
- **문법 완결성:** 각 파일 `node --check` — depth-0 컷 아니면 실패로 드러남. ✅
- **로드 순서:** 삽입 규칙(인라인 `</script>` 직후) → 최종 core/state/ui/draw/app. ✅
- **엔진 무변경:** forge-core.js 안 건드림 → 199/199. ✅
- **비목표(성능=Phase2):** 계획에 성능 작업 없음. ✅
