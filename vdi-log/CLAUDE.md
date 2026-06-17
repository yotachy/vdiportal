# CLAUDE.md — vdi-log (영역별 논의·결정사항 관리대장)

이 파일은 Claude Code가 **`vdi-log/` 디렉토리**에서 작업할 때 참조하는 컨텍스트 가이드입니다.
상위 [`../CLAUDE.md`](../CLAUDE.md)(vdiportal 포탈 화면정의서)의 규칙을 **상속**하되, 아래 내용이 충돌 시 이 문서가 vdi-log 범위에서 우선합니다.

---

## 📌 정체성

`vdi-log/log.html` = **KB손해보험 VDI 구축 프로젝트 의사결정 관리대장**(단일 목적).
(2026-06-17: 도구 허브 폐기 — WBS·주간보고·수행계획서·이행계획서 전부 제거. log.html은 의사결정 관리대장 전용으로 재편.)

- **셸 구조**: 글로벌 헤더(브랜드→대시보드 이동·관리자 로그인·테마) → `[사이드바 | 본문]`.
- **사이드바 = 영역 내비게이션**(`renderSidebar`):
  - **대시보드**(상단) → `#view-dash`
  - **전체 안건**(총 안건수 배지) → 전체 영역 표시
  - **영역 목록** — 영역명 + 안건수 배지, 클릭 시 해당 영역만 표시 (관리자: ＋영역 관리)
  - **화면정의서** — **관리자에게만** 노출, 통합본+14 링크 → `#view-deliv` iframe
- **본문 뷰 3종**(`showView` = `["view-dash","view-log","view-deliv"]`):
  - `#view-dash` — 대시보드(상태 현황 카드·영역별 진척 바·주의 필요 안건·전역 검색)
  - `#view-log` — 의사결정 관리대장 표(전체 또는 단일 영역). 필터바(상태·중요도·검색)·변경이력
  - `#view-deliv` — 화면정의서 링크 iframe 미리보기(관리자)
- **내비 스코프**(`scope`/`navTo`): `"dash"` | `"all"` | `<areaId>` | `"deliv:<itemId>"`. `localStorage["vdi_log_nav"]`에 영속(`loadScope`/`saveScope`). 영역 선택은 숨김 `#filterArea`에 값 주입 → `render()`가 단일 영역만 렌더.
- **진척 = 상태 기반 자동**: `확정·검토완료` = 완료. 영역별·전체 완료율 자동 계산(`DONE_STATUSES`, `renderDash`). 별도 진척칸 없음.
- **관리대장**: 회의·업무 안건을 영역별로 등록하고 **결정사항·후속조치·책임부서·중요도·상태**를 추적.

> ⚠️ **상위 포탈 화면정의서와 성격이 다르다.**
> - 포탈(`../*.html`) = **mock 전용 정적 UI 시안** (실제 데이터·API 없음, 화면정의서 목적).
> - vdi-log = **실제 동작하는 단일 HTML 도구**. localStorage 영속화·관리자 인증이 진짜로 동작한다. 따라서 상위 CLAUDE.md의 "mock 전용" 원칙은 **여기 적용되지 않는다.**

- 성격: 프로젝트 관리자가 실사용하는 의사결정 추적 도구 (수행사 전달 시안 아님)
- 관계: **vdiportal 하위 도구** — 같은 git 저장소, 배포는 포탈과 동일 호스트의 `/portal/vdi-log/` 경로

---

## 🛠️ 기술 스택

- **순수 HTML5 · CSS3 · Vanilla JS** — 빌드 도구·프레임워크 없음.
- **단일 파일 원칙**: 모든 CSS·JS·데이터가 `log.html` 한 파일 안에 인라인. (포탈의 `common.css`/`common.js`는 **사용하지 않는다**.)
- **외부 의존성 0 — 폐쇄망 완전 자급**: CDN·네트워크 의존 없음. `log.html` 한 파일만 폐쇄망에 복사해 브라우저로 열면 5개 도구 + localStorage 편집이 전부 오프라인 동작. (과거 Excel 입출력용 ExcelJS·SheetJS CDN은 2026-06-17 제거 — 폐쇄망 대응. Excel 가져오기/내보내기 기능 자체를 삭제했고, 공유는 읽기용 HTML·백업 JSON으로 대체.)

## 🎨 디자인 토큰 (log.html 자체 `:root`)

포탈과 **별개의 토큰 세트**다. 색·폰트·라운드는 log.html 상단 `:root` 변수만 사용(하드코딩 금지).

| 토큰 | 값 |
|---|---|
| 폰트 | KBFG(Display/Text) → Pretendard → Noto Sans KR → Malgun Gothic 폴백 |
| 기본 글자크기 | `html{font-size:15px}` — **포탈의 `zoom:1.25` 미사용** |
| 브랜드색 | navy `#2b3a55` · gold `#f5b500` |
| 상태색 | 확정 `#0f8a6d` · 논의중 `#3b6ea5` · 확인필요 `#c0392b` · 조치진행 `#b06f00` · 검토완료 `#9aa3b0` |
| 중요도색 | 상 `#d64545` · 중 `#d99800` · 하 `#6b7785` |

- **라이트/다크 테마**: 기본 라이트. 다크는 `html[data-theme="dark"]` 한 블록에서 토큰 재정의 + 토큰으로 안 바뀌는 하드코딩 표면(`#fff` 등)만 보정 → **라이트 CSS는 건드리지 않는다**(신규 하드코딩 색 추가 시 다크 블록에도 대응 추가). 툴바 `🌙/☀️`(`#btnTheme`) 토글, 선택은 `localStorage["vdi_log_theme"]`에 영속. **읽기용 HTML 내보내기는 라이트 고정**(공유 산출물).
- SVG 인라인(`viewBox="0 0 24 24" fill="none" stroke="currentColor"`), 들여쓰기 2 spaces, 큰따옴표, 한국어 우선.
- **noindex 필수**: `<head>`에 `<meta name="robots" content="noindex, nofollow">` 유지(상위 프로젝트 비공개 규칙).

---

## 🧱 데이터 모델 (JS 전역)

**저장소**:

```
localStorage["vdi_decision_log_v3"] = { columns, areas, rows, meta }  // 관리대장 본문
localStorage["vdi_hub_v1"]          = { cats, items, collapsed }      // 화면정의서 링크(관리자 전용)
localStorage["vdi_log_nav"]         = "<scope>"                       // 마지막 내비 스코프
localStorage["vdi_log_theme"]       = "light"|"dark"
```
(WBS·주간보고·수행·이행 저장소 `vdi_wbs_v1`/`vdi_weekly_v1`/`vdi_plan_v1`/`vdi_transition_v1`는 도구 제거로 더 이상 로드 안 함 — 과거 데이터는 방치, 적극 삭제하지 않음.)

### 대시보드(`renderDash`, `#view-dash`)
- **최근 변경된 안건**(상단 위젯): `updatedAt` 있는 행을 최신순 6건. 클릭 → `jumpToRow`.
- **상태 현황 카드**: 전체/완료율 + 상태 4종(`CARD_STATUSES`=확정·논의중·확인필요·조치진행). **검토완료는 카드 없음 — 확정에 합산**(`statusCount`: 확정=확정+검토완료). 카드 클릭 → 전체 안건 + 해당 상태 필터.
- **관리대장 뷰 요약 카드(`renderSummary`)도 동일 4종 + 현재 선택 영역 기준 집계**(영역 선택 시 그 영역만 카운트).
- **영역별 진척 바**(`dash-bar-row`): 영역마다 완료/전체 비율(상태 기반). 클릭 → 해당 영역.
- **주의 필요 안건**: `확인필요·조치진행` 목록. 클릭 → `jumpToRow`(해당 영역으로 이동+행 하이라이트).
- **전역 검색**(`dashSearch`, `#dashSearchInput`): 모든 영역 안건 전문검색, 결과 클릭 → `jumpToRow`. 상위 50건.
- `jumpToRow(rid)`: 상태/검색 필터 초기화 → `navTo(영역)` → `tr[data-rid]` 스크롤+`row-flash`.

### 허브(`vdi_hub_v1`) — 화면정의서 링크 전용
- **cats** = `[{id:"spec", name:"화면정의서"}]`. **items** = 화면정의서 링크 15(통합본+14) `{id, catId:"spec", name, code, type:"link", url, status, desc}`.
- **관리자에게만** 사이드바 노출. 클릭 → `navTo("deliv:<id>")` → `#view-deliv` iframe. 편집 UI 없음(고정).
- 시드 `DEFAULT_HUB`(링크만). `HUB_MASTER_V=8`. `loadHub`가 `_masterV<8`이면 1회 재시드 + 과거 builtin 잔재 제거(`type==="link"`만 유지).

- **columns** — 표시 컬럼 정의. `type`: `rownum`(번호 자동) · `text`(편집) · `status` · `priority`. `locked:true`는 삭제만 불가(이름·표시·요약은 변경 가능). `core:true`는 "간단히 보기"에 포함. `width`(px)는 **머리글 우측 경계 드래그로 직접 조절**(저장). 컬럼 수는 `MAX_COLUMNS=12` 하드 캡(추가 차단).
- **areas** — 영역(섹션). `{id, name, color, desc}`. 기본 6개: 가상화 인프라 / 계정·인사연동 / 인증·정보보호 / 사용자 포탈 / 이행·변화관리 / 운영·조직. **머리글 클릭 시 아코디언 접기/펼치기**(`collapsedAreas` Set, 세션 한정·비영속). `desc`는 데이터엔 남지만 **표/읽기전용 머리글엔 표시 안 함**(2026-06-17 간소화). 영역 추가/편집은 `saveAreasFromModal`이 표·사이드바·대시보드를 함께 갱신.
- **rows** — 안건. `{id, area, item, pri, date, asis, tobe, result, action, owner, status, done, att, parentId?, updatedAt?}`.
  - `id` — 행 고유키(`genId`/`ensureRowIds`). 후속안건 연결·삭제의 안정적 기준.
  - `updatedAt` — 변경 시각(ms). 셀 편집·상태/중요도 변경·참석자 편집·추가 시 `touchRow`로 기록. 대시보드 **최근 변경된 안건** 위젯 정렬에 사용(`relTime`). 로드 시 `backfillUpdatedAt`이 `updatedAt` 없는 행에 `date`(없으면 `done`)를 `parseRowDate`(연도 없으면 2026)로 채움 — 기존 안건도 논의일자 기준으로 표시됨.
  - `parentId` — **후속안건(하위레벨 안건)**이면 부모 행 `id`를 가리킴(1단계 깊이). 부모 바로 아래 들여쓰기(번호 `1-1-1`·`↳`)·연한 톤으로 표시. 부모 삭제 시 자식 동반 삭제. **후속안건은 안건·AS-IS·TO-BE 칸을 비활성(흐리게, `td.sub-dim`)** 처리하고 **결정·검토 결과 칸부터 입력**(부모의 현행/대안을 다시 안 적음). ＋추가 시 포커스도 결과 칸으로.
  - `att`(참석자) — 쉼표/줄바꿈 구분 이름 문자열로 저장. 화면 셀은 **`👤 N명` 배지**(`parseAtt`로 인원 산출), 클릭 시 **명단 팝오버**(`openAttPop`)에서 편집(관리자) 또는 열람. 읽기용 HTML 내보내기는 전체 이름 텍스트로 출력.
- **meta** — `eyebrow/title/sub` 등. 내부 플래그 `_colWidthVer`(컬럼 폭 마이그레이션 버전) 포함. (관리대장 뷰의 히어로는 2026-06-17 제거 — 본문은 바로 필터/검색바부터 시작. `renderMeta`는 요소 없으면 무시.)
- 상태 5종 `STATUSES` = 확정·논의중·확인필요·조치진행·검토완료(검토완료는 회색 처리). 상태·중요도 콤보는 간소 톤(연한 칩+컬러 텍스트, 셀 중앙 정렬 통일).
- 중요도 3종 `PRIORITIES` = 상·중·하.
- **표시 정렬·계층**: `orderedAreaRows(areaId, ai)`. 정렬 모드 2종(`sortMode()` ← `meta.sortMode`):
  - `"date"`(기본) — **논의일자 오름차순**(`dateKey`, 빈 일자는 뒤). 표시 전용 정렬이라 `rows` 저장 순서는 불변.
  - `"manual"` — `rows` **저장 순서 그대로**(정렬 안 함). 툴바 `#btnSort` 토글로 전환, 수동 모드에서만 번호 칸 `.row-grip`(⠿)을 드래그해 안건 재배치 → `rows` 배열 순서를 직접 바꿔 `saveData`(영속). 부모끼리/같은 부모의 후속안건끼리만 재배치(레벨·부모 유지). `rowIsTop`으로 판정.
  - 두 모드 모두 각 부모 뒤에 후속안건을 붙이고, `tr.dataset.idx`는 원본 인덱스 유지(편집/삭제 매핑 보존). 행에 `data-rid`(=row id) 부여(대시보드 검색·주의안건 `jumpToRow` 타깃). **화면 render · 읽기용 HTML 공통**.
- 표는 `width:100%` 스트레치 금지: **컬럼 폭 합계 크기**(`table.style.width`)로 렌더 → 컬럼 숨김/삭제·간단히 보기 시 잔여 컬럼이 늘어나지 않고 표만 줄어든다(가로 스크롤 방지). 기본 폭 합계 ≈ 1274px.
- `DEFAULT_*` 상수가 초기 시드. 저장 데이터 로드 시 누락 필드 마이그레이션(`pri`/`done`/`core`/`id`) + 컬럼 폭 1회 재조정(`COL_WIDTH_VER`) 수행 — **스키마/기본폭 변경 시 마이그레이션 코드(loadData)·importBackup·`orderedAreaRows` 소비처도 함께 갱신**.

## 🔐 관리자 모드

- 읽기 전용이 기본. `관리자 로그인`(비밀번호) 후에만 편집·행추가·삭제·영역/컬럼 관리·제목 편집 가능.
- 인증: `sha256(pw) === ADMIN.hash` 비교, 세션은 `sessionStorage["vdi_admin_session"]="admin"`.
- 현재 비번은 **`1`**(`ADMIN.hash = SHA-256("1")`). **암호학적 보안 아님** — 해시가 파일에 노출되고 콘솔로 우회 가능. 일반 사용자의 우발적 수정을 막는 잠금장치 수준(실제 접근통제는 서버 인증 필요). 비번 변경 시 새 해시를 `ADMIN.hash`에 반영.

---

## 🧩 기능 인벤토리

| 기능 | 비고 |
|---|---|
| 사이드바(영역 내비) | 대시보드·전체 안건·영역 목록(안건수 배지)·화면정의서(관리자). 영역 클릭→단일 영역, 활성 하이라이트(`renderSidebar`/`navTo`). **데스크톱 접기/펼치기**(단일 핸들 `#sideToggle` — 패널 경계 세로 중앙 고정, 아이콘만(‹↔› 회전). 접으면 `body.side-collapsed`로 폭 0 + 핸들이 좌측 가장자리로 슬라이드. `localStorage["vdi_log_sidebar"]` 영속). **PC 전용 — 모바일 햄버거·오버레이·반응형 미디어쿼리 제거(2026-06-17)** |
| 대시보드 | 상태 현황 카드·영역별 진척 바·주의 필요 안건·전역 검색(`renderDash`/`dashSearch`). 카드/바/행 클릭으로 해당 안건·영역으로 이동(`jumpToRow`) |
| 화면정의서 미리보기 | 관리자 전용. 우측 `iframe`(`#delivFrame`) + `↗ 새 탭`(`navTo("deliv:…")`) |
| 필터 | 영역 / 상태 / 중요도 셀렉트 + 활성 필터 칩(개별 해제) |
| 검색 | 안건·내용 전문 검색 + `<mark>` 하이라이트 |
| 요약 카드 | 상태별 건수, 클릭 시 상태 필터 토글 |
| 간단히 보기 | `core` 컬럼만 노출 (`simpleView`) |
| 인라인 편집 | `td[contenteditable]` — 진입 시 평문, 이탈 시 줄단위 항목 렌더(`renderCellRead`, `①·-→` 등 마커 인식) |
| 컬럼 관리(표 인라인) | **모달 없음.** 순서=헤더 드래그, **폭=헤더 우측 경계 드래그(`.col-resize`, 모든 영역 표 동시·저장)**, 헤더 호버 `⋮` 메뉴=이름변경·요약토글·숨기기·삭제, 헤더 끝 `＋`=새 컬럼 추가(최대 12)·숨긴 컬럼 표시. 부동 메뉴 공통 `openPop()`/`.pop`(body에 fixed로 부착해 `.tbl-scroll` 클리핑 회피) |
| 정렬 | 영역 내 **논의일자 오름차순**(중간 일정은 자동 중간 배치). 후속안건은 부모에 종속(`orderedAreaRows`) |
| 후속안건(하위 안건) | 부모 행 액션열 `＋`(`.sub-add`)로 추가 → `parentId` 연결·들여쓰기 표시. 안건명만 필수 |
| 영역 아코디언 | 영역 머리글 클릭으로 접기/펼치기(`collapsedAreas`, 세션 한정) |
| 참석자 배지 | 셀은 `👤 N명` 배지, 클릭 시 명단 팝오버 편집/열람(`openAttPop`) |
| 라이트/다크 테마 | 툴바 토글, `localStorage["vdi_log_theme"]` 영속. 다크는 `html[data-theme="dark"]` 단일 블록 |
| 도구 드롭다운 | 툴바 `도구 ▾`(`openToolsMenu`) — 보조 동작(읽기용 HTML·인쇄·백업/이력·영역관리) 통합. 관리자 항목은 `isAdmin()`일 때만 노출 |
| 전체 백업 (파일) | `exportBackup` → `vdi_전체백업_YYYYMMDD_HHMM.json` — **5개 도구 전 저장소**(`stores{}`: `ALL_STORE_KEYS`=관리대장·hub·wbs·weekly·plan·transition) + 하위호환용 관리대장 최상위. `importBackup`→`applyBackupData`: stores 있으면 전체 복원(localStorage 기록 후 전 도구 재적재·재렌더), 없으면 구형(관리대장만) 복원. **관리자 전용** |
| 변경 이력 (버전 형상관리) | `saveData`가 저장 직전 상태를 `localStorage[STORE_KEY+"__history"]`에 자동 보관(최근 `HIST_MAX=30`, `HIST_MIN_GAP=20s` 내 연속편집은 합침). `변경 이력` 모달에서 시점 선택→`restoreHistory`로 복원(복원 직전 현재 상태도 자동 보관). **관리자 전용** |
| 영역 관리 | 이름/색/설명/순서, 영역 삭제 시 안건 동반 삭제 (모달 유지) |
| 읽기용 HTML 내보내기 | 편집 불가 정적 파일 생성(필터·검색·인쇄·**컬럼 폭 드래그 조절** 내장). 히어로 제목 고정 "업무가상화(VDI) 구축"·간단 설명. **배포·공유용 산출물**(관리대장 전용) |
| 인쇄/PDF | `@media print` 스타일 |

- 데이터 변경은 즉시 `saveData()`로 localStorage 자동 저장 + **저장 직전 상태를 변경 이력에 자동 스냅샷**. 잘못 수정 시 도구 › 변경 이력에서 복원, 안전 백업은 도구 › 백업 내보내기(.json).
- **디자인 방향**: 표 세로 격자 제거(가로 구분선만, `--line-faint`)·**표 머리글 하단 골드 2px 언더라인**(`th`)·영역 번호 골드 액센트(`.area-no`)·카드 라운드(`--r`)+깊이(`--shadow-card`)·버튼 라운드(`--r-sm`)/고스트 위주. 셀은 여백·행간 넉넉히(`td` 14px/1.72)로 가독성 우선("엑셀보다 나은" 느낌). 골드는 액센트(활성/주요)로만. 신규 UI도 이 절제된 톤 유지.

---

## 🚀 배포

상위 vdiportal과 **동일 호스트**, 하위 경로만 다름.

- 원격: `www/portal/vdi-log/log.html` (cafe24 SFTP, 자격증명은 `~/projects/park/deploy.sh`)
- 공개 URL: `https://parksvc.mycafe24.com/portal/vdi-log/log.html`
- 배포 명령(디렉토리 없으면 생성):
  ```bash
  lftp -c "open sftp://parksvc:<pw>@parksvc.mycafe24.com; mkdir -p www/portal/vdi-log; cd www/portal/vdi-log; put <로컬>/log.html -o log.html"
  ```
- **CLAUDE.md·README는 배포 제외**(log.html만 업로드).
- 커밋은 vdiportal 저장소(`git@github.com:yotachy/vdiportal.git`, SSH)로. **수정 완료 시 묻지 말고 커밋+push+배포 한 세트로 실행.**

---

## ⚠️ 작업 원칙 요약

- **단일 파일 유지**: 외부 파일로 쪼개지 말 것(common.css/js 도입 금지). 페이지 고유 CSS·JS·데이터 모두 log.html 내부.
- **디자인 토큰만**: log.html `:root` 변수 사용, 하드코딩·외부 아이콘 라이브러리 금지.
- **데이터 무결성 우선**: 스키마(columns/rows) 변경 시 `loadData()` 마이그레이션·`exportReadonlyHtml` 템플릿을 함께 점검(저장된 사용자 데이터가 깨지지 않게).
- **noindex·한국어 우선** 유지.
- 읽기용 HTML 내보내기 결과물에도 noindex가 들어가도록(공유 산출물도 비공개) 템플릿 점검.
