// ⚠️ 개발용 지갑 백엔드 — 프로덕션에 나가면 안 된다.
// SPEC-economy.md §1 이 경고한 바로 그 상태(클라이언트가 잔량을 든 상태)다. 루팅된 기기에서
// localStorage 는 쉽게 닿고, 이 파일이 살아 있는 한 잔량은 조작 가능하다.
// 8b(서버 원장)는 이 파일을 '교체'가 아니라 '삭제'한다 — 규칙이 두 벌이면 갈린다.
//
// 못 하는 것 둘(설계서 §4.1): ①출석 판정이 기기 시계를 쓴다 ②재설치하면 5개를 다시 받는다.
// 둘 다 서버 시간·device_id 로만 막을 수 있다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSWalletLocalStub = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEY = "ms_wallet";
  var CAP = 20, SEED = 5, CHECKIN = 1, CHEST_EVERY = 7, CHEST = 5;
  var warned = false;

  function store() {
    if (typeof MSStore !== "undefined") return MSStore;
    if (typeof require === "function") { try { return require("./store.js"); } catch (e) {} }
    return null;
  }
  function load() {
    var s = store(), raw = s ? s.read0(KEY) : null;
    if (!raw || typeof raw !== "object") raw = { balance: SEED, streakDays: 0, lastCheckin: null, entries: [] };
    if (!Array.isArray(raw.entries)) raw.entries = [];
    return raw;
  }
  function save(w) { var s = store(); if (s) s.write0(KEY, w); return w; }

  function ymd(d) {
    return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
  }
  function dayDiff(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }

  function stateOf(w, nowFn) {
    return { balance: w.balance, cap: CAP, streakDays: w.streakDays,
             canCheckin: w.lastCheckin !== ymd(nowFn()) };
  }
  function findEntry(w, idem) {
    for (var i = 0; i < w.entries.length; i++) { if (w.entries[i].idem === idem) return w.entries[i]; }
    return null;
  }
  function push(w, idem, delta, reason, nowFn) {
    w.entries.push({ idem: idem, delta: delta, reason: reason, at: nowFn().toISOString() });
    w.balance += delta;
    return w;
  }

  function create(opts) {
    var o = opts || {};
    var costOf = o.costOf;
    var nowFn = o.now || function () { return new Date(); };
    if (!warned) {
      warned = true;
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[MSWallet] 개발용 로컬 스텁이 설치됐습니다. 프로덕션 빌드에 포함되면 안 됩니다 — 8b 서버 원장이 이 파일을 대체합니다.");
      }
    }

    function ok(w, extra) {
      var r = { ok: true, state: stateOf(w, nowFn) };
      if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k]; } }
      return Promise.resolve(r);
    }
    function fail(w, reason, extra) {
      var r = { ok: false, reason: reason, state: stateOf(w, nowFn) };
      if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k]; } }
      return Promise.resolve(r);
    }

    return {
      get: function () { return ok(save(load())); },

      spend: function (runType, idem) {
        var w = load();
        // 빈 idem 은 원장이 자기들끼리 같은 항목으로 보게 만든다 — 두 번째부터 멱등 재생으로 답해
        // 영구 무료가 된다. wallet.js 도 같은 것을 막지만, 스텁을 직접 부르는 경로가 있어 여기도 막는다.
        if (typeof idem !== "string" || idem === "") return fail(w, "bad-idem");
        var prev = findEntry(w, idem);
        if (prev) return ok(w, { replayed: true });     // 멱등 — 같은 결과를 재현한다
        var cost = costOf ? costOf(runType) : null;
        if (cost == null) return fail(w, "unknown-runtype");
        if (cost === 0) { push(w, idem, 0, "spend:" + runType, nowFn); return ok(save(w)); }
        if (w.balance < cost) return fail(w, "insufficient");
        push(w, idem, -cost, "spend:" + runType, nowFn);
        return ok(save(w));
      },

      refund: function (idem) {
        var w = load();
        var e = findEntry(w, idem);
        if (!e || e.delta >= 0) return fail(w, "nothing-to-refund");
        if (findEntry(w, idem + ":refund")) return fail(w, "already-refunded");
        push(w, idem + ":refund", -e.delta, "refund", nowFn);
        return ok(save(w), { entryCount: w.entries.length });
      },

      checkin: function () {
        var w = load(), today = ymd(nowFn());
        if (w.lastCheckin === today) return fail(w, "already-checked-in");
        var streak = (w.lastCheckin && dayDiff(w.lastCheckin, today) === 1) ? w.streakDays + 1 : 1;
        var want = CHECKIN + ((streak % CHEST_EVERY === 0) ? CHEST : 0);
        // 상한은 지급 시점에 문다 — 넘치는 만큼은 버려지고 그 사실을 결과에 담는다(SPEC §3).
        var room = Math.max(0, CAP - w.balance);
        var granted = Math.min(want, room);
        w.streakDays = streak; w.lastCheckin = today;
        push(w, "checkin:" + today, granted, "checkin", nowFn);
        return ok(save(w), { granted: granted, capped: granted < want });
      }
    };
  }

  return { create: create, CAP: CAP, SEED: SEED };
});
