// 온보딩 1·2단계가 쓰는 번들 시계. 네트워크 없이 즉시 뜨게 하려고 파일로 굽는다.
// 결정론적이다 — Math.random 을 쓰지 않으므로 다시 돌려도 같은 파일이 나온다.
//
// 실제 종목을 쓰지 않는 이유: 특정 종목의 과거 차트를 첫 화면에 두면 추천으로 읽힌다.
// 엔진의 synthVolume 을 쓰지 않는 이유: 그건 거래량을 가격 수익률에서 만들어서,
// 거래량 지표 5종이 "상승에 거래량 동반"을 동어반복으로 확인하게 된다.
import { writeFileSync } from "node:fs";

const N = 240;
const START = Date.UTC(2025, 8, 1);   // 고정 시작일 — 재실행해도 같은 날짜가 나온다
const out = { price: [], candle: [], asOf: "" };

let p = 100;
for (let i = 0; i < N; i++) {
  // 가격: 사인 합성 + 완만한 추세. 예측 콘이 볼 만하게 나오는 모양이면 된다
  const drift = 0.0009;
  const wave = Math.sin(i * 0.11) * 0.011 + Math.cos(i * 0.037) * 0.006 + Math.sin(i * 0.53) * 0.003;
  const o = p;
  p = p * (1 + drift + wave);
  const hi = Math.max(o, p) * (1 + 0.004 + 0.003 * Math.abs(Math.sin(i * 0.7)));
  const lo = Math.min(o, p) * (1 - 0.004 - 0.003 * Math.abs(Math.cos(i * 0.9)));
  // 거래량: 가격과 **다른 주파수**로 돈다. 파생이 아니라 독립 계열이다
  const v = Math.round(1.4e6 * (1 + 0.42 * Math.sin(i * 0.29) + 0.18 * Math.cos(i * 0.83)));
  const d = new Date(START + i * 86400000);
  const t = d.toISOString().slice(0, 10);
  out.candle.push({ o: +o.toFixed(4), h: +hi.toFixed(4), l: +lo.toFixed(4), c: +p.toFixed(4), v: v, t: t });
  out.price.push(+p.toFixed(4));
}
out.asOf = out.candle[N - 1].t;

// UMD 로 굽는다 — 이 저장소가 www/ 전체에서 쓰는 방식이고(forge-core·readings·indicators),
// fetch 가 아니라 <script src> 로 들어오므로 1단계에 비동기 대기가 없다. 파일이 빠지면
// 브라우저에서 즉시 죽지, 빈 차트로 조용히 넘어가지 않는다.
const body = "// 생성물이다. 손으로 고치지 말 것 — tools/make-onboarding-sample.mjs 를 다시 돌린다.\n"
  + "(function (root, f) {\n"
  + '  if (typeof module === "object" && module.exports) module.exports = f();\n'
  + "  else root.MSOnboardingSample = f();\n"
  + '}(typeof self !== "undefined" ? self : this, function () {\n'
  + "  return " + JSON.stringify(out) + ";\n"
  + "}));\n";
writeFileSync(new URL("../www/onboarding-sample.js", import.meta.url), body);
console.log("wrote onboarding-sample.js —", N, "bars,", out.candle[0].t, "→", out.asOf);
