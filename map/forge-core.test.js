const test = require("node:test");
const assert = require("node:assert");
const ForgeCore = require("./forge-core.js");

test("forge-core exposes a version string", () => {
  assert.strictEqual(typeof ForgeCore.version, "string");
  assert.ok(ForgeCore.version.length > 0);
});
