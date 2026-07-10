# PotFlow — 직접 드래그 자동 식별 + 컴팩트 정렬 목록 · 설계 문서

- 작성일: 2026-07-10
- 대상: `map/potflow.html` + `map/potflow-helper.py` (기존 PotFlow 확장)
- 선행: [2026-07-10-potflow-design.md](2026-07-10-potflow-design.md) 완료본 위에 얹는 증분 기능.

---

## 1. 목적

1. **OS 파일 직접 드래그**(파일탐색기/바탕화면에서 캔버스로) 시에도 정보를 자동으로 끌어온다 — 노드에 **경로 자동 지정 + 썸네일 자동 식별**.
2. **오른쪽 파일탐색기 목록**을 컴팩트하게 + **정렬**(이름·크기·확장자·수정일). 목록에서 캔버스로 드래그하면 위 자동 식별과 동일하게 동작(이미 실경로 보유 → 완전 자동).

## 2. 근본 제약과 해법

브라우저는 OS에서 **직접 드래그**한 파일의 **절대경로를 넘겨주지 않는다**(파일명·크기·바이트만 제공). PotPlayer 재생엔 절대경로가 필수. 해법: 직접 드래그 시 **헬퍼가 파일명+크기로 자동 탐색**해 경로를 복원(사용자 승인 방식).

## 3. 헬퍼 변경 (`potflow-helper.py`)

### 3-1. `/tree` 응답 확장
각 파일 엔트리에 `mtime`(수정 시각, epoch float)·`ext`(소문자 확장자, 점 제외) 추가. 기존 `name`/`path`/`size` 유지. 폴더 엔트리는 그대로.
```json
{"name":"a.mkv","path":"D:\\v\\a.mkv","size":123,"mtime":1720000000.0,"ext":"mkv"}
```
- 순수함수 `scan_tree`가 `os.path.getmtime`로 채움(실패 시 0). 정렬은 클라이언트가 수행.

### 3-2. 신규 `POST /resolve` `{name, size, base}`
- `base`(현재 열어둔 폴더 경로)를 **재귀 탐색**(`os.walk`)해 파일명==`name` AND 크기==`size` 인 파일을 찾는다.
- **유일 매칭** → `{ok:true, path}`. **없음/2개↑** → `{ok:false, matches:n}`.
- `base`가 비어있거나 없으면 CONFIG `SEARCH_ROOTS`(기본 `[]`) 각 루트를 탐색.
- **성능 상한**: 스캔 파일 최대 `RESOLVE_MAX_FILES`(기본 20000)·2번째 매칭 발견 즉시 중단(ambiguous). 상한 초과 시 `{ok:false, error:"too many files"}`.
- 순수함수 `resolve_path(name, size, roots, cap) -> (path|None, matches:int)` 로 분리해 테스트.

## 4. 클라이언트 — OS 파일 직접 드래그 (`potflow.html`)

`stage`의 기존 drop 핸들러에 **OS 파일 경로**(`e.dataTransfer.files`) 처리를 추가:
- 드롭된 각 파일 중 동영상 확장자만 대상. 노드 위 드롭 → 그 노드에 지정, 빈 곳 → 새 노드 생성(여러 파일=계단식).
- 각 파일: `POST /resolve {name, size, base:rsPath현재값}`.
  - **유일 매칭** → `bindVideoToNode(id, path, name)` (경로 지정 + `/thumb` 썸네일 자동) = 완전 자동.
  - **실패** → 노드 제목=파일명, `captureThumb(file, id)` **브라우저 프레임 캡처**(`<video>`+canvas, blob URL; mp4/webm 등만, 실패 시 공백) + 토스트 `경로 미확인 — 오른쪽 목록에서 드래그해 지정하세요`.
- 대용량 업로드 없음(바이트는 브라우저 내에서만 썸네일에 사용, 경로는 헬퍼 탐색).
- 기존 사이드바-목록 드래그(`text/potflow-video`) 경로는 그대로(실경로 → 완전 자동).

### `captureThumb(file, nodeId)` (신규, 헬퍼 불필요)
`URL.createObjectURL(file)` → `<video muted>` → `loadeddata`에서 `currentTime=Math.min(5,dur/3)` → `seeked`에서 canvas(320px)로 그려 `toDataURL('image/jpeg')` → `putImg('vthumb_'+id, url)` + `n.thumb` 설정 → `render()`+`markDirty()`. 실패/에러는 조용히 무시. 끝나면 objectURL 해제.

## 5. 클라이언트 — 컴팩트 + 정렬 목록 (`potflow.html`)

- **정렬 상태**: `let rsSort={key:'name', dir:1}` (key∈name/size/ext/mtime, dir 1=오름/-1=내림). 마지막 `/tree` 결과를 `rsData`에 보관해 재정렬 시 재요청 없이 다시 그림.
- **정렬 헤더**(`.rs-head2`): 클릭 가능한 4개 라벨 **이름·크기·확장자·수정일**. 클릭=그 키로 정렬(같은 키 재클릭=방향 토글). 활성 컬럼은 **배경/텍스트 강조 + ▲/▼**(좌측 accent 라인 금지).
- **컴팩트 행**(`.rs-file`): 패딩·폰트 축소, 컬럼 그리드 `이름(1fr, 말줄임) · 크기(우측정렬) · 확장자 · 수정일`. 폴더 행은 상단에 이름순 유지(정렬 대상 아님).
- 표시 포맷: 크기=`fmtSize`(KB/MB/GB), 수정일=`YYYY-MM-DD`(mtime epoch→로컬). 정렬은 파일 목록에만 적용. 드래그·더블클릭 재생 유지.

## 6. 디자인/제약
- 바닐라 JS, 단일 파일, 표준라이브러리만(헬퍼), 외부 라이브러리 없음.
- **좌측 accent 라인 절대 금지**. 활성/정렬표시는 배경·텍스트·화살표(▲▼)로만. 한국어 UI.
- 헬퍼만 수정: potflow-helper.py / potflow.html / test_potflow_helper.py. 기존 map 자산 무수정.
- 배포: 기존과 동일(cafe24 `www/map/`, git+배포 한 세트). potflow_data.json·potflow_thumbs 불가침.

## 7. 테스트 (헬퍼 순수함수)
- `scan_tree`가 mtime·ext 포함(임시 파일 mtime 설정 후 확인).
- `resolve_path`: 유일 매칭→경로, 다중 매칭→(None, 2), 무매칭→(None,0), 상한 동작.

## 8. 범위 밖 (YAGNI)
- 직접 드래그 대용량 파일 바이트 업로드(안 함). 목록 가상 스크롤·다중 열 커스터마이즈. atime(접근일) 정렬(수정일로 확정).
