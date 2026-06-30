# Log 차트 토글 + 샘플 티커 블록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 샘플 포지에 티커 블록을 기본 포함하고, hero 가격차트에 로그/선형 스케일 토글(포지별 영속)을 추가한다. (드래그+줌은 기존 `_heroZoom`으로 이미 동작 — 신규 코드 없이 검증만.)

**Architecture:** 코어 `sampleGraph()`에 standalone 티커 노드 추가(엣지 불필요 — `priceSeries()`가 로드 시 자동 채택). forge.html에 전역 `_logChart` + 공유 `tvLog()`로 차트·근거 작도의 가격→y 매핑 두 곳을 로그 인지로 만들고, 헤더 토글 버튼 + 포지별 직렬화 영속.

**Tech Stack:** 바닐라 JS, 무빌드, 단일 HTML(`forge.html`) + UMD 코어(`forge-core.js`, `node --test`). 외부 라이브러리 없음.

## Global Constraints

- 바닐라 JS·무빌드·단일 HTML 유지. 프레임워크/번들러/외부 라이브러리 금지.
- 다크 토큰만(골드 `#e8b463`, bull `#46c28e`, bear `#e06a6a`, 보조 `#8a92b2`). UI 한국어. `noindex`·POST<128KB 유지.
- **따옴표 위생**: 편집 도구가 ASCII `"`→굽은 따옴표 `“”`로 바꾸는 사고 반복. 의도된 굽은 따옴표는 `&ldquo;`/`&rdquo;`, 가운뎃점 `\xb7`. 각 커밋 전 `git diff` 확인.
- `_logChart=false`·티커 미로드 시 **기존과 시각 동일(회귀 0)**. 로그는 양수 가격 전제.
- 코어 `run`/작도 로직 무변경(티커는 `priceSeries` 경유). 코어 테스트는 기존 동일 개수 유지(테스트 1건 단언만 갱신).

## 검증 공통

- forge.html 인라인 JS 파싱: `node -e "const fs=require('fs');const h=fs.readFileSync('forge.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');new Function(m);console.log('JS OK')"`
- 코어: `cd map && node --test forge-core.test.js 2>&1 | grep -E "^. (pass|fail)"` → 83 pass / 0 fail(태스크1에서 테스트 단언만 갱신, 개수 불변).

---

## 현황 앵커 (구현 전 읽을 것)

- `forge-core.js` `sampleGraph()`: 노드 `s_price`(872)…`s_ell`(878)·`s_vol`(879)·`s_comb`(880)·`s_pred`(881)·`s_memo`(882) = **11개**. 엣지 배열은 `E("s_price","s_ma")…E("s_comb","s_pred")`.
- `forge-core.test.js`: `test("sampleGraph: 11 nodes, …")`(380행) → `assert.strictEqual(g.nodes.length, 11)`(382행).
- `forge.html`:
  - `fcDrawMainChart`(2459) toY: `const toY = v => padTop + (1 - (v - loV) / ((hiV - loV) || 1)) * (ch - padTop - padBot);`(2481), 기하 stash `cv._mainGeo = { …, loV, hiV, … }`(2488).
  - evidence chart-mode toY(2868): `const toY = v => g.padTop + (1 - (v - g.loV) / ((g.hiV - g.loV) || 1)) * (g.ch - g.padTop - g.padBot);`.
  - 차트 헤더 액션부(약 521행): `<div class="fc-head-actions">` 안에 `viewToggle`/`evToggle`(class `ev-toggle`, `.on` 활성)·`fcExpand` 버튼.
  - `serializeActive()`(961): `dc.view = {…}` 다음에 영속 필드 추가. `loadDoc(id)`(985): `themeState.imgId = dc.themeImgId…` 부근에서 복원.
  - 재렌더 패턴(renderTheme, 918행): `if (hasRealSeries() && lastResult) renderChart(lastResult, currentData());`.

---

## Task 1: 샘플 포지에 티커 블록 추가

**Files:** Modify `map/forge-core.js`(`sampleGraph` 노드). Modify `map/forge-core.test.js`(노드수 테스트 단언).

**Interfaces:**
- Produces: `sampleGraph().nodes`에 `{id:"s_ticker", blockType:"ticker", params:{symbol:"BTC-USD", tf:"1day"}}` 포함(엣지 없음). 노드 수 11→12.

- [ ] **Step 1: 테스트 단언 갱신(먼저, RED)**

`forge-core.test.js` 380행 테스트를 12 + 티커 단언으로:
```js
test("sampleGraph: 12 nodes, DAG runs, descriptions are truthful, bullish net", () => {
```
그 안의 `assert.strictEqual(g.nodes.length, 11);` → 
```js
  assert.strictEqual(g.nodes.length, 12);
  const tk = g.nodes.find(n => n.blockType === "ticker");
  assert.ok(tk && tk.params && tk.params.symbol === "BTC-USD", "샘플에 BTC-USD 티커 노드");
```
(테스트 본문의 나머지 단언은 그대로.)

- [ ] **Step 2: 실패 확인**

Run: `cd map && node --test forge-core.test.js`
Expected: FAIL — `g.nodes.length`가 11이라 `=== 12` 실패.

- [ ] **Step 3: 구현 — `sampleGraph()` 노드에 `s_ticker` 추가**

`forge-core.js` `sampleGraph()`의 `nodes` 배열에서 `s_price` 항목(872행) **앞**에 추가:
```js
      { id: "s_ticker", kind: "block", blockType: "ticker", params: { symbol: "BTC-USD", tf: "1day" }, x: 40, y: 30, title: "티커", conviction: 0, weight: 50, desc: "실 종목 데이터 — 불러오기로 실 캔들 적용" },
```
(엣지는 추가하지 않는다 — `priceSeries()`가 시계열 로드 시 자동 채택. 데이터 없을 땐 `s_price` 베이크 사용 → 샘플 첫 표시는 데모 그대로.)

- [ ] **Step 4: 통과 확인**

Run: `cd map && node --test forge-core.test.js`
Expected: PASS — 83 pass / 0 fail(개수 불변, 단언만 갱신). 기존 `sampleGraph: 거래량 노드 포함` 테스트(914)도 그대로 통과.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge-core): 샘플 포지에 티커 블록(BTC-USD 프리필) 추가"
```

---

## Task 2: Log/선형 차트 토글 (forge.html)

**Files:** Modify `map/forge.html`(전역 `_logChart`·`tvLog`·`toggleLogChart`·`updateLogBtn`; `fcDrawMainChart` toY·`_mainGeo`; evidence toY; 헤더 버튼; `serializeActive`/`loadDoc` 영속).

**Interfaces:**
- Consumes: `_mainGeo`, `renderChart`, `currentData`, `lastResult`, `hasRealSeries`, `markDirty`, `serializeActive`/`loadDoc`.
- Produces: 전역 `_logChart`; `tvLog(x,on)`; `toggleLogChart()`/`updateLogBtn()`; `_mainGeo.log`. 차트·근거 작도·예측 콘 y매핑이 로그/선형 일관, 포지별 영속.

- [ ] **Step 1: 전역 + 공유 헬퍼 추가** (스크립트 전역 구역, 예: `let _heroZoom` 근처)

```js
  let _logChart = false;
  function tvLog(x, on) { return on ? Math.log(Math.max(1e-9, x)) : x; }
```

- [ ] **Step 2: `fcDrawMainChart` toY 로그 인지 + `_mainGeo.log`**

`fcDrawMainChart`의 toY(2481행)를 교체:
```js
    const _lo = tvLog(loV, _logChart), _hi = tvLog(hiV, _logChart);
    const toY = v => padTop + (1 - (tvLog(v, _logChart) - _lo) / ((_hi - _lo) || 1)) * (ch - padTop - padBot);
```
그리고 `cv._mainGeo = { … }`(2488행) 객체에 `log: _logChart`를 추가(기존 키 유지).

- [ ] **Step 3: evidence chart-mode toY 로그 인지**

evidence의 chart-mode toY(2868행)를 교체:
```js
      const _elo = tvLog(g.loV, g.log), _ehi = tvLog(g.hiV, g.log);
      const toY = v => g.padTop + (1 - (tvLog(v, g.log) - _elo) / ((_ehi - _elo) || 1)) * (g.ch - g.padTop - g.padBot);
```
> 두 toY가 같은 `tvLog`·같은 플래그(차트=`_logChart`, evidence=`g.log`=직전 `fcDrawMainChart`가 저장한 동일 값)를 쓰므로 가격선·캔들·예측 콘·근거 작도(M.pToY)가 **함께** 로그 변환.

- [ ] **Step 4: 헤더 토글 버튼**

차트 헤더 `.fc-head-actions`(약 521행)에서 `evToggle` 버튼 다음에 추가:
```html
              <button id="logToggle" class="ev-toggle" title="로그/선형 스케일" onclick="toggleLogChart()">📊 LOG</button>
```
(별도 CSS 불필요 — 기존 `.ev-toggle`·`.ev-toggle.on` 재사용.)

- [ ] **Step 5: `toggleLogChart` / `updateLogBtn`**

스크립트에 추가(예: `fcDrawMainChart` 근처나 토글 함수들 근처):
```js
  function updateLogBtn() {
    const b = document.getElementById("logToggle");
    if (b) { b.classList.toggle("on", _logChart); b.textContent = _logChart ? "📊 선형" : "📊 LOG"; }
  }
  function toggleLogChart() {
    _logChart = !_logChart;
    updateLogBtn();
    if (hasRealSeries() && lastResult) renderChart(lastResult, currentData());
    markDirty();
  }
```
> 토글은 분석 재계산 없이 y매핑만 바꿔 재렌더(renderTheme 918행과 동일한 `renderChart(lastResult, currentData())` 패턴). 차트 데이터가 없으면(분석 전) 버튼 상태만 바뀌고 다음 렌더에 반영.

- [ ] **Step 6: 포지별 영속 — serialize/load**

`serializeActive()`(961행)의 `dc.view = {…};` 다음 줄에:
```js
    dc.logChart = _logChart;
```
`loadDoc(id)`(985행)에서 `themeState.imgId = dc.themeImgId || null; themeState.title = dc.title || "";` 다음에:
```js
    _logChart = !!dc.logChart; updateLogBtn();
```
> loadDoc이 이후 보드/차트를 재렌더하므로 복원된 `_logChart`가 그 렌더에 반영. updateLogBtn으로 버튼 상태도 동기화.

- [ ] **Step 7: 검증 + 커밋**

```bash
cd map
node -e "const fs=require('fs');const h=fs.readFileSync('forge.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');new Function(m);console.log('JS OK')"
node --test forge-core.test.js 2>&1 | grep -E "^. (pass|fail)"   # 83/0(코어 미변경)
git diff --stat
```
Expected: `JS OK`, 83/0, 따옴표 변형 없음. 자기검토: (a) `_logChart=false`·티커 미로드 시 기존과 동일(회귀 0); (b) 토글 시 캔들·선·예측 콘·근거 작도가 함께 로그 변환(어긋남 0 — 두 toY가 같은 헬퍼·플래그); (c) 버튼 라벨/`.on` 토글; (d) serialize/load로 포지별 유지; (e) 줌/팬(`_heroZoom`)·호버 툴팁은 toY만 거쳐 자동 정합.
```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): Log/선형 차트 토글(차트·근거·예측 콘 일관 로그변환) + 포지별 영속"
```

---

## 최종 (배포 + 라이브 검증)

전체 브랜치 리뷰(opus, 로그 변환 정합·영속·회귀) → main 머지 → 배포(`forge.html`+`forge-core.js`) → 라이브 확인:
- 샘플 포지에 **티커 블록** 보임(심볼 BTC-USD 프리필) → 불러오기 시 실 캔들 + 차트 모드 → **휠 줌·드래그 팬 동작**(#3, 기존 기능 활성 확인).
- `📊 LOG` 토글 → 캔들·선·예측 콘·근거 작도가 함께 로그 스케일, 재방문/새로고침에 유지(포지별).
