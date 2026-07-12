  let _railQuery = "";                 // 지표 검색어
  const _railCollapsed = new Set();    // 접힌 등급(lv 문자열)
  // 레일 표시용 간결명(전체명은 툴팁) — 이름 잘림 방지
  const RAIL_SHORT = { adx: "ADX", atr: "ATR", psar: "PSAR", keltner: "켈트너", donchian: "돈치안", pivot: "피벗", williams: "윌리엄스", ao: "AO", roc: "ROC", smc: "스마트머니", volumeprofile: "볼륨프로파일", cycle: "사이클" };
  function renderIndRail() {
    const el = document.getElementById("indRail"); if (!el) return;
    const types = _indTypes();
    // 지표별 파스텔(산만) 대신 Lv(등급)별 색상으로 정돈 — 같은 등급끼리 같은 색(의미: 중요도 그룹)
    const TIER_COL = { 1: "#4f8fe0", 2: "#3aa5b0", 3: "#8a92b2", 4: "#9b7fd4" };
    const rowHTML = (t, ic, lv) => { const d = BLOCK_DEFS.find(b => b.type === t) || {}; const on = _evVisible.has(t); const sel = (t === _focusInd); const w = _tw(t); const wf = Math.max(0, Math.min(1, w / 3)); const nm = RAIL_SHORT[t] || d.label || t;
      return `<div class="ir-row${on ? " on" : ""}${sel ? " sel" : ""}" data-irt="${t}" data-lv="${lv}" style="--ic:${ic || "#8a92b2"}"><div class="ir-bar" data-irbar title="${esc(d.label || t)} — 좌우 클릭·드래그 = 가중치(0~3배, 기본 ×1) · 체크박스 = 표시/2차(더블클릭=단독)"><span class="ir-fill" style="width:${(wf * 100).toFixed(1)}%"></span><span class="ir-tick" title="기본 ×1"></span><span class="ir-chk" data-irchk title="표시/2차 토글"></span><span class="ir-lbl">${esc(nm)}</span><span class="ir-wval${Math.abs(w - 1) < 0.05 ? " def" : ""}">${Math.abs(w - 1) < 0.05 ? "×1" : "×" + w.toFixed(1)}</span></div><button class="ir-edit" onclick="event.stopPropagation();_railEdit('${t}')" title="파라미터 편집(다시 누르면 닫기)">✎</button></div>`; };
    const tierHead = (lv, name, ic, cnt) => `<div class="ir-tierhead${_railCollapsed.has(String(lv)) ? " collapsed" : ""}" data-lv="${lv}" style="--tc:${ic}" onclick="_railTierToggle('${lv}')" title="클릭 = 등급 접기/펼치기"><span class="ir-caret" aria-hidden="true"></span><span class="ir-tierlv">${lv === "etc" ? "·" : "Lv" + lv}</span><span class="ir-tiername">${name}</span><span class="ir-tiercount">${cnt}</span></div>`;
    let rows = "", seen = new Set();
    IND_TIERS.forEach(tier => { const grp = tier.types.filter(t => types.includes(t)); if (!grp.length) return;
      const ic = TIER_COL[tier.lv] || "#8a92b2";
      rows += tierHead(tier.lv, tier.name, ic, grp.length);
      grp.forEach(t => { seen.add(t); rows += rowHTML(t, ic, tier.lv); }); });
    const rest = types.filter(t => !seen.has(t));
    if (rest.length) { rows += tierHead("etc", "기타", "#8a92b2", rest.length); rest.forEach(t => rows += rowHTML(t, "#8a92b2", "etc")); }
    el.innerHTML = `<div class="ir-stick"><div class="ir-head"><span>지표 조합</span><span class="ir-sub">체크=표시 · 바=가중치</span></div>` +
      `<div class="ir-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><input type="text" placeholder="지표 검색" spellcheck="false" oninput="_railSearchInput(this.value)" value="${esc(_railQuery)}"></div>` +
      `<div class="ir-top"><button class="ir-allbtn" onclick="_railAll()">${_allVisible() ? "개별" : "전체"}</button><button class="ir-preset" onclick="_toggleRailPreset(event)" title="분석 프리셋 — 차트 위 팝업으로 조합 적용">프리셋</button><button class="ir-resetw" onclick="_resetIndWeights()" title="가중치 전체를 기본값 100%로 초기화" aria-label="가중치 초기화"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button></div></div>` +
      rows;
    _railApplyVis();
    if (typeof renderPresets === "function") renderPresets();   // 표시조합 변경 → 프리셋 활성 갱신
  }
  function _railSearchInput(v) { _railQuery = v || ""; _railApplyVis(); }
  function _railTierToggle(lv) { lv = String(lv); if (_railCollapsed.has(lv)) _railCollapsed.delete(lv); else _railCollapsed.add(lv); const h = document.querySelector('.ind-rail .ir-tierhead[data-lv="' + lv + '"]'); if (h) h.classList.toggle("collapsed", _railCollapsed.has(lv)); _railApplyVis(); }
  function _railApplyVis() {   // 검색·등급접기 반영(재렌더 없이 display 토글)
    const rail = document.getElementById("indRail"); if (!rail) return;
    const q = (_railQuery || "").trim().toLowerCase();
    rail.querySelectorAll(".ir-row").forEach(r => {
      const t = r.getAttribute("data-irt"), lv = r.getAttribute("data-lv");
      const d = BLOCK_DEFS.find(b => b.type === t) || {};
      const hay = ((RAIL_SHORT[t] || "") + " " + (d.label || t) + " " + t).toLowerCase();
      const matchQ = !q || hay.indexOf(q) >= 0;
      const collapsed = !q && _railCollapsed.has(lv);   // 검색 중엔 접힘 무시
      r.style.display = (matchQ && !collapsed) ? "" : "none";
    });
    rail.querySelectorAll(".ir-tierhead").forEach(h => {
      if (q) { let any = false, n = h.nextElementSibling; while (n && n.classList && n.classList.contains("ir-row")) { if (n.style.display !== "none") { any = true; break; } n = n.nextElementSibling; } h.style.display = any ? "" : "none"; }
      else h.style.display = "";
    });
  }
  function _railEdit(type) {   // 편집 버튼: 이미 그 지표 편집중이면 분석으로 복귀, 아니면 편집 열기
    const n = boardState.nodes.find(x => x.blockType === type);
    if (n && sel.length === 1 && sel[0] === n.id) deselectAll(); else editBlock(type);
  }
  function _applyBarWeight(bar, type, clientX, final) {   // 레일 바 클릭·드래그 = 가중치(0~3×). DOM 직접갱신으로 부드럽게, 작도는 디바운스.
    const r = bar.getBoundingClientRect(); if (!r.width) return;
    const w = Math.max(0, Math.min(3, Math.round(((clientX - r.left) / r.width) * 3 * 20) / 20));
    const fill = bar.querySelector(".ir-fill"); if (fill) fill.style.width = (Math.min(1, w / 3) * 100).toFixed(1) + "%";
    const wv = bar.querySelector(".ir-wval"); if (wv) { const _def = Math.abs(w - 1) < 0.05; wv.textContent = _def ? "×1" : "×" + w.toFixed(1); wv.classList.toggle("def", _def); }
    _driftW[type] = w;
    boardState.nodes.forEach(n => { if (n.kind === "block" && n.blockType === type) n.weight = Math.round(50 * w); });
    const m = document.getElementById("tuneModal");
    if (m) { const sl = m.querySelector(`[data-tw="${type}"]`); if (sl) sl.value = w; const lab = m.querySelector(`[data-tv="${type}"]`); if (lab) lab.textContent = Math.round(w * 100) + "%"; }
    if (final) { saveDriftW(); if (typeof markDirty === "function") markDirty(); if (typeof updateTuneBtn === "function") updateTuneBtn(); }
    clearTimeout(_tuneRunT); _tuneRunT = setTimeout(() => runForge(), final ? 120 : 240);
  }
  function _setIndWeight(type, w) {   // (호환) 프로그램적 가중치 설정
    w = Math.max(0, Math.min(3, Math.round(w * 20) / 20));
    _driftW[type] = w;
    boardState.nodes.forEach(n => { if (n.kind === "block" && n.blockType === type) n.weight = Math.round(50 * w); });
    saveDriftW(); if (typeof markDirty === "function") markDirty();
    renderIndRail();
    const m = document.getElementById("tuneModal");
    if (m) { const sl = m.querySelector(`[data-tw="${type}"]`); if (sl) sl.value = w; const lab = m.querySelector(`[data-tv="${type}"]`); if (lab) lab.textContent = Math.round(w * 100) + "%"; }
    if (typeof updateTuneBtn === "function") updateTuneBtn();
    clearTimeout(_tuneRunT); _tuneRunT = setTimeout(() => runForge(), 200);
  }
  function _resetIndWeights() {   // 전체 포함 아래 버튼 — 모든 지표 가중치 기본값 100%(1×)
    _driftW = {}; saveDriftW();
    boardState.nodes.forEach(n => { if (n.kind === "block") n.weight = 50; });
    if (typeof markDirty === "function") markDirty();
    renderIndRail();
    const m = document.getElementById("tuneModal");
    if (m) m.querySelectorAll("[data-tw]").forEach(sl => { sl.value = 1; const t = sl.getAttribute("data-tw"); const lab = m.querySelector(`[data-tv="${t}"]`); if (lab) lab.textContent = "100%"; });
    if (typeof updateTuneBtn === "function") updateTuneBtn();
    runForge(); if (typeof bToast === "function") bToast("가중치 기본값 100%로 초기화");
  }
  function _saveTuneWeights() { saveDriftW(); if (typeof bToast === "function") bToast("가중치 저장됨"); toggleTunePop(); }
  function _initIndRail() {
    const el = document.getElementById("indRail"); if (!el || el._init) return; el._init = true;
    let _t = null, _drag = null;
    el.addEventListener("pointerdown", e => {
      const bar = e.target.closest && e.target.closest(".ir-bar"); if (!bar) return;   // 편집버튼은 .ir-bar 밖 → 자동 제외
      if (e.target.closest("[data-irchk]")) return;                                     // 체크박스 = 클릭 토글(드래그 X)
      const row = bar.closest(".ir-row"); _drag = { bar, type: row.dataset.irt };
      try { bar.setPointerCapture(e.pointerId); } catch (_) {}
      _applyBarWeight(_drag.bar, _drag.type, e.clientX, false); e.preventDefault();
    });
    el.addEventListener("pointermove", e => { if (_drag) _applyBarWeight(_drag.bar, _drag.type, e.clientX, false); });
    const _end = e => { if (!_drag) return; _applyBarWeight(_drag.bar, _drag.type, e.clientX, true); _drag = null; };
    el.addEventListener("pointerup", _end); el.addEventListener("pointercancel", _end);
    el.addEventListener("click", e => {
      if (!e.target.closest("[data-irchk]")) return;   // 체크박스만(바 조절은 포인터가 처리)
      const row = e.target.closest(".ir-row"); if (!row) return; const type = row.dataset.irt;
      clearTimeout(_t); _t = setTimeout(() => { _focusInd = null; if (_evVisible.has(type)) _evVisible.delete(type); else _evVisible.add(type); drawEvidence(); renderIndRail(); }, 200);
    });
    el.addEventListener("dblclick", e => {
      if (!e.target.closest("[data-irchk]")) return;
      const row = e.target.closest(".ir-row"); if (!row) return;
      clearTimeout(_t); const type = row.dataset.irt;
      _focusInd = (_focusInd === type) ? null : type; if (_focusInd) _evVisible.add(_focusInd); drawEvidence(); renderIndRail();
    });
  }
  // 분석 프리셋 — 지표 조합 저장/적용(표시·2차). 기본 4종 + 사용자 저장(localStorage).
  const _PRESET_DEF = [
    { name: "전체 종합", t: null },
    { name: "추세 중심", t: ["ma", "trend", "ichimoku", "supertrend", "adx"] },
    { name: "모멘텀 중심", t: ["rsi", "macd", "stochastic", "bollinger"] },
    { name: "스마트머니", t: ["smc", "structure", "volumeprofile", "vwap"] },
    { name: "단타·스캘핑", t: ["rsi", "stochastic", "macd", "vwap", "bollinger", "atr", "volume"] },
    { name: "스윙", t: ["trend", "ma", "macd", "rsi", "bollinger", "fib", "structure", "ichimoku"] },
    { name: "장기 투자", t: ["ma", "trend", "ichimoku", "volumeprofile", "structure", "elliott", "cycle"] },
    { name: "돌파·변동성", t: ["bollinger", "atr", "supertrend", "adx", "structure", "volume"] },
    { name: "역추세·반전", t: ["rsi", "stochastic", "bollinger", "fib", "elliott", "structure"] },
  ];
  let _userPresets = (function () { try { return JSON.parse(localStorage.getItem("scoopforge_presets") || "[]") || []; } catch (e) { return []; } })();
  function _applyPreset(types) { const t = _indTypes(); _evVisible = new Set(types ? types.filter(x => t.includes(x)) : t); _focusInd = null; drawEvidence(); if (typeof renderIndRail === "function") renderIndRail(); if (typeof bToast === "function") bToast("프리셋 적용"); }
  function _applyPresetIdx(kind, i) { const p = kind === "d" ? _PRESET_DEF[i] : _userPresets[i]; if (p) _applyPreset(p.t); }
  function _saveCurrentPreset() {
    const nm = prompt("프리셋 이름 (지금 표시중 지표 조합 저장)"); if (!nm) return;
    _userPresets.push({ name: nm.slice(0, 16), t: _indTypes().filter(x => _evVisible.has(x)) });
    try { localStorage.setItem("scoopforge_presets", JSON.stringify(_userPresets)); } catch (e) {}
    renderPresets(); if (typeof bToast === "function") bToast("프리셋 저장: " + nm);
  }
  function _delPreset(i) { _userPresets.splice(i, 1); try { localStorage.setItem("scoopforge_presets", JSON.stringify(_userPresets)); } catch (e) {} renderPresets(); }
  function _presetMatch(types) {   // 현재 표시조합(_evVisible)이 프리셋과 정확히 일치하면 활성
    const all = _indTypes(); const target = types ? types.filter(t => all.includes(t)) : all.slice();
    if (_evVisible.size !== target.length) return false;
    for (const t of target) if (!_evVisible.has(t)) return false;
    return true;
  }
  function renderPresets() {
    const el = document.getElementById("railPresetPop"); if (!el) return;
    el.innerHTML = `<div class="rpset-head"><span>조합을 눌러 빠르게 적용</span><button class="side-btn" onclick="_saveCurrentPreset()" title="현재 표시 조합 저장">＋ 저장</button></div>` +
      `<div class="pset-list">` +
      _PRESET_DEF.map((p, i) => `<button class="pset-btn${_presetMatch(p.t) ? " on" : ""}" onclick="_applyPresetIdx('d',${i})">${esc(p.name)}</button>`).join("") +
      _userPresets.map((p, i) => `<span class="pset-wrap"><button class="pset-btn${_presetMatch(p.t) ? " on" : ""}" onclick="_applyPresetIdx('u',${i})">${esc(p.name)}</button><button class="pset-del" onclick="_delPreset(${i})" title="삭제">✕</button></span>`).join("") +
      `</div>`;
  }
  let _panelAlignMode = "h";
  function _alignPanels() {
    const open = ["playHud", "analyzeLog", "chartPresetPop"].map(id => document.getElementById(id)).filter(p => p && p.classList.contains("on"));
    if (!open.length) return;
    _panelAlignMode = _panelAlignMode === "v" ? "h" : "v";   // 누를 때마다 수직↔수평
    let x = 14, y = 66; const gap = 10;
    open.forEach(p => { p.style.right = "auto"; p.style.left = x + "px"; p.style.top = y + "px"; if (_panelAlignMode === "v") y += p.offsetHeight + gap; else x += p.offsetWidth + gap; });
    open.forEach(p => { const k = p.id === "playHud" ? "scoopforge_hud_play" : p.id === "analyzeLog" ? "scoopforge_hud_log" : "scoopforge_hud_preset"; if (typeof _saveHudPos === "function") _saveHudPos(k, p); });
    if (typeof bToast === "function") bToast(_panelAlignMode === "v" ? "창 수직 정렬" : "창 수평 정렬");
  }
  window._alignPanels = _alignPanels;
  function _toggleRailPreset(e) { if (e) e.stopPropagation(); const p = document.getElementById("chartPresetPop"); if (!p) return; const on = p.classList.toggle("on"); if (on) { if (typeof renderPresets === "function") renderPresets(); if (typeof _restoreHudPos === "function") _restoreHudPos("scoopforge_hud_preset", p); } }
  /* 프리셋 창은 계속 떠있게 — 바깥 클릭 자동닫힘 제거(닫기는 ✕) */
  (function initPresetDrag() { const h = document.getElementById("chartPresetHead"), p = document.getElementById("chartPresetPop"); if (!h || !p) return; let d = null;
    h.addEventListener("pointerdown", e => { if (e.target.closest("button")) return; d = { x: e.clientX, y: e.clientY, l: p.offsetLeft, t: p.offsetTop }; try { h.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
    h.addEventListener("pointermove", e => { if (!d) return; p.style.left = Math.max(0, Math.min(window.innerWidth - 60, d.l + e.clientX - d.x)) + "px"; p.style.top = Math.max(0, Math.min(window.innerHeight - 28, d.t + e.clientY - d.y)) + "px"; p.style.right = "auto"; });
    const _pu = () => { if (d && typeof _saveHudPos === "function") _saveHudPos("scoopforge_hud_preset", p); d = null; }; h.addEventListener("pointerup", _pu); h.addEventListener("pointercancel", _pu);
    const pmin = document.getElementById("railPresetMin");   // ✕(닫기) → 최소화(접기) 버튼
    if (pmin) pmin.addEventListener("click", () => { p.classList.toggle("collapsed"); pmin.textContent = p.classList.contains("collapsed") ? "+" : "–"; });
  })();
  function _ensureGroups() { if (!Array.isArray(META.groups)) META.groups = []; if (!META.docGroups || typeof META.docGroups !== "object") META.docGroups = {}; }
  function _grpOf(docId) { _ensureGroups(); const g = META.docGroups[docId]; return (g && META.groups.some(x => x.id === g)) ? g : null; }
  function _saveGroups() { _ensureGroups(); if (SERVER_OK) saveMeta(); renderSidebar(); }
  function _addGroup() { _ensureGroups(); const name = ((typeof prompt === "function" ? prompt("새 그룹 이름 (예: 관심·보유·미국주)") : "") || "").trim(); if (!name) return; META.groups.push({ id: uid("wg"), name, collapsed: false }); _saveGroups(); if (typeof bToast === "function") bToast("그룹 추가됨"); }
  function _renameGroup(id) { _ensureGroups(); const g = META.groups.find(x => x.id === id); if (!g) return; const name = ((typeof prompt === "function" ? prompt("그룹 이름 수정", g.name) : "") || "").trim(); if (!name) return; g.name = name; _saveGroups(); }
  function _deleteGroup(id) { _ensureGroups(); const g = META.groups.find(x => x.id === id); if (!g) return; if (typeof confirm === "function" && !confirm("‘" + g.name + "’ 그룹을 삭제할까요? (종목은 미분류로 이동)")) return; META.groups = META.groups.filter(x => x.id !== id); Object.keys(META.docGroups).forEach(k => { if (META.docGroups[k] === id) delete META.docGroups[k]; }); _saveGroups(); if (typeof bToast === "function") bToast("그룹 삭제됨"); }
  function _toggleGroup(id) { _ensureGroups(); const g = META.groups.find(x => x.id === id); if (g) { g.collapsed = !g.collapsed; _saveGroups(); } }
  function _moveDocToGroup(docId, groupId) { _ensureGroups(); if (groupId) META.docGroups[docId] = groupId; else delete META.docGroups[docId]; _saveGroups(); if (typeof bToast === "function") bToast(groupId ? "그룹으로 이동" : "미분류로 이동"); }
  function renderSidebar() {
    const el = document.getElementById("forgeSide"); if (!el) return;
    _ensureGroups();
    const _actHl = _firstIdle ? null : activeId;   // 첫 진입 idle에선 어떤 종목도 선택 하이라이트 안 함
    const _docRow = d => {
      const nm = _docTicker(d) || d.title || "새 종목";
      const v = d._verdict;
      const vb = v ? `<span class="doc-vd ${v.regime}">${v.regime === "bull" ? "▲" + v.up + "%" : v.regime === "bear" ? "▼" + (100 - v.up) + "%" : "–"}</span>` : "";
      const _px = d._px, _chg = d._chg;
      const _tfr = d._tfReg;
      const _tfDot = r => `<span class="doc-tfdot ${r || "na"}"></span>`;
      const _tf = _tfr ? `<span class="doc-tf" title="일·주·월 예측 신호등 — 초록=상승·노랑=중립·빨강=하락">${_tfDot(_tfr.d)}${_tfDot(_tfr.w)}${_tfDot(_tfr.m)}</span>` : "";
      const _chgHtml = isFinite(_chg) ? `<span class="doc-chg ${_chg >= 0 ? "up" : "dn"}">${_chg >= 0 ? "▲" : "▼"}${Math.abs(_chg).toFixed(2)}%</span>` : "";
      const _momOn = (typeof _momActive !== "undefined" && _momActive);   // 순위 활성 세션에서만 배지 노출(서버에 잔존한 stale 순위 방지)
      const _hasP = isFinite(d._rsProb);   // 상대 방향 확률(v1.11 섹터 57%·v1.10 SPY 54% OOS) — 비적격은 모멘텀 폴백
      const _rsB = (_momOn && d._momRank && (_hasP || isFinite(d._mom))) ? `<span class="doc-rs" title="${_hasP ? `상대강도 순위 — ${d._rsBench} 대비 1달 아웃퍼폼 확률 ${d._rsProb}% (백테스트 OOS ${d._rsBench === "SPY" ? "54" : "57"}%·온건·참고용)` : `상대강도 순위 (12개월 모멘텀 ${d._mom >= 0 ? "+" : ""}${(d._mom * 100).toFixed(0)}%) — 검증된 팩터·온건·참고용`}">#${d._momRank}</span>` : "";
      const _momH = (_momOn && d._momRank && _hasP) ? `<span class="doc-mom ${d._rsProb >= 50 ? "up" : "dn"}" title="소속 ${d._rsBench === "SPY" ? "시장(SPY)" : "섹터(" + d._rsBench + ")"} 대비 1달 아웃퍼폼 확률 — 검증된 상대 방향 축(절대 상승/하락 아님)">${d._rsProb}%<span class="doc-mom-b">${d._rsBench}</span></span>`
        : (_momOn && d._momRank && isFinite(d._mom)) ? `<span class="doc-mom ${d._mom >= 0 ? "up" : "dn"}" title="12개월 모멘텀(상대강도) — 확률 미지원 종목(비미국주식) 폴백">${d._mom >= 0 ? "+" : ""}${(d._mom * 100).toFixed(0)}%</span>` : "";
      const sub = (isFinite(_px) || _tf || _momH) ? `<div class="doc-sub">${isFinite(_px) ? `<span class="doc-px">${_hzFmt(_px)}</span>` : ""}${_tf}${_momH}</div>` : "";
      return `<div class="doc-row${d.id === _actHl ? " active" : ""}" data-doc="${d.id}" draggable="true">
         <div class="doc-r1">${_assetHtml(d, "doc-ico")}${_rsB}<span class="doc-nm">${esc(nm)}</span>${_chgHtml}<button class="side-btn doc-del" data-docdel="${d.id}" title="목록에서 제거">✕</button></div>${sub}
       </div>`; };
    const groups = META.groups;
    const _mBusy = (typeof _momBusy !== "undefined" && _momBusy), _mAct = (typeof _momActive !== "undefined" && _momActive);
    const _byMom = (a, b) => ((a._momRank || 9999) - (b._momRank || 9999));   // 순위 활성 시 상대강도 순위 오름차순(확률군→모멘텀군)
    const ungrouped = DOCS.filter(d => !_grpOf(d.id));
    if (_mAct) ungrouped.sort(_byMom);
    const _mLbl = _mBusy ? `순위 ${_momProg.done}/${_momProg.total}…` : (_mAct ? "상대강도 해제" : "상대강도 순위");
    let sec = `<div class="side-h"><span>종목</span><span class="side-h-btns">`
      + `<button class="side-btn wg-rs${_mAct ? " on" : ""}" onclick="toggleMomRank()"${_mBusy ? " disabled" : ""} title="${_mAct ? "상대강도 표기 해제(순위·배지 제거)" : "워치리스트를 검증된 상대 방향 확률로 순위·정렬 — 소속 섹터 ETF 대비 아웃퍼폼(OOS 57%) 우선, 섹터맵 밖은 SPY 대비(54%). 비미국주식은 12개월 모멘텀 폴백으로 뒤에 배치. 온건한 edge·참고용."}">${_mLbl}</button>`
      + (_mAct ? `<button class="side-btn wg-rsx" onclick="clearMomRank()" title="순위 해제">✕</button>` : "")
      + `<button class="side-btn wg-add" onclick="_addGroup()" title="새 그룹 만들기">＋ 그룹</button></span></div>`;
    sec += `<div class="side-actions" id="addTickerSlot"><button class="side-btn" onclick="_showAddTicker()">＋ 종목 추가</button></div>`;
    sec += `<div class="wg-zone" data-wgdrop="">${ungrouped.map(_docRow).join("")}</div>`;
    groups.forEach(g => {
      const gd = DOCS.filter(d => _grpOf(d.id) === g.id);
      if (_mAct) gd.sort(_byMom);
      sec += `<div class="wg-head${g.collapsed ? " col" : ""}" data-wgdrop="${g.id}" onclick="_toggleGroup('${g.id}')"><span class="wg-caret"></span><span class="wg-name">${esc(g.name)}</span><span class="wg-count">${gd.length}</span><button class="wg-btn" onclick="event.stopPropagation();_renameGroup('${g.id}')" title="이름 수정">✎</button><button class="wg-btn" onclick="event.stopPropagation();_deleteGroup('${g.id}')" title="그룹 삭제">✕</button></div>`;
      if (!g.collapsed) sec += `<div class="wg-body" data-wgdrop="${g.id}">${gd.length ? gd.map(_docRow).join("") : `<div class="wg-empty">여기로 종목을 끌어다 놓기</div>`}</div>`;
    });
    el.innerHTML =
      `<div class="side-sec">${sec}
         <select class="doc-select" aria-label="종목 선택" onchange="switchDoc(this.value)">${DOCS.map(d => `<option value="${d.id}"${d.id === _actHl ? " selected" : ""}>${esc(_docTicker(d) || d.title || "새 종목")}</option>`).join("")}</select></div>
       <div class="side-sec" id="libSec"></div>`;
    _initDocDrag();   // 종목 드래그 정렬
    if (typeof renderIndRail === "function") { renderIndRail(); _initIndRail(); }
    if (typeof renderPresets === "function") renderPresets();
    if (window.renderLib) renderLib();   // 라이브러리 섹션(Task 4)
    if (typeof renderMobilePoji === "function") renderMobilePoji();   // 모바일 포지 칩 갱신
  }
  // 모바일 포지 가로 칩(고정 서브바)
  function renderMobilePoji() {
    const el = document.getElementById("mPoji"); if (!el) return;
    const _actHl = _firstIdle ? null : activeId;
    el.innerHTML = DOCS.map(d => `<button class="m-chip${d.id === _actHl ? " on" : ""}" onclick="switchDoc('${d.id}')" title="${esc(d.title || "")}">${_assetHtml(d, "m-chip-ico")}${esc(_docTicker(d) || d.title || "새 종목")}</button>`).join("") +
      `<button class="m-chip m-chip-add" onclick="newDoc()" title="새 포지">＋</button>`;
  }
  // 모바일: 고정 헤더 서브바 생성 + 티커를 그 안으로 이동(데스크톱 복귀 시 원위치). 본문 padding-top 보정.
  function syncMobileHead() {
    const top = document.querySelector(".forge-top"); if (!top) return;
    const shell = document.querySelector(".forge-shell"), tk = document.getElementById("tkPanel");
    const mobile = window.innerWidth <= 860;
    let sub = document.getElementById("mSub");
    if (mobile) {
      if (!sub) { sub = document.createElement("div"); sub.id = "mSub"; sub.className = "m-sub"; sub.innerHTML = `<div class="m-poji" id="mPoji"></div>`; top.insertAdjacentElement("afterend", sub); }
      if (tk && shell && tk.parentElement !== shell) shell.insertBefore(tk, shell.firstChild);   // 티커는 고정 아님 → 스크롤 본문 최상단(헤더 아래)
      const _hact = document.querySelector(".h-actions"); if (_hact && _hact.parentElement !== sub) sub.appendChild(_hact);   // 웹분석/시연 → 포지 칩 줄 우측(로그인은 헤더 상단 유지)
      renderMobilePoji();
      sub.style.top = top.offsetHeight + "px";
      const _hh = top.offsetHeight + sub.offsetHeight;
      if (shell) shell.style.paddingTop = _hh + "px";
      document.documentElement.style.setProperty("--mhead", _hh + "px");
    } else {
      const bp = document.getElementById("boardPane");
      if (tk && bp && tk.parentElement !== bp) bp.insertBefore(tk, bp.firstChild);   // 데스크톱: 티커 원위치(보드팬 최상단)
      const _hact = document.querySelector(".h-actions"), _ftop = document.querySelector(".forge-top"), _auth2 = document.querySelector(".h-auth");
      if (_hact && _ftop && _hact.parentElement !== _ftop) { if (_auth2 && _auth2.parentElement === _ftop) _ftop.insertBefore(_hact, _auth2); else _ftop.appendChild(_hact); }   // 데스크톱: h-actions 헤더 복귀(h-auth 앞)
      if (sub) sub.remove();
      if (shell) shell.style.paddingTop = "";
      document.documentElement.style.setProperty("--mhead", "0px");
    }
    if (typeof applyChartLock === "function") applyChartLock();
  }
  let _chartLock = true;   // 모바일 차트 잠금(기본 true=스크롤). false=차트 조작(팬·축·핀치)
  function applyChartLock() {
    const cv = document.getElementById("fcMainChart"), mobile = window.innerWidth <= 860;
    if (cv) cv.style.touchAction = (mobile && _chartLock) ? "pan-y" : "none";
    const b = document.getElementById("chartLockBtn");
    if (b) {
      b.style.display = mobile ? "inline-flex" : "none"; b.classList.toggle("on", !_chartLock);
      const icoMove = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3"/><path d="M2 12h20M12 2v20"/></svg>';
      const icoScroll = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8l4-4 4 4M8 16l4 4 4-4"/></svg>';
      // 라벨=탭하면 일어나는 동작. 잠금(스크롤 우선)=탭 시 차트 조작 진입 / 조작 중=탭 시 페이지 스크롤 복귀
      b.innerHTML = _chartLock ? (icoMove + "<span>차트 조작</span>") : (icoScroll + "<span>페이지 스크롤</span>");
    }
  }
  function toggleChartLock() { _chartLock = !_chartLock; applyChartLock(); if (typeof bToast === "function") bToast(_chartLock ? "스크롤 모드 — 페이지 이동" : "차트 조작 모드 — 드래그=팬·축, 두 손가락=줌"); }
  function switchDoc(id) { if (id === activeId && !_firstIdle) return; _firstIdle = false; writeBackActive(); loadDoc(id); saveMeta(); }   // 첫 진입 idle에선 활성 문서 재클릭도 로드(선택 해제 상태이므로)
  function _showAddTicker() {   // '종목 추가' → 인라인 티커 입력
    const el = document.getElementById("addTickerSlot"); if (!el) { newDoc(); return; }
    el.innerHTML = `<div class="add-tk-wrap"><input class="add-tk-in" id="addTkIn" placeholder="티커 입력 (예: TSLA · BTC/USD · 005930)" spellcheck="false" autocomplete="off"><div class="tk-sugg" id="addTkSugg" role="listbox"></div></div><button class="add-tk-go" id="addTkGo" title="추가(Enter)">추가</button>`;
    const inp = document.getElementById("addTkIn"), go = document.getElementById("addTkGo"), sugg = document.getElementById("addTkSugg");
    const submit = () => { const v = (inp.value || "").trim().toUpperCase(); _hideAddTicker(); if (v) _addTickerDoc(v); };
    _wireSuggest(inp, sugg, sym => { _hideAddTicker(); _addTickerDoc(sym); });   // 자동완성 선택 = 즉시 추가
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submit(); } else if (e.key === "Escape") { e.preventDefault(); _hideAddTicker(); } });
    go.addEventListener("mousedown", e => { e.preventDefault(); submit(); });   // mousedown → blur보다 먼저 처리
    inp.addEventListener("blur", () => { setTimeout(() => { const c = document.getElementById("addTkIn"); if (c && document.activeElement !== c) _hideAddTicker(); }, 180); });
    inp.focus();
  }
  function _hideAddTicker() { const el = document.getElementById("addTickerSlot"); if (el) el.innerHTML = `<button class="side-btn" onclick="_showAddTicker()">＋ 종목 추가</button>`; }
  async function _addTickerDoc(sym) {
    sym = _normSym(sym); if (!sym) return;   // 대문자 + 크립토 슬래시 정규화(BTC/USD)
    writeBackActive();
    const dc = { id: uid("doc"), title: sym, themeImgId: null, nodes: [], edges: [],
      view: { tx: 30, ty: 20, scale: 1 }, updated: new Date().toISOString() };
    DOCS.push(dc);
    await loadDoc(dc.id);   // loadDoc async — 전환 완료까지 대기(경합 방지)
    seedDefaultStrategy(); autoLayout("v");
    const tk = (typeof ensureTickerNode === "function") ? ensureTickerNode() : null;
    if (tk) { tk.params = tk.params || {}; tk.params.symbol = sym; }
    const tkI = document.getElementById("tkSym"); if (tkI) tkI.value = sym;
    writeBackActive(); saveMeta();
    if (typeof loadTicker === "function") loadTicker();
  }
  function newDoc() {   // 하위호환(모바일 칩 등): 슬롯 있으면 인라인, 없으면 prompt
    if (document.getElementById("addTickerSlot")) { _showAddTicker(); return; }
    const sym = ((typeof prompt === "function" ? prompt("추가할 종목 티커 (예: TSLA · BTC/USD · 005930)") : "") || "").trim();
    if (sym) _addTickerDoc(sym);
  }
  function newSampleDoc() {
    writeBackActive();
    const dc = { id: uid("doc"), title: "BTC/USD 분석 (샘플)", themeImgId: null, nodes: [], edges: [],
      view: { tx: 30, ty: 20, scale: 1 }, updated: new Date().toISOString() };
    DOCS.push(dc); loadDoc(dc.id); buildSampleForge(); autoLayout("v");
    const ad = activeDoc();
    if (ad && _visionData) ad.vision = { series: _visionData.price, bias: ForgeCore.sampleGraph().vision.bias, note: _visionNote, waves: _visionWaves };
    runForge();
    writeBackActive(); saveMeta();
    if (window.renderSidebar) renderSidebar();
    bToast("BTC/USD 샘플 포지를 추가했어요");
  }
  function renameDoc(id, title) {
    const d = DOCS.find(x => x.id === id); if (!d) return; d.title = title;
    if (id === activeId) {
      themeState.title = title; renderTheme();
      writeBackActive();
    } else {
      d.updated = new Date().toISOString();
      if (SERVER_OK) apiPost({ op: "upsert", document: d });
    }
    renderSidebar();
  }
  function deleteDoc(id) {
    if (DOCS.length <= 1) { bToast("최소 1개 포지는 필요해요"); return; }
    DOCS = DOCS.filter(d => d.id !== id);
    if (SERVER_OK) apiPost({ op: "delete", id });
    if (id === activeId) loadDoc(DOCS[0].id);
    renderSidebar(); saveMeta();
  }

  /* ── Node HTML ───────────────────────────────────────────────── */
  function weightScale(w) {
    const x = (w != null ? w : 50);
    return x <= 50 ? 0.8 + 0.2 * (x / 50) : 1.0 + 0.4 * ((x - 50) / 50); // 0→0.8, 50→1.0, 100→1.4
  }

  function nodeHTML(n) {
    const ports = "";   // 연결선 UI 제거 — 포트 없음
    const inDot = `<div class="b-n-in"></div>`;
    const isBlock = n.kind === "block";
    /* tier: 티커(입력) · 원본(price) → 중간(지표/결합) → 포지(predict) */
    const tier = n.blockType === "ticker" ? ["tkr", "티커"]
      : n.blockType === "price" ? ["src", "원본"]
        : n.blockType === "predict" ? ["pos", "포지"]
          : n.blockType === "combine" ? ["mix", "결합"]
            : isBlock ? ["ind", "지표"] : ["", ""];
    const badge = (isBlock && n.blockType)
      ? `<div class="b-n-type b-t-${tier[0]}"><span class="b-tier-tag">${tier[1]}</span>${esc(n.blockType)}</div>` : "";
    const tkrBody = n.blockType === "ticker"
      ? `<div class="b-tkr"><span class="b-tkr-sym">${esc((n.params && n.params.symbol) || "종목?")}</span><span class="b-tkr-px">${(n.params && isFinite(n.params.price)) ? _curSym() + fmtNum(n.params.price) : "현재가 미입력"}</span></div>` : "";
    const thumb = n.thumb
      ? `<div class="b-n-thumb"><img src="${imgSrc(n.thumb.imgId)}" alt=""></div>` : "";
    const cls = "b-node" + (isBlock ? "" : " b-mini") + (n.blockType === "predict" ? " b-center" : "") + (tier[0] ? " b-tier-" + tier[0] : "");
    const _seed = [...(n.id || "")].reduce((a, c) => a + c.charCodeAt(0), 0);
    const _fl = `--fdl:${((_seed % 40) / 10).toFixed(1)}s;--fdur:${(5 + (_seed % 28) / 10).toFixed(1)}s;`;
    const wt = (n.weight != null ? n.weight : 50), sf = FIXED_LAYOUT ? 1 : weightScale(wt);
    const baseW = isBlock ? W_NODE : 140;
    const cardW = Math.round(baseW * sf);
    const glow = (!FIXED_LAYOUT && wt > 55)
      ? `box-shadow:0 0 ${Math.round((wt - 55) * 0.5)}px rgba(232,180,99,${((wt - 55) / 45 * 0.6).toFixed(2)});`
      : "";
    // 중요도+확신 통합 게이지: sig(-100~+100). 방향=확신, 세기=|sig|가 중요도(가중치)로. 지표 블록에만.
    const GAUGE_TYPES = ["ma", "trend", "rsi", "bollinger", "macd", "adx", "volumeprofile", "ichimoku", "structure", "atr", "smc", "cycle", "vwap", "supertrend", "stochastic", "fib", "elliott", "phasefold", "volume", "pivot", "psar", "keltner", "donchian", "cci", "williams", "roc", "ao", "aroon", "mfi", "cmf"];
    const sig = Math.round(n.conviction || 0);
    const gCls = sig > 0 ? "g-up" : sig < 0 ? "g-dn" : "g-0";
    const gauge = (isBlock && GAUGE_TYPES.includes(n.blockType))
      ? `<div class="b-n-gauge ${gCls}">
      <div class="b-n-glabel"><span>영향력</span><span class="b-n-gval">${sig > 0 ? "▲" : sig < 0 ? "▼" : "–"}${Math.abs(sig)}</span></div>
      <input type="range" class="b-ctrl-sig" min="-100" max="100" step="1" value="${sig}" title="왼쪽 하락 · 가운데 중립 · 오른쪽 상승 — 세기가 곧 중요도">
    </div>` : "";
    return `<div class="${cls}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px;width:${cardW}px;font-size:${(13 * sf).toFixed(1)}px;${glow}${_fl}">
  ${inDot}
  <button class="b-n-del" data-nact="del" title="블록 삭제">×</button>
  ${thumb}<div class="b-n-body">
    <div class="b-n-title" contenteditable="true" data-field="title">${esc(n.title || "")}</div>
    ${tkrBody}${badge}
    ${gauge}
  </div>
  ${ports}
</div>`;
  }

  /* ── bq: node element by id ──────────────────────────────────── */
  const bq = id => bWorld ? bWorld.querySelector(`.b-node[data-id="${id}"]`) : null;

  /* ── applyNodeWeightVisual: live weight update without panel rebuild ── */
  function applyNodeWeightVisual(n) {
    if (!n) return;
    const el = bq(n.id);
    if (!el) return;
    const wt = n.weight != null ? n.weight : 50;
    const sf = weightScale(wt);
    const isBlock = n.kind === "block";
    const baseW = isBlock ? W_NODE : 140;
    el.style.width    = Math.round(baseW * sf) + "px";
    el.style.fontSize = (13 * sf).toFixed(1) + "px";
    if (wt > 55) {
      el.style.boxShadow = `0 0 ${Math.round((wt - 55) * 0.5)}px rgba(232,180,99,${((wt - 55) / 45 * 0.6).toFixed(2)})`;
    } else {
      el.style.boxShadow = "";
    }
    /* update importance badge: show only when weight !== 50 */
    let badge = el.querySelector(".b-n-wt");
    if (wt !== 50) {
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "b-n-wt";
        badge.title = "중요도";
        el.insertBefore(badge, el.firstChild);
      }
      badge.textContent = wt;
    } else {
      if (badge) badge.remove();
    }
    measure();
    paintEdges();
  }

  /* ── renderBoard ─────────────────────────────────────────────── */
  function renderBoard() {
    if (!bWorld) return;
    if (PANEL_MODE) document.body.classList.add("panel-mode");
    layoutBlocks();   // 고정 배치 좌표 항상 적용(로드·삭제 후에도 일정 · 패널모드 no-op)
    bWorld.querySelectorAll(".b-node").forEach(el => el.remove());
    // 티커는 캔버스 카드가 아니라 상단 패널로 표시(엔진 입력용 노드는 유지)
    let _list = boardState.nodes.filter(n => n.blockType !== "ticker");
    if (PANEL_MODE) {   // 패널 그리드 흐름 순서 = 블록 정의 순서
      const _ord = BLOCK_DEFS.filter(d => d.kind === "block" && d.type !== "ticker").map(d => d.type);
      const _rk = t => { const i = _ord.indexOf(t); return i < 0 ? 99 : i; };
      _list = _list.slice().sort((a, b) => (a.blockType ? _rk(a.blockType) : 98) - (b.blockType ? _rk(b.blockType) : 98));
    }
    bWorld.insertAdjacentHTML("beforeend", _list.map(nodeHTML).join(""));
    measure();
    flowLayout();   // 측정 높이로 정밀 재배치(겹침 방지)
    paintEdges();
    applySel();
    applyView();
    if (typeof renderTickerPanel === "function") renderTickerPanel();
    renderWeightList();
    // renderSignalBoard()는 runForge에서 갱신(구조 변경 → fireBoardChange → runForge). 여기서 중복 호출 안 함(성능)
  }
  /* ── 노드 가중치 리스트 제거 — 가중치는 차트 상단 ⚖ 가중치 하나로 통합 ── */
  let _wlistOpen = false;   // 항상 접힘(보드 데이터 패널만 노출). 가중치 편집은 ⚖ 팝오버로 일원화
  function toggleWList() { if (!document.getElementById("tuneModal")) toggleTunePop(); }   // 하위호환: 가중치 조절 요청 → ⚖ 팝오버 열기
  function renderWeightList() {
    const host = document.getElementById("wlist"); if (!host) return;
    host.innerHTML = ""; host.classList.add("collapsed"); host.style.display = "none";   // 리스트 숨김 → `.wlist.collapsed ~ .wboard`로 데이터 패널 노출
  }
  /* ── 지표 신호 한 줄 요약(보드 하단, 가중치 접힘 시) ── */
  // 프레임 단위 analyze 메모(같은 price·지표·파라미터면 한 번만 계산 → run/근거작도/신호보드/해설의 중복 제거)
  let _anMemo = new Map(), _anMemoP = null;
  function _anGet(P, key, compute) {   // 프레임(=price 참조) 캐시. price 바뀌면 전체 무효화
    if (_anMemoP !== P) { _anMemo.clear(); _anMemoP = P; }
    let v = _anMemo.get(key); if (v === undefined) { v = compute(); _anMemo.set(key, v); }
    return v;
  }
  function _an(name, P, opts) { return _anGet(P, name + "|" + (opts ? JSON.stringify(opts) : ""), () => ForgeCore["analyze" + name](P, opts)); }
  function _anSynthVol(P) { return _anGet(P, "synthVol", () => ForgeCore.synthVolume(P)); }
  function _anVolSeries(P) { const vn = boardState.nodes.find(x => x.blockType === "volume"); return (vn && Array.isArray(vn.series) && vn.series.length === P.length) ? vn.series : _anSynthVol(P); }
  function _anVolume(P) { return _anGet(P, "Volume", () => ForgeCore.analyzeVolume(P, _anVolSeries(P))); }
  function _anVP(P, opts) { return _anGet(P, "VP|" + JSON.stringify(opts), () => ForgeCore.analyzeVolumeProfile(P, _anVolSeries(P), opts)); }
  function _anSMC(P) { return _anGet(P, "SMC", () => ForgeCore.analyzeSMC((_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [])); }
  function _anPivot(P) { return _anGet(P, "Pivot", () => ForgeCore.analyzePivot({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P })); }
  function _psarNodeOpts() { const n = boardState.nodes.find(x => x.blockType === "psar"); const p = (n && n.params) || {}; return { step: p.step || 0.02, max: p.max || 0.2 }; }
  function _anPsar(P, opts) { const o = opts || _psarNodeOpts(); return _anGet(P, "Psar|" + JSON.stringify(o), () => ForgeCore.analyzePSAR({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P }, o)); }
  function _keltnerNodeOpts() { const n = boardState.nodes.find(x => x.blockType === "keltner"); const p = (n && n.params) || {}; return { len: p.len || 20, atrLen: p.atrLen || 10, mult: p.mult || 2 }; }
  function _anKeltner(P, opts) { const o = opts || _keltnerNodeOpts(); return _anGet(P, "Keltner|" + JSON.stringify(o), () => ForgeCore.analyzeKeltner({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P }, o)); }
  function _donchianNodeOpts() { const n = boardState.nodes.find(x => x.blockType === "donchian"); const p = (n && n.params) || {}; return { len: p.len || 20 }; }
  function _anDonchian(P, opts) { const o = opts || _donchianNodeOpts(); return _anGet(P, "Donchian|" + JSON.stringify(o), () => ForgeCore.analyzeDonchian({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P }, o)); }
  function _anWilliams(P, opts) { const o = opts || { period: 14 }; return _anGet(P, "Williams|" + JSON.stringify(o), () => ForgeCore.analyzeWilliams({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P }, o)); }
  function _anAo(P, opts) { const o = opts || { fast: 5, slow: 34 }; return _anGet(P, "Ao|" + JSON.stringify(o), () => ForgeCore.analyzeAO({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P }, o)); }
  function _anAroon(P, opts) { const o = opts || { period: 25 }; return _anGet(P, "Aroon|" + JSON.stringify(o), () => ForgeCore.analyzeAroon({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P }, o)); }
  function _anMfi(P, opts) { const o = opts || { period: 14 }; return _anGet(P, "Mfi|" + JSON.stringify(o), () => ForgeCore.analyzeMFI({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P, volume: _anVolSeries(P) }, o)); }
  function _anCmf(P, opts) { const o = opts || { period: 20 }; return _anGet(P, "Cmf|" + JSON.stringify(o), () => ForgeCore.analyzeCMF({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P, volume: _anVolSeries(P) }, o)); }
  function _nodeBias(n, P) {
    const p = n.params || {}, bt = n.blockType;
    try {
      switch (bt) {
        case "ma": return _an("MA", P, { len: p.len || 20, ema: p.ema }).bias;
        case "rsi": return _an("RSI", P, { period: p.period || 14 }).bias;
        case "fib": return _an("Fib", P, { len: p.len || 120, swing: ((p.swing != null ? p.swing : 5) / 100) }).bias;
        case "elliott": return _an("Elliott", P, { swing: ((p.swing != null ? p.swing : 3) / 100) }).bias;
        case "volume": return _anVolume(P).bias;
        case "bollinger": return _an("Bollinger", P, { len: p.len || 20, k: p.k || 2 }).bias;
        case "macd": return _an("MACD", P, { fast: p.fast || 12, slow: p.slow || 26, signal: p.signal || 9 }).bias;
        case "adx": return _an("ADX", P, { period: p.period || 14 }).bias;
        case "volumeprofile": return _anVP(P, { len: p.len || 120, bins: p.bins || 24 }).bias;
        case "ichimoku": return _an("Ichimoku", P, { tenkan: p.tenkan || 9, kijun: p.kijun || 26, senkouB: p.senkouB || 52, shift: p.shift || 26 }).bias;
        case "structure": return _an("Structure", P, { swing: ((p.swing != null ? p.swing : 3) / 100) }).bias;
        case "smc": return _anSMC(P).bias;
        case "cycle": return _an("Cycle", P, { pmin: p.pmin || 10, pmax: p.pmax || 0 }).bias;
        case "vwap": return _anGet(P, "VWAPev|" + (p.len || 20), () => ForgeCore.analyzeVWAP(P, _anVolSeries(P), { len: p.len || 20 })).bias;
        case "supertrend": return _an("Supertrend", P, { period: p.period || 10, mult: p.mult || 3 }).bias;
        case "stochastic": return _an("Stochastic", P, { kLen: p.kLen || 14, kSmooth: p.kSmooth || 3, dLen: p.dLen || 3 }).bias;
        case "pivot": return _anPivot(P).bias;
        case "psar": return _anPsar(P, { step: p.step || 0.02, max: p.max || 0.2 }).bias;
        case "keltner": return _anKeltner(P, { len: p.len || 20, atrLen: p.atrLen || 10, mult: p.mult || 2 }).bias;
        case "donchian": return _anDonchian(P, { len: p.len || 20 }).bias;
        case "cci": return _an("CCI", P, { period: p.period || 20 }).bias;
        case "williams": return _anWilliams(P, { period: p.period || 14 }).bias;
        case "roc": return _an("ROC", P, { period: p.period || 12 }).bias;
        case "ao": return _anAo(P, { fast: p.fast || 5, slow: p.slow || 34 }).bias;
        case "aroon": return _anAroon(P, { period: p.period || 25 }).bias;
        case "mfi": return _anMfi(P, { period: p.period || 14 }).bias;
        case "cmf": return _anCmf(P, { period: p.period || 20 }).bias;
        case "trend": { const r = _an("Trend", P, undefined); return Math.max(-1, Math.min(1, ((r.blend && r.blend.slopeLog) || 0) * 40)); }
        default: return 0;   // atr(변동성)·phasefold(주기) = 방향 무관
      }
    } catch (e) { return 0; }
  }
  // 범례 지표 포커스 시 가운데 패널의 관련 항목/값을 깜빡여 시선 유도
  const _SUBPANEL = { rsi: "fcRsiPanel", volume: "fcVolPanel", macd: "fcMacdPanel", cci: "fcCciPanel", williams: "fcWilliamsPanel", mfi: "fcMfiPanel" };
  function _flashPanelFor(bt) {
    if (!bt) return;
    const flash = el => { el.classList.remove("wblink"); void el.offsetWidth; el.classList.add("wblink"); setTimeout(() => el.classList.remove("wblink"), 2500); };
    let scrollTo = null;
    if (_SUBPANEL[bt]) { const el = document.getElementById(_SUBPANEL[bt]); if (el && el.offsetParent !== null) { flash(el); scrollTo = el; } }   // 서브패널(rsi/vol/macd)만 필요 시 스크롤
    try {
      const nodes = (typeof evIndicatorNodes === "function") ? evIndicatorNodes() : [];
      nodes.filter(n => n.blockType === bt).forEach(n => { const r = document.querySelector('.sig-row[data-nid="' + n.id + '"]'); if (r) flash(r); });   // 신호행은 깜빡만(스크롤 이동 안 함)
    } catch (e) {}
    if (scrollTo && scrollTo.scrollIntoView) { try { scrollTo.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {} }
  }
  function renderSignalBoard() {
    if (_wlistOpen) return;   // 가중치 리스트 펼침 = 보드 데이터 숨김 → 신호 계산 생략(성능)
    const wb = document.getElementById("sigProw") || document.getElementById("wboard"); if (!wb) return;   // 텍스트 신호 = 차트 아래
    let host = document.getElementById("wsignals");
    if (!host) { host = document.createElement("div"); host.id = "wsignals"; host.className = "fc-panel"; wb.appendChild(host); }
    else if (host.parentElement !== wb) wb.appendChild(host);   // 위치 보정(차트 아래로)
    const P = ((_fcLastData && _fcLastData.price) || (typeof currentData === "function" && currentData().price) || []);
    const nodes = (typeof evIndicatorNodes === "function") ? evIndicatorNodes() : [];
    if (!P || P.length < 2 || !nodes.length) { host.innerHTML = `<div class="fc-phead"><span class="fc-t"><b>지표 신호</b> · 현재 판정</span></div><div class="fc-pbody"><div class="na-empty" style="padding:14px 4px">분석 후 표시됩니다</div></div>`; return; }
    const pLast = P[P.length - 1];
    const _revIds = (_playing && _playReveal.ids) ? _playReveal.ids : null;   // 시연: 계산 완료 지표만 점등
    const rows = nodes.map(n => {
      const bias = _nodeBias(n, P), dir = bias > 0.05 ? "up" : bias < -0.05 ? "dn" : "fl", mag = Math.round(Math.min(1, Math.abs(bias)) * 100);
      let note = ""; try { const f = nodeExpert(n, lastResult, P, pLast); note = (f && f[0]) || ""; } catch (e) {}
      const arw = dir === "up" ? "▲" : dir === "dn" ? "▼" : "–";
      const dim = (_revIds && !_revIds.has(n.id)) ? " dim" : "";
      return `<div class="sig-row${dim}" data-nid="${n.id}"><span class="sig-arw ${dir}">${arw}</span><span class="sig-name">${esc(BTLABEL[n.blockType] || n.blockType)}</span><span class="sig-note" title="${esc(note)}">${esc(note)}</span><span class="sig-bar"><i class="${dir}" style="width:${mag}%"></i></span></div>`;
    }).join("");
    host.innerHTML = `<div class="fc-phead"><span class="fc-t"><b>지표 신호</b> · 현재 판정</span></div><div class="fc-pbody"><div class="sig-list">${rows}</div></div>`;
  }

  /* ── measure ─────────────────────────────────────────────────── */
  function measure() {
    boardState.nodes.forEach(n => {
      const el = bq(n.id);
      n._h = el ? el.offsetHeight : 70;
      n._w = el ? el.offsetWidth  : W_NODE;
    });
  }

  /* ── paintEdges ──────────────────────────────────────────────── */
  /* 연결선 UI 제거: 엣지 레이어를 비우기만 한다(다른 곳의 기존 호출과 안전 공존). */
  function paintEdges() {
    if (!bWorld) return;
    const edgeG = document.getElementById("bEdgeG");
    if (edgeG) edgeG.innerHTML = "";
    const ehud = document.getElementById("bEhud");
    if (ehud) ehud.innerHTML = "";
    drawNhud();   // 노드 HUD(삭제 버튼)는 연결선 UI가 아니므로 유지 — 브리프 대비 의도적 보존(report 참고)
  }

  /* ── applyView ───────────────────────────────────────────────── */
  function applyView() {
    if (!bWorld) return;
    bWorld.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.scale})`;
    const zl = document.getElementById("bZlabel");
    if (zl) zl.textContent = Math.round(view.scale * 100) + "%";
  }

  /* ── applySel ────────────────────────────────────────────────── */
  function applySel() {
    if (!bWorld) return;
    const solo = sel.length === 1 ? sel[0] : null;
    bWorld.querySelectorAll(".b-node").forEach(el => {
      el.classList.toggle("selected", sel.includes(el.dataset.id));
      el.classList.toggle("b-solo", el.dataset.id === solo);
    });
    // 선택 노드 → 좌측 사이드바 도구 항목 테두리 활성 + 가중치 리스트 행 강조(공간 절약)
    const selNode = solo ? boardState.nodes.find(x => x.id === solo) : null, selType = selNode ? selNode.blockType : null;
    document.querySelectorAll(".pal-btn[data-bt]").forEach(b => b.classList.toggle("sel", !!selType && b.dataset.bt === selType));
    document.querySelectorAll("#wlist .wrow").forEach(r => r.classList.toggle("sel", r.dataset.id === solo));
    renderParams();
    syncFocusFromSel();
  }

  function syncFocusFromSel() {
    let nf = null;
    if (sel.length === 1) {
      const n = boardState.nodes.find(x => x.id === sel[0]);
      if (n && EV_COLORS[n.blockType]) nf = n.blockType;   // 지표 노드 선택 시 해당 지표 포커스(전 지표)
    }
    if (nf !== _focusInd) { _focusInd = nf; drawEvidence(); }
  }

  /* ── 파라미터 편집기 패널 ──────────────────────────────────────── */
  function numRow(key, label, val, step) {
    return `<div class="pp-row"><label>${esc(label)}</label>
      <input type="number" step="${step || 1}" data-pkey="${key}" value="${val}"></div>`;
  }
  function neTypeLabel(n) {
    if (n.kind === "free") return "메모";
    const d = BLOCK_DEFS.find(b => b.type === n.blockType);
    return d ? d.label : (n.blockType || "노드");
  }
  /* 노드 선택 시 우측 패널을 편집기로 전환, 미선택 시 결과 차트로 복귀 */
  function renderParams() {
    const panel = document.getElementById("paramPanel");
    if (!panel) return;
    const n = (sel.length === 1) ? bN(sel[0]) : null;
    if (!n) {
      panel.classList.remove("open");   // 서랍 닫기(슬라이드 아웃)
      panel.innerHTML = "";
      return;
    }
    // 서랍을 지표레일 모서리에 붙여 차트 쪽으로 열기(근접성). 레일 숨김(좁은 폭)이면 화면 가장자리 폴백(CSS 기본)
    { const _rail = document.querySelector(".ind-rail"); const _rr = _rail && _rail.getBoundingClientRect();
      if (_rr && _rr.width > 1) {
        if (document.body.classList.contains("chart-fs")) { panel.style.right = Math.max(0, Math.round(window.innerWidth - _rr.left)) + "px"; panel.style.left = "auto"; }
        else { panel.style.left = Math.round(_rr.right) + "px"; panel.style.right = "auto"; }
      } else { panel.style.left = ""; panel.style.right = ""; }   // 폴백: CSS 기본 가장자리
    }
    panel.classList.add("open");        // 서랍 열기(레일에 붙어 차트 쪽으로 슬라이드)
    const rows = [];
    if (n.blockType === "ma") {
      rows.push(numRow("len", "이동평균 길이", (n.params && n.params.len) ?? 20));
      rows.push(numRow("ema", "EMA 사용(0/1)", (n.params && n.params.ema) ? 1 : 0));
    }
    if (n.blockType === "phasefold") {
      rows.push(numRow("pmin", "스캔 범위 최소", (n.params && n.params.pmin) ?? 16));
      rows.push(numRow("pmax", "스캔 범위 최대", (n.params && n.params.pmax) ?? 128));
    }
    if (n.blockType === "cycle") {
      rows.push(numRow("pmin", "주기 최소(봉)", (n.params && n.params.pmin) ?? 10));
      rows.push(numRow("pmax", "주기 최대(봉)", (n.params && n.params.pmax) ?? 120));
    }
    if (n.blockType === "vwap") rows.push(numRow("len", "VWAP 기간(봉)", (n.params && n.params.len) ?? 20));
    if (n.blockType === "supertrend") {
      rows.push(numRow("period", "ATR 기간", (n.params && n.params.period) ?? 10));
      rows.push(numRow("mult", "ATR 배수", (n.params && n.params.mult) ?? 3));
    }
    if (n.blockType === "stochastic") {
      rows.push(numRow("kLen", "%K 기간", (n.params && n.params.kLen) ?? 14));
      rows.push(numRow("kSmooth", "%K 평활", (n.params && n.params.kSmooth) ?? 3));
      rows.push(numRow("dLen", "%D 기간", (n.params && n.params.dLen) ?? 3));
    }
    if (n.blockType === "elliott") rows.push(numRow("swing", "스윙 민감도(%)", (n.params && n.params.swing) ?? 3));
    if (n.blockType === "trend") {
      rows.push(numRow("len", "단기 길이(봉)", (n.params && n.params.len) ?? 40));
      rows.push(numRow("pivotSwing", "피봇 민감도(%)", (n.params && n.params.pivotSwing) ?? 8));
      rows.push(numRow("channelK", "채널 σ배수(k)", (n.params && n.params.channelK) ?? 2));
    }
    if (n.blockType === "rsi") rows.push(numRow("period", "RSI 기간", (n.params && n.params.period) ?? 14));
    if (n.blockType === "fib") {
      rows.push(numRow("len", "피보 구간", (n.params && n.params.len) ?? 120));
      rows.push(numRow("swing", "스윙 민감도(%)", (n.params && n.params.swing) ?? 5));
    }
    if (n.blockType === "bollinger") {
      rows.push(numRow("len", "기간(SMA)", (n.params && n.params.len) ?? 20));
      rows.push(numRow("k", "σ 배수(폭)", (n.params && n.params.k) ?? 2, 0.1));
    }
    if (n.blockType === "macd") {
      rows.push(numRow("fast", "단기 EMA", (n.params && n.params.fast) ?? 12));
      rows.push(numRow("slow", "장기 EMA", (n.params && n.params.slow) ?? 26));
      rows.push(numRow("signal", "시그널", (n.params && n.params.signal) ?? 9));
    }
    if (n.blockType === "adx") rows.push(numRow("period", "ADX 기간", (n.params && n.params.period) ?? 14));
    if (n.blockType === "volumeprofile") {
      rows.push(numRow("len", "구간 길이(봉)", (n.params && n.params.len) ?? 120));
      rows.push(numRow("bins", "가격 구간 수", (n.params && n.params.bins) ?? 24));
    }
    if (n.blockType === "ichimoku") {
      rows.push(numRow("tenkan", "전환선", (n.params && n.params.tenkan) ?? 9));
      rows.push(numRow("kijun", "기준선", (n.params && n.params.kijun) ?? 26));
      rows.push(numRow("senkouB", "선행스팬B", (n.params && n.params.senkouB) ?? 52));
      rows.push(numRow("shift", "선행 이동", (n.params && n.params.shift) ?? 26));
    }
    if (n.blockType === "structure") rows.push(numRow("swing", "스윙 민감도(%)", (n.params && n.params.swing) ?? 3));
    if (n.blockType === "atr") {
      rows.push(numRow("period", "ATR 기간", (n.params && n.params.period) ?? 14));
      rows.push(numRow("mult", "손절 배수", (n.params && n.params.mult) ?? 2, 0.1));
    }
    if (n.blockType === "smc") rows.push(`<div class="pp-row"><label></label><span class="ne-hint">파라미터 없음 · 티커로 실 OHLC 불러오면 활성</span></div>`);
    if (n.blockType === "pivot") rows.push(`<div class="pp-row"><label></label><span class="ne-hint">파라미터 없음 · 직전 기간 고·저·종가로 자동 산출</span></div>`);
    if (n.blockType === "psar") {
      rows.push(numRow("step", "가속 단계(AF)", (n.params && n.params.step) ?? 0.02, 0.01));
      rows.push(numRow("max", "AF 상한", (n.params && n.params.max) ?? 0.2, 0.01));
    }
    if (n.blockType === "keltner") {
      rows.push(numRow("len", "중심선 EMA 기간", (n.params && n.params.len) ?? 20));
      rows.push(numRow("atrLen", "ATR 기간", (n.params && n.params.atrLen) ?? 10));
      rows.push(numRow("mult", "ATR 배수(폭)", (n.params && n.params.mult) ?? 2, 0.1));
    }
    if (n.blockType === "donchian") {
      rows.push(numRow("len", "채널 기간(N봉)", (n.params && n.params.len) ?? 20));
    }
    if (n.blockType === "cci") rows.push(numRow("period", "CCI 기간", (n.params && n.params.period) ?? 20));
    if (n.blockType === "williams") rows.push(numRow("period", "Williams %R 기간", (n.params && n.params.period) ?? 14));
    if (n.blockType === "roc") rows.push(numRow("period", "ROC 기간(N봉전 대비)", (n.params && n.params.period) ?? 12));
    if (n.blockType === "ao") {
      rows.push(numRow("fast", "단기 SMA 기간", (n.params && n.params.fast) ?? 5));
      rows.push(numRow("slow", "장기 SMA 기간", (n.params && n.params.slow) ?? 34));
    }
    if (n.blockType === "aroon") rows.push(numRow("period", "Aroon 기간(N봉)", (n.params && n.params.period) ?? 25));
    if (n.blockType === "mfi") {
      rows.push(numRow("period", "MFI 기간(N봉)", (n.params && n.params.period) ?? 14));
      rows.push(`<div class="pp-row"><label></label><span class="ne-hint">실거래량 없으면 합성 거래량 기반 참고용 수치</span></div>`);
    }
    if (n.blockType === "cmf") {
      rows.push(numRow("period", "CMF 기간(N봉)", (n.params && n.params.period) ?? 20));
      rows.push(`<div class="pp-row"><label></label><span class="ne-hint">실거래량 없으면 합성 거래량 기반 참고용 수치</span></div>`);
    }
    if (n.blockType === "ticker") {
      rows.push(`<div class="pp-row"><label>티커 심볼</label><input type="text" data-tkr="symbol" value="${esc((n.params && n.params.symbol) || "")}" placeholder="예: TSLA · 005930(국내)"></div>`);
      rows.push(`<div class="pp-row"><label>현재가</label><input type="number" step="any" data-tkr="price" value="${(n.params && isFinite(n.params.price)) ? n.params.price : ""}" placeholder="예: 379.71"${(Array.isArray(n._ohlc) && n._ohlc.length >= 2) ? " readonly title='실데이터 로드됨 — 자동 설정'" : ""}></div>`);
      rows.push(`<div class="pp-row"><label>주기</label><select data-tkr="tf">
        <option value="1day"${((n.params&&n.params.tf)||"1day")==="1day"?" selected":""}>일봉</option>
        <option value="1week"${(n.params&&n.params.tf)==="1week"?" selected":""}>주봉</option>
        <option value="1month"${(n.params&&n.params.tf)==="1month"?" selected":""}>월봉</option>
      </select></div>`);
      rows.push(`<div class="pp-row"><label></label><button type="button" class="pp-load" data-tkr-load="1">📈 캔들 불러오기</button></div>`);
    }
    // volume: 수치 param 없음(확신/중요도/메모/이미지만)
    const conv = n.conviction ?? 0;
    const wt = (n.weight != null) ? n.weight : 50;
    const hasImg = n.thumb && n.thumb.imgId;
    const isPrice = n.blockType === "price";
    const cal0 = n.cal || {};
    const imgInner = hasImg
      ? `<img src="${esc(imgSrc(n.thumb.imgId))}" alt="">
         <button class="ne-img-del" id="neImgDel" type="button" title="이미지 제거" aria-label="이미지 제거">✕</button>
         ${isPrice ? `<canvas id="neConeOv" class="fc-cone-ov"></canvas>` : ""}`
      : `<span class="ne-ph">이미지 없음<br>클릭 · 드래그 · <b>Ctrl+V</b> 로 추가</span>`;
    const paramSec = rows.length ? `<div class="ne-sec">파라미터</div>${rows.join("")}` : "";
    const info = INDICATOR_INFO[n.blockType];
    const _defP = (BLOCK_DEFS.find(b => b.type === n.blockType) || {}).params || {};
    const _hasP = Object.keys(_defP).length > 0;
    const actionSec = info ? `<div class="ne-actions">${_hasP ? `<button class="tool-btn" type="button" id="neRecommend" title="파라미터를 내장 추천 기본값으로 되돌립니다">추천값 세팅</button>` : ""}<button class="tool-btn ne-save" type="button" id="neSave" title="현재 설정을 저장합니다(재분석은 웹분석 버튼)">저장</button></div>` : "";
    const infoSec = info ? `<div class="ne-sec">도구 안내</div><div class="ne-info"><div class="ne-info-row"><span class="ne-info-k">목적</span><span class="ne-info-v">${esc(info.p)}</span></div><div class="ne-info-row"><span class="ne-info-k">정의</span><span class="ne-info-v">${esc(info.d)}</span></div><div class="ne-info-row"><span class="ne-info-k">해석</span><span class="ne-info-v">${esc(info.h)}</span></div></div>` : "";
    const series = (Array.isArray(n.series) && n.series.length) ? n.series : null;
    const dataSec = isPrice
      ? `<div class="ne-sec">가격 데이터 <span class="ne-hint">종가 붙여넣기 → 실제 분석·예측 (한 줄 한 봉, OHLC/CSV 자동인식)</span></div>
         <div class="pp-row" style="flex-direction:column;align-items:stretch">
           <textarea id="neSeries" placeholder="종가 붙여넣기 (20개+)&#10;412.5&#10;418.0&#10;420.3&#10;...">${esc(series ? series.join("\n") : "")}</textarea></div>
         <div class="ne-imgbar">
           <button class="tool-btn" type="button" id="neSeriesEx">예시 데이터로 보기</button>
           <button class="tool-btn" type="button" id="neSeriesApply">적용하고 차트 보기</button>
         </div>
         <div class="na-empty" id="neSeriesStat" style="text-align:left;padding:3px 2px 0">${series ? ("✓ " + series.length + "개 적용됨 — 배경 클릭 시 연속 차트") : "데이터 없음 — 데모로 표시 중"}</div>`
      : "";
    /* 보정(이미지 축)은 실데이터가 없을 때만(실데이터면 연속 차트가 흐름을 보여줌) */
    const calSec = (isPrice && !series)
      ? `<div class="ne-sec">이미지 가격 보정 <span class="ne-hint">데이터가 없을 때만 — A·B선을 격자에, 현재선을 최근봉에 끌어다 맞추고 가격 입력</span></div>
         <div class="pp-row"><label>A선 가격</label><input type="number" step="any" data-calp="ap" value="${cal0.ap ?? ""}" placeholder="위쪽 기준선의 가격"></div>
         <div class="pp-row"><label>B선 가격</label><input type="number" step="any" data-calp="bp" value="${cal0.bp ?? ""}" placeholder="아래쪽 기준선의 가격"></div>
         <div class="pp-row"><label>현재가</label><input type="number" step="any" data-calp="np" value="${cal0.np ?? ""}" placeholder="최근 종가(현재선)"></div>`
      : "";
    panel.innerHTML =
      `<button class="ne-back" onclick="deselectAll()" title="편집 닫기 (Esc)">← 분석으로 돌아가기<span class="neb-esc">Esc</span></button>
       <div class="ne-head"><span class="ne-type">${esc(neTypeLabel(n))}</span>
         <input class="ne-title" id="neTitle" value="${esc(n.title || "")}" placeholder="노드 제목"></div>
       <div class="ne-img${hasImg ? "" : " empty"}" id="neImg" title="${hasImg ? "드래그 · Ctrl+V로 교체" : "클릭 · 드래그 · Ctrl+V로 이미지 추가"}">${imgInner}</div>
       <div class="ne-gutter" id="neImgGutter" title="드래그하여 이미지 영역 높이 조절 · 더블클릭 초기화"></div>
       <div class="ne-imgbar">
         <button class="tool-btn" type="button" id="neImgPick">${hasImg ? "이미지 교체" : "이미지 추가"}</button>
       </div>
       ${dataSec}
       ${paramSec}
       ${actionSec}
       ${infoSec}
       ${calSec}
       <div class="ne-sec">서술 메모</div>
       <div class="pp-row" style="flex-direction:column;align-items:stretch">
         <textarea id="ppNote" placeholder="분석 근거·기준 (계산엔 미반영)">${esc(n.note || "")}</textarea></div>
`;   // 삭제 버튼 제거: 지표는 항상 1차(종합)에 포함(레일 체크로 표시·2차만 제어)
    if (isPrice) refreshEditorCone();
  }
  /* 편집기 이미지 미리보기 위 보정 콘 + 드래그 핸들(가격 노드 선택 시 즉시 피드백) */
  function refreshEditorCone() {
    const ov = document.getElementById("neConeOv"); if (!ov) return;
    const neImg = document.getElementById("neImg");
    const im = neImg && neImg.querySelector("img");
    const n = (sel.length === 1) ? bN(sel[0]) : null;
    if (!im || !n || n.blockType !== "price") { const cc = ov.getContext("2d"); if (cc) cc.clearRect(0, 0, ov.width, ov.height); return; }
    const cal = ensureCal(n);
    bindConeDrag(ov, n);
    const box = ov.parentElement;
    const drawFn = () => drawCalCone(ov, ov.parentElement && ov.parentElement.querySelector("img"), lastResult && lastResult.prediction, cal, true);
    coneRetry(drawFn, im);
    /* 박스가 레이아웃을 얻는 순간 확실히 재그리기 */
    if (window.ResizeObserver && box && !ov._ro) {
      ov._ro = new ResizeObserver(() => drawFn());
      ov._ro.observe(box);
    }
  }
  /* 이미지 디코드/레이아웃 타이밍에 강한 콘 그리기: 즉시 + onload + 다음 프레임 */
  function coneRetry(drawFn, img) {
    drawFn();                                              // 폴백 박스로라도 즉시 표시
    if (img) { img.addEventListener("load", drawFn, { once: true }); if (img.decode) img.decode().then(drawFn).catch(() => {}); }
    requestAnimationFrame(drawFn);                         // 레이아웃 반영 후 정밀 재그리기
  }

  function selectOnly(id)   { sel = [id]; applySel(); }
  function editBlock(type)  { let n = boardState.nodes.find(x => x.blockType === type); if (!n) { addBlock(type); n = boardState.nodes.find(x => x.blockType === type); } if (n) selectOnly(n.id); }
  function toggleSel(id)    { const i = sel.indexOf(id); if (i >= 0) sel.splice(i, 1); else sel.push(id); applySel(); }
  function clearSel()       { sel = []; applySel(); }
  function setSel(ids)      { sel = ids; applySel(); }
  function selectEdge(id)   { selEdge = id; sel = []; applySel(); paintEdges(); }
  function deselectAll() {
    if (!sel.length && !selEdge) return;
    sel = []; selEdge = null; applySel(); paintEdges();
  }

  /* ── CRUD ────────────────────────────────────────────────────── */
  function makeNode(x, y, title, kind, blockType, params) {
    const n = {
      id: uid("n"), x, y,
      title: title || "노드",
      kind: kind || "free",
      blockType: blockType || null,
      params: params || {}
    };
    boardState.nodes.push(n);
    return n;
  }
  function addEdge(from, fromSide, to, toSide) {
    if (from === to) return;
    if (boardState.edges.some(e => e.from === from && e.to === to)) return;
    boardState.edges.push({
      id: uid("e"),
      from, fromSide: fromSide || "right",
      to,   toSide:   toSide   || "left"
    });
    fireBoardChange();
  }
  function delEdge(id) {
    boardState.edges = boardState.edges.filter(e => e.id !== id);
    if (selEdge === id) selEdge = null;
    paintEdges();
    fireBoardChange();
  }
  function delNodes(ids) {
    const s = new Set(ids);
    boardState.nodes = boardState.nodes.filter(n => !s.has(n.id));
    boardState.edges = boardState.edges.filter(e => !s.has(e.from) && !s.has(e.to));
    sel = sel.filter(i => !s.has(i));
    renderBoard();
    if (window.renderSidebar) renderSidebar();   // 사이드바 '추가됨' 표시 갱신
    fireBoardChange();
  }
  /* ── addBlock: insert a typed block at canvas center ─────────── */
  function freeSlot() {
    // 화면 좌상단부터 그리드로 비어있는 첫 칸 찾기(겹치지 않게 정렬 배치)
    const r = bStage.getBoundingClientRect();
    const tl = worldPt(r.left + 46, r.top + 40);
    const COLS = 4, GX = W_NODE + 30, GY = 118;
    for (let i = 0; i < 240; i++) {
      const x = tl.x + (i % COLS) * GX, y = tl.y + Math.floor(i / COLS) * GY;
      const hit = boardState.nodes.some(nn => nn.blockType !== "ticker" && Math.abs((nn.x || 0) - x) < GX * 0.72 && Math.abs((nn.y || 0) - y) < GY * 0.72);
      if (!hit) return { x, y };
    }
    return { x: tl.x, y: tl.y };
  }
  function addBlock(type) {
    const d = BLOCK_DEFS.find(b => b.type === type) || {};
    if (type !== "free") {
      const ex = boardState.nodes.find(n => n.blockType === type);
      if (ex) {   // 이미 추가됨: 지표=토글 제거 / 구조노드=선택
        if (EV_COLORS[type]) { delNodes([ex.id]); bToast((d.label || type) + " 제거됨"); }
        else { selectOnly(ex.id); bToast((d.label || type) + " 선택 — 우측에서 편집"); }
        return;
      }
    }
    const slot = FIXED_LAYOUT ? { x: 0, y: 0 } : freeSlot();
    const n = {
      id: uid("n"),
      x: slot.x, y: slot.y,
      title: d.label || "노드",
      kind: d.kind || "free",
      blockType: d.kind === "block" ? type : null,
      params: d.params ? { ...d.params } : {}
    };
    boardState.nodes.push(n);
    layoutBlocks();
    renderBoard();
    if (window.renderSidebar) renderSidebar();   // '추가됨' 표시 갱신
    selectOnly(n.id);
    fireBoardChange();
  }

  /* ── 4-point magnet / link-hover ─────────────────────────────── */
  function portSnap(n, pt) {
    let best = null, bd = 1e9;
    ["top", "right", "bottom", "left"].forEach(s => {
      const a = anchor(n, s), d = Math.hypot(a.x-pt.x, a.y-pt.y);
      if (d < bd) { bd = d; best = { side: s, x: a.x, y: a.y }; }
    });
    const c = centerOf(n), w = n._w || W_NODE, h = n._h || 70;
    if (Math.hypot(pt.x-c.x, pt.y-c.y) < Math.min(w, h) * 0.30) {
      const s = nearestSide(n, pt), a = anchor(n, s);
      return { side: "auto", x: a.x, y: a.y };
    }
    return best;
  }
  function snapAt(pt, exclude) {
    const over = nodeAt(pt);
    if (!over || over.id === exclude) return null;
    const s = portSnap(over, pt);
    return { node: over.id, side: s.side, x: s.x, y: s.y };
  }
  function clearLinkHi() {
    if (!bWorld) return;
    bWorld.querySelectorAll(".b-node.b-linktarget,.b-node.b-linkhover")
          .forEach(n => n.classList.remove("b-linktarget", "b-linkhover"));
    bWorld.querySelectorAll(".b-port.snaptgt")
          .forEach(p => p.classList.remove("snaptgt"));
  }
  function hi(pt, exclude) {
    clearLinkHi();
    const snap = snapAt(pt, exclude);
    if (snap) {
      const el = bq(snap.node);
      if (el) {
        el.classList.add("b-linktarget", "b-linkhover");
        if (snap.side !== "auto") {
          const pe = el.querySelector(`.b-port-${snap.side}`);
          if (pe) pe.classList.add("snaptgt");
        }
      }
    }
    return snap;
  }

  /* ── HUDs ────────────────────────────────────────────────────── */
  const _ico_trash = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>`;
  const _ico_swap  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9h13l-3.5-3.5M18 15H5l3.5 3.5"/></svg>`;

  function drawEhud() {
    const hud = document.getElementById("bEhud");
    if (!hud) return;
    if (!selEdge) { hud.innerHTML = ""; return; }
    const e = bE(selEdge), g = e && edgeGeo(e);
    if (!g) { hud.innerHTML = ""; return; }
    const mx = (g.A.x + g.B.x) / 2, my = (g.A.y + g.B.y) / 2;
    hud.innerHTML =
      `<div class="b-ehandle" data-end="from" style="left:${g.A.x}px;top:${g.A.y}px"></div>
<div class="b-ehandle" data-end="to" style="left:${g.B.x}px;top:${g.B.y}px"></div>
<div class="b-hbar b-ebar" style="left:${mx}px;top:${my}px">
  <button class="b-hbtn danger" data-edel="1" title="연결선 삭제">${_ico_trash}<span>삭제</span></button>
  <button class="b-hbtn" data-erev="1" title="방향 반전">${_ico_swap}<span>방향</span></button>
</div>`;
  }

  function drawNhud() {
    const hud = document.getElementById("bNhud");
    if (!hud) return;
    if (drag || sel.length !== 1) { hud.innerHTML = ""; return; }
    const n = bN(sel[0]);
    if (!n) { hud.innerHTML = ""; return; }
    const cx = n.x + (n._w || W_NODE) / 2;
    hud.innerHTML =
      `<div class="b-hbar b-nbar" style="left:${cx}px;top:${n.y}px">
  <button class="b-hbtn danger" data-nact="del" title="노드 삭제">${_ico_trash}<span>삭제</span></button>
</div>`;
  }

  /* ── Pointer handlers ────────────────────────────────────────── */
  function nodePointerDown(id, e) {
    const t = e.target;
    if (t.closest("[data-act]") || t.closest("[data-nact]")) return;   // 액션 버튼(삭제 등)은 선택/드래그 대상 아님
    const ed = t.closest(".b-n-title");
    if (ed && document.activeElement === ed) return;
    drag = { type: "nodePending", id, sx: e.clientX, sy: e.clientY };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function startPan(e, canClear) {
    drag = { type: "pan", sx: e.clientX, sy: e.clientY, otx: view.tx, oty: view.ty,
             canClear: !!canClear, moved: false };
    bStage.classList.add("panning");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function startLink(id, side, e) {
    e.preventDefault(); e.stopPropagation();
    selEdge = null; paintEdges();
    drag = { type: "link", from: id, fromSide: side, sx: e.clientX, sy: e.clientY, moved: false };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function startEndpoint(end, e) {
    e.preventDefault(); e.stopPropagation();
    drag = { type: "endpoint", end, edge: selEdge, sx: e.clientX, sy: e.clientY, moved: false };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function startMarquee(e) {
    drag = { type: "marquee", sx: e.clientX, sy: e.clientY, add: e.shiftKey, moved: false };
    const m = document.getElementById("bMarquee");
    if (m) { m.style.display = "block"; posMarquee(e.clientX, e.clientY); }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function posMarquee(cx, cy) {
    const r = bStage.getBoundingClientRect();
    const x = Math.min(drag.sx, cx) - r.left, y = Math.min(drag.sy, cy) - r.top;
    const w = Math.abs(cx - drag.sx), h = Math.abs(cy - drag.sy);
    const m = document.getElementById("bMarquee");
    if (m) { m.style.left = x+"px"; m.style.top = y+"px"; m.style.width = w+"px"; m.style.height = h+"px"; }
  }

  function onMove(e) {
    if (!drag) return;
    if (drag.type === "pan") {
      drag.moved = true;
      view.tx = drag.otx + (e.clientX - drag.sx);
      view.ty = drag.oty + (e.clientY - drag.sy);
      applyView(); return;
    }
    if (drag.type === "nodePending") {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      if (FIXED_LAYOUT) return;   // 고정 배치 — 노드 이동 비활성(클릭 선택만 유지)
      drag.type = "node"; justDragged = true;
      document.body.style.userSelect = "none";
      document.body.classList.add("b-ndrag");
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (!sel.includes(drag.id)) selectOnly(drag.id);
      drag.origins = sel.map(id => { const n = bN(id); return { id, ox: n.x, oy: n.y }; });
    }
    if (drag.type === "node") {
      const dx = (e.clientX - drag.sx) / view.scale, dy = (e.clientY - drag.sy) / view.scale;
      drag.origins.forEach(o => {
        const n = bN(o.id); n.x = o.ox + dx; n.y = o.oy + dy;
        const el = bq(o.id); if (el) { el.style.left = n.x+"px"; el.style.top = n.y+"px"; }
      });
      paintEdges(); return;
    }
    if (drag.type === "link") {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      drag.moved = true;
      const a = bN(drag.from), A = anchor(a, drag.fromSide);
      const p = worldPt(e.clientX, e.clientY), d1 = DIR[drag.fromSide], k = 70;
      const snap = hi(p, drag.from), end = snap || p;
      const tmp = document.getElementById("bTmp");
      if (tmp) tmp.setAttribute("d",
        `M${A.x},${A.y} C${A.x+d1[0]*k},${A.y+d1[1]*k} ${end.x},${end.y} ${end.x},${end.y}`);
      return;
    }
    if (drag.type === "endpoint") {
      const ed = bE(drag.edge); if (!ed) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      drag.moved = true;
      const s = sidesOf(ed);
      const fixed = drag.end === "from" ? anchor(bN(ed.to), s.ts) : anchor(bN(ed.from), s.fs);
      const p = worldPt(e.clientX, e.clientY), excl = drag.end === "from" ? ed.to : ed.from;
      const snap = hi(p, excl), end = snap || p;
      const tmp = document.getElementById("bTmp");
      if (tmp) tmp.setAttribute("d",
        `M${fixed.x},${fixed.y} C${(fixed.x+end.x)/2},${fixed.y} ${(fixed.x+end.x)/2},${end.y} ${end.x},${end.y}`);
      return;
    }
    if (drag.type === "marquee") { drag.moved = true; posMarquee(e.clientX, e.clientY); }
  }

  function onUp(e) {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    const d = drag; drag = null;
    document.body.style.userSelect = "";
    bStage.classList.remove("panning");
    document.body.classList.remove("b-ndrag");
    const sv = document.getElementById("bSnapV"), sh = document.getElementById("bSnapH");
    if (sv) sv.style.display = "none";
    if (sh) sh.style.display = "none";
    const tmp = document.getElementById("bTmp");
    if (tmp) tmp.setAttribute("d", "");
    clearLinkHi();
    if (!d) return;
    if (d.type === "pan") { if (d.canClear && !d.moved) deselectAll(); return; }
    if (d.type === "nodePending") {
      if (e.shiftKey) toggleSel(d.id); else selectOnly(d.id);
      selEdge = null; paintEdges(); return;
    }
    if (d.type === "node") {
      setTimeout(() => justDragged = false, 30);
      measure(); paintEdges(); fireBoardChange(); return;
    }
    if (d.type === "link") {
      if (!d.moved) return;
      const p = worldPt(e.clientX, e.clientY), snap = snapAt(p, d.from);
      if (snap) {
        addEdge(d.from, d.fromSide, snap.node, snap.side);
        paintEdges(); bToast("연결됨");
      } else {
        const nn = makeNode(p.x - W_NODE/2, p.y - 35, "노드", "free");
        addEdge(d.from, d.fromSide, nn.id, "auto");
        renderBoard(); selectOnly(nn.id); bToast("노드 생성·연결");
      }
      fireBoardChange(); return;
    }
    if (d.type === "endpoint") {
      const ed = bE(d.edge); if (!ed || !d.moved) return;
      const p = worldPt(e.clientX, e.clientY), other = d.end === "from" ? ed.to : ed.from;
      const snap = snapAt(p, other);
      if (snap) {
        if (d.end === "from") { ed.from = snap.node; ed.fromSide = snap.side; }
        else                  { ed.to   = snap.node; ed.toSide   = snap.side; }
        bToast("끝점 이동");
      }
      paintEdges(); fireBoardChange(); return;
    }
    if (d.type === "marquee") {
      const m = document.getElementById("bMarquee");
      if (m) m.style.display = "none";
      if (!d.moved) { if (!e.shiftKey) deselectAll(); return; }
      const a = worldPt(Math.min(d.sx, e.clientX), Math.min(d.sy, e.clientY));
      const b = worldPt(Math.max(d.sx, e.clientX), Math.max(d.sy, e.clientY));
      const hit = boardState.nodes
        .filter(n => n.x < b.x && n.x + (n._w||W_NODE) > a.x && n.y < b.y && n.y + (n._h||70) > a.y)
        .map(n => n.id);
      selEdge = null; setSel(d.add ? [...new Set([...sel, ...hit])] : hit); paintEdges();
    }
  }

  /* ── Zoom / fit ──────────────────────────────────────────────── */
  function zoomBy(f) {
    const r = bStage.getBoundingClientRect(), cx = r.width/2, cy = r.height/2;
    const wx = (cx - view.tx) / view.scale, wy = (cy - view.ty) / view.scale;
    view.scale = Math.min(2.4, Math.max(0.3, view.scale * f));
    view.tx = cx - wx * view.scale; view.ty = cy - wy * view.scale;
    applyView();
  }
  function fitView() {
    if (!boardState.nodes.length) return;
    measure();
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    boardState.nodes.forEach(n => {
      mnx = Math.min(mnx, n.x); mny = Math.min(mny, n.y);
      mxx = Math.max(mxx, n.x + (n._w||W_NODE)); mxy = Math.max(mxy, n.y + (n._h||70));
    });
    const r = bStage.getBoundingClientRect(), pad = 50;
    const s = Math.min(2.4, Math.max(0.3,
      Math.min((r.width-pad*2) / (mxx-mnx), (r.height-pad*2) / (mxy-mny))));
    view.scale = s;
    view.tx = pad - mnx*s + (r.width-pad*2  - (mxx-mnx)*s) / 2;
    view.ty = pad - mny*s + (r.height-pad*2 - (mxy-mny)*s) / 2;
    applyView();
  }

  /* ── Toast ───────────────────────────────────────────────────── */
  let _btt;
  function bToast(m) {
    const el = document.getElementById("bToast");
    if (!el) return;
    el.textContent = m; el.classList.add("on");
    clearTimeout(_btt); _btt = setTimeout(() => el.classList.remove("on"), 1400);
  }

  /* ── Board DOM init ──────────────────────────────────────────── */
  // 티커 자동완성 — 큐레이션 심볼 목록(오프라인·즉시). 서버 심볼검색 없이 자주 쓰는 종목 제안
  const TICKER_SUGGEST = [
    { s: "BTC/USD", n: "비트코인", t: "코인" }, { s: "ETH/USD", n: "이더리움", t: "코인" }, { s: "SOL/USD", n: "솔라나", t: "코인" }, { s: "XRP/USD", n: "리플", t: "코인" }, { s: "DOGE/USD", n: "도지코인", t: "코인" }, { s: "ADA/USD", n: "카르다노", t: "코인" }, { s: "BNB/USD", n: "BNB", t: "코인" }, { s: "AVAX/USD", n: "아발란체", t: "코인" }, { s: "LINK/USD", n: "체인링크", t: "코인" },
    { s: "AAPL", n: "애플", t: "미국" }, { s: "TSLA", n: "테슬라", t: "미국" }, { s: "NVDA", n: "엔비디아", t: "미국" }, { s: "MSFT", n: "마이크로소프트", t: "미국" }, { s: "GOOGL", n: "알파벳", t: "미국" }, { s: "AMZN", n: "아마존", t: "미국" }, { s: "META", n: "메타", t: "미국" }, { s: "AMD", n: "AMD", t: "미국" }, { s: "NFLX", n: "넷플릭스", t: "미국" }, { s: "COIN", n: "코인베이스", t: "미국" }, { s: "PLTR", n: "팔란티어", t: "미국" }, { s: "AVGO", n: "브로드컴", t: "미국" },
    { s: "SPY", n: "S&P500 ETF", t: "ETF" }, { s: "QQQ", n: "나스닥100 ETF", t: "ETF" },
    { s: "005930", n: "삼성전자", t: "국내" }, { s: "000660", n: "SK하이닉스", t: "국내" }, { s: "035420", n: "NAVER", t: "국내" }, { s: "035720", n: "카카오", t: "국내" }, { s: "005380", n: "현대차", t: "국내" }, { s: "051910", n: "LG화학", t: "국내" }, { s: "005490", n: "POSCO홀딩스", t: "국내" }, { s: "373220", n: "LG에너지솔루션", t: "국내" }, { s: "000270", n: "기아", t: "국내" }, { s: "068270", n: "셀트리온", t: "국내" }, { s: "105560", n: "KB금융", t: "국내" }, { s: "207940", n: "삼성바이오로직스", t: "국내" }, { s: "005935", n: "삼성전자우", t: "국내" }
  ];
  let _tkSuggIdx = -1;
  function _tkSuggRender(q) {
    const box = document.getElementById("tkSugg"); if (!box) return;
    _tkSuggIdx = -1;
    const hits = _suggFilter(q);   // 구분자 무시 느슨한 매칭(btcusd·btc-usd·btc/usd 공통)
    if (!hits.length) { box.classList.remove("open"); box.innerHTML = ""; return; }
    box.innerHTML = _suggHTML(hits);
    box.classList.add("open");
  }
  function _tkSuggPick(sym) {
    const inp = document.getElementById("tkSym"); if (!inp) return;
    inp.value = sym; const t = ensureTickerNode(); t.params.symbol = sym; if (typeof markDirty === "function") markDirty(); if (typeof renderTickerPanel === "function") renderTickerPanel();
    const box = document.getElementById("tkSugg"); if (box) { box.classList.remove("open"); box.innerHTML = ""; }
    _tkSuggIdx = -1;
    if (typeof loadTicker === "function") loadTicker();   // 선택 즉시 불러오기
  }
  // 크립토 페어를 트레이딩뷰 슬래시 표기로 정규화: BTCUSD·BTC-USD·BTC/USD → BTC/USD (API는 슬래시 처리)
  const _FIAT = "USDT|USD|EUR|KRW|JPY|GBP|BTC|ETH";
  function _normSym(sym) {
    sym = (sym || "").trim().toUpperCase();
    let m = sym.match(new RegExp("^([A-Z]{2,6})[-/](" + _FIAT + ")$"));            // BTC-USD · BTC/USD
    if (m) return m[1] + "/" + m[2];
    m = sym.match(new RegExp("^([A-Z]{2,6})(" + _FIAT + ")$"));                     // BTCUSD (구분자 없음)
    if (m && (m[1].length + m[2].length) >= 6) return m[1] + "/" + m[2];           // 주식(짧음)과 혼동 방지
    return sym;
  }
  const _sepless = s => (s || "").toLowerCase().replace(/[-/]/g, "");   // 구분자 제거(btcusd 형태 비교용)
  // 공유: 심볼 필터(구분자 무시 느슨한 매칭) + 아이템 HTML
  function _suggFilter(q) {
    q = (q || "").trim().toLowerCase(); if (!q) return [];
    const qn = _sepless(q);
    return TICKER_SUGGEST.filter(x => { const sl = x.s.toLowerCase(); return sl.indexOf(q) >= 0 || _sepless(x.s).indexOf(qn) >= 0 || x.n.toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
  }
  function _suggHTML(hits) { return hits.map(x => `<div class="tk-sugg-item" data-sym="${x.s}"><span class="tk-sugg-s">${esc(x.s)}</span><span class="tk-sugg-n">${esc(x.n)}</span><span class="tk-sugg-t">${esc(x.t)}</span></div>`).join(""); }
  // 티커 입력 자동 대문자화(소문자 입력해도 대문자 표시·저장 — 한글/숫자는 불변, 캐럿 유지)
  function _upSym(el) { if (!el) return ""; const up = (el.value || "").toUpperCase(); if (el.value !== up) { const p = el.selectionStart; el.value = up; try { el.setSelectionRange(p, p); } catch (_) {} } return up; }
  // 제네릭: 임의 입력창+드롭다운에 자동완성 부착(선택 시 onPick(sym))
  function _wireSuggest(inp, box, onPick) {
    if (!inp || !box) return; let idx = -1;
    const close = () => { box.classList.remove("open"); box.innerHTML = ""; idx = -1; };
    inp.addEventListener("input", () => { _upSym(inp); const hits = _suggFilter(inp.value); idx = -1; if (!hits.length) { close(); return; } box.innerHTML = _suggHTML(hits); box.classList.add("open"); });
    inp.addEventListener("keydown", e => {
      const open = box.classList.contains("open"); const its = box.querySelectorAll(".tk-sugg-item");
      if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); if (!its.length) return; idx = e.key === "ArrowDown" ? Math.min(its.length - 1, idx + 1) : Math.max(0, idx - 1); its.forEach((it, i) => it.classList.toggle("hl", i === idx)); its[idx].scrollIntoView({ block: "nearest" }); return; }
      if (e.key === "Escape" && open) { e.stopPropagation(); close(); return; }   // 드롭다운만 닫기(입력창 유지)
      if (e.key === "Enter" && open && idx >= 0) { e.preventDefault(); e.stopPropagation(); const it = its[idx]; if (it) { onPick(it.getAttribute("data-sym")); close(); } }
    }, true);   // 캡처: 드롭다운 선택이 기존 submit보다 먼저
    box.addEventListener("mousedown", e => { const it = e.target.closest(".tk-sugg-item"); if (it) { e.preventDefault(); onPick(it.getAttribute("data-sym")); close(); } });
    inp.addEventListener("blur", () => setTimeout(close, 170));
  }
  function boardInit() {
    const pane = document.getElementById("boardPane");
    pane.innerHTML = `<div class="tk-panel" id="tkPanel">
    <span class="tk-lbl">티커</span>
    <div class="tk-symwrap"><input class="tk-sym" id="tkSym" placeholder="종목 심볼 (예: BTC/USD · AAPL · 005930 국내)" spellcheck="false" autocomplete="off"><div class="tk-sugg" id="tkSugg" role="listbox"></div></div>
    <button class="tk-load" id="tkLoad">불러오기</button>
    <span class="tk-stat tk-dot empty" id="tkStat" title="종목 심볼 입력"></span>
  </div>
  <div class="wlist" id="wlist"></div>
  <div class="wboard" id="wboard"></div>
  <div class="b-stage" id="bStage">
  <div class="b-world" id="bWorld">
    <svg class="b-edges" id="bEdges">
      <defs>
        <marker id="b-arw" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke"></path>
        </marker>
        <marker id="b-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <circle cx="5" cy="5" r="3.5" fill="context-stroke"></circle>
        </marker>
      </defs>
      <g id="bEdgeG" transform="translate(10000,10000)"></g>
      <path class="b-tmp" id="bTmp" transform="translate(10000,10000)" d=""></path>
    </svg>
    <div class="b-ehud" id="bEhud"></div>
    <div class="b-nhud" id="bNhud"></div>
    <div class="b-snap-guide" id="bSnapV"></div>
    <div class="b-snap-guide" id="bSnapH"></div>
  </div>
  <div class="b-marquee" id="bMarquee"></div>
  <div class="b-zoomctl">
    <button onclick="zoomBy(1.2)" title="확대">＋</button>
    <div class="b-zlabel" id="bZlabel">100%</div>
    <button onclick="zoomBy(.83)" title="축소">−</button>
  </div>
</div>`;

    bStage = document.getElementById("bStage");
    bWorld = document.getElementById("bWorld");

    /* 티커 패널 이벤트(심볼 입력·주기·불러오기) */
    const _tkSym = document.getElementById("tkSym");
    if (_tkSym) {
      _tkSym.addEventListener("input", e => { const up = _upSym(e.target); const t = ensureTickerNode(); t.params.symbol = up.trim(); markDirty(); renderTickerPanel(); _tkSuggRender(up); });
      _tkSym.addEventListener("keydown", e => {
        const box = document.getElementById("tkSugg"); const open = box && box.classList.contains("open");
        if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault(); const items = box.querySelectorAll(".tk-sugg-item"); if (!items.length) return;
          _tkSuggIdx = (e.key === "ArrowDown") ? Math.min(items.length - 1, _tkSuggIdx + 1) : Math.max(0, _tkSuggIdx - 1);
          items.forEach((it, i) => it.classList.toggle("hl", i === _tkSuggIdx));
          items[_tkSuggIdx].scrollIntoView({ block: "nearest" }); return;
        }
        if (e.key === "Escape" && open) { box.classList.remove("open"); _tkSuggIdx = -1; return; }
        if (e.key === "Enter") {
          e.preventDefault();
          if (open && _tkSuggIdx >= 0) { const it = box.querySelectorAll(".tk-sugg-item")[_tkSuggIdx]; if (it) { _tkSuggPick(it.getAttribute("data-sym")); return; } }
          if (box) box.classList.remove("open");
          loadTicker();
        }
      });
      _tkSym.addEventListener("blur", () => { setTimeout(() => { const box = document.getElementById("tkSugg"); if (box) box.classList.remove("open"); }, 160); });
      const _sugg = document.getElementById("tkSugg");
      if (_sugg) _sugg.addEventListener("mousedown", e => { const it = e.target.closest(".tk-sugg-item"); if (it) { e.preventDefault(); _tkSuggPick(it.getAttribute("data-sym")); } });
      document.getElementById("tkLoad").addEventListener("click", loadTicker);
    }

    /* 가중치 리스트: 슬라이더=가중치 조절, 이름 클릭=상세 편집 */
    const _wl = document.getElementById("wlist");
    if (_wl) {
      _wl.addEventListener("input", e => {
        const t = e.target; if (!t.classList.contains("wl-sig")) return;
        const n = bN(t.dataset.id); if (!n) return;
        const sig = Number(t.value) || 0; n.conviction = sig; n.weight = Math.abs(sig);
        const row = t.closest(".wrow"), val = row && row.querySelector(".wl-val");
        if (val) { val.className = "wl-val " + (sig > 0 ? "g-up" : sig < 0 ? "g-dn" : "g-0"); val.textContent = (sig > 0 ? "▲" : sig < 0 ? "▼" : "–") + Math.abs(sig); }
        fireBoardChange();
      });
      _wl.addEventListener("click", e => { const nm = e.target.closest("[data-wedit]"); if (nm) selectOnly(nm.dataset.wedit); });
    }
    /* 데이터 시각화 패널을 전부 좌측 보드로 이동(매트릭스·예측·오실레이터·레이더 등) — 차트 우측은 메인 차트+지표 신호만.
       sigProw(지표 신호 텍스트)는 차트 아래 유지. */
    const _wb = document.getElementById("wboard");
    const _cp = document.getElementById("chartPane");
    if (_wb && _cp) {
      _cp.querySelectorAll(".fc-prow").forEach(prow => { if (prow.id !== "sigProw") _wb.appendChild(prow); });
      ["fcNarrPanel", "fcFoldPanel"].forEach(id => { const el = document.getElementById(id); if (el) _wb.appendChild(el); });
    }

    /* stage pointer/wheel/dblclick */
    bStage.addEventListener("pointerdown", e => {
      if (e.target.closest(".b-hbar,.b-hbtn")) return;
      if (e.target.closest(".b-n-ctrl") || e.target.closest(".b-n-gauge")) return;   // 카드 인라인 게이지/슬라이더는 드래그/팬 대상 아님
      if (PANEL_MODE) {   // 패널 모드: 팬/마퀴 없음(네이티브 스크롤). 노드 클릭=선택만
        const nEl = e.target.closest(".b-node");
        if (nEl && e.button === 0) nodePointerDown(nEl.dataset.id, e);
        return;
      }
      if (e.button === 1 || (spaceDown && e.button === 0)) { startPan(e); return; }
      if (e.button !== 0) return;
      const nodeEl = e.target.closest(".b-node");
      if (nodeEl) { nodePointerDown(nodeEl.dataset.id, e); return; }
      if (e.ctrlKey || e.metaKey) { startMarquee(e); return; }
      startPan(e, true);
    });

    bStage.addEventListener("wheel", e => {
      if (PANEL_MODE) return;   // 패널 모드: 네이티브 스크롤 사용
      e.preventDefault();
      const r = bStage.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const wx = (cx - view.tx) / view.scale, wy = (cy - view.ty) / view.scale;
      const ns = Math.min(2.4, Math.max(0.3, view.scale * (1 - e.deltaY * 0.0014)));
      view.scale = ns; view.tx = cx - wx*ns; view.ty = cy - wy*ns;
      applyView();
    }, { passive: false });

    bStage.addEventListener("dblclick", e => {
      if (PANEL_MODE) return;   // 패널 모드: 배경 더블클릭 노드 생성 없음
      if (e.target.closest(".b-node")) return;
      const p = worldPt(e.clientX, e.clientY);
      const n = makeNode(p.x - W_NODE/2, p.y - 35, "노드", "free");
      renderBoard(); selectOnly(n.id); fireBoardChange();
    });

    /* world click delegation */
    bWorld.addEventListener("click", e => {
      if (e.target.closest("[data-edel]")) { if (selEdge) delEdge(selEdge); return; }
      if (e.target.closest("[data-erev]")) {
        if (selEdge) {
          const ed = bE(selEdge);
          [ed.from, ed.to] = [ed.to, ed.from];
          [ed.fromSide, ed.toSide] = [ed.toSide, ed.fromSide];
          paintEdges(); fireBoardChange();
        }
        return;
      }
      const na = e.target.closest("[data-nact]");
      if (na && na.dataset.nact === "del") {   // 카드 × 버튼 → 해당 노드 삭제(선택 무관)
        const card = na.closest(".b-node");
        if (card && card.dataset.id) delNodes([card.dataset.id]);
        else if (sel.length === 1) delNodes([sel[0]]);
        return;
      }
    });

    /* 카드 인라인 중요도/확신 슬라이더 */
    bWorld.addEventListener("input", e => {
      const t = e.target;
      const card = t.closest(".b-node"); if (!card) return;
      const n = bN(card.dataset.id); if (!n) return;
      if (t.classList.contains("b-ctrl-sig")) {   // 통합 게이지: 방향=확신, 세기=중요도
        const sig = Number(t.value) || 0;
        n.conviction = sig; n.weight = Math.abs(sig);
        const g = t.closest(".b-n-gauge");
        if (g) {
          g.classList.remove("g-up", "g-dn", "g-0"); g.classList.add(sig > 0 ? "g-up" : sig < 0 ? "g-dn" : "g-0");
          const gv = g.querySelector(".b-n-gval"); if (gv) gv.textContent = (sig > 0 ? "▲" : sig < 0 ? "▼" : "–") + Math.abs(sig);
        }
        fireBoardChange();
      } else if (t.classList.contains("b-ctrl-wt")) {   // (레거시) 개별 슬라이더 — 코드 유지
        n.weight = Number(t.value);
        const cv = t.parentElement.querySelector(".cv"); if (cv) cv.textContent = n.weight;
        applyNodeWeightVisual(n);
        fireBoardChange();
      } else if (t.classList.contains("b-ctrl-conv")) {
        n.conviction = Number(t.value) || 0;
        const cv = t.parentElement.querySelector(".cv"); if (cv) cv.textContent = n.conviction;
        fireBoardChange();
      }
    });

    /* single-click → select/move first; dblclick → edit */
    bWorld.addEventListener("mousedown", e => {
      const ed = e.target.closest(".b-n-title");
      if (ed && document.activeElement !== ed) e.preventDefault();
    });
    bWorld.addEventListener("dblclick", e => {
      const ed = e.target.closest(".b-n-title");
      if (!ed) return;
      e.stopPropagation();
      ed.focus();
      const rng = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
      if (rng) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(rng); }
    });

    /* save title edits back to state */
    bWorld.addEventListener("focusout", e => {
      const f = e.target.dataset && e.target.dataset.field;
      if (!f) return;
      const nodeEl = e.target.closest(".b-node");
      if (!nodeEl) return;
      const n = bN(nodeEl.dataset.id);
      if (n) n[f] = e.target.innerText.replace(/ /g, " ").trim();
      fireBoardChange();
    });

    /* keyboard */
    window.addEventListener("keydown", e => {
      const ae = document.activeElement;
      const typing = !!(ae && (ae.isContentEditable || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA"));
      if (e.code === "Space") { spaceDown = true; if (!typing) e.preventDefault(); return; }
      if (e.key === "Escape") { if (_focusInd) { _focusInd = null; drawEvidence(); } deselectAll(); return; }
      if (typing) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selEdge) delEdge(selEdge);
        else if (sel.length) delNodes([...sel]);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        sel = boardState.nodes.map(n => n.id); selEdge = null; applySel(); paintEdges();
      }
    });
    window.addEventListener("keyup", e => { if (e.code === "Space") spaceDown = false; });

    /* 숨김 file input (라이브러리 추가용 / 노드 이미지용) */
    const _fi = document.createElement("input");
    _fi.type = "file"; _fi.id = "libFile"; _fi.accept = "image/*"; _fi.hidden = true;
    document.body.appendChild(_fi);
    const _nfi = document.createElement("input");
    _nfi.type = "file"; _nfi.id = "neImgFile"; _nfi.accept = "image/*"; _nfi.hidden = true;
    document.body.appendChild(_nfi);
  }

  /* ── Default strategy seed ───────────────────────────────────── */
  /* price → {ma, phasefold} → combine → predict  +  free memo    */
  function seedDefaultStrategy() {
    boardState.nodes = [];
    boardState.edges = [];
    /* 기본으로 모든 블록 도구 포함(고정 배치). 지표→결합→예측 연결(엔진용, 화면엔 선 없음) */
    const mk = (t, title, params) => makeNode(0, 0, title, "block", t, params || {});
    const price     = mk("price", "가격", {});
    const ma        = mk("ma", "이동평균", { len: 20 });
    const trend     = mk("trend", "추세선", { len: 40 });
    const rsi       = mk("rsi", "RSI", { period: 14 });
    const bollinger = mk("bollinger", "볼린저밴드", { len: 20, k: 2 });
    const macd      = mk("macd", "MACD", { fast: 12, slow: 26, signal: 9 });
    const adx       = mk("adx", "ADX 추세강도", { period: 14 });
    const vprof     = mk("volumeprofile", "볼륨 프로파일", { len: 120, bins: 24 });
    const ichi      = mk("ichimoku", "일목균형표", { tenkan: 9, kijun: 26, senkouB: 52, shift: 26 });
    const struct    = mk("structure", "시장구조", { swing: 3 });
    const atrn      = mk("atr", "ATR 변동성", { period: 14, mult: 2 });
    const smcn      = mk("smc", "스마트머니(FVG·OB)", {});
    const cyc       = mk("cycle", "사이클 분석", { pmin: 10, pmax: 120 });
    const vwapn     = mk("vwap", "VWAP", { len: 20 });
    const supern    = mk("supertrend", "슈퍼트렌드", { period: 10, mult: 3 });
    const stochn    = mk("stochastic", "스토캐스틱", { kLen: 14, kSmooth: 3, dLen: 3 });
    const fib       = mk("fib", "피보나치", { len: 120 });
    const elliott   = mk("elliott", "엘리어트", { swing: 3 });
    const phasefold = mk("phasefold", "파동 스캔", { pmin: 16, pmax: 128 });
    const volume    = mk("volume", "거래량", {});
    const pivotn    = mk("pivot", "피벗 포인트", {});
    const psarn     = mk("psar", "Parabolic SAR", { step: 0.02, max: 0.2 });
    const keltnern  = mk("keltner", "Keltner 채널", { len: 20, atrLen: 10, mult: 2 });
    const donchiann = mk("donchian", "Donchian 채널", { len: 20 });
    const ccin      = mk("cci", "CCI", { period: 20 });
    const willn     = mk("williams", "Williams %R", { period: 14 });
    const rocn      = mk("roc", "ROC/모멘텀", { period: 12 });
    const aon       = mk("ao", "Awesome Osc.", { fast: 5, slow: 34 });
    const aroonn    = mk("aroon", "Aroon", { period: 25 });
    const mfin      = mk("mfi", "MFI", { period: 14 });
    const cmfn      = mk("cmf", "CMF", { period: 20 });
    const combine   = mk("combine", "가중결합", {});
    const predict   = mk("predict", "예측·시그널", {});
    makeNode(0, 0, "포지 메모", "free", null, {});
    [price, ma, trend, rsi, bollinger, macd, adx, vprof, ichi, struct, atrn, smcn, cyc, vwapn, supern, stochn, fib, elliott, phasefold, volume, pivotn, psarn, keltnern, donchiann, ccin, willn, rocn, aon, aroonn, mfin, cmfn].forEach(ind => addEdge(ind.id, "right", combine.id, "left"));
    addEdge(combine.id, "right", predict.id, "left");
    layoutBlocks();
  }

  /* ── Sample Forge seed ──────────────────────────────────────── */
  function buildSampleForge() {
    const g = ForgeCore.sampleGraph();
    // 깊은 복사(공유 객체 변형 방지) + 렌더 캐시 필드 없음
    boardState.nodes = g.nodes.map(n => JSON.parse(JSON.stringify(n)));
    boardState.edges = [];   // 연결선 폐기(A안): 시각용 엣지 미사용, 분석은 지표 조합(synthEdges)
    themeState.imgId = g.themeImgId || null;
    const s = g.vision.series;
    _visionData = { price: s, n: s.length };
    _visionBias = ForgeCore.visionBiasFrom(g.vision.bias);
    _visionNote = g.vision.note || "";
    _visionWaves = g.vision.waves || [];
  }

  /* ════════════════════════════════════════════════════════════════
     CHART PANE — PHASE-FOLD render (ported from chart.html)
     Globals: fcFit(cv,h,cap), renderChart(result,data)
     Canvases: #fcMain · #fcPdm · #fcFoldA · #fcFoldB
     ════════════════════════════════════════════════════════════════ */

  let _fcLastResult = null, _fcLastData = null, fcRAF = null;

