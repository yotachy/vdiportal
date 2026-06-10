# 소스 가이드 (수행사용)

KB손해보험 VDI 사용자 포탈 화면정의서의 **소스 구조와 작업 규칙**입니다. 코드 규칙의 단일 출처입니다.

---

## 1. 기술 원칙

- **순수 HTML5 · CSS3 · Vanilla JS**만 사용. 빌드 도구·프레임워크·외부 라이브러리·CDN 금지.
- 모든 동작은 시연용 mock. 실제 API(`fetch`/XHR) 없이 화면 전환·`showToast()`로 표현.
- 들여쓰기 2 spaces, HTML 속성은 큰따옴표, SVG 아이콘은 인라인 작성(외부 아이콘 금지).
- **전체 비공개** — 모든 HTML `<head>`에 `<meta name="robots" content="noindex, nofollow">`. 루트에 `robots.txt`(Disallow: /).
- 수행사 전달 문서는 `deliverables/`에 독립 HTML로 작성하고 `deliverables/index.html`에서 관리(noindex 포함).

---

## 2. 파일 구조와 역할

| 파일 | 역할 |
|---|---|
| `common.css` | 디자인 토큰(`:root`) + 공통 컴포넌트 스타일 (전 페이지 공통) |
| `common.js` | 헤더·사이드바 렌더 + 공통 동작(인증·세션·토스트·페이징·기간필터·관리자모드) |
| `kb-logo.png` | KB CI 로고 (헤더·로그인·산출물 공통) |
| `login.html` | 로그인 (헤더/사이드바 없는 독립 레이아웃) |
| 그 외 `*.html` | 각 화면. 헤더·사이드바는 placeholder, 본문만 페이지가 보유 |

> 공통 영역(헤더·사이드바·인증·세션·토스트·페이징·기간필터·관리자모드)을 바꾸려면 페이지가 아니라 **`common.js`/`common.css`** 를 수정합니다.

---

## 3. 페이지 골격 (login 제외)

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">   <!-- 필수 -->
  <title>KB손해보험 VDI 사용자 포탈 - {화면명}</title>
  <link rel="stylesheet" href="common.css">
  <style>/* 이 페이지에서만 쓰는 스타일 */</style>
</head>
<body>
  <header class="top-header" data-header></header>          <!-- common.js 가 채움 -->
  <div class="layout">
    <aside class="sidebar" data-sidebar="{메뉴 key}"></aside>
    <main class="main"><!-- 본문 --></main>
  </div>
  <script src="common.js"></script>   <!-- 항상 페이지 스크립트보다 먼저 -->
  <script>/* 이 페이지 로직 (goHome/logout/showToast 등은 common.js 제공) */</script>
</body>
</html>
```

### `data-sidebar` 메뉴 key

`portal` · `apply` · `change` · `approval` · `incident` · `notice` · `faq` · `qna`

> drill-down(상세) 페이지는 **부모 메뉴 key** 를 사용하고(예: `notice-detail` → `notice`), 상단에 breadcrumb로 위치를 표시합니다.

---

## 4. 공통 동작 (`common.js` 제공 함수)

페이지에서 재정의하지 말고 그대로 호출합니다.

| 함수 | 용도 |
|---|---|
| `goHome()` / `logout()` | 홈 이동 / 로그아웃 |
| `showToast(msg)` | 우하단 토스트 (요소 없으면 자동 생성) |
| `renderPager(el, total, page, onGo)` | 10건 단위 페이징 — 컨테이너 `<div class="pager" id="...">`에 렌더 |
| `dateInRange(dateStr, from, to)` | 기간 필터 — 행 날짜가 `from~to`(YYYY-MM-DD) 범위인지 |
| `maxDateOf(rows)` / `quickRangeFrom(to, 'week'\|'month')` | 빠른선택(최근 1주일/1개월) 보조 |
| `toggleAdminMode(btn)` | 관리자 모드 ON/OFF (`sessionStorage['vdi_admin']`로 유지) |
| `toggleDemo(btn, targetId)` | 시연용 영역 숨김/표시 |

> 세션 타이머는 `common.js` 로드 시 자동 시작. 헤더/사이드바도 init에서 자동 렌더.

### 목록 화면 표준(페이징 + 기간 필터)

`approval`·`incident`·`notice`는 동일 패턴을 따릅니다.

```js
let curPage = 1;
function render() {
  const list = ROWS.filter(r =>
    okFilterAndSearch(r) && dateInRange(r.date, $('dateFrom').value, $('dateTo').value));
  const items = list.slice((curPage-1)*PAGE_SIZE, curPage*PAGE_SIZE);
  // ... items 렌더 ...
  renderPager('xxxPager', list.length, curPage, p => { curPage = p; render(); });
}
// 검색·필터·날짜 변경 시 curPage=1 후 render()
```

---

## 5. CSS 규칙

- 색상·라운드·그림자·폰트는 **`:root` 토큰만** 사용. 값 하드코딩 금지.
- 공통 컴포넌트(`.fc`, `.btn`, `.data-table`, `.modal`, `.filter-bar`, `.pager`, `.date-range` …)를 먼저 검토·재사용.
- 페이지 고유 스타일만 해당 HTML `<style>`에. **별도 CSS 파일을 추가하지 않습니다.**
- 클래스 네이밍: 케밥케이스, 의미 기반(예: `vw-notice-title`).

### 사용자용 vs 관리자용

- 사용자 액션 버튼 = `.btn-primary`(KB 옐로우). 관리자 액션 = `.btn-admin`(슬레이트).
- 관리자 전용 요소에는 `.admin-only`를 붙입니다 → 기본 숨김, 관리자 모드에서만 노출(`body.admin-mode`).

---

## 6. 자주 하는 수정

| 무엇을 | 어디서 |
|---|---|
| 사용자명·부서·사번·ID | `common.js` → `PORTAL_USER` |
| 헬프데스크 번호·운영시간 | `common.js` → `SERVICE_DESK` |
| 세션 만료 시간 | `common.js` → `SESSION_SECONDS` |
| 사이드바 메뉴(추가·이름·순서·배지) | `common.js` → `NAV_SECTIONS` |
| 헤더 구성 | `common.js` → `renderHeader()` |
| 색상·간격·폰트 토큰 | `common.css` → `:root` |
| 페이징 건수 | `common.js` → `PAGE_SIZE` |
| 특정 화면 본문 | 해당 `*.html`의 `<main>` · `<style>` · `<script>` |

### 새 화면 추가

1. 기존 화면을 복사해 골격(§3)을 맞춘다.
2. `data-sidebar`를 메뉴 key로 지정(새 메뉴면 `NAV_SECTIONS`에 추가).
3. `<main>` 본문만 작성하고 공통 컴포넌트(`common.css`)를 우선 활용.
4. 페이지 고유 스타일/스크립트만 각 `<style>`/`<script>`에 둔다.

---

## 7. 주석 규칙

- 주석은 **코드 자체**를 설명한다. 작업 맥락·요청 이력·산출물 메타는 쓰지 않는다.
- 섹션 구분은 `// ===== 제목 =====` 형식으로 통일한다.

---

## 8. 더미 데이터 일관성

| 항목 | 값 |
|---|---|
| 사용자 | 최정식 책임 / IT기획파트 / 사번 1010579 / ID jschoi0223 |
| VDI 명 · 종류 | jschoi0223-main · jschoi0223-common (둘 다 고정가상화 — 유형 단일, 대리 신청 없음) |
| 헬프데스크 | 1544-8119 (평일 09:00~18:00) |
| 세션 | 20분 |
| 날짜 | 2026년 4~6월 기준 (목록 기본 기간 = 최근 1개월) |
| 결재 상태 | 승인중 · 완료 · 반려 (3종) / 구분: 신규 · 연장 · 증설 |
| 장애 긴급도 | 긴급 · 보통 (2종) |
| 공지 | 작성자 = 관리자 / 분류 중요·일반(상단 고정 1건) |

> 목록 ↔ 상세는 분류·데이터를 정합 유지(예: `notice.html` ↔ `notice-detail.html`, `approval.html` ↔ `approval-detail.html`).

---

## 9. 금지 사항

- 외부 CDN/라이브러리(Bootstrap·jQuery·Tailwind·Font Awesome 등)
- 빌드 도구(Webpack·Vite·npm 스크립트 등)
- `common.css`/`common.js` 외 추가 공통 파일 생성
- 실제 API 호출, 실제 이미지/사진 임베드(브랜드 로고 `kb-logo.png` 제외)
- `sessionStorage`는 `vdi_auth`(인증)·`vdi_admin`(관리자 모드) 두 키만 사용
