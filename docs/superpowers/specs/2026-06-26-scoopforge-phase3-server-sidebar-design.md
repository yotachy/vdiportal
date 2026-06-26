# 스쿱포지 (Scoop Forge) Phase 3 A+B — 서버 저장 + 사이드바 설계

- 날짜: 2026-06-26
- 선행: Phase 3-C(예측 연속성) 배포 완료.
- 상태: 컨셉 합의 완료 → 구현 설계. **4-서브프로젝트 분해 중 A+B(서버+사이드바).** (D=분석 트리거는 이후.)

## 1. 목표

forge를 **서버 저장(map.html 방식) + 여러 전략 문서 사이드바 관리**로 전환. 현재 forge는 메모리 + JSON 내보내기뿐.
- **A. 서버 저장**: forge 전용 `forge-api.php` + `forge_data.json`/`forge_images.json`. 자동저장. 오프라인 폴백.
- **B. 사이드바**: map.html식 좌측 사이드바 — 전략 문서 목록(주제+제목) 관리 + 이미지 라이브러리 이전.

확정 결정: **여러 문서(map식)** · **서버 전용 + 오프라인 폴백(로컬모드 토글 없음)** · **사이드바=문서+라이브러리, 팔레트·파라미터 플로팅 유지, 주제 배너 상단 유지.**

## 2. 백엔드 — `map/forge-api.php` (신설)

- map `api.php`를 **그대로 미러링**(검증된 운영 코드), 차이만:
  - 데이터 파일 `forge_data.json`, 이미지 `forge_images.json`, 키 파일 `forge_key.txt`(있으면 `X-Write-Key` 검증, 없으면 fail-open).
  - 내부 배열 키 `canvases` → **`documents`** (find/replace).
- ops 동일: `replace{doc}` / `upsert{canvas→document}` / `delete{id}` / `reorder{order}` / `meta{meta}` / `putimg{id,src}`. 응답 `{ok,rev}`. 락(flock)+원자적 rename. 이미지 분리저장(각 <128KB).
- GET: `forge_data.json` 반환(없으면 `null`), `?images=1`→`forge_images.json`, `?check=1`→키 유효성.
- **map `api.php`·`map_*.json` 절대 불가침.** forge는 자기 파일만.

### 데이터 모델 (`forge_data.json`)
```
doc = { documents:[{ id, title, themeImgId, nodes, edges, view, updated }],
        meta:{ library:[{id,label}], activeId }, _rev:N }
```
- `document.title`=제목(사이드바), `document.themeImgId`=주제 이미지(배너). 노드는 기존 모델(weight/conviction/note/thumb 포함). 이미지 dataURL은 `forge_images.json`에만(문서엔 imgId 참조).

## 3. 클라이언트 서버 레이어 (`forge.html`)

map 미러:
- 전역: `SERVER_OK`(bool), `DOCS`(documents 배열), `META`({library,activeId}), `activeId`.
- `boot()`: `GET forge-api.php` + `GET ?images=1` → DOCS/META/IMAGES 채움. 빈/null이면 **기본 문서 1개 시드**(현재 `seedDefaultStrategy` + 기본 제목 "새 전략"). 활성 문서 로드.
- `loadDoc(id)`: 해당 문서를 boardState(nodes/edges)+themeImgId+title+view로 적재 → renderBoard/renderTheme/runForge.
- `writeBackActive()`: 활성 문서를 현재 boardState/theme/view로 갱신해 `upsert` POST.
- `markDirty()`: 편집(노드·엣지·weight·conviction·note·theme·view 변경) 시 디바운스(800ms) 후 `writeBackActive()`.
- `saveMeta()`: library/activeId만 `meta` POST.
- `putImg(id,src)`: 메모리 + `putimg` POST. `loadImages()`: `?images=1` 머지.
- **오프라인 폴백**: api 접근 불가/오류 → `SERVER_OK=false`, 메모리 모드(편집 동작하되 새로고침 시 초기화), 저장 배지 `● 오프라인`. 정상 시 `● 저장됨`/`● 저장 중…`.
- `exportStrategy()`(기존) 유지 — 수동 백업.

## 4. 사이드바 UI (`forge.html`)

- 좌측 접이식 사이드바(`.forge-side`), 보드 페인은 우측으로 이동(레이아웃: `사이드바 | (배너 + 보드 stage)` ). 접기 토글.
- **문서 목록 섹션**: `renderSidebar()` — 문서 행(제목 표시, 활성 하이라이트), 클릭=`switchDoc(id)`, 더블클릭/버튼=인라인 이름변경(`renameDoc`), `＋ 새 문서`(`newDoc`), 삭제(`deleteDoc`, 최소 1개 유지). 순서변경(reorder)은 옵션(YAGNI 시 생략).
- **이미지 라이브러리 섹션**: 현재 떠있는 `.forge-lib`를 사이드바로 이전. `＋ 이미지 추가`→다운스케일→`putImg`(서버)→`meta.library` 갱신→`renderLib`. 노드 드래그 적용/Ctrl+V는 기존 동작 유지.
- **주제 배너**(상단 유지): 활성 문서의 `themeImgId`(이미지) + `title`(편집 시 `renameDoc` 또는 문서 title 갱신) 표시. 라이브러리 드래그/Ctrl+V로 주제 이미지 지정 → 활성 문서 themeImgId 갱신 → markDirty.
- **팔레트·파라미터 패널은 캔버스 플로팅 유지**(좌표는 보드 페인 기준 — 사이드바가 보드 페인 밖이므로 영향 없음).

## 5. 검증 (로컬 PHP 없음 — 라이브 엔드포인트 기준)

- **백엔드**: 로컬에 php 미설치 → `forge-api.php`를 cafe24에 배포 후 **curl로 ops 검증**(GET null→replace→GET→upsert→delete→meta→putimg→?images=1→?check=1). map의 검증된 코드 미러라 리스크 낮음.
- **클라이언트**: 헤드리스로 **라이브 URL**(`https://parksvc.mycafe24.com/map/forge.html`) 로드 → 문서 생성/전환/이름변경, 편집 후 자동저장 → 새로고침 시 복원, 이미지 추가→서버 저장→재로드 확인. 오프라인 폴백은 api 차단 상태(예: 잘못된 경로)로 배지 확인.
- **테스트 데이터 정리**: curl 검증으로 생긴 `forge_data.json` 잔재가 사용자 실데이터를 오염하지 않도록, 검증 후 깨끗한 초기 상태(기본 문서 1개 또는 파일 삭제로 첫 로드시 시드)로 마감.
- forge-core.js 변경 없음 → 기존 node 15/15 유지(회귀 가드).

## 6. 비범위

- D(Claude Code 분석 트리거)는 이후. 로컬모드 토글(map의 서버|로컬) 제외. 실데이터 연동 제외. import 복원 UI는 여전히 없음(D 또는 추후).

## 7. 리스크/주의

- **로컬 PHP 부재**: 백엔드 단위테스트 불가 → 검증된 map `api.php` 미러 + 라이브 curl/헤드리스로 검증. PHP 문법 오류 위험은 미러 + cafe24 PHP 8.4 실행으로 조기 발견.
- **cafe24 WAF**: 정적 파일 내 `<?` 리터럴 금지(메모리 [[cafe24-waf-blocks-php-tags]]) — 단, `forge-api.php`는 **실제 PHP 파일**이므로 정상(정적 HTML 내 리터럴이 문제였던 것). forge.html에는 PHP 태그 넣지 말 것.
- **POST <128KB**(cafe24 openresty): 이미지는 `putimg` 분리(각 <128KB), 문서 JSON엔 imgId 참조만 — map 패턴 그대로.
- **map 불가침**: `map.html`/`chart.html`/`api.php`/`map_data.json`/`map_images.json` 수정·덮어쓰기 금지. forge는 `forge-*` 파일만.
- 사이드바 추가로 보드 페인 폭 변동 → 캔버스/오버레이 좌표는 보드 페인(`#boardPane`/`#bStage`) 기준이라 영향 없어야 함(리사이즈 핸들러가 재측정). 확인 필요.
- 노드/엣지/weight/conviction/note/thumb 전체가 문서에 직렬화·복원되는지(Phase 1.5/2 필드 누락 없게) 확인.
- noindex 유지. 단일 페이지(+forge-core.js+forge-api.php).

## 8. 확정된 결정

1. 여러 문서(map식), 서버 전용 + 오프라인 폴백(로컬모드 토글 없음).
2. `forge-api.php`(map api.php 미러, documents/forge_*.json/forge_key.txt). map 파일 불가침.
3. 사이드바 = 문서 목록 + 이미지 라이브러리. 팔레트·파라미터 플로팅, 주제 배너 상단 유지.
4. 검증은 로컬 PHP 없이 라이브 cafe24 엔드포인트(curl + 헤드리스), 테스트 데이터 정리.
