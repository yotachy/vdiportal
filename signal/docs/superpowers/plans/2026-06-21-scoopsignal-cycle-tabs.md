# ScoopSignal 주기 패턴 탭 4종 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "주기 패턴" 섹션에 표시 전용 차트 탭 4개(드로다운·반감기 오버레이·실현 변동성·200주 배수)를 추가한다.

**Architecture:** 기존 `.charts` 탭 패턴을 확장한다 — 탭별로 `.tab` 버튼 + `.panel-chart`(노트+canvas+stats) + `drawXxx()` 함수 + `drawActiveChart()` 디스패치 키를 추가한다. 캔버스는 기존 `lineChart()` 헬퍼를 재사용하고, 데이터는 이미 `S.week`/`S.ma200`에 있는 것만 쓴다(새 fetch 없음). 종합 점수/4축/게이지에는 영향이 없다.

**Tech Stack:** 순수 HTML5 · CSS3 · 바닐라 JS. 무빌드·무의존. 단일 파일 `signal/scoopsignal.html`.

## Global Constraints

- **단일 파일** — 모든 HTML/CSS/JS는 `signal/scoopsignal.html` 내부. 새 파일 금지.
- **무의존·무빌드** — 프레임워크·차트 라이브러리 금지. 차트는 기존 `lineChart()`(canvas) 재사용.
- **새 네트워크 fetch 금지** — `S.week.c`/`S.week.t`/`S.ma200.hist` 등 기존 상태만 사용.
- **표시 전용** — `recompute()`·`scoreMom/Liq/Fun/Val`·게이지·레이더·종합 점수 불변. 점수에 편입하지 않음.
- **디자인 토큰** — 색은 `css('--bear'/'--bull'/'--neutral'/'--gold'/'--faint'/'--muted'/'--text')` 또는 기존 `lineChart` 데이터셋 hex 관례. 새 하드코딩 색 금지.
- **한국어 UI.** localStorage는 기존 `scoopsignal_cfg`만(이번 작업은 미사용).
- **그레이스풀 디그레이드** — Binance 미로드 시 사이클 탭이 비는 기존 동작 유지(`if(S.month)`/`S.week` 가드).
- **검증은 브라우저 기반** — 테스트 러너 없음. `node --check`(신택스) + 헤드리스 렌더(WSL: `~/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`, 추출 lib `LD_LIBRARY_PATH=/tmp/sslibs/extract/usr/lib/x86_64-linux-gnu`).
- **배포(완료 후, vdi-log 방식):** 커밋 → push → cafe24 SFTP `www/portal/signal/scoopsignal.html`(자격증명 `~/projects/park/deploy.sh`).

**기준 설계:** `signal/docs/superpowers/specs/2026-06-21-scoopsignal-cycle-tabs-design.md`

---

## File Structure

| 파일 | 변경 |
|---|---|
| `signal/scoopsignal.html` | 전 task에서 수정 (탭/패널 마크업 + draw 함수 + 디스패치) |

줄 번호는 작업 시점 grep으로 재확인. 기존 참고 위치: `.tabs`(약 220), `.panel-chart`들(약 226–237), `lineChart`(약 350), `drawCycle`(약 518), `drawBand`(약 525), `drawActiveChart`(약 542), 탭 클릭 핸들러(약 577).

**탭 순서:** 기존 3개(계절성·사이클 오버레이·로그 밴드)는 그대로 두고, 신규 4개를 **그 뒤에 순서대로 append**(드로다운 → 반감기 → 변동성 → 200주 배수). (설계의 그룹 순서 대비 append로 단순화 — 기존 탭 위치 불변, 위험 최소.)

**`drawActiveChart()` 디스패치:** 현재 `if/else`(마지막 `else`가 band를 받음)를 객체 디스패치로 1회 전환하고, 각 task가 자기 키를 추가한다.

---

### Task 1: 드로다운(언더워터) 탭 + drawActiveChart 디스패치 전환

**Files:** Modify `signal/scoopsignal.html`

**Interfaces:**
- Consumes: `S.week.c`(주간 종가 배열), `lineChart(cv,datasets,{logY})`, `css(var)`, `$(sel)`, `activeTab`
- Produces: `drawDrawdown()`; `drawActiveChart()`가 객체 디스패치로 전환됨(키: season/cycle/band/dd)

- [ ] **Step 1: 탭 버튼 추가**

`.tabs` 컨테이너에서 마지막 탭(`data-tab="band"` 버튼) **뒤**에 추가:

```html
      <button class="tab" role="tab" aria-selected="false" data-tab="dd">드로다운</button>
```

- [ ] **Step 2: 패널 추가**

마지막 `panel-chart`(`data-panel="band"`) div **뒤**에 추가:

```html
    <div class="panel-chart" data-panel="dd">
      <div class="chart-note">전고점(ATH) 대비 낙폭(%). 0 아래로 깊을수록 약세장 바닥권에 가깝습니다. <span id="ddStats" style="color:var(--muted)"></span></div>
      <canvas id="cvDD"></canvas>
    </div>
```

- [ ] **Step 3: drawDrawdown() 추가**

`drawBand()` 함수 **뒤**(그리고 `drawActiveChart` 앞)에 추가:

```js
function drawDrawdown(){
  const c=S.week.c;let peak=-Infinity;
  const dd=c.map(v=>{if(v>peak)peak=v;return (v/peak-1)*100;});
  lineChart($('#cvDD'),[{label:'드로다운(%)',color:css('--bear'),values:dd,w:1.8}],{logY:false});
  const cur=dd[dd.length-1],mx=Math.min(...dd);
  const st=$('#ddStats');if(st)st.innerHTML=`현재 <b style="color:var(--text)">${cur.toFixed(1)}%</b> · 역대 최대 <b style="color:var(--text)">${mx.toFixed(1)}%</b>`;
}
```

- [ ] **Step 4: drawActiveChart() 디스패치 전환**

기존:
```js
function drawActiveChart(){if(activeTab==='season')drawHeatmap();else if(activeTab==='cycle')drawCycle();else drawBand();}
```
교체:
```js
function drawActiveChart(){({season:drawHeatmap,cycle:drawCycle,band:drawBand,dd:drawDrawdown}[activeTab]||(()=>{}))();}
```

- [ ] **Step 5: 검증**

```bash
cd /home/jschoi0223/projects/vdiportal
sed -n '/^<script>/,/^<\/script>/p' signal/scoopsignal.html | sed '1d;$d' > /tmp/ss-t1.js && node --check /tmp/ss-t1.js && echo "SYNTAX OK"
grep -c 'data-tab="dd"\|id="cvDD"\|function drawDrawdown\|dd:drawDrawdown' signal/scoopsignal.html
```
Expected: `SYNTAX OK`; grep count 4. (헤드리스 탭 전환 확인은 Task 5 통합 검증에서.)

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 드로다운 탭 추가 + drawActiveChart 디스패치 전환\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: 반감기 정렬 오버레이 탭

**Files:** Modify `signal/scoopsignal.html`

**Interfaces:**
- Consumes: `S.week.t`(주간 타임스탬프), `S.week.c`, `lineChart`, `css`, `$`
- Produces: `drawHalving()`; `drawActiveChart` 디스패치에 `halving` 키 추가

- [ ] **Step 1: 탭 버튼 추가**

`data-tab="dd"` 버튼 **뒤**에 추가:

```html
      <button class="tab" role="tab" aria-selected="false" data-tab="halving">반감기</button>
```

- [ ] **Step 2: 패널 추가**

`data-panel="dd"` div **뒤**에 추가:

```html
    <div class="panel-chart" data-panel="halving">
      <div class="chart-note">BTC 반감기 시점을 100으로 맞춰 겹친 사이클(로그). 과거=회색, <span style="color:var(--gold)">현재(2024)=골드</span>. x축=반감기 후 경과(주). <span id="hvStats" style="color:var(--muted)"></span></div>
      <canvas id="cvHalving"></canvas>
    </div>
```

- [ ] **Step 3: drawHalving() 추가**

`drawDrawdown()` 뒤에 추가:

```js
function drawHalving(){
  const t=S.week.t,c=S.week.c;
  const halvings=[['2016-07-09','#5C6875'],['2020-05-11','#8B98A6'],['2024-04-20',css('--gold')]];
  const idxNear=tt=>{let bi=-1,bd=1e18;for(let i=0;i<t.length;i++){const d=Math.abs(t[i]-tt);if(d<bd){bd=d;bi=i;}}return bi;};
  const ds=[];let curWeeks=null;
  halvings.forEach(([d,cl],k)=>{
    const tt=Date.parse(d); if(tt<t[0]-7*864e5)return; // 데이터 시작 이전 반감기는 생략
    const start=idxNear(tt); if(start<0)return;
    const base=c[start],vals=[];for(let i=start;i<c.length;i++)vals.push(c[i]/base*100);
    const last=k===halvings.length-1;
    ds.push({label:d.slice(0,4)+' 반감기',color:cl,values:vals,w:last?2.4:1.5});
    if(last)curWeeks=c.length-1-start;
  });
  lineChart($('#cvHalving'),ds,{logY:true});
  const st=$('#hvStats');if(st)st.innerHTML=curWeeks!=null?`현재 <b style="color:var(--text)">반감기 후 ${curWeeks}주</b> (2024-04-20 기준)`:'';
}
```

- [ ] **Step 4: drawActiveChart() 디스패치에 halving 추가**

교체:
```js
function drawActiveChart(){({season:drawHeatmap,cycle:drawCycle,band:drawBand,dd:drawDrawdown,halving:drawHalving}[activeTab]||(()=>{}))();}
```

- [ ] **Step 5: 검증**

```bash
cd /home/jschoi0223/projects/vdiportal
sed -n '/^<script>/,/^<\/script>/p' signal/scoopsignal.html | sed '1d;$d' > /tmp/ss-t2.js && node --check /tmp/ss-t2.js && echo "SYNTAX OK"
grep -c 'data-tab="halving"\|id="cvHalving"\|function drawHalving\|halving:drawHalving' signal/scoopsignal.html
```
Expected: `SYNTAX OK`; grep count 4.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 반감기 정렬 오버레이 탭 추가\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: 실현 변동성 레짐 탭

**Files:** Modify `signal/scoopsignal.html`

**Interfaces:**
- Consumes: `S.week.c`, `lineChart`, `css`, `pctRank(arr,v)`, `prMeter(pct,sig)`, `sigOf`, `$`
- Produces: 상수 `VOL_WIN`; `drawVol()`; `drawActiveChart` 디스패치에 `vol` 키 추가

- [ ] **Step 1: 탭 버튼 추가**

`data-tab="halving"` 버튼 **뒤**에 추가:

```html
      <button class="tab" role="tab" aria-selected="false" data-tab="vol">변동성</button>
```

- [ ] **Step 2: 패널 추가**

`data-panel="halving"` div **뒤**에 추가:

```html
    <div class="panel-chart" data-panel="vol">
      <div class="chart-note">주간 수익률 기반 실현 변동성(연율 %). 낮은 구간=압축(큰 움직임 전조로 자주 거론). <span id="volStats" style="color:var(--muted)"></span></div>
      <canvas id="cvVol"></canvas>
    </div>
```

- [ ] **Step 3: VOL_WIN 상수 + drawVol() 추가**

`drawHalving()` 뒤에 추가:

```js
const VOL_WIN=13; // 실현 변동성 롤링 창(주)
function drawVol(){
  const c=S.week.c,r=[];for(let i=1;i<c.length;i++)r.push(Math.log(c[i]/c[i-1]));
  const vol=[];
  for(let i=0;i<r.length;i++){
    if(i<VOL_WIN-1){vol.push(null);continue;}
    let m=0;for(let j=i-VOL_WIN+1;j<=i;j++)m+=r[j];m/=VOL_WIN;
    let s=0;for(let j=i-VOL_WIN+1;j<=i;j++)s+=(r[j]-m)*(r[j]-m);
    vol.push(Math.sqrt(s/VOL_WIN)*Math.sqrt(52)*100);
  }
  lineChart($('#cvVol'),[{label:`실현 변동성(${VOL_WIN}주, 연율%)`,color:css('--neutral'),values:vol,w:1.8}],{logY:false});
  const valid=vol.filter(v=>v!=null),cur=valid[valid.length-1],pr=pctRank(valid,cur);
  const st=$('#volStats');if(st)st.innerHTML=`현재 <b style="color:var(--text)">${cur.toFixed(0)}%</b> ${prMeter(pr,sigOf((1-pr)*100))} <span style="color:var(--faint)">(낮을수록 압축)</span>`;
}
```

- [ ] **Step 4: drawActiveChart() 디스패치에 vol 추가**

교체:
```js
function drawActiveChart(){({season:drawHeatmap,cycle:drawCycle,band:drawBand,dd:drawDrawdown,halving:drawHalving,vol:drawVol}[activeTab]||(()=>{}))();}
```

- [ ] **Step 5: 검증**

```bash
cd /home/jschoi0223/projects/vdiportal
sed -n '/^<script>/,/^<\/script>/p' signal/scoopsignal.html | sed '1d;$d' > /tmp/ss-t3.js && node --check /tmp/ss-t3.js && echo "SYNTAX OK"
grep -c 'data-tab="vol"\|id="cvVol"\|function drawVol\|vol:drawVol\|VOL_WIN' signal/scoopsignal.html
```
Expected: `SYNTAX OK`; grep count 6 (VOL_WIN은 선언+사용 2회 + 라벨 1회 = 3 → 합계 6).

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 실현 변동성 레짐 탭 추가\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: 200주선 배수(메이어) 탭

**Files:** Modify `signal/scoopsignal.html`

**Interfaces:**
- Consumes: `S.ma200.hist`(200주 배수 히스토리 배열, `loadBinance`가 채움), `lineChart`, `css`, `clamp(x,a,b)`, `pctRank`, `$`
- Produces: `drawMayer()`; `drawActiveChart` 디스패치에 `mayer` 키 추가

- [ ] **Step 1: 탭 버튼 추가**

`data-tab="vol"` 버튼 **뒤**에 추가:

```html
      <button class="tab" role="tab" aria-selected="false" data-tab="mayer">200주 배수</button>
```

- [ ] **Step 2: 패널 추가**

`data-panel="vol"` div **뒤**에 추가:

```html
    <div class="panel-chart" data-panel="mayer">
      <div class="chart-note">현재가 / 200주 이동평균 배수(메이어 멀티플). 밴드는 ETH 자체 분포 기준(저평가 하위 20%·과열 상위 20%). <span id="mayerStats" style="color:var(--muted)"></span></div>
      <canvas id="cvMayer"></canvas>
    </div>
```

- [ ] **Step 3: drawMayer() 추가**

`drawVol()` 뒤에 추가:

```js
function drawMayer(){
  const mh=(S.ma200&&S.ma200.hist)?S.ma200.hist:[];
  if(!mh.length){const e=$('#mayerStats');if(e)e.innerHTML='데이터 부족';lineChart($('#cvMayer'),[],{logY:false});return;}
  const sorted=[...mh].sort((a,b)=>a-b),q=p=>sorted[Math.floor(clamp(p,0,1)*(sorted.length-1))];
  const lo=q(0.20),hi=q(0.80);
  lineChart($('#cvMayer'),[
    {label:'과열(상위20%)',color:css('--bear'),values:mh.map(()=>hi),w:0.8,dash:[5,4]},
    {label:'저평가(하위20%)',color:css('--bull'),values:mh.map(()=>lo),w:0.8,dash:[5,4]},
    {label:'200주 배수',color:css('--gold'),values:mh,w:1.8}
  ],{logY:false});
  const cur=mh[mh.length-1],pr=pctRank(mh,cur);
  const lab=pr<0.2?'<span class="up">저평가</span>':pr>0.8?'<span class="down">과열</span>':'<span class="flat">중립</span>';
  const st=$('#mayerStats');if(st)st.innerHTML=`현재 <b style="color:var(--text)">${cur.toFixed(2)}×</b> · 분위 <b style="color:var(--text)">${Math.round(pr*100)}</b> ${lab}`;
}
```

- [ ] **Step 4: drawActiveChart() 디스패치에 mayer 추가 (최종형)**

교체:
```js
function drawActiveChart(){({season:drawHeatmap,cycle:drawCycle,band:drawBand,dd:drawDrawdown,halving:drawHalving,vol:drawVol,mayer:drawMayer}[activeTab]||(()=>{}))();}
```

- [ ] **Step 5: 검증**

```bash
cd /home/jschoi0223/projects/vdiportal
sed -n '/^<script>/,/^<\/script>/p' signal/scoopsignal.html | sed '1d;$d' > /tmp/ss-t4.js && node --check /tmp/ss-t4.js && echo "SYNTAX OK"
grep -c 'data-tab="mayer"\|id="cvMayer"\|function drawMayer\|mayer:drawMayer' signal/scoopsignal.html
```
Expected: `SYNTAX OK`; grep count 4.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 200주선 배수(메이어) 탭 추가\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: 방법론 문서 갱신 + 통합 헤드리스 검증 + 배포

**Files:** Modify `signal/scoopsignal.html`(method 본문)

- [ ] **Step 1: method 본문에 한 줄 추가**

method `.mbody`의 "주기 패턴" 관련 설명(데이터/구간 단락 인근)에 한 줄 추가. 예: 데이터 단락 뒤 또는 별도 `<p>`:

```html
      <p style="color:var(--faint)">주기 패턴 탭: 계절성·사이클/반감기 오버레이·로그 회귀 밴드·200주 배수·드로다운·실현 변동성 (모두 표시 전용, 점수 미반영).</p>
```

- [ ] **Step 2: 통합 헤드리스 검증**

```bash
cd /home/jschoi0223/projects/vdiportal/signal
sed -n '/^<script>/,/^<\/script>/p' scoopsignal.html | sed '1d;$d' > /tmp/ss-all.js && node --check /tmp/ss-all.js && echo "SYNTAX OK"
HS=~/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
export LD_LIBRARY_PATH=/tmp/sslibs/extract/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
python3 -m http.server 8077 >/tmp/sssrv.log 2>&1 & SRV=$!; sleep 1
"$HS" --headless --no-sandbox --virtual-time-budget=9000 --dump-dom http://localhost:8077/scoopsignal.html 2>/dev/null > /tmp/ss-dom.html
kill $SRV 2>/dev/null
echo "탭 수:"; grep -oE 'data-tab="[a-z]+"' /tmp/ss-dom.html | sort -u
echo "신규 통계 채움:"; for id in ddStats hvStats volStats mayerStats; do v=$(python3 -c "import re,sys;h=open('/tmp/ss-dom.html').read();m=re.search(r'id=\"$id\"[^>]*>(.*?)</',h,re.S);print(re.sub(r'<[^>]+>','',m.group(1)).strip()[:50] if m else 'MISSING')"); echo "  $id => $v"; done
```
Expected: `SYNTAX OK`; 7개 data-tab(season/cycle/band/dd/halving/vol/mayer); 4개 통계가 빈 문자열이 아닌 값(예: `현재 -XX% · 역대 최대 -YY%`). 콘솔 에러 없음. 헤드리스로 각 탭 캔버스 렌더가 더 필요하면 `--screenshot`도 가능.

> 주의: 드로다운/변동성 등은 활성 탭이 아니면 캔버스에 즉시 그려지지 않을 수 있다(클릭 시 그림). DOM 통계 텍스트는 활성 탭 전환 없이는 비어 있을 수 있으므로, 통계 검증이 비면 헤드리스에서 탭 클릭 스크립트 대신 `--screenshot`로 기본 활성 탭(계절성)만 확인하고, 나머지는 수동/스크린샷으로 확인한다. 최소 게이트는 `SYNTAX OK` + 7개 탭 존재 + 콘솔 에러 0.

- [ ] **Step 3: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 방법론에 주기 패턴 탭 4종 설명 추가\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 4: 배포 + push**

```bash
cd /home/jschoi0223/projects/vdiportal
PW=$(grep -oP 'PASS="\K[^"]+' ~/projects/park/deploy.sh)
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:$PW@parksvc.mycafe24.com; cd www/portal/signal; put signal/scoopsignal.html -o scoopsignal.html"
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://parksvc.mycafe24.com/portal/signal/scoopsignal.html
git push
```
Expected: 업로드 성공, HTTP 200, push 완료.

---

## Self-Review

**Spec coverage:**
- 설계 §1 아키텍처(탭 확장·디스패치 전환) → Task 1 ✅
- §2① 드로다운 → Task 1 ✅ / §2② 반감기 → Task 2 ✅ / §2③ 변동성 → Task 3 ✅ / §2④ 200주 배수 → Task 4 ✅
- §3 파라미터(VOL_WIN, 분위 0.2/0.8, 반감기 배열) → Task 3·4·2 ✅
- §4 method 본문 → Task 5 ✅
- §6 검증 → 각 Task Step 5 + Task 5 ✅ / §7 배포 → Task 5 ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. 검증 명령·기대값 구체. 자리표시 없음.

**Type consistency:** `drawDrawdown/drawHalving/drawVol/drawMayer` 이름이 디스패치 키와 일치. 캔버스 id(`cvDD/cvHalving/cvVol/cvMayer`)·통계 id(`ddStats/hvStats/volStats/mayerStats`)·data-tab/data-panel(`dd/halving/vol/mayer`)이 각 task의 HTML·JS·디스패치에서 정합. `S.ma200.hist`·`S.week.t/c`는 기존 `loadBinance` 산출물과 일치. `drawActiveChart` 디스패치는 task마다 전체형으로 교체(부분 참조 없음).

**탭 순서 메모:** 설계의 그룹 순서 대신 기존 3탭 뒤 append(dd→halving→vol→mayer). 기존 탭 위치 불변·구현 단순화를 위한 의도적 단순화(표시 순서는 기능 무관).
