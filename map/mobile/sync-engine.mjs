// 엔진 원본(map/forge-*.js) → www/vendor/ 복사. vendor 는 커밋하지 않는 생성물이라
// 엔진이 두 벌 존재할 수 없다. cap sync 앞에 자동 실행된다(package.json).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_FILES = ["forge-core.js", "forge-tools.js"];

export const BACKTEST_FILE = "forge-backtest-report.json";

export function syncEngine(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  const manifest = {};
  for (const f of ENGINE_FILES) {
    const src = join(srcDir, f);
    if (!existsSync(src)) throw new Error("엔진 원본 없음: " + src);
    const buf = readFileSync(src);
    writeFileSync(join(destDir, f), buf);
    manifest[f] = createHash("sha256").update(buf).digest("hex").slice(0, 12);
  }
  writeFileSync(join(destDir, "ENGINE-VERSION.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

// 백테스트 실측치를 화면에 쓰려면 앱이 그 값을 알아야 한다. 하드코딩하면 엔진을 재측정할 때
// 갈라지므로, 원본 JSON 을 단일 출처로 두고 여기서 요약만 뽑는다.
// JSON 이 아니라 JS 로 내리는 이유: fetch 없이 <script> 로 읽어 비동기를 끌어들이지 않는다.
// 엔진 원본에서 버전을 읽는다. forge-core 는 UMD 라 CJS require 로 그대로 잡힌다.
export function engineVersion(srcDir) {
  const req = createRequire(import.meta.url);
  const p = join(srcDir, ENGINE_FILES[0]);
  if (!existsSync(p)) throw new Error("엔진 원본 없음: " + p);
  delete req.cache[req.resolve(p)];
  return req(p).version;
}

// 픽스처 목록의 지문. backtest.js 와 같은 규칙이어야 한다 — 다르면 늘 불일치가 나서
// 아무도 못 고치는 관문이 된다. 그래서 원본 함수를 import 해 쓴다(규칙을 두 벌 두지 않는다).
function fixturesFingerprint(srcDir) {
  const p = join(srcDir, "backtest", "backtest.js");
  if (!existsSync(p)) return null;
  const req = createRequire(import.meta.url);
  return req(p).fixturesFingerprint(join(srcDir, "backtest", "fixtures"));
}

export function syncBacktest(srcDir, destDir) {
  const src = join(srcDir, BACKTEST_FILE);
  if (!existsSync(src)) throw new Error("백테스트 리포트 없음: " + src);
  const r = JSON.parse(readFileSync(src, "utf8"));
  // 앱이 사실로 내거는 유일한 실측치다. 엔진이 올라갔는데 재측정을 잊으면 옛 숫자가 조용히
  // 오늘의 진실 행세를 한다 — 조용한 거짓말 대신 빌드를 세운다.
  const ev = engineVersion(srcDir);
  if (r.engineVersion !== ev)
    throw new Error("백테스트가 현 엔진의 측정치가 아니다: 리포트 " + (r.engineVersion || "스탬프 없음") +
      " ≠ 엔진 " + ev + " — `node backtest/backtest.js` 로 재측정할 것");
  // 엔진 버전만 보면 "종목이 늘었는데 재측정을 안 한" 경우를 놓친다. 7월 리포트가 정확히
  // 그랬다 — 86시리즈로 잰 값이 87종이 된 뒤에도 그대로 화면에 나갔다.
  const fp = fixturesFingerprint(srcDir);
  if (fp && r.fixtures !== fp)
    throw new Error("백테스트가 현 종목 집합의 측정치가 아니다: 리포트 " + (r.fixtures || "스탬프 없음") +
      " ≠ 현재 " + fp + " — `node backtest/backtest.js` 로 재측정할 것");
  const o = r.overall || {}, p = o.pnl || {}, uni = r.universe || [];
  const summary = {
    engineVersion: ev,
    graphIndicators: r.graphIndicators,   // 이 적중률이 몇 종을 읽고 나온 값인지 — 화면 고지의 근거
    indicatorCount: r.indicatorCount,
    directionHitRate: o.directionHitRate,
    bullHitRate: o.bullHitRate,
    bearHitRate: o.bearHitRate,
    // "항상 오른다"의 적중률 — **같은 측정에서 나온 값이라야** 옆에 놓을 수 있다.
    // 적중률만 단독으로 보이면 사용자는 그것을 "동전보다 낫다"로 읽는데, 이 자산·이 기간의
    // 기준선은 50% 가 아니라 61.0% 이고 우리 방향 판정은 그 아래다(P2 설계서 §2 R2).
    // 다른 하네스(backtest/tier-report.json)의 61.0 을 여기 상수로 적으면 안 된다 — 숫자는
    // 같아 보여도 잰 대상이 다르면 나란히 놓는 순간 거짓 비교가 된다.
    baselineAlwaysUp: o.baselineAlwaysUp,
    calibrationECE: o.calibrationECE,
    coneCoverage: o.coneCoverage,
    avgWin: p.avgWin,
    avgLoss: p.avgLoss,
    nForecasts: uni.reduce((s, u) => s + (u.points || 0), 0),
    nSeries: uni.length,
    generatedAt: r.generatedAt
  };

  // 티어별 실측(backtest/tier-report.json) — 온보딩 5단계가 "심화가 무엇을 파는가"를 말하려면
  // 기본과 심화의 콘 커버·확률 오차가 필요한데, 위 요약은 19종 하네스 하나의 값이라 티어를
  // 구분하지 못한다. **화면에 숫자를 적으려면 그 숫자가 파일에서 와야 한다** — 73.8/77.1 을
  // 손으로 적는 순간 재측정해도 화면이 안 따라오고, 그때부터 그것은 측정치가 아니라 기억이다.
  // 없으면 넣지 않는다(화면이 그 블록을 안 그린다). 지어내는 것보다 비어 있는 게 낫다.
  const tierPath = join(srcDir, "backtest", "tier-report.json");
  if (existsSync(tierPath)) {
    const t = JSON.parse(readFileSync(tierPath, "utf8"));
    if (t.engineVersion === ev && t.tiers && t.tiers.basic && t.tiers.deep) {
      const pick = x => ({ indicators: x.indicators, directionHitRate: x.directionHitRate,
                           coneCoverage: x.coneCoverage, calibrationECE: x.calibrationECE,
                           baselineAlwaysUp: x.baselineAlwaysUp, nForecasts: x.nForecasts });
      summary.tiers = { basic: pick(t.tiers.basic), deep: pick(t.tiers.deep) };
    }
    // 엔진 버전이 다르면 싣지 않는다 — 낡은 티어 숫자가 새 엔진의 값 행세를 하면 안 된다.
  }
  mkdirSync(destDir, { recursive: true });
  writeFileSync(join(destDir, "backtest-summary.js"),
    "// 생성물 — sync-engine.mjs 가 forge-backtest-report.json 에서 만든다. 직접 고치지 말 것.\n" +
    "window.MSBacktest = " + JSON.stringify(summary, null, 2) + ";\n");
  return summary;
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = syncEngine(join(here, ".."), join(here, "www", "vendor"));
  for (const [f, sha] of Object.entries(m)) console.log("  " + f + "  " + sha);
  const b = syncBacktest(join(here, ".."), join(here, "www", "vendor"));
  console.log("  backtest-summary.js  " + b.nForecasts + "건 · " + b.nSeries + "시리즈 · " + b.generatedAt);
}
