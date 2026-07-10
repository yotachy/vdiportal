# PotFlow — 자동 썸네일(ffmpeg 없이)·창배치 견고화·그룹 일괄재생 · 설계

- 작성일: 2026-07-11
- 대상: `map/potflow.html` + `map/potflow-helper.py`

---

## A. 썸네일 자동화 (ffmpeg 없이도)
현상: 동영상·pbf 썸네일이 자동으로 안 뜸. 원인: `/thumb`·`bookmark_thumb`가 ffmpeg 의존 → ffmpeg 미설치 시 실패.

- **헬퍼 `GET /file?path=`**: 로컬 파일을 스트리밍(Range 지원 → `<video>`가 앞부분만 받아 프레임 추출 가능). Content-Type은 확장자로. Host 가드 뒤.
- **클라 폴백**: `captureThumbURL(url, id, seekSec)`(기존 `captureThumb(file,...)`를 URL 기반으로 일반화 — objectURL 대신 URL, `<video muted preload=metadata>` → loadeddata에서 seek → seeked에서 canvas 320px → `putImg`). 8초 타임아웃·에러 시 조용히 무시.
  - `requestThumb`: `/thumb`(ffmpeg) 성공이면 그대로, **실패(!ok)면** `captureThumbURL(HELPER+'/file?path='+enc(path), id, 5)` 폴백.
  - `syncBookmarks`: 책갈피 `b.thumb`가 있으면 사용(pbf 내장), **없으면** `captureThumbURL(HELPER+'/file?path='+enc(video), childId, b.ms/1000)` 폴백(그 지점 프레임).
- 한계 명시: 브라우저 폴백은 브라우저가 디코드 가능한 코덱(mp4/h264/webm 등)만. mkv/avi는 ffmpeg 필요(없으면 공백). ffmpeg 있으면 종전대로 전 포맷.

## B. 창 배치 견고화 (`arrange_windows`)
현상: 배치가 제대로 안 됨. 원인 후보: 구버전 헬퍼(ctypes 오버플로, 이미 수정) / PotPlayer 창이 1.2초 뒤에도 안 떠 위치 지정 실패 / 다중 인스턴스 미허용.

- `arrange_windows`를 **폴링 재시도**로: 단일 `sleep(1.2)+1회 EnumWindows` → 최대 ~6초 동안 여러 번(예: 0.5초 간격 12회) EnumWindows 돌며 아직 배치 안 된 pid를 찾으면 `SW_RESTORE`+`SetWindowPos`. 모든 pid 배치되면 조기 종료. (늦게 뜨는 창 대응)
- ctypes 인자타입/`c_void_p` 래핑(수정 완료) 유지.
- 문서/토스트로 "다중 인스턴스 허용" 안내 유지(단일 인스턴스면 창이 1개로 합쳐져 배치 불가).

## C. 그룹 일괄재생 + 그리드 자동배열
- 그룹 데이터에 `grid:[cols,rows]|null`(null=개수 자동 타일) 추가.
- **그룹 툴바**(그룹 상단, `groupHTML`/전용 렌더): 제목 + **▶ 일괄재생** 버튼 + **그리드 선택**(현재값 표시, 클릭 시 `자동→2×1→2×2→3×2→3×3→4×2…` 순환 또는 팝오버) + 기존 ✕.
- `playGroup(gid)`: 그룹의 **영상 노드**(videoPath 보유, group.nodes 순서)를 모아, `grid`(없으면 `tile_rects` 개수자동에 상응하는 격자) 셀을 순서대로 `win={mon:0, x:col/c, y:row/r, w:1/c, h:1/r}`로 지정한 items → `playItems`. 헬퍼가 각 창을 그 셀에 배치.
- 그리드 프리셋은 기존 `WP_GRIDS` 재사용.

## 디자인/제약
- 바닐라 JS·단일 파일·표준라이브러리만. 좌측 accent 라인 금지. 한국어 UI. Host 가드·CORS 유지.
- 수정 파일: potflow-helper.py / potflow.html / test_potflow_helper.py.
- 배포: cafe24 `www/map/`(부트스트래퍼 자동 최신화).

## 테스트
- 헬퍼: `/file` Range 응답(부분/전체)·순수 `content_type_for(name)`; arrange 재시도는 I/O(구조 검토).
- 클라: `node --check` + 헤드리스(그룹 툴바 일괄재생/그리드 버튼 렌더). 실제 썸네일 폴백/창배치는 로컬 수동.

## 범위 밖
- ffmpeg 자동 다운로드(대용량). mkv 브라우저 디코드. 그룹 다중 모니터 분산.
