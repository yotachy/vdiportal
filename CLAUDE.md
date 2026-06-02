# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참조하는 **컨텍스트 가이드**입니다.

> **문서 역할 분담**
> - [`README.md`](README.md) — 프로젝트 개요·화면 목록·실행 방법 (외부/전달용)
> - [`STYLE_GUIDE.md`](STYLE_GUIDE.md) — **코딩 표준·구조 규칙·새 화면 추가 절차** (수행사 실무용, 단일 출처)
> - `CLAUDE.md`(본 문서) — Claude 작업용 컨텍스트: 화면별 구현 메모·협업 패턴 등. 코드 규칙은 STYLE_GUIDE 를 따른다(중복 서술 지양).

---

## 📌 프로젝트 정체성

**KB손해보험 VDI(업무가상화) 사용자 포탈 신규 구축 프로젝트의 화면정의서**입니다.
실제 동작 코드가 아닌, **수행사(개발 업체)에 전달할 UI 시안 / 화면정의서** 목적의 정적 HTML 프로토타입입니다.

- 산출물 성격: 수행사 전달용 시안 (개발 진행을 위한 기준 산출물)
- 기술 스택: **순수 HTML5 · CSS3 · Vanilla JavaScript** (빌드 도구·프레임워크·외부 라이브러리 일절 사용 안 함)
- 페르소나: 최정식 책임 / IT기획파트 / 사번 1010579 / ID jschoi0223 (가상 인물, 더미 데이터)

---

## 🎯 핵심 작업 원칙

> 코드 규칙 전반(기술 원칙·CSS/JS·주석·금지사항)은 [`STYLE_GUIDE.md`](STYLE_GUIDE.md)가 단일 출처. 아래는 자주 어기기 쉬운 핵심만 요약.

- **디자인 토큰만 사용**: 색상·라운드·그림자·폰트는 `common.css`의 `:root` 변수만. 하드코딩 금지. 새 스타일 전 공통 컴포넌트 재사용 검토.
- **공통은 두 파일만**: `common.css`(스타일) · `common.js`(레이아웃·동작). 페이지 고유 스타일/스크립트는 각 HTML 내부에.
- **SVG 인라인**: 기본 속성 `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"`. 외부 아이콘 라이브러리 금지.
- **들여쓰기 2 spaces · 큰따옴표 · 케밥케이스(의미 기반)**.
- **한국어 우선**: 모든 UI 텍스트 한국어, letter-spacing `-0.01em` 기본 / 제목 `-0.02em~-0.03em`.

### 글로벌 줌 (Claude 주의)

- `common.css`에 `html { zoom: 1.25 }` (가독성). 신규/수정 페이지는 이 줌을 유지하고 의도적으로 리셋하지 말 것.
- 예외: `login.html`만 `zoom: 0.97` (전체화면 카드 보정 — 높이를 `100vh / 0.97`로 환산).

### 더미 데이터 일관성

| 항목 | 값 |
|---|---|
| 사용자 | 최정식 책임 / IT기획파트 / 사번 1010579 / ID jschoi0223 |
| VDI 명 | jschoi0223-main(고정가상화) · jschoi0223-common(공용형) |
| 헬프데스크 | 1544-8119 (평일 09:00~18:00) |
| 세션 만료 | 30분 (29:57부터 카운트다운) |

날짜는 2026년 4~6월 기준 (예: `2026.04.24`, `2026.05.29`, 점검 공지 `06.08`). 사용자·헬프데스크·세션·메뉴 값은 `common.js` 설정에서 일괄 관리.

---

## 🗂️ 화면 목록 (12개)

| # | 파일명 | 화면명 | 카테고리 | 상태 |
|---|---|---|---|---|
| 1 | `login.html` | 로그인 | — | ✅ 완료 |
| 2 | `portal.html` | 메인 포탈 (내 가상PC) | Workspace | ✅ 완료 |
| 3 | `apply.html` | VDI 추가신청 | 신청 · 결재 | ✅ 완료 |
| 4 | `change.html` | 변경 · 증설 · 반납 | 신청 · 결재 | ✅ 완료 |
| 5 | `approval.html` | 결재 현황 | 신청 · 결재 | ✅ 완료 |
| 6 | `approval-detail.html` | 결재 상세 | drill-down | ✅ 완료 |
| 7 | `incident.html` | 장애신고 내역 | 지원 · 서비스 | ✅ 완료 |
| 8 | `incident-new.html` | 장애신고 등록 | drill-down | ✅ 완료 |
| 9 | `notice.html` | 공지사항 | 지원 · 서비스 | ✅ 완료 |
| 10 | `notice-detail.html` | 공지사항 상세 | drill-down | ✅ 완료 |
| 11 | `faq.html` | FAQ | 지원 · 서비스 | ✅ 완료 |
| 12 | `qna.html` | 자료실 | 지원 · 서비스 | ✅ 완료 |

### 작업 현황

**12개 화면 전체 완료.** 이후 작업은 신규 제작이 아니라 **기존 화면의 디테일 다듬기·수정**이 중심이다.
화면 간 동선(목록 → drill-down 상세), 더미 데이터, 분류 체계(예: 공지 중요/일반)가 상호 정합되도록 유지할 것.
(과거 제작 순서: 신청·결재 군 → 장애 군 → 정보 게시 군)

---

## 🧩 공통 컴포넌트 인벤토리 (common.css)

신규 화면 작성 전 반드시 아래 컴포넌트들을 우선 검토할 것.

### 레이아웃

- `.top-header` — 76px sticky 헤더 (KB옐로우 3px 하단 보더)
- `.header-logo-text` / `.header-divider` / `.header-service-name` / `.header-user-badge` — 헤더 내부 구성
- `.header-btn` / `.header-badge` / `.header-session` — 헤더 우측 액션
- `.layout` — 280px sidebar + 1fr main 그리드
- `.sidebar` / `.nav-section` / `.nav-label` / `.nav-item` / `.nav-item-badge` — 사이드바
- `.main` — 메인 영역 (padding: 32px 40px 80px)
- `.page-header` / `.page-title` / `.page-desc` / `.breadcrumb` — 페이지 상단

### 폼

- `.fc` — 폼 카드 컨테이너
- `.fc-head` — 카드 헤더 (160px 라벨 + 1fr 컨트롤 그리드)
- `.fc-title` (옵션 SVG 17px), `.fc-ctrl`, `.fc-body`
- `.fi` — 인풋 (14px, 1.5px 보더)
- `.fs` — 셀렉트 (커스텀 화살표 SVG)
- `.fta` — 텍스트에리어
- `.lbl` — 작은 라벨 (11px, tertiary 컬러)
- `.req` — 필수 표시 (빨간 *)

### 라디오

- `.rgrp` / `.rbtn` (옵션 `.sel`) / `.rdot`

### 단계 표시

- `.flow-steps` / `.flow-step` (옵션 `.active`) / `.flow-num` / `.flow-name` / `.flow-sub` / `.flow-arrow`
  - 신청 폼 상단 가로형 단계
- `.prog-steps` / `.prog-step` / `.prog-circle` (옵션 `.done` / `.active` / `.fail`) / `.prog-label`
  - 결재 진행 등 세로 라인형

### 버튼

- `.btn` (기본 44px, 옵션 `.btn-sm` 36px)
- `.btn-primary` — KB옐로우 배경 + 다크 텍스트
- `.btn-outline` — 화이트 배경 + 보더
- `.btn-danger` — 빨강 soft

### 상태

- `.sdot` (7px 점) + `.sdot-success` / `.sdot-warning` / `.sdot-danger` / `.sdot-info` / `.sdot-muted`

### 필터바 + 검색

- `.filter-bar` (flex, gap 10px, wrap)
- `.filter-seg` + `.fsb` (옵션 `.on`) — 세그먼티드 컨트롤
- `.search-box` (SVG 아이콘 + input) — flex:1, max-width 300px

### 테이블

- `.data-table` — 표준 데이터 테이블 (header bg-subtle, hover 효과)

### 모달

- `.modal` (옵션 `.open`) + `.modal-box` (580px, max-h 82vh)
- `.modal-close` (우상단 30px 원형)
- `.modal-title` / `.modal-meta` / `.modal-body`
- `.modal-row` / `.modal-key` (100px) / `.modal-val`

### 알림 박스

- `.warn-box` (warning 컬러 soft + 보더, SVG 15px)
- `.info-box` (info 컬러 soft + 보더)

### FAQ

- `.faq-item` (옵션 `.open`) / `.faq-q` / `.faq-q-num` / `.faq-chevron` / `.faq-a`

### 토스트

- `.toast` (옵션 `.show`) — 우하단 32px, 다크 배경

### 보조

- `.action-bar` / `.action-hint` / `.action-btns`
- `.sep` — 1px 세로 구분선
- `.support-card` / `.support-title` / `.support-desc` / `.support-tel` — 사이드바 하단 헬프데스크 카드

---

## 🏗️ 페이지별 골격 템플릿

헤더·사이드바는 `common.js` 가 placeholder 에 주입한다. 페이지는 **본문만** 작성한다.
(상세 규칙·새 화면 추가 절차는 [`STYLE_GUIDE.md`](STYLE_GUIDE.md) 참조)

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KB손해보험 VDI 사용자 포탈 - {화면명}</title>
<link rel="stylesheet" href="common.css">
<style>
  /* 페이지별 추가 스타일 (필요한 경우만) */
</style>
</head>
<body>

<!-- 헤더: common.js 가 채움 -->
<header class="top-header" data-header></header>

<div class="layout">
  <!-- 사이드바: data-sidebar 값으로 active 메뉴 결정 -->
  <aside class="sidebar" data-sidebar="{메뉴 key}"></aside>

  <main class="main">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">{화면명}</h1>
        <p class="page-desc">{한 줄 설명}</p>
      </div>
      <div class="page-header-right">{우측 액션 버튼}</div>
    </div>

    <!-- 본문 -->

  </main>
</div>

<script src="common.js"></script>   <!-- 페이지 스크립트보다 먼저 -->
<script>
  // 페이지 고유 로직만 (goHome/logout/showToast·세션타이머는 common.js 제공)
</script>
</body>
</html>
```

- `data-sidebar` 메뉴 key: `portal` · `apply` · `change` · `approval` · `incident` · `notice` · `faq` · `qna`
- 사용자/헬프데스크/세션시간/메뉴는 `common.js` 의 `PORTAL_USER` · `SERVICE_DESK` · `SESSION_SECONDS` · `NAV_SECTIONS` 에서 한 번에 관리한다.
- 토스트 마크업은 둘 필요 없다 — `showToast()` 가 없으면 자동 생성한다.

### Active 메뉴 규칙

- 각 페이지는 `<aside class="sidebar" data-sidebar="{key}">` 의 key 로 active 가 자동 결정된다 (수동으로 `active` 클래스를 넣지 않는다).
- Drill-down 페이지 (`approval-detail`, `notice-detail`, `incident-new`):
  - 부모 메뉴 key 사용 (`approval`, `notice`, `incident`)
  - 페이지 상단에 breadcrumb 표시: `결재 현황 › 결재 상세` 형태

---

## ⚠️ 주의사항 / 패턴

금지사항 전체 목록은 [`STYLE_GUIDE.md` §9](STYLE_GUIDE.md). 아래는 Claude가 자주 마주치는 뉘앙스.

- **mock 전용**: 실제 API(`fetch`/XHR)·실제 이미지 없음. 상호작용 피드백은 `showToast(msg)`(common.js 제공, 요소 없으면 자동 생성), 모달은 `.modal.open` 토글, 입력 검증은 alert/toast 수준.
- **공통 함수 재정의 금지**: `goHome`/`logout`/`showToast`·세션타이머는 `common.js`에만. 페이지에서 다시 선언하지 말 것.
- **스토리지 예외**: `sessionStorage['vdi_auth']`만 허용. `login.html doLogin()`이 `'1'` 설정, `goHome()`이 값 유무로 portal/login 분기, `logout()`이 제거. 이 외 용도 금지.
- 화면 간 이동은 `location.href` 또는 `<a href>`, 데이터 변경 시뮬레이션은 페이지 내 JS 객체 mock.

---

## 📝 화면별 상세 작업 메모

### portal.html 고유 패턴 (구조 파악·참조용)

portal.html `<style>`/`<script>`에 정의된 페이지 고유 패턴:

- **KPI 스트립 (`.kpi-strip`, 4열)**: 진행 중 결재건 · 최근 공지사항 · 사용자 매뉴얼(자료실) · 사이트링크. `position:relative;z-index:5`로 reveal transform stacking 이슈 회피
- **사이트링크 카드 (`.kpi.sitelink`)**: 호버/포커스 시 외부 시스템 드롭다운(`.sitelink-menu`). 맨 위 KB손해보험 공식 홈페이지 + 구분선 + e-HR 등 샘플. `overflow:visible` + 투명 브릿지(`::before`)로 호버 유지, 클릭 시 `goSite()` 토스트
- **VDI 워크스페이스 카드 (`.vw`)**: 좌측 정보(가상PC명 + 우측 유형 배지 `.vw-type`) + 모니터형 접속 버튼(`.mon-frame`, 내부에 상태 pill `.vw-status` 내장) + 우측 자원/Info 패널. 탭 전환은 `renderVdi(i)` + `VDI_LIST`
- **관리자 안내 영역 (`.vw-notice`)**: VDI 카드 하단, 클릭 시 공지 상세로 이동. 태그는 공지 분류(중요/일반)와 정합
- **새로고침 버튼 애니메이션**: `.spinning` 클래스 + `@keyframes spin` (portal 고유)

> 세션 타이머·`showToast()`·`goHome()`/`logout()`·헤더/사이드바는 이제 **`common.js`** 소관(portal 아님). 헤더 로고·서비스명은 모두 `goHome()`, KB손해보험 공식 홈페이지 링크는 portal 사이트링크 드롭다운에 있음.

### 화면별 구현 메모 (참조 · 수정 시 구조 파악용)

- **login.html**: `zoom:0.97` 독립 레이아웃. 크림 배경 위 중앙 카드(`.login-shell`, 약 1520×820) = 좌측 브랜드 패널(절제된 크림 + 기능 리스트 SSO/2차인증/원격근무) + 우측 2단계 인증(STEP1 ID/PW → STEP2 OTP 6자리). 계정 도움 링크 3종(아이디 생성/비밀번호 재발급/계정 잠금 해제). 로그인 성공 시 `sessionStorage['vdi_auth']='1'`
- **apply.html**: `flow-steps` 4단계 (정보입력 → 사양선택 → 결재선 → 신청완료)
- **change.html**: 페이지 내부 탭 3개 (변경/증설/반납)
- **approval.html**: `filter-bar`(상태별 세그) + `search-box` + `data-table`. 행 클릭 시 approval-detail.html로 이동
- **approval-detail.html**: 페이지 헤더 + 신청 정보 카드 + `prog-steps` 결재 진행 + 결재 이력 테이블 + 코멘트 영역
- **incident.html**: approval.html과 동일 패턴 (filter-bar + data-table + 우측 "신규 신고" 버튼)
- **incident-new.html**: `fc` 폼 카드 여러 개 + 파일 첨부 영역 + warn-box (급한 장애는 헬프데스크 직통)
- **notice.html**: `filter-bar`(전체/중요/일반) + `search-box` + 리스트. 분류는 **중요(`ntag-important`)/일반(`ntag-normal`) 2종**. 행 클릭 시 notice-detail.html로 이동
- **notice-detail.html**: 제목 + 메타(작성자/날짜/조회수) + 본문 + 첨부 + 목록/이전/다음. `CAT`·각 항목 `cat`을 notice.html과 동일하게 유지(중요/일반)
- **faq.html**: 카테고리 탭(`filter-seg`) + 검색 + `faq-item` 아코디언
- **qna.html (자료실)**: 폴더형 좌측 카테고리 + 파일 리스트 + 다운로드 액션

---

## 🤝 사용자(타키)와의 협업 패턴

- 타키는 **간결하고 직설적인 한국어**로 요청 (예: "공지 메뉴 제거", "1544-8119로 변경")
- 한 메시지에 여러 변경사항을 나열하는 경우가 많음 — **모두 한 번에 정확히 반영**할 것
- 반복적 UI 디테일 다듬기 (간격, 폰트 크기, 색상 톤) 요청이 많음
- 새 작업 시작 시 **관련 파일 전체를 먼저 view**하여 컨텍스트 파악 후 수정
- 응답은 변경 사항을 짧게 요약하고, 결과 파일을 제시
