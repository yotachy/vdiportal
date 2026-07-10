# PotFlow 영상+책갈피 관리기 단순화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 노드 타입 단순화(mini/text/icon 제거), 연결=원본↔책갈피 자동 체인 전용(수동 연결 제거), 오른쪽 사이드바 폭 조절, pbf 파일도 탐색기 목록에.

**Tech Stack:** Python 표준라이브러리, 바닐라 JS 단일 HTML.

## Global Constraints
- Python 표준라이브러리만. 바닐라 JS·단일 파일·외부 라이브러리 금지.
- 수정 파일: `map/potflow-helper.py`·`map/potflow.html`·`map/test_potflow_helper.py`만.
- **좌측 accent 라인 금지**. 한국어 UI. Host 가드·CORS 유지.
- 테스트 러너(venv): `cd map && /tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/104149d1-1d21-4142-91c1-1f33734bdc96/scratchpad/venv/bin/pytest test_potflow_helper.py -q`
- 클라 검증: 인라인 `<script>` 추출 후 `node --check`; 헤드리스 Windows Chrome 스크린샷.
- 삭제보다 **비활성(neutralize) 우선**(리스크↓): 죽은 코드/CSS는 남겨도 됨(범위 밖).

---

## Task 1: 헬퍼 — scan_tree에 pbf 포함 + kind

**Files:** Modify `map/potflow-helper.py`, Test `map/test_potflow_helper.py`

**Interfaces:** `scan_tree` files 엔트리에 `.pbf` 포함 + `kind:"video"|"pbf"` 추가(기존 name/path/size/mtime/ext 유지).

- [ ] **Step 1: 실패 테스트 추가**
```python
def test_scan_tree_includes_pbf_and_kind(tmp_path):
    (tmp_path / "a.mp4").write_bytes(b"x")
    (tmp_path / "a.mp4.pbf").write_text("[Bookmark]\n0=1000*x*")
    r = helper.scan_tree(str(tmp_path))
    kinds = {f["name"]: f["kind"] for f in r["files"]}
    assert kinds.get("a.mp4") == "video"
    assert kinds.get("a.mp4.pbf") == "pbf"
```

- [ ] **Step 2: 실패 확인** — FAIL (kind 없음/pbf 미포함)

- [ ] **Step 3: 구현** — `scan_tree`의 파일 분기를 교체:
```python
            else:
                ext_l = os.path.splitext(name)[1].lower()
                kind = "video" if ext_l in VIDEO_EXTS else ("pbf" if ext_l == ".pbf" else None)
                if not kind:
                    continue
                try:
                    size = os.path.getsize(fp)
                except OSError:
                    size = 0
                try:
                    mtime = os.path.getmtime(fp)
                except OSError:
                    mtime = 0
                files.append({"name": name, "path": fp, "size": size, "mtime": mtime,
                              "ext": ext_l.lstrip("."), "kind": kind})
```
(기존 `elif os.path.splitext(name)[1].lower() in VIDEO_EXTS:` 블록 전체를 위 `else:` 블록으로 대체.)

- [ ] **Step 4: 통과 확인** — PASS (28 passing)

- [ ] **Step 5: 커밋**
```bash
git add map/potflow-helper.py map/test_potflow_helper.py
git commit -m "feat(potflow): scan_tree에 pbf 파일 포함 + kind(video/pbf)"
```

---

## Task 2: 클라 — 노드 타입 단순화 + 수동 연결 제거

**Files:** Modify `map/potflow.html`

**Interfaces:** 팔레트/노드생성/연결 관련. 삭제 대신 비활성 위주.

- [ ] **Step 1: 팔레트 정리**
- `기본 노드` 버튼(라인 ~407)의 `title`/이름을 "노드"로: `<span class="tr-name">노드</span>`(title="노드 추가").
- **중간 노드 버튼**(addMiniCenter, ~408) 줄 삭제.
- **텍스트 버튼**(addTextCenter, ~409) 줄 삭제.
- **아이콘 섹션 전체** 삭제: `<div class="tr-group icons" id="iconGroup"> ... </div>`(iconGroup 열고 닫는 div 통째).

- [ ] **Step 2: 생성 함수/단축키 비활성**
- Tab/Enter 단축키(라인 ~1325-1326 `addChildMini`/`addSiblingMini`) 제거: 두 `if(e.key==='Tab')`/`if(e.key==='Enter')` 블록 삭제.
- 아이콘 팔레트 클릭 리스너(~1305 `iconPalEl.addEventListener`) 및 `renderPalette()` 호출부: `iconPalEl`이 없으면 에러 → `const iconPalEl=document.getElementById('iconPal'); if(iconPalEl)iconPalEl.addEventListener(...)`로 가드. `renderPalette` 함수는 내부를 `const el=document.getElementById('iconPal'); if(!el)return;`로 가드(호출부 유지 가능).
- 아이콘 드롭 핸들러(~1168 `if(iid){...makeNode(...,"icon",iid)...}`): iconGroup 제거로 iid 소스 없음 → 남겨도 무해(비활성). 유지.
- `addMiniCenter`/`addTextCenter`/`addIconCenter`/`addChildMini`/`addSiblingMini` 함수: 참조가 사라지므로 남겨도 되나, 호출부 제거만 확실히. (죽은 함수 유지 허용.)

- [ ] **Step 3: 포트/수동 연결 비활성**
- `nodeHTML`의 포트 생성(라인 ~705 `const ports=...4개 div...`)을 `const ports='';`로 교체(포트 미표시).
- `startLink`(~1033)·`startEndpoint`(~1034) 함수 본문 맨 앞에 `return;` 추가(무동작).
- `drawEhud`(~759) 함수 본문 맨 앞에 `const hud=document.getElementById('ehud'); if(hud)hud.innerHTML=''; return;` 추가(엣지 편집 핸들 미표시). (엣지 렌더 자체는 paint()가 유지.)

- [ ] **Step 4: 검증 + 커밋**
- 인라인 `node --check` OK.
- 헬퍼 실행 후 헤드리스 로드 → 팔레트에 "노드"만(중간/텍스트/아이콘 없음), 콘솔 치명오류 없음, 기본 예시 다이어그램 정상 렌더. 스크린샷 `/mnt/c/Users/yotac/screenshots/pf-bm2.png` 확인.
```bash
git add map/potflow.html
git commit -m "feat(potflow): 노드 단순화(중간/텍스트/아이콘 제거) + 수동 연결 비활성"
```

---

## Task 3: 클라 — 책갈피 체인 연결(원본→책1→책2→…)

**Files:** Modify `map/potflow.html`

**Interfaces:** `syncBookmarks`를 fan→chain으로. Consumes `N`,`makeNode`,`addEdge`,`delNodes`,`state.edges`,`bmChildren`,`putImg`,`render`,`markDirty`,`fmtClock`,`isPro`,`bmChildren`.

- [ ] **Step 1: syncBookmarks 체인화**
기존 `bms.forEach(...)` ~ `if(stale.length)delNodes(stale);` 구간을 교체:
```js
    const existing={};bmChildren(nodeId).forEach(c=>{existing[c.seekMs]=c;});
    const seen={};const chainIds=[nodeId];let i=0;
    bms.forEach(b=>{seen[b.ms]=1;let c=existing[b.ms];
      if(!c){c=makeNode(n.x+(i+1)*270,n.y,'',"full");c.bmParent=nodeId;c.seekMs=b.ms;c.videoPath=n.videoPath;}
      c.title=b.title||('책갈피 '+fmtClock(b.ms));c.desc=fmtClock(b.ms);
      if(b.thumb){const iid='bm_'+nodeId+'_'+b.ms;putImg(iid,b.thumb);c.thumb={imgId:iid,label:c.title};}
      chainIds.push(c.id);i++;});
    const stale=bmChildren(nodeId).filter(c=>!seen[c.seekMs]).map(c=>c.id);
    if(stale.length)delNodes(stale);
    // 체인 재구성: 이 영상+책갈피들 사이 기존 엣지 제거 후 순서대로 연결
    const cs=new Set(chainIds);
    state.edges=state.edges.filter(e=>!(cs.has(e.from)&&cs.has(e.to)));
    for(let k=0;k<chainIds.length-1;k++)addEdge(chainIds[k],'right',chainIds[k+1],'left');
```
(`addEdge`는 중복이면 자동 무시. 체인은 가로 방향 right→left.)

- [ ] **Step 2: 검증 + 커밋**
- `node --check` OK. 헤드리스 로드 정상.
- (실제 pbf로 체인 생성은 로컬 수동 — 리포트 명시. 시드 데이터로 체인 렌더 확인 가능.)
```bash
git add map/potflow.html
git commit -m "feat(potflow): 책갈피 연결을 체인(원본→책1→책2→…)으로"
```

---

## Task 4: 클라 — 오른쪽 사이드바 폭 조절

**Files:** Modify `map/potflow.html`

**Interfaces:** `.app` 그리드 3열을 CSS 변수화 + `.rside` 좌측 거터 드래그. Consumes `lsGet`/`lsSet`.

- [ ] **Step 1: 그리드 변수화 + 거터 CSS/마크업**
- `.app` 그리드(라인 43-44)의 `300px`을 `var(--rside-w,300px)`로 교체:
  - `.app{...grid-template-columns:226px 1fr var(--rside-w,300px);...}`
  - `.app.collapsed{grid-template-columns:44px 1fr var(--rside-w,300px)}`
  - (view 모드 45-46은 3열 없음 — 그대로.)
- `.rside` CSS에 `position:relative` 추가. 거터 CSS 추가:
```css
  .rside-gutter{position:absolute;left:0;top:0;width:7px;height:100%;cursor:ew-resize;z-index:6}
  .rside-gutter:hover{background:var(--gold-dim)}
```
- `.rside`(id="rside") 첫 자식으로 거터 추가: `<div class="rside-gutter" id="rsideGutter"></div>`.

- [ ] **Step 2: 리사이즈 로직 + 영속**
스크립트에 추가(전역):
```js
const RSIDE_MIN=220,RSIDE_MAX=640;
function setRsideW(px){px=Math.max(RSIDE_MIN,Math.min(RSIDE_MAX,Math.round(px)));const a=document.getElementById('app');if(a)a.style.setProperty('--rside-w',px+'px');lsSet('potflow_rside_w',String(px));}
(function(){const g=document.getElementById('rsideGutter');if(!g)return;let on=false;
  g.addEventListener('pointerdown',e=>{e.preventDefault();on=true;try{g.setPointerCapture(e.pointerId)}catch(_){}});
  g.addEventListener('pointermove',e=>{if(on)setRsideW(window.innerWidth-e.clientX);});
  g.addEventListener('pointerup',()=>{on=false;});g.addEventListener('pointercancel',()=>{on=false;});
})();
```
boot() 말미(또는 초기화부)에 저장폭 적용: `const _rw=parseInt(lsGet('potflow_rside_w'),10);if(_rw)setRsideW(_rw);`

- [ ] **Step 3: 검증 + 커밋**
- `node --check` OK. 헤드리스 로드 → 사이드바 우측에 거터 보이고 레이아웃 정상(스크린샷). 실제 드래그는 로컬 수동.
```bash
git add map/potflow.html
git commit -m "feat(potflow): 오른쪽 사이드바 폭 드래그 조절(영속)"
```

---

## Task 5: 클라 — pbf 파일 탐색기 통합

**Files:** Modify `map/potflow.html`

**Interfaces:** 탐색기 렌더/드래그/더블클릭. Consumes `rsData`/`renderExplorer`/`sortedFiles`/`rsRow`, `HELPER`,`N`,`makeNode`,`render`,`bindVideoToNode`,`playItems`,`worldPt`,`nodeAt`,`toast`. (Task1로 /tree files에 `kind` 존재)

- [ ] **Step 1: pbf 행 렌더(구분 표시)**
`renderExplorer`의 파일 행 생성부에서 kind에 따라 아이콘/클래스 분기: video=🎬, pbf=🔖. 파일 행 요소에 `row.dataset.kind=f.kind;`(video/pbf) 저장, pbf면 `row.classList.add('rs-pbf')`. (정렬 sortedFiles는 그대로 — pbf도 포함/정렬됨.)
CSS(선택): `.rs-file.rs-pbf .rs-name{color:var(--gold)}`.

- [ ] **Step 2: pbf 더블클릭 = 영상 재생 / 드래그 = 영상+책갈피 체인**
- 탐색기 dblclick 핸들러: 행이 pbf면 `/bookmarks?path=`로 영상 복원 후 재생:
```js
// dblclick 핸들러 내
if(row.dataset.kind==='pbf'){fetch(HELPER+"/bookmarks?path="+encodeURIComponent(row.dataset.path)).then(r=>r.json()).then(d=>{if(d&&d.ok&&d.video)playItems([{path:d.video,seek:null,win:null}]);else toast('영상을 찾을 수 없습니다')}).catch(()=>toast('재생 실패'));return;}
```
(video면 기존 재생 로직 유지.)
- 스테이지 드롭에서 pbf 처리: 사이드바 드래그가 실어보내는 payload에 `kind` 포함(dragstart에서 `text/potflow-video`에 `{path,name,kind}`). 드롭 시 kind가 pbf면:
```js
if(payload.kind==='pbf'){const p=worldPt(e.clientX,e.clientY);
  fetch(HELPER+"/bookmarks?path="+encodeURIComponent(payload.path)).then(r=>r.json()).then(d=>{
    if(d&&d.ok&&d.video){const nn=makeNode(p.x-W_NODE/2,p.y-30);render();bindVideoToNode(nn.id,d.video,d.video.split(/[\\/]/).pop());}
    else toast('영상을 찾을 수 없습니다');}).catch(()=>toast('불러오기 실패'));
  return;}
```
(`bindVideoToNode`가 videoPath 지정+syncBookmarks(체인) 자동 호출 → 원본+책갈피 체인 생성.)
- dragstart(사이드바 파일 행)에서 payload에 kind 추가: 기존 `setData('text/potflow-video',JSON.stringify({path,name}))`를 `{path,name,kind:row.dataset.kind}`로.

- [ ] **Step 3: 검증 + 커밋**
- `node --check` OK. 헬퍼 실행 후 `/tree`에 pbf 포함 확인(curl). 헤드리스 로드 정상. 실제 pbf 드래그/재생은 로컬 수동(리포트 명시).
```bash
git add map/potflow.html
git commit -m "feat(potflow): 탐색기에 pbf 표시 + pbf 드래그로 영상+책갈피 체인 생성"
```

---

## Self-Review
- **Spec 커버**: A(노드단순화)=T2 · B(체인·수동연결제거)=T2(연결제거)+T3(체인) · C(사이드바폭)=T4 · D(pbf목록)=T1(헬퍼)+T5(클라) · E(경로/부트스트래퍼)=배포완료(코드무). ✅
- **Placeholder**: 각 스텝 실제 코드. ✅
- **Type/이름 일관**: 헬퍼 scan_tree kind. 클라 setRsideW/rsideGutter/RSIDE_*, syncBookmarks 체인, payload.kind T1↔T5 일관. `bindVideoToNode`가 syncBookmarks 자동호출(기존) → pbf 드롭이 체인 생성. ✅
- **주의**: 삭제 대신 비활성 위주(죽은 함수/CSS 잔존 허용). `renderPalette`/`iconPalEl` null 가드 필수(iconGroup 제거 시). drawEhud/startLink 무동작화로 엣지 렌더는 유지(체인 표시).
