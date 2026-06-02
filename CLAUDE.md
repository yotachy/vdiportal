# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참조하는 컨텍스트 가이드입니다.

---

## 📌 프로젝트 정체성

**KB손해보험 VDI(업무가상화) 사용자 포탈 신규 구축 프로젝트의 화면정의서**입니다.
실제 동작 코드가 아닌, **수행사(개발 업체)에 전달할 UI 시안 / 화면정의서** 목적의 정적 HTML 프로토타입입니다.

- 산출물 성격: 수행사 전달용 시안 (개발 진행을 위한 기준 산출물)
- 기술 스택: **순수 HTML5 · CSS3 · Vanilla JavaScript** (빌드 도구·프레임워크·외부 라이브러리 일절 사용 안 함)
- 페르소나: 최정식 책임 / IT기획파트 / 사번 1010579 / ID jschoi0223 (가상 인물, 더미 데이터)

---

## 🎯 핵심 작업 원칙

### 1. 디자인 시스템 일관성 (최우선)

- 모든 화면은 `common.css`를 link 한다
- 색상은 `:root`에 정의된 CSS 변수만 사용. 하드코딩 금지
- 새 컴포넌트 스타일이 필요해도, 먼저 `common.css`에 정의된 클래스를 활용할 수 있는지 검토
- 페이지별 고유 스타일은 해당 HTML의 `<style>` 블록에 작성 (별도 CSS 파일 분리 금지)

### 2. 코드 스타일

- 들여쓰기 2 spaces
- HTML 속성은 큰따옴표
- SVG 아이콘은 **인라인**으로 직접 작성 (Font Awesome, Material Icons 등 외부 라이브러리 금지)
- SVG 기본 속성: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"`
- 클래스 네이밍: 케밥케이스 (`vdi-hero-body`), 의미 기반 (BEM 비유사)

### 3. 글로벌 줌

- `common.css`에 `html { zoom: 1.25 }` 적용되어 있음 (가독성 확보 목적)
- 로그인 페이지(`login.html`)만 예외로 `zoom: 0.97` (전체화면 카드 레이아웃 보정 — `100vh / 0.97`로 높이 환산)
- 신규/수정 페이지는 기본 1.25 줌을 유지 (의도적으로 리셋하지 말 것)

### 4. 한국어 우선

- 모든 UI 텍스트는 한국어
- 폰트 스택: `'Apple SD Gothic Neo', 'Malgun Gothic', '맑은 고딕', -apple-system, ...` (common.css에 정의됨)
- letter-spacing: `-0.01em` 기본, 제목은 `-0.02em ~ -0.03em`

### 5. 더미 데이터 일관성

신규 화면 제작 시 다음 더미 데이터를 일관되게 사용:

| 항목 | 값 |
|---|---|
| 사용자명 | 최정식 책임 |
| 부서 | IT기획파트 |
| 사번 | 1010579 |
| ID | jschoi0223 |
| VDI 명 | jschoi0223-main / jschoi0223-temp / jschoi0223-common |
| 헬프데스크 | 1544-8119 (평일 09:00~18:00) |
| 세션 만료 타이머 | 30분 (29:57부터 카운트다운) |

날짜는 2026년 4~6월대 기준 (예: `2026.04.24`, `2026.05.29`, 점검 공지 `06.08`).

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

신규 화면 제작 시 다음 골격을 따른다 (`portal.html` 기준).

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

<!-- TOP HEADER (portal.html과 동일) -->
<header class="top-header">
  <div class="header-logo"><span class="header-logo-text">KB손해보험</span></div>
  <div class="header-divider"></div>
  <div class="header-service-name">업무가상화 사용자 포탈</div>
  <div class="header-divider"></div>
  <div class="header-user-badge">
    <span class="hub-name">최정식 책임</span>
    <span class="hub-sep">·</span>
    <span class="hub-item">IT기획파트</span>
    <span class="hub-sep">·</span>
    <span class="hub-item">사번 <strong>1010579</strong></span>
    <span class="hub-sep">·</span>
    <span class="hub-item">ID <strong>jschoi0223</strong></span>
  </div>
  <div class="header-right">
    <div class="header-session">
      <span>세션 만료</span>
      <span class="header-session-value" id="sessionTimer">29:57</span>
    </div>
    <button class="header-btn" title="알림">...<span class="header-badge">3</span></button>
    <button class="header-btn" title="로그아웃" onclick="location.href='login.html'">...</button>
  </div>
</header>

<div class="layout">

  <!-- SIDEBAR (portal.html과 동일, active 아이템만 현재 페이지로 변경) -->
  <aside class="sidebar">
    <div class="nav-section">
      <div class="nav-label">Workspace</div>
      <a class="nav-item" href="portal.html">...내 가상PC</a>
    </div>
    <div class="nav-section">
      <div class="nav-label">신청 · 결재</div>
      <a class="nav-item" href="apply.html">...VDI 추가신청</a>
      <a class="nav-item" href="change.html">...변경 · 증설 · 반납</a>
      <a class="nav-item" href="approval.html">...결재 현황 <span class="nav-item-badge">2</span></a>
    </div>
    <div class="nav-section">
      <div class="nav-label">지원 · 서비스</div>
      <a class="nav-item" href="incident.html">...장애신고 내역</a>
      <a class="nav-item" href="notice.html">...공지사항</a>
      <a class="nav-item" href="faq.html">...FAQ</a>
      <a class="nav-item" href="qna.html">...자료실</a>
    </div>
    <div class="nav-section" style="...">
      <!-- Service Desk 카드: 1544-8119 -->
    </a>
  </aside>

  <!-- MAIN -->
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

<div class="toast" id="toast">...</div>
<script>
  // 세션 타이머 (portal.html 코드 복붙)
  // showToast 함수
</script>
</body>
</html>
```

### Active 메뉴 규칙

- 일반 페이지: 해당 페이지의 `.nav-item`에 `active` 클래스 부여
- Drill-down 페이지 (`approval-detail`, `notice-detail`, `incident-new`):
  - 부모 메뉴(`approval`, `notice`, `incident`)에 `active` 부여
  - 페이지 상단에 breadcrumb 표시: `결재 현황 › 결재 상세` 형태

---

## ⚠️ 주의사항 / 안티패턴

### ❌ 하지 말 것

- 외부 CDN 스크립트/스타일 (Bootstrap, jQuery, Tailwind 등)
- 빌드 도구 도입 (Webpack, Vite, npm 등)
- 별도 CSS 파일 분리 (common.css 외 추가 CSS 파일 만들지 않음)
- 외부 아이콘 라이브러리 (Font Awesome, Material Icons 등) — SVG 인라인만 사용
- 사용자 이미지/실제 사진 임베드 — 더미 데이터는 텍스트로만
- localStorage / sessionStorage 사용 (단순 시안이므로 원칙적으로 불필요)
  - **예외**: 로그인 인증 플래그 `sessionStorage['vdi_auth']` 한정 허용. login.html `doLogin()`에서 `'1'` 설정, 인증 페이지의 헤더 로고 `goHome()`가 값 유무로 portal.html/login.html 분기, `logout()`이 제거. 이 외 용도로는 스토리지 사용 금지.
- 실제 API 호출 (`fetch`, `XMLHttpRequest`) — 모든 동작은 mock/toast로 처리

### ✅ 권장 패턴

- 상호작용은 `showToast()` 함수로 피드백 (이미 portal.html에 정의됨)
- 모달 토글은 `.modal.open` 클래스 add/remove
- 입력 검증은 클라이언트 사이드 alert/toast 정도로 표현
- 데이터 변경 시뮬레이션이 필요하면 페이지 내 JS 객체로 mock
- 화면 간 이동은 `location.href` 또는 `<a href>`

---

## 📝 화면별 상세 작업 메모

### portal.html에 이미 구현된 핵심 패턴

다음 패턴은 portal.html에 정의되어 있어 다른 화면에서 참조 가능:

- **KPI 스트립 (`.kpi-strip`, 4열)**: 진행 중 결재건 · 최근 공지사항 · 사용자 매뉴얼(자료실) · 사이트링크. `position:relative;z-index:5`로 reveal transform stacking 이슈 회피
- **사이트링크 카드 (`.kpi.sitelink`)**: 호버/포커스 시 외부 시스템 드롭다운(`.sitelink-menu`). 맨 위 KB손해보험 공식 홈페이지 + 구분선 + e-HR 등 샘플. `overflow:visible` + 투명 브릿지(`::before`)로 호버 유지, 클릭 시 `goSite()` 토스트
- **VDI 워크스페이스 카드 (`.vw`)**: 좌측 정보(가상PC명 + 우측 유형 배지 `.vw-type`) + 모니터형 접속 버튼(`.mon-frame`, 내부에 상태 pill `.vw-status` 내장) + 우측 자원/Info 패널. 탭 전환은 `renderVdi(i)` + `VDI_LIST`
- **관리자 안내 영역 (`.vw-notice`)**: VDI 카드 하단, 클릭 시 공지 상세로 이동. 태그는 공지 분류(중요/일반)와 정합
- **세션 타이머**: setInterval 기반 카운트다운 (`#sessionTimer`)
- **Toast 메시지**: `showToast(msg)` 함수
- **새로고침 버튼 애니메이션**: `.spinning` 클래스 + `@keyframes spin`
- **헤더 동선**: 로고('KB손해보험')·서비스명 모두 `goHome()`(인증 시 portal, 아니면 login). KB손해보험 공식 홈페이지 링크는 헤더가 아니라 portal 사이트링크 드롭다운에 위치

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
