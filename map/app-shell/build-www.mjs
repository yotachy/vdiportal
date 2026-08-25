// 머니스쿱 앱 셸 — www/ 생성기. ../app 의 배포 파일(테스트 제외)을 www/ 로 복사하고 index.html 을
// 앱 셸용으로 고친다: ① 엔진은 서버의 forge-core.js 를 절대 URL 로 로드(사본 금지 — PC·웹·앱이
// 같은 서버 스냅샷을 본다, CLAUDE.md §②) ② window.MS_SERVER_BASE 주입(app-data.serverBase).
// 빌드 도구가 아니라 복사기다 — 번들·트랜스파일 없음(www 는 순수 정적 그대로).
import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SERVER_BASE = "https://parksvc.mycafe24.com/map";

export function rewriteIndex(html, serverBase) {
  const base = serverBase.replace(/\/$/, "");
  let out = html.replace('<script src="../forge-core.js"></script>',
    '<script>window.MS_SERVER_BASE="' + base + '";</script>\n<script src="' + base + '/forge-core.js"></script>');
  if (out === html) throw new Error("index.html 에서 엔진 script 태그를 못 찾았다 — 로드 순서가 바뀌었나?");
  return out;
}

export function shouldCopy(name) {
  return !/\.test\.js$/.test(name) && !/\.md$/.test(name) && !name.startsWith(".");
}

function copyDir(src, dst, root) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    if (!shouldCopy(name)) continue;
    const s = join(src, name), d = join(dst, name);
    if (s === root) continue;   // 출력 폴더가 입력 안에 있어도 자기 자신을 재귀 복사하지 않는다
    if (statSync(s).isDirectory()) copyDir(s, d, root);
    else copyFileSync(s, d);
  }
}

export function build(appDir, wwwDir, serverBase) {
  if (existsSync(wwwDir)) rmSync(wwwDir, { recursive: true });
  copyDir(appDir, wwwDir, wwwDir);
  const idx = join(wwwDir, "index.html");
  writeFileSync(idx, rewriteIndex(readFileSync(idx, "utf8"), serverBase));
  return readdirSync(wwwDir).length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const n = build(join(HERE, "..", "app"), join(HERE, "www"), SERVER_BASE);
  console.log("www 생성 — 항목 " + n + "개, 엔진=" + SERVER_BASE + "/forge-core.js");
}
