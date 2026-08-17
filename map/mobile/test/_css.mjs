// style.css 는 여덟 장으로 갈렸다(P2 T13). CSS 를 재는 관문들이 각자 파일 목록을 들면
// 새 장이 생겼을 때 어떤 관문은 보고 어떤 관문은 못 보는 상태가 된다 — 그래서 목록을
// **index.html 에서 읽는다.** 링크 순서가 곧 캐스케이드이므로, 합치는 순서도 그 순서다.
import { readFileSync } from "node:fs";

const WWW = new URL("../www/", import.meta.url);

/** index.html 이 <link> 로 거는 CSS 파일명, 나오는 차례 그대로. */
export function cssFiles() {
  const html = readFileSync(new URL("index.html", WWW), "utf8");
  return [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m => m[1]);
}

/** 그 파일들을 순서대로 이어붙인 것 — 브라우저가 실제로 보는 것과 같은 순서. */
export function allCss() {
  return cssFiles().map(f => readFileSync(new URL(f, WWW), "utf8")).join("\n");
}
