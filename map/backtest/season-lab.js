// backtest/season-lab.js — 계절성/캘린더 효과 정직 검증 랩 (신규 예측축 후보)
// 순수 캘린더 분석(forge-core 불필요). 날짜(t) 포함 dated 데이터 필요.
//   요일 · 월 · turn-of-month(월말±3거래일) · 분기말을 추출해
//   (a)방향 (b)변동성 (c)TOM OOS 지속 을 검증.
// 검증규율: 이중 베이스라인 ①다수결 ②지속성, 둘 다 ≥+1%p 초과해야 진짜.
//           OOS = 각 종목 시계열 앞60% train / 뒤40% test (시간 전후 분리, lookahead 없음).
// 실행: node backtest/season-lab.js   (공유파일 미수정, 이 랩만)
"use strict";
const fs = require("fs"), path = require("path");

// ── 데이터 로드 ────────────────────────────────────────────────────────────
const IM = "/tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/f6930b15-5f14-43f4-87f0-3222bca05095/scratchpad/im";
const SYMS = ["SPY","AAPL","MSFT","NVDA","JPM","BAC","V","MA","JNJ","PFE","XOM","CVX","KO","WMT","HD","DIS","CAT","INTC"];
const WD = ["일","월","화","수","목","금","토"];   // getUTCDay 0..6
const MON = ["","1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function loadSym(sym) {
  const j = JSON.parse(fs.readFileSync(path.join(IM, sym + ".json"), "utf8"));
  const c = j.candles;
  // 파생: 당일 종가수익률 r[i]=c[i]/c[i-1]-1, 요일, 월, 월내 거래일 위치 → TOM/분기말
  // 월 그룹으로 posFromStart / posFromEnd 계산
  const bars = c.map((k, i) => ({
    t: k.t, c: k.c,
    r: i > 0 ? c[i].c / c[i - 1].c - 1 : null,
    wd: new Date(k.t + "T00:00:00Z").getUTCDay(),
    mo: +k.t.slice(5, 7),
    ym: k.t.slice(0, 7),
  }));
  // 월내 거래일 위치
  const byMonth = new Map();
  bars.forEach((b, i) => { (byMonth.get(b.ym) || byMonth.set(b.ym, []).get(b.ym)).push(i); });
  for (const idxs of byMonth.values()) {
    const L = idxs.length;
    idxs.forEach((gi, k) => {
      bars[gi].posStart = k + 1;      // 월초부터 1-index
      bars[gi].posEnd = L - k;        // 월말부터 1-index
    });
  }
  for (const b of bars) {
    // turn-of-month: 월말 3거래일 + 월초 3거래일 (월경계 ±3)
    b.tom = (b.posEnd <= 3) || (b.posStart <= 3);
    // 분기말: 3/6/9/12월의 월말 3거래일
    b.qend = [3, 6, 9, 12].includes(b.mo) && b.posEnd <= 3;
  }
  return bars;
}

const DATA = {};
for (const s of SYMS) DATA[s] = loadSym(s);
const NBAR = DATA.SPY.length;
console.log(`데이터: ${SYMS.length}종목 × ~${NBAR}봉 (SPY ${DATA.SPY[0].t} ~ ${DATA.SPY[NBAR-1].t})`);

// ── 유틸: 종목별 시간분리(앞60/뒤40) ────────────────────────────────────────
function splitIdx(bars) { return Math.floor(bars.length * 0.6); }

// 버킷별 통계 누적기: up-rate, 평균수익, 평균|수익|(변동성)
function makeAccum() { return { n: 0, up: 0, sr: 0, sabs: 0 }; }
function push(a, r) { if (r == null) return; a.n++; if (r > 0) a.up++; a.sr += r; a.sabs += Math.abs(r); }
function stat(a) { return a.n ? { n: a.n, up: a.up / a.n, mean: a.sr / a.n, vol: a.sabs / a.n } : { n: 0, up: 0, mean: 0, vol: 0 }; }

// ── 버킷 정의 ───────────────────────────────────────────────────────────────
// 각 버킷: 이름 + 라벨함수(bar → key|null)
const BUCKETS = {
  weekday: { keys: [1, 2, 3, 4, 5], name: k => WD[k], label: b => b.wd },
  month:   { keys: [1,2,3,4,5,6,7,8,9,10,11,12], name: k => MON[k], label: b => b.mo },
  tom:     { keys: ["TOM", "non-TOM"], name: k => k, label: b => (b.tom ? "TOM" : "non-TOM") },
  qend:    { keys: ["분기말", "기타"], name: k => k, label: b => (b.qend ? "분기말" : "기타") },
};

// ── (0) 전체 서술통계 (in-sample, 효과 존재여부) ─────────────────────────────
function describe() {
  console.log("\n================ (0) 전체 서술통계 — 효과가 존재하나? (in-sample, pooled) ================");
  for (const [bk, cfg] of Object.entries(BUCKETS)) {
    const acc = {}; cfg.keys.forEach(k => acc[k] = makeAccum());
    let all = makeAccum();
    for (const s of SYMS) for (const b of DATA[s]) {
      if (b.r == null) continue;
      const key = cfg.label(b); if (!(key in acc)) continue;
      push(acc[key], b.r); push(all, b.r);
    }
    const A = stat(all);
    console.log(`\n[${bk}]  전체 up-rate ${(A.up*100).toFixed(2)}%  평균수익 ${(A.mean*100).toFixed(3)}%  변동성|r| ${(A.vol*100).toFixed(3)}%  (n=${A.n})`);
    console.log("  " + "버킷".padEnd(8) + "n".padStart(7) + "up%".padStart(8) + "평균r%".padStart(9) + "|r|%(vol)".padStart(11) + "  vs전체up".padStart(9));
    for (const k of cfg.keys) {
      const S = stat(acc[k]); if (!S.n) continue;
      const d = (S.up - A.up) * 100;
      console.log("  " + String(cfg.name(k)).padEnd(8) + String(S.n).padStart(7) +
        (S.up*100).toFixed(2).padStart(8) + (S.mean*100).toFixed(3).padStart(9) +
        (S.vol*100).toFixed(3).padStart(11) + ((d>=0?"+":"")+d.toFixed(2)).padStart(9));
    }
  }
}

// ── (a) 방향 OOS 검증: 이중 베이스라인 ───────────────────────────────────────
// train에서 버킷별 up-rate 학습 → test에 캘린더 규칙 적용, 다수결·지속성과 비교.
function directionOOS() {
  console.log("\n\n================ (a) 방향 예측 OOS (train 60% → test 40%) ================");
  console.log("캘린더규칙: train 버킷 up-rate≥50%→up, <50%→down 예측. test 적중률을 두 베이스라인과 비교.");
  console.log("판정: 캘린더가 다수결·지속성 둘 다 ≥+1%p 초과해야 진짜.\n");

  for (const [bk, cfg] of Object.entries(BUCKETS)) {
    // 1) train 버킷 up-rate, train 전체 up-rate(다수결 클래스)
    const trAcc = {}; cfg.keys.forEach(k => trAcc[k] = makeAccum());
    let trAll = makeAccum();
    for (const s of SYMS) {
      const bars = DATA[s], sp = splitIdx(bars);
      for (let i = 1; i < sp; i++) {
        const b = bars[i]; if (b.r == null) continue;
        const key = cfg.label(b); if (!(key in trAcc)) continue;
        push(trAcc[key], b.r); push(trAll, b.r);
      }
    }
    const trUp = stat(trAll).up;
    const majPredUp = trUp >= 0.5;                          // 다수결: train 다수 클래스
    const rulePred = {}; for (const k of cfg.keys) rulePred[k] = stat(trAcc[k]).up >= 0.5 ? 1 : -1;

    // 2) test 평가
    let calN=0,calHit=0, majN=0,majHit=0, perN=0,perHit=0;
    for (const s of SYMS) {
      const bars = DATA[s], sp = splitIdx(bars);
      for (let i = sp; i < bars.length; i++) {
        const b = bars[i]; if (b.r == null) continue;
        const a = Math.sign(b.r); if (!a) continue;
        const key = cfg.label(b); if (!(key in rulePred)) continue;
        // 캘린더
        calN++; if (rulePred[key] === a) calHit++;
        // 다수결(train 다수클래스 고정)
        majN++; if ((majPredUp ? 1 : -1) === a) majHit++;
        // 지속성(전일 수익 부호)
        const pr = bars[i-1] ? bars[i-1].r : null;
        if (pr != null && Math.sign(pr)) { perN++; if (Math.sign(pr) === a) perHit++; }
      }
    }
    const cal = calHit/calN*100, maj = majHit/majN*100, per = perHit/perN*100;
    const base = Math.max(maj, per);
    const edge = cal - base;
    const verdict = (cal-maj>=1 && cal-per>=1) ? "✅ 진짜(둘다 초과)" : "❌ 기각(베이스라인 못넘음)";
    console.log(`[${bk}]  캘린더 ${cal.toFixed(2)}%  |  다수결 ${maj.toFixed(2)}%  지속성 ${per.toFixed(2)}%  |  vs다수결 ${(cal-maj>=0?"+":"")}${(cal-maj).toFixed(2)}p  vs지속성 ${(cal-per>=0?"+":"")}${(cal-per).toFixed(2)}p  → ${verdict}  (n=${calN})`);
  }
}

// ── (a') 버킷 랭킹 지속성: train up-rate ranking이 test에서도 유지되나 ──────────
function rankPersistence() {
  console.log("\n\n================ (a') 버킷 up-rate 랭킹: train vs test 일치? (과최적화 진단) ================");
  for (const [bk, cfg] of Object.entries(BUCKETS)) {
    const tr = {}, te = {}; cfg.keys.forEach(k => { tr[k]=makeAccum(); te[k]=makeAccum(); });
    for (const s of SYMS) {
      const bars = DATA[s], sp = splitIdx(bars);
      for (let i = 1; i < bars.length; i++) {
        const b = bars[i]; if (b.r == null) continue;
        const key = cfg.label(b); if (!(key in tr)) continue;
        push(i < sp ? tr[key] : te[key], b.r);
      }
    }
    const rows = cfg.keys.map(k => ({ k, tr: stat(tr[k]), te: stat(te[k]) })).filter(r => r.tr.n && r.te.n);
    // 스피어만 상관(up-rate 랭킹)
    const sp1 = spearman(rows.map(r=>r.tr.up), rows.map(r=>r.te.up));
    const spv = spearman(rows.map(r=>r.tr.vol), rows.map(r=>r.te.vol));
    console.log(`\n[${bk}]  up-rate 랭킹 스피어만 train↔test ρ=${sp1.toFixed(2)}   변동성 랭킹 ρ=${spv.toFixed(2)}`);
    console.log("  " + "버킷".padEnd(8) + "train_up%".padStart(10) + "test_up%".padStart(10) + "  │" + "train_vol%".padStart(11) + "test_vol%".padStart(11));
    for (const r of rows) {
      console.log("  " + String(cfg.name(r.k)).padEnd(8) +
        (r.tr.up*100).toFixed(2).padStart(10) + (r.te.up*100).toFixed(2).padStart(10) + "  │" +
        (r.tr.vol*100).toFixed(3).padStart(11) + (r.te.vol*100).toFixed(3).padStart(11));
    }
  }
}

function spearman(a, b) {
  const rank = arr => { const idx = arr.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]); const r=Array(arr.length); idx.forEach((p,ri)=>r[p[1]]=ri); return r; };
  const ra = rank(a), rb = rank(b), n = a.length;
  let d2 = 0; for (let i=0;i<n;i++) d2 += (ra[i]-rb[i])**2;
  return n>1 ? 1 - 6*d2/(n*(n*n-1)) : 0;
}

// ── (b) 변동성 예측: 캘린더 vol 예보가 베이스라인 초과? OOS ───────────────────
// 예보: train 버킷 평균|r|. 베이스라인 ①무조건(train 전체 평균|r|) ②지속성(전일 |r|) & ③trailing20 평균|r|.
// 평가: test에서 MAE(실제|r| - 예보) 및 고변동일(상위1/3) 판별 hit.
function volOOS() {
  console.log("\n\n================ (b) 변동성 예측 OOS — 캘린더 vol 예보가 베이스라인 초과? ================");
  console.log("예보=train 버킷 평균|r|. 베이스라인: ①무조건평균 ②전일|r| ③trailing20 평균|r|. test MAE 낮을수록 우수.\n");

  for (const [bk, cfg] of Object.entries(BUCKETS)) {
    const trVol = {}; cfg.keys.forEach(k => trVol[k] = makeAccum());
    let trAll = makeAccum();
    for (const s of SYMS) {
      const bars = DATA[s], sp = splitIdx(bars);
      for (let i = 1; i < sp; i++) {
        const b = bars[i]; if (b.r == null) continue;
        const key = cfg.label(b); if (!(key in trVol)) continue;
        push(trVol[key], b.r); push(trAll, b.r);
      }
    }
    const uncond = stat(trAll).vol;
    const calFore = {}; for (const k of cfg.keys) calFore[k] = stat(trVol[k]).vol;

    let calE=0, unE=0, perE=0, tr20E=0, n=0;
    for (const s of SYMS) {
      const bars = DATA[s], sp = splitIdx(bars);
      for (let i = Math.max(sp, 21); i < bars.length; i++) {
        const b = bars[i]; if (b.r == null) continue;
        const key = cfg.label(b); if (!(key in calFore)) continue;
        const act = Math.abs(b.r);
        // trailing20 평균 |r| (전일까지)
        let s20 = 0, c20 = 0; for (let j = i - 20; j < i; j++) if (bars[j].r != null) { s20 += Math.abs(bars[j].r); c20++; }
        const tr20 = c20 ? s20 / c20 : uncond;
        const perV = bars[i-1].r != null ? Math.abs(bars[i-1].r) : uncond;
        calE += Math.abs(act - calFore[key]);
        unE  += Math.abs(act - uncond);
        perE += Math.abs(act - perV);
        tr20E+= Math.abs(act - tr20);
        n++;
      }
    }
    const cal=calE/n, un=unE/n, per=perE/n, tr20=tr20E/n;
    const bestBase = Math.min(un, per, tr20);
    const impr = (bestBase - cal) / bestBase * 100;   // 베이스라인 대비 MAE 개선율
    const verdict = cal < un && cal < tr20 ? (cal<per?"✅ 캘린더 우수":"△ 무조건보단 우수(추세vol엔 밀림)") : "❌ 캘린더 무의미";
    console.log(`[${bk}]  MAE(×1e4)  캘린더 ${(cal*1e4).toFixed(1)}  |  무조건 ${(un*1e4).toFixed(1)}  전일|r| ${(per*1e4).toFixed(1)}  trail20 ${(tr20*1e4).toFixed(1)}  |  최선베이스대비 ${impr>=0?"+":""}${impr.toFixed(1)}%  → ${verdict}`);
  }
}

// ── (c) TOM 수익 효과 OOS 지속성 (핵심) ──────────────────────────────────────
// TOM 평균수익 vs non-TOM, train/test 각각. + 방향(다음날 상승확률) OOS.
function tomDeepDive() {
  console.log("\n\n================ (c) turn-of-month 수익효과 OOS 지속성 (핵심) ================");
  console.log("TOM=월말3+월초3 거래일. 과거(train)에서 발견된 초과수익이 최근(test)에도 유지되나?\n");

  // pooled + SPY 단독
  for (const scope of ["POOLED", "SPY"]) {
    const syms = scope === "SPY" ? ["SPY"] : SYMS;
    const seg = { trT:makeAccum(), trN:makeAccum(), teT:makeAccum(), teN:makeAccum() };
    for (const s of syms) {
      const bars = DATA[s], sp = splitIdx(bars);
      for (let i = 1; i < bars.length; i++) {
        const b = bars[i]; if (b.r == null) continue;
        const isTr = i < sp;
        if (b.tom) push(isTr ? seg.trT : seg.teT, b.r);
        else       push(isTr ? seg.trN : seg.teN, b.r);
      }
    }
    const trT=stat(seg.trT), trN=stat(seg.trN), teT=stat(seg.teT), teN=stat(seg.teN);
    // 일평균 초과수익 (TOM - nonTOM)
    const trEdge = (trT.mean - trN.mean)*100, teEdge = (teT.mean - teN.mean)*100;
    console.log(`--- ${scope} ---`);
    console.log(`  train:  TOM 평균 ${(trT.mean*100).toFixed(4)}% (up ${(trT.up*100).toFixed(1)}%, n=${trT.n})   non-TOM ${(trN.mean*100).toFixed(4)}% (up ${(trN.up*100).toFixed(1)}%)   초과 ${trEdge>=0?"+":""}${trEdge.toFixed(4)}%p/일`);
    console.log(`  test :  TOM 평균 ${(teT.mean*100).toFixed(4)}% (up ${(teT.up*100).toFixed(1)}%, n=${teT.n})   non-TOM ${(teN.mean*100).toFixed(4)}% (up ${(teN.up*100).toFixed(1)}%)   초과 ${teEdge>=0?"+":""}${teEdge.toFixed(4)}%p/일`);
    const persist = (trEdge > 0 && teEdge > 0) ? (teEdge >= trEdge*0.5 ? "✅ 유지(test≥train절반)" : "△ 약화(양수지만 축소)") : "❌ 소멸(test에서 사라짐/역전)";
    console.log(`  → 방향 초과: ${persist}   변동성: TOM |r| train ${(trT.vol*100).toFixed(3)}% test ${(teT.vol*100).toFixed(3)}% vs non-TOM test ${(teN.vol*100).toFixed(3)}%\n`);
  }
}

describe();
directionOOS();
rankPersistence();
volOOS();
tomDeepDive();
console.log("\n(주의) pooled 통계는 종목 간 횡단면 상관으로 유효표본이 실제보다 작음 → 유의성 과대평가. SPY 단독 대조 병기.");
