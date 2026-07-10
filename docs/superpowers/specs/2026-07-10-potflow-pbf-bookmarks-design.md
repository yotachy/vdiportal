# PotFlow — 책갈피(PBF) 하위 노드 자동 생성 · 설계 문서

- 작성일: 2026-07-10
- 대상: `map/potflow.html` + `map/potflow-helper.py` (기존 PotFlow 확장)
- 선행: potflow 본체 + 직접드래그/정렬 증분 완료본.

---

## 1. 목적
동영상에 PotPlayer 책갈피(`.pbf`)가 있으면, 영상 노드 아래에 **책갈피마다 하위 노드**를 자동으로 만들어 보여준다. 각 하위 노드는 **그 지점의 썸네일 + 그 지점부터 재생**(PotPlayer `/seek`). 반영 시점은 **PotPlayer 닫힐 때** + **수동 "책갈피 동기화" 버튼**(+ 영상이 노드에 새로 지정될 때 1회).

## 2. 근거(확인됨)
- PotPlayer는 `/seek=<초>`(또는 `hh:mm:ss`) 커맨드라인으로 특정 지점부터 재생 가능.
- `.pbf`는 INI형(`[Bookmark]` 섹션, `인덱스=밀리초*제목*[base64 JPEG 썸네일]`). 밀리초 저장. 영상 경로는 파일 위치로 연결(파일 옆 저장 가정).

## 3. 헬퍼 변경 (`potflow-helper.py`)

### 3-1. 순수 파서/해석 (테스트 대상)
- `parse_pbf(text) -> [{"ms":int,"title":str,"thumb":str|None}]` — `[Bookmark]` 섹션의 `N=ms*title*thumb` 라인 파싱. `value.split("*",2)`로 ms/title/thumb 분리. thumb는 base64(접두어 없음) 또는 None. **ms 오름차순 정렬**. 파싱 불가 라인은 건너뜀.
- `pbf_for_video(video_path) -> str|None` — 후보 `video_path+".pbf"`, `splitext(video_path)[0]+".pbf"` 중 존재하는 첫 파일.
- `video_for_pbf(pbf_path) -> str|None` — `pbf_path`에서 `.pbf` 제거한 후보가 영상파일로 존재하면 그것. 아니면 같은 폴더에서 basename(확장자 제외)이 같은 VIDEO_EXTS 파일 탐색(첫 매칭).

### 3-2. `GET /bookmarks?path=`
- `path`가 `.pbf`면 pbf로, 아니면 영상으로 간주 → `(video, pbf_path)` 결정.
- pbf 없으면 `{"ok":True,"video":video,"bookmarks":[]}`.
- pbf 파싱 → 각 책갈피 썸네일 결정: **pbf 내장 base64 우선**(→ `"data:image/jpeg;base64,"+b64`), 없으면 **`ffmpeg_thumb_at(video, sec, out)`**(그 지점 프레임, THUMB_DIR 캐시(키=video+ms), 실패 시 null).
- 응답 `{"ok":True,"video":video,"bookmarks":[{"ms","title","thumb":dataURL|null}]}`. 영상 못 찾으면 `{"ok":False,"error":"video not found"}`.
- 순수함수 `ffmpeg_thumb_at_cmd(ffmpeg, video, sec, out)`(테스트) + I/O 래퍼.

### 3-3. `/play` seek 확장
- `POST /play {paths, seek}` — `seek`(초, number)가 있고 `paths` 1개면 커맨드에 `/seek=<초>` 추가. 다중(동시재생)이면 seek 무시.
- `launch_players(paths, seek=None)`. 순수 조립 `player_cmd(exe, path, seek) -> [..]`(테스트).

### 3-4. 재생 종료 추적 + `POST/GET /playdone`
- `/play`가 실행한 프로세스(Popen 객체)를 `token`(증가 카운터 문자열)에 저장. 데몬 스레드가 각 proc `.wait()` → 모두 종료 시 `done=True`.
- `/play` 응답에 `token` 포함(단일·다중 공통). 추적 저장 `PLAYS[token]={procs, done, video}`.
- `GET /playdone?token=` → `{"done":bool}`. `done`이면 반환 후 해당 항목 제거(재폴링 방지). token 미존재면 `{"done":True}`(이미 정리됨 → 폴링 중단 유도).
- 순수 로직 `mark_done`/등록은 최소화; 스레드·Popen은 I/O.

## 4. 클라이언트 (`potflow.html`)

### 4-1. 책갈피 하위 노드 모델
- 하위 노드 필드(기존 node에 추가): `seekMs:int`, `bmParent:<부모 nodeId>`. `videoPath`=부모 영상 경로. 제목=책갈피 제목(빈 값이면 `책갈피 <mm:ss>`). thumb=그 지점 이미지.
- 부모 영상 노드 → 하위 노드 **연결선(edge)** 자동.
- **더블클릭 재생**: 노드에 `seekMs`가 있으면 `playAt(videoPath, seekMs)`(그 지점 `/seek`), 없으면 기존 `playPaths([videoPath])`.

### 4-2. `syncBookmarks(nodeId)`
- `GET /bookmarks?path=<node.videoPath>` 호출.
- **관리형 재조정(reconcile)**: 기존 하위 노드(`bmParent==nodeId`)를 `seekMs`로 키. 응답 책갈피별: 같은 seekMs 노드 있으면 제목/썸네일만 갱신, 없으면 하위 노드+연결선 생성. 응답에 없는 seekMs 하위 노드는 제거(+연결선). 사용자가 옮긴 위치는 유지(신규만 부모 아래 계단식 배치).
- 썸네일: `putImg('bm_'+nodeId+'_'+ms, dataURL)` → `child.thumb={imgId,label}`.
- 책갈피 0개면 기존 관리형 하위 노드 모두 제거 + 토스트 `책갈피 없음`.
- 헬퍼 꺼져있으면 토스트 후 종료.

### 4-3. 동기화 트리거
1. **수동**: 영상 노드 단일선택 HUD(`drawNhud`)에 **"책갈피 동기화"** 버튼(videoPath 있는 노드만) → `syncBookmarks`.
2. **영상 새로 지정 시**: `bindVideoToNode`가 경로 지정 후 `syncBookmarks`(있으면 하위 노드 즉시 표시).
3. **PotPlayer 닫힐 때**: 영상/책갈피 노드 재생 시 `/play` 응답 `token`으로 `/playdone` 폴링(내가 시작한 재생 종료까지만, 종료 시 폴링 중단) → 종료되면 그 영상 노드 `syncBookmarks` 1회.

### 4-4. `playAt(path, ms)` / 재생 통합
- `playAt(path,ms)` → `POST /play {paths:[path], seek: ms/1000}` → 응답 token으로 종료폴링 시작(부모 영상 노드 재동기화 예약).
- 기존 `playPaths`/`playSelected`도 token 수신 시(단일 영상노드일 때) 종료폴링→해당 노드 재동기화 연결.

## 5. 디자인/제약
- 바닐라 JS·단일 파일·표준라이브러리만. **좌측 accent 라인 금지**. 한국어 UI.
- 수정 파일: potflow-helper.py / potflow.html / test_potflow_helper.py 만.
- **pbf는 영상 옆 저장 가정**(중앙 책갈피 폴더/해시 이름은 미지원 — 수동 지정 필요, 문서화).
- 닫힐 때 감지는 **헬퍼가 실행한 재생**만(외부에서 연 PotPlayer는 모름).
- 배포: 기존과 동일(cafe24 `www/map/`, git+배포 한 세트). potflow_data.json·potflow_thumbs 불가침.

## 6. 테스트 (헬퍼 순수함수)
- `parse_pbf`: 다중 책갈피 파싱·ms 정렬·thumb 유무·잘못된 라인 스킵.
- `pbf_for_video`/`video_for_pbf`: 옆 파일 존재/basename 매칭/무매칭.
- `ffmpeg_thumb_at_cmd`·`player_cmd`(seek 유무): argv 형태.

## 7. 범위 밖 (YAGNI)
- 상시 폴링(준실시간)·SSE. 중앙 책갈피 폴더(해시) 영상 추적. 책갈피 편집/생성(읽기 전용). 다중 동시재생의 개별 seek.
