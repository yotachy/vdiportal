# 캔버스 단순화 (Scoop Forge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** forge.html 캔버스에서 연결선을 완전히 없애고, 중요도·확신을 노드 카드에서 바로 조정하게 하며, 오른쪽 편집 패널은 데이터 입력 전용으로 축소한다 (분석 결과는 그대로 유지).

**Architecture:** UI/상호작용에서만 연결선을 제거하고, 계산 직전 `boardToGraph()`가 "모든 지표 → combine → predict" 위상을 **자동 합성**해 엔진 입력을 보존한다. `forge-core.js`는 무수정. 중요도/확신 슬라이더를 편집 패널에서 노드 카드로 옮긴다.

**Tech Stack:** 순수 HTML/CSS/Vanilla JS, 단일 파일 `map/forge.html`. 엔진은 `map/forge-core.js`(무수정), 테스트는 `map/forge-core.test.js`(node --test).

## Global Constraints

- 단일 HTML 파일 유지. 빌드 도구·프레임워크·외부 라이브러리 추가 금지 (Pretendard CDN 외 의존성 없음).
- 다크 테마 + 골드 토큰(`--gold`) 사용. UI 텍스트 한국어.
- `forge-core.js`·`forge-core.test.js`는 이 작업에서 **수정하지 않는다** (엔진 계약 유지). `node forge-core.test.js`는 항상 98 pass.
- `boardState.edges` 데이터 필드는 저장 포맷 하위호환을 위해 유지한다 (화면엔 안 그림, 신규 생성 안 함).
- 좌표는 월드 좌표. 구조 변경은 `renderBoard()`, 좌표만이면 `paintEdges()` 원칙 유지.
- 검증(UI)은 헤드리스 크로미움 스크린샷/`--dump-dom` 사용 (memory: headless-verify-wsl). 엔진 무변경은 `node forge-core.test.js`로 확인.

---

## 헤드리스 검증 헬퍼 (모든 UI Task에서 사용)

크로미움 헤드리스 셸 경로를 먼저 찾아둔다 (한 번만):

```bash
CHR=$(find ~/.cache/ms-playwright -name 'chrome-headless-shell' -type f 2>/dev/null | head -1)
echo "$CHR"   # 비어 있으면 memory: headless-verify-wsl 절차로 준비
```

스크린샷/DOM 덤프 명령 형태 (라이브러리 추출이 필요하면 `LD_LIBRARY_PATH=/tmp/chrlibs` 접두):

```bash
"$CHR" --headless --no-sandbox --disable-gpu --virtual-time-budget=4000 \
  --window-size=1600,1000 --screenshot=/tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/*/scratchpad/forge.png \
  "file:///home/jschoi0223/projects/vdiportal/map/forge.html"
```

메모리 모드(`file://`)에서 forge.html은 기본 문서로 부팅한다. 샘플 위상 확인이 필요하면 스크린샷 대신 `--dump-dom`으로 `.b-node`/`.b-ew`/`.b-port` 개수를 grep한다.

---

## Task 1: boardToGraph 자동 완전연결 (엔진 입력 보존)

가장 먼저 수행한다. 이후 Task에서 화면 연결선을 없애도 분석이 그대로 작동하도록, 계산 그래프에 위상을 합성한다.

**Files:**
- Modify: `map/forge.html:848-861` (`boardToGraph`)

**Interfaces:**
- Produces: `boardToGraph()` — 반환 `{nodes:[{id,kind,blockType,params,conviction,weight}], edges:[{from,to}]}`. `edges`는 `boardState.edges`가 아니라 **노드에서 합성**한 값. 지표(ma/phasefold/trend/fib/elliott/rsi) → combine(있으면, 없으면 predict) → predict 위상.
- Consumes: `boardState.nodes`, 전역 상수 없음.

- [ ] **Step 1: 현재 boardToGraph 확인**

Read `map/forge.html:848-861`. 현재는 `edges: boardState.edges.map(e => ({from:e.from, to:e.to}))`.

- [ ] **Step 2: boardToGraph를 자동 합성 방식으로 교체**

`map/forge.html:848-861`의 `boardToGraph` 함수 전체를 아래로 교체:

```javascript
  /* ── boardToGraph ────────────────────────────────────────────── */
  /* 연결선 UI를 없앤 뒤에도 엔진 위상을 보존: 지표 → combine(있으면) → predict 를 계산 직전 합성. */
  function synthEdges(nodes) {
    const blocks = nodes.filter(n => n.kind === "block");
    const predict = blocks.find(n => n.blockType === "predict");
    const combine = blocks.find(n => n.blockType === "combine");
    const hub = combine || predict;
    const edges = [];
    if (!hub) return edges;
    // combine 입력에서 제외할 비지표(원본/티커/거래량/허브 자신)
    const SKIP = new Set(["price", "ticker", "volume", "combine", "predict"]);
    blocks.forEach(n => {
      if (n === hub) return;
      if (SKIP.has(n.blockType)) return;
      edges.push({ from: n.id, to: hub.id });
    });
    if (combine && predict && combine !== predict) edges.push({ from: combine.id, to: predict.id });
    return edges;
  }
  function boardToGraph() {
    const nodes = boardState.nodes.map(n => ({
      id: n.id,
      kind: n.kind || "free",
      blockType: n.blockType || null,
      params: n.params || {},
      conviction: n.conviction || 0,
      weight: (n.weight != null ? n.weight : 50)
    }));
    return { nodes, edges: synthEdges(boardState.nodes) };
  }
```

- [ ] **Step 3: 엔진 테스트가 여전히 통과하는지 확인 (엔진 무변경 보증)**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node forge-core.test.js 2>&1 | tail -4`
Expected: `pass 98` / `fail 0`

- [ ] **Step 4: 헤드리스로 기본 문서 분석이 오류 없이 나오는지 확인**

Run: 위 "헤드리스 검증 헬퍼"의 스크린샷 명령으로 `forge.png` 생성 후 Read.
Expected: 판정/차트가 이전처럼 렌더됨 (JS 콘솔 에러 없음). 콘솔 확인이 필요하면 `--dump-dom`으로 `.verdict-inline`/차트 존재 확인.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): boardToGraph 자동 완전연결 — 연결선 없이 엔진 위상 합성"
```

---

## Task 2: 노드 카드에 중요도·확신 인라인 컨트롤 추가

편집 패널에서 옮겨오기 전에, 카드에서 조정할 수단을 먼저 만든다.

**Files:**
- Modify: `map/forge.html:1193-1232` (`nodeHTML`)
- Modify: `map/forge.html` `<style>` 블록 (새 CSS 규칙, `.b-n-wt` 인근 121행대에 추가)
- Modify: `map/forge.html:5097-5139` (paramPanel `input` 위임 — 신규 카드 슬라이더 input 처리)
- Modify: `map/forge.html:1846-1858` (stage pointerdown — 슬라이더 조작 시 노드 드래그/팬 차단)

**Interfaces:**
- Consumes: `applyNodeWeightVisual(n)` (Task 기존), `bN(id)`, `fireBoardChange()`, `weightScale`.
- Produces: 카드 내부 `.b-n-ctrl` 컨트롤(단일 선택 시 CSS로만 표시). 슬라이더 `input.b-ctrl-wt`(중요도 0–100), `input.b-ctrl-conv`(확신 −100~100).

- [ ] **Step 1: CSS 추가 — 인라인 컨트롤 (기본 숨김, 단일 선택 시 표시)**

`map/forge.html`의 `<style>` 안, `/* weight importance badge */`(약 121행) 규칙 **바로 아래**에 추가:

```css
  /* inline node controls (중요도/확신) — 단일 선택 시에만 노출 */
  .b-n-ctrl{display:none;flex-direction:column;gap:5px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}
  .b-node.b-solo .b-n-ctrl{display:flex}
  .b-n-ctrl .cr{display:flex;align-items:center;gap:7px}
  .b-n-ctrl .cr label{flex:0 0 34px;font-size:9.5px;font-weight:700;letter-spacing:.02em;color:var(--eth)}
  .b-n-ctrl .cr input[type=range]{flex:1;min-width:0;height:14px;accent-color:var(--gold);cursor:pointer}
  .b-n-ctrl .cr .cv{flex:0 0 30px;text-align:right;font-size:10px;font-weight:700;color:var(--gold);font-family:ui-monospace,monospace}
```

- [ ] **Step 2: nodeHTML에 컨트롤 마크업 추가**

`map/forge.html:1224-1231`의 `return` 템플릿에서 `<div class="b-n-body">…</div>` 다음, 닫는 요소들 앞에 `.b-n-ctrl` 블록을 삽입한다. 현재:

```javascript
  ${wbadge}${thumb}<div class="b-n-body">
    <div class="b-n-title" contenteditable="true" data-field="title">${esc(n.title || "")}</div>
    ${tkrBody}${badge}
  </div>
  ${ports}
</div>`;
```

로 되어 있는 것을 아래로 교체 (`${ports}`는 다음 Task에서 제거하므로 이 Task에선 그대로 둔다):

```javascript
  ${wbadge}${thumb}<div class="b-n-body">
    <div class="b-n-title" contenteditable="true" data-field="title">${esc(n.title || "")}</div>
    ${tkrBody}${badge}
    <div class="b-n-ctrl">
      <div class="cr"><label>중요도</label><input type="range" class="b-ctrl-wt" min="0" max="100" step="1" value="${wt}"><span class="cv">${wt}</span></div>
      <div class="cr"><label>확신</label><input type="range" class="b-ctrl-conv" min="-100" max="100" step="1" value="${n.conviction || 0}"><span class="cv">${n.conviction || 0}</span></div>
    </div>
  </div>
  ${ports}
</div>`;
```

- [ ] **Step 3: 단일 선택 노드에 `b-solo` 클래스 부여 (applySel)**

`map/forge.html:1316-1323`의 `applySel`을 아래로 교체:

```javascript
  function applySel() {
    if (!bWorld) return;
    const solo = sel.length === 1 ? sel[0] : null;
    bWorld.querySelectorAll(".b-node").forEach(el => {
      el.classList.toggle("selected", sel.includes(el.dataset.id));
      el.classList.toggle("b-solo", el.dataset.id === solo);
    });
    renderParams();
    syncFocusFromSel();
  }
```

- [ ] **Step 4: 슬라이더 조작이 노드 드래그/팬으로 번지지 않게 차단**

`map/forge.html:1846`의 `bStage.addEventListener("pointerdown", e => {` 본문 맨 앞(첫 줄 `if (e.target.closest(".b-hbar,.b-hbtn")) return;` **다음**)에 한 줄 추가:

```javascript
      if (e.target.closest(".b-n-ctrl")) return;   // 카드 인라인 슬라이더는 드래그/팬 대상 아님
```

- [ ] **Step 5: 슬라이더 input 처리 — paramPanel이 아니라 world(카드)에 위임**

`map/forge.html`의 `bWorld` 초기화 근처(world click 위임이 있는 `bWorld.addEventListener("click", …)` 등록부 바로 위/아래, 약 1877행)에 새 위임 리스너를 추가:

```javascript
    /* 카드 인라인 중요도/확신 슬라이더 */
    bWorld.addEventListener("input", e => {
      const t = e.target;
      const card = t.closest(".b-node"); if (!card) return;
      const n = bN(card.dataset.id); if (!n) return;
      if (t.classList.contains("b-ctrl-wt")) {
        n.weight = Number(t.value);
        const cv = t.parentElement.querySelector(".cv"); if (cv) cv.textContent = n.weight;
        applyNodeWeightVisual(n);
        fireBoardChange();
      } else if (t.classList.contains("b-ctrl-conv")) {
        n.conviction = Number(t.value) || 0;
        const cv = t.parentElement.querySelector(".cv"); if (cv) cv.textContent = n.conviction;
        fireBoardChange();
      }
    });
```

- [ ] **Step 6: 헤드리스로 카드 컨트롤 노출 확인**

Run: `--dump-dom`으로 forge.html을 덤프 후 `b-n-ctrl` 문자열이 각 노드에 있는지, `.b-node.b-solo`가 초기엔 없는지 확인 (초기엔 미선택). 스크린샷으로도 노드 카드가 정상 렌더되는지 Read.
Expected: 마크업에 `b-n-ctrl` 존재, 레이아웃 깨짐 없음.

- [ ] **Step 7: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): 노드 카드 인라인 중요도/확신 슬라이더 (단일 선택 시)"
```

---

## Task 3: 연결선·포트 UI 완전 제거

카드 컨트롤이 준비됐으니, 포트/연결선/엣지 HUD/생성 상호작용을 화면에서 없앤다.

**Files:**
- Modify: `map/forge.html:1193-1232` (`nodeHTML` — 포트 제거)
- Modify: `map/forge.html:1290-1303` (`paintEdges` — 아무것도 그리지 않음)
- Modify: `map/forge.html:1620-1630` (`nodePointerDown` — 포트 분기 제거)
- Modify: `map/forge.html:1846-1858` (stage pointerdown — 엣지/핸들 분기 제거)

**Interfaces:**
- Consumes: 없음(제거 위주). `boardState.edges`는 남지만 렌더/생성에 쓰이지 않음.
- Produces: 화면에 `.b-port`/`.b-ew`/`.b-eh`/엣지 HUD가 전혀 없음. `paintEdges()`는 호출돼도 `#bEdgeG`를 비우기만 함(다른 함수의 기존 호출과 안전 공존).

- [ ] **Step 1: nodeHTML에서 포트 마크업 제거**

`map/forge.html:1194-1199`의 `ports` 상수 정의를 아래로 교체(빈 문자열):

```javascript
    const ports = "";   // 연결선 UI 제거 — 포트 없음
```

(템플릿의 `${ports}`는 빈 문자열이 되어 무해. 상수를 지우면 참조 오류가 나므로 반드시 빈 문자열로 유지.)

- [ ] **Step 2: paintEdges를 비우기 전용으로 교체**

`map/forge.html:1290-1303` 부근 `paintEdges` 함수 전체를 아래로 교체(엣지 path·히트영역·엣지 HUD 모두 미생성):

```javascript
  /* ── paintEdges ──────────────────────────────────────────────── */
  /* 연결선 UI 제거: 엣지 레이어를 비우기만 한다(다른 곳의 기존 호출과 안전 공존). */
  function paintEdges() {
    if (!bWorld) return;
    const edgeG = document.getElementById("bEdgeG");
    if (edgeG) edgeG.innerHTML = "";
    const ehud = document.getElementById("bEhud");
    if (ehud) ehud.innerHTML = "";
  }
```

주의: 기존 `paintEdges` 본문이 여러 줄(약 1291–1315)이므로 `drawEhud()` 호출 및 `return` 문까지 함수 끝 `}`을 포함해 통째로 교체할 것. 교체 전 Read로 함수의 정확한 끝 위치를 확인한다.

- [ ] **Step 3: nodePointerDown에서 포트 링크 분기 제거**

`map/forge.html:1620-1630`의 `nodePointerDown`을 아래로 교체:

```javascript
  function nodePointerDown(id, e) {
    const t = e.target;
    if (t.closest("[data-act]")) return;
    const ed = t.closest(".b-n-title");
    if (ed && document.activeElement === ed) return;
    drag = { type: "nodePending", id, sx: e.clientX, sy: e.clientY };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
```

- [ ] **Step 4: stage pointerdown에서 엣지/핸들 분기 제거**

`map/forge.html:1846-1858`의 stage `pointerdown` 리스너를 아래로 교체 (Task 2 Step 4에서 넣은 `.b-n-ctrl` 가드 포함):

```javascript
    bStage.addEventListener("pointerdown", e => {
      if (e.target.closest(".b-hbar,.b-hbtn")) return;
      if (e.target.closest(".b-n-ctrl")) return;   // 카드 인라인 슬라이더는 드래그/팬 대상 아님
      if (e.button === 1 || (spaceDown && e.button === 0)) { startPan(e); return; }
      if (e.button !== 0) return;
      const nodeEl = e.target.closest(".b-node");
      if (nodeEl) { nodePointerDown(nodeEl.dataset.id, e); return; }
      if (e.ctrlKey || e.metaKey) { startMarquee(e); return; }
      startPan(e, true);
    });
```

- [ ] **Step 5: 헤드리스로 포트·연결선 부재 확인**

Run: `--dump-dom`으로 덤프 후 `class="b-port"`, `class="b-ew`, `class="b-eh"` 문자열이 **0건**인지 grep. 스크린샷으로 노드만 있고 선이 없는지 Read.
Expected: 포트/엣지 마크업 0건, 캔버스에 선 없음, 노드 드래그·팬·선택은 정상.

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): 연결선·포트 UI 완전 제거 (포트/엣지 렌더/생성 상호작용 제거)"
```

---

## Task 4: 편집 패널에서 중요도·확신·가중결합 가중치 제거

카드로 옮겼으니 오른쪽 패널의 "가중치" 섹션과 combine 가중치 입력을 없앤다.

**Files:**
- Modify: `map/forge.html:1390-1397` (renderParams — combine 가중치 rows)
- Modify: `map/forge.html:1438-1444` (renderParams — "가중치" 섹션 + 중요도/확신 슬라이더)
- Modify: `map/forge.html:5109-5118` (paramPanel input 위임 — `wkey`/`ppWeight`/`ppConv` 처리 제거)

**Interfaces:**
- Consumes: 없음(제거 위주).
- Produces: 편집 패널에 "가중치" 섹션 없음. combine 노드에 연결선별 가중치 입력 없음. 중요도/확신은 카드에서만(Task 2).

- [ ] **Step 1: combine 가중치 rows 제거**

`map/forge.html:1390-1397`의 아래 블록을:

```javascript
    if (n.blockType === "combine") {
      boardState.edges.filter(e => e.to === n.id).forEach(e => {
        const src = bN(e.from);
        const w = (n.params && n.params.weights && n.params.weights[e.from]) ?? 1;
        rows.push(`<div class="pp-row"><label>${esc((src && src.title) || e.from)}</label>
          <input type="number" step="0.1" data-wkey="${e.from}" value="${w}"></div>`);
      });
    }
```

통째로 삭제한다 (combine 종합은 노드 중요도로 자동 계산됨).

- [ ] **Step 2: "가중치" 섹션(중요도/확신 슬라이더) 제거**

`map/forge.html:1438-1444`의 아래 세 줄 묶음을:

```javascript
       <div class="ne-sec">가중치</div>
       <div class="pp-row"><label>중요도</label>
         <input type="range" id="ppWeight" min="0" max="100" step="1" value="${wt}">
         <span class="pp-conv-val" id="ppWeightVal">${wt}</span></div>
       <div class="pp-row"><label>확신</label>
         <input type="range" id="ppConv" min="-100" max="100" step="1" value="${conv}">
         <span class="pp-conv-val" id="ppConvVal">${conv}</span></div>
```

`panel.innerHTML` 템플릿에서 통째로 삭제한다. 삭제 후 `${dataSec}${paramSec}${calSec}` 다음이 곧바로 `<div class="ne-sec">서술 메모</div>`로 이어지도록 한다. (`conv`/`wt` 지역변수는 다른 곳에서 안 쓰면 남겨도 무해하나, 미사용 경고 방지 위해 남겨둬도 됨.)

- [ ] **Step 3: paramPanel input 위임에서 제거된 컨트롤 분기 삭제**

`map/forge.html:5109-5118`의 아래 세 분기를:

```javascript
        } else if (t.dataset.wkey) {
          n.params = n.params || {}; n.params.weights = n.params.weights || {};
          n.params.weights[t.dataset.wkey] = Number(t.value) || 0;
        } else if (t.id === "ppWeight") {
          n.weight = Number(t.value);
          const v = document.getElementById("ppWeightVal"); if (v) v.textContent = n.weight;
          applyNodeWeightVisual(n);
        } else if (t.id === "ppConv") {
          n.conviction = Number(t.value) || 0;
          const v = document.getElementById("ppConvVal"); if (v) v.textContent = n.conviction;
```

삭제한다. 남는 `else if` 체인이 `t.dataset.pkey` → 다음으로 `t.id === "ppNote"`로 바로 이어지도록 연결한다 (문법 깨지지 않게 `} else if` 접합 확인).

- [ ] **Step 4: 헤드리스로 패널 축소 확인**

Run: `--dump-dom`에서 `id="ppWeight"`, `id="ppConv"`, `data-wkey` 문자열이 **0건**인지 grep(노드 선택 상태를 강제하려면 memory: headless-verify-wsl의 앵커 주입으로 `selectOnly(첫 노드)` 실행 후 덤프). 최소한 소스에 해당 마크업 생성 코드가 없어야 함.
Expected: 세 문자열 0건. 편집 패널엔 제목·데이터·메모·삭제만 남음.

- [ ] **Step 5: 엔진 테스트 재확인 (무변경 보증)**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node forge-core.test.js 2>&1 | tail -4`
Expected: `pass 98` / `fail 0`

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): 편집 패널 축소 — 중요도/확신·가중결합 가중치 제거(카드로 이동)"
```

---

## Task 5: 신규 노드 겹침 방지 오프셋

노드 클릭 추가 시 같은 자리에 쌓이지 않도록 계단식 오프셋을 준다.

**Files:**
- Modify: `map/forge.html:1523-1541` (`addBlock`)

**Interfaces:**
- Consumes: `boardState.nodes`, `worldPt`, `bStage`, `W_NODE`.
- Produces: 연속 추가 시 노드 위치가 24px씩 어긋남.

- [ ] **Step 1: addBlock에 계단식 오프셋 추가**

`map/forge.html:1523-1541`의 `addBlock`에서 좌표 계산부를 아래로 교체. 현재:

```javascript
    const r = bStage.getBoundingClientRect();
    const c = worldPt(r.left + r.width / 2, r.top + r.height / 2);
    const halfW = d.kind === "free" ? 70 : W_NODE / 2;
    const n = {
      id: uid("n"),
      x: c.x - halfW,
      y: c.y - 35,
```

를:

```javascript
    const r = bStage.getBoundingClientRect();
    const c = worldPt(r.left + r.width / 2, r.top + r.height / 2);
    const halfW = d.kind === "free" ? 70 : W_NODE / 2;
    const off = (boardState.nodes.length % 8) * 24;   // 겹침 방지 계단식 오프셋
    const n = {
      id: uid("n"),
      x: c.x - halfW + off,
      y: c.y - 35 + off,
```

- [ ] **Step 2: 헤드리스로 연속 추가가 겹치지 않는지 확인**

Run: memory: headless-verify-wsl 앵커 주입으로 `addBlock('ma');addBlock('rsi');addBlock('trend');` 실행 후 스크린샷 Read.
Expected: 세 노드가 계단식으로 어긋나 보임.

- [ ] **Step 3: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): 신규 노드 계단식 오프셋(겹침 방지)"
```

---

## Task 6: 통합 검증 + 배포

**Files:** 없음(검증·배포).

- [ ] **Step 1: 엔진 테스트 최종 확인**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node forge-core.test.js 2>&1 | tail -4`
Expected: `pass 98` / `fail 0`

- [ ] **Step 2: 헤드리스 최종 스크린샷 — 4개 항목 시각 확인**

스크린샷을 Read로 확인:
1. 캔버스에 연결선·포트가 전혀 없다.
2. 노드 단일 선택 시 카드에 중요도/확신 슬라이더가 뜬다(앵커 주입 `selectOnly(첫 노드)` 후 캡처).
3. 오른쪽 편집 패널에 "가중치" 섹션이 없다.
4. 샘플/기본 문서 판정·예측 차트가 정상 렌더된다.

- [ ] **Step 3: 배포 (memory: vdi-map-deploy — git + cafe24 `www/map/` 한 세트)**

커밋들을 push하고, memory: vdi-map-deploy 절차대로 `map/forge.html`을 cafe24 `www/map/`에 업로드한다. `map_data.json`·`map_images.json`·`forge_*_data` 등 **사용자 데이터 파일은 덮어쓰지 않는다**(불가침).

---

## Self-Review

**Spec coverage:**
- 설계 §1 연결선 완전 제거(UI) → Task 3. 자동 완전연결 → Task 1. 가중결합 가중치 제거 → Task 4 Step 1/3. ✅
- §2 중요도·확신 카드 인라인 → Task 2. ✅
- §3 편집 패널 대폭 축소(가중치 제거, 데이터 입력 유지) → Task 4. ("빈 패널 처리"는 데이터 없는 노드에 대해 별도 UI 미도입 — YAGNI, 패널은 제목/메모/삭제만 표시되어 충분히 간결. 명시적 확정.) ✅
- §4 노드 추가=클릭 + 겹침 오프셋 → Task 5. ✅
- §"분석 결과 보존" → Task 1 + 각 Task의 `forge-core.test.js` 확인. ✅
- §영향 범위: forge-core.js 무수정, edges 필드 유지 → 전 Task 준수. ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "적절히 처리" 류 없음. 검증은 헤드리스 명령/엔진 테스트로 구체화. ✅

**Type consistency:**
- `synthEdges(nodes)` / `boardToGraph()` — Task 1에서 정의, 반환 형태 명시.
- 카드 슬라이더 클래스 `b-ctrl-wt`/`b-ctrl-conv`, 컨테이너 `.b-n-ctrl`, 선택 클래스 `b-solo` — Task 2에서 정의, Task 3 Step 4 가드에서 `.b-n-ctrl` 동일 사용. ✅
- `paintEdges()` — Task 3에서 시그니처 유지(인자 없음), 기존 호출부(`renderBoard`, `applyNodeWeightVisual`, `measure` 후 등) 그대로 안전. ✅
- 제거 대상 id `ppWeight`/`ppConv`/`data-wkey` — Task 4에서 생성부(렌더)와 소비부(input 위임) 양쪽 제거로 일치. ✅

이상 없음.
