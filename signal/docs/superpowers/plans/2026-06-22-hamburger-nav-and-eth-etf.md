# 모바일 햄버거 네비 + 컴팩트 + ETH ETF 발행사별 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ≤900px에서 사이드바를 햄버거 off-canvas 드로어로 바꾸고(가로 pill 제거), 사이드 항목을 컴팩트화하며, ETH 현물 ETF 발행사별 뷰를 cafe24 PHP 프록시(`etf.php`)로 추가한다.

**Architecture:** Part A는 `scoopsignal.html` 프론트(≤900px 미디어쿼리 교체 + 햄버거 JS). Part B는 신규 `signal/etf.php`(cafe24 서버에서 Farside 파싱→CORS JSON)와 프론트 `loadEtf()`/`etf` 뷰. 점수 산식·기존 지표 불변, 그레이스풀.

**Tech Stack:** 순수 HTML5·CSS3·Vanilla JS + PHP(cafe24, 프록시 1파일). 외부: Farside(서버 사이드 fetch).

## Global Constraints

- 단일 프론트 파일 `signal/scoopsignal.html` + 신규 `signal/etf.php`만. 디자인 토큰만. `html{zoom:1.35}` 유지. 한국어. 2 spaces, 압축형.
- 점수 산식·`recompute()` 계산부·뷰 라우터 골격·기존 지표 불변. 신규는 표시전용.
- 좌측 컬러바 금지(햄버거는 버튼, 아이콘은 면).
- cafe24: jsiy 등 **기존 서버 파일·데이터 불가침** — `etf.php`만 추가. 정적 출력에 `<?` 리터럴 금지(WAF 500 회피, etf.php는 실행 PHP라 무관).
- 그레이스풀: etf.php 미배포/실패 → etf 뷰 "연결 필요", 나머지·점수 정상. 기존 `lerp/clamp/$/setBadge/setStatus/jget` 재사용.

**검증 방식:** 정적 HTML + 헤드리스. **Part A는 모바일(390px)·데스크톱(1280px) 헤드리스로 검증**. **Part B 프록시는 cafe24 배포 후 라이브 `curl`로 검증**(로컬엔 etf.php 부재라 "연결 필요"만). chrome `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome` via `require(".../playwright-core")`, `LD_LIBRARY_PATH=/tmp/chrlibs node`. Binance 차단으로 한국 시뮬 권장.

---

## File Structure

- Modify: `signal/scoopsignal.html`
  - Task 1: 헤더 햄버거 버튼·백드롭, ≤900px 미디어쿼리 교체(드로어), `.snav-item` 컴팩트, 햄버거 JS.
  - Task 2: 사이드 `etf` 항목(아이콘)·`etf` 뷰·CHART_TIER, `loadEtf()`·`renderEtf()`·refresh/배지.
- Create: `signal/etf.php` (Task 3) — cafe24 프록시.

---

### Task 1: 햄버거 드로어 (≤900px) + 컴팩트 항목

**Files:** Modify `signal/scoopsignal.html` (헤더 마크업, `<style>` ≤900px 블록·`.hamb`·`.side-backdrop`, `.snav-item` 컴팩트, script 토글)

**Interfaces:**
- Consumes: 기존 `.top-bar`/`.side`/`.snav`/`.snav-item`, `$`.
- Produces: `#hambBtn`·`#sideBackdrop`, `openSide(o)` 토글(드로어 열고닫기 + body 스크롤 잠금).

- [ ] **Step 1: 햄버거 버튼 + 백드롭 마크업**

`<header class="top-bar">` 바로 다음 줄(`.tb-left` 앞)에 햄버거 버튼 추가:
```html
  <button class="hamb" id="hambBtn" type="button" aria-label="메뉴 열기" aria-expanded="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg></button>
```
그리고 `</header>` 바로 다음 줄에 백드롭 추가:
```html
<div class="side-backdrop" id="sideBackdrop"></div>
```

- [ ] **Step 2: CSS — .hamb + 컴팩트 항목**

`<style>`의 `.top-bar` 규칙 근처에 추가:
```css
  .hamb{display:none;align-items:center;justify-content:center;width:38px;height:38px;border-radius:9px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);cursor:pointer;flex:0 0 auto;margin-right:6px}
  .hamb:hover{border-color:var(--gold);color:var(--gold)}
  .hamb:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
```
그리고 기존 `.snav-item{...padding:6px 9px...font-size:12.5px...}` 규칙을 컴팩트하게 교체(패딩·폰트 축소):
```css
  .snav-item{display:flex;justify-content:space-between;align-items:center;gap:7px;padding:5px 9px;border-radius:8px;cursor:pointer;border:1px solid transparent;background:none;color:var(--muted);font:inherit;font-size:12px;text-align:left;width:100%;transition:background .15s,color .15s}
```
기존 `.snav-ic{width:15px;height:15px;...}`를 `width:14px;height:14px`로 축소:
```css
  .snav-ic{width:14px;height:14px;flex:0 0 auto;display:inline-flex;color:inherit}
```

- [ ] **Step 3: ≤900px 미디어쿼리 교체(가로 pill → 드로어)**

기존 `@media(max-width:900px){ … }` 블록 전체(`.top-bar` static / `.side` 가로 / `.snav` 가로 스크롤 / `.snav-group` 숨김 / pill `.snav-item` / `.snav-badge` 숨김 / `.side-foot` 숨김)를 아래로 **교체**한다:
```css
  @media(max-width:900px){
    .top-bar{position:static;margin-bottom:0}
    .app{grid-template-columns:1fr;gap:14px}
    .hamb{display:inline-flex}
    .side{position:fixed;left:0;top:0;height:100vh;width:280px;max-width:84vw;z-index:40;border-radius:0;border:none;border-right:1px solid var(--line);background:var(--panel);margin:0;padding:16px 14px;overflow-y:auto;transform:translateX(-100%);transition:transform .25s ease}
    .side.open{transform:none}
    .side-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:39;opacity:0;visibility:hidden;transition:opacity .25s}
    .side-backdrop.show{opacity:1;visibility:visible}
  }
```
(드로어 안에서는 `.snav`/`.snav-group`/`.snav-item`/`.snav-badge`/`.side-foot`가 데스크톱 기본 = 세로 리스트로 그대로 보임 — 별도 오버라이드 불필요.)

- [ ] **Step 4: 햄버거 토글 JS**

스크립트 하단의 이벤트 바인딩부(`document.querySelectorAll('.snav-item').forEach(...)` 근처)에 추가:
```js
const sideEl=document.querySelector('.side'),hambBtn=$('#hambBtn'),sideBk=$('#sideBackdrop');
function openSide(o){if(!sideEl)return;sideEl.classList.toggle('open',o);if(sideBk)sideBk.classList.toggle('show',o);if(hambBtn)hambBtn.setAttribute('aria-expanded',o?'true':'false');document.body.style.overflow=o?'hidden':'';}
if(hambBtn)hambBtn.addEventListener('click',()=>openSide(!sideEl.classList.contains('open')));
if(sideBk)sideBk.addEventListener('click',()=>openSide(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape')openSide(false);});
document.querySelectorAll('.snav-item').forEach(b=>b.addEventListener('click',()=>{if(window.matchMedia('(max-width:900px)').matches)openSide(false);}));
```

- [ ] **Step 5: 검증 — 드로어/컴팩트/데스크톱**

헤드리스 390px(isMobile):
```js
// 닫힘 초기상태
({hambVisible:getComputedStyle(document.querySelector('.hamb')).display!=='none', sideOffscreen:document.querySelector('.side').getBoundingClientRect().x< -50})
// 햄버거 클릭 → 열림
document.querySelector('#hambBtn').click();
({open:document.querySelector('.side').classList.contains('open'), backdrop:document.querySelector('#sideBackdrop').classList.contains('show'), sideX:Math.round(document.querySelector('.side').getBoundingClientRect().x)})
// 기대: 초기 hambVisible:true·오프스크린, 클릭 후 open:true·backdrop:true·sideX≈0
```
- 항목 클릭 시 드로어 닫힘, 백드롭 클릭/ESC 닫힘. 스크린샷(열린 드로어 = 세로 네비 + 그룹 + 상태 푸터, 백드롭).
- 1280px: 햄버거 `display:none`, 사이드바 고정(2열) 무변화. 가로 pill 없음(`.snav` flex-direction column). 항목 높이 더 낮아짐 육안.
- 콘솔 JS 에러 0.

- [ ] **Step 6: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: 모바일 햄버거 드로어 네비(가로 pill 대체) + 사이드 항목 컴팩트화

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: ETF 뷰 프론트 (etf 항목·뷰·loadEtf·renderEtf)

**Files:** Modify `signal/scoopsignal.html` (사이드 nav, 뷰, CHART_TIER, script loader/render/refresh/badge)

**Interfaces:**
- Consumes: 기존 `.snav-main`/`.snav-ic`/`.ob-bar`/`.page-head`, `jget`/`setStatus`/`clamp`/`$`/`setBadge`, `CHART_TIER`, `applyTierBadges`.
- Produces: `S.etf={total,unit,issuers,asOf}|null`, `loadEtf()`, `renderEtf()`, `etf` 뷰. `ETF_PROXY` 상수.

- [ ] **Step 1: ETF_PROXY 상수 + loadEtf()**

`loadTreasury` 근처 뒤에 추가:
```js
const ETF_PROXY='./etf.php';   // cafe24 동일 호스트 프록시(Task 3 배포). 로컬엔 없음 → 디그레이드.
async function loadEtf(){
  if(S.etf&&S._etfAt&&(Date.now()-S._etfAt)<1200000){setStatus('etf','ok');return;}
  try{
    const j=await jget(ETF_PROXY);
    if(!j||!Array.isArray(j.issuers))throw new Error('no etf');
    S.etf={total:+j.total||null,unit:j.unit||'usd',asOf:j.asOf||'',issuers:j.issuers.filter(x=>x&&x.name)};
    S._etfAt=Date.now();setStatus('etf','ok');
  }catch(e){S.etf=null;setStatus('etf','warn');}
}
```

- [ ] **Step 2: refresh allSettled + 상태 + 사이드 항목 + 뷰 + CHART_TIER**

(a) `refresh()` allSettled에 `loadEtf()` 추가:
```js
  const r=await Promise.allSettled([loadUpbit(),loadLlama(),loadDollar(),loadFred(),loadBeacon(),loadCoinGecko(),loadUltrasound(),loadTreasury(),loadEtf()]);
```
(b) 상태 푸터 `<span class="s"><i id="st-treasury"></i>기관</span>` 다음에:
```html
        <span class="s"><i id="st-etf"></i>ETF</span>
```
(c) 사이드 nav에서 `data-view="squeeze"` 항목 다음(같은 "기관·플로우" 그룹, `</nav>` 앞)에:
```html
      <button class="snav-item" data-view="etf"><span class="snav-main"><span class="snav-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.4" fill="currentColor" fill-opacity=".4"/><rect x="6" y="12" width="2.4" height="4" fill="currentColor"/><rect x="10.8" y="9.5" width="2.4" height="6.5" fill="currentColor"/><rect x="15.6" y="11" width="2.4" height="5" fill="currentColor"/></svg></span>ETF 발행사별</span> <span class="snav-badge">—</span></button>
```
(d) `data-view="squeeze"` 뷰 섹션 다음(`</main>` 앞)에 뷰 추가:
```html
  <section class="view" data-view="etf">
    <div class="page-head"><h2>ETH ETF 발행사별</h2><p class="page-sub">BlackRock·Fidelity·Grayscale·ARK 등 이더리움 현물 ETF 발행사별 순자산/유입(Farside, cafe24 프록시). <span id="etfStats" style="color:var(--muted)"></span></p></div>
    <div class="ob-bars" id="etfList"></div>
  </section>
```
(e) `CHART_TIER`의 `...squeeze:'signature'`를 `squeeze:'signature', etf:'basic'`로(끝 쉼표 + 추가):
```js
  treasury:'basic', trigger:'signature', squeeze:'signature', etf:'basic'
```

- [ ] **Step 3: renderEtf() + recompute + 배지**

`renderTreasury` 근처에 추가:
```js
function renderEtf(){
  const st=$('#etfStats'),li=$('#etfList');if(!st&&!li)return;
  if(!S.etf||!S.etf.issuers.length){if(st)st.innerHTML='연결 필요 (etf.php 배포 후)';if(li)li.innerHTML='';return;}
  const e=S.etf,unit=e.unit==='eth'?' ETH':'',pfx=e.unit==='eth'?'':'$';
  if(st&&e.total!=null)st.innerHTML=`총 <b style="color:var(--text)">${pfx}${(e.total/(e.unit==='eth'?1e6:1e9)).toFixed(2)}${e.unit==='eth'?'M ETH':'B'}</b>${e.asOf?` · ${e.asOf} 기준`:''}`;
  const mx=Math.max(1,...e.issuers.map(x=>Math.abs(+x.value||0)));
  if(li)li.innerHTML=e.issuers.slice(0,14).map(x=>{const v=+x.value||0,f=x.flow1d;const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');return `<div class="ob-bar"><span title="${esc(x.name)}">${esc(x.name).slice(0,18)}</span><span class="bar"><i style="width:${clamp(Math.abs(v)/mx*100,2,100)}%;background:var(--gold)"></i></span><span class="num">${pfx}${Math.round(v).toLocaleString()}${unit}${f!=null?` <span class="${f>=0?'up':'down'}">${f>=0?'+':''}${Math.round(f).toLocaleString()}</span>`:''}</span></div>`;}).join('');
}
```
recompute()의 `renderTreasury();renderTriggers();renderSqueeze();` 줄에 `renderEtf();` 추가:
```js
  renderTreasury();renderTriggers();renderSqueeze();renderEtf();
```
updateSideBadges() 끝에 etf 배지 추가:
```js
  if(S.etf&&S.etf.total!=null)setBadge('etf',(S.etf.unit==='eth'?(S.etf.total/1e6).toFixed(1)+'M':'$'+(S.etf.total/1e9).toFixed(1)+'B'),'muted');else setBadge('etf','—','muted');
```

- [ ] **Step 4: 검증 — 프론트(프록시 없이 디그레이드)**

로컬 헤드리스(etf.php 없음 → "연결 필요"):
```js
({nav:!!document.querySelector('.snav-item[data-view="etf"]'), view:!!document.querySelector('.view[data-view="etf"]'), tier:!!document.querySelector('.view[data-view="etf"] .tier-basic')})
// 기대: nav:true, view:true, tier:true(applyTierBadges 후 Basic)
```
- `showView('etf')` → "연결 필요 (etf.php 배포 후)" 표시(로컬은 정상). 기존 점수·차트·다른 뷰 회귀 0, JS 에러 0. (실제 데이터는 Task 3 라이브에서.)

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/scoopsignal.html
git commit -m "ScoopSignal: ETF 발행사별 뷰 프론트(loadEtf/renderEtf, ./etf.php 프록시, 미배포 시 디그레이드)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: etf.php (cafe24 프록시) + 배포·라이브 검증

**Files:** Create `signal/etf.php`; deploy both `etf.php`·`scoopsignal.html` to cafe24.

**Interfaces:**
- Produces: `www/portal/signal/etf.php` → JSON `{asOf,total,unit,issuers:[{name,ticker,value,flow1d}]}`.

- [ ] **Step 1: etf.php 작성**

`signal/etf.php` 생성(Farside ETH 페이지 서버 사이드 fetch + 파싱 + 30분 파일 캐시 + CORS):
```php
<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
$cacheFile = __DIR__ . '/etf_cache.json';
$ttl = 1800; // 30분
if (is_readable($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
  echo file_get_contents($cacheFile); exit;
}
function fetch($url){
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER=>true, CURLOPT_FOLLOWLOCATION=>true, CURLOPT_TIMEOUT=>15,
    CURLOPT_USERAGENT=>'Mozilla/5.0 (compatible; ScoopSignal/1.0)',
  ]);
  $r = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  return ($code>=200 && $code<300) ? $r : null;
}
$html = fetch('https://farside.co.uk/eth/');
$out = ['asOf'=>date('Y-m-d'), 'total'=>null, 'unit'=>'usd', 'issuers'=>[]];
if ($html) {
  // Farside ETH 표: 헤더에 발행사 티커(ETHA/FETH/ETHW/CETH/ETHV/QETH/EZET/ETHE/ETH 등), 마지막 'Total' 행=누적 순유입($백만)
  libxml_use_internal_errors(true);
  $doc = new DOMDocument(); $doc->loadHTML($html); $xp = new DOMXPath($doc);
  $tables = $xp->query('//table');
  foreach ($tables as $tbl) {
    $heads = $xp->query('.//thead//th', $tbl);
    if ($heads->length < 3) continue;
    $names = []; foreach ($heads as $h) { $names[] = trim($h->textContent); }
    // 'Total' 누적 행 탐색
    $rows = $xp->query('.//tr', $tbl); $totalRow = null; $lastRow = null;
    foreach ($rows as $row) {
      $cells = $xp->query('.//td', $row); if (!$cells->length) continue; $lastRow = $cells;
      $first = trim($cells->item(0)->textContent);
      if (stripos($first, 'Total') !== false) $totalRow = $cells;
    }
    $src = $totalRow ?: $lastRow; if (!$src) continue;
    $issuers = []; $sum = 0;
    for ($i = 1; $i < $src->length && $i < count($names); $i++) {
      $nm = $names[$i]; if ($nm==='' || stripos($nm,'Total')!==false) continue;
      $raw = trim($src->item($i)->textContent);
      $val = (float)str_replace([',','(',')','$','-'], ['','-','','',''], $raw);
      if (strpos($raw,'(')!==false) $val = -abs($val);
      $issuers[] = ['name'=>$nm, 'ticker'=>$nm, 'value'=>$val*1e6, 'flow1d'=>null];
      $sum += $val*1e6;
    }
    if (count($issuers) >= 3) { $out['issuers'] = $issuers; $out['total'] = $sum; break; }
  }
}
$json = json_encode($out, JSON_UNESCAPED_UNICODE);
@file_put_contents($cacheFile, $json);
echo $json;
```
(누적 순유입 $백만 단위 → `*1e6` 로 USD. flow1d는 1차에선 null; 추후 마지막 일일 행으로 확장 가능.)

- [ ] **Step 2: cafe24에 etf.php + scoopsignal.html 배포**

메모리 절차로 두 파일만 업로드(기존 jsiy 등 미수정):
```bash
cd /home/jschoi0223/projects/vdiportal/signal
lftp -c "set sftp:auto-confirm yes; open sftp://parksvc:<PASS>@parksvc.mycafe24.com; cd www/portal/signal; put etf.php; put scoopsignal.html"
```

- [ ] **Step 3: 라이브 etf.php 검증 + 파서 조정**

```bash
curl -s "https://parksvc.mycafe24.com/portal/signal/etf.php" | head -c 600
```
기대: `{"asOf":...,"total":...,"unit":"usd","issuers":[{"name":"BlackRock"...},...]}` issuers ≥ 3. 비었거나 파싱 깨지면(Farside 구조 상이) HTML을 받아(`curl https://farside.co.uk/eth/ | head`) 표 구조 확인 후 etf.php XPath/컬럼 인덱스 조정 → 재배포 → 재확인(반복). issuers가 채워질 때까지.

- [ ] **Step 4: 라이브 프론트 검증**

헤드리스로 라이브 etf 뷰 확인:
```js
// https://.../scoopsignal.html, showView('etf') ~6s 후
({issuers:document.querySelectorAll('#etfList .ob-bar').length, stats:document.querySelector('#etfStats').textContent.slice(0,40)})
// 기대: issuers≥3, stats "총 $..B · ... 기준"
```
스크린샷으로 발행사별 막대 육안. 차단/실패 시 "연결 필요" 디그레이드 확인. JS 에러 0.

- [ ] **Step 5: Commit**

```bash
cd /home/jschoi0223/projects/vdiportal
git add signal/etf.php
git commit -m "ScoopSignal: etf.php cafe24 프록시(Farside ETH ETF 발행사별 파싱·CORS·30분 캐시)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지**
- 햄버거 드로어 ≤900px(가로 pill 제거)·백드롭·ESC/항목/백드롭 닫힘·body 잠금 → Task 1 ✅
- 데스크톱 무변화(햄버거 숨김) → Task 1 Step 2/3 ✅
- 항목 컴팩트화 → Task 1 Step 2 ✅
- etf 뷰·loadEtf(./etf.php)·renderEtf·배지·CHART_TIER basic → Task 2 ✅
- 미배포 시 "연결 필요" 디그레이드 → Task 2 Step 1/3 ✅
- etf.php(cafe24, Farside 파싱·CORS·캐시)·jsiy 불가침 → Task 3 ✅
- 라이브 검증·파서 조정 루프 → Task 3 Step 3 ✅

**2. 자리표시 스캔:** TBD/TODO 없음. 코드 스텝 실제 코드. etf.php 파서는 라이브 조정 루프 명시(HTML 스크래핑 특성상 적절) ✅

**3. 타입/이름 일관성:** `S.etf={total,unit,asOf,issuers}`·`loadEtf`/`renderEtf`·`ETF_PROXY`·`#etfStats`/`#etfList`·뷰키 `etf`·`setBadge('etf')`·`#st-etf`가 Task2 정의→사용 일치. etf.php JSON(`{asOf,total,unit,issuers:[{name,ticker,value,flow1d}]}`)이 loadEtf 소비와 일치. `.ob-bar`/`applyTierBadges` 재사용. `openSide`/`#hambBtn`/`#sideBackdrop` Task1 일관 ✅
