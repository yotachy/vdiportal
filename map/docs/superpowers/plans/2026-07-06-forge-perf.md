# forge 성능 Phase 2 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans 또는 subagent-driven-development. 체크박스(`- [ ]`) 단계.

**Goal:** 상시 rAF FX 루프(`drawFx`)를 가시성·프레임캡·감속모션 인지로 제어하고, 오프스크린 서브패널 렌더를 지연해 유휴·부팅 부하를 낮춘다(동작·시각 불변).

**Architecture:** `forge-app.js`의 `drawFx`/`startFx`에 `stopFx`+30fps 캡+가시성 게이트 추가, `visibilitychange` 핸들러에 FX 연동. 서브패널 draw는 IntersectionObserver 게이트(즉시 폴백). 코어·데이터 미변경.

**Tech Stack:** 바닐라 JS. 검증 = Phase1 SIG 하베스터 재사용 + 헤드리스 시각·rAF 토글 확인.

## Global Constraints

- `forge-core.js`·데이터·서버 미변경. `node --test` 199/199 유지.
- FX **활성 시 시각 결과 현행 동일**(스로틀은 프레임 간격만). 로직·디자인 불변.
- 안전 폴백: IntersectionObserver 미지원/실패 시 즉시 그림(현행 동작).
- 배포 세트 7파일 동반(변경 파일만 재배포). 좌측 accent line 금지.
- 헤드리스: 기존 세션 세팅(chrlibs·chrome). 자매 파일 scratchpad 동기화.

---

### Task 1: FX 루프 제어 (A — 최대 상시 비용 절감)

**Files:** Modify `map/forge-app.js` (`drawFx`/`startFx` ~1472–1518, `visibilitychange` ~2606)

**Interfaces:**
- Produces: `stopFx()`; `startFx()`(감속모션 정적1회·차트모드 시작); `drawFx`(rAF 재요청 분리·30fps 캡·가시성 skip).

- [ ] **Step 1: drawFx/startFx/stopFx 재구성.** 현재:

```javascript
  let _fxRaf = null;
  function drawFx(now) {
    _fxRaf = requestAnimationFrame(drawFx);
    const cv = document.getElementById("fcFx"); if (!cv) return;
    // … (그리기 본문) …
  }
  function startFx() { if (!_fxRaf) _fxRaf = requestAnimationFrame(drawFx); }
```

→ 로 교체(그리기 본문 `// … (그리기 본문) …` 부분은 **그대로 유지**, 최상단 rAF 재요청 줄만 제거):

```javascript
  let _fxRaf = null, _fxLast = 0;
  function drawFx(now) {
    const cv = document.getElementById("fcFx"); if (!cv) return;
    // … (그리기 본문 그대로) …
  }
  function _fxLoop(now) {
    _fxRaf = requestAnimationFrame(_fxLoop);
    if (document.hidden || (typeof heroMode === "function" && heroMode() !== "chart")) return;  // 유휴/비차트: 그리기 skip(빈 콜백)
    if (now && (now - _fxLast) < 33) return;   // ~30fps 캡
    _fxLast = now || 0;
    drawFx(now);
  }
  function startFx() {
    stopFx();
    if (typeof prefersReducedMotion === "function" && prefersReducedMotion()) { drawFx(0); return; }  // 정적 1회, 루프 없음
    _fxLast = 0; _fxRaf = requestAnimationFrame(_fxLoop);
  }
  function stopFx() { if (_fxRaf) { cancelAnimationFrame(_fxRaf); _fxRaf = null; } }
```

> 주의: drawFx 본문 안의 기존 `if (prefersReducedMotion()) { …정적 링… }` 분기는 유지 — `drawFx(0)` 정적 호출이 그 분기로 정적 링을 그린다.

- [ ] **Step 2: visibilitychange에 FX 연동.** 현재(2606):

```javascript
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPulse();
    else if (_ovResult && !prefersReducedMotion()) startPulse();
  });
```

→ FX도 함께 정지/재개:

```javascript
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopPulse(); stopFx(); }
    else { if (_ovResult && !prefersReducedMotion()) startPulse(); startFx(); }
  });
```

- [ ] **Step 3: 문법·SIG.** `node --check forge-app.js`. 헤드리스 SIG == baseline(FX는 SIG에 안 잡히지만 회귀 없음 확인).

Run: `node --check map/forge-app.js` + `bash <scratchpad>/snap.sh`
Expected: 문법 OK, `MATCH`

- [ ] **Step 4: FX 동작 확인(헤드리스).** ①`typeof stopFx==="function"` ②startFx 후 `_fxRaf` 존재 → stopFx 후 null ③`document.hidden` 모의 후 visibilitychange dispatch → `_fxRaf` null ④감속모션(matchMedia 모의) startFx → `_fxRaf` null(정적) ⑤에러 0. ⑥FX 활성 스크린샷 — 예측 종점 링/shimmer 정상.

- [ ] **Step 5: Commit** — `git commit -am "perf(forge): 앰비언트 FX 루프 제어(stopFx·30fps캡·탭숨김정지·감속모션 루프중단)"`

---

### Task 2: 오프스크린 서브패널 지연 렌더 (B — 보조·보수적)

**Files:** Modify `map/forge-app.js` (서브패널 draw 디스패치 ~61–72)

**Interfaces:**
- Consumes: `fcDrawRsi/Macd/Adx/Vol/Cci/Williams/Mfi`(forge-draw.js).
- Produces: 화면 밖 서브패널 draw 지연 + 진입 시 최초 그림. 안전 폴백=즉시.

- [ ] **Step 1: 지연 헬퍼 추가.** 서브패널 디스패치 함수 상단에 IntersectionObserver 기반 게이트:

```javascript
  let _lazyIO = null; const _lazyPending = new Map();   // canvasEl → drawThunk
  function _lazyDraw(cvId, thunk) {
    const cv = document.getElementById(cvId);
    if (!cv || typeof IntersectionObserver !== "function") { thunk(); return; }   // 폴백: 즉시
    const rect = cv.getBoundingClientRect();
    const vis = rect.bottom > 0 && rect.top < (window.innerHeight || 9999);
    if (vis) { thunk(); return; }                    // 보이면 즉시
    _lazyPending.set(cv, thunk);                      // 안 보이면 진입 시 그림
    if (!_lazyIO) _lazyIO = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { const t = _lazyPending.get(e.target); if (t) { t(); _lazyPending.delete(e.target); } _lazyIO.unobserve(e.target); }
    }), { rootMargin: "120px" });
    _lazyIO.observe(cv);
  }
```

- [ ] **Step 2: 서브패널 draw를 `_lazyDraw`로 감싸기.** 각 `fcDrawX(...)` 호출을 `_lazyDraw("<canvasId>", () => fcDrawX(...))`로. 캔버스 id는 각 fcDrawX 내부의 `document.getElementById(...)` 대상(예: `fcRsi`·`fcMacd`…)과 일치시킨다(구현 시 각 함수에서 확인). **시뮬레이션 중(`_playing`)엔 지연 끄고 즉시**(reveal 애니메이션 정합).

- [ ] **Step 3: 문법·SIG.** `node --check` + SIG == baseline.

- [ ] **Step 4: 스크롤 렌더 확인(헤드리스).** ①초기: 화면 밖 서브패널 캔버스가 비어있다가 ②스크롤로 진입 시 그려짐 ③Observer 미지원 모의 시 즉시 그림(폴백) ④시뮬레이션 재생 시 전체 즉시 ⑤에러 0.

- [ ] **Step 5: Commit** — `git commit -am "perf(forge): 오프스크린 서브패널 지연 렌더(IntersectionObserver·즉시 폴백)"`

---

### Task 3: 최종 검증 + 배포

- [ ] **Step 1: 전체 SIG + 시각 회귀.** midnight·paper·daylight 스크린샷 == 분리 후와 동일. SIG == baseline.
- [ ] **Step 2: 코어 테스트.** `node --test forge-core.test.js` 199/199.
- [ ] **Step 3: 배포.** cafe24 `www/map`에 `forge-app.js`(변경분) `put`. 캐시버스터 `?v=` 갱신 필요 시 forge.html의 forge-app.js `?v=` 올리고 forge.html도 put. curl 200 확인.
- [ ] **Step 4: 메모리 기록** — Phase 2 완료(FX 루프 제어·지연 렌더) scoopforge-deploy.md.

---

## 자체 검증(계획 작성자)

- 스펙 커버리지: A(FX 제어=T1) / B(지연 렌더=T2) / 검증·배포(T3). ✅
- 무회귀: FX 활성 시각 동일·SIG 불변·폴백 즉시그림·코어 199/199. ✅
- 함수명 일관: `stopFx`/`startFx`/`_fxLoop`/`_fxLast`/`_lazyDraw`. ✅
- 비목표(워커·minify·morph 재작성) 범위 밖 명시. ✅
