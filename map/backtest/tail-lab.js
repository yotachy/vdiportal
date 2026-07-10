// backtest/tail-lab.js — 꼬리위험(tail risk) 예측 가능성 정직 검증(새 랩·공유파일 불변).
// 후보 3종을 변동성 구조 10피처(train-ddrisk 방식) 로지스틱으로 학습, 이중 베이스라인 대조.
//   (a) jump   : 향후 H봉 내 단일봉 급변(|일수익| > K×최근20봉 변동성) 발생
//   (b) dd10   : 향후 H봉 내 ≥10% 낙폭(희귀사건 — 지평/문턱 스윕으로 양성률 25~40% 밴드 탐색)
//   (c) volTop : 향후 H봉 실현변동성이 종목 역사 상위 20%(고변동 국면 진입)
// 규율: OOS(종목별 앞60%train/뒤40%test) · lookahead 금지 · 다수결&지속성 둘 다 ≥+1%p 초과해야 진짜.
"use strict";
const fs = require("fs"), path = require("path");
const STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6;

// ── 공유 랩과 동일한 변동성 구조 피처(9 + vol-regime 백분위) ──
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function feats(price, hi, lo, t) {
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!v20 || !v60 || !v120) return null;
  const atr = atrp(hi, lo, price, t, 14);
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vmean = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vmean) ** 2, 0) / vs.length) / (vmean || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  const hist = []; for (let k = t - 252; k <= t; k += 3) { if (k - 20 >= 0) { const vv = rvol(price, k, 20); if (vv) hist.push(vv); } }
  let pct = 0.5; if (hist.length > 5) { let c = 0; for (const v of hist) if (v <= v20) c++; pct = c / hist.length; }
  return [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60), pct];
}
function train(TR, D) {
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 2e-3, EP = 400;
  for (let ep = 0; ep < EP; ep++) { const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length; }
  return x => { const zx = z(x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; return 1 / (1 + Math.exp(-s)); };
}
// key=타깃 라벨, baseKey=지속성(현 상태 유지) 라벨. 다수결은 자동 계산.
function evalTarget(name, rows, key, baseKey) {
  const TR = rows.filter(r => r._tr && r[key] != null).map(r => ({ x: r.x, y: r[key] })), TE = rows.filter(r => !r._tr && r[key] != null);
  if (TR.length < 100 || TE.length < 50) return { name, skip: true };
  const D = TR[0].x.length, pred = train(TR, D);
  let hit = 0, bhit = 0, pos = 0;
  for (const r of TE) { const call = pred(r.x) >= 0.5 ? 1 : 0; if (call === r[key]) hit++; if (r[baseKey] === r[key]) bhit++; if (r[key] === 1) pos++; }
  const acc = hit / TE.length, pers = bhit / TE.length, posRate = pos / TE.length, base = Math.max(posRate, 1 - posRate);
  const beat = acc > base + 0.01 && acc > pers + 0.01;
  return { name, acc, pers, base, posRate, beat, n: TE.length };
}
const P = x => (x * 100).toFixed(1) + "%";
function printRow(r) {
  if (r.skip) { console.log("  " + r.name.padEnd(30) + " — 표본부족"); return; }
  const band = r.posRate >= 0.25 && r.posRate <= 0.40 ? "" : (r.posRate < 0.25 ? " (희귀)" : " (흔함)");
  const mk = r.beat ? (r.acc >= 0.62 ? "  ★진짜&강" : "  ✓진짜(두기준초과)") : "  (신기루—기준미달)";
  console.log("  " + r.name.padEnd(30) + " 정확도 " + P(r.acc) + " · 다수결 " + P(r.base) + " · 지속성 " + P(r.pers) + " · 양성률 " + P(r.posRate) + band + mk);
}

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));

  // 검증 지평 구성. (a)jump·(c)volTop 은 H=20 기본, (b)dd10 은 지평 스윕(20/40/60/80).
  const HJ = 20;                 // jump/volTop 기준 지평
  const KS = [2.0, 2.5, 3.0];    // 단일봉 급변 배수 후보(주 2.5)
  const DDH = [20, 40, 60, 80];  // dd10 지평 스윕
  const DDTHR = [0.08, 0.10, 0.12]; // dd 문턱 후보
  const MAXH = Math.max(HJ, Math.max.apply(null, DDH));

  const rows = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
    if (N < WARM + MAXH + 40) continue;

    // 종목별: volTop 국면 문턱 = 전 구간 trailing H봉 실현변동성의 80분위(라벨 정의용, 양 베이스라인 공유)
    const trailV = [];
    for (let k = WARM; k <= N - 1; k++) { const vv = rvol(price, k, HJ); if (isFinite(vv) && vv > 0) trailV.push(vv); }
    const sv = trailV.slice().sort((a, b) => a - b);
    const thr80 = sv.length ? sv[Math.floor(sv.length * 0.80)] : Infinity;
    const thr50 = sv.length ? sv[Math.floor(sv.length * 0.50)] : Infinity;  // 진단용 중앙값 분할

    const local = [];
    for (let t = WARM; t <= N - MAXH - 1; t += STRIDE) {
      const x = feats(price, hi, lo, t); if (!x || x.some(v => !isFinite(v))) continue;
      const v20 = rvol(price, t, 20);                 // 급변 기준 변동성(현재 시점, per-bar)
      const row = { x };

      // (a) 단일봉 급변: 향후 HJ봉 중 |일수익| > K×v20 발생 / 지속성=과거 HJ봉에 발생
      for (const K of KS) {
        const thr = K * v20;
        let fut = 0; for (let i = t + 1; i <= t + HJ; i++) { if (Math.abs(price[i] / price[i - 1] - 1) > thr) { fut = 1; break; } }
        let pas = 0; for (let i = t - HJ + 1; i <= t; i++) { if (Math.abs(price[i] / price[i - 1] - 1) > thr) { pas = 1; break; } }
        row["jmp" + K] = fut; row["_pjmp" + K] = pas;
      }

      // (b) dd10 스윕: 지평 H·문턱 THR 조합. 낙폭=현재가 대비 종가 최저. 지속성=과거 H봉 낙폭.
      for (const H of DDH) {
        let futLo = Infinity; for (let i = t + 1; i <= t + H; i++) { const rr = price[i] / price[t] - 1; if (rr < futLo) futLo = rr; }
        let pasLo = Infinity; for (let i = t - H + 1; i <= t; i++) { const rr = price[i] / price[t - H] - 1; if (rr < pasLo) pasLo = rr; }
        for (const THR of DDTHR) { row["dd_" + H + "_" + THR] = futLo <= -THR ? 1 : 0; row["_pdd_" + H + "_" + THR] = pasLo <= -THR ? 1 : 0; }
      }

      // (c) volTop: 향후 HJ봉 실현변동성이 종목 상위20%(≥thr80). 지속성=현재 trailing vol 상위20%.
      const futV = rvol(price, t + HJ, HJ);           // 순수 미래(t+1..t+HJ)
      const curV = rvol(price, t, HJ);
      row.volTop = futV >= thr80 ? 1 : 0; row._pvolTop = curV >= thr80 ? 1 : 0;
      row.volHi = futV >= thr50 ? 1 : 0; row._pvolHi = curV >= thr50 ? 1 : 0;  // 진단: 균형(중앙값) 고변동

      local.push(row);
    }
    const cut = Math.floor(local.length * TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; rows.push(r); });
  }

  console.log("=== 꼬리위험(tail risk) 정직 검증 (일봉 " + files.length + "종 · OOS · 변동성구조 10피처) ===");
  console.log("총 " + rows.length + "시점 · 진짜 = 다수결 & 지속성 둘 다 ≥+1%p 초과\n");

  console.log("── (a) 단일봉 급변: 향후 " + HJ + "봉 내 |일수익| > K×최근변동성 ──");
  for (const K of KS) printRow(evalTarget("급변 K=" + K + "σ", rows, "jmp" + K, "_pjmp" + K));
  console.log("");

  console.log("── (b) ≥문턱 낙폭(dd10 재검증·지평/문턱 스윕, 양성률 25~40% 밴드 탐색) ──");
  for (const H of DDH) for (const THR of DDTHR) printRow(evalTarget("낙폭≥" + (THR * 100) + "% H" + H, rows, "dd_" + H + "_" + THR, "_pdd_" + H + "_" + THR));
  console.log("");

  console.log("── (c) 고변동 국면 진입: 향후 " + HJ + "봉 실현변동성 상위20% ──");
  printRow(evalTarget("고변동국면(vol top20%)", rows, "volTop", "_pvolTop"));
  printRow(evalTarget("[진단] 균형 고변동(중앙값)", rows, "volHi", "_pvolHi"));
  console.log("");
  console.log("판정: ✓/★ = 이중 베이스라인 초과(진짜) → v1.8 낙폭리스크 확장 후보. (신기루) = base-rate 신기루로 기각.");
}
main();
