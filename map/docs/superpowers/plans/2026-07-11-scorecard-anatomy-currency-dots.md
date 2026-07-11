# 스코어카드 엔진 해부도 현행화 + 데이터량 비례 도트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 엔진(`forge-core.js`)이 버전·지표수·검증축을 단일 출처로 export하고, 스코어카드가 그것을 읽어 자동 현행화하며, 라이브 신경망의 이동 도트 수량·뉴런 크기를 엣지 데이터량에 비례시킨다.

**Architecture:** `forge-core.js`에 순수 데이터 상수(`indicatorCount`·`validatedAxes`)를 추가·export. `forge-scorecard.html`(이미 `forge-core.js` 로드 중)이 `ForgeCore.{version,indicatorCount,validatedAxes}`를 읽어 (a) 버전·카운트 문자열 주입, (b) 라이브 신경망 리스크 노드 생성(추세지속 자동 포함), (c) `flow()` 도트 수·뉴런 크기 계산. 런타임 계산·서버 호출 없음.

**Tech Stack:** 순수 HTML/CSS/Vanilla JS, 빌드 도구 없음. `forge-core.js`는 UMD(브라우저 `window.ForgeCore` + node `module.exports`), `node --test`로 단위테스트. 스코어카드는 헤드리스(playwright-core) 스모크로 검증.

## Global Constraints

- 디자인 토큰만 사용, 하드코딩 색 금지(단, 해부도는 자체 팔레트 상수 `gold/eth/bull/bear` 사용 — 기존 관례 유지). **항목 좌측 컬러 accent line 절대 금지.**
- `forge-core.js` 변경은 **순수 데이터 추가 export만** — 엔진 계산 로직 불변, 기존 199 테스트 통과 유지. 중복 최상위 선언 금지.
- 기능 *도입* 버전 배지(v1.7·v1.9.1 등 역사값)와 개선 이력(changelog)은 **변경하지 않음**(역사·서술). "현재 엔진 버전" 표기만 동적화.
- 헤드리스 스모크 명령(스코어카드 검증에 공통 사용):
  ```
  LIBDIR=/tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/57eb3a5e-1762-4cca-bc89-4078e7a90f2f/scratchpad/libs/usr/lib/x86_64-linux-gnu
  LD_LIBRARY_PATH="$LIBDIR" node <smoke.js>
  ```
  playwright-core: `/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core`, exe: `/home/jschoi0223/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`, args `["--no-sandbox","--disable-gpu"]`. (libs 없으면: scratchpad에서 `apt-get download libnspr4 libnss3 libasound2t64 ... && dpkg-deb -x` 로 추출.)

---

### Task 1: forge-core.js — 엔진 메타 상수 export

**Files:**
- Modify: `forge-core.js:7`(상수 추가), `forge-core.js:2399`(export 목록)
- Test: `forge-core.test.js`(맨 끝에 export 계약 테스트 추가)

**Interfaces:**
- Produces: `ForgeCore.version`(string, 기존), `ForgeCore.indicatorCount`(number=30), `ForgeCore.validatedAxes`(Array<{key:string, lab:string, acc:number, hz:string, stock?:boolean}>, 길이 6).

- [ ] **Step 1: Write the failing test** — `forge-core.test.js` 맨 끝에 추가:

```js
test("엔진 메타 export — version·indicatorCount·validatedAxes 계약", () => {
  assert.equal(typeof ForgeCore.version, "string");
  assert.equal(ForgeCore.indicatorCount, 30);
  const ax = ForgeCore.validatedAxes;
  assert.ok(Array.isArray(ax) && ax.length === 6, "검증 축 6개");
  ax.forEach(a => { assert.equal(typeof a.key, "string"); assert.equal(typeof a.lab, "string"); assert.equal(typeof a.acc, "number"); });
  assert.ok(ax.some(a => a.key === "trend"), "추세 지속 축 포함");
  assert.ok(ax.some(a => a.key === "gap" && a.stock === true), "갭 축 주식 게이트 플래그");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test forge-core.test.js 2>&1 | tail -5`
Expected: FAIL (`indicatorCount` undefined → `ForgeCore.indicatorCount` !== 30).

- [ ] **Step 3: Implement — 상수 추가.** `forge-core.js:7` `const version = "1.9.7";` 바로 아래에 삽입:

```js
  const indicatorCount = 30;   // 지표 배터리 종수 (forge-state IND_TIERS와 동기 — 지표 추가 시 함께 갱신)
  // 검증된 예측 축(백테스트 OOS). acc=대표 지평 정확도(%), hz=지평 라벨, stock=주식 한정.
  const validatedAxes = [
    { key: "vol",   lab: "변동성 예보",   acc: 69, hz: "3지평" },
    { key: "dd",    lab: "낙폭 위험곡선", acc: 68, hz: "3지평" },
    { key: "up",    lab: "이익목표 도달", acc: 64, hz: "" },
    { key: "spike", lab: "급변 경보",     acc: 65, hz: "3지평" },
    { key: "gap",   lab: "갭 경보",       acc: 63, hz: "3지평", stock: true },
    { key: "trend", lab: "추세 지속/소진", acc: 76, hz: "3지평·비방향" },
  ];
```

- [ ] **Step 4: Implement — export 추가.** `forge-core.js:2399`의 `return { version, calibrateUpProb, ...` 에서 `version,` 바로 뒤에 `indicatorCount, validatedAxes,` 삽입:

```js
  return { version, indicatorCount, validatedAxes, calibrateUpProb, forecastVolatility, /* …기존 그대로… */ };
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test forge-core.test.js 2>&1 | tail -5`
Expected: PASS, `fail 0` (신규 1건 포함 200 케이스).

- [ ] **Step 6: Commit**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge-core): 엔진 메타(indicatorCount·validatedAxes) export"
```

---

### Task 2: 스코어카드 — 버전·카운트 자동 현행화

**Files:**
- Modify: `forge-scorecard.html` — 스크립트 상단 메타 상수(417 아래), footer(657), 정적 스키매틱 A1(206)·B2(241~242), 라이브 신경망 헤더(591 aria·625)

**Interfaces:**
- Consumes: `ForgeCore.version`, `ForgeCore.indicatorCount`, `ForgeCore.validatedAxes` (Task 1).
- Produces: 전역 `EV`(string), `IND_N`(number), `AXES`(array), `AXIS_N`(number) — Task 3·4가 사용.

- [ ] **Step 1: Write the failing smoke test** — `scratchpad/sc-smoke.js` 작성:

```js
const { chromium } = require("/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core");
(async () => {
  const errs = [];
  const b = await chromium.launch({ executablePath: "/home/jschoi0223/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell", args: ["--no-sandbox","--disable-gpu"] });
  const p = await b.newPage();
  p.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
  await p.goto("file:///home/jschoi0223/projects/vdiportal/map/forge-scorecard.html", { waitUntil: "load", timeout: 20000 }).catch(e=>errs.push("GOTO "+e.message));
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => ({
    footHasVer: /엔진 v1\.9\.7/.test(document.getElementById("foot").textContent),
    a1: document.querySelector(".ea-t") ? true : false,
    b2Trend: /추세 지속/.test(document.body.innerHTML),
    riskCount: document.querySelectorAll("#eaLive .ea-lv-lab").length,   // Task 3 검증에 사용
  }));
  console.log("ERRORS:", errs.length ? errs.join("\n") : "(none)");
  console.log(JSON.stringify(r, null, 2));
  await b.close();
})();
```

- [ ] **Step 2: Run smoke to see baseline (fails on b2Trend)**

Run: `LD_LIBRARY_PATH="$LIBDIR" node scratchpad/sc-smoke.js`
Expected: `ERRORS: (none)`, 하지만 `b2Trend` — 정적 B2엔 아직 추세지속 없어 body 전체엔 다른 곳(340행)에서 이미 "추세 지속" 존재하므로 true일 수 있음. **이 태스크의 확정 검증은 Step 5의 footHasVer(=EV 반영)**. b2Trend/riskCount는 Task 3에서 확정.

- [ ] **Step 3: Implement — 메타 상수.** `forge-scorecard.html:417`(`const pc = ...`) 위, `<script>`(415) 직후·`const BT`(416) 위에 삽입:

```js
const EV = (typeof ForgeCore !== "undefined" && ForgeCore.version) ? ForgeCore.version : "1.9.7";
const IND_N = (typeof ForgeCore !== "undefined" && ForgeCore.indicatorCount) || 30;
const AXES = (typeof ForgeCore !== "undefined" && Array.isArray(ForgeCore.validatedAxes) && ForgeCore.validatedAxes.length) ? ForgeCore.validatedAxes
  : [{key:"vol",lab:"변동성 예보",acc:69,hz:"3지평"},{key:"dd",lab:"낙폭 위험곡선",acc:68,hz:"3지평"},{key:"up",lab:"이익목표 도달",acc:64,hz:""},{key:"spike",lab:"급변 경보",acc:65,hz:"3지평"},{key:"gap",lab:"갭 경보",acc:63,hz:"3지평",stock:true},{key:"trend",lab:"추세 지속/소진",acc:76,hz:"3지평·비방향"}];
const AXIS_N = AXES.length;
```

- [ ] **Step 4: Implement — footer 동적화.** `forge-scorecard.html:657` 교체:

```js
document.getElementById("foot").innerHTML = "스쿱포지 엔진 v"+EV+" · 기준 "+BT.asOf+" · walk-forward 백테스트 · <a href='forge-backtest-report.json' target='_blank'>전체 원자료(JSON) →</a> · <a href='forge-guide.html'>엔진 작동 원리 →</a> · <a href='forge-pricing.html'>요금제 →</a>";
```

- [ ] **Step 5: Implement — 라이브 신경망 헤더 카운트 동적화.** `forge-scorecard.html:625` 교체:

```js
  s+=`<text x="${IX}" y="34" text-anchor="middle" class="ea-lv-spine" fill="${gold}">${IND_N}개 지표 뉴런</text>`;
```
그리고 591 aria-label 내 "30개 지표 뉴런" → `${IND_N}개 지표 뉴런`으로(템플릿 리터럴 내부이므로 직접 치환).

- [ ] **Step 6: Implement — 정적 스키매틱 A1·B2 갱신.** A1은 정적 HTML(206)이라 JS 상수를 못 쓰므로 부팅 스크립트에서 주입. `renderEngineLive` IIFE 위(568행 근처) 또는 footer 설정부 근처에 삽입:

```js
// 정적 스키매틱 카운트·축 목록 현행화(엔진 메타 반영)
(function syncStaticSchema(){
  const a1 = document.querySelectorAll(".ea-t");
  a1.forEach(el => { if (/지표 배터리/.test(el.textContent)) el.textContent = "지표 배터리 · "+IND_N+"종";
    if (/리스크 .*축 · 로지스틱/.test(el.textContent)) el.textContent = "리스크 "+AXIS_N+"축 · 로지스틱"; });
  const b2d = Array.from(document.querySelectorAll(".ea-d")).find(el => /변동성 예보<\/b>|변동성 예보/.test(el.innerHTML) && /낙폭 위험곡선/.test(el.innerHTML));
  if (b2d) b2d.innerHTML = AXES.map(a => "<b>"+a.lab+"</b>"+(a.acc? " "+a.acc+"%":"")+(a.stock?"(주식)":"")).join(" · ") + ". 짝지어 <b>확률 R:R</b>.";
})();
```

- [ ] **Step 7: Run smoke to verify pass**

Run: `LD_LIBRARY_PATH="$LIBDIR" node scratchpad/sc-smoke.js`
Expected: `ERRORS: (none)`, `footHasVer: true`(EV=1.9.7 반영). A1 텍스트 "지표 배터리 · 30종", B2 라벨 "리스크 6축".

- [ ] **Step 8: Commit**

```bash
git add forge-scorecard.html
git commit -m "feat(forge-scorecard): 버전·지표수·검증축 자동 현행화(엔진 메타)"
```

---

### Task 3: 라이브 신경망 — 리스크 노드를 validatedAxes에서 생성(추세지속 자동)

**Files:**
- Modify: `forge-scorecard.html:582`(`const risk = [...]` 교체) — `renderEngineLive` IIFE 내부

**Interfaces:**
- Consumes: 전역 `AXES`(Task 2), 지역 `bull`(색).
- Produces: 지역 `risk`(Array<{x,y,r,c,lab,sub,pl,ax}>) — 이후 `named`·팬와이어·`risk→out` 흐름이 순회.

- [ ] **Step 1: Extend smoke assertion.** `scratchpad/sc-smoke.js`의 evaluate에 이미 `riskCount`(`#eaLive .ea-lv-lab` 수)가 있음. 리스크 6개 + 명명노드(price,vol,drift,dir,cone,cal,out=7) 라벨이 섞이므로, 대신 리스크 라벨을 특정: evaluate에 추가

```js
    trendNode: Array.from(document.querySelectorAll("#eaLive .ea-lv-lab")).some(t => /추세 지속/.test(t.textContent)),
```

- [ ] **Step 2: Run smoke — trendNode false 확인**

Run: `LD_LIBRARY_PATH="$LIBDIR" node scratchpad/sc-smoke.js`
Expected: `trendNode: false`(아직 리스크 5개, 추세지속 없음).

- [ ] **Step 3: Implement — risk 생성.** `forge-scorecard.html:582`의 `const risk = [ ... ];` 한 줄 전체를 교체:

```js
  // 리스크 노드 = 엔진 검증 축(validatedAxes)에서 생성 → 축 추가/추세지속 자동 반영. 개수에 맞춰 세로 분배.
  const RTOP=398, RBOT=640, _rn=AXES.length, RSTEP=_rn>1?(RBOT-RTOP)/(_rn-1):0;
  const risk = AXES.map((a,i)=>({ x:706, y:Math.round(RTOP+i*RSTEP), r:11,
    c: a.stock ? "#c98a5a" : bull, lab: a.lab, sub: a.acc+"%"+(a.hz?" · "+a.hz:""), pl:"right", ax:a }));
```

- [ ] **Step 4: Run smoke — trendNode true + 오류 0**

Run: `LD_LIBRARY_PATH="$LIBDIR" node scratchpad/sc-smoke.js`
Expected: `ERRORS: (none)`, `trendNode: true`. (리스크 노드 6개가 y 398~640에 분배, 하단 범례 y=688과 미겹침.)

- [ ] **Step 5: Commit**

```bash
git add forge-scorecard.html scratchpad/sc-smoke.js
git commit -m "feat(forge-scorecard): 라이브 신경망 리스크 노드 엔진 축에서 생성(추세지속 포함)"
```

---

### Task 4: 이동 도트 = 데이터 스트림 수 비례 + 뉴런 크기 차등

**Files:**
- Modify: `forge-scorecard.html` — `flow` 정의(596~599), 지표군→드리프트/주요채널 흐름(602·609~618), 뉴런 그리기(621~623), 범례(644) — 모두 `renderEngineLive` IIFE 내부

**Interfaces:**
- Consumes: 지역 `CL`(지표군, 각 `cl.k` 군크기·`cl.yc` 중심y), `IND`, `drift`, `dir`, `cone`, `cal`, `out`, `risk`, `IX`, 전역 `IND_N`.
- Produces: (없음 — 시각만 변경)

- [ ] **Step 1: Extend smoke assertion — 도트 총수·뉴런 반지름 차등.** evaluate에 추가:

```js
    dots: document.querySelectorAll("#eaLive circle.eapart").length,   // 흐르는 입자 수(스트림 비례로 증가)
    neuronRadii: Array.from(document.querySelectorAll("#eaLive circle")).map(c=>+c.getAttribute("r")).filter(r=>r>2.9&&r<7).length,
```

- [ ] **Step 2: Run smoke — baseline 도트 수 기록**

Run: `LD_LIBRARY_PATH="$LIBDIR" node scratchpad/sc-smoke.js`
Expected: `ERRORS: (none)`, `dots`=현재값(참고용 baseline).

- [ ] **Step 3: Implement — flow 스트림 비례 도트.** `forge-scorecard.html:596~599`의 `flow` 정의를 교체:

```js
  const DOT_MAX=5, DOT_K=0.6;
  const dotN=streams=>Math.max(1,Math.min(DOT_MAX,Math.round(streams*DOT_K)));
  const flow=(d,c,streams)=>{ const n=dotN(streams); const id="fp"+(pi++); pdefs+=`<path id="${id}" d="${d}" fill="none"/>`; const dur=2.2+(pi%4)*0.5;
    for(let k=0;k<n;k++){ const bg=(k*dur/n).toFixed(2);
      parts+=`<circle class="eapart" r="2.7" fill="${c}" filter="url(#eaGlow)"><animateMotion dur="${dur}s" begin="${bg}s" repeatCount="indefinite"><mpath href="#${id}"/></animateMotion></circle>`
           +`<circle class="eapart" r="1.4" fill="#fff" fill-opacity=".9"><animateMotion dur="${dur}s" begin="${bg}s" repeatCount="indefinite"><mpath href="#${id}"/></animateMotion></circle>`; } };
```

- [ ] **Step 4: Implement — 주요 채널 스트림 배정.** `forge-scorecard.html:609~618`의 흐름 호출을 교체(집약 채널=IND_N, 리스크=3, 지표군→드리프트=군크기):

```js
  // 주요 채널(굵게 + 흐름) — streams=데이터량
  wire(qd(drift,dir), gold,.3,1.6);   flow(qd(drift,dir), gold, IND_N);
  wire(qd(drift,cone),gold,.3,1.6);   flow(qd(drift,cone),gold, IND_N);
  wire(qd(dir,cal),  gold,.28,1.5);   flow(qd(dir,cal), gold, 6);
  wire(qd(cone,cal), gold,.28,1.5);   flow(qd(cone,cal),gold, 6);
  wire(qd(cal,out),  gold,.32,1.7);   flow(qd(cal,out), gold, IND_N);
  risk.forEach(rn=>{ wire(qd(rn,out,.08), bull,.28,1.5); flow(qd(rn,out,.08), bull, 3); });
  // 지표군 → 드리프트: 군 대표 1줄기, 도트=군 크기 비례(모멘텀8 多·주기2 少)
  CL.forEach(cl=>{ flow(uid({x:IX,y:cl.yc},drift), cl.c, cl.k); });
  // 대표 팬아웃(가격→지표·피처): 얇은 단일 스트림
  [0,7,15,22,28].forEach(i=>{ flow(uid(price,IND[i]), IND[i].c, 1); });
  [0,4,9].forEach(i=>{ flow(uid(price,FEAT[i]), bull, 1); });
  [[0,0],[4,1],[9,2]].forEach(([f,r])=>flow(uid(FEAT[f],risk[r]), bull, 1));
```

- [ ] **Step 5: Implement — 뉴런 크기 군 크기 비례.** `forge-scorecard.html:622`의 지표 뉴런 그리기 교체(반지름을 `cl.k` 비례):

```js
  IND.forEach((n,i)=>{ const nr=3.4+Math.min(6.4,n.cl.k*0.38); s+=`<circle cx="${n.x}" cy="${n.y}" r="${(nr+2.7).toFixed(1)}" fill="${n.c}" opacity=".18" filter="url(#eaGlow)"/><circle cx="${n.x}" cy="${n.y}" r="${nr.toFixed(1)}" fill="var(--surface)" stroke="${n.c}" stroke-width="1.8"/>`; });
```

- [ ] **Step 6: Implement — 범례 문구.** `forge-scorecard.html:644`의 마지막 `<text ...>뉴런 색 = 지표군 · 흐르는 입자 = 신호</text>`를 교체:

```js
   +`<text x="232" y="0" class="ea-lv-cap">뉴런 색 = 지표군 · 크기·도트 = 데이터 비중</text></g>`;
```

- [ ] **Step 7: Run smoke — 도트 증가 + 오류 0 + 뉴런 반지름 차등 존재**

Run: `LD_LIBRARY_PATH="$LIBDIR" node scratchpad/sc-smoke.js`
Expected: `ERRORS: (none)`, `dots` > baseline(집약 채널 5개 도트로 증가), `neuronRadii` > 0(차등 반지름 렌더).

- [ ] **Step 8: 육안 스크린샷 확인(권장).** smoke.js에 `await p.screenshot({path:"scratchpad/sc.png", fullPage:true})` 임시 추가 후 실행, `sc.png`로 해부도 도트·뉴런 크기 차등·추세지속 노드 확인. 확인 후 스크린샷 코드 제거.

- [ ] **Step 9: Commit**

```bash
git add forge-scorecard.html scratchpad/sc-smoke.js
git commit -m "feat(forge-scorecard): 이동 도트=데이터 스트림 비례 + 지표군 뉴런 크기 차등"
```

---

## 배포 (전체 태스크 완료 후)

```bash
cd /home/jschoi0223/projects/vdiportal && git push origin main
cd map && lftp -u parksvc,'wjdtjd2@' sftp://parksvc.mycafe24.com <<'EOF'
set sftp:auto-confirm yes
cd www/map
put forge-core.js
put forge-scorecard.html
bye
EOF
```
검증: `curl -s https://parksvc.mycafe24.com/map/forge-core.js | grep -c validatedAxes` (≥1), 스코어카드 페이지 육안. (`forge_*.json`·`forge_td_key.txt` 등 서버 데이터 불가침 — 업로드 금지.)

## Self-Review (작성자 체크)

- **스펙 커버리지:** A(엔진 export)=Task1 / B(버전·카운트 현행화)=Task2 / B2(리스크 노드 생성·추세지속)=Task3 / C·C2(도트·뉴런 크기)=Task4 / 정적 스키매틱 갱신=Task2 Step6 / 테스트=Task1 유닛+각 Task 스모크. 전 항목 커버. ✓
- **Placeholder 스캔:** 모든 코드 스텝에 실제 코드 포함, TBD/TODO 없음. ✓
- **타입 일관성:** `AXES` 항목 `{key,lab,acc,hz,stock}`가 Task1 정의와 Task2·3 사용 일치. `dotN`/`flow(d,c,streams)` 시그니처 Task4 내 일관. `risk` 객체 shape가 기존 `named`/팬와이어 사용과 호환(x,y,r,c,lab,sub,pl 유지 + ax 추가). ✓
