# PotFlow 책갈피(PBF) 하위노드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 동영상에 PotPlayer 책갈피(.pbf)가 있으면 영상 노드 아래에 책갈피마다 하위 노드(그 지점 썸네일 + `/seek` 재생)를 자동 생성하고, PotPlayer 닫힐 때/수동 버튼/영상 지정 시 동기화한다.

**Architecture:** 헬퍼가 pbf 파싱·영상 연결·`/bookmarks`·`/play` seek·재생종료 추적(`/playdone`)을 담당. 클라이언트가 하위 노드 재조정(reconcile)·seek 재생·종료 후 재동기화.

**Tech Stack:** Python 표준라이브러리, 바닐라 JS 단일 HTML.

## Global Constraints
- Python 표준라이브러리만. 바닐라 JS·단일 파일·외부 라이브러리 금지.
- 수정 파일: `map/potflow-helper.py`·`map/potflow.html`·`map/test_potflow_helper.py`만.
- **좌측 accent 라인 금지**. 한국어 UI. Host 가드·CORS 유지.
- pbf는 **영상 옆 저장 가정**. 닫힐 때 감지는 헬퍼가 실행한 재생만.
- 테스트 러너(venv): `cd map && /tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/104149d1-1d21-4142-91c1-1f33734bdc96/scratchpad/venv/bin/pytest test_potflow_helper.py -q`
- 클라 검증: 인라인 `<script>` 추출 후 `node --check`; 헤드리스 렌더는 Windows Chrome(`/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`) `--headless=new --virtual-time-budget=6000 --user-data-dir=<임시> --screenshot=<C:\...png>` → `/mnt/c/Users/yotac/screenshots/`.

---

## Task 1: 헬퍼 순수함수 (pbf 파싱·영상 연결·커맨드 조립)

**Files:** Modify `map/potflow-helper.py`, Test `map/test_potflow_helper.py`

**Interfaces (Produces):**
- `parse_pbf(text) -> [{"ms":int,"title":str,"thumb":str|None}]` — `[Bookmark]` 섹션의 `N=ms*title*thumb` 파싱, ms 오름차순, 불량라인 스킵.
- `pbf_for_video(video_path) -> str|None`
- `video_for_pbf(pbf_path) -> str|None`
- `ffmpeg_thumb_at_cmd(ffmpeg, video_path, sec, out) -> list`
- `player_cmd(exe, path, seek=None) -> list`

- [ ] **Step 1: 실패 테스트 추가**
```python
def test_parse_pbf_basic():
    text = "[Bookmark]\n0=305000*둘째*\n1=5000*첫째*QUJD\nbad line\n[Other]\n2=999*무시*"
    r = helper.parse_pbf(text)
    assert [b["ms"] for b in r] == [5000, 305000]           # ms 오름차순, [Other] 섹션 제외
    assert r[0]["title"] == "첫째" and r[0]["thumb"] == "QUJD"
    assert r[1]["title"] == "둘째" and r[1]["thumb"] is None

def test_pbf_video_resolution(tmp_path):
    vid = tmp_path / "movie.mkv"; vid.write_bytes(b"x")
    # <video>.pbf 형태
    p1 = tmp_path / "movie.mkv.pbf"; p1.write_text("[Bookmark]\n0=1000*a*")
    assert helper.pbf_for_video(str(vid)) == str(p1)
    assert helper.video_for_pbf(str(p1)) == str(vid)
    # <basename>.pbf 형태
    p1.unlink(); p2 = tmp_path / "movie.pbf"; p2.write_text("[Bookmark]\n0=1000*a*")
    assert helper.pbf_for_video(str(vid)) == str(p2)
    assert helper.video_for_pbf(str(p2)) == str(vid)
    # pbf 없음
    p2.unlink(); assert helper.pbf_for_video(str(vid)) is None

def test_player_and_ffmpeg_cmds():
    assert helper.player_cmd("pot.exe", "v.mp4") == ["pot.exe", "v.mp4"]
    assert helper.player_cmd("pot.exe", "v.mp4", 90) == ["pot.exe", "v.mp4", "/seek=90"]
    c = helper.ffmpeg_thumb_at_cmd("ffmpeg", "v.mkv", 5.0, "o.jpg")
    assert c[0] == "ffmpeg" and "v.mkv" in c and c[-1] == "o.jpg" and "-frames:v" in c
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL (미정의)

- [ ] **Step 3: 구현** — `potflow-helper.py`의 `scan_tree`/`ffmpeg_thumb_cmd` 근처에 추가:
```python
def parse_pbf(text):
    out = []
    in_bm = False
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("[") and s.endswith("]"):
            in_bm = (s.lower() == "[bookmark]")
            continue
        if not in_bm or "=" not in s:
            continue
        _, _, val = s.partition("=")
        parts = val.split("*", 2)
        try:
            ms = int(parts[0])
        except (ValueError, IndexError):
            continue
        title = parts[1] if len(parts) > 1 else ""
        thumb = parts[2] if len(parts) > 2 and parts[2] else None
        out.append({"ms": ms, "title": title, "thumb": thumb})
    out.sort(key=lambda b: b["ms"])
    return out

def pbf_for_video(video_path):
    for c in (video_path + ".pbf", os.path.splitext(video_path)[0] + ".pbf"):
        if os.path.isfile(c):
            return c
    return None

def video_for_pbf(pbf_path):
    if not pbf_path.lower().endswith(".pbf"):
        return None
    cand = pbf_path[:-4]
    if os.path.isfile(cand) and os.path.splitext(cand)[1].lower() in VIDEO_EXTS:
        return cand
    base = os.path.splitext(os.path.basename(cand))[0].lower()
    d = os.path.dirname(pbf_path)
    try:
        for fn in sorted(os.listdir(d), key=str.lower):
            fp = os.path.join(d, fn)
            if (os.path.isfile(fp) and os.path.splitext(fn)[1].lower() in VIDEO_EXTS
                    and os.path.splitext(fn)[0].lower() == base):
                return fp
    except OSError:
        pass
    return None

def ffmpeg_thumb_at_cmd(ffmpeg, video_path, sec, out):
    return [ffmpeg, "-y", "-ss", str(sec), "-i", video_path,
            "-frames:v", "1", "-vf", "scale=320:-1", out]

def player_cmd(exe, path, seek=None):
    cmd = [exe, path]
    if seek is not None:
        cmd.append("/seek=" + str(seek))
    return cmd
```

- [ ] **Step 4: 통과 확인** — Expected: PASS (기존 16 + 신규 3)

- [ ] **Step 5: 커밋**
```bash
git add map/potflow-helper.py map/test_potflow_helper.py
git commit -m "feat(potflow): pbf 파서·영상연결·player/ffmpeg 커맨드 조립(순수함수)"
```

---

## Task 2: 헬퍼 GET /bookmarks + /play seek

**Files:** Modify `map/potflow-helper.py` (+ Test)

**Interfaces:**
- Consumes: Task1 순수함수.
- Produces: `bookmark_thumb(video, ms, embedded) -> dataURL|None`, `list_bookmarks(path) -> {ok,video,bookmarks:[{ms,title,thumb}]}`, `GET /bookmarks?path=`.
- Modifies: `launch_players(paths, seek=None)` (seek→player_cmd), `POST /play {paths,seek}`.

- [ ] **Step 1: 실패 테스트 추가**
```python
def test_bookmark_thumb_embedded():
    # 내장 base64 있으면 그대로 data URL 로 감싼다 (ffmpeg 불필요)
    assert helper.bookmark_thumb("v.mp4", 1000, "QUJD") == "data:image/jpeg;base64,QUJD"

def test_list_bookmarks_no_pbf(tmp_path):
    vid = tmp_path / "m.mp4"; vid.write_bytes(b"x")
    r = helper.list_bookmarks(str(vid))
    assert r["ok"] is True and r["video"] == str(vid) and r["bookmarks"] == []

def test_list_bookmarks_with_pbf(tmp_path):
    vid = tmp_path / "m.mp4"; vid.write_bytes(b"x")
    (tmp_path / "m.mp4.pbf").write_text("[Bookmark]\n0=2000*씬*QUJD")
    r = helper.list_bookmarks(str(vid))
    assert r["ok"] is True and len(r["bookmarks"]) == 1
    b = r["bookmarks"][0]
    assert b["ms"] == 2000 and b["title"] == "씬"
    assert b["thumb"] == "data:image/jpeg;base64,QUJD"   # 내장 썸네일 사용(ffmpeg 없이)
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL

- [ ] **Step 3: 구현**
파일 상단 import에 `import base64` 추가(다른 import 옆). 함수 추가:
```python
def bookmark_thumb(video, ms, embedded):
    if embedded:
        return "data:image/jpeg;base64," + embedded
    ff = find_exe([FFMPEG_PATH])
    if not ff or not os.path.isfile(video):
        return None
    os.makedirs(THUMB_DIR, exist_ok=True)
    key = hashlib.md5((video + "@" + str(ms)).encode("utf-8")).hexdigest()
    out = os.path.join(THUMB_DIR, key + ".jpg")
    if not (os.path.isfile(out) and os.path.getsize(out) > 0):
        try:
            subprocess.run(ffmpeg_thumb_at_cmd(ff, video, ms / 1000.0, out),
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
        except Exception:
            return None
    if os.path.isfile(out) and os.path.getsize(out) > 0:
        with open(out, "rb") as f:
            return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
    return None

def list_bookmarks(path):
    if not path:
        return {"ok": False, "error": "path required"}
    if path.lower().endswith(".pbf"):
        pbf = path if os.path.isfile(path) else None
        video = video_for_pbf(path)
    else:
        video = path
        pbf = pbf_for_video(path)
    if not video or not os.path.isfile(video):
        return {"ok": False, "error": "video not found"}
    if not pbf:
        return {"ok": True, "video": video, "bookmarks": []}
    try:
        with open(pbf, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError:
        return {"ok": True, "video": video, "bookmarks": []}
    bms = [{"ms": b["ms"], "title": b["title"],
            "thumb": bookmark_thumb(video, b["ms"], b["thumb"])} for b in parse_pbf(text)]
    return {"ok": True, "video": video, "bookmarks": bms}
```
`launch_players` 시그니처/본문 수정 — seek 반영(Popen 커맨드를 `player_cmd`로):
```python
def launch_players(paths, seek=None):
    exe = find_exe([POTPLAYER_PATH])
    if not exe:
        return {"ok": False, "error": "PotPlayer not found"}
    valid = [p for p in paths if p and os.path.isfile(p)]
    if not valid:
        return {"ok": False, "error": "no valid videos"}
    sw, sh = _screen_size()
    rects = tile_rects(len(valid), sw, sh)
    pids = []
    for p in valid:
        try:
            proc = subprocess.Popen(player_cmd(exe, p, seek if len(valid) == 1 else None))
            pids.append(proc.pid)
        except Exception:
            pass
    if os.name == "nt" and len(pids) > 1:
        import threading
        threading.Thread(target=arrange_windows, args=(pids, rects), daemon=True).start()
    return {"ok": True, "launched": len(pids)}
```
`do_GET`에 `/bookmarks` 추가(정적 서빙 위):
```python
        if u.path == "/bookmarks":
            qs = parse_qs(u.query)
            return self._send(200, list_bookmarks(qs.get("path", [""])[0]))
```
`do_POST`의 `/play` 분기를 seek 전달로 교체:
```python
        if u.path == "/play":
            return self._send(200, launch_players(body.get("paths", []), body.get("seek")))
```

- [ ] **Step 4: 통과 확인** — Expected: PASS (19 passing)

- [ ] **Step 5: 커밋**
```bash
git add map/potflow-helper.py map/test_potflow_helper.py
git commit -m "feat(potflow): GET /bookmarks(썸네일 포함) + /play seek 재생"
```

---

## Task 3: 헬퍼 재생종료 추적 + /playdone

**Files:** Modify `map/potflow-helper.py` (+ Test)

**Interfaces:**
- Produces: `PLAYS`(dict), `_register_play(procs, video) -> token`, `play_done(token) -> bool`, `GET /playdone?token=`.
- Modifies: `launch_players`가 procs를 등록하고 응답에 `token` 포함.

- [ ] **Step 1: 실패 테스트 추가** (스레드 타이밍 배제 — 저장 로직만 결정적으로 검증)
```python
def test_play_done_lifecycle():
    helper.PLAYS.clear()
    helper.PLAYS["t1"] = {"procs": [], "done": False, "video": "v"}
    assert helper.play_done("t1") is False          # 아직 진행 중
    helper.PLAYS["t1"]["done"] = True
    assert helper.play_done("t1") is True            # 완료 → True 반환 + 제거
    assert "t1" not in helper.PLAYS
    assert helper.play_done("t1") is True            # 미존재 → True(정리됨)
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL (PLAYS/play_done 미정의)

- [ ] **Step 3: 구현**
파일 상단(다른 상수/전역 근처)에:
```python
import threading
_PLAY_SEQ = 0
PLAYS = {}
_PLAYS_LOCK = threading.Lock()

def _register_play(procs, video):
    global _PLAY_SEQ
    with _PLAYS_LOCK:
        _PLAY_SEQ += 1
        token = str(_PLAY_SEQ)
        PLAYS[token] = {"procs": procs, "done": False, "video": video}
    def waiter():
        for p in procs:
            try:
                p.wait()
            except Exception:
                pass
        with _PLAYS_LOCK:
            if token in PLAYS:
                PLAYS[token]["done"] = True
    threading.Thread(target=waiter, daemon=True).start()
    return token

def play_done(token):
    with _PLAYS_LOCK:
        e = PLAYS.get(token)
        if e is None:
            return True
        if e["done"]:
            del PLAYS[token]
            return True
        return False
```
`launch_players`를 procs 보관·등록·token 반환으로 수정(Task2 결과 기반):
```python
def launch_players(paths, seek=None):
    exe = find_exe([POTPLAYER_PATH])
    if not exe:
        return {"ok": False, "error": "PotPlayer not found"}
    valid = [p for p in paths if p and os.path.isfile(p)]
    if not valid:
        return {"ok": False, "error": "no valid videos"}
    sw, sh = _screen_size()
    rects = tile_rects(len(valid), sw, sh)
    procs = []
    for p in valid:
        try:
            procs.append(subprocess.Popen(player_cmd(exe, p, seek if len(valid) == 1 else None)))
        except Exception:
            pass
    pids = [pr.pid for pr in procs]
    if os.name == "nt" and len(pids) > 1:
        threading.Thread(target=arrange_windows, args=(pids, rects), daemon=True).start()
    token = _register_play(procs, valid[0] if len(valid) == 1 else None)
    return {"ok": True, "launched": len(procs), "token": token}
```
> 주의: `launch_players` 안의 기존 `import threading`(지역)은 제거 — 이제 상단 전역 import 사용.
`do_GET`에 `/playdone` 추가:
```python
        if u.path == "/playdone":
            qs = parse_qs(u.query)
            return self._send(200, {"done": play_done(qs.get("token", [""])[0])})
```

- [ ] **Step 4: 통과 확인** — Expected: PASS (20 passing)

- [ ] **Step 5: 커밋**
```bash
git add map/potflow-helper.py map/test_potflow_helper.py
git commit -m "feat(potflow): 재생 종료 추적 + GET /playdone(token)"
```

---

## Task 4: 클라이언트 — 책갈피 하위 노드 동기화 + seek 재생 + HUD 버튼

**Files:** Modify `map/potflow.html`

**Interfaces:**
- Consumes: `N`,`makeNode`,`addEdge`,`delNodes`,`render`,`markDirty`,`toast`,`putImg`,`HELPER`,`HELPER_OK`,`bindVideoToNode`,`drawNhud`,`playPaths`,`sel`,`NODE_COLORS`.
- Produces: `fmtClock`,`bmChildren`,`syncBookmarks`,`playAt`. dblclick가 seekMs 분기. HUD "책갈피" 버튼 + `data-nact="bmsync"` 처리.

**검증:** `node --check` + 헤드리스 로드(치명오류 없음). 실제 pbf/재생은 로컬 수동.

- [ ] **Step 1: 유틸 + syncBookmarks + playAt 추가**
`bindVideoToNode`/`requestThumb`/`playPaths` 근처(같은 영역)에 추가:
```js
function fmtClock(ms){ms=ms||0;const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60,p=x=>String(x).padStart(2,'0');return (h?h+':':'')+p(m)+':'+p(ss);}
function bmChildren(pid){return state.nodes.filter(n=>n.bmParent===pid);}
function playAt(path,ms){if(!path)return;if(!HELPER_OK){toast('헬퍼가 꺼져 있어 재생할 수 없습니다');return}
  fetch(HELPER+"/play",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({paths:[path],seek:(ms||0)/1000})})
    .then(r=>r.json()).then(j=>{if(j&&j.ok)toast('재생 · '+fmtClock(ms));else toast('재생 실패: '+((j&&j.error)||''));}).catch(()=>toast('재생 실패'));}
function syncBookmarks(nodeId){
  const n=N(nodeId);if(!n||!n.videoPath||n.bmParent!=null)return;
  if(!HELPER_OK){toast('헬퍼가 꺼져 있습니다');return}
  fetch(HELPER+"/bookmarks?path="+encodeURIComponent(n.videoPath)).then(r=>r.json()).then(d=>{
    if(!d||!d.ok){toast('책갈피를 불러올 수 없습니다');return}
    const bms=d.bookmarks||[];const existing={};bmChildren(nodeId).forEach(c=>{existing[c.seekMs]=c;});
    const seen={};let i=0;
    bms.forEach(b=>{seen[b.ms]=1;let c=existing[b.ms];
      if(!c){c=makeNode(n.x+i*60,n.y+150+i*8,'',"mini");c.bmParent=nodeId;c.seekMs=b.ms;c.videoPath=n.videoPath;addEdge(nodeId,'bottom',c.id,'top');}
      c.title=b.title||('책갈피 '+fmtClock(b.ms));
      if(b.thumb){const iid='bm_'+nodeId+'_'+b.ms;putImg(iid,b.thumb);c.thumb={imgId:iid,label:c.title};}
      i++;});
    const stale=bmChildren(nodeId).filter(c=>!seen[c.seekMs]).map(c=>c.id);
    if(stale.length)delNodes(stale);
    render();markDirty();
    toast(bms.length?('책갈피 '+bms.length+'개'):'책갈피 없음');
  }).catch(()=>toast('책갈피 동기화 실패'));
}
```

- [ ] **Step 2: 더블클릭 seek 분기**
world dblclick 핸들러의 비디오 분기(현재 `if(n&&n.videoPath){e.preventDefault();playPaths([n.videoPath]);return}`)를 교체:
```js
  if(nodeEl){const n=N(nodeEl.dataset.id);if(n&&n.videoPath){e.preventDefault();if(n.seekMs!=null)playAt(n.videoPath,n.seekMs);else playPaths([n.videoPath]);return;}}
```

- [ ] **Step 3: bindVideoToNode 끝에 자동 동기화**
`bindVideoToNode`의 `markDirty();render()` 뒤에 `syncBookmarks(id);` 추가(경로 지정 시 책갈피 즉시 표시). (bmParent 있는 노드는 syncBookmarks가 자체 가드로 무시)

- [ ] **Step 4: HUD "책갈피" 버튼**
`drawNhud`의 단일선택 `nbar` 템플릿에서 `<div class="nbar-row">...삭제 버튼...</div>` 안, 삭제 버튼 뒤에 조건부 버튼 추가:
```js
      ${n.videoPath?`<button class="hbtn" data-nact="bmsync" title="책갈피(pbf) 동기화"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg><span>책갈피</span></button>`:''}
```
그리고 노드 액션 디스패처(`const na=e.target.closest('[data-nact]')` 블록)에서 `else if(a==='del')...` 뒤에 추가:
```js
else if(a==='bmsync')syncBookmarks(id);
```

- [ ] **Step 5: 검증 + 커밋**
- 인라인 스크립트 추출 → `node --check` OK.
- 헬퍼 실행 후 헤드리스 로드 → 콘솔 치명오류 없음(스크린샷). 실제 pbf 동작은 로컬 수동(리포트 명시).
```bash
git add map/potflow.html
git commit -m "feat(potflow): 책갈피 하위노드 동기화 + seek 재생 + HUD 책갈피 버튼"
```

---

## Task 5: 클라이언트 — 닫힐 때 자동 재동기화

**Files:** Modify `map/potflow.html`

**Interfaces:**
- Consumes: Task4 `syncBookmarks`,`playAt`,`playPaths`,`N`,`HELPER`,`HELPER_OK`.
- Produces: `watchClose(token, nodeId)`; `playPaths`/`playAt`에 watch 인자 추가; dblclick가 재생 시 watch 대상(영상노드=자기, 책갈피노드=부모) 전달.

- [ ] **Step 1: watchClose 추가**
Task4 함수들 근처에:
```js
function watchClose(token,nodeId){
  if(!token||!nodeId)return;let tries=0;
  const iv=setInterval(()=>{tries++;
    fetch(HELPER+"/playdone?token="+encodeURIComponent(token)).then(r=>r.json()).then(j=>{
      if(j&&j.done){clearInterval(iv);const n=N(nodeId);if(n&&n.videoPath)syncBookmarks(nodeId);}
    }).catch(()=>{if(tries>=3)clearInterval(iv);});
    if(tries>4800)clearInterval(iv);   // 안전상한(~4h)
  },3000);
}
```

- [ ] **Step 2: playAt/playPaths에 watch 인자**
`playAt` 시그니처를 `playAt(path,ms,watchId)`로, 성공 분기에 watch 추가:
```js
function playAt(path,ms,watchId){if(!path)return;if(!HELPER_OK){toast('헬퍼가 꺼져 있어 재생할 수 없습니다');return}
  fetch(HELPER+"/play",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({paths:[path],seek:(ms||0)/1000})})
    .then(r=>r.json()).then(j=>{if(j&&j.ok){toast('재생 · '+fmtClock(ms));if(watchId&&j.token)watchClose(j.token,watchId);}else toast('재생 실패: '+((j&&j.error)||''));}).catch(()=>toast('재생 실패'));}
```
`playPaths` 시그니처를 `playPaths(paths,watchId)`로, 성공 분기에 `if(watchId&&j.token)watchClose(j.token,watchId);` 추가(기존 토스트 유지).

- [ ] **Step 3: dblclick가 watch 대상 전달**
Task4의 dblclick 비디오 분기를 교체:
```js
  if(nodeEl){const n=N(nodeEl.dataset.id);if(n&&n.videoPath){e.preventDefault();if(n.seekMs!=null)playAt(n.videoPath,n.seekMs,n.bmParent);else playPaths([n.videoPath],n.id);return;}}
```
> `playSelected`(다중 선택 재생)는 watch 대상이 모호하므로 인자 없이 그대로(변경 없음).

- [ ] **Step 4: 검증 + 커밋**
- `node --check` OK. 헤드리스 로드 치명오류 없음. `/playdone` 폴링 실동작은 로컬 수동(리포트 명시).
```bash
git add map/potflow.html
git commit -m "feat(potflow): PotPlayer 닫힐 때 책갈피 자동 재동기화(watchClose)"
```

---

## Self-Review
- **Spec 커버**: 파서/연결(§3-1)=T1 · /bookmarks·/play seek(§3-2,3-3)=T2 · 종료추적/playdone(§3-4)=T3 · 하위노드/HUD/자동동기화(§4-1,4-2,4-3-1,4-3-2)=T4 · 닫힐때(§4-3-3,4-4)=T5. ✅
- **Placeholder**: 각 스텝 실제 코드. ✅
- **Type/이름 일관**: `parse_pbf`/`list_bookmarks`/`bookmark_thumb`/`player_cmd`/`play_done` 헬퍼 일관. 클라 `syncBookmarks`/`bmChildren`/`playAt(…,watchId)`/`playPaths(…,watchId)`/`watchClose`/`fmtClock`/`bmParent`/`seekMs` T4↔T5 일관. `makeNode(x,y,title,type)`·`addEdge(from,fromSide,to,toSide)`·`delNodes(ids)`·`N`·`putImg` 실존 확인. ✅
- **주의**: T3에서 `launch_players` 내부 지역 `import threading` 제거하고 상단 전역 사용(중복 import 무해하나 정리). `_register_play`가 procs 없거나 Popen 실패 시에도 token 반환(빈 procs→즉시 done). bmParent 있는 노드는 syncBookmarks 가드로 재귀 방지.
