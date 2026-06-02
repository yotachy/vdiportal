# KB손해보험 VDI 사용자 포탈 — 화면정의서 (UI Prototype)

KB손해보험 업무가상화(VDI) 사용자 포탈 신규 구축 프로젝트의 **수행사 전달용 화면정의서 / UI 프로토타입**입니다.
순수 HTML · CSS · Vanilla JavaScript로 구현되어 별도 빌드 도구 없이 브라우저에서 바로 확인 가능합니다.

---

## 📋 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 발주처 | KB손해보험 |
| 시스템 | 업무가상화(VDI) 사용자 포탈 |
| 산출물 성격 | 화면정의서 (수행사 전달용) |
| 기술 스택 | HTML5 · CSS3 · Vanilla JS (No build, No framework) |
| 대상 페르소나 | 최정식 책임 / IT기획파트 (가상) |
| 브라우저 | Chromium 기반 (Edge, Chrome) — `zoom: 1.25` 사용 |

---

## 🗂️ 화면 목록 (총 12개)

| # | 파일명 | 화면명 | 카테고리 | 상태 |
|---|---|---|---|---|
| 1 | `login.html` | 로그인 (2단계 인증) | — | ✅ 완료 |
| 2 | `portal.html` | 메인 포탈 (내 가상PC) | Workspace | ✅ 완료 |
| 3 | `apply.html` | VDI 추가신청 | 신청 · 결재 | ✅ 완료 |
| 4 | `change.html` | 변경 · 증설 · 반납 | 신청 · 결재 | ✅ 완료 |
| 5 | `approval.html` | 결재 현황 | 신청 · 결재 | ✅ 완료 |
| 6 | `approval-detail.html` | 결재 상세 | 신청 · 결재 (drill-down) | ✅ 완료 |
| 7 | `incident.html` | 장애신고 내역 | 지원 · 서비스 | ✅ 완료 |
| 8 | `incident-new.html` | 장애신고 등록 | 지원 · 서비스 (drill-down) | ✅ 완료 |
| 9 | `notice.html` | 공지사항 (중요/일반) | 지원 · 서비스 | ✅ 완료 |
| 10 | `notice-detail.html` | 공지사항 상세 | 지원 · 서비스 (drill-down) | ✅ 완료 |
| 11 | `faq.html` | FAQ | 지원 · 서비스 | ✅ 완료 |
| 12 | `qna.html` | 자료실 | 지원 · 서비스 | ✅ 완료 |

> 12개 화면 전체 완료. 화면 간 동선(목록 → drill-down 상세), 더미 데이터, 분류 체계가 상호 정합되도록 유지합니다.

---

## 🚀 실행 방법

별도 서버나 빌드 없이 HTML 파일을 브라우저에서 바로 열면 됩니다.

```bash
# 저장소 클론
git clone https://github.com/yotachy/vdiportal.git
cd vdiportal

# 브라우저에서 열기 (macOS)
open login.html

# 또는 간이 로컬 서버 (Python 3)
python3 -m http.server 8080
# → http://localhost:8080/login.html
```

> ⚠️ 단순 파일 열기로도 동작하지만, 일부 브라우저 보안 정책으로 인해 로컬 서버 사용을 권장합니다.

---

## 🎨 디자인 시스템 요약

### 색상 토큰 (`common.css` 상단 `:root`)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--kb-yellow` | `#FFBC00` | KB 메인 컬러, CTA 버튼, 강조 |
| `--kb-yellow-dark` | `#EFA600` | hover, 강조 보더 |
| `--kb-yellow-soft` | `#FFF6DC` | 배지, active 배경, 아이콘 칩 |
| `--kb-yellow-line` | `#FFE49A` | 옐로우 soft 영역 보더 |
| `--ink` / `--kb-header` | `#1A1714` / `#211E19` | 본문 강조 잉크 · 헤더/모니터 다크 |
| `--text-primary` | `#1A1714` | 본문 |
| `--text-secondary` | `#5C564E` | 보조 텍스트 |
| `--text-tertiary` | `#948E84` | 라벨, 비활성 |
| `--surface` / `--surface-2` | `#FFFFFF` / `#FBFAF7` | 카드 표면 · 보조 표면(크림) |
| `--bg-page` / `--bg-subtle` | `#F4F1EB` / `#F7F5F0` | 페이지 배경(웜 베이지) · 미묘한 영역 |
| `--border` / `--border-strong` | `#EBE7DF` / `#DAD4C9` | 일반 보더 · 강한 보더 |
| `--success` / `--warning` / `--danger` / `--info` | `#1E8E3E` / `#E08600` / `#D93B30` / `#1A6BD4` | 시맨틱 4종 (+ 각 `-soft`) |

> 폰트 스택은 `--font-body`(KBFG Text → Apple SD Gothic Neo → Malgun Gothic …), 라운드는 `--r-sm/md/lg/xl`(8/12/16/22px), 그림자는 `--shadow-sm/md/lg/yellow`를 사용합니다.

### 레이아웃 규칙

- **전역 줌**: `html { zoom: 1.25 }` — 가독성 확보 (로그인 페이지만 `zoom: 0.97` 리셋 — 전체화면 보정)
- **헤더**: 76px sticky, KB 옐로우 3px 하단 보더. 로고('KB손해보험')·서비스명('업무가상화 사용자 포탈') 모두 포탈 홈(`goHome`)으로 이동
- **사이드바**: 280px 고정, 카테고리별 섹션(Workspace / 신청·결재 / 지원·서비스), active 아이템 강조 + 하단 Service Desk 카드(1544-8119)
- **메인**: 패딩 32px 40px 80px (인증 페이지 공통)
- **로그인**: 헤더/사이드바 없는 독립 레이아웃 — 크림 배경 위 중앙 카드(`.login-shell`)에 좌측 브랜드 패널 + 우측 2단계 인증 폼

### 주요 공통 컴포넌트

`common.css`에 정의된 재사용 가능한 컴포넌트들:

- **`.fc` / `.fc-head` / `.fc-body`** — 폼 카드 (제목 그리드 정렬: 160px 1fr)
- **`.fi` / `.fs` / `.fta`** — 인풋, 셀렉트, 텍스트에리어
- **`.btn` / `.btn-primary` / `.btn-outline` / `.btn-danger` / `.btn-sm`** — 버튼 패밀리
- **`.rgrp` / `.rbtn` / `.rdot`** — 라디오 그룹
- **`.flow-steps` / `.flow-step`** — 가로형 단계 표시
- **`.prog-steps` / `.prog-circle`** — 진행도 표시 (결재 진행 등)
- **`.filter-bar` / `.filter-seg` / `.fsb` / `.search-box`** — 목록 상단 필터바
- **`.data-table`** — 표준 데이터 테이블
- **`.modal` / `.modal-box`** — 모달 다이얼로그
- **`.faq-item` / `.faq-q` / `.faq-a`** — FAQ 아코디언
- **`.warn-box` / `.info-box`** — 알림 박스 (warning / info)
- **`.toast`** — 토스트 메시지
- **`.sdot-success` / `.sdot-warning` / ...** — 상태 점 (status dot)

### portal.html 주요 인터랙션 (페이지 고유 스타일)

- **KPI 4종 카드** — 진행 중 결재건 · 최근 공지사항 · 사용자 매뉴얼(자료실) · **사이트링크**(롤오버 드롭다운: KB손해보험 공식 홈페이지 + e-HR·그룹웨어·전자결재·경비처리·사내 인트라넷 등 외부 시스템)
- **VDI 워크스페이스 카드** — 모니터형 접속 버튼(상태 pill 내장) · 가상PC명 우측 유형 배지(고정가상화/공용형) · 자원/Info 패널 · 탭 전환(`renderVdi`)
- **세션 타이머 / `showToast()` / 새로고침 스핀** — 다른 화면에서도 재사용

---

## 📁 파일 구조

```
vdiportal/
├── README.md              ← 본 문서
├── CLAUDE.md              ← Claude Code 협업용 컨텍스트
├── common.css             ← 디자인 시스템(:root 토큰) + 공통 컴포넌트
├── login.html             ← 로그인 (독립 레이아웃, 중앙 카드 + 2단계 인증)
├── portal.html            ← 메인 포탈 (KPI 4종 · VDI 워크스페이스 카드 · 사이트링크)
├── apply.html             ← VDI 추가신청
├── change.html            ← 변경 · 증설 · 반납
├── approval.html          ← 결재 현황
├── approval-detail.html   ← 결재 상세 (drill-down)
├── incident.html          ← 장애신고 내역
├── incident-new.html      ← 장애신고 등록 (drill-down)
├── notice.html            ← 공지사항 (중요/일반)
├── notice-detail.html     ← 공지사항 상세 (drill-down)
├── faq.html               ← FAQ
└── qna.html               ← 자료실
```

---

## 🔧 유지 · 확장 가이드

1. 수정/추가 시 **반드시 `common.css`를 link**하고 공통 컴포넌트를 우선 활용 (색상은 `:root` 토큰만 사용, 하드코딩 금지)
2. 페이지별 추가 스타일은 `<style>` 블록에 인라인으로 작성 (별도 CSS 파일 분리 안 함)
3. 모든 화면은 동일한 사이드바 + 헤더 구조 유지 (`portal.html` 기준), drill-down 페이지는 breadcrumb 표시
4. SVG 아이콘은 인라인으로 직접 작성 (외부 아이콘 라이브러리 사용 금지)
5. 더미 데이터는 페르소나 일관성 유지 (최정식 책임 / IT기획파트 / 사번 1010579 / ID jschoi0223)
6. 목록 ↔ 상세 화면은 분류·데이터를 정합 유지 (예: 공지 `중요`/`일반` 2종은 `notice.html`·`notice-detail.html` 동시 반영)

상세 작업 규칙은 `CLAUDE.md` 참고.

---

## 📞 문의

프로젝트 관련 문의는 KB손해보험 IT기획파트 담당자에게 문의 바랍니다.
