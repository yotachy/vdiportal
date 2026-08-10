// 엔진 원본(map/forge-*.js) → www/vendor/ 복사. vendor 는 커밋하지 않는 생성물이라
// 엔진이 두 벌 존재할 수 없다. cap sync 앞에 자동 실행된다(package.json).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_FILES = ["forge-core.js", "forge-tools.js"];

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

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = syncEngine(join(here, ".."), join(here, "www", "vendor"));
  for (const [f, sha] of Object.entries(m)) console.log("  " + f + "  " + sha);
}
