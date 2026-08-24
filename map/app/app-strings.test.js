// app-strings — 키 기반 문자열 사전(지침서 §15 i18n). 값은 카피 톤 §12(해요체).
const { test } = require("node:test");
const assert = require("node:assert");
const strings = require("./app-strings.js");

test("점 표기 조회", () => {
  assert.equal(strings.str("app.title"), "머니스쿱");
  assert.equal(strings.str("tabs.home"), "홈");
  assert.equal(strings.str("tabs.wallet"), "내 스쿱");
});

test("미존재 키는 키 문자열 반환(빈 화면 방지)", () => {
  assert.equal(strings.str("없는.키.경로"), "없는.키.경로");
  assert.equal(strings.str(""), "");
});

test("전 항목이 비어 있지 않은 문자열", () => {
  const walk = (node, path) => {
    Object.keys(node).forEach((k) => {
      const v = node[k];
      const p = path ? path + "." + k : k;
      if (typeof v === "string") assert.ok(v.length > 0, p + " 이 빈 문자열");
      else walk(v, p);
    });
  };
  walk(strings.TABLE, "");
});

test("탭 6종 완비", () => {
  ["home", "signal", "analyze", "score", "stats", "wallet"].forEach((k) => {
    assert.equal(typeof strings.TABLE.tabs[k], "string");
  });
});
