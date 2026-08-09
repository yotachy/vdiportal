import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncEngine, ENGINE_FILES } from "../sync-engine.mjs";

function tmp(p) { return mkdtempSync(join(tmpdir(), p)); }

test("원본을 바이트 동일하게 복사하고 SHA 매니페스트를 남긴다", () => {
  const src = tmp("ms-src-"), dst = tmp("ms-dst-");
  for (const f of ENGINE_FILES) writeFileSync(join(src, f), "// " + f + "\n비ASCII\u0000\u00ff");

  const manifest = syncEngine(src, dst);

  for (const f of ENGINE_FILES) {
    assert.deepEqual(readFileSync(join(dst, f)), readFileSync(join(src, f)), f + " 바이트 불일치");
    assert.match(manifest[f], /^[0-9a-f]{12}$/, f + " SHA 형식");
  }
  assert.ok(existsSync(join(dst, "ENGINE-VERSION.json")));
  assert.deepEqual(JSON.parse(readFileSync(join(dst, "ENGINE-VERSION.json"), "utf8")), manifest);
});

test("내용이 바뀌면 SHA도 바뀐다", () => {
  const src = tmp("ms-src-"), dst = tmp("ms-dst-");
  for (const f of ENGINE_FILES) writeFileSync(join(src, f), "A");
  const a = syncEngine(src, dst);
  for (const f of ENGINE_FILES) writeFileSync(join(src, f), "B");
  const b = syncEngine(src, dst);
  assert.notEqual(a[ENGINE_FILES[0]], b[ENGINE_FILES[0]]);
});

test("원본이 없으면 조용히 넘어가지 않고 던진다", () => {
  assert.throws(() => syncEngine(tmp("ms-src-"), tmp("ms-dst-")), /엔진 원본 없음/);
});
