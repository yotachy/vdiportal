# 다중스케일 작도 시연 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 시연에서 추세선·피보나치를 **좁게(120봉) → 중간(600봉·판정) → 넓게(전량)** 3단으로 카메라를 옮기며 각각 작도하고, 스케일이 겹치는 지점(합류)과 방향 충돌을 드러낸다.

**Architecture:** 스케일별 계산은 **이미 있는 `analyze*({win})` 를 그대로 호출**한다(엔진 1.11.1~1.11.2 에서 trend·elliott·structure 에 넣은 창 옵션. 이 플랜은 fib 에 같은 옵션을 더한다). 새로 만드는 것은 **선별·합류·문구 순수 함수 3개**(forge-core, `run()` 미호출)와 **작도의 스케일 상태**(forge-draw), **시연 3단 시퀀스**(forge-embed)뿐이다. 앱 코드는 0줄 — 앱은 `forge.html?embed=app` 을 iframe 으로 실행하므로 자동 상속된다.

**Tech Stack:** 바닐라 JS(브라우저 전역 스크립트, 로드 순서 core→state→ui→draw→tools→app) · UMD + `node --test`(forge-core) · 빌드 도구 없음

**Spec:** `map/docs/superpowers/specs/2026-08-28-multiscale-drawing-demo-design.md`

## Global Constraints

- **엔진 판정 불변**: 새 함수는 `run()` 이 부르지 않는다. `analyzeFib` 에 `win` 을 더할 때 **≤창이면 no-op** 을 백테스트 픽스처 바이트 대조로 증명한다(오늘 trend·elliott·structure 에 세 번 한 절차와 동일).
- **관문**: `cd map && ./tests/run.sh` — **착수 시점 기준선 1023건 전체 통과**.
- **스케일 정의**(스펙 §3): 좁게 `120` · 중간 `600` · 넓게 `전량`. 축약 `P>900→3단 / 240<P≤900→2단(120·전량) / P≤240→1단(전량)`.
- **합류 규약**(스펙 §4-B): `tol = (비교 대상 가격 범위) × 0.012`, **2개 이상** 스케일이 tol 안이면 합류.
- **부호 문턱**: `±0.05%/봉`(기존 작도 규약과 동일).
- **정직 표기**(스펙 §6, 협상 불가): '판정 근거' 배지는 **중간(600봉) 스케일에만**. 좁게·넓게는 `맥락 · 판정 미반영`. 각 선 라벨에 **창 봉수** 표기(`장기 600봉 +0.13%/봉 R²0.80`). 방향 요약은 표에 있는 조합만 문구, 없으면 **나열로 끝낸다**.
- **좌측 컬러 라인 금지**(전역 디자인 규율). 강조는 알파·굵기·배경으로만.
- 커밋 스코프 `forge`. 다중 태스크이므로 **브랜치 → `merge:` 커밋**.
- 작업 디렉토리 `map/`, git 루트는 그 상위 → 커밋 경로는 `map/...`.
- ⚠ `map/forge-engine.html` 에 **다른 트랙의 미커밋 작업**(§1 엔진 단면도, 337줄)이 있다. 이 플랜은 그 파일을 건드리지 않는다. `git add -A` 금지 — 개별 경로만.

---

## File Structure

| 파일 | 신규/수정 | 책임 |
|---|---|---|
| `map/forge-core.js` | 수정 | `analyzeFib` 에 `opts.win` + 스윙 인덱스 좌표 복원 · 순수 함수 `scaleSet` · `scaleConfluence` · `scaleVerdictText` |
| `map/forge-core.test.js` | 수정 | 위 4건 테스트 |
| `map/forge-draw.js` | 수정 | 스케일 상태 `_scaleStage` · trend/fib 스케일별 렌더 · 합류 강조 · 스케일 라벨/배지 |
| `map/forge-embed.js` | 수정 | 3단 시퀀스 · 스케일별 카메라 구간 · 타이밍 분모 · 창 단위 로그 판정 · 340 상한 해제 |
| `map/docs/BACKLOG.md` | 수정 | 항목 등록·완료 기록 |

---

### Task 1: `analyzeFib` 창 옵션 (엔진 · no-op 증명)

**Files:**
- Modify: `map/forge-core.js` (`analyzeFib`, 1195행 부근)
- Test: `map/forge-core.test.js` (append)

**Interfaces:**
- Produces: `ForgeCore.analyzeFib(price, { win?: number, len?, swing?, srPct? })` — `win` 기본 600. `Pfull > win` 이면 최근 `win` 봉만 보고, 반환되는 모든 `fromIdx`/`toIdx`(`swing` · `degrees[].swing`)는 **전체 배열 좌표로 복원**된다. `win` 이 전체 길이 이상이면 기존과 완전히 동일(no-op).

- [ ] **Step 1: 실패하는 테스트 작성**

`map/forge-core.test.js` 맨 아래에 append:

```js

// ── analyzeFib 창 옵션(2026-08-28) — trend·elliott·structure 와 동형 ─────────────
// 다중스케일 작도가 스케일마다 fib 를 다시 계산한다(좁게 120 · 중간 600 · 넓게 전량).
// 창을 씌워도 인덱스는 전체 좌표로 돌아와야 작도가 정합한다.
test("analyzeFib: win 이 전체 길이 이상이면 기존과 동일(no-op)", () => {
  const p = [];
  for (let i = 0; i < 500; i++) p.push(100 * Math.exp(0.0012 * i) + 9 * Math.sin(i / 21));
  assert.deepEqual(ForgeCore.analyzeFib(p, { len: 120, swing: 0.05 }),
    ForgeCore.analyzeFib(p, { len: 120, swing: 0.05, win: 1e9 }));
});

test("analyzeFib: 창을 씌우면 그 구간 계산 + 인덱스는 전체 좌표", () => {
  const p = [];
  for (let i = 0; i < 1500; i++) p.push(100 * Math.exp(0.0012 * i) + 9 * Math.sin(i / 21));
  const off = p.length - 600;
  const full = ForgeCore.analyzeFib(p, { len: 120, swing: 0.05, win: 600 });
  const win = ForgeCore.analyzeFib(p.slice(off), { len: 120, swing: 0.05, win: 1e9 });
  assert.equal(full.bias, win.bias);
  assert.equal(full.swing.fromIdx, win.swing.fromIdx + off);
  assert.equal(full.swing.toIdx, win.swing.toIdx + off);
  assert.equal(full.swing.fromPrice, win.swing.fromPrice);
  assert.equal(full.degrees.length, win.degrees.length);
  full.degrees.forEach(function (d, i) {
    assert.equal(d.swing.fromIdx, win.degrees[i].swing.fromIdx + off, d.name + " degree fromIdx");
    assert.equal(d.swing.toIdx, win.degrees[i].swing.toIdx + off, d.name + " degree toIdx");
  });
  // 복원된 인덱스가 실제 배열 범위 안이고 그 자리 가격과 맞아야 한다(작도가 이 좌표를 쓴다)
  assert.ok(Math.abs(p[full.swing.fromIdx] - full.swing.fromPrice) < 1e-9);
  assert.ok(Math.abs(p[full.swing.toIdx] - full.swing.toPrice) < 1e-9);
});

test("analyzeFib: 기본 창은 600(검증 영역)", () => {
  const p = [];
  for (let i = 0; i < 2000; i++) p.push(100 + 20 * Math.sin(i / 37) + i * 0.03);
  const def = ForgeCore.analyzeFib(p, { len: 120, swing: 0.05 });
  const w600 = ForgeCore.analyzeFib(p, { len: 120, swing: 0.05, win: 600 });
  assert.deepEqual(def, w600);
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd map && node --test forge-core.test.js 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `fail 2` (첫 no-op 테스트는 win 이 무시돼도 통과할 수 있다 — 나머지 둘이 실패한다)

- [ ] **Step 3: 구현**

`map/forge-core.js` `analyzeFib` 의 앞부분을 교체한다. 기존:

```js
    const len = opts.len || 120, swing = opts.swing != null ? opts.swing : 0.05, srPct = opts.srPct != null ? opts.srPct : 0.01;
    const P = price.length;
    const EMPTY = { dir: null, swing: null, levels: [], zone: { nearest: null, inGolden: false, lower: null, upper: null, goldenLo: null, goldenHi: null }, bias: 0, degrees: [] };
    if (P < 2) return EMPTY;
    // 단기: 최근 피벗 스윙(없으면 len 창 폴백)
    const sw = detectSwings(price, swing);
```

교체 후:

```js
    const len = opts.len || 120, swing = opts.swing != null ? opts.swing : 0.05, srPct = opts.srPct != null ? opts.srPct : 0.01;
    const Pfull = price.length;
    const EMPTY = { dir: null, swing: null, levels: [], zone: { nearest: null, inGolden: false, lower: null, upper: null, goldenLo: null, goldenHi: null }, bias: 0, degrees: [] };
    if (Pfull < 2) return EMPTY;
    // 검증 영역 정합 + 다중스케일 작도(2026-08-28 · cycle·trend·elliott·structure 600봉 창과 동형).
    // 스윙 탐색을 최근 FIB_WIN 봉으로 씌운다. ≤FIB_WIN 이면 off=0 → 기존과 완전히 동일(no-op).
    // 반환 인덱스는 전체 배열 좌표로 되돌린다 — 작도가 그 좌표로 스윙선을 긋는다.
    const FIB_WIN = opts.win || 600;
    const off = Pfull > FIB_WIN ? Pfull - FIB_WIN : 0;
    const wp = off > 0 ? price.slice(off) : price;
    const P = wp.length;
    // 단기: 최근 피벗 스윙(없으면 len 창 폴백)
    const sw = detectSwings(wp, swing);
```

이어서 같은 함수 안의 `price` 참조 4곳을 `wp` 로 바꾼다(창 안에서 계산해야 한다):

```js
    else shortSw = _domSwing(wp, Math.max(0, P - len)) || _domSwing(wp, 0);
    if (!shortSw) return EMPTY;
    const shortDeg = _fibDegree(wp, shortSw, len, srPct); shortDeg.name = "단기";
```

```js
    const midSw = (P > len) ? _domSwing(wp, P - len) : null;
    if (midSw && !dup(shortDeg, midSw)) { const m = _fibDegree(wp, midSw, len, srPct); m.name = "중기"; degrees.push(m); }
    // 장기: 전체 시계열 지배 스윙
    const longSw = _domSwing(wp, 0);
    if (longSw && !degrees.some(d => dup(d, longSw))) { const l = _fibDegree(wp, longSw, len, srPct); l.name = "장기"; degrees.push(l); }
```

마지막으로 반환문 바로 앞에 좌표 복원을 넣는다. 기존 반환문:

```js
    return { dir: shortDeg.dir, swing: shortDeg.swing, levels: shortDeg.levels, zone: shortDeg.zone, bias: bias, degrees: degrees };
```

교체 후:

```js
    if (off > 0) {   // 창 좌표 → 전체 배열 좌표(작도 정합)
      degrees.forEach(function (d) {
        if (d && d.swing) { d.swing.fromIdx += off; d.swing.toIdx += off; }
      });
    }
    return { dir: shortDeg.dir, swing: shortDeg.swing, levels: shortDeg.levels, zone: shortDeg.zone, bias: bias, degrees: degrees };
```

⚠ `shortDeg.swing` 은 `degrees[0].swing` 과 **같은 객체**다 — 위 루프가 함께 옮긴다. 반환의 `swing: shortDeg.swing` 도 같은 참조라 별도 처리하지 않는다(두 번 더하면 좌표가 깨진다).

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd map && node --test forge-core.test.js 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `fail 0`

- [ ] **Step 5: 백테스트 영역 무변화 실증(§② 구조적 증명)**

먼저 현재 코드를 stash 해 구(舊) 스냅샷을 만들고, 되돌린 뒤 대조한다:

```bash
cd /home/jschoi0223/projects/vdiportal && git stash -q && cd map
export SCRATCH=$(mktemp -d)
node -e '
const FC=require("./forge-core.js"),fs=require("fs"),path=require("path");
const dir="backtest/fixtures", out={};
for (const f of fs.readdirSync(dir).filter(x=>x.endsWith(".json")).sort()){
  const fx=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
  const price=(fx.candle||[]).map(c=>+c.c).filter(isFinite);
  if(price.length<300) continue;
  for (const t of [280, Math.floor(price.length*0.5), Math.floor(price.length*0.75), price.length-61]){
    if(t<280||t>=price.length) continue;
    const seg=price.slice(Math.max(0,t+1-600),t+1);
    out[f+"|"+t]=JSON.stringify(FC.analyzeFib(seg,{len:120,swing:0.05}));
  }
}
fs.writeFileSync(process.env.SCRATCH+"/fib-before.json", JSON.stringify(out));
console.log("구 스냅샷:", Object.keys(out).length, "케이스");
'
cd /home/jschoi0223/projects/vdiportal && git stash pop -q && cd map
node -e '
const FC=require("./forge-core.js"),fs=require("fs"),path=require("path");
const before=JSON.parse(fs.readFileSync(process.env.SCRATCH+"/fib-before.json","utf8"));
const dir="backtest/fixtures"; let same=0,n=0,diff=[];
for (const f of fs.readdirSync(dir).filter(x=>x.endsWith(".json")).sort()){
  const fx=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
  const price=(fx.candle||[]).map(c=>+c.c).filter(isFinite);
  if(price.length<300) continue;
  for (const t of [280, Math.floor(price.length*0.5), Math.floor(price.length*0.75), price.length-61]){
    if(t<280||t>=price.length) continue;
    const seg=price.slice(Math.max(0,t+1-600),t+1);
    const now=JSON.stringify(FC.analyzeFib(seg,{len:120,swing:0.05}));
    const k=f+"|"+t; n++; if(before[k]===now) same++; else diff.push(k);
  }
}
console.log("백테스트 영역 구·신 대조:", same+"/"+n, "바이트 동일");
if(diff.length) console.log("차이:", diff.slice(0,5));
'
```
Expected: `N/N 바이트 동일` (차이가 하나라도 나오면 멈추고 원인을 찾는다 — 창 밖 참조가 남아 있다는 뜻)

- [ ] **Step 6: 전체 관문 + 커밋**

```bash
cd map && ./tests/run.sh 2>&1 | tail -3
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge-core.test.js
git commit -m "fix(engine): analyzeFib 스윙 탐색창 600봉 — 다중스케일 작도 준비

trend·elliott·structure 와 같은 처방. 반환 인덱스는 전체 좌표로 복원(작도 정합).
≤창이면 no-op — 백테스트 픽스처 바이트 대조로 무변화 실증."
```

---

### Task 2: 선별·합류·문구 순수 함수 3종

**Files:**
- Modify: `map/forge-core.js` (`trendScreenFit` 정의 바로 뒤에 추가)
- Test: `map/forge-core.test.js` (append)

**Interfaces:**
- Consumes: 없음(순수)
- Produces:
  - `ForgeCore.scaleSet(P)` → `number[]` — 그릴 창 목록. 값은 `120`·`600`·`Infinity`(=전량) 중 일부. 스펙 §3 축약 규칙.
  - `ForgeCore.scaleConfluence(values)` → `{ groups: Array<{price:number, n:number, idx:number[]}>, tol:number }` — `values` 는 스케일별 가격 배열(`null` 허용). `tol = (max-min)×0.012`. 2개 이상 모인 그룹만 반환. `idx` 는 그 그룹에 든 스케일의 인덱스.
  - `ForgeCore.scaleVerdictText(signs)` → `string` — `signs` 는 스케일별 부호 배열(`-1|0|1`). 스펙 §4-C 표.

- [ ] **Step 1: 실패하는 테스트 작성**

`map/forge-core.test.js` 맨 아래에 append:

```js

// ── 다중스케일 작도 순수 함수(2026-08-28) — 작도 전용, run() 미호출 ──────────────
test("scaleSet: 이력 길이에 따라 3단·2단·1단으로 축약", () => {
  assert.deepEqual(ForgeCore.scaleSet(5030), [120, 600, Infinity]);
  assert.deepEqual(ForgeCore.scaleSet(901), [120, 600, Infinity]);
  assert.deepEqual(ForgeCore.scaleSet(900), [120, Infinity]);   // 전량이 600 과 너무 가깝다
  assert.deepEqual(ForgeCore.scaleSet(429), [120, Infinity]);
  assert.deepEqual(ForgeCore.scaleSet(241), [120, Infinity]);
  assert.deepEqual(ForgeCore.scaleSet(240), [Infinity]);        // 좁게가 별개 스케일이 못 된다
  assert.deepEqual(ForgeCore.scaleSet(50), [Infinity]);
});

test("scaleConfluence: 2개 이상 모이면 합류, 값 1개·먼 값은 아님", () => {
  // 범위 100~110 → tol = 10 × 0.012 = 0.12
  const r = ForgeCore.scaleConfluence([100.00, 100.05, 110.00]);
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.groups[0].idx, [0, 1]);
  assert.equal(r.groups[0].n, 2);
  assert.ok(Math.abs(r.groups[0].price - 100.025) < 1e-9);

  assert.equal(ForgeCore.scaleConfluence([100, 110, 120]).groups.length, 0);   // 전부 tol 밖
  assert.equal(ForgeCore.scaleConfluence([100]).groups.length, 0);             // 값 1개
  assert.equal(ForgeCore.scaleConfluence([100, null, 100.01]).groups.length, 1); // null 은 건너뛴다
});

test("scaleConfluence: 셋 다 모이면 한 그룹에 3개", () => {
  const r = ForgeCore.scaleConfluence([200.0, 200.1, 200.2]);
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].n, 3);
});

test("scaleVerdictText: 표에 있는 조합만 문구, 없으면 나열", () => {
  assert.equal(ForgeCore.scaleVerdictText([1, 1, 1]), "세 시간틀 모두 상승");
  assert.equal(ForgeCore.scaleVerdictText([-1, -1, -1]), "세 시간틀 모두 하락");
  assert.equal(ForgeCore.scaleVerdictText([-1, 1, 1]), "장기 상승 속 단기 하락 — 되돌림 구간");
  assert.equal(ForgeCore.scaleVerdictText([1, -1, -1]), "장기 하락 속 단기 상승 — 되돌림 구간");
  assert.equal(ForgeCore.scaleVerdictText([1, 1, -1]), "장기 추세와 어긋나는 최근 상승");
  assert.equal(ForgeCore.scaleVerdictText([-1, -1, 1]), "장기 추세와 어긋나는 최근 하락");
  // 판정만 다른 조합 등 — 해석을 지어내지 않고 나열로 끝낸다
  assert.equal(ForgeCore.scaleVerdictText([1, -1, 1]), "좁게 ▲ · 판정 ▼ · 넓게 ▲");
  assert.equal(ForgeCore.scaleVerdictText([0, 1, 1]), "좁게 — · 판정 ▲ · 넓게 ▲");
  // 2단(스케일 2개)이면 라벨도 둘
  assert.equal(ForgeCore.scaleVerdictText([1, -1]), "좁게 ▲ · 넓게 ▼");
  assert.equal(ForgeCore.scaleVerdictText([1, 1]), "두 시간틀 모두 상승");
  assert.equal(ForgeCore.scaleVerdictText([1]), "");   // 1단이면 비교할 게 없다
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd map && node --test forge-core.test.js 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `fail 4` — `scaleSet is not a function`

- [ ] **Step 3: 구현**

`map/forge-core.js` 의 `trendScreenFit` 함수 정의가 끝나는 `}` 바로 뒤에 추가한다:

```js

  // ── 다중스케일 작도 전용(2026-08-28) — run() 은 이 셋을 부르지 않는다 ─────────────
  // 설계: docs/superpowers/specs/2026-08-28-multiscale-drawing-demo-design.md
  // 좁게(최근)만 그리고 끝내면 "그게 다"처럼 보인다. 실측상 같은 지표가 시간틀에 따라
  // 반대를 가리킨다(TSLA 120봉 −0.109%/봉 vs 600봉 +0.132%) — 그 충돌이 곧 정보다.

  const SCALE_NARROW = 120, SCALE_MID = 600;   // 중간=엔진 판정 창(백테스트 LOOKBACK 600)

  // 이력 길이에 맞는 스케일 목록. 같은 선을 두 번 그리지 않도록 접는다.
  //   P > 900        → 3단  (전량이 중간창의 1.5배는 돼야 다른 선이 나온다)
  //   240 < P ≤ 900  → 2단  (600 과 전량이 사실상 같다)
  //   P ≤ 240        → 1단  (좁게가 별개 스케일이 못 된다 — 240 = 120×2)
  function scaleSet(P) {
    const n = (typeof P === "number" && isFinite(P)) ? P : 0;
    if (n > SCALE_MID * 1.5) return [SCALE_NARROW, SCALE_MID, Infinity];
    if (n > SCALE_NARROW * 2) return [SCALE_NARROW, Infinity];
    return [Infinity];
  }

  // 스케일 간 합류 — forge-draw 의 교차-degree 규약과 같은 tol(가격 범위 × 1.2%).
  // 2개 이상 스케일이 같은 가격대를 가리키면 그 자리가 최강이다.
  function scaleConfluence(values) {
    const pts = [];
    (values || []).forEach(function (v, i) { if (typeof v === "number" && isFinite(v)) pts.push({ v: v, i: i }); });
    const out = { groups: [], tol: 0 };
    if (pts.length < 2) return out;
    let mn = Infinity, mx = -Infinity;
    pts.forEach(function (q) { if (q.v < mn) mn = q.v; if (q.v > mx) mx = q.v; });
    const tol = ((mx > mn) ? (mx - mn) : Math.abs(mx) || 1) * 0.012;
    out.tol = tol;
    const used = {};
    for (let a = 0; a < pts.length; a++) {
      if (used[a]) continue;
      const idx = [pts[a].i]; let sum = pts[a].v, cnt = 1;
      for (let b = a + 1; b < pts.length; b++) {
        if (used[b]) continue;
        if (Math.abs(pts[b].v - pts[a].v) <= tol) { used[b] = 1; idx.push(pts[b].i); sum += pts[b].v; cnt++; }
      }
      if (cnt >= 2) { used[a] = 1; out.groups.push({ price: sum / cnt, n: cnt, idx: idx }); }
    }
    return out;
  }

  // 방향 충돌 요약 — 부호 조합에서 기계적으로. 표에 없는 조합은 나열로 끝낸다(해석을 지어내지 않는다).
  const _SCALE_LBL3 = ["좁게", "판정", "넓게"], _SCALE_LBL2 = ["좁게", "넓게"];
  function scaleVerdictText(signs) {
    const s = (signs || []).map(function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; });
    if (s.length < 2) return "";
    const lbl = s.length >= 3 ? _SCALE_LBL3 : _SCALE_LBL2;
    const arrow = function (v) { return v > 0 ? "▲" : v < 0 ? "▼" : "—"; };
    const listed = s.map(function (v, i) { return lbl[i] + " " + arrow(v); }).join(" · ");
    if (s.indexOf(0) >= 0) return listed;                     // 중립이 끼면 해석 없음
    const allSame = s.every(function (v) { return v === s[0]; });
    if (allSame) return (s.length >= 3 ? "세" : "두") + " 시간틀 모두 " + (s[0] > 0 ? "상승" : "하락");
    const wide = s[s.length - 1], narrow = s[0], rest = s.slice(1);
    if (rest.every(function (v) { return v === wide; }) && narrow !== wide) {
      return "장기 " + (wide > 0 ? "상승" : "하락") + " 속 단기 " + (narrow > 0 ? "상승" : "하락") + " — 되돌림 구간";
    }
    const head = s.slice(0, s.length - 1);
    if (head.every(function (v) { return v === narrow; }) && wide !== narrow) {
      return "장기 추세와 어긋나는 최근 " + (narrow > 0 ? "상승" : "하락");
    }
    return listed;
  }
```

export 목록에 셋을 더한다 — `trendScreenFit,` 뒤에 삽입:

```js
  return { version, indicatorCount, indicatorRegistry, indicatorTiers, ... analyzeTrend, trendProfileForTF, trendScreenFit, scaleSet, scaleConfluence, scaleVerdictText, analyzeMA, ...
```

(실제 편집은 `trendScreenFit,` 문자열 하나를 `trendScreenFit, scaleSet, scaleConfluence, scaleVerdictText,` 로 치환하면 된다.)

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd map && node --test forge-core.test.js 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: `fail 0`

- [ ] **Step 5: run() 이 이 셋을 부르지 않는지 확인**

```bash
cd map && grep -n "scaleSet\|scaleConfluence\|scaleVerdictText" forge-core.js
```
Expected: 정의 3곳 + export 1곳뿐. `run` 함수 본문 안에 나오면 안 된다.

- [ ] **Step 6: 관문 + 커밋**

```bash
cd map && ./tests/run.sh 2>&1 | tail -3
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(engine): 다중스케일 작도 순수 함수 — scaleSet·scaleConfluence·scaleVerdictText

작도 전용(run 미호출). 축약 규칙·합류 tol(가격범위 1.2%)·부호 조합 문구.
표에 없는 조합은 해석 없이 나열로 끝낸다."
```

---

### Task 3: 작도 — 스케일별 렌더 · 합류 강조 · 라벨

**Files:**
- Modify: `map/forge-draw.js` (`_labelMode` 선언 부근 1316행 · `_drawTrendLayers` 2038행 부근 · `_drawFibLayers` 2207행 부근 · 호출부 3115·3126행)

**Interfaces:**
- Consumes: `ForgeCore.scaleSet`·`scaleConfluence`·`scaleVerdictText`(Task 2), `analyzeFib({win})`(Task 1), `analyzeTrend({win})`(엔진 1.11.1)
- Produces:
  - 모듈 전역 `_scaleStage` — `null`(종전 동작) 또는 `{ i: number, wins: number[], all: boolean }`. `i` = 현재 단계 인덱스, `wins` = `scaleSet` 결과, `all` = 겹침 표시.
  - `window.setScaleStage(stageOrNull)` — forge-embed 가 부르는 세터(설정 후 `drawEvidence()` 는 호출자가 한다).

- [ ] **Step 1: 스케일 상태 + 세터 추가**

`map/forge-draw.js` 의 `let _labelMode = "key";` 줄 **바로 아래**에 추가:

```js
  // 다중스케일 작도 시연(2026-08-28) — null 이면 종전 동작(단일 스케일).
  // { i:단계, wins:[120,600,Infinity], all:겹침 } 을 forge-embed 가 단계마다 설정한다.
  let _scaleStage = null;
  function setScaleStage(s) { _scaleStage = (s && s.wins && s.wins.length) ? s : null; }
```

같은 파일에서 다른 전역 세터가 `window.` 로 노출되는 방식을 따라 노출한다(파일 끝 근처에서 `window.toggleLabelMode` 등이 붙는 자리를 찾아 같은 형식으로):

```bash
cd map && grep -n "window.toggleLabelMode\|window.drawEvidence" forge-draw.js | head -3
```
그 줄들 옆에 `window.setScaleStage = setScaleStage;` 를 추가한다.

- [ ] **Step 2: 추세선 호출부를 스케일 루프로**

`map/forge-draw.js` 3115행 부근 — 기존:

```js
          const ta = _an("Trend", price, { shortLen: ..., pivotSwing: ..., channelK: ..., weights: _prof.weights });
          const futBars = (g.path && g.path.length) || 24;
          if (_drawThis) _drawTrendLayers(cc, ta, { ... });
```

교체 후(기존 `_an` 인자는 그대로 두고 `win` 만 더한다):

```js
          const _tOpt = { shortLen: Math.max(8, Math.round(((n.params && n.params.len) || 40) * (_prof.shortScale || 1))), pivotSwing: (n.params && n.params.pivotSwing != null ? n.params.pivotSwing / 100 : 0.08), channelK: (n.params && n.params.channelK) || 2, weights: _prof.weights };
          const futBars = (g.path && g.path.length) || 24;
          const _tBase = { fiToX, pToY: v => toY(v), nowFi: P - 1, xNow: g.seamX, xRight: g.padX + g.plotW, futBars, fiMin: wS,
            focused: (_focus === "trend"), top: g.padTop, bot: g.ch - g.padBot, loV: g.loV, hiV: g.hiV, lastP: price[P - 1] };
          // 다중스케일 단계: 현재 단계(또는 겹침이면 전부)의 창으로 각각 계산·작도
          const _tWins = _scaleStage ? (_scaleStage.all ? _scaleStage.wins : [_scaleStage.wins[_scaleStage.i]]) : [null];
          let ta = null;
          _tWins.forEach(function (w, k) {
            const o = w == null ? _tOpt : Object.assign({}, _tOpt, { win: w === Infinity ? 1e9 : w });
            const r = _an("Trend", price, o);
            if (k === 0) ta = r;
            if (!_drawThis) return;
            const gi = _scaleStage ? (_scaleStage.all ? k : _scaleStage.i) : -1;
            _drawTrendLayers(cc, r, Object.assign({}, _tBase, { scaleIdx: gi, scaleWins: _scaleStage ? _scaleStage.wins : null,
              scaleAll: !!(_scaleStage && _scaleStage.all), scaleConf: _tConf }));
          });
          legend.push({ col, t: EV_LABEL.trend + (_prof.label ? " \xb7 " + _prof.label : ""), _key: n.blockType });
```

겹침 단계에서 합류를 계산하려면 세 스케일의 **현재 시점 선 값**이 필요하다. 위 `forEach` 앞에 계산해 `_tConf` 로 넘긴다:

```js
          let _tConf = null;
          if (_scaleStage && _scaleStage.all) {
            const vals = _scaleStage.wins.map(function (w) {
              const o = Object.assign({}, _tOpt, { win: w === Infinity ? 1e9 : w });
              const r = _an("Trend", price, o), L = r.windows && r.windows.long;
              return L ? Math.exp(L.bLog + L.slopeLog * ((P - 1) - L.startIdx)) : null;
            });
            _tConf = ForgeCore.scaleConfluence(vals);
          }
```

(선언 순서상 `_tConf` 는 `_tWins.forEach` 보다 **위**에 있어야 한다.)

- [ ] **Step 3: `_drawTrendLayers` 에 스케일 표기·강조 추가**

`_drawTrendLayers` 의 구조분해에 새 필드를 더한다:

```js
    const { fiToX, pToY, nowFi, xNow, xRight, futBars, fiMin = 0, top, bot, loV, hiV, lastP,
      scaleIdx = -1, scaleWins = null, scaleAll = false, scaleConf = null } = M;
```

`winLine` 안, 라벨을 만드는 줄(`const lab = ...`)을 스케일 표기가 붙도록 교체한다. 기존:

```js
      const lab = (key === "long" ? "장기" : key === "mid" ? "중기" : "단기") + " " + (_full ? w.m + "봉 " + ...
```

교체 후:

```js
      // 다중스케일 단계에서는 '어느 스케일인가'가 먼저다 — 판정 근거는 중간(600봉)에만 붙는다.
      const _scName = scaleIdx < 0 || !scaleWins ? "" :
        (scaleWins.length >= 3 ? ["좁게", "판정", "넓게"][scaleIdx] : ["좁게", "넓게"][scaleIdx]) + " ";
      const _scTag = (scaleIdx < 0 || !scaleWins) ? "" :
        ((scaleWins[scaleIdx] === 600) ? " · 판정 근거" : " · 맥락 · 판정 미반영");
      const lab = _scName + (key === "long" ? "장기" : key === "mid" ? "중기" : "단기") + " " +
        (_full ? w.m + "봉 " + (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%/봉 R²" + rq.toFixed(2) + " " + dir
               : (weak ? "·약" : pct > 0.05 ? "▲" : pct < -0.05 ? "▼" : "—")) + _scTag;
```

겹침 단계에서 합류 지점을 강조한다 — `winLine` 의 마지막(라벨 그린 뒤)에 추가:

```js
      // 합류 = 2개 이상 스케일의 현재 선 값이 tol 안에 모인 자리. 최강 강조(굵기·알파 아님 — 링 마커).
      if (scaleAll && scaleConf && scaleConf.groups.length && key === "long") {
        scaleConf.groups.forEach(function (grp) {
          if (grp.idx.indexOf(scaleIdx) < 0) return;
          const y = pToY(grp.price);
          if (!isFinite(y)) return;
          c.save();
          c.globalAlpha = 0.9; c.strokeStyle = dcol; c.lineWidth = CW.base;
          c.beginPath(); c.arc(xb, y, 6.5, 0, Math.PI * 2); c.stroke();
          c.globalAlpha = 0.25; c.beginPath(); c.arc(xb, y, 10.5, 0, Math.PI * 2); c.stroke();
          c.restore();
          _evLabel(c, "합류 ×" + grp.n, xb + 12, y - 2, dcol, "left", true);
        });
      }
```

- [ ] **Step 4: 피보나치도 같은 방식으로**

3126행 부근 — 기존:

```js
          const fib = _an("Fib", price, { len: (n.params && n.params.len) || 120, swing: ((n.params && n.params.swing) != null ? n.params.swing : 5) / 100 });
          if (_drawThis) _drawFibLayers(cc, fib, { ... });
```

교체 후:

```js
          const _fOpt = { len: (n.params && n.params.len) || 120, swing: ((n.params && n.params.swing) != null ? n.params.swing : 5) / 100 };
          const _fBase = { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, top: g.padTop, bot: g.ch - g.padBot };
          const _fWins = _scaleStage ? (_scaleStage.all ? _scaleStage.wins : [_scaleStage.wins[_scaleStage.i]]) : [null];
          _fWins.forEach(function (w, k) {
            const o = w == null ? _fOpt : Object.assign({}, _fOpt, { win: w === Infinity ? 1e9 : w });
            const fib = _an("Fib", price, o);
            if (!_drawThis) return;
            const gi = _scaleStage ? (_scaleStage.all ? k : _scaleStage.i) : -1;
            _drawFibLayers(cc, fib, Object.assign({}, _fBase, { scaleIdx: gi, scaleWins: _scaleStage ? _scaleStage.wins : null, scaleAll: !!(_scaleStage && _scaleStage.all) }));
          });
          legend.push({ col, t: EV_LABEL.fib + "(전문)", _key: n.blockType });
```

`_drawFibLayers` 의 구조분해에 필드를 더하고, 겹침 단계에서 앞 스케일을 흐리게 한다:

```js
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight, top, bot,
      scaleIdx = -1, scaleWins = null, scaleAll = false } = M;
    // 겹침 단계: 넓은 스케일이 최신(마지막)이므로 앞 스케일은 흐리게 — 기존 위계 규약(강조/디밍)
    const _scAlpha = (scaleAll && scaleWins && scaleWins.length > 1)
      ? (scaleIdx === scaleWins.length - 1 ? 1 : 0.42) : 1;
```

그 파일의 렌더 시작 지점(`c.save()` 직후)에 `c.globalAlpha *= _scAlpha;` 를 넣는다.

같은 디밍을 `_drawTrendLayers` 에도 적용한다 — `winLine` 시작 부분에 다음을 추가하고, `c.globalAlpha = ...` 를 쓰는 자리마다 곱한다:

```js
      const _scAlpha = (scaleAll && scaleWins && scaleWins.length > 1)
        ? (scaleIdx === scaleWins.length - 1 ? 1 : 0.42) : 1;
```

구체적으로 기존 두 줄을 곱셈으로 바꾼다:

```js
      c.globalAlpha = (weak ? 0.28 : emph ? 1 : 0.5) * _scAlpha;
```

- [ ] **Step 5: 문법 확인 + 관문**

```bash
cd map && node --check forge-draw.js && ./tests/run.sh 2>&1 | tail -3
```
Expected: 문법 OK · 전체 통과(작도는 node 테스트 대상이 아니므로 건수 불변)

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-draw.js
git commit -m "feat(forge): 작도 스케일 단계 — 추세선·피보나치 스케일별 렌더 + 합류 강조

_scaleStage(null=종전 동작) · 스케일 라벨('좁게/판정/넓게' + 판정 근거·맥락 표기) ·
겹침 단계 디밍 위계 · 합류 링 마커. 값은 엔진 analyze*({win}) 그대로."
```

---

### Task 4: 시연 — 3단 시퀀스 · 카메라 · 타이밍

**Files:**
- Modify: `map/forge-embed.js` (`_regionForNode` 101행 · `_frameFromRegion` 125행 · 재생 루프 196~240행)

**Interfaces:**
- Consumes: `window.setScaleStage`(Task 3), `ForgeCore.scaleSet`(Task 2)
- Produces: 없음(연출)

- [ ] **Step 1: 스케일별 카메라 구간**

`_regionForNode(n, N)` 시그니처에 창을 더한다 — `function _regionForNode(n, N, win)` 로 바꾸고, `trend`·`fib` 분기에서 그 창을 쓴다:

```js
      if (t === "fib") { var r = C.analyzeFib(price, { len: _pp(n,"len",120), win: (win === Infinity ? 1e9 : win) || undefined }); ... }
      else if (t === "trend") { var r = C.analyzeTrend(price, { win: (win === Infinity ? 1e9 : win) || undefined }); ... }
```

그리고 **좁게 단계에서는 카메라도 좁아야 한다** — 구간 계산 뒤 창 상한을 적용한다. `return { bl: ..., bh: ..., pl: ..., ph: ... }` 직전에:

```js
    if (typeof win === "number" && isFinite(win)) {   // 스케일 단계: 그 창 밖은 카메라에 담지 않는다
      bl = Math.max(bl, Math.max(0, N - win));
    }
```

- [ ] **Step 2: 340봉 상한을 로그축일 때만 적용**

`_frameFromRegion(reg, N)` 의 상한 줄을 교체한다. 기존:

```js
    var count = Math.max(minBars, Math.min(N, 340, Math.round(featBars * 1.2)));   // 상한 340: ...
```

교체 후:

```js
    // 상한 340 의 이유는 "급등주는 최근 캔들이 위로 눌려 안 읽힌다" — 그건 선형축의 문제다.
    // 로그축이면 20년 차트에서도 최근 구간이 읽히므로 상한을 푼다(2026-08-28).
    var cap = (typeof _logChart !== "undefined" && _logChart) ? N : 340;
    var count = Math.max(minBars, Math.min(N, cap, Math.round(featBars * 1.2)));
```

- [ ] **Step 3: 창 단위 로그 판정**

`_frameFromRegion` 이 정한 창으로 로그축을 다시 판정하는 헬퍼를 `_camTween` 위에 추가한다:

```js
  // 로그축 판정을 '전체 시계열'이 아니라 '지금 보여줄 창'으로 — 규칙(max/min>4)은 기존 그대로.
  function _autoLogForWindow(start, count) {
    var cs = (currentData().price || []).slice(start, start + count);
    if (cs.length < 2) return;
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < cs.length; i++) { var v = cs[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (!(mn > 0)) return;
    var wide = mx / mn > 4;
    if (wide !== _logChart) { _logChart = wide; if (typeof updateAxisBtns === "function") updateAxisBtns(); }
  }
```

⚠ 순서 주의: `_frameFromRegion` 이 상한을 정할 때 `_logChart` 를 읽는데, 그 값은 **직전 단계의 축**이다. 넓게 단계에서 상한을 풀려면 **프레임 계산 전에** 그 단계의 축을 정해야 한다. 그래서 넓게 단계는 창이 전량이라는 걸 미리 알 수 있으므로, 재생 루프에서 프레임 계산 **직전**에 `_autoLogForWindow(Math.max(0, N - winBars), winBars)` 를 호출한다(`winBars` = 그 단계의 창, `Infinity` 면 `N`).

- [ ] **Step 4: 재생 루프를 단계 시퀀스로**

`revealNext` 안에서 노드 하나를 처리하던 것을 **(노드, 스케일단계)** 쌍으로 바꾼다. 루프 진입부(`var n = _embNodes[_embI];` 부근)를 교체:

```js
      var n = _embNodes[_embI];
      var N2 = (currentData().price || []).length;
      // 다중스케일 대상(추세선·피보나치)만 단계를 갖는다. 나머지는 종전대로 1단계.
      var MULTI = { trend: 1, fib: 1 };
      var wins = MULTI[n.blockType] ? window.ForgeCore.scaleSet(N2) : null;
      var stages = wins ? wins.length : 1;
      if (_embStage == null) _embStage = 0;
      var winBars = wins ? (wins[_embStage] === Infinity ? N2 : wins[_embStage]) : null;
      if (wins) {
        _autoLogForWindow(Math.max(0, N2 - winBars), winBars);   // 축 먼저(상한 해제가 여기 걸린다)
        window.setScaleStage({ i: _embStage, wins: wins, all: (_embStage === stages - 1) });
      } else {
        window.setScaleStage(null);
      }
      var reg = _regionForNode(n, N2, wins ? wins[_embStage] : undefined);
```

모듈 상단(`_embI` 선언 옆)에 `var _embStage = null;` 을 추가하고, 재생 시작·정지에서 `_embStage = null; try { window.setScaleStage(null); } catch (e) {}` 로 초기화한다(`_embStop`·`_embFinish`·재생 시작 지점 3곳).

단계 진행은 `_embI++` 하던 자리를 바꾼다:

```js
          if (wins && _embStage < stages - 1) { _embStage++; }
          else { _embStage = null; _embI++; }
          _embT = setTimeout(revealNext, holdMs);
```

(`_embI++` 가 나오는 자리가 두 곳이면 **둘 다** 같은 형태로 바꾼다 — `grep -n "_embI++" forge-embed.js` 로 확인.)

- [ ] **Step 5: 타이밍 분모를 총 단계수로**

`per` 계산 줄을 교체한다. 기존:

```js
      var per = Math.max(560, Math.min(1300, Math.round(_playTotalMs / Math.max(1, _embNodes.length))));
```

교체 후:

```js
      // 3단 지표는 3단계를 차지한다 — 분모를 총 단계수로 두면 각 단계가 정상 속도를 유지하고
      // 전체 시연만 그만큼 길어진다(단계를 쥐어짜 빨라지는 것보다 낫다).
      var _totalStages = 0;
      for (var _si = 0; _si < _embNodes.length; _si++) {
        var _bt = _embNodes[_si].blockType;
        _totalStages += (_bt === "trend" || _bt === "fib") ? window.ForgeCore.scaleSet(N2).length : 1;
      }
      var per = Math.max(560, Math.min(1300, Math.round(_playTotalMs / Math.max(1, _totalStages))));
```

- [ ] **Step 6: 문법 확인 + 관문 + 커밋**

```bash
cd map && node --check forge-embed.js && ./tests/run.sh 2>&1 | tail -3
cd /home/jschoi0223/projects/vdiportal
git add map/forge-embed.js
git commit -m "feat(forge): 시연 3단 스케일 시퀀스 — 카메라·축·타이밍

노드×스케일단계로 재생. 창 단위 로그 판정(기존 max/min>4 규칙의 적용 범위만 변경),
로그축일 때만 340봉 상한 해제, 예산 분모를 총 단계수로."
```

---

### Task 5: 시각 검증 · 후퇴 조건 판정 · 배포

**Files:**
- Modify: `map/docs/BACKLOG.md`
- (조건부) Modify: `map/forge-core.js` — 넓게 단계 후퇴 시 `scaleSet` 의 `Infinity` → `1200`

**Interfaces:**
- Consumes: Task 1~4 전부

- [ ] **Step 1: 세 케이스 스크린샷**

로컬 서버를 띄우고, 프로덕션 OHLC 를 주입해 시연을 돌린다(로컬 PHP 에는 curl 이 없어 시세 프록시가 안 돈다 — 페이지 안에서 프로덕션으로 직접 fetch 한다. 읽기 전용 GET).

```bash
cd map && php -S 127.0.0.1:8941 -t . > /tmp/php-ms.log 2>&1 &
sleep 1
LD_LIBRARY_PATH=~/.local/pwlibs/usr/lib/x86_64-linux-gnu NODE_PATH=~/.npm/_npx/705bc6b22212b352/node_modules \
node -e '
const fs=require("fs"),os=require("os"),{chromium}=require("playwright-core");
const dir=os.homedir()+"/.cache/ms-playwright";
const exe=fs.readdirSync(dir).filter(d=>d.startsWith("chromium")).map(d=>dir+"/"+d+"/chrome-linux/chrome").filter(fs.existsSync)[0];
(async()=>{
  const b=await chromium.launch({executablePath:exe});
  for (const sym of ["NVDA","TSLA","005930"]) {
    const p=await b.newPage({viewport:{width:1280,height:820}});
    const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
    await p.goto("http://127.0.0.1:8941/forge.html?embed=app");
    await p.waitForTimeout(2500);
    await p.evaluate(async(sym)=>{
      const r=await fetch("https://parksvc.mycafe24.com/map/forge-api.php?ohlc=1&symbol="+encodeURIComponent(sym)+"&tf=1day");
      const j=await r.json(); const t=ensureTickerNode();
      t.params.symbol=sym; t.params.tf="1day"; applyTickerOHLC(t,j); runForge();
    }, sym);
    await p.waitForTimeout(1500);
    const P=await p.evaluate(()=>(currentData().price||[]).length);
    const wins=await p.evaluate(()=>ForgeCore.scaleSet((currentData().price||[]).length).map(x=>x===Infinity?"전량":x));
    // 단계별로 직접 세팅해 스크린샷(재생 타이밍에 의존하지 않는다)
    for (let i=0;i<wins.length;i++){
      await p.evaluate((i)=>{ const W=ForgeCore.scaleSet((currentData().price||[]).length);
        window.setScaleStage({i:i,wins:W,all:(i===W.length-1)}); _focus="trend"; _labelMode="all"; renderChart(); }, i);
      await p.waitForTimeout(1200);
      await p.screenshot({path:"/tmp/ms-"+sym+"-"+i+".png"});
    }
    console.log(sym, "P="+P, "스케일", JSON.stringify(wins), "errs", errs.length);
    await p.close();
  }
  await b.close();
})();'
kill %1 2>/dev/null; wait 2>/dev/null
cd /home/jschoi0223/projects/vdiportal && git checkout -- map/forge_data.json 2>/dev/null
```

Expected: `NVDA P=5030 스케일 ["120","600","전량"]` · `TSLA P=4066 ["120","600","전량"]` · `005930 P=429 ["120","전량"]`, errs 0

- [ ] **Step 2: 후퇴 조건 판정(넓게 = 전량 vs 1,200봉)**

`/tmp/ms-NVDA-2.png`(넓게 단계)를 열어 **최근 120봉의 캔들 몸통이 세로로 구분되는지** 눈으로 본다.

- 읽히면 → 전량 유지, Step 3 으로.
- 안 읽히면 → `forge-core.js` `scaleSet` 의 `Infinity` 를 `1200` 으로 바꾸고(3단의 마지막 원소만), Task 2 테스트의 기대값도 `[120, 600, 1200]` 으로 갱신한 뒤 Step 1 을 다시 돌린다. 스펙 §9 의 미결을 그 결과로 닫는다.

- [ ] **Step 3: TSLA 방향 충돌이 드러나는지 확인**

```bash
cd map && node -e '
const FC=require("./forge-core.js");
(async()=>{
  const j=await (await fetch("https://parksvc.mycafe24.com/map/forge-api.php?ohlc=1&symbol=TSLA&tf=1day")).json();
  const price=j.candles.map(c=>+c.c).filter(isFinite);
  const wins=FC.scaleSet(price.length);
  const signs=wins.map(w=>{ const L=FC.analyzeTrend(price,{win:w===Infinity?1e9:w}).windows.long;
    const pct=(Math.exp(L.slopeLog)-1)*100; return pct>0.05?1:pct<-0.05?-1:0; });
  console.log("TSLA 부호", JSON.stringify(signs), "→", FC.scaleVerdictText(signs));
})();'
```
Expected: 부호가 섞여 있고, 문구가 스펙 §4-C 표대로 나온다(예: `장기 상승 속 단기 하락 — 되돌림 구간`). 셋 다 같은 부호로 나오면 문구도 그에 맞게 나오면 통과다 — **문구가 부호와 어긋나면** 그것이 버그다.

- [ ] **Step 4: 라이브 배포 + 앱 상속 확인**

```bash
cd map && python3 scripts/stamp-cachebust.py 20260828i
cd /home/jschoi0223/projects/vdiportal
git add map/app/index.html map/forge.html map/app/app-forge-frame.js
git commit -m "chore: 캐시버스터 20260828i"
cd map && lftp -u "parksvc,<메모리 scoopforge-deploy 참조>" sftp://parksvc.mycafe24.com <<'EOF'
set net:timeout 15
set sftp:auto-confirm yes
cd www/map
put forge.html
put forge-core.js
put forge-draw.js
put forge-embed.js
cd app
put app/index.html -o index.html
put app/app-forge-frame.js -o app-forge-frame.js
bye
EOF
```

앱에서 시연을 돌려 3단이 도는지 확인(앱 코드 수정 0으로 상속되는지):

```bash
LD_LIBRARY_PATH=~/.local/pwlibs/usr/lib/x86_64-linux-gnu NODE_PATH=~/.npm/_npx/705bc6b22212b352/node_modules \
node -e '
const fs=require("fs"),os=require("os"),{chromium}=require("playwright-core");
const dir=os.homedir()+"/.cache/ms-playwright";
const exe=fs.readdirSync(dir).filter(d=>d.startsWith("chromium")).map(d=>dir+"/"+d+"/chrome-linux/chrome").filter(fs.existsSync)[0];
(async()=>{
  const b=await chromium.launch({executablePath:exe});
  const p=await b.newPage({viewport:{width:1280,height:820}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("https://parksvc.mycafe24.com/map/forge.html?embed=app");
  await p.waitForTimeout(3000);
  await p.evaluate(()=>window.postMessage({src:"moneyscoop-app",type:"load",symbol:"NVDA",tf:"1day",tier:"deep",evidence:true},"*"));
  await p.waitForTimeout(12000);
  await p.evaluate(()=>window.postMessage({src:"moneyscoop-app",type:"play"},"*"));
  await p.waitForTimeout(20000);
  await p.screenshot({path:"/tmp/ms-live.png"});
  console.log(JSON.stringify({errs:errs.slice(0,3), hasFn:await p.evaluate(()=>typeof window.setScaleStage==="function")}));
  await b.close();
})();'
```
Expected: `errs []`, `hasFn true`, 스크린샷에 스케일 라벨이 보인다

- [ ] **Step 5: BACKLOG 기록 + 커밋 + 머지 + 푸시**

`map/docs/BACKLOG.md` 의 "🔥 진행 중 / 대기" 맨 위에 완료 항목을 추가한다 — 실측 수치(스케일별 기울기 표·후퇴 판정 결과·관문 건수)를 함께 적는다.

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/docs/BACKLOG.md
git commit -m "docs(backlog): 다중스케일 작도 시연 완료 — 실측·후퇴 판정 기록"
git checkout main && git merge --no-ff <브랜치> -m "merge: 다중스케일 작도 시연 — 좁게·중간·넓게 3단"
git push origin main
```

---

## Self-Review

**1. 스펙 커버리지**
- §3 스케일 정의·축약 → Task 2 `scaleSet` ✅
- §4-A 스케일 내 유의성 → 기존 게이트 재사용(코드 변경 없음). Task 3 이 `weak` 판정을 그대로 통과시킨다 ✅
- §4-B 합류 → Task 2 `scaleConfluence` + Task 3 링 마커 ✅
- §4-C 방향 요약 → Task 2 `scaleVerdictText` ✅ — ⚠ **화면 표시 지점이 플랜에 없다.** 아래 갭 참조.
- §5 축 전환·340 해제·타이밍·최종 상태 → Task 4 ✅
- §6 정직 표기(판정 근거 배지·창 봉수) → Task 3 Step 3 라벨 ✅
- §7 파일 구조 → 일치 ✅
- §8 검증 → Task 1 Step 5(no-op 대조) · Task 2 테스트 · Task 5 스크린샷 ✅
- §9 미결(전량 vs 1200) → Task 5 Step 2 가 닫는다 ✅

**갭 1건 발견 → Task 3 에 Step 추가 필요**: `scaleVerdictText` 를 **화면 어디에 그리는지**가 빠졌다. 아래 Step 을 Task 3 Step 4 와 Step 5 사이에 넣는다.

- [ ] **Task 3 Step 4-b: 방향 요약 한 줄(겹침 단계에만)**

`_drawTrendLayers` 의 채널 블록이 끝나는 자리(`if (ta.channel) { ... }` 다음)에 추가한다:

```js
    // 겹침 단계에서만 — 세 스케일의 부호를 그대로 적는다(해석은 표에 있는 조합만).
    if (scaleAll && scaleWins && scaleWins.length > 1 && _skReady() && M.scaleSigns) {
      const txt = ForgeCore.scaleVerdictText(M.scaleSigns);
      if (txt) _evLabel(c, txt, (M.top != null ? 0 : 0) + 8, (M.top != null ? M.top + 14 : 14), "var(--ink)", "left", true);
    }
```

그리고 Task 3 Step 2 의 `_tConf` 계산 블록에서 부호도 함께 만들어 넘긴다:

```js
          let _tConf = null, _tSigns = null;
          if (_scaleStage && _scaleStage.all) {
            const vals = [], sgs = [];
            _scaleStage.wins.forEach(function (w) {
              const o = Object.assign({}, _tOpt, { win: w === Infinity ? 1e9 : w });
              const r = _an("Trend", price, o), L = r.windows && r.windows.long;
              vals.push(L ? Math.exp(L.bLog + L.slopeLog * ((P - 1) - L.startIdx)) : null);
              const pctS = L ? (Math.exp(L.slopeLog) - 1) * 100 : 0;
              sgs.push(pctS > 0.05 ? 1 : pctS < -0.05 ? -1 : 0);
            });
            _tConf = ForgeCore.scaleConfluence(vals); _tSigns = sgs;
          }
```

`_drawTrendLayers` 호출의 `Object.assign` 에 `scaleSigns: _tSigns` 를 더한다.

**2. 플레이스홀더 스캔**: 없음. `<브랜치>` 와 lftp 비밀번호는 실행 시점 값이라 의도적으로 남겼고 찾는 방법을 적었다.

**3. 타입 일관성**
- `_scaleStage = {i, wins, all}` — Task 3 정의, Task 4 가 같은 형태로 설정 ✅
- `scaleSet(P) → number[]`(`Infinity` 포함) — Task 2 정의, Task 3·4·5 소비. `Infinity` → `1e9` 변환은 소비처 3곳(`_an` opts · `_regionForNode` · Task 5 스크립트) 모두 동일 규칙 ✅
- `scaleConfluence(values) → {groups:[{price,n,idx}], tol}` — Task 2 정의, Task 3 이 `grp.idx`·`grp.n`·`grp.price` 사용 ✅
- `scaleVerdictText(signs) → string` — Task 2 정의, Task 3 Step 4-b·Task 5 Step 3 소비 ✅
- 작도 M 필드 이름 `scaleIdx`·`scaleWins`·`scaleAll`·`scaleConf`·`scaleSigns` — Task 3 안에서 일관 ✅

**알려진 위험 2건**
- **`_logChart` 순서**(Task 4 Step 3): 축을 프레임 계산보다 먼저 정해야 340 해제가 걸린다. 순서가 틀리면 넓게 단계가 340봉에서 멈춘다 — Task 5 Step 1 의 스케일 출력과 스크린샷으로 바로 드러난다.
- **`_an` 캐시 폭증**: 스케일마다 다른 opts 라 프레임당 최대 3배 항목이 생긴다. `_anMemo` 는 price 참조가 바뀌면 통째로 비워지므로 누수는 아니다. 다만 겹침 단계에서 trend 를 6회(합류 계산 3 + 렌더 3) 부르는데 캐시가 받아준다 — 캐시가 안 먹으면(opts 순서 차이로 키가 달라지면) 체감 느려진다. Task 5 Step 1 에서 단계 전환이 버벅이면 이걸 먼저 의심할 것.
