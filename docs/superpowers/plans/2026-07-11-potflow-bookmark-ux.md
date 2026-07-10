# PotFlow 책갈피 노드 UX·자동화·썸네일수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 썸네일 액박 수정, 책갈피 노드 하위 스타일(배지·큰 썸네일·시간줄 제거), 책갈피 자동 추가+자동 정렬, 그룹 이동 시 멤버 동반, 노드 클릭 시 우측 목록 강조.

**Tech Stack:** 바닐라 JS 단일 HTML.

## Global Constraints
- 바닐라 JS·단일 파일·외부 라이브러리 금지. **좌측 accent 라인 금지**. 한국어 UI.
- 수정 파일: `map/potflow.html`만.
- 클라 검증: 인라인 `<script>` 추출 후 `node --check`; 헤드리스 Windows Chrome 스크린샷(READ해서 확인).

---

## Task 1: 썸네일 액박 수정

**Files:** Modify `map/potflow.html`

- [ ] **Step 1: nodeHTML img 가드**
`nodeHTML`의 full 분기 `if(n.thumb) media=...` 를 교체:
```js
  let media;
  if(n.thumb && imgSrc(n.thumb.imgId)) media=`<div class="n-thumb"><img src="${imgSrc(n.thumb.imgId)}" onclick="zoom('${n.id}')" alt=""><span class="zh">⤢</span>
     <span class="rmth edit-only" data-act="rmthumb">✕</span>${n.thumb.label?`<span class="cap">${esc(n.thumb.label)}</span>`:''}</div>`;
  else media=`<div class="n-drop edit-only">썸네일 드래그</div>`;
```
(이미지 없으면 `<img src="">` 대신 플레이스홀더 → 액박 방지.)

- [ ] **Step 2: userImagesOnly에 bm_ 포함**
```js
function userImagesOnly(){const o={};LIBRARY.forEach(l=>{if(IMAGES[l.id])o[l.id]=IMAGES[l.id]});Object.keys(IMAGES).forEach(k=>{if(k.startsWith('vthumb_')||k.startsWith('bm_'))o[k]=IMAGES[k]});return o}
```

- [ ] **Step 3: 검증 + 커밋**
`node --check` OK. 헤드리스 로드 정상.
```bash
git add map/potflow.html && git commit -m "fix(potflow): 썸네일 액박 방지(img 가드) + 로컬 저장에 bm_ 썸네일 포함"
```

---

## Task 2: 책갈피 노드 하위 스타일(배지·큰 썸네일·시간줄 제거)

**Files:** Modify `map/potflow.html`

- [ ] **Step 1: nodeHTML 책갈피 분기 추가**
`nodeHTML`에서 full return 직전에 추가(`n.bmParent!=null`이면 책갈피 스타일):
```js
  if(n.bmParent!=null){
    const has=n.thumb&&imgSrc(n.thumb.imgId);
    const media=has?`<div class="n-thumb bm-thumb"><img src="${imgSrc(n.thumb.imgId)}" onclick="zoom('${n.id}')" alt=""><span class="zh">⤢</span></div>`:`<div class="n-drop edit-only">썸네일</div>`;
    return `<div class="node bm" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px${bg}">${head}
      <div class="n-body"><div class="n-title bm-title"><span class="bm-badge">🔖</span><span class="bm-name" contenteditable="${ce()}" data-field="title">${esc(n.title)}</span></div>${media}</div>${ports}</div>`;
  }
```
(desc(시간) 줄 없음. 편집 대상은 data-field="title" 스팬.)
그리고 syncBookmarks가 `c.desc=fmtClock(...)` 세팅하는 줄은 남겨도 렌더 안 되므로 무해(원하면 제거 가능).

- [ ] **Step 2: CSS(하위 느낌·큰 썸네일)** — 기존 `.node`/`.n-thumb` 규칙 근처에 추가. 기본 `.n-thumb` 높이를 grep로 확인해 **bm-thumb는 더 크게**:
```css
  .node.bm{width:196px;border-color:var(--gold-dim)}
  .bm-title{display:flex;align-items:center;gap:5px;min-width:0}
  .bm-title .bm-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bm-badge{color:var(--gold);flex:none}
  .bm-thumb,.bm-thumb img{height:150px}
  .bm-thumb img{width:100%;object-fit:cover}
```
(좌측 accent 라인 금지 — 테두리·배지로만 구분.)

- [ ] **Step 3: 검증 + 커밋**
`node --check` OK. 헤드리스: 시드 데이터(책갈피 노드 bmParent+thumb)로 스크린샷 → 🔖 배지·큰 썸네일·시간줄 없음 확인(READ). 시드 potflow_data.json은 커밋 금지(gitignore)·삭제.
```bash
git add map/potflow.html && git commit -m "feat(potflow): 책갈피 노드 하위 스타일(🔖배지·큰 썸네일·시간줄 제거)"
```

---

## Task 3: 책갈피 자동 추가 + 자동 정렬

**Files:** Modify `map/potflow.html`

- [ ] **Step 1: 부팅/캔버스 로드 시 루트 영상 자동 동기화**
`loadCanvas` 말미(탐색기 복원 근처)에 추가:
```js
  if(HELPER_OK)setTimeout(()=>{state.nodes.filter(n=>n.videoPath&&n.bmParent==null).forEach(n=>syncBookmarks(n.id));},50);
```
(헬퍼 온라인이면 캔버스의 모든 루트 영상 노드 책갈피 자동 동기화 — 재방문·인코딩수정 자동 반영. 수동 버튼 유지.)

- [ ] **Step 2: syncBookmarks 자동 정렬(항상 깔끔 재배치)**
`syncBookmarks`의 노드 생성/갱신 루프에서 **위치를 항상 부모 기준으로 재설정**(신규뿐 아니라 기존도) — `bms.forEach` 안, 노드 확보 후:
```js
      if(!c){c=makeNode(0,0,'',"full");c.bmParent=nodeId;c.seekMs=b.ms;c.videoPath=n.videoPath;}
      c.x=n.x+(i+1)*240;c.y=n.y;   // 항상 부모 오른쪽으로 균등 배치(자동 정렬)
```
(기존 `makeNode(n.x+(i+1)*270,n.y,...)` 대신 위처럼 생성은 0,0 후 매 sync마다 x/y 재설정. 하위 노드 한정 — 자동정렬 우선.)

- [ ] **Step 3: 검증 + 커밋**
`node --check` OK. 헤드리스 로드 정상(치명오류 없음). 실제 자동동기화는 로컬 pbf 필요 — 구조 검토.
```bash
git add map/potflow.html && git commit -m "feat(potflow): 책갈피 자동 동기화(로드 시) + 하위노드 자동 정렬"
```

---

## Task 4: 그룹 이동 시 멤버 노드 동반 이동

**Files:** Modify `map/potflow.html`

- [ ] **Step 1: 그룹 박스 드래그 시작**
stage pointerdown 디스패처(edit 모드)에서 `nodeEl` 처리 뒤, marquee/pan 폴백 앞에 추가:
```js
    const grp=e.target.closest('.group');if(grp){startGroupDrag(grp.dataset.gid,e);return;}
```
`startMarquee`/`startPan` 근처에 추가:
```js
function startGroupDrag(gid,e){const g=G(gid);if(!g)return;drag={type:'group',gid,sx:e.clientX,sy:e.clientY,moved:false,origins:g.nodes.map(N).filter(Boolean).map(n=>({id:n.id,ox:n.x,oy:n.y}))};window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp);}
```

- [ ] **Step 2: onMove/onUp에 group 처리**
`onMove`에 (pan 분기 근처) 추가:
```js
  if(drag.type==='group'){drag.moved=true;const dx=(e.clientX-drag.sx)/view.scale,dy=(e.clientY-drag.sy)/view.scale;drag.origins.forEach(o=>{const n=N(o.id);if(!n)return;n.x=o.ox+dx;n.y=o.oy+dy;const el=q(o.id);if(el){el.style.left=n.x+'px';el.style.top=n.y+'px';}});paint();return;}
```
`onUp`에 추가(node 분기 근처):
```js
  if(d.type==='group'){if(d.moved)markDirty();return;}
```

- [ ] **Step 3: 그룹 박스 드래그 가능 확인**
`.group` CSS의 pointer-events/z-index 확인(grep): 그룹 박스가 노드보다 뒤(낮은 z-index)이고 pointer-events로 잡혀야 함. 노드 클릭이 그룹 드래그보다 우선(디스패처가 nodeEl 먼저 체크). 필요 시 `.group{pointer-events:auto}` 유지·보정. **노드 위 클릭은 노드 드래그, 그룹 빈 영역 클릭은 그룹 드래그**가 되도록.

- [ ] **Step 4: 검증 + 커밋**
`node --check` OK. 헤드리스 로드 정상(그룹 렌더). 실제 드래그는 구조/로직 검토(리포트 명시).
```bash
git add map/potflow.html && git commit -m "feat(potflow): 그룹 박스 드래그로 멤버 노드 동반 이동"
```

---

## Task 5: 노드 클릭 → 우측 목록 제목 깜빡임

**Files:** Modify `map/potflow.html`

- [ ] **Step 1: highlightInList + CSS**
`selectOnly` 근처에:
```js
function highlightInList(id){const n=N(id);if(!n||!n.videoPath)return;const rb=document.getElementById('rsBody');if(!rb)return;const row=[...rb.querySelectorAll('.rs-file')].find(r=>r.dataset.path===n.videoPath);if(!row)return;document.querySelectorAll('.rs-blink').forEach(x=>x.classList.remove('rs-blink'));void row.offsetWidth;row.classList.add('rs-blink');try{row.scrollIntoView({block:'nearest'});}catch(_){}}
```
CSS 추가:
```css
  @keyframes rsblink{0%,100%{background:transparent}50%{background:var(--gold-dim)}}
  .rs-file.rs-blink{animation:rsblink .5s ease 3}
```

- [ ] **Step 2: 노드 클릭 시 호출**
`onUp`의 `nodePending` 분기에서 단일 선택 시 호출:
```js
  if(d.type==='nodePending'){if(e.shiftKey)toggleSel(d.id);else{selectOnly(d.id);highlightInList(d.id);}selEdge=null;paint();return}
```

- [ ] **Step 3: 검증 + 커밋**
`node --check` OK. 헤드리스 로드 정상. 실제 깜빡임은 목록에 파일 있어야 — 구조 검토.
```bash
git add map/potflow.html && git commit -m "feat(potflow): 노드 클릭 시 우측 파일목록 해당 행 깜빡임 강조"
```

---

## Self-Review
- **Spec 커버**: A=T1 · B=T2 · C=T3 · D=T4 · E=T5. ✅
- **Placeholder**: 각 스텝 실제 코드. ✅
- **Type/이름 일관**: `highlightInList`·`startGroupDrag`·`bm`/`bm-thumb`·`userImagesOnly(bm_)`. onMove/onUp에 group 분기. syncBookmarks 위치 재설정. ✅
- **주의**: 책갈피 노드 렌더는 `bmParent!=null` 분기(full보다 먼저). 자동정렬은 하위노드만(부모/일반노드 위치 유지). 그룹 드래그는 노드 클릭 우선. 액박 가드는 full+bm 양쪽.
