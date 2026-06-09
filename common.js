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
var SESSION_SECONDS = 30 * 60 - 3;

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

/* ---------- 시연용 임시 토글 (영역 표시/숨김 — 의사결정 데모, 확정 후 제거) ----------
   btn.dataset.hide / dataset.show 로 라벨을 바꾼다. targetId 영역을 보였다/숨겼다 한다. */
function toggleDemo(btn, targetId) {
  var el = document.getElementById(targetId);
  if (!el) return;
  var willHide = el.style.display !== 'none';
  el.style.display = willHide ? 'none' : '';   /* '' → 스타일시트 기본값(block/grid 등) 복원 */
  btn.classList.toggle('off', willHide);
  var lbl = btn.querySelector('.demo-label');
  if (lbl) lbl.textContent = willHide ? (btn.dataset.show || '보이기') : (btn.dataset.hide || '숨기기');
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
      '<div class="header-session"><span>세션 만료</span><span class="header-session-value" id="sessionTimer">29:57</span></div>' +
      '<button class="header-btn" title="알림">' + svgIcon('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') + '<span class="header-badge">3</span></button>' +
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
          'Service Desk' +
        '</div>' +
        '<div class="support-desc">VDI 관련 문의 · ' + SERVICE_DESK.hours + '</div>' +
        '<div class="support-tel">' + SERVICE_DESK.tel + '</div>' +
      '</div>' +
    '</div>';
}

/* ---------- 초기화 (스크립트는 body 끝에서 로드 → DOM 준비됨) ---------- */
(function init() {
  var header = document.querySelector('[data-header]');
  if (header) renderHeader(header);

  var sidebar = document.querySelector('[data-sidebar]');
  if (sidebar) renderSidebar(sidebar, sidebar.getAttribute('data-sidebar'));

  startSessionTimer(SESSION_SECONDS);
})();
