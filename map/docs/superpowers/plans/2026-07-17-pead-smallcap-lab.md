# 소형주 PEAD → 상대방향(vs IJR) 증강 검증 Plan

> **For agentic workers:** 연구/검증 랩. forge-core 미변경(246/246 유지). 산출=판정. 데이터 수집(EDGAR) 1회 추가.

**Goal:** PEAD(실적일 반응 드리프트)가 소형주(fixtures-shortint 52종)서 rel25(deployed) 위 상대방향(vs IJR) +1.5pp 증분을 주는지 판정.

**Architecture:** ①EDGAR 8-K item 2.02로 소형주 실적일 수집 → `smallcap-earnings.json`. ②`pead-feats.js` peadArray 재사용 + IJR 벤치마크로 `pead-rel-lab.js` 이식 → `pead-smallcap-lab.js`. ③판정→기록.

**Tech Stack:** Node.js(바닐라)·EDGAR REST(fetch)·기존 feat-lib/pead-feats.

## Global Constraints

- forge-core.js **미변경**(`node --test map/forge-core.test.js` 246/246 유지). 새 파일은 `map/backtest/` 전용.
- look-ahead 안전: PEAD reaction은 t≥eIdx+2에서만 참조(pead-feats 기존 계약 유지).
- deployed base = **rel25**(structFeats P + structFeats R=P/IJR + betaProxy). 스트립 base 금지.
- 관문: 전체 증분 최대 ≥+1.5pp · 최소 ≥−0.5pp · LOSO h20 Δ>0 과반(≥60%) · 전/후반 부호 양(+/+).
- fixtures 캔들 포맷: `.candle` 배열 `{t,o,h,l,c}`. 벤치마크 IJR(`fixtures-shortint/IJR.json`).
- EDGAR 예의: User-Agent에 연락처(`scoopforge-research moneyscdev@gmail.com`), 요청 간 지연 ≥120ms.

---

### Task 1: `collect-earnings-edgar.js` — 소형주 실적일 수집

**Files:**
- Create: `map/backtest/collect-earnings-edgar.js`
- Output: `map/backtest/smallcap-earnings.json` (스크립트 실행 산출물)

**Interfaces:**
- Produces: `smallcap-earnings.json` = `{ [sym]: ["YYYY-MM-DD", ...] }`(중복 제거·오름차순). 외국계 등 0건은 `[]`.

- [ ] **Step 1: 스크립트 작성**

동작:
1. `fixtures-shortint/` 내 `*.json` 중 `IJR`·`SPY`·`_kept`·`_`접두 제외한 심볼 목록 수집.
2. `https://www.sec.gov/files/company_tickers.json` 1회 fetch → `{TICKER→CIK(10자리 zero-pad)}` 맵.
3. 심볼별:
   - CIK 없으면 `[]` 기록·스킵.
   - `https://data.sec.gov/submissions/CIK{cik}.json` fetch → `filings.recent`에서 `form[i]==='8-K' && (items[i]||'').includes('2.02')`인 `filingDate[i]` 수집.
   - `filings.files[]`(구 shard)마다 `https://data.sec.gov/submissions/{file.name}` fetch → 동일 필터로 추가 수집.
   - 중복 제거·오름차순 정렬 → 맵에 기록.
   - 각 fetch 후 `await sleep(150)`.
4. `smallcap-earnings.json` 저장. 심볼별 건수 + 총합 + 0건(외국계) 목록을 stdout 요약.

fetch 헬퍼(Node 18+ 전역 fetch):
```js
const UA = { "User-Agent": "scoopforge-research moneyscdev@gmail.com" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(500 * (a + 1));
  }
  return null;
}
```
8-K 2.02 추출:
```js
function earnDates(recent) {
  const { form = [], items = [], filingDate = [] } = recent || {};
  const out = [];
  for (let i = 0; i < form.length; i++)
    if (form[i] === "8-K" && (items[i] || "").includes("2.02")) out.push(filingDate[i]);
  return out;
}
```

- [ ] **Step 2: 실행 → 커버리지 확인**

Run: `cd map/backtest && node collect-earnings-edgar.js`
Expected: `smallcap-earnings.json` 생성. US 종목 대부분 ≥15건(수년치), 외국계(BNS·CM·ENB·CNQ·INFY 등) 0건. 총 실적일 수백~1천+.
- 검증: `node -e "const d=require('./smallcap-earnings.json'); const n=Object.values(d); console.log('종목',n.length,'실적일총',n.reduce((a,b)=>a+b.length,0),'비영종목',n.filter(a=>a.length).length)"`

- [ ] **Step 3: 커밋**
```bash
git add map/backtest/collect-earnings-edgar.js map/backtest/smallcap-earnings.json
git commit -m "feat(backtest): EDGAR 8-K 2.02 소형주 실적일 수집기 + smallcap-earnings.json"
```

---

### Task 2: `pead-smallcap-lab.js` — 증분 검증 랩

**Files:**
- Create: `map/backtest/pead-smallcap-lab.js`

**Interfaces:**
- Consumes: `fixtures-shortint/{sym}.json`(.candle), `fixtures-shortint/IJR.json`, `smallcap-earnings.json`, `pead-feats.js`(peadArray), `feat-lib.js`(structFeats·logitFit·acc·splitIdx).

- [ ] **Step 1: 랩 작성** (`pead-rel-lab.js` 이식 — SPY→IJR·earn-ohlc→fixtures)

핵심 차이:
```js
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");
const { peadArray } = require("./pead-feats.js");
const FDIR = path.join(__dirname, "fixtures-shortint");
const EARN = JSON.parse(fs.readFileSync(path.join(__dirname, "smallcap-earnings.json"), "utf8"));
const IJRFIX = JSON.parse(fs.readFileSync(path.join(FDIR, "IJR.json"), "utf8"));
const ijrMap = {}; (IJRFIX.candle || []).forEach(c => ijrMap[c.t] = c.c);
const SKIP = new Set(["IJR", "SPY"]);
const SYMS = fs.readdirSync(FDIR).filter(f => f.endsWith(".json") && !f.startsWith("_"))
  .map(f => f.replace(".json", "")).filter(s => !SKIP.has(s));
const HS = [10, 20, 40], STRIDE = 5, START = 300;
// betaProxy, accOn, fitAccH, P(): pead-rel-lab.js와 동일
function build() {
  const train = [], test = []; let peadTouched = 0, used = 0;
  for (const sym of SYMS) {
    let fx; try { fx = JSON.parse(fs.readFileSync(path.join(FDIR, sym + ".json"), "utf8")); } catch (e) { continue; }
    const cds = fx.candle; if (!cds || !cds.length) continue;
    const closes = cds.map(c => c.c), dates = cds.map(c => c.t), earnings = EARN[sym] || [];
    const pead = peadArray(closes, dates, earnings, { win: 45 });
    const P = [], IJ = [], PE = [];
    for (let i = 0; i < cds.length; i++) { const iv = ijrMap[dates[i]]; if (iv && closes[i] > 0) { P.push(closes[i]); IJ.push(iv); PE.push(pead[i]); } }
    if (P.length < START + Math.max(...HS) + 5) continue;
    used++;
    const R = P.map((v, i) => v / IJ[i]);
    const rows = [];
    for (let t = START; t <= P.length - Math.max(...HS) - 1; t += STRIDE) {
      const xo = F.structFeats(P, t), xr = F.structFeats(R, t); if (!xo || !xr) continue;
      const x25 = xo.concat(xr, [betaProxy(P, IJ, t)]), pe = PE[t];
      const inWin = pe.some(v => v !== 0); if (inWin) peadTouched++;
      const y = {}; for (const H of HS) y[H] = (P[t + H] / P[t] > IJ[t + H] / IJ[t]) ? 1 : 0;
      rows.push({ x25, pe, y, sym, inWin });
    }
    const cut = F.splitIdx(rows.length, 0.6); rows.forEach((r, i) => (i < cut ? train : test).push(r));
  }
  return { train, test, peadTouched, used };
}
```
리포트/관문 블록은 `pead-rel-lab.js`와 동일하되 라벨을 "소형주 N종"·"vs IJR"로, 서바이버십 경고 1줄 추가:
```js
console.log("⚠ 서바이버십: 현존 종목만(상장폐지 소형주 누락) → 통과여도 상방편향 감안");
```
판정 문구: PASS=`PASS(소형주 PEAD 증분 유의)` / REJECT=`REJECT(소형주도 증분 불충분 — 모멘텀 흡수)`.

- [ ] **Step 2: 실행**

Run: `cd map/backtest && node pead-smallcap-lab.js`
Expected: used(유효종목)·PEAD-창 시점 수·(a)원신호 적중·(b)지평별 base/+pead/Δ·관문·판정 출력.

- [ ] **Step 3: 커밋**
```bash
git add map/backtest/pead-smallcap-lab.js
git commit -m "feat(backtest): 소형주 PEAD→상대방향(vs IJR) 증분 검증 랩"
```

---

### Task 3: 판정 → 기록

- [ ] **Step 1: 결과 해석** — 창내 vs 전체 증분·모멘텀 흡수 여부·유효종목 커버리지. 관문 대조.
- [ ] **Step 2: 기록**
  - **기각 시**(예상): `forge-scorecard.html` EXPLORED 배열에 r:"no" 항목(소형주 PEAD도 흡수·서바이버십 경고) + `map/docs/BACKLOG.md` 갱신([남은 여지] 항목 종결) + 메모리 `scoopforge-earnings-axis.md` 또는 신규 슬라이스 메모 갱신.
  - **통과 시**: 스코어카드 승자 후보 + 백로그 승격 항목 + 엔진 이식 별도 스펙 예고.
  - forge-core 미변경 확인(`node --test map/forge-core.test.js` 246/246).
- [ ] **Step 3: 커밋 + push + 스코어카드 배포**(cafe24). 메모리 MEMORY.md 인덱스 갱신.
