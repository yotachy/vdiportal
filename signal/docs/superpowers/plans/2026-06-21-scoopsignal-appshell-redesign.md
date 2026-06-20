# ScoopSignal 앱셸 사이드바 리디자인 + 35% 스케일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** scoopsignal.html을 전체 35% 확대하고, 주기 패턴 탭을 좌측 사이드바 메뉴(현재값 배지 포함)로 옮긴 앱셸 레이아웃으로 재구성한다.

**Architecture:** `html{zoom:1.35}`로 균일 확대. 단일 중앙 컬럼(`.wrap`)을 `.app`(좌 사이드바 `aside.side` + 우 `main.main`) 2열 그리드로 감싼다. 기존 차트 탭 버튼 행을 제거하고, 사이드바의 `.snav-item`이 `selectPattern(tab)`으로 동일한 `activeTab`/`drawActiveChart()`를 구동한다. 각 메뉴 항목은 `updateSideBadges()`가 매 `recompute`마다 채우는 현재값 배지를 단다. 점수·게이지·데이터·차트 그리기 로직은 불변.

**Tech Stack:** 순수 HTML5·CSS3·바닐라 JS. 무빌드·무의존. 단일 파일 `signal/scoopsignal.html`.

## Global Constraints

- **단일 파일** — 모든 HTML/CSS/JS는 `signal/scoopsignal.html` 내부. 새 파일 금지.
- **무의존·무빌드·바닐라 JS.** 차트 라이브러리·프레임워크 금지.
- **새 네트워크 fetch 금지** — 전부 기존 `S`(S.week/S.month/S.band/S.ma200) 재사용.
- **디자인 토큰만** — 색은 `:root` CSS 변수(`--ink/--panel/--panel-2/--line/--text/--muted/--faint/--gold/--bull/--neutral/--bear`)와 기존 차트 hex 관례. 새 하드코딩 색 금지.
- **한국어 UI.** 들여쓰기 2 spaces, HTML 속성 큰따옴표.
- **점수/게이지/4축/차트 그리기 로직 불변** — 레이아웃·네비·배지만 추가/이동.
- **localStorage는 기존 `scoopsignal_cfg`만**(튜닝 전용). 활성 탭 영속화 안 함(기본 season).
- **검증은 브라우저 기반** — 테스트 러너 없음. `node --check`(신택스) + 헤드리스 렌더/스크린샷.
- **배포(완료 후, vdi-log 방식):** 커밋 → push → cafe24 SFTP `www/portal/signal/scoopsignal.html`(자격증명 `~/projects/park/deploy.sh`).

**기준 설계:** `signal/docs/superpowers/specs/2026-06-21-scoopsignal-appshell-redesign-design.md`

### 헤드리스 검증 스니펫 (구조 변경 태스크에서 사용)
```bash
cd /home/jschoi0223/projects/vdiportal/signal
sed -n '/^<script>/,/^<\/script>/p' scoopsignal.html | sed '1d;$d' > /tmp/ss-chk.js && node --check /tmp/ss-chk.js && echo "SYNTAX OK"
HS=~/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
export LD_LIBRARY_PATH=/tmp/sslibs/extract/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
python3 -m http.server 8088 >/tmp/sssrv.log 2>&1 & SRV=$!; sleep 1
"$HS" --headless --no-sandbox --window-size=1600,2400 --virtual-time-budget=11000 --screenshot=/tmp/ss-shot.png http://localhost:8088/scoopsignal.html 2>/dev/null
"$HS" --headless --no-sandbox --enable-logging=stderr --v=0 --virtual-time-budget=11000 --dump-dom http://localhost:8088/scoopsignal.html >/tmp/ss-dom.html 2>/tmp/ss-con.log
kill $SRV 2>/dev/null
grep -iE "uncaught|TypeError|ReferenceError|is not a function" /tmp/ss-con.log | head -5 || echo "(no console errors)"
```
스크린샷 `/tmp/ss-shot.png`를 Read로 육안 확인.

---

## File Structure

| 파일 | 변경 |
|---|---|
| `signal/scoopsignal.html` | 전 태스크에서 CSS/HTML/JS 수정 |

줄 번호는 작업 시점 grep으로 확인. 참고: `:root`/`html`(~12-22), `.wrap`(~25), `<header>`(~125-135), `.status`(~138-144), `.ticker`(~147-151), `.hero`(~154-185), `.dims`(~188-215), `.charts`/`.tabs`(~218-238), `details.tune`/`details.method`/`footer`(~240-262), 탭 클릭 핸들러(~720-730), 초기화 블록(끝부분).

---

### Task 1: 전역 35% 스케일 (CSS만)

**Files:** Modify `signal/scoopsignal.html` (CSS `html` 규칙 ~22, `.wrap` ~25)

**Interfaces:**
- Produces: `html{zoom:1.35}`; `.wrap` max-width 1180으로 상향(앱셸 컨테이너 전 임시).

- [ ] **Step 1: html에 zoom 추가**

기존:
```css
  html{-webkit-text-size-adjust:100%}
```
교체:
```css
  html{zoom:1.35;-webkit-text-size-adjust:100%}
```

- [ ] **Step 2: 컨테이너 max-width 상향**

기존 `.wrap{max-width:1000px;margin:0 auto}` 를:
```css
  .wrap{max-width:1180px;margin:0 auto}
```

- [ ] **Step 3: 검증**

```bash
cd /home/jschoi0223/projects/vdiportal
grep -n 'zoom:1.35' signal/scoopsignal.html && echo OK
```
Expected: `zoom:1.35` 1건. (헤드리스 스크린샷으로 확대 육안 확인 가능 — 위 스니펫.)

- [ ] **Step 4: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 전역 35%% 확대(zoom 1.35) + 컨테이너 폭 상향\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: 앱셸 2열 골격 (사이드바 셸 + 메인 래핑)

기존 본문을 건드리지 않고 `.app`(좌 `aside.side` + 우 `main.main`)로 감싼다. 사이드바엔 브랜드만(나머지 이동은 Task 3). 기존 탭/차트는 그대로 동작.

**Files:** Modify `signal/scoopsignal.html` (CSS 추가, `<body>` 구조)

**Interfaces:**
- Produces: `.app`/`.side`/`.main` 레이아웃; `aside.side`(브랜드). 기존 `.wrap` 내용은 `main.main`으로 이동.

- [ ] **Step 1: 앱셸 CSS 추가**

`<style>` 안, 미디어쿼리(`@media(max-width:880px)`) **앞**에 추가:
```css
  /* app shell */
  .app{display:grid;grid-template-columns:248px 1fr;gap:18px;max-width:1180px;margin:0 auto;align-items:start}
  .main{min-width:0}
  .side{position:sticky;top:14px;align-self:start;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 14px;display:flex;flex-direction:column;gap:14px}
  .side-brand .eyebrow{font-size:10px}
  .side-brand h1{font-size:19px;font-weight:800;letter-spacing:-.01em;margin-top:3px}
  .side-brand h1 .em{color:var(--gold)}
  .side-brand p{font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.45}
```

- [ ] **Step 2: body를 앱셸로 재구성**

현재 구조는 `<div class="wrap"> <header>…</header> …본문… </div>`. 다음과 같이 바꾼다:
1. 여는 `<div class="wrap">` 를 다음으로 교체:
```html
<div class="app">
  <aside class="side">
    <div class="side-brand">
      <div class="eyebrow">머니스쿱 · ETH 신호 엔진 v2</div>
      <h1>스쿱<span class="em">시그널</span></h1>
      <p>가격·온체인·유동성·사이클을 4축으로 점수화하고 주기 패턴까지 한 화면에서.</p>
    </div>
  </aside>
  <main class="main wrap">
```
   (즉 `.app` 안에 `aside.side` 추가 + 기존 본문은 `main.main.wrap`로 감싼다. `.wrap` 클래스를 main에 유지해 max-width 무효 — 실제 폭은 `.app` 그리드가 결정하므로 `.main`은 `min-width:0`로 충분. `.wrap` 클래스는 떼도 무방하나 유지해도 그리드 셀 안이라 영향 적음. 안전하게 **`class="main"`만** 사용 권장: 위 코드대로 `class="main wrap"` 대신 `class="main"`으로.)
   → 최종: `<main class="main">`
2. 본문 맨 끝(기존 `</div>` = wrap 닫힘, `<footer>` 다음, `<script src>` 앞)을 `</main>\n</div>` 로 교체(즉 main 닫고 app 닫기).

- [ ] **Step 3: 검증 (헤드리스 스크린샷 필수)**

위 "헤드리스 검증 스니펫" 실행. `/tmp/ss-shot.png` 확인.
Expected: 좌측에 브랜드가 든 패널(사이드바), 우측에 기존 대시보드(티커·게이지·카드·차트) 2열 표시. 콘솔 에러 0. 기존 탭/차트 정상.

- [ ] **Step 4: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 앱셸 2열 골격(사이드바+메인) 도입\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: 사이드바 패턴 네비 + 새로고침/시각 이동 + 탭 제거

사이드바에 주기 패턴 7개 메뉴(그룹 2개) + 새로고침·업데이트시각을 넣고, 기존 `.tabs` 버튼 행과 그 클릭 핸들러를 제거하여 `selectPattern()`으로 대체한다.

**Files:** Modify `signal/scoopsignal.html` (CSS, 사이드바 HTML, `.tabs` HTML, JS 핸들러/초기화)

**Interfaces:**
- Consumes: `activeTab`, `drawActiveChart()`, `S.month`, `$`
- Produces: `.snav` 마크업(`.snav-item[data-tab]` × 7), `selectPattern(tab)`; 기존 `.tabs` 행/`.tab` 바인딩 제거.

- [ ] **Step 1: 사이드바 네비 CSS 추가**

Task 2의 앱셸 CSS 아래에 추가:
```css
  .side .upd{display:flex;flex-direction:column;gap:8px}
  .side .upd #updatedAt{font-family:var(--mono);font-size:10.5px;color:var(--faint)}
  .snav{display:flex;flex-direction:column;gap:3px}
  .snav-group{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:10px 2px 3px}
  .snav-item{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 10px;border-radius:9px;cursor:pointer;border:1px solid transparent;background:none;color:var(--muted);font:inherit;font-size:13px;text-align:left;width:100%;transition:background .15s,color .15s}
  .snav-item:hover{background:var(--panel-2);color:var(--text)}
  .snav-item.on{background:var(--panel-2);color:var(--text);border-color:var(--line);box-shadow:inset 3px 0 0 var(--gold)}
  .snav-item .snav-badge{font-family:var(--mono);font-size:11px;color:var(--muted);white-space:nowrap}
```

- [ ] **Step 2: 사이드바에 갱신영역 + 네비 추가**

`aside.side` 안 `.side-brand` div **뒤**에 추가:
```html
    <div class="upd">
      <button class="refresh" id="refreshBtn" type="button"><span class="dot"></span>새로고침</button>
      <span id="updatedAt">불러오는 중…</span>
    </div>
    <nav class="snav" aria-label="주기 패턴">
      <div class="snav-group">사이클</div>
      <button class="snav-item on" data-tab="season">계절성 <span class="snav-badge">—</span></button>
      <button class="snav-item" data-tab="cycle">사이클 오버레이 <span class="snav-badge">—</span></button>
      <button class="snav-item" data-tab="halving">반감기 <span class="snav-badge">—</span></button>
      <div class="snav-group">밸류·리스크</div>
      <button class="snav-item" data-tab="band">로그 밴드 <span class="snav-badge">—</span></button>
      <button class="snav-item" data-tab="mayer">200주 배수 <span class="snav-badge">—</span></button>
      <button class="snav-item" data-tab="dd">드로다운 <span class="snav-badge">—</span></button>
      <button class="snav-item" data-tab="vol">변동성 <span class="snav-badge">—</span></button>
    </nav>
```

- [ ] **Step 3: 기존 header 잔재 정리 (refresh/updated 중복 제거)**

Task 2에서 `<header>`를 제거하지 않았다면, 기존 `<header>…</header>` 블록(브랜드+`.updated`(updatedAt/refreshBtn) 포함)이 main 안에 남아 있다. 이 `<header>…</header>` 블록 **전체를 삭제**한다(브랜드·새로고침·업데이트시각은 사이드바로 이동 완료). `#refreshBtn`/`#updatedAt` id가 **사이드바에만 1개씩** 남도록 한다.

- [ ] **Step 4: `.charts`의 탭 버튼 행 제거**

`.charts` 섹션 안의 탭 행:
```html
    <div class="tabs" role="tablist">
      <button class="tab" ... data-tab="season">계절성</button>
      ... (7개)
    </div>
```
이 `<div class="tabs">…</div>` 블록 **전체를 삭제**한다. (패널 `.panel-chart`들은 유지.) `.charts` 상단 `.sec-head`(제목 "주기 패턴")는 유지.

- [ ] **Step 5: selectPattern() 추가 + 사이드바 바인딩, 기존 탭 핸들러 제거**

기존 탭 클릭 핸들러(아래 형태)를 찾는다:
```js
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected','false'));
  b.setAttribute('aria-selected','true');activeTab=b.dataset.tab;
  document.querySelectorAll('.panel-chart').forEach(p=>p.classList.toggle('active',p.dataset.panel===activeTab));
  if(S.month)drawActiveChart();
}));
```
이를 다음으로 **교체**:
```js
function selectPattern(tab){
  activeTab=tab;
  document.querySelectorAll('.snav-item').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  document.querySelectorAll('.panel-chart').forEach(p=>p.classList.toggle('active',p.dataset.panel===tab));
  if(S.month)drawActiveChart();
}
document.querySelectorAll('.snav-item').forEach(b=>b.addEventListener('click',()=>selectPattern(b.dataset.tab)));
```
(주의: `panel-chart` 중 `data-panel="season"`이 기본 `active`인지 확인. 기존 마크업에서 season 패널이 `class="panel-chart active"`면 그대로 두고, 사이드바 season 항목도 `.on`이어야 함 — Step 2에서 season에 `on` 부여함.)

- [ ] **Step 6: 검증 (헤드리스 스크린샷 + 탭 전환 스모크)**

"헤드리스 검증 스니펫" 실행 후, 사이드바 7개 항목 표시 + 콘솔 에러 0 확인. 추가로 임시 사본으로 전환 스모크:
```bash
cd /home/jschoi0223/projects/vdiportal/signal
python3 - <<'PY'
s=open('scoopsignal.html').read()
inj="<script>window.addEventListener('load',function(){setTimeout(function(){try{['dd','mayer','vol','halving','cycle','band','season'].forEach(function(t){selectPattern(t);});document.title='NAV-OK';}catch(e){document.title='ERR:'+e.message;}},5000);});</script>\n</body>"
open('_t.html','w').write(s.replace('</body>',inj,1))
PY
HS=~/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
export LD_LIBRARY_PATH=/tmp/sslibs/extract/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
python3 -m http.server 8089 >/tmp/s.log 2>&1 & SRV=$!; sleep 1
"$HS" --headless --no-sandbox --virtual-time-budget=14000 --dump-dom http://localhost:8089/_t.html 2>/dev/null | grep -oE '<title>[^<]*</title>'
kill $SRV 2>/dev/null; rm -f _t.html
```
Expected: `<title>NAV-OK</title>` (selectPattern으로 7개 전환 모두 throw 없음). `.tabs`/`.tab` 잔재 없음: `grep -c 'class="tabs"\|class="tab "' scoopsignal.html` → 0.

- [ ] **Step 7: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 주기 패턴을 좌측 사이드바 네비로 이전(탭 행 제거)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: 사이드바 현재값 배지

`updateSideBadges()`로 7개 항목 배지를 채우고 `recompute()` 끝에서 호출.

**Files:** Modify `signal/scoopsignal.html` (JS: 함수 추가 + recompute 호출)

**Interfaces:**
- Consumes: `S.month`,`S.week`,`S.band`,`S.ma200`, `pctRank`, `VOL_WIN`, `$`
- Produces: `setBadge(tab,txt,sig)`, `updateSideBadges()`; `recompute()` 끝에서 호출.

- [ ] **Step 1: setBadge + updateSideBadges 추가**

`recompute` 함수 **앞**(또는 draw 함수들 뒤)에 추가:
```js
function setBadge(tab,txt,sig){const e=document.querySelector('.snav-item[data-tab="'+tab+'"] .snav-badge');if(!e)return;e.textContent=txt;e.style.color='var(--'+(sig||'muted')+')';}
function updateSideBadges(){
  // 계절성: 이번 달 과거 평균 수익률
  if(S.month&&S.month.c&&S.month.c.length>2){const t=S.month.t,c=S.month.c,mo=new Date(t[t.length-1]).getUTCMonth();let s=0,n=0;for(let i=1;i<c.length;i++){if(new Date(t[i]).getUTCMonth()===mo){s+=(c[i]/c[i-1]-1)*100;n++;}}const a=n?s/n:0;setBadge('season',(a>=0?'+':'')+a.toFixed(1)+'%',a>=0?'bull':'bear');}else setBadge('season','—','muted');
  // 사이클: 바닥(2022-06-18) 후 N주 / 반감기: 2024-04-20 후 N주
  const wk=S.week&&S.week.t&&S.week.t.length?S.week.t:null;
  const nearW=tt=>{let bi=0,bd=1e18;for(let i=0;i<wk.length;i++){const d=Math.abs(wk[i]-tt);if(d<bd){bd=d;bi=i;}}return wk.length-1-bi;};
  if(wk){setBadge('cycle',nearW(Date.parse('2022-06-18'))+'주','muted');setBadge('halving',nearW(Date.parse('2024-04-20'))+'주','muted');}else{setBadge('cycle','—','muted');setBadge('halving','—','muted');}
  // 로그 밴드: z
  if(S.band&&isFinite(S.band.z)){const z=S.band.z;setBadge('band','z='+(z>=0?'+':'')+z.toFixed(1)+'σ',z>0.7?'bear':z<-0.7?'bull':'muted');}else setBadge('band','—','muted');
  // 200주 배수
  if(S.ma200&&isFinite(S.ma200.mult)){const m=S.ma200.mult,pr=S.ma200.hist?pctRank(S.ma200.hist,m):0.5;setBadge('mayer',m.toFixed(2)+'×',pr>0.8?'bear':pr<0.2?'bull':'muted');}else setBadge('mayer','—','muted');
  // 드로다운: 현재 낙폭
  if(S.week&&S.week.c&&S.week.c.length){const c=S.week.c;let pk=-Infinity,last=0;for(const v of c){if(v>pk)pk=v;last=(v/pk-1)*100;}setBadge('dd',last.toFixed(0)+'%',last<-50?'bear':last>-15?'bull':'muted');}else setBadge('dd','—','muted');
  // 변동성: 현재 실현 변동성
  if(S.week&&S.week.c&&S.week.c.length>VOL_WIN+1){const c=S.week.c,r=[];for(let i=1;i<c.length;i++)r.push(Math.log(c[i]/c[i-1]));let m=0;for(let j=r.length-VOL_WIN;j<r.length;j++)m+=r[j];m/=VOL_WIN;let s=0;for(let j=r.length-VOL_WIN;j<r.length;j++)s+=(r[j]-m)*(r[j]-m);const v=Math.sqrt(s/VOL_WIN)*Math.sqrt(52)*100;setBadge('vol',v.toFixed(0)+'%','muted');}else setBadge('vol','—','muted');
}
```
(주: `VOL_WIN`은 Task(이전 기능)에서 선언된 전역 상수. 배지는 각 패턴의 최신 스칼라만 가볍게 계산 — draw 함수와 일부 산식 중복이나 의도적 단순화.)

- [ ] **Step 2: recompute에서 호출**

`recompute()` 함수 본문 **맨 끝**(마지막 줄, `if(S.month)drawActiveChart();` 부근) 뒤에 추가:
```js
  updateSideBadges();
```

- [ ] **Step 3: 검증 (배지 채움 확인)**

"헤드리스 검증 스니펫"의 dump-dom 부분으로 배지 확인:
```bash
cd /home/jschoi0223/projects/vdiportal/signal
HS=~/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
export LD_LIBRARY_PATH=/tmp/sslibs/extract/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
python3 -m http.server 8090 >/tmp/s2.log 2>&1 & SRV=$!; sleep 1
"$HS" --headless --no-sandbox --virtual-time-budget=12000 --dump-dom http://localhost:8090/scoopsignal.html 2>/dev/null > /tmp/ss-dom.html
kill $SRV 2>/dev/null
python3 - <<'PY'
import re;h=open('/tmp/ss-dom.html').read()
for tab in ['season','cycle','halving','band','mayer','dd','vol']:
  m=re.search(r'data-tab="%s"[^>]*>(.*?)</button>'%tab,h,re.S)
  t=re.sub(r'<[^>]+>',' ',m.group(1)).strip() if m else 'MISSING'
  print(tab,'=>',t[:40])
PY
```
Expected: 각 항목 배지가 `—`가 아닌 값(예: season `+2.1%`, mayer `0.70×`, dd `-63%`, vol `45%`, band `z=...σ`, cycle/halving `NN주`). (Binance 차단 환경이면 `—`일 수 있음 — 그땐 콘솔 에러 0 + 신택스만 게이트.)

- [ ] **Step 4: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 사이드바 패턴별 현재값 배지(updateSideBadges)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: 데이터 소스 상태등 사이드바 이동 + 반응형 + 방법론 한 줄

**Files:** Modify `signal/scoopsignal.html` (CSS 반응형, `.status` 위치, method 본문)

**Interfaces:**
- Consumes: 기존 `.status`/`#st-*` 마크업
- Produces: `.side-foot`에 상태등; `@media` 1열 스택 + 네비 그리드

- [ ] **Step 1: 상태등을 사이드바 하단으로 이동**

기존 메인 안의 `.status` 블록(아래) 전체를 잘라 사이드바 `aside.side`의 **맨 끝**(`</aside>` 직전)으로 이동하고, 바깥을 `.side-foot`로 감싼다:
```html
    <div class="side-foot">
      <div class="status" id="status">
        <span class="s"><i id="st-binance"></i>Binance 가격·사이클</span>
        <span class="s"><i id="st-llama"></i>DeFiLlama 온체인</span>
        <span class="s"><i id="st-fx"></i>Frankfurter 달러</span>
        <span class="s"><i id="st-fred"></i>FRED 매크로</span>
        <span class="s"><i id="st-beacon"></i>스테이킹</span>
      </div>
    </div>
```
(원래 위치의 `.status` 블록은 제거. id `status`/`st-*`는 사이드바에 1개씩만.)

- [ ] **Step 2: 사이드바 푸터/상태 CSS**

CSS에 추가:
```css
  .side-foot{margin-top:auto;padding-top:12px;border-top:1px solid var(--line)}
  .side-foot .status{flex-direction:column;align-items:flex-start;gap:7px;background:none;border:none;border-radius:0;padding:0;margin:0;font-size:10.5px}
```
(`.status`의 기존 규칙은 유지하되 사이드바 안에서 위 오버라이드가 세로 정렬로 바꾼다.)

- [ ] **Step 3: 반응형 — 좁은 화면에서 사이드바 상단 스택 + 네비 그리드**

기존 `@media(max-width:880px)` 규칙 **앞**(또는 함께)에 추가:
```css
  @media(max-width:900px){
    .app{grid-template-columns:1fr}
    .side{position:static}
    .snav{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .snav-group{grid-column:1/-1}
  }
```

- [ ] **Step 4: 방법론 본문 한 줄**

method `.mbody`에 한 줄 추가(주기 패턴이 사이드바로 이동했음을 안내):
```html
      <p style="color:var(--faint)">주기 패턴(계절성·사이클/반감기 오버레이·로그밴드·200주배수·드로다운·변동성)은 좌측 사이드바에서 선택하며, 각 항목 옆 배지는 현재값입니다.</p>
```

- [ ] **Step 5: 검증 (헤드리스 스크린샷 — 데스크탑 + 모바일 폭)**

"헤드리스 검증 스니펫" 실행(데스크탑 1600폭). 추가로 모바일 폭:
```bash
cd /home/jschoi0223/projects/vdiportal/signal
HS=~/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
export LD_LIBRARY_PATH=/tmp/sslibs/extract/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
python3 -m http.server 8091 >/tmp/s3.log 2>&1 & SRV=$!; sleep 1
"$HS" --headless --no-sandbox --window-size=560,2600 --virtual-time-budget=11000 --screenshot=/tmp/ss-mobile.png http://localhost:8091/scoopsignal.html 2>/dev/null
kill $SRV 2>/dev/null
```
Read로 `/tmp/ss-shot.png`(사이드바 하단 상태등) + `/tmp/ss-mobile.png`(사이드바 상단 스택·네비 2열) 확인. 콘솔 에러 0.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal && git add signal/scoopsignal.html && \
git commit -m "$(printf 'ScoopSignal: 상태등 사이드바 이동 + 반응형 + 방법론 안내\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: 통합 헤드리스 검증 + 배포

**Files:** 없음(검증/배포)

- [ ] **Step 1: 통합 검증**

"헤드리스 검증 스니펫"(데스크탑) + Task 3 Step 6의 NAV-OK 스모크 + Task 4 Step 3의 배지 확인을 모두 재실행.
Expected: `SYNTAX OK`, `NAV-OK`, 배지 7개 값, 콘솔 에러 0. 스크린샷으로 35% 확대된 앱셸(좌 사이드바 네비+배지, 우 요약·차트) 육안 확인.

- [ ] **Step 2: 배포 + push**

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
- §1 35% 스케일 → Task 1 ✅
- §2 앱셸 레이아웃(사이드바+메인) → Task 2·3 ✅
- §2.1 사이드바(브랜드·갱신·네비·상태등) → Task 2(브랜드)·3(갱신·네비)·5(상태등) ✅
- §3 동작(selectPattern, 탭 제거) → Task 3 ✅
- §4 현재값 배지 → Task 4 ✅
- §5 반응형 → Task 5 ✅
- §8 검증 → 각 Task + Task 6 ✅ / §9 배포 → Task 6 ✅

**메인 콘텐츠 순서 메모:** 스펙 §2.2는 패턴 차트를 4카드보다 위에 두지만, 본 계획은 기존 마크업 순서(hero→dims→charts)를 보존해 리스크를 줄였다(패턴은 사이드바로 또렷이 부각되므로 본문 순서 재배치는 비필수 — 의도적 단순화). 순서 변경을 원하면 후속 태스크로 `.charts` 블록을 `.dims` 앞으로 이동.

**Placeholder scan:** 모든 코드 스텝에 실제 코드. 검증 명령·기대값 구체. 자리표시 없음.

**Type consistency:** `selectPattern(tab)`/`updateSideBadges()`/`setBadge(tab,txt,sig)` 이름 일관. `.snav-item[data-tab]` 값(season/cycle/halving/band/mayer/dd/vol)이 `.panel-chart[data-panel]`·`drawActiveChart` 디스패치 키와 정합. `#refreshBtn`/`#updatedAt`/`#status`/`#st-*` id는 이동 후 **단일** 유지(중복 금지 — Task 3 Step 3, Task 5 Step 1). `VOL_WIN`·`pctRank`·`S.*`는 기존 정의 재사용.
