// 광고 파사드. 화면은 플러그인을 직접 부르지 않는다 — 부르면 브라우저에서 화면을
// 테스트할 수 없고(플러그인이 없다), 나중에 플러그인을 바꿀 때 화면까지 흔들린다.
//
// 이 파일이 지키는 규정은 둘이다.
//  ① 동의(UMP)가 첫 광고 요청보다 **먼저** 끝난다. 순서가 규정이지 구현 취향이 아니다 —
//     광고를 띄운 뒤에 동의를 물으면 이미 동의 없이 띄운 것이고, 그것이 EEA·영국·캐나다에서
//     이 기능을 출시할 수 없게 만드는 사유다. init() 이 만든 약속을 show() 가 반드시 기다린다.
//  ② customData 를 가공하지 않고 그대로 SSV 에 실어 보낸다. wallet-ssv.php 는 ^[0-9a-f]{16}$
//     가 아니면 콜백 전체를 조용히 버린다(빈 200, 로그 없음, 구글 재시도 없음) — 감싸거나
//     조합하는 순간 그 계정의 광고 보상이 전부 말없이 사라지고 사용자는 헛되이 광고를 다 본다.
//
// 광고를 끝까지 봤는지는 여기서 판정하지 않는다 — 그건 서버가 SSV 로 안다.
// show() 는 "띄웠고 사용자가 닫았다"까지만 말한다. 보상 금액도 서버가 정한다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSAds = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // AdmobConsentStatus / PrivacyOptionsRequirementStatus 는 8.1.0 타입 정의의 문자열 enum 이다.
  var STATUS_REQUIRED = "REQUIRED";

  var plugin = null;        // 네이티브 플러그인. 브라우저·테스트에는 없다
  var cfg = null;           // 서버 adConfig 응답 {quick, full, customData}
  var consent = null;       // 마지막으로 읽은 AdmobConsentInfo
  var consentReady = null;  // init() 이 건 동의 해소 약속. show() 의 관문이다

  // Capacitor 플러그인은 네이티브에서만 존재한다. 브라우저·테스트에서는 없다.
  function detect() {
    if (plugin) return plugin;
    var C = (typeof window !== "undefined") ? window.Capacitor : null;
    if (C && C.Plugins && C.Plugins.AdMob) plugin = C.Plugins.AdMob;
    return plugin;
  }

  // 테스트 주입 지점. 상태까지 같이 지운다 — 안 지우면 앞 테스트의 동의 정보가 다음
  // 테스트로 새어 "왜 여기서 통과하지" 를 만든다.
  function install(p) {
    plugin = p || null;
    cfg = null;
    consent = null;
    consentReady = null;
    return plugin;
  }

  function available() { return !!detect() && !!cfg; }

  function res(shown, reason) { return { shown: shown, reason: reason }; }

  // 광고를 요청해도 되는가. UMP 가 **명시적으로 아니라고 할 때만** 막는다.
  // 조회 자체가 실패했거나(네트워크) 필드가 없으면 막지 않는다 — 대상 지역이 아닌
  // 사용자(한국 포함)까지 광고가 꺼지는 쪽이 더 나쁘고, 그건 아무도 신고하지 않는 고장이다.
  function canRequestAds() {
    return !(consent && consent.canRequestAds === false);
  }

  // initialize 뒤에 requestConsentInfo 를 **연결해서** 건다. 병렬로 띄우면 순서가 우연이 되고,
  // 우연은 느린 기기에서만 어긋나 재현되지 않는 정책 위반이 된다.
  function init(c) {
    cfg = c || null;
    consent = null;
    var p = detect();
    if (!p) {
      // 플러그인이 없으면 띄울 광고도 없다. 그래도 약속은 만들어 둔다 — show() 가
      // 관문 없이 지나가는 경로를 남기지 않기 위해서다.
      consentReady = Promise.resolve(null);
      return consentReady;
    }
    consentReady = p.initialize({})
      .then(function () { return p.requestConsentInfo(); })
      .then(function (info) { consent = info || null; return consent; })
      ["catch"](function () { consent = null; return null; });
    return consentReady;
  }

  function show(unit) {
    var p = detect();
    if (!p || !cfg || !cfg[unit] || !cfg[unit].unitId) return Promise.resolve(res(false, "unavailable"));
    // init() 을 거치지 않았으면 동의가 해소된 적이 없다. 광고를 띄우지 않는다 —
    // 이 줄이 "동의 먼저" 를 구조로 못 박는다(호출 순서에 기대지 않는다).
    if (!consentReady) return Promise.resolve(res(false, "unavailable"));
    // customData 가 없으면 이 광고는 보상이 될 수 없다. SSV 콜백이 계정을 못 찾아 조용히
    // 버려지므로, 띄우는 것이 안 띄우는 것보다 나쁘다 — 사용자는 다 보고 아무것도 못 받는다.
    if (!cfg.customData) return Promise.resolve(res(false, "no-ssv"));

    return consentReady.then(function () {
      if (!canRequestAds()) return res(false, "consent-required");
      // ssv.customData 는 서버가 준 계정 id 그대로다. 접두·접미·JSON 포장 전부 금지.
      return p.prepareRewardVideoAd({ adId: cfg[unit].unitId, ssv: { customData: cfg.customData } })
        .then(function () { return p.showRewardVideoAd(); })
        .then(function () { return res(true, ""); });
    })["catch"](function () { return res(false, "failed"); });
  }

  // 동의 폼을 띄워야 하는가. **status 가 REQUIRED 일 때만**이다.
  // 폼이 있는지(isConsentFormAvailable)만 보고 띄우면 이미 동의를 마친(OBTAINED) 사용자에게
  // 앱을 열 때마다 동의창이 뜬다 — 그 필드는 "폼이 준비돼 있다"지 "물어봐야 한다"가 아니다.
  // (8.1.0 타입 정의에서 isConsentFormAvailable 은 선택 필드라 없을 수도 있다.)
  function consentNeeded() {
    var gate = consentReady || Promise.resolve(null);
    return gate.then(function () {
      return !!(consent && consent.status === STATUS_REQUIRED && consent.isConsentFormAvailable === true);
    });
  }

  function showConsent() {
    var p = detect();
    if (!p) return Promise.resolve(canRequestAds());
    // showConsentForm 은 void 가 아니라 **갱신된 AdmobConsentInfo** 를 돌려준다.
    // 다시 읽지 않으면 방금 동의를 마친 사용자가 예전 canRequestAds=false 에 계속 막힌다.
    return p.showConsentForm().then(function (info) {
      if (info) consent = info;
      return canRequestAds();
    })["catch"](function () { return canRequestAds(); });
  }

  // 설정에 "광고 설정" 재진입 줄을 노출할지. privacyOptionsRequirementStatus 가 정확히
  // 이 용도로 있는 필드다 — 폼 존재 여부로 대신하면 필요 없는 지역에도 줄이 생긴다.
  function privacyOptionsRequired() {
    var gate = consentReady || Promise.resolve(null);
    return gate.then(function () {
      return !!(consent && consent.privacyOptionsRequirementStatus === STATUS_REQUIRED);
    });
  }

  function showPrivacyOptions() {
    var p = detect();
    if (!p || !p.showPrivacyOptionsForm) return Promise.resolve(canRequestAds());
    // 이 폼은 갱신된 정보를 돌려주지 않는다(void). 닫힌 뒤 직접 다시 읽어야
    // 사용자가 방금 동의를 철회한 것을 우리가 안다.
    return p.showPrivacyOptionsForm()
      .then(function () { return p.requestConsentInfo(); })
      .then(function (info) { if (info) consent = info; return canRequestAds(); })
      ["catch"](function () { return canRequestAds(); });
  }

  // 마지막으로 읽은 동의 정보(없으면 null). 화면이 다시 그릴 때 비동기 관문을 또 통과하지
  // 않게 열어 둔다 — 읽기 전용이다.
  function consentInfo() { return consent; }

  return { available: available, install: install, init: init, show: show,
           canRequestAds: canRequestAds, consentNeeded: consentNeeded, showConsent: showConsent,
           privacyOptionsRequired: privacyOptionsRequired, showPrivacyOptions: showPrivacyOptions,
           consentInfo: consentInfo };
});
