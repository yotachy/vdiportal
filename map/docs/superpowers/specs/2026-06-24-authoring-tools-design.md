# 다이어그램 작성 도구 강화 — 설계

- 날짜: 2026-06-24
- 대상: `map/map.html` (KB VDI 접속 흐름 다이어그램 빌더)
- 목적: 연결선 방향·스타일, 노드 타입(중간/아이콘), 좌측 툴 레일, 자석 정렬, 아이콘 팔레트 추가

## 배경

현재 `map.html`은 단일 노드 타입 + 방향 표시 없는 베지어 연결선만 지원한다. 사용자는 (1) 연결 시작/끝 구분과 점선·실선·화살표선, (2) 작은 '중간 노드' 타입과 Tab 단축키, (3) 좌측 세로 도구모음, (4) 카드 자석 정렬, (5) 캔버스에 넣는 플랫 아이콘 팔레트를 요청했다. 단일 파일·바닐라 JS·무빌드·다크+골드 토큰·이미지 분리저장(POST <128KB) 제약은 유지한다.

## 결정 사항 (사용자 확정)

1. 중간 노드 = 제목만 있는 작은 카드. `Tab` = 하위에 중간 노드 추가·연결(현 Tab=형제 의미 변경).
2. 도구모음 = 좌측 세로 툴 레일(기존 사이드바 왼쪽 신설).
3. 아이콘 = 아이콘 노드 유형(팔레트에서 드래그/클릭 → 캔버스에 icon 노드 생성).
4. 추가 기본값: `Enter` = 형제 중간 노드, 새 엣지 기본 = 실선 + 끝 화살표, 자석 기본 on.

## 데이터 모델 확장

```js
node = { id, x, y, title, desc, thumb:{imgId,label}|null,
         type:'full'|'mini'|'icon',   // 미지정 → 'full'
         iconId:'pc'|... }            // type==='icon' 일 때만
edge = { id, from, fromSide, to, toSide,
         style:'solid'|'dashed',      // 미지정 → 'solid'
         arrow:true|false }           // 미지정 → true (끝 화살표)
meta.toolbar = { snap:true, edgeStyle:'solid', edgeArrow:true }  // 툴바 기본값(영속, 작음)
```

- 모든 신규 필드는 작은 스칼라 → POST <128KB 무관. 이미지 분리저장 구조 유지.
- 구버전 호환: 로드/생성 시 `type` 없으면 `full`, `edge.style` 없으면 `solid`, `edge.arrow` undefined면 `true`로 보정(기존 `fromSide/toSide` 보정 로직 옆에 추가).

## 1. 연결선 강화

- **방향 표시**: 끝점 화살표 머리(▶) + 시작점 작은 점. SVG `<defs><marker>` 2종(엣지색용 `arrow`, 선택 골드용 `arrowSel`); 보이는 path(`.ew`)에 `marker-end` 적용(arrow=true일 때). `⇄` 방향전환 시 from/to·side 스왑으로 화살표도 자동 반전.
- **선 스타일**: `style==='dashed'`면 path에 `stroke-dasharray:7 5`. solid면 없음.
- **적용 단위**: 엣지 선택 시 `drawEhud()`가 그리는 중앙 컨트롤에 기존 `✕`(삭제)·`⇄`(반전) 옆에 **선 토글**(실선↔점선)·**화살표 토글** 버튼 추가. 클릭 시 해당 엣지 필드 변경 + `paint()` + `markDirty()`.
- **새 엣지 기본값**: `addEdge()`가 `meta.toolbar.edgeStyle`·`edgeArrow`를 적용.

## 2. 노드 타입 + 단축키

- **mini 노드**: 작은 카드 — 제목 한 줄(contenteditable)만, 설명·썸네일·드롭 영역 없음, 폭 축소(예 ~150px), 4면 포트 유지. `.node.mini` 클래스.
- **icon 노드**: 상단 아이콘(48px, 인라인 SVG `iconId`) + 아래 라벨(제목, contenteditable). 설명·썸네일 없음. `.node.icon` 클래스. 연결·이동·선택 일반 노드와 동일.
- **nodeHTML()** 분기: type별로 다른 내부 마크업 렌더. full은 현행 유지.
- **makeNode(x,y,title,type,iconId)**: type 인자 추가(기본 full).
- **단축키 재배치**(마인드맵 관례):
  - `Tab` = 하위(child)에 **mini** 노드 추가·연결 (현 Tab=sibling → child로 의미 변경)
  - `Enter` = 형제(sibling) **mini** 노드 추가·연결 (isEditing 아닐 때만)
  - `−` = 하위 full 노드(유지), `+` = 상위 full 노드(유지), `G`/`Del`/`Esc` 유지
  - `addChildMini(id)`/`addSiblingMini(id)` 신규. 기존 `addChild`/`addSibling`(full)은 −/그대로.

## 3. 좌측 세로 툴 레일

- 신설 `.toolrail`(~56px), 레이아웃 `[toolrail 56][sidebar 226][stage]`로 변경(`.app` grid-template-columns).
- 상단 도구(아이콘 버튼, hover 툴팁):
  - **자석 토글**(`snap` on/off, 활성 골드)
  - **선 기본값**: 실선↔점선 토글 + 화살표 on/off 토글(새 엣지에 적용, `meta.toolbar` 갱신)
  - **＋full 노드**, **＋mini 노드**(화면 중앙에 생성)
- 하단 **아이콘 팔레트**(세로 스크롤): 아이콘 버튼 그리드. 드래그(`dragstart` set `iconid`) → 스테이지 빈 곳 `drop` 시 icon 노드 생성. 클릭 시 화면 중앙에 생성.
- 다크+골드 토큰, 기존 `.btn`/`.seg` 스타일 계열 재사용.
- 사이드바 collapse는 그대로. 툴 레일은 항상 표시(편집 모드). 보기 모드에선 작성 도구 숨김(`.edit-only`).

## 4. 자석(스냅) 정렬

- 노드 드래그(`onMove` type==='node')에서 `snap` on이면: 이동 중인 카드(들)의 좌/우/상/하/가로중심/세로중심 좌표를 다른 카드들의 같은 기준선과 비교, 차이 ≤6px이면 그 값으로 스냅(보정 delta 적용).
- **정렬 가이드선**: 스냅이 걸린 축에 골드 점선(스테이지 오버레이 SVG 또는 절대배치 div) 표시. `onUp`에서 제거.
- 다중 선택 이동 시 그룹 바운딩 기준으로 스냅.
- 툴 레일 자석 토글로 on/off(`meta.toolbar.snap`, 기본 on).
- 성능: 후보 기준선은 드래그 시작 시 1회 수집(다른 노드들의 6개 좌표) → onMove에서 비교만.

## 5. 아이콘 세트 (플랫·통일 디자인)

인라인 SVG ~18종, 모두 `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap/linejoin="round"`(통일 굵기, 다크 골드 토큰):

`pc`(데스크톱) · `laptop` · `thinclient` · `mobile` · `server` · `cloud` · `database` · `monitor`(VDI) · `network` · `user` · `users`(그룹) · `lock`(보안) · `key`(인증) · `decision`(◇) · `start`(둥근사각) · `end` · `process`(사각) · `document` · `warning` · `check`(완료).

- `ICONS = { id: '<svg path markup>' }` 상수. 팔레트·icon 노드 렌더 공용.
- 외부 아이콘 라이브러리 금지(프로젝트 규칙) — 직접 path 작성.

## 6. 영속 / 호환 / 검증

- 저장: node.type/iconId, edge.style/arrow, meta.toolbar 포함(전부 작음). upsert/replace/meta 경로 그대로.
- import/export: 신규 필드 포함. 구버전(필드 없음)은 로드 보정으로 graceful.
- 검증: 헤드리스 CDP로 실서버 — 엣지 화살표/점선 렌더, mini/icon 노드 생성·연결, Tab/Enter, 툴레일 토글, 스냅 가이드, 아이콘 팔레트 드래그, 영속(POST<128KB), JS에러0.

## 보존 제약

- 단일 파일·바닐라 JS·무빌드. 디자인 토큰만. 2-space·큰따옴표.
- 엣지 SVG 구조(`-10000/20000/overflow:visible`+`#edgeG translate`) 유지 — marker는 `<defs>`를 `#edges` SVG 내부에 추가.
- `.world`에 `will-change:transform` 금지. `nodeAt()` 좌표 판정 유지.
- 모든 POST <128KB(이미지 분리저장 유지).

## 단계 구성 (플랜 분할)

1. 연결선 강화(marker 화살표·점선·엣지 선택 컨트롤·기본값).
2. 노드 타입(mini/icon 렌더·makeNode·호환 보정) + 단축키(Tab/Enter).
3. 좌측 툴 레일 UI(레이아웃·자석/선기본값 토글·노드추가·팔레트 골격).
4. 자석 스냅 + 정렬 가이드.
5. 아이콘 세트(ICONS) + 팔레트/아이콘 노드 통합.
6. 영속·호환·문서(CLAUDE.md)·검증·배포.

## 범위 밖 (YAGNI / 향후)

- 곡선/직각 토글, 엣지 라벨(텍스트), 그리드 스냅(여기선 객체 스냅만), 아이콘 색상 커스터마이즈, 노드 리사이즈 핸들.
