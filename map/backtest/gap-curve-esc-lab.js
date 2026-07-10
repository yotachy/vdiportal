// backtest/gap-lab.js — 오버나잇 갭 리스크(overnight gap) 예측 정직 검증 랩 (주식 한정).
// 가설: 향후 H봉 내 "큰 오버나잇 갭"(|open_i/close_{i-1}−1| > K×트레일링갭변동성) 발생을
//       변동성구조+가격구조+갭구조 피처로 예측 가능한가? 급변경보(일중·종가)와 다른 데이터 슬라이스.
// 규율: 주식만 / OOS 종목별 60·40 / 이중베이스라인(다수결·지속성) / 양성률 25~50% / 급변중복성 / 방향무관.
// 공유파일(forge-core.js 등) 무수정. fixtures만 로드.
"use strict";
const fs = require("fs"), path = require("path");

const H_LIST = [20, 30, 40];
const K_GAP = 2.2;         // 갭 임계 배수(트레일링 갭변동성 대비) — 양성률 25~50% 겨냥
const GAPVOL_N = 60;       // 트레일링 갭변동성 창
const STRIDE = 2, WARM = 260, TRAIN_FRAC = 0.6;

// ── 종목 분류 (주식만; 24h시장·상품 제외) ──
const dir = path.join(__dirname, "fixtures");
const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
const isKRStock = base => /^\d{6}$/.test(base);
const NON_STOCK = /^(ADA|BCH|BTC|DOGE|ETH|LTC|SOL|XRP|XAU)-USD$|^(AUD|EUR|GBP)-USD$|^USD-(JPY|KRW)$|^(EUR|GBP|AUD)-|^USD-/;
function classify(base) {
  if (isKRStock(base)) return "KR_stock";
  if (NON_STOCK.test(base)) return base.includes("XAU") ? "commodity" : (base.startsWith("USD-") || base.endsWith("-USD") && /^(AUD|EUR|GBP)/.test(base) ? "fx" : (/(ADA|BCH|BTC|DOGE|ETH|LTC|SOL|XRP)/.test(base) ? "crypto" : "fx"));
  return "US_stock";
}

// ── 피처 헬퍼 ──
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) s += Math.log(a[i] / a[i - 1]) ** 2; return Math.sqrt(s / n); }
function atrp(hi, lo, cl, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])); s += tr; } return s / n / cl[e]; }
function gapVol(gap, e, n) { let s = 0, c = 0; for (let i = e - n + 1; i <= e; i++) { if (i >= 1) { s += gap[i] * gap[i]; c++; } } return c ? Math.sqrt(s / c) : 0; }

// 변동성구조 피처(급변모델과 동형 — 중복성 베이스라인 C에 사용)
function volFeats(price, hi, lo, t) {
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

// 갭구조 피처(신규 데이터 슬라이스 — 이게 증분을 주는지가 핵심)
function gapFeats(price, gap, t) {
  const v20 = rvol(price, t, 20) || 1e-9;
  const gv = gapVol(gap, t, GAPVOL_N);
  const lastAbs = Math.abs(gap[t]);
  // 과거 20봉 내 큰 갭 클러스터링
  let cl = 0; for (let i = t - 19; i <= t; i++) if (i >= 1 && Math.abs(gap[i]) > 1.5 * gv) cl++;
  // 최근 5봉 평균 갭절대
  let r5 = 0; for (let i = t - 4; i <= t; i++) if (i >= 1) r5 += Math.abs(gap[i]); r5 /= 5;
  // 갭변동성 / 일중변동성 비 (갭이 총변동성에서 차지하는 몫)
  return [gv * 100, lastAbs * 100, cl, r5 * 100, gv / v20];
}

function fit(TR, D, EP) {
  EP = EP || 400;
  const mean = new Array(D).fill(0), std = new Array(D).fill(0);
  for (const r of TR) for (let j = 0; j < D; j++) mean[j] += r.x[j]; for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) for (let j = 0; j < D; j++) std[j] += (r.x[j] - mean[j]) ** 2; for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  const z = x => x.map((v, j) => (v - mean[j]) / std[j]);
  let w = new Array(D).fill(0), b = 0; const LR = 0.1, L2 = 2e-3;
  for (let ep = 0; ep < EP; ep++) {
    const gw = new Array(D).fill(0); let gb = 0;
    for (const r of TR) { const zx = z(r.x); let s = b; for (let j = 0; j < D; j++) s += w[j] * zx[j]; const p = 1 / (1 + Math.exp(-s)); const e = p - r.y; for (let j = 0; j < D; j++) gw[j] += e * zx[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= LR * (gw[j] / TR.length + L2 * w[j]); b -= LR * gb / TR.length;
  }
  return { mean, std, w, b };
}
function acc(M, TE, slice) {
  const idx = slice || ((x) => x);
  const z = x => idx(x).map((v, j) => (v - M.mean[j]) / M.std[j]);
  let h = 0; for (const r of TE) { let s = M.b; const zx = z(r.x); for (let j = 0; j < M.w.length; j++) s += M.w[j] * zx[j]; if ((s >= 0 ? 1 : 0) === r.y) h++; }
  return h / TE.length;
}

// ── 데이터 축적 ──
const excluded = {}, stockSyms = [];
function run(H, K) {
  const all = [];
  let upEv = 0, downEv = 0;                // 방향무관 확인
  for (const f of files) {
    const base = f.replace("-1day.json", "");
    const cls = classify(base);
    if (cls !== "US_stock" && cls !== "KR_stock") { excluded[base] = cls; continue; }
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const c = fx.candle, N = c.length;
    if (N < WARM + H + 40) { excluded[base] = "too_short(" + N + ")"; continue; }
    if (!stockSyms.includes(base)) stockSyms.push(base);
    const price = c.map(x => x.c), hi = c.map(x => x.h), lo = c.map(x => x.l), op = c.map(x => x.o);
    const gap = new Array(N).fill(0); for (let i = 1; i < N; i++) gap[i] = op[i] / price[i - 1] - 1;
    const local = [];
    for (let t = WARM; t <= N - H - 1; t += STRIDE) {
      const vf = volFeats(price, hi, lo, t); if (!vf) continue;
      const gf = gapFeats(price, gap, t);
      const x = [...vf, ...gf]; if (x.some(v => !isFinite(v))) continue;
      const gv = gapVol(gap, t, GAPVOL_N); if (!gv) continue;
      const thr = K * gv;
      // 미래 H봉 내 큰 갭(방향무관)
      let fut = 0; for (let i = t + 1; i <= t + H; i++) { if (Math.abs(gap[i]) > thr) { fut = 1; if (gap[i] > 0) upEv++; else downEv++; break; } }
      // 지속성 베이스라인: 과거 H봉 내 큰 갭
      let pas = 0; for (let i = t - H + 1; i <= t; i++) { if (i >= 1 && Math.abs(gap[i]) > thr) { pas = 1; break; } }
      // 급중복 베이스라인용 급변 라벨(일중 종가기준 급변): 과거 H봉 내 |일수익|>2.5σ (지속성 미러)
      const sv = rvol(price, t, 20); let spikePas = 0; for (let i = t - H + 1; i <= t; i++) if (i >= 1 && Math.abs(price[i] / price[i - 1] - 1) > 2.5 * sv) { spikePas = 1; break; }
      local.push({ x, y: fut, _p: pas, _sp: spikePas, sym: base });
    }
    const cut = Math.floor(local.length * TRAIN_FRAC); local.forEach((r, i) => { r._tr = i < cut; all.push(r); });
  }
  const DV = 10;                                        // 변동성구조 피처 수
  const D = all[0].x.length;                            // 전체 피처 수
  const TR = all.filter(r => r._tr), TE = all.filter(r => !r._tr);
  const posRate = TE.filter(r => r.y).length / TE.length;
  const base = Math.max(posRate, 1 - posRate);          // A: 다수결
  const pers = TE.filter(r => r._p === r.y).length / TE.length; // B: 지속성
  const spikePers = TE.filter(r => r._sp === r.y).length / TE.length; // 급변-지속성(중복 확인)

  const full = fit(TR, D);                              // 후보: 변동성+갭구조
  const accFull = acc(full, TE);
  const volOnly = fit(TR.map(r => ({ x: r.x.slice(0, DV), y: r.y })), DV); // C: 변동성구조만(급변피처)
  const accVol = acc(volOnly, TE, x => x.slice(0, DV));

  // 종목외(leave-one-symbol) 병행: 각 종목 제외 학습 → 해당 종목 테스트 평균
  // full(변동성+갭)과 volOnly(급변피처만) 둘 다 → 종목외 갭증분 산출(핵심 강건성 관문)
  // (속도: 학습셋 3분의1 서브샘플 + EP 100 — 검증용 근사)
  let xF = 0, xV = 0, xB = 0, xn = 0;
  for (const s of stockSyms) {
    const tr = all.filter((r, i) => r.sym !== s && i % 3 === 0), te = all.filter(r => r.sym === s && !r._tr);
    if (te.length < 20 || tr.length < 200) continue;
    const mF = fit(tr, D, 100); xF += acc(mF, te);
    const mV = fit(tr.map(r => ({ x: r.x.slice(0, DV), y: r.y })), DV, 100); xV += acc(mV, te, x => x.slice(0, DV));
    const p = te.filter(r => r.y).length / te.length; xB += Math.max(p, 1 - p);
    xn++;
  }
  const xsAcc = xn ? xF / xn : NaN, xsVol = xn ? xV / xn : NaN, xsBase = xn ? xB / xn : NaN;

  // 퍼지 분할: 학습셋 끝 H봉 창을 버려 경계 자기상관 제거 → 후보 재평가(누수 점검)
  const purge = Math.ceil(H / STRIDE) + 2;
  const TRp = [], seen = {};
  for (const r of all) { seen[r.sym] = (seen[r.sym] || 0) + 1; }
  // 종목별 인덱스 재계산은 비용↑ → all에 이미 _tr; 학습셋에서 각 종목 마지막 purge개 제외
  const bySym = {}; for (const r of all) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  for (const s in bySym) { const arr = bySym[s], cut = arr.filter(r => r._tr).length; arr.forEach((r, i) => { if (r._tr && i < cut - purge) TRp.push(r); }); }
  const fullP = fit(TRp, D), accFullP = acc(fullP, TE);
  const volP = fit(TRp.map(r => ({ x: r.x.slice(0, DV), y: r.y })), DV), accVolP = acc(volP, TE, x => x.slice(0, DV));

  const modelAll = fit(all, D);                         // 배포계수용(전체 데이터 적합)
  return { H, n: all.length, teN: TE.length, posRate, base, pers, spikePers, accFull, accVol, xsAcc, xsVol, xsBase, accFullP, accVolP, upEv, downEv, modelAll };
}

console.log("=== 오버나잇 갭 리스크 검증 (주식 한정) ===");
console.log("임계 = " + K_GAP + "×트레일링갭변동성(" + GAPVOL_N + "봉) · WARM=" + WARM + " · OOS 종목별 " + (TRAIN_FRAC * 100) + "/" + (100 - TRAIN_FRAC * 100) + "\n");
const results = [[20,2.2],[30,2.7],[40,3.2]].map(([h,k])=>{const r=run(h,k);r._K=k;return r;});
for (const r of results) {
  console.log(`── H=${r.H}봉 ──`);
  console.log(`  샘플 ${r.n} (OOS ${r.teN}) · 양성률 ${(r.posRate * 100).toFixed(1)}%  [갭업 ${r.upEv} / 갭다운 ${r.downEv}]`);
  console.log(`  베이스A 다수결      ${(r.base * 100).toFixed(1)}%`);
  console.log(`  베이스B 지속성      ${(r.pers * 100).toFixed(1)}%`);
  console.log(`  베이스C 변동성구조만 ${(r.accVol * 100).toFixed(1)}%  (급변피처=중복성 상한)`);
  console.log(`  급변-지속성(참고)   ${(r.spikePers * 100).toFixed(1)}%`);
  console.log(`  ▶ 후보(변동성+갭)   ${(r.accFull * 100).toFixed(1)}%`);
  const gA = (r.accFull - r.base) * 100, gB = (r.accFull - r.pers) * 100, gC = (r.accFull - r.accVol) * 100;
  console.log(`  증분(종목내OOS): vs다수결 ${gA >= 0 ? "+" : ""}${gA.toFixed(1)}%p · vs지속성 ${gB >= 0 ? "+" : ""}${gB.toFixed(1)}%p · vs변동성구조 ${gC >= 0 ? "+" : ""}${gC.toFixed(1)}%p`);
  const gPur = (r.accFullP - r.accVolP) * 100;
  console.log(`  퍼지분할: 후보 ${(r.accFullP * 100).toFixed(1)}% · 변동성구조 ${(r.accVolP * 100).toFixed(1)}% → 갭증분 ${gPur >= 0 ? "+" : ""}${gPur.toFixed(1)}%p`);
  const gXsB = (r.xsAcc - r.xsBase) * 100, gXsV = (r.xsAcc - r.xsVol) * 100;
  console.log(`  종목외(LOSO): 후보 ${(r.xsAcc * 100).toFixed(1)}% · 변동성구조 ${(r.xsVol * 100).toFixed(1)}% · 다수결 ${(r.xsBase * 100).toFixed(1)}% → vs다수결 ${gXsB >= 0 ? "+" : ""}${gXsB.toFixed(1)}%p · 갭증분 ${gXsV >= 0 ? "+" : ""}${gXsV.toFixed(1)}%p`);
  const passBal = r.posRate >= 0.25 && r.posRate <= 0.50;
  const passBase = gA >= 1 && gB >= 1;
  const passRedund = gC >= 1;
  const passXs = gXsB >= 1 && gXsV >= 1;    // 종목외에서 다수결·갭증분 둘 다 유지되어야 진짜 새 축
  console.log(`  관문: 양성률균형 ${passBal ? "PASS" : "FAIL"} · 이중베이스+1%p ${passBase ? "PASS" : "FAIL"} · 급변증분+1%p ${passRedund ? "PASS" : "FAIL"} · 종목외강건 ${passXs ? "PASS" : "FAIL"}\n`);
}
console.log("제외 종목(비주식·기타): " + Object.entries(excluded).map(([k, v]) => k + "(" + v + ")").join(", "));
console.log("주식 종목 " + stockSyms.length + "개: " + stockSyms.join(", "));

// ── 채택 지평(H=20)만 배포계수 출력·저장 ──
const acc20 = results.find(r => r.H === 20);
if (acc20) {
  const R = a => a.map(x => +x.toFixed(5)), M = acc20.modelAll;
  const out = {
    axis: "overnight_gap_risk", scope: "stocks_only(US+KR)", H: 20, K_gap: K_GAP, gapvol_n: GAPVOL_N,
    feats: "volStruct10 + gapStruct5 [gv,lastAbs,cluster,r5,gv/v20]",
    posRate: +acc20.posRate.toFixed(3), oosAcc: +acc20.accFull.toFixed(3), losoAcc: +acc20.xsAcc.toFixed(3),
    mean: R(M.mean), std: R(M.std), w: R(M.w), b: +M.b.toFixed(5)
  };
  if(process.env.SAVE)fs.writeFileSync(path.join(__dirname, "gap-model-curve.json"), JSON.stringify(out));
  console.log("\n// 배포계수(H=20 채택) → gap-model.json 저장");
  console.log("W =" + JSON.stringify(out.w));
  console.log("B =" + out.b + "  posRate=" + out.posRate + " oosAcc=" + out.oosAcc + " losoAcc=" + out.losoAcc);
}

// === 곡선 배포계수(3지평 escalating K) ===
console.log("\n=== 갭 곡선 배포계수 ===");
const R5 = a => a.map(x => +x.toFixed(5));
for (const r of results) {
  const M = r.modelAll;
  console.log("H=" + r.H + " K=" + r._K + " posRate=" + r.posRate.toFixed(3) + " oosAcc=" + r.accFull.toFixed(3) + " losoAcc=" + r.xsAcc.toFixed(3));
  console.log("  MEAN=" + JSON.stringify(R5(M.mean)));
  console.log("  STD =" + JSON.stringify(R5(M.std)));
  console.log("  W   =" + JSON.stringify(R5(M.w)));
  console.log("  B   =" + M.b.toFixed(5));
}
