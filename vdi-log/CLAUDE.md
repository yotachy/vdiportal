# CLAUDE.md — vdi-log (영역별 논의·결정사항 관리대장)

이 파일은 Claude Code가 **`vdi-log/` 디렉토리**에서 작업할 때 참조하는 컨텍스트 가이드입니다.
상위 [`../CLAUDE.md`](../CLAUDE.md)(vdiportal 포탈 화면정의서)의 규칙을 **상속**하되, 아래 내용이 충돌 시 이 문서가 vdi-log 범위에서 우선합니다.

---

## 📌 정체성

`vdi-log/log.html` = **KB손해보험 업무가상화(VDI) 구축 프로젝트의 영역별 논의·결정사항 관리대장**.
회의·업무에서 나온 안건을 영역별로 등록하고 **결정사항·후속조치·책임부서·중요도·상태**를 추적하는 단일 페이지입니다.

> ⚠️ **상위 포탈 화면정의서와 성격이 다르다.**
> - 포탈(`../*.html`) = **mock 전용 정적 UI 시안** (실제 데이터·API 없음, 화면정의서 목적).
> - vdi-log = **실제 동작하는 단일 HTML 도구**. localStorage 영속화·Excel 입출력·관리자 인증이 진짜로 동작한다. 따라서 상위 CLAUDE.md의 "mock 전용" 원칙은 **여기 적용되지 않는다.**

- 성격: 프로젝트 관리자가 실사용하는 의사결정 추적 도구 (수행사 전달 시안 아님)
- 관계: **vdiportal 하위 도구** — 같은 git 저장소, 배포는 포탈과 동일 호스트의 `/portal/vdi-log/` 경로

---

## 🛠️ 기술 스택

- **순수 HTML5 · CSS3 · Vanilla JS** — 빌드 도구·프레임워크 없음.
- **단일 파일 원칙**: 모든 CSS·JS·데이터가 `log.html` 한 파일 안에 인라인. (포탈의 `common.css`/`common.js`는 **사용하지 않는다**.)
- 외부 의존성 2개 (CDN, Excel 입출력 전용):
  - ExcelJS 4.4.0 — `Excel 내보내기`(스타일 포함 3시트)
  - SheetJS(xlsx) 0.18.5 — `Excel 가져오기`
  - CDN 미로딩 시 alert로 안내하고 기능만 비활성(나머지 동작은 유지).

## 🎨 디자인 토큰 (log.html 자체 `:root`)

포탈과 **별개의 토큰 세트**다. 색·폰트·라운드는 log.html 상단 `:root` 변수만 사용(하드코딩 금지).

| 토큰 | 값 |
|---|---|
| 폰트 | KBFG(Display/Text) → Pretendard → Noto Sans KR → Malgun Gothic 폴백 |
| 기본 글자크기 | `html{font-size:15px}` — **포탈의 `zoom:1.25` 미사용** |
| 브랜드색 | navy `#2b3a55` · gold `#f5b500` |
| 상태색 | 확정 `#0f8a6d` · 논의중 `#3b6ea5` · 확인필요 `#c0392b` · 조치진행 `#b06f00` · 검토완료 `#9aa3b0` |
| 중요도색 | 상 `#d64545` · 중 `#d99800` · 하 `#6b7785` |

- SVG 인라인(`viewBox="0 0 24 24" fill="none" stroke="currentColor"`), 들여쓰기 2 spaces, 큰따옴표, 한국어 우선.
- **noindex 필수**: `<head>`에 `<meta name="robots" content="noindex, nofollow">` 유지(상위 프로젝트 비공개 규칙).

---

## 🧱 데이터 모델 (JS 전역)

```
localStorage["vdi_decision_log_v3"] = { columns, areas, rows, meta }
```

- **columns** — 표시 컬럼 정의. `type`: `rownum`(번호 자동) · `text`(편집) · `status` · `priority`. `locked:true`는 삭제만 불가(이름·표시·요약은 변경 가능). `core:true`는 "간단히 보기"에 포함.
- **areas** — 영역(섹션). `{id, name, color, desc}`. 기본 6개: 가상화 인프라 / 계정·인사연동 / 인증·정보보호 / 사용자 포탈 / 이행·변화관리 / 운영·조직.
- **rows** — 안건. `{area, item, pri, date, asis, tobe, result, action, owner, status, done, att}`.
- **meta** — 히어로(eyebrow/title/sub 등). 관리자 모드에서 인라인 편집.
- 상태 5종 `STATUSES` = 확정·논의중·확인필요·조치진행·검토완료(검토완료는 회색 처리).
- 중요도 3종 `PRIORITIES` = 상·중·하.
- `DEFAULT_*` 상수가 초기 시드. 저장 데이터 로드 시 누락 필드 마이그레이션(`pri`/`done`/`core`) 수행 — **스키마 변경 시 마이그레이션 코드도 함께 갱신**.

## 🔐 관리자 모드

- 읽기 전용이 기본. `관리자 로그인`(비밀번호) 후에만 편집·행추가·삭제·영역/컬럼 관리·제목 편집 가능.
- 인증: `sha256(pw) === ADMIN.hash` 비교, 세션은 `sessionStorage["vdi_admin_session"]="admin"`.
- 현재 비번 해시는 `SHA-256("kb1234!")`. **암호학적 보안 아님** — 해시가 파일에 노출되고 콘솔로 우회 가능. 일반 사용자의 우발적 수정을 막는 잠금장치 수준(실제 접근통제는 서버 인증 필요). 비번 변경 시 새 해시를 `ADMIN.hash`에 반영.

---

## 🧩 기능 인벤토리

| 기능 | 비고 |
|---|---|
| 필터 | 영역 / 상태 / 중요도 셀렉트 + 활성 필터 칩(개별 해제) |
| 검색 | 안건·내용 전문 검색 + `<mark>` 하이라이트 |
| 요약 카드 | 상태별 건수, 클릭 시 상태 필터 토글 |
| 간단히 보기 | `core` 컬럼만 노출 (`simpleView`) |
| 인라인 편집 | `td[contenteditable]` — 진입 시 평문, 이탈 시 줄단위 항목 렌더(`renderCellRead`, `①·-→` 등 마커 인식) |
| 컬럼 관리(표 인라인) | **모달 없음.** 순서=헤더 드래그, 헤더 호버 `⋮` 메뉴=이름변경·요약토글·숨기기·삭제, 헤더 끝 `＋`=새 컬럼 추가·숨긴 컬럼 표시. 부동 메뉴 공통 `openPop()`/`.pop`(body에 fixed로 부착해 `.tbl-scroll` 클리핑 회피) |
| 도구 드롭다운 | 툴바 `도구 ▾`(`openToolsMenu`) — 보조 동작(Excel·읽기용·인쇄·백업/이력·가져오기·영역관리) 통합. 관리자 항목은 `isAdmin()`일 때만 노출 |
| 백업 (파일) | `exportBackup` → `vdi_백업_YYYYMMDD_HHMM.json`(columns·areas·rows·meta) / `importBackup`(검증+덮어쓰기 확인, **관리자 전용**) |
| 변경 이력 (버전 형상관리) | `saveData`가 저장 직전 상태를 `localStorage[STORE_KEY+"__history"]`에 자동 보관(최근 `HIST_MAX=30`, `HIST_MIN_GAP=20s` 내 연속편집은 합침). `변경 이력` 모달에서 시점 선택→`restoreHistory`로 복원(복원 직전 현재 상태도 자동 보관). **관리자 전용** |
| 영역 관리 | 이름/색/설명/순서, 영역 삭제 시 안건 동반 삭제 (모달 유지) |
| Excel 내보내기 | ExcelJS — 논의·결정사항 / 현황 요약 / 정의 3시트, 스타일·인쇄설정 포함 |
| Excel 가져오기 | SheetJS — 영역밴드(`■ n. 영역명`) 추적해 안건 복원, 헤더 자동 매핑, 덮어쓰기 확인 |
| 읽기용 HTML 내보내기 | 편집 불가 정적 파일 생성(필터·검색·인쇄 내장). **배포·공유용 산출물** |
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
- **데이터 무결성 우선**: 스키마(columns/rows) 변경 시 `loadData()` 마이그레이션·Excel 입출력 매핑·`exportReadonlyHtml` 템플릿을 함께 점검(저장된 사용자 데이터가 깨지지 않게).
- **noindex·한국어 우선** 유지.
- 읽기용 HTML 내보내기 결과물에도 noindex가 들어가도록(공유 산출물도 비공개) 템플릿 점검.
