# 코딩 표준 · 구조 가이드 (수행사용)

KB손해보험 VDI 사용자 포탈 화면정의서의 **소스 구조와 작업 규칙**입니다.
누구나 빠르게 이해하고 안전하게 수정할 수 있도록, 아래 표준을 따릅니다.

---

## 1. 기술 원칙

- **순수 HTML5 · CSS3 · Vanilla JS** 만 사용합니다. 빌드 도구·프레임워크·외부 라이브러리·CDN 금지.
- 모든 동작은 화면 시연용 mock 입니다. 실제 API 호출(`fetch`/XHR) 없이 화면 전환·`showToast()` 로 표현합니다.
- 들여쓰기 2 spaces, HTML 속성은 큰따옴표, SVG 아이콘은 인라인으로 직접 작성합니다.

---

## 2. 파일 구조와 역할

| 파일 | 역할 | 수정 빈도 |
|---|---|---|
| `common.css` | 디자인 시스템(`:root` 토큰) + 공통 컴포넌트 스타일 | 전 페이지 공통 |
| `common.js` | **공통 레이아웃(헤더·사이드바) + 공통 동작(인증·세션타이머·토스트)** | 전 페이지 공통 |
| `login.html` | 로그인 (독립 레이아웃, 공통 요소 없음) | 단독 |
| 그 외 `*.html` | 각 화면. 헤더·사이드바는 placeholder, 본문만 페이지가 보유 | 화면별 |

> 헤더·사이드바·세션타이머·로그인/홈 이동·토스트는 **`common.js` 한 곳**에만 있습니다.
> 이 영역을 바꾸려면 페이지가 아니라 `common.js` 를 수정합니다.

---

## 3. 페이지 골격 (login 제외 모든 화면)

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KB손해보험 VDI 사용자 포탈 - {화면명}</title>
  <link rel="stylesheet" href="common.css">
  <style>
    /* 이 페이지에서만 쓰는 스타일 (공통은 common.css 사용) */
  </style>
</head>
<body>

  <!-- 헤더: 내용은 common.js 가 채움 -->
  <header class="top-header" data-header></header>

  <div class="layout">
    <!-- 사이드바: data-sidebar 값으로 active 메뉴 지정 -->
    <aside class="sidebar" data-sidebar="{메뉴 key}"></aside>

    <main class="main">
      <!-- 페이지 본문 -->
    </main>
  </div>

  <script src="common.js"></script>   <!-- 항상 페이지 스크립트보다 먼저 -->
  <script>
    // 이 페이지에서만 쓰는 로직 (goHome/logout/showToast 는 common.js 제공)
  </script>
</body>
</html>
```

### `data-sidebar` 메뉴 key

| key | 화면 |
|---|---|
| `portal` | 내 가상PC |
| `apply` | VDI 추가신청 |
| `change` | 사용 연장 · 자원 증설 |
| `approval` | 결재 현황 / 결재 상세 |
| `incident` | 장애신고 내역 / 장애신고 등록 |
| `notice` | 공지사항 / 공지 상세 |
| `faq` | FAQ |
| `qna` | 자료실 |

> drill-down(상세) 페이지는 **부모 메뉴 key** 를 사용합니다. (예: `notice-detail.html` → `data-sidebar="notice"`)
> 상세 페이지 상단에는 breadcrumb 로 위치를 표시합니다.

---

## 4. 자주 하는 수정

| 무엇을 | 어디서 |
|---|---|
| 사용자명·부서·사번·ID 변경 | `common.js` → `PORTAL_USER` |
| 헬프데스크 번호·운영시간 | `common.js` → `SERVICE_DESK` |
| 세션 만료 시간 | `common.js` → `SESSION_SECONDS` |
| 사이드바 메뉴 추가/이름/순서/배지 | `common.js` → `NAV_SECTIONS` 배열 |
| 헤더 구성 변경 | `common.js` → `renderHeader()` |
| 색상·간격·폰트 등 디자인 토큰 | `common.css` → `:root` |
| 특정 화면 본문 | 해당 `*.html` 의 `<main>` 과 `<style>`·`<script>` |

### 새 화면 추가 절차

1. `portal.html` 등 기존 화면을 복사해 골격(§3)을 맞춘다.
2. `data-sidebar` 를 해당 메뉴 key 로 지정한다. (새 메뉴면 `NAV_SECTIONS` 에 항목 추가)
3. `<main>` 본문만 새로 작성하고, 공통 컴포넌트는 `common.css` 클래스를 우선 활용한다.
4. 페이지 고유 스타일/스크립트는 각 `<style>`/`<script>` 에 둔다.

---

## 5. CSS 규칙

- 색상·라운드·그림자·폰트는 **`:root` 토큰만** 사용한다. 색상값 하드코딩 금지.
- 공통 컴포넌트(`.fc`, `.btn`, `.data-table`, `.modal`, `.filter-bar` …)는 `common.css` 에 정의된 것을 먼저 검토·재사용한다.
- 페이지 고유 스타일만 해당 HTML `<style>` 블록에 둔다. **별도 CSS 파일을 추가하지 않는다.**
- 클래스 네이밍: 케밥케이스, 의미 기반 (예: `vw-notice-title`).

---

## 6. JS 규칙

- 공통 함수는 `common.js` 에만 정의한다. 페이지에서 재정의하지 않는다.
  - `goHome()` / `logout()` — 홈 이동 · 로그아웃
  - `showToast(msg)` — 우하단 토스트 (요소 없으면 자동 생성)
  - 세션 타이머는 `common.js` 로드 시 자동 시작
- 페이지 스크립트는 데이터(mock)와 화면 렌더·이벤트 바인딩만 담당한다.
- `<script src="common.js">` 는 **반드시 페이지 스크립트보다 먼저** 둔다.

---

## 7. 주석 규칙

- 주석은 **코드 자체를 설명**한다. 작업 맥락·요청 이력·산출물 메타("시안용" 등)는 쓰지 않는다.
- 섹션 구분은 `// ===== 제목 =====` 형식으로 통일한다.

---

## 8. 더미 데이터 일관성

| 항목 | 값 |
|---|---|
| 사용자 | 최정식 책임 / IT기획파트 / 사번 1010579 / ID jschoi0223 |
| VDI 명 | jschoi0223-main · jschoi0223-common |
| 헬프데스크 | 1544-8119 (평일 09:00~18:00) |
| 날짜 | 2026년 4~6월 기준 |
| 공지 분류 | 중요 · 일반 2종 (목록·상세 동일하게 유지) |

---

## 9. 금지 사항

- 외부 CDN/라이브러리(Bootstrap·jQuery·Tailwind·Font Awesome 등)
- 빌드 도구(Webpack·Vite·npm 스크립트 등)
- `common.css`/`common.js` 외 추가 공통 파일 생성
- 실제 API 호출, 실제 이미지/사진 임베드
- `sessionStorage` 는 로그인 인증 플래그 `vdi_auth` 한정으로만 사용
