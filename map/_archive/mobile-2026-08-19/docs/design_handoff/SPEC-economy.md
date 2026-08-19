# SPEC — Scoops economy, server-side

Read this before writing any wallet code. Two things here are difficult to retrofit: the ledger's location and the reward-grant path.

## 1. The ledger lives on the server. Always.

A client-held balance is edited within a week of launch — a WebView's `localStorage` is trivially reachable on a rooted device, and Capacitor's storage is no better. Worse, a client-granted reward means the app decides when it has watched an ad, which is precisely what AdMob's abuse tooling looks for.

```
POST forge-api.php  {op:'wallet.get',   deviceId|idToken}
                    {op:'wallet.spend', runType:'full'|'custom'|'slot'|'scan', idem}
                    {op:'wallet.checkin'}
GET  (AdMob SSV callback endpoint — separate path, see §2)
```

The client never sends a balance, never sends a delta, and never sends "I watched an ad". It sends *intent* (`spend`) and *identity*; the server computes and returns the authoritative balance.

**Spend must be idempotent.** Mobile networks retry. Send a client-generated `idem` (uuid) with every spend; the server records it and replays the same result rather than double-charging. A user charged twice for one analysis will uninstall.

**Spend and run are one transaction.** Debit, then produce the analysis, then commit — or refund. Never debit optimistically and hope the analysis succeeds.

### Storage

The repo already uses flat JSON on cafe24 (`forge_data.json`, `forge_images.json`). A wallet needs concurrent-safe increments, which flat-file JSON does not give you under any real load. Use SQLite (or MySQL if the hosting has it) for:

```
accounts(id, google_sub NULL, device_id, created_at, balance, streak_days, last_checkin)
ledger(id, account_id, delta, reason, ref, idem UNIQUE, created_at)
ad_grants(ssv_transaction_id UNIQUE, account_id, ad_unit, amount, granted_at)
runs(id, account_id, symbol, tier, engine_version, created_at, expiry, outcome NULL)
```

Balance is `SUM(ledger.delta)`, cached on `accounts.balance`. Keeping the ledger (not just the number) is what lets you answer "where did my Scoops go" and detect abuse patterns.

## 2. Rewards come from AdMob's server, not the app

Use **rewarded ads with Server-Side Verification (SSV)**. Configure the SSV callback URL in the AdMob console; Google then calls *your* server when a user genuinely completes an ad.

- Set a `custom_data` (your `account_id`) and `user_id` when you load the ad, so the callback can be attributed.
- **Verify the callback signature** against Google's published keys. An unverified SSV endpoint is an open faucet.
- `transaction_id` is the dedupe key — store it in `ad_grants` with a unique constraint and ignore repeats.
- The client's "ad completed" event is a **UI cue only** (show the reward animation optimistically, then reconcile against the server balance). If the SSV callback never arrives, reconcile downward and tell the user plainly.

Two ad units, because the reward differs:

| Unit | Format | Reward |
|---|---|---|
| Quick | Rewarded interstitial, ~15 s, no skip | +1 |
| Full | Rewarded video, ~30 s, skip after 5 s | +3 |

Never grant on `onAdDismissed`. Grant on SSV.

## 3. Caps and cooldowns are server-enforced

Daily view cap (8), re-watch cooldown (2 min), wallet cap (20), daily check-in (+1), 7-day streak chest (+5) — all evaluated server-side against server time. Client-side timers are display only; a user who changes the device clock must gain nothing.

The wallet cap matters for the loop: it stops hoarding, so Scoops keep cycling and the user keeps watching. Enforce it on grant (excess is discarded, and the UI should say so before the ad, not after).

## 4. Anonymous first, then linked

Onboarding grants 5 Scoops to a `device_id`. When the user signs in with Google, **merge** the anonymous account into the Google account rather than creating a new one — take the higher balance and the longer streak, and write a ledger row recording the merge.

Guard the obvious exploit: a fresh install grants 5 more Scoops. Rate-limit new-account grants per device/IP, and do not re-grant to a `device_id` that has already claimed. This is the single most likely abuse vector at launch.

## 5. Do not charge for a non-answer

When the engine declines to call it (see the no-call screen), **no debit**. Implement it as: evaluate conviction *before* the spend commit; if below threshold, roll back and return the no-call payload. The screen says "Balance still 5" — make that true.

Likewise, re-scoring a saved analysis after an engine update is free and must not touch the ledger.

## 6. Store policy

- Rewarded currency needs the disclosure already in the design: *"Scoops have no cash value and cannot be transferred or refunded."*
- Google Play / AdMob reject apps that are a thin WebView wrapper around a website. Bundle the app assets locally and call `forge-api.php` only for data — which is what the architecture already does. Do not point the WebView at the live PC site.
- UMP (User Messaging Platform) consent is required for EEA/UK/CA users. It is in the design as onboarding step 5, but it must also be re-presentable from Settings → Ad settings.
