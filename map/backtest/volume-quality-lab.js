// 실거래량 품질(real volume quality) 축 정직 검증 — 주식 40종 한정(v>0).
// 핵심 규율: 가격+변동성구조(_riskFeatures 동형 10피처)=베이스A 대비, 거래량품질 피처의
// **순증분**만 격리 측정. 거래량이 변동성의 재판독(공선)이면 기각.
// 공유파일 무수정. fixtures만 로드. lookahead 금지.
"use strict";
const fs = require("fs"), path = require("path");
const H = 20, STRIDE = 4, WARM = 260;

// ---- 변동성 구조 유틸 (forge-core _riskFeatures 동형) ----
function rvol(a, e, n) { let s = 0; for (let i = e - n + 1; i <= e; i++) { const r = Math.log(a[i] / a[i - 1]); s += r * r; } return Math.sqrt(s / n); }
// 베이스A: forge-core _riskFeatures 와 동일한 10피처.
function baseFeat(price, hi, lo, t) {
  if (t < 220) return null;
  const v10 = rvol(price, t, 10), v20 = rvol(price, t, 20), v60 = rvol(price, t, 60), v120 = rvol(price, t, 120);
  if (!(v20 > 0 && v60 > 0 && v120 > 0)) return null;
  let atr = 0; for (let i = t - 13; i <= t; i++) { const tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - price[i - 1]), Math.abs(lo[i] - price[i - 1])); atr += tr; } atr = atr / 14 / price[t];
  const vs = []; for (let k = t - 40; k <= t; k += 5) { const vv = rvol(price, k, 20); if (vv) vs.push(vv); }
  const vm = vs.reduce((a, b) => a + b, 0) / vs.length, vov = Math.sqrt(vs.reduce((a, b) => a + (b - vm) ** 2, 0) / vs.length) / (vm || 1);
  let rng = 0; for (let i = t - 4; i <= t; i++) rng += (hi[i] - lo[i]) / price[i]; rng /= 5;
  const hist = []; for (let k = t - 252; k <= t; k += 3) { if (k - 20 >= 0) { const vv = rvol(price, k, 20); if (vv) hist.push(vv); } }
  let vpct = 0.5; if (hist.length > 5) { let c = 0; for (const vv of hist) if (vv <= v20) c++; vpct = c / hist.length; }
  const x = [v10 / v60 - 1, v20 / v60 - 1, v20 / v120 - 1, v60 / v120 - 1, atr * 100, vov, rng * 100, v20 * 100, Math.log(v20 / v60), vpct];
  for (let j = 0; j < x.length; j++) if (!isFinite(x[j])) return null;
  return x;
}

// ---- 거래량 품질 피처 (순수 거래량 파생; 가격은 상승/하락 봉 분류에만) ----
function volFeat(price, hi, lo, vol, t) {
  if (t < 130) return null;
  const win = 20;
  let ma20 = 0; for (let i = t - win + 1; i <= t; i++) ma20 += vol[i]; ma20 /= win;
  if (!(ma20 > 0)) return null;
  let ma5 = 0; for (let i = t - 4; i <= t; i++) ma5 += vol[i]; ma5 /= 5;
  // vol-of-volume (거래량의 변동성)
  let vm = 0; for (let i = t - win + 1; i <= t; i++) vm += vol[i]; vm /= win;
  let vv = 0; for (let i = t - win + 1; i <= t; i++) vv += (vol[i] - vm) ** 2; vv = Math.sqrt(vv / win) / (vm || 1);
  // OBV 기울기 (부호=가격방향, 가중=거래량). 최근 20봉 선형회귀 기울기 / ma20 정규화
  const obv = []; let acc = 0;
  for (let i = t - win + 1; i <= t; i++) { const d = price[i] - price[i - 1]; acc += (d > 0 ? 1 : d < 0 ? -1 : 0) * vol[i]; obv.push(acc); }
  const obvSlope = slope(obv) / (ma20 || 1);
  // A/D 라인 기울기 (종가의 봉내 위치 × 거래량; 방향 아닌 위치)
  const ad = []; acc = 0;
  for (let i = t - win + 1; i <= t; i++) { const rng = hi[i] - lo[i]; const mfm = rng > 0 ? ((price[i] - lo[i]) - (hi[i] - price[i])) / rng : 0; acc += mfm * vol[i]; ad.push(acc); }
  const adSlope = slope(ad) / (ma20 || 1);
  // 상승봉/하락봉 거래량비 (매수/매도 압력)
  let upV = 0, dnV = 0; for (let i = t - win + 1; i <= t; i++) { const d = price[i] - price[i - 1]; if (d > 0) upV += vol[i]; else if (d < 0) dnV += vol[i]; }
  const updn = (upV + dnV) > 0 ? upV / (upV + dnV) : 0.5;
  // 거래량 급증 클러스터 (최근 20봉 중 v>2·ma20 비율)
  let surge = 0; for (let i = t - win + 1; i <= t; i++) if (vol[i] > 2 * ma20) surge++; surge /= win;
  // 거래량 백분위 (현재 v 가 최근 120봉 분포에서 위치)
  let c = 0, m = 0; for (let k = t - 120; k <= t; k++) if (vol[k] > 0) { m++; if (vol[k] <= vol[t]) c++; }
  const vpct = m > 5 ? c / m : 0.5;
  const x = [
    Math.log(vol[t] / ma20),   // 상대거래량
    Math.log(ma5 / ma20),      // 단기 거래량 추세
    obvSlope,                  // OBV 기울기 [방향성]
    adSlope,                   // A/D 라인 기울기
    updn,                      // 매수/매도 압력 [방향성]
    vv,                        // vol-of-volume
    surge,                     // 급증 클러스터
    vpct,                      // 거래량 백분위
  ];
  for (let j = 0; j < x.length; j++) if (!isFinite(x[j])) return null;
  return x;
}
function slope(a) { const n = a.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sx += i; sy += a[i]; sxx += i * i; sxy += i * a[i]; } const d = n * sxx - sx * sx; return d ? (n * sxy - sx * sy) / d : 0; }

// ---- 로지스틱 회귀 (표준화 + L2) ----  xk=캐시된 피처배열 필드명
function fit(TR, xk, epochs) {
  const D = TR[0][xk].length; const mean = Array(D).fill(0), std = Array(D).fill(0);
  for (const r of TR) { const x = r[xk]; for (let j = 0; j < D; j++) mean[j] += x[j]; } for (let j = 0; j < D; j++) mean[j] /= TR.length;
  for (const r of TR) { const x = r[xk]; for (let j = 0; j < D; j++) std[j] += (x[j] - mean[j]) ** 2; } for (let j = 0; j < D; j++) std[j] = Math.sqrt(std[j] / TR.length) || 1;
  let w = Array(D).fill(0), b = 0;
  for (let ep = 0; ep < epochs; ep++) {
    const gw = Array(D).fill(0); let gb = 0;
    for (const r of TR) { const x = r[xk]; let s = b; for (let j = 0; j < D; j++) s += w[j] * (x[j] - mean[j]) / std[j]; const p = 1 / (1 + Math.exp(-s)), e = p - r._y; for (let j = 0; j < D; j++) gw[j] += e * (x[j] - mean[j]) / std[j]; gb += e; }
    for (let j = 0; j < D; j++) w[j] -= 0.1 * (gw[j] / TR.length + 2e-3 * w[j]); b -= 0.1 * gb / TR.length;
  }
  return { mean, std, w, b, xk };
}
function predict(M, r) { let s = M.b; const x = r[M.xk]; for (let j = 0; j < M.w.length; j++) s += M.w[j] * (x[j] - M.mean[j]) / M.std[j]; return 1 / (1 + Math.exp(-s)); }
function accOf(M, TE) { let h = 0, pos = 0; for (const r of TE) { const p = predict(M, r); if ((p >= 0.5 ? 1 : 0) === r._y) h++; if (r._y) pos++; } return { acc: h / TE.length, base: Math.max(pos / TE.length, 1 - pos / TE.length), pos: pos / TE.length, n: TE.length }; }

// ---- 데이터 로드 (주식 40종만) ----
const dir = path.join(__dirname, "fixtures"), files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
const bySym = [];
for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const c = fx.candle; if (!c || c.length < WARM + H + 40) continue;
  const price = c.map(x => x.c), hi = c.map(x => x.h), lo = c.map(x => x.l), vol = c.map(x => x.v || 0);
  const nz = vol.filter(v => v > 0).length; if (nz / vol.length < 0.5) continue; // 실거래량 없는 종목 제외
  const N = price.length;
  const rows = [];
  for (let t = WARM; t <= N - H - 1; t += STRIDE) {
    const bf = baseFeat(price, hi, lo, t); if (!bf) continue;
    const vf = volFeat(price, hi, lo, vol, t); if (!vf) continue;
    const v20 = rvol(price, t, 20);
    // 미래(향후 H봉) 타깃 — lookahead 는 타깃 전용, 피처엔 미포함
    let futSq = 0; for (let i = t + 1; i <= t + H; i++) { const r = Math.log(price[i] / price[i - 1]); futSq += r * r; }
    const futRv = Math.sqrt(futSq / H);
    let spike = 0, minP = price[t], big = 0;
    for (let i = t + 1; i <= t + H; i++) { const r = price[i] / price[i - 1] - 1; if (Math.abs(r) > 2.5 * v20) spike = 1; if (price[i] < minP) minP = price[i]; }
    const dd = (minP / price[t] - 1) <= -0.05 ? 1 : 0;
    const retH = price[t + H] / price[t] - 1;
    if (Math.abs(retH) >= 0.05) big = 1;
    rows.push({
      xB: bf, xV: vf, xBV: [...bf, ...vf],   // 캐시된 피처배열 (베이스A / 거래량 / 합침)
      yVol: futRv > v20 ? 1 : 0,     // (1) 변동성 확대
      ySpike: spike,                  // (2) 급변 2.5σ
      yDD: dd,                        // (3) 낙폭 ≥5%
      yBig: big,                      // (4) 큰움직임 방향무관
      retH,                           // 방향 판별용 부호수익
    });
  }
  if (rows.length >= 20) bySym.push({ sym: fx.symbol || f.replace("-1day.json", ""), rows });
}
const totRows = bySym.reduce((a, s) => a + s.rows.length, 0);
console.log(`주식 ${bySym.length}종 · ${totRows}시점 · H=${H} STRIDE=${STRIDE}\n`);

const TARGETS = [
  { key: "yVol", name: "변동성 확대" },
  { key: "ySpike", name: "급변 2.5σ" },
  { key: "yDD", name: "낙폭 ≥5%" },
  { key: "yBig", name: "큰움직임(방향무관)" },
];
const P = x => (x * 100).toFixed(1) + "%";
const PP = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

// ---- 종목내 OOS (각 종목 앞60/뒤40 풀링) ----
function splitInSym() {
  const TR = [], TE = [];
  for (const s of bySym) { const cut = Math.floor(s.rows.length * 0.6); s.rows.forEach((r, i) => (i < cut ? TR : TE).push(r)); }
  return { TR, TE };
}
// ---- 종목외 walk-forward (leave-symbol-out; 각 종목 홀드아웃) ----
function lso(ykey, xk, epochs) {
  let hit = 0, n = 0, posN = 0;
  for (let k = 0; k < bySym.length; k++) {
    const TR = [], TE = bySym[k].rows;
    for (let j = 0; j < bySym.length; j++) if (j !== k) for (const r of bySym[j].rows) TR.push(r);
    TR.forEach(r => r._y = r[ykey]); TE.forEach(r => r._y = r[ykey]);
    const M = fit(TR, xk, epochs);
    for (const r of TE) { const p = predict(M, r); if ((p >= 0.5 ? 1 : 0) === r._y) hit++; if (r._y) posN++; n++; }
  }
  return { acc: hit / n, base: Math.max(posN / n, 1 - posN / n), pos: posN / n, n };
}

console.log("=== 타깃별 증분표 (베이스A=가격+변동성구조 10피처 vs +거래량품질 8피처) ===\n");
const EP_IN = 350, EP_LSO = 260;
const adopted = [];
for (const tg of TARGETS) {
  const { TR, TE } = splitInSym();
  TR.forEach(r => r._y = r[tg.key]); TE.forEach(r => r._y = r[tg.key]);
  // 공선성 진단: base단독 / vol단독 / 합침 (종목내 OOS)
  const mB = fit(TR, "xB", EP_IN), oB = accOf(mB, TE);
  const mV = fit(TR, "xV", EP_IN), oV = accOf(mV, TE);
  const mBV = fit(TR, "xBV", EP_IN), oBV = accOf(mBV, TE);
  const incIn = oBV.acc - oB.acc;
  // 종목외
  const lB = lso(tg.key, "xB", EP_LSO), lBV = lso(tg.key, "xBV", EP_LSO);
  const incLso = lBV.acc - lB.acc;
  // 방향 판별: +거래량 모델 예측 상/하위 그룹의 미래 부호수익 (종목내 TE)
  const scored = TE.map(r => ({ p: predict(mBV, r), ret: r.retH })).sort((a, b) => b.p - a.p);
  const tt = Math.floor(scored.length / 3);
  const topRet = scored.slice(0, tt).reduce((a, r) => a + r.ret, 0) / tt;
  const botRet = scored.slice(-tt).reduce((a, r) => a + r.ret, 0) / tt;
  const topUp = scored.slice(0, tt).filter(r => r.ret > 0).length / tt;

  console.log(`■ ${tg.name}  (양성률 종목내 ${P(oB.pos)} / 종목외 ${P(lB.pos)})`);
  console.log(`   [종목내 OOS]  base단독 ${P(oB.acc)} · vol단독 ${P(oV.acc)} · 합침 ${P(oBV.acc)}  → 순증분 ${PP(incIn)}   (다수결 ${P(oB.base)})`);
  console.log(`   [종목외 WF ]  base ${P(lB.acc)} · 합침 ${P(lBV.acc)}  → 순증분 ${PP(incLso)}   (다수결 ${P(lB.base)})`);
  console.log(`   [공선성] vol단독 ${P(oV.acc)} vs base단독 ${P(oB.acc)}: ${oV.acc > oB.base + 0.005 ? "vol 자체 신호有" : "vol 단독 무의미(≈다수결)"} / 합침이 base초과? ${incIn > 0.005 ? "예" : "아니오(재판독 의심)"}`);
  console.log(`   [방향판별] 상위3분위 미래수익 ${PP(topRet)} · 하위 ${PP(botRet)} · 상위 상승률 ${P(topUp)}  → ${Math.abs(topRet - botRet) < 0.01 ? "방향 무차별(OK)" : "방향 편향 의심"}`);
  const pass = incLso >= 0.01;
  console.log(`   판정: ${pass ? "★채택 후보(종목외 순증분 ≥+1%p)" : "미달"}\n`);
  if (pass) adopted.push({ tg, mBV, lB, lBV });
}

console.log("=== 최종 판정 ===");
if (adopted.length === 0) {
  console.log("전부 미달 → 실거래량 품질 축 기각.");
} else {
  for (const a of adopted) {
    console.log(`채택: ${a.tg.name}  종목외 ${P(a.lB.acc)}→${P(a.lBV.acc)}`);
    // 배포계수: 전체 데이터로 재적합해 출력
    bySym.forEach(s => s.rows.forEach(r => r._y = r[a.tg.key]));
    const ALL = []; bySym.forEach(s => s.rows.forEach(r => ALL.push(r)));
    const M = fit(ALL, "xBV", 500);
    console.log("  mean=[" + M.mean.map(v => +v.toFixed(4)) + "]");
    console.log("  std =[" + M.std.map(v => +v.toFixed(4)) + "]");
    console.log("  w   =[" + M.w.map(v => +v.toFixed(4)) + "]");
    console.log("  b   =" + M.b.toFixed(4));
  }
}
