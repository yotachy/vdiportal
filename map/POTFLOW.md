# PotFlow — 로컬 동영상 노드 재생 관리기

**PotFlow**는 로컬 동영상을 노드로 배치해 관리·재생하는 도구다.
`map.html`(다이어그램 빌더) 파생 UI인 **`potflow.html`** + Python 로컬 헬퍼 **`potflow-helper.py`** 두 파일로 구성된다.

- 노드 = 로컬 동영상 파일. 더블클릭 재생, 다중선택 동시재생(PotPlayer 개별 창 + 자동 타일 배치).
- 오른쪽 파일탐색기로 폴더를 열고 파일을 캔버스로 끌어 노드를 만든다.
- 썸네일은 ffmpeg로 자동 추출(캐시).

---

## 실행법

```bash
cd map/potflow
python3 potflow-helper.py
```

> Windows는 `map/potflow/start-potflow.bat` 더블클릭(배치가 자기 폴더로 `cd` 후 헬퍼 실행).
> 헬퍼는 **자기 파일 위치(`ROOT`) 기준**으로 정적 파일·데이터·썸네일을 다루므로, 폴더째 옮겨도 그대로 동작한다.

브라우저에서 **`http://localhost:8770/potflow.html`** 접속.
헬퍼가 정적 파일(HTML)도 함께 서빙하므로 **프로세스 하나**로 끝난다(별도 웹서버 불필요).

## 사전 준비 / CONFIG

`potflow-helper.py` 상단 상수 또는 환경변수로 설정한다.

| 항목 | 환경변수 | 기본값 |
|---|---|---|
| PotPlayer 실행 파일 | `POTPLAYER_PATH` | `C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe` |
| ffmpeg 실행 파일 | `FFMPEG_PATH` | `ffmpeg` (PATH 검색) |
| 포트 | — | `8770` (소스 상수 `PORT`) |

- **ffmpeg가 없어도 동작한다** — 썸네일만 비활성되고 재생·탐색은 정상.

### ★ 필수: PotPlayer 다중 인스턴스 허용

여러 노드를 동시재생하려면 PotPlayer 환경설정에서 **"다중 인스턴스 허용"(중복 실행 허용)** 을 켜야 한다 — **환경설정 → 재생/기타에서 중복 실행 허용**. 켜지 않으면 여러 영상이 개별 창이 아니라 한 창의 재생목록으로 합쳐진다.
(PotPlayer 버전에 따라 메뉴 위치가 다를 수 있음.)

## 사용법 요약

1. 오른쪽 파일탐색기에서 폴더 열기 → 동영상 파일 목록 표시.
2. **파일 더블클릭** = 즉시 재생.
3. **파일을 캔버스로 드래그** = 비디오 노드 생성(썸네일 자동). **기존 노드 위에 드롭** = 그 노드에 경로 지정.
4. **노드 더블클릭** = 재생.
5. **여러 노드 선택 + `Space`** 또는 헤더 **`▶ 선택 재생`** = 동시재생 — 창이 화면에 자동 타일 배치된다(Windows).

## 플랫폼

- 창 타일 배치는 **Windows 전제**(user32 API). 비Windows에서는 재생 실행만 되고 타일 배치는 없다.

## 데이터 / 배포

| 파일 | 성격 |
|---|---|
| `map/potflow/potflow_data.json` | 문서·이미지 저장(헬퍼가 기록). **사용자 데이터 — 배포 불가침** |
| `map/potflow/potflow_thumbs/` | 썸네일 캐시. 재생성 가능 — 배포 제외 |

둘 다 `map/.gitignore`에 `potflow/` 경로로 등록되어 있다.

> **폴더 격리(2026-07-19)**: potflow 일습(html·헬퍼·config·bat·테스트·썸네일)은 `map/potflow/`로 분리됐다 — 스쿱포지(`forge-*`)·다이어그램 빌더(`map.html`)와 파일·배포 경로가 겹치지 않는다. 배포 대상은 `www/map/potflow/`(이미 park EXCLUDES·트립와이어 보호 범위인 `www/map/` 하위라 별도 등록 불필요).

헬퍼 없이 `potflow.html`을 직접 열면(`file://`) **오프라인 배지** + localStorage 폴백으로 편집·저장은 되지만, 재생·파일탐색·썸네일은 비활성.

## 트러블슈팅

| 증상 | 확인 |
|---|---|
| `● 오프라인` / `● 로컬 저장됨` 배지 | 헬퍼 미실행 또는 포트(8770) 문제 → `potflow-helper.py` 실행 확인 |
| 재생이 안 됨 | `POTPLAYER_PATH` 경로 확인 |
| 썸네일이 공백 | ffmpeg 설치·`FFMPEG_PATH` 확인 |
