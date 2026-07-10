# PotFlow 직접드래그 자동식별 + 컴팩트 정렬목록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** OS 파일을 캔버스에 직접 드래그하면 헬퍼가 파일명+크기로 경로를 복원해 노드에 자동 지정+썸네일하고, 오른쪽 파일탐색기 목록을 컴팩트+정렬(이름·크기·확장자·수정일)한다.

**Architecture:** 헬퍼(`potflow-helper.py`)에 `/tree` 메타 확장 + `POST /resolve` 추가. 클라이언트(`potflow.html`)에 OS 파일 드롭 처리(`/resolve`→경로자동, 실패 시 브라우저 프레임캡처 폴백)와 컴팩트 정렬 목록.

**Tech Stack:** Python 표준라이브러리, 바닐라 JS 단일 HTML.

## Global Constraints
- Python 표준라이브러리만. 바닐라 JS·단일 파일·외부 라이브러리 금지.
- 수정 파일은 `map/potflow-helper.py`·`map/potflow.html`·`map/test_potflow_helper.py`만. 기존 map 자산 무수정.
- **좌측 accent 라인 절대 금지**. 정렬 활성표시는 배경·텍스트·▲▼ 화살표로만. 한국어 UI.
- 헬퍼 응답 `Access-Control-Allow-Origin: *` + Host 가드 유지(신규 라우트도 do_GET/do_POST 상단 `_host_ok` 이후 실행).
- 날짜 기준은 **수정일(mtime)**. 접근일(atime) 안 씀.
- 테스트 러너(venv, pytest는 PATH에 없음): `cd map && /tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/104149d1-1d21-4142-91c1-1f33734bdc96/scratchpad/venv/bin/pytest test_potflow_helper.py -q`
- 클라이언트 검증: 인라인 `<script>` 추출 후 `node --check`. 헤드리스 렌더는 WSL+Windows Chrome(`/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`) `--headless=new --virtual-time-budget=6000 --user-data-dir=<임시> --screenshot=<C:\...\...png>` → 스크린샷을 `/mnt/c/Users/yotac/screenshots/`에서 확인.

---

## Task 1: 헬퍼 /tree에 mtime·ext 추가

**Files:** Modify `map/potflow-helper.py` (scan_tree), Test `map/test_potflow_helper.py`

**Interfaces:**
- Produces: `scan_tree(path)`의 각 file 엔트리에 `mtime`(float, epoch, 실패 0)·`ext`(소문자, 점 제외) 추가. 기존 name/path/size/folders/parent 유지.

- [ ] **Step 1: 실패 테스트 추가**
```python
def test_scan_tree_includes_mtime_and_ext(tmp_path):
    f = tmp_path / "clip.MP4"
    f.write_bytes(b"xy")
    import os
    os.utime(str(f), (1000000000, 1700000000))  # atime, mtime
    r = helper.scan_tree(str(tmp_path))
    fe = r["files"][0]
    assert fe["ext"] == "mp4"
    assert abs(fe["mtime"] - 1700000000) < 2
```

- [ ] **Step 2: 실패 확인**
Run: (venv pytest 위 커맨드) — Expected: FAIL (KeyError 'ext'/'mtime')

- [ ] **Step 3: 구현**
`scan_tree`의 파일 분기를 교체:
```python
            elif os.path.splitext(name)[1].lower() in VIDEO_EXTS:
                try:
                    size = os.path.getsize(fp)
                except OSError:
                    size = 0
                try:
                    mtime = os.path.getmtime(fp)
                except OSError:
                    mtime = 0
                ext = os.path.splitext(name)[1].lower().lstrip(".")
                files.append({"name": name, "path": fp, "size": size, "mtime": mtime, "ext": ext})
```

- [ ] **Step 4: 통과 확인** — Expected: PASS (기존 테스트 + 신규 통과)

- [ ] **Step 5: 커밋**
```bash
git add map/potflow-helper.py map/test_potflow_helper.py
git commit -m "feat(potflow): /tree에 mtime·ext 메타 추가"
```

---

## Task 2: 헬퍼 resolve_path + POST /resolve

**Files:** Modify `map/potflow-helper.py`, Test `map/test_potflow_helper.py`

**Interfaces:**
- Produces: `resolve_path(name, size, roots, cap=20000) -> (path:str|None, matches:int)`. 유일매칭→(path,1), 무매칭→(None,0), 다중→(None,≥2), 스캔 상한초과→(None,-1).
- Produces: `POST /resolve {name,size,base}` → base(있으면) 또는 `SEARCH_ROOTS` 탐색. `{ok:true,path}` / `{ok:false,matches:n}` / `{ok:false,error:"too many files"}`(matches -1).
- CONFIG: `SEARCH_ROOTS = []` (파일 상단 상수에 추가).

- [ ] **Step 1: 실패 테스트 추가**
```python
def test_resolve_path_unique(tmp_path):
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "movie.mkv").write_bytes(b"12345")   # size 5
    path, matches = helper.resolve_path("movie.mkv", 5, [str(tmp_path)])
    assert matches == 1 and path.endswith("movie.mkv")

def test_resolve_path_none_and_ambiguous(tmp_path):
    (tmp_path / "a").mkdir(); (tmp_path / "b").mkdir()
    (tmp_path / "a" / "dup.mp4").write_bytes(b"xxxxx")  # size 5
    (tmp_path / "b" / "dup.mp4").write_bytes(b"xxxxx")  # size 5
    assert helper.resolve_path("dup.mp4", 5, [str(tmp_path)]) == (None, 2)
    assert helper.resolve_path("missing.mp4", 5, [str(tmp_path)]) == (None, 0)
    # 크기 불일치는 매칭 아님
    assert helper.resolve_path("dup.mp4", 999, [str(tmp_path)]) == (None, 0)
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL (resolve_path 미정의)

- [ ] **Step 3: 구현**
CONFIG 상단(다른 상수 옆)에 추가: `SEARCH_ROOTS = []`
`resolve_path` 함수 추가(scan_tree 근처):
```python
def resolve_path(name, size, roots, cap=20000):
    found = None
    matches = 0
    scanned = 0
    for root in roots:
        if not root or not os.path.isdir(root):
            continue
        for dp, dn, fns in os.walk(root):
            for fn in fns:
                scanned += 1
                if scanned > cap:
                    return (None, -1)
                if fn == name:
                    fp = os.path.join(dp, fn)
                    try:
                        if os.path.getsize(fp) != size:
                            continue
                    except OSError:
                        continue
                    matches += 1
                    if matches == 1:
                        found = fp
                    else:
                        return (None, matches)
    return (found, matches) if matches <= 1 else (None, matches)
```
`do_POST`의 라우트 분기에 `/doc` 위(또는 아래)에 추가:
```python
        if u.path == "/resolve":
            name = body.get("name", "")
            if not name:
                return self._send(400, {"ok": False, "error": "name required"})
            base = body.get("base", "")
            roots = [base] if base else list(SEARCH_ROOTS)
            path, matches = resolve_path(name, body.get("size", 0), roots)
            if matches == -1:
                return self._send(200, {"ok": False, "error": "too many files"})
            if path:
                return self._send(200, {"ok": True, "path": path})
            return self._send(200, {"ok": False, "matches": matches})
```

- [ ] **Step 4: 통과 확인** — Expected: PASS

- [ ] **Step 5: 커밋**
```bash
git add map/potflow-helper.py map/test_potflow_helper.py
git commit -m "feat(potflow): resolve_path + POST /resolve(파일명+크기 경로 복원)"
```

---

## Task 3: 클라이언트 — OS 파일 직접 드래그 자동 식별

**Files:** Modify `map/potflow.html`

**Interfaces:**
- Consumes: `HELPER`,`HELPER_OK`,`rsPathEl`,`worldPt`,`nodeAt`,`makeNode`,`render`,`selectOnly`,`bindVideoToNode`,`N`,`putImg`,`markDirty`,`toast`,`W_NODE`.
- Produces: `osDropFiles(files, clientX, clientY)`, `osResolveFile(file, id)`, `captureThumb(file, id)`, `titleFromName(id, name)`, 상수 `VEXT`.

**No unit test** — 브라우저 상호작용. 검증: `node --check` + 헤드리스 로드(치명오류 없음) + 구조 검토. PotPlayer/실파일은 로컬 전용.

- [ ] **Step 1: 비디오 확장자 상수 + dragover에 Files 허용**
`potflow.html` 스크립트에서 stage dragover 라인을 교체:
```js
const VEXT=/\.(mp4|mkv|avi|mov|wmv|webm|flv|m4v|ts|mpg|mpeg)$/i;
stage.addEventListener('dragover',e=>{const t=e.dataTransfer&&e.dataTransfer.types;if(t&&([...t].includes('text/potflow-video')||[...t].includes('Files')))e.preventDefault()});
```

- [ ] **Step 2: stage drop에 OS 파일 분기 추가**
기존 `stage.addEventListener('drop', ...)` 핸들러를 아래로 교체(사이드바 payload 우선, 없으면 OS 파일 처리):
```js
stage.addEventListener('drop',e=>{
  const raw=e.dataTransfer.getData('text/potflow-video');
  if(raw){
    e.preventDefault();
    let payload;try{payload=JSON.parse(raw)}catch(err){return}
    const{path,name}=payload;const p=worldPt(e.clientX,e.clientY);const hit=nodeAt(p);
    if(hit){bindVideoToNode(hit.id,path,name);selectOnly(hit.id);}
    else{const n=makeNode(p.x-W_NODE/2,p.y-30);render();bindVideoToNode(n.id,path,name);selectOnly(n.id);}
    return;
  }
  const files=e.dataTransfer.files;
  if(files&&files.length){const vids=[...files].filter(f=>VEXT.test(f.name));if(vids.length){e.preventDefault();osDropFiles(vids,e.clientX,e.clientY);}}
});
```

- [ ] **Step 3: osDropFiles / osResolveFile / titleFromName / captureThumb 추가**
drop 핸들러 근처에 추가:
```js
function titleFromName(id,name){const n=N(id);if(n&&(!n.title||n.title==='새 단계'))n.title=name.replace(/\.[^.]+$/,'');markDirty();render();}
function osDropFiles(vids,cx,cy){
  const base=worldPt(cx,cy);const hit=nodeAt(base);
  vids.forEach((f,i)=>{
    let id;
    if(hit&&i===0){id=hit.id;}
    else{const off=i*26;const n=makeNode(base.x-W_NODE/2+off,base.y-30+off);render();id=n.id;}
    osResolveFile(f,id);selectOnly(id);
  });
}
function osResolveFile(file,id){
  const name=file.name;
  if(!HELPER_OK){titleFromName(id,name);captureThumb(file,id);toast('헬퍼가 꺼져 있어 경로 미지정 — 오른쪽 목록에서 지정하세요');return;}
  fetch(HELPER+'/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,size:file.size,base:(rsPathEl&&rsPathEl.value)||''})})
    .then(r=>r.json()).then(j=>{
      if(j&&j.ok&&j.path){bindVideoToNode(id,j.path,name);}
      else{titleFromName(id,name);captureThumb(file,id);toast('경로 미확인 — 오른쪽 파일탐색기에서 드래그해 지정하세요');}
    }).catch(()=>{titleFromName(id,name);captureThumb(file,id);});
}
function captureThumb(file,id){
  let url;
  try{url=URL.createObjectURL(file);}catch(e){return}
  const v=document.createElement('video');v.muted=true;v.preload='metadata';
  let done=false;const cleanup=()=>{try{URL.revokeObjectURL(url)}catch(e){}};
  v.addEventListener('loadeddata',()=>{try{v.currentTime=Math.min(5,(v.duration||6)/3)}catch(e){cleanup()}});
  v.addEventListener('seeked',()=>{
    if(done)return;done=true;
    try{
      const vw=v.videoWidth||320,vh=v.videoHeight||180,w=320,h=Math.max(1,Math.round(w*vh/vw));
      const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(v,0,0,w,h);
      const data=c.toDataURL('image/jpeg',0.8);
      const iid='vthumb_'+id;putImg(iid,data);const n=N(id);if(n){n.thumb={imgId:iid,label:n.title||''};render();markDirty();}
    }catch(e){}
    cleanup();
  });
  v.addEventListener('error',()=>{cleanup();});
  v.src=url;
}
```

- [ ] **Step 4: 검증**
- 인라인 스크립트 추출 후 `node --check` → 문법 OK.
- 헬퍼 실행 후 헤드리스로 페이지 로드 → 콘솔 치명오류 없음(스크린샷). OS 파일 드롭·resolve 실제 동작은 로컬 수동(리포트에 명시).
- 리포트에 검증/미검증 명시.

- [ ] **Step 5: 커밋**
```bash
git add map/potflow.html
git commit -m "feat(potflow): OS 파일 직접 드래그 → /resolve 경로자동 + 프레임캡처 폴백"
```

---

## Task 4: 클라이언트 — 컴팩트 + 정렬 파일목록

**Files:** Modify `map/potflow.html`

**Interfaces:**
- Consumes: `rsBodyEl`,`openFolder`,기존 renderExplorer 호출부.
- Produces: `rsData`,`rsSort`,`fmtSize`,`fmtDate`,`renderExplorer()`(무인자·rsData 사용), 정렬 헤더.

**No unit test** — 검증: `node --check` + 헤드리스 스크린샷(목록 컴팩트·정렬 헤더·컬럼 표시).

- [ ] **Step 1: CSS 교체/추가**
`.rs-file{cursor:grab}` 규칙을 아래로 교체하고 헤더·컬럼 스타일 추가(기존 `.rs-row`·`.rs-row.folder`·`.rside` 등은 유지):
```css
  .rs-head2{display:grid;grid-template-columns:1fr 58px 42px 78px;gap:6px;padding:5px 8px;font-size:11px;color:var(--faint);border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);flex:none}
  .rs-head2 span{cursor:pointer;user-select:none;white-space:nowrap;overflow:hidden}
  .rs-head2 span.on{color:var(--gold)}
  .rs-head2 .num{text-align:right}
  .rs-file{display:grid;grid-template-columns:1fr 58px 42px 78px;gap:6px;align-items:center;cursor:grab;padding:3px 8px;font-size:11.5px}
  .rs-file .rs-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .rs-file .col{color:var(--eth);font-size:11px;white-space:nowrap;overflow:hidden}
  .rs-file .num{text-align:right}
```

- [ ] **Step 2: 정렬 상태 + 포맷 헬퍼 + openFolder 조정**
`rsBodyEl`/`rsPathEl` 정의 근처에 추가:
```js
let rsData=null,rsSort={key:'name',dir:1};
function fmtSize(b){if(!b)return'';const u=['B','KB','MB','GB'];let i=0,n=b;while(n>=1024&&i<u.length-1){n/=1024;i++}return (i===0?n:(n<10?n.toFixed(1):Math.round(n)))+u[i];}
function fmtDate(ep){if(!ep)return'';const d=new Date(ep*1000);const p=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
```
`openFolder`의 `renderExplorer(d)` 호출을 `rsData=d;renderExplorer();`로 교체.

- [ ] **Step 3: renderExplorer 재작성(정렬 헤더 + 컴팩트 행)**
기존 `renderExplorer(d)` 함수를 교체:
```js
function sortedFiles(){
  const files=[...((rsData&&rsData.files)||[])];const k=rsSort.key,dir=rsSort.dir;
  files.sort((a,b)=>{let av,bv;
    if(k==='name'){av=a.name.toLowerCase();bv=b.name.toLowerCase();}
    else if(k==='size'){av=a.size||0;bv=b.size||0;}
    else if(k==='ext'){av=a.ext||'';bv=b.ext||'';}
    else{av=a.mtime||0;bv=b.mtime||0;}
    return (av<bv?-1:av>bv?1:0)*dir;});
  return files;
}
function renderExplorer(){
  const d=rsData;rsBodyEl.innerHTML='';if(!d)return;
  // 정렬 헤더
  const head=document.createElement('div');head.className='rs-head2';
  const cols=[['name','이름',''],['size','크기','num'],['ext','형식',''],['mtime','수정일','']];
  cols.forEach(([key,label,cls])=>{const s=document.createElement('span');s.dataset.k=key;if(cls)s.className=cls;
    s.textContent=label+(rsSort.key===key?(rsSort.dir>0?' ▲':' ▼'):'');if(rsSort.key===key)s.classList.add('on');head.append(s);});
  rsBodyEl.append(head);
  // 폴더(정렬 대상 아님)
  if(d.parent){rsBodyEl.append(rsRow('folder up','⬆ 상위 폴더',d.parent,false));}
  (d.folders||[]).forEach(f=>rsBodyEl.append(rsRow('folder','📁 '+f.name,f.path,false)));
  // 파일(정렬 적용, 컴팩트 컬럼)
  const files=sortedFiles();
  files.forEach(f=>{
    const row=document.createElement('div');row.className='rs-file';row.draggable=true;
    row.dataset.path=f.path;row.dataset.name=f.name;
    const nm=document.createElement('div');nm.className='rs-name';nm.title=f.name;nm.textContent=f.name;
    const sz=document.createElement('div');sz.className='col num';sz.textContent=fmtSize(f.size);
    const ex=document.createElement('div');ex.className='col';ex.textContent=f.ext||'';
    const dt=document.createElement('div');dt.className='col';dt.textContent=fmtDate(f.mtime);
    row.append(nm,sz,ex,dt);rsBodyEl.append(row);
  });
  if(!(d.folders||[]).length&&!files.length){const em=document.createElement('div');em.className='rs-empty';em.textContent='동영상이 없습니다';rsBodyEl.append(em);}
}
rsBodyEl.addEventListener('click',e=>{const h=e.target.closest('.rs-head2 span');if(h){const k=h.dataset.k;if(rsSort.key===k)rsSort.dir*=-1;else{rsSort.key=k;rsSort.dir=1;}renderExplorer();return;}});
```
> 주의: 기존 `rsBodyEl` click(폴더)·dblclick(재생)·dragstart 리스너는 유지된다. 위 정렬-헤더 click 리스너는 별도로 추가(헤더 span 클릭만 처리, `return` 후 폴더 처리 리스너와 공존). dragstart/dblclick는 `.rs-file`을 그대로 참조하므로 컴팩트 행(여전히 `.rs-file`·dataset.path/name 보유)에서 정상 동작.

- [ ] **Step 4: 검증**
- `node --check` 문법 OK.
- 헬퍼 실행 → 실제 폴더(예: `/home/jschoi0223/projects/vdiportal/map`) 열어 목록·정렬 헤더 표시 헤드리스 스크린샷 확인. 컬럼(이름/크기/형식/수정일) 렌더·헤더 클릭 정렬 토글 구조 확인.
- 스크린샷을 `/mnt/c/Users/yotac/screenshots/`에 저장하고 확인. 리포트에 명시.

- [ ] **Step 5: 커밋**
```bash
git add map/potflow.html
git commit -m "feat(potflow): 파일목록 컴팩트 + 정렬(이름·크기·확장자·수정일)"
```

---

## Self-Review
- **Spec 커버**: 헬퍼 /tree 확장(§3-1)=T1 · /resolve(§3-2)=T2 · OS 직접드래그+캡처(§4)=T3 · 컴팩트 정렬(§5)=T4. 디자인/제약(§6)=전 태스크. ✅
- **Placeholder**: 각 코드 스텝에 실제 코드. ✅
- **Type/이름 일관**: `resolve_path` 반환 `(path,matches)` T2↔엔드포인트 일치. 클라이언트 `rsData`/`rsSort`/`renderExplorer()`(무인자)로 T4 내부 일관. `titleFromName`/`captureThumb`/`osResolveFile`/`VEXT` T3 일관. `N(id)`·`rsPathEl`·`rsBodyEl` 실존 심볼(확인됨). ✅
- **주의**: renderExplorer가 무인자로 바뀌므로 openFolder 호출부(`rsData=d;renderExplorer()`)만 유일 호출자여야 함 — 구현 시 다른 renderExplorer(d) 호출 없나 grep 확인.
