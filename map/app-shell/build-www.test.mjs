// build-www 관문 — 엔진 절대 URL 치환·서버 베이스 주입·테스트 파일 제외. 기대값은 규칙에서 직접.
import { test } from "node:test";
import assert from "node:assert";
import { rewriteIndex, shouldCopy, build } from "./build-www.mjs";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("rewriteIndex: 엔진은 서버 절대 URL · MS_SERVER_BASE 가 엔진보다 먼저", () => {
  const html = '<head></head><body>\n<script src="../forge-core.js"></script>\n<script src="app-config.js"></script>';
  const out = rewriteIndex(html, "https://example.test/map/");
  assert.ok(out.includes('window.MS_SERVER_BASE="https://example.test/map"'), "베이스 주입(끝 슬래시 제거)");
  assert.ok(out.includes('<script src="https://example.test/map/forge-core.js"></script>'), "엔진 절대 URL");
  assert.ok(!out.includes("../forge-core.js"), "상대 엔진 참조 제거");
  assert.ok(out.indexOf("MS_SERVER_BASE") < out.indexOf("/forge-core.js"), "주입이 엔진 로드보다 앞");
  assert.throws(() => rewriteIndex("<script src='x.js'></script>", "https://e"), /엔진 script/);
});

test("shouldCopy: 테스트·문서·숨김 제외", () => {
  assert.equal(shouldCopy("app-engine.js"), true);
  assert.equal(shouldCopy("app-engine.test.js"), false);
  assert.equal(shouldCopy("README.md"), false);
  assert.equal(shouldCopy(".DS_Store"), false);
  assert.equal(shouldCopy("assets"), true);
});

test("build: www 에 테스트 파일이 없고 index 가 치환된다", () => {
  const src = mkdtempSync(join(tmpdir(), "ms-app-"));
  writeFileSync(join(src, "index.html"), '<script src="../forge-core.js"></script>');
  writeFileSync(join(src, "a.js"), "1");
  writeFileSync(join(src, "a.test.js"), "1");
  mkdirSync(join(src, "assets"));
  writeFileSync(join(src, "assets", "x.mp4"), "");
  const dst = join(src, "www");
  build(src, dst, "https://s/map");
  assert.ok(existsSync(join(dst, "a.js")) && existsSync(join(dst, "assets", "x.mp4")));
  assert.ok(!existsSync(join(dst, "a.test.js")));
  assert.ok(readFileSync(join(dst, "index.html"), "utf8").includes("https://s/map/forge-core.js"));
});
