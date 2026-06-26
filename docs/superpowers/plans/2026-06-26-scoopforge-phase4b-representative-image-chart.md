# 스쿱포지 Phase 4-B (R2: 대표 이미지 = 우측 가격차트) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포지 대표 이미지를 우측 패널의 가격차트(히어로)로 크게 띄우고, 이미지 오른쪽 미래 존에 현재 계산 예측을 미리보기로 잇는다. 좌측 상단 배너는 제거하고 PDM/폴드 리드아웃은 아래 유지.

**Architecture:** `forge.html` 우측 `.chart-pane` 첫 패널의 캔들 메인(`#fcMain`)을 `.fc-hero`(대표 이미지 `<img>` + 미래 존 `#fcFuture` 캔버스)로 교체. 보드 상단 배너(`#themeBar`) 제거 후 `renderTheme`을 히어로 갱신으로 리포인트. `#fcMain` 대상 차트 오버레이(합의/콘)는 R2 비활성, 미래 존엔 현재 `ForgeCore.run` 예측을 자체 y-스케일로 미리보기. 데이터는 여전히 데모(축 정밀 정렬은 R5 비전).

**Tech Stack:** 바닐라 JS. forge-core.js 무변경(node 15/15 회귀). 검증은 헤드리스(오프라인 또는 임시 사본 절대 API).

## Global Constraints

- 수정 대상: `map/forge.html`만. 기존 `map/map.html`·`map/chart.html`·`map/api.php`·`map/forge-api.php`·`map/forge-core.js`·모든 `*_*.json` 불가침.
- 바닐라 JS, 2 spaces, 큰따옴표, 케밥케이스. 다크 골드 토큰(`--gold/--bg/--eth/--panel/--line`). 한국어 UI. noindex. FORGE_API 상대.
- forge-core.js 무변경 → `node --test map/forge-core.test.js` 15/15.
- 대표 이미지 = `themeState.imgId`(활성 포지 themeImgId). 차트 ≡ 대표 이미지 항상.

---

## Task 1: 배너 제거 + 히어로(대표 이미지) 구조

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `themeState`, `imgSrc`, `renderChart`, `renderOverlay`, `setThemeImg`, `loadDoc`, `renameDoc`, `boardInit`, `fcDrawMain`(미사용 처리).
- Produces: `.fc-hero`(#fcHeroImg + #fcFuture) 마크업; `renderHero()` (대표 이미지/플레이스홀더 표시); `renderTheme()`→`renderHero()` 리포인트; `#fcMain`/배너 제거 및 깨진 호출 정리.

- [ ] **Step 1: 차트 패널 첫 칸을 히어로로 교체** — `.chart-pane`의 첫 `.fc-panel` 본문(현재 `<div class="fc-pbody"><canvas id="fcMain" class="fc-cv"></canvas></div>`)을 교체:
```html
          <div class="fc-hero">
            <div class="fc-hero-img" id="fcHeroImg"><span class="fc-hero-ph">라이브러리에서 대표 이미지를 드래그하세요</span></div>
            <canvas id="fcFuture" class="fc-cv"></canvas>
          </div>
```
그 첫 `.fc-panel`이 커지도록 클래스/스타일 부여(예: 여는 태그를 `<div class="fc-panel fc-panel-hero">`). CSS 추가:
```css
.fc-panel-hero{flex:1 1 auto;min-height:300px}
.fc-hero{display:flex;gap:6px;height:100%;min-height:260px}
.fc-hero-img{flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.fc-hero-img img{width:100%;height:100%;object-fit:contain}
.fc-hero .fc-hero-ph{color:var(--eth);font-size:12px;text-align:center;padding:0 14px;line-height:1.5}
#fcFuture{flex:0 0 200px;height:100%}
```

- [ ] **Step 2: `renderHero` + `renderTheme` 리포인트** — `renderTheme()`(현재 #themeBar 갱신)을 히어로 갱신으로 교체:
```js
function renderHero() {
  const el = document.getElementById("fcHeroImg"); if (!el) return;
  el.innerHTML = themeState.imgId
    ? `<img src="${imgSrc(themeState.imgId)}" alt="">`
    : `<span class="fc-hero-ph">라이브러리에서 대표 이미지를 드래그하세요</span>`;
}
function renderTheme() { renderHero(); }
```
(`setThemeImg`/`loadDoc`/`renameDoc`가 부르는 `renderTheme`는 그대로 두면 히어로로 위임됨. 별도 변경 불필요. — 단, `renderTheme` 내부에서 `#themeBar`/`.th-title`를 만지던 코드는 제거.)

- [ ] **Step 3: 배너(#themeBar) 제거** — `boardInit`의 `pane.innerHTML`에서 `#themeBar`(`.forge-theme`) div 3줄 제거(보드 stage가 그 공간 회수 — `.board-pane` flex/`.b-stage` flex:1 유지 확인). `.forge-theme` 관련 CSS 블록 제거. `pane.querySelector(".th-title").addEventListener("focusout", …)` 리스너 제거(제목은 사이드바 ✎/`renameDoc`로 일원화). `renameDoc`가 `themeState.title` 갱신은 유지.

- [ ] **Step 4: 깨진 `#fcMain`/오버레이 호출 정리** — `renderChart`에서 `fcDrawMain(...)` 호출(1672 부근) 제거하고 그 자리에 `renderHero();` (미래 존은 Task 2에서). `renderOverlay`에서 `#fcMain`/`#fcOverlay` 대상 `drawConsensus(...)`·`drawCone(...)` 호출을 **R2 비활성**(주석: R5에서 이미지 위로 부활) — 호출만 제거/주석. `ensureOverlays`가 `#fcMain` 기준으로 `#fcOverlay`를 만들면 `#fcMain` 없을 때 안전하게 스킵(가드). 보드 펄스(`startPulse`/`#boardOverlay`)는 유지. `fcDrawMain` 함수 정의는 남겨도 무방(미호출).

- [ ] **Step 5: 헤드리스 검증 + 커밋** — 컨트롤러: 우측 첫 패널이 히어로(이미지 없으면 플레이스홀더, 라이브러리 이미지 드래그/Ctrl+V 시 크게 표시), 배너 없음, PDM/폴드 정상, 콘솔 에러 0. `node --test map/forge-core.test.js` 15/15.
```bash
git add map/forge.html
git commit -m "feat(forge): 대표 이미지 히어로(우측 가격차트) + 상단 배너 제거 + 차트 오버레이 R2 비활성"
```

---

## Task 2: 미래 존 예측 미리보기

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `renderChart`, `lastResult.prediction`(path/lo/hi/anchor), `fcFit`, `FC_GOLD`, `FC_DIM`.
- Produces: `fcDrawFuture(pred)` — `#fcFuture`에 예측 콘+선을 seam(좌측="지금")에서 미리보기. renderChart가 호출.

- [ ] **Step 1: `fcDrawFuture` 추가** — forge.html에:
```js
function fcDrawFuture(pred) {
  const cv = document.getElementById("fcFuture"); if (!cv) return;
  const ch = cv.clientHeight || 240, c = fcFit(cv, ch);
  const cw = cv.clientWidth || 200;
  c.clearRect(0, 0, cw, ch);
  const path = (pred && pred.path) || [], lo = (pred && pred.lo) || [], hi = (pred && pred.hi) || [];
  if (!path.length) {
    c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center";
    c.fillText("예측 미리보기", cw / 2, ch / 2); c.textAlign = "left"; return;
  }
  let loMin = Infinity, hiMax = -Infinity;
  for (let i = 0; i < path.length; i++) { loMin = Math.min(loMin, lo[i]); hiMax = Math.max(hiMax, hi[i]); }
  if (pred.anchor != null) { loMin = Math.min(loMin, pred.anchor); hiMax = Math.max(hiMax, pred.anchor); }
  const pad = (hiMax - loMin) * 0.1 || 1; loMin -= pad; hiMax += pad;
  const toY = v => 16 + (1 - (v - loMin) / ((hiMax - loMin) || 1)) * (ch - 32);
  const toX = k => 8 + (k / Math.max(1, path.length - 1)) * (cw - 14);
  const anchorY = toY(pred.anchor != null ? pred.anchor : path[0]);
  /* seam ("지금") */
  c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.beginPath(); c.moveTo(8, 0); c.lineTo(8, ch); c.stroke();
  c.fillStyle = FC_DIM; c.font = "10px ui-monospace,monospace"; c.fillText("지금", 11, 12);
  /* cone fill */
  c.beginPath(); c.moveTo(8, anchorY);
  for (let k = 0; k < path.length; k++) c.lineTo(toX(k), toY(hi[k]));
  for (let k = path.length - 1; k >= 0; k--) c.lineTo(toX(k), toY(lo[k]));
  c.lineTo(8, anchorY); c.closePath(); c.fillStyle = "rgba(232,180,99,.14)"; c.fill();
  /* path line */
  c.strokeStyle = FC_GOLD; c.lineWidth = 1.8; c.setLineDash([5, 4]);
  c.beginPath(); c.moveTo(8, anchorY);
  for (let k = 0; k < path.length; k++) c.lineTo(toX(k), toY(path[k]));
  c.stroke(); c.setLineDash([]);
}
```

- [ ] **Step 2: renderChart에서 호출** — `renderChart`의 `renderHero();`(Task 1) 다음에 `fcDrawFuture(result.prediction || { path: [], lo: [], hi: [] });` 추가. PDM/폴드 렌더는 그대로 유지.

- [ ] **Step 3: 헤드리스 검증 + 커밋** — 컨트롤러: 미래 존(#fcFuture)에 예측 콘+점선 + "지금" seam이 그려짐(데모 예측 기반). 이미지 교체/실행 시 갱신. PDM/폴드 유지. 콘솔 에러 0. node 15/15.
```bash
git add map/forge.html
git commit -m "feat(forge): 미래 존 예측 미리보기(fcDrawFuture) — 대표 이미지 우측에서 이어 그림"
```

---

## Self-Review (작성자 점검)

**Spec coverage:**
- §2.1 배너 제거 + renderTheme 리포인트 + 제목 사이드바 일원화 → Task 1 Step 2·3. ✅
- §2.2 히어로(이미지+미래존) + 리드아웃 유지 → Task 1 Step 1(마크업), PDM/폴드 그대로. ✅
- §3 renderHero(이미지/플레이스홀더/라이브 갱신) → Task 1 Step 2; 미래 존 예측 미리보기 → Task 2; `#fcMain`/오버레이 비활성 → Task 1 Step 4. ✅
- §5 검증(헤드리스·node 15/15) → 각 Task 검증 Step. ✅
- §7 리스크(깨진 참조 정리·renderTheme 정합·오버레이 가드·미래존 자체 y스케일) → Task 1 Step 4·Task 2. ✅

**Placeholder scan:** 마크업/CSS/renderHero/fcDrawFuture 실제 코드. 배너·오버레이 제거는 정확한 대상 명시(구현자가 boardInit/renderOverlay에서 위치 확인). 검증은 컨트롤러 헤드리스. 플레이스홀더 없음.

**Type consistency:** `renderHero`/`renderTheme`(위임)/`fcDrawFuture`/`#fcHeroImg`/`#fcFuture`/`themeState.imgId`/`imgSrc`/`FC_GOLD`/`FC_DIM`/`fcFit` 명칭 forge 기존과 일치. `renderChart`가 `renderHero()`+`fcDrawFuture(result.prediction)` 호출(Task1→Task2 정합). `setThemeImg`/`loadDoc`/`renameDoc`→`renderTheme`→`renderHero` 경로 일관.
