// MSWallet 용 HTTP 백엔드. 서버가 준 state 를 그대로 전달할 뿐 아무 것도 계산하지 않는다 —
// 클라이언트가 잔량을 들면 SPEC-economy §1 이 경고한 그 상태로 되돌아간다.
// 오프라인에서도 잔량을 지어내지 않는다: state 는 null 이고 화면이 "사용할 수 없음"을 그린다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSWalletHttp = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var K_DEV = "ms_device_id", K_TOK = "ms_wallet_token", K_REFQ = "ms_pending_refunds";

  // 미확인 환급 큐의 상한. 넘치면 오래된 것부터 버린다 — 무한히 자라면 저장소 쿼터를 먹는다.
  var REFQ_MAX = 50;

  // wallet.js 의 MSWallet.maybeCharged 와 같은 분류다 — "서버가 답을 안 했거나 흔들렸다"라
  // 재시도가 의미 있는 사유들. 여기서 그 모듈을 참조하지 않는 이유는 이 어댑터가 wallet.js
  // 없이 단독으로 단위 테스트되기 때문이다. 두 목록이 갈라지면 wallet-http.test.mjs 가 잡는다.
  var RETRYABLE = { network: 1, "server-error": 1, busy: 1 };

  // deviceId 는 hello() 가 365일 베어러 토큰과 맞바꾸는 유일한 비밀이다 — 서버가 강제하는
  // 것은 길이(W_DEVICE_MIN=32)뿐이고 무작위성은 강제할 수 없다(wallet-api.php 주석 I4).
  // 그래서 카운터·타임스탬프 계열은 절대 쓰지 않는다: crypto.getRandomValues 로 24바이트를
  // 뽑아 48자 hex 로 인코딩한다 — 서버 하한(32)을 항상, 여유 있게 넘긴다.
  function uuid() {
    try {
      if (typeof crypto !== "undefined" && crypto && crypto.getRandomValues) {
        var bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        var hex = "";
        for (var i = 0; i < bytes.length; i++) hex += ("0" + bytes[i].toString(16)).slice(-2);
        return "d-" + hex;
      }
    } catch (e) {}
    // crypto 가 없는 극단적 구형 런타임 전용 최후 폴백 — Capacitor WebView(실제 배포 대상)엔
    // crypto.getRandomValues 가 있으므로 여기까지 올 일이 없다. 그래도 32자 하한은 지킨다.
    return "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12)
                + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  }
  function fail(reason) { return { ok: false, reason: reason, state: null }; }

  function create(opts) {
    var o = opts || {};
    var url = o.url || "wallet-api.php";
    var f = o.fetch || (typeof fetch !== "undefined" ? fetch : null);
    var store = o.store || (typeof MSStore !== "undefined" ? MSStore : null);

    function get0(k, d) { return store ? store.read0(k, d) : d; }
    function set0(k, v) { if (store) store.write0(k, v); }

    // 서버 하한(W_DEVICE_MIN=32)과 맞춘다. 8 처럼 낮은 문턱을 쓰면 32자 미만인 옛/손상된
    // 저장값이 "있으니 그냥 쓴다"로 통과해 매번 hello 가 400 bad-device 로 거절하고,
    // deviceId() 는 절대 다시 부르지 않으므로(hello() 안에서만 호출) 스스로 못 고치고
    // 영구히 unauthorized 로 잠긴다(I-E). 32로 맞추면 짧은 값을 다음 hello 호출에서 자동으로
    // 갈아 끼운다 — 그래도 hello() 에 별도 bad-device 자가치유를 추가로 둔다(아래) — 서버가
    // 언젠가 하한을 더 올리거나 다른 경로로 손상값이 저장되는 경우까지 잡기 위해서다.
    function deviceId() {
      var d = get0(K_DEV, null);
      if (typeof d !== "string" || d.length < 32) { d = uuid(); set0(K_DEV, d); }
      return d;
    }

    function post(body, token) {
      if (!f) return Promise.resolve(null);
      var headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      return f(url, { method: "POST", headers: headers, body: JSON.stringify(body) })
        .then(function (res) {
          return res.json().then(function (j) { return { status: res.status, json: j }; },
                                 function () { return { status: res.status, json: null }; });
        })
        ["catch"](function () { return null; });
    }

    // regenerated 는 재귀 1회 제한용 — bad-device 자가치유를 무한 루프시키지 않는다.
    function hello(regenerated) {
      return post({ op: "hello", deviceId: deviceId() }, null).then(function (r) {
        if (r && r.json && r.json.ok && r.json.token) {
          set0(K_TOK, r.json.token);
          return r.json.token;
        }
        // 저장된 deviceId 가(어떤 경로로든) 서버 하한보다 짧으면 서버가 매번 bad-device 로
        // 거절한다 — deviceId() 는 hello() 안에서만 불리므로 여기서 스스로 안 고치면 그 뒤
        // 모든 호출이 영구히 unauthorized 로 잠긴다(I-E, 리뷰 실측). 한 번만 새로 발급한다.
        if (!regenerated && r && r.json && r.json.reason === "bad-device") {
          set0(K_DEV, null);
          return hello(true);
        }
        return null;
      });
    }

    // 401 은 딱 한 번만 재발급하고 재시도한다. 두 번째도 401 이면 포기한다 —
    // 안 그러면 서버가 계속 거절할 때 무한 루프가 된다.
    //
    // 토큰이 아예 없으면(첫 부팅) 이건 서버가 내린 401 이 아니라 "아직 hello 를 한 적이 없다"
    // 는 클라이언트 사정일 뿐이다 — 그 자리를 채우려고 진짜 서버 응답인 것처럼 {status:401} 을
    // 지어내면, hello() 마저 그물에 걸릴 때(오프라인) 그 지어낸 401 이 그대로 살아남아
    // "unauthorized" 로 보고된다. 실제로는 서버에 닿지도 못했으니 "network" 여야 옳다(I-D).
    // 그래서 토큰이 없을 땐 애초에 지어내지 않고 곧장 hello() 결과(성공/네트워크실패)를 쓴다.
    function call(body) {
      var tok = get0(K_TOK, null);
      if (!tok) {
        return hello().then(function (nt) {
          if (!nt) return null;   // hello 자체가 안 됐다 — 진짜 네트워크 문제, shape()가 "network"로 답한다
          return post(body, nt);
        });
      }
      var first = post(body, tok);
      return first.then(function (r) {
        if (r && r.status !== 401) return r;
        return hello().then(function (nt) {
          if (!nt) return r;   // r 은 실제 서버 401 이거나(재인증 실패) null(네트워크) — 둘 다 그대로 보존
          return post(body, nt);
        });
      });
    }

    function shape(r, extra) {
      if (!r) return fail("network");
      var j = r.json;
      if (!j) return fail(r.status === 401 ? "unauthorized" : "server-error");
      var out = { ok: !!j.ok, state: j.state || null, reason: j.reason || null };
      for (var i = 0; i < (extra || []).length; i++) {
        var k = extra[i];
        if (Object.prototype.hasOwnProperty.call(j, k)) out[k] = j[k];
      }
      return out;
    }

    // ── 미확인 환급 큐 ──────────────────────────────────────────────────
    // 환급을 부르는 계기는 "OHLC 로드가 전부 실패했다"이고, 폰에서 그건 대개 네트워크가
    // 끊겼다는 뜻이다 — 즉 환급 호출 자체도 같은 이유로 실패한다. 실패를 그냥 버리면
    // 프로덕션에서 가장 자주 필요한 환급이 가장 확실하게 유실되고, 사용자는 답을 못 받은
    // 값을 낸 채 복구 수단이 없다(화면들은 rf.ok 를 문구에만 쓰고 레코드를 버렸다).
    // w_refund 는 멱등이라 재시도가 공짜다 — 서버가 확정으로 답할 때까지 들고 있는다.
    var draining = false;

    function refQueue() {
      var v = get0(K_REFQ, null);
      return (Object.prototype.toString.call(v) === "[object Array]") ? v : [];
    }
    function refEnqueue(idem) {
      if (typeof idem !== "string" || idem === "") return;
      var q = refQueue();
      for (var i = 0; i < q.length; i++) if (q[i] === idem) return;
      q.push(idem);
      if (q.length > REFQ_MAX) q = q.slice(q.length - REFQ_MAX);
      set0(K_REFQ, q);
    }
    function refDequeue(idem) {
      var q = refQueue(), out = [];
      for (var i = 0; i < q.length; i++) if (q[i] !== idem) out.push(q[i]);
      set0(K_REFQ, out);
    }

    function refundOnce(idem) {
      return call({ op: "refund", idem: idem }).then(function (r) {
        var out = shape(r);
        // ok 이거나 서버가 확정으로 답한 사유(not-found·already-refunded·nothing-to-refund·
        // unauthorized 등)면 이 키는 끝났다. 재시도해도 답이 달라지지 않는다.
        if (out.ok || !Object.prototype.hasOwnProperty.call(RETRYABLE, out.reason || "")) refDequeue(idem);
        return out;
      });
    }

    // 다음 지갑 호출(또는 다음 실행)에 배수한다. 큐가 비면 네트워크를 타지 않는다.
    // 비동기로 흘려보낸다 — 사용자의 호출을 환급 재시도가 기다리게 만들지 않는다.
    function drainRefunds() {
      if (draining) return;
      var q = refQueue();
      if (!q.length) return;
      draining = true;
      var p = Promise.resolve();
      q.forEach(function (idem) {
        p = p.then(function () { return refundOnce(idem); })["catch"](function () {});
      });
      p.then(function () { draining = false; }, function () { draining = false; });
    }

    drainRefunds();   // 실행 시점 — 지난 실행에서 못 보낸 환급이 여기서 나간다

    return {
      get: function () {
        drainRefunds();
        return call({ op: "get" }).then(function (r) { return shape(r); });
      },
      spend: function (runType, idem, ref) {
        drainRefunds();
        return call({ op: "spend", runType: runType, idem: idem, ref: ref || null })
          .then(function (r) { return shape(r, ["charged"]); });
      },
      refund: function (idem) {
        // 보내기 전에 적는다 — 요청이 나간 뒤 앱이 죽으면(강제 종료·OOM) 그 사이의 환급이
        // 통째로 사라진다. 확정 응답을 받은 뒤에만 지운다.
        refEnqueue(idem);
        return refundOnce(idem);
      },
      checkin: function () {
        drainRefunds();
        return call({ op: "checkin" }).then(function (r) { return shape(r, ["granted", "capped"]); });
      },
      // 화면·테스트가 큐 상태를 볼 수 있게 열어 둔다(진단용 — 쓰기는 없다).
      pendingRefunds: function () { return refQueue(); }
    };
  }

  return { create: create };
});
