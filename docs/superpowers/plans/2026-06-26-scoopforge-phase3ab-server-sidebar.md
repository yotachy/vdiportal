# 스쿱포지 Phase 3 A+B (서버 저장 + 사이드바) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** forge를 서버 저장(forge-api.php + forge_data.json/forge_images.json) + 여러 전략 문서 사이드바 관리로 전환하고, 이미지 라이브러리를 사이드바로 옮기며 주제(이미지+제목)를 문서 단위로 관리한다.

**Architecture:** map.html의 검증된 `api.php`를 미러한 `forge-api.php`(파일명·`documents` 키만 변경)가 백엔드. forge.html에 클라이언트 서버 레이어(boot/loadDoc/writeBackActive/markDirty/saveMeta/putImg·loadImages, SERVER_OK 오프라인 폴백)와 좌측 사이드바(문서 목록 + 이미지 라이브러리)를 추가. 노드/엣지/weight/conviction/note/thumb 전부 문서에 직렬화·복원.

**Tech Stack:** 바닐라 JS + PHP(백엔드). 로컬 PHP 미설치 → **백엔드·클라이언트 통합 검증은 컨트롤러가 cafe24 라이브 엔드포인트(curl + 헤드리스 https)로** 수행. forge-core.js 무변경(node 15/15 회귀).

## Global Constraints

- 신규/수정: `map/forge-api.php`(신설), `map/forge.html`. **기존 `map/map.html`·`map/chart.html`·`map/api.php`·`map_data.json`·`map_images.json` 절대 불가침.** forge는 `forge-*` 파일만.
- 바닐라 JS, 2 spaces, 큰따옴표, 케밥케이스. 다크 골드 토큰. 한국어 UI. noindex.
- 데이터 모델: `doc={documents:[{id,title,themeImgId,nodes,edges,view,updated}], meta:{library:[{id,label}],activeId}, _rev}`.
- 서버 전용 + 오프라인 폴백(로컬모드 토글 없음). 이미지 dataURL은 forge_images.json에만(문서엔 imgId 참조). POST 본문 <128KB(이미지 putimg 분리).
- `forge.html`에 PHP 태그(`<?`) 넣지 말 것(cafe24 WAF). `forge-api.php`만 PHP.
- 검증: 코어 무변경이므로 `node --test map/forge-core.test.js` 15/15 유지. 그 외는 컨트롤러 라이브 검증(로컬 PHP 없음).

---

## Task 1: 백엔드 — `forge-api.php`

**Files:**
- Create: `map/forge-api.php`
- Reference (읽기): `map/api.php` (미러 원본)

**Interfaces:**
- Produces: HTTP API. GET→`forge_data.json`(없으면 `null`), `?images=1`→`forge_images.json`, `?check=1`→`{valid}`. POST `{op}`: `replace{doc}`/`upsert{document}`/`delete{id}`/`reorder{order}`/`meta{meta}`/`putimg{id,src}` → `{ok,rev}`. 데이터 키 `documents`. 파일 `forge_data.json`/`forge_images.json`/`forge_key.txt`.

- [ ] **Step 1: `forge-api.php` 작성** — `map/api.php`를 복제하되 치환: `map_data.json`→`forge_data.json`, `map_images.json`→`forge_images.json`, `map_key.txt`→`forge_key.txt`, 배열 키 `canvases`→`documents`, upsert 페이로드 키 `$d["canvas"]`→`$d["document"]`. 전체 파일:

```php
<?php
// 스쿱포지 — 전략 문서 저장 API (연산 기반, 동시 편집 안전). map/api.php 미러.
// doc = {documents:[{id,title,themeImgId,nodes,edges,view,updated}], meta:{library,activeId}, _rev:N}
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Write-Key");

$method = $_SERVER["REQUEST_METHOD"];
if ($method === "OPTIONS") { http_response_code(204); exit; }

$f  = __DIR__ . "/forge_data.json";
$kf = __DIR__ . "/forge_key.txt";
$WRITE_KEY = is_file($kf) ? trim(file_get_contents($kf)) : "";

function check_key($wk) {
  if ($wk === "") return true;
  $k = isset($_SERVER["HTTP_X_WRITE_KEY"]) ? $_SERVER["HTTP_X_WRITE_KEY"] : "";
  return hash_equals($wk, $k);
}
function jout($a){ header("Content-Type: application/json; charset=utf-8"); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }

if ($method === "GET") {
  header("Content-Type: application/json; charset=utf-8");
  header("Cache-Control: no-store");
  if (isset($_GET["check"])) { echo json_encode(["valid" => check_key($WRITE_KEY)]); exit; }
  if (isset($_GET["images"])) {
    $imgf = __DIR__ . "/forge_images.json";
    if (is_file($imgf)) { readfile($imgf); } else { echo "{}"; }
    exit;
  }
  if (is_file($f)) { readfile($f); } else { echo "null"; }
  exit;
}

if ($method !== "POST") { http_response_code(405); jout(["ok"=>false,"error"=>"method"]); }

if (!check_key($WRITE_KEY)) { http_response_code(403); jout(["ok"=>false,"error"=>"key"]); }
$d = json_decode(file_get_contents("php://input"), true);
if (!is_array($d) || !isset($d["op"])) { http_response_code(400); jout(["ok"=>false,"error"=>"noop"]); }
$op = $d["op"];

if ($op === "putimg") {
  $iid = isset($d["id"]) ? $d["id"] : null;
  $src = isset($d["src"]) ? $d["src"] : null;
  if ($iid === null || !is_string($src)) { http_response_code(400); jout(["ok"=>false,"error"=>"invalid"]); }
  $imgf = __DIR__ . "/forge_images.json";
  $ilock = fopen($imgf . ".lock", "c"); if ($ilock) { flock($ilock, LOCK_EX); }
  $imgs = is_file($imgf) ? json_decode(file_get_contents($imgf), true) : [];
  if (!is_array($imgs)) $imgs = [];
  $imgs[$iid] = $src;
  $itmp = $imgf . ".tmp." . getmypid();
  $okw = file_put_contents($itmp, json_encode($imgs, JSON_UNESCAPED_UNICODE)) !== false && rename($itmp, $imgf);
  if ($ilock) { flock($ilock, LOCK_UN); fclose($ilock); }
  if (!$okw) { http_response_code(500); jout(["ok"=>false,"error"=>"write"]); }
  jout(["ok"=>true]);
}

$lock = fopen($f . ".lock", "c");
if ($lock) { flock($lock, LOCK_EX); }

$doc = ["documents"=>[], "meta"=>new stdClass(), "_rev"=>0];
if (is_file($f)) {
  $cur = json_decode(file_get_contents($f), true);
  if (is_array($cur) && isset($cur["documents"]) && is_array($cur["documents"])) $doc = $cur;
}
if (!isset($doc["documents"]) || !is_array($doc["documents"])) $doc["documents"] = [];
if (!isset($doc["meta"]) || !is_array($doc["meta"])) $doc["meta"] = [];

$err = "";
if ($op === "replace") {
  $nd = isset($d["doc"]) ? $d["doc"] : null;
  if (!is_array($nd) || !isset($nd["documents"]) || !is_array($nd["documents"])) $err = "invalid";
  else { $doc["documents"] = $nd["documents"]; $doc["meta"] = isset($nd["meta"]) && is_array($nd["meta"]) ? $nd["meta"] : []; }
} elseif ($op === "upsert") {
  $it = isset($d["document"]) ? $d["document"] : null;
  if (!is_array($it) || !isset($it["id"])) $err = "invalid";
  else {
    $found = false;
    foreach ($doc["documents"] as $i => $x) { if (isset($x["id"]) && $x["id"] === $it["id"]) { $doc["documents"][$i] = $it; $found = true; break; } }
    if (!$found) $doc["documents"][] = $it;
  }
} elseif ($op === "delete") {
  $id = isset($d["id"]) ? $d["id"] : null;
  if ($id === null) $err = "invalid";
  else $doc["documents"] = array_values(array_filter($doc["documents"], function($x) use ($id){ return !(isset($x["id"]) && $x["id"] === $id); }));
} elseif ($op === "reorder") {
  $order = isset($d["order"]) && is_array($d["order"]) ? $d["order"] : null;
  if ($order === null) $err = "invalid";
  else {
    $map = [];
    foreach ($doc["documents"] as $x) { if (isset($x["id"])) $map[$x["id"]] = $x; }
    $new = [];
    foreach ($order as $id) { if (isset($map[$id])) { $new[] = $map[$id]; unset($map[$id]); } }
    foreach ($map as $x) { $new[] = $x; }
    $doc["documents"] = $new;
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

- [ ] **Step 2: 컨트롤러 라이브 검증(배포 + curl)** — 로컬 PHP 없으므로 컨트롤러가 `forge-api.php`를 cafe24 `www/map/`에 배포 후 curl로 ops 시퀀스 검증:
  - `GET forge-api.php` → `null`(초기).
  - `POST replace {doc:{documents:[{id:"d1",title:"t",nodes:[],edges:[]}],meta:{activeId:"d1"}}}` → `{ok,rev:1}`.
  - `GET` → documents 포함 doc.
  - `POST upsert {document:{id:"d1",title:"t2",nodes:[{id:"n1"}],edges:[]}}` → `{ok,rev:2}`, `GET` 반영.
  - `POST putimg {id:"i1",src:"data:..."}` → `{ok}`, `GET ?images=1` → `{i1:...}`.
  - `GET ?check=1` → `{valid:true}`(키 파일 없음).
  - **검증 후 테스트 데이터 정리**: `forge_data.json`/`forge_images.json`를 삭제(또는 빈 상태)로 되돌려 사용자 첫 로드시 클라이언트가 시드하게 함.

- [ ] **Step 3: 커밋**
```bash
git add map/forge-api.php
git commit -m "feat(forge): 서버 저장 백엔드 forge-api.php (map api.php 미러, documents/forge_*.json)"
```

---

## Task 2: 클라이언트 서버 레이어 + 문서 모델

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `boardState`, `renderBoard`, `runForge`, `themeState`/`renderTheme`, `IMAGES`/`LIBRARY`/`imgSrc`, `seedDefaultStrategy`, `uid`.
- Produces (전역):
  - `FORGE_API = "forge-api.php"`, `SERVER_OK`(bool), `DOCS`(documents[]), `META`({library,activeId}), `activeId`.
  - `apiGet(qs)`/`apiPost(body)` (fetch 래퍼, 실패 시 `SERVER_OK=false`).
  - `boot()`, `loadDoc(id)`, `writeBackActive()`, `markDirty()`(800ms 디바운스), `saveMeta()`, `putImg(id,src)`(서버), `loadImages()`, `setSaveState(s)`.
  - 활성 문서 직렬화 형태: `{ id, title, themeImgId, nodes:boardState.nodes, edges:boardState.edges, view, updated }`.

- [ ] **Step 1: API 래퍼 + 상태 전역** — forge.html `<script>`에 추가:
```js
const FORGE_API = "forge-api.php";
let SERVER_OK = true, DOCS = [], META = { library: [], activeId: null }, activeId = null;
async function apiGet(qs) {
  try { const r = await fetch(FORGE_API + (qs || ""), { cache: "no-store" });
    if (!r.ok) throw 0; SERVER_OK = true; return await r.json(); }
  catch (e) { SERVER_OK = false; setSaveState("offline"); return undefined; }
}
async function apiPost(body) {
  try { const r = await fetch(FORGE_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw 0; SERVER_OK = true; return await r.json(); }
  catch (e) { SERVER_OK = false; setSaveState("offline"); return undefined; }
}
function setSaveState(s) {
  const el = document.getElementById("saveBadge"); if (!el) return;
  el.textContent = s === "saving" ? "● 저장 중…" : s === "offline" ? "● 오프라인" : "● 저장됨";
  el.className = "save-badge " + s;
}
```
헤더에 저장 배지 `<span class="save-badge saved" id="saveBadge">● 저장됨</span>` 추가(run/export 버튼 근처). CSS 토큰.

- [ ] **Step 2: boot/load/writeBack/markDirty/saveMeta** —
```js
function activeDoc() { return DOCS.find(d => d.id === activeId) || null; }
function serializeActive() {
  const dc = activeDoc(); if (!dc) return null;
  dc.nodes = boardState.nodes; dc.edges = boardState.edges;
  dc.themeImgId = themeState.imgId; dc.title = themeState.title || dc.title;
  dc.view = { tx: view.tx, ty: view.ty, scale: view.scale };
  dc.updated = new Date().toISOString();
  return dc;
}
async function writeBackActive() {
  const dc = serializeActive(); if (!dc) return;
  if (!SERVER_OK) return;
  setSaveState("saving");
  const r = await apiPost({ op: "upsert", document: dc });
  setSaveState(r && r.ok ? "saved" : "offline");
}
let _saveT = null;
function markDirty() { if (!SERVER_OK) return; clearTimeout(_saveT); _saveT = setTimeout(writeBackActive, 800); }
async function saveMeta() { if (!SERVER_OK) return; await apiPost({ op: "meta", meta: { library: LIBRARY, activeId } }); }
function loadDoc(id) {
  const dc = DOCS.find(d => d.id === id); if (!dc) return;
  activeId = id; META.activeId = id;
  boardState.nodes = dc.nodes || []; boardState.edges = dc.edges || [];
  themeState.imgId = dc.themeImgId || null; themeState.title = dc.title || "";
  if (dc.view) { view.tx = dc.view.tx; view.ty = dc.view.ty; view.scale = dc.view.scale; }
  sel = []; selEdge = null;
  renderBoard(); renderTheme(); if (window.renderSidebar) renderSidebar(); runForge();
}
async function loadImages() { const m = await apiGet("?images=1"); if (m && typeof m === "object") Object.assign(IMAGES, m); }
async function boot() {
  const doc = await apiGet("");
  await loadImages();
  if (doc && doc.documents && doc.documents.length) {
    DOCS = doc.documents; META = doc.meta || { library: [], activeId: null };
    LIBRARY.length = 0; (META.library || []).forEach(it => LIBRARY.push(it));
    loadDoc(META.activeId && DOCS.some(d => d.id === META.activeId) ? META.activeId : DOCS[0].id);
  } else {
    // 첫 부팅/빈 데이터 → 기본 문서 시드
    seedDefaultStrategy();
    const dc = { id: uid("doc"), title: "새 전략", themeImgId: themeState.imgId || null,
      nodes: boardState.nodes, edges: boardState.edges, view: { tx: view.tx, ty: view.ty, scale: view.scale }, updated: new Date().toISOString() };
    DOCS = [dc]; activeId = dc.id; META = { library: [], activeId: dc.id };
    if (window.renderSidebar) renderSidebar(); runForge();
    if (SERVER_OK) writeBackActive();
  }
  setSaveState(SERVER_OK ? "saved" : "offline");
}
```

- [ ] **Step 3: putImg 서버화 + markDirty 후킹** — 기존 `putImg(id,src)`를 서버 저장으로:
```js
function putImg(id, src) { IMAGES[id] = src; if (SERVER_OK) apiPost({ op: "putimg", id, src }); }
```
보드 편집 종료점(노드 추가/이동완료/삭제/연결/파라미터·weight·conviction·note 변경/주제 변경)에서 `fireBoardChange` 경로 끝에 `markDirty()` 호출(기존 `onBoardChange` 디바운스 재계산과 별도로 저장 디바운스). 부팅에서 기존 `seedDefaultStrategy(); runForge();` 직접 호출을 **`boot()`로 대체**(중복 시드 제거).

- [ ] **Step 4: 컨트롤러 라이브 검증** — forge.html + forge-api.php를 cafe24 배포 후 헤드리스로 라이브 URL 로드 → 콘솔 에러 0, 첫 로드시 기본 문서 시드+저장(서버에 forge_data.json 생성), 노드 추가 후 새로고침 시 복원, 저장 배지 `● 저장됨`. api 경로 차단 시 `● 오프라인` 폴백.

- [ ] **Step 5: 커밋**
```bash
git add map/forge.html
git commit -m "feat(forge): 클라이언트 서버 레이어(boot/load/저장/오프라인 폴백) + 문서 모델"
```

---

## Task 3: 사이드바 — 문서 목록 + 레이아웃

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `DOCS`, `activeId`, `loadDoc`, `writeBackActive`, `saveMeta`, `uid`, `seedDefaultStrategy`(또는 빈 문서), `boardState`, `themeState`, `view`, `renderBoard`, `runForge`, `esc`.
- Produces: `.forge-side` 사이드바 + `renderSidebar()`, `switchDoc(id)`, `newDoc()`, `renameDoc(id,title)`, `deleteDoc(id)`.

- [ ] **Step 1: 레이아웃 — 사이드바 추가** — 최상위 레이아웃을 `사이드바 | forge-split`로. body 또는 최상위 컨테이너를 `display:flex`로 만들고 좌측 `<aside class="forge-side" id="forgeSide">` + 우측 기존 `.forge-split`. CSS:
```css
.forge-shell{display:flex;height:100vh}
.forge-side{flex:0 0 220px;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;overflow:hidden}
.forge-side.collapsed{flex-basis:0;border:0}
.forge-side .side-sec{padding:10px;border-bottom:1px solid var(--line)}
.forge-side .side-h{font-size:11px;color:var(--eth);margin:0 0 8px;display:flex;justify-content:space-between;align-items:center}
.forge-side .doc-row{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;color:var(--ink)}
.forge-side .doc-row.active{background:var(--raised2);color:var(--gold)}
.forge-side .doc-row:hover{background:var(--raised2)}
.side-btn{background:transparent;border:1px solid var(--line);color:var(--eth);border-radius:6px;font-size:11px;padding:2px 8px;cursor:pointer}
```
(forge-split이 이미 grid `1fr 1fr`로 boardPane/chartPane을 잡고 있으면, 그 부모를 `.forge-shell` flex의 우측 1fr로 둠 — `.forge-split{flex:1;min-width:0}`.)

- [ ] **Step 2: `renderSidebar` + 문서 CRUD** —
```js
function renderSidebar() {
  const el = document.getElementById("forgeSide"); if (!el) return;
  const docs = DOCS.map(d =>
    `<div class="doc-row${d.id === activeId ? " active" : ""}" data-doc="${d.id}">
       <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.title || "제목 없음")}</span>
       <button class="side-btn" data-docren="${d.id}">✎</button>
       <button class="side-btn" data-docdel="${d.id}">✕</button>
     </div>`).join("");
  el.innerHTML =
    `<div class="side-sec"><div class="side-h"><span>전략 문서</span><button class="side-btn" id="newDocBtn">＋ 새 문서</button></div>${docs}</div>
     <div class="side-sec" id="libSec"></div>`;
  if (window.renderLib) renderLib();   // 라이브러리 섹션(Task 4)
}
function switchDoc(id) { if (id === activeId) return; writeBackActive(); loadDoc(id); saveMeta(); }
function newDoc() {
  writeBackActive();
  const dc = { id: uid("doc"), title: "새 전략", themeImgId: null, nodes: [], edges: [],
    view: { tx: 30, ty: 20, scale: 1 }, updated: new Date().toISOString() };
  DOCS.push(dc); loadDoc(dc.id); seedDefaultStrategy(); writeBackActive(); saveMeta(); renderSidebar();
}
function renameDoc(id, title) { const d = DOCS.find(x => x.id === id); if (!d) return; d.title = title;
  if (id === activeId) { themeState.title = title; renderTheme(); } renderSidebar(); writeBackActive(); }
function deleteDoc(id) {
  if (DOCS.length <= 1) { bToast("최소 1개 문서는 필요해요"); return; }
  DOCS = DOCS.filter(d => d.id !== id);
  if (SERVER_OK) apiPost({ op: "delete", id });
  if (id === activeId) loadDoc(DOCS[0].id);
  renderSidebar(); saveMeta();
}
```
사이드바 이벤트 위임: `#newDocBtn`→`newDoc()`; `.doc-row[data-doc]` 클릭→`switchDoc`; `[data-docren]`→prompt로 이름변경 `renameDoc`; `[data-docdel]`→`deleteDoc`. 부팅 `boot()` 후 `renderSidebar()`.

- [ ] **Step 3: 컨트롤러 라이브 검증** — 헤드리스 라이브: 사이드바에 문서 목록 표시, ＋새 문서→새 문서 생성·전환, 문서 전환 시 보드/주제 교체, 이름변경 반영, 삭제(최소1 유지). 새로고침 후 activeId 복원.

- [ ] **Step 4: 커밋**
```bash
git add map/forge.html
git commit -m "feat(forge): 좌측 사이드바 — 전략 문서 목록(생성/전환/이름변경/삭제) + 레이아웃"
```

---

## Task 4: 이미지 라이브러리 사이드바 이전 + 주제 문서 연동

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `renderSidebar`(libSec 컨테이너), `LIBRARY`/`IMAGES`/`putImg`/`downscaleImage`/`imgSrc`/`setThumb`/`setThemeImg`, `saveMeta`, `markDirty`, 기존 드래그/Ctrl+V 핸들러.
- Produces: 사이드바 내 라이브러리 섹션 렌더(`renderLib`를 `#libSec`에 출력), 서버 이미지 저장, 주제 이미지·제목이 활성 문서에 연동.

- [ ] **Step 1: 라이브러리를 사이드바로 이전** — 기존 떠있는 `.forge-lib`(#libPanel) 마크업/생성 제거하고, `renderLib()`가 `#libSec`(사이드바, Task 3에서 생성)에 렌더하도록 변경:
```js
function renderLib() {
  const el = document.getElementById("libSec"); if (!el) return;
  el.innerHTML =
    `<div class="side-h"><span>이미지 라이브러리</span><button class="side-btn" id="libAddBtn">＋ 추가</button></div>
     <div class="lib-grid">` +
    (LIBRARY.length ? LIBRARY.map(it =>
      `<div class="lib-it" draggable="true" data-img="${esc(it.id)}"><img src="${esc(imgSrc(it.id))}" alt="${esc(it.label || "")}" title="${esc(it.label || "")}"></div>`).join("")
      : `<div style="font-size:11px;color:var(--eth)">이미지를 추가하거나 Ctrl+V로 붙여넣기</div>`) +
    `</div>`;
}
```
숨김 `<input type="file" id="libFile" accept="image/*">`는 유지(body). `#libAddBtn`→`libFile.click()`. libFile change → downscale → `putImg`(서버) → `LIBRARY.push` → `saveMeta()` → `renderLib()`. 기존 드래그 적용/노드 OS 파일 드롭 핸들러 유지(서버 putImg 경유). 드래그 적용 시 `markDirty()`.

- [ ] **Step 2: 주제 이미지·제목 문서 연동** — `setThemeImg(imgId)`가 `themeState.imgId` 설정 + `markDirty()`. 주제 배너 제목(.th-title) focusout → `themeState.title` 설정 + 활성 문서 title 갱신(`renameDoc(activeId, themeState.title)` 또는 직접) + `renderSidebar()` + `markDirty()`. Ctrl+V 무선택 시 주제 이미지 적용도 `markDirty()`.

- [ ] **Step 3: 컨트롤러 라이브 검증** — 헤드리스 라이브: 사이드바 라이브러리에 이미지 추가→서버 저장(forge_images.json)→새로고침 후 유지, 노드 드래그 적용 후 저장·복원, 주제 이미지/제목 변경이 문서에 저장되고 사이드바 제목 동기화.

- [ ] **Step 4: 커밋**
```bash
git add map/forge.html
git commit -m "feat(forge): 이미지 라이브러리 사이드바 이전 + 서버 이미지 + 주제 문서 연동"
```

---

## Task 5: 통합 검증 + 정리 + 배포 준비

**Files:**
- Modify: `map/forge.html` (필요 시 미세 수정만)

**Interfaces:**
- Consumes: 전체.

- [ ] **Step 1: 직렬화 완전성 점검** — 활성 문서 저장/복원 시 노드의 **weight/conviction/note/thumb/params** 및 엣지의 style/arrow/width/route/label이 모두 보존되는지 확인(serializeActive는 boardState.nodes/edges를 통째 저장하므로 보존되어야 함). 빠진 필드 있으면 보정.

- [ ] **Step 2: 캔버스/오버레이 좌표 정합** — 사이드바로 보드 페인 폭이 줄었을 때 캔버스·오버레이(`#bStage`/`#boardOverlay`/차트)가 정상 정렬되는지(리사이즈 핸들러 재측정) 확인.

- [ ] **Step 3: node 회귀 + 라이브 종합 검증** — `node --test map/forge-core.test.js` 15/15. 컨트롤러 헤드리스 라이브 종합: 다문서 생성·전환·삭제·이름변경, 자동저장→새로고침 복원, 이미지 라이브러리·주제, weight/블록/예측 전부 동작, 오프라인 폴백 배지, JSON 내보내기 유지, 콘솔 에러 0. **테스트 데이터 정리**(curl로 만든 잔재 제거, 깨끗한 기본 문서 상태).

- [ ] **Step 4: 커밋**
```bash
git add map/forge.html
git commit -m "feat(forge): 서버저장+사이드바 통합 검증 + 직렬화 완전성"
```

---

## Self-Review (작성자 점검)

**Spec coverage:**
- §2 백엔드 forge-api.php(documents/forge_*.json/forge_key.txt, ops) → Task 1. ✅
- §3 클라 서버레이어(boot/loadDoc/writeBackActive/markDirty/saveMeta/putImg·loadImages/SERVER_OK 폴백/저장배지/시드) → Task 2. ✅
- §4 사이드바(문서 목록 CRUD + 레이아웃) → Task 3; (라이브러리 이전 + 주제 문서연동) → Task 4. ✅
- §2 데이터모델(documents{id,title,themeImgId,nodes,edges,view}) → Task 2 serialize/loadDoc. ✅
- §5 검증(라이브 curl+헤드리스, 테스트데이터 정리) → Task 1 Step2·각 Task 검증 Step·Task 5. ✅
- §7 직렬화 완전성·좌표 정합·node 회귀·map 불가침 → Task 5·Global. ✅

**Placeholder scan:** forge-api.php 전체 코드 포함. 클라 함수(api래퍼/boot/loadDoc/writeBack/markDirty/saveMeta/renderSidebar/CRUD/renderLib) 실제 코드. 라이브 검증은 컨트롤러(로컬 PHP 없음 — 명시). 플레이스홀더 없음.

**Type consistency:** `DOCS`(documents[]), `META{library,activeId}`, `activeId`, 문서 `{id,title,themeImgId,nodes,edges,view,updated}` 전 태스크 일관. upsert 페이로드 키 `document`(클라 writeBackActive)↔`$d["document"]`(PHP) 일치. `op` 이름(replace/upsert/delete/reorder/meta/putimg) 클라↔PHP 일치. `renderSidebar`/`renderLib`(libSec)/`loadDoc`/`switchDoc`/`newDoc`/`renameDoc`/`deleteDoc`/`putImg`/`loadImages`/`setSaveState` 명칭 일관. `themeState{imgId,title}`↔문서 `themeImgId`/`title` 매핑 명시.
