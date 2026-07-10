// backtest/confluence-lab.js — 타임프레임 합의(confluence) 실험
// 가설: 일·주·월 방향이 일치하는 부분집합은 고신뢰 = 예측률↑ (메모리 '다음 작업' 미검증 후보 1번)
// 방법: 각 일봉 시점 t에서 [s0..t] 일봉으로 (1) 일봉 엔진 실행, (2) 전체 일봉[0..t]을 주/월로
//       리샘플링해 각각 엔진 실행 → 세 verdict.score 부호. lookahead 없음(전부 ≤t).
// 규율: 어떤 부분집합이든 반드시 '항상상승' base-rate 및 전체집합과 대조(신기루 차단).
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");

const WARMUP = 250, DAY_LOOKBACK = 600, MAXH = 60, STRIDE = 20;
const HORIZONS = [20, 40, 60];
// 다중 타임프레임이 모두 존재하는 심볼만(일봉 픽스처로 리샘플)
const MULTI = ["AAPL", "AMD", "DIS", "EUR-USD", "INTC", "JNJ", "JPM", "KO", "MSFT", "NVDA", "PG", "USD-KRW", "WMT", "XOM"];

function resample(candle, group) {   // 최근 봉이 끝에 오도록 끝에서부터 group개씩 묶음
  const out = [];
  for (let end = candle.length; end > 0; end -= group) {
    const start = Math.max(0, end - group);
    const seg = candle.slice(start, end);
    out.unshift({
      o: seg[0].o, c: seg[seg.length - 1].c,
      h: Math.max.apply(null, seg.map(x => x.h)),
      l: Math.min.apply(null, seg.map(x => x.l)),
      v: seg.reduce((a, x) => a + (x.v || 0), 0),
    });
  }
  return out;
}

function scoreSign(candle, tf) {
  const price = candle.map(c => c.c);
  const g = B.standardGraph();
  let r; try { r = FC.run(g, { price, candle }, { futW: MAXH, timeframe: tf }); } catch (e) { return null; }
  return r && r.verdict ? Math.sign(r.verdict.score || 0) : null;
}

function capture() {
  const dir = path.join(__dirname, "fixtures");
  const recs = [];
  for (const sym of MULTI) {
    const p = path.join(dir, sym + "-1day.json");
    if (!fs.existsSync(p)) { console.error("  skip(no fixture) " + sym); continue; }
    const fx = JSON.parse(fs.readFileSync(p, "utf8"));
    const price = fx.candle.map(c => c.c), N = price.length;
    let cnt = 0;
    for (let t = WARMUP; t <= N - MAXH - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - DAY_LOOKBACK);
      const daySeg = fx.candle.slice(s0, t + 1);
      const dSign = scoreSign(daySeg, "1day");
      if (dSign === null) continue;
      // 주/월은 전체 이력[0..t]을 리샘플(실제 주월 분석 = 장기 이력)
      const full = fx.candle.slice(0, t + 1);
      const wSign = scoreSign(resample(full, 5), "1week");
      const mSign = scoreSign(resample(full, 21), "1month");
      if (wSign === null || mSign === null) continue;
      const act = {}; for (const h of HORIZONS) act[h] = Math.sign(price[t + h] - price[t]);
      const ret = {}; for (const h of HORIZONS) ret[h] = price[t + h] / price[t] - 1;
      // 미래 실현변동성(향후 h봉 일간수익 표준편차) + 과거 실현변동성(직전 h봉) — 변동성 확대/축소 라벨용
      const fvol = {}, pvol = {}; for (const h of HORIZONS) { fvol[h] = rvol(price, t, h, +1); pvol[h] = rvol(price, t, h, -1); }
      recs.push({ sym, d: dSign, w: wSign, m: mSign, act, ret, fvol, pvol });
      cnt++;
    }
    console.error("  " + sym + " → " + cnt);
  }
  return recs;
}

// 실현변동성: dir=+1 → [t+1..t+h] 미래, dir=-1 → [t-h+1..t] 과거. 일간 로그수익 표준편차.
function rvol(price, t, h, dir) {
  const rs = [];
  if (dir > 0) { for (let i = 1; i <= h && t + i < price.length; i++) rs.push(Math.log(price[t + i] / price[t + i - 1])); }
  else { for (let i = 0; i < h && t - i - 1 >= 0; i++) rs.push(Math.log(price[t - i] / price[t - i - 1])); }
  if (rs.length < 2) return 0;
  const mu = rs.reduce((a, b) => a + b, 0) / rs.length;
  return Math.sqrt(rs.reduce((a, b) => a + (b - mu) * (b - mu), 0) / rs.length);
}

// 방향집합 평가: 예측부호 pred, 실제 act[h] 비교. 항상상승 base-rate와 대조.
function evalSet(recs, pick, h) {
  let hit = 0, tot = 0, up = 0, sumRet = 0;
  let dnN = 0, dnHit = 0;
  for (const r of recs) {
    if (!pick(r)) continue;
    const a = r.act[h]; if (!a) continue;
    const pred = pickPred(r);        // 예측 부호(일봉 기준)
    tot++;
    if (a > 0) up++;
    sumRet += r.ret[h];
    if (Math.sign(pred) === a) hit++;
    if (pred < 0) { dnN++; if (a < 0) dnHit++; }
  }
  return { n: tot, rate: tot ? hit / tot : 0, baseUp: tot ? up / tot : 0,
           lift: tot ? hit / tot - Math.max(up, tot - up) / tot : 0,   // 최선의 상수(항상상승/항상하락) 대비
           avgRet: tot ? sumRet / tot : 0, dnN, dnRate: dnN ? dnHit / dnN : 0 };
}
let pickPred = r => r.d;   // 기본 예측 = 일봉 방향

function pct(x) { return (x * 100).toFixed(1) + "%"; }
function row(label, s) {
  return label.padEnd(26) + " n=" + String(s.n).padStart(5) +
    "  적중 " + pct(s.rate).padStart(6) + "  항상상승 " + pct(s.baseUp).padStart(6) +
    "  lift " + (s.lift >= 0 ? "+" : "") + (s.lift * 100).toFixed(1) + "%p" +
    "  평균수익 " + (s.avgRet >= 0 ? "+" : "") + (s.avgRet * 100).toFixed(2) + "%" +
    (s.dnN >= 20 ? "  하락콜 " + pct(s.dnRate) + "(n" + s.dnN + ")" : "");
}

// 변동성 확대 예측 평가: 부분집합에서 '미래변동성 > 과거변동성' 비율(=확대) + 실제 미래/과거 변동성 평균.
// base-rate(전체 확대비율)와 대조해야 신기루 아님을 확인.
function evalVol(recs, pick, h) {
  let n = 0, exp = 0, sf = 0, sp = 0;
  for (const r of recs) {
    if (!pick(r)) continue;
    if (!r.fvol[h] || !r.pvol[h]) continue;
    n++;
    if (r.fvol[h] > r.pvol[h]) exp++;
    sf += r.fvol[h]; sp += r.pvol[h];
  }
  return { n, expRate: n ? exp / n : 0, fvol: n ? sf / n : 0, pvol: n ? sp / n : 0, ratio: sp ? (sf / sp) : 0 };
}
function vrow(label, s, base) {
  return label.padEnd(26) + " n=" + String(s.n).padStart(5) +
    "  확대비율 " + (s.expRate * 100).toFixed(1) + "%" +
    (base != null ? "(base " + (base * 100).toFixed(1) + "%)" : "") +
    "  미래vol " + (s.fvol * 100).toFixed(2) + "%  과거vol " + (s.pvol * 100).toFixed(2) +
    "%  비율 " + s.ratio.toFixed(2);
}

function main() {
  const cacheF = path.join(__dirname, "confluence-records.json");
  let recs;
  if (process.env.CONF_CACHE && fs.existsSync(cacheF)) {
    recs = JSON.parse(fs.readFileSync(cacheF, "utf8"));
    console.error("캐시 로드: " + recs.length + " 시점");
  } else {
    console.error("캡처 중 (14종 × 3TF)…");
    recs = capture();
    fs.writeFileSync(cacheF, JSON.stringify(recs));
    console.error("캐시 저장: " + cacheF);
  }
  console.log("\n=== 타임프레임 합의(confluence) 실험 — 총 " + recs.length + " 시점 ===\n");
  for (const h of HORIZONS) {
    console.log("── 지평 " + h + "봉 ──");
    console.log(row("전체(일봉 방향)", evalSet(recs, () => true, h)));
    console.log(row("3TF 전부일치", evalSet(recs, r => r.d === r.w && r.w === r.m && r.d !== 0, h)));
    console.log(row("  └ 전부 상승합의", evalSet(recs, r => r.d > 0 && r.w > 0 && r.m > 0, h)));
    console.log(row("  └ 전부 하락합의", evalSet(recs, r => r.d < 0 && r.w < 0 && r.m < 0, h)));
    console.log(row("주+월 일치(일무관)", evalSet(recs, r => r.w === r.m && r.w !== 0, h)));
    console.log(row("일↔주월 불일치", evalSet(recs, r => r.w === r.m && r.w !== 0 && r.d !== r.w, h)));
    console.log(row("3TF 불일치(분산)", evalSet(recs, r => !(r.d === r.w && r.w === r.m), h)));
    // 상위TF(주+월) 방향을 예측으로 쓸 때 (합의/불일치 각각)
    pickPred = r => (r.w + r.m);
    console.log(row("[상위TF예측] 주+월일치", evalSet(recs, r => r.w === r.m && r.w !== 0, h)));
    console.log(row("[상위TF예측] 불일치집합", evalSet(recs, r => r.w === r.m && r.w !== 0 && r.d !== r.w, h)));
    pickPred = r => r.d;
    console.log("");
  }
  // ── 변동성 확대 축 (작동 축 가설: TF 불일치 → 변동성 확대?) ──
  console.log("═══ 변동성 확대 예측: TF 합의 vs 불일치 ═══");
  for (const h of HORIZONS) {
    const base = evalVol(recs, () => true, h);
    console.log("── 지평 " + h + "봉 (전체 확대 base-rate " + (base.expRate * 100).toFixed(1) + "%) ──");
    console.log(vrow("3TF 전부일치", evalVol(recs, r => r.d === r.w && r.w === r.m, h), base.expRate));
    console.log(vrow("3TF 불일치(분산)", evalVol(recs, r => !(r.d === r.w && r.w === r.m), h), base.expRate));
    console.log(vrow("일↔주월 불일치", evalVol(recs, r => r.w === r.m && r.w !== 0 && r.d !== r.w, h), base.expRate));
    console.log("");
  }
}
main();
