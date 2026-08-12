import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../www/strings.js");
const FC = require("../../forge-core.js");
const G = require("../www/graph.js");

// 키 존재 가드(아래)와 미사용 키 가드(파일 하단)가 같은 목록을 스캔한다 — 한쪽만 갱신하면
// 새 소비 파일의 오타는 잡히는데 죽은 키는 못 잡는(또는 그 반대) 비대칭이 생긴다.
const KEY_SCAN_FILES = ["../www/screens/report.js", "../www/screens/watchlist.js", "../www/screens/wallet.js",
                         "../www/draw-layers.js", "../www/chart-legend.js", "../www/draw-panels.js", "../www/app.js",
                         "../www/tier-sheet.js"];
// Fix 1: chart-legend.js 는 `var T = Str.t` 로 별칭한 뒤 `T.legPred` 형태로 쓴다 — MSStr.t/Str.t 직접
// 참조만 잡던 정규식이 이 별칭 경로를 못 봐서, 존재하지 않는 T.키 오타가 조용히 undefined 를 렌더했다.
const KEY_RE = /\b(?:MSStr\.t|Str\.t|T)\.([A-Za-z_][A-Za-z0-9_]*)/g;

test("지표 표시명은 엔진의 32종을 전부 덮는다 — 빠지면 화면에 blockType 이 그대로 노출된다", () => {
  const types = G.indicatorTypes(G.full32Graph(FC));
  assert.equal(types.length, FC.indicatorCount, "그래프 지표 수가 엔진 개수와 다르다");
  const missing = types.filter(t => !S.ind(t) || S.ind(t) === t);
  assert.deepEqual(missing, [], "표시명 없는 지표: " + missing.join(", "));
});

test("모르는 blockType 은 그대로 돌려준다 — 던지지 않는다", () => {
  assert.equal(S.ind("nope"), "nope");
  assert.equal(S.ind(""), "");
  assert.equal(S.ind(undefined), "");
});

test("UI 문자열에 한글이 남아 있지 않다 — 시안은 영어다", () => {
  const bad = Object.keys(S.t).filter(k => /[가-힣]/.test(String(S.t[k])));
  assert.deepEqual(bad, [], "한글이 남은 키: " + bad.join(", "));
  const badInd = Object.keys(S.IND).filter(k => /[가-힣]/.test(String(S.IND[k])));
  assert.deepEqual(badInd, [], "한글이 남은 지표명: " + badInd.join(", "));
});

test("시안에 문자 그대로 있는 5종 이름은 바꾸지 않는다", () => {
  assert.equal(S.ind("ma"), "Moving average");
  assert.equal(S.ind("macd"), "MACD");
  assert.equal(S.ind("rsi"), "RSI");
  assert.equal(S.ind("bollinger"), "Bollinger");
  assert.equal(S.ind("volume"), "Volume");
});

test("화면 소스에 UI 한글 문자열이 남아 있지 않다 — 주석은 제외", () => {
  const offenders = [];
  // Step 5 carry-forward: 한글 부재만으로는 오타(MSStr.t.존재하지않는키 → undefined 렌더)를 못 잡는다.
  // 같은 소스 스캔 김에 참조된 MSStr 키가 전부 strings.js 에 실존하는지도 확인한다(소스 스캔 방식 보강).
  const badKeys = [];
  for (const f of KEY_SCAN_FILES) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    src.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const m = code.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g) || [];
      m.filter(s => /[가-힣]/.test(s))
       .forEach(s => offenders.push(f.replace("../", "") + ":" + (i + 1) + "  " + s));
      let km;
      while ((km = KEY_RE.exec(code))) {
        if (!(km[1] in S.t)) badKeys.push(f.replace("../", "") + ":" + (i + 1) + "  " + km[1]);
      }
    });
  }
  assert.deepEqual(offenders, [], "한글 UI 문자열 " + offenders.length + "건:\n" + offenders.join("\n"));
  assert.deepEqual(badKeys, [], "존재하지 않는 MSStr 키 참조 " + badKeys.length + "건:\n" + badKeys.join("\n"));
});

// Fix 5: spec §8이 요구한 미사용 키 가드. 위 테스트가 "참조된 키가 실존하는가"를 보는 반대쪽 —
// "존재하는 키가 실제로 참조되는가"를 본다. wlAddBtn·rpMissingPoint 처럼 목업에서 옮겨놓고
// 배선을 안 한 죽은 문구가 strings.js 에 계속 쌓이는 것을 막는다.
test("MSStr.t 의 모든 키는 화면 소스에서 최소 한 번 참조된다 — 죽은 문구가 조용히 쌓이지 않는다", () => {
  const referenced = new Set();
  for (const f of KEY_SCAN_FILES) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    src.split("\n").forEach(line => {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
      let km;
      while ((km = KEY_RE.exec(code))) referenced.add(km[1]);
    });
  }
  const unused = Object.keys(S.t).filter(k => !referenced.has(k));
  assert.deepEqual(unused, [], "참조되지 않는 MSStr.t 키 " + unused.length + "건: " + unused.join(", "));
});
