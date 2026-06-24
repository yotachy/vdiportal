# 캔버스 다중 관리 + 서버 저장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `map.html`을 단일 캔버스에서 여러 캔버스(다이어그램) 추가·편집·삭제·전환 + 서버(PHP) 자동저장으로 확장한다.

**Architecture:** 같은 저장소 `vdi-log/api.php`의 op 기반 서버저장 패턴을 차용한 `map/api.php`(GET + replace/upsert/delete/reorder/meta) + `map_data.json`(서버 관리). 프론트는 전역 `state`/`view`를 "활성 캔버스 작업본"으로 두고, 인메모리 `canvases[]`/`activeId`로 다중 관리하며 변경 시 디바운스 upsert로 자동저장. 서버 접근 불가 시 메모리 모드로 graceful degradation.

**Tech Stack:** 바닐라 JS(무빌드, 단일 파일 유지), PHP 8.x(cafe24), fetch API, JSON 파일 저장(flock + tmp→rename).

## Global Constraints

- 기술 스택: 순수 HTML5/CSS3/Vanilla JS. 프레임워크·번들러·외부 라이브러리 도입 금지(Pretendard 폰트 CDN 1개만 허용).
- `map.html`은 단일 파일 유지. 백엔드는 `api.php` 1개만 추가.
- 디자인 토큰만 사용: `:root` 변수(`--gold:#ffbc00` 등). 색·라운드·그림자 하드코딩 금지. 다크+골드 테마.
- UI 텍스트 한국어. 들여쓰기 2 spaces, 큰따옴표, 케밥케이스 id/class.
- localStorage/sessionStorage 사용 금지(서버 저장 사용).
- 신규 id는 `uid('n'|'e'|'g'|'c'|'lib')`로 생성.
- 엣지 SVG 구조(`-10000/20000×20000/overflow:visible` + `#edgeG translate(10000,10000)`) 유지. `.world`에 `will-change:transform` 넣지 말 것. `nodeAt()` 좌표 판정 유지(`elementFromPoint` 금지). 불러오기 시 `fromSide/toSide` 기본값 보정 유지.
- `map_data.json`은 서버 관리 — 배포 시 삭제/덮어쓰기 금지.
- 배포: cafe24 SFTP `parksvc@parksvc.mycafe24.com` → `www/map/`. 공개 URL `https://parksvc.mycafe24.com/map/`.

---

### Task 1: `api.php` 서버 저장 백엔드

**Files:**
- Create: `map/api.php`

**Interfaces:**
- Produces (HTTP API, base `api.php`):
  - `GET api.php` → `{canvases:[...],meta:{...},_rev:N}` 또는 본문 `null`(데이터 없음). `Cache-Control: no-store`.
  - `GET api.php?check=1` → `{"valid":bool}`(키 파일 있을 때만 의미).
  - `POST api.php` body `{op:"replace", doc:{canvases,meta}}` → 전체 교체.
  - `POST api.php` body `{op:"upsert", canvas:{id,...}}` → id 기준 캔버스 추가/수정.
  - `POST api.php` body `{op:"delete", id}` → 캔버스 삭제.
  - `POST api.php` body `{op:"reorder", order:[id,...]}` → 순서 재배치.
  - `POST api.php` body `{op:"meta", meta:{...}}` → meta 일부 병합.
  - 성공 응답 `{"ok":true,"rev":N}`, 실패 `{"ok":false,"error":"..."}`.
  - 인증: 같은 폴더 `map_key.txt` 있으면 POST에 헤더 `X-Write-Key` 일치 강제(403 불일치), 없으면 쓰기 개방(fail-open).

- [ ] **Step 1: `map/api.php` 작성**

`map/api.php` 전체 내용:

```php
<?php
// KB VDI 접속 흐름 다이어그램 — 캔버스 저장 API (연산 기반, 동시 편집 안전)
// 데이터 모델: doc = {canvases:[{id,title,nodes,edges,groups,view,updated}], meta:{library,activeId}, _rev:N}
// GET            : 저장된 doc 반환(없으면 null) — 공개(읽기 자유)
// GET ?check=1   : 헤더 X-Write-Key 가 쓰기 키와 일치하는지 → {"valid":bool}
// POST {op,...}  : 연산을 서버 최신 doc 에 적용(락).
//   op=replace {doc}            전체 교체(시드/불러오기)
//   op=upsert  {canvas}         id 기준 캔버스 추가/수정
//   op=delete  {id}             캔버스 삭제
//   op=reorder {order:[id]}     순서 재배치
//   op=meta    {meta:{...}}     meta 일부 병합(library/activeId)
// 응답: {"ok":true,"rev":N}. 매 쓰기마다 _rev 증가.
//
// 쓰기 키: 같은 폴더 map_key.txt(서버 전용). 있으면 X-Write-Key 강제, 없으면 개방(fail-open).
// (vdi-log 는 fail-closed 지만, 여기선 "현재 단독 사용"이라 의도적으로 fail-open. 추후 로그인 시 키 파일만 올리면 보호 활성화.)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Write-Key");

$method = $_SERVER["REQUEST_METHOD"];
if ($method === "OPTIONS") { http_response_code(204); exit; }

$f  = __DIR__ . "/map_data.json";
$kf = __DIR__ . "/map_key.txt";
$WRITE_KEY = is_file($kf) ? trim(file_get_contents($kf)) : "";

function check_key($wk) {
  if ($wk === "") return true; // 키 파일 없으면 개방
  $k = isset($_SERVER["HTTP_X_WRITE_KEY"]) ? $_SERVER["HTTP_X_WRITE_KEY"] : "";
  return hash_equals($wk, $k);
}
function jout($a){ header("Content-Type: application/json; charset=utf-8"); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }

if ($method === "GET") {
  header("Content-Type: application/json; charset=utf-8");
  header("Cache-Control: no-store");
  if (isset($_GET["check"])) { echo json_encode(["valid" => check_key($WRITE_KEY)]); exit; }
  if (is_file($f)) { readfile($f); } else { echo "null"; }
  exit;
}

if ($method !== "POST") { http_response_code(405); jout(["ok"=>false,"error"=>"method"]); }

// ---- POST: 연산 적용 ----
if (!check_key($WRITE_KEY)) { http_response_code(403); jout(["ok"=>false,"error"=>"key"]); }
$d = json_decode(file_get_contents("php://input"), true);
if (!is_array($d) || !isset($d["op"])) { http_response_code(400); jout(["ok"=>false,"error"=>"noop"]); }
$op = $d["op"];

$lock = fopen($f . ".lock", "c");
if ($lock) { flock($lock, LOCK_EX); }

$doc = ["canvases"=>[], "meta"=>new stdClass(), "_rev"=>0];
if (is_file($f)) {
  $cur = json_decode(file_get_contents($f), true);
  if (is_array($cur) && isset($cur["canvases"]) && is_array($cur["canvases"])) $doc = $cur;
}
if (!isset($doc["canvases"]) || !is_array($doc["canvases"])) $doc["canvases"] = [];
if (!isset($doc["meta"]) || !is_array($doc["meta"])) $doc["meta"] = [];

$err = "";
if ($op === "replace") {
  $nd = isset($d["doc"]) ? $d["doc"] : null;
  if (!is_array($nd) || !isset($nd["canvases"]) || !is_array($nd["canvases"])) $err = "invalid";
  else { $doc["canvases"] = $nd["canvases"]; $doc["meta"] = isset($nd["meta"]) && is_array($nd["meta"]) ? $nd["meta"] : []; }
} elseif ($op === "upsert") {
  $it = isset($d["canvas"]) ? $d["canvas"] : null;
  if (!is_array($it) || !isset($it["id"])) $err = "invalid";
  else {
    $found = false;
    foreach ($doc["canvases"] as $i => $x) { if (isset($x["id"]) && $x["id"] === $it["id"]) { $doc["canvases"][$i] = $it; $found = true; break; } }
    if (!$found) $doc["canvases"][] = $it;
  }
} elseif ($op === "delete") {
  $id = isset($d["id"]) ? $d["id"] : null;
  if ($id === null) $err = "invalid";
  else $doc["canvases"] = array_values(array_filter($doc["canvases"], function($x) use ($id){ return !(isset($x["id"]) && $x["id"] === $id); }));
} elseif ($op === "reorder") {
  $order = isset($d["order"]) && is_array($d["order"]) ? $d["order"] : null;
  if ($order === null) $err = "invalid";
  else {
    $map = [];
    foreach ($doc["canvases"] as $x) { if (isset($x["id"])) $map[$x["id"]] = $x; }
    $new = [];
    foreach ($order as $id) { if (isset($map[$id])) { $new[] = $map[$id]; unset($map[$id]); } }
    foreach ($map as $x) { $new[] = $x; }
    $doc["canvases"] = $new;
  }
} elseif ($op === "meta") {
  $m = isset($d["meta"]) && is_array($d["meta"]) ? $d["meta"] : [];
  foreach ($m as $k => $v) { $doc["meta"][$k] = $v; }
} else {
  $err = "badop";
}

if ($err !== "") { if ($lock){flock($lock,LOCK_UN);fclose($lock);} http_response_code(400); jout(["ok"=>false,"error"=>$err]); }

$doc["_rev"] = (isset($doc["_rev"]) ? intval($doc["_rev"]) : 0) + 1;
$tmp = $f . ".tmp." . getmypid();
$okw = file_put_contents($tmp, json_encode($doc, JSON_UNESCAPED_UNICODE)) !== false && rename($tmp, $f);
if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
if (!$okw) { http_response_code(500); jout(["ok"=>false,"error"=>"write"]); }
jout(["ok"=>true, "rev"=>$doc["_rev"]]);
```

- [ ] **Step 2: api.php 만 배포(데이터 보존)**

로컬 PHP가 없어 live 서버에서 검증한다. `api.php` 만 업로드(`map_data.json`은 서버 관리이므로 건드리지 않음).

Run:
```bash
cd /home/jschoi0223/projects/vdiportal/map
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:wjdtjd2@@parksvc.mycafe24.com; cd www/map; put api.php"
```
Expected: 에러 없이 완료(프롬프트 복귀).

- [ ] **Step 3: GET 빈 상태 검증**

Run:
```bash
curl -s https://parksvc.mycafe24.com/map/api.php
```
Expected: `null` (아직 데이터 없음). 만약 이미 데이터가 있다면 `{"canvases":...}` JSON — 그래도 통과(500/HTML 아님이 핵심).

- [ ] **Step 4: replace → GET 왕복 검증**

Run:
```bash
curl -s -X POST https://parksvc.mycafe24.com/map/api.php \
  -H "Content-Type: application/json" \
  -d '{"op":"replace","doc":{"canvases":[{"id":"c_test","title":"테스트","nodes":[],"edges":[],"groups":[],"view":{"tx":0,"ty":0,"scale":1}}],"meta":{"activeId":"c_test"}}}'
echo
curl -s https://parksvc.mycafe24.com/map/api.php
```
Expected: 첫 줄 `{"ok":true,"rev":1}` (또는 누적된 rev), 둘째 줄에 `"id":"테스트"`가 아니라 `"title":"테스트"`와 `"canvases"` 포함 JSON.

- [ ] **Step 5: upsert / delete 검증 후 데이터 비우기**

Run:
```bash
curl -s -X POST https://parksvc.mycafe24.com/map/api.php -H "Content-Type: application/json" \
  -d '{"op":"upsert","canvas":{"id":"c_test2","title":"둘째","nodes":[],"edges":[],"groups":[],"view":{}}}'
echo
curl -s -X POST https://parksvc.mycafe24.com/map/api.php -H "Content-Type: application/json" -d '{"op":"delete","id":"c_test2"}'
echo
# 테스트 데이터 제거 — 빈 doc 으로 replace (프론트가 첫 방문 시 다시 시드함)
curl -s -X POST https://parksvc.mycafe24.com/map/api.php -H "Content-Type: application/json" \
  -d '{"op":"replace","doc":{"canvases":[],"meta":{}}}'
```
Expected: 각 줄 `{"ok":true,"rev":N}`. (마지막 replace로 canvases 비움 → 다음 프론트 방문 때 시드.)

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/api.php
git commit -m "map: 캔버스 서버 저장 API(api.php) 추가 — op 기반(replace/upsert/delete/reorder/meta)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 프론트 — API 클라이언트 + 로드/시드/오프라인 폴백 + 자동저장(단일 캔버스 기준)

이 태스크에서 전역 `state`/`view`를 "활성 캔버스"로 감싸 서버에서 로드/시드하고, 변경 시 디바운스 자동저장을 건다. 다중 캔버스 UI는 Task 3·4. 끝나면: 서버에 단일 캔버스가 저장되고 새로고침 시 복원, `file://`로 열면 메모리 모드로 동작.

**Files:**
- Modify: `map/map.html` (`<script>` 내부, 그리고 헤더 마크업)

**Interfaces:**
- Consumes: 기존 전역 `state`, `view`, `LIBRARY`, `sel`, `selEdge`, `mode`, `defaultState()`, `render()`, `renderLib()`, `fitView()`, `uid()`, `esc()`, `toast()`.
- Produces (later tasks 사용):
  - `let canvases = []` — `[{id,title,nodes,edges,groups,view,updated}]`
  - `let activeId = null`
  - `let SERVER_OK = false`
  - `function stamp()` → ISO 문자열
  - `function writeBackActive()` → 활성 canvas 객체(없으면 null), 현재 state/view 반영
  - `function loadCanvas(id)` → 해당 canvas를 state/view에 로드 후 render+fitView
  - `function markDirty()` → 활성 canvas 디바운스 upsert
  - `function saveMeta()` → meta(library/activeId) 디바운스 저장
  - `function setSaveState(s)` — `'saved'|'saving'|'offline'`
  - `async function boot()` — 초기 로드 진입점

- [ ] **Step 1: 헤더에 저장상태 인디케이터 추가**

`map/map.html` 헤더 `.tools` 안, `<div class="seg" id="modeSeg">` **앞**에 한 줄 추가:

```html
    <span class="savestat" id="saveStat" title="저장 상태">●</span>
```

그리고 `<style>` 끝(`::-webkit-scrollbar` 줄 앞)에 추가:

```css
  .savestat{font-size:11px;color:var(--faint);margin-right:4px;font-family:var(--mono);transition:color .2s;white-space:nowrap}
  .savestat.saved{color:var(--ok)} .savestat.saving{color:var(--gold)} .savestat.offline{color:var(--red)}
```

- [ ] **Step 2: API 클라이언트 + 캔버스 전역/유틸 추가**

`<script>` 상단, `let mode='edit';const W_NODE=246;` **다음 줄**에 추가:

```js
const API='api.php';
let canvases=[]; let activeId=null; let SERVER_OK=false;
let saveTimer=null, metaTimer=null;
function stamp(){return new Date().toISOString()}
function setSaveState(s){const el=document.getElementById('saveStat');if(!el)return;el.className='savestat '+s;el.textContent=s==='saving'?'● 저장 중…':s==='offline'?'● 오프라인':'● 저장됨'}
async function apiGet(){const r=await fetch(API,{cache:'no-store'});if(!r.ok)throw new Error('http');return r.json()}
async function apiPost(body){const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!j||!j.ok)throw j;return j}
```

- [ ] **Step 3: 활성 캔버스 write-back / load / 자동저장 함수 추가**

`<script>` 의 `/* ---------- node ops ---------- */` 섹션 **앞**에 추가:

```js
/* ---------- canvas store ---------- */
function writeBackActive(){
  const c=canvases.find(x=>x.id===activeId);if(!c)return null;
  c.nodes=state.nodes;c.edges=state.edges;c.groups=state.groups||[];c.view=view;c.updated=stamp();return c;
}
function loadCanvas(id){
  const c=canvases.find(x=>x.id===id);if(!c)return;
  activeId=id;
  state={nodes:c.nodes||[],edges:c.edges||[],groups:c.groups||[]};
  state.edges.forEach(e=>{if(!e.fromSide)e.fromSide='right';if(!e.toSide)e.toSide='left'});
  view=c.view&&typeof c.view.scale==='number'?c.view:{tx:30,ty:20,scale:1};
  sel=[];selEdge=null;
  renderLib();render();setTimeout(fitView,30);
}
function markDirty(){
  if(!SERVER_OK)return;
  const c=writeBackActive();if(!c)return;
  setSaveState('saving');
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{try{await apiPost({op:'upsert',canvas:c});setSaveState('saved')}catch(e){setSaveState('offline')}},800);
}
function saveMeta(){
  if(!SERVER_OK)return;
  clearTimeout(metaTimer);
  metaTimer=setTimeout(async()=>{try{await apiPost({op:'meta',meta:{library:LIBRARY,activeId}})}catch(e){}},800);
}
```

- [ ] **Step 4: boot / seed / 메모리폴백 함수 추가 + 시작 호출 교체**

`<script>` 맨 끝의 마지막 줄을 교체한다.

기존(마지막 줄):
```js
renderLib();render();setTimeout(fitView,30);
```

교체 후:
```js
function seedCanvas(title){
  const ds=defaultState();
  return {id:uid('c'),title:title||'VDI 접속 흐름',nodes:ds.nodes,edges:ds.edges,groups:ds.groups,view:{tx:30,ty:20,scale:1},updated:stamp()};
}
async function boot(){
  try{
    const doc=await apiGet();
    SERVER_OK=true;
    if(doc&&Array.isArray(doc.canvases)&&doc.canvases.length){
      canvases=doc.canvases;
      if(doc.meta&&Array.isArray(doc.meta.library)){LIBRARY.length=0;doc.meta.library.forEach(x=>LIBRARY.push(x))}
      activeId=(doc.meta&&doc.meta.activeId&&canvases.some(c=>c.id===doc.meta.activeId))?doc.meta.activeId:canvases[0].id;
      loadCanvas(activeId);
      setSaveState('saved');
    }else{
      const c=seedCanvas();canvases=[c];activeId=c.id;loadCanvas(c.id);
      try{await apiPost({op:'replace',doc:{canvases,meta:{library:LIBRARY,activeId}}});setSaveState('saved')}catch(e){setSaveState('offline')}
    }
  }catch(e){
    SERVER_OK=false;
    const c=seedCanvas();canvases=[c];activeId=c.id;loadCanvas(c.id);
    setSaveState('offline');
  }
  if(typeof renderSidebar==='function')renderSidebar();
}
boot();
```

(`renderSidebar`는 Task 4에서 정의되며, 그 전까진 `typeof` 가드로 건너뜀.)

- [ ] **Step 5: 변경 지점에 markDirty 연결**

아래 함수 끝(또는 지정 위치)에 `markDirty()` 호출을 추가한다. 각 항목은 기존 코드 → 수정 코드.

`addEdge`:
```js
function addEdge(from,fromSide,to,toSide){if(from===to)return;if(state.edges.some(e=>e.from===from&&e.to===to))return;state.edges.push({id:uid('e'),from,fromSide:fromSide||'right',to,toSide:toSide||'left'});markDirty()}
```
`delEdge`:
```js
function delEdge(id){state.edges=state.edges.filter(e=>e.id!==id);if(selEdge===id)selEdge=null;paint();markDirty()}
```
`delNodes` (끝 `render()` 뒤):
```js
function delNodes(ids){const s=new Set(ids);state.nodes=state.nodes.filter(n=>!s.has(n.id));state.edges=state.edges.filter(e=>!s.has(e.from)&&!s.has(e.to));(state.groups||[]).forEach(g=>g.nodes=g.nodes.filter(i=>!s.has(i)));state.groups=(state.groups||[]).filter(g=>g.nodes.length>0);sel=sel.filter(i=>!s.has(i));render();markDirty()}
```
`setThumb`:
```js
function setThumb(id,t){const n=N(id);if(n)n.thumb=t;render();markDirty()}
```
`makeGroup` (끝 `toast(...)` 뒤):
```js
function makeGroup(){if(sel.length<2)return;state.groups=state.groups||[];state.groups.push({id:uid('g'),nodes:[...sel],title:'그룹'});render();markDirty();toast('그룹 생성')}
```
`addSibling`/`addChild`/`addParent`: 각 함수 끝 `toast(...)` 호출 **앞**에 `markDirty();` 추가. 예:
```js
function addSibling(id){const n=N(id);const nn=makeNode(n.x,n.y+(n._h||90)+34);const ps=parentsOf(id);if(ps[0])addEdge(ps[0],'right',nn.id,'left');render();selectOnly(nn.id);markDirty();toast('형제 추가')}
function addChild(id){const n=N(id);const nn=makeNode(n.x+300,n.y);addEdge(id,'right',nn.id,'left');render();selectOnly(nn.id);markDirty();toast('하위 추가')}
function addParent(id){const n=N(id);const nn=makeNode(n.x-300,n.y);addEdge(nn.id,'right',id,'left');render();selectOnly(nn.id);markDirty();toast('상위 추가')}
```
`addNodeCenter` (끝):
```js
function addNodeCenter(){const r=stage.getBoundingClientRect();const p=worldPt(r.left+r.width/2,r.top+r.height/2);const n=makeNode(p.x-W_NODE/2,p.y-30);render();selectOnly(n.id);markDirty()}
```

`onUp` 내 노드 드래그 종료 — `if(d.type==='node'){...}` 줄에 `markDirty()` 추가:
```js
  if(d.type==='node'){setTimeout(()=>justDragged=false,30);markDirty();return}
```
`onUp` 내 link 생성(두 경우 모두 후속 markDirty):
```js
  if(d.type==='link'){
    const p=worldPt(e.clientX,e.clientY),over=nodeAt(p);
    if(over&&over.id!==d.from){addEdge(d.from,d.fromSide,over.id,nearestSide(over,p));paint();toast('연결됨')}
    else{const nn=makeNode(p.x-W_NODE/2,p.y-30);addEdge(d.from,d.fromSide,nn.id,nearestSide(nn,anchor(N(d.from),d.fromSide)));render();selectOnly(nn.id);toast('노드 생성·연결')}
    markDirty();return;
  }
```
`onUp` 내 endpoint 이동 — `paint();return;` 앞에 추가:
```js
  if(d.type==='endpoint'){
    const ed=E(d.edge);if(!ed)return;
    const p=worldPt(e.clientX,e.clientY),over=nodeAt(p);
    if(over){const tid=over.id,other=d.end==='from'?ed.to:ed.from;
      if(tid!==other){if(d.end==='from'){ed.from=tid;ed.fromSide=nearestSide(over,p)}else{ed.to=tid;ed.toSide=nearestSide(over,p)}toast('끝점 이동')}}
    markDirty();paint();return;
  }
```
`world` click 의 엣지 방향전환(`data-erev`) — `toast('방향 변경')` 뒤에 `markDirty()`:
```js
  if(e.target.closest('[data-erev]')){if(selEdge){const ed=E(selEdge);[ed.from,ed.to]=[ed.to,ed.from];[ed.fromSide,ed.toSide]=[ed.toSide,ed.fromSide];paint();markDirty();toast('방향 변경')}return}
```
`world` focusout(제목/설명/그룹 라벨) — 각 분기 끝에 `markDirty()`:
```js
world.addEventListener('focusout',e=>{
  const f=e.target.dataset?.field;if(f){const id=e.target.closest('.node').dataset.id,n=N(id);if(n)n[f]=e.target.innerText.replace(/ /g,' ').trim();markDirty();return}
  const gf=e.target.dataset?.gfield;if(gf){const id=e.target.closest('.group').dataset.gid,g=G(id);if(g)g[gf]=e.target.innerText.trim();markDirty()}
});
```
그룹 해제(`data-gact` del) — `toast('그룹 해제')` 뒤 `markDirty()`:
```js
  const gb=e.target.closest('[data-gact]');if(gb&&gb.dataset.gact==='del'){const id=gb.closest('.group').dataset.gid;state.groups=state.groups.filter(g=>g.id!==id);render();markDirty();toast('그룹 해제')}
```
`autoLayout` 끝(`render();fitView();toast(...)` 줄)에 `markDirty()`:
```js
  render();fitView();markDirty();toast(dir==='h'?'가로 정렬':'세로 정렬');
```
드롭으로 썸네일 부착은 `setThumb`를 통하므로 이미 markDirty 됨(추가 작업 없음).

- [ ] **Step 6: 라이브러리 변경 시 meta 저장 연결**

이미지 추가 핸들러(`imgFile` change) — `toast('썸네일 추가됨')` 뒤 `saveMeta()`:
```js
document.getElementById('imgFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{LIBRARY.push({id:uid('lib'),label:f.name.replace(/\.[^.]+$/,''),src:r.result});renderLib();saveMeta();toast('썸네일 추가됨')};r.readAsDataURL(f);e.target.value=''});
```
라이브러리 삭제(`libEl` click) — `toast('삭제됨')` 뒤 `saveMeta()`:
```js
libEl.addEventListener('click',e=>{const id=e.target.closest('[data-libdel]')?.dataset.libdel;if(!id)return;const i=LIBRARY.findIndex(x=>x.id===id);if(i>=0){LIBRARY.splice(i,1);renderLib();saveMeta();toast('삭제됨')}});
```

- [ ] **Step 7: 배포 후 서버 모드 검증**

Run:
```bash
cd /home/jschoi0223/projects/vdiportal/map
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:wjdtjd2@@parksvc.mycafe24.com; cd www/map; put map.html"
```
브라우저로 `https://parksvc.mycafe24.com/map/map.html` 열기. 확인:
1. 기본 다이어그램이 뜨고 헤더 우측에 `● 저장됨`(초록) 표시.
2. 노드 제목을 수정하고 1초 뒤 `● 저장됨` 유지(중간에 `● 저장 중…` 골드 깜빡).
3. 페이지 **새로고침** → 수정한 제목이 그대로 복원.

서버에 저장됐는지 CLI 확인:
```bash
curl -s https://parksvc.mycafe24.com/map/api.php | head -c 200
```
Expected: `{"canvases":[{"id":"c_...","title":...` 로 시작하는 JSON(방금 수정 내용 포함).

- [ ] **Step 8: 메모리 폴백 검증(file://)**

로컬 파일을 직접 열어 서버 없이 동작하는지 확인. (PHP 없는 환경 = `file://`)
- `/home/jschoi0223/projects/vdiportal/map/map.html` 을 브라우저로 직접 열기.
- 확인: 기본 다이어그램 정상 표시, 헤더에 `● 오프라인`(빨강). 노드 추가·이동·편집 정상 동작(저장만 안 됨). 콘솔에 치명적 에러 없음.

- [ ] **Step 9: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/map.html
git commit -m "map: 서버 자동저장 + 로드/시드/오프라인 폴백 (단일 캔버스 기준)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 캔버스 스토어 연산 (추가/전환/이름변경/삭제)

UI 없이 캔버스 관리 함수를 추가하고 콘솔로 검증한다. UI는 Task 4.

**Files:**
- Modify: `map/map.html` (`<script>`, canvas store 섹션)

**Interfaces:**
- Consumes: `canvases`, `activeId`, `SERVER_OK`, `writeBackActive()`, `loadCanvas()`, `saveMeta()`, `seedCanvas()`, `apiPost()`, `uid()`, `toast()`, `defaultState()`.
- Produces:
  - `function switchCanvas(id)`
  - `function newCanvas()`
  - `function renameCanvas(id, title)`
  - `function deleteCanvas(id)`
  - 각 함수는 변경 후 `renderSidebar()`가 있으면 호출(Task 4 정의).

- [ ] **Step 1: 캔버스 연산 함수 추가**

`<script>` 의 canvas store 섹션(Task 2 Step 3에서 만든 `saveMeta` 다음)에 추가:

```js
function refreshSidebar(){if(typeof renderSidebar==='function')renderSidebar()}
function switchCanvas(id){
  if(id===activeId)return;
  writeBackActive();
  loadCanvas(id);
  refreshSidebar();
  saveMeta();
}
function newCanvas(){
  writeBackActive();
  const n={id:uid('n'),x:80,y:80,title:'시작',desc:'',thumb:null};
  const c={id:uid('c'),title:'새 캔버스',nodes:[n],edges:[],groups:[],view:{tx:30,ty:20,scale:1},updated:stamp()};
  canvases.push(c);activeId=c.id;
  loadCanvas(c.id);refreshSidebar();
  if(SERVER_OK){apiPost({op:'upsert',canvas:c}).then(()=>setSaveState('saved')).catch(()=>setSaveState('offline'));saveMeta()}
  toast('캔버스 추가');
}
function renameCanvas(id,title){
  const c=canvases.find(x=>x.id===id);if(!c)return;
  c.title=(title||'').trim()||'제목없음';c.updated=stamp();
  refreshSidebar();
  if(SERVER_OK)apiPost({op:'upsert',canvas:c}).catch(()=>setSaveState('offline'));
}
function deleteCanvas(id){
  if(canvases.length<=1){toast('마지막 캔버스는 삭제할 수 없어요');return}
  if(!confirm('이 캔버스를 삭제할까요?'))return;
  const wasActive=(id===activeId);
  canvases=canvases.filter(c=>c.id!==id);
  if(wasActive){activeId=canvases[0].id;loadCanvas(activeId)}
  refreshSidebar();
  if(SERVER_OK){apiPost({op:'delete',id}).catch(()=>setSaveState('offline'));saveMeta()}
  toast('캔버스 삭제');
}
```

- [ ] **Step 2: resetAll / export / import 다중 캔버스 대응**

`resetAll` 교체(전체를 단일 시드로 초기화):
```js
function resetAll(){if(confirm('모든 캔버스를 기본 구성으로 초기화할까요?')){const c=seedCanvas();canvases=[c];activeId=c.id;loadCanvas(c.id);refreshSidebar();if(SERVER_OK){apiPost({op:'replace',doc:{canvases,meta:{library:LIBRARY,activeId}}}).then(()=>setSaveState('saved')).catch(()=>setSaveState('offline'))}toast('초기화됨')}}
```
`exportJSON` 교체(현재 작업본 반영 후 전체 내보내기):
```js
function exportJSON(){writeBackActive();const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({canvases,library:LIBRARY,activeId},null,2)],{type:'application/json'}));a.download='vdi-canvases.json';a.click();toast('내보냄')}
```
`impFile` change 핸들러 교체(신규 다중 포맷 + 구버전 단일 호환):
```js
document.getElementById('impFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);
  if(d.library){LIBRARY.length=0;d.library.forEach(x=>LIBRARY.push(x))}
  if(Array.isArray(d.canvases)&&d.canvases.length){canvases=d.canvases;activeId=(d.activeId&&canvases.some(c=>c.id===d.activeId))?d.activeId:canvases[0].id}
  else{const st=d.state||d;if(!st.groups)st.groups=[];const c={id:uid('c'),title:'불러온 캔버스',nodes:st.nodes||[],edges:st.edges||[],groups:st.groups||[],view:d.view||{tx:30,ty:20,scale:1},updated:stamp()};canvases=[c];activeId=c.id}
  loadCanvas(activeId);refreshSidebar();
  if(SERVER_OK){apiPost({op:'replace',doc:{canvases,meta:{library:LIBRARY,activeId}}}).then(()=>setSaveState('saved')).catch(()=>setSaveState('offline'))}
  toast('불러오기 완료')}catch(err){toast('JSON 형식 오류')}};r.readAsText(f);e.target.value=''});
```

- [ ] **Step 3: 콘솔 검증(로컬 file://, 메모리 모드)**

`map.html`을 `file://`로 열고 브라우저 콘솔에서:
```js
newCanvas();                 // → 새 캔버스로 전환, toast '캔버스 추가'
console.log(canvases.length);// → 2
renameCanvas(activeId,'결재 흐름'); console.log(canvases.find(c=>c.id===activeId).title); // → '결재 흐름'
switchCanvas(canvases[0].id); console.log(activeId===canvases[0].id); // → true
deleteCanvas(canvases[1].id); console.log(canvases.length); // → 1
deleteCanvas(canvases[0].id); // → toast '마지막 캔버스는 삭제할 수 없어요', 삭제 안 됨
```
Expected: 위 주석대로. 전환 시 캔버스 내용(노드)이 바뀌어 보임.

- [ ] **Step 4: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/map.html
git commit -m "map: 캔버스 스토어 연산(추가/전환/이름변경/삭제) + 다중캔버스 export/import/reset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 사이드바 UI — 캔버스 목록(상단) + 썸네일 아코디언(하단)

**Files:**
- Modify: `map/map.html` (사이드바 마크업, `<style>`, `<script>` 사이드바 렌더/이벤트)

**Interfaces:**
- Consumes: `canvases`, `activeId`, `mode`, `esc()`, `switchCanvas()`, `newCanvas()`, `renameCanvas()`, `deleteCanvas()`.
- Produces: `function renderSidebar()` (Task 2·3에서 `typeof`/`refreshSidebar`로 참조).

- [ ] **Step 1: 사이드바 마크업 교체**

기존 `<aside class="side">...</aside>` 전체(약 147~152행)를 교체:

```html
  <aside class="side">
    <button class="side-toggle" id="sideBtn" onclick="toggleSide()">«</button>
    <div class="side-scroll">
      <div class="cv-head"><span class="cv-h-t">캔버스</span><button class="cv-add edit-only" onclick="newCanvas()">＋ 새 캔버스</button></div>
      <div class="cv-list" id="cvList"></div>
      <details class="lib-acc">
        <summary>썸네일 라이브러리</summary>
        <div class="side-h"><p>노드 위로 드래그하면 화면이 붙습니다.</p></div>
        <div class="lib" id="lib"></div>
      </details>
    </div>
    <div class="collapse-rail" onclick="toggleSide()">⠿ 캔버스</div>
  </aside>
```

- [ ] **Step 2: 사이드바 CSS 추가/조정**

`<style>` 에 추가(라이브러리 관련 기존 규칙은 그대로 둠). `.app.collapsed .side-h,.app.collapsed .lib{display:none}` 규칙을 아래로 교체:

```css
  .app.collapsed .side-scroll{display:none}
  .side-scroll{flex:1;overflow-y:auto;min-height:0;display:flex;flex-direction:column}
  .cv-head{display:flex;align-items:center;gap:8px;padding:15px 15px 9px}
  .cv-h-t{font-family:var(--mono);font-size:11px;letter-spacing:.12em;color:var(--faint);text-transform:uppercase;font-weight:700;flex:1}
  .cv-add{font-family:inherit;font-size:11px;font-weight:600;border:1px solid var(--line);background:var(--raised);color:var(--gold);border-radius:7px;padding:5px 8px;cursor:pointer;white-space:nowrap}
  .cv-add:hover{background:var(--raised2);border-color:var(--gold-dim)}
  .cv-list{display:flex;flex-direction:column;gap:3px;padding:0 9px 8px}
  .cv-item{display:flex;align-items:center;gap:8px;padding:8px 9px;border-radius:9px;cursor:pointer;border:1px solid transparent}
  .cv-item:hover{background:var(--surface)}
  .cv-item.on{background:var(--surface);border-color:var(--gold-dim)}
  .cv-dot{width:7px;height:7px;border-radius:50%;background:var(--faint);flex:none}
  .cv-item.on .cv-dot{background:var(--gold);box-shadow:0 0 7px rgba(255,188,0,.6)}
  .cv-name{flex:1;font-size:12.5px;color:#c2cad6;outline:none;border-radius:5px;padding:1px 3px;margin:-1px -3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .cv-item.on .cv-name{color:var(--txt);font-weight:600}
  .cv-name[contenteditable="true"]{background:#0d1117;color:#fff;text-overflow:clip;cursor:text}
  .cv-ren,.cv-del{width:20px;height:20px;border-radius:6px;border:1px solid var(--line);background:var(--raised);color:var(--muted);cursor:pointer;font-size:11px;display:none;place-items:center;flex:none}
  .cv-item:hover .cv-ren,.cv-item:hover .cv-del{display:grid}
  .cv-ren:hover{color:var(--gold);border-color:var(--gold-dim)} .cv-del:hover{color:var(--red);border-color:var(--red)}
  .lib-acc{border-top:1px solid var(--line);margin-top:auto}
  .lib-acc>summary{list-style:none;cursor:pointer;padding:11px 15px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--faint);text-transform:uppercase;font-weight:700;display:flex;align-items:center;gap:7px}
  .lib-acc>summary::-webkit-details-marker{display:none}
  .lib-acc>summary::before{content:"▸";color:var(--gold-dim);transition:transform .15s}
  .lib-acc[open]>summary::before{transform:rotate(90deg)}
  .lib-acc>summary:hover{color:var(--txt)}
```

- [ ] **Step 3: renderSidebar + 이벤트 위임 추가**

`<script>` 의 사이드바/모드 섹션(`function toggleSide(){...}` **앞**)에 추가:

```js
/* ---------- canvas sidebar ---------- */
function renderSidebar(){
  const el=document.getElementById('cvList');if(!el)return;
  el.innerHTML=canvases.map(c=>`
    <div class="cv-item ${c.id===activeId?'on':''}" data-cv="${c.id}">
      <span class="cv-dot"></span>
      <span class="cv-name" data-cvname="${c.id}">${esc(c.title)}</span>
      <button class="cv-ren edit-only" data-cvren="${c.id}" title="이름변경">✎</button>
      <button class="cv-del edit-only" data-cvdel="${c.id}" title="삭제">✕</button>
    </div>`).join('');
}
function startRename(id){
  const n=document.querySelector(`.cv-name[data-cvname="${id}"]`);if(!n)return;
  n.contentEditable='true';n.focus();
  const r=document.createRange();r.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(r);
}
const cvListEl=document.getElementById('cvList');
cvListEl.addEventListener('click',e=>{
  const del=e.target.closest('[data-cvdel]');if(del){deleteCanvas(del.dataset.cvdel);return}
  const ren=e.target.closest('[data-cvren]');if(ren){startRename(ren.dataset.cvren);return}
  if(e.target.closest('.cv-name[contenteditable="true"]'))return;
  const item=e.target.closest('[data-cv]');if(item)switchCanvas(item.dataset.cv);
});
cvListEl.addEventListener('keydown',e=>{const n=e.target.closest('[data-cvname]');if(n&&e.key==='Enter'){e.preventDefault();n.blur()}});
cvListEl.addEventListener('focusout',e=>{const n=e.target.closest('[data-cvname]');if(n){n.contentEditable='false';renameCanvas(n.dataset.cvname,n.innerText)}});
```

- [ ] **Step 4: 모드 전환 시 사이드바 재렌더 + collapse 라벨**

모드 토글 리스너(`modeSeg`) 끝의 `render()` 를 `render();renderSidebar();` 로 교체:
```js
document.getElementById('modeSeg').addEventListener('click',e=>{const m=e.target.dataset.mode;if(!m)return;mode=m;document.body.className=m;[...e.currentTarget.children].forEach(b=>b.classList.toggle('on',b.dataset.mode===m));render();renderSidebar()});
```
(collapse-rail 텍스트는 Step 1에서 이미 "⠿ 캔버스"로 변경됨.)

- [ ] **Step 5: 배포 후 통합 검증(서버 모드)**

Run:
```bash
cd /home/jschoi0223/projects/vdiportal/map
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:wjdtjd2@@parksvc.mycafe24.com; cd www/map; put map.html"
```
`https://parksvc.mycafe24.com/map/map.html` 에서 확인:
1. 사이드바 상단에 "캔버스" 헤더 + `＋ 새 캔버스`, 그 아래 현재 캔버스 1개(골드 점=활성).
2. 하단에 "▸ 썸네일 라이브러리" 아코디언(접힘). 클릭하면 펼쳐지고 썸네일 표시, 카드로 드래그 부착 정상.
3. `＋ 새 캔버스` → 새 항목 추가·전환, 캔버스 빈 상태('시작' 노드 1개).
4. `✎` → 이름 인라인 편집, Enter/포커스아웃 시 저장. 목록·헤더 반영.
5. 다른 캔버스 클릭 → 내용 전환. 새로고침 후에도 **마지막 활성 캔버스**가 복원(meta.activeId).
6. `✕` → 확인 후 삭제. 마지막 1개는 삭제 거부 토스트.
7. 보기 모드 전환 시 `＋`·`✎`·`✕` 숨김, 이름 편집 불가, 캔버스 전환은 가능.

서버 상태 확인:
```bash
curl -s "https://parksvc.mycafe24.com/map/api.php" | python3 -c "import sys,json;d=json.load(sys.stdin);print('canvases',len(d['canvases']),'active',d['meta'].get('activeId'))"
```
Expected: `canvases N active c_...` (N≥1, activeId가 실제 캔버스 id).

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/map.html
git commit -m "map: 사이드바 캔버스 목록 UI + 썸네일 아코디언 — 다중 캔버스 관리 완성

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 문서 갱신 + 최종 배포/푸시

**Files:**
- Modify: `map/CLAUDE.md`

- [ ] **Step 1: map/CLAUDE.md 갱신**

다음을 반영(해당 부분만 수정, 전면 재작성 금지):
1. 파일명 표기 `kb-vdi-flow.html` → `map.html` 로 정정(파일/제목/크기 언급 포함).
2. "파일" 섹션에 추가: `api.php`(서버 저장 API), `map_data.json`(서버 관리 데이터, 배포 시 불가침).
3. 새 섹션 "## 서버 저장 / 캔버스 관리" 추가 — 요지:
   - 데이터 모델 `doc={canvases:[{id,title,nodes,edges,groups,view,updated}],meta:{library,activeId},_rev}`.
   - op API(replace/upsert/delete/reorder/meta), 자동저장(디바운스 upsert), meta(library/activeId).
   - 인증 fail-open(`map_key.txt` 있으면 강제), 추후 로그인 예정.
   - graceful degradation: `api.php` 접근 불가(`file://` 등) → 메모리 모드 + `● 오프라인`.
   - 핵심 함수: `boot()`/`loadCanvas()`/`writeBackActive()`/`markDirty()`/`saveMeta()`/`switchCanvas()`/`newCanvas()`/`renameCanvas()`/`deleteCanvas()`/`renderSidebar()`.
4. "제약" 섹션의 localStorage 항목에 한 줄 보강: "서버 저장은 `api.php`로 처리(자체 호스팅). 미리보기/`file://`에선 메모리 모드로 자동 폴백."
5. "다음 작업 후보"에서 완료분(서버저장) 정리, 남은 후보 유지(화살표/직각선/라벨/PNG·SVG/reorder UI 등).

- [ ] **Step 2: 전체 회귀 점검(배포본)**

`https://parksvc.mycafe24.com/map/map.html` 에서 기존 인터랙션이 깨지지 않았는지 확인:
- 팬/줌/마퀴(Ctrl+드래그)/노드 드래그·다중이동/포트 드래그 연결/연결선 선택·삭제·방향전환·끝점이동/Tab·−·+·G·Del 단축키/라이트박스/가로·세로 자동정렬/화면맞춤/내보내기·불러오기.
- 각 동작 후 `● 저장됨` 으로 수렴, 새로고침 시 상태 유지.

Expected: 모든 기존 기능 정상 + 변경마다 자동저장.

- [ ] **Step 3: 커밋 + 푸시**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/CLAUDE.md
git commit -m "map: CLAUDE.md 갱신 — 파일명(map.html)·서버저장·캔버스 관리 반영

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```
Expected: push 성공(SSH 리모트 `git@github.com:yotachy/vdiportal.git`).

(배포는 Task 2·4 Step에서 이미 최신 `map.html`·`api.php` 업로드 완료. 추가 배포 불필요.)

---

## Self-Review (작성자 점검 결과)

- **Spec coverage**: 아키텍처(api.php/map.html/map_data.json)=T1·T2·T5, 데이터모델·op=T1, graceful degradation=T2(Step8), 자동저장 디바운스=T2, 캔버스 CRUD=T3, 사이드바 배치(목록 상단+아코디언 하단)=T4, 인증 fail-open=T1, 초기/예외 흐름=T2, 보존 제약=Global Constraints+T5(Step2 회귀), 배포/불가침=T1·T5, 문서갱신=T5. 누락 없음.
- **Placeholder scan**: TBD/TODO/"적절히 처리" 없음. 모든 코드 단계에 실제 코드 포함.
- **Type consistency**: `canvases`/`activeId`/`SERVER_OK`/`writeBackActive`/`loadCanvas`/`markDirty`/`saveMeta`/`switchCanvas`/`newCanvas`/`renameCanvas`/`deleteCanvas`/`renderSidebar`/`refreshSidebar`/`seedCanvas`/`stamp`/`apiGet`/`apiPost`/`setSaveState` — 정의(T2·T3·T4)와 사용처 명칭 일치. 캔버스 객체 키(id,title,nodes,edges,groups,view,updated)와 doc 키(canvases,meta,_rev), op 이름(replace/upsert/delete/reorder/meta), upsert 페이로드 키(`canvas`) 프론트·PHP 일치.
- **범위 밖 확인**: reorder UI·다중사용자 폴링·로그인 UI·PNG/SVG는 의도적으로 제외(spec YAGNI와 일치). reorder op는 API에만 존재.
