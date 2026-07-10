# PotFlow 노드별 화면 배치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 재생 시 PotPlayer 창을 노드별 지정 화면 영역(다중 모니터·다양한 분할 프리셋 + 자유 드래그)에 배치; 미지정 노드는 자동 타일 폴백.

**Tech Stack:** Python 표준라이브러리(ctypes), 바닐라 JS 단일 HTML.

## Global Constraints
- Python 표준라이브러리만. 바닐라 JS·단일 파일·외부 라이브러리 금지.
- 수정 파일: `map/potflow-helper.py`·`map/potflow.html`·`map/test_potflow_helper.py`만.
- **좌측 accent 라인 금지**. 한국어 UI. Host 가드·CORS 유지. **Windows 전용**(비Windows/조회 실패→주 모니터 폴백).
- 테스트 러너(venv): `cd map && /tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/104149d1-1d21-4142-91c1-1f33734bdc96/scratchpad/venv/bin/pytest test_potflow_helper.py -q`
- 클라 검증: 인라인 `<script>` 추출 후 `node --check`; 헤드리스 Windows Chrome 스크린샷.
- win 데이터: `{mon, x, y, w, h}`(mon=모니터index, x/y/w/h=그 모니터 0~1 비율). null=자동.

---

## Task 1: 헬퍼 — 모니터·win 좌표·배치

**Files:** Modify `map/potflow-helper.py`, Test `map/test_potflow_helper.py`

**Interfaces:**
- Produces: `_monitors()`, `win_to_rect(win,monitors)`, `build_play_rects(valid,monitors)`, `GET /monitors`.
- Modifies: `normalize_play_items`(win 통과), `launch_players`(build_play_rects·arrange 조건), `arrange_windows`(SW_RESTORE).

- [ ] **Step 1: 실패 테스트 추가**
```python
def test_win_to_rect_multimon():
    mons=[{"x":0,"y":0,"w":1920,"h":1080,"primary":True},{"x":1920,"y":0,"w":1280,"h":720,"primary":False}]
    assert helper.win_to_rect({"mon":1,"x":0.5,"y":0,"w":0.5,"h":1}, mons)==(2560,0,640,720)
    assert helper.win_to_rect({"mon":9,"x":0,"y":0,"w":1,"h":1}, mons)==(0,0,1920,1080)

def test_build_play_rects_mixed():
    mons=[{"x":0,"y":0,"w":1000,"h":800,"primary":True}]
    valid=[{"path":"a","win":{"mon":0,"x":0,"y":0,"w":.5,"h":1}},{"path":"b"}]
    r=helper.build_play_rects(valid, mons)
    assert r[0]==(0,0,500,800) and len(r)==2 and r[1][2]>0

def test_normalize_carries_win():
    out=helper.normalize_play_items({"items":[{"path":"a","seek":3,"win":{"mon":0,"x":0,"y":0,"w":1,"h":1}}]})
    assert out[0]["win"]=={"mon":0,"x":0,"y":0,"w":1,"h":1} and out[0]["seek"]==3
    out2=helper.normalize_play_items({"paths":["a"]})
    assert out2[0]["win"] is None
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**
`_screen_size` 근처에 추가:
```python
def _monitors():
    try:
        import ctypes
        from ctypes import wintypes
        u = ctypes.windll.user32
        class RECT(ctypes.Structure):
            _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long), ("right", ctypes.c_long), ("bottom", ctypes.c_long)]
        class MONITORINFO(ctypes.Structure):
            _fields_ = [("cbSize", ctypes.c_ulong), ("rcMonitor", RECT), ("rcWork", RECT), ("dwFlags", ctypes.c_ulong)]
        mons = []
        MONENUM = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(RECT), wintypes.LPARAM)
        def cb(hMon, hdc, lprc, lparam):
            info = MONITORINFO(); info.cbSize = ctypes.sizeof(MONITORINFO)
            u.GetMonitorInfoW(hMon, ctypes.byref(info))
            r = info.rcWork
            mons.append({"x": r.left, "y": r.top, "w": r.right - r.left, "h": r.bottom - r.top, "primary": bool(info.dwFlags & 1)})
            return 1
        u.EnumDisplayMonitors(0, 0, MONENUM(cb), 0)
        mons.sort(key=lambda m: (not m["primary"], m["x"], m["y"]))
        return mons or [{"x": 0, "y": 0, "w": 1920, "h": 1080, "primary": True}]
    except Exception:
        return [{"x": 0, "y": 0, "w": 1920, "h": 1080, "primary": True}]

def win_to_rect(win, monitors):
    if not monitors:
        return (0, 0, 100, 100)
    mi = win.get("mon", 0)
    if not isinstance(mi, int) or mi < 0 or mi >= len(monitors):
        mi = 0
    m = monitors[mi]
    x = int(m["x"] + float(win.get("x", 0)) * m["w"])
    y = int(m["y"] + float(win.get("y", 0)) * m["h"])
    w = max(1, int(float(win.get("w", 1)) * m["w"]))
    h = max(1, int(float(win.get("h", 1)) * m["h"]))
    return (x, y, w, h)

def build_play_rects(valid, monitors):
    prim = monitors[0]
    auto = tile_rects(len(valid), prim["w"], prim["h"])
    rects = []
    for i, it in enumerate(valid):
        w = it.get("win")
        if isinstance(w, dict):
            rects.append(win_to_rect(w, monitors))
        else:
            a = auto[i]
            rects.append((prim["x"] + a[0], prim["y"] + a[1], a[2], a[3]))
    return rects
```
`normalize_play_items`의 두 append를 win 포함으로 교체:
```python
                out.append({"path": it["path"], "seek": it.get("seek"), "win": it.get("win")})
```
```python
    return [{"path": p, "seek": seek, "win": None} for p in body.get("paths", []) if p]
```
`launch_players`를 교체:
```python
def launch_players(items):
    exe = find_exe([POTPLAYER_PATH])
    if not exe:
        return {"ok": False, "error": "PotPlayer not found"}
    valid = [it for it in items if it.get("path") and os.path.isfile(it["path"])]
    if not valid:
        return {"ok": False, "error": "no valid videos"}
    monitors = _monitors()
    rects = build_play_rects(valid, monitors)
    procs = []
    for it in valid:
        try:
            procs.append(subprocess.Popen(player_cmd(exe, it["path"], it.get("seek"))))
        except Exception:
            pass
    pids = [pr.pid for pr in procs]
    need = (len(pids) > 1) or any(isinstance(it.get("win"), dict) for it in valid)
    if os.name == "nt" and pids and need:
        threading.Thread(target=arrange_windows, args=(pids, rects), daemon=True).start()
    token = _register_play(procs, valid[0]["path"] if len(valid) == 1 else None)
    return {"ok": True, "launched": len(procs), "token": token}
```
`arrange_windows`의 SetWindowPos 직전에 최대화 해제 추가:
```python
                u.ShowWindow(hwnd, 9)  # SW_RESTORE
                x, y, w, h = want[pid.value]
                u.SetWindowPos(hwnd, 0, x, y, w, h, 0x0040)  # SWP_SHOWWINDOW
```
`do_GET`에 `/monitors` 추가(정적 서빙 위):
```python
        if u.path == "/monitors":
            return self._send(200, {"monitors": _monitors()})
```

- [ ] **Step 4: 통과 확인** — PASS (24 + 3 = 27 passing). (WSL에선 `_monitors`가 폴백 1개 반환 — 순수함수 테스트는 전달값 사용이라 무관.)

- [ ] **Step 5: 커밋**
```bash
git add map/potflow-helper.py map/test_potflow_helper.py
git commit -m "feat(potflow): 모니터 조회/monitors·win_to_rect·build_play_rects·SW_RESTORE 배치"
```

---

## Task 2: 클라이언트 — 재생이 노드 win 반영

**Files:** Modify `map/potflow.html`

**Interfaces:** Consumes `playItems`,`playSelected`,`N`,`sel`, world dblclick. Produces: 재생 items에 `win` 포함.

- [ ] **Step 1: playSelected · dblclick가 win 포함**
`playSelected`를 교체:
```js
function playSelected(){const items=sel.map(id=>{const n=N(id);if(!n||!n.videoPath)return null;return {path:n.videoPath,seek:n.seekMs!=null?n.seekMs/1000:null,win:n.win||null};}).filter(Boolean);if(!items.length){toast('선택한 노드에 동영상 경로가 없습니다');return}playItems(items);}
```
world dblclick 비디오 분기(현재 `if(n.seekMs!=null)playAt(...);else playPaths([n.videoPath],n.id);`)를 playItems 통일로 교체:
```js
  if(nodeEl){const n=N(nodeEl.dataset.id);if(n&&n.videoPath){e.preventDefault();playItems([{path:n.videoPath,seek:n.seekMs!=null?n.seekMs/1000:null,win:n.win||null}],n.bmParent||n.id);return;}}
```
> `playAt`은 남겨도 무방(다른 호출부 없으면 미사용). `playItems`는 이미 존재(win은 서버가 항목에서 읽음).

- [ ] **Step 2: 검증 + 커밋**
- `node --check` OK. 헤드리스 로드 정상.
```bash
git add map/potflow.html
git commit -m "feat(potflow): 재생 시 노드 win(화면영역)을 items에 포함"
```

---

## Task 3: 클라이언트 — 미니 모니터 배치기(프리셋·셀 선택)

**Files:** Modify `map/potflow.html`

**Interfaces:** Consumes `HELPER`,`N`,`markDirty`,`toast`,`closeMenus`,`drawNhud` nbar, `.menupop` 패턴. Produces `MONITORS`,`loadMonitors`,`WP_GRIDS`,`wpGrid`,`wpMon`,`winTarget`,`_wpBox`,`renderWinPop`,`openWinPop`,`setWin`,`clearWin`, HUD "배치" 버튼.

- [ ] **Step 1: 마크업 + CSS**
`#supPop` 팝오버 뒤에 배치기 팝오버:
```html
  <div class="menupop winpop" id="winPop">
    <div class="wp-h">화면 배치 <span class="sup-note" id="wpStatus"></span></div>
    <div class="wp-desk" id="wpDesk"></div>
    <div class="wp-grids" id="wpGrids"></div>
    <button class="btn ghost sup-btn" onclick="clearWin()">배치 해제(자동)</button>
  </div>
```
`<style>`에 추가(토큰·좌측라인 금지):
```css
  .winpop{width:320px;padding:12px;display:flex;flex-direction:column;gap:8px}
  .wp-h{font-weight:800;color:var(--gold);font-size:13px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
  .wp-desk{position:relative;background:var(--bg);border:1px solid var(--line);border-radius:8px;height:150px;overflow:hidden;user-select:none;touch-action:none}
  .wp-mon{position:absolute;border:1px solid var(--eth);box-sizing:border-box;background:var(--raised2);color:var(--faint)}
  .wp-mon.active{border-color:var(--gold-dim)}
  .wp-monlbl{position:absolute;top:2px;left:4px;font-size:10px}
  .wp-cell{position:absolute;box-sizing:border-box;border:1px dashed var(--line);cursor:pointer}
  .wp-cell:hover{background:var(--hover)}
  .wp-rect{position:absolute;box-sizing:border-box;border:2px solid var(--gold);background:rgba(232,180,99,.18);cursor:move}
  .wp-rz{position:absolute;right:-5px;bottom:-5px;width:12px;height:12px;background:var(--gold);border-radius:2px;cursor:nwse-resize}
  .wp-grids{display:flex;flex-wrap:wrap;gap:4px}
  .wp-g{font-size:11px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;cursor:pointer;color:var(--txt);background:var(--surface)}
  .wp-g.on{border-color:var(--gold);color:var(--gold)}
```

- [ ] **Step 2: 상태·렌더·열기 함수**
`openSupport` 근처(전역):
```js
let MONITORS=null,winTarget=null,wpMon=0,wpGrid=[2,2];
const WP_GRIDS=[[1,1],[2,1],[1,2],[3,1],[1,3],[2,2],[3,2],[2,3],[3,3],[4,2],[2,4],[4,4]];
function loadMonitors(cb){if(MONITORS){cb&&cb();return;}fetch(HELPER+"/monitors").then(r=>r.json()).then(j=>{MONITORS=(j&&j.monitors&&j.monitors.length)?j.monitors:[{x:0,y:0,w:1920,h:1080,primary:true}];cb&&cb();}).catch(()=>{MONITORS=[{x:0,y:0,w:1920,h:1080,primary:true}];cb&&cb();});}
function _wpBox(){let a=1e9,b=1e9,c=-1e9,d=-1e9;MONITORS.forEach(m=>{a=Math.min(a,m.x);b=Math.min(b,m.y);c=Math.max(c,m.x+m.w);d=Math.max(d,m.y+m.h);});return {x:a,y:b,w:Math.max(1,c-a),h:Math.max(1,d-b)};}
function renderWinPop(){
  const desk=document.getElementById('wpDesk');if(!desk||!MONITORS)return;
  const box=_wpBox();const W=desk.clientWidth||296,H=desk.clientHeight||150;const s=Math.min(W/box.w,H/box.h)*0.94;
  const ox=(W-box.w*s)/2,oy=(H-box.h*s)/2;desk._s=s;desk._ox=ox;desk._oy=oy;desk._box=box;
  const n=N(winTarget);const win=n&&n.win;let html='';
  MONITORS.forEach((m,i)=>{const L=ox+(m.x-box.x)*s,T=oy+(m.y-box.y)*s,MW=m.w*s,MH=m.h*s;
    html+=`<div class="wp-mon ${i===wpMon?'active':''}" data-mon="${i}" style="left:${L}px;top:${T}px;width:${MW}px;height:${MH}px"><span class="wp-monlbl">${i+1}${m.primary?'★':''}</span></div>`;
    if(i===wpMon){const c=wpGrid[0],r=wpGrid[1];for(let ci=0;ci<c;ci++)for(let ri=0;ri<r;ri++){html+=`<div class="wp-cell" data-mon="${i}" data-cx="${ci}" data-cy="${ri}" style="left:${L+ci/c*MW}px;top:${T+ri/r*MH}px;width:${MW/c}px;height:${MH/r}px"></div>`;}}});
  if(win){const m=MONITORS[win.mon]||MONITORS[0];const L=ox+(m.x-box.x)*s+win.x*m.w*s,T=oy+(m.y-box.y)*s+win.y*m.h*s;
    html+=`<div class="wp-rect" id="wpRect" style="left:${L}px;top:${T}px;width:${win.w*m.w*s}px;height:${win.h*m.h*s}px"><div class="wp-rz" id="wpRz"></div></div>`;}
  desk.innerHTML=html;
  document.querySelectorAll('#winPop .wp-g').forEach(b=>b.classList.toggle('on',b.dataset.grid===wpGrid.join('x')));
  const st=document.getElementById('wpStatus');if(st)st.textContent=win?`모니터 ${win.mon+1} · ${Math.round(win.w*100)}%×${Math.round(win.h*100)}%`:'미지정(자동)';
}
function openWinPop(nodeId){winTarget=nodeId;const n=N(nodeId);wpMon=(n&&n.win&&n.win.mon)||0;closeMenus('winPop');
  const gw=document.getElementById('wpGrids');if(gw&&!gw.children.length)gw.innerHTML=WP_GRIDS.map(g=>`<div class="wp-g" data-grid="${g[0]}x${g[1]}">${g[0]}×${g[1]}</div>`).join('');
  loadMonitors(()=>{const el=document.getElementById('winPop');el.classList.add('open');const b=document.getElementById('winBtn');if(b){const r=b.getBoundingClientRect();el.style.top=(r.bottom+6)+'px';el.style.right=(window.innerWidth-r.right)+'px';}renderWinPop();});}
function setWin(mon,x,y,w,h){const n=N(winTarget);if(!n)return;n.win={mon:mon,x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y)),w:Math.max(.05,Math.min(1,w)),h:Math.max(.05,Math.min(1,h))};markDirty();renderWinPop();}
function clearWin(){const n=N(winTarget);if(n){n.win=null;markDirty();renderWinPop();}}
```
> `winBtn`은 HUD 버튼이 아니라 팝오버 위치 기준 — HUD 버튼 id를 `winBtn`으로 두지 못하므로(노드마다 재생성), 위치 기준을 화면 우측 상단 근처로 대체: `winBtn` 조회 실패 시 `el.style.top='90px';el.style.right='16px';`로 폴백. (openWinPop의 위치 블록을 `const b=document.getElementById('winBtn'); if(b){...}else{el.style.top='96px';el.style.right='16px';}`로.)

- [ ] **Step 3: 클릭 위임(격자·셀·모니터) + closeMenus + HUD 버튼**
전역에 위임 리스너(1회):
```js
document.getElementById('winPop').addEventListener('click',e=>{
  const g=e.target.closest('.wp-g');if(g){wpGrid=g.dataset.grid.split('x').map(Number);renderWinPop();return;}
  const cell=e.target.closest('.wp-cell');if(cell){const c=wpGrid[0],r=wpGrid[1];setWin(+cell.dataset.mon,(+cell.dataset.cx)/c,(+cell.dataset.cy)/r,1/c,1/r);return;}
  const mon=e.target.closest('.wp-mon');if(mon){wpMon=+mon.dataset.mon;renderWinPop();return;}
});
```
`closeMenus` 배열에 `'winPop'` 추가(`['exPop','bgPop','supPop','winPop']`).
`drawNhud` 단일선택 `nbar-row`에서 `data-nact="bmsync"` 책갈피 버튼 옆에(둘 다 `n.videoPath` 조건) 추가:
```js
      ${n.videoPath?`<button class="hbtn" data-nact="winset" title="화면 배치(모니터 영역)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 20h8M12 17v3"/></svg><span>배치</span></button>`:''}
```
노드 액션 디스패처(`data-nact` 블록)에 `else if(a==='winset')openWinPop(id);` 추가.

- [ ] **Step 4: 검증 + 커밋**
- 인라인 `node --check` OK.
- 헬퍼 실행 후 헤드리스로 페이지 로드 → 콘솔 치명오류 없음. (실제 배치기 상호작용은 win 있는 노드 필요 — 구조 검토 + 스크린샷.) `/monitors`는 WSL에서 폴백 1개 반환.
- 스크린샷을 `/mnt/c/Users/yotac/screenshots/`에 저장. 리포트에 검증/미검증 명시.
```bash
git add map/potflow.html
git commit -m "feat(potflow): 미니 모니터 배치기(다중모니터·격자 프리셋·셀 선택)"
```

---

## Task 4: 클라이언트 — 자유 드래그/리사이즈

**Files:** Modify `map/potflow.html`

**Interfaces:** Consumes `wpDesk`,`MONITORS`,`N`,`winTarget`,`markDirty`,`renderWinPop`,`desk._s/_box`. Produces: `#wpDesk` pointer 핸들러(이동/리사이즈).

- [ ] **Step 1: 포인터 드래그 핸들러(1회 바인딩)**
Task3의 위임 리스너 근처에 IIFE 추가:
```js
(function(){let mode=null,start=null;const desk=document.getElementById('wpDesk');if(!desk)return;
  desk.addEventListener('pointerdown',e=>{const rz=e.target.closest('#wpRz'),rect=e.target.closest('#wpRect');if(!rz&&!rect)return;e.preventDefault();e.stopPropagation();mode=rz?'rz':'mv';const n=N(winTarget);if(!n||!n.win){mode=null;return;}start={win:Object.assign({},n.win),cx:e.clientX,cy:e.clientY};try{desk.setPointerCapture(e.pointerId);}catch(_){}}); 
  desk.addEventListener('pointermove',e=>{if(!mode||!start)return;const n=N(winTarget);if(!n||!n.win){mode=null;return;}const s=desk._s||1;const dx=(e.clientX-start.cx)/s,dy=(e.clientY-start.cy)/s;const m0=MONITORS[start.win.mon]||MONITORS[0];
    if(mode==='mv'){const cw=start.win.w,ch=start.win.h;let vx=m0.x+start.win.x*m0.w+dx,vy=m0.y+start.win.y*m0.h+dy;const cX=vx+cw*m0.w/2,cY=vy+ch*m0.h/2;let tgt=MONITORS.findIndex(mm=>cX>=mm.x&&cX<mm.x+mm.w&&cY>=mm.y&&cY<mm.y+mm.h);if(tgt<0)tgt=start.win.mon;const tm=MONITORS[tgt];n.win={mon:tgt,x:Math.max(0,Math.min(1-cw,(vx-tm.x)/tm.w)),y:Math.max(0,Math.min(1-ch,(vy-tm.y)/tm.h)),w:cw,h:ch};}
    else{const nw=Math.max(.05,Math.min(1-start.win.x,start.win.w+dx/m0.w)),nh=Math.max(.05,Math.min(1-start.win.y,start.win.h+dy/m0.h));n.win={mon:start.win.mon,x:start.win.x,y:start.win.y,w:nw,h:nh};}
    markDirty();renderWinPop();});
  desk.addEventListener('pointerup',()=>{mode=null;start=null;});
  desk.addEventListener('pointercancel',()=>{mode=null;start=null;});
})();
```
> `renderWinPop`이 매 move마다 `#wpRect`를 재생성하지만, 핸들러는 `desk`에 바인딩되어 있고 `setPointerCapture(desk)`로 이벤트가 계속 desk로 오므로 동작. 셀 클릭 위임과 충돌 없음(드래그는 `#wpRect`/`#wpRz`에서 시작, `stopPropagation`).

- [ ] **Step 2: 검증 + 커밋**
- `node --check` OK. 헤드리스 로드 정상. 실제 드래그는 로컬 수동(리포트 명시).
```bash
git add map/potflow.html
git commit -m "feat(potflow): 배치기 자유 드래그/리사이즈(모니터 간 이동)"
```

---

## Self-Review
- **Spec 커버**: §3 헬퍼(모니터·win_to_rect·build_play_rects·/monitors·arrange restore)=T1 · §4-1 재생 win=T2 · §4-2 배치기(프리셋·셀·다중모니터)=T3 · §4-3 자유 드래그=T4. ✅
- **Placeholder**: 각 스텝 실제 코드. ✅
- **Type/이름 일관**: 헬퍼 `win_to_rect`/`build_play_rects`/`normalize_play_items(win)`/`launch_players(items)` 일관. 클라 `MONITORS`/`openWinPop`/`renderWinPop`/`setWin`/`clearWin`/`WP_GRIDS`/`wpGrid`/`wpMon`/`winTarget` T3↔T4 일관. `playItems`/`N`/`markDirty`/`closeMenus` 실존. ✅
- **주의**: `launch_players` 시그니처 유지(`items`) — 호출부 do_POST만. HUD 배치 버튼엔 고정 id가 없어 openWinPop 위치는 `winBtn` 없으면 우상단 폴백. `renderWinPop` 매 move 재생성은 소규모라 성능 OK.
