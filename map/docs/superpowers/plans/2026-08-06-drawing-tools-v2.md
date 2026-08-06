# 드로잉 도구 2차 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스쿱포지 드로잉 도구에 연속 그리기·진행 안내·수평/수직선·색굵기·되돌리기를 넣고, 작도를 차트 본체의 정밀 규약(`CW`·`CDASH`·라디우스 3토큰)으로 끌어올린다.

**Architecture:** 모든 작업은 기존 `forge-tools.js`(478줄, UMD) 안에서 이뤄진다. 신규 상태(undo 스택·호버 id)가 늘어나므로 흩어져 있던 모듈 상태를 파일 상단 한 블록으로 모은다. 시각 고급화는 장식 추가가 아니라 `forge-draw.js`가 이미 노출한 `CW`/`CDASH`/`FC_*` 전역을 경유하도록 바꾸는 작업이다.

**Tech Stack:** 순수 바닐라 JS(빌드 도구 없음) · classic script 전역 스코프 공유 · `node --test forge-tools.test.js` · Canvas 2D · cafe24 SFTP 배포

## Global Constraints

- **`drawsPointerDown` 은 그림 0개 + 도구 무장 없음이면 즉시 `false`** 를 반환해야 한다. 이것이 기존 팬·줌·축 드래그 무회귀를 보장하는 유일한 장치다. 모든 태스크에서 재확인한다.
- **앵커는 `(날짜, 가격)`**. 봉 번호로 저장 금지.
- **저장 포맷은 완전 하위호환**: `b`·`off`·`color`·`w` 전부 선택적. 기존 `dc.draws` 그림이 마이그레이션 없이 그대로 열려야 한다.
- **색은 하드코딩 금지** — `FC_GOLD`·`FC_BULL`·`FC_BEAR`·`FC_CHART_BG` 전역을 `typeof` 가드로 경유한다(테마 추종).
- **선폭·점선은 `forge-draw.js` 의 `CW`/`CDASH` 를 쓴다**: `CW = { hair:0.85, thin:1, base:1.25, bold:1.6, halo:1.2 }` · `CDASH = { fine:[1,3.5], std:[2,4], long:[4.5,4.5] }`. 자체 수치 도입 금지.
- **라디우스는 3토큰만**: 3px·5px·7px.
- **DOM 접근은 함수 안에서만**. `node -e "require('./forge-tools.js')"` 가 throw 하면 안 된다.
- **UMD `return {...}` 는 하나만** — 기존 객체를 확장한다.
- **호버 재드로는 호버 대상 id 가 바뀔 때만**. 매 `pointermove` 마다 `drawsRender()` 를 부르면 팬 중에도 계속 다시 그려 프레임을 갉는다.
- 캐시버스터는 **배포 태스크에서만** 올린다. 중간 태스크에서 만지지 않는다.
- 바닐라 JS, 의존성 없음. 주석은 한국어로 WHY 를 적는다.
- 라이브 검증은 **읽기 경로만** — `loadTicker`·`_addTickerDoc` 호출 금지(사용자 실데이터 손상).
- 작도 변경이므로 **스크린샷 육안 대조 필수**. 픽셀 수 비교로 끝내지 않는다.
- 커밋 메시지는 한국어, 말미에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `forge-tools.js` | 수정(전 태스크) | 그리기 전부 — 상태·렌더·히트·포인터·undo·스타일 |
| `forge-tools.test.js` | 수정(Task 1) | 순수 함수 단위테스트 |
| `forge.html` | 수정(Task 3) | 수평선·수직선 버튼 |
| `forge.css` | 수정(Task 4) | 스와치 관련(없으면 생략) |
| `forge-app.js` | 수정(Task 5) | `Ctrl+Z` 는 `drawsKey` 경유이므로 변경 없음 — 확인만 |

---

### Task 1: 상태 통합 + 순수 함수 (TDD)

**Files:**
- Modify: `forge-tools.js:61`(`DRAWS`), `:192`(`_selId`), `:194`(`_armed` 외) → 한 블록으로
- Modify: `forge-tools.test.js` (파일 끝에 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `_undoPush()` — 현재 `DRAWS` 스냅샷을 스택에 push(최대 30)
  - `_undoPop()` → `Array | null` — 마지막 스냅샷 꺼내기
  - `drawStyle(d)` → `{ color:string, w:number }` — 도형의 색·선폭 해석(없으면 도구 기본값·`CW.base`)
  - `UNDO_MAX = 30` · `SW_COLORS`(색 5종 배열) · `SW_W`(굵기 3단 키 배열)

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`forge-tools.test.js` 파일 끝에 추가:

```js
test("undo 스택: push/pop 왕복, 빈 스택은 null", () => {
  const T2 = require("./forge-tools.js");
  assert.strictEqual(T2._undoPop(), null, "빈 스택은 null");
  T2._undoReset();
});

test("drawStyle: color·w 가 없으면 도구 기본색과 CW.base", () => {
  const T2 = require("./forge-tools.js");
  const s = T2.drawStyle({ type: "trend" });
  assert.strictEqual(typeof s.color, "string");
  assert.ok(s.color.length >= 4, "기본색이 있어야: " + s.color);
  assert.ok(Math.abs(s.w - 1.25) < 1e-9, "기본 굵기는 CW.base(1.25): " + s.w);
});

test("drawStyle: 저장된 color·w 를 그대로 쓴다", () => {
  const T2 = require("./forge-tools.js");
  const s = T2.drawStyle({ type: "trend", color: "#46c28e", w: "bold" });
  assert.strictEqual(s.color, "#46c28e");
  assert.ok(Math.abs(s.w - 1.6) < 1e-9, "bold 는 1.6: " + s.w);
});

test("drawStyle: 알 수 없는 w 는 base 로 떨어진다", () => {
  const T2 = require("./forge-tools.js");
  assert.ok(Math.abs(T2.drawStyle({ type: "trend", w: "zzz" }).w - 1.25) < 1e-9);
});

test("스와치 상수: 색 5종·굵기 3단", () => {
  const T2 = require("./forge-tools.js");
  assert.strictEqual(T2.SW_COLORS.length, 5);
  assert.deepStrictEqual(T2.SW_W, ["thin", "base", "bold"]);
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test forge-tools.test.js 2>&1 | tail -12`
Expected: FAIL — `_undoPop is not a function` 등 5건 실패, 기존 8건은 통과

- [ ] **Step 3: 상태를 한 블록으로 모으고 순수 함수를 구현한다**

`forge-tools.js:61`의 `let DRAWS = [];`를 다음으로 교체하고, `:192`의 `let _selId = null;`와 `:194`의 `let _armed = null, _magnet = false, _drag = null, _newDraw = null;` **두 줄은 삭제**한다(상태가 세 군데 흩어져 있어 무엇이 상호작용 상태인지 읽기 어려웠다 — 최종 리뷰 M7):

```js
  /* ── 모듈 상태 (여기 한 곳에만 둔다) ──────────────────────────────
     DRAWS      현재 문서의 그림들(저장 대상)
     _selId     선택된 그림 id
     _armed     무장한 도구 type (연속 그리기 — 완성해도 유지)
     _magnet    마그넷 on/off
     _drag      진행 중 상호작용 {kind:"new"|"handle"|"move", ...}
     _newDraw   생성 중인 그림(=_drag.kind "new" 일 때만)
     _hoverId   커서가 올라간 그림 id(예광용 — 바뀔 때만 재드로)
     _undo      되돌리기 스냅샷 스택(메모리 전용·문서에 안 실림) */
  let DRAWS = [], _selId = null, _armed = null, _magnet = false;
  let _drag = null, _newDraw = null, _hoverId = null, _undo = [];

  const UNDO_MAX = 30;
  /* 스냅샷 방식 — 그림 수십 개 × 30단계라도 수십 KB 수준이고 메모리에만 산다.
     연산 로그 방식보다 되돌림 정확도가 높고(모든 변경 종류를 한 경로로 처리) 코드가 짧다. */
  function _undoPush() {
    _undo.push(JSON.parse(JSON.stringify(DRAWS)));
    if (_undo.length > UNDO_MAX) _undo.shift();
  }
  function _undoPop() { return _undo.length ? _undo.pop() : null; }
  function _undoReset() { _undo = []; }

  const SW_COLORS = ["#e8b463", "#46c28e", "#e06a6a", "#5b8def", "#8a92b2"];
  const SW_W = ["thin", "base", "bold"];
  /* forge-draw.js 의 CW 를 그대로 쓴다 — 드로잉만 다른 굵기를 쓰면 지표 작도 옆에서 혼자 튄다.
     classic script 전역 공유라 typeof 로 방어(단독 require 시엔 없음). */
  function _cw() { return (typeof CW === "object" && CW) || { hair: 0.85, thin: 1, base: 1.25, bold: 1.6, halo: 1.2 }; }
  function drawStyle(d) {
    const w = _cw();
    const key = SW_W.indexOf(d && d.w) >= 0 ? d.w : "base";
    return { color: (d && d.color) || COL[d && d.type] || COL.trend, w: w[key] };
  }
```

`COL` 상수(`:75`)에 새 도구 두 종의 기본색을 추가한다:

```js
  const COL = { trend:"#e8b463", channel:"#5b8def", range:"#46c28e", period:"#8a92b2", hline:"#e8b463", vline:"#8a92b2" };
```

`return {...}` 에 `_undoPush, _undoPop, _undoReset, drawStyle, SW_COLORS, SW_W` 를 추가한다.

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --test forge-tools.test.js 2>&1 | grep -E "ℹ (pass|fail)"
node --test forge-core.test.js 2>&1 | grep -E "ℹ (pass|fail)"
node -e "require('./forge-tools.js')" && echo "require OK"
node --check forge-tools.js && echo "SYNTAX OK"
```
Expected: 13/0 · 251/0 · `require OK` · `SYNTAX OK`

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-tools.js map/forge-tools.test.js
git commit -m "$(cat <<'EOF'
refactor(forge-tools): 모듈 상태 한 블록 통합 + undo 스택·스타일 해석 (TDD)

상태가 세 군데 흩어져 있어 상호작용 상태 전체를 읽기 어려웠다(최종 리뷰 M7).
undo 스택·호버 id 가 늘어나는 시점이라 지금 모은다. drawStyle 은 저장된
color·w 를 해석하되 없으면 도구 기본색·CW.base 로 떨어져 하위호환을 지킨다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 연속 그리기 + 진행 칩

**Files:**
- Modify: `forge-tools.js` — `_finishNew`(`:261`), `drawsRender`(`:121`)

**Interfaces:**
- Consumes: Task 1의 상태 블록
- Produces: `_progressText()` → `string | null` — 진행 칩 문구(무장 없으면 `null`)

- [ ] **Step 1: 완성 후에도 도구를 유지하도록 바꾼다**

`_finishNew()`에서 `_armed = null;` 과 `.dp-btn` 의 `.on` 제거·커서 되돌림을 **삭제**한다. 남기는 것은 `_newDraw = null; _drag = null;` 과 `_persist(); drawsRender();` 뿐이다. 함수 위 주석에 이유를 적는다:

```js
  /* 완성 처리 — _armed 는 일부러 남긴다(연속 그리기). 선 하나 그을 때마다 팝오버를
     다시 열고 도구를 또 고르는 게 가장 큰 마찰이었다. 해제는 Esc 또는 도구 재클릭. */
```

- [ ] **Step 2: 진행 칩 문구를 구현한다**

`drawsRender` 바로 앞에 추가:

```js
  const _TOOL_KO = { trend:"추세선", channel:"평행채널", range:"등락폭 재기", period:"기간 재기", hline:"수평선", vline:"수직선" };
  /* 진행 칩 — 지금 몇 번째 클릭인지·다음에 뭘 해야 하는지. 상태를 새로 만들지 않고
     (_armed, _drag.stage, _newDraw.type) 에서 파생한다. */
  function _progressText() {
    if (!_armed) return null;
    const ko = _TOOL_KO[_armed] || _armed;
    if (!_newDraw || !_drag) {
      if (_armed === "hline") return ko + " · 가격을 클릭하세요";
      if (_armed === "vline") return ko + " · 날짜를 클릭하세요";
      return ko + " · 시작점을 클릭하세요";
    }
    if (_newDraw.type === "channel") return ko + " · " + (_drag.stage === 1 ? "1/3 — 기준선 끝점을 클릭" : "2/3 — 폭을 정할 지점을 클릭");
    return ko + " · 끝점을 클릭하세요";
  }
```

- [ ] **Step 3: 칩을 그린다**

`drawsRender()`의 `c.restore();`(클립 해제) **다음**에 추가한다 — 칩은 클립 밖에 그려 도형에 잘리지 않게 한다:

```js
    const pt = _progressText();
    if (pt) {
      c.save();
      c.font = "600 11px Pretendard,'Malgun Gothic',sans-serif"; c.textAlign = "left";
      try { c.letterSpacing = "-0.2px"; } catch (_) {}
      const hint = "Esc 취소", tw = c.measureText(pt).width, hw = c.measureText(hint).width;
      const x = G.g.padX + 10, y = G.g.padTop + 10, bw = tw + hw + 26, bh = 22;
      c.fillStyle = _labelBg();
      if (c.roundRect) { c.beginPath(); c.roundRect(x, y, bw, bh, 5); c.fill(); } else c.fillRect(x, y, bw, bh);
      c.strokeStyle = "rgba(232,180,99,.28)"; c.lineWidth = _cw().hair; c.stroke();
      c.fillStyle = (typeof FC_GOLD === "string" ? FC_GOLD : "#e8b463"); c.fillText(pt, x + 9, y + 15);
      c.fillStyle = "rgba(139,152,166,.85)"; c.fillText(hint, x + bw - hw - 9, y + 15);
      try { c.letterSpacing = "0px"; } catch (_) {}
      c.restore();
    }
```

`drawsRender` 안에서 `G` 가 없으면(`!G || !G.times.length`) 조기 반환하므로, 칩도 그때는 안 그려진다 — 데이터 없는 상태에서 칩만 떠 있는 일은 없다.

- [ ] **Step 4: 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --check forge-tools.js && echo "SYNTAX OK"
node --test forge-tools.test.js 2>&1 | grep -E "ℹ (pass|fail)"
node --test forge-core.test.js 2>&1 | grep -E "ℹ (pass|fail)"
```
Expected: `SYNTAX OK` · 13/0 · 251/0

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-tools.js
git commit -m "$(cat <<'EOF'
feat(forge): 연속 그리기 + 진행 칩

완성해도 _armed 를 유지한다 — 선 하나마다 팝오버를 다시 여는 게 가장 큰
마찰이었다. 해제는 Esc 또는 도구 재클릭. 진행 칩은 (_armed, stage, type)
에서 파생해 새 상태를 만들지 않고, 클립 밖에 그려 도형에 안 잘린다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 수평선 · 수직선

**Files:**
- Modify: `forge-tools.js` — `_renderOne`(`:148`) · `drawsHitTest`(`:287`) · `drawsPointerDown`(`:318`) · `drawsPointerMove`(`:365`) · `drawsPointerUp`(`:400`) · `_delBadge`(`:138`)
- Modify: `forge.html` — 팝오버 `.dp-tools` 에 버튼 2개

**Interfaces:**
- Consumes: Task 1의 `drawStyle`, Task 2의 `_progressText`
- Produces: `type:"hline"`(앵커 `a.p` 만 의미) · `type:"vline"`(앵커 `a.t` 만 의미). 둘 다 `b` 없음.

- [ ] **Step 1: 팝오버에 버튼을 추가한다**

`forge.html` 의 `<div class="dp-tools">` 안, `평행채널` 버튼 **다음**에 삽입:

```html
            <button class="dp-btn" data-draw="hline">수평선</button>
            <button class="dp-btn" data-draw="vline">수직선</button>
```

- [ ] **Step 2: 렌더를 분기한다**

`_renderOne` 맨 앞(`const A = _pt(G, d.a) ...` **앞**)에 삽입:

```js
    const st = drawStyle(d);
    // 수평·수직선은 앵커가 하나뿐이라 b 가 없다 — 창 전체를 가로/세로로 가로지른다.
    if (d.type === "hline" || d.type === "vline") {
      c.lineWidth = sel ? _cw().bold : st.w; c.strokeStyle = st.color; c.setLineDash(CDASH_SAFE().fine); c.lineCap = "round";
      c.beginPath();
      if (d.type === "hline") {
        const y = G.pToY(d.a.p); if (!isFinite(y)) return;
        c.moveTo(G.g.padX, y); c.lineTo(G.g.plotRight, y); c.stroke();
        _label(c, _hzFmtSafe(d.a.p), G.g.plotRight - 62, y - 4, st.color);
        if (sel) _handleRing(c, G.g.plotRight - 14, y, st.color);
      } else {
        const x = G.fiToX(tToFi(G.times, d.a.t)); if (!isFinite(x)) return;
        c.moveTo(x, G.g.padTop); c.lineTo(x, G.g.ch - G.g.padBot); c.stroke();
        _label(c, String(d.a.t).slice(2).replace(/-/g, "."), x + 5, G.g.ch - G.g.padBot - 6, st.color);
        if (sel) _handleRing(c, x, G.g.padTop + 14, st.color);
      }
      c.setLineDash([]);
      if (sel) _drawDelBadge(c, G, d);
      return;
    }
```

같은 파일에 헬퍼를 추가한다(`_label` 옆):

```js
  function CDASH_SAFE() { return (typeof CDASH === "object" && CDASH) || { fine:[1,3.5], std:[2,4], long:[4.5,4.5] }; }
  function _hzFmtSafe(v) { return (typeof _hzFmt === "function") ? _hzFmt(v) : (Math.round(v * 100) / 100).toString(); }
```

`_handleRing` 과 `_drawDelBadge` 는 Task 6에서 만든다. **지금은 임시로** 다음 두 함수를 넣고 Task 6에서 내용을 교체한다:

```js
  function _handleRing(c, x, y, col) {
    c.save(); c.beginPath(); c.arc(x, y, 4.5, 0, 7);
    c.strokeStyle = col; c.lineWidth = _cw().thin; c.stroke(); c.restore();
  }
  function _drawDelBadge(c, G, d) {
    const db = _delBadge(G, d); if (!db) return;
    c.save(); c.beginPath(); c.arc(db.x, db.y, db.r, 0, 7);
    c.fillStyle = _labelBg(); c.fill();
    c.strokeStyle = FC_BEAR_SAFE(); c.lineWidth = _cw().thin; c.stroke();
    c.beginPath();
    c.moveTo(db.x - 3.2, db.y - 3.2); c.lineTo(db.x + 3.2, db.y + 3.2);
    c.moveTo(db.x + 3.2, db.y - 3.2); c.lineTo(db.x - 3.2, db.y + 3.2);
    c.strokeStyle = FC_BEAR_SAFE(); c.lineWidth = _cw().base; c.lineCap = "round"; c.stroke(); c.restore();
  }
```

기존 `_renderOne` 안의 인라인 ✕ 배지 그리기 코드는 `_drawDelBadge(c, G, d)` 호출로 교체한다(중복 제거).

- [ ] **Step 3: `_delBadge` 가 `b` 없는 도형을 다루게 한다**

`_delBadge` 의 `const A = _pt(G, d.a), B = _pt(G, d.b);` 를 교체:

```js
    const A = _pt(G, d.a), B = d.b ? _pt(G, d.b) : A;   // hline·vline 은 b 가 없다
```

그리고 hline/vline 은 선이 창 전체를 가로지르므로 배지를 선 위 고정 위치에 둔다 — 함수 맨 앞에 추가:

```js
    if (d.type === "hline") { const y = G.pToY(d.a.p); return isFinite(y) ? { x: G.g.padX + 22, y: y - DEL_R - 4, r: DEL_R } : null; }
    if (d.type === "vline") { const x = G.fiToX(tToFi(G.times, d.a.t)); return isFinite(x) ? { x: x + DEL_R + 4, y: G.g.padTop + DEL_R + 2, r: DEL_R } : null; }
```

- [ ] **Step 4: 히트테스트를 분기한다**

`drawsHitTest` 의 본체 루프 안, `if (d.type === "trend")` **앞**에 삽입:

```js
      if (d.type === "hline") {
        const y = G.pToY(d.a.p);
        if (isFinite(y) && Math.abs(cy - y) <= BODY_R && cx >= G.g.padX && cx <= G.g.plotRight) return { kind: "body", id: d.id, which: null };
        continue;
      }
      if (d.type === "vline") {
        const x = G.fiToX(tToFi(G.times, d.a.t));
        if (isFinite(x) && Math.abs(cx - x) <= BODY_R && cy >= G.g.padTop && cy <= G.g.ch - G.g.padBot) return { kind: "body", id: d.id, which: null };
        continue;
      }
```

같은 함수 앞부분의 선택 도형 핸들 검사에서도 `b` 부재를 막는다 — `const A = _pt(G, d.a), B = _pt(G, d.b);` 를 `const A = _pt(G, d.a), B = d.b ? _pt(G, d.b) : null;` 로 바꾸고, `B` 검사는 `if (B && isFinite(B.x) ...)` 로 감싼다.

- [ ] **Step 5: 1클릭 생성과 축 고정 이동을 구현한다**

`drawsPointerDown` 의 `if (_armed) {` 블록에서 `_newDraw` 를 만든 직후 삽입:

```js
      if (_armed === "hline" || _armed === "vline") {
        // 앵커 하나로 끝나는 도구 — 클릭 한 번에 완성한다(끝점 대기 없음).
        delete _newDraw.b;
        _undoPush(); _finishNew();
        return true;
      }
```

`drawsPointerMove` 의 `move` 분기에서 축을 고정한다 — `for (const k of ["a", "b"])` 루프 앞에 삽입:

```js
      if (d.type === "hline") { d.a = { t: d.a.t, p: _iv(_lg(_drag.a0.p) + dS) }; drawsRender(); return; }   // 세로로만
      if (d.type === "vline") { d.a = { t: fiToT(G.times, tToFi(G.times, _drag.a0.t) + dFi), p: d.a.p }; drawsRender(); return; }   // 가로로만
```

`drawsPointerUp` 의 취소 판정(`Math.hypot(B.x - A.x, ...)`)은 `_newDraw.b` 가 있을 때만 수행하도록 `if (G && _newDraw.b) {` 로 감싼다.

- [ ] **Step 6: 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --check forge-tools.js && echo "SYNTAX OK"
node --test forge-tools.test.js 2>&1 | grep -E "ℹ (pass|fail)"
node --test forge-core.test.js 2>&1 | grep -E "ℹ (pass|fail)"
```
Expected: `SYNTAX OK` · 13/0 · 251/0

- [ ] **Step 7: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-tools.js map/forge.html
git commit -m "$(cat <<'EOF'
feat(forge): 수평선·수직선 — 클릭 1번 완성

앵커가 하나뿐이라 b 를 생략하고 렌더·히트·이동에서 분기한다. hline 은
세로로만·vline 은 가로로만 움직여 의미가 유지된다. 지지/저항 한 줄,
이벤트 날짜 한 줄이 가장 자주 쓰는 표기라 1클릭으로 끝낸다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 색 · 굵기 스와치

**Files:**
- Modify: `forge-tools.js` — `_renderOne` · `drawsHitTest` · `drawsPointerDown`

**Interfaces:**
- Consumes: Task 1의 `SW_COLORS`·`SW_W`·`drawStyle`·`_undoPush`
- Produces: `_swatchRects(G, d)` → `Array<{x,y,w,h,kind:"color"|"w",val}>` — 스와치 히트 영역

- [ ] **Step 1: 스와치 좌표를 계산한다**

`_delBadge` 다음에 추가:

```js
  /* 선택된 도형 옆 스타일 줄 — ✕ 배지 아래에 색 5칸 + 굵기 3칸.
     캔버스에 그리므로 DOM 추가 없이 차트와 같은 좌표계에 산다. */
  function _swatchRects(G, d) {
    const db = _delBadge(G, d); if (!db) return [];
    const S = 12, GAP = 3, y = db.y + db.r + 6;
    const out = [];
    let x = db.x - db.r;
    SW_COLORS.forEach(v => { out.push({ x, y, w: S, h: S, kind: "color", val: v }); x += S + GAP; });
    x += 5;
    SW_W.forEach(v => { out.push({ x, y, w: S, h: S, kind: "w", val: v }); x += S + GAP; });
    return out;
  }
```

- [ ] **Step 2: 스와치를 그린다**

`_drawDelBadge` 호출 **다음**(선택 상태일 때)에 추가:

```js
  function _drawSwatches(c, G, d) {
    const st = drawStyle(d), w = _cw();
    for (const r of _swatchRects(G, d)) {
      c.save();
      if (r.kind === "color") {
        c.fillStyle = r.val; c.beginPath();
        if (c.roundRect) c.roundRect(r.x, r.y, r.w, r.h, 3); else c.rect(r.x, r.y, r.w, r.h);
        c.fill();
        if (st.color === r.val) { c.strokeStyle = _chartBg(); c.lineWidth = w.base; c.stroke(); }
      } else {
        c.strokeStyle = st.color; c.lineWidth = w[r.val]; c.lineCap = "round";
        c.beginPath(); c.moveTo(r.x + 1, r.y + r.h / 2); c.lineTo(r.x + r.w - 1, r.y + r.h / 2); c.stroke();
        if (Math.abs(st.w - w[r.val]) < 1e-9) { c.strokeStyle = "rgba(232,180,99,.5)"; c.lineWidth = w.hair; c.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); }
      }
      c.restore();
    }
  }
```

`_renderOne` 의 선택 분기에서 `_drawDelBadge(c, G, d);` 다음에 `_drawSwatches(c, G, d);` 를 부른다(hline/vline 분기에도 동일하게).

- [ ] **Step 3: 히트를 추가한다**

`drawsHitTest` 의 선택 도형 검사에서 **✕ 배지 다음, 핸들 앞**에 삽입:

```js
        for (const r of _swatchRects(G, d)) {
          if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h)
            return { kind: "swatch", id: d.id, which: null, sw: r };
        }
```

`drawsPointerDown` 의 `if (h && h.kind === "del")` **앞**에 삽입:

```js
    if (h && h.kind === "swatch") {
      const d = _byId(h.id);
      if (d) { _undoPush(); if (h.sw.kind === "color") d.color = h.sw.val; else d.w = h.sw.val; _persist(); drawsRender(); }
      return true;
    }
```

`drawsCursor` 의 반환에 `swatch` 를 추가한다 — `h.kind === "del" ? "pointer" : ...` 를 `(h.kind === "del" || h.kind === "swatch" || h.kind === "handle") ? "pointer" : "move"` 로 바꾼다.

- [ ] **Step 4: 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --check forge-tools.js && echo "SYNTAX OK"
node --test forge-tools.test.js 2>&1 | grep -E "ℹ (pass|fail)"
```
Expected: `SYNTAX OK` · 13/0

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-tools.js
git commit -m "$(cat <<'EOF'
feat(forge): 색 5종·굵기 3단 스와치

선택 시 ✕ 배지 아래에 캔버스로 그린다(DOM 추가 없음). 저장은 color·w 이며
둘 다 선택적이라 기존 그림은 마이그레이션 없이 그대로 열린다. 굵기 값은
forge-draw 의 CW 를 그대로 써 지표 작도와 같은 척도를 유지한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 되돌리기 (Ctrl+Z)

**Files:**
- Modify: `forge-tools.js` — `drawsKey`(`:429`) · 변경 지점마다 `_undoPush()` · `drawsLoad`

**Interfaces:**
- Consumes: Task 1의 `_undoPush`/`_undoPop`/`_undoReset`
- Produces: 없음(내부 동작)

- [ ] **Step 1: 변경 직전에 스냅샷을 남긴다**

다음 지점에서 상태를 바꾸기 **직전에** `_undoPush()` 를 호출한다. Task 3·4에서 이미 넣은 두 곳(hline/vline 생성·스와치)은 건너뛴다.

| 위치 | 넣는 자리 |
|---|---|
| `drawsPointerDown` 의 `if (_armed) {` | `_newDraw = {...}` 대입 **앞** |
| `drawsPointerDown` 의 `kind === "del"` | `DRAWS = DRAWS.filter(...)` **앞** |
| `drawsPointerDown` 의 히트 → `handle`/`move` 드래그 시작 | `_drag = ...` **앞** |
| `drawsClear` | `DRAWS = []` **앞** |
| `drawsKey` 의 Delete 분기 | `DRAWS = DRAWS.filter(...)` **앞** |

- [ ] **Step 2: 키를 처리한다**

`drawsKey` 의 `if (e.key === "Escape")` **앞**에 삽입:

```js
    // Ctrl+Z / Ctrl+Shift+Z(=Ctrl+Y). forge 에는 보드 undo 가 없어 충돌 대상이 없다(확인함).
    // 입력 필드 포커스 중에는 위에서 이미 false 로 빠져나가므로 브라우저 기본 실행취소를 뺏지 않는다.
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
      const snap = _undoPop();
      if (!snap) return true;                  // 되돌릴 게 없어도 이벤트는 삼킨다(브라우저 기본 동작 방지)
      DRAWS = snap; _selId = null; _cancelNew();
      _persist(); drawsRender();
      return true;
    }
```

- [ ] **Step 3: 문서 전환 시 스택을 비운다**

`drawsLoad` 에서 `DRAWS = ...` 대입 **앞**에 `_undoReset();` 을 추가한다. 다른 종목의 그림을 되살리면 안 된다.

- [ ] **Step 4: 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --check forge-tools.js && echo "SYNTAX OK"
node --test forge-tools.test.js 2>&1 | grep -E "ℹ (pass|fail)"
node --test forge-core.test.js 2>&1 | grep -E "ℹ (pass|fail)"
```
Expected: `SYNTAX OK` · 13/0 · 251/0

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-tools.js
git commit -m "$(cat <<'EOF'
feat(forge): 되돌리기 Ctrl+Z — 그리기 전용 스냅샷 스택

생성·삭제·이동·끝점조정·스타일변경·전체지우기 전부 한 경로로 되돌린다.
forge 엔 보드 undo 가 없어 양보 규칙이 불필요하다(확인함). 문서 전환 시
스택을 비워 다른 종목 그림이 되살아나지 않게 한다. 상한 30.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 시각 고급화 · 검증 · 배포

**Files:**
- Modify: `forge-tools.js` — `_renderOne`·`_handleRing`·`_drawDelBadge`·`drawsPointerMove`(호버)
- Modify: `forge.html`(캐시버스터) · `CLAUDE.md` · `docs/BACKLOG.md`

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 배포된 라이브

- [ ] **Step 1: 정밀 규약으로 바꾼다**

`_renderOne` 의 공통 선폭·점선을 교체한다:

```js
    const st = drawStyle(d), w = _cw(), D = CDASH_SAFE();
    const hov = (d.id === _hoverId);
    c.lineCap = "round"; c.lineJoin = "round";
    if (sel) {   // 선택 강조는 굵기가 아니라 헤일로 — 두께는 데이터의 것이고 상태는 빛으로 말한다
      c.save(); c.globalAlpha = .18; c.strokeStyle = st.color; c.lineWidth = st.w + w.halo * 3;
      /* 아래 본선과 같은 경로를 한 번 더 그린다(호출부에서 경로 재사용) */
      c.restore();
    }
    c.globalAlpha = hov ? 1 : .88;   // 호버 예광 — 굵기 불변, 알파만
    c.lineWidth = st.w;              // 선택해도 굵어지지 않는다
    c.strokeStyle = st.color;
```

박스(`range`·`period`) 점선을 `c.setLineDash([4, 3])` → `c.setLineDash(D.fine)` 로, 채널 채움을 균일 `globalAlpha = .10` → 기준선에서 바깥으로 페이드하는 `createLinearGradient` 로 바꾼다(예측 콘과 같은 어법):

```js
      const gd = c.createLinearGradient(0, Math.min(A.y, A2.y), 0, Math.max(B.y, B2.y));
      gd.addColorStop(0, st.color + "22"); gd.addColorStop(1, st.color + "05");
      c.fillStyle = gd;
```

`_handleRing` 을 속 빈 링으로 확정한다(Task 3에서 임시로 넣은 것을 정식화):

```js
  /* 끝점 핸들 — 평시엔 속 빈 링(hairline), 호버·드래그 중에만 채운다.
     트레이딩뷰는 선택 시 핸들이 커지는데 그 반대로 간다: 크기는 그대로, 상태는 채움으로. */
  function _handleRing(c, x, y, col, filled) {
    const w = _cw();
    c.save();
    c.beginPath(); c.arc(x, y, 4.5, 0, 7);
    if (filled) { c.fillStyle = col; c.fill(); }
    else { c.fillStyle = _chartBg(); c.fill(); }
    c.strokeStyle = col; c.lineWidth = filled ? w.base : w.thin; c.stroke();
    c.restore();
  }
```

`_drawDelBadge` 는 평시 `globalAlpha = .45`, 호버 시 1.0 으로 그린다.

- [ ] **Step 2: 호버 예광을 배선한다(재드로 억제 포함)**

`drawsPointerMove` 맨 앞(`if (!_drag)` 처리 전)에 삽입:

```js
    // 호버 대상이 바뀔 때만 재드로한다 — 매 move 마다 그리면 팬 중에도 계속 다시 그려 프레임을 갉는다.
    if (!_drag) {
      const hv = drawsHitTest(cx, cy);
      const id = hv ? hv.id : null;
      if (id !== _hoverId) { _hoverId = id; drawsRender(); }
      return;
    }
```

`drawsPointerMove` 는 `forge-app.js` 가 모든 move 에서 호출하므로, 이 조기 반환이 없으면 드래그 아닐 때도 아래 분기를 계속 탄다.

- [ ] **Step 3: 헤드리스로 기능을 검증한다**

로컬 정적 서버 + 헤드리스. 쓰기는 전부 차단하고 OHLC 읽기만 라이브로 우회한다. 아래 항목을 각각 숫자로 확인하고 결과를 보고한다:

1. **연속 그리기** — 도구를 한 번 고르고 3개 연속 생성, 매번 무장이 유지되는지
2. **진행 칩** — 무장 직후 / 첫 점 이후 / 채널 stage2 에서 문구가 바뀌는지(`_progressText()` 직접 호출)
3. **hline·vline** — 클릭 1번으로 완성, `b` 가 없는지, hline 이동 시 `a.t` 불변·`a.p` 변경 / vline 은 반대
4. **스타일** — 스와치 클릭으로 `color`·`w` 가 바뀌고 `drawStyle` 이 그 값을 돌려주는지
5. **되돌리기** — 생성·삭제·이동·스타일 각각 `Ctrl+Z` 로 직전 상태 복원
6. **하위호환** — `color`·`w` 없는 그림(1차 포맷)을 `drawsLoad` 로 넣고 정상 렌더되는지(잉크 > 0)
7. **무회귀** — 그림 0개·무장 없음이면 `drawsPointerDown` 이 `false`
8. **호버 재드로 억제** — `drawsRender` 를 래핑해 호출 수를 세고, 같은 도형 위에서 20회 move 시 호출이 1회만 느는지

- [ ] **Step 4: 스크린샷으로 육안 대조한다**

지표 작도(추세선·피보나치)가 함께 보이는 상태에서 도형 4~5개를 그려 캡처하고, **Read 도구로 직접 열어** 확인한다:
- 드로잉 선폭·점선이 지표 작도와 같은 굵기·밀도인지(혼자 굵지 않은지)
- 선택 시 굵어지지 않고 헤일로로 떠오르는지
- 끝점이 속 빈 링인지, 스와치·✕가 읽히는지
- 진행 칩이 좌상단에 있고 시연 HUD와 겹치지 않는지

1차에서 픽셀 수만 보고 "정상"이라 판단했다 뒤집힌 적이 있으므로, **반드시 눈으로 본다.**

- [ ] **Step 5: 배포하고 문서를 갱신한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
# 변경된 파일만 캐시버스터 갱신
sed -i 's|forge-tools\.js?v=[0-9a-z]*|forge-tools.js?v=20260807a|; s|forge-app\.js?v=[0-9a-z]*|forge-app.js?v=20260807a|; s|forge\.css?v=[0-9a-z]*|forge.css?v=20260807a|' forge.html
grep -nE 'forge-(tools|app)\.js\?v=|forge\.css\?v=' forge.html
node --test forge-tools.test.js 2>&1 | grep -E "ℹ (pass|fail)"
node --test forge-core.test.js 2>&1 | grep -E "ℹ (pass|fail)"
lftp -u 'parksvc,wjdtjd2@' sftp://parksvc.mycafe24.com -e "cd www/map; put forge.html; put forge.css; put forge-tools.js; put forge-app.js; bye"
curl -s --compressed https://parksvc.mycafe24.com/map/forge.html | grep -oE 'forge-tools\.js\?v=[0-9a-z]+'
curl -s --compressed "https://parksvc.mycafe24.com/map/forge-api.php?ohlc=1&symbol=AAPL&tf=1day" | python3 -c "import json,sys;print('서버 데이터 무사:',len(json.load(sys.stdin)['candles']),'봉')"
```

`docs/BACKLOG.md` 의 `## 🔥 진행 중 / 대기` 맨 위에 완료 항목을 추가한다:

> `~~**[차트] 드로잉 도구 2차 — 조작·확장·시각**~~ ✅ 완료(2026-08-06, <커밋범위>): 연속 그리기(완성해도 무장 유지)+진행 칩·수평/수직선(1클릭)·색5종/굵기3단 스와치·Ctrl+Z(그리기 전용 스냅샷 30)·시각 고급화. **고급화=장식이 아니라 차트 본체의 정밀 규약(CW·CDASH·라디우스 3토큰)으로의 복귀** — 1차가 선폭 1.6~2.2·점선[4,3]으로 규약 밖이라 지표 작도 옆에서 혼자 투박했다. 선택 강조는 굵기가 아니라 헤일로, 호버는 알파만. 저장 필드 전부 선택적이라 1차 그림 하위호환. spec/plan `2026-08-06-drawing-tools-v2*`.

`CLAUDE.md` 의 `forge-tools.js` 설명에 새 도구 2종을 추가한다.

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html map/CLAUDE.md map/docs/BACKLOG.md map/forge-tools.js
git commit -m "$(cat <<'EOF'
feat(forge): 드로잉 시각 고급화 + 2차 배포

선폭·점선을 차트 본체의 CW/CDASH 로 통일하고, 선택은 굵기 대신 헤일로로,
호버는 알파로만 표현한다. 끝점은 속 빈 링(호버/드래그 시 채움).
호버 재드로는 대상 id 가 바뀔 때만.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | 태스크 |
|---|---|
| §2.1 연속 그리기(`_armed` 유지) | Task 2 Step 1 |
| §2.2 진행 칩(파생·클립 밖·HUD 비충돌) | Task 2 Step 2·3 |
| §3 hline/vline(1클릭·축 고정 이동·마그넷) | Task 3 |
| §4 색5·굵기3·저장·히트 우선순위 | Task 4 |
| §5 undo(스냅샷·30·문서전환 리셋·충돌없음) | Task 1(스택) · Task 5(배선) |
| §6.1 정밀 규약 복귀(선폭·점선·핸들·라벨·배지·채널 페이드) | Task 6 Step 1 |
| §6.2 호버 예광 · 선택 헤일로 | Task 6 Step 1·2 |
| §7 저장 포맷 하위호환 | Task 1(`drawStyle` 기본값) · Task 6 검증 6 |
| §8 검증 1~10 | Task 1(1~3 단위) · Task 6 Step 3(4~10) · Step 4(육안) |
| §9 범위 밖 | 태스크 없음(의도) |

누락 없음.

**2. 플레이스홀더 스캔**

"TBD"·"적절히"·"테스트 작성" 류 없음. Task 6 Step 5의 백로그 문구에 `<커밋범위>`가 있는데 실행 시점에야 알 수 있는 값이라 의도적 자리표시다(기존 백로그 관례와 동일).

Task 3 Step 2가 `_handleRing`·`_drawDelBadge`를 임시로 넣고 Task 6에서 교체하는 구조인데, 이는 "나중에 구현" 플레이스홀더가 아니라 **두 태스크 모두 실제 동작하는 코드를 담고** 있고 Task 6이 시각 규약만 바꾸는 것이다. Task 3만 끝난 시점에도 기능은 완전히 동작한다.

**3. 타입 일관성**

- `drawStyle(d)` → `{color, w:number}` — Task 1 정의, Task 3·4·6 소비 ✓
- `SW_COLORS`(5) · `SW_W`(`["thin","base","bold"]`) — Task 1 정의, Task 4 소비 ✓
- `_undoPush()`/`_undoPop()`/`_undoReset()` — Task 1 정의, Task 3·4·5 소비 ✓
- `_swatchRects(G,d)` → `[{x,y,w,h,kind,val}]` — Task 4 정의·소비, `drawsHitTest` 가 `{kind:"swatch", sw:r}` 로 감싸 반환 ✓
- `_handleRing(c,x,y,col,filled)` — Task 3에서 4인자로 도입, Task 6에서 `filled` 추가. **Task 3의 호출부는 `filled` 없이 호출하므로 `undefined`→falsy→속 빈 링**으로 자연 동작 ✓
- `_delBadge(G,d)` → `{x,y,r}|null` — 1차에서 정의, Task 3이 hline/vline 분기 추가 ✓
- `CDASH_SAFE()`/`_cw()`/`_hzFmtSafe()` — Task 1·3에서 정의, Task 6 소비 ✓
- `_hoverId` — Task 1 상태 블록에 선언, Task 6 사용 ✓
