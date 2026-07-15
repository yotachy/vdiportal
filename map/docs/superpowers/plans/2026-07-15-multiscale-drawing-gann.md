# 다중스케일 작도 + 중요도 위계 (Gann 적용) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **재개 가능**: 각 태스크 완료 시 커밋 + SDD 원장(`.superpowers/sdd/progress.md`) 기록. 세션이 끊겨도 원장 + `git log`로 다음 미완료 태스크부터 이어서 진행.

**Goal:** Gann 작도를 단일 앵커에서 **데이터기반 다중스케일 앵커**(고정 창 없음)로 바꾸고, 각 부챗살을 중요도(significance)로 **강조/디밍**하며, 앵커가 화면 밖이면 좌단부터 그린다. 엔진(bias/예측)은 건드리지 않는다.

**Architecture:** 공용 순수 헬퍼 `collectAnchors`(민감도 사다리로 스케일 전반 스윙 수확 + 중요도 스코어)를 `forge-core.js`에 추가한다. `analyzeGann`은 **엔진 bias 계산은 그대로** 두고 작도용 `anchors` 배열만 추가 반환한다(fib의 `degrees` 선례). `_drawGannLayers`는 `anchors`를 순회하며 significance→불투명도/굵기/라벨/밀도로 위계 작도하고 가시 윈도우로 클램프한다. `run()`·`_drifts`·`analyzeGann.bias`는 무변경 → 백테스트 베이스라인 불변.

**Tech Stack:** 순수 HTML5·CSS3·바닐라 JS(무빌드). 엔진 UMD(`forge-core.js`), 단위테스트 `node --test forge-core.test.js`(현 233케이스). 여러 classic script 전역 스코프 공유(로드 순서 core→state→ui→draw→app 고정).

## Global Constraints

스펙(`docs/superpowers/specs/2026-07-15-multiscale-drawing-design.md`)의 불가침 제약 — 모든 태스크에 암묵 적용:

- **작도/시각만. 엔진 미변경**: `run()`·`_drifts`·`evalBlocks`·`analyzeGann`의 **bias 계산 라인**·`seedDefaultStrategy`·`map/backtest/`를 **한 줄도 수정 금지**. `analyzeGann`엔 반환 필드(`anchors`)만 추가(bias/dir/unit/oneOne/angles 기존 값 불변).
- **`collectAnchors`는 순수·엔진 미배선**: `run()`에 연결하지 않는다. 단위테스트만.
- **고정 창 금지**: degree를 봉 개수로 못 박지 말 것 — `detectSwings` 민감도 사다리로 데이터가 정하게.
- **중요도 위계**: 넉넉히 그리되 상위만 강조(굵게·라벨·`reason`), 나머지 디밍(옅게·얇게).
- **윈도우 클램프**: 앵커가 가시 좌단(`fiMin`) 밖이면 좌단 진입점부터 그림(`fiToX(idx)=NaN` 무음 미표시 해소).
- **디자인 금지**: 좌측 세로 accent line 절대 금지(캔버스 오버레이 선/마커/라벨만).
- **로드순서·전역 스코프**: `defer`/`async` 금지, 중복 최상위 선언 금지.
- **동반 배포**: `forge-core.js`·`forge-draw.js`(+ 변경 시 forge-scorecard.html)를 한 세트로 cafe24 `www/map/` 배포. `forge-core.test.js` 배포 제외. 서버 데이터 파일 불가침.

## 파일 구조 (변경 대상)

| 파일 | 책임 | 변경 |
|---|---|---|
| `map/forge-core.js` | `collectAnchors`(순수 앵커/스코어) · `analyzeGann` anchors 필드 · export | 수정 |
| `map/forge-core.test.js` | 단위테스트 | 추가만 |
| `map/forge-draw.js` | `_drawGannLayers` 다중앵커·위계·클램프 + dispatch M(fiMin) | 수정 |
| `map/forge-scorecard.html` | 개선 기록 | 수정(Task 4) |

---

## Task 1: 공용 앵커 발굴 `collectAnchors` (순수, TDD)

**Files:**
- Modify: `map/forge-core.js` (`detectSwings`(~L902) 뒤, `analyzeGann` 앞 아무 곳)
- Test: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `detectSwings(arr, sens) → [{idx,price}]`(내부, 호이스팅).
- Produces: `collectAnchors(price, opts) → [{ fromIdx, fromPrice, toIdx, toPrice, dir:"up"|"down", degree:number, significance:number(0..1), reason:string }]` — significance 내림차순 정렬. `P<24`면 `[]`.

- [ ] **Step 1: 실패하는 테스트 작성**

`map/forge-core.test.js`의 gann 테스트 뒤에 추가:

```js
test("collectAnchors: 다중 스케일 앵커 수확 + significance 내림차순", () => {
  const price = [];
  for (let i = 0; i < 60; i++) price.push(100 + i);             // 대형 상승(굵은 스윙)
  for (let i = 0; i < 60; i++) price.push(160 - (i % 6) * 3);   // 잔진동(가는 스윙)
  const A = ForgeCore.collectAnchors(price, {});
  assert.ok(A.length >= 2, `앵커 다수여야: ${A.length}`);
  for (let i = 1; i < A.length; i++) assert.ok(A[i - 1].significance >= A[i].significance, "significance 내림차순");
  const degrees = new Set(A.map(a => a.degree));
  assert.ok(degrees.size >= 2, `여러 degree(대형+소형)여야: ${[...degrees]}`);
  const a0 = A[0];
  assert.ok(a0.fromIdx != null && a0.toIdx != null && (a0.dir === "up" || a0.dir === "down") && typeof a0.significance === "number" && typeof a0.reason === "string", "앵커 필드");
});
test("collectAnchors: 데이터 부족 → 빈 배열", () => {
  assert.deepStrictEqual(ForgeCore.collectAnchors([1, 2, 3], {}), []);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test map/forge-core.test.js`
Expected: FAIL — `ForgeCore.collectAnchors is not a function`.

- [ ] **Step 3: `collectAnchors` 구현**

`map/forge-core.js`의 `detectSwings` 함수 바로 뒤에 삽입:

```js
function collectAnchors(price, opts) {
  opts = opts || {};
  const P = Array.isArray(price) ? price.length : 0;
  if (P < 24) return [];
  const LADDER = opts.ladder || [0.18, 0.12, 0.08, 0.05, 0.035, 0.02];   // 굵게→가늘게(고정 창 아님)
  const range = (Math.max(...price) - Math.min(...price)) || 1;
  const raw = [];
  for (let li = 0; li < LADDER.length; li++) {
    const sw = detectSwings(price, LADDER[li]);
    for (let i = 1; i < sw.length; i++) {
      const a = sw[i - 1], b = sw[i];
      raw.push({ fromIdx: a.idx, fromPrice: a.price, toIdx: b.idx, toPrice: b.price, dir: b.price >= a.price ? "up" : "down", degree: li });
    }
  }
  // dedup: 같은 피벗쌍(±2봉)은 가장 굵은 degree(최소 li)로 1건
  const merged = [];
  for (const r of raw) {
    const hit = merged.find(m => Math.abs(m.fromIdx - r.fromIdx) <= 2 && Math.abs(m.toIdx - r.toIdx) <= 2);
    if (hit) { if (r.degree < hit.degree) hit.degree = r.degree; }
    else merged.push(r);
  }
  const lastIdx = P - 1, last = price[lastIdx];
  for (const m of merged) {
    const mag = Math.abs(m.toPrice - m.fromPrice) / range;                       // 크기
    const degW = 1 - m.degree / LADDER.length;                                   // 굵은 사다리↑
    const recency = lastIdx ? m.toIdx / lastIdx : 0;                             // 최근성
    const slope = (m.toPrice - m.fromPrice) / Math.max(1, m.toIdx - m.fromIdx);
    const proj = m.fromPrice + slope * (lastIdx - m.fromIdx);                    // 1×1 투영 현재값
    const prox = 1 - Math.min(1, Math.abs(proj - last) / range);                // 현재가 근접
    m.significance = Math.max(0, Math.min(1, 0.4 * degW + 0.25 * mag + 0.2 * recency + 0.15 * prox));
    m.reason = (degW > 0.6 ? "대형 스윙" : mag > 0.3 ? "큰 폭" : "스윙") + (prox > 0.7 ? " · 현재가 근접" : "") + (recency > 0.85 ? " · 최근" : "");
  }
  merged.sort((x, y) => y.significance - x.significance);
  return merged;
}
```

> 주: 스펙의 "터치/컨플루언스" 요소는 v1에서 **degree(굵은 민감도 생존=반복 존중)로 근사**하고 별도 계산은 확장 여지로 둔다(YAGNI). 4요소(degree·크기·최근성·근접)만으로 위계는 충분.

- [ ] **Step 4: UMD export에 추가**

`map/forge-core.js` api `return { ... }`(analyzeGann 인근)에 `collectAnchors` 추가:

```js
    collectAnchors, analyzeGann, gannSteps,
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test map/forge-core.test.js`
Expected: PASS — 신규 2개 포함 235 전부 통과, 기존 233 무회귀.

- [ ] **Step 6: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): collectAnchors — 민감도 사다리 다중스케일 앵커 발굴 + 중요도 스코어"
```

---

## Task 2: `analyzeGann`에 작도용 `anchors` 필드 (bias 불변, TDD)

**Files:**
- Modify: `map/forge-core.js` (`analyzeGann` return 문 인근)
- Test: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `collectAnchors`(Task 1), analyzeGann 기존 지역변수 `RATIOS`·`floor`·`price`·`P`.
- Produces: `analyzeGann(...)` 반환에 `anchors: [{ idx, price, dir, significance, reason, angles:[{name,slope}] }]` 추가(상위 K≤6). **기존 필드(anchor/dir/unit/oneOne/last/angles/bias) 및 bias 계산 불변.**

- [ ] **Step 1: 실패하는 테스트 작성**

Task 1 테스트 뒤에 추가:

```js
test("analyzeGann: 작도용 anchors 배열(다중 앵커) 반환 + bias 부호 불변", () => {
  const price = [];
  for (let i = 0; i < 120; i++) price.push(100 + 0.2 * i + 5 * Math.sin(i / 2.5));
  const r = ForgeCore.analyzeGann({ price }, {});
  assert.ok(Array.isArray(r.anchors) && r.anchors.length >= 1, `anchors 배열: ${r.anchors && r.anchors.length}`);
  const an = r.anchors[0];
  assert.ok(an.idx != null && an.price != null && Array.isArray(an.angles) && an.angles.length === 7 && typeof an.significance === "number", "anchor 필드/각도7");
  assert.ok(r.dir === "up" ? r.bias > 0 : r.bias < 0, "bias 부호 보존");   // 상승 데이터
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test map/forge-core.test.js`
Expected: FAIL — `r.anchors` undefined.

- [ ] **Step 3: `anchors` 필드 추가**

`map/forge-core.js` `analyzeGann`의 `return { anchor: ..., bias };` 문 **바로 앞**에 삽입하고, return 객체에 `anchors`를 추가:

```js
    const _K = opts.maxAnchors || 6;
    const anchors = collectAnchors(price, {}).slice(0, _K).map(m => {
      const asBars = Math.max(1, m.toIdx - m.fromIdx);
      let aUnit = Math.abs(m.toPrice - m.fromPrice) / asBars;
      if (!(aUnit > floor)) aUnit = floor;
      const asign = m.dir === "up" ? 1 : -1;
      return { idx: m.fromIdx, price: m.fromPrice, dir: m.dir, significance: m.significance, reason: m.reason, angles: RATIOS.map(([name, mm]) => ({ name, slope: asign * mm * aUnit })) };
    });
```

그리고 기존 return을 `return { anchor: { idx: anchorIdx, price: anchorPrice }, dir: sw.dir, unit, angles, oneOne, last, bias, anchors };`로(끝에 `anchors` 추가).

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test map/forge-core.test.js`
Expected: PASS — 신규 포함 236, 기존 gann bias/각도/run 테스트 무회귀(bias 계산 미변경).

- [ ] **Step 5: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): analyzeGann 작도용 anchors 필드(다중스케일·bias 불변)"
```

---

## Task 3: `_drawGannLayers` 다중앵커 + 중요도 위계 + 윈도우 클램프

**Files:**
- Modify: `map/forge-draw.js` (`_drawGannLayers` 함수 전체 교체; gann dispatch 분기 M에 `fiMin` 추가)

**Interfaces:**
- Consumes: `analyzeGann().anchors`(Task 2), `fiToX`·`toY`·`FC_GOLD`·`CW`·`CDASH`, dispatch 컨텍스트 `g`(pathLen/padX/plotW/padTop/ch/padBot)·`wS`·`P`.
- Produces: gann 노드 표시 시 다중 앵커 부챗살을 significance 위계로 작도.

- [ ] **Step 1: `_drawGannLayers` 전체 교체**

`map/forge-draw.js`의 기존 `function _drawGannLayers(c, gn, M) { ... }` 전체를 아래로 교체:

```js
  function _drawGannLayers(c, gn, M) {
    c.save();
    const { toY, fiToX, nowFi, futN, xRight, fiMin = 0, top, bot, reveal = Infinity } = M;
    if (top != null && bot != null) { c.beginPath(); c.rect(0, top, xRight + 44, bot - top); c.clip(); }
    // anchors(다중) 우선, 없으면 단일 anchor 폴백(하위호환)
    const list = (gn && gn.anchors && gn.anchors.length) ? gn.anchors
      : (gn && gn.anchor && gn.angles ? [{ idx: gn.anchor.idx, price: gn.anchor.price, angles: gn.angles, significance: 1, reason: "" }] : []);
    if (!list.length) { c.restore(); return; }
    const rightFi = (nowFi != null ? nowFi : 0) + (futN || 0);
    // significance 낮은 것부터 그려 강조가 위에 오게
    const ordered = list.map((an, i) => ({ an, i })).sort((a, b) => (a.an.significance || 0) - (b.an.significance || 0));
    for (const { an } of ordered) {
      const sig = an.significance != null ? an.significance : 0.5;
      const emph = sig >= 0.6;                                   // 고득점 강조
      const alpha = emph ? 1 : Math.max(0.12, 0.15 + sig * 0.4);
      // 밀도: 강조=전체 7각, 흐림=1×1·2×1·1×2만
      const angs = emph ? an.angles : an.angles.filter(a => ["1x1", "2x1", "1x2"].includes(a.name));
      const startFi = Math.max(fiMin, an.idx);                   // 앵커 창밖이면 좌단 진입점
      for (const a of angs) {
        const is11 = a.name === "1x1";
        const y1 = an.price + a.slope * (startFi - an.idx), y2 = an.price + a.slope * (rightFi - an.idx);
        const x1 = fiToX(startFi); if (!isFinite(x1)) continue;
        c.beginPath(); c.moveTo(x1, toY(y1)); c.lineTo(xRight, toY(y2));
        c.strokeStyle = (is11 && emph) ? FC_GOLD : "rgba(201,162,107," + (is11 ? alpha : alpha * 0.5).toFixed(3) + ")";
        c.lineWidth = (is11 && emph) ? CW.bold : CW.base;
        c.setLineDash(is11 ? [] : CDASH.std); c.stroke(); c.setLineDash([]);
      }
      // 앵커 도트(창 안일 때) + 강조 앵커 라벨(reason)
      if (an.idx >= fiMin) { const ax = fiToX(an.idx), ay = toY(an.price); if (isFinite(ax) && isFinite(ay)) { c.beginPath(); c.arc(ax, ay, emph ? 3 : 2, 0, Math.PI * 2); c.fillStyle = emph ? FC_GOLD : "rgba(201,162,107," + alpha.toFixed(3) + ")"; c.fill(); } }
      if (emph) { const yR = an.price + (an.angles.find(a => a.name === "1x1") || { slope: 0 }).slope * (rightFi - an.idx); c.fillStyle = FC_GOLD; c.font = "10px sans-serif"; c.fillText(an.reason || "1×1", xRight + 3, toY(yR)); }
    }
    c.restore();
  }
```

- [ ] **Step 2: dispatch 분기 M에 `fiMin` 추가**

`map/forge-draw.js`의 gann dispatch 분기(`_anGann(price, ...)` + `_drawGannLayers(cc, gn, {...})`)에서 M 객체에 `fiMin: wS`를 추가한다. `wS`가 structure/smc 분기가 쓰는 윈도우 시작 변수인지 grep으로 확인 후 동일 사용:

```bash
grep -n "fiMin: wS" map/forge-draw.js   # structure/smc 선례 확인
```

gann 분기 M이 `{ toY: v => toY(v), fiToX, nowFi: P - 1, futN: g.pathLen, xRight: g.padX + g.plotW, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, top: g.padTop, bot: g.ch - g.padBot }` 형태가 되도록 `fiMin: wS`를 삽입.

- [ ] **Step 3: 구문 검증 + 회귀**

Run: `node --check map/forge-draw.js` → 통과.
Run: `node --test map/forge-core.test.js` → 236 그린(무영향).

- [ ] **Step 4: 커밋**

```bash
git add map/forge-draw.js
git commit -m "feat(forge): Gann 다중앵커 작도 + 중요도 위계(강조/디밍) + 윈도우 클램프(창밖 무음 해소)"
```

---

## Task 4: 검증 + 배포 + 스코어카드

- [ ] **Step 1: 전체 테스트 그린**

Run: `node --test map/forge-core.test.js`
Expected: PASS — 신규 4개(collectAnchors 2 + analyzeGann anchors 1 + … Task1/2) 포함, 기존 gann bias/run 무회귀.

- [ ] **Step 2: 엔진 무변경(baseline) 확인**

```bash
git diff --name-only <BASE> HEAD -- map/backtest/ | head       # 출력 없어야
grep -n "patternDrift\|gannDrift\|_drifts =" map/forge-core.js  # run() 드리프트 로직 무변경 육안 확인
```
`<BASE>` = Task 1 직전 커밋. `analyzeGann`의 bias 계산 라인·`run()`·`_drifts`·`evalBlocks`가 diff에 없어야(anchors 필드 추가·collectAnchors 신설·draw만).

- [ ] **Step 3: 헤드리스 시각검증**

[[headless-verify-wsl]] 절차로 forge.html 로드 → gann 노드 + **실데이터 형태(느린 드리프트+진동, 예: `100 + 0.2*i + 6*sin(i/2.5) + 3*sin(i/6)` 180봉)** 주입 → 웹분석 → focus. **여러 앵커의 부챗살이 스케일별로 그려지고, 상위(고significance)만 굵은 골드+라벨, 나머지는 흐리게** 확인. 좁은 창으로 스크롤해 **앵커가 좌단 밖이어도 좌단부터 렌더**(무음 미표시 해소) 확인. 라이브 쓰기함수 금지([[headless-live-tests-readonly]]).

- [ ] **Step 4: cafe24 배포**

[[scoopforge-deploy]]([[commit-deploy-as-one-set]]) — `www/map/`에 lftp put(**map/ 디렉토리에서 실행**, bare 파일명):
```
forge-core.js · forge-draw.js
```
그리고 `git push`. 배포 후 curl 200 + `collectAnchors` 라이브 반영 확인.

- [ ] **Step 5: 스코어카드 기록**

`forge-scorecard.html` CHANGELOG 최상단에 도구 개선건 1건(`v:"—"`): "Gann 작도 다중스케일화 — 데이터기반 앵커 사다리·중요도 강조/디밍·창밖 클램프. 작도 전용(엔진 bias 불변·baseline 안전)." 커밋.

---

## Self-Review 결과

- **스펙 커버리지**: 설계 A(collectAnchors 사다리·dedup·degree Task1)·B(significance 4요소 Task1)·C(시각 위계 강조/디밍·밀도·라벨 Task3)·D(analyzeGann anchors·bias 불변 Task2, 다중앵커 작도·윈도우 클램프 Task3)·E(공용 헬퍼 = 확장 여지 문서화). 엔진 미변경(Global Constraints + Task4 Step2 확인).
- **Placeholder 스캔**: 없음. 모든 코드 스텝에 실제 코드. BASE·wS·backtest는 grep으로 특정하도록 명시.
- **타입 일관성**: `collectAnchors` 반환({fromIdx,fromPrice,toIdx,toPrice,dir,degree,significance,reason})을 Task2가 소비→`anchors`({idx,price,dir,significance,reason,angles})로 매핑. Task3가 `an.idx/price/significance/reason/angles[].name/slope` 사용 — Task2 산출과 일치. `_drawGannLayers` M 필드(fiMin/top/bot/futN/nowFi/xRight) Task3 내 일관.
- **범위**: Gann 작도 다중스케일 단일 목표 — 단일 계획으로 적정. 확장(fib/trend/S&R)·엔진은 별도.
