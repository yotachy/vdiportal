/* 머니스쿱 앱 — 보상 광고(P10 AdMob). 네이티브(Capacitor 셸)에서만 실광고, 웹은 안내 토스트.
   지급은 클라가 하지 않는다: 광고 완주 → 구글이 wallet-ssv.php 로 서명 콜백 → w_ad_grant 가
   계정 원장에 적립 → 클라는 wallet_state 를 몇 번 다시 읽어 잔액을 따라간다(SSV 는 비동기).
   customData = 서버가 준 계정 id 그대로(가공 금지 — SSV 가 모양이 다르면 조용히 버린다).
   플러그인은 번들러 없이 window.Capacitor.Plugins.AdMob 로 잡는다(네이티브 등록 플러그인 노출). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
  let plugin = null, inited = false, busy = false;

  function admob() {
    if (plugin) return plugin;
    plugin = (cap && cap.Plugins && cap.Plugins.AdMob) || null;
    return plugin;
  }

  async function init() {
    if (inited || !native || !admob()) return;
    await admob().initialize({ initializeForTesting: false });
    inited = true;
  }

  // 잔여 횟수 갱신(내 스쿱 화면 표시용)
  async function refreshState() {
    try {
      const r = await MS.data.api("ad_state", {});
      if (r && r.ok) MS.store.set({ adRemaining: r.remaining });
    } catch (e) {}
  }

  // SSV 콜백이 도착할 시간을 주며 잔액을 따라간다
  async function pollBalance(prev) {
    for (let i = 0; i < 4; i++) {
      await new Promise(function (res) { setTimeout(res, 2000 + i * 1000); });
      const r = await MS.wallet.state();
      if (r && r.balance > prev) return true;
    }
    return false;
  }

  async function watch() {
    if (!native || !admob()) {
      MS.ui.flash("광고 보상은 앱(스토어) 버전에서 열려요", "");
      return { rewarded: false };
    }
    if (busy) return { rewarded: false };
    busy = true;
    try {
      const cfg = await MS.data.api("ad_config", {});
      if (!cfg || !cfg.ok) {
        MS.ui.flash(cfg && cfg.error === "ads-disabled" ? "지금은 광고를 준비 중이에요" : "광고를 불러오지 못했어요", "");
        return { rewarded: false };
      }
      const st = await MS.data.api("ad_state", {});
      if (st && st.ok && st.remaining <= 0) {
        MS.ui.flash("오늘 광고 보상은 다 받았어요 — 내일 다시", "");
        MS.store.set({ adRemaining: 0 });
        return { rewarded: false };
      }
      await init();
      const unit = cfg.full;   // 앱은 완주형 보상 1종(◈+3·XP+5 표시값은 POLICY, 실지급은 서버)
      let rewarded = false;
      const sub = await admob().addListener("onRewardedVideoAdReward", function () { rewarded = true; });
      const before = MS.store.get().scoops;
      await admob().prepareRewardVideoAd({ adId: unit.unitId, ssv: { customData: cfg.customData } });
      await admob().showRewardVideoAd();
      try { sub.remove(); } catch (e) {}
      if (!rewarded) {
        MS.ui.flash("광고를 끝까지 보면 적립돼요", "");
        return { rewarded: false };
      }
      MS.ui.flash("확인 중… 잠시 뒤 스쿱이 들어와요", "");
      const landed = await pollBalance(before);
      if (landed) {
        MS.ui.reward("scoop", MS.store.get().scoops - before, { label: "광고 완주 보상" });
        // ◈ 버스트가 끝난 뒤 XP 버스트가 이어지게(둘이 겹쳐 잘리지 않도록)
        if (MS.xp) setTimeout(function () { MS.xp.add(MS.config.POLICY.scoop.ad.xp, "광고 완주"); }, (MS.config.POLICY.ui.rewardMs || 1500) - 150);
      } else {
        MS.ui.flash("보상 확인이 늦어지고 있어요 — 잠시 뒤 잔액을 확인해 주세요", "");
      }
      refreshState();
      return { rewarded: true, landed: landed };
    } catch (e) {
      MS.ui.flash("광고를 불러오지 못했어요 — 잠시 뒤 다시", "");
      return { rewarded: false };
    } finally {
      busy = false;
    }
  }

  MS.ads = { native: native, watch: watch, refreshState: refreshState };
})();
