// 머니스쿱 시그널 스캐너 — 순수 로직(네트워크·엔진 배선 없음).
// 감지(app-signals.detect)와 판정(app-engine.analyze)은 호출자가 넘긴다. 여기서 하는 일은
// '누구에게 무엇을 보낼지' 뿐 — 게이트는 앱과 공유하는 rankSignal 원본을 그대로 쓴다(설계서 §7).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signals = require("../app/app-signals.js");

export function symbolUnion(registry) {
  const seen = Object.create(null);
  (registry || []).forEach(function (e) {
    (e && Array.isArray(e.picks) ? e.picks : []).forEach(function (s) {
      if (typeof s === "string" && s) seen[s] = 1;
    });
  });
  return Object.keys(seen).sort();
}

export function pickImportant(entry, signalsBySym, verdictBySym, opts) {
  const conv = opts && typeof opts.conv === "number" ? opts.conv : undefined;
  const cap = opts && typeof opts.cap === "number" ? opts.cap : 3;
  const picks = entry && Array.isArray(entry.picks) ? entry.picks : [];
  const out = [];
  picks.forEach(function (sym) {
    const list = (signalsBySym && signalsBySym[sym]) || [];
    const verdict = verdictBySym ? verdictBySym[sym] : null;
    if (!verdict) return;                       // 판정 실패 종목은 통째로 제외
    list.forEach(function (sig) {
      const r = signals.rankSignal(sig, verdict, conv === undefined ? null : { conv: conv });
      if (r.important) out.push({ sig: sig, score: r.score });
    });
  });
  out.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.sig.key < b.sig.key ? -1 : a.sig.key > b.sig.key ? 1 : 0;   // 결정적 정렬(같은 점수)
  });
  return out.slice(0, cap);
}

// 다이제스트 문구 — 실제 감지 제목만 쓴다(지어내지 않는다).
export function digestText(items) {
  const n = items.length;
  if (n === 1) {
    return { title: items[0].sig.sym + " " + items[0].sig.title,
      body: "엔진 판정과 같은 방향으로 붙은 신호예요 · 앱에서 근거를 확인하세요" };
  }
  return { title: "오늘 주목할 신호 " + n + "건",
    body: items.map(function (x) { return x.sig.sym + " " + x.sig.title; }).join(" · ") };
}

export function buildSends(registry, signalsBySym, verdictBySym, opts) {
  const day = (opts && opts.day) || "";
  const sends = [];
  (registry || []).forEach(function (e) {
    if (!e || e.on === false) return;
    const items = pickImportant(e, signalsBySym, verdictBySym, opts);
    if (!items.length) return;
    const t = digestText(items);
    sends.push({ device: e.device, title: t.title, body: t.body,
      data: { day: day, keys: items.map(function (x) { return x.sig.key; }) } });
  });
  return sends;
}
