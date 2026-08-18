// 라우터는 DOM 을 모른다 — 그래야 값으로 잴 수 있다. DOM 조립은 shell.js 담당.
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSRouter = require("../www/router.js");

function mk() {
  const rendered = [];
  const r = MSRouter.create({ onRender: e => rendered.push(e.id) });
  r.register({ id: "watchlist", tab: "list", render: function () {} });
  r.register({ id: "report", tab: "analysis", render: function () {} });
  r.register({ id: "readings", tab: "analysis", render: function () {} });
  r.register({ id: "wallet", tab: "scoop", render: function () {} });
  r.register({ id: "record", tab: "scoop", render: function () {} });
  return { r, rendered };
}

test("go 는 화면이 속한 탭으로 전환하고 그 탭 스택에 쌓는다", () => {
  const { r } = mk();
  r.go("watchlist");
  r.go("report", { sym: "AAPL" });
  assert.deepStrictEqual(r.current(), { id: "report", params: { sym: "AAPL" }, tab: "analysis" });
  assert.deepStrictEqual(r.stackOf("analysis").map(e => e.id), ["report"]);
  assert.deepStrictEqual(r.stackOf("list").map(e => e.id), ["watchlist"]);
});

test("탭 전환은 스택을 버리지 않는다 — 돌아오면 보던 화면이 그대로다", () => {
  const { r } = mk();
  r.go("watchlist");
  r.go("report", { sym: "AAPL" });
  r.go("readings");
  r.switchTab("list");
  assert.strictEqual(r.current().id, "watchlist");
  r.switchTab("analysis");
  assert.strictEqual(r.current().id, "readings", "탭으로 돌아왔더니 스택이 초기화됐다");
});

test("back 은 현재 탭 스택만 판다", () => {
  const { r } = mk();
  r.go("report", { sym: "AAPL" });
  r.go("readings");
  assert.strictEqual(r.back(), true);
  assert.strictEqual(r.current().id, "report");
});

test("탭 루트에서의 back — 목록 탭이 아니면 목록 탭으로, 목록 탭이면 false(앱 종료)", () => {
  const { r } = mk();
  r.go("watchlist");
  r.go("wallet");
  assert.strictEqual(r.back(), true, "지갑 루트에서 back 이 앱을 닫으려 했다");
  assert.strictEqual(r.current().tab, "list");
  assert.strictEqual(r.back(), false, "목록 루트의 back 은 앱에 넘겨야 한다");
});

test("같은 화면을 연달아 go 하면 쌓지 않고 교체한다 — 뒤로가기가 같은 화면을 반복하지 않게", () => {
  const { r } = mk();
  r.go("report", { sym: "AAPL" });
  r.go("report", { sym: "NVDA" });
  assert.deepStrictEqual(r.stackOf("analysis").map(e => e.params.sym), ["NVDA"]);
});

test("등록되지 않은 화면으로 가면 던진다 — 오타가 조용히 빈 화면이 되지 않게", () => {
  const { r } = mk();
  assert.throws(() => r.go("reprot"), /등록되지 않은/);
});

test("onRender 는 그릴 때마다 정확히 한 번 불린다", () => {
  const { r, rendered } = mk();
  r.go("watchlist");
  r.go("report", { sym: "AAPL" });
  r.switchTab("list");
  r.back();
  // 마지막 back() 은 목록 탭의 루트(watchlist, 스택 depth 1)에서 호출된다 — back() 이
  // false 를 돌려주며 아무것도 그리지 않는 경로다(그릴 새 화면이 없다, 앱 종료는 호출자 소관).
  // 그래서 4번째 렌더는 발생하지 않는다 — 3건이 맞다.
  assert.deepStrictEqual(rendered, ["watchlist", "report", "watchlist"]);
});
