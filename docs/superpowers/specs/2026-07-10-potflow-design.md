# PotFlow — PotPlayer 노드 재생 관리기 · 설계 문서

- 작성일: 2026-07-10
- 위치: `map/potflow.html` (+ `map/potflow-helper.py`)
- 성격: `map.html`(다이어그램 빌더)을 복사·개조한 **독립 도구**. 기존 프로젝트와 무관, git·배포만 동일 파이프라인.

---

## 1. 목적

로컬에 저장된 동영상들을 **노드 캔버스**로 관리하고, 노드(마우스 선택)로 **PotPlayer 재생**을 트리거하는 개인용 로컬 도구.

- 노드 = 하나의 동영상(로컬 절대경로 + 자동 생성 썸네일).
- 노드 **더블클릭** = 즉시 재생, **여러 노드 선택 + Space/헤더 ▶버튼** = 동시 재생(창 자동 타일 배치).
- 노드 간 연결(edges)·그룹·저장 등 map.html 기능은 유지.
- 오른쪽 사이드바에 **파일탐색기**(폴더트리 + 파일목록) 추가.

---

## 2. 전체 구조

```
[potflow.html  브라우저 UI]  ──fetch──▶  [potflow-helper.py  localhost:8770]
   노드 캔버스(map.html 기반)                  ├─ PotPlayer.exe 실행(단일/다중·타일 배치)
   + 오른쪽 파일탐색기                          ├─ ffmpeg 썸네일 생성
                                              └─ 폴더트리/파일목록 스캔
```

- **UI**: `map.html`을 복사·개조한 `potflow.html` 단일 파일. 노드/연결/저장/줌/HUD/팔레트 골격 유지.
- **실행·파일접근·썸네일**: 전부 Python 헬퍼(`http.server` 표준라이브러리만, 외부 의존성 0). PotPlayer·ffmpeg 경로·포트·허용 루트는 헬퍼 상단 `CONFIG`로 지정.
- 페이지는 **localhost로 열어야** 실행 기능 동작(브라우저 보안). cafe24 배포 시 UI만 올라가고 실행 기능은 로컬 전용.

### Graceful degradation
- 헬퍼 미실행/`file://` 접근 → `GET /ping` 실패 → UI 좌상단 `● 헬퍼 오프라인` 배지. 재생·탐색기·썸네일 비활성, **노드 편집·연결·저장·되돌리기는 계속 동작**.

---

## 3. 파일 (map/ 아래, 전부 신규)

| 파일 | 역할 | 배포 |
|---|---|---|
| `potflow.html` | UI (map.html 개조본) | ✅ |
| `potflow-helper.py` | 로컬 헬퍼 서버(실행/스캔/썸네일) | ✅ |
| `potflow_data.json` | 노드/연결/캔버스 저장(로컬 전용) | ❌ **불가침**(사용자 데이터) |
| `potflow_thumbs/` | ffmpeg 썸네일 캐시 | ❌ 배포 제외 |

- 기존 `map.html`·`map_data.json`·`map_images.json` 등은 **손대지 않음**.

---

## 4. 데이터 모델 (map 대비 변경점)

map.html의 `state` 구조를 그대로 승계하되 노드에 필드 추가:

```js
nodes: [{ id, x, y, title, desc,
          videoPath: string|null,   // ★신규: 로컬 절대경로
          thumb: {imgId,label}|null, // 기존: 썸네일(헬퍼 생성 이미지 연결)
          type, iconId, bg }]
edges / groups / view : map.html과 동일(유지)
```

- 저장은 map.html의 서버/로컬 저장 로직을 승계하되 **키/파일명만 potflow 전용으로 분리**(`potflow_doc` 등, 기존 scoopboard/diagboard 키와 충돌 금지).
- 썸네일 이미지: 헬퍼가 만든 jpg를 `IMAGES` 맵에 등록해 기존 `thumb.imgId` 렌더 경로 재사용.

---

## 5. 오른쪽 사이드바 = 파일탐색기 (신규)

- 우측에 접이식 사이드바 추가(왼쪽 이미지 라이브러리·도구 팔레트는 유지).
- 상단: **경로 입력 + "폴더 열기"**. 최근 경로 기억.
- 본문: **폴더트리**(접기/펼치기, `GET /tree`로 지연 로드) + **파일목록**(동영상 확장자만: mp4/mkv/avi/mov/wmv/webm/flv/m4v/ts…).
- 파일을 **캔버스로 드래그**:
  - 빈 곳에 드롭 → 그 경로의 **비디오 노드 신규 생성**(제목=파일명, 썸네일 자동 요청).
  - 기존 노드 위로 드롭 → 그 노드에 `videoPath` 지정 + 썸네일 갱신.
- 파일 항목 **더블클릭** = 그 파일 즉시 재생(노드 없이도).
- **좌측 accent 라인 금지** 규칙 준수(활성/선택은 배경·텍스트·체크로만).

---

## 6. 재생

- **더블클릭**(노드 1개) = 그 노드 즉시 재생 → `POST /play {paths:[videoPath]}`.
- **다중 선택 + Space** 또는 헤더 **[▶ 선택 재생]** = 선택된 모든 노드의 `videoPath` 동시 재생.
  - `videoPath` 없는 노드는 건너뜀(토스트 안내).
- 동시 재생 시 헬퍼가 **PotPlayer 다중 인스턴스** 실행 + 창 **자동 타일 배치**:
  - 1개=전체/기본, 2개=좌우 분할, 3~4개=2x2, 그 이상=근사 격자.
  - 창 위치·크기 제어는 **Windows user32(ctypes)** `EnumWindows`/`GetWindowThreadProcessId`/`SetWindowPos`로 처리(외부 라이브러리 없음). launch 후 PID로 창 핸들을 폴링해 찾음.
- ⚠️ **전제(셋업 안내에 명시)**: PotPlayer 환경설정에서 **"다중 인스턴스 허용"** 1회 설정 필요(안 하면 재생목록으로 합쳐져 동시재생 불가).
- 텍스트 편집은 노드 HUD의 편집 진입(더블클릭이 재생으로 바뀌므로 편집은 HUD 버튼/캡션 편집 경로로 대체).

---

## 7. 헬퍼 API (`potflow-helper.py`, localhost:8770)

| 메서드/경로 | 동작 | 응답 |
|---|---|---|
| `GET /ping` | 생존 확인 | `{ok:true, potplayer:bool, ffmpeg:bool}` |
| `GET /tree?path=` | 하위 폴더 + 동영상 파일 목록 | `{folders:[...], files:[{name,path,size}]}` |
| `GET /thumb?path=` | ffmpeg로 첫 프레임(기본 5초, 짧으면 앞) 추출·캐시 | jpg 바이너리(또는 dataURL) |
| `POST /play` | `{paths:[...]}` → PotPlayer 실행 + 타일 배치 | `{ok:true, launched:n}` |

- 모든 응답 `Access-Control-Allow-Origin: *`(로컬 전용). 에러는 JSON `{ok:false, error}`.
- CONFIG(파일 상단): `PORT`, `POTPLAYER_PATH`, `FFMPEG_PATH`, `THUMB_DIR`, `VIDEO_EXTS`.
- ffmpeg 없으면 `/thumb`은 플레이스홀더 반환 + `/ping`에 `ffmpeg:false`.

---

## 8. 디자인

- 기존 map의 골드(`--gold`)/네이비 토큰·HUD·팔레트·둥근모서리 스타일 승계.
- **좌측 accent 라인 절대 금지**(프로젝트 전역 규칙).
- UI 텍스트 한국어. 오른쪽 사이드바·헤더 재생 버튼·오프라인 배지 신규 스타일만 추가.

---

## 9. 셋업 / 배포

- **로컬 실행**: `python potflow-helper.py` → 브라우저로 `http://localhost:8770/potflow.html`(또는 별도 정적 서빙) 접속. 헬퍼가 정적 파일도 서빙하면 단일 프로세스로 끝.
- **PotPlayer 다중 인스턴스 허용** 1회 설정(동시재생 필수 전제).
- **git·배포**: 기존 map과 동일 파이프라인(cafe24 `www/map/`). `potflow_data.json`·`potflow_thumbs/`는 배포 불가침/제외.

---

## 10. 범위 밖 (YAGNI, 추후)

- 창 타일 배치의 정밀 레이아웃 프리셋(현재는 균등 격자만).
- macOS/Linux 창 제어(현재 Windows user32 전제).
- 재생목록/이어보기/재생상태 실시간 표시.
- 태그·검색·정렬 등 라이브러리 관리 고도화.
