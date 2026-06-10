# KB VDI 포탈 — Bootstrap 5.3.8 구현 가이드 (수행사 전달용)

이 문서는 **이 프로토타입(화면정의서)을 Bootstrap 5.3.8 환경에서 구현**할 때의 기준입니다.

> **핵심 원칙**
> 1. **프로토타입(`*.html` + `common.css`)이 디자인 단일 출처(Source of Truth)** 입니다. Bootstrap 결과물은 이 룩앤필에 맞춰야 합니다.
> 2. **Bootstrap은 "베이스"로만 사용** — 리셋(reboot)·그리드·유틸리티·JS 플러그인(modal/dropdown/collapse)·접근성. **컴포넌트의 "기본 생김새"를 그대로 쓰지 마세요.**
> 3. KB 디자인은 **`kb-theme.css` 레이어**(Bootstrap 변수 오버라이드 + KB 토큰)로 입힙니다.
> 4. **형태가 다른 컴포넌트**(스탯 스트립·검색창·필터 알약·페이저·상태 배지)는 Bootstrap의 `btn-group`/`input-group`/`pagination`/`badge` **기본형을 쓰지 말고 커스텀**으로 만드세요. (기본형을 쓰면 "범용 Bootstrap" 느낌이 나며 KB 품질이 깨집니다 — 실제로 확인된 부분)

---

## 1. 적용 순서

```html
<link rel="stylesheet" href="bootstrap-5.3.8/bootstrap.min.css">  <!-- 1. 베이스 -->
<link rel="stylesheet" href="kb-theme.css">                       <!-- 2. KB 테마(아래 §2) -->
<!-- 3. 페이지 고유 스타일 -->
...
<script src="bootstrap-5.3.8/bootstrap.bundle.min.js"></script>
```

- **사내 폐쇄망 → CDN 불가.** `bootstrap.min.css` / `bootstrap.bundle.min.js`를 **로컬 동봉**해 정적 경로로 참조하세요.
- KB금융 본문체(KBFG Text)는 설치 PC `local()` 우선, 미설치 시 폴백. 자체 호스팅 시 `@font-face url()` 사용.

---

## 2. `kb-theme.css` (Bootstrap 변수 오버라이드 + KB 토큰)

> 색·라운드·그림자·타이포는 **반드시 토큰만** 사용. 하드코딩 금지. (값은 `common.css :root`와 동일)

```css
:root{
  /* KB 디자인 토큰 (CI 색상) */
  --kb-yellow:#FFBC00; --kb-yellow-dark:#EFA600; --kb-yellow-soft:#FFF6DC; --kb-yellow-line:#FFE49A; --kb-yellow-text:#8A6A00;
  --ink:#1A1714; --text-primary:#1A1714; --text-secondary:#60584C; --text-tertiary:#948E84;
  --surface:#FFFFFF; --surface-2:#FBFAF7; --bg-page:#F4F1EB; --bg-subtle:#F7F5F0;
  --border:#EBE7DF; --border-strong:#DAD4C9; --dot-muted:#BDB5A7;
  --success:#1E8E3E; --success-soft:#E7F4EA;
  --warning:#E08600; --warning-soft:#FDF3DD; --warn-text:#8A5800;
  --danger:#D93B30; --danger-soft:#FCEAE7;
  --info:#1A6BD4; --info-soft:#E9F1FD;
  --shadow-sm:0 1px 2px rgba(26,23,20,.04),0 1px 3px rgba(26,23,20,.05);
  --shadow-md:0 2px 4px rgba(26,23,20,.04),0 8px 20px rgba(26,23,20,.06);
  --shadow-lg:0 8px 16px rgba(26,23,20,.06),0 24px 48px rgba(26,23,20,.10);
  --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:22px;

  /* Bootstrap 전역 변수 → KB 값으로 매핑 */
  --bs-body-font-family:'KBFG Text','Apple SD Gothic Neo','Malgun Gothic',-apple-system,BlinkMacSystemFont,sans-serif;
  --bs-body-font-size:1rem; --bs-body-line-height:1.6; --bs-body-color:#1A1714; --bs-body-bg:#F4F1EB;
  --bs-border-color:#EBE7DF; --bs-primary:#FFBC00; --bs-primary-rgb:255,188,0;
  --bs-link-color:#1A1714; --bs-link-hover-color:#8A6A00;
  --bs-border-radius:12px; --bs-border-radius-sm:8px; --bs-border-radius-lg:16px;
  --bs-emphasis-color:#1A1714;
}
body{
  letter-spacing:-0.01em; -webkit-font-smoothing:antialiased;
  background:
    radial-gradient(1100px 520px at 100% -8%, rgba(255,188,0,.07), transparent 58%),
    radial-gradient(820px 480px at -8% 108%, rgba(255,188,0,.05), transparent 55%),
    var(--bg-page);
  background-attachment:fixed;
}

/* 버튼 — KB옐로우 배경 + 다크 텍스트 (Bootstrap primary는 흰 텍스트라 반드시 오버라이드) */
.btn-primary{
  --bs-btn-color:#1A1714; --bs-btn-bg:#FFBC00; --bs-btn-border-color:#FFBC00;
  --bs-btn-hover-color:#1A1714; --bs-btn-hover-bg:#EFA600; --bs-btn-hover-border-color:#EFA600;
  --bs-btn-active-bg:#EFA600; --bs-btn-active-border-color:#EFA600;
  --bs-btn-disabled-bg:#FFBC00; --bs-btn-disabled-border-color:#FFBC00; --bs-btn-disabled-color:#1A1714;
  --bs-btn-focus-shadow-rgb:255,188,0; font-weight:700;
}
.btn-outline-kb{
  --bs-btn-color:#60584C; --bs-btn-border-color:#DAD4C9; --bs-btn-bg:#fff;
  --bs-btn-hover-color:#1A1714; --bs-btn-hover-bg:#F7F5F0; --bs-btn-hover-border-color:#BDB5A7; font-weight:700;
}

/* 카드 — KB 폼카드(.fc): 16px 라운드 + 부드러운 그림자 + 웜 보더 (그림자 토큰 누락 주의!) */
.card{ --bs-card-border-radius:var(--r-lg); --bs-card-border-color:var(--border); --bs-card-bg:var(--surface);
  box-shadow:var(--shadow-sm); overflow:hidden; }

/* 테이블 — 헤더 surface-2 배경, 가운데 정렬, hover */
.table.kb-table{ font-size:14px; --bs-table-bg:transparent; margin:0; }
.kb-table thead th{ background:var(--surface-2); color:var(--text-secondary); font-size:12.5px; font-weight:700;
  border-bottom:1px solid var(--border); white-space:nowrap; text-align:center; padding:9.5px 16px; }
.kb-table tbody td{ border-bottom:1px solid var(--border); text-align:center; vertical-align:middle; padding:10.5px 16px; }
.kb-table tbody tr:last-child td{ border-bottom:none; }
.kb-table tbody tr:hover td{ background:var(--surface-2); }

/* 폼 컨트롤 — 1.5px 보더 + 옐로우 포커스 링 */
.form-control,.form-select{ border:1.5px solid var(--border-strong); border-radius:10px; font-size:14px; }
.form-control:focus,.form-select:focus{ border-color:var(--kb-yellow-dark); box-shadow:0 0 0 3px rgba(255,188,0,.18); }

/* 모달 — KB 라운드/그림자 */
.modal-content{ border:none; border-radius:var(--r-xl); box-shadow:var(--shadow-lg); }
```

---

## 3. 컴포넌트 매핑표

| KB 화면 요소 | Bootstrap | 방식 |
|---|---|---|
| 레이아웃(사이드바+본문) | `d-flex` + 커스텀 폭 | **커스텀** (264px 사이드바 + 1fr) |
| 헤더 | 유틸리티 `d-flex`만 | **커스텀** (navbar 컴포넌트 사용 안 함) |
| 폼 카드 `.fc` | `.card` | 오버라이드(§2) |
| 1차 버튼 | `.btn .btn-primary` | 오버라이드(§2, 옐로우+다크) |
| 보조 버튼 | `.btn .btn-outline-kb` | 오버라이드(§2) |
| 데이터 테이블 | `.table.kb-table` | 오버라이드(§2) |
| 입력/셀렉트/텍스트에리어 | `.form-control` `.form-select` | 오버라이드(§2) |
| 모달 | `.modal` + JS 플러그인 | 구조는 Bootstrap, 스킨은 오버라이드 |
| 아코디언(FAQ) | `.accordion` + JS | 오버라이드(보더/아이콘 KB화) |
| 토스트 | 커스텀(우하단) | **커스텀** |
| 검색창 | — | **커스텀** (§4-A) |
| 필터 칩 | — | **커스텀** (§4-B) |
| 요약 스탯 | — | **커스텀** (§4-C) |
| 상태/구분 배지 | — | **커스텀** (§4-D) |
| 페이지네이션 | `.pagination` 골격 + 스킨 | **커스텀 스킨** (§4-E) |

---

## 4. ⚠️ Bootstrap 기본형을 쓰지 말 것 (커스텀 권장)

아래는 Bootstrap 기본 컴포넌트(`input-group`/`btn-group`/`pagination`/`badge`/card 나열)를 쓰면 **KB 디자인과 형태가 달라져 품질이 깨지는** 부분입니다. 반드시 아래 커스텀 마크업/스타일로 구현하세요.

### A. 검색창 — `input-group`(분절형) ❌ → 단일 인풋 + 인셋 아이콘 ✅
```html
<div class="kb-search">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  <input type="text" placeholder="검색">
</div>
```
```css
.kb-search{ position:relative; width:340px; max-width:100%; }
.kb-search>svg{ position:absolute; left:14px; top:50%; transform:translateY(-50%); width:17px; height:17px; color:var(--text-tertiary); pointer-events:none; }
.kb-search input{ width:100%; height:40px; padding:0 14px 0 40px; border:1.5px solid var(--border-strong); border-radius:10px; background:#fff; font-size:14px; }
.kb-search input:focus{ outline:none; border-color:var(--kb-yellow-dark); box-shadow:0 0 0 3px rgba(255,188,0,.18); }
```

### B. 필터 칩 — `btn-group`(연결형) ❌ → 분리된 알약 ✅
```html
<div class="kb-filter">
  <button class="kb-fsb on">전체</button><button class="kb-fsb">승인중</button> …
</div>
```
```css
.kb-filter{ display:flex; gap:7px; flex-wrap:wrap; }
.kb-fsb{ height:36px; padding:0 15px; border-radius:100px; border:1.5px solid var(--border); background:#fff; font-size:13px; font-weight:700; color:var(--text-secondary); }
.kb-fsb:hover{ background:var(--bg-subtle); color:var(--ink); border-color:var(--border-strong); }
.kb-fsb.on{ background:var(--kb-yellow); border-color:var(--kb-yellow); color:var(--ink); }
```

### C. 요약 스탯 — 분리 카드 나열 ❌ → 단일 통합 스트립 + 구분선 ✅
```html
<div class="kb-stat-strip">
  <div class="kb-stat-chip"><div class="kb-stat-ico">…</div><div><div class="kb-stat-num">12</div><div class="kb-stat-lbl">전체</div></div></div>
  … (4칸)
</div>
```
```css
.kb-stat-strip{ display:grid; grid-template-columns:repeat(4,1fr); background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); overflow:hidden; box-shadow:var(--shadow-sm); }
.kb-stat-chip{ display:flex; align-items:center; gap:13px; padding:15px 18px; }
.kb-stat-chip+.kb-stat-chip{ border-left:1px solid var(--border); }   /* 구분선 */
.kb-stat-ico{ width:40px; height:40px; border-radius:11px; display:flex; align-items:center; justify-content:center; }
.kb-stat-num{ font-size:22px; font-weight:800; line-height:1; } .kb-stat-lbl{ font-size:12.5px; color:var(--text-secondary); margin-top:4px; }
```

### D. 상태/구분 배지 — `.badge`(기본) ❌ → KB 색 배지 ✅
```html
<span class="kb-badge kb-badge-progress"><span class="dot"></span>승인 중</span>
```
```css
.kb-badge{ display:inline-flex; align-items:center; gap:7px; padding:5px 12px; border-radius:100px; font-size:12.5px; font-weight:800; }
.kb-badge .dot{ width:7px; height:7px; border-radius:50%; }
.kb-badge-progress{ background:var(--warning-soft); color:var(--warn-text); } .kb-badge-progress .dot{ background:var(--warning); }
/* done/reject는 배경 없이 텍스트형(transparent) + 점 색만 */
.kb-badge-done{ color:var(--text-tertiary); font-weight:700; } .kb-badge-done .dot{ background:var(--success); }
```

### E. 페이저 — `.pagination` 기본(연결형) ❌ → 분리 핀 ✅
`.pagination` 골격은 쓰되 스킨을 분리형 핀으로:
```css
.kb-pager .pagination{ gap:6px; }
.kb-pager .page-link{ min-width:34px; height:34px; display:flex; align-items:center; justify-content:center; border:1.5px solid var(--border-strong); border-radius:9px; color:var(--text-secondary); font-weight:700; }
.kb-pager .page-item.active .page-link{ background:var(--kb-yellow); border-color:var(--kb-yellow); color:var(--ink); }
```

---

## 5. 더미 데이터·동작 기준

- 사용자: 최정식 책임 / IT기획파트 / 사번 1010579 / ID jschoi0223
- VDI: `jschoi0223-main`(기본 지급) · `jschoi0223-nomain`(별도 신청) — 둘 다 **고정가상화**
- 헬프데스크: 1544-8119 (평일 09:00~18:00)
- mock 동작(목록 필터/페이저/모달/토스트)은 프로토타입 JS 로직을 그대로 이식하면 됩니다. 실제 API 연동만 추가.
- 화면별 구현 메모는 `CLAUDE.md`, 코딩 표준은 `STYLE_GUIDE.md` 참조.

---

## 6. 체크리스트 (화면별 구현 후)

- [ ] 옐로우 1차 버튼이 **다크 텍스트**인가 (흰 텍스트 ❌)
- [ ] 카드에 **16px 라운드 + 부드러운 그림자**가 있는가 (납작 ❌ — 그림자 토큰 확인)
- [ ] 검색/필터/스탯/페이저가 **§4 커스텀 형태**인가 (Bootstrap 기본형 ❌)
- [ ] 색·라운드·그림자가 **토큰**으로만 지정됐는가 (하드코딩 ❌)
- [ ] 폐쇄망: Bootstrap이 **로컬 동봉**인가 (CDN ❌)
- [ ] 전 페이지 `<meta name="robots" content="noindex, nofollow">` 유지
