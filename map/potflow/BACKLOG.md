# PotFlow 백로그 (살아있는 문서)

> **범위: PotFlow 단독.** 상위 개발프로젝트(스쿱포지·머니스쿱·vdiportal)와 무관한 별개 트랙이다.
> 스쿱포지 백로그(`map/docs/BACKLOG.md`)와 **서로 섞지 않는다** — 그쪽의 검증 관문·엔진 규율도 여기 적용하지 않는다.
> 커밋 스코프는 `potflow`. 개요·셋업은 [`../POTFLOW.md`](../POTFLOW.md).

---

## 🔥 진행 중 / 대기

- (없음)

## 📋 알려진 미결 (기존 문서·주석에 흩어져 있던 것 모음)

- **후원 계좌가 자리표시자** — `potflow.html`의 `SUPPORT_ACCOUNT` 상수가 더미. 실계좌로 교체 필요.
- **pbf 위치 가정** — 책갈피는 영상 옆 `<영상>.pbf` 저장을 전제. PotPlayer 중앙 책갈피 폴더/해시 이름은 미지원.
- **Windows 장문 경로** — 260자 초과 경로는 long-path 미활성 시 `os.path.isfile`이 False가 될 수 있음(크래시는 아님).
- **썸네일 코덱 한계** — ffmpeg 없으면 브라우저 디코드 가능한 mp4·webm만 자동 썸네일. mkv·avi는 ffmpeg 필요.

---

## ✅ 완료 (최근)

### 2026-07-25 — 런처가 옛 경로에서 파일을 받아 potflow.html 누락 (`0ca67a4`)

**증상**: `start-potflow.bat` 실행 → 브라우저에 `{"ok": false, "error": "not found"}`.

**근본 원인**: `471d935`(map/ → map/potflow/ 폴더 격리)가 파일을 옮기기만 하고(`similarity index 100%`) bat 안의 자기 갱신 URL을 안 고쳤다. `BASE=.../map` 이라 potflow.html이 서버 404(실제 위치 `.../map/potflow/`) → `curl -f` 실패 → `move` 안 됨 → PowerShell 폴백도 `catch{}`로 조용히 삼킴 → potflow.html 없는 채로 헬퍼 기동 → 정적 서빙이 `os.path.isfile` 실패로 404 JSON(`potflow-helper.py:802`). **격리 커밋은 헬퍼 `ROOT` 기준만 검증했고 런처가 자기 갱신형인 점을 놓쳤다.**

**수정**
- `BASE` → `https://parksvc.mycafe24.com/map/potflow` (bat과 동일한 `curl -f`로 3파일 200 확인)
- 다운로드 실패 시 python 실행 **전** `:nofile`로 중단하고 받으려던 주소 출력 — 조용한 실패가 원인 추적을 어렵게 만든 실제 요인이라 함께 막음
- 회귀 가드 3건(`test_potflow_helper.py`): BASE 마지막 조각 == bat이 놓인 폴더명(**다시 옮기면 실패**) / getfile 대상이 전부 같은 폴더에 실재 / potflow.html 존재 가드가 python 실행보다 앞
- 곁들여 낡은 테스트 2건 수정 — `bookmark_thumb` 픽스처 `"QUJD"`(3B)가 이후 추가된 `_embedded_thumb` 매직바이트·500B 검증에 걸려 실패 중이었음. 유효 JPEG 픽스처로 교체 + '너무 작으면 거부' 케이스 분리. **37/37 통과.**

**배포**: 서버의 낡은 bat 교체. `park/deploy.sh`(07-17 삭제 사고 mirror 스크립트)를 쓰지 않고 **단일 파일 put**만 수행, forge·index·map 200 확인. 사용자 PC(`Downloads/`) 누락 파일 복구, `potflow_data.json`은 손대지 않음.

### 2026-07-25 — PotFlow = 상위 개발프로젝트와 독립 트랙임을 명시 (`6039597`)

`map/CLAUDE.md`의 PotFlow 행에 독립 트랙 표시 + ⚠️ 블록 추가. 같은 저장소 `map/` 아래 있다는 이유로 스쿱포지 로드맵의 일부로 오인되는 것을 막는다(목적·사용자·배포 대상이 전부 다른 개인용 로컬 도구). 스쿱포지 백로그·검증 관문·엔진 규율을 끌어오지 말 것, 상위 프로젝트 우선순위와 섞어 보고하지 말 것, 커밋 스코프 `potflow` 분리 유지.

### 2026-07-19 — `map/potflow/` 폴더 격리 (`471d935`)

potflow 일습(html·helper·config·bat·test·thumbs)을 `map/` 루트에서 `map/potflow/`로 이동. 헬퍼가 `ROOT=os.path.dirname(abspath(__file__))` 기준이고 bat도 `cd /d %~dp0`라 코드 경로 수정 없이 동작. 배포 대상 `www/map/potflow/`. **단, bat의 다운로드 URL은 놓쳤음 → 위 `0ca67a4`에서 수정.**

> 2026-07-19 이전 이력(제작·기능 증분)은 이 문서가 생기기 전이라 커밋 로그(`git log -- map/potflow map/potflow.html`)와 [`../POTFLOW.md`](../POTFLOW.md)를 참조.
