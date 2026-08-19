repo: yotachy/vdiportal
branch: main
path: map/mobile

## Last sync
date: 2026-08-16T08:55:00Z

### Updated in this project
- Built the three screens the deck had been **promising but never drawing** (turn 20): the full 32-indicator readings list, the personal prediction record with a **"missed 4" filter beside the default tab**, and the notification permission ask. Each readings row is fixed at three lines — name + contribution, plain sentence, **actual numbers** — because without the figures it is an unverifiable claim. The two no-direction indicators stay in the list with their specific reason.
- Prediction record withholds a hit rate under 20 samples and shows a 14/20 progress bar as the reason; the miss list closes with "3 of 4 were within 1" so four misses are not read as four equal failures.
- Notification permission is asked **only right after the first Deep analysis**, with the value just received shown above the ask, and the list of what will *not* be sent (ads, events, recommendations) — on Android a decline is permanent, so the moment matters more than the wording.
- Last two gaps closed (turn 21): stale-result re-open (past verdict dimmed + "어제 값" tag + "one more bar since" staleness banner; re-reading is free, recomputing costs 3), and **app icon + splash generated as 21 real PNGs** under `assets/icon/` and `assets/splash/`, mirroring `android/app/src/main/res/`. The generator-default **#FFFFFF** background is gone — adaptive background is now `#0a0d12`. At 48px the mark drops its 42% fill for a solid disc; that is the one deliberate divergence from the in-app mark.

### Previous sync
date: 2026-08-16T08:20:00Z

### Updated in this project
- **Tier gap widened on two axes (turn 18): chart layers and information volume.** Same chart engine, layers toggled per tier — Basic gets a close-price line and a dashed forecast with no range; Deep/Pro get candles, 1st/2nd/3rd forecast lines, the 80% cone, support/resistance and divergence marks, and RSI/MACD/volume subpanels. Block counts 3 / 8 / 9, and the frame heights themselves ladder (844 with visible slack / 864 exactly full / 1028).
- Rule held: Basic is not crippled. A single line still answers direction and range correctly — it just says nothing beyond that. Useless kills the first impression; sufficient removes the reason to pay.
- Pro is strictly Deep **plus** the weight panel — never Deep minus anything. Weight changes must visibly alter the shared blocks (dissent 6 → 9, timeframe agreement 3-of-3) or the adjustment reads as fake.
- **Staged reveal spec (turn 19), bound to real engine events, not timers.** Six stages: OHLC/candles → 30× `analyzeX` (comb fills left-to-right, readings stream, running tally) → `evalBlocks` collapse into the verdict → drift/forecast path → dissent → hit-history lookup. Tap skips to the finished state; a fast cache hit renders fast (never padded); a failed stage leaves a visible "could not load" slot rather than silently vanishing.
- Result layout reordered by value: **plain-language sentence first**, then two numbers, chart, dissent framed as "이건 알고 계세요", timeframes, hit rate, full readings. The sentence is rule-composed from direction/overheat/resistance — a template, not generated prose.

### Previous sync
date: 2026-08-16T07:40:00Z

### Updated in this project
- **Canonical screen order established (turn 17).** Laying the flow out revealed that turn 15's "first Deep analysis free" and turn 16's "try all three modes" do the same job twice — a first-run user would see Deep analysis twice. The tutorial is the better version, so onboarding was absorbed into it. Three steps dropped: the mechanics demo (the tutorial does it with real data), the price table (moved to tutorial completion), and picking three tickers (now one, for the tutorial).
- First run is 7 steps: cold open · risk profile · risk disclosure → ticker + Basic · Deep · Pro (all free) → completion with price table + 10 Scoops. The back half is all reward; only the first three steps are setup.
- Daily loop now starts with the reason to open: notification → watchlist (result card on top, then scan's flipped tickers) → result detail → today's read → unlock. Step 5 creates step 1 — every Deep analysis schedules tomorrow's result.
- Ad entry points 3 → 6, all placed where the user already wants something: added **after confirming a correct result** (never after a miss), **after scan finds flips** (the user computes their own shortfall), and **before a check-in streak breaks**. Cap: max 2 prompts per session, and a decline silences them for that session.
- Yesterday-vs-actual comparison rebuilt as a sentence plus two dots (predicted / actual) instead of ticks, ranges and widths at once; width and probability demoted to one supporting line.

### Previous sync
date: 2026-08-16T07:05:00Z

### Updated in this project
- **The chart is pre-existing dev work and is out of design scope.** The user confirmed it is already built. The board's chart areas are labelled "차트 (기존 구현) · draw-layers.js" rather than asserting new dimensions — the only design input is the height ratio (38% of viewport on the short landscape screens). Related shipped modules named in `strings.js`: `draw-layers.js`, `draw-panels.js`, `chart-legend.js`, `readings.js`.
- Korean copy pass: the miss readout is **"0.4만큼 벗어났습니다"** (headline) / **"0.4 벗어남"** (badge) — replacing the ungrammatical "0.4 밖" the user flagged. Its pair became **"범위 적중"** (was "범위 안"): 적중/벗어남 states a result, 안/밖 only states a position.
- Korean/English rule confirmed and applied: UI is Korean-only, **indicator names stay English** per `strings.js`, code keys and filenames are set in monospace to read as code. Turns 1–5 remain in the earlier English-first form as history.

### Previous sync
date: 2026-08-16T06:45:00Z

### Updated in this project
- Closed four user-flow gaps found by self-critique (turns 14–15). The largest: the app sold tomorrow's forecast and **never showed the outcome** — no return reason, no personal trust evidence, no natural ad moment. Added the outcome loop (D+1 result card above the watchlist, per-forecast detail screen).
- Surfaced the honest consequence of that loop: a narrower range is a smaller target, so Deep can miss on a day when Basic hits. Rules adopted — always draw both ranges, always print the miss distance ("0.4만큼 벗어났습니다"), and **never show a percentage under 20 samples** (3 results is not a hit rate).
- Onboarding reordered so the **first Deep analysis runs inside onboarding, free and automatic**, with the price table and the 10-Scoop grant landing *after* it, inside that report. This is what the shipped `obFree` string already promised. Risk disclosure stays before the analysis.
- Deep→Pro bridge now starts from a concrete complaint rather than an abstract slider: on a miss, "4 of the 6 dissenting indicators were right — reweight them?"
- Scan now reports **direction flips** instead of only refreshing read state, while staying free and Basic-only (what changed, not why).

### Previous sync
date: 2026-08-16T06:20:00Z

### Updated in this project
- Read `www/strings.js` — the declared **UI 문자열 단일 출처**, already English-only and comment-annotated. My invented English vocabulary was replaced with the shipped keys: `rpHorizon`/`rpHzTomorrow`, `rpNotCounted` ("Not checked at this level"), `adWaiting` ("Crediting your Scoops…"), and the `IND` map for indicator names.
- **Found a real conflict already in the codebase**, not introduced by me: the same tier is `tsFull`/`rpTierFull` = "Full" in the sheet and report, but `walDeep`/`obCostFull` = "Deep analysis" in wallet and onboarding. Recommend consolidating on **Deep**.
- Reverted my own error: indicator names had been translated to Korean, against the file's explicit rule that names stay English regardless of interface language (setting "Keep indicator names in English", default ON). The toggle is now surfaced in the Pro editor.
- Corrected a false attribution I had reintroduced: the 58% hit rate is an **engine-wide backtest measurement (19-indicator harness)** — not this ticker and not this indicator set. `strings.js` documents this as a previously-fixed bug (`rpHitScopeC` / `rpHitScopeShort`).
- Split the failure state into confirmed-refund and **unconfirmed-refund**, matching `tsFailed` / `tsFailedNoRefund` — the app cannot always know a refund happened.
- Open decision recorded on the board: `rpBullish`/`rpBearish` = "Bullish"/"Bearish" vs the Korean "상승 우세". Changing it touches five places (`cxBullDiv`, `cxBearDiv`, `cxBullVolDiv`, `cxBearVolDiv`, `readings.js`) or it reintroduces the label drift the file exists to prevent.

### Previous sync
date: 2026-08-16T06:12:00Z

### Updated in this project
- English layer designed (turn 13). Tier names in EN are **Basic / Deep / Pro** — the repo's existing `Full` is retired, since a three-tier ladder can't have anything above "Full". Currency stays **Scoops** (untranslated brand term). Verdict is **Upward bias**, never "Bullish" (reads as a buy recommendation; `bias` also matches the engine's own term).
- English runs ~1.4× longer than Korean. Two places broke their budget and were changed structurally, not reworded: the 44px verdict drops to **36px in EN only** (card height fixed so scroll position matches across languages), and the ad CTA became **"Unlock with one ad" + 30s badge**.
- Language toggle lives in 지갑 › 설정, labelled **"언어 · Language"** in both scripts so a mis-toggled user can find their way back. First run follows device language.
- Open dev risk recorded on the board: server-returned strings (dissent reasons, failure causes, indicator names) must be translated too, or the most expensive screens end up half-Korean.

### Previous sync
date: 2026-08-16T05:31:39Z

### Updated in this project
- Read `map/CLAUDE.md` (`IND_TIERS`) and `map/README.md` at last — the indicator taxonomy is no longer an assumption. Four tiers: **Lv1 핵심 5** (ma·macd·rsi·bollinger·volume) / **Lv2 주요 8** (trend·adx·stochastic·fib·ichimoku·pivot·psar·gann) / **Lv3 보조·전문 11** / **Lv4 고급·심화 8** = 32 in `IND_TIERS`; README's weight rail shows **30** (drops gann and pattern).
- Key design consequence: **기본분석's 5 tools == Lv1 핵심 5 exactly.** The three-tier product split is the engine's own tier structure, not an invented one — unlocking = opening Lv2→Lv4.
- Corrected an earlier wrong claim of mine: trend/phasefold are NOT the two excluded from the 30-rail (both appear in README's 30). The two dropped are **gann** and **pattern**.
- **Weight input is a 0.1–3.0 continuous slider, matching the PC build** — not quantized to 3 steps. Mobile rows are two-line (name+value / slider) because a single-line track is too short for 0.1 granularity; the 1.0 default is a fixed tick on every track and the numeric value is always printed.
- Still assumption: the four 투자성향 preset weight vectors. The values drawn in turns 9c/10a (2.0, 1.4, 0.6, 0.3 …) are illustrative and marked as such on the board.

### Previous sync
date: 2026-08-16T00:00:00Z

### Updated in this project
- Received real device measurements from the user: Fold 7 closed **411×770**, Fold 7 open **732×593**, Tab S10+ **1382×640**. Two of my assumptions were wrong — the cover screen is NOT narrow (411 is standard phone width, and 770 is *taller* than the unfolded screen), and the unfolded screen is a short landscape surface, not a "big" one.
- Breakpoints revised off real numbers: 2-column at **680** (not 720 — the fold's 732 left only 12px of headroom), 3-column at **1200** (tab 1382, 182px headroom).
- Height, not width, is the binding constraint: chart fixed 520px → **38% of viewport height**; buttons 60 → 52; bottom tab bar → **68px left rail** on both large screens.
- The attached design-system project is still empty; the repo's `www/style.css` `:root` remains the token source of truth.

### Previous sync
date: 2026-08-15T16:04:06Z

### Updated in this project
- Read `www/style.css` past `:root` at last and reconciled the board's before→after columns against real values. Three of my earlier claims were wrong: the wallet cap gauge **already exists** (`.wal-gauge-on/off`), `.wl-badge` is **10px/700 radius 4** (not 12px), and `.btn` is already **radius 11 / min-height 44** — so "lowering radius to 10" was a 1px non-change.
- Confirmed the type diagnosis from the real file: **eight sizes inside a 4px band** (11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 15) with a lone `.rp-verdict` 29px above them. That, not colour, is why hierarchy collapsed.
- Confirmed against source: `.rp-verdict` 29/700/−.025em · `.overline` 10.5/.14em/600 · `.rp-sec-title` 12/700/.02em · `.wl-row` height 64 · `.rp-chart` background `--bg-raised #0b0e15`. `box-shadow` is used only for selection rings and the wallet dot's inset — no elevation shadows.
- Moved the mark's `<clipPath>` defs out of turn 3 to the document root; 12 mark instances in turns 4–5 referenced them and would have degraded to solid circles if that turn were restructured.

### Previous sync
date: 2026-08-15T15:52:07Z

### Updated in this project
- Listed `android/app/src/main/res/` at last: the launcher icon is **still the Capacitor generator template** (`drawable-v24/ic_launcher_foreground.xml` is the stock vector; `ic_launcher_background` is `#FFFFFF`) and all 13 `splash.png` files are generator defaults. There is no designed logo to replace — the proposed scoop mark fills an empty slot rather than overriding brand work.
- `watchlist.js:132` + `style.css:38`: the existing header glyph is `.wl-brand-mark` — a 22px container coloured `var(--gold)`, nothing more.
- Copied `mipmap-xxxhdpi/ic_launcher_foreground.png` and `drawable/splash.png` into the project as the 현재 reference.
- Flagged a token collision: the new UI action colour `#b892f5` is `--pred2`, reserved for the chart's 2nd forecast line. Two resolutions offered in the board — move actions to `--platinum #b9c4dc`, or keep violet for UI and assign the 2nd forecast line a new hex.

### Previous sync
date: 2026-08-15T15:39:00Z

### Updated in this project
- Read `www/indicators.js` and grounded the Custom editor's tool list in the real `SHAPES` table: **32 tools, 30 of which return a direction**. `trend` and `phasefold` are in `NO_BIAS` (no `bias` returned) — they must not be checkboxes in the weight editor.
- Corrected invented tool names to the engine's own: `MA` (not "MA cross"), `Ichimoku` (not "Ichimoku base"), `Stochastic` (no params suffix).
- Read `www/tier-sheet.js`: the shipped sheet is Basic (off/done) · Full (POPULAR, `MSWallet.COSTS.full`) · Custom (off/`Soon`), with the wallet pill in the sheet head and a display-only balance preview (`12 → 9`). Added that preview to the redesign — it was missing.
- Raised dim text off `--neutral #4a5368` (2.53:1) onto the real text ramp `--ink-4 #7c8598` / `--ink-5 #78819a`.
- Read the shipped mobile app's real token palette from `www/style.css` `:root` (dark-only: bg #0a0d12 / ink #eef1f7 / gold #e8b463 / bull #4fb98a / bear #d96a6a / steel #8892a6 / platinum #b9c4dc / pred2 #b892f5, hairline borders at 6–16% alpha). Colors are the only tokens — no spacing/radius/type tokens exist.
- Carried over the two project-wide rules: no left accent rails on rows, and all numerals `tabular-nums`.
- Read `docs/design-audit.md`: the Scoops economy, 5-step onboarding, tier chooser, ad gate, wallet and honesty devices are all unbuilt — 5 screens hang off the economy alone.
- Read `docs/design_handoff/SPEC-economy.md`: server ledger, AdMob SSV grant (never on dismiss), cap 20, daily cap 8, 2-min cooldown, no charge for a non-answer.

## Screen map
| Screen | Built from |
|---|---|
| Design tokens / palette | map/mobile/www/style.css `:root` |
| Screen inventory + copy | uploads/DESIGN-BRIEF.md; map/mobile/www/strings.js |
| Onboarding (5 steps) | map/mobile/www/screens/onboarding.js; design-audit.md §2.2 |
| Watchlist | map/mobile/www/screens/watchlist.js; design-audit.md §2.5 |
| Report (Basic / Full) | map/mobile/www/screens/report.js; design-audit.md §2.3–2.6 |
| Tier chooser sheet | map/mobile/www/tier-sheet.js |
| Wallet / earn / spend | map/mobile/www/screens/wallet.js; SPEC-economy.md |
| Ad reward rules | SPEC-economy.md §2–3 |

## Still unread — needed next
- The four 투자성향 preset weight vectors (which indicators each profile up- or down-weights). `IND_TIERS` itself is now resolved — see Last sync.
- `map/mobile/www/style.css` beyond `:root`: real `.rp-verdict` / `.overline` / `.rp-sec-title` / `.rp-tier` values behind the audit's summary.

## Not yet read
- `map/mobile/docs/design_handoff/MoneyScoop Mobile.dc.html` (344 KB) — the previous 24-board mockup set. The user is starting fresh and independent of it, so it is deliberately unread.
- `map/mobile/www/strings.js` — full copy source; the brief already quotes the strings needed for flow work.
