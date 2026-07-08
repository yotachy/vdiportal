// backtest/range-strategy.js — 스쿱 레인지 전략 검증
// 국면=횡보일 때만 지지반등(buy)·저항눌림(sell) 신호(verdict.context.opportunity)로 진입.
// 여러 홀드기간 × 롱온리/롱숏 × 기대값·B&H·랜덤대조.
"use strict";
const fs = require("fs"), path = require("path");
const FC = require("../forge-core.js");
const B = require("./backtest.js");

const WARMUP = 200, LOOKBACK = 600, STRIDE = 5;
const HOLDS = [10, 20, 40];
const MAXH = Math.max(...HOLDS);

function main() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter(f => f.endsWith("-1day.json"));   // 일봉 전체
  const fixtures = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

  // 픽스처별 신호 수집: {kind:buy/sell, t, base, out:{10,20,40}}
  const perFix = [];
  for (const fx of fixtures) {
    const price = fx.candle.map(c => c.c), candle = fx.candle, N = price.length;
    const g = B.standardGraph();
    const sigs = []; let pts = 0, rangePts = 0;
    for (let t = WARMUP; t <= N - MAXH - 1; t += STRIDE) {
      const s0 = Math.max(0, t + 1 - LOOKBACK);
      let r; try { r = FC.run(g, { price: price.slice(s0, t + 1), candle: candle.slice(s0, t + 1) }, { futW: 60, timeframe: "1day" }); } catch (e) { continue; }
      const ctx = r.verdict && r.verdict.context; if (!ctx) continue; pts++;
      if (ctx.state === "range") rangePts++;
      const op = ctx.opportunity;
      if (op && (op.kind === "buy" || op.kind === "sell")) {
        const out = {}; for (const h of HOLDS) out[h] = price[t + h] / price[t] - 1;
        sigs.push({ kind: op.kind, t, out });
      }
    }
    perFix.push({ sym: fx.symbol, N, sigs, pts, rangePts, bh: price[N - 1] / price[WARMUP] - 1, firstIdx: WARMUP });
    console.error("  " + fx.symbol + " → 신호 " + sigs.length + " (횡보시점 " + rangePts + "/" + pts + ")");
  }

  const P = x => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
  const pp = x => (x * 100).toFixed(1) + "%";
  console.log("\n=== 스쿱 레인지 전략 검증 (일봉 " + fixtures.length + "종) ===");
  const totalSig = perFix.reduce((s, f) => s + f.sigs.length, 0);
  console.log("총 신호 " + totalSig + " (buy " + perFix.reduce((s, f) => s + f.sigs.filter(x => x.kind === "buy").length, 0) + " · sell " + perFix.reduce((s, f) => s + f.sigs.filter(x => x.kind === "sell").length, 0) + ")\n");

  for (const H of HOLDS) {
    // 롱온리: buy→롱, sell→플랫  /  롱숏: buy→롱, sell→숏
    for (const mode of ["long", "ls"]) {
      const rets = [], wins = { n: 0, w: 0 };
      // 기대값·승률(트레이드 단위, 전 종목 풀)
      for (const f of perFix) for (const s of f.sigs) {
        let ret = null;
        if (s.kind === "buy") ret = s.out[H];
        else if (s.kind === "sell") ret = (mode === "ls") ? -s.out[H] : null;
        if (ret == null) continue;
        rets.push(ret); wins.n++; if (ret > 0) wins.w++;
      }
      if (!rets.length) continue;
      const exp = rets.reduce((a, b) => a + b, 0) / rets.length;   // 기대값/거래
      const wr = wins.w / wins.n;
      // 등가중 총수익: 종목별 비중첩 복리
      let eqSum = 0, eqN = 0, beat = 0, bhN = 0;
      for (const f of perFix) {
        const ss = f.sigs.slice().sort((a, b) => a.t - b.t); let eq = 1, nf = -1, tr = 0;
        for (const s of ss) { if (s.t < nf) continue; let ret = s.kind === "buy" ? s.out[H] : (mode === "ls" ? -s.out[H] : null); if (ret == null) continue; eq *= (1 + ret); nf = s.t + H; tr++; }
        if (tr > 0) { eqSum += (eq - 1); eqN++; if ((eq - 1) > f.bh) beat++; bhN++; }
      }
      const avgRet = eqN ? eqSum / eqN : 0, bhAvg = perFix.reduce((s, f) => s + f.bh, 0) / perFix.length;
      console.log("홀드 " + H + "봉 · " + (mode === "long" ? "롱온리" : "롱숏 ") + " : 거래 " + wins.n + " · 승률 " + pp(wr) + " · 기대값/거래 " + P(exp) + " · 등가중수익 " + P(avgRet) + "(" + eqN + "종, B&H이긴 " + beat + "/" + bhN + ")");
    }
  }
  // 랜덤 대조(신호 시점에 랜덤 방향 — 결정론 시드: 인덱스 짝/홀)
  console.log("\n대조군:");
  for (const H of HOLDS) {
    let s = 0, n = 0, i = 0;
    for (const f of perFix) for (const sg of f.sigs) { const rnd = (i++ % 2 === 0) ? 1 : -1; s += rnd * sg.out[H]; n++; }
    console.log("  홀드 " + H + "봉 랜덤방향 기대값/거래 " + P(n ? s / n : 0) + " (전략이 이걸 넘어야 실질 edge)");
  }
}
main();
