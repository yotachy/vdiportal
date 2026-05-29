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
| 1 | `login.html` | 로그인 | — | ✅ 완료 |
| 2 | `portal.html` | 메인 포탈 (내 가상PC) | Workspace | ✅ 완료 |
| 3 | `apply.html` | VDI 추가신청 | 신청 · 결재 | 📝 예정 |
| 4 | `change.html` | 변경 · 증설 · 반납 | 신청 · 결재 | 📝 예정 |
| 5 | `approval.html` | 결재 현황 | 신청 · 결재 | 📝 예정 |
| 6 | `approval-detail.html` | 결재 상세 | 신청 · 결재 (drill-down) | 📝 예정 |
| 7 | `incident.html` | 장애신고 내역 | 지원 · 서비스 | 📝 예정 |
| 8 | `incident-new.html` | 장애신고 등록 | 지원 · 서비스 (drill-down) | 📝 예정 |
| 9 | `notice.html` | 공지사항 | 지원 · 서비스 | 📝 예정 |
| 10 | `notice-detail.html` | 공지사항 상세 | 지원 · 서비스 (drill-down) | 📝 예정 |
| 11 | `faq.html` | FAQ | 지원 · 서비스 | 📝 예정 |
| 12 | `qna.html` | 자료실 | 지원 · 서비스 | 📝 예정 |

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
| `--kb-yellow-dark` | `#F0A500` | hover, 강조 보더 |
| `--kb-yellow-soft` | `#FFF4D0` | 배지, active 배경 |
| `--kb-header` | `#2A2620` | 상단 헤더, hero 다크 배경 |
| `--text-primary` | `#1A1A1A` | 본문 |
| `--text-secondary` | `#5A5A5A` | 보조 텍스트 |
| `--text-tertiary` | `#8A8A8A` | 라벨, 비활성 |
| `--bg-page` | `#F5F3EE` | 페이지 배경 (베이지톤) |
| `--success` / `--warning` / `--danger` / `--info` | 시맨틱 컬러 4종 + soft 4종 |

### 레이아웃 규칙

- **전역 줌**: `html { zoom: 1.25 }` — 가독성 확보 (로그인 페이지는 zoom:1 리셋)
- **헤더**: 76px sticky, KB 옐로우 3px 하단 보더
- **사이드바**: 280px 고정, 카테고리별 섹션, active 아이템 좌측 옐로우 인디케이터
- **메인**: 패딩 32px 40px 80px

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

---

## 📁 파일 구조

```
vdiportal/
├── README.md           ← 본 문서
├── CLAUDE.md           ← Claude Code 협업용 컨텍스트
├── common.css          ← 디자인 시스템 + 공통 컴포넌트
├── login.html          ← 로그인 (독립 레이아웃)
├── portal.html         ← 메인 포탈
└── (추가 화면 10개)    ← 작업 예정
```

---

## 🔧 향후 작업 가이드

1. 신규 화면 제작 시 **반드시 `common.css`를 link**하고 공통 컴포넌트를 우선 활용
2. 페이지별 추가 스타일은 `<style>` 블록에 인라인으로 작성 (별도 CSS 파일 분리 안 함)
3. 모든 화면은 동일한 사이드바 + 헤더 구조 유지 (`portal.html` 기준)
4. SVG 아이콘은 인라인으로 직접 작성 (외부 아이콘 라이브러리 사용 금지)
5. 더미 데이터는 페르소나 일관성 유지 (최정식 책임 / IT기획파트 / 사번 1010579 / ID jschoi0223)

상세 작업 규칙은 `CLAUDE.md` 참고.

---

## 📞 문의

프로젝트 관련 문의는 KB손해보험 IT기획파트 담당자에게 문의 바랍니다.
