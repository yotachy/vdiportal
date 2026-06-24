# CLAUDE.md — 업무가상화(VDI) 접속 흐름 다이어그램 빌더

KB손해보험 업무가상화(VDI) 사용자 접속 흐름을 그리는 **자유 캔버스 노드 다이어그램 빌더**(GitMind 스타일). 단일 HTML 파일, 빌드 도구 없음, 바닐라 JS.

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
  nodes:  [{ id, x, y, title, desc, thumb:{imgId,label}|null }],
  //        thumb.imgId = IMAGES 맵의 키. 빌트인 id('vdi_login' 등) 또는 사용자 업로드 id.
  edges:  [{ id, from, fromSide, to, toSide }],   // *Side: 'top'|'right'|'bottom'|'left'
  groups: [{ id, nodes:[nodeId...], title }],
}
view = { tx, ty, scale }      // 캔버스 팬/줌
sel  = [nodeId...]            // 선택된 노드들
selEdge = edgeId | null       // 선택된 연결선(1개)
IMAGES  = { [id]: dataURL }   // 빌트인(HTML 내장) + 사용자 업로드(api.php ?images=1 로드)
```

- 좌표는 모두 **월드 좌표**. 화면 좌표 변환은 `worldPt(clientX,clientY)`.
- `nodes`/`groups`는 `render()`에서 DOM 재생성, 텍스트 편집은 `focusout`에서 state에 반영(재렌더 없음).
- 노드 높이 `n._h`는 `measure()`가 DOM에서 읽어 캐싱(엣지/그룹 좌표 계산에 사용).
- **`thumb.imgId`** 참조 방식: 렌더 시 `imgSrc(id)`로 `IMAGES` 맵에서 dataURL 조회. 이전 내보내기 포맷(`thumb.src` 인라인)은 import 시 imgId 없이 렌더 → 썸네일 공백(graceful degradation).

## 핵심 함수 맵

| 영역 | 함수 |
|---|---|
| 렌더 | `render()` → `measure()` → `paint()` → `applySel()` → `applyView()` |
| 그리기 | `paint()` = 엣지(`ew` 보이는선 + `eh` 히트영역) + `layoutGroups()` + `drawEhud()` |
| 엣지 기하 | `edgeGeo(e)`(4면 베지어), `anchor(n,side)`, `nearestSide(n,pt)`, `DIR` |
| 노드 판정 | `nodeAt(pt)` — 좌표로 노드 탐색(연결 드롭/하이라이트에 사용, elementFromPoint 안 씀) |
| 포인터 | `stage.pointerdown` 디스패치 → `startPan/startMarquee/startLink/startEndpoint/nodePointerDown` → `onMove/onUp` |
| 노드 편집 | `world` 위임: `click`(del/rmthumb/그룹·엣지 버튼), `focusout`(title/desc/그룹 라벨) |
| 추가/연결 | `makeNode`, `addEdge(from,fromSide,to,toSide)`, `addSibling/addChild/addParent` |
| 정렬/뷰 | `autoLayout('h'|'v')`(레이어 배치), `fitView()`, `zoomBy(f)` |
| 입출력 | `exportJSON()`, 불러오기(`impFile` change), `resetAll()` |
| 서버 저장 | `boot()`, `loadCanvas(id)`, `writeBackActive()`, `markDirty()`, `saveMeta()` |
| 캔버스 관리 | `switchCanvas(id)`, `newCanvas()`, `renameCanvas(id,title)`, `deleteCanvas(id)`, `renderSidebar()` |
| 이미지 | `imgSrc(id)`, `putImg(id,dataURL)`, `downscaleImage(file)`, `loadImages()` |
| 기타 | `zoom(id)`(라이트박스), `toast(msg)`, `toggleSide()`(사이드바 접기) |

## 서버 저장 / 캔버스 관리

### 서버 문서 구조 (`map_data.json`)

```js
doc = {
  canvases: [{ id, title, nodes, edges, groups, view, updated }],
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
| `reorder` | 캔버스 순서 변경(`{ids:[...]}`) |
| `meta` | library/activeId만 갱신(`{meta}`) |
| `putimg` | 사용자 이미지 1건 저장(`{id, src}` — 각 <128KB) |

GET `?images=1` — `map_images.json` 반환(사용자 이미지 전체). GET `?full=1` — `map_data.json` 반환.

### 자동저장

편집(노드·엣지·뷰 변경) 시 `markDirty()` 호출 → 디바운스 후 `writeBackActive()` → `upsert` POST. 저장 상태는 UI에 `● 저장됨` / `● 저장 중…` / `● 오프라인` 으로 표시.

### 인증

`map_key.txt`가 존재하면 요청 `Authorization: Bearer <key>` 헤더 검증(fail-open — 파일 없으면 인증 생략). 추후 로그인 UI 예정.

### Graceful Degradation

`api.php`에 접근 불가(`file://` 직접 열기, 서버 오류 등) → `SERVER_OK = false` → 메모리 모드로 폴백. 모든 편집·다중 캔버스 기능은 동작하나 새로고침 시 초기화. UI 좌상단에 `● 오프라인` 배지 표시. JSON 내보내기로 수동 백업 가능.

### 이미지 분리저장 레이어

- **빌트인 이미지** (`vdi_login`, `vdi_dash`, `myportal`, `myaccess`): `map.html` 내에 base64 dataURL로 내장. `IMAGES` 맵에 직접 등록.
- **사용자 이미지**: 드롭/업로드 시 `downscaleImage(file)` → width 1200·JPEG q82 리사이즈 → `putImg(id, dataURL)` → `POST {op:'putimg', id, src}` 로 `map_images.json`에 개별 저장. 로드 시 `loadImages()` → `GET ?images=1` → `IMAGES` 맵에 병합.
- `node.thumb = {imgId, label}` — 실제 dataURL은 저장되지 않음. 렌더 시 `imgSrc(imgId)` 로 `IMAGES`에서 조회.
- **cafe24 POST 128KB 상한 회피**: 이미지를 개별 `putimg` op로 분리하면 각 POST 본문이 <128KB 유지됨. 캔버스·메타 JSON에는 `imgId` 참조만 포함되어 자동저장 POST도 128KB 미만 유지.

## 인터랙션 (현재 구현됨)

- 배경 드래그 = 화면 이동(팬). `Space+드래그` / 휠클릭도 팬.
- 휠 = 커서 기준 줌(0.3~2.4x).
- **Ctrl(⌘)+드래그 = 영역 다중선택**(마퀴). 이때 팬 안 됨.
- 카드 전체 드래그로 이동(임계 4px — 그 미만 클릭은 선택/편집). 다중선택 상태면 함께 이동.
- 카드 클릭 = 선택(골드 링). Shift+클릭 = 토글. 빈 곳 클릭 = 해제.
- 노드 4면 포트(hover 시 표시) 드래그 → 다른 노드면 연결(놓은 위치 최근접 면에 부착), 빈 곳이면 새 노드 생성+연결.
- 연결선 클릭 = 선택 → 중앙 `✕`(삭제)·`⇄`(시작/끝 방향 바꾸기), 양 끝 핸들 드래그로 다른 노드/면 재부착.
- 단축키(노드 선택 후): `Tab` 형제, `−` 하위, `+` 상위, `G` 그룹(2개 이상), `Del` 삭제(선택 엣지 우선), `Esc` 해제.
- 썸네일: 왼쪽 라이브러리에서 카드로 드래그(또는 OS 이미지 파일 드롭). 카드 썸네일 클릭 = 원본 라이트박스.
- 편집/보기 토글, 사이드바 접기, 가로/세로 자동정렬.

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
1. 연결선 화살표 머리(방향 표시) — `⇄` 방향 전환 효과가 시각적으로 드러남.
2. 직각(꺾은선/orthogonal) 연결선 스타일 토글.
3. 연결선 라벨(예: "승인"/"반려") 추가·편집.
4. `autoLayout`에 그룹 단위 정렬 반영, 레이어 내 교차(겹침) 최소화.
5. 캔버스 순서 변경 UI(드래그 reorder — `reorder` op는 API에 구현됨, UI 미구현).
6. 카드 드래그로 그룹 멤버십 변경 / 그룹 박스 통째 이동.
7. PNG/SVG 내보내기(발표용).

## 작업 팁

- 구조 변경은 `render()` 호출, 좌표만 바뀌면 `paint()`만 호출(가볍게).
- 새 노드/엣지 추가 시 `id`는 `uid('n'|'e'|'g')`로. 엣지엔 `fromSide/toSide` 항상 지정(기본 right/left).
- 불러오기 시 구버전 호환 위해 `state.edges`에 `fromSide/toSide` 기본값 보정 로직 있음(유지).
