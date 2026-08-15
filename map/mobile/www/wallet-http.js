// MSWallet 용 HTTP 백엔드. 서버가 준 state 를 그대로 전달할 뿐 아무 것도 계산하지 않는다 —
// 클라이언트가 잔량을 들면 SPEC-economy §1 이 경고한 그 상태로 되돌아간다.
// 오프라인에서도 잔량을 지어내지 않는다: state 는 null 이고 화면이 "사용할 수 없음"을 그린다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSWalletHttp = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var K_DEV = "ms_device_id", K_TOK = "ms_wallet_token", K_REFQ = "ms_pending_refunds";
  var K_ATOK = "ms_account_token";   // 계정 토큰. 있으면 이걸 쓰고, 없으면 기기 토큰(K_TOK).

  // 미확인 환급 큐의 상한. 넘치면 오래된 것부터 버린다 — 무한히 자라면 저장소 쿼터를 먹는다.
  var REFQ_MAX = 50;

  // 환급 재시도 분류. **기본값이 재시도**다 — 여기 없는 사유는 전부 다시 시도한다.
  // 처음엔 반대로(재시도할 사유만 열거) 뒀는데, 그건 돈에서 위험한 방향이었다: 목록에 없는
  // 사유 하나가 곧 "환급을 조용히 버린다"가 된다. 실제로 `storage`(w_db 가 원장을 못 열 때
  // wallet-api.php 가 내는 500)가 그 구멍으로 빠져나갔다 — 정확히 이 큐가 막으려던 실패가,
  // 분류가 모르는 이름을 달고 되돌아온 것이다. 그래서 "재시도해도 답이 달라지지 않는" 확정
  // 사유만 열거하고 나머지는 안전한 쪽(재시도)으로 떨어뜨린다. 새 사유가 서버에 생겨도
  // 최악이 "헛요청 몇 번"이지 "돈이 사라진다"가 아니게 된다.
  var DEFINITIVE = {
    "not-found": 1, "already-refunded": 1, "nothing-to-refund": 1,   // w_refund 의 확정 답
    insufficient: 1, "bad-idem": 1, "bad-ref": 1, "unknown-runtype": 1,   // 원장이 시작조차 안 한 경우
    unauthorized: 1,        // 계정이 없다 — 재시도해도 같다(토큰 재발급은 call() 이 이미 한 번 한다)
    "bad-request": 1        // 디스패처의 400(빈/과길이 idem) — 같은 본문을 다시 보내면 같은 답이다
  };

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
    function callWithDevice(body) {
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

    function acctTok() { return get0(K_ATOK, null); }
    function signedIn() { return !!acctTok(); }
    // 기기 토큰(K_TOK)은 지우지 않는다 — 로그아웃이 그리로 돌아가는 경로다.
    function signOut() { set0(K_ATOK, null); }

    function call(body) {
      // 계정 토큰이 있으면 먼저 그것으로 시도한다. 죽었으면(401) 조용히 버리고
      // 기기 토큰 경로로 내려앉는다 — 로그인은 부가 기능이라, 그것 때문에 앱 전체가
      // 잠기면 안 된다. hello() 재인증은 아래 기존 경로가 그대로 처리한다.
      var at = acctTok();
      if (at) {
        return post(body, at).then(function (r) {
          // r===null 은 서버에 닿지도 못했다는 뜻(post() 의 catch — 오프라인)이다. hello()/
          // callWithDevice 와 같은 원칙: 서버가 내린 판단이 아니므로 계정 토큰을 버릴 근거가
          // 없다 — 그대로 돌려준다(shape() 가 "network"로 답한다). 진짜 401(서버가 거절)일
          // 때만 버리고 기기 토큰 경로로 내려앉는다.
          if (!r) return r;
          if (r.status !== 401) return r;
          signOut();
          return callWithDevice(body);
        });
      }
      return callWithDevice(body);
    }

    // 기기 토큰이 없으면 hello() 로 먼저 받는다(call 의 앞부분과 같은 이유). 저장된 기기
    // 토큰이 401 로 거절되는 경우는 여기서 재시도하지 않는다(callWithDevice 와의 의도적
    // 비대칭) — 로그인 도중 기기 토큰이 만료되는 건 극히 드문 경계 사례이고, 브리프도 이
    // 재시도를 요구하지 않았다. authStart/authPoll 은 실패하면 그대로 reason 을 돌려주고
    // 화면이 다시 시도하게 두는 편이 hello() 재귀를 여기 또 얹는 것보다 단순하다.
    function withDeviceTok(fn) {
      var t = get0(K_TOK, null);
      if (t) return fn(t);
      return hello().then(function (nt) { return nt ? fn(nt) : null; });
    }

    function authStart() {
      // post() 는 { status, json } 을 준다(성공 여부는 json.ok 에 있다 — r 자체엔 "ok" 필드가 없다).
      return withDeviceTok(function (t) { return post({ op: "authStart" }, t); }).then(function (r) {
        if (!r || !r.json) return { ok: false, authUrl: "", nonce: "", reason: "network" };
        return r.json.ok ? { ok: true, authUrl: r.json.authUrl, nonce: r.json.nonce, reason: "" }
                    : { ok: false, authUrl: "", nonce: "", reason: r.json.reason || "network" };
      });
    }
    function authPoll(nonce) {
      return withDeviceTok(function (t) { return post({ op: "authPoll", nonce: nonce }, t); }).then(function (r) {
        if (!r || !r.json || !r.json.ok) return { ok: false, pending: false, reason: (r && r.json && r.json.reason) || "network" };
        if (r.json.pending) return { ok: true, pending: true, reason: "" };
        // 서버가 계정 토큰을 줬다 — 이 순간부터 이 기기는 구글 계정을 본다.
        set0(K_ATOK, r.json.token);
        return { ok: true, pending: false, discarded: r.json.discarded || 0, state: r.json.state, reason: "" };
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
    var draining = null;   // 진행 중 배수 프로미스(없으면 null) — spend 가 이걸 기다린다

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
        // ok 이거나 확정 사유일 때만 큐에서 뺀다. 모르는 사유는 남긴다(위 DEFINITIVE 주석).
        if (out.ok || Object.prototype.hasOwnProperty.call(DEFINITIVE, out.reason || "")) refDequeue(idem);
        return out;
      });
    }

    // 다음 지갑 호출(또는 다음 실행)에 배수한다. 큐가 비면 네트워크를 타지 않는다.
    // 진행 중이면 그 프로미스를 그대로 돌려준다 — 호출부가 "정착했다"를 기다릴 수 있어야 한다.
    function drainRefunds() {
      if (draining) return draining;
      var q = refQueue();
      if (!q.length) return Promise.resolve();
      var p = Promise.resolve();
      q.forEach(function (idem) {
        p = p.then(function () { return refundOnce(idem); })["catch"](function () {});
      });
      draining = p.then(function () { draining = null; }, function () { draining = null; });
      return draining;
    }

    drainRefunds();   // 실행 시점 — 지난 실행에서 못 보낸 환급이 여기서 나간다

    return {
      // 읽기는 배수를 기다리지 않는다 — 잠깐 옛 잔량을 그리는 것뿐이고, 배수가 끝나면 화면이
      // 다시 읽는다. 기다리게 하면 오프라인 재시도 때마다 잔량 표시가 통째로 멎는다.
      get: function () {
        drainRefunds();
        return call({ op: "get" }).then(function (r) { return shape(r); });
      },
      // 결제는 다르다 — 배수가 "끝난 뒤에" 보낸다. 겹치면 Full 을 공짜로 내준다(실측):
      //   spend k1 full/AAPL → charged, 잔량 5→2, 24h 권리 생성
      //   spend k2 full/AAPL → 그 권리에 흡수돼 charged:false (무과금 리포트)
      //   그제서야 큐의 refund k1 이 도착 → 잔량 2→5, 권리 삭제
      //   = 리포트 둘을 받고 잔량은 처음 그대로.
      // 환급이 먼저 정착하면 권리가 지워진 상태라 k2 가 정상 과금된다. 이 순서가 유일한 차이다.
      spend: function (runType, idem, ref) {
        return drainRefunds().then(function () {
          return call({ op: "spend", runType: runType, idem: idem, ref: ref || null })
            .then(function (r) { return shape(r, ["charged"]); });
        });
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
      // 광고 설정 — 유닛 ID 가 없으면(ads-disabled) 화면이 광고 줄을 숨긴다. customData 는
      // AdMob RewardedAd.setServerSideVerificationOptions 에 그대로 넘길 값이다(가공 금지 —
      // wallet-api.php 주석 참고. 다른 모양으로 바꾸면 그 계정의 SSV 콜백이 전부 조용히 버려진다).
      adConfig: function () {
        return call({ op: "adConfig" }).then(function (r) {
          if (!r || !r.json) return { ok: false, reason: "network" };
          return r.json.ok
            ? { ok: true, quick: r.json.quick, full: r.json.full, customData: r.json.customData }
            : { ok: false, reason: r.json.reason || "ads-disabled" };
        });
      },
      // 광고 상태 — 오늘 남은 시청 가능 횟수와 다음 시청 가능 시각(표시용 힌트, 강제 아님).
      adState: function () {
        return call({ op: "adState" }).then(function (r) {
          if (!r || !r.json || !r.json.ok) return { ok: false, remaining: 0, nextAt: null };
          return { ok: true, remaining: r.json.remaining, nextAt: r.json.nextAt };
        });
      },
      // 화면·테스트가 큐 상태를 볼 수 있게 열어 둔다(진단용 — 쓰기는 없다).
      pendingRefunds: function () { return refQueue(); },
      authStart: authStart,
      authPoll: authPoll,
      signOut: signOut,
      signedIn: signedIn
    };
  }

  return { create: create };
});
