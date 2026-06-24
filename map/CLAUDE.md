# CLAUDE.md — 업무가상화(VDI) 접속 흐름 다이어그램 빌더

KB손해보험 업무가상화(VDI) 사용자 접속 흐름을 그리는 **자유 캔버스 노드 다이어그램 빌더**(GitMind 스타일). 단일 HTML 파일, 빌드 도구 없음, 바닐라 JS.

## 파일

- `kb-vdi-flow.html` — 전부 들어있는 단일 산출물 (~379KB). HTML+CSS+JS+썸네일(base64) 한 파일.
- 외부 의존성: Pretendard 폰트(CDN `cdn.jsdelivr.net`) 한 개뿐. 그 외 라이브러리 없음.
- 열기: 파일을 브라우저로 직접 열면 동작. 빌드/서버 불필요.

## 작업 원칙 (이 프로젝트 관례)

- 바닐라 JS, 빌드 툴 없음, 단일 파일 유지. 프레임워크/번들러 도입하지 말 것.
- UI 텍스트는 한국어. 다크 테마 + KB 골드(`--gold:#ffbc00`) 토큰 사용.
- 상태는 메모리 보관. 영속화는 JSON 내보내기/불러오기로만 (이유는 아래 "제약" 참고).
- 동작하는 프로토타입 우선. 과한 추상화 지양.

## 데이터 모델 (`<script>` 상단)

```js
state = {
  nodes:  [{ id, x, y, title, desc, thumb:{src,label}|null }],
  edges:  [{ id, from, fromSide, to, toSide }],   // *Side: 'top'|'right'|'bottom'|'left'
  groups: [{ id, nodes:[nodeId...], title }],
}
view = { tx, ty, scale }      // 캔버스 팬/줌
sel  = [nodeId...]            // 선택된 노드들
selEdge = edgeId | null       // 선택된 연결선(1개)
LIBRARY = [{ id, label, src }] // 썸네일 라이브러리 (src는 dataURL)
```

- 좌표는 모두 **월드 좌표**. 화면 좌표 변환은 `worldPt(clientX,clientY)`.
- `nodes`/`groups`는 `render()`에서 DOM 재생성, 텍스트 편집은 `focusout`에서 state에 반영(재렌더 없음).
- 노드 높이 `n._h`는 `measure()`가 DOM에서 읽어 캐싱(엣지/그룹 좌표 계산에 사용).

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
| 기타 | `zoom(id)`(라이트박스), `toast(msg)`, `toggleSide()`(사이드바 접기) |

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

## 썸네일

- 초기 4종이 `LIBRARY` 배열에 base64 dataURL로 내장: `vdi_login`(사용자VDI포탈 로그인), `vdi_dash`(내 가상PC), `myportal`(마이포탈), `myaccess`(마이엑세스).
- `defaultState()`가 이 id들을 `th(id)`로 참조해 기본 노드에 붙임.
- 추가: 사이드바 `＋ 이미지 추가`(메모리). 내보낸 JSON에 `library`가 포함되어 영속.
- 원본 png에서 재생성했던 절차(참고): PIL로 width 1200·JPEG q82 리사이즈 → base64 → `LIBRARY`에 주입. 지금은 이미 내장돼 있어 재생성 불필요.

## 기본 다이어그램 (defaultState)

진입 3분리가 합류 후 직선 흐름, 끝에서 분기:
`씬클라이언트 / 물리PC / (재택→마이엑세스)` → **사용자VDI포탈 로그인** → 2차 보안 인증 → 내 가상PC 접속 → 업무수행(마이포탈) → 가상화 사용자 포탈 → 부서장 결재 → 완료.

## 제약 / 주의

- **localStorage/sessionStorage 사용 금지**: claude.ai 미리보기 샌드박스에서 실패함. 자체 호스팅/로컬에서는 동작하나, 미리보기 호환을 위해 현재는 JSON 내보내기/불러오기만 사용. localStorage 자동저장을 넣을 거면 미리보기 비호환을 감수하거나 try/catch로 가드.
- 엣지 SVG는 `left/top:-10000, 20000×20000, overflow:visible`로 깔고 `#edgeG`를 `translate(10000,10000)`. 히트영역(`.eh`)만 `pointer-events:stroke`, 컨테이너는 `none`. 이 구조 유지해야 선 클릭과 노드/팬이 안 충돌함.
- 줌 선명도: `.world`에 `will-change:transform`을 **넣지 말 것**(레이어 캐싱되면 줌 시 흐려짐). 현재 빠져 있음.
- 좌표 기반 `nodeAt()`로 연결 드롭 처리(겹친 선/핸들에 안 가로채임). `elementFromPoint`로 되돌리지 말 것 — 1:n 연결 깨짐.

## 다음 작업 후보 (로드맵)

1. 연결선 화살표 머리(방향 표시) — `⇄` 방향 전환 효과가 시각적으로 드러남.
2. 직각(꺾은선/orthogonal) 연결선 스타일 토글.
3. 연결선 라벨(예: "승인"/"반려") 추가·편집.
4. `autoLayout`에 그룹 단위 정렬 반영, 레이어 내 교차(겹침) 최소화.
5. localStorage 자동저장(자체 호스팅 전용) + 미리보기 가드.
6. 카드 드래그로 그룹 멤버십 변경 / 그룹 박스 통째 이동.
7. PNG/SVG 내보내기(발표용).

## 작업 팁

- 구조 변경은 `render()` 호출, 좌표만 바뀌면 `paint()`만 호출(가볍게).
- 새 노드/엣지 추가 시 `id`는 `uid('n'|'e'|'g')`로. 엣지엔 `fromSide/toSide` 항상 지정(기본 right/left).
- 불러오기 시 구버전 호환 위해 `state.edges`에 `fromSide/toSide` 기본값 보정 로직 있음(유지).
