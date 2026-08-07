#!/usr/bin/env node
/* 스쿱포지 드로잉 — 스와치 · ✕ 배지 · 끝점 핸들 히트영역 충돌 전수 스윕
   FINAL 리뷰 I-1(스와치가 핸들을 덮어 끝점 편집 불가) / M-9(hline 스와치 2px 오클릭) 검증용.

   실행:  node .superpowers/sdd/2026-08-06-drawing-tools-v2/sweep-drawing-hit.js
          node ... sweep-drawing-hit.js --quick            (격자 성기게 — 개발 중 빠른 확인)
          node ... sweep-drawing-hit.js --module=<경로>    (수정 전 사본으로 before 수치 재현)

   원칙: 판정은 전부 **실제 drawsHitTest 체인**을 통과시킨다(자체 사각형 산수로 흉내내지 않는다).
         선택 상태도 실제 drawsPointerDown/Up 으로 만든다.

   불변식 4종
     S1 (I-1) 화면에 그려진 끝점 핸들의 **보이는 링**(HR_VIS=4.5) 안을 누르면 항상 kind:"handle".
              단 ✕ 배지가 그 위에 덧그려지는 지점(배지 보이는 원 r=DEL_R=9 안)은 제외 —
              거기서 보이는 것은 배지이므로 배지가 이기는 게 맞다(별도 집계).
     S2 (M-9) hline·vline 의 본체 밴드(±BODY_R) 위를 누르면 kind:"body"(=선택·이동).
              배지 히트원(db.r+2) 안은 제외(배지가 선 위에 얹히는 것은 의도).
     S3 (T4)  스와치 사각형은 ✕ 배지 히트원(db.r+2)과 절대 겹치지 않는다(파괴적 오클릭 방지).
     S4       ✕ 배지의 보이는 원(DEL_R) 안을 누르면 kind:"del" (배지가 계속 눌린다).
*/
"use strict";
const path = require("path");
const _mod = (process.argv.find(a => a.startsWith("--module=")) || "").slice(9);
const MODULE = _mod ? path.resolve(process.cwd(), _mod) : path.join(__dirname, "forge-tools.js");
const T = require(MODULE);

const QUICK = process.argv.includes("--quick");

/* forge-tools.js 내부 상수와 같은 값(비노출) — 이 스윕은 "보이는 것"을 기준으로 재므로
   시각 반경(HR_VIS·DEL_R)과 본체 반경(BODY_R)을 그대로 둔다. 어긋나면 결과가 무의미해진다. */
const HR_VIS = 4.5, DEL_R = 9, BODY_R = 5;

const g = { padX: 50, padTop: 20, padBot: 30, ch: 400, histW: 600, plotRight: 650, start: 0, count: 100, log: false, loV: 50, hiV: 150 };
const times = [];
{ const base = Date.parse("2026-01-01T00:00:00Z"); for (let i = 0; i < 150; i++) times.push(new Date(base + i * 86400000).toISOString().slice(0, 10)); }

function makeCtx() {
  const o = {};
  return new Proxy(o, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === "measureText") return s => ({ width: String(s || "").length * 7 });
      if (p === "createLinearGradient") return () => ({ addColorStop() {} });
      return function () {};
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
function makeCanvas(extra) { return Object.assign({ style: {}, width: 0, height: 0, parentElement: { clientWidth: 800, clientHeight: 450 }, getContext: () => makeCtx() }, extra || {}); }
const mainCanvas = makeCanvas({ _mainGeo: g }), drawsCanvas = makeCanvas({});
global.window = { devicePixelRatio: 1 };
global.document = {
  getElementById(id) { if (id === "fcMainChart") return mainCanvas; if (id === "fcDraws") return drawsCanvas; return null; },
  querySelectorAll() { return []; }, addEventListener() {}, activeElement: null,
};
global.priceTimes = () => times;

const G = T.drawsGeo();
const CLIP = { x0: g.padX - 2, x1: g.plotRight + 2, y0: g.padTop, y1: g.ch - g.padBot };
const inClip = (x, y) => x >= CLIP.x0 && x <= CLIP.x1 && y >= CLIP.y0 && y <= CLIP.y1;
const X = fi => G.fiToX(fi), Y = p => G.pToY(p);

/* 링 위 표본 — 중심 + 반지름 2단(안쪽/가장자리) × 8방향 = 17점. */
function ringPts(cx, cy, r) {
  const out = [{ x: cx, y: cy }];
  for (const rr of [r * 0.5, r * 0.98])
    for (let k = 0; k < 8; k++) out.push({ x: cx + rr * Math.cos(k * Math.PI / 4), y: cy + rr * Math.sin(k * Math.PI / 4) });
  return out;
}
function rectHitsCircle(r, cx, cy, rad) {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.w)), ny = Math.max(r.y, Math.min(cy, r.y + r.h));
  return Math.hypot(cx - nx, cy - ny) < rad;
}

/* 실제 상호작용으로 선택 상태를 만든다 — 첫 클릭 시엔 _selId 가 null 이라
   스와치/배지 프리체크가 아예 안 돌아 본체로만 잡힌다(선택 경로 오염 없음). */
function select(d, hx, hy) {
  T.drawsLoad([d]);
  const h0 = T.drawsHitTest(hx, hy);
  if (!h0 || h0.kind !== "body") return false;
  T.drawsPointerDown({}, hx, hy);
  T.drawsPointerUp();
  return T.drawsHitTest(hx, hy) !== null;
}

const bars = QUICK ? [0, 20, 40, 60, 80, 95] : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95];
const barsRight = QUICK ? [80, 85, 90, 95, 99] : [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99];
const prices = QUICK ? [55, 80, 100, 125, 145] : (() => { const a = []; for (let i = 0; i < 20; i++) a.push(51 + i * 5); return a; })();

const TYPES2 = ["trend", "channel", "range", "period"];

function run2(label, aBars, bBars) {
  const stat = { configs: 0, handlePts: 0, swatch: 0, del: 0, other: 0, badgeCovered: 0, s3: 0, s4pts: 0, s4bad: 0 };
  for (const type of TYPES2) {
    for (const ab of aBars) for (const ap of prices) for (const bb of bBars) for (const bp of prices) {
      const d = { id: "s1", type, a: { t: times[ab], p: ap }, b: { t: times[bb], p: bp } };
      if (type === "channel") d.off = 6;
      const A = { x: X(ab), y: Y(ap) }, B = { x: X(bb), y: Y(bp) };
      // 본체를 확실히 물 수 있는 지점 — 추세/채널은 선분 중점, 박스는 아랫변 중점.
      const pick = (type === "trend" || type === "channel")
        ? { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
        : { x: (A.x + B.x) / 2, y: Math.max(A.y, B.y) };
      if (!inClip(pick.x, pick.y)) continue;
      if (!select(d, pick.x, pick.y)) continue;
      stat.configs++;

      const db = T._delBadge(G, d), sw = T._swatchRects(G, d);
      // S3 — 스와치 ↔ 배지 히트원 (Task 4 불변식, 파괴적)
      if (db) for (const r of sw) if (rectHitsCircle(r, db.x, db.y, db.r + 2)) { stat.s3++; break; }

      // S1 — 그려진 핸들의 보이는 링
      for (const P of [A, B]) {
        if (!inClip(P.x, P.y)) continue;                       // 클립 밖 = 안 보임
        for (const q of ringPts(P.x, P.y, HR_VIS)) {
          if (!inClip(q.x, q.y)) continue;
          if (db && Math.hypot(q.x - db.x, q.y - db.y) <= DEL_R) { stat.badgeCovered++; continue; }   // 배지가 위에 덧그려진 자리
          stat.handlePts++;
          const h = T.drawsHitTest(q.x, q.y);
          const k = h ? h.kind : "null";
          if (k === "handle") continue;
          if (k === "swatch") stat.swatch++; else if (k === "del") stat.del++; else stat.other++;
        }
      }
      // S4 — 배지의 보이는 원
      if (db) for (const q of ringPts(db.x, db.y, DEL_R)) {
        if (!inClip(q.x, q.y)) continue;
        stat.s4pts++;
        const h = T.drawsHitTest(q.x, q.y);
        if (!h || h.kind !== "del") stat.s4bad++;
      }
    }
  }
  console.log(`\n[${label}] 2점 도형 4종(trend·channel·range·period)`);
  console.log(`  구성(configs)                : ${stat.configs.toLocaleString()}`);
  console.log(`  S1 핸들 링 클릭 표본         : ${stat.handlePts.toLocaleString()}  (배지가 덮은 표본 ${stat.badgeCovered.toLocaleString()} 제외)`);
  console.log(`  S1 위반  → swatch            : ${stat.swatch.toLocaleString()}`);
  console.log(`  S1 위반  → del               : ${stat.del.toLocaleString()}`);
  console.log(`  S1 위반  → 그 밖(body/null)  : ${stat.other.toLocaleString()}`);
  console.log(`  S3 스와치 ∩ 배지 히트원 구성 : ${stat.s3.toLocaleString()}`);
  console.log(`  S4 배지 원 클릭 표본/위반    : ${stat.s4pts.toLocaleString()} / ${stat.s4bad.toLocaleString()}`);
  return stat;
}

function runLines(label) {
  const stat = { configs: 0, pts: 0, swatch: 0, other: 0, s3: 0 };
  const priceFine = []; for (let p = 50.25; p <= 149.75; p += 0.25) priceFine.push(Math.round(p * 100) / 100);
  const barsAll = []; for (let i = 0; i < 100; i++) barsAll.push(i);

  // hline — 가격이 곧 선 위치. 앵커 봉은 후보 순서에만 영향.
  for (const p of (QUICK ? priceFine.filter((_, i) => i % 40 === 0) : priceFine))
    for (const b of (QUICK ? [0, 50, 99] : [0, 25, 50, 75, 99])) {
      const d = { id: "hl", type: "hline", a: { t: times[b], p } };
      const y = Y(p);
      if (!inClip(300, y)) continue;
      if (!select(d, 300, y)) continue;
      stat.configs++;
      const db = T._delBadge(G, d), sw = T._swatchRects(G, d);
      if (db) for (const r of sw) if (rectHitsCircle(r, db.x, db.y, db.r + 2)) { stat.s3++; break; }
      for (let x = g.padX + 1; x <= g.plotRight - 1; x += 7)
        for (const dy of [-BODY_R + 0.1, -2.5, 0, 2.5, BODY_R - 0.1]) {
          const qy = y + dy;
          if (!inClip(x, qy)) continue;
          if (db && Math.hypot(x - db.x, qy - db.y) <= db.r + 2) continue;   // 배지 자리는 배지 몫
          stat.pts++;
          const h = T.drawsHitTest(x, qy);
          const k = h ? h.kind : "null";
          if (k === "body") continue;
          if (k === "swatch") stat.swatch++; else stat.other++;
        }
    }
  // vline — 봉 위치가 곧 선 위치.
  for (const b of (QUICK ? barsAll.filter((_, i) => i % 10 === 0) : barsAll))
    for (const p of (QUICK ? [100] : [55, 80, 100, 125, 145])) {
      const d = { id: "vl", type: "vline", a: { t: times[b], p } };
      const x = X(b);
      if (!inClip(x, 200)) continue;
      if (!select(d, x, 200)) continue;
      stat.configs++;
      const db = T._delBadge(G, d), sw = T._swatchRects(G, d);
      if (db) for (const r of sw) if (rectHitsCircle(r, db.x, db.y, db.r + 2)) { stat.s3++; break; }
      for (let qy = g.padTop + 1; qy <= g.ch - g.padBot - 1; qy += 5)
        for (const dx of [-BODY_R + 0.1, -2.5, 0, 2.5, BODY_R - 0.1]) {
          const qx = x + dx;
          if (!inClip(qx, qy)) continue;
          if (db && Math.hypot(qx - db.x, qy - db.y) <= db.r + 2) continue;
          stat.pts++;
          const h = T.drawsHitTest(qx, qy);
          const k = h ? h.kind : "null";
          if (k === "body") continue;
          if (k === "swatch") stat.swatch++; else stat.other++;
        }
    }
  console.log(`\n[${label}] hline·vline (M-9 — 본체 밴드 위 클릭)`);
  console.log(`  구성(configs)                : ${stat.configs.toLocaleString()}`);
  console.log(`  S2 밴드 클릭 표본            : ${stat.pts.toLocaleString()}`);
  console.log(`  S2 위반  → swatch            : ${stat.swatch.toLocaleString()}`);
  console.log(`  S2 위반  → 그 밖             : ${stat.other.toLocaleString()}`);
  console.log(`  S3 스와치 ∩ 배지 히트원 구성 : ${stat.s3.toLocaleString()}`);
  return stat;
}

const t0 = Date.now();
console.log("스쿱포지 드로잉 히트영역 스윕 — geometry padX 50 / plotRight 650 / ch 400 / count 100 / 가격 50~150"
  + (QUICK ? "  [--quick]" : ""));
console.log("대상 모듈: " + MODULE);
const full = run2("전체 공간", bars, bars);
const norm = run2("정상 작도 구간(오른쪽 끝이 마지막 20봉)", bars, barsRight);
const lines = runLines("수평·수직선");

const bad = full.swatch + full.del + full.other + norm.swatch + norm.del + norm.other
          + lines.swatch + lines.other + full.s3 + norm.s3 + lines.s3 + full.s4bad + norm.s4bad;
console.log(`\n총 위반 = ${bad.toLocaleString()}   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(bad === 0 ? 0 : 1);
