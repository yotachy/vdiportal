# 스쿱포지 Phase 4-A (포지 리브랜드 + 세로 정렬) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캔버스 단위를 "포지"로 리브랜드(UI 라벨만)하고, map.html식 자동 세로/가로 정렬을 추가하며 새 포지를 세로 배치로 시작시킨다.

**Architecture:** `forge.html` UI 텍스트만 포지/New Forge로 교체(내부·서버 키 불변). map.html `autoLayout(dir)`를 forge 식별자로 포팅(`parentsOf` 인라인) + 헤더 세로/가로 정렬 버튼 + 시드 직후 `autoLayout('v')`로 기본 세로.

**Tech Stack:** 바닐라 JS. forge-core.js 무변경(node 15/15 회귀 가드). 검증은 헤드리스(오프라인 모드 — file:// 로드 시 boot가 메모리 폴백+시드).

## Global Constraints

- 수정 대상: `map/forge.html`만. 기존 `map/map.html`·`map/chart.html`·`map/api.php`·`map/forge-api.php`·`map/forge-core.js`·모든 `*_*.json` 불가침.
- 바닐라 JS, 2 spaces, 큰따옴표, 케밥케이스. 다크 골드 토큰. 한국어 UI. noindex. FORGE_API 상대경로 유지.
- **리브랜드는 UI 라벨만** — `DOCS`/`documents`/`activeId`/`themeImgId` 등 내부·서버 키 변경 금지(저장 호환).
- forge-core.js 무변경 → `node --test map/forge-core.test.js` 15/15 유지.

---

## Task 1: 포지 리브랜드 (UI 라벨)

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: 기존 boot 시드/`newDoc`/`renderSidebar`/`deleteDoc`/`exportStrategy`/`seedDefaultStrategy`.
- Produces: UI 텍스트만 변경. 함수 시그니처·데이터 키 불변.

- [ ] **Step 1: 라벨 치환** — `map/forge.html`에서 다음 정확 치환:
  - 사이드바 헤더+버튼 (현재 `<span>전략 문서</span><button class="side-btn" id="newDocBtn">＋ 새 문서</button>`) → `<span>포지</span><button class="side-btn" id="newDocBtn">＋ New Forge</button>`.
  - boot 시드 기본 제목 `title: "새 전략"` → `title: "New Forge"` (boot의 시드 dc 생성부).
  - `newDoc()`의 새 문서 `title: "새 전략"` → `title: "New Forge"`.
  - 삭제 가드 토스트 `"최소 1개 문서는 필요해요"` → `"최소 1개 포지는 필요해요"`.
  - 내보내기 토스트 `"전략 내보내기 완료"` → `"포지 내보내기 완료"`.
  - 시드 메모 노드 라벨 `"전략 메모"` → `"포지 메모"` (seedDefaultStrategy의 memo 노드).
  - (그 외 사용자 가시 텍스트에 "전략 문서"/"새 문서/새 전략"이 더 있으면 동일 규칙으로. 단, `id="newDocBtn"` 등 식별자·`DOCS`/`documents` 키는 절대 변경 금지.)

- [ ] **Step 2: 식별자 불변 확인** — grep로 `DOCS`/`"documents"`/`activeId`/`newDocBtn` 등 식별자가 그대로인지, 변경된 건 표시 문자열뿐인지 확인. `node --test map/forge-core.test.js` → 15/15(코어 무변경 sanity).

- [ ] **Step 3: 커밋**
```bash
git add map/forge.html
git commit -m "feat(forge): 포지 리브랜드 — 사이드바/새 포지/토스트 라벨(New Forge), 내부키 불변"
```

---

## Task 2: 자동 세로/가로 정렬 + 기본 세로

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `boardState`, `measure()`, `renderBoard()`, `fitView()`, `W_NODE`, `bToast`, `markDirty`, `seedDefaultStrategy`, boot 시드/`newDoc`.
- Produces: `parentsOf(id)` → `string[]`; `autoLayout(dir)` (`"v"`/`"h"`); 헤더 `세로 정렬`/`가로 정렬` 버튼; 시드 직후 `autoLayout("v")`로 기본 세로.

- [ ] **Step 1: `parentsOf` + `autoLayout` 추가** — forge.html `<script>`에 (map.html 알고리즘 포팅, forge 식별자):
```js
function parentsOf(id) {
  return boardState.edges.filter(e => e.to === id).map(e => e.from);
}
function autoLayout(dir) {
  if (!boardState.nodes.length) return;
  measure();
  const layer = {}, vis = {};
  const lay = id => {
    if (layer[id] != null) return layer[id];
    if (vis[id]) return 0;
    vis[id] = 1;
    const ps = parentsOf(id);
    let m = 0;
    if (ps.length) m = Math.max(...ps.map(p => lay(p) + 1));
    layer[id] = m; vis[id] = 0; return m;
  };
  boardState.nodes.forEach(n => lay(n.id));
  const byL = {};
  boardState.nodes.forEach(n => { (byL[layer[n.id]] = byL[layer[n.id]] || []).push(n); });
  const layers = Object.keys(byL).map(Number).sort((a, b) => a - b);
  const PAD = 40;
  if (dir === "h") {
    layers.forEach(L => { const col = byL[L].slice().sort((a, b) => a.y - b.y); let cy = PAD; const x = PAD + L * 330; col.forEach(n => { n.x = x; n.y = cy; cy += (n._h || 90) + 38; }); });
    boardState.edges.forEach(e => { e.fromSide = "right"; e.toSide = "left"; });
  } else {
    let cy = PAD; layers.forEach(L => { const row = byL[L].slice().sort((a, b) => a.x - b.x); let cx = PAD, mh = 0; row.forEach(n => { n.x = cx; n.y = cy; cx += (n._w || W_NODE) + 50; mh = Math.max(mh, n._h || 90); }); cy += mh + 56; });
    boardState.edges.forEach(e => { e.fromSide = "bottom"; e.toSide = "top"; });
  }
  renderBoard(); fitView(); markDirty();
  bToast(dir === "h" ? "가로 정렬" : "세로 정렬");
}
```

- [ ] **Step 2: 헤더 정렬 버튼** — 헤더(`.forge-top`, ▷실행/내보내기 근처)에 버튼 2개:
```html
<button class="export-btn" onclick="autoLayout('v')">세로 정렬</button>
<button class="export-btn" onclick="autoLayout('h')">가로 정렬</button>
```
(기존 `.export-btn` 스타일 재사용. `margin-left:auto`가 어느 버튼에 걸렸는지 확인해 정렬 버튼들이 우측 그룹에 자연스럽게 들어가게.)

- [ ] **Step 3: 기본 세로 — 시드 직후 autoLayout('v')** — `seedDefaultStrategy()` 호출 직후의 레이아웃을 세로로:
  - boot의 시드(빈 서버) 경로: 시드 후 따라오는 `renderBoard(); fitView();`를 `autoLayout("v");`로 교체(autoLayout이 render+fit 포함). 그 다음 `const dc = {...}`가 세로 좌표를 캡처하도록 순서 유지.
  - `newDoc()`: `loadDoc(dc.id); seedDefaultStrategy(); renderBoard(); fitView();` 의 `renderBoard(); fitView();`를 `autoLayout("v");`로 교체.
  - (autoLayout은 함수 선언이라 호이스팅 — 호출 위치보다 뒤에 정의돼도 동작.)

- [ ] **Step 4: 헤드리스 검증(오프라인)** — 컨트롤러가 `map/forge.html`을 file://로 헤드리스 로드(서버 없음 → boot 메모리 폴백+시드). 확인: 사이드바 "포지"/"＋ New Forge", 새 포지 제목 "New Forge", **노드가 세로(위→아래 층)로 배치**, `세로 정렬`/`가로 정렬` 버튼 동작(가로 클릭 시 좌→우 재배치), 콘솔 에러 0. + `node --test map/forge-core.test.js` 15/15.

- [ ] **Step 5: 커밋**
```bash
git add map/forge.html
git commit -m "feat(forge): 자동 세로/가로 정렬(autoLayout) + 기본 세로 배치"
```

---

## Self-Review (작성자 점검)

**Spec coverage:**
- §1 R1 리브랜드(헤더/버튼/제목/토스트/메모 라벨, 내부키 불변) → Task 1. ✅
- §2 R3 parentsOf+autoLayout(v/h)+버튼+기본세로(시드 후 autoLayout('v')) → Task 2. ✅
- §4 검증(node 15/15, 헤드리스 오프라인) → 각 Task 검증 Step. ✅
- §5 리스크(markDirty 저장·cycle vis가드·엣지 side 변경·키 불변) → autoLayout 코드(vis 가드)·Task1 식별자 확인. ✅

**Placeholder scan:** 리브랜드 치환 정확 명시, autoLayout 전체 코드 포함. 헤드리스는 컨트롤러(오프라인 폴백). 플레이스홀더 없음.

**Type consistency:** `autoLayout(dir)`·`parentsOf(id)`·`boardState`·`W_NODE`·`bToast`·`markDirty`·`renderBoard`·`fitView` 명칭 forge 기존과 일치. 리브랜드는 표시 문자열만 — `DOCS`/`documents`/`newDocBtn`/`activeId` 불변. autoLayout가 `seedDefaultStrategy` 뒤 호출되는 위치(boot 시드·newDoc)와 정합.
