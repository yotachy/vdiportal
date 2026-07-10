# PotFlow 자동썸네일·창배치견고화·그룹일괄재생 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** ffmpeg 없이도 썸네일 자동(브라우저 폴백), 창 배치 재시도 견고화, 그룹 일괄재생+그리드 자동배열.

**Tech Stack:** Python 표준라이브러리, 바닐라 JS 단일 HTML.

## Global Constraints
- Python 표준라이브러리만. 바닐라 JS·단일 파일·외부 라이브러리 금지.
- 수정 파일: `map/potflow-helper.py`·`map/potflow.html`·`map/test_potflow_helper.py`만.
- **좌측 accent 라인 금지**. 한국어 UI. Host 가드·CORS 유지.
- 테스트 러너(venv): `cd map && /tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/104149d1-1d21-4142-91c1-1f33734bdc96/scratchpad/venv/bin/pytest test_potflow_helper.py -q`
- 클라 검증: 인라인 `<script>` 추출 후 `node --check`; 헤드리스 Windows Chrome 스크린샷.

---

## Task 1: 헬퍼 GET /file (Range 스트리밍)

**Files:** Modify `map/potflow-helper.py`, Test `map/test_potflow_helper.py`

**Interfaces:** `content_type_for(name)`(순수), Handler `_serve_file(path)`(Range 지원), `GET /file?path=`.

- [ ] **Step 1: 실패 테스트 추가**
```python
def test_content_type_for():
    assert helper.content_type_for("a.mp4") == "video/mp4"
    assert helper.content_type_for("a.MKV") == "video/x-matroska"
    assert helper.content_type_for("a.xyz") == "application/octet-stream"

def test_file_serving_range(tmp_path):
    import http.client, threading
    from urllib.parse import quote
    f = tmp_path / "v.mp4"; f.write_bytes(b"0123456789")
    srv = helper.make_server(0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        c.request("GET", "/file?path=" + quote(str(f)),
                  headers={"Host": f"localhost:{port}", "Range": "bytes=2-5"})
        r = c.getresponse(); body = r.read()
        assert r.status == 206 and body == b"2345"
        assert r.getheader("Content-Range") == "bytes 2-5/10"
    finally:
        srv.shutdown()
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**
`find_ffmpeg` 근처에 순수함수 추가:
```python
def content_type_for(name):
    ext = os.path.splitext(name)[1].lower()
    return {".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska",
            ".mov": "video/quicktime", ".m4v": "video/mp4", ".avi": "video/x-msvideo",
            ".ts": "video/mp2t", ".ogv": "video/ogg", ".mpg": "video/mpeg",
            ".mpeg": "video/mpeg", ".flv": "video/x-flv", ".wmv": "video/x-ms-wmv"}.get(ext, "application/octet-stream")
```
Handler 클래스에 메서드 추가(`_send` 근처):
```python
    def _serve_file(self, path):
        if not path or not os.path.isfile(path):
            return self._send(404, {"ok": False, "error": "not found"})
        try:
            size = os.path.getsize(path)
        except OSError:
            return self._send(404, {"ok": False, "error": "stat failed"})
        start, end, status = 0, size - 1, 200
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):
            try:
                s, _, e = rng[6:].partition("-")
                if s:
                    start = int(s)
                if e:
                    end = int(e)
                if start > end or start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % size)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    return
                end = min(end, size - 1)
                status = 206
            except ValueError:
                start, end, status = 0, size - 1, 200
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", content_type_for(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.end_headers()
        try:
            with open(path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except Exception:
            pass
```
`do_GET`에 `/file` 라우트 추가(`/monitors` 아래, 정적 서빙 위):
```python
        if u.path == "/file":
            return self._serve_file(parse_qs(u.query).get("path", [""])[0])
```

- [ ] **Step 4: 통과 확인** — PASS (30 passing)

- [ ] **Step 5: 커밋**
```bash
git add map/potflow-helper.py map/test_potflow_helper.py
git commit -m "feat(potflow): GET /file 스트리밍(Range) — 브라우저 썸네일 폴백용"
```

---

## Task 2: 클라 — 브라우저 썸네일 폴백(ffmpeg 없이)

**Files:** Modify `map/potflow.html`

**Interfaces:** `captureThumbURL(url,id,seekSec)`; `requestThumb`/`syncBookmarks` 폴백.

- [ ] **Step 1: captureThumbURL 추가**
`captureThumb` 근처에:
```js
function captureThumbURL(url,id,seekSec){
  const v=document.createElement('video');v.muted=true;v.preload='metadata';
  let done=false;const to=setTimeout(()=>{done=true;},8000);
  v.addEventListener('loadeddata',()=>{try{v.currentTime=Math.min(seekSec||5,(v.duration||((seekSec||5)*2)))}catch(e){}});
  v.addEventListener('seeked',()=>{if(done)return;done=true;clearTimeout(to);
    try{const vw=v.videoWidth||320,vh=v.videoHeight||180,w=320,h=Math.max(1,Math.round(w*vh/vw));
      const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(v,0,0,w,h);
      const data=c.toDataURL('image/jpeg',0.8);const iid='vthumb_'+id;putImg(iid,data);
      const n=N(id);if(n){n.thumb={imgId:iid,label:n.title||''};render();markDirty();}}catch(e){}});
  v.addEventListener('error',()=>{clearTimeout(to);});
  v.src=url;
}
```

- [ ] **Step 2: requestThumb 폴백**
기존 `requestThumb`의 `.catch(()=>{})`를 교체:
```js
  }).catch(()=>{captureThumbURL(HELPER+"/file?path="+encodeURIComponent(path),id,5);});
```

- [ ] **Step 3: syncBookmarks 책갈피 썸네일 폴백**
`syncBookmarks`의 `if(b.thumb){...}` 뒤에 else 추가:
```js
      if(b.thumb){const iid='bm_'+nodeId+'_'+b.ms;putImg(iid,b.thumb);c.thumb={imgId:iid,label:c.title};}
      else{captureThumbURL(HELPER+"/file?path="+encodeURIComponent(n.videoPath),c.id,b.ms/1000);}
```

- [ ] **Step 4: 검증 + 커밋**
- 인라인 `node --check` OK. 헤드리스 로드 정상(브라우저 폴백 실동작은 로컬 mp4 필요 — 구조 검토).
```bash
git add map/potflow.html
git commit -m "feat(potflow): ffmpeg 없을 때 브라우저 프레임 캡처 썸네일 폴백(/file)"
```

---

## Task 3: 헬퍼 — arrange_windows 재시도 견고화

**Files:** Modify `map/potflow-helper.py`

**Interfaces:** `arrange_windows`의 단일 sleep+1회 EnumWindows → 폴링 재시도.

- [ ] **Step 1: 재시도 루프로 교체**
`arrange_windows`에서 `time.sleep(1.2)` 및 마지막 `u.EnumWindows(WNDENUM(cb), None)`을 아래로 교체(콜백 `cb` 정의는 유지, 루프만 변경):
```python
        for _ in range(16):            # 최대 ~8초: 늦게 뜨는 PotPlayer 창까지 재시도
            time.sleep(0.5)
            u.EnumWindows(WNDENUM(cb), None)
            if len(placed) >= len(want):
                break
```
즉 `want`/`placed`/`cb` 정의 뒤 기존 `time.sleep(1.2)`(위)와 최종 단일 `EnumWindows`(아래)를 이 루프 하나로 대체. (`time`은 이미 import됨.)

- [ ] **Step 2: 검증 + 커밋**
- `python3 -m py_compile potflow-helper.py` OK. 전체 테스트 28/30 그대로 통과(WSL에선 arrange가 ctypes 없어 except 폴백, 무영향).
- (실제 창배치·재시도는 Windows 로컬 수동 — 리포트 명시.)
```bash
git add map/potflow-helper.py
git commit -m "fix(potflow): arrange_windows 폴링 재시도(늦게 뜨는 창 배치 견고화)"
```

---

## Task 4: 클라 — 그룹 일괄재생 + 그리드 자동배열

**Files:** Modify `map/potflow.html`

**Interfaces:** 그룹 툴바(▶일괄재생·그리드) + `playGroup(gid)`·`cycleGroupGrid(gid)`. Consumes `G`(그룹 finder),`N`,`playItems`,`render`,`markDirty`,`toast`.

- [ ] **Step 1: groupHTML에 툴바 + CSS**
`groupHTML`을 교체:
```js
function gridLabel(g){return g.grid?`${g.grid[0]}×${g.grid[1]}`:'자동';}
function groupHTML(g){
  return `<div class="group" data-gid="${g.id}"><div class="group-label" contenteditable="${ce()}" data-gfield="title">${esc(g.title)}</div>`+
    `<div class="group-bar edit-only"><button class="gbtn" data-gact="play" title="그룹 일괄 재생(그리드 배치)">▶ 일괄재생</button>`+
    `<button class="gbtn" data-gact="grid" title="재생창 그리드">▦ ${gridLabel(g)}</button></div>`+
    `<button class="group-del edit-only" data-gact="del">✕</button></div>`;
}
```
`<style>`에 추가(좌측 라인 금지·토큰):
```css
  .group-bar{position:absolute;top:-13px;right:38px;display:flex;gap:4px;pointer-events:auto}
  .gbtn{font-size:10.5px;font-weight:700;background:#0e1116;border:1px solid var(--gold-dim);color:var(--gold);border-radius:6px;padding:1px 7px;cursor:pointer;white-space:nowrap}
  .gbtn:hover{background:var(--gold);color:#1a1206}
```

- [ ] **Step 2: playGroup / cycleGroupGrid**
`makeGroup` 근처에:
```js
const GROUP_GRIDS=[null,[2,1],[2,2],[3,2],[3,3],[4,2],[4,3]];
function cycleGroupGrid(gid){const g=G(gid);if(!g)return;const key=x=>x?`${x[0]}x${x[1]}`:'null';const cur=key(g.grid);let i=GROUP_GRIDS.findIndex(x=>key(x)===cur);g.grid=GROUP_GRIDS[(i+1)%GROUP_GRIDS.length];render();markDirty();toast('그리드: '+gridLabel(g));}
function playGroup(gid){const g=G(gid);if(!g)return;
  const vids=g.nodes.map(N).filter(n=>n&&n.videoPath);
  if(!vids.length){toast('그룹에 동영상 노드가 없습니다');return}
  let c,r;
  if(g.grid&&vids.length<=g.grid[0]*g.grid[1]){c=g.grid[0];r=g.grid[1];}
  else{c=Math.ceil(Math.sqrt(vids.length));r=Math.ceil(vids.length/c);}
  const items=vids.map((n,i)=>{const col=i%c,row=Math.floor(i/c);
    return {path:n.videoPath,seek:n.seekMs!=null?n.seekMs/1000:null,win:{mon:0,x:col/c,y:row/r,w:1/c,h:1/r}};});
  playItems(items);
}
```

- [ ] **Step 3: 클릭 디스패처 + 드래그 가드**
그룹 액션 처리(현재 `data-gact==='del'`만 있는 곳, 라인 ~1154)를 확장:
```js
  const gb=e.target.closest('[data-gact]');
  if(gb){const gid=gb.closest('.group').dataset.gid,a=gb.dataset.gact;
    if(a==='del'){state.groups=state.groups.filter(g=>g.id!==gid);render();markDirty();toast('그룹 해제');}
    else if(a==='play'){playGroup(gid);}
    else if(a==='grid'){cycleGroupGrid(gid);}
    return;}
```
world pointerdown의 무시목록(라인 ~1023 `if(e.target.closest('.group-label,.group-del,...'))return;`)에 `.group-bar`(또는 `.gbtn`) 추가 — 버튼 클릭이 팬/드래그로 안 먹히게.

- [ ] **Step 4: 검증 + 커밋**
- 인라인 `node --check` OK.
- 헬퍼 실행 후 헤드리스로 페이지 로드 → 기본 예시의 그룹(재생 목록·동시 재생) 상단에 **▶ 일괄재생·▦ 그리드** 버튼이 보이는지 스크린샷 확인. `/mnt/c/Users/yotac/screenshots/pf-group.png` READ. 실제 재생·배치는 로컬 수동.
```bash
git add map/potflow.html
git commit -m "feat(potflow): 그룹 일괄재생 + 그리드 자동배열(재생창)"
```

---

## Self-Review
- **Spec 커버**: A(/file+폴백)=T1,T2 · B(arrange 재시도)=T3 · C(그룹 일괄재생+그리드)=T4. ✅
- **Placeholder**: 각 스텝 실제 코드. ✅
- **Type/이름 일관**: `content_type_for`/`_serve_file`/`/file`. 클라 `captureThumbURL`·`playGroup`·`cycleGroupGrid`·`G`·`gridLabel` 일관. win 포맷 T4↔헬퍼 win_to_rect 일치({mon,x,y,w,h}). ✅
- **주의**: `_serve_file`는 임의 로컬파일 서빙(기존 /tree·/thumb과 동일 신뢰모델, Host 가드 뒤). 브라우저 폴백은 브라우저 디코드 가능 코덱만(mkv는 ffmpeg 필요 — 명시). 그룹 버튼은 pointerdown 무시목록에 넣어 드래그 충돌 방지.
