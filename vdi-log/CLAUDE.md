# CLAUDE.md — vdi-log (영역별 논의·결정사항 관리대장)

이 파일은 Claude Code가 **`vdi-log/` 디렉토리**에서 작업할 때 참조하는 컨텍스트 가이드입니다.
상위 [`../CLAUDE.md`](../CLAUDE.md)(vdiportal 포탈 화면정의서)의 규칙을 **상속**하되, 아래 내용이 충돌 시 이 문서가 vdi-log 범위에서 우선합니다.

---

## 📌 정체성

`vdi-log/log.html` = **KB손해보험 업무가상화(VDI) 구축 프로젝트 관리 사이트**.
좌측 **사이드바**는 **내장 도구 5종(상단 고정)** + **화면정의서 링크**로 구성. (2026-06-17: 감리 표준 산출물 카탈로그/레지스트리는 제거 — 5개 내장 도구 중심으로 단순화, 화면정의서 iframe 링크만 유지.)

- **내장 도구 5종**: 의사결정 관리대장 · WBS·일정계획 · 주간보고 · 수행계획서 · 이행계획서. 관리자는 이 5개의 **이름 변경(연필)·순서 변경(드래그)** 가능(`localStorage` 영속).

- **셸 구조**: 글로벌 헤더(브랜드·관리자 로그인·테마) → `[사이드바 | 본문]`. 본문은 다중 뷰 라우팅(`showView`):
  - `#view-log` — 의사결정 관리대장(필터·검색·표·변경이력 등).
  - `#view-wbs` — WBS·일정계획(아웃라인 + 간트).
  - `#view-weekly` — 주간보고(주차별 카드).
  - `#view-execplan` — 수행계획서(섹션형 편집 문서).
  - `#view-transition` — 이행계획서(섹션형 편집 문서).
  - `#view-deliv` — 화면정의서 링크의 `iframe` 미리보기(상단바: 코드·제목·상태·`↗ 새 탭`).
- **관리대장**: 회의·업무 안건을 영역별로 등록하고 **결정사항·후속조치·책임부서·중요도·상태**를 추적. 이제 허브의 한 메뉴(`type:"builtin"`).

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

**두 개의 독립 저장소**:

```
localStorage["vdi_hub_v1"]          = { cats, items, active, collapsed }  // 산출물 허브(사이드바)
localStorage["vdi_decision_log_v3"] = { columns, areas, rows, meta }      // 관리대장 본문
localStorage["vdi_wbs_v1"]          = { tasks, meta }                     // WBS·일정계획 본문
localStorage["vdi_weekly_v1"]       = { reports, meta }                   // 주간보고 본문
localStorage["vdi_plan_v1"]         = { sections, meta }                  // 수행계획서 본문
localStorage["vdi_transition_v1"]   = { sections, meta }                  // 이행계획서 본문
```

> **내장 도구(builtin) 5종**: 사이드바 상단 고정(`.nav-pinned`, 카테고리 밖·삭제/링크 불가, 관리자 이름변경·드래그 순서변경). `의사결정 관리대장`(`builtinKey:"log"` → `#view-log`) · `WBS·일정계획`(`wbs` → `#view-wbs`) · `주간보고`(`weekly` → `#view-weekly`) · `수행계획서`(`execplan` → `#view-execplan`) · `이행계획서`(`transition` → `#view-transition`). `selectItem`이 `showView()`로 라우팅. 각자 별도 저장소(위)라 허브(`vdi_hub_v1`) 재시드와 무관.
> 수행계획서·이행계획서는 **공용 섹션문서 엔진**(`makeSectionDoc({key,seed,prefix})`)의 두 인스턴스(`execDoc`·`transDoc`). 화면 element id는 prefix로 구분(`plan*`·`trans*`).

### 주간보고(`vdi_weekly_v1`)
- **reports** — 주차별 보고 `{id, label, start, end(ISO), progress(0~100), done[], plan[], issues[]}`. `done`/`plan`은 문자열 배열, **`issues`는 `{text, ref}` 배열**(`ref`=의사결정 관리대장 row id, 없으면 `""`). 화면 표시 순서=배열 순서(신규는 맨 위 unshift). `weeklyEnsureIds`가 옛 문자열 issues를 `{text,ref}`로 마이그레이션.
- 카드 목록(최신 위)·**기본 접힘 아코디언**(헤더 클릭 토글, `weeklyOpen` Set 세션 한정). 헤더=캐럿·라벨·기간·진척바/%. 본문 3블록(금주 실적/차주 계획/이슈·리스크). **이슈는 안건 연결**: 읽기 시 연결된 이슈는 링크(`a.wk-link`)→클릭하면 `goToDecision(rid)`가 관리대장으로 이동+해당 영역 펼침+행 하이라이트(`tr.row-flash`, 행에 `data-rid`). 관리자: 라벨·기간(date)·진척(number)·실적/계획(줄=항목)·이슈(텍스트 입력+안건 셀렉트 `decisionRowOptions`+＋/✕) 편집. **편집은 관리자 전용**. 시드 `DEFAULT_WEEKLY`(3주차). `render`=`renderWeekly`.

### 수행계획서·이행계획서 (공용 섹션문서 엔진)
- **sections** — 섹션 `{id, title, body}`. 표시 순서=배열 순서. 번호 자동. 좌측 목차(앵커 스크롤)+우측 본문(`white-space:pre-wrap`). 관리자: 제목·본문(contenteditable)·＋섹션·✕삭제·↑↓ 순서.
- `makeSectionDoc({key,seed,prefix})` 팩토리의 두 인스턴스: **수행계획서**=`execDoc`(`vdi_plan_v1`, prefix `plan`, 시드 `DEFAULT_PLAN` 7섹션) / **이행계획서**=`transDoc`(`vdi_transition_v1`, prefix `trans`, 시드 `DEFAULT_TRANSITION` 6섹션). element id는 `{prefix}Toc/Body/Span/Add/SaveState`·섹션 `{prefix}sec-{id}`.

### WBS(`vdi_wbs_v1`)
- **tasks** — 평면 아웃라인 리스트 `{id, name, level(0=단계,1,2…), start, end(ISO), owner, progress(0~100)}`. 화면 표시 순서=배열 순서. WBS 코드(`1.2.3`)는 `level`+순서로 자동 계산.
- 부모 행은 자식 **롤업**(`wbsEffAll`): 시작=min·종료=max·진척=기간가중 평균(읽기 전용). 리프만 진척/일자 직접 입력.
- 간트: 전체 일정 min~max 기준 막대 위치/너비(%) + 진척 채움. 월 눈금 헤더.
- 관리자: 단계/하위 추가·들여쓰기/내어쓰기(블록 단위)·삭제·**행(블록) 드래그 정렬**·인라인 편집(이름/담당/일자/진척). 시드 `DEFAULT_WBS`(VDI 구축 7단계). `render`=`renderWbs`.

### 허브(`vdi_hub_v1`) — 단순화됨
- **cats** — `[{id:"spec", name:"화면정의서"}]` 하나만(레지스트리 카테고리 전부 제거).
- **items** — `{id, catId?, name, type:"builtin"|"link", url?, code?, status?, desc?}`.
  - `type:"builtin"` — 내장 도구 5종(위). **catId 없음**, 상단 고정(`.nav-pinned`). 관리자: **이름 변경(`renameBuiltin`, 연필)·드래그 순서 변경**. 삭제/링크 불가.
  - `type:"link"` — 화면정의서 15건(통합본+14). **항상 url 있음** → `iframe` 미리보기(`#view-deliv`). 편집 UI 없음(고정). (옛 레지스트리/등록부 카드 `buildDelivCard`·산출물/카테고리 추가 모달 `openItemModal`/`openCatsModal`은 2026-06-17 제거.)
  - **시드** `DEFAULT_HUB`: 내장 5 + 화면정의서 15. `HUB_MASTER_V=7`. `loadHub`가 `_masterV<7`이면 **1회 재시드**(새 구조로 초기화, 이후 내장 이름/순서 편집은 영속). 내장 도구 본문(`vdi_*_v1`)은 별도 저장소라 무영향.
- **active** — 현재 선택 id(영속). `selectItem(id)`가 뷰 전환 + (링크면) iframe src 세팅.
- 사이드바 렌더 `renderSidebar()`(관리자면 내장에 이름변경 연필 + 하단 안내 `.nav-tip` 노출), 카테고리 접기 `navCollapsed`(세션 한정).

- **columns** — 표시 컬럼 정의. `type`: `rownum`(번호 자동) · `text`(편집) · `status` · `priority`. `locked:true`는 삭제만 불가(이름·표시·요약은 변경 가능). `core:true`는 "간단히 보기"에 포함. `width`(px)는 **머리글 우측 경계 드래그로 직접 조절**(저장). 컬럼 수는 `MAX_COLUMNS=12` 하드 캡(추가 차단).
- **areas** — 영역(섹션). `{id, name, color, desc}`. 기본 6개: 가상화 인프라 / 계정·인사연동 / 인증·정보보호 / 사용자 포탈 / 이행·변화관리 / 운영·조직. **머리글 클릭 시 아코디언 접기/펼치기**(`collapsedAreas` Set, 세션 한정·비영속).
- **rows** — 안건. `{id, area, item, pri, date, asis, tobe, result, action, owner, status, done, att, parentId?}`.
  - `id` — 행 고유키(`genId`/`ensureRowIds`). 후속안건 연결·삭제의 안정적 기준.
  - `parentId` — **후속안건(하위레벨 안건)**이면 부모 행 `id`를 가리킴(1단계 깊이). 부모 바로 아래 들여쓰기(번호 `1-1-1`·`↳`)·연한 톤으로 표시. 부모 삭제 시 자식 동반 삭제. **후속안건은 안건·AS-IS·TO-BE 칸을 비활성(흐리게, `td.sub-dim`)** 처리하고 **결정·검토 결과 칸부터 입력**(부모의 현행/대안을 다시 안 적음). ＋추가 시 포커스도 결과 칸으로.
  - `att`(참석자) — 쉼표/줄바꿈 구분 이름 문자열로 저장. 화면 셀은 **`👤 N명` 배지**(`parseAtt`로 인원 산출), 클릭 시 **명단 팝오버**(`openAttPop`)에서 편집(관리자) 또는 열람. 읽기용 HTML 내보내기는 전체 이름 텍스트로 출력.
- **meta** — 히어로(eyebrow/title/sub 등). 관리자 모드에서 인라인 편집. 내부 플래그 `_colWidthVer`(컬럼 폭 마이그레이션 버전) 포함.
- 상태 5종 `STATUSES` = 확정·논의중·확인필요·조치진행·검토완료(검토완료는 회색 처리). 상태·중요도 콤보는 간소 톤(연한 칩+컬러 텍스트, 셀 중앙 정렬 통일).
- 중요도 3종 `PRIORITIES` = 상·중·하.
- **표시 정렬·계층**: `orderedAreaRows(areaId, ai)`. 정렬 모드 2종(`sortMode()` ← `meta.sortMode`):
  - `"date"`(기본) — **논의일자 오름차순**(`dateKey`, 빈 일자는 뒤). 표시 전용 정렬이라 `rows` 저장 순서는 불변.
  - `"manual"` — `rows` **저장 순서 그대로**(정렬 안 함). 툴바 `#btnSort` 토글로 전환, 수동 모드에서만 번호 칸 `.row-grip`(⠿)을 드래그해 안건 재배치 → `rows` 배열 순서를 직접 바꿔 `saveData`(영속). 부모끼리/같은 부모의 후속안건끼리만 재배치(레벨·부모 유지). `rowIsTop`으로 판정.
  - 두 모드 모두 각 부모 뒤에 후속안건을 붙이고, `tr.dataset.idx`는 원본 인덱스 유지(편집/삭제 매핑 보존). 행에 `data-rid`(=row id) 부여(주간보고 이슈 링크 타깃). **화면 render · 읽기용 HTML 공통**.
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
| 사이드바 | 내장 5종(상단 고정) + 화면정의서 링크. 활성 하이라이트, **드래그 순서 변경**(관리자, `hub.items` 순서 저장), 내장 **이름 변경**(연필 `renameBuiltin`). 화면정의서 접기(영속 `hub.collapsed`). 모바일(<880px) 햄버거(`#btnNav`·스크림) |
| 산출물 미리보기 | 화면정의서 링크는 우측 `iframe`(`#delivFrame`) + `↗ 새 탭`. 내장 5종은 자체 화면 |
| WBS·일정계획(내장) | 아웃라인+간트 도구. 단계/작업 추가·들여쓰기·드래그 정렬·진척 입력, 부모 롤업, 월 눈금 간트(`renderWbs`, `vdi_wbs_v1`) |
| 주간보고(내장) | 주차별 카드(**기본 접힘 아코디언**). 기간·진척·실적/계획·이슈 작성, **이슈→관리대장 안건 링크**(`goToDecision`), ＋추가/✕삭제. 관리자 전용 편집(`renderWeekly`, `vdi_weekly_v1`) |
| 수행계획서·이행계획서(내장) | 공용 섹션문서 엔진(`makeSectionDoc`→`execDoc`/`transDoc`). 목차+본문, 제목/본문 편집·섹션 추가/삭제/순서(`vdi_plan_v1`·`vdi_transition_v1`) |
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
| 백업 (파일) | `exportBackup` → `vdi_백업_YYYYMMDD_HHMM.json`(columns·areas·rows·meta) / `importBackup`(검증+덮어쓰기 확인, **관리자 전용**) |
| 변경 이력 (버전 형상관리) | `saveData`가 저장 직전 상태를 `localStorage[STORE_KEY+"__history"]`에 자동 보관(최근 `HIST_MAX=30`, `HIST_MIN_GAP=20s` 내 연속편집은 합침). `변경 이력` 모달에서 시점 선택→`restoreHistory`로 복원(복원 직전 현재 상태도 자동 보관). **관리자 전용** |
| 영역 관리 | 이름/색/설명/순서, 영역 삭제 시 안건 동반 삭제 (모달 유지) |
| 읽기용 HTML 내보내기 | 편집 불가 정적 파일 생성(필터·검색·인쇄 내장). **배포·공유용 산출물**(관리대장 전용) |
| 인쇄/PDF | `@media print` 스타일 |

- 데이터 변경은 즉시 `saveData()`로 localStorage 자동 저장 + **저장 직전 상태를 변경 이력에 자동 스냅샷**. 잘못 수정 시 도구 › 변경 이력에서 복원, 안전 백업은 도구 › 백업 내보내기(.json).
- **디자인 방향**: 표 세로 격자 제거(가로 구분선만, `--line-faint`)·헤더 흰 배경+하단 보더·카드 라운드(`--r`)/부드러운 그림자·버튼 라운드(`--r-sm`)/고스트 위주. 골드는 액센트(활성/주요)로만. 신규 UI도 이 절제된 톤 유지.

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
