# Handoff: MoneyScoop — Mobile App (Android first)

## Overview

MoneyScoop is an existing **PC web** technical-analysis tool ("Scoop Forge") that reads 32 indicators off a price chart and produces a directional verdict, a probability, a forecast cone and target prices. This handoff covers a **new mobile front-end** for it — a separate product, English-first, monetised by **AdMob rewarded video** rather than subscription. The PC service stays live and unchanged.

Source repo: `yotachy/vdiportal`, subtree `map/` (branch `main`). See `github.md` in this bundle's parent project for the sync record.

The mobile app is **not** a responsive pass over the existing PC layout. The PC UI is a fixed four-panel desktop layout in a 170 KB stylesheet; adapting it costs more than replacing it. The **analysis engine is reused unchanged** — that is the whole reason for the hybrid approach.

---

## About the design files

`MoneyScoop Mobile.dc.html` in this bundle is a **design reference created in HTML** — a board of ~50 phone mockups showing intended look, copy and behaviour. It is **not production code to copy**. The job is to recreate these designs in the target environment (a Capacitor + vanilla-JS web app, matching the existing repo's no-build-tool convention), using the real engine.

The board is organised newest-first as numbered "turns" (t12 … t1). Turn ids and option ids (`11a`, `7b`, `3a` …) are stable — this README references them so you can look up any screen.

**Turn 11 (`#11a`) is the final spec panel** — the decision ledger and the canonical screen flow. Start there.

Opening the file: it needs `android-frame.jsx` and `support.js` (both included) as siblings. Open `MoneyScoop Mobile.dc.html` directly in a browser.

## Fidelity

**High fidelity.** Final colours, typography, spacing, copy and tone are decided. Recreate the UI faithfully. Numbers shown in the mocks are real where they come from the repo's backtest report (see *Data provenance* below) and placeholders elsewhere — placeholders are called out.

---

## Architecture decision

**Capacitor hybrid, Android first.** iOS later from the same codebase.

Reasoning: AdMob has no web SDK (web ads are AdSense, which cannot serve rewarded video for an app), so the rewarded-ad economy requires the native Google Mobile Ads SDK. Meanwhile the analysis engine and chart renderer are already pure JS + Canvas. Native (Kotlin) or React Native would mean rewriting ~500 KB of validated indicator maths.

### Reuse map

| File in `map/` | Action |
|---|---|
| `forge-core.js` (211 KB, DOM-free UMD, 251 unit tests) | **Reuse unchanged.** The crown jewel. |
| `forge-tools.js` (72 KB, UMD drawing tools) | Reuse; rebind input to touch. |
| `forge-draw.js` (261 KB) | Port the canvas drawing routines; discard the desktop layout coupling. |
| `forge-api.php` | Keep as the data proxy. Extend with Scoops + auth endpoints. |
| `forge-ui.js`, `forge-app.js`, `forge-state.js`, `forge.css` | **Do not port.** Desktop four-panel UI. Write new. |

Load order in the existing PC app is fixed (`core → state → ui → draw → tools → app`) with a shared global scope and no `defer`. The mobile shell should keep `forge-core.js` and `forge-tools.js` as classic scripts loaded first, and put new code in modules around them.

---

## Design tokens

Every value below is used literally in the mocks.

### Colour

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0a0d12` | App background |
| `bg-raised` | `#0b0e15` | Custom-tier screens only (a half-step warmer) |
| `sheet` | `#11151d` | Bottom sheets |
| `hairline` | `rgba(238,241,247,.06)` | Row dividers |
| `hairline-2` | `rgba(238,241,247,.09)` | Section rules, sheet top border |
| `border` | `rgba(238,241,247,.10)` | Card borders |
| `border-strong` | `rgba(238,241,247,.16)` | Secondary buttons |
| `track` | `rgba(238,241,247,.07)` | Progress/bar tracks |
| `ink` | `#eef1f7` | Primary text |
| `ink-2` | `#c5ccdb` | Secondary text |
| `ink-3` | `#9aa3b6` | Body/supporting text |
| `ink-4` | `#7c8598` | Captions, axis ticks |
| `ink-5` | `#78819a` | Overlines, fine print (**contrast floor — do not go lighter**) |
| `gold` | `#e8b463` | Primary accent |
| `gold-dim` | `#c0a069` | Secondary bars |
| `steel` | `#8892a6` | Basic tier |
| `platinum` | `#b9c4dc` | **User-set values only** |
| `bull` | `#4fb98a` | Up / positive |
| `bear` | `#d96a6a` | Down / negative (fills) |
| `bear-text` | `#e08a8a` | Down / negative (text, for contrast) |
| `neutral` | `#4a5368` | Flat indicator bars |
| `toggle-off` | `#2b3242` | Switch track, off |
| `check-border` | `#39415a` | Unchecked box border |

Legacy PC palette for reference: `--gold:#e8b463`, `--bg:#0b0f14`, `--eth:#8a92b2`, bull `#46c28e`, bear `#e06a6a`. The mobile set above is a deliberate refinement — slightly deeper base, muted bull/bear, and greys raised to clear WCAG AA (4.5:1) at every size used.

**Contrast rule:** all body and caption text must clear 4.5:1 on `#0a0d12`. `#78819a` (≈4.6:1) is the lightest permitted grey for text. This was fixed twice during design — do not regress it, especially on chart axis labels.

### The three-tone system (load-bearing, not decoration)

| Tone | Meaning |
|---|---|
| **Steel** `#8892a6` | Basic tier. Gold appears **zero times** on a Basic screen — the absence reads as "not final". |
| **Gold** `#e8b463` | What the engine says. One gold moment per screen, on the single most important thing. |
| **Platinum** `#b9c4dc` | What **the user** set — their weights, their preset, their backtest. |

On Custom screens gold and platinum appear together so the user can see, at a glance, which numbers are the engine's and which are their own.

### Typography

**Pretendard** throughout (already a CDN dependency of the PC app: `cdn.jsdelivr.net/gh/orioncactus/pretendard`). Ship it as a bundled font file in the app — do not load from CDN in a WebView.

`font-variant-numeric: tabular-nums` on every screen root. This is what makes columns of prices line up and is a large part of why the UI reads as a finance tool.

| Role | Size / weight / tracking |
|---|---|
| Hero price | 38px / 300 / `-.035em` |
| Wallet balance | 48–52px / 300 / `-.04em` |
| Screen headline | 25–29px / 600 / `-.03em` / line-height 1.25–1.35 |
| Verdict word | 27–31px / 700 / `-.025em` |
| Section title | 13–14px / 600 |
| **Overline** | 10.5px / 600 / `letter-spacing:.14em` / uppercase / `ink-5` |
| Row label | 12.5–13.5px / 400–600 |
| Body copy | 12.5–13.5px / line-height 1.6–1.7 / `ink-3` |
| Numeric cell | 12.5–13px / 500–600 |
| Caption | 11–11.5px / `ink-4` |
| Fine print | 10.5–11px / line-height 1.6 / `ink-5` |

Chip/badge labels: 10–11.5px, weight 600–700, `letter-spacing:.1em` when uppercase.

### Spacing, radius, targets

- Screen inset **20px** (22px on sheets and marketing-style screens; 12–14px where a chart bleeds wider).
- List row vertical padding 11–14px; section gaps 20–26px.
- Radius: chips/badges 4–7px · cards & buttons 9–13px · sheet top corners 20px · pills 99px.
- Primary button height **50–52px**; secondary 46–50px; inline pill controls 28–34px.
- **Minimum touch target 44px.** Bare list rows that are tappable must be padded to 44px.

### Layout breakpoints

| Width | Layout |
|---|---|
| < 600 dp | 1 pane — the vertical report |
| 600–904 dp (fold, unfolded) | 2 panes — watchlist ‖ report |
| ≥ 905 dp (tablet) | 3 panes — watchlist ‖ report ‖ indicator rail |

See `#1d` for both wide layouts. They are the same components re-parented, not new screens.

---

## Product model

### Analysis tiers

| Tier | Cost | What it reads | Tone |
|---|---|---|---|
| **Basic** | Free | 5 core indicators (MA, MACD, RSI, Bollinger, Volume), **daily bars only** | Steel |
| **Full** | 3 Scoops | All 32 indicators, daily + weekly + monthly, per-node reasoning, backtest of the setup, dissenting indicators | Gold |
| **Custom** | 5 Scoops | All 32 with the user's own weights, robustness test, sensitivity, scenarios, preset backtest | Gold + platinum |

Naming was chosen for global legibility — Basic/Full/Custom are loanwords in Korean, Japanese and Spanish. **Always render the descriptor line next to the name** ("5 indicators" / "all 32" / "all 32 + your weights") so the tier is understood without knowing the word.

**The free tier must visibly lack things.** This is the core monetisation mechanic and it is deliberate:
- List the **names** of the 27 uncounted indicators in grey chips (`#78819a`, readable — not disabled-grey).
- Show Weekly and Monthly rows **present but marked "locked"**, occupying space. Do not hide them.
- State the size of the unknown: *"The missing 27 can move this by ±14 points."*
- Round the Basic target (`≈ 170`); give Full two decimals (`170.70`); give Custom an interval (`181.2`, band `176.8–185.6`). **Decimal precision is itself a tier signal.**

### Scoops (the currency)

| Rule | Value |
|---|---|
| Starting grant | 5 (given during onboarding) |
| Wallet cap | 20 |
| Daily check-in | +1 |
| 7-day streak chest | +5 |
| Quick ad (15 s, no skip) | +1 |
| Full ad (30 s, skip after 5 s) | +3 |
| Daily ad cap | 8 views |
| Re-watch cooldown | 2 minutes |
| Add a ticker slot | −1 |
| Watchlist signal scan | −2 |
| Full analysis | −3 |
| Custom analysis | −5 |
| Re-run a saved preset | −3 |

Design rules that make the loop work:
- **Balance is always visible** — a pill in the top-right of every screen. When the balance is 0 the pill's border turns gold.
- **Show the debit before it happens** — the tier chooser prints `5 → 2` next to the cost.
- **Never a blanket time-based unlock.** One run = one debit. Results are kept **forever** in history; the user pays again only to re-run after the next close. Price movement supplies the reason to return.
- **Do not charge for a non-answer.** When the engine declines to call it (see below), no Scoops are debited and the screen says so.
- Re-scoring a saved analysis after an engine update is **free**.

⚠️ **Server-side ledger is mandatory.** See `SPEC-economy.md` — a client-held balance will be edited within a week of launch, and AdMob requires server-side verification to grant rewards safely.

### Honesty positioning (a product feature, not fine print)

The engine's real backtest is humbling in places, and the design turns that into the brand:
- Headline the error rate, not just the hit rate: **"We are wrong about 4 times out of 10."**
- Publish the **miss log** as a default tab, with post-mortems.
- **Decline to answer** when indicators split ~evenly, timeframes conflict and volatility is above its 90th percentile — showing why, and charging nothing.
- Under every verdict, a two-colour bar: 58.1% right / 41.9% wrong, with the line *"Size your position for that, not for the 68%."*

Tone calibration: honest, never self-flagellating. The baseline comparison is framed as a **design choice** ("markets drift upward, so guessing 'up' scores 60.8% on a coin-count and still cannot tell you how much, how sure, or within what range"), not a confession.

### Method positioning

Pure technical analysis: **price, volume, time — nothing else.** Deliberately excluded, with the reason shown: news sentiment (lags the move), analyst targets (untestable), fundamentals (quarterly data against daily decisions), social buzz (noise).

Two consequences to build:
1. **Works on any market with a chart** — the backtest spans US and Korean equities, FX, crypto and gold. A never-seen ticker is analysable the moment its chart loads.
2. **Every number traces back to the chart.** Tapping any figure opens a derivation: the indicator, the bar, the date, the raw reading, the bias, the weight, the contribution. A model blending news and filings cannot do this — make the auditability visible. See `#10b`.

---

## Data provenance

Real, from `map/forge-backtest-report.json` (generated 2026-07). Use these values; do not invent others.

```
overall.directionHitRate   0.5806   → 58.1 %
overall.baselineAlwaysUp   0.6078   → 60.8 %   (naive "always up")
overall.calibrationECE     0.00126  → 0.13 %
overall.coneCoverage       0.7774   → 77.7 %   (target 80)
overall.priceMAE           0.1741   → 17.4 %
pnl.winRate 0.5952 · avgWin +18.97 % · avgLoss −10.71 %
pnl.beatBuyHold 40 of 86 · avgMDD −48.1 % · worstMDD −92.3 %

byRegime  bull 59.99 % (n 25,615, lift −3.3 pt)
          side 53.83 % (n 2,057,  lift +0.1 pt)   ← only positive lift
          bear 47.36 % (n 3,824,  lift −0.7 pt)   ← below a coin flip

byTimeframe  1day  54.59 % (n 18,691, cone 77.9 %)
             1week 62.83 % (n 11,082, cone 77.9 %)
             1month 64.52 % (n 1,723,  cone 74.4 %)

Total scored forecasts 31,496 · 86 series · 1969-12-29 → 2026-07
Series by class: US equities 56 · crypto 10 · KR equities 10 · FX 9 · gold 1
(a "series" = one symbol on one interval)
```

Tier-level accuracy is **derived, not separately measured**: Basic is shown as the daily figure (54.6 %) because Basic reads daily bars only; Full as the blended 58.1 %. Custom deliberately quotes **no global number** — it shows the user's own preset back-tested on the ticker in front of them. Keep that distinction; it is both honest and better product.

Also verifiable from the repo: 32 indicators across 4 tiers (up from 20), `forge-core.test.js` carries **251 cases**, and the quote source moved from Stooq to Yahoo Finance (with Naver fallback for Korean tickers) on **2026-08-06** after Stooq began blocking automated reads.

**Placeholders** (replace with real values before shipping): all per-ticker figures (NVDA 162.20 etc.), the miss-log entries, the live track record (does not exist until launch — the screen is authored as an empty "starts at launch" state), and the release-timeline copy.

---

## Screens

Canonical flow, in order. Bracketed ids point at the mock on the design board.

### 1. Onboarding — 5 steps `#3a` `#3b`

Not a welcome carousel. Each step removes a real first-run obstacle.

1. **Cold open** — no logo splash. A real chart draws its forecast cone. Headline *"Where does this chart go next?"* Language chip (globe + `EN`) top-right. Progress: 5 hairline segments, active one gold.
2. **How it works** — a 32-bar "signal comb" (SVG, one bar per indicator, up/flat/down from a centre line) collapsing into one verdict bar. Shows the mechanism rather than icons.
3. **Why it's free + the grant** — the ad economy is explained *before* any ad appears, and 5 Scoops are granted here. Earn and spend tables. This is where the loop is taught.
4. **Pick your first tickers** — 3 pre-selected, slots 1–3 free. Kills the empty-watchlist drop-off.
5. **Consent + risk notice** — UMP-style personalised-ads toggle (on), crash reports (off), and a readable risk notice with a terms checkbox. Ends with *"Your first deep analysis is free."*

Language sheet `#12a`: auto-presents once if the device locale is not English, written **in the user's language**, explaining that chart terminology is standard in English. Unavailable languages are tappable for a launch notification, not dead ends.

### 2. Watchlist `#1a` — ⚠ needs a redraw in the turn-2 type system

Rows: signal dot (bull/neutral/bear) · symbol + company · 64×20 sparkline · price + change · confidence badge. Sticky search, group chips, `＋ Add ticker` at the bottom. Row height 64px.

**Open work:** `#1a` was drawn in the first, pre-refinement pass. Re-render it with the tokens above (hairline dividers instead of card borders, tabular numerals, the corrected greys) before implementing.

### 3. Ticker report — Basic `#6a` `#2a`

Vertical scroll, one ticker per report.

- Header: back · symbol + position in watchlist (`2 / 8`) · Scoops pill.
- Tier chip (steel `BASIC`) + evidence meter (1 of 3 segments).
- Verdict + confidence, then the honest range (`55–67%`) and the size of what's missing.
- **Chart with real axes** — right-hand price scale with a gold current-price tag, bottom date scale, dashed forecast-start line, cone fill at 9% gold. Candle bodies/wicks in bull/bear. SVG viewBox `0 -108 726 406`; **axis type must render ≥10.5 px** (font-size 21 at that viewBox on a 372 px-wide chart).
- "Counted" — the 5 core readings.
- "Not counted" — 27 grey chips, readable.
- Timeframe rows with Weekly/Monthly marked `locked`.

### 4. Tier chooser `#7a`

A bottom sheet. Each tier shows its **measured** hit rate as a bar against a 50% coin-flip marker, the cost, and the balance preview (`5 → 2`). Bar scale: `width% = (rate − 40) / 30 × 100`.

Full is the recommended option (gold border + `POPULAR`). Custom shows no global rate — instead the promise of a personal backtest. Footer links to *How we measure*.

### 5. Ad gate `#7a` `#2b` `#2c`

Triggered when the balance is short. **The pitch is the accuracy gap, not a feature list**: *"Basic only reads daily bars — our weakest timeframe"*, with a four-bar chart (daily 54.6 / weekly 62.8 / monthly 64.5 / Full 58.1).

Two offers: Quick 15 s (+1) and Full 30 s (+3). Reward screen afterwards: progress ring, `+3 Scoops`, wallet count-up (`3 → 6`), streak progress, and an immediate CTA back into the run. Footer states the cooldown and remaining daily views.

### 6. Result — Full `#6a` `#8b`

Gold tier chip, evidence 2 of 3. Verdict with a `+7 vs Core` delta and the previous value marked on the confidence track. Then:
- **Track record of this setup** — occurrences, hit rate, median move.
- **Timeframe agreement** — D/W/M chips.
- **Reasoning** — per-node, plain language.
- **Against this call** — dissenting indicators, in a bear-tinted card. Never hidden.
- **Right/wrong bar** — 58.1 / 41.9 with the sizing line.
- **What would change this call** — trigger levels and unmodelled events (earnings).

### 7. Custom `#5a` `#4b` `#6b`

**Preset-first.** Three presets (Trend-following / Balanced / Reversal), each with a 3-year hit rate. One tap is the whole interaction for most users. The 32 weight sliders live behind *"Adjust the 32 weights myself"*. A live preview shows the composite moving as weights change (68 → 71) — this is what justifies the 5-Scoop cost in front of the user.

Result adds: robustness (`87%` of ±20% perturbations keep the call), a tornado sensitivity chart, break points, three scenarios with invalidation levels, and an equity curve comparing the user's preset · engine default · buy-and-hold. Saved as a reusable preset (re-run 3).

### 8. Evidence & trust `#10b` `#7b` `#8a` `#9a`

- **Where this came from** — tap a number, get the chart region highlighted plus the full derivation chain (reading → crossover date → strength change → bias → × weight → contribution).
- **How we measure** — sample, the "why we don't chase the headline number" note, strengths (ECE, coverage, payoff), and the sizing warnings.
- **Where it works** — regime and interval breakdowns with the always-up baseline marked.
- **Being honest about this** — the 10-block right/wrong strip, what the tool is not, what breaks a forecast.
- **Closed forecasts** — Misses is the **default tab**.
- **The engine** — growth timeline (20 → 32 indicators, 251 engine tests, data-source rebuild), plus an "engine improved while you were away" moment where saved analyses are re-scored free.

### 9. No-call state `#8b`

When conviction is too low, refuse: *"No clear read on this one."* Show why (indicator split, timeframe conflict, volatility percentile, earnings proximity), confirm **no Scoops charged**, and offer an alert for when it clarifies plus an escape hatch ("Show the split anyway").

### 10. Wallet, account, settings `#2c` `#5b` `#12a`

Balance with cap progress · earn rows · spend table · streak dots · Google sign-in (prompted only when the balance first exceeds 5 — loss aversion, not a first-run wall) · sync state · saved presets · history · ad settings · language (with **"Keep indicator names in English"** on by default) · regional number/date/market-time formats.

Legal line required by store policy: *"Scoops have no cash value and cannot be transferred or refunded."*

---

## Interactions & behaviour

- **Chart:** pinch-zoom, one-finger pan, long-press crosshair with price/date readout. Auto-scale (`A`) and log (`L`) toggles float top-right of the plot. Double-tap resets. The chart must not swallow page scroll — reserve a scroll gutter or a lock toggle (the PC app hit exactly this problem; see `#chartLockBtn` in `forge.html`).
- **Report navigation:** sticky section chips under the header on dense layouts (`#1a`), or collapsed accordions on the airier ones (`#1b`).
- **Ticker switching:** horizontal swipe moves between watchlist tickers on the report screen. Scroll position is remembered per ticker.
- **Rewarded ad:** disable the CTA and show a spinner while the ad loads; on dismissal-without-completion, no grant and no error blame; on completion, the reward screen with a count-up animation (~600 ms).
- **Analysis run:** the engine is synchronous and heavy — run it in a Web Worker or chunk it, and show per-indicator progress (the PC app's "simulation" mode already narrates this and is good source material).
- **Loading:** skeleton rows matching final row heights. Never a full-screen spinner over an already-rendered report.
- **Errors:** quote fetch failure → keep the last cached read, badge it "as of <time>", offer retry. Never blank the screen.
- **Offline:** the shell and cached analyses must open. Ads and fresh quotes degrade gracefully.

## State

```
session   locale, deviceId, googleAccount | null, syncState
wallet    balance, cap, streakDays, lastCheckIn, adsWatchedToday, cooldownUntil
watchlist [{ symbol, market, slotPaid, lastVerdict, sparkline }]
report    symbol, interval, tier, verdict{dir,confidence,band},
          targets[], indicators[32]{value,bias,weight,contribution,narrative},
          matrix{daily,weekly,monthly}, cone, evidenceLevel, runAt, engineVersion
custom    presetId, weights{32}, livePreview, robustness, sensitivity[], scenarios[]
history   [{ runId, symbol, tier, runAt, verdict, expiry, outcome|null }]
prefs     locale, keepIndicatorNamesEnglish, personalisedAds, analytics,
          numberFormat, dateFormat, marketTimeZone
```

All wallet fields are **server-authoritative**; the client holds a cached copy for display only.

---

## Files in this bundle

| File | What it is |
|---|---|
| `MoneyScoop Mobile.dc.html` | The design board — ~50 mockups across 12 turns. Open in a browser. |
| `android-frame.jsx` | Device bezel used by the board. Required for it to render. |
| `support.js` | Runtime for the board. Required. |
| `SPEC-economy.md` | Scoops ledger, AdMob server-side verification, anti-abuse. **Read before writing any wallet code.** |
| `BUILD-plan.md` | Phased build order, testing setup, and the three gotchas that will otherwise bite. |

Ask for screenshots if you would rather not open the board.
