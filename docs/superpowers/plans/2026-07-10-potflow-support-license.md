# PotFlow 책갈피▶재생·후원·라이센스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 책갈피 노드도 ▶/Space로 그 지점부터 재생; 헤더 후원하기(계좌); 무료/유료(간이 명예제) 라이센스로 1:2↔1:N·캔버스·영상노드 제한.

**Tech Stack:** Python 표준라이브러리, 바닐라 JS 단일 HTML.

## Global Constraints
- Python 표준라이브러리만. 바닐라 JS·단일 파일·외부 라이브러리 금지.
- 수정 파일: `map/potflow-helper.py`·`map/potflow.html`·`map/test_potflow_helper.py`만.
- **좌측 accent 라인 금지**. 한국어 UI. Host 가드·CORS 유지. `noindex` 메타 유지(이미 존재).
- 테스트 러너(venv): `cd map && /tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/104149d1-1d21-4142-91c1-1f33734bdc96/scratchpad/venv/bin/pytest test_potflow_helper.py -q`
- 클라 검증: 인라인 `<script>` 추출 후 `node --check`; 헤드리스 Windows Chrome 스크린샷(`--headless=new --virtual-time-budget=6000 --user-data-dir=<임시> --screenshot=<C:\...png>`).

---

## Task 1: 헬퍼 /play items (항목별 seek)

**Files:** Modify `map/potflow-helper.py`, Test `map/test_potflow_helper.py`

**Interfaces:**
- Produces: `normalize_play_items(body) -> [{"path","seek"}]`.
- Modifies: `launch_players(items)` (기존 `(paths, seek)` → `(items)`), `POST /play` → `launch_players(normalize_play_items(body))`.

- [ ] **Step 1: 실패 테스트 추가**
```python
def test_normalize_play_items():
    assert helper.normalize_play_items({"items":[{"path":"a.mp4","seek":5},{"path":"b.mkv"}]}) == \
        [{"path":"a.mp4","seek":5},{"path":"b.mkv","seek":None}]
    assert helper.normalize_play_items({"paths":["a.mp4","b.mkv"],"seek":9}) == \
        [{"path":"a.mp4","seek":9},{"path":"b.mkv","seek":9}]
    assert helper.normalize_play_items({"paths":["a.mp4"]}) == [{"path":"a.mp4","seek":None}]
    assert helper.normalize_play_items({}) == []
```

- [ ] **Step 2: 실패 확인** — FAIL (미정의)

- [ ] **Step 3: 구현**
`launch_players` 근처에 추가:
```python
def normalize_play_items(body):
    items = body.get("items")
    if isinstance(items, list) and items:
        out = []
        for it in items:
            if isinstance(it, dict) and it.get("path"):
                out.append({"path": it["path"], "seek": it.get("seek")})
        return out
    seek = body.get("seek")
    return [{"path": p, "seek": seek} for p in body.get("paths", []) if p]
```
`launch_players`를 items 기반으로 교체:
```python
def launch_players(items):
    exe = find_exe([POTPLAYER_PATH])
    if not exe:
        return {"ok": False, "error": "PotPlayer not found"}
    valid = [it for it in items if it.get("path") and os.path.isfile(it["path"])]
    if not valid:
        return {"ok": False, "error": "no valid videos"}
    sw, sh = _screen_size()
    rects = tile_rects(len(valid), sw, sh)
    procs = []
    for it in valid:
        try:
            procs.append(subprocess.Popen(player_cmd(exe, it["path"], it.get("seek"))))
        except Exception:
            pass
    pids = [pr.pid for pr in procs]
    if os.name == "nt" and len(pids) > 1:
        threading.Thread(target=arrange_windows, args=(pids, rects), daemon=True).start()
    token = _register_play(procs, valid[0]["path"] if len(valid) == 1 else None)
    return {"ok": True, "launched": len(procs), "token": token}
```
`do_POST`의 `/play` 분기:
```python
        if u.path == "/play":
            return self._send(200, launch_players(normalize_play_items(body)))
```

- [ ] **Step 4: 통과 확인** — PASS (24 passing)

- [ ] **Step 5: 커밋**
```bash
git add map/potflow-helper.py map/test_potflow_helper.py
git commit -m "feat(potflow): /play items(항목별 seek) — 다중 책갈피 동시 지점재생"
```

---

## Task 2: 클라이언트 — ▶/Space가 책갈피 지점부터

**Files:** Modify `map/potflow.html`

**Interfaces:** Consumes `sel`,`N`,`HELPER`,`HELPER_OK`,`watchClose`,`toast`. Produces `playItems(items,watchId)`; `playSelected` 재작성.

- [ ] **Step 1: playItems 추가 + playSelected 교체**
`playPaths`/`playAt` 근처(같은 영역):
```js
function playItems(items,watchId){const list=(items||[]).filter(it=>it&&it.path);if(!list.length){toast('재생할 동영상이 없습니다');return}if(!HELPER_OK){toast('헬퍼가 꺼져 있어 재생할 수 없습니다');return}
  fetch(HELPER+"/play",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:list})}).then(r=>r.json()).then(j=>{if(j&&j.ok){toast(j.launched+'개 재생');if(watchId&&j.token)watchClose(j.token,watchId);}else toast('재생 실패: '+((j&&j.error)||''));}).catch(()=>toast('재생 실패'));}
```
기존 `playSelected`를 교체:
```js
function playSelected(){const items=sel.map(id=>{const n=N(id);if(!n||!n.videoPath)return null;return {path:n.videoPath,seek:n.seekMs!=null?n.seekMs/1000:null};}).filter(Boolean);if(!items.length){toast('선택한 노드에 동영상 경로가 없습니다');return}playItems(items);}
```

- [ ] **Step 2: 검증 + 커밋**
- 인라인 스크립트 `node --check` OK. 헤드리스 로드 치명오류 없음.
```bash
git add map/potflow.html
git commit -m "feat(potflow): ▶/Space 다중선택 재생이 책갈피 노드는 그 지점부터"
```

---

## Task 3: 클라이언트 — 후원/PRO 모달 + 라이센스 상태

**Files:** Modify `map/potflow.html`

**Interfaces:** Consumes `.tools` 헤더, `.menupop`/`closeMenus`, `lsGet`/`lsSet`, `toast`, `boot`. Produces `SUPPORT_ACCOUNT`,`LIC_SALT`,`PRO`,`isPro`,`_licHash`,`licenseValid`,`licenseKeyFor`,`unlockPro`,`copySupport`,`toggleSupport`,`openSupport`,`updateProBadge`.

- [ ] **Step 1: 헤더 버튼 + 배지 + 팝오버 마크업**
`.tools` 안, `내보내기 ▾` 버튼 앞에 추가:
```html
    <button class="btn ghost" id="supBtn" onclick="toggleSupport(event)">♥ 후원</button>
    <span class="pro-badge" id="proBadge" style="display:none">PRO</span>
```
`#exPop` 팝오버(`<div class="menupop" id="exPop">`) 다음에 후원 팝오버 추가:
```html
  <div class="menupop suppop" id="supPop">
    <div class="sup-h">♥ 후원하기</div>
    <div class="sup-acct" id="supAcct"></div>
    <button class="btn ghost sup-btn" onclick="copySupport()">계좌 복사</button>
    <div class="sup-note">보내주신 후원은 큰 힘이 됩니다. 감사합니다.</div>
    <div class="sup-hr"></div>
    <div class="sup-h">PRO 해제</div>
    <div class="sup-note">입금 후 발급받은 해제키를 입력하세요. (무료: 캔버스·영상 1개, 1:2 / PRO: 무제한 1:N)</div>
    <input id="licInput" class="sup-input" placeholder="PF-XXXX-XXXX" autocomplete="off">
    <button class="btn gold sup-btn" onclick="unlockPro(document.getElementById('licInput').value)">해제</button>
    <div class="sup-status" id="licStatus"></div>
    <div class="sup-note">모든 데이터는 이 브라우저/PC에만 저장됩니다.</div>
  </div>
```

- [ ] **Step 2: CSS**
`<style>`에 추가(토큰 사용·좌측 라인 금지):
```css
  .pro-badge{align-self:center;font-size:11px;font-weight:800;color:var(--gold);border:1px solid var(--gold-dim);border-radius:6px;padding:2px 7px;letter-spacing:.04em}
  .suppop{width:264px;padding:12px;display:flex;flex-direction:column;gap:7px}
  .sup-h{font-weight:800;color:var(--gold);font-size:13px}
  .sup-acct{background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:8px 9px;font-size:12.5px;color:var(--txt);user-select:all;word-break:break-all}
  .sup-note{font-size:11px;color:var(--eth);line-height:1.5}
  .sup-hr{height:1px;background:var(--line);margin:4px 0}
  .sup-input{font-family:inherit;font-size:13px;background:var(--bg);border:1px solid var(--line);border-radius:7px;color:var(--txt);padding:7px 9px;outline:none;text-transform:uppercase}
  .sup-input:focus{border-color:var(--gold-dim)}
  .sup-btn{width:100%;justify-content:center}
  .sup-status{font-size:12px;color:var(--gold);min-height:14px}
```

- [ ] **Step 3: 상태/라이센스/후원 함수**
`lsGet`/`lsSet` 근처(전역 영역):
```js
const SUPPORT_ACCOUNT="OO은행 000-000000-00 · 예금주 OOO";
const LIC_SALT="potflow-2026-lock";
let PRO=false;
function _licHash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36).toUpperCase().padStart(4,'0').slice(0,4);}
function licenseValid(key){const m=/^PF-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec((key||'').trim().toUpperCase());return !!m&&_licHash(m[1]+LIC_SALT)===m[2];}
function licenseKeyFor(a){a=(a||'').toUpperCase();return 'PF-'+a+'-'+_licHash(a+LIC_SALT);}
function isPro(){return PRO;}
function updateProBadge(){const b=document.getElementById('proBadge');if(b)b.style.display=PRO?'':'none';const s=document.getElementById('licStatus');if(s)s.textContent=PRO?'✔ PRO 활성화됨':'';}
function unlockPro(key){if(licenseValid(key)){PRO=true;lsSet('potflow_pro','1');updateProBadge();toast('PRO 활성화');}else toast('잘못된 해제키');}
function copySupport(){const t=SUPPORT_ACCOUNT;const ok=()=>toast('계좌 복사됨');const no=()=>toast('복사 실패 — 계좌를 길게 눌러 복사하세요');if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(ok).catch(no);else no();}
function openSupport(){const el=document.getElementById('supPop');if(!el)return;closeMenus('supPop');document.getElementById('supAcct').textContent=SUPPORT_ACCOUNT;updateProBadge();el.classList.add('open');const b=document.getElementById('supBtn');if(b){const r=b.getBoundingClientRect();el.style.top=(r.bottom+6)+'px';el.style.right=(window.innerWidth-r.right)+'px';}}
function toggleSupport(e){if(e)e.stopPropagation();const el=document.getElementById('supPop');if(el&&el.classList.contains('open')){el.classList.remove('open');return;}openSupport();}
```

- [ ] **Step 4: closeMenus 목록 + boot 초기화**
`closeMenus`의 배열 `['exPop','bgPop']`을 `['exPop','bgPop','supPop']`로 교체.
`boot()` 말미(렌더 후)에 추가:
```js
  PRO=lsGet('potflow_pro')==='1';updateProBadge();
  const sa=document.getElementById('supAcct');if(sa)sa.textContent=SUPPORT_ACCOUNT;
```

- [ ] **Step 5: 검증 + 커밋**
- `node --check` OK.
- 헤드리스 스크린샷: 헤더 `♥ 후원` 버튼 보이고, (테스트로) `toggleSupport()` 없이도 로드 정상. 콘솔에서 `licenseKeyFor('TEST')`가 `PF-TEST-XXXX` 형태 반환·`licenseValid(그 키)===true`, 임의 키 false 확인(리포트에 기재). 스크린샷을 `/mnt/c/Users/yotac/screenshots/`에 저장.
```bash
git add map/potflow.html
git commit -m "feat(potflow): 후원하기(계좌·복사) + PRO 라이센스(자체검증키·배지)"
```

---

## Task 4: 클라이언트 — 무료/유료 게이팅

**Files:** Modify `map/potflow.html`

**Interfaces:** Consumes `isPro`,`state`,`openSupport`,`toast`,`canvases`. Produces `videoNodeCount(exclId)`,`childCount(id)`; 게이트를 `newCanvas`·`bindVideoToNode`·`addChild`·`addChildMini`·`syncBookmarks`에 삽입.

- [ ] **Step 1: 유틸 추가**
`isPro` 근처:
```js
function videoNodeCount(exclId){return state.nodes.filter(n=>n.videoPath&&n.bmParent==null&&n.id!==exclId).length;}
function childCount(id){return state.edges.filter(e=>e.from===id).length;}
```

- [ ] **Step 2: 캔버스 게이트**
`newCanvas` 함수 본문 첫 줄에:
```js
  if(!isPro()&&canvases.length>=1){toast('무료는 캔버스 1개 · PRO에서 여러 개');openSupport();return;}
```

- [ ] **Step 3: 영상 노드 게이트**
`bindVideoToNode(id,path,name)`의 `const n=N(id);if(!n)return;` 다음에:
```js
  if(!isPro()&&!n.videoPath&&videoNodeCount(id)>=1){toast('무료는 영상 1개 · PRO에서 여러 개');openSupport();return;}
```
(이미 videoPath가 있던 노드의 재지정은 허용 — 개수 안 늘어남.)

- [ ] **Step 4: 하위(1:2) 게이트**
`addChild`·`addChildMini`의 첫 줄(`const n=N(id);` 앞)에 각각:
```js
  if(!isPro()&&childCount(id)>=2){toast('무료는 1:2 · PRO에서 1:N');openSupport();return;}
```
(`addParent`는 새 노드가 부모가 되어 기존 노드의 자식 수를 늘리지 않으므로 게이트 없음.)

- [ ] **Step 5: 책갈피 자식 게이트**
`syncBookmarks` 안, `const bms=d.bookmarks||[];` 다음 줄에 무료 상한 적용:
```js
    const allBms=d.bookmarks||[];const bms=isPro()?allBms:allBms.slice(0,2);
    if(!isPro()&&allBms.length>2)toast('무료는 책갈피 2개 · PRO에서 전체');
```
그리고 이후 로직에서 `bms`를 사용(이미 `bms.forEach`·stale 계산이 `bms` 기준이므로, 무료 시 3번째+ 책갈피는 미생성·기존 초과분은 stale로 제거됨). 최종 토스트 `'책갈피 N개'`는 `bms.length` 기준 유지.

- [ ] **Step 6: 검증 + 커밋**
- `node --check` OK. 헤드리스 로드 정상.
- 콘솔 구조 검증(리포트): 기본 캔버스에서 `newCanvas()` → 토스트+차단(무료); `PRO=true` 후엔 허용. (실동작은 로컬 수동 가능.)
```bash
git add map/potflow.html
git commit -m "feat(potflow): 무료/유료 게이팅(캔버스1·영상1·1:2, PRO 무제한)"
```

---

## Self-Review
- **Spec 커버**: A(/play items·playSelected)=T1,T2 · B(후원 계좌·복사)=T3 · C(noindex 유지·데이터 로컬 안내)=T3(모달 문구; 메타 기존) · D(라이센스 상태/키/배지=T3, 게이팅=T4). ✅
- **Placeholder**: 각 스텝 실제 코드. ✅
- **Type/이름 일관**: 헬퍼 `normalize_play_items`/`launch_players(items)` 일관. 클라 `playItems`/`isPro`/`videoNodeCount`/`childCount`/`openSupport`/`updateProBadge`/`licenseValid` T2~T4 일관. `lsGet/lsSet`·`closeMenus`·`newCanvas`·`addChild(Mini)`·`bindVideoToNode`·`syncBookmarks` 실존 확인(앵커 grep됨). ✅
- **주의**: `launch_players` 시그니처가 `(paths,seek)`→`(items)`로 바뀌므로 **다른 호출부 없음** 확인(현재 do_POST만 호출). 게이팅은 명예제(클라)·기본 예시(영상경로 없음)엔 무영향. `bindVideoToNode` 차단 시 방금 만든 빈 노드는 남을 수 있음(사용자 삭제) — 허용 동작.
