# 다이어그램 작성 도구 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `map.html`에 연결선 방향·스타일(실선/점선/화살표), 노드 타입(mini/icon), 좌측 세로 툴 레일, 자석(스냅) 정렬, 플랫 아이콘 팔레트를 추가한다.

**Architecture:** 단일 파일 바닐라 JS 확장. 엣지는 SVG `<marker>`로 방향 표시 + `stroke-dasharray`로 점선. 노드는 `type` 필드로 full/mini/icon 분기 렌더. 좌측 신설 툴 레일이 자석/선기본값/노드추가/아이콘 팔레트를 호스팅. 드래그 스냅은 다른 카드 기준선 비교 + 골드 가이드선. 모든 신규 필드는 작은 스칼라(POST <128KB 무관).

**Tech Stack:** HTML5/CSS3/Vanilla JS(무빌드, 단일 파일), SVG marker/dasharray, inline SVG 아이콘. 검증은 헤드리스 chrome-headless-shell + CDP(node 내장 WebSocket).

## Global Constraints

- 순수 HTML/CSS/Vanilla JS. 프레임워크·번들러·외부 아이콘 라이브러리 금지. `map.html` 단일 파일 유지.
- 디자인 토큰만(`--gold:#ffbc00`·`--edge`·`--surface`·`--line` 등). 다크+골드. 하드코딩 색 지양(파일 기존 관례 한도 내).
- 2-space 들여쓰기, 큰따옴표, 케밥케이스. UI 한국어.
- 엣지 SVG 구조(`#edges` `left/top:-10000` `20000×20000` `overflow:visible` + `#edgeG translate(10000,10000)`) 유지. marker는 `#edges` 내부 `<defs>`에 둔다.
- `.world`에 `will-change:transform` 금지. `nodeAt()` 좌표 판정 유지(`elementFromPoint` 금지).
- 모든 POST 본문 <128KB(이미지 분리저장 유지). 신규 필드는 전부 작음.
- 구버전 호환: `node.type` 없으면 full, `edge.style` 없으면 solid, `edge.arrow` undefined면 true.
- 신규 id는 `uid('n'|'e'|'g')`. 배포: cafe24 `www/map/`(map.html만; map_data.json/map_images.json 불가침). 연결문자열 `sftp://parksvc:wjdtjd2@@parksvc.mycafe24.com`(`@@` 정상).
- 로컬 검증: `sed -n '/^<script>/,/^<\/script>/p' map.html | sed '1d;$d' > /tmp/c.js && node --check /tmp/c.js`. 시각/동작 검증은 컨트롤러가 헤드리스 CDP로.

---

### Task 1: 연결선 강화 (화살표 marker + 점선 + 엣지 컨트롤 + 기본값)

**Files:** Modify: `map/map.html`

**Interfaces:**
- Consumes: 기존 `paint()`, `drawEhud()`, `edgeGeo()`, `addEdge()`, world click 위임, `markDirty()`, `E(id)`, `loadCanvas()`.
- Produces: `let TOOLBAR={snap:true,edgeStyle:"solid",edgeArrow:true}` (Task 3가 UI/영속 연결). 엣지 필드 `style`('solid'|'dashed')·`arrow`(bool). 마커 `#arw`·`#dot`.

- [ ] **Step 1: TOOLBAR 전역 추가**

`map.html`에서 `let canvases=[]; let activeId=null; let SERVER_OK=false;` 줄 **다음**에 추가:
```js
let TOOLBAR={snap:true,edgeStyle:"solid",edgeArrow:true};
```

- [ ] **Step 2: SVG marker `<defs>` 추가**

`<svg class="edges" id="edges">` 의 여는 태그 바로 뒤(`<g id="edgeG"` 앞)에 삽입:
```html
<defs>
        <marker id="arw" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"></path></marker>
        <marker id="dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><circle cx="5" cy="5" r="3.5" fill="context-stroke"></circle></marker>
      </defs>
```
(결과: `<svg class="edges" id="edges"><defs>…</defs><g id="edgeG" …>`)

- [ ] **Step 3: paint() — 엣지에 marker·dasharray 적용**

`paint()`의 `document.getElementById('edgeG').innerHTML=...` 매핑을 교체:
```js
function paint(){
  document.getElementById('edgeG').innerHTML=state.edges.map(e=>{const g=edgeGeo(e);if(!g)return'';
    const dash=e.style==='dashed'?'stroke-dasharray:7 5':'';
    const mk=(e.arrow!==false)?'marker-start="url(#dot)" marker-end="url(#arw)"':'';
    return `<path class="ew ${selEdge===e.id?'sel':''}" style="${dash}" ${mk} d="${g.d}"/><path class="eh" data-edge="${e.id}" d="${g.d}"/>`}).join('');
  layoutGroups(); drawEhud();
}
```

- [ ] **Step 4: drawEhud() — 선/화살표 토글 버튼 추가**

`drawEhud()`의 `hud.innerHTML=...` 를 교체(버튼 4개를 중앙에 분산):
```js
  hud.innerHTML=`<div class="ehandle" data-end="from" style="left:${g.A.x}px;top:${g.A.y}px"></div>
    <div class="ehandle" data-end="to" style="left:${g.B.x}px;top:${g.B.y}px"></div>
    <div class="edel" data-edel="1" style="left:${mx-33}px;top:${my}px">✕</div>
    <div class="erev" data-erev="1" title="시작/끝 바꾸기" style="left:${mx-11}px;top:${my}px">⇄</div>
    <div class="erev" data-eline="1" title="실선/점선" style="left:${mx+11}px;top:${my}px">${e.style==='dashed'?'┄':'─'}</div>
    <div class="erev" data-earrow="1" title="화살표 켜기/끄기" style="left:${mx+33}px;top:${my}px">${e.arrow!==false?'▶':'╴'}</div>`;
```

- [ ] **Step 5: world click — 선/화살표 토글 처리**

world click 핸들러에서 `if(e.target.closest('[data-edel]'))...` 줄 **다음**에 추가:
```js
  if(e.target.closest('[data-eline]')){if(selEdge){const ed=E(selEdge);ed.style=ed.style==='dashed'?'solid':'dashed';paint();markDirty()}return}
  if(e.target.closest('[data-earrow]')){if(selEdge){const ed=E(selEdge);ed.arrow=!(ed.arrow!==false);paint();markDirty()}return}
```

- [ ] **Step 6: addEdge — 기본 스타일 적용 + loadCanvas 호환 보정**

addEdge 교체(새 엣지에 TOOLBAR 기본값):
```js
function addEdge(from,fromSide,to,toSide){if(from===to)return;if(state.edges.some(e=>e.from===from&&e.to===to))return;state.edges.push({id:uid('e'),from,fromSide:fromSide||'right',to,toSide:toSide||'left',style:TOOLBAR.edgeStyle,arrow:TOOLBAR.edgeArrow});markDirty()}
```
loadCanvas의 엣지 정규화 줄 `state.edges.forEach(e=>{if(!e.fromSide)e.fromSide='right';if(!e.toSide)e.toSide='left'});` 를 교체:
```js
  state.edges.forEach(e=>{if(!e.fromSide)e.fromSide='right';if(!e.toSide)e.toSide='left';if(!e.style)e.style='solid';if(e.arrow===undefined)e.arrow=true});
```

- [ ] **Step 7: 문법검증 + 배포**

```bash
cd /home/jschoi0223/projects/vdiportal/map
sed -n '/^<script>/,/^<\/script>/p' map.html | sed '1d;$d' > /tmp/c.js && node --check /tmp/c.js && echo "SYNTAX OK"
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:wjdtjd2@@parksvc.mycafe24.com; cd www/map; put map.html"
curl -s -o /dev/null -w "%{http_code}\n" https://parksvc.mycafe24.com/map/map.html
```
컨트롤러가 헤드리스로 확인: 기본 엣지에 끝 화살표·시작 점 렌더, 엣지 선택 후 점선/화살표 토글 동작, ⇄ 반전 시 화살표 반전, JS에러0.

- [ ] **Step 8: 커밋**
```bash
cd /home/jschoi0223/projects/vdiportal && git add map/map.html
git commit -m "map: 연결선 강화 — 화살표 marker(시작점·끝화살표)·실선/점선·엣지 토글·기본값

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 노드 타입 (mini/icon) + 단축키 (Tab/Enter)

**Files:** Modify: `map/map.html`

**Interfaces:**
- Consumes: `nodeHTML()`, `makeNode()`, `addChild/addSibling/addParent`, keydown 핸들러, `addEdge`, `render`, `selectOnly`, `markDirty`, `esc`, `ce`, `parentsOf`, `N`.
- Produces: `const ICONS={}` (Task 5가 Object.assign으로 채움). `makeNode(x,y,title,type,iconId)` 시그니처. `addChildMini(id)`·`addSiblingMini(id)`. node.type 'full'|'mini'|'icon'.

- [ ] **Step 1: ICONS placeholder + makeNode 시그니처 확장**

`function th(id)` 줄 **앞**(이미지 헬퍼 근처)에 추가:
```js
const ICONS={};
function iconSvg(id){return ICONS[id]?`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>`:''}
```
makeNode 교체:
```js
function makeNode(x,y,title,type,iconId){const n={id:uid('n'),x,y,title:title||'새 단계',desc:'',thumb:null,type:type||'full'};if(iconId)n.iconId=iconId;state.nodes.push(n);return n}
```

- [ ] **Step 2: nodeHTML — type 분기**

nodeHTML 교체:
```js
function nodeHTML(n){
  const t=n.type||'full';
  const ports=`<div class="port top edit-only" data-act="port" data-side="top"></div>
    <div class="port right edit-only" data-act="port" data-side="right"></div>
    <div class="port bottom edit-only" data-act="port" data-side="bottom"></div>
    <div class="port left edit-only" data-act="port" data-side="left"></div>`;
  const head=`<div class="n-in"></div><button class="n-del edit-only" data-act="del">✕</button>`;
  if(t==='mini'){
    return `<div class="node mini" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px">${head}
      <div class="n-body"><div class="n-title" contenteditable="${ce()}" data-field="title">${esc(n.title)}</div></div>${ports}</div>`;
  }
  if(t==='icon'){
    return `<div class="node icon" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px">${head}
      <div class="n-icon">${iconSvg(n.iconId)}</div>
      <div class="n-title" contenteditable="${ce()}" data-field="title">${esc(n.title)}</div>${ports}</div>`;
  }
  let media;
  if(n.thumb) media=`<div class="n-thumb"><img src="${imgSrc(n.thumb.imgId)}" onclick="zoom('${n.id}')" alt=""><span class="zh">⤢</span>
     <span class="rmth edit-only" data-act="rmthumb">✕</span>${n.thumb.label?`<span class="cap">${esc(n.thumb.label)}</span>`:''}</div>`;
  else media=`<div class="n-drop edit-only">썸네일 드래그</div>`;
  return `<div class="node" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px">${head}
    <div class="n-body"><div class="n-title" contenteditable="${ce()}" data-field="title">${esc(n.title)}</div>
      <div class="n-desc" contenteditable="${ce()}" data-field="desc">${esc(n.desc)}</div>${media}</div>${ports}</div>`;
}
```

- [ ] **Step 3: mini/icon 노드 CSS**

`<style>`의 `.node{...}` 규칙 **다음**에 추가:
```css
  .node.mini{width:150px}
  .node.mini .n-body{padding:8px 11px}
  .node.mini .n-title{font-size:12.5px;min-height:16px}
  .node.icon{width:auto;min-width:88px;max-width:140px;text-align:center;padding:12px 12px 10px;display:flex;flex-direction:column;align-items:center;gap:7px}
  .node.icon .n-icon{width:40px;height:40px;color:var(--gold)}
  .node.icon .n-icon svg{width:40px;height:40px}
  .node.icon .n-title{font-size:12.5px;font-weight:600;min-height:16px}
```

- [ ] **Step 4: mini 추가 함수**

`addParent` 함수 **다음**에 추가:
```js
function addChildMini(id){const n=N(id);const nn=makeNode(n.x+260,n.y,'',"mini");addEdge(id,'right',nn.id,'left');render();selectOnly(nn.id);markDirty();toast('하위 노드')}
function addSiblingMini(id){const n=N(id);const nn=makeNode(n.x,n.y+(n._h||90)+30,'',"mini");const ps=parentsOf(id);if(ps[0])addEdge(ps[0],'right',nn.id,'left');render();selectOnly(nn.id);markDirty();toast('형제 노드')}
function addMiniCenter(){const r=stage.getBoundingClientRect();const p=worldPt(r.left+r.width/2,r.top+r.height/2);const nn=makeNode(p.x-75,p.y-20,'',"mini");render();selectOnly(nn.id);markDirty()}
```

- [ ] **Step 5: 단축키 — Tab=하위 mini, Enter=형제 mini**

keydown 핸들러에서 `if(e.key==='Tab'){...}` 줄을 교체하고 그 뒤에 Enter 추가:
```js
  if(e.key==='Tab'){e.preventDefault();if(primary)addChildMini(primary);return}
  if(e.key==='Enter'){e.preventDefault();if(primary)addSiblingMini(primary);return}
```

- [ ] **Step 6: 문법검증 + 배포 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
sed -n '/^<script>/,/^<\/script>/p' map.html | sed '1d;$d' > /tmp/c.js && node --check /tmp/c.js && echo OK
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:wjdtjd2@@parksvc.mycafe24.com; cd www/map; put map.html"
curl -s -o /dev/null -w "%{http_code}\n" https://parksvc.mycafe24.com/map/map.html
cd /home/jschoi0223/projects/vdiportal && git add map/map.html
git commit -m "map: 노드 타입(mini/icon) + 단축키 Tab=하위 mini·Enter=형제 mini

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
컨트롤러 헤드리스 확인: 노드 선택 후 Tab→작은 하위노드 생성·연결, Enter→형제, icon 노드 렌더(아이콘 빈 placeholder 허용), JS에러0.

---

### Task 3: 좌측 세로 툴 레일

**Files:** Modify: `map/map.html`

**Interfaces:**
- Consumes: `TOOLBAR`, `addNodeCenter`, `addMiniCenter`, `saveMeta`, `boot`, `renderToolbar`(자기 정의), `markDirty`.
- Produces: `.toolrail` UI, `toggleSnap()`, `toggleEdgeStyle()`, `toggleEdgeArrow()`, `renderToolbar()`, `#iconPal`(Task 5 채움). `saveMeta`/`boot`가 `meta.toolbar` 포함.

- [ ] **Step 1: 툴 레일 마크업 추가**

`<div class="app" id="app">` 바로 다음(`  <aside class="side">` **앞**)에 삽입:
```html
  <aside class="toolrail edit-only" id="toolrail">
    <button class="trbtn" id="snapBtn" title="자석 정렬" onclick="toggleSnap()">⊹</button>
    <button class="trbtn" id="lineBtn" title="새 선: 실선/점선" onclick="toggleEdgeStyle()">─</button>
    <button class="trbtn" id="arrowBtn" title="새 선: 화살표" onclick="toggleEdgeArrow()">▶</button>
    <div class="tr-sep"></div>
    <button class="trbtn" title="노드 추가" onclick="addNodeCenter()">▭</button>
    <button class="trbtn" title="중간 노드 추가" onclick="addMiniCenter()">▬</button>
    <div class="tr-sep"></div>
    <div class="icon-pal" id="iconPal"></div>
  </aside>
```

- [ ] **Step 2: 툴 레일 CSS + .app 그리드 변경**

`.app{...}` 와 `.app.collapsed{...}` 두 줄을 교체:
```css
  .app{flex:1;display:grid;grid-template-columns:56px 226px 1fr;min-height:0;transition:grid-template-columns .22s cubic-bezier(.4,0,.2,1)}
  .app.collapsed{grid-template-columns:56px 44px 1fr}
```
그리고 `.side{...}` 규칙 **앞**에 추가:
```css
  .toolrail{border-right:1px solid var(--line);background:#0c1118;display:flex;flex-direction:column;align-items:center;gap:7px;padding:11px 0;min-height:0;overflow:hidden}
  body.view .toolrail{display:none}
  .trbtn{width:38px;height:38px;border-radius:9px;border:1px solid var(--line);background:var(--raised);color:var(--muted);font-size:15px;cursor:pointer;display:grid;place-items:center;flex:none;transition:.13s}
  .trbtn:hover{background:var(--raised2);color:var(--txt);border-color:#3a4452}
  .trbtn.on{background:var(--gold);color:#1a1206;border-color:var(--gold)}
  .tr-sep{width:30px;height:1px;background:var(--line);flex:none}
  .icon-pal{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;align-items:center;width:100%;padding-bottom:8px}
  .ipal-btn{width:38px;height:38px;border-radius:9px;border:1px solid var(--line);background:var(--surface);color:#c2cad6;cursor:grab;display:grid;place-items:center;flex:none}
  .ipal-btn:hover{border-color:var(--gold-dim);color:var(--gold)}
  .ipal-btn svg{width:22px;height:22px}
  body.view .app{grid-template-columns:0 226px 1fr}
  body.view .app.collapsed{grid-template-columns:0 44px 1fr}
```

- [ ] **Step 3: 툴바 토글 함수 + renderToolbar**

`function toggleSide()` **앞**에 추가:
```js
function renderToolbar(){
  const s=document.getElementById('snapBtn'),l=document.getElementById('lineBtn'),a=document.getElementById('arrowBtn');
  if(s)s.classList.toggle('on',!!TOOLBAR.snap);
  if(l){l.classList.toggle('on',TOOLBAR.edgeStyle==='dashed');l.textContent=TOOLBAR.edgeStyle==='dashed'?'┄':'─'}
  if(a)a.classList.toggle('on',TOOLBAR.edgeArrow!==false);
}
function toggleSnap(){TOOLBAR.snap=!TOOLBAR.snap;renderToolbar();saveMeta()}
function toggleEdgeStyle(){TOOLBAR.edgeStyle=TOOLBAR.edgeStyle==='dashed'?'solid':'dashed';renderToolbar();saveMeta()}
function toggleEdgeArrow(){TOOLBAR.edgeArrow=!(TOOLBAR.edgeArrow!==false);renderToolbar();saveMeta()}
```

- [ ] **Step 4: saveMeta·boot에 toolbar 포함**

saveMeta 교체(toolbar 추가):
```js
function saveMeta(){if(!SERVER_OK)return;clearTimeout(metaTimer);metaTimer=setTimeout(async()=>{try{await apiPost({op:'meta',meta:{library:LIBRARY.map(l=>({id:l.id,label:l.label})),activeId,toolbar:TOOLBAR}})}catch(e){}},800)}
```
boot()에서 `if(doc.meta&&Array.isArray(doc.meta.library)){...}` 줄 **다음**에 추가:
```js
      if(doc.meta&&doc.meta.toolbar)Object.assign(TOOLBAR,doc.meta.toolbar);
```
boot() 끝의 `if(typeof renderSidebar==='function')renderSidebar();` 줄 **다음**에 추가:
```js
  renderToolbar();
```
그리고 boot()의 시드 replace와 catch(메모리모드) 양쪽 다 활성화되도록, boot() catch 블록 끝(메모리모드)에서도 toolbar는 기본값 유지 — 별도 작업 불필요(기본값 이미 설정).

- [ ] **Step 5: 문법검증 + 배포 + 커밋**
```bash
cd /home/jschoi0223/projects/vdiportal/map
sed -n '/^<script>/,/^<\/script>/p' map.html | sed '1d;$d' > /tmp/c.js && node --check /tmp/c.js && echo OK
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:wjdtjd2@@parksvc.mycafe24.com; cd www/map; put map.html"
curl -s -o /dev/null -w "%{http_code}\n" https://parksvc.mycafe24.com/map/map.html
cd /home/jschoi0223/projects/vdiportal && git add map/map.html
git commit -m "map: 좌측 세로 툴 레일 — 자석·선기본값·노드추가·아이콘 팔레트 골격 + meta.toolbar 영속

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
컨트롤러 헤드리스 확인: 툴레일 렌더, 자석/선/화살표 토글 활성표시·meta 저장, 새 엣지가 토글된 기본값 반영, 보기모드서 툴레일 숨김, JS에러0.

---

### Task 4: 자석(스냅) 정렬 + 가이드선

**Files:** Modify: `map/map.html`

**Interfaces:**
- Consumes: `onMove`(type==='node'/'nodePending'), `onUp`, `drag`, `N`, `state.nodes`, `TOOLBAR.snap`, `q(id)`, `paint`.
- Produces: 가이드 오버레이 `#snapV`·`#snapH`, 드래그 스냅 동작.

- [ ] **Step 1: 가이드선 오버레이 마크업**

`<div class="ehud" id="ehud"></div>` 줄 **다음**에 추가(같은 #world 내, 월드좌표):
```html
      <div class="snap-guide" id="snapV"></div>
      <div class="snap-guide" id="snapH"></div>
```

- [ ] **Step 2: 가이드 CSS**

`.marquee{...}` 규칙 **다음**에 추가:
```css
  .snap-guide{position:absolute;display:none;z-index:6;pointer-events:none}
  #snapV{width:0;border-left:1px dashed var(--gold)}
  #snapH{height:0;border-top:1px dashed var(--gold)}
```

- [ ] **Step 3: 드래그 시작 시 스냅 후보 수집**

`onMove`의 nodePending→node 전환 블록에서 `drag.origins=sel.map(...)` 줄 **다음**에 추가:
```js
    const movingSet=new Set(sel);
    drag.snapX=[];drag.snapY=[];
    state.nodes.forEach(n=>{if(movingSet.has(n.id))return;const w=n._w||W_NODE,h=n._h||90;drag.snapX.push(n.x,n.x+w,n.x+w/2);drag.snapY.push(n.y,n.y+h,n.y+h/2)});
    drag.bbox=(()=>{let a=1e9,b=1e9,c=-1e9,d=-1e9;sel.forEach(id=>{const n=N(id),w=n._w||W_NODE,h=n._h||90;a=Math.min(a,n.x);b=Math.min(b,n.y);c=Math.max(c,n.x+w);d=Math.max(d,n.y+h)});return{x:a,y:b,w:c-a,h:d-b}})();
```

- [ ] **Step 4: 노드 이동에 스냅 적용 + 가이드 표시**

`onMove`의 `if(drag.type==='node'){...}` 블록을 교체:
```js
  if(drag.type==='node'){
    let dx=(e.clientX-drag.sx)/view.scale,dy=(e.clientY-drag.sy)/view.scale;
    if(TOOLBAR.snap&&drag.snapX){
      const TH=6;
      const bx=drag.bbox.x+dx,bw=drag.bbox.w,by=drag.bbox.y+dy,bh=drag.bbox.h;
      const candX=[bx,bx+bw,bx+bw/2],candY=[by,by+bh,by+bh/2];
      let bestX=null,bestXd=TH;
      candX.forEach(c=>drag.snapX.forEach(t=>{const d=Math.abs(c-t);if(d<bestXd){bestXd=d;bestX={off:t-c,line:t}}}));
      let bestY=null,bestYd=TH;
      candY.forEach(c=>drag.snapY.forEach(t=>{const d=Math.abs(c-t);if(d<bestYd){bestYd=d;bestY={off:t-c,line:t}}}));
      const gv=document.getElementById('snapV'),gh=document.getElementById('snapH');
      if(bestX){dx+=bestX.off;gv.style.display='block';gv.style.left=bestX.line+'px';gv.style.top=(Math.min(by,drag.bbox.y)-400)+'px';gv.style.height='2000px'}else gv.style.display='none';
      if(bestY){dy+=bestY.off;gh.style.display='block';gh.style.top=bestY.line+'px';gh.style.left=(Math.min(bx,drag.bbox.x)-400)+'px';gh.style.width='2000px'}else gh.style.display='none';
    }
    drag.origins.forEach(o=>{const n=N(o.id);n.x=o.ox+dx;n.y=o.oy+dy;const el=q(o.id);el.style.left=n.x+'px';el.style.top=n.y+'px'});
    paint();return;
  }
```

- [ ] **Step 5: onUp에서 가이드 숨김**

`onUp`의 `const d=drag;drag=null;...` 줄 **다음**에 추가:
```js
  document.getElementById('snapV').style.display='none';document.getElementById('snapH').style.display='none';
```

- [ ] **Step 6: 문법검증 + 배포 + 커밋**
```bash
cd /home/jschoi0223/projects/vdiportal/map
sed -n '/^<script>/,/^<\/script>/p' map.html | sed '1d;$d' > /tmp/c.js && node --check /tmp/c.js && echo OK
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:wjdtjd2@@parksvc.mycafe24.com; cd www/map; put map.html"
curl -s -o /dev/null -w "%{http_code}\n" https://parksvc.mycafe24.com/map/map.html
cd /home/jschoi0223/projects/vdiportal && git add map/map.html
git commit -m "map: 자석 스냅 정렬 + 골드 가이드선(드래그 시 카드 기준선 스냅, 툴바 on/off)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
컨트롤러 헤드리스 확인: 자석 on 시 드래그가 다른 카드 좌/우/중심선에 붙고 가이드선 표시, off 시 자유 이동, JS에러0.

---

### Task 5: 아이콘 세트 + 팔레트/아이콘 노드 통합

**Files:** Modify: `map/map.html`

**Interfaces:**
- Consumes: `ICONS`(Task 2 빈 객체), `iconSvg`, `makeNode(...,'icon',iconId)`, `renderToolbar`/boot, stage drop, `#iconPal`, `worldPt`, `render`, `selectOnly`.
- Produces: 20종 ICONS, `renderPalette()`, `addIconCenter(iconId)`, 팔레트 드래그/드롭 → icon 노드.

- [ ] **Step 1: ICONS 채우기**

`const ICONS={};` 줄 **다음**에 추가(Object.assign로 채움):
```js
Object.assign(ICONS,{
  pc:'<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>',
  laptop:'<rect x="4" y="5" width="16" height="10" rx="1"/><path d="M2 19h20l-2-2H4z"/>',
  thinclient:'<rect x="7" y="3" width="10" height="18" rx="1"/><circle cx="12" cy="17" r="1"/>',
  mobile:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  server:'<rect x="4" y="3" width="16" height="7" rx="1"/><rect x="4" y="14" width="16" height="7" rx="1"/><path d="M8 6.5h.01M8 17.5h.01"/>',
  cloud:'<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9a4 4 0 0 0 1 9z"/>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  monitor:'<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M9 21h6M12 17v4"/>',
  network:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6.5 7.5 10.5 16M17.5 7.5 13.5 16M7 6h10"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-5-6.7"/>',
  lock:'<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  key:'<circle cx="8" cy="8" r="4"/><path d="M11 11l8 8M16 16l2-2M19 19l2-2"/>',
  decision:'<path d="M12 3 21 12 12 21 3 12z"/>',
  start:'<rect x="3" y="8" width="18" height="8" rx="4"/>',
  end:'<rect x="3" y="7" width="18" height="10" rx="5"/><rect x="6" y="10" width="12" height="4" rx="2"/>',
  process:'<rect x="3" y="6" width="18" height="12" rx="1"/>',
  document:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  warning:'<path d="M12 3 22 20H2z"/><path d="M12 10v5M12 18h.01"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'
});
```

- [ ] **Step 2: renderPalette + addIconCenter**

`function renderToolbar(){...}` **다음**에 추가:
```js
function renderPalette(){
  const el=document.getElementById('iconPal');if(!el)return;
  el.innerHTML=Object.keys(ICONS).map(id=>`<button class="ipal-btn" draggable="true" data-icon="${id}" title="${id}">${iconSvg(id)}</button>`).join('');
}
function addIconCenter(iconId){const r=stage.getBoundingClientRect();const p=worldPt(r.left+r.width/2,r.top+r.height/2);const nn=makeNode(p.x-44,p.y-34,iconId,"icon",iconId);render();selectOnly(nn.id);markDirty()}
```

- [ ] **Step 3: 팔레트 이벤트 (드래그·클릭)**

라이브러리 이벤트(`const libEl=...`) **다음**에 추가:
```js
const iconPalEl=document.getElementById('iconPal');
iconPalEl.addEventListener('dragstart',e=>{const b=e.target.closest('[data-icon]');if(b)e.dataTransfer.setData('iconid',b.dataset.icon)});
iconPalEl.addEventListener('click',e=>{const b=e.target.closest('[data-icon]');if(b)addIconCenter(b.dataset.icon)});
```

- [ ] **Step 4: stage drop — 아이콘 드롭 시 icon 노드 생성**

stage drop 핸들러 시작부를 교체(맨 앞에 iconid 분기 추가):
```js
stage.addEventListener('drop',e=>{const iid=e.dataTransfer.getData('iconid');
  if(iid){e.preventDefault();const p=worldPt(e.clientX,e.clientY);const nn=makeNode(p.x-44,p.y-34,iid,"icon",iid);render();selectOnly(nn.id);markDirty();return}
  const el=e.target.closest('.node');if(!el)return;e.preventDefault();el.classList.remove('dragover');const id=el.dataset.id,lib=e.dataTransfer.getData('libid');
  if(lib){const l=LIBRARY.find(x=>x.id===lib);if(l)setThumb(id,{imgId:l.id,label:l.label});return}
  const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f&&f.type.startsWith('image/')){const r=new FileReader();r.onload=()=>downscaleImage(r.result,out=>{const iid2=uid('img');putImg(iid2,out);setThumb(id,{imgId:iid2,label:f.name.replace(/\.[^.]+$/,'')})});r.readAsDataURL(f)}});
```
또한 stage `dragover` 핸들러는 노드 위에서만 preventDefault 하므로 빈 곳 아이콘 드롭이 막힌다 — dragover 교체:
```js
stage.addEventListener('dragover',e=>{const n=e.target.closest('.node');if(n){e.preventDefault();n.classList.add('dragover')}else if(e.dataTransfer.types&&[...e.dataTransfer.types].includes('iconid')){e.preventDefault()}});
```

- [ ] **Step 5: boot에서 팔레트 렌더**

boot() 끝의 `renderToolbar();` 줄 **다음**에 추가:
```js
  renderPalette();
```

- [ ] **Step 6: 문법검증 + 배포 + 커밋**
```bash
cd /home/jschoi0223/projects/vdiportal/map
sed -n '/^<script>/,/^<\/script>/p' map.html | sed '1d;$d' > /tmp/c.js && node --check /tmp/c.js && echo OK
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:wjdtjd2@@parksvc.mycafe24.com; cd www/map; put map.html"
curl -s -o /dev/null -w "%{http_code}\n" https://parksvc.mycafe24.com/map/map.html
cd /home/jschoi0223/projects/vdiportal && git add map/map.html
git commit -m "map: 플랫 아이콘 세트 20종 + 팔레트(드래그/클릭) → 아이콘 노드 생성

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
컨트롤러 헤드리스 확인: 팔레트에 20 아이콘 렌더, 클릭→icon 노드 생성, 드래그→빈 곳 드롭 생성, 아이콘 SVG 표시, JS에러0.

---

### Task 6: 영속/호환 마무리 + 문서 + 최종 검증/푸시

**Files:** Modify: `map/map.html`, `map/CLAUDE.md`

- [ ] **Step 1: export/import에 toolbar 포함**

exportJSON 교체(toolbar 추가):
```js
function exportJSON(){writeBackActive();const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({canvases,library:LIBRARY.map(l=>({id:l.id,label:l.label})),images:IMAGES,activeId,toolbar:TOOLBAR},null,2)],{type:'application/json'}));a.download='vdi-canvases.json';a.click();toast('내보냄')}
```
impFile 핸들러에서 `if(d.images&&typeof d.images==='object')Object.assign(IMAGES,d.images);` 줄 **다음**에 추가:
```js
  if(d.toolbar&&typeof d.toolbar==='object'){Object.assign(TOOLBAR,d.toolbar);renderToolbar()}
```

- [ ] **Step 2: CLAUDE.md 갱신**

`map/CLAUDE.md`에 반영(해당 부분만 수정):
1. 데이터 모델: `node.type`('full'|'mini'|'icon')·`node.iconId`, `edge.style`('solid'|'dashed')·`edge.arrow`, `meta.toolbar{snap,edgeStyle,edgeArrow}`, `ICONS` 상수 추가.
2. 핵심 함수 맵: 연결선(marker/dasharray), 노드타입(nodeHTML 분기·addChildMini/addSiblingMini/addMiniCenter), 툴레일(renderToolbar/toggleSnap/toggleEdgeStyle/toggleEdgeArrow), 스냅(onMove 스냅+가이드), 아이콘(ICONS/iconSvg/renderPalette/addIconCenter) 행 추가.
3. 인터랙션: `Tab`=하위 mini·`Enter`=형제 mini(기존 −/+ 유지), 엣지 선택 시 실선/점선·화살표 토글, 좌측 툴레일(자석·선기본값·노드추가·아이콘 팔레트), 자석 스냅+가이드선 추가.
4. 새 섹션 "## 작성 도구(툴 레일·노드 타입·아이콘)" — 위 요지 정리.
5. 다음 작업 후보에서 완료분(화살표·점선) 정리, 남은 후보(직각선·엣지 라벨·노드 리사이즈 등) 유지.

- [ ] **Step 3: 문법검증 + 배포**
```bash
cd /home/jschoi0223/projects/vdiportal/map
sed -n '/^<script>/,/^<\/script>/p' map.html | sed '1d;$d' > /tmp/c.js && node --check /tmp/c.js && echo OK
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:wjdtjd2@@parksvc.mycafe24.com; cd www/map; put map.html"
curl -s -o /dev/null -w "%{http_code}\n" https://parksvc.mycafe24.com/map/map.html
```

- [ ] **Step 4: 커밋 + 푸시**
```bash
cd /home/jschoi0223/projects/vdiportal && git add map/map.html map/CLAUDE.md
git commit -m "map: 작성도구 영속(toolbar export/import) + CLAUDE.md 갱신

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```
컨트롤러 최종 헤드리스 회귀: 엣지 화살표/점선·mini/icon 노드·Tab/Enter·툴레일 토글·스냅 가이드·아이콘 팔레트 전부 동작 + 영속(POST<128KB)·재방문 복원·JS에러0. 기존 인터랙션(팬/줌/마퀴/연결/그룹/내보내기) 회귀 없음.

---

## Self-Review (작성자 점검)

- **Spec coverage**: 연결선 강화(방향/점선/화살표)=T1, 노드 타입 mini/icon+단축키=T2, 좌측 툴레일=T3, 자석 스냅+가이드=T4, 아이콘 세트+팔레트+아이콘노드=T5, 영속/호환/문서=T6. 전 항목 커버.
- **Placeholder scan**: 모든 코드 단계에 실제 코드. ICONS 20종 실제 path. TBD 없음.
- **Type consistency**: `TOOLBAR{snap,edgeStyle,edgeArrow}`(T1정의·T3 UI·T6 export), `makeNode(x,y,title,type,iconId)`(T2정의·T2/T5 사용), `ICONS`/`iconSvg`(T2 placeholder·T5 채움·T2 nodeHTML/T5 palette 사용), `addChildMini/addSiblingMini/addMiniCenter`(T2정의·T2 keydown/T3 버튼 사용), `renderToolbar/toggleSnap/toggleEdgeStyle/toggleEdgeArrow`(T3정의·T3/T6 사용), `renderPalette/addIconCenter`(T5정의·T5/boot 사용), 엣지 필드 style/arrow(T1정의·paint/drawEhud/world click/addEdge/loadCanvas 일관), 가이드 `#snapV/#snapH`(T4). 명칭 일치.
- **순서 의존성**: T1 TOOLBAR→T3 UI; T2 ICONS placeholder→T5 채움; T3 renderToolbar/iconPal→T5 renderPalette(boot에 순차 추가); T4 onMove 스냅은 T2 이후 onMove 구조 유지. 정합.
- **128KB**: 신규 필드 전부 작은 스칼라/짧은 문자열. meta.toolbar 작음. 이미지 분리 유지. 위반 없음.
