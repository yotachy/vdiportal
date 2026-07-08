// backtest/momentum-xs.js — 횡단면 모멘텀(종목 순위 로테이션) 백테스트
// 방향예측(시장이 안 허용) 대신 상대강도(학술적 edge 있음)를 검증.
// 미국주식만(동일 거래일) · 끝 정렬(모든 픽스처 ~2026-07 종료) · 엔진 불필요(가격만).
"use strict";
const fs = require("fs"), path = require("path");

const US = ["AAPL", "MSFT", "NVDA", "INTC", "BABA", "PYPL", "DIS", "T", "IBM", "CSCO", "VZ", "PFE", "KO", "GE"];
const LOOKBACKS = [20, 60, 120, 250];   // 모멘텀 산정 기간
const HOLD = 20;                          // 리밸런싱 주기(봉)
const K = 4;                              // 롱 상위 K · 숏 하위 K

function main() {
  const dir = path.join(__dirname, "fixtures");
  const series = {};
  let minLen = Infinity;
  for (const s of US) {
    const p = path.join(dir, s + "-1day.json");
    if (!fs.existsSync(p)) continue;
    const c = JSON.parse(fs.readFileSync(p, "utf8")).candle.map(x => x.c);
    series[s] = c; minLen = Math.min(minLen, c.length);
  }
  const syms = Object.keys(series);
  // 끝 정렬: 각 종목의 마지막 minLen봉 = 동일 거래일 구간(근사)
  for (const s of syms) series[s] = series[s].slice(-minLen);
  console.log("종목 " + syms.length + " · 정렬 길이 " + minLen + "봉\n");

  const P = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";
  console.log("=== 횡단면 모멘텀 롱숏 (상위" + K + " 롱 / 하위" + K + " 숏 · " + HOLD + "봉 보유) ===");
  console.log("가설: 최근 강한 종목이 다음 구간에도 상대적으로 강한가?\n");

  for (const LB of LOOKBACKS) {
    const spreads = [], longR = [], shortR = [], rnd = [];
    let wins = 0, n = 0;
    for (let t = LB; t <= minLen - HOLD - 1; t += HOLD) {
      // 각 종목 모멘텀(최근 LB봉 수익)
      const mom = syms.map(s => ({ s, m: series[s][t] / series[s][t - LB] - 1, fwd: series[s][t + HOLD] / series[s][t] - 1 }))
        .filter(o => isFinite(o.m) && isFinite(o.fwd));
      if (mom.length < 2 * K) continue;
      mom.sort((a, b) => b.m - a.m);
      const longs = mom.slice(0, K), shorts = mom.slice(-K);
      const lr = longs.reduce((a, o) => a + o.fwd, 0) / K;
      const sr = shorts.reduce((a, o) => a + o.fwd, 0) / K;
      const spread = lr - sr;   // 롱숏 스프레드(시장중립)
      spreads.push(spread); longR.push(lr); shortR.push(sr);
      if (spread > 0) wins++; n++;
      // 랜덤 순위 대조(결정론: 인덱스 회전)
      const rot = mom.slice(t % mom.length).concat(mom.slice(0, t % mom.length));
      rnd.push(rot.slice(0, K).reduce((a, o) => a + o.fwd, 0) / K - rot.slice(-K).reduce((a, o) => a + o.fwd, 0) / K);
    }
    const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    // 롱숏 누적(스프레드 복리 근사)
    let eq = 1; for (const s of spreads) eq *= (1 + s);
    console.log("모멘텀 " + String(LB).padStart(3) + "봉 → 스프레드/회 " + P(avg(spreads)) + " · 승률 " + (wins / n * 100).toFixed(0) + "%"
      + " · 롱 " + P(avg(longR)) + " 숏 " + P(avg(shortR)) + " · 랜덤스프레드 " + P(avg(rnd)) + " · 누적롱숏 " + P(eq - 1) + " (" + n + "회)");
  }
  console.log("\n→ 스프레드가 양(+)이고 랜덤보다 크며 승률>50%면 상대강도(횡단면 모멘텀) edge 존재.");
}
main();
