// backtest/macro-lab.js — 매크로 캘린더(FOMC·CPI) 축 검증: "예정된 이벤트만 통함" 규칙의 마지막 후보
// 핵심 설계: 기존 20봉 리스크축은 CPI(월간)·FOMC(6주)가 거의 항상 창 안 → 근접 피처 분산 소멸(실적과 다름).
//   따라서 타깃 = 단기 지평: T1 내일 급변(|ret|>1.5σ20) · T2 5봉 변동성 확대. 피처는 전부 사전 공지(스케줄) — lookahead 아님.
// 관문(사전 등록): 구조 12피처 베이스라인 대비 순증분 +1.0pp(OOS·LOSO 둘 다) & 전/후반 양수. 자명규칙('이벤트 내일'единственная) 대조 포함.
// 데이터: 종목=fixtures-intraday 재구성 일봉(2019~, 날짜 보유) · SPY=fixtures-bench(2006~ 날짜본) · macro-events.json(FOMC 성명일·CPI FRED 공표일)
// 사용: node backtest/macro-lab.js --audit  (이벤트일 변동성 상승 검사 = 날짜 데이터 자가검증)
//       node backtest/macro-lab.js
"use strict";
const fs = require("fs"), path = require("path");
const F = require("./feat-lib.js");

const EV = JSON.parse(fs.readFileSync(path.join(__dirname, "macro-events.json"), "utf8"));
const IDIR = path.join(__dirname, "fixtures-intraday");
const STRIDE = 2, START = 300;

function loadIntradayDaily(sym) {   // intraday-lab.loadDays 축약판(종가·고저만)
  const fp = path.join(IDIR, sym + "-1h.json"); if (!fs.existsSync(fp)) return null;
  const bars = JSON.parse(fs.readFileSync(fp, "utf8")).bars;
  const byDate = new Map();
  for (const b of bars) { const d = b[0].slice(0, 10); if (!byDate.has(d)) byDate.set(d, []); byDate.get(d).push(b); }
  const days = [];
  for (const [date, arr] of [...byDate.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    if (arr.length < 5) continue;
    arr.sort((a, b) => a[0] < b[0] ? -1 : 1);
    let h = -Infinity, l = Infinity;
    for (const b of arr) { if (b[2] > h) h = b[2]; if (b[3] < l) l = b[3]; }
    days.push({ t: date, o: arr[0][1], h, l, c: arr[arr.length - 1][4] });
  }
  return days;
}
function loadSPY() { return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures-bench", "SPY-1day.json"), "utf8")).candle; }

function eventIdx(days, dates) {   // 이벤트 날짜 → 거래일 인덱스 집합(정확 일치만 — 휴일 이벤트 없음 가정)
  const m = new Map(days.map((d, i) => [d.t, i]));
  return new Set(dates.map(d => m.get(d)).filter(i => i != null));
}
// 매크로 근접 7피처(전부 스케줄 = 사전 공지): [toFOMC/30, fomc내일, fomc오늘, sinceFOMC/30, toCPI/25, cpi내일, cpi오늘]
function macroFeats(t, fomcSorted, cpiSorted) {
  const next = (arr) => { let lo = 0, hi = arr.length; while (lo < hi) { const md = (lo + hi) >> 1; if (arr[md] <= t) lo = md + 1; else hi = md; } return lo < arr.length ? arr[lo] - t : 99; };
  const prev = (arr) => { let lo = 0, hi = arr.length; while (lo < hi) { const md = (lo + hi) >> 1; if (arr[md] < t) lo = md + 1; else hi = md; } return lo > 0 ? t - arr[lo - 1] : 99; };
  const nf = next(fomcSorted), pf = arr => prev(arr);
  const nc = next(cpiSorted);
  const sf = prev(fomcSorted), sc = prev(cpiSorted);
  return [Math.min(nf, 30) / 30, nf === 1 ? 1 : 0, sf === 0 ? 1 : 0, Math.min(sf, 30) / 30, Math.min(nc, 25) / 25, nc === 1 ? 1 : 0, sc === 0 ? 1 : 0];
}

const pct = x => x == null ? "–" : (x * 100).toFixed(1) + "%";
const pp = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

function audit() {
  console.log("== 매크로 이벤트 데이터 감사 — 이벤트일 |수익|/σ20 상승 검사(날짜 자가검증) ==");
  const spy = loadSPY(), p = spy.map(c => c.c);
  for (const [name, dates] of [["FOMC", EV.fomc], ["CPI", EV.cpi]]) {
    const idx = eventIdx(spy, dates);
    let evS = 0, evN = 0, nS = 0, nN = 0, matched = 0;
    for (let t = 260; t < p.length; t++) {
      const r = Math.abs(Math.log(p[t] / p[t - 1])), v = F.vol(p, t - 1, 20);
      if (!(v > 0)) continue;
      if (idx.has(t)) { evS += r / v; evN++; } else { nS += r / v; nN++; }
    }
    dates.forEach(d => { if (spy.some(c => c.t === d)) matched++; });
    console.log(`  ${name}: 날짜 ${dates.length} (SPY 거래일 일치 ${matched}) · 이벤트일 |r|/σ ${(evS / evN).toFixed(2)} vs 평일 ${(nS / nN).toFixed(2)} → ×${(evS / evN / (nS / nN)).toFixed(2)} (n=${evN})`);
  }
  // 프리-FOMC 드리프트(참고 · 문헌 유명 anomaly): 결정 전일 수익
  const fidx = [...eventIdx(spy, EV.fomc)].sort((a, b) => a - b);
  let dS = 0, dN = 0, aS = 0, aN = 0;
  for (let t = 1; t < p.length; t++) { const r = Math.log(p[t] / p[t - 1]); aS += r; aN++; if (fidx.includes(t + 1)) { dS += r; dN++; } }
  console.log(`  프리FOMC 드리프트(전일 수익): ${(dS / dN * 100).toFixed(3)}%/일 vs 전체 ${(aS / aN * 100).toFixed(3)}%/일 (n=${dN})`);
}

function buildRows(days, fomcIdxSet, cpiIdxSet, sym) {
  const p = days.map(d => d.c);
  const fomc = [...fomcIdxSet].sort((a, b) => a - b), cpi = [...cpiIdxSet].sort((a, b) => a - b);
  const rows = [];
  for (let t = START; t <= p.length - 7; t += STRIDE) {
    const xb = F.structFeats(p, t); if (!xb) continue;
    const xm = macroFeats(t, fomc, cpi);
    const v20 = F.vol(p, t, 20); if (!(v20 > 0)) continue;
    const y1 = Math.abs(Math.log(p[t + 1] / p[t])) > 1.5 * v20 ? 1 : 0;
    const va = F.vol(p, t + 5, 5), vb = F.vol(p, t, 5);
    const y5 = (va > 0 && vb > 0 && va > vb) ? 1 : 0;
    const py1 = Math.abs(Math.log(p[t] / p[t - 1])) > 1.5 * F.vol(p, t - 1, 20) ? 1 : 0;   // 지속성용
    const py5 = (F.vol(p, t, 5) > F.vol(p, t - 5, 5)) ? 1 : 0;
    rows.push({ sym, t, xb, xm, y1, y5, py1, py5, evT1: (xm[1] === 1 || xm[5] === 1) ? 1 : 0 });
  }
  return rows;
}

function evalTarget(rows, key, prevKey, label) {
  const bySym = {}; for (const r of rows) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const tr = [], te = [];
  for (const s of Object.keys(bySym)) { const a = bySym[s], k = F.splitIdx(a.length); tr.push(...a.slice(0, k)); te.push(...a.slice(k)); }
  const yOf = r => r[key];
  const mB = F.logitFit(tr.map(r => r.xb), tr.map(yOf));
  const mA = F.logitFit(tr.map(r => r.xb.concat(r.xm)), tr.map(yOf));
  const yTe = te.map(yOf);
  const pB = te.map(r => mB.predict(r.xb)), pA = te.map(r => mA.predict(r.xb.concat(r.xm)));
  const base = yTe.reduce((s, v) => s + v, 0) / yTe.length;
  const majTrain = tr.map(yOf).reduce((s, v) => s + v, 0) / tr.length >= 0.5 ? 1 : 0;
  const majAcc = yTe.filter(v => v === majTrain).length / yTe.length;
  const persAcc = te.filter(r => r[prevKey] === yOf(r)).length / te.length;
  const evRule = te.filter(r => r.evT1 === yOf(r)).length / te.length;   // '이벤트 내일=1' 자명규칙
  const aB = F.acc(pB, yTe), aA = F.acc(pA, yTe);
  const mid = Math.floor(te.length / 2);
  const h1 = F.acc(pA.slice(0, mid), yTe.slice(0, mid)) - F.acc(pB.slice(0, mid), yTe.slice(0, mid));
  const h2 = F.acc(pA.slice(mid), yTe.slice(mid)) - F.acc(pB.slice(mid), yTe.slice(mid));
  // LOSO(다종목일 때만)
  let losoTxt = "";
  const syms = Object.keys(bySym);
  if (syms.length > 2) {
    let hB = 0, hA = 0, n = 0;
    for (const held of syms) {
      const trL = [], teL = [];
      for (const s of syms) { const a = bySym[s], k = F.splitIdx(a.length); if (s === held) teL.push(...a.slice(k)); else trL.push(...a.slice(0, k)); }
      if (!teL.length || !trL.length) continue;
      const b = F.logitFit(trL.map(r => r.xb), trL.map(yOf));
      const g = F.logitFit(trL.map(r => r.xb.concat(r.xm)), trL.map(yOf));
      for (const r of teL) { n++; if ((b.predict(r.xb) >= 0.5 ? 1 : 0) === yOf(r)) hB++; if ((g.predict(r.xb.concat(r.xm)) >= 0.5 ? 1 : 0) === yOf(r)) hA++; }
    }
    losoTxt = ` · LOSO ${pp(hA / n - hB / n)}`;
  }
  console.log(`  [${label}] n=${te.length} base ${pct(base)} · 구조단독 ${pct(aB)} → +매크로 ${pct(aA)} = 순증분 ${pp(aA - aB)}${losoTxt} · 전/후반 ${pp(h1)}/${pp(h2)}`);
  console.log(`      (다수결 ${pct(majAcc)} · 지속성 ${pct(persAcc)} · '이벤트내일' 규칙 ${pct(evRule)})`);
}

function main() {
  if (process.argv.includes("--audit")) return audit();
  // ① 미국주식 30종(2019~, 인트라데이 재구성)
  const files = fs.existsSync(IDIR) ? fs.readdirSync(IDIR).filter(f => f.endsWith("-1h.json")) : [];
  let rows = [];
  for (const f of files) {
    const sym = f.replace("-1h.json", "");
    const days = loadIntradayDaily(sym); if (!days || days.length < START + 20) continue;
    rows = rows.concat(buildRows(days, eventIdx(days, EV.fomc), eventIdx(days, EV.cpi), sym));
  }
  console.log(`\n== 매크로 캘린더 — 미국주식 ${files.length}종(2019~) 표본 ${rows.length} ==`);
  evalTarget(rows, "y1", "py1", "T1 내일 급변(>1.5σ)");
  evalTarget(rows, "y5", "py5", "T2 5봉 변동성 확대");
  // ② SPY 장기(2011~ FOMC 커버 구간)
  const spy = loadSPY().filter(c => c.t >= "2010-01-01");
  const sRows = buildRows(spy, eventIdx(spy, EV.fomc), eventIdx(spy, EV.cpi), "SPY");
  console.log(`\n== SPY 장기(2010~) 표본 ${sRows.length} ==`);
  evalTarget(sRows, "y1", "py1", "SPY T1 내일 급변");
  evalTarget(sRows, "y5", "py5", "SPY T2 5봉 확대");
  console.log("\n관문: 순증분 +1.0pp↑(OOS·LOSO) & 전/후반 양수 — '이벤트내일' 자명규칙과도 대조");
}
main();
