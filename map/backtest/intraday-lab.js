// backtest/intraday-lab.js — 인트라데이 미시구조 → 일봉 리스크축(변동성·급변·갭) 증강 순증분 검증
// 프레임: 실적축(+6.3pp 성공)·8-K(기각)와 동일 — "배포 모델 확률 위에 새 피처의 순증분"(관문 +1.0pp, 종목내 OOS+종목외 LOSO).
// 새 정보(일봉 OHLC서 유도 불가): 일중 RV 구성·오버나이트/일중 분해·개장/마감 변동 집중도·RV/레인지 비율·마감 모멘텀.
// 데이터: fixtures-intraday/{SYM}-1h.json (TD 1h ×3페이지 ≈8.6년). 일봉은 1h에서 재구성(날짜 정렬 문제 원천 제거).
// 사용: node backtest/intraday-lab.js --audit   (데이터 품질 감사만)
//       node backtest/intraday-lab.js           (전체 검증)
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const F = require("./feat-lib.js");

const DIR = path.join(__dirname, "fixtures-intraday");
const STRIDE = 3, WARMUP = 300, H = 20;
const SPLIT_LOG = Math.log(1.6);   // |오버나이트 로그수익| > ln(1.6) → 분할/배당 아티팩트로 간주(실제 최대 일변동 ~±15%와 안전 여유)

function loadDays(sym) {   // 1h → 날짜별 그룹 → {date, o,h,l,c,v, rv, fhShare, lhShare, lastRet}
  const fp = path.join(DIR, sym + "-1h.json");
  if (!fs.existsSync(fp)) return null;
  const bars = JSON.parse(fs.readFileSync(fp, "utf8")).bars;
  const byDate = new Map();
  for (const b of bars) { const d = b[0].slice(0, 10); if (!byDate.has(d)) byDate.set(d, []); byDate.get(d).push(b); }
  const days = [];
  for (const [date, arr] of [...byDate.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    arr.sort((a, b) => a[0] < b[0] ? -1 : 1);
    if (arr.length < 5) continue;   // 반일장/결손 제외
    const o = arr[0][1], c = arr[arr.length - 1][4];
    let h = -Infinity, l = Infinity, v = 0, rv2 = 0, first2 = 0, last2 = 0;
    const rets = [];
    for (let i = 0; i < arr.length; i++) {
      h = Math.max(h, arr[i][2]); l = Math.min(l, arr[i][3]); v += arr[i][5];
      const p0 = i === 0 ? arr[0][1] : arr[i - 1][4];   // 첫 봉은 당일 시가 기준(오버나이트 제외)
      const r = Math.log(arr[i][4] / p0); rets.push(r); rv2 += r * r;
      if (i === 0) first2 = r * r;
      if (i === arr.length - 1) last2 = r * r;
    }
    days.push({ date, o, h, l, c, v, rv: Math.sqrt(rv2), fhShare: rv2 ? first2 / rv2 : 0, lhShare: rv2 ? last2 / rv2 : 0, lastRet: rets[rets.length - 1], nBars: arr.length });
  }
  return days;
}

function adjustSplits(days) {   // 오버나이트 점프(|log|>SPLIT_LOG) 검출 → 이전 전체를 비율로 소급 조정
  let n = 0;
  for (let i = 1; i < days.length; i++) {
    const r = days[i].o / days[i - 1].c;
    if (Math.abs(Math.log(r)) > SPLIT_LOG) {
      n++;
      for (let j = 0; j < i; j++) { const d = days[j]; d.o *= r; d.h *= r; d.l *= r; d.c *= r; }
    }
  }
  return n;
}

function audit() {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith("-1h.json")) : [];
  console.log("== 인트라데이 데이터 감사 — 파일 " + files.length + " ==");
  for (const f of files) {
    const sym = f.replace("-1h.json", "");
    const days = loadDays(sym); if (!days) continue;
    const hist = {}; days.forEach(d => { hist[d.nBars] = (hist[d.nBars] || 0) + 1; });
    const splits = adjustSplits(days.map(d => ({ ...d })));   // 사본으로 검출만
    console.log(`  ${sym}: ${days.length}일 (${days[0].date}~${days[days.length - 1].date}) · 봉/일 분포 ${JSON.stringify(hist)} · 분할성 점프 ${splits}건`);
  }
}

// 인트라데이 8피처(시점 t, 과거만): RV비율·오버나이트비중·개장/마감집중·RV/레인지·마감모멘텀·on→id상관·RV변동
const IFEAT_NAMES = ["rvRatio", "onShare", "fhShare", "lhShare", "rvRange", "lastMom", "onIdCorr", "rvCV"];
function ifeats(days, t) {
  if (t < 25) return null;
  const w = (n, fn) => { const a = []; for (let i = t - n + 1; i <= t; i++) a.push(fn(days[i], i)); return a; };
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const rv20 = w(20, d => d.rv), rv5 = w(5, d => d.rv);
  const on20 = w(20, (d, i) => Math.log(d.o / days[i - 1].c));
  const id20 = w(20, d => Math.log(d.c / d.o));
  const pk20 = w(20, d => (d.h > d.l && d.l > 0) ? Math.log(d.h / d.l) / (2 * Math.sqrt(Math.log(2))) : 0);
  const sumOn2 = on20.reduce((s, x) => s + x * x, 0), sumRv2 = rv20.reduce((s, x) => s + x * x, 0);
  const mOn = mean(on20), mId = mean(id20);
  let cov = 0, vOn = 0, vId = 0;
  for (let i = 0; i < 20; i++) { cov += (on20[i] - mOn) * (id20[i] - mId); vOn += (on20[i] - mOn) ** 2; vId += (id20[i] - mId) ** 2; }
  const mRv = mean(rv20), sdRv = Math.sqrt(rv20.reduce((s, x) => s + (x - mRv) ** 2, 0) / 20);
  const x = [
    mean(rv5) / (mRv || 1e-9) - 1,
    sumOn2 / ((sumOn2 + sumRv2) || 1e-9),
    mean(w(20, d => d.fhShare)),
    mean(w(20, d => d.lhShare)),
    mRv / (mean(pk20) || 1e-9) - 1,
    mean(w(5, d => d.lastRet)),
    (vOn > 0 && vId > 0) ? cov / Math.sqrt(vOn * vId) : 0,
    sdRv / (mRv || 1e-9),
  ];
  return x.every(isFinite) ? x : null;
}

const pct = x => x == null ? "–" : (x * 100).toFixed(1) + "%";
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

function buildRows() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith("-1h.json"));
  const rows = [];
  for (const f of files) {
    const sym = f.replace("-1h.json", "");
    const days = loadDays(sym); if (!days || days.length < WARMUP + H + 5) continue;
    const nAdj = adjustSplits(days);
    const price = days.map(d => d.c), candle = days.map(d => ({ o: d.o, h: d.h, l: d.l, c: d.c, v: d.v }));
    const N = days.length;
    // 갭 타깃용 트레일링 갭변동성(60일)·v20(급변 문턱) 준비
    for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
      const xi = ifeats(days, t); if (!xi) continue;
      const ps = price.slice(0, t + 1), cs = candle.slice(0, t + 1);
      let volF = null, spkF = null, gapF = null;
      try { volF = FC.forecastVolatility(ps, cs); spkF = FC.forecastSpike(ps, cs); gapF = FC.forecastGapRisk(ps, cs); } catch (e) { continue; }
      if (!volF || !spkF) continue;
      // 타깃(배포 정의 재현): ①변동성 확대(다음20 v20 > 직전20) ②급변(20일 내 |일수익|>2.5σ) ③갭(20일 내 |오버나이트|>2.2×갭σ60)
      const vol = (s, e) => { let s2 = 0, n = 0; for (let i = s + 1; i <= e; i++) { const r = Math.log(price[i] / price[i - 1]); s2 += r * r; n++; } return n ? Math.sqrt(s2 / n) : 0; };
      const vb = vol(t - H, t), va = vol(t, t + H);
      const yVol = va > vb ? 1 : 0;
      const sv = vol(t - 20, t);
      let ySpk = 0; for (let i = t + 1; i <= t + H; i++) if (Math.abs(Math.log(price[i] / price[i - 1])) > 2.5 * sv) { ySpk = 1; break; }
      let gs = 0, gn = 0; for (let i = t - 59; i <= t; i++) { const g = Math.log(days[i].o / days[i - 1].c); gs += g * g; gn++; }
      const gv = gn ? Math.sqrt(gs / gn) : 0;
      let yGap = 0; for (let i = t + 1; i <= t + H; i++) if (Math.abs(Math.log(days[i].o / days[i - 1].c)) > 2.2 * gv) { yGap = 1; break; }
      rows.push({ sym, t,
        volP: volF.raw, spkP: spkF.curve[1].prob, gapP: gapF ? gapF.prob : null,
        xi, yVol, ySpk, yGap,
        prevVol: vb > vol(t - 2 * H, t - H) ? 1 : 0,   // 지속성 베이스라인용
      });
    }
    console.error(`  ${sym}: rows 누적 ${rows.length} (분할보정 ${nAdj}건)`);
  }
  return rows;
}

function evalAxis(rows, key, baseKey, label) {
  const use = rows.filter(r => r[baseKey] != null);
  const bySym = {}; for (const r of use) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const tr = [], te = [];
  for (const s of Object.keys(bySym)) { const a = bySym[s], k = F.splitIdx(a.length); tr.push(...a.slice(0, k)); te.push(...a.slice(k)); }
  const yOf = r => r[key];
  const mBase = F.logitFit(tr.map(r => [r[baseKey]]), tr.map(yOf));
  const mAug = F.logitFit(tr.map(r => [r[baseKey]].concat(r.xi)), tr.map(yOf));
  const yTe = te.map(yOf);
  const aBase = F.acc(te.map(r => mBase.predict([r[baseKey]])), yTe);
  const aAug = F.acc(te.map(r => mAug.predict([r[baseKey]].concat(r.xi))), yTe);
  const majTrain = tr.map(yOf).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
  const majAcc = yTe.filter(v => v === majTrain).length / yTe.length;
  const mid = Math.floor(te.length / 2);
  const inc = aAug - aBase;
  const h1 = F.acc(te.slice(0, mid).map(r => mAug.predict([r[baseKey]].concat(r.xi))), yTe.slice(0, mid)) - F.acc(te.slice(0, mid).map(r => mBase.predict([r[baseKey]])), yTe.slice(0, mid));
  const h2 = F.acc(te.slice(mid).map(r => mAug.predict([r[baseKey]].concat(r.xi))), yTe.slice(mid)) - F.acc(te.slice(mid).map(r => mBase.predict([r[baseKey]])), yTe.slice(mid));
  // LOSO(종목외): 다른 종목 train구간 학습 → 보류 종목 test구간, base vs aug 순증분
  const syms = Object.keys(bySym);
  let hitB = 0, hitA = 0, n = 0;
  for (const held of syms) {
    const trL = [], teL = [];
    for (const s of syms) { const a = bySym[s], k = F.splitIdx(a.length); if (s === held) teL.push(...a.slice(k)); else trL.push(...a.slice(0, k)); }
    if (!teL.length || !trL.length) continue;
    const b = F.logitFit(trL.map(r => [r[baseKey]]), trL.map(yOf));
    const g = F.logitFit(trL.map(r => [r[baseKey]].concat(r.xi)), trL.map(yOf));
    for (const r of teL) { n++; if ((b.predict([r[baseKey]]) >= 0.5 ? 1 : 0) === yOf(r)) hitB++; if ((g.predict([r[baseKey]].concat(r.xi)) >= 0.5 ? 1 : 0) === yOf(r)) hitA++; }
  }
  console.log(`\n[${label}] test n=${te.length} · base-rate ${pct(yTe.reduce((s, v) => s + v, 0) / yTe.length)} · 다수결 ${pct(majAcc)}`);
  console.log(`  배포확률 단독 ${pct(aBase)} → +인트라데이 8피처 ${pct(aAug)} = 순증분 ${pp(inc)} (관문 +1.0pp) · 전/후반 ${pp(h1)}/${pp(h2)}`);
  console.log(`  [LOSO] 단독 ${pct(hitB / n)} → 증강 ${pct(hitA / n)} = 순증분 ${pp(hitA / n - hitB / n)} (n=${n})`);
  return { inc, incLoso: hitA / n - hitB / n, h1, h2 };
}

function main() {
  if (process.argv.includes("--audit")) return audit();
  const rows = buildRows();
  console.log(`\n== 인트라데이 미시구조 증강 — 표본 ${rows.length} (재구성 일봉·stride ${STRIDE}) ==`);
  const res = [];
  res.push(["변동성 확대(H20)", evalAxis(rows, "yVol", "volP", "변동성 확대(H20)")]);
  res.push(["급변(2.5σ·20)", evalAxis(rows, "ySpk", "spkP", "급변(2.5σ·20)")]);
  res.push(["갭(2.2σ·20)", evalAxis(rows, "yGap", "gapP", "갭(2.2σ·20)")]);
  console.log("\n관문: 순증분 +1.0pp↑(OOS·LOSO 둘 다) & 전/후반 양수");
  res.forEach(([k, r]) => console.log(`  ${k}: OOS ${pp(r.inc)} · LOSO ${pp(r.incLoso)} · 전/후반 ${pp(r.h1)}/${pp(r.h2)}`));
}
main();
