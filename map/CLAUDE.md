# CLAUDE.md — 스쿱보드 (Scoop Board)

**스쿱보드 · Scoop Board by MoneyScoop** — 자유 캔버스 노드 다이어그램 빌더(GitMind 스타일). 단일 HTML 파일, 빌드 도구 없음, 바닐라 JS.

- **정체성**: 머니스쿱(MoneyScoop)의 부가 유료 서비스로 독립. **KB손해보험과 무관**(과거 VDI 접속흐름 도구에서 리브랜드). [[scoopsignal-deploy]]·ScoopSignal과 같은 MoneyScoop 브랜드 패밀리.
- **브랜드**: 워드마크 `Scoop`+**`Board`**(골드 em)+`by MoneyScoop`, 헤더 노드-다이어그램 글리프 마크. 홈 링크 → `map.html`(현재 페이지·스쿱보드 홈). **테스트 중 — 실제 머니스쿱 사이트/서비스는 건드리지 말 것**(외부 링크 X).
- **테마**: ScoopSignal과 공통 팔레트 — 부드러운 골드 `--gold:#e8b463`, 네이비 잉크 `--bg:#0b0f14`, 보조 `--eth:#8a92b2`, bull/bear `#46c28e`/`#e06a6a`.
- **기본 다이어그램**: 당분간 기존 노드(VDI 접속흐름) 유지 — 추후 중립 예시로 교체 예정.

## 파일

- `map.html` — 전부 들어있는 단일 산출물. HTML+CSS+JS+내장 이미지(빌트인 썸네일 base64) 한 파일.
- `api.php` — 서버 저장 API. 캔버스 CRUD(replace/upsert/delete/reorder/meta) + 이미지 분리저장(putimg/images) 처리.
- `map_data.json` — 서버 관리 데이터(canvases/meta). **배포 시 절대 덮어쓰지 말 것** — 사용자 최신 데이터.
- `map_images.json` — 사용자 업로드 이미지 저장소(imgId → dataURL). **배포 불가침**(빌트인 이미지는 `map.html` 내장이므로 제외).
- 외부 의존성: Pretendard 폰트(CDN `cdn.jsdelivr.net`) 한 개뿐. 그 외 라이브러리 없음.
- 열기: 파일을 브라우저로 직접 열면 동작(메모리 모드). 서버 기능은 `api.php` 호스팅 필요.

## 작업 원칙 (이 프로젝트 관례)

- 바닐라 JS, 빌드 툴 없음, 단일 HTML 파일 유지. 프레임워크/번들러 도입하지 말 것.
- UI 텍스트는 한국어. 다크 테마 + KB 골드(`--gold:#ffbc00`) 토큰 사용.
- 상태는 메모리 보관. 영속화는 서버(`api.php`) 또는 JSON 내보내기/불러오기 (이유는 아래 "제약" 참고).
- 동작하는 프로토타입 우선. 과한 추상화 지양.

## 데이터 모델 (`<script>` 상단)

```js
state = {
  nodes:  [{ id, x, y, title, desc, thumb:{imgId,label}|null,
             type:"full"|"mini"|"icon",  // full=기본 카드, mini=작은 카드, icon=아이콘 전용
             iconId:string|null,         // ICONS 상수의 키. type==='icon'일 때 사용
             bg:string|null }],          // 노드 배경색(NODE_COLORS). null=기본(테마색)
  //        thumb.imgId = IMAGES 맵의 키. 빌트인 id('vdi_login' 등) 또는 사용자 업로드 id.
  edges:  [{ id, from, fromSide, to, toSide,   // *Side = "left"|"right"|"top"|"bottom"|"auto"
             style:"solid"|"dashed",     // 실선 / 점선
             arrow:bool,                 // true=화살표 머리 표시
             width:1|2|3,                // 선 굵기 3단계(EWIDTHS, 미지정=2)
             route:"curve"|"ortho",      // 곡선(기본) / 직각(꺾은선). 미지정=curve
             label:string|null }],       // 연결선 라벨(중앙 pill). null=없음
  //        fromSide/toSide="auto" → sidesOf(e)가 두 노드 위치 기준 최단 연결면 동적 계산
  groups: [{ id, nodes:[nodeId...], title }],
}
view = { tx, ty, scale }      // 캔버스 팬/줌
sel  = [nodeId...]            // 선택된 노드들
selEdge = edgeId | null       // 선택된 연결선(1개)
IMAGES  = { [id]: dataURL }   // 빌트인(HTML 내장) + 사용자 업로드(api.php ?images=1 로드)
TOOLBAR = { snap:bool, edgeStyle:"solid"|"dashed", edgeArrow:bool, selectMode:bool }
          // 전역 작성 도구 상태. saveMeta()로 서버 meta.toolbar에 영속, exportJSON에 포함.
          // selectMode = 영역 선택(드래그=마퀴). 영속됨.
NODE_COLORS = [null,...6色]   // 노드 배경색 팔레트(첫 항목 null=기본)
EWIDTHS = { 1:1.6, 2:2.4, 3:3.8 }  // 엣지 굵기 단계→stroke-width(px)
undoStack/redoStack, histBase  // 되돌리기/다시실행 스택. snapState()=_접두 필드 제외 JSON 스냅샷
ICONS   = { [id]: string }   // 아이콘 id → 인라인 SVG 내부 마크업(path/shape 문자열). 현재 20종
```

- 좌표는 모두 **월드 좌표**. 화면 좌표 변환은 `worldPt(clientX,clientY)`.
- `nodes`/`groups`는 `render()`에서 DOM 재생성, 텍스트 편집은 `focusout`에서 state에 반영(재렌더 없음).
- 노드 높이 `n._h`는 `measure()`가 DOM에서 읽어 캐싱(엣지/그룹 좌표 계산에 사용).
- **`thumb.imgId`** 참조 방식: 렌더 시 `imgSrc(id)`로 `IMAGES` 맵에서 dataURL 조회. 이전 내보내기 포맷(`thumb.src` 인라인)은 import 시 imgId 없이 렌더 → 썸네일 공백(graceful degradation).

## 핵심 함수 맵

| 영역 | 함수 |
|---|---|
| 렌더 | `render()` → `measure()` → `paint()` → `applySel()` → `applyView()` |
| 그리기 | `paint()` = 엣지(`ew` 보이는선 + `eh` 히트영역) + `layoutGroups()` + `drawEhud()` + `drawNhud()` |
| 엣지 기하 | `edgeGeo(e)`(curve=베지어 / ortho=`orthoPath`+`polyPath` 분기), `anchor`, `nearestSide`, `centerOf`, `sidesOf`(auto 최단면), `DIR` |
| 엣지 스타일 | `paint()`에서 `e.style==='dashed'`→`stroke-dasharray`, `e.arrow`→`<marker>`, `e.width`→`EWIDTHS`. 엣지 HUD(`drawEhud`)에서 삭제/방향/실선점선/화살표/굵기/**라우팅(곡선·직각)**/**라벨** 토글 |
| 엣지 라벨 | `drawLabels()`(`#elabels`에 `.elabel` pill, paint마다), world `focusout`/`[data-elabeladd]`로 `e.label` 저장·생성, 빈 값→제거 |
| 노드 배경색 | `drawNhud()` — 단일 선택 노드 위 `.nclr` 색상 팝오버(`NODE_COLORS` 스와치). `world` click `[data-bg]` → `n.bg` 설정 후 `render()` |
| 노드 판정 | `nodeAt(pt)` — 좌표로 노드 탐색(연결 드롭/하이라이트에 사용, elementFromPoint 안 씀) |
| 노드 타입 | `nodeHTML(n)` — `n.type`('full'/'mini'/'icon') 분기 렌더. `addChildMini/addSiblingMini` = mini 단축 생성, `addMiniCenter` = 캔버스 중앙에 mini 추가 |
| 포인터 | `stage.pointerdown` 디스패치 → `startPan/startMarquee/startLink/startEndpoint/nodePointerDown` → `onMove/onUp` |
| 스냅 | `onMove`에서 `TOOLBAR.snap` 활성 시 다른 노드에 x/y 정렬 스냅 + `#snapV`/`#snapH` 가이드선 표시 |
| 노드 편집 | `world` 위임: `click`(del/rmthumb/그룹·엣지 버튼), `focusout`(title/desc/그룹 라벨) |
| 추가/연결 | `makeNode(x,y,title,type,iconId)`, `addEdge(from,fromSide,to,toSide)`, `addSibling/addChild/addParent` |
| 툴레일 | `renderToolbar()` — 팔레트 버튼 상태(영역선택·자석 on, `.stage.selmode` 커서). `toggleSnap` / `toggleSelectMode`(→`TOOLBAR.selectMode` 영속) → `saveMeta()`. (선/화살표 토글은 팔레트에서 제거 — 엣지 HUD에서 처리) |
| HUD 툴바 | `drawEhud()`(`.ebar`)·`drawNhud()`(`.nbar`) — 라벨형 미니 툴바(아이콘 `ICO.*` + 한글 라벨). 엣지: 삭제/방향/실선점선/화살표/굵기. 노드: 상위/하위/삭제 + 색상 스와치 |
| 4점 자석 | `portSnap(n,pt)`(가장 가까운 포트, 중앙부 `auto`), `snapAt(pt,excl)`(DOM무관 계산), `hi()`(흡착+포트 하이라이트 `.linkhover`/`.snaptarget`), `clearLinkHi()` |
| 캔버스 배경 | `applyCanvasBg(bg)`·`setCanvasBg(bg)`·`renderBgPop()`·`toggleBgPop()`, `CANVAS_BGS`. loadCanvas/writeBackActive에서 `canvas.bg` 동기화 |
| 정렬·배포 | `alignSel(mode)` — 선택 2개↑ 좌/우/cx·상/하/cy 정렬, dh/dv 등간격(gap 기준). `drawNhud`가 다중선택 시 `.abar`(8버튼) 렌더. `ALI`(채움 아이콘) |
| 내보내기 | `buildSVG()`(상태→벡터 SVG: 노드 rect+텍스트 wrap·아이콘·썸네일 `<image xlink:href>`, 엣지 path+라벨, 그룹), `exportSVG()`/`exportPNG()`(SVG→Image→canvas→toBlob, 라이브러리 없음·타인트 없음), `exportJSON()`. 헤더 `내보내기 ▾` → `.menupop`(`toggleExportPop`/`closeMenus`) |
| 아이콘 | `ICONS`(20종 SVG path 상수), `iconSvg(id)` — path→SVG 문자열, `renderPalette()` — 팔레트 그리드, `addIconCenter(iconId)` — 아이콘 노드 추가 |
| 정렬/뷰 | `autoLayout('h'|'v')`(레이어 배치), `fitView()`, `zoomBy(f)` |
| 되돌리기 | `recordHistory()`(markDirty 안에서 호출, 변경 없으면 dedup), `undo()`/`redo()`, `resetHistory()`(loadCanvas마다), `snapState()`/`applySnap()`. 키 `Ctrl+Z`/`Ctrl+Shift+Z`·`Ctrl+Y`, 헤더 `↶`/`↷` 버튼(`updateUndoBtns`) |
| 입출력 | `exportJSON()`(toolbar 포함), 불러오기(`impFile` change — toolbar 복원), `resetAll()` |
| 서버 저장 | `boot()`, `loadCanvas(id)`, `writeBackActive()`, `markDirty()`, `saveMeta()`(toolbar 포함) |
| 캔버스 관리 | `switchCanvas(id)`, `newCanvas()`, `renameCanvas(id,title)`, `deleteCanvas(id)`, `renderSidebar()` |
| 이미지 | `imgSrc(id)`, `putImg(id,dataURL)`, `downscaleImage(src,cb)`, `loadImages()` |
| 기타 | `zoom(id)`(라이트박스), `toast(msg)`, `toggleSide()`(사이드바 접기) |

## 서버 저장 / 캔버스 관리

### 서버 문서 구조 (`map_data.json`)

```js
doc = {
  canvases: [{ id, title, nodes, edges, groups, view, bg, updated }],  // bg=캔버스 배경색(CANVAS_BGS, null=기본)
  meta: { library: [...], activeId: "..." },
  _rev: 0   // 충돌 감지용 리비전
}
```

### op API (`api.php` POST `{op, ...}`)

| op | 동작 |
|---|---|
| `replace` | 전체 문서 교체(내보내기/불러오기용) |
| `upsert` | 단일 캔버스 삽입·갱신(`{canvas}` 페이로드) |
| `delete` | 캔버스 삭제(`{id}`) |
| `reorder` | 캔버스 순서 변경(`{order:[id...]}`) |
| `meta` | library/activeId만 갱신(`{meta}`) |
| `putimg` | 사용자 이미지 1건 저장(`{id, src}` — 각 <128KB) |

GET (파라미터 없음) — `map_data.json` 반환(없으면 `null`). GET `?images=1` — `map_images.json` 반환(사용자 이미지 전체). GET `?check=1` — 쓰기 키 유효성.

### 자동저장

편집(노드·엣지·뷰 변경) 시 `markDirty()` 호출 → 디바운스 후 `writeBackActive()` → `upsert` POST. 저장 상태는 UI에 `● 저장됨` / `● 저장 중…` / `● 오프라인` 으로 표시.

### 인증

`map_key.txt`가 존재하면 POST 요청 `X-Write-Key` 헤더를 검증(불일치 403). fail-open — 파일 없으면 쓰기 개방. 추후 로그인 UI 예정.

### Graceful Degradation

`api.php`에 접근 불가(`file://` 직접 열기, 서버 오류 등) → `SERVER_OK = false` → 메모리 모드로 폴백. 모든 편집·다중 캔버스 기능은 동작하나 새로고침 시 초기화. UI 좌상단에 `● 오프라인` 배지 표시. JSON 내보내기로 수동 백업 가능.

### 이미지 분리저장 레이어

- **빌트인 이미지** (`vdi_login`, `vdi_dash`, `myportal`, `myaccess`): `map.html` 내에 base64 dataURL로 내장. `IMAGES` 맵에 직접 등록.
- **사용자 이미지**: 드롭/업로드 시 `downscaleImage(src,cb)` → 최대 1000px·JPEG(품질 0.82부터 <120KB 될 때까지 하향) → `putImg(id, dataURL)` → `POST {op:'putimg', id, src}` 로 `map_images.json`에 개별 저장. 로드 시 `loadImages()` → `GET ?images=1` → `IMAGES` 맵에 병합.
- `node.thumb = {imgId, label}` — 실제 dataURL은 저장되지 않음. 렌더 시 `imgSrc(imgId)` 로 `IMAGES`에서 조회.
- **cafe24 POST 128KB 상한 회피**: 이미지를 개별 `putimg` op로 분리하면 각 POST 본문이 <128KB 유지됨. 캔버스·메타 JSON에는 `imgId` 참조만 포함되어 자동저장 POST도 128KB 미만 유지.

## 인터랙션 (현재 구현됨)

- 배경 드래그 = 화면 이동(팬). `Space+드래그` / 휠클릭도 팬.
- 휠 = 커서 기준 줌(0.3~2.4x).
- **Ctrl(⌘)+드래그 = 영역 다중선택**(마퀴). 이때 팬 안 됨. **도구 팔레트 `영역 선택`(`TOOLBAR.selectMode`, 영속)**을 켜면 일반 배경 드래그도 마퀴(= Ctrl+드래그와 동일).
- 카드 전체 드래그로 이동(임계 4px — 그 미만 클릭은 선택). 다중선택 상태면 함께 이동.
- **노드 클릭이 텍스트 편집보다 우선**: 단일 클릭=선택/이동(캡션 mousedown `preventDefault`로 캐럿 차단), **더블클릭=편집 진입**(`caretRangeFromPoint`로 클릭 위치에 캐럿).
- **자석 스냅**: `TOOLBAR.snap` 활성 시 노드 드래그 중 다른 노드와 x/y 정렬이 맞으면 스냅 + 노란 가이드선(`#snapV`/`#snapH`) 표시.
- 카드 클릭 = 선택(골드 링). Shift+클릭 = 토글. 빈 곳 클릭 = 해제.
- **단일 선택 시 카드 위 라벨형 노드 툴바**(`drawNhud`→`.nbar`): `상위`(addParent)·`하위`(addChild)·`삭제` 버튼 + 배경색 스와치(`n.bg`). 노드엔 상시 코너 버튼 없음(삭제는 툴바/`Del`).
- 노드 4면 포트(hover 시 표시)를 **실제로 드래그**(임계 6px — 단순 포트 클릭은 무시) → **4점 자석**: 대상 노드 위에선 가장 가까운 포트로 흡착(포트 하이라이트), 노드 중앙부에 놓으면 `auto`(최단 연결면). 빈 곳이면 새 노드 생성+연결.
- 연결선 클릭 = 선택 → **라벨형 미니 HUD 툴바**(`.ebar`): `삭제`·`방향`·`실선/점선`·`화살표`·`굵기(1·2·3)`·**`곡선/직각`**(라우팅 토글)·**`라벨`**(추가·편집). 양 끝 핸들 **드래그**(임계 6px)로 4점 자석 재부착.
- **직각 라우팅**(`e.route='ortho'`): `orthoPath`+`polyPath`(모서리 둥근 꺾은선). 곡선은 베지어. `edgeGeo`가 분기.
- **연결선 라벨**(`e.label`): `drawLabels()`가 라벨 있는 모든 엣지의 중앙에 `.elabel` pill 렌더(편집은 contenteditable, 빈 값이면 제거). `라벨` 버튼이 빈 라벨 생성 후 포커스.
- **캔버스 배경색**: 헤더 `배경` 버튼 → 스와치 팝오버(`#bgPop`, `CANVAS_BGS`), 캔버스별 `canvas.bg`로 영속(`applyCanvasBg`).
- **다중 선택(2개↑) 정렬·배포**: 선택 묶음 위 `.abar` 툴바(좌/가운데/우·상/가운데/하 정렬 + 가로/세로 등간격). `alignSel(mode)`.
- **내보내기**: 헤더 `내보내기 ▾` → PNG 이미지 / SVG 벡터 / JSON. 상태를 벡터 SVG로 재드로잉(`buildSVG`) 후 PNG는 브라우저 래스터화(라이브러리 없음). 썸네일은 dataURL로 임베드 → canvas 타인트 없음.
- **되돌리기/다시실행**: `Ctrl+Z` / `Ctrl+Shift+Z`(또는 `Ctrl+Y`), 헤더 `↶`/`↷` 버튼. 캔버스별 스택(전환 시 초기화).
- 단축키(노드 선택 후): `Tab` = 하위 mini 노드 추가, `Enter` = 형제 mini 노드 추가, `−` 하위, `+` 상위, `G` 그룹(2개 이상), `Del` 삭제(선택 엣지 우선), `Esc` 해제.
- 썸네일: 왼쪽 라이브러리에서 카드로 드래그(또는 OS 이미지 파일 드롭). 카드 썸네일 클릭 = 원본 라이트박스.
- **플로팅 도구 팔레트**(캔버스 좌상단, `.stage` 내부 `position:absolute`): **도구** 섹션(영역 선택·자석 정렬·기본 노드·중간 노드 — **선/화살표는 제거**, 연결선 클릭 HUD에서 적용)과 **아이콘** 섹션을 헤더(`.tr-gh`)로 구분. `body.view`(보기 모드)에선 숨김.
- **아이콘 팔레트**(도구 팔레트 하단 섹션): 20종 아이콘 **3열 그리드(스크롤 없음, 전체 노출)** → 클릭/드래그 시 icon 타입 노드를 캔버스 중앙에 추가. 한글 툴팁은 `ICON_LABELS` 맵.
- 편집/보기 토글, 사이드바 접기, 가로/세로 자동정렬.

## 작성 도구 (툴 레일·노드 타입·아이콘)

### 도구 팔레트 (캔버스 좌상단 플로팅)

`.stage` 내부에 `position:absolute`로 떠 있는 카드(`.toolrail`). **도구**·**아이콘** 두 섹션(`.tr-group`)을 헤더(`.tr-gh`)로 구분한다. 도구 버튼(`.trbtn`)은 글리프(`.tr-ico`) + **이름 라벨**(`.tr-name`) 행 형태 — 기능을 직관적으로 드러낸다. 상태는 `TOOLBAR` 전역 객체에 보관.

| 버튼(라벨) | 동작 | 상태 필드 |
|---|---|---|
| 영역 선택 | 배경 드래그를 마퀴 선택으로(Ctrl+드래그와 동일) | `TOOLBAR.selectMode` (bool, 영속) |
| 자석 정렬 | 노드 드래그 시 정렬 스냅 + 가이드선 | `TOOLBAR.snap` |
| 선: 실선/점선 | 새로 그릴 엣지의 기본 스타일 전환(라벨·글리프가 현재 상태 반영) | `TOOLBAR.edgeStyle` |
| 화살표 머리 | 새로 그릴 엣지에 화살표 머리 표시 여부 | `TOOLBAR.edgeArrow` |
| 기본 노드 / 중간 노드 | full / mini 노드를 캔버스 중앙에 추가 | — |
| 아이콘(섹션) | `ICONS` 20종 3열 그리드 → 클릭 시 icon 노드 추가 | — |

`TOOLBAR`는 `saveMeta()`로 서버 `meta.toolbar`에 영속되며, `exportJSON()`으로 내보낸 JSON에도 포함된다. 불러오기 시 `d.toolbar`가 있으면 `Object.assign(TOOLBAR, d.toolbar)` 후 `renderToolbar()`로 UI 갱신.

### 노드 타입

| type | 외형 | 용도 |
|---|---|---|
| `"full"` | 기본 카드 (썸네일+제목+설명) | 주요 단계 노드 |
| `"mini"` | 작은 카드 (제목만) | 보조/중간 단계 |
| `"icon"` | 아이콘(상단) + 라벨 | 시스템/역할 표시 |

- `Tab` 단축키 → `addChildMini` (선택 노드의 하위 mini 노드 추가 + 연결)
- `Enter` 단축키 → `addSiblingMini` (선택 노드와 같은 레벨의 형제 mini 노드 추가 + 연결)
- `addMiniCenter()` — 도구 팔레트 버튼으로 캔버스 중앙에 mini 노드 추가

### 아이콘 세트 (`ICONS`)

`ICONS` 상수에 20종의 아이콘이 `id: "<svg 내부 마크업>"`(path/shape 문자열) 형태로 정의됨. `iconSvg(id)` 함수가 `viewBox 0 0 24 24 · stroke=currentColor` 래퍼로 감싸 SVG 문자열 생성. `renderPalette()`로 팔레트 그리드 렌더. `addIconCenter(iconId)`로 `type:"icon"` 노드를 캔버스 중앙에 삽입. 외부 아이콘 라이브러리 금지(직접 path 작성).

## 썸네일 / 이미지

- 빌트인 4종(`vdi_login`, `vdi_dash`, `myportal`, `myaccess`)은 `map.html` 내에 base64 dataURL로 내장. `IMAGES` 맵에 직접 등록되며 서버 저장 대상 아님.
- `defaultState()`가 이 id들로 기본 노드의 `thumb.imgId`를 설정.
- 사용자 이미지 추가: 사이드바 `＋ 이미지 추가` 또는 노드에 OS 이미지 파일 드롭 → `downscaleImage` → `putImg` → 서버(`map_images.json`) 저장.
- `doc.meta.library`(서버)에는 사용자 이미지의 `{id, label}` 목록만 보관. 실제 dataURL은 `map_images.json`에서 별도 로드.
- 원본 png에서 재생성했던 절차(참고): PIL로 width 1200·JPEG q82 리사이즈 → base64 → 내장. 지금은 이미 내장돼 있어 재생성 불필요.
- **레거시 포맷 주의**: 구버전 JSON 내보내기에서 `thumb.src`(인라인 dataURL)를 포함한 경우, import 시 `imgId`가 없어 썸네일이 공백으로 표시(graceful degradation — 나머지 데이터는 정상).

## 기본 다이어그램 (defaultState)

진입 3분리가 합류 후 직선 흐름, 끝에서 분기:
`씬클라이언트 / 물리PC / (재택→마이엑세스)` → **사용자VDI포탈 로그인** → 2차 보안 인증 → 내 가상PC 접속 → 업무수행(마이포탈) → 가상화 사용자 포탈 → 부서장 결재 → 완료.

## 제약 / 주의

- **localStorage/sessionStorage 사용 금지**: claude.ai 미리보기 샌드박스에서 실패함. 자체 호스팅/로컬에서는 동작하나, 미리보기 호환을 위해 현재는 사용하지 않음. 서버 저장은 `api.php`로 처리(자체 호스팅). 미리보기/`file://`에선 메모리 모드로 자동 폴백.
- **POST 본문 <128KB 유지**: cafe24 openresty는 POST 본문 >128KiB(131072B)를 404로 거부. 이미지는 `putimg` op로 개별 분리 저장(각 <128KB). 캔버스·메타 JSON에 이미지 dataURL을 포함하지 말 것 — `imgId` 참조만 허용.
- 엣지 SVG는 `left/top:-10000, 20000×20000, overflow:visible`로 깔고 `#edgeG`를 `translate(10000,10000)`. 히트영역(`.eh`)만 `pointer-events:stroke`, 컨테이너는 `none`. 이 구조 유지해야 선 클릭과 노드/팬이 안 충돌함.
- 줌 선명도: `.world`에 `will-change:transform`을 **넣지 말 것**(레이어 캐싱되면 줌 시 흐려짐). 현재 빠져 있음.
- 좌표 기반 `nodeAt()`로 연결 드롭 처리(겹친 선/핸들에 안 가로채임). `elementFromPoint`로 되돌리지 말 것 — 1:n 연결 깨짐.

## 다음 작업 후보 (로드맵)

- ~~서버 저장 / 캔버스 관리 / 이미지 분리저장~~ ✅ 완료
- ~~연결선 화살표 머리(방향 표시) + 실선/점선 스타일 토글~~ ✅ 완료
- ~~노드 타입 mini/icon + 단축키(Tab/Enter) + 좌측 툴 레일 + 자석 스냅 + 아이콘 팔레트~~ ✅ 완료
- ~~플로팅 도구 팔레트(도구/아이콘 분리·라벨) + 노드 배경색 + 엣지 굵기 3단계 + 끝점 재연결 auto 최단면 + 영역 선택 도구~~ ✅ 완료
- ~~되돌리기/다시실행(Ctrl+Z) + 연결 임계(포트 클릭 오작동 방지) + 노드 클릭 우선·더블클릭 편집 + 노드 ＋ 추가 버튼~~ ✅ 완료
- ~~**스쿱보드 리브랜드**(MoneyScoop 테마·워드마크·홈링크) + 라벨형 HUD 툴바(노드/엣지) + 4점 자석 + 캔버스 배경색 + 팔레트 정리(선/화살표 제거)~~ ✅ 완료
- ~~연결선 라벨 + 직각(꺾은선) 라우팅~~ ✅ 완료
- ~~PNG/SVG 내보내기 + 정렬·등간격 배포~~ ✅ 완료 — **브레인스토밍 합의 기능 전부 구현 완료**
1. 직각(꺾은선/orthogonal) 연결선 스타일 토글.
2. 연결선 라벨(예: "승인"/"반려") 추가·편집.
3. 노드 리사이즈(너비/높이 핸들 드래그).
4. `autoLayout`에 그룹 단위 정렬 반영, 레이어 내 교차(겹침) 최소화.
5. 캔버스 순서 변경 UI(드래그 reorder — `reorder` op는 API에 구현됨, UI 미구현).
6. 카드 드래그로 그룹 멤버십 변경 / 그룹 박스 통째 이동.
7. PNG/SVG 내보내기(발표용).

## 작업 팁

- 구조 변경은 `render()` 호출, 좌표만 바뀌면 `paint()`만 호출(가볍게).
- 새 노드/엣지 추가 시 `id`는 `uid('n'|'e'|'g')`로. 엣지엔 `fromSide/toSide` 항상 지정(기본 right/left).
- 불러오기 시 구버전 호환 위해 `state.edges`에 `fromSide/toSide` 기본값 보정 로직 있음(유지).
