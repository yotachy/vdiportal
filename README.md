# KB손해보험 VDI 사용자 포탈 — 화면정의서 (UI Prototype)

KB손해보험 업무가상화(VDI) 사용자 포탈 구축 프로젝트의 **화면정의서 / UI 프로토타입**입니다.
순수 HTML · CSS · Vanilla JavaScript로 구현되어 별도 빌드 도구 없이 브라우저에서 바로 확인할 수 있습니다.

> 코딩 표준·구조 규칙·새 화면 추가 절차는 [`STYLE_GUIDE.md`](STYLE_GUIDE.md)를 따릅니다(단일 출처).

---

## 📋 개요

| 항목 | 내용 |
|---|---|
| 시스템 | KB손해보험 업무가상화(VDI) 사용자 포탈 |
| 산출물 | 화면정의서 / UI 프로토타입 |
| 기술 스택 | HTML5 · CSS3 · Vanilla JS (No build, No framework, No CDN) |
| 동작 방식 | 전부 화면 시연용 mock — 실제 API 호출 없음 |
| 브라우저 | Chromium 기반(Edge·Chrome), 전역 `zoom: 1` (로그인만 `0.97`) |

---

## 🗂️ 화면 목록 (13개)

| # | 파일 | 화면 | 카테고리 |
|---|---|---|---|
| 1 | `login.html` | 로그인 (2단계 인증) | — |
| 2 | `portal.html` | 메인 포탈 (내 가상PC) | Workspace |
| 3 | `apply.html` | VDI 추가신청 | 신청 · 결재 |
| 4 | `change.html` | 사용 연장 · 자원 증설 | 신청 · 결재 |
| 5 | `approval.html` | 결재 현황 | 신청 · 결재 |
| 6 | `approval-detail.html` | 결재 상세 (drill-down) | 신청 · 결재 |
| 7 | `incident.html` | 장애신고 내역 | 지원 · 서비스 |
| 8 | `incident-new.html` | 장애신고 등록 (drill-down) | 지원 · 서비스 |
| 9 | `notice.html` | 공지사항 | 지원 · 서비스 |
| 10 | `notice-detail.html` | 공지사항 상세 (drill-down) | 지원 · 서비스 |
| 11 | `notice-new.html` | 공지 등록 (관리자, drill-down) | 지원 · 서비스 |
| 12 | `faq.html` | FAQ | 지원 · 서비스 |
| 13 | `qna.html` | 자료실 | 지원 · 서비스 |

> 목록 → drill-down 상세 동선, 더미 데이터, 분류 체계가 화면 간 정합되도록 유지합니다.
> 화면정의서 문서는 `deliverables/`에 별도 HTML로 작성하며 `deliverables/index.html`에서 관리합니다.

---

## 🧱 공통 구조

헤더·사이드바·인증·토스트·페이징·기간필터·관리자모드 등 **공통 요소는 `common.css`·`common.js` 두 파일에만** 있습니다. 각 화면은 placeholder와 스크립트 한 줄만 두고 본문만 작성합니다.

```html
<header class="top-header" data-header></header>            <!-- common.js 가 헤더 주입 -->
<aside  class="sidebar"    data-sidebar="notice"></aside>   <!-- key 로 active 메뉴 결정 -->
...
<script src="common.js"></script>   <!-- 페이지 스크립트보다 먼저 -->
```

| 파일 | 역할 |
|---|---|
| `common.css` | 디자인 토큰(`:root`) + 공통 컴포넌트 스타일 |
| `common.js` | 헤더·사이드바 렌더, 인증(`goHome`/`logout`), `showToast`, 페이징(`renderPager`), 기간 필터(`dateInRange`·`quickRangeFrom`·`maxDateOf`), 관리자 모드(`toggleAdminMode`) |

- 헤더 한 곳을 바꾸면 전 페이지에 반영됩니다.
- 사용자·헬프데스크·메뉴는 `common.js` 상단의 `PORTAL_USER` · `SERVICE_DESK` · `NAV_SECTIONS`에서 일괄 관리합니다.

---

## 🎨 디자인 시스템 요약

### 브랜드 색상 (KB CI · `common.css :root`)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--kb-yellow` | `#FFBC00` | KB Yellow(Positive) — CTA·강조 |
| `--kb-gray` / `--kb-gray-dark` | `#60584C` / `#545045` | KB Gray — 본문 보조·로고 텍스트 |
| `--admin` | `#3D4659` | 관리자용 액션 색(사용자 옐로우와 구분) |
| `--text-primary/secondary/tertiary` | `#1A1714` / `#60584C` / `#948E84` | 본문 / 보조 / 라벨 |
| `--surface` / `--bg-page` | `#FFFFFF` / `#F4F1EB` | 카드 표면 / 페이지 배경(웜 베이지) |
| `--success/warning/danger/info` | `#1E8E3E` / `#E08600` / `#D93B30` / `#1A6BD4` | 시맨틱 4종(+각 `-soft`) |

> 로고는 `kb-logo.png`(헤더·로그인·산출물 공통). 폰트 `--font-body`(KBFG Text 우선), 라운드 `--r-sm/md/lg/xl`, 그림자 `--shadow-sm/md/lg/yellow`.

### 서체

기준 서체는 KB금융 본문체(KBFG Text)이며, 폰트 파일은 **내부 정책으로 인해 외부 반출이 불가**하여 포함되지 않습니다. (미설치 환경에서는 시스템 고딕으로 자동 대체)

### 레이아웃

- **전역 줌** `html { zoom: 1 }` (로그인만 `0.97`)
- **헤더** 66px sticky + KB옐로우 3px 보더. 좌측 CI 로고·서비스명(클릭 시 홈), 우측 관리자 권한 토글·사용자 정보(이름·부서·사번)·로그아웃
- **사이드바** 264px 고정 — Workspace / 신청·결재 / 지원·서비스 섹션 + 하단 헬프데스크 카드(1544-8119)

### 주요 공통 컴포넌트

`.fc`(폼 카드) · `.fi/.fs/.fta`(입력) · `.btn`/`.btn-primary`/`.btn-outline`/`.btn-admin`(버튼) · `.rgrp/.rbtn`(라디오) · `.stepper`/`.prog-steps`(단계·진행도) · `.filter-bar`/`.filter-seg`/`.search-hero`/`.date-drop`(필터) · `.data-table`(테이블) · `.pager`(페이징) · `.modal`(모달) · `.faq-item`(아코디언) · `.warn-box`/`.info-box`(알림) · `.toast`(토스트) · `.sdot-*`(상태 점) · `.empty-state`(빈 상태) · `.admin-only`(관리자 전용 표시)

---

## 🔑 동작 패턴

- **목록 페이징** — `renderPager()`로 10건 단위. (`approval`·`incident`·`notice`·`faq`·`qna`)
- **기간 필터** — 목록 검색에 시작~종료일 + 빠른선택(최근 1주일/1개월). 진입 시 기본 1개월. (`approval`·`incident`·`notice`)
- **관리자 모드** — 헤더 토글(기본 OFF, `sessionStorage['vdi_admin']`로 유지). 켜면 `.admin-only` 요소(공지 등록·자료 등록·FAQ 관리 등)가 노출되고, 장애신고는 전체 사용자 내역까지 열람. 관리자 액션은 `.btn-admin`(슬레이트)으로 사용자 액션(옐로우)과 구분.
- **시연용 토글** — `change.html` 우상단 `시연용` 버튼(`.demo-btn`/`toggleDemoMode()`)으로 보유 VDI 상태를 전환(정상 ↔ 기본 지급만 보유)해 "연장 가능 VDI 없음" 빈 화면을 시연. `?demo=noext` URL로도 진입 가능.
- **상태/분류** — 결재 `승인중·완료·반려` 3종 · 구분 `신규·연장·증설` / 장애 긴급도 `긴급·보통` 2종 / 공지 `중요·일반` 2종(상단 고정 1건) / 가상화 종류 `고정가상화` 단일.
- **스토리지** — `sessionStorage`는 인증 플래그 `vdi_auth`, 관리자 모드 `vdi_admin` 두 키만 사용.

---

## 📁 파일 구조

```
vdiportal/
├── README.md / STYLE_GUIDE.md   ← 개요 · 소스 가이드
├── common.css / common.js       ← 디자인 토큰·공통 컴포넌트 / 공통 레이아웃·동작
├── kb-logo.png                  ← KB CI 로고(헤더·로그인·산출물 공통)
├── login.html  portal.html  apply.html  change.html
├── approval.html  approval-detail.html
├── incident.html  incident-new.html
├── notice.html  notice-detail.html  notice-new.html
├── faq.html  qna.html
└── deliverables/                 ← 화면정의서 문서
```
