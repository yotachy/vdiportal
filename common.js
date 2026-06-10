/* ============================================================
   common.js — 공통 레이아웃 · 동작 (로그인 외 모든 페이지 공용)

   [사용법] 각 페이지 body 에 placeholder 와 스크립트 한 줄만 둔다.
     <header class="top-header" data-header></header>
     <aside  class="sidebar"    data-sidebar="notice"></aside>
     ...
     <script src="common.js"></script>
     <script> // 페이지 고유 로직 </script>

   - data-sidebar 값(메뉴 key)으로 현재 메뉴 active 가 결정된다.
     drill-down 페이지는 부모 메뉴 key 를 쓴다 (예: notice-detail → "notice").
   - 헤더/사이드바 마크업과 사용자 정보·메뉴는 아래 설정만 고치면 전 페이지에 반영된다.
   ============================================================ */

/* ---------- 더미 사용자 (페르소나) ---------- */
var PORTAL_USER = { name: '최정식 책임', dept: 'IT기획파트', empNo: '1010579', id: 'jschoi0223' };

/* ---------- 헬프데스크 ---------- */
var SERVICE_DESK = { tel: '1544-8119', hours: '평일 09:00~18:00' };

/* ---------- 세션 (만료까지 남은 시간, 초) ---------- */
var SESSION_SECONDS = 20 * 60 - 3;

/* ---------- 사이드바 메뉴 정의 (순서 = 표시 순서) ----------
   key   : data-sidebar 와 매칭되는 식별자
   href  : 이동 경로
   label : 표시 이름
   icon  : SVG 내부 path 등 (viewBox/stroke 래퍼는 자동)
   badge : (선택) 우측 카운트 배지 */
var NAV_SECTIONS = [
  { label: 'Workspace', items: [
    { key: 'portal', href: 'portal.html', label: '내 가상PC',
      icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>' }
  ]},
  { label: '신청 · 결재', items: [
    { key: 'apply', href: 'apply.html', label: 'VDI 추가신청',
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>' },
    { key: 'change', href: 'change.html', label: '사용 연장 · 증설',
      icon: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>' },
    { key: 'approval', href: 'approval.html', label: '결재 현황', badge: '2',
      icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' }
  ]},
  { label: '지원 · 서비스', items: [
    { key: 'incident', href: 'incident.html', label: '장애신고 내역',
      icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
    { key: 'notice', href: 'notice.html', label: '공지사항',
      icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
    { key: 'faq', href: 'faq.html', label: 'FAQ',
      icon: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
    { key: 'qna', href: 'qna.html', label: '자료실',
      icon: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' }
  ]}
];

/* SVG 래퍼 헬퍼 */
function svgIcon(inner) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + inner + '</svg>';
}

/* ---------- 인증 ---------- */
function goHome() {
  location.href = sessionStorage.getItem('vdi_auth') === '1' ? 'portal.html' : 'login.html';
}
function logout() {
  sessionStorage.removeItem('vdi_auth');
  sessionStorage.removeItem('vdi_admin');
  location.href = 'login.html';
}

/* ---------- 토스트 (없으면 생성 후 표시) ---------- */
function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    t.innerHTML = svgIcon('<path d="M20 6L9 17l-5-5"/>').replace('stroke-width="2"', 'stroke-width="2.5"') +
      '<span id="toastMsg"></span>';
    document.body.appendChild(t);
  }
  t.querySelector('#toastMsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(function () { t.classList.remove('show'); }, 2800);
}


/* ---------- 기간(날짜 범위) 필터 ----------
   dateStr: 'YYYY.MM.DD' 또는 'YYYY.MM.DD HH:MM' / from·to: 'YYYY-MM-DD'(없으면 빈값) */
function dateInRange(dateStr, from, to) {
  var d = String(dateStr).slice(0, 10).replace(/\./g, '-');
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}
/* 빠른선택 보조 — 목록 최신 날짜 기준(YYYY-MM-DD) / 기간 시작일 계산 */
function fmtYMD(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function maxDateOf(rows) {
  return rows.reduce(function (m, r) {
    var d = String(r.date).slice(0, 10).replace(/\./g, '-');
    return d > m ? d : m;
  }, '0000-00-00');
}
function quickRangeFrom(toYMD, kind) {
  var p = toYMD.split('-').map(Number);
  var d = new Date(p[0], p[1] - 1, p[2]);
  if (kind === 'week') d.setDate(d.getDate() - 6);
  else if (kind === 'month3') d.setMonth(d.getMonth() - 3);
  else d.setMonth(d.getMonth() - 1);   // month
  return fmtYMD(d);
}

/* ---------- 기간 드롭다운 (목록 화면 공통 UI) ----------
   .date-drop 버튼 클릭으로 팝오버 토글, 바깥/빠른선택 클릭 시 닫힘.
   라벨(#dateDropLabel)은 setQuickRange/직접입력에서 갱신한다. */
var DATE_LABELS = { all: '전체 기간', week: '최근 1주일', month: '최근 1개월', month3: '최근 3개월' };
function setDateLabel(text) {
  var el = document.getElementById('dateDropLabel');
  if (el) el.textContent = text;
}
function customRangeLabel(from, to) {
  if (!from && !to) return '전체 기간';
  var f = from ? from.slice(5).replace('-', '.') : '처음';
  var t = to ? to.slice(5).replace('-', '.') : '오늘';
  return f + ' ~ ' + t;
}
function toggleDatePop(e) {
  if (e) e.stopPropagation();
  var d = document.querySelector('.date-drop');
  if (d) d.classList.toggle('open');
}
document.addEventListener('click', function (e) {
  var drop = document.querySelector('.date-drop');
  if (!drop || !drop.classList.contains('open')) return;
  if (e.target.closest('.date-drop-btn')) return;          // 토글 버튼은 onclick 처리
  if (e.target.closest('.date-quick')) { drop.classList.remove('open'); return; } // 빠른선택 → 닫기
  if (!e.target.closest('.date-pop')) drop.classList.remove('open');              // 바깥 클릭 → 닫기
});

/* ---------- 페이지네이션 (10건 단위) ----------
   el      : 컨테이너 요소 또는 id
   total   : 전체 항목 수
   page    : 현재 페이지(1-base)
   onGo(p) : 페이지 이동 콜백 */
var PAGE_SIZE = 10;
function renderPager(el, total, page, onGo) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  var pages = Math.ceil(total / PAGE_SIZE);
  el.innerHTML = '';
  if (pages <= 1) return;                       // 1페이지 이하면 페이저 숨김
  var PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>';
  var NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
  function mk(label, target, on, disabled) {
    var b = document.createElement('button');
    b.className = 'pager-btn' + (on ? ' on' : '');
    b.innerHTML = label;
    if (disabled) b.disabled = true;
    else b.addEventListener('click', function () { onGo(target); });
    return b;
  }
  el.appendChild(mk(PREV, page - 1, false, page <= 1));
  for (var i = 1; i <= pages; i++) el.appendChild(mk(String(i), i, i === page, false));
  el.appendChild(mk(NEXT, page + 1, false, page >= pages));
}

/* ---------- 세션 타이머 (헤더 #sessionTimer 카운트다운) ---------- */
function startSessionTimer(seconds) {
  var remain = seconds;
  function tick() {
    remain--;
    if (remain <= 0) { alert('세션이 만료되었습니다.'); location.href = 'login.html'; return; }
    var el = document.getElementById('sessionTimer');
    if (el) {
      var m = String(Math.floor(remain / 60)).padStart(2, '0');
      var s = String(remain % 60).padStart(2, '0');
      el.textContent = m + ':' + s;
    }
  }
  clearInterval(window.__sessionT);
  window.__sessionT = setInterval(tick, 1000);
}

/* ---------- 헤더 렌더 ---------- */
function renderHeader(el) {
  var u = PORTAL_USER;
  el.innerHTML =
    '<div class="header-logo" onclick="goHome()" style="cursor:pointer" title="홈으로"><img class="header-logo-img" src="kb-logo.png" alt="KB손해보험"></div>' +
    '<div class="header-divider"></div>' +
    '<div class="header-service-name" onclick="goHome()" style="cursor:pointer" title="포탈 홈으로">업무가상화 사용자 포탈</div>' +
    '<div class="header-divider"></div>' +
    '<div class="header-user-badge">' +
      '<span class="hub-name">' + u.name + '</span>' +
      '<span class="hub-sep">·</span>' +
      '<span class="hub-item">' + u.dept + '</span>' +
      '<span class="hub-sep">·</span>' +
      '<span class="hub-item">사번 <strong>' + u.empNo + '</strong></span>' +
      '<span class="hub-sep">·</span>' +
      '<span class="hub-item">ID <strong>' + u.id + '</strong></span>' +
    '</div>' +
    '<div class="header-right">' +
      '<button class="header-admin-btn" id="headerAdminBtn" onclick="toggleAdminMode(this)" title="관리자 권한 전환 (관리자 전용 버튼 표시)">' +
        svgIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>') + '<span class="ham-label">관리자 권한</span></button>' +
      '<div class="header-session"><span>세션 만료</span><span class="header-session-value" id="sessionTimer">19:57</span></div>' +
      '<button class="header-btn" title="로그아웃" onclick="logout()">' + svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>') + '</button>' +
    '</div>';
}

/* ---------- 사이드바 렌더 (active = 현재 메뉴 key) ---------- */
function renderSidebar(el, active) {
  var nav = NAV_SECTIONS.map(function (sec) {
    var items = sec.items.map(function (it) {
      return '<a class="nav-item' + (it.key === active ? ' active' : '') + '" href="' + it.href + '">' +
        svgIcon(it.icon) + it.label +
        (it.badge ? '<span class="nav-item-badge">' + it.badge + '</span>' : '') +
        '</a>';
    }).join('');
    return '<div class="nav-section"><div class="nav-label">' + sec.label + '</div>' + items + '</div>';
  }).join('');

  el.innerHTML =
    '<div style="flex:1">' + nav + '</div>' +
    '<div class="sidebar-bottom">' +
      '<div class="support-card">' +
        '<div class="support-title">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
          '헬프데스크' +
        '</div>' +
        '<div class="support-desc">VDI 관련 문의 · ' + SERVICE_DESK.hours + '</div>' +
        '<div class="support-tel">' + SERVICE_DESK.tel + '</div>' +
      '</div>' +
    '</div>';
}

/* ---------- 관리자 권한 토글 (관리자 전용 버튼 .admin-only 표시) ----------
   기본 OFF → 관리자 전용 버튼은 사용자에게 보이지 않음. 토글 시 body.admin-mode 부여.
   페이지별 추가 처리는 window.onAdminModeChange(on) 훅으로 연결. */
function toggleAdminMode(btn) {
  var on = document.body.classList.toggle('admin-mode');
  try { if (on) sessionStorage.setItem('vdi_admin', '1'); else sessionStorage.removeItem('vdi_admin'); } catch (e) {}
  btn.classList.toggle('on', on);
  var lbl = btn.querySelector('.ham-label');
  if (lbl) lbl.textContent = on ? '관리자 권한 ON' : '관리자 권한';
  if (typeof window.onAdminModeChange === 'function') window.onAdminModeChange(on);
}

/* 저장된 관리자 권한 복원 (페이지 이동에도 유지) — 헤더 렌더 직후 호출 */
function restoreAdminMode() {
  var on = false;
  try { on = sessionStorage.getItem('vdi_admin') === '1'; } catch (e) {}
  if (!on) return;
  document.body.classList.add('admin-mode');
  var ab = document.getElementById('headerAdminBtn');
  if (ab) {
    ab.classList.add('on');
    var lbl = ab.querySelector('.ham-label');
    if (lbl) lbl.textContent = '관리자 권한 ON';
  }
}

/* ---------- 초기화 (스크립트는 body 끝에서 로드 → DOM 준비됨) ---------- */
(function init() {
  var header = document.querySelector('[data-header]');
  if (header) renderHeader(header);
  restoreAdminMode();   // 저장된 관리자 권한 복원 (페이지 이동에도 유지)

  var sidebar = document.querySelector('[data-sidebar]');
  if (sidebar) {
    renderSidebar(sidebar, sidebar.getAttribute('data-sidebar'));
  }

  startSessionTimer(SESSION_SECONDS);
})();
