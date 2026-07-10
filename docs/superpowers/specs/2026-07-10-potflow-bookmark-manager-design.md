# PotFlow — 영상+책갈피 관리기로 단순화 · 설계 문서

- 작성일: 2026-07-10
- 대상: `map/potflow.html` + `map/potflow-helper.py`
- 성격: 자유 다이어그램 도구 → **영상·책갈피 전용 관리기**로 모델 단순화.

---

## A. 노드 타입 단순화
- 노드 타입 **mini(중간노드)·icon(아이콘)·text(텍스트)** 제거. **`full` 단일 타입**만 사용, UI 명칭은 "노드".
- 도구 팔레트에서 **중간 노드·텍스트·아이콘(섹션 전체)** 버튼 제거. 남기는 것: 영역 선택, 자석 정렬, **노드**(기본 노드→"노드" rename), 선택 복제.
- 관련 함수/단축키 정리: `addChildMini`/`addSiblingMini`(Tab/Enter mini), `addMiniCenter`, `addIconCenter`, 아이콘 팔레트(`renderPalette`/`ICONS` 사용부) 제거 또는 비활성. `nodeHTML`/`_svgNode`의 mini·icon 분기 제거(full만).
- 기본 예시 다이어그램·책갈피 자식은 모두 full이라 영향 없음.

## B. 연결 = 원본↔책갈피 (자동·체인 전용)
- **연결선은 원본 동영상–책갈피 관계로만** 존재. **수동 연결 UI 제거**: 포트 드래그 링크 생성(startLink/startEndpoint/포트 hover), 빈 곳 드롭으로 새 노드+연결, **연결선 클릭 HUD(drawEhud) 편집** 모두 제거/비활성. 엣지 데이터·렌더는 유지(체인 표시용).
- **체인 구조**: 영상 노드가 1번, 그 pbf 책갈피가 **순서대로 2·3·4…번**으로 **일렬 연결**. `syncBookmarks`가 `영상→책1→책2→…→책N` 체인으로 엣지 생성(기존 fan: 영상→각책 → 폐지). 책갈피는 ms 오름차순(순서 보장). 체인 레이아웃(가로 일렬, 영상 아래/오른쪽).
- reconcile 유지: 재동기화 시 순서 반영·추가/삭제, 체인 재구성. 사용자가 옮긴 위치는 유지(신규만 배치).

## C. 오른쪽 사이드바 폭 조절
- `.rside` 좌측 경계에 **드래그 리사이저**(`.rside-gutter`) → 드래그로 폭 변경. `.app` grid 3번째 컬럼 폭을 실시간 갱신. 폭은 localStorage(`potflow_rside_w`)에 영속(범위 220~640px 클램프).

## D. pbf 파일도 탐색기 목록에
- 헬퍼 `scan_tree`: `.pbf` 파일도 목록에 포함(별도 표시). 파일 엔트리에 `kind:"video"|"pbf"` 추가(video는 VIDEO_EXTS, pbf는 `.pbf`).
- 클라 목록: pbf 행은 🔖 아이콘·다른 색으로 구분. **pbf 드래그 → 영상+책갈피 체인 생성**(헬퍼 `/bookmarks?path=<pbf>`가 영상 복원+책갈피 반환 → 영상 노드 만들고 syncBookmarks). pbf 더블클릭 = 그 영상 재생(첫 지점). 정렬은 기존대로(이름/크기/확장자/수정일), pbf도 정렬 대상.

## E. PotPlayer 경로·원클릭(완료)
- 자동탐지(find_potplayer: 경로/이름/PATH/레지스트리) + `potflow-config.txt` 폴백 — **배포 완료**.
- `start-potflow.bat` = 자동다운로드 부트스트래퍼(.bat 하나로 helper·html·config 내려받고 실행) — **배포 완료**. 본 증분엔 코드 변경 없음(참고).

## 디자인/제약
- 바닐라 JS·단일 파일·표준라이브러리만. **좌측 accent 라인 금지**. 한국어 UI. Host 가드·CORS 유지.
- 수정 파일: potflow-helper.py / potflow.html / test_potflow_helper.py.
- 배포: cafe24 `www/map/`. 부트스트래퍼가 자동 최신화하므로 배포만 하면 사용자 자동 반영.

## 테스트
- 헬퍼: `scan_tree`가 pbf 포함·`kind` 필드(임시 .pbf/.mp4 생성 후 확인).
- 클라: `node --check` + 헤드리스(팔레트에 중간/텍스트/아이콘 없음·사이드바 리사이저·체인 렌더). 실제 재생/드래그는 로컬 수동.

## 범위 밖 (YAGNI)
- 아이콘/텍스트/mini 관련 죽은 CSS 완전 제거(비활성만; 폴리시 후속). 다중 pbf 병합. 체인 중간 삽입 편집.
