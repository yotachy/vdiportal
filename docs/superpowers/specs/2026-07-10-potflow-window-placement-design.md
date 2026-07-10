# PotFlow — 노드별 화면 배치(다중 모니터·분할 프리셋) · 설계 문서

- 작성일: 2026-07-10
- 대상: `map/potflow.html` + `map/potflow-helper.py`
- 선행: potflow 본체 + 직접드래그/정렬 + 책갈피 + 후원/라이센스 완료본.

---

## 1. 목적
동영상 재생 시 PotPlayer 창을 **노드마다 지정한 화면 영역**(다중 모니터 포함)에 띄운다. 분할 프리셋을 **다양하게**(여러 격자) 제공하고, 재생 개수가 달라도 노드별로 자리를 정해둘 수 있게 한다. 기존 자동 타일은 미지정 노드의 폴백으로 유지.

## 2. 데이터 모델
- 노드에 선택적 `win = {mon, x, y, w, h}`:
  - `mon` = 모니터 index(0=주 모니터), `x/y/w/h` = 그 모니터 작업영역의 **0~1 비율**.
  - `null`/없음 = 배치 미지정 → 기존 자동 타일.
- 책갈피 하위 노드도 자기 `win` 가능(기본 null=상속 안 함).

## 3. 헬퍼 변경 (`potflow-helper.py`, Windows)

### 3-1. 모니터 조회
- `_monitors() -> [{"x","y","w","h","primary"}]` — `EnumDisplayMonitors`+`GetMonitorInfoW`(ctypes), **작업영역(rcWork)** 기준(작업표시줄 회피), **주 모니터 먼저** 정렬. 실패/비Windows → `[{"x":0,"y":0,"w":1920,"h":1080,"primary":True}]`.
- `GET /monitors` → `{"monitors":[...]}`.

### 3-2. 배치 좌표 (순수, 테스트)
- `win_to_rect(win, monitors) -> (x,y,w,h)`:
  - `mon` 범위 밖이면 0으로 클램프. `x=mon.x + win.x*mon.w`, `y=mon.y + win.y*mon.h`, `w=max(1, win.w*mon.w)`, `h=max(1, win.h*mon.h)` (정수).
- `build_play_rects(valid, monitors) -> [(x,y,w,h)]`:
  - 각 항목: `win`(dict) 있으면 `win_to_rect`, 없으면 **주 모니터 기준 자동 타일**(`tile_rects(len,primary.w,primary.h)` + primary 오프셋) 슬롯. 순서 = valid 순서.

### 3-3. /play 배치
- `items:[{path, seek, win?}]`. `launch_players`가 `monitors=_monitors()` → `rects=build_play_rects(valid, monitors)` → Popen 실행 후 `arrange_windows(pids, rects)`.
- **배치 실행 조건**: `os.name=="nt" and (len>1 or any win)` (단일·무win은 종전대로 미배치).
- `arrange_windows`: SetWindowPos **전에 `ShowWindow(hwnd, SW_RESTORE=9)`**(최대화 해제해야 크기 적용됨). 가상좌표(음수 x 포함)로 다중 모니터 배치.
- `normalize_play_items`가 `win`도 통과(items/paths 양쪽).

## 4. 클라이언트 (`potflow.html`)

### 4-1. 재생이 win 반영
- `playItems` 항목에 `win` 포함. `playSelected`가 노드별 `{path, seek, win:n.win||null}`. 더블클릭(영상/책갈피)도 `playItems([{path,seek,win}], watchId)`로 통일. 미지정이면 win=null → 자동.

### 4-2. 미니 모니터 배치기 (`#winPop` 팝오버)
- 노드 단일선택 HUD에 **"화면배치"** 버튼 → 팝오버.
- 최초/열 때 `GET /monitors`(캐시 `MONITORS`). 가상 데스크톱 bbox 계산 → ~300px 폭에 맞춰 **모니터들을 실제 배열대로 축소 렌더**(번호 표시).
- **분할 프리셋(다양)**: 격자 밀도 버튼 다수 — `1×1(전체)·2×1·1×2·3×1·1×3·2×2·3×2·2×3·3×3·4×2·2×4·4×4`. 선택 시 대상 모니터에 격자 오버레이 → **셀 클릭 = 그 셀을 `n.win`**(다중 셀은 4-3 드래그로).
- **자유 드래그/리사이즈**(4-3): 창 사각형을 이동/모서리 리사이즈, 놓인 모니터로 `mon` 결정.
- **배치 해제** 버튼(→ `n.win=null`, 자동 타일). 현재 값 표시.
- 변경 시 `markDirty()` (재렌더 불필요 — 캔버스 노드엔 배치 미표시, 팝오버만 갱신).

### 4-3. 자유 드래그/리사이즈
- 창 사각형 본체 드래그=이동(포인터가 있는 모니터로 스냅, 비율 재계산), 우하단 핸들 드래그=리사이즈. 경계 클램프(0~1). 결과 `n.win={mon,x,y,w,h}`.

## 5. 디자인/제약
- 바닐라 JS·단일 파일·표준라이브러리만. **좌측 accent 라인 금지**. 한국어 UI. Host 가드·CORS 유지.
- **Windows 전용**(SetWindowPos). 비Windows/조회 실패 → 주 모니터 1개·자동 타일 폴백. "다중 인스턴스 허용" 전제.
- 수정 파일: potflow-helper.py / potflow.html / test_potflow_helper.py.
- 배포: 기존과 동일(cafe24 `www/map/`).

## 6. 테스트
- 헬퍼: `win_to_rect`(다중 모니터 오프셋·클램프), `build_play_rects`(win/자동 혼합), `normalize_play_items`(win 통과).
- 클라: `node --check` + 헤드리스(배치기 팝오버·모니터 렌더·프리셋 셀). 실제 창 배치는 로컬 수동.

## 7. 범위 밖 (YAGNI)
- 캔버스에 배치 미리보기 오버레이(노드 위). 창 z-order/포커스 제어. 모니터 회전/DPI 스케일 정밀보정(작업영역 비율로 근사).
