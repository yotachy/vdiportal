// backtest/explore-lab.js — 변동성 예측·콘 검증 + 트리플 배리어 + 국면/지표 선별
// 엔진 1패스로 시점별 캡처 후 3개 분석. 일봉 픽스처.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");

const WARMUP = 200, LOOKBACK = 600, H = 40, STRIDE = 10;

function realizedVol(price, a, b) { // a..b 로그수익 표준편차(연율화 아님, 봉단위)
  let s = 0, m = 0, n = 0; const rs = [];
  for (let i = a + 1; i <= b; i++) { const r = Math.log(price[i] / price[i - 1]); rs.push(r); m += r; n++; }
  m /= (n || 1); for (const r of rs) s += (r - m) * (r - m); return Math.sqrt(s / (n || 1));
}

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));
  const recs = [];
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const price = fx.candle.map(c => c.c), hi = fx.candle.map(c => c.h), lo = fx.candle.map(c => c.l), N = price.length;
    const g = B.standardGraph();
    for (let t = WARMUP; t <= N - H - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: fx.candle.slice(s0, t + 1) }, { futW: H, timeframe: "1day" }); } catch (e) { continue; }
      const v = r.verdict, p = r.prediction, ctx = v && v.context; if (!ctx || !p || !p.path) continue;
      // 콘 폭(예측 밴드): H시점 hi/lo의 로그폭
      const coneW = (p.hi && p.lo && p.hi[H - 1] > 0 && p.lo[H - 1] > 0) ? Math.log(p.hi[H - 1] / p.lo[H - 1]) : null;
      const pastVol = realizedVol(price, t - 40, t);   // 최근 40봉 실현변동성
      const fwdVol = realizedVol(price, t, t + H);      // 미래 H봉 실현변동성
      // 트리플 배리어: 진입 후 H봉 내 +tgt 먼저 vs -stop 먼저 (intrabar high/low)
      const entry = price[t]; let barrier = 0; // +1 목표먼저 / -1 손절먼저 / 0 무터치
      const tgt = entry * 1.05, stp = entry * 0.95;
      for (let k = t + 1; k <= t + H; k++) { if (hi[k] >= tgt) { barrier = 1; break; } if (lo[k] <= stp) { barrier = -1; break; } }
      recs.push({
        sym: fx.symbol, state: ctx.state, strength: ctx.strength,
        opp: ctx.opportunity ? ctx.opportunity.kind : null,
        coneW, pastVol, fwdVol,
        barrier, fwdRet: price[t + H] / entry - 1,
        // 국면 검증: 미래 실현 추세성(|이동|/경로합) — range면 낮아야
        fwdTrendiness: (function () { let mv = Math.abs(price[t + H] - entry), pathlen = 0; for (let k = t + 1; k <= t + H; k++) pathlen += Math.abs(price[k] - price[k - 1]); return pathlen ? mv / pathlen : 0; })(),
      });
    }
    console.error("  " + fx.symbol);
  }
  const P = x => x == null ? "–" : (x * 100).toFixed(1) + "%";
  const corr = (xs, ys) => { const n = xs.length; if (n < 3) return 0; let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return (sxx && syy) ? sxy / Math.sqrt(sxx * syy) : 0; };

  console.log("\n===== 1) 변동성 예측·콘 검증 (" + recs.length + "시점) =====");
  const vv = recs.filter(r => isFinite(r.pastVol) && isFinite(r.fwdVol) && r.pastVol > 0);
  console.log("과거변동성 → 미래변동성 상관: " + corr(vv.map(r => r.pastVol), vv.map(r => r.fwdVol)).toFixed(3) + " (높을수록 변동성 예측 가능=군집성)");
  const cw = recs.filter(r => isFinite(r.coneW) && isFinite(r.fwdVol));
  console.log("엔진 콘 폭 → 미래변동성 상관: " + corr(cw.map(r => r.coneW), cw.map(r => r.fwdVol)).toFixed(3) + " (콘이 실제 변동성을 반영하나)");
  // 고/저 변동성 분위 예측: 과거변동성 상위30% vs 하위30%의 미래변동성 비교
  const sv = vv.slice().sort((a, b) => a.pastVol - b.pastVol); const q = Math.floor(sv.length * 0.3);
  const loFV = sv.slice(0, q).reduce((a, r) => a + r.fwdVol, 0) / q, hiFV = sv.slice(-q).reduce((a, r) => a + r.fwdVol, 0) / q;
  console.log("과거 저변동 30% → 미래변동 평균 " + P(loFV) + " / 과거 고변동 30% → " + P(hiFV) + " (차이 크면 예측력↑)");

  console.log("\n===== 2) 트리플 배리어 (진입 후 " + H + "봉 내 ±5% 먼저 터치) =====");
  const grp = (name, rs) => { const tg = rs.filter(r => r.barrier === 1).length, st = rs.filter(r => r.barrier === -1).length, nt = rs.filter(r => r.barrier === 0).length; const dec = tg + st; console.log("  " + name.padEnd(22) + " n=" + rs.length + " · 목표먼저 " + tg + "(" + P(dec ? tg / dec : 0) + ") · 손절먼저 " + st + " · 무터치 " + nt); };
  grp("전체(아무때나 진입)", recs);
  grp("지지반등 신호(opp=buy)", recs.filter(r => r.opp === "buy"));
  grp("횡보장", recs.filter(r => r.state === "range"));
  grp("상승추세장", recs.filter(r => r.state === "up"));
  console.log("  → 목표먼저 비율>55%면 그 셋업은 +5%:−5% 대칭배리어에서 유리(진짜 진입 우위)");

  console.log("\n===== 3) 국면 분류 검증 =====");
  const byst = {}; for (const r of recs) { (byst[r.state] = byst[r.state] || []).push(r.fwdTrendiness); }
  for (const st of ["range", "up", "down"]) { const a = byst[st]; if (!a || !a.length) continue; console.log("  국면=" + st.padEnd(6) + " → 미래 추세성(0=횡보,1=일방) 평균 " + (a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) + " (n=" + a.length + ")"); }
  console.log("  → range의 추세성이 up/down보다 낮으면 국면 분류가 미래와 정합(진짜 예측)");
}
main();
