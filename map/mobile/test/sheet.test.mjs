// 시트는 공용이다 — 단계 선택 · 종목 추가 · 성향 변경 · 광고 권유가 같은 것을 쓴다.
// 화면마다 제각각 만들면 라운드·최대높이·닫힘 경로가 조용히 갈린다(자물쇠가 그랬다).
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../www/sheet.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../www/style-sheet.css", import.meta.url), "utf8");

test("상단 라운드 28 · 최대 82vh · 하단 안전영역 (시안 공통 컴포넌트)", () => {
  assert.match(CSS, /\.ms-sheet\b[^}]*border-radius:\s*28px\s+28px\s+0\s+0/s);
  assert.match(CSS, /\.ms-sheet\b[^}]*max-height:\s*82vh/s);
  assert.match(CSS, /\.ms-sheet\b[^}]*env\(safe-area-inset-bottom\)/s);
});

// 거리 기반 정규식(backdrop...400자 이내에 addEventListener("click")) 대신 두 개의 독립
// 단언으로 쓴다 — 이 저장소는 "정규식이 상상한 모양만 잡는" 거짓 실패를 이미 여섯 건
// 겪었다. 주석 한 줄만 늘어도 거리 기반은 빨개진다. 여기선 ① CSS 에 클래스가 있는가
// ② 소스에 그 리스너 호출이 있는가만 각각 확인한다.
test("백드롭이 있고, 백드롭 탭으로 닫힌다", () => {
  assert.match(CSS, /\.ms-sheet-backdrop\b/);
  assert.match(SRC, /backdrop\.addEventListener\("click"/);
});

test("뒤로가기로 닫힌다 — 시트가 열린 채로 화면이 바뀌지 않게", () => {
  assert.match(SRC, /closeTop/, "뒤로가기가 부를 진입점이 없다");
});

test("여러 장이 쌓여도 위에서부터 닫힌다", () => {
  assert.match(SRC, /stack/, "시트 스택이 없다 — 광고 권유가 단계 선택 시트 위에 열린다(시안 진입점 1)");
});

test("좌측 세로 accent 라인 금지", () => {
  assert.ok(!/border-left:\s*[2-9]/.test(CSS));
});
