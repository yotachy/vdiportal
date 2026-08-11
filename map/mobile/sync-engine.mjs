// 엔진 원본(map/forge-*.js) → www/vendor/ 복사. vendor 는 커밋하지 않는 생성물이라
// 엔진이 두 벌 존재할 수 없다. cap sync 앞에 자동 실행된다(package.json).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
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
export function syncBacktest(srcDir, destDir) {
  const src = join(srcDir, BACKTEST_FILE);
  if (!existsSync(src)) throw new Error("백테스트 리포트 없음: " + src);
  const r = JSON.parse(readFileSync(src, "utf8"));
  const o = r.overall || {}, p = o.pnl || {}, uni = r.universe || [];
  const summary = {
    directionHitRate: o.directionHitRate,
    bullHitRate: o.bullHitRate,
    bearHitRate: o.bearHitRate,
    calibrationECE: o.calibrationECE,
    coneCoverage: o.coneCoverage,
    avgWin: p.avgWin,
    avgLoss: p.avgLoss,
    nForecasts: uni.reduce((s, u) => s + (u.points || 0), 0),
    nSeries: uni.length,
    generatedAt: r.generatedAt
  };
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
