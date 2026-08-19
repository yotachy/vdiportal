# BUILD — order of work, testing, and the three things that will bite

## Phase 0 — Spike, before anything else (1–2 days)

**Goal: prove the engine runs unchanged in a WebView, and find out how slow it is.**

Everything downstream assumes `forge-core.js` is reusable. Verify that first, in isolation:

1. A single blank HTML file. Load `forge-core.js` as a classic script.
2. Fetch one ticker's daily OHLC through `forge-api.php`.
3. Run the composite analysis. Log the result and `performance.now()`.
4. Draw the price series and the forecast cone on a `<canvas>` sized to 390 px.
5. Run it on a **mid-range Android device**, not an emulator, not your laptop.

Numbers to record: cold analysis time, re-analysis time, memory. If a Full run (32 indicators × 3 timeframes) takes more than ~2 s on mid-range hardware you need a Web Worker and per-indicator progress — decide that here, not in month two.

Also confirm at this stage: does `forge-tools.js` bind to touch events, or does it assume mouse? That determines how much of the drawing toolset survives into v1.

## Phase 1 — Mobile shell

New directory alongside the PC app, e.g. `map/mobile/`. Keep the repo's convention: no bundler, plain files.

```
mobile/
  index.html
  vendor/forge-core.js        ← copied unchanged, version-pinned
  vendor/forge-tools.js       ← copied unchanged
  chart.js                    ← touch chart renderer (ported from forge-draw.js)
  screens/…                   ← one module per screen
  api.js                      ← forge-api.php client
  wallet.js                   ← server wallet client (display cache only)
```

Build order: **Watchlist → Basic report → tier chooser → Full result.** One vertical slice, working end to end, before adding Custom, evidence screens or wallet UI. Resist building all the screens shallowly.

The chart is the hard part and should be second, not last. Everything else is lists and typography.

## Phase 2 — Capacitor

```
npm i @capacitor/core @capacitor/cli
npx cap init
npx cap add android
```

Point `webDir` at `mobile/`. Keep assets **bundled** — the WebView must not load the PC site (see SPEC-economy §6).

Then `@capacitor-community/admob`. Wire the two ad units with **test ad unit IDs** first; real IDs only after the reward path is verified end to end.

## Phase 3 — Wallet + auth

Per `SPEC-economy.md`. Server ledger, SSV callback, Google sign-in via Capacitor's credential plugin. Do this before real ad units go live.

## Phase 4 — Release

Internal testing track in Play Console. Ship the first build **without ads enabled** to validate the app itself, then enable them.

---

## Testing

| What | How |
|---|---|
| Layout, copy, most logic | Chrome DevTools device mode. Covers ~90% of the work. |
| Real touch behaviour, chart gestures, performance | `npx cap run android` on a physical device, then `chrome://inspect` to debug the WebView with full DevTools. |
| Rewarded ads | **Physical device only.** Rewarded video is unreliable on emulators. Use AdMob test IDs. |
| Fold / tablet layouts | Android Studio's resizable emulator, plus a real foldable if you can borrow one — the fold seam is not simulated well. |
| Wallet correctness | Server-side unit tests on the ledger: double-spend, replayed idempotency key, SSV replay, clock-shifted check-in, cap overflow. |
| Engine | The existing `node --test forge-core.test.js` (251 cases) keeps passing. Do not fork the engine; if it needs a change, change it upstream so both apps benefit. |

---

## The three that will bite

### 1. CORS
The app's origin is `capacitor://localhost` (or `https://localhost` with `androidScheme: 'https'`), not `parksvc.mycafe24.com`. Every request to `forge-api.php` fails until you send CORS headers and handle the preflight `OPTIONS`. Do this on day one of Phase 1 or you will misdiagnose it as a network bug.

Setting `androidScheme: 'https'` in `capacitor.config` is usually the smoother path — some APIs and cookie behaviour treat custom schemes as insecure.

### 2. cafe24's 128 KB POST limit
Documented in the repo's `CLAUDE.md`: openresty rejects POST bodies over 131072 bytes **with a 404**, which is a maddening symptom. The PC app already works around it by splitting image uploads into separate ops. Any mobile endpoint that posts an analysis payload, a preset, or history must stay under it — chunk or store by reference.

### 3. Client-side Scoops
Covered in SPEC-economy, repeated here because it is the one that cannot be retrofitted cheaply. If v1 ships with a local balance, migrating users to a server ledger later means either wiping balances or trusting numbers you know are wrong.

---

## Open items carried from design

| Item | Kind |
|---|---|
| Redraw the watchlist (`#1a`) in the turn-2 type system | Design |
| Per-tier measured accuracy (currently derived from timeframe figures) | Data |
| Read `map/forge-scorecard.html` (115 KB) — the PC verification page, never opened during design | Data |
| Fill the engine release timeline from real commit history | Content |
| Real per-ticker numbers and miss-log entries to replace placeholders | Content |
